/**
 * PhonePe Standard Checkout (V1 hosted PG) wrapper.
 *
 * Docs: https://developer.phonepe.com/v1/reference/pay-api
 *
 * Two operations we use:
 *
 *   1. initiatePayment({...})
 *        → POST /pg/v1/pay
 *          base64-encoded JSON body, X-VERIFY = sha256(b64 + path + saltKey) + "###" + saltIndex
 *        ← { data.instrumentResponse.redirectInfo.url }
 *
 *   2. verifyPayment(merchantTransactionId)
 *        → GET /pg/v1/status/{merchantId}/{merchantTransactionId}
 *          X-VERIFY = sha256(path + saltKey) + "###" + saltIndex
 *        ← { code: 'PAYMENT_SUCCESS' | 'PAYMENT_PENDING' | 'PAYMENT_ERROR' | ... }
 *
 * Currency is always INR; amounts are PAISE (rupees × 100).
 *
 * Secrets (`saltKey`) live in PlatformSettings.paymentGateway.phonepe.
 * The /platform/settings GET masks them; this service is server-only
 * and never returns the cleartext to any client.
 */
import crypto from 'node:crypto';
import { AppError } from '../utils/response.js';
import PlatformSettings from '../models/PlatformSettings.js';

const PATHS = {
  pay: '/pg/v1/pay',
  status: '/pg/v1/status',
};

const HOSTS = {
  sandbox: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  production: 'https://api.phonepe.com/apis/hermes',
};

/**
 * Resolve PhonePe credentials from PlatformSettings, throwing
 * GATEWAY_NOT_CONFIGURED if any of the required pieces are missing.
 */
async function resolveConfig() {
  const settings = await PlatformSettings.findOne({}).lean();
  const pp = settings?.paymentGateway?.phonepe || {};
  if (!pp.merchantId || !pp.saltKey) {
    throw new AppError(
      'GATEWAY_NOT_CONFIGURED',
      'PhonePe credentials are not set up yet. Ask your software vendor to configure the gateway in the admin portal.',
      503,
    );
  }
  const env = pp.environment === 'production' ? 'production' : 'sandbox';
  return {
    merchantId: pp.merchantId,
    saltKey: pp.saltKey,
    saltIndex: pp.saltIndex || 1,
    environment: env,
    host: HOSTS[env],
  };
}

/** Build the X-VERIFY header used on every PhonePe call. */
function xVerify(payloadOrEmpty, path, saltKey, saltIndex) {
  const hash = crypto
    .createHash('sha256')
    .update(payloadOrEmpty + path + saltKey)
    .digest('hex');
  return `${hash}###${saltIndex}`;
}

/**
 * Begin a PhonePe checkout session. Returns the hosted-page URL the
 * tenant should be redirected to.
 *
 * Expected `input` shape:
 *   amount        — in PAISE (number, integer)
 *   reference     — our internal PlatformPayment.reference (also used as merchantTransactionId)
 *   tenantUserId  — for PhonePe analytics / refunds; we pass the tenant's _id
 *   redirectUrl   — full URL PhonePe redirects to after payment
 *   callbackUrl   — server-to-server webhook URL (optional)
 *   mobileNumber  — optional; PhonePe pre-fills the UPI / card flow with it
 */
export async function initiatePayment({
  amount,
  reference,
  tenantUserId,
  redirectUrl,
  callbackUrl,
  mobileNumber,
}) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('VALIDATION_ERROR', 'amount (paise) must be a positive integer', 400);
  }
  if (!reference) {
    throw new AppError('VALIDATION_ERROR', 'reference is required', 400);
  }
  const cfg = await resolveConfig();

  // PhonePe caps merchantTransactionId at 38 chars and accepts only
  // alphanumerics + `-` and `_`. Our `PAY-XXXXXXXX` references already
  // satisfy that.
  const txnId = String(reference).slice(0, 38);

  const payload = {
    merchantId: cfg.merchantId,
    merchantTransactionId: txnId,
    merchantUserId: String(tenantUserId || `MUID-${txnId}`).slice(0, 36),
    amount: Math.floor(amount),
    redirectUrl,
    redirectMode: 'REDIRECT',
    ...(callbackUrl ? { callbackUrl } : {}),
    ...(mobileNumber ? { mobileNumber } : {}),
    paymentInstrument: { type: 'PAY_PAGE' },
  };

  const base64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const verify = xVerify(base64, PATHS.pay, cfg.saltKey, cfg.saltIndex);

  const url = cfg.host + PATHS.pay;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-VERIFY': verify,
    },
    body: JSON.stringify({ request: base64 }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.success) {
    throw new AppError(
      'PHONEPE_INITIATE_FAILED',
      body?.message || `PhonePe rejected the payment (HTTP ${res.status})`,
      res.status >= 400 && res.status < 600 ? res.status : 502,
      { phonepe: body },
    );
  }

  const redirect = body?.data?.instrumentResponse?.redirectInfo?.url;
  if (!redirect) {
    throw new AppError(
      'PHONEPE_BAD_RESPONSE',
      'PhonePe did not return a redirect URL',
      502,
      { phonepe: body },
    );
  }

  return {
    redirectUrl: redirect,
    rawResponse: body,
    environment: cfg.environment,
    merchantId: cfg.merchantId,
  };
}

/**
 * Look up the current state of a PhonePe transaction. Called from the
 * redirect-back handler so we can flip the local payment row to
 * `completed` (or `rejected`) without trusting query-string flags from
 * the user's browser.
 */
export async function verifyPayment(reference) {
  if (!reference) {
    throw new AppError('VALIDATION_ERROR', 'reference is required', 400);
  }
  const cfg = await resolveConfig();
  const txnId = String(reference).slice(0, 38);
  const path = `${PATHS.status}/${cfg.merchantId}/${txnId}`;
  const verify = xVerify('', path, cfg.saltKey, cfg.saltIndex);

  const res = await fetch(cfg.host + path, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-VERIFY': verify,
      'X-MERCHANT-ID': cfg.merchantId,
    },
  });
  const body = await res.json().catch(() => ({}));

  // PhonePe returns success=true even for non-final states. The `code`
  // tells us the actual outcome: PAYMENT_SUCCESS / PAYMENT_PENDING /
  // PAYMENT_ERROR / PAYMENT_DECLINED / TIMED_OUT etc.
  const code = body?.code || 'UNKNOWN';
  return {
    raw: body,
    code,
    state: code === 'PAYMENT_SUCCESS'
      ? 'completed'
      : code === 'PAYMENT_PENDING'
        ? 'pending'
        : 'rejected',
    transactionId: body?.data?.transactionId || null,
    paymentInstrument: body?.data?.paymentInstrument || null,
    amountPaise: body?.data?.amount || null,
  };
}

/**
 * Verify the X-VERIFY header on PhonePe's S2S callback (webhook).
 * Used by the future webhook handler. Header format:
 *   sha256(base64Payload + saltKey) + "###" + saltIndex
 * Returns true / false; throws on missing config.
 */
export async function verifyWebhookSignature(base64Payload, header) {
  const cfg = await resolveConfig();
  if (!header) return false;
  const expected =
    crypto
      .createHash('sha256')
      .update(String(base64Payload) + cfg.saltKey)
      .digest('hex') + `###${cfg.saltIndex}`;
  // Constant-time compare to avoid timing leaks on the saltKey.
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(header)));
  } catch {
    return false;
  }
}

export const PhonePe = {
  initiatePayment,
  verifyPayment,
  verifyWebhookSignature,
};
export default PhonePe;
