'use client'

import { useEffect, useState } from 'react'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Users, UserPlus, Copy, RefreshCcw, Trash2, ShieldCheck, Eye, EyeOff, Wand2 } from 'lucide-react'
import PlanUsageBadge from '@/components/PlanUsageBadge'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import { can, getCurrentUser } from '@/lib/rbac'
import type { AuthUser, Role } from '@/lib/types'

interface UserRow {
  id: string
  name: string
  email: string
  role: Role
  storeIds?: string[]
  isActive: boolean
  lastLogin?: string
  createdAt?: string
}
interface InviteRow {
  id: string
  email: string
  role: Role
  storeIds?: string[]
  expiresAt: string
  createdAt: string
}
interface Branch {
  _id: string
  name: string
  code?: string
}

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: 'admin',      label: 'Admin',      hint: 'Full control over the org. Can manage branches, users, settings.' },
  { value: 'manager',    label: 'Manager',    hint: 'Run a branch — sales, inventory, purchases. No org-level edits.' },
  { value: 'cashier',    label: 'Cashier',    hint: 'POS only — ring up sales, look up products. Read-only reports.' },
  { value: 'accountant', label: 'Accountant', hint: 'Full access to books + GST. Read-only sales/purchases.' },
  { value: 'ca',         label: 'CA / Auditor (read-only)', hint: 'External CA. Books + GST + reports, no PII, no writes.' },
]

