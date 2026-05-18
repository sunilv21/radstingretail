// One-shot connection tester. Run:  node server/scripts/test-mongo.js
import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('❌ MONGODB_URI not set in .env');
  process.exit(1);
}

const masked = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:••••@');
console.log(`Connecting to: ${masked}`);

const t0 = Date.now();
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const ms = Date.now() - t0;
  const db = mongoose.connection;
  console.log(`✅ Connected in ${ms}ms`);
  console.log(`   Host:     ${db.host}`);
  console.log(`   Database: ${db.name}`);
  console.log(`   Ready:    ${db.readyState === 1 ? 'ok' : 'not-ready'}`);
  const admin = db.db.admin();
  const info = await admin.serverStatus();
  console.log(`   Server:   MongoDB ${info.version}`);
  const colls = await db.db.listCollections().toArray();
  console.log(`   Collections existing: ${colls.length > 0 ? colls.map((c) => c.name).join(', ') : '(none yet)'}`);
  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  console.error(`❌ Connection failed: ${err.message}`);
  if (err.message.includes('ENOTFOUND')) {
    console.error('   → Cluster host not reachable. Check cluster name + DNS.');
  } else if (err.message.includes('Authentication failed')) {
    console.error('   → Wrong username or password. Check Atlas → Database Access.');
  } else if (err.message.includes('IP that isn')) {
    console.error('   → Your current IP is not in the Atlas allowlist. Add it under Network Access.');
  }
  process.exit(1);
}
