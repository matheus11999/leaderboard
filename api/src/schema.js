'use strict';

const db = require('./db');
const logger = require('./lib/logger');

async function ensureSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS servers (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       slug TEXT UNIQUE NOT NULL,
       public_enabled BOOL NOT NULL DEFAULT true,
       is_default BOOL NOT NULL DEFAULT false,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `INSERT INTO servers (id, name, slug, public_enabled, is_default)
       VALUES ('brasilz-main', 'BrasilZ Main', 'brasilz-main', true, true)
       ON CONFLICT (id) DO NOTHING`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS server_id TEXT NOT NULL DEFAULT 'brasilz-main'`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ`,
    `UPDATE sessions SET last_seen = COALESCE(last_seen, disconnected_at, connected_at) WHERE last_seen IS NULL`,
    `ALTER TABLE kills ADD COLUMN IF NOT EXISTS server_id TEXT NOT NULL DEFAULT 'brasilz-main'`,
    `ALTER TABLE shop_events ADD COLUMN IF NOT EXISTS server_id TEXT NOT NULL DEFAULT 'brasilz-main'`,
    `ALTER TABLE missions ADD COLUMN IF NOT EXISTS server_id TEXT NOT NULL DEFAULT 'brasilz-main'`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS current_kill_streak INT NOT NULL DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS best_kill_streak INT NOT NULL DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS bounty_active BOOL NOT NULL DEFAULT false`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS bounty_value INT NOT NULL DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS bounty_streak INT NOT NULL DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS bounty_started_at TIMESTAMPTZ`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS bounty_server_id TEXT`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS bank_balance INT NOT NULL DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS bank_last_seen TIMESTAMPTZ`,
    `CREATE TABLE IF NOT EXISTS bank_transactions (
       id BIGSERIAL PRIMARY KEY,
       occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       server_id TEXT NOT NULL DEFAULT 'brasilz-main',
       player_uid TEXT REFERENCES players(uid) ON DELETE CASCADE,
       player_name TEXT NOT NULL DEFAULT 'Unknown',
       transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdraw', 'portal_payment')),
       amount INT NOT NULL CHECK (amount > 0),
       bank_before INT NOT NULL DEFAULT 0,
       bank_after INT NOT NULL DEFAULT 0,
       cash_balance INT,
       total_balance INT,
       source TEXT NOT NULL DEFAULT 'sync_delta'
     )`,
    `ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_transaction_type_check`,
    `ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_transaction_type_check CHECK (transaction_type IN ('deposit', 'withdraw', 'portal_payment'))`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS life_started_at TIMESTAMPTZ`,
    `ALTER TABLE players ADD COLUMN IF NOT EXISTS life_server_id TEXT`,
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
    `UPDATE players p
        SET bounty_streak = GREATEST(
          p.bounty_streak,
          p.current_kill_streak,
          CASE
            WHEN p.bounty_value > 0 THEN (
              s.min_kills +
              CASE
                WHEN s.base_value > 0 AND s.increase_pct > 0 THEN
                  GREATEST(0, ROUND(LN(GREATEST(p.bounty_value::NUMERIC, 1) / s.base_value::NUMERIC) / LN(1 + (s.increase_pct::NUMERIC / 100)))::INT)
                ELSE 0
              END
            )
            ELSE 0
          END
        )
       FROM bounty_settings s
      WHERE p.bounty_active = true
        AND p.bounty_streak = 0`,
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
    `CREATE TABLE IF NOT EXISTS manual_payments (
       id BIGSERIAL PRIMARY KEY,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       server_id TEXT NOT NULL DEFAULT 'brasilz-main',
       player_uid TEXT REFERENCES players(uid) ON DELETE SET NULL,
       player_name TEXT NOT NULL,
       amount INT NOT NULL CHECK (amount > 0),
       note TEXT,
       claimed BOOL NOT NULL DEFAULT false,
       claimed_at TIMESTAMPTZ,
       claim_note TEXT,
       created_by TEXT
     )`,
    `ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS server_id TEXT NOT NULL DEFAULT 'brasilz-main'`,
    `ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS player_uid TEXT REFERENCES players(uid) ON DELETE SET NULL`,
    `ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS player_name TEXT NOT NULL DEFAULT 'Unknown'`,
    `ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS amount INT NOT NULL DEFAULT 0`,
    `ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS note TEXT`,
    `ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS claimed BOOL NOT NULL DEFAULT false`,
    `ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ`,
    `ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS claim_note TEXT`,
    `ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS created_by TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_players_bounty_active ON players (bounty_active, bounty_value DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_players_bounty_server ON players (bounty_server_id, bounty_value DESC) WHERE bounty_active = true`,
    `CREATE INDEX IF NOT EXISTS idx_players_current_kill_streak ON players (current_kill_streak DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_players_best_kill_streak ON players (best_kill_streak DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_players_life_started ON players (life_server_id, life_started_at) WHERE life_started_at IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_players_bank_balance ON players (bank_balance DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_bank_transactions_player ON bank_transactions (player_uid, occurred_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_bank_transactions_server ON bank_transactions (server_id, occurred_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_bounty_events_occurred_at ON bounty_events (occurred_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_bounty_events_pending ON bounty_events (server_id, occurred_at) WHERE claimed = false`,
    `CREATE INDEX IF NOT EXISTS idx_bounty_events_hunter_uid ON bounty_events (hunter_uid) WHERE hunter_uid IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_bounty_events_target_uid ON bounty_events (target_uid) WHERE target_uid IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_manual_payments_created_at ON manual_payments (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_manual_payments_pending ON manual_payments (server_id, created_at) WHERE claimed = false`,
    `CREATE INDEX IF NOT EXISTS idx_manual_payments_player_uid ON manual_payments (player_uid, created_at DESC) WHERE player_uid IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_servers_public ON servers (public_enabled, is_default DESC, name ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_server_open ON sessions (server_id, connected_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_server_open_now ON sessions (server_id) WHERE disconnected_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_server_last_seen ON sessions (server_id, last_seen DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_kills_server_occurred_at ON kills (server_id, occurred_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_kills_server_pvp ON kills (server_id, is_pvp, occurred_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_shop_events_server_occurred_at ON shop_events (server_id, occurred_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_missions_server_started_at ON missions (server_id, started_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_events_raw_server_received_at ON events_raw (server_id, received_at DESC)`,
    `INSERT INTO servers (id, name, slug, public_enabled, is_default)
       SELECT DISTINCT server_id, server_id, server_id, true, false
         FROM events_raw
        WHERE server_id IS NOT NULL AND server_id <> ''
       ON CONFLICT (id) DO NOTHING`,
  ];

  for (const sql of statements) await db.query(sql);
  logger.info('db: schema ready');
}

module.exports = { ensureSchema };
