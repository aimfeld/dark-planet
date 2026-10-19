// Shows the classic framebuffer with PixiJS: palette applied on the CPU, integer nearest-neighbour scale.

import { Application, Sprite, Texture } from 'pixi.js';
import type { GameData } from '../data';
import type { World } from '../sim/state';
import { FADE_STEPS } from '../sim/state';
import { flashLut, Framebuffer, H, paletteLut, W } from './framebuffer';

export class ClassicView {
  private readonly fb: Framebuffer;
  private readonly luts: Uint32Array[]; // per fade level
  private readonly flash = flashLut();
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly rgba: Uint32Array;
  private readonly texture: Texture;
  private readonly sprite: Sprite;

  private constructor(private readonly app: Application, data: GameData) {
    this.fb = new Framebuffer(data);
    this.luts = Array.from({ length: FADE_STEPS + 1 }, (_, f) => paletteLut(data, f));
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(W, H);
    this.rgba = new Uint32Array(this.image.data.buffer);
    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.texture);
    app.stage.addChild(this.sprite);
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

  /** Largest integer scale that fits the window (in device pixels, so every source pixel stays sharp). */
  private layout(): void {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.max(1, Math.floor(Math.min((window.innerWidth * dpr) / W, (window.innerHeight * dpr) / H)));
    this.sprite.scale.set(scale / dpr);
    this.sprite.x = Math.floor((window.innerWidth - (W * scale) / dpr) / 2);
    this.sprite.y = Math.floor((window.innerHeight - (H * scale) / dpr) / 2);
  }

  draw(w: World): void {
    this.fb.render(w);
    this.present(w.flash ? this.flash : this.luts[Math.max(0, Math.min(FADE_STEPS, w.fade))]);
  }

  /** A placeholder text screen (see Framebuffer.renderScreen). */
  drawScreen(lines: [string, number][]): void {
    this.fb.renderScreen(lines);
    this.present(this.luts[FADE_STEPS]);
  }

  private present(lut: Uint32Array): void {
    const px = this.fb.px, rgba = this.rgba;
    for (let i = 0; i < px.length; i++) rgba[i] = lut[px[i]];
    this.ctx.putImageData(this.image, 0, 0);
    this.texture.source.update();
    this.app.render();
  }
}
