'use strict';

const db = require('../db');
const { normalizeServerId } = require('../lib/servers');

/**
 * player_disconnected — close the open session, add duration to total_playtime_s.
 */
module.exports = async function (data, envelope = {}) {
  const player = data?.player;
  if (!player?.uid) return;

  const balance = data.balance || {};
  const serverId = normalizeServerId(envelope.server_id || data.server_id);

  await db.tx(async (c) => {
    // Close most recent open session for this player.
    const r = await c.query(
      `UPDATE sessions
         SET disconnected_at = NOW(),
             duration_s      = EXTRACT(EPOCH FROM (NOW() - connected_at))::INT,
             balance_out     = $2
       WHERE id = (
         SELECT id FROM sessions
          WHERE player_uid = $1 AND server_id = $3 AND disconnected_at IS NULL
          ORDER BY connected_at DESC
          LIMIT 1
       )
       RETURNING duration_s`,
      [player.uid, balance.total ?? null, serverId]
    );

    const dur = r.rows[0]?.duration_s ?? 0;

    // Bump aggregate playtime + last_seen + balance.
    await c.query(
      `UPDATE players
         SET total_playtime_s = total_playtime_s + $1,
             last_seen        = NOW(),
             current_balance  = COALESCE($3, current_balance)
       WHERE uid = $2`,
      [dur, player.uid, balance.total ?? null]
    );
  });
};
