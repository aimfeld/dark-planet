import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gamepad } from '../src/input/gamepad';
import { STEAM_DECK_NAMES, XBOX_NAMES } from '../src/i18n';
import { Keyboard } from '../src/input/keyboard';
import type { Mouse } from '../src/input/mouse';
import { keyLegend } from '../src/input/keyLegend';
import { padAssignment, playerInputs } from '../src/input/players';
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
    const key = (type: string, code: string, extra = {}) => target.dispatchEvent(Object.assign(new Event(type), { code }, extra));
    return { keys, key };
  };

  it('WASD moves, X fires, C switches altitude, V selects and X + V uses', () => {
    const { keys, key } = setup();
    for (const c of ['KeyW', 'KeyA', 'KeyX', 'KeyV']) key('keydown', c);
    keys.sample();
    const p = keys.player(true);
    expect([p.device, p.up, p.left, p.right, p.fire, p.select, p.use, p.altitude]).toEqual([4, true, true, false, true, true, true, false]);
    expect(keys.player(false, true).fire).toBe(false); // the arrow player doesn't see them
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

  it('forgets modifiers whose keyup the desktop took, and keys released while Cmd was held', () => {
    const { keys, key } = setup();
    // Key and pointer events with the browser's modifier state.
    const send = (type: string, code: string, states: string[]) =>
      key(type, code, { getModifierState: (m: string) => states.includes(m) });
    const tick = () => {
      keys.sample(); // a tap since the last sample still counts once
      keys.sample();
    };
    // Ctrl+Alt+Left: the window manager takes the arrow and both keyups.
    send('keydown', 'ControlLeft', ['Control']);
    send('keydown', 'AltLeft', ['Control', 'Alt']);
    tick();
    expect(keys.anyKey()).toBe(true);
    send('pointermove', '', []);
    tick();
    expect(keys.anyKey()).toBe(false);
    // AltGr (AltRight, with a left Ctrl on Windows) stays held while the browser reports AltGraph.
    send('keydown', 'ControlLeft', ['AltGraph']);
    send('keydown', 'AltRight', ['AltGraph']);
    send('pointermove', '', ['AltGraph']);
    tick();
    expect([keys.held('ControlLeft'), keys.held('AltRight')]).toEqual([true, true]);
    send('keyup', 'AltRight', []);
    tick();
    expect(keys.anyKey()).toBe(false);
    // Cmd+X: macOS sends no keyup for X.
    send('keydown', 'MetaLeft', ['Meta']);
    send('keydown', 'KeyX', ['Meta']);
    send('keyup', 'MetaLeft', []);
    tick();
    expect(keys.anyKey()).toBe(false);
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
    expect(keyLegend('de', [1, 4], [true, false])).toEqual([
      'Player1 — Pfeile: fliegen · X: ballern · C: hoch/tief · V: Bonus selektieren · X+V: Bonus abfeuern',
      'P: Pause · Esc: Spiel abbrechen · F: Vollbild · R: Grafik classic/remastered',
    ]);
    const wasd = keyLegend('de', [1, 4], [true, true]);
    expect(wasd[0]).toBe('Player1 — Pfeile: fliegen · Komma: ballern · Punkt: hoch/tief · Minus: Bonus selektieren · Komma+Minus: Bonus abfeuern');
    expect(wasd[1]).toBe('Player2 — WASD: fliegen · X: ballern · C: hoch/tief · V: Bonus selektieren · X+V: Bonus abfeuern');
    expect(wasd.join()).not.toMatch(/Ctrl|Alt/);
    const pad = keyLegend('de', [2, 3], [true, true]);
    expect(pad[0]).toContain('Player1 — Maus: fliegen · links: ballern');
    expect(pad[1]).toContain('Player2 — Joystick: fliegen · A/RT: ballern');
    expect(pad).toHaveLength(3);
    expect(keyLegend('de', [1, 4], [true, false], 'hangar')).toHaveLength(3);
    expect(keyLegend('de', [1, 4], [true, false], 'hangar')[2]).toBe('Cheat Code: gedanke');
    expect(keyLegend('de', [1, 4], [true, false], 'intro')).toEqual(['Beliebige Taste oder Klick: Intro überspringen']);
  });
});

/** A standard-mapping pad with `buttons` pressed and the axes `axes` (lx, ly, rx, ry). */
function fakePad(buttons: number[] = [], axes = [0, 0, 0, 0]): globalThis.Gamepad {
  return {
    connected: true, mapping: 'standard', axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), touched: false, value: buttons.includes(i) ? 1 : 0 })),
  } as unknown as globalThis.Gamepad;
}

