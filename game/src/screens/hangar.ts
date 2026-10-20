// The hangar (game menu @0x1D095, setup 0x1CE10): UMBILD.PIC with four animated doors, driven by the
// mouse. Shoot em all (briefing, then the level), Shop, Multiplayer (P2 joins), Optionen, back to the main menu.

import { joinPlayer2 } from '../sim/tick';
import { playLevel } from './level';
import { options } from './options';
import { shop } from './shop';
import { cdPlay, fadeIn, fadeOut, frame, playSound, stopSound, waitMouseUp, type Ctx, type Proc } from './proc';
import { textViewer } from './textViewer';
import { playVideo } from './video';

const POINTER = 612; // slot 1, an 8 x 11 arrow
const LABEL_SPRITE = 817; // text sprite 0x331 in slot 3
const LABEL_SLOT = 3;
const P2_DOOR = [610, 611]; // slot 23: P2 not joined / joined
// Hotspots (DS:0x98E, inclusive) and labels (DS:0x917 + 0x15 i).
const ITEMS: { x1: number; y1: number; x2: number; y2: number; label: string }[] = [
  { x1: 92, y1: 110, x2: 185, y2: 154, label: 'Shoot em all' },
  { x1: 245, y1: 111, x2: 320, y2: 154, label: 'Shop' },
  { x1: 20, y1: 126, x2: 76, y2: 170, label: 'Multiplayer' },
  { x1: 228, y1: 18, x2: 312, y2: 58, label: 'Optionen' },
  { x1: 77, y1: 175, x2: 282, y2: 200, label: 'Zurück zu Hauptmenu' },
];
// Animated doors: slot, first and last frame (REST.LIB), the item that opens them, steps every n passes.
const DOORS = [
  { slot: 20, first: 579, last: 588, item: 1, every: 5, x: 87, y: 96 },
  { slot: 21, first: 589, last: 598, item: 2, every: 5, x: 242, y: 102 },
  { slot: 22, first: 599, last: 609, item: 4, every: 1, x: 230, y: 7 },
];
/** Mission briefing lines in MISSIONS.PAS per level (DS:0x910 + 4 level). */
const BRIEFING: [number, number][] = [[1, 14], [16, 30], [32, 47], [49, 64], [66, 79], [81, 96]];
const ENDING: [number, number] = [98, 119];
// The cheat (0x1CF34): typing G-E-D-A-N-K-E sets both players' money to 666666.
const CHEAT = ['KeyG', 'KeyE', 'KeyD', 'KeyA', 'KeyN', 'KeyK', 'KeyE'];

function pointer(ctx: Ctx): void {
  const s = ctx.screen;
  s.x[1] = ctx.input.mouse.x;
  s.y[1] = ctx.input.mouse.y;
}

function* setup(ctx: Ctx): Proc {
  const s = ctx.screen;
  ctx.view = 'screen';
  yield* fadeOut(ctx);
  s.clear();
  s.set(1, POINTER, 0, 0);
  pointer(ctx);
  for (const d of DOORS) s.set(d.slot, d.first, d.x, d.y);
  s.set(23, P2_DOOR[ctx.world.twoPlayer ? 1 : 0], 24, 134);
  s.picture = 'UMBILD';
  s.font = 'BROADWA';
  s.ink = 4;
  s.palette = 'UMBILD';
  yield* fadeIn(ctx);
  while (ctx.input.mouse.down) {
    pointer(ctx);
    yield* frame(ctx, 15);
  }
}

/** The hovered item's label (or a message) centred at y 180; null hides it. */
function label(ctx: Ctx, text: string | null): void {
  const s = ctx.screen;
  if (text === null) {
    s.n[LABEL_SLOT] = 0;
    return;
  }
  s.makeText(LABEL_SPRITE, text);
  s.set(LABEL_SLOT, LABEL_SPRITE, 160 - (s.spriteWidth(LABEL_SPRITE) >> 1), 180);
}

/** Restart a door sound: StopSound if it plays, then PlaySound. */
function doorSound(ctx: Ctx, item: number): void {
  const n = item === 4 ? 22 : item === 1 || item === 2 ? 47 : 0; // ALARM01 / DOORUP
  if (n === 0) return;
  stopSound(ctx, n);
  playSound(ctx, n);
}

export function* hangar(ctx: Ctx): Proc {
  const s = ctx.screen;
  const w = ctx.world;
  const input = ctx.input;
  yield* setup(ctx);
  let hover = 0;
  let passes = 0; // DS:0x552E
  let cheat = 0;
  for (;;) {
    pointer(ctx);
    if (input.anyKey()) {
      // Each key press must be the next letter, anything else starts over (a G as the first letter again).
      if (input.held(CHEAT[cheat])) cheat += 1;
      else cheat = input.held('KeyG') ? 1 : 0;
      if (cheat === CHEAT.length) {
        cheat = 0;
        for (const p of w.players) p.money = 666666; // DS:0x18F2 / 0x18F6, also for an inactive P2
        playSound(ctx, 20); // AIDBONUS, twice
        playSound(ctx, 20);
      }
      while (input.anyKey() && !input.held('Escape')) {
        pointer(ctx);
        yield* frame(ctx, 15);
      }
    }
    yield* frame(ctx, 15);
    const m = input.mouse;
    const now = ITEMS.findIndex((it) => m.x >= it.x1 && m.x <= it.x2 && m.y >= it.y1 && m.y <= it.y2) + 1;
    if (now !== hover) {
      doorSound(ctx, hover);
      doorSound(ctx, now);
      hover = now;
    }
    label(ctx, now === 0 ? null : ITEMS[now - 1].label);
    passes += 1;
    for (const d of DOORS) {
      if (passes % d.every !== 0) continue;
      const n = s.n[d.slot];
      if (hover === d.item && n < d.last) s.n[d.slot] = n + 1;
      else if (hover !== d.item && n > d.first) s.n[d.slot] = n - 1;
    }
    let leave = input.held('Escape');
    if (now !== 0 && m.down) {
      playSound(ctx, 21); // LRM003B
      switch (now) {
        case 1: {
          const result = yield* shootEmAll(ctx);
          if (result === 'menu') return;
          yield* setup(ctx);
          break;
        }
        case 2:
          yield* fadeOut(ctx);
          yield* shop(ctx);
          s.clear();
          yield* setup(ctx);
          break;
        case 3:
          yield* multiplayer(ctx);
          break;
        case 4:
          yield* fadeOut(ctx);
          yield* options(ctx);
          s.clear();
          yield* setup(ctx);
          break;
        case 5:
          leave = true;
          break;
      }
      hover = 0;
      yield* waitMouseUp(ctx); // (I: the original returns to the loop with the button possibly still held)
    }
    if (leave) {
      yield* fadeOut(ctx);
      return;
    }
  }
}

/** "Shoot em all": the briefing, the level, then back to the hangar, the main menu or the ending. */
function* shootEmAll(ctx: Ctx): Proc<'hangar' | 'menu'> {
  const w = ctx.world;
  const [first, last] = BRIEFING[w.level - 1];
  yield* textViewer(ctx, { file: 'MISSIONS.PAS', centred: false, first, last, mode: 2, frameDelay: 0 });
  const result = yield* playLevel(ctx, w.level);
  // Back from the level: faded out after a completed level; after game over or Esc the original cuts
  // straight to the main menu, which fades in from black.
  ctx.view = 'screen';
  ctx.screen.fade = 0;
  ctx.screen.clear();
  if (result === 'done' && w.gameCompleted) {
    yield* textViewer(ctx, { file: 'MISSIONS.PAS', centred: false, first: ENDING[0], last: ENDING[1], mode: 1, frameDelay: 130 });
    // The original quits here and endvideo.bat plays CD track 9 with the ending video; the remake then
    // returns to the main menu.
    yield* playVideo(ctx, 'ending', 9);
    return 'menu';
  }
  if (ctx.settings.cdSound) cdPlay(ctx, 2);
  if (result !== 'done') return 'menu';
  w.level += 1;
  return 'hangar';
}

/** "Multiplayer": P2 joins on Enter; it can't be undone. */
function* multiplayer(ctx: Ctx): Proc {
  const input = ctx.input;
  if (!ctx.world.twoPlayer) {
    label(ctx, 'Verstärkung? Enter=Ja, Rest=Nein');
    yield* frame(ctx, 15);
    while (!input.anyKey()) yield 10; // busy wait without redrawing
    if (input.held('Enter')) {
      joinPlayer2(ctx.world);
      ctx.screen.n[23] = P2_DOOR[1];
    }
    while (input.anyKey()) yield 10;
  } else {
    label(ctx, 'Zurückschalten nicht möglich!');
    yield* frame(ctx, 15);
    while (input.mouse.down || input.anyKey()) yield 10;
    while (!input.mouse.down && !input.anyKey()) yield 10;
    while (input.mouse.down || input.anyKey()) yield 10;
  }
}
