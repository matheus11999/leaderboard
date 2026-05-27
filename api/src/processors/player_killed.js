'use strict';

const db = require('../db');

const BOUNTY_THRESHOLD = Number(process.env.BOUNTY_THRESHOLD) || 5;
const BOUNTY_BASE_VALUE = Number(process.env.BOUNTY_BASE_VALUE) || 5000;
const BOUNTY_EXTRA_KILL_VALUE = Number(process.env.BOUNTY_EXTRA_KILL_VALUE) || 1000;

// Map README killer_type → players column to increment.
const DEATH_COLUMN = {
  player: 'deaths_pvp',
  zombie: 'deaths_zombie',
  bandit: 'deaths_bandit',
  npc: 'deaths_bandit',
  environment: 'deaths_env',
  suicide: 'deaths_suicide',
};

function bountyValueForStreak(streak) {
  if (streak < BOUNTY_THRESHOLD) return 0;
  return BOUNTY_BASE_VALUE + Math.max(0, streak - BOUNTY_THRESHOLD) * BOUNTY_EXTRA_KILL_VALUE;
}

module.exports = async function (data) {
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

  await db.tx(async (c) => {
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
      `SELECT current_kill_streak, bounty_active, bounty_value
         FROM players
        WHERE uid = $1`,
      [victim.uid]
    );
    const victimState = victimBefore.rows[0] || {};

    // Insert kill row.
    await c.query(
      `INSERT INTO kills (
         occurred_at, victim_uid, victim_name, victim_position, victim_prefab,
         killer_type, killer_uid, killer_name, killer_prefab,
         weapon_name, weapon_prefab, distance_m,
         is_pvp, is_suicide,
         victim_alive_s, victim_hydration, victim_energy, victim_bleeding
       ) VALUES (
         NOW(), $1, $2, POINT($3, $4), $5,
         $6, $7, $8, $9,
         $10, $11, $12,
         $13, $14,
         $15, $16, $17, $18
       )`,
      [
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
        !!data.is_suicide,
        safeAliveSeconds,
        Number.isFinite(hydration) ? hydration : null,
        Number.isFinite(energy) ? energy : null,
        typeof stats.bleeding === 'boolean' ? stats.bleeding : null,
      ]
    );

    if (
      victimState.bounty_active &&
      killerUid &&
      killerUid !== victim.uid &&
      !data.is_suicide
    ) {
      await c.query(
        `INSERT INTO bounty_events (
           target_uid, target_name, hunter_uid, hunter_name,
           target_streak, bounty_value, weapon_name, weapon_prefab, distance_m
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          victim.uid,
          victim.name || 'Unknown',
          killerUid,
          killer.player?.name || killer.name || 'Unknown',
          Number(victimState.current_kill_streak) || 0,
          Number(victimState.bounty_value) || 0,
          weapon.name || null,
          weapon.prefab || null,
          safeDistanceM,
        ]
      );
    }

    // Bump victim counters and reset any active PvP streak/bounty.
    await c.query(
      `UPDATE players SET
         total_deaths   = total_deaths + 1,
         ${deathCol}    = ${deathCol} + 1,
         longest_life_s = GREATEST(longest_life_s, COALESCE($1, 0)),
         current_kill_streak = 0,
         bounty_active = false,
         bounty_value = 0,
         bounty_started_at = NULL,
         last_seen      = NOW()
       WHERE uid = $2`,
      [safeAliveSeconds || 0, victim.uid]
    );

    // Bump killer counters if a player killed another player (not suicide).
    if (killerUid && !data.is_suicide && data.is_pvp) {
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
      const bountyValue = bountyValueForStreak(newStreak);
      if (bountyValue > 0) {
        await c.query(
          `UPDATE players SET
             bounty_active = true,
             bounty_value = $1,
             bounty_started_at = COALESCE(bounty_started_at, NOW())
           WHERE uid = $2`,
          [bountyValue, killerUid]
        );
      }
    }
  });
};
