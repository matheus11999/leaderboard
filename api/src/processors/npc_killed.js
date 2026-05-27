'use strict';

const db = require('../db');

module.exports = async function (data) {
  const killer = data?.killer?.player || data?.killer;
  const victim = data?.victim || {};
  if (!killer?.uid) return;

  const weapon = data.weapon || {};
  const pos = victim.position || {};
  const distanceM = Number(data.distance_m);
  const safeDistanceM = Number.isFinite(distanceM) ? distanceM : null;

  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO players (uid, name)
       VALUES ($1, $2)
       ON CONFLICT (uid) DO UPDATE SET name = EXCLUDED.name, last_seen = NOW()`,
      [killer.uid, killer.name || 'Unknown']
    );

    await c.query(
      `INSERT INTO kills (
         occurred_at, victim_uid, victim_name, victim_position, victim_prefab,
         killer_type, killer_uid, killer_name, killer_prefab,
         weapon_name, weapon_prefab, distance_m,
         is_pvp, is_suicide
       ) VALUES (
         NOW(), NULL, $1, POINT($2, $3), $4,
         'player', $5, $6, $7,
         $8, $9, $10,
         false, false
       )`,
      [
        victim.name || victim.type || 'NPC',
        Number(pos.x) || 0,
        Number(pos.z) || 0,
        victim.prefab || null,
        killer.uid,
        killer.name || 'Unknown',
        killer.prefab || null,
        weapon.name || null,
        weapon.prefab || null,
        safeDistanceM,
      ]
    );
  });
};
