'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Barcode,
  Search,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Wallet,
  Smartphone,
  Receipt,
  Printer,
  X,
  ShoppingBag,
  Save,
  ClipboardList,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { CartTotals, Product, PaymentMode, Sale, StoreInfo } from '@/lib/types';
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner';
import { useOnlineStatus } from '@/hooks/use-online-status';
import {
  cacheProducts,
  findCachedProduct,
  getCachedProducts,
  adjustCachedStock,
  outboxAdd,
  uuid,
} from '@/lib/offline-db';
import { buildCartLocal } from '@/lib/billing-local';
import { getOfflineContext } from '@/lib/offline-auth';
import { syncNow, refreshPendingCount } from '@/lib/sync';
import { InvoicePreview } from '@/components/pos/InvoicePreview';
import { ShieldCheck, UserRound, FileText, MessageCircle, Mail, Link as LinkIcon, QrCode } from 'lucide-react';
import { printInvoice } from '@/lib/print-invoice';
import {
  billShareUrl,
  whatsappLink,
  mailtoLink,
  copyToClipboard,
} from '@/lib/share-invoice';
import { QRCodeSVG } from 'qrcode.react';
import { SyncStatusBadge } from '@/components/pos/SyncStatusBadge';
import {
  type Draft,
  loadDrafts,
  saveDraft as persistDraft,
  deleteDraft as removeDraft,
  newDraftId,
  autoLabel,
  loadLiveCart,
  saveLiveCart,
  clearLiveCart,
} from '@/lib/pos-drafts';

interface CartLineInput {
  productId: string;
  product: Product;
  quantity: number;
  discount: number;
  discountType: 'flat' | 'percent';
  /** For serialised products — the specific unit scanned into this line. */
  unitId?: string;
  serialNo?: string;
}

const money = (n: number) => `₹${n.toFixed(2)}`;

/** "5m ago" / "2h ago" / "3d ago" — for draft list timestamps. */
function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-IN');
}

