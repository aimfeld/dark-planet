// The menus are blocking procedures in DP.EXE: loops with Crt.Delay, palette fades that wait for the
// vertical retrace, nested screens. The remake ports them as generator coroutines that yield the time
// each step takes in milliseconds; the 40 Hz driver (game.ts) runs steps until a tick's 25 ms are used.
// So a menu loop pass of Delay(15) + drawing runs at the original's rate, independent of the tick.

import type { Music } from '../audio/music';
import type { Sfx } from '../audio/sfx';
import type { VideoPlayer } from '../video';
import type { GameData } from '../data';
import { FADE_STEPS, type PlayerInput, type World } from '../sim/state';
import type { Screen } from './screen';

export type Proc<T = void> = Generator<number, T, void>;

/** One VGA retrace at 70 Hz: AniVGA's palette fades take one step per retrace. */
export const RETRACE_MS = 1000 / 70;
/** Animate's share of a menu loop pass (I: a few ms on the reference machine; not measured). */
export const DRAW_MS = 3;
/** One level tick (decision, user, session 3: fixed 40 Hz). */
export const TICK_MS = 25;

/** Held keys (the keyboard ISR's flag bytes) and the mouse (INT 33h), sampled once per 40 Hz tick. */
export interface MenuInput {
  /** KeyboardEvent.code held down. */
  held(code: string): boolean;
  /** AnyKey 1d9e:3605: some key is down. */
  anyKey(): boolean;
  /** Pointer in screen pixels (mouse x div 2, y) and the buttons held. */
  mouse: MouseInput;
  /** Per-tick player input for the level, by each player's control type (input/players.ts). */
  players: PlayerInput[];
}

export interface MouseInput {
  x: number;
  y: number;
  down: boolean; // any button (MouseDown 272c:011B)
  left: boolean; // single buttons (272c:00DC: INT 33h fn 3, BX and mask)
  right: boolean;
}

/** SAVE.DAT (one slot), kept in browser storage by main.ts. */
export interface SaveSlot {
  read(): Uint8Array | null;
  write(bytes: Uint8Array): void;
}

export interface Settings {
  control: [number, number]; // 1 keyboard, 2 mouse, 3 joystick (gamepad), 4 keyboard WASD (remake); never equal
  cdSound: boolean;
  soundEffects: boolean;
}

export interface Ctx {
  readonly data: GameData;
  readonly screen: Screen;
  readonly world: World;
  readonly input: MenuInput;
  readonly sfx?: Sfx;
  readonly music?: Music;
  readonly video?: VideoPlayer;
  readonly settings: Settings;
  saveSettings(): void;
  readonly saves: SaveSlot;
  /** What the renderer shows: the menu screen, the level or a video. */
  view: 'screen' | 'world' | 'video';
  /** The browser can't quit: set by the main menu's Exit instead. */
  quit: boolean;
}

/** Crt.Delay(ms). */
export function* delay(ms: number): Proc {
  yield ms;
}

/** One menu loop pass: Frame(0) (sprite cycles + Animate) and Delay(ms). */
export function* frame(ctx: Ctx, ms: number): Proc {
  ctx.screen.cycles();
  yield ms + DRAW_MS;
}

/** FadeIn(0, steps) 1d9e:098A: black, one draw, then up to the palette, one step per retrace. */
export function* fadeIn(ctx: Ctx, steps = 20): Proc {
  ctx.screen.fade = 0;
  yield DRAW_MS;
  for (let i = 1; i <= steps; i++) {
    ctx.screen.fade = Math.round((FADE_STEPS * i) / steps);
    yield RETRACE_MS;
  }
}

/** FadeOut(waitMouse, steps, 0) 1d9e:0907: optionally wait for the mouse buttons, then down to black. */
export function* fadeOut(ctx: Ctx, waitMouse = true, steps = 20): Proc {
  if (waitMouse) yield* waitMouseUp(ctx);
  const from = ctx.screen.fade;
  for (let i = steps - 1; i >= 0; i--) {
    ctx.screen.fade = Math.round((from * i) / steps);
    yield RETRACE_MS;
  }
}

export function* waitMouseUp(ctx: Ctx): Proc {
  while (ctx.input.mouse.down) yield TICK_MS;
}

export function* waitNoKey(ctx: Ctx): Proc {
  while (ctx.input.anyKey()) yield 10; // Delay(10) polls
}

export function playSound(ctx: Ctx, n: number): void {
  if (ctx.settings.soundEffects) ctx.sfx?.handle([{ n }]);
}

export function stopSound(ctx: Ctx, n: number): void {
  ctx.sfx?.stop(n);
}

/** CDPlay(track) @0x1DC48: remembered even with CD sound off. */
export function cdPlay(ctx: Ctx, track: number): void {
  ctx.music?.play(track);
}
