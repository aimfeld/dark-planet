// The bridge between the game page and main.mjs (the interface is DesktopBridge in game/src/platform.ts).
// Sandboxed preload scripts must be CommonJS.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('darkPlanet', {
  // synchronous: the game reads its settings and the save slot while it starts and in the menu
  read: (name) => ipcRenderer.sendSync('dp:read', name),
  write: (name, data) => ipcRenderer.send('dp:write', name, data),
  toggleFullscreen: () => ipcRenderer.send('dp:fullscreen'),
  steamDeck: ipcRenderer.sendSync('dp:info').steamDeck,
  quit: () => ipcRenderer.send('dp:quit'),
});
