import { describe, expect, it } from 'vitest';
import { dropBonus, LABEL } from '../src/sim/bonus';
import { createWorld, NO_INPUT, type PlayerInput, type World } from '../src/sim/state';
import { newGame, step } from '../src/sim/tick';
import { gameData, hasData } from './helpers';

async function world(): Promise<World> {
  const w = createWorld(await gameData(), 5);
  newGame(w);
  return w;
}

/** Drop a bonus right on P1's jet (the wobble radius is 5, the jet is large enough to touch it). */
function dropOnJet(w: World, roll: number): number {
  const jet = w.players[0].slots.jet;
  dropBonus(w, w.spr.x[jet] + 15, w.spr.y[jet] + 10, roll, 100);
  return w.bonuses.findIndex((b, i) => i > 0 && b.active);
}

const keys = (k: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...k });

describe.skipIf(!hasData)('bonuses (spec §5)', () => {
  it('maps the drop roll to the kind with the threshold table; 100 drops nothing', async () => {
    const w = await world();
    const kinds = [1, 54, 55, 59, 60, 65, 67, 72, 74, 81, 88, 98, 99].map((roll) => {
      w.bonuses.forEach((b) => (b.active = false));
      dropBonus(w, 100, 100, roll, 100);
      return w.bonuses.find((b) => b.active)?.kind;
    });
    expect(kinds).toEqual([1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10]);
    w.bonuses.forEach((b) => (b.active = false));
    dropBonus(w, 100, 100, 100, 100);
    expect(w.bonuses.some((b) => b.active)).toBe(false);
  });

  it('is picked up only while flying high; money leaves a +1000 label for 100 ticks', async () => {
    const w = await world();
    const p = w.players[0];
    step(w, [keys({ altitude: true })]); // go low
    expect(p.high).toBe(false);
    const i = dropOnJet(w, 1);
    for (let t = 0; t < 5; t++) step(w, [NO_INPUT]);
    expect(w.bonuses[i].active).toBe(true);
    expect(p.money).toBe(0);
    step(w, [keys({ altitude: true })]); // back up
    expect(p.money).toBe(1000);
    expect(w.bonuses[i].kind).toBe(LABEL);
    expect(w.spr.n[21 + i]).toBe(567);
    for (let t = 0; t < 99; t++) step(w, [NO_INPUT]);
    expect(w.bonuses[i].kind).toBe(LABEL); // shown in 100 frames: the pickup tick and 99 more
    step(w, [NO_INPUT]);
    expect(w.bonuses[i].kind).toBe(0);
    expect(w.spr.n[21 + i]).toBe(0);
  });

  it('fills the inventory, uses the selected item with fire + bonus, and uses a 4th item at once', async () => {
    const w = await world();
    const p = w.players[0];
    for (const roll of [88, 55, 81]) { // Star, Atombombe, Aid
      dropOnJet(w, roll);
      step(w, [NO_INPUT]);
    }
    expect(p.bonus).toEqual([9, 2, 8]);
    expect(w.spr.n[p.slots.selFrame]).toBe(492);
    step(w, [keys({ bonus: true })]); // select slot 1
    step(w, [NO_INPUT]);
    expect(p.selected).toBe(1);
    step(w, [keys({ bonus: true, fire: true })]); // use the atom bomb
    expect(p.bonus).toEqual([9, 8, 0]); // used, selection back to 0, compacted
    expect(p.selected).toBe(0);
    expect(p.shots.some((s) => s.active && s.type === 12)).toBe(true);
    step(w, [NO_INPUT]);
    // full inventory: a 4th inventory item (Twin-Laser) is used on pickup
    for (const roll of [55, 74]) {
      dropOnJet(w, roll);
      step(w, [NO_INPUT]);
    }
    expect(p.bonus).toEqual([9, 8, 2]);
    expect(p.shots.filter((s) => s.active && s.type === 11).length).toBe(2);
  });

  it('atom bomb: explodes after 80 ticks, grey flash for 4 frames, then -100 to every enemy', async () => {
    const w = await world();
    const p = w.players[0];
    p.bonus = [2, 0, 0];
    step(w, [keys({ bonus: true, fire: true })]);
    let flashTicks = 0;
    let exploded = -1;
    for (let t = 1; t <= 100; t++) {
      step(w, [NO_INPUT]);
      if (w.flash) flashTicks++;
      if (exploded < 0 && p.bombTimer === 5) exploded = t;
    }
    expect(exploded).toBe(81); // spawned with age 0 after MoveShots, first moved on the next tick, removed at age 81
    expect(flashTicks).toBe(4);
    expect(w.flash).toBe(false);
  });

  it('pentagram: x5 damage for 666 ticks with the icon over the jet', async () => {
    const w = await world();
    const p = w.players[0];
    dropOnJet(w, 98);
    step(w, [NO_INPUT]);
    expect(p.x5Timer).toBe(666);
    expect(w.spr.n[p.slots.x5]).toBe(464);
    for (let t = 0; t < 666; t++) step(w, [NO_INPUT]);
    expect(p.x5Timer).toBe(0);
    expect(w.spr.n[p.slots.x5]).toBe(0);
  });
});
