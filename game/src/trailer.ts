// Gameplay videos (dev only, trailer.html, driven by tools/trailer.mjs): replays an input recording (recording.ts)
// and draws it frame by frame at the video's frame rate, classic or remastered, and renders its sound effects
// offline with the game's own mixer (audio/sfx.ts). The music is mixed in by the tool from the CD audio. Not part
// of the game or its build.

import { Sfx } from './audio/sfx';
import { loadGameData, useSpriteLanguage, type GameData } from './data';
import type { Lang } from './i18n';
import { Replay, type Recording } from './recording';
import { ClassicView } from './render/classicView';
import { REMASTER_METHOD } from './render/hiResView';
import { TICK_MS } from './screens/proc';

const SAMPLE_RATE = 44100;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Math.random for the remastered effects' particles (render/fx.ts): seeded, so a video renders the same twice. */
function seedRandom(seed: number): void {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0; // mulberry32
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ClipOptions {
  mode: 'classic' | 'remastered';
  language: Lang;
  fps: number;
  from: number; // seconds after the level start
  to: number; // seconds (clamped to the recording)
  startFrame?: number; // the first frame frames() draws (tools/trailer.mjs splits a clip among several browsers)
}

export interface ClipInfo {
  ticks: number; // in the recording
  frames: number; // video frames of the clip
  /** CD tracks the level asked for: [tick, track], from the level start (CDPlay restarts the track). */
  music: [number, number][];
  /** First tick where the replay differs from the recording, or null. */
  diverged: number | null;
}

class Trailer {
  private replay: Replay | null = null;
  private opts: ClipOptions | null = null;
  private frame = 0;

  private constructor(private readonly data: GameData, private readonly view: ClassicView) {}

  static async create(): Promise<Trailer> {
    const base = import.meta.env.BASE_URL;
    const data = await loadGameData({
      json: async (name) => (await fetch(base + 'data/' + name)).json(),
      binary: async (name) => (await fetch(base + 'data/' + name)).arrayBuffer(),
    });
    const view = await ClassicView.create(document.getElementById('app')!, data);
    return new Trailer(data, view);
  }

  private ticksAt(seconds: number): number {
    return Math.round((seconds * 1000) / TICK_MS);
  }

  /** Start a clip: replays up to its first tick (feeding the remastered effects) and returns what the tool needs. */
  async start(rec: Recording, opts: ClipOptions): Promise<ClipInfo> {
    seedRandom(1998);
    useSpriteLanguage(this.data, opts.language);
    await this.view.hiRes.use(opts.mode === 'remastered' ? REMASTER_METHOD : null);
    // the music the level asked for, over the whole recording
    const music: [number, number][] = [];
    const scan = new Replay(this.data, rec);
    do {
      if (music.at(-1)?.[1] !== scan.world.track) music.push([scan.tick, scan.world.track]);
    } while (scan.step());
    const replay = new Replay(this.data, rec);
    const to = Math.min(this.ticksAt(opts.to), replay.length);
    opts = { ...opts, to: (to * TICK_MS) / 1000 };
    this.replay = replay;
    this.opts = opts;
    this.frame = opts.startFrame ?? 0;
    this.advance(this.ticksAt(opts.from));
    const frames = Math.floor((opts.to - opts.from) * opts.fps);
    return { ticks: replay.length, frames, music, diverged: scan.diverged };
  }

  /** Run ticks until `n` have run. */
  private advance(n: number): void {
    const r = this.replay!;
    const hiRes = this.view.hiRes;
    while (r.tick < n) {
      hiRes.beforeTick('world', r.world, null!);
      if (!r.step()) break;
      r.world.sounds = [];
      hiRes.afterTick('world', r.world);
    }
  }

  /**
   * Draws the next `count` frames and POSTs each as a PNG to `sink`?frame=k (the tool's HTTP server: binary, while
   * the next frame draws). Frame k shows the game k / fps seconds after the clip start, as the game's frame loop
   * draws it (main.ts: the ticks due, then alpha = the time since the last).
   */
  async frames(count: number, sink: string): Promise<void> {
    const o = this.opts!;
    const sent: Promise<unknown>[] = [];
    for (let i = 0; i < count; i++, this.frame++) {
      // the time in ticks; remastered draws it between two ticks, classic the nearest tick (so both match at a cut)
      const t = (o.from * 1000 + (this.frame * 1000) / o.fps) / TICK_MS;
      const alpha = o.mode === 'remastered' ? t - Math.floor(t) : 1;
      this.advance(o.mode === 'remastered' ? Math.floor(t) + 1 : Math.round(t));
      const w = this.replay!.world;
      for (let k = 0; k < 400; k++) {
        this.view.draw(w, alpha);
        if (!this.view.hiRes.loading) break;
        await sleep(25);
      }
      this.view.draw(w, alpha);
      const url = `${sink}?frame=${this.frame}`;
      const png = new Promise<Blob | null>((resolve) => this.view.element.toBlob(resolve, 'image/png'));
      sent.push(png.then((body) => fetch(url, { method: 'POST', body })));
    }
    await Promise.all(sent);
  }

  /**
   * The sound effects from the level start to the clip end, mono 16-bit PCM (base64) at 44.1 kHz, rendered with the
   * game's mixer: the events of tick i play at i × 25 ms. The level's engine loops start before any clip.
   */
  async sounds(rec: Recording, toSeconds: number): Promise<string> {
    const replay = new Replay(this.data, rec);
    const ticks = Math.min(this.ticksAt(toSeconds), replay.length);
    const ctx = new OfflineAudioContext(1, Math.ceil((ticks * TICK_MS * SAMPLE_RATE) / 1000), SAMPLE_RATE);
    const sfx = await Sfx.load(import.meta.env.BASE_URL + 'data/', {}, ctx);
    // the loops StartLevel started (playLevel passes them on before the first tick)
    sfx.at = 0;
    sfx.handle(replay.world.sounds);
    replay.world.sounds = [];
    while (replay.tick < ticks) {
      sfx.at = (replay.tick * TICK_MS) / 1000;
      replay.step();
      sfx.handle(replay.world.sounds);
      replay.world.sounds = [];
    }
    const pcm = (await ctx.startRendering()).getChannelData(0);
    const bytes = new Uint8Array(pcm.length * 2);
    const view = new DataView(bytes.buffer);
    pcm.forEach((v, i) => view.setInt16(2 * i, Math.max(-32768, Math.min(32767, Math.round(v * 32767))), true));
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
}

(window as unknown as { trailer: Promise<Trailer> }).trailer = Trailer.create();
