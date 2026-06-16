/**
 * Local-dev entry point. Production / Vercel uses `api/[[...slug]].js`,
 * which also imports `./app.js`. This file is a thin starter that connects
 * to MongoDB, runs the bootstrap, then `app.listen()`s — nothing more.
 *
 * The whole Express app definition (CORS, middleware stack, every route
 * mount including /api/platform/*) lives in `./app.js`. There used to be a
 * second copy of all of that here; that drifted, so we collapsed both
 * paths into a single source of truth.
 */
import 'dotenv/config';
import { app, prepareApp } from './app.js';
import { disconnectDB } from './config/database.js';

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await prepareApp();
    const server = app.listen(PORT, () => {
      console.log(`[api] POS + ERP server listening on :${PORT}`);
    });

    // ---- HTTP server resilience tuning -----------------------------------
    // Bound how long a single request may hold a socket so a slow/stuck
    // client (or a hung handler) can't pile up connections until the process
    // runs out of file descriptors/memory and crashes under load.
    server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 30_000);
    // headersTimeout must exceed keepAliveTimeout to avoid premature 408s.
    server.keepAliveTimeout = Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS || 61_000);
    server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 65_000);
    // Cap concurrent sockets as a last-resort backstop (0 = unlimited).
    const maxConns = Number(process.env.HTTP_MAX_CONNECTIONS || 0);
    if (maxConns > 0) server.maxConnections = maxConns;

    // ---- Graceful shutdown -----------------------------------------------
    // On SIGTERM/SIGINT (rolling deploy, scale-down, Ctrl-C): stop accepting
    // new connections, let in-flight requests drain, close the DB, then exit.
    // A hard-kill timer guarantees we never hang a deploy forever.
    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[api] ${signal} received — draining (timeout ${process.env.SHUTDOWN_TIMEOUT_MS || 15_000}ms)…`);
      const hardKill = setTimeout(() => {
        console.error('[api] drain timed out — forcing exit');
        process.exit(1);
      }, Number(process.env.SHUTDOWN_TIMEOUT_MS || 15_000));
      hardKill.unref();
      server.close(async () => {
        try {
          await disconnectDB();
        } finally {
          clearTimeout(hardKill);
          console.log('[api] shutdown complete');
          process.exit(0);
        }
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error(`[api] Startup failed: ${err?.message || err}`);
    process.exit(1);
  }
})();
