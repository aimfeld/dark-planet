// SLYVERS.PAS (August 1997, original_source/CD/Wasndas/SLY/), the Dark Planet prototype with Sly as the boss,
// ported procedure by procedure. Names, globals and the order of the steps follow the Pascal source, including its
// quirks (shared loop variables and GoOut, sprite slots used twice), so it plays like SLYVERS.EXE. Pascal's
// 1-based arrays keep their indices (element 0 unused). Integer variables wrap at 16 bits as in TP with R-.
//
// The main program is a generator: each yielded number is how long (ms) the picture stays as it is now. A game
// frame is FRAME_MS; FadeToPalette and Delay yield their own times.

import type { SoundEvent } from '../sim/state';
import { round, sinDeg, TpRandom } from '../sim/tp';
import { AniVga, RETRACE_MS } from './anivga';
import type { SlyData } from './data';

/**
 * One pass of the main loop: the work, Delay(10) and Animate (its page flip doesn't wait for the retrace). Measured
 * 65-67 fps in DOSBox-X at cycles=64000, the setting where DP.EXE runs at 41 fps (docs/re-notes.md "SLYVERS").
 * The user found that too fast: 40 fps, like Dark Planet's tick (session 22, after trying 53). The fades and
 * Delay(800) keep their times.
 */
export const FRAME_MS = 25;

const END_WAIT_MS = 20000;

const i16 = (v: number) => (v << 16) >> 16;
const sin = (rad: number) => sinDeg((rad * 180) / Math.PI);
const Pi = Math.PI;

// CONST
// brightness = 50: SetShadowTab(brightness) is applied by tools/export_sly_data.py
const NullpunktX = 0;
const NullpunktY = 0;
const FontName = 'Fire.FNT';
const Levelname = 'Level2.lev';
const TileName = 'Back1-14.lib';
const JetA = 'JetB2.cod', LJetA = 1;
const JetB = 'JetB3.cod', LJetB = 2;
const MissileA = 'Mis1A.cod', LMissileA = 3;
const MissileB = 'Mis1B.cod', LMissileB = 4;
const Shot1 = 'S10.cod', LShot1 = 5;
const Shot2 = 's11.cod', LShot2 = 6;
const Gegner1 = 'Ufo!.cod', LGegner1 = 7;
const Gegner2 = 'Sly_16e.cod', LGegner2 = 8;
const Explosion1 = 'Expl1-7B.lib', LExplosion1 = 9;
const Explosion2 = 'Ex2A-F.lib', LExplosion2 = 16;
const EnergieBalken = 'Icon5!.cod', LEnergieBalken = 22;
const Gegner3 = 'Ufo.lib', LGegner3 = 23;
const Shot3 = 'Laser2.cod', LShot3 = 28;
const PTraegHeit = 6;
const PPunkteLadeNr = 70;
const PPunkteSpriteNr = 5;
const PEnergieMax = 165;
const PShieldMax = 660;
const PKolosSchaden = 70;
const SchattenLadeBeginNr = 40;
const PShieldLadePause = 10;
const PanzerSpriteNr = 101;
const EnergieBalkenSpriteR = 8;
const EnergieBalkenSpriteL = 7;
const PanzerAnbauSpriteBegin = 91;
const PanzerSchattenSprite = 171;
const PanzerShotSpritesBegin = 102;
const GegnerShotSpritesBegin = 31;
const GegnerSpritesBegin = 181;
const BodenExSpritesBegin = 211;
const LuftExSpritesBegin = 11;
const LGSSpritesBegin = 231;
const MaxExplosionen = 38;
const MaxPanzerAnbauPositionen = 8;
const MaxPanzerShot = 48;
const ShotPower = [0, 80, 15, 50];
const ShotPause = [0, 15, 10, 10];
const ShotLadeNummer = [0, LMissileA, LShot1, LShot3];
const ShotXPos = [0, 0, 0, 0];
const ShotYPos = [0, 0, 0, -199];
const ShotSpeed = [0, 5, 6, 0];
const ShotSoundNr = [0, 20, 33, 33];
const PanzerAnbauXPos = [0, -5, +27, +4, +16, -11, +43, -22, 0];
const PanzerAnbauYPos = [0, +23, +23, +10, +10, +5, +7, +7, 0];
const MaxAktivGegner = 29;
const MaxAnzahlGegner = 10;
const MaxGegnerShot = 49;
const MaxAktivGegnerShots = 4;
const GEnergie = [0, 100, 3000, 150];
const GLadeNummer = [0, LGegner1, LGegner2, LGegner3];
const GKolisionPower = [0, 100, 200, 100];
const GScoreUp = [0, 100, 2000, 300];
const SchattenX = [0, +6, +6, +10];
const SchattenY = [0, +6, +6, +10];
const GShotPower = [0, 20, 60];
const GShotSound = [0, 33, 33];
const GShotLadeNummer = [0, LShot1, LShot2];
// [Gegner art][shot 1..4]
const GShotArt = [[], [0, 0, 0, 1, 1], [0, 1, 1, 1, 1], [0, 0, 0, 0, 1]];
const GShotXPos = [[], [0, 0, 0, +15, +1], [0, +21, +43, +12, +65], [0, 0, 0, 0, +20]];
const GShotYPos = [[], [0, 0, 0, +20, +20], [0, +30, +30, +10, +10], [0, 0, 0, 0, +26]];
const GShotZwischenPause = [[], [0, 0, 0, 5, 5], [0, 5, 5, 5, 5], [0, 0, 0, 0, 3]];
const GShotSalvenPause = [[], [0, 0, 0, 40, 40], [0, 30, 30, 20, 20], [0, 0, 0, 0, 20]];
const GShotSalve = [[], [0, 0, 0, 5, 5], [0, 2, 2, 5, 5], [0, 0, 0, 0, 10]];
const GShotFlugart = [[], [0, 0, 0, 5, 5], [0, 6, 6, 5, 5], [0, 0, 0, 0, 6]];
const GShotSpeed = [0, 6, 8];
const AktivierungY = [0, -100, -100, -500, -500, -700, -703, -700, -800, -815, -1100];
const AktivierungX = [0, 30, 250, 30, 270, 30, 110, 110, 40, 120, 110];
const AktivierungArt = [0, 3, 1, 3, 1, 1, 1, 1, 1, 1, 2];
const AktivierungMove = [0, 6, 2, 6, 3, 6, 2, 1, 3, 2, 4];
const ShipSpeed = 3;

