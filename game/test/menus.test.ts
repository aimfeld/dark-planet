// The menu coroutines driven headless with scripted input: main menu -> hangar -> briefing -> level,
// options, the text viewer. Each screen is also written to test-output/ as a BMP to look at.

import { describe, expect, it } from 'vitest';
import { hasData } from './helpers';
import { setup } from './menuHarness';

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

  it('main menu: the pointer selects the item it moves onto, a resting one leaves the keys alone', async () => {
    const { game, input, run, press } = await setup();
    run(40);
    const s = game.screen;
    input.mouse.x = 160;
    input.mouse.y = 105; // item 4: Spielanleitung
    run(10);
    expect(s.n[17]).toBeGreaterThanOrEqual(647);
    expect(s.n[14]).toBe(613);
    expect(s.picture).toBe('HMBILD'); // selected, not opened
    press('ArrowDown', 1);
    run(10);
    expect(s.n[17]).toBe(646);
    expect(s.n[18]).toBeGreaterThanOrEqual(658);
    input.mouse.y = 30; // item 1
    run(10);
    expect(s.n[14]).toBeGreaterThanOrEqual(614);
    expect(s.n[18]).toBe(657);
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

  it('main menu Exit (and Esc) -> the start screen -> the intro -> the main menu', async () => {
    const { game, run, press } = await setup(true);
    run(40);
    expect(game.atStart).toBe(true);
    press('Enter', 2, 80);
    expect(game.atStart).toBe(false);
    run(40);
    const s = game.screen;
    expect(s.picture).toBe('HMBILD');
    for (let i = 0; i < 5; i++) press('ArrowDown', 1, 10); // item 6: Exit
    press('Enter', 2, 60);
    expect(game.atStart).toBe(true);
    expect(game.quit).toBe(true);
    expect(s.picture).toBe('RASTER');
    press('Enter', 2, 80);
    expect(game.quit).toBe(false);
    run(40);
    expect(s.picture).toBe('HMBILD');
    press('Escape', 2, 60);
    expect(game.atStart).toBe(true);
  });

  it('dev keys in the hangar: 3 starts level 3, Shift+5 starts level 5 at its boss', async () => {
    const { game, input, run, press } = await setup();
    run(40);
    press('Enter');
    run(40);
    const w = game.world;
    press('Digit3', 2, 5);
    expect(game.view).toBe('world'); // no briefing
    expect(w.level).toBe(3);
    expect(w.scrolling).toBe(true);
    expect(w.scrollY).toBeGreaterThan(-10);
    press('Escape');
    run(80);
    press('Enter'); // main menu: new game
    run(40);
    expect(game.screen.picture).toBe('UMBILD');
    input.keys.add('ShiftLeft');
    run(5); // Shift goes down first; the hangar waits for it to be released (the cheat input)
    press('Digit5', 2, 0);
    input.keys.delete('ShiftLeft');
    run(5);
    expect(game.view).toBe('world');
    expect(w.level).toBe(5);
    expect(w.scrolling).toBe(false); // StartBossFight ran
    expect(w.track).toBe(8);
    expect(w.enemies.some((e) => e.active)).toBe(true);
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
    expect(s.texts.get(818)?.text).toBe('Steuerung Player1:Maus');
    press('Enter');
    expect(s.texts.get(818)?.text).toBe('Steuerung Player1:Joystick');
    press('Enter');
    expect(game.settings.control[0]).toBe(5); // 4 (WASD, the remake's default for P2) belongs to P2
    expect(s.texts.get(818)?.text).toBe('Steuerung Player1:Touch'); // the remake's touch controls
    press('Enter');
    press('Enter');
    expect(game.settings.control[0]).toBe(2);
    press('ArrowDown', 1);
    press('ArrowDown', 1);
    press('Enter');
    expect(game.settings.cdSound).toBe(false);
    press('Escape');
    run(40);
    expect(s.picture).toBe('UMBILD');
  });

  it('options: the language line switches every line at once', async () => {
    const { game, run, press, click } = await setup();
    run(40);
    press('Enter');
    run(40);
    click(270, 40, 60);
    const s = game.screen;
    for (let i = 0; i < 5; i++) press('ArrowDown', 1);
    expect(s.texts.get(823)?.text).toBe('Sprache: Deutsch');
    press('Enter');
    expect(game.settings.language).toBe('en');
    expect(s.texts.get(823)?.text).toBe('Language: English');
    expect(s.texts.get(818)?.text).toBe('Controls Player1:Keyboard');
    expect(s.texts.get(824)?.text).toBe('Leave Menu');
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
