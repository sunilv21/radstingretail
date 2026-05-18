import JsBarcode from 'jsbarcode';
import type { Product } from './types';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function pickBarcodeFormat(code?: string): 'EAN13' | 'EAN8' | 'UPC' | 'CODE128' {
  const v = (code || '').trim();
  if (/^\d{13}$/.test(v)) return 'EAN13';
  if (/^\d{8}$/.test(v)) return 'EAN8';
  if (/^\d{12}$/.test(v)) return 'UPC';
  return 'CODE128';
}

/**
 * Render a barcode to an inline SVG string. JsBarcode draws into an unattached
 * SVG element, we serialise it, then embed it in the print iframe's HTML.
 */
function renderBarcodeSvg(value: string, format: 'EAN13' | 'EAN8' | 'UPC' | 'CODE128'): string {
  if (typeof document === 'undefined') return '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg as unknown as string, value, {
      format,
      height: 40,
      width: 1.4,
      fontSize: 10,
      margin: 0,
      displayValue: true,
    });
  } catch {
    return '<div style="font-size:9px;color:#900;">(invalid barcode)</div>';
  }
  return new XMLSerializer().serializeToString(svg);
}

export function labelsHtml(product: Product, copies: number): string {
  const barcodeSvg = renderBarcodeSvg(
    product.barcode || '0',
    pickBarcodeFormat(product.barcode),
  );
  const single = `
    <div class="label">
      <div class="name">${esc(product.name)}</div>
      ${product.brand ? `<div class="brand">${esc(product.brand)}</div>` : ''}
      <div class="bc">${barcodeSvg}</div>
      <div class="price">₹${product.sellingPrice.toFixed(2)}</div>
      <div class="sku">SKU ${esc(product.sku)}</div>
    </div>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Labels — ${esc(product.name)}</title>
<style>
  @page { size: A4; margin: 8mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111;
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .label { border: 1px dashed #bbb; border-radius: 3px; padding: 6px;
    text-align: center; page-break-inside: avoid; break-inside: avoid; }
  .label .name { font-size: 10px; font-weight: 700;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .label .brand { font-size: 9px; color: #666; }
  .label .bc { margin: 3px 0; display: flex; justify-content: center; }
  .label .bc svg { max-width: 100%; height: auto; }
  .label .price { font-size: 11px; font-weight: 700; margin-top: 2px; }
  .label .sku { font-size: 8px; color: #555; }
</style>
</head>
<body>
  <div class="sheet">
    ${Array.from({ length: Math.max(1, copies) }).map(() => single).join('')}
  </div>
  <script>
    window.onload = function () { window.focus(); window.print(); };
  </script>
</body>
</html>`;
}

/** Offscreen iframe print — same pattern as lib/print-invoice.ts. */
function printHtmlInIframe(html: string) {
  if (typeof window === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden',
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.parentNode?.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };
  const win = iframe.contentWindow;
  if (win) {
    win.onafterprint = cleanup;
    setTimeout(cleanup, 30000);
  } else {
    setTimeout(cleanup, 30000);
  }
}

export function printLabels(product: Product, copies: number) {
  printHtmlInIframe(labelsHtml(product, copies));
}
