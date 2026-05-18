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
import { api, ApiError } from '@/lib/api';
import { runOcr } from '@/lib/ocr';
import { extractInvoiceFields, type ExtractedInvoice } from '@/lib/invoice-extractor';

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
  const [progress, setProgress] = useState({ status: '', pct: 0 });
  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(null);
  const [edited, setEdited] = useState<Partial<ExtractedInvoice>>({});
  const [confidence, setConfidence] = useState(0);
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
    setExtracted(null);
    setEdited({});
    setProgress({ status: '', pct: 0 });
    setConfidence(0);
    setScanMs(0);
  };

  const handleFile = async (f: File) => {
    if (!f.type.startsWith('image/')) {
      toast.error('Upload an image (PNG, JPG, JPEG). PDF support coming soon.');
      return;
    }
    setFile(f);
    setImageUrl(URL.createObjectURL(f));
    setStep('scanning');
    setProgress({ status: 'starting', pct: 0 });
    try {
      const ocr = await runOcr(f, (p) => {
        setProgress({ status: p.status, pct: Math.round((p.progress || 0) * 100) });
      });
      setConfidence(ocr.confidence);
      setScanMs(ocr.durationMs);
      const parsed = extractInvoiceFields(ocr.text);
      setExtracted(parsed);
      setStep('review');
      const filled = parsed.confidence.fields;
      const total = parsed.confidence.total;
      if (filled === 0) {
        toast.error('OCR ran but couldn\'t extract any structured fields. Check image clarity.');
      } else {
        toast.success(`Extracted ${filled}/${total} fields · OCR confidence ${ocr.confidence}%`);
      }
    } catch (err) {
      toast.error(`OCR failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      setStep('upload');
    }
  };

  const goCreatePurchase = () => {
    // Persist the extracted draft in sessionStorage so the Purchases page can
    // pre-fill the New PO dialog. The Purchases page picks it up on mount.
    sessionStorage.setItem(
      'ocr-bill-draft',
      JSON.stringify({
        ...edited,
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
            <CardTitle>Upload an invoice image</CardTitle>
            <CardDescription>JPG / PNG / WEBP up to 10 MB. Clearer photos extract more fields.</CardDescription>
          </CardHeader>
          <CardContent>
            <label
              htmlFor="bill-file"
              className="border-2 border-dashed rounded-md p-8 text-center cursor-pointer hover:bg-muted/30 transition block"
            >
              <input
                type="file"
                accept="image/*"
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
                For best results: well-lit, in-focus, fully cropped to the invoice.
              </div>
            </label>
            <div className="mt-4 text-[11px] text-muted-foreground space-y-1 bg-muted/30 rounded p-3">
              <div className="font-semibold uppercase">How it works</div>
              <div>1. Tesseract.js runs in your browser — no upload to any cloud server, your invoice never leaves your machine.</div>
              <div>2. First run downloads ~10 MB of the English language model (one-time).</div>
              <div>3. Recognition takes 5-30 seconds depending on image size + your device.</div>
              <div>4. Extracted fields show side-by-side with the image; you review and click <b>Use this</b> to pre-fill a new Purchase Order.</div>
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
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Invoice preview" className="max-h-96 rounded border w-full object-contain bg-muted" />
              )}
              <div className="space-y-3">
                <div className="text-sm">
                  <div className="text-xs uppercase text-muted-foreground">Status</div>
                  <div className="font-medium capitalize">{progress.status || 'starting'}</div>
                </div>
                <Progress value={progress.pct} />
                <div className="text-xs text-muted-foreground">{progress.pct}% complete</div>
                <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2 mt-3">
                  First scan takes longer because Tesseract downloads the language model.
                  Subsequent scans on this device are 5-10× faster.
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
                    OCR confidence {confidence}% · {extracted.confidence.fields}/{extracted.confidence.total} fields auto-filled · scan took {(scanMs / 1000).toFixed(1)}s.
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
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Invoice" className="max-h-[600px] rounded border w-full object-contain bg-muted" />
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
