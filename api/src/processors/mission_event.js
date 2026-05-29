'use strict';

const db = require('../db');
const { normalizeServerId } = require('../lib/servers');

/**
 * Handles mission_started and mission_ended.
 * Started → insert row with started_at = NOW().
 * Ended   → find most recent matching started mission by sub_idx and patch it.
 */
async function handleStarted(data, envelope = {}) {
  const serverId = normalizeServerId(envelope.server_id || data.server_id);
  await db.query(
    `INSERT INTO missions (server_id, started_at, sub_idx, mission_name)
     VALUES ($1, NOW(), $2, $3)`,
    [serverId, Number(data.sub_idx) || 0, data.mission || 'Unknown']
  );
}

async function handleEnded(data, envelope = {}) {
  const serverId = normalizeServerId(envelope.server_id || data.server_id);
  await db.tx(async (c) => {
    const r = await c.query(
      `SELECT id FROM missions
        WHERE server_id = $1 AND sub_idx = $2 AND ended_at IS NULL
        ORDER BY started_at DESC
        LIMIT 1`,
      [serverId, Number(data.sub_idx) || 0]
    );

    if (r.rows[0]) {
      await c.query(
        `UPDATE missions
            SET ended_at   = NOW(),
                won        = $1,
                cooldown_s = $2
          WHERE id = $3`,
        [
          typeof data.won === 'boolean' ? data.won : null,
          Number.isFinite(data.cooldown_seconds) ? data.cooldown_seconds : null,
          r.rows[0].id,
        ]
      );
    } else {
      // No matching start — insert ended row directly so we don't lose the event.
      await c.query(
        `INSERT INTO missions (server_id, started_at, ended_at, sub_idx, mission_name, won, cooldown_s)
         VALUES ($1, NOW(), NOW(), $2, $3, $4, $5)`,
        [
          serverId,
          Number(data.sub_idx) || 0,
          data.mission || 'Unknown',
          typeof data.won === 'boolean' ? data.won : null,
          Number.isFinite(data.cooldown_seconds) ? data.cooldown_seconds : null,
        ]
      );
    }
  });
}

module.exports = { handleStarted, handleEnded };
