// The videos AAPLAY.EXE played around DP.EXE: the intro (DPMAX.BAT: STARTAUD plays CD track 4, then
// `aaplay intro.txt`) and the ending (endvideo.bat: track 9, `aaplay ending.txt`).

import { cdPlay, TICK_MS, waitMouseUp, waitNoKey, type Ctx, type Proc } from './proc';

/** Play a video with its CD track; a key or a click skips it (remake: AAPLAY's own keys aren't decoded). */
export function* playVideo(ctx: Ctx, name: string, track: number): Proc {
  const video = ctx.video;
  if (!video) return;
  cdPlay(ctx, track);
  video.play(name);
  ctx.view = 'video';
  yield* waitNoKey(ctx);
  yield* waitMouseUp(ctx);
  while (video.playing && !ctx.input.anyKey() && !ctx.input.mouse.down) yield TICK_MS;
  video.stop();
  ctx.view = 'screen';
  yield* waitNoKey(ctx);
  yield* waitMouseUp(ctx);
}
