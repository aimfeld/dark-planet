// The shop (1d9e:84BC, docs/re-notes.md "Shop screen and load/save"): RASTER.PIC with the SHOP.LIB panel,
// driven by the mouse. The current player's jet with its positions on the left, five offers per page at the
// bottom, the info box (texts from INFO.PAS) on the right, four mode buttons: Kaufen, Verkaufen, Position
// wechseln, Haupt Menu. Plus the player switch and the money exchange for two players.
// The original edits a copy of the player record and writes it back; the remake edits the Player directly.

import type { Player } from '../sim/state';
import { MODE_SHADOW } from '../sim/state';
import { hitDetectIn } from '../sim/sprites';
import { encodeSave } from '../save';
import { delay, DRAW_MS, fadeIn, frame, playSound, type Ctx, type Proc } from './proc';

// Categories (ItemInfo 1d9e:3C5A): 1 small pods, 2 large pods, 3 boni, 4 engines, 5 shields, 6 ball pods,
// 7 jets; 8 = the jet's standard weapon (mount 2, never offered).
const SMALL = 1, LARGE = 2, BONI = 3, ENGINE = 4, SHIELD = 5, BALL = 6, JET = 7, STANDARD = 8;
const CAT_NAMES = ['', 'Kleine Pods', 'Grosse Pods', 'Boni', 'Antriebe', 'Schilde', 'Kugel Pods', 'Jets'];
const CAT_COUNT = [0, 7, 11, 11, 3, 3, 4, 5];

// Positions on the jet display p = 0..13 (DS:0x9C2 / 0x9D0): 0 large nose, 1 engine, 2 small, 3 standard,
// 4..7 large inner/outer left/right, 8 ball, 9 shield, 10 jet, 11..13 boni. NONE = DS value 20.
const POS_X = [103, 101, 84, 123, 73, 133, 53, 153, 59, 13, 93, 10, 38, 66];
const POS_Y = [13, 77, 18, 18, 45, 45, 49, 49, 15, 15, 41, 89, 89, 89];
const NONE = 20;
const CAT_POS = [[], [2], [0, 4, 5, 6, 7], [11, 12, 13], [1], [9], [8], [10]]; // DS:0x9E8
const CAT_W = [0, 9, 16, 19, 19, 19, 23, 34]; // click rectangle per category (DS:0x9DD / 0x9E5)
const CAT_H = [0, 17, 22, 19, 19, 19, 24, 30];

// Item sprite offsets (ItemInfo fields 11 / 12) where they aren't (1, 1).
const BONI_DX = [0, 1, 5, 3, 5, 4, 4, 4, 5, 5, 0, 5]; // DS:0x1795
const BALL_OFS = [[0, 0], [3, 2], [1, 1], [1, 1], [1, 1]]; // DS:0x1843 / 0x1847
const JET_DX = [0, -3, -2, -1, -2, 0]; // DS:0x189F (dy 0)
// Offer boxes: item sprite at x = OFFER_DX[cat] + 56 i + ofsX, y = OFFER_DY[cat] + ofsY + 163 (DS:0xA11 / 0xA19).
const OFFER_DX = [0, -15, -13, -21, -15, -17, -17, -17];
const OFFER_DY = [0, 0, 0, -2, 0, 0, 0, -1];
const BONI_IN_SHOP = [2, 4, 5, 6, 7, 8, 9, 11]; // DS:0x1789 flags, plus "1 Leben" and "Save"
const STEPS = [0, 1, 100, 1000, 9000]; // money exchange steps (DS:0xA26 + 2 i)

const POINTER = 495; // slot 1; slot 2 holds 496, a 4 x 1 hot spot
const POINTER_DOT = 496;
const PANEL = 501; // slot 64 at (3, 3)
const SELECTED = 502; // slot 24: frame around the selected offer
const NO_OFFER = 503; // TV noise
const MODE_FRAME = 506; // slot 33
const INFO_ICON = 520; // header icon of the SPEZIAL texts
const EXCHANGE_PANEL = 535; // slot 61
const EXCHANGE_EXIT = 536;
const JET_SLOT = 128; // DS:0x7546, P1's jet slot
// Text sprites (MakeText 1d9e:2E58, DEFAULT.FNT, colour 0x1C).
const T_STEP = 811;
const T_LINE = 826; // + line 1..7, slot 33 + line
const T_MONEY = 837;
const T_MONEY2 = 838;
const T_CAT = 840; // slot 3; offer prices 841..845 in slots 18..22
const T_PRICE = 848; // header price, slot 32
const T_PLAYER = 849; // slot 45
const INK = 0x1c;

