'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Users, Plus, RefreshCcw, Play, Eye, CheckCircle2, Briefcase, Calculator, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Employee {
  _id: string;
  employeeCode: string;
  name: string;
  email?: string;
  phone?: string;
  pan?: string;
  bankAccount?: string;
  bankIfsc?: string;
  pfUan?: string;
  esiNumber?: string;
  designation?: string;
  department?: string;
  joinDate?: string;
  exitDate?: string;
  salary: {
    basic: number; hra: number; conveyance: number; medicalAllowance: number; otherAllowances: number;
    pfApplicable: boolean; esiApplicable: boolean; professionalTax: number; tds: number;
  };
  isActive: boolean;
}

interface Payslip {
  _id: string;
  payslipNumber: string;
  employeeId: string;
  employeeSnapshot: { employeeCode: string; name: string; designation?: string; pan?: string; pfUan?: string; esiNumber?: string; bankAccount?: string; bankIfsc?: string };
  period: string;
  workDaysInMonth: number;
  paidDays: number;
  lopDays: number;
  earnings: { basic: number; hra: number; conveyance: number; medicalAllowance: number; otherAllowances: number; overtime: number; bonus: number; gross: number };
  deductions: { pfEmployee: number; esiEmployee: number; professionalTax: number; tds: number; loanRecovery: number; other: number; total: number };
  employerContribution: { pfEmployer: number; esiEmployer: number; total: number };
  netSalary: number;
  status: 'draft' | 'finalized' | 'paid';
  paidAt?: string;
  paymentMode?: string;
  paymentReference?: string;
}

function defaultPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PayrollPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Briefcase className="w-7 h-7 text-indigo-600" />
          Payroll
        </h1>
        <p className="text-muted-foreground mt-1">
          Employee master + monthly payroll runs. Payslips post Salary Expense, PF/ESI/PT/TDS
          payables, and Salary Payable to the ledger automatically.
        </p>
      </div>

      <Tabs defaultValue="employees">
        <TabsList className="grid grid-cols-2 max-w-md">
          <TabsTrigger value="employees"><Users className="w-4 h-4 mr-1" /> Employees</TabsTrigger>
          <TabsTrigger value="payslips"><Calculator className="w-4 h-4 mr-1" /> Payslips & Run</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <EmployeesTab />
        </TabsContent>
        <TabsContent value="payslips" className="space-y-4">
          <PayslipsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =================================================================
// Employees tab
// =================================================================

