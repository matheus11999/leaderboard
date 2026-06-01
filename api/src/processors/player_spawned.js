'use strict';

const db = require('../db');
const { normalizeServerId } = require('../lib/servers');

/**
 * player_spawned — record spawn point + prefab on the latest open session.
 * If the player has no open session (rare, fresh server restart edge case),
 * we silently skip — player_connected will set things up on next reconnect.
 */
module.exports = async function (data, envelope = {}) {
  const player = data?.player;
  if (!player?.uid) return;

  const balance = data.balance || {};
  const serverId = normalizeServerId(envelope.server_id || data.server_id);

  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO players (uid, name, current_balance, life_started_at, life_server_id)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (uid) DO UPDATE SET
         name = EXCLUDED.name,
         last_seen = NOW(),
         current_balance = COALESCE(EXCLUDED.current_balance, players.current_balance),
         life_started_at = NOW(),
         life_server_id = $4`,
      [player.uid, player.name || 'Unknown', balance.total ?? 0, serverId]
    );

    // Keep balance in players in sync if provided.
    if (balance.total != null) {
      await c.query(
        `UPDATE players SET current_balance = $1, last_seen = NOW() WHERE uid = $2`,
        [balance.total, player.uid]
      );
    }

    // Record spawn point on the latest open session (or last session if none open).
    await c.query(
      `UPDATE sessions
         SET spawn_point  = COALESCE($2, spawn_point),
             spawn_prefab = COALESCE($3, spawn_prefab),
             last_seen = NOW(),
             balance_out = COALESCE($5, balance_out)
       WHERE id = (
         SELECT id FROM sessions
          WHERE player_uid = $1 AND server_id = $4
          ORDER BY (disconnected_at IS NULL) DESC, connected_at DESC
          LIMIT 1
       )`,
      [player.uid, data.spawn_point || null, data.prefab || null, serverId, balance.total ?? null]
    );
  });
};
