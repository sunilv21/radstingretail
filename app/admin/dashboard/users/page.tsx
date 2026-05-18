'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Search, Users, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/admin-api'
import type { PlatformUser } from '@/lib/admin-types'

const USER_TYPE_COLOURS: Record<string, string> = {
  super_admin: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  tenant_admin: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  staff: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
}

export default function UsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      // Server caps at 500 per collection; client filters by email below.
      setUsers(await api.get<PlatformUser[]>('/platform/users'))
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      u.email.toLowerCase().includes(q) ||
      (u.name || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    )
  })

  const toggleActive = async (u: PlatformUser) => {
    const next = !u.isActive
    if (
      !window.confirm(
        next
          ? `Re-activate ${u.email}? They'll be able to log in again.`
          : `Disable ${u.email}? They'll be locked out immediately.`,
      )
    ) return
    try {
      await api.put(`/platform/users/${u.id}/active`, { isActive: next })
      toast.success(`${u.email} ${next ? 'activated' : 'disabled'}`)
      load()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    }
  }

  const counts = users.reduce(
    (acc, u) => {
      acc.total++
      if (u.userType === 'super_admin') acc.superAdmin++
      else if (u.userType === 'tenant_admin') acc.tenantAdmin++
      else acc.staff++
      if (!u.isActive) acc.disabled++
      return acc
    },
    { total: 0, superAdmin: 0, tenantAdmin: 0, staff: 0, disabled: 0 },
  )

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-rose-600" />
            Cross-tenant users
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Vendor support — find any account by email, see which tenant they
            belong to, enable or disable them.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCcw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <Pill label="Total" value={counts.total} />
        <Pill label="Super admins" value={counts.superAdmin} cls={USER_TYPE_COLOURS.super_admin} />
        <Pill label="Tenant admins" value={counts.tenantAdmin} cls={USER_TYPE_COLOURS.tenant_admin} />
        <Pill label="Staff" value={counts.staff} cls={USER_TYPE_COLOURS.staff} />
        <Pill label="Disabled" value={counts.disabled} cls="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by email, name, role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      <Card className="py-0 gap-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>User type</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Org</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground italic">
                    {loading ? 'Loading…' : 'No matches.'}
                  </TableCell>
                </TableRow>
              ) : filtered.map((u) => (
                <TableRow key={u.id} className={u.isActive ? '' : 'opacity-60'}>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] uppercase ${USER_TYPE_COLOURS[u.userType] || 'bg-muted'}`}>
                      {u.userType}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] uppercase">{u.role}</Badge></TableCell>
                  <TableCell className="text-[11px] font-mono text-muted-foreground">
                    {u.organizationId ? String(u.organizationId).slice(-8) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? 'secondary' : 'destructive'}>
                      {u.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[11px]">
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleString('en-IN') : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => toggleActive(u)}>
                      {u.isActive ? 'Disable' : 'Enable'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Pill({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return (
    <div className={`rounded-md px-3 py-2 ${cls || 'bg-muted'} flex items-center justify-between`}>
      <span className="font-medium">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  )
}
