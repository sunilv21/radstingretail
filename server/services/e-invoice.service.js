/**
 * E-invoice (IRN) + E-way bill — provider-agnostic façade.
 *
 *   mock — Returns deterministic IRN/Ack/base64-QR locally. Use for dev,
 *          demos, training. No network call.
 *   gsp  — Real OAuth2 + Bearer integration via einvoice/gsp-client.js.
 *          Works with ClearTax, IRIS, Masters India, Tally Signer and any
 *          GSP that accepts the NIC schema-v1.1 payload behind an
 *          OAuth2-style auth. Configurable endpoint paths.
 *   nic  — Direct NIC IRP. Scaffolded with full request shapes + AES/RSA
 *          Sek flow documented; not wired (most SMBs don't qualify for
 *          direct API access — use GSP instead).
 *
 * Both `EInvoiceService` and `EWayBillService` are stable surfaces — same
 * shape as before the refactor — so the existing routes
 * `POST /api/v1/sales/:id/einvoice/generate / cancel` and the EWB route
 * keep working without changes.
 */

import crypto from 'crypto';
import Sale from './../models/Sale.js';
import Store from './../models/Store.js';
import { AppError } from './../utils/response.js';
import {
  fetchAuthToken as gspFetchAuthToken,
  testConnection as gspTestConnection,
  generateIrnViaGsp,
  cancelIrnViaGsp,
  generateEwbViaGsp,
  clearTokenCache,
} from './einvoice/gsp-client.js';
import {
  fetchAuthToken as nicFetchAuthToken,
  generateIrn as nicGenerateIrn,
  cancelIrn as nicCancelIrn,
  generateEwb as nicGenerateEwb,
  testConnection as nicTestConnection,
} from './einvoice/nic-direct.js';

// =============================================================================
// Eligibility & helpers
// =============================================================================

function assertEligibleForIrn(sale) {
  if (sale.status === 'returned' || sale.status === 'voided') {
    throw new AppError(
      'EINV_INELIGIBLE',
      'Returns/voided sales cannot have an IRN — issue a credit-note e-invoice instead',
      400,
    );
  }
  const gstin = sale.customerSnapshot?.gstNumber?.trim();
  if (!gstin) {
    throw new AppError(
      'EINV_INELIGIBLE',
      'E-invoice is only required for B2B sales — this sale has no buyer GSTIN',
      400,
    );
  }
  if (sale.eInvoice?.irn) {
    throw new AppError(
      'EINV_ALREADY_EXISTS',
      `IRN already generated: ${sale.eInvoice.irn}`,
      400,
    );
  }
}

// =============================================================================
// NIC schema-v1.1 payload builder
// (Was in this file before; kept here so callers' import path is stable.)
// =============================================================================

