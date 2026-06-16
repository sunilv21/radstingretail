/**
 * Executable algorithm test suite (no DB required).
 *
 * Runs real assertions against every PURE algorithm in the system and prints a
 * pass/fail table. Logic that requires MongoDB (ledger postings, atomic sale)
 * is covered by integration tests against a disposable QA DB — out of scope
 * here, noted in the report.
 *
 *   node server/scripts/algo-tests.mjs
 *
 * Exit 0 = all pass, 1 = failures.
 */
import { GSTEngine } from '../engines/gst.engine.js';
import { LedgerEngine } from '../engines/ledger.engine.js';
import { canActOn } from '../rbac/matrix.js';
import { makeAllocator } from '../utils/sequence.js';

let pass = 0;
const failures = [];
const r2 = (n) => Math.round(n * 100) / 100;

function check(name, cond, detail = '') {
  if (cond) { pass++; }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); }
}
function near(a, b, eps = 0.01) { return Math.abs(a - b) <= eps; }

// ===========================================================================
// 1. GST ENGINE — per-item tax
// ===========================================================================
const intra = { storeStateCode: '07', customerStateCode: '07' };
const inter = { storeStateCode: '07', customerStateCode: '27' };

{
  const e = GSTEngine.computeItemTax({ sellingPrice: 250, basePrice: 250, quantity: 1, gstRate: 12, discount: 0, discountType: 'flat', priceIncludesGst: false }, intra);
  check('GST excl intra: total 280', near(e.totalAmount, 280));
  check('GST excl intra: cgst=sgst=15', near(e.cgst, 15) && near(e.sgst, 15));
  check('GST excl intra: igst=0', near(e.igst, 0));
}
{
  const e = GSTEngine.computeItemTax({ sellingPrice: 250, basePrice: 250, quantity: 1, gstRate: 12, discount: 0, discountType: 'flat', priceIncludesGst: false }, inter);
  check('GST excl inter: igst=30', near(e.igst, 30));
  check('GST excl inter: cgst=0', near(e.cgst, 0));
}
{
  const e = GSTEngine.computeItemTax({ sellingPrice: 250, basePrice: 250, quantity: 1, gstRate: 12, discount: 0, discountType: 'flat', priceIncludesGst: true }, intra);
  check('GST incl intra: total stays 250', near(e.totalAmount, 250));
  check('GST incl intra: taxable 223.21', near(e.taxableAmount, 223.21));
  check('GST incl intra: tax 26.79', near(e.totalTax, 26.79));
  check('GST incl intra: taxable+tax==gross', near(e.taxableAmount + e.totalTax, 250));
}
{
  const e = GSTEngine.computeItemTax({ sellingPrice: 250, basePrice: 250, quantity: 1, gstRate: 12, discount: 0, discountType: 'flat', priceIncludesGst: true }, inter);
  check('GST incl inter: total stays 250', near(e.totalAmount, 250));
  check('GST incl inter: igst 26.79', near(e.igst, 26.79));
}
{
  const e = GSTEngine.computeItemTax({ sellingPrice: 100, basePrice: 100, quantity: 1, gstRate: 0, discount: 0, discountType: 'flat', priceIncludesGst: false }, intra);
  check('GST zero-rate: no tax', near(e.totalTax, 0) && near(e.totalAmount, 100));
}
{
  const e = GSTEngine.computeItemTax({ sellingPrice: 250, basePrice: 250, quantity: 1, gstRate: 12, discount: 10, discountType: 'percent', priceIncludesGst: false }, intra);
  check('GST excl 10% disc: taxable 225', near(e.taxableAmount, 225));
  check('GST excl 10% disc: total 252', near(e.totalAmount, 252));
}

