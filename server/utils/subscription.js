/**
 * Subscription helpers — single source of truth for "what state is this
 * tenant in" so server enforcement and the vendor dashboard agree.
 *
 * Priority order:
 *   1. isActive === false  → 'blocked'  (vendor hard-block, overrides dates)
 *   2. paid (subscriptionEndsAt > now)  → 'active'
 *   3. trial  (trialEndsAt > now and no active paid sub) → 'trial'
 *   4. otherwise → 'expired'
 */

export function deriveSubscriptionStatus(org, now = Date.now()) {
  if (!org) return 'expired';
  if (org.isActive === false) return 'blocked';
  const subEnd = org.subscriptionEndsAt ? new Date(org.subscriptionEndsAt).getTime() : 0;
  const trialEnd = org.trialEndsAt ? new Date(org.trialEndsAt).getTime() : 0;
  if (subEnd > now) return 'active';
  if (trialEnd > now) return 'trial';
  return 'expired';
}

/** Is this status one that should grant the tenant access? */
export function isActiveStatus(status) {
  return status === 'active' || status === 'trial';
}

/** Days left until status changes. Returns null if no clock is ticking. */
export function daysRemaining(org, now = Date.now()) {
  if (!org) return null;
  const status = deriveSubscriptionStatus(org, now);
  let endTs = 0;
  if (status === 'active') endTs = new Date(org.subscriptionEndsAt).getTime();
  else if (status === 'trial') endTs = new Date(org.trialEndsAt).getTime();
  else return null;
  const ms = endTs - now;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** A trimmed, public-safe view of subscription state for API responses. */
export function subscriptionView(org) {
  const status = deriveSubscriptionStatus(org);
  return {
    status,
    plan: org.plan || 'free',
    trialEndsAt: org.trialEndsAt || null,
    subscriptionStartedAt: org.subscriptionStartedAt || null,
    subscriptionEndsAt: org.subscriptionEndsAt || null,
    monthlyAmount: org.monthlyAmount || 0,
    daysRemaining: daysRemaining(org),
    isAccessAllowed: isActiveStatus(status),
  };
}
