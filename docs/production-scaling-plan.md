# Production Readiness & Scaling Plan

**Goal stated:** "Handle 10,000 billings per second across all tenants, never crash on any request."

This document separates the goal into two very different problems, tells you honestly what each costs, and lists exactly what to build — what's already done in code (✅), what you provision as infrastructure (🏗), and what code work remains (⏳).

---

## 0. The honest framing

**10,000 sales/second is not one number — it's two problems:**

1. **Throughput** ("10k/s"): a horizontal-scaling + database problem. Each sale is a *multi-document ACID transaction* (sale + stock deduction + 2–4 ledger entries + GST). 10k of those per second is a serious distributed-systems workload — it needs many app instances, a sharded/large database, and removal of every serialization bottleneck. **No code change in this repo alone reaches it.** It is achieved by infrastructure + the architectural fixes below.

2. **Stability** ("never crash"): a resilience problem — bounded resources, graceful degradation, load shedding, retries, supervised restarts. **This is mostly code, and much of it is now done.**

> Reality anchor: a single well-tuned Node worker handles ~1–5k simple req/s, but only a few hundred *multi-document transactions*/s. 10k transactional writes/s implies roughly **20–60 app workers** and a **sharded MongoDB cluster (M40+ / multiple shards)**. Budget for it; don't expect a free tier to do it.

---

## 1. The #1 throughput blocker in *this* codebase

### Sequential per-store invoice counter
**Where:** `server/utils/numbering.js` + the counter fields on the `Store` document, incremented inside the sale transaction ([sale.service.js](../server/services/sale.service.js)).

Every sale for a store does `store.invoiceCounter += 1; store.save()` **inside the transaction**. That means **all sales for one store serialize onto a single document** — concurrent sales hit `WriteConflict` and retry one-at-a-time. A single store therefore caps at roughly a few hundred sales/sec no matter how many app workers you run. This is by far the tightest bottleneck.

**Options (pick per requirement):**

| Strategy | How | Trade-off |
|---|---|---|
| **Counter range pre-allocation** (recommended) | Each worker atomically claims a block (e.g. `$inc` by 100) and hands out numbers locally until the block is used | Near-zero contention; invoice numbers stay unique but may have small gaps and aren't strictly globally ordered |
| **Hi/Lo / dedicated counters collection** | A `counters` collection with one doc per `(storeId, docType)`, atomic `findOneAndUpdate($inc)` | Still one hot doc per store, but cheaper than loading the whole Store doc; better with range pre-alloc |
| **Time-ordered IDs + separate friendly number** | Use ObjectId/ULID as the key; assign the human invoice number asynchronously | Highest throughput; friendly number is eventually-consistent |

> GST note: invoice numbers must be unique per FY per store and reasonably sequential for filing — small gaps are legally acceptable; non-monotonic-within-a-second is fine. Range pre-allocation satisfies this.

✅ **DONE (invoice path):** range pre-allocation is implemented in
[server/utils/sequence.js](../server/utils/sequence.js) + [server/models/Counter.js](../server/models/Counter.js),
wired into [nextInvoiceNumber](../server/utils/barcode.js). Each worker reserves a
block (`SEQUENCE_BLOCK_SIZE`, default 50) with one atomic `$inc` and hands out
numbers from memory; the counter write is **removed from the sale transaction**
entirely, killing the per-store hot-doc contention. Continuity is seeded from
the legacy `store.invoiceCounter` on first claim; the `(storeId, invoiceNumber)`
unique index remains the hard backstop. **Must be load-tested (§5) before relied
on at scale** — and the block math is unit-verified (no duplicates across
concurrent workers).
⏳ **Remaining:** apply the same allocator to PO/GRN/CN/DN/voucher numbering if
those paths ever become high-volume (currently low-volume, left on the simpler
in-Store counter).

---

## 2. What's already done in code (✅)

