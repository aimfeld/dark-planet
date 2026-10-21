// The remake's start screen, before the intro (user, session 20): a short introduction and the choice between
// the classic and the remastered graphics. Laid out like the options (BROADWA lines, the REST star as the
// cursor) over the text viewer's RASTER.PIC. "Classic 1998" is drawn in the classic font and "Remastered 2026"
// in the remastered one, whichever graphics are on (main.ts shows this screen remastered); the other texts take
// the font of the selected version, and the cursor and the background its style. Choosing a version
// is also the user gesture that lets the browser play the intro's CD track.

import { delay, fadeIn, fadeOut, frame, playSound, waitMouseUp, waitNoKey, type Ctx, type Proc } from './proc';

const FIRST_SPRITE = 791; // the text viewer's text sprites
const TITLE_SLOT = 2;
const BUTTON_SLOT = 4; // + 0 classic, + 1 remastered
const LINE_SLOT = 6;
const CURSOR_SLOT = 12;
const CURSOR = 556; // global sprite cycle 556..566, rate 4, 48 x 28
const CURSOR_W = 48;
const BUTTON_X = 118; // the cursor, a 3 px gap and the longer button text centred
const BUTTON_Y = [94, 118];
const BUTTONS = ['Classic 1998', 'Remastered 2026'];
const INK = 0x1f; // the options' white
const TEXT_INK = 0x1e; // the text viewer's near white
const HINT_INK = 0x16; // grey
const PITCH = 11; // the text viewer's line pitch
const INTRO = ['Dark Planet ist ein Shoot \'em up', 'für DOS aus dem Jahr 1998,', 'inspiriert von Raptor und Xenon 2.'];
const hint = (touch: boolean) => [
  'Die Version kann jederzeit im Spiel',
  `gewechselt werden (${touch ? 'HD' : 'R'} oder Optionen).`,
];

/** The button under the pointer (its text and the cursor beside it), -1 for none. */
function buttonAt(ctx: Ctx, x: number, y: number): number {
  const s = ctx.screen;
  for (let i = 0; i < BUTTONS.length; i++) {
    const right = BUTTON_X + s.textWidth(BUTTONS[i]);
    if (x >= BUTTON_X - CURSOR_W - 3 && x < right && y >= BUTTON_Y[i] - 4 && y < BUTTON_Y[i] + 20) return i;
  }
  return -1;
}

/** Shows the start screen until a version is chosen; sets and saves the graphics setting. */
export function* startScreen(ctx: Ctx): Proc {
  const s = ctx.screen;
  const st = ctx.settings;
  // The selected version's font for all texts but the other button, and its style for the cursor and the background
  // (user, session 20).
  const drawTexts = (classic: boolean) => {
    let sprite = FIRST_SPRITE;
    const text = (slot: number, t: string, x: number, y: number, cl = classic) => {
      s.makeText(sprite, t, cl);
      s.set(slot, sprite++, x, y);
    };
    const centred = (slot: number, t: string, y: number) => text(slot, t, 160 - (s.textWidth(t) >> 1), y);
    s.font = 'FIRE';
    centred(TITLE_SLOT, 'DARK PLANET', 12);
    s.font = 'BROADWA';
    s.ink = INK;
    BUTTONS.forEach((b, i) => text(BUTTON_SLOT + i, b, BUTTON_X, BUTTON_Y[i], i === 0));
    s.font = 'SUPER';
    s.ink = TEXT_INK;
    INTRO.forEach((line, i) => centred(LINE_SLOT + i, line, 42 + PITCH * i));
    s.ink = HINT_INK;
    hint(st.control.includes(5)).forEach((line, i) => centred(LINE_SLOT + INTRO.length + i, line, 160 + PITCH * i));
  };
  s.clear();
  s.picture = 'RASTER';
  s.palette = 'EPIS1';

  let choice = st.remastered ? 1 : 0;
  const cursor = () => {
    s.set(CURSOR_SLOT, s.n[CURSOR_SLOT] || CURSOR, BUTTON_X - CURSOR_W - 3, BUTTON_Y[choice] - 10);
    s.classic[CURSOR_SLOT] = choice === 0 ? 1 : 0;
    s.classicPicture = choice === 0;
    drawTexts(choice === 0);
  };
  cursor();
  ctx.atStart = true;
  yield* fadeIn(ctx);
  let mouseArmed = false; // a click counts once the button was up
  let pointer = [ctx.input.mouse.x, ctx.input.mouse.y]; // a resting pointer leaves the selection alone
  let setting = st.remastered; // the HD button or R switches it here too: the cursor follows (user, session 20)
  for (;;) {
    yield* frame(ctx, 15);
    if (st.remastered !== setting) {
      setting = st.remastered;
      choice = setting ? 1 : 0;
      cursor();
    }
    const m = ctx.input.mouse;
    const at = buttonAt(ctx, m.x, m.y);
    const moved = m.x !== pointer[0] || m.y !== pointer[1];
    pointer = [m.x, m.y];
    if (at >= 0 && (moved || m.down) && at !== choice) {
      choice = at;
      cursor();
    }
    const tap = mouseArmed && m.down && at >= 0;
    mouseArmed = !m.down;
    const held = (code: string) => ctx.input.held(code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(held)) {
      playSound(ctx, 12); // GRLASER
      choice = 1 - choice;
      cursor();
      yield* delay(150);
      continue;
    }
    if (tap || held('Enter') || held('Space')) break;
  }
  playSound(ctx, 16); // DROHNE3
  st.remastered = choice === 1;
  ctx.saveSettings();
  yield* fadeOut(ctx, false);
  yield* waitNoKey(ctx);
  yield* waitMouseUp(ctx);
  s.clear();
  ctx.atStart = false;
}
