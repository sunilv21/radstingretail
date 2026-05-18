'use client';

import { useEffect, useRef } from 'react';

interface Options {
  onScan: (code: string) => void;
  minLength?: number;
  maxGapMs?: number;
  enabled?: boolean;
  /**
   * Characters to keep from the keystream. Defaults to typical 1D barcode
   * payloads (digits, letters, dash). Pass a wider regex for QR codes that
   * can encode URLs / punctuation (e.g. /[\x20-\x7E]/).
   */
  charPattern?: RegExp;
}

/**
 * Listens for keyboard-wedge barcode / QR scanners (USB HID). A real scanner
 * types 8–13+ characters within ~50ms and ends with Enter. Human typing is
 * slower, so we only fire onScan when the full sequence looks machine-generated.
 */
export function useBarcodeScanner({
  onScan,
  minLength = 6,
  maxGapMs = 50,
  enabled = true,
  charPattern = /[0-9A-Za-z-]/,
}: Options) {
  const bufferRef = useRef<string>('');
  const lastKeyAtRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function handler(e: KeyboardEvent) {
      // Ignore when focus is in a textarea or a contenteditable element
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;

      const now = performance.now();
      const gap = now - lastKeyAtRef.current;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minLength && gap < maxGapMs * 3) {
          const code = bufferRef.current;
          bufferRef.current = '';
          e.preventDefault();
          onScanRef.current(code);
          return;
        }
        bufferRef.current = '';
        return;
      }

      if (e.key.length === 1 && charPattern.test(e.key)) {
        if (gap > maxGapMs) bufferRef.current = '';
        bufferRef.current += e.key;
        lastKeyAtRef.current = now;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, minLength, maxGapMs, charPattern]);
}
