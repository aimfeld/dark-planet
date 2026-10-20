// TextViewer @0x1C7F2: story, manual, about, mission briefings and the ending text, in SUPER.FNT over
// RASTER.PIC with the EPIS1 palette. Every line is a text sprite (sprites 791+i in slots 24+i), 11 px apart.

import { delay, fadeIn, fadeOut, frame, playSound, waitNoKey, type Ctx, type Proc } from './proc';

export interface ViewerArgs {
  file: string; // texts.json key
  centred: boolean;
  first: number; // 1-based line numbers
  last: number;
  mode: 1 | 2 | 3; // 1 scrolling (story, about, ending), 2 briefing, 3 manual pager
  frameDelay: number; // ms per frame in mode 1
}

const FIRST_SPRITE = 791; // 0x317
const FIRST_SLOT = 24;
const PITCH = 11; // DS:0x904 + 6
const INK = 0x1e; // FontColor: EPIS1 colour 30, near white
const LEFT = 10;

export function* textViewer(ctx: Ctx, a: ViewerArgs): Proc {
  const s = ctx.screen;
  const lines = ctx.data.texts[a.file];
  const line = (n: number) => (n <= a.last && lines[n - 1]) || ' '; // an empty line becomes " "
  s.clear();
  yield* fadeOut(ctx);
  s.picture = 'RASTER';
  s.palette = 'EPIS1';
  s.font = 'SUPER';
  s.ink = INK;
  yield* fadeIn(ctx);

  // The original ends as soon as a key is down, so the Enter that opened the viewer could skip it (I);
  // the remake waits for all keys to be released first.
  let armed = false;
  const key = () => {
    if (!ctx.input.anyKey()) armed = true;
    return armed && ctx.input.anyKey();
  };
  const show = (i: number, text: string, x: number, y: number) => {
    s.makeText(FIRST_SPRITE + i, text);
    s.set(FIRST_SLOT + i, FIRST_SPRITE + i, x, y);
  };

  if (a.mode === 1) {
    // Credits-style scrolling: everything moves up 1 px per frame, a new line every 11 frames.
    let c = a.first;
    let f = 0;
    let r = 0;
    do {
      f += 1;
      for (let slot = FIRST_SLOT; slot <= FIRST_SLOT + 20; slot++) if (s.n[slot] !== 0) s.y[slot] -= 1;
      if (f % 11 === 0) {
        if (c <= a.last) {
          r = (r + 1) % 20;
          const text = line(c);
          show(r, text, a.centred ? 160 - (s.textWidth(text) >> 1) : LEFT, 200);
        }
        c += 1;
      }
      yield* frame(ctx, a.frameDelay);
    } while (c <= a.last + 20 && !key());
  } else if (a.mode === 2) {
    // Mission briefing: 20 lines slide in from alternating sides, then wait for a key.
    for (let i = 1; i <= 20; i++) show(i, line(a.first + i - 1), i % 2 === 1 ? -340 : 360, PITCH * i);
    yield* delay(13);
    playSound(ctx, 47); // DOORUP
    for (let k = 0; k < 50; k++) {
      for (let i = 1; i <= 20; i++) s.x[FIRST_SLOT + i] += i % 2 === 1 ? 7 : -7;
      yield* frame(ctx, 13);
    }
    do yield* frame(ctx, 20);
    while (!key());
  } else {
    // The manual: a page of 18 visible lines; arrows scroll by a line, Left/Right/PgUp/PgDn by a page.
    let c = a.first;
    const page = () => {
      for (let k = 0; k <= 20; k++) show(k, line(c + k), LEFT, PITCH * k + 5);
    };
    page();
    const held = (...codes: string[]) => codes.some((code) => ctx.input.held(code));
    for (;;) {
      if (held('ArrowDown') && c + 18 < a.last) {
        c += 1;
        page();
      }
      if (held('ArrowUp') && c > a.first) {
        c -= 1;
        page();
      }
      if (held('ArrowLeft', 'PageUp')) {
        c = Math.max(1, c - 18);
        page();
        yield* delay(150);
      }
      if (held('ArrowRight', 'PageDown')) {
        c += 18;
        if (c + 18 > a.last) c = a.last - 18;
        page();
        yield* delay(150);
      }
      if (!ctx.input.anyKey()) armed = true;
      if (armed && held('Enter', 'Escape')) break;
      yield* frame(ctx, 15);
    }
  }
  yield* waitNoKey(ctx);
  yield* fadeOut(ctx);
}
