# Production Readiness Checklist

**Honest status of "is the code production ready?"** — what's done, what's left in code, and what is infrastructure you provision. Last updated 2026-06-16.

> **Bottom line:** the code is at a **strong pre-production state** — all known P0 security/correctness blockers are fixed and test-verified. "Complete production readiness" is the rest of this list: a server-side auth track + infrastructure (Redis, queue, replica sets) + a load-test pass. None of that can be faked from the app repo; it's provisioned and measured. Don't flip the switch to live billing until the **Exit gate** at the bottom is green.

---

## ✅ Done & verified this work (code)

| Area | Item | Where |
|---|---|---|
| Security | JWT fail-closed (no hard-coded secret) | middleware/auth.js |
| Security | **Boot env validation** (fail-closed in prod, lists all problems) | config/env.js |
| Security | RBAC enforced on every data router + sub-route tags | middleware/rbac.js, app.js, routes/* |
| Security | Login rate-limiting | routes/auth.routes.js |
| Correctness | Idempotency partial-unique index (no dup sales / no keyless collision) | models/Sale.js |
| Correctness | Ledger Σ debit = Σ credit (payable derived, postVoucher guard) | engines/ledger.engine.js |
| Correctness | GST-inclusive pricing extracts tax (no double-charge) | engines/gst.engine.js, lib/billing-local.ts |
| Correctness | Sale-return refund parity on inclusive items | services/sale.service.js |
| Throughput | Invoice range-pre-allocation (counter write removed from txn) | utils/sequence.js, models/Counter.js |
| Resilience | Graceful shutdown, HTTP timeouts, load-shed, `/api/ready` | index.js, app.js |
| Resilience | Tunable Mongo pool | config/database.js |
| UX/perf | Client GET cache + write-invalidation (no refetch on nav) | lib/api.ts |
| Offline | AES-GCM device-bound offline login, 90d expiry, lockout, restricted perms, provenance | lib/offline-auth.ts, lib/rbac.ts |
| Docs | Schema + ERD + algorithms + audit + scaling + shareable HTML | docs/* |

**Gates currently green:** `tsc --noEmit` · `npm run lint` · `npm run build` · 54/54 algorithm tests · offline-auth + sequence + RBAC + ledger-guard unit tests.

---

## ⏳ Remaining CODE work (prioritized) — safe to do in verified increments

| Pri | Item | Why it matters | Effort / risk |
|---|---|---|---|
| **P1** | **Refresh-token architecture** (15-min access + rotating 30-day refresh, `/auth/refresh`, logout/revocation) | 24h non-revocable tokens; a disabled/demoted user keeps rights until expiry. Unblocks longer offline grace. | Server, medium |
| **P1** | **Permission versioning** (`permissionsVersion` on `/auth/me`; re-derive role per request) | Stale cached permissions (incl. offline) survive a role change. | Server, low-med |
| **P1** | **Webhook idempotency/replay table** (Razorpay/PhonePe/WhatsApp) | Retried webhooks must not double-apply. | Server, low |
| **P1** | Emit `sale.created` + move PDF/WhatsApp/low-stock to a queue | Slow/fragile work runs in the request path today; a WhatsApp hiccup can slow a sale. | Med (needs queue, §infra) |
| **P2** | **Structured logging** (Winston) — replace `console.*` server-wide | §12 "never console.log in prod"; needed for real observability. | Mechanical, low risk |
| **P2** | **Per-route input validation** (Zod/Joi on every write) | Reject malformed payloads before the DB. | Large, low risk |
| **P2** | Money as **integer paise** (or enforce epsilon compares) | Float drift can fail Σ Dr = Σ Cr at volume. | Touches financial core — careful |
| **P2** | **Immutable-doc guards** at schema level (block edits to sales/ledger) | `recordPayment` still mutates a sale in place. | Med — must refactor recordPayment |
| **P2** | Schema hygiene: `select:false` on passwords, unique `(storeId,phone)`, org-scoped `email`/`code`/`transferNumber`, TTL on invites/audit | Defense-in-depth + correctness (audit findings). | Low–med; needs migration care |
| **P3** | Device **registration** (server-side `devicePublicKey`) | True per-terminal binding beyond the browser device key. | Server |
| **P3** | Offline pre-reserved invoice ranges | Nicety — show final invoice # offline (duplicates already prevented by server-assigns-on-sync). | Med |

> I deliberately have **not** batch-applied the P2 financial-core items (money-as-paise, immutability guards) blind — doing so without integration tests against a database would risk the ledger, which is the opposite of "production ready." Each should land as its own verified increment with the integrity scanner + a DB run.

---

## 🏗 INFRASTRUCTURE to provision (not code — see [production-scaling-plan.md](production-scaling-plan.md))

- Run the API as a **long-running service** (PM2 cluster / ECS / K8s), **off Vercel serverless**.
- **MongoDB Atlas M40+**, multi-AZ; shard for high throughput.
- **Redis** — back the rate limiter, GSP token cache, product/dashboard cache, and the Bull queue (move the in-process caches off the process).
- **Bull/BullMQ** worker for PDF / WhatsApp / reports / low-stock.
- **Backups + PITR**, DR runbook (RPO/RTO), quarterly restore drill.
- **Observability:** Sentry (errors) + Datadog/CloudWatch (p95, event-loop lag, pool saturation, queue depth) + alerts.
- **Secrets manager** (Vault / AWS SM) for JWT/Razorpay/PhonePe/WhatsApp/GSP keys; rotate.
- **MFA** for admin/accountant logins (TOTP + backup codes).
- TLS 1.3 + HSTS at the edge.

---

## 🧪 Must-pass tests before go-live (need a disposable QA DB + cluster)
1. Concurrent billing across many tenants — p95, error rate, WriteConflicts, pool saturation (k6/Artillery).
2. Kill MongoDB mid-transaction → **no partial records**.
3. 3 cashiers billing simultaneously → no stock conflict, no duplicate invoice number.
4. 1000-item cart < 1s.
5. `node server/scripts/integrity-scan.js` clean over 30 days of generated data (Σ Dr = Σ Cr, stock = movements, no orphans).
6. Live e-invoice / GSP / payment-webhook round-trips in sandbox.
7. Security: JWT-forge attempt, RBAC bypass, cross-tenant access, rate-limit exhaustion.

---

## 🚦 Exit gate — "production ready" ≡ ALL of:
- [ ] No open P0; P1 code items (refresh tokens, perms versioning, webhook idempotency) shipped.
- [ ] API on a long-running, horizontally-scaled host with Redis + queue.
- [ ] Atlas sized/sharded; backups + PITR + tested restore.
- [ ] Observability + alerting live.
- [ ] Load test meets target with headroom; integrity scanner green.
- [ ] Secrets in a manager; MFA on privileged logins; TLS/HSTS.
- [ ] GST invoices reviewed by a CA; pre-launch checklist (CLAUDE.md §15) signed off.

*Companion: [code-audit-report.md](code-audit-report.md) · [production-scaling-plan.md](production-scaling-plan.md) · [algorithms-and-logic.md](algorithms-and-logic.md).*
