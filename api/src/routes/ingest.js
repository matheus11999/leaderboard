'use strict';

const express = require('express');
const db = require('../db');
const { safeEqual } = require('../lib/safeCompare');
const logger = require('../lib/logger');

const playerConnected    = require('../processors/player_connected');
const playerDisconnected = require('../processors/player_disconnected');
const playerSpawned      = require('../processors/player_spawned');
const playerKilled       = require('../processors/player_killed');
const shopEvent          = require('../processors/shop_event');
const missionEvent       = require('../processors/mission_event');

const PROCESSORS = {
  player_connected:    playerConnected,
  player_disconnected: playerDisconnected,
  player_spawned:      playerSpawned,
  player_killed:       playerKilled,
  shop_purchase:        shopEvent,
  shop_purchase_failed: shopEvent,
  shop_sale:            shopEvent,
  mission_started:     missionEvent.handleStarted,
  mission_ended:       missionEvent.handleEnded,
};

const router = express.Router();

router.post('/', async (req, res) => {
  const key = req.header('x-brasilz-api-key');
  if (!safeEqual(key, process.env.INGEST_API_KEY)) {
    return res.status(401).json({ error: 'invalid api key' });
  }

  const e = req.body;
  if (!e || typeof e !== 'object' || !e.event_type || !e.server_id || !e.data) {
    return res.status(400).json({ error: 'invalid envelope' });
  }

  // 1) Audit log first — even unknown event_types get stored.
  let rawId;
  try {
    const ins = await db.query(
      `INSERT INTO events_raw (server_id, event_type, timestamp_unix, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [e.server_id, e.event_type, Number(e.timestamp_unix) || 0, e.data]
    );
    rawId = ins.rows[0].id;
  } catch (err) {
    logger.error('ingest: failed to store events_raw', err.message);
    return res.status(500).json({ error: 'storage failed' });
  }

  // 2) Route to processor. Ack 204 either way — audit row already saved.
  const proc = PROCESSORS[e.event_type];
  if (!proc) {
    logger.warn('ingest: no processor for event_type', e.event_type);
    await db.query(
      `UPDATE events_raw SET error = $1 WHERE id = $2`,
      ['no processor', rawId]
    );
    return res.status(204).end();
  }

  try {
    await proc(e.data);
    await db.query('UPDATE events_raw SET processed = true WHERE id = $1', [rawId]);
  } catch (err) {
    logger.error(`ingest: processor ${e.event_type} failed:`, err.message);
    await db.query(
      `UPDATE events_raw SET error = $1 WHERE id = $2`,
      [String(err.message).slice(0, 500), rawId]
    );
    // Still 204 so mod doesn't queue retries (mod is best-effort by design).
  }

  return res.status(204).end();
});

module.exports = router;
