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

export class Keyboard {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>(); // pressed since the last read (for toggles)
  private readonly tapped = new Set<string>(); // pressed since the last sample
  private sampled = new Set<string>(); // what the current tick sees

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      this.tapped.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      this.down.delete(e.code);
    });
    target.addEventListener('blur', () => this.down.clear());
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
