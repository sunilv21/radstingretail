'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Loader2 } from 'lucide-react'
import Sidebar from '@/components/admin/Sidebar'
import { Toaster } from 'sonner'

type AuthState = 'checking' | 'authenticated' | 'unauthenticated'

/**
 * Admin shell — Stripe-flavoured: slate-50 canvas, white sidebar/cards.
 * Refuses to render anything if the localStorage token isn't a super_admin;
 * a tenant JWT in this surface is bounced to /admin (the login).
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<{ name?: string; email?: string; userType?: string } | null>(null)
  const [authState, setAuthState] = useState<AuthState>('checking')

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin-token') : null
    const raw = typeof window !== 'undefined' ? localStorage.getItem('admin-user') : null
    if (!token || !raw || raw === 'undefined' || raw === 'null') {
      setAuthState('unauthenticated')
      router.replace('/admin')
      return
    }
    try {
      const parsed = JSON.parse(raw)
      if (parsed.userType !== 'super_admin') {
        localStorage.removeItem('admin-token')
        localStorage.removeItem('admin-user')
        setAuthState('unauthenticated')
        router.replace('/admin')
        return
      }
      setUser(parsed)
      setAuthState('authenticated')
    } catch {
      setAuthState('unauthenticated')
      router.replace('/admin')
    }
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('admin-token')
    localStorage.removeItem('admin-user')
    router.push('/admin')
  }

  if (authState !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            {authState === 'checking' ? 'Checking your session…' : 'Redirecting to sign in…'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex bg-slate-50 min-h-screen text-slate-900 antialiased">
      <Sidebar user={user} onLogout={handleLogout} />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">{children}</div>
      </main>
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{ className: 'rounded-xl' }}
      />
    </div>
  )
}
