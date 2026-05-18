/**
 * Tiny fetch wrapper for the admin / vendor portal. Lives in the same
 * Next.js project as the tenant frontend, but uses a SEPARATE localStorage
 * key (`admin-token` / `admin-user`) and a SEPARATE 401-redirect target
 * (`/admin` instead of `/`), so a vendor and a tenant can be logged in
 * simultaneously in the same browser without colliding.
 *
 * All requests target the single backend at `NEXT_PUBLIC_API_URL`. The legacy
 * `NEXT_PUBLIC_API_BASE_URL` is honoured as a fallback for older envs.
 */
function resolveApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL
  if (typeof window !== 'undefined') return '/api'
  return 'http://localhost:5000/api'
}

export const API_BASE = resolveApiBase()

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown
  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

interface RequestOpts extends RequestInit {
  timeoutMs?: number
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  }
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('admin-token')
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  let res: Response
  const controller = new AbortController()
  const timer = opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : null
  try {
    res = await fetch(url, { ...opts, headers, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('Request timed out', 'TIMEOUT', 0)
    }
    throw new ApiError(
      err instanceof Error ? err.message : 'Network error',
      'NETWORK_ERROR',
      0,
    )
  } finally {
    if (timer) clearTimeout(timer)
  }

  const text = await res.text().catch(() => '')
  let body: unknown = {}
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      if (!res.ok) {
        throw new ApiError(`Server returned a non-JSON ${res.status}`, 'BAD_RESPONSE', res.status)
      }
      return text as unknown as T
    }
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('admin-token')
      window.localStorage.removeItem('admin-user')
      if (window.location.pathname !== '/admin') window.location.href = '/admin'
    }
    const err = (body as { error?: { message?: string; code?: string; details?: unknown } })?.error || {}
    throw new ApiError(
      err.message || `Request failed (${res.status})`,
      err.code || 'REQUEST_FAILED',
      res.status,
      err.details,
    )
  }

  if (body && typeof body === 'object' && 'success' in body) {
    return (body as unknown as { data: T }).data
  }
  return body as T
}

export const api = {
  get: <T>(path: string, opts?: RequestOpts) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, data?: unknown, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data?: unknown, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: 'PUT', body: JSON.stringify(data ?? {}) }),
  del: <T>(path: string, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
}

export function getCurrentUser(): import('./types').AuthUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem('admin-user')
    if (!raw || raw === 'null' || raw === 'undefined') return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}
