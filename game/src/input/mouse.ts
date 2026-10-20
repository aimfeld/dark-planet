// The mouse in screen pixels (INT 33h: x 0..639 halved, y 0..199) and "any button held" (MouseDown 272c:011B).

export class Mouse {
  x = 160;
  y = 100;
  private buttons = 0;

  /** `toScreen` maps client coordinates to the 320 x 200 screen (the view knows its scale and offset). */
  constructor(target: HTMLElement, toScreen: (cx: number, cy: number) => [number, number]) {
    const move = (e: PointerEvent) => {
      const [x, y] = toScreen(e.clientX, e.clientY);
      this.x = Math.max(0, Math.min(319, Math.floor(x)));
      this.y = Math.max(0, Math.min(199, Math.floor(y)));
      this.buttons = e.buttons;
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerdown', move);
    target.addEventListener('pointerup', move);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => (this.buttons = 0));
  }

  get down(): boolean {
    return this.buttons !== 0;
  }
}
