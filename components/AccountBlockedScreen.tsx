'use client'

import Image from 'next/image'
import { LogOut, Headphones, Lock, AlertTriangle, ShieldCheck, Building2 } from 'lucide-react'

interface Props {
  organizationName?: string | null
  vendorEmail?: string | null
  vendorPhone?: string | null
  vendorWhatsApp?: string | null
  onLogout: () => void
}

/**
 * Full-screen takeover for tenants whose account has been hard-blocked.
 * Visual treatment: dark hero with red glow on the left and blue glow
 * on the right, centered glass card carrying the Radsting brand mark, a
 * stylised 3D padlock illustration, status chip strip, and two action
 * buttons (vendor contact + logout).
 */
export default function AccountBlockedScreen({
  organizationName,
  vendorEmail,
  vendorPhone,
  vendorWhatsApp,
  onLogout,
}: Props) {
  // Pick the best vendor-contact deeplink. WhatsApp first if number is set
  // (highest response rate in India), then phone, then email.
  const waNumber = (vendorWhatsApp || vendorPhone || '').replace(/[^\d]/g, '')
  const phoneClean = vendorPhone?.replace(/[^\d+]/g, '') || null
  const contactHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        `Hi, my account "${organizationName || ''}" has been blocked. Can you help me reactivate it?`,
      )}`
    : phoneClean
      ? `tel:${phoneClean}`
      : vendorEmail
        ? `mailto:${vendorEmail}?subject=${encodeURIComponent(
            `Account blocked — ${organizationName || ''}`,
          )}`
        : null

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-slate-950 text-slate-100 px-4 py-4 flex items-center justify-center">
      {/* Background ambient glows — red on the left, blue on the right. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-rose-600/30 blur-[120px]" />
        <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-blue-600/30 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 w-[24rem] h-[24rem] rounded-full bg-rose-700/20 blur-[140px]" />
      </div>

      {/* Card — sized to fit any reasonable viewport without scrolling.
          Vertical rhythm tightened so the full layout is visible on a
          ~720px-tall window. */}
      <div
        className="
          relative w-full max-w-3xl rounded-3xl px-7 py-5 md:px-10 md:py-6
          bg-gradient-to-b from-slate-900/70 to-slate-950/80
          backdrop-blur-md
          border border-white/[0.06]
          shadow-[0_40px_120px_-20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.03)_inset]
        "
      >
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="rounded-full bg-white p-1 shadow-[0_0_24px_rgba(255,255,255,0.15)]">
            <Image
              src="/Radsting-logo.png"
              alt="Radsting"
              width={96}
              height={96}
              className="rounded-full"
              priority
            />
          </div>
        </div>

        {/* Padlock illustration */}
        <div className="relative flex items-center justify-center mb-3 h-32">
          {/* Glowing oval halo behind the lock */}
          <div className="absolute inset-x-12 inset-y-2 rounded-full bg-gradient-to-r from-rose-500/40 via-fuchsia-500/30 to-blue-500/30 blur-3xl" />
          <div className="absolute inset-x-20 inset-y-4 rounded-full border border-rose-500/30" />
          <div className="absolute inset-x-24 inset-y-6 rounded-full border border-rose-500/20" />

          {/* Spark dots */}
          <div className="absolute inset-0 pointer-events-none">
            {SPARK_DOTS.map((s, i) => (
              <span
                key={i}
                className="absolute rounded-full bg-rose-300/70"
                style={{
                  left: s.left,
                  top: s.top,
                  width: s.size,
                  height: s.size,
                  boxShadow: '0 0 6px rgba(244,63,94,0.6)',
                }}
              />
            ))}
          </div>

          {/* Stylised 3D padlock */}
          <PadlockIllustration />
        </div>

        {/* Title */}
        <h1 className="text-center font-bold tracking-tight text-3xl md:text-4xl mb-1">
          <span className="text-white">Account </span>
          <span className="bg-gradient-to-r from-rose-400 via-rose-500 to-pink-500 bg-clip-text text-transparent">
            Blocked
          </span>
        </h1>

        {/* Org — standalone pill so the tenant name reads as its own block. */}
        {organizationName && (
          <div className="flex justify-center mb-4">
            <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-rose-500/30 bg-rose-500/10 shadow-[0_0_24px_-6px_rgba(244,63,94,0.45)]">
              <Building2 className="w-5 h-5 text-rose-400" />
              <span className="text-xl font-semibold tracking-tight text-white">
                {organizationName}
              </span>
            </div>
          </div>
        )}

        {/* Description */}
        <p className="text-center text-[13px] leading-relaxed text-slate-400 mb-4 max-w-2xl mx-auto">
          Your POS system access has been blocked by your software vendor. You won&rsquo;t be able
          to perform any transactions or access account features until reactivated.
        </p>

        {/* Status chip strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2 p-2 rounded-2xl border border-white/[0.06] bg-slate-950/50">
          <StatusChip
            icon={<Lock className="w-4 h-4" />}
            iconBg="bg-rose-500/15"
            iconColor="text-rose-400"
            label="Access Status"
            value="Blocked"
            valueColor="text-rose-400"
          />
          <StatusChip
            icon={<AlertTriangle className="w-4 h-4" />}
            iconBg="bg-amber-500/15"
            iconColor="text-amber-400"
            label="Reason"
            value="Vendor Restriction"
            valueColor="text-amber-300"
          />
          <StatusChip
            icon={<ShieldCheck className="w-4 h-4" />}
            iconBg="bg-emerald-500/15"
            iconColor="text-emerald-400"
            label="Data Safety"
            value="Secure & Intact"
            valueColor="text-emerald-300"
          />
        </div>

        {/* Primary CTA — gradient pill */}
        {contactHref ? (
          <a
            href={contactHref}
            target={waNumber ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="
              w-full inline-flex items-center justify-center gap-2.5
              h-12 rounded-xl text-white text-base font-semibold
              bg-gradient-to-r from-rose-500 via-rose-500 to-pink-500
              hover:from-rose-600 hover:via-rose-600 hover:to-pink-600
              shadow-[0_10px_30px_-10px_rgba(244,63,94,0.7)]
              transition-all
            "
          >
            <Headphones className="w-5 h-5" />
            Contact Your Software Vendor
          </a>
        ) : (
          <div className="w-full text-center text-sm text-slate-400 py-2 rounded-xl border border-white/[0.06] bg-slate-950/40">
            Reach out to your software vendor to reactivate this account.
          </div>
        )}



        {/* Logout — outline */}
        <button
          type="button"
          onClick={onLogout}
          className="
            mt-2 w-full inline-flex items-center justify-center gap-2
            h-11 rounded-xl text-white text-base font-medium
            border border-white/10 hover:bg-white/[0.04]
            transition-colors
          "
        >
          <LogOut className="w-5 h-5" />
          Log out
        </button>

        {/* Footer reassurance */}
        <div className="mt-1.5 flex items-start justify-center gap-2 text-center text-[13px] text-slate-400 max-w-lg mx-auto">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <p>
            Your sales history, inventory, and books are{' '}
            <span className="text-emerald-400 font-medium">safe</span> and will be
            available the moment your vendor reactivates the account.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Reusable pill that shows an icon swatch + a tiny uppercase label and a
 * one-line value. Used inside the status strip; tone is opt-in.
 */
function StatusChip({
  icon, iconBg, iconColor, label, value, valueColor,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  value: string
  valueColor: string
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-950/40">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${iconBg} ${iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
          {label}
        </div>
        <div className={`text-sm font-semibold truncate ${valueColor}`}>{value}</div>
      </div>
    </div>
  )
}

/**
 * Stylised SVG padlock — gradient body + shackle, 3D-ish highlight, and a
 * "no entry" badge in the bottom-right. Hand-tuned to match the hero
 * illustration; colour stops match the page accent.
 */
function PadlockIllustration() {
  return (
    <svg
      viewBox="0 0 220 240"
      className="relative h-44 md:h-48 drop-shadow-[0_25px_40px_rgba(244,63,94,0.45)]"
      aria-hidden="true"
    >
      <defs>
        {/* Body gradient: light rose top-left → deep rose-purple bottom-right. */}
        <linearGradient id="padlock-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fda4af" />
          <stop offset="40%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#831843" />
        </linearGradient>
        {/* Shackle: silvery-rose. */}
        <linearGradient id="padlock-shackle" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fda4af" />
          <stop offset="100%" stopColor="#9f1239" />
        </linearGradient>
        {/* Highlight strip running diagonally across the body. */}
        <linearGradient id="padlock-highlight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        {/* Keyhole shadow gradient. */}
        <radialGradient id="keyhole-fill" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#1f0814" />
          <stop offset="100%" stopColor="#0a0205" />
        </radialGradient>
      </defs>

      {/* Shackle (the U-shape on top of the body) */}
      <path
        d="M65 100 L65 70 Q65 30 110 30 Q155 30 155 70 L155 100"
        fill="none"
        stroke="url(#padlock-shackle)"
        strokeWidth="22"
        strokeLinecap="round"
      />
      {/* Shackle inner highlight */}
      <path
        d="M73 100 L73 70 Q73 38 110 38 Q147 38 147 70 L147 100"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Body */}
      <rect x="38" y="95" width="144" height="125" rx="22" fill="url(#padlock-body)" />
      {/* Body diagonal highlight */}
      <path
        d="M38 117 L38 95 Q38 88 50 88 L120 88 Z"
        fill="url(#padlock-highlight)"
        opacity="0.5"
      />
      {/* Subtle inner border */}
      <rect
        x="38"
        y="95"
        width="144"
        height="125"
        rx="22"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1.5"
      />

      {/* Keyhole — circle + slot */}
      <circle cx="110" cy="145" r="16" fill="url(#keyhole-fill)" />
      <path d="M104 145 L116 145 L120 178 L100 178 Z" fill="url(#keyhole-fill)" />

      {/* "No entry" badge — red disk with diagonal slash */}
      <g transform="translate(178 196)">
        <circle r="22" fill="#0b0d12" />
        <circle r="20" fill="#dc2626" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
        <line
          x1="-10"
          y1="10"
          x2="10"
          y2="-10"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

// Static positions for the small spark dots that float around the lock.
// Hand-placed to feel scattered without being distracting.
const SPARK_DOTS = [
  { left: '8%',  top: '20%', size: 4 },
  { left: '15%', top: '60%', size: 3 },
  { left: '22%', top: '85%', size: 2 },
  { left: '78%', top: '15%', size: 3 },
  { left: '85%', top: '50%', size: 4 },
  { left: '92%', top: '78%', size: 2 },
  { left: '50%', top: '8%',  size: 3 },
  { left: '40%', top: '92%', size: 2 },
]
