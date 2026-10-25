// Gamepads (standard mapping: an Xbox layout, which is also what Steam Input presents for a Steam Deck).
// In a level a pad is a player's joystick (handler @0x1A58F, spec §2): the original reads stick A with a ±15-unit
// dead zone around the centre sampled at startup; the remake uses an analog dead zone instead. A fires (button 1),
// B toggles the altitude (button 2), and since a pad has no keypad, X / LB select a bonus and Y / RB use it (the
// original's keypad - and +, which still work). Which player takes which pad: input/players.ts.
// Remake: everywhere else the pads stand in for the keyboard and the mouse, so a game can be played from the
// start screen to the ending with a pad alone. The screen decides how (`PadMode`, main.ts): in the menus the
// buttons are keys (A Enter, B Esc, ...), in the hangar and the shop, which the original drives with the mouse,
// the sticks move the pointer and A / B are the left / right button.
// Windows often lists more pads than are plugged in (one controller as both XInput and HID, Steam's or vJoy's
// virtual pads), so a pad only counts once it is used: a button pressed or a stick moved from where it rested.

import { NO_INPUT, type PlayerInput } from '../sim/state';

const DEAD_ZONE = 0.3;
const MENU_DEAD_ZONE = 0.5; // a stick as arrow keys: only a clear push
/** The pointer's speed at full deflection, in screen pixels (320 x 200) per tick; slower near the centre. */
const POINTER_SPEED = 6;
const BUTTON = { fire: [0, 7], altitude: [1], select: [2, 4], use: [3, 5], up: [12], down: [13], left: [14], right: [15] };
// standard mapping indices
const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, VIEW = 8, MENU = 9, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;

/**
 * How the pads act this tick (main.ts picks it from the screen): `menu` buttons as keys; `level` the players'
 * joysticks, Menu pauses; `paused` Menu or A resumes, B or View quits the level; `pointer` (hangar, shop) the sticks
 * and the d-pad move the pointer, A clicks, B is the right button, View leaves.
 */
export type PadMode = 'menu' | 'level' | 'paused' | 'pointer';

/** Key codes (KeyboardEvent.code, as the screens read them; 'Cheat' is the hangar's cheat button) per button. */
const KEYS: Record<PadMode, [number, string][]> = {
  menu: [[A, 'Enter'], [MENU, 'Enter'], [B, 'Escape'], [VIEW, 'Escape'], [X, 'Space'], [Y, 'Cheat'], [LB, 'PageUp'],
    [RB, 'PageDown'], [UP, 'ArrowUp'], [DOWN, 'ArrowDown'], [LEFT, 'ArrowLeft'], [RIGHT, 'ArrowRight']],
  level: [[MENU, 'KeyP']],
  paused: [[MENU, 'KeyP'], [A, 'KeyP'], [B, 'Escape'], [VIEW, 'Escape']],
  pointer: [[VIEW, 'Escape'], [Y, 'Cheat']],
};

const pressed = (p: globalThis.Gamepad, ids: number[]) => ids.some((i) => p.buttons[i]?.pressed);

/** A stick axis beyond the dead zone, rescaled to 0..1 and squared (fine control near the centre). */
function curve(v: number): number {
  const a = (Math.abs(v) - DEAD_ZONE) / (1 - DEAD_ZONE);
  return a <= 0 ? 0 : Math.sign(v) * a * a;
}

export class Gamepad {
  /** The pads in use, in slot order (a player's pad index counts among these). */
  private pads: globalThis.Gamepad[] = [];
  /** Per slot of navigator.getGamepads(): the pad's id, its axes when first seen, and whether it has been used. */
  private readonly slots = new Map<number, { id: string; rest: number[]; live: boolean }>();
  private readonly codes = new Set<string>();
  /** Pointer mode: how far the pads move the pointer this tick (screen pixels) and the mouse buttons they hold. */
  readonly pointer = { dx: 0, dy: 0, buttons: 0 };
  /** A button is held or a stick pushed (main.ts then shows the pad's buttons in the legend). */
  used = false;

  /** Read the connected gamepads for the next tick. */
  sample(mode: PadMode = 'level'): void {
    const all = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    this.pads = [];
    all.forEach((p, slot) => {
      if (p === null || !p.connected) {
        this.slots.delete(slot);
        return;
      }
      let s = this.slots.get(slot);
      if (s === undefined || s.id !== p.id) this.slots.set(slot, (s = { id: p.id, rest: [...p.axes], live: false }));
      const rest = s.rest;
      s.live ||= p.buttons.some((b) => b.pressed) || p.axes.some((v, i) => Math.abs(v - (rest[i] ?? 0)) > DEAD_ZONE);
      if (s.live) this.pads.push(p);
    });
    this.codes.clear();
    Object.assign(this.pointer, { dx: 0, dy: 0, buttons: 0 });
    this.used = false;
    for (const p of this.pads) {
      this.used ||= p.buttons.some((b) => b.pressed) || p.axes.some((v) => Math.abs(v) > DEAD_ZONE);
      for (const [button, code] of KEYS[mode]) if (p.buttons[button]?.pressed) this.codes.add(code);
      const [lx = 0, ly = 0, rx = 0, ry = 0] = p.axes;
      if (mode === 'menu') {
        if (lx < -MENU_DEAD_ZONE) this.codes.add('ArrowLeft');
        if (lx > MENU_DEAD_ZONE) this.codes.add('ArrowRight');
        if (ly < -MENU_DEAD_ZONE) this.codes.add('ArrowUp');
        if (ly > MENU_DEAD_ZONE) this.codes.add('ArrowDown');
      } else if (mode === 'pointer') {
        const dpad = (minus: number, plus: number) => (pressed(p, [plus]) ? 1 : 0) - (pressed(p, [minus]) ? 1 : 0);
        this.pointer.dx += (curve(lx) + curve(rx) + dpad(LEFT, RIGHT) * 0.25) * POINTER_SPEED;
        this.pointer.dy += (curve(ly) + curve(ry) + dpad(UP, DOWN) * 0.25) * POINTER_SPEED;
        if (pressed(p, [A])) this.pointer.buttons |= 1;
        if (pressed(p, [B])) this.pointer.buttons |= 2;
      }
    }
  }

  /** How many gamepads are in use. */
  get count(): number {
    return this.pads.length;
  }

  /** A key code one of the pads stands in for this tick (menu, paused and pointer modes; Menu = P in a level). */
  held(code: string): boolean {
    return this.codes.has(code);
  }

  anyKey(): boolean {
    return this.codes.size > 0;
  }

  /** Pad `index` as a joystick player's flags; `keypad` is the keyboard's keypad - / + (select / use). */
  player(index = 0, keypad = { select: false, use: false }): PlayerInput {
    const p = this.pads[index];
    if (p === undefined) return { ...NO_INPUT, device: 3, ...keypad };
    const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    return {
      ...NO_INPUT,
      device: 3,
      left: ax < -DEAD_ZONE || pressed(p, BUTTON.left),
      right: ax > DEAD_ZONE || pressed(p, BUTTON.right),
      up: ay < -DEAD_ZONE || pressed(p, BUTTON.up),
      down: ay > DEAD_ZONE || pressed(p, BUTTON.down),
      fire: pressed(p, BUTTON.fire),
      altitude: pressed(p, BUTTON.altitude),
      select: keypad.select || pressed(p, BUTTON.select),
      use: keypad.use || pressed(p, BUTTON.use),
    };
  }
}
