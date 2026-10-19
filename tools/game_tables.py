"""Export every gameplay table the engine needs from DP.EXE to one JSON file.

Usage: python3 tools/game_tables.py original_source out.json [--check]
  --check  compares the result with the values stated in docs/gameplay-spec.md (exit 1 on a mismatch)

Two kinds of data:
- DS tables (Turbo Pascal arrays in the initialised data segment, linear 0x328D0), read from the file.
  Element i of a table sits at base + size * i (the "virtual" base the code indexes with).
- Tables that exist only as code (volleys in FirePods, explosion kinds in Explode, boss spawns in
  StartBossFight). They are transcribed below from the disassembly, with the address of the code.
Evidence: docs/re-notes.md "Gameplay (session 4)" and "Engine tables (session 5)"; rules in
docs/gameplay-spec.md. Enemy, enemy-shot and sprite-cycle tables come from tools/enemy_table.py.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import enemy_table as et  # noqa: E402
from enemy_table import b, w  # noqa: E402


def l(o):
    """Pascal longint."""
    return w(o) & 0xFFFF | w(o + 2) << 16


# Names: shop texts in INFO.PAS (the game draws them from there, not from DP.EXE).
JETS = ['Firestorm', 'Navi Spezial', 'Alien-Pro', 'Steptokopter', 'Alien-Pro 2']
ENGINES = ['Positron-GPX', 'Siderator', 'Positron-GPY']
SHIELDS = ['Shield 48C', 'Teslashield', 'Protector']
SMALL_PODS = ['Missiles', 'Myonenwerfer', 'Duallaser', 'Autogun', 'Protoner', 'Stargun', 'Sidefire']
LARGE_PODS = ['Flamer', 'Windstorm', 'Plasmapod', 'MG 2#-33mm', 'MK Pod', 'Elektroball', 'E-Shocker',
              'Sideralbolt', 'Rocketlauncher', 'Xenon', 'G-Destructor']
BALL_PODS = ['Smiley 2', 'Teutonenkopf', 'Distroyer', 'Teufelsreigen']
BONI = ['(money)', 'Atombombe', '(shield)', '1 Leben', 'Blast', 'Death', 'Twin-Laser', 'Aid', 'Star',
        '(pentagram)', 'Save']
# SMIX load order (DP.EXE @file 0x21AA for AREA.SND; AREA2.SND follows), 0-based PlaySound numbers
SOUNDS = ('STDSHOT LASER MINIPOD GSHOT GETBONUS ENGINE EXPLO1 EXPLO2 FLAMER FLAMEHIT BLAST PHASER3 GRLASER '
          'LACHEN MEGABOOM BOMBFALL DROHNE3 BOSS1W1 BOSS1W2 BOSS1W3 AIDBONUS LRM003B ALARM01 BMBLITZ EBALL '
          'SHOCKER SHOCKHIT BUBBLES ROCKET SUMM KIRCHE BLAST2 KILL HORSKILL LOSER BOSS2W1 BOSS2W2 BOSS2W3 '
          'WIEHER BURNING SBONUS SKRITISH SLOSER SSDEAKT SSHIELD SZIVIL AC DOORUP DUKE HELI SWARRIOR PANZER '
          'PTURN GOLEM GOLEM2 GOLEM3 GOLEM4 GOLEM5 GLASER').split()


def shot(dx, dy, pattern, shot_type):
    return dict(dx=dx, dy=dy, pattern=pattern, type=shot_type)


# FirePods @0x1961C -> SpawnShot @0x111A4(type, pattern, dx, dy, jet, mount): the shot sprite starts at
# (jetX + dx, jetY + dy). Anchors: "nose" = (cx, T) with cx = L + (R - L) div 2 and L/R/T the jet's extents;
# "mount" = the large pod's mount point (mx, my) (1d9e:0B2C); "ball" = ball pod sprite + (5, 5) - jet.
STANDARD_VOLLEYS = {  # category 8, per jet
    1: [shot(-2, 10, 1, 2)],
    2: [shot(-12, 8, 5, 1), shot(8, 8, 4, 1)],
    3: [shot(-12, 8, 1, 20), shot(8, 8, 1, 20)],
    4: [shot(-12, 8, 5, 16), shot(8, 8, 4, 16)],
    5: [shot(-12, 8, 1, 20), shot(8, 8, 1, 20)],
}
SMALL_VOLLEYS = {  # category 1
    1: [shot(-12, 8, 5, 1), shot(8, 8, 4, 1)],
    2: [shot(-10, 10, 1, 2), shot(5, 10, 1, 2)],
    3: [shot(-10, -175, 0, 3), shot(5, -175, 0, 3)],  # beams; pattern 0 re-glues them to the jet
    4: [shot(-6, 16, 7, 4), shot(4, 16, 7, 4)],
    5: [shot(-11, 16, 1, 15), shot(4, 16, 1, 15)],
    6: [shot(-3, 16, p, 19) for p in (15, 16, 17, 18)],
    7: [shot(-3, 10, 20, 23), shot(-3, 10, 19, 24)],
}
LARGE_VOLLEYS = {  # category 2: (shots, StartAnim number on the pod sprite or None)
    1: ([shot(-39, -64, 9, 5)], None),
    2: ([shot(2, 0, 10, 6)], 1),
    3: ([shot(3, 0, 1, 7)], 4),
    4: ([shot(7, 0, 1, 8)], 2),
    5: ([shot(5, 0, 1, 9)], 3),
    6: ([shot(0, 0, 1, 13)], 8),
    7: ([shot(2, -43, 1, 14)], 9),
    8: ([shot(0, -4, 1, 17)], 11),
    9: ([shot(0, 2, 14, 18), shot(8, 2, 14, 18)], 12),
    10: ([shot(4, 0, 1, 21)], None),
    11: ([shot(0, 0, 23, 25)] * 10, 19),
}
BALL_VOLLEYS = {  # category 6
    1: [], 2: [],
    3: [shot(0, 0, 1, 2)],
    4: [shot(0, 0, 19, 2), shot(0, 0, 20, 2)],
}


def expl(anim, delay=0, dx=0, dy=0, rx=0, ry=0, screen=False, delay_rand=0, delay_step=0):
    """One explosion animation: anim type, start delay (+ Random(delay_rand) * delay_step),
    position (x + dx + Random(rx), y + dy + Random(ry)); screen = x/y relative to (0, scrollY) instead."""
    e = dict(anim=anim, delay=delay, dx=dx, dy=dy)
    if rx: e['rx'] = rx
    if ry: e['ry'] = ry
    if screen: e['screen'] = True
    if delay_rand: e.update(delay_rand=delay_rand, delay_step=delay_step)
    return e


# Explode(kind, x, y) @1d9e:157A (0x1EF5A) -> AddExplosion(anim, delay, x, y) @1d9e:1483.
EXPLOSION_KINDS = {
    1: [expl(1)], 2: [expl(2)], 3: [expl(3)], 4: [expl(4)],
    5: [expl(2, i, rx=80, ry=50) for i in range(1, 21)] + [expl(1, i, rx=80, ry=50) for i in range(1, 11)],
    7: [expl(1, i - 1, dy=4 * i) for i in range(1, 6)],
    8: [expl(5), expl(5, 3, 5, 8), expl(7, 4, 12, 16)],
    9: [expl(5, i, rx=50, ry=50) for _ in range(5) for i in range(1, 5)],
    10: [expl(5, 2 * j + i, rx=30, ry=30) for j in (1, 2) for i in range(1, 6)],
    11: [expl(5, 0, rx=5, ry=5), expl(5, 3, 15, 0, 5, 5), expl(5, 6, 30, 10, 5, 5)],
    12: [expl(7, 0, -40, -40, 320, 220, screen=True, delay_rand=3, delay_step=3) for _ in range(20)],
    13: [expl(5, 0, 0, 5 * i) for i in range(1, 4)],
    14: [expl(6)],
    15: [expl(6), expl(6, 10, 30, 20), expl(6, 20, 20, -20), expl(6, 30, -30, 20)] +
        [expl(5, 4 * i, -40, -40, 300, 200, screen=True) for _ in range(5) for i in range(1, 7)],
    16: [expl(7), expl(7, 2, 0, 10)],
    17: [expl(5, 2, 10, 6), expl(5, 10, 3, 10)] + [expl(7, 4 * (i - 1), rx=15, ry=15) for i in range(1, 5)],
    18: [expl(8)],
    19: [expl(7, 2 * i, -10, -10, 20, 50) for i in range(1, 7)],
    20: [expl(9)], 21: [expl(10)],
    22: [expl(5, 0, -45, -25), expl(5, 3, 20, -25)],
    23: [expl(11)],
    24: [expl(5, i - 1, rx=30, ry=30) for i in range(1, 4)] + [expl(7, i - 1, rx=30, ry=30) for i in range(1, 4)],
    25: [expl(5, 0, -55, -32)],
}
EXPLOSION_KINDS[6] = EXPLOSION_KINDS[5]
QUAKE = {15: 40}  # kind -> screen-shake ticks (Quake 1d9e:1447)

# StartBossFight @0x1627E: SpawnEnemy(x, scrollY + dy, type, sub, 0) in this order (parts take enemy
# slots 1, 2, ...); y is the bottom edge (SpawnEnemy subtracts the sprite height). Sounds = PlaySound(loop, n).
BOSS_SPAWNS = {
    1: dict(sounds=[35, 35], spawns=[(0x75, 0x75, 0x24, 0x14), (0x82, 100, 0x23, 0x14)]),
    2: dict(sounds=[17, 17], spawns=[(0x8D, 0x65, 0x0C, 0), (0x73, 0x4B, 0x0D, 0), (0x7D, 0x37, 0x05, 7)]),
    3: dict(sounds=[], spawns=[(0x8C, 0x2D, 0x20, 0x12), (0x8C, 0x19, 0x21, 0x12), (0x8C, 5, 0x21, 0x12),
                                (0x8C, -0xF, 0x21, 0x12), (0x8C, -0x28, 0x22, 0x12)]),
    4: dict(sounds=[], loop_sound=51, spawns=[(0x6C, 0x5A, 0x3D, 0), (0x97, 0x5A, 0x3D, 0), (0x76, 0x41, 0x3F, 0),
                                              (0x80, 0x3F, 0x3E, 0), (0x50, 0x6E, 0x3C, 0x22)]),
    5: dict(sounds=[], spawns=[(0x8C, 0x60, 0x45, 0x25), (0x8B, 0x45, 0x47, 0), (0x61, 0x35, 0x44, 0x26),
                               (0xA1, 0x23, 0x46, 0), (0x50, 0x8C, 0x43, 0)]),
    6: dict(sounds=[53, 53, 53], spawns=[(0x2D, 100, 0x48, 0x27)]),
}
BOSS_CORES = {1: 0x23, 2: 0x05, 3: 0x20, 4: 0x3C, 5: 0x43, 6: 0x48}


def jets():
    out = []
    for j in range(1, 6):
        out.append(dict(
            id=j, name=JETS[j - 1], price=l(0x1874 + 4 * j), max_life=w(0x188A + 2 * j),
            ram_damage=w(0x1894 + 2 * j), shop_sprite=w(0x184A + 2 * j), frame_base=w(0x1854 + 2 * j),
            extents=dict(l=b(0x185F + j), r=b(0x1865 + j), t=b(0x186B + j), b=b(0x1871 + j)),
            mounts=[bool(b(0x18A4 + 8 * j + i)) for i in range(8)],
            standard_weapon=dict(sprite=w(0x18D2 + 2 * j), sound=b(0x18E7 + j), reload=w(0x18DC + 2 * j),
                                 anchor='nose', volley=STANDARD_VOLLEYS[j])))
    return out


def items():
    small = [dict(id=i, name=SMALL_PODS[i - 1], price=l(0x16DC + 4 * i), shop_sprite=w(0x16C2 + 2 * i),
                  sound=b(0x16FB + i), reload=w(0x16D0 + 2 * i), anchor='nose', volley=SMALL_VOLLEYS[i])
             for i in range(1, 8)]
    for p in small:
        if p['id'] == 4: p['sound_played'] = False  # Autogun: SpawnShot skips the sound (spec §12 bug 4)
    large = [dict(id=i, name=LARGE_PODS[i - 1], price=l(0x172C + 4 * i), sprite=w(0x1702 + 2 * i),
                  sound=b(0x175B + i), reload=w(0x1718 + 2 * i), anchor='mount', volley=LARGE_VOLLEYS[i][0],
                  fire_anim=LARGE_VOLLEYS[i][1])
             for i in range(1, 12)]
    ball = [dict(id=i, name=BALL_PODS[i - 1], price=l(0x1814 + 4 * i), sprite=w(0x180E + 2 * i),
                 contact_damage=w(0x1826 + 2 * i), orbit_factor=b(0x182F + i), reload=w(0x1832 + 2 * i),
                 anchor='ball', volley=BALL_VOLLEYS[i])
            for i in range(1, 5)]
    engines = [dict(id=i, name=ENGINES[i - 1], price=l(0x17DC + 4 * i), shop_sprite=w(0x17D8 + 2 * i),
                    max_speed=w(0x17EA + 2 * i)) for i in range(1, 4)]
    shields = [dict(id=i, name=SHIELDS[i - 1], price=l(0x17F4 + 4 * i), shop_sprite=w(0x17F0 + 2 * i),
                    max=w(0x1802 + 2 * i), recharge_every=w(0x1808 + 2 * i)) for i in range(1, 4)]
    boni = [dict(kind=k, name=BONI[k - 1], price=l(0x179E + 4 * k), sprite=w(0x1772 + 2 * k),
                 hud_offset=b(0x1795 + k), inventory=bool(b(0x1789 + k)), pickup_sound=b(0x17CD + k))
            for k in range(1, 12)]
    return dict(small_pods=small, large_pods=large, ball_pods=ball, engines=engines, shields=shields, boni=boni)


def mount_offsets():
    """1d9e:0B2C: mount 0 at (cx + dx, T + dy); 3/5 at (L + dx, T + dy); 4/6 at (R + dx, T + dy)."""
    anchor = {0: 'cx', 3: 'l', 4: 'r', 5: 'l', 6: 'r'}
    return [dict(mount=i, x_from=anchor[i], dx=w(0x18FE + 2 * i), dy=w(0x190E + 2 * i)) for i in anchor]


def shot_types():
    return [dict(type=t, sprite=w(0x162A + 2 * t), speed=w(0x168E + 2 * t), damage=w(0x165C + 2 * t))
            for t in range(1, 26)]


def explosion_anims():
    """ExplosionTick 1d9e:1004: first/last frame, ticks per frame, sound on the first frame."""
    return [dict(anim=a, first=w(0x15E6 + 2 * a), last=w(0x15FC + 2 * a), rate=b(0x1613 + a),
                 sound=b(0x161F + a)) for a in range(1, 12)]


def sprite_anims():
    """StartAnim 1d9e:4071 / AnimTick 1d9e:33FA: frames first..last every `rate` ticks; at the end either
    stop on `rest` (ping_pong false) or run back to first and then stop on `rest`. Anims 0x1F and 0x2B start
    at `last` and run backwards."""
    return [dict(anim=a, first=w(0x1458 + 2 * a), last=w(0x14AE + 2 * a), ping_pong=bool(b(0x1505 + a)),
                 rest=w(0x1530 + 2 * a), rate=w(0x1586 + 2 * a), reverse=a in (0x1F, 0x2B)) for a in range(1, 44)]


def levels():
    out = []
    for n in range(1, 7):
        data = open(os.path.join(et.GAME, 'LEVEL%d.LEV' % n), 'rb').read()[2000:]
        recs = [et.struct.unpack_from('<hhBBB', data, 7 * i) for i in range(600)]
        boss_y = [y for y, x, t, s, f in recs if t in et.BOSS and y != 100]
        assert len(boss_y) == 1, (n, boss_y)
        boss = BOSS_SPAWNS[n]
        out.append(dict(level=n, episode=(n - 1) // 3 + 1, cd_track=b(0x1031 + n), tileset='TI%d.LIB' % ((n - 1) // 3 + 1),
                        boss_trigger_y=boss_y[0], boss_core=BOSS_CORES[n],
                        boss=dict(sounds=boss['sounds'], loop_sound=boss.get('loop_sound'),
                                  spawns=[dict(x=x, dy=dy, type=t, sub=s) for x, dy, t, s in boss['spawns']])))
    return out


def tables():
    return dict(
        source='DP.EXE (initialised data segment and code; see tools/game_tables.py)',
        tick_hz=40,
        jets=jets(),
        **items(),
        mount_offsets=mount_offsets(),
        no_engine_max_speed=2,
        shot_types=shot_types(),
        bonus_drop=dict(chance_below=15, thresholds=[b(0x1768 + i) for i in range(1, 11)],
                        rule='drop if Random(100)+1 < chance_below; kind = 1 + number of thresholds <= Random(100)+1 '
                             '(kind 11 = none)'),
        enemy_types=et.enemy_types(),
        enemy_shot_kinds=[et.shot_kind(k) for k in range(1, 30)],
        explosion_anims=explosion_anims(),
        explosion_kinds={str(k): v for k, v in sorted(EXPLOSION_KINDS.items())},
        quake_ticks={str(k): v for k, v in QUAKE.items()},
        sprite_anims=sprite_anims(),
        sprite_cycles=et.sprite_cycles(),
        levels=levels(),
        sounds=SOUNDS,
        shadow_brightness=70,  # SetShadowTab(70) @0x1B295 and @0x10CCC (AniVGA 28be:0106)
    )


# Values stated in docs/gameplay-spec.md (§3.2, §4.3, §4.4, §5.1, §7.6, §8.1, §10)
SPEC = {
    'jets': [(100, 40, 0, (5, 36, 0, 33), 1), (200, 50, 35000, (2, 42, 2, 49), 8), (300, 60, 65000, (0, 39, 1, 44), 15),
             (250, 70, 90000, (28, 95, 20, 100), 29), (400, 80, 130000, (1, 29, 0, 48), 22)],
    'jet_mounts': {1: {1, 3}, 2: {1, 3, 4, 7}, 3: {0, 1, 3, 4, 7}, 4: {0, 1, 3, 4, 7}, 5: {0, 1, 3, 4, 5, 6, 7}},
    'std_reload_sound': [(10, 0), (20, 28), (10, 1), (20, 27), (15, 1)],
    'shields': [(10000, 20, 15), (20000, 40, 10), (45000, 60, 7)],
    'engines': [(10000, 3), (20000, 4), (40000, 5)],
    'small': [(10000, 16, 28), (8000, 14, 0), (30000, 10, 1), (35000, 4, 2), (70000, 8, 0), (100000, 8, 0), (20000, 12, 0)],
    'large': [(80000, 22, 8), (75000, 16, 8), (12500, 18, 12), (15000, 4, 2), (50000, 10, 0), (30000, 30, 24),
              (60000, 40, 25), (22500, 20, 12), (60000, 21, 28), (55000, 15, 255), (100000, 50, 39)],
    'ball': [(20000, 15, 10, 0), (35000, 20, 7, 0), (50000, 25, 10, 0), (80000, 40, 10, 5)],
    'boni_price': {2: 12000, 4: 20000, 5: 25000, 6: 30000, 7: 15000, 8: 10000, 9: 18000, 11: 4000},
    'shots': [(146, 5, 20), (148, 6, 10), (149, 0, 7), (150, 15, 3), (157, 1, 15), (151, 3, 60), (155, 8, 30),
              (150, 15, 5), (156, 12, 30), (173, 15, 40), (167, 0, 20), (168, 1, 0), (173, 6, 100), (170, 10, 150),
              (172, 10, 30), (169, 6, 40), (180, 8, 30), (184, 2, 60), (181, 6, 40), (182, 15, 25), (183, 10, 50),
              (206, 15, 20), (202, 6, 40), (204, 6, 40), (222, 6, 50)],
    'drop': [55, 60, 65, 67, 72, 74, 81, 88, 98, 100],
    'expl_anims': [(293, 299, 1, 6), (300, 306, 1, 9), (307, 316, 1, 4), (317, 320, 1, 2), (321, 332, 1, 7),
                   (333, 345, 2, 14), (346, 358, 1, 7), (359, 368, 1, 26), (376, 383, 3, 6), (369, 375, 3, 39),
                   (384, 392, 2, 6)],
    'boss_y': [-5561, -5573, -5898, -5873, -6017, -5711],
    'tracks': [5, 6, 7, 5, 6, 7],
}


def check(t):
    errors = []

    def eq(what, got, want):
        if got != want: errors.append('%s: DP.EXE %r, spec %r' % (what, got, want))

    for j, (life, ram, price, ext, base) in zip(t['jets'], SPEC['jets']):
        eq('jet %d' % j['id'], (j['max_life'], j['ram_damage'], j['price'], tuple(j['extents'].values()),
                                j['frame_base']), (life, ram, price, ext, base))
        eq('jet %d mounts' % j['id'], {i for i, m in enumerate(j['mounts']) if m}, SPEC['jet_mounts'][j['id']])
        eq('jet %d standard weapon' % j['id'], (j['standard_weapon']['reload'], j['standard_weapon']['sound']),
           SPEC['std_reload_sound'][j['id'] - 1])
    for s, want in zip(t['shields'], SPEC['shields']): eq('shield %d' % s['id'], (s['price'], s['max'], s['recharge_every']), want)
    for e, want in zip(t['engines'], SPEC['engines']): eq('engine %d' % e['id'], (e['price'], e['max_speed']), want)
    for p, want in zip(t['small_pods'], SPEC['small']): eq('small pod %d' % p['id'], (p['price'], p['reload'], p['sound']), want)
    for p, want in zip(t['large_pods'], SPEC['large']): eq('large pod %d' % p['id'], (p['price'], p['reload'], p['sound']), want)
    for p, want in zip(t['ball_pods'], SPEC['ball']):
        eq('ball pod %d' % p['id'], (p['price'], p['contact_damage'], p['orbit_factor'], p['reload']), want)
    for k, price in SPEC['boni_price'].items(): eq('bonus %d price' % k, t['boni'][k - 1]['price'], price)
    for s, want in zip(t['shot_types'], SPEC['shots']): eq('shot type %d' % s['type'], (s['sprite'], s['speed'], s['damage']), want)
    eq('bonus drop thresholds', t['bonus_drop']['thresholds'], SPEC['drop'])
    for a, want in zip(t['explosion_anims'], SPEC['expl_anims']):
        eq('explosion anim %d' % a['anim'], (a['first'], a['last'], a['rate'], a['sound']), want)
    eq('boss trigger y', [lv['boss_trigger_y'] for lv in t['levels']], SPEC['boss_y'])
    eq('level tracks', [lv['cd_track'] for lv in t['levels']], SPEC['tracks'])
    return errors


def main():
    src, out = sys.argv[1], sys.argv[2]
    et.load(src)
    t = tables()
    with open(out, 'w') as f:
        json.dump(t, f, indent=1)
    if '--check' in sys.argv:
        errors = check(t)
        for e in errors: print('MISMATCH', e)
        print('spec check: %d mismatches' % len(errors))
        sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
