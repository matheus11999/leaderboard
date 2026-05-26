'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('./db');
const logger = require('./lib/logger');

const JWT_EXPIRES_IN = '24h';
const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function requireAdmin(req, res, next) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = req.cookies?.token || bearer;
  if (!token) {
    return res.status(401).json({ error: 'no token' });
  }
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'missing username or password' });
  }

  const r = await db.query(
    'SELECT password_hash FROM admin_users WHERE username = $1',
    [username]
  );
  if (!r.rows[0]) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const ok = await bcrypt.compare(password, r.rows[0].password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
  });

  return res.json({ token, username });
}

async function seedAdminFromEnv() {
  const u = process.env.ADMIN_USER;
  const p = process.env.ADMIN_PASSWORD;
  if (!u || !p) {
    logger.warn('admin seed: ADMIN_USER/ADMIN_PASSWORD not set, skipping');
    return;
  }
  const hash = await bcrypt.hash(p, 12);
  await db.query(
    `INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [u, hash]
  );
  logger.info(`admin seed: upserted user "${u}"`);
}

module.exports = { requireAdmin, login, seedAdminFromEnv };