| Area | What | File |
|---|---|---|
| **Atomicity** | Every sale/purchase/transfer/payroll runs in `mongoose.withTransaction` (auto-retries transient/WriteConflict errors) | services/* |
| **Ledger integrity** | Debits always equal credits; payable derived in-engine; `postVoucher` rejects unbalanced journals | [ledger.engine.js](../server/engines/ledger.engine.js) |
| **Idempotency** | Sales carry a client key + partial-unique index → safe retries, no double-charge on network replays | [Sale.js](../server/models/Sale.js), [lib/sync.ts](../lib/sync.ts) |
| **Multi-tenant isolation** | `storeId` from JWT on every query; RBAC enforced per resource | [middleware/rbac.js](../server/middleware/rbac.js) |
| **Login rate limiting** | Brute-force guard on `/login` + `/super-admin/login` | [auth.routes.js](../server/routes/auth.routes.js) |
| **Connection pool (tunable)** | `MONGO_MAX_POOL_SIZE`, `minPoolSize`, `maxConnecting`, `maxIdleTimeMS`, `retryReads/Writes` | [config/database.js](../server/config/database.js) |
| **HTTP server timeouts** | `requestTimeout` / `keepAliveTimeout` / `headersTimeout` bound stuck sockets | [index.js](../server/index.js) |
| **Graceful shutdown** | SIGTERM/SIGINT drains in-flight requests, closes DB, hard-kill fallback → safe rolling deploys | [index.js](../server/index.js) |
| **Load-shedding backstop** | `MAX_INFLIGHT_REQUESTS` → 503 instead of OOM crash (opt-in) | [app.js](../server/app.js) |
| **Liveness + readiness probes** | `/api/health` (process) and `/api/ready` (DB connected → 503 if not) | [app.js](../server/app.js) |
| **Crash guards** | `unhandledRejection` / `uncaughtException` logged; DB reconnect logging | [app.js](../server/app.js) |
| **Indexes** | Compound indexes on the hot query paths (`storeId+createdAt`, barcode, invoice/PO uniqueness) | models/* |

### Recommended env settings for a long-running production worker
```bash
NODE_ENV=production
JWT_SECRET=<64+ random chars>          # REQUIRED — boot fails without it in prod
MONGO_MAX_POOL_SIZE=80                  # per worker; total ≤ Atlas cap
MONGO_MIN_POOL_SIZE=10
MONGO_MAX_CONNECTING=10
HTTP_REQUEST_TIMEOUT_MS=30000
MAX_INFLIGHT_REQUESTS=500               # per worker; shed beyond this
SHUTDOWN_TIMEOUT_MS=15000
CORS_ORIGIN=https://app.yourdomain.com
```

---

## 3. Infrastructure to provision (🏗) — this is how you get to 10k/s

### 3.1 Move OFF Vercel serverless for the API
Serverless is the wrong shape for sustained high-throughput transactional writes:
- Cold starts add latency spikes.
- **Each instance opens its own Mongo pool** → at high concurrency you exhaust Atlas's connection cap and the cluster refuses connections (a crash source). This is exactly why `MONGO_MAX_POOL_SIZE` must stay low on Vercel.
- 10–60s function timeouts can abort a slow transaction.

**Do:** run the Express API as a **long-running service** on PM2 cluster / ECS Fargate / Kubernetes. Keep the **Next.js frontend on Vercel** (it's great for that). (This also solves the GSP static-IP problem from the e-invoice work.)

### 3.2 Horizontal app scaling
- **PM2 cluster mode** (`pm2 start server/index.js -i max`) or K8s with an HPA (scale on CPU/inflight).
- App is already **stateless per request** — but three module-level caches break across instances and must move to Redis (see 3.4).
- Put everything behind a load balancer using `/api/ready` for health routing.

### 3.3 MongoDB Atlas sizing & sharding
- Start **M40+**; move to a **sharded cluster** for 10k/s, shard key `{ storeId: 1, _id: 1 }` (or hashed `storeId`) so each tenant's load spreads and stays co-located.
- Read-heavy endpoints (reports, dashboards) → `readPreference=secondaryPreferred`; **all financial writes stay on primary**.
- Watch the **connection cap**: `(workers × MONGO_MAX_POOL_SIZE) ≤ cluster max connections`.

### 3.4 Redis (required at scale) — move shared state off the process
Three in-memory caches are correct for one process but wrong for a cluster:
- **Rate limiter** ([middleware/rateLimit.js](../server/middleware/rateLimit.js)) — per-instance today; ⏳ swap to a Redis sliding window so limits are global.
- **GSP token cache** ([einvoice/gsp-client.js](../server/services/einvoice/gsp-client.js)) — re-auths per instance; move to Redis.
- **Ledger account-id cache** (`CACHED_BY_STORE` in [ledger.engine.js](../server/engines/ledger.engine.js)) — fine per-instance but never invalidates; add TTL or Redis.

Redis also powers: **product/barcode cache** (cache-aside, the §10.2 design — biggest read-latency win for POS), **dashboard KPI cache**, and the **Bull job queue** below.

### 3.5 Background job queue (Bull/BullMQ)
Heavy/slow work must not run in the request path:
- Invoice PDF generation, WhatsApp/email sends, report aggregation, low-stock alerts.
- ⏳ **Gap:** the `sale.created` eventBus event is currently never emitted (see audit) — wire it so these become async jobs instead of inline work. This both speeds up the sale response and removes crash surface (a WhatsApp API hiccup can't fail a sale).

### 3.6 Observability (so you see a crash coming)
- **Sentry** for exceptions, **Datadog/CloudWatch** for p95 latency, event-loop lag, Mongo connection-pool saturation, Bull queue depth.
- Alert on: pool > 80% utilized, p95 sale latency > 1s, inflight near `MAX_INFLIGHT_REQUESTS`, WriteConflict rate climbing.

---

## 4. Remaining code work, prioritized (⏳)

| Priority | Item | Why |
|---|---|---|
| **P0** | Invoice-counter range pre-allocation (§1) | The hard throughput ceiling per store |
| **P0** | Emit `sale.created` + move PDF/WhatsApp/alerts to Bull (§3.5) | Removes slow/fragile work from the sale path |
| **P1** | Redis-back the rate limiter, GSP token cache, product cache (§3.4) | Correctness + latency once multi-instance |
| **P1** | Money as integer paise (or epsilon compares) across financial docs | Float drift can fail `Σ Dr = Σ Cr` at volume (audit P2) |
| **P1** | Webhook idempotency/replay tables (Razorpay/PhonePe/WhatsApp) | Retried webhooks must not double-apply (audit P2) |
| **P1** | Refresh-token rotation; re-derive role/permissions per request | Revocation + security at scale (audit P1) |
| **P2** | Add the missing indexes & `select:false` on passwords; org-scope unique fields | Query perf + safety (audit) |
| **P2** | Decide `uncaughtException` policy under a supervisor (log → exit → restart) | Don't keep serving in a corrupted state |
| **P2** | Per-route input validation (Zod/Joi) on every write | Reject malformed payloads before they touch the DB |

---

## 5. Load testing — prove it before you trust it
Nothing here is "production ready" until measured. Build a disposable QA Atlas + cluster and run:
- **k6 / Artillery** ramping sale creation across many tenants; watch p95, error rate, WriteConflicts, pool saturation.
- The pre-launch tests from CLAUDE.md §15: kill MongoDB mid-transaction (verify no partial records), 3 concurrent cashiers (no stock conflicts), 1000-item cart < 1s, ledger `Σ Dr = Σ Cr` over 30 days of generated data.
- Find the real per-store and per-cluster ceilings, then size workers/shards to the target with headroom.

---

## 6. Phased path (what to actually do, in order)

1. **Stabilize (mostly done):** the resilience items in §2 + set the production env (§2). Deploy the API as a long-running PM2 cluster off Vercel. → *won't crash under normal + spiky load.*
2. **Remove the bottleneck:** invoice-counter range pre-allocation (§1) + async side-effects via Bull (§3.5). → *per-store throughput jumps from hundreds to thousands/s.*
3. **Scale out:** Redis for shared state + cache (§3.4), Atlas M40→sharded (§3.3), autoscaling workers (§3.2). → *aggregate throughput scales linearly with workers/shards.*
4. **Prove it:** load test (§5), tune pool/worker/shard counts to the target. → *measured 10k/s with headroom, or a clear bill of what hardware that needs.*

> Bottom line: the code is now resilient and the path to 10k/s is concrete, but reaching that number is an **infrastructure investment** (≈20–60 workers + a sharded cluster + Redis) plus the two P0 code items in §4 — not a single change. Do §1 and §2 first; they give the biggest safety + throughput return for the least effort.

*Last updated 2026-06-16. Companion docs: [code-audit-report.md](code-audit-report.md), [algorithms-and-logic.md](algorithms-and-logic.md).*