type Rect = [number, number, number, number]; // x1, y1, x2, y2 inclusive (1d9e:41C6)
const FULL_WINDOW: Rect = [0, 0, 319, 199];
const PLACE_WINDOW: Rect = [3, 7, 179, 117]; // mouse window while a large pod hangs on the pointer
const EXCHANGE_WINDOW: Rect = [200, 4, 312, 119];

interface Offer {
  cat: number;
  id: number;
}

interface Shop {
  ctx: Ctx;
  player: number; // DS:0x9BF - 1
  mode: number; // 1 Kaufen, 2 Verkaufen, 3 Position wechseln, 4 Haupt Menu
  cat: number;
  page: number; // first offer index - 1: 0, 5, 10, 15
  sel: number; // selected offer box 1..5, 0 = none
  pos: number; // selected jet position, NONE = none
  offers: (Offer | undefined)[]; // 1..20
  win: Rect;
  mx: number; // pointer (DS:0x5516 / 0x5518)
  my: number;
  clickWait: number; // passes until the next click counts (DS:0x9BE)
  modeWait: number; // after a mode change (DS:0xA26)
}

const pl = (sh: Shop): Player => sh.ctx.world.players[sh.player];
const inside = (sh: Shop, [x1, y1, x2, y2]: Rect) => sh.mx >= x1 && sh.mx <= x2 && sh.my >= y1 && sh.my <= y2;
const twice = (ctx: Ctx, n: number) => {
  playSound(ctx, n);
  playSound(ctx, n);
};

// --- Items (ItemInfo 1d9e:3C5A) ---

/** Save price: 4000 + 10000 min(level - 2, 4); the original goes negative on level 1 (spec §12 #6). */
export function savePrice(level: number): number {
  return 4000 + 10000 * Math.min(Math.max(level - 2, 0), 4);
}

export function price(ctx: Ctx, cat: number, id: number): number {
  const t = ctx.data.tables;
  if (id < 1) return 0;
  switch (cat) {
    case SMALL: return t.small_pods[id - 1].price;
    case LARGE: return t.large_pods[id - 1].price;
    case BONI: return id === 11 ? savePrice(ctx.world.level) : t.boni[id - 1].price;
    case ENGINE: return t.engines[id - 1].price;
    case SHIELD: return t.shields[id - 1].price;
    case BALL: return t.ball_pods[id - 1].price;
    case JET: return t.jets[id - 1].price;
  }
  return 0;
}

function icon(ctx: Ctx, cat: number, id: number): number {
  const t = ctx.data.tables;
  if (id < 1) return 0;
  switch (cat) {
    case SMALL: return t.small_pods[id - 1].shop_sprite ?? 0;
    case LARGE: return t.large_pods[id - 1].sprite ?? 0;
    case BONI: return t.boni[id - 1].sprite;
    case ENGINE: return t.engines[id - 1].shop_sprite;
    case SHIELD: return t.shields[id - 1].shop_sprite;
    case BALL: return t.ball_pods[id - 1].sprite ?? 0;
    case JET: return t.jets[id - 1].shop_sprite;
    case STANDARD: return t.jets[id - 1].standard_weapon.sprite;
  }
  return 0;
}

function iconOfs(cat: number, id: number): [number, number] {
  switch (cat) {
    case BONI: return [BONI_DX[id], 1];
    case ENGINE: return [0, 0];
    case BALL: return BALL_OFS[id] as [number, number];
    case JET: return [JET_DX[id], 0];
  }
  return [1, 1];
}

/** The offer list (1d9e:6216): by price; jets only above the current one; boni only the shop's. */
export function offers(ctx: Ctx, p: Player, cat: number): Offer[] {
  const list: Offer[] = [];
  for (let id = 1; id <= CAT_COUNT[cat]; id++) {
    if (price(ctx, cat, id) <= 0) continue;
    if (cat === JET && id <= p.jet) continue;
    if (cat === BONI && !BONI_IN_SHOP.includes(id)) continue;
    list.push({ cat, id });
  }
  // The original picks the next price strictly above the last one, so an item priced like the one before
  // never shows up (the Rocketlauncher, spec §12 #1); the remake lists every item, equal prices by number.
  return list.sort((a, b) => price(ctx, cat, a.id) - price(ctx, cat, b.id) || a.id - b.id).slice(0, 20);
}

// --- Jet positions (1d9e:47B8, 48C8, 4A37, 49EA, 4864) ---

/** Mount record of a position, or -1 (engine, shield, jet, boni). */
function mountOf(pos: number): number {
  if (pos === 0) return 0;
  if (pos >= 2 && pos <= 8) return pos - 1;
  return -1;
}

function catOf(pos: number): number {
  return CAT_POS.findIndex((list) => list.includes(pos));
}

function itemAt(p: Player, pos: number): number {
  const m = mountOf(pos);
  if (m >= 0) return p.mounts[m].item;
  if (pos === 1) return p.engine;
  if (pos === 9) return p.shieldType;
  if (pos === 10) return p.jet;
  return p.bonus[pos - 11] ?? 0;
}

