// Store screenshots (dev only, screenshots.html, driven by tools/screenshots.mjs): plays levels with a bot and
// scripted loadouts, picks the busiest moments and draws each one twice, classic and remastered. The menus are
// played through a Game with scripted input. Not part of the game or its build.
//
// A level runs twice with the same seed: pass 1 only simulates and scores every tick (enemies, explosions and
// shots on the screen), pass 2 replays it and draws the chosen ticks. The simulation and the bot are deterministic,
// so both passes see the same game. The remastered effects follow the ticks (HiResView.afterTick), so pass 2 feeds
// them every tick and draws only the chosen ones.

import { loadGameData, type GameData } from './data';
import { Game, memorySlot } from './game';
import { ClassicView } from './render/classicView';
import { REMASTER_METHOD } from './render/hiResView';
import type { MenuInput } from './screens/proc';
import { Screen } from './screens/screen';
import { useBonus } from './sim/bonus';
import { createWorld, FADE_STEPS, NO_INPUT, type Mount, type Player, type PlayerInput, type World } from './sim/state';
import { joinPlayer2, newGameState, startLevel, step } from './sim/tick';

/** A player's equipment, as the shop could sell it (mount rules: gameplay-spec §4.1). */
interface Loadout {
  jet: number; // 1 Firestorm, 2 Navi Spezial, 3 Alien-Pro, 4 Steptokopter, 5 Alien-Pro 2
  engine?: number; // 0..3 (default 3)
  shield?: number; // 0..3 (default 3)
  small?: number; // small pod id (mount 1)
  large?: Partial<Record<0 | 3 | 4 | 5 | 6, number>>; // large pod id by mount
  ball?: number; // ball pod id (mount 7)
}

interface LevelScenario {
  name: string;
  level: number;
  boss?: boolean; // start at the boss fight
  seed: number;
  players: Loadout[];
  range?: [number, number]; // share of the run the shots are picked from
  shots: number;
  bonuses?: number[]; // bonus kinds the pilot uses in turn (bonus.ts useBonus), one every BONUS_EVERY ticks
}

export interface Capture {
  name: string;
  info: string;
  classic: string; // PNG data URL
  remastered: string;
}

const MAX_TICKS = 14000;
const BOSS_TICKS = 4000;
const SPACING = 160; // ticks between two shots of a run
const BOSS_SPACING = 45;
// The bosses die within a few hundred ticks under constant fire: in their fights the bot fires in bursts
const BOSS_BURST = 24;
const BOSS_PAUSE = 36;
const BOSS_TOUGHNESS = 8; // and the boss parts get this much more energy (screenshots only: the fight lasts longer)
const BONUS_EVERY = 330;

