'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import { Lock, Eye, EyeOff } from 'lucide-react'
import { API_BASE } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Clear any poisoned localStorage ("undefined"/invalid JSON from older builds)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const token = localStorage.getItem('token')
    const user = localStorage.getItem('user')
    const bad = (v: string | null) => !v || v === 'undefined' || v === 'null'
    if (bad(token) || bad(user)) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      return
    }
    try {
      JSON.parse(user as string)
    } catch {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const body = await response.json()

      if (!response.ok || body?.success === false) {
        throw new Error(body?.error?.message || body?.message || 'Login failed')
      }

      // API returns { success, data: { token, user }, timestamp } — unwrap it.
      const payload = body?.data ?? body
      const token: string | undefined = payload?.token
      const user = payload?.user

      if (!token || !user) {
        throw new Error('Login response was malformed')
      }

      // Tenant POS app — only tenant_admin and staff log in here. Platform
      // admins (super_admin) go to the vendor portal, which lives on a
      // different domain (e.g. vendor.radsting.com) and uses
      // /api/auth/super-admin/login.
      const isPlatformAdmin = String(user?.userType || user?.role || '').toLowerCase() === 'super_admin'
      if (isPlatformAdmin) {
        setError('This is the tenant app. Platform admins should use the vendor portal.')
        return
      }
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      // CAs live in their own read-only portal. Everyone else goes to the
      // main dashboard. Sending a CA to /dashboard would just bounce them
      // back since they don't have write permissions for most modules.
      const isCa = String(user?.role || '').toLowerCase() === 'ca'
      router.push(isCa ? '/ca-portal' : '/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[60fr_40fr] bg-slate-900">
      {/* Left: Brand banner — hidden on small screens */}
      <div className="relative hidden lg:block overflow-hidden">
        <Image
          src="/banner.png"
          alt="Radsting"
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-slate-900/30 to-transparent" />
        <div className="absolute bottom-8 left-8 right-8 text-white z-10">
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 inline-flex items-center gap-3">
            <div className="bg-white rounded-full p-1 flex items-center justify-center">
              <Image
                src="/Radsting-logo.png"
                alt="Radsting logo"
                width={36}
                height={36}
                className="rounded-full"
                priority
              />
            </div>
            <div>
              <div className="font-bold text-lg leading-tight">Radsting POS &amp; ERP</div>
              <div className="text-xs text-white/80">Retail, Billing, Accounting — All in one</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="relative flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl"></div>
        </div>

        <Card className="w-full max-w-md relative z-10 bg-slate-800/50 border-slate-700">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-center mx-auto mb-2">
              <div className="bg-white rounded-full p-2 shadow-lg ring-1 ring-white/20">
                <Image
                  src="/Radsting-logo.png"
                  alt="Radsting"
                  width={100}
                  height={100}
                  className="rounded-full"
                  priority
                />
              </div>
            </div>
            <CardTitle className="text-center text-2xl text-white">Radsting POS &amp; ERP</CardTitle>
            <CardDescription className="text-center text-slate-300">Sign in to your account</CardDescription>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-600 px-4 py-2 rounded text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Email</label>
              <Input
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-400"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-400 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-white transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
            <p className="text-xs text-slate-400 mb-2 flex items-center gap-2">
              <Lock className="w-3 h-3" />
              Demo Credentials
            </p>
            <p className="text-xs text-slate-300">Email: admin@example.com</p>
            <p className="text-xs text-slate-300">Password: password123</p>
          </div>
        </CardContent>
        </Card>
      </div>
    </div>
  )
}
