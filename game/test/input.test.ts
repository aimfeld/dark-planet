import { describe, expect, it } from 'vitest';
import type { Gamepad } from '../src/input/gamepad';
import { Keyboard } from '../src/input/keyboard';
import type { Mouse } from '../src/input/mouse';
import { keyLegend } from '../src/input/keyLegend';
import { playerInputs } from '../src/input/players';
import { createWorld, NO_INPUT, type PlayerInput, type World } from '../src/sim/state';
import { newGame, startLevel, step } from '../src/sim/tick';
import { gameData, hasData } from './helpers';

/** Level 1 without scrolling; P2 joined when `twoPlayer`. */
async function world(twoPlayer = false): Promise<World> {
  const w = createWorld(await gameData(), 3);
  newGame(w, twoPlayer);
  startLevel(w, 1);
  w.scrolling = false;
  return w;
}

const mouse = (x: number, y: number, more: Partial<PlayerInput> = {}): PlayerInput =>
  ({ ...NO_INPUT, device: 2, mouseX: x, mouseY: y, ...more });
const stick = (more: Partial<PlayerInput> = {}): PlayerInput => ({ ...NO_INPUT, device: 3, ...more });

describe.skipIf(!hasData)('control types (spec §2, §3.1)', () => {
  it('mouse: accelerates the jet corner toward the pointer and stops in the 5 x max dead zone', async () => {
    const w = await world();
    const p = w.players[0];
    const s = p.slots.jet;
    const y = w.spr.y[s] - w.scrollY; // screen y of the jet corner
    const x0 = w.spr.x[s];
    step(w, [mouse(x0 + 100, y)]);
    expect(p.vx).toBe(1);
    expect(p.vy).toBe(0); // inside the dead zone vertically
    for (let t = 0; t < 5; t++) step(w, [mouse(x0 + 100, y)]);
    expect(p.vx).toBe(3); // engine 1: max 3
    for (let t = 0; t < 60; t++) step(w, [mouse(x0 + 100, y)]);
    // braking starts 15 px (5 x 3) before the target, so it ends within reach of it
    expect(Math.abs(w.spr.x[s] - (x0 + 100))).toBeLessThanOrEqual(15);
    expect(p.vx).toBe(0);
  });

  it('mouse: no decay outside the dead zone, the right button toggles the altitude once per press', async () => {
    const w = await world();
    const p = w.players[0];
    const s = p.slots.jet;
    const y = w.spr.y[s] - w.scrollY;
    expect(p.high).toBe(true);
    step(w, [mouse(w.spr.x[s], y, { altitude: true })]);
    expect(p.high).toBe(false);
    for (let t = 0; t < 5; t++) step(w, [mouse(w.spr.x[s], y, { altitude: true })]);
    expect(p.high).toBe(false);
    step(w, [mouse(w.spr.x[s], y)]);
    step(w, [mouse(w.spr.x[s], y, { altitude: true })]);
    expect(p.high).toBe(true);
  });

  it('joystick: digital directions and decay like the keys, button 2 toggles the altitude once per press', async () => {
    const w = await world();
    const p = w.players[0];
    step(w, [stick({ left: true })]);
    step(w, [stick({ left: true })]);
    expect(p.vx).toBe(-2);
    while (w.frame % 4 !== 3) step(w, [stick()]);
    expect(p.vx).toBe(-2);
    step(w, [stick()]); // frame mod 4 = 0
    expect(p.vx).toBe(-1);
    step(w, [stick({ altitude: true })]);
    step(w, [stick({ altitude: true })]);
    expect(p.high).toBe(false);
  });

  it('two players: each player reads its own input (P1 mouse, P2 keyboard)', async () => {
    const w = await world(true);
    const [p1, p2] = w.players;
    const s1 = p1.slots.jet;
    step(w, [mouse(w.spr.x[s1] - 80, w.spr.y[s1] - w.scrollY), { ...NO_INPUT, right: true }]);
    expect(p1.vx).toBe(-1);
    expect(p2.vx).toBe(1);
  });
});

