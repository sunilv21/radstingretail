'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Receipt,
  RefreshCcw,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ExternalLink,
  Hourglass,
  Send,
  CreditCard,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { ApiError } from '@/lib/api'
import {
  listPayments,
  confirmReturn,
  cancelIntent,
  getIntent,
  type PaymentIntent,
} from '@/lib/checkout'

const STATUS_TONE: Record<PaymentIntent['status'], string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  awaiting_confirmation: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  cancelled: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const STATUS_LABEL: Record<PaymentIntent['status'], string> = {
  pending: 'Awaiting payment',
  awaiting_confirmation: 'Awaiting vendor confirmation',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

const STATUS_ICON: Record<PaymentIntent['status'], React.ComponentType<{ className?: string }>> = {
  pending: Hourglass,
  awaiting_confirmation: Clock,
  completed: CheckCircle2,
  rejected: AlertCircle,
  cancelled: XCircle,
}

const TYPE_LABEL: Record<PaymentIntent['type'], string> = {
  subscription: 'Subscription',
  user_addon: 'Extra users',
  manual: 'Manual',
  other: 'Other',
}

const inr = (n: number, currency = 'INR') =>
  currency === 'INR'
    ? '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : `${currency} ${Number(n || 0).toLocaleString()}`

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Billing & Payments — rendered as a Settings tab beneath Subscription.
 * Lists every PlatformPayment row for the tenant and provides the
 * "I've paid — here's my reference" confirmation flow that flips the
 * row to `awaiting_confirmation` for the vendor inbox.
 */
export default function BillingTab() {
  const searchParams = useSearchParams()
  const [list, setList] = useState<PaymentIntent[]>([])
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState<PaymentIntent | null>(null)
  const [confirmRef, setConfirmRef] = useState('')
  const [confirmNote, setConfirmNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setList(await listPayments())
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // ?ref=<reference> may be appended when the tenant lands here after
  // hitting Pay on a plan — we surface it as a "you just started this"
  // banner so they can confirm immediately.
  const refFromUrl = searchParams?.get('ref') || null
  const recentRef = useMemo(() => {
    if (!refFromUrl) return null
    return list.find((p) => p.reference === refFromUrl) || null
  }, [list, refFromUrl])

  const openConfirm = async (p: PaymentIntent) => {
    setConfirming(p)
    setConfirmRef('')
    setConfirmNote('')
    try {
      setConfirming(await getIntent(p.reference))
    } catch {
      /* dialog still works with the stale row */
    }
  }

  const submitConfirm = async () => {
    if (!confirming) return
    setSubmitting(true)
    try {
      await confirmReturn(confirming.reference, {
        gatewayReference: confirmRef.trim() || undefined,
        tenantNote: confirmNote.trim() || undefined,
      })
      toast.success("Marked as awaiting vendor confirmation. We'll activate the moment they verify.")
      setConfirming(null)
      load()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const cancel = async (p: PaymentIntent) => {
    if (!window.confirm(`Cancel payment ${p.reference}?`)) return
    try {
      await cancelIntent(p.reference)
      toast.success('Payment cancelled')
      load()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    }
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('Copied'),
      () => toast.error('Could not copy'),
    )
  }

  return (
    <div className="space-y-3">
      {/* Recent intent banner */}
      {recentRef && recentRef.status === 'pending' && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
          <CardContent className="p-3 flex items-start gap-3 flex-wrap">
            <Hourglass className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-[260px]">
              <div className="font-semibold text-sm text-amber-900 dark:text-amber-200">
                Payment <span className="font-mono">{recentRef.reference}</span> is waiting for you to pay.
              </div>
              <div className="text-[12px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                {recentRef.gatewayUrl
                  ? "A new tab opened with the payment gateway. Once you finish, click 'I've paid' below."
                  : "Your vendor was contacted with this reference. They'll confirm once payment is received."}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {recentRef.gatewayUrl && (
                <a href={recentRef.gatewayUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline">
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                    Reopen gateway
                  </Button>
                </a>
              )}
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => openConfirm(recentRef)}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                I&rsquo;ve paid
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4 text-rose-600" />
              Billing &amp; Payment History
            </CardTitle>
            <CardDescription>
              Every payment you&rsquo;ve started — subscription renewals, plan switches and
              extra-user add-ons. After paying at the gateway, click <em>I&rsquo;ve paid</em>{' '}
              to flag it for vendor confirmation.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {list.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No payments yet. Start one from the catalogue above (Subscription tab).
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-3 py-2">Reference</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Created</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((p) => {
                  const Icon = STATUS_ICON[p.status]
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-[12px]">
                        <button
                          onClick={() => copy(p.reference)}
                          className="hover:underline inline-flex items-center gap-1"
                          title="Click to copy"
                        >
                          {p.reference}
                          <Copy className="w-3 h-3 opacity-50" />
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px]">
                          {p.type === 'subscription' ? (
                            <CreditCard className="w-3 h-3 mr-1" />
                          ) : (
                            <Send className="w-3 h-3 mr-1" />
                          )}
                          {TYPE_LABEL[p.type]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {p.type === 'subscription'
                          ? p.planName || p.planCode
                          : p.type === 'user_addon'
                            ? `${p.addonQuantity} × ${p.addonRole} slot${p.addonQuantity === 1 ? '' : 's'}`
                            : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {inr(p.amount, p.currency)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${STATUS_TONE[p.status]}`}
                        >
                          <Icon className="w-3 h-3" />
                          {STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground">
                        {fmtDate(p.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {p.gatewayUrl && p.status === 'pending' && (
                            <a
                              href={p.gatewayUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Reopen gateway"
                            >
                              <Button size="icon" variant="ghost" className="h-7 w-7">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>
                            </a>
                          )}
                          {p.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                onClick={() => openConfirm(p)}
                              >
                                I&rsquo;ve paid
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-rose-600 hover:text-rose-700"
                                onClick={() => cancel(p)}
                                title="Cancel"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Confirm-return dialog */}
      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm your payment</DialogTitle>
            <DialogDescription>
              Reference <span className="font-mono">{confirming?.reference}</span> ·{' '}
              {confirming && inr(confirming.amount, confirming.currency)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Gateway / transaction reference (optional)</Label>
              <Input
                value={confirmRef}
                onChange={(e) => setConfirmRef(e.target.value)}
                placeholder="e.g. pay_NXa1Bcd23eFgHij"
                className="h-9 mt-1 font-mono text-[12px]"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Helps your vendor verify quicker. Find it on your payment confirmation
                page or email from the gateway.
              </p>
            </div>
            <div>
              <Label className="text-xs">Note to vendor (optional)</Label>
              <textarea
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                rows={2}
                placeholder="Anything you'd like to flag (e.g. 'paid via UPI from a different bank account')."
                className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-y mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={submitConfirm}
              disabled={submitting}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {submitting ? 'Submitting…' : 'Submit confirmation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
