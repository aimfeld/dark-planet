// Level start and the per-tick order of the game loop @0x1B787 (docs/gameplay-spec.md §1).
// One call of step() = one frame of the original = one 40 Hz tick.

import { bombTimer, bonusInventory, bonusTimers, clearBonuses, pickupBonuses, placeInventory, x5IconFollow } from './bonus';
import { collisions } from './collisions';
import { animTick, explosionTick, shadows, spriteCycles } from './effects';
import { BOSS_BLACK_TICKS, BOSS_FADE_TICKS, BOSS_FREEZE_TICKS, enemyGuns, enemyUpdate, moveEnemyShots, spawnFromLevel } from './enemies';
import {
  addMoney, altitudeSwap, HUD, invulnerableTick, keyboardInput, lifeLost, LIVES_TEXT, MONEY_TEXT, movePlayer,
  playerOut, respawnFlyIn, setLivesText, shieldRecharge,
} from './player';
import { FADE_STEPS, newPlayer, NO_INPUT, P1_SLOTS, p2Slots, playSound, stopSound, type PlayerInput, type World } from './state';
import { firePods, mountPoint, moveShots, reloadPods } from './weapons';

export { HUD };

/** LevelStartSprites @0x107F8: pod sprites start at the jet plus these offsets (DS:0x18FE / 0x190E). */
const POD_START = [[-7, -22], [0, 0], [0, 0], [-17, 14], [4, 14], [-35, 16], [22, 16], [0, 0]];

/** New game (main menu item 1 @0x1D769 + InitPlayer @0x1B2E3): level 1, P1 only (P2 joins in the hangar). */
export function newGame(w: World, twoPlayer = false): void {
  w.players = [newPlayer(0), newPlayer(1)];
  w.players[0].active = true;
  w.players[1].active = twoPlayer;
  w.twoPlayer = twoPlayer;
  startLevel(w, 1);
}

/** StartLevel @0x1B582 + LevelReset @1d9e:0000 + LevelStartSprites @0x107F8 for the players in `w`. */
export function startLevel(w: World, level: number): void {
  w.level = level;
  w.episode = Math.trunc((level - 1) / 3) + 1;
  w.scrollX = 0;
  w.scrollY = 0;
  w.scrolling = true;
  w.autopilot = false;
  w.frame = 0;
  w.quake = 0;
  w.gameOver = 0;
  w.levelDone = false;
  w.gameCompleted = false;
  w.flash = false;
  w.fade = FADE_STEPS;
  w.freeze = 0;
  w.track = w.data.tables.levels[level - 1].cd_track;
  w.spr.n.fill(0);
  w.spr.mode.fill(0);
  for (const e of w.enemies) Object.assign(e, { active: false, dying: false, energy: 0 });
  for (const s of w.enemyShots) s.active = false;
  for (const e of w.explosions) e.active = false;
  for (const a of w.anims) a.state = 0;
  clearBonuses(w); // (the original leaves them to StartBossFight, which every level passes through)
  const t = w.data.tables;
  for (const p of w.players) {
    p.slots = p.index === 0 ? { ...P1_SLOTS } : p2Slots();
    p.high = true;
    p.pendingSwap = 0;
    p.shadowD = 12;
    // Original bug (spec §12 #5): P2's velocity was not reset; the remake resets both.
    p.vx = 0;
    p.vy = 0;
    p.flyIn = false;
    p.invCounter = 0;
    p.invulnerable = false;
    p.selected = 0;
    p.bombTimer = 0;
    p.x5Timer = 0;
    for (const m of p.mounts) m.loaded = true;
    for (const s of p.shots) s.active = false;
    p.life = p.active ? t.jets[p.jet - 1].max_life : 0;
    p.shield = p.active && p.shieldType > 0 ? t.shields[p.shieldType - 1].max : 0;
    if (!p.active) continue;
    const i = p.index;
    addMoney(w, p, 0);
    w.spr.n[HUD.money[i]] = MONEY_TEXT[i];
    w.spr.x[HUD.money[i]] = i === 0 ? 20 : 240;
    w.spr.y[HUD.money[i]] = 10;
    setLivesText(w, p);
    w.spr.n[HUD.icon[i]] = 491;
    w.spr.x[HUD.icon[i]] = i === 0 ? 30 : 260;
    w.spr.n[HUD.lives[i]] = LIVES_TEXT[i];
    w.spr.x[HUD.lives[i]] = i === 0 ? 45 : 275;
    const jet = p.slots.jet;
    w.spr.x[jet] = i === 0 ? 60 : 140;
    w.spr.y[jet] = 140;
    w.spr.n[jet] = t.jets[p.jet - 1].frame_base + 3;
    for (let m = 0; m < 8; m++) {
      const mt = p.mounts[m];
      if (!mt.occupied) continue;
      // pod sprites at jet + raw offsets (DS:0x18FE / 0x190E; the ball at (0, 0)); the next ScrollStep
      // and MoveShots put them at their mounts and on the orbit
      if (mt.cat === 2) w.spr.n[p.slots.pods + m] = t.large_pods[mt.item - 1].sprite!;
      else if (mt.cat === 6) w.spr.n[p.slots.pods + m] = t.ball_pods[mt.item - 1].sprite!;
      else continue;
      w.spr.x[p.slots.pods + m] = w.spr.x[jet] + POD_START[m][0];
      w.spr.y[p.slots.pods + m] = w.spr.y[jet] + POD_START[m][1];
    }
    if (w.twoPlayer) w.spr.n[p.slots.label] = 577 + i;
    placeInventory(w, p);
  }
  // engine sounds, started by the hangar's "Shoot em all" @0x1D2D2 (5 = jet, 49 = Steptokopter)
  const [p1, p2] = w.players;
  if ((p1.active && p1.jet !== 4) || (p2.active && p2.jet !== 4)) playSound(w, 5, { loop: true });
  if ((p1.active && p1.jet === 4) || (p2.active && p2.jet === 4)) playSound(w, 0x31, { loop: true });
  w.spr.n[HUD.frameLeft] = 490;
  w.spr.n[HUD.frameRight] = 490;
  scrollHud(w);
}

