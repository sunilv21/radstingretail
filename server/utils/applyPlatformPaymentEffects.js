/**
 * Apply the side-effects of confirming a PlatformPayment.
 *
 *   subscription:  org.plan = planCode, org.subscriptionEndsAt extended
 *                  by cycleMonths from max(now, current end), isActive=true
 *   user_addon:    org.customLimits.users.<addonRole> += addonQuantity
 *   manual/other:  no-op (audit row only)
 *
 * Mirrors the logic in
 * POS system-admin/server/routes/payments.routes.js::applyConfirmEffects
 * — kept in sync so PhonePe's auto-confirm on the tenant server gives
 * tenants the same entitlement they'd get from a vendor-confirmed row.
 *
 * Mutates `org` in place; caller saves and invalidates the
 * subscription-guard cache.
 */
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import { AppError } from './response.js';

const ROLES = ['admin', 'manager', 'cashier', 'accountant', 'ca'];
const CYCLE_MONTHS = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
  lifetime: 0,
};

export async function applyPlatformPaymentEffects(payment, org) {
  if (payment.type === 'subscription') {
    if (!payment.planCode) {
      throw new AppError('INVALID_PAYMENT', 'Subscription payment is missing planCode', 400);
    }
    const plan = await SubscriptionPlan.findOne({ code: payment.planCode }).lean();
    const months =
      payment.cycleMonths || CYCLE_MONTHS[plan?.billingCycle] || 1;

    const now = Date.now();
    const currentEnd = org.subscriptionEndsAt
      ? new Date(org.subscriptionEndsAt).getTime()
      : 0;
    const base = currentEnd > now ? currentEnd : now;
    const newEnd =
      months > 0
        ? new Date(base + months * 30 * 86_400_000)
        // Lifetime — push 100 years out.
        : new Date(base + 100 * 365 * 86_400_000);

    if (plan?.code) org.plan = plan.tier || plan.code;
    org.subscriptionEndsAt = newEnd;
    org.subscriptionStartedAt = org.subscriptionStartedAt || new Date();
    org.monthlyAmount = plan?.effectiveMonthlyAmount || org.monthlyAmount;
    org.isActive = true;
    return;
  }

  if (payment.type === 'user_addon') {
    if (!payment.addonRole || !ROLES.includes(payment.addonRole)) {
      throw new AppError('INVALID_PAYMENT', 'User-addon payment has no role', 400);
    }
    const qty = Math.max(1, Math.floor(Number(payment.addonQuantity) || 0));
    // Cycle months drives the addon's lifetime. Defaults to 1 (monthly)
    // for legacy payments that don't carry the field.
    const months = Math.max(1, Math.floor(Number(payment.cycleMonths) || 1));
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + months * 30 * 86_400_000);

    org.userAddons = org.userAddons || [];
    org.userAddons.push({
      role: payment.addonRole,
      quantity: qty,
      cycleMonths: months,
      startsAt,
      expiresAt,
      amountPaid: Number(payment.amount) || 0,
      currency: payment.currency || 'INR',
      paymentReference: payment.reference || '',
      addedBy: payment.confirmedByName || payment.initiatedByName || '',
    });
    org.markModified('userAddons');
    return;
  }

  // 'manual' / 'other' — vendor-recorded audit row, no entitlement change.
}
