// Touch controls (the remake's control type 5, for phones and tablets): an HTML overlay beside the 320 x 200
// view. A floating stick on the left gives the joystick's direction flags (handled like the keyboard and
// joystick @0x1A1DD / 0x1A58F: accelerate while held, slow down every 4th tick), buttons on the right fire,
// toggle the altitude, select and use a bonus. Screens offer extra buttons that act as keys (pause, Esc,
// paging, Ja/Nein, the hangar's cheat) through Ctx.touchKeys. The menus themselves take taps on the canvas as
// mouse clicks.

import { NO_INPUT, type PlayerInput } from '../sim/state';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** A key a screen offers as a touch button (KeyboardEvent.code and its label). */
export interface TouchKey {
  code: string;
  label: string;
}

export interface TouchLayout {
  /** Where the view draws the 320 x 200 picture (16:10, CSS pixels). */
  game: Rect;
  /** The stick's resting place (bottom left) and the button column (bottom right). */
  left: Rect;
  right: Rect;
  /** First key button (top left in landscape, below the game in portrait) and the direction they stack in. */
  keys: { x: number; y: number; dx: number; dy: number };
  /** Top right: the fullscreen button, then the remaster switch to its left (`size` px each, `cornerButtons`). */
  corner: { x: number; y: number; dx: number; size: number };
  unit: number; // a small button's size in CSS pixels
}

const W = 320;
const H = 200;

/**
 * The controls go into the bottom corners, the game into the rest: beside them in landscape (phones have
 * room left and right of a 16:10 picture), above them in portrait, whichever gives the larger picture.
 */
export function touchLayout(vw: number, vh: number, inset: Insets, cornerButtons = 2): TouchLayout {
  const unit = Math.round(Math.max(36, Math.min(60, Math.min(vw, vh) * 0.12)));
  const m = Math.round(unit * 0.25);
  const cw = Math.round(unit * 1.5); // the fire button's size
  const ch = cw + 3 * (unit + m); // fire, altitude, select, use stacked
  const side = Math.max(inset.l, inset.r) + cw + 2 * m;
  const beside: Rect = { x: side, y: inset.t, w: vw - 2 * side, h: vh - inset.t - inset.b };
  const below = ch + 2 * m + inset.b;
  const above: Rect = { x: inset.l, y: inset.t, w: vw - inset.l - inset.r, h: vh - inset.t - below - unit - m };
  const scale = (r: Rect) => Math.max(0, Math.min(r.w / W, r.h / H));
  const landscape = scale(beside) >= scale(above);
  const area = landscape ? beside : above;
  const s = scale(area);
  const game = { x: area.x + (area.w - W * s) / 2, y: area.y + (area.h - H * s) / 2, w: W * s, h: H * s };
  const y = vh - inset.b - m - ch;
  // landscape: key buttons down the left column, fullscreen top right; portrait: a row below the game
  const row = game.y + game.h + m;
  // The corner buttons stand centred over the button column where there is room (a single one always fits).
  // Landscape: side by side in the strip right of the picture, smaller where it is narrow (the fire column
  // below leaves no room to stack them).
  const column = vw - inset.r - m - cw / 2;
  const sideCorner = () => {
    const g = Math.round(m / 2);
    const strip = vw - inset.r - (game.x + game.w);
    const size = Math.max(24, Math.min(unit, Math.floor((strip - (cornerButtons + 1) * g) / cornerButtons)));
    const min = game.x + game.w + g + (cornerButtons - 1) * (size + g);
    const x = Math.max(min, Math.min(vw - inset.r - g - size, Math.round(column - size / 2)));
    return { x, y: inset.t + m, dx: -(size + g), size };
  };
  return {
    game,
    left: { x: inset.l + m, y, w: cw, h: ch },
    right: { x: vw - inset.r - m - cw, y, w: cw, h: ch },
    keys: landscape
      ? { x: inset.l + m + (cw - unit) / 2, y: inset.t + m, dx: 0, dy: unit + m }
      : { x: inset.l + m, y: row, dx: unit + m, dy: 0 },
    corner: landscape ? sideCorner() : { x: Math.round(column - unit / 2), y: row, dx: -(unit + m), size: unit },
    unit,
  };
}

/** The stick's direction flags: each axis counts once the knob is past 35 % of the radius (8 directions). */
export function stickDirections(dx: number, dy: number, radius: number) {
  const dead = radius * 0.35;
  return { left: dx < -dead, right: dx > dead, up: dy < -dead, down: dy > dead };
}

