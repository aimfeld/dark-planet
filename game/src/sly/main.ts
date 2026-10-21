// The Sly version (sly.html): the 1997 prototype of Dark Planet. A title until a key or tap (browsers play sound
// only after one), then SLYVERS's main program (sim.ts) in real time; when it ends, Enter plays again and Esc goes
// back to Dark Planet. Keyboard (arrows, X or Ctrl fires, Esc quits), gamepad, and touch on phones and tablets.

import { Sfx } from '../audio/sfx';
import { toggleFullscreen } from '../input/fullscreen';
import { Gamepad } from '../input/gamepad';
import { Keyboard } from '../input/keyboard';
import { TouchControls, touchLayout, type TouchKey } from '../input/touch';
import { loadSlyData } from './data';
import { Sly } from './sim';
import { SlyView } from './view';

const TOUCH_DEVICE = window.matchMedia('(pointer: coarse)').matches;
const MAX_CATCH_UP_MS = 200; // after a stall, don't race through the missed time

const PLAY_KEYS: TouchKey[] = [{ code: 'Escape', label: 'Esc' }];
const END_KEYS: TouchKey[] = [{ code: 'Enter', label: 'Nochmal' }, { code: 'Escape', label: 'Zurück' }];

function insets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
    'env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const r = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0,
    l: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return r;
}

async function main(): Promise<void> {
  const status = document.getElementById('status')!;
  const title = document.getElementById('title')!;
  const legend = document.getElementById('keys')!;
  const base = import.meta.env.BASE_URL;
  status.textContent = 'Lade Daten…';
  const data = await loadSlyData({
    json: async (name) => (await fetch(base + 'sly/' + name)).json(),
    binary: async (name) => (await fetch(base + 'sly/' + name)).arrayBuffer(),
  }).catch((e) => {
    status.textContent = 'Daten konnten nicht geladen werden (game/public/sly/)';
    throw e;
  });
  const sfx = await Sfx.load(base + 'sly/').catch((e) => {
    console.warn('no sounds:', e);
    return undefined;
  });
  status.textContent = '';
  const view = new SlyView(document.getElementById('app')!, data);
  const keys = new Keyboard(window);
  const pad = new Gamepad();
  const touch = TOUCH_DEVICE
    ? new TouchControls(document.body, document.fullscreenEnabled ? () => void toggleFullscreen() : undefined, undefined, ['fire'])
    : undefined;
  const unlock = () => sfx?.unlock();
  for (const type of ['keydown', 'pointerup', 'touchend']) window.addEventListener(type, unlock);
  document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS pinch zoom

  let state: 'title' | 'play' | 'end' = 'title';
  let sly = new Sly(data, () => sfx?.voiceCount() ?? 0);
  let program = sly.run();
  let wait = 0; // ms until the program's next step
  let acc = 0;
  let tapped = false; // a tap on the title
  window.addEventListener('pointerup', () => (tapped = true));

  const start = () => {
    sfx?.stopAll();
    sly = new Sly(data, () => sfx?.voiceCount() ?? 0);
    program = sly.run();
    wait = 0;
    acc = 0;
    state = 'play';
    keys.takePress('Escape');
    keys.takePress('Enter');
  };
  const back = () => {
    location.href = base; // Dark Planet
  };

  const showText = () => {
    title.hidden = state === 'play';
    document.body.style.cursor = state === 'play' ? 'none' : '';
    if (state === 'end') title.innerHTML = 'Programm beendet<br><br>Enter: nochmal &nbsp; Esc: zurück zu Dark Planet';
    legend.hidden = TOUCH_DEVICE || state !== 'play';
    if (!legend.hidden) {
      const p = view.picture;
      legend.style.top = `${Math.round(p.y + p.h)}px`;
    }
    view.setBelow(TOUCH_DEVICE ? 0 : legend.offsetHeight || 40);
  };

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(now - last, MAX_CATCH_UP_MS);
    last = now;
    if (keys.takePress('KeyF')) void toggleFullscreen();
    keys.sample();
    pad.sample();
    touch?.sample();
    const touchPlays = touch !== undefined && state === 'play';
    if (touch) {
      const layout = touchLayout(window.innerWidth, window.innerHeight, insets(), touch.cornerButtons);
      touch.update(touchPlays, state === 'play' ? PLAY_KEYS : state === 'end' ? END_KEYS : [], layout);
      view.setArea(layout.game);
    }
    if (state === 'title') {
      if (keys.anyKey() || tapped) start();
    } else if (state === 'end') {
      if (keys.takePress('Enter') || touch?.held('Enter')) start();
      else if (keys.takePress('Escape') || touch?.held('Escape')) back();
    }
    tapped = false;
    if (state === 'play') {
      acc += dt;
      while (acc >= wait) {
        acc -= wait;
        const kb = keys.player();
        const jp = pad.player({ select: false, use: false });
        const tp = touch?.player();
        sly.input({
          left: kb.left || jp.left || !!tp?.left,
          right: kb.right || jp.right || !!tp?.right,
          up: kb.up || jp.up || !!tp?.up,
          down: kb.down || jp.down || !!tp?.down,
          fire: kb.fire || jp.fire || !!tp?.fire,
          stop: keys.takePress('Escape') || !!touch?.held('Escape'),
        });
        const step = program.next();
        sfx?.handle(sly.sounds);
        sly.sounds.length = 0;
        if (step.done) {
          state = 'end';
          break;
        }
        wait = step.value;
      }
    }
    showText();
    view.draw(sly);
    requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', () => {
    sfx?.setHidden(document.hidden);
    last = performance.now();
  });
  title.innerHTML = 'Dark Planet: die Sly-Version<br>(der Prototyp von 1997)<br><br>' +
    (TOUCH_DEVICE ? 'Zum Starten tippen' : 'Taste drücken');
  requestAnimationFrame(frame);
}

main();