// Small pods: 1 Missiles, 2 Myonenwerfer, 3 Duallaser, 4 Autogun, 5 Protoner, 6 Stargun, 7 Sidefire.
// Large pods: 1 Flamer, 2 Windstorm, 3 Plasmapod, 4 MG, 5 MK Pod, 6 Elektroball, 7 E-Shocker, 8 Sideralbolt,
// 9 Rocketlauncher, 10 Xenon, 11 G-Destructor. Ball pods: 1 Smiley 2, 2 Teutonenkopf, 3 Distroyer, 4 Teufelsreigen.
// Bonus kinds: 5 Blast, 7 Twin-Laser, 9 Star, 10 pentagram (x5).
const LEVELS: LevelScenario[] = [
  { name: 'l1-firestorm', level: 1, seed: 11, range: [0.05, 0.55], shots: 4,
    players: [{ jet: 1, engine: 1, shield: 1, small: 2, large: { 3: 3 } }] },
  { name: 'l1-navi', level: 1, seed: 12, range: [0.45, 1], shots: 4, bonuses: [7, 9],
    players: [{ jet: 2, small: 1, large: { 3: 4, 4: 4 }, ball: 1 }] },
  { name: 'l2-alienpro', level: 2, seed: 21, range: [0, 0.5], shots: 4,
    players: [{ jet: 3, small: 3, large: { 0: 8, 3: 6, 4: 6 }, ball: 2 }] },
  { name: 'l2-navi', level: 2, seed: 22, range: [0.5, 1], shots: 4, bonuses: [5, 7],
    players: [{ jet: 2, small: 4, large: { 3: 5, 4: 5 }, ball: 3 }] },
  { name: 'l3-steptokopter', level: 3, seed: 31, range: [0, 0.5], shots: 4,
    players: [{ jet: 4, small: 5, large: { 0: 9, 3: 1, 4: 1 }, ball: 4 }] },
  { name: 'l3-alienpro2', level: 3, seed: 32, range: [0.5, 1], shots: 4, bonuses: [9, 10],
    players: [{ jet: 5, small: 7, large: { 0: 10, 3: 7, 4: 7, 5: 2, 6: 2 }, ball: 3 }] },
  { name: 'l4-alienpro2', level: 4, seed: 41, range: [0, 0.5], shots: 4,
    players: [{ jet: 5, small: 6, large: { 0: 11, 3: 9, 4: 9, 5: 3, 6: 3 }, ball: 4 }] },
  { name: 'l4-alienpro', level: 4, seed: 42, range: [0.5, 1], shots: 4, bonuses: [7, 5],
    players: [{ jet: 3, small: 3, large: { 0: 1, 3: 10, 4: 10 }, ball: 1 }] },
  { name: 'l5-steptokopter', level: 5, seed: 51, range: [0, 0.5], shots: 4, bonuses: [9],
    players: [{ jet: 4, small: 6, large: { 0: 7, 3: 8, 4: 8 }, ball: 2 }] },
  { name: 'l5-alienpro2', level: 5, seed: 52, range: [0.5, 1], shots: 4,
    players: [{ jet: 5, small: 5, large: { 0: 2, 3: 5, 4: 5, 5: 6, 6: 6 }, ball: 4 }] },
  { name: 'l6-alienpro2', level: 6, seed: 61, range: [0, 0.5], shots: 4, bonuses: [10, 7],
    players: [{ jet: 5, small: 6, large: { 0: 11, 3: 1, 4: 1, 5: 10, 6: 10 }, ball: 3 }] },
  { name: 'l6-navi', level: 6, seed: 62, range: [0.5, 1], shots: 4,
    players: [{ jet: 2, small: 4, large: { 3: 9, 4: 9 }, ball: 2 }] },
  { name: 'l2-coop', level: 2, seed: 23, range: [0.15, 0.85], shots: 4, bonuses: [9, 7],
    players: [{ jet: 5, small: 6, large: { 0: 10, 3: 3, 4: 3, 5: 4, 6: 4 }, ball: 4 }, { jet: 4, small: 3, large: { 0: 1, 3: 6, 4: 6 }, ball: 2 }] },
  { name: 'l5-coop', level: 5, seed: 53, range: [0.15, 0.85], shots: 4,
    players: [{ jet: 3, small: 7, large: { 0: 9, 3: 2, 4: 2 }, ball: 1 }, { jet: 2, small: 6, large: { 3: 7, 4: 7 }, ball: 3 }] },
  { name: 'boss1', level: 1, boss: true, seed: 101, shots: 3, bonuses: [7],
    players: [{ jet: 2, small: 2, large: { 3: 3, 4: 4 }, ball: 1 }] },
  { name: 'boss2', level: 2, boss: true, seed: 102, shots: 3,
    players: [{ jet: 3, small: 1, large: { 0: 6, 3: 8, 4: 8 }, ball: 2 }] },
  { name: 'boss3', level: 3, boss: true, seed: 103, shots: 3, bonuses: [9],
    players: [{ jet: 4, small: 3, large: { 0: 10, 3: 5, 4: 5 }, ball: 3 }] },
  { name: 'boss4', level: 4, boss: true, seed: 104, shots: 3,
    players: [{ jet: 5, small: 4, large: { 0: 1, 3: 2, 4: 2, 5: 8, 6: 8 }, ball: 4 }] },
  { name: 'boss5-coop', level: 5, boss: true, seed: 105, shots: 3,
    players: [{ jet: 5, small: 6, large: { 0: 7, 3: 9, 4: 9, 5: 3, 6: 3 }, ball: 4 }, { jet: 3, small: 5, large: { 0: 11, 3: 4, 4: 4 }, ball: 1 }] },
  { name: 'boss6', level: 6, boss: true, seed: 106, shots: 4, bonuses: [7, 9],
    players: [{ jet: 5, small: 6, large: { 0: 11, 3: 7, 4: 7, 5: 10, 6: 10 }, ball: 3 }] },
];

