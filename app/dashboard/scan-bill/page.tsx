'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Camera, Upload, Scan, FileText, CheckCircle2, AlertCircle, RefreshCcw, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { scanBill, isSupportedBillFile, type ScanResult } from '@/lib/bill-scan';
import { isPdf } from '@/lib/pdf-extract';
import {
  extractInvoiceFields,
  type ExtractedInvoice,
  type ExtractedLineItem,
} from '@/lib/invoice-extractor';

interface Supplier {
  _id: string;
  name: string;
  gstNumber?: string;
  phone?: string;
  stateCode?: string;
}

type Step = 'upload' | 'scanning' | 'review';

export default function ScanBillPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isPdfFile, setIsPdfFile] = useState(false);
  const [progress, setProgress] = useState({ status: '', pct: 0 });
  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(null);
  const [edited, setEdited] = useState<Partial<ExtractedInvoice>>({});
  const [lineItems, setLineItems] = useState<ExtractedLineItem[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [scanSource, setScanSource] = useState<ScanResult['source'] | null>(null);
  const [scanMs, setScanMs] = useState(0);

  // Suppliers — for the post-scan "match GSTIN to a known supplier" step.
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  useEffect(() => {
    api.get<Supplier[]>('/suppliers').then(setSuppliers).catch(() => {});
  }, []);

  // Whenever extracted data lands, copy it into the editable buffer so the
  // merchant can adjust before saving.
  useEffect(() => {
    if (extracted) {
      setEdited({
        supplierGstin: extracted.supplierGstin,
        supplierName: extracted.supplierName,
        invoiceNumber: extracted.invoiceNumber,
        invoiceDate: extracted.invoiceDate,
        totalAmount: extracted.totalAmount,
        taxableAmount: extracted.taxableAmount,
        cgst: extracted.cgst,
        sgst: extracted.sgst,
        igst: extracted.igst,
      });
      setLineItems(extracted.lineItems || []);
    }
  }, [extracted]);

  const matchedSupplier = useMemo(() => {
    const gstin = String(edited.supplierGstin || '').toUpperCase();
    if (!gstin) return null;
    return suppliers.find((s) => (s.gstNumber || '').toUpperCase() === gstin) || null;
  }, [edited.supplierGstin, suppliers]);

  const reset = () => {
    setStep('upload');
    setFile(null);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl('');
    setIsPdfFile(false);
    setExtracted(null);
    setEdited({});
    setLineItems([]);
    setProgress({ status: '', pct: 0 });
    setConfidence(0);
    setScanSource(null);
    setScanMs(0);
  };

  const handleFile = async (f: File) => {
    if (!isSupportedBillFile(f)) {
      toast.error('Upload an image (PNG, JPG, WEBP) or a PDF.');
      return;
    }
    const pdf = isPdf(f);
    setFile(f);
    setIsPdfFile(pdf);
    // Images get an inline preview; PDFs we don't render in an <img>.
    setImageUrl(pdf ? '' : URL.createObjectURL(f));
    setStep('scanning');
    setProgress({ status: 'starting', pct: 0 });
    try {
      const scan = await scanBill(f, (p) => {
        setProgress({ status: p.status, pct: Math.round((p.progress || 0) * 100) });
      });
      setConfidence(scan.confidence);
      setScanSource(scan.source);
      setScanMs(scan.durationMs);
      const parsed = extractInvoiceFields(scan.text);
      setExtracted(parsed);
      setStep('review');
      const filled = parsed.confidence.fields;
      const total = parsed.confidence.total;
      const nItems = parsed.lineItems.length;
      if (filled === 0 && nItems === 0) {
        toast.error('Couldn\'t extract any fields. For a photo, try a clearer, well-lit image; for a scanned PDF, a higher-resolution scan.');
      } else {
        const src =
          scan.source === 'pdf-text'
            ? 'read directly from PDF text'
            : scan.source === 'pdf-ocr'
              ? 'OCR\'d from scanned PDF'
              : `OCR'd · ${scan.confidence}% confidence`;
        toast.success(`Extracted ${filled}/${total} header fields + ${nItems} line item${nItems === 1 ? '' : 's'} · ${src}`);
      }
    } catch (err) {
      toast.error(`Scan failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      setStep('upload');
    }
  };

  // --- Line-item editing helpers ------------------------------------------
  const updateLineItem = (idx: number, patch: Partial<ExtractedLineItem>) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, ...patch } : li)));
  };
  const removeLineItem = (idx: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };
  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { description: '', hsnCode: null, quantity: null, rate: null, amount: null, gstRate: null },
    ]);
  };

  const goCreatePurchase = () => {
    // Persist the extracted draft in sessionStorage so the Purchases page can
    // pre-fill the New PO dialog. The Purchases page picks it up on mount.
    sessionStorage.setItem(
      'ocr-bill-draft',
      JSON.stringify({
        ...edited,
        lineItems: lineItems.filter((li) => li.description.trim()),
        matchedSupplierId: matchedSupplier?._id || null,
        rawText: extracted?.rawText || '',
      }),
    );
    router.push('/dashboard/purchases?from=ocr');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Scan className="w-7 h-7 text-blue-600" />
          Scan Vendor Bill
        </h1>
        <p className="text-muted-foreground mt-1">
          Upload a photo or scan of a supplier&apos;s invoice — the system reads it via OCR,
          extracts GSTIN / invoice / amounts / HSN, and pre-fills a draft Purchase Order for
          your review.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <StepDot label="Upload" active={step === 'upload'} done={step !== 'upload'} />
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <StepDot label="Scanning" active={step === 'scanning'} done={step === 'review'} />
        <ArrowRight className="w-3 h-3 text-muted-foreground" />
        <StepDot label="Review" active={step === 'review'} done={false} />
      </div>

      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Upload an invoice (PDF or image)</CardTitle>
            <CardDescription>PDF, JPG, PNG or WEBP up to 10 MB. Digital PDFs read most accurately.</CardDescription>
          </CardHeader>
          <CardContent>
            <label
              htmlFor="bill-file"
              className="border-2 border-dashed rounded-md p-8 text-center cursor-pointer hover:bg-muted/30 transition block"
            >
              <input
                type="file"
                accept="image/*,application/pdf"
                id="bill-file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Upload className="w-10 h-10 mx-auto mb-3 text-blue-600" />
              <div className="font-medium">Click to upload, or drag a file here</div>
              <div className="text-xs text-muted-foreground mt-1">
                PDF bills are read directly; photos work best well-lit, in-focus and cropped to the invoice.
              </div>
            </label>
            <div className="mt-4 text-[11px] text-muted-foreground space-y-1 bg-muted/30 rounded p-3">
              <div className="font-semibold uppercase">How it works</div>
              <div>1. Everything runs in your browser — no upload to any cloud server, your invoice never leaves your machine.</div>
              <div>2. <b>Digital PDFs</b> (Tally / Zoho / Busy etc.) are read straight from the text layer — near-perfect, instant.</div>
              <div>3. <b>Scanned PDFs &amp; photos</b> are OCR&apos;d (Tesseract); first run downloads a ~10 MB language model, one-time.</div>
              <div>4. Header fields <b>and product line items</b> show for review; edit anything, then pre-fill a new Purchase Order.</div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'scanning' && (
        <Card>
          <CardHeader>
            <CardTitle>Reading the invoice…</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Invoice preview" className="max-h-96 rounded border w-full object-contain bg-muted" />
              ) : (
                <div className="flex flex-col items-center justify-center rounded border bg-muted/40 p-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mb-2" />
                  <div className="text-sm font-medium">{file?.name || 'PDF document'}</div>
                  <div className="text-xs">Reading PDF…</div>
                </div>
              )}
              <div className="space-y-3">
                <div className="text-sm">
                  <div className="text-xs uppercase text-muted-foreground">Status</div>
                  <div className="font-medium capitalize">{(progress.status || 'starting').replace(/-/g, ' ')}</div>
                </div>
                <Progress value={progress.pct} />
                <div className="text-xs text-muted-foreground">{progress.pct}% complete</div>
                <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2 mt-3">
                  {isPdfFile
                    ? 'Digital PDFs read instantly. Scanned PDFs are rendered then OCR\'d, which takes longer.'
                    : 'First scan takes longer because Tesseract downloads the language model. Subsequent scans on this device are 5-10× faster.'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'review' && extracted && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Review extracted fields
                  </CardTitle>
                  <CardDescription>
                    {scanSource === 'pdf-text'
                      ? 'Read directly from the PDF text layer (high accuracy)'
                      : `OCR confidence ${confidence}%`}
                    {' · '}{extracted.confidence.fields}/{extracted.confidence.total} header fields · {lineItems.length} line item{lineItems.length === 1 ? '' : 's'} · {(scanMs / 1000).toFixed(1)}s.
                    Edit anything that&apos;s wrong, then create the Purchase Order.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={reset}>
                  <RefreshCcw className="w-3.5 h-3.5 mr-1" /> Scan another
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Invoice" className="max-h-[600px] rounded border w-full object-contain bg-muted" />
                ) : (
                  <div className="flex flex-col items-center justify-center rounded border bg-muted/40 p-8 text-muted-foreground min-h-40">
                    <FileText className="w-12 h-12 mb-2" />
                    <div className="text-sm font-medium break-all text-center">{file?.name || 'PDF document'}</div>
                    <div className="text-xs mt-1">PDF — preview not shown; check the raw text below.</div>
                  </div>
                )}
                <div className="space-y-3">
                  <FieldRow
                    label="Supplier GSTIN"
                    value={edited.supplierGstin || ''}
                    onChange={(v) => setEdited({ ...edited, supplierGstin: v.toUpperCase() })}
                    placeholder="15-char GSTIN"
                    confidence={extracted.supplierGstin ? 'high' : 'missing'}
                  />
                  {matchedSupplier ? (
                    <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                      ✓ Matched supplier: <b>{matchedSupplier.name}</b>
                    </div>
                  ) : edited.supplierGstin ? (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      No supplier matches this GSTIN — a new supplier will be created when you save the PO.
                    </div>
                  ) : null}
                  <FieldRow
                    label="Supplier name"
                    value={edited.supplierName || ''}
                    onChange={(v) => setEdited({ ...edited, supplierName: v })}
                    confidence={extracted.supplierName ? 'low' : 'missing'}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FieldRow
                      label="Invoice #"
                      value={edited.invoiceNumber || ''}
                      onChange={(v) => setEdited({ ...edited, invoiceNumber: v })}
                      confidence={extracted.invoiceNumber ? 'high' : 'missing'}
                    />
                    <FieldRow
                      label="Date"
                      value={edited.invoiceDate || ''}
                      onChange={(v) => setEdited({ ...edited, invoiceDate: v })}
                      placeholder="YYYY-MM-DD"
                      type="date"
                      confidence={extracted.invoiceDate ? 'high' : 'missing'}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FieldRow
                      label="Taxable amount (₹)"
                      value={edited.taxableAmount?.toString() || ''}
                      onChange={(v) => setEdited({ ...edited, taxableAmount: Number(v) || null })}
                      type="number"
                      confidence={extracted.taxableAmount ? 'high' : 'missing'}
                    />
                    <FieldRow
                      label="Total (₹)"
                      value={edited.totalAmount?.toString() || ''}
                      onChange={(v) => setEdited({ ...edited, totalAmount: Number(v) || null })}
                      type="number"
                      confidence={extracted.totalAmount ? 'high' : 'missing'}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <FieldRow
                      label="CGST"
                      value={edited.cgst?.toString() || ''}
                      onChange={(v) => setEdited({ ...edited, cgst: Number(v) || null })}
                      type="number"
                      confidence={extracted.cgst ? 'high' : 'missing'}
                    />
                    <FieldRow
                      label="SGST"
                      value={edited.sgst?.toString() || ''}
                      onChange={(v) => setEdited({ ...edited, sgst: Number(v) || null })}
                      type="number"
                      confidence={extracted.sgst ? 'high' : 'missing'}
                    />
                    <FieldRow
                      label="IGST"
                      value={edited.igst?.toString() || ''}
                      onChange={(v) => setEdited({ ...edited, igst: Number(v) || null })}
                      type="number"
                      confidence={extracted.igst ? 'high' : 'missing'}
                    />
                  </div>
                  {extracted.hsnCodes.length > 0 && (
                    <div>
                      <Label className="text-xs">HSN codes detected</Label>
                      <div className="flex gap-1 flex-wrap mt-1">
                        {extracted.hsnCodes.map((h) => (
                          <Badge key={h} variant="outline" className="text-[10px] font-mono">{h}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Product line items — full width below the header fields */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <Label className="text-sm font-semibold">Product line items</Label>
                    <p className="text-xs text-muted-foreground">
                      {lineItems.length
                        ? 'Review each row — fix descriptions, quantities and rates the scan got wrong.'
                        : 'No line items detected. Add them manually or fix on the next screen.'}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addLineItem}>+ Add row</Button>
                </div>
                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="p-2 min-w-48">Description</th>
                        <th className="p-2 w-24">HSN</th>
                        <th className="p-2 w-20">Qty</th>
                        <th className="p-2 w-24">Rate</th>
                        <th className="p-2 w-24">Amount</th>
                        <th className="p-2 w-16">GST%</th>
                        <th className="p-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-3 text-center text-muted-foreground">
                            No rows. Click “+ Add row”.
                          </td>
                        </tr>
                      )}
                      {lineItems.map((li, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-1">
                            <Input
                              value={li.description}
                              onChange={(e) => updateLineItem(idx, { description: e.target.value })}
                              className="h-7 text-xs"
                              placeholder="Product name"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              value={li.hsnCode || ''}
                              onChange={(e) => updateLineItem(idx, { hsnCode: e.target.value || null })}
                              className="h-7 text-xs font-mono"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              value={li.quantity?.toString() || ''}
                              onChange={(e) => updateLineItem(idx, { quantity: Number(e.target.value) || null })}
                              className="h-7 text-xs"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              value={li.rate?.toString() || ''}
                              onChange={(e) => updateLineItem(idx, { rate: Number(e.target.value) || null })}
                              className="h-7 text-xs"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              value={li.amount?.toString() || ''}
                              onChange={(e) => updateLineItem(idx, { amount: Number(e.target.value) || null })}
                              className="h-7 text-xs"
                            />
                          </td>
                          <td className="p-1">
                            <Input
                              type="number"
                              value={li.gstRate?.toString() || ''}
                              onChange={(e) => updateLineItem(idx, { gstRate: Number(e.target.value) || null })}
                              className="h-7 text-xs"
                            />
                          </td>
                          <td className="p-1 text-center">
                            <button
                              type="button"
                              onClick={() => removeLineItem(idx)}
                              className="text-red-500 hover:text-red-700 text-sm"
                              title="Remove row"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t pt-3 flex gap-2 justify-end">
                <Button variant="outline" onClick={reset}>Cancel</Button>
                <Button
                  onClick={goCreatePurchase}
                  disabled={!edited.totalAmount}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Use this & create Purchase Order →
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Raw OCR text
              </CardTitle>
              <CardDescription>The text Tesseract pulled out — useful if any field looks wrong.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-[10px] bg-muted/50 p-3 rounded max-h-48 overflow-auto whitespace-pre-wrap font-mono">{extracted.rawText}</pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StepDot({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  const cls = active
    ? 'bg-blue-600 text-white border-blue-600'
    : done
      ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-300'
      : 'bg-muted text-muted-foreground border-border';
  return (
    <div className={`px-2 py-1 rounded border font-medium ${cls}`}>
      {done && !active && '✓ '}
      {label}
    </div>
  );
}

function FieldRow({
  label, value, onChange, type, placeholder, confidence,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; confidence?: 'high' | 'low' | 'missing';
}) {
  const tone = confidence === 'missing' ? 'border-red-300 bg-red-50/30' : confidence === 'low' ? 'border-amber-300' : '';
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {confidence === 'missing' && <span className="text-[10px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />not found</span>}
        {confidence === 'low' && <span className="text-[10px] text-amber-600">low confidence</span>}
      </div>
      <Input
        type={type || 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={tone}
      />
    </div>
  );
}
