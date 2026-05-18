import type { Sale, StoreInfo } from './types';

const publicBase = () =>
  process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

export function billShareUrl(token: string): string {
  return `${publicBase()}/bill/${token}`;
}

/** Strip non-digits, ensure country code. India default unless number already starts with +. */
function normalisePhone(phone: string | undefined, defaultCountryCode = '91'): string | null {
  if (!phone) return null;
  let p = phone.trim().replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.length === 10) p = defaultCountryCode + p; // 10-digit Indian number
  if (p.length < 10) return null;
  return p;
}

export function whatsappLink(sale: Sale, store?: StoreInfo | null): string | null {
  const defaultCC = (store?.whatsapp?.defaultCountryCode || '91').replace(/\D/g, '') || '91';
  const phone = normalisePhone(sale.customerSnapshot?.phone, defaultCC);
  if (!phone) return null;
  const name = sale.customerSnapshot?.name || 'Customer';
  const storeName = store?.name || 'our store';
  const url = billShareUrl(sale.shareToken || sale._id);
  const lines = [
    `Hi ${name},`,
    `Thanks for your purchase at ${storeName}!`,
    `Invoice: ${sale.invoiceNumber}`,
    `Total: ₹${sale.grandTotal.toFixed(2)}`,
    sale.hasWarranty ? 'Warranty details are inside — please keep this for future claims.' : '',
    '',
    `View / download your bill: ${url}`,
  ].filter(Boolean);
  const text = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${phone}?text=${text}`;
}

export function mailtoLink(sale: Sale, store?: StoreInfo | null): string | null {
  const email = sale.customerSnapshot?.email;
  if (!email) return null;
  const storeName = store?.name || 'our store';
  const url = billShareUrl(sale.shareToken || sale._id);
  const subject = encodeURIComponent(`${sale.invoiceNumber} — your bill from ${storeName}`);
  const body = encodeURIComponent(
    [
      `Hi ${sale.customerSnapshot?.name || 'there'},`,
      ``,
      `Thanks for your purchase at ${storeName}. Your tax invoice is attached below.`,
      ``,
      `Invoice number: ${sale.invoiceNumber}`,
      `Date: ${new Date(sale.createdAt).toLocaleString('en-IN')}`,
      `Total: ₹${sale.grandTotal.toFixed(2)}`,
      sale.hasWarranty ? '' : '',
      sale.hasWarranty
        ? `\nThis bill includes warranty coverage. Please keep it safe — you'll need it for future claims.`
        : '',
      ``,
      `View or print your bill: ${url}`,
      ``,
      `Regards,`,
      storeName,
    ]
      .filter((l) => l !== undefined)
      .join('\n'),
  );
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
