/**
 * OCR runner with a pluggable provider model.
 *
 * Today: Tesseract.js — runs entirely in the browser via WASM, free, no API
 * keys. Accuracy on Indian GST invoices is ~70-85% raw; the preprocessing
 * below (grayscale + upscale + adaptive threshold) and the tuned page-seg
 * mode push photos meaningfully higher. The merchant reviews every field
 * before posting, so OCR only needs to be a good draft generator.
 *
 * Later: cloud providers (AWS Textract / Google Vision / Azure OCR) plug in
 * by exposing the same `runOcr(src, opts) → { text, confidence }` shape.
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

/** Anything the OCR engine can read: a File, a Blob (rendered PDF page), or a data/object URL. */
export type OcrSource = File | Blob | string;

// Below this width we upscale — Tesseract is much more accurate at ~1500px+
// on the long edge. Above the cap we leave it (already plenty of detail).
const MIN_UPSCALE_WIDTH = 1500;
const MAX_DIMENSION = 3000;

/**
 * Preprocess an image for OCR: draw to a canvas, upscale small images, convert
 * to grayscale, and apply a light contrast stretch + threshold. Returns a Blob
 * the OCR engine reads. Falls back to the original source on any failure so a
 * preprocessing bug never blocks a scan.
 */
async function preprocessImage(src: OcrSource): Promise<OcrSource> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return src;
  try {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const img = await loadImage(url);
    if (typeof src !== 'string') URL.revokeObjectURL(url);

    let { width, height } = img;
    if (!width || !height) return src;

    // Upscale small images; clamp very large ones.
    let scale = 1;
    if (width < MIN_UPSCALE_WIDTH) scale = MIN_UPSCALE_WIDTH / width;
    const longEdge = Math.max(width, height) * scale;
    if (longEdge > MAX_DIMENSION) scale *= MAX_DIMENSION / longEdge;
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const d = imageData.data;

    // 1) Grayscale + contrast stretch. Build a luma buffer and a histogram.
    let min = 255, max = 0;
    const luma = new Uint8ClampedArray(d.length / 4);
    const hist = new Array<number>(256).fill(0);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      luma[j] = y;
      if (y < min) min = y;
      if (y > max) max = y;
    }
    const range = Math.max(1, max - min);
    for (let j = 0; j < luma.length; j++) {
      const v = Math.round(((luma[j] - min) * 255) / range);
      luma[j] = v;
      hist[v]++;
    }

    // 2) Otsu binarisation. We upscaled first, so thin invoice fonts are now
    // several pixels wide and survive thresholding — Tesseract reads clean
    // black-on-white documents far better than grayscale.
    const threshold = otsuThreshold(hist, luma.length);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const v = luma[j] >= threshold ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob null'))),
        'image/png',
      );
    });
  } catch {
    // Any failure → fall back to the raw source. OCR still runs.
    return src;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image for preprocessing'));
    img.src = url;
  });
}

/**
 * Otsu's method: find the grayscale threshold that maximises between-class
 * variance (i.e. best separates "ink" from "paper"). Standard document-OCR
 * binarisation — adapts per-image instead of a fixed cutoff.
 */
function otsuThreshold(hist: number[], total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

// Page-seg modes tried, in order, when the first pass is low-confidence.
// 6 = single uniform block (best default for dense invoices),
// 4 = single column of variable-size text (good for itemised tables),
// 3 = fully automatic. Keeping interword spaces preserves column gaps the
// line-item parser relies on.
const PSM_PASSES = ['6', '4', '3'];
// Below this Tesseract page confidence we try the next page-seg mode and keep
// whichever pass scored highest.
const RETRY_BELOW_CONFIDENCE = 78;

export async function runOcr(
  src: OcrSource,
  onProgress?: OcrProgressFn,
  opts?: { preprocess?: boolean; adaptive?: boolean },
): Promise<OcrResult> {
  if (typeof window === 'undefined') {
    throw new Error('runOcr must be called in the browser');
  }
  const t0 = performance.now();

  const input =
    opts?.preprocess === false ? src : await preprocessImage(src);

  // Lazy import — the entire tesseract.js + WASM only loads on first use.
  const { default: Tesseract } = await import('tesseract.js');

  const adaptive = opts?.adaptive !== false;
  let best: { text: string; confidence: number } | null = null;

  for (let p = 0; p < (adaptive ? PSM_PASSES.length : 1); p++) {
    const result = await Tesseract.recognize(input, 'eng', {
      logger: onProgress
        ? (m) => onProgress({ status: m.status, progress: m.progress })
        : undefined,
      // @ts-expect-error tesseract.js types don't list these but they pass through.
      tessedit_pageseg_mode: PSM_PASSES[p],
      preserve_interword_spaces: '1',
    });
    const confidence = Math.round(result.data.confidence ?? 0);
    if (!best || confidence > best.confidence) {
      best = { text: result.data.text, confidence };
    }
    // Good enough — stop early, don't burn time on more passes.
    if (confidence >= RETRY_BELOW_CONFIDENCE) break;
  }

  return {
    text: best?.text ?? '',
    confidence: best?.confidence ?? 0,
    durationMs: Math.round(performance.now() - t0),
  };
}

/**
 * OCR several images (e.g. multi-page scanned PDF) and concatenate the text.
 * Confidence is averaged across pages. Progress is reported as the mean over
 * all pages so the UI bar advances smoothly.
 */
export async function runOcrMulti(
  sources: OcrSource[],
  onProgress?: OcrProgressFn,
): Promise<OcrResult> {
  const t0 = performance.now();
  const texts: string[] = [];
  let confSum = 0;
  for (let i = 0; i < sources.length; i++) {
    const res = await runOcr(sources[i], (p) => {
      onProgress?.({
        status: `${p.status} (page ${i + 1}/${sources.length})`,
        progress: (i + (p.progress || 0)) / sources.length,
      });
    });
    texts.push(res.text);
    confSum += res.confidence;
  }
  return {
    text: texts.join('\n\n'),
    confidence: sources.length ? Math.round(confSum / sources.length) : 0,
    durationMs: Math.round(performance.now() - t0),
  };
}
