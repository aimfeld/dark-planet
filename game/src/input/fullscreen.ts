// Fullscreen with the Keyboard Lock API (Chromium only): in fullscreen the page then receives key
// combinations the browser or the desktop would otherwise take, such as Ctrl+Alt+arrows, which switch
// workspaces on Linux Mint/Cinnamon. Locking every key includes Esc, so Chrome asks to hold Esc to leave
// fullscreen; F leaves it too. Other browsers get plain fullscreen; X and C stay as fire/altitude keys.
// macOS keeps Ctrl+arrows (Spaces, Mission Control) even with the lock (observed in Brave), so Mac players
// get a hint to use X/C instead.

/** A Mac with a keyboard (an iPad also reports "Mac", but has a touch screen). */
export const isMac = () => /Mac/.test(navigator.platform) && navigator.maxTouchPoints === 0;

interface KeyboardLock {
  lock(codes?: string[]): Promise<void>;
  unlock(): void;
}

function keyboard(): KeyboardLock | undefined {
  return (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
}

/** Whether this browser offers Keyboard Lock. */
export const keyboardLockSupported = () => typeof keyboard()?.lock === 'function';

export async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    keyboard()?.unlock();
    await document.exitFullscreen();
    return;
  }
  await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  // must follow requestFullscreen (the lock only holds while the page is fullscreen)
  await keyboard()?.lock?.().catch(() => undefined);
}
