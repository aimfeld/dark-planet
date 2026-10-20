// Runs the game's coroutines (screens/proc.ts) on the fixed 40 Hz tick: main menu, text viewer, hangar,
// options, the shop and the levels, as in the original's menu loop (main body @0x1D769, hangar @0x1D095).

import type { Music } from './audio/music';
import type { Sfx } from './audio/sfx';
import type { GameData } from './data';
import type { TouchKey } from './input/touch';
import { mainMenu } from './screens/mainMenu';
import { TICK_MS, type Ctx, type MenuInput, type Proc, type SaveSlot, type Settings } from './screens/proc';
import { Screen } from './screens/screen';
import type { World } from './sim/state';
import type { VideoPlayer } from './video';
import { playVideo } from './screens/video';

/**
 * SETTINGS.DAT defaults without a file: P1 keyboard, CD sound and sound effects on. P2 is WASD (the original:
 * mouse), so two players can share one keyboard right away (user, session 12).
 */
export const DEFAULT_SETTINGS: Settings = { control: [1, 4], cdSound: true, soundEffects: true };

/** A save slot in memory (tests, or no browser storage). */
export function memorySlot(): SaveSlot {
  let saved: Uint8Array | null = null;
  return { read: () => saved, write: (b) => (saved = b.slice()) };
}

/** DPMAX.BAT: the intro video with CD track 4, then DP.EXE's main menu. */
function* boot(ctx: Ctx): Proc {
  yield* playVideo(ctx, 'intro', 4);
  yield* mainMenu(ctx);
}

export class Game implements Ctx {
  readonly data: GameData;
  readonly screen: Screen;
  view: 'screen' | 'world' | 'video' = 'screen';
  quit = false;
  touchKeys: readonly TouchKey[] = [];
  paused = false;
  atMainMenu = false;
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
    readonly saves: SaveSlot = memorySlot(),
    readonly video?: VideoPlayer,
  ) {
    this.data = world.data;
    this.screen = new Screen(world.data);
    this.input = input;
    music?.setEnabled(settings.cdSound);
    this.proc = boot(this);
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
