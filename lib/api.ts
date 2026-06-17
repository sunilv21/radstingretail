function resolveApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return '/api';
  return 'http://localhost:5000/api';
}

export const API_BASE = resolveApiBase();

// Default per-request timeout. Atlas can be slow to wake up on free tier; 30s
// keeps us patient enough for cold-starts but never lets the UI hang forever.
const REQUEST_TIMEOUT_MS = 30_000;

function token(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface RequestOpts extends RequestInit {
  /** Override the default timeout in ms. 0 disables the timeout entirely. */
  timeout?: number;
  /**
   * GET response caching (ignored for writes).
   *  - omitted  → cache for DEFAULT_GET_TTL_MS if the path is cacheable
   *  - number   → cache this GET for that many ms
   *  - false    → always hit the network (no cache, no stale read)
   */
  cacheTtl?: number | false;
}

// -------- Client-side GET cache + in-flight de-duplication ----------------
// Why: every page does `useEffect(load, [])`, so navigating away and back used
// to re-fetch the same data every time. We cache GET responses for a short TTL
// and de-dupe concurrent identical requests, so returning to a page within the
// window is instant. Writes (POST/PUT/DELETE) invalidate the matching resource
// so lists still refresh after a create/update/delete.
const DEFAULT_GET_TTL_MS = 60_000;

// Paths that must always be fresh (auth/session state, realtime POS lookups,
// live dashboards, health probes, public payment callbacks).
const NO_CACHE = [
  /^\/auth\b/, /^\/ready\b/, /^\/health\b/, /^\/reports\b/,
  /^\/pos\b/, /^\/public\b/, /^\/billing\b/,
  /\/einvoice\/(test|generate|cancel)\b/, /\/whatsapp\/(test|verify)\b/,
];
function isCacheable(path: string): boolean {
  return !NO_CACHE.some((re) => re.test(path));
}

interface CacheEntry { at: number; ttl: number; value: unknown }
const getCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

/** Drop cached GETs. Pass a path prefix to clear a subset, or no arg for all. */
export function invalidateCache(prefix?: string): void {
  if (!prefix) { getCache.clear(); return; }
  for (const k of getCache.keys()) if (k.startsWith(prefix)) getCache.delete(k);
}

async function request<T>(path: string, options: RequestOpts = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeout ?? REQUEST_TIMEOUT_MS;
  const timer =
    timeoutMs > 0
      ? setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
      : null;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    // Distinguish abort/timeout vs offline vs cors/network errors.
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new ApiError(
          'Request timed out — the server took too long to respond. Try again in a moment.',
          'TIMEOUT',
          0,
        );
      }
      // TypeError("Failed to fetch") is the canonical browser network error.
      if (err.name === 'TypeError') {
        throw new ApiError(
          'Cannot reach the server — check your internet connection or that the backend is running.',
          'NETWORK_ERROR',
          0,
        );
      }
    }
    throw new ApiError(
      err instanceof Error ? err.message : 'Request failed',
      'REQUEST_FAILED',
      0,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  // Read the body as text first so we can degrade gracefully on non-JSON
  // responses (HTML 502 from a proxy, plain "Service Unavailable" string, …).
  const text = await res.text().catch(() => '');
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // Non-JSON response — surface a generic error tagged with the HTTP code
      // so the caller can still toast something meaningful.
      if (!res.ok) {
        throw new ApiError(
          `Server returned a non-JSON ${res.status} response`,
          'BAD_RESPONSE',
          res.status,
        );
      }
      // 2xx with non-JSON body — return the raw text. Rare but valid.
      return text as unknown as T;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      getCache.clear(); // never serve the previous session's data
      if (window.location.pathname !== '/') window.location.href = '/';
    }
    // 402 = subscription expired or blocked. Stash the code in
    // sessionStorage AND fire a custom DOM event so the dashboard layout
    // can immediately switch to the SubscriptionLock takeover without
    // having to poll. The poll-based path remains a fallback.
    if (res.status === 402 && typeof window !== 'undefined') {
      const err = (body as { error?: { code?: string; message?: string; details?: { status?: string } } })?.error;
      const payload = {
        code: err?.code || 'SUBSCRIPTION_EXPIRED',
        message: err?.message || 'Your subscription is no longer active.',
        status: err?.details?.status || 'expired',
        seenAt: Date.now(),
      };
      try {
        sessionStorage.setItem('subscription-block', JSON.stringify(payload));
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('subscription:block', { detail: payload }));
      } catch {}
    }
    const err = (body as { error?: { message?: string; code?: string; details?: unknown } })?.error || {};
    const fallbackMessage = (body as { message?: string })?.message;
    throw new ApiError(
      err.message || fallbackMessage || `Request failed (${res.status})`,
      err.code || 'REQUEST_FAILED',
      res.status,
      err.details,
    );
  }

  if (body && typeof body === 'object' && 'success' in body) {
    return (body as unknown as { data: T }).data;
  }
  return body as T;
}

function cachedGet<T>(path: string, opts?: RequestOpts): Promise<T> {
  const ttl =
    opts?.cacheTtl === false
      ? 0
      : typeof opts?.cacheTtl === 'number'
        ? opts.cacheTtl
        : isCacheable(path)
          ? DEFAULT_GET_TTL_MS
          : 0;

  if (ttl <= 0) return request<T>(path, opts);

  const hit = getCache.get(path);
  if (hit && Date.now() - hit.at < hit.ttl) {
    return Promise.resolve(hit.value as T);
  }
  // De-dupe concurrent identical GETs (also covers React strict-mode double-mount).
  const flying = inFlight.get(path);
  if (flying) return flying as Promise<T>;

  const p = request<T>(path, opts)
    .then((v) => {
      getCache.set(path, { at: Date.now(), ttl, value: v });
      inFlight.delete(path);
      return v;
    })
    .catch((err) => {
      inFlight.delete(path);
      throw err;
    });
  inFlight.set(path, p);
  return p;
}

export const api = {
  get: <T>(path: string, opts?: RequestOpts) => cachedGet<T>(path, opts),
  // Writes ripple across resources (a sale changes stock + ledger + reports;
  // a GRN changes stock + payables). Clearing the whole GET cache after any
  // mutation is the simplest correct choice — navigation between reads stays
  // cached/instant, but the moment anything changes, every screen refetches.
  post: <T>(path: string, data?: unknown, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: 'POST', body: JSON.stringify(data ?? {}) }).then((r) => {
      invalidateCache();
      return r as T;
    }),
  put: <T>(path: string, data?: unknown, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: 'PUT', body: JSON.stringify(data ?? {}) }).then((r) => {
      invalidateCache();
      return r as T;
    }),
  del: <T>(path: string, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: 'DELETE' }).then((r) => {
      invalidateCache();
      return r as T;
    }),
  /** Manually drop cached GETs (e.g. force-refresh a screen). */
  invalidate: invalidateCache,
  /**
   * SYNCHRONOUS cached read — returns a fresh cached value or undefined,
   * WITHOUT any network call. Use it to seed a page's initial state so a
   * revisited screen renders instantly (no loading skeleton flash). Pair with
   * a background `api.get` to revalidate.
   */
  peek: <T>(path: string): T | undefined => {
    const hit = getCache.get(path);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
    return undefined;
  },
};

// Legacy helpers kept for existing pages
export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  return request<any>(endpoint, options);
}
export const login = (email: string, password: string) =>
  api.post<{ token: string; user: any }>('/auth/login', { email, password });
export const getSalesData = () => api.get<any[]>('/sales');
export const getInventoryData = () => api.get<any[]>('/products');
export const getDashboardStats = () => api.get<any>('/reports/dashboard');
