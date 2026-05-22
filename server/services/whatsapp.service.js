import { AppError } from '../utils/response.js';

/**
 * WhatsApp send service — supports two providers:
 *
 *   - 'meta'   → Meta WhatsApp Cloud API (Graph). Original integration.
 *   - 'twilio' → Twilio's WhatsApp REST API.
 *
 * Each provider has its own credential set on the Store doc; the `provider`
 * field decides which adapter handles a given store's send. The public API of
 * this module is provider-agnostic: callers just use sendWhatsAppText() and
 * sendWhatsAppTemplate() and the right adapter is picked at send time.
 */

// Normalise phone to E.164 digits without the leading '+'.
// Accepts '+91 98765 43210', '919876543210', '9876543210' etc.
function normalisePhone(raw, defaultCountryCode = '91') {
  if (!raw) return null;
  let p = String(raw).trim().replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.length === 10) p = String(defaultCountryCode) + p;
  if (p.length < 10) return null;
  return p;
}

/** Which provider is configured for this store? Falls back to 'meta'
 *  for back-compat with older docs that pre-date the provider field. */
function providerFor(store) {
  return store?.whatsapp?.provider || 'meta';
}

// ─────────────────────────────────────────────────────────────────────
// Meta Cloud API adapter
// ─────────────────────────────────────────────────────────────────────

function requireMetaConfig(store) {
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

// ─────────────────────────────────────────────────────────────────────
// Twilio adapter
// ─────────────────────────────────────────────────────────────────────

function requireTwilioConfig(store) {
  const wa = store?.whatsapp || {};
  if (!wa.enabled) {
    throw new AppError(
      'WHATSAPP_DISABLED',
      'WhatsApp integration is disabled. Turn it on in Settings → WhatsApp.',
      400,
    );
  }
  if (!wa.twilioAccountSid) {
    throw new AppError('WHATSAPP_CONFIG', 'Twilio Account SID is missing in settings', 400);
  }
  if (!wa.twilioAuthToken) {
    throw new AppError('WHATSAPP_CONFIG', 'Twilio Auth Token is missing in settings', 400);
  }
  if (!wa.twilioFromNumber) {
    throw new AppError('WHATSAPP_CONFIG', 'Twilio From Number is missing in settings', 400);
  }
  return {
    accountSid: wa.twilioAccountSid,
    authToken: wa.twilioAuthToken,
    fromNumber: String(wa.twilioFromNumber).replace(/^whatsapp:/, '').trim(),
    contentSid: wa.twilioContentSid || '',
    defaultCountryCode: wa.defaultCountryCode || '91',
    messageTemplate: wa.messageTemplate || '',
  };
}

async function postToTwilio({ accountSid, authToken }, form) {
  // Twilio uses application/x-www-form-urlencoded + Basic auth (SID:token).
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) {
    if (v !== undefined && v !== null) body.append(k, String(v));
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  } catch (err) {
    throw new AppError(
      'WHATSAPP_NETWORK',
      `Could not reach Twilio API: ${err.message}`,
      502,
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(
      'WHATSAPP_API_ERROR',
      data?.message || `Twilio API returned HTTP ${response.status}`,
      response.status >= 500 ? 502 : 400,
      {
        status: response.status,
        code: data?.code,
        more_info: data?.more_info,
      },
    );
  }

  // Twilio returns the To field with the 'whatsapp:+...' prefix; strip it for
  // a stable shape across providers.
  const toRaw = String(data?.to || '').replace(/^whatsapp:\+?/, '');
  return {
    messageId: data?.sid || null,
    whatsappPhone: toRaw || null,
    raw: data,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Public API — provider-agnostic
// ─────────────────────────────────────────────────────────────────────

export async function sendWhatsAppText({ store, to, message }) {
  const provider = providerFor(store);

  if (provider === 'twilio') {
    const cfg = requireTwilioConfig(store);
    const phone = normalisePhone(to, cfg.defaultCountryCode);
    if (!phone) {
      throw new AppError('INVALID_PHONE', 'Recipient phone number is invalid', 400);
    }
    return postToTwilio(cfg, {
      From: `whatsapp:+${cfg.fromNumber.replace(/^\+/, '')}`,
      To: `whatsapp:+${phone}`,
      Body: String(message || '').slice(0, 4096),
    });
  }

  // Default: Meta.
  const cfg = requireMetaConfig(store);
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
 * 24-hour customer-service window.
 *   - Meta: pass templateName + language + bodyParams (must be approved in
 *     Meta Business Manager).
 *   - Twilio: uses the Content SID (HX…) stored under `twilioContentSid`.
 *     bodyParams map to ContentVariables {"1": "...", "2": "..."}.
 */
export async function sendWhatsAppTemplate({
  store,
  to,
  templateName,
  language,
  bodyParams = [],
}) {
  const provider = providerFor(store);

  if (provider === 'twilio') {
    const cfg = requireTwilioConfig(store);
    const phone = normalisePhone(to, cfg.defaultCountryCode);
    if (!phone) {
      throw new AppError('INVALID_PHONE', 'Recipient phone number is invalid', 400);
    }
    if (!cfg.contentSid) {
      throw new AppError(
        'WHATSAPP_CONFIG',
        'Twilio Content SID is required to send a template. Add it in Settings → WhatsApp.',
        400,
      );
    }
    const variables = {};
    bodyParams.forEach((v, i) => {
      variables[String(i + 1)] = String(v);
    });
    return postToTwilio(cfg, {
      From: `whatsapp:+${cfg.fromNumber.replace(/^\+/, '')}`,
      To: `whatsapp:+${phone}`,
      ContentSid: cfg.contentSid,
      ContentVariables: JSON.stringify(variables),
    });
  }

  // Default: Meta.
  const cfg = requireMetaConfig(store);
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
 * Live-verify the saved credentials.
 *   - Meta: reads the Phone Number profile (verified name, quality rating).
 *   - Twilio: pings the Account resource — returns enough info to confirm
 *     the SID + token are valid and the account is active.
 */
export async function fetchPhoneProfile({ store }) {
  const provider = providerFor(store);

  if (provider === 'twilio') {
    const cfg = requireTwilioConfig(store);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}.json`;
    const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
    let response;
    try {
      response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    } catch (err) {
      throw new AppError('WHATSAPP_NETWORK', `Could not reach Twilio: ${err.message}`, 502);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AppError(
        'WHATSAPP_API_ERROR',
        data?.message || `Twilio returned HTTP ${response.status}`,
        response.status >= 500 ? 502 : 400,
        { status: response.status, code: data?.code },
      );
    }
    return {
      verifiedName: data?.friendly_name || null,
      displayPhoneNumber: cfg.fromNumber || null,
      qualityRating: null,
      codeVerificationStatus: data?.status === 'active' ? 'VERIFIED' : data?.status || null,
      platformType: 'TWILIO',
      nameStatus: data?.type || null,
    };
  }

  // Default: Meta.
  const cfg = requireMetaConfig(store);
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
