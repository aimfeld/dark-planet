// The mouse in screen pixels (INT 33h: x 0..639 halved, y 0..199) and its buttons held (INT 33h fn 3:
// MouseDown 272c:011B = any button, 272c:00DC = one button). The buttons are sampled once per tick
// (sample()), and a press that was released before the sample still counts once, so short taps aren't lost.

const BUTTON_BIT = [1, 4, 2]; // PointerEvent.button (left, middle, right) -> PointerEvent.buttons bit

export class Mouse {
  x = 160;
  y = 100;
  private buttons = 0; // held now
  private pressedSince = 0; // pressed since the last sample
  private sampled = 0;

  /** `toScreen` maps client coordinates to the 320 x 200 screen (the view knows its scale and offset). */
  constructor(target: HTMLElement, toScreen: (cx: number, cy: number) => [number, number]) {
    const move = (e: PointerEvent) => {
      const [x, y] = toScreen(e.clientX, e.clientY);
      this.x = Math.max(0, Math.min(319, Math.floor(x)));
      this.y = Math.max(0, Math.min(199, Math.floor(y)));
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
}