export function buildEInvoicePayload(store, sale) {
  const docType =
    sale.invoiceType === 'export_with_payment' || sale.invoiceType === 'export_without_payment'
      ? 'EXP'
      : 'INV';

  const items = (sale.items || []).map((it, idx) => ({
    SlNo: String(idx + 1),
    PrdDesc: it.productSnapshot?.name || '',
    IsServc: 'N',
    HsnCd: it.productSnapshot?.hsnCode || '',
    Qty: Number(it.quantity || 0),
    Unit: (it.unit || 'NOS').toUpperCase().slice(0, 8),
    UnitPrice: round2(it.sellingPrice),
    TotAmt: round2(it.basePrice || it.sellingPrice * it.quantity),
    Discount: round2(it.discountAmount || 0),
    AssAmt: round2(it.taxableAmount || 0),
    GstRt: Number(it.gstRate || 0),
    IgstAmt: round2(it.igst || 0),
    CgstAmt: round2(it.cgst || 0),
    SgstAmt: round2(it.sgst || 0),
    CesAmt: 0,
    StateCesAmt: 0,
    TotItemVal: round2(it.totalAmount || 0),
  }));

  return {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: 'B2B',
      RegRev: sale.invoiceType === 'reverse_charge' ? 'Y' : 'N',
      EcmGstin: null,
      IgstOnIntra: 'N',
    },
    DocDtls: {
      Typ: docType,
      No: sale.invoiceNumber,
      Dt: formatDateDDMMYYYY(sale.createdAt),
    },
    SellerDtls: {
      Gstin: store.gstNumber || '',
      LglNm: store.name,
      Addr1: store.address?.line1 || '',
      Loc: store.address?.city || '',
      Pin: Number(store.address?.pincode || '0'),
      Stcd: String(store.stateCode || ''),
    },
    BuyerDtls: {
      Gstin: sale.customerSnapshot?.gstNumber || '',
      LglNm: sale.customerSnapshot?.name || '',
      Pos: sale.placeOfSupply || store.stateCode || '',
      Addr1: sale.customerSnapshot?.address || '',
      Loc: '',
      Pin: 0,
      Stcd: sale.customerSnapshot?.stateCode || '',
    },
    ItemList: items,
    ValDtls: {
      AssVal: round2(sale.subtotal || 0),
      CgstVal: round2(items.reduce((s, i) => s + i.CgstAmt, 0)),
      SgstVal: round2(items.reduce((s, i) => s + i.SgstAmt, 0)),
      IgstVal: round2(items.reduce((s, i) => s + i.IgstAmt, 0)),
      CesVal: 0,
      StCesVal: 0,
      Discount: round2(sale.totalDiscount || 0),
      OthChrg: 0,
      RndOffAmt: round2(sale.roundOff || 0),
      TotInvVal: round2(sale.grandTotal || 0),
    },
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function formatDateDDMMYYYY(d) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

// =============================================================================
// EWB payload builder (lighter shape than IRN)
// =============================================================================

function buildEwbPayload(store, sale, opts = {}) {
  const items = (sale.items || []).map((it) => ({
    productName: it.productSnapshot?.name || '',
    productDesc: it.productSnapshot?.name || '',
    hsnCode: Number(it.productSnapshot?.hsnCode || 0),
    quantity: Number(it.quantity || 0),
    qtyUnit: (it.unit || 'NOS').toUpperCase().slice(0, 4),
    taxableAmount: round2(it.taxableAmount || 0),
    cgstRate: Number(it.cgst > 0 ? it.gstRate / 2 : 0),
    sgstRate: Number(it.sgst > 0 ? it.gstRate / 2 : 0),
    igstRate: Number(it.igst > 0 ? it.gstRate : 0),
  }));

  return {
    supplyType: 'O', // Outward
    subSupplyType: '1', // Supply
    docType: 'INV',
    docNo: sale.invoiceNumber,
    docDate: formatDateDDMMYYYY(sale.createdAt),
    fromGstin: store.gstNumber || '',
    fromTrdName: store.name || '',
    fromAddr1: store.address?.line1 || '',
    fromPlace: store.address?.city || '',
    fromPincode: Number(store.address?.pincode || 0),
    fromStateCode: Number(store.stateCode || 0),
    toGstin: sale.customerSnapshot?.gstNumber || 'URP',
    toTrdName: sale.customerSnapshot?.name || '',
    toAddr1: sale.customerSnapshot?.address || '',
    toPlace: '',
    toPincode: 0,
    toStateCode: Number(sale.customerSnapshot?.stateCode || store.stateCode || 0),
    transactionType: 1,
    otherValue: 0,
    totalValue: round2(sale.subtotal || 0),
    cgstValue: round2((sale.items || []).reduce((s, i) => s + Number(i.cgst || 0), 0)),
    sgstValue: round2((sale.items || []).reduce((s, i) => s + Number(i.sgst || 0), 0)),
    igstValue: round2((sale.items || []).reduce((s, i) => s + Number(i.igst || 0), 0)),
    cessValue: 0,
    totInvValue: round2(sale.grandTotal || 0),
    transMode: opts.transportMode === 'Rail' ? '2' : '1', // 1=Road, 2=Rail, 3=Air, 4=Ship
    transDistance: Number(opts.distanceKm || 1),
    transporterName: opts.transporterName || '',
    transporterId: opts.transporterId || '',
    vehicleNo: opts.vehicleNumber || '',
    vehicleType: 'R',
    itemList: items,
  };
}

// =============================================================================
// Provider dispatcher
// =============================================================================

const mockProvider = {
  async generate({ store, sale }) {
    const seed = `${store.gstNumber}|${sale.invoiceNumber}|${sale.grandTotal}`;
    const irn = crypto.createHash('sha256').update(seed).digest('hex');
    const ackDate = new Date();
    return {
      irn,
      ackNo: String(Math.floor(Math.random() * 1e15)).padStart(15, '0'),
      ackDate,
      signedQr: Buffer.from(
        JSON.stringify({
          Irn: irn,
          SellerGstin: store.gstNumber,
          BuyerGstin: sale.customerSnapshot?.gstNumber,
          DocNo: sale.invoiceNumber,
          DocTyp: 'INV',
          DocDt: formatDateDDMMYYYY(sale.createdAt),
          TotInvVal: sale.grandTotal,
          ItemCnt: sale.items?.length || 0,
          MainHsnCode: sale.items?.[0]?.productSnapshot?.hsnCode || '',
        }),
      ).toString('base64'),
      provider: 'mock',
    };
  },
  async cancel({ irn }) {
    return { cancelDate: new Date(), provider: 'mock', irn };
  },
  async ewbGenerate({ sale, vehicleNumber, transportMode }) {
    const ewbNumber = String(Math.floor(Math.random() * 1e12)).padStart(12, '0');
    const ewbDate = new Date();
    const validUpto = new Date(ewbDate);
    validUpto.setDate(validUpto.getDate() + 1);
    return {
      ewbNumber,
      ewbDate,
      validUpto,
      vehicleNumber: vehicleNumber || '',
      transportMode: transportMode || 'Road',
      provider: 'mock',
    };
  },
  async testConnection({ store }) {
    return {
      ok: true,
      provider: 'mock',
      environment: store.eInvoice?.environment || 'sandbox',
      message: 'Mock provider — no auth performed.',
    };
  },
};

function selectProvider(store) {
  const p = store.eInvoice?.provider || 'mock';
  if (p === 'nic') return 'nic';
  if (p === 'gsp') return 'gsp';
  return 'mock';
}

// =============================================================================
// Service entry points — preserved API surface
// =============================================================================

export const EInvoiceService = {
  async generate({ storeId, saleId, userId }) {
    void userId;
    const sale = await Sale.findOne({ _id: saleId, storeId });
    if (!sale) throw new AppError('SALE_NOT_FOUND', 'Sale not found', 404);
    const store = await Store.findById(storeId).lean();
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);
    if (!store.eInvoice?.enabled) {
      throw new AppError(
        'EINV_DISABLED',
        'E-invoicing is not enabled. Turn it on in Settings → E-Invoice and pick a provider.',
        400,
      );
    }
    assertEligibleForIrn(sale.toObject());

    const provider = selectProvider(store);
    const payload = buildEInvoicePayload(store, sale.toObject());

    let result;
    if (provider === 'gsp') {
      result = await generateIrnViaGsp(store, payload);
    } else if (provider === 'nic') {
      result = await nicGenerateIrn(store, payload);
    } else {
      result = await mockProvider.generate({ store, sale: sale.toObject() });
    }

    sale.eInvoice = {
      irn: result.irn,
      ackNo: result.ackNo,
      ackDate: result.ackDate,
      signedQr: result.signedQr,
      status: 'active',
      provider,
      generatedAt: new Date(),
    };
    await sale.save();
    return { sale: sale.toObject(), eInvoice: sale.eInvoice };
  },

  async cancel({ storeId, saleId, reason, remarks }) {
    const sale = await Sale.findOne({ _id: saleId, storeId });
    if (!sale) throw new AppError('SALE_NOT_FOUND', 'Sale not found', 404);
    if (!sale.eInvoice?.irn) {
      throw new AppError('EINV_NOT_FOUND', 'No IRN to cancel for this sale', 400);
    }
    if (sale.eInvoice.status === 'cancelled') {
      throw new AppError('EINV_ALREADY_CANCELLED', 'IRN already cancelled', 400);
    }
    const ageMs = Date.now() - new Date(sale.eInvoice.generatedAt).getTime();
    if (ageMs > 24 * 3600 * 1000) {
      throw new AppError(
        'EINV_CANCEL_WINDOW_EXPIRED',
        'IRN can only be cancelled within 24 hours of generation. Issue a credit note instead.',
        400,
      );
    }
    const store = await Store.findById(storeId).lean();
    const provider = selectProvider(store);

    if (provider === 'gsp') {
      await cancelIrnViaGsp(store, {
        irn: sale.eInvoice.irn,
        cancelReason: reason,
        cancelRemarks: remarks,
      });
    } else if (provider === 'nic') {
      await nicCancelIrn(store, {
        irn: sale.eInvoice.irn,
        cancelReason: reason,
        cancelRemarks: remarks,
      });
    } else {
      await mockProvider.cancel({ irn: sale.eInvoice.irn });
    }

    sale.eInvoice.status = 'cancelled';
    sale.eInvoice.cancelledAt = new Date();
    sale.eInvoice.cancelReason = remarks || reason || '';
    await sale.save();
    return { sale: sale.toObject(), eInvoice: sale.eInvoice };
  },

  /**
   * Auth-only test — used by the Settings "Test connection" button.
   * Returns provider + TTL info; never burns an IRN.
   */
  async testConnection({ storeId }) {
    const store = await Store.findById(storeId).lean();
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);
    const provider = selectProvider(store);
    if (provider === 'gsp') {
      // Clear cache so the test always exercises the real auth round-trip
      // (otherwise an existing token would silently make this look healthy).
      clearTokenCache(store);
      return await gspTestConnection(store);
    }
    if (provider === 'nic') {
      try {
        await nicFetchAuthToken(store);
        return { ok: true, provider: 'nic' };
      } catch (err) {
        // The NIC scaffold throws by design — surface the AppError, the
        // caller can show the friendlier "use GSP instead" guidance.
        throw err;
      }
    }
    return await mockProvider.testConnection({ store });
  },
};

