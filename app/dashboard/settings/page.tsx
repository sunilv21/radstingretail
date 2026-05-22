'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Save,
  Upload,
  Trash2,
  MessageCircle,
  Send,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CircleDot,
  Webhook,
  Copy,
  RefreshCcw,
  Store,
  Image as ImageIcon,
  Receipt,
  SlidersHorizontal,
  FileText,
  Sparkles,
  HelpCircle,
  Phone,
  Mail,
  ExternalLink,
  Hourglass,
  ShieldOff,
  IndianRupee,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Settings as SettingsIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type {
  StoreInfo,
  StoreSettings,
  WhatsAppVerifiedProfile,
  WhatsAppTestLogEntry,
  WhatsAppWebhookStatus,
} from '@/lib/types';
import PlansShowcase from '@/components/PlansShowcase';
import SupportRequestsPanel from '@/components/SupportRequestsPanel';
import UserAddonRequest from '@/components/UserAddonRequest';
import BillingTab from '@/components/BillingTab';
import DocumentationTab from '@/components/DocumentationTab';

interface WhatsAppForm {
  enabled: boolean;
  /** Which provider sends the messages. */
  provider: 'meta' | 'twilio';
  // Meta Cloud API
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  apiVersion: string;
  // Twilio
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  twilioContentSid: string;
  // Shared
  defaultCountryCode: string;
  messageTemplate: string;
  templateLanguage: string;
  appSecret: string;
  verifyToken: string;
  webhookStatus?: WhatsAppWebhookStatus | null;
  configured?: boolean;
  webhookReady?: boolean;
  verifiedProfile?: WhatsAppVerifiedProfile | null;
  testLog?: WhatsAppTestLogEntry[];
}

interface FormState {
  name: string;
  code: string;
  gstNumber: string;
  /** Whether this branch is GST-registered. Drives invoice formatting and
   * GSTR-1 inclusion; unregistered branches issue bills of supply with no
   * tax components. */
  gstRegistered: boolean;
  stateCode: string;
  phone: string;
  email: string;
  invoicePrefix: string;
  logoUrl: string;
  upiId: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    pincode: string;
  };
  settings: StoreSettings;
  whatsapp: WhatsAppForm;
}

const EMPTY_SETTINGS: StoreSettings = {
  allowNegativeStock: false,
  defaultGSTMode: 'exclusive',
  printCopies: 1,
  enableLoyalty: false,
  loyaltyRate: 0,
  invoiceFooter: '',
  defaultLowStockThreshold: 5,
  defaultWarrantyMonths: 0,
  agingBuckets: [30, 60, 90],
  eWayBillThreshold: 50000,
  b2cLargeThreshold: 250000,
};

const EMPTY_WHATSAPP: WhatsAppForm = {
  enabled: false,
  provider: 'meta',
  phoneNumberId: '',
  businessAccountId: '',
  accessToken: '',
  apiVersion: 'v21.0',
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioFromNumber: '',
  twilioContentSid: '',
  defaultCountryCode: '91',
  messageTemplate: '',
  templateLanguage: 'en',
  appSecret: '',
  verifyToken: '',
};

const EMPTY: FormState = {
  name: '',
  code: '',
  gstNumber: '',
  gstRegistered: true,
  stateCode: '',
  phone: '',
  email: '',
  invoicePrefix: 'INV',
  logoUrl: '',
  upiId: '',
  address: { line1: '', line2: '', city: '', state: '', pincode: '' },
  settings: EMPTY_SETTINGS,
  whatsapp: EMPTY_WHATSAPP,
};

/** 15-char Indian GSTIN format check (lenient — accepts uppercase result of
 *  the user's typing, does not enforce the checksum digit). */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
function isValidGstin(gstin: string): boolean {
  return GSTIN_RE.test(gstin.trim().toUpperCase());
}

// Tab keys recognised by the deep-link `?tab=` query string. Anything
// else falls through to the default ("business").
const TAB_KEYS = [
  'business',
  'logo',
  'gst',
  'preferences',
  'whatsapp',
  'einvoice',
  'subscription',
  'billing',
  'help',
  'documentation',
] as const;
type TabKey = (typeof TAB_KEYS)[number];

/**
 * Per-tab metadata used by the landing grid and the breadcrumb. Grouped by
 * category so the landing page reads as four logical sections instead of a
 * flat list of ten cards.
 */
type TabGroup = 'store' | 'compliance' | 'comms' | 'billing' | 'support';
interface TabMeta {
  key: TabKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  group: TabGroup;
  tone: 'blue' | 'teal' | 'amber' | 'emerald' | 'rose' | 'violet' | 'slate' | 'orange';
}
const TAB_META: TabMeta[] = [
  {
    key: 'business',
    label: 'Store profile',
    description: 'Name, GSTIN, address, phone, invoice prefix.',
    icon: Store,
    group: 'store',
    tone: 'blue',
  },
  {
    key: 'logo',
    label: 'Logo',
    description: 'Upload the logo printed on every bill.',
    icon: ImageIcon,
    group: 'store',
    tone: 'teal',
  },
  {
    key: 'preferences',
    label: 'Preferences',
    description: 'Negative stock, default warranty, loyalty programme.',
    icon: SlidersHorizontal,
    group: 'store',
    tone: 'violet',
  },
  {
    key: 'gst',
    label: 'GST',
    description: 'Registration type, composition scheme, tax mode.',
    icon: Receipt,
    group: 'compliance',
    tone: 'rose',
  },
  {
    key: 'einvoice',
    label: 'E-Invoice',
    description: 'GSP credentials for IRN generation.',
    icon: FileText,
    group: 'compliance',
    tone: 'amber',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'Meta Cloud API setup for automatic bill delivery.',
    icon: MessageCircle,
    group: 'comms',
    tone: 'emerald',
  },
  {
    key: 'subscription',
    label: 'Subscription',
    description: 'Plan, renewal date, user count, request more users.',
    icon: Sparkles,
    group: 'billing',
    tone: 'violet',
  },
  {
    key: 'billing',
    label: 'Billing',
    description: 'Payment history and invoices from your vendor.',
    icon: Receipt,
    group: 'billing',
    tone: 'blue',
  },
  {
    key: 'help',
    label: 'Help & Support',
    description: 'Raise a ticket directly with your vendor.',
    icon: HelpCircle,
    group: 'support',
    tone: 'orange',
  },
  {
    key: 'documentation',
    label: 'Knowledge Base',
    description: 'Task-based user guides for every feature.',
    icon: FileText,
    group: 'support',
    tone: 'slate',
  },
];

const TAB_META_BY_KEY: Record<TabKey, TabMeta> = Object.fromEntries(
  TAB_META.map((t) => [t.key, t]),
) as Record<TabKey, TabMeta>;

const TAB_GROUPS: { id: TabGroup; label: string; description: string }[] = [
  { id: 'store', label: 'Store setup', description: 'How your store appears on every bill.' },
  { id: 'compliance', label: 'Tax & compliance', description: 'GST and e-invoice configuration.' },
  { id: 'comms', label: 'Customer communication', description: 'How bills reach your customers.' },
  { id: 'billing', label: 'Your subscription', description: 'Plan and payments with your vendor.' },
  { id: 'support', label: 'Help & guides', description: 'Get help or learn the app.' },
];

