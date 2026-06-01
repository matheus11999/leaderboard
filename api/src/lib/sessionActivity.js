'use strict';

async function touchOpenSession(client, { serverId, playerUid, balance = null }) {
  if (!serverId || !playerUid) return;

  await client.query(
    `UPDATE sessions
        SET last_seen = NOW(),
            balance_out = COALESCE($3, balance_out)
      WHERE id = (
        SELECT id FROM sessions
         WHERE server_id = $1
           AND player_uid = $2
           AND disconnected_at IS NULL
         ORDER BY connected_at DESC
         LIMIT 1
      )`,
    [serverId, playerUid, balance]
  );
}

async function ensureOpenSession(client, { serverId, playerUid, balance = null }) {
  if (!serverId || !playerUid) return;

  await touchOpenSession(client, { serverId, playerUid, balance });
  await client.query(
    `INSERT INTO sessions (server_id, player_uid, connected_at, last_seen, balance_in, balance_out)
     SELECT $1, $2, NOW(), NOW(), $3, $3
      WHERE NOT EXISTS (
        SELECT 1 FROM sessions
         WHERE server_id = $1
           AND player_uid = $2
           AND disconnected_at IS NULL
      )`,
    [serverId, playerUid, balance]
  );
}

module.exports = { touchOpenSession, ensureOpenSession };
