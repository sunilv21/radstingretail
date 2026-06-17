import mongoose from 'mongoose';

let connecting = null;

/**
 * Connect to MongoDB. Idempotent — safe to call multiple times; returns the
 * same in-flight promise until resolved.
 */
export async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connecting) return connecting;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Configure it in .env before starting the server.');
  }

  // Pool sizing is environment-driven so the same code scales from a laptop
  // to a PM2 cluster. IMPORTANT trade-off for scale:
  //  - Long-running server (PM2/ECS/K8s): set a generous maxPoolSize per
  //    worker (e.g. 50–100) and a small minPoolSize to keep warm sockets.
  //  - Serverless (Vercel): keep maxPoolSize LOW (5–10). Each cold function
  //    opens its own pool; many concurrent instances × a big pool blows past
  //    Atlas's connection cap and the cluster refuses connections — a crash
  //    source under load. See docs/production-scaling-plan.md.
  // On Vercel serverless, EACH concurrent function instance opens its own
  // pool. 50 instances × 20 connections = 1000 sockets → blows past Atlas's
  // connection cap, new ops wait on `serverSelectionTimeoutMS`, and you get
  // the classic 5s/19s/30s variance + FUNCTION_INVOCATION_TIMEOUT. So default
  // the pool SMALL on serverless (Vercel sets process.env.VERCEL) and large
  // only for a long-running host. Override with MONGO_MAX_POOL_SIZE.
  // A serverless instance handles one request at a time and the sale path runs
  // its DB ops sequentially, so a tiny pool is ideal — it minimises total
  // Atlas connections (instances × poolSize). 50 instances × 2 = 100 sockets
  // instead of × 5 = 250, which is what was saturating the cluster under load.
  // Set MONGO_MAX_POOL_SIZE=1 to fan out even less on a small Atlas tier.
  const onServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const defaultPool = onServerless ? 2 : 20;
  connecting = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_MS || 8_000),
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45_000),
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || defaultPool),
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 0),
      // Cap simultaneous connection handshakes so a startup thundering-herd
      // doesn't overwhelm the cluster.
      maxConnecting: Number(process.env.MONGO_MAX_CONNECTING || 5),
      maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_MS || 60_000),
      retryWrites: true,
      retryReads: true,
    })
    .then((m) => {
      console.log(`[db] Connected to MongoDB — db: ${m.connection.name}, host: ${m.connection.host}`);
      return m.connection;
    })
    .catch((err) => {
      connecting = null;
      console.error(`[db] Connection failed: ${err.message}`);
      throw err;
    });

  return connecting;
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

// Graceful shutdown on SIGINT / SIGTERM.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    try {
      await disconnectDB();
    } finally {
      process.exit(0);
    }
  });
}
