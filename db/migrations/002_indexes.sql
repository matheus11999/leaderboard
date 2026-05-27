-- BrasilZ Leaderboard — indexes for query performance.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_kills_occurred_at   ON kills (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_kills_killer_uid    ON kills (killer_uid) WHERE killer_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kills_victim_uid    ON kills (victim_uid);
CREATE INDEX IF NOT EXISTS idx_kills_killer_type   ON kills (killer_type);
CREATE INDEX IF NOT EXISTS idx_kills_is_pvp        ON kills (is_pvp) WHERE is_pvp = true;
CREATE INDEX IF NOT EXISTS idx_kills_distance      ON kills (distance_m DESC) WHERE distance_m IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_player_uid     ON sessions (player_uid);
CREATE INDEX IF NOT EXISTS idx_sessions_connected_at   ON sessions (connected_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_open           ON sessions (player_uid) WHERE disconnected_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shop_events_player_uid  ON shop_events (player_uid);
CREATE INDEX IF NOT EXISTS idx_shop_events_occurred_at ON shop_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_raw_event_type   ON events_raw (event_type);
CREATE INDEX IF NOT EXISTS idx_events_raw_received_at  ON events_raw (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_raw_unprocessed  ON events_raw (id) WHERE processed = false;

CREATE INDEX IF NOT EXISTS idx_missions_sub_idx        ON missions (sub_idx, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_players_total_kills     ON players (total_kills DESC);
CREATE INDEX IF NOT EXISTS idx_players_total_deaths    ON players (total_deaths DESC);
CREATE INDEX IF NOT EXISTS idx_players_longest_shot    ON players (longest_shot_m DESC);
CREATE INDEX IF NOT EXISTS idx_players_longest_life    ON players (longest_life_s DESC);
CREATE INDEX IF NOT EXISTS idx_players_playtime        ON players (total_playtime_s DESC);
CREATE INDEX IF NOT EXISTS idx_players_current_kill_streak ON players (current_kill_streak DESC);
CREATE INDEX IF NOT EXISTS idx_players_best_kill_streak    ON players (best_kill_streak DESC);
CREATE INDEX IF NOT EXISTS idx_players_bounty_active       ON players (bounty_active, bounty_value DESC);
CREATE INDEX IF NOT EXISTS idx_bounty_events_occurred_at   ON bounty_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounty_events_hunter_uid    ON bounty_events (hunter_uid) WHERE hunter_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bounty_events_target_uid    ON bounty_events (target_uid) WHERE target_uid IS NOT NULL;

COMMIT;
