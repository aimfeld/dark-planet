// Smoke test of the desktop app without showing its window: `npx electron smoke.mjs <out dir>`.
// Starts main.mjs with its user data in <out dir>, goes from the start screen into the intro and the main menu,
// switches the graphics (R, which saves the settings), then plays on with a fake gamepad only: New Game, the hangar
// (the stick moves the pointer), a level (fly, pause, quit), the shop. Screenshots and the page's console go to <out dir>.

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

/**
 * A fake standard gamepad (navigator.getGamepads): the buttons in `window.__pad.buttons`, the axes in `.axes`.
 * An idle pad comes first, as Windows lists them (one controller twice, virtual pads).
 */
const FAKE_PAD = `window.__pad = { buttons: [], axes: [0, 0, 0, 0] };
  const fake = (id, buttons, axes) => ({ id, connected: true, mapping: 'standard', axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: 0 })) });
  navigator.getGamepads = () => [fake('idle', [], [0, 0, 0, 0]), fake('pad', window.__pad.buttons, window.__pad.axes)];
  0;`; // (executeJavaScript returns the last value, and a function can't be sent back)
const A = 0, B = 1, MENU = 9;

/** Hold pad buttons and axes for `ms`, then let go. */
async function pad(win, buttons, axes = [0, 0, 0, 0], ms = 200) {
  await win.webContents.executeJavaScript(`window.__pad.buttons = ${JSON.stringify(buttons)}; window.__pad.axes = ${JSON.stringify(axes)}`);
  await sleep(ms);
  await win.webContents.executeJavaScript('window.__pad.buttons = []; window.__pad.axes = [0, 0, 0, 0]');
  await sleep(300);
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

    // The gamepad alone. The pointer starts at 160,100; at full deflection it moves 6 px per 25 ms tick.
    await win.webContents.executeJavaScript(FAKE_PAD);
    await pad(win, [A]); // New Game (selected)
    await sleep(3000);
    await pad(win, [], [0, 0, 0, 1], 150); // right stick down to the "Shoot em all" door (92-185, 110-154)
    await sleep(500);
    await shot(win, '4-hangar-pad');
    await pad(win, [A]); // click: the briefing
    await sleep(4000);
    await shot(win, '5-briefing');
    await pad(win, [A]); // on to the level
    await sleep(2000);
    await pad(win, [0], [-1, 0, 0, 0], 800); // fly left while firing
    await shot(win, '6-level');
    await pad(win, [MENU]); // pause
    await sleep(800);
    await shot(win, '7-paused');
    await pad(win, [B]); // quit the level: the main menu
    await sleep(3000);
    await shot(win, '8-back-in-menu');
    await pad(win, [A]); // New Game again: the hangar, the pointer where it was (about 160,136)
    await sleep(3000);
    await pad(win, [], [1, 0, 0, 0], 450); // left stick right, to the shop's door (245-320, 111-154)
    await pad(win, [A]);
    await sleep(3000);
    await shot(win, '9-shop');
  } catch (e) {
    log.push(`smoke failed: ${e.stack}`);
  }
  writeFileSync(join(out, 'console.txt'), log.join('\n') + '\n');
  app.quit();
}

await import('./main.mjs');