function scrollHud(w: World): void {
  for (const i of [0, 1]) {
    w.spr.y[HUD.icon[i]] = w.scrollY + 25;
    w.spr.y[HUD.lives[i]] = w.scrollY + 27;
  }
}

/** ScrollStep @0x15F68: HUD frames, 1 px of scrolling, pods follow their jet. */
function scrollStep(w: World): void {
  w.spr.x[HUD.frameLeft] = w.scrollX;
  w.spr.y[HUD.frameLeft] = w.scrollY;
  w.spr.x[HUD.frameRight] = w.scrollX + 311;
  w.spr.y[HUD.frameRight] = w.scrollY;
  if (w.scrolling) {
    w.scrollY -= 1;
    for (const p of w.players) w.spr.y[p.slots.jet] -= 1;
    w.spr.y[HUD.money[0]] -= 1;
    w.spr.y[HUD.money[1]] -= 1;
    scrollHud(w);
    for (const p of w.players) w.spr.y[p.slots.selFrame] = w.scrollY + 168;
  }
  const t = w.data.tables;
  for (const p of w.players) {
    if (!p.active) continue;
    const jet = p.slots.jet;
    for (let m = 0; m < 8; m++) {
      const mt = p.mounts[m];
      if (!mt.occupied || mt.cat !== 2) continue;
      const [mx, my] = mountPoint(w, p, m);
      w.spr.x[p.slots.pods + m] = w.spr.x[jet] + mx;
      w.spr.y[p.slots.pods + m] = w.spr.y[jet] + my;
    }
    if (w.twoPlayer) {
      const e = t.jets[p.jet - 1].extents;
      w.spr.x[p.slots.label] = e.l + w.spr.x[jet] + ((e.r - e.l) >> 1) - 24;
      w.spr.y[p.slots.label] = e.b + w.spr.y[jet] + 4;
    }
  }
  for (const p of w.players) x5IconFollow(w, p);
}

/** What the renderer needs besides the sprite table, captured at the Animate call. */
function snapshot(w: World): void {
  // The boss start holds the last frame on screen while it fades out (see freezeTick).
  if (w.freeze > 0) return;
  w.drawn.copyFrom(w.spr);
  w.drawnScrollX = w.scrollX;
  w.drawnScrollY = w.scrollY;
  if (w.quake > 0) {
    // Quake @1d9e:1421 (I: the shake offset; only explosion kind 15 starts it)
    w.quake -= 1;
    w.drawnScrollX = w.scrollX + w.rng.next(10);
  }
  for (const p of w.players) {
    p.drawnLife = p.life;
    p.drawnShield = p.shield;
  }
}

