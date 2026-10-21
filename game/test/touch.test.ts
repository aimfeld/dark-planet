import { describe, expect, it } from 'vitest';
import { stickDirections, touchLayout, type Rect } from '../src/input/touch';
import { hasData } from './helpers';
import { setup } from './menuHarness';

const NONE = { l: 0, r: 0, t: 0, b: 0 };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('touch layout', () => {
  it('phone in landscape: the controls beside the picture, clear of the notch', () => {
    const l = touchLayout(852, 393, { l: 47, r: 47, t: 0, b: 21 });
    expect(l.game.w / l.game.h).toBeCloseTo(1.6);
    expect(l.game.h).toBeGreaterThan(300);
    expect(overlaps(l.game, l.left) || overlaps(l.game, l.right)).toBe(false);
    expect(l.left.x).toBeGreaterThanOrEqual(47);
    expect(l.right.x + l.right.w).toBeLessThanOrEqual(852 - 47);
    expect(l.right.y + l.right.h).toBeLessThanOrEqual(393 - 21);
    expect(l.keys.dy).toBeGreaterThan(0); // down the left column
  });

  it('portrait: the picture over the full width, the controls below it', () => {
    const l = touchLayout(393, 852, NONE);
    expect(l.game.w).toBe(393);
    expect(l.game.y + l.game.h).toBeLessThanOrEqual(l.keys.y);
    expect(l.keys.y + l.unit).toBeLessThanOrEqual(l.right.y);
    expect(l.keys.dx).toBeGreaterThan(0);
  });

  it('tablet in landscape: beside, with the larger buttons', () => {
    const l = touchLayout(1180, 820, NONE);
    expect(l.unit).toBe(60);
    expect(l.game.w).toBeGreaterThan(900);
    expect(overlaps(l.game, l.right)).toBe(false);
  });

  it('top right: fullscreen and the remaster switch clear of the picture and the buttons', () => {
    for (const [vw, vh, inset] of [[852, 393, { l: 47, r: 47, t: 0, b: 21 }], [393, 852, NONE], [1180, 820, NONE]] as const) {
      const l = touchLayout(vw, vh, inset);
      for (const i of [0, 1]) {
        const b = { x: l.corner.x + i * l.corner.dx, y: l.corner.y, w: l.corner.size, h: l.corner.size };
        expect(overlaps(b, l.game) || overlaps(b, l.right)).toBe(false);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(vw - inset.r);
        expect(b.y + b.h).toBeLessThanOrEqual(vh);
        expect(b.w).toBeGreaterThanOrEqual(36);
      }
    }
  });

  it('top right: a single button (no fullscreen) centred over the button column', () => {
    for (const [vw, vh, inset] of [[852, 393, { l: 47, r: 47, t: 0, b: 21 }], [393, 852, NONE], [1180, 820, NONE]] as const) {
      const l = touchLayout(vw, vh, inset, 1);
      expect(l.corner.x + l.corner.size / 2).toBeCloseTo(l.right.x + l.right.w / 2, 0);
      expect(l.corner.size).toBe(l.unit);
      const b = { x: l.corner.x, y: l.corner.y, w: l.corner.size, h: l.corner.size };
      expect(overlaps(b, l.game) || overlaps(b, l.right)).toBe(false);
    }
  });

  it('stick: 8 directions past 35 % of the radius', () => {
    expect(stickDirections(10, -10, 50)).toEqual({ left: false, right: false, up: false, down: false });
    expect(stickDirections(40, -5, 50)).toEqual({ left: false, right: true, up: false, down: false });
    expect(stickDirections(-30, 30, 50)).toEqual({ left: true, right: false, up: false, down: true });
  });
});

describe.skipIf(!hasData)('touch in the menus', () => {
  it('main menu: a tap opens an item; the manual offers its keys as touch buttons', async () => {
    const { game, run, press, click } = await setup();
    run(40);
    click(160, 105, 60); // item 4: Spielanleitung
    const s = game.screen;
    expect(s.texts.get(791)?.text).toBe('SPIELANLEITUNG');
    expect(game.touchKeys.map((k) => k.code)).toEqual(['PageUp', 'PageDown', 'Escape']);
    press('Escape', 2, 60);
    expect(game.touchKeys).toEqual([]);
    expect(s.picture).toBe('HMBILD');
  });

  it('a tap ends the story', async () => {
    const { game, run, click } = await setup();
    run(40);
    click(160, 80, 60); // item 3: Die Geschichte
    expect(game.screen.picture).toBe('RASTER');
    run(200);
    click(160, 100, 60);
    expect(game.screen.picture).toBe('HMBILD');
  });

  it('options: a tap on a line selects and switches it', async () => {
    const { game, run, press, click } = await setup();
    run(40);
    press('Enter');
    run(40);
    click(270, 40, 60);
    expect(game.screen.picture).toBe('OMBILD');
    click(120, 88); // line 3: CDSound
    expect(game.settings.cdSound).toBe(false);
    click(120, 128); // line 5: Grafik (the remake's remastered graphics, on by default)
    expect(game.settings.remastered).toBe(false);
    expect(game.screen.texts.get(822)?.text).toBe('Grafik: Classic');
    click(120, 148); // line 6: Menu verlassen
    run(40);
    expect(game.screen.picture).toBe('UMBILD');
  });

  it('level: pause offers ✕, which aborts to the main menu', async () => {
    const { game, input, run, press, click } = await setup();
    run(40);
    press('Enter');
    run(40);
    input.mouse.x = 130;
    input.mouse.y = 130;
    run(20);
    click(130, 130, 120); // Shoot em all -> briefing
    click(160, 100, 20); // a tap ends the briefing
    expect(game.view).toBe('world');
    expect(game.touchKeys.map((k) => k.code)).toEqual(['KeyP']);
    press('KeyP', 2, 40);
    expect(game.paused).toBe(true);
    expect(game.touchKeys.map((k) => k.code)).toEqual(['KeyP', 'Escape']);
    press('Escape', 2, 60);
    expect(game.paused).toBe(false);
    expect(game.view).toBe('screen');
    expect(game.screen.picture).toBe('HMBILD');
  });
});