export default function POSPage() {
  const [lines, setLines] = useState<CartLineInput[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [totals, setTotals] = useState<CartTotals | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [tendered, setTendered] = useState<string>('');
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<{ name?: string } | null>(null);
  const router = useRouter();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '', email: '', gstNumber: '', stateCode: '' });
  // Set when the cashier picks an existing customer from the autocomplete.
  // When non-null, the sale is attached to that customerId on submit
  // (instead of letting the backend dedupe by phone, which is fragile).
  // Picking flips the form into "linked" mode — fields stay editable
  // for one-off corrections but the save uses the row id.
  const [pickedCustomerId, setPickedCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerMatches, setCustomerMatches] = useState<
    { _id: string; name: string; phone?: string; gstNumber?: string; stateCode?: string; outstandingBalance?: number; address?: string; email?: string }[]
  >([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [invoiceType, setInvoiceType] = useState<
    'regular' | 'export_with_payment' | 'export_without_payment' | 'sez_with_payment' | 'sez_without_payment' | 'nil_rated' | 'exempt'
  >('regular');
  const [printAfterSave, setPrintAfterSave] = useState(false);
  const online = useOnlineStatus();

  // ─── Drafts ──────────────────────────────────────────────────────────
  // Lets a cashier park an in-progress cart and ring up another customer
  // first. Persisted to localStorage scoped by storeId so a multi-branch
  // user doesn't see Branch A's parked carts after switching to Branch B.
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  // True once the live-cart hydration has run for the current store.
  // Gates the auto-save effect so the first render doesn't overwrite
  // a persisted cart with an empty one before hydrate finishes.
  const [liveCartHydrated, setLiveCartHydrated] = useState(false);
  // Refresh the drafts list whenever the store changes or the dropdown
  // is opened. Cheap (localStorage parse) so no debounce.
  useEffect(() => {
    if (!store?._id) return;
    setDrafts(loadDrafts(String(store._id)));
  }, [store?._id, draftsOpen]);

  // ─── Live-cart hydrate ──────────────────────────────────────────────
  // On mount (after store loads), restore the cart the cashier left
  // mid-bill last time they were on this page. The user can scan an
  // item, jump to Inventory to check stock, and come back without
  // losing what they had.
  useEffect(() => {
    if (!store?._id || liveCartHydrated) return;
    const saved = loadLiveCart(String(store._id));
    if (saved) {
      setLines(saved.lines);
      setCustomer(saved.customer);
      setPickedCustomerId(saved.pickedCustomerId);
      setPaymentMode(saved.paymentMode);
      setInvoiceType(saved.invoiceType);
      setTendered(saved.tendered);
      setActiveDraftId(saved.activeDraftId);
      if (saved.lines.length > 0) {
        toast.message(`Restored ${saved.lines.length} item${saved.lines.length === 1 ? '' : 's'} from your last session`);
      }
    }
    setLiveCartHydrated(true);
  }, [store?._id, liveCartHydrated]);

  // ─── Live-cart auto-save ────────────────────────────────────────────
  // Debounced 300ms — writes every relevant piece of cart state to
  // localStorage so it survives page navigations and crashes. We only
  // start writing AFTER hydrate has finished, otherwise the initial
  // empty render would wipe the persisted blob.
  useEffect(() => {
    if (!store?._id || !liveCartHydrated) return;
    const sid = String(store._id);
    // If the cart is fully empty, drop the storage row instead of writing
    // an empty cart — keeps localStorage tidy.
    if (
      lines.length === 0 &&
      !customer.name && !customer.phone && !customer.address &&
      !customer.email && !customer.gstNumber && !pickedCustomerId &&
      !tendered
    ) {
      clearLiveCart(sid);
      return;
    }
    const t = window.setTimeout(() => {
      saveLiveCart({
        storeId: sid,
        lines,
        customer,
        pickedCustomerId,
        paymentMode,
        invoiceType,
        tendered,
        activeDraftId,
        updatedAt: Date.now(),
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [
    store?._id,
    liveCartHydrated,
    lines,
    customer,
    pickedCustomerId,
    paymentMode,
    invoiceType,
    tendered,
    activeDraftId,
  ]);

  useEffect(() => {
    (async () => {
      try {
        setStore(await api.get<StoreInfo>('/store/me'));
      } catch {}
    })();
  }, []);

  // Debounced customer search. Re-fires 250ms after typing stops so we
  // don't hammer /customers on every keystroke. Empty input → clear
  // matches (keeps the dropdown closed).
  useEffect(() => {
    const term = customerSearch.trim();
    if (!term) {
      setCustomerMatches([]);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const res = await api.get<{ _id: string; name: string; phone?: string; gstNumber?: string; stateCode?: string; outstandingBalance?: number; address?: string; email?: string }[]>(
          `/customers?q=${encodeURIComponent(term)}&limit=8`,
        );
        setCustomerMatches(Array.isArray(res) ? res : []);
      } catch {
        setCustomerMatches([]);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [customerSearch]);

  /**
   * Pick an existing customer — locks the form to that row's id, prefills
   * every field, and closes the dropdown. Submit will use this customerId
   * (NOT customerInfo) so the sale links to the existing record instead
   * of letting the backend dedupe by phone (which fails on minor diffs).
   */
  const pickCustomer = (c: typeof customerMatches[number]) => {
    setPickedCustomerId(c._id);
    setCustomer({
      name: c.name || '',
      phone: c.phone || '',
      address: c.address || '',
      email: c.email || '',
      gstNumber: c.gstNumber || '',
      stateCode: c.stateCode || store?.stateCode || '',
    });
    setCustomerSearch('');
    setCustomerSearchOpen(false);
  };

  const clearPickedCustomer = () => {
    setPickedCustomerId(null);
    setCustomer({ name: '', phone: '', address: '', email: '', gstNumber: '', stateCode: '' });
  };

  // While online, refresh the local product cache periodically so an offline
  // session has a fresh master to look up barcodes / SKUs / names.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      try {
        const all = await api.get<Product[]>('/products?limit=1000');
        if (!cancelled) await cacheProducts(all);
      } catch {
        /* network blip — keep whatever we had cached */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online]);

  // After a Save & Print click, fire the print dialog once the sale has been saved.
  // Thermal (80mm) for normal bills, A4 for warranty bills.
  useEffect(() => {
    if (lastSale && printAfterSave) {
      printInvoice(lastSale, store);
      setPrintAfterSave(false);
    }
  }, [lastSale, printAfterSave, store]);

  // Close the invoice modal with Escape
  useEffect(() => {
    if (!lastSale) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLastSale(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lastSale]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('user');
    if (!raw || raw === 'undefined' || raw === 'null') return;
    try {
      setUser(JSON.parse(raw));
    } catch {}
  }, []);

  const addProduct = useCallback(
    (product: Product, qty = 1) => {
      if (!product.isActive) {
        toast.error(`${product.name} is not active`);
        return;
      }
      if (product.stock <= 0) {
        toast.error(`${product.name} is out of stock`);
        return;
      }

      // Serialised products are tracked unit-by-unit. Every add must specify a
      // concrete unit (arrives via product.matchedUnit from the scan). Manual
      // "click a product card" flows cannot add a serialised item.
      if (product.isSerialised) {
        if (!product.matchedUnit) {
          toast.error(
            `${product.name} is serial-tracked — scan a specific unit's QR / barcode to add it.`,
          );
          return;
        }
        const unit = product.matchedUnit;
        if (unit.status !== 'in_stock') {
          toast.error(`Unit ${unit.serialNo} is already ${unit.status}`);
          return;
        }
        setLines((prev) => {
          if (prev.some((l) => l.unitId === unit._id)) {
            toast.info(`Unit ${unit.serialNo} is already in the cart`);
            return prev;
          }
          return [
            ...prev,
            {
              productId: product._id,
              product,
              quantity: 1,
              discount: 0,
              discountType: 'flat',
              unitId: unit._id,
              serialNo: unit.serialNo,
            },
          ];
        });
        return;
      }

      setLines((prev) => {
        const existing = prev.find((l) => l.productId === product._id && !l.unitId);
        if (existing) {
          if (existing.quantity + qty > product.stock) {
            toast.error(`Only ${product.stock} ${product.unit} in stock`);
            return prev;
          }
          return prev.map((l) =>
            l === existing ? { ...l, quantity: l.quantity + qty } : l,
          );
        }
        return [
          ...prev,
          {
            productId: product._id,
            product,
            quantity: qty,
            discount: 0,
            discountType: 'flat',
          },
        ];
      });
    },
    [],
  );

  const handleScan = useCallback(
    async (code: string) => {
      // Online path: server lookup (handles serialised units via matchedUnit).
      if (online) {
        try {
          const product = await api.get<Product>(`/pos/lookup/${encodeURIComponent(code)}`);
          addProduct(product);
          if (product.matchedUnit) {
            toast.success(`Added: ${product.name} · serial ${product.matchedUnit.serialNo}`);
          } else {
            toast.success(`Added: ${product.name}`);
          }
          return;
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            toast.error(`Code ${code} not registered`, {
              action: {
                label: 'Register product',
                onClick: () => router.push(`/dashboard/inventory?barcode=${encodeURIComponent(code)}`),
              },
              duration: 8000,
            });
            return;
          }
          // Network / 5xx — fall through to the offline cache as a best effort.
        }
      }
      // Offline path: best-effort cached lookup. Serialised products can't be
      // resolved offline (we don't cache the per-unit collection) so reject
      // those clearly so the cashier knows.
      try {
        const cached = await findCachedProduct(code);
        if (!cached) {
          toast.error(`Code ${code} not in offline cache. Connect to the internet, search the product, then go offline again.`);
          return;
        }
        if (cached.isSerialised) {
          toast.error(`${cached.name} is serial-tracked — serialised sales need an online connection.`);
          return;
        }
        addProduct(cached);
        toast.success(`Added (offline): ${cached.name}`);
      } catch {
        toast.error('Could not look up product');
      }
    },
    [online, addProduct, router],
  );

  useBarcodeScanner({
    onScan: handleScan,
    // POS must accept both 1D barcodes (digits) and 2D QR payloads (which may
    // carry URLs / punctuation) — widen the filter beyond alphanumerics.
    charPattern: /[\x20-\x7E]/,
  });

  // Surface why search came back empty: real API failure vs. genuinely no
  // matches vs. searching while offline with empty cache. Without this the
  // previous catch-everything-and-show-nothing pattern looked identical to
  // "no matching products" — impossible to debug from the UI.
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancel = false;
    const q = search.trim();
    if (!q) {
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      if (!cancel) {
        setSearching(true);
        setSearchError(null);
      }
      // Try server search first when online; fall through to cache otherwise.
      if (online) {
        try {
          const rows = await api.get<Product[]>(
            `/pos/search?q=${encodeURIComponent(q)}&limit=8`,
          );
          if (!cancel) {
            setSearchResults(rows);
            setSearching(false);
          }
          return;
        } catch (err) {
          // Capture the real reason for the cashier to see. Then attempt
          // the offline cache as a best-effort fallback — but if THAT
          // also returns nothing, the error message stays visible so the
          // cashier knows it was a server fault, not "no matches".
          if (!cancel) {
            const msg =
              err instanceof ApiError
                ? `${err.code || 'ERROR'} · ${err.message}`
                : err instanceof Error
                  ? err.message
                  : 'Server search failed';
            setSearchError(msg);
          }
        }
      }
      try {
        const all = await getCachedProducts();
        const ql = q.toLowerCase();
        const matches = all
          .filter(
            (p) =>
              p.isActive !== false &&
              (p.name?.toLowerCase().includes(ql) ||
                p.sku?.toLowerCase().includes(ql) ||
                p.barcode?.toLowerCase().includes(ql) ||
                p.qrCode?.toLowerCase().includes(ql)),
          )
          .slice(0, 8);
        if (!cancel) {
          setSearchResults(matches);
          // Cache hit clears the prior server-error message; if cache is
          // empty AND we're offline AND no prior error, surface that.
          if (matches.length > 0) setSearchError(null);
          else if (!online && !searchError) {
            setSearchError('Offline — product cache empty. Reconnect once to refresh.');
          }
          setSearching(false);
        }
      } catch {
        if (!cancel) {
          setSearchResults([]);
          setSearching(false);
        }
      }
    }, 180);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, online]);

  useEffect(() => {
    let cancel = false;
    setCalcError(null);
    if (lines.length === 0) {
      setTotals(null);
      return;
    }
    const items = lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      discount: l.discount,
      discountType: l.discountType,
      unitId: l.unitId,
    }));
    (async () => {
      // Online: use the server's BillingEngine (source of truth for tax math).
      if (online) {
        try {
          const result = await api.post<CartTotals>('/pos/calculate', { items });
          if (!cancel) setTotals(result);
          return;
        } catch (err) {
          if (cancel) return;
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            setCalcError(err.message);
            return;
          }
          // Network / 5xx — fall through to local calc.
        }
      }
      // Offline / fallback: compute totals from the cached product master so
      // the cart still shows accurate numbers. Server will re-validate on
      // sync, so any drift surfaces there.
      try {
        const cached = await getCachedProducts();
        const totals = buildCartLocal(items, cached, {
          storeStateCode: store?.stateCode || '07',
          customerStateCode: customer.stateCode || store?.stateCode || '07',
        });
        if (!cancel) setTotals(totals);
      } catch (err) {
        if (cancel) return;
        if (err instanceof Error && err.message === 'PRODUCT_NOT_FOUND_OFFLINE') {
          setCalcError('Cart contains a product not in the offline cache. Reconnect to refresh products.');
        } else {
          setCalcError('Could not calculate cart totals offline');
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [lines, online, store?.stateCode, customer.stateCode]);

  // Cart lines are keyed by unitId (for serialised lines) or productId (for
  // non-serialised). The helpers accept either so the same controls drive both.
  const keyOf = (l: CartLineInput) => l.unitId || l.productId;

  const updateQty = (key: string, next: number) => {
    setLines((prev) => {
      if (next <= 0) return prev.filter((l) => keyOf(l) !== key);
      return prev.map((l) => {
        if (keyOf(l) !== key) return l;
        // Serialised lines are one-per-unit and quantity is always 1.
        if (l.unitId) return l;
        if (next > l.product.stock) {
          toast.error(`Only ${l.product.stock} ${l.product.unit} in stock`);
          return l;
        }
        return { ...l, quantity: next };
      });
    });
  };

  const updateDiscount = (key: string, discount: number, type: 'flat' | 'percent') => {
    setLines((prev) =>
      prev.map((l) =>
        keyOf(l) === key ? { ...l, discount, discountType: type } : l,
      ),
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => keyOf(l) !== key));
  };

  const clearCart = () => {
    setLines([]);
    setTendered('');
    setLastSale(null);
  };

  // ─── Draft save / load / delete ──────────────────────────────────────
  /**
   * Park the current cart as a draft and clear the screen for the next
   * customer. If a draft is already active (loaded earlier and edited),
   * we update it in place instead of duplicating.
   */
  const saveAsDraft = () => {
    if (!store?._id) {
      toast.error('Store not loaded yet — try again in a second');
      return;
    }
    if (lines.length === 0) {
      toast.error('Add at least one item before parking the cart');
      return;
    }
    const now = Date.now();
    const id = activeDraftId || newDraftId();
    const draft: Draft = {
      id,
      storeId: String(store._id),
      lines,
      customer,
      pickedCustomerId,
      paymentMode,
      invoiceType,
      cashierName: user?.name,
      grandTotalAtSave: totals?.grandTotal,
      createdAt: now,
      updatedAt: now,
    };
    draft.label = autoLabel(draft);
    persistDraft(draft);
    setDrafts(loadDrafts(draft.storeId));
    setActiveDraftId(null);
    resetCartForNextSale();
    setLastSale(null);
    toast.success(`Parked as "${draft.label}" — pick it back up from Drafts`);
  };

  /** Load a saved draft into the cart. Replaces whatever is currently typed. */
  const loadDraftIntoCart = (d: Draft) => {
    if (lines.length > 0 && !confirm('Replace the current cart with this draft?')) return;
    setLines(d.lines);
    setCustomer(d.customer);
    setPickedCustomerId(d.pickedCustomerId);
    setPaymentMode(d.paymentMode);
    setInvoiceType(d.invoiceType);
    setTendered('');
    setActiveDraftId(d.id);
    setDraftsOpen(false);
    toast.success(`Loaded "${d.label || 'cart'}"`);
  };

  const deleteDraftRow = (id: string) => {
    if (!store?._id) return;
    removeDraft(String(store._id), id);
    setDrafts(loadDrafts(String(store._id)));
    if (activeDraftId === id) setActiveDraftId(null);
  };

  const tenderNumber = Number(tendered || 0);
  const grandTotal = totals?.grandTotal ?? 0;
  const change = Math.max(0, tenderNumber - grandTotal);

  const hasWarrantyItems = useMemo(
    () => lines.some((l) => (l.product.warrantyMonths ?? 0) > 0),
    [lines],
  );
  const customerIncomplete = !customer.name || !customer.phone || !customer.address;

  const canCheckout = useMemo(() => {
    if (!totals || lines.length === 0) return false;
    if (hasWarrantyItems && customerIncomplete) return false;
    if (paymentMode === 'credit') return true;
    return tenderNumber + 0.001 >= grandTotal;
  }, [totals, lines.length, paymentMode, tenderNumber, grandTotal, hasWarrantyItems, customerIncomplete]);

  const checkout = async ({ thenPrint = false }: { thenPrint?: boolean } = {}) => {
    if (!totals) return;
    setSubmitting(true);
    try {
      const items = lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        discount: l.discount,
        discountType: l.discountType,
        ...(l.unitId ? { unitId: l.unitId } : {}),
      }));
      const payAmount =
        paymentMode === 'credit' ? 0 : tenderNumber > 0 ? Math.min(tenderNumber, grandTotal) : grandTotal;
      const payments: { mode: PaymentMode; amount: number }[] =
        paymentMode === 'credit'
          ? [{ mode: 'credit', amount: grandTotal }]
          : [{ mode: paymentMode, amount: payAmount }];

      // Two paths to attach a customer to the sale:
      //   1. customerId — set when the cashier picked an existing row
      //      from the search dropdown. Backend uses this directly,
      //      bumps that row's outstandingBalance on credit sales.
      //   2. customerInfo — inline-typed details. Backend dedupes by
      //      phone (creates a new Customer doc if no match).
      // We never send both — the picker path skips customerInfo so a
      // typo in any inline field doesn't accidentally split the
      // customer into two records.
      const customerInfo = !pickedCustomerId && (customer.name || customer.phone || customer.address)
        ? {
            name: customer.name,
            phone: customer.phone,
            address: customer.address,
            email: customer.email,
            gstNumber: customer.gstNumber,
            stateCode: customer.stateCode,
          }
        : undefined;

      // Always tag the request with a fresh idempotency key — same key on
      // retries means the server commits at most once.
      const idempotencyKey = uuid();
      const payload = {
        items,
        payments,
        ...(pickedCustomerId ? { customerId: pickedCustomerId } : {}),
        ...(customerInfo ? { customerInfo } : {}),
        invoiceType,
        idempotencyKey,
      };

      if (online) {
        // Online: post directly. If it fails for a network reason, fall through
        // to the offline path so the cashier never loses a sale.
        try {
          if (thenPrint) setPrintAfterSave(true);
          const sale = await api.post<Sale>('/sales', payload);
          setLastSale(sale);
          // Sale was a draft — purge it now that it's been rung up for real.
          if (activeDraftId && store?._id) {
            removeDraft(String(store._id), activeDraftId);
            setDrafts(loadDrafts(String(store._id)));
            setActiveDraftId(null);
          }
          resetCartForNextSale();
          toast.success(`Invoice ${sale.invoiceNumber} saved${thenPrint ? ' — printing…' : ''}`);
          return;
        } catch (err) {
          setPrintAfterSave(false);
          // Validation / business errors stop here — don't queue something the
          // server already rejected (e.g. negative stock, missing field).
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            toast.error(err.message);
            return;
          }
          // Fall through to outbox for network / 5xx errors.
        }
      }

      // Offline path (or online with network error): write to outbox and let
      // the sync engine replay it whenever connectivity returns.
      // Stamp offline provenance so the synced sale records who/where/when it
      // was created during the outage (audit trail + outbox ownership).
      const offlineCtx = getOfflineContext();
      const offlinePayload = {
        ...payload,
        offlineMeta: {
          createdOfflineAt: new Date().toISOString(),
          deviceId: offlineCtx?.deviceId,
          offlineSessionId: offlineCtx?.offlineSessionId,
          userRef: offlineCtx?.userRef,
        },
      };
      const provisional = `OFFLINE-${Date.now().toString(36).toUpperCase()}`;
      await outboxAdd({
        id: idempotencyKey,
        kind: 'sales:create',
        payload: offlinePayload,
        display: {
          invoiceLabel: provisional,
          grandTotal,
          customer: customer.name || undefined,
        },
        createdAt: Date.now(),
        attempts: 0,
        status: 'pending',
      });
      // Decrement local cache stock so the next offline lookup sees the
      // reality the customer just walked out with.
      for (const l of lines) {
        if (!l.unitId) {
          await adjustCachedStock(l.productId, -l.quantity).catch(() => {});
        }
      }
      await refreshPendingCount();
      // Try to sync immediately in case the network is actually fine and we
      // just hit a transient blip.
      syncNow().catch(() => {});

      // Build a synthetic Sale for the local "saved" UI (preview / print).
      const offlineSale = synthesizeOfflineSale(provisional, payload, totals, store);
      setLastSale(offlineSale);
      resetCartForNextSale();
      toast.success(
        online
          ? `Saved offline (${provisional}) — will sync when network is steady`
          : `Saved offline (${provisional}) — queues until you're back online`,
      );
    } catch (err) {
      setPrintAfterSave(false);
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  const resetCartForNextSale = () => {
    setLines([]);
    setTendered('');
    setCustomer({ name: '', phone: '', address: '', email: '', gstNumber: '', stateCode: '' });
    setPickedCustomerId(null);
    setCustomerSearch('');
    setCustomerMatches([]);
    setCustomerSearchOpen(false);
    setInvoiceType('regular');
  };


  const focusSearch = () => searchInputRef.current?.focus();

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px] gap-1 h-[calc(100vh-2rem)] overflow-x-hidden print:hidden">
      {/* LEFT: Product search + scan panel — only this side scrolls */}
      <div className="flex flex-col gap-1 min-h-0 min-w-0">
        <Card>
          <CardContent className="p-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-blue-600 rounded text-white">
                <Barcode className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground truncate">
                  Scan barcode anywhere on this page — the scanner types directly into the system. Or search by name / SKU / barcode below.
                </div>
              </div>

              {/* Connectivity + outbox status — click to inspect the queue,
                  retry failed sales, or sync manually. Shows pending count
                  whenever localStorage has un-pushed offline sales. */}
              <SyncStatusBadge />

              <Button variant="outline" size="sm" onClick={focusSearch}>
                <Search className="w-4 h-4 mr-1" />
                Focus search
              </Button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product name, SKU or barcode…"
                className="pl-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchResults[0]) {
                    addProduct(searchResults[0]);
                    setSearch('');
                    setSearchResults([]);
                  }
                }}
              />
            </div>
            {/* Visible search state: error, loading, empty — so the cashier
                can tell apart "API broken" from "no matches" from "still
                loading". The silent-fallback pattern that lived here before
                made all three look identical. */}
            {search.trim() && searchError && (
              <div className="flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
                <X className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div className="flex-1 font-mono wrap-break-word">{searchError}</div>
              </div>
            )}
            {search.trim() && searching && searchResults.length === 0 && !searchError && (
              <div className="text-xs text-muted-foreground px-1">Searching…</div>
            )}
            {search.trim() && !searching && searchResults.length === 0 && !searchError && (
              <div className="text-xs text-muted-foreground border border-dashed rounded-md px-3 py-3 text-center">
                No products match <span className="font-medium">&quot;{search.trim()}&quot;</span>.
                Try the barcode or a different name.
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                {searchResults.map((p) => (
                  <button
                    key={p._id}
                    onClick={() => {
                      addProduct(p);
                      setSearch('');
                      setSearchResults([]);
                    }}
                    className="w-full flex items-center justify-between p-2 hover:bg-muted text-left"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        SKU {p.sku} · {p.barcode} · HSN {p.hsnCode}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{money(p.sellingPrice)}</div>
                      <Badge variant={p.stock > p.minStock ? 'secondary' : 'destructive'}>
                        {p.stock} in stock
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex-1 min-h-0 flex flex-col">
          <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
            <div className="p-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                <span className="font-semibold">Cart</span>
                {activeDraftId && (
                  <Badge className="bg-amber-500 hover:bg-amber-500 text-[10px]" title="This cart was resumed from a draft">
                    Resumed draft
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 relative">
                {/* Drafts dropdown — visible when there is at least one parked
                    cart for this store, or always so the cashier discovers it. */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraftsOpen((v) => !v)}
                  title="View parked carts"
                  className="relative"
                >
                  <ClipboardList className="w-4 h-4 mr-1" />
                  Drafts
                  {drafts.length > 0 && (
                    <Badge className="ml-1.5 h-4 px-1.5 text-[10px] bg-blue-600 hover:bg-blue-600">
                      {drafts.length}
                    </Badge>
                  )}
                </Button>
                {draftsOpen && (
                  <div className="absolute right-0 top-full mt-1 z-40 w-80 max-h-96 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
                    <div className="px-3 py-2 border-b flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Parked carts
                      </span>
                      <button
                        type="button"
                        onClick={() => setDraftsOpen(false)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Close"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {drafts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No drafts yet. Click <b>Save draft</b> on the right to park a cart.
                      </div>
                    ) : (
                      <ul className="divide-y">
                        {drafts.map((d) => (
                          <li key={d.id} className="px-3 py-2 hover:bg-muted/50 flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() => loadDraftIntoCart(d)}
                              className="flex-1 text-left min-w-0"
                            >
                              <div className="text-sm font-medium truncate">
                                {d.label || 'Untitled cart'}
                              </div>
                              <div className="text-[11px] text-muted-foreground flex gap-2 mt-0.5">
                                <span>
                                  {d.lines.length} item{d.lines.length === 1 ? '' : 's'}
                                </span>
                                {typeof d.grandTotalAtSave === 'number' && (
                                  <span>· {money(d.grandTotalAtSave)}</span>
                                )}
                                <span>· {formatRelative(d.updatedAt)}</span>
                              </div>
                              {d.cashierName && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  by {d.cashierName}
                                </div>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Delete draft "${d.label || 'Untitled cart'}"?`)) {
                                  deleteDraftRow(d.id);
                                }
                              }}
                              title="Delete this draft"
                              className="text-muted-foreground hover:text-red-600 shrink-0 mt-0.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {lines.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearCart}>
                    <X className="w-4 h-4 mr-1" /> Clear
                  </Button>
                )}
                <Badge variant="secondary">{lines.length} item{lines.length === 1 ? '' : 's'}</Badge>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {lines.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-10">
                  <Barcode className="w-20 h-20 mb-2" />
                  <div>Scan or search to add items</div>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2">Item</th>
                      <th className="p-2 w-32">Qty</th>
                      <th className="p-2 w-40">Discount</th>
                      <th className="p-2 text-right w-24">Total</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => {
                      // Match totals by index — billing engine preserves order 1:1
                      // and multiple lines can share a productId (serial-tracked).
                      const computed = totals?.items[idx];
                      const lineKey = keyOf(line);
                      const isUnit = !!line.unitId;
                      return (
                        <tr key={lineKey} className="border-b align-top">
                          <td className="p-2">
                            <div className="font-medium">{line.product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {money(line.product.sellingPrice)} · HSN {line.product.hsnCode} · GST {line.product.gstRate}%
                            </div>
                            {line.serialNo && (
                              <div className="text-[11px] font-mono mt-0.5 text-indigo-600 dark:text-indigo-400 truncate max-w-70" title={line.serialNo}>
                                Serial: {line.serialNo}
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7"
                                onClick={() => updateQty(lineKey, line.quantity - 1)}
                                disabled={isUnit}
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <Input
                                type="number"
                                min={1}
                                value={line.quantity}
                                onChange={(e) =>
                                  updateQty(lineKey, Number(e.target.value) || 0)
                                }
                                className="h-7 w-14 text-center"
                                disabled={isUnit}
                                title={isUnit ? 'Serialised unit — quantity is always 1' : undefined}
                              />
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7"
                                onClick={() => updateQty(lineKey, line.quantity + 1)}
                                disabled={isUnit}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={0}
                                value={line.discount}
                                onChange={(e) =>
                                  updateDiscount(
                                    lineKey,
                                    Number(e.target.value) || 0,
                                    line.discountType,
                                  )
                                }
                                className="h-7 w-16"
                              />
                              <Button
                                size="sm"
                                variant={line.discountType === 'percent' ? 'default' : 'outline'}
                                className="h-7 px-2 text-xs"
                                onClick={() =>
                                  updateDiscount(
                                    lineKey,
                                    line.discount,
                                    line.discountType === 'percent' ? 'flat' : 'percent',
                                  )
                                }
                              >
                                {line.discountType === 'percent' ? '%' : '₹'}
                              </Button>
                            </div>
                          </td>
                          <td className="p-2 text-right font-medium">
                            {computed ? money(computed.totalAmount) : '—'}
                          </td>
                          <td className="p-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => removeLine(lineKey)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT: Totals + customer + checkout — buttons stay pinned at bottom */}
      <div className="flex flex-col gap-2 min-h-0 min-w-0">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        <Card>
          <CardContent className="p-2 space-y-1 text-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Cashier</span>
              <span className="truncate max-w-[60%] text-right">{user?.name || 'Admin User'}</span>
            </div>
            <div className="border-t pt-2 space-y-0.5">
              <Row label="Subtotal" value={money(totals?.subtotal ?? 0)} />
              <Row label="Discount" value={`- ${money(totals?.totalDiscount ?? 0)}`} />
              <Row label="CGST + SGST / IGST" value={money(totals?.totalTax ?? 0)} />
              <Row label="Round-off" value={(totals?.roundOff ?? 0).toFixed(2)} />
            </div>
            <div className="border-t pt-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm">Grand Total</span>
                <span className="text-2xl font-bold text-blue-600">{money(grandTotal)}</span>
              </div>
              {calcError && <div className="mt-1 text-xs text-red-500">{calcError}</div>}
            </div>

            <div className="border-t pt-2">
              <div className="text-[11px] text-muted-foreground mb-1">Payment mode</div>
              <div className="grid grid-cols-4 gap-1.5">
                {(['cash', 'upi', 'card', 'credit'] as PaymentMode[]).map((m) => (
                  <Button
                    key={m}
                    variant={paymentMode === m ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPaymentMode(m)}
                    className="capitalize h-8 px-1 text-xs"
                  >
                    {m === 'cash' && <Wallet className="w-3 h-3 mr-1" />}
                    {m === 'upi' && <Smartphone className="w-3 h-3 mr-1" />}
                    {m === 'card' && <CreditCard className="w-3 h-3 mr-1" />}
                    {m === 'credit' && <Receipt className="w-3 h-3 mr-1" />}
                    {m}
                  </Button>
                ))}
              </div>
            </div>

            {paymentMode !== 'credit' && (
              <div className="border-t pt-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] text-muted-foreground">Amount tendered</div>
                  {paymentMode === 'cash' && tenderNumber > 0 && (
                    <div className="text-xs">
                      Change <span className="font-bold">{money(change)}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    placeholder={money(grandTotal)}
                    className="h-8 flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setTendered(String(grandTotal))}
                  >
                    Exact
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-1 mt-1.5">
                  {[100, 200, 500, 2000].map((v) => (
                    <Button
                      key={v}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-1"
                      onClick={() => setTendered((prev) => String((Number(prev) || 0) + v))}
                    >
                      +{v}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer details — required if any cart line has a warranty */}
        <Card className={hasWarrantyItems ? 'border-amber-400 dark:border-amber-700' : ''}>
          <CardContent className="p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <UserRound className="w-4 h-4" />
                Customer
              </div>
              <div className="flex items-center gap-1">
                {pickedCustomerId && customer.gstNumber && (
                  <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-[10px] px-1.5 py-0">
                    B2B
                  </Badge>
                )}
                {pickedCustomerId && (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                    Linked
                  </Badge>
                )}
                {hasWarrantyItems && (
                  <Badge className="bg-amber-500 hover:bg-amber-500 text-[10px] px-1.5 py-0">
                    <ShieldCheck className="w-3 h-3 mr-1" /> Warranty
                  </Badge>
                )}
                {!pickedCustomerId && !hasWarrantyItems && (
                  <span className="text-[10px] text-muted-foreground">Optional</span>
                )}
              </div>
            </div>

            {/* Picker — search the customer master so the sale links to
                an existing record (and credit balances accumulate on
                that one row instead of forking a new doc each time). */}
            {pickedCustomerId ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20 text-[12px]">
                <UserRound className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300 shrink-0" />
                <span className="font-medium text-emerald-900 dark:text-emerald-200 truncate">
                  {customer.name || 'Linked customer'}
                </span>
                {customer.gstNumber && (
                  <span className="text-[10px] font-mono text-emerald-800/80 dark:text-emerald-300/80 truncate">
                    · {customer.gstNumber}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-5 px-1.5 text-[10px] text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/40"
                  onClick={clearPickedCustomer}
                >
                  Walk-in
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setCustomerSearchOpen(true);
                  }}
                  onFocus={() => setCustomerSearchOpen(true)}
                  onBlur={() => window.setTimeout(() => setCustomerSearchOpen(false), 150)}
                  placeholder="Search saved customer · name / phone / GSTIN"
                  className="h-8 text-sm"
                />
                {customerSearchOpen && customerMatches.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-1 rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto">
                    {customerMatches.map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickCustomer(c)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-accent text-[12px]"
                      >
                        <UserRound className="w-3 h-3 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate flex items-center gap-1">
                            {c.name}
                            {c.gstNumber && (
                              <span className="text-[9px] uppercase tracking-wider px-1 py-px rounded bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                                B2B
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {c.phone || 'no phone'}
                            {c.gstNumber ? ` · ${c.gstNumber}` : ''}
                          </div>
                        </div>
                        {(c.outstandingBalance || 0) > 0 && (
                          <span className="text-[10px] text-rose-700 dark:text-rose-300 tabular-nums shrink-0">
                            owes ₹{Math.round(c.outstandingBalance || 0).toLocaleString('en-IN')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {customerSearchOpen && customerSearch.trim() && customerMatches.length === 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-1 rounded-md border bg-popover shadow-lg px-2 py-1.5 text-[11px] text-muted-foreground">
                    No saved customer matches — fill the form below to add one inline.
                  </div>
                )}
              </div>
            )}

            <Input
              value={customer.name}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              placeholder={`Name${hasWarrantyItems ? ' *' : ''}`}
              className="h-8 text-sm"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <Input
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                placeholder={`Mobile${hasWarrantyItems ? ' *' : ''}`}
                className="h-8 text-sm"
              />
              <Input
                value={customer.stateCode}
                onChange={(e) => setCustomer({ ...customer, stateCode: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                placeholder="State code (PoS)"
                maxLength={2}
                className="h-8 text-sm"
              />
            </div>
            <Input
              value={customer.gstNumber}
              onChange={(e) => setCustomer({ ...customer, gstNumber: e.target.value.toUpperCase() })}
              placeholder="GSTIN (optional)"
              maxLength={15}
              className="h-8 text-sm"
            />
            <Input
              value={customer.address}
              onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
              placeholder={`Address${hasWarrantyItems ? ' *' : ''}`}
              className="h-8 text-sm"
            />
            <select
              className="h-8 border rounded-md px-2 bg-background w-full text-xs"
              value={invoiceType}
              onChange={(e) => setInvoiceType(e.target.value as typeof invoiceType)}
            >
              <option value="regular">Regular taxable supply</option>
              <option value="export_with_payment">Export with IGST</option>
              <option value="export_without_payment">Export under LUT</option>
              <option value="sez_with_payment">SEZ with payment</option>
              <option value="sez_without_payment">SEZ without payment</option>
              <option value="nil_rated">Nil rated</option>
              <option value="exempt">Exempt</option>
            </select>
            {hasWarrantyItems && customerIncomplete && (
              <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-tight">
                Name, mobile and address required for warranty.
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        <div className="grid grid-cols-3 gap-2 shrink-0">
          {/* Park the cart without committing — common when the customer
              steps away and the cashier needs to ring up another bill. */}
          <Button
            className="h-12 flex flex-col gap-0 items-center justify-center min-w-0"
            variant="outline"
            disabled={lines.length === 0 || submitting}
            onClick={saveAsDraft}
            title="Park this cart so you can ring up another customer first"
          >
            <span className="flex items-center gap-1 text-sm font-semibold leading-tight">
              <Save className="w-4 h-4" />
              {activeDraftId ? 'Update draft' : 'Save draft'}
            </span>
            <span className="text-[11px] opacity-70 leading-tight">
              {lines.length} item{lines.length === 1 ? '' : 's'}
            </span>
          </Button>
          <Button
            className="h-12 flex flex-col gap-0 items-center justify-center min-w-0"
            variant="outline"
            disabled={!canCheckout || submitting}
            onClick={() => checkout({ thenPrint: false })}
          >
            <span className="text-sm font-semibold leading-tight">
              {submitting && !printAfterSave ? 'Saving…' : 'Save'}
            </span>
            <span className="text-[11px] opacity-70 leading-tight truncate w-full text-center px-1">
              {money(grandTotal)}
            </span>
          </Button>
          <Button
            className="h-12 flex flex-col gap-0 items-center justify-center bg-blue-600 hover:bg-blue-700 min-w-0"
            disabled={!canCheckout || submitting}
            onClick={() => checkout({ thenPrint: true })}
          >
            <span className="flex items-center gap-1 text-sm font-semibold leading-tight">
              <Printer className="w-4 h-4" />
              {submitting && printAfterSave ? 'Saving…' : 'Save & Print'}
            </span>
            <span className="text-[11px] opacity-90 leading-tight truncate w-full text-center px-1">
              {money(grandTotal)}
            </span>
          </Button>
        </div>
      </div>

      {/* Invoice preview modal — closes on backdrop click, Esc, or X button */}
      {lastSale && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setLastSale(null)}
          role="dialog"
          aria-modal="true"
        >
          <Card
            className="max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold">Invoice saved</div>
                  <div className="text-xs text-muted-foreground">
                    {lastSale.invoiceNumber}
                    {lastSale.hasWarranty ? ' · prints as A4 (warranty)' : ' · prints as 80 mm receipt'}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setLastSale(null)}
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <InvoicePreview ref={invoiceRef} sale={lastSale} store={store} />

              <ShareRow sale={lastSale} store={store} />

              <div className="grid grid-cols-3 gap-2 mt-3">
                <Button
                  variant="outline"
                  onClick={() => printInvoice(lastSale, store, 'thermal')}
                >
                  <Printer className="w-4 h-4 mr-1" /> 80mm
                </Button>
                <Button
                  variant="outline"
                  onClick={() => printInvoice(lastSale, store, 'a4')}
                >
                  <FileText className="w-4 h-4 mr-1" /> A4
                </Button>
                <Button onClick={() => setLastSale(null)} className="bg-blue-600 hover:bg-blue-700">
                  New sale
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ShareRow({ sale, store }: { sale: Sale; store: StoreInfo | null }) {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const url = billShareUrl(sale.shareToken || sale._id);
  const waFallback = whatsappLink(sale, store);
  const mail = mailtoLink(sale, store);
  const waApiReady = !!store?.whatsapp?.configured;
  const hasPhone = !!sale.customerSnapshot?.phone;

  const sendViaWhatsApp = async () => {
    if (!hasPhone) {
      toast.error('Customer phone missing on this bill');
      return;
    }
    if (!waApiReady) {
      if (waFallback) {
        window.open(waFallback, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    setSending(true);
    try {
      const res = await api.post<{ messageId?: string; sentTo?: string }>(
        `/sales/${sale._id}/whatsapp`,
        {},
      );
      toast.success(
        `Bill sent on WhatsApp to ${res.sentTo || sale.customerSnapshot?.phone}`,
      );
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(`WhatsApp send failed — ${err.message}`);
      } else {
        toast.error('WhatsApp send failed');
      }
    } finally {
      setSending(false);
    }
  };

  const onCopy = async () => {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      toast.success('Bill link copied');
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error('Could not copy — try long-pressing the link');
    }
  };

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">Send bill to customer</div>
        <div className="text-[10px] text-muted-foreground">Free · no printing needed</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPhone || sending}
          title={
            !hasPhone
              ? 'Customer phone required'
              : waApiReady
                ? 'Send bill automatically via WhatsApp API'
                : 'Open WhatsApp with bill link (one-tap send)'
          }
          onClick={sendViaWhatsApp}
          className="flex-col h-14 gap-0.5 text-[10px] relative"
        >
          <MessageCircle className="w-4 h-4 text-green-600" />
          {sending ? 'Sending…' : 'WhatsApp'}
          {waApiReady && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!mail}
          title={mail ? 'Open mail client with bill link' : 'Customer email required'}
          onClick={() => mail && (window.location.href = mail)}
          className="flex-col h-14 gap-0.5 text-[10px]"
        >
          <Mail className="w-4 h-4 text-blue-600" />
          Email
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCopy}
          className="flex-col h-14 gap-0.5 text-[10px]"
          title="Copy bill link to clipboard"
        >
          <LinkIcon className="w-4 h-4 text-slate-600" />
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowQr((v) => !v)}
          className="flex-col h-14 gap-0.5 text-[10px]"
          title="Customer scans to open their bill"
        >
          <QrCode className="w-4 h-4 text-slate-700" />
          {showQr ? 'Hide QR' : 'Show QR'}
        </Button>
      </div>
      {showQr && (
        <div className="flex flex-col items-center gap-2 py-3 bg-white rounded border">
          <QRCodeSVG value={url} size={180} marginSize={2} />
          <div className="text-[10px] text-slate-600 font-mono break-all text-center px-2 max-w-xs">
            {url}
          </div>
        </div>
      )}
      {!hasPhone && !mail && (
        <div className="text-[11px] text-muted-foreground">
          Tip: capture the customer&apos;s mobile or email next time to unlock WhatsApp /
          email sending. Copy link and QR work for any sale.
        </div>
      )}
      {waApiReady && (
        <div className="text-[11px] text-green-700 dark:text-green-400">
          WhatsApp API connected — sends automatically, no tap needed.
        </div>
      )}
    </div>
  );
}

/**
 * Build a `Sale`-shaped object from offline cart inputs so the success modal,
 * invoice preview and print template work BEFORE the sale has actually
 * synced. The provisional invoice number ("OFFLINE-…") is replaced by the
 * server-assigned number on next sync — but for the customer in front of the
 * cashier right now, this gives them a complete, printable bill.
 */
function synthesizeOfflineSale(
  provisional: string,
  payload: {
    items: { productId: string; quantity: number; discount: number; discountType: 'flat' | 'percent'; unitId?: string }[];
    payments: { mode: PaymentMode; amount: number }[];
    customerInfo?: { name?: string; phone?: string; email?: string; gstNumber?: string; stateCode?: string; address?: string };
    invoiceType: string;
    idempotencyKey: string;
  },
  totals: CartTotals,
  store: StoreInfo | null,
): Sale {
  const now = new Date();
  const cashPaid = (payload.payments || [])
    .filter((p) => ['cash', 'upi', 'card'].includes(p.mode))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const grandTotal = totals.grandTotal;
  const paymentStatus =
    cashPaid + 0.01 >= grandTotal ? 'paid' : cashPaid > 0 ? 'partial' : 'credit';
  return {
    _id: payload.idempotencyKey,
    invoiceNumber: provisional,
    shareToken: payload.idempotencyKey,
    storeId: store?._id || '',
    customerId: '',
    customerSnapshot: {
      name: payload.customerInfo?.name || 'Walk-in Customer',
      phone: payload.customerInfo?.phone || '',
      email: payload.customerInfo?.email || '',
      gstNumber: payload.customerInfo?.gstNumber || '',
      stateCode: payload.customerInfo?.stateCode || store?.stateCode || '',
      address: payload.customerInfo?.address || '',
    },
    placeOfSupply: payload.customerInfo?.stateCode || store?.stateCode || '',
    invoiceType: payload.invoiceType as Sale['invoiceType'],
    items: totals.items,
    subtotal: totals.subtotal,
    totalDiscount: totals.totalDiscount,
    totalTax: totals.totalTax,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
    payments: payload.payments,
    amountPaid: cashPaid,
    change: Math.max(0, cashPaid - grandTotal),
    paymentStatus,
    status: 'completed',
    hasWarranty: false,
    warranties: [],
    createdAt: now.toISOString(),
  };
}
