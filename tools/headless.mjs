// Shared by tools/screenshots.mjs and tools/trailer.mjs: starts the Vite dev server and headless Chrome, opens a
// dev-only page of game/ at a fixed window size and evaluates expressions in it. Node stdlib only (Chrome DevTools
// Protocol over the built-in WebSocket); needs google-chrome. Chrome renders WebGL with SwiftShader here (CPU).

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, ms = 30000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      // not up yet
    }
  }
  throw new Error(`timeout waiting for ${url}`);
}

/** The Vite dev server of game/ (serves the dev-only pages), without file watching (vite.config.ts: DP_HEADLESS). */
export async function startVite(port) {
  if (await fetch(`http://localhost:${port}/`).then(() => true, () => false)) {
    throw new Error(`port ${port} is in use (a dev server left running?): stop it or pass another --port`);
  }
  // vite itself, not npx (killing npx leaves vite running)
  const vite = spawn(process.execPath, [join(ROOT, 'game/node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], {
    cwd: join(ROOT, 'game'), stdio: 'ignore', env: { ...process.env, DP_HEADLESS: '1' },
  });
  const stop = () => {
    process.off('exit', stop);
    vite.kill();
  };
  process.on('exit', stop);
  const exited = new Promise((_, reject) => vite.on('exit', (code) => reject(new Error(`vite exited (${code})`))));
  exited.catch(() => undefined);
  await Promise.race([waitFor(`http://localhost:${port}/`), exited]);
  return { stop };
}

/**
 * Headless Chrome on `url`, once `global` (a promise on window) has resolved. Returns evaluate(expression) (awaits
 * promises, returns the value by JSON) and close().
 */
export async function openBrowser({ url, global, width, height, debugPort }) {
  const profile = mkdtempSync(join(tmpdir(), 'dp-headless-'));
  const chrome = spawn('google-chrome', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  let ws;
  const close = () => {
    process.off('exit', close);
    ws?.close();
    chrome.kill();
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still hold files
    }
  };
  process.on('exit', close);

  let nextId = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++nextId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  try {
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`);
    const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(d.params.type)) {
        console.log(`  [page ${d.params.type}]`, d.params.args.map((a) => a.value ?? a.description).join(' '));
      }
      const p = d.id && pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      if (d.error) p.rej(new Error(`${d.error.message}`));
      else p.res(d.result);
    };
    await new Promise((r) => (ws.onopen = r));
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    // a page may fail to load while Vite optimizes its dependencies (the module URLs change): load it again
    for (let attempt = 1; ; attempt++) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 240 && (await evaluate(`typeof window.${global}`).catch(() => 'undefined')) !== 'object'; i++) await sleep(250);
      try {
        await evaluate(`window.${global}.then(() => true)`);
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        console.log(`  page failed to load (${e.message.split('\n')[0]}), again`);
        await sleep(2000);
      }
    }
  } catch (e) {
    close();
    throw e;
  }
  return { evaluate, close };
}

/** The dev server plus one browser on `page` (e.g. 'screenshots.html'); close() stops both. */
export async function openPage({ page, global, width, height, port = 5192 }) {
  process.on('SIGINT', () => process.exit(130)); // the 'exit' handlers stop Chrome and Vite
  const vite = await startVite(port);
  try {
    const browser = await openBrowser({ url: `http://localhost:${port}/${page}`, global, width, height, debugPort: port + 1000 });
    return { evaluate: browser.evaluate, close: () => (browser.close(), vite.stop()) };
  } catch (e) {
    vite.stop();
    throw e;
  }
}
