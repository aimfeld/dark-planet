// Gamepad -> the joystick player's input (handler @0x1A58F, spec §2). The original reads stick A with a
// ±15-unit dead zone around the centre sampled at startup; the remake uses an analog dead zone instead.
// Buttons use the standard mapping: A fires (button 1), B toggles the altitude (button 2), and since a pad
// has no keypad, X / LB select a bonus and Y / RB use it (the original's keypad - and +, which still work).

import { NO_INPUT, type PlayerInput } from '../sim/state';

const DEAD_ZONE = 0.3;
const BUTTON = { fire: [0, 7], altitude: [1], select: [2, 4], use: [3, 5], up: [12], down: [13], left: [14], right: [15] };

export class Gamepad {
  private pad: globalThis.Gamepad | null = null;

  /** Read the first connected gamepad for the next tick. */
  sample(): void {
    this.pad = null;
    if (typeof navigator.getGamepads !== 'function') return;
    for (const p of navigator.getGamepads()) {
      if (p?.connected) {
        this.pad = p;
        return;
      }
    }
  }

  get connected(): boolean {
    return this.pad !== null;
  }

  /** The joystick player's flags; `keypad` is the keyboard's keypad - / + (select / use). */
  player(keypad: { select: boolean; use: boolean }): PlayerInput {
    const p = this.pad;
    if (p === null) return { ...NO_INPUT, device: 3, ...keypad };
    const pressed = (ids: number[]) => ids.some((i) => p.buttons[i]?.pressed);
    const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    return {
      ...NO_INPUT,
      device: 3,
      left: ax < -DEAD_ZONE || pressed(BUTTON.left),
      right: ax > DEAD_ZONE || pressed(BUTTON.right),
      up: ay < -DEAD_ZONE || pressed(BUTTON.up),
      down: ay > DEAD_ZONE || pressed(BUTTON.down),
      fire: pressed(BUTTON.fire),
      altitude: pressed(BUTTON.altitude),
      select: keypad.select || pressed(BUTTON.select),
      use: keypad.use || pressed(BUTTON.use),
    };
  }
}
