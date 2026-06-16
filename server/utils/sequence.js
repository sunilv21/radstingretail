/**
 * Range-pre-allocation sequence allocator.
 *
 * Eliminates the #1 throughput bottleneck (production-scaling-plan §1): the
 * per-store invoice counter that was incremented on the Store document inside
 * the sale transaction, serializing every sale for a store onto one hot doc.
 *
 * Instead, each worker atomically claims a BLOCK of sequence values from the
 * `counters` collection (one cheap `$inc`, OUTSIDE the sale transaction) and
 * hands them out from memory until the block is exhausted, then claims another.
 * Contention drops by a factor of BLOCK and leaves the sale transaction with
 * zero counter writes.
 *
 * Guarantees:
 *  - Uniqueness: every value comes from a block reserved by an atomic `$inc`,
 *    so no two callers (across workers) ever get the same number.
 *  - Continuity from legacy: on first claim for a (store, docType) the counter
 *    is seeded from the legacy in-Store counter, so numbering continues without
 *    colliding with already-issued documents.
 *  - GST-safe gaps: a worker restart discards the unused tail of its block,
 *    producing small gaps — legal for GST invoice series.
 *
 * The numeric backstop remains the unique index on the document number
 * (e.g. `(storeId, invoiceNumber)`): even a bug here cannot create duplicates,
 * only a failed insert that the transaction retry surfaces.
 */
import Counter from '../models/Counter.js';

const BLOCK = Math.max(1, Number(process.env.SEQUENCE_BLOCK_SIZE || 50));

// In-process reservations: `${storeId}:${docType}` -> { next, max }.
const pools = new Map();

/**
 * Pure range allocator — exposed for unit testing without a DB. `claimBlock`
 * must return the TOP of a freshly reserved block of size `block`; this hands
 * out (top-block+1 … top) before asking for the next.
 */
export function makeAllocator(claimBlock, block = BLOCK) {
  const local = new Map();
  return async function next(key, seedBase = 0) {
    let pool = local.get(key);
    if (!pool || pool.next > pool.max) {
      const top = await claimBlock(key, block, seedBase);
      pool = { next: top - block + 1, max: top };
      local.set(key, pool);
    }
    const value = pool.next;
    pool.next += 1;
    return value;
  };
}

/**
 * Reserve a block in MongoDB for (storeId, docType) and return its top value.
 * Seeds the counter from `seedBase` (the legacy in-Store counter) on first use.
 */
async function claimBlockFromDb(key, block, seedBase) {
  const [storeId, docType] = key.split('|');
  // Seed only on insert — idempotent, race-safe via the unique index.
  await Counter.updateOne(
    { storeId, docType },
    { $setOnInsert: { storeId, docType, seq: Math.max(0, Number(seedBase) || 0) } },
    { upsert: true },
  );
  const doc = await Counter.findOneAndUpdate(
    { storeId, docType },
    { $inc: { seq: block } },
    { new: true },
  );
  return doc.seq; // top of the reserved block
}

/**
 * Claim the next sequence integer for (storeId, docType). `legacyBase` is the
 * last value issued under the old in-Store counter, used to seed continuity.
 */
export async function claimSequence(storeId, docType, legacyBase = 0) {
  const key = `${String(storeId)}|${docType}`;
  let alloc = pools.get(docType);
  if (!alloc) {
    alloc = makeAllocator(claimBlockFromDb);
    pools.set(docType, alloc);
  }
  return alloc(key, legacyBase);
}

/** Test helper — clears in-process reservations. */
export function _resetSequenceCacheForTests() {
  pools.clear();
}
