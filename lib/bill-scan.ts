/**
 * Unified bill-scan orchestrator.
 *
 * One entry point — `scanBill(file)` — that handles every input the merchant
 * throws at it and always returns plain text for the field extractor:
 *
 *   • Digital PDF  → read the text layer directly (best accuracy, no OCR).
 *   • Scanned PDF  → render pages to images, then OCR them.
 *   • Image (JPG/PNG/WEBP) → preprocess + OCR.
 *
 * The caller doesn't need to know which path ran — `source` on the result
 * says how the text was obtained so the UI can show "read from PDF text" vs
 * "OCR'd" and set expectations on accuracy.
 */

import { extractPdf, isPdf } from './pdf-extract';
import { runOcr, runOcrMulti, type OcrProgressFn } from './ocr';

export interface ScanResult {
  text: string;
  /** How the text was obtained — drives the accuracy hint shown to the user. */
  source: 'pdf-text' | 'pdf-ocr' | 'image-ocr';
  confidence: number; // 0..100. PDF-text is treated as 100 (no OCR guessing).
  durationMs: number;
  pageCount: number;
}

export async function scanBill(
  file: File,
  onProgress?: OcrProgressFn,
): Promise<ScanResult> {
  if (typeof window === 'undefined') {
    throw new Error('scanBill must run in the browser');
  }
  const t0 = performance.now();

  if (isPdf(file)) {
    const pdf = await extractPdf(file, (status, pct) =>
      onProgress?.({ status, progress: pct }),
    );

    if (pdf.kind === 'text') {
      return {
        text: pdf.text,
        source: 'pdf-text',
        confidence: 100, // direct read — no recognition error
        durationMs: Math.round(performance.now() - t0),
        pageCount: pdf.pageCount,
      };
    }

    // Scanned PDF → OCR the rendered page images.
    const ocr = await runOcrMulti(pdf.pageImages, onProgress);
    return {
      text: ocr.text,
      source: 'pdf-ocr',
      confidence: ocr.confidence,
      durationMs: Math.round(performance.now() - t0),
      pageCount: pdf.pageCount,
    };
  }

  // Plain image.
  const ocr = await runOcr(file, onProgress);
  return {
    text: ocr.text,
    source: 'image-ocr',
    confidence: ocr.confidence,
    durationMs: Math.round(performance.now() - t0),
    pageCount: 1,
  };
}

export function isSupportedBillFile(file: File): boolean {
  return file.type.startsWith('image/') || isPdf(file);
}
