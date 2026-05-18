'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Lock, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { API_BASE } from '@/lib/api'

interface InviteInfo {
  email: string
  role: string
  organizationId: string
}

/**
 * Public invite-acceptance page. The token in the URL IS the auth — it
 * proves you were invited. We let the invitee set their password and then
 * route them straight into the dashboard (or CA portal).
 */
export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!params?.token) return
    fetch(`${API_BASE}/invites/${params.token}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body?.error?.message || 'Invitation invalid')
        return body.data
      })
      .then((data: InviteInfo) => setInfo(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [params?.token])

  const accept = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/invites/${params.token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || 'Could not accept invitation')

      // Auto-login: hit /auth/login with the new credentials.
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: info?.email, password }),
      })
      const loginBody = await loginRes.json().catch(() => ({}))
      if (loginRes.ok && loginBody?.success) {
        localStorage.setItem('token', loginBody.data.token)
        localStorage.setItem('user', JSON.stringify(loginBody.data.user))
        setDone(true)
        // CAs go to the CA portal; everyone else to the regular dashboard.
        const home = info?.role === 'ca' ? '/ca-portal' : '/dashboard'
        setTimeout(() => router.push(home), 1200)
      } else {
        // Fall back to login page if auto-login failed.
        setDone(true)
        setTimeout(() => router.push('/'), 1500)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not accept invitation')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Image src="/Radsting.svg" alt="Radsting" width={40} height={40} priority />
          </div>
          <CardTitle>You've been invited to Radsting</CardTitle>
          <CardDescription>
            Set a password to accept the invitation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Verifying invitation…</div>
          ) : error ? (
            <div className="rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900 p-4 text-center">
              <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">{error}</p>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">
                Ask your admin to send a fresh invite.
              </p>
              <Button variant="outline" size="sm" onClick={() => router.push('/')} className="mt-4">
                Go to login
              </Button>
            </div>
          ) : done ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-semibold">Account ready! Redirecting…</p>
            </div>
          ) : (
            <form onSubmit={accept} className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-mono">{info?.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Role</span>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {info?.role === 'ca' && <ShieldCheck className="w-3 h-3 mr-1" />}
                    {info?.role}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs">Your name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="space-y-1">
                <label className="text-xs">Password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div className="space-y-1">
                <label className="text-xs">Confirm password</label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700">
                <Lock className="w-4 h-4 mr-1" />
                {submitting ? 'Setting up your account…' : 'Accept & continue'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
