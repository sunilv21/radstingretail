'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Search,
  Rocket,
  ScanLine,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Building2,
  BookText,
  Receipt,
  FileBarChart,
  CreditCard,
  MessageCircle,
  ShieldCheck,
  Settings as SettingsIcon,
  HelpCircle,
  AlertCircle,
  KeyRound,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  Lightbulb,
  Zap,
  Lock,
  Database,
  Server,
  Globe,
  ArrowRight,
  Layers,
  Sparkles,
  Calculator,
  TrendingUp,
} from 'lucide-react'
import { Input } from '@/components/ui/input'

// =====================================================================
// Developer / vendor reference — internal architecture, atomic
// transactions, ledger map, GST math, integration details. Rendered
// in the super-admin (vendor) portal so engineers and integrators
// have a single source of truth without flooding the tenant UI.
// =====================================================================

// =====================================================================
// Visual primitives
// =====================================================================

const TONE_RING: Record<string, string> = {
  teal: 'ring-teal-200 bg-teal-50 text-teal-900',
  blue: 'ring-blue-200 bg-blue-50 text-blue-900',
  amber: 'ring-amber-200 bg-amber-50 text-amber-900',
  emerald: 'ring-emerald-200 bg-emerald-50 text-emerald-900',
  rose: 'ring-rose-200 bg-rose-50 text-rose-900',
  violet: 'ring-violet-200 bg-violet-50 text-violet-900',
  slate: 'ring-slate-200 bg-slate-50 text-slate-900',
  orange: 'ring-orange-200 bg-orange-50 text-orange-900',
}
const TONE_TEXT: Record<string, string> = {
  teal: 'text-teal-700',
  blue: 'text-blue-700',
  amber: 'text-amber-700',
  emerald: 'text-emerald-700',
  rose: 'text-rose-700',
  violet: 'text-violet-700',
  slate: 'text-slate-700',
  orange: 'text-orange-700',
}
const TONE_DOT: Record<string, string> = {
  teal: 'bg-teal-600',
  blue: 'bg-blue-600',
  amber: 'bg-amber-600',
  emerald: 'bg-emerald-600',
  rose: 'bg-rose-600',
  violet: 'bg-violet-600',
  slate: 'bg-slate-600',
  orange: 'bg-orange-600',
}
const TONE_BORDER: Record<string, string> = {
  teal: 'border-teal-200',
  blue: 'border-blue-200',
  amber: 'border-amber-200',
  emerald: 'border-emerald-200',
  rose: 'border-rose-200',
  violet: 'border-violet-200',
  slate: 'border-slate-200',
  orange: 'border-orange-200',
}

function Pill({
  tone = 'slate',
  children,
}: {
  tone?: keyof typeof TONE_RING
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset ${TONE_RING[tone]}`}
    >
      {children}
    </span>
  )
}

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
  tone?: keyof typeof TONE_TEXT
}) {
  return (
    <div className="mb-6 pb-4 border-b border-slate-200">
      <div className="flex items-start gap-4">
        <div
          className={`shrink-0 w-12 h-12 rounded-xl ring-1 ring-inset flex items-center justify-center ${TONE_RING[tone]}`}
        >
          <Icon className={`w-5 h-5 ${TONE_TEXT[tone]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[11px] font-bold tracking-widest uppercase ${TONE_TEXT[tone]}`}>
            Section {num}
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mt-0.5">{title}</h2>
          {description && (
            <p className="text-[14px] text-slate-600 mt-1.5 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[15px] font-semibold text-slate-900 mt-6 mb-3 flex items-center gap-2">
      <span className="w-1 h-4 bg-teal-600 rounded-full" />
      {children}
    </h3>
  )
}

function InfoBox({
  tone = 'blue',
  icon: Icon,
  title,
  children,
}: {
  tone?: keyof typeof TONE_RING
  icon?: React.ComponentType<{ className?: string }>
  title?: string
  children: React.ReactNode
}) {
  const DefaultIcon =
    tone === 'rose' ? AlertCircle : tone === 'amber' ? AlertTriangle : tone === 'emerald' ? CheckCircle2 : Info
  const I = Icon ?? DefaultIcon
  return (
    <div className={`rounded-lg ring-1 ring-inset ${TONE_RING[tone]} p-4 my-3`}>
      <div className="flex items-start gap-3">
        <I className={`w-4 h-4 mt-0.5 shrink-0 ${TONE_TEXT[tone]}`} />
        <div className="flex-1 text-[13.5px] leading-relaxed">
          {title && <div className="font-semibold mb-1">{title}</div>}
          <div>{children}</div>
        </div>
      </div>
    </div>
  )
}

function KpiTile({
  label,
  value,
  hint,
  tone = 'teal',
}: {
  label: string
  value: string
  hint?: string
  tone?: keyof typeof TONE_TEXT
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold tracking-wide uppercase text-slate-500">
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-bold ${TONE_TEXT[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-[12px] text-slate-500">{hint}</div>}
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  children,
  tone = 'teal',
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
  tone?: keyof typeof TONE_TEXT
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 transition-colors">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-8 h-8 rounded-lg ring-1 ring-inset flex items-center justify-center ${TONE_RING[tone]}`}>
          <Icon className={`w-4 h-4 ${TONE_TEXT[tone]}`} />
        </div>
        <h4 className="font-semibold text-slate-900 text-[14px]">{title}</h4>
      </div>
      <div className="text-[13px] text-slate-700 leading-relaxed">{children}</div>
    </div>
  )
}

