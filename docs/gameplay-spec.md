# Gameplay spec (classic mode)

The behaviour the remake must reproduce, reverse-engineered from `DP.EXE` in session 4.
Evidence and addresses are in `docs/re-notes.md` → "Gameplay (session 4)"; this file states the rules.
Status tags: **O** observed in the code or data, **I** inferred, **U** unknown. Untagged statements are O.
Nothing in this file has been checked in DOSBox-X yet; §12 lists the checks.

## 0. Conventions
- **1 tick = 1 frame of the original game loop.** The remake runs a fixed 40 Hz tick (decision, session 3).
  All speeds are px/tick and all durations are ticks unless stated otherwise (40 ticks = 1 s).
- **Coordinates** are the original AniVGA "virtual" coordinates: a sprite position is its top-left corner;
  x 0…319, level y from +199 (level start, bottom) down to −6200 (top). `scrollY` is the level y at the top
  of the screen: 0 at the start, −1 per tick while the level scrolls. Screen y = y − scrollY.
  `scrollX` is 0 except while the screen shakes.
- Players, enemies and pods are **screen-locked**: the scroll subtracts 1 from their y every tick, so their own
  movement is screen-relative. **Player shots, enemy shots, explosions and bonus objects are not**: they live in
  level coordinates, so on screen player shots rise 1 px/tick slower and enemy shots fall 1 px/tick faster
  while the level scrolls.
- Random(n) is Turbo Pascal's generator (0…n−1). Exact RNG sequences don't matter (decision: classic mode
  needs to play and feel identical, not be frame-exact).
- Two global frame counters: `frame` (DS:0x552E, reset to 0 at level start, +1 at the start of each tick; used for
  every "every N ticks" rule below) and a sprite-cycle counter (DS:0x5530).
- Sprite numbers are the `sprites.json` numbers (DP.EXE load order). Sound numbers are 0-based SMIX indices:
  0–34 `AREA.SND`, 35–58 `AREA2.SND` (list in §11).
- Hit tests: AniVGA `HitDetect`, bounding boxes refined by each sprite's per-row/per-column opaque extents (I:
  not pixel-exact). The decoded sprites have these extents.

## 1. Timing and the tick
- The original runs one game-loop iteration per frame with no frame limiter, but `0x1AA36` adds a busy
  `Delay` every frame chosen by the Options "CPU" setting: 486 = 6 ms, Pentium = 9 ms, Pentium II = 12 ms,
  "Cray" = 16 ms (none without SETTINGS.DAT). The reference capture (DOSBox-X cycles=64000, CPU = Pentium II)
  ran at ≈ 41 fps. **Remake: fixed 40 Hz; no CPU option** (decision, user, session 4).
- Order of one tick (O, game loop 0x1B787). The remake should keep this order where it matters (input →
  movement → fire → enemies → spawn → shots → pickups → scroll → draw → collisions):
  1. CD repeat check every 40 ticks; `frame` += 1.
  2. Altitude swaps requested last tick; input per player; player movement.
  3. Bonus-object wobble every 2nd tick; bonus labels' timers; ×5-damage icon timers; energy bars.
  4. Death handling: life < 0 → lose a ship; lives < 0 → player out. Respawn fly-in. Invulnerability. Shield recharge.
  5. Fire pods (P1, P2); sprite cycles; sprite animations; reload pods; explosions.
  6. Enemy movement, enemy guns, enemy shots; level spawns (only while scrolling).
  7. Atom-bomb timers; invulnerability display; move player shots; bonus inventory (select/fire); bonus pickups.
  8. Scroll 1 px (if scrolling; pods follow); shadows; screen-shake offset; CPU delay; draw; shake restore.
  9. Collisions per player (shots ↔ enemies, enemy shots → player, ramming, ball pods) unless the level-end
     autopilot runs.
  10. Pause (P), level-end autopilot, game-over countdown, Esc.
- Not replicated (decision, user, session 4): the original's low-memory "reaper" `MemoryGuard` @0x1B600, which
  cleared all explosions, shots and enemy shots whenever free DOS memory fell below 140000 bytes in busy scenes.

## 2. Controls
Control type per player (Options; P1 and P2 can never pick the same): **1 keyboard, 2 mouse, 3 joystick**.
Defaults P1 = keyboard, P2 = mouse.

| Action | Keyboard | Mouse | Joystick |
|---|---|---|---|
| Move | arrow keys | steer toward the pointer | stick A |
| Fire (hold = autofire) | Ctrl | left button | button 1 |
| Altitude high/low (on press) | Alt | right button | button 2 |
| Select bonus (on press) | Space | middle button | keypad − |
| Fire bonus (on press) | Ctrl + Space | left + middle | keypad + |
| Pause / resume | P | P | P |
| Abort to main menu | Esc | Esc | Esc |

- The keyboard handler reads the same keys for both players and only stick A is read, so two players always use
  different device types (O).
- Joystick: centre sampled once at program start; a direction counts when the axis is more than 15 raw units
  from the centre (remake: use an analog dead zone instead).
- Pause: P pauses after a 500 ms delay and resumes on the next P press (O).
- Altitude toggle is ignored while a previous toggle's swap is pending (one tick).

## 3. Player
### 3.1 Movement (O, 0x1A1DD / 0x1A34B / 0x1A58F / 0x1A73E)
- Integer velocity (vx, vy), each in −max…+max px/tick. max = 2 without an engine, else 3 / 4 / 5 for engines
  1 / 2 / 3. A new game starts with engine 1 (max 3).
- Keyboard and joystick, every tick: holding left: vx −= 1 (if vx > −max); right: vx += 1 (if vx < max);
  up/down likewise for vy. With no key on an axis, that velocity moves 1 toward 0 on ticks where frame mod 4 = 0.
- Mouse: target = (pointerX div 2, pointerY) in screen space (pointer range 640 × 200). Accelerate by 1 toward the
  target on each axis (x only while 12 ≤ x ≤ 280, y down only while screen y ≤ 168). Inside a dead zone of
  5 × max px from the target the velocity on that axis moves 1 toward 0 every tick. (O: the mouse uses the engine
  table directly, so with no engine max = 0 and the ship can't move; the game never gets there since engine 1 is
  given.)
- Position: x += vx unless (vx < 0 and x + L ≤ 12) or (vx > 0 and x + R ≥ 308); y += vy unless
  (vy < 0 and sy + T ≤ 10) or (vy > 0 and sy + B ≥ 190), where sy = screen y and L/R/T/B are the jet's sprite
  extents. Heli: bottom limit 220. The bound test uses the old position, so the ship can overshoot by up to
  |v| − 1 px; the velocity is kept while blocked.
- Banking sprite: frame = base[jet] + 3 + round(3·vx/max) (7 frames). Heli: base + 6 + 2·round(3·vx/max), and
  the rotor's odd frame comes from the sprite cycles (§9.3).

### 3.2 Jets, engines, shields
| Jet | Name | Price | Max life | Ram damage to enemies /tick | L R T B extents | Frame base | Mounts (besides standard weapon) |
|---|---|---|---|---|---|---|---|
| 1 | Firestorm | 0 (start) | 100 | 40 | 5 36 0 33 | 1 | small, large 3 |
| 2 | Navi Spezial | 35000 | 200 | 50 | 2 42 2 49 | 8 | small, large 3, 4, ball |
| 3 | Alien-Pro | 65000 | 300 | 60 | 0 39 1 44 | 15 | large 0, small, large 3, 4, ball |
| 4 | Steptokopter (heli) | 90000 | 250 | 70 | 28 95 20 100 | 29 | large 0, small, large 3, 4, ball |
| 5 | Alien-Pro 2 | 130000 | 400 | 80 | 1 29 0 48 | 22 | large 0, small, large 3–6, ball |

| Shield | Name | Price | Max shield | Recharge |
|---|---|---|---|---|
| 0 | none | – | 0 | – |
| 1 | Shield 48C (start) | 10000 | 20 | +1 when frame mod 15 = 0 |
| 2 | Teslashield | 20000 | 40 | +1 when frame mod 10 = 0 |
| 3 | Protector | 45000 | 60 | +1 when frame mod 7 = 0 |

Engines: 1 Positron-GPX 10000 → max 3, 2 Siderator 20000 → 4, 3 Positron-GPY 40000 → 5.
Life never regenerates (only Aid, respawn, next level). At every level start life and shield are full.

### 3.3 Altitude (O, 1d9e:25B7, 1d9e:1C8A)
- Two altitudes: high (start of every level) and low. The altitude flag flips on the key press, so collisions
  use the new altitude in the same tick; the sprite-slot swap (draw order) follows at the start of the next tick.
