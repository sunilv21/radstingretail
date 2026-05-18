'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  IndianRupee,
  TrendingUp,
  AlertTriangle,
  RefreshCcw,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Users,
  Store,
  ShieldCheck,
  Inbox,
  Receipt,
  CreditCard,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/admin-api'
import type {
  DashboardSummary,
  PlatformPaymentListResponse,
  SupportRequestListResponse,
} from '@/lib/admin-types'
import {
  PageHeader,
  StatCard,
  Badge,
  Surface,
  TableContainer,
  THead,
  Th,
  Tr,
  Td,
  EmptyState,
  inr,
  num,
  fmtDateTime,
} from '@/components/admin/primitives'

/**
 * Stripe-flavoured platform overview. Sections:
 *   1. KPI strip — MRR, ARR, Tenants, Avg revenue/tenant + inline sparkline
 *   2. Action band — pending payments + expiring trials (the two things
 *      that need a human RIGHT NOW)
 *   3. Tenant distribution — trial / active / expired / blocked
 *   4. Recent support requests — for the on-call vendor
 */
export default function VendorDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [payments, setPayments] = useState<PlatformPaymentListResponse | null>(null)
  const [requests, setRequests] = useState<SupportRequestListResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      // Parallel — main summary + small slices of payments / requests for
      // the action panels. Failures on the smaller calls are non-fatal.
      const [s, p, r] = await Promise.allSettled([
        api.get<DashboardSummary>('/platform/dashboard'),
        api.get<PlatformPaymentListResponse>('/platform/payments?status=pending&limit=5'),
        api.get<SupportRequestListResponse>('/platform/requests?status=new&limit=5'),
      ])
      if (s.status === 'fulfilled') setSummary(s.value)
      else if (s.reason instanceof ApiError) toast.error(s.reason.message)
      if (p.status === 'fulfilled') setPayments(p.value)
      if (r.status === 'fulfilled') setRequests(r.value)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <PageHeader
        title="Platform overview"
        subtitle="Cross-tenant view of every business running on Radsting."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Link href="/admin/dashboard/tenants">
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                Manage tenants <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </>
        }
      />

      {/* ===== KPI strip ===== */}
      {summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Monthly recurring revenue"
            value={inr(summary.mrr)}
            hint={`ARR ${inr(summary.arr)} · ${summary.activePayingTenants} paying`}
            icon={<IndianRupee className="w-4 h-4" />}
            sparkline={mockSpark(summary.mrr, 8)}
          />
          <StatCard
            label="Tenants"
            value={num(summary.tenants.total)}
            hint={`${num(summary.totalStores)} stores · ${num(summary.totalUsers)} users`}
            icon={<Building2 className="w-4 h-4" />}
            sparkline={mockSpark(summary.tenants.total, 7)}
          />
          <StatCard
            label="Active + trial"
            value={num(summary.tenants.active + summary.tenants.trial)}
            hint={`${summary.tenants.active} paid · ${summary.tenants.trial} on trial`}
            icon={<ShieldCheck className="w-4 h-4" />}
            sparkline={mockSpark(summary.tenants.active + summary.tenants.trial, 6)}
          />
          <StatCard
            label="Average revenue / tenant"
            value={inr(summary.averageRevenuePerTenant)}
            hint="Across paying tenants only"
            icon={<TrendingUp className="w-4 h-4" />}
            sparkline={mockSpark(summary.averageRevenuePerTenant, 5)}
          />
        </div>
      ) : (
        <KpiSkeleton />
      )}

      {/* ===== Action band — pending payments + expiring trials ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <Surface
          title="Pending approvals"
          description="Tenant-submitted payments waiting for your confirmation."
          actions={
            <Link href="/admin/dashboard/payments">
              <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-8">
                View all <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          }
          padded={false}
        >
          {!payments ? (
            <EmptyState title="Loading…" loading />
          ) : payments.payments.length === 0 ? (
            <EmptyState
              title="All caught up"
              hint="No pending payments waiting on you."
              icon={<Receipt className="w-5 h-5" />}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {payments.payments.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link
                    href="/admin/dashboard/payments"
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {p.organizationName || 'Unknown org'}
                      </div>
                      <div className="text-[12px] text-slate-500 truncate">
                        {p.planName || p.type} · ref {p.reference}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-slate-900 tabular-nums">
                        {inr(p.amount)}
                      </div>
                      <div className="text-[11px] text-slate-500">{fmtDateTime(p.createdAt)}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <Surface
          title="Expiring soon"
          description="Trials and subscriptions ending in the next 7 days."
          actions={
            <Link href="/admin/dashboard/tenants">
              <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-8">
                Open tenants <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          }
          padded={false}
        >
          {!summary ? (
            <EmptyState title="Loading…" loading />
          ) : summary.expiringSoon.length === 0 ? (
            <EmptyState
              title="Nothing on the horizon"
              hint="No tenants near subscription end-date."
              icon={<Sparkles className="w-5 h-5" />}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.expiringSoon.slice(0, 5).map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div
                    className={
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0 ' +
                      (e.daysRemaining <= 2
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-amber-50 text-amber-600')
                    }
                  >
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate">{e.name}</div>
                    <div className="text-[12px] text-slate-500 capitalize">{e.status}</div>
                  </div>
                  <Badge tone={e.daysRemaining <= 2 ? 'danger' : 'warning'}>
                    {e.daysRemaining}d left
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>

      {/* ===== Tenant distribution + Recent requests ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        {summary && (
          <Surface title="Tenant distribution" className="lg:col-span-1">
            <div className="space-y-3">
              <DistRow
                label="Trial"
                count={summary.tenants.trial}
                total={summary.tenants.total}
                tone="info"
              />
              <DistRow
                label="Active"
                count={summary.tenants.active}
                total={summary.tenants.total}
                tone="success"
              />
              <DistRow
                label="Expired"
                count={summary.tenants.expired}
                total={summary.tenants.total}
                tone="warning"
              />
              <DistRow
                label="Blocked"
                count={summary.tenants.blocked}
                total={summary.tenants.total}
                tone="danger"
              />
            </div>
          </Surface>
        )}

        <Surface
          title="Recent support requests"
          description="New requests in the last 24 hours."
          actions={
            <Link href="/admin/dashboard/requests">
              <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-8">
                Open inbox <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          }
          padded={false}
          className="lg:col-span-2"
        >
          {!requests ? (
            <EmptyState title="Loading…" loading />
          ) : requests.requests.length === 0 ? (
            <EmptyState
              title="Inbox zero"
              hint="No new support requests."
              icon={<Inbox className="w-5 h-5" />}
            />
          ) : (
            <TableContainer>
              <THead>
                <Tr>
                  <Th>Subject</Th>
                  <Th>Tenant</Th>
                  <Th>Type</Th>
                  <Th>Priority</Th>
                  <Th align="right">Received</Th>
                </Tr>
              </THead>
              <tbody>
                {requests.requests.slice(0, 5).map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium text-slate-900 max-w-65 truncate">
                      {r.subject}
                    </Td>
                    <Td className="text-slate-500 truncate max-w-45">
                      {r.organizationName || '—'}
                    </Td>
                    <Td>
                      <Badge tone="indigo" size="sm">
                        {r.type}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          r.priority === 'urgent'
                            ? 'danger'
                            : r.priority === 'high'
                              ? 'warning'
                              : 'neutral'
                        }
                        size="sm"
                      >
                        {r.priority}
                      </Badge>
                    </Td>
                    <Td align="right" className="text-[11px] text-slate-500">
                      {fmtDateTime(r.createdAt)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableContainer>
          )}
        </Surface>
      </div>

      {/* ===== Quick action chips ===== */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-2">
        <QuickAction
          icon={<Users className="w-3.5 h-3.5" />}
          label="Onboard tenant"
          href="/admin/dashboard/tenants"
        />
        <QuickAction
          icon={<CreditCard className="w-3.5 h-3.5" />}
          label="Issue payment link"
          href="/admin/dashboard/payments"
        />
        <QuickAction
          icon={<Store className="w-3.5 h-3.5" />}
          label="Edit plans"
          href="/admin/dashboard/plans"
        />
        <QuickAction
          icon={<Inbox className="w-3.5 h-3.5" />}
          label="Reply to support"
          href="/admin/dashboard/requests"
        />
      </div>
    </div>
  )
}