function occupied(p: Player, pos: number): boolean {
  const m = mountOf(pos);
  if (m >= 0) return p.mounts[m].occupied;
  return pos <= 13 && itemAt(p, pos) > 0;
}

/** Does the jet have this position (DS:0x18A4 + 8 jet + mount)? Non-mount positions always exist. */
function exists(ctx: Ctx, p: Player, pos: number): boolean {
  const m = mountOf(pos);
  if (m < 0) return true;
  return p.jet > 0 && ctx.data.tables.jets[p.jet - 1].mounts[m];
}

/** 1d9e:4BE4: an outer large pod moves inward when the inner mount on its side is free (5 -> 3, 6 -> 4). */
function compactPods(p: Player): void {
  for (const [outer, inner] of [[6, 4], [5, 3]]) {
    const o = p.mounts[outer], i = p.mounts[inner];
    if (o.occupied && !i.occupied) {
      Object.assign(i, { occupied: true, item: o.item, cat: o.cat });
      Object.assign(o, { occupied: false, item: 0, cat: 0 });
    }
  }
}

/** 1d9e:7143: install an item (mounts only when free). `idx` = mount, or bonus slot for boni. */
function install(p: Player, cat: number, idx: number, id: number): void {
  if (cat === SMALL || cat === LARGE || cat === BALL) {
    const m = p.mounts[idx];
    if (!m.occupied) Object.assign(m, { occupied: true, item: id, reload: 0, loaded: true, cat });
  } else if (cat === BONI) p.bonus[idx] = id;
  else if (cat === ENGINE) p.engine = id;
  else if (cat === SHIELD) p.shieldType = id;
  else if (cat === JET) {
    p.jet = id;
    p.mounts[2] = { reload: 0, loaded: true, occupied: true, item: id, cat: STANDARD };
  }
}

// --- Drawing ---

function pointer(sh: Shop): void {
  const s = sh.ctx.screen;
  const m = sh.ctx.input.mouse;
  const [x1, y1, x2, y2] = sh.win;
  sh.mx = Math.max(x1, Math.min(x2, m.x));
  sh.my = Math.max(y1, Math.min(y2, m.y));
  s.x[1] = s.x[2] = sh.mx;
  s.y[1] = s.y[2] = sh.my;
}

function text(sh: Shop, n: number, str: string): number {
  sh.ctx.screen.makeText(n, str);
  return sh.ctx.screen.textWidth(str);
}

function moneyText(sh: Shop): void {
  const w = text(sh, T_MONEY, String(pl(sh).money));
  sh.ctx.screen.set(23, T_MONEY, 124 - (w >> 1), 122);
}

/** Header 1d9e:4288: an icon at (250 + dx, 9 + dy) and a price centred at x 257 (none for 0). */
function header(sh: Shop, sprite: number, value: number, dx = 0, dy = 0): void {
  const s = sh.ctx.screen;
  s.set(31, sprite, 250 + dx, 9 + dy);
  const w = text(sh, T_PRICE, value === 0 ? '' : String(value));
  s.set(32, T_PRICE, 257 - (w >> 1), 36);
}

function clearLines(sh: Shop): void {
  for (let k = 1; k <= 7; k++) sh.ctx.screen.n[33 + k] = 0; // 1d9e:4241
}

function line(sh: Shop, k: number, str: string): void {
  text(sh, T_LINE + k, str);
  sh.ctx.screen.set(33 + k, T_LINE + k, 203, 38 + 10 * k);
}

/** Info box 1d9e:4366 from INFO.PAS: SPEZIAL<n> (with the INFO header), or THEMA<cat> ART<id>. */
function info(sh: Shop, spezial: number, cat = 0, id = 0): void {
  const lines = sh.ctx.data.texts['INFO.PAS'];
  let body: string[] | null;
  if (spezial !== 0) {
    header(sh, INFO_ICON, 0, -17, 6);
    clearLines(sh);
    body = section(lines, 0, lines.length, `BEGIN SPEZIAL${spezial}`, `END SPEZIAL${spezial}`);
  } else {
    // The item texts don't clear the box first: a longer text before leaves its last lines (as the original).
    const start = lines.indexOf(`BEGIN THEMA${cat}`);
    const end = start < 0 ? -1 : lines.indexOf(`END THEMA${cat}`, start);
    body = start < 0 ? null : section(lines, start, end < 0 ? lines.length : end, `BEGIN ART${id}`, `END ART${id}`);
    if (body === null) body = ['Noch kein Text!']; // plus a PC-speaker beep in the original
  }
  (body ?? []).forEach((str, i) => line(sh, i + 1, str));
}

