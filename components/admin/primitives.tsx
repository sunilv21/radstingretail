'use client'

/**
 * Shared admin primitives — design tokens encoded as small components so
 * every page uses the same chrome without each one re-implementing it.
 *
 * Visual language: Stripe Dashboard-inspired. White on slate-50 canvas,
 * indigo-600 accent for primary actions, traffic-light status colors
 * (emerald / amber / rose), generous whitespace, soft borders + shadows.
 */

import { cn } from '@/lib/utils'
import { ChevronRight, Loader2 } from 'lucide-react'
import Link from 'next/link'

// =============================================================================
// PageHeader — title + subtitle + actions row at the top of every page.
// =============================================================================
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
}: {
  title: string
  subtitle?: string
  breadcrumb?: { label: string; href?: string }[]
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap pb-6 border-b border-slate-200 mb-6">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1 text-[11px] text-slate-500 mb-2">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {b.href ? (
                  <Link href={b.href} className="hover:text-slate-900">
                    {b.label}
                  </Link>
                ) : (
                  <span>{b.label}</span>
                )}
                {i < breadcrumb.length - 1 && <ChevronRight className="w-3 h-3" />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

// =============================================================================
// StatCard — KPI tile with optional sparkline and delta.
// =============================================================================
export function StatCard({
  label,
  value,
  hint,
  delta,
  deltaLabel,
  sparkline,
  icon,
  href,
}: {
  label: string
  value: string | number
  hint?: string
  delta?: number              // signed: -12 means down 12%
  deltaLabel?: string         // e.g. "vs last month"
  sparkline?: number[]        // array of values, drawn as inline SVG path
  icon?: React.ReactNode
  href?: string               // optional → makes the card clickable
}) {
  const Body = (
    <div
      className={cn(
        'group bg-white border border-slate-200 rounded-xl p-4 transition-all',
        href && 'hover:border-indigo-300 hover:shadow-sm cursor-pointer',
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {label}
        </div>
        {icon && (
          <div className="w-7 h-7 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>
      <div className="text-3xl font-semibold text-slate-900 tabular-nums tracking-tight">
        {value}
      </div>
      <div className="flex items-baseline gap-2 mt-1.5 min-h-[18px]">
        {typeof delta === 'number' && (
          <span
            className={cn(
              'text-[12px] font-medium tabular-nums',
              delta > 0
                ? 'text-emerald-600'
                : delta < 0
                  ? 'text-rose-600'
                  : 'text-slate-500',
            )}
          >
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '·'} {Math.abs(delta)}%
          </span>
        )}
        {deltaLabel && <span className="text-[11px] text-slate-500">{deltaLabel}</span>}
        {hint && !deltaLabel && <span className="text-[11px] text-slate-500">{hint}</span>}
      </div>
      {sparkline && sparkline.length >= 2 && (
        <div className="mt-3 -mx-1">
          <Sparkline values={sparkline} />
        </div>
      )}
    </div>
  )
  return href ? <Link href={href}>{Body}</Link> : Body
}

/**
 * Tiny inline SVG sparkline. No deps. Renders the values as a smooth area+line.
 */
function Sparkline({ values }: { values: number[] }) {
  const w = 200
  const h = 32
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const step = w / Math.max(1, values.length - 1)
  const points = values.map((v, i) => {
    const x = i * step
    const y = h - ((v - min) / range) * h
    return { x, y }
  })
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')
  const area = `${path} L ${w.toFixed(2)} ${h} L 0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      <path d={area} fill="rgb(99 102 241 / 0.10)" />
      <path d={path} fill="none" stroke="rgb(99 102 241)" strokeWidth="1.5" />
    </svg>
  )
}

// =============================================================================
// Status badge — traffic-light pill for trial/active/expired/blocked/etc.
// =============================================================================
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'indigo'

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  neutral: 'bg-slate-50 text-slate-700 border-slate-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

export function Badge({
  children,
  tone = 'neutral',
  size = 'sm',
  className,
}: {
  children: React.ReactNode
  tone?: Tone
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border rounded-full font-medium tabular-nums',
        size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

// =============================================================================
// EmptyState — generic empty/loading slot for tables and lists.
// =============================================================================
export function EmptyState({
  title,
  hint,
  icon,
  loading,
  action,
}: {
  title: string
  hint?: string
  icon?: React.ReactNode
  loading?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      {loading ? (
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-3" />
      ) : (
        icon && (
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
            {icon}
          </div>
        )
      )}
      <div className="text-sm font-medium text-slate-900">{loading ? 'Loading…' : title}</div>
      {hint && !loading && <div className="text-xs text-slate-500 mt-1 max-w-xs">{hint}</div>}
      {action && !loading && <div className="mt-4">{action}</div>}
    </div>
  )
}

// =============================================================================
// Surface — generic white-card container with optional title/actions.
// =============================================================================
export function Surface({
  title,
  description,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-xl overflow-hidden',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  )
}

// =============================================================================
// Table primitives — opinionated, Stripe-style striped table chrome.
// =============================================================================
export function TableContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">{children}</table>
      </div>
    </div>
  )
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-slate-200 bg-slate-50/50">{children}</thead>
  )
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  children?: React.ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Tr({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-slate-100 last:border-b-0 transition-colors',
        onClick && 'cursor-pointer hover:bg-slate-50',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function Td({
  children,
  className,
  align = 'left',
}: {
  children?: React.ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <td
      className={cn(
        'px-4 py-3 text-[13px] text-slate-700',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  )
}

// =============================================================================
// Money / number helpers — used everywhere on admin.
// =============================================================================
export const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

export const inrPrecise = (n: number) =>
  '₹' +
  Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export const num = (n: number) => Number(n || 0).toLocaleString('en-IN')

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
