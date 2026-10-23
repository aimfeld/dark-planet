// The remake's languages (Phase 5, decision 29): German, the original, and English. The language is a setting of
// its own, independent of the graphics. This file holds the strings the code draws or shows; the text files
// (story, manual, briefings, shop texts) are in texts.ts.

export type Lang = 'de' | 'en';
export const LANGUAGES: readonly Lang[] = ['de', 'en'];

/** The default: German for a German system language (de, de-CH, de-AT …), English for every other. */
export function systemLanguage(preferred: readonly string[] = navigator.languages ?? [navigator.language]): Lang {
  return preferred[0]?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

/** The language saved with the settings (main.ts's darkplanet.settings), for pages without them (the prototype). */
export function storedLanguage(): Lang {
  try {
    const lang = JSON.parse(localStorage.getItem('darkplanet.settings') ?? '{}').language;
    if (LANGUAGES.includes(lang)) return lang;
  } catch {
    // no storage or a broken entry
  }
  return systemLanguage();
}

const de = {
  languageName: 'Deutsch',
  // Start screen (remake). The hint names the HD button with touch controls, else R.
  intro: ["Dark Planet ist ein Shoot 'em up", 'für DOS aus dem Jahr 1998,', 'inspiriert von Raptor und Xenon 2.'],
  versionHint: (key: string) => ['Die Version kann jederzeit im Spiel', `gewechselt werden (${key} oder Optionen).`],
  versions: ['Classic 1998', 'Remastered 2026'],
  // Options (DS:0x502 + 256 ctl; the remake adds WASD, Touch and the language)
  controlLine: (player: number, control: string) => `Steuerung Player${player}:${control}`,
  controls: ['Tastatur', 'Maus', 'Joystick', 'WASD', 'Touch'],
  cdSound: 'CDSound:',
  soundEffects: 'SoundEffekte:',
  on: ' an',
  off: ' aus',
  graphics: 'Grafik: ',
  languageLine: 'Sprache: Deutsch',
  leaveMenu: 'Menu verlassen',
  // Hangar (labels DS:0x917 + 0x15 i)
  hangarItems: ['Shoot em all', 'Shop', 'Multiplayer', 'Optionen', 'Zurück zu Hauptmenu'],
  joinQuestion: 'Verstärkung? Enter=Ja, Rest=Nein',
  yes: 'Ja',
  no: 'Nein',
  cantSwitchBack: 'Zurückschalten nicht möglich!',
  // Shop
  categories: ['', 'Kleine Pods', 'Grosse Pods', 'Boni', 'Antriebe', 'Schilde', 'Kugel Pods', 'Jets'],
  invested: 'Investiert:',
  refund: 'Rückzahlung: ',
  noText: 'Noch kein Text!',
  // Main menu: a save file that fails the check
  cheated: ['Na du kleines Schlitzohr, so läuft das aber nicht!', 'Da musste schon früher aufstehen, um den Saveschutz', 'übers Ohr zu hauen!!!'],
  // Key legend below the picture (remake), in the manual's words
  legend: {
    player: (n: number) => `Player${n}`,
    mouse: 'Maus: fliegen · links: ballern · rechts: hoch/tief · Mitte: Bonus selektieren · links+Mitte: Bonus abfeuern',
    joystick: 'Joystick: fliegen · A/RT: ballern · B: hoch/tief · X/LB/Ziffernblock −: Bonus selektieren · Y/RB/Ziffernblock +: Bonus abfeuern',
    wasd: 'WASD: fliegen · X: ballern · C: hoch/tief · V: Bonus selektieren · X+V: Bonus abfeuern',
    touch: 'Touch: Steuerknüppel links, Knöpfe rechts',
    arrowsShared: 'Pfeile: fliegen · Komma: ballern · Punkt: hoch/tief · Minus: Bonus selektieren · Komma+Minus: Bonus abfeuern',
    arrows: 'Pfeile: fliegen · X: ballern · C: hoch/tief · V: Bonus selektieren · X+V: Bonus abfeuern',
    general: 'P: Pause · Esc: Spiel abbrechen · F: Vollbild · R: Grafik classic/remastered',
    cheat: 'Cheat Code: gedanke',
    start: 'Pfeile: Version wählen · Enter oder Klick: starten · F: Vollbild',
    skip: (intro: boolean) => `Beliebige Taste oder Klick: ${intro ? 'Intro' : 'Video'} überspringen`,
  },
  // Touch buttons (remake)
  touch: { fire: 'Feuer', altitude: 'Höhe', select: 'Bonus<br>wählen', use: 'Bonus<br>feuern' },
  // The page around the game (remake)
  loading: 'Lade Daten…',
  loadingUpdate: 'Lade Update…',
  loadFailed: (dir: string) => `Daten konnten nicht geladen werden (${dir})`,
  graphicsToast: (remastered: boolean) => `Grafik: ${remastered ? 'Remastered' : 'Classic'}`,
  // The prototype's page (sly.html)
  sly: {
    title: 'Dark Planet: die Sly-Version<br>(der Prototyp von 1997)',
    start: (touch: boolean): string => (touch ? 'Zum Starten tippen' : 'Taste drücken'),
    end: 'Programm beendet<br><br>Enter: nochmal &nbsp; Esc: zurück zu Dark Planet',
    again: 'Nochmal',
    back: 'Zurück',
    keys: 'Pfeiltasten: steuern · X / Strg: feuern · Esc: beenden · F: Vollbild',
  },
};

export type Strings = typeof de;

const en: Strings = {
  languageName: 'English',
  intro: ["Dark Planet is a shoot 'em up", 'for DOS from 1998,', 'inspired by Raptor and Xenon 2.'],
  versionHint: (key: string) => ['You can switch versions at any time', `in the game (${key} or Options).`],
  versions: ['Classic 1998', 'Remastered 2026'],
  controlLine: (player: number, control: string) => `Controls Player${player}:${control}`,
  controls: ['Keyboard', 'Mouse', 'Joystick', 'WASD', 'Touch'],
  cdSound: 'CD Sound:',
  soundEffects: 'Sound Effects:',
  on: ' on',
  off: ' off',
  graphics: 'Graphics: ',
  languageLine: 'Language: English',
  leaveMenu: 'Leave Menu',
  hangarItems: ['Shoot em all', 'Shop', 'Multiplayer', 'Options', 'Back to Main Menu'],
  joinQuestion: 'Backup? Enter=Yes, other keys=No',
  yes: 'Yes',
  no: 'No',
  cantSwitchBack: "Can't switch back!",
  categories: ['', 'Small Pods', 'Large Pods', 'Bonuses', 'Engines', 'Shields', 'Ball Pods', 'Jets'],
  invested: 'Invested:',
  refund: 'Refund: ',
  noText: 'No text yet!',
  cheated: ["Nice try, you little rascal, but that won't work!", "You'll have to get up earlier than that to outwit", 'the save protection!!!'],
  legend: {
    player: (n: number) => `Player${n}`,
    mouse: 'Mouse: fly · left: fire · right: high/low · middle: select bonus · left+middle: use bonus',
    joystick: 'Joystick: fly · A/RT: fire · B: high/low · X/LB/numpad −: select bonus · Y/RB/numpad +: use bonus',
    wasd: 'WASD: fly · X: fire · C: high/low · V: select bonus · X+V: use bonus',
    touch: 'Touch: stick on the left, buttons on the right',
    arrowsShared: 'Arrows: fly · Comma: fire · Period: high/low · Minus: select bonus · Comma+Minus: use bonus',
    arrows: 'Arrows: fly · X: fire · C: high/low · V: select bonus · X+V: use bonus',
    general: 'P: pause · Esc: quit game · F: fullscreen · R: graphics classic/remastered',
    cheat: 'Cheat code: gedanke',
    start: 'Arrows: choose version · Enter or click: start · F: fullscreen',
    skip: (intro: boolean) => `Any key or click: skip ${intro ? 'intro' : 'video'}`,
  },
  touch: { fire: 'Fire', altitude: 'High/<br>low', select: 'Select<br>bonus', use: 'Use<br>bonus' },
  loading: 'Loading…',
  loadingUpdate: 'Loading update…',
  loadFailed: (dir: string) => `Could not load the data (${dir})`,
  graphicsToast: (remastered: boolean) => `Graphics: ${remastered ? 'Remastered' : 'Classic'}`,
  sly: {
    title: 'Dark Planet: the Sly version<br>(the 1997 prototype)',
    start: (touch: boolean) => (touch ? 'Tap to start' : 'Press a key'),
    end: 'Program ended<br><br>Enter: play again &nbsp; Esc: back to Dark Planet',
    again: 'Again',
    back: 'Back',
    keys: 'Arrow keys: steer · X / Ctrl: fire · Esc: quit · F: fullscreen',
  },
};

const STRINGS: Record<Lang, Strings> = { de, en };

export function strings(lang: Lang): Strings {
  return STRINGS[lang];
}
