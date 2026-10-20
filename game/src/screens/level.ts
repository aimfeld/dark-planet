// One level as a coroutine: the game loop @0x1B787 runs one simulation tick per 40 Hz tick, then
// AfterLevel @0x1B6D1 (fade out, or straight back to the main menu after game over and Esc).

import { FADE_STEPS } from '../sim/state';
import { levelOver, startLevel, step } from '../sim/tick';
import type { TouchKey } from '../input/touch';
import { cdPlay, delay, RETRACE_MS, TICK_MS, type Ctx, type Proc } from './proc';

const PAUSE_KEY: TouchKey = { code: 'KeyP', label: '❚❚' };
const TOUCH_PLAYING = [PAUSE_KEY];
const TOUCH_PAUSED = [PAUSE_KEY, { code: 'Escape', label: '✕' }];

export type LevelResult = 'done' | 'gameover' | 'abort';

/** The simulation's sound events go to the SFX player (if sound effects are on). */
export function worldSounds(ctx: Ctx): void {
  const w = ctx.world;
  if (ctx.settings.soundEffects) ctx.sfx?.handle(w.sounds);
  w.sounds = [];
}

export function* playLevel(ctx: Ctx, level: number): Proc<LevelResult> {
  const w = ctx.world;
  const held = (code: string) => ctx.input.held(code);
  startLevel(w, level); // the level appears at full brightness (Epis1.pal set without a fade-in)
  ctx.view = 'world';
  cdPlay(ctx, w.track);
  worldSounds(ctx); // the engine loops LevelStart started
  let result: LevelResult | null = null;
  ctx.touchKeys = TOUCH_PLAYING;
  while (result === null) {
    if (held('KeyP') && (yield* pause(ctx))) {
      result = 'abort';
      break;
    }
    step(w, ctx.input.players);
    worldSounds(ctx);
    if (w.track !== (ctx.music?.current ?? w.track)) cdPlay(ctx, w.track); // boss music (StartBossFight)
    yield TICK_MS;
    const over = levelOver(w);
    if (over) result = over;
    else if (held('Escape')) result = 'abort';
  }
  ctx.touchKeys = [];
  // AfterLevel: every sound stops except 50 (the level 4 tank's death roar).
  ctx.sfx?.stopAll(50);
  if (result === 'done') {
    for (let i = 19; i >= 0; i--) {
      w.fade = Math.round((FADE_STEPS * i) / 20); // FadeOut(1, 20, 0)
      yield RETRACE_MS;
    }
  }
  return result;
}

/**
 * Pause (P, DS:0x4440): Delay(500), then wait for the next P press. The remake also takes Esc here, which
 * ends the level (true), so a touch player can abort from the pause, where the ✕ button is offered.
 */
function* pause(ctx: Ctx): Proc<boolean> {
  const held = () => ctx.input.held('KeyP');
  ctx.paused = true;
  ctx.touchKeys = TOUCH_PAUSED;
  yield* delay(500);
  while (held()) yield TICK_MS;
  while (!held() && !ctx.input.held('Escape')) yield TICK_MS;
  const abort = ctx.input.held('Escape');
  while (held()) yield TICK_MS;
  ctx.paused = false;
  ctx.touchKeys = TOUCH_PLAYING;
  return abort;
}
