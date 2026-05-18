/**
 * Seed bootstrap.
 *
 * Behaviour after the multi-tenant split:
 *
 *   - If a row exists in the `superadmins` collection, the system is in
 *     SaaS mode. Bootstrap is a no-op. Tenants are onboarded through the
 *     Platform UI (which creates rows in `tenantadmins` + `organizations`).
 *
 *   - If the database is completely empty (no super_admin AND no tenant
 *     admin AND no users), seed a Demo organisation + a TenantAdmin owner
 *     + a starter store + chart of accounts. This keeps the local-dev
 *     experience zero-touch but does NOT run on a production DB that has
 *     the platform admin already provisioned.
 */
import Store from '../models/Store.js';
import User from '../models/User.js';
import TenantAdmin from '../models/TenantAdmin.js';
import SuperAdmin from '../models/SuperAdmin.js';
import Organization from '../models/Organization.js';
import AccountGroup from '../models/AccountGroup.js';
import Account from '../models/Account.js';
import BankAccount from '../models/BankAccount.js';

const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = 'password123';

export async function bootstrapIfEmpty() {
  // SaaS mode: a super_admin exists, vendor controls onboarding.
  if (await SuperAdmin.exists({})) {
    return { bootstrapped: false };
  }
  // Otherwise skip if anything's already there — don't pollute live data.
  const [taCount, uCount] = await Promise.all([
    TenantAdmin.estimatedDocumentCount(),
    User.estimatedDocumentCount(),
  ]);
  if (taCount > 0 || uCount > 0) {
    return { bootstrapped: false };
  }

  console.log('[bootstrap] Fresh database detected — seeding demo org + store + tenant admin…');

  // Tenant admin (org owner) lives in `tenantadmins`.
  const admin = await TenantAdmin.create({
    name: 'Admin User',
    email: DEFAULT_ADMIN_EMAIL,
    password: DEFAULT_ADMIN_PASSWORD,
    isActive: true,
  });

  const TRIAL_DAYS = 14;
  const organization = await Organization.create({
    name: 'Demo Retail Co.',
    ownerUserId: admin._id,
    plan: 'starter',
    centralGstin: '07AAAAA0000A1Z5',
    isActive: true,
    trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
    monthlyAmount: 0,
  });

  const store = await Store.create({
    organizationId: organization._id,
    name: 'Demo Retail Store',
    code: 'DEL-001',
    gstNumber: '07AAAAA0000A1Z5',
    stateCode: '07',
    address: { line1: '123 Main Market', city: 'New Delhi', state: 'Delhi', pincode: '110001' },
    phone: '',
    email: '',
    invoicePrefix: 'INV',
    invoiceCounter: 0,
  });

  admin.organizationId = organization._id;
  admin.storeIds = [store._id];
  admin.primaryStoreId = store._id;
  await admin.save();

  await seedChartOfAccounts(store._id);
  await seedBankAccounts(store._id);

  console.log(
    `[bootstrap] ✓ Store "${store.name}" and admin user "${admin.email}" created.`,
  );
  console.log(
    `[bootstrap] ✓ Chart of Accounts + cash/bank accounts seeded for ${store.name}.`,
  );
  console.log(`[bootstrap] Login with: ${DEFAULT_ADMIN_EMAIL} / ${DEFAULT_ADMIN_PASSWORD}`);

  return { bootstrapped: true, storeId: store._id };
}

async function seedChartOfAccounts(storeId) {
  // Tally-style: top-level nature → sub-groups → accounts.
  const groups = await AccountGroup.insertMany([
    { storeId, name: 'Assets', parentId: null, nature: 'asset' },
    { storeId, name: 'Liabilities', parentId: null, nature: 'liability' },
    { storeId, name: 'Income', parentId: null, nature: 'income' },
    { storeId, name: 'Expenses', parentId: null, nature: 'expense' },
  ]);
  const byName = Object.fromEntries(groups.map((g) => [g.name, g]));

  const sub = await AccountGroup.insertMany([
    { storeId, name: 'Current Assets', parentId: byName.Assets._id, nature: 'asset' },
    { storeId, name: 'Fixed Assets', parentId: byName.Assets._id, nature: 'asset' },
    { storeId, name: 'Current Liabilities', parentId: byName.Liabilities._id, nature: 'liability' },
    { storeId, name: "Capital Account", parentId: byName.Liabilities._id, nature: 'liability' },
    { storeId, name: 'Direct Income', parentId: byName.Income._id, nature: 'income' },
    { storeId, name: 'Indirect Income', parentId: byName.Income._id, nature: 'income' },
    { storeId, name: 'Direct Expenses', parentId: byName.Expenses._id, nature: 'expense' },
    { storeId, name: 'Indirect Expenses', parentId: byName.Expenses._id, nature: 'expense' },
  ]);
  const bySubName = Object.fromEntries(sub.map((g) => [g.name, g]));

  await Account.insertMany([
    { storeId, name: 'Cash', groupId: bySubName['Current Assets']._id, openingBalance: 0 },
    { storeId, name: 'Sundry Debtors', groupId: bySubName['Current Assets']._id, openingBalance: 0 },
    { storeId, name: 'GST Input Credit', groupId: bySubName['Current Assets']._id, openingBalance: 0 },
    { storeId, name: 'Closing Stock', groupId: bySubName['Current Assets']._id, openingBalance: 0 },
    { storeId, name: 'Sundry Creditors', groupId: bySubName['Current Liabilities']._id, openingBalance: 0 },
    { storeId, name: 'GST Payable (Output)', groupId: bySubName['Current Liabilities']._id, openingBalance: 0 },
    { storeId, name: 'Sales Revenue', groupId: bySubName['Direct Income']._id, openingBalance: 0 },
    { storeId, name: 'Purchase Expense', groupId: bySubName['Direct Expenses']._id, openingBalance: 0 },
    { storeId, name: 'Rounding Off', groupId: bySubName['Indirect Expenses']._id, openingBalance: 0 },
    { storeId, name: "Proprietor's Capital", groupId: bySubName['Capital Account']._id, openingBalance: 0 },
  ]);
}

async function seedBankAccounts(storeId) {
  await BankAccount.insertMany([
    { storeId, name: 'Cash in Hand', type: 'cash', openingBalance: 0, currentBalance: 0 },
  ]);
}