const TONE_RING_BY_TONE: Record<TabMeta['tone'], string> = {
  blue: 'ring-blue-200 bg-blue-50 text-blue-700',
  teal: 'ring-teal-200 bg-teal-50 text-teal-700',
  amber: 'ring-amber-200 bg-amber-50 text-amber-700',
  emerald: 'ring-emerald-200 bg-emerald-50 text-emerald-700',
  rose: 'ring-rose-200 bg-rose-50 text-rose-700',
  violet: 'ring-violet-200 bg-violet-50 text-violet-700',
  slate: 'ring-slate-200 bg-slate-50 text-slate-700',
  orange: 'ring-orange-200 bg-orange-50 text-orange-700',
};

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab') || '';
  /**
   * Active tab from the URL. `null` means the landing grid view — sub-pages
   * are entered by clicking a card (which updates the URL) and exited via
   * the breadcrumb. The URL is the source of truth so browser back/forward
   * navigates between landing and sub-pages naturally.
   */
  const validTab: TabKey | null = (TAB_KEYS as readonly string[]).includes(tabParam)
    ? (tabParam as TabKey)
    : null;
  const navigateTab = (next: TabKey | null) => {
    router.push(next ? `/dashboard/settings?tab=${next}` : '/dashboard/settings');
  };

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStore = async () => {
    try {
      const s = await api.get<StoreInfo>('/store/me');
      setForm({
        name: s.name || '',
        code: s.code || '',
        gstNumber: s.gstNumber || '',
        // Legacy stores without the field default to "registered" (matches
        // backend default) so existing tenants don't see their tax setup
        // disappear after this UI ships.
        gstRegistered: s.gstRegistered !== false,
        stateCode: s.stateCode || '',
        phone: s.phone || '',
        email: s.email || '',
        invoicePrefix: s.invoicePrefix || 'INV',
        upiId: s.upiId || '',
        logoUrl: s.logoUrl || '',
        address: {
          line1: s.address?.line1 || '',
          line2: s.address?.line2 || '',
          city: s.address?.city || '',
          state: s.address?.state || '',
          pincode: s.address?.pincode || '',
        },
        settings: {
          allowNegativeStock: !!s.settings?.allowNegativeStock,
          defaultGSTMode: s.settings?.defaultGSTMode || 'exclusive',
          printCopies: Number(s.settings?.printCopies ?? 1),
          enableLoyalty: !!s.settings?.enableLoyalty,
          loyaltyRate: Number(s.settings?.loyaltyRate ?? 0),
          invoiceFooter: s.settings?.invoiceFooter || '',
          defaultLowStockThreshold: Number(s.settings?.defaultLowStockThreshold ?? 5),
          defaultWarrantyMonths: Number(s.settings?.defaultWarrantyMonths ?? 0),
          agingBuckets: Array.isArray(s.settings?.agingBuckets) && s.settings.agingBuckets.length
            ? s.settings.agingBuckets : [30, 60, 90],
          eWayBillThreshold: Number(s.settings?.eWayBillThreshold ?? 50000),
          b2cLargeThreshold: Number(s.settings?.b2cLargeThreshold ?? 250000),
        },
        whatsapp: {
          enabled: !!s.whatsapp?.enabled,
          provider: s.whatsapp?.provider === 'twilio' ? 'twilio' : 'meta',
          phoneNumberId: s.whatsapp?.phoneNumberId || '',
          businessAccountId: s.whatsapp?.businessAccountId || '',
          accessToken: s.whatsapp?.accessToken || '',
          apiVersion: s.whatsapp?.apiVersion || 'v21.0',
          twilioAccountSid: s.whatsapp?.twilioAccountSid || '',
          twilioAuthToken: s.whatsapp?.twilioAuthToken || '',
          twilioFromNumber: s.whatsapp?.twilioFromNumber || '',
          twilioContentSid: s.whatsapp?.twilioContentSid || '',
          defaultCountryCode: s.whatsapp?.defaultCountryCode || '91',
          messageTemplate: s.whatsapp?.messageTemplate || '',
          templateLanguage: s.whatsapp?.templateLanguage || 'en',
          appSecret: s.whatsapp?.appSecret || '',
          verifyToken: s.whatsapp?.verifyToken || '',
          webhookStatus: s.whatsapp?.webhookStatus ?? null,
          configured: s.whatsapp?.configured,
          webhookReady: s.whatsapp?.webhookReady,
          verifiedProfile: s.whatsapp?.verifiedProfile ?? null,
          testLog: s.whatsapp?.testLog ?? [],
        },
      });
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    loadStore();
  }, []);

  const save = async () => {
    // Lightweight client-side validation. Server still re-checks, but
    // catching it here gives instant feedback and avoids a round-trip.
    if (!form.name.trim()) {
      toast.error('Store name is required');
      return;
    }
    if (form.gstRegistered) {
      const gstin = form.gstNumber.trim().toUpperCase();
      if (!gstin) {
        toast.error(
          'GSTIN is required for a registered branch — or switch to "Unregistered" on the GST tab.',
        );
        return;
      }
      if (!isValidGstin(gstin)) {
        toast.error(
          `"${gstin}" doesn't look like a valid GSTIN. Expected 15 chars (e.g. 07AAAAA0000A1Z5).`,
        );
        return;
      }
    }
    if (form.address.pincode && !/^\d{6}$/.test(form.address.pincode)) {
      toast.error('Pincode must be 6 digits');
      return;
    }
    setSaving(true);
    try {
      await api.put<StoreInfo>('/store/me', form);
      toast.success('Store details saved');
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onLogoFile = async (file: File) => {
    if (file.size > 512 * 1024) {
      toast.error('Logo must be under 512 KB — please resize first');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, logoUrl: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  // Landing view — shown when no tab is selected.
  if (!validTab) {
    return (
      <div className="space-y-5">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 sm:p-8">
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 w-32 h-32 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase text-blue-200 mb-2">
              <SettingsIcon className="w-3.5 h-3.5" />
              Settings
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
              Configure your store
            </h1>
            <p className="mt-2 text-[13.5px] text-slate-300 leading-relaxed max-w-2xl">
              Pick a section below to dive in. The breadcrumb at the top of every
              sub-page brings you straight back here.
            </p>
          </div>
        </div>

        {/* Category groups */}
        {TAB_GROUPS.map((g) => {
          const items = TAB_META.filter((t) => t.group === g.id);
          if (items.length === 0) return null;
          return (
            <section key={g.id}>
              <header className="mb-3">
                <h2 className="text-[15px] font-semibold text-foreground">{g.label}</h2>
                <p className="text-[12.5px] text-muted-foreground">{g.description}</p>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => navigateTab(t.key)}
                      className="group text-left rounded-xl border bg-card p-4 transition-all hover:shadow-sm hover:border-foreground/20"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`shrink-0 w-9 h-9 rounded-lg ring-1 ring-inset flex items-center justify-center ${TONE_RING_BY_TONE[t.tone]}`}
                        >
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[14px] font-semibold text-foreground group-hover:text-blue-600 transition-colors">
                            {t.label}
                          </h3>
                          <p className="mt-0.5 text-[12.5px] text-muted-foreground leading-relaxed">
                            {t.description}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-1.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  // Sub-page view — breadcrumb + the single selected tab's content.
  const activeMeta = TAB_META_BY_KEY[validTab];
  const ActiveIcon = activeMeta.icon;
  return (
    <div className="space-y-4">
      {/* Breadcrumb — Settings ▸ [Tab]. Clicking 'Settings' returns to the landing. */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground flex-wrap"
      >
        <button
          type="button"
          onClick={() => navigateTab(null)}
          className="inline-flex items-center gap-1.5 px-2 py-1 -ml-2 rounded hover:bg-muted hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <SettingsIcon className="w-3.5 h-3.5" />
          <span className="font-medium">Settings</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-foreground font-semibold">
          <ActiveIcon className="w-3.5 h-3.5" />
          {activeMeta.label}
        </span>
      </nav>

      {/* Sub-page header */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-xl font-bold leading-tight">{activeMeta.label}</h1>
        <p className="text-[12.5px] text-muted-foreground leading-tight">
          {activeMeta.description}
        </p>
      </div>

      <Tabs value={validTab} onValueChange={(v) => navigateTab(v as TabKey)}>
        <div className="min-w-0 space-y-4">

        <TabsContent value="business" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Store profile</CardTitle>
              <CardDescription>Appears on every printed invoice</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!loaded ? (
                <div className="text-center py-6 text-muted-foreground">Loading…</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Store name *</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Store code</Label>
                      <Input
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <Input
                        type="tel"
                        inputMode="tel"
                        value={form.phone}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            // Allow digits, leading + (country code), spaces and
                            // dashes; strips everything else so the printed
                            // bill never shows stray characters.
                            phone: e.target.value.replace(/[^0-9+\-\s]/g, ''),
                          })
                        }
                        placeholder="9876543210"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Address line 1</Label>
                      <Input
                        value={form.address.line1}
                        onChange={(e) =>
                          setForm({ ...form, address: { ...form.address, line1: e.target.value } })
                        }
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Address line 2</Label>
                      <Input
                        value={form.address.line2}
                        onChange={(e) =>
                          setForm({ ...form, address: { ...form.address, line2: e.target.value } })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">City</Label>
                      <Input
                        value={form.address.city}
                        onChange={(e) =>
                          setForm({ ...form, address: { ...form.address, city: e.target.value } })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">State</Label>
                      <Input
                        value={form.address.state}
                        onChange={(e) =>
                          setForm({ ...form, address: { ...form.address, state: e.target.value } })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Pincode</Label>
                      <Input
                        inputMode="numeric"
                        value={form.address.pincode}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            address: {
                              ...form.address,
                              pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                            },
                          })
                        }
                        maxLength={6}
                        placeholder="110001"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Invoice prefix</Label>
                      <Input
                        value={form.invoicePrefix}
                        onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
                        placeholder="INV"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">UPI ID (for payment links in reminders)</Label>
                      <Input
                        value={form.upiId}
                        onChange={(e) => setForm({ ...form, upiId: e.target.value.trim() })}
                        placeholder="store@hdfcbank · merchant@paytm · 9876543210@upi"
                      />
                      <div className="text-[10px] text-muted-foreground">
                        Used by Collections to embed one-tap UPI payment links in reminder
                        messages. Customer taps the link, their UPI app opens with payee + amount
                        pre-filled.
                      </div>
                    </div>
                  </div>
                  <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                    <Save className="w-4 h-4 mr-1" />
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Store logo on bills</CardTitle>
              <CardDescription>
                Upload an image (PNG/JPEG, under 512 KB) or paste a URL. This logo prints at
                the top of every invoice — it does <strong>not</strong> affect the Radsting
                branding inside the app.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-6">
                <div className="w-40 h-40 rounded border bg-white flex items-center justify-center overflow-hidden">
                  {form.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logoUrl} alt="Store logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">No logo set</span>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Logo URL or data-URL</Label>
                    <Input
                      value={form.logoUrl}
                      onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                      placeholder="https://… or data:image/png;base64,…"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onLogoFile(f);
                      }}
                    />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="w-4 h-4 mr-1" /> Upload from computer
                    </Button>
                    {form.logoUrl && (
                      <Button variant="ghost" onClick={() => setForm({ ...form, logoUrl: '' })}>
                        <Trash2 className="w-4 h-4 mr-1 text-red-500" /> Remove
                      </Button>
                    )}
                  </div>
                  <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                    <Save className="w-4 h-4 mr-1" />
                    {saving ? 'Saving…' : 'Save logo'}
                  </Button>
                </div>
              </div>

              <div className="bg-muted p-3 rounded text-xs flex items-start gap-2">
                <Image src="/Radsting.svg" alt="Radsting" width={24} height={24} />
                <div>
                  <b>Heads up:</b> The Radsting logo stays in the sidebar, login and browser
                  tab (that&apos;s the software brand). Your store logo above is what appears
                  on printed bills.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gst" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>GST configuration</CardTitle>
              <CardDescription>
                GSTIN + state code drive the CGST/SGST vs IGST split per §8.3 of the
                architecture. Unregistered branches issue bills of supply with no tax
                components.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Registration toggle — the most consequential GST setting on
                  this page. Flipping it to Unregistered clears the GSTIN
                  on save and stops the branch from feeding GSTR-1. */}
              <div className="space-y-1">
                <Label className="text-xs">GST registration</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, gstRegistered: true })}
                    aria-pressed={form.gstRegistered}
                    className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      form.gstRegistered
                        ? 'bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-200'
                        : 'bg-background border-input text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" /> Registered
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, gstRegistered: false, gstNumber: '' })}
                    aria-pressed={!form.gstRegistered}
                    className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                      !form.gstRegistered
                        ? 'bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200'
                        : 'bg-background border-input text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <ShieldOff className="w-4 h-4" /> Unregistered
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">
                    GSTIN {form.gstRegistered ? '*' : '(disabled — branch is unregistered)'}
                  </Label>
                  <Input
                    value={form.gstNumber}
                    onChange={(e) =>
                      setForm({ ...form, gstNumber: e.target.value.toUpperCase() })
                    }
                    placeholder={form.gstRegistered ? '07AAAAA0000A1Z5' : ''}
                    maxLength={15}
                    disabled={!form.gstRegistered}
                  />
                  {form.gstRegistered && form.gstNumber && !isValidGstin(form.gstNumber) && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400">
                      Doesn&apos;t match the 15-char GSTIN pattern. Expected:
                      2-digit state · 10-char PAN · 1 entity · Z · 1 checksum.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">State code</Label>
                  <Input
                    value={form.stateCode}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        stateCode: e.target.value.replace(/\D/g, '').slice(0, 2),
                      })
                    }
                    placeholder="07"
                    maxLength={2}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    First two digits of the branch&apos;s GSTIN (e.g. 07 = Delhi, 24 = Gujarat).
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-900">
                <p className="text-sm text-blue-900 dark:text-blue-200">
                  {form.gstRegistered
                    ? 'GST rates are set per-product in Inventory, not store-wide — the system calculates CGST/SGST (intra-state) or IGST (inter-state) automatically.'
                    : 'Sales from this branch will not carry CGST/SGST/IGST and will be excluded from GSTR-1 / GSTR-3B. Suitable for composition-scheme dealers or pre-registration branches.'}
                </p>
              </div>

              <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving…' : 'Save GST settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-4">
          <PreferencesTab
            form={form}
            setForm={setForm}
            save={save}
            saving={saving}
            loaded={loaded}
          />
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-4">
          <WhatsappTab
            whatsapp={form.whatsapp}
            onChange={(w) => setForm({ ...form, whatsapp: w })}
            onSave={save}
            saving={saving}
            onReload={loadStore}
          />
        </TabsContent>

        <TabsContent value="einvoice" className="space-y-4">
          <EInvoiceTab onSaved={loadStore} />
        </TabsContent>

        <TabsContent value="subscription" className="space-y-4">
          <SubscriptionTab />
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <BillingTab />
        </TabsContent>

        <TabsContent value="help" className="space-y-4">
          <HelpTab />
        </TabsContent>

        <TabsContent value="documentation" className="space-y-4">
          <DocumentationTab />
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

