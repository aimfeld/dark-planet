// Sound effects with Web Audio, played the way SMIX does in DP.EXE: signed 8-bit samples at 11025 Hz,
// up to 32 voices mixed (StartSound 2769:09DC). The simulation only emits PlaySound/StopSound events
// (sim/state.ts SoundEvent); the voice conditions of the original call sites are applied here.

import { gunzip } from '../data';
import type { SoundEvent } from '../sim/state';

const SMIX_VOICES = 32;
// The SFX are mixed about 10 dB hotter than the CD tracks (RMS); at full gain they drown the music. The
// original's balance came from the sound card's mixer, not the game. *design*, gameplay-spec §14.
const SFX_GAIN = 0.18;

/**
 * The remake's own mixing (the prototype's voice clips): `gains` gives single sounds extra volume, and while one of
 * them plays every other sound is turned down to `duck`.
 */
export interface SfxOptions {
  gains?: Readonly<Record<number, number>>;
  duck?: number;
}

interface Voice {
  n: number;
  src: AudioBufferSourceNode;
  end: number; // context time when a one-shot voice ends (Infinity for loops)
}

export class Sfx {
  private readonly voices: Voice[] = [];
  private readonly out: GainNode;
  private readonly rest: GainNode; // the sounds without an own gain (ducked)
  private readonly gains: Readonly<Record<number, number>>;
  private readonly duck: number;

  private constructor(private readonly ctx: AudioContext, private readonly buffers: AudioBuffer[], options: SfxOptions) {
    this.gains = options.gains ?? {};
    this.duck = options.duck ?? 1;
    this.out = ctx.createGain();
    this.out.gain.value = SFX_GAIN;
    this.out.connect(ctx.destination);
    this.rest = ctx.createGain();
    this.rest.connect(this.out);
  }

  /** sounds.json + sounds.bin.gz from tools/export_engine_data.py (index = PlaySound number). */
  static async load(base: string, options: SfxOptions = {}): Promise<Sfx> {
    const [index, bin] = await Promise.all([
      fetch(base + 'sounds.json').then((r) => r.json() as Promise<{ rate: number; sounds: { offset: number; length: number }[] }>),
      fetch(base + 'sounds.bin.gz').then((r) => r.arrayBuffer()).then(gunzip),
    ]);
    const ctx = new AudioContext();
    const pcm = new Int8Array(bin);
    const buffers = index.sounds.map(({ offset, length }) => {
      const b = ctx.createBuffer(1, Math.max(1, length), index.rate);
      const ch = b.getChannelData(0);
      for (let i = 0; i < length; i++) ch[i] = pcm[offset + i] / 128;
      return b;
    });
    return new Sfx(ctx, buffers, options);
  }

  /** The page is hidden: hold the mix (loops resume where they were). */
  setHidden(hidden: boolean): void {
    if (hidden) void this.ctx.suspend();
    else this.unlock();
  }

  /** Browsers start audio only after a user gesture; call this from key handlers. */
  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private prune(): void {
    const now = this.ctx.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].end <= now) this.voices.splice(i, 1);
  }

  /**
   * Try to start the sound without waiting for a gesture on this page: browsers may allow it when a click or key on
   * the same site opened the page (Chrome). True when it plays; otherwise it starts with the next unlock().
   */
  async tryStart(ms = 500): Promise<boolean> {
    if (this.ctx.state !== 'running') {
      await Promise.race([this.ctx.resume().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, ms))]);
    }
    return this.ctx.state === 'running';
  }

  /** VoiceCount: the voices playing now (the prototype waits for 0 before it quits). */
  voiceCount(): number {
    this.prune();
    return this.voices.length;
  }

  private playing(n: number): boolean {
    return this.voices.some((v) => v.n === n);
  }

  private start(n: number, loop: boolean): void {
    const buffer = this.buffers[n];
    if (!buffer || this.voices.length >= SMIX_VOICES) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    const gain = this.gains[n];
    if (gain === undefined) src.connect(this.rest);
    else {
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.out);
    }
    src.start();
    this.voices.push({ n, src, end: loop ? Infinity : this.ctx.currentTime + buffer.duration });
    if (gain !== undefined) this.ducking();
  }

  /** Turn the other sounds down while a sound with its own gain plays, and back up when the last one ends. */
  private ducking(): void {
    if (this.duck === 1) return;
    const now = this.ctx.currentTime;
    const until = Math.max(now, ...this.voices.filter((v) => this.gains[v.n] !== undefined).map((v) => v.end));
    const g = this.rest.gain;
    g.cancelScheduledValues(now);
    if (until > now) g.setTargetAtTime(this.duck, now, 0.03);
    if (until < Infinity) g.setTargetAtTime(1, until, 0.15);
  }

  handle(events: SoundEvent[]): void {
    this.prune();
    const running = this.ctx.state === 'running';
    for (const e of events) {
      if (e.stop) {
        this.stop(e.n);
        continue;
      }
      // Before the first user gesture the clock stands still: keep the loops (they start on unlock),
      // drop one-shots instead of letting them pile up as voices that never end.
      if (!running && !e.loop) continue;
      if (e.belowVoices !== undefined && this.voices.length >= e.belowVoices) continue;
      if (e.ifNotPlaying && this.playing(e.n)) continue;
      for (let k = 0; k < (e.copies ?? 1); k++) this.start(e.n, e.loop ?? false);
    }
  }

  stop(n: number): void {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      if (this.voices[i].n !== n) continue;
      this.voices[i].src.stop();
      this.voices.splice(i, 1);
    }
    if (this.gains[n] !== undefined) this.ducking();
  }

  /** AfterLevel @0x1B6D1 stops every sound except 50 (the level 4 tank's death roar). */
  stopAll(except = -1): void {
    for (const v of [...this.voices]) if (v.n !== except) this.stop(v.n);
  }
}
