/**
 * OCR runner with a pluggable provider model.
 *
 * Today: Tesseract.js — runs entirely in the browser via WASM, free, no API
 * keys. Accuracy on Indian GST invoices is ~70-85% — good enough as a draft
 * generator, the merchant reviews every field before posting.
 *
 * Later: cloud providers (AWS Textract / Google Vision / Azure OCR) plug in
 * by exposing the same `runOcr(file, opts) → { text, confidence }` shape.
 *
 * Tesseract is dynamically imported so first-render bundle size stays small —
 * users who never scan a bill never download the ~30MB WASM.
 */

export interface OcrResult {
  text: string;
  confidence: number; // 0..100 — Tesseract's per-page confidence
  durationMs: number;
}

export interface OcrProgress {
  status: string;       // 'loading-language', 'recognizing-text', etc.
  progress: number;     // 0..1
}

export type OcrProgressFn = (p: OcrProgress) => void;

export async function runOcr(
  file: File,
  onProgress?: OcrProgressFn,
): Promise<OcrResult> {
  if (typeof window === 'undefined') {
    throw new Error('runOcr must be called in the browser');
  }
  // Lazy import — the entire tesseract.js + WASM only loads on first use.
  const { default: Tesseract } = await import('tesseract.js');
  const t0 = performance.now();

  const result = await Tesseract.recognize(file, 'eng', {
    logger: onProgress
      ? (m) => onProgress({ status: m.status, progress: m.progress })
      : undefined,
  });

  return {
    text: result.data.text,
    confidence: Math.round(result.data.confidence ?? 0),
    durationMs: Math.round(performance.now() - t0),
  };
}
