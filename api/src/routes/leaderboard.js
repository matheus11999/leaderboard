'use strict';

const express = require('express');
const db = require('../db');
const { serverFilter } = require('../lib/servers');

const router = express.Router();

const VALID_TYPES = new Set([
  'pvp_kills',
  'pve_kills',
  'longest_shot',
  'longest_life',
  'most_deaths',
  'total_playtime',
  'current_kill_streak',
  'best_kill_streak',
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

async function padPlayerRows(rows, limit, serverId) {
  if (rows.length >= limit) return rows;

  const seen = new Set(rows.map((r) => r.uid).filter(Boolean));
  const needed = limit - rows.length;
  const params = [[...seen], needed];
  const serverJoin = serverId
    ? `JOIN (
         SELECT player_uid, MAX(connected_at) AS last_activity
           FROM sessions
          WHERE server_id = $3
          GROUP BY player_uid
       ) sp ON sp.player_uid = p.uid`
    : '';
  const order = serverId ? 'sp.last_activity DESC NULLS LAST, p.last_seen DESC' : 'p.last_seen DESC';
  if (serverId) params.push(serverId);
  const r = await db.query(
    `SELECT p.uid, p.name, 0::INT AS value
       FROM players p
       ${serverJoin}
      WHERE NOT (p.uid = ANY($1::TEXT[]))
      ORDER BY ${order}
      LIMIT $2`,
    params
  );

  return rows.concat(r.rows);
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
  const selectedServer = serverFilter(req);
  const serverClause = selectedServer ? 'AND server_id = $2' : '';
  const queryParams = selectedServer ? [limit, selectedServer] : [limit];

  try {
    let rows;

    switch (type) {
      case 'pvp_kills': {
        const r = await db.query(
          `SELECT killer_uid AS uid, killer_name AS name, COUNT(*)::INT AS value
             FROM kills
            WHERE is_pvp = true AND is_suicide = false AND killer_uid IS NOT NULL ${serverClause} ${sinceClause}
            GROUP BY killer_uid, killer_name
            ORDER BY value DESC
            LIMIT $1`,
          queryParams
        );
        rows = await padPlayerRows(r.rows, limit, selectedServer);
        break;
      }
      case 'pve_kills': {
        const r = await db.query(
          `SELECT killer_uid AS uid, killer_name AS name, COUNT(*)::INT AS value
             FROM kills
            WHERE is_pvp = false AND is_suicide = false AND killer_uid IS NOT NULL ${serverClause} ${sinceClause}
            GROUP BY killer_uid, killer_name
            ORDER BY value DESC
            LIMIT $1`,
          queryParams
        );
        rows = await padPlayerRows(r.rows, limit, selectedServer);
        break;
      }
      case 'longest_shot': {
        const r = await db.query(
          `SELECT killer_uid AS uid, killer_name AS name, victim_name, weapon_name,
                  distance_m AS value, occurred_at
             FROM kills
            WHERE distance_m > 0 AND is_pvp = true ${serverClause} ${sinceClause}
            ORDER BY distance_m DESC
            LIMIT $1`,
          queryParams
        );
        rows = await padPlayerRows(r.rows, limit, selectedServer);
        break;
      }
      case 'longest_life': {
        const r = await db.query(
          `SELECT victim_uid AS uid,
                  (ARRAY_AGG(victim_name ORDER BY occurred_at DESC))[1] AS name,
                  MAX(victim_alive_s)::INT AS value,
                  MAX(occurred_at) AS occurred_at
             FROM kills
            WHERE victim_uid IS NOT NULL AND victim_alive_s > 0 ${serverClause} ${sinceClause}
            GROUP BY victim_uid
            ORDER BY value DESC
            LIMIT $1`,
          queryParams
        );
        rows = await padPlayerRows(r.rows, limit, selectedServer);
        break;
      }
      case 'most_deaths': {
        const r = await db.query(
          `SELECT victim_uid AS uid, victim_name AS name, COUNT(*)::INT AS value
             FROM kills
            WHERE victim_uid IS NOT NULL AND is_suicide = false ${serverClause} ${sinceClause}
            GROUP BY victim_uid, victim_name
            ORDER BY value DESC
            LIMIT $1`,
          queryParams
        );
        rows = await padPlayerRows(r.rows, limit, selectedServer);
        break;
      }
      case 'total_playtime': {
        const r = selectedServer
          ? await db.query(
              `SELECT p.uid, p.name, COALESCE(SUM(s.duration_s), 0)::INT AS value
                 FROM players p
                 JOIN sessions s ON s.player_uid = p.uid
                WHERE s.server_id = $2
                GROUP BY p.uid, p.name
               HAVING COALESCE(SUM(s.duration_s), 0) > 0
                ORDER BY value DESC
                LIMIT $1`,
              queryParams
            )
          : await db.query(
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
      case 'current_kill_streak': {
        const r = await db.query(
          `SELECT uid, name, current_kill_streak AS value, bounty_active, bounty_value
             FROM players
            WHERE current_kill_streak > 0
              ${selectedServer ? `AND EXISTS (SELECT 1 FROM sessions s WHERE s.player_uid = players.uid AND s.server_id = $2)` : ''}
            ORDER BY current_kill_streak DESC, bounty_value DESC
            LIMIT $1`,
          queryParams
        );
        rows = await padPlayerRows(r.rows, limit, selectedServer);
        break;
      }
      case 'best_kill_streak': {
        const r = await db.query(
          `SELECT uid, name, best_kill_streak AS value
             FROM players
            WHERE best_kill_streak > 0
              ${selectedServer ? `AND EXISTS (SELECT 1 FROM sessions s WHERE s.player_uid = players.uid AND s.server_id = $2)` : ''}
            ORDER BY best_kill_streak DESC
            LIMIT $1`,
          queryParams
        );
        rows = await padPlayerRows(r.rows, limit, selectedServer);
        break;
      }
    }

    res.json({ type, period, limit, rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
