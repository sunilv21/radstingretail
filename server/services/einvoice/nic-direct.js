/**
 * NIC IRP direct integration — SCAFFOLD ONLY.
 *
 * Why this is a scaffold:
 *   The NIC e-invoice API uses a non-standard AES + RSA "Sek" key-exchange
 *   for both auth and every subsequent request. Implementing it from
 *   scratch requires:
 *
 *     1. Generate a client-side 256-bit AES key (the "Sek").
 *     2. Encrypt the Sek with NIC's published RSA-2048 public key → `AppKey`.
 *     3. Send {AppKey, ForceRefreshAccessToken} to /eivital/v1.04/auth
 *        with body { ClientId, ClientSecret, UserName, Password (encrypted),
 *        AppKey, ForceRefreshAccessToken: 'true' } over HTTPS.
 *     4. Decode the response: {Status, Data:{Sek (server-rolled, AES-encrypted),
 *        AuthToken, TokenExpiry}}.  Decrypt Sek with our private RSA key →
 *        new symmetric Sek used for all subsequent API calls.
 *     5. For every generate/cancel call: AES-encrypt the JSON payload with
 *        the per-session Sek, POST {Data: encryptedPayload} + AuthToken
 *        header. Response Data is AES-encrypted; decrypt with the same Sek.
 *
 *   This is genuinely complex and *only* certified for taxpayers with
 *   aggregate turnover > ₹100 Cr (NIC policy). 95%+ of Indian SMBs use a
 *   GSP, which handles all the crypto in their cloud. See `gsp-client.js`
 *   for the actually-wired integration.
 *
 * If you need to wire NIC direct:
 *   - Crypto reference: github.com/cleartax/india-e-invoice-spec
 *   - Endpoints: https://einv-apisandbox.nic.in/version1.03/
 *   - Get sandbox credentials: https://einvoice1.gst.gov.in/Others/EInvAPISystem
 *
 * This file documents the request shapes and exposes the same surface as
 * gsp-client.js so the dispatcher in e-invoice.service.js doesn't branch
 * on provider type — it just resolves the right module.
 */

import { AppError } from '../../utils/response.js';

const NIC_NOT_IMPL = (op) =>
  new AppError(
    'EINV_NIC_NOT_IMPLEMENTED',
    `NIC IRP direct ${op} is scaffolded but not implemented. AES/RSA Sek key exchange is required for direct integration. Use a GSP (provider='gsp' in Settings → E-Invoice) — they handle the crypto for you. Docs: server/services/einvoice/nic-direct.js`,
    501,
  );

/**
 * Auth flow:
 *   Endpoint: POST {baseUrl}/eivital/v1.04/auth
 *   Request body (after AES/RSA prep):
 *     {
 *       UserName: "GSP-issued or NIC-direct username",
 *       Password: <RSA-encrypted with NIC public key>,
 *       AppKey: <RSA-encrypted AES Sek>,
 *       ForceRefreshAccessToken: "true"
 *     }
 *   Response (decrypt Data with our private RSA):
 *     {
 *       Status: "1",
 *       Data: {
 *         AuthToken: "JWT-string",
 *         Sek: <AES-encrypted symmetric key for subsequent calls>,
 *         TokenExpiry: 21600     // 6 hours in seconds
 *       }
 *     }
 */
// eslint-disable-next-line no-unused-vars
export async function fetchAuthToken(store) {
  throw NIC_NOT_IMPL('auth');
}

/**
 * Generate IRN:
 *   Endpoint: POST {baseUrl}/eicore/v1.03/Invoice
 *   Request body:
 *     { Data: <AES-encrypted NIC schema-v1.1 payload using session Sek> }
 *   Headers:
 *     authtoken: <AuthToken from auth call>
 *     client_id: <NIC-issued>
 *     client_secret: <NIC-issued>
 *     gstin: <seller GSTIN>
 *     user_name: <NIC-issued>
 *   Response (decrypt Data with session Sek):
 *     {
 *       Status: "1",
 *       Data: {
 *         AckNo: 112010055000123,
 *         AckDt: "2025-03-15 16:11:00",
 *         Irn:    "1c63d76d70a3...",  (64-char hash)
 *         SignedInvoice: "<JWT signed by NIC>",
 *         SignedQRCode: "<JWT-encoded QR payload>",
 *         EwbNo: 391001234567   (only if requested in payload)
 *       }
 *     }
 */
// eslint-disable-next-line no-unused-vars
export async function generateIrn(store, payload) {
  throw NIC_NOT_IMPL('IRN generate');
}

/**
 * Cancel IRN:
 *   Endpoint: POST {baseUrl}/eicore/v1.03/Invoice/Cancel
 *   Request payload (before AES encrypt):
 *     {
 *       Irn: "1c63d76d70a3...",
 *       CnlRsn: "1" | "2" | "3" | "4",   // 1=Duplicate, 2=Data entry, 3=Order cancel, 4=Other
 *       CnlRem: "Free-text reason, max 100 chars"
 *     }
 *   Response: { Data: { Irn, CancelDate } } (decrypted)
 *
 * NIC enforces a 24-hour window from IRN generation; the service layer
 * re-validates this before calling.
 */
// eslint-disable-next-line no-unused-vars
export async function cancelIrn(store, { irn, cancelReason, cancelRemarks }) {
  throw NIC_NOT_IMPL('IRN cancel');
}

/**
 * Generate EWB (e-way bill):
 *   Endpoint: POST {baseUrl}/ewb/v1.03/ewayapi
 *   Different API namespace from e-invoice, but uses the SAME auth (AuthToken
 *   + Sek). Payload schema documented at: ewaybillgst.gov.in
 *
 * Common minimum fields:
 *   { supplyType, subSupplyType, docType, docNo, docDate, fromGstin, fromPincode,
 *     fromStateCode, toGstin, toPincode, toStateCode, transactionType,
 *     itemList: [{...HSN, qty, taxableAmount, cgst/sgst/igst}],
 *     totalValue, transMode, vehicleNo, transDistance }
 */
// eslint-disable-next-line no-unused-vars
export async function generateEwb(store, payload) {
  throw NIC_NOT_IMPL('EWB generate');
}

/**
 * Test connection — just runs auth, no IRN. Used by Settings test button.
 */
// eslint-disable-next-line no-unused-vars
export async function testConnection(store) {
  throw NIC_NOT_IMPL('test connection');
}
