"""Dump DP.EXE's enemy and enemy-shot tables (initialised data segment) as Markdown or JSON.

Usage: python3 tools/enemy_table.py original_source [--json out.json]
  reads Game/DP.EXE and Game/LEVEL1-6.LEV below the given directory

All tables are Turbo Pascal arrays in DS (linear 0x328D0); element i sits at base + size*i
(the "virtual" base the code indexes with). Evidence: docs/re-notes.md "Gameplay (session 4)".
  SpawnEnemy @0x1163A   sprite DS:0x19FA, energy 0x1966 (x1.5 in two-player), layer 0x191D
  KillEnemy @0x11A08    wreck sprite 0x1A8E, explosion kind per type (EXPL below, from the code)
  0x12A1E / 0x18978     money reward 0x1BB6, ram damage to the player 0x1B22
  1d9e:1C8A             shadow offset 0x1C4A / 0x1CDE (air enemies: 12,12)
  EnemyGuns @0x193CD    gun class 0x1D73[type]; per class fire delay 0x1DBD, scripted-only 0x1DDF;
                        per gun kind 0x1DFD, dx 0x1E7C, dy 0x1F84, inter-shot 0x208C,
                        salvo pause 0x2194, salvo size 0x229C, flight pattern 0x23A4
  EnemyFire @0x15069    shot kind: sprite 0x24B4, damage 0x24EE, sound 0x2528, speed 0x2562
  SpriteCycles 1d9e:3105 (0x20AE5, every frame): a sprite whose number is in [first, last) advances
                        by 1, and one equal to last jumps back to first, on frames where a frame
                        counter (DS:0x5530) mod rate = 0. 48 global cycles (first 0x1238, last 0x1298,
                        rate byte 0x12F8), plus 24 for episode 1 (0x1328/0x1358/0x1388) or 37 for
                        episode 2 (0x13A0/0x13EA/0x1434).
"""
import json, os, struct, sys

DS_FILE_OFFSET = 0x328D0 - 0x10000 + 8608  # DS = linear 0x328D0; MZ header 8608 bytes
GAME = DS = None


def load(src):
    """Read DP.EXE below <src>/Game; the table readers below need this first."""
    global GAME, DS
    GAME = os.path.join(src, 'Game')
    DS = open(os.path.join(GAME, 'DP.EXE'), 'rb').read()[DS_FILE_OFFSET:]


def b(o): return DS[o]
def w(o): return struct.unpack_from('<h', DS, o)[0]


LIBS = [(1, 'jets'), (43, 'pods'), (146, 'shots'), (293, 'expl'), (393, 'boni'), (490, 'anzeigen'),
        (493, 'shop'), (544, 'rest'), (850, 'geg1'), (1000, 'aschen1'), (1024, 'geg2'), (1165, 'geg21'),
        (1243, 'geg22'), (1355, 'aschen2')]


def lib(n):
    if n <= 0: return '-'
    base, name = max((x for x in LIBS if x[0] <= n), key=lambda x: x[0])
    return '%d (%s+%d)' % (n, name, n - base)


BOSS = {0x05, 0x20, 0x23, 0x3C, 0x43, 0x48}
# KillEnemy @0x11A08: Explode(kind, x + dx, y + dy) per type, (x, y) = the enemy sprite's top-left.
# rnd: dx/dy get + Random(rnd) (only type 0x17). Types without an entry make no explosion.
EXPLOSION = {}  # type -> (kind, dx, dy, rnd)
for t in (0x13, 0x0E): EXPLOSION[t] = (1, 0, 0, 0)
for t in (1, 2, 3, 0x11, 0x12, 0x29, 0x2A, 0x2C, 0x2F, 0x33, 0x35, 0x3B, 0x41): EXPLOSION[t] = (2, -10, 0, 0)
for t in (4, 0xC, 0x1E, 0x1F): EXPLOSION[t] = (8, -40, -40, 0)
for t in (6, 8, 0xB, 0x21, 0x22, 0x26, 0x2B, 0x2D, 0x3A): EXPLOSION[t] = (10, -40, -40, 0)
for t in (7, 0xD, 0x1B, 0x15): EXPLOSION[t] = (11, -40, -25, 0)
EXPLOSION[10] = (13, -40, -25, 0)
for t in (9, 0x14, 0x27): EXPLOSION[t] = (16, -10, -12, 0)
for t in BOSS: EXPLOSION[t] = (15, -30, -20, 0)
for t in (0xF, 0x25, 0x28, 0x2E, 0x32, 0x34, 0x36, 0x3F, 0x42): EXPLOSION[t] = (17, -16, -16, 0)
for t in (0x10, 0x30, 0x37, 0x39, 0x40): EXPLOSION[t] = (19, 0, 0, 0)
EXPLOSION[0x17] = (9, -70, -50, 30)
EXPLOSION[0x1C] = (21, 0, 0, 0)
EXPLOSION[0x24] = (22, 0, 0, 0)
for t in (0x31, 0x38, 0x3D, 0x3E, 0x44, 0x45, 0x46, 0x47): EXPLOSION[t] = (24, -40, -30, 0)
KILL_SOUND = {0x16: 0x20, 0x1A: 0x20, 0x1D: 0x20, 0x18: 0x21}  # no explosion, a sound instead


def explosion_text(t):
    if t in KILL_SOUND: return 'none, snd 0x%X' % KILL_SOUND[t]
    if t not in EXPLOSION: return 'none'
    k, dx, dy, rnd = EXPLOSION[t]
    if rnd: return '%d (rnd)' % k
    text = str(k) if (dx, dy) == (0, 0) else '%d (x%d)' % (k, dx) if dy == 0 else '%d (%d,%d)' % (k, dx, dy)
    return text + (' +shake' if k == 15 else '')


