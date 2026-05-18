'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, HelpCircle, XCircle, Search } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

/**
 * Type-ahead HSN/SAC picker with live verification.
 *
 * - Hits `GET /api/v1/hsn?q=<query>` for suggestions (debounced 200 ms).
 * - On selection, fills the code and — if `onRateSuggest` is provided —
 *   offers the prescribed GST rate to the parent (typical use: auto-set
 *   the product's gstRate from the chosen HSN).
 * - Shows a status pill next to the field: Verified / Rate mismatch /
 *   Unknown / Invalid. Driven by `GET /api/v1/hsn/:code` (one call per
 *   committed value).
 */
interface HsnEntry {
  code: string;
  kind: 'hsn' | 'sac';
  description: string;
  gstRate: number;
}

interface HsnLookupResponse {
  code: string;
  format: { valid: boolean; kind: 'hsn' | 'sac' | null; digits: number; reason?: string };
  entries: HsnEntry[];
  prescribedRates: number[];
}

type Status = 'idle' | 'verified' | 'rate_mismatch' | 'unknown' | 'invalid' | 'missing';

export interface HsnAutocompleteProps {
  value: string;
  onChange: (next: string) => void;
  /** Optional: parent receives a suggested rate when the user picks from
   *  the dropdown or when the master returns exactly one prescribed rate. */
  onRateSuggest?: (rate: number) => void;
  /** Current product GST rate (drives the rate-mismatch warning). */
  appliedRate?: number;
  placeholder?: string;
  /** Disable autocomplete + verification (e.g. read-only mode). */
  disabled?: boolean;
}

const STATUS_META: Record<
  Status,
  { label: string; tone: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  idle: { label: '', tone: '', Icon: HelpCircle },
  verified: {
    label: 'Verified',
    tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    Icon: CheckCircle2,
  },
  rate_mismatch: {
    label: 'Rate mismatch',
    tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    Icon: AlertTriangle,
  },
  unknown: {
    label: 'Unknown HSN',
    tone: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300',
    Icon: HelpCircle,
  },
  invalid: {
    label: 'Invalid format',
    tone: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    Icon: XCircle,
  },
  missing: { label: '', tone: '', Icon: HelpCircle },
};

export default function HsnAutocomplete({
  value,
  onChange,
  onRateSuggest,
  appliedRate,
  placeholder = 'Type 4–8 digits or search by name (e.g. "soap", "8517")',
  disabled,
}: HsnAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<HsnEntry[]>([]);
  const [verification, setVerification] = useState<HsnLookupResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search — kicks in after 200ms of idle typing.
  useEffect(() => {
    if (disabled) return;
    const q = value.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get<{ matches: HsnEntry[] }>(
          `/hsn?q=${encodeURIComponent(q)}&limit=15`,
        );
        setSuggestions(res.matches || []);
      } catch (err) {
        if (!(err instanceof ApiError)) console.error('HSN search failed', err);
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [value, disabled]);

  // Verify on commit (blur or when value stabilises). Uses the same debounce
  // window so we don't fire two requests per keystroke.
  useEffect(() => {
    if (disabled) return;
    if (!value.trim()) {
      setVerification(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.get<HsnLookupResponse>(
          `/hsn/${encodeURIComponent(value.trim())}`,
        );
        setVerification(res);
      } catch {
        setVerification(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [value, disabled]);

  // Compute current status from verification + applied rate.
  const status: Status = useMemo(() => {
    if (!value.trim()) return 'missing';
    if (!verification) return 'idle';
    if (!verification.format.valid) return 'invalid';
    if (verification.entries.length === 0) return 'unknown';
    if (
      appliedRate !== undefined &&
      verification.prescribedRates.length > 0 &&
      !verification.prescribedRates.includes(Number(appliedRate))
    ) {
      return 'rate_mismatch';
    }
    return 'verified';
  }, [value, verification, appliedRate]);

  // Click-outside to close the suggestions panel.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pickSuggestion = (entry: HsnEntry) => {
    onChange(entry.code);
    onRateSuggest?.(entry.gstRate);
    setOpen(false);
  };

  const meta = STATUS_META[status];

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value.toUpperCase().replace(/[^0-9]/g, ''));
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-9 font-mono"
          maxLength={8}
        />
        <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>

      {meta.label && (
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="secondary" className={`${meta.tone} border-transparent`}>
            <meta.Icon className="w-3 h-3 mr-1" />
            {meta.label}
          </Badge>
          {verification?.entries[0] && (
            <span className="text-[11px] text-muted-foreground truncate">
              {verification.entries[0].description} · prescribed{' '}
              <strong>
                {verification.prescribedRates.length === 1
                  ? `${verification.prescribedRates[0]}%`
                  : verification.prescribedRates.map((r) => `${r}%`).join(' / ')}
              </strong>
              {status === 'rate_mismatch' && appliedRate !== undefined && (
                <>
                  {' '}
                  · you set <strong>{appliedRate}%</strong>
                </>
              )}
            </span>
          )}
          {status === 'rate_mismatch' && onRateSuggest && verification?.prescribedRates[0] !== undefined && (
            <button
              type="button"
              onClick={() => onRateSuggest(verification.prescribedRates[0])}
              className="text-[11px] text-blue-600 hover:underline"
            >
              Apply {verification.prescribedRates[0]}%
            </button>
          )}
        </div>
      )}

      {open && !disabled && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-md border bg-popover shadow-lg">
          {searching && (
            <div className="px-3 py-1.5 text-[11px] text-muted-foreground">Searching…</div>
          )}
          {suggestions.map((s, idx) => (
            <button
              key={`${s.code}-${s.gstRate}-${idx}`}
              type="button"
              onClick={() => pickSuggestion(s)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
            >
              <span className="font-mono font-semibold w-16 shrink-0">{s.code}</span>
              <span className="flex-1 truncate">{s.description}</span>
              <Badge
                variant="outline"
                className="text-[10px] shrink-0 bg-slate-100 dark:bg-slate-900"
              >
                {s.gstRate}% {s.kind === 'sac' ? 'SAC' : 'HSN'}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
