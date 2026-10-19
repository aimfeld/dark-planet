import { describe, expect, it } from 'vitest';
import { BOSS_FREEZE_TICKS, enemyDestroyed } from '../src/sim/enemies';
import { LIVES_TEXT } from '../src/sim/player';
import { createWorld, FADE_STEPS, NO_INPUT, type World } from '../src/sim/state';
import { levelOver, newGame, step } from '../src/sim/tick';
import { gameData, hasData } from './helpers';

/** Level 1 up to the boss start, the player kept invulnerable so idling doesn't end the game. */
async function atBoss(): Promise<World> {
  const w = createWorld(await gameData(), 11);
  newGame(w);
  const p = w.players[0];
  while (w.scrolling) {
    p.invulnerable = true;
    p.invCounter = 0;
    step(w, [NO_INPUT]);
  }
  p.invulnerable = false;
  return w;
}

describe.skipIf(!hasData)('level 1 boss and level end (spec §8.1, §8.2, §9.1)', () => {
  it('StartBossFight: clears the scene, spawns escort 0x24 and core 0x23 in slots 1-2, freezes for the fades', async () => {
    const w = await atBoss();
    expect(w.scrollY).toBe(-5561);
    expect(w.track).toBe(8);
    expect(w.freeze).toBe(BOSS_FREEZE_TICKS);
    expect([w.enemies[1].type, w.enemies[2].type]).toEqual([0x24, 0x23]);
    expect(w.enemies.filter((e) => e.active).length).toBe(2);
    expect(w.spr.y[w.players[0].slots.jet]).toBe(w.scrollY + 160);
    // escort (117, s + 117) and core (130, s + 100) are bottom edges
    expect(w.spr.x[w.enemies[2].slot]).toBe(130);
    const frame = w.frame;
    const fades: number[] = [];
    for (let t = 0; t < BOSS_FREEZE_TICKS; t++) {
      step(w, [NO_INPUT]);
      fades.push(w.fade);
    }
    expect(w.frame).toBe(frame); // the game stands still
    expect(Math.min(...fades)).toBe(0);
    expect(fades.at(-1)).toBe(FADE_STEPS);
    expect(w.freeze).toBe(0);
  });

  it('the core fires its 3-way spread (kind 10) at c = 50', async () => {
    const w = await atBoss();
    for (let t = 0; t < BOSS_FREEZE_TICKS; t++) step(w, [NO_INPUT]);
    const core = w.enemies[2];
    while (core.c !== 50) step(w, [NO_INPUT]);
    const kind10 = w.enemyShots.filter((s) => s.active && s.kind === 10);
    expect(kind10.map((s) => s.pattern).sort()).toEqual([1, 3, 4]);
  });

  it('core death: money, the escort vanishes, the wreck stays; the autopilot flies out and ends the level', async () => {
    const w = await atBoss();
    for (let t = 0; t < BOSS_FREEZE_TICKS; t++) step(w, [NO_INPUT]);
    const p = w.players[0];
    const money = p.money;
    enemyDestroyed(w, p, 2, true, true);
    expect(w.autopilot).toBe(true);
    expect(p.money).toBe(money + 1500);
    expect(w.enemies[1].active).toBe(false);
    expect(w.enemies[2].dying).toBe(true); // wreck 1022
    expect(w.spr.n[w.enemies[2].slot]).toBe(1022);
    let ticks = 0;
    while (levelOver(w) === null && ticks < 500) {
      step(w, [{ ...NO_INPUT, left: true }]); // input is ignored now
      ticks++;
    }
    expect(levelOver(w)).toBe('done');
    expect(w.gameCompleted).toBe(false);
    expect(Math.abs(w.spr.x[p.slots.jet] - 160)).toBeLessThanOrEqual(2);
    expect(w.spr.y[p.slots.jet]).toBeLessThanOrEqual(w.scrollY - 30);
  });
});

describe.skipIf(!hasData)('game over (spec §3.4)', () => {
  it('the last ship lost: "Loser!", sound 42 twice at 110, over when the countdown reaches 1', async () => {
    const w = createWorld(await gameData(), 3);
    newGame(w);
    const p = w.players[0];
    p.lives = 0;
    p.life = -1;
    step(w, [NO_INPUT]);
    expect(p.active).toBe(false);
    expect(w.texts.get(LIVES_TEXT[0])).toBe('Loser!');
    expect(w.gameOver).toBe(119);
    let loser = 0;
    let ticks = 1;
    while (levelOver(w) === null) {
      step(w, [NO_INPUT]);
      loser += w.sounds.filter((s) => s.n === 42).length;
      ticks++;
    }
    expect(levelOver(w)).toBe('gameover');
    expect(ticks).toBe(119);
    expect(loser).toBe(2);
  });
});
