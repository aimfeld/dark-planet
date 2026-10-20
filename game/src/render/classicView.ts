// Shows the classic framebuffer with PixiJS: palette applied on the CPU, integer nearest-neighbour scale.
// With touch controls the picture fills the place they leave free instead (phones have no pixels to spare).

import { Application, Sprite, Texture } from 'pixi.js';
import type { GameData } from '../data';
import type { Rect } from '../input/touch';
import type { PaletteName, Screen } from '../screens/screen';
import type { World } from '../sim/state';
import { FADE_STEPS } from '../sim/state';
import { flashLut, Framebuffer, H, paletteLut, W } from './framebuffer';
import { HiResView } from './hiResView';

export class ClassicView {
  private readonly fb: Framebuffer;
  private readonly luts: Record<PaletteName, Uint32Array[]>; // per palette and fade level
  private readonly flash = flashLut();
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly rgba: Uint32Array;
  private readonly texture: Texture;
  private readonly sprite: Sprite;
  private area: Rect | null = null;
  private below = 0; // CSS pixels kept free under the integer-scaled picture (the key legend)
  /** The remastered renderer (experiment): draws levels while it has a method, the menus stay classic. */
  readonly hiRes: HiResView;

  private constructor(private readonly app: Application, data: GameData) {
    this.fb = new Framebuffer(data);
    const levels = (name: PaletteName) => Array.from({ length: FADE_STEPS + 1 }, (_, f) => paletteLut(data, f, name));
    this.luts = { EPIS1: levels('EPIS1'), HMBILD: levels('HMBILD'), UMBILD: levels('UMBILD') };
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(W, H);
    this.rgba = new Uint32Array(this.image.data.buffer);
    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.texture);
    app.stage.addChild(this.sprite);
    this.hiRes = new HiResView(data);
    this.hiRes.root.visible = false;
    app.stage.addChild(this.hiRes.root);
    app.canvas.style.cursor = 'none'; // the hangar and the shop draw their own pointer sprite
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  static async create(parent: HTMLElement, data: GameData): Promise<ClassicView> {
    const app = new Application();
    // autoStart off: the game loop renders once per animation frame, after the simulation ticks
    await app.init({ resizeTo: window, background: '#000000', antialias: false, autoDensity: true,
      resolution: window.devicePixelRatio || 1, autoStart: false });
    parent.appendChild(app.canvas);
    return new ClassicView(app, data);
  }

  /** Draw the picture into `area` (CSS pixels, 16:10), or integer-scaled in the middle of the window (null). */
  setArea(area: Rect | null): void {
    const a = this.area;
    if (a === area || (a && area && a.x === area.x && a.y === area.y && a.w === area.w && a.h === area.h)) return;
    this.area = area && { ...area };
    this.layout();
  }

  /** Keep `h` CSS pixels free below the integer-scaled picture. */
  setBelow(h: number): void {
    if (h === this.below) return;
    this.below = h;
    this.layout();
  }

  /** Where the picture is (CSS pixels). */
  get picture(): Rect {
    const scale = this.sprite.scale.x;
    return { x: this.sprite.x, y: this.sprite.y, w: W * scale, h: H * scale };
  }

  /** Largest integer scale that fits the window (in device pixels, so every source pixel stays sharp). */
  private layout(): void {
    this.placeSprite();
    const r = this.hiRes.root;
    r.scale.set(this.sprite.scale.x / 4);
    r.position.set(this.sprite.x, this.sprite.y);
  }

  private placeSprite(): void {
    if (this.area) {
      this.sprite.scale.set(this.area.w / W);
      this.sprite.x = this.area.x;
      this.sprite.y = this.area.y;
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const height = window.innerHeight - this.below;
    const scale = Math.max(1, Math.floor(Math.min((window.innerWidth * dpr) / W, (height * dpr) / H)));
    this.sprite.scale.set(scale / dpr);
    this.sprite.x = Math.floor((window.innerWidth - (W * scale) / dpr) / 2);
    this.sprite.y = Math.max(0, Math.floor((height - (H * scale) / dpr) / 2));
  }

  /** The canvas element (for pointer input). */
  get element(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /** Client coordinates to 320 x 200 screen pixels. */
  toScreen(cx: number, cy: number): [number, number] {
    const scale = this.sprite.scale.x;
    return [(cx - this.sprite.x) / scale, (cy - this.sprite.y) / scale];
  }

  /** A level; `alpha` (0..1) is how far the frame lies between the last two ticks (remastered view only). */
  draw(w: World, alpha = 1): void {
    if (this.showHiRes(this.hiRes.current !== null && this.hiRes.draw(w, alpha))) return;
    this.fb.render(w);
    this.present(w.flash ? this.flash : this.lut('EPIS1', w.fade));
  }

  /** A menu screen (main menu, text viewer, hangar, options). */
  drawScreen(sc: Screen, alpha = 1): void {
    if (this.showHiRes(this.hiRes.current !== null && this.hiRes.drawScreen(sc, alpha))) return;
    this.fb.renderScreen(sc);
    this.present(this.lut(sc.palette, sc.fade));
  }

  /** A video frame (2 x 2 pixels per source pixel), sampled down to the 320 x 200 view. */
  drawVideo(video: HTMLVideoElement): void {
    this.showHiRes(false);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, W, H);
    if (video.readyState >= 2) this.ctx.drawImage(video, 0, 0, W, H);
    this.texture.source.update();
    this.app.render();
  }

  /** Show the remastered picture (rendered at once) or the classic one (the caller presents it). */
  private showHiRes(on: boolean): boolean {
    this.hiRes.root.visible = on;
    this.sprite.visible = !on;
    if (on) this.app.render();
    return on;
  }

  private lut(name: PaletteName, fade: number): Uint32Array {
    return this.luts[name][Math.max(0, Math.min(FADE_STEPS, fade))];
  }

  private present(lut: Uint32Array): void {
    const px = this.fb.px, rgba = this.rgba;
    for (let i = 0; i < px.length; i++) rgba[i] = lut[px[i]];
    this.ctx.putImageData(this.image, 0, 0);
    this.texture.source.update();
    this.app.render();
  }
}