/**
 * Cheap mock sparkline — server doesn't return historical series yet, so
 * we generate a smooth ascending curve toward the current value. Replace
 * with real time-series data once /platform/dashboard returns history.
 */
function mockSpark(currentValue: number, points = 8): number[] {
  if (!currentValue) return Array(points).fill(0)
  return Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1)
    const noise = (Math.sin(i * 1.7) + 1) * 0.05 * currentValue
    return currentValue * (0.6 + 0.4 * t) + noise
  })
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-35 bg-white border border-slate-200 rounded-xl animate-pulse"
        />
      ))}
    </div>
  )
}

function DistRow({
  label,
  count,
  total,
  tone,
}: {
  label: string
  count: number
  total: number
  tone: 'info' | 'success' | 'warning' | 'danger'
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const fill =
    tone === 'success'
      ? 'bg-emerald-500'
      : tone === 'warning'
        ? 'bg-amber-500'
        : tone === 'danger'
          ? 'bg-rose-500'
          : 'bg-blue-500'
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] font-medium text-slate-700">{label}</span>
        <span className="text-[13px] font-semibold tabular-nums text-slate-900">
          {num(count)}
          <span className="text-[11px] font-normal text-slate-400 ml-1.5">{pct}%</span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={fill + ' h-full rounded-full transition-all'} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function QuickAction({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode
  label: string
  href: string
}) {
  return (
    <Link href={href}>
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors group cursor-pointer flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-100">
          {icon}
        </div>
        <span className="text-[13px] font-medium text-slate-700 group-hover:text-slate-900">
          {label}
        </span>
      </div>
    </Link>
  )
}