// =============================================================================
// EWB service
// =============================================================================

export const EWayBillService = {
  async generate({ storeId, saleId, vehicleNumber, transportMode, transporterId, distanceKm, transporterName, userId }) {
    void userId;
    const sale = await Sale.findOne({ _id: saleId, storeId });
    if (!sale) throw new AppError('SALE_NOT_FOUND', 'Sale not found', 404);
    if (sale.eWayBill?.ewbNumber) {
      throw new AppError(
        'EWB_ALREADY_EXISTS',
        `E-way bill already exists: ${sale.eWayBill.ewbNumber}`,
        400,
      );
    }
    const store = await Store.findById(storeId).lean();
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);

    // Threshold per store setting (default ₹50k).
    const threshold = Number(store.settings?.eWayBillThreshold ?? 50000);
    if (sale.grandTotal < threshold) {
      throw new AppError(
        'EWB_NOT_REQUIRED',
        `E-way bill is mandatory only above ₹${threshold.toLocaleString('en-IN')}. This sale is below threshold.`,
        400,
      );
    }

    const provider = selectProvider(store);
    let result;
    if (provider === 'gsp') {
      const payload = buildEwbPayload(store, sale.toObject(), {
        vehicleNumber,
        transportMode,
        transporterId,
        distanceKm,
        transporterName,
      });
      result = await generateEwbViaGsp(store, payload);
    } else if (provider === 'nic') {
      const payload = buildEwbPayload(store, sale.toObject(), {
        vehicleNumber,
        transportMode,
        transporterId,
        distanceKm,
        transporterName,
      });
      result = await nicGenerateEwb(store, payload);
    } else {
      result = await mockProvider.ewbGenerate({
        sale: sale.toObject(),
        vehicleNumber,
        transportMode,
      });
    }

    sale.eWayBill = {
      ewbNumber: result.ewbNumber,
      ewbDate: result.ewbDate,
      validUpto: result.validUpto || null,
      vehicleNumber: vehicleNumber || '',
      transportMode: transportMode || 'Road',
      transporterId: transporterId || '',
      status: 'active',
      provider,
      generatedAt: new Date(),
    };
    await sale.save();
    return { sale: sale.toObject(), eWayBill: sale.eWayBill };
  },
};
