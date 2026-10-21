program Cyberworms;
Uses
  Graph,Crt,Detect,Smix,FM_CMF;
Const
      XMSRequired   = 1000;    {XMS memory required to load the sounds (KBytes) }
      SharedEMB     = true;
      {TRUE:   All sounds will be stored in a shared EMB}
      {FALSE:  Each sound will be stored in a separate EMB}
      NumSounds = 32;
      MomentNumSounds:Byte=32;
      Maxspeech=5;{Anzahl Random Sprachausgabe}
  Steuerung:array[1..22]Of Char=('6','8','4','2','9','7','1','3','-','+',' ',
                                    'f','e','s','c','r','w','x','v','z','a','q');
      PCSpeaker:Boolean=false;
      BKMusic:Boolean=false;
Var
  Gd,Gm,x1,y1,h1,v1,x2,y2,x3,y3,h2,v2,radius1,radius2,live1,live2,shoot1,
  shoot2,kanone1,kanone2,selectgun1,selectgun2,bonus,movespeed1,movespeed2,
  xextra,yextra,hextra,vextra,objekt,extrawormlive,ewormtyp,getter,
  xkugel1,ykugel1,xkugel2,ykugel2,
  xend,yend,rand,xstart,ystart,shooter,{FÅr Gun9}
  StAngle,xslice,yslice,shooter2,maxton,ton,tondauer: Integer;{FÅr Gun10}
  gamespeed,p,punkte1,punkte2:Byte;
  i,i2,i3,cdown1,cdown2,extracdown,shield1,shield2:LongInt;     {cdown fÅr Ladehemmung}
  ch,playagain,gegner:char;
  ewa,kugel1,kugel2,knallerballer,knallerballer2,playsnd,wechselbonus:boolean;    {Extrawormattacke}{plasmakugeln}
  name1,name2:String;
    BaseIO: word; IRQ, DMA, DMA16: byte;  {FX}
    Sounds: array[0..NumSounds-1] of PSound;
    OldExitProc: pointer;
  snd:Array[1..100]of Integer;
  sndptr:pointer;
  soundfilesize:Integer;
  rnd:Byte;
Label 10,20;

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

PROCEDURE FXInit(datei:string;Numfx:Byte);
BEGIN
Momentnumsounds:=numfX;
                  OpenSoundResourceFile(datei);
                  LoadSound(Sounds[0], 'GUN2');
                  LoadSound(Sounds[1], 'GUN4');
                  LoadSound(Sounds[2], 'GUN5');
                  LoadSound(Sounds[3], 'GUN7');
                  LoadSound(Sounds[4], 'GUN8');
                  LoadSound(Sounds[5], 'GUN10');
                  LoadSound(Sounds[6], 'BONUS');
                  LoadSound(Sounds[7], 'GROWUP');
                  LoadSound(Sounds[8], 'BONUS2');
                  LoadSound(Sounds[9], 'ENERGIEB');
                  LoadSound(Sounds[10], 'LACHEN');
                  LoadSound(Sounds[11], 'SHIELD');
                  LoadSound(Sounds[12], 'GUN3');
                  LoadSound(Sounds[13], 'EXPLO1');
                  LoadSound(Sounds[14], 'GUN9');
                  LoadSound(Sounds[15], 'TREFFER');
                  LoadSound(Sounds[16], 'EXPLO2');
                  LoadSound(Sounds[17], 'GUN1');
                  LoadSound(Sounds[18], 'SELECT');
                  LoadSound(Sounds[19], 'SCHNELL');
                  LoadSound(Sounds[20], 'SCHRUMPF');
                  LoadSound(Sounds[21], 'ENDEXPLO');
                  LoadSound(Sounds[22], 'MINIWORM');
                  LoadSound(Sounds[23], 'BEHINDYA');
                  LoadSound(Sounds[24], 'BROT');
                  LoadSound(Sounds[25], 'DIESLOW');
                  LoadSound(Sounds[26], 'EATYA');
                  LoadSound(Sounds[27], 'MOVEYA');
                  CloseSoundResourceFile;

                  OldExitProc := ExitProc;
                  ExitProc := @OurExitProc;
      InitMixing;
END;{Of FXInit}
procedure Shutdown;
var   ind:Integer;
begin
      ShutdownMixing;
      ShutdownSB;

      for ind := 0 to MomentNumSounds-1 do
        FreeSound(Sounds[ind]);
      if SharedEMB then ShutdownSharing;
      writeln;
end;
Procedure Title;
VAR
   Treiber,Modus,X,Y,XMitte,YMitte,index,Hoehe:Integer;
Procedure Atom;
Var
   k,Radius:integer;
Begin
   hoehe:=150;
   k:=20;
   Radius:=20;
   While k>0 Do Begin
      For i:=0 To k Do Begin
      If Keypressed Then exit;
      Setcolor(black);
      SetFillStyle(1,0);
      Bar(X-Radius,Hoehe-Radius,X+Radius,Hoehe+Radius);
      hoehe:=hoehe+i;
      X:=X-4;
      Setcolor(yellow);
      SetFillStyle(1,14);
      PieSlice(X,hoehe,60,120,Radius);
      PieSlice(X,hoehe,180,240,Radius);
      PieSlice(X,hoehe,300,360,Radius);
      Setcolor(black);SetfillStyle(1,Black);
      PieSlice(X,hoehe,0,360,Radius-13);
      Setcolor(yellow);SetfillStyle(1,yellow);
      PieSlice(X,hoehe,0,360,Radius-17);
      delay(15);
      End;
   Sound(80);
   Delay(20);
   NoSound;
            If k>0 Then k:=k-5;
      For i:=k downto 0 Do Begin
      If Keypressed Then exit;
      Setcolor(black);
      SetFillStyle(1,0);
      Bar(X-Radius,Hoehe-Radius,X+Radius,Hoehe+Radius);
      hoehe:=hoehe-i;
      X:=X-4;
      Setcolor(yellow);
      SetFillStyle(1,14);
      PieSlice(X,hoehe,60,120,Radius);
      PieSlice(X,hoehe,180,240,Radius);
      PieSlice(X,hoehe,300,360,Radius);
      Setcolor(black);SetfillStyle(1,Black);
      PieSlice(X,hoehe,0,360,Radius-12);
      Setcolor(yellow);SetfillStyle(1,yellow);
      PieSlice(X,hoehe,0,360,Radius-16);
      delay(15);
      End;
      nosound;
   End;{Of While}
startsound(Sounds[22],22,false);
END;

Procedure Explosion;
Var
     x1,y1,x4,y4:integer;
Begin
        Randomize;
        x1:=X;
        y1:=Hoehe;
startsound(Sounds[21],21,false);    {Explosion}
startsound(Sounds[10],10,false);    {Lachen}
          For i:=1 To 3000 Do Begin
          If Keypressed Then exit;
          Setcolor(15);
          If i>1000 Then Setcolor(yellow);If i>1800 Then Setcolor(lightred);
          If i>2600 Then Setcolor(red);
          Line(x1,y1,x4,y4);
          x4:=x1+x4*9;
          y4:=y1+y4*9;
          If PCSpeaker Then sound(random(1000));
          End;
          nosound;
     SetfillStyle(0,Black);
     Bar(x-250,hoehe-30,x+250,hoehe+70);
     Setcolor(yellow);
     SetTextStyle(4,0,8);
     SettextJustify(Centertext,centertext);
     OutTextXY(x,hoehe,'By Wunibald');
     SetFillStyle(1,14);
     PieSlice(X+70,hoehe-8,60,120,15);
     PieSlice(X+70,hoehe-8,180,240,15);
     PieSlice(X+70,hoehe-8,300,360,15);
     Setcolor(black);SetfillStyle(1,Black);
     PieSlice(X+70,hoehe-8,0,360,7);
     Setcolor(yellow);SetfillStyle(1,yellow);
     PieSlice(X+70,hoehe-8,0,360,3);
     Delay(2000);
     Cleardevice;
END;
BEGIN{Titelprogramm}
XMitte:=GetMaxX Div 2;
YMitte:=GetMaxY Div 2;
Y := YMitte;
SetTextStyle(4,0,1);
SetTextJustify(1,1);
FOR index := 1 TO 50 DO{Zoom}
    BEGIN
    If Keypressed Then exit;
    SetColor(0);
    OutTextXY(XMitte,YMitte,'Cyberworms');
    SetUserCharSize(index,20,index,20);
    SetColor(14);
    OutTextXY(XMitte,YMitte,'Cyberworms');
    Sound(30+index);
    Delay(4);
END;
NoSound;
Delay(500);
FOR index := 1 TO 30 DO{Anheben}
    BEGIN
    If Keypressed Then exit;
    SetUserCharSize(50,20,50,20);
    SetColor(0);
    OutTextXY(XMitte,Y,'Cyberworms');
    Y:=Y-5;
    SetColor(14);
    OutTextXY(XMitte,Y,'Cyberworms');
    Sound(80+index);
