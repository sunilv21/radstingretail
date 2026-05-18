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

  connecting = mongoose
    .connect(uri, {
      // Atlas replica-set discovery can be slow on variable-latency ISPs —
      // allow ~30s before we declare defeat. Our test script is our canary.
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      maxPoolSize: 20,
      retryWrites: true,
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