interface WhatsAppStatus {
  tone: 'gray' | 'amber' | 'blue' | 'green' | 'red';
  label: string;
  detail: string;
}

function deriveStatus(whatsapp: WhatsAppForm): WhatsAppStatus {
  const isTwilio = whatsapp.provider === 'twilio';
  const providerName = isTwilio ? 'Twilio' : 'Meta';
  if (!whatsapp.enabled) {
    return {
      tone: 'gray',
      label: 'Off',
      detail: 'Bills fall back to wa.me (one-tap manual send).',
    };
  }
  if (!whatsapp.configured) {
    return {
      tone: 'amber',
      label: 'Missing credentials',
      detail: isTwilio
        ? 'Add Account SID, Auth Token and From Number, then save.'
        : 'Add Phone Number ID + Permanent Access Token, then save.',
    };
  }
  const lastTest = whatsapp.testLog?.[0];
  if (lastTest?.status === 'failed') {
    return {
      tone: 'red',
      label: 'Last test failed',
      detail:
        lastTest.error ||
        (isTwilio
          ? 'Recheck the Account SID, Auth Token and From Number.'
          : 'Recheck the token and Phone Number ID.'),
    };
  }
  if (!whatsapp.verifiedProfile) {
    return {
      tone: 'blue',
      label: 'Saved — verify to confirm',
      detail: `Click "Verify with ${providerName}" to read the live account profile.`,
    };
  }
  return {
    tone: 'green',
    label: 'Connected',
    detail: whatsapp.verifiedProfile.verifiedName
      ? `Live on ${providerName} as "${whatsapp.verifiedProfile.verifiedName}".`
      : 'Credentials live — ready to send bills automatically.',
  };
}