function section(lines: string[], from: number, to: number, begin: string, end: string): string[] | null {
  const i = lines.indexOf(begin, from);
  if (i < 0 || i >= to) return null;
  const out: string[] = [];
  for (let k = i + 1; k < lines.length && lines[k] !== end && lines[k] !== 'END.'; k++) out.push(lines[k]);
  return out;
}

/** "Gekauft" with "Investiert:" + price (1d9e:7504), or "Verkauft" with the refund (1d9e:54E2). */
function dealMessage(sh: Shop, bought: boolean, value: number): void {
  info(sh, bought ? 5 : 6);
  line(sh, 2, (bought ? 'Investiert:' : 'Rückzahlung: ') + value);
}

/** Highlight frames (1d9e:50A5 / 4FC7): every position of `cat` the jet has, or only `pos`, in slots 26 + count. */
function highlight(sh: Shop, cat: number, pos: number, hide = false): void {
  const s = sh.ctx.screen;
  for (let k = 0; k <= 4; k++) s.n[26 + k] = 0;
  let count = 0;
  const frameAt = (q: number) => {
    const n = q === 2 || q === 3 ? 499 : q === 0 || (q >= 4 && q <= 7) ? 497 : q === 1 || q === 8 || q === 9 ? 498 : q === 10 ? 505 : 500;
    s.set(26 + count++, hide ? 0 : n, POS_X[q], POS_Y[q]);
  };
  if (pos === NONE) {
    for (const q of CAT_POS[cat]) if (exists(sh.ctx, pl(sh), q)) frameAt(q);
  } else frameAt(pos);
}

/** The current player's jet with everything on it (1d9e:5909). */
function drawJet(sh: Shop): void {
  const s = sh.ctx.screen;
  const p = pl(sh);
  if (p.jet < 1) s.n[JET_SLOT] = 0;
  else s.set(JET_SLOT, icon(sh.ctx, JET, p.jet), JET_DX[p.jet] + POS_X[10] + 10, POS_Y[10] + 3);
  if (p.engine < 1) s.n[46] = 0;
  else s.set(46, icon(sh.ctx, ENGINE, p.engine), POS_X[1], POS_Y[1]);
  if (p.shieldType < 1) s.n[47] = 0;
  else s.set(47, icon(sh.ctx, SHIELD, p.shieldType), POS_X[9] + 1, POS_Y[9] + 1);
  p.mounts.forEach((m, k) => {
    if (!m.occupied) s.n[51 + k] = 0;
    else if (k !== 2 && icon(sh.ctx, m.cat, m.item) !== 0) {
      const q = k === 0 ? 0 : k + 1; // the position of mount k
      const [dx, dy] = iconOfs(m.cat, m.item);
      s.set(51 + k, icon(sh.ctx, m.cat, m.item), POS_X[q] + dx, POS_Y[q] + dy);
    }
  });
  s.set(53, icon(sh.ctx, STANDARD, Math.max(1, p.jet)), POS_X[3] + 1, POS_Y[3] + 1);
  p.bonus.forEach((id, k) => {
    if (id === 0) s.n[48 + k] = 0;
    else s.set(48 + k, icon(sh.ctx, BONI, id), BONI_DX[id] + POS_X[11 + k] - 1, POS_Y[11 + k] + 1);
  });
}

/** The five offer boxes of the page (1d9e:5D66); an unaffordable item gets a shadow copy over it. */
function drawOffers(sh: Shop): void {
  const s = sh.ctx.screen;
  for (let i = 1; i <= 5; i++) {
    const o = sh.offers[sh.page + i];
    s.n[7 + i] = 0;
    let label = '-------';
    if (o) {
      const [dx, dy] = iconOfs(o.cat, o.id);
      const x = OFFER_DX[o.cat] + 56 * i + dx, y = OFFER_DY[o.cat] + dy + 163;
      s.set(12 + i, icon(sh.ctx, o.cat, o.id), x, y);
      label = String(price(sh.ctx, o.cat, o.id));
      if (price(sh.ctx, o.cat, o.id) > pl(sh).money) {
        s.set(7 + i, s.n[12 + i], x, y);
        s.mode[7 + i] = MODE_SHADOW;
      }
    } else s.set(12 + i, NO_OFFER, 56 * i - 34, 161);
    const w = text(sh, T_CAT + i, label);
    s.set(17 + i, T_CAT + i, 56 * i - 7 - (w >> 1), 190);
  }
}

