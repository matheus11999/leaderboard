'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

const VALID_TYPES = new Set([
  'pvp_kills',
  'pve_kills',
  'longest_shot',
  'longest_life',
  'most_deaths',
  'total_playtime',
]);

const VALID_PERIODS = new Set(['daily', 'weekly', 'monthly', 'all']);

function clampLimit(raw, def = 20, max = 100) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function periodToInterval(period) {
  switch (period) {
    case 'daily':   return "INTERVAL '24 hours'";
    case 'weekly':  return "INTERVAL '7 days'";
    case 'monthly': return "INTERVAL '30 days'";
    default:        return null;
  }
}

router.get('/', async (req, res) => {
  const type = String(req.query.type || 'pvp_kills');
  const period = String(req.query.period || 'all');

  if (!VALID_TYPES.has(type))
    return res.status(400).json({ error: 'invalid type', valid: [...VALID_TYPES] });
  if (!VALID_PERIODS.has(period))
    return res.status(400).json({ error: 'invalid period', valid: [...VALID_PERIODS] });

  const limit = clampLimit(req.query.limit);
  const interval = periodToInterval(period);
  const sinceClause = interval ? `AND occurred_at > NOW() - ${interval}` : '';

  try {
    let rows;

    switch (type) {
      case 'pvp_kills': {
        const r = await db.query(
          `SELECT killer_uid AS uid, killer_name AS name, COUNT(*)::INT AS value
             FROM kills
            WHERE is_pvp = true AND killer_uid IS NOT NULL ${sinceClause}
            GROUP BY killer_uid, killer_name
            ORDER BY value DESC
            LIMIT $1`,
          [limit]
        );
        rows = r.rows;
        break;
      }
      case 'pve_kills': {
        const r = await db.query(
          `SELECT killer_uid AS uid, killer_name AS name, COUNT(*)::INT AS value
             FROM kills
            WHERE is_pvp = false AND killer_uid IS NOT NULL ${sinceClause}
            GROUP BY killer_uid, killer_name
            ORDER BY value DESC
            LIMIT $1`,
          [limit]
        );
        rows = r.rows;
        break;
      }
      case 'longest_shot': {
        const r = await db.query(
          `SELECT killer_uid AS uid, killer_name AS name, victim_name, weapon_name,
                  distance_m AS value, occurred_at
             FROM kills
            WHERE distance_m > 0 AND is_pvp = true ${sinceClause}
            ORDER BY distance_m DESC
            LIMIT $1`,
          [limit]
        );
        rows = r.rows;
        break;
      }
      case 'longest_life': {
        const r = await db.query(
          `SELECT victim_uid AS uid, victim_name AS name, victim_alive_s AS value, occurred_at
             FROM kills
            WHERE victim_alive_s > 0 ${sinceClause}
            ORDER BY value DESC
            LIMIT $1`,
          [limit]
        );
        rows = r.rows;
        break;
      }
      case 'most_deaths': {
        // Players global counters — no period filter applies cleanly.
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

    res.json({ type, period, limit, rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