/**
 * StartBossFight blocks the original game loop: fade out (the last frame stays on screen), 1.2 s black,
 * draw the new scene, fade in. Here those are frozen ticks.
 */
function freezeTick(w: World): void {
  w.freeze -= 1;
  const t = BOSS_FREEZE_TICKS - w.freeze; // 1..BOSS_FREEZE_TICKS
  const fadeInStart = BOSS_FADE_TICKS + BOSS_BLACK_TICKS;
  if (t <= BOSS_FADE_TICKS) w.fade = Math.round((FADE_STEPS * (BOSS_FADE_TICKS - t)) / BOSS_FADE_TICKS);
  else if (t <= fadeInStart) w.fade = 0;
  else w.fade = Math.round((FADE_STEPS * (t - fadeInStart)) / BOSS_FADE_TICKS);
  if (t === fadeInStart) {
    const f = w.freeze;
    w.freeze = 0;
    snapshot(w); // the state as StartBossFight left it, drawn while the screen is black
    w.freeze = f;
  }
}

/** Ends the level (true) when the autopilot or the game-over countdown says so; Esc is the caller's. */
export function levelOver(w: World): 'done' | 'gameover' | null {
  if (w.levelDone) return 'done';
  if (w.gameOver === 1) return 'gameover';
  return null;
}

/** LevelEndAutopilot @0x1A951: fly up and to the middle; done when every active player is 30 px above the screen. */
function levelEndAutopilot(w: World): void {
  const [p1, p2] = w.players;
  const target = [160, 130];
  for (const p of w.players) {
    if (!p.active) continue;
    const s = p.slots.jet;
    if (w.spr.x[s] > target[p.index] + 2) w.spr.x[s] -= 3;
    if (w.spr.x[s] < target[p.index] - 2) w.spr.x[s] += 3;
    w.spr.y[s] -= 3;
  }
  const out = (p: typeof p1) => !p.active || w.spr.y[p.slots.jet] <= w.scrollY - 30;
  if (out(p1) && out(p2)) {
    stopSound(w, 5);
    w.levelDone = true;
    if (w.level >= 6) w.gameCompleted = true;
  }
}

export function step(w: World, inputs: PlayerInput[]): void {
  w.sounds = [];
  if (w.freeze > 0) {
    freezeTick(w);
    return;
  }
  w.frame += 1;
  const players = w.players;
  for (const p of players) if (p.active && p.pendingSwap !== 0) altitudeSwap(w, p);
  if (!w.autopilot) {
    for (const p of players) if (p.active) keyboardInput(w, p, inputs[p.index] ?? NO_INPUT);
    for (const p of players) if (p.active) movePlayer(w, p, inputs[p.index] ?? NO_INPUT);
  }
  bonusTimers(w);
  for (const p of players) if (p.active && p.life < 0) lifeLost(w, p);
  for (const p of players) if (p.active && p.lives < 0) playerOut(w, p);
  for (const p of players) if (p.flyIn) respawnFlyIn(w, p);
  for (const p of players) if (p.active) shieldRecharge(w, p);
  for (const p of players) if (p.active) firePods(w, p);
  spriteCycles(w);
  animTick(w);
  for (const p of players) if (p.active) reloadPods(w, p);
  explosionTick(w);
  enemyUpdate(w);
  enemyGuns(w);
  moveEnemyShots(w);
  if (w.scrolling) spawnFromLevel(w);
  for (const p of players) if (p.active) bombTimer(w, p);
  for (const p of players) if (p.invulnerable) invulnerableTick(w, p);
  for (const p of players) if (p.active) moveShots(w, p);
  // P1's inventory runs even after P1 is out (as in the original), P2's only while active
  for (const p of players) if (p.index === 0 || p.active) bonusInventory(w, p);
  for (const p of players) if (p.active) pickupBonuses(w, p);
  scrollStep(w);
  shadows(w);
  snapshot(w);
  if (!w.autopilot) for (const p of players) if (p.active) collisions(w, p);
  if (w.autopilot) levelEndAutopilot(w);
  if (w.gameOver > 0) {
    w.gameOver -= 1;
    if (w.gameOver === 110) {
      playSound(w, 0x2a);
      playSound(w, 0x2a);
    }
  }
}

