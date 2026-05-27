'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  let limit = Number(req.query.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = 50;
  limit = Math.min(Math.floor(limit), 200);

  const since = req.query.since;
  const params = [limit];
  const conds = ['is_suicide = false'];
  if (since) {
    conds.push(`occurred_at > $2`);
    params.push(since);
  }
  const where = `WHERE ${conds.join(' AND ')}`;

  try {
    const r = await db.query(
      `SELECT id, occurred_at, victim_uid, victim_name, victim_prefab,
              killer_type, killer_uid, killer_name, killer_prefab,
              weapon_name, weapon_prefab,
              distance_m, is_pvp, is_suicide, victim_alive_s
         FROM kills
         ${where}
        ORDER BY occurred_at DESC
        LIMIT $1`,
      params
    );
    res.json({ limit, rows: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
