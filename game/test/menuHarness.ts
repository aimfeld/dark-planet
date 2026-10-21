// Drives the menu coroutines headless with scripted keys and mouse; dumps screens to test-output/ as BMPs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../src/game';
import { Framebuffer, H, W } from '../src/render/framebuffer';
import type { MenuInput } from '../src/screens/proc';
import { createWorld, NO_INPUT } from '../src/sim/state';
import { bmp, gameData } from './helpers';

const OUT = join(__dirname, '..', 'test-output');

export class Script implements MenuInput {
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

export async function setup() {
  const data = await gameData();
  const input = new Script();
  const game = new Game(createWorld(data, 1), input, undefined, undefined, undefined, undefined, undefined, undefined, false);
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
    input.mouse.left = true;
    run(2);
    input.mouse.left = false;
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
