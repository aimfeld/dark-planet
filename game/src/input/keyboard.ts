// Keyboard -> per-tick player input. The original keys (spec §2) plus X/C/V, which the legend lists instead of
// Ctrl/Alt/Space: in a window the desktop takes Alt+Space (window menu), Ctrl+Space (input method) and Ctrl+Alt+arrows
// (workspaces), and macOS Ctrl+arrows. The original keys still work, best in fullscreen with Keyboard Lock.
// The keyboard player is whichever player chose control type 1; the remake adds type 4, a second key set around WASD, so two players can share one keyboard.

import { NO_INPUT, type PlayerInput } from '../sim/state';

interface KeySet {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  fire: string[];
  altitude: string[];
  bonus: string[]; // select; with fire held: use
}

const ARROWS: KeySet = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  fire: ['KeyX', 'ControlLeft', 'ControlRight'],
  altitude: ['KeyC', 'AltLeft', 'AltRight'],
  bonus: ['KeyV', 'Space', 'ShiftRight'],
};
/**
 * The arrow player while another player uses WASD (user, session 13): the three keys left of right Shift, no
 * modifiers (a Mac has no right Ctrl, right Alt is AltGr on German keyboards). Codes are key positions:
 * , . - on German and Swiss keyboards, , . / on US ones.
 */
const ARROWS_RIGHT: KeySet = { ...ARROWS, fire: ['Comma'], altitude: ['Period'], bonus: ['Slash'] };
/**
 * Type 4 (remake): X/C/V as for the arrow player alone (user, session 13). No Ctrl: the browser keeps Ctrl+W (close
 * tab) even when the page handles the key. No Shift: Windows offers Sticky Keys after five presses.
 */
const WASD: KeySet = {
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['KeyW'],
  down: ['KeyS'],
  fire: ['KeyX'],
  altitude: ['KeyC'],
  bonus: ['KeyV'],
};
// keypad - / + select and use the joystick player's bonus (DS:0x6C31 / 0x6C32)
const OTHER = ['KeyP', 'Escape', 'Enter', 'KeyF', 'PageUp', 'PageDown', 'NumpadSubtract', 'NumpadAdd'];
const CAPTURED = new Set([ARROWS, ARROWS_RIGHT, WASD, { OTHER }].flatMap((set) => Object.values(set).flat()));
/**
 * Modifier keys and the modifier states that mean they may still be down. The desktop can take a modifier's keyup
 * (Ctrl+Alt+arrows switching workspaces on Linux) without the window losing focus; the key then stayed held, which
 * can freeze the hangar: it waits for all keys to be released. Every later key or pointer event tells which
 * modifiers are really down. AltGr is AltRight on German layouts, and Windows adds a left Ctrl to it.
 */
const MODIFIERS: [string, string[]][] = [
  ['ControlLeft', ['Control', 'AltGraph']],
  ['ControlRight', ['Control']],
  ['AltLeft', ['Alt']],
  ['AltRight', ['Alt', 'AltGraph']],
  ['ShiftLeft', ['Shift']],
  ['ShiftRight', ['Shift']],
  ['MetaLeft', ['Meta', 'OS']],
  ['MetaRight', ['Meta', 'OS']],
];

export class Keyboard {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>(); // pressed since the last read (for toggles)
  private readonly tapped = new Set<string>(); // pressed since the last sample
  private sampled = new Set<string>(); // what the current tick sees

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      this.dropReleasedModifiers(e);
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      this.tapped.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      this.dropReleasedModifiers(e);
      this.down.delete(e.code);
      // macOS sends no keyup for keys released while Cmd is held; keys still held come back with their repeats.
      if (e.code === 'MetaLeft' || e.code === 'MetaRight') this.down.clear();
    });
    for (const type of ['pointerdown', 'pointermove'] as const) target.addEventListener(type, (e) => this.dropReleasedModifiers(e));
    target.addEventListener('blur', () => this.down.clear());
    target.document?.addEventListener('visibilitychange', () => this.down.clear());
  }

  /** Forget modifiers the event says are up (except the event's own key, which keydown/keyup handle). */
  private dropReleasedModifiers(e: KeyboardEvent | PointerEvent): void {
    if (typeof e.getModifierState !== 'function') return;
    const own = 'code' in e ? e.code : '';
    for (const [code, states] of MODIFIERS) {
      if (code !== own && this.down.has(code) && !states.some((m) => e.getModifierState(m))) this.down.delete(code);
    }
  }

  /** Take the keys for the next tick: held now, or pressed since the last sample (a tap between ticks counts). */
  sample(): void {
    this.sampled = new Set([...this.down, ...this.tapped]);
    this.tapped.clear();
  }

  /**
   * A keyboard player's flags (@0x1A1DD): Space (V) selects a bonus, Ctrl + Space (X + V) uses it. `wasd` is the remake's
   * second set; `shared` limits the arrow player to the right-hand keys while the WASD player is in the game.
   */
  player(wasd = false, shared = false): PlayerInput {
    const set = wasd ? WASD : shared ? ARROWS_RIGHT : ARROWS;
    const held = (codes: string[]) => codes.some((c) => this.sampled.has(c));
    const fire = held(set.fire), bonus = held(set.bonus);
    return {
      ...NO_INPUT,
      device: wasd ? 4 : 1,
      left: held(set.left), right: held(set.right), up: held(set.up), down: held(set.down),
      fire, altitude: held(set.altitude), select: bonus, use: bonus && fire,
    };
  }

  /** A key (KeyboardEvent.code) is held, like the keyboard ISR's flag bytes. */
  held(code: string): boolean {
    return this.sampled.has(code);
  }

  /** AnyKey 1d9e:3605. */
  anyKey(): boolean {
    return this.sampled.size > 0;
  }

  /** True once per key press. */
  takePress(code: string): boolean {
    return this.pressed.delete(code);
  }
}
