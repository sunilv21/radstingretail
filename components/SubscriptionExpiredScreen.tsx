'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Send,
  Crown,
  CheckCircle2,
  Star,
  ShieldCheck,
  Database,
  Cloud,
  Lock,
  Headphones,
  Phone,
  Mail,
  LogOut,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { startCheckout, checkoutErrorMessage } from '@/lib/checkout'

interface Props {
  organizationName?: string | null
  organizationId?: string | null
  /** Days since the subscription / trial cutoff, used for the description copy. */
  daysSinceExpiry?: number | null
  vendorPayUrl?: string | null
  vendorEmail?: string | null
  vendorPhone?: string | null
  vendorWhatsApp?: string | null
  onLogout: () => void
}

// --- Public plan shape (matches what /public/plans returns) ---
type BillingCycle =
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly'
  | '2year'
  | 'lifetime'
type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise' | 'custom'

interface PublicPlan {
  id: string
  code: string
  name: string
  description: string
  tier: PlanTier
  price: number
  currency: string
  billingCycle: BillingCycle
  effectiveMonthlyAmount: number
  features: string[]
  paymentUrl: string
  savingsLabel: string
  isFeatured: boolean
  displayOrder: number
}

interface PlatformSettings {
  paymentGateway: {
    url: string
    provider: string
    currency: string
    mode: 'live' | 'test'
  }
  vendorContact: {
    whatsapp: string
    phone: string
    email: string
    website: string
  }
  brand: {
    vendorName: string
    supportHours: string
  }
}

const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  yearly: 'Yearly',
  '2year': '2 Year',
  lifetime: 'Lifetime',
}

const CYCLE_SUFFIX: Record<BillingCycle, string> = {
  monthly: '/ month',
  quarterly: '/ 3 months',
  half_yearly: '/ 6 months',
  yearly: '/ year',
  '2year': '/ 2 years',
  lifetime: 'one-time',
}

const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

/**
 * Fullscreen takeover when a tenant's subscription has lapsed. Reads
 * the live plan catalogue authored in the vendor admin portal — pricing,
 * discounts and the per-plan hosted payment URL all flow from there.
 *
 * Sized so the entire panel fits in a 100vh window without scrolling.
 */
