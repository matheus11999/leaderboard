'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

function clampLimit(raw, def = 10, max = 100) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

router.get('/active', async (req, res) => {
  const limit = clampLimit(req.query.limit, 10, 50);

  try {
    const r = await db.query(
      `SELECT uid, name, current_kill_streak, best_kill_streak,
              bounty_value, bounty_started_at, last_seen
         FROM players
        WHERE bounty_active = true
        ORDER BY bounty_value DESC, current_kill_streak DESC, bounty_started_at ASC NULLS LAST
        LIMIT $1`,
      [limit]
    );
    res.json({ limit, rows: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

router.get('/completed', async (req, res) => {
  const limit = clampLimit(req.query.limit, 20, 100);

  try {
    const r = await db.query(
      `SELECT id, occurred_at, target_uid, target_name, hunter_uid, hunter_name,
              target_streak, bounty_value, weapon_name, weapon_prefab, distance_m,
              claimed, claimed_at
         FROM bounty_events
        ORDER BY occurred_at DESC
        LIMIT $1`,
      [limit]
    );
    res.json({ limit, rows: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
