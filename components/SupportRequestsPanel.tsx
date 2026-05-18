'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  MessageSquarePlus,
  Inbox,
  Send,
  RefreshCcw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Lock,
  ChevronLeft,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/api'

type RequestStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
type RequestType = 'support' | 'billing' | 'feature' | 'bug' | 'upgrade' | 'general'
type RequestPriority = 'low' | 'normal' | 'high' | 'urgent'

interface RequestMessage {
  id: string
  from: 'tenant' | 'vendor'
  authorName: string
  body: string
  createdAt: string
}

interface TenantRequest {
  id: string
  subject: string
  body: string
  type: RequestType
  priority: RequestPriority
  status: RequestStatus
  messages: RequestMessage[]
  lastActivityAt: string
  createdAt: string
  updatedAt: string
}

const STATUS_TONE: Record<RequestStatus, string> = {
  open: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  closed: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const STATUS_LABEL: Record<RequestStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const TYPE_LABEL: Record<RequestType, string> = {
  support: 'Support',
  billing: 'Billing',
  feature: 'Feature request',
  bug: 'Bug report',
  upgrade: 'Plan upgrade',
  general: 'General',
}

const PRIORITY_LABEL: Record<RequestPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

function timeAgo(iso: string): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export default function SupportRequestsPanel() {
  const [list, setList] = useState<TenantRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [active, setActive] = useState<TenantRequest | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  // Compose form state
  const [type, setType] = useState<RequestType>('support')
  const [priority, setPriority] = useState<RequestPriority>('normal')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const rows = await api.get<TenantRequest[]>('/support/requests')
      setList(rows)
    } catch (e) {
      if (e instanceof ApiError) setErr(e.message)
      else setErr('Could not load your requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openOne = async (id: string) => {
    setActiveId(id)
    setReply('')
    try {
      const r = await api.get<TenantRequest>(`/support/requests/${id}`)
      setActive(r)
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message)
    }
  }

  const submitNew = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and message are required')
      return
    }
    setSubmitting(true)
    try {
      const created = await api.post<TenantRequest>('/support/requests', {
        subject: subject.trim(),
        body: body.trim(),
        type,
        priority,
      })
      toast.success('Request sent — your vendor has been notified.')
      setSubject('')
      setBody('')
      setType('support')
      setPriority('normal')
      setComposeOpen(false)
      setList((prev) => [created, ...prev])
      // Open the new thread for clarity.
      setActiveId(created.id)
      setActive(created)
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const sendReply = async () => {
    if (!active || !reply.trim()) return
    setSending(true)
    try {
      const updated = await api.post<TenantRequest>(
        `/support/requests/${active.id}/reply`,
        { body: reply.trim() },
      )
      setActive(updated)
      setReply('')
      setList((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      toast.success('Reply sent')
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message)
    } finally {
      setSending(false)
    }
  }

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, resolved: 0, closed: 0 }
    for (const r of list) c[r.status] += 1
    return c
  }, [list])

  // ---- Active thread view ------------------------------------------------
  if (active) {
    return (
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActive(null)
                setActiveId(null)
                load()
              }}
              className="-ml-2"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Back to requests
            </Button>
          </div>
          <CardTitle className="text-base">{active.subject}</CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <Badge className={STATUS_TONE[active.status]}>
              {STATUS_LABEL[active.status]}
            </Badge>
            <Badge variant="outline">{TYPE_LABEL[active.type]}</Badge>
            <Badge variant="outline">{PRIORITY_LABEL[active.priority]} priority</Badge>
            <span className="text-muted-foreground ml-1">
              opened {timeAgo(active.createdAt)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/20 p-3 space-y-3 max-h-[420px] overflow-y-auto">
            <ThreadMessage
              from="tenant"
              authorName={active.messages[0]?.authorName || 'You'}
              body={active.body}
              createdAt={active.createdAt}
            />
            {active.messages
              .filter(
                (m, i) =>
                  !(i === 0 && m.from === 'tenant' && m.body === active.body),
              )
              .map((m) => (
                <ThreadMessage
                  key={m.id}
                  from={m.from}
                  authorName={m.authorName}
                  body={m.body}
                  createdAt={m.createdAt}
                />
              ))}
          </div>

          {active.status === 'closed' ? (
            <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              This ticket is closed. Open a new request to continue the conversation.
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">Reply to vendor</Label>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder="Add more context, share screenshots, or follow up…"
                className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-y"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="bg-rose-600 hover:bg-rose-700"
                  disabled={!reply.trim() || sending}
                  onClick={sendReply}
                >
                  <Send className="w-3.5 h-3.5 mr-1" />
                  {sending ? 'Sending…' : 'Send reply'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // ---- Compose view ------------------------------------------------------
  if (composeOpen) {
    return (
      <Card>
        <CardHeader className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setComposeOpen(false)}
            className="-ml-2 self-start"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to requests
          </Button>
          <CardTitle className="text-base">Raise a new request</CardTitle>
          <CardDescription>
            Send a support, billing or feature request directly to your software vendor.
            They&rsquo;ll see this in their admin portal and reply here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as RequestType)}
                className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
              >
                <option value="support">Support — I need help</option>
                <option value="billing">Billing — invoice or payment query</option>
                <option value="upgrade">Upgrade — change my plan</option>
                <option value="feature">Feature request</option>
                <option value="bug">Bug report</option>
                <option value="general">General</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as RequestPriority)}
                className="mt-1 w-full h-9 px-2 rounded-md border bg-background text-sm"
              >
                <option value="low">Low — when you can</option>
                <option value="normal">Normal</option>
                <option value="high">High — blocking my work</option>
                <option value="urgent">Urgent — production down</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="One-line summary"
              className="h-9 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Message</Label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Describe what you need. Include steps to reproduce, screenshots links, or what you'd like to change."
              className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-y mt-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setComposeOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700"
              onClick={submitNew}
              disabled={submitting}
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              {submitting ? 'Sending…' : 'Send to vendor'}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ---- List view ---------------------------------------------------------
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="w-4 h-4 text-blue-600" />
            Your requests
          </CardTitle>
          <CardDescription>
            Support, billing, feature requests and bug reports — direct line to your
            software vendor.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="bg-rose-600 hover:bg-rose-700"
            onClick={() => setComposeOpen(true)}
          >
            <MessageSquarePlus className="w-3.5 h-3.5 mr-1" />
            New request
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Status counts */}
        <div className="flex gap-1.5 flex-wrap text-[11px] mb-3">
          <CountChip label="Open" value={counts.open} tone="open" />
          <CountChip label="In progress" value={counts.in_progress} tone="in_progress" />
          <CountChip label="Resolved" value={counts.resolved} tone="resolved" />
          <CountChip label="Closed" value={counts.closed} tone="closed" />
        </div>

        {err ? (
          <div className="py-4 text-sm flex items-center gap-2 text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4" /> {err}
          </div>
        ) : loading && list.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : list.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground space-y-2">
            <Inbox className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <div>No requests yet.</div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setComposeOpen(true)}
            >
              <MessageSquarePlus className="w-3.5 h-3.5 mr-1" />
              Open the first one
            </Button>
          </div>
        ) : (
          <div className="divide-y rounded-md border overflow-hidden">
            {list.map((r) => {
              const replyCount = Math.max(0, r.messages.length - 1)
              return (
                <button
                  key={r.id}
                  onClick={() => openOne(r.id)}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{r.subject}</div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {r.body}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                      {timeAgo(r.lastActivityAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap text-[10px]">
                    <span
                      className={`px-1.5 py-0.5 rounded uppercase tracking-wider ${STATUS_TONE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wider">
                      {TYPE_LABEL[r.type]}
                    </span>
                    {replyCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">
                        {replyCount} repl{replyCount === 1 ? 'y' : 'ies'}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CountChip({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: RequestStatus
}) {
  const Icon =
    tone === 'open'
      ? AlertCircle
      : tone === 'in_progress'
        ? Clock
        : tone === 'resolved'
          ? CheckCircle2
          : Lock
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${STATUS_TONE[tone]}`}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  )
}

function ThreadMessage({
  from,
  authorName,
  body,
  createdAt,
}: {
  from: 'tenant' | 'vendor'
  authorName: string
  body: string
  createdAt: string
}) {
  const isMe = from === 'tenant'
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isMe ? 'bg-rose-600 text-white' : 'bg-card border'
        }`}
      >
        <div
          className={`text-[10px] uppercase tracking-wider mb-1 ${
            isMe ? 'text-rose-100' : 'text-muted-foreground'
          }`}
        >
          {authorName || (isMe ? 'You' : 'Vendor')} · {timeAgo(createdAt)}
        </div>
        <p className="whitespace-pre-wrap leading-snug">{body}</p>
      </div>
    </div>
  )
}