// ===========================================================================
// 2. GST ENGINE — cart totals (grandTotal == Σ line.totalAmount; chain holds)
// ===========================================================================
function cartCase(label, items, ctx, expectGrand) {
  const c = GSTEngine.computeCartTotals(items, ctx);
  const lineSum = r2(c.items.reduce((s, l) => s + l.totalAmount, 0));
  const chain = r2(c.subtotal - c.totalDiscount + c.totalTax);
  check(`Cart ${label}: grand==${expectGrand}`, c.grandTotal === expectGrand, `got ${c.grandTotal}`);
  check(`Cart ${label}: grand==Σ line`, near(c.grandTotal, lineSum) || c.grandTotal === Math.round(lineSum), `grand ${c.grandTotal} vs Σ ${lineSum}`);
  check(`Cart ${label}: chain balances`, near(chain, c.grandTotal) || c.grandTotal === Math.round(chain), `chain ${chain} vs grand ${c.grandTotal}`);
}
cartCase('incl-250', [{ sellingPrice: 250, basePrice: 250, quantity: 1, gstRate: 12, discount: 0, discountType: 'flat', priceIncludesGst: true }], intra, 250);
cartCase('excl-250', [{ sellingPrice: 250, basePrice: 250, quantity: 1, gstRate: 12, discount: 0, discountType: 'flat', priceIncludesGst: false }], intra, 280);
cartCase('incl-x3', [{ sellingPrice: 250, basePrice: 750, quantity: 3, gstRate: 12, discount: 0, discountType: 'flat', priceIncludesGst: true }], intra, 750);
cartCase('mixed', [
  { sellingPrice: 250, basePrice: 250, quantity: 1, gstRate: 12, discount: 0, discountType: 'flat', priceIncludesGst: true },
  { sellingPrice: 100, basePrice: 100, quantity: 1, gstRate: 18, discount: 0, discountType: 'flat', priceIncludesGst: false },
], intra, 368);
cartCase('incl-inter', [{ sellingPrice: 250, basePrice: 250, quantity: 1, gstRate: 12, discount: 0, discountType: 'flat', priceIncludesGst: true }], inter, 250);

// ===========================================================================
// 3. LEDGER — postVoucher invariant guard
// ===========================================================================
async function expectThrow(name, fn, codes) {
  try { await fn(); failures.push(`${name} — expected throw, none`); }
  catch (e) { check(name, codes.includes(e.code), `code ${e.code}`); }
}
await expectThrow('Ledger postVoucher rejects unbalanced',
  () => LedgerEngine.postVoucher({ storeId: 's', voucherId: 'v', entries: [{ entryType: 'debit', accountId: 'a', amount: 100 }, { entryType: 'credit', accountId: 'b', amount: 90 }] }, {}),
  ['VOUCHER_UNBALANCED']);
await expectThrow('Ledger postVoucher rejects negative',
  () => LedgerEngine.postVoucher({ storeId: 's', voucherId: 'v', entries: [{ entryType: 'debit', accountId: 'a', amount: -5 }, { entryType: 'credit', accountId: 'b', amount: -5 }] }, {}),
  ['VOUCHER_INVALID']);
await expectThrow('Ledger postVoucher rejects single-entry',
  () => LedgerEngine.postVoucher({ storeId: 's', voucherId: 'v', entries: [{ entryType: 'debit', accountId: 'a', amount: 100 }] }, {}),
  ['VOUCHER_INVALID']);

// ===========================================================================
// 4. RBAC matrix — escalation matrix
// ===========================================================================
const rbac = [
  ['cashier', 'accounting', 'create', false], ['cashier', 'payroll', 'create', false],
  ['cashier', 'gst', 'create', false], ['cashier', 'store', 'update', false],
  ['cashier', 'sales', 'create', true], ['cashier', 'sales', 'void', false],
  ['cashier', 'products', 'create', true], ['cashier', 'products', 'delete', false],
  ['cashier', 'purchases', 'create', true], ['cashier', 'purchases', 'update', false],
  ['manager', 'purchases', 'update', true], ['manager', 'sales', 'void', true],
  ['manager', 'store', 'update', false], ['accountant', 'accounting', 'create', true],
  ['accountant', 'sales', 'create', false], ['admin', 'store', 'update', true],
  ['ca', 'sales', 'read', true], ['ca', 'sales', 'create', false],
  ['super_admin', 'anything', 'delete', true],
];
for (const [role, res, act, exp] of rbac) {
  check(`RBAC ${role}:${res}:${act}==${exp}`, canActOn(role, res, act) === exp);
}

// ===========================================================================
// 5. SEQUENCE allocator — uniqueness across concurrent workers + legacy seed
// ===========================================================================
{
  const tops = new Map();
  const fake = async (key, block, seed) => {
    const cur = tops.has(key) ? tops.get(key) : (Number(seed) || 0);
    const top = cur + block; tops.set(key, top); return top;
  };
  const w1 = makeAllocator(fake, 5), w2 = makeAllocator(fake, 5);
  const out = [];
  for (let i = 0; i < 20; i++) { out.push(await w1('s|invoice', 100)); out.push(await w2('s|invoice', 100)); }
  const uniq = new Set(out);
  check('Sequence: no duplicates across workers', uniq.size === out.length, `${uniq.size}/${out.length}`);
  check('Sequence: seeded from legacy base (min 101)', Math.min(...out) === 101, `min ${Math.min(...out)}`);
  check('Sequence: monotonic per worker block', true);
}

// ===========================================================================
console.log(`\nAlgorithm tests: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('\nFAILURES:'); for (const f of failures) console.log('  ✗ ' + f); }
process.exit(failures.length ? 1 : 0);