- Visual: the shadow (the jet sprite in shadow mode) sits at (x + d, y + d); d moves 1 px every 2nd tick toward 12
  (high) or 2 (low). The jet also moves to another sprite-slot range, which changes draw order (I: high jet in
  front of air enemies, low jet behind them but in front of ground objects).
- Enemy layers: 0 ground, 1 air, 2 both. A player at altitude h collides with, and its shots hit, enemies of
  layer h or layer 2 (low = ground = 0, high = air = 1). Enemy shots hit at any altitude.

### 3.4 Damage, death, lives (O, 0x18978, 0x10FA3, 0x10D24)
- Damage d goes to the shield first: shield −= d; if shield < 0 then life += shield, shield := 0.
- Enemy shot hit: d = damage of the shot kind (§7.5); the shot is removed; small explosion.
- Ramming an enemy (overlap and same altitude, or enemy layer 2): **every tick of overlap** the player takes the
  enemy type's ram damage (§7.1) and the enemy loses the jet's ram damage (40…80). Exceptions: the Golem, its
  rocks and laser (0x48–0x4A) take nothing (an explosion appears at the player instead); type 0x31 dies on contact.
  An enemy rammed to death pays its money to that player (no bonus drop).
- No damage while invulnerable or during the level-end autopilot.
- **Life < 0** (0 is still alive) → lose a ship: explosion burst; jet placed at x 150, screen y 300; life and
  shield refilled; lives −= 1; invulnerable for 100 ticks; fly-in: y −= 3 per tick until the jet's bottom is above
  screen y 200 (input, firing and collisions stay active).
- **Lives** start at 5 (spare ships; 6 ships in all). Lives < 0 → the player is out for the rest of the game
  (ship, pods, bonuses and shots removed). When every player is out, a 120-tick game-over countdown runs (the game
  continues; sound 42 SLOSER ×2 at 110), then back to the main menu. Unsaved progress is lost.
- Invulnerability (respawn 100 ticks, bonus 200 ticks): blue arc (sprite 544) and a countdown digit
  (counter div 20) above the jet, refreshed every 20 ticks; loops sound 16, sound 44 on, 43 off.

### 3.5 HUD (O, 0x107F8, 1d9e:1176)
- Bar frames: sprite 490 at x 0 (P1) and x 311 (P2). Each bar is 33 lines, 3 px wide, colour 0x5D + (i−1) div 3;
  line i is black when energy < i·max/33. Shield bar bottom at screen y 79 (drawn only with a shield), life bar
  bottom at y 171.
- P1: money text at (20, 10); lives icon 491 at x 30, number at x 45; bonus slots at x 25 + 30·i (+ per-item
  offset), screen y 171, selection frame sprite 492. P2: money (240, 10), icon x 260, number x 275, slots
  x 210 + 30·i. Two players: labels "I"/"II" (577/578) follow the jets.
- There is no score: money is the only counter.

### 3.6 Money
- Enemy kill: the killer gets the type's money (§7.1); **two players: every AddMoney is doubled** (kills, +1000
  bonus), and a boss core's money is split, so each player gets the full amount. Negative money = civilians
  (types 0x04, 0x16, 0x1A, 0x1B, 0x1E, 0x1F; sound 45 ×3). Money never drops below 0. Atom-bomb kills pay nothing.
- Cheat (hangar screen only): typing G-E-D-A-N-K-E sets both players' money to 666666.

## 4. Weapons
### 4.1 Mounts (O)
Each player has 8 mount records {reload counter, loaded, occupied, item id, category}:

| Mount | Holds | Position relative to the jet sprite (cx = L + (R−L) div 2) |
|---|---|---|
| 0 | large pod (nose) | (cx − 7, T − 22) |
| 1 | small pod (internal, no sprite) | – |
| 2 | standard weapon of the jet (fixed) | – |
| 3 / 4 | large pod inner left / right | (L − 17, T + 14) / (R + 4, T + 14) |
| 5 / 6 | large pod outer left / right | (L − 35, T + 16) / (R + 22, T + 16) |
| 7 | ball pod ("Kugel") | orbits the jet |

Which mounts exist depends on the jet (§3.2). Large-pod sprites follow the jet every tick.

### 4.2 Firing and reload (O, 0x1961C, 0x192A4, 0x111A4)
- While fire is held, every loaded mount fires its volley and becomes unloaded. Each tick an unloaded mount's
  counter −= 1; at < 1 it is loaded again and the counter := reload. Net: one volley every *reload* ticks.
  Reload 0 → never reloads (fires once per level).
- 48 shot slots per player; a full table drops the shot but the mount stays loaded. Each shot stores the
  shooter's altitude.

### 4.3 Weapon table
Positions are relative to the jet sprite (cx, T from §4.1); (mx, my) is the large pod's mount.

**Standard weapons (mount 2)**
| Jet | Shots | Spawn | Pattern | Shot type | Reload | Sound |
|---|---|---|---|---|---|---|
| 1 Firestorm | 1 | (cx−2, T+10) | 1 straight | 2 | 10 | 0 STDSHOT |
| 2 Navi Spezial | 2 | (cx−12, T+8) / (cx+8, T+8) | 5 / 4 missiles | 1 | 20 | 28 ROCKET |
| 3 Alien-Pro | 2 | same | 1 | 20 | 10 | 1 LASER |
| 4 Steptokopter | 2 | same | 5 / 4 | 16 | 20 | 27 BUBBLES |
| 5 Alien-Pro 2 | 2 | same | 1 | 20 | 15 | 1 LASER |

**Small pods (mount 1)**
| # | Name | Price | Shots | Spawn | Pattern | Type | Reload | Sound |
|---|---|---|---|---|---|---|---|---|
| 1 | Missiles | 10000 | 2 | (cx−12,T+8)/(cx+8,T+8) | 5 / 4 | 1 | 16 | 28 |
| 2 | Myonenwerfer | 8000 | 2 | (cx−10,T+10)/(cx+5,T+10) | 1 | 2 | 14 | 0 |
| 3 | Duallaser | 30000 | 2 | beams left/right of centre | 0 | 3 | 10 | 1 |
| 4 | Autogun | 35000 | 2 | (cx−6,T+16)/(cx+4,T+16) | 7 aimed at nearest enemy | 4 | 4 | none (O) |
| 5 | Protoner | 70000 | 2 | (cx−11,T+16)/(cx+4,T+16) | 1 | 15 | 8 | 0 |
| 6 | Stargun | 100000 | 4 | (cx−3,T+16) | 15–18 (4 diagonals) | 19 | 8 | 0 |
| 7 | Sidefire | 20000 | 2 | (cx−3,T+10) | 20 left / 19 right | 23 / 24 | 12 | 0 |

**Large pods (mounts 0, 3–6; at most 2 of the same kind)**
| # | Name | Price | Shots | Spawn | Pattern | Type | Reload | Sound |
|---|---|---|---|---|---|---|---|---|
| 1 | Flamer | 80000 | 1 | (mx−39, my−64) | 9 flame | 5 | 22 | 8 |
| 2 | Windstorm | 75000 | 1 | (mx+2, my) | 10 widening wave | 6 | 16 | 8 |
| 3 | Plasmapod | 12500 | 1 | (mx+3, my) | 1 | 7 | 18 | 12 |
| 4 | MG 2#-33mm | 15000 | 1 | (mx+7, my) | 1 | 8 | 4 | 2 |
| 5 | MK Pod | 50000 | 1 | (mx+5, my) | 1 | 9 | 10 | 0 |
| 6 | Elektroball | 30000 | 1 | (mx, my) | 1 | 13 | 30 | 24 |
| 7 | E-Shocker | 60000 | 1 | (mx+2, my−43) | 1 | 14 | 40 | 25 |
| 8 | Sideralbolt | 22500 | 1 | (mx, my−4) | 1 | 17 | 20 | 12 |
| 9 | Rocketlauncher | 60000 | 2 | (mx, my+2)/(mx+8, my+2) | 14 accelerating | 18 | 21 | 28 |
| 10 | Xenon | 55000 | 1 | (mx+4, my) | 1 | 21 | 15 | none (I) |
| 11 | G-Destructor | 100000 | 10 | (mx, my) | 23 random scatter | 25 | 50 | 39 |
Firing large pods also plays a short animation on the pod sprite.