export default function UsersPage() {
  const [me, setMe] = useState<AuthUser | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [inviteCaOpen, setInviteCaOpen] = useState(false)
  const [pwdTarget, setPwdTarget] = useState<UserRow | null>(null)
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)

  useEffect(() => setMe(getCurrentUser()), [])

  const load = async () => {
    setLoading(true)
    try {
      const [u, inv, br] = await Promise.all([
        api.get<UserRow[]>('/users'),
        api.get<InviteRow[]>('/users/invites'),
        api.get<Branch[]>('/stores'),
      ])
      setUsers(u)
      setInvites(inv)
      setBranches(br)
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const canManage = can(me, 'users', 'create')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Users &amp; access
            <PlanUsageBadge resource="users" />
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create accounts for your staff (you set their password) and time-limited
            invites for your CA. Roles drive what each person can see and do.
            Removed users keep their audit trail.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className="w-4 h-4 mr-1" /> {loading ? 'Loading…' : 'Refresh'}
          </Button>
          {canManage && (
            <>
              <Button variant="outline" onClick={() => setInviteCaOpen(true)}>
                <ShieldCheck className="w-4 h-4 mr-1 text-emerald-600" /> Invite CA
              </Button>
              <Button onClick={() => setCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                <UserPlus className="w-4 h-4 mr-1" /> Create user
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users">Active users ({users.filter((u) => u.isActive).length})</TabsTrigger>
          <TabsTrigger value="invites">Pending CA invites ({invites.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="space-y-2">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Branches</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last login</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">{loading ? 'Loading…' : 'No users yet.'}</TableCell></TableRow>
                  ) : users.map((u) => (
                    <TableRow key={u.id} className={u.isActive ? '' : 'opacity-60'}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="font-mono text-xs">{u.email}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] uppercase">{u.role}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {(u.storeIds || []).length === 0
                          ? <span className="text-muted-foreground italic">All</span>
                          : (u.storeIds || []).map((id) => branches.find((b) => b._id === id)?.code || branches.find((b) => b._id === id)?.name || '—').join(', ')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.isActive ? 'secondary' : 'destructive'}>
                          {u.isActive ? 'Active' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{u.lastLogin ? new Date(u.lastLogin).toLocaleString('en-IN') : '—'}</TableCell>
                      <TableCell>
                        {canManage && (
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => setEditTarget(u)}
                              title="Edit role / branches"
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => setPwdTarget(u)}
                              title="Reset this user's password"
                            >
                              Reset password
                            </Button>
                            {u.id !== me?.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs"
                                onClick={async () => {
                                  try {
                                    await api.put(`/users/${u.id}`, { isActive: !u.isActive })
                                    toast.success(`${u.name} ${u.isActive ? 'disabled' : 're-enabled'}`)
                                    load()
                                  } catch (err) {
                                    if (err instanceof ApiError) toast.error(err.message)
                                  }
                                }}
                              >
                                {u.isActive ? 'Disable' : 'Enable'}
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invites" className="space-y-2">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Branches</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground italic">No pending invites.</TableCell></TableRow>
                  ) : invites.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.email}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] uppercase">{i.role}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {(i.storeIds || []).length === 0
                          ? <span className="text-muted-foreground italic">All</span>
                          : (i.storeIds || []).map((id) => branches.find((b) => b._id === id)?.code || '—').join(', ')}
                      </TableCell>
                      <TableCell className="text-xs">{new Date(i.expiresAt).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Revoke invite"
                            onClick={async () => {
                              if (!confirm(`Revoke invite to ${i.email}?`)) return
                              try {
                                await api.del(`/users/invites/${i.id}`)
                                toast.success('Invite revoked')
                                load()
                              } catch (err) {
                                if (err instanceof ApiError) toast.error(err.message)
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-rose-500" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {createOpen && (
        <CreateUserDialog
          branches={branches}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            load()
          }}
        />
      )}
      {pwdTarget && (
        <ResetPasswordDialog
          user={pwdTarget}
          onClose={() => setPwdTarget(null)}
        />
      )}
      {editTarget && (
        <EditUserDialog
          user={editTarget}
          branches={branches}
          isSelf={editTarget.id === me?.id}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            load()
          }}
        />
      )}
      {inviteCaOpen && (
        <InviteDialog
          branches={branches}
          isCaInvite={true}
          onClose={() => setInviteCaOpen(false)}
          onCreated={() => {
            setInviteCaOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function generateStrongPassword(): string {
  // 12-char password with at least one of each class. Avoids visually-confusing
  // chars (0/O, 1/l/I) so the admin can read it aloud / paste over WhatsApp.
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%&*?'
  const all = upper + lower + digits + symbols
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  while (required.length < 12) required.push(pick(all))
  // Fisher-Yates shuffle
  for (let i = required.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[required[i], required[j]] = [required[j], required[i]]
  }
  return required.join('')
}

function CreateUserDialog({
  branches, onClose, onCreated,
}: {
  branches: Branch[]
  onClose: () => void
  onCreated: () => void
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('cashier')
  const [storeIds, setStoreIds] = useState<string[]>([])
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // After successful create, show a confirmation panel with the credentials
  // so the admin can copy + hand them off to the staff member.
  const [created, setCreated] = useState<{ email: string; password: string; name: string } | null>(null)

  const toggleStore = (id: string) => {
    setStoreIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    if (!email.trim()) {
      toast.error('Email is required')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/users', {
        name: name.trim(),
        email: email.trim(),
        role,
        storeIds,
        password,
      })
      toast.success(`Account created for ${email.trim()}`)
      setCreated({ email: email.trim(), password, name: name.trim() })
      onCreated() // refresh parent — but stay open to show the credentials
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error('Could not create user')
    } finally {
      setSubmitting(false)
    }
  }

  const copyCredentials = () => {
    if (!created) return
    const text = `Login at: ${typeof window !== 'undefined' ? window.location.origin : ''}\nEmail: ${created.email}\nPassword: ${created.password}`
    navigator.clipboard.writeText(text).then(() => toast.success('Credentials copied to clipboard'))
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user account</DialogTitle>
          <DialogDescription>
            You set the password upfront and hand it to your staff. They can change it
            after their first login. No invitation email is sent.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3">
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-md p-3 text-sm">
              <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                ✓ Account created for {created.name}
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                Share these credentials privately. Ask the user to change their password after first login.
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input readOnly value={created.email} className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Password</Label>
              <Input readOnly value={created.password} className="font-mono text-xs" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={copyCredentials}>
                <Copy className="w-4 h-4 mr-1" /> Copy credentials
              </Button>
              <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Full name *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Kumari" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="asha@example.com" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <select
                  className="h-9 border rounded-md px-2 bg-background w-full text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {ROLE_OPTIONS.find((r) => r.value === role)?.hint}
                </p>
                {role === 'ca' && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    For an external auditor with a time-bound 90-day link, use{' '}
                    <b>Invite CA</b> instead. This flow creates a permanent CA account.
                  </p>
                )}
              </div>

              {branches.length > 1 && role !== 'ca' && (
                <div className="space-y-1">
                  <Label className="text-xs">Branches (leave empty = all branches in your org)</Label>
                  <div className="grid grid-cols-2 gap-1.5 border rounded p-2 max-h-36 overflow-y-auto">
                    {branches.map((b) => (
                      <label key={b._id} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={storeIds.includes(b._id)}
                          onChange={() => toggleStore(b._id)}
                        />
                        <span className="truncate">{b.code ? `${b.code} · ` : ''}{b.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {role === 'ca' && branches.length > 1 && (
                <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-[12px] text-emerald-800 dark:text-emerald-300">
                  CAs are granted read-only access to every branch in your organisation
                  automatically.
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Password * (min 8 chars)</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setPassword(generateStrongPassword())
                      setShowPassword(true)
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" /> Generate strong
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
                {submitting ? 'Creating…' : 'Create account'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({
  user, branches, isSelf, onClose, onSaved,
}: {
  user: UserRow
  branches: Branch[]
  isSelf: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState<Role>(user.role)
  const [storeIds, setStoreIds] = useState<string[]>(user.storeIds || [])
  const [submitting, setSubmitting] = useState(false)

  const toggleStore = (id: string) => {
    setStoreIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const dirty =
    name.trim() !== user.name ||
    role !== user.role ||
    JSON.stringify([...storeIds].sort()) !== JSON.stringify([...(user.storeIds || [])].sort())

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    setSubmitting(true)
    try {
      // CA stays out of the regular role list — switching someone TO 'ca'
      // here would skip the time-bound invite flow, which is wrong.
      if (role === 'ca' && user.role !== 'ca') {
        toast.error('To make a CA, revoke this user and use the "Invite CA" flow.')
        setSubmitting(false)
        return
      }
      await api.put(`/users/${user.id}`, {
        name: name.trim(),
        role,
        storeIds,
      })
      toast.success(`Updated ${name.trim()}`)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error('Could not update user')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user · {user.name}</DialogTitle>
          <DialogDescription>
            Change name, role, or branch access. Email and password aren&rsquo;t edited
            here — use Reset password for credentials.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Full name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input readOnly value={user.email} className="font-mono text-xs bg-muted" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <select
              className="h-9 border rounded-md px-2 bg-background w-full text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={isSelf}
              title={isSelf ? "You can't change your own role" : undefined}
            >
              {ROLE_OPTIONS.filter((r) => r.value !== 'ca' || user.role === 'ca').map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              {ROLE_OPTIONS.find((r) => r.value === role)?.hint}
            </p>
            {isSelf && (
              <p className="text-[11px] text-amber-600">
                You can&rsquo;t change your own role — ask another admin to do it.
              </p>
            )}
          </div>

          {branches.length > 1 && role !== 'ca' && (
            <div className="space-y-1">
              <Label className="text-xs">Branches (leave empty = all branches in your org)</Label>
              <div className="grid grid-cols-2 gap-1.5 border rounded p-2 max-h-36 overflow-y-auto">
                {branches.map((b) => (
                  <label key={b._id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={storeIds.includes(b._id)}
                      onChange={() => toggleStore(b._id)}
                    />
                    <span className="truncate">{b.code ? `${b.code} · ` : ''}{b.name}</span>
                  </label>
                ))}
              </div>
              {storeIds.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Empty selection grants access to every branch in your org.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting || !dirty}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({
  user, onClose,
}: {
  user: UserRow
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSubmitting(true)
    try {
      await api.put(`/users/${user.id}/password`, { password })
      toast.success(`Password reset for ${user.name}`)
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error('Could not reset password')
    } finally {
      setSubmitting(false)
    }
  }

  const copyCredentials = () => {
    const text = `Login at: ${typeof window !== 'undefined' ? window.location.origin : ''}\nEmail: ${user.email}\nPassword: ${password}`
    navigator.clipboard.writeText(text).then(() => toast.success('Credentials copied to clipboard'))
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {user.name}</DialogTitle>
          <DialogDescription>
            Set a new password and hand it to <span className="font-mono text-xs">{user.email}</span>.
            They can change it after their next login. Their existing sessions stay active until they log out.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3">
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-md p-3 text-sm">
              <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                ✓ Password reset for {user.name}
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                Share these privately. The user should change their password after first login.
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input readOnly value={user.email} className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">New password</Label>
              <Input readOnly value={password} className="font-mono text-xs" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={copyCredentials}>
                <Copy className="w-4 h-4 mr-1" /> Copy credentials
              </Button>
              <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">New password * (min 8 chars)</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setPassword(generateStrongPassword())
                      setShowPassword(true)
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" /> Generate strong
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
                {submitting ? 'Resetting…' : 'Reset password'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InviteDialog({
  branches, isCaInvite, onClose, onCreated,
}: {
  branches: Branch[]
  isCaInvite: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>(isCaInvite ? 'ca' : 'cashier')
  const [storeIds, setStoreIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null)

  const toggleStore = (id: string) => {
    setStoreIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const submit = async () => {
    if (!email.trim()) {
      toast.error('Email is required')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post<{ acceptUrl: string }>('/users/invite', {
        email: email.trim(),
        name: name.trim(),
        role,
        storeIds: role === 'ca' ? [] : storeIds,
      })
      setAcceptUrl(res.acceptUrl)
      toast.success(`Invite sent to ${email}`)
      onCreated() // refresh parent list — but stay open to show the link
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error('Could not create invite')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isCaInvite ? 'Invite your CA' : 'Invite a user'}
          </DialogTitle>
          <DialogDescription>
            {isCaInvite
              ? 'A CA invite gives 90-day read-only access to books, GST returns and reports. Customer phone numbers and addresses are automatically redacted.'
              : 'They receive a link valid for 14 days. They set their own password on accept.'}
          </DialogDescription>
        </DialogHeader>
        {acceptUrl ? (
          <div className="space-y-3">
            <p className="text-sm">Invite created. Send this link to <b>{email}</b>:</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={acceptUrl} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(acceptUrl).then(() => toast.success('Link copied'))
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              In production this would be emailed automatically. For now, send it
              over email or WhatsApp yourself.
            </p>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Name (optional)</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              </div>
              {!isCaInvite && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Role</Label>
                    <select
                      className="h-9 border rounded-md px-2 bg-background w-full text-sm"
                      value={role}
                      onChange={(e) => setRole(e.target.value as Role)}
                    >
                      {ROLE_OPTIONS.filter((r) => r.value !== 'ca').map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      {ROLE_OPTIONS.find((r) => r.value === role)?.hint}
                    </p>
                  </div>
                  {branches.length > 1 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Branches (leave empty = all branches)</Label>
                      <div className="grid grid-cols-2 gap-1.5 border rounded p-2 max-h-36 overflow-y-auto">
                        {branches.map((b) => (
                          <label key={b._id} className="flex items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              checked={storeIds.includes(b._id)}
                              onChange={() => toggleStore(b._id)}
                            />
                            <span className="truncate">{b.code ? `${b.code} · ` : ''}{b.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
                {submitting ? 'Creating…' : 'Create invite'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
