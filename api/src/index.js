'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const db = require('./db');
const logger = require('./lib/logger');
const { seedAdminFromEnv } = require('./auth');

const ingestRouter      = require('./routes/ingest');
const leaderboardRouter = require('./routes/leaderboard');
const killfeedRouter    = require('./routes/killfeed');
const playersRouter     = require('./routes/players');
const statsRouter       = require('./routes/stats');
const safezoneRouter    = require('./routes/safezone');
const adminRouter       = require('./routes/admin');

const PORT = Number(process.env.PORT) || 3000;
const VIEW_REFRESH_MS = 60_000;

async function bootstrap() {
  // Fail fast on missing critical env.
  const required = ['DATABASE_URL', 'INGEST_API_KEY', 'JWT_SECRET'];
  for (const k of required) {
    if (!process.env[k]) {
      logger.error(`missing required env: ${k}`);
      process.exit(1);
    }
  }

  await db.waitForReady();
  await seedAdminFromEnv();
  scheduleViewRefresh();

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());

  // Ingest needs raw json; all other routes also use json. Mount globally.
  app.use(express.json({ limit: '256kb' }));

  // Routes
  app.use('/v1/arma/events', ingestRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/killfeed', killfeedRouter);
  app.use('/api/players', playersRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/safezone', safezoneRouter);
  app.use('/api/admin', adminRouter);
  // Back-compat: keep legacy /admin/* mounted too so old clients/tests
  // (e.g. /admin/health probes) keep working.
  app.use('/admin', adminRouter);

  // Default 404 + simple root for sanity check.
  app.get('/', (_req, res) => {
    res.json({
      name: 'brasilz-leaderboard',
      version: '0.1.0',
      docs: '/admin/health for status',
    });
  });

  app.use((_req, res) => res.status(404).json({ error: 'not found' }));

  app.listen(PORT, () => {
    logger.info(`api: listening on :${PORT}`);
  });
}

function scheduleViewRefresh() {
  const refresh = async () => {
    const views = ['v_top_kills_pvp', 'v_longest_shots', 'v_longest_life'];
    for (const v of views) {
      try {
        await db.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${v}`);
      } catch (err) {
        // Concurrent refresh needs unique index + at least one row. First run on empty
        // table falls back to non-concurrent.
        try {
          await db.query(`REFRESH MATERIALIZED VIEW ${v}`);
        } catch (err2) {
          logger.warn(`view refresh ${v} failed:`, err2.message);
        }
      }
    }
  };

  // First run after 10s so DB has time to seed; then every 60s.
  setTimeout(refresh, 10_000);
  setInterval(refresh, VIEW_REFRESH_MS);
}

bootstrap().catch((err) => {
  logger.error('bootstrap failed', err);
  process.exit(1);
});
