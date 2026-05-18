'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  Star,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCcw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import { startCheckout, checkoutErrorMessage } from '@/lib/checkout'

type BillingCycle =
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly'
  | '2year'
  | 'lifetime'
type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise' | 'custom'

interface PlanPaymentMethods {
  upi: boolean
  card: boolean
  netbanking: boolean
  bankTransfer: boolean
  manual: boolean
}

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
  trialDays: number | null
  limits: {
    stores: number | null
    warehouses: number | null
    users: {
      admin: number | null
      manager: number | null
      cashier: number | null
      accountant: number | null
      ca: number | null
    }
  }
  features: string[]
  paymentUrl: string
  savingsLabel: string
  paymentMethods: PlanPaymentMethods
  isFeatured: boolean
  displayOrder: number
}

const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: '/ month',
  quarterly: '/ 3 months',
  half_yearly: '/ 6 months',
  yearly: '/ year',
  '2year': '/ 2 years',
  lifetime: 'one-time',
}

const TIER_TONE: Record<PlanTier, string> = {
  free: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  starter: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  pro: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  enterprise: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300',
  custom: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
}

const PAYMENT_LABEL: Record<keyof PlanPaymentMethods, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'NetBanking',
  bankTransfer: 'Bank',
  manual: 'Manual',
}

const inr = (n: number, currency = 'INR') =>
  currency === 'INR'
    ? '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : `${currency} ${Number(n || 0).toLocaleString()}`

interface Props {
  /** Plan code the tenant is currently on — gets a "Current plan" ribbon. */
  currentPlanCode?: string | null
  /** Pre-filled into pay-fallback messages so the vendor knows which org. */
  organizationName?: string
  /** Used as a query param on the hosted payment URL. */
  organizationId?: string
}

interface PlatformSettingsLite {
  paymentGateway: { url: string }
  vendorContact: { whatsapp: string; phone: string; email: string }
}

