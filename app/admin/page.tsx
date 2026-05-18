'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Shield,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  TrendingUp,
  Users,
  AlertCircle,
} from 'lucide-react'
import { API_BASE } from '@/lib/admin-api'

/**
 * Stripe-flavoured admin sign-in. Split screen:
 *   Left  — brand panel with platform pitch (hidden on small screens)
 *   Right — clean white centered card with email/password form
 *
 * Only `super_admin` accounts can pass. A tenant JWT in localStorage is
 * cleared on mount so the page never accidentally redirects past auth.
 */
export default function VendorLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Drop any poisoned token from older builds.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = localStorage.getItem('admin-user')
    if (!raw || raw === 'undefined' || raw === 'null') {
      localStorage.removeItem('admin-token')
      localStorage.removeItem('admin-user')
      return
    }
    try {
      JSON.parse(raw)
    } catch {
      localStorage.removeItem('admin-token')
      localStorage.removeItem('admin-user')
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/super-admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.success === false) {
        throw new Error(body?.error?.message || 'Sign-in failed')
      }
      const payload = body?.data ?? body
      const token = payload?.token
      const user = payload?.user
      if (!token || !user) throw new Error('Sign-in response was malformed')
      if (user.userType !== 'super_admin') {
        throw new Error('That account is not a platform admin.')
      }
      localStorage.setItem('admin-token', token)
      localStorage.setItem('admin-user', JSON.stringify(user))
      router.push('/admin/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_1.1fr] bg-white">
      {/* Brand pane (left) — hidden on small screens */}
      <div className="relative hidden lg:flex items-center justify-center overflow-hidden bg-linear-to-br from-indigo-600 via-indigo-500 to-violet-600 p-12">
        {/* Soft decorative gradient blobs */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full bg-fuchsia-300/20 blur-3xl" />

        <div className="relative text-white max-w-md">
          {/* Real brand logo on a white disc — keeps the round PNG readable
              against the indigo gradient without re-tinting it. */}
          <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-6 shadow-lg shadow-indigo-900/30 ring-2 ring-white/30">
            <Image
              src="/Radsting-logo.png"
              alt="Radsting"
              width={48}
              height={48}
              className="rounded-full"
              priority
            />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight leading-tight mb-3">
            Radsting Admin Portal
          </h2>
          <p className="text-white/80 text-[15px] leading-relaxed mb-8">
            Manage every tenant, plan, payment, and support ticket from one
            console. Restricted to platform super-admins.
          </p>

          <div className="space-y-3">
            <PitchTile
              icon={<Users className="w-4 h-4" />}
              title="Onboard tenants in seconds"
              body="Create an organisation, assign a plan, set the trial — done."
            />
            <PitchTile
              icon={<TrendingUp className="w-4 h-4" />}
              title="Track MRR + ARR live"
              body="Per-tenant revenue, trial-expiry watchlist, churn risk in one view."
            />
            <PitchTile
              icon={<Shield className="w-4 h-4" />}
              title="Strictly RBAC-gated"
              body="A tenant JWT never reaches /api/platform/*. Server enforces it."
            />
          </div>
        </div>
      </div>

      {/* Form pane (right) */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-slate-50 lg:bg-white">
        <div className="w-full max-w-sm">
          {/* Compact brand chip on small screens only — uses the real logo. */}
          <div className="lg:hidden mb-8 flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm shrink-0">
              <Image
                src="/Radsting-logo.png"
                alt="Radsting"
                width={32}
                height={32}
                className="rounded-full"
                priority
              />
            </div>
            <div>
              <div className="font-semibold text-slate-900">Radsting</div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Admin Portal
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Welcome back
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Sign in to manage your platform.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[13px]">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-slate-700">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@yourcompany.com"
                required
                autoFocus
                className="h-10 bg-white border-slate-300 placeholder:text-slate-400 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[12px] font-medium text-slate-700">Password</Label>
                <span className="text-[11px] text-slate-400">Reset via DB / vendor support</span>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-10 bg-white border-slate-300 placeholder:text-slate-400 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Sign in <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </form>

          <p className="text-[11px] text-slate-400 mt-8 text-center">
            Tenant store-owners log in at the POS app, not here.
          </p>
        </div>
      </div>
    </div>
  )
}

function PitchTile({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10">
      <div className="w-8 h-8 rounded-md bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold leading-tight">{title}</div>
        <div className="text-[12px] text-white/70 mt-0.5 leading-relaxed">{body}</div>
      </div>
    </div>
  )
}
