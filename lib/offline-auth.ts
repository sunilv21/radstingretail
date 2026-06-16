/**
 * Hardened offline login for the desktop / PWA POS.
 *
 * A cashier who has logged in online on this device must be able to sign in
 * during an internet outage and keep billing (reads from cache, writes to the
 * outbox in lib/sync.ts). This module makes that safe.
 *
 * Threat-model decisions (see the design review that drove this):
 *  1. NO JWT is stored. We only cache a verifier + user snapshot. Offline mode
 *     runs WITHOUT a server token; on reconnect the first authenticated call
 *     401s → the app forces a fresh ONLINE re-auth (which re-issues the token).
 *     A stolen device therefore can't replay a long-lived token.
 *  2. 90-day expiry on the cached credential (`offlineExpiresAt`).
 *  3. Device binding + integrity + XSS-resistance via a NON-EXTRACTABLE
 *     AES-GCM key generated in IndexedDB. The credential record is AES-GCM
 *     encrypted with it, so: the blob can't be decrypted off-device, can't be
 *     read by an XSS `localStorage` dump (the key never enters localStorage
 *     and can't be exported), and can't be tampered (GCM auth tag — editing
 *     `role:"admin"` breaks decryption).
 *  4. Password is never stored — PBKDF2-SHA256 verifier only.
 *  5. Brute-force lockout: 5 failed attempts → 15-minute lock.
 *  6. Offline permissions are RESTRICTED to billing-safe actions by the rbac
 *     helper (see lib/rbac.ts `can()` honouring `isOfflineSession()`).
 *
 * Requires a secure context (https / localhost / Electron) for `crypto.subtle`
 * and IndexedDB. Degrades gracefully (offline login simply unavailable) where
 * they're missing.
 */

const CRED_PREFIX = 'offline-cred:';
const LOCK_PREFIX = 'offline-lock:';
const DEVICE_ID_KEY = 'offline-device-id';
const SESSION_OFFLINE_FLAG = 'session-offline';
const SESSION_ID_KEY = 'offline-session-id';
const SESSION_USER_KEY = 'offline-session-user';

const PBKDF2_ITERATIONS = 150_000;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes

// IndexedDB device-key store.
const IDB_NAME = 'radsting-auth';
const IDB_STORE = 'keys';
const DEVICE_KEY_ID = 'offline-aes-gcm-key';

// ── small helpers ─────────────────────────────────────────────────────────
function available(): boolean {
  return typeof window !== 'undefined' && !!window.crypto?.subtle && !!window.indexedDB;
}
function keyFor(email: string) { return CRED_PREFIX + email.trim().toLowerCase(); }
function lockKeyFor(email: string) { return LOCK_PREFIX + email.trim().toLowerCase(); }

function toB64(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ── IndexedDB: store the non-extractable AES-GCM CryptoKey ─────────────────
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(id: string): Promise<CryptoKey | null> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(id);
    tx.onsuccess = () => resolve((tx.result as CryptoKey) ?? null);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbPut(id: string, key: CryptoKey): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(key, id);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Per-device, non-extractable AES-GCM key. Generated once, never leaves IDB. */
async function getDeviceKey(): Promise<CryptoKey> {
  const existing = await idbGet(DEVICE_KEY_ID);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    /* extractable */ false,
    ['encrypt', 'decrypt'],
  );
  await idbPut(DEVICE_KEY_ID, key);
  return key;
}

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = toB64(crypto.getRandomValues(new Uint8Array(16)).buffer);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function encryptRecord(obj: unknown): Promise<string> {
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(obj)),
  );
  return JSON.stringify({ iv: toB64(iv.buffer), ct: toB64(ct) });
}
async function decryptRecord<T>(blob: string): Promise<T> {
  const key = await getDeviceKey();
  const { iv, ct } = JSON.parse(blob) as { iv: string; ct: string };
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv) },
    key,
    fromB64(ct), // GCM tag failure (tamper / wrong device) → throws
  );
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

async function deriveVerifier(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, km, 256);
  return toB64(bits);
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

interface OfflineRecord {
  email: string;
  salt: string;
  iterations: number;
  verifier: string;
  deviceId: string;
  user: unknown;
  storedAt: number;
  offlineExpiresAt: number;
}

function withCode(err: Error, code: string): Error & { code: string } {
  (err as Error & { code: string }).code = code;
  return err as Error & { code: string };
}

// ── lockout (plaintext counter; not sensitive) ────────────────────────────
function readLock(email: string): { fails: number; lockUntil: number } {
  try { return JSON.parse(localStorage.getItem(lockKeyFor(email)) || '') || { fails: 0, lockUntil: 0 }; }
  catch { return { fails: 0, lockUntil: 0 }; }
}
function writeLock(email: string, v: { fails: number; lockUntil: number }) {
  try { localStorage.setItem(lockKeyFor(email), JSON.stringify(v)); } catch {}
}
function clearLock(email: string) { try { localStorage.removeItem(lockKeyFor(email)); } catch {} }

// ── public API ────────────────────────────────────────────────────────────

/** Cache a credential after a successful ONLINE login. No JWT is stored. */
export async function storeOfflineCredential(params: {
  email: string;
  password: string;
  user: unknown;
}): Promise<void> {
  if (!available()) return;
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verifier = await deriveVerifier(params.password, salt, PBKDF2_ITERATIONS);
    const record: OfflineRecord = {
      email: params.email.trim().toLowerCase(),
      salt: toB64(salt.buffer),
      iterations: PBKDF2_ITERATIONS,
      verifier,
      deviceId: getDeviceId(),
      user: params.user,
      storedAt: Date.now(),
      offlineExpiresAt: Date.now() + MAX_AGE_MS,
    };
    localStorage.setItem(keyFor(params.email), await encryptRecord(record));
    clearLock(params.email);
  } catch {
    // Encryption / storage unavailable — offline login just won't be offered.
  }
}

