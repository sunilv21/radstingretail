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

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await prepareApp();
    app.listen(PORT, () => {
      console.log(`[api] POS + ERP server listening on :${PORT}`);
    });
  } catch (err) {
    console.error(`[api] Startup failed: ${err?.message || err}`);
    process.exit(1);
  }
})();
