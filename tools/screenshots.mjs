#!/usr/bin/env node
// Store screenshots of the remake (classic and remastered, 1920 x 1200 = 6 x 320 x 200): starts the Vite dev server
// and headless Chrome, runs the scenarios of game/src/screenshots.ts (levels, bosses, two players, menus, shop) and
// writes <out>/classic/<name>.png, <out>/remastered/<name>.png and <out>/index.html (both side by side).
//
//   node tools/screenshots.mjs [--out screenshots] [--port 5192] [scenario ...]
//
// Node stdlib only (tools/headless.mjs); needs google-chrome. Chrome renders WebGL with SwiftShader here (CPU), so
// a full run takes a while.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openPage, ROOT } from './headless.mjs';

const W = 1920, H = 1200;

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const [, v] = args.splice(i, 2);
  return v;
};
const out = resolve(opt('--out', join(ROOT, 'screenshots')));
const port = Number(opt('--port', '5192'));
const only = args;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function gallery(captures) {
  const rows = captures.map((c) => `<figure><figcaption><b>${esc(c.name)}</b> ${esc(c.info)}</figcaption>
<a href="classic/${c.name}.png"><img loading="lazy" src="classic/${c.name}.png"></a><a href="remastered/${c.name}.png"><img loading="lazy" src="remastered/${c.name}.png"></a></figure>`);
  return `<!doctype html><meta charset="utf-8"><title>Dark Planet screenshots</title>
<style>body{background:#111;color:#ccc;font:14px sans-serif;margin:16px}figure{margin:0 0 24px}
img{width:calc(50% - 6px);margin-right:6px;image-rendering:pixelated}figcaption{margin:4px 0}</style>
<h1>Dark Planet screenshots</h1><p>Left classic, right remastered (${W} x ${H}). Click an image for the full size.</p>
${rows.join('\n')}`;
}

const { evaluate, close } = await openPage({ page: 'screenshots.html', global: 'shots', width: W, height: H, port });
try {
  const names = await evaluate('window.shots.then((s) => s.scenarios())');
  const todo = only.length ? names.filter((n) => only.includes(n)) : names;
  if (only.length && todo.length !== only.length) throw new Error(`unknown scenario; known: ${names.join(' ')}`);
  for (const mode of ['classic', 'remastered']) mkdirSync(join(out, mode), { recursive: true });
  const manifest = join(out, 'captures.json');
  const captures = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : [];
  for (const name of todo) {
    const t0 = Date.now();
    process.stdout.write(`${name} ... `);
    const list = await evaluate(`window.shots.then((s) => s.run(${JSON.stringify(name)}))`);
    for (const c of list) {
      for (const mode of ['classic', 'remastered']) {
        writeFileSync(join(out, mode, `${c.name}.png`), Buffer.from(c[mode].split(',')[1], 'base64'));
      }
      const entry = { scenario: name, name: c.name, info: c.info };
      const i = captures.findIndex((e) => e.name === c.name);
      if (i >= 0) captures[i] = entry;
      else captures.push(entry);
    }
    // drop earlier captures of this scenario that the new run no longer has
    const kept = captures.filter((e) => e.scenario !== name || list.some((c) => c.name === e.name));
    captures.splice(0, captures.length, ...kept);
    console.log(`${list.length} shots, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    captures.sort((x, y) => names.indexOf(x.scenario) - names.indexOf(y.scenario) || x.name.localeCompare(y.name, 'en', { numeric: true }));
    writeFileSync(manifest, JSON.stringify(captures, null, 1));
    writeFileSync(join(out, 'index.html'), gallery(captures));
  }
  console.log(`done: ${out}/index.html`);
} finally {
  close();
}
process.exit(0);
