// The Sly version (sly.html): the 1997 prototype of Dark Planet. A title until a key or tap (browsers play sound
// only after one), then SLYVERS's main program (sim.ts) in real time; when it ends, Enter plays again and Esc goes
// back to Dark Planet. Keyboard (arrows, X or Ctrl fires, Esc quits), gamepad, and touch on phones and tablets.
// Sly laughs once the title shows (user, session 22), or with the key that starts the game where the browser
// doesn't allow sound before a gesture on this page.

import { Sfx } from '../audio/sfx';
import { toggleFullscreen } from '../input/fullscreen';
import { Gamepad } from '../input/gamepad';
import { Keyboard } from '../input/keyboard';
import { TouchControls, touchLayout, type TouchKey } from '../input/touch';
import { strings, storedLanguage } from '../i18n';
import { loadSlyData } from './data';
import { Sly } from './sim';
import { SlyView } from './view';

const TOUCH_DEVICE = window.matchMedia('(pointer: coarse)').matches;
const MAX_CATCH_UP_MS = 200; // after a stall, don't race through the missed time
const LAUGH = 38; // FXInit's Sounds[38], LACHEN2: Sly's laugh
/**
 * Sly's voice clips during the fight (Sounds[34..37]: MOOMOO, MERVEUX, TOETEN, KUCHEN) and his laugh at the end
 * (38, LACHEN2) 3 x louder (+9.5 dB), and while one plays the other sounds at a third (-10 dB): at their original
 * level the two looping GLEITER voices and the boss's shots drown them (user, session 22). KUCKMAL (39) at the boss
 * start already plays as three voices at once.
 */
const VOICES = { gains: { 34: 3, 35: 3, 36: 3, 37: 3, 38: 3 }, duck: 0.32 };

const t = strings(storedLanguage()); // Dark Planet's language setting
const PLAY_KEYS: TouchKey[] = [{ code: 'Escape', label: 'Esc' }];
const END_KEYS: TouchKey[] = [{ code: 'Enter', label: t.sly.again }, { code: 'Escape', label: t.sly.back }];

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
  document.documentElement.lang = storedLanguage();
  legend.textContent = t.sly.keys;
  status.textContent = t.loading;
  const data = await loadSlyData({
    json: async (name) => (await fetch(base + 'sly/' + name)).json(),
    binary: async (name) => (await fetch(base + 'sly/' + name)).arrayBuffer(),
  }).catch((e) => {
    status.textContent = t.loadFailed('game/public/sly/');
    throw e;
  });
  const sfx = await Sfx.load(base + 'sly/', VOICES).catch((e) => {
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

  let laughed = false;
  const laugh = () => {
    if (sfx === undefined || laughed) return;
    void sfx.tryStart().then((playing) => {
      if (!playing || laughed) return;
      laughed = true;
      sfx.handle([{ n: LAUGH }]);
    });
  };

  const start = () => {
    if (state === 'end') sfx?.stopAll();
    else laugh(); // the title's laugh, if the browser held it back
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
    if (state === 'end') title.innerHTML = t.sly.end;
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
  title.innerHTML = `${t.sly.title}<br><br>${t.sly.start(TOUCH_DEVICE)}`;
  requestAnimationFrame(frame);
  laugh();
}

main();
