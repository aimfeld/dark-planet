// Per-tick player input by control type (Options, DS:0x259E/0x259F): 1 keyboard, 2 mouse, 3 joystick, and
// the remake's 4 = keyboard WASD and 5 = touch. P1 and P2 never share a type, so each device drives at most
// one player. Remake: the keyboard players also take a gamepad each (padAssignment), so a pad plays without
// choosing Joystick in the options first.

import { NO_INPUT, type PlayerInput } from '../sim/state';
import type { Gamepad } from './gamepad';
import type { Keyboard } from './keyboard';
import type { Mouse } from './mouse';
import type { TouchControls } from './touch';

/** Mouse handler's buttons (@0x1A34B): left fires, right toggles the altitude, middle selects, left + middle uses. */
export function mousePlayer(m: Mouse): PlayerInput {
  return {
    ...NO_INPUT, device: 2, fire: m.left, altitude: m.right, select: m.middle, use: m.middle && m.left,
    mouseX: m.x, mouseY: m.y,
  };
}

/**
 * The gamepad (index among the connected ones) each player takes, or -1: a Joystick player the first, then the
 * keyboard players (types 1 and 4) in the game, in order, the next ones. With one pad and two keyboard players,
 * P1 has it; a second pad goes to P2.
 */
export function padAssignment(control: readonly number[], active: readonly boolean[]): number[] {
  let next = control.includes(3) ? 1 : 0;
  return control.map((c, i) => (c === 3 ? 0 : (c === 1 || c === 4) && active[i] ? next++ : -1));
}

/** Both inputs' flags together (a keyboard player with a pad); the keyboard's device stays. */
function merge(k: PlayerInput, p: PlayerInput): PlayerInput {
  return {
    ...k, left: k.left || p.left, right: k.right || p.right, up: k.up || p.up, down: k.down || p.down,
    fire: k.fire || p.fire, altitude: k.altitude || p.altitude, select: k.select || p.select, use: k.use || p.use,
  };
}

/** `active`: the players in the game (a WASD player only takes keys from the arrow player while playing). */
export function playerInputs(
  control: readonly number[], active: readonly boolean[], keys: Keyboard, mouse: Mouse, pad: Gamepad,
  touch?: TouchControls,
): PlayerInput[] {
  const shared = control.some((c, i) => c === 4 && active[i]);
  const pads = padAssignment(control, active);
  return control.map((c, i) => {
    if (c === 2) return mousePlayer(mouse);
    if (c === 3) return pad.player(0, { select: keys.held('NumpadSubtract'), use: keys.held('NumpadAdd') });
    if (c === 5) return touch?.player() ?? { ...NO_INPUT, device: 5 };
    const k = keys.player(c === 4, shared);
    return pads[i] >= 0 && pads[i] < pad.count ? merge(k, pad.player(pads[i])) : k;
  });
}
