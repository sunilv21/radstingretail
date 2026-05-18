'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Inbox,
  RefreshCcw,
  Send,
  Building2,
  Tag,
  Clock,
  CheckCircle2,
  Lock,
  AlertCircle,
  Trash2,
  MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, ApiError } from '@/lib/admin-api'
import type {
  SupportRequestRow,
  SupportRequestListResponse,
  RequestStatus,
  RequestPriority,
  RequestType,
} from '@/lib/admin-types'

const STATUSES: RequestStatus[] = ['open', 'in_progress', 'resolved', 'closed']

const STATUS_LABEL: Record<RequestStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const STATUS_TONE: Record<RequestStatus, string> = {
  open: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  closed: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const PRIORITY_TONE: Record<RequestPriority, string> = {
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  normal: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  urgent: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
}

const TYPE_LABEL: Record<RequestType, string> = {
  support: 'Support',
  billing: 'Billing',
  feature: 'Feature',
  bug: 'Bug',
  upgrade: 'Upgrade',
  general: 'General',
}

function timeAgo(iso: string): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export default function RequestsPage() {
  const [list, setList] = useState<SupportRequestRow[]>([])
  const [summary, setSummary] = useState({
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
    unread: 0,
  })
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [active, setActive] = useState<SupportRequestRow | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')

  const load = async (preserveActive = false) => {
    setLoading(true)
    try {
      const path =
        statusFilter === 'all'
          ? '/platform/requests'
          : `/platform/requests?status=${statusFilter}`
      const res = await api.get<SupportRequestListResponse>(path)
      setList(res.requests)
      setSummary(res.summary)
      if (!preserveActive && !activeId && res.requests.length > 0) {
        openOne(res.requests[0].id)
      }
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Re-fetch when status filter flips. activeId is preserved so the
  // selected thread stays open across filter changes.
  useEffect(() => {
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const openOne = async (id: string) => {
    setActiveId(id)
    setReply('')
    try {
      const r = await api.get<SupportRequestRow>(`/platform/requests/${id}`)
      setActive(r)
      // Refresh the side list so the unread badge updates without a full reload.
      setList((prev) =>
        prev.map((x) => (x.id === id ? { ...x, unreadByVendor: false } : x)),
      )
      setSummary((s) => ({ ...s, unread: Math.max(0, s.unread - (r.unreadByVendor ? 0 : 0)) }))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    }
  }

  const sendReply = async () => {
    if (!active || !reply.trim()) return
    setSending(true)
    try {
      const updated = await api.post<SupportRequestRow>(
        `/platform/requests/${active.id}/reply`,
        { body: reply.trim() },
      )
      setActive(updated)
      setReply('')
      // Sync the side-list row with the new lastActivityAt + status.
      setList((prev) =>
        prev.map((x) =>
          x.id === updated.id
            ? {
                ...x,
                status: updated.status,
                lastActivityAt: updated.lastActivityAt,
                unreadByVendor: false,
              }
            : x,
        ),
      )
      toast.success('Reply sent')
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setSending(false)
    }
  }

  const moveStatus = async (status: RequestStatus) => {
    if (!active) return
    try {
      const updated = await api.put<SupportRequestRow>(
        `/platform/requests/${active.id}/status`,
        { status },
      )
      setActive(updated)
      setList((prev) =>
        prev.map((x) =>
          x.id === updated.id ? { ...x, status: updated.status, lastActivityAt: updated.lastActivityAt } : x,
        ),
      )
      toast.success(`Status → ${STATUS_LABEL[status]}`)
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    }
  }

  const removeRequest = async () => {
    if (!active) return
    if (!window.confirm(`Delete this request from "${active.organizationName}"? This cannot be undone.`)) return
    try {
      await api.del(`/platform/requests/${active.id}`)
      toast.success('Request deleted')
      setActive(null)
      setActiveId(null)
      load()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (r) =>
        r.subject.toLowerCase().includes(q) ||
        r.organizationName.toLowerCase().includes(q) ||
        (r.raisedByEmail || '').toLowerCase().includes(q),
    )
  }, [list, search])

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <Inbox className="w-6 h-6 text-rose-600" />
            Requests & Messages
            {summary.unread > 0 && (
              <Badge className="bg-rose-600 hover:bg-rose-600 text-white">{summary.unread} unread</Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Inbox for tenant tickets — support, billing, feature requests and bug reports. Reply
            inline; status moves to <em>In progress</em> automatically when you respond.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCcw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-1 flex-wrap text-[11px]">
        <FilterPill
          label="All"
          count={list.length}
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        {STATUSES.map((s) => (
          <FilterPill
            key={s}
            label={STATUS_LABEL[s]}
            count={summary[s]}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            tone={s}
          />
        ))}
      </div>

      {/* Two-pane layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3">
        {/* Side list */}
        <Card className="overflow-hidden">
          <div className="p-2 border-b">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subject, org or email…"
              className="w-full px-3 py-1.5 rounded-md border bg-background text-sm"
            />
          </div>
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto divide-y">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {loading ? 'Loading…' : 'No requests in this view'}
              </div>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openOne(r.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    activeId === r.id ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {r.unreadByVendor && (
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                        )}
                        <span className="font-semibold text-[13px] truncate">{r.subject}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{r.organizationName}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                      {timeAgo(r.lastActivityAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <span
                      className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_TONE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span
                      className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${PRIORITY_TONE[r.priority]}`}
                    >
                      {r.priority}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {TYPE_LABEL[r.type]}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Thread */}
        <Card className="overflow-hidden">
          {!active ? (
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
              Select a request from the left to read and reply.
            </CardContent>
          ) : (
            <div className="flex flex-col h-[calc(100vh-260px)]">
              {/* Thread header */}
              <div className="p-4 border-b space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold truncate">{active.subject}</h2>
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {active.organizationName}
                      </span>
                      <span>{active.raisedByName || active.raisedByEmail}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        opened {timeAgo(active.createdAt)}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={removeRequest}
                    title="Delete request"
                    className="text-rose-600 hover:text-rose-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className={STATUS_TONE[active.status]}>{STATUS_LABEL[active.status]}</Badge>
                  <Badge className={PRIORITY_TONE[active.priority]}>{active.priority}</Badge>
                  <Badge className="bg-muted text-foreground">
                    <Tag className="w-3 h-3 mr-1" />
                    {TYPE_LABEL[active.type]}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Move to:
                  </span>
                  {STATUSES.filter((s) => s !== active.status).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => moveStatus(s)}
                    >
                      {s === 'in_progress' && <Clock className="w-3 h-3 mr-1" />}
                      {s === 'resolved' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {s === 'closed' && <Lock className="w-3 h-3 mr-1" />}
                      {s === 'open' && <AlertCircle className="w-3 h-3 mr-1" />}
                      {STATUS_LABEL[s]}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
                <ThreadMessage
                  from="tenant"
                  authorName={active.raisedByName}
                  authorEmail={active.raisedByEmail}
                  body={active.body}
                  createdAt={active.createdAt}
                />
                {active.messages
                  // First message often equals `body`; only render extras.
                  .filter(
                    (m, i) =>
                      !(i === 0 && m.from === 'tenant' && m.body === active.body),
                  )
                  .map((m) => (
                    <ThreadMessage
                      key={m.id}
                      from={m.from}
                      authorName={m.authorName}
                      authorEmail={m.authorEmail}
                      body={m.body}
                      createdAt={m.createdAt}
                    />
                  ))}
              </div>

              {/* Reply box */}
              <div className="p-3 border-t bg-background">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  placeholder="Reply to the tenant…"
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm resize-y"
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-[11px] text-muted-foreground">
                    Sending a reply moves status to <em>In progress</em> if it&rsquo;s currently open.
                  </p>
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    disabled={!reply.trim() || sending}
                    onClick={sendReply}
                  >
                    <Send className="w-3.5 h-3.5 mr-1" />
                    {sending ? 'Sending…' : 'Send reply'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function ThreadMessage({
  from,
  authorName,
  authorEmail,
  body,
  createdAt,
}: {
  from: 'tenant' | 'vendor'
  authorName?: string
  authorEmail?: string
  body: string
  createdAt: string
}) {
  const isVendor = from === 'vendor'
  return (
    <div className={`flex ${isVendor ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isVendor
            ? 'bg-rose-600 text-white'
            : 'bg-card border'
        }`}
      >
        <div
          className={`text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5 ${
            isVendor ? 'text-rose-100' : 'text-muted-foreground'
          }`}
        >
          <span className="font-medium">{authorName || authorEmail || (isVendor ? 'Vendor' : 'Tenant')}</span>
          <span>·</span>
          <span>{timeAgo(createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap leading-snug">{body}</p>
      </div>
    </div>
  )
}

function FilterPill({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  tone?: RequestStatus
}) {
  const base =
    'px-2 py-1 rounded-full border transition-colors flex items-center gap-1'
  const inactive = 'bg-card hover:bg-muted text-muted-foreground border-border'
  const activeClass =
    tone && active
      ? STATUS_TONE[tone] + ' border-transparent'
      : 'bg-indigo-600 text-white border-indigo-600'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${active ? activeClass : inactive}`}
    >
      <span>{label}</span>
      <span
        className={`text-[10px] px-1.5 rounded-full ${
          active ? 'bg-white/20' : 'bg-muted-foreground/15'
        }`}
      >
        {count}
      </span>
    </button>
  )
}
