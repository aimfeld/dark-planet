#!/usr/bin/env node
// Gameplay videos from input recordings (recordings/*.json, written by the dev build for every level played,
// game/src/recording.ts): replays the recording in headless Chrome (game/src/trailer.ts), draws every frame and
// encodes a Steam-ready MP4: 1920 x 1080, the picture at 1728 x 1080 (5.4 x) with black bars left and right (PLAN
// Phase 5, decision 5), H.264 + AAC. The page draws at 1920 x 1200 (6 x: the view scales by integers), scaled down by
// area averaging ("sharp bilinear").
// The sound: the game's sound effects rendered offline with its own mixer, plus the CD track the level plays,
// lossless from the disc image (tools/export_music.py --wav), at the game's balance.
//
//   node tools/trailer.mjs <recording.json> [--mode both|remastered|classic] [--lang de|en] [--from s] [--to s]
//                          [--fps 60] [--fade 0.5] [--crf 12] [--jobs 4] [--music-db 0] [--sfx-db 0]
//                          [--out videos] [--port 5194]
//
// --from/--to: seconds after the level start. --music-db/--sfx-db: change the game's balance (dB). The frames are
// drawn in chunks of 5 s by --jobs browsers into lossless files in <out>/.work/; a browser that hangs is replaced,
// and a run that was stopped goes on with the chunks still missing when started again with the same options. Writes <out>/<recording>-<mode>.mp4. Needs ffmpeg, google-chrome
// and original_source/Image/DPImage.iso.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { openBrowser, ROOT, startVite } from './headless.mjs';

const OUT_W = 1920, OUT_H = 1080, PIC_W = 1728; // 5.4 x, bars of 96 px
const W = 1920, H = 1200; // what the page draws
/** To the 16:9 picture. */
const FRAME_16_9 = `scale=${PIC_W}:${OUT_H}:flags=area,pad=${OUT_W}:${OUT_H}:${(OUT_W - PIC_W) / 2}:0:black`;
const RATE = 44100;
const TICK_S = 0.025;
const BATCH = 20; // frames per call into the page
const CHUNK = 300; // frames per lossless chunk (5 s at 60 fps): the unit of work, and what a stopped run keeps
const BROWSER_TIMEOUT = 300000; // ms a page may take for a batch before its browser counts as hung
const PEAK = 0.89; // -1 dBFS: the mix is scaled down if it would go above

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const [, v] = args.splice(i, 2);
  return v;
};
const modes = { both: ['remastered', 'classic'], remastered: ['remastered'], classic: ['classic'] }[opt('--mode', 'both')];
const fps = Number(opt('--fps', '60'));
const from = Number(opt('--from', '0'));
const to = Number(opt('--to', '1e9'));
const fade = Number(opt('--fade', '0.5'));
const crf = opt('--crf', '12');
const out = resolve(opt('--out', join(ROOT, 'videos')));
const port = Number(opt('--port', '5194'));
const jobs = Number(opt('--jobs', '4')); // browsers drawing in parallel (SwiftShader uses about one core each)
const langOpt = opt('--lang', null);
const db = (v) => 10 ** (Number(v) / 20);
const musicGain = db(opt('--music-db', '0')); // the balance against the game's (a trailer may want more music)
const sfxGain = db(opt('--sfx-db', '0'));
if (args.length !== 1 || !modes) {
  console.error('usage: node tools/trailer.mjs <recording.json> [--mode both|remastered|classic] [--lang de|en] [--from s] [--to s] [--fps 60] [--fade 0.5] [--crf 12] [--jobs 4] [--music-db 0] [--sfx-db 0] [--out videos]');
  process.exit(2);
}
const recPath = resolve(args[0]);
const recText = readFileSync(recPath, 'utf8');
const rec = JSON.parse(recText);
const language = langOpt ?? rec.language;
const name = basename(recPath, '.json');
mkdirSync(out, { recursive: true });

/** Mono 16-bit WAV samples as floats (the header written by Python's wave module: 44 bytes). */
function readWav(path) {
  const b = readFileSync(path);
  const pcm = new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length - ((b.length - 44) % 2)));
  return Float32Array.from(pcm, (v) => v / 32768);
}

function writeWav(path, samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + 2 * i));
  writeFileSync(path, b);
}

/** CD track n, lossless (cached in <out>/cd/). */
function track(n) {
  const dir = join(out, 'cd');
  const path = join(dir, `track${String(n).padStart(2, '0')}.wav`);
  if (!existsSync(path)) {
    mkdirSync(dir, { recursive: true });
    const r = spawnSync('python3', [join(ROOT, 'tools/export_music.py'), join(ROOT, 'original_source'), dir, '--wav', String(n)], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`export_music.py failed for track ${n}`);
  }
  return readWav(path);
}

