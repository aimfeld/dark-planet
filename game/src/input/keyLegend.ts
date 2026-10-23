// The controls, shown below the picture: one line per player (P2 only in multiplayer) in the manual's words
// (ANLEIT.UNG), then the general keys (in the hangar also the cheat); during a video how to skip it. X/C/V
// instead of the original Ctrl/Alt/Space, whose combinations the desktop partly takes in a window (see keyboard.ts).

import { strings, type Lang } from '../i18n';

/** One player's controls by control type (Options); `shared`: the arrow player while a WASD player plays. */
function controls(lang: Lang, type: number, shared: boolean): string {
  const t = strings(lang).legend;
  switch (type) {
    case 2:
      return t.mouse;
    case 3:
      return t.joystick;
    case 4:
      return t.wasd;
    case 5:
      return t.touch;
    default:
      return shared ? t.arrowsShared : t.arrows;
  }
}

/**
 * `control` and `active` as for playerInputs: the arrow player only has the right-hand keys while WASD plays.
 * While a video plays (`video`: intro, ending) only how to skip it; on the start screen (`video`: start) how to choose;
 * in the hangar (`video`: hangar) the cheat as well.
 */
export function keyLegend(lang: Lang, control: readonly number[], active: readonly boolean[], video = ''): string[] {
  const t = strings(lang).legend;
  if (video === 'start') return [t.start];
  if (video && video !== 'hangar') return [t.skip(video === 'intro')];
  const shared = control.some((c, i) => c === 4 && active[i]);
  const lines = control
    .map((c, i) => `${t.player(i + 1)} — ${controls(lang, c, shared)}`)
    .filter((_, i) => i === 0 || active[i]);
  const keys = [...lines, t.general];
  return video === 'hangar' ? [...keys, t.cheat] : keys;
}
