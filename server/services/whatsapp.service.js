import { AppError } from '../utils/response.js';

// Normalise phone to E.164 digits without the leading '+' (Meta's required format).
// Accepts '+91 98765 43210', '919876543210', '9876543210' etc.
function normalisePhone(raw, defaultCountryCode = '91') {
  if (!raw) return null;
  let p = String(raw).trim().replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.length === 10) p = String(defaultCountryCode) + p;
  if (p.length < 10) return null;
  return p;
}

function requireConfig(store) {
  const wa = store?.whatsapp || {};
  if (!wa.enabled) {
    throw new AppError(
      'WHATSAPP_DISABLED',
      'WhatsApp integration is disabled. Turn it on in Settings → WhatsApp.',
      400,
    );
  }
  if (!wa.phoneNumberId) {
    throw new AppError('WHATSAPP_CONFIG', 'WhatsApp Phone Number ID is missing in settings', 400);
  }
  if (!wa.accessToken) {
    throw new AppError('WHATSAPP_CONFIG', 'WhatsApp access token is missing in settings', 400);
  }
  return {
    phoneNumberId: wa.phoneNumberId,
    accessToken: wa.accessToken,
    apiVersion: wa.apiVersion || 'v21.0',
    defaultCountryCode: wa.defaultCountryCode || '91',
    messageTemplate: wa.messageTemplate || '',
    templateLanguage: wa.templateLanguage || 'en',
  };
}

async function postToMeta({ apiVersion, phoneNumberId, accessToken }, payload) {
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new AppError(
      'WHATSAPP_NETWORK',
      `Could not reach WhatsApp API: ${err.message}`,
      502,
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiErr = data?.error || {};
    throw new AppError(
      'WHATSAPP_API_ERROR',
      apiErr.message || `WhatsApp API returned HTTP ${response.status}`,
      response.status >= 500 ? 502 : 400,
      {
        status: response.status,
        code: apiErr.code,
        type: apiErr.type,
        subcode: apiErr.error_subcode,
        fbtrace_id: apiErr.fbtrace_id,
        details: apiErr.error_data,
      },
    );
  }
  return {
    messageId: data?.messages?.[0]?.id || null,
    whatsappPhone: data?.contacts?.[0]?.wa_id || null,
    raw: data,
  };
}

export async function sendWhatsAppText({ store, to, message }) {
  const cfg = requireConfig(store);
  const phone = normalisePhone(to, cfg.defaultCountryCode);
  if (!phone) {
    throw new AppError('INVALID_PHONE', 'Recipient phone number is invalid', 400);
  }
  return postToMeta(cfg, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: { preview_url: true, body: String(message || '').slice(0, 4096) },
  });
}

/**
 * Send a saved template message. Useful for the first contact outside the
 * 24-hour customer-service window. Template name + language must already be
 * approved in Meta Business Manager.
 */
export async function sendWhatsAppTemplate({ store, to, templateName, language, bodyParams = [] }) {
  const cfg = requireConfig(store);
  const phone = normalisePhone(to, cfg.defaultCountryCode);
  if (!phone) {
    throw new AppError('INVALID_PHONE', 'Recipient phone number is invalid', 400);
  }
  return postToMeta(cfg, {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language || cfg.templateLanguage },
      components: bodyParams.length
        ? [
            {
              type: 'body',
              parameters: bodyParams.map((text) => ({ type: 'text', text: String(text) })),
            },
          ]
        : [],
    },
  });
}

/**
 * Live-verify the saved credentials with Meta by reading the Phone Number
 * profile. Returns the business display name, display phone, quality rating
 * and verification status — the fields a merchant actually needs to see to
 * trust the connection is live.
 */
export async function fetchPhoneProfile({ store }) {
  const cfg = requireConfig(store);
  const fields = [
    'verified_name',
    'display_phone_number',
    'quality_rating',
    'code_verification_status',
    'platform_type',
    'name_status',
  ].join(',');
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}?fields=${fields}`;

  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    });
  } catch (err) {
    throw new AppError(
      'WHATSAPP_NETWORK',
      `Could not reach WhatsApp API: ${err.message}`,
      502,
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiErr = data?.error || {};
    throw new AppError(
      'WHATSAPP_API_ERROR',
      apiErr.message || `WhatsApp API returned HTTP ${response.status}`,
      response.status >= 500 ? 502 : 400,
      {
        status: response.status,
        code: apiErr.code,
        type: apiErr.type,
        subcode: apiErr.error_subcode,
        fbtrace_id: apiErr.fbtrace_id,
        details: apiErr.error_data,
      },
    );
  }

  return {
    verifiedName: data.verified_name || null,
    displayPhoneNumber: data.display_phone_number || null,
    qualityRating: data.quality_rating || null,
    codeVerificationStatus: data.code_verification_status || null,
    platformType: data.platform_type || null,
    nameStatus: data.name_status || null,
  };
}

/** Build the plain-text body used when sending an invoice via text message. */
export function buildInvoiceMessage(sale, store, publicBillUrl) {
  const storeName = store?.name || 'our store';
  const customerName = sale?.customerSnapshot?.name || 'Customer';
  const lines = [
    `Hi ${customerName},`,
    `Thanks for your purchase at ${storeName}!`,
    ``,
    `Invoice: ${sale.invoiceNumber}`,
    `Total: ₹${Number(sale.grandTotal || 0).toFixed(2)}`,
  ];
  if (sale.hasWarranty) {
    lines.push('', 'Warranty details are included on the bill — please keep it for claims.');
  }
  lines.push('', `View / download your bill: ${publicBillUrl}`);
  return lines.join('\n');
}