interface PanzerShotRec { SpriteNr: number; FlugArt: number; Aktiv: boolean; Art: number; ShotMoveZaehler: number; StartX: number }
interface AnbauRec { SpriteNr: number; ShotPause: number; AnbauGeladen: boolean; PositionBesetzt: boolean; Position: number; Art: number; FlugArt: number }
interface GegnerRec {
  SpriteNr: number; Art: number; Aktiv: boolean; Move: number; Energie: number;
  ShotZwischenPause: number[]; ShotSalvenPause: number[]; ShotSalve: number[]; MoveZaehler: number;
}
interface GegnerShotRec { SpriteNr: number; FlugArt: number; Aktiv: boolean; Art: number; StartX: number; StartY: number; ZielX: number; ZielY: number }
interface ExplosionRec {
  SpriteNr: number; XPos: number; YPos: number; Von: number; Bis: number; Stand: number;
  Pause: number; Verzoegerung: number; BodenLuft: boolean; Aktiv: boolean; Zittern: boolean;
}

const array = <T>(n: number, make: () => T): T[] => Array.from({ length: n + 1 }, make);

/** The keyboard ISR's flags (trapCtrlAltDel): arrows, Ctrl fires, Esc stops. */
export interface SlyInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  stop: boolean;
}

export class Sly {
  readonly a: AniVga;
  /** StartSound / StopSound since the last step, for audio/sfx.ts (n = the Sounds[] index, SMIX's key). */
  readonly sounds: SoundEvent[] = [];
  /** The energy bars' PutPixel colours, 33 lines each from the bottom (index 1..33). */
  readonly bars = { shield: new Uint8Array(34), energie: new Uint8Array(34) };
  private readonly rng = new TpRandom(0); // Randomize is never called: RandSeed stays 0
  private readonly tempPal = new Uint8Array(768);

  // VAR (and the typed constants the program changes)
  private ScrollingAktiv = true;
  private PanzerLebt = true;
  private Levelend = false;
  private GoOut = false;
  private Stop = false;
  private PLeft = false;
  private PRight = false;
  private PShot = false;
  private Pup = false;
  private PDown = false;
  private PShield = false;
  private index = 0;
  private index2 = 0;
  private index3 = 0;
  private PEnergie = 0;
  private PShieldEnergie = 0;
  private PSAktuelLadePause = 0;
  private PScore = 0;
  private ScrollSpeed = 0;
  private PAnimSpeed = 0;
  private PVLTraegheit = 0;
  private PVRTraegheit = 0;
  private PVDTraegheit = 0;
  private PVUTraegheit = 0;
  private readonly PanzerShot = array<PanzerShotRec>(MaxPanzerShot, () => ({ SpriteNr: 0, FlugArt: 0, Aktiv: false, Art: 0, ShotMoveZaehler: 0, StartX: 0 }));
  private readonly PanzerAnbaudaten = array<AnbauRec>(MaxPanzerAnbauPositionen, () => ({ SpriteNr: 0, ShotPause: 0, AnbauGeladen: false, PositionBesetzt: false, Position: 0, Art: 0, FlugArt: 0 }));
  private readonly Gegner = array<GegnerRec>(MaxAktivGegner, () => ({
    SpriteNr: 0, Art: 0, Aktiv: false, Move: 0, Energie: 0,
    ShotZwischenPause: [0, 0, 0, 0, 0], ShotSalvenPause: [0, 0, 0, 0, 0], ShotSalve: [0, 0, 0, 0, 0], MoveZaehler: 0,
  }));
  private readonly GegnerShot = array<GegnerShotRec>(MaxGegnerShot, () => ({ SpriteNr: 0, FlugArt: 0, Aktiv: false, Art: 0, StartX: 0, StartY: 0, ZielX: 0, ZielY: 0 }));
  private readonly Explosionen = array<ExplosionRec>(MaxExplosionen, () => ({
    SpriteNr: 0, XPos: 0, YPos: 0, Von: 0, Bis: 0, Stand: 0, Pause: 0, Verzoegerung: 0, BodenLuft: false, Aktiv: false, Zittern: false,
  }));

  constructor(private readonly data: SlyData, private readonly voiceCount: () => number) {
    this.a = new AniVga(data);
  }

  /** The keyboard ISR: make codes set the flags, break codes clear them; Esc has no break handling. */
  input(i: SlyInput): void {
    this.PLeft = i.left;
    this.PRight = i.right;
    this.Pup = i.up;
    this.PDown = i.down;
    this.PShot = i.fire;
    if (i.stop) this.Stop = true;
  }