END;
NoSound;
Delay(1000);
FOR index := 1 TO 80 DO{Zoom}
BEGIN
    If Keypressed Then exit;
    SetColor(0);
    OutTextXY(XMitte,YMitte-10,'2');
    SetUserCharSize(index,20,index,20);
    SetColor(14);
    OutTextXY(XMitte,YMitte-10,'2');
    Sound(100+index);
    Delay(4);
END;
NoSound;
Delay(1000);
SetColor(15);
SetTextStyle(8,0,3);
OutTextXY(XMitte,440,'Mîge das Brot mit dir Leim');
startsound(Sounds[24],24,false);
Delay(3000);

X:=660;
Atom;
Delay(500);
Explosion;
NoSound;
delay(300);
END;{Of Title}

Procedure Optionsmenu(Var gegner:Char;Var gamespeed,punkte1,punkte2:Byte;Var name1,name2:String);
Const
     anzahl=40;
     Names:array[1..anzahl]Of String=('Sado Hussein','Aglibear','Mickey Graus',
     'Bill Gatesno?','Indy Jonas','Sly','Germinator','Uncle Bens','Nuclear Sam',
     'Wunibald','Duke Nukem','@xel','Harald Shit','Bazooka-Bill','James Blond',
     'Sinnlos 95','Patriot Patrick','Kamikaze Ken','Hulk Slogan','Iron R/\ver',
     'Pingu','Doomchen','Light Vader','Old Smashhand','Geisselpeter','Pepsi Max',
     'Major Tom','Captain Kirk','Globi','Rumpelstilzli','Harry Hirsch','Axel Fowley',
     'Wilhelm Tell','HÑgar','Lord Helmchen','G.Treepwood','A.Bernstein',
     'Rocki 5','Magic Ives','Slide');
     Rightusw:array[1..11]Of String=('Right','Up','Left','Down','Right Up',
     'Left Up','Left Down','Right Down','Select Down','Select Up','Shoot');
Var
     ax,ay:Integer;
     zeiger,p:Byte;ch:char;s:string;
     startgame:Boolean;
Label 30;
Begin
       nosound;
       Cleardevice;
         ax:=100;ay:=-20;zeiger:=1;startgame:=false;p:=1;punkte1:=0;punkte2:=0;
         If playagain='y' Then Begin
         gegner:='1';gamespeed:=5;name1:='Player1';name2:='Player2';End;
