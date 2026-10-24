// Smoke test of the desktop app without showing its window: `npx electron smoke.mjs <out dir>`.
// Starts main.mjs with its user data in <out dir>, goes from the start screen into the intro and the main menu,
// switches the graphics (R, which saves the settings), and writes screenshots and the page's console to <out dir>.

import { app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const out = resolve(process.argv.at(-1));
mkdirSync(out, { recursive: true });
app.setPath('userData', join(out, 'userData'));
const log = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('browser-window-created', (_e, win) => {
  win.show = () => undefined; // stays hidden (it still renders)
  win.webContents.on('console-message', (e) => log.push(`[${e.level}] ${e.message}`));
  win.webContents.once('did-finish-load', () => void run(win));
});

async function key(win, keyCode) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
  await sleep(100);
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  await sleep(300);
}

async function shot(win, name) {
  writeFileSync(join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
}

async function run(win) {
  try {
    await sleep(4000);
    await shot(win, '1-start');
    await key(win, 'Return'); // the selected version: the intro starts
    await sleep(3000);
    await shot(win, '2-intro');
    // the music streams from app:// and seeks (Range requests) as the game's Music does
    log.push(`music: ${await win.webContents.executeJavaScript(`new Promise((done) => {
      const a = new Audio('music/track05.mp3');
      a.volume = 0;
      a.onerror = () => done('error ' + a.error?.code);
      a.oncanplay = () => { a.oncanplay = null; a.currentTime = 120; a.play().then(() =>
        setTimeout(() => done('t=' + a.currentTime.toFixed(1) + ' of ' + a.duration.toFixed(0) + ' s, paused=' + a.paused), 1500),
        (e) => done('play refused: ' + e)); };
    })`)}`);
    await key(win, 'Escape'); // skip the intro
    await sleep(2000);
    await key(win, 'R');
    await sleep(1000);
    await shot(win, '3-menu');
    const settings = join(app.getPath('userData'), 'saves', 'settings.json');
    log.push(`settings.json: ${existsSync(settings) ? readFileSync(settings, 'utf8') : 'missing'}`);
  } catch (e) {
    log.push(`smoke failed: ${e.stack}`);
  }
  writeFileSync(join(out, 'console.txt'), log.join('\n') + '\n');
  app.quit();
}

await import('./main.mjs');
