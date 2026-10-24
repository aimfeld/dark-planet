// Dark Planet Remastered as a desktop app (Phase 5, Steam): one fullscreen window with the game's desktop build
// (`npm run build:desktop` in game/ writes it to app/). The game reads its files through the app:// protocol below,
// and keeps its settings and SAVE.DAT as files in the save folder (preload.cjs, game/src/platform.ts).

import { app, BrowserWindow, ipcMain, Menu, protocol } from 'electron';
import { createReadStream, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const GAME = join(HERE, 'app');
const ORIGIN = 'app://game';
/** The files the game may read and write in the save folder. */
const SAVE_FILES = new Set(['settings.json', 'SAVE.DAT']);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gz': 'application/gzip',
  '.mp3': 'audio/mpeg', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
};

// Standard and secure like https, so fetch, media streaming and the Web APIs that need a secure context work.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

/**
 * The save folder, for Steam Auto-Cloud: %APPDATA%\Dark Planet Remastered\saves on Windows,
 * ~/.config/Dark Planet Remastered/saves on Linux. The rest of userData is Chromium's (caches, local storage).
 */
const saves = () => join(app.getPath('userData'), 'saves');

/** A file of the game build, answering Range requests (the music and the videos seek and stream). */
function serve(request) {
  const path = normalize(join(GAME, decodeURIComponent(new URL(request.url).pathname)));
  if (!path.startsWith(GAME + sep)) return new Response(null, { status: 403 });
  let size;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error('not a file');
    size = stat.size;
  } catch {
    return new Response(null, { status: 404 });
  }
  const headers = { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') ?? '');
  if (!range || (range[1] === '' && range[2] === '')) {
    return new Response(Readable.toWeb(createReadStream(path)), { headers: { ...headers, 'Content-Length': String(size) } });
  }
  // bytes=a-b, bytes=a- or the suffix bytes=-n
  const start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1]);
  const end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  }
  return new Response(Readable.toWeb(createReadStream(path, { start, end })), {
    status: 206,
    headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
  });
}

function saveIpc() {
  const file = (name) => {
    if (!SAVE_FILES.has(name)) throw new Error(`not a save file: ${name}`);
    return join(saves(), name);
  };
  ipcMain.on('dp:read', (e, name) => {
    try {
      e.returnValue = new Uint8Array(readFileSync(file(name)));
    } catch {
      e.returnValue = null;
    }
  });
  // written to a temporary file first, so a crash or power loss never leaves half a file
  ipcMain.on('dp:write', (_e, name, data) => {
    try {
      const path = file(name);
      mkdirSync(saves(), { recursive: true });
      writeFileSync(path + '.tmp', data);
      renameSync(path + '.tmp', path);
    } catch (err) {
      console.error('not saved:', err);
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    title: 'Dark Planet Remastered',
    width: 1280,
    height: 800,
    fullscreen: true,
    backgroundColor: '#000000',
    show: false,
    icon: join(GAME, 'icons', 'icon-512.png'),
    webPreferences: {
      preload: join(HERE, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      // the CD music may start with the intro, without the key press browsers wait for
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.once('ready-to-show', () => win.show());
  // Alt+Enter and F11 toggle fullscreen as in other PC games; the game's F key asks through the preload script.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    if ((input.alt && input.key === 'Enter') || input.key === 'F11') {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  // only the game's own page; no links lead out of it
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN + '/')) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadURL(`${ORIGIN}/index.html`);
  return win;
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win?.isMinimized()) win.restore();
  win?.focus();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', serve);
  saveIpc();
  ipcMain.on('dp:fullscreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    win?.setFullScreen(!win.isFullScreen());
  });
  ipcMain.on('dp:quit', () => app.quit());
  createWindow();
});

app.on('window-all-closed', () => app.quit());
