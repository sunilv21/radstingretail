/**
 * Un-authenticated billing endpoints. Mounted under `/api/billing` BEFORE
 * the authenticated platform-payments router so PhonePe's browser
 * redirect (no JWT) and S2S webhook can land cleanly.
 *
 *   GET  /callback/phonepe/:reference   browser redirect-back
 *   POST /webhook/phonepe                S2S confirmation (TODO — scaffolded)
 *
 * Trust model: the URL `:reference` is the only client input; we
 * verify the payment's true state by hitting PhonePe's status API
 * server-to-server before applying any entitlement.
 */
import { Router } from 'express';
import PlatformPayment from '../models/PlatformPayment.js';
import Organization from '../models/Organization.js';
import { PhonePe } from '../services/phonepe.service.js';
import { Razorpay } from '../services/razorpay.service.js';
import { applyPlatformPaymentEffects } from '../utils/applyPlatformPaymentEffects.js';
import { invalidateOrgCache } from '../middleware/subscriptionGuard.js';
import { ok } from '../utils/response.js';

const router = Router();

function publicOrigin(req) {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

function dashboardUrl(req) {
  return (
    (process.env.PUBLIC_DASHBOARD_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      publicOrigin(req))
      .replace(/\/$/, '') + '/dashboard/settings?tab=billing'
  );
}

// --- PHONEPE CALLBACK: browser redirect back from the hosted page. -----
router.get('/callback/phonepe/:reference', async (req, res, next) => {
  try {
    const ref = String(req.params.reference || '');
    const payment = await PlatformPayment.findOne({ reference: ref });
    const dashboard = dashboardUrl(req);
    if (!payment) {
      return res.redirect(`${dashboard}&payment=unknown`);
    }
    // Idempotent — re-entering the URL after success / failure just
    // sends the user home with the existing status.
    if (payment.status === 'completed' || payment.status === 'rejected') {
      return res.redirect(`${dashboard}&ref=${ref}&payment=${payment.status}`);
    }

    let resultStatus = 'pending';
    try {
      const verify = await PhonePe.verifyPayment(ref);
      if (verify.state === 'completed') {
        // Apply entitlement BEFORE flipping status so a partial failure
        // leaves the row in pending (vendor can confirm manually)
        // instead of "completed without an entitlement".
        const org = await Organization.findById(payment.organizationId);
        if (!org) throw new Error(`org ${payment.organizationId} not found`);
        await applyPlatformPaymentEffects(payment, org);
        await org.save();
        invalidateOrgCache(org._id);

        payment.status = 'completed';
        payment.paidAt = new Date();
        payment.confirmedAt = new Date();
        payment.confirmedByName = 'PhonePe (auto)';
        payment.gatewayReference = verify.transactionId || payment.gatewayReference;
        payment.gatewayProvider = 'phonepe';
        await payment.save();
        resultStatus = 'completed';
      } else if (verify.state === 'rejected') {
        payment.status = 'rejected';
        payment.vendorNote = `PhonePe: ${verify.code}`;
        await payment.save();
        resultStatus = 'rejected';
      } else {
        resultStatus = 'pending';
      }
    } catch (err) {
      console.error('[phonepe] callback verify failed:', err?.message || err);
      // Soft-fail to awaiting_confirmation so the vendor can verify
      // manually from the admin Payments inbox if PhonePe's status
      // API is flaky.
      payment.status = 'awaiting_confirmation';
      payment.vendorNote = `PhonePe verify failed: ${err?.message || 'unknown'}`;
      await payment.save();
      resultStatus = 'verify_failed';
    }

    return res.redirect(`${dashboard}&ref=${ref}&payment=${resultStatus}`);
  } catch (err) {
    next(err);
  }
});

// --- PHONEPE WEBHOOK (S2S): scaffold. Confirms payment status from
//     PhonePe's signed POST. Mirrors the callback handler's
//     verify-and-apply logic but is independent of the user's browser
//     so flaky redirects (closed tab, lost wifi after pay) still
//     auto-confirm. Always responds 200 to PhonePe so they don't
//     retry forever; logs the result internally.
router.post('/webhook/phonepe', async (req, res) => {
  try {
    const base64 = req.body?.response;
    const header = req.headers['x-verify'];
    if (!base64 || !header) {
      return res.json(ok({ accepted: false, reason: 'missing_payload_or_signature' }));
    }
    const valid = await PhonePe.verifyWebhookSignature(base64, header);
    if (!valid) {
      console.warn('[phonepe webhook] signature mismatch — ignoring');
      return res.json(ok({ accepted: false, reason: 'bad_signature' }));
    }
    let decoded = {};
    try {
      decoded = JSON.parse(Buffer.from(String(base64), 'base64').toString('utf8'));
    } catch {
      return res.json(ok({ accepted: false, reason: 'bad_payload' }));
    }
    const ref = decoded?.data?.merchantTransactionId;
    const payment = ref ? await PlatformPayment.findOne({ reference: ref }) : null;
    if (!payment) {
      console.warn('[phonepe webhook] no matching payment for ref', ref);
      return res.json(ok({ accepted: true, applied: false }));
    }
    if (payment.status === 'completed' || payment.status === 'rejected') {
      return res.json(ok({ accepted: true, applied: false, alreadyFinal: true }));
    }
    const code = decoded?.code;
    if (code === 'PAYMENT_SUCCESS') {
      const org = await Organization.findById(payment.organizationId);
      if (!org) {
        return res.json(ok({ accepted: true, applied: false, reason: 'org_missing' }));
      }
      await applyPlatformPaymentEffects(payment, org);
      await org.save();
      invalidateOrgCache(org._id);

      payment.status = 'completed';
      payment.paidAt = new Date();
      payment.confirmedAt = new Date();
      payment.confirmedByName = 'PhonePe (webhook)';
      payment.gatewayReference =
        decoded?.data?.transactionId || payment.gatewayReference;
      payment.gatewayProvider = 'phonepe';
      await payment.save();
      return res.json(ok({ accepted: true, applied: true, status: 'completed' }));
    }
    if (code === 'PAYMENT_ERROR' || code === 'PAYMENT_DECLINED' || code === 'TIMED_OUT') {
      payment.status = 'rejected';
      payment.vendorNote = `PhonePe webhook: ${code}`;
      await payment.save();
      return res.json(ok({ accepted: true, applied: true, status: 'rejected' }));
    }
    // Pending — leave it open.
    return res.json(ok({ accepted: true, applied: false, status: 'pending' }));
  } catch (err) {
    console.error('[phonepe webhook] error', err);
    // Always 200 so PhonePe doesn't retry forever; the vendor sees
    // the unconfirmed row in the Payments inbox.
    return res.json(ok({ accepted: false, reason: 'internal_error' }));
  }
});

// =====================================================================
// RAZORPAY callback + webhook
// =====================================================================

// Browser redirect-back from Razorpay's hosted Payment Link page.
// Razorpay appends:
//   ?razorpay_payment_id=...
//   &razorpay_payment_link_id=...
//   &razorpay_payment_link_reference_id=<our PAY-XXX>
//   &razorpay_payment_link_status=paid
//   &razorpay_signature=...
// We HMAC-verify the signature with the API key secret BEFORE applying
// any entitlement, so a tenant can't spoof the redirect.
router.get('/callback/razorpay/:reference', async (req, res, next) => {
  try {
    const ref = String(req.params.reference || '');
    const payment = await PlatformPayment.findOne({ reference: ref });
    const dashboard = dashboardUrl(req);
    if (!payment) {
      return res.redirect(`${dashboard}&payment=unknown`);
    }
    if (payment.status === 'completed' || payment.status === 'rejected') {
      return res.redirect(`${dashboard}&ref=${ref}&payment=${payment.status}`);
    }

    let resultStatus = 'pending';
    try {
      const valid = await Razorpay.verifyCallbackSignature(req.query);
      if (!valid) {
        // Signature mismatch — leave the row pending and flag for vendor review.
        payment.status = 'awaiting_confirmation';
        payment.vendorNote = 'Razorpay callback signature failed verification';
        await payment.save();
        return res.redirect(`${dashboard}&ref=${ref}&payment=verify_failed`);
      }

      // Belt-and-braces: re-fetch the link state from Razorpay
      // server-to-server. Even with a valid signature, only "paid"
      // means done — partial / cancelled / expired all stay open.
      const linkId = String(req.query.razorpay_payment_link_id || payment.gatewayReference || '');
      const verify = linkId ? await Razorpay.fetchPaymentLink(linkId) : null;
      if (verify?.state === 'completed') {
        const org = await Organization.findById(payment.organizationId);
        if (!org) throw new Error(`org ${payment.organizationId} not found`);
        await applyPlatformPaymentEffects(payment, org);
        await org.save();
        invalidateOrgCache(org._id);

        payment.status = 'completed';
        payment.paidAt = new Date();
        payment.confirmedAt = new Date();
        payment.confirmedByName = 'Razorpay (auto)';
        payment.gatewayReference = verify.paymentId || String(req.query.razorpay_payment_id || '') || payment.gatewayReference;
        payment.gatewayProvider = 'razorpay';
        await payment.save();
        resultStatus = 'completed';
      } else if (verify?.state === 'rejected') {
        payment.status = 'rejected';
        payment.vendorNote = `Razorpay: ${verify.razorpayStatus}`;
        await payment.save();
        resultStatus = 'rejected';
      } else {
        resultStatus = 'pending';
      }
    } catch (err) {
      console.error('[razorpay] callback verify failed:', err?.message || err);
      payment.status = 'awaiting_confirmation';
      payment.vendorNote = `Razorpay verify failed: ${err?.message || 'unknown'}`;
      await payment.save();
      resultStatus = 'verify_failed';
    }

    return res.redirect(`${dashboard}&ref=${ref}&payment=${resultStatus}`);
  } catch (err) {
    next(err);
  }
});

// S2S webhook. Razorpay POSTs every event we subscribe to with an
// X-Razorpay-Signature = HMAC-SHA256(rawBody, webhookSecret) header.
// We capture rawBody on the request (see app.js verify hook) and use
// it directly — JSON.stringify(req.body) wouldn't match because key
// ordering / whitespace can differ.
//
// Subscribed events:
//   payment_link.paid   (subscription / addon completed)
//   payment_link.cancelled / expired (rejected)
router.post('/webhook/razorpay', async (req, res) => {
  try {
    const header = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody;
    if (!rawBody) {
      console.warn('[razorpay webhook] no rawBody captured — check express.json verify hook');
      return res.json(ok({ accepted: false, reason: 'no_raw_body' }));
    }
    let valid = false;
    try {
      valid = await Razorpay.verifyWebhookSignature(rawBody, header);
    } catch (err) {
      console.warn('[razorpay webhook] verify error:', err?.message);
      return res.json(ok({ accepted: false, reason: 'verify_error' }));
    }
    if (!valid) {
      console.warn('[razorpay webhook] signature mismatch — ignoring');
      return res.json(ok({ accepted: false, reason: 'bad_signature' }));
    }

    const event = req.body?.event || '';
    const link = req.body?.payload?.payment_link?.entity || {};
    const ref = link?.reference_id;
    if (!ref) {
      return res.json(ok({ accepted: true, applied: false, reason: 'no_reference' }));
    }
    const payment = await PlatformPayment.findOne({ reference: ref });
    if (!payment) {
      return res.json(ok({ accepted: true, applied: false, reason: 'no_payment' }));
    }
    if (payment.status === 'completed' || payment.status === 'rejected') {
      return res.json(ok({ accepted: true, applied: false, alreadyFinal: true }));
    }

    if (event === 'payment_link.paid') {
      const org = await Organization.findById(payment.organizationId);
      if (!org) {
        return res.json(ok({ accepted: true, applied: false, reason: 'org_missing' }));
      }
      await applyPlatformPaymentEffects(payment, org);
      await org.save();
      invalidateOrgCache(org._id);

      payment.status = 'completed';
      payment.paidAt = new Date();
      payment.confirmedAt = new Date();
      payment.confirmedByName = 'Razorpay (webhook)';
      const paymentEntity = req.body?.payload?.payment?.entity;
      payment.gatewayReference =
        paymentEntity?.id || link?.id || payment.gatewayReference;
      payment.gatewayProvider = 'razorpay';
      await payment.save();
      return res.json(ok({ accepted: true, applied: true, status: 'completed' }));
    }
    if (event === 'payment_link.cancelled' || event === 'payment_link.expired') {
      payment.status = 'rejected';
      payment.vendorNote = `Razorpay webhook: ${event}`;
      await payment.save();
      return res.json(ok({ accepted: true, applied: true, status: 'rejected' }));
    }
    return res.json(ok({ accepted: true, applied: false, status: 'ignored', event }));
  } catch (err) {
    console.error('[razorpay webhook] error', err);
    // Always 200 so Razorpay doesn't retry forever; the vendor sees
    // the unconfirmed row in the Payments inbox.
    return res.json(ok({ accepted: false, reason: 'internal_error' }));
  }
});

export default router;
