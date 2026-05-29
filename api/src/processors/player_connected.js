'use strict';

const db = require('../db');
const { normalizeServerId } = require('../lib/servers');

/**
 * player_connected — upsert player + open a session row.
 * Closes any session left open for the same UID (zombie session cleanup).
 */
module.exports = async function (data, envelope = {}) {
  const player = data?.player;
  if (!player?.uid) return;

  const balance = data.balance || {};
  const serverId = normalizeServerId(envelope.server_id || data.server_id);

  await db.tx(async (c) => {
    // Upsert player.
    await c.query(
      `INSERT INTO players (uid, name, current_balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (uid) DO UPDATE SET
         name            = EXCLUDED.name,
         last_seen       = NOW(),
         current_balance = EXCLUDED.current_balance`,
      [player.uid, player.name || 'Unknown', balance.total ?? 0]
    );

    // Close any stale open session (server crash, missed disconnect, etc).
    await c.query(
      `UPDATE sessions
         SET disconnected_at = NOW(),
             duration_s      = COALESCE(duration_s, EXTRACT(EPOCH FROM (NOW() - connected_at))::INT)
       WHERE player_uid = $1 AND server_id = $2 AND disconnected_at IS NULL`,
      [player.uid, serverId]
    );

    // Open new session.
    await c.query(
      `INSERT INTO sessions (server_id, player_uid, connected_at, balance_in)
       VALUES ($1, $2, NOW(), $3)`,
      [serverId, player.uid, balance.total ?? null]
    );
  });
};
