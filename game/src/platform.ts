// The desktop build (Electron, desktop/): its preload script (desktop/preload.cjs) puts this bridge on the window.
// The browser build has none, so `desktop` is undefined there.

export interface DesktopBridge {
  /** A file from the save folder (settings.json, SAVE.DAT), or null when there is none. */
  read(name: string): Uint8Array | null;
  write(name: string, data: Uint8Array): void;
  toggleFullscreen(): void;
  /** Started on a Steam Deck (Steam sets SteamDeck=1): the legend names its buttons. */
  readonly steamDeck: boolean;
  quit(): void;
}

export const desktop: DesktopBridge | undefined = (window as Window & { darkPlanet?: DesktopBridge }).darkPlanet;
