'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CreditCard,
  Plus,
  RefreshCcw,
  Pencil,
  Trash2,
  Star,
  CheckCircle2,
  XCircle,
  ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, ApiError } from '@/lib/admin-api'
import type {
  BillingCycle,
  PlanTier,
  SubscriptionPlanRow,
  PlanPaymentMethods,
} from '@/lib/admin-types'

const BILLING_LABELS: Record<BillingCycle, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly (3 mo)',
  half_yearly: 'Half-yearly (6 mo)',
  yearly: 'Yearly (12 mo)',
  '2year': '2 Year (24 mo)',
  lifetime: 'Lifetime (one-time)',
}

const TIER_TONE: Record<PlanTier, string> = {
  free: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  starter: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  pro: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  enterprise: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300',
  custom: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
}

interface FormState {
  code: string
  name: string
  description: string
  tier: PlanTier
  price: string
  currency: string
  billingCycle: BillingCycle
  trialDays: string
  storeCap: string
  warehouseCap: string
  adminCap: string
  managerCap: string
  cashierCap: string
  accountantCap: string
  caCap: string
  features: string
  paymentUrl: string
  savingsLabel: string
  paymentMethods: PlanPaymentMethods
  isActive: boolean
  isFeatured: boolean
  displayOrder: string
}

function blankForm(): FormState {
  return {
    code: '',
    name: '',
    description: '',
    tier: 'custom',
    price: '0',
    currency: 'INR',
    billingCycle: 'monthly',
    trialDays: '',
    storeCap: '',
    warehouseCap: '',
    adminCap: '',
    managerCap: '',
    cashierCap: '',
    accountantCap: '',
    caCap: '',
    features: '',
    paymentUrl: '',
    savingsLabel: '',
    paymentMethods: {
      upi: true,
      card: false,
      netbanking: false,
      bankTransfer: true,
      manual: true,
    },
    isActive: true,
    isFeatured: false,
    displayOrder: '0',
  }
}

function planToForm(p: SubscriptionPlanRow): FormState {
  const numOrEmpty = (n: number | null) =>
    n === null || n === undefined ? '' : String(n)
  return {
    code: p.code,
    name: p.name,
    description: p.description || '',
    tier: p.tier,
    price: String(p.price ?? 0),
    currency: p.currency || 'INR',
    billingCycle: p.billingCycle,
    trialDays: p.trialDays === null || p.trialDays === undefined ? '' : String(p.trialDays),
    storeCap: numOrEmpty(p.limits.stores),
    warehouseCap: numOrEmpty(p.limits.warehouses),
    adminCap: numOrEmpty(p.limits.users.admin),
    managerCap: numOrEmpty(p.limits.users.manager),
    cashierCap: numOrEmpty(p.limits.users.cashier),
    accountantCap: numOrEmpty(p.limits.users.accountant),
    caCap: numOrEmpty(p.limits.users.ca),
    features: (p.features || []).join('\n'),
    paymentUrl: p.paymentUrl || '',
    savingsLabel: p.savingsLabel || '',
    paymentMethods: { ...p.paymentMethods },
    isActive: p.isActive,
    isFeatured: p.isFeatured,
    displayOrder: String(p.displayOrder ?? 0),
  }
}

function formToPayload(f: FormState) {
  const toN = (v: string) => (v.trim() === '' ? null : Number(v))
  return {
    code: f.code,
    name: f.name,
    description: f.description,
    tier: f.tier,
    price: Number(f.price) || 0,
    currency: f.currency,
    billingCycle: f.billingCycle,
    trialDays: f.trialDays.trim() === '' ? null : Number(f.trialDays),
    limits: {
      stores: toN(f.storeCap),
      warehouses: toN(f.warehouseCap),
      users: {
        admin: toN(f.adminCap),
        manager: toN(f.managerCap),
        cashier: toN(f.cashierCap),
        accountant: toN(f.accountantCap),
        ca: toN(f.caCap),
      },
    },
    features: f.features
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    paymentUrl: f.paymentUrl.trim(),
    savingsLabel: f.savingsLabel.trim(),
    paymentMethods: f.paymentMethods,
    isActive: f.isActive,
    isFeatured: f.isFeatured,
    displayOrder: Number(f.displayOrder) || 0,
  }
}

