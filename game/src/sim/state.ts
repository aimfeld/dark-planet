// Simulation state, laid out like DP.EXE's globals (docs/re-notes.md "Gameplay (session 4)").
// Positions live in an AniVGA-style sprite slot table, as in the original: the game logic moves
// sprites by writing SpriteX/SpriteY, and the renderer draws the slots (920 first, 0 last = in front).

import type { GameData } from '../data';
import { TpRandom } from './tp';

export const SLOTS = 921; // AniVGA sprite slots 0..920
export const MODE_SHADOW = 3; // display mode byte (DS:0xB820 + slot)

export class SpriteTable {
  n = new Int32Array(SLOTS); // sprite number, 0 = slot unused (SpriteN, DS:0x3146)
  x = new Int32Array(SLOTS); // level coordinates of the top-left corner (SpriteX, DS:0xC2F0)
  y = new Int32Array(SLOTS); // (SpriteY, DS:0xCA22)
  mode = new Uint8Array(SLOTS);

  copyFrom(o: SpriteTable): void {
    this.n.set(o.n);
    this.x.set(o.x);
    this.y.set(o.y);
    this.mode.set(o.mode);
  }
}

/** Raw per-tick input of one player, as the input handlers' flag bytes (DS:0x6C3B..., spec §2). */
export interface PlayerInput {
  device: number; // control type: 1 keyboard, 2 mouse, 3 joystick (handlers @0x1A1DD / 0x1A34B / 0x1A58F), 4 WASD
  left: boolean; // keyboard and joystick
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean; // Ctrl / left button / button 1
  altitude: boolean; // Alt / right button / button 2
  select: boolean; // select a bonus: Space / middle button / keypad -
  use: boolean; // use it: Ctrl + Space / left + middle / keypad +
  mouseX: number; // mouse: the pointer in screen pixels (mouse x div 2, y)
  mouseY: number;
}

export const NO_INPUT: PlayerInput = {
  device: 1, left: false, right: false, up: false, down: false, fire: false, altitude: false, select: false, use: false,
  mouseX: 0, mouseY: 0,
};

export interface Mount {
  reload: number; // counter (+0)
  loaded: boolean; // +2
  occupied: boolean; // +3
  item: number; // +4
  cat: number; // +5: 1 small, 2 large, 6 ball, 8 standard weapon
}

export interface Shot {
  slot: number;
  pattern: number;
  active: boolean;
  type: number;
  age: number;
  mount: number; // source mount, -1/-2 = bonus
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  target: number;
  alt: boolean; // shooter altitude (true = high)
}

/** Sprite slots of one player (list at DS:0x7542 / 0x7556, set by LevelReset 1d9e:0000). */
export interface PlayerSlots {
  pods: number; // + mount index
  label: number;
  jet: number;
  arc: number;
  digit: number;
  shadow: number;
  podShadows: number; // + mount index
  shot: number; // + shot index
  x5: number;
  inv: number; // HUD bonus inventory, + slot index (P1 9-11, P2 12-14; not in the list, fixed)
  selFrame: number; // HUD selection frame (P1 15, P2 16)
}

export interface Player {
  index: number; // 0 = P1, 1 = P2
  active: boolean;
  life: number;
  shield: number;
  lives: number;
  money: number;
  jet: number;
  engine: number;
  shieldType: number;
  vx: number;
  vy: number;
  high: boolean; // altitude flag (DS:0x6C40)
  altLatch: boolean;
  bonusLatch: boolean;
  pendingSwap: number; // 1 = to the high slots, 2 = to the low slots (DS:0x6C64)
  flyIn: boolean; // respawn fly-in (DS:0x6C45)
  fire: boolean;
  invCounter: number; // DS:0x25AA
  invulnerable: boolean; // DS:0x25AE
  shadowD: number; // shadow offset, 2 (low) .. 12 (high) (DS:0x6C67/68, both equal)
  drawnLife: number; // life and shield when the frame was drawn (energy bars)
  drawnShield: number;
  mounts: Mount[];
  shots: Shot[];
  slots: PlayerSlots;
  bonus: number[]; // inventory: 3 bonus kinds, 0 = empty (DS:0x550A)
  selected: number; // inventory selection 0..2 (DS:0x5528)
  selectKey: boolean; // bonus select / use flags as the input handler left them (DS:0x6C41 / 0x6C42)
  useKey: boolean;
  bombTimer: number; // atom bomb flash countdown (DS:0x25A3)
  x5Timer: number; // pentagram: x5 damage ticks left (DS:0x5532)
}

