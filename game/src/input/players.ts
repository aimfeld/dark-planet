// Per-tick player input by control type (Options, DS:0x259E/0x259F): 1 keyboard, 2 mouse, 3 joystick.
// P1 and P2 never share a type, so each device drives at most one player.

import { NO_INPUT, type PlayerInput } from '../sim/state';
import type { Gamepad } from './gamepad';
import type { Keyboard } from './keyboard';
import type { Mouse } from './mouse';

/** Mouse handler's buttons (@0x1A34B): left fires, right toggles the altitude, middle selects, left + middle uses. */
export function mousePlayer(m: Mouse): PlayerInput {
  return {
    ...NO_INPUT, device: 2, fire: m.left, altitude: m.right, select: m.middle, use: m.middle && m.left,
    mouseX: m.x, mouseY: m.y,
  };
}

export function playerInputs(control: readonly number[], keys: Keyboard, mouse: Mouse, pad: Gamepad): PlayerInput[] {
  return control.map((c) => {
    if (c === 2) return mousePlayer(mouse);
    if (c === 3) return pad.player({ select: keys.held('NumpadSubtract'), use: keys.held('NumpadAdd') });
    return keys.player();
  });
}