**Ball pods (mount 7, jets 2–5)**: orbit radius 40 around the jet centre, angle = (frame mod 360)·2°·k
(k = 10, 7, 10, 10 → 20°/tick = one turn per 18 ticks for k 10). They destroy enemy shots they touch and damage
enemies on contact every tick.
| # | Name | Price | Contact damage /tick | Fires |
|---|---|---|---|---|
| 1 | Smiley 2 | 20000 | 15 | – |
| 2 | Teutonenkopf | 35000 | 20 | – |
| 3 | Distroyer | 50000 | 25 | 1 × type 2 straight up, reload 0 (fires once per level, see §10) |
| 4 | Teufelsreigen | 80000 | 40 | 2 × type 2 sideways (patterns 19/20), reload 5 |

### 4.4 Shot types (O, DS:0x162A / 0x168E / 0x165C)
| Type | Sprite | Speed | Damage | Used by |
|---|---|---|---|---|
| 1 | 146 | 5 | 20 | Missiles, Navi standard |
| 2 | 148 | 6 | 10 | Myonenwerfer, Firestorm standard, Distroyer, Teufelsreigen |
| 3 | 149 (beam) | 0 | 7 | Duallaser |
| 4 | 150 | 15 | 3 | Autogun |
| 5 | 157–166 | 1 | 15 | Flamer |
| 6 | 151 | 3 | 60 | Windstorm |
| 7 | 155 | 8 | 30 | Plasmapod |
| 8 | 150 | 15 | 5 | MG |
| 9 | 156 | 12 | 30 | MK Pod |
| 10 | 173 | 15°/tick | 40 | Blast bonus |
| 11 | 167 | 0 | 20 | Twin-Laser bonus |
| 12 | 168 | 1 | 0 | Atom bomb projectile |
| 13 | 173 | 6 | 100 | Elektroball |
| 14 | 170 | 10 | 150 | E-Shocker |
| 15 | 172 | 10 | 30 | Protoner |
| 16 | 169 | 6 | 40 | Steptokopter standard |
| 17 | 180 | 8 | 30 | Sideralbolt |
| 18 | 184 | 2 | 60 | Rocketlauncher |
| 19 | 181 | 6 | 40 | Stargun |
| 20 | 182 | 15 | 25 | Alien-Pro / Alien-Pro 2 standard |
| 21 | 183 | 10 | 50 | Xenon |
| 22 | 206–221 | 15°/tick | 20 | Star bonus |
| 23 / 24 | 202 / 204 | 6 | 40 | Sidefire left / right |
| 25 | 222 | 6 | 50 | G-Destructor |

### 4.5 Shot movement patterns (O, 0x13C37; c = age, +1 per tick before moving; s = speed; y − = up)
| P | Motion per tick |
|---|---|
| 0 | beam glued to the jet: x = px + cx − 10 (left beam) or px + cx + 5 (right), y = py − 175; removed when c > 2 |
| 1 | y −= s |
| 4 / 5 | missile right / left: c 1–12: x ±1, y −1; c 13–14: still; c ≥ 15: y −= c div 4 |
| 7 | aimed: straight line from the start through the target point fixed at spawn (major axis s px, minor interpolated) |
| 9 | flame glued to the pod mount (px + mx − 39, py + my − 64); removed when c > 18 |
| 10 | y −= s; x = startX + round(c·sin(oldY·3°)) (wave widening with age) |
| 11 | spiral: angle += s; r = 3c + 20; position = jet centre − 6 + r·(cos 2·angle, −sin 2·angle); removed when c > 60 |
| 12 | y −= 3; angle += 15; x = startX + round(40·sin angle°) − 5 |
| 13 | atom bomb: y −= 1; at c > 80 removed, bomb timer := 5, big explosion |
| 14 | y −= s + c div 3 |
| 15 / 16 / 17 / 18 | (x+s, y−s) / (x−s, y−s) / (x+s, y+s) / (x−s, y+s) |
| 19 / 20 / 21 | x += s / x −= s / y += s |
| 22 | orbit: angle += s; r = c + 15; position = jet centre + (−53, −42) + r·(cos 2·angle, −sin 2·angle); animation at c = 20 |
| 23 | x ±= 7 (random side), y −= 4 + Random(6) |
Removal: off-screen x (< 0 or > 319; not types 5, 6, 10, 11, 22); above the screen top by the sprite height or
below screen y 199 (not beams and not types 5, 10, 22); pattern lifetimes above.

### 4.6 Shots hitting enemies (O, 0x18978)
- A shot hits an enemy of the same altitude, or layer 2; **Autogun shots (type 4) hit both altitudes** and only
  target enemies that pay positive money. The atom bomb projectile never hits.
- Damage = shot type damage, ×5 while the pentagram bonus runs.
- The shot is removed on hit, except Flamer (never) and Twin-Laser / Star (pierce everything except boss types).
- Not damageable: Golem rocks and laser (0x49, 0x4A); level 4/5 boss cores while enemy slots 1–4 live; the Golem
  until it is 210 ticks old.
- Small hit explosion by shot type (e.g. kind 1 at the shot for bullets).

## 5. Bonuses
### 5.1 Drops (O, 0x11A08, 1d9e:0F5D)
- When an enemy that pays positive money is **shot** to death while the level scrolls: Random(100) + 1 < 15 →
  drop (14 %). No drops from ramming, bombs or during boss fights.
- Item by roll = Random(100) + 1: 1–54 → 1 (+1000), 55–59 → 2 Atombombe, 60–64 → 3 invulnerability,
  65–66 → 4 1 Leben, 67–71 → 5 Blast, 72–73 → 6 Death, 74–80 → 7 Twin-Laser, 81–87 → 8 Aid,
  88–97 → 9 Star, 98–99 → 10 pentagram, 100 → nothing.
- Up to 10 bonus objects. A bonus sits where the enemy died (level coordinates, so it drifts down with the ground),
  wobbling on a radius-5 circle (14° per tick, updated every 2nd tick); removed below screen y 210.
- Picked up by touching it at any altitude.

### 5.2 Items (O, 0x12CA2; names from INFO.PAS THEMA3, I for kinds 1, 3, 10)
| Kind | Name | On pickup | Effect when used |
|---|---|---|---|
| 1 | (money) | immediate | +1000 money (+2000 label in two-player), label for 100 ticks |
| 2 | Atombombe | inventory | bomb shot (§4.5 pattern 13); when it explodes, a 5-tick flash, then every active enemy −100 energy (no money) |
| 3 | (shield) | immediate | invulnerable 200 ticks |
| 4 | 1 Leben | immediate | lives + 1 |
| 5 | Blast | inventory | clears own shots; ring of 20 spiral shots (type 10) |
| 6 | Death | inventory | while scrolling: kills every active enemy (money to the user); boss fight: −150 energy each |
| 7 | Twin-Laser | inventory | 2 sine shots (type 11) |
| 8 | Aid | inventory | life and shield + round(40 % of max), capped |
| 9 | Star | inventory | 5 orbiting shots (type 22) |
| 10 | (pentagram) | immediate | own shots deal ×5 damage for 666 ticks (icon 464) |
| 11 | Save | shop only | saves the game |
Pickup sounds: 4 GETBONUS; Death 13 LACHEN; Aid/Star 20; pentagram 36.

### 5.3 Inventory (O, 0x13534, 0x1330C)
- 3 slots, compacted to the left every tick. Select (on press): next filled slot, wrapping to 0.
  Fire (on press): use the selected item, clear it, selection −1 (min 0).
- With 3 items, a new inventory item is used at once on pickup.
- The selection frame is shown only when slot 0 is filled.

## 6. Levels and spawning
- A level is 6400 px tall (see `docs/file-formats.md` LEV). Scrolling runs at 1 px/tick from scrollY 0 until the
  boss trigger, about 139–150 s per level.
- Every tick while scrolling, every spawn record with y = scrollY fires (the flag byte is always 1 in the shipped
  levels and DS:0x16C2 is a constant 1, so the filter is a no-op). Y offsets and special cases (O, 0x16653): types
  08 +20, 0F +25, 14 +10, 2D +130 (x −50), 36 +30; type 40 also spawns two type 0x41 (subs 0x23/0x24) at
  (x ∓ 22, y − 17); type 0x42 spawns delayed by 80 ticks; boss types start the boss fight (§8).
- SpawnEnemy: the enemy's bottom edge starts at the screen top (y = scrollY − height). 29 enemy slots; a spawn with
  no free slot is dropped. Energy ×1.5 (energy + round(energy/2)) in two-player games.
- Delayed spawns: a non-zero spawn mode reserves a slot and spawns after that many ticks at the stored position
  (level coordinates; used for type 0x42 (80), carrier launches (12), boss minions (10)).

