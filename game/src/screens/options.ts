// Options @0x1C4CD (setup 0x1C443, lines 0x1C168, cursor 0x1C10B): OMBILD.PIC with the EPIS1 palette,
// _BROADWA lines and the REST star as the cursor. The original's CPU line is dropped (decision 9, user,
// session 4), so "Menu verlassen" moves up to line 5.

import { cdPlay, delay, fadeIn, frame, playSound, waitMouseUp, type Ctx, type Proc } from './proc';

const CONTROLS = ['Tastatur', 'Maus', 'Joystick']; // DS:0x502 + 256 ctl
const LINES = 5;
const CURSOR_SLOT = 12;
const CURSOR = 556; // global sprite cycle 556..566, rate 4

function lineText(ctx: Ctx, line: number): string {
  const st = ctx.settings;
  const onOff = (on: boolean) => (on ? ' an' : ' aus');
  switch (line) {
    case 1:
    case 2:
      return `Steuerung Player${line}:${CONTROLS[st.control[line - 1] - 1]}`;
    case 3:
      return 'CDSound:' + onOff(st.cdSound);
    case 4:
      return 'SoundEffekte:' + onOff(st.soundEffects);
    default:
      return 'Menu verlassen';
  }
}

/** Text sprite 817+i in slot 2+i at (70, 40 + 20 (i - 1)); redrawing does Frame + Delay(15) per line. */
function* drawLines(ctx: Ctx, animate: boolean): Proc {
  const s = ctx.screen;
  for (let i = 1; i <= LINES; i++) {
    s.makeText(817 + i, lineText(ctx, i));
    s.set(2 + i, 817 + i, 70, 40 + 20 * (i - 1));
    if (animate) yield* frame(ctx, 15);
  }
}

function* waitKeyUp(ctx: Ctx): Proc {
  while (ctx.input.anyKey()) yield* frame(ctx, 15);
}

export function* options(ctx: Ctx): Proc {
  const s = ctx.screen;
  const st = ctx.settings;
  const held = (code: string) => ctx.input.held(code);
  s.picture = 'OMBILD';
  s.font = 'BROADWA';
  s.ink = 0x1f;
  s.clear();
  yield* drawLines(ctx, false);
  let line = 1;
  const cursor = () => s.set(CURSOR_SLOT, s.n[CURSOR_SLOT] || CURSOR, 19, 30 + 20 * (line - 1));
  cursor();
  s.palette = 'EPIS1';
  yield* fadeIn(ctx);
  // The Enter/click that opened the options may still be held (the hangar is mouse-driven); wait for it.
  yield* waitKeyUp(ctx);
  for (;;) {
    yield* frame(ctx, 0);
    const move = held('ArrowUp') ? -1 : held('ArrowDown') ? 1 : 0;
    if (move !== 0) {
      playSound(ctx, 12); // GRLASER
      yield* delay(100);
      line = ((line - 1 + move + LINES) % LINES) + 1;
      cursor();
    }
    if (held('Escape')) break;
    if (held('Enter') || held('Space') || (held('ArrowRight') && line !== LINES)) {
      playSound(ctx, 16); // DROHNE3
      yield* delay(100);
      if (line === LINES) break;
      if (line <= 2) {
        // Next control type, skipping the other player's (P1 and P2 never share a device type).
        const other = st.control[2 - line];
        let c = st.control[line - 1];
        do c = (c % 3) + 1;
        while (c === other);
        st.control[line - 1] = c;
        yield* drawLines(ctx, true);
        yield* waitKeyUp(ctx);
      } else if (line === 3) {
        st.cdSound = !st.cdSound;
        ctx.music?.setEnabled(st.cdSound);
        if (st.cdSound) cdPlay(ctx, 2);
        yield* waitKeyUp(ctx);
        yield* drawLines(ctx, true);
      } else {
        // Sound effects: no release wait in the original, a held Enter keeps toggling.
        st.soundEffects = !st.soundEffects;
        if (!st.soundEffects) ctx.sfx?.stopAll();
        yield* drawLines(ctx, true);
      }
      yield* waitMouseUp(ctx);
    }
    yield* delay(15);
  }
  ctx.saveSettings(); // SETTINGS.DAT (0x1AA85)
  s.clear();
}
