'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

const VALID_TYPES = new Set([
  'pvp_kills',
  'longest_shot',
  'longest_life',
  'most_deaths',
  'total_playtime',
]);

function clampLimit(raw, def = 20, max = 100) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

router.get('/', async (req, res) => {
  const type = String(req.query.type || 'pvp_kills');
  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ error: 'invalid type', valid: [...VALID_TYPES] });
  }

  const limit = clampLimit(req.query.limit);

  try {
    let rows;
    switch (type) {
      case 'pvp_kills': {
        const r = await db.query(
          `SELECT uid, name, kills AS value FROM v_top_kills_pvp ORDER BY kills DESC LIMIT $1`,
          [limit]
        );
        rows = r.rows;
        break;
      }
      case 'longest_shot': {
        const r = await db.query(
          `SELECT uid, name, victim_name, weapon_name, distance_m AS value, occurred_at
             FROM v_longest_shots
            ORDER BY distance_m DESC
            LIMIT $1`,
          [limit]
        );
        rows = r.rows;
        break;
      }
      case 'longest_life': {
        const r = await db.query(
          `SELECT uid, name, seconds AS value, occurred_at
             FROM v_longest_life
            ORDER BY seconds DESC
            LIMIT $1`,
          [limit]
        );
        rows = r.rows;
        break;
      }
      case 'most_deaths': {
        const r = await db.query(
          `SELECT uid, name, total_deaths AS value
             FROM players
            WHERE total_deaths > 0
            ORDER BY total_deaths DESC
            LIMIT $1`,
          [limit]
        );
        rows = r.rows;
        break;
      }
      case 'total_playtime': {
        const r = await db.query(
          `SELECT uid, name, total_playtime_s AS value
             FROM players
            WHERE total_playtime_s > 0
            ORDER BY total_playtime_s DESC
            LIMIT $1`,
          [limit]
        );
        rows = r.rows;
        break;
      }
    }

    res.json({ type, limit, rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