function connect(...pads: (globalThis.Gamepad | null)[]): void {
  vi.stubGlobal('navigator', { getGamepads: () => pads });
}

describe('gamepads (remake: no Joystick setting needed)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('padAssignment: a Joystick player takes the first pad, then the keyboard players in the game the next ones', () => {
    expect(padAssignment([1, 4], [true, false])).toEqual([0, -1]);
    expect(padAssignment([1, 4], [true, true])).toEqual([0, 1]);
    expect(padAssignment([2, 4], [true, true])).toEqual([-1, 0]);
    expect(padAssignment([1, 3], [true, true])).toEqual([1, 0]);
    expect(padAssignment([5, 1], [true, false])).toEqual([-1, -1]);
  });

  it('a keyboard player also flies with its pad; P2 gets the second pad', () => {
    const target = new EventTarget();
    const keys = new Keyboard(target as unknown as Window);
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'ArrowLeft' }));
    keys.sample();
    const pad = new Gamepad();
    connect(null, fakePad([0], [0, 0.9, 0, 0]), fakePad([1]));
    pad.sample('level');
    const [p1, p2] = playerInputs([1, 4], [true, true], keys, {} as Mouse, pad);
    expect(p1).toMatchObject({ device: 1, left: true, down: true, fire: true, altitude: false });
    expect(p2).toMatchObject({ device: 4, fire: false, altitude: true });
  });

  it('modes: buttons as keys in the menus, only Menu (pause) in a level, B quits from the pause', () => {
    const pad = new Gamepad();
    connect(fakePad([0, 1, 9], [0, -0.8, 0, 0]));
    pad.sample('menu');
    expect(['Enter', 'Escape', 'ArrowUp'].every((c) => pad.held(c))).toBe(true);
    pad.sample('level');
    expect(pad.held('Enter') || pad.held('Escape') || pad.held('ArrowUp')).toBe(false);
    expect(pad.held('KeyP')).toBe(true);
    pad.sample('paused');
    expect(pad.held('Escape')).toBe(true);
    expect(pad.used).toBe(true);
    connect(fakePad());
    pad.sample('menu');
    expect(pad.anyKey() || pad.used).toBe(false);
  });

  it('pointer mode: the sticks move the pointer, A and B are the mouse buttons, not Enter and Esc', () => {
    const pad = new Gamepad();
    connect(fakePad([0, 1], [1, 0, 0, -1]));
    pad.sample('pointer');
    expect(pad.pointer.dx).toBeGreaterThan(0);
    expect(pad.pointer.dy).toBeLessThan(0);
    expect(pad.pointer.buttons).toBe(3);
    expect(pad.held('Enter') || pad.held('Escape')).toBe(false);
    connect(fakePad([], [0.2, -0.2, 0, 0])); // inside the dead zone
    pad.sample('pointer');
    expect([pad.pointer.dx, pad.pointer.dy, pad.pointer.buttons]).toEqual([0, 0, 0]);
  });

  it('legend: the pad lines once a pad is used, Steam Deck button names on a Deck', () => {
    const pads = { count: 1, names: XBOX_NAMES };
    expect(keyLegend('en', [1, 4], [true, false], '', pads)).toEqual([
      'Player1 — Gamepad: fly · A/RT: fire · B: high/low · X/LB: select bonus · Y/RB: use bonus',
      'A: OK · B: back',
    ]);
    expect(keyLegend('en', [1, 4], [true, false], 'level', pads)[1]).toBe('Menu: pause, then B: quit game');
    expect(keyLegend('en', [1, 4], [true, false], 'level')).toEqual(keyLegend('en', [1, 4], [true, false]));
    // one pad, two keyboard players: P2 keeps the keys
    expect(keyLegend('en', [1, 4], [true, true], '', pads)[1]).toMatch(/^Player2 — WASD/);
    expect(keyLegend('en', [1, 4], [true, false], 'hangar', pads)).toEqual([
      'Stick: pointer · A: click · B: right click · View: back', 'Y: cheat',
    ]);
    expect(keyLegend('en', [1, 4], [true, false], 'shop', pads)).toHaveLength(1);
    expect(keyLegend('en', [1, 4], [true, false], 'start', pads)).toEqual(['D-pad: choose version · A: start']);
    expect(keyLegend('de', [1, 4], [true, false], 'intro', pads)).toEqual(['A: Intro überspringen']);
    expect(keyLegend('en', [1, 4], [true, false], '', { count: 1, names: STEAM_DECK_NAMES })[0]).toContain('A/R2: fire');
    expect(keyLegend('en', [1, 4], [true, false], 'shop')).toEqual(keyLegend('en', [1, 4], [true, false])); // keyboard
  });
});
