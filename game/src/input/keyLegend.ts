// The controls, shown below the picture: one line per player (P2 only in multiplayer) in the manual's words
// (ANLEIT.UNG), then the general keys. On a Mac no Ctrl: macOS takes Ctrl+arrows for Spaces and Mission
// Control, and a MacBook has no right Ctrl.

/** One player's controls by control type (Options); `shared`: the arrow player while a WASD player plays. */
function controls(type: number, shared: boolean, mac: boolean): string {
  switch (type) {
    case 2:
      return 'Maus: fliegen · links: ballern · rechts: hoch/tief · Mitte: Bonus selektieren · links+Mitte: Bonus abfeuern';
    case 3:
      return 'Joystick: fliegen · A/RT: ballern · B: hoch/tief · X/LB/Ziffernblock −: Bonus selektieren · Y/RB/Ziffernblock +: Bonus abfeuern';
    case 4:
      return 'WASD: fliegen · Shift links: ballern · Q: hoch/tief · E: Bonus selektieren · Shift+E: Bonus abfeuern';
    case 5:
      return 'Touch: Steuerknüppel links, Knöpfe rechts';
    default:
      return shared && mac ? 'Pfeile: fliegen · Option rechts: ballern · -: hoch/tief · Shift rechts: Bonus selektieren · Option+Shift rechts: Bonus abfeuern'
        : shared ? 'Pfeile: fliegen · Ctrl rechts: ballern · Alt rechts: hoch/tief · Shift rechts: Bonus selektieren · Ctrl+Shift rechts: Bonus abfeuern'
        : mac ? 'Pfeile: fliegen · X: ballern · C: hoch/tief · Space: Bonus selektieren · X+Space: Bonus abfeuern'
        : 'Pfeile: fliegen · Ctrl/X: ballern · Alt/C: hoch/tief · Space: Bonus selektieren · Ctrl+Space: Bonus abfeuern';
  }
}

/** `control` and `active` as for playerInputs: the arrow player only has the right-hand keys while WASD plays. */
export function keyLegend(control: readonly number[], active: readonly boolean[], mac: boolean): string[] {
  const shared = control.some((c, i) => c === 4 && active[i]);
  const lines = control
    .map((c, i) => `Player${i + 1} — ${controls(c, shared, mac)}`)
    .filter((_, i) => i === 0 || active[i]);
  return [...lines, 'P: Pause · Esc: Spiel abbrechen · F: Vollbild'];
}
