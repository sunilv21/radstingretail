import { Router } from 'express';
import crypto from 'crypto';
import Store from '../models/Store.js';
import Sale from '../models/Sale.js';

const router = Router();

// Meta's webhook subscribe handshake — echo hub.challenge if token matches a store's verifyToken.
router.get('/whatsapp', async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode !== 'subscribe' || !token) return res.status(400).send('Bad Request');

    const matched = await Store.findOne({ 'whatsapp.verifyToken': token }).lean();
    if (!matched) return res.status(403).send('Forbidden');
    return res.status(200).send(String(challenge ?? ''));
  } catch (err) {
    console.error('[webhooks/whatsapp GET]', err?.message || err);
    return res.status(500).send('verification error');
  }
});

router.post('/whatsapp', async (req, res) => {
  // Meta retries failed webhooks aggressively — never throw here. Log and 200.
  try {
  const body = req.body || {};
  if (body.object !== 'whatsapp_business_account') {
    return res.status(200).send('ignored');
  }

  const entries = Array.isArray(body.entry) ? body.entry : [];
  const wabaIds = Array.from(new Set(entries.map((e) => e?.id).filter(Boolean)));

  let matchedStore = null;
  if (wabaIds.length) {
    matchedStore = await Store.findOne({
      'whatsapp.enabled': true,
      'whatsapp.businessAccountId': { $in: wabaIds },
    });
  }
  if (!matchedStore) {
    const enabled = await Store.find({
      'whatsapp.enabled': true,
      'whatsapp.appSecret': { $ne: '' },
    }).limit(2);
    if (enabled.length === 1) matchedStore = enabled[0];
  }
  if (!matchedStore) return res.status(200).send('no store');

  const appSecret = matchedStore.whatsapp?.appSecret || '';
  if (!appSecret) {
    await recordWebhookError(matchedStore, 'App Secret not configured — cannot verify signature');
    return res.status(403).send('app secret missing');
  }
  const sigHeader = req.header('x-hub-signature-256') || '';
  if (!sigHeader.startsWith('sha256=')) {
    await recordWebhookError(matchedStore, 'Missing X-Hub-Signature-256 header');
    return res.status(403).send('no signature');
  }
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', appSecret).update(req.rawBody || Buffer.from(JSON.stringify(body))).digest('hex');
  let signatureOk = false;
  try {
    const a = Buffer.from(sigHeader);
    const b = Buffer.from(expected);
    signatureOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    await recordWebhookError(matchedStore, 'HMAC signature mismatch — App Secret wrong or tampered payload');
    return res.status(403).send('bad signature');
  }

  let touched = 0;
  let lastType = 'unknown';
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      if (Array.isArray(value.statuses)) {
        lastType = 'statuses';
        for (const s of value.statuses) {
          if (await applyStatusUpdate(matchedStore, s)) touched += 1;
        }
      } else if (Array.isArray(value.messages)) {
        lastType = 'messages';
        touched += value.messages.length;
      }
    }
  }

  matchedStore.whatsapp.webhookStatus = {
    lastEventAt: new Date().toISOString(),
    lastEventType: lastType,
    eventsReceived: (matchedStore.whatsapp.webhookStatus?.eventsReceived || 0) + 1,
    lastError: null,
  };
  matchedStore.markModified('whatsapp');
  await matchedStore.save();

  return res.status(200).json({ ok: true, updated: touched });
  } catch (err) {
    console.error('[webhooks/whatsapp POST]', err?.stack || err);
    // Always 200 so Meta doesn't retry an already-broken request indefinitely.
    return res.status(200).send('error logged');
  }
});

async function recordWebhookError(storeDoc, message) {
  storeDoc.whatsapp.webhookStatus = {
    lastEventAt: storeDoc.whatsapp.webhookStatus?.lastEventAt || null,
    lastEventType: storeDoc.whatsapp.webhookStatus?.lastEventType || null,
    eventsReceived: storeDoc.whatsapp.webhookStatus?.eventsReceived || 0,
    lastError: message,
  };
  storeDoc.markModified('whatsapp');
  try {
    await storeDoc.save();
  } catch {
    /* swallow */
  }
}

async function applyStatusUpdate(storeDoc, statusEvent) {
  const msgId = statusEvent?.id;
  const newStatus = statusEvent?.status;
  if (!msgId || !newStatus) return false;
  const ts = statusEvent?.timestamp
    ? new Date(Number(statusEvent.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  // Find any sale with a whatsappSends entry matching this messageId
  const sale = await Sale.findOne({
    storeId: storeDoc._id,
    'whatsappSends.messageId': msgId,
  });
  if (sale) {
    for (const s of sale.whatsappSends) {
      if (s.messageId === msgId) {
        s.deliveryStatus = newStatus;
        s.deliveryStatusAt = ts;
        if (statusEvent.errors?.[0]) s.deliveryError = statusEvent.errors[0].message;
      }
    }
    await sale.save();
    return true;
  }

  // Fall back to store's testLog
  const testLog = storeDoc.whatsapp?.testLog || [];
  let found = false;
  for (const t of testLog) {
    if (t.messageId === msgId) {
      t.deliveryStatus = newStatus;
      t.deliveryStatusAt = ts;
      if (statusEvent.errors?.[0]) t.deliveryError = statusEvent.errors[0].message;
      found = true;
    }
  }
  if (found) {
    storeDoc.markModified('whatsapp');
    await storeDoc.save();
  }
  return found;
}

export default router;
