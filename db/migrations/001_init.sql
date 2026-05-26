-- BrasilZ Leaderboard — initial schema
-- This script runs automatically on first start of the postgres:16-alpine container
-- via /docker-entrypoint-initdb.d mount.

BEGIN;

CREATE TABLE IF NOT EXISTS players (
  uid              TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  first_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_kills      INT  NOT NULL DEFAULT 0,
  total_deaths     INT  NOT NULL DEFAULT 0,
  deaths_pvp       INT  NOT NULL DEFAULT 0,
  deaths_zombie    INT  NOT NULL DEFAULT 0,
  deaths_bandit    INT  NOT NULL DEFAULT 0,
  deaths_env       INT  NOT NULL DEFAULT 0,
  deaths_suicide   INT  NOT NULL DEFAULT 0,
  longest_shot_m   REAL NOT NULL DEFAULT 0,
  longest_life_s   INT  NOT NULL DEFAULT 0,
  total_playtime_s INT  NOT NULL DEFAULT 0,
  current_balance  INT  NOT NULL DEFAULT 0,
  is_banned        BOOL NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS sessions (
  id              BIGSERIAL PRIMARY KEY,
  player_uid      TEXT NOT NULL REFERENCES players(uid) ON DELETE CASCADE,
  connected_at    TIMESTAMPTZ NOT NULL,
  disconnected_at TIMESTAMPTZ,
  duration_s      INT,
  spawn_point     TEXT,
  spawn_prefab    TEXT,
  balance_in      INT,
  balance_out     INT
);

CREATE TABLE IF NOT EXISTS kills (
  id                BIGSERIAL PRIMARY KEY,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  victim_uid        TEXT REFERENCES players(uid) ON DELETE SET NULL,
  victim_name       TEXT NOT NULL,
  victim_position   POINT,
  victim_prefab     TEXT,
  killer_type       TEXT NOT NULL,  -- player|zombie|bandit|npc|environment|suicide
  killer_uid        TEXT REFERENCES players(uid) ON DELETE SET NULL,
  killer_name       TEXT,
  killer_prefab     TEXT,
  weapon_name       TEXT,
  weapon_prefab     TEXT,
  distance_m        REAL,
  is_pvp            BOOL NOT NULL DEFAULT false,
  is_suicide        BOOL NOT NULL DEFAULT false,
  victim_alive_s    INT,
  victim_hydration  REAL,
  victim_energy     REAL,
  victim_bleeding   BOOL
);

CREATE TABLE IF NOT EXISTS shop_events (
  id            BIGSERIAL PRIMARY KEY,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  player_uid    TEXT REFERENCES players(uid) ON DELETE SET NULL,
  player_name   TEXT NOT NULL,
  item_name     TEXT NOT NULL,
  item_prefab   TEXT,
  quantity      INT NOT NULL,
  is_purchase   BOOL NOT NULL,
  success       BOOL NOT NULL,
  price         INT NOT NULL,
  balance_after INT
);

CREATE TABLE IF NOT EXISTS missions (
  id            BIGSERIAL PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  sub_idx       INT  NOT NULL,
  mission_name  TEXT NOT NULL,
  won           BOOL,
  cooldown_s    INT
);

CREATE TABLE IF NOT EXISTS events_raw (
  id             BIGSERIAL PRIMARY KEY,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_id      TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  timestamp_unix BIGINT NOT NULL,
  payload        JSONB NOT NULL,
  processed      BOOL NOT NULL DEFAULT false,
  error          TEXT
);

CREATE TABLE IF NOT EXISTS admin_users (
  username      TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