  get score(): number {
    return this.PScore;
  }

  private startSound(n: number, loop: boolean): void {
    this.sounds.push({ n, loop });
  }

  private stopSound(n: number): void {
    this.sounds.push({ n, stop: true });
  }

  private InitExplosionen(XPos: number, YPos: number, Von: number, Bis: number, BodenLuft: boolean, Verzoegerung: number, Zittern: boolean): void {
    this.GoOut = false;
    for (let Exindex = 1; Exindex <= MaxExplosionen; Exindex++) {
      const e = this.Explosionen[Exindex];
      if (!e.Aktiv && !this.GoOut) {
        this.GoOut = true;
        if (Zittern) e.Zittern = true;
        e.XPos = XPos;
        e.YPos = YPos;
        e.Von = Von;
        e.Bis = Bis;
        e.Stand = Von;
        e.SpriteNr = BodenLuft ? LuftExSpritesBegin + Exindex : BodenExSpritesBegin + Exindex;
        e.Aktiv = true;
        e.Pause = 1;
        e.Verzoegerung = Verzoegerung;
      }
    }
  }

  private ExplDarstellung(): void {
    const a = this.a;
    for (let i = 1; i <= MaxExplosionen; i++) {
      const e = this.Explosionen[i];
      e.Verzoegerung = i16(e.Verzoegerung - 1);
      if (!e.Aktiv) continue;
      if (e.Pause <= 0 && e.Verzoegerung <= 0) {
        a.n[e.SpriteNr] = e.Stand;
        a.x[e.SpriteNr] = e.XPos;
        a.y[e.SpriteNr] = e.YPos;
        if (e.Stand < e.Bis) e.Stand++;
        else {
          a.n[e.SpriteNr] = 0;
          e.Aktiv = false;
        }
        e.Pause = 1;
      } else e.Pause--;
    }
  }

  private PScoreUp(Wieviel: number): void {
    this.PScore = i16(this.PScore + Wieviel);
    this.a.makeTextSprite('$' + this.PScore, PPunkteLadeNr);
  }

  private PEnergieAnzeige(Schaden: number): void {
    const a = this.a;
    if (Schaden > 0) this.startSound(7, false);
    if (this.PanzerLebt) this.PSAktuelLadePause = i16(this.PSAktuelLadePause - 1);
    if (this.PSAktuelLadePause <= 0 && this.PShieldEnergie < PShieldMax) {
      this.PShieldEnergie++;
      this.PSAktuelLadePause = PShieldLadePause;
    }
    this.PShieldEnergie = i16(this.PShieldEnergie - Schaden);
    this.PShield = this.PShieldEnergie > 5;
    // EnerY := StartVirtualY + 79; per line dec(EnerY), PutPixel(EnerX + 1..3, EnerY - i1): screen y 79 - 2 * i1
    const bar = (out: Uint8Array, value: number, Staerke: number) => {
      let Farbe = 93, FarbZaehler = 3;
      for (let i1 = 1; i1 <= 33; i1++) {
        FarbZaehler--;
        if (value < i1 * Staerke) Farbe = 0;
        out[i1] = Farbe;
        if (FarbZaehler <= 0) {
          Farbe++;
          FarbZaehler = 3;
        }
      }
    };
    if (this.PShieldEnergie < 0) this.PShieldEnergie = 0;
    bar(this.bars.shield, this.PShieldEnergie, PShieldMax / 33);
    if (!this.PShield) this.PEnergie = i16(this.PEnergie - Schaden);
    bar(this.bars.energie, this.PEnergie, PEnergieMax / 33);
    if (this.PEnergie <= 0 && this.PanzerLebt) {
      for (let i1 = 1; i1 <= 40; i1++) {
        // Pascal evaluates the arguments left to right: the x offset draws first
        const x = a.x[PanzerSpriteNr] - 10 + this.rng.next(30);
        const y = a.y[PanzerSpriteNr] - 10 + this.rng.next(30);
        this.InitExplosionen(x, y, LExplosion1, 22, true, this.rng.next(10) + 10, true);
        this.startSound(1, false);
      }
      this.PanzerLebt = false;
      a.n[PanzerSpriteNr] = 0;
      a.n[PanzerSchattenSprite] = 0;
    }
  }

  private InitSprites(): void {
    const a = this.a;
    a.loadSprite(JetA, LJetA);
    a.loadSprite(JetB, LJetB);
    a.loadSprite(MissileA, LMissileA);
    a.loadSprite(MissileB, LMissileB);
    a.loadSprite(Shot1, LShot1);
    a.loadSprite(Shot2, LShot2);
    a.loadSprite(Gegner1, LGegner1);
    a.loadSprite(Gegner2, LGegner2);
    a.loadSprite(Explosion1, LExplosion1);
    a.loadSprite(Explosion2, LExplosion2);
    a.loadSprite(EnergieBalken, LEnergieBalken);
    a.loadSprite(Gegner3, LGegner3);
    a.loadSprite(Shot3, LShot3);
    // Schatten
    a.loadSprite(Gegner1, LGegner1 + SchattenLadeBeginNr);
    a.setShadow(LGegner1 + SchattenLadeBeginNr);
    a.loadSprite(JetA, LJetA + SchattenLadeBeginNr);
    a.setShadow(LJetA + SchattenLadeBeginNr);
    a.loadSprite(Gegner2, LGegner2 + SchattenLadeBeginNr);
    a.setShadow(LGegner2 + SchattenLadeBeginNr);
    a.loadSprite(Gegner3, LGegner3 + SchattenLadeBeginNr);
    for (let i = 1; i <= 4; i++) a.setShadow(LGegner3 + SchattenLadeBeginNr + i - 1);
    // SetShadowTab(brightness): the table is exported with the palette
    a.n[PanzerSpriteNr] = LJetA;
    a.x[PanzerSpriteNr] = 100;
    a.y[PanzerSpriteNr] = 140;
    a.n[PanzerSchattenSprite] = SchattenLadeBeginNr + LJetA;
  }