/**
 * The clip's sound: the effects (from the level start) plus the music, which CDPlay starts from the beginning at
 * each track change and CDRepeat loops; cut to the clip. The game plays the music at full volume (audio/music.ts).
 */
function mix(sfx, music, start, end) {
  const first = Math.round(start * RATE), n = Math.round((end - start) * RATE);
  const outPcm = new Float32Array(n);
  const tracks = new Map();
  for (let i = 0; i < n; i++) {
    const s = first + i;
    let seg = 0;
    while (seg + 1 < music.length && music[seg + 1][0] * TICK_S * RATE <= s) seg++;
    const [tick, t] = music[seg];
    let m = 0;
    if (t !== 0) {
      if (!tracks.has(t)) tracks.set(t, track(t));
      const pcm = tracks.get(t);
      m = pcm[(s - Math.round(tick * TICK_S * RATE)) % pcm.length];
    }
    outPcm[i] = musicGain * m + sfxGain * (sfx[s] ?? 0);
  }
  const peak = outPcm.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
  if (peak > PEAK) for (let i = 0; i < n; i++) outPcm[i] *= PEAK / peak;
  console.log(`sound: peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS${peak > PEAK ? `, scaled to ${(20 * Math.log10(PEAK)).toFixed(1)}` : ''}`);
  return outPcm;
}

/** An ffmpeg that takes PNG frames on stdin; `write` waits while its pipe is full. */
function ffmpeg(args) {
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', 'pipe:0', ...args],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exit ${code}`)))));
  const write = (buf) => (ff.stdin.write(buf) ? Promise.resolve() : new Promise((r) => ff.stdin.once('drain', r)));
  return { write, end: () => (ff.stdin.end(), done) };
}

