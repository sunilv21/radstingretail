/**
 * Pre-built reminder messages for collections, escalating by aging bucket.
 * Returns plain-text bodies suitable for WhatsApp, with embedded UPI deep
 * link when the store has a UPI VPA configured.
 */

import type { StoreInfo } from './types';

export type ReminderTone = 'friendly' | 'firm' | 'final';

export interface DuesSummary {
  customerName: string;
  customerPhone?: string;
  totalDue: number;
  invoices: { invoiceNumber: string; due: number; ageDays: number }[];
}

/**
 * UPI deep link per the NPCI spec. Opens any UPI app on the customer's phone
 * (PhonePe / GPay / Paytm / BHIM) with payee + amount + note pre-filled.
 *
 * Spec: upi://pay?pa=<vpa>&pn=<name>&am=<amt>&cu=INR&tn=<note>
 */
export function buildUpiLink(opts: {
  vpa: string;
  payeeName: string;
  amount?: number;
  note?: string;
}): string {
  const params = new URLSearchParams();
  params.set('pa', opts.vpa);
  params.set('pn', opts.payeeName);
  if (opts.amount && opts.amount > 0) params.set('am', opts.amount.toFixed(2));
  params.set('cu', 'INR');
  if (opts.note) params.set('tn', opts.note.slice(0, 50));
  return `upi://pay?${params.toString()}`;
}

/** Pick the right tone for a given aging bucket. */
export function toneForBucket(bucket: '0-30' | '31-60' | '61-90' | '90+'): ReminderTone {
  if (bucket === '0-30') return 'friendly';
  if (bucket === '31-60' || bucket === '61-90') return 'firm';
  return 'final';
}

/**
 * Build a reminder message body.
 * Multiple invoices are rolled into a bulleted list; the UPI link uses
 * the total due amount.
 */
export function buildReminderMessage(
  tone: ReminderTone,
  dues: DuesSummary,
  store: StoreInfo,
): string {
  const storeName = store.name || 'our store';
  const greeting = `Hi ${dues.customerName || 'there'},`;

  const heading = {
    friendly: `Friendly reminder — there's a pending balance on your account.`,
    firm: `Reminder: your account has overdue invoices that need attention.`,
    final: `IMPORTANT — your account is significantly overdue. Please settle to avoid further action.`,
  }[tone];

  const invoiceLines = dues.invoices
    .slice()
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 8) // cap message length
    .map(
      (inv) =>
        `· ${inv.invoiceNumber} — ₹${inv.due.toFixed(2)} (${inv.ageDays} day${inv.ageDays === 1 ? '' : 's'} overdue)`,
    )
    .join('\n');
  const moreNote = dues.invoices.length > 8 ? `\n…and ${dues.invoices.length - 8} more` : '';

  const upi = (store.upiId || '').trim();
  const upiBlock = upi
    ? `\n\nPay now via UPI:\n${buildUpiLink({
        vpa: upi,
        payeeName: storeName,
        amount: dues.totalDue,
        note: `Payment to ${storeName}`,
      })}\n(Open this link on your phone — your UPI app will pre-fill payee + amount.)`
    : '';

  const closer = {
    friendly: `Could you please settle this when convenient? Reply to this message if there's any query.`,
    firm: `Please clear the dues at the earliest. If payment has already been made, kindly share the reference.`,
    final: `Please settle within 7 days. Continued non-payment may impact future credit and result in formal recovery action.`,
  }[tone];

  return [
    greeting,
    '',
    heading,
    '',
    `Total due: ₹${dues.totalDue.toFixed(2)}`,
    '',
    invoiceLines + moreNote,
    upiBlock,
    '',
    closer,
    '',
    `— ${storeName}`,
  ].join('\n');
}

/** Default-tone resolver based on the customer's worst-aged invoice. */
export function pickToneFromDues(dues: DuesSummary): ReminderTone {
  const worst = dues.invoices.reduce((m, i) => Math.max(m, i.ageDays), 0);
  if (worst > 90) return 'final';
  if (worst > 30) return 'firm';
  return 'friendly';
}