function EmployeesTab() {
  const [list, setList] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setList(await api.get<Employee[]>('/payroll/employees'));
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Employees</CardTitle>
            <CardDescription>{list.length} active</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCcw className="w-4 h-4 mr-1" />{loading ? 'Loading…' : 'Refresh'}
            </Button>
            <Button onClick={() => setCreating(true)} className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-1" /> Add employee
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead className="text-right">Basic</TableHead>
              <TableHead className="text-right">HRA</TableHead>
              <TableHead className="text-right">Gross (CTC est.)</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground italic py-8">No employees yet. Click &quot;Add employee&quot; to start.</TableCell></TableRow>
            ) : list.map((e) => {
              const ctc = (e.salary.basic || 0) + (e.salary.hra || 0) + (e.salary.conveyance || 0) + (e.salary.medicalAllowance || 0) + (e.salary.otherAllowances || 0);
              return (
                <TableRow key={e._id}>
                  <TableCell className="font-mono text-xs">{e.employeeCode}</TableCell>
                  <TableCell>
                    <div className="font-medium">{e.name}</div>
                    {e.email && <div className="text-[10px] text-muted-foreground">{e.email}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{e.designation || '—'}{e.department && <div className="text-[10px] text-muted-foreground">{e.department}</div>}</TableCell>
                  <TableCell className="text-right font-mono">{money(e.salary.basic)}</TableCell>
                  <TableCell className="text-right font-mono">{money(e.salary.hra)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{money(ctc)}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(e)}><Pencil className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      {(creating || editing) && (
        <EmployeeDialog
          employee={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </Card>
  );
}

function EmployeeDialog({ employee, onClose, onSaved }: { employee: Employee | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!employee;
  const [form, setForm] = useState(() => ({
    employeeCode: employee?.employeeCode || '',
    name: employee?.name || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    pan: employee?.pan || '',
    bankAccount: employee?.bankAccount || '',
    bankIfsc: employee?.bankIfsc || '',
    pfUan: employee?.pfUan || '',
    esiNumber: employee?.esiNumber || '',
    designation: employee?.designation || '',
    department: employee?.department || '',
    joinDate: employee?.joinDate ? employee.joinDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    salary: {
      basic: employee?.salary.basic ?? 0,
      hra: employee?.salary.hra ?? 0,
      conveyance: employee?.salary.conveyance ?? 0,
      medicalAllowance: employee?.salary.medicalAllowance ?? 0,
      otherAllowances: employee?.salary.otherAllowances ?? 0,
      pfApplicable: employee?.salary.pfApplicable ?? true,
      esiApplicable: employee?.salary.esiApplicable ?? true,
      professionalTax: employee?.salary.professionalTax ?? 200,
      tds: employee?.salary.tds ?? 0,
    },
    isActive: employee?.isActive ?? true,
  }));
  const [saving, setSaving] = useState(false);

  const ctc = form.salary.basic + form.salary.hra + form.salary.conveyance + form.salary.medicalAllowance + form.salary.otherAllowances;

  const submit = async () => {
    if (!form.employeeCode || !form.name) {
      toast.error('Employee code + name are required');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && employee) {
        await api.put(`/payroll/employees/${employee._id}`, form);
        toast.success('Employee updated');
      } else {
        await api.post('/payroll/employees', form);
        toast.success(`Employee ${form.name} added`);
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${employee?.name}` : 'Add new employee'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Employee code *">
              <Input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} disabled={isEdit} />
            </Field>
            <Field label="Name *" colSpan={2}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="PAN"><Input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} maxLength={10} /></Field>
            <Field label="Designation"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
            <Field label="Department"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            <Field label="Join date"><Input type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} /></Field>
            <Field label="Bank A/c"><Input value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} /></Field>
            <Field label="IFSC"><Input value={form.bankIfsc} onChange={(e) => setForm({ ...form, bankIfsc: e.target.value.toUpperCase() })} /></Field>
            <Field label="PF UAN"><Input value={form.pfUan} onChange={(e) => setForm({ ...form, pfUan: e.target.value })} /></Field>
            <Field label="ESI #"><Input value={form.esiNumber} onChange={(e) => setForm({ ...form, esiNumber: e.target.value })} /></Field>
          </div>

          <div className="border rounded p-3 space-y-3 bg-muted/30">
            <div className="font-semibold text-sm">Salary structure (monthly)</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Basic (₹)"><NumInput value={form.salary.basic} onChange={(v) => setForm({ ...form, salary: { ...form.salary, basic: v } })} /></Field>
              <Field label="HRA (₹)"><NumInput value={form.salary.hra} onChange={(v) => setForm({ ...form, salary: { ...form.salary, hra: v } })} /></Field>
              <Field label="Conveyance (₹)"><NumInput value={form.salary.conveyance} onChange={(v) => setForm({ ...form, salary: { ...form.salary, conveyance: v } })} /></Field>
              <Field label="Medical (₹)"><NumInput value={form.salary.medicalAllowance} onChange={(v) => setForm({ ...form, salary: { ...form.salary, medicalAllowance: v } })} /></Field>
              <Field label="Other allowances (₹)"><NumInput value={form.salary.otherAllowances} onChange={(v) => setForm({ ...form, salary: { ...form.salary, otherAllowances: v } })} /></Field>
              <Field label="Professional Tax (₹/mo)"><NumInput value={form.salary.professionalTax} onChange={(v) => setForm({ ...form, salary: { ...form.salary, professionalTax: v } })} /></Field>
              <Field label="TDS (₹/mo)" colSpan={3}>
                <NumInput value={form.salary.tds} onChange={(v) => setForm({ ...form, salary: { ...form.salary, tds: v } })} />
                <div className="text-[10px] text-muted-foreground mt-1">Manual — TDS is annual-slab based. Compute outside and enter monthly amount here.</div>
              </Field>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.salary.pfApplicable} onChange={(e) => setForm({ ...form, salary: { ...form.salary, pfApplicable: e.target.checked } })} />
                PF applicable (12% of basic, capped at ₹15,000 basic)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.salary.esiApplicable} onChange={(e) => setForm({ ...form, salary: { ...form.salary, esiApplicable: e.target.checked } })} />
                ESI applicable (only if gross &lt; ₹21,000)
              </label>
            </div>
            <div className="text-sm border-t pt-2 flex justify-between">
              <span>Gross monthly (CTC excl. employer contrib.)</span>
              <span className="font-mono font-bold">{money(ctc)}</span>
            </div>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active employee (uncheck to exclude from payroll runs)
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add employee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================================================================
// Payslips tab
// =================================================================

function PayslipsTab() {
  const [period, setPeriod] = useState(defaultPeriod());
  const [list, setList] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<Payslip | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setList(await api.get<Payslip[]>(`/payroll/payslips?period=${period}`));
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    return list.reduce(
      (s, p) => ({
        gross: s.gross + p.earnings.gross,
        deductions: s.deductions + p.deductions.total,
        employerContribution: s.employerContribution + p.employerContribution.total,
        net: s.net + p.netSalary,
      }),
      { gross: 0, deductions: 0, employerContribution: 0, net: 0 },
    );
  }, [list]);

  const runPayroll = async () => {
    if (!confirm(`Run payroll for ${period}? This generates payslips for all active employees and posts to the ledger. Cannot be re-run for the same period.`)) return;
    setRunning(true);
    try {
      const res = await api.post<{ created: number; skipped: number }>(`/payroll/run/${period}`);
      toast.success(`Payroll run: ${res.created} payslips created${res.skipped ? `, ${res.skipped} already done` : ''}`);
      load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  const markPaid = async (p: Payslip) => {
    if (!confirm(`Mark ${p.employeeSnapshot.name}'s payslip ${p.payslipNumber} as paid? This posts a Cash/Bank → Salary Payable ledger entry.`)) return;
    try {
      await api.post(`/payroll/payslips/${p._id}/mark-paid`, { paymentMode: 'bank' });
      toast.success('Marked paid');
      load();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Payslips for {period}</CardTitle>
            <CardDescription>{list.length} payslips · {totals.net > 0 ? `${money(totals.net)} net payout` : 'No payslips yet'}</CardDescription>
          </div>
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <Label className="text-[10px] uppercase">Period</Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value || defaultPeriod())} className="h-9 w-40" />
            </div>
            <Button variant="outline" onClick={load} disabled={loading}><RefreshCcw className="w-4 h-4 mr-1" />{loading ? 'Loading…' : 'Refresh'}</Button>
            <Button onClick={runPayroll} disabled={running} className="bg-indigo-600 hover:bg-indigo-700">
              <Play className="w-4 h-4 mr-1" />{running ? 'Running…' : 'Run payroll'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {list.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3 bg-muted/30 rounded p-3">
            <Stat label="Gross paid" value={money(totals.gross)} />
            <Stat label="Deductions" value={money(totals.deductions)} />
            <Stat label="Net (in hand)" value={money(totals.net)} bold tone="emerald" />
            <Stat label="Employer contrib" value={money(totals.employerContribution)} hint="PF + ESI on top of gross" />
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Payslip</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Deductions</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground italic py-8">
                No payslips for {period}. Click <b>Run payroll</b> to generate them.
              </TableCell></TableRow>
            ) : list.map((p) => (
              <TableRow key={p._id}>
                <TableCell className="font-mono text-xs">{p.payslipNumber}</TableCell>
                <TableCell>
                  <div className="font-medium">{p.employeeSnapshot.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{p.employeeSnapshot.employeeCode}</div>
                </TableCell>
                <TableCell className="text-right text-xs">{p.paidDays}/{p.workDaysInMonth}{p.lopDays > 0 && <div className="text-[10px] text-amber-600">LOP {p.lopDays}</div>}</TableCell>
                <TableCell className="text-right font-mono">{money(p.earnings.gross)}</TableCell>
                <TableCell className="text-right font-mono text-red-600">−{money(p.deductions.total)}</TableCell>
                <TableCell className="text-right font-mono font-semibold text-emerald-700">{money(p.netSalary)}</TableCell>
                <TableCell>
                  <Badge variant={p.status === 'paid' ? 'secondary' : 'outline'} className="text-[10px]">
                    {p.status === 'paid' && <CheckCircle2 className="w-3 h-3 mr-0.5" />}
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setView(p)}><Eye className="w-4 h-4" /></Button>
                    {p.status !== 'paid' && (
                      <Button size="sm" variant="outline" onClick={() => markPaid(p)} className="text-xs">
                        Mark paid
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {view && <PayslipDialog payslip={view} onClose={() => setView(null)} />}
    </Card>
  );
}

function PayslipDialog({ payslip, onClose }: { payslip: Payslip; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Payslip — {payslip.employeeSnapshot.name}</DialogTitle>
          <CardDescription>{payslip.payslipNumber} · Period {payslip.period}</CardDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto" id="payslip-print">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Info label="Employee code" value={payslip.employeeSnapshot.employeeCode} mono />
            <Info label="Designation" value={payslip.employeeSnapshot.designation || '—'} />
            <Info label="PF UAN" value={payslip.employeeSnapshot.pfUan || '—'} mono />
            <Info label="ESI #" value={payslip.employeeSnapshot.esiNumber || '—'} mono />
            <Info label="Bank A/c" value={payslip.employeeSnapshot.bankAccount || '—'} mono />
            <Info label="IFSC" value={payslip.employeeSnapshot.bankIfsc || '—'} mono />
          </div>

          <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded p-3 text-sm">
            <Stat label="Days in month" value={String(payslip.workDaysInMonth)} />
            <Stat label="Paid days" value={String(payslip.paidDays)} bold />
            <Stat label="LOP" value={String(payslip.lopDays)} tone={payslip.lopDays > 0 ? 'amber' : undefined} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Earnings</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <ER label="Basic" v={payslip.earnings.basic} />
                    <ER label="HRA" v={payslip.earnings.hra} />
                    <ER label="Conveyance" v={payslip.earnings.conveyance} />
                    <ER label="Medical allowance" v={payslip.earnings.medicalAllowance} />
                    <ER label="Other allowances" v={payslip.earnings.otherAllowances} />
                    {payslip.earnings.overtime > 0 && <ER label="Overtime" v={payslip.earnings.overtime} />}
                    {payslip.earnings.bonus > 0 && <ER label="Bonus" v={payslip.earnings.bonus} />}
                    <TableRow className="font-bold border-t-2 border-foreground/20">
                      <TableCell>Gross</TableCell>
                      <TableCell className="text-right font-mono">{money(payslip.earnings.gross)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Deductions</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <ER label="PF (employee)" v={payslip.deductions.pfEmployee} />
                    {payslip.deductions.esiEmployee > 0 && <ER label="ESI (employee)" v={payslip.deductions.esiEmployee} />}
                    {payslip.deductions.professionalTax > 0 && <ER label="Professional Tax" v={payslip.deductions.professionalTax} />}
                    {payslip.deductions.tds > 0 && <ER label="TDS" v={payslip.deductions.tds} />}
                    {payslip.deductions.loanRecovery > 0 && <ER label="Loan recovery" v={payslip.deductions.loanRecovery} />}
                    {payslip.deductions.other > 0 && <ER label="Other" v={payslip.deductions.other} />}
                    <TableRow className="font-bold border-t-2 border-foreground/20">
                      <TableCell>Total deductions</TableCell>
                      <TableCell className="text-right font-mono text-red-600">−{money(payslip.deductions.total)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
            <CardContent className="p-4 flex items-center justify-between">
              <span className="font-semibold">Net pay (in hand)</span>
              <span className="text-2xl font-bold font-mono text-emerald-700">{money(payslip.netSalary)}</span>
            </CardContent>
          </Card>

          <div className="text-[11px] text-muted-foreground border-t pt-2">
            Employer-side contribution (over and above gross): PF Employer {money(payslip.employerContribution.pfEmployer)}, ESI Employer {money(payslip.employerContribution.esiEmployer)} — booked as Salary Expense in the ledger.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => window.print()}>Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================================================================
// Helpers
// =================================================================

function Field({ label, children, colSpan }: { label: string; children: React.ReactNode; colSpan?: number }) {
  const cls = colSpan === 2 ? 'col-span-2' : colSpan === 3 ? 'col-span-3' : '';
  return (
    <div className={`space-y-1 ${cls}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <Input type="number" min={0} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />;
}

function Stat({ label, value, bold, tone, hint }: { label: string; value: string; bold?: boolean; tone?: 'emerald' | 'amber'; hint?: string }) {
  const cls = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : '';
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`font-mono ${bold ? 'font-bold' : ''} ${cls}`}>{value}</div>
      {hint && <div className="text-[9px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border rounded p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={mono ? 'font-mono' : ''}>{value}</div>
    </div>
  );
}

function ER({ label, v }: { label: string; v: number }) {
  return (
    <TableRow>
      <TableCell className="text-sm">{label}</TableCell>
      <TableCell className="text-right font-mono text-sm">{money(v)}</TableCell>
    </TableRow>
  );
}
