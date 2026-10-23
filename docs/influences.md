# Influences: what Dark Planet borrowed and what it added

None of the original files name an influence. The only stated sources are the start-screen line approved by the
user ("inspiriert von Raptor und Xenon 2", PLAN session 20) and the README. Everything below comes from comparing
the manual (`ANLEIT.UNG`), `STORY.TXT`, `ABOUT.TXT`, `INFO.PAS` and `docs/gameplay-spec.md` with what is known
about other games. So the "borrowed" items are likely borrowings, not proven ones. Comparisons with other games
come from general knowledge of those games, not from this repo.

## Borrowed: the genre framework
- **Vertical-scrolling shooter that pays you for kills and lets you shop between levels.** This is the core of
  Raptor (1994) and Xenon 2 Megablast (1989, where Colin the shopkeeper buys and sells weapons). Buying and selling,
  getting less back when you sell (half the price, a quarter for bonuses), and the hangar menu ("Shoot em all",
  options, save) follow Raptor's hangar and supply room closely.
- **Choice of keyboard, joystick or mouse.** Raptor was known for its mouse control.
- **An auto-aiming gun.** The Autogun ("Visiert die Ziele selber an!") matches Raptor's auto-track mini-gun.
- **Air and ground enemies, with shadows showing which is which.** Raptor and Xevious did this, and air units with
  shadows were standard by then.
- **Two energy bars: a shield that recharges (faster with a better shield) over hull energy that doesn't.** Tyrian
  (1995) works the same way with shield and armour. Tyrian was never named, so this may be coincidence.
- **Ships with different numbers of weapon mounts, and pods on the sides.** Similar to Tyrian's hulls and sidekicks
  and Xenon 2's add-ons.
- **Bosses** (gameplay-spec §8): a snake made of segments, a tank with turrets, a fortress, and a final demon (the
  Golem). All are stock genre bosses.

## A twist on a borrowed idea: the altitude switch
In Raptor the *weapon* decides what it can hit (air-to-air or air-to-ground missiles), and the player stays at one
height. Dark Planet moves that choice to the *player* (gameplay-spec §3.3). You switch between flying high and low,
you can only hit or ram enemies at your own height, and the shadow's offset tells you which height an enemy is at.
Changing height to dodge is a risk the player chooses ("erhöht das Risiko einer Kollision um einiges"). It also
affects other systems: you can only pick up bonuses while flying high (§5.1), and the Autogun is the one weapon
that hits both heights (§4.6). Other games had height in some form (Xenon 1's switch between tank and plane,
Zaxxon), but this combination looks like the team's own. It already appears in the 1997 prototype `SLYVERS.PAS`,
which has both a tank and a ship.

## Their own
- **Saving costs money.** You buy a save item ("Savebonus") in the shop, and it gets more expensive each level.
  There is only one save slot. No earlier game with this is known.
- **Bonus inventory:** up to three bonuses, picked up or bought. You select one and fire it. Picking up a fourth
  uses it immediately. Bonuses can be sold for a quarter of their price.
- **Two-player co-op you join from the hangar mid-game.** Once player 2 joins they can't be removed, the players can
  pass money to each other in an exchange menu, and enemies get tougher.
- **Engines bought to make the ship more agile,** a helicopter among the ships ("Steptokopter"), and only two copies
  of the same large pod allowed.
- **The story's structure.** In the distant past, Germanic villagers find a crashed UFO and accidentally fly it
  back to its home planet, Sino'oh'lar, the Dark Planet. There they meet the Golem, who reads the ship's route
  records and sends a ship of death to Earth. So humans brought the threat to Earth themselves. The crashed-UFO,
  ancient-astronauts setup is a common trope, but this loop is original.
- **The writing voice:** black humour throughout (the manual asks for "Sinn für schwarzen Humor"), Swiss-German
  in-jokes, and the joke weapon descriptions in `INFO.PAS` ("NICHT IN DEN MUND STECKEN!").
- **All the content:** 3D-rendered graphics, the FLI videos (by Jan), the CD soundtrack (Wunibald and Giratte; FastTracker 2 plus their own electric guitar recordings),
  the levels, and the mascot "Pferdi" of Horse Productions.

## Parody and references in the text (borrowed on purpose)
- **Lord of the Rings:** "Fladnag der Graue" is Gandalf the Grey spelled backwards, and "FLIEHT IHR NARREN!" is
  "Fly, you fools!"
- **Indiana Jones and the Last Crusade:** "nur der bussfertige Mann wird bestehn" is "only the penitent man will
  pass". It's quoted in the story, in the multiplayer section of the manual, and in the credits.
- **The Simpsons:** "Smithers, stellen sie dieses verfluchte Ding ab!" (Mr. Burns telling Smithers to switch off
  the hologram recorder), a fight over watching the Simpsons or the German soap *Unter Uns*, and Mr. Burns and
  Maggie in the credits.
- **Others:** Garfield as "Kater Garfildon", Zarathustra, Lo Wang from Shadow Warrior (1997), Mr. Spock, Lem, the
  Golem, the number 666, and a running gag about crashing Windows 98.

## Tools and libraries (not theirs)
The sprite and scrolling engine is AniVGA, the sound mixer is SMIX, and the videos play through Autodesk's
`AAPLAY.EXE`, all in Turbo Pascal 7. The game code builds on the team's own earlier work: Wunibald's *Cyberworms2*
(`CD/Wasndas/CW2/`) and the Sly prototype (`CD/Wasndas/SLY/SLYVERS.PAS`, August 1997).

## Summary
The shop-and-upgrade shooter design comes from Raptor and Xenon 2. The team's own additions are the
player-controlled altitude, paid saves, the three-slot bonus inventory, co-op you can join mid-game, and above all
the fantasy-parody story and humour.
