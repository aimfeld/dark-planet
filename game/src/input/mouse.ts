// The mouse in screen pixels (INT 33h: x 0..639 halved, y 0..199) and its buttons held (INT 33h fn 3:
// MouseDown 272c:011B = any button, 272c:00DC = one button). The buttons are sampled once per tick
// (sample()), and a press that was released before the sample still counts once, so short taps aren't lost.
// While the pointer is locked (a mouse player in a level), the movement deltas drive a virtual pointer
// confined to the screen, like the DOS driver's; otherwise the pointer is the real one over the canvas.
// A finger or pen is a mouse with the left button; holding it still for half a second adds the right button
// (the shop's "cancel" while a pod hangs on the pointer). A gamepad can move the pointer and hold its buttons too
// (fromPad: the hangar and the shop, input/gamepad.ts).

const BUTTON_BIT = [1, 4, 2]; // PointerEvent.button (left, middle, right) -> PointerEvent.buttons bit
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10; // CSS pixels a long press may wander

export class Mouse {
  x = 160;
  y = 100;
  private fx = 160; // the locked pointer with its fraction
  private fy = 100;
  private buttons = 0; // held now
  private pressedSince = 0; // pressed since the last sample
  private sampled = 0;
  private longPress = 0; // the right button's bit while a touch is held long enough
  private longTimer: ReturnType<typeof setTimeout> | undefined;
  private longFrom = [0, 0];
  private padButtons = 0;

  /** `toScreen` maps client coordinates to the 320 x 200 screen (the view knows its scale and offset). */
  constructor(private readonly target: HTMLElement, private readonly toScreen: (cx: number, cy: number) => [number, number]) {
    const move = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - this.longFrom[0], e.clientY - this.longFrom[1]) > LONG_PRESS_SLOP) this.endLongPress();
      if (this.locked) this.moveBy(e.movementX, e.movementY);
      else {
        const [x, y] = toScreen(e.clientX, e.clientY);
        this.setPos(x, y);
      }
      this.buttons = e.buttons;
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerdown', (e) => {
      this.endLongPress();
      move(e);
      this.pressedSince |= e.buttons | BUTTON_BIT[e.button]; // (some synthetic events carry buttons = 0)
      if (e.pointerType !== 'mouse') {
        this.longFrom = [e.clientX, e.clientY];
        this.longTimer = setTimeout(() => (this.longPress = 2), LONG_PRESS_MS);
      }
    });
    const up = (e: PointerEvent) => {
      this.endLongPress();
      move(e);
    };
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', (e) => {
      up(e);
      this.buttons = 0;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => {
      this.endLongPress();
      this.buttons = 0;
    });
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

  private endLongPress(): void {
    clearTimeout(this.longTimer);
    this.longTimer = undefined;
    this.longPress = 0;
  }

  /** By client pixels (the locked pointer's movement). */
  private moveBy(dx: number, dy: number): void {
    const [x0, y0] = this.toScreen(0, 0);
    const [x1, y1] = this.toScreen(dx, dy);
    this.moveOnScreen(x1 - x0, y1 - y0);
  }

  /** By screen pixels, keeping the fraction. */
  private moveOnScreen(dx: number, dy: number): void {
    this.fx = Math.max(0, Math.min(319.99, this.fx + dx));
    this.fy = Math.max(0, Math.min(199.99, this.fy + dy));
    this.x = Math.floor(this.fx);
    this.y = Math.floor(this.fy);
  }

  private setPos(x: number, y: number): void {
    this.x = Math.max(0, Math.min(319, Math.floor(x)));
    this.y = Math.max(0, Math.min(199, Math.floor(y)));
    this.fx = this.x;
    this.fy = this.y;
  }

  /** A gamepad as the mouse for the next sample: moves the pointer by screen pixels; `buttons` as PointerEvent.buttons. */
  fromPad(dx: number, dy: number, buttons: number): void {
    if (dx !== 0 || dy !== 0) this.moveOnScreen(dx, dy);
    this.padButtons = buttons;
  }

  /** Take the button state for the next tick. */
  sample(): void {
    this.sampled = this.buttons | this.pressedSince | this.longPress | this.padButtons;
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
