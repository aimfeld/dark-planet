// The menu coroutines driven headless with scripted input: main menu -> hangar -> briefing -> level,
// options, the text viewer. Each screen is also written to test-output/ as a BMP to look at.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import { Framebuffer, H, W } from '../src/render/framebuffer';
import type { MenuInput } from '../src/screens/proc';
import { createWorld, NO_INPUT } from '../src/sim/state';
import { bmp, gameData, hasData } from './helpers';

const OUT = join(__dirname, '..', 'test-output');

class Script implements MenuInput {
  keys = new Set<string>();
  mouse = { x: 160, y: 100, down: false };
  players = [NO_INPUT, NO_INPUT];
  held(code: string): boolean {
    return this.keys.has(code);
  }
  anyKey(): boolean {
    return this.keys.size > 0;
  }
}

async function setup() {
  const data = await gameData();
  const input = new Script();
  const game = new Game(createWorld(data, 1), input);
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) game.tick(input);
  };
  /** Hold a key for `ticks`, then release it and let the screen react. */
  const press = (code: string, ticks = 2, after = 20) => {
    input.keys.add(code);
    run(ticks);
    input.keys.delete(code);
    run(after);
  };
  const click = (x: number, y: number, after = 40) => {
    input.mouse.x = x;
    input.mouse.y = y;
    run(10);
    input.mouse.down = true;
    run(2);
    input.mouse.down = false;
    run(after);
  };
  const fb = new Framebuffer(data);
  const dump = (name: string) => {
    mkdirSync(OUT, { recursive: true });
    const sc = game.screen;
    fb.renderScreen(sc);
    const rgb = sc.palette === 'EPIS1' ? data.palette.rgb : data.palette.menus[sc.palette];
    writeFileSync(join(OUT, `menu-${name}.bmp`), bmp(fb.px, W, H, rgb));
  };
  return { data, game, input, run, press, click, dump };
}

describe.skipIf(!hasData)('menus', () => {
  it('main menu: items, glow cycle, selection', async () => {
    const { game, run, press, dump } = await setup();
    run(40);
    const s = game.screen;
    expect(s.picture).toBe('HMBILD');
    expect(s.fade).toBe(19);
    expect([s.x[14], s.y[14]]).toEqual([92, 23]);
    expect([s.x[19], s.y[19]]).toEqual([140, 151]);
    expect(s.n[14]).toBeGreaterThanOrEqual(614); // selected: cycling through 614..623
    expect(s.n[15]).toBe(624);
    dump('main');
    press('ArrowDown', 1);
    expect(s.n[14]).toBe(613);
    expect(s.n[15]).toBeGreaterThanOrEqual(625);
  });

  it('new game -> hangar -> briefing -> level 1 -> Esc -> main menu', async () => {
    const { game, input, run, press, click, dump } = await setup();
    run(40);
    press('Enter');
    run(40);
    const s = game.screen;
    expect(s.picture).toBe('UMBILD');
    expect(s.n[1]).toBe(612);
    input.mouse.x = 130;
    input.mouse.y = 130;
    run(60);
    expect(s.texts.get(817)?.text).toBe('Shoot em all');
    expect(s.n[20]).toBe(588); // door fully open
    dump('hangar');
    click(130, 130, 120);
    expect(s.picture).toBe('RASTER');
    expect(s.x[25]).toBe(10); // the briefing lines have slid in
    expect(s.texts.get(792)?.text).toBe('MISSION 1:');
    dump('briefing');
    press('Space');
    expect(game.view).toBe('world');
    expect(game.world.level).toBe(1);
    run(40);
    press('Escape');
    run(40);
    expect(game.view).toBe('screen');
    expect(s.picture).toBe('HMBILD');
  });

  it('options: control type skips the other player, CD sound toggles', async () => {
    const { game, run, press, click, dump } = await setup();
    run(40);
    press('Enter');
    run(40);
    click(270, 40, 60);
    const s = game.screen;
    expect(s.picture).toBe('OMBILD');
    expect(s.palette).toBe('EPIS1');
    expect(s.texts.get(818)?.text).toBe('Steuerung Player1:Tastatur');
    dump('options');
    press('Enter');
    expect(game.settings.control[0]).toBe(3); // 2 (Maus) belongs to P2
    expect(s.texts.get(818)?.text).toBe('Steuerung Player1:Joystick');
    press('ArrowDown', 1);
    press('ArrowDown', 1);
    press('Enter');
    expect(game.settings.cdSound).toBe(false);
    press('Escape');
    run(40);
    expect(s.picture).toBe('UMBILD');
  });

  it('story scrolls one pixel per frame, a line every 11 frames', async () => {
    const { game, run, press, dump } = await setup();
    run(40);
    press('ArrowDown', 1);
    press('ArrowDown', 1);
    press('Enter', 2, 0);
    run(60); // fade-out and fade-in
    const s = game.screen;
    expect(s.picture).toBe('RASTER');
    run(40 * 30); // 30 s: about 196 frames of 153 ms
    const ys = [...Array(20).keys()].map((i) => s.y[24 + i]).filter((_, i) => s.n[24 + i] !== 0);
    expect(Math.min(...ys)).toBeLessThan(10);
    dump('story');
  });

  it('manual pages', async () => {
    const { game, run, press, dump } = await setup();
    run(40);
    for (let i = 0; i < 3; i++) press('ArrowDown', 1);
    press('Enter', 2, 60);
    const s = game.screen;
    expect(s.texts.get(791)?.text).toBe('SPIELANLEITUNG');
    dump('manual');
    press('PageDown', 1);
    expect(s.texts.get(791)?.text).toBe(game.data.texts['ANLEIT.UNG'][18] || ' ');
  });
});
