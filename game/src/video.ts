// The intro and ending videos (tools/export_videos.py: AAPLAY's playlists with their timing baked in), played
// muted in a hidden <video> element; the renderer copies its frames into the 320 x 200 view.

export interface VideoPlayer {
  /** Start `name` (intro, ending) from the beginning. */
  play(name: string): void;
  /** Still running (false once it ended, failed or was stopped). */
  readonly playing: boolean;
  stop(): void;
}

export class Video implements VideoPlayer {
  readonly element = document.createElement('video');
  /** The video playing (intro, ending), '' when none. */
  name = '';
  private failed = false;

  constructor(private readonly base: string) {
    this.element.muted = true; // silent: the game plays the CD track itself
    this.element.playsInline = true;
    this.element.preload = 'auto';
    this.element.addEventListener('error', () => (this.failed = true));
  }

  play(name: string): void {
    this.failed = false;
    this.name = name;
    this.element.src = `${this.base}${name}.webm`;
    this.element.currentTime = 0;
    this.element.play().catch(() => (this.failed = true));
  }

  get playing(): boolean {
    return !this.failed && this.element.src !== '' && !this.element.ended;
  }

  stop(): void {
    this.name = '';
    this.element.pause();
    this.element.removeAttribute('src');
    this.element.load();
  }
}
