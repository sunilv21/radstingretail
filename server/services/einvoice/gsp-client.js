/**
 * Generic GSP HTTP client.
 *
 * The Indian GST e-invoice ecosystem runs through Goods & Services Tax
 * Suvidha Providers (GSPs) — ClearTax, IRIS, Masters India, Tally Signer,
 * Avalara, etc. They sit between the merchant and NIC's IRP and handle
 * the AES/RSA crypto required by the NIC direct API.
 *
 * Most GSPs share an OAuth2-flavoured shape:
 *   1. POST {baseUrl}{authPath}   → access_token (Bearer)
 *   2. POST {baseUrl}{generatePath} with NIC schema-v1.1 payload → IRN+Ack+QR
 *   3. POST {baseUrl}{cancelPath} with {Irn, CnlRsn, CnlRem}     → cancelDate
 *
 * Field names + paths vary slightly — we look in the most common spots
 * (Authorization header / authToken / access_token, response payload at
 * top-level / under `data` / under `result`). Defaults work for ClearTax,
 * Masters India, IRIS; merchants override the paths for outliers.
 *
 * Token caching is in-memory per storeId, keyed off (storeId|environment)
 * so sandbox + prod don't collide. TTL respects `expires_in` from the
 * auth response, capped to 6 hours (NIC's max anyway).
 */

import { AppError } from '../../utils/response.js';
import { translateNicError } from './nic-errors.js';

const SAFETY_MARGIN_MS = 60 * 1000; // refresh 1 min before expiry
const MAX_TTL_MS = 6 * 60 * 60 * 1000; // NIC tokens last 6h
const DEFAULT_TTL_MS = 50 * 60 * 1000; // fallback when GSP doesn't return expires_in

const tokenCache = new Map(); // key: `${storeId}|${env}` → { token, expiresAt }

function cacheKey(store) {
  return `${String(store._id)}|${store.eInvoice?.environment || 'sandbox'}`;
}

/** Reset cache (used by Settings save so stale credentials don't linger). */
export function clearTokenCache(store) {
  if (store) tokenCache.delete(cacheKey(store));
  else tokenCache.clear();
}

function ensureBaseUrl(store) {
  const cfg = store.eInvoice || {};
  if (!cfg.baseUrl || !cfg.baseUrl.trim()) {
    throw new AppError(
      'EINV_NOT_CONFIGURED',
      'GSP base URL is missing in Settings → E-Invoice.',
      400,
    );
  }
  return cfg.baseUrl.replace(/\/$/, '');
}

function buildPath(base, path, fallback) {
  const p = path && path.trim() ? path : fallback;
  return base + (p.startsWith('/') ? p : '/' + p);
}

/**
 * POST a JSON body, returning the parsed response. Throws AppError with
 * NIC-translated messages on failure.
 */
async function postJson(url, body, headers = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AppError(
      'EINV_NETWORK',
      `Could not reach ${url} — ${err.message}`,
      502,
    );
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) {
      throw new AppError(
        'EINV_BAD_RESPONSE',
        `Non-JSON response from GSP (HTTP ${res.status}): ${text.slice(0, 200)}`,
        502,
      );
    }
    json = {};
  }

  // Status-aware error handling. GSPs return 2xx with `success:false` too,
  // so check the payload too.
  const apiOk = json?.success !== false && !json?.error_code && !json?.errorDetails;
  if (!res.ok || !apiOk) {
    throw new AppError(
      'EINV_GSP_ERROR',
      translateNicError(json) || `GSP returned HTTP ${res.status}`,
      res.status >= 500 ? 502 : 400,
      { httpStatus: res.status, raw: json },
    );
  }
  return json;
}

/**
 * Look in the response for the access token. Different GSPs put it in
 * different places — we try the common spots in order of preference.
 */
function extractToken(json) {
  return (
    json?.access_token ||
    json?.AccessToken ||
    json?.authToken ||
    json?.AuthToken ||
    json?.data?.access_token ||
    json?.data?.AuthToken ||
    json?.data?.authToken ||
    json?.result?.access_token ||
    null
  );
}

function extractExpiry(json) {
  // Try standard OAuth2 then NIC's `Sek`/`TokenExpiry`. Default to 50 min.
  const seconds = Number(
    json?.expires_in ||
      json?.data?.expires_in ||
      json?.data?.TokenExpiry ||
      json?.ExpiresIn ||
      0,
  );
  if (seconds > 0 && seconds < 60 * 60 * 24) return seconds * 1000;
  return DEFAULT_TTL_MS;
}

/**
 * Fetch (or refresh) the GSP auth token. Public — callers that need the
 * token directly (test endpoint) get exactly one round-trip.
 */
export async function fetchAuthToken(store) {
  const cfg = store.eInvoice || {};
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new AppError(
      'EINV_NOT_CONFIGURED',
      'GSP clientId and clientSecret are required in Settings → E-Invoice.',
      400,
    );
  }
  const base = ensureBaseUrl(store);
  const url = buildPath(base, cfg.authPath, '/auth/token');

  // Send a body that covers both OAuth2 client_credentials AND NIC-style
  // payloads. GSPs ignore the fields they don't recognise.
  const body = {
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    username: cfg.username || undefined,
    password: cfg.password || undefined,
    gstin: cfg.gstin || undefined,
  };
  // Strip undefined keys so we don't post nulls.
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];

  const json = await postJson(url, body);
  const token = extractToken(json);
  if (!token) {
    throw new AppError(
      'EINV_NO_TOKEN',
      'GSP responded successfully but no token field was present (looked for access_token, AuthToken, authToken).',
      502,
      { raw: json },
    );
  }
  const ttlMs = Math.min(MAX_TTL_MS, extractExpiry(json));
  const expiresAt = Date.now() + ttlMs;
  tokenCache.set(cacheKey(store), { token, expiresAt });
  return { token, expiresAt, ttlMs, raw: json };
}

