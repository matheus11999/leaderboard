'use strict';

const express = require('express');
const db = require('../db');
const { serverFilter } = require('../lib/servers');

const router = express.Router();

router.get('/', async (req, res) => {
  let limit = Number(req.query.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = 50;
  limit = Math.min(Math.floor(limit), 200);

  const since = req.query.since;
  const type = String(req.query.type || '').toLowerCase();
  const selectedServer = serverFilter(req);
  const params = [limit];
  const conds = ['k.is_suicide = false'];
  if (selectedServer) {
    params.push(selectedServer);
    conds.push(`k.server_id = $${params.length}`);
  }
  if (type === 'pvp') conds.push('k.is_pvp = true');
  else if (type === 'pve') conds.push('k.is_pvp = false');
  if (since) {
    params.push(since);
    conds.push(`k.occurred_at > $${params.length}`);
  }
  const where = `WHERE ${conds.join(' AND ')}`;

  try {
    const r = await db.query(
      `SELECT k.id, k.occurred_at, k.victim_uid, k.victim_name, k.victim_prefab,
              k.killer_type, k.killer_uid, k.killer_name, k.killer_prefab,
              weapon_name, weapon_prefab,
              k.distance_m, k.is_pvp, k.is_suicide, k.victim_alive_s,
              EXISTS (
                SELECT 1
                  FROM bounty_events b
                 WHERE b.target_uid = k.victim_uid
                   AND b.hunter_uid = k.killer_uid
                   AND b.server_id = k.server_id
                   AND ABS(EXTRACT(EPOCH FROM (b.occurred_at - k.occurred_at))) <= 5
              ) AS is_bounty_kill
         FROM kills k
         ${where}
        ORDER BY k.occurred_at DESC
        LIMIT $1`,
      params
    );
    res.json({ limit, rows: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