/** Rebuild the offers of the current category (1d9e:6216). */
function rebuildOffers(sh: Shop): void {
  const s = sh.ctx.screen;
  sh.offers = [undefined, ...offers(sh.ctx, pl(sh), sh.cat)];
  const w = text(sh, T_CAT, CAT_NAMES[sh.cat]);
  s.set(3, T_CAT, 94 - (w >> 1), 141);
  drawOffers(sh);
  clearLines(sh);
  s.n[31] = 0;
  const o = sh.sel > 0 ? sh.offers[sh.page + sh.sel] : undefined;
  if (o) {
    info(sh, 0, o.cat, o.id);
    header(sh, icon(sh.ctx, o.cat, o.id), price(sh.ctx, o.cat, o.id));
  }
  highlight(sh, sh.cat, NONE);
}

/** Hide the offers in sell and position mode (1d9e:6556). */
function hideOffers(sh: Shop): void {
  const s = sh.ctx.screen;
  for (let i = 1; i <= 5; i++) {
    s.n[12 + i] = 0;
    s.n[7 + i] = 0;
    text(sh, T_CAT + i, '             ');
    s.n[17 + i] = T_CAT + i;
  }
  for (let k = 0; k <= 4; k++) s.n[26 + k] = 0;
  s.n[3] = 0;
  s.n[24] = 0;
}

/** Load the current player (1d9e:4C75): the player number and the money. */
function showPlayer(sh: Shop): void {
  text(sh, T_PLAYER, String(sh.player + 1));
  sh.ctx.screen.set(45, T_PLAYER, 76, 122);
  moneyText(sh);
}

// --- Actions ---

/** Position under the pointer (1d9e:5373): sets pos and cat, or pos = NONE. */
function pickPosition(sh: Shop): void {
  for (let cat = 1; cat <= 7; cat++) {
    for (const q of CAT_POS[cat]) {
      if (inside(sh, [POS_X[q], POS_Y[q], POS_X[q] + CAT_W[cat], POS_Y[q] + CAT_H[cat]])) {
        sh.pos = q;
        sh.cat = cat;
        return;
      }
    }
  }
  sh.pos = NONE;
}

const modeRect = (i: number): Rect => [160 + 40 * (i - 1), 130, 188 + 40 * (i - 1), 148];

/** The current mode's button clicked again, not right after a mode change (1d9e:5311). */
const onModeButton = (sh: Shop) => inside(sh, modeRect(sh.mode)) && sh.modeWait <= 0;

/** Mode buttons (1d9e:7007). */
function modeButtons(sh: Shop): void {
  const s = sh.ctx.screen;
  for (let i = 1; i <= 4; i++) {
    if (!inside(sh, modeRect(i)) || sh.mode === i) continue;
    twice(sh.ctx, 22);
    s.set(33, MODE_FRAME, 160 + 40 * (i - 1), 130);
    sh.mode = i;
    s.n[31] = 0;
    s.n[32] = 0;
    if (i === 1) {
      sh.page = 0;
      sh.sel = 0;
      rebuildOffers(sh);
      info(sh, 3);
    } else if (i === 2) {
      hideOffers(sh);
      info(sh, 2);
      sh.pos = NONE;
    } else if (i === 3) {
      hideOffers(sh);
      info(sh, 10);
      highlight(sh, sh.cat, NONE);
    }
    s.n[32] = 0;
    sh.modeWait = 7;
  }
}

/** Category arrows (1d9e:6F7C / 6ECA). */
function categoryArrows(sh: Shop): void {
  const step = inside(sh, [36, 136, 50, 149]) ? -1 : inside(sh, [136, 136, 150, 149]) ? 1 : 0;
  if (step === 0) return;
  sh.cat = ((sh.cat - 1 + step + 7) % 7) + 1;
  twice(sh.ctx, 22);
  sh.page = 0;
  sh.sel = 0;
  sh.ctx.screen.n[24] = 0;
  rebuildOffers(sh);
  sh.ctx.screen.n[32] = 0;
  if (pl(sh).jet === 1 && sh.cat === BALL) info(sh, 8);
}

/** Offer boxes and page arrows (1d9e:67A0 / 660A). Unaffordable and empty boxes ignore clicks. */
function offerClicks(sh: Shop): void {
  const s = sh.ctx.screen;
  for (let i = 1; i <= 5; i++) {
    const o = sh.offers[sh.page + i];
    if (!o || price(sh.ctx, o.cat, o.id) > pl(sh).money) continue;
    if (!inside(sh, [56 * i - 34, 163, 56 * i + 17, 188])) continue;
    sh.sel = i;
    clearLines(sh);
    s.set(24, SELECTED, 56 * i - 34, 161);
    info(sh, 0, o.cat, o.id);
    header(sh, icon(sh.ctx, o.cat, o.id), price(sh.ctx, o.cat, o.id));
    twice(sh.ctx, 21);
  }
  const page = (d: number) => {
    sh.page += d;
    sh.sel = 0;
    s.n[24] = 0;
    twice(sh.ctx, 22);
    rebuildOffers(sh);
  };
  if (inside(sh, [301, 159, 312, 192]) && sh.offers[sh.page + 6]) page(5);
  if (inside(sh, [7, 159, 19, 192]) && sh.page > 0) page(-5);
}

