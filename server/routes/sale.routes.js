import { Router } from 'express';
import Sale from '../models/Sale.js';
import Store from '../models/Store.js';
import { ok, AppError } from '../utils/response.js';
import { SaleService } from '../services/sale.service.js';
import { sendWhatsAppText, sendWhatsAppTemplate, buildInvoiceMessage } from '../services/whatsapp.service.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, from, to } = req.query;
    const result = await SaleService.list({
      storeId: req.user.storeId,
      page: Number(page),
      limit: Number(limit),
      from,
      to,
    });
    res.json(ok(result.data, result.meta));
  } catch (err) {
    next(err);
  }
});

router.get('/warranties', async (req, res, next) => {
  try {
    const { phone, activeOnly } = req.query;
    const rows = await SaleService.warrantySales({
      storeId: req.user.storeId,
      phone,
      activeOnly: activeOnly === 'true',
    });
    res.json(ok(rows));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(ok(await SaleService.getById({ storeId: req.user.storeId, id: req.params.id })));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const sale = await SaleService.createSale({
      storeId: req.user.storeId,
      input: req.body,
      userId: req.user.id,
    });
    res.status(201).json(ok(sale));
  } catch (err) {
    next(err);
  }
});

// E-invoice (IRN) — generate / cancel
router.post('/:id/einvoice/generate', async (req, res, next) => {
  try {
    const { EInvoiceService } = await import('../services/e-invoice.service.js');
    const result = await EInvoiceService.generate({
      storeId: req.user.storeId,
      saleId: req.params.id,
      userId: req.user.id,
    });
    res.status(201).json(ok(result));
  } catch (err) { next(err); }
});

router.post('/:id/einvoice/cancel', async (req, res, next) => {
  try {
    const { EInvoiceService } = await import('../services/e-invoice.service.js');
    const result = await EInvoiceService.cancel({
      storeId: req.user.storeId,
      saleId: req.params.id,
      // NIC reason code (1=Duplicate, 2=Data entry, 3=Order cancel, 4=Other)
      reason: req.body?.reason,
      remarks: req.body?.remarks,
    });
    res.json(ok(result));
  } catch (err) { next(err); }
});

router.post('/:id/ewb/generate', async (req, res, next) => {
  try {
    const { EWayBillService } = await import('../services/e-invoice.service.js');
    const result = await EWayBillService.generate({
      storeId: req.user.storeId,
      saleId: req.params.id,
      vehicleNumber: req.body?.vehicleNumber,
      transportMode: req.body?.transportMode,
      transporterId: req.body?.transporterId,
      // GSP/NIC need these for the EWB payload — accept them on the route.
      transporterName: req.body?.transporterName,
      distanceKm: req.body?.distanceKm,
      userId: req.user.id,
    });
    res.status(201).json(ok(result));
  } catch (err) { next(err); }
});

router.post('/:id/return', async (req, res, next) => {
  try {
    const cn = await SaleService.returnSale({
      storeId: req.user.storeId,
      saleId: req.params.id,
      input: req.body,
      userId: req.user.id,
    });
    res.status(201).json(ok(cn));
  } catch (err) {
    next(err);
  }
});

// Record a customer payment against a credit / partial sale.
// Body: { mode: 'cash'|'upi'|'card'|'bank', amount: number, reference?: string }
router.post('/:id/payment', async (req, res, next) => {
  try {
    const sale = await SaleService.recordPayment({
      storeId: req.user.storeId,
      saleId: req.params.id,
      input: req.body,
      userId: req.user.id,
    });
    res.status(201).json(ok(sale));
  } catch (err) {
    next(err);
  }
});

// WhatsApp send — audit trail lives on the sale doc.
router.post('/:id/whatsapp', async (req, res, next) => {
  try {
    const saleDoc = await Sale.findOne({ _id: req.params.id, storeId: req.user.storeId });
    if (!saleDoc) throw new AppError('SALE_NOT_FOUND', 'Sale not found', 404);
    const storeDoc = await Store.findById(req.user.storeId);
    if (!storeDoc) throw new AppError('STORE_NOT_FOUND', 'Store not found', 404);

    const sale = saleDoc.toObject();
    const store = storeDoc.toObject();

    const to = req.body?.to || sale.customerSnapshot?.phone;
    if (!to) {
      throw new AppError(
        'CUSTOMER_PHONE_MISSING',
        'No phone number on this bill — capture customer phone at checkout to send via WhatsApp',
        400,
      );
    }

    const appBase =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      `${req.protocol}://${req.get('host').replace(/:\d+$/, ':3000')}`;
    const publicBillUrl = `${appBase}/bill/${sale.shareToken}`;

    let result;
    const templateName = req.body?.templateName || store.whatsapp?.messageTemplate;
    if (templateName) {
      const params = req.body?.templateParams || [
        sale.customerSnapshot?.name || 'Customer',
        sale.invoiceNumber,
        `₹${Number(sale.grandTotal).toFixed(2)}`,
        publicBillUrl,
      ];
      result = await sendWhatsAppTemplate({
        store,
        to,
        templateName,
        language: req.body?.templateLanguage || store.whatsapp?.templateLanguage,
        bodyParams: params,
      });
    } else {
      const message = req.body?.message || buildInvoiceMessage(sale, store, publicBillUrl);
      result = await sendWhatsAppText({ store, to, message });
    }

    saleDoc.whatsappSends = saleDoc.whatsappSends || [];
    saleDoc.whatsappSends.push({
      to,
      messageId: result.messageId,
      sentAt: new Date(),
      sentBy: req.user.id,
      method: templateName ? 'template' : 'text',
      templateName: templateName || null,
    });
    await saleDoc.save();

    res.json(ok({ ...result, sentTo: to, publicBillUrl }));
  } catch (err) {
    next(err);
  }
});

export default router;