export default function SubscriptionExpiredScreen({
  organizationName,
  organizationId,
  daysSinceExpiry,
  vendorPayUrl,
  vendorEmail,
  vendorPhone,
  vendorWhatsApp,
  onLogout,
}: Props) {
  const router = useRouter()
  const [paying, setPaying] = useState<string | null>(null)
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCycle, setActiveCycle] = useState<BillingCycle | null>(null)

  useEffect(() => {
    // Plans + platform settings load in parallel — both feed the
    // pay-button URL chain, so we wait until both have responded
    // (or errored) before declaring "loaded".
    Promise.allSettled([
      api.get<PublicPlan[]>('/public/plans'),
      api.get<PlatformSettings>('/public/platform-settings'),
    ])
      .then(([planRes, settingsRes]) => {
        if (planRes.status === 'fulfilled') setPlans(planRes.value || [])
        if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value)
      })
      .finally(() => setLoading(false))
  }, [])

  // Effective vendor channels — props win, then platform-settings fill
  // gaps. This is what makes the page work end-to-end without the env
  // vars being set on the build.
  const effectiveContact = {
    payUrl: vendorPayUrl || settings?.paymentGateway.url || '',
    whatsapp: vendorWhatsApp || settings?.vendorContact.whatsapp || '',
    phone: vendorPhone || settings?.vendorContact.phone || '',
    email: vendorEmail || settings?.vendorContact.email || '',
  }

  // Build the toggle dynamically from the cycles the vendor has actually
  // published. Default the active tab to monthly if present, otherwise
  // the first available cycle.
  const cyclesAvailable = useMemo<BillingCycle[]>(() => {
    const seen = new Set<BillingCycle>()
    for (const p of plans) seen.add(p.billingCycle)
    const order: BillingCycle[] = ['monthly', 'quarterly', 'half_yearly', 'yearly', '2year', 'lifetime']
    return order.filter((c) => seen.has(c))
  }, [plans])

  useEffect(() => {
    if (!activeCycle && cyclesAvailable.length > 0) {
      setActiveCycle(cyclesAvailable.includes('monthly') ? 'monthly' : cyclesAvailable[0])
    }
  }, [cyclesAvailable, activeCycle])

  // Plans visible in the current cycle, sorted for display.
  const visible = useMemo(
    () =>
      plans
        .filter((p) => p.billingCycle === activeCycle)
        .sort(
          (a, b) =>
            (a.displayOrder ?? 0) - (b.displayOrder ?? 0) ||
            (a.price ?? 0) - (b.price ?? 0),
        ),
    [plans, activeCycle],
  )

  // Per-cycle savings label. Vendor-set on the plan wins; otherwise
  // compute it by comparing the cheapest monthly plan against this
  // cycle's lowest effective monthly amount.
  const savingsForCycle = useMemo(() => {
    const out: Partial<Record<BillingCycle, string>> = {}
    const monthlyMin = plans
      .filter((p) => p.billingCycle === 'monthly')
      .reduce((m, p) => (p.price < m ? p.price : m), Infinity)
    for (const c of cyclesAvailable) {
      if (c === 'monthly') continue
      const planForCycle = plans.find((p) => p.billingCycle === c && p.savingsLabel)
      if (planForCycle?.savingsLabel) {
        out[c] = planForCycle.savingsLabel
        continue
      }
      if (!Number.isFinite(monthlyMin)) continue
      const minEffective = plans
        .filter((p) => p.billingCycle === c && p.effectiveMonthlyAmount > 0)
        .reduce((m, p) => (p.effectiveMonthlyAmount < m ? p.effectiveMonthlyAmount : m), Infinity)
      if (Number.isFinite(minEffective) && minEffective < monthlyMin) {
        const pct = Math.round(((monthlyMin - minEffective) / monthlyMin) * 100)
        if (pct > 0) out[c] = `Save ${pct}%`
      }
    }
    return out
  }, [plans, cyclesAvailable])

  // ---- Payment routing -------------------------------------------------
  // Per-plan URL > vendor-portal payment gateway URL > prop-passed pay
  // URL > WhatsApp pre-fill > mailto pre-fill > null (no destination).
  // The global URL gets `?org=&plan=&amount=` appended so the gateway
  // page knows which tenant + plan + amount to charge.
  const phoneClean = effectiveContact.phone.replace(/[^\d+]/g, '')

  const appendOrgPlan = (raw: string, plan?: PublicPlan): string => {
    try {
      const u = new URL(raw)
      if (plan) {
        u.searchParams.set('plan', plan.code)
        u.searchParams.set('amount', String(plan.price))
      }
      if (organizationId) u.searchParams.set('org', organizationId)
      return u.toString()
    } catch {
      return raw
    }
  }

  // Click handler for the per-card CTA. Records a PENDING payment via
  // /api/billing/intent (so the row exists in the tenant's history
  // even if they abandon the gateway), then opens the gateway URL.
  const onChoose = async (plan: PublicPlan) => {
    if (paying) return
    setPaying(plan.code)
    try {
      const intent = await startCheckout(
        { type: 'subscription', planCode: plan.code },
        {
          whatsappFallback: effectiveContact.whatsapp,
          emailFallback: effectiveContact.email,
        },
      )
      toast.success(
        intent.gatewayUrl
          ? 'Redirecting to payment — finish then return to confirm.'
          : 'Opened your vendor contact — payment reference saved.',
      )
      router.push(`/dashboard/settings?tab=billing&ref=${intent.reference}`)
    } catch (err) {
      toast.error(checkoutErrorMessage(err))
    } finally {
      setPaying(null)
    }
  }

  // For the empty-state CTA when no plans exist — route through a
  // "manual" intent so the row still lands in history.
  const onContactPay = async () => {
    if (paying) return
    setPaying('__contact__')
    try {
      // Without a plan we can't create a subscription intent — so we
      // just fall back to the WhatsApp / email deeplink chain inline.
      if (effectiveContact.whatsapp) {
        const wa = effectiveContact.whatsapp.replace(/[^\d]/g, '')
        const text = `Hi, the subscription for "${organizationName || ''}" has expired. Please share the payment link.`
        window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
      } else if (effectiveContact.email) {
        const subject = `Renew subscription — ${organizationName || ''}`
        const body = 'Please share the payment link to renew.'
        window.location.href = `mailto:${effectiveContact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      } else if (effectiveContact.payUrl) {
        window.open(appendOrgPlan(effectiveContact.payUrl), '_blank', 'noopener,noreferrer')
      }
    } finally {
      setPaying(null)
    }
  }

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-3">
      {/* Ambient background — orange/red on the left, blue/purple on the right. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 -left-32 w-[28rem] h-[28rem] rounded-full bg-orange-600/25 blur-[140px]" />
        <div className="absolute bottom-0 -left-20 w-[20rem] h-[20rem] rounded-full bg-rose-600/20 blur-[120px]" />
        <div className="absolute -top-20 -right-32 w-[28rem] h-[28rem] rounded-full bg-blue-600/30 blur-[140px]" />
        <div className="absolute bottom-1/3 -right-24 w-[24rem] h-[24rem] rounded-full bg-purple-600/25 blur-[140px]" />
        <div className="absolute top-32 left-40 w-32 h-20 opacity-20">
          {Array.from({ length: 40 }).map((_, i) => (
            <span
              key={i}
              className="absolute w-1 h-1 rounded-full bg-white/40"
              style={{ left: `${(i % 10) * 12}px`, top: `${Math.floor(i / 10) * 14}px` }}
            />
          ))}
        </div>
      </div>

      {/* Main card */}
      <div className="relative w-full max-w-5xl">
        {/* Floating Radsting logo */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
          <div className="rounded-full bg-white p-1 shadow-[0_0_28px_rgba(255,255,255,0.18)]">
            <Image
              src="/Radsting-logo.png"
              alt="Radsting"
              width={68}
              height={68}
              className="rounded-full"
              priority
            />
          </div>
        </div>

        <div
          className="
            relative rounded-3xl px-5 py-6 md:px-8 md:py-7 mt-7
            bg-gradient-to-b from-slate-900/70 to-slate-950/85
            backdrop-blur-md
            border border-white/[0.06]
            shadow-[0_40px_120px_-20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)_inset]
          "
        >
          {/* ---- Header row ---- */}
          <div className="flex items-center gap-5 md:gap-7">
            <HourglassIllustration />
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 bg-clip-text text-transparent leading-tight">
                Subscription Expired
              </h1>
              {organizationName && (
                <div className="mt-1 flex items-center gap-2 text-slate-200">
                  <Building2 className="w-4 h-4 text-orange-400" />
                  <span className="text-base font-semibold">{organizationName}</span>
                </div>
              )}
              <p className="mt-1.5 text-[13px] text-slate-400 leading-snug max-w-2xl">
                Your subscription
                {typeof daysSinceExpiry === 'number' && daysSinceExpiry > 0 ? (
                  <> ended <b className="text-slate-200">{daysSinceExpiry} day{daysSinceExpiry === 1 ? '' : 's'} ago</b></>
                ) : (
                  <> has ended</>
                )}
                . Renew now to restore access to billing, POS, inventory and all features.
              </p>
            </div>
          </div>

          {/* ---- Billing cycle toggle (only renders when 2+ cycles published) ---- */}
          {cyclesAvailable.length > 1 && (
            <div className="flex justify-center my-3">
              <div className="inline-flex items-center gap-1 p-1 rounded-full border border-white/10 bg-slate-950/60">
                {cyclesAvailable.map((c) => {
                  const active = activeCycle === c
                  const badge = savingsForCycle[c]
                  return (
                    <button
                      key={c}
                      onClick={() => setActiveCycle(c)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                        active
                          ? 'bg-orange-500/15 text-orange-300 shadow-[0_0_18px_-4px_rgba(251,146,60,0.6)]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>{CYCLE_LABEL[c]}</span>
                      {badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                          {badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ---- Plans grid ---- */}
          {loading ? (
            <div className="py-12 flex items-center justify-center text-sm text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading plans…
            </div>
          ) : visible.length === 0 ? (
            <EmptyPlansState onContact={onContactPay} canContact={!!effectiveContact.whatsapp || !!effectiveContact.email || !!effectiveContact.payUrl} />
          ) : (
            <div
              className={
                visible.length === 1
                  ? 'grid grid-cols-1 max-w-md mx-auto gap-3 md:gap-4'
                  : visible.length === 2
                    ? 'grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4'
                    : 'grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4'
              }
            >
              {visible.map((p, idx) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  paying={paying === p.code}
                  onPay={() => onChoose(p)}
                  // Highlight by `isFeatured`; if none flagged, default
                  // to the middle card so the layout still has a visual focal point.
                  highlighted={
                    visible.some((x) => x.isFeatured)
                      ? p.isFeatured
                      : idx === Math.floor(visible.length / 2) && visible.length >= 3
                  }
                  position={idx === 0 ? 'first' : idx === visible.length - 1 ? 'last' : 'middle'}
                />
              ))}
            </div>
          )}

          {/* ---- Reassurance row ---- */}
          <div className="mt-4 rounded-2xl border border-emerald-500/15 bg-slate-950/40 px-4 py-2.5 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2.5 flex-1 min-w-[220px]">
              <div className="w-9 h-9 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <div>
                <div className="text-emerald-300 font-semibold text-sm">Your Data is Safe</div>
                <div className="text-[11px] text-slate-400 leading-tight">
                  All your sales, inventory and accounting data is secure and will be available the
                  moment you renew.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <ReassureChip icon={<Database className="w-4 h-4" />} title="100% Secure" sub="Data Protection" />
              <ReassureChip icon={<Cloud className="w-4 h-4" />} title="Instant" sub="Restoration" />
              <ReassureChip icon={<Lock className="w-4 h-4" />} title="No Data" sub="Loss" />
            </div>
          </div>

          {/* ---- Footer support row ---- */}
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-3 text-[12px] text-slate-400">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-slate-300" />
              <span>Need help? Contact our support team</span>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {effectiveContact.phone && (
                <a
                  href={`tel:${phoneClean}`}
                  className="flex items-center gap-1.5 hover:text-slate-200 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" /> {effectiveContact.phone}
                </a>
              )}
              {effectiveContact.email && (
                <a
                  href={`mailto:${effectiveContact.email}`}
                  className="flex items-center gap-1.5 hover:text-slate-200 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" /> {effectiveContact.email}
                </a>
              )}
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1.5 text-slate-500 hover:text-rose-400 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" /> Log out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// Plan card — variant chosen by the plan's properties, not its index.
// =====================================================================

function PlanCard({
  plan,
  paying,
  onPay,
  highlighted,
  position,
}: {
  plan: PublicPlan
  paying: boolean
  onPay: () => void
  highlighted: boolean
  position: 'first' | 'middle' | 'last'
}) {
  void position
  // Tier drives icon + accent colour. Falls back by tier when the plan
  // doesn't specify one explicitly.
  const isEnterprise = plan.tier === 'enterprise'
  const Icon =
    plan.tier === 'pro' || highlighted
      ? Crown
      : isEnterprise
        ? Building2
        : Send

  // Accent: highlighted = warm, enterprise = purple, others = orange.
  const accent = highlighted
    ? {
        icon: 'text-amber-300 border-amber-300/50',
        price: 'text-orange-300',
        ring: 'border-orange-500/45 shadow-[0_0_30px_-10px_rgba(251,146,60,0.55)]',
      }
    : isEnterprise
      ? {
          icon: 'text-purple-400 border-purple-400/40',
          price: 'text-purple-300',
          ring: 'border-purple-500/20',
        }
      : {
          icon: 'text-orange-400 border-orange-400/40',
          price: 'text-orange-300',
          ring: 'border-orange-500/15',
        }

  const ctaLabel = highlighted
    ? 'Upgrade Now'
    : isEnterprise
      ? 'Contact Sales'
      : 'Choose Plan'

  return (
    <div
      className={`relative rounded-2xl bg-slate-950/55 border ${accent.ring} px-4 pt-4 pb-3 flex flex-col`}
    >
      {highlighted && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
          <div className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase text-white bg-gradient-to-r from-orange-500 to-rose-500 shadow-[0_4px_14px_-4px_rgba(244,63,94,0.6)] flex items-center gap-1">
            <Star className="w-3 h-3 fill-current" /> Most Popular
          </div>
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <div
          className={`w-8 h-8 rounded-full border ${accent.icon} flex items-center justify-center bg-slate-950/40`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-base font-bold text-white leading-tight truncate">{plan.name}</div>
          <div className="text-[11px] text-slate-400 leading-tight line-clamp-1">
            {plan.description || ' '}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        <span className={`text-3xl font-bold tracking-tight ${accent.price}`}>
          {inr(plan.price)}
        </span>
        <span className="text-[12px] text-slate-400">{CYCLE_SUFFIX[plan.billingCycle]}</span>
      </div>

      {plan.features.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 flex-1">
          {plan.features.slice(0, 5).map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-[12px] text-slate-300">
              <CheckCircle2
                className={`w-3.5 h-3.5 shrink-0 ${
                  highlighted ? 'text-orange-400' : isEnterprise ? 'text-purple-400' : 'text-orange-400'
                }`}
              />
              <span className="truncate">{f}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onPay}
        disabled={paying}
        className={
          highlighted
            ? 'mt-3 inline-flex items-center justify-center gap-2 rounded-xl text-white text-sm font-semibold h-10 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 shadow-[0_8px_22px_-8px_rgba(244,63,94,0.7)] transition-all disabled:opacity-60'
            : isEnterprise
              ? 'mt-3 inline-flex items-center justify-center gap-2 rounded-xl text-purple-300 text-sm font-semibold h-10 border border-purple-500/40 hover:bg-purple-500/10 transition-colors disabled:opacity-60'
              : 'mt-3 inline-flex items-center justify-center gap-2 rounded-xl text-orange-300 text-sm font-semibold h-10 border border-orange-500/40 hover:bg-orange-500/10 transition-colors disabled:opacity-60'
        }
      >
        {paying ? 'Starting checkout…' : ctaLabel}
      </button>
    </div>
  )
}

// =====================================================================
// Empty / error fallback when the vendor hasn't published any plans.
// =====================================================================

function EmptyPlansState({
  canContact,
  onContact,
}: {
  canContact: boolean
  onContact: () => void
}) {
  return (
    <div className="my-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-6 text-center max-w-2xl mx-auto">
      <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
      <h3 className="text-base font-semibold text-amber-300 mb-1">
        No plans published yet
      </h3>
      <p className="text-[13px] text-slate-400 mb-4">
        Your software vendor hasn&rsquo;t set up the pricing catalogue yet. Reach out
        directly to renew your subscription.
      </p>
      {canContact && (
        <button
          type="button"
          onClick={onContact}
          className="inline-flex items-center gap-2 rounded-xl text-white text-sm font-semibold h-10 px-5 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 shadow-[0_8px_22px_-8px_rgba(244,63,94,0.7)] transition-all"
        >
          Contact vendor to renew
        </button>
      )}
    </div>
  )
}

// =====================================================================
// Hourglass illustration — gold body on glowing oval halo with red badge
// =====================================================================

function HourglassIllustration() {
  return (
    <div className="relative w-32 h-32 md:w-36 md:h-36 shrink-0">
      <div className="absolute inset-0 rounded-full bg-orange-500/30 blur-2xl" />
      <div className="absolute inset-2 rounded-full border border-orange-500/40" />
      <div className="absolute inset-4 rounded-full border border-orange-500/25" />
      <svg
        viewBox="0 0 120 120"
        className="absolute inset-0 w-full h-full drop-shadow-[0_0_24px_rgba(251,146,60,0.55)]"
        aria-hidden
      >
        <defs>
          <linearGradient id="hg-body" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="50%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
          <linearGradient id="hg-stroke" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fcd34d" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
        </defs>
        <rect x="32" y="20" width="56" height="6" rx="3" fill="url(#hg-stroke)" />
        <rect x="32" y="94" width="56" height="6" rx="3" fill="url(#hg-stroke)" />
        <path
          d="M36 26 L84 26 L60 60 Z"
          fill="url(#hg-body)"
          stroke="url(#hg-stroke)"
          strokeWidth="2"
        />
        <path
          d="M60 60 L84 94 L36 94 Z"
          fill="url(#hg-body)"
          stroke="url(#hg-stroke)"
          strokeWidth="2"
          opacity="0.85"
        />
        <line x1="60" y1="60" x2="60" y2="78" stroke="#fde68a" strokeWidth="1.5" />
        <ellipse cx="60" cy="92" rx="14" ry="3" fill="#fbbf24" opacity="0.7" />
        <path
          d="M40 28 L48 28 L60 56"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
      <div className="absolute right-1 bottom-3 w-7 h-7 rounded-full bg-rose-600 border-2 border-slate-950 flex items-center justify-center shadow-[0_4px_12px_-2px_rgba(244,63,94,0.7)]">
        <span className="text-white text-sm font-bold leading-none">!</span>
      </div>
    </div>
  )
}

// =====================================================================
// Reassurance chip
// =====================================================================

function ReassureChip({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode
  title: string
  sub: string
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/50 border border-white/[0.05]">
      <div className="text-blue-300">{icon}</div>
      <div className="leading-tight">
        <div className="text-[12px] font-semibold text-slate-200">{title}</div>
        <div className="text-[10px] text-slate-500">{sub}</div>
      </div>
    </div>
  )
}