function StatusBadge({ status }: { status: WhatsAppStatus }) {
  const tones: Record<
    WhatsAppStatus['tone'],
    { wrap: string; dot: string; icon: React.ReactNode }
  > = {
    gray: {
      wrap: 'border-muted-foreground/30 bg-muted text-muted-foreground',
      dot: 'bg-muted-foreground',
      icon: <CircleDot className="w-4 h-4" />,
    },
    amber: {
      wrap: 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
      dot: 'bg-amber-500',
      icon: <AlertCircle className="w-4 h-4" />,
    },
    blue: {
      wrap: 'border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
      dot: 'bg-blue-500',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
    green: {
      wrap: 'border-green-300 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300',
      dot: 'bg-green-500',
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
    red: {
      wrap: 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300',
      dot: 'bg-red-500',
      icon: <XCircle className="w-4 h-4" />,
    },
  };
  const t = tones[status.tone];
  return (
    <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium ${t.wrap}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
      {t.icon}
      {status.label}
    </div>
  );
}

function qualityTone(rating: string | null | undefined): 'green' | 'amber' | 'red' | 'gray' {
  const r = (rating || '').toUpperCase();
  if (r === 'GREEN') return 'green';
  if (r === 'YELLOW') return 'amber';
  if (r === 'RED') return 'red';
  return 'gray';
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleString('en-IN');
}

function WhatsappTab({
  whatsapp,
  onChange,
  onSave,
  saving,
  onReload,
}: {
  whatsapp: WhatsAppForm;
  onChange: (w: WhatsAppForm) => void;
  onSave: () => Promise<void> | void;
  saving: boolean;
  onReload: () => Promise<void> | void;
}) {
  const [showToken, setShowToken] = useState(false);
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const provider = whatsapp.provider || 'meta';
  const isTwilio = provider === 'twilio';
  const providerLabel = isTwilio ? 'Twilio' : 'Meta';
  const tokenIsMasked = whatsapp.accessToken.startsWith('••');
  const twilioTokenIsMasked = whatsapp.twilioAuthToken.startsWith('••');
  const status = deriveStatus(whatsapp);
  const profile = whatsapp.verifiedProfile || null;
  const qTone = qualityTone(profile?.qualityRating);
  const qToneClass: Record<string, string> = {
    green: 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300',
    gray: 'bg-muted text-muted-foreground',
  };

  const countryCode = (whatsapp.defaultCountryCode || '91').replace(/\D/g, '') || '91';
  const digitsOnly = testPhone.replace(/\D/g, '');
  // If the user only types a local-length number, prepend the configured code.
  // If they already included a country code (12+ digits), send as-is.
  const composedTestTo = digitsOnly.length === 10 ? countryCode + digitsOnly : digitsOnly;

  const runTest = async () => {
    if (!digitsOnly) {
      toast.error('Enter a phone number to test-send to');
      return;
    }
    setTesting(true);
    try {
      const res = await api.post<{ messageId?: string; whatsappPhone?: string }>(
        '/store/whatsapp/test',
        { to: composedTestTo },
      );
      toast.success(
        `Test sent to +${res.whatsappPhone || composedTestTo}${res.messageId ? ` (msg ${res.messageId.slice(-8)})` : ''}`,
      );
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setTesting(false);
      await onReload();
    }
  };

  const runVerify = async () => {
    setVerifying(true);
    try {
      await api.post('/store/whatsapp/verify');
      toast.success(`Credentials verified with ${providerLabel}`);
    } catch (err) {
      if (err instanceof ApiError) toast.error(`Verify failed — ${err.message}`);
      else toast.error('Verify failed');
    } finally {
      setVerifying(false);
      await onReload();
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── HERO ─────────────────────────────────────────────────────
          The one-glance state. Provider name, status, and the two
          primary actions (enable toggle + verify). Subtle gradient
          accent runs across the top so the card has presence without
          being noisy. */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-900">
        <div
          className={`h-1.5 w-full ${
            status.tone === 'green'
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              : status.tone === 'amber'
                ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                : status.tone === 'red'
                  ? 'bg-gradient-to-r from-rose-500 to-rose-400'
                  : status.tone === 'blue'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                    : 'bg-gradient-to-r from-slate-300 to-slate-200'
          }`}
        />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 min-w-0">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {providerLabel} · WhatsApp delivery
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  Send invoices straight to your customers
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
                  {status.detail}
                </p>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                checked={whatsapp.enabled}
                onChange={(e) => onChange({ ...whatsapp, enabled: e.target.checked })}
              />
              <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                Automatic sending
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {whatsapp.enabled
                  ? 'On — bills are pushed via your provider.'
                  : 'Off — bills fall back to manual wa.me.'}
              </span>
            </label>
            <div className="flex-1" />
            <Button
              onClick={runVerify}
              disabled={verifying || !whatsapp.configured}
              variant="outline"
              size="sm"
              title={whatsapp.configured ? `Verify credentials with ${providerLabel}` : 'Save credentials first'}
            >
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              {verifying ? 'Verifying…' : `Verify with ${providerLabel}`}
            </Button>
          </div>
        </div>

        {/* Verified profile inline — only when we have one. Strong panel
            with proper labels so the operator can confirm at a glance
            which account they're connected to. */}
        {profile && (
          <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 px-6 py-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Verified with {providerLabel}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {formatRelative(profile.verifiedAt)}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <ProfileField label="Business name" value={profile.verifiedName} />
              <ProfileField label="Display number" value={profile.displayPhoneNumber} mono />
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
                  Quality rating
                </div>
                <Badge className={`${qToneClass[qTone]} border-transparent mt-1`} variant="outline">
                  {profile.qualityRating || 'UNKNOWN'}
                </Badge>
              </div>
              <ProfileField
                label="Verification"
                value={profile.codeVerificationStatus || profile.nameStatus}
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── STEP 01 — PROVIDER ─────────────────────────────────── */}
      <StepHeader
        num="01"
        title="Choose your provider"
        description="Pick who delivers your messages. You can switch later — credentials for the other provider stay saved."
        tone="emerald"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProviderTile
          active={provider === 'meta'}
          title="Meta WhatsApp Cloud API"
          tagline="Official, direct from Meta"
          bullets={[
            '1,000 free conversations / month',
            'Lowest latency at scale',
            'Templates via Meta Business Suite',
          ]}
          onSelect={() => onChange({ ...whatsapp, provider: 'meta' })}
          tone="emerald"
          monogram="M"
        />
        <ProviderTile
          active={provider === 'twilio'}
          title="Twilio"
          tagline="Multi-channel, simpler onboarding"
          bullets={[
            'Sandbox number ready in minutes',
            'Unified billing across SMS / WhatsApp',
            'Content Templates (HX… SIDs)',
          ]}
          onSelect={() => onChange({ ...whatsapp, provider: 'twilio' })}
          tone="rose"
          monogram="T"
        />
      </div>

      {/* ─── STEP 02 — CREDENTIALS ───────────────────────────────── */}
      <StepHeader
        num="02"
        title={`Connect your ${providerLabel} account`}
        description={
          isTwilio
            ? 'From Twilio Console → Account → API keys & tokens. Paste the values below and save.'
            : 'From Meta Business Suite → WhatsApp → API Setup. Paste the values below and save.'
        }
        tone={isTwilio ? 'rose' : 'emerald'}
        chip={
          whatsapp.configured
            ? { label: 'Saved', icon: <CheckCircle2 className="w-3 h-3" />, tone: 'emerald' }
            : { label: 'Not configured', icon: <AlertCircle className="w-3 h-3" />, tone: 'amber' }
        }
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 space-y-5">
        {isTwilio ? (
          /* ── Twilio fields ───────────────────────────────────── */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FieldShell label="Account SID" required help="Twilio Console → Account → API keys & tokens → “Account SID”">
              <Input
                value={whatsapp.twilioAccountSid}
                onChange={(e) => onChange({ ...whatsapp, twilioAccountSid: e.target.value.trim() })}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="font-mono text-xs"
              />
            </FieldShell>
            <FieldShell label="From Number" required help="Use +14155238886 for the Twilio sandbox, or your approved business number.">
              <Input
                value={whatsapp.twilioFromNumber}
                onChange={(e) => onChange({ ...whatsapp, twilioFromNumber: e.target.value.trim() })}
                placeholder="+14155238886"
              />
            </FieldShell>
            <FieldShell
              label="Auth Token"
              required
              span={2}
              help="Stored server-side. Only the last 4 characters are ever returned to the browser."
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showTwilioToken ? 'text' : 'password'}
                    value={whatsapp.twilioAuthToken}
                    onChange={(e) => onChange({ ...whatsapp, twilioAuthToken: e.target.value })}
                    placeholder={twilioTokenIsMasked ? '(saved — paste a new token to replace)' : '32-char Twilio auth token'}
                    className="pr-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTwilioToken((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                    aria-label={showTwilioToken ? 'Hide auth token' : 'Show auth token'}
                  >
                    {showTwilioToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {twilioTokenIsMasked && (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => onChange({ ...whatsapp, twilioAuthToken: '' })}
                    title="Clear and replace the saved token"
                  >
                    Replace
                  </Button>
                )}
              </div>
            </FieldShell>
            <FieldShell
              label="Content SID"
              span={2}
              help="Twilio Content SID for your approved invoice template. Required only for template sends (e.g. first contact outside the 24-hour service window)."
            >
              <Input
                value={whatsapp.twilioContentSid}
                onChange={(e) => onChange({ ...whatsapp, twilioContentSid: e.target.value.trim() })}
                placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="font-mono text-xs"
              />
            </FieldShell>
          </div>
        ) : (
          /* ── Meta fields ─────────────────────────────────────── */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FieldShell label="Phone Number ID" required help="Meta Business Suite → WhatsApp → API Setup → “Phone number ID”">
              <Input
                value={whatsapp.phoneNumberId}
                onChange={(e) => onChange({ ...whatsapp, phoneNumberId: e.target.value.trim() })}
                placeholder="e.g. 123456789012345"
              />
            </FieldShell>
            <FieldShell label="WhatsApp Business Account ID" help="Optional. Useful for multi-phone accounts; not required to send.">
              <Input
                value={whatsapp.businessAccountId}
                onChange={(e) => onChange({ ...whatsapp, businessAccountId: e.target.value.trim() })}
                placeholder="optional"
              />
            </FieldShell>
            <FieldShell
              label="Permanent Access Token"
              required
              span={2}
              help="Use a system-user permanent token in production — temporary tokens expire after 24 hours. Stored server-side; only the last 4 characters are ever returned to the browser."
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={whatsapp.accessToken}
                    onChange={(e) => onChange({ ...whatsapp, accessToken: e.target.value })}
                    placeholder={tokenIsMasked ? '(saved — paste a new token to replace)' : 'EAAG…'}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                    aria-label={showToken ? 'Hide access token' : 'Show access token'}
                    title={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {tokenIsMasked && (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => onChange({ ...whatsapp, accessToken: '' })}
                    title="Clear and replace the saved token"
                  >
                    Replace
                  </Button>
                )}
              </div>
            </FieldShell>
            <FieldShell label="Graph API version" help="The Meta Graph API version your account uses.">
              <Input
                value={whatsapp.apiVersion}
                onChange={(e) => onChange({ ...whatsapp, apiVersion: e.target.value.trim() })}
                placeholder="v21.0"
              />
            </FieldShell>
          </div>
        )}

        <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
          <Button
            onClick={async () => {
              await onSave();
              await onReload();
            }}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Save className="w-4 h-4 mr-1.5" />
            {saving ? 'Saving…' : `Save ${providerLabel} credentials`}
          </Button>
        </div>
      </div>

      {/* ─── STEP 03 — PREFERENCES ───────────────────────────────── */}
      <StepHeader
        num="03"
        title="Send preferences"
        description="Applied to every WhatsApp send, regardless of provider."
        tone="blue"
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FieldShell
            label="Default customer country code"
            help="Prepended to 10-digit customer numbers at send time."
          >
            <div className="flex">
              <span className="inline-flex items-center px-3 border border-r-0 rounded-l-md bg-slate-100 dark:bg-slate-800 text-sm font-mono text-slate-600 dark:text-slate-300 select-none">
                +
              </span>
              <Input
                value={whatsapp.defaultCountryCode}
                onChange={(e) =>
                  onChange({ ...whatsapp, defaultCountryCode: e.target.value.replace(/\D/g, '') })
                }
                placeholder="91"
                maxLength={3}
                className="rounded-l-none"
              />
            </div>
          </FieldShell>
          {!isTwilio && (
            <FieldShell label="Meta template language" help="ISO language code of your approved template, e.g. en, hi, es.">
              <Input
                value={whatsapp.templateLanguage}
                onChange={(e) => onChange({ ...whatsapp, templateLanguage: e.target.value.trim() })}
                placeholder="en"
              />
            </FieldShell>
          )}
          <FieldShell
            label={isTwilio ? 'Plain-text body fallback' : 'Meta template name'}
            span={2}
            help={
              isTwilio
                ? 'Template sends use the Content SID above. Plain-text uses the auto-built invoice body unless you override it here.'
                : 'Pre-approved in Meta Business Suite. The 4 body params sent (in order) are: customer name, invoice number, amount, bill URL.'
            }
          >
            <Input
              value={whatsapp.messageTemplate}
              onChange={(e) => onChange({ ...whatsapp, messageTemplate: e.target.value.trim() })}
              placeholder={isTwilio ? '(uses the auto-generated message)' : 'invoice_sent'}
            />
          </FieldShell>
        </div>
      </div>

      {/* ─── STEP 04 — TEST ───────────────────────────────────────── */}
      <StepHeader
        num="04"
        title="Test the connection"
        description="Send a plain-text test to any WhatsApp number. Every attempt is logged so you can see exactly what the provider returned."
        tone="violet"
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <div className="flex flex-1 min-w-60">
            <span
              className="inline-flex items-center px-3 border border-r-0 rounded-l-md bg-slate-100 dark:bg-slate-800 text-sm font-mono text-slate-700 dark:text-slate-200 select-none"
              title={`Country code from settings (Default customer country code = ${countryCode})`}
            >
              +{countryCode}
            </span>
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="9876543210"
              inputMode="numeric"
              maxLength={15}
              className="rounded-l-none flex-1"
            />
          </div>
          <Button
            onClick={runTest}
            disabled={testing || !whatsapp.enabled}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Send className="w-4 h-4 mr-1.5" />
            {testing ? 'Sending…' : 'Send test message'}
          </Button>
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-400">
          {digitsOnly.length >= 10 ? (
            <>
              Will dial <span className="font-mono font-medium text-slate-900 dark:text-slate-100">+{composedTestTo}</span>
              {digitsOnly.length === 10 && (
                <> — country code <span className="font-mono">+{countryCode}</span> auto-added from settings.</>
              )}
            </>
          ) : (
            'Enter a 10-digit number; the country code above is applied automatically.'
          )}
        </div>
        {!whatsapp.enabled && (
          <div className="text-xs text-amber-700 dark:text-amber-400 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 inline-flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Enable automatic sending above and save before testing.
          </div>
        )}

        <TestSendLog entries={whatsapp.testLog || []} />
      </div>

      {/* ─── STEP 05 — WEBHOOK (Meta only) ───────────────────────── */}
      {!isTwilio && (
        <>
          <StepHeader
            num="05"
            title="Delivery webhook"
            description="Optional. Pushes delivery / read / failed status from Meta back into the app — visible per sale and on the test-send log above."
            tone="amber"
            label="Advanced"
          />
          <WebhookCard
            whatsapp={whatsapp}
            onChange={onChange}
            onSave={onSave}
            onReload={onReload}
            saving={saving}
          />
        </>
      )}

      {/* ─── Quick reference ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-700 p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
          {providerLabel} quick reference
        </div>
        <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1.5 list-disc list-inside marker:text-slate-400">
          {isTwilio ? (
            <>
              <li>Sandbox: customers join by texting your join code to <span className="font-mono text-slate-900 dark:text-slate-100">+14155238886</span>. Production: use your purchased + approved business number.</li>
              <li>From-Number is stored without the <span className="font-mono">whatsapp:</span> prefix — the server prepends it at send time.</li>
              <li>Templates use the <span className="font-mono">HX…</span> Content SID. Body variables map in order: customer name, invoice number, amount, bill URL.</li>
              <li>Delivery status callbacks are configured in Twilio Console, not here.</li>
            </>
          ) : (
            <>
              <li>Free tier: 1,000 business-initiated conversations / month.</li>
              <li>Sends always originate from the Phone Number ID above — not your store&apos;s display phone.</li>
              <li>For messages outside the 24-hour customer-service window, Meta requires a pre-approved template — fill in the template name above.</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}

/**
 * Numbered step header — gives the WhatsApp tab a guided-setup feel.
 * "01 · Choose your provider" with a small coloured icon tile and an
 * optional right-aligned chip (e.g. "Saved" / "Not configured").
 */
function StepHeader({
  num,
  title,
  description,
  tone,
  chip,
  label,
}: {
  num: string;
  title: string;
  description?: string;
  tone: 'emerald' | 'rose' | 'blue' | 'violet' | 'amber';
  chip?: { label: string; icon: React.ReactNode; tone: 'emerald' | 'amber' | 'rose' };
  label?: string;
}) {
  const toneTile: Record<typeof tone, string> = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  };
  const chipTone: Record<NonNullable<typeof chip>['tone'], string> = {
    emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    rose: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  };
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap pt-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${toneTile[tone]}`}>
          {num}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base text-slate-900 dark:text-slate-100 leading-tight">
              {title}
            </h3>
            {label && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded">
                {label}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {chip && (
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${chipTone[chip.tone]}`}>
          {chip.icon}
          {chip.label}
        </span>
      )}
    </div>
  );
}

/**
 * Form field shell with a strong label, optional required marker, optional
 * column span, and readable help text below. Used everywhere in the
 * WhatsApp tab to keep typography consistent.
 */
function FieldShell({
  label,
  required,
  help,
  span,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  span?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${span === 2 ? 'md:col-span-2' : ''}`}>
      <Label className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {label}
        {required && <span className="text-rose-600 ml-0.5">*</span>}
      </Label>
      {children}
      {help && <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{help}</p>}
    </div>
  );
}

/** Small read-only "verified profile" cell with label + value. */
function ProfileField({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
        {label}
      </div>
      <div className={`text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5 ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </div>
    </div>
  );
}

/**
 * Provider chooser tile. Clickable card with a brand-coloured monogram on
 * the left, name + tagline, and value-prop bullets. Active state gets a
 * filled border + gradient background + "Active" pill so the choice is
 * unmissable; inactive tiles stay clean white with hover lift.
 */
function ProviderTile({
  active,
  title,
  tagline,
  bullets,
  onSelect,
  tone,
  monogram,
}: {
  active: boolean;
  title: string;
  tagline: string;
  bullets: string[];
  onSelect: () => void;
  tone: 'emerald' | 'rose';
  monogram: string;
}) {
  const monogramClass =
    tone === 'emerald'
      ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white'
      : 'bg-gradient-to-br from-rose-500 to-rose-600 text-white';
  const activeBorder =
    tone === 'emerald'
      ? 'border-emerald-500 ring-1 ring-emerald-500 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-900'
      : 'border-rose-500 ring-1 ring-rose-500 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/30 dark:to-slate-900';
  const idleBorder =
    'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900';
  const pillClass =
    tone === 'emerald'
      ? 'bg-emerald-600 text-white'
      : 'bg-rose-600 text-white';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-2xl border p-5 transition-all duration-150 ${active ? activeBorder : idleBorder}`}
    >
      <div className="flex items-start gap-4">
        <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm ${monogramClass}`}>
          {monogram}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 leading-tight">
              {title}
            </div>
            {active && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${pillClass}`}>
                <CheckCircle2 className="w-3 h-3" />
                Active
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{tagline}</div>
          <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 mt-3">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${tone === 'emerald' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                />
                <span className="leading-snug">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </button>
  );
}

function TestSendLog({ entries }: { entries: WhatsAppTestLogEntry[] }) {
  if (!entries.length) {
    return (
      <div className="text-[11px] text-muted-foreground italic border rounded-md p-3 bg-muted/30">
        No test sends yet. The last 10 attempts will appear here.
      </div>
    );
  }
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="grid grid-cols-[100px_1fr_120px_1fr] gap-2 bg-muted px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
        <div>Status</div>
        <div>To</div>
        <div>When</div>
        <div>Detail</div>
      </div>
      {entries.map((e, i) => (
        <div
          key={`${e.sentAt}-${i}`}
          className="grid grid-cols-[100px_1fr_120px_1fr] gap-2 px-3 py-2 text-xs border-t items-center"
        >
          <div>
            {e.status === 'ok' ? (
              <Badge className="bg-green-100 text-green-800 border-transparent dark:bg-green-950/30 dark:text-green-300" variant="outline">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Sent
              </Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800 border-transparent dark:bg-red-950/30 dark:text-red-300" variant="outline">
                <XCircle className="w-3 h-3 mr-1" />
                Failed
              </Badge>
            )}
          </div>
          <div className="font-mono">{e.whatsappPhone || e.to || '—'}</div>
          <div className="text-muted-foreground" title={e.sentAt}>
            {formatRelative(e.sentAt)}
          </div>
          <div className="truncate" title={e.status === 'ok' ? e.messageId || '' : e.error || ''}>
            {e.status === 'ok' ? (
              <span className="text-muted-foreground font-mono text-[11px]">
                {e.messageId ? `msg …${e.messageId.slice(-10)}` : 'sent'}
              </span>
            ) : (
              <span className="text-red-700 dark:text-red-400">
                {e.errorCode ? `${e.errorCode}: ` : ''}
                {e.error || 'Error'}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function WebhookCard({
  whatsapp,
  onChange,
  onSave,
  onReload,
  saving,
}: {
  whatsapp: WhatsAppForm;
  onChange: (w: WhatsAppForm) => void;
  onSave: () => Promise<void> | void;
  onReload: () => Promise<void> | void;
  saving: boolean;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const secretIsMasked = whatsapp.appSecret.startsWith('••');

  // Build the webhook URL the merchant pastes into Meta. We can't know the
  // public URL of the API server (could be localhost in dev, ngrok URL, or a
  // real domain in prod), so we let the merchant enter the base.
  const [publicBase, setPublicBase] = useState<string>('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('webhookPublicBase');
    if (saved) setPublicBase(saved);
  }, []);
  const persistBase = (v: string) => {
    setPublicBase(v);
    if (typeof window !== 'undefined') localStorage.setItem('webhookPublicBase', v);
  };
  const webhookPath = '/api/webhooks/whatsapp';
  const fullWebhookUrl = publicBase
    ? `${publicBase.replace(/\/+$/, '')}${webhookPath}`
    : `<your-public-https-url>${webhookPath}`;

  const generateVerifyToken = () => {
    const bytes = new Uint8Array(24);
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const tok = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    onChange({ ...whatsapp, verifyToken: tok });
    toast.success('New verify token generated. Save, then paste it into Meta.');
  };

  const copy = async (text: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const status = whatsapp.webhookStatus;
  const ready = !!whatsapp.webhookReady;
  const lastEventAgo = status?.lastEventAt ? formatRelative(status.lastEventAt) : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="w-5 h-5 text-purple-600" />
              Webhook (delivery + read receipts)
            </CardTitle>
            <CardDescription>
              Optional. When configured, Meta pushes delivery / read / failed status updates
              for every WhatsApp message you send — visible per sale and on the test-send log.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {ready ? (
              <Badge className="bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950/30 dark:text-emerald-300" variant="outline">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <CircleDot className="w-3 h-3 mr-1" /> Not configured
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 1: ngrok / public URL */}
        <div className="space-y-2 rounded border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Step 1 · Public HTTPS URL
          </div>
          <div className="text-[11px] text-muted-foreground">
            Meta cannot reach <span className="font-mono">localhost</span>. For local dev, run{' '}
            <span className="font-mono bg-background border rounded px-1">npm run dev:tunnel</span>{' '}
            (uses ngrok, already wired) and paste the <span className="font-mono">https://…ngrok.app</span> URL below.
            For production, paste your real API origin.
          </div>
          <Input
            placeholder="https://your-tunnel.ngrok.app  or  https://api.example.com"
            value={publicBase}
            onChange={(e) => persistBase(e.target.value)}
          />
        </div>

        {/* Step 2: webhook URL display */}
        <div className="space-y-2 rounded border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Step 2 · Webhook URL (paste into Meta)
          </div>
          <div className="flex gap-2">
            <Input value={fullWebhookUrl} readOnly className="font-mono text-xs" />
            <Button
              variant="outline"
              type="button"
              onClick={() => copy(fullWebhookUrl, 'Webhook URL copied')}
              disabled={!publicBase}
              title="Copy URL to clipboard"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="text-[11px] text-muted-foreground">
            In Meta Business Suite → WhatsApp → Configuration → Webhooks → <b>Edit Callback URL</b>,
            paste this URL.
          </div>
        </div>

        {/* Step 3: verify token */}
        <div className="space-y-2 rounded border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Step 3 · Verify Token (paste same value here and in Meta)
          </div>
          <div className="flex gap-2">
            <Input
              value={whatsapp.verifyToken}
              onChange={(e) => onChange({ ...whatsapp, verifyToken: e.target.value.trim() })}
              placeholder="Random string — at least 16 chars"
              className="font-mono text-xs"
            />
            <Button variant="outline" type="button" onClick={generateVerifyToken} title="Generate a strong random token">
              <RefreshCcw className="w-4 h-4 mr-1" /> Generate
            </Button>
            {whatsapp.verifyToken && (
              <Button
                variant="outline"
                type="button"
                onClick={() => copy(whatsapp.verifyToken, 'Verify token copied')}
                title="Copy token"
              >
                <Copy className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Meta uses this to confirm <i>you</i> own the URL during the subscribe handshake.
            You enter the same string here and in Meta&apos;s &quot;Verify Token&quot; field.
            Then click <b>Verify and Save</b> in Meta — the server auto-responds with the
            challenge.
          </div>
        </div>

        {/* Step 4: app secret */}
        <div className="space-y-2 rounded border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Step 4 · App Secret (for HMAC signature verification)
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showSecret ? 'text' : 'password'}
                value={whatsapp.appSecret}
                onChange={(e) => onChange({ ...whatsapp, appSecret: e.target.value })}
                placeholder={secretIsMasked ? '(saved — paste a new secret to replace)' : 'From Meta App Dashboard → Basic'}
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showSecret ? 'Hide app secret' : 'Show app secret'}
                title={showSecret ? 'Hide app secret' : 'Show app secret'}
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {secretIsMasked && (
              <Button
                variant="outline"
                type="button"
                onClick={() => onChange({ ...whatsapp, appSecret: '' })}
                title="Clear and replace the saved secret"
              >
                Replace
              </Button>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Found in Meta for Developers → your app → <b>App Settings → Basic</b> → reveal
            App Secret. The server uses it to verify every incoming webhook call via{' '}
            <span className="font-mono">X-Hub-Signature-256</span> — without this, all events
            are rejected. Stored masked; only the last 4 chars echo back.
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={async () => { await onSave(); await onReload(); }}
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <ShieldCheck className="w-4 h-4 mr-1" />
            {saving ? 'Saving…' : 'Save webhook config'}
          </Button>
        </div>

        {/* Step 5: subscribe in Meta */}
        <div className="space-y-2 rounded border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Step 5 · Subscribe to message events
          </div>
          <div className="text-[11px] text-muted-foreground space-y-1">
            <div>In Meta&apos;s Webhooks page, click <b>Manage</b> next to <span className="font-mono">whatsapp_business_account</span> and subscribe to:</div>
            <ul className="list-disc ml-4 space-y-0.5">
              <li><span className="font-mono">messages</span> — for delivery / read / sent / failed status</li>
              <li><span className="font-mono">message_template_status_update</span> — when Meta approves your templates</li>
            </ul>
          </div>
        </div>

        {/* Live status */}
        <div className="space-y-2 rounded border p-3 bg-background">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Live status</div>
          {!ready ? (
            <div className="text-[11px] text-muted-foreground italic">
              Save the webhook config above, then verify it in Meta. Once Meta starts pushing,
              you&apos;ll see live event counts here.
            </div>
          ) : !status?.eventsReceived ? (
            <div className="text-[11px] text-muted-foreground">
              Configured, but no webhook events received yet. Send a test WhatsApp message and
              the delivery / read receipt should appear here within seconds.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Events received</div>
                <div className="font-bold text-2xl">{status?.eventsReceived ?? 0}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Last event</div>
                <div className="font-medium">{lastEventAgo || '—'}</div>
                {status?.lastEventType && (
                  <div className="text-[10px] text-muted-foreground capitalize">{status.lastEventType}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Last error</div>
                <div className="font-medium text-red-600 text-xs">{status?.lastError || 'None'}</div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =================================================================
// E-Invoice tab
// =================================================================

interface EInvoiceForm {
  enabled: boolean;
  provider: 'mock' | 'nic' | 'gsp';
  environment: 'sandbox' | 'production';
  gstin: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  /** Configurable GSP endpoint paths. Defaults match OAuth2 conventions
   *  but each GSP exposes the NIC API at a slightly different path —
   *  these let the merchant point at their specific provider. */
  authPath: string;
  generatePath: string;
  cancelPath: string;
  ewbGeneratePath: string;
  ewbCancelPath: string;
}

interface TestConnectionResult {
  ok: boolean;
  provider: string;
  environment?: string;
  expiresAtIso?: string;
  ttlSeconds?: number;
  message?: string;
}

function EInvoiceTab({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<EInvoiceForm>({
    enabled: false,
    provider: 'mock',
    environment: 'sandbox',
    gstin: '',
    username: '',
    password: '',
    clientId: '',
    clientSecret: '',
    baseUrl: '',
    authPath: '/auth/token',
    generatePath: '/einvoice/generate',
    cancelPath: '/einvoice/cancel',
    ewbGeneratePath: '/ewaybill/generate',
    ewbCancelPath: '/ewaybill/cancel',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Disclosure for "Advanced" endpoint-path overrides — most merchants
  // won't touch these, so we hide them behind a toggle. The values still
  // get persisted regardless of UI state.
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    api.get<StoreInfo>('/store/me')
      .then((s) => {
        const e = s.eInvoice;
        if (e) {
          setForm({
            enabled: !!e.enabled,
            provider: (e.provider || 'mock') as EInvoiceForm['provider'],
            environment: (e.environment || 'sandbox') as EInvoiceForm['environment'],
            gstin: e.gstin || '',
            username: e.username || '',
            password: e.password || '',
            clientId: e.clientId || '',
            clientSecret: e.clientSecret || '',
            baseUrl: e.baseUrl || '',
            authPath: (e as { authPath?: string }).authPath || '/auth/token',
            generatePath: (e as { generatePath?: string }).generatePath || '/einvoice/generate',
            cancelPath: (e as { cancelPath?: string }).cancelPath || '/einvoice/cancel',
            ewbGeneratePath: (e as { ewbGeneratePath?: string }).ewbGeneratePath || '/ewaybill/generate',
            ewbCancelPath: (e as { ewbCancelPath?: string }).ewbCancelPath || '/ewaybill/cancel',
          });
        }
      })
      .catch((err) => err instanceof ApiError && toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/store/me', { eInvoice: form });
      // Saving invalidates the GSP token cache server-side, so the next
      // test exercises a real auth round-trip against the new creds.
      setTestResult(null);
      setTestError(null);
      toast.success('E-invoice settings saved');
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Auth-only test against the configured provider. Doesn't burn an IRN;
   * for GSP it hits the auth endpoint and verifies a token comes back.
   * For NIC it'll throw the "not implemented" hint. For Mock it returns
   * a trivial OK.
   */
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      // Save first so the server is testing the values shown in the UI,
      // not the previously-saved set.
      await api.put('/store/me', { eInvoice: form });
      const result = await api.post<TestConnectionResult>('/store/einvoice/test', {});
      setTestResult(result);
    } catch (err) {
      if (err instanceof ApiError) setTestError(err.message);
      else setTestError(String(err));
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading…</div>;
  }

  const passwordMasked = form.password.startsWith('••');
  const secretMasked = form.clientSecret.startsWith('••');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-purple-600" />
          E-Invoice (IRN) provider
        </CardTitle>
        <CardDescription>
          E-invoicing is mandatory for B2B sales above the turnover threshold (currently
          ₹5 Cr). Each invoice gets an Invoice Reference Number (IRN) + signed QR code from
          NIC. Pick a provider and supply credentials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 bg-muted p-3 rounded">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            <span className="font-semibold">Enable e-invoicing</span>
          </label>
          <div className="text-xs text-muted-foreground">
            When on, B2B sales show a Generate IRN button.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Provider</Label>
            <select
              className="h-9 w-full border rounded-md px-2 bg-background"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value as EInvoiceForm['provider'] })}
            >
              <option value="mock">Mock (testing — no external calls)</option>
              <option value="nic">NIC IRP direct (turnover &gt; ₹100 Cr only)</option>
              <option value="gsp">GSP (ClearTax / Masters India / Avalara / Tally Signer)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Environment</Label>
            <select
              className="h-9 w-full border rounded-md px-2 bg-background"
              value={form.environment}
              onChange={(e) => setForm({ ...form, environment: e.target.value as EInvoiceForm['environment'] })}
            >
              <option value="sandbox">Sandbox (test IRNs, no portal effect)</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">GSTIN registered with the provider</Label>
            <Input
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
              placeholder="Same as your store GSTIN — but must be enrolled on einvoice1.gst.gov.in"
              maxLength={15}
            />
          </div>
        </div>

        {form.provider === 'mock' && (
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded p-3 text-sm">
            <b>Mock provider</b> — generates simulated IRN/QR/Ack locally. No external API calls,
            no GSTIN registration needed. Use this to demo the flow before signing up with NIC or a GSP.
          </div>
        )}

        {form.provider === 'nic' && (
          <div className="space-y-3 border-l-4 border-purple-300 pl-3">
            <div className="text-xs text-muted-foreground">
              NIC IRP direct integration. Register at <span className="font-mono">einvoice1.gst.gov.in</span>{' '}
              → <b>API Registration</b> → Direct API Access. <b>Only available if turnover &gt; ₹100 Cr.</b>{' '}
              Below that, use a GSP.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Username</Label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Password</Label>
                <div className="relative">
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={passwordMasked ? '(saved — paste new to replace)' : ''}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                    title={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Client ID</Label>
                <Input value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Client Secret</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={form.clientSecret}
                    onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                    placeholder={secretMasked ? '(saved)' : ''}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                    title={showSecret ? 'Hide secret' : 'Show secret'}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {form.provider === 'gsp' && (
          <div className="space-y-3 border-l-4 border-indigo-300 pl-3">
            <div className="text-xs text-muted-foreground">
              GSP integration. Sign up with one of: ClearTax, Masters India, IRIS, Avalara,
              Tally Signer, or other licensed GSPs. Auth flow is OAuth2-style (client_id +
              client_secret → Bearer token), then NIC schema-v1.1 payload to the generate
              endpoint. Token is cached server-side per the GSP&apos;s TTL.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Base URL *</Label>
                <Input
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://api.your-gsp.com/v1"
                />
                <p className="text-[11px] text-muted-foreground">
                  Origin only — endpoint paths are configurable below.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Username (optional)</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="Some GSPs require this"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Password (optional)</Label>
                <div className="relative">
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={passwordMasked ? '(saved — paste new to replace)' : ''}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                    title={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Client ID *</Label>
                <Input value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Client Secret *</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={form.clientSecret}
                    onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                    placeholder={secretMasked ? '(saved)' : ''}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                    title={showSecret ? 'Hide secret' : 'Show secret'}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Advanced — endpoint paths per provider. Defaults follow
                OAuth2 / NIC convention; merchants whose GSP uses
                different paths override here. */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-indigo-700 dark:text-indigo-300 hover:underline"
            >
              {showAdvanced ? '▾' : '▸'} Advanced — endpoint paths
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3 bg-muted/40 p-3 rounded">
                <div className="space-y-1">
                  <Label className="text-xs">Auth path</Label>
                  <Input
                    value={form.authPath}
                    onChange={(e) => setForm({ ...form, authPath: e.target.value })}
                    placeholder="/auth/token"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Generate IRN path</Label>
                  <Input
                    value={form.generatePath}
                    onChange={(e) => setForm({ ...form, generatePath: e.target.value })}
                    placeholder="/einvoice/generate"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cancel IRN path</Label>
                  <Input
                    value={form.cancelPath}
                    onChange={(e) => setForm({ ...form, cancelPath: e.target.value })}
                    placeholder="/einvoice/cancel"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">EWB generate path</Label>
                  <Input
                    value={form.ewbGeneratePath}
                    onChange={(e) => setForm({ ...form, ewbGeneratePath: e.target.value })}
                    placeholder="/ewaybill/generate"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">EWB cancel path</Label>
                  <Input
                    value={form.ewbCancelPath}
                    onChange={(e) => setForm({ ...form, ewbCancelPath: e.target.value })}
                    placeholder="/ewaybill/cancel"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save E-invoice settings'}
          </Button>
          {/* Auth-only Test — saves first, then exercises the configured
              provider's auth endpoint. Doesn't burn an IRN. */}
          {(form.provider === 'gsp' || form.provider === 'nic' || form.provider === 'mock') && (
            <Button
              onClick={runTest}
              disabled={testing || !form.enabled}
              variant="outline"
              title={
                !form.enabled
                  ? 'Enable e-invoicing first to test connection'
                  : 'Save + test the provider auth endpoint (no IRN burned)'
              }
            >
              <ShieldCheck className="w-4 h-4 mr-1" />
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
          )}
        </div>

        {testResult && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700 p-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
              <strong className="text-emerald-800 dark:text-emerald-200">
                Connected to {testResult.provider.toUpperCase()}
              </strong>
            </div>
            <div className="text-xs text-emerald-800 dark:text-emerald-200/80 space-y-0.5">
              {testResult.environment && <div>Environment: {testResult.environment}</div>}
              {testResult.ttlSeconds && (
                <div>
                  Token TTL: {Math.round(testResult.ttlSeconds / 60)} minutes
                  {testResult.expiresAtIso && (
                    <span> · expires {new Date(testResult.expiresAtIso).toLocaleString('en-IN')}</span>
                  )}
                </div>
              )}
              {testResult.message && <div>{testResult.message}</div>}
            </div>
          </div>
        )}
        {testError && (
          <div className="rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-700 p-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-rose-700 dark:text-rose-300" />
              <strong className="text-rose-800 dark:text-rose-200">
                Connection failed
              </strong>
            </div>
            <div className="text-xs text-rose-800 dark:text-rose-200/80 whitespace-pre-wrap">
              {testError}
            </div>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground space-y-1 mt-4 pt-4 border-t">
          <div><b>What happens when you click Generate IRN on a sale:</b></div>
          <div>1. Server validates B2B eligibility (customer must have GSTIN; not a return).</div>
          <div>2. Builds NIC Schema-v1.1 JSON from the sale.</div>
          <div>3. Calls the configured provider — Mock returns instantly; NIC/GSP makes a real API call.</div>
          <div>4. Stores IRN + AckNo + AckDate + signed QR on the sale.</div>
          <div>5. The QR + IRN print on the invoice automatically.</div>
        </div>
      </CardContent>
    </Card>
  );
}

function PreferencesTab({
  form,
  setForm,
  save,
  saving,
  loaded,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  save: () => Promise<void>;
  saving: boolean;
  loaded: boolean;
}) {
  if (!loaded) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }
  const s = form.settings;
  const setS = (patch: Partial<StoreSettings>) =>
    setForm({ ...form, settings: { ...s, ...patch } });

  // Aging buckets are stored as the cumulative cutoffs [30, 60, 90]. The
  // implicit final bucket is "everything older than the last value".
  const [a, b, c] = s.agingBuckets.length >= 3
    ? [s.agingBuckets[0], s.agingBuckets[1], s.agingBuckets[2]]
    : [30, 60, 90];
  const setBucket = (idx: number, value: number) => {
    const next = [a, b, c];
    next[idx] = value;
    setS({ agingBuckets: next.filter((n) => n > 0).sort((x, y) => x - y) });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>POS &amp; billing</CardTitle>
          <CardDescription>How sales behave at checkout.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Default GST mode</Label>
              <select
                className="h-9 border rounded-md px-2 bg-background w-full"
                value={s.defaultGSTMode}
                onChange={(e) => setS({ defaultGSTMode: e.target.value as 'inclusive' | 'exclusive' })}
              >
                <option value="exclusive">Exclusive — selling price is pre-tax (tax added on top)</option>
                <option value="inclusive">Inclusive — selling price already includes tax</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                Default for new products. Per-product override available in inventory.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Print copies per bill</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={s.printCopies}
                onChange={(e) => setS({ printCopies: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })}
              />
              <p className="text-[11px] text-muted-foreground">
                Original + duplicate + triplicate, etc. (1–5).
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.allowNegativeStock}
              onChange={(e) => setS({ allowNegativeStock: e.target.checked })}
            />
            <span>
              Allow negative stock at POS{' '}
              <span className="text-[11px] text-muted-foreground">
                — sells items even if recorded stock is 0 (useful for shop owners who
                haven&apos;t fully digitised inventory; otherwise keep off).
              </span>
            </span>
          </label>
          <div className="space-y-1">
            <Label className="text-xs">Terms &amp; conditions / invoice footer</Label>
            <Textarea
              value={s.invoiceFooter}
              onChange={(e) => setS({ invoiceFooter: e.target.value })}
              maxLength={1500}
              rows={6}
              placeholder={
                '1. Goods once sold will not be taken back or exchanged unless defective.\n' +
                '2. Warranty claims (if applicable) require this invoice to be produced.\n' +
                '3. All disputes are subject to local jurisdiction.\n' +
                '4. E. & O. E. — Errors and omissions excepted.'
              }
              className="font-mono text-xs leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">
              Prints in the <strong>Terms &amp; Conditions</strong> section of A4
              invoices and the centred footer of 80mm receipts. Use numbered lines
              for clarity. Empty falls back to the boilerplate four-point template.
              Up to 1500 characters.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inventory defaults</CardTitle>
          <CardDescription>Applied when a new product is created.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Default low-stock threshold</Label>
              <Input
                type="number"
                min={0}
                value={s.defaultLowStockThreshold}
                onChange={(e) => setS({ defaultLowStockThreshold: Number(e.target.value) || 0 })}
              />
              <p className="text-[11px] text-muted-foreground">
                New products auto-set <code>minStock</code> to this. Drives the dashboard
                low-stock card and reorder alerts.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default warranty months</Label>
              <Input
                type="number"
                min={0}
                value={s.defaultWarrantyMonths}
                onChange={(e) => setS({ defaultWarrantyMonths: Number(e.target.value) || 0 })}
              />
              <p className="text-[11px] text-muted-foreground">
                Set above zero only if most products you sell carry a warranty (e.g.
                electronics retail). 0 = no warranty by default.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loyalty card — drives the per-bill rupees-earned line on the POS
          screen and the loyalty redemption flow. Disabled by default so the
          accountant doesn't see "Loyalty Earned" lines they didn't ask for. */}
      <Card>
        <CardHeader>
          <CardTitle>Loyalty</CardTitle>
          <CardDescription>
            Reward repeat customers with points earned per ₹ spent. Points show up on
            the bill and can be redeemed at the next sale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={s.enableLoyalty}
              onChange={(e) =>
                setS({
                  enableLoyalty: e.target.checked,
                  // Seed a sensible default when the user enables loyalty
                  // for the first time. 1% is the common SMB starting point.
                  loyaltyRate: e.target.checked && !s.loyaltyRate ? 1 : s.loyaltyRate,
                })
              }
            />
            <span>
              Enable loyalty points{' '}
              <span className="text-[11px] text-muted-foreground">
                — when off, no loyalty line is printed and points cannot be redeemed.
              </span>
            </span>
          </label>
          {s.enableLoyalty && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Loyalty rate (% of bill)</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  step={0.1}
                  value={s.loyaltyRate}
                  onChange={(e) =>
                    setS({
                      loyaltyRate: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                    })
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  e.g. <strong>1</strong> = customer earns ₹1 for every ₹100 spent
                  (1 point ≈ ₹1). Cap is 20% to prevent runaway accruals.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reports &amp; collections</CardTitle>
          <CardDescription>Aging report and reminder cadence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Label className="text-xs">Aging buckets (days)</Label>
          <div className="grid grid-cols-3 gap-2">
            <Input type="number" min={1} value={a} onChange={(e) => setBucket(0, Number(e.target.value) || 0)} />
            <Input type="number" min={1} value={b} onChange={(e) => setBucket(1, Number(e.target.value) || 0)} />
            <Input type="number" min={1} value={c} onChange={(e) => setBucket(2, Number(e.target.value) || 0)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Buckets become 0–{a}, {a + 1}–{b}, {b + 1}–{c}, and {c}+ days. Standard SMB
            practice is 30 / 60 / 90.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GST compliance thresholds</CardTitle>
          <CardDescription>
            Defaults match the central GST rules. Override only if your state notification
            differs, and verify with your CA before changing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">E-way bill threshold (₹)</Label>
              <Input
                type="number"
                min={0}
                value={s.eWayBillThreshold}
                onChange={(e) => setS({ eWayBillThreshold: Number(e.target.value) || 0 })}
              />
              <p className="text-[11px] text-muted-foreground">
                Sales above this trigger an e-way bill prompt. Central rule = ₹50,000.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">B2C Large threshold (₹)</Label>
              <Input
                type="number"
                min={0}
                value={s.b2cLargeThreshold}
                onChange={(e) => setS({ b2cLargeThreshold: Number(e.target.value) || 0 })}
              />
              <p className="text-[11px] text-muted-foreground">
                Inter-state B2C sales above this go into the GSTR-1 B2C-Large bucket
                (state-wise breakup). Below this, consolidated. Central rule = ₹2,50,000.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
          <Save className="w-4 h-4 mr-1" />
          {saving ? 'Saving…' : 'Save preferences'}
        </Button>
      </div>
    </div>
  );
}

// =====================================================================
// Subscription tab — read-only summary of the tenant's plan + usage.
// Pulls /api/store/subscription which the same backend route powers
// the SubscriptionReminder banner. The actual block/expired full-screen
// takeover lives in the dashboard layout; this tab is for "everything's
// healthy, here's what you're on".
// =====================================================================

const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

interface SubscriptionResponse {
  organization: { id: string; name: string; plan: string };
  subscription: {
    status: 'trial' | 'active' | 'expired' | 'blocked';
    plan: string;
    trialEndsAt: string | null;
    subscriptionStartedAt: string | null;
    subscriptionEndsAt: string | null;
    monthlyAmount: number;
    daysRemaining: number | null;
    isAccessAllowed: boolean;
  };
  limits: {
    label: string;
    stores: number;
    warehouses: number;
    users: { admin: number; manager: number; cashier: number; accountant: number; ca: number };
  };
  usage: {
    stores: number;
    warehouses: number;
    users: { admin: number; manager: number; cashier: number; accountant: number; ca: number };
  };
}

const STATUS_TONE: Record<SubscriptionResponse['subscription']['status'], { cls: string; label: string }> = {
  trial:    { cls: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',           label: 'Trial' },
  active:   { cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300', label: 'Active' },
  expired:  { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',       label: 'Expired' },
  blocked:  { cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',           label: 'Blocked' },
};

function SubscriptionTab() {
  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await api.get<SubscriptionResponse>('/store/subscription'));
    } catch (e) {
      // 402 = blocked/expired — handled by the dashboard layout takeover,
      // but if the user lands here some other way we still want a useful
      // message. Other errors get surfaced inline.
      if (e instanceof ApiError) {
        setErr(e.message);
      } else {
        setErr('Could not load subscription details');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground italic">
          Loading subscription details…
        </CardContent>
      </Card>
    );
  }

  if (err && !data) {
    return (
      <Card className="bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900">
        <CardContent className="py-6 text-sm flex items-center gap-2 text-rose-900 dark:text-rose-300">
          <AlertCircle className="w-4 h-4" /> {err}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { subscription: sub, limits, usage } = data;
  const tone = STATUS_TONE[sub.status];
  const expiresAt =
    sub.status === 'active'
      ? sub.subscriptionEndsAt
      : sub.status === 'trial'
        ? sub.trialEndsAt
        : null;
  const Icon =
    sub.status === 'blocked' ? ShieldOff : sub.status === 'expired' ? Hourglass : Sparkles;
  const totalUserCap =
    limits.users.admin +
    limits.users.manager +
    limits.users.cashier +
    limits.users.accountant +
    limits.users.ca;
  const totalUserUsage =
    usage.users.admin +
    usage.users.manager +
    usage.users.cashier +
    usage.users.accountant +
    usage.users.ca;

  const VENDOR_EMAIL =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_EMAIL) || null;
  const VENDOR_WHATSAPP =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_WHATSAPP) || null;
  const waNumber = (VENDOR_WHATSAPP || '').replace(/[^\d]/g, '');
  const waUpgradeLink = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        `Hi, I'd like to upgrade my Radsting plan for "${data.organization.name}".`,
      )}`
    : null;

  return (
    <div className="space-y-4">
      {/* Plan + status header card */}
      <Card>
        <CardContent className="p-5 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className={`w-12 h-12 rounded-md flex items-center justify-center ${tone.cls}`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Current plan
                </span>
                <Badge className={`text-[10px] uppercase ${tone.cls}`}>{tone.label}</Badge>
              </div>
              <div className="text-2xl font-bold capitalize mt-0.5">{limits.label}</div>
              {expiresAt && (
                <div className="text-xs text-muted-foreground mt-1">
                  {sub.status === 'trial' ? 'Trial ends' : 'Renews'}{' '}
                  <b>{new Date(expiresAt).toLocaleDateString('en-IN')}</b>
                  {typeof sub.daysRemaining === 'number' && (
                    <> · {sub.daysRemaining}d left</>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Monthly
            </div>
            <div className="text-2xl font-bold tabular-nums flex items-center gap-1">
              <IndianRupee className="w-5 h-5" />
              {sub.monthlyAmount > 0 ? sub.monthlyAmount.toLocaleString('en-IN') : '—'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage</CardTitle>
          <CardDescription>
            How many of your plan&rsquo;s allocations are currently in use. Hitting a
            limit blocks creating that resource until you upgrade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <UsageBar label="Branches" used={usage.stores} cap={limits.stores} />
          <UsageBar label="Warehouses" used={usage.warehouses} cap={limits.warehouses} />
          <UsageBar label="Total users" used={totalUserUsage} cap={totalUserCap} />

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2">
            {(['admin', 'manager', 'cashier', 'accountant', 'ca'] as const).map((role) => (
              <div key={role} className="rounded-md border p-2 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {role === 'ca' ? 'CA' : role}
                </div>
                <div className="text-base font-bold tabular-nums">
                  {usage.users[role]} / {limits.users[role]}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upgrade / contact card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Need more capacity?</CardTitle>
          <CardDescription>
            Reach out to your software vendor to upgrade your plan, extend your
            subscription, or add custom limits.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {waUpgradeLink && (
            <a
              href={waUpgradeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp vendor
            </a>
          )}
          {VENDOR_EMAIL && (
            <a
              href={`mailto:${VENDOR_EMAIL}?subject=${encodeURIComponent(
                `Upgrade plan — ${data.organization.name}`,
              )}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border bg-background hover:bg-accent text-sm font-medium transition-colors"
            >
              <Mail className="w-4 h-4" />
              Email vendor
            </a>
          )}
          {!waUpgradeLink && !VENDOR_EMAIL && (
            <p className="text-sm text-muted-foreground">
              Contact your software vendor to discuss upgrading.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Extra-user upgrade — qty × price-per-user (vendor-configurable
          in admin → Settings, default ₹199). Routes through the same
          /billing/intent flow so the request shows up in admin
          Payments inbox. */}
      <UserAddonRequest />

      {/* Public catalogue from /public/plans — vendor authors these in the
          admin portal. Each plan's button routes to its hosted payment URL
          (or the global vendor pay URL with ?plan=&org= appended), falling
          back to WhatsApp / mailto if neither is configured. */}
      <PlansShowcase
        currentPlanCode={data.subscription.plan}
        organizationName={data.organization.name}
        organizationId={data.organization.id}
      />
    </div>
  );
}

