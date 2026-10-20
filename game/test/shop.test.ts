// The shop (screens/shop.ts) and SAVE.DAT (save.ts), driven through the hangar with scripted mouse clicks.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave, saveChecksum } from '../src/save';
import { offers, price, savePrice } from '../src/screens/shop';
import { createWorld, newPlayer } from '../src/sim/state';
import { newGameState } from '../src/sim/tick';
import { gameData, hasData } from './helpers';
import { setup } from './menuHarness';

const SAMPLE_SAVE = join(__dirname, '..', '..', 'original_source', 'Game', 'SAVE.DAT');
const MODE = { buy: [170, 139], sell: [210, 139], position: [250, 139], exit: [290, 139] } as const;
const box = (i: number) => [56 * i - 10, 175] as const;
const CATEGORY_RIGHT = [143, 142] as const;

/** New game, the GEDANKE cheat (666666 money), then the shop. */
async function inShop() {
  const h = await setup();
  h.run(40);
  h.press('Enter'); // Neues Spiel
  h.run(40);
  for (const k of ['KeyG', 'KeyE', 'KeyD', 'KeyA', 'KeyN', 'KeyK', 'KeyE']) h.press(k, 2, 4);
  h.click(280, 130, 80); // Shop
  return h;
}

describe.skipIf(!hasData)('shop', () => {
  it('offers: sorted by price, every large pod listed, jets only above the current one', async () => {
    const data = await gameData();
    const w = createWorld(data, 1);
    const ctx = { data, world: w } as Parameters<typeof offers>[0];
    const large = offers(ctx, w.players[0], 2).map((o) => o.id);
    expect(large).toEqual([3, 4, 8, 6, 5, 10, 7, 9, 2, 1, 11]); // E-Shocker and Rocketlauncher both 60000 (§12 #1)
    expect(offers(ctx, w.players[0], 3).map((o) => o.id)).toEqual([11, 8, 2, 7, 9, 4, 5, 6]);
    const p = newPlayer(0);
    p.jet = 3;
    expect(offers(ctx, p, 7).map((o) => o.id)).toEqual([4, 5]);
    expect([1, 2, 3, 6, 7].map(savePrice)).toEqual([4000, 4000, 14000, 44000, 44000]);
    w.level = 4;
    expect(price(ctx, 3, 11)).toBe(24000);
  });

  it('large-pod frames on all five mounts of the Alien-Pro 2 stay beside the header icon (slots 26..30 vs 31)', async () => {
    const { game, click } = await inShop();
    const s = game.screen;
    for (let i = 0; i < 5; i++) click(...CATEGORY_RIGHT, 20); // 2 -> 7 Jets
    click(...box(4)); // Alien-Pro 2
    click(...MODE.buy, 40);
    expect(game.world.players[0].jet).toBe(5);
    for (let i = 0; i < 7 && s.texts.get(840)?.text !== 'Grosse Pods'; i++) click(...CATEGORY_RIGHT, 20);
    expect(s.texts.get(840)?.text).toBe('Grosse Pods');
    click(...box(1)); // Plasmapod: its icon in the header
    expect([26, 27, 28, 29, 30].map((k) => s.n[k])).toEqual([497, 497, 497, 497, 497]);
    expect([26, 27, 28, 29, 30].map((k) => s.x[k])).toEqual([103, 73, 133, 53, 153]);
    expect(s.n[31]).toBe(62);
  });

  it('screen, buying a large pod onto a mount, a jet, selling the engine, Save and Load', async () => {
    const { game, press, click, dump } = await inShop();
    const s = game.screen;
    const p = game.world.players[0];
    expect(s.picture).toBe('RASTER');
    expect(s.n[64]).toBe(501);
    expect(s.texts.get(840)?.text).toBe('Grosse Pods');
    expect(s.texts.get(837)?.text).toBe('666666');
    expect(s.texts.get(841)?.text).toBe('12500');
    expect(s.n[8]).toBe(0); // affordable: no shadow copy
    expect(s.texts.get(827)?.text).toBe('Wähle aus was du'); // SPEZIAL3
    dump('shop');

    click(...box(1)); // Plasmapod
    expect(s.n[24]).toBe(502);
    expect(s.texts.get(827)?.text).toBe('***PLASMAPOD***');
    click(...MODE.buy, 30);
    expect(s.n[1]).toBe(62); // the pod hangs on the pointer
    click(80, 55); // the Firestorm's large mount (position 4 = mount 3)
    expect(p.mounts[3]).toMatchObject({ occupied: true, item: 3, cat: 2 });
    expect(p.money).toBe(666666 - 12500);
    expect(s.n[1]).toBe(495);
    expect(s.n[54]).toBe(62); // drawn on the jet
    expect(s.texts.get(828)?.text).toBe('Investiert:12500');
    dump('shop-bought');

    click(...box(1));
    click(...MODE.buy, 30);
    expect(s.texts.get(827)?.text).toBe('Für diese Pods'); // SPEZIAL7: all positions taken, waits for a click
    click(20, 20);

    for (let i = 0; i < 5; i++) click(...CATEGORY_RIGHT, 20); // 2 -> 7 Jets
    expect(s.texts.get(840)?.text).toBe('Jets');
    click(...box(4)); // Alien-Pro 2
    click(...MODE.buy, 40);
    expect(p.jet).toBe(5);
    expect(p.mounts[2]).toMatchObject({ occupied: true, item: 5, cat: 8 });
    expect(p.money).toBe(666666 - 12500 - 130000);
    expect(s.n[128]).toBe(540);

    click(...MODE.sell);
    expect(s.n[13]).toBe(0); // offers hidden
    click(105, 85); // the engine
    expect(s.texts.get(827)?.text).toBe('***POSITRON-GPX***');
    click(...MODE.sell);
    expect(p.engine).toBe(0);
    expect(p.money).toBe(666666 - 12500 - 130000 + 5000);
    expect(s.texts.get(828)?.text).toBe('Rückzahlung: 5000');

    click(...MODE.buy);
    expect(s.texts.get(840)?.text).toBe('Antriebe'); // the category of the last selected position
    for (let i = 0; i < 6; i++) click(...CATEGORY_RIGHT, 20); // 4 -> 3 Boni
    expect(s.texts.get(840)?.text).toBe('Boni');
    expect(game.saves.read()).toBeNull();
    click(...box(1)); // Save, 4000 on level 1
    click(...MODE.buy, 40);
    expect(s.texts.get(827)?.text).toBe('Spiel gespeichert!');
    const money = p.money;
    expect(money).toBe(666666 - 12500 - 130000 + 5000 - 4000);

    click(...MODE.exit, 80);
    expect(s.picture).toBe('UMBILD');

    // Spend the money elsewhere, then load the save from the main menu ("Spiel laden").
    p.money = 1;
    p.mounts[3].occupied = false;
    click(150, 190, 80); // Zurück zu Hauptmenu
    expect(s.picture).toBe('HMBILD');
    press('ArrowDown', 1);
    press('Enter', 2, 80);
    expect(s.picture).toBe('UMBILD');
    const loaded = game.world.players[0];
    expect(loaded.money).toBe(money);
    expect(loaded.jet).toBe(5);
    expect(loaded.mounts[3]).toMatchObject({ occupied: true, item: 3 });
  });

  it('position change: a large pod moves to another mount', async () => {
    const { game, run, click } = await inShop();
    const p = game.world.players[0];
    p.jet = 5;
    p.mounts[3] = { reload: 0, loaded: true, occupied: true, item: 4, cat: 2 };
    click(...MODE.position);
    expect(game.screen.texts.get(827)?.text).toBe('Wähle den Pod');
    click(80, 55, 20); // pick up the MG at position 4 (mount 3)
    expect(p.mounts[3].occupied).toBe(false);
    expect(game.screen.n[1]).toBe(56);
    run(10);
    click(158, 55); // outer right (position 7 = mount 6) ...
    expect(p.mounts[6].occupied).toBe(false);
    expect(p.mounts[4]).toMatchObject({ occupied: true, item: 4, cat: 2 }); // ... slides inward (1d9e:4BE4)
    expect(game.screen.n[1]).toBe(495);
  });
});

