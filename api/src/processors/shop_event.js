'use strict';

const db = require('../db');
const { normalizeServerId } = require('../lib/servers');
const { touchOpenSession } = require('../lib/sessionActivity');

const SHOP_EVENT_EXCLUDED_PREFABS = new Set([
  '{BEA6BE0F1ACA4BAE}Prefabs/Items/Gems/Amethyst/Amethyst.et',
  '{7FFC2F5327D6A9DE}Prefabs/Items/Gems/Citrine/Citrine.et',
  '{46E76A63895B9A19}Prefabs/Items/Gems/Emerald/emerald.et',
  '{25E9C251333236F0}Prefabs/Items/Gems/Obsidian/Obsidian.et',
  '{9E6C75D27C169835}Prefabs/Items/Gems/Ruby/Ruby.et',
  '{6C6BD7C20FDCE35C}Prefabs/Items/Gems/Topaz/Topaz.et',
]);

/**
 * Handles shop_purchase, shop_purchase_failed, shop_sale.
 * All three share the same payload shape — see README_PortalWebhook.md.
 */
module.exports = async function (data, envelope = {}) {
  const player = data?.player;
  if (!player?.uid) return;

  const item = data.item || {};
  const balance = data.balance || {};
  const isExcludedShopEvent = SHOP_EVENT_EXCLUDED_PREFABS.has(item.prefab || '');
  const serverId = normalizeServerId(envelope.server_id || data.server_id);

  await db.tx(async (c) => {
    // Defensive upsert.
    await c.query(
      `INSERT INTO players (uid, name)
       VALUES ($1, $2)
       ON CONFLICT (uid) DO UPDATE SET last_seen = NOW()`,
      [player.uid, player.name || 'Unknown']
    );

    if (!isExcludedShopEvent) {
      await c.query(
        `INSERT INTO shop_events (
           server_id, player_uid, player_name, item_name, item_prefab,
           quantity, is_purchase, success, price, balance_after
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          serverId,
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
    }

    // Keep balance snapshot fresh on success.
    if (data.success && Number.isFinite(balance.total)) {
      await c.query(
        `UPDATE players SET current_balance = $1, last_seen = NOW() WHERE uid = $2`,
        [balance.total, player.uid]
      );
    }

    await touchOpenSession(c, {
      serverId,
      playerUid: player.uid,
      balance: Number.isFinite(balance.total) ? balance.total : null,
    });
  });
};