/** Run ffmpeg to the end. */
function run(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg exit ${r.status}`);
}

/** The final encode: the lossless chunks joined, the fades, the sound. */
function encode(path, chunks, wav, frames) {
  const list = `${path}.chunks.txt`;
  writeFileSync(list, chunks.map((f) => `file '${f}'`).join('\n'));
  const seconds = frames / fps;
  const vf = [], af = [];
  if (fade > 0) {
    vf.push(`fade=t=in:d=${fade}`, `fade=t=out:st=${Math.max(0, seconds - fade)}:d=${fade}`);
    af.push(`afade=t=in:d=${fade}`, `afade=t=out:st=${Math.max(0, seconds - fade)}:d=${fade}`);
  }
  vf.push('format=yuv420p');
  run(['-f', 'concat', '-safe', '0', '-i', list, '-i', wav, '-vf', vf.join(','), ...(af.length ? ['-af', af.join(',')] : []),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-tune', 'animation', '-profile:v', 'high', '-g', String(2 * fps),
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', path]);
  rmSync(list);
}

/** The frame ranges [a, b) not covered by the finished chunks, cut into chunks of at most CHUNK frames. */
function todo(frames, done) {
  const out = [];
  let at = 0;
  for (const [a, b] of [...done, [frames, frames]]) {
    for (let c = at; c < a; c += CHUNK) out.push([c, Math.min(a, c + CHUNK)]);
    at = Math.max(at, b);
  }
  return out;
}

/**
 * The pages POST their frames here (?frame=k, PNG): binary, unlike values through the DevTools protocol. `sinks`
 * maps a chunk's frame range to its ffmpeg, which gets the frames in order. Frames nobody waits for (from a
 * browser that was given up) are dropped.
 */
const sinks = new Set();
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method !== 'POST') return res.end();
  const parts = [];
  req.on('data', (c) => parts.push(c));
  req.on('end', () => {
    res.end();
    const k = Number(new URL(req.url, 'http://x').searchParams.get('frame'));
    const sink = [...sinks].find((s) => k >= s.a && k < s.b);
    if (!sink) return;
    sink.pending.set(k, Buffer.concat(parts));
    while (sink.pending.has(sink.next)) {
      const png = sink.pending.get(sink.next);
      sink.pending.delete(sink.next++);
      sink.chain = sink.chain.then(() => sink.ff.write(png));
      sink.onFrame();
    }
  });
});
await new Promise((r) => server.listen(port + 900, '127.0.0.1', r));
const sinkUrl = `http://127.0.0.1:${port + 900}/`;

/** Rejects after `ms` (a hung browser never answers). */
const within = (promise, ms, what) => Promise.race([promise,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: no answer in ${ms / 1000} s`)), ms))]);

process.on('SIGINT', () => process.exit(130)); // the 'exit' handlers stop Chrome and Vite
const vite = await startVite(port);
const browsers = new Set();
let nextDebugPort = port + 1000;
/** A browser on the trailer page with the recording loaded. */
async function browser() {
  const b = await openBrowser({ url: `http://localhost:${port}/trailer.html`, global: 'trailer', width: W, height: H, debugPort: nextDebugPort++ });
  browsers.add(b);
  await b.evaluate(`window.rec = ${recText}; true`);
  return b;
}
const drop = (b) => {
  browsers.delete(b);
  b.close();
};

try {
  const opts = (mode, startFrame = 0) => JSON.stringify({ mode, language, fps, from, to, startFrame });
  let wav = null;
  let first = await browser(); // alone first: Vite optimizes the dependencies once
  for (const mode of modes) {
    const t0 = Date.now();
    const info = await first.evaluate(`window.trailer.then((t) => t.start(window.rec, ${opts(mode)}))`);
    if (info.diverged !== null) console.warn(`WARNING: the replay differs from the recording from tick ${info.diverged}`);
    const end = from + info.frames / fps;
    console.log(`${name}: level ${rec.level}, ${(info.ticks * TICK_S).toFixed(1)} s recorded; clip ${from}–${end.toFixed(1)} s, ${info.frames} frames, ${mode}, ${language}, ${jobs} jobs`);
    if (!wav) {
      const bytes = new Uint8Array(Buffer.from(await first.evaluate(`window.trailer.then((t) => t.sounds(window.rec, ${end}))`), 'base64'));
      const sfx = new Int16Array(bytes.buffer); // a fresh copy: aligned, little-endian like the page wrote it
      wav = join(out, `${name}.wav`);
      writeWav(wav, mix(Float32Array.from(sfx, (v) => v / 32768), info.music, from, end));
    }
    // Lossless chunks of the clip in a work folder; finished ones are kept, so a run that stopped goes on from there.
    const work = join(out, '.work', `${name}-${mode}-${language}-${fps}fps-${from}s-${info.frames}f`);
    mkdirSync(work, { recursive: true });
    const finished = () => readdirSync(work).map((f) => /^(\d+)-(\d+)\.mkv$/.exec(f)).filter(Boolean)
      .map((m) => [Number(m[1]), Number(m[2])]).sort((x, y) => x[0] - y[0]);
    const queue = todo(info.frames, finished());
    let drawn = info.frames - queue.reduce((n, [a, b]) => n + b - a, 0);
    if (drawn > 0) console.log(`  ${drawn} frames already drawn (${work})`);
    const onFrame = () => {
      if (++drawn % 10 === 0 || drawn === info.frames) {
        process.stdout.write(`\r  ${drawn}/${info.frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
    };
    /** Draws one chunk into <work>/a-b.mkv. */
    const draw = async (b, [a, z]) => {
      const part = join(work, `${a}-${z}.part.mkv`);
      const ff = ffmpeg(['-vf', FRAME_16_9, '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'yuv444p', part]);
      const sink = { a, b: z, next: a, pending: new Map(), ff, chain: Promise.resolve(), onFrame };
      sinks.add(sink);
      try {
        await within(b.evaluate(`window.trailer.then((t) => t.start(window.rec, ${opts(mode, a)}))`), BROWSER_TIMEOUT, 'start');
        for (let f = a; f < z; f += BATCH) {
          await within(b.evaluate(`window.trailer.then((t) => t.frames(${Math.min(BATCH, z - f)}, ${JSON.stringify(sinkUrl)}))`),
            BROWSER_TIMEOUT, `frames ${f}`);
        }
        await sink.chain;
        if (sink.next !== z) throw new Error(`frames ${sink.next}..${z} missing`);
        await ff.end();
        renameSync(part, join(work, `${a}-${z}.mkv`));
      } catch (e) {
        drawn -= sink.next - a;
        ff.end().catch(() => undefined);
        throw e;
      } finally {
        sinks.delete(sink);
      }
    };
    // each worker takes the next chunk; a browser that fails or hangs is replaced and its chunk drawn again
    const tries = new Map();
    await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async (_, i) => {
      let b = i === 0 ? first : await browser();
      while (queue.length > 0) {
        const chunk = queue.shift();
        try {
          await draw(b, chunk);
        } catch (e) {
          const n = (tries.get(chunk[0]) ?? 0) + 1;
          tries.set(chunk[0], n);
          if (n >= 3) throw new Error(`chunk ${chunk.join('-')} failed ${n} times: ${e.message}`);
          console.warn(`\n  chunk ${chunk.join('-')}: ${e.message}; new browser, again`);
          queue.unshift(chunk);
          const old = b;
          drop(old);
          b = await browser();
          if (old === first) first = b;
        }
      }
      if (b !== first) drop(b);
    }));
    const done = finished();
    const gap = todo(info.frames, done);
    if (gap.length) throw new Error(`frames missing: ${gap.map((r) => r.join('-')).join(', ')}`);
    const path = join(out, `${name}-${mode}.mp4`);
    encode(path, done.map(([a, z]) => join(work, `${a}-${z}.mkv`)), wav, info.frames);
    rmSync(work, { recursive: true });
    console.log(`\n  ${path} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
} finally {
  for (const b of browsers) b.close();
  vite.stop();
  server.close();
}
process.exit(0);
