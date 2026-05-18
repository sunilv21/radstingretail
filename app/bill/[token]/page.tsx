'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Printer, FileText, ShieldCheck } from 'lucide-react';
import type { Sale, StoreInfo } from '@/lib/types';
import { API_BASE } from '@/lib/api';
import { InvoicePreview } from '@/components/pos/InvoicePreview';
import { printInvoice } from '@/lib/print-invoice';

export default function PublicBillPage() {
  const params = useParams<{ token: string }>();
  const [sale, setSale] = useState<Sale | null>(null);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/bill/${params.token}`);
        const body = await res.json();
        if (!res.ok || !body?.success) {
          setError(body?.error?.message || 'Bill not found');
          return;
        }
        setSale(body.data.sale);
        setStore(body.data.store);
      } catch (err) {
        setError('Could not reach the server');
      }
    })();
  }, [params.token]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <h1 className="text-xl font-bold mb-2">Bill not found</h1>
            <p className="text-sm text-muted-foreground">
              This bill link is invalid or has been revoked. Please contact the store for help.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-sm text-muted-foreground">Loading your bill…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/Radsting.svg" alt="Radsting" width={28} height={28} />
            <div className="text-xs text-muted-foreground">
              Bill powered by <b>Radsting POS</b>
            </div>
          </div>
          {sale.hasWarranty && (
            <div className="flex items-center gap-1 text-xs text-amber-700 font-semibold bg-amber-100 px-2 py-1 rounded">
              <ShieldCheck className="w-3 h-3" /> Warranty
            </div>
          )}
        </div>

        <Card>
          <CardContent className="p-4">
            <InvoicePreview sale={sale} store={store} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => printInvoice(sale, store, 'thermal')}
            className="h-12"
          >
            <Printer className="w-4 h-4 mr-1" /> Print 80mm
          </Button>
          <Button
            onClick={() => printInvoice(sale, store, 'a4')}
            className="h-12 bg-blue-600 hover:bg-blue-700"
          >
            <FileText className="w-4 h-4 mr-1" /> Save / Print A4
          </Button>
        </div>

        <div className="text-center text-[10px] text-muted-foreground">
          Keep this bill for refunds or warranty claims. Tap &quot;Save / Print A4&quot; and
          choose &quot;Save as PDF&quot; in your browser&apos;s print dialog.
        </div>
      </div>
    </div>
  );
}
