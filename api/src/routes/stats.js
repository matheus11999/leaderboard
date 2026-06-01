'use strict';

const express = require('express');
const db = require('../db');
const { serverFilter } = require('../lib/servers');
const { onlineGraceSeconds, onlineSql } = require('../lib/online');

const router = express.Router();

// GET /api/stats/server
router.get('/server', async (req, res) => {
  const selectedServer = serverFilter(req);
  const serverWhere = selectedServer ? 'WHERE server_id = $1' : '';
  const serverAnd = selectedServer ? 'AND server_id = $1' : '';
  const params = selectedServer ? [selectedServer] : [];
  const onlineSeconds = onlineGraceSeconds();
  const onlineParams = selectedServer ? [onlineSeconds, selectedServer] : [onlineSeconds];
  const onlineServerAnd = selectedServer ? 'AND server_id = $2' : '';
  try {
    const online = await db.query(
      `SELECT COUNT(*)::INT AS n FROM sessions s WHERE ${onlineSql('s', '$1')} ${onlineServerAnd}`,
      onlineParams
    );
    const totalPlayers = await db.query(
      selectedServer
        ? `SELECT COUNT(DISTINCT player_uid)::INT AS n FROM sessions WHERE server_id = $1`
        : `SELECT COUNT(*)::INT AS n FROM players`,
      params
    );
    const totalKills = await db.query(`SELECT COUNT(*)::INT AS n FROM kills ${serverWhere}`, params);
    const totalPvP = await db.query(`SELECT COUNT(*)::INT AS n FROM kills WHERE is_pvp = true ${serverAnd}`, params);
    const activeMissions = await db.query(
      `SELECT COUNT(*)::INT AS n FROM missions WHERE ended_at IS NULL ${serverAnd}`,
      params
    );
    const last24h = await db.query(
      `SELECT COUNT(*)::INT AS n FROM kills WHERE occurred_at > NOW() - INTERVAL '24 hours' ${serverAnd}`,
      params
    );
    const activeBounties = await db.query(
      selectedServer
        ? `SELECT COUNT(*)::INT AS n
             FROM players p
            WHERE p.bounty_active = true
              AND (p.bounty_server_id = $1 OR (p.bounty_server_id IS NULL AND EXISTS (SELECT 1 FROM sessions s WHERE s.player_uid = p.uid AND s.server_id = $1)))`
        : `SELECT COUNT(*)::INT AS n FROM players WHERE bounty_active = true`,
      params
    );

    res.json({
      online_now: online.rows[0].n,
      total_players_registered: totalPlayers.rows[0].n,
      total_kills: totalKills.rows[0].n,
      total_pvp_kills: totalPvP.rows[0].n,
      active_missions: activeMissions.rows[0].n,
      kills_last_24h: last24h.rows[0].n,
      active_bounties: activeBounties.rows[0].n,
      online_grace_seconds: onlineSeconds,
    });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
