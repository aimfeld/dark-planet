# Translation notes (German → English)

Phase 5 (Steam). The language is a setting of its own, independent of the graphics mode (decision 29).
This file holds the inventory of everything a player reads, and later the passages that need the user
(insider jokes, slang, Swiss German, puns).

## Inventory (session 24, 2026-10-23)

Sources: the game code (`game/src/`), the remastered atlases and pictures (`game/public/remaster/hq4x/`, which
contain every sprite and picture the game shows), and the intro and ending videos (contact sheets at 1 frame
per second).

### 1. The text files (`texts.json`, about 4,300 words)
| File | Lines | Shown by | Line ranges in the code |
|---|---|---|---|
| STORY.TXT | 263 | main menu "Die Geschichte", scrolling (mode 1) | 1–261 (`mainMenu.ts`) |
| ANLEIT.UNG | 288 | main menu "Spielanleitung", pager (mode 3) | 1–288 |
| ABOUT.TXT | 223 | main menu "Horse Productions", centred, scrolling | 1–207 (`ABOUT_LAST`) |
| MISSIONS.PAS | 127 | hangar briefings (mode 2, 20 lines each) and the ending (mode 1) | `BRIEFING`, `ENDING` in `hangar.ts` |
| INFO.PAS | 483 | the shop's info box (BEGIN/END THEMA, ART, SPEZIAL blocks) | by marker |

The English files need their own line ranges (a briefing may need more or fewer lines than the German one), so
the ranges become per-language data. Briefings have at most 20 lines on screen. The shop's info box holds about
18 characters × 6 lines (INFO.PAS's own header says so: `max buchstaben pro zeile=18, max zeilen=6`).

### 2. UI strings in the code (the original's and the remake's)
| Where | Strings |
|---|---|
| `screens/start.ts` (remake) | the intro (3 lines), the hint (2 lines), the buttons "Classic 1998", "Remastered 2026", "Prototyp 1997" |
| `screens/options.ts` | "Steuerung Player1:" + Tastatur/Maus/Joystick/WASD/Touch, "CDSound:", "SoundEffekte:", " an"/" aus", "Grafik: Classic/Remastered", "Menu verlassen" |
| `screens/hangar.ts` | labels "Shoot em all", "Shop", "Multiplayer", "Optionen", "Zurück zu Hauptmenu"; "Verstärkung? Enter=Ja, Rest=Nein"; "Zurückschalten nicht möglich!"; touch keys "Ja", "Nein", "Cheat" |
| `screens/shop.ts` | categories "Kleine Pods", "Grosse Pods", "Boni", "Antriebe", "Schilde", "Kugel Pods", "Jets"; "1 Leben", "Save"; "Investiert:", "Rückzahlung: "; "Noch kein Text!" |
| `screens/mainMenu.ts` | the save-protection message (3 lines, "Na du kleines Schlitzohr …") |
| `sim/player.ts` | "Loser!" (the same in English) |
| `input/keyLegend.ts` (remake) | the key legend: one line per control type, the general keys, the start screen, the videos |
| `input/touch.ts` (remake) | buttons "Feuer", "Höhe", "Bonus wählen", "Bonus feuern", "HD" |
| `main.ts`, `index.html`, manifest (remake) | "Lade Daten…", "Lade Update…", "Daten konnten nicht geladen werden", "Grafik: Classic/Remastered" (the R toast); `<html lang="de">`; the manifest's description |
| `sly/main.ts` (prototype page) | "Lade Daten…", the title and end screens, touch keys "Nochmal", "Zurück" |

Item names (Firestorm, Missiles, Myonenwerfer, Teutonenkopf …) come from DP.EXE's tables but are shown only through
INFO.PAS, so they are translated there.

### 3. Text in sprites and pictures
| Sprite(s) | Text | Needs new art? |
|---|---|---|
| 613–678 (REST.LIB, main menu items, 6 × 11 frames, in the `menu`, `hangar` and `common` atlases) | Neues Spiel, Spiel laden, Die Geschichte, Spielanleitung, Horse Productions, Exit | yes, the first four (PLAN Phase 5, item 2) |
| 501 (SHOP.LIB, the shop panel) | KUGEL, KL.POD, STANDADPOD [sic], SHIELD, GR.PODS (×2), BONI, ANTRIEB, GELD AUSTAUSCH, PLAYER, KAUFEN, VER KAUFEN, POSITION WECHSEL, HAUPT MENU | yes: KUGEL, KL.POD, STANDADPOD, GR.PODS, BONI, ANTRIEB, GELD AUSTAUSCH, KAUFEN, VER KAUFEN, POSITION WECHSEL, HAUPT MENU (a small all-caps pixel font, about 5 px high) |
| 535 (the money exchange panel) | PLAYER 1, PLAYER 2 | no |
| 536 | EXIT | no |
| 520 and its cycle | INFO | no |
| HUD bonus icons (BONI.LIB) | BOMB, SHIELD, LIFE, BLAST, DEATH, LASER, AID, STAR, SAVE | no |
| The pictures HMBILD, OMBILD, RASTER, UMBILD | none | no |

### 4. The videos
- intro.webm (181 s): "HORSE Productions", "Presents", "Dark Planet". All English already.
- ending.webm (13 s): no text.
The sheets sample one frame per second, so a text shown for less than a second could be missing. Nothing in the
cut suggests one.

### Conclusion
New art is needed only for the four main menu items and the shop panel's labels. Everything else is text drawn
with the game's fonts, which have every character English needs.

## Where the English goes (session 24)
- UI strings: `game/src/i18n.ts` (the English object must have every key the German one has; TypeScript checks).
  First English versions are in; they fit (test/i18n.test.ts) but still need the user's review.
- Text files: `game/src/texts/en/STORY.TXT`, `ANLEIT.UNG`, `ABOUT.TXT`, `MISSIONS.PAS`, `INFO.PAS`, plain UTF-8,
  hand-wrapped. Rules the tests check: no line wider than the widest German line of the same file; INFO.PAS keeps
  every BEGIN/END marker in order; MISSIONS.PAS keeps its seven headings in capitals ("MISSION 1:" … "THE END"),
  each briefing at most 20 lines, and two empty lines after the ending (what follows stays hidden).

## Passages that need the user
- ~~The cheat word~~ **Decided (user, session 24): the cheat stays GEDANKE in English too** (decision 31). The
  English riddle in ABOUT.TXT must still lead to it, e.g. by saying the answer is German, and the key legend keeps
  "Cheat code: gedanke".
(More with the draft translation.)