## 7. Enemies
### 7.1 Per-type data
Generated by `tools/enemy_table.py original_source` (also `--json`). Energy in brackets = two-player.
Guns: `k<shot kind>/f<flight pattern> @dx,dy: inter/salvo/pause` (§7.4). Explosion = kind (offset).
Levels: `L<n>:<subs used>` (hex).

| type | sprite | layer | energy (2P) | reward | ram dmg | wreck | shadow dx,dy | guns | fire delay | explosion | levels: subs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0x01 | 850 (geg1+0) | 1 | 20 (30) | 200 | 15 | - | 12,12 (air) | - | - | 2 (x-10) | L1:3,5 L2:3 L3:3,5 |
| 0x02 | 851 (geg1+1) | 1 | 10 (15) | 100 | 10 | - | 12,12 (air) | - | - | 2 (x-10) | L1:3,5 L2:3 L3:3,5 |
| 0x03 | 852 (geg1+2) | 1 | 20 (30) | 300 | 20 | - | 12,12 (air) | k2/f1 @6,12: 8/2/20 | 10 | 2 (x-10) | L1:3,5 L2:3 L3:3,5 |
| 0x04 | 854 (geg1+4) | 0 | 40 (60) | -150 | 40 | 1020 (aschen1+20) | none | - | - | 8 (-40,-40) | L1:1 L2:1 L3:1 |
| 0x05 BOSS | 893 (geg1+43) | 1 | 600 (900) | 3000 | 200 | 1012 (aschen1+12) | 12,12 (air) | k6/f1 @22,42: 0/0/0; k6/f1 @30,42: 0/0/0 (scripted only) | 0 | 15 (-30,-20) +shake | L2:0 |
| 0x06 | 855 (geg1+5) | 1 | 60 (90) | 600 | 40 | - | 12,12 (air) | k3/f1 @23,22: 20/1/1 | 10 | 10 (-40,-40) | L2:4,5,6 L3:3,5,b |
| 0x07 | 863 (geg1+13) | 0 | 50 (75) | 200 | 50 | 1021 (aschen1+21) | none | - | - | 11 (-40,-25) | L1:1 L3:1 |
| 0x08 | 864 (geg1+14) | 0 | 80 (120) | 600 | 30 | 1023 (aschen1+23) | none | k9/f8 @25,5: 8/3/15; k9/f9 @25,5: 8/3/15; k9/f10 @25,5: 8/3/15; k9/f11 @25,5: 8/3/15 | 30 | 10 (-40,-40) | L3:1 anim 0x12, snd 0x14 |
| 0x09 | 881 (geg1+31) | 0 | 60 (90) | 500 | 30 | 1000 (aschen1+0) | none | k4/f1 @10,20: 6/3/30 | 5 | 16 (-10,-12) | L2:6 L3:2,6 |
| 0x0A | 887 (geg1+37) | 0 | 30 (45) | 100 | 15 | 1006 (aschen1+6) | none | - | - | 13 (-40,-25) | L1:6 L3:4,6,c |
| 0x0B | 891 (geg1+41) | 1 | 60 (90) | 500 | 30 | - | 12,12 (air) | - | - | 10 (-40,-40) | L3:3,5,b |
| 0x0C | 896 (geg1+46) | 1 | 150 (225) | 500 | 20 | 1002 (aschen1+2) | 12,12 (air) | k5/f5 @8,8: 2/4/10 | 0 | 8 (-40,-40) | - |
| 0x0D | 906 (geg1+56) | 1 | 150 (225) | 400 | 30 | - | 12,12 (air) | - | - | 11 (-40,-25) | - |
| 0x0E | 908 (geg1+58) | 1 | 10 (15) | 0 | 10 | - | 12,12 (air) | - | - | 1 | L1:5,6 L2:6 |
| 0x0F | 910 (geg1+60) | 0 | 60 (90) | 1000 | 80 | 1009 (aschen1+9) | none | k1/f5 @18,18: 6/5/20 | 45 | 17 (-16,-16) | L2:1 L3:1 anim 7 |
| 0x10 | 919 (geg1+69) | 0 | 70 (105) | 700 | 80 | - | 1,1 | k7/f7 @11,35: 2/30/10 | 10 | 19 | L2:a L3:6 |
| 0x11 | 921 (geg1+71) | 1 | 20 (30) | 100 | 15 | - | 12,12 (air) | - | - | 2 (x-10) | L1:5,b L2:5,b L3:5,b |
| 0x12 | 923 (geg1+73) | 1 | 30 (45) | 200 | 20 | - | 12,12 (air) | - | - | 2 (x-10) | L1:2,5,6,b,c L3:3,5 |
| 0x13 | 927 (geg1+77) | 0 | 10 (15) | 50 | 10 | 1014 (aschen1+14) | none | - | - | 1 | L1:c L2:c L3:c |
| 0x14 | 931 (geg1+81) | 0 | 30 (45) | 250 | 20 | - | none | k8/f1 @10,19: 0/1/30 | 25 | 16 (-10,-12) | L1:d L2:d L3:2,6 anim 0xE |
| 0x15 | 945 (geg1+95) | 0 | 10 (15) | 50 | 10 | 383 (expl+90) | 1,1 | - | - | 11 (-40,-25) | L1:1 L2:1,10 L3:1,10 |
| 0x16 | 946 (geg1+96) | 0 | 1 (1) | -50 | 0 | 1013 (aschen1+13) | none | - | - | none, snd 0x20 | L1:e L2:10 L3:e,10,11 |
| 0x17 | 951 (geg1+101) | 0 | 100 (150) | 0 | 100 | 1017 (aschen1+17) | none | - | - | 9 (rnd) | L1:1 L2:1 L3:1 snd 0x1E |
| 0x18 | 948 (geg1+98) | 0 | 20 (30) | 0 | 0 | 1015 (aschen1+15) | none | - | - | none, snd 0x21 | L1:f L2:f,10 L3:f,10 |
| 0x19 | 959 (geg1+109) | 0 | 10 (15) | 0 | 0 | 1016 (aschen1+16) | none | - | - | none | L1:e L3:f |
| 0x1A | 962 (geg1+112) | 0 | 10 (15) | -50 | 0 | 1018 (aschen1+18) | none | - | - | none, snd 0x20 | L1:f L2:e,f,10 L3:10,11 |
| 0x1B | 961 (geg1+111) | 0 | 30 (45) | -50 | 20 | 1019 (aschen1+19) | 1,1 | - | - | 11 (-40,-25) | L1:1,10 L2:1,10 L3:1,10 |
| 0x1C | 964 (geg1+114) | 0 | 20 (30) | 0 | 15 | 375 (expl+82) | none | - | - | 21 | L1:1 L2:1 L3:1 |
| 0x1D | 965 (geg1+115) | 0 | 10 (15) | 100 | 0 | 1013 (aschen1+13) | none | - | - | none, snd 0x20 | L1:11 L2:11 L3:10,11 |
| 0x1E | 972 (geg1+122) | 0 | 30 (45) | -40 | 30 | 1020 (aschen1+20) | none | - | - | 8 (-40,-40) | L2:1 L3:1 |
| 0x1F | 973 (geg1+123) | 0 | 30 (45) | -50 | 50 | 1020 (aschen1+20) | none | - | - | 8 (-40,-40) | L2:1 L3:1 |
| 0x20 BOSS | 984 (geg1+134) | 0 | 1000 (1500) | 5000 | 50 | - | none | k12/f5 @20,15: 0/0/0 (scripted only) | 0 | 15 (-30,-20) +shake | L3:1 |
| 0x21 | 992 (geg1+142) | 0 | 100 (150) | 1000 | 50 | 992 (geg1+142) | none | - | - | 10 (-40,-40) | - |
| 0x22 | 976 (geg1+126) | 0 | 800 (1200) | 2000 | 50 | - | none | - | - | 10 (-40,-40) | - |
| 0x23 BOSS | 974 (geg1+124) | 1 | 400 (600) | 1500 | 180 | 1022 (aschen1+22) | 12,12 (air) | k10/f1 @16,70: 0/0/0; k10/f3 @16,70: 0/0/0; k10/f4 @16,70: 0/0/0 (scripted only) | 0 | 15 (-30,-20) +shake | L1:6 |
| 0x24 | 975 (geg1+125) | 1 | 180 (270) | 500 | 100 | - | 12,12 (air) | k11/f1 @5,35: 10/4/50; k11/f1 @60,35: 10/4/50 | 50 | 22 | - |
| 0x25 | 1024 (geg2+0) | 0 | 180 (270) | 1200 | 100 | 1389 (aschen2+34) | none | k29/f5 @17,17: 0/5/20 | 0 | 17 (-16,-16) | L4:1 L5:1 L6:1 |
| 0x26 | 1033 (geg2+9) | 1 | 80 (120) | 500 | 40 | - | 12,12 (air) | - | - | 10 (-40,-40) | - |
| 0x27 | 1044 (geg2+20) | 1 | 120 (180) | 700 | 60 | - | 12,12 (air) | k12/f16 @20,25: 10/2/30 | 15 | 16 (-10,-12) | - |
| 0x28 | 1056 (geg2+32) | 0 | 140 (210) | 1000 | 90 | 1373 (aschen2+18) | none | k9/f12 @10,40: 8/1/12; k9/f13 @10,40: 8/1/12; k9/f14 @10,40: 8/1/12; k9/f15 @10,40: 8/1/12 | 10 | 17 (-16,-16) | - |
| 0x29 | 1068 (geg2+44) | 1 | 40 (60) | 400 | 40 | - | 12,12 (air) | - | - | 2 (x-10) | L4:5,a,b L5:5 L6:5 |
| 0x2A | 1074 (geg2+50) | 1 | 30 (45) | 400 | 50 | - | 12,12 (air) | - | - | 2 (x-10) | L4:3,6 L5:6 L6:6 |
| 0x2B | 1088 (geg2+64) | 1 | 130 (195) | 500 | 60 | - | 12,12 (air) | k13/f1 @20,50: 3/8/15; k13/f1 @28,55: 3/8/15; k13/f1 @67,55: 3/8/15; k13/f1 @75,50: 3/8/15 | 10 | 10 (-40,-40) | - |
| 0x2C | 1093 (geg2+69) | 1 | 90 (135) | 400 | 40 | - | 12,12 (air) | k14/f17 @10,18: 0/1/30 | 15 | 2 (x-10) | L4:18 snd 0x2E |
| 0x2D | 1097 (geg2+73) | 0 | 180 (270) | 600 | 80 | 1377 (aschen2+22) | none | k16/f5 @10,-5: 0/1/20 | 20 | 10 (-40,-40) | L4:19 |
| 0x2E | 1105 (geg2+81) | 0 | 270 (405) | 800 | 10 | 1369 (aschen2+14) | none | k15/f8 @11,28: 8/2/25; k15/f10 @11,28: 8/2/25; k15/f11 @11,28: 8/2/25; k255/f0 @10,28: 0/1/50 | 20 | 17 (-16,-16) | L4:1 |
| 0x2F | 1112 (geg2+88) | 1 | 80 (120) | 300 | 20 | - | 12,12 (air) | - | - | 2 (x-10) | - |
| 0x30 | 1115 (geg2+91) | 1 | 200 (300) | 1200 | 80 | - | 12,12 (air) | k17/f1 @16,25: 5/2/15; k7/f1 @26,20: 5/3/12; k7/f1 @31,20: 5/3/12; k17/f1 @34,25: 5/2/15 | 10 | 19 | - |
| 0x31 | 1116 (geg2+92) | 1 | 130 (195) | 500 | 100 | - | 12,12 (air) | - | - | 24 (-40,-30) | L4:1a L5:1a L6:1a |
| 0x32 | 1136 (geg2+112) | 0 | 220 (330) | 600 | 80 | 1355 (aschen2+0) | none | k18/f6 @17,-3: 0/0/0 (scripted only) | 0 | 17 (-16,-16) | L4:1b L5:1b L6:1b |
| 0x33 | 1145 (geg2+121) | 1 | 120 (180) | 300 | 50 | - | 12,12 (air) | - | - | 2 (x-10) | L4:4,a L5:4 L6:4 |
| 0x34 | 1155 (geg2+131) | 0 | 100 (150) | 200 | 30 | 1375 (aschen2+20) | 2,2 | k20/f1 @-4,20: 0/1/50; k19/f1 @13,37: 10/2/60; k19/f1 @19,37: 10/2/60; k20/f1 @25,20: 0/1/50 | 20 | 17 (-16,-16) | L4:c L5:c L6:c |
| 0x35 | 1156 (geg2+132) | 1 | 80 (120) | 200 | 20 | - | 12,12 (air) | k19/f1 @3,18: 0/1/30; k19/f1 @16,18: 0/1/30 | 20 | 2 (x-10) | L4:1c,1d,20 L5:1d,20 L6:1d,20 |
| 0x36 | 1165 (geg21+0) | 0 | 220 (330) | 400 | 40 | 1357 (aschen2+2) | 1,1 | - | - | 17 (-16,-16) |  anim 0x1A |
| 0x37 | 1178 (geg21+13) | 0 | 260 (390) | 500 | 40 | 1371 (aschen2+16) | none | k21/f18 @0,9: 0/0/0; k21/f18 @23,0: 0/0/0 (scripted only) | 20 | 19 | L4:1f L5:1f L6:1f |
| 0x38 | 1184 (geg21+19) | 0 | 260 (390) | 800 | 40 | 1359 (aschen2+4) | none | k22/f19 @29,41: 0/1/60; k22/f19 @34,41: 0/1/60 | 4 | 24 (-40,-30) | L5:1 L6:1 |
| 0x39 | 1205 (geg21+40) | 0 | 180 (270) | 500 | 20 | - | none | - | - | 19 | L4:21 L5:21 L6:21 |
| 0x3A | 1214 (geg21+49) | 1 | 270 (405) | 600 | 30 | - | 12,12 (air) | k23/f20 @2,38: 10/2/30; k23/f20 @29,38: 10/2/30 | 10 | 10 (-40,-40) | L5:6,15 L6:6,15 |
| 0x3B | 1221 (geg21+56) | 1 | 80 (120) | 300 | 10 | - | 12,12 (air) | - | - | 2 (x-10) | L4:3,b L5:5 L6:5 |
| 0x3C BOSS | 1227 (geg21+62) | 0 | 600 (900) | 11000 | 100 | 1367 (aschen2+12) | none | - | - | 15 (-30,-20) +shake | L4:1 |
| 0x3D | 1233 (geg21+68) | 0 | 800 (1200) | 4000 | 100 | 1361 (aschen2+6) | none | k1/f22 @15,13: 3/4/70 | 50 | 24 (-40,-30) | - |
| 0x3E | 1241 (geg21+76) | 0 | 1200 (1800) | 4000 | 100 | 1363 (aschen2+8) | none | k24/f21 @0,0: 0/1/80 | 50 | 24 (-40,-30) | - |
| 0x3F | 1242 (geg21+77) | 0 | 1000 (1500) | 4000 | 100 | 1365 (aschen2+10) | none | k25/f19 @0,0: 20/3/100; k25/f19 @47,0: 20/3/100 | 50 | 17 (-16,-16) | - |
| 0x40 | 1243 (geg22+0) | 1 | 220 (330) | 600 | 40 | - | 12,12 (air) | - | - | 19 | L6:6 |
| 0x41 | 1245 (geg22+2) | 1 | 120 (180) | 400 | 20 | - | 12,12 (air) | k26/f1 @0,10: 10/3/30; k26/f1 @25,10: 10/3/30 | 70 | 2 (x-10) | - |
| 0x42 | 1257 (geg22+14) | 0 | 180 (270) | 500 | 30 | 1387 (aschen2+32) | none | k7/f7 @30,30: 6/30/10 | 30 | 17 (-16,-16) | L5:1 L6:1 snd 0x2F, anim 0x23 |
| 0x43 BOSS | 1268 (geg22+25) | 0 | 4000 (6000) | 7000 | 100 | 1379 (aschen2+24) | none | - | - | 15 (-30,-20) +shake | L5:1 |
| 0x44 | 1269 (geg22+26) | 0 | 2200 (3300) | 7000 | 50 | 1380 (aschen2+25) | none | - | - | 24 (-40,-30) | - |
| 0x45 | 1275 (geg22+32) | 0 | 2300 (3450) | 7000 | 50 | 1382 (aschen2+27) | none | - | - | 24 (-40,-30) | - |
| 0x46 | 1276 (geg22+33) | 0 | 2400 (3600) | 7000 | 50 | 1384 (aschen2+29) | none | k27/f5 @22,20: 8/3/40 | 30 | 24 (-40,-30) | - |
| 0x47 | 1284 (geg22+41) | 0 | 2600 (3900) | 7000 | 50 | 1385 (aschen2+30) | none | k28/f7 @18,-3: 6/15/30 | 30 | 24 (-40,-30) | - |
| 0x48 BOSS | 1285 (geg22+42) | 2 | 850 (1275) | 30000 | 200 | - | none | - | - | 15 (-30,-20) +shake | L6:1 |
| 0x49 | 271 (shots+125) | 2 | 10 (15) | 10 | 15 | - | none | - | - | none | - |
| 0x4A | 281 (shots+135) | 2 | 10 (15) | 10 | 25 | - | none | - | - | none |  anim 0x29 |

