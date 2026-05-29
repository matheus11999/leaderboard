'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const r = await db.query(
      `SELECT id, name, slug, public_enabled, is_default, created_at, updated_at
         FROM servers
        WHERE public_enabled = true
        ORDER BY is_default DESC, name ASC`
    );
    res.json({ rows: r.rows });
  } catch (err) {
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

module.exports = router;
