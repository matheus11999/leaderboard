'use strict';

const express = require('express');
const db = require('../db');
const { safeEqual } = require('../lib/safeCompare');

const router = express.Router();

function requireApiKey(req, res, next) {
  const key = req.header('x-brasilz-api-key') || req.body?.api_key;
  if (!safeEqual(key, process.env.INGEST_API_KEY)) {
    return res.status(401).json({ error: 'invalid api key' });
  }
  next();
}

function clampLimit(raw, def = 10, max = 50) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

router.use(requireApiKey);

async function sendPendingRewards(req, res, source) {
  const serverId = String(source?.server_id || '').trim();
  if (!serverId) return res.status(400).json({ error: 'server_id is required' });

  const limit = clampLimit(source?.limit);

  try {
    const r = await db.query(
      `SELECT id::int AS id, occurred_at, server_id, target_uid, target_name,
              hunter_uid, hunter_name, target_streak, bounty_value
         FROM bounty_events
        WHERE server_id = $1
          AND claimed = false
          AND hunter_uid IS NOT NULL
          AND bounty_value > 0
        ORDER BY occurred_at ASC
        LIMIT $2`,
      [serverId, limit]
    );
    res.json({ ok: true, limit, rows: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
}

router.get('/pending', async (req, res) => {
  return sendPendingRewards(req, res, req.query);
});

router.post('/pending', async (req, res) => {
  return sendPendingRewards(req, res, req.body);
});

router.post('/claim', async (req, res) => {
  const rewardId = Number(req.body?.reward_id);
  const serverId = String(req.body?.server_id || '').trim();
  const hunterUid = String(req.body?.hunter_uid || '').trim();
  const paidAmount = Number(req.body?.paid_amount);

  if (!Number.isSafeInteger(rewardId) || rewardId <= 0) {
    return res.status(400).json({ error: 'reward_id is required' });
  }
  if (!serverId || !hunterUid) {
    return res.status(400).json({ error: 'server_id and hunter_uid are required' });
  }

  try {
    const r = await db.query(
      `UPDATE bounty_events
          SET claimed = true,
              claimed_at = NOW(),
              claim_note = $4
        WHERE id = $1
          AND server_id = $2
          AND hunter_uid = $3
          AND claimed = false
        RETURNING id, bounty_value, claimed_at`,
      [
        rewardId,
        serverId,
        hunterUid,
        Number.isFinite(paidAmount) ? `paid=${Math.max(0, Math.round(paidAmount))}` : 'paid',
      ]
    );

    if (r.rows[0]) return res.json({ ok: true, reward: r.rows[0] });

    const existing = await db.query(
      `SELECT id, claimed, hunter_uid, server_id
         FROM bounty_events
        WHERE id = $1`,
      [rewardId]
    );
    const row = existing.rows[0];
    if (row?.claimed === true) {
      return res.json({ ok: true, already_claimed: true, reward_id: rewardId });
    }

    return res.status(404).json({ error: 'pending reward not found' });
  } catch (err) {
    res.status(500).json({ error: 'claim failed', message: err.message });
  }
});

module.exports = router;
