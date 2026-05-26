'use strict';

const express = require('express');
const db = require('../db');
const { requireAdmin, login } = require('../auth');

const router = express.Router();

// Public health check — also used as readiness probe by the user-facing UI.
router.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok', uptime_s: Math.floor(process.uptime()) });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down', error: err.message });
  }
});

router.post('/login', express.json(), login);

router.get('/me', requireAdmin, (req, res) => {
  res.json({ admin: req.admin });
});

// All routes below require auth.
router.use(requireAdmin);

// GET /admin/events?type=&limit=
router.get('/events', async (req, res) => {
  let limit = Number(req.query.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  limit = Math.min(Math.floor(limit), 500);

  const type = req.query.type;
  const params = [limit];
  let where = '';
  if (type) {
    where = 'WHERE event_type = $2';
    params.push(String(type));
  }

  try {
    const r = await db.query(
      `SELECT id, received_at, server_id, event_type, timestamp_unix, processed, error, payload
         FROM events_raw
         ${where}
        ORDER BY received_at DESC
        LIMIT $1`,
      params
    );
    res.json({ rows: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

// GET /admin/players/:uid/sessions
router.get('/players/:uid/sessions', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, connected_at, disconnected_at, duration_s, spawn_point, spawn_prefab,
              balance_in, balance_out
         FROM sessions
        WHERE player_uid = $1
        ORDER BY connected_at DESC
        LIMIT 100`,
      [req.params.uid]
    );
    res.json({ rows: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

// POST /admin/players/:uid/ban
router.post('/players/:uid/ban', express.json(), async (req, res) => {
  const ban = req.body?.ban !== false; // default: true
  try {
    const r = await db.query(
      `UPDATE players SET is_banned = $2 WHERE uid = $1 RETURNING uid, name, is_banned`,
      [req.params.uid, ban]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'player not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'update failed', message: err.message });
  }
});

module.exports = router;
