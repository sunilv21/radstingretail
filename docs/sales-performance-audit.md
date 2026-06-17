# POST /api/sales — Production Performance Audit

**Symptom:** under Locust load, `POST /api/sales` returns `504 FUNCTION_INVOCATION_TIMEOUT` ("Task timed out after 30 seconds"); successful requests vary wildly (5s / 7s / 19s / 20s) before many hit the 30s wall.

**Verdict up front:** the *variance* (5s→30s) is the tell. CPU/round-trip work is consistent; wild variance + a hard 30s cliff = **connection-pool exhaustion against Atlas under serverless fan-out**, amplified by in-transaction contention, capped by Vercel's `maxDuration: 30`. The dominant cause is **architecture/infrastructure, not slow business logic.** Code fixes help the fast path; only moving off serverless (or co-locating + upgrading Atlas) removes the timeouts at 50 concurrent.

---

## 1. Runtime bottlenecks (in `createSale`, [sale.service.js:211-395](../server/services/sale.service.js#L211))

Per typical 1-item, non-serialized sale, inside ONE `withTransaction`:

| Step | DB ops | Note |
|---|---|---|
| `BillingEngine.buildCart` | `Store.findById` + `Product.find($in)` = **2 reads** | |
| `InventoryEngine.validateStock` | `Product.find($in)` = **1 read** | **Duplicate** — buildCart already read the same products (N+1-style waste) |
| `nextInvoiceNumber` (allocator) | 0 (cached block) / 2 writes every ~50 sales | ✅ already optimized off the hot Store doc |
| `Sale.create` | 1 write | |
| serialized unit marking | **N reads + N writes + 1 `save`** | only for serial-tracked items; an N+1 loop ([:353](../server/services/sale.service.js#L353)) |
| `deductStock` | N `findOneAndUpdate` + 1 `insertMany` | ✅ already optimized (was 2N read-modify-save) |
| `recordSale` | resolveAccount (cached; cold ≈5 reads) + 1 `insertMany` | ✅ already batched |
| customer outstanding | 1 write (credit sales only) | |

**Already fixed this session:** atomic `$inc` stock (removed read-modify-save WriteConflicts), batched stock-movement + ledger `insertMany`.

**Remaining code waste:**
- **Duplicate product read** (buildCart + validateStock). Fix: fold the no-negative check into the atomic deduct (below) and drop the separate `validateStock` read → −1 read/sale and removes a TOCTOU race.
- **Serialized unit marking is N+1** ([:353](../server/services/sale.service.js#L353)) — one `markSold` (read+write) per unit. Fix: `bulkWrite` the unit updates. Only matters for serial-tracked catalogues.

> There is **no** PDF/WhatsApp/email/aggregation inside `createSale` — those are not in the request path. Good. The slowness is round-trips × (connection wait + contention), not heavy CPU.

---

## 2. MongoDB optimization

**Indexes — already present and correct** (verified in models):
- `products {storeId, sku}` unique · `{storeId, barcode}` · `{storeId, stock}`
- `sales {storeId, invoiceNumber}` unique · `{storeId, createdAt:-1}` · partial-unique `idempotencyKey`
- `stockmovements {storeId, productId, createdAt:-1}`
- `ledgerentries {storeId, accountType, createdAt:-1}` · `{referenceId, referenceType}` · `{storeId, accountId, createdAt}`
- `customers {storeId, phone}` · `accounts {storeId, name}` etc.

No missing index is causing this. The hot-path queries (`findById`, `find {_id:$in}`, `findOneAndUpdate {_id}`) all hit `_id`/compound indexes — no collection scans.

**Recommended add (defense-in-depth, not the cause):**
```js
// already implied by _id, but make the tenant filter index-backed for $in reads
productSchema.index({ storeId: 1, _id: 1 });
```

**Real DB issue = connection saturation, not query plans.** See §5.

---

## 3. Inventory engine ✅ (done) + one more

`deductStock`/`addStock` now use atomic `findOneAndUpdate({$inc})` + batched `StockMovement.insertMany` ([inventory.engine.js](../server/engines/inventory.engine.js)). This removed the worst contention (read-modify-save on shared product docs) and halved round-trips.

**Next:** make the deduct *conditional* so it's race-safe AND lets us delete the duplicate `validateStock` read:
```js
// BEFORE: validateStock (separate read) THEN deductStock ($inc, can go negative)
// AFTER: one atomic guarded update per item
const res = await Product.findOneAndUpdate(
  { _id: it.productId, storeId, ...(allowNegative ? {} : { stock: { $gte: it.quantity } }) },
  { $inc: { stock: -it.quantity } },
  { session, new: true },
);
if (!res) throw new AppError('STOCK_INSUFFICIENT', `Not enough stock for ${it.productId}`, 400);
```
Removes 1 read/sale and closes the check-then-act race under 50 concurrent cashiers.

---

## 4. Sales service — what stays in / out of the transaction

**MUST stay in the transaction (atomicity — Non-Negotiable #1):**
- `Sale.create`
- stock deduction + stock movements
- **ledger entries** (double-entry must commit with the sale — moving this out **will** corrupt the books)
- customer outstanding `$inc`

**Already outside (correct):** customer upsert (before the txn); there are no notifications/PDF/WhatsApp in the path.

**Optimized flow:**
```
pre-txn:  resolve customer · validate warranty/serial inputs
txn:      buildCart (1 read) → guarded atomic deduct (N writes, no separate validate)
          → Sale.create (1) → [bulkWrite units if serial] → ledger insertMany (1)
          → customer $inc (1 if credit)
post-txn: (future) emit sale.created → queue PDF/WhatsApp/low-stock
```
Theoretical hot-path cost after fixes: ~2 reads + ~4 writes ≈ 6 round-trips. At a co-located Atlas (~2–5ms RTT) that's **<100ms of DB time** → sub-second sale. At a cross-region/free-tier Atlas (50–150ms RTT + throttling) the *same code* is 1–20s. **That delta is the whole problem — it's the connection/latency layer, §5.**

---

## 5. Vercel serverless audit — THE ROOT CAUSE

[app/api/[...slug]/route.js](../app/api/[...slug]/route.js) bridges Web `Request` → Express. It's fine and low-overhead (it awaits `prepareApp()` which is an idempotent cached connect). The problem is the **connection model under concurrency**:

1. **Pool fan-out vs Atlas cap (primary).** Each cold Vercel instance runs `mongoose.connect` with its own pool. The default was **`maxPoolSize: 20`**. 50 concurrent cashiers → Vercel spins up many instances → 20 × N instances → **exceeds the Atlas connection limit** (M0 = 500, shared tiers throttle hard). New ops then wait up to `serverSelectionTimeoutMS` for a free connection → pile up → Vercel kills at 30s. **This produces exactly the 5s/19s/30s spread.**
   - ✅ **Fixed in code:** the pool now defaults to **5 on serverless** (auto-detected via `process.env.VERCEL`); override with `MONGO_MAX_POOL_SIZE`. Set `MONGO_MAX_POOL_SIZE=3` on Vercel for tighter control.
2. **Connection reuse is correct *per warm instance*** (`readyState===1` short-circuit), but serverless gives you many instances, so warm reuse doesn't save you under burst load.
3. **`bufferCommands` (default true):** while a cold instance is connecting, queries queue up to ~10s, adding latency spikes. Consider `mongoose.set('bufferTimeoutMS', 5000)` so they fail fast instead of hanging.
4. **Cold starts:** real but secondary (~300–800ms); the 20s numbers are connection waits, not cold start.
5. **`maxDuration: 30`** ([vercel.json](../vercel.json)) is the guillotine. Raising it to 60 only delays the failure; it doesn't fix throughput.

**Serverless reality:** Vercel functions are **not built to hold many concurrent multi-document ACID transactions** against a connection-capped database. Even perfect code can't make 50 concurrent transactional writes reliably sub-2s on this model.

---

## 6. Concurrency (50 cashiers)

| Risk | Status |
|---|---|
| Stock corruption / lost updates | ✅ Fixed — atomic `$inc` (was read-modify-save) |
| Duplicate invoice numbers | ✅ Fixed — range allocator + `(storeId, invoiceNumber)` unique index |
| Duplicate sales on retry | ✅ Fixed — partial-unique `idempotencyKey` |
| Stock check-then-act race | ⚠️ Open — close with the *guarded* atomic deduct (§3) |
| Transaction WriteConflict retries | ⬇ Reduced by `$inc`; remaining contention is on connections, not docs |
| Connection-pool exhaustion | ⚠️ Mitigated by the pool default; fully solved only off-serverless |
| Deadlocks | Not observed — single-document atomic ops don't deadlock |

---

## 7. Load-test readiness & throughput ceilings

- **Current TPS (Vercel + current Atlas tier):** unstable; effectively a few sales/sec before the connection cap induces 30s timeouts.
- **Bottleneck:** Atlas connection saturation under serverless fan-out (not CPU, not indexes, not query plans).
- **Max throughput on this architecture:** low and non-deterministic — wrong tool for sustained transactional write load.

| Target | Architecture |
|---|---|
| **100 sales/hr** (~0.03/s) | Works on Vercel + the pool fix. No further change needed. |
| **1,000 sales/hr** (~0.3/s, bursty) | Vercel + `MONGO_MAX_POOL_SIZE=3` + Atlas **M10** (dedicated, co-located region) + guarded deduct. Borderline OK. |
| **10,000 sales/hr** (~3/s, spikes to 50 concurrent) | **Move API off Vercel** → long-running Node (Render/Railway/ECS/PM2) with a warm shared pool, Atlas **M10/M30** co-located, Redis + Bull for async side-effects. This is the only configuration that holds <2s p99. |

---

## 8. Key refactors (BEFORE → AFTER)

**A. Pool size (done)**
```js
// BEFORE
maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20)
// AFTER (serverless-aware)
const defaultPool = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) ? 5 : 20;
maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || defaultPool)
```
**B. Atomic stock (done)** — `findOne+save` → `findOneAndUpdate({$inc})`.
**C. Batched ledger (done)** — 5× `create` → 1× `insertMany`.
**D. Guarded deduct (recommended)** — fold no-negative into the atomic update; delete the duplicate `validateStock` read (§3).
**E. Serial units (recommended)** — replace the `markSold` N+1 loop with one `bulkWrite`.
**F. Fail-fast (recommended)** — wrap the transaction so a contended sale returns `503` in ~5s instead of a 30s `504` (frees the connection faster, better UX).

---

## 9. Final report — ranked by production impact

| Sev | Issue | Fix | Est. impact |
|---|---|---|---|
| **CRITICAL** | Serverless pool fan-out → Atlas connection exhaustion | Pool default 5 on Vercel ✅ + `MONGO_MAX_POOL_SIZE=3` env | Removes most 19s/30s variance |
| **CRITICAL** | Vercel serverless is the wrong host for concurrent ACID transactions | Move API to a long-running host (infra) | The only fix that guarantees <2s p99 at 50 concurrent |
| **CRITICAL** | Atlas tier/region (if M0/shared or cross-region) | Atlas M10+ co-located with the API region | 10–50× lower RTT + no throttle |
| **HIGH** | Read-modify-save stock (WriteConflicts) | Atomic `$inc` ✅ | Big contention drop |
| **HIGH** | Sequential ledger inserts | `insertMany` ✅ | ~5 round-trips → 1 |
| **MEDIUM** | Duplicate product read + check-then-act race | Guarded atomic deduct (§3) | −1 read/sale, race-safe |
| **MEDIUM** | 30s `maxDuration` masks failures as 504 | Add fail-fast `maxTimeMS`/wrapper → 503 | Better UX, frees connections |
| **LOW** | Serial-unit N+1 | `bulkWrite` | Only serial catalogues |

### Roadmap
- **Today:** ✅ pool default (done), atomic `$inc` (done), batched ledger (done). **Set `MONGO_MAX_POOL_SIZE=3` in Vercel env and redeploy. Re-run the load test.**
- **This week:** guarded atomic deduct (§3) + serial `bulkWrite` + fail-fast wrapper. Confirm Atlas tier is **M10 dedicated, same region** as the Vercel functions.
- **Scaling (to 10k/hr):** move the Express API to a long-running host (keep Next.js frontend on Vercel) with a warm shared pool; add Redis + Bull for async post-sale work (PDF/WhatsApp/low-stock). This is the architecture in [production-scaling-plan.md](production-scaling-plan.md).

### The honest bottom line on the stated goal
"`POST /api/sales` consistently <2s, never hits the 30s timeout" at 50 concurrent cashiers is **achievable — but not on Vercel serverless.** The pool fix + atomic/batched writes + an M10 co-located Atlas will get the *fast path* well under 2s and eliminate *most* timeouts at moderate load. Sustained 50-concurrent transactional billing reliably under 2s requires the long-running-host architecture. No amount of `createSale` micro-optimization changes that ceiling — it's the serverless connection model.

*Companion: [production-scaling-plan.md](production-scaling-plan.md) · [code-audit-report.md](code-audit-report.md). 2026-06-17.*
