'use client';

import { forwardRef } from 'react';
import type { Sale, StoreInfo } from '@/lib/types';

interface Props {
  sale: Sale;
  store?: StoreInfo | null;
}

function formatAddress(store?: StoreInfo | null) {
  if (!store?.address) return '';
  const a = store.address;
  return [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
}

/**
 * Live POS preview of the printed bill — kept in lockstep with the thermal
 * 80mm template in `lib/print-invoice.ts`. Reshapes the heading + tax block
 * for: bills of supply (unregistered branch), inter-state vs intra-state
 * supplies, sales returns (credit notes), and e-invoice IRN visibility.
 */
function resolveDocTitle(sale: Sale, store?: StoreInfo | null): string {
  if (sale.status === 'returned') return 'CREDIT NOTE';
  if (store && store.gstRegistered === false) return 'BILL OF SUPPLY';
  const it = sale.invoiceType;
  if (it === 'export_with_payment' || it === 'export_without_payment') return 'EXPORT INVOICE';
  if (it === 'sez_with_payment' || it === 'sez_without_payment') return 'SEZ INVOICE';
  if (it === 'deemed_export') return 'DEEMED EXPORT INVOICE';
  return 'TAX INVOICE';
}

export const InvoicePreview = forwardRef<HTMLDivElement, Props>(function InvoicePreview(
  { sale, store },
  ref,
) {
  const dt = new Date(sale.createdAt);
  const money = (n: number) => `₹${n.toFixed(2)}`;
  const storeName = store?.name || 'Store';
  const storeAddress = formatAddress(store);
  const storeGstin = store?.gstNumber || '';
  const storePhone = store?.phone || '';
  const storeStateCode = store?.stateCode || '';
  const billOfSupply = store?.gstRegistered === false;
  const docTitle = resolveDocTitle(sale, store);
  const rcm = sale.invoiceType === 'reverse_charge';

  // Tax-split context — intra-state when store state === buyer state, else
  // inter-state. No buyer state info → default to intra (POS walk-in).
  const buyerState = (sale.customerSnapshot?.stateCode || '').trim() || sale.placeOfSupply || '';
  const intraState = buyerState && storeStateCode ? buyerState === storeStateCode : true;
  const cgstTotal = sale.items.reduce((s, it) => s + Number(it.cgst || 0), 0);
  const sgstTotal = sale.items.reduce((s, it) => s + Number(it.sgst || 0), 0);
  const igstTotal = sale.items.reduce((s, it) => s + Number(it.igst || 0), 0);

  const logoSrc = store?.logoUrl && store.logoUrl.trim() ? store.logoUrl : null;

  return (
    <div
      ref={ref}
      className="bg-white text-slate-900 p-6 text-[11px] font-mono w-[300px] mx-auto print:p-0 print:w-full"
    >
      <div className="text-center mb-2">
        {logoSrc ? (
          <div className="flex justify-center mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt={storeName}
              style={{ maxHeight: 56, maxWidth: 180, objectFit: 'contain' }}
            />
          </div>
        ) : null}
        <div className="text-base font-bold uppercase">{storeName}</div>
        {storeAddress ? <div className="text-[10px]">{storeAddress}</div> : null}
        {storeGstin && !billOfSupply ? (
          <div className="text-[10px]">
            GSTIN: {storeGstin}
            {storeStateCode ? ` · State: ${storeStateCode}` : ''}
          </div>
        ) : null}
        {storePhone ? <div className="text-[10px]">Ph: {storePhone}</div> : null}
        <div className="text-[10px] mt-1 font-bold">
          {docTitle}
          {sale.hasWarranty ? ' (WARRANTY)' : ''}
        </div>
        {rcm ? (
          <div className="text-[9px] text-rose-700">Reverse charge applicable</div>
        ) : null}
      </div>

      <div className="border-t border-b border-dashed border-slate-400 py-1 my-1 text-[10px]">
        <div className="flex justify-between">
          <span>Invoice:</span>
          <span className="font-bold">{sale.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{dt.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer:</span>
          <span>{sale.customerSnapshot.name || 'Walk-in'}</span>
        </div>
        {sale.customerSnapshot.phone ? (
          <div className="flex justify-between">
            <span>Phone:</span>
            <span>{sale.customerSnapshot.phone}</span>
          </div>
        ) : null}
        {sale.customerSnapshot.address ? (
          <div>
            <span>Addr: </span>
            <span>{sale.customerSnapshot.address}</span>
          </div>
        ) : null}
        {sale.customerSnapshot.gstNumber && !billOfSupply ? (
          <div className="flex justify-between">
            <span>Buyer GSTIN:</span>
            <span>{sale.customerSnapshot.gstNumber}</span>
          </div>
        ) : null}
        {!billOfSupply && (sale.placeOfSupply || buyerState) ? (
          <div className="flex justify-between">
            <span>Place of supply:</span>
            <span>{sale.placeOfSupply || buyerState}</span>
          </div>
        ) : null}
      </div>

      <table className="w-full text-[10px] mb-2">
        <thead>
          <tr className="border-b border-dashed border-slate-400">
            <th className="text-left py-1">Item</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Rate</th>
            <th className="text-right">Amt</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it, i) => (
            <tr key={i} className="align-top">
              <td className="py-0.5">
                <div>{it.productSnapshot.name}</div>
                <div className="text-[9px] text-slate-500">
                  HSN {it.productSnapshot.hsnCode}
                  {!billOfSupply ? ` · GST ${it.gstRate}%` : ''}
                  {it.warrantyMonths ? ` · ${it.warrantyMonths}m warranty` : ''}
                </div>
              </td>
              <td className="text-right">{it.quantity}</td>
              <td className="text-right">{it.sellingPrice.toFixed(2)}</td>
              <td className="text-right">{it.totalAmount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-dashed border-slate-400 pt-1 text-[10px] space-y-0.5">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(sale.subtotal)}</span>
        </div>
        {sale.totalDiscount > 0 ? (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-{money(sale.totalDiscount)}</span>
          </div>
        ) : null}
        {!billOfSupply ? (
          intraState ? (
            <>
              <div className="flex justify-between">
                <span>CGST</span>
                <span>{money(cgstTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST</span>
                <span>{money(sgstTotal)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span>IGST</span>
              <span>{money(igstTotal)}</span>
            </div>
          )
        ) : null}
        {sale.roundOff !== 0 ? (
          <div className="flex justify-between">
            <span>Round-off</span>
            <span>{sale.roundOff.toFixed(2)}</span>
          </div>
        ) : null}
        <div className="flex justify-between font-bold text-[12px] border-t border-dashed border-slate-400 pt-1 mt-1">
          <span>TOTAL</span>
          <span>{money(sale.grandTotal)}</span>
        </div>
      </div>

      {/* E-invoice IRN block — only when present and the branch is
          GST-registered (e-invoice doesn't apply to a bill of supply). */}
      {sale.eInvoice?.irn && !billOfSupply ? (
        <div className="border-t border-dashed border-slate-400 pt-1 mt-2 text-[9px] leading-tight">
          <div>
            <span className="font-semibold">IRN:</span>{' '}
            <span className="break-all">{sale.eInvoice.irn}</span>
          </div>
          {sale.eInvoice.ackNo ? (
            <div className="flex justify-between">
              <span>Ack No:</span>
              <span>{sale.eInvoice.ackNo}</span>
            </div>
          ) : null}
          {sale.eInvoice.ackDate ? (
            <div className="flex justify-between">
              <span>Ack Date:</span>
              <span>{sale.eInvoice.ackDate}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* E-way bill — printed only when one was generated for this sale. */}
      {sale.eWayBill?.ewbNumber && !billOfSupply ? (
        <div className="border-t border-dashed border-slate-400 pt-1 mt-2 text-[9px]">
          <div className="flex justify-between">
            <span>EWB No:</span>
            <span>{sale.eWayBill.ewbNumber}</span>
          </div>
          {sale.eWayBill.ewbDate ? (
            <div className="flex justify-between">
              <span>EWB Date:</span>
              <span>{sale.eWayBill.ewbDate}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-dashed border-slate-400 pt-1 mt-2 text-[10px]">
        {sale.payments.map((p, i) => (
          <div className="flex justify-between" key={i}>
            <span className="uppercase">{p.mode}</span>
            <span>{money(p.amount)}</span>
          </div>
        ))}
        {sale.change > 0 ? (
          <div className="flex justify-between font-bold">
            <span>Change</span>
            <span>{money(sale.change)}</span>
          </div>
        ) : null}
      </div>

      {sale.hasWarranty && sale.warranties && sale.warranties.length > 0 ? (
        <div className="border-t border-b border-dashed border-slate-400 py-1 my-2 text-[10px]">
          <div className="font-bold text-[11px] mb-1">WARRANTY</div>
          {sale.warranties.map((w, i) => (
            <div key={i} className="mb-0.5">
              <div>
                {w.productName} × {w.quantity}
              </div>
              <div className="text-[9px] text-slate-600">
                {w.warrantyMonths} months · valid till{' '}
                {new Date(w.expiresAt).toLocaleDateString('en-IN')}
              </div>
            </div>
          ))}
          <div className="text-[9px] mt-1 text-slate-600">
            Please retain this invoice for warranty claims.
          </div>
        </div>
      ) : null}

      <div className="text-center text-[10px] mt-3 pt-2 border-t border-dashed border-slate-400">
        {store?.settings?.invoiceFooter && store.settings.invoiceFooter.trim() ? (
          <div className="whitespace-pre-wrap">{store.settings.invoiceFooter}</div>
        ) : (
          <>
            Thank you for your purchase!
            <div className="mt-1">*** Goods once sold cannot be returned ***</div>
          </>
        )}
      </div>
    </div>
  );
});
