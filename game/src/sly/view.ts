// Shows the prototype's framebuffer on a 2D canvas, integer-scaled with square pixels like the main game (or in
// the place the touch controls leave free).

import type { Rect } from '../input/touch';
import type { SlyData } from './data';
import { H, SlyFramebuffer, W } from './framebuffer';
import type { Sly } from './sim';

export class SlyView {
  private readonly fb: SlyFramebuffer;
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly rgba: Uint32Array;
  private area: Rect | null = null;
  private below = 0;

  constructor(parent: HTMLElement, data: SlyData) {
    this.fb = new SlyFramebuffer(data);
    this.canvas.width = W;
    this.canvas.height = H;
    Object.assign(this.canvas.style, { position: 'absolute', imageRendering: 'pixelated' });
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(W, H);
    this.rgba = new Uint32Array(this.image.data.buffer);
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  /** Draw into `area` (CSS pixels, 16:10; touch controls), or integer-scaled in the middle of the window (null). */
  setArea(area: Rect | null): void {
    const a = this.area;
    if (a === area || (a && area && a.x === area.x && a.y === area.y && a.w === area.w && a.h === area.h)) return;
    this.area = area && { ...area };
    this.layout();
  }

  /** Keep `h` CSS pixels free below the integer-scaled picture (the key legend). */
  setBelow(h: number): void {
    if (h === this.below) return;
    this.below = h;
    this.layout();
  }

  /** Where the picture is (CSS pixels). */
  get picture(): Rect {
    const s = this.canvas.style;
    return { x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) };
  }

  private layout(): void {
    let x: number, y: number, scale: number;
    if (this.area) {
      ({ x, y } = this.area);
      scale = this.area.w / W;
    } else {
      // the largest integer scale in device pixels, so every pixel stays sharp
      const dpr = window.devicePixelRatio || 1;
      const height = window.innerHeight - this.below;
      scale = Math.max(1, Math.floor(Math.min((window.innerWidth * dpr) / W, (height * dpr) / H))) / dpr;
      x = Math.floor((window.innerWidth - W * scale) / 2);
      y = Math.max(0, Math.floor((height - H * scale) / 2));
    }
    Object.assign(this.canvas.style, { left: `${x}px`, top: `${y}px`, width: `${W * scale}px`, height: `${H * scale}px` });
  }

  draw(sly: Sly): void {
    this.fb.render(sly);
    const lut = new Uint32Array(256);
    const pal = sly.a.palette;
    const dac8 = (c: number) => Math.floor((c * 255) / 63);
    for (let i = 0; i < 256; i++) lut[i] = 0xff000000 | (dac8(pal[3 * i + 2]) << 16) | (dac8(pal[3 * i + 1]) << 8) | dac8(pal[3 * i]);
    const px = this.fb.px, rgba = this.rgba;
    for (let i = 0; i < px.length; i++) rgba[i] = lut[px[i]];
    this.ctx.putImageData(this.image, 0, 0);
  }
}
