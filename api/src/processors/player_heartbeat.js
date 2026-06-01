'use strict';

const db = require('../db');
const { normalizeServerId } = require('../lib/servers');
const { ensureOpenSession } = require('../lib/sessionActivity');

module.exports = async function (data, envelope = {}) {
  const player = data?.player;
  if (!player?.uid) return;

  const balance = data.balance || {};
  const serverId = normalizeServerId(envelope.server_id || data.server_id);
  const currentBalance = Number.isFinite(balance.total) ? balance.total : null;

  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO players (uid, name, current_balance)
       VALUES ($1, $2, COALESCE($3, 0))
       ON CONFLICT (uid) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, players.name),
         last_seen = NOW(),
         current_balance = COALESCE($3, players.current_balance)`,
      [player.uid, player.name || 'Unknown', currentBalance]
    );

    await ensureOpenSession(c, {
      serverId,
      playerUid: player.uid,
      balance: currentBalance,
    });
  });
};
