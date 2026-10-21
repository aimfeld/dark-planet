// The CD soundtrack (tracks 2–9 as MP3 from tools/export_music.py), played the way DP.EXE drives the CD:
// CDPlay(track) @0x1DC48 always (re)starts the track and remembers it in DS:0x3E03, and CDRepeat
// @0x1DC75 restarts it when it ends, so every track loops. With CD sound off (Options) the track is still
// remembered, and switching it on again plays it.

export class Music {
  private readonly audio = new Audio();
  private track = 0;
  private enabled = true;

  constructor(private readonly base: string) {
    this.audio.loop = true;
    this.audio.preload = 'auto';
  }

  /** CDPlay: start `track` from the beginning (0 = silence). */
  play(track: number): void {
    this.track = track;
    if (!this.enabled || track === 0) {
      this.audio.pause();
      return;
    }
    const src = `${this.base}track${String(track).padStart(2, '0')}.mp3`;
    if (!this.audio.src.endsWith(src)) this.audio.src = src;
    this.audio.currentTime = 0;
    // Browsers refuse playback before the first user gesture; unlock() retries then.
    this.audio.play().catch(() => undefined);
  }

  /** The track the game asked for last (DS:0x3E03). */
  get current(): number {
    return this.track;
  }

  /** Options "CDSound": switching it on replays the remembered track. */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) this.play(this.track);
    else this.audio.pause();
  }

  stop(): void {
    this.track = 0;
    this.audio.pause();
  }

  /** The page is hidden (another app or tab): silence; shown again: the track continues. */
  setHidden(hidden: boolean): void {
    if (hidden) this.audio.pause();
    else this.unlock();
  }

  /** Call from a user gesture: starts the requested track if the browser blocked it before. */
  unlock(): void {
    if (this.enabled && this.track !== 0 && this.audio.paused) this.audio.play().catch(() => undefined);
  }
}