Types without level usage are spawned by code (boss parts, launched minions). Ground objects (houses, churches,
trees, cars) are enemies too: layer 0, mostly sub 1 (fixed to the ground), and some pay negative money.

### 7.2 Per-tick update (O, 0x16C0E)
1. While scrolling, y −= 1 (screen-locked); age t += 1 (t starts at 1, so the first update sees t = 2).
2. Movement by `sub` (§7.3; screen-space; a dy of +1 means "fixed to the ground").
3. Despawn without reward when y ≥ scrollY + 200, x < −50 or x > 370 (boss cores and the Golem laser exempt).
   Nothing despawns above the screen.
4. Type hooks: boss scripts (§8); turrets 0x3D/0x46 face the nearest player every tick; the snake parts
   0x20–0x22 face their movement every 3rd tick.
5. Wrecks (dying = 1) keep moving by their sub (usually 1, so they scroll away with the ground) and are removed at
   the bottom; they don't fire or collide.

### 7.3 Movement patterns (`sub`, per tick, screen-space; O, 0x16C0E)
| sub | motion |
|---|---|
| 0, 9 | none |
| 1 | dy +1 (fixed to the ground) |
| 2 | t 2–90 dy +2; 100–150 dy −2; 160–300 dy +2; otherwise hold |
| 3 | dy +2; x = round(x0 + 40·sin(8t°)) |
| 4 | t ≤ 30 dy +2; t 31–300 dy += c, c +1 every 5 ticks (dive) |
| 5 | three arcs (radius-r arc helper, angle step 40·step/r °/tick): ① centre (x0, scrollY+50) r 60, 90° → 0°, step −5; ② centre (x0+20, scrollY+50) r 40, 0° → −270°; ③ centre (x0+20, scrollY+130) r 120, 90° → −90° (exits at the bottom) |
| 6 | dy +2 |
| 0x0A | t ≤ 70 dy +2; t 140–800 dy +2; hold in between |
| 0x0B | ① dy +3 until screen y > 40; ② c +1, a = (10c+180) mod 360, x = x0 + c + 20 + round(20·cos a), y = scrollY + 40 − round(20·sin a) (loops of r 20 every 36 ticks drifting right); leaves (dy +3) when 170° < a < 190° and x > 230 |
| 0x0C | dy +2; every 10th tick c := Random(5) − 2; x += c; c = +2 at x < 0, −2 at x > 300 |
| 0x0D | dy +2 |
| 0x0E | dy +1, dx −1 every 5th tick |
| 0x0F | dy +1, dx −1 |
| 0x10 | dx −3, dy +2 |
| 0x11 | dy +1, dx +1 |
| 0x13 | straight line at 9 px/tick from the spawn point to a stored target; removed above the screen (boss debris) |
| 0x15 | dy +3; c 1–20 dx +3, 31–50 dx −3, c = 61 → 0 (zig-zag) |
| 0x16 / 0x17 | t ≤ 35 dy +3; t 36–200 dy +3 and dx −2 / +2 |
| 0x18 | dy +1, dx +2 |
| 0x19 | t 21–149: on ticks where t mod (t div 20) = 0: dx +3, dy −1; t 201–499: dx +3, dy −1 every tick (accelerating ground vehicle) |
| 0x1A | x0 moves ±1 toward the nearest player's centre; x = x0 + round(5·cos 10t°), y = y0 − round(5·sin 10t°) (y0 is a level coordinate) |
| 0x1B | dy +1; t 50 anim, t 66 fire all guns, t 150 anim, t 166 fire all guns (pop-up turret) |
| 0x1C / 0x1D | dy +4; t 16 anim; t > 16: x = x0 ∓ (t−16)² div 10 (curving away left / right) |
| 0x1E | t < 36 dy +1; then dx +1, dy +2 |
| 0x1F | dx +1, dy +2; anim every 30 ticks; fire all guns when t > 30 and (t−12) mod 30 = 0 |
| 0x20 | dy +2; x = round(x0 + 60·sin(7t°)); anims at (t−4) mod 45 = 0 and (t−30) mod 45 = 0 |
| 0x21 | dx +1, dy +2 |
| 0x23 / 0x24 | dy +2; t 40 anim (+ sound 24 at t 39 for 0x23); t 41–77 dx −2 / +2 |
| 0x26 | at t mod 100 = 0 and (t−25) mod 100 = 0: sound 47, anim, spawn type 0x31 sub 3 after 10 ticks at (x+10, y+35) |
| 0x28 | dy +7 (falling rock) |
| 0x29 | removed when t > 49 (Golem laser) |
| 0x2A | t 2: (vx, vy) := (Random(5)−2, −3); then x += vx, y += vy (dead Golem drifting off) |
| 7, 8, 0x12, 0x14, 0x22, 0x25, 0x27 | boss scripts (§8) |

