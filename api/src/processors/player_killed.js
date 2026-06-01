'use strict';

const db = require('../db');
const { normalizeServerId } = require('../lib/servers');
const { touchOpenSession } = require('../lib/sessionActivity');

// Map README killer_type → players column to increment.
const DEATH_COLUMN = {
  player: 'deaths_pvp',
  zombie: 'deaths_zombie',
  bandit: 'deaths_bandit',
  npc: 'deaths_bandit',
  environment: 'deaths_env',
  suicide: 'deaths_suicide',
};

function bountyValueForStreak(streak, settings) {
  if (!settings?.enabled) return 0;

  const minKills = Math.max(1, Number(settings.min_kills) || 5);
  const baseValue = Math.max(0, Number(settings.base_value) || 0);
  const increasePct = Math.max(0, Number(settings.increase_pct) || 0);
  if (streak < minKills || baseValue <= 0) return 0;

  const extraKills = Math.max(0, streak - minKills);
  return Math.min(10_000_000, Math.round(baseValue * Math.pow(1 + increasePct / 100, extraKills)));
}

module.exports = async function (data, envelope = {}) {
  const victim = data?.victim;
  if (!victim?.uid) return;

  const killer = data.killer || { type: 'environment' };
  const weapon = data.weapon || {};
  const stats = data.victim_stats || {};
  const pos = victim.position || {};
  const distanceM = Number(data.distance_m);
  const safeDistanceM = Number.isFinite(distanceM) ? distanceM : null;
  const safeDistanceInt = Number.isFinite(distanceM) ? Math.round(distanceM) : 0;
  const aliveSeconds = Number(data.alive_seconds);
  const safeAliveSeconds = Number.isFinite(aliveSeconds) ? Math.round(aliveSeconds) : null;
  const hydration = Number(stats.hydration);
  const energy = Number(stats.energy);

  const killerType = (killer.type || 'environment').toLowerCase();
  const deathCol = DEATH_COLUMN[killerType] || 'deaths_env';
  const serverId = normalizeServerId(envelope.server_id || data.server_id);
  const isSuicide = data.is_suicide === true || data.is_suicide === 1 || data.is_suicide === 'true';
  const rankedDeathIncrement = isSuicide ? 0 : 1;

  await db.tx(async (c) => {
    const settingsR = await c.query(
      `SELECT enabled, min_kills, base_value, increase_pct
         FROM bounty_settings
        WHERE id = true`
    );
    const bountySettings = settingsR.rows[0] || {
      enabled: true,
      min_kills: 5,
      base_value: 5000,
      increase_pct: 20,
    };

    // Make sure victim row exists (defensive — should be from player_connected).
    await c.query(
      `INSERT INTO players (uid, name)
       VALUES ($1, $2)
       ON CONFLICT (uid) DO UPDATE SET last_seen = NOW()`,
      [victim.uid, victim.name || 'Unknown']
    );

    // Ensure killer row exists if a player killer.
    let killerUid = null;
    if (killerType === 'player' && killer.player?.uid) {
      killerUid = killer.player.uid;
      await c.query(
        `INSERT INTO players (uid, name)
         VALUES ($1, $2)
         ON CONFLICT (uid) DO UPDATE SET last_seen = NOW()`,
        [killerUid, killer.player.name || killer.name || 'Unknown']
      );
    }

    const victimBefore = await c.query(
      `SELECT current_kill_streak, bounty_active, bounty_value, bounty_started_at,
              life_started_at, life_server_id,
              CASE
                WHEN life_started_at IS NOT NULL
                 AND (life_server_id IS NULL OR life_server_id = $2)
                THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - life_started_at))::INT)
                ELSE NULL
              END AS portal_alive_s
         FROM players
        WHERE uid = $1`,
      [victim.uid, serverId]
    );
    const victimState = victimBefore.rows[0] || {};
    const portalAliveSeconds = Number(victimState.portal_alive_s);
    const effectiveAliveSeconds = Number.isFinite(portalAliveSeconds) && portalAliveSeconds > 0
      ? portalAliveSeconds
      : safeAliveSeconds;

    // Insert kill row.
    await c.query(
      `INSERT INTO kills (
         occurred_at, server_id, victim_uid, victim_name, victim_position, victim_prefab,
         killer_type, killer_uid, killer_name, killer_prefab,
         weapon_name, weapon_prefab, distance_m,
         is_pvp, is_suicide,
         victim_alive_s, victim_hydration, victim_energy, victim_bleeding
       ) VALUES (
         NOW(), $1, $2, $3, POINT($4, $5), $6,
         $7, $8, $9, $10,
         $11, $12, $13,
         $14, $15,
         $16, $17, $18, $19
       )`,
      [
        serverId,
        victim.uid,
        victim.name || 'Unknown',
        Number(pos.x) || 0,
        Number(pos.z) || 0,
        victim.prefab || null,
        killerType,
        killerUid,
        killer.name || null,
        killer.prefab || null,
        weapon.name || null,
        weapon.prefab || null,
        safeDistanceM,
        !!data.is_pvp,
        isSuicide,
        effectiveAliveSeconds,
        Number.isFinite(hydration) ? hydration : null,
        Number.isFinite(energy) ? energy : null,
        typeof stats.bleeding === 'boolean' ? stats.bleeding : null,
      ]
    );

    if (
      victimState.bounty_active &&
      killerUid &&
      killerUid !== victim.uid &&
      !isSuicide
    ) {
      await c.query(
        `INSERT INTO bounty_events (
           server_id, target_uid, target_name, hunter_uid, hunter_name,
           target_streak, bounty_value, weapon_name, weapon_prefab, distance_m,
           bounty_started_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          serverId,
          victim.uid,
          victim.name || 'Unknown',
          killerUid,
          killer.player?.name || killer.name || 'Unknown',
          Number(victimState.current_kill_streak) || 0,
          Number(victimState.bounty_value) || 0,
          weapon.name || null,
          weapon.prefab || null,
          safeDistanceM,
          victimState.bounty_started_at || null,
        ]
      );
    }

    // Bump victim counters and reset any active PvP streak/bounty.
    await c.query(
      `UPDATE players SET
         total_deaths   = total_deaths + $2,
         ${deathCol}    = ${deathCol} + 1,
         longest_life_s = GREATEST(longest_life_s, COALESCE($1, 0)),
         current_kill_streak = 0,
         bounty_active = false,
         bounty_value = 0,
         bounty_started_at = NULL,
         bounty_server_id = NULL,
         life_started_at = NULL,
         life_server_id = NULL,
         last_seen      = NOW()
       WHERE uid = $3`,
      [effectiveAliveSeconds || 0, rankedDeathIncrement, victim.uid]
    );
    await touchOpenSession(c, { serverId, playerUid: victim.uid });

    // Bump killer counters if a player killed another player (not suicide).
    if (killerUid && !isSuicide && data.is_pvp) {
      const streakR = await c.query(
        `UPDATE players SET
           total_kills    = total_kills + 1,
           longest_shot_m = GREATEST(longest_shot_m, COALESCE($1, 0)),
           current_kill_streak = current_kill_streak + 1,
           best_kill_streak = GREATEST(best_kill_streak, current_kill_streak + 1),
           last_seen      = NOW()
         WHERE uid = $2
         RETURNING current_kill_streak`,
        [safeDistanceInt, killerUid]
      );

      const newStreak = Number(streakR.rows[0]?.current_kill_streak) || 0;
      const bountyValue = bountyValueForStreak(newStreak, bountySettings);
      if (bountyValue > 0) {
        await c.query(
          `UPDATE players SET
             bounty_active = true,
             bounty_value = $1,
             bounty_started_at = COALESCE(bounty_started_at, NOW()),
             bounty_server_id = $3
           WHERE uid = $2`,
          [bountyValue, killerUid, serverId]
        );
      }
    }

    if (killerUid) {
      await touchOpenSession(c, { serverId, playerUid: killerUid });
    }
  });
};
