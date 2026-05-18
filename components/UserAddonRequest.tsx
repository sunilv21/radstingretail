'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserPlus,
  IndianRupee,
  Sparkles,
  Loader2,
  AlertCircle,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, ApiError } from '@/lib/api'
import { startCheckout, checkoutErrorMessage } from '@/lib/checkout'

const ROLES = [
  { key: 'cashier', label: 'Cashier', hint: 'Operates POS, takes payments' },
  { key: 'manager', label: 'Manager', hint: 'Branch oversight + reports' },
  { key: 'accountant', label: 'Accountant', hint: 'Books + ledger access' },
  { key: 'admin', label: 'Admin', hint: 'Full settings + user management' },
  { key: 'ca', label: 'CA / auditor', hint: 'Read-only books for audit' },
] as const

type Role = (typeof ROLES)[number]['key']

interface PlatformSettingsLite {
  userAddon: {
    pricePerUser: number
    currency: string
    description: string
  }
  vendorContact: {
    whatsapp: string
    email: string
  }
}

const inr = (n: number, currency = 'INR') =>
  currency === 'INR'
    ? '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : `${currency} ${Number(n || 0).toLocaleString()}`

/**
 * Extra-user upgrade form. Lives on Settings → Subscription. Tenant
 * picks a role + quantity, sees the total, and clicks Pay — that
 * routes through /api/billing/intent (type='user_addon') to record
 * the request and open the gateway. Vendor confirms in admin
 * Payments inbox; on confirm the addon role's cap goes up.
 */
type BillingCycle = 'monthly' | 'yearly'

const YEARLY_DISCOUNT = 0.25 // 25% off for yearly addons; mirror server-side

export default function UserAddonRequest() {
  const router = useRouter()
  const [settings, setSettings] = useState<PlatformSettingsLite | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<Role>('cashier')
  const [quantity, setQuantity] = useState(1)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    api
      .get<PlatformSettingsLite>('/public/platform-settings')
      .then(setSettings)
      .catch(() => setSettings(null))
      .finally(() => setLoading(false))
  }, [])

  const pricePerUser = settings?.userAddon.pricePerUser ?? 199
  const currency = settings?.userAddon.currency || 'INR'
  const description = settings?.userAddon.description || ''

  // Pricing math:
  //   monthly = pricePerUser × qty                       (lasts 1 month)
  //   yearly  = pricePerUser × qty × 12 × (1 - 25%)      (lasts 12 months)
  const months = billingCycle === 'yearly' ? 12 : 1
  const grossTotal = pricePerUser * Math.max(1, quantity) * months
  const total = useMemo(
    () =>
      billingCycle === 'yearly'
        ? Math.round(grossTotal * (1 - YEARLY_DISCOUNT))
        : grossTotal,
    [billingCycle, grossTotal],
  )
  const youSave = grossTotal - total
  const effectiveMonthlyPerUser =
    billingCycle === 'yearly'
      ? Math.round((pricePerUser * (1 - YEARLY_DISCOUNT)) * 100) / 100
      : pricePerUser

  const submit = async () => {
    if (paying) return
    if (quantity < 1) {
      toast.error('Pick at least 1 user')
      return
    }
    setPaying(true)
    try {
      const intent = await startCheckout(
        {
          type: 'user_addon',
          addonRole: role,
          addonQuantity: quantity,
          billingCycle,
        },
        {
          whatsappFallback: settings?.vendorContact.whatsapp,
          emailFallback: settings?.vendorContact.email,
        },
      )
      toast.success(
        intent.gatewayUrl
          ? 'Redirecting to payment — finish then return to confirm.'
          : 'Vendor contacted — your request reference is saved.',
      )
      router.push(`/dashboard/settings?tab=billing&ref=${intent.reference}`)
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error(checkoutErrorMessage(err))
    } finally {
      setPaying(false)
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-rose-600" />
          Need more users?
        </CardTitle>
        <CardDescription>
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading add-on pricing…
            </span>
          ) : (
            description ||
            `Add an extra user slot at ${inr(pricePerUser, currency)} each. Slot is granted once your vendor confirms payment.`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loading && pricePerUser <= 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-2 text-[12px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Your software vendor hasn&rsquo;t set a per-user price yet. Reach out via the
              Help &amp; Support tab to request additional slots manually.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Role</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label} — {r.hint}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">How many extra slots?</Label>
            <Input
              type="number"
              min="1"
              max="100"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="h-9 mt-1"
            />
          </div>
        </div>

        {/* Quick-pick chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Quick pick:</span>
          {[1, 2, 5, 10].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQuantity(n)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                quantity === n
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-card hover:bg-muted text-muted-foreground border-border'
              }`}
            >
              {n} {n === 1 ? 'user' : 'users'}
            </button>
          ))}
        </div>

        {/* Billing-cycle toggle. Yearly is 12 × monthly with 25% off
            and the granted slot survives the full 12 months. */}
        <div>
          <Label className="text-xs">Billing cycle</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`relative rounded-lg border p-3 text-left transition-all ${
                billingCycle === 'monthly'
                  ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/40 dark:bg-rose-950/15'
                  : 'border-border bg-card hover:bg-muted/40'
              }`}
            >
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Monthly
              </div>
              <div className="text-base font-bold tabular-nums">{inr(pricePerUser, currency)}</div>
              <div className="text-[11px] text-muted-foreground">per user / month</div>
              <div className="text-[10px] text-muted-foreground mt-1">Slot lasts 1 month</div>
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`relative rounded-lg border p-3 text-left transition-all ${
                billingCycle === 'yearly'
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/15'
                  : 'border-border bg-card hover:bg-muted/40'
              }`}
            >
              <span className="absolute -top-1.5 right-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                Save {Math.round(YEARLY_DISCOUNT * 100)}%
              </span>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Yearly
              </div>
              <div className="text-base font-bold tabular-nums">
                {inr(effectiveMonthlyPerUser, currency)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                per user / month{' '}
                <span className="text-muted-foreground/60 line-through">
                  {inr(pricePerUser, currency)}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">Slot lasts 12 months</div>
            </button>
          </div>
        </div>

        {/* Live total */}
        <div className="rounded-md border bg-muted/30 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[12px] text-muted-foreground">
              <Sparkles className="w-3 h-3 inline mr-1 text-amber-500" />
              {quantity} × {inr(pricePerUser, currency)} × {months} {months === 1 ? 'month' : 'months'}
              {billingCycle === 'yearly' && (
                <span className="ml-1.5 text-emerald-700 dark:text-emerald-400">
                  · {Math.round(YEARLY_DISCOUNT * 100)}% off
                </span>
              )}
            </div>
            <div className="text-xl font-bold tabular-nums flex items-center gap-1">
              {currency === 'INR' ? <IndianRupee className="w-5 h-5" /> : currency + ' '}
              {Number(total).toLocaleString('en-IN')}
            </div>
          </div>
          {billingCycle === 'yearly' && youSave > 0 && (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 text-right">
              You save {inr(youSave, currency)} compared to paying monthly
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            className="bg-rose-600 hover:bg-rose-700"
            onClick={submit}
            disabled={paying || pricePerUser <= 0}
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            {paying ? 'Starting checkout…' : `Pay ${inr(total, currency)} & request slots`}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
