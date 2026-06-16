import mongoose from 'mongoose';
import Product from '../models/Product.js';
import ProductUnit from '../models/ProductUnit.js';
import Store from '../models/Store.js';
import Organization from '../models/Organization.js';
import { AppError } from '../utils/response.js';
import { generateEan13Barcode } from '../utils/barcode.js';
import { validateHsnFormat } from '../utils/hsn.js';

const REQUIRED = ['name', 'sku', 'sellingPrice', 'gstRate', 'hsnCode'];

/**
 * Format-check the HSN/SAC code against the org's required digit count.
 * Throws an AppError with a precise reason so the UI can highlight the
 * exact field. Master-list (description / rate-mismatch) checks live in
 * `utils/hsn.js::verifyHsn` — they're informational, not blocking.
 */
async function assertHsnFormat(storeId, organizationId, hsnCode) {
  let minDigits = 4;
  if (organizationId) {
    const org = await Organization.findById(organizationId)
      .select({ hsnDigitsRequired: 1 })
      .lean();
    if (org?.hsnDigitsRequired) minDigits = Number(org.hsnDigitsRequired);
  }
  const v = validateHsnFormat(hsnCode, { minDigits });
  if (v.valid) return v;
  // Build a humane message per failure mode.
  if (v.reason === 'EMPTY') {
    throw new AppError('HSN_REQUIRED', 'HSN / SAC code is required', 400);
  }
  if (v.reason === 'BELOW_REQUIRED_DIGITS') {
    throw new AppError(
      'HSN_BELOW_REQUIRED_DIGITS',
      `HSN must be at least ${minDigits} digits for this organisation. You entered ${v.digits}.`,
      400,
    );
  }
  if (v.reason === 'BAD_DIGIT_COUNT') {
    throw new AppError(
      'HSN_BAD_DIGIT_COUNT',
      'HSN must be 2, 4, 6 or 8 digits. SAC must be 6 digits and start with 99.',
      400,
    );
  }
  throw new AppError(
    'HSN_INVALID_FORMAT',
    'HSN / SAC must be a numeric code (HSN: 2–8 digits, SAC: 6 digits starting with 99).',
    400,
  );
}

// 1D barcodes: 6–24 alphanumerics + dash.
const BARCODE_RE = /^[A-Za-z0-9-]{6,24}$/;
function isValidBarcode(code) {
  return typeof code === 'string' && BARCODE_RE.test(code);
}

// QR / serial: 4–512 printable ASCII — URLs, IMEIs, JSON, GS1, etc.
const QR_RE = /^[\x20-\x7E]{4,512}$/;
function isValidQrCode(code) {
  return typeof code === 'string' && QR_RE.test(code);
}

function assertRequired(input) {
  for (const field of REQUIRED) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      throw new AppError('VALIDATION_ERROR', `${field} is required`, 400);
    }
  }
}

