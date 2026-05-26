'use strict';

const db = require('../db');

/**
 * Handles shop_purchase, shop_purchase_failed, shop_sale.
 * All three share the same payload shape — see README_PortalWebhook.md.
 */
module.exports = async function (data) {
  const player = data?.player;
  if (!player?.uid) return;

  const item = data.item || {};
  const balance = data.balance || {};

  await db.tx(async (c) => {
    // Defensive upsert.
    await c.query(
      `INSERT INTO players (uid, name)
       VALUES ($1, $2)
       ON CONFLICT (uid) DO UPDATE SET last_seen = NOW()`,
      [player.uid, player.name || 'Unknown']
    );

    await c.query(
      `INSERT INTO shop_events (
         player_uid, player_name, item_name, item_prefab,
         quantity, is_purchase, success, price, balance_after
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        player.uid,
        player.name || 'Unknown',
        item.name || 'Unknown',
        item.prefab || null,
        Number.isFinite(data.quantity) ? data.quantity : 0,
        !!data.is_purchase,
        !!data.success,
        Number.isFinite(data.price) ? data.price : 0,
        Number.isFinite(balance.total) ? balance.total : null,
      ]
    );

    // Keep balance snapshot fresh on success.
    if (data.success && Number.isFinite(balance.total)) {
      await c.query(
        `UPDATE players SET current_balance = $1, last_seen = NOW() WHERE uid = $2`,
        [balance.total, player.uid]
      );
    }
  });
};
