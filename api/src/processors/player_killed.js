'use strict';

const db = require('../db');

// Map README killer_type → players column to increment.
const DEATH_COLUMN = {
  player: 'deaths_pvp',
  zombie: 'deaths_zombie',
  bandit: 'deaths_bandit',
  npc: 'deaths_bandit',
  environment: 'deaths_env',
  suicide: 'deaths_suicide',
};

module.exports = async function (data) {
  const victim = data?.victim;
  if (!victim?.uid) return;

  const killer = data.killer || { type: 'environment' };
  const weapon = data.weapon || {};
  const stats = data.victim_stats || {};
  const pos = victim.position || {};

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
        Number.isFinite(data.distance_m) ? data.distance_m : null,
        !!data.is_pvp,
        !!data.is_suicide,
        Number.isFinite(data.alive_seconds) ? data.alive_seconds : null,
        Number.isFinite(stats.hydration) ? stats.hydration : null,
        Number.isFinite(stats.energy) ? stats.energy : null,
        typeof stats.bleeding === 'boolean' ? stats.bleeding : null,
      ]
    );

    // Bump victim counters.
    await c.query(
      `UPDATE players SET
         total_deaths   = total_deaths + 1,
         ${deathCol}    = ${deathCol} + 1,
         longest_life_s = GREATEST(longest_life_s, COALESCE($1, 0)),
         last_seen      = NOW()
       WHERE uid = $2`,
      [data.alive_seconds || 0, victim.uid]
    );

    // Bump killer counters if a player killed (not suicide).
    if (killerUid && !data.is_suicide) {
      await c.query(
        `UPDATE players SET
           total_kills    = total_kills + 1,
           longest_shot_m = GREATEST(longest_shot_m, COALESCE($1, 0)),
           last_seen      = NOW()
         WHERE uid = $2`,
        [Number.isFinite(data.distance_m) ? data.distance_m : 0, killerUid]
      );
    }
  });
};
