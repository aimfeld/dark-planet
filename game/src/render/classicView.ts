// Shows the classic framebuffer with PixiJS: palette applied on the CPU, integer nearest-neighbour scale.

import { Application, Sprite, Texture } from 'pixi.js';
import type { GameData } from '../data';
import type { World } from '../sim/state';
import { Framebuffer, H, paletteLut, W } from './framebuffer';

export class ClassicView {
  private readonly fb: Framebuffer;
  private readonly lut: Uint32Array;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly rgba: Uint32Array;
  private readonly texture: Texture;
  private readonly sprite: Sprite;

  private constructor(private readonly app: Application, data: GameData) {
    this.fb = new Framebuffer(data);
    this.lut = paletteLut(data);
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
    const px = this.fb.px, rgba = this.rgba, lut = this.lut;
    for (let i = 0; i < px.length; i++) rgba[i] = lut[px[i]];
    this.ctx.putImageData(this.image, 0, 0);
    this.texture.source.update();
    this.app.render();
  }
}