describe('keyboard sets (remake: WASD for a second keyboard player)', () => {
  const setup = () => {
    const target = new EventTarget();
    const keys = new Keyboard(target as unknown as Window);
    const key = (type: string, code: string) => target.dispatchEvent(Object.assign(new Event(type), { code }));
    return { keys, key };
  };

  it('WASD moves, left Shift fires, Q switches altitude, E selects and Shift + E uses', () => {
    const { keys, key } = setup();
    for (const c of ['KeyW', 'KeyA', 'ShiftLeft', 'KeyE']) key('keydown', c);
    keys.sample();
    const p = keys.player(true);
    expect([p.device, p.up, p.left, p.right, p.fire, p.select, p.use, p.altitude]).toEqual([4, true, true, false, true, true, true, false]);
    expect(keys.player().fire).toBe(false); // the arrow player doesn't see them
  });

  it('shared keyboard: the arrow player keeps only , . - left of right Shift', () => {
    const { keys, key } = setup();
    for (const c of ['ControlLeft', 'KeyC', 'Space']) key('keydown', c);
    keys.sample();
    expect(keys.player(false, false)).toMatchObject({ fire: true, altitude: true, select: true, use: true });
    expect(keys.player(false, true)).toMatchObject({ fire: false, altitude: false, select: false });
    for (const c of ['ControlLeft', 'KeyC', 'Space']) key('keyup', c);
    for (const c of ['ControlRight', 'AltRight', 'ShiftRight']) key('keydown', c);
    keys.sample();
    expect(keys.player(false, true)).toMatchObject({ fire: false, altitude: false, select: false });
    for (const c of ['ControlRight', 'AltRight', 'ShiftRight']) key('keyup', c);
    for (const c of ['Comma', 'Period', 'Slash']) key('keydown', c);
    keys.sample();
    expect(keys.player(false, true)).toMatchObject({ fire: true, altitude: true, select: true, use: true });
    expect(keys.player(true)).toMatchObject({ fire: false, altitude: false, select: false }); // not the WASD player's
  });

  it('playerInputs: WASD in the game makes the arrow set right-handed', () => {
    const { keys, key } = setup();
    key('keydown', 'KeyX');
    keys.sample();
    const mouse = {} as Mouse;
    const pad = {} as Gamepad;
    expect(playerInputs([1, 4], [true, false], keys, mouse, pad)[0].fire).toBe(true); // P2 not playing
    expect(playerInputs([1, 4], [true, true], keys, mouse, pad)[0].fire).toBe(false);
  });
});

describe('key legend', () => {
  it('one line per player (P2 only in multiplayer), X/C/V instead of Ctrl/Alt/Space, , . - while WASD plays', () => {
    expect(keyLegend([1, 4], [true, false])).toEqual([
      'Player1 — Pfeile: fliegen · X: ballern · C: hoch/tief · V: Bonus selektieren · X+V: Bonus abfeuern',
      'P: Pause · Esc: Spiel abbrechen · F: Vollbild',
    ]);
    const wasd = keyLegend([1, 4], [true, true]);
    expect(wasd[0]).toBe('Player1 — Pfeile: fliegen · Komma: ballern · Punkt: hoch/tief · Minus: Bonus selektieren · Komma+Minus: Bonus abfeuern');
    expect(wasd[1]).toBe('Player2 — WASD: fliegen · Shift links: ballern · Q: hoch/tief · E: Bonus selektieren · Shift+E: Bonus abfeuern');
    expect(wasd.join()).not.toMatch(/Ctrl|Alt/);
    const pad = keyLegend([2, 3], [true, true]);
    expect(pad[0]).toContain('Player1 — Maus: fliegen · links: ballern');
    expect(pad[1]).toContain('Player2 — Joystick: fliegen · A/RT: ballern');
    expect(pad).toHaveLength(3);
    expect(keyLegend([1, 4], [true, false], 'intro')).toEqual(['Beliebige Taste oder Klick: Intro überspringen']);
  });
});
