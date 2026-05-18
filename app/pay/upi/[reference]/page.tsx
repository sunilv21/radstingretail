'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import {
  IndianRupee,
  Smartphone,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Building2,
  Receipt,
  Lock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'

interface UpiPaymentInfo {
  reference: string
  amount: number
  currency: string
  type: 'subscription' | 'user_addon' | 'manual' | 'other'
  planName: string
  addonRole: string | null
  addonQuantity: number
  organizationName: string
  status: string
  upi: {
    vpa: string
    payeeName: string
  }
}

const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

/**
 * UPI checkout. Public (no auth) — when the vendor's gateway is
 * configured as `upi`, the tenant's "Pay" click resolves to this page
 * (same-tab) instead of opening an external gateway in a new tab.
 *
 * Layout: classic two-column ecommerce checkout. Order summary on the
 * left, payment area (QR + deep-link + manual VPA) on the right. After
 * the tenant pays via their UPI app they hit "I've paid" and we send
 * them to Settings → Billing where the vendor confirms.
 *
 * Lives outside `/dashboard/*` so the sidebar/auth chrome doesn't show
 * — and so the link is shareable with whoever's actually paying the
 * bill (accountant, billing person, etc.).
 */
export default function UpiCheckoutPage() {
  const params = useParams<{ reference: string }>()
  const router = useRouter()
  const reference = String(params?.reference || '')

  const [data, setData] = useState<UpiPaymentInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<'vpa' | 'reference' | 'amount' | null>(null)

  useEffect(() => {
    setLoading(true)
    api
      .get<UpiPaymentInfo>(`/public/billing/upi/${reference}`)
      .then((res) => setData(res))
      .catch((e) => {
        if (e instanceof ApiError) setErr(e.message)
        else setErr('Could not load payment details')
      })
      .finally(() => setLoading(false))
  }, [reference])

  const description = useMemo(() => {
    if (!data) return ''
    if (data.type === 'subscription') return `${data.planName || 'Subscription'} — renewal`
    if (data.type === 'user_addon')
      return `${data.addonQuantity} × ${data.addonRole} user${data.addonQuantity === 1 ? '' : 's'}`
    return 'Software vendor payment'
  }, [data])

  const lineLabel = useMemo(() => {
    if (!data) return ''
    if (data.type === 'subscription') return data.planName || 'Plan renewal'
    if (data.type === 'user_addon')
      return `Extra user slots — ${data.addonRole}`
    return 'Software vendor payment'
  }, [data])

  // Canonical UPI deep-link.
  // Spec: pa = payee VPA · pn = payee name · am = amount
  //       cu = currency · tr = txn reference · tn = note
  const upiLink = useMemo(() => {
    if (!data?.upi?.vpa) return ''
    const params = new URLSearchParams({
      pa: data.upi.vpa,
      pn: data.upi.payeeName || 'Vendor',
      am: String(data.amount),
      cu: data.currency || 'INR',
      tr: data.reference,
      tn: description.slice(0, 80),
    })
    return `upi://pay?${params.toString()}`
  }, [data, description])

  const copy = (text: string, kind: typeof copied) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind)
      window.setTimeout(() => setCopied((k) => (k === kind ? null : k)), 1800)
    })
  }

  if (loading) {
    return (
      <Shell>
        <div className="text-sm text-muted-foreground flex items-center justify-center gap-2 py-24 col-span-full">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading checkout…
        </div>
      </Shell>
    )
  }
  if (err || !data) {
    return (
      <Shell>
        <div className="col-span-full max-w-md mx-auto rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900 p-3 text-sm flex items-center gap-2 text-rose-900 dark:text-rose-200">
          <AlertCircle className="w-4 h-4" />
          {err || 'Payment not found'}
        </div>
      </Shell>
    )
  }
  if (!data.upi.vpa) {
    return (
      <Shell>
        <div className="col-span-full max-w-md mx-auto rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 text-sm flex items-center gap-2 text-amber-900 dark:text-amber-200">
          <AlertCircle className="w-4 h-4" />
          UPI is not configured for this vendor yet. Please contact them directly.
        </div>
      </Shell>
    )
  }

  const isFinal = data.status === 'completed' || data.status === 'rejected'

  return (
    <Shell>
      {/* ---- LEFT — order summary -------------------------------------- */}
      <section className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md p-5 space-y-4 self-start">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-400">
          <Receipt className="w-3.5 h-3.5" />
          Order summary
        </div>
        <div className="flex items-center gap-2 text-slate-200 text-sm">
          <Building2 className="w-4 h-4 text-rose-400" />
          <span className="font-semibold">{data.organizationName}</span>
        </div>

        {/* Single line item */}
        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{lineLabel}</div>
              <div className="text-[12px] text-slate-400 truncate">
                {data.type === 'subscription'
                  ? 'One-time renewal payment'
                  : data.type === 'user_addon'
                    ? `${inr(data.amount / Math.max(1, data.addonQuantity))} per slot`
                    : 'Vendor payment'}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold tabular-nums text-slate-100">
                {inr(data.amount)}
              </div>
              {data.type === 'user_addon' && (
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                  qty {data.addonQuantity}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="space-y-1 pt-1">
          <Row label="Subtotal" value={inr(data.amount)} />
          <Row label="Taxes / fees" value="—" subtle />
          <div className="border-t border-white/10 my-2" />
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">Total</span>
            <span className="text-2xl font-bold tabular-nums text-white">{inr(data.amount)}</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-mono pt-1">
          Reference {data.reference}
        </div>

        {/* Footer trust strip */}
        <div className="flex items-center gap-2 text-[11px] text-slate-500 border-t border-white/10 pt-3">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          Direct UPI handoff — payment goes straight to your software vendor&rsquo;s account.
        </div>
      </section>

      {/* ---- RIGHT — payment ------------------------------------------- */}
      <section className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-400">
            <Lock className="w-3.5 h-3.5" />
            Payment method
          </div>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> No fees
          </span>
        </div>
        <div className="text-base font-semibold text-white">
          UPI · scan or tap to pay
        </div>

        {/* QR */}
        <div className="rounded-xl bg-white p-3 mx-auto w-fit shadow-[0_24px_60px_-24px_rgba(244,63,94,0.4)]">
          <QRCodeSVG value={upiLink} size={184} level="M" marginSize={1} />
        </div>
        <div className="text-center text-[12px] text-slate-400">
          Open Google Pay / PhonePe / Paytm / BHIM / your bank&rsquo;s app and scan.
        </div>

        {/* Deep link CTA — works on mobile, ignored on desktop */}
        <a
          href={upiLink}
          className="block w-full inline-flex items-center justify-center gap-2 rounded-xl text-white text-sm font-semibold h-11 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 shadow-[0_10px_24px_-10px_rgba(244,63,94,0.7)] transition-all"
        >
          <Smartphone className="w-4 h-4" />
          Pay with UPI app
        </a>

        {/* Manual VPA — for users who prefer copy-paste */}
        <div className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 space-y-1.5 text-[12px]">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Or pay manually
          </div>
          <CopyRow
            label="UPI ID"
            value={data.upi.vpa}
            copied={copied === 'vpa'}
            onCopy={() => copy(data.upi.vpa, 'vpa')}
          />
          <CopyRow
            label="Payee"
            value={data.upi.payeeName || 'Software vendor'}
            copied={false}
            onCopy={() => {}}
            hideCopy
          />
          <CopyRow
            label="Amount"
            value={inr(data.amount)}
            copied={copied === 'amount'}
            onCopy={() => copy(String(data.amount), 'amount')}
          />
          <CopyRow
            label="Note / reference"
            value={data.reference}
            copied={copied === 'reference'}
            onCopy={() => copy(data.reference, 'reference')}
          />
        </div>

        {/* After-pay CTA */}
        {isFinal ? (
          <div
            className={`rounded-xl px-3 py-2 text-[13px] flex items-center gap-2 ${
              data.status === 'completed'
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            {data.status === 'completed' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            This payment has been {data.status}.
          </div>
        ) : (
          <a
            href={`/dashboard/settings?tab=billing&ref=${data.reference}`}
            className="block w-full inline-flex items-center justify-center gap-2 rounded-xl text-slate-200 text-sm font-medium h-10 border border-white/15 hover:bg-white/5 transition-colors"
          >
            I&rsquo;ve paid — confirm
            <ArrowRight className="w-4 h-4" />
          </a>
        )}

        <p className="text-[11px] text-center text-slate-500 leading-relaxed">
          Once paid, your vendor verifies the UTR and activates the entitlement within
          minutes. Confirm faster by entering the reference on the Billing tab.
        </p>
      </section>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100">
      {/* Brand bar */}
      <header className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-[12px] text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <div className="inline-flex items-center gap-2">
          <IndianRupee className="w-4 h-4 text-rose-400" />
          <span className="text-[13px] font-semibold tracking-wide uppercase text-slate-200">
            Checkout
          </span>
        </div>
        <div className="w-12" />
      </header>

      {/* Two-column body. Stacks on mobile. */}
      <main className="max-w-4xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {children}
      </main>
    </div>
  )
}

function Row({
  label,
  value,
  subtle,
}: {
  label: string
  value: string
  subtle?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between text-[12px]">
      <span className="text-slate-400 uppercase tracking-wider">{label}</span>
      <span className={subtle ? 'text-slate-500' : 'text-slate-200 tabular-nums'}>{value}</span>
    </div>
  )
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
  hideCopy,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  hideCopy?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 w-24 shrink-0">
        {label}
      </span>
      <span className="flex-1 font-mono text-[12px] text-slate-200 truncate">{value}</span>
      {!hideCopy && (
        <button
          onClick={onCopy}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            copied
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
              : 'bg-card border-border text-muted-foreground hover:bg-muted'
          }`}
        >
          {copied ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Copied
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Copy className="w-3 h-3" /> Copy
            </span>
          )}
        </button>
      )}
    </div>
  )
}
