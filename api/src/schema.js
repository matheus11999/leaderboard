'use strict';

const db = require('./db');
const logger = require('./lib/logger');

async function ensureSchema() {
  const statements = [
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS current_kill_streak INT NOT NULL DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS best_kill_streak INT NOT NULL DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS bounty_active BOOL NOT NULL DEFAULT false`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS bounty_value INT NOT NULL DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS bounty_started_at TIMESTAMPTZ`,
    `CREATE TABLE IF NOT EXISTS bounty_settings (
       id BOOL PRIMARY KEY DEFAULT true CHECK (id),
       enabled BOOL NOT NULL DEFAULT true,
       min_kills INT NOT NULL DEFAULT 5 CHECK (min_kills >= 1),
       base_value INT NOT NULL DEFAULT 5000 CHECK (base_value >= 0),
       increase_pct REAL NOT NULL DEFAULT 20 CHECK (increase_pct >= 0),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `INSERT INTO bounty_settings (id)
       VALUES (true)
       ON CONFLICT (id) DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS bounty_events (
       id BIGSERIAL PRIMARY KEY,
       occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       server_id TEXT NOT NULL DEFAULT 'brasilz-main',
       target_uid TEXT REFERENCES players(uid) ON DELETE SET NULL,
       target_name TEXT NOT NULL,
       hunter_uid TEXT REFERENCES players(uid) ON DELETE SET NULL,
       hunter_name TEXT NOT NULL,
       target_streak INT NOT NULL DEFAULT 0,
       bounty_value INT NOT NULL DEFAULT 0,
       weapon_name TEXT,
       weapon_prefab TEXT,
       distance_m REAL,
       bounty_started_at TIMESTAMPTZ,
       claimed BOOL NOT NULL DEFAULT false,
       claimed_at TIMESTAMPTZ,
       claim_note TEXT
     )`,
    `ALTER TABLE bounty_events ADD COLUMN IF NOT EXISTS server_id TEXT NOT NULL DEFAULT 'brasilz-main'`,
    `ALTER TABLE bounty_events ADD COLUMN IF NOT EXISTS bounty_started_at TIMESTAMPTZ`,
    `ALTER TABLE bounty_events ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ`,
    `ALTER TABLE bounty_events ADD COLUMN IF NOT EXISTS claim_note TEXT`,
    `ALTER TABLE bounty_events ALTER COLUMN claimed SET DEFAULT false`,
    `CREATE INDEX IF NOT EXISTS idx_players_bounty_active ON players (bounty_active, bounty_value DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_players_current_kill_streak ON players (current_kill_streak DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_players_best_kill_streak ON players (best_kill_streak DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_bounty_events_occurred_at ON bounty_events (occurred_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_bounty_events_pending ON bounty_events (server_id, occurred_at) WHERE claimed = false`,
    `CREATE INDEX IF NOT EXISTS idx_bounty_events_hunter_uid ON bounty_events (hunter_uid) WHERE hunter_uid IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_bounty_events_target_uid ON bounty_events (target_uid) WHERE target_uid IS NOT NULL`,
  ];

  for (const sql of statements) await db.query(sql);
  logger.info('db: schema ready');
}

module.exports = { ensureSchema };
