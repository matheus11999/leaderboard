'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/stats/server
router.get('/server', async (_req, res) => {
  try {
    const online = await db.query(
      `SELECT COUNT(*)::INT AS n FROM sessions WHERE disconnected_at IS NULL`
    );
    const totalPlayers = await db.query(`SELECT COUNT(*)::INT AS n FROM players`);
    const totalKills = await db.query(`SELECT COUNT(*)::INT AS n FROM kills`);
    const totalPvP = await db.query(`SELECT COUNT(*)::INT AS n FROM kills WHERE is_pvp = true`);
    const activeMissions = await db.query(
      `SELECT COUNT(*)::INT AS n FROM missions WHERE ended_at IS NULL`
    );
    const last24h = await db.query(
      `SELECT COUNT(*)::INT AS n FROM kills WHERE occurred_at > NOW() - INTERVAL '24 hours'`
    );

    res.json({
      online_now: online.rows[0].n,
      total_players_registered: totalPlayers.rows[0].n,
      total_kills: totalKills.rows[0].n,
      total_pvp_kills: totalPvP.rows[0].n,
      active_missions: activeMissions.rows[0].n,
      kills_last_24h: last24h.rows[0].n,
    });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
