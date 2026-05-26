'use strict';

const { Pool } = require('pg');
const logger = require('./lib/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  logger.error('pg pool error', err.message);
});

/**
 * Run a function inside a transaction. Auto BEGIN/COMMIT or ROLLBACK on throw.
 *   await db.tx(async (client) => { await client.query(...); });
 */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

async function query(text, params) {
  return pool.query(text, params);
}

async function waitForReady(maxAttempts = 60, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await pool.query('SELECT 1');
      logger.info('db: connection ready');
      return;
    } catch (err) {
      logger.warn(`db: not ready yet (${i + 1}/${maxAttempts})`, err.code || err.message);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('db: never became ready');
}

module.exports = { pool, query, tx, waitForReady };