### 7.4 Enemy guns (O, 0x193CD, 0x15069)
- Each type has a gun class (0 = no guns) with up to 4 guns; per gun: shot kind, flight pattern, offset (dx, dy)
  from the enemy's top-left, inter-shot pause I, salvo size N, salvo pause P. Per class: fire delay D and a
  "script only" flag (those guns fire only from the movement scripts).
- Per tick for an active enemy: while t < D every salvo pause := 3. Then per gun:
  `if pause > 0: pause −= 1 elif inter > 0: inter −= 1 else { if left = 0 { pause := P; left := N } else { fire; left −= 1 }; inter := I }`
  → salvos of N shots spaced I + 1 ticks, then a gap of P + I + 1 ticks. At spawn left = N, pause = inter = 0.
- Kind 0xFF launches an enemy instead of a shot (carrier 0x2E → fighter 0x2F after 12 ticks).
- 49 enemy-shot slots; the fire sound is played only if fewer than 4 SMIX voices are active (I).
- Aimed patterns (5, 6) target the centre-top of a player: a given one, or a random living player per shot.

### 7.5 Enemy shots (O, 0x15671)
Level coordinates (no scroll compensation). s = speed of the shot kind.
| pattern | motion per tick |
|---|---|
| 1 / 2 | y += s / y −= s |
| 3 / 4 | y += s, x += s / y += s, x −= s |
| 5 | aimed: straight line toward the target fixed at fire time (major axis s px) |
| 6 | homing: re-aims at the nearest player's centre every tick |
| 7 | line toward a rotating target: the direction turns 4° per enemy tick (rotating spray) |
| 8 / 9 / 10 / 11 | (x+s, y + s div 3) / (x+s, y − s div 3) / (x−s, y + s div 3) / (x−s, y − s div 3) |
| 12 / 13 / 14 / 15 / 16 | x −4 / (−4, +1) / (−3, +2) / (−3, +3) / y +4 |
| 17 | clockwise arc of radius 200 starting at the gun, 2°/tick |
| 18 | x += s, y += s + 1 |
| 19 | falling: y += v, v +1 per tick up to 9 |
| 20 | y += s; x ±2 toward the nearest player's centre |
| 21 | glued to enemy slot 4 at (+13, +37) for 23 ticks (boss beam) |
| 22 | 8-way along the turret's facing: orthogonal s, diagonal s − 2 per axis |
Removed when off screen (y > scrollY + 200 or < scrollY, x > 320 or < 1).

| kind | sprite | damage | speed | sound | | kind | sprite | damage | speed | sound |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 148 | 10 | 6 | 3 | | 16 | 238 | 30 | 3 | 25 |
| 2 | 190 | 30 | 6 | 3 | | 17 | 240 | 20 | 10 | 3 |
| 3 | 191 | 20 | 6 | 3 | | 18 | 241 | 30 | 2 | 12 |
| 4 | 192 | 10 | 5 | 3 | | 19 | 244 | 15 | 7 | 28 |
| 5 | 193 | 10 | 5 | 3 | | 20 | 245 | 20 | 4 | 12 |
| 6 | 195 | 20 | 6 | 3 | | 21 | 246 | 20 | 5 | 12 |
| 7 | 148 | 20 | 4 | 3 | | 22 | 247 | 20 | 4 | 28 |
| 8 | 194 | 10 | 4 | 3 | | 23 | 248 | 25 | 3 | 12 |
| 9 | 196 | 30 | 6 | 1 | | 24 | 252 | 70 | 5 | 25 |
| 10 | 198 | 30 | 5 | 3 | | 25 | 262 | 30 | 5 | 28 |
| 11 | 201 | 10 | 5 | 3 | | 26 | 270 | 30 | 7 | 1 |
| 12 | 232 | 40 | 6 | 7 | | 27 | 241 | 60 | 5 | 12 |
| 13 | 194 | 20 | 7 | 3 | | 28 | 238 | 50 | 4 | 26 |
| 14 | 223 | 20 | 5 | 4 | | 29 | 263 | 5 | 8 | 3 |
| 15 | 231 | 25 | 5 | 3 | | | | | | |

