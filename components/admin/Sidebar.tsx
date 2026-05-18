'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Receipt,
  Inbox,
  Settings,
  LogOut,
  TrendingUp,
  IndianRupee,
  MessagesSquare,
  Cog,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/admin-api'
import type { SupportRequestListResponse } from '@/lib/admin-types'

/**
 * Stripe-flavoured admin sidebar — white background, grouped sections,
 * indigo accent on active. Three groups so the vendor's mental model
 * (growth · revenue · support · platform) maps directly to the nav.
 */

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  label: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Growth',
    icon: TrendingUp,
    items: [
      { label: 'Overview', href: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Tenants', href: '/admin/dashboard/tenants', icon: Building2 },
      { label: 'Plans', href: '/admin/dashboard/plans', icon: CreditCard },
    ],
  },
  {
    label: 'Revenue',
    icon: IndianRupee,
    items: [{ label: 'Payments', href: '/admin/dashboard/payments', icon: Receipt }],
  },
  {
    label: 'Support',
    icon: MessagesSquare,
    items: [{ label: 'Requests', href: '/admin/dashboard/requests', icon: Inbox }],
  },
  {
    label: 'Platform',
    icon: Cog,
    items: [
      { label: 'Users', href: '/admin/dashboard/users', icon: Users },
      { label: 'Settings', href: '/admin/dashboard/settings', icon: Settings },
      { label: 'Docs', href: '/admin/dashboard/docs', icon: BookOpen },
    ],
  },
]

export default function Sidebar({
  user,
  onLogout,
}: {
  user: { name?: string; email?: string } | null
  onLogout: () => void
}) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/admin/dashboard'
      ? pathname === '/admin/dashboard'
      : pathname === href || pathname.startsWith(href + '/')

  // Unread tenant request count — drives the pill on the Requests nav item.
  // Polled every 60 s; refreshes on tab focus so the vendor doesn't have
  // to reload to see new tickets.
  const [unreadCount, setUnreadCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    const fetchUnread = async () => {
      try {
        const res = await api.get<SupportRequestListResponse>('/platform/requests')
        if (!cancelled) setUnreadCount(res.summary?.unread || 0)
      } catch {
        /* swallow — sidebar shouldn't toast on background polls */
      }
    }
    fetchUnread()
    const t = setInterval(fetchUnread, 60_000)
    const onFocus = () => fetchUnread()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [pathname])

  // Initials for the avatar circle in the footer. Two chars max.
  const initials = (() => {
    const src = user?.name || user?.email || ''
    return src
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || 'AD'
  })()

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col h-screen sticky top-0">
      {/* Brand — real Radsting logo, not an inverted SVG. Round PNG sits on
          a soft white disc so it's recognisable on every theme. */}
      <div className="px-4 h-14 border-b border-slate-200 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm shrink-0">
          <Image
            src="/Radsting-logo.png"
            alt="Radsting"
            width={30}
            height={30}
            className="rounded-full"
            priority
          />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-[13px] leading-tight text-slate-900">Radsting</div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Admin Portal
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                const showBadge =
                  item.href === '/admin/dashboard/requests' && unreadCount > 0
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={cn(
                        'flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] transition-colors',
                        active
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                      )}
                    >
                      <Icon
                        className={cn(
                          'w-4 h-4 shrink-0',
                          active ? 'text-indigo-600' : 'text-slate-400',
                        )}
                      />
                      <span className="truncate flex-1">{item.label}</span>
                      {showBadge && (
                        <span
                          className={cn(
                            'shrink-0 text-[10px] font-semibold rounded-full px-1.5 leading-4 min-w-4.5 text-center',
                            active
                              ? 'bg-indigo-600 text-white'
                              : 'bg-rose-500 text-white',
                          )}
                        >
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-slate-200">
        {user ? (
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-slate-50 group">
            <div className="w-8 h-8 rounded-full bg-linear-to-br from-slate-200 to-slate-300 flex items-center justify-center text-[11px] font-semibold text-slate-700 shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium leading-tight truncate text-slate-900">
                {user.name || user.email?.split('@')[0]}
              </div>
              <div className="text-[10px] text-slate-500 truncate">{user.email}</div>
            </div>
            <button
              onClick={onLogout}
              title="Sign out"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