function pay(sh: Shop, value: number): void {
  pl(sh).money -= value;
  moneyText(sh);
  twice(sh.ctx, 22);
}

/** Buy the selected offer (1d9e:75BE). */
function* buy(sh: Shop): Proc {
  const ctx = sh.ctx;
  const p = pl(sh);
  yield* delay(130);
  const o = sh.offers[sh.page + sh.sel];
  if (!o || sh.sel < 1) return;
  const cost = price(ctx, o.cat, o.id);
  if (cost > p.money) return;
  if (o.cat === LARGE) {
    const same = p.mounts.filter((m) => m.occupied && m.cat === LARGE && m.item === o.id).length;
    if (same >= 2) {
      twice(ctx, 23);
      info(sh, 14);
      return;
    }
    if (!CAT_POS[LARGE].some((q) => !occupied(p, q) && exists(ctx, p, q))) {
      twice(ctx, 23);
      info(sh, 7);
      do yield* frame(ctx, 15);
      while (!ctx.input.mouse.left);
    } else yield* placePod(sh, o, cost);
  } else if (o.cat === BONI) {
    if (o.id === 4) {
      p.lives += 1;
      pay(sh, cost);
      rebuildOffers(sh);
      dealMessage(sh, true, cost);
    } else if (o.id === 11) {
      pay(sh, cost);
      rebuildOffers(sh);
      dealMessage(sh, true, cost);
      ctx.saves.write(encodeSave(ctx.world)); // Save 1d9e:0350
      info(sh, 17);
    } else {
      const k = p.bonus.indexOf(0);
      if (k >= 0) {
        install(p, BONI, k, o.id);
        pay(sh, cost);
        rebuildOffers(sh);
        dealMessage(sh, true, cost);
      } else {
        twice(ctx, 23);
        info(sh, 15);
      }
    }
  } else if (o.cat === JET) {
    // The old jet is sold first (half price back), then the new one comes with its standard weapon.
    sell(sh, NONE, JET);
    install(p, JET, 0, o.id);
    pay(sh, cost);
    rebuildOffers(sh);
  } else {
    // Small pod, engine, shield, ball pod: one place each, which must be free (sell first).
    const q = CAT_POS[o.cat][0];
    if (!occupied(p, q) && exists(ctx, p, q)) {
      install(p, o.cat, mountOf(q), o.id);
      pay(sh, cost);
      rebuildOffers(sh);
      dealMessage(sh, true, cost);
    } else {
      twice(ctx, 23);
      info(sh, 13);
    }
  }
  drawJet(sh);
}

/** A bought large pod hangs on the pointer until a free mount is clicked (right button cancels). */
function* placePod(sh: Shop, o: Offer, cost: number): Proc {
  const ctx = sh.ctx;
  const s = ctx.screen;
  const p = pl(sh);
  s.n[1] = icon(ctx, LARGE, o.id);
  s.n[2] = 0;
  sh.win = PLACE_WINDOW; // (the original also moves the pointer to (95, 60); a browser can't)
  info(sh, 9);
  let done = false;
  do {
    pointer(sh);
    if (ctx.input.mouse.right) done = true;
    if (ctx.input.mouse.left) {
      pickPosition(sh);
      if (sh.pos !== NONE) {
        for (const q of CAT_POS[LARGE]) {
          if (q === sh.pos && !occupied(p, q) && !done && exists(ctx, p, q)) {
            install(p, LARGE, mountOf(q), o.id);
            pay(sh, cost);
            compactPods(p);
            rebuildOffers(sh);
            done = true;
            dealMessage(sh, true, cost);
          } else if (!done) info(sh, 4);
        }
      }
    }
    yield* frame(ctx, 13);
  } while (!done);
  sh.win = FULL_WINDOW;
  s.n[1] = POINTER;
  s.n[2] = POINTER_DOT;
}

/** Can the selected position be sold (1d9e:5165)? Shows its text and the refund. */
function sellable(sh: Shop): boolean {
  const ctx = sh.ctx;
  const p = pl(sh);
  const pos = sh.pos;
  if (pos === NONE || !occupied(p, pos)) return false;
  if (pos === 10) {
    info(sh, 1); // without a jet?
    return false;
  }
  if (pos >= 11 && pos <= 13) info(sh, 11); // boni bring a quarter
  if (pos === 3) {
    info(sh, 12); // the standard weapon stays
    return false;
  }
  const cat = catOf(pos), id = itemAt(p, pos);
  info(sh, 0, cat, id);
  header(sh, icon(ctx, cat, id), refund(sh, cat, id));
  twice(ctx, 22);
  highlight(sh, cat, pos);
  return true;
}

