// Keyboard -> per-tick player input. The original keys (spec §2) plus alternates, because browsers and
// desktops grab some Ctrl/Alt combinations. The keyboard player is whichever player chose control type 1;
// the remake adds type 4, a second key set around WASD, so two players can share one keyboard.

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
  fire: ['ControlLeft', 'ControlRight', 'KeyX'],
  altitude: ['AltLeft', 'AltRight', 'KeyC'],
  bonus: ['Space', 'ShiftRight'],
};
/** The arrow player while another player uses WASD: only the keys right of the space bar. */
const ARROWS_RIGHT: KeySet = { ...ARROWS, fire: ['ControlRight'], altitude: ['AltRight'], bonus: ['ShiftRight'] };
/** Type 4 (remake). No Ctrl: the browser keeps Ctrl+W (close tab) even when the page handles the key. */
const WASD: KeySet = {
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['KeyW'],
  down: ['KeyS'],
  fire: ['ShiftLeft'],
  altitude: ['KeyQ'],
  bonus: ['KeyE'],
};
// keypad - / + select and use the joystick player's bonus (DS:0x6C31 / 0x6C32)
const OTHER = ['KeyP', 'Escape', 'Enter', 'KeyF', 'PageUp', 'PageDown', 'NumpadSubtract', 'NumpadAdd'];
const CAPTURED = new Set([...Object.values(ARROWS).flat(), ...Object.values(WASD).flat(), ...OTHER]);

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
   * A keyboard player's flags (@0x1A1DD): Space selects a bonus, Ctrl + Space uses it. `wasd` is the remake's
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
