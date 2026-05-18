'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Toaster } from 'sonner'
import {
  ShieldCheck,
  BookOpen,
  FileBarChart,
  Receipt,
  Scale,
  TrendingUp,
  Banknote,
  CalendarRange,
  ArrowLeftFromLine,
  LogOut,
  Eye,
} from 'lucide-react'
import ErrorBoundary from '@/components/ErrorBoundary'
import { StoreSwitcher } from '@/components/StoreSwitcher'
import { cn } from '@/lib/utils'
import type { AuthUser } from '@/lib/types'

const NAV = [
  { label: 'Day Book',         href: '/ca-portal',                icon: CalendarRange },
  { label: 'Trial Balance',    href: '/ca-portal/trial-balance',  icon: Scale },
  { label: 'P&L Statement',    href: '/ca-portal/profit-loss',    icon: TrendingUp },
  { label: 'Balance Sheet',    href: '/ca-portal/balance-sheet',  icon: BookOpen },
  { label: 'Cash Flow',        href: '/ca-portal/cash-flow',      icon: Banknote },
  { label: 'GSTR-1',           href: '/ca-portal/gstr1',          icon: Receipt },
  { label: 'GSTR-3B',          href: '/ca-portal/gstr3b',         icon: Receipt },
  { label: 'Sales register',   href: '/ca-portal/sales',          icon: FileBarChart },
  { label: 'Purchase register',href: '/ca-portal/purchases',      icon: FileBarChart },
]

export default function CaPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const raw = localStorage.getItem('user')
    const token = localStorage.getItem('token')
    if (!raw || raw === 'null' || raw === 'undefined' || !token) {
      router.push('/')
      return
    }
    try {
      const u = JSON.parse(raw) as AuthUser
      // Only the CA role belongs in this shell. Anyone else gets sent home.
      if (u.role !== 'ca') {
        router.push('/dashboard')
        return
      }
      setUser(u)
    } catch {
      router.push('/')
    }
  }, [router])

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  if (!mounted || !user) return null

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-56 bg-card border-r border-border flex flex-col">
        <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
          <Image src="/Radsting.svg" alt="Radsting" width={26} height={26} priority />
          <div className="min-w-0">
            <h1 className="font-bold text-sm leading-tight truncate">CA Portal</h1>
            <p className="text-[9px] text-muted-foreground leading-tight uppercase tracking-wide">Read-only audit access</p>
          </div>
        </div>

        <div className="px-2 py-2 border-b border-border space-y-2">
          {/* Branch switcher — CAs are granted org-wide read access, so they
              need to be able to pick which branch their reports scope to.
              Reports (GSTR-1/3B, P&L, Balance Sheet, Sales/Purchase register)
              are all per-branch on the server. */}
          <StoreSwitcher />
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-2 text-[11px] flex items-start gap-1.5 text-emerald-800 dark:text-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              <b>Read-only mode.</b> Customer phones, emails and addresses are
              redacted. Every page you visit is recorded in your client&rsquo;s
              audit log.
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon
            const active =
              item.href === '/ca-portal'
                ? pathname === '/ca-portal'
                : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={active ? 'default' : 'ghost'}
                  className={cn(
                    'w-full justify-start gap-2 h-8 px-2 text-[13px]',
                    active && 'bg-blue-600 hover:bg-blue-700',
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Button>
              </Link>
            )
          })}
        </nav>

        <div className="px-2 py-2 border-t border-border space-y-1.5">
          <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-muted/50">
            <Eye className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium truncate leading-tight">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Sign out"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto">
          <div className="p-3 md:p-4">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </div>
  )
}
