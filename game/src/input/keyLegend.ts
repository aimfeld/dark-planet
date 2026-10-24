// The controls, shown below the picture: one line per player (P2 only in multiplayer) in the manual's words
// (ANLEIT.UNG), then the general keys (in the hangar also the cheat); during a video how to skip it. X/C/V
// instead of the original Ctrl/Alt/Space, whose combinations the desktop partly takes in a window (see keyboard.ts).
// While a gamepad is in use, its buttons instead (input/gamepad.ts).

import { strings, XBOX_NAMES, type Lang, type PadNames } from '../i18n';
import { padAssignment } from './players';

/** One player's controls by control type (Options); `shared`: the arrow player while a WASD player plays. */
function controls(lang: Lang, type: number, shared: boolean, names: PadNames): string {
  const t = strings(lang).legend;
  switch (type) {
    case 2:
      return t.mouse;
    case 3:
      return t.joystick(names);
    case 4:
      return t.wasd;
    case 5:
      return t.touch;
    default:
      return shared ? t.arrowsShared : t.arrows;
  }
}

/** The gamepads connected and their button names, when the legend should show a pad's buttons. */
export interface PadLegend {
  count: number;
  names: PadNames;
}

/**
 * `control` and `active` as for playerInputs: the arrow player only has the right-hand keys while WASD plays.
 * `context`: while a video plays (intro, ending) only how to skip it; on the start screen (start) how to choose;
 * in the hangar (hangar) the cheat as well; `level` and `shop` change only the pad's lines. With `pad`, a keyboard
 * player who has a pad shows the pad's line, and the screens their pad buttons (the hangar and the shop: the pad
 * as the pointer).
 */
export function keyLegend(
  lang: Lang, control: readonly number[], active: readonly boolean[], context = '', pad: PadLegend | null = null,
): string[] {
  const t = strings(lang).legend;
  const names = pad?.names ?? XBOX_NAMES;
  if (pad) {
    if (context === 'start') return [t.pad.start];
    if (context === 'hangar') return [t.pad.pointer, t.pad.cheat];
    if (context === 'shop') return [t.pad.pointer];
    if (context && context !== 'level') return [t.pad.skip(context === 'intro')];
  }
  if (context === 'start') return [t.start];
  if (context && context !== 'hangar' && context !== 'shop' && context !== 'level') return [t.skip(context === 'intro')];
  const shared = control.some((c, i) => c === 4 && active[i]);
  const pads = padAssignment(control, active);
  const lines = control
    .map((c, i) => {
      const line = pad && c !== 3 && pads[i] >= 0 && pads[i] < pad.count ? t.pad.player(names) : controls(lang, c, shared, names);
      return `${t.player(i + 1)} — ${line}`;
    })
    .filter((_, i) => i === 0 || active[i]);
  const keys = [...lines, !pad ? t.general : context === 'level' ? t.pad.level : t.pad.menus];
  return context === 'hangar' ? [...keys, t.cheat] : keys;
}