const refund = (sh: Shop, cat: number, id: number) => Math.trunc(price(sh.ctx, cat, id) / (cat === BONI ? 4 : 2));

/** Sell what is at `pos` (1d9e:5558): half price back, boni a quarter. */
function sell(sh: Shop, pos: number, cat: number): void {
  const p = pl(sh);
  let back = 0;
  if (cat === SMALL || cat === LARGE || cat === BALL) {
    const m = p.mounts[mountOf(pos)];
    back = refund(sh, cat, m.item);
    Object.assign(m, { occupied: false, item: 0, cat: 0 });
    compactPods(p);
  } else if (cat === BONI) {
    const k = pos - 11;
    back = refund(sh, cat, p.bonus[k]);
    p.bonus[k] = 0;
    for (let j = 0; j <= 1; j++) {
      if (p.bonus[j] === 0 && p.bonus[j + 1] !== 0) [p.bonus[j], p.bonus[j + 1]] = [p.bonus[j + 1], 0];
    }
  } else if (cat === ENGINE) {
    back = refund(sh, cat, p.engine);
    p.engine = 0;
  } else if (cat === SHIELD) {
    back = refund(sh, cat, p.shieldType);
    p.shieldType = 0;
  } else if (cat === JET) {
    back = refund(sh, cat, p.jet);
    p.jet = 0;
  }
  p.money += back;
  dealMessage(sh, false, back);
  moneyText(sh);
}

/** Position change (1d9e:811F): the large pod at `pos` hangs on the pointer until it is put on a mount. */
function* swapPod(sh: Shop, pos: number): Proc {
  const ctx = sh.ctx;
  const s = ctx.screen;
  const p = pl(sh);
  const m = p.mounts[mountOf(pos)];
  let hand = m.item;
  Object.assign(m, { item: 0, cat: 0, occupied: false });
  drawJet(sh);
  twice(ctx, 22);
  yield* delay(200);
  s.n[1] = icon(ctx, LARGE, hand);
  s.n[2] = 0;
  sh.win = PLACE_WINDOW;
  let done = false;
  do {
    pointer(sh);
    if (ctx.input.mouse.right && hand === 0) done = true; // (never: the hand is never empty here)
    if (ctx.input.mouse.left) {
      pickPosition(sh);
      if (occupied(p, sh.pos) && catOf(sh.pos) === LARGE) {
        // Swap with the pod there.
        const t = p.mounts[mountOf(sh.pos)];
        const took = t.item;
        Object.assign(t, { item: hand, cat: LARGE, occupied: true });
        s.n[1] = icon(ctx, LARGE, took);
        compactPods(p);
        drawJet(sh);
        twice(ctx, 22);
        yield* frame(ctx, 200);
        hand = took;
      }
      if (!occupied(p, sh.pos) && catOf(sh.pos) === LARGE && exists(ctx, p, sh.pos)) {
        Object.assign(p.mounts[mountOf(sh.pos)], { item: hand, cat: LARGE, occupied: true });
        twice(ctx, 22);
        hand = 0;
        done = true;
        yield* frame(ctx, 200);
      }
    }
    yield* frame(ctx, 13);
  } while (!done);
  compactPods(p);
  drawJet(sh);
  sh.win = FULL_WINDOW;
  s.n[1] = POINTER;
  s.n[2] = POINTER_DOT;
}

/** Player switch (1d9e:4AF0): only in a two-player game; a dead partner gets SPEZIAL16. */
function switchPlayer(sh: Shop): boolean {
  const w = sh.ctx.world;
  if (!inside(sh, [43, 120, 83, 130]) || !w.twoPlayer) return false;
  const other = 1 - sh.player;
  if (w.players[other].active) {
    sh.player = other;
    twice(sh.ctx, 22);
    return true;
  }
  info(sh, 16);
  twice(sh.ctx, 23);
  return false;
}