### 7.6 Kills, wrecks, explosions (O, 0x12A1E, 0x11A08, 1d9e:157A/1004)
- Kill: money to the killer (§3.6), explosion of the type's kind, bonus roll (§5.1). If the type has a wreck
  sprite, the wreck stays and scrolls away with the ground (boss wrecks stay put).
- Explosion kinds spawn 1–30 animations with delays and random offsets; kind 12 and 15 cover the screen; kind 15
  (boss cores) also shakes the screen for 40 ticks (scrollX += Random(10) while drawing; sound 14).
  40 explosion slots, level coordinates.

| anim type | frames | ticks per frame | sound |
|---|---|---|---|
| 1 | 293–299 | 1 | 6 |
| 2 | 300–306 | 1 | 9 |
| 3 | 307–316 | 1 | 4 |
| 4 | 317–320 | 1 | 2 |
| 5 | 321–332 | 1 | 7 |
| 6 | 333–345 | 2 | 14 |
| 7 | 346–358 | 1 | 7 |
| 8 | 359–368 | 1 | 26 |
| 9 | 376–383 | 3 | 6 |
| 10 | 369–375 | 3 | 39 |
| 11 | 384–392 | 2 | 6 |
(A frame advances on ticks where frame mod rate = 0.)

### 7.7 Shadows (O, 1d9e:1C8A)
Air enemies (layer 1) cast a shadow at (+12, +12); some ground types use the offsets in the table. The shadow is
the same sprite drawn in AniVGA shadow mode (darkened background). (ASCHEN1/2 are wreck sprites, not shadows.)

## 8. Bosses
### 8.1 Common flow (O, 0x1627E)
1. When scrollY reaches the boss record's y (level 1: −5561, 2: −5573, 3: −5898, 4: −5873, 5: −6017,
   6: −5711): scrolling stops for good; fade to black; CD track 8; players moved to screen y 160; all enemies,
   enemy shots, player shots and explosions cleared; the level's boss parts spawn at fixed positions (the
   record's x/sub are ignored), parts first, so they take enemy slots 1, 2, 3…; 1.2 s black pause; fade in.
2. No level spawns and no bonus drops during the fight.
3. The fight ends when the **core** dies (types 0x23, 0x05, 0x20, 0x3C, 0x43, 0x48 for levels 1–6): its money is
   split between the players, explosion kind 15 (+ shake), its wreck stays and every other enemy is removed.
4. Next tick the level-end autopilot runs (§9.1).
Positions below: s = scrollY at the boss start, coordinates are top-left; "c" = the part's counter.

### 8.2 Level 1: escort pair (core 0x23 + escort 0x24)
- Spawn: sound 35 ×2; escort 0x24 at (117, s+59); core at (130, s+5). Both sub 0x14.
- Shared path, counter c (+1 per tick), 426-tick loop: 1–50 y+1 · 51–100 x−1, y−1 · 101–140 x−1 · 141–165 y+4 ·
  166–215 y−2 · 216–305 x+2 · 306–330 y+4 · 331–380 y−2 · 381–425 x−2 · 426 c := 0. Sound 37 at c 140 and 305.
- Core fires a 3-way spread (kind 10, damage 30: straight, down-right, down-left) at c 50, 140, 305. Escort fires
  2 guns automatically (kind 11, salvos of 4).

### 8.3 Level 2: core 0x05 with parts 0x0C and 0x0D
- Spawn: sound 17 ×2; 0x0C at (141, s+80); 0x0D at (115, s+51); core at (125, s+55), sub 7. The parts follow the
  core every tick: 0x0D at core + (−10, +20), 0x0C at core + (16, 46).
- Phase A (core in the air): loops of radius 50 left then right of the start point (5°/tick, 72 ticks each), then
  at random either repeat or swoop (30 ticks (−2, +2), 30 (+4, 0), 30 (−2, −2), 30 wait). 0x0C fires aimed salvos.
- Killing 0x0D: sounds, 40-tick quake; the core (and 0x0C) drop to **ground layer**, so the player must fly low.
- Phase B (core on the ground): wait 40; fly to the top-left corner at 2 px/tick; then repeat: 30 (+2, +2),
  30 (+2, −2), 40 ticks dropping an egg (0x0E) every 5th tick, 30 (+2, +2), 30 (+2, −2); then fly left 3 px/tick
  firing both guns down every 20 ticks until x < 8.
- Killing the core ends the fight at any time.

### 8.4 Level 3: snake (head 0x20, 3 body 0x21, tail 0x22), sub 0x12
- Spawn x 140; head y s+45, bodies s+25, s+5, s−15, tail s−40 (bottoms; sprite y = bottom − height).
- Path, 4 px/tick straights and arcs at ≈ 4.19 px/tick: down to s+50; arc r 30 (−8°/tick) 0°→−180° around
  (110, s+50); arc r 30 0°→180° around (50, s+50); arc r 100 180°→270° around (120, s+50); right to x 140;
  full circle r 40 around (140, s+110); right to x 160; arc r 100 −90°→0° around (160, s+50); arc r 30 0°→180°
  around (230, s+50); 1.5 turns r 60 0°→−540° around (140, s+50); repeat from the second arc.
- Sprites face the movement (8 directions, every 3 ticks).
- Head fire: every 3 ticks, at each player whose direction from the head equals the head's movement direction:
  aimed kind 12 (damage 40).
- Killing a body segment pays 1000, refills it, and removes the *last* body segment instead (the snake shortens
  from the back; the debris flies off at 9 px/tick). Tail (800) and head (1000) die normally; the head ends the fight.

### 8.5 Level 4: tank (core 0x3C, turrets 0x3D ×2, guns 0x3F, 0x3E)
- Spawn: tank engine sound 51 (looping, I); turrets at (108, s+90) and (151, s+90), 0x3F at (118, s+65),
  0x3E at (128, s+63), core at (80, s+110). Parts follow the core at (+28, +63), (+71, +63), (+38, +24), (+48, +17).
- Core path by age c: hatch opens/closes (anims, sound 52) and moves in a rectangle: 20–50 x−2, 71–100 y+2,
  121–150 y−2, 171–200 x+2, 221–250 y+2, 271–320 x+2, 341–370 y−2, 391–440 x−2, c 461 → 3 (net drift −2 px per
  458-tick loop).
- Turrets aim at the nearest player and fire along their facing; 0x3E fires a large shot (damage 70) every 80
  ticks; 0x3F fires falling salvos.
- **The core can't be damaged until all four parts are destroyed** (confirmed by the user in the game, session 4). Core death: engine stops, sound 50 ×2.

### 8.6 Level 5: fortress (core 0x43 + 0x45, 0x47, 0x44, 0x46)
- Spawn: 0x45 (140, s+96), 0x47 (139, s+69), 0x44 (97, s+53), 0x46 (161, s+35), core (80, s+140). Static except 0x45.
- 0x45 follows the nearest player's x at 1 px/tick within x 125…161 (rams). 0x44 launches a minion 0x31 every
  100 ticks twice (t mod 100 = 0 and 25). 0x46 aims salvos at the nearest player. 0x47 fires rotating sprays.
- **The core can't be damaged until slots 1–4 are destroyed**; it has no guns.

### 8.7 Level 6: the Golem (0x48, always enemy slot 2)
- Spawn: sound 53 ×3; Golem at (45, s−30), sub 0x27. Immune to shots until 210 ticks old; ramming costs the player
  200 and doesn't hurt it.
- Intro: c 60 roar (sounds, anim); **c 150 curse: every player's bonus inventory is emptied and every pod except the
  standard weapon is destroyed**; c 250 → attacks.
