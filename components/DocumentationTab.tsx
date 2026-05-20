'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Rocket,
  ScanLine,
  Package,
  Truck,
  Users,
  Building2,
  BookText,
  Receipt,
  FileBarChart,
  CreditCard,
  MessageCircle,
  Settings as SettingsIcon,
  HelpCircle,
  AlertCircle,
  KeyRound,
  ChevronRight,
  CheckCircle2,
  Info,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  Calculator,
  Layers,
  Database,
  Globe,
  Lock,
  Zap,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'

// =====================================================================
// Knowledge Base — visual reference: rich single-scroll documentation
// inspired by SupplyChainOS_Analysis.html. Cream palette · sticky
// sidebar · dark hero with stats · numbered sections with serif
// headings · KPI tiles · flow diagrams · role matrix · info boxes ·
// sprint-style cards · code blocks · checklists. Content is end-user /
// merchant focused — covers the same 17 Radsting POS topics.
// =====================================================================

// ─────────────────────────────────────────────────────────────────────
// Palette + visual primitives
// ─────────────────────────────────────────────────────────────────────

type Tone =
  | 'teal'
  | 'blue'
  | 'amber'
  | 'emerald'
  | 'rose'
  | 'violet'
  | 'slate'
  | 'orange'

const TONE_RING: Record<Tone, string> = {
  teal: 'ring-teal-200 bg-teal-50 text-teal-800',
  blue: 'ring-blue-200 bg-blue-50 text-blue-800',
  amber: 'ring-amber-200 bg-amber-50 text-amber-800',
  emerald: 'ring-emerald-200 bg-emerald-50 text-emerald-800',
  rose: 'ring-rose-200 bg-rose-50 text-rose-800',
  violet: 'ring-violet-200 bg-violet-50 text-violet-800',
  slate: 'ring-stone-200 bg-stone-100 text-stone-800',
  orange: 'ring-orange-200 bg-orange-50 text-orange-800',
}
const TONE_TEXT: Record<Tone, string> = {
  teal: 'text-teal-700',
  blue: 'text-blue-700',
  amber: 'text-amber-700',
  emerald: 'text-emerald-700',
  rose: 'text-rose-700',
  violet: 'text-violet-700',
  slate: 'text-stone-700',
  orange: 'text-orange-700',
}
const TONE_BORDER: Record<Tone, string> = {
  teal: 'border-teal-500',
  blue: 'border-blue-500',
  amber: 'border-amber-500',
  emerald: 'border-emerald-500',
  rose: 'border-rose-500',
  violet: 'border-violet-500',
  slate: 'border-stone-400',
  orange: 'border-orange-500',
}

// ---------- Headings ----------

function SectionHeader({
  num,
  icon: Icon,
  title,
  description,
  tone = 'teal',
}: {
  num: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  tone?: Tone
}) {
  return (
    <div className="flex items-start gap-4 mb-8 pb-5 border-b-2 border-stone-200">
      <div
        className={`shrink-0 w-12 h-12 rounded-xl ring-1 ring-inset flex items-center justify-center mt-1 ${TONE_RING[tone]}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-[1.5px] text-stone-500 mb-0.5">
          Section {num}
        </div>
        <h2 className="font-serif text-[28px] sm:text-[30px] font-bold text-stone-900 leading-tight tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-stone-500 text-[14px] mt-1.5 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[16px] font-semibold text-stone-900 mt-7 mb-3.5">
      {children}
    </h3>
  )
}

// ---------- Card variants ----------

function Card({
  children,
  accent,
  className = '',
}: {
  children: React.ReactNode
  accent?: Tone
  className?: string
}) {
  const accentClass = accent ? `border-l-[3px] ${TONE_BORDER[accent]}` : ''
  return (
    <div
      className={`bg-white border border-stone-200 rounded-xl px-7 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${accentClass} ${className}`}
    >
      {children}
    </div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[15px] font-semibold text-stone-900 mb-3">{children}</h3>
  )
}

function HighlightBox({
  title,
  children,
  icon: Icon = Sparkles,
}: {
  title: string
  children: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-xl bg-linear-to-br from-teal-50 to-emerald-50 border-[1.5px] border-teal-500 p-5 mb-5">
      <div className="flex items-center gap-2 text-emerald-800 font-bold text-[14px] mb-2">
        <Icon className="w-4 h-4" />
        {title}
      </div>
      <div className="text-emerald-900 text-[13.5px] leading-relaxed">{children}</div>
    </div>
  )
}

function InfoBox({
  tone = 'blue',
  title,
  children,
}: {
  tone?: 'teal' | 'amber' | 'blue' | 'rose'
  title?: string
  children: React.ReactNode
}) {
  const borderColor =
    tone === 'teal'
      ? 'border-teal-600 bg-teal-50 text-teal-900'
      : tone === 'amber'
        ? 'border-amber-600 bg-amber-50 text-amber-900'
        : tone === 'rose'
          ? 'border-rose-600 bg-rose-50 text-rose-900'
          : 'border-blue-600 bg-blue-50 text-blue-900'
  return (
    <div
      className={`border-l-4 ${borderColor} px-5 py-4 rounded-r-xl my-3 text-[14px] leading-relaxed`}
    >
      {title && <div className="font-bold mb-1">{title}</div>}
      <div>{children}</div>
    </div>
  )
}

// ---------- Badge / Pill ----------

function Badge({
  tone = 'slate',
  children,
}: {
  tone?: Tone
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-[0.3px] ring-1 ring-inset ${TONE_RING[tone]}`}
    >
      {children}
    </span>
  )
}

// ---------- KPI tiles ----------

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="relative bg-white border border-stone-200 rounded-xl px-7 py-6 overflow-hidden">
      <div className="text-[11px] font-bold uppercase tracking-[0.7px] text-stone-500 mb-2">
        {label}
      </div>
      <div className="font-serif text-[32px] font-bold text-stone-900 leading-none mb-1.5">
        {value}
      </div>
      {sub && <div className="text-[12px] text-stone-500">{sub}</div>}
      {Icon && (
        <div className="absolute right-5 top-1/2 -translate-y-1/2 opacity-10">
          <Icon className="w-12 h-12 text-stone-900" />
        </div>
      )}
    </div>
  )
}

// ---------- Flow diagrams ----------