/** Bonus object or money label (8 B at DS:0x8582 + 8 i, i = 1..10, sprite slot 21 + i). */
export interface BonusObject {
  active: boolean; // +6: can be picked up
  kind: number; // +7: 1..10, 0xFF = "+1000" label counting down
  x0: number; // +0: centre of the wobble circle (level coordinates)
  y0: number; // +2
  timer: number; // +4: the enemy's reward at the drop; the label's countdown
}

export interface Enemy {
  slot: number; // +0 sprite slot
  type: number; // +2
  active: boolean; // +3
  dying: boolean; // +4: a wreck that still moves and scrolls away
  sub: number; // +5 movement pattern
  energy: number; // +6 (spawn delay while inactive)
  inter: number[]; // +8: per gun, ticks to the next shot of the salvo
  pause: number[]; // +C: per gun, salvo pause
  left: number[]; // +10: per gun, shots left in the salvo
  t: number; // +14 age
  c: number; // +16 aux counter
  x0: number; // +18
  y0: number; // +1A
  angle: number | null; // +1C Real, -1000.0 = unset
  phase: number; // +22
  shadowSlot: number; // +23
  layer: number; // +25: 0 ground, 1 air, 2 both
}

export interface EnemyShot {
  slot: number;
  pattern: number;
  active: boolean;
  kind: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

export interface Explosion {
  slot: number;
  x: number;
  y: number;
  frame: number;
  delay: number;
  active: boolean;
  anim: number;
}

export interface Anim {
  state: number; // 0 off, 1 forward, 2 backward
  slot: number;
  anim: number;
}

/**
 * A PlaySound / StopSound call. The voice conditions of the original are passed on, so the audio layer
 * can apply them without the simulation depending on audio state (SMIX voice count DS:0x87EA).
 */
export interface SoundEvent {
  n: number; // 0-based SMIX sound number
  loop?: boolean;
  stop?: boolean; // StopSound(n) (2769:0A75)
  belowVoices?: number; // play only while fewer voices than this play
  ifNotPlaying?: boolean; // play only if sound n isn't playing (SoundPlaying 2769:0AB9)
  copies?: number; // PlaySound called this many times in a row after one check (louder)
}

export interface World {
  data: GameData;
  rng: TpRandom;
  spr: SpriteTable;
  /** The sprite table as AniVGA drew it this tick (taken at the Animate call, before collisions). */
  drawn: SpriteTable;
  drawnScrollX: number;
  drawnScrollY: number;
  texts: Map<number, string>; // text sprites (money, lives, invulnerability digit) by sprite number
  frame: number; // DS:0x552E
  cycleCounter: number; // DS:0x5530
  scrollX: number; // DS:0x25B4
  scrollY: number; // DS:0x25B6
  scrolling: boolean; // DS:0x15E0
  autopilot: boolean; // level-end autopilot DS:0x15E4
  level: number; // 1..6
  episode: number;
  twoPlayer: boolean;
  players: Player[];
  enemies: Enemy[]; // index 1..29 (0 unused)
  enemyShots: EnemyShot[]; // 1..49
  explosions: Explosion[]; // 1..40
  anims: Anim[]; // 1..40
  bonuses: BonusObject[]; // 1..10
  wobbleCounter: number; // bonus wobble every 2nd tick (DS:0x6C6B)
  quake: number; // screen-shake ticks (DS:0x25A5)
  gameOver: number; // countdown (DS:0x6C66)
  levelDone: boolean; // DS:0x6C52
  gameCompleted: boolean; // DS:0x6C53
  /** Palette effects for the renderer: atom-bomb flash (FillChar 50) and the fade level (0 black .. FADE_STEPS). */
  flash: boolean;
  fade: number;
  /** StartBossFight runs as a blocking routine in the original; the remake freezes the game for these ticks. */
  freeze: number;
  track: number; // CD track the game asked for (DS:0x3E03): level music, 8 = boss
  sounds: SoundEvent[]; // played this tick
}

/** AniVGA FadeIn/FadeOut: 20 palette steps, one per vertical retrace (70 Hz) -> about 11 ticks at 40 Hz. */
export const FADE_STEPS = 19;

export const P1_SLOTS: PlayerSlots = {
  pods: 130, label: 129, jet: 128, arc: 125, digit: 126, shadow: 138, podShadows: 139, shot: 149, x5: 127, inv: 9, selFrame: 15,
};
export const LOW_SLOT_SHIFT = 398; // AltitudeSwap: P1 124 <-> 522, P2 249 <-> 647
export const P2_SLOT_SHIFT = 125;

function newMount(): Mount {
  return { reload: 0, loaded: true, occupied: false, item: 0, cat: 0 };
}

function newShot(): Shot {
  return { slot: 0, pattern: 0, active: false, type: 0, age: 0, mount: 0, sx: 0, sy: 0, tx: 0, ty: 0, target: 0, alt: true };
}

/** InitPlayer @0x1B2E3: a new pilot (5 spare ships, Firestorm, engine 1, shield 1, standard weapon). */
export function newPlayer(index: number): Player {
  const base = index === 0 ? P1_SLOTS : p2Slots();
  const p: Player = {
    index, active: false, life: 0, shield: 0, lives: 5, money: 0, jet: 1, engine: 1, shieldType: 1,
    vx: 0, vy: 0, high: true, altLatch: false, bonusLatch: false, pendingSwap: 0, flyIn: false, fire: false,
    invCounter: 0, invulnerable: false, shadowD: 12, drawnLife: 0, drawnShield: 0,
    mounts: Array.from({ length: 8 }, newMount), shots: Array.from({ length: 48 }, newShot),
    slots: { ...base }, bonus: [0, 0, 0], selected: 0, selectKey: false, useKey: false, bombTimer: 0, x5Timer: 0,
  };
  p.mounts[2] = { reload: 0, loaded: true, occupied: true, item: 1, cat: 8 };
  return p;
}

/** AltitudeSwap shifts the player's slot list (the HUD slots stay). */
export function shiftSlots(s: PlayerSlots, d: number): PlayerSlots {
  return {
    pods: s.pods + d, label: s.label + d, jet: s.jet + d, arc: s.arc + d, digit: s.digit + d,
    shadow: s.shadow + d, podShadows: s.podShadows + d, shot: s.shot + d, x5: s.x5 + d, inv: s.inv, selFrame: s.selFrame,
  };
}

export function p2Slots(): PlayerSlots {
  return { ...shiftSlots(P1_SLOTS, P2_SLOT_SHIFT), inv: 12, selFrame: 16 };
}

function newEnemy(): Enemy {
  return {
    slot: 0, type: 0, active: false, dying: false, sub: 0, energy: 0, inter: [0, 0, 0, 0], pause: [0, 0, 0, 0],
    left: [0, 0, 0, 0], t: 0, c: 0, x0: 0, y0: 0, angle: null, phase: 0, shadowSlot: 0, layer: 0,
  };
}

export function createWorld(data: GameData, seed = 0): World {
  return {
    data, rng: new TpRandom(seed), spr: new SpriteTable(), drawn: new SpriteTable(), drawnScrollX: 0, drawnScrollY: 0,
    texts: new Map(), frame: 0, cycleCounter: 0, scrollX: 0, scrollY: 0, scrolling: false, autopilot: false,
    level: 1, episode: 1, twoPlayer: false, players: [newPlayer(0), newPlayer(1)],
    enemies: Array.from({ length: 30 }, newEnemy),
    enemyShots: Array.from({ length: 50 }, () => ({ slot: 0, pattern: 0, active: false, kind: 0, sx: 0, sy: 0, tx: 0, ty: 0 })),
    explosions: Array.from({ length: 41 }, () => ({ slot: 0, x: 0, y: 0, frame: 0, delay: 0, active: false, anim: 0 })),
    anims: Array.from({ length: 41 }, () => ({ state: 0, slot: 0, anim: 0 })),
    bonuses: Array.from({ length: 11 }, () => ({ active: false, kind: 0, x0: 0, y0: 0, timer: 0 })),
    wobbleCounter: 0, quake: 0, gameOver: 0, levelDone: false, gameCompleted: false, flash: false, fade: FADE_STEPS,
    freeze: 0, track: 0, sounds: [],
  };
}

export function playSound(w: World, n: number, opts: Omit<SoundEvent, 'n'> = {}): void {
  w.sounds.push({ n, ...opts });
}

export function stopSound(w: World, n: number): void {
  w.sounds.push({ n, stop: true });
}
