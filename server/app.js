/**
 * Express app factory.
 *
 * The actual `.listen()` call lives in:
 *   - `server/index.js` for local dev (long-running Node process)
 *   - `api/[[...slug]].js` for Vercel (wrapped with serverless-http)
 *
 * This file just builds the Express app and exposes a `prepareApp()` helper
 * that connects to MongoDB + seeds chart-of-accounts. Both entry points call
 * prepareApp() once and reuse the cached promise on subsequent invocations
 * (which matters for Vercel cold-starts).
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

import { connectDB } from './config/database.js';
import { assertEnv } from './config/env.js';
import { bootstrapIfEmpty } from './scripts/bootstrap.js';
import { authenticate } from './middleware/auth.js';
import { auditMiddleware } from './middleware/audit.js';
import { piiRedactionForReadOnly } from './middleware/piiRedaction.js';
import { blockWritesForReadOnlyRoles, enforceResource } from './middleware/rbac.js';
import { subscriptionGuard } from './middleware/subscriptionGuard.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { ok } from './utils/response.js';

import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import posRoutes from './routes/pos.routes.js';
import saleRoutes from './routes/sale.routes.js';
import reportRoutes from './routes/reports.routes.js';
import customerRoutes from './routes/customer.routes.js';
import supplierRoutes from './routes/supplier.routes.js';
import purchaseRoutes from './routes/purchase.routes.js';
import accountingRoutes from './routes/accounting.routes.js';
import gstRoutes from './routes/gst.routes.js';
import payrollRoutes from './routes/payroll.routes.js';
import storeRoutes from './routes/store.routes.js';
import storesRoutes from './routes/stores.routes.js';
import usersRoutes from './routes/users.routes.js';
import auditRoutes from './routes/audit.routes.js';
import transfersRoutes from './routes/transfers.routes.js';
import hsnRoutes from './routes/hsn.routes.js';
import expensesRoutes from './routes/expenses.routes.js';
import platformRoutes from './routes/platform.routes.js';
import publicRoutes from './routes/public.routes.js';
import publicInvitesRoutes from './routes/invites.public.routes.js';
import webhookRoutes from './routes/webhooks.routes.js';
import supportRoutes from './routes/support.routes.js';
import platformPaymentsRoutes from './routes/platform-payments.routes.js';
import billingPublicRoutes from './routes/billing-public.routes.js';

import Product from './models/Product.js';
import Sale from './models/Sale.js';

export const app = express();

// CORS policy:
// - Production: restrict to origins listed in CORS_ORIGIN (comma-separated).
// - Dev (NODE_ENV !== 'production'): allow any localhost / 127.0.0.1 /
//   192.168.x.x / 10.x.x.x / 172.16-31.x.x origin so the cashier can hit the
//   dev server from their LAN phone or from a network-shared laptop.
// - Requests with no Origin header (curl, server-to-server) are always allowed.
//
// Disallowed origins resolve with `false`, which makes the cors middleware
// respond *without* CORS headers — the browser then surfaces a normal CORS
// error rather than a 500 from an unhandled callback Error.
const isDev = process.env.NODE_ENV !== 'production';
const PRIVATE_NETWORK_RE = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (isDev && PRIVATE_NETWORK_RE.test(origin)) return true;
  // Vercel-hosted same-origin requests don't need a whitelist — the function
  // is at the same domain as the frontend, so the browser sends no
  // cross-origin preflight at all. Anything that DOES have an origin and
  // isn't whitelisted is genuinely cross-origin and gets denied.
  return false;
}

app.use(
  cors({
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
    credentials: true,
  }),
);
// Retain raw body on every request — WhatsApp webhook HMAC verification needs
// the exact bytes Meta signed, before JSON parsing.
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// ---- Load-shedding backstop (opt-in) ------------------------------------
// When MAX_INFLIGHT_REQUESTS is set, reject new requests with 503 once that
// many are already in flight, instead of accepting unbounded work until the
// event loop/memory is exhausted and the process crashes. Health checks are
// always allowed so the orchestrator doesn't kill a busy-but-alive instance.
// Default (unset/0) = disabled, so normal operation is never throttled.
const MAX_INFLIGHT = Number(process.env.MAX_INFLIGHT_REQUESTS || 0);
let inflight = 0;
if (MAX_INFLIGHT > 0) {
  app.use((req, res, next) => {
    if (req.path === '/api/health' || req.path === '/api/ready') return next();
    if (inflight >= MAX_INFLIGHT) {
      res.set('Retry-After', '1');
      return res.status(503).json(
        // eslint-disable-next-line no-undef
        { success: false, error: { code: 'OVERLOADED', message: 'Server busy, retry shortly' } },
      );
    }
    inflight += 1;
    res.on('close', () => { inflight -= 1; });
    next();
  });
}

// Tiny request logger — prints every API call with status + duration.
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t0;
    const tag = res.statusCode >= 400 ? '⚠' : '·';
    console.log(`[api] ${tag} ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// Liveness: process is up. Cheap, never touches the DB — used by the
// orchestrator to decide whether to restart the container.
app.get('/api/health', (_req, res) => {
  res.json(ok({ status: 'OK', timestamp: new Date().toISOString() }));
});

// Readiness: process is up AND the DB is connected. Used by the load balancer
// to decide whether to route traffic here. Returns 503 while the DB is down so
// a degraded instance is pulled from rotation instead of erroring every sale.
app.get('/api/ready', (_req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  if (dbState === 1) {
    return res.json(ok({ status: 'READY', db: 'connected' }));
  }
  res.status(503).json({
    success: false,
    error: { code: 'NOT_READY', message: `DB not connected (state ${dbState})` },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
// Meta WhatsApp webhooks — un-authenticated. Security is via:
// (1) hub.verify_token match on GET, (2) HMAC-SHA256 signature on POST.
app.use('/api/webhooks', webhookRoutes);
// Invite accept-by-token is un-authenticated (the token IS the auth).
app.use('/api/invites', publicInvitesRoutes);

// All authenticated routes share these layers in order:
//  1. authenticate              — verifies the JWT, populates req.user
//  2. subscriptionGuard         — 402 if the tenant's subscription has expired
//                                  or been blocked (super_admin always passes)
//  3. blockWritesForReadOnlyRoles — CA / auditor can't POST/PUT/DELETE
//  4. piiRedactionForReadOnly   — strips customer phone/email/address for CAs
//  5. auditMiddleware           — appends to AuditLog for writes (and CA reads)
const authStack = [
  authenticate,
  subscriptionGuard,
  blockWritesForReadOnlyRoles,
  piiRedactionForReadOnly,
  auditMiddleware,
];

// Per-resource RBAC gate (enforceResource) is appended to the shared auth
// stack so every data router is default-deny against the matrix in
// rbac/matrix.js. Routers that need finer granularity than method→action
// (sales void/return, purchase grn/pay/cancel) carry explicit
// requirePermission(...) tags on those sub-routes — see the route files.
//   - pos / hsn are lookup helpers used during billing → resource 'products'
//     read covers them; their POST /calculate is a read-style compute, so we
//     mount them under 'products' (cashier has products:read).
//   - expenses has no own matrix resource → governed by 'accounting'.
//   - stores / users / audit / transfers already tag routes internally.
app.use('/api/products', ...authStack, enforceResource('products'), productRoutes);
app.use('/api/pos', ...authStack, posRoutes);
app.use('/api/sales', ...authStack, enforceResource('sales'), saleRoutes);
app.use('/api/reports', ...authStack, reportRoutes);
app.use('/api/customers', ...authStack, enforceResource('customers'), customerRoutes);
app.use('/api/suppliers', ...authStack, enforceResource('suppliers'), supplierRoutes);
app.use('/api/purchases', ...authStack, enforceResource('purchases'), purchaseRoutes);
app.use('/api/accounting', ...authStack, enforceResource('accounting'), accountingRoutes);
app.use('/api/gst', ...authStack, enforceResource('gst'), gstRoutes);
app.use('/api/payroll', ...authStack, enforceResource('payroll'), payrollRoutes);
app.use('/api/store', ...authStack, enforceResource('store'), storeRoutes);
app.use('/api/stores', ...authStack, storesRoutes);
app.use('/api/users', ...authStack, usersRoutes);
app.use('/api/audit', ...authStack, auditRoutes);
app.use('/api/transfers', ...authStack, transfersRoutes);
app.use('/api/hsn', ...authStack, hsnRoutes);
app.use('/api/expenses', ...authStack, enforceResource('accounting'), expensesRoutes);
// Support requests are intentionally OUTSIDE the subscription guard —
// a blocked tenant must still be able to file a "please reactivate me"
// ticket. Auth + audit are still applied so we know who raised it.
app.use('/api/support', authenticate, auditMiddleware, supportRoutes);
// Public billing endpoints (gateway redirect-back + S2S webhook).
// Mounted BEFORE the authenticated /api/billing chain because PhonePe's
// browser redirect doesn't carry a JWT — the payment reference + a
// server-to-server status verify is the trust anchor.
app.use('/api/billing', billingPublicRoutes);
// Same exemption for billing — an expired tenant has to be able to
// pay to renew without being 402'd by the subscription guard.
app.use('/api/billing', authenticate, auditMiddleware, platformPaymentsRoutes);
// Vendor-only cross-tenant routes. Inner `requireSuperAdmin` middleware
// rejects anyone who isn't a platform admin.
app.use('/api/platform', authenticate, auditMiddleware, platformRoutes);

// Legacy aliases kept for dashboard pages.
app.get('/api/inventory/products', authenticate, async (req, res, next) => {
  try {
    const rows = await Product.find({ storeId: req.user.storeId, isActive: true }).limit(200).lean();
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

app.get('/api/reports/dashboard-stats', authenticate, async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [allSales, todaySales, products] = await Promise.all([
      Sale.aggregate([
        { $match: { storeId: req.user.storeId } },
        { $group: { _id: null, total: { $sum: '$grandTotal' } } },
      ]),
      Sale.aggregate([
        { $match: { storeId: req.user.storeId, createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' } } },
      ]),
      Product.find({ storeId: req.user.storeId, isActive: true }).lean(),
    ]);
    res.json({
      data: {
        totalSales: allSales[0]?.total || 0,
        todaysSales: todaySales[0]?.total || 0,
        totalInventoryValue: products.reduce((s, p) => s + p.sellingPrice * p.stock, 0),
        lowStockItems: products.filter((p) => p.stock <= p.minStock).length,
      },
    });
  } catch (err) {
    next(err);
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

// ---------- Process-level crash guards ----------
// In production we WANT to log + survive instead of dying on a single rogue
// promise. Any caller hitting an actually-broken endpoint will still get a 500
// from the route's own try/catch — these handlers are the safety net for code
// that didn't propagate properly (timers, event-bus listeners, etc.).
//
// Registered once, at module load. Safe to import this module multiple times
// because `process.on` deduplicates listeners with the same function ref —
// but we still guard with a flag for hot-reload paranoia in dev.
if (!globalThis.__radstingCrashGuardsInstalled) {
  globalThis.__radstingCrashGuardsInstalled = true;
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err?.stack || err);
    // Don't exit — the request that triggered this already failed. Keep serving.
  });

  // ---------- DB lifecycle visibility ----------
  mongoose.connection.on('error', (err) => {
    console.error(`[db] connection error: ${err?.message || err}`);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected — driver will auto-retry');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('[db] reconnected');
  });
}

/**
 * Connect to MongoDB and seed defaults if empty. Idempotent — returns the
 * same promise on every call after the first, so it's safe (and cheap) for
 * the Vercel function to await this on every request.
 */
let preparing = null;
export function prepareApp() {
  if (preparing) return preparing;
  preparing = (async () => {
    assertEnv(); // fail-closed in production on missing/weak critical env
    await connectDB();
    if (process.env.NODE_ENV !== 'production') {
      await bootstrapIfEmpty();
    }
  })().catch((err) => {
    // If startup fails, clear the cached promise so the next request retries.
    // Otherwise every subsequent request would silently re-throw the same
    // error without ever attempting to reconnect.
    preparing = null;
    throw err;
  });
  return preparing;
}

export default app;
