// The controls, shown below the picture: one line per player (P2 only in multiplayer) in the manual's words
// (ANLEIT.UNG), then the general keys (in the hangar also the cheat); during a video how to skip it. X/C/V
// instead of the original Ctrl/Alt/Space, whose combinations the desktop partly takes in a window (see keyboard.ts).

/** One player's controls by control type (Options); `shared`: the arrow player while a WASD player plays. */
function controls(type: number, shared: boolean): string {
  switch (type) {
    case 2:
      return 'Maus: fliegen · links: ballern · rechts: hoch/tief · Mitte: Bonus selektieren · links+Mitte: Bonus abfeuern';
    case 3:
      return 'Joystick: fliegen · A/RT: ballern · B: hoch/tief · X/LB/Ziffernblock −: Bonus selektieren · Y/RB/Ziffernblock +: Bonus abfeuern';
    case 4:
      return 'WASD: fliegen · X: ballern · C: hoch/tief · V: Bonus selektieren · X+V: Bonus abfeuern';
    case 5:
      return 'Touch: Steuerknüppel links, Knöpfe rechts';
    default:
      return shared ? 'Pfeile: fliegen · Komma: ballern · Punkt: hoch/tief · Minus: Bonus selektieren · Komma+Minus: Bonus abfeuern'
        : 'Pfeile: fliegen · X: ballern · C: hoch/tief · V: Bonus selektieren · X+V: Bonus abfeuern';
  }
}

/**
 * `control` and `active` as for playerInputs: the arrow player only has the right-hand keys while WASD plays.
 * While a video plays (`video`: intro, ending) only how to skip it; on the start screen (`video`: start) how to choose;
 * in the hangar (`video`: hangar) the cheat as well.
 */
export function keyLegend(control: readonly number[], active: readonly boolean[], video = ''): string[] {
  if (video === 'start') return ['Pfeile: Version wählen · Enter oder Klick: starten · F: Vollbild'];
  if (video && video !== 'hangar') return [`Beliebige Taste oder Klick: ${video === 'intro' ? 'Intro' : 'Video'} überspringen`];
  const shared = control.some((c, i) => c === 4 && active[i]);
  const lines = control
    .map((c, i) => `Player${i + 1} — ${controls(c, shared)}`)
    .filter((_, i) => i === 0 || active[i]);
  const keys = [...lines, 'P: Pause · Esc: Spiel abbrechen · F: Vollbild · R: Grafik classic/remastered'];
  return video === 'hangar' ? [...keys, 'Cheat Code: gedanke'] : keys;
}
