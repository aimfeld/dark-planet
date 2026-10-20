import { describe, expect, it } from 'vitest';
import type { Music } from '../src/audio/music';
import { Game } from '../src/game';
import { createWorld } from '../src/sim/state';
import type { VideoPlayer } from '../src/video';
import { gameData, hasData } from './helpers';
import { Script } from './menuHarness';

class FakeVideo implements VideoPlayer {
  played: string[] = [];
  playing = false;
  play(name: string): void {
    this.played.push(name);
    this.playing = true;
  }
  stop(): void {
    this.playing = false;
  }
}

function fakeMusic(tracks: number[]): Music {
  let current = 0;
  return {
    play: (t: number) => tracks.push((current = t)),
    get current() {
      return current;
    },
    setEnabled: () => undefined,
    stop: () => undefined,
    unlock: () => undefined,
  } as unknown as Music;
}

describe.skipIf(!hasData)('videos (DPMAX.BAT, endvideo.bat)', () => {
  it('boots into the intro with CD track 4; a key skips it to the main menu (track 2)', async () => {
    const input = new Script();
    const video = new FakeVideo();
    const tracks: number[] = [];
    const game = new Game(createWorld(await gameData(), 1), input, undefined, undefined, fakeMusic(tracks), undefined, undefined, video);
    const run = (n: number) => {
      for (let i = 0; i < n; i++) game.tick(input);
    };
    run(5);
    expect(video.played).toEqual(['intro']);
    expect(game.view).toBe('video');
    expect(tracks).toEqual([4]);
    run(100);
    expect(game.view).toBe('video'); // runs until it ends or a key is pressed
    input.keys.add('Enter');
    run(2);
    input.keys.delete('Enter');
    run(5);
    expect(video.playing).toBe(false);
    expect(game.view).toBe('screen');
    expect(tracks).toEqual([4, 2]);
  });

  it('the main menu follows when the intro ends by itself', async () => {
    const input = new Script();
    const video = new FakeVideo();
    const game = new Game(createWorld(await gameData(), 1), input, undefined, undefined, undefined, undefined, undefined, video);
    for (let i = 0; i < 5; i++) game.tick(input);
    video.playing = false;
    for (let i = 0; i < 5; i++) game.tick(input);
    expect(game.view).toBe('screen');
    expect(game.screen.picture).toBe('HMBILD');
  });
});
