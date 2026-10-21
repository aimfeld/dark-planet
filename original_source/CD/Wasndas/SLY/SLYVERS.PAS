{$A+,B-,D+,L+,N-,E-,O-,R-,S-,V-,G-,F-,I-,X+}

{Damit es Compiliert, muss man oben X+ setzen,(FÅr Anivga gilt eigentlich X-)}

{$M 16384,0,655360}
PROGRAM Example4;
{16384}
{PROCEDURE Kolosion(X1,Y1,B1,H1,X2,Y2,B2,H2:Integer);
BEGIN
IF (X1+B1>X2)AND(X2+B2>X1)AND(Y1+B1>Y2)AND(Y2+B2>Y1)THEN
  Kolos:=true;
END;}
{Demonstrates use of sprite cycles & SetCycleTime() to control animation speed}
{Besides that, usage of a sprite library is shown}

USES ANIVGA,CRT,DOS,SMix,Detect,MOUSE2;
CONST
      brightness:BYTE=50;
      NullpunktX=0;            {Virtuell!!!!}
      NullpunktY=0;            {Virtuell!!!!}
      LoadHantel=1;
      FontName='Fire.FNT';{sanserif,Modernfo}       {Name of the (multicolored) font}
      {SpriteName='sprites7.lib'; {Path and name of the sprite to load}
      {TileName={'Aegypten.COD'}{'lava2.cod';}
      Levelname='Level2.lev';
      TileName='Back1-14.lib';
      {*****SPRITES*****}
      JetA='JetB2.cod';LJetA=1;
      JetB='JetB3.cod';LJetB=2;
      MissileA='Mis1A.cod';LMissileA=3;
      MissileB='Mis1B.cod';LMissileB=4;
      Shot1='S10.cod';LShot1=5;
      Shot2='s11.cod';LShot2=6;
      Gegner1='Ufo!.cod';LGegner1=7;
      Gegner2={'Geg1A.cod'}'Sly_16e.cod';LGegner2=8;
      Explosion1='Expl1-7B.lib';LExplosion1=9;{-15}
      Explosion2='Ex2A-F.lib';LExplosion2=16;{-21}
      EnergieBalken='Icon5!.cod';LEnergieBalken=22;
      Gegner3='Ufo.lib';LGegner3=23;
      Shot3='Laser2.cod';LShot3=28;
      {*****************}
      ScrollingAktiv:Boolean=True;
      PanzerLebt:Boolean=True;
      PTraegHeit:Integer=6;
      ch:Char=#0;
      Levelend:Boolean=False;
      {brightness:BYTE=80;}
      {FX}
      XMSRequired   = 1000;    {XMS memory required to load the sounds (KBytes) }
      SharedEMB     = true;
      {TRUE:   All sounds will be stored in a shared EMB}
      {FALSE:  Each sound will be stored in a separate EMB}
      NumSounds = 64;
      MomentNumSounds:Byte=40;
      PPunkteLadeNr=70;
      PPunkteSpriteNr=5;
      PEnergieMax=165;{vielfaches von 33!!!!}
      PShieldMax=660;{vielfaches von 33!!!!}
      PKolosSchaden=70;
      SchattenLadeBeginNr=40;{von sprite datei}
      PShieldLadePause=10;
      PanzerSpriteNr=101;
      PanzerLadeNr=31;
      EnergieBalkenSpriteR=8;
      EnergieBalkenSpriteL=7;
      EnergieBalkenLadeNr=10;
      PanzerAnbauSpriteBegin=91;
      PanzerSchattenSprite=171;
      PanzerShotSpritesBegin=102;
      ShipShotSpritesBegin=200;
      GegnerShotSpritesBegin=31;
      GegnerSpritesBegin=181;
      BodenExSpritesBegin=211;
      LuftExSpritesBegin=11;
      LGSSpritesBegin=231;
      MaxExplosionen=38;
      {constante Werte fÅr ZusÑtze}
      {**********************************}
      MaxPanzerAnbauPositionen=8;{wieviel Positionen zum anbauen fÅr Array}
      MaxShipAnbauPositionen=8;{wieviel Positionen zum anbauen fÅr Array}
      MaxZusaetze=3;{vieviele Verschiedene Waffen}
      MaxPanzerShot=48;
      PanzerOderShip:Array[1..MaxZusaetze] of Integer={0=Panzer,1=Ship}
      (0,0,0);
      ShotPower:Array[1..MaxZusaetze] of Integer=
      (80,15,50);
      ShotPause:Array[1..MaxZusaetze] of Integer=
      (15,10,10);
      {ZusaetzeLadeNummer:Array[1..MaxZusaetze] of Integer=
      (2,2);}
      ShotLadeNummer:Array[1..MaxZusaetze] of Integer=
      (LMissileA,LShot1,LShot3);
      ShotXPos:Array[1..MaxZusaetze] of Integer=
      (0,0,0);
      ShotYPos:Array[1..MaxZusaetze] of Integer=
      (0,0,-199);
      ShotSpeed:Array[1..MaxZusaetze] of Integer=
      (5,6,0);
      ShotFlugart:Array[1..MaxZusaetze] of Integer=
      (4,1,0);
      ShotSoundNr:Array[1..MaxZusaetze] of Integer=
      (20,33,33);
      PanzerAnbauXPos:Array[1..MaxPanzerAnbauPositionen] of Integer=
      (-5,+27,+4,+16,-11,+43,-22,0);
      PanzerAnbauYPos:Array[1..MaxPanzerAnbauPositionen] of Integer=
      (+23,+23,+10,+10,+5,+7,+7,0);
      ShipAnbauXPos:Array[1..MaxShipAnbauPositionen] of Integer=
      (+12,0,0,+32,-11,+43,-22,0);
      ShipAnbauYPos:Array[1..MaxShipAnbauPositionen] of Integer=
      (-6,0,0,+5,+5,+7,+7,0);
      {**********************************}
      {constante Werte fÅr Gegner}
      MaxGegner=3;
      MaxAktivGegner=29;
      MaxAnzahlGegner=10;
      MaxGegnerShot=49;{fÅr array}
      MaxAktivGegnerShots=4;{vieviel ein gegner abschiessen kann(Shots)}
      MaxShots=2;{verschiedene Shots}
      GEnergie:Array[1..MaxGegner] of Integer=
      (100,3000,150);
      GLadeNummer:Array[1..MaxGegner] of Integer=
      (LGegner1,LGegner2,LGegner3);
      GKolisionPower:Array[1..MaxGegner] of Integer=
      (100,200,100);
      GScoreUp:Array[1..MaxGegner] of Integer=
      (100,2000,300);
      SchattenX:Array[1..MaxGegner] of Integer=
      (+6,+6,+10);
      SchattenY:Array[1..MaxGegner] of Integer=
      (+6,+6,+10);
      GShotPower:Array[1..MaxShots] of Integer=
      (20,60);
      GShotSound:Array[1..MaxShots] of Integer=
      (33,33);
      GShotLadeNummer:Array[1..MaxShots] of Integer=
      (LShot1,LShot2);
      GShotArt:Array[1..MaxGegner,1..MaxAktivGegnerShots]of Byte=
      ((0,0,1,1),({2,2,}1,1,1,1),(0,0,0,1));
      GShotXPos:Array[1..MaxGegner,1..MaxAktivGegnerShots] of Integer=
      ((0,0,+15,+1),(+21,+43,+12,+65),(0,0,0,+20));
      GShotYPos:Array[1..MaxGegner,1..MaxAktivGegnerShots] of Integer=
      ((0,0,+20,+20),(+30,+30,+10,+10),(0,0,0,+26));
      GShotZwischenPause:Array[1..MaxGegner,1..MaxAktivGegnerShots] of Integer=
      ((0,0,5,5),({30,30,}5,5,5,5),(0,0,0,3));
      GShotSalvenPause:Array[1..MaxGegner,1..MaxAktivGegnerShots] of Integer=
      ((0,0,40,40),({45,45}30,30,20,20),(0,0,0,20));
      GShotSalve:Array[1..MaxGegner,1..MaxAktivGegnerShots] of Integer=
      ((0,0,5,5),({2,2,}2,2,5,5),(0,0,0,10));
      GShotFlugart:Array[1..MaxGegner,1..MaxAktivGegnerShots] of Integer=
      ((0,0,5,5),(6,6,5,5),(0,0,0,6));
      GShotSpeed:Array[1..MaxShots] of Integer=
      (6,8);
      AktivierungY:Array[1..MaxAnzahlGegner] of Integer={virtual Y}
      (-100,-100,-500,-500,-700,-703,-700,-800,-815,-1100);
      AktivierungX:Array[1..MaxAnzahlGegner] of Integer={virtual Y}
      (30,250,30,270,30,110,110,40,120,110);
      AktivierungArt:Array[1..MaxAnzahlGegner] of Byte={virtual Y}
      (3,1,3,1,1,1,1,1,1,2);
      AktivierungMove:Array[1..MaxAnzahlGegner] of Byte=
      (6,2,6,3,6,2,1,3,2,4);
      {**********************************}
      ShipSpeed=3;
      LevMaxX=10;              {Max X fÅr Levelmap (in Tiles gezÑhlt)}
      LevMaxY=100;            {Max Y fÅr Levelmap (in Tiles gezÑhlt)}
TYPE TAktivierung = RECORD
               Y:Integer;{virtual Y}
               X:Integer;{virtual X}
               Art:Byte;
               Move:Byte;
               END;{Of Record}
VAR
    blackPal,TempPal:Palette;
    Aktivierung:Array[1..MaxAnzahlGegner]Of TAktivierung;
    where,mousecoord:Point;
    PicsLoaded,Tilesloaded,index,index2,index3:BYTE;
    temp,{i,}n:WORD;
    Pause,MoveS:ShortiNT;
    PEnergie,PShieldEnergie,PSAktuelLadePause,PScore,ScrollSpeed,
    PAnimSpeed,PVLTraegheit,PVRTraegheit,PVDTraegheit,PVUTraegheit:Integer;
    {FX}
    BaseIO: word; IRQ, DMA, DMA16: byte;  {FX}
    Sounds: array[0..NumSounds-1] of PSound;
    OldExitProc: pointer;
    GoOut,Pleft,Pright,PShot,Stop,Pup,PDown,PShield:Boolean;
    s:String;
    Nom_1,Err,Path : string[64];
     Cr             : char;
     I,Mode,LastBack,
     X,Y            ,
     CF,Min,Max     : word;
     TDir           : SearchRec;
     {Data           : MiscData;
     Shrink_Ok      : boolean;}
     MomentLevMaxX,MomentLevMaxY:Word;
     LevTilePos:Array[1..LevMaxX,1..LevMaxY]Of Byte;
    SoundRepeat:Array[1..MaxZusaetze]Of Boolean;
    PanzerShot:array[1..MaxPanzerShot] OF RECORD
                                          SpriteNr:Integer;
                                          FlugArt:Byte;
                                          Aktiv:Boolean;
                                          Art:Byte;
                                          ShotMoveZaehler:Integer;
                                          StartX:Integer;
                                          END;
    ShipShot:array[1..100] OF RECORD
                              ShotNr:Integer;
                              FlugArt:Byte;
                              Aktiv:Boolean;
                              ShotSpeed:Integer;
                              END;
    PanzerAnbaudaten:Array[1..MaxPanzerAnbauPositionen] OF RECORD
                                                           SpriteNr:Integer;
                                                           ShotPause:Integer;
                                                           AnbauGeladen:Boolean;
                                                           PositionBesetzt:Boolean;
                                                           Position:Byte;
                                                           Art:Byte;
                                                           FlugArt:Byte;
                                                           END;
    ShipAnbaudaten:Array[1..MaxShipAnbauPositionen] OF RECORD
                                                       ShotPause:Integer;
                                                       AnbauGeladen:Boolean;
                                                       PositionBesetzt:Boolean;
                                                       Art:Byte;
                                                       END;
    Gegner:Array[1..MaxAktivGegner] OF RECORD
                                       SpriteNr:Integer;
                                       Art:Byte;
                                       Aktiv:Boolean;
                                       Move:Byte;
                                       Energie:Integer;
                                       ShotZwischenPause:Array[1..MaxAktivGegnerShots]of Integer;
                                       ShotSalvenPause:Array[1..MaxAktivGegnerShots]of Integer;
                                       ShotSalve:Array[1..MaxAktivGegnerShots]of Integer;
                                       MoveZaehler:Integer;
                                       END;
    GegnerShot:array[1..MaxGegnerShot] OF RECORD
                                          SpriteNr:Integer;
                                          FlugArt:Byte;
                                          Aktiv:Boolean;
                                          Art:Byte;
                                          StartX:Integer;
                                          StartY:Integer;
                                          ZielX:Integer;
                                          ZielY:Integer;
                                          END;
    Explosionen:Array[1..MaxExplosionen] OF RECORD
                                            SpriteNr:Integer;
                                            XPos,YPos:Integer;
                                            Von,Bis:Byte;
                                            Stand:Byte;
                                            Pause,Verzoegerung:Integer;
                                            BodenLuft,Aktiv,Zittern:Boolean;
                                            END;
    OldInt9: procedure;
procedure OurExitProc; far;
   {If the program terminates with a runtime error before the extended memory}
   {is deallocated, then the memory will still be allocated, and will be lost}
   {until the next reboot.  This exit procedure is ALWAYS called upon program}
   {termination and will deallocate extended memory if necessary.            }
    var
      i: byte;
    begin
      for i := 0 to NumSounds-1 do
        if Sounds[i] <> nil then FreeSound(Sounds[i]);
      if SharedEMB then ShutdownSharing;
      ExitProc := OldExitProc; {Chain to next exit procedure}
End;{Of Ourexit}

PROCEDURE InitExplosionen(Xpos,YPos:Integer;Von,Bis:Byte;BodenLuft:Boolean;
                          Verzoegerung:Integer;Zittern:Boolean);
VAR Exindex:Integer;
BEGIN
GoOut:=False;
FOR Exindex:=1 TO MaxExplosionen DO BEGIN
  IF (Explosionen[Exindex].Aktiv=False)AND(GoOut=False)THEN
    BEGIN
    GoOut:=True;
    IF Zittern=true THEN Explosionen[EXindex].Zittern:=True;
    Explosionen[Exindex].XPos:=XPos;
    Explosionen[Exindex].YPos:=YPos;
    Explosionen[Exindex].Von:=Von;
    Explosionen[Exindex].Bis:=Bis;
    Explosionen[Exindex].Stand:=Von;
    IF BodenLuft=true THEN Explosionen[Exindex].SpriteNr:=LuftExSpritesBegin+Exindex
                      ELSE Explosionen[Exindex].SpriteNr:=BodenExSpritesBegin+Exindex;
    Explosionen[Exindex].Aktiv:=True;
    Explosionen[Exindex].Pause:=1;
    Explosionen[Exindex].Verzoegerung:=Verzoegerung;

    END;
END;
END;{von initexplosionen}
PROCEDURE ExplDarstellung;
VAR EXindex2:Integer;
    VirtualXold:Integer;
BEGIN
FOR Exindex2:=1 TO MaxExplosionen DO BEGIN
  dec(Explosionen[EXindex2].Verzoegerung);
  IF Explosionen[Exindex2].Aktiv=true THEN BEGIN
    IF (Explosionen[ExIndex2].Pause<=0)AND
       (Explosionen[EXindex2].Verzoegerung<=0)THEN BEGIN
      {IF Explosionen[EXindex2].Stand=Explosionen[EXindex2].Von THEN BEGIN
        startsound(Sounds[1],1,false);
        startsound(Sounds[1],1,false);
        startsound(Sounds[1],1,false);
        startsound(Sounds[1],1,false);
        startsound(Sounds[1],1,false);
      END;}
      {END;}
      SpriteN[Explosionen[EXindex2].SpriteNr]:=Explosionen[EXindex2].Stand;
      SpriteX[Explosionen[EXindex2].SpriteNr]:=Explosionen[EXindex2].XPos;
      SpriteY[Explosionen[EXindex2].SpriteNr]:=Explosionen[EXindex2].YPos;
      IF Explosionen[EXindex2].Stand<
         Explosionen[EXindex2].Bis THEN inc(Explosionen[EXindex2].Stand)
                                   ELSE BEGIN
                                        SpriteN[Explosionen[EXindex2].SpriteNr]:=0;
                                        Explosionen[EXindex2].Aktiv:=false;
                                        END;
      Explosionen[EXindex2].Pause:=1;
    END ELSE dec(Explosionen[Exindex2].Pause,1);
  END;
END;
END;
PROCEDURE FXInit(datei:string;Numfx:Byte);
BEGIN
Momentnumsounds:=numfX;
                  OpenSoundResourceFile(datei);
                  LoadSound(Sounds[0], 'ALARM');
                  LoadSound(Sounds[1], 'AIREXPLO');
                  LoadSound(Sounds[2], 'ALARM01');
                  LoadSound(Sounds[3], 'BOOT');
                  LoadSound(Sounds[4], 'BUGGY');
                  LoadSound(Sounds[5], 'DROHNE1');
                  LoadSound(Sounds[6], 'ENEMYHIT');
                  LoadSound(Sounds[7], 'ENERGY');
                  LoadSound(Sounds[8], 'FEUER');
                  LoadSound(Sounds[9], 'FIRE001');
                  LoadSound(Sounds[10], 'GLEITER');
                  LoadSound(Sounds[11], 'GLOCKE');
                  LoadSound(Sounds[12], 'GRNDHIT');
                  LoadSound(Sounds[13], 'GRNEXPLO');
                  LoadSound(Sounds[14], 'HELIIN');
                  LoadSound(Sounds[15], 'LKW');
                  LoadSound(Sounds[16], 'LAVA006A');
                  LoadSound(Sounds[17], 'MAGMAA');
                  LoadSound(Sounds[18], 'MOTHER');
                  LoadSound(Sounds[19], 'ROTOR04');
                  LoadSound(Sounds[20], 'ROCKET');
                  LoadSound(Sounds[21], 'SCHWEB');
                  LoadSound(Sounds[22], 'SMLEXPLO');
                  LoadSound(Sounds[23], 'SOUND3');
                  LoadSound(Sounds[24], 'SOUND20');
                  LoadSound(Sounds[25], 'SOUND4');
                  LoadSound(Sounds[26], 'SOUND6');
                  LoadSound(Sounds[27], 'TANK_A');
                  LoadSound(Sounds[28], 'SOUND9');
                  LoadSound(Sounds[29], 'TANK');
                  LoadSound(Sounds[30], 'SOUND8');
                  LoadSound(Sounds[31], 'TANK_I');
                  LoadSound(Sounds[32], 'TANK1');
                  LoadSound(Sounds[33], 'WPSHOOT2');
                  LoadSound(Sounds[34], 'MOOMOO');
                  LoadSound(Sounds[35], 'MERVEUX');
                  LoadSound(Sounds[36], 'TOETEN');
                  LoadSound(Sounds[37], 'KUCHEN');
                  LoadSound(Sounds[38], 'LACHEN2');
                  LoadSound(Sounds[39], 'KUCKMAL');
                  CloseSoundResourceFile;

                  OldExitProc := ExitProc;
                  ExitProc := @OurExitProc;
      InitMixing;
END;{Of FXInit}
Procedure trapCtrlAltDel; interrupt;
begin
    case Port[$60] of
        1: Stop   := True;
 {      83: NoMusic:= Not NoMusic;{128}
       72: Pup   :=True;
       80: Pdown   :=True;
       75: PLeft   := True;
       77: PRight  := True;
       29: PShot   := True;
      157: PShot   := False;
      208: Pdown   := False;
      203: PLeft   := False;
      205: PRight  := False;
      200: Pup     :=False;


    end;

    Inline ($E4/$61/$8A/$E0/$0C/$80/     { clean up as BIOS would }
          $E6/$61/$86/$E0/$E6/$61/       { (from Ohlsen & Stoker, }
          $B0/$20/$E6/$20);              { TP Advanced Techniques) }
end;

procedure installTrap;
begin
   getintVec($09,@oldInt9);
   setintVec($09,Addr(trapCtrlAltDel));
end;

procedure uninstallTrap;
begin
   setintVec($09,@oldInt9);
end;
procedure Shutdown;
var   ind:Integer;
begin
      ShutdownMixing;
      ShutdownSB;

      For ind := 0 to MomentNumSounds-1 do
        FreeSound(Sounds[ind]);
      if SharedEMB then ShutdownSharing;
      writeln;
end;

PROCEDURE abbruch;
BEGIN
UninstallTrap;
Shutdown;
CloseRoutines;
halt;
END;
PROCEDURE PScoreUp(Wieviel:Integer);
BEGIN
Inc(PScore,Wieviel);
str(PScore,s);
MakeTextSprite('$'+s,PPunkteLadeNr);
END;
PROCEDURE PEnergieAnzeige(Schaden:Integer);
VAR i1,i2,i3,EnerX,EnerY,Farbe,FarbZaehler,Energie:Integer;
    Staerke:Real;
BEGIN
 IF Schaden>0 THEN StartSound(Sounds[7],7,false);
 Farbe:=93;EnerX:=2;FarbZaehler:=3;
 IF PanzerLebt=True THEN dec(PSAktuelLadePause);
 IF (PSAktuelLadePause<=0)AND(PShieldEnergie<PShieldMax)THEN BEGIN
   inc(PShieldEnergie,1);
   PSAktuelLadePause:=PShieldLadePause;
   END;
 dec(PShieldEnergie,Schaden);
 IF PShieldEnergie>5 THEN PShield:=True
                     ELSE PShield:=False;
    EnerY:=StartVirtualY+79;
    Staerke:=PShieldMax/33;
    IF PShieldEnergie<0 THEN PShieldEnergie:=0;
    FOR i1:=1 TO 33 DO BEGIN
      dec(EnerY);dec(Farbzaehler);
      IF PShieldEnergie<i1*Staerke THEN Farbe:=0;
        FOR i2:=1 TO 3 DO BEGIN
          PutPixel(EnerX+i2,EnerY-i1,farbe);
        END;
      IF FarbZaehler<=0 THEN BEGIN
      inc(Farbe);Farbzaehler:=3;END;
    END;
  Farbe:=93;EnerX:=2;FarbZaehler:=3;
  EnerY:=StartVirtualY+171;
  IF PShield=False THEN dec(PEnergie,Schaden);
  Staerke:=PEnergieMax/33;
  FOR i1:=1 TO 33 DO BEGIN
    dec(EnerY);dec(Farbzaehler);
    IF PEnergie<i1*Staerke THEN Farbe:=0;
      FOR i2:=1 TO 3 DO BEGIN
        PutPixel(EnerX+i2,EnerY-i1,farbe);
      END;
    IF FarbZaehler<=0 THEN BEGIN
  inc(Farbe);Farbzaehler:=3;END;
  END;
 IF (PEnergie<=0)AND(PanzerLebt=True)THEN BEGIN
   FOR i1:= 1 TO 40 DO BEGIN
   InitExplosionen(SpriteX[PanzerSpriteNr]-10+Random(30),
                   SpriteY[PanzerSpriteNr]-10+Random(30),LExplosion1,22,true,Random(10)+10,true);
   startsound(Sounds[1],1,false);
   {startsound(Sounds[1],1,false);
   startsound(Sounds[1],1,false);
   startsound(Sounds[1],1,false);
   startsound(Sounds[1],1,false);}
   END;
   Panzerlebt:=False;
   SpriteN[PanzerSpriteNr]:=0;
   SpriteN[PanzerSchattenSprite]:=0;
 END;
END;{PEnergieAnzeige}

PROCEDURE InitSprites;
{*****SPRITES*****
JetA='JetB1.cod';LJetA=1;
JetB='JetB2.cod';LJetB=2;
MissileA='Mis1A.cod';LMissileA=3;
MissileB='Mis1B.cod';LMissileB=4;
Shot1='S10.cod';LShot1=5;
Shot2='s11.cod';LShot2=6;
Gegner1='Ufo!.cod';LGegner1=7;
Gegner2='Geg1A.cod';LGegner2=8;
Explosion1='Expl1-7B.lib';LExplosion1=9;{-15}
{Explosion2='Ex2A-F.lib';LExplosion2=16;{-21}
{EnergieBalken='Icon5.cod';LEnergieBalken=22;
{*****************}
BEGIN
 LoadSprite(JetA,LJetA); {load sprites}
 LoadSprite(JetB,LJetB);
 LoadSprite(MissileA,LMissileA);
 LoadSprite(MissileB,LMissileB);
 LoadSprite(Shot1,LShot1);
 LoadSprite(Shot2,LShot2);
 LoadSprite(Gegner1,LGegner1);
 LoadSprite(Gegner2,LGegner2);
 LoadSprite(Explosion1,LExplosion1);
 LoadSprite(Explosion2,LExplosion2);
 LoadSprite(EnergieBalken,LEnergieBalken);
 LoadSprite(Gegner3,LGegner3);
 LoadSprite(Shot3,LShot3);
 {*****Schatten*****}
 LoadSprite(Gegner1,LGegner1+SchattenLadeBeginNr);{von ufos}
 SetModeByte(LGegner1+SchattenLadeBeginNr,Display_SHADOWEXACT);
 LoadSprite(JetA,LJetA+SchattenLadeBeginNr);{von Jet}
 SetModeByte(LJetA+SchattenLadeBeginNr,Display_SHADOWEXACT);
 LoadSprite(Gegner2,LGegner2+SchattenLadeBeginNr);{von BigBoss}
 SetModeByte(LGegner2+SchattenLadeBeginNr,Display_SHADOWEXACT);
 LoadSprite(Gegner3,LGegner3+SchattenLadeBeginNr);{von ufos}
 FOR index:= 1 TO 4 DO
 SetModeByte(LGegner3+SchattenLadeBeginNr+index-1,Display_SHADOWEXACT);
 SetShadowTab(brightness);
 {******************}
 SpriteN[PanzerSpriteNr]:=LJetA;
 SpriteX[PanzerSpriteNr]:=100;
 SpriteY[PanzerSpriteNr]:=140;
 SpriteN[PanzerSchattenSprite]:=SchattenLadeBeginNr+LJetA;
END;
PROCEDURE MoveShot;
CONST
    Radius=30;
    PMitteX=11;
    PMitteY=13;
VAR OldX,OldY:Integer;
    winkel:Real;
BEGIN
{Panzershot}
FOR index:=1 TO MaxPanzerShot DO BEGIN
  IF PanzerShot[index].aktiv=True THEN BEGIN
    OldX:=SpriteX[PanzerShot[index].SpriteNr];
    OldY:=SpriteY[PanzerShot[index].SpriteNr];
    CASE PanzerShot[index].Flugart OF
    0:BEGIN
      inc(PanzerShot[index].ShotMoveZaehler);
      dec(SpriteY[PanzerShot[index].SpriteNr],1);
      IF PanzerShot[index].ShotMoveZaehler>=3 THEN
        BEGIN
        PanzerShot[index].Aktiv:=False;
        SpriteN[PanzerShot[index].SpriteNr]:=0;
        END;
      END;
    1:BEGIN dec(SpriteY[PanzerShot[index].SpriteNr],ShotSpeed[PanzerShot[index].art]);END;
    2:BEGIN dec(SpriteY[PanzerShot[index].SpriteNr],ShotSpeed[PanzerShot[index].art]);
            inc(SpriteX[PanzerShot[index].SpriteNr],1);END;
    3:BEGIN dec(SpriteY[PanzerShot[index].SpriteNr],ShotSpeed[PanzerShot[index].art]);
            dec(SpriteX[PanzerShot[index].SpriteNr],1);END;
    4:BEGIN{Move rechts pause oben}
        inc(PanzerShot[index].ShotMoveZaehler);
        CASE PanzerShot[index].ShotMoveZaehler OF
        1..12:BEGIN
              inc(SpriteX[PanzerShot[index].SpriteNr],1);
              dec(SpriteY[PanzerShot[index].SpriteNr],1);END;
        15..29:BEGIN
              dec(SpriteY[PanzerShot[index].SpriteNr],6);END;
        END;
        IF PanzerShot[index].ShotMoveZaehler>=29 THEN BEGIN
        PanzerShot[index].ShotMoveZaehler:=15;
        END;
      END;
    5:BEGIN{Move links pause oben}
        inc(PanzerShot[index].ShotMoveZaehler);
        CASE PanzerShot[index].ShotMoveZaehler OF
        1..12:BEGIN
              dec(SpriteX[PanzerShot[index].SpriteNr],1);
              dec(SpriteY[PanzerShot[index].SpriteNr],1);END;
        15..29:BEGIN
              dec(SpriteY[PanzerShot[index].SpriteNr],6);END;
        END;
        IF PanzerShot[index].ShotMoveZaehler>=29 THEN BEGIN
        PanzerShot[index].ShotMoveZaehler:=15;
        END;
      END;
    6:BEGIN
      dec(SpriteY[PanzerShot[index].SpriteNr],3);
      SpriteX[PanzerShot[index].SpriteNr]:=
                        {Periode,Amplitude,Achse}
      Round((Sin(2*Pi*OldY/320*2)*50)+PanzerShot[index].StartX);
      END;
    7:BEGIN                                        {Kreisschuss}
      inc(PanzerShot[index].ShotMoveZaehler);
                                                                        {Speed}
      winkel:=PanzerShot[index].ShotMoveZaehler*2*Pi/360*ShotSpeed[PanzerShot[index].art]*3;
      SpriteX[PanzerShot[index].SpriteNr]:=
      SpriteX[PanzerSpriteNr]+PMitteX+Round(Radius*Cos(winkel));
      SpriteY[Panzershot[index].SpriteNr]:=
      SpriteY[PanzerSpriteNr]+PMitteY-Round(Radius*Sin(winkel));
      END;
    END;

  IF ((SpriteY[PanzerShot[index].SpriteNr]<StartVirtualY-10)OR
     (SpriteX[PanzerShot[index].SpriteNr]>320)OR
     (SpriteX[PanzerShot[index].SpriteNr]<1)OR
     (SpriteY[PanzerShot[index].SpriteNr]>StartVirtualY+200))AND
     (PanzerShot[index].FlugArt<>0)THEN BEGIN
     PanzerShot[index].Aktiv:=False;
     SpriteN[PanzerShot[index].SpriteNr]:=0;
     END;
  END;
END;
{Gegnershot}
FOR index:=1 TO MaxGegnerShot DO BEGIN
  IF GegnerShot[index].aktiv=True THEN BEGIN
    CASE GegnerShot[index].Flugart OF
    1:BEGIN inc(SpriteY[GegnerShot[index].SpriteNr],GShotSpeed[GegnerShot[index].Art]);END;
    2:BEGIN dec(SpriteY[GegnerShot[index].SpriteNr],GShotSpeed[GegnerShot[index].Art]);END;
    3:BEGIN inc(SpriteY[GegnerShot[index].SpriteNr],GShotSpeed[GegnerShot[index].Art]);
            inc(SpriteX[GegnerShot[index].SpriteNr],GShotSpeed[GegnerShot[index].Art]);
      END;
    4:BEGIN inc(SpriteY[GegnerShot[index].SpriteNr],GShotSpeed[GegnerShot[index].Art]);
            dec(SpriteX[GegnerShot[index].SpriteNr],GShotSpeed[GegnerShot[index].Art]);
      END;
   5,6:BEGIN    {5=Zielgerichtet, 6=Zielverfolgend}
           IF GegnerShot[index].Flugart=6 Then Begin
                GegnerShot[index].ZielX:=SpriteX[PanzerSpriteNr]+10;
                GegnerShot[index].ZielY:=SpriteY[PanzerSpriteNr]+0;{?}
           End;
      IF(ABS(GegnerShot[index].ZielX-Gegnershot[index].StartX)<=
         ABS(GegnerShot[index].ZielY-Gegnershot[index].StartY))
         THEN BEGIN
            IF(GegnerShot[index].StartY<=GegnerShot[index].ZielY)Then
            Inc(SpriteY[GegnerShot[index].SpriteNr],GShotSpeed[GegnerShot[index].Art])
            Else Dec(SpriteY[GegnerShot[index].SpriteNr],GShotSpeed[GegnerShot[index].Art]);
            SpriteX[GegnerShot[index].SpriteNr]:=
            GegnerShot[index].StartX+
            Round((GegnerShot[index].ZielX-GegnerShot[index].StartX)*
                  (ABS(SpriteY[GegnerShot[index].SpriteNr]-GegnerShot[index].StartY))/
                  (ABS(GegnerShot[index].ZielY-GegnerShot[index].StartY)))
         END
         ELSE BEGIN
            IF(GegnerShot[index].StartX<=GegnerShot[index].ZielX)Then
            Inc(SpriteX[GegnerShot[index].SpriteNr],GShotSpeed[GegnerShot[index].Art])
            Else Dec(SpriteX[GegnerShot[index].SpriteNr],GShotSpeed[GegnerShot[index].Art]);
            SpriteY[GegnerShot[index].SpriteNr]:=
            GegnerShot[index].StartY+
            Round((GegnerShot[index].ZielY-GegnerShot[index].StartY)*
                  (ABS(SpriteX[GegnerShot[index].SpriteNr]-GegnerShot[index].StartX))/
                  (ABS(GegnerShot[index].ZielX-GegnerShot[index].StartX)))
      END;{Of If}
      END;
    END;{Of Case}
  IF (SpriteY[GegnerShot[index].SpriteNr]>StartVirtualY+200)OR
     (SpriteY[GegnerShot[index].SpriteNr]<StartVirtualY)OR
     (SpriteX[GegnerShot[index].SpriteNr]>320)OR
     (SpriteX[GegnerShot[index].SpriteNr]<1)THEN BEGIN
     GegnerShot[index].Aktiv:=False;
     SpriteN[GegnerShot[index].SpriteNr]:=0;
     END;
  END;
END;
END;{of Move Shot}
PROCEDURE PanzerSchattenMove;
BEGIN
{********Schatten*******}
SpriteX[PanzerSchattenSprite]:=SpriteX[PanzerSpriteNr]+7;
SpriteY[PanzerSchattenSprite]:=SpriteY[PanzerSpriteNr]+5;
{********Laser**********}
FOR index:=1 TO MaxPanzerShot DO BEGIN
  IF (PanzerShot[index].FlugArt=0)AND(PanzerShot[index].Aktiv=True)THEN BEGIN
    FOR index2:=1 TO MaxPanzerAnbauPositionen DO BEGIN
      IF PanzerAnbaudaten[index2].PositionBesetzt=True THEN BEGIN
        SpriteX[PanzerShot[index].SpriteNr]:=SpriteX[PanzerSpriteNr]+
          PanzerAnbauXPos[PanzerAnbaudaten[index2].Position]+
          ShotXPos[Panzeranbaudaten[index2].art];
        SpriteY[PanzerShot[index].SpriteNr]:=SpriteY[PanzerSpriteNr]+
          PanzerAnbauYPos[PanzerAnbaudaten[index2].Position]+
          ShotYPos[Panzeranbaudaten[index2].art];
      END;
    END;
  END;
END;
{***********************}
END;
PROCEDURE Zusatzanbau(wo,welcher,Flugart:Byte);
BEGIN
GoOut:=False;
FOR index:=1 TO MaxPanzeranbaupositionen DO BEGIN
  IF (PanzerAnbaudaten[index].PositionBesetzt=False)AND(GoOut=False) THEN BEGIN
    GoOut:=True;
    PanzerAnbaudaten[index].SpriteNr:=index+PanzeranbauSpriteBegin;
    PanzerAnbaudaten[index].PositionBesetzt:=True;
    PanzerAnbaudaten[index].Art:=welcher;
    PanzerAnbaudaten[index].ShotPause:=ShotPause[PanzerAnbauDaten[index].art];
    PanzerAnbaudaten[index].Position:=wo;
    PanzerAnbaudaten[index].Flugart:=Flugart;
    {SpriteN[PanzerAnbaudaten[index].SpriteNr]:=ZusaetzeLadeNummer[Welcher];
    SpriteX[PanzerAnbaudaten[index].SpriteNr]:=SpriteX[PanzerSpriteNr]+PanzerAnbauXPos[wo];
    SpriteY[PanzerAnbaudaten[index].SpriteNr]:=SpriteY[PanzerSpriteNr]+PanzerAnbauYPos[wo];}
  END;
END;
END;{von Zusatzanbau}
PROCEDURE GegnerAktivierung;
BEGIN
FOR index:=1 TO MaxAnzahlGegner DO BEGIN
  IF (AktivierungY[index]=StartVirtualY)THEN BEGIN
    GoOut:=False;
    FOR index2:=1 TO MaxAktivGegner DO BEGIN
      IF (Gegner[index2].Aktiv=False)AND(GoOut=False) THEN BEGIN
         IF AktivierungArt[index] IN[2] THEN BEGIN{boss vorbereiten}
           ScrollingAktiv:=False;
           StopSound(10);
           {StartSound(Sounds[11],11,true);
           StartSound(Sounds[11],11,true);
           StartSound(Sounds[11],11,true);}
           StartSound(Sounds[39],39,false);
           StartSound(Sounds[39],39,false);
           StartSound(Sounds[39],39,false);
           FillChar(blackPal,SizeOf(blackPal),0);
           FadeToPalette(blackPal,200);
           END;
         Gegner[index2].Aktiv:=True;
         Gegner[index2].SpriteNr:=index2+GegnerSpritesBegin;
         Gegner[index2].Art:=AktivierungArt[index];
         Gegner[index2].Move:=AktivierungMove[index];
         Gegner[index2].Energie:=GEnergie[Gegner[index2].Art];
         FOR index3:=1 TO MaxAktivGegnerShots DO BEGIN
         Gegner[index2].ShotZwischenPause[index3]:=GShotZwischenPause[Gegner[index2].Art,index3];
         Gegner[index2].ShotSalvenPause[index3]:=GShotSalvenPause[Gegner[index2].Art,index3];
         Gegner[index2].ShotSalve[index3]:=0;
         END;
         Gegner[index2].MoveZaehler:=1;
         SpriteN[Gegner[index2].SpriteNr]:=GLadeNummer[Gegner[index2].Art];
         SpriteX[Gegner[index2].SpriteNr]:=AktivierungX[index];
         SpriteY[Gegner[index2].SpriteNr]:=StartVirtualY-20;
         SpriteN[Gegner[index2].SpriteNr+LGSSpritesBegin]:=SchattenLadeBeginNr+GLadeNummer[Gegner[index2].Art];
         SpriteX[Gegner[index2].SpriteNr+LGSSpritesBegin]:=AktivierungX[index]+
                                                           SchattenX[Gegner[index2].Art];
         SpriteY[Gegner[index2].SpriteNr+LGSSpritesBegin]:=StartVirtualY-20+
                                                           SchattenY[Gegner[index2].Art];
         GoOut:=True;
         IF AktivierungArt[index] IN[2] THEN BEGIN{boss initialisieren}
           Delay(800);
           StartSound(Sounds[10],10,true);{jet gedrîhne}
           StartSound(Sounds[10],10,true);
           SpriteY[Gegner[index2].SpriteNr]:=StartVirtualY+5;
           SpriteY[Gegner[index2].SpriteNr+LGSSpritesBegin]:=
                   SpriteY[Gegner[index2].SpriteNr]+
                   SchattenY[Gegner[index2].Art];
           SpriteY[PanzerSpriteNr]:=StartVirtualY+160;
           {********JetSchatten*******}
           SpriteX[PanzerSchattenSprite]:=SpriteX[PanzerSpriteNr]+7;
           SpriteY[PanzerSchattenSprite]:=SpriteY[PanzerSpriteNr]+5;
           {**************************}
           Animate;
           FadeToPalette(tempPal,200);
           END;
      END;
    END;
  END;
END;
GoOut:=False;
END;{von GegnerAktivierung}
PROCEDURE MoveGegnerSchatten;
BEGIN
FOR index:=1 TO MaxAktivGegner DO BEGIN
  IF Gegner[index].Aktiv=True THEN BEGIN
    SpriteX[Gegner[index].SpriteNr+LGSSpritesBegin]:=
            SpriteX[Gegner[index].SpriteNr]+SchattenX[Gegner[index].Art];
    SpriteY[Gegner[index].SpriteNr+LGSSpritesBegin]:=
            SpriteY[Gegner[index].SpriteNr]+SchattenY[Gegner[index].Art];
  END;
END;
END;{von MoveGegnerSchatten}


PROCEDURE MoveGegner;
VAR OldX,OldY:Integer;
    p:Integer;
BEGIN
FOR index:=1 TO MaxAktivGegner DO BEGIN
  IF Gegner[index].Aktiv=True THEN BEGIN
    OldX:=SpriteX[Gegner[index].SpriteNr];
    OldY:=SpriteY[Gegner[index].SpriteNr];
    CASE Gegner[index].Move OF
    1:BEGIN
      inc(SpriteY[Gegner[index].SpriteNr],2);
      END;
    2:BEGIN
      inc(Gegner[index].MoveZaehler);
        CASE Gegner[index].MoveZaehler OF
        1..20:BEGIN
              inc(SpriteX[Gegner[index].SpriteNr],2);
              inc(SpriteY[Gegner[index].SpriteNr],1);
              END;
        20..40:BEGIN
               dec(SpriteX[Gegner[index].SpriteNr],2);
               inc(SpriteY[Gegner[index].SpriteNr],1);
               END;
        40..100:inc(SpriteY[Gegner[index].SpriteNr],2);
        200..300:inc(SpriteY[Gegner[index].SpriteNr],2);
        END;
      END;
    3:BEGIN
      inc(Gegner[index].MoveZaehler);
        CASE Gegner[index].MoveZaehler OF
        1..90:inc(SpriteY[Gegner[index].SpriteNr],2);
        100..150:dec(SpriteY[Gegner[index].SpriteNr],2);
        160..300:inc(SpriteY[Gegner[index].SpriteNr],2);
        END;
      END;
    4:BEGIN
      inc(Gegner[index].MoveZaehler);
        CASE Gegner[index].MoveZaehler OF
        1..20:inc(SpriteY[Gegner[index].SpriteNr],1);
        30..80:inc(SpriteX[Gegner[index].SpriteNr],1);
        100..200:dec(SpriteX[Gegner[index].SpriteNr],1);
        220..270:inc(SpriteX[Gegner[index].SpriteNr],1);
        END;
        IF Gegner[index].MoveZaehler Mod 100=0 Then Begin
        p:=Random(5);
        StartSound(Sounds[34+p],34+p,false);
        End;

        IF Gegner[index].MoveZaehler>270 THEN
          Gegner[index].MoveZaehler:=21;
        {IF Gegner[index].Energie<=200 THEN InitExplosionen(SpriteX[Gegner[index].SpriteNr]+Random(80),
                                                           SpriteY[Gegner[index].SpriteNr]+Random(80),11,18,true,0);}

      END;
    5:BEGIN
      inc(Gegner[index].MoveZaehler);
        CASE Gegner[index].MoveZaehler OF
        1..20:inc(SpriteY[Gegner[index].SpriteNr],2);
        END;
      END;
    6:BEGIN
      Inc(SpriteY[Gegner[index].SpriteNr],2);
      SpriteX[Gegner[index].SpriteNr]:=
                        {Periode,Amplitude,Achse}
      Round((Sin(2*Pi*OldY/320*8)*40)+160);
      END;
    END;{von Case}
    {Loeschen des Gegners wen unten angekommen}
    IF SpriteY[Gegner[index].SpriteNr]>=StartVirtualY+200 THEN BEGIN
    SpriteN[Gegner[index].SpriteNr+LGSSpritesBegin]:=0;
    SpriteN[Gegner[index].SpriteNr]:=0;
    Gegner[index].Aktiv:=False;
    END;
  END;
END;
END;{von Move Gegner}
PROCEDURE Kolision;
VAR EXi1,EXi2:Integer;
BEGIN
{PanzerschÅsse mit Gegnern}
IF PanzerLebt=True THEN BEGIN
  FOR index:=1 TO MaxPanzerShot DO BEGIN
    FOR index2:=1 TO MaxAktivGegner DO BEGIN
      IF (PanzerShot[index].Aktiv=True)AND(Gegner[index2].Aktiv=True) THEN BEGIN
        IF Hitdetect(PanzerShot[index].SpriteNr,Gegner[index2].SpriteNr) THEN BEGIN
          dec(Gegner[index2].Energie,ShotPower[PanzerShot[index].Art]);
          InitExplosionen(SpriteX[PanzerShot[index].SpriteNr],
                          SpriteY[PanzerShot[index].SpriteNr],LExplosion1,15,true,0,false);
          IF Gegner[index2].Energie<=0 THEN BEGIN
            startsound(Sounds[1],1,false);
            startsound(Sounds[1],1,false);
            startsound(Sounds[1],1,false);
            startsound(Sounds[1],1,false);
            startsound(Sounds[1],1,false);
            PScoreUp(GScoreUp[Gegner[index2].Art]);
            IF Gegner[index2].Art IN[2] THEN BEGIN{fÅr Bosse}
               FOR EXi1:=1 TO 20 DO BEGIN
                 FOR EXi2:=1 TO 5 DO BEGIN
                 InitExplosionen(SpriteX[Gegner[index2].SpriteNr]+EXi2*10,
                                 SpriteY[Gegner[index2].SpriteNr]+EXi1*10,LExplosion1,22,true,Random(20)+10{EXi1*EXi2*2},True);
                 END;
               END;
               startsound(Sounds[38],38,false);
               Levelend:=True;
            END ELSE BEGIN
            InitExplosionen(SpriteX[Gegner[index2].SpriteNr],
                            SpriteY[Gegner[index2].SpriteNr],LExplosion2,22,true,0,false);
            END;
            SpriteN[Gegner[index2].SpriteNr+LGSSpritesBegin]:=0;{schatten}
            SpriteN[Gegner[index2].SpriteNr]:=0;
            Gegner[index2].Aktiv:=False;
          END;
          SpriteN[PanzerShot[index].SpriteNr]:=0;
          PanzerShot[index].Aktiv:=False;
        END;
      END;
    END;
  END;
  {GegnerschÅsse mit Panzer}
  FOR index:=1 TO MaxGegnerShot DO BEGIN
    IF GegnerShot[index].Aktiv=True THEN BEGIN
      IF HitDetect(GegnerShot[index].SpriteNr,PanzerSpriteNr) THEN BEGIN
        PEnergieAnzeige(GShotPower[GegnerShot[index].Art]);
        InitExplosionen(SpriteX[GegnerShot[index].SpriteNr],
                        SpriteY[GegnerShot[index].SpriteNr],LExplosion1,15,true,0,false);
        startsound(Sounds[6],6,false);
        startsound(Sounds[6],6,false);
        startsound(Sounds[6],6,false);
        SpriteN[GegnerShot[index].SpriteNr]:=0;
        GegnerShot[index].Aktiv:=False;
      END;
    END;
  END;
  {gegner mit panzer}
  FOR index:=1 TO MaxAktivGegner DO BEGIN
    IF Gegner[index].Aktiv=True THEN BEGIN
      IF (HitDetect(Gegner[index].SpriteNr,PanzerSpriteNr)) THEN BEGIN
        PEnergieAnzeige(GKolisionPower[Gegner[index].Art]);
        dec(Gegner[index].Energie,PKolosSchaden);
        IF Gegner[index].Energie<=0 THEN BEGIN
          InitExplosionen(SpriteX[Gegner[index].SpriteNr],
                          SpriteY[Gegner[index].SpriteNr],LExplosion2,22,true,0,false);
          SpriteN[Gegner[index].SpriteNr+LGSSpritesBegin]:=0;{schatten}
          SpriteN[Gegner[index].SpriteNr]:=0;
          Gegner[index].Aktiv:=False;
          END;
        startsound(Sounds[6],6,false);
        startsound(Sounds[6],6,false);
        startsound(Sounds[6],6,false);
        startsound(Sounds[6],6,false);
        startsound(Sounds[6],6,false);
      END;
    END;
  END;
END;{von if Panzerlebt=True}
END;{von Kolision}
PROCEDURE LevelLaden;
VAR
   savedat:File;
   i,i2:Integer;
BEGIN
Assign(savedat,Levelname);
Reset(savedat,1);
blockread(savedat,MomentLevMaxX,SizeOf(MomentLevMaxX));
blockread(savedat,MomentLevMaxY,SizeOf(MomentLevMaxY));
For i2:=1 To MomentLevMaxY Do
    For i:=1 To MomentLevMaxX Do
    blockread(savedat,LevTilePos[i,i2],SizeOf(LevTilePos[i,i2]));
Close(Savedat);
END;{LevelLaden}
PROCEDURE InitLevel;
VAR i,i2:Integer;
    PROCEDURE Kachel(X,Y:Integer;TileNr:Byte);
    BEGIN                      {Zerlegt 32*32 Kachel In 4 16*16 Kacheln}
    PutTile(X,Y,1+(TileNr-1)*4);
    PutTile(X+16,Y,2+(TileNr-1)*4);
    PutTile(X,Y+16,3+(TileNr-1)*4);
    PutTile(X+16,Y+16,4+(TileNr-1)*4);
    END;
BEGIN
XTiles:=0; YTiles:=0;

SetOffscreenTile(0);
SetBackgroundMode(scrolling);
SetBackgroundScrollRange(NullpunktX,NullpunktY-MomentLevMaxY*32,NullpunktX+320,NullpunktY+200);
{SetBackgroundScrollRange(-1000,-1000,1000,1000);}
For i2:=1 To MomentLevMaxY Do    {TileArea erstellen}
    For i:=1 To MomentLevMaxX Do
    Kachel(NullpunktX+(i-1)*32,NullpunktY+200-32-(i2-1)*32,LevTilePos[i,i2]);
StartVirtualX:=NullpunktX;
StartVirtualY:=NullpunktY;
END;{Leveldurchscrollen}
PROCEDURE WaffenNachLadung;
BEGIN
{lade Pause vom Panzer verringern}
IF Panzerlebt=True THEN BEGIN
FOR index:=1 TO MaxPanzerAnbauPositionen DO BEGIN
 IF Panzeranbaudaten[index].Positionbesetzt=True THEN BEGIN
   IF Panzeranbaudaten[index].AnbauGeladen=False THEN
     dec(Panzeranbaudaten[index].ShotPause,1);
   IF Panzeranbaudaten[index].ShotPause<=0 THEN BEGIN
     Panzeranbaudaten[index].AnbauGeladen:=True;
     Panzeranbaudaten[index].ShotPause:=ShotPause[Panzeranbaudaten[index].art];
     END;
   END;
 END;
END;
{lade Pause von Gegnern verringern und abschuss}
FOR index:=1 TO MaxAktivGegner DO BEGIN
  IF Gegner[index].Aktiv=True THEN BEGIN
    FOR index3:=1 TO MaxAktivGegnerShots DO BEGIN
      IF (GShotArt[Gegner[index].Art,index3]>0)THEN BEGIN
        IF(Gegner[index].ShotSalve[index3]<=0)THEN BEGIN
          dec(Gegner[index].ShotSalvenPause[index3],1);
          IF Gegner[index].ShotSalvenPause[index3]<=0 THEN
            Gegner[index].ShotSalve[index3]:=GShotSalve[Gegner[index].Art,index3];
        END;
        IF(Gegner[index].ShotSalvenPause[index3]<=0)THEN BEGIN
          {Gegner[index].ShotSalve[index3]:=GShotSalve[Gegner[index].Art,index3];}
          dec(Gegner[index].ShotZwischenPause[index3],1);
          IF(Gegner[index].ShotZwischenPause[index3]<=0)THEN BEGIN
            Gegner[index].ShotZwischenPause[index3]:=GshotZwischenPause[Gegner[index].Art,index3];
            dec(Gegner[index].ShotSalve[index3],1);
            IF Gegner[index].ShotSalve[index3]<=0 THEN BEGIN
              Gegner[index].ShotSalvenPause[index3]:=GShotSalvenPause[Gegner[index].Art,index3];
            END;
            GoOut:=False;
            FOR index2:=1 TO MaxGegnerShot DO BEGIN
              IF (GegnerShot[index2].Aktiv=False)AND(GoOut=False) THEN BEGIN
                startsound(Sounds[GShotSound[GShotArt[Gegner[index].Art,index3]]],
                         GShotSound[GShotArt[Gegner[index].Art,index3]],false);
                GegnerShot[index2].Aktiv:=True;
                GegnerShot[index2].SpriteNr:=index2+GegnerShotSpritesBegin;
                GegnerShot[index2].Flugart:=GShotFlugart[Gegner[index].Art,index3];
                GegnerShot[index2].Art:=GShotArt[Gegner[index].Art,index3];
                SpriteN[GegnerShot[index2].SpriteNr]:=GShotLadeNummer[GShotArt[Gegner[index].Art,index3]];
                GegnerShot[index2].StartX:=SpriteX[Gegner[index].SpriteNr]+
                                           GShotXPos[Gegner[index].art,index3];
                GegnerShot[index2].StartY:=SpriteY[Gegner[index].SpriteNr]+
                                           GShotYPos[Gegner[index].art,index3];
                GegnerShot[index2].ZielX:=SpriteX[PanzerSpriteNr]+10;
                GegnerShot[index2].ZielY:=SpriteY[PanzerSpriteNr]+0;{?}
                SpriteX[GegnerShot[index2].SpriteNr]:=SpriteX[Gegner[index].SpriteNr]+
                                             GShotXPos[Gegner[index].art,index3];
                SpriteY[GegnerShot[index2].SpriteNr]:=SpriteY[Gegner[index].SpriteNr]+
                                             GShotYPos[Gegner[index].art,index3];
                GoOut:=True;
              END;
            END;
          END;
         END;
      END;
    END;
  END;
END;
END;{von WaffenNachladung}
PROCEDURE PanzerAktionen;
BEGIN
 {animation}
 dec(PAnimSpeed,1);
 IF PAnimSpeed<=0 THEN BEGIN
   PAnimSpeed:=2;
   IF SpriteN[PanzerSpriteNr]=LJetA
     THEN SpriteN[PanzerSpriteNr]:=LJetB
     ELSE SpriteN[PanzerSpriteNr]:=LJetA;
 END;
 {Shot}
 IF (PShot=True)THEN BEGIN
   FOR index:=1 TO MaxPanzerAnbauPositionen DO BEGIN
     IF Panzeranbaudaten[index].PositionBesetzt=True THEN BEGIN
       IF Panzeranbaudaten[index].AnbauGeladen=True THEN BEGIN
         FOR index2:=1 TO MaxPanzerShot DO BEGIN
           IF (PanzerShot[index2].Aktiv=False)AND(GoOut=False) THEN BEGIN
             startsound(Sounds[ShotSoundNr[PanzerAnbaudaten[index].art]],
                               ShotSoundNr[PanzerAnbaudaten[index].art],false);
             GoOut:=True;
             PanzerShot[index2].Aktiv:=True;
             PanzerShot[index2].SpriteNr:=index2+PanzerShotSpritesBegin;
             PanzerShot[index2].Flugart:={ShotFlugart[}Panzeranbaudaten[index].Flugart{art]};
             PanzerShot[index2].ShotMoveZaehler:=0;
             PanzerShot[index2].Art:=Panzeranbaudaten[index].art;
             SpriteN[PanzerShot[index2].SpriteNr]:=ShotLadeNummer[Panzeranbaudaten[index].art];
             SpriteX[PanzerShot[index2].SpriteNr]:=SpriteX[PanzerSpriteNr]+
                                                   PanzerAnbauXPos[PanzerAnbaudaten[index].Position]+
                                                   ShotXPos[Panzeranbaudaten[index].art];
             SpriteY[PanzerShot[index2].SpriteNr]:=SpriteY[PanzerSpriteNr]+
                                                   PanzerAnbauYPos[PanzerAnbaudaten[index].Position]+
                                                   ShotYPos[Panzeranbaudaten[index].art];
             PanzerShot[index2].StartX:=SpriteX[PanzerShot[index2].SpriteNr];
             Panzeranbaudaten[index].AnbauGeladen:=False;
           END;
         END;
       END;
       GoOut:=False;
     END;
   END;
 END;{von IF PShot}
 {Move}
 IF (PLeft=True)AND(SpriteX[PanzerSpriteNr]>=12)THEN
   BEGIN dec(SpriteX[PanzerSpriteNr],ShipSpeed);PVLTraegheit:=PTraegheit;END;
 IF (PRight=True)AND(SpriteX[PanzerSpriteNr]<=280)THEN
   BEGIN inc(SpriteX[PanzerSpriteNr],ShipSpeed);PVRTraegheit:=PTraegheit;END;
 IF (Pdown=True)AND(SpriteY[PanzerSpriteNr]<=StartVirtualY+168)THEN
   BEGIN inc(SpriteY[PanzerSpriteNr],ShipSpeed);PVDTraegheit:=PTraegheit;END;
 IF (Pup=True)AND(SpriteY[PanzerSpriteNr]>=StartVirtualY+10) THEN
   BEGIN dec(SpriteY[PanzerSpriteNr],ShipSpeed);PVUTraegheit:=PTraegheit;END;
 {Traegheits Move}
 IF (PLeft=False)AND(PVLTraegheit>=1)AND(SpriteX[PanzerSpriteNr]>=12)THEN BEGIN dec(PVLTraegheit,1);
   IF PVLTraegheit<=ShipSpeed THEN dec(SpriteX[PanzerSpriteNr],PVLTraegheit)
                              ELSE dec(SpriteX[PanzerSpriteNr],ShipSpeed);END;
 IF (PRight=False)AND(PVRTraegheit>=1)AND(SpriteX[PanzerSpriteNr]<=280)THEN BEGIN dec(PVRTraegheit,1);
   IF PVRTraegheit<=ShipSpeed THEN inc(SpriteX[PanzerSpriteNr],PVRTraegheit)
                              ELSE inc(SpriteX[PanzerSpriteNr],ShipSpeed);END;
 IF (Pdown=False)AND(PVDTraegheit>=1)AND(SpriteY[PanzerSpriteNr]<=StartVirtualY+168)THEN BEGIN dec(PVDTraegheit,1);
   IF PVDTraegheit<=ShipSpeed THEN inc(SpriteY[PanzerSpriteNr],PVDTraegheit)
                              ELSE inc(SpriteY[PanzerSpriteNr],Shipspeed);END;
 IF (Pup=False)AND(PVUTraegheit>=1)AND(SpriteY[PanzerSpriteNr]>=StartVirtualY+10)THEN BEGIN dec(PVUTraegheit,1);
   IF PVUTraegheit<=ShipSpeed THEN dec(SpriteY[PanzerSpriteNr],PVUTraegheit)
                              ELSE dec(SpriteY[PanzerSpriteNr],ShipSpeed);END;
 {FOR index:=1 TO MaxPanzerAnbauPositionen DO BEGIN
   IF Panzeranbaudaten[index].Positionbesetzt=True THEN BEGIN
   SpriteX[Panzeranbaudaten[index].SpriteNr]:=SpriteX[PanzerSpriteNr]+
                                              PanzerAnbauXPos[Panzeranbaudaten[index].Position];
   SpriteY[Panzeranbaudaten[index].SpriteNr]:=SpriteY[PanzerSpriteNr]+
                                              PanzeranbauYPos[Panzeranbaudaten[index].Position];
   END;
 END;}
 {Prozeduren}
 PanzerSchattenMove;
 {PScoreUp(0);}

END;{von PanzerAktionen}

BEGIN
 InitGraph;
 InstallTrap;
 If loadpalette('Raum.pal',0,TempPal)=0 Then Abbruch;
 SetPalette(TempPal,TRUE);
 SetAnimateWindow(8,1,312,199);

 LoadSprite('Icon3.cod',1);
 StartVirtualX:=NullpunktX;
 StartVirtualY:=NullpunktY;
 TilesLoaded:=LoadTile(TileName,1);

 LevelLaden;
 InitLevel;
 InitSprites;
 {*************Schriftenladen**************}
 LoadFont(FontName);
 {GraphTextColor:=124; GraphTextBackground:=GraphTextColor;}
 SpriteN[PPunkteSpriteNr]:=PPunkteLadeNr;
 SpriteX[PPunkteSpriteNr]:=30;
 SpriteY[PPunkteSpriteNr]:=10;
 PScoreUp(0);
 {*****************************************}
 {*************EnergieBalken***************}
 SetSplitIndex(8);
 SpriteN[EnergieBalkenSpriteR]:=LEnergieBalken;
 SpriteX[EnergieBalkenSpriteR]:=0;
 SpriteY[EnergieBalkenSpriteR]:=1;
 SpriteN[EnergieBalkenSpriteL]:=LEnergieBalken;
 SpriteX[EnergieBalkenSpriteL]:=311;
 SpriteY[EnergieBalkenSpriteL]:=1;
 Winclip:=false;
 Updateouterarea:=2;
 {*****************************************}
 PEnergie:=PEnergieMax;
 PShieldEnergie:=PShieldMax;
 {**********FX Initialisieren***********}
 GetSettings(BaseIO, IRQ, DMA, DMA16);
 InitSB(BaseIO, IRQ, DMA, DMA16);
 InitXMS;
 if SharedEMB then InitSharing;
 FXInit('RAUM28.SND',40);{FX}
{***************************************}
 FOR index:=1 TO MaxPanzerAnbauPositionen DO BEGIN{anbauungen auf false}
 PanzerAnbaudaten[index].PositionBesetzt:=False;
 PanzerAnbaudaten[index].AnbauGeladen:=True;
 END;
 FOR index:=1 TO MaxAktivGegner DO BEGIN
 Gegner[index].Aktiv:=False;
 END;
 FOR index:=1 TO MaxExplosionen DO BEGIN
 Explosionen[index].Aktiv:=False;
 END;
 Zusatzanbau(1,1,5);
 Zusatzanbau(2,1,4);
 Zusatzanbau(3,2,6);{3,2,6}
 Zusatzanbau(4,3,0);
 StartSound(Sounds[10],10,true);{jet gedrîhne}
 StartSound(Sounds[10],10,true);
 ScrollingAktiv:=True;
 GoOut:=False;
 SetSpriteCycle(LGegner3,4);
 SetSpriteCycle(LGegner3+SchattenLadeBeginNr,4);
 REPEAT
 IF ScrollingAktiv=True THEN GegnerAktivierung;
 MoveGegner;
 MoveGegnerSchatten;
 Kolision;
 MoveShot;
 WaffenNachladung;
 PEnergieAnzeige(0);
 Expldarstellung;
 IF Panzerlebt=True THEN PanzerAktionen;
 IF ScrollingAktiv=True THEN BEGIN
   IF Panzerlebt=True THEN dec(SpriteY[PanzerSpriteNr],1);
   dec(ScrollSpeed);
   IF scrollSpeed<=0 THEN BEGIN
     dec(StartVirtualY,1);
   {FOR index:= PanzerAnbauSpriteBegin TO PanzerAnbauSpriteBegin+MaxPanzerAnbauPositionen DO
     dec(SpriteY[index],1);}
     FOR index:=1 TO MaxAktivGegner DO BEGIN
       IF Gegner[index].Aktiv=True THEN
         dec(SpriteY[gegner[index].SpriteNr],1);
     END;
     dec(SpriteY[EnergieBalkenSpriteR],1);{energieanzeigen}
     dec(SpriteY[EnergieBalkenSpriteL],1);
     dec(SpriteY[PPunkteSpriteNr],1);
     ScrollSpeed:=1;
   END;
 END;

 IF Levelend=True THEN BEGIN
   PanzerLebt:=false;
   IF SpriteX[PanzerSpriteNr]>152 THEN dec(SpriteX[PanzerSpriteNr],3);
   IF SpriteX[PanzerSpriteNr]<148 THEN inc(SpriteX[PanzerSpriteNr],3);
   dec(SpriteY[PanzerSpriteNr],3);
   PanzerSchattenMove;
   IF SpriteY[PanzerSpriteNr]<=StartVirtualY-30 THEN BEGIN
     StopSound(10);
     FillChar(blackPal,SizeOf(blackPal),0);
     FadeToPalette(blackPal,200);
     Repeat Until VoiceCount=0;
     Abbruch;
     END;
 END;{von IF Levelend}


 {IF StartVirtualX=0 THEN inc(StartVirtualX,1)
                    ELSE inc(StartVirtualX,2);}
 delay(10);
 animate;

{ Dec(StartVirtualX,2);}
 UNTIL (Stop);
 FillChar(blackPal,SizeOf(blackPal),0);
 FadeToPalette(blackPal,10);
 UninstallTrap;
 CloseRoutines;
 Shutdown;
END.