const MENUS = ['menus', 'shop'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function mount(item: number, cat: number): Mount {
  return { reload: 0, loaded: true, occupied: true, item, cat };
}

function equip(data: GameData, p: Player, lo: Loadout): void {
  const jet = data.tables.jets[lo.jet - 1];
  p.jet = lo.jet;
  p.engine = lo.engine ?? 3;
  p.shieldType = lo.shield ?? 3;
  p.money = 48350 + 1000 * lo.jet;
  for (let m = 0; m < 8; m++) p.mounts[m] = { reload: 0, loaded: true, occupied: false, item: 0, cat: 0 };
  p.mounts[2] = mount(lo.jet, 8);
  const put = (m: number, item: number, cat: number) => {
    if (!jet.mounts[m]) throw new Error(`${jet.name} has no mount ${m}`);
    p.mounts[m] = mount(item, cat);
  };
  if (lo.small) put(1, lo.small, 1);
  for (const [m, item] of Object.entries(lo.large ?? {})) put(Number(m), item, 2);
  if (lo.ball) put(7, lo.ball, 6);
}

function describe(data: GameData, s: LevelScenario): string {
  const t = data.tables;
  const pilot = (lo: Loadout) => {
    const gear = [
      lo.small && t.small_pods[lo.small - 1].name,
      ...Object.values(lo.large ?? {}).map((id) => t.large_pods[id - 1].name),
      lo.ball && t.ball_pods[lo.ball - 1].name,
    ].filter(Boolean);
    return `${t.jets[lo.jet - 1].name} (${gear.join(', ')})`;
  };
  return `Level ${s.level}${s.boss ? ' boss' : ''}: ${s.players.map(pilot).join(' + ')}`;
}

/** The centre of a sprite slot on the screen, or null if it is empty or off the playfield. */
function onScreen(w: World, slot: number): [number, number] | null {
  const n = w.spr.n[slot];
  if (n === 0) return null;
  const sp = w.data.sprites.get(n);
  const x = w.spr.x[slot] - w.scrollX + (sp ? sp.w >> 1 : 0);
  const y = w.spr.y[slot] - w.scrollY + (sp ? sp.h >> 1 : 0);
  return x >= 8 && x <= 311 && y >= 4 && y <= 196 ? [x, y] : null;
}

/** How much is going on: a tick with fades, the boss start freeze or the level-end autopilot doesn't count. */
function score(w: World): number {
  if (w.freeze > 0 || w.fade !== FADE_STEPS || w.flash || w.autopilot || w.levelDone || w.quake > 0) return -1;
  let enemies = 0, explosions = 0, enemyShots = 0, shots = 0;
  for (let i = 1; i < w.enemies.length; i++) {
    const e = w.enemies[i];
    if (e.active && !e.dying && onScreen(w, e.slot)) enemies++;
  }
  for (let i = 1; i < w.explosions.length; i++) if (w.explosions[i].active && onScreen(w, w.explosions[i].slot)) explosions++;
  for (let i = 1; i < w.enemyShots.length; i++) if (w.enemyShots[i].active && onScreen(w, w.enemyShots[i].slot)) enemyShots++;
  for (const p of w.players) if (p.active) for (const s of p.shots) if (s.active) shots++;
  return 3 * Math.min(enemies, 8) + 1.5 * Math.min(explosions, 10) + 0.7 * Math.min(enemyShots, 15) + 0.25 * Math.min(shots, 20);
}

/** Per player: altitude wanted by the current target and how long it has wanted it. */
interface BotState {
  wantHigh: boolean;
  since: number;
}

/**
 * Keyboard input that flies under the nearest enemy ahead (each player its own, P2 offset) and keeps firing; the
 * altitude follows the target's layer once it has stayed the same for a while.
 */
function bot(w: World, p: Player, b: BotState): PlayerInput {
  const t = w.data.tables;
  const e = t.jets[p.jet - 1].extents;
  const s = p.slots.jet;
  const cx = w.spr.x[s] - w.scrollX + ((e.l + e.r) >> 1);
  const cy = w.spr.y[s] - w.scrollY + ((e.t + e.b) >> 1);
  const lane = w.twoPlayer ? (p.index === 0 ? -1 : 1) : 0;
  let best: [number, number] | null = null;
  let bestCost = Infinity, layer = 1;
  for (let i = 1; i < w.enemies.length; i++) {
    const en = w.enemies[i];
    if (!en.active || en.dying) continue;
    const at = onScreen(w, en.slot);
    if (!at) continue;
    const cost = Math.abs(at[0] - (cx + 40 * lane)) + (at[1] > cy - 20 ? 250 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = at;
      layer = en.layer;
    }
  }
  const wave = Math.sin(w.frame / 85 + p.index * 2);
  const tx = best ? best[0] + 18 * lane : 160 + 90 * wave + 50 * lane;
  const ty = Math.max(105, Math.min(165, best ? best[1] + 85 : 140)) + 14 * Math.sin(w.frame / 55 + p.index);
  const max = p.engine === 0 ? t.no_engine_max_speed : t.engines[p.engine - 1].max_speed;
  const tvx = Math.max(-max, Math.min(max, Math.round((tx - cx) / 8)));
  const tvy = Math.max(-max, Math.min(max, Math.round((ty - cy) / 8)));
  const wantHigh = !best || layer !== 0;
  if (wantHigh !== b.wantHigh) {
    b.wantHigh = wantHigh;
    b.since = w.frame;
  }
  const altitude = p.pendingSwap === 0 && !p.altLatch && p.high !== b.wantHigh && w.frame - b.since > 30;
  const fire = w.scrolling || (w.frame + 17 * p.index) % (BOSS_BURST + BOSS_PAUSE) < BOSS_BURST;
  return { ...NO_INPUT, left: p.vx > tvx, right: p.vx < tvx, up: p.vy > tvy, down: p.vy < tvy, fire, altitude };
}

/** Full life and shield after every tick, so the bot never dies (the bars stay full). */
function heal(w: World): void {
  const t = w.data.tables;
  for (const p of w.players) {
    if (!p.active) continue;
    p.life = t.jets[p.jet - 1].max_life;
    p.shield = p.shieldType > 0 ? t.shields[p.shieldType - 1].max : 0;
    p.drawnLife = p.life;
    p.drawnShield = p.shield;
  }
}

class Shots {
  private constructor(private readonly data: GameData, private readonly view: ClassicView) {}

  static async create(): Promise<Shots> {
    const base = import.meta.env.BASE_URL;
    const data = await loadGameData({
      json: async (name) => (await fetch(base + 'data/' + name)).json(),
      binary: async (name) => (await fetch(base + 'data/' + name)).arrayBuffer(),
    });
    const view = await ClassicView.create(document.getElementById('app')!, data);
    await view.hiRes.use(REMASTER_METHOD);
    return new Shots(data, view);
  }

  scenarios(): string[] {
    return [...LEVELS.map((s) => s.name), ...MENUS];
  }

  async run(name: string): Promise<Capture[]> {
    if (name === 'menus') return this.menus();
    if (name === 'shop') return this.shop();
    const s = LEVELS.find((l) => l.name === name);
    if (!s) throw new Error(`unknown scenario ${name}`);
    return this.level(s);
  }

  /** Draw the same moment remastered (once every texture it needs has loaded) and classic. */
  private async capture(name: string, info: string, draw: () => void): Promise<Capture> {
    const canvas = this.view.element;
    await this.view.hiRes.use(REMASTER_METHOD);
    for (let i = 0; i < 400; i++) {
      draw();
      if (!this.view.hiRes.loading) break;
      await sleep(25);
    }
    draw();
    const remastered = canvas.toDataURL('image/png');
    await this.view.hiRes.use(null);
    draw();
    const classic = canvas.toDataURL('image/png');
    await this.view.hiRes.use(REMASTER_METHOD);
    return { name, info, classic, remastered };
  }

  private newWorld(s: LevelScenario): World {
    const w = createWorld(this.data, s.seed);
    newGameState(w);
    if (s.players.length > 1) joinPlayer2(w);
    s.players.forEach((lo, i) => equip(this.data, w.players[i], lo));
    startLevel(w, s.level, s.boss);
    return w;
  }

  /** One tick of the scripted game: bot input, a bonus now and then, the simulation, healing. */
  private tick(w: World, s: LevelScenario, bots: BotState[]): void {
    const inputs = w.players.map((p, i) => (p.active ? bot(w, p, bots[i]) : NO_INPUT));
    if (s.bonuses && w.frame > 0 && w.frame % BONUS_EVERY === 0 && !w.autopilot && w.freeze === 0) {
      const kind = s.bonuses[(w.frame / BONUS_EVERY - 1) % s.bonuses.length];
      for (const p of w.players) if (p.active) useBonus(w, p, kind);
    }
    const scrolling = w.scrolling;
    step(w, inputs);
    heal(w);
    if (scrolling && !w.scrolling) for (const e of w.enemies) if (e.active) e.energy *= BOSS_TOUGHNESS; // StartBossFight
  }

  private async level(s: LevelScenario): Promise<Capture[]> {
    // pass 1: score every tick
    const scores: number[] = [];
    {
      const w = this.newWorld(s);
      const bots = w.players.map(() => ({ wantHigh: true, since: 0 }));
      const limit = s.boss ? BOSS_TICKS : MAX_TICKS;
      // a level scenario ends where the boss fight starts (the boss scenarios show it)
      while (scores.length < limit && !w.levelDone && w.gameOver === 0 && (s.boss || w.scrolling)) {
        this.tick(w, s, bots);
        scores.push(score(w));
      }
    }
    const [a, b] = s.range ?? [0, 1];
    const from = Math.floor(a * scores.length), to = Math.floor(b * scores.length);
    const order = scores.map((v, i) => [v, i] as const).filter(([v, i]) => v > 0 && i >= from && i < to);
    order.sort((x, y) => y[0] - x[0]);
    const picked: number[] = [];
    for (const [, i] of order) {
      if (picked.length >= s.shots) break;
      if (picked.every((j) => Math.abs(i - j) >= (s.boss ? BOSS_SPACING : SPACING))) picked.push(i);
    }
    picked.sort((x, y) => x - y);
    // pass 2: replay, feeding the remastered effects, and draw the picked ticks
    const out: Capture[] = [];
    const w = this.newWorld(s);
    const bots = w.players.map(() => ({ wantHigh: true, since: 0 }));
    const hiRes = this.view.hiRes;
    const info = describe(this.data, s);
    for (let i = 0; i <= (picked.at(-1) ?? -1); i++) {
      hiRes.beforeTick('world', w, null!);
      this.tick(w, s, bots);
      hiRes.afterTick('world', w);
      if (!picked.includes(i)) continue;
      if (score(w) !== scores[i]) console.warn(`${s.name}: replay differs at tick ${i}`);
      out.push(await this.capture(`${s.name}-${picked.indexOf(i) + 1}`, `${info}, tick ${i}`, () => this.view.draw(w, 1)));
    }
    return out;
  }

  /** A Game at its main menu (no start screen, no intro video), with scripted keys and mouse. */
  private menuGame(seed: number) {
    const input = new Script();
    const settings = { control: [1, 4] as [number, number], cdSound: false, soundEffects: false, remastered: true, language: 'de' as const };
    const game = new Game(createWorld(this.data, seed), input, settings, undefined, undefined, undefined, memorySlot(),
      undefined, false);
    const hiRes = this.view.hiRes;
    const run = (ticks: number) => {
      for (let i = 0; i < ticks; i++) {
        hiRes.beforeTick(game.view, game.world, game.screen);
        game.tick(input);
      }
    };
    const press = (code: string, ticks = 2, after = 20) => {
      input.keys.add(code);
      run(ticks);
      input.keys.delete(code);
      run(after);
    };
    const move = (x: number, y: number, after = 30) => {
      input.mouse.x = x;
      input.mouse.y = y;
      run(after);
    };
    const click = (x: number, y: number, after = 40) => {
      move(x, y, 10);
      input.mouse.left = true;
      run(2);
      input.mouse.left = false;
      run(after);
    };
    const shot = (name: string, info: string) => this.capture(name, info, () => this.view.drawScreen(game.screen, 1));
    return { game, run, press, move, click, shot };
  }

  private async menus(): Promise<Capture[]> {
    const out: Capture[] = [];
    // the main menu's picture alone, without its items: a title image
    const title = new Screen(this.data);
    title.picture = 'HMBILD';
    title.palette = 'HMBILD';
    title.fade = FADE_STEPS;
    out.push(await this.capture('title', 'Main menu picture (HMBILD) without the items', () => this.view.drawScreen(title, 1)));
    const g = this.menuGame(3);
    g.run(60);
    out.push(await g.shot('menu-1', 'Main menu'));
    g.press('ArrowDown', 2, 45);
    out.push(await g.shot('menu-2', 'Main menu'));
    g.press('ArrowDown', 2, 25);
    g.press('ArrowDown', 2, 45);
    out.push(await g.shot('menu-3', 'Main menu'));
    // the hangar: Neues Spiel
    const h = this.menuGame(4);
    h.run(40);
    h.press('Enter');
    h.run(60);
    h.move(140, 132, 60); // Shoot em all: its door opens
    out.push(await h.shot('hangar-1', 'Hangar'));
    h.move(282, 132, 60); // Shop
    out.push(await h.shot('hangar-2', 'Hangar'));
    return out;
  }

  private async shop(): Promise<Capture[]> {
    const MODE_BUY = [170, 139] as const;
    const CATEGORY_RIGHT = [143, 142] as const;
    const box = (i: number) => [56 * i - 10, 175] as const;
    const out: Capture[] = [];
    const g = this.menuGame(5);
    const s = g.game.screen;
    const category = () => s.texts.get(840)?.text ?? '';
    g.run(40);
    g.press('Enter'); // Neues Spiel
    g.run(40);
    for (const k of ['KeyG', 'KeyE', 'KeyD', 'KeyA', 'KeyN', 'KeyK', 'KeyE']) g.press(k, 2, 4); // 666666 money
    g.click(280, 130, 80); // Shop
    g.click(...box(1)); // Plasmapod
    g.move(178, 128, 10);
    out.push(await g.shot('shop-1', `Shop: Firestorm, ${category()}`));
    g.click(...MODE_BUY, 30); // the pod hangs on the pointer
    g.move(84, 62, 20);
    out.push(await g.shot('shop-2', 'Shop: placing a large pod'));
    g.click(84, 62); // onto the Firestorm's large mount
    for (let i = 0; i < 8 && category() !== 'Jets'; i++) g.click(...CATEGORY_RIGHT, 20);
    g.click(...box(4)); // Alien-Pro 2
    g.move(150, 120, 10);
    out.push(await g.shot('shop-3', `Shop: ${category()}`));
    g.click(...MODE_BUY, 40);
    g.click(290, 139, 80); // Exit: back to the hangar, then fit the Alien-Pro 2 out and come back
    equip(this.data, g.game.world.players[0], { jet: 5, small: 6, large: { 0: 11, 3: 9, 4: 9, 5: 7, 6: 7 }, ball: 4 });
    g.game.world.players[0].money = 471350;
    g.click(280, 130, 80);
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const c = category();
      if (!seen.has(c) && c !== 'Jets') { // (no jet above the Alien-Pro 2)
        seen.add(c);
        // an offer with its info text (owned ones show none)
        for (let k = 0; k < 5; k++) {
          g.click(...box(1 + ((i + 1 + k) % 5)));
          if (s.texts.get(827)?.text) break;
        }
        g.move(200 - 12 * i, 112, 10);
        out.push(await g.shot(`shop-${4 + out.length - 3}`, `Shop: Alien-Pro 2 fitted out, ${c}`));
      }
      g.click(...CATEGORY_RIGHT, 20);
    }
    return out;
  }
}

/** Scripted menu input (as test/menuHarness.ts). */
class Script implements MenuInput {
  keys = new Set<string>();
  mouse = {
    x: 160, y: 100, left: false, right: false,
    get down() {
      return this.left || this.right;
    },
  };
  players = [NO_INPUT, NO_INPUT];
  held(code: string): boolean {
    return this.keys.has(code);
  }
  anyKey(): boolean {
    return this.keys.size > 0;
  }
}

(window as unknown as { shots: Promise<Shots> }).shots = Shots.create();
