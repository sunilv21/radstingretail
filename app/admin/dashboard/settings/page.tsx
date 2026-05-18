'use client'

import { useEffect, useState } from 'react'
import {
  Settings,
  CreditCard,
  Phone,
  Mail,
  Globe,
  MessageCircle,
  RefreshCcw,
  Save,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/admin-api'
import type { PlatformSettingsRow, PaymentProvider } from '@/lib/admin-types'

const PROVIDER_LABEL: Record<PaymentProvider, string> = {
  razorpay: 'Razorpay (native API)',
  stripe: 'Stripe',
  cashfree: 'Cashfree',
  paytm: 'Paytm',
  phonepe: 'PhonePe (native API)',
  upi: 'UPI direct (no gateway)',
  custom: 'Custom hosted page',
  manual: 'Manual / offline',
}

const PROVIDER_HINT: Record<PaymentProvider, string> = {
  razorpay:
    'Native server-to-server integration with Razorpay Payment Links. The "Hosted payment URL" field is ignored — the server creates a fresh Payment Link per transaction using your API keys below.',
  stripe: 'Paste a Stripe Payment Link (buy.stripe.com/…). Stripe handles the entire checkout flow.',
  cashfree: 'Paste a Cashfree Payment Link (payments.cashfree.com/…).',
  paytm: 'Paste a Paytm payment-page URL.',
  phonepe:
    'Native server-to-server integration with PhonePe Standard Checkout. The "Hosted payment URL" field is ignored — the server creates a fresh checkout session per payment using your merchant credentials below.',
  upi:
    'No gateway, no fees. Tenants land on a public QR page that opens any UPI app pre-filled with the amount + your VPA. Confirmation is manual — verify the UTR in the Payments inbox and click Confirm.',
  custom: 'Any URL you control — your own checkout page, a Google Form, an invoicing tool, anything.',
  manual: 'No automated payment. Tenants fall back to WhatsApp / mailto with a renewal request.',
}

export default function PlatformSettingsPage() {
  const [data, setData] = useState<PlatformSettingsRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setData(await api.get<PlatformSettingsRow>('/platform/settings'))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async () => {
    if (!data) return
    setSaving(true)
    try {
      const updated = await api.put<PlatformSettingsRow>('/platform/settings', data)
      setData(updated)
      toast.success('Platform settings saved')
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof PlatformSettingsRow>(
    key: K,
    value: PlatformSettingsRow[K],
  ) => {
    if (!data) return
    setData({ ...data, [key]: value })
  }

  if (loading && !data) {
    return (
      <div className="py-16 flex items-center justify-center text-sm text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading platform settings…
      </div>
    )
  }
  if (!data) {
    return (
      <div className="py-16 text-center text-sm text-rose-600 flex items-center justify-center gap-2">
        <AlertCircle className="w-4 h-4" /> Could not load settings.
      </div>
    )
  }

  const gatewayConfigured = !!data.paymentGateway.url.trim()

  return (
    <div className="space-y-3 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-rose-600" />
            Platform Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Vendor-wide configuration — drives the tenant Subscription Expired screen,
            pricing pages and support contact channels.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={save}
            disabled={saving}
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      {/* ---- Payment gateway ---- */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            Payment gateway
            {gatewayConfigured ? (
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Configured
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 gap-0.5">
                <AlertCircle className="w-3 h-3" /> Not set
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Default payment URL used when a tenant clicks <em>Choose plan</em> /
            <em> Upgrade now</em>. Per-plan URLs (set in the Plans editor) override
            this. The tenant frontend appends <code className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">?org=&amp;plan=&amp;amount=</code>{' '}
            to the URL automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <Label className="text-xs">Provider</Label>
              <select
                value={data.paymentGateway.provider}
                onChange={(e) =>
                  set('paymentGateway', {
                    ...data.paymentGateway,
                    provider: e.target.value as PaymentProvider,
                  })
                }
                className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
              >
                {(Object.keys(PROVIDER_LABEL) as PaymentProvider[]).map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1">
              <Label className="text-xs">Currency</Label>
              <Input
                value={data.paymentGateway.currency}
                onChange={(e) =>
                  set('paymentGateway', {
                    ...data.paymentGateway,
                    currency: e.target.value.toUpperCase().slice(0, 3),
                  })
                }
                maxLength={3}
                className="h-9 mt-1"
              />
            </div>
            <div className="md:col-span-1">
              <Label className="text-xs">Mode</Label>
              <select
                value={data.paymentGateway.mode}
                onChange={(e) =>
                  set('paymentGateway', {
                    ...data.paymentGateway,
                    mode: e.target.value as 'live' | 'test',
                  })
                }
                className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
              >
                <option value="live">Live</option>
                <option value="test">Test</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs flex items-center justify-between">
              <span>
                Hosted payment URL{' '}
                <span className="text-muted-foreground font-normal">(applies to all plans)</span>
              </span>
              {data.paymentGateway.url && (
                <a
                  href={data.paymentGateway.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                >
                  Open <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </Label>
            <Input
              value={data.paymentGateway.url}
              onChange={(e) =>
                set('paymentGateway', {
                  ...data.paymentGateway,
                  url: e.target.value,
                })
              }
              placeholder={
                data.paymentGateway.provider === 'razorpay'
                  ? 'https://rzp.io/l/your-payment-link'
                  : data.paymentGateway.provider === 'stripe'
                    ? 'https://buy.stripe.com/your-link'
                    : 'https://checkout.example.com/'
              }
              className="h-9 mt-1 font-mono text-[12px]"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed flex items-start gap-1.5">
              <Sparkles className="w-3 h-3 mt-0.5 text-amber-500 shrink-0" />
              <span>{PROVIDER_HINT[data.paymentGateway.provider]}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---- PhonePe credentials (only when provider=phonepe) ---- */}
      {data.paymentGateway.provider === 'phonepe' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              PhonePe credentials
              {data.paymentGateway.phonepe.merchantId &&
              data.paymentGateway.phonepe.saltKeyConfigured ? (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 gap-0.5">
                  <AlertCircle className="w-3 h-3" /> Setup required
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Found in your{' '}
              <a
                href="https://business.phonepe.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-600"
              >
                PhonePe Business
              </a>{' '}
              dashboard under <em>Developer Tools → API Keys</em>. The salt key is
              never returned in the clear — re-saving the form leaves the stored
              secret intact unless you paste a fresh value.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Merchant ID</Label>
                <Input
                  value={data.paymentGateway.phonepe.merchantId}
                  onChange={(e) =>
                    set('paymentGateway', {
                      ...data.paymentGateway,
                      phonepe: {
                        ...data.paymentGateway.phonepe,
                        merchantId: e.target.value.trim(),
                      },
                    })
                  }
                  placeholder="M22XYZ12ABCDE"
                  className="h-9 mt-1 font-mono text-[12px]"
                />
              </div>
              <div>
                <Label className="text-xs">Environment</Label>
                <select
                  value={data.paymentGateway.phonepe.environment}
                  onChange={(e) =>
                    set('paymentGateway', {
                      ...data.paymentGateway,
                      phonepe: {
                        ...data.paymentGateway.phonepe,
                        environment: e.target.value as 'sandbox' | 'production',
                      },
                    })
                  }
                  className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
                >
                  <option value="sandbox">Sandbox (test)</option>
                  <option value="production">Production (live)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
              <div>
                <Label className="text-xs">Salt key</Label>
                <Input
                  type="password"
                  value={data.paymentGateway.phonepe.saltKey}
                  onChange={(e) =>
                    set('paymentGateway', {
                      ...data.paymentGateway,
                      phonepe: {
                        ...data.paymentGateway.phonepe,
                        saltKey: e.target.value,
                      },
                    })
                  }
                  placeholder={
                    data.paymentGateway.phonepe.saltKeyConfigured
                      ? 'Saved · paste new value to replace'
                      : 'Paste salt key from PhonePe dashboard'
                  }
                  className="h-9 mt-1 font-mono text-[12px]"
                />
              </div>
              <div>
                <Label className="text-xs">Salt index</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={data.paymentGateway.phonepe.saltIndex}
                  onChange={(e) =>
                    set('paymentGateway', {
                      ...data.paymentGateway,
                      phonepe: {
                        ...data.paymentGateway.phonepe,
                        saltIndex: Math.max(1, Math.min(10, Number(e.target.value) || 1)),
                      },
                    })
                  }
                  className="h-9 mt-1"
                />
              </div>
            </div>
            <div className="rounded-md border bg-blue-50 dark:bg-blue-950/15 border-blue-200 dark:border-blue-900 p-2.5 text-[11px] text-blue-900 dark:text-blue-200 space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Webhook callback URL
              </div>
              <p>
                Whitelist these on your PhonePe dashboard so the gateway can redirect
                tenants back and post server-to-server confirmations:
              </p>
              <code className="block px-2 py-1 rounded bg-background border font-mono text-[10px] break-all">
                {`<your-tenant-domain>/api/billing/callback/phonepe/<reference>`}
              </code>
              <code className="block px-2 py-1 rounded bg-background border font-mono text-[10px] break-all">
                {`<your-tenant-domain>/api/billing/webhook/phonepe`}
              </code>
              <p className="opacity-80">
                The server fills <code>&lt;reference&gt;</code> automatically — just
                whitelist the prefix on PhonePe&rsquo;s side.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Razorpay credentials (only when provider=razorpay) ---- */}
      {data.paymentGateway.provider === 'razorpay' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              Razorpay credentials
              {data.paymentGateway.razorpay.keyId &&
              data.paymentGateway.razorpay.keySecretConfigured ? (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 gap-0.5">
                  <AlertCircle className="w-3 h-3" /> Setup required
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Found in your{' '}
              <a
                href="https://dashboard.razorpay.com/app/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-600"
              >
                Razorpay dashboard
              </a>{' '}
              under <em>Settings → API Keys</em>. The server creates a Payment Link per
              transaction and verifies the signature on redirect-back. Secrets are masked
              once saved — paste a fresh value to replace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Key ID</Label>
                <Input
                  value={data.paymentGateway.razorpay.keyId}
                  onChange={(e) =>
                    set('paymentGateway', {
                      ...data.paymentGateway,
                      razorpay: {
                        ...data.paymentGateway.razorpay,
                        keyId: e.target.value.trim(),
                      },
                    })
                  }
                  placeholder="rzp_test_AbCdEfGh1234"
                  className="h-9 mt-1 font-mono text-[12px]"
                />
              </div>
              <div>
                <Label className="text-xs">Mode</Label>
                <select
                  value={data.paymentGateway.razorpay.mode}
                  onChange={(e) =>
                    set('paymentGateway', {
                      ...data.paymentGateway,
                      razorpay: {
                        ...data.paymentGateway.razorpay,
                        mode: e.target.value as 'test' | 'live',
                      },
                    })
                  }
                  className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
                >
                  <option value="test">Test (sandbox)</option>
                  <option value="live">Live (production)</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Key secret</Label>
              <Input
                type="password"
                value={data.paymentGateway.razorpay.keySecret}
                onChange={(e) =>
                  set('paymentGateway', {
                    ...data.paymentGateway,
                    razorpay: {
                      ...data.paymentGateway.razorpay,
                      keySecret: e.target.value,
                    },
                  })
                }
                placeholder={
                  data.paymentGateway.razorpay.keySecretConfigured
                    ? 'Saved · paste new value to replace'
                    : 'Paste key secret from Razorpay dashboard'
                }
                className="h-9 mt-1 font-mono text-[12px]"
              />
            </div>
            <div>
              <Label className="text-xs">
                Webhook secret <span className="text-muted-foreground font-normal">(optional but recommended)</span>
              </Label>
              <Input
                type="password"
                value={data.paymentGateway.razorpay.webhookSecret}
                onChange={(e) =>
                  set('paymentGateway', {
                    ...data.paymentGateway,
                    razorpay: {
                      ...data.paymentGateway.razorpay,
                      webhookSecret: e.target.value,
                    },
                  })
                }
                placeholder={
                  data.paymentGateway.razorpay.webhookSecretConfigured
                    ? 'Saved · paste new value to replace'
                    : 'Webhook secret from Razorpay → Webhooks'
                }
                className="h-9 mt-1 font-mono text-[12px]"
              />
            </div>
            <div className="rounded-md border bg-blue-50 dark:bg-blue-950/15 border-blue-200 dark:border-blue-900 p-2.5 text-[11px] text-blue-900 dark:text-blue-200 space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Configure on Razorpay
              </div>
              <p>Whitelist these on your Razorpay dashboard:</p>
              <code className="block px-2 py-1 rounded bg-background border font-mono text-[10px] break-all">
                Callback URL: {`<your-tenant-domain>/api/billing/callback/razorpay/<reference>`}
              </code>
              <code className="block px-2 py-1 rounded bg-background border font-mono text-[10px] break-all">
                Webhook URL: {`<your-tenant-domain>/api/billing/webhook/razorpay`}
              </code>
              <p className="opacity-80">
                Webhook events to subscribe: <code>payment_link.paid</code>,{' '}
                <code>payment_link.cancelled</code>, <code>payment_link.expired</code>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- UPI direct (only when provider=upi) ---- */}
      {data.paymentGateway.provider === 'upi' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Direct UPI handoff
              {data.paymentGateway.upi.vpa ? (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Configured
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 gap-0.5">
                  <AlertCircle className="w-3 h-3" /> Setup required
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Tenants land on a public QR page that opens any UPI app pre-filled with
              the amount, payee VPA and our payment reference. No gateway, no fees.
              Confirmation is manual — you verify the UTR in the Payments inbox and
              click <em>Confirm</em>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">UPI ID (VPA)</Label>
                <Input
                  value={data.paymentGateway.upi.vpa}
                  onChange={(e) =>
                    set('paymentGateway', {
                      ...data.paymentGateway,
                      upi: {
                        ...data.paymentGateway.upi,
                        vpa: e.target.value.toLowerCase().trim(),
                      },
                    })
                  }
                  placeholder="vendor@okhdfc"
                  className="h-9 mt-1 font-mono text-[12px]"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  e.g. <code>businessname@okhdfc</code>, <code>vendor@axl</code>,{' '}
                  <code>9876543210@ybl</code>.
                </p>
              </div>
              <div>
                <Label className="text-xs">Payee name</Label>
                <Input
                  value={data.paymentGateway.upi.payeeName}
                  onChange={(e) =>
                    set('paymentGateway', {
                      ...data.paymentGateway,
                      upi: {
                        ...data.paymentGateway.upi,
                        payeeName: e.target.value,
                      },
                    })
                  }
                  placeholder="Radsting Pvt Ltd"
                  className="h-9 mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Shown in the tenant&rsquo;s UPI app on the confirm screen.
                </p>
              </div>
            </div>
            <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/15 border-emerald-200 dark:border-emerald-900 p-2.5 text-[11px] text-emerald-900 dark:text-emerald-200 space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> How tenants pay
              </div>
              <p>
                Pay-button click → public QR page at{' '}
                <code className="px-1 py-0.5 rounded bg-background border font-mono text-[10px]">
                  {`<your-tenant-domain>/pay/upi/<reference>`}
                </code>{' '}
                → tenant scans / taps to pay → returns to Settings → Billing → enters UTR
                → you confirm in the admin Payments inbox.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Vendor contact ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-blue-600" />
            Vendor contact
          </CardTitle>
          <CardDescription>
            Surfaced on the Subscription Expired screen, the AccountBlocked screen,
            and the tenant Settings &rarr; Help tab. Empty fields are simply hidden
            from tenants.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp number
            </Label>
            <Input
              value={data.vendorContact.whatsapp}
              onChange={(e) =>
                set('vendorContact', { ...data.vendorContact, whatsapp: e.target.value })
              }
              placeholder="+91 98765 43210"
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Phone
            </Label>
            <Input
              value={data.vendorContact.phone}
              onChange={(e) =>
                set('vendorContact', { ...data.vendorContact, phone: e.target.value })
              }
              placeholder="+91 98765 43210"
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Email
            </Label>
            <Input
              type="email"
              value={data.vendorContact.email}
              onChange={(e) =>
                set('vendorContact', { ...data.vendorContact, email: e.target.value })
              }
              placeholder="support@radsting.com"
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Website
            </Label>
            <Input
              value={data.vendorContact.website}
              onChange={(e) =>
                set('vendorContact', { ...data.vendorContact, website: e.target.value })
              }
              placeholder="https://radsting.com"
              className="h-9 mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* ---- User add-on pricing ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            User add-on pricing
          </CardTitle>
          <CardDescription>
            What tenants pay per extra user slot above their plan&rsquo;s built-in
            quota. Surfaces on the tenant Settings &rarr; Subscription tab as a
            standalone <em>Request more users</em> form.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Price per user</Label>
              <Input
                type="number"
                min="0"
                value={data.userAddon.pricePerUser}
                onChange={(e) =>
                  set('userAddon', {
                    ...data.userAddon,
                    pricePerUser: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Input
                value={data.userAddon.currency}
                onChange={(e) =>
                  set('userAddon', {
                    ...data.userAddon,
                    currency: e.target.value.toUpperCase().slice(0, 3),
                  })
                }
                maxLength={3}
                className="h-9 mt-1"
              />
            </div>
            <div className="md:col-span-1 flex items-end pb-1 text-sm text-muted-foreground">
              Tenants see <b className="text-foreground mx-1">
                {data.userAddon.currency === 'INR' ? '₹' : data.userAddon.currency + ' '}
                {data.userAddon.pricePerUser}
              </b>
              per extra user
            </div>
          </div>
          <div>
            <Label className="text-xs">Description (shown on the request form)</Label>
            <Input
              value={data.userAddon.description}
              onChange={(e) =>
                set('userAddon', { ...data.userAddon, description: e.target.value })
              }
              placeholder="Add an extra user slot at any time..."
              className="h-9 mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* ---- Brand ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand &amp; copy</CardTitle>
          <CardDescription>
            Optional. Vendor name shown on receipts / takeover screens. Support hours appears
            below contact channels (e.g. &ldquo;Mon&ndash;Sat, 9 AM &ndash; 8 PM IST&rdquo;).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Vendor name</Label>
            <Input
              value={data.brand.vendorName}
              onChange={(e) => set('brand', { ...data.brand, vendorName: e.target.value })}
              placeholder="Radsting"
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Support hours</Label>
            <Input
              value={data.brand.supportHours}
              onChange={(e) => set('brand', { ...data.brand, supportHours: e.target.value })}
              placeholder="Mon — Sat · 9 AM — 8 PM IST"
              className="h-9 mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Sticky bottom save button for long forms */}
      <div className="flex justify-end pt-1">
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700"
          onClick={save}
          disabled={saving}
        >
          <Save className="w-3.5 h-3.5 mr-1" />
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}
