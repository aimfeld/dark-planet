// Collisions per player @0x18978: shots vs enemies, enemy shots vs the jet, ramming (spec §3.4, §4.6).

import { explode } from './effects';
import { BOSS_TYPES, enemyDestroyed, killEnemyShot, typeOf } from './enemies';
import { damage } from './player';
import { hitDetect, spriteH } from './sprites';
import type { Player, World } from './state';
import { killShot } from './weapons';

/** Small explosion where a player shot hits, by shot type: [kind, where]. */
const HIT_EXPLOSION: Record<number, [number, 'shot' | 'shotX-enemyY' | 'enemy+5' | 'shocker' | 'heli']> = {};
for (const t of [1, 2, 7, 9, 11, 15, 18, 20, 23]) HIT_EXPLOSION[t] = [1, 'shot'];
for (const t of [4, 8, 19]) HIT_EXPLOSION[t] = [4, 'shot'];
for (const t of [6, 13, 17, 21]) HIT_EXPLOSION[t] = [3, 'shot'];
HIT_EXPLOSION[3] = [7, 'shotX-enemyY'];
HIT_EXPLOSION[5] = [1, 'enemy+5'];
HIT_EXPLOSION[14] = [18, 'shocker'];
HIT_EXPLOSION[16] = [23, 'heli'];

function partsAlive(w: World): boolean {
  return [1, 2, 3, 4].some((i) => w.enemies[i].active);
}

export function collisions(w: World, p: Player): void {
  if (!p.active) return;
  const jet = p.slots.jet;
  const shotTypes = w.data.tables.shot_types;

  // player shots vs enemies
  for (let c = 1; c <= 29; c++) {
    const e = w.enemies[c];
    if (!e.active) continue;
    if ((e.type === 0x3c || e.type === 0x43) && partsAlive(w)) continue; // boss cores shielded by their parts
    if (e.type === 0x49 || e.type === 0x4a) continue; // Golem rocks and laser
    for (let a = 0; a < 48; a++) {
      // Original bug (fixed, spec §12): the loop kept testing a destroyed enemy, so a second shot in the
      // same tick could hit its wreck and pay the reward twice.
      if (!e.active) break;
      const s = p.shots[a];
      if (!s.active || s.type === 12) continue;
      if (!(e.layer === (s.alt ? 1 : 0) || e.layer === 2 || s.type === 4)) continue;
      if (!hitDetect(w, s.slot, e.slot)) continue;
      if (e.type !== 0x48 || e.t > 210) e.energy -= shotTypes[s.type - 1].damage; // TODO: x5 bonus damage
      const hx = HIT_EXPLOSION[s.type];
      if (hx) {
        const sx = w.spr.x[s.slot], sy = w.spr.y[s.slot], ex = w.spr.x[e.slot], ey = w.spr.y[e.slot];
        const high = e.layer === 1;
        if (hx[1] === 'shot') explode(w, sx, sy, hx[0], high);
        else if (hx[1] === 'shotX-enemyY') explode(w, sx, ey, hx[0], high);
        else if (hx[1] === 'enemy+5') explode(w, ex + 5, ey + 5, hx[0], high);
        else if (hx[1] === 'shocker') explode(w, sx - 16, ey + spriteH(w, w.spr.n[e.slot]) - 30, hx[0], high);
        else explode(w, sx - 18, sy - 5, hx[0], high);
      }
      if (e.energy < 1) enemyDestroyed(w, p, c, true, true);
      // TODO(slice): boss hit reaction (BossScript(5)) and the anim of type 0x17
      const pierce = s.type === 5 || ((s.type === 11 || s.type === 22) && !BOSS_TYPES.has(e.type));
      if (!pierce) killShot(w, p, a);
    }
  }

  // enemy shots vs the jet (any altitude)
  const kinds = w.data.tables.enemy_shot_kinds;
  for (let k = 1; k <= 49; k++) {
    const s = w.enemyShots[k];
    if (!s.active || !hitDetect(w, s.slot, jet) || p.invulnerable) continue;
    damage(p, kinds[s.kind - 1].damage);
    explode(w, w.spr.x[s.slot], w.spr.y[s.slot], 1, true);
    killEnemyShot(w, k);
  }

  // ramming: every tick of overlap at the same altitude (or layer 2)
  const ram = w.data.tables.jets[p.jet - 1].ram_damage;
  for (let c = 1; c <= 29; c++) {
    const e = w.enemies[c];
    if (!e.active || !(e.layer === (p.high ? 1 : 0) || e.layer === 2)) continue;
    if (!hitDetect(w, e.slot, jet) || p.invulnerable) continue;
    damage(p, typeOf(w, e).ram_damage);
    if (e.type >= 0x48 && e.type <= 0x4a) {
      explode(w, w.spr.x[jet] - 15 + w.rng.next(60), w.spr.y[jet] - 15 + w.rng.next(60), 1, e.layer === 1);
    } else e.energy -= ram;
    if (e.type === 0x31) e.energy = 0;
    if (e.energy < 1) enemyDestroyed(w, p, c, false, true);
  }
  // TODO(slice): ball pods (destroy enemy shots, contact damage)
}