const BUTTONS = [
  { id: 'fire', label: 'Feuer', big: true },
  { id: 'altitude', label: 'Höhe', big: false },
  { id: 'select', label: 'Bonus<br>wählen', big: false },
  { id: 'use', label: 'Bonus<br>feuern', big: false },
] as const;
export type ButtonId = (typeof BUTTONS)[number]['id'];
const DOUBLE_TAP_MS = 300; // a double tap on Feuer locks autofire, the next tap releases it

const CSS = `
#touch { position: fixed; inset: 0; pointer-events: none; z-index: 2; font-weight: bold; font-family: sans-serif;
  color: rgba(255,255,255,.75); user-select: none; -webkit-user-select: none; touch-action: none; }
#touch.play { pointer-events: auto; }
#touch .b { position: absolute; box-sizing: border-box; border-radius: 50%; display: flex; align-items: center;
  justify-content: center; text-align: center; line-height: 1.1; background: rgba(255,255,255,.12);
  border: 2px solid rgba(255,255,255,.35); pointer-events: auto; }
#touch .b.on { background: rgba(255,200,80,.45); border-color: rgba(255,220,120,.9); color: #fff; }
#touch .b.lock { border-color: rgba(255,120,60,.95); box-shadow: 0 0 10px rgba(255,120,60,.8); }
#touch .b[hidden], #touch .stick[hidden] { display: none; }
#touch .stick { position: absolute; border-radius: 50%; box-sizing: border-box; pointer-events: none;
  border: 2px solid rgba(255,255,255,.3); background: rgba(255,255,255,.06); }
#touch .knob { position: absolute; border-radius: 50%; background: rgba(255,255,255,.35); pointer-events: none; }
`;

interface Hold {
  role: 'stick' | 'button' | 'key';
  code?: string; // the button or key held (a game button can change as the finger slides)
  x0: number; // stick: the base centre
  y0: number;
}

export class TouchControls {
  readonly root = document.createElement('div');
  private layoutNow: TouchLayout | null = null;
  private readonly buttons = new Map<ButtonId, HTMLElement>();
  private readonly base = document.createElement('div');
  private readonly knob = document.createElement('div');
  private readonly keyEls: HTMLElement[] = [];
  private readonly fullscreen = document.createElement('div');
  private readonly remaster = document.createElement('div');
  private remastered = false;
  private remasterShown = true;
  /** How many of the top right buttons (fullscreen, remaster switch) there are, for touchLayout. */
  readonly cornerButtons: number;
  private readonly holds = new Map<number, Hold>(); // by pointerId
  private dirs = { left: false, right: false, up: false, down: false };
  private down = new Set<string>(); // buttons and keys held now
  private tapped = new Set<string>(); // pressed since the last sample
  private sampled = new Set<string>();
  private keys: readonly TouchKey[] = [];
  private playing = false;
  private autofire = false;
  private lastFireTap = -Infinity;
  private radius = 50;