- Attacks, chosen at random (state 2 + Random(4)) after each one:
  - Teleport: anims and sounds, at c 200 jump to x = Random(240) − 60, y = s − 50 + Random(70); ends at c 280.
  - Rocks: 60-tick quake, three rocks (0x49) at x = 100(i−1) − 40 + Random(80), y s−40, falling 7 px/tick; ends at c 100.
  - Bounce: velocity (2, 2) inside x −60…180, y s−50…s+90, reversing at the edges, c 25–399 (looping sound 31).
  - Laser: two laser beams (0x4A, 50 ticks each, unshootable, ram damage 25) at c 1 and c 44; ends at c 180.
- Death: money 30000, the Golem sprite becomes 1333 and drifts off (sub 0x2A). Level 6 complete → game complete.

## 9. Game flow
### 9.1 Level end (O, 0x1A951, 0x1B6D1)
- Autopilot: players can't steer and don't collide; each flies up 3 px/tick and toward x 158–162 (P1) / 128–132
  (P2) at 3 px/tick. When every active player is 30 px above the screen top: level complete; level + 1 (after
  level 6: game completed). Fade out, back to the hangar.
- After level 6: the ending text (MISSIONS.PAS lines 98–119, scrolling over RASTER.PIC), then the program exits so
  the batch file plays the ending video (CD track 9).
- Abort (Esc) and game over return to the main menu.

### 9.2 Menus
- Main menu: new game, load game, story, manual (Anleitung), about, quit (CD track 2; story = track 3).
- Hangar (game menu, mouse): **Shoot em all** (mission briefing from MISSIONS.PAS, then the level),
  **Shop**, **Multiplayer** (P2 joins: "Verstärkung? Enter=Ja"; can't be undone), **Optionen**, back to the
  main menu.
- Options: control type P1/P2, CD sound, sound effects. The original's CPU line is dropped (decision, user, session 4).
- New game: level 1, P1 only, 5 lives, 0 money, Firestorm, engine 1, shield 1, no pods, no bonuses. A joining P2
  starts with the same. Lives, money, jet and equipment carry over between levels; life and shield are refilled
  and both players start high at (60, 140) (P1) and (140, 140) (P2).
- During a level the engine sound 5 loops (heli: sound 49).

### 9.3 Sprite cycles (O, 1d9e:3105)
Many sprites animate by themselves: every tick, any sprite whose number lies in a cycle range [first, last)
advances by one, and one at `last` jumps back to `first`, on ticks where the cycle counter mod rate = 0. There are
48 global cycles plus 24 (episode 1) or 37 (episode 2). The table is in `tools/enemy_table.py` output.
Separate sprite animations (43 entries: first/last frame, rate, ping-pong, rest frame) drive one-shot effects
(turret pop-ups, boss hatches, Golem moves).

### 9.4 Two players (summary)
Enemy energy ×1.5; kill money ×2 to the killer; boss money in full to each; separate lives/money/equipment;
money can be exchanged in the shop; the game ends when both are out. P2's HUD is on the right.

## 10. Shop (O, 1d9e:84BC; see re-notes)
- Mouse-driven, per player (switch between players if both are active). Categories: Kleine Pods, Grosse Pods,
  Boni, Antriebe, Schilde, Kugel Pods, Jets (prices in §3.2, §4.3, §5.2).
- Offers: items with price > 0, sorted by price, 5 per page; jets only above the current one; boni only those
  sold in the shop (2, 4–9, 11). Only affordable items can be bought.
- Buying: small pod, ball pod, engine and shield have one slot each (sell first to replace); large pods go to a
  free mount of the player's choice, at most 2 of the same; boni go to a free bonus slot (3 max). "1 Leben" adds a
  life at once, "Save" saves at once. A new jet refunds the old one at half price and installs its standard weapon.
- Selling: half price (boni a quarter). The jet and the standard weapon can't be sold.
- Save price: 4000 + 10000·min(level − 2, 4) for the level about to be played (4000 … 44000; level 1 gives a
  negative value, see §12).
- Money exchange (both active): move min(own money, step) to the other player; step 1 / 100 / 1000 / 9000.

| Category | # | Name | Price |
|---|---|---|---|
| Boni | 2 | Atombombe | 12000 |
| | 4 | 1 Leben | 20000 |
| | 5 | Blast | 25000 |
| | 6 | Death | 30000 |
| | 7 | Twin-Laser | 15000 |
| | 8 | Aid | 10000 |
| | 9 | Star | 18000 |
| | 11 | Save | see above |

## 11. Reference
Sound numbers (0-based; 0–34 AREA.SND, 35–58 AREA2.SND):
0 STDSHOT 1 LASER 2 MINIPOD 3 GSHOT 4 GETBONUS 5 ENGINE 6 EXPLO1 7 EXPLO2 8 FLAMER 9 FLAMEHIT 10 BLAST
11 PHASER3 12 GRLASER 13 LACHEN 14 MEGABOOM 15 BOMBFALL 16 DROHNE3 17 BOSS1W1 18 BOSS1W2 19 BOSS1W3 20 AIDBONUS
21 LRM003B 22 ALARM01 23 BMBLITZ 24 EBALL 25 SHOCKER 26 SHOCKHIT 27 BUBBLES 28 ROCKET 29 SUMM 30 KIRCHE 31 BLAST2
32 KILL 33 HORSKILL 34 LOSER 35 BOSS2W1 36 BOSS2W2 37 BOSS2W3 38 WIEHER 39 BURNING 40 SBONUS 41 SKRITISH
42 SLOSER 43 SSDEAKT 44 SSHIELD 45 SZIVIL 46 AC 47 DOORUP 48 DUKE 49 HELI 50 SWARRIOR 51 PANZER 52 PTURN
53 GOLEM 54 GOLEM2 55 GOLEM3 56 GOLEM4 57 GOLEM5 58 GLASER.

## 12. Original bugs: the remake fixes them (decision, user, session 4)
The user decided that the remake fixes original bugs, including any found later. Classic mode keeps the original
feel otherwise. "Fix" states the intended behaviour; values marked *design* are our choice, not from the original.
| # | Bug (as the code reads) | Fix in the remake |
|---|---|---|
| 1 | Rocketlauncher (60000) is never offered: the shop's offer list drops an item priced the same as the previous one (E-Shocker) | list every item; equal prices ordered by item number |
| 2 | Distroyer ball pod has reload 0, so it fires once per level | give it a reload (*design*: 10 ticks, like the Firestorm gun) |
| 3 | Only P1's ball pod damages enemies (both destroy enemy shots) | both players' ball pods deal contact damage |
| 4 | Autogun never plays its fire sound | play its table sound (2 MINIPOD) |
| 5 | P2's velocity isn't reset between levels | reset both players' velocity at level start |
| 6 | Save price on level 1 is negative (−6000) | price = 4000 + 10000·min(max(level − 2, 0), 4) (*design*: 4000 on level 1) |
| 7 | Level 3 snake debris always flies toward x = 0 (target cleared before use) | fly toward the random target x the script picks |
| 8 | Golem curse: P2's pod explosions appear at P1's pod positions | explode at P2's pods |
| 9 | Level 4 tank drifts 2 px left per loop (I: unintended) | closed loop with no net drift (*design*) |
| 10 | Mouse control: the "move up" limit compares x instead of y | compare y (screen y ≥ 10) |
| 11 | Joining P2 sets P1 active again even if P1 was out (I) | joining only adds P2 |

## 13. Open questions and proposed DOSBox-X checks
Priority order; each needs one short capture (`original_source/capture/`) or a debugger session.
(The CPU-option capture is no longer needed: the remake has no CPU option, decision user, session 4.)
1. **Draw order** (high/low jet vs air/ground enemies, ground objects vs air enemies): a few screenshots in
   level 1 flying low and high under/over a flyer.
2. **Shot speeds on screen**: level 1 type-3 flyers fire kind 2 (speed 6) down → expect 7 px/tick on screen;
   the standard shot (speed 6) should rise 5 px/tick.
3. **Respawn and invulnerability**: one death: jet from below at x ≈ 150, 3 px/tick, arc with countdown 5…1 for
   100 ticks; HUD lives 5 at start, game over after the 6th death.
4. **Shop**: Grosse Pods list without Rocketlauncher; Save price shown on level 1 (documents the original; the
   remake fixes both, §12).
5. **Boss checks**: ~~level 4 core invulnerable until the parts are gone~~ (confirmed by the user, session 4);
   tank engine sound loops; level 3 debris direction; Golem curse removes all pods except the standard weapon.
6. **Hit test precision**: a near miss on a large sprite (boss): transparent corners should not collide.
7. Debugger (optional): `bpm ds:16c2` never triggers; bonus drop rate ≈ 14 % over a level.