  private MoveShot(): void {
    const a = this.a;
    const Radius = 30, PMitteX = 11, PMitteY = 13;
    for (this.index = 1; this.index <= MaxPanzerShot; this.index++) {
      const s = this.PanzerShot[this.index];
      if (!s.Aktiv) continue;
      const nr = s.SpriteNr;
      const OldY = a.y[nr];
      switch (s.FlugArt) {
        case 0:
          s.ShotMoveZaehler++;
          a.y[nr]--;
          if (s.ShotMoveZaehler >= 3) {
            s.Aktiv = false;
            a.n[nr] = 0;
          }
          break;
        case 1:
          a.y[nr] -= ShotSpeed[s.Art];
          break;
        case 2:
          a.y[nr] -= ShotSpeed[s.Art];
          a.x[nr]++;
          break;
        case 3:
          a.y[nr] -= ShotSpeed[s.Art];
          a.x[nr]--;
          break;
        case 4: // Move rechts pause oben
        case 5: // Move links pause oben
          s.ShotMoveZaehler++;
          if (s.ShotMoveZaehler >= 1 && s.ShotMoveZaehler <= 12) {
            a.x[nr] += s.FlugArt === 4 ? 1 : -1;
            a.y[nr]--;
          } else if (s.ShotMoveZaehler >= 15 && s.ShotMoveZaehler <= 29) a.y[nr] -= 6;
          if (s.ShotMoveZaehler >= 29) s.ShotMoveZaehler = 15;
          break;
        case 6:
          a.y[nr] -= 3;
          a.x[nr] = round(sin(((2 * Pi * OldY) / 320) * 2) * 50 + s.StartX);
          break;
        case 7: { // Kreisschuss
          s.ShotMoveZaehler++;
          const winkel = ((s.ShotMoveZaehler * 2 * Pi) / 360) * ShotSpeed[s.Art] * 3;
          a.x[nr] = a.x[PanzerSpriteNr] + PMitteX + round(Radius * sin(winkel + Pi / 2));
          a.y[nr] = a.y[PanzerSpriteNr] + PMitteY - round(Radius * sin(winkel));
          break;
        }
      }
      if ((a.y[nr] < a.startVirtualY - 10 || a.x[nr] > 320 || a.x[nr] < 1 || a.y[nr] > a.startVirtualY + 200) && s.FlugArt !== 0) {
        s.Aktiv = false;
        a.n[nr] = 0;
      }
    }
    // Gegnershot
    for (this.index = 1; this.index <= MaxGegnerShot; this.index++) {
      const s = this.GegnerShot[this.index];
      if (!s.Aktiv) continue;
      const nr = s.SpriteNr;
      const speed = GShotSpeed[s.Art];
      switch (s.FlugArt) {
        case 1:
          a.y[nr] += speed;
          break;
        case 2:
          a.y[nr] -= speed;
          break;
        case 3:
          a.y[nr] += speed;
          a.x[nr] += speed;
          break;
        case 4:
          a.y[nr] += speed;
          a.x[nr] -= speed;
          break;
        case 5: // Zielgerichtet
        case 6: // Zielverfolgend
          if (s.FlugArt === 6) {
            s.ZielX = a.x[PanzerSpriteNr] + 10;
            s.ZielY = a.y[PanzerSpriteNr] + 0;
          }
          // Integer * Integer is a 16-bit product in TP; the division is Real. Ziel = Start divides 0 by 0
          // (runtime error 200 in the original, I); here the shot then stays on its start line.
          if (Math.abs(s.ZielX - s.StartX) <= Math.abs(s.ZielY - s.StartY)) {
            if (s.StartY <= s.ZielY) a.y[nr] += speed;
            else a.y[nr] -= speed;
            const q = i16((s.ZielX - s.StartX) * Math.abs(a.y[nr] - s.StartY)) / Math.abs(s.ZielY - s.StartY);
            a.x[nr] = s.StartX + (Number.isFinite(q) ? round(q) : 0);
          } else {
            if (s.StartX <= s.ZielX) a.x[nr] += speed;
            else a.x[nr] -= speed;
            const q = i16((s.ZielY - s.StartY) * Math.abs(a.x[nr] - s.StartX)) / Math.abs(s.ZielX - s.StartX);
            a.y[nr] = s.StartY + (Number.isFinite(q) ? round(q) : 0);
          }
          break;
      }
      if (a.y[nr] > a.startVirtualY + 200 || a.y[nr] < a.startVirtualY || a.x[nr] > 320 || a.x[nr] < 1) {
        s.Aktiv = false;
        a.n[nr] = 0;
      }
    }
  }

