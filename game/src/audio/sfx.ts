// Sound effects with Web Audio, played the way SMIX does in DP.EXE: signed 8-bit samples at 11025 Hz,
// up to 32 voices mixed (StartSound 2769:09DC). The simulation only emits PlaySound/StopSound events
// (sim/state.ts SoundEvent); the voice conditions of the original call sites are applied here.

import { gunzip } from '../data';
import type { SoundEvent } from '../sim/state';

const SMIX_VOICES = 32;

interface Voice {
  n: number;
  src: AudioBufferSourceNode;
  end: number; // context time when a one-shot voice ends (Infinity for loops)
}

export class Sfx {
  private readonly voices: Voice[] = [];
  private readonly out: GainNode;

  private constructor(private readonly ctx: AudioContext, private readonly buffers: AudioBuffer[]) {
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
  }

  /** sounds.json + sounds.bin.gz from tools/export_engine_data.py (index = PlaySound number). */
  static async load(base: string): Promise<Sfx> {
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
    return new Sfx(ctx, buffers);
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

  private playing(n: number): boolean {
    return this.voices.some((v) => v.n === n);
  }

  private start(n: number, loop: boolean): void {
    const buffer = this.buffers[n];
    if (!buffer || this.voices.length >= SMIX_VOICES) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    src.connect(this.out);
    src.start();
    this.voices.push({ n, src, end: loop ? Infinity : this.ctx.currentTime + buffer.duration });
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
  }

  /** AfterLevel @0x1B6D1 stops every sound except 50 (the level 4 tank's death roar). */
  stopAll(except = -1): void {
    for (const v of [...this.voices]) if (v.n !== except) this.stop(v.n);
  }
}
