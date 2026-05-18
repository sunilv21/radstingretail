/**
 * Seed the SubscriptionPlan catalogue with the standard tier set.
 *
 *   node server/scripts/seed-plans.js              additive — only inserts missing plans
 *   node server/scripts/seed-plans.js --update     upsert — refresh existing rows too
 *   node server/scripts/seed-plans.js --reset      drop every plan first, then re-insert
 *
 * Pricing structure (all INR):
 *
 *                        Monthly      Yearly (12 mo, ~17% off)   2 Year (24 mo, ~25% off)
 *   Free                 ₹0           —                           —
 *   Starter              ₹1,499       ₹14,990  (10 × monthly)     ₹26,990  (18 × monthly)
 *   Pro                  ₹2,499       ₹24,990                     ₹44,990
 *   Enterprise           ₹4,999       ₹49,990                     ₹89,990
 *
 *   Yearly = pay 10 months get 12 (~17% off / 2 months free)
 *   2 Year = pay 18 months get 24 (~25% off / 6 months free)
 *
 * Limits stay in lockstep with PLAN_LIMITS in
 * server/utils/planLimits.js so getEffectiveLimits() returns the same
 * caps whether or not a plan row exists.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(envRoot, '.env.local') });
dotenv.config({ path: path.join(envRoot, '.env') });

import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';

const RESET = process.argv.includes('--reset');
const UPDATE = process.argv.includes('--update');

const STARTER_LIMITS = {
  stores: 2,
  warehouses: 0,
  users: { admin: 1, manager: 1, cashier: 1, accountant: 1, ca: 1 },
};
const PRO_LIMITS = {
  stores: 4,
  warehouses: 1,
  users: { admin: 1, manager: 2, cashier: 2, accountant: 2, ca: 1 },
};
const ENTERPRISE_LIMITS = {
  stores: null,
  warehouses: null,
  users: { admin: null, manager: null, cashier: null, accountant: null, ca: null },
};

const STARTER_FEATURES = [
  '2 stores · 5 users (1 each role)',
  'Unlimited GST invoices',
  'GSTR-1 + GSTR-3B reports',
  'Inventory + barcode scan',
  'Customer credit + outstanding tracking',
  'WhatsApp invoice sharing',
  'Email + WhatsApp support',
];
const PRO_FEATURES = [
  '4 stores + 1 warehouse',
  '8 users · multi-role access',
  'Everything in Starter',
  'Inter-store stock transfers',
  'Advanced analytics + insights',
  'Batch + expiry tracking',
  'Priority WhatsApp support',
];
const ENTERPRISE_FEATURES = [
  'Unlimited stores + warehouses',
  'Unlimited users · custom roles',
  'Everything in Pro',
  'E-invoicing + e-way bill ready',
  'Dedicated account manager',
  '24/7 phone + WhatsApp support',
  'Custom integrations',
  'SLA-backed uptime',
];

const ALL_PAYMENT_METHODS = {
  upi: true,
  card: true,
  netbanking: true,
  bankTransfer: true,
  manual: true,
};

const PLANS = [
  // ---------- FREE ----------
  {
    code: 'free',
    name: 'Free',
    description: 'Try the full POS — 1 store, 1 admin, no card needed.',
    tier: 'free',
    price: 0,
    currency: 'INR',
    billingCycle: 'monthly',
    trialDays: null,
    limits: {
      stores: 1,
      warehouses: 0,
      users: { admin: 1, manager: 0, cashier: 0, accountant: 0, ca: 0 },
    },
    features: [
      '1 store · 1 admin user',
      'Unlimited GST invoices',
      'Inventory + barcode scan',
      'Daily sales / stock reports',
      'WhatsApp invoice sharing',
    ],
    paymentMethods: { upi: true, card: false, netbanking: false, bankTransfer: false, manual: true },
    isActive: true,
    isFeatured: false,
    displayOrder: 10,
  },

  // ---------- STARTER (3 cycles) ----------
  {
    code: 'starter-monthly',
    name: 'Starter',
    description: 'Perfect for a small single-branch shop.',
    tier: 'starter',
    price: 1499,
    currency: 'INR',
    billingCycle: 'monthly',
    trialDays: 14,
    limits: STARTER_LIMITS,
    features: STARTER_FEATURES,
    paymentMethods: ALL_PAYMENT_METHODS,
    isActive: true,
    isFeatured: false,
    displayOrder: 20,
  },
  {
    code: 'starter-yearly',
    name: 'Starter — Yearly',
    description: 'Save 17% (2 months free) on the Starter plan.',
    tier: 'starter',
    price: 14990, // 10 × monthly = 17% off
    currency: 'INR',
    billingCycle: 'yearly',
    trialDays: 14,
    limits: STARTER_LIMITS,
    features: [
      'All Starter features',
      'Save ₹2,998 vs paying monthly',
      'Locked-in price for 12 months',
    ],
    paymentMethods: ALL_PAYMENT_METHODS,
    savingsLabel: 'Save 17%',
    isActive: true,
    isFeatured: false,
    displayOrder: 21,
  },
  {
    code: 'starter-2year',
    name: 'Starter — 2 Year',
    description: 'Save 25% (6 months free) when you commit for 2 years.',
    tier: 'starter',
    price: 26990, // 18 × monthly = 25% off
    currency: 'INR',
    billingCycle: '2year',
    trialDays: 14,
    limits: STARTER_LIMITS,
    features: [
      'All Starter features',
      'Save ₹8,986 vs paying monthly',
      'Locked-in price for 24 months',
    ],
    paymentMethods: ALL_PAYMENT_METHODS,
    savingsLabel: 'Save 25%',
    isActive: true,
    isFeatured: false,
    displayOrder: 22,
  },

  // ---------- PRO (3 cycles) ----------
  {
    code: 'pro-monthly',
    name: 'Pro',
    description: 'Best for growing 2–4 branch businesses.',
    tier: 'pro',
    price: 2499,
    currency: 'INR',
    billingCycle: 'monthly',
    trialDays: 14,
    limits: PRO_LIMITS,
    features: PRO_FEATURES,
    paymentMethods: ALL_PAYMENT_METHODS,
    isActive: true,
    isFeatured: true,
    displayOrder: 30,
  },
  {
    code: 'pro-yearly',
    name: 'Pro — Yearly',
    description: 'Save 17% on Pro · 2 months free · best value for growing chains.',
    tier: 'pro',
    price: 24990,
    currency: 'INR',
    billingCycle: 'yearly',
    trialDays: 14,
    limits: PRO_LIMITS,
    features: [
      'All Pro features',
      'Save ₹4,998 vs paying monthly',
      'Locked-in price for 12 months',
    ],
    paymentMethods: ALL_PAYMENT_METHODS,
    savingsLabel: 'Save 17%',
    isActive: true,
    isFeatured: true,
    displayOrder: 31,
  },
  {
    code: 'pro-2year',
    name: 'Pro — 2 Year',
    description: 'Save 25% on Pro for 2 years. Lock in pricing & avoid renewals.',
    tier: 'pro',
    price: 44990,
    currency: 'INR',
    billingCycle: '2year',
    trialDays: 14,
    limits: PRO_LIMITS,
    features: [
      'All Pro features',
      'Save ₹14,986 vs paying monthly',
      'Locked-in price for 24 months',
    ],
    paymentMethods: ALL_PAYMENT_METHODS,
    savingsLabel: 'Save 25%',
    isActive: true,
    isFeatured: true,
    displayOrder: 32,
  },

  // ---------- ENTERPRISE (3 cycles) ----------
  {
    code: 'enterprise-monthly',
    name: 'Enterprise',
    description: 'For multi-state chains. Custom limits, dedicated onboarding.',
    tier: 'enterprise',
    price: 4999,
    currency: 'INR',
    billingCycle: 'monthly',
    trialDays: 30,
    limits: ENTERPRISE_LIMITS,
    features: ENTERPRISE_FEATURES,
    paymentMethods: ALL_PAYMENT_METHODS,
    isActive: true,
    isFeatured: false,
    displayOrder: 40,
  },
  {
    code: 'enterprise-yearly',
    name: 'Enterprise — Yearly',
    description: 'Save 17% on Enterprise · 2 months free.',
    tier: 'enterprise',
    price: 49990,
    currency: 'INR',
    billingCycle: 'yearly',
    trialDays: 30,
    limits: ENTERPRISE_LIMITS,
    features: [
      'All Enterprise features',
      'Save ₹9,998 vs paying monthly',
      'Locked-in price for 12 months',
    ],
    paymentMethods: ALL_PAYMENT_METHODS,
    savingsLabel: 'Save 17%',
    isActive: true,
    isFeatured: false,
    displayOrder: 41,
  },
  {
    code: 'enterprise-2year',
    name: 'Enterprise — 2 Year',
    description: 'Save 25% on Enterprise · 6 months free · best for large chains.',
    tier: 'enterprise',
    price: 89990,
    currency: 'INR',
    billingCycle: '2year',
    trialDays: 30,
    limits: ENTERPRISE_LIMITS,
    features: [
      'All Enterprise features',
      'Save ₹29,986 vs paying monthly',
      'Locked-in price for 24 months',
    ],
    paymentMethods: ALL_PAYMENT_METHODS,
    savingsLabel: 'Save 25%',
    isActive: true,
    isFeatured: false,
    displayOrder: 42,
  },
];

const CYCLE_MONTHS = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
  '2year': 24,
  lifetime: 0,
};

function deriveEffectiveMonthly(price, cycle) {
  const m = CYCLE_MONTHS[cycle] ?? 1;
  if (!m) return 0;
  return Math.round((Number(price) || 0) / m);
}

await connectDB();

if (RESET) {
  const r = await SubscriptionPlan.deleteMany({});
  console.log(`[seed-plans] dropped ${r.deletedCount} existing plans`);
}

let inserted = 0;
let updated = 0;
let skipped = 0;

for (const p of PLANS) {
  const exists = await SubscriptionPlan.findOne({ code: p.code });
  const doc = {
    ...p,
    effectiveMonthlyAmount: deriveEffectiveMonthly(p.price, p.billingCycle),
    paymentUrl: '',
    savingsLabel: p.savingsLabel || '',
  };
  if (!exists) {
    await SubscriptionPlan.create(doc);
    console.log(`  ✓ created ${p.code.padEnd(22)} · ₹${String(p.price).padStart(6)} ${p.billingCycle}`);
    inserted++;
  } else if (UPDATE || RESET) {
    await SubscriptionPlan.updateOne({ code: p.code }, { $set: doc });
    console.log(`  ↻ updated ${p.code.padEnd(22)} · ₹${String(p.price).padStart(6)} ${p.billingCycle}`);
    updated++;
  } else {
    console.log(`  · kept    ${p.code.padEnd(22)} · already exists (use --update to refresh)`);
    skipped++;
  }
}

console.log('');
console.log(`inserted: ${inserted} · updated: ${updated} · kept: ${skipped}`);
console.log('Tenants now see Monthly / Yearly / 2 Year tabs on the Subscription Expired screen.');

await mongoose.disconnect();
process.exit(0);