function FlowLinear({
  steps,
}: {
  steps: { label: string; tone?: keyof typeof TONE_RING; sub?: string }[]
}) {
  return (
    <div className="flex items-stretch gap-2 overflow-x-auto py-2 my-3">
      {steps.map((s, i) => (
        <div key={i} className="flex items-stretch gap-2">
          <div
            className={`rounded-lg ring-1 ring-inset px-3 py-2.5 min-w-32 text-center ${TONE_RING[s.tone || 'teal']}`}
          >
            <div className="text-[12.5px] font-semibold">{s.label}</div>
            {s.sub && <div className="text-[11px] opacity-75 mt-0.5">{s.sub}</div>}
          </div>
          {i < steps.length - 1 && (
            <div className="flex items-center text-slate-400">
              <ArrowRight className="w-4 h-4" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Timeline({
  items,
}: {
  items: { title: string; body: React.ReactNode; tone?: keyof typeof TONE_DOT }[]
}) {
  return (
    <div className="relative pl-6 my-4">
      <div className="absolute left-1.75 top-2 bottom-2 w-px bg-slate-200" />
      <div className="space-y-4">
        {items.map((it, i) => (
          <div key={i} className="relative">
            <div
              className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full ring-4 ring-white ${TONE_DOT[it.tone || 'teal']}`}
            />
            <div className="text-[13.5px] font-semibold text-slate-900">{it.title}</div>
            <div className="text-[13px] text-slate-700 mt-0.5 leading-relaxed">{it.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="my-3 rounded-lg overflow-hidden border border-slate-200">
      {lang && (
        <div className="px-3 py-1.5 bg-slate-100 text-[11px] font-mono text-slate-600 border-b border-slate-200 flex items-center justify-between">
          <span>{lang}</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">snippet</span>
        </div>
      )}
      <pre className="bg-slate-900 text-slate-100 p-3.5 text-[12px] leading-relaxed overflow-x-auto font-mono">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function Checklist({
  items,
}: {
  items: { text: React.ReactNode; done?: boolean }[]
}) {
  return (
    <ul className="space-y-2 my-3">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-slate-800">
          {it.done ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
          ) : (
            <div className="w-4 h-4 mt-0.5 rounded border-1.5 border-slate-300 shrink-0" />
          )}
          <span className="leading-relaxed">{it.text}</span>
        </li>
      ))}
    </ul>
  )
}

function RoleMatrix({
  roles,
  rows,
}: {
  roles: string[]
  rows: { perm: string; allow: boolean[] }[]
}) {
  return (
    <div className="my-3 rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2.5 font-semibold text-slate-700 border-r border-slate-200">
                Permission
              </th>
              {roles.map((r) => (
                <th
                  key={r}
                  className="text-center px-3 py-2.5 font-semibold text-slate-700 border-r last:border-r-0 border-slate-200"
                >
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-800 border-r border-slate-200">{row.perm}</td>
                {row.allow.map((a, j) => (
                  <td
                    key={j}
                    className="text-center px-3 py-2 border-r last:border-r-0 border-slate-200"
                  >
                    {a ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
                    ) : (
                      <XCircle className="w-4 h-4 text-slate-300 inline" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KeyTable({
  rows,
}: {
  rows: { keys: string; desc: string }[]
}) {
  return (
    <div className="my-3 rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-[13px]">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-b-0 border-slate-200">
              <td className="px-3 py-2 w-44 bg-slate-50">
                <kbd className="inline-block px-2 py-0.5 text-[11.5px] font-mono bg-white border border-slate-300 rounded shadow-sm">
                  {r.keys}
                </kbd>
              </td>
              <td className="px-3 py-2 text-slate-800">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// =====================================================================
// Section data structure
// =====================================================================

interface DocSection {
  id: string
  num: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  tone: keyof typeof TONE_TEXT
  searchBlob: string
  content: React.ReactNode
}

// =====================================================================
// 1. GETTING STARTED
// =====================================================================
const SectionGettingStarted = (
  <>
    <SectionHeader
      num="01"
      icon={Rocket}
      title="Getting Started"
      description="From first sign-in to running your first sale — everything you need to set up Radsting POS for your store in under 30 minutes."
      tone="teal"
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <KpiTile label="Setup time" value="~30 min" hint="Store profile + first product" tone="teal" />
      <KpiTile label="Required" value="GSTIN" hint="State code drives tax split" tone="blue" />
      <KpiTile label="First user" value="Admin" hint="Created by your vendor" tone="violet" />
      <KpiTile label="Bills/day" value="Unlimited" hint="On any paid plan" tone="emerald" />
    </div>

    <SubHeader>First sign-in</SubHeader>
    <p className="text-[13.5px] text-slate-700 leading-relaxed">
      Open the dashboard URL your software vendor gave you — typically{' '}
      <code className="px-1 py-0.5 bg-slate-100 rounded text-[12px] font-mono">
        your-store.radsting.com
      </code>{' '}
      in production, or{' '}
      <code className="px-1 py-0.5 bg-slate-100 rounded text-[12px] font-mono">
        localhost:3000
      </code>{' '}
      in development. Sign in with the email and password the vendor created.
    </p>

    <Checklist
      items={[
        { text: <>Change your password from the user menu on first login.</> },
        {
          text: (
            <>
              Your role is one of{' '}
              <Pill tone="teal">admin</Pill> <Pill tone="blue">manager</Pill>{' '}
              <Pill tone="amber">cashier</Pill> <Pill tone="violet">accountant</Pill>{' '}
              <Pill tone="slate">ca</Pill> — controls everything you can see.
            </>
          ),
        },
        {
          text: 'If your subscription expired, a full-screen takeover with renewal instructions appears instead of the dashboard.',
        },
      ]}
    />

    <SubHeader>The dashboard at a glance</SubHeader>
    <p className="text-[13.5px] text-slate-700 leading-relaxed">
      The home screen shows today&rsquo;s key numbers — sales, inventory value, low-stock count, GST
      summary. The left sidebar groups every workspace into eight collapsible sections.
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
      <FeatureCard icon={ScanLine} title="POS / Billing" tone="teal">
        The main register. Cashiers spend most of their time here. Barcode scan,
        cart, multi-tender payment, instant print.
      </FeatureCard>
      <FeatureCard icon={Receipt} title="Sales History" tone="blue">
        Every bill ever rung up, searchable by invoice number, customer phone, or
        date range. Reprint, share via WhatsApp, void with audit trail.
      </FeatureCard>
      <FeatureCard icon={Package} title="Inventory" tone="violet">
        Products, batches, warranties, low-stock alerts, inter-store transfers.
        Every change creates an immutable StockMovement record.
      </FeatureCard>
      <FeatureCard icon={Truck} title="Purchases" tone="amber">
        Supplier POs, multi-GRN receipts, partial payments. Atomically posts to
        ledger + GST credit on every receipt.
      </FeatureCard>
      <FeatureCard icon={BookText} title="Books" tone="emerald">
        Full Tally-style accounting — chart of accounts, vouchers, trial balance,
        P&amp;L, balance sheet, day book.
      </FeatureCard>
      <FeatureCard icon={FileBarChart} title="Reports & Admin" tone="rose">
        Sales, profit, stock valuation, GST returns. Plus org-level: branches,
        users, audit log, billing.
      </FeatureCard>
    </div>

    <SubHeader>Initial store setup — 6-step checklist</SubHeader>

    <Timeline
      items={[
        {
          tone: 'teal',
          title: '1. Business profile',
          body: (
            <>
              Go to <b>Settings → Business</b>. Fill in store name, GSTIN, 2-digit state
              code, phone, address, invoice prefix (default{' '}
              <code className="text-[12px] px-1 bg-slate-100 rounded">INV</code>). The state code is
              critical — it drives the CGST/SGST vs IGST split on every bill.
            </>
          ),
        },
        {
          tone: 'blue',
          title: '2. Logo upload',
          body: (
            <>
              <b>Settings → Logo</b> — upload your business logo (PNG, max 500KB). It
              prints on every invoice and shows on the public bill share page.
            </>
          ),
        },
        {
          tone: 'violet',
          title: '3. Chart of accounts',
          body: (
            <>
              <b>Books → Accounts</b> — Radsting auto-creates standard accounts (Cash,
              Bank, Sundry Debtors/Creditors, GST Output/Input, Sales, Purchase). Add
              your bank account(s) here so they appear in payment dropdowns.
            </>
          ),
        },
        {
          tone: 'amber',
          title: '4. First product',
          body: (
            <>
              <b>Inventory → Add product</b> — name, SKU, HSN code (mandatory), GST rate,
              MRP, selling price, opening stock. HSN is verified against the master list
              of ~600 entries; the form rejects unknown HSN codes.
            </>
          ),
        },
        {
          tone: 'emerald',
          title: '5. First customer (optional)',
          body: (
            <>
              <b>Parties → Customers</b> — for walk-in cash sales you can skip this
              entirely. For credit sales or warranty items, customer name + phone +
              address is mandatory.
            </>
          ),
        },
        {
          tone: 'rose',
          title: '6. Test sale',
          body: (
            <>
              Open <b>POS</b>, scan or search your test product, add to cart, hit{' '}
              <b>Save &amp; Print</b>. The print dialog opens automatically. Verify the
              invoice number sequence starts at 1.
            </>
          ),
        },
      ]}
    />

    <InfoBox tone="amber" title="Before you go live">
      Run at least three test sales — one cash, one UPI, one credit — and verify the
      ledger entries in <b>Books → Day Book</b>. Every sale must show equal debits and
      credits. If they don&rsquo;t, stop and contact support.
    </InfoBox>
  </>
)

// =====================================================================
// 2. POS / BILLING
// =====================================================================
const SectionPos = (
  <>
    <SectionHeader
      num="02"
      icon={ScanLine}
      title="POS &amp; Billing"
      description="The transactional heart of Radsting. Sub-50ms barcode lookups, atomic stock + ledger + GST writes, split-tender payments, instant invoice."
      tone="blue"
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <KpiTile label="Lookup speed" value="< 50ms" hint="Redis cache + Mongo fallback" tone="blue" />
      <KpiTile label="Sale commit" value="< 500ms" hint="P95 atomic transaction" tone="teal" />
      <KpiTile label="Tender modes" value="5" hint="Cash, UPI, Card, Credit, Loyalty" tone="violet" />
      <KpiTile label="Print formats" value="2" hint="80mm thermal + A4" tone="emerald" />
    </div>

    <SubHeader>The billing flow</SubHeader>

    <FlowLinear
      steps={[
        { label: 'Lookup', sub: 'barcode / SKU', tone: 'blue' },
        { label: 'Cart', sub: 'add + discount', tone: 'teal' },
        { label: 'Customer', sub: 'walk-in or saved', tone: 'violet' },
        { label: 'Tender', sub: 'split allowed', tone: 'amber' },
        { label: 'Atomic commit', sub: 'stock + ledger + GST', tone: 'rose' },
        { label: 'Print + share', sub: 'PDF + WhatsApp', tone: 'emerald' },
      ]}
    />

    <SubHeader>Pricing &amp; tax math (per line item)</SubHeader>
    <CodeBlock
      lang="GST calculation"
      code={`basePrice       = product.sellingPrice × quantity
discountAmount  = (type === 'percent') ? basePrice × pct / 100 : flat
taxableAmount   = basePrice − discountAmount

if (store.stateCode === customer.stateCode):
   cgst = taxableAmount × (gstRate / 200)
   sgst = taxableAmount × (gstRate / 200)
   igst = 0
else:
   cgst = 0
   sgst = 0
   igst = taxableAmount × (gstRate / 100)

lineTotal = taxableAmount + cgst + sgst + igst`}
    />

    <InfoBox tone="blue" title="Why per-line and not per-bill">
      GSTR-1 requires HSN-wise breakup. Tax computed per invoice cannot be split back
      cleanly. Radsting computes per item so HSN summaries are exact and the filing
      JSON is portal-ready.
    </InfoBox>

    <SubHeader>Walk-in vs registered customer</SubHeader>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FeatureCard icon={Users} title="Walk-in" tone="slate">
        <ul className="list-disc pl-4 space-y-1">
          <li>No customer info captured.</li>
          <li>Cash / UPI / card payments only.</li>
          <li>Cannot be a credit sale.</li>
          <li>Cannot contain warranty items.</li>
        </ul>
      </FeatureCard>
      <FeatureCard icon={ShieldCheck} title="Saved customer" tone="teal">
        <ul className="list-disc pl-4 space-y-1">
          <li>Phone-based upsert — same phone reuses the record.</li>
          <li>Credit sales tracked under Sundry Debtors.</li>
          <li>Warranty register linked to customer phone.</li>
          <li>WhatsApp / Email auto-share possible.</li>
        </ul>
      </FeatureCard>
    </div>

    <SubHeader>Split tender</SubHeader>
    <p className="text-[13.5px] text-slate-700 leading-relaxed">
      The bill total can be split across any number of tender modes. A common pattern is
      cash + UPI when the customer pays partly in cash and partly via QR. The
      <code className="px-1 mx-0.5 py-0.5 bg-slate-100 rounded text-[12px] font-mono">payments[]</code>{' '}
      array on the sale captures each leg with mode, amount, reference (UPI VPA, card
      last-4, etc.).
    </p>

    <InfoBox tone="emerald" icon={CheckCircle2} title="Save vs Save &amp; Print">
      <b>Save</b> commits silently — useful for credit notes or backdated entries.{' '}
      <b>Save &amp; Print</b> waits for the server response, then auto-fires{' '}
      <code className="text-[12px] px-1 bg-white/60 rounded">window.print()</code>. The
      print dialog always renders a persisted document — you can never print an
      un-saved bill.
    </InfoBox>

    <SubHeader>Returns &amp; voids</SubHeader>
    <Timeline
      items={[
        {
          tone: 'amber',
          title: 'Return',
          body: 'Creates reversal entries — negative quantities push stock back in, reverse the original ledger postings, mark the source sale "returned". The original bill is never edited.',
        },
        {
          tone: 'rose',
          title: 'Void',
          body: 'Admin-only. Marks the sale "voided" and creates a fully reversing ledger voucher. Requires a written reason which goes to the audit log.',
        },
      ]}
    />
  </>
)

// =====================================================================
// 3. INVENTORY
// =====================================================================
const SectionInventory = (
  <>
    <SectionHeader
      num="03"
      icon={Package}
      title="Inventory"
      description="Stock master, batches, warranties, low-stock alerts, inter-store transfers. Every quantity change creates an immutable StockMovement record."
      tone="violet"
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <KpiTile label="Movement types" value="4" hint="in / out / adjustment / transfer" tone="violet" />
      <KpiTile label="HSN master" value="~600" hint="Verified codes" tone="blue" />
      <KpiTile label="GST rates" value="0/5/12/18/28" hint="Per product" tone="amber" />
      <KpiTile label="Variants" value="∞" hint="Color, size, batch" tone="emerald" />
    </div>

    <SubHeader>Product master fields</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FeatureCard icon={Database} title="Identity" tone="violet">
        Name, SKU (unique per store), barcode (indexed for sub-50ms lookup), brand,
        category. SKU clashes are blocked at save.
      </FeatureCard>
      <FeatureCard icon={Calculator} title="Pricing" tone="teal">
        Purchase price (cost), selling price (default to customer), MRP (printed
        ceiling). MRP &lt; selling is flagged as a warning.
      </FeatureCard>
      <FeatureCard icon={Receipt} title="Tax" tone="amber">
        HSN code (mandatory, verified), GST rate (0/5/12/18/28%), tax type
        (GST/IGST/Exempt). HSN drives GSTR filing summaries.
      </FeatureCard>
      <FeatureCard icon={ShieldCheck} title="Tracking" tone="emerald">
        Stock, min/max thresholds, reorder qty. Warranty months (0 = none). Batch
        tracking, expiry tracking — auto-enabled for HSN 30xx (pharma).
      </FeatureCard>
    </div>

    <SubHeader>Stock movement audit trail</SubHeader>
    <CodeBlock
      lang="StockMovement (immutable)"
      code={`{
  productId, storeId,
  type: 'in' | 'out' | 'adjustment' | 'transfer',
  quantity,                          // signed
  previousStock, newStock,           // snapshot for audit
  referenceType: 'sale' | 'purchase' | 'return' | 'manual' | 'transfer',
  referenceId,                       // links back to the source doc
  batchNumber, expiryDate,           // if batch-tracked
  reason,                            // free text for manual adjustments
  createdBy, createdAt
}`}
    />

    <InfoBox tone="rose" title="Negative stock is blocked by default">
      The Inventory Engine validates stock before every sale commit. If you try to sell
      more than you have, the entire transaction rolls back. To allow oversell (e.g. for
      ledger imports), set <code className="text-[12px] px-1 bg-white/60 rounded">store.settings.allowNegativeStock = true</code>.
    </InfoBox>

    <SubHeader>Low-stock alerts</SubHeader>
    <p className="text-[13.5px] text-slate-700 leading-relaxed">
      A product whose stock falls below <code className="text-[12px] px-1 bg-slate-100 rounded">minStock</code>{' '}
      shows up on the home dashboard&rsquo;s low-stock widget and in{' '}
      <b>Inventory → Low stock</b>. Notifications fire via the eventBus and can be
      routed to WhatsApp (Phase 2).
    </p>

    <SubHeader>Inter-store transfers</SubHeader>
    <Timeline
      items={[
        {
          tone: 'violet',
          title: 'Initiate at source',
          body: 'Source store creates the transfer, picks items + quantities. Status: pending. Stock is reserved (not deducted).',
        },
        {
          tone: 'blue',
          title: 'In transit',
          body: 'Once dispatched, source store moves transfer to in-transit. Stock is actually deducted from source. A StockMovement (type: transfer, out) is logged.',
        },
        {
          tone: 'emerald',
          title: 'Receipt at destination',
          body: 'Destination store confirms receipt. Stock added to destination. StockMovement (type: transfer, in) logged. Transfer marked received.',
        },
      ]}
    />

    <SubHeader>Warranties</SubHeader>
    <p className="text-[13.5px] text-slate-700 leading-relaxed">
      A product with <code className="text-[12px] px-1 bg-slate-100 rounded">warrantyMonths &gt; 0</code>{' '}
      is a warranty-bearing item. As soon as one lands on the cart, customer name +
      phone + address become mandatory at the POS — Radsting refuses to ring up the bill
      without them. Each warranty line is frozen into the sale with{' '}
      <code className="text-[12px] px-1 bg-slate-100 rounded">startsAt</code> and{' '}
      <code className="text-[12px] px-1 bg-slate-100 rounded">expiresAt</code> so the
      Warranty Register can be queried by customer phone forever.
    </p>
  </>
)

// =====================================================================
// 4. SALES
// =====================================================================
const SectionSales = (
  <>
    <SectionHeader
      num="04"
      icon={Receipt}
      title="Sales History"
      description="Every bill ever rung up. Searchable, printable, shareable, voidable — but never editable."
      tone="emerald"
    />

    <SubHeader>What gets stored on a sale</SubHeader>
    <CodeBlock
      lang="Sale document"
      code={`{
  invoiceNumber: 'INV-2026-00001',           // unique, sequential per store
  storeId,
  customerSnapshot: { name, phone, gstin, address },  // denormalised
  items: [{
    productId, productSnapshot: { name, sku, hsnCode },  // immutable
    quantity, basePrice, discount, taxableAmount,
    gstRate, cgst, sgst, igst, totalAmount
  }],
  subtotal, totalDiscount, totalTax, roundOff, grandTotal,
  payments: [{ mode, amount, reference }],
  paymentStatus: 'paid' | 'partial' | 'credit',
  shareToken,                                 // public bill share URL
  hasWarranty, warranties: [...],
  createdBy, createdAt
}`}
    />

    <InfoBox tone="rose" icon={Lock} title="Sales are immutable">
      A saved sale is never edited. Mistakes are corrected via Return or Void — both
      create new documents that reference the original. This is non-negotiable: the
      ledger&rsquo;s audit trail depends on it.
    </InfoBox>

    <SubHeader>Share channels</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <FeatureCard icon={MessageCircle} title="WhatsApp" tone="emerald">
        Two modes. If store WhatsApp Cloud API is configured, one click sends the bill
        directly. Otherwise opens <code className="text-[12px] px-1 bg-slate-100 rounded">wa.me</code> with a pre-filled message.
      </FeatureCard>
      <FeatureCard icon={Globe} title="Public link" tone="blue">
        Every sale has an unguessable <code className="text-[12px] px-1 bg-slate-100 rounded">shareToken</code>. The customer can open{' '}
        <code className="text-[12px] px-1 bg-slate-100 rounded">/bill/&lt;token&gt;</code>{' '}
        on any device — no auth needed.
      </FeatureCard>
      <FeatureCard icon={Sparkles} title="QR / Copy / Email" tone="violet">
        Inline QR code, copy-to-clipboard, and mailto-based email — all client-side, all
        free.
      </FeatureCard>
    </div>
  </>
)

// =====================================================================
// 5. PURCHASES
// =====================================================================
const SectionPurchases = (
  <>
    <SectionHeader
      num="05"
      icon={Truck}
      title="Purchases"
      description="POs, multi-GRN receipts, partial supplier payments. Every receipt is atomic: stock-in + purchase expense + input GST credit + supplier payable."
      tone="amber"
    />

    <SubHeader>The PO lifecycle</SubHeader>
    <FlowLinear
      steps={[
        { label: 'Draft', sub: 'editable', tone: 'slate' },
        { label: 'Ordered', sub: 'sent to supplier', tone: 'blue' },
        { label: 'Partial', sub: '≥1 GRN', tone: 'amber' },
        { label: 'Received', sub: 'all qty in', tone: 'emerald' },
      ]}
    />
    <p className="text-[13px] text-slate-600 mt-2">
      Side exits: <Pill tone="slate">cancelled</Pill> from draft/ordered with zero
      receipts. <Pill tone="violet">closed</Pill> via pre-close — accept the partial as
      final, forgive pending qty.
    </p>

    <SubHeader>GRN — what happens atomically</SubHeader>
    <CodeBlock
      lang="GRN atomic block"
      code={`session.withTransaction(async () => {
  // 1. Stock-in
  product.stock += receivedQty
  StockMovement.create({ type: 'in', refType: 'purchase', refId: po._id })

  // 2. Ledger
  Ledger.debit(  Purchase Expense,    subtotal       )
  Ledger.debit(  Input GST Credit,    totalTax       )
  Ledger.credit( Sundry Creditors,    grandTotal     )

  // 3. Supplier payable
  supplier.outstandingBalance += grandTotal

  // 4. PO state
  po.receivedQty += quantity
  po.receiptRefs.push({ grnNumber: 'GRN-YYYY-00001', items, total })
  po.status = allReceived ? 'received' : 'partial'
})`}
    />

    <InfoBox tone="amber" title="Multi-GRN is common in Indian retail">
      Suppliers frequently split deliveries. Radsting handles N receipts per PO out of
      the box. Each receipt validates{' '}
      <code className="text-[12px] px-1 bg-white/60 rounded">receivedQty + requested ≤ orderedQty</code>{' '}
      per line so you can never over-receive.
    </InfoBox>

    <SubHeader>Ancillary expenses on a GRN</SubHeader>
    <p className="text-[13.5px] text-slate-700 leading-relaxed">
      Labour, packaging, freight, unloading — these are receipt-time costs that should
      either land in the product cost (landed cost) or hit the P&amp;L. Radsting lets
      you tag each ancillary line as either, and posts the right ledger entries
      automatically.
    </p>

    <SubHeader>Outstanding reports</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FeatureCard icon={Users} title="By supplier" tone="amber">
        Σ(orderedQty − receivedQty) × purchasePrice grouped by supplier, with open PO
        list per row. Direct analog of Tally&rsquo;s &ldquo;Order Outstanding by
        Supplier&rdquo;.
      </FeatureCard>
      <FeatureCard icon={Package} title="By item" tone="violet">
        Pending quantity per product across all open POs, with reference PO numbers.
        Tells you what to chase.
      </FeatureCard>
    </div>
  </>
)

// =====================================================================
// 6. PARTIES
// =====================================================================
const SectionParties = (
  <>
    <SectionHeader
      num="06"
      icon={Users}
      title="Parties — Customers &amp; Suppliers"
      description="The address book + ledger view in one. Outstanding balances roll up automatically from every sale and payment."
      tone="blue"
    />

    <SubHeader>Customer master</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FeatureCard icon={ShieldCheck} title="Identity" tone="blue">
        Name, phone (unique per store — drives upsert), email, GSTIN, address. Phone is
        the lookup key for warranty register and credit history.
      </FeatureCard>
      <FeatureCard icon={CreditCard} title="Credit &amp; loyalty" tone="emerald">
        Credit limit, current outstanding, loyalty points. If credit sale exceeds limit
        the POS blocks the save with a clear error.
      </FeatureCard>
    </div>

    <SubHeader>Customer ledger</SubHeader>
    <p className="text-[13.5px] text-slate-700 leading-relaxed">
      Pulled from <code className="text-[12px] px-1 bg-slate-100 rounded">ledger_entries</code>{' '}
      where <code className="text-[12px] px-1 bg-slate-100 rounded">accountType = receivable</code>{' '}
      and <code className="text-[12px] px-1 bg-slate-100 rounded">accountId = customer._id</code>.
      Shows every credit sale (debit) and every payment received (credit) with a running
      balance. The closing balance equals what they owe you.
    </p>

    <SubHeader>Supplier master &amp; ledger</SubHeader>
    <p className="text-[13.5px] text-slate-700 leading-relaxed">
      Symmetric to customers: supplier master holds name, GSTIN, state code (drives the
      tax split on incoming bills), and the running payable. Ledger view shows every GRN
      (credit) and every payment (debit). Closing balance = what you owe them.
    </p>

    <InfoBox tone="blue" title="State code is critical">
      Always set the supplier&rsquo;s state code. It&rsquo;s used at purchase time to
      decide CGST/SGST (same state) vs IGST (different state) on the input GST
      credit — getting this wrong skews your GSTR-3B ITC claim.
    </InfoBox>
  </>
)

// =====================================================================
// 7. BOOKS
// =====================================================================
const SectionBooks = (
  <>
    <SectionHeader
      num="07"
      icon={BookText}
      title="Books — Accounting"
      description="Full Tally-grade double-entry accounting. Chart of accounts, vouchers, trial balance, P&L, balance sheet, day book."
      tone="emerald"
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <KpiTile label="Account groups" value="Tree" hint="Tally-style hierarchy" tone="emerald" />
      <KpiTile label="Voucher types" value="4" hint="Pmt / Rcpt / Jrnl / Contra" tone="blue" />
      <KpiTile label="Invariant" value="Dr = Cr" hint="Per voucher, always" tone="amber" />
      <KpiTile label="Statements" value="6" hint="TB, P&L, BS, CF, Daybook, Bank rec" tone="violet" />
    </div>

    <SubHeader>The five account natures</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      <FeatureCard icon={TrendingUp} title="Assets" tone="emerald">
        Cash, Bank, Sundry Debtors, Inventory, Fixed Assets. Debit increases.
      </FeatureCard>
      <FeatureCard icon={Database} title="Liabilities" tone="rose">
        Sundry Creditors, GST Output, Loans. Credit increases.
      </FeatureCard>
      <FeatureCard icon={Receipt} title="Income" tone="teal">
        Sales Revenue, Other Income. Credit increases (revenue earned).
      </FeatureCard>
      <FeatureCard icon={Calculator} title="Expenses" tone="amber">
        Purchase Expense, Rent, Salaries, Utilities. Debit increases.
      </FeatureCard>
      <FeatureCard icon={ShieldCheck} title="Equity" tone="violet">
        Proprietor&rsquo;s Capital, Retained Earnings. Credit increases.
      </FeatureCard>
      <FeatureCard icon={Sparkles} title="Counter-balance" tone="blue">
        Opening balances posted as paired entries — assets vs capital — so the books
        start balanced.
      </FeatureCard>
    </div>

    <SubHeader>Voucher rules</SubHeader>
    <CodeBlock
      lang="Voucher invariant"
      code={`{
  type: 'payment' | 'receipt' | 'journal' | 'contra',
  voucherNumber: 'PMT-2026-00001',
  entries: [
    { accountId, entryType: 'debit',  amount },
    { accountId, entryType: 'credit', amount },
    // ... can have any number of legs
  ],
  totalAmount,
}

// REJECTED IF: Σ(debit) !== Σ(credit)`}
    />

    <SubHeader>Auto-generated journal map</SubHeader>
    <div className="my-3 rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-3 py-2.5 font-semibold text-slate-700 border-r border-slate-200">
              Event
            </th>
            <th className="text-left px-3 py-2.5 font-semibold text-slate-700 border-r border-slate-200">
              Debit
            </th>
            <th className="text-left px-3 py-2.5 font-semibold text-slate-700">Credit</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Cash sale', 'Cash A/c', 'Sales Revenue + GST Output'],
            ['UPI / card sale', 'Bank A/c', 'Sales Revenue + GST Output'],
            ['Credit sale', 'Sundry Debtors', 'Sales Revenue + GST Output'],
            ['Customer payment', 'Cash / Bank', 'Sundry Debtors'],
            ['Purchase GRN', 'Purchase Expense + Input GST', 'Sundry Creditors'],
            ['Supplier payment', 'Sundry Creditors', 'Cash / Bank'],
            ['Sales return', 'Sales Revenue (rev.)', 'Cash / Receivable'],
          ].map((row, i) => (
            <tr key={i} className="border-t border-slate-200 hover:bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-800 border-r border-slate-200">
                {row[0]}
              </td>
              <td className="px-3 py-2 text-emerald-700 border-r border-slate-200 font-mono text-[12.5px]">
                {row[1]}
              </td>
              <td className="px-3 py-2 text-rose-700 font-mono text-[12.5px]">{row[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <SubHeader>Statements</SubHeader>
    <Timeline
      items={[
        {
          tone: 'emerald',
          title: 'Trial balance',
          body: 'Opening + Σ Dr + Σ Cr + closing per account. Σ total Dr == Σ total Cr is the sanity check.',
        },
        {
          tone: 'blue',
          title: 'Profit &amp; Loss',
          body: 'Σ Income − Σ Expense = Net Profit (or Loss).',
        },
        {
          tone: 'violet',
          title: 'Balance Sheet',
          body: 'Total Assets == Total Liabilities + Retained Earnings (P&L up to cutoff).',
        },
        {
          tone: 'amber',
          title: 'Cash Flow',
          body: 'Bucketizes cash/bank debits and credits by referenceType (sale, payment, voucher).',
        },
        {
          tone: 'rose',
          title: 'Day Book',
          body: 'Chronological ledger stream for a date range — direct analog of Tally&apos;s Daybook.',
        },
        {
          tone: 'slate',
          title: 'Bank Reconciliation',
          body: 'Upload statement; naive amount-match within ₹0.01 against ledger; lists matched, in-book-not-in-statement, in-statement-not-in-book.',
        },
      ]}
    />
  </>
)

// =====================================================================
// 8. GST
// =====================================================================
const SectionGst = (
  <>
    <SectionHeader
      num="08"
      icon={Calculator}
      title="GST — Returns &amp; E-Invoice"
      description="GSTR-1, GSTR-3B, HSN summary, JSON export for the portal. Optional GSP / NIC integration for B2B e-invoice + IRN."
      tone="rose"
    />

    <SubHeader>GSTR-1 categories</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      <FeatureCard icon={ShieldCheck} title="B2B" tone="rose">
        To GSTIN-registered customers. GSTIN mandatory. Invoice-level detail.
      </FeatureCard>
      <FeatureCard icon={Users} title="B2C Large" tone="amber">
        Unregistered, invoice &gt; ₹2.5L. State-wise breakup.
      </FeatureCard>
      <FeatureCard icon={Receipt} title="B2C Small" tone="blue">
        Unregistered, invoice ≤ ₹2.5L. Consolidated by rate.
      </FeatureCard>
      <FeatureCard icon={AlertCircle} title="CDNR" tone="violet">
        Credit/debit notes to registered.
      </FeatureCard>
      <FeatureCard icon={AlertTriangle} title="CDNUR" tone="orange">
        Credit/debit notes to unregistered.
      </FeatureCard>
      <FeatureCard icon={Package} title="HSN summary" tone="emerald">
        HSN-wise quantity + taxable value + tax — exactly as the portal expects.
      </FeatureCard>
    </div>

    <SubHeader>GSTR-3B math</SubHeader>
    <CodeBlock
      lang="GSTR-3B"
      code={`Output Tax Liability  =  Σ(all sale GST amounts)
Input Tax Credit      =  Σ(all purchase GST amounts)
Net Payable           =  Output − ITC

if (Net > 0): pay
if (Net < 0): ITC carry forward = |Net|`}
    />

    <SubHeader>E-Invoice / IRN — when it&rsquo;s required</SubHeader>
    <InfoBox tone="rose" title="Mandatory for B2B sales when turnover > ₹5 Cr">
      Every B2B invoice must be reported to the NIC IRP before issuance. The IRP
      returns an IRN (Invoice Reference Number) and a signed QR code that must print on
      the bill. Radsting&rsquo;s GSP adapter automates this — paste your GSP
      credentials in <b>Settings → E-Invoice</b> and the rest is plumbed.
    </InfoBox>

    <SubHeader>The IRN flow</SubHeader>
    <FlowLinear
      steps={[
        { label: 'B2B sale saved', tone: 'blue' },
        { label: 'IRN request', sub: 'JSON to GSP', tone: 'violet' },
        { label: 'NIC validates', tone: 'amber' },
        { label: 'IRN + QR returned', tone: 'emerald' },
        { label: 'Bill printed', sub: 'with IRN+QR', tone: 'teal' },
      ]}
    />

    <p className="text-[13px] text-slate-600 mt-2">
      Test connection any time from <b>Settings → E-Invoice → Test</b>. The route is{' '}
      <code className="text-[12px] px-1 bg-slate-100 rounded">POST /api/v1/store/einvoice/test</code>{' '}
      — no credit is consumed.
    </p>
  </>
)

// =====================================================================
// 9. REPORTS
// =====================================================================
const SectionReports = (
  <>
    <SectionHeader
      num="09"
      icon={FileBarChart}
      title="Reports &amp; Insights"
      description="Pre-aggregated, cached, and built to answer the questions an owner actually asks."
      tone="orange"
    />

    <SubHeader>The eight standard reports</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FeatureCard icon={TrendingUp} title="Dashboard KPIs" tone="orange">
        Today / week / month sales, gross profit, top SKUs, low-stock count. Redis
        cached, refreshes every 5 min via background job.
      </FeatureCard>
      <FeatureCard icon={Receipt} title="Sales report" tone="blue">
        Filterable by date range, customer, product, payment mode. Exports to CSV +
        Excel.
      </FeatureCard>
      <FeatureCard icon={Calculator} title="Profit report" tone="emerald">
        Revenue − COGS − discount = Gross. Per-SKU and per-category margin breakdown.
      </FeatureCard>
      <FeatureCard icon={Package} title="Stock valuation" tone="violet">
        Cost-basis or MRP-basis snapshot of every SKU&rsquo;s stock value. Useful for
        year-end reporting.
      </FeatureCard>
      <FeatureCard icon={Truck} title="Purchase report" tone="amber">
        Date-range PO + GRN summary, supplier-wise spend, top suppliers.
      </FeatureCard>
      <FeatureCard icon={Users} title="Customer aging" tone="rose">
        Outstanding receivables bucketed 0-30 / 31-60 / 61-90 / 90+ days.
      </FeatureCard>
      <FeatureCard icon={Building2} title="Branch comparison" tone="teal">
        Multi-store deployments only. Side-by-side KPIs across stores.
      </FeatureCard>
      <FeatureCard icon={Sparkles} title="Insights (Phase 2)" tone="violet">
        AI-flagged anomalies — discount outliers, void clusters, slow movers. Phase 2.
      </FeatureCard>
    </div>

    <InfoBox tone="blue" title="Reports use the secondary replica">
      Read-heavy reports run against MongoDB&rsquo;s{' '}
      <code className="text-[12px] px-1 bg-white/60 rounded">secondaryPreferred</code>{' '}
      read preference so they never compete with sale writes for primary I/O.
    </InfoBox>
  </>
)

// =====================================================================
// 10. BRANCHES
// =====================================================================
const SectionBranches = (
  <>
    <SectionHeader
      num="10"
      icon={Building2}
      title="Branches"
      description="Multi-store SaaS. One organisation, many stores, hard-isolated by storeId at the middleware layer."
      tone="teal"
    />

    <SubHeader>The multi-tenancy contract</SubHeader>
    <InfoBox tone="rose" icon={Lock} title="storeId injected from JWT, never from request">
      The auth middleware writes the user&rsquo;s storeId into the request. The
      scopeToStore middleware copies it into the query. A user cannot ever query another
      store&rsquo;s data — not by tampering with params, not by sending a fake header.
      This is the load-bearing security primitive of the system.
    </InfoBox>

    <SubHeader>What&rsquo;s scoped vs global</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FeatureCard icon={Lock} title="Per-store" tone="teal">
        Products, sales, purchases, customers, suppliers, ledger, vouchers,
        StockMovements, GST reports, invoice counter. Hard-walled.
      </FeatureCard>
      <FeatureCard icon={Globe} title="Org-wide" tone="violet">
        Users (with storeIds[] array of allowed stores), subscription / billing, audit
        log, support tickets. Admin can pivot between stores.
      </FeatureCard>
    </div>

    <SubHeader>Inter-store transfers</SubHeader>
    <p className="text-[13.5px] text-slate-700 leading-relaxed">
      See <b>Inventory § Inter-store transfers</b> — a transfer atomically deducts from
      source and adds to destination, with paired StockMovement entries for the audit
      trail.
    </p>
  </>
)

// =====================================================================
// 11. USERS
// =====================================================================
const SectionUsers = (
  <>
    <SectionHeader
      num="11"
      icon={Users}
      title="Users &amp; Roles"
      description="Five role types, per-user permission overrides, and an immutable audit log of every privileged action."
      tone="violet"
    />

    <SubHeader>Role matrix</SubHeader>
    <RoleMatrix
      roles={['Super', 'Admin', 'Manager', 'Cashier', 'Accountant']}
      rows={[
        { perm: 'Create sale', allow: [true, true, true, true, false] },
        { perm: 'Void sale', allow: [true, true, true, false, false] },
        { perm: 'Manage products', allow: [true, true, true, false, false] },
        { perm: 'View reports', allow: [true, true, true, false, true] },
        { perm: 'Manage users', allow: [true, true, false, false, false] },
        { perm: 'GST reports', allow: [true, true, true, false, true] },
        { perm: 'Purchase entry', allow: [true, true, true, false, false] },
        { perm: 'Accounting / vouchers', allow: [true, true, false, false, true] },
        { perm: 'Multi-store config', allow: [true, false, false, false, false] },
      ]}
    />

    <SubHeader>Per-user overrides</SubHeader>
    <p className="text-[13.5px] text-slate-700 leading-relaxed">
      Beyond the role default, each user has individual flags — most importantly{' '}
      <code className="text-[12px] px-1 bg-slate-100 rounded">canDiscount</code>,{' '}
      <code className="text-[12px] px-1 bg-slate-100 rounded">maxDiscountPct</code>,{' '}
      <code className="text-[12px] px-1 bg-slate-100 rounded">canVoidSale</code>. Use
      these to grant a senior cashier discount authority without making them a manager.
    </p>

    <SubHeader>Audit log</SubHeader>
    <CodeBlock
      lang="AuditLog entry"
      code={`{
  userId, userEmail, userRole,
  action: 'SALE_VOID' | 'DISCOUNT_APPLIED' | 'STOCK_ADJUST' | ...,
  resourceType, resourceId,
  before: {...}, after: {...},   // full diff
  ipAddress, userAgent, storeId,
  timestamp                       // IMMUTABLE — never updated, never deleted
}`}
    />
  </>
)

// =====================================================================
// 12. SUBSCRIPTION
// =====================================================================
const SectionSubscription = (
  <>
    <SectionHeader
      num="12"
      icon={CreditCard}
      title="Subscription &amp; Billing"
      description="Plan tier, user count add-ons, trial, payment history. Self-service from the tenant side; managed from the vendor side."
      tone="blue"
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <KpiTile label="Trial" value="14 days" hint="Full feature access" tone="blue" />
      <KpiTile label="Plans" value="Starter / Pro / Enterprise" hint="₹999 to ₹4,999" tone="teal" />
      <KpiTile label="User addon" value="₹X/user" hint="Above plan default" tone="violet" />
      <KpiTile label="Grace period" value="3 days" hint="After expiry" tone="amber" />
    </div>

    <SubHeader>What happens at expiry</SubHeader>
    <Timeline
      items={[
        {
          tone: 'amber',
          title: 'T-3 days',
          body: 'Yellow banner at the top of every page warning of upcoming expiry. WhatsApp reminder if configured.',
        },
        {
          tone: 'orange',
          title: 'T-0 — Expiry day',
          body: 'Red banner. Read-only mode begins: no new sales, no new purchases. Reports + history still accessible.',
        },
        {
          tone: 'rose',
          title: 'T+3 days',
          body: 'Grace ends. Full-screen takeover at login with renewal instructions. No dashboard access.',
        },
        {
          tone: 'emerald',
          title: 'After renewal',
          body: 'Vendor marks paid in the admin portal; access restored instantly without re-login.',
        },
      ]}
    />
  </>
)

// =====================================================================
// 13. SETTINGS
// =====================================================================
const SectionSettings = (
  <>
    <SectionHeader
      num="13"
      icon={SettingsIcon}
      title="Settings"
      description="Store profile, GST registration, invoice prefix, logo, WhatsApp Cloud API, e-invoice GSP, loyalty, T&amp;C."
      tone="slate"
    />

    <SubHeader>The eight settings tabs</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FeatureCard icon={Building2} title="Business" tone="slate">
        Name, GSTIN, state code, address, phone, invoice prefix &amp; starting number.
      </FeatureCard>
      <FeatureCard icon={Sparkles} title="Logo" tone="teal">
        PNG up to 500KB. Prints on every invoice + public share page.
      </FeatureCard>
      <FeatureCard icon={Calculator} title="GST" tone="rose">
        Registration type, composition flag, default tax mode (inclusive / exclusive).
      </FeatureCard>
      <FeatureCard icon={Receipt} title="Invoice T&amp;C" tone="amber">
        Free-text block printed at the footer of every bill. Markdown supported.
      </FeatureCard>
      <FeatureCard icon={MessageCircle} title="WhatsApp" tone="emerald">
        Meta Cloud API credentials (phoneNumberId, accessToken). Test button verifies.
      </FeatureCard>
      <FeatureCard icon={ShieldCheck} title="E-Invoice" tone="violet">
        GSP endpoint + clientId/secret. Test connection any time.
      </FeatureCard>
      <FeatureCard icon={Users} title="Loyalty" tone="blue">
        Enable/disable, points earned per ₹100, redeem rate.
      </FeatureCard>
      <FeatureCard icon={KeyRound} title="Security" tone="rose">
        Password rotation, session timeout, 2FA (Phase 2).
      </FeatureCard>
    </div>

    <InfoBox tone="rose" icon={Lock} title="Secrets are write-only">
      WhatsApp tokens, GSP secrets, payment-gateway keys — once saved, the API returns
      them masked (<code className="text-[12px] px-1 bg-white/60 rounded">••••••••&lt;last4&gt;</code>). Submitting the masked value back never overwrites
      the real one. Only a fresh paste updates the secret.
    </InfoBox>
  </>
)

// =====================================================================
// 14. WHATSAPP
// =====================================================================
const SectionWhatsapp = (
  <>
    <SectionHeader
      num="14"
      icon={MessageCircle}
      title="WhatsApp Cloud API"
      description="One-click automated bill delivery from the POS once Meta Cloud API credentials are saved."
      tone="emerald"
    />

    <SubHeader>Two modes</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FeatureCard icon={Globe} title="wa.me mode (default)" tone="slate">
        No API setup. Click WhatsApp → browser opens{' '}
        <code className="text-[12px] px-1 bg-slate-100 rounded">wa.me/&lt;phone&gt;</code>{' '}
        with a pre-filled message. Cashier taps Send. Free, manual.
      </FeatureCard>
      <FeatureCard icon={Zap} title="API mode" tone="emerald">
        Credentials saved. Click WhatsApp → server POSTs directly to Meta&rsquo;s Graph
        API. Customer receives the bill instantly. No cashier intervention.
      </FeatureCard>
    </div>

    <SubHeader>Setup</SubHeader>
    <Checklist
      items={[
        { text: 'Register a Meta for Business account.' },
        { text: 'Create a WhatsApp Business app, get phoneNumberId.' },
        { text: 'Generate a permanent access token under System Users.' },
        { text: 'Paste into Settings → WhatsApp; tap Test with your own number.' },
        { text: 'Test message received → flip Enabled. POS now uses API mode.' },
      ]}
    />

    <InfoBox tone="amber" title="24-hour customer-service window">
      Outside Meta&rsquo;s 24-hour customer-service window you must use a pre-approved
      template message. Set the templateName + 4 ordered body params (customer, invoice,
      total, URL) in Settings.
    </InfoBox>
  </>
)

// =====================================================================
// 15. HELP & SUPPORT
// =====================================================================
const SectionHelp = (
  <>
    <SectionHeader
      num="15"
      icon={HelpCircle}
      title="Help &amp; Support"
      description="Raise a ticket directly to your vendor. Threaded conversation, priority levels, full attachment support."
      tone="blue"
    />

    <SubHeader>Ticket types</SubHeader>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <FeatureCard icon={AlertCircle} title="Bug" tone="rose">
        Something broke. Include the error message and the steps to reproduce.
      </FeatureCard>
      <FeatureCard icon={Lightbulb} title="Feature request" tone="violet">
        Wishlist. Vendor reviews periodically and rolls high-demand items into the
        roadmap.
      </FeatureCard>
      <FeatureCard icon={CreditCard} title="Billing" tone="emerald">
        Subscription, plan change, invoice copies, GST input credit.
      </FeatureCard>
    </div>

    <SubHeader>Priority levels &amp; expected response</SubHeader>
    <Timeline
      items={[
        { tone: 'rose', title: 'P1 — Production down', body: 'Within 1 hour, weekday business hours.' },
        { tone: 'amber', title: 'P2 — Major function impaired', body: 'Within 4 hours.' },
        { tone: 'blue', title: 'P3 — Minor / cosmetic', body: 'Within 1 business day.' },
        { tone: 'slate', title: 'P4 — Feature request', body: 'Acknowledged within 3 business days.' },
      ]}
    />
  </>
)

// =====================================================================
// 16. SHORTCUTS
// =====================================================================
const SectionShortcuts = (
  <>
    <SectionHeader
      num="16"
      icon={KeyRound}
      title="Keyboard Shortcuts"
      description="The cashier-speed primitives. Memorise these and you never need a mouse on the POS."
      tone="violet"
    />

    <SubHeader>POS — global</SubHeader>
    <KeyTable
      rows={[
        { keys: 'F2', desc: 'Focus barcode / search box' },
        { keys: 'F3', desc: 'Pick customer (or set walk-in)' },
        { keys: 'F4', desc: 'Apply discount' },
        { keys: 'F8', desc: 'Open payment / tender screen' },
        { keys: 'F9', desc: 'Save sale' },
        { keys: 'F10', desc: 'Save &amp; Print' },
        { keys: 'Esc', desc: 'Cancel cart (with confirm)' },
      ]}
    />

    <SubHeader>Cart line</SubHeader>
    <KeyTable
      rows={[
        { keys: '+ / −', desc: 'Increase / decrease quantity by 1' },
        { keys: 'Del', desc: 'Remove the focused line' },
        { keys: 'Ctrl + D', desc: 'Discount on focused line' },
        { keys: 'Tab', desc: 'Move focus to next field' },
      ]}
    />

    <SubHeader>Navigation</SubHeader>
    <KeyTable
      rows={[
        { keys: 'G then P', desc: 'Go to POS' },
        { keys: 'G then S', desc: 'Go to Sales History' },
        { keys: 'G then I', desc: 'Go to Inventory' },
        { keys: 'Ctrl + K', desc: 'Open command palette (global search)' },
        { keys: '?', desc: 'Toggle this shortcut sheet' },
      ]}
    />
  </>
)

// =====================================================================
// 17. TROUBLESHOOTING
// =====================================================================
const SectionTroubleshooting = (
  <>
    <SectionHeader
      num="17"
      icon={AlertCircle}
      title="Troubleshooting"
      description="The seven most common issues and the fix for each."
      tone="rose"
    />

    <Timeline
      items={[
        {
          tone: 'rose',
          title: '&ldquo;Login failed&rdquo; / 401 on the first try',
          body: (
            <>
              Either the password is wrong or the user is inactive. Ask your admin to
              reset via <b>Org Admin → Users → Reset password</b>. If you&rsquo;re the
              super-admin trying to log into the tenant URL, you can&rsquo;t — use the{' '}
              <code className="text-[12px] px-1 bg-slate-100 rounded">/admin</code>{' '}
              portal instead.
            </>
          ),
        },
        {
          tone: 'amber',
          title: 'Bill saved but didn&rsquo;t print',
          body: 'Browser blocked the popup. Open the bill from Sales History and hit Print there — the document is already persisted.',
        },
        {
          tone: 'orange',
          title: 'Stock shows wrong after a return',
          body: 'The return creates a StockMovement (type: in). Check Inventory → Movements for that SKU. If you see the entry but stock didn\'t update, contact support — likely a transaction rolled back partway.',
        },
        {
          tone: 'blue',
          title: 'GSTR-1 totals don&rsquo;t match my Tally export',
          body: 'Tally aggregates per-invoice; Radsting per-line. The bill-level total is identical, but HSN-wise breakup may differ if a single bill had multiple HSNs at different rates. The portal accepts Radsting\'s — it\'s actually more accurate.',
        },
        {
          tone: 'violet',
          title: 'WhatsApp says &ldquo;Recipient phone number is not a WhatsApp account&rdquo;',
          body: 'Meta-side error. The phone is valid format but the customer doesn\'t use WhatsApp. Falls back gracefully — bill still saved, just no notification.',
        },
        {
          tone: 'emerald',
          title: 'E-Invoice IRN request times out',
          body: 'GSP or NIC portal is down. Sale is saved as usual — Radsting retries the IRN request automatically on the background queue. Check Settings → E-Invoice → Failed queue.',
        },
        {
          tone: 'slate',
          title: 'Dashboard KPIs look stale',
          body: 'Redis-cached at 5-min TTL. Hard-refresh (Ctrl+Shift+R) or just wait the cache out. The numbers in Sales / Reports tabs are always live.',
        },
      ]}
    />

    <InfoBox tone="teal" title="When you can&rsquo;t find the answer here">
      Raise a ticket from <b>Help &amp; Support</b> with the steps to reproduce and a
      screenshot. Your vendor sees it immediately.
    </InfoBox>
  </>
)

// =====================================================================
// Section index
// =====================================================================

const SECTIONS: DocSection[] = [
  {
    id: 'getting-started',
    num: '01',
    title: 'Getting Started',
    description: 'First sign-in, setup checklist, your first sale.',
    icon: Rocket,
    tone: 'teal',
    searchBlob: 'getting started first sign-in setup checklist password vendor role admin manager cashier accountant ca dashboard tour sidebar pos billing inventory purchases books reports business profile GSTIN state code invoice prefix logo chart of accounts product HSN customer test sale',
    content: SectionGettingStarted,
  },
  {
    id: 'pos',
    num: '02',
    title: 'POS & Billing',
    description: 'Barcode lookup, cart, tender, atomic commit.',
    icon: ScanLine,
    tone: 'blue',
    searchBlob: 'pos billing barcode scan cart tender payment cash UPI card credit loyalty split atomic stock ledger GST CGST SGST IGST walk-in customer print share whatsapp wa.me public bill returns void',
    content: SectionPos,
  },
  {
    id: 'inventory',
    num: '03',
    title: 'Inventory',
    description: 'Products, batches, warranties, transfers.',
    icon: Package,
    tone: 'violet',
    searchBlob: 'inventory product master SKU barcode HSN GST rate MRP selling price purchase price warranty months variants batch expiry stock movement low stock alerts inter-store transfer adjustment audit',
    content: SectionInventory,
  },
  {
    id: 'sales',
    num: '04',
    title: 'Sales History',
    description: 'Search, reprint, share, void.',
    icon: Receipt,
    tone: 'emerald',
    searchBlob: 'sales history invoice number customer search reprint share whatsapp link QR code copy email immutable returns void shareToken public bill',
    content: SectionSales,
  },
  {
    id: 'purchases',
    num: '05',
    title: 'Purchases',
    description: 'POs, GRNs, supplier payments, ancillary costs.',
    icon: Truck,
    tone: 'amber',
    searchBlob: 'purchases PO purchase order GRN goods receipt note multi-GRN partial supplier payment ancillary expenses labour packaging freight landed cost outstanding by supplier by item cancel pre-close',
    content: SectionPurchases,
  },
  {
    id: 'parties',
    num: '06',
    title: 'Customers & Suppliers',
    description: 'Address book + ledger view.',
    icon: Users,
    tone: 'blue',
    searchBlob: 'customers suppliers parties phone email GSTIN address credit limit outstanding loyalty points ledger statement receivable payable state code',
    content: SectionParties,
  },
  {
    id: 'books',
    num: '07',
    title: 'Books — Accounting',
    description: 'Double-entry, vouchers, P&L, balance sheet.',
    icon: BookText,
    tone: 'emerald',
    searchBlob: 'books accounting double entry ledger chart of accounts groups assets liabilities income expense equity voucher payment receipt journal contra trial balance profit loss balance sheet cash flow day book bank reconciliation',
    content: SectionBooks,
  },
  {
    id: 'gst',
    num: '08',
    title: 'GST & E-Invoice',
    description: 'GSTR-1, GSTR-3B, HSN, IRN, GSP integration.',
    icon: Calculator,
    tone: 'rose',
    searchBlob: 'gst gstr-1 gstr-3b hsn summary b2b b2c large small cdnr cdnur e-invoice IRN QR NIC IRP GSP integration ITC input tax credit output tax liability net payable carry forward',
    content: SectionGst,
  },
  {
    id: 'reports',
    num: '09',
    title: 'Reports & Insights',
    description: 'KPIs, sales, profit, stock, customer aging.',
    icon: FileBarChart,
    tone: 'orange',
    searchBlob: 'reports insights dashboard kpi sales profit margin stock valuation purchase report customer aging branch comparison anomaly insights export CSV excel',
    content: SectionReports,
  },
  {
    id: 'branches',
    num: '10',
    title: 'Branches',
    description: 'Multi-store, isolation, transfers.',
    icon: Building2,
    tone: 'teal',
    searchBlob: 'branches multi-store storeId isolation tenant scopeToStore JWT middleware inter-store transfer org-wide users billing audit log',
    content: SectionBranches,
  },
  {
    id: 'users',
    num: '11',
    title: 'Users & Roles',
    description: 'RBAC, permissions, audit log.',
    icon: Users,
    tone: 'violet',
    searchBlob: 'users roles rbac admin manager cashier accountant ca super admin permissions discount void audit log immutable IP address user agent',
    content: SectionUsers,
  },
  {
    id: 'subscription',
    num: '12',
    title: 'Subscription & Billing',
    description: 'Plans, trial, expiry, grace period.',
    icon: CreditCard,
    tone: 'blue',
    searchBlob: 'subscription billing plan starter pro enterprise trial 14 days user addon grace period expiry takeover renewal vendor admin',
    content: SectionSubscription,
  },
  {
    id: 'settings',
    num: '13',
    title: 'Settings',
    description: 'Profile, logo, GST, WhatsApp, e-invoice, T&C.',
    icon: SettingsIcon,
    tone: 'slate',
    searchBlob: 'settings business profile logo GST registration invoice prefix terms conditions whatsapp e-invoice loyalty security secrets masked password',
    content: SectionSettings,
  },
  {
    id: 'whatsapp',
    num: '14',
    title: 'WhatsApp Cloud API',
    description: 'Setup, templates, API vs wa.me mode.',
    icon: MessageCircle,
    tone: 'emerald',
    searchBlob: 'whatsapp cloud api meta business phoneNumberId access token template 24 hour customer service window wa.me automated send',
    content: SectionWhatsapp,
  },
  {
    id: 'help',
    num: '15',
    title: 'Help & Support',
    description: 'Tickets, priorities, vendor response SLAs.',
    icon: HelpCircle,
    tone: 'blue',
    searchBlob: 'help support ticket bug feature request billing priority P1 P2 P3 P4 response sla vendor',
    content: SectionHelp,
  },
  {
    id: 'shortcuts',
    num: '16',
    title: 'Keyboard Shortcuts',
    description: 'F-keys, cart, navigation, command palette.',
    icon: KeyRound,
    tone: 'violet',
    searchBlob: 'keyboard shortcuts F2 F3 F4 F8 F9 F10 esc cart line quantity delete discount tab navigation go to pos sales inventory ctrl K command palette',
    content: SectionShortcuts,
  },
  {
    id: 'troubleshooting',
    num: '17',
    title: 'Troubleshooting',
    description: 'Common errors and their fixes.',
    icon: AlertCircle,
    tone: 'rose',
    searchBlob: 'troubleshooting login failed 401 password reset print blocked popup stock wrong return gstr-1 totals tally whatsapp recipient not account e-invoice IRN timeout dashboard stale',
    content: SectionTroubleshooting,
  },
]

// =====================================================================
// Component
// =====================================================================

export default function DeveloperDocs() {
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string>('getting-started')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return SECTIONS
    return SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.searchBlob.toLowerCase().includes(q),
    )
  }, [search])

  // Highlight the section currently scrolled into the top of the viewport.
  useEffect(() => {
    const handler = () => {
      let bestId = filtered[0]?.id ?? 'getting-started'
      let bestDistance = Infinity
      for (const s of filtered) {
        const el = document.getElementById(`doc-${s.id}`)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        // Want the section whose top is closest to (but not below) ~120px.
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
  }, [filtered])

  return (
    <div className="bg-linear-to-b from-slate-50 to-white -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 rounded-xl">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-teal-700 via-teal-600 to-emerald-700 text-white p-7 sm:p-9 mb-6">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase text-teal-100 mb-2">
            <BookOpen className="w-3.5 h-3.5" />
            Radsting POS &amp; ERP — Operator Reference
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
            Everything your team needs to run the store,
            <br className="hidden sm:block" /> in one place.
          </h1>
          <p className="mt-3 text-[14px] text-teal-50/90 leading-relaxed max-w-2xl">
            From the cashier&rsquo;s first bill to the accountant&rsquo;s GSTR-3B filing —
            every workflow, every edge case, every shortcut. Read top-to-bottom on day
            one, or use the search to jump straight to what you need.
          </p>
        </div>

        <div className="relative z-10 mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
          <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-3">
            <div className="text-[11px] font-semibold tracking-widest uppercase text-teal-100">
              Sections
            </div>
            <div className="mt-1 text-2xl font-bold">17</div>
          </div>
          <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-3">
            <div className="text-[11px] font-semibold tracking-widest uppercase text-teal-100">
              Modules
            </div>
            <div className="mt-1 text-2xl font-bold">9</div>
          </div>
          <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-3">
            <div className="text-[11px] font-semibold tracking-widest uppercase text-teal-100">
              Engines
            </div>
            <div className="mt-1 text-2xl font-bold">4</div>
          </div>
          <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-3">
            <div className="text-[11px] font-semibold tracking-widest uppercase text-teal-100">
              Roles
            </div>
            <div className="mt-1 text-2xl font-bold">5</div>
          </div>
        </div>
      </div>

      {/* Search bar — sticky */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-linear-to-b from-white via-white/95 to-white/0 backdrop-blur-sm">
        <div className="relative max-w-2xl">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the docs — e.g. 'warranty', 'GSTR', 'voucher', 'F9 shortcut'…"
            className="h-11 pl-10 text-sm bg-white border-slate-200 shadow-sm focus-visible:ring-teal-200"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-[12px] font-medium"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* TOC strip */}
      <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-2">
        <div className="flex gap-2 min-w-max">
          {filtered.map((s) => {
            const Icon = s.icon
            const active = s.id === activeId
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setActiveId(s.id)
                  const el = document.getElementById(`doc-${s.id}`)
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900'
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

      {/* No-match */}
      {filtered.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center my-6">
          <Search className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <div className="text-[15px] font-semibold text-slate-900">
            No sections match &ldquo;{search}&rdquo;
          </div>
          <p className="text-[13px] text-slate-500 mt-1">
            Try a different term — e.g. &ldquo;warranty&rdquo;, &ldquo;voucher&rdquo;,
            or &ldquo;HSN&rdquo;.
          </p>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-10 py-4">
        {filtered.map((s) => (
          <section
            key={s.id}
            id={`doc-${s.id}`}
            className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm"
          >
            {s.content}
          </section>
        ))}
      </div>

      {/* Footer */}
      <div className="rounded-2xl bg-linear-to-br from-slate-900 to-slate-800 text-white p-6 sm:p-8 my-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-teal-500/20 ring-1 ring-teal-400/30 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-teal-300" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold">Still stuck on something?</h3>
            <p className="mt-1 text-[13.5px] text-slate-300 leading-relaxed max-w-2xl">
              Open the <b className="text-white">Help &amp; Support</b> tab on the left
              and raise a ticket — your vendor sees it the second you hit submit and
              replies inline. No email ping-pong, no phone tag.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Pill tone="teal">Avg first response · 2h</Pill>
              <Pill tone="emerald">Resolution SLA by priority</Pill>
              <Pill tone="violet">Threaded conversation</Pill>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-500 hidden sm:block" />
        </div>
      </div>
    </div>
  )
}
