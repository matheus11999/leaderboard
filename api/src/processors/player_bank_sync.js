'use strict';

const db = require('../db');
const { normalizeServerId } = require('../lib/servers');
const { touchOpenSession } = require('../lib/sessionActivity');

module.exports = async function (data, envelope = {}) {
  const player = data?.player;
  if (!player?.uid) return;

  const serverId = normalizeServerId(envelope.server_id || data.server_id);
  const bankBalance = Number(data.bank_balance);
  const cashBalance = Number(data.cash_balance);
  const totalBalance = Number(data.total_balance);

  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO players (uid, name, bank_balance, bank_last_seen, current_balance)
       VALUES ($1, $2, COALESCE($3, 0), NOW(), COALESCE($4, 0))
       ON CONFLICT (uid) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, players.name),
         last_seen = NOW(),
         bank_balance = COALESCE($3, players.bank_balance),
         bank_last_seen = CASE WHEN $3::INT IS NULL THEN players.bank_last_seen ELSE NOW() END,
         current_balance = COALESCE($4, players.current_balance)`,
      [
        player.uid,
        player.name || 'Unknown',
        Number.isFinite(bankBalance) ? Math.max(0, Math.round(bankBalance)) : null,
        Number.isFinite(cashBalance) ? Math.max(0, Math.round(cashBalance)) : null,
      ]
    );

    await touchOpenSession(c, {
      serverId,
      playerUid: player.uid,
      balance: Number.isFinite(totalBalance) ? Math.max(0, Math.round(totalBalance)) : null,
    });
  });
};
