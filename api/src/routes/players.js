'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/players/:uid
router.get('/:uid', async (req, res) => {
  const uid = req.params.uid;
  try {
    const playerR = await db.query(`SELECT * FROM players WHERE uid = $1`, [uid]);
    if (!playerR.rows[0]) {
      return res.status(404).json({ error: 'player not found' });
    }

    const recentKillsR = await db.query(
      `SELECT id, occurred_at, victim_name, weapon_name, distance_m, killer_type
         FROM kills
        WHERE killer_uid = $1
        ORDER BY occurred_at DESC
        LIMIT 20`,
      [uid]
    );

    const recentDeathsR = await db.query(
      `SELECT id, occurred_at, killer_name, killer_type, weapon_name, distance_m, victim_alive_s
         FROM kills
        WHERE victim_uid = $1
        ORDER BY occurred_at DESC
        LIMIT 20`,
      [uid]
    );

    const recentSessionsR = await db.query(
      `SELECT id, connected_at, disconnected_at, duration_s, spawn_point
         FROM sessions
        WHERE player_uid = $1
        ORDER BY connected_at DESC
        LIMIT 10`,
      [uid]
    );

    res.json({
      player: playerR.rows[0],
      recent_kills: recentKillsR.rows,
      recent_deaths: recentDeathsR.rows,
      recent_sessions: recentSessionsR.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