function UsageBar({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  const bar =
    pct >= 100
      ? 'bg-rose-500'
      : pct >= 80
        ? 'bg-amber-500'
        : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="text-xs tabular-nums">
          <b>{used}</b> / {cap}
        </div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// =====================================================================
// Help & Support tab — vendor contact, app version, support shortcuts.
// =====================================================================

const APP_VERSION =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_VERSION) || '1.0.0';

function HelpTab() {
  const VENDOR_EMAIL =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_EMAIL) || null;
  const VENDOR_PHONE =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_PHONE) || null;
  const VENDOR_WHATSAPP =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_WHATSAPP) || null;
  const VENDOR_WEBSITE =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VENDOR_WEBSITE) || null;
  const phoneClean = VENDOR_PHONE?.replace(/[^\d+]/g, '');
  const waNumber = (VENDOR_WHATSAPP || VENDOR_PHONE || '').replace(/[^\d]/g, '');
  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        'Hi, I need help with Radsting POS.',
      )}`
    : null;

  const hasContact = VENDOR_EMAIL || VENDOR_PHONE || waLink || VENDOR_WEBSITE;

  return (
    <div className="space-y-4">
      {/* Inbox + new-request flow — talks to /api/support/requests on the
          tenant backend; vendor reads and replies in the admin portal. */}
      <SupportRequestsPanel />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-blue-600" />
            Contact your software vendor
          </CardTitle>
          <CardDescription>
            Prefer a real-time channel? Reach out via WhatsApp, phone or email —
            your vendor handles everything end to end.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!hasContact && (
            <p className="text-sm text-muted-foreground italic">
              No vendor contact configured. Ask your software vendor to set
              <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-[11px] font-mono">
                NEXT_PUBLIC_VENDOR_*
              </code>
              env vars on their build.
            </p>
          )}

          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-between gap-2 px-4 py-3 rounded-md border bg-background hover:bg-accent text-sm font-medium transition-colors"
            >
              <span className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                WhatsApp
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {VENDOR_WHATSAPP || VENDOR_PHONE}
              </span>
            </a>
          )}
          {VENDOR_PHONE && (
            <a
              href={`tel:${phoneClean}`}
              className="w-full inline-flex items-center justify-between gap-2 px-4 py-3 rounded-md border bg-background hover:bg-accent text-sm font-medium transition-colors"
            >
              <span className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Call
              </span>
              <span className="text-xs text-muted-foreground font-mono">{VENDOR_PHONE}</span>
            </a>
          )}
          {VENDOR_EMAIL && (
            <a
              href={`mailto:${VENDOR_EMAIL}?subject=${encodeURIComponent(
                'Radsting POS — support request',
              )}`}
              className="w-full inline-flex items-center justify-between gap-2 px-4 py-3 rounded-md border bg-background hover:bg-accent text-sm font-medium transition-colors"
            >
              <span className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </span>
              <span className="text-xs text-muted-foreground font-mono">{VENDOR_EMAIL}</span>
            </a>
          )}
          {VENDOR_WEBSITE && (
            <a
              href={VENDOR_WEBSITE}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-between gap-2 px-4 py-3 rounded-md border bg-background hover:bg-accent text-sm font-medium transition-colors"
            >
              <span className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                Website
              </span>
              <span className="text-xs text-muted-foreground font-mono">{VENDOR_WEBSITE}</span>
            </a>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Application</span>
            <span className="font-medium">Radsting POS &amp; ERP</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono">{APP_VERSION}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Build</span>
            <span className="font-mono">
              {typeof window !== 'undefined' ? window.location.host : '—'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