describe.skipIf(!hasData)('SAVE.DAT', () => {
  it('round trip with the checksum', async () => {
    const data = await gameData();
    const w = createWorld(data, 1);
    newGameState(w);
    w.level = 4;
    w.players[0].money = 123456;
    w.players[0].bonus = [2, 7, 0];
    const b = encodeSave(w);
    expect(b.length).toBe(129);
    const w2 = createWorld(data, 2);
    expect(decodeSave(b, w2)).toBe(true);
    expect(w2.level).toBe(4);
    expect(w2.episode).toBe(2);
    expect(w2.players[0].money).toBe(123456);
    expect(w2.players[0].bonus).toEqual([2, 7, 0]);
    b[9] += 1; // more lives
    expect(decodeSave(b, w2)).toBe(false);
  });

  it.skipIf(!existsSync(SAMPLE_SAVE))('loads the original sample SAVE.DAT', async () => {
    const data = await gameData();
    const b = new Uint8Array(readFileSync(SAMPLE_SAVE));
    expect(saveChecksum(b)).toBe(618);
    const w = createWorld(data, 1);
    expect(decodeSave(b, w)).toBe(true);
    expect(w.level).toBe(2);
    expect(w.twoPlayer).toBe(false);
    expect(w.players[0]).toMatchObject({ lives: 6, money: 600, jet: 1 });
    expect(w.players[0].mounts[1]).toMatchObject({ occupied: true, item: 3, cat: 1 }); // Duallaser
  });
});
