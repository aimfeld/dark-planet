// Keyboard -> per-tick player input. The original keys (spec §2) plus alternates, because browsers and
// desktops grab some Ctrl/Alt combinations. Only player 1 uses the keyboard (mouse/gamepad come later).

import type { PlayerInput } from '../sim/state';

const BINDINGS: Record<keyof PlayerInput, string[]> = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  fire: ['ControlLeft', 'ControlRight', 'KeyX'],
  altitude: ['AltLeft', 'AltRight', 'KeyC'],
  bonus: ['Space'],
};
const OTHER = ['KeyP', 'Escape'];
const CAPTURED = new Set([...Object.values(BINDINGS).flat(), ...OTHER]);

export class Keyboard {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>(); // pressed since the last read (for toggles)

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      this.down.delete(e.code);
    });
    target.addEventListener('blur', () => this.down.clear());
  }

  player(): PlayerInput {
    const held = (codes: string[]) => codes.some((c) => this.down.has(c));
    return {
      left: held(BINDINGS.left), right: held(BINDINGS.right), up: held(BINDINGS.up), down: held(BINDINGS.down),
      fire: held(BINDINGS.fire), altitude: held(BINDINGS.altitude), bonus: held(BINDINGS.bonus),
    };
  }

  /** True once per key press. */
  takePress(code: string): boolean {
    return this.pressed.delete(code);
  }
}