export function hasOfflineCredential(email: string): boolean {
  if (typeof window === 'undefined' || !email) return false;
  return !!localStorage.getItem(keyFor(email));
}

export interface OfflineLoginResult { user: unknown }

/**
 * Attempt an offline sign-in. Throws Error with `.code`:
 *   UNAVAILABLE          — no secure context / crypto
 *   LOCKED               — too many failed attempts
 *   NO_OFFLINE_SESSION   — never logged in online here / expired / tampered
 *   INVALID_CREDENTIALS  — wrong password
 * On success: restores `user` + sets the offline-session flag (NO token).
 */
export async function tryOfflineLogin(email: string, password: string): Promise<OfflineLoginResult> {
  if (!available()) throw withCode(new Error('Offline login needs a secure context'), 'UNAVAILABLE');

  const lock = readLock(email);
  if (lock.lockUntil && Date.now() < lock.lockUntil) {
    const mins = Math.ceil((lock.lockUntil - Date.now()) / 60000);
    throw withCode(new Error(`Too many attempts. Locked for ${mins} more minute(s).`), 'LOCKED');
  }

  const blob = localStorage.getItem(keyFor(email));
  if (!blob) {
    throw withCode(
      new Error('No offline session for this account on this device. Connect to the internet to sign in the first time.'),
      'NO_OFFLINE_SESSION',
    );
  }

  let record: OfflineRecord;
  try {
    record = await decryptRecord<OfflineRecord>(blob); // throws on tamper / wrong device
  } catch {
    localStorage.removeItem(keyFor(email)); // corrupt/tampered/foreign-device → drop it
    throw withCode(new Error('Offline session is invalid on this device. Sign in online again.'), 'NO_OFFLINE_SESSION');
  }

  // Expiry + device-binding checks.
  if (Date.now() > record.offlineExpiresAt) {
    localStorage.removeItem(keyFor(email));
    throw withCode(new Error('Offline session expired (90-day limit). Sign in online to renew.'), 'NO_OFFLINE_SESSION');
  }
  if (record.deviceId !== getDeviceId()) {
    throw withCode(new Error('Offline session is bound to a different device.'), 'NO_OFFLINE_SESSION');
  }

  const candidate = await deriveVerifier(password, fromB64(record.salt), record.iterations || PBKDF2_ITERATIONS);
  if (!timingSafeEqual(candidate, record.verifier)) {
    const fails = (lock.fails || 0) + 1;
    writeLock(email, { fails, lockUntil: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
    throw withCode(
      new Error(fails >= MAX_FAILS ? `Invalid password. Locked for 15 minutes.` : 'Invalid email or password'),
      fails >= MAX_FAILS ? 'LOCKED' : 'INVALID_CREDENTIALS',
    );
  }

  // Success — restore a TOKENLESS offline session and stamp a fresh session id
  // so every record created in this offline session is traceable (provenance
  // for the audit trail + outbox ownership).
  clearLock(email);
  localStorage.setItem('user', JSON.stringify(record.user));
  localStorage.removeItem('token'); // explicitly no server token offline
  try {
    localStorage.setItem(SESSION_OFFLINE_FLAG, '1');
    localStorage.setItem(SESSION_ID_KEY, toB64(crypto.getRandomValues(new Uint8Array(12)).buffer));
    const u = record.user as { _id?: string; id?: string; email?: string } | null;
    localStorage.setItem(SESSION_USER_KEY, String(u?._id || u?.id || u?.email || ''));
  } catch {}
  return { user: record.user };
}

/**
 * Provenance for the current offline session — stamp this onto every record
 * created offline (sales queued to the outbox) so the synced document records
 * WHO created it, on WHICH device, in WHICH session, and WHEN. Returns null
 * when not in an offline session.
 */
export function getOfflineContext(): {
  offline: true; deviceId: string; offlineSessionId: string; userRef: string;
} | null {
  if (typeof window === 'undefined') return null;
  if (localStorage.getItem(SESSION_OFFLINE_FLAG) !== '1') return null;
  return {
    offline: true,
    deviceId: getDeviceId(),
    offlineSessionId: localStorage.getItem(SESSION_ID_KEY) || '',
    userRef: localStorage.getItem(SESSION_USER_KEY) || '',
  };
}

/** True when the current session was restored from an offline credential (no token). */
export function isOfflineSession(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SESSION_OFFLINE_FLAG) === '1';
}

/** Clear the offline-session flag + context — call after a successful ONLINE (re-)auth / logout. */
export function clearOfflineSessionFlag(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_OFFLINE_FLAG);
  localStorage.removeItem(SESSION_ID_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}

/** Remove cached offline credentials (one email, or all). Does not touch the device key. */
export function clearOfflineCredentials(email?: string): void {
  if (typeof window === 'undefined') return;
  if (email) {
    localStorage.removeItem(keyFor(email));
    clearLock(email);
    return;
  }
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && (k.startsWith(CRED_PREFIX) || k.startsWith(LOCK_PREFIX))) localStorage.removeItem(k);
  }
  localStorage.removeItem(SESSION_OFFLINE_FLAG);
}
