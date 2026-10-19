// Game flow around the simulation: main menu -> level -> (fade out) -> hangar -> next level, as in the
// original's menu loop (main body @0x1D769, hangar @0x1D095, AfterLevel @0x1B6D1). The menus and the
// hangar are placeholders until they are ported; the level itself is the deterministic simulation.

import type { Sfx } from './audio/sfx';
import { FADE_STEPS, type PlayerInput, type World } from './sim/state';
import { levelOver, newGame, startLevel, step } from './sim/tick';

/** AfterLevel's fade-out: 20 palette steps at 70 Hz, about 11 ticks. */
const FADE_TICKS = 11;

export type Screen = 'menu' | 'level' | 'fadeout' | 'hangar';

export interface Keys {
  input: PlayerInput;
  enter: boolean; // pressed this tick
  escape: boolean;
}

export class Game {
  screen: Screen = 'menu';
  paused = false;
  message = '';
  private fade = 0;

  constructor(readonly world: World, private readonly sfx?: Sfx) {}

  private sounds(): void {
    this.sfx?.handle(this.world.sounds);
    this.world.sounds = [];
  }

  private play(level: number | null): void {
    if (level === null) newGame(this.world);
    else startLevel(this.world, level);
    this.screen = 'level';
    this.paused = false;
    this.sounds(); // the engine loop started by the level start
  }

  /** AfterLevel: every sound stops except 50 (the level 4 tank's death roar). */
  private afterLevel(): void {
    this.sfx?.stopAll(50);
  }

  /** One 40 Hz tick of whatever screen is shown. */
  tick(keys: Keys): void {
    const w = this.world;
    switch (this.screen) {
      case 'menu':
        if (keys.enter) this.play(null);
        break;
      case 'hangar':
        if (keys.enter) this.play(w.level + 1);
        else if (keys.escape) this.screen = 'menu';
        break;
      case 'fadeout':
        this.fade -= 1;
        w.fade = Math.round((FADE_STEPS * this.fade) / FADE_TICKS);
        if (this.fade > 0) break;
        if (w.gameCompleted) {
          this.message = 'Spiel geschafft!';
          this.screen = 'menu';
        } else this.screen = 'hangar';
        break;
      case 'level': {
        if (this.paused) break;
        step(w, [keys.input]);
        this.sounds();
        const over = levelOver(w);
        if (over === 'done') {
          this.afterLevel();
          this.fade = FADE_TICKS;
          this.screen = 'fadeout';
        } else if (over === 'gameover' || keys.escape) {
          // game over and Esc go straight back to the main menu (DS:0x3E05), without a fade
          this.afterLevel();
          this.message = over === 'gameover' ? 'Game over' : '';
          this.screen = 'menu';
        }
        break;
      }
    }
  }

  /** Lines for the placeholder screens. */
  screenText(): [string, number][] {
    if (this.screen === 'hangar') {
      return [
        [`Level ${this.world.level} geschafft`, 50],
        [`Enter: Shoot em all`, 100],
        [`(Level ${this.world.level + 1})`, 120],
        ['Esc: Hauptmenu', 160],
      ];
    }
    const lines: [string, number][] = [['DARK PLANET', 40], ['Enter: Neues Spiel', 100], ['F: Vollbild', 150]];
    if (this.message) lines.push([this.message, 70]);
    return lines;
  }
}
