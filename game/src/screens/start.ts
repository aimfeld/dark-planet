// The remake's start screen, before the intro (user, session 20): a short introduction and the choice between
// the classic and the remastered graphics. Laid out like the options (BROADWA lines, the REST star as the
// cursor) over the text viewer's RASTER.PIC. "Classic 1998" is drawn in the classic font and "Remastered 2026"
// in the remastered one, whichever graphics are on (main.ts shows this screen remastered); the other texts take
// the font of the selected version, and the cursor and the background its style. Choosing a version
// is also the user gesture that lets the browser play the intro's CD track. The third choice opens the 1997
// prototype (sly.html, src/sly/; main.ts follows ctx.launch). The fourth switches the language (Phase 5) and
// stays on the screen; its default comes from the system language.

import { strings } from '../i18n';
import { delay, fadeIn, fadeOut, frame, playSound, TICK_MS, waitMouseUp, waitNoKey, type Ctx, type Proc } from './proc';

const FIRST_SPRITE = 791; // the text viewer's text sprites
const TITLE_SLOT = 2;
const BUTTON_SLOT = 3; // + 0 classic, + 1 remastered, + 2 the prototype, + 3 the language
const LINE_SLOT = 7;
const CURSOR_SLOT = 12;
const CURSOR = 556; // global sprite cycle 556..566, rate 4, 48 x 28
const CURSOR_W = 48;
const BUTTON_X = 118; // the cursor, a 3 px gap and the longer button text centred
const BUTTON_Y = [86, 110, 134, 154];
const PROTOTYPE = 2;
const LANGUAGE = 3;
// The prototype's and the language's lines in the shop's 6 px DEFAULT font (user, session 22), moved down 5 px so
// their middle stays where a BROADWA line's would be (the cursor too).
const BUTTON_FONT = ['BROADWA', 'BROADWA', 'DEFAULT', 'DEFAULT'];
const BUTTON_DY = [0, 0, 5, 5];
const INK = 0x1f; // the options' white
const TEXT_INK = 0x1e; // the text viewer's near white
const HINT_INK = 0x16; // grey
const PITCH = 11; // the text viewer's line pitch
const INTRO_Y = 38;
const HINT_Y = 174;

const buttons = (ctx: Ctx) => {
  const t = strings(ctx.settings.language);
  return [...t.versions, t.languageLine];
};

/** The button under the pointer (its text and the cursor beside it), -1 for none. */
function buttonAt(ctx: Ctx, x: number, y: number): number {
  const s = ctx.screen;
  const font = s.font;
  const texts = buttons(ctx);
  for (let i = 0; i < texts.length; i++) {
    s.font = BUTTON_FONT[i];
    const right = BUTTON_X + s.textWidth(texts[i]);
    s.font = font;
    if (x >= BUTTON_X - CURSOR_W - 3 && x < right && y >= BUTTON_Y[i] - 4 && y < BUTTON_Y[i] + 20) return i;
  }
  return -1;
}

/**
 * Shows the start screen until a version is chosen; sets and saves the graphics setting. The prototype leaves
 * the page (ctx.launch); if the page comes back (the browser's Back), the start screen shows again.
 */
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
    s.ink = INK;
    const t = strings(st.language);
    buttons(ctx).forEach((b, i) => {
      s.font = BUTTON_FONT[i];
      text(BUTTON_SLOT + i, b, BUTTON_X, BUTTON_Y[i] + BUTTON_DY[i], i !== 1);
    });
    s.font = 'SUPER';
    s.ink = TEXT_INK;
    t.intro.forEach((line, i) => centred(LINE_SLOT + i, line, INTRO_Y + PITCH * i));
    s.ink = HINT_INK;
    t.versionHint(st.control.includes(5) ? 'HD' : 'R').forEach((line, i) => centred(LINE_SLOT + t.intro.length + i, line, HINT_Y + PITCH * i));
  };
  s.clear();
  s.picture = 'RASTER';
  s.palette = 'EPIS1';

  let choice = st.remastered ? 1 : 0;
  let version = choice; // the look follows the version last selected (the language line keeps it)
  const cursor = () => {
    if (choice !== LANGUAGE) version = choice;
    s.set(CURSOR_SLOT, s.n[CURSOR_SLOT] || CURSOR, BUTTON_X - CURSOR_W - 3, BUTTON_Y[choice] - 10);
    s.classic[CURSOR_SLOT] = version !== 1 ? 1 : 0;
    s.classicPicture = version !== 1;
    drawTexts(version !== 1);
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
    const back = ['ArrowUp', 'ArrowLeft'].some(held);
    if (back || ['ArrowDown', 'ArrowRight'].some(held)) {
      playSound(ctx, 12); // GRLASER
      choice = (choice + (back ? BUTTON_Y.length - 1 : 1)) % BUTTON_Y.length;
      cursor();
      yield* delay(150);
      continue;
    }
    if (!(tap || held('Enter') || held('Space'))) continue;
    if (choice !== LANGUAGE) break;
    playSound(ctx, 16); // DROHNE3
    st.language = st.language === 'de' ? 'en' : 'de';
    ctx.saveSettings();
    cursor();
    yield* waitNoKey(ctx);
    yield* waitMouseUp(ctx);
  }
  playSound(ctx, 16); // DROHNE3
  if (choice === PROTOTYPE) {
    yield* fadeOut(ctx, false);
    ctx.launch = 'sly.html';
    while (ctx.launch !== null) yield TICK_MS;
    yield* waitNoKey(ctx);
    return yield* startScreen(ctx);
  }
  st.remastered = choice === 1;
  ctx.saveSettings();
  yield* fadeOut(ctx, false);
  yield* waitNoKey(ctx);
  yield* waitMouseUp(ctx);
  s.clear();
  ctx.atStart = false;
}