export const ProductService = {
  async list({ storeId, query = '', category, lowStock, page = 1, limit = 50 }) {
    const q = query.toLowerCase().trim();
    const filter = { storeId, isActive: true };
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { sku: re }, { barcode: re }, { qrCode: re }];
    }
    if (category) filter.category = category;
    const [total, rows] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    const filtered = lowStock ? rows.filter((p) => p.stock <= p.minStock) : rows;
    return {
      data: filtered,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  },

  // Resolves a scanned code to a product. Cascade:
  //   1. ProductUnit.serialNo — per-unit QR (serialised inventory)
  //   2. Product.barcode
  //   3. Product.qrCode
  async getByBarcode({ storeId, barcode }) {
    const code = String(barcode ?? '').trim();

    const unit = await ProductUnit.findOne({ storeId, serialNo: code }).lean();
    if (unit) {
      const product = await Product.findOne({ _id: unit.productId, storeId, isActive: true }).lean();
      if (!product) {
        throw new AppError('PRODUCT_NOT_FOUND', `Unit ${code} product missing or inactive`, 404);
      }
      return { ...product, matchedUnit: unit };
    }

    const product = await Product.findOne({
      storeId,
      isActive: true,
      $or: [{ barcode: code }, { qrCode: code }],
    }).lean();
    if (!product) throw new AppError('PRODUCT_NOT_FOUND', `No product for code ${code}`, 404);
    return product;
  },

  async getById({ storeId, id }) {
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404);
    }
    const product = await Product.findOne({ _id: id, storeId });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND', 'Product not found', 404);
    return product;
  },

  async create({ storeId, organizationId, input, createdBy }) {
    assertRequired(input);
    // HSN/SAC format check first — fail fast, don't leak a half-validated
    // product into the inventory list.
    const hsnFmt = await assertHsnFormat(storeId, organizationId, input.hsnCode);

    const duplicate = await Product.findOne({ storeId, sku: input.sku });
    if (duplicate) throw new AppError('SKU_DUPLICATE', `SKU "${input.sku}" already exists`, 400);

    let barcode = input.barcode?.trim() || '';
    if (barcode) {
      if (!isValidBarcode(barcode)) {
        throw new AppError('BARCODE_INVALID', 'Barcode must be 6–24 alphanumeric characters', 400);
      }
      const taken = await Product.findOne({ storeId, barcode });
      if (taken) throw new AppError('BARCODE_DUPLICATE', `Barcode ${barcode} already in use`, 400);
    } else {
      // Generate a locally-unique EAN-13. Small retry loop to avoid collisions.
      for (let tries = 0; tries < 10; tries++) {
        const candidate = generateEan13Barcode();
        const exists = await Product.findOne({ storeId, barcode: candidate });
        if (!exists) {
          barcode = candidate;
          break;
        }
      }
      if (!barcode) throw new AppError('BARCODE_GEN_FAILED', 'Could not generate a unique barcode', 500);
    }

    const qrCode = input.qrCode?.trim() || '';
    if (qrCode) {
      if (!isValidQrCode(qrCode)) {
        throw new AppError('QRCODE_INVALID', 'QR code must be 4–512 printable characters', 400);
      }
      const collides = await Product.findOne({
        storeId,
        $or: [{ qrCode }, { barcode: qrCode }],
      });
      if (collides) {
        throw new AppError(
          'QRCODE_DUPLICATE',
          "QR code collides with another product's barcode or QR",
          400,
        );
      }
    }

    // Pull store-level defaults so a new product gets sensible values when the
    // create form leaves a field blank. Per-input values still take precedence.
    const storeDoc = await Store.findById(storeId).lean();
    const defaults = storeDoc?.settings || {};

    const product = await Product.create({
      storeId,
      name: String(input.name).trim(),
      sku: String(input.sku).trim(),
      barcode,
      qrCode,
      isSerialised: !!input.isSerialised,
      category: input.category || 'General',
      brand: input.brand || '',
      unit: input.unit || 'pcs',
      purchasePrice: Number(input.purchasePrice || 0),
      sellingPrice: Number(input.sellingPrice),
      mrp: Number(input.mrp || input.sellingPrice),
      gstRate: Number(input.gstRate),
      hsnCode: hsnFmt.normalized,
      stock: Number(input.stock || 0),
      minStock: Number(
        input.minStock !== undefined && input.minStock !== ''
          ? input.minStock
          : defaults.defaultLowStockThreshold ?? 0,
      ),
      maxStock: Number(input.maxStock || 0),
      reorderQty: Number(input.reorderQty || 0),
      warrantyMonths: Math.max(0, Number(
        input.warrantyMonths !== undefined && input.warrantyMonths !== ''
          ? input.warrantyMonths
          : defaults.defaultWarrantyMonths ?? 0,
      )),
      priceIncludesGst:
        input.priceIncludesGst !== undefined
          ? !!input.priceIncludesGst
          : defaults.defaultGSTMode === 'inclusive',
      isActive: true,
      createdBy,
    });
    return product.toObject();
  },

  async update({ storeId, organizationId, id, input }) {
    const product = await ProductService.getById({ storeId, id });
    if (input.hsnCode !== undefined && String(input.hsnCode) !== product.hsnCode) {
      const fmt = await assertHsnFormat(storeId, organizationId, input.hsnCode);
      input.hsnCode = fmt.normalized;
    }
    const allowed = [
      'name', 'category', 'brand', 'unit',
      'purchasePrice', 'sellingPrice', 'mrp',
      'gstRate', 'hsnCode',
      'minStock', 'maxStock', 'reorderQty', 'warrantyMonths',
    ];
    for (const key of allowed) {
      if (input[key] !== undefined) product[key] = input[key];
    }

    // GST-inclusive flag. Handled explicitly (not in the loop above) because
    // it's a boolean where `false` is a meaningful value the operator can set
    // — toggling it OFF must persist just as much as toggling it ON. Without
    // this, editing a product to mark its price GST-inclusive silently failed
    // and the cart kept stacking GST on top of an already-inclusive price.
    if (input.priceIncludesGst !== undefined) {
      product.priceIncludesGst = !!input.priceIncludesGst;
    }

    if (input.barcode && input.barcode !== product.barcode) {
      if (!isValidBarcode(input.barcode)) {
        throw new AppError('BARCODE_INVALID', 'Barcode must be 6–24 alphanumeric characters', 400);
      }
      const taken = await Product.findOne({
        storeId,
        barcode: input.barcode,
        _id: { $ne: id },
      });
      if (taken) throw new AppError('BARCODE_DUPLICATE', 'Barcode already in use', 400);
      product.barcode = input.barcode;
    }

    if (input.qrCode !== undefined && input.qrCode !== product.qrCode) {
      const qr = String(input.qrCode).trim();
      if (qr === '') {
        product.qrCode = '';
      } else {
        if (!isValidQrCode(qr)) {
          throw new AppError('QRCODE_INVALID', 'QR code must be 4–512 printable characters', 400);
        }
        const collides = await Product.findOne({
          storeId,
          _id: { $ne: id },
          $or: [{ qrCode: qr }, { barcode: qr }],
        });
        if (collides) {
          throw new AppError('QRCODE_DUPLICATE', "QR code collides with another product's barcode or QR", 400);
        }
        product.qrCode = qr;
      }
    }

    if (input.isSerialised !== undefined) {
      const next = !!input.isSerialised;
      if (next !== !!product.isSerialised) {
        const unitCount = await ProductUnit.countDocuments({ storeId, productId: product._id });
        if (next && unitCount === 0 && Number(product.stock) > 0) {
          throw new AppError(
            'SERIAL_FLAG_BLOCKED',
            'Cannot switch to serialised while stock > 0 and no units added. Adjust stock to 0 first.',
            400,
          );
        }
        if (!next && unitCount > 0) {
          throw new AppError(
            'SERIAL_FLAG_BLOCKED',
            'Cannot turn serial tracking off — units exist. Remove all units first.',
            400,
          );
        }
        product.isSerialised = next;
      }
    }

    await product.save();
    return product.toObject();
  },

  async softDelete({ storeId, id }) {
    const product = await ProductService.getById({ storeId, id });
    product.isActive = false;
    await product.save();
    return product.toObject();
  },

  generateBarcode() {
    return generateEan13Barcode();
  },
};