SPAWN_FX = {8: 'anim 0x12, snd 0x14', 0xF: 'anim 7', 0x14: 'anim 0xE', 0x17: 'snd 0x1E', 0x2C: 'snd 0x2E',
            0x36: 'anim 0x1A', 0x42: 'snd 0x2F, anim 0x23', 0x4A: 'anim 0x29'}


def shot_kind(k):
    return dict(kind=k, sprite=w(0x24B4 + 2 * k), damage=w(0x24EE + 2 * k), sound=w(0x2528 + 2 * k),
                speed=w(0x2562 + 2 * k))


def guns(gc):
    out = []
    for g in range(1, 5):
        k = b(0x1DFD + 4 * gc + g)
        if k == 0: continue
        o = gc * 8 + g * 2
        out.append(dict(gun=g, kind=k, flugart=b(0x23A4 + o), dx=w(0x1E7C + o), dy=w(0x1F84 + o),
                        inter=b(0x208C + o), salvo_pause=b(0x2194 + o), salvo=b(0x229C + o)))
    return out


def level_usage():
    use = {}
    for n in range(1, 7):
        d = open(os.path.join(GAME, 'LEVEL%d.LEV' % n), 'rb').read()[2000:]
        for i in range(600):
            y, x, t, s, f = struct.unpack_from('<hhBBB', d, 7 * i)
            if y == 100: continue
            u = use.setdefault(t, {})
            u.setdefault(n, set()).add(s)
    return use


def sprite_cycles():
    out = {}
    for name, first, last, rate, n in (('global', 0x1236, 0x1296, 0x12F7, 48),
                                       ('episode1', 0x1326, 0x1356, 0x1387, 24),
                                       ('episode2', 0x139E, 0x13E8, 0x1433, 37)):
        out[name] = [dict(first=w(first + 2 * i), last=w(last + 2 * i), rate=b(rate + i)) for i in range(1, n + 1)]
    return out


def enemy_types():
    use = level_usage()
    rows = []
    for t in range(1, 0x4B):
        gc = b(0x1D73 + t)
        e = w(0x1966 + 2 * t)
        r = dict(type=t, sprite=w(0x19FA + 2 * t), layer=b(0x191D + t), energy=e,
                 energy_2p=e + int(round(e / 100 * 50)), reward=w(0x1BB6 + 2 * t), ram_damage=w(0x1B22 + 2 * t),
                 wreck=w(0x1A8E + 2 * t), shadow=(w(0x1C4A + 2 * t), w(0x1CDE + 2 * t)), gun_class=gc,
                 fire_delay=b(0x1DBD + gc) if gc else None, scripted_only=bool(b(0x1DDF + gc)) if gc else None,
                 guns=guns(gc) if gc else [], boss=t in BOSS, explosion=explosion_text(t),
                 explosion_kind=dict(zip(('kind', 'dx', 'dy', 'rnd'), EXPLOSION[t])) if t in EXPLOSION else None,
                 kill_sound=KILL_SOUND.get(t),
                 spawn_fx=SPAWN_FX.get(t, ''),
                 levels={n: sorted(s) for n, s in sorted(use.get(t, {}).items())})
        rows.append(r)
    return rows


def main():
    load(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'original_source')
    rows = enemy_types()
    kinds = [shot_kind(k) for k in range(1, 30)]
    if '--json' in sys.argv:
        json.dump(dict(types=rows, shot_kinds=kinds, sprite_cycles=sprite_cycles()), open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)
    print('| type | sprite | layer | energy (2P) | reward | ram dmg | wreck | shadow dx,dy | guns (kind/flugart @dx,dy: inter/salvo/pause) | fire delay | explosion | levels: subs |')
    print('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for r in rows:
        g = '; '.join('k%d/f%d @%d,%d: %d/%d/%d' % (x['kind'], x['flugart'], x['dx'], x['dy'], x['inter'], x['salvo'],
                                                     x['salvo_pause']) for x in r['guns'])
        if r['scripted_only']: g += ' (scripted only)'
        sh = '12,12 (air)' if r['layer'] == 1 else ('%d,%d' % r['shadow'] if r['shadow'][0] else 'none')
        lv = ' '.join('L%d:%s' % (n, ','.join('%x' % s for s in subs)) for n, subs in r['levels'].items())
        name = '0x%02X%s' % (r['type'], ' BOSS' if r['boss'] else '')
        print('| %s | %s | %d | %d (%d) | %d | %d | %s | %s | %s | %s | %s | %s |' % (
            name, lib(r['sprite']), r['layer'], r['energy'], r['energy_2p'], r['reward'], r['ram_damage'],
            lib(r['wreck']), sh, g or '-', r['fire_delay'] if r['fire_delay'] is not None else '-', r['explosion'],
            (lv + (' ' + r['spawn_fx'] if r['spawn_fx'] else '')) or '-'))
    print()
    print('| shot kind | sprite | damage | speed | sound |')
    print('|---|---|---|---|---|')
    for k in kinds:
        print('| %d | %s | %d | %d | 0x%X |' % (k['kind'], lib(k['sprite']), k['damage'], k['speed'], k['sound']))
    print()
    print('| sprite cycles | first..last / rate (frames) |')
    print('|---|---|')
    for name, cyc in sprite_cycles().items():
        print('| %s | %s |' % (name, ', '.join('%d..%d/%d' % (c['first'], c['last'], c['rate']) for c in cyc)))


if __name__ == '__main__':
    main()
