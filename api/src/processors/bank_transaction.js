'use strict';

const db = require('../db');
const { normalizeServerId } = require('../lib/servers');
const { touchOpenSession } = require('../lib/sessionActivity');

module.exports = async function (data, envelope = {}) {
  const player = data?.player;
  if (!player?.uid) return;

  const serverId = normalizeServerId(envelope.server_id || data.server_id);
  const type = String(data.transaction_type || '').toLowerCase();
  if (!['deposit', 'withdraw'].includes(type)) return;

  const amount = Math.max(0, Math.round(Number(data.amount) || 0));
  const bankBefore = Math.max(0, Math.round(Number(data.bank_before) || 0));
  const bankAfter = Math.max(0, Math.round(Number(data.bank_after) || 0));
  const cashBalanceRaw = Number(data.cash_balance);
  const totalBalanceRaw = Number(data.total_balance);
  const cashBalance = Number.isFinite(cashBalanceRaw) ? Math.max(0, Math.round(cashBalanceRaw)) : null;
  const totalBalance = Number.isFinite(totalBalanceRaw) ? Math.max(0, Math.round(totalBalanceRaw)) : null;
  const finalAmount = amount > 0 ? amount : Math.abs(bankAfter - bankBefore);
  if (finalAmount <= 0 || bankBefore === bankAfter) return;

  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO players (uid, name, bank_balance, bank_last_seen, current_balance)
       VALUES ($1, $2, $3, NOW(), COALESCE($4, 0))
       ON CONFLICT (uid) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, players.name),
         last_seen = NOW(),
         bank_balance = $3,
         bank_last_seen = NOW(),
         current_balance = COALESCE($4, players.current_balance)`,
      [player.uid, player.name || 'Unknown', bankAfter, cashBalance]
    );

    await c.query(
      `INSERT INTO bank_transactions (
         server_id, player_uid, player_name, transaction_type, amount,
         bank_before, bank_after, cash_balance, total_balance, source
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'atm')`,
      [
        serverId,
        player.uid,
        player.name || 'Unknown',
        type,
        finalAmount,
        bankBefore,
        bankAfter,
        cashBalance,
        totalBalance,
      ]
    );

    await touchOpenSession(c, {
      serverId,
      playerUid: player.uid,
      balance: totalBalance,
    });
  });
};