function FlowLinear({
  steps,
  title,
}: {
  steps: { label: string; sub?: string; tone?: Tone }[]
  title?: string
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl px-8 py-7 mb-6">
      {title && (
        <div className="text-[12px] font-semibold uppercase tracking-[0.8px] text-stone-500 mb-5">
          {title}
        </div>
      )}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-1 shrink-0">
            <div
              className={`rounded-lg ring-[1.5px] ring-inset px-3.5 py-2.5 min-w-32 text-center ${TONE_RING[s.tone || 'teal']}`}
            >
              <div className="text-[12.5px] font-semibold">{s.label}</div>
              {s.sub && <div className="text-[10.5px] opacity-75 mt-0.5">{s.sub}</div>}
            </div>
            {i < steps.length - 1 && (
              <span className="text-stone-400 text-lg px-1.5">→</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function FlowVertical({
  items,
}: {
  items: { label: string; sub?: string; tone?: Tone }[]
}) {
  return (
    <div className="my-4">
      {items.map((it, i) => {
        const tone = it.tone || 'teal'
        const dotColor =
          tone === 'blue'
            ? 'bg-blue-600'
            : tone === 'violet'
              ? 'bg-violet-600'
              : tone === 'amber'
                ? 'bg-amber-600'
                : tone === 'rose'
                  ? 'bg-rose-600'
                  : tone === 'emerald'
                    ? 'bg-emerald-600'
                    : 'bg-teal-600'
        return (
          <div key={i} className="flex items-start gap-0">
            <div className="flex flex-col items-center w-8 shrink-0">
              <div
                className={`w-3 h-3 rounded-full ${dotColor} ring-2 ring-white mt-3.5`}
                style={{ boxShadow: '0 0 0 2px currentColor' }}
              />
              {i < items.length - 1 && (
                <div className="w-0.5 bg-stone-200 flex-1 min-h-5" />
              )}
            </div>
            <div className="py-2.5 pl-4 flex-1">
              <div className="text-[13.5px] font-medium text-stone-900">
                {it.label}
              </div>
              {it.sub && (
                <div className="text-[12.5px] text-stone-500 mt-0.5">{it.sub}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StateFlow({ states }: { states: { label: string; tone: Tone }[] }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6 mb-5">
      <div className="flex flex-wrap gap-2 items-center">
        {states.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold ring-1 ring-inset ${TONE_RING[s.tone]}`}
            >
              {s.label}
            </span>
            {i < states.length - 1 && <span className="text-stone-400">→</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Steps + Checklist ----------

function Steps({ items }: { items: { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="space-y-3 my-4">
      {items.map((it, i) => (
        <li
          key={i}
          className="relative pl-14 rounded-xl border border-stone-200 bg-white p-4"
        >
          <span className="absolute left-3.5 top-3.5 w-8 h-8 rounded-full bg-teal-700 text-white font-bold text-[12px] flex items-center justify-center">
            {i + 1}
          </span>
          <div className="text-[14.5px] font-semibold text-stone-900">{it.title}</div>
          <div className="text-[13.5px] text-stone-700 leading-relaxed mt-1">
            {it.body}
          </div>
        </li>
      ))}
    </ol>
  )
}

function Checklist({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 my-3">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-stone-700 leading-relaxed">
          <span className="text-teal-700 font-bold mt-0.5 shrink-0">✓</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

// ---------- Tables ----------

function DataTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: React.ReactNode[][]
}) {
  return (
    <div className="overflow-x-auto rounded-lg">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="bg-stone-100 px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.5px] text-stone-500 border-b-2 border-stone-200"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-stone-50 transition-colors">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-4 py-2.5 border-b border-stone-100 text-stone-700 align-top"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[12px] bg-stone-100 px-1.5 py-0.5 rounded text-violet-700">
      {children}
    </code>
  )
}

// ---------- Role matrix ----------

function RoleMatrix({
  roles,
  rows,
}: {
  roles: string[]
  rows: { module: string; allow: ('full' | 'read' | 'limited' | 'none')[] }[]
}) {
  return (
    <div className="rounded-xl overflow-hidden shadow-sm border border-stone-200 my-4">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr>
            <th className="bg-stone-800 text-white px-3 py-2.5 text-left font-semibold text-[11.5px] whitespace-nowrap">
              Module
            </th>
            {roles.map((r) => (
              <th
                key={r}
                className="bg-stone-900 text-white px-3 py-2.5 text-center font-semibold text-[11.5px] whitespace-nowrap"
              >
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-teal-50 transition-colors">
              <td className="bg-stone-50 px-3 py-2 font-semibold text-stone-900 border-b border-r border-stone-100">
                {row.module}
              </td>
              {row.allow.map((a, j) => (
                <td
                  key={j}
                  className="px-3 py-2 text-center border-b border-r last:border-r-0 border-stone-100"
                >
                  {a === 'full' && (
                    <span className="text-emerald-700 font-bold">◉ Full</span>
                  )}
                  {a === 'read' && (
                    <span className="text-blue-700">◐ Read</span>
                  )}
                  {a === 'limited' && (
                    <span className="text-amber-700">◔ Limited</span>
                  )}
                  {a === 'none' && <span className="text-stone-300">○</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Sprint-style card ----------

function SprintCard({
  num,
  title,
  tags,
  tone,
}: {
  num: string
  title: string
  tags: string[]
  tone: Tone
}) {
  const stripe =
    tone === 'blue'
      ? 'before:bg-blue-500'
      : tone === 'violet'
        ? 'before:bg-violet-500'
        : tone === 'amber'
          ? 'before:bg-amber-500'
          : tone === 'rose'
            ? 'before:bg-rose-500'
            : 'before:bg-teal-500'
  return (
    <div
      className={`relative border-[1.5px] border-stone-200 rounded-xl px-5 py-4 bg-white overflow-hidden before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-0.75 ${stripe}`}
    >
      <div className="text-[11px] font-bold uppercase tracking-[1px] text-stone-500 mb-1.5">
        {num}
      </div>
      <div className="text-[13px] font-semibold text-stone-900 leading-snug mb-3">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t, i) => (
          <Badge key={i} tone={tone}>
            {t}
          </Badge>
        ))}
      </div>
    </div>
  )
}

// ---------- Wide card ----------

function WideCard({
  title,
  rightBadge,
  children,
}: {
  title: string
  rightBadge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden mb-6">
      <div className="bg-stone-50 px-7 py-4 border-b border-stone-200 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-stone-900">{title}</h3>
        {rightBadge}
      </div>
      <div className="px-7 py-6">{children}</div>
    </div>
  )
}

// ---------- Architecture diagram ----------

function ArchLayer({
  label,
  boxes,
}: {
  label: string
  boxes: { icon: React.ComponentType<{ className?: string }>; label: string; tone: Tone }[]
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[1.2px] text-stone-500 mb-3">
        <span>{label}</span>
        <span className="flex-1 h-px bg-stone-200" />
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        {boxes.map((b, i) => {
          const Icon = b.icon
          return (
            <div
              key={i}
              className={`rounded-lg ring-[1.5px] ring-inset px-4 py-3 min-w-32 text-center flex flex-col items-center gap-1.5 ${TONE_RING[b.tone]}`}
            >
              <Icon className="w-5 h-5" />
              <div className="text-[12px] font-medium">{b.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- FAQ accordion ----------

function Faq({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="my-4 rounded-xl border border-stone-200 overflow-hidden divide-y divide-stone-200 bg-white">
      {items.map((it, i) => (
        <details key={i} className="group">
          <summary className="cursor-pointer list-none px-5 py-3.5 hover:bg-stone-50 flex items-center justify-between gap-3 text-[13.5px] font-semibold text-stone-900">
            <span>{it.q}</span>
            <ChevronRight className="w-4 h-4 text-stone-400 transition-transform group-open:rotate-90" />
          </summary>
          <div className="px-5 pb-4 text-[13.5px] text-stone-700 leading-relaxed">
            {it.a}
          </div>
        </details>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// SECTION CONTENT — Radsting POS user-facing knowledge
// ─────────────────────────────────────────────────────────────────────

const Sec01 = (
  <>
    <SectionHeader
      num="01"
      icon={Rocket}
      title="Getting Started"
      description="From first sign-in to ringing up your first sale — everything to set up Radsting POS for your store in under 30 minutes."
      tone="teal"
    />

    <HighlightBox title="What this guide is for">
      You&rsquo;ve just been handed Radsting POS by your software vendor. This page walks
      you through the very first login, the layout of the app, and the six things to
      configure before your team starts billing customers.
    </HighlightBox>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
      <KpiCard label="Setup time" value="~30 min" sub="Profile + first product" icon={Zap} />
      <KpiCard label="Required" value="GSTIN" sub="State code drives tax split" icon={Receipt} />
      <KpiCard label="First user" value="Admin" sub="Created by your vendor" icon={ShieldCheck} />
    </div>

    <SubHeader>First sign-in</SubHeader>
    <p className="text-[14px] text-stone-700 leading-relaxed">
      Open the link your vendor sent — typically <Mono>your-store.radsting.com</Mono>.
      Sign in with the email and password they shared. Once you&rsquo;re in, change your
      password from the user menu in the top-right corner.
    </p>

    <Checklist
      items={[
        <>Your role is one of <Badge tone="teal">admin</Badge> <Badge tone="blue">manager</Badge> <Badge tone="amber">cashier</Badge> <Badge tone="violet">accountant</Badge> <Badge tone="slate">ca</Badge>.</>,
        <>If your subscription has expired, a full-screen renewal notice appears instead of the dashboard.</>,
        <>Three failed logins in a row will lock the account for 15 minutes.</>,
      ]}
    />

    <SubHeader>The six-step setup checklist</SubHeader>
    <Steps
      items={[
        {
          title: 'Store profile',
          body: (
            <>
              <b>Settings → Store profile.</b> Fill in name, GSTIN, state code (2 digits — drives the
              CGST/SGST vs IGST split on every bill), phone, address, and invoice prefix
              (default <Mono>INV</Mono>).
            </>
          ),
        },
        {
          title: 'Logo',
          body: (
            <>
              <b>Settings → Logo.</b> Upload a PNG under 512 KB. Prints on every bill and shows on the public bill page.
            </>
          ),
        },
        {
          title: 'GST registration',
          body: (
            <>
              <b>Settings → GST.</b> Tell Radsting if your store is GST-registered or not. Unregistered
              stores issue a bill of supply (no tax components).
            </>
          ),
        },
        {
          title: 'First product',
          body: (
            <>
              <b>Inventory → Add product.</b> Name, SKU, HSN (mandatory and verified),
              GST rate, MRP, selling price, opening stock.
            </>
          ),
        },
        {
          title: 'Bank account',
          body: (
            <>
              <b>Books → Accounts.</b> Add your specific bank so it appears in payment dropdowns. Standard accounts (Cash, Sales, GST) are pre-created.
            </>
          ),
        },
        {
          title: 'Test sale',
          body: (
            <>
              <b>POS → scan the test product → Save & Print.</b> Verify the invoice
              prints and the number starts at 1.
            </>
          ),
        },
      ]}
    />

    <InfoBox tone="amber" title="Before you go live">
      Run three test sales — one cash, one UPI, one credit — and verify the ledger
      entries under Books → Day Book. Every sale must show equal debits and credits.
    </InfoBox>
  </>
)

const Sec02 = (
  <>
    <SectionHeader
      num="02"
      icon={ScanLine}
      title="POS &amp; Billing"
      description="The transactional heart of Radsting — barcode lookup, cart, split payment, atomic commit, instant print."
      tone="blue"
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-5">
      <KpiCard label="Lookup" value="<50ms" sub="Cache + DB fallback" />
      <KpiCard label="Sale commit" value="<500ms" sub="P95 atomic write" />
      <KpiCard label="Tender modes" value="5" sub="Cash · UPI · Card · Credit · Loyalty" />
      <KpiCard label="Print formats" value="2" sub="80mm + A4" />
    </div>

    <SubHeader>The billing flow</SubHeader>
    <FlowLinear
      title="Sale lifecycle"
      steps={[
        { label: 'Lookup', sub: 'barcode / SKU', tone: 'blue' },
        { label: 'Cart', sub: 'add + discount', tone: 'teal' },
        { label: 'Customer', sub: 'walk-in or saved', tone: 'violet' },
        { label: 'Tender', sub: 'split allowed', tone: 'amber' },
        { label: 'Save', sub: 'stock + ledger + GST', tone: 'rose' },
        { label: 'Print + share', sub: 'PDF + WhatsApp', tone: 'emerald' },
      ]}
    />

    <SubHeader>Walk-in vs saved customer</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <Card accent="slate">
        <CardTitle>Walk-in</CardTitle>
        <Checklist
          items={[
            'No customer info captured',
            'Cash / UPI / Card only',
            'No credit sales',
            'No warranty items allowed',
          ]}
        />
      </Card>
      <Card accent="teal">
        <CardTitle>Saved customer</CardTitle>
        <Checklist
          items={[
            'Phone-based upsert',
            'Credit sales tracked',
            'Warranty register linked to phone',
            'WhatsApp / email auto-share',
          ]}
        />
      </Card>
    </div>

    <SubHeader>Returns &amp; voids</SubHeader>
    <FlowVertical
      items={[
        {
          label: 'Return',
          sub: 'Open the original bill → Return. Pick items + qty. Stock returns, money refunded. Original bill stays untouched.',
          tone: 'amber',
        },
        {
          label: 'Void',
          sub: 'Admin only. Marks the entire bill voided and reverses every entry. Requires a written reason.',
          tone: 'rose',
        },
      ]}
    />

    <InfoBox tone="amber" title="A saved bill cannot be edited">
      Mistakes are corrected by Return (item level) or Void (whole bill). Both create
      new records that link back. This keeps your accounts and stock audit-clean.
    </InfoBox>

    <Faq
      items={[
        {
          q: 'Scanner reads but nothing happens.',
          a: 'Click the search box first (or press F2) so it has keyboard focus, then scan again.',
        },
        {
          q: 'Customer wants no GST on the bill.',
          a: 'GST is set per product. If you sell zero-GST items, set the rate to 0 in Inventory.',
        },
        {
          q: 'Cash drawer didn\'t open.',
          a: 'Hardware-side — your printer driver opens it. Enable "kick drawer on print" in the printer software.',
        },
      ]}
    />
  </>
)

const Sec03 = (
  <>
    <SectionHeader
      num="03"
      icon={Package}
      title="Inventory"
      description="Stock master, batches, warranties, low-stock alerts, inter-store transfers. Every quantity change creates an immutable audit row."
      tone="violet"
    />

    <SubHeader>Product master fields</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
      <Card accent="violet">
        <CardTitle>Identity</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Name, SKU (unique per store), barcode, brand, category, unit (pieces, kg, litres).
          Duplicate SKUs are blocked at save.
        </p>
      </Card>
      <Card accent="teal">
        <CardTitle>Pricing</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Purchase price, selling price, MRP. MRP &lt; selling triggers a warning.
        </p>
      </Card>
      <Card accent="amber">
        <CardTitle>Tax</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          HSN (mandatory, verified against master), GST rate (0/5/12/18/28%), tax type.
        </p>
      </Card>
      <Card accent="emerald">
        <CardTitle>Tracking</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Stock, min/max thresholds, reorder qty, warranty months, batch + expiry.
        </p>
      </Card>
    </div>

    <SubHeader>Stock movement audit</SubHeader>
    <DataTable
      headers={['Movement type', 'When it fires', 'Reference']}
      rows={[
        [<Badge tone="emerald" key="1">in</Badge>, 'GRN (goods receipt) from a PO', 'Purchase ID'],
        [<Badge tone="rose" key="2">out</Badge>, 'A sale rings up', 'Sale ID'],
        [<Badge tone="amber" key="3">adjustment</Badge>, 'Manual correction with a reason', 'Audit log entry'],
        [<Badge tone="violet" key="4">transfer</Badge>, 'Inter-branch dispatch / receipt', 'Transfer ID'],
      ]}
    />

    <InfoBox tone="rose" title="Negative stock is blocked">
      The Inventory engine validates stock before every sale commit. To allow oversell
      (back-orders), admin can flip the switch in <b>Settings → Preferences</b>.
    </InfoBox>

    <SubHeader>Inter-store transfer flow</SubHeader>
    <FlowVertical
      items={[
        { label: 'Initiate at source', sub: 'Source store creates the transfer. Stock reserved, not deducted yet.', tone: 'violet' },
        { label: 'Dispatch', sub: 'Mark dispatched. Stock deducted from source. Movement logged.', tone: 'blue' },
        { label: 'Receipt', sub: 'Destination confirms. Stock added there. Movement logged.', tone: 'emerald' },
      ]}
    />
  </>
)

const Sec04 = (
  <>
    <SectionHeader
      num="04"
      icon={Receipt}
      title="Sales History"
      description="Every bill ever rung up. Searchable, printable, shareable. Never editable."
      tone="emerald"
    />

    <SubHeader>Share channels</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
      <Card accent="emerald">
        <CardTitle>WhatsApp</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          If WhatsApp Cloud API is configured, one click sends directly. Otherwise opens <Mono>wa.me</Mono> with a pre-filled message.
        </p>
      </Card>
      <Card accent="blue">
        <CardTitle>Public link</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Every bill has an unguessable share token. Customer opens <Mono>/bill/&lt;token&gt;</Mono> from any device — no login needed.
        </p>
      </Card>
      <Card accent="violet">
        <CardTitle>Email / QR / Copy</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Built-in QR code, copy-to-clipboard, and <Mono>mailto:</Mono> email — all client-side, no extra setup.
        </p>
      </Card>
    </div>

    <InfoBox tone="blue" title="The public link is safe to share">
      The token is unguessable. Only people who have the link can see the bill. The
      customer doesn&rsquo;t need a Radsting account.
    </InfoBox>
  </>
)

const Sec05 = (
  <>
    <SectionHeader
      num="05"
      icon={Truck}
      title="Purchases"
      description="POs, multi-GRN receipts, partial supplier payments. Atomic stock + ledger + input GST on every receipt."
      tone="amber"
    />

    <SubHeader>The PO lifecycle</SubHeader>
    <StateFlow
      states={[
        { label: 'Draft', tone: 'slate' },
        { label: 'Ordered', tone: 'blue' },
        { label: 'Partial', tone: 'amber' },
        { label: 'Received', tone: 'emerald' },
      ]}
    />
    <p className="text-[13px] text-stone-600 -mt-2 mb-4">
      Side exits: <Badge tone="slate">cancelled</Badge> (no receipts yet) and{' '}
      <Badge tone="violet">closed</Badge> (pre-close — accept the partial as final).
    </p>

    <SubHeader>What a GRN does atomically</SubHeader>
    <FlowVertical
      items={[
        { label: 'Stock-in', sub: 'product.stock += receivedQty; StockMovement row created.', tone: 'emerald' },
        { label: 'Ledger debit', sub: 'Purchase Expense (subtotal) + Input GST Credit (totalTax).', tone: 'blue' },
        { label: 'Ledger credit', sub: 'Sundry Creditors (grand total).', tone: 'amber' },
        { label: 'Supplier payable', sub: 'supplier.outstandingBalance += grand total.', tone: 'violet' },
        { label: 'PO update', sub: 'PO.receivedQty bumped; status set to partial or received.', tone: 'rose' },
      ]}
    />

    <SubHeader>Ancillary expenses on a GRN</SubHeader>
    <DataTable
      headers={['Type', 'Treatment', 'When to pick it']}
      rows={[
        ['Landed cost', 'Adds to product cost basis', 'Freight on a goods shipment'],
        ['Direct expense', 'Books to P&L', 'General labour, one-off costs'],
      ]}
    />

    <SubHeader>Outstanding reports</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <Card accent="amber">
        <CardTitle>By supplier</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Σ(orderedQty − receivedQty) × purchasePrice grouped by supplier. Direct analog of
          Tally&rsquo;s &ldquo;Order Outstanding by Supplier&rdquo;.
        </p>
      </Card>
      <Card accent="violet">
        <CardTitle>By item</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Pending quantity per product across all open POs, with reference numbers. Tells
          you exactly what to chase.
        </p>
      </Card>
    </div>
  </>
)

const Sec06 = (
  <>
    <SectionHeader
      num="06"
      icon={Users}
      title="Customers &amp; Suppliers"
      description="The address book + ledger view in one. Outstanding balances roll up automatically from every sale and payment."
      tone="blue"
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <Card accent="blue">
        <CardTitle>Customer master</CardTitle>
        <Checklist
          items={[
            'Phone is the unique key (drives upsert)',
            'Credit limit + current outstanding',
            'Loyalty points earned + redeemed',
            'Full ledger statement on the page',
          ]}
        />
      </Card>
      <Card accent="amber">
        <CardTitle>Supplier master</CardTitle>
        <Checklist
          items={[
            'State code drives CGST/SGST vs IGST',
            'Running payable balance',
            'PO history with received qty',
            'Payment + receipt ledger view',
          ]}
        />
      </Card>
    </div>

    <InfoBox tone="amber" title="Always set supplier state code">
      It decides the tax split on input GST credit. Wrong state code = wrong GSTR-3B ITC
      claim.
    </InfoBox>
  </>
)

const Sec07 = (
  <>
    <SectionHeader
      num="07"
      icon={BookText}
      title="Books — Accounting"
      description="Full Tally-grade double-entry. Chart of accounts, vouchers, trial balance, P&L, balance sheet, day book."
      tone="emerald"
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-5">
      <KpiCard label="Voucher types" value="4" sub="Pmt / Rcpt / Jrnl / Contra" />
      <KpiCard label="Invariant" value="Dr = Cr" sub="Per voucher, always" />
      <KpiCard label="Statements" value="6" sub="TB · P&L · BS · CF · Daybook · BankRec" />
      <KpiCard label="Auto-posted" value="100%" sub="Sales + Purchases + Payments" />
    </div>

    <SubHeader>Auto-generated journal map</SubHeader>
    <DataTable
      headers={['Business event', 'Debit', 'Credit']}
      rows={[
        ['Cash sale', <span className="text-emerald-700 font-mono text-[12px]" key="1">Cash A/c</span>, <span className="text-rose-700 font-mono text-[12px]" key="2">Sales Revenue + GST Output</span>],
        ['UPI / card sale', <span className="text-emerald-700 font-mono text-[12px]" key="3">Bank A/c</span>, <span className="text-rose-700 font-mono text-[12px]" key="4">Sales Revenue + GST Output</span>],
        ['Credit sale', <span className="text-emerald-700 font-mono text-[12px]" key="5">Sundry Debtors</span>, <span className="text-rose-700 font-mono text-[12px]" key="6">Sales Revenue + GST Output</span>],
        ['Customer payment', <span className="text-emerald-700 font-mono text-[12px]" key="7">Cash / Bank</span>, <span className="text-rose-700 font-mono text-[12px]" key="8">Sundry Debtors</span>],
        ['Purchase GRN', <span className="text-emerald-700 font-mono text-[12px]" key="9">Purchase Expense + Input GST</span>, <span className="text-rose-700 font-mono text-[12px]" key="10">Sundry Creditors</span>],
        ['Supplier payment', <span className="text-emerald-700 font-mono text-[12px]" key="11">Sundry Creditors</span>, <span className="text-rose-700 font-mono text-[12px]" key="12">Cash / Bank</span>],
      ]}
    />

    <SubHeader>Standard statements</SubHeader>
    <FlowVertical
      items={[
        { label: 'Trial Balance', sub: 'Opening + Σ Dr + Σ Cr + closing per account. Σ total Dr == Σ total Cr is the sanity check.', tone: 'emerald' },
        { label: 'Profit & Loss', sub: 'Σ Income − Σ Expense = Net Profit (or Loss) for any date range.', tone: 'blue' },
        { label: 'Balance Sheet', sub: 'Total Assets == Total Liabilities + Retained Earnings (P&L up to cutoff).', tone: 'violet' },
        { label: 'Day Book', sub: 'Every entry made in chronological order — Tally\'s Daybook equivalent.', tone: 'amber' },
        { label: 'Bank Reconciliation', sub: 'Upload statement, naive amount-match within ₹0.01 against ledger.', tone: 'rose' },
      ]}
    />

    <InfoBox tone="teal" title="Hand this to your CA at year-end">
      Export the Trial Balance, P&amp;L and Balance Sheet for the financial year (1 April
      – 31 March). Your CA can prepare the IT return directly from these.
    </InfoBox>
  </>
)

const Sec08 = (
  <>
    <SectionHeader
      num="08"
      icon={Calculator}
      title="GST — Returns &amp; E-Invoice"
      description="GSTR-1, GSTR-3B, HSN summary, JSON export. Optional GSP integration for B2B e-invoice + IRN."
      tone="rose"
    />

    <SubHeader>GSTR-1 categories</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <Badge tone="rose">B2B — to GSTIN-registered</Badge>
      <Badge tone="amber">B2C Large — unregistered, &gt;₹2.5L</Badge>
      <Badge tone="blue">B2C Small — unregistered, ≤₹2.5L</Badge>
      <Badge tone="violet">CDNR — credit/debit to registered</Badge>
      <Badge tone="orange">CDNUR — credit/debit to unregistered</Badge>
      <Badge tone="emerald">HSN summary — quantity + tax</Badge>
    </div>

    <SubHeader>The monthly filing flow</SubHeader>
    <Steps
      items={[
        { title: 'Open GST → For the month', body: 'Pick the month you\'re filing for (usually the previous calendar month).' },
        { title: 'Review GSTR-1', body: 'Outward supply — every B2B bill, B2C summary, and credit/debit notes. Verify the totals against your sales for the month.' },
        { title: 'Review GSTR-3B', body: 'Summary return: total output tax, input tax credit, net payable. Computed from sales + purchases.' },
        { title: 'Download JSON', body: 'Upload to the GST portal directly — no manual entry needed.' },
        { title: 'Pay and file', body: 'Pay the net tax on the portal, then file. Done.' },
      ]}
    />

    <SubHeader>E-invoice / IRN flow</SubHeader>
    <FlowLinear
      steps={[
        { label: 'B2B sale saved', tone: 'blue' },
        { label: 'IRN request', sub: 'JSON to GSP', tone: 'violet' },
        { label: 'NIC validates', tone: 'amber' },
        { label: 'IRN + QR returned', tone: 'emerald' },
        { label: 'Bill printed with IRN+QR', tone: 'teal' },
      ]}
    />

    <InfoBox tone="rose" title="Mandatory when turnover > ₹5 Cr">
      Every B2B bill must be reported to the NIC IRP before issuance. Set GSP credentials
      under <b>Settings → E-Invoice</b> and the whole pipeline runs automatically.
    </InfoBox>
  </>
)

const Sec09 = (
  <>
    <SectionHeader
      num="09"
      icon={FileBarChart}
      title="Reports &amp; Insights"
      description="Pre-aggregated, cached, and built to answer the questions an owner actually asks."
      tone="orange"
    />

    <SubHeader>The eight standard reports</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <Card accent="orange">
        <CardTitle>Dashboard KPIs</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Today / week / month sales, gross profit, top SKUs, low-stock count. Cached
          for ~5 min for speed.
        </p>
      </Card>
      <Card accent="blue">
        <CardTitle>Sales report</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Filterable by date range, customer, product, payment mode. Excel + CSV export.
        </p>
      </Card>
      <Card accent="emerald">
        <CardTitle>Profit report</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Revenue − COGS − discount = Gross. Per-SKU and per-category margin.
        </p>
      </Card>
      <Card accent="violet">
        <CardTitle>Stock valuation</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Cost-basis or MRP-basis snapshot of every SKU&rsquo;s stock value.
        </p>
      </Card>
      <Card accent="amber">
        <CardTitle>Purchase report</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Date-range PO + GRN summary, supplier-wise spend, top suppliers.
        </p>
      </Card>
      <Card accent="rose">
        <CardTitle>Customer aging</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Outstanding receivables bucketed 0-30 / 31-60 / 61-90 / 90+ days.
        </p>
      </Card>
    </div>
  </>
)

const Sec10 = (
  <>
    <SectionHeader
      num="10"
      icon={Building2}
      title="Branches"
      description="Multi-store SaaS. One organisation, many branches, hard-isolated at the data layer."
      tone="teal"
    />

    <SubHeader>What&rsquo;s scoped vs global</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <Card accent="teal">
        <CardTitle>Per branch (walled off)</CardTitle>
        <Checklist
          items={[
            'Products + stock',
            'Sales + customers',
            'Purchases + suppliers',
            'Ledger entries + vouchers',
            'GST reports + invoice counter',
          ]}
        />
      </Card>
      <Card accent="violet">
        <CardTitle>Org-wide</CardTitle>
        <Checklist
          items={[
            'Users (with allowed branches[])',
            'Subscription / billing',
            'Audit log',
            'Support tickets',
            'Admin can pivot between branches',
          ]}
        />
      </Card>
    </div>

    <InfoBox tone="rose" title="A cashier in Branch A cannot ever see Branch B's data">
      Branch ID is injected from the login token, not from request parameters. Even
      tampering with the URL gives nothing.
    </InfoBox>
  </>
)

const Sec11 = (
  <>
    <SectionHeader
      num="11"
      icon={Users}
      title="Users &amp; Roles"
      description="Five role types, per-user permission overrides, immutable audit log of every privileged action."
      tone="violet"
    />

    <SubHeader>Role matrix</SubHeader>
    <RoleMatrix
      roles={['Admin', 'Manager', 'Cashier', 'Accountant', 'CA']}
      rows={[
        { module: 'Create sale', allow: ['full', 'full', 'full', 'none', 'none'] },
        { module: 'Void sale', allow: ['full', 'full', 'none', 'none', 'none'] },
        { module: 'Manage products', allow: ['full', 'full', 'none', 'none', 'read'] },
        { module: 'View reports', allow: ['full', 'full', 'limited', 'full', 'read'] },
        { module: 'Manage users', allow: ['full', 'none', 'none', 'none', 'none'] },
        { module: 'GST returns', allow: ['full', 'read', 'none', 'full', 'read'] },
        { module: 'Purchase entry', allow: ['full', 'full', 'none', 'read', 'read'] },
        { module: 'Accounting / vouchers', allow: ['full', 'read', 'none', 'full', 'read'] },
        { module: 'Multi-branch config', allow: ['full', 'none', 'none', 'none', 'none'] },
      ]}
    />

    <SubHeader>Per-user overrides</SubHeader>
    <p className="text-[14px] text-stone-700 leading-relaxed">
      Beyond the role default, each user has individual flags — most importantly{' '}
      <Mono>canDiscount</Mono>, <Mono>maxDiscountPct</Mono>, <Mono>canVoidSale</Mono>. Use
      these to grant a senior cashier discount authority without making them a manager.
    </p>

    <InfoBox tone="blue" title="Audit log is permanent">
      Every privileged action — bill void, manual stock adjustment, user creation, role
      change, password reset — is logged with user, IP, time, and full before/after diff.
      Entries cannot be deleted.
    </InfoBox>
  </>
)

const Sec12 = (
  <>
    <SectionHeader
      num="12"
      icon={CreditCard}
      title="Subscription &amp; Billing"
      description="Plan tier, user count add-ons, trial, payment history. Self-service from the tenant side; managed from the vendor side."
      tone="blue"
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-5">
      <KpiCard label="Trial" value="14 days" sub="Full feature access" />
      <KpiCard label="Plans" value="3" sub="Starter / Pro / Enterprise" />
      <KpiCard label="User addon" value="₹X/user" sub="Above plan default" />
      <KpiCard label="Grace" value="3 days" sub="After expiry" />
    </div>

    <SubHeader>What happens at expiry</SubHeader>
    <FlowVertical
      items={[
        { label: 'T-3 days', sub: 'Yellow banner across every page. Optional WhatsApp reminder.', tone: 'amber' },
        { label: 'T-0 — Expiry day', sub: 'Red banner. Read-only mode begins — no new sales or purchases. Reports + history still accessible.', tone: 'rose' },
        { label: 'T+3 days', sub: 'Grace ends. Full-screen takeover at login with renewal instructions.', tone: 'rose' },
        { label: 'After renewal', sub: 'Vendor marks paid; access restored instantly without re-login.', tone: 'emerald' },
      ]}
    />
  </>
)

const Sec13 = (
  <>
    <SectionHeader
      num="13"
      icon={SettingsIcon}
      title="Settings"
      description="Store profile, GST registration, invoice prefix, logo, WhatsApp Cloud API, e-invoice GSP, loyalty, T&C."
      tone="slate"
    />

    <SubHeader>The settings tabs</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
      <Card><CardTitle>Store profile</CardTitle><p className="text-[13px] text-stone-700">Name, GSTIN, address, phone, invoice prefix.</p></Card>
      <Card><CardTitle>Logo</CardTitle><p className="text-[13px] text-stone-700">PNG up to 512 KB. Prints on every invoice.</p></Card>
      <Card><CardTitle>GST</CardTitle><p className="text-[13px] text-stone-700">Registration type, composition, tax mode.</p></Card>
      <Card><CardTitle>Preferences</CardTitle><p className="text-[13px] text-stone-700">Negative stock, default warranty, loyalty, print copies.</p></Card>
      <Card><CardTitle>WhatsApp</CardTitle><p className="text-[13px] text-stone-700">Meta Cloud API credentials. Test button verifies.</p></Card>
      <Card><CardTitle>E-Invoice</CardTitle><p className="text-[13px] text-stone-700">GSP endpoint + clientId / secret. Test connection.</p></Card>
    </div>

    <InfoBox tone="rose" title="Secrets are write-only">
      WhatsApp tokens, GSP secrets, payment-gateway keys — once saved, the API returns
      them masked as <Mono>••••••••&lt;last4&gt;</Mono>. Submitting the masked value back
      never overwrites the real one.
    </InfoBox>
  </>
)

const Sec14 = (
  <>
    <SectionHeader
      num="14"
      icon={MessageCircle}
      title="WhatsApp Cloud API"
      description="Automated bill delivery from the POS once Meta Cloud API credentials are saved."
      tone="emerald"
    />

    <SubHeader>Two modes</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <Card accent="slate">
        <CardTitle>wa.me mode (default)</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          No API setup. Click WhatsApp → browser opens <Mono>wa.me/&lt;phone&gt;</Mono>
          with pre-filled message. Cashier taps Send. Free, manual.
        </p>
      </Card>
      <Card accent="emerald">
        <CardTitle>API mode</CardTitle>
        <p className="text-[13.5px] text-stone-700 leading-relaxed">
          Credentials saved. Click WhatsApp → server POSTs directly to Meta&rsquo;s Graph
          API. Customer receives the bill instantly. No cashier intervention.
        </p>
      </Card>
    </div>

    <SubHeader>Setup</SubHeader>
    <Steps
      items={[
        { title: 'Sign up at Meta for Business', body: 'Go to business.facebook.com, create a Business account, add a phone number for WhatsApp.' },
        { title: 'Get credentials', body: 'Meta Business → WhatsApp → API Setup. Copy the Phone Number ID and Access Token.' },
        { title: 'Paste into Radsting', body: 'Settings → WhatsApp → paste both values. Tap Test with your own number.' },
        { title: 'Flip Enabled', body: 'Every WhatsApp click in the POS now sends directly. No manual step from the cashier.' },
      ]}
    />

    <InfoBox tone="amber" title="The 24-hour rule">
      WhatsApp only lets you send plain text within 24 hours of the customer&rsquo;s last
      message. Outside that window you must use a pre-approved template.
    </InfoBox>
  </>
)

const Sec15 = (
  <>
    <SectionHeader
      num="15"
      icon={HelpCircle}
      title="Help &amp; Support"
      description="Raise a ticket directly to your vendor. Threaded conversation, priority levels, full attachment support."
      tone="blue"
    />

    <SubHeader>Ticket types</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
      <Card accent="rose"><CardTitle>Bug</CardTitle><p className="text-[13.5px] text-stone-700 leading-relaxed">Something broke. Include error + steps to reproduce.</p></Card>
      <Card accent="violet"><CardTitle>Feature request</CardTitle><p className="text-[13.5px] text-stone-700 leading-relaxed">Wishlist. Vendor reviews periodically.</p></Card>
      <Card accent="emerald"><CardTitle>Billing</CardTitle><p className="text-[13.5px] text-stone-700 leading-relaxed">Subscription, plan change, invoice copies.</p></Card>
    </div>

    <SubHeader>Priority &amp; response SLA</SubHeader>
    <DataTable
      headers={['Priority', 'Meaning', 'First response']}
      rows={[
        [<Badge tone="rose" key="1">P1</Badge>, 'Production down — cannot bill', '1 working hour'],
        [<Badge tone="amber" key="2">P2</Badge>, 'Major function broken', '4 working hours'],
        [<Badge tone="blue" key="3">P3</Badge>, 'Minor or cosmetic', '1 working day'],
        [<Badge tone="slate" key="4">P4</Badge>, 'Feature request', '3 working days'],
      ]}
    />
  </>
)

const Sec16 = (
  <>
    <SectionHeader
      num="16"
      icon={KeyRound}
      title="Keyboard Shortcuts"
      description="Cashier-speed primitives. Print this section and stick it next to the till."
      tone="violet"
    />

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 my-4">
      <Card>
        <CardTitle>POS — main keys</CardTitle>
        <div className="space-y-2 mt-2">
          {[
            ['F2', 'Focus the barcode / search box'],
            ['F3', 'Pick customer (or set walk-in)'],
            ['F4', 'Apply discount'],
            ['F8', 'Open payment screen'],
            ['F9', 'Save the bill (no print)'],
            ['F10', 'Save & Print'],
            ['Esc', 'Cancel cart (with confirmation)'],
          ].map(([k, d]) => (
            <div key={k} className="flex items-center gap-3 py-1.5 border-b last:border-b-0 border-stone-100">
              <kbd className="font-mono text-[11.5px] bg-stone-50 border border-stone-300 rounded shadow-sm px-2 py-0.5 min-w-12 text-center">
                {k}
              </kbd>
              <span className="text-[13.5px] text-stone-700 flex-1">{d}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Inside the cart</CardTitle>
        <div className="space-y-2 mt-2">
          {[
            ['+ / −', 'Quantity up or down by 1'],
            ['Del', 'Remove the highlighted line'],
            ['Ctrl+D', 'Discount on the highlighted line'],
            ['Tab', 'Move to the next field'],
          ].map(([k, d]) => (
            <div key={k} className="flex items-center gap-3 py-1.5 border-b last:border-b-0 border-stone-100">
              <kbd className="font-mono text-[11.5px] bg-stone-50 border border-stone-300 rounded shadow-sm px-2 py-0.5 min-w-12 text-center">
                {k}
              </kbd>
              <span className="text-[13.5px] text-stone-700 flex-1">{d}</span>
            </div>
          ))}
        </div>
        <CardTitle>Navigation (global)</CardTitle>
        <div className="space-y-2 mt-2">
          {[
            ['G P', 'Go to POS'],
            ['G S', 'Go to Sales History'],
            ['G I', 'Go to Inventory'],
            ['Ctrl+K', 'Open command palette'],
            ['?', 'Toggle this shortcut sheet'],
          ].map(([k, d]) => (
            <div key={k} className="flex items-center gap-3 py-1.5 border-b last:border-b-0 border-stone-100">
              <kbd className="font-mono text-[11.5px] bg-stone-50 border border-stone-300 rounded shadow-sm px-2 py-0.5 min-w-12 text-center">
                {k}
              </kbd>
              <span className="text-[13.5px] text-stone-700 flex-1">{d}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </>
)

const Sec17 = (
  <>
    <SectionHeader
      num="17"
      icon={AlertCircle}
      title="Troubleshooting"
      description="The most common problems and how to fix each one."
      tone="rose"
    />

    <Faq
      items={[
        { q: 'I can\'t log in — "wrong email or password".', a: <>Check Caps Lock. If still wrong, ask your admin to reset under <b>Org Admin → Users</b>. Super-admin accounts must use <Mono>/admin</Mono> instead.</> },
        { q: 'Bill saved but didn\'t print.', a: 'Browser blocked the print pop-up. Open the bill from Sales History and click Print — the bill is already saved.' },
        { q: 'Stock looks wrong after a return.', a: <>Open <b>Inventory → Movements</b> for that product. Every change is listed with the reference. If the entry is there but stock is off, raise a ticket with the bill number.</> },
        { q: 'GSTR-1 totals don\'t match my Tally export.', a: 'Tally aggregates per invoice; Radsting per line. The bill totals are identical. HSN-wise breakup may differ — Radsting\'s matches what the portal expects.' },
        { q: 'WhatsApp says "recipient is not a WhatsApp account".', a: 'Phone valid format but customer doesn\'t use WhatsApp. Bill is still saved.' },
        { q: 'E-Invoice IRN request times out.', a: <>GSP or NIC portal might be down. Bill is saved. Radsting retries automatically — check <b>Settings → E-Invoice → Failed queue</b>.</> },
        { q: 'Dashboard KPIs look stale.', a: 'Redis-cached at 5-min TTL. Hard-refresh (Ctrl+Shift+R) or just wait. Reports / Sales tabs are always live.' },
        { q: '"Session expired" every few minutes.', a: 'Multiple tabs open with conflicting logins. Close extras and log back in.' },
      ]}
    />

    <InfoBox tone="teal" title="Still stuck?">
      Raise a ticket from <b>Help &amp; Support</b> with the steps to reproduce and a
      screenshot. Your vendor sees it instantly.
    </InfoBox>
  </>
)

const Sec18 = (
  <>
    <SectionHeader
      num="18"
      icon={Calculator}
      title="Party Settlement"
      description="When the same business is BOTH your customer and your supplier, settle what they owe you against what you owe them — instead of moving cash both ways."
      tone="emerald"
    />

    <HighlightBox title="When you'd use this">
      You sell goods to <b>Sharma Traders</b> on credit (they owe you ₹40,000). You also
      buy from them (you owe them ₹25,000). Rather than them paying you ₹40,000 and you
      paying them ₹25,000, you offset the two: settle ₹25,000 against both, leaving
      Sharma Traders owing you a net ₹15,000. One entry, no cash moved.
    </HighlightBox>

    <SubHeader>How Radsting finds settlement candidates</SubHeader>
    <p className="text-[14px] text-stone-700 leading-relaxed">
      Open <b>Books → Party Settlement</b>. Radsting automatically scans for any party
      that exists as both a customer (with outstanding receivable) and a supplier (with
      outstanding payable), matching them by:
    </p>
    <FlowVertical
      items={[
        { label: '1. GSTIN match', sub: 'If the customer and supplier share the same GST number, they are the same legal entity. Strongest match.', tone: 'emerald' },
        { label: '2. Phone match', sub: 'If no GSTIN match, the same phone number on both records links them.', tone: 'blue' },
      ]}
    />
    <p className="text-[14px] text-stone-700 leading-relaxed">
      Each candidate row shows the receivable, the payable, the <b>suggested settlement</b>
      (the smaller of the two), and the <b>net</b> still owed after settling.
    </p>

    <SubHeader>Posting a settlement</SubHeader>
    <Steps
      items={[
        {
          title: 'Pick a matched pair',
          body: 'The list only shows parties who are both customer and supplier with dues on both sides. If a party isn\'t listed, they don\'t qualify (one side is zero, or no GSTIN/phone link).',
        },
        {
          title: 'Confirm the amount',
          body: 'The suggested amount is the smaller of receivable and payable — the most you can offset. You can settle less (a partial settlement), never more than either side\'s outstanding.',
        },
        {
          title: 'Post it',
          body: 'Radsting creates a Contra voucher (CON-…) and the matching ledger entries atomically — all-or-nothing.',
        },
      ]}
    />

    <SubHeader>What happens in the books</SubHeader>
    <p className="text-[14px] text-stone-700 leading-relaxed">
      A settlement is a contra entry — it moves the obligation, no cash involved:
    </p>
    <DataTable
      headers={['Side', 'Entry', 'Effect']}
      rows={[
        [
          'Supplier (payable)',
          <span className="text-emerald-700 font-mono text-[12px]" key="1">Dr Sundry Creditors</span>,
          'Reduces what you owe them',
        ],
        [
          'Customer (receivable)',
          <span className="text-rose-700 font-mono text-[12px]" key="2">Cr Sundry Debtors</span>,
          'Reduces what they owe you',
        ],
      ]}
    />
    <p className="text-[14px] text-stone-700 leading-relaxed">
      Both the customer&rsquo;s and the supplier&rsquo;s outstanding balances drop by the
      settled amount, and the per-party ledgers each get an entry referencing the
      contra voucher so the trail is auditable.
    </p>

    <InfoBox tone="amber" title="It only offsets — it doesn't collect cash">
      Settlement nets the two sides against each other. The remaining net balance still
      has to be collected (or paid) the normal way — record a customer payment or a
      supplier payment for whatever is left over.
    </InfoBox>

    <SubHeader>How it ties into aging</SubHeader>
    <p className="text-[14px] text-stone-700 leading-relaxed">
      After settling, the offset amount disappears from <b>Reports → Aging</b> on both
      the receivables and payables sides, because each party&rsquo;s outstanding has
      genuinely gone down. Only the net remainder keeps aging into the 0-30 / 31-60 /
      61-90 / 90+ buckets.
    </p>

    <Faq
      items={[
        {
          q: 'A party I know is both customer and supplier isn\'t in the list.',
          a: 'They only appear when BOTH sides have an outstanding balance > 0 AND they share a GSTIN or phone. Check that the customer record and supplier record carry the same GSTIN (or the same phone), and that both actually have dues.',
        },
        {
          q: 'Can I settle more than they owe me?',
          a: 'No. The amount is capped at the smaller of the receivable and payable. Settling the suggested amount zeroes out the smaller side completely.',
        },
        {
          q: 'Does this create a cash or bank entry?',
          a: 'No — it\'s a contra voucher (CON-…). No money moves. It only reduces the two outstanding balances against each other.',
        },
        {
          q: 'Can I reverse a settlement?',
          a: 'Vouchers are immutable. To undo one, post a journal voucher that reverses it (Dr Sundry Debtors, Cr Sundry Creditors for the same amount), or raise a support ticket.',
        },
      ]}
    />
  </>
)

// ─────────────────────────────────────────────────────────────────────
// Section catalogue + sidebar groups
// ─────────────────────────────────────────────────────────────────────

interface SectionDef {
  id: string
  num: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  group: 'start' | 'daily' | 'stock' | 'money' | 'org' | 'comms' | 'sub' | 'tips'
  content: React.ReactNode
}

const SECTIONS: SectionDef[] = [
  { id: 'getting-started', num: '01', title: 'Getting Started', icon: Rocket, group: 'start', content: Sec01 },
  { id: 'pos', num: '02', title: 'POS & Billing', icon: ScanLine, group: 'daily', content: Sec02 },
  { id: 'inventory', num: '03', title: 'Inventory', icon: Package, group: 'stock', content: Sec03 },
  { id: 'sales', num: '04', title: 'Sales History', icon: Receipt, group: 'daily', content: Sec04 },
  { id: 'purchases', num: '05', title: 'Purchases', icon: Truck, group: 'stock', content: Sec05 },
  { id: 'parties', num: '06', title: 'Customers & Suppliers', icon: Users, group: 'stock', content: Sec06 },
  { id: 'books', num: '07', title: 'Books — Accounting', icon: BookText, group: 'money', content: Sec07 },
  { id: 'gst', num: '08', title: 'GST & E-Invoice', icon: Calculator, group: 'money', content: Sec08 },
  { id: 'reports', num: '09', title: 'Reports & Insights', icon: FileBarChart, group: 'money', content: Sec09 },
  { id: 'branches', num: '10', title: 'Branches', icon: Building2, group: 'org', content: Sec10 },
  { id: 'users', num: '11', title: 'Users & Roles', icon: Users, group: 'org', content: Sec11 },
  { id: 'subscription', num: '12', title: 'Subscription', icon: CreditCard, group: 'sub', content: Sec12 },
  { id: 'settings', num: '13', title: 'Settings', icon: SettingsIcon, group: 'org', content: Sec13 },
  { id: 'whatsapp', num: '14', title: 'WhatsApp', icon: MessageCircle, group: 'comms', content: Sec14 },
  { id: 'help', num: '15', title: 'Help & Support', icon: HelpCircle, group: 'comms', content: Sec15 },
  { id: 'shortcuts', num: '16', title: 'Keyboard Shortcuts', icon: KeyRound, group: 'tips', content: Sec16 },
  { id: 'troubleshooting', num: '17', title: 'Troubleshooting', icon: AlertCircle, group: 'tips', content: Sec17 },
  { id: 'party-settlement', num: '18', title: 'Party Settlement', icon: Calculator, group: 'money', content: Sec18 },
]

const GROUPS: { id: SectionDef['group']; label: string }[] = [
  { id: 'start', label: 'Get Started' },
  { id: 'daily', label: 'Daily Operations' },
  { id: 'stock', label: 'Stock & Suppliers' },
  { id: 'money', label: 'Money & Compliance' },
  { id: 'org', label: 'Org Setup' },
  { id: 'comms', label: 'Communication' },
  { id: 'sub', label: 'Subscription' },
  { id: 'tips', label: 'Tips & Help' },
]

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

export default function DocumentationTab() {
  const [activeId, setActiveId] = useState<string>('getting-started')

  // Scroll-spy — highlight the section nearest the viewport top.
  useEffect(() => {
    const handler = () => {
      let bestId = SECTIONS[0].id
      let bestDistance = Infinity
      for (const s of SECTIONS) {
        const el = document.getElementById(`kb-${s.id}`)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const distance = Math.abs(rect.top - 120)
        if (rect.top < window.innerHeight && distance < bestDistance) {
          bestDistance = distance
          bestId = s.id
        }
      }
      setActiveId(bestId)
    }
    handler()
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const scrollTo = (id: string) => {
    setActiveId(id)
    const el = document.getElementById(`kb-${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Group sections for sidebar rendering.
  const grouped = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        items: SECTIONS.filter((s) => s.group === g.id),
      })).filter((g) => g.items.length > 0),
    [],
  )

  return (
    <div className="-mx-4 sm:-mx-6 bg-stone-50">
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-0">
        {/* ─────── Sidebar nav (sticky, contained) ─────── */}
        <aside className="hidden md:block">
          <div className="sticky top-0 max-h-screen overflow-y-auto bg-white border-r border-stone-200 py-7">
            <div className="px-6 pb-5 border-b border-stone-200 mb-4">
              <div className="font-serif text-[17px] font-extrabold text-teal-700 tracking-tight">
                Radsting POS
              </div>
              <div className="text-[10.5px] uppercase tracking-[0.8px] text-stone-500 font-semibold mt-0.5">
                Knowledge Base
              </div>
            </div>

            <nav>
              {grouped.map((g) => (
                <div key={g.id} className="mb-2">
                  <div className="text-[10px] font-bold uppercase tracking-[1px] text-stone-500 px-6 pt-3 pb-1.5">
                    {g.label}
                  </div>
                  {g.items.map((s) => {
                    const active = s.id === activeId
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => scrollTo(s.id)}
                        className={`w-full flex items-center gap-2.5 px-6 py-1.5 text-[13px] text-left border-l-[3px] transition-all ${
                          active
                            ? 'text-teal-700 bg-teal-50 border-teal-600 font-medium'
                            : 'text-stone-700 border-transparent hover:text-teal-700 hover:bg-teal-50 hover:border-teal-600'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            active ? 'bg-teal-600' : 'bg-stone-300'
                          }`}
                        />
                        <span className="truncate">{s.title}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* ─────── Main content ─────── */}
        <main className="min-w-0">
          {/* Hero */}
          <header className="relative overflow-hidden bg-linear-to-br from-slate-900 via-teal-900 to-teal-700 text-white px-6 sm:px-12 py-14 sm:py-16">
            <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-white/3" />
            <div className="absolute -left-20 -bottom-20 w-96 h-72 rounded-full bg-white/2" />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 text-white/85 px-3.5 py-1 rounded-full text-[12px] font-medium tracking-[0.4px] mb-6">
                <BookOpen className="w-3.5 h-3.5" />
                Radsting POS · Operator Reference · 18 Topics
              </span>
              <h1 className="font-serif text-[42px] sm:text-[50px] font-extrabold leading-[1.05] tracking-tight mb-4">
                Knowledge <span className="text-emerald-300">Base</span>
              </h1>
              <p className="text-white/70 text-[16px] leading-relaxed max-w-xl mb-8">
                Task-based guides for every part of Radsting POS — from the cashier&rsquo;s
                first bill to the accountant&rsquo;s GSTR-3B filing. Read top-to-bottom on
                day one, or use the sidebar to jump straight to what you need.
              </p>
              <div className="flex flex-wrap gap-8">
                {[
                  { num: '18', lbl: 'Topics' },
                  { num: '9', lbl: 'Modules' },
                  { num: '5', lbl: 'Roles' },
                  { num: '8', lbl: 'Categories' },
                  { num: '2', lbl: 'Print formats' },
                ].map((s) => (
                  <div key={s.lbl}>
                    <div className="font-serif text-[34px] font-bold leading-none">
                      {s.num}
                    </div>
                    <div className="text-[11.5px] text-white/55 font-medium mt-1 uppercase tracking-[0.6px]">
                      {s.lbl}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </header>

          {/* Sticky TOC strip */}
          <div className="sticky top-0 z-30 bg-stone-50/95 backdrop-blur-sm border-b border-stone-200 px-6 sm:px-10 py-3 overflow-x-auto">
            <div className="flex gap-1.5 min-w-max">
              {SECTIONS.map((s) => {
                const Icon = s.icon
                const active = s.id === activeId
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => scrollTo(s.id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-all border ${
                      active
                        ? 'bg-teal-50 border-teal-500 text-teal-700'
                        : 'bg-transparent border-stone-200 text-stone-500 hover:bg-teal-50 hover:border-teal-500 hover:text-teal-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>
                      <span className="opacity-50 mr-1">{s.num}</span>
                      {s.title}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sections */}
          <div className="px-6 sm:px-10 lg:px-12 py-2 pb-20">
            {SECTIONS.map((s) => (
              <section
                key={s.id}
                id={`kb-${s.id}`}
                className="pt-14 scroll-mt-20"
              >
                {s.content}
              </section>
            ))}

            {/* Footer summary */}
            <div className="mt-16 rounded-2xl bg-linear-to-br from-teal-50 to-emerald-50 border border-teal-500 p-7">
              <div className="font-serif text-[22px] font-bold text-stone-900 mb-3">
                Radsting POS — at a glance
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-[13.5px]">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-stone-500 mb-1.5">
                    Coverage
                  </div>
                  <p className="text-stone-700 leading-relaxed">
                    17 user-facing guides across 8 categories. POS, Inventory,
                    Purchases, Books, GST, Reports, Branches, Settings — everything
                    your team will touch.
                  </p>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-stone-500 mb-1.5">
                    Built for
                  </div>
                  <p className="text-stone-700 leading-relaxed">
                    Indian SMB retail. GST-native, multi-branch, WhatsApp-first,
                    cashier-speed POS with full Tally-grade accounting underneath.
                  </p>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-stone-500 mb-1.5">
                    Need help?
                  </div>
                  <p className="text-stone-700 leading-relaxed">
                    Raise a ticket from <b>Help &amp; Support</b> in the sidebar — your
                    vendor sees it instantly and replies inline. No email ping-pong.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
