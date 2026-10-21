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
import { startScreen } from './screens/start';
import { playVideo } from './screens/video';

/**
 * SETTINGS.DAT defaults without a file: P1 keyboard, CD sound and sound effects on. P2 is WASD (the original:
 * mouse), so two players can share one keyboard right away (user, session 12). The remake starts with the
 * remastered graphics (user, session 18).
 */
export const DEFAULT_SETTINGS: Settings = { control: [1, 4], cdSound: true, soundEffects: true, remastered: true };

/** A save slot in memory (tests, or no browser storage). */
export function memorySlot(): SaveSlot {
  let saved: Uint8Array | null = null;
  return { read: () => saved, write: (b) => (saved = b.slice()) };
}

/** DPMAX.BAT's CD track (STARTAUD with 4 arguments). */
export const INTRO_TRACK = 4;

/** The remake's start screen (without `start`: tests), then DPMAX.BAT: the intro video with CD track 4, then DP.EXE's main menu. */
function* boot(ctx: Ctx, start: boolean): Proc {
  if (start) yield* startScreen(ctx);
  yield* playVideo(ctx, 'intro', INTRO_TRACK);
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
  atStart = false;
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
    start = true,
  ) {
    this.data = world.data;
    this.screen = new Screen(world.data);
    this.input = input;
    music?.setEnabled(settings.cdSound);
    this.proc = boot(this, start);
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
