// The mouse in screen pixels (INT 33h: x 0..639 halved, y 0..199) and its buttons held (INT 33h fn 3:
// MouseDown 272c:011B = any button, 272c:00DC = one button). The buttons are sampled once per tick
// (sample()), and a press that was released before the sample still counts once, so short taps aren't lost.
// While the pointer is locked (a mouse player in a level), the movement deltas drive a virtual pointer
// confined to the screen, like the DOS driver's; otherwise the pointer is the real one over the canvas.

const BUTTON_BIT = [1, 4, 2]; // PointerEvent.button (left, middle, right) -> PointerEvent.buttons bit

export class Mouse {
  x = 160;
  y = 100;
  private fx = 160; // the locked pointer with its fraction
  private fy = 100;
  private buttons = 0; // held now
  private pressedSince = 0; // pressed since the last sample
  private sampled = 0;

  /** `toScreen` maps client coordinates to the 320 x 200 screen (the view knows its scale and offset). */
  constructor(private readonly target: HTMLElement, private readonly toScreen: (cx: number, cy: number) => [number, number]) {
    const move = (e: PointerEvent) => {
      if (this.locked) this.moveBy(e.movementX, e.movementY);
      else {
        const [x, y] = toScreen(e.clientX, e.clientY);
        this.setPos(x, y);
      }
      this.buttons = e.buttons;
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerdown', (e) => {
      move(e);
      this.pressedSince |= e.buttons | BUTTON_BIT[e.button]; // (some synthetic events carry buttons = 0)
    });
    target.addEventListener('pointerup', move);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => (this.buttons = 0));
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  /** Capture the pointer (needs a recent user gesture; a rejected request is retried on the next click). */
  lock(): void {
    if (this.locked || typeof this.target.requestPointerLock !== 'function') return;
    this.fx = this.x;
    this.fy = this.y;
    try {
      const r = this.target.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => undefined);
    } catch {
      // no user activation yet
    }
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  private moveBy(dx: number, dy: number): void {
    const [x0, y0] = this.toScreen(0, 0);
    const [x1, y1] = this.toScreen(dx, dy);
    this.fx = Math.max(0, Math.min(319.99, this.fx + x1 - x0));
    this.fy = Math.max(0, Math.min(199.99, this.fy + y1 - y0));
    this.x = Math.floor(this.fx);
    this.y = Math.floor(this.fy);
  }

  private setPos(x: number, y: number): void {
    this.x = Math.max(0, Math.min(319, Math.floor(x)));
    this.y = Math.max(0, Math.min(199, Math.floor(y)));
  }

  /** Take the button state for the next tick. */
  sample(): void {
    this.sampled = this.buttons | this.pressedSince;
    this.pressedSince = 0;
  }

  get down(): boolean {
    return this.sampled !== 0;
  }

  get left(): boolean {
    return (this.sampled & 1) !== 0;
  }

  get right(): boolean {
    return (this.sampled & 2) !== 0;
  }

  get middle(): boolean {
    return (this.sampled & 4) !== 0;
  }
}