export default function PlansShowcase({
  currentPlanCode,
  organizationName,
  organizationId,
}: Props) {
  const router = useRouter()
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [settings, setSettings] = useState<PlatformSettingsLite | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [paying, setPaying] = useState<string | null>(null)

  // Build-time env-var fallback only — vendor-portal settings take
  // precedence at runtime so the vendor can flip channels without a
  // redeploy.
  const ENV_WHATSAPP =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_WHATSAPP) || ''
  const ENV_EMAIL =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_EMAIL) || ''
  const ENV_PAY_URL =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_PAY_URL) || ''

  const effective = {
    payUrl: settings?.paymentGateway.url || ENV_PAY_URL,
    whatsapp: settings?.vendorContact.whatsapp || ENV_WHATSAPP,
    email: settings?.vendorContact.email || ENV_EMAIL,
  }

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const [list, s] = await Promise.allSettled([
        api.get<PublicPlan[]>('/public/plans'),
        api.get<PlatformSettingsLite>('/public/platform-settings'),
      ])
      if (list.status === 'fulfilled') setPlans(list.value)
      else if (list.reason instanceof ApiError) setErr(list.reason.message)
      else setErr('Could not load pricing')
      if (s.status === 'fulfilled') setSettings(s.value)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Records a PENDING payment via /api/billing/intent, then opens the
  // resolved gateway URL in a new tab. The intent stamps a row in the
  // tenant's payment ledger even if they abandon at the gateway, and
  // bakes a `?ref=` into the URL so the return page can mark it
  // awaiting_confirmation when they come back.
  const onChoose = async (plan: PublicPlan) => {
    if (paying) return
    setPaying(plan.code)
    try {
      const intent = await startCheckout(
        { type: 'subscription', planCode: plan.code },
        { whatsappFallback: effective.whatsapp, emailFallback: effective.email },
      )
      toast.success(
        intent.gatewayUrl
          ? 'Redirecting to payment — finish the payment, then come back to confirm.'
          : 'No gateway configured — opened your vendor contact instead.',
      )
      // Drop the user on the billing page so they can confirm the
      // reference once they're back from the gateway.
      router.push(`/dashboard/settings?tab=billing&ref=${intent.reference}`)
    } catch (err) {
      toast.error(checkoutErrorMessage(err))
    } finally {
      setPaying(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Available plans
          </CardTitle>
          <CardDescription>
            The full catalogue offered by your software vendor. To switch plans, click
            <em> Choose plan </em> and the vendor will activate it on your account.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCcw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading && plans.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading plans…
          </div>
        ) : err ? (
          <div className="py-6 text-sm flex items-center gap-2 text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4" /> {err}
          </div>
        ) : plans.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Your software vendor hasn&rsquo;t published any plans yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {plans.map((p) => {
              const isCurrent = currentPlanCode && p.code === currentPlanCode
              const cap = (n: number | null) =>
                n === null || n === undefined ? '∞' : n
              const enabledMethods = (
                Object.entries(p.paymentMethods) as [keyof PlanPaymentMethods, boolean][]
              )
                .filter(([, v]) => v)
                .map(([k]) => PAYMENT_LABEL[k])

              return (
                <div
                  key={p.id}
                  className={`relative rounded-lg border p-3 space-y-2.5 transition-all ${
                    p.isFeatured
                      ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/15 shadow-sm'
                      : isCurrent
                        ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/15'
                        : 'bg-card'
                  }`}
                >
                  {p.isFeatured && (
                    <div className="absolute -top-2 left-3 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-semibold flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" /> Most popular
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-2 right-3 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold">
                      Your plan
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-base truncate">{p.name}</h3>
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${TIER_TONE[p.tier]}`}
                      >
                        {p.tier}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-2xl font-bold leading-none">
                      {inr(p.price, p.currency)}
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        {CYCLE_LABEL[p.billingCycle]}
                      </span>
                    </div>
                    {p.billingCycle !== 'monthly' && p.billingCycle !== 'lifetime' && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        ≈ {inr(p.effectiveMonthlyAmount, p.currency)} / month effective
                      </div>
                    )}
                  </div>

                  {p.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {p.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <span className="rounded border px-1.5 py-0.5 bg-muted/30">
                      Stores: <b>{cap(p.limits.stores)}</b>
                    </span>
                    <span className="rounded border px-1.5 py-0.5 bg-muted/30">
                      Warehouses: <b>{cap(p.limits.warehouses)}</b>
                    </span>
                    <span className="rounded border px-1.5 py-0.5 bg-muted/30">
                      Admins: <b>{cap(p.limits.users.admin)}</b>
                    </span>
                    <span className="rounded border px-1.5 py-0.5 bg-muted/30">
                      Cashiers: <b>{cap(p.limits.users.cashier)}</b>
                    </span>
                  </div>

                  {p.features.length > 0 && (
                    <ul className="text-[11px] space-y-0.5">
                      {p.features.slice(0, 4).map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="truncate">{f}</span>
                        </li>
                      ))}
                      {p.features.length > 4 && (
                        <li className="text-muted-foreground pl-4">
                          +{p.features.length - 4} more
                        </li>
                      )}
                    </ul>
                  )}

                  {enabledMethods.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap text-[10px]">
                      <span className="text-muted-foreground uppercase tracking-wider mr-0.5">
                        Pay via:
                      </span>
                      {enabledMethods.map((m) => (
                        <Badge
                          key={m}
                          variant="outline"
                          className="text-[10px] py-0 px-1.5 h-4"
                        >
                          {m}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {p.trialDays !== null && p.trialDays > 0 && (
                    <div className="text-[11px] text-blue-700 dark:text-blue-300">
                      {p.trialDays}-day free trial included
                    </div>
                  )}

                  {isCurrent ? (
                    <Button disabled size="sm" variant="outline" className="w-full">
                      Current plan
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white"
                      disabled={paying === p.code}
                      onClick={() => onChoose(p)}
                    >
                      {paying === p.code
                        ? 'Starting checkout…'
                        : p.paymentUrl || effective.payUrl
                          ? 'Pay & switch'
                          : 'Choose plan'}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