const inr = (n: number, cur = 'INR') =>
  cur === 'INR'
    ? '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : `${cur} ${Number(n || 0).toLocaleString()}`

export default function PlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlanRow[]>([])
  const [loading, setLoading] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(blankForm())
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SubscriptionPlanRow | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get<SubscriptionPlanRow[]>('/platform/plans')
      setPlans(res)
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm(blankForm())
    setEditorOpen(true)
  }

  const openEdit = (p: SubscriptionPlanRow) => {
    setEditingId(p.id)
    setForm(planToForm(p))
    setEditorOpen(true)
  }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Code and name are required')
      return
    }
    setSaving(true)
    try {
      const payload = formToPayload(form)
      if (editingId) {
        await api.put(`/platform/plans/${editingId}`, payload)
        toast.success('Plan updated')
      } else {
        await api.post('/platform/plans', payload)
        toast.success('Plan created')
      }
      setEditorOpen(false)
      load()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    try {
      await api.del(`/platform/plans/${deleteTarget.id}`)
      toast.success(`"${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
      load()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    }
  }

  const sorted = useMemo(
    () =>
      [...plans].sort(
        (a, b) =>
          (a.displayOrder ?? 0) - (b.displayOrder ?? 0) ||
          (a.price ?? 0) - (b.price ?? 0),
      ),
    [plans],
  )

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-rose-600" />
            Subscription Plans
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Design the catalogue tenants pick from. Pricing, limits, features and payment methods are all configurable.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> New plan
          </Button>
        </div>
      </div>

      {/* Plan grid */}
      {sorted.length === 0 && !loading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No plans yet. Click <span className="font-medium text-foreground">New plan</span> to add the first one — start with free / starter / pro / enterprise to match your pricing page.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              onEdit={() => openEdit(p)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      )}

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit plan' : 'New plan'}</DialogTitle>
            <DialogDescription>
              These values drive the pricing page, the limits enforced server-side, and the
              payment methods exposed to tenants on this plan.
            </DialogDescription>
          </DialogHeader>
          <PlanEditor form={form} setForm={setForm} disableCode={!!editingId} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete plan?</DialogTitle>
            <DialogDescription>
              This permanently removes <span className="font-medium">{deleteTarget?.name}</span>{' '}
              from the catalogue. Tenants currently mapped to this plan keep their settings until
              you reassign them — they just won&rsquo;t see this option on the pricing page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- Plan card ----------------------------------------------------

function PlanCard({
  plan,
  onEdit,
  onDelete,
}: {
  plan: SubscriptionPlanRow
  onEdit: () => void
  onDelete: () => void
}) {
  const cap = (n: number | null) => (n === null || n === undefined ? '∞' : n)
  const enabledMethods = (Object.entries(plan.paymentMethods) as [keyof PlanPaymentMethods, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => k)
  const methodLabel: Record<keyof PlanPaymentMethods, string> = {
    upi: 'UPI',
    card: 'Card',
    netbanking: 'NetBanking',
    bankTransfer: 'Bank',
    manual: 'Manual',
  }

  return (
    <Card className={!plan.isActive ? 'opacity-70' : ''}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-base truncate">{plan.name}</h3>
              {plan.isFeatured && (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 gap-0.5">
                  <Star className="w-3 h-3 fill-current" /> Featured
                </Badge>
              )}
              {!plan.isActive && (
                <Badge className="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Hidden
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
              code: <span className="font-mono">{plan.code}</span>
              <span className="mx-1.5">·</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${TIER_TONE[plan.tier]}`}>
                {plan.tier}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-bold text-lg leading-tight">{inr(plan.price, plan.currency)}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {BILLING_LABELS[plan.billingCycle]}
            </div>
          </div>
        </div>

        {plan.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{plan.description}</p>
        )}

        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Stat label="Stores" value={cap(plan.limits.stores)} />
          <Stat label="Warehouses" value={cap(plan.limits.warehouses)} />
          <Stat label="Admins" value={cap(plan.limits.users.admin)} />
          <Stat label="Managers" value={cap(plan.limits.users.manager)} />
          <Stat label="Cashiers" value={cap(plan.limits.users.cashier)} />
          <Stat label="Accountants" value={cap(plan.limits.users.accountant)} />
          <Stat
            label="Effective ₹/mo"
            value={plan.billingCycle === 'lifetime' ? '—' : inr(plan.effectiveMonthlyAmount, plan.currency)}
          />
          <Stat label="Trial days" value={plan.trialDays === null ? 'Default' : plan.trialDays} />
        </div>

        {plan.features.length > 0 && (
          <div className="text-[12px]">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Features
            </div>
            <ul className="space-y-0.5">
              {plan.features.slice(0, 4).map((f, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="truncate">{f}</span>
                </li>
              ))}
              {plan.features.length > 4 && (
                <li className="text-muted-foreground text-[11px] pl-5">
                  +{plan.features.length - 4} more
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-1 flex-wrap text-[10px]">
          <span className="text-muted-foreground uppercase tracking-wider mr-0.5">Pay via:</span>
          {enabledMethods.length === 0 ? (
            <span className="text-muted-foreground italic">none configured</span>
          ) : (
            enabledMethods.map((m) => (
              <span
                key={m}
                className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900"
              >
                {methodLabel[m]}
              </span>
            ))
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-rose-600 hover:text-rose-700"
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[13px] font-semibold leading-tight">{value}</div>
    </div>
  )
}

// ---------- Editor body --------------------------------------------------

function PlanEditor({
  form,
  setForm,
  disableCode,
}: {
  form: FormState
  setForm: (f: FormState) => void
  disableCode: boolean
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm({ ...form, [key]: value })
  const setMethod = (key: keyof PlanPaymentMethods, value: boolean) =>
    setForm({ ...form, paymentMethods: { ...form.paymentMethods, [key]: value } })

  return (
    <div className="space-y-4">
      {/* Identity */}
      <Section title="Identity">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Code (unique)</Label>
            <Input
              value={form.code}
              onChange={(e) => set('code', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              placeholder="pro-yearly"
              disabled={disableCode}
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Display name</Label>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Pro (Yearly)"
              className="h-9 mt-1"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Best for growing chains, save 2 months on annual."
            className="h-9 mt-1"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Tier</Label>
            <select
              value={form.tier}
              onChange={(e) => set('tier', e.target.value as PlanTier)}
              className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Display order</Label>
            <Input
              type="number"
              value={form.displayOrder}
              onChange={(e) => set('displayOrder', e.target.value)}
              className="h-9 mt-1"
            />
          </div>
          <div className="flex items-end gap-3 pb-1">
            <Toggle label="Active" value={form.isActive} onChange={(v) => set('isActive', v)} />
            <Toggle
              label="Featured"
              value={form.isFeatured}
              onChange={(v) => set('isFeatured', v)}
            />
          </div>
        </div>
      </Section>

      {/* Pricing */}
      <Section title="Pricing">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Price</Label>
            <Input
              type="number"
              min="0"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Currency</Label>
            <Input
              value={form.currency}
              onChange={(e) => set('currency', e.target.value.toUpperCase())}
              className="h-9 mt-1"
              maxLength={3}
            />
          </div>
          <div>
            <Label className="text-xs">Billing cycle</Label>
            <select
              value={form.billingCycle}
              onChange={(e) => set('billingCycle', e.target.value as BillingCycle)}
              className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly (3 mo)</option>
              <option value="half_yearly">Half-yearly (6 mo)</option>
              <option value="yearly">Yearly (12 mo)</option>
              <option value="2year">2 Year (24 mo)</option>
              <option value="lifetime">Lifetime (one-time)</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Trial days (blank = use platform default)</Label>
            <Input
              type="number"
              min="0"
              max="365"
              value={form.trialDays}
              onChange={(e) => set('trialDays', e.target.value)}
              placeholder="14"
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">
              Savings label (e.g. &ldquo;Save 20%&rdquo;)
            </Label>
            <Input
              value={form.savingsLabel}
              onChange={(e) => set('savingsLabel', e.target.value)}
              placeholder="Save 20%"
              className="h-9 mt-1"
            />
          </div>
        </div>
      </Section>

      {/* Payment routing */}
      <Section title="Payment link">
        <div>
          <Label className="text-xs">
            Hosted payment URL (Razorpay link, Stripe checkout, custom form, etc.)
          </Label>
          <Input
            value={form.paymentUrl}
            onChange={(e) => set('paymentUrl', e.target.value)}
            placeholder="https://rzp.io/l/your-link"
            className="h-9 mt-1"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            Tenants land here when they click <em>Choose plan</em> /{' '}
            <em>Upgrade now</em> on the Subscription Expired screen and the Settings tab.
            Leave blank to fall back to the global{' '}
            <code className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">
              NEXT_PUBLIC_VENDOR_PAY_URL
            </code>{' '}
            with <code className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">?plan=&lt;code&gt;&amp;org=&lt;id&gt;</code> appended,
            then to a WhatsApp / mailto pre-fill.
          </p>
        </div>
      </Section>

      {/* Limits */}
      <Section title="Resource limits (blank = unlimited)">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CapInput label="Stores" value={form.storeCap} onChange={(v) => set('storeCap', v)} />
          <CapInput
            label="Warehouses"
            value={form.warehouseCap}
            onChange={(v) => set('warehouseCap', v)}
          />
          <CapInput label="Admins" value={form.adminCap} onChange={(v) => set('adminCap', v)} />
          <CapInput
            label="Managers"
            value={form.managerCap}
            onChange={(v) => set('managerCap', v)}
          />
          <CapInput
            label="Cashiers"
            value={form.cashierCap}
            onChange={(v) => set('cashierCap', v)}
          />
          <CapInput
            label="Accountants"
            value={form.accountantCap}
            onChange={(v) => set('accountantCap', v)}
          />
          <CapInput label="CAs" value={form.caCap} onChange={(v) => set('caCap', v)} />
        </div>
      </Section>

      {/* Features */}
      <Section title="Marketed features (one per line)">
        <textarea
          value={form.features}
          onChange={(e) => set('features', e.target.value)}
          rows={4}
          placeholder="Unlimited GST invoices&#10;Multi-store inventory&#10;WhatsApp invoice delivery"
          className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-y"
        />
      </Section>

      {/* Payment methods */}
      <Section title="Available payment methods">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <PaymentToggle
            label="UPI"
            value={form.paymentMethods.upi}
            onChange={(v) => setMethod('upi', v)}
          />
          <PaymentToggle
            label="Card"
            value={form.paymentMethods.card}
            onChange={(v) => setMethod('card', v)}
          />
          <PaymentToggle
            label="NetBanking"
            value={form.paymentMethods.netbanking}
            onChange={(v) => setMethod('netbanking', v)}
          />
          <PaymentToggle
            label="Bank transfer"
            value={form.paymentMethods.bankTransfer}
            onChange={(v) => setMethod('bankTransfer', v)}
          />
          <PaymentToggle
            label="Manual / offline"
            value={form.paymentMethods.manual}
            onChange={(v) => setMethod('manual', v)}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Stored as metadata only — no gateway is wired yet. The flags will drive the
          tenant-side checkout once payments are integrated.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
        <ListChecks className="w-3.5 h-3.5" /> {title}
      </div>
      {children}
    </div>
  )
}

function CapInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="∞"
        className="h-9 mt-1"
      />
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-rose-600 w-4 h-4"
      />
      <span>{label}</span>
    </label>
  )
}

function PaymentToggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
        value ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-900' : 'bg-muted/30'
      }`}
    >
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-emerald-600 w-4 h-4"
      />
      <span className="text-sm font-medium">{label}</span>
      {value ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 ml-auto" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
      )}
    </label>
  )
}