30:  Settextstyle(3,HorizDir,7);
     Setcolor(yellow);
     OuttextXY(ax,ay+40,'Options');
     SettextStyle(1,HorizDir,2);
     OuttextXY(ax,ay+150,'Opponent');
     OuttextXY(ax,ay+200,'Gamespeed(1-9) 1=fast, 9=slow');
     OuttextXY(ax,ay+250,'Name');
     OuttextXY(ax+100,ay+250,'1)');OuttextXY(ax+125,ay+250,name1);
     OuttextXY(ax+300,ay+250,'2)');OuttextXY(ax+325,ay+250,name2);
     OuttextXY(ax,ay+300,'Set Keyboard');
     OuttextXY(ax,ay+350,'Pc-Speaker:');
     If PcSpeaker Then OuttextXY(ax+127,ay+350,'On')
                  Else OuttextXY(ax+127,ay+350,'Off');
     OuttextXY(ax,ay+400,'Start Game');
     OuttextXY(ax,ay+450,'Exit to Dos');
  Repeat
  Setcolor(yellow);OuttextXY(ax-20,ay+100+zeiger*50,'Ø');{Zeiger malen}
                If gegner='1' Then OuttextXY(ax+200,ay+150,'(PC)');
                If gegner='2' Then OuttextXY(ax+200,ay+150,'(Player2)');
                str(gamespeed,s);OuttextXY(ax+400,ay+200,s);
  ch:=Readkey;
  startsound(Sounds[18],18,false); {Select}
  If PcSpeaker Then Begin sound(700);delay(20);nosound;End;
  Setcolor(0);OuttextXY(ax-20,ay+100+zeiger*50,'Ø');
     Case ch Of
       #80,'2':Begin inc(zeiger);If zeiger>7 Then zeiger:=1;End;
       #72,'8':Begin zeiger:=zeiger-1;If zeiger<1 Then zeiger:=7;End;
     End;{Of Case}

  If (ch=' ')Or(ch=#13)Then
     Case zeiger Of
        1:Begin Setfillstyle(0,0);Bar(ax+200,ay+150,ax+300,ay+180);
                If gegner='1' Then gegner:='2' Else gegner:='1';
          End;
        2:Begin Setfillstyle(0,0);Bar(ax+350,ay+200,ax+450,ay+230);
                MoveTo(ax+400,ay+200);Setcolor(lightred);
                str(gamespeed,s);OuttextXY(ax+400,ay+200,s);
                Repeat ch:=Readkey;
                If PcSpeaker Then Begin sound(700);delay(20);nosound;End;
                startsound(Sounds[18],18,false);
                If (ch=#80)Or(ch='2') Then inc(gamespeed);
                If (ch=#72)Or(ch='8') Then Dec(gamespeed);
                Setfillstyle(0,0);Bar(ax+350,ay+200,ax+450,ay+230);
                MoveTo(ax+400,ay+200);Setcolor(lightred);
                str(gamespeed,s);OuttextXY(ax+400,ay+200,s);
                Until (ch=' ')Or(ch=#13);
          End;
        3:Begin Setfillstyle(0,0);Bar(ax+120,ay+280,ax+285,ay+250);
                Setcolor(lightred);OuttextXY(ax+125,ay+250,name1);
                Repeat ch:=Readkey;
                If PcSpeaker Then Begin sound(700);delay(20);nosound;End;
                startsound(Sounds[18],18,false);
                If (ch=#80)Or(ch='2') Then inc(p);
                If (ch=#72)Or(ch='8') Then Dec(p);If p<1 Then p:=anzahl;
                If p>anzahl Then p:=1;
                Setfillstyle(0,0);Bar(ax+120,ay+280,ax+285,ay+250);
                Setcolor(lightred);
                OuttextXY(ax+125,ay+250,names[p]);
                Until (ch=' ')Or(ch=#13);
                Setcolor(yellow);
                OuttextXY(ax+125,ay+250,names[p]);
                name1:=names[p];
                Setfillstyle(0,0);Bar(ax+320,ay+280,ax+485,ay+250);
                Setcolor(lightred);OuttextXY(ax+325,ay+250,name2);
                Repeat ch:=Readkey;
                If PcSpeaker Then Begin sound(700);delay(20);nosound;End;
                startsound(Sounds[18],18,false);
                If (ch=#80)Or(ch='2') Then inc(p);
                If (ch=#72)Or(ch='8') Then Dec(p);If p<1 Then p:=anzahl;
                If p>anzahl Then p:=1;
                Setfillstyle(0,0);Bar(ax+320,ay+280,ax+485,ay+250);
                Setcolor(lightred);
                OuttextXY(ax+325,ay+250,names[p]);
                Until (ch=' ')Or(ch=#13);
                Setcolor(yellow);
                OuttextXY(ax+325,ay+250,names[p]);
                name2:=names[p];
          End;
        4:Begin Cleardevice;Setcolor(yellow);Setfillstyle(1,1);
          OuttextXY(100,50,name1);OuttextXY(320,50,name2);
          i:=1;
          For p:=1 To 22 Do Begin
          OuttextXY(ax,ay+70+i*30,Rightusw[i]);OuttextXY(ax+180,ay+70+i*30,steuerung[p]);
          steuerung[p]:=Readkey;startsound(Sounds[18],18,false);
          Bar(ax+170,ay+70+i*30,ax+200,ay+95+i*30);
          OuttextXY(ax+180,ay+70+i*30,steuerung[p]);
          Inc(i);If p=11 Then Begin i:=1;ax:=ax+220;End;
          End;
          ax:=100;
          Cleardevice;Goto 30;
          End;
        5:Begin
          Setfillstyle(1,0);Bar(ax+127,+ay+350,ax+200,ay+380);
          Setcolor(yellow);
          If PcSpeaker=false Then Begin
             PcSpeaker:=true;OuttextXY(ax+127,ay+350,'On');End
             Else Begin
             PcSpeaker:=false;OuttextXY(ax+127,ay+350,'Off');End;
          End;
        6:startgame:=true;
        7:Begin sbcmf_stop;closegraph;RestoreCrtMode;
          HighVideo;Textcolor(Red);GotoXY(30,10);
          Write('Wunibald lÑsst GrÅssen');
          startsound(Sounds[24],24,false);
          Repeat Until (VoiceCount=0)Or (Keypressed);
          Shutdown;
          Freemem(sndptr,soundfilesize);
          halt;
          End;
     End;{Of Case}

     ch:='k';{Wichtig}
  Until startgame;
Cleardevice;SetTextStyle(0,0,1);SetColor(white);{Normaleinstellung}
startsound(Sounds[10],10,false);
End;{Of Optionsmenu}
Procedure crashsnd;
Begin
      playsnd:=true;maxton:=40;tondauer:=1;
      For ton:=1 To maxton Do Begin
      snd[ton]:=random(400)+200;
      End;
      ton:=1;
End;{Of crashsnd}{spielt Crashsound}
Procedure writestand;    {Schreibt aktuellen Lebens und Shootstand}
Var
     lives,shoots,guntypus,maxgun,a:Integer;  {a=Abstand vom Rand}
     s:string;
Begin
     guntypus:=selectgun1;a:=30;lives:=live1;shoots:=shoot1;
     maxgun:=kanone1;
For i:=1 To 2 Do Begin
     Setlinestyle(0,0,1);
     Setcolor(White);
     Rectangle(a,5,a+152,10);Rectangle(a,12,a+152,17);   {Balken}
     Rectangle(a+156,5,a+168,17);                          {Quadrat}
     Rectangle(289,5,331,17);                            {Gewinnerpunkte}
     SetfillStyle(1,black);
     Bar(a+1,6,a+151,9);Bar(a+1,13,a+151,16);            {Balken}
     Bar(a+157,6,a+167,16);                                {Quadrat}
     Bar(a+170,6,a+220,16);                              {Extrawormanzeige}
     SetfillStyle(1,green);                               {Gewinnerpunkte}
     Bar(290,6,330,16);

     If lives<10 Then SetfillStyle(1,red);
     If (lives<20)And(lives>=10) Then SetfillStyle(1,yellow);
     If lives>=20 Then SetfillStyle(1,green);
     Bar(a+1,6,lives*3+(a+1),9);          {Lebensbalken}
     SetfillStyle(1,blue);                {Ammobalken}
     Bar(a+1,13,shoots*3+(a+1),16);

     Case guntypus Of
     1:Begin Setcolor(14);Line(a+157,11,a+167,11);End;
     2:Begin Setcolor(15);SetlineStyle(0,0,3);Line(a+157,11,a+167,11);End;
     3:Begin Setcolor(15);SetlineStyle(3,0,3);Line(a+157,11,a+167,11);End;
     4:Begin Setcolor(12);SetlineStyle(0,0,1);Line(a+157,11,a+167,11);End;
     5:Begin Setcolor(10);SetlineStyle(3,0,3);Line(a+157,11,a+167,11);End;
     6:Begin Setcolor(10);SetlineStyle(0,0,3);Line(a+157,11,a+167,11);
             Line(a+162,6,a+162,16);End;
     7:Begin Setcolor(12);SetlineStyle(0,0,3);Line(a+157,11,a+167,11);
             Line(a+162,6,a+162,16);Line(a+157,6,a+167,16);Line(a+157,16,a+167,6);End;
     8:Begin Setcolor(10);Circle(a+162,11,4);End;
     9:Begin Setcolor(14);Line(a+157,11,a+167,11);
             Line(a+162,6,a+162,16);Line(a+157,6,a+167,16);Line(a+157,16,a+167,6);End;
    10:Begin Setcolor(yellow);SetFillStyle(1,yellow);
             Pieslice(a+162,11,0,50,5);
             Pieslice(a+162,11,120,170,5);
             Pieslice(a+162,11,240,290,5);End;
     End;{Of Case}

     str(guntypus,s);Setcolor(White);OuttextXY(a+172,8,s);
     OuttextXY(a+183,8,':');                           {Selectgunanzeige}
     str(maxgun,s);OuttextXY(a+188,8,s);

     If (objekt<>i)And(extrawormlive>0)Then Begin       {Extrawormanzeige}                         {Extrawormanzeige}
     SetlineStyle(0,0,1);
     If ewormtyp=1 Then Setcolor(yellow)Else Setcolor(White);
     circle(a+208,11,5);
     str(extrawormlive,s);Setcolor(White);OuttextXY(a+205,8,s);End;



lives:=live2;shoots:=shoot2;a:=350;guntypus:=selectgun2;maxgun:=kanone2;
End;{Of For}
     Setcolor(Blue);
     SettextJustify(Centertext,Toptext);
     Str(punkte1,s);OuttextXY(300,8,s); {Gewinnerpunkte}
     OuttextXY(310,8,':');
     Str(punkte2,s);OuttextXY(320,8,s);
SetLineStyle(0,0,1);
     SettextJustify(Lefttext,Toptext);
End;{Of writestand}
Procedure boni(Var live1,kanone1,live2,kanone2,radius1,radius2,
                    movespeed1,movespeed2,shoot1,shoot2,getter:integer);
Var
     Trick,l,k,r,m,s:integer;{Zufall fÅr Speed oder Klein}
Begin
     If getter=1 Then Begin
     l:=live1;r:=radius1;m:=movespeed1;s:=shoot1;
       If bonus<>6 Then k:=kanone1 Else k:=kanone2;End;

     If getter=2 Then Begin
     l:=live2;r:=radius2;m:=movespeed2;s:=shoot2;
       If bonus<>6 Then k:=kanone2 Else k:=kanone1;End;

     r:=10;
     If bonus=1 Then l:=l+3;
     If(bonus=2)And(k<10) Then Begin k:=k+1;m:=1;End;
     If bonus=3 Then s:=s+5;
     If bonus=4 Then Begin m:=1;trick:=random(2);
        If trick=0 Then Begin r:=5;     {Schrumpfen}
          startsound(Sounds[20],20,false);
          playsnd:=true;maxton:=30;tondauer:=3;
          For ton:=1 To maxton Do Begin
          snd[ton]:=8000-ton*300;
          End;
        End
        Else Begin m:=2;
          startsound(Sounds[19],19,false);   {Schneller}
          playsnd:=true;maxton:=30;tondauer:=3;
          For ton:=1 To maxton Do Begin
          snd[ton]:=0+ton*300;
          End;
        End;
     End;
     If (bonus=5)And(k<10) Then Begin k:=k+2;m:=1;End;
        If k>10 Then k:=10;
     If (bonus=6)And(k>1) Then Begin
        If (getter=1)And(selectgun2=k) Then Begin
        selectgun2:=selectgun2-1;
        End;
        If (getter=2)And(selectgun1=k) Then Begin
        selectgun1:=selectgun1-1;
        End;
        k:=k-1;
     End;
     setcolor(0);For i:=0 To 5 Do circle(x3,y3,i);x3:=-10;y3:=-10;{Aus dem Bild}
          {Soundeffekte}
        If bonus<>4 Then Begin
          If getter=1 Then startsound(Sounds[6],6,false)
                      Else startsound(Sounds[8],8,false);
          playsnd:=true;maxton:=8;tondauer:=8;
          For ton:=1 To maxton Do Begin
          snd[ton]:=200+ton*25;
          End;
        End;
          ton:=1;

     writestand;

     If getter=1 Then Begin
     live1:=l;radius1:=r;movespeed1:=m;shoot1:=s;
     If bonus<>6 Then kanone1:=k Else kanone2:=k;
     End;
     If getter=2 Then Begin
     live2:=l;radius2:=r;movespeed2:=m;shoot2:=s;
     If bonus<>6 Then kanone2:=k Else kanone1:=k;
     End;
     getter:=0;
     If live1>50 Then live1:=50;If live2>50 Then live2:=50;  {Lebensgrenze}
     If shoot1>50 Then shoot1:=50;If shoot2>50 Then shoot2:=50;{Schussgrenze}
End;{Of Bonus}

Procedure Extrabonus(Var i3:LongInt;Var xextra,yextra,hextra,vextra:Integer);
Begin
         If i2 Mod 2000=0 Then Begin i3:=0;
         xextra:=random(560)+40;yextra:=random(370)+60;
         hextra:=random(3)-1;vextra:=random(3)-1;
         playsnd:=true;maxton:=7;tondauer:=10;
         For ton:=1 To maxton Do Begin
         snd[ton]:=300+ton*60;
         End;
         ton:=1;
         End;
     Setcolor(black);
     Circle(xextra,yextra,5);
     xextra:=xextra+hextra;
     yextra:=yextra+vextra;
     Setcolor(2);
     Circle(xextra,yextra,5);
     If i3 Mod 60=0 Then Begin
     hextra:=random(3)-1;vextra:=random(3)-1;
     If (hextra=0)And(vextra=0)Then hextra:=1; {Gegen Stillstand}
     End;   {Zufallsbewegung}

     If xextra>625-5 Then hextra:=-1;         {WANDGRENZE}
     If xextra<5+5 Then hextra:=1;
     If yextra<25+5 Then vextra:=1;
     If yextra>465-5 Then vextra:=-1;
     i3:=i3+1;
     If i3=500 Then Begin Setcolor(Black);Circle(xextra,yextra,5);i3:=0;End;
End;{Of Extrabonus}
Procedure winner(Var playagain:char;Var gamespeed,punkte1,punkte2:byte);
Var
     frequenz,xx,yy,circlex,circley:integer;
Begin
     If live1<1 Then Begin xx:=x1;yy:=y1;End;
     If live2<1 Then Begin xx:=x2;yy:=y2;End;
     SetlineStyle(0,0,1);
     startsound(Sounds[21],21,false);  {Endexplosion}
     For i:=1 To 500 Do Begin
     frequenz:=random(700);
     If PcSpeaker Then Begin sound(frequenz);delay(3);End;
     If i Mod 4=0 Then Begin
     circlex:=random(60)+xx-30;circley:=random(60)+yy-30;
     Setcolor(random(3)+12);
     Circle(circlex,circley,10);End;
     End;nosound;
     setcolor(white);

Settextjustify(Centertext,Centertext);
If live1<1 Then Begin OuttextXY(320,170,name2);Inc(punkte2);End;
If live2<1 Then Begin OuttextXY(320,170,name1);Inc(punkte1);End;
Settextjustify(Centertext,Centertext);
     OuttextXY(320,190,' wins');
Settextjustify(Centertext,Centertext);
     OuttextXY(320,230,'Playagain?(y/n)');
     Repeat
     If Keypressed Then playagain:=ReadKey;
     Until (playagain='y')Or(playagain='n');
If playagain='y'Then startsound(Sounds[10],10,false);
Settextjustify(Lefttext,Toptext);{Normal}
End;{Of winner}

Procedure cpumove(Var h2,v2:Integer;Var ch:Char);   {ZWEITES VAR WICHTIG}
Begin
                {Bewegungbringerzeile nach Zufall in gewissen ZeitabstÑnden}
     If i2 Mod 200=0 Then Begin h2:=random(3)-1;v2:=random(3)-1;End;

     If selectgun2<kanone2 Then Begin  {Beste Waffe selektieren}
        selectgun2:=kanone2;writestand;
        playsnd:=true;maxton:=6;tondauer:=7;
        For ton:=1 To maxton Do Begin
        If ton Mod 2=0 Then snd[ton]:=2000 Else snd[ton]:=20;
        End;
        ton:=1;
     End;
     If Objekt=2 Then Begin                       {ANGRIFF AUF EXTRAWORM}
        If (xextra>x2-5)And(xextra<x2+5) Then Begin
        h2:=0;If yextra>y2 Then v2:=1 Else v2:=-1;ch:=steuerung[22];
        End;
        If (yextra>y2-radius1)And(yextra<y2+radius1) Then Begin
        v2:=0;If xextra>x2 Then h2:=1 Else h2:=-1;ch:=steuerung[22];
        End;
     End;
     If (selectgun2>selectgun1)And(shoot2>0)And(shield1=0)
        And(selectgun2<>5)And(selectgun2<>10)Then Begin            {ANGRIFF}
        If (x1>x2-radius1)And(x1<x2+radius1) Then Begin
        h2:=0;If y1>y2 Then v2:=1 Else v2:=-1;ch:=steuerung[22];
        End;
        If (y1>y2-radius1)And(y1<y2+radius1) Then Begin
        v2:=0;If x1>x2 Then h2:=1 Else h2:=-1;ch:=steuerung[22];
        End;
     End;
     If (selectgun2=5)And(selectgun2>selectgun1)And(shoot2>0) Then Begin{SPEZIALANGRIFF BEI GUN 5}
        If (x1>x2-radius1)And(x1<x2+radius1) Then Begin
        h2:=0;If y1>y2 Then v2:=-1 Else v2:=1;ch:=steuerung[22];
        End;
        If (y1>y2-radius1)And(y1<y2+radius1) Then Begin
        v2:=0;If x1>x2 Then h2:=-1 Else h2:=1;ch:=steuerung[22];
        End;
        If objekt=2 Then Begin
           If (xextra>x2-5)And(xextra<x2+5) Then Begin
           h2:=0;If yextra>y2 Then v2:=-1 Else v2:=1;ch:=steuerung[22];
           End;
           If (yextra>y2-5)And(yextra<y2+5) Then Begin
           v2:=0;If xextra>x2 Then h2:=-1 Else h2:=1;ch:=steuerung[22];
           End;
        End;{Of If Objekt=2}
     End;
     If (selectgun2=8)And(selectgun2>selectgun1)And(shoot2>0)And(kugel2) {SPEZIALANGRIFF BEI GUN 8}
     Then Begin
        If xkugel2<x1 Then h2:=1 Else h2:=-1;
        If ykugel2<y1 Then v2:=1 Else v2:=-1;
     If Objekt=2 Then Begin                       {ANGRIFF AUF EXTRAWORM}
        If xkugel2<xextra Then h2:=1 Else h2:=-1;
        If ykugel2<yextra Then v2:=1 Else v2:=-1;
        End;
     End;
     If (selectgun2=10)And(selectgun2>selectgun1)And(shoot2>0) {SPEZIALANGRIFF BEI GUN 10}
     Then Begin
        If (y2+60>y1)And(y2-60<y1)And(x2+60>x1)And(x2-60<x1)Then ch:=steuerung[22];
        If (y2+60>yextra)And(y2-60<yextra)And(objekt=2)
        And(x2+60>xextra)And(x2-60<xextra)Then ch:=steuerung[22];{Attacke Extraworm}
     End;
     If (selectgun1<=selectgun2)Or(shoot2=0)Or(x3<>-10) Then Begin        {FLUCHT}
        If (v1=0)And(h1=1)And(y1-10<y2)And(y1+10>y2) Then v2:=1; {Gegner ist links}
        If (v1=0)And(h1=-1)And(y1-10<y2)And(y1+10>y2) Then v2:=1; {Gegner ist rechts}
        If (v1=1)And(h1=0)And(x1-10<x2)And(x1+10>x2) Then h2:=1; {Gegner ist oben}
        If (v1=-1)And(h1=0)And(x1-10<x2)And(x1+10>x2) Then h2:=1;; {Gegner ist unten}
     End;
     If (x3<>-10) Then Begin        {BONUSJAGD}
        If x2<x3 Then h2:=1 Else h2:=-1;
        If y2<y3 Then v2:=1 Else v2:=-1;
     End;
     If (i3>0)And(Objekt=0) Then Begin          {JAGD NACH EXTRAWORM}
        If x2<xextra Then h2:=1 Else h2:=-1;
        If y2<yextra Then v2:=1 Else v2:=-1;
     End;
        If x2>625-radius2 Then h2:=-1;         {WANDGRENZE}
        If x2<5+radius2 Then h2:=1;
        If y2<25+radius2 Then v2:=1;
        If y2>465-radius2 Then v2:=-1;
    If (h2=0)And(v2=0)Then v2:=1;{Kein Stehenbleiben}
End;{Of cpumove}

Procedure Schussablauf(Var live1,live2,shoot1,shoot2,radius1,radius2,
                           xextra,yextra,extrawormlive,objekt,shooter:Integer;
                           Var cdown1,cdown2,i3,shield1,shield2:LongInt;Var ewa,playsnd:boolean);
Var
     x4,y4,h4,v4,guntyp,live,shoot,radius,x,y,h,v:Integer;
     treffer,extratreffer:boolean;
Begin
     If (ch=steuerung[11])And (Not ewa)And(kugel1=false)And(shooter<>2) Then Begin
        If selectgun1<8 Then Begin cdown1:=10;shoot1:=shoot1-1;End;
     x4:=x1;y4:=y1;h4:=h1;v4:=v1;guntyp:=selectgun1;End;
     If (ch=steuerung[22])And(Not ewa)And(kugel2=false)And(shooter<>1) Then Begin
        If selectgun2<8 Then Begin cdown2:=10;shoot2:=shoot2-1;
        If gegner='1' Then cdown2:=20;End;
     x4:=x2;y4:=y2;h4:=h2;v4:=v2;guntyp:=selectgun2;End;
        If (gegner='1')And(selectgun2>8)Then cdown2:=60;{cdown fÅr gun 10}

     treffer:=false;

     If ewa Then Begin x4:=xextra;y4:=yextra;h4:=hextra;v4:=vextra;
     guntyp:=ewormtyp;End;    {ExtrawormSchuss}
     If (extrawormlive<1)And(objekt<>0)Then Begin
     x4:=xextra;y4:=yextra;guntyp:=7;radius:=10;{Kompromiss}
     End;   {Explosion beim Tod vom Extraworm}

   Case guntyp Of
   1:Begin Setcolor(14);line(x4,y4,x4+680*h4,y4+680*v4);delay(20);
           startsound(Sounds[17],17,false);
           playsnd:=true;maxton:=22;tondauer:=2;
           For ton:=1 To maxton Do Begin
           snd[ton]:=1200-ton*15;
           End;
           ton:=1;
     End;
   2:Begin Setcolor(15);SetLineStyle(0,0,3);line(x4,y4,x4+680*h4,y4+680*v4);delay(20);
           playsnd:=true;maxton:=18;tondauer:=3;
           startsound(Sounds[0],0,false);
           For ton:=1 To maxton Do Begin
           snd[ton]:=800-ton*17;
           End;
           ton:=1;
     End;
   3:Begin Setcolor(15);SetLineStyle(3,0,3);line(x4,y4,x4+680*h4,y4+680*v4);delay(10);
           startsound(Sounds[12],12,false);
           playsnd:=true;maxton:=60;tondauer:=1;
           For ton:=1 To maxton Do Begin
           If ton-((ton Div 10)*10)<4 Then snd[ton]:=random(50)+450 Else snd[ton]:=50;
           End;
           ton:=1;
     End;
   4:Begin Setcolor(12);SetlineStyle(0,0,1);
           line(x4,y4,x4+680*h4,y4+680*v4);line(x4,y4,x4+680*-h4,y4+680*-v4);delay(10);
           startsound(Sounds[1],1,false);
           playsnd:=true;maxton:=54;tondauer:=1;
           For ton:=1 To maxton Do Begin
           snd[ton]:=10000-ton*112;
           End;
           ton:=1;
     End;
   5:Begin Setcolor(10);SetlineStyle(3,0,3);
           line(x4,y4,x4+680*-h4,y4+680*-v4);delay(10);
           startsound(Sounds[2],2,false);
           playsnd:=true;maxton:=20;tondauer:=3;
           For ton:=1 To maxton Do Begin
           snd[ton]:=200+random(200)-100;
           End;
           ton:=1;
     End;
   6:Begin Setcolor(10);SetlineStyle(0,0,3);
           line(x4,y4,629,y4);line(x4,y4,1,y4);
           line(x4,y4,x4,469);line(x4,y4,x4,21);delay(10);
           startsound(Sounds[1],1,false);
           playsnd:=true;maxton:=25;tondauer:=2;
           For ton:=1 To maxton Do Begin
           snd[ton]:=300+ton*random(100);
           End;
           ton:=1;
     End;
   7:Begin Setcolor(12);SetlineStyle(0,0,3);
     line(x4,y4,629,245);line(x4,y4,1,245);
     line(x4,y4,315,469);line(x4,y4,315,21);
     line(x4,y4,629,21);line(x4,y4,1,21);
     line(x4,y4,629,469);line(x4,y4,1,469);delay(10);
     startsound(Sounds[3],3,false);
           playsnd:=true;maxton:=25;tondauer:=2;
           For ton:=1 To maxton Do Begin
           snd[ton]:=100+random(100)+ton*30;
           End;
           ton:=1;
     End;
   8:Begin If (ch=steuerung[11])And(cdown1<1)Then kugel1:=true;
           If (ch=steuerung[22])And(cdown2<1)Then kugel2:=true;
           startsound(Sounds[4],4,false);
           playsnd:=true;maxton:=18;tondauer:=3;
           For ton:=1 To maxton Do Begin
           snd[ton]:=7000-ton*180;
           End;
           ton:=1;
     End;
   9:Begin If (ch=steuerung[11])And(knallerballer=false)Then Begin
           shooter:=1;shoot1:=shoot1-1;End;
           If (ch=steuerung[22])And(knallerballer=false)Then Begin
           shooter:=2;shoot2:=shoot2-1;End;
           If (ch=steuerung[11])And(knallerballer=false)Or(ch=steuerung[22])And(knallerballer=false)
           Then Begin
               startsound(Sounds[14],14,false);
               playsnd:=true;maxton:=99;tondauer:=1;
               For ton:=1 To maxton Do Begin
               If ton-((ton Div 10)*10)<5 Then snd[ton]:=500 Else snd[ton]:=400;
               End;
               ton:=1;
           End;
     Knallerballer:=true;

     End;
   10:Begin If (ch=steuerung[11])And(knallerballer2=false)Then Begin
            shooter2:=1;shoot1:=shoot1-1;
            xslice:=x1;yslice:=y1;End;
            If (ch=steuerung[22])And(knallerballer2=false)Then Begin
            shooter2:=2;shoot2:=shoot2-1;
            xslice:=x2;yslice:=y2;End;
            If (ch=steuerung[11])And(knallerballer2=false)Or(ch=steuerung[22])And(knallerballer2=false)
            Then Begin
               startsound(Sounds[5],5,false);
               playsnd:=true;maxton:=60;tondauer:=1;
               For ton:=1 To maxton Do Begin
               snd[ton]:=4000-ton*70;
               End;
               ton:=1;
            End;
      knallerballer2:=true;
     End;
   End;{Of Case}

If ch=steuerung[11] Then Begin live:=live2;shoot:=shoot1;radius:=radius2;
                     x:=x2;y:=y2;h:=h2;v:=v2;End;
If ch=steuerung[22] Then Begin live:=live1;shoot:=shoot2;radius:=radius1;
                     x:=x1;y:=y1;h:=h1;v:=v1;End;
If (ch=steuerung[22])And(shield1<1)Or(ch=steuerung[11])And(shield2<1)Then Begin
For i:=-radius To radius Do Begin
   If (Getpixel(x,y+i)=14)Or(Getpixel(x+i,y)=14)Or
   (Getpixel(x,y+i)=15)Or(Getpixel(x+i,y)=15)Or
   (Getpixel(x,y+i)=10)Or(Getpixel(x+i,y)=10)Or
   (Getpixel(x,y+i)=12)Or(Getpixel(x+i,y)=12)
   Then {Gelb,Weiss,HellgrÅn,hellrot}
   Treffer:=true;End;{Of For}
   If (treffer)Then Begin
      Case guntyp Of
   1,9,10: live:=live-1;
   2,6  : live:=live-2;
   3    : Begin live:=live-2;If ch=steuerung[11]Then Begin h:=h1;v:=v1;End;
                             If ch=steuerung[22]Then Begin h:=h2;v:=v2;End;End;
   4    : Begin live:=live-1;x:=random(560)+40;y:=random(370)+60;End;
   5    : Begin live:=live-2;radius:=radius+5;End;
   7    : live:=live-3;

   End;{Of Case}

If ch=steuerung[11] Then Begin live2:=live;shoot1:=shoot;radius2:=radius;
                     x2:=x;y2:=y;h2:=h;v2:=v;End;
If ch=steuerung[22] Then Begin live1:=live;shoot2:=shoot;radius1:=radius;
                     x1:=x;y1:=y;h1:=h;v1:=v;End;
   treffer:=false;
   crashsnd;startsound(Sounds[15],15,false);
            If guntyp=9 Then startsound(Sounds[7],7,false);
   End;{Of If Treffer}
End;{Of If shield}
     extratreffer:=false;
If (Not ewa)And(xextra<>-10)Then Begin
For i:=-5 To 5 Do Begin    {EXTRABONUSTEST}
     If (Getpixel(xextra,yextra+i)=14)Or(Getpixel(xextra+i,yextra)=14)Or
     (Getpixel(xextra,yextra+i)=15)Or(Getpixel(xextra+i,yextra)=15)Or
     (Getpixel(xextra,yextra+i)=10)Or(Getpixel(xextra+i,yextra)=10)Or
     (Getpixel(xextra,yextra+i)=12)Or(Getpixel(xextra+i,yextra)=12)
     Then Begin extratreffer:=true;If (ch=steuerung[11])And((objekt=0)Or(objekt=2))
                                   Then Begin
                                   shield1:=1000;startsound(Sounds[11],11,false);End;
                                   If (ch=steuerung[22])And((objekt=0)Or(objekt=1))
                                   Then Begin
                                   shield2:=1000;startsound(Sounds[11],11,false);End;
                                   End;
End;{Of For}
     If extratreffer Then Begin
     Case guntyp Of
          1,4,9,10:extrawormlive:=extrawormlive-1;
          2,3,5,6:extrawormlive:=extrawormlive-2;
          7:extrawormlive:=extrawormlive-3;
     End;{Of Case}
        crashsnd;startsound(Sounds[15],15,false);
     End;{Of Then Begin}

End;{Of If Not ewa}


         {PUTZLAPPEN}
Setcolor(black);
Case guntyp Of
1,2,3:Begin
      line(x4,y4,x4+680*h4,y4+680*v4);
      End;
4    :Begin
      line(x4,y4,x4+680*h4,y4+680*v4);
      line(x4,y4,x4+680*-h4,y4+680*-v4);
      End;
5    :Begin
      line(x4,y4,x4+680*-h4,y4+680*-v4);
      End;
6    :Begin
      line(x4,y4,629,y4);line(x4,y4,1,y4);
      line(x4,y4,x4,469);line(x4,y4,x4,21);
      End;
7    :Begin
      line(x4,y4,629,245);line(x4,y4,1,245);
      line(x4,y4,315,469);line(x4,y4,315,21);
      line(x4,y4,629,21);line(x4,y4,1,21);
      line(x4,y4,629,469);line(x4,y4,1,469);
      End;
End;{Of Case}
      If live1<0 Then live1:=0;If live2<0 Then live2:=0;

SetlineStyle(0,0,1);
If (extratreffer)And(xextra<>-10)And(objekt=0)
     Then Begin extratreffer:=false;
     i3:=0;Setcolor(black);Circle(xextra,yextra,5);xextra:=-10;
     End;     {Lîscht letzten Kreis vom toten Extrabonus}
End;{Of Schussablauf}

Procedure Extraworm(Var objekt:integer;Var ewa:boolean;Var Extracdown:LongInt);
Var
      xobjekt,yobjekt,robjekt:Integer;    {robjekt=radius}
Begin
      extracdown:=extracdown-1;  {Verzoegerung}
      If objekt=2 Then Begin xobjekt:=x2;yobjekt:=y2;robjekt:=radius2;End;
      If objekt=1 Then Begin xobjekt:=x1;yobjekt:=y1;robjekt:=radius2;End;

      If i2 Mod 80=0 Then Begin hextra:=random(3)-1;
                                vextra:=random(3)-1;
         If (hextra=0)And(vextra=0)Then hextra:=1; {Gegen Stillstand}
      End;
      If xextra>625-5 Then hextra:=-1;         {WANDGRENZE}
      If xextra<5+5 Then hextra:=1;
      If yextra<25+5 Then vextra:=1;
      If yextra>465-5 Then vextra:=-1;

      If objekt=1 Then Setcolor(random(5));     {Zeichnet Extraworm}
      If objekt=2 Then Setcolor(random(5)+5);
      Circle(xextra,yextra,5);
      xextra:=xextra+hextra;yextra:=yextra+vextra;

      ewa:=false;

      If (xobjekt>xextra-robjekt)And(xobjekt<xextra+robjekt)
      And(extracdown<1)Then Begin
      hextra:=0;If yobjekt>yextra Then vextra:=1 Else vextra:=-1;
      ewa:=true;extracdown:=40;
      If objekt=1 Then ch:=steuerung[22];
      If objekt=2 Then ch:=steuerung[11];
      End;
      If (yobjekt>yextra-robjekt)And(yobjekt<yextra+robjekt)
      And(extracdown<1) Then Begin
      vextra:=0;If xobjekt>xextra Then hextra:=1 Else hextra:=-1;ch:=steuerung[22];
      ewa:=true;extracdown:=40;
      If objekt=1 Then ch:=steuerung[22];
      If objekt=2 Then ch:=steuerung[11];
      End;
      If (extrawormlive<1)And(Objekt<>0) Then Begin {Tod v. Extraworm}
      Schussablauf(live1,live2,shoot1,shoot2,radius1,radius2,
                   xextra,yextra,extrawormlive,objekt,shooter,cdown1,cdown2,i3,
                   shield1,shield2,ewa,playsnd);
                         ewa:=false;objekt:=0;xextra:=-10;yextra:=-10;
                         writestand;End;
End;{Of Extraworm}
Procedure Plasmakugel(Var live1,live2,extrawormlive,
                          xkugel1,ykugel1,xkugel2,ykugel2:Integer;
                          Var shield1,shield2,cdown1,cdown2,i3:LongInt;
                          Var kugel1,kugel2:boolean);
Var
   xkgl,ykgl,hkgl,vkgl,shld,ii:Integer;
   kgl:boolean;
Begin
      If (ch=steuerung[11])And(cdown1<1)Then Begin
         xkugel1:=x1+radius1*h1+h1*9;  {Radiusplasmakugel=7,Sicherheitsabstand=2}
         ykugel1:=y1+radius1*v1+v1*9;  {Radiusplasmakugel=7,Sicherheitsabstand=2}
         cdown1:=200;
      End;
      If (ch=steuerung[22])And(cdown2<1)Then Begin
         xkugel2:=x2+radius2*h2+h2*9;  {Radiusplasmakugel=7,Sicherheitsabstand=2}
         ykugel2:=y2+radius2*v2+v2*9;  {Radiusplasmakugel=7,Sicherheitsabstand=2}
         cdown2:=200;
      End;
   If kugel1 Then Begin
      xkgl:=xkugel1;ykgl:=ykugel1;vkgl:=v1;hkgl:=h1;kgl:=kugel1;shld:=shield1;
   End;
For ii:=1 To 2 Do Begin
   If (ii=1)And(kugel1)Or(ii=2)And(kugel2)Then Begin
      SetlineStyle(0,0,1);
      Setcolor(black);Circle(xkgl,ykgl,7);
      xkgl:=xkgl+4*hkgl;
      ykgl:=ykgl+4*vkgl;
      Setcolor(yellow);Circle(xkgl,ykgl,7);
If   (x1>xkgl-(radius1+7))And(x1<xkgl+(radius1+7))And
     (y1>ykgl-(radius1+7))And(y1<ykgl+(radius1+7))And(shield1<1)Then Begin
     live1:=live1-3;kgl:=false;
     Setcolor(black);Circle(xkgl,ykgl,7);
     If live1<0 Then live1:=0;
     writestand;End;
If   (x2>xkgl-(radius2+7))And(x2<xkgl+(radius2+7))And
     (y2>ykgl-(radius2+7))And(y2<ykgl+(radius2+7))And(shield2<1)Then Begin
     live2:=live2-3;kgl:=false;
     Setcolor(black);Circle(xkgl,ykgl,7);
     If live2<0 Then live2:=0;
     writestand;End;
If   (xextra>xkgl-(5+7))And(xextra<xkgl+(5+7))And
     (yextra>ykgl-(5+7))And(yextra<ykgl+(5+7))Then Begin
     If objekt>0 Then
        extrawormlive:=extrawormlive-3
     Else Begin shld:=1000;i3:=0;Setcolor(black);
     Circle(xextra,yextra,5);End;
     kgl:=false;
     Setcolor(black);Circle(xkgl,ykgl,7);
     writestand;
     End;
If (xkgl>630-7)Or(xkgl<0+7)Or   {Wandtest}
     (ykgl<20+7)Or(ykgl>470-7)Then Begin
     Setcolor(black);Circle(xkgl,ykgl,7);
     Setcolor(white);
     Rectangle(0,20,630,470);
     kgl:=false;End;
   If ii=1 Then Begin {Neue Koordinaten Åbergeben}
      xkugel1:=xkgl;ykugel1:=ykgl;kugel1:=kgl;shield1:=shld;
   End;
   If ii=2 Then Begin
      xkugel2:=xkgl;ykugel2:=ykgl;kugel2:=kgl;shield2:=shld;
   End;
If cdown1<1 Then kugel1:=false;
If cdown2<1 Then kugel2:=false;
       If (kugel1=false)And(ii=1) Then Begin
          cdown1:=0;Setcolor(black);
          Circle(xkgl,ykgl,7);End;
       If (kugel2=false)And(ii=2) Then Begin
          If gegner='2'Then cdown2:=0;Setcolor(black);
          Circle(xkgl,ykgl,7);End;
          If (kugel1=false)And(ii=1)Or(kugel2=false)And(ii=2)
             Then Begin crashsnd;startsound(Sounds[16],16,false);End;
   End;{Of If}
   If kugel2 Then Begin
      xkgl:=xkugel2;ykgl:=ykugel2;vkgl:=v2;hkgl:=h2;kgl:=kugel2;shld:=shield2;
   End;
End;{Of For}

End;{Of Plasmakugel}

Procedure gun9(Var xend,yend,rand,xstart,ystart:Integer;
              Var ch:char;Var Knallerballer:boolean;Var gamespeed:byte);
Begin

   Setcolor(Black);Line(xstart,ystart,xend,yend);
   If ch=steuerung[11]Then Begin xstart:=x1;ystart:=y1;End;
   If ch=steuerung[22]Then Begin xstart:=x2;ystart:=y2;End;

   If rand=1 Then Begin yend:=yend+30;If yend>469 Then Begin
   yend:=469;rand:=2;End;End;
   If rand=2 Then Begin xend:=xend+30;If xend>629 Then Begin
   xend:=629;rand:=3;End;End;
   If rand=3 Then Begin yend:=yend-30;If yend<21 Then Begin
   yend:=21;rand:=4;End;End;
   If rand=4 Then Begin xend:=xend-30;
      If xend<1 Then Begin
      xend:=1;knallerballer:=false;rand:=1;ch:='k';
      End;
    End;

   Setcolor(yellow);Line(xstart,ystart,xend,yend);
   If knallerballer=false Then Begin shooter:=0;ton:=maxton-1; {Putzt letzten Schuss}
   Setcolor(Black);Line(xstart,ystart,xend,yend);End;
End;{Of gun9}
Procedure gun10(Var StAngle,xslice,yslice:Integer;Var knallerballer2:boolean;
                Var ch:char;Var gamespeed:byte);
Begin

   Setcolor(Black);SetFillStyle(1,Black);
   Pieslice(xslice,yslice,StAngle,StAngle+30,50);
   Pieslice(xslice,yslice,StAngle+120,StAngle+150,50);
   Pieslice(xslice,yslice,StAngle+240,StAngle+270,50);
   If ch=steuerung[11]Then Begin xslice:=x1;yslice:=y1;End;
   If ch=steuerung[22]Then Begin xslice:=x2;yslice:=y2;End;
   StAngle:=StAngle+30;
   Setcolor(yellow);SetFillStyle(1,yellow);
   Pieslice(xslice,yslice,StAngle,StAngle+30,50);
   Pieslice(xslice,yslice,StAngle+120,StAngle+150,50);
   Pieslice(xslice,yslice,StAngle+240,StAngle+270,50);
   Setcolor(Black);
   Setfillstyle(1,Black);
   Pieslice(xslice,yslice,0,360,15);
   Setcolor(yellow);
   Setfillstyle(1,yellow);
   Pieslice(xslice,yslice,0,360,8);
   Line(xslice,yslice,xslice+10,yslice);{FÅllt Rest aus}
       If StAngle>360 Then Begin
       Setcolor(Black);SetFillStyle(1,Black);
       Pieslice(xslice,yslice,StAngle,StAngle+30,50);
       Pieslice(xslice,yslice,StAngle+120,StAngle+150,50);
       Pieslice(xslice,yslice,StAngle+240,StAngle+270,50);
       ch:='k';knallerballer2:=false;StAngle:=0;
       shooter:=0; {Putzt letzten Schuss}
       End;
End;{Of Gun10}
Procedure fx(Var ton:Integer;Var playsnd:boolean);
Begin
If PcSpeaker Then Begin
   sound(snd[ton]);
   ton:=ton+1;
   If ton=maxton Then Begin playsnd:=false;nosound;End;
End;
End;{Of fx}
Procedure loadsound(name:string);
Var cmfdatei:file;

Begin
assign(cmfdatei,name);reset(cmfdatei,1);
soundfilesize:=FileSize(cmfdatei);
Getmem(sndptr,soundfilesize);
Blockread(cmfdatei,sndptr^,soundfilesize);
close(cmfdatei);
End;
Procedure cheat(Var live1,live2,shoot1,shoot2,
                    kanone1,kanone2:Integer;Var shield1,shield2:LongInt);
Begin
   If name1='Wunibald'Then Begin
   live1:=50;shoot1:=50;kanone1:=10;shield1:=2000;End;
   If name2='Wunibald'Then Begin
   live2:=50;shoot2:=50;kanone2:=10;shield2:=2000;End;
   If (name1='Wunibald')Or(name2='Wunibald')Then Begin             Writestand;
       SettextJustify(Centertext,Centertext);
       SettextStyle(1,0,6);
   For i:=1 To 30 Do Begin
     Setcolor(White);OuttextXY(320,240,'Cheat Activated');
     Setcolor(Black);OuttextXY(320,240,'Cheat Activated');
     sound(100+i*70);
   End;{Of For}
      nosound;
      SettextJustify(Lefttext,Toptext);
      SettextStyle(0,0,1);
   End;{Of If}
End;{Of cheat}
Begin    {***HAUPTPROGRAMM***}

  Gd := 0; InitGraph(Gd, Gm,'c:\adi\tp7\bgi');
  if GraphResult <> grOk then Halt(1);
{*******FX Initialisieren********}
GetSettings(BaseIO, IRQ, DMA, DMA16);
InitSB(BaseIO, IRQ, DMA, DMA16);
InitXMS;
if SharedEMB then InitSharing;
FXInit('cw2snd.SND',12);{FX}
{*******************************}
 Title;
 SettextJustify(Lefttext,Toptext);
 playagain:='y';
20:
 Optionsmenu(gegner,gamespeed,punkte1,punkte2,name1,name2);
10:
  Randomize;
Setcolor(white);
Rectangle(0,20,630,470);
  playagain:='x';
  live1:=30;live2:=30;
  extrawormlive:=0;
  shoot1:=35;shoot2:=35;
  kanone1:=1;kanone2:=1;
  selectgun1:=1;selectgun2:=1;
writestand;
  radius1:=10;radius2:=10;
  x1:=54;x2:=576;
  y1:=54;y2:=416;
  h1:=1;h2:=-1;
  v1:=1;v2:=-1;
  movespeed1:=1;movespeed2:=1;
  shield1:=0;shield2:=0;
  i:=0;i2:=0;i3:=0;
  x3:=-10;y3:=-10;
  xextra:=-10;yextra:=-10;
  cdown1:=0;cdown2:=0;
  objekt:=0;
  ewa:=false;kugel1:=false;kugel2:=false;wechselbonus:=false;
  knallerballer:=false;xend:=1;yend:=21;rand:=1;shooter:=0;{FÅr gun9}
  knallerballer2:=false;shooter2:=0;{FÅr Gun10}
  ch:='k';
  loadsound('sbpro3.cmf');
  {sbcmf_play(sndptr);sbcmf_silence(5);}
                        {WIEDERHOLUNGSSCHLAUFE}
Repeat
    cdown1:=cdown1-1;cdown2:=cdown2-1;   {Ladehemmung}
    i2:=i2+1;     {Dauer fÅr neuen Bonus}
    If shield1>0 Then shield1:=shield1-1;
    If shield2>0 Then shield2:=shield2-1;
If (i2 Mod 600=0)Or(Wechselbonus)And(i2 Mod 10=0) Then Begin
    If i2 Mod 600=0 Then Begin
           startsound(Sounds[9],9,false);
           playsnd:=true;maxton:=11;tondauer:=3;
           For ton:=1 To maxton Do Begin
           snd[ton]:=360+ton*40;
           End;
           ton:=1;
       wechselbonus:=false;End;{Of If}
    If Not wechselbonus Then Begin
    setcolor(0);For i:=0 To 5 Do circle(x3,y3,i);
    x3:=random(620)+6;y3:=random(440)+26;End;
    bonus:=random(7)+1;
    If wechselbonus Then bonus:=random(6)+1;
  Case bonus Of
  1:Setcolor(10);
  2:Setcolor(15);
  3:Setcolor(9);
  4:Setcolor(7);
  5:Setcolor(13);
  6:Setcolor(14);
  7:Begin wechselbonus:=true;Setcolor(10);End;
  End;{Of Case}
  For i:=0 To 5 Do Circle(x3,y3,i);{Zeichnet Bonus}
End;

If (i2 Mod 2000=0)And(objekt=0)Or(i3<500)And(i3>0)And(objekt=0) Then
Extrabonus(i3,xextra,yextra,hextra,vextra);
If i2 Mod 1500=0 Then Begin
   If VoiceCount=0 Then Begin
                  rnd:=Random(Maxspeech)+23;{Sprachsound1=Nr23}
                  startsound(Sounds[rnd],rnd,false);
                  End;

End; {Sprachausgabe}



If i2 Mod 1000=0 Then Begin
   ClearDevice;Setcolor(white);Rectangle(0,20,630,470);
  Case bonus Of
  1:Setcolor(10);
  2:Setcolor(15);
  3:Setcolor(9);
  4:Setcolor(7);
  5:Setcolor(13);
  6:Setcolor(14);
  End;{Of Case}
     For i:=0 To 5 Do Circle(x3,y3,i);
        writestand;         {Neuaufbau des Bildschirms};
End;

If Keypressed Then ch:=Readkey;
   If ch='C' Then
   cheat(live1,live2,shoot1,shoot2,kanone1,kanone2,shield1,shield2);
If ch='m'Then If bkmusic Then Begin sbcmf_stop;bkmusic:=false;End
                         Else Begin sbcmf_play(sndptr);bkmusic:=true;End;
If ch=steuerung[1]Then Begin h1:=1;v1:=0;End;
If ch=steuerung[2]Then Begin h1:=0;v1:=-1;End;
If ch=steuerung[3]Then Begin h1:=-1;v1:=0;End;
If ch=steuerung[4]Then Begin h1:=0;v1:=1;End;
If ch=steuerung[5]Then Begin h1:=1;v1:=-1;End;
If ch=steuerung[6]Then Begin h1:=-1;v1:=-1;End;
If ch=steuerung[7]Then Begin h1:=-1;v1:=1;End;
If ch=steuerung[8]Then Begin h1:=1;v1:=1;End;
If (ch=steuerung[9])Or(ch=steuerung[10]) Then Begin
        playsnd:=true;maxton:=6;tondauer:=7;
        For ton:=1 To maxton Do Begin
        If ton Mod 2=0 Then snd[ton]:=2000 Else snd[ton]:=20;
        End;
        ton:=1;
        If (selectgun1=1)And(ch=steuerung[9])Or
           (selectgun1=kanone1)And(ch=steuerung[10])Then Begin  {SperrgerÑusch}
              playsnd:=true;maxton:=42;tondauer:=1;
              For ton:=1 To maxton Do Begin
              If ton Mod 2=0 Then snd[ton]:=200 Else snd[ton]:=250;
              End; 
              ton:=1;
        End Else startsound(Sounds[18],18,false);
        If (selectgun1>1)And(ch=steuerung[9])Then selectgun1:=selectgun1-1;
        If (selectgun1<kanone1)And(ch=steuerung[10])Then selectgun1:=selectgun1+1;

        writestand;
        End;
If Keypressed Then ch:=Readkey;
If gegner='2' Then Begin
If ch=steuerung[12]Then Begin h2:=1;v2:=0;End;
If ch=steuerung[13]Then Begin h2:=0;v2:=-1;End;
If ch=steuerung[14]Then Begin h2:=-1;v2:=0;End;
If ch=steuerung[15]Then Begin h2:=0;v2:=1;End;
If ch=steuerung[16]Then Begin h2:=1;v2:=-1;End;
If ch=steuerung[17]Then Begin h2:=-1;v2:=-1;End;
If ch=steuerung[18]Then Begin h2:=-1;v2:=1;End;
If ch=steuerung[19]Then Begin h2:=1;v2:=1;End;
If (ch=steuerung[20])Or(ch=steuerung[21])Then Begin
        playsnd:=true;maxton:=6;tondauer:=7;
        For ton:=1 To maxton Do Begin
        If ton Mod 2=0 Then snd[ton]:=2000 Else snd[ton]:=20;
        End;
        ton:=1;
        If (selectgun2=1)And(ch=steuerung[21])Or
           (selectgun2=kanone2)And(ch=steuerung[20])Then Begin  {SperrgerÑusch}
              playsnd:=true;maxton:=42;tondauer:=1;
              For ton:=1 To maxton Do Begin
              If ton Mod 2=0 Then snd[ton]:=200 Else snd[ton]:=250;
              End;
              ton:=1;
        End;
        If (selectgun2>1)And(ch=steuerung[21])Then selectgun2:=selectgun2-1;
        If (selectgun2<kanone2)And(ch=steuerung[20])Then selectgun2:=selectgun2+1;
        writestand;
        End;
End;{Of If gegner}

    IF gegner='1' THEN cpumove(h2,v2,ch);

     {Wird Extraworm geholt?}
If   (i3<500)And(i3>0)And(objekt=0) Then Begin
If   (x1>xextra-(radius1+5))And(x1<xextra+(radius1+5))And
     (y1>yextra-(radius1+5))And(y1<yextra+(radius1+5))Then Begin
     objekt:=2;i3:=0;extrawormlive:=3;ewormtyp:=random(2)+1;
           startsound(Sounds[22],22,false);
           playsnd:=true;maxton:=8;tondauer:=4;
           For ton:=1 To maxton Do Begin
           snd[ton]:=100+ton*40;
           End;
           ton:=1;
     writestand;End;
If   (x2>xextra-(radius2+5))And(x2<xextra+(radius2+5))And
     (y2>yextra-(radius2+5))And(y2<yextra+(radius2+5))Then Begin
     objekt:=1;i3:=0;extrawormlive:=3;ewormtyp:=random(2)+1;
           startsound(Sounds[22],22,false);
           playsnd:=true;maxton:=9;tondauer:=8;
           For ton:=1 To maxton Do Begin
           snd[ton]:=350+ton*50;
           End;
           ton:=1;
     writestand;End;
End;

If objekt<>0 Then Extraworm(objekt,ewa,Extracdown);

If knallerballer Then Begin  {gun9}
   If shooter=1 Then ch:=steuerung[11];
   If shooter=2 Then ch:=steuerung[22];
   gun9(xend,yend,rand,xstart,ystart,ch,knallerballer,gamespeed);End;
If knallerballer2 Then Begin  {gun10}
   If shooter2=1 Then ch:=steuerung[11];
   If shooter2=2 Then ch:=steuerung[22];
   gun10(StAngle,xslice,yslice,knallerballer2,ch,gamespeed);End;

If (ch=steuerung[11])And(shoot1>0)And(cdown1<1)Or(ch=steuerung[22])And(shoot2>0)And(cdown2<1)
Or(ewa)Or(knallerballer)Or(knallerballer2)
Then Begin Schussablauf(live1,live2,shoot1,shoot2,radius1,radius2,
                        xextra,yextra,extrawormlive,objekt,shooter,cdown1,
                        cdown2,i3,shield1,shield2,ewa,playsnd);
           writestand;End;
If (kugel1)Or(kugel2)Then
     Plasmakugel(live1,live2,extrawormlive,xkugel1,ykugel1,xkugel2,ykugel2,
                          shield1,shield2,cdown1,cdown2,i3,kugel1,kugel2);

   If (knallerballer=false)And(knallerballer2=false)
   Then ch:='’';{Sehr Wichtig!!!}

If (x1>630-radius1)Or(x1<0+radius1)Then Begin  {Wandtest}
   h1:=h1*-1;If x1>630-radius1 Then x1:=630-radius1;
             If x1<0+radius1 Then x1:=0+radius1;
             If shield1<1 Then live1:=live1-5;
             If live1<0 Then live1:=0;
   writestand;End;
If (y1<20+radius1)Or(y1>470-radius1)Then Begin
   v1:=v1*-1;If shield1<1 Then live1:=live1-5;
             If y1<20+radius1 Then y1:=20+radius1;
             If y1>470-radius1 Then y1:=470-radius1;
             If live1<0 Then live1:=0;
   writestand;End;

If (x2>630-radius2)Or(x2<0+radius2)Then Begin
   h2:=h2*-1;If x2>630-radius2 Then x2:=630-radius2;
             If x2<0+radius2 Then x2:=0+radius2;
   x2:=x2+h2;If shield2<1 Then live2:=live2-5;
             If live2<0 Then live2:=0;
   writestand;End;
If (y2<20+radius2)Or(y2>470-radius2)Then Begin
   v2:=v2*-1;If shield2<1 Then live2:=live2-5;
             If y2<20+radius2 Then y2:=20+radius2;
             If y2>470-radius2 Then y2:=470-radius2;
             If live2<0 Then live2:=0;
   writestand;End;
   If (x1>629-radius1)Or(x1<1+radius1)Or(y1<21+radius1)Or(y1>469-radius1)Or
      (x2>629-radius2)Or(x2<1+radius2)Or(y2<21+radius2)Or(y2>469-radius2)
   Then Begin crashsnd;startsound(Sounds[16],16,false);End;

If (live2<1)Or(live1<1) Then Begin writestand;winner(playagain,gamespeed,punkte1,punkte2);End;

If playagain='y'Then Begin ClearDevice; Goto 10;End;

   Setcolor(random(5)+5);  {Zeichnet Worm1}
   Circle(x1,y1,Radius1);
   If (shield1>2*radius1)And(i2 Mod 2=0) Then Begin {Kleiner Fehler verhindert}
   Setcolor(11);Circle(x1,y1,Radius1);End;
   x1:=x1+h1*movespeed1;y1:=y1+v1*movespeed1;

   Setcolor(random(5));    {Zeichnet Worm2}
   Circle(x2,y2,Radius2);
   If (shield2>2*radius2)And(i2 Mod 2=0) Then Begin {Kleiner Fehler verhindert}
   Setcolor(11);Circle(x2,y2,Radius2);End;
   x2:=x2+h2*movespeed2;y2:=y2+v2*movespeed2;

   If (x1>x3-(radius1+5))And(x1<x3+(radius1+5))And  {Wird Bonus geholt?}
      (y1>y3-(radius1+5))And(y1<y3+(radius1+5))Then Begin getter:=1;
      boni(live1,kanone1,live2,kanone2,radius1,radius2,movespeed1,
           movespeed2,shoot1,shoot2,getter);
      writestand;End;
   If (x2>x3-(radius2+5))And(x2<x3+(radius2+5))And
      (y2>y3-(radius2+5))And(y2<y3+(radius2+5))Then Begin getter:=2;
      boni(live1,kanone1,live2,kanone2,radius1,radius2,movespeed1,
           movespeed2,shoot1,shoot2,getter);
      writestand;End;

   If (playsnd)And(i2 Mod tondauer=0) Then fx(ton,playsnd);

   delay(gamespeed);   {SPIELGESCHWINDIGKEIT!!!}

Until playagain='n';
nosound;
Goto 20;
end.