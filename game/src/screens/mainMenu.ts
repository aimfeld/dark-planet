// Main menu: DrawMainMenu 0x1D60E and the menu loop in the main body @0x1D7C0. Six pre-drawn REST.LIB
// item sprites over HMBILD.PIC; the selected one glows through the global sprite cycle [base+1, base+10].
// Keyboard only in the original (the mouse can't select); in the remake the pointer selects the item it moves
// onto, and a tap or click opens it.

import { decodeSave } from '../save';
import { hangar } from './hangar';
import { newGameState } from '../sim/tick';
import { FADE_STEPS } from '../sim/state';
import { cdPlay, delay, fadeIn, fadeOut, frame, playSound, waitMouseUp, waitNoKey, type Ctx, type Proc } from './proc';
import { textViewer } from './textViewer';

const ITEMS = 6; // Neues Spiel, Spiel laden, Die Geschichte, Spielanleitung, Horse Productions (about), Exit
const itemSprite = (i: number) => 613 + 11 * (i - 1); // 0x265
const itemSlot = (i: number) => 13 + i;
// The original shows ABOUT.TXT up to line 199 (@0x1D989) and cuts the cheat riddle off after its second line;
// the remake shows it to its last line (spec §12 #20).
const ABOUT_LAST = 207;

function* drawMainMenu(ctx: Ctx, selected: number): Proc {
  const s = ctx.screen;
  if (ctx.settings.cdSound) cdPlay(ctx, 2);
  s.clear();
  for (let i = 1; i <= ITEMS; i++) {
    const n = itemSprite(i);
    s.set(itemSlot(i), n, 160 - (s.spriteWidth(n) >> 1), 26 + 25 * (i - 1) - (i === 1 ? 3 : 0));
  }
  s.n[itemSlot(selected)] += 1;
  s.picture = 'HMBILD';
  s.palette = 'HMBILD';
  yield* fadeIn(ctx);
}

/** The item under the pointer, 0 for none: its 25-pixel row (the sprites overlap) and its width. */
function itemAt(ctx: Ctx, x: number, y: number): number {
  const s = ctx.screen;
  const i = Math.floor((y - 20) / 25) + 1;
  if (i < 1 || i > ITEMS) return 0;
  const slot = itemSlot(i);
  return x >= s.x[slot] && x < s.x[slot] + s.spriteWidth(s.n[slot]) ? i : 0;
}

/** Wait for a key press or a tap (both released first). */
function* waitAnyInput(ctx: Ctx): Proc {
  const any = () => ctx.input.anyKey() || ctx.input.mouse.down;
  while (any()) yield* delay(10);
  while (!any()) yield* delay(10);
  while (any()) yield* delay(10);
}

/**
 * Exit (item 6 or Esc): FadeOut(0, 10, 0) and the program ends. The remake sets ctx.quit, which closes the
 * installed app (main.ts); the main menu then returns, and a browser tab (or an app that can't close, iOS) shows
 * the start screen again (user, session 20).
 */
function* quit(ctx: Ctx): Proc {
  yield* fadeOut(ctx, false, 10);
  ctx.music?.stop();
  ctx.quit = true;
  yield* waitNoKey(ctx);
  yield* waitMouseUp(ctx);
}

/**
 * A SAVE.DAT with a wrong checksum: Shutdown(6) quits to DOS with this message (literals 1d9e:3998-39FF).
 * The remake shows it until a key is pressed, then the main menu again (design).
 */
function* cheated(ctx: Ctx): Proc {
  const s = ctx.screen;
  yield* fadeOut(ctx, false, 10);
  ctx.music?.stop();
  s.clear();
  s.picture = null;
  s.palette = 'EPIS1';
  s.font = 'DEFAULT'; // (DOS text mode in the original)
  s.ink = 0x1c;
  const lines = ['Na du kleines Schlitzohr, so läuft das aber nicht!', 'Da musste schon früher aufstehen, um den Saveschutz', 'übers Ohr zu hauen!!!'];
  lines.forEach((str, i) => {
    s.makeText(900 + i, str);
    s.set(10 + i, 900 + i, 4, 8 + 8 * i);
  });
  s.fade = FADE_STEPS;
  yield* waitAnyInput(ctx);
  s.clear();
}

/** The main menu until Exit. */
export function* mainMenu(ctx: Ctx): Proc {
  const s = ctx.screen;
  const held = (code: string) => ctx.input.held(code);
  let selected = 1;
  ctx.view = 'screen';
  yield* drawMainMenu(ctx, selected);
  // The original quits at once while Esc is held, even an Esc still held from the hangar (I); the remake
  // needs a fresh press.
  let escArmed = false;
  let mouseArmed = false; // a tap counts once the button was up
  let pointer = [ctx.input.mouse.x, ctx.input.mouse.y]; // only a moving pointer selects, so a resting one doesn't undo the keys
  const select = (i: number) => {
    s.n[itemSlot(selected)] = itemSprite(selected);
    selected = i;
    s.n[itemSlot(selected)] += 1;
  };
  for (;;) {
    const m = ctx.input.mouse;
    const tap = mouseArmed && m.down ? itemAt(ctx, m.x, m.y) : 0;
    mouseArmed = !m.down;
    const moved = m.x !== pointer[0] || m.y !== pointer[1];
    pointer = [m.x, m.y];
    const hover = moved ? itemAt(ctx, m.x, m.y) : 0;
    if (tap !== 0 && tap !== selected) select(tap);
    else if (tap === 0 && hover !== 0 && hover !== selected) {
      playSound(ctx, 12); // GRLASER, as for the arrow keys
      select(hover);
    }
    const move = held('ArrowUp') ? -1 : held('ArrowDown') ? 1 : 0;
    if (move !== 0) {
      playSound(ctx, 12); // GRLASER
      yield* delay(100);
      select(((selected - 1 + move + ITEMS) % ITEMS) + 1);
    }
    if (!held('Escape')) escArmed = true;
    if (escArmed && held('Escape')) {
      yield* quit(ctx);
      return;
    }
    if (tap !== 0 || held('Enter') || held('Space')) {
      playSound(ctx, 16); // DROHNE3
      yield* delay(100);
      switch (selected) {
        case 1:
          newGameState(ctx.world);
          yield* hangar(ctx);
          yield* drawMainMenu(ctx, selected);
          break;
        case 2: {
          // Load 1d9e:05D9: no save -> nothing happens; a bad checksum ends the program with a message.
          const saved = ctx.saves.read();
          if (saved === null) break;
          if (decodeSave(saved, ctx.world)) yield* hangar(ctx);
          else yield* cheated(ctx);
          yield* drawMainMenu(ctx, selected);
          break;
        }
        case 3:
          cdPlay(ctx, 3);
          yield* textViewer(ctx, { file: 'STORY.TXT', centred: false, first: 1, last: 261, mode: 1, frameDelay: 150 });
          yield* drawMainMenu(ctx, selected);
          break;
        case 4:
          yield* textViewer(ctx, { file: 'ANLEIT.UNG', centred: false, first: 1, last: 288, mode: 3, frameDelay: 0 });
          yield* drawMainMenu(ctx, selected);
          break;
        case 5:
          yield* textViewer(ctx, { file: 'ABOUT.TXT', centred: true, first: 1, last: ABOUT_LAST, mode: 1, frameDelay: 80 });
          yield* drawMainMenu(ctx, selected);
          break;
        case 6:
          yield* quit(ctx);
          return;
      }
      yield* waitMouseUp(ctx);
    }
    ctx.atMainMenu = true;
    yield* frame(ctx, 15);
    ctx.atMainMenu = false;
  }
}