  private PanzerSchattenMove(): void {
    const a = this.a;
    a.x[PanzerSchattenSprite] = a.x[PanzerSpriteNr] + 7;
    a.y[PanzerSchattenSprite] = a.y[PanzerSpriteNr] + 5;
    // Laser: every flight-0 shot follows the last fitted mount
    for (this.index = 1; this.index <= MaxPanzerShot; this.index++) {
      const s = this.PanzerShot[this.index];
      if (s.FlugArt !== 0 || !s.Aktiv) continue;
      for (this.index2 = 1; this.index2 <= MaxPanzerAnbauPositionen; this.index2++) {
        const m = this.PanzerAnbaudaten[this.index2];
        if (!m.PositionBesetzt) continue;
        a.x[s.SpriteNr] = a.x[PanzerSpriteNr] + PanzerAnbauXPos[m.Position] + ShotXPos[m.Art];
        a.y[s.SpriteNr] = a.y[PanzerSpriteNr] + PanzerAnbauYPos[m.Position] + ShotYPos[m.Art];
      }
    }
  }

  private Zusatzanbau(wo: number, welcher: number, Flugart: number): void {
    this.GoOut = false;
    for (this.index = 1; this.index <= MaxPanzerAnbauPositionen; this.index++) {
      const m = this.PanzerAnbaudaten[this.index];
      if (!m.PositionBesetzt && !this.GoOut) {
        this.GoOut = true;
        m.SpriteNr = this.index + PanzerAnbauSpriteBegin;
        m.PositionBesetzt = true;
        m.Art = welcher;
        m.ShotPause = ShotPause[m.Art];
        m.Position = wo;
        m.FlugArt = Flugart;
      }
    }
  }

  private *GegnerAktivierung(): Generator<number, void, void> {
    const a = this.a;
    for (this.index = 1; this.index <= MaxAnzahlGegner; this.index++) {
      if (AktivierungY[this.index] !== a.startVirtualY) continue;
      this.GoOut = false;
      for (this.index2 = 1; this.index2 <= MaxAktivGegner; this.index2++) {
        const g = this.Gegner[this.index2];
        if (g.Aktiv || this.GoOut) continue;
        if (AktivierungArt[this.index] === 2) { // boss vorbereiten
          this.ScrollingAktiv = false;
          this.stopSound(10);
          this.startSound(39, false);
          this.startSound(39, false);
          this.startSound(39, false);
          yield* a.fadeToPalette(new Uint8Array(768), 200);
        }
        g.Aktiv = true;
        g.SpriteNr = this.index2 + GegnerSpritesBegin;
        g.Art = AktivierungArt[this.index];
        g.Move = AktivierungMove[this.index];
        g.Energie = GEnergie[g.Art];
        for (this.index3 = 1; this.index3 <= MaxAktivGegnerShots; this.index3++) {
          g.ShotZwischenPause[this.index3] = GShotZwischenPause[g.Art][this.index3];
          g.ShotSalvenPause[this.index3] = GShotSalvenPause[g.Art][this.index3];
          g.ShotSalve[this.index3] = 0;
        }
        g.MoveZaehler = 1;
        a.n[g.SpriteNr] = GLadeNummer[g.Art];
        a.x[g.SpriteNr] = AktivierungX[this.index];
        a.y[g.SpriteNr] = a.startVirtualY - 20;
        a.n[g.SpriteNr + LGSSpritesBegin] = SchattenLadeBeginNr + GLadeNummer[g.Art];
        a.x[g.SpriteNr + LGSSpritesBegin] = AktivierungX[this.index] + SchattenX[g.Art];
        a.y[g.SpriteNr + LGSSpritesBegin] = a.startVirtualY - 20 + SchattenY[g.Art];
        this.GoOut = true;
        if (AktivierungArt[this.index] === 2) { // boss initialisieren
          yield 800; // Delay(800)
          this.startSound(10, true); // jet gedröhne
          this.startSound(10, true);
          a.y[g.SpriteNr] = a.startVirtualY + 5;
          a.y[g.SpriteNr + LGSSpritesBegin] = a.y[g.SpriteNr] + SchattenY[g.Art];
          a.y[PanzerSpriteNr] = a.startVirtualY + 160;
          a.x[PanzerSchattenSprite] = a.x[PanzerSpriteNr] + 7;
          a.y[PanzerSchattenSprite] = a.y[PanzerSpriteNr] + 5;
          a.animate();
          yield* a.fadeToPalette(this.tempPal, 200);
        }
      }
    }
    this.GoOut = false;
  }

  private MoveGegnerSchatten(): void {
    const a = this.a;
    for (let i = 1; i <= MaxAktivGegner; i++) {
      const g = this.Gegner[i];
      if (!g.Aktiv) continue;
      a.x[g.SpriteNr + LGSSpritesBegin] = a.x[g.SpriteNr] + SchattenX[g.Art];
      a.y[g.SpriteNr + LGSSpritesBegin] = a.y[g.SpriteNr] + SchattenY[g.Art];
    }
  }