/** Money exchange (1d9e:6A7E): both players' money, arrows move min(money, step) to the other one. */
function* exchange(sh: Shop): Proc {
  const ctx = sh.ctx;
  const s = ctx.screen;
  const [p1, p2] = ctx.world.players;
  playSound(ctx, 22);
  if (!p1.active || !p2.active) {
    playSound(ctx, 23);
    return;
  }
  sh.sel = 0;
  sh.page = 0;
  drawJet(sh);
  s.n[31] = 0;
  yield* delay(200);
  s.set(61, EXCHANGE_PANEL, 203, 51);
  header(sh, EXCHANGE_EXIT, 0, -19, -2);
  sh.win = EXCHANGE_WINDOW; // (the pointer also jumps to (110, 50) in the original)
  let step = 3;
  const moneys = () => {
    const w1 = text(sh, T_MONEY, String(p1.money));
    s.set(62, T_MONEY, 231 - (w1 >> 1), 62);
    const w2 = text(sh, T_MONEY2, String(p2.money));
    s.set(63, T_MONEY2, 280 - (w2 >> 1), 96);
    s.set(23, sh.player === 0 ? T_MONEY : T_MONEY2, 124 - (w1 >> 1), 122); // (centred on P1's amount)
    s.n[32] = 0;
  };
  const stepText = () => {
    text(sh, T_STEP, String(STEPS[step]));
    s.set(25, T_STEP, 240, 79);
    s.n[32] = 0;
  };
  moneys();
  stepText();
  clearLines(sh);
  s.n[32] = 0;
  const move = function* (from: Player, to: Player): Proc {
    if (from.money <= 0) {
      playSound(ctx, 23);
      yield* delay(100);
      return;
    }
    playSound(ctx, 22);
    const amount = Math.min(from.money, STEPS[step]);
    from.money -= amount;
    to.money += amount;
    moneys();
  };
  do {
    pointer(sh);
    if (ctx.input.mouse.down) {
      if (inside(sh, [277, 60, 289, 71])) yield* move(p1, p2);
      if (inside(sh, [221, 93, 232, 104])) yield* move(p2, p1);
      if (inside(sh, [265, 77, 272, 81])) {
        if (step < 4) {
          playSound(ctx, 22);
          step += 1;
        } else playSound(ctx, 23);
        stepText();
        yield* delay(200);
      }
      if (inside(sh, [265, 82, 272, 86])) {
        if (step < 2) playSound(ctx, 23);
        else {
          step -= 1;
          playSound(ctx, 22);
        }
        stepText();
        yield* delay(200);
      }
    }
    yield DRAW_MS + 13; // Animate + Delay(13), without the sprite cycles
  } while (!(hitDetectIn(ctx.data, s, 31, 1) && ctx.input.mouse.down));
  playSound(ctx, 22);
  sh.win = FULL_WINDOW;
  info(sh, 3);
  for (const slot of [61, 62, 63, 25, 31]) s.n[slot] = 0;
  moneyText(sh);
  drawJet(sh);
  if (sh.mode === 1) rebuildOffers(sh);
}

// --- The screen ---

export function* shop(ctx: Ctx): Proc {
  const s = ctx.screen;
  const w = ctx.world;
  ctx.view = 'screen';
  // (A mouse button still held on entry beeps on the PC speaker in the original.)
  s.picture = 'RASTER';
  s.font = 'DEFAULT';
  s.ink = INK;
  s.palette = 'EPIS1';
  s.clear();
  s.set(64, PANEL, 3, 3);
  const sh: Shop = {
    ctx, player: w.players[0].active ? 0 : 1, mode: 1, cat: LARGE, page: 0, sel: 0, pos: NONE, offers: [],
    win: FULL_WINDOW, mx: 0, my: 0, clickWait: 0, modeWait: 0,
  };
  showPlayer(sh);
  s.set(1, POINTER, 0, 0);
  s.set(2, POINTER_DOT, 0, 0);
  pointer(sh);
  s.set(24, 0, 0, 161);
  drawJet(sh);
  s.set(33, MODE_FRAME, 160, 130);
  rebuildOffers(sh);
  info(sh, 3);
  yield* fadeIn(ctx);
  let leave = false;
  while (!leave) {
    pointer(sh);
    if (sh.clickWait > 0) sh.clickWait -= 1;
    if (ctx.input.mouse.down && sh.clickWait === 0) {
      if (inside(sh, [145, 101, 177, 119])) yield* exchange(sh);
      if (switchPlayer(sh)) {
        showPlayer(sh);
        drawJet(sh);
        if (sh.mode === 1) rebuildOffers(sh);
      }
      modeButtons(sh);
      if (sh.mode === 1) {
        categoryArrows(sh);
        offerClicks(sh);
        if (onModeButton(sh)) {
          yield* delay(130);
          yield* buy(sh);
        }
      }
      if (sh.mode === 2) {
        if (!onModeButton(sh)) pickPosition(sh);
        if (sellable(sh) && onModeButton(sh)) {
          sell(sh, sh.pos, sh.cat);
          s.n[31] = 0;
          s.n[32] = 0;
          drawJet(sh);
          highlight(sh, sh.cat, sh.pos, true);
        }
      }
      if (sh.mode === 3) {
        pickPosition(sh);
        if (occupied(pl(sh), sh.pos) && catOf(sh.pos) === LARGE) yield* swapPod(sh, sh.pos);
      }
      if (sh.mode === 4) leave = true;
      sh.clickWait = 10;
    }
    if (sh.modeWait > 0) sh.modeWait -= 1;
    yield* frame(ctx, 15);
  }
  while (ctx.input.mouse.down) yield* delay(10);
  s.mode.fill(0);
}
