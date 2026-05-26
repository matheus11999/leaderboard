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
// Returns top seller and top buyer in the given window plus their top 3 items.
router.get('/', async (req, res) => {
  const interval = intervalFor(req.query.period);
  const since = interval ? `AND occurred_at > NOW() - ${interval}` : '';

  try {
    // Top seller — highest total received from successful sales.
    const sellerR = await db.query(
      `SELECT player_uid AS uid, player_name AS name,
              SUM(price * quantity)::INT AS total,
              COUNT(*)::INT AS transactions
         FROM shop_events
        WHERE success = true AND is_purchase = false ${since}
        GROUP BY player_uid, player_name
        ORDER BY total DESC
        LIMIT 1`
    );

    // Top buyer — highest total spent on successful purchases.
    const buyerR = await db.query(
      `SELECT player_uid AS uid, player_name AS name,
              SUM(price * quantity)::INT AS total,
              COUNT(*)::INT AS transactions
         FROM shop_events
        WHERE success = true AND is_purchase = true ${since}
        GROUP BY player_uid, player_name
        ORDER BY total DESC
        LIMIT 1`
    );

    async function topItems(uid, isPurchase) {
      if (!uid) return [];
      const r = await db.query(
        `SELECT item_name AS name, SUM(quantity)::INT AS qty
           FROM shop_events
          WHERE player_uid = $1 AND is_purchase = $2 AND success = true ${since}
          GROUP BY item_name
          ORDER BY qty DESC
          LIMIT 3`,
        [uid, isPurchase]
      );
      return r.rows;
    }

    const seller = sellerR.rows[0]
      ? {
          ...sellerR.rows[0],
          topItems: await topItems(sellerR.rows[0].uid, false),
        }
      : { uid: null, name: '—', total: 0, transactions: 0, topItems: [] };

    const buyer = buyerR.rows[0]
      ? {
          ...buyerR.rows[0],
          topItems: await topItems(buyerR.rows[0].uid, true),
        }
      : { uid: null, name: '—', total: 0, transactions: 0, topItems: [] };

    res.json({ period: req.query.period || 'all', seller, buyer });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