  private MoveGegner(): void {
    const a = this.a;
    const between = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
    for (this.index = 1; this.index <= MaxAktivGegner; this.index++) {
      const g = this.Gegner[this.index];
      if (!g.Aktiv) continue;
      const nr = g.SpriteNr;
      const OldY = a.y[nr];
      switch (g.Move) {
        case 1:
          a.y[nr] += 2;
          break;
        case 2:
          g.MoveZaehler = i16(g.MoveZaehler + 1);
          // the Pascal case lists 1..20 and 20..40: 20 takes the first branch (I)
          if (between(g.MoveZaehler, 1, 20)) {
            a.x[nr] += 2;
            a.y[nr] += 1;
          } else if (between(g.MoveZaehler, 20, 40)) {
            a.x[nr] -= 2;
            a.y[nr] += 1;
          } else if (between(g.MoveZaehler, 40, 100)) a.y[nr] += 2;
          else if (between(g.MoveZaehler, 200, 300)) a.y[nr] += 2;
          break;
        case 3:
          g.MoveZaehler = i16(g.MoveZaehler + 1);
          if (between(g.MoveZaehler, 1, 90)) a.y[nr] += 2;
          else if (between(g.MoveZaehler, 100, 150)) a.y[nr] -= 2;
          else if (between(g.MoveZaehler, 160, 300)) a.y[nr] += 2;
          break;
        case 4:
          g.MoveZaehler++;
          if (between(g.MoveZaehler, 1, 20)) a.y[nr] += 1;
          else if (between(g.MoveZaehler, 30, 80)) a.x[nr] += 1;
          else if (between(g.MoveZaehler, 100, 200)) a.x[nr] -= 1;
          else if (between(g.MoveZaehler, 220, 270)) a.x[nr] += 1;
          if (g.MoveZaehler % 100 === 0) {
            const p = this.rng.next(5);
            this.startSound(34 + p, false); // MOOMOO, MERVEUX, TOETEN, KUCHEN, LACHEN2
          }
          if (g.MoveZaehler > 270) g.MoveZaehler = 21;
          break;
        case 5:
          g.MoveZaehler = i16(g.MoveZaehler + 1);
          if (between(g.MoveZaehler, 1, 20)) a.y[nr] += 2;
          break;
        case 6:
          a.y[nr] += 2;
          a.x[nr] = round(sin(((2 * Pi * OldY) / 320) * 8) * 40 + 160);
          break;
      }
      // Loeschen des Gegners wenn unten angekommen
      if (a.y[nr] >= a.startVirtualY + 200) {
        a.n[nr + LGSSpritesBegin] = 0;
        a.n[nr] = 0;
        g.Aktiv = false;
      }
    }
  }

  private Kolision(): void {
    const a = this.a;
    if (!this.PanzerLebt) return;
    // Panzerschüsse mit Gegnern
    for (this.index = 1; this.index <= MaxPanzerShot; this.index++) {
      for (this.index2 = 1; this.index2 <= MaxAktivGegner; this.index2++) {
        const s = this.PanzerShot[this.index], g = this.Gegner[this.index2];
        if (!s.Aktiv || !g.Aktiv || !a.hitDetect(s.SpriteNr, g.SpriteNr)) continue;
        g.Energie = i16(g.Energie - ShotPower[s.Art]);
        this.InitExplosionen(a.x[s.SpriteNr], a.y[s.SpriteNr], LExplosion1, 15, true, 0, false);
        if (g.Energie <= 0) {
          for (let k = 0; k < 5; k++) this.startSound(1, false);
          this.PScoreUp(GScoreUp[g.Art]);
          if (g.Art === 2) { // für Bosse
            for (let EXi1 = 1; EXi1 <= 20; EXi1++) {
              for (let EXi2 = 1; EXi2 <= 5; EXi2++) {
                this.InitExplosionen(a.x[g.SpriteNr] + EXi2 * 10, a.y[g.SpriteNr] + EXi1 * 10, LExplosion1, 22, true, this.rng.next(20) + 10, true);
              }
            }
            this.startSound(38, false);
            this.Levelend = true;
          } else {
            this.InitExplosionen(a.x[g.SpriteNr], a.y[g.SpriteNr], LExplosion2, 22, true, 0, false);
          }
          a.n[g.SpriteNr + LGSSpritesBegin] = 0; // schatten
          a.n[g.SpriteNr] = 0;
          g.Aktiv = false;
        }
        a.n[s.SpriteNr] = 0;
        s.Aktiv = false;
      }
    }
    // Gegnerschüsse mit Panzer
    for (this.index = 1; this.index <= MaxGegnerShot; this.index++) {
      const s = this.GegnerShot[this.index];
      if (!s.Aktiv || !a.hitDetect(s.SpriteNr, PanzerSpriteNr)) continue;
      this.PEnergieAnzeige(GShotPower[s.Art]);
      this.InitExplosionen(a.x[s.SpriteNr], a.y[s.SpriteNr], LExplosion1, 15, true, 0, false);
      for (let k = 0; k < 3; k++) this.startSound(6, false);
      a.n[s.SpriteNr] = 0;
      s.Aktiv = false;
    }
    // Gegner mit Panzer
    for (this.index = 1; this.index <= MaxAktivGegner; this.index++) {
      const g = this.Gegner[this.index];
      if (!g.Aktiv || !a.hitDetect(g.SpriteNr, PanzerSpriteNr)) continue;
      this.PEnergieAnzeige(GKolisionPower[g.Art]);
      g.Energie = i16(g.Energie - PKolosSchaden);
      if (g.Energie <= 0) {
        this.InitExplosionen(a.x[g.SpriteNr], a.y[g.SpriteNr], LExplosion2, 22, true, 0, false);
        a.n[g.SpriteNr + LGSSpritesBegin] = 0; // schatten
        a.n[g.SpriteNr] = 0;
        g.Aktiv = false;
      }
      for (let k = 0; k < 5; k++) this.startSound(6, false);
    }
  }

  /** LevelLaden + InitLevel: the tile grid is SlyData.level; the screen starts at the level's bottom. */
  private InitLevel(): void {
    this.a.startVirtualX = NullpunktX;
    this.a.startVirtualY = NullpunktY;
  }

