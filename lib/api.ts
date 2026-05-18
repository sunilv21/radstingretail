export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

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

export const api = {
  get: <T>(path: string, opts?: RequestOpts) => request<T>(path, opts),
  post: <T>(path: string, data?: unknown, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data?: unknown, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: 'PUT', body: JSON.stringify(data ?? {}) }),
  del: <T>(path: string, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
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
