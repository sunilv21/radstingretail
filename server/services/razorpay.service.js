/**
 * Razorpay Payment Links wrapper.
 *
 * Docs: https://razorpay.com/docs/api/payment-links/
 *
 * We use Payment Links instead of Orders + Checkout SDK because the
 * former is a pure server-to-server API (POST → short_url, redirect
 * the tenant, callback when paid). No frontend SDK or popup integration
 * needed.
 *
 * Operations:
 *
 *   1. createPaymentLink({ payment, customer, redirectUrl })
 *        → POST /v1/payment_links
 *          Authorization: Basic base64(keyId:keySecret)
 *        ← { id, short_url }
 *
 *   2. verifyCallbackSignature(query, secret)
 *        Razorpay's callback ?razorpay_signature= is HMAC-SHA256 of
 *        `payment_link_id|payment_link_reference_id|payment_link_status|razorpay_payment_id`
 *        signed with the API key secret.
 *
 *   3. verifyWebhookSignature(rawBody, header, webhookSecret)
 *        Webhook X-Razorpay-Signature is HMAC-SHA256(rawBody, webhookSecret).
 *
 * Currency is INR; amounts go in PAISE (rupees × 100).
 *
 * Secrets (`keySecret`, `webhookSecret`) live in
 * PlatformSettings.paymentGateway.razorpay; the admin route masks them
 * on read. This service is server-only and never returns the cleartext
 * to any client.
 */
import crypto from 'node:crypto';
import { AppError } from '../utils/response.js';
import PlatformSettings from '../models/PlatformSettings.js';

const HOST = 'https://api.razorpay.com';

async function resolveConfig() {
  const settings = await PlatformSettings.findOne({}).lean();
  const rz = settings?.paymentGateway?.razorpay || {};
  if (!rz.keyId || !rz.keySecret) {
    throw new AppError(
      'GATEWAY_NOT_CONFIGURED',
      'Razorpay credentials are not set up yet. Ask your software vendor to configure the gateway in the admin portal.',
      503,
    );
  }
  return {
    keyId: rz.keyId,
    keySecret: rz.keySecret,
    webhookSecret: rz.webhookSecret || '',
    mode: rz.mode || 'test',
  };
}

function basicAuth(keyId, keySecret) {
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`, 'utf8').toString('base64');
}

/**
 * Create a one-shot Payment Link. Razorpay validates / sends the email
 * + SMS itself if `notify` is set (we leave it off — our tenant
 * already has the URL).
 *
 * Inputs:
 *   amount       — paise, integer
 *   currency     — defaults to INR
 *   reference    — our PlatformPayment.reference (becomes reference_id)
 *   description  — short label, shown on the Razorpay hosted page
 *   redirectUrl  — where Razorpay sends the user after payment
 *   customer     — { name, email, contact }
 */
export async function createPaymentLink({
  amount,
  currency = 'INR',
  reference,
  description,
  redirectUrl,
  customer,
}) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('VALIDATION_ERROR', 'amount (paise) must be a positive integer', 400);
  }
  if (!reference) {
    throw new AppError('VALIDATION_ERROR', 'reference is required', 400);
  }
  const cfg = await resolveConfig();
  // Razorpay caps reference_id at 40 chars. Our `PAY-XXXXXXXX` fits.
  const referenceId = String(reference).slice(0, 40);

  const body = {
    amount: Math.floor(amount),
    currency,
    accept_partial: false,
    reference_id: referenceId,
    description: String(description || `Renewal ${referenceId}`).slice(0, 2048),
    customer: customer
      ? {
          name: customer.name ? String(customer.name).slice(0, 50) : undefined,
          email: customer.email ? String(customer.email).slice(0, 80) : undefined,
          contact: customer.contact ? String(customer.contact).slice(0, 16) : undefined,
        }
      : undefined,
    notify: { sms: false, email: false },
    callback_url: redirectUrl,
    callback_method: 'get',
  };

  const res = await fetch(`${HOST}/v1/payment_links`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: basicAuth(cfg.keyId, cfg.keySecret),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.short_url) {
    throw new AppError(
      'RAZORPAY_LINK_FAILED',
      json?.error?.description || `Razorpay rejected the payment-link request (HTTP ${res.status})`,
      res.status >= 400 && res.status < 600 ? res.status : 502,
      { razorpay: json?.error || json },
    );
  }

  return {
    id: json.id,
    shortUrl: json.short_url,
    raw: json,
    mode: cfg.mode,
  };
}

/**
 * Look up the current state of a Payment Link. Used by the redirect-back
 * handler so we don't trust the query-string flag from the tenant's
 * browser.
 */
export async function fetchPaymentLink(linkId) {
  const cfg = await resolveConfig();
  const res = await fetch(`${HOST}/v1/payment_links/${encodeURIComponent(linkId)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: basicAuth(cfg.keyId, cfg.keySecret),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(
      'RAZORPAY_FETCH_FAILED',
      json?.error?.description || `Razorpay status check failed (HTTP ${res.status})`,
      502,
      { razorpay: json?.error || json },
    );
  }
  // status: created | partially_paid | expired | cancelled | paid
  const state =
    json.status === 'paid'
      ? 'completed'
      : json.status === 'cancelled' || json.status === 'expired'
        ? 'rejected'
        : 'pending';
  return {
    state,
    razorpayStatus: json.status,
    paymentId: json.payments?.[0]?.payment_id || null,
    amountPaid: json.amount_paid,
    raw: json,
  };
}

/**
 * Verify the signature on Razorpay's callback redirect.
 *
 * Razorpay appends ?razorpay_payment_id=...&razorpay_payment_link_id=...
 * &razorpay_payment_link_reference_id=...&razorpay_payment_link_status=...
 * &razorpay_signature=... after a successful payment.
 *
 * Signature = HMAC-SHA256(
 *   `${payment_link_id}|${payment_link_reference_id}|${payment_link_status}|${razorpay_payment_id}`,
 *   keySecret,
 * )
 */
export async function verifyCallbackSignature(query) {
  const cfg = await resolveConfig();
  const {
    razorpay_payment_id,
    razorpay_payment_link_id,
    razorpay_payment_link_reference_id,
    razorpay_payment_link_status,
    razorpay_signature,
  } = query || {};

  if (
    !razorpay_payment_id ||
    !razorpay_payment_link_id ||
    !razorpay_payment_link_reference_id ||
    !razorpay_payment_link_status ||
    !razorpay_signature
  ) {
    return false;
  }

  const payload =
    `${razorpay_payment_link_id}|${razorpay_payment_link_reference_id}|${razorpay_payment_link_status}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac('sha256', cfg.keySecret)
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(String(razorpay_signature)),
    );
  } catch {
    return false;
  }
}

/**
 * Verify the X-Razorpay-Signature on a webhook POST. Body is the RAW
 * request body bytes (NOT the JSON-parsed object). Caller is expected
 * to capture rawBody on the request.
 */
export async function verifyWebhookSignature(rawBody, header) {
  const cfg = await resolveConfig();
  if (!cfg.webhookSecret) {
    throw new AppError(
      'WEBHOOK_SECRET_MISSING',
      'Razorpay webhook secret is not configured',
      503,
    );
  }
  if (!header) return false;
  const expected = crypto
    .createHmac('sha256', cfg.webhookSecret)
    .update(typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody || ''))
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(header)));
  } catch {
    return false;
  }
}

export const Razorpay = {
  createPaymentLink,
  fetchPaymentLink,
  verifyCallbackSignature,
  verifyWebhookSignature,
};
export default Razorpay;