  private WaffenNachLadung(): void {
    const a = this.a;
    // lade Pause vom Panzer verringern
    if (this.PanzerLebt) {
      for (this.index = 1; this.index <= MaxPanzerAnbauPositionen; this.index++) {
        const m = this.PanzerAnbaudaten[this.index];
        if (!m.PositionBesetzt) continue;
        if (!m.AnbauGeladen) m.ShotPause--;
        if (m.ShotPause <= 0) {
          m.AnbauGeladen = true;
          m.ShotPause = ShotPause[m.Art];
        }
      }
    }
    // lade Pause von Gegnern verringern und abschuss
    for (this.index = 1; this.index <= MaxAktivGegner; this.index++) {
      const g = this.Gegner[this.index];
      if (!g.Aktiv) continue;
      for (this.index3 = 1; this.index3 <= MaxAktivGegnerShots; this.index3++) {
        const k = this.index3;
        const art = GShotArt[g.Art][k];
        if (art <= 0) continue;
        if (g.ShotSalve[k] <= 0) {
          g.ShotSalvenPause[k]--;
          if (g.ShotSalvenPause[k] <= 0) g.ShotSalve[k] = GShotSalve[g.Art][k];
        }
        if (g.ShotSalvenPause[k] > 0) continue;
        g.ShotZwischenPause[k]--;
        if (g.ShotZwischenPause[k] > 0) continue;
        g.ShotZwischenPause[k] = GShotZwischenPause[g.Art][k];
        g.ShotSalve[k]--;
        if (g.ShotSalve[k] <= 0) g.ShotSalvenPause[k] = GShotSalvenPause[g.Art][k];
        this.GoOut = false;
        for (this.index2 = 1; this.index2 <= MaxGegnerShot; this.index2++) {
          const s = this.GegnerShot[this.index2];
          if (s.Aktiv || this.GoOut) continue;
          this.startSound(GShotSound[art], false);
          s.Aktiv = true;
          s.SpriteNr = this.index2 + GegnerShotSpritesBegin;
          s.FlugArt = GShotFlugart[g.Art][k];
          s.Art = art;
          a.n[s.SpriteNr] = GShotLadeNummer[art];
          s.StartX = a.x[g.SpriteNr] + GShotXPos[g.Art][k];
          s.StartY = a.y[g.SpriteNr] + GShotYPos[g.Art][k];
          s.ZielX = a.x[PanzerSpriteNr] + 10;
          s.ZielY = a.y[PanzerSpriteNr] + 0;
          a.x[s.SpriteNr] = a.x[g.SpriteNr] + GShotXPos[g.Art][k];
          a.y[s.SpriteNr] = a.y[g.SpriteNr] + GShotYPos[g.Art][k];
          this.GoOut = true;
        }
      }
    }
  }

  private PanzerAktionen(): void {
    const a = this.a;
    const P = PanzerSpriteNr;
    // animation
    this.PAnimSpeed--;
    if (this.PAnimSpeed <= 0) {
      this.PAnimSpeed = 2;
      a.n[P] = a.n[P] === LJetA ? LJetB : LJetA;
    }
    // Shot (GoOut is whatever the procedures before left it: true after an explosion or an enemy shot this frame,
    // so the first fitted mount then waits a frame)
    if (this.PShot) {
      for (this.index = 1; this.index <= MaxPanzerAnbauPositionen; this.index++) {
        const m = this.PanzerAnbaudaten[this.index];
        if (!m.PositionBesetzt) continue;
        if (m.AnbauGeladen) {
          for (this.index2 = 1; this.index2 <= MaxPanzerShot; this.index2++) {
            const s = this.PanzerShot[this.index2];
            if (s.Aktiv || this.GoOut) continue;
            this.startSound(ShotSoundNr[m.Art], false);
            this.GoOut = true;
            s.Aktiv = true;
            s.SpriteNr = this.index2 + PanzerShotSpritesBegin;
            s.FlugArt = m.FlugArt;
            s.ShotMoveZaehler = 0;
            s.Art = m.Art;
            a.n[s.SpriteNr] = ShotLadeNummer[m.Art];
            a.x[s.SpriteNr] = a.x[P] + PanzerAnbauXPos[m.Position] + ShotXPos[m.Art];
            a.y[s.SpriteNr] = a.y[P] + PanzerAnbauYPos[m.Position] + ShotYPos[m.Art];
            s.StartX = a.x[s.SpriteNr];
            m.AnbauGeladen = false;
          }
        }
        this.GoOut = false;
      }
    }
    // Move
    if (this.PLeft && a.x[P] >= 12) {
      a.x[P] -= ShipSpeed;
      this.PVLTraegheit = PTraegHeit;
    }
    if (this.PRight && a.x[P] <= 280) {
      a.x[P] += ShipSpeed;
      this.PVRTraegheit = PTraegHeit;
    }
    if (this.PDown && a.y[P] <= a.startVirtualY + 168) {
      a.y[P] += ShipSpeed;
      this.PVDTraegheit = PTraegHeit;
    }
    if (this.Pup && a.y[P] >= a.startVirtualY + 10) {
      a.y[P] -= ShipSpeed;
      this.PVUTraegheit = PTraegHeit;
    }
    // Traegheits Move
    if (!this.PLeft && this.PVLTraegheit >= 1 && a.x[P] >= 12) {
      this.PVLTraegheit--;
      a.x[P] -= Math.min(this.PVLTraegheit, ShipSpeed);
    }
    if (!this.PRight && this.PVRTraegheit >= 1 && a.x[P] <= 280) {
      this.PVRTraegheit--;
      a.x[P] += Math.min(this.PVRTraegheit, ShipSpeed);
    }
    if (!this.PDown && this.PVDTraegheit >= 1 && a.y[P] <= a.startVirtualY + 168) {
      this.PVDTraegheit--;
      a.y[P] += Math.min(this.PVDTraegheit, ShipSpeed);
    }
    if (!this.Pup && this.PVUTraegheit >= 1 && a.y[P] >= a.startVirtualY + 10) {
      this.PVUTraegheit--;
      a.y[P] -= Math.min(this.PVUTraegheit, ShipSpeed);
    }
    this.PanzerSchattenMove();
  }

