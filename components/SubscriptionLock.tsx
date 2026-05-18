'use client'

import { ShieldOff, Hourglass, LogOut, Mail } from 'lucide-react'

interface SubscriptionLockProps {
  status: 'blocked' | 'expired'
  organizationName?: string | null
  daysSinceExpiry?: number | null
  /** Optional vendor contact — surface in the call-to-action when set. */
  vendorEmail?: string | null
  vendorPhone?: string | null
  onLogout: () => void
}

/**
 * Full-screen takeover. Replaces the entire dashboard surface — no
 * sidebar, no menu — when the tenant is hard-blocked or their
 * subscription has expired. The user can only log out from here; every
 * other action requires the vendor to renew/unblock the account.
 *
 * The two states use the same layout but different colour/copy:
 *   - blocked  → rose; "Account suspended"
 *   - expired  → amber; "Subscription expired"
 */
export default function SubscriptionLock({
  status,
  organizationName,
  daysSinceExpiry,
  vendorEmail,
  vendorPhone,
  onLogout,
}: SubscriptionLockProps) {
  const isBlocked = status === 'blocked'

  const headlineColor = isBlocked
    ? 'text-rose-700 dark:text-rose-300'
    : 'text-amber-700 dark:text-amber-300'

  const ringColor = isBlocked
    ? 'bg-rose-100 ring-rose-300 dark:bg-rose-950/30 dark:ring-rose-900'
    : 'bg-amber-100 ring-amber-300 dark:bg-amber-950/30 dark:ring-amber-900'

  const Icon = isBlocked ? ShieldOff : Hourglass

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-lg bg-card border rounded-xl shadow-lg p-8 text-center">
        <div
          className={`w-16 h-16 rounded-full ring-4 mx-auto mb-5 flex items-center justify-center ${ringColor}`}
        >
          <Icon className={`w-8 h-8 ${headlineColor}`} />
        </div>

        <h1 className={`text-2xl font-bold mb-2 ${headlineColor}`}>
          {isBlocked ? 'Account suspended' : 'Subscription expired'}
        </h1>

        {organizationName && (
          <p className="text-sm text-muted-foreground mb-1">
            <b>{organizationName}</b>
          </p>
        )}

        <p className="text-sm text-foreground/80 mb-6 leading-relaxed">
          {isBlocked ? (
            <>
              Your software vendor has paused this account. You can&rsquo;t use the system
              until they reactivate it. Please reach out to them to resolve any pending
              issue.
            </>
          ) : (
            <>
              Your subscription has expired
              {typeof daysSinceExpiry === 'number' && daysSinceExpiry > 0 ? (
                <> {daysSinceExpiry} day{daysSinceExpiry === 1 ? '' : 's'} ago</>
              ) : null}
              . Renew with your software vendor to restore access. All your data is safe
              and waits for you.
            </>
          )}
        </p>

        {(vendorEmail || vendorPhone) && (
          <div className="bg-muted/50 border rounded-md p-3 mb-5 text-sm space-y-1">
            <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wide flex items-center gap-1.5 justify-center">
              <Mail className="w-3.5 h-3.5" />
              Contact your software vendor
            </div>
            {vendorEmail && (
              <div>
                <a className="text-blue-600 hover:underline font-mono" href={`mailto:${vendorEmail}`}>
                  {vendorEmail}
                </a>
              </div>
            )}
            {vendorPhone && (
              <div>
                <a className="text-blue-600 hover:underline font-mono" href={`tel:${vendorPhone}`}>
                  {vendorPhone}
                </a>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border bg-background hover:bg-accent text-sm font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>

        <p className="text-[11px] text-muted-foreground mt-6">
          Your records, sales history, and inventory remain intact. Nothing is deleted
          while your account is in this state.
        </p>
      </div>
    </div>
  )
}
