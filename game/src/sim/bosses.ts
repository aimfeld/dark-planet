// BossScript(action) @0x122C3: the per-level boss reactions, on fixed enemy records
// (docs/gameplay-spec.md §8). Actions: 1, 2 and 4-8 come from the movement subs and the kill paths, 5 from
// every hit on a boss type (Collisions).

import { explode, quake, startAnim } from './effects';
import { killEnemy, spawnEnemy } from './enemies';
import { playSound, type World } from './state';

function sounds(w: World, n: number, times: number): void {
  for (let k = 0; k < times; k++) playSound(w, n);
}

export function bossScript(w: World, action: number): void {
  const en = w.enemies;
  const X = w.spr.x, Y = w.spr.y;
  switch (w.level) {
    case 1:
      if (action === 5 && w.rng.next(3) === 0) sounds(w, 0x23 + w.rng.next(3), 2);
      break;
    case 2: // core 0x05 = record 3, 0x0D = record 2, 0x0C = record 1
      if (action === 1) {
        // 0x0D destroyed: the core and 0x0C drop to the ground; the core switches to sub 8
        sounds(w, 0x12, 3);
        quake(w, 40);
        const core = en[3];
        if (core.type === 0x05) {
          Object.assign(core, { layer: 0, sub: 8, phase: 0, c: 0, x0: X[core.slot], y0: Y[core.slot] });
        }
        if (en[1].type === 0x0c) en[1].layer = 0;
      } else if (action === 2) {
        // every tick: the parts follow the core (a 0x0C wreck too: the check is by type only)
        const c = en[3].slot;
        if (en[2].type === 0x0d) {
          X[en[2].slot] = X[c] - 10;
          Y[en[2].slot] = Y[c] + 20;
        }
        if (en[1].type === 0x0c) {
          X[en[1].slot] = X[c] + 16;
          Y[en[1].slot] = Y[c] + 46;
        }
      } else if (action === 5 && w.rng.next(3) === 0) sounds(w, 0x11 + w.rng.next(3), 2);
      break;
    case 3: // head 0x20 = record 1, body 0x21 = records 2-4, tail 0x22 = record 5
      if (action === 1) {
        // a body segment was destroyed (EnemyDestroyed refilled it): the last segment flies off instead
        let k = 1;
        while (en[k + 1].active && en[k + 1].type === 0x21) k++;
        const last = en[k];
        const tail = en[5];
        if (tail.active && tail.type === 0x22) {
          tail.angle = last.angle;
          tail.phase = last.phase;
        }
        last.x0 = X[last.slot];
        last.y0 = Y[last.slot];
        const tx = w.rng.next(320);
        last.c = w.scrollY + w.rng.next(200);
        if (last.c === X[last.slot]) last.c += 1; // (sic: compares the target y with x)
        killEnemy(w, k, false, true);
        // Original bug (spec §12 #7): the target x was stored in the energy field, which KillEnemy then
        // cleared, so the debris always flew toward x = 0. The remake keeps it (sub 0x13 reads it there).
        last.energy = tx;
        last.sub = 0x13;
      }
      break;
    case 4: // tank: turrets 0x3D = records 1, 2, gun 0x3F = 3, gun 0x3E = 4, core 0x3C = 5
      if (action === 1) {
        // every tick: the parts (and their wrecks) ride on the core
        const c = en[5].slot;
        const at: [number, number, number][] = [[1, 28, 63], [2, 71, 63], [3, 38, 24], [4, 48, 17]];
        for (const [r, dx, dy] of at) {
          X[en[r].slot] = X[c] + dx;
          Y[en[r].slot] = Y[c] + dy;
        }
      }
      break;
    case 6:
      golem(w, action);
      break;
  }
}

/** Level 6: the Golem is always enemy record 2. */
function golem(w: World, action: number): void {
  const g = w.enemies[2].slot;
  switch (action) {
    case 1: // teleport out
      startAnim(w, 0x24, g);
      sounds(w, 0x36, 3);
      break;
    case 2: // teleport in at a random place
      startAnim(w, 0x25, g);
      sounds(w, 0x37, 3);
      w.spr.x[g] = w.rng.next(240) - 60;
      w.spr.y[g] = w.scrollY - 50 + w.rng.next(70);
      break;
    case 3: // rocks
      quake(w, 60);
      for (let k = 0; k < 3; k++) {
        playSound(w, 6);
        playSound(w, 7);
        playSound(w, 0x0e);
      }
      startAnim(w, 0x26, g);
      for (let k = 1; k <= 3; k++) spawnEnemy(w, (k - 1) * 100 - 40 + w.rng.next(80), w.scrollY - 40, 0x49, 0x28);
      break;
    case 4:
      curse(w);
      break;
    case 5: // hit
      if (w.enemies[2].t > 210 && w.rng.next(6) === 0) sounds(w, 0x38 + w.rng.next(2), 2);
      break;
    case 6: // start bouncing
      sounds(w, 0x39, 3);
      startAnim(w, 0x28, g);
      break;
    case 7: // laser beam (always enemy record 1)
      sounds(w, 0x3a, 2);
      spawnEnemy(w, w.spr.x[g] - 50, w.spr.y[g] + 215, 0x4a, 0x29);
      break;
    case 8:
      startAnim(w, 0x2b, g);
      break;
  }
}

/**
 * The Golem's curse (action 4): both players lose their bonus inventory and every pod; large and ball pods
 * explode. The standard weapon mount is re-occupied with item 1 (the basic gun).
 */
function curse(w: World): void {
  for (const p of w.players) {
    for (let k = 0; k < 3; k++) {
      p.bonus[k] = 0;
      w.spr.n[p.slots.inv + k] = 0;
    }
    w.spr.n[p.slots.selFrame] = 0;
    p.selected = 0;
    for (let m = 0; m < 8; m++) {
      const mt = p.mounts[m];
      if (!mt.occupied) continue;
      mt.occupied = false;
      if (mt.cat !== 2 && mt.cat !== 6) continue;
      const s = p.slots.pods + m;
      w.spr.n[s] = 0;
      // Original bug (spec §12 #8): P2's explosions were placed at P1's pods.
      explode(w, w.spr.x[s] + 7, w.spr.y[s] + 10, 0x19, true);
    }
    p.mounts[2].occupied = true;
    p.mounts[2].item = 1;
  }
}
