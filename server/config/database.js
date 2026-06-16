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
  connecting = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_MS || 10_000),
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45_000),
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
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
