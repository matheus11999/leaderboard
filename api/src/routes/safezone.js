'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

function intervalFor(period) {
  switch (String(period || 'all').toLowerCase()) {
    case 'daily':   return "INTERVAL '24 hours'";
    case 'weekly':  return "INTERVAL '7 days'";
    case 'monthly': return "INTERVAL '30 days'";
    default:        return null;
  }
}

// GET /api/safezone?period=daily|weekly|monthly|all
// Returns top sellers and buyers in the given window plus top 3 items for #1.
router.get('/', async (req, res) => {
  const interval = intervalFor(req.query.period);
  const since = interval ? `AND se.occurred_at > NOW() - ${interval}` : '';

  try {
    async function topPlayers(isPurchase, limit = 10) {
      const r = await db.query(
        `SELECT se.player_uid AS uid,
                COALESCE(NULLIF(p.name, ''), NULLIF(MAX(se.player_name), ''), se.player_uid, '-') AS name,
                SUM(se.price * se.quantity)::INT AS total,
                COUNT(*)::INT AS transactions
           FROM shop_events se
           LEFT JOIN players p ON p.uid = se.player_uid
          WHERE se.success = true AND se.is_purchase = $1 ${since}
          GROUP BY se.player_uid, p.name
          ORDER BY total DESC
          LIMIT $2`,
        [isPurchase, limit]
      );
      return r.rows;
    }

    const sellerRows = await topPlayers(false, 10);
    const buyerRows = await topPlayers(true, 10);

    async function topItems(uid, isPurchase) {
      if (!uid) return [];
      const r = await db.query(
        `SELECT item_name AS name, SUM(quantity)::INT AS qty
           FROM shop_events se
          WHERE player_uid = $1 AND is_purchase = $2 AND success = true ${since}
          GROUP BY item_name
          ORDER BY qty DESC
          LIMIT 3`,
        [uid, isPurchase]
      );
      return r.rows;
    }

    const seller = sellerRows[0]
      ? {
          ...sellerRows[0],
          topItems: await topItems(sellerRows[0].uid, false),
        }
      : { uid: null, name: '-', total: 0, transactions: 0, topItems: [] };

    const buyer = buyerRows[0]
      ? {
          ...buyerRows[0],
          topItems: await topItems(buyerRows[0].uid, true),
        }
      : { uid: null, name: '-', total: 0, transactions: 0, topItems: [] };

    res.json({
      period: req.query.period || 'all',
      seller,
      buyer,
      sellers: sellerRows,
      buyers: buyerRows,
    });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
