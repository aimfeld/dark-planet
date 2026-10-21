import { describe, expect, it } from 'vitest';
import type { Music } from '../src/audio/music';
import { DEFAULT_SETTINGS, Game } from '../src/game';
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

/** Press and release a key. */
function press(game: Game, input: Script, code: string): void {
  input.keys.add(code);
  for (let i = 0; i < 2; i++) game.tick(input);
  input.keys.delete(code);
}

describe.skipIf(!hasData)('start screen', () => {
  it('waits for a version; Enter takes the selected one (the setting), arrows switch it', async () => {
    const input = new Script();
    const video = new FakeVideo();
    const saved: boolean[] = [];
    const settings = { ...DEFAULT_SETTINGS, control: [1, 4] as [number, number] };
    const game = new Game(createWorld(await gameData(), 1), input, settings, undefined, undefined, (s) => saved.push(s.remastered), undefined, video);
    const run = (n: number) => {
      for (let i = 0; i < n; i++) game.tick(input);
    };
    run(100);
    expect(game.atStart).toBe(true);
    expect(game.screen.picture).toBe('RASTER');
    expect(video.played).toEqual([]);
    const texts = [...game.screen.texts.values()];
    expect(texts.find((t) => t.text === 'Classic 1998')).toMatchObject({ font: 'BROADWA', classic: true });
    expect(texts.find((t) => t.text === 'Remastered 2026')).toMatchObject({ font: 'BROADWA', classic: false });
    const fonts = () => [...game.screen.texts.values()].map((t) => `${t.text}:${t.classic}`);
    expect(fonts()).toContain('inspiriert von Raptor und Xenon 2.:false'); // the other texts in the selected version's font
    press(game, input, 'ArrowUp');
    run(10);
    expect(fonts()).toContain('inspiriert von Raptor und Xenon 2.:true');
    expect(fonts()).toContain('DARK PLANET:true');
    expect(fonts()).toContain('Remastered 2026:false');
    expect(game.screen.classic[12]).toBe(1); // the cursor
    expect(game.screen.classicPicture).toBe(true);
    press(game, input, 'Enter');
    run(40);
    expect(game.atStart).toBe(false);
    expect(settings.remastered).toBe(false);
    expect(saved).toEqual([false]);
    expect(video.played).toEqual(['intro']);
  });

  it('the HD button (or R) switching the graphics moves the cursor to that version', async () => {
    const input = new Script();
    const settings = { ...DEFAULT_SETTINGS, control: [5, 4] as [number, number] };
    const game = new Game(createWorld(await gameData(), 1), input, settings, undefined, undefined, undefined, undefined, new FakeVideo());
    const run = (n: number) => {
      for (let i = 0; i < n; i++) game.tick(input);
    };
    run(40);
    expect(game.screen.classic[12]).toBe(0); // on Remastered 2026
    settings.remastered = false; // main.ts's toggleRemaster
    run(5);
    expect(game.screen.classic[12]).toBe(1);
    expect(game.screen.y[12]).toBe(94 - 10); // beside Classic 1998
    expect(game.atStart).toBe(true); // switched, not chosen
    settings.remastered = true;
    run(5);
    expect(game.screen.y[12]).toBe(118 - 10);
  });

  it('Prototyp 1997 asks main.ts to open sly.html; back on the page, the start screen shows again', async () => {
    const input = new Script();
    const settings = { ...DEFAULT_SETTINGS, control: [1, 4] as [number, number] };
    const game = new Game(createWorld(await gameData(), 1), input, settings, undefined, undefined, undefined, undefined, new FakeVideo());
    const run = (n: number) => {
      for (let i = 0; i < n; i++) game.tick(input);
    };
    run(40);
    expect([...game.screen.texts.values()].find((t) => t.text === 'Prototyp 1997')).toMatchObject({ font: 'DEFAULT', classic: true });
    press(game, input, 'ArrowDown'); // Remastered 2026 -> Prototyp 1997
    run(10);
    expect(game.screen.y[12]).toBe(142 - 10);
    press(game, input, 'Enter');
    run(40);
    expect(game.launch).toBe('sly.html');
    expect(settings.remastered).toBe(true); // unchanged
    game.launch = null; // main.ts opened it
    run(40);
    expect(game.atStart).toBe(true);
    expect(game.screen.fade).toBeGreaterThan(0);
  });

  it('a click on a button chooses it', async () => {
    const input = new Script();
    const settings = { ...DEFAULT_SETTINGS, control: [1, 4] as [number, number], remastered: false };
    const game = new Game(createWorld(await gameData(), 1), input, settings, undefined, undefined, undefined, undefined, new FakeVideo());
    const run = (n: number) => {
      for (let i = 0; i < n; i++) game.tick(input);
    };
    run(40);
    input.mouse.x = 150;
    input.mouse.y = 124; // Remastered 2026
    run(5);
    input.mouse.left = true;
    run(2);
    input.mouse.left = false;
    run(40);
    expect(game.atStart).toBe(false);
    expect(settings.remastered).toBe(true);
  });
});

describe.skipIf(!hasData)('videos (DPMAX.BAT, endvideo.bat)', () => {
  it('boots into the intro with CD track 4; a key skips it to the main menu (track 2)', async () => {
    const input = new Script();
    const video = new FakeVideo();
    const tracks: number[] = [];
    const game = new Game(createWorld(await gameData(), 1), input, undefined, undefined, fakeMusic(tracks), undefined, undefined, video);
    const run = (n: number) => {
      for (let i = 0; i < n; i++) game.tick(input);
    };
    run(20);
    expect(tracks).toEqual([]); // the start screen is silent
    press(game, input, 'Enter');
    run(40);
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
    const game = new Game(createWorld(await gameData(), 1), input, undefined, undefined, undefined, undefined, undefined, video, false);
    for (let i = 0; i < 5; i++) game.tick(input);
    video.playing = false;
    for (let i = 0; i < 5; i++) game.tick(input);
    expect(game.view).toBe('screen');
    expect(game.screen.picture).toBe('HMBILD');
  });
});
