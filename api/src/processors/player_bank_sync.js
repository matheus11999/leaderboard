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
  const nextBankBalance = Number.isFinite(bankBalance) ? Math.max(0, Math.round(bankBalance)) : null;
  const nextCashBalance = Number.isFinite(cashBalance) ? Math.max(0, Math.round(cashBalance)) : null;
  const nextTotalBalance = Number.isFinite(totalBalance) ? Math.max(0, Math.round(totalBalance)) : null;

  await db.tx(async (c) => {
    const beforeR = await c.query(
      `SELECT bank_balance, bank_last_seen
         FROM players
        WHERE uid = $1
        FOR UPDATE`,
      [player.uid]
    );
    const before = beforeR.rows[0] || null;

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
        nextBankBalance,
        nextCashBalance,
      ]
    );

    if (before?.bank_last_seen && nextBankBalance != null && Number(before.bank_balance) !== nextBankBalance) {
      const bankBefore = Math.max(0, Math.round(Number(before.bank_balance) || 0));
      const delta = nextBankBalance - bankBefore;
      await c.query(
        `INSERT INTO bank_transactions (
           server_id, player_uid, player_name, transaction_type, amount,
           bank_before, bank_after, cash_balance, total_balance, source
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sync_delta')`,
        [
          serverId,
          player.uid,
          player.name || 'Unknown',
          delta > 0 ? 'deposit' : 'withdraw',
          Math.abs(delta),
          bankBefore,
          nextBankBalance,
          nextCashBalance,
          nextTotalBalance,
        ]
      );
    }

    await touchOpenSession(c, {
      serverId,
      playerUid: player.uid,
      balance: nextTotalBalance,
    });
  });
};
