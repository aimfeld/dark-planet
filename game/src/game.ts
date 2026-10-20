// Runs the game's coroutines (screens/proc.ts) on the fixed 40 Hz tick: main menu, text viewer, hangar,
// options and the levels, as in the original's menu loop (main body @0x1D769, hangar @0x1D095).

import type { Music } from './audio/music';
import type { Sfx } from './audio/sfx';
import type { GameData } from './data';
import { mainMenu } from './screens/mainMenu';
import { TICK_MS, type Ctx, type MenuInput, type Proc, type Settings } from './screens/proc';
import { Screen } from './screens/screen';
import type { World } from './sim/state';

/** SETTINGS.DAT defaults without a file: P1 keyboard, P2 mouse, CD sound and sound effects on. */
export const DEFAULT_SETTINGS: Settings = { control: [1, 2], cdSound: true, soundEffects: true };

export class Game implements Ctx {
  readonly data: GameData;
  readonly screen: Screen;
  view: 'screen' | 'world' = 'screen';
  quit = false;
  input: MenuInput;
  private readonly proc: Proc;
  private debt = 0; // ms the last step overran the tick

  constructor(
    readonly world: World,
    input: MenuInput,
    readonly settings: Settings = structuredClone(DEFAULT_SETTINGS),
    readonly sfx?: Sfx,
    readonly music?: Music,
    private readonly persist: (s: Settings) => void = () => undefined,
  ) {
    this.data = world.data;
    this.screen = new Screen(world.data);
    this.input = input;
    music?.setEnabled(settings.cdSound);
    this.proc = mainMenu(this);
  }

  saveSettings(): void {
    this.persist(this.settings);
  }

  /** One 40 Hz tick: run coroutine steps until their time adds up to 25 ms. */
  tick(input: MenuInput): void {
    this.input = input;
    let budget = TICK_MS - this.debt;
    while (budget > 0) budget -= this.proc.next().value ?? TICK_MS;
    this.debt = -budget;
  }
}