async function getOrRefreshToken(store) {
  const cached = tokenCache.get(cacheKey(store));
  if (cached && cached.expiresAt > Date.now() + SAFETY_MARGIN_MS) {
    return cached.token;
  }
  const fresh = await fetchAuthToken(store);
  return fresh.token;
}

/**
 * Test-connection — auth only, no IRN burn. Used by the Settings
 * "Test connection" button.
 */
export async function testConnection(store) {
  const result = await fetchAuthToken(store);
  return {
    ok: true,
    expiresAtIso: new Date(result.expiresAt).toISOString(),
    ttlSeconds: Math.round(result.ttlMs / 1000),
    provider: store.eInvoice?.provider || 'gsp',
    environment: store.eInvoice?.environment || 'sandbox',
  };
}

/**
 * Look in the response for the IRN block. NIC + most GSPs return it under
 * `data.Irn / AckNo / AckDt / SignedQRCode`; some flatten it.
 */
function extractIrnResult(json) {
  const root = json?.data || json?.result || json;
  return {
    irn: root?.Irn || root?.irn || null,
    ackNo: root?.AckNo || root?.ackNo || null,
    ackDate: root?.AckDt || root?.AckDate || root?.ackDate || null,
    signedQr: root?.SignedQRCode || root?.signedQRCode || root?.signedQr || null,
    signedInvoice: root?.SignedInvoice || root?.signedInvoice || null,
    ewb: root?.EwbNo || null, // some GSPs return EWB in same call if requested
  };
}

/**
 * Generate IRN against the configured GSP. `payload` must be the NIC
 * schema-v1.1 envelope (see payload-builder.js).
 */
export async function generateIrnViaGsp(store, payload) {
  const token = await getOrRefreshToken(store);
  const cfg = store.eInvoice || {};
  const base = ensureBaseUrl(store);
  const url = buildPath(base, cfg.generatePath, '/einvoice/generate');

  const headers = {
    Authorization: `Bearer ${token}`,
    // NIC + most GSPs require these companion headers as well.
    user_name: cfg.username || '',
    gstin: cfg.gstin || '',
    client_id: cfg.clientId || '',
    client_secret: cfg.clientSecret || '',
  };
  const json = await postJson(url, payload, headers);
  const out = extractIrnResult(json);
  if (!out.irn) {
    throw new AppError(
      'EINV_NO_IRN',
      'GSP accepted the request but no IRN was returned. Check your GSTIN enrolment with the GSP.',
      502,
      { raw: json },
    );
  }
  return {
    ...out,
    ackDate: out.ackDate ? new Date(out.ackDate) : new Date(),
    provider: 'gsp',
  };
}

/**
 * Cancel an existing IRN. NIC enforces a 24-hour window from generation;
 * we re-check that in the service layer.
 */
export async function cancelIrnViaGsp(store, { irn, cancelReason, cancelRemarks }) {
  const token = await getOrRefreshToken(store);
  const cfg = store.eInvoice || {};
  const base = ensureBaseUrl(store);
  const url = buildPath(base, cfg.cancelPath, '/einvoice/cancel');

  // NIC's canonical reason codes: 1=Duplicate, 2=Data entry mistake,
  // 3=Order cancelled, 4=Other. Default to "4 — Other" if not provided.
  const CnlRsn = String(cancelReason || '4');
  const json = await postJson(
    url,
    {
      Irn: irn,
      CnlRsn,
      CnlRem: cancelRemarks || 'Cancelled via POS',
    },
    {
      Authorization: `Bearer ${token}`,
      user_name: cfg.username || '',
      gstin: cfg.gstin || '',
      client_id: cfg.clientId || '',
      client_secret: cfg.clientSecret || '',
    },
  );
  const root = json?.data || json?.result || json;
  return {
    cancelDate: root?.CancelDate ? new Date(root.CancelDate) : new Date(),
    provider: 'gsp',
    raw: json,
  };
}

/**
 * Generate an EWB through the GSP. EWB has a lighter payload than IRN and
 * lives on a separate endpoint. Same auth + Bearer header.
 */
export async function generateEwbViaGsp(store, payload) {
  const token = await getOrRefreshToken(store);
  const cfg = store.eInvoice || {};
  const base = ensureBaseUrl(store);
  const url = buildPath(base, cfg.ewbGeneratePath, '/ewaybill/generate');

  const json = await postJson(url, payload, {
    Authorization: `Bearer ${token}`,
    user_name: cfg.username || '',
    gstin: cfg.gstin || '',
    client_id: cfg.clientId || '',
    client_secret: cfg.clientSecret || '',
  });
  const root = json?.data || json?.result || json;
  return {
    ewbNumber: root?.EwbNo || root?.ewbNumber || root?.ewbNo || null,
    ewbDate: root?.EwbDt ? new Date(root.EwbDt) : new Date(),
    validUpto: root?.ValidUpto ? new Date(root.ValidUpto) : null,
    provider: 'gsp',
    raw: json,
  };
}