  /** The main program, from InitGraph to the end (Abbruch after the boss, or Esc). */
  *run(): Generator<number, void, void> {
    const a = this.a;
    a.setPalette(this.data.palette.rgb); // loadpalette('Raum.pal'); SetPalette(TempPal, TRUE)
    this.tempPal.set(a.palette);
    // SetAnimateWindow(8, 1, 312, 199): view.ts
    a.loadSprite('Icon3.cod', 1); // not on the CD; JetB2 takes number 1 below
    a.startVirtualX = NullpunktX;
    a.startVirtualY = NullpunktY;
    // LoadTile(TileName, 1), LevelLaden (Levelname): SlyData
    void TileName;
    void Levelname;
    this.InitLevel();
    this.InitSprites();
    void FontName; // LoadFont: SlyData.font
    a.n[PPunkteSpriteNr] = PPunkteLadeNr;
    a.x[PPunkteSpriteNr] = 30;
    a.y[PPunkteSpriteNr] = 10;
    this.PScoreUp(0);
    // SetSplitIndex(8): view.ts
    a.n[EnergieBalkenSpriteR] = LEnergieBalken;
    a.x[EnergieBalkenSpriteR] = 0;
    a.y[EnergieBalkenSpriteR] = 1;
    a.n[EnergieBalkenSpriteL] = LEnergieBalken;
    a.x[EnergieBalkenSpriteL] = 311;
    a.y[EnergieBalkenSpriteL] = 1;
    this.PEnergie = PEnergieMax;
    this.PShieldEnergie = PShieldMax;
    // FXInit('RAUM28.SND', 40): audio/sfx.ts with game/public/sly/sounds.*
    for (let i = 1; i <= MaxPanzerAnbauPositionen; i++) {
      this.PanzerAnbaudaten[i].PositionBesetzt = false;
      this.PanzerAnbaudaten[i].AnbauGeladen = true;
    }
    for (let i = 1; i <= MaxAktivGegner; i++) this.Gegner[i].Aktiv = false;
    for (let i = 1; i <= MaxExplosionen; i++) this.Explosionen[i].Aktiv = false;
    this.Zusatzanbau(1, 1, 5);
    this.Zusatzanbau(2, 1, 4);
    this.Zusatzanbau(3, 2, 6);
    this.Zusatzanbau(4, 3, 0);
    this.startSound(10, true); // jet gedröhne
    this.startSound(10, true);
    this.ScrollingAktiv = true;
    this.GoOut = false;
    a.setSpriteCycle(LGegner3, 4);
    a.setSpriteCycle(LGegner3 + SchattenLadeBeginNr, 4);
    do {
      if (this.ScrollingAktiv) yield* this.GegnerAktivierung();
      this.MoveGegner();
      this.MoveGegnerSchatten();
      this.Kolision();
      this.MoveShot();
      this.WaffenNachLadung();
      this.PEnergieAnzeige(0);
      this.ExplDarstellung();
      if (this.PanzerLebt) this.PanzerAktionen();
      if (this.ScrollingAktiv) {
        if (this.PanzerLebt) a.y[PanzerSpriteNr]--;
        this.ScrollSpeed--;
        if (this.ScrollSpeed <= 0) {
          a.startVirtualY--;
          for (let i = 1; i <= MaxAktivGegner; i++) if (this.Gegner[i].Aktiv) a.y[this.Gegner[i].SpriteNr]--;
          a.y[EnergieBalkenSpriteR]--; // energieanzeigen
          a.y[EnergieBalkenSpriteL]--;
          a.y[PPunkteSpriteNr]--;
          this.ScrollSpeed = 1;
        }
      }
      if (this.Levelend) {
        this.PanzerLebt = false;
        if (a.x[PanzerSpriteNr] > 152) a.x[PanzerSpriteNr] -= 3;
        if (a.x[PanzerSpriteNr] < 148) a.x[PanzerSpriteNr] += 3;
        a.y[PanzerSpriteNr] -= 3;
        this.PanzerSchattenMove();
        if (a.y[PanzerSpriteNr] <= a.startVirtualY - 30) {
          this.stopSound(10);
          yield* a.fadeToPalette(new Uint8Array(768), 200);
          // Repeat Until VoiceCount = 0 (LACHEN2 takes 8 s); the remake gives up after END_WAIT_MS
          for (let t = 0; this.voiceCount() > 0 && t < END_WAIT_MS; t += RETRACE_MS) yield RETRACE_MS;
          return; // Abbruch: Halt
        }
      }
      a.animate(); // delay(10); animate
      yield FRAME_MS;
    } while (!this.Stop);
    yield* a.fadeToPalette(new Uint8Array(768), 10);
  }
}