  /** `only`: the game buttons to show (all by default; the prototype in src/sly/ has only Feuer). */
  constructor(parent: HTMLElement, onFullscreen?: () => void, onRemaster?: () => void, private readonly only?: readonly ButtonId[]) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.id = 'touch';
    for (const b of BUTTONS) {
      const el = document.createElement('div');
      el.className = 'b';
      el.innerHTML = b.label;
      el.hidden = true;
      this.buttons.set(b.id, el);
      this.root.appendChild(el);
    }
    this.base.className = 'stick';
    this.knob.className = 'knob';
    this.base.appendChild(this.knob);
    this.root.appendChild(this.base);
    if (onFullscreen && document.fullscreenEnabled) {
      this.fullscreen.className = 'b';
      this.fullscreen.textContent = '⛶';
      this.fullscreen.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        onFullscreen();
      });
      this.root.appendChild(this.fullscreen);
    }
    if (onRemaster) {
      this.remaster.className = 'b';
      this.remaster.textContent = 'HD';
      this.remaster.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        onRemaster();
      });
      this.root.appendChild(this.remaster);
    }
    this.cornerButtons = [this.fullscreen, this.remaster].filter((el) => el.parentElement).length;
    parent.appendChild(this.root);
    // In a level the overlay takes every touch (stick anywhere on the left, the buttons by position, so a
    // finger can slide from one button to the next); in the menus only the buttons themselves.
    this.root.addEventListener('pointerdown', (e) => this.press(e));
    this.root.addEventListener('pointermove', (e) => this.move(e));
    for (const type of ['pointerup', 'pointercancel'] as const) this.root.addEventListener(type, (e) => this.release(e));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll());
  }

  /**
   * Per frame: whether a touch player is in a level, the keys the screen offers, the layout, the graphics
   * setting and whether the remaster switch shows.
   */
  update(playing: boolean, keys: readonly TouchKey[], layout: TouchLayout, remastered = false, remasterShown = true): void {
    this.remastered = remastered;
    this.remasterShown = remasterShown;
    if (playing !== this.playing) {
      this.playing = playing;
      this.root.classList.toggle('play', playing);
      if (!playing) {
        this.releaseAll();
        this.autofire = false;
      }
    }
    if (keys !== this.keys) {
      this.keys = keys;
      for (const code of [...this.down]) if (!BUTTONS.some((b) => b.id === code)) this.down.delete(code);
    }
    this.layoutNow = layout;
    this.place();
  }

  /** Take the buttons for the next tick: held now, or pressed since the last sample. */
  sample(): void {
    this.sampled = new Set([...this.down, ...this.tapped]);
    this.tapped.clear();
  }

  /** The touch player's flags (device 5: the keyboard/joystick movement). */
  player(): PlayerInput {
    const on = (id: ButtonId) => this.sampled.has(id);
    return {
      ...NO_INPUT, device: 5, ...this.dirs,
      fire: on('fire') || this.autofire, altitude: on('altitude'), select: on('select'), use: on('use'),
    };
  }

  /** A key button (KeyboardEvent.code) is held. */
  held(code: string): boolean {
    return this.sampled.has(code) && this.keys.some((k) => k.code === code);
  }

  anyKey(): boolean {
    return this.keys.some((k) => this.sampled.has(k.code));
  }

  private place(): void {
    const l = this.layoutNow;
    if (!l) return;
    const u = l.unit;
    const r = l.right;
    this.root.style.fontSize = `${Math.round(u * 0.24)}px`; // "Bonus wählen" fits a small button
    const put = (el: HTMLElement, x: number, y: number, size: number) => {
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
    };
    // Feuer at the bottom, the others above it; the column is the fire button's width.
    const gap = Math.round(u * 0.25);
    let y = r.y + r.h - r.w;
    for (const b of BUTTONS) {
      const el = this.buttons.get(b.id)!;
      el.hidden = !this.playing || (this.only !== undefined && !this.only.includes(b.id));
      const size = b.big ? r.w : u;
      if (!b.big) y -= u + gap;
      put(el, r.x + (r.w - size) / 2, y, size);
      el.classList.toggle('on', this.down.has(b.id));
      if (b.id === 'fire') el.classList.toggle('lock', this.autofire);
    }
    // The key buttons, created as needed.
    while (this.keyEls.length < this.keys.length) {
      const el = document.createElement('div');
      el.className = 'b';
      this.keyEls.push(el);
      this.root.appendChild(el);
    }
    this.keyEls.forEach((el, i) => {
      const k = this.keys[i];
      el.hidden = k === undefined;
      if (!k) return;
      if (el.dataset.code !== k.code) {
        el.dataset.code = k.code;
        el.textContent = k.label;
      }
      put(el, l.keys.x + i * l.keys.dx, l.keys.y + i * l.keys.dy, u);
      el.classList.toggle('on', this.down.has(k.code));
    });
    let corner = 0; // the top right buttons, right to left
    for (const el of [this.fullscreen, this.remaster]) {
      if (!el.parentElement) continue;
      put(el, l.corner.x + corner * l.corner.dx, l.corner.y, l.corner.size);
      corner++;
    }
    this.fullscreen.style.fontSize = `${Math.round(l.corner.size * 0.45)}px`;
    this.remaster.style.fontSize = `${Math.round(l.corner.size * 0.34)}px`;
    this.remaster.classList.toggle('on', this.remastered);
    this.remaster.hidden = !this.remasterShown;
    // The stick: where the thumb holds it, else a faint resting place in the left corner.
    this.radius = Math.round(l.left.w * 0.6);
    const hold = [...this.holds.values()].find((h) => h.role === 'stick');
    this.base.hidden = !this.playing;
    const cx = hold ? hold.x0 : l.left.x + l.left.w / 2;
    const cy = hold ? hold.y0 : l.left.y + l.left.h - this.radius;
    put(this.base, cx - this.radius, cy - this.radius, 2 * this.radius);
    this.base.style.opacity = hold ? '1' : '.5';
    const k = Math.round(this.radius * 0.8);
    const kx = this.knobX, ky = this.knobY;
    put(this.knob, this.radius - k / 2 + kx - 2, this.radius - k / 2 + ky - 2, k);
  }

  private knobX = 0;
  private knobY = 0;

  /** The game button under a point (with a margin, so a finger slightly off still counts). */
  private buttonAt(x: number, y: number): ButtonId | undefined {
    const slack = (this.layoutNow?.unit ?? 40) * 0.2;
    for (const b of BUTTONS) {
      const el = this.buttons.get(b.id)!;
      if (el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left - slack && x <= r.right + slack && y >= r.top - slack && y <= r.bottom + slack) return b.id;
    }
    return undefined;
  }

  private keyAt(target: EventTarget | null): string | undefined {
    const i = this.keyEls.indexOf(target as HTMLElement);
    return i >= 0 ? this.keys[i]?.code : undefined;
  }

  private press(e: PointerEvent): void {
    const key = this.keyAt(e.target);
    if (key) {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      this.holds.set(e.pointerId, { role: 'key', code: key, x0: 0, y0: 0 });
      this.hold(key);
      this.place();
      return;
    }
    if (!this.playing || e.target === this.fullscreen || e.target === this.remaster) return;
    e.preventDefault();
    this.root.setPointerCapture(e.pointerId);
    const button = this.buttonAt(e.clientX, e.clientY);
    if (button) {
      this.holds.set(e.pointerId, { role: 'button', code: button, x0: 0, y0: 0 });
      this.hold(button);
      if (button === 'fire') {
        if (this.autofire) this.autofire = false;
        else if (e.timeStamp - this.lastFireTap < DOUBLE_TAP_MS) this.autofire = true;
        this.lastFireTap = e.timeStamp;
      }
    } else if (e.clientX < window.innerWidth * 0.5 && ![...this.holds.values()].some((h) => h.role === 'stick')) {
      // The stick's base appears under the thumb (kept inside the screen).
      const r = this.radius;
      const x0 = Math.max(r, Math.min(window.innerWidth - r, e.clientX));
      const y0 = Math.max(r, Math.min(window.innerHeight - r, e.clientY));
      this.holds.set(e.pointerId, { role: 'stick', x0, y0 });
      this.steer(e.pointerId, e.clientX, e.clientY);
    }
    this.place();
  }

  private move(e: PointerEvent): void {
    const h = this.holds.get(e.pointerId);
    if (!h) return;
    if (h.role === 'stick') this.steer(e.pointerId, e.clientX, e.clientY);
    else if (h.role === 'button') {
      // Sliding to another game button presses that one instead.
      const now = this.buttonAt(e.clientX, e.clientY);
      if (now !== h.code) {
        if (h.code) this.unhold(h.code);
        h.code = now;
        if (now) this.hold(now);
      }
    }
    this.place();
  }

  private release(e: PointerEvent): void {
    const h = this.holds.get(e.pointerId);
    if (!h) return;
    this.holds.delete(e.pointerId);
    if (h.role === 'stick') {
      this.dirs = { left: false, right: false, up: false, down: false };
      this.knobX = this.knobY = 0;
    } else if (h.code) this.unhold(h.code);
    this.place();
  }

  /** The knob follows the thumb up to the radius; beyond it the base is dragged along. */
  private steer(id: number, x: number, y: number): void {
    const h = this.holds.get(id)!;
    const r = this.radius;
    let dx = x - h.x0, dy = y - h.y0;
    const d = Math.hypot(dx, dy);
    if (d > r) {
      h.x0 = x - (dx * r) / d;
      h.y0 = y - (dy * r) / d;
      dx = x - h.x0;
      dy = y - h.y0;
    }
    this.knobX = dx;
    this.knobY = dy;
    this.dirs = stickDirections(dx, dy, r);
  }

  private hold(code: string): void {
    this.down.add(code);
    this.tapped.add(code);
  }

  private unhold(code: string): void {
    // another finger may still hold it
    if (![...this.holds.values()].some((h) => h.code === code)) this.down.delete(code);
  }

  private releaseAll(): void {
    this.holds.clear();
    this.down.clear();
    this.dirs = { left: false, right: false, up: false, down: false };
    this.knobX = this.knobY = 0;
  }
}
