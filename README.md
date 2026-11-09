# RETROHUB v9.3.1

**Egyfájlos retro emulátor-platform** — 23 gép, 9 emulátormag, egységes menürendszer (RHGEN), gépenkénti virtuális billentyűzet, beépített AI. Minden egyetlen HTML-fájlban, teljesen offline.

## Gyorsindítás

1. Töltsd le a [`RETROHUB.html`](RETROHUB.html) fájlt (kb. 4,5 MB).
2. Dupla kattintás — megnyílik a böngészőben (Chrome, Edge, Firefox, akár mobilon). Nincs telepítés, szerver, internet: minden ROM és eszköz be van építve.

> **GitHub Pages:** a repó `Settings → Pages → Deploy from a branch → main /(root)` bekapcsolása után a platform itt is fut: `https://<felhasználónév>.github.io/RETROHUB/` — az `index.html` automatikusan átirányít a RETROHUB.html-re. Így bármelyik eszközről, fiók nélkül elérhető.

## Mit tud?

- **23 gép, őszinte állapotjelöléssel**
  - *Maggépek (9):* ZX81, ZX Spectrum 48K, Commodore 64, Commodore 16/+4, HT1080Z, Videoton TVC, Primo B-64, Enterprise 64/128, Amiga 500 (SAE).
  - *Profilgépek (14, teljes fejlesztői központtal, mag nélkül):* C128, VIC-20, ABC 80, Jupiter ACE, Atari 800XL, Atari 2600, Atari 520ST, CPC 464, MSX1, Mega Drive, SNES, SMS, NES, Game Boy.
- **RHGEN menümotor** — mind a 23 gépen azonos, hat csoportos fejlesztői központ: VEZÉRLÉS · HARDVER · FEJLESZTÉS (BASIC, Z80-assembler, élő memória-szerkesztő, AI-programozó, játékstúdió) · PAINT (32×16 rajzoló) · HANG (4 csatornás tracker, WAV-mentés) · NAPLÓ.
- **Virtuális billentyűzet** minden maggéphez, a valódi gépek mátrixaiból: C64 (KERNAL $EB81-es kulcstábla), TVC (62 gomb), Primo (55 gomb), Enterprise (10×8 EP-mátrix), HT1080Z (memórialeképezett TRS-80 Model I), Amiga (74 gomb). A SHIFT/CTRL/CAPS gombok ragadósak.
- **Fájlcsatornák gépenként:** TAP/TZX/SNA/**.snapshot** (Spectrum), Z81 (ZX81), PRG/P00/T64 (C64), PRG (C16), CAS (TVC), PP/PTP quickload (Primo), CMD/BAS (HT1080Z), ADF behelyezés DF0:-be (Amiga).
- **Pillanatkép (v9.3):** a futó emulátor-mag teljes állapota — CPU-regiszterek, memória, perifériák — menthető és visszatölthető: **a böngésző tárolójába** (gépenként több pillanatkép, listával, törléssel) vagy **`.rhsnap` fájlba** (JSON boríték, bármely RETROHUB-példányra visszatölthető). A VEZÉRLÉS csoportból érhető el mind a 9 maggépen: c64, c16, ht, tvc, primo, ent (teljes állapot-sorosítás), zxs (natív 48K **SNA**), zx81 (natív **.z81**); az Amigánál a modul őszintén jelzi, hogy a SAE mag belső állapota nem sorosítható.
- **Amiga .snapshot (v9.3.1):** a ZX Spectrum fájlcsatornája fogadja az Amiga-féle Spectrum-emulátorok **`.snapshot`** fájljait (szabvány 48K SNA tartalom; ha a mentés megszakítás-tiltott állapotban készült, a betöltő engedélyezi őket). A Pillanatkép fülön két beágyazott példa (**3D Psi-Chess**, **Deep Strike**) egy gombbal élesíthető.
- **RHMS AI:** a fejléc 🤖 gombjával szolgáltató választható — Pollinations (ingyenes, kulcs nélküli alapértelmezés), OpenAI, OpenRouter, Ollama, LM Studio, egyéni. Gépenkénti AI-programozó gépspecifikus rendszerprompttal, a válasz begépelhető az emulált gépbe.

## A repó tartalma

| Fájl / mappa | Mit tartalmaz |
|---|---|
| `RETROHUB.html` | a teljes platform — ez az egyetlen futtatható fájl |
| `index.html` | átirányítás a RETROHUB.html-re (GitHub Pages-hez) |
| `DOKUMENTACIO_valtozaslista.txt` | teljes v8→v9.2 forrásdokumentáció, változáslista és használati útmutató |
| `fejlesztes/build_v9.py` | az összeállító script — ez építi a RETROHUB.html-t |
| `fejlesztes/v9/` | a build komponensei (menümotor, magok, billentyűzetek, AI, CSS) |
| `fejlesztes/*.py` | ellenőrző és hibakereső scriptek (Playwright-alapú végponti tesztek) |

## Újraépítés

A `RETROHUB.html` nem kézzel szerkesztett dokumentum: a `fejlesztes/build_v9.py` állítja elő a `fejlesztes/v9/` komponenseiből. Verzióváltásnál új komponens készül, a build újrafut — minden változás visszakövethető a forrásokból.

## Verziótörténet

- **v9** — teljes újjáépítés: központi, csoportosított menürendszer (RHGEN) mind a 23 gépen, billentyűzet minden maggéphez, opcionális lehetőségek mindenhol; méret 90,7 MB → kb. 4,5 MB.
- **v9.1** — billentyűzet és vezérlősáv láthatósága kis felbontáson is (görgethető színpad, összehúzható CRT-keret), C64: CIA Timer-A + VIC raster, HT1080Z: memórialeképezett billentyűzet, Amiga: SAE konfig-javítás, RHASM export.
- **v9.2** — fájlmentés minden környezetben (automatikus Blob + letöltés-fallback a claude.use nélküli oldalakon: GitHub Pages, sima böngésző), dupla `<body>` javítás, a „Claude (beépített)” AI-szolgáltató biztonságos kezelése, súgószöveg-korrekciók.
- **v9.2.1** — ZX81 ROM-súgó korrekció (a ROM be van ágyazva), Pages-en automatikus Pollinations alapértelmezett AI-szolgáltató, boot9 verzió-jelzés.
- **v9.2.2** — Boot-javítások: **C64** teljes BASIC-boot (SED/BIT/IRQ-maghibák, VIC $D020/$D021 színek, begépelés + RETURN végrehajtás él), **C16/Plus/4** BASIC 3.5 boot (TED-regiszterek, cold start, jiffy-IRQ), **Amiga** csak-ROM boot (lemezes boot kikapcsolva, ADF kézzel helyezhető be). Mind a 9 maggép Playwright-ellenőrzéssel bootol.
- **v9.2.3** — **Fizikai billentyűzet-híd**: a valódi (hardveres) billentyűzet mostantól minden maggépen él (C64, C16, HT1080Z, TVC, Primo, Enterprise) — Shift+szimbólum kombinációkkal, Enter/Backspace/nyilakkal. **HT1080Z**: a videó-RAM olvasás javítva (a boot már nem tölti szeméttel a képernyőt; él a MEMORY SIZE? prompt). **C16**: a TED key-index protokoll ($FD00/$FD01) beépítve, a kulcs-események elérik a ROM pufferét. **Amiga**: mind a négy meghajtó kiiktatva a bootból (csak Kickstart/AROS ROM boot; az ADF kézzel helyezhető be). **Primo**: boot + billentyűzet ellenőrizve (PRIMO BASIC SYSTEM ’84.2 + Ok + gépelés él).
- **v9.2.4** — Gépenkénti bemenet-javítások: C16 (TED regiszterterület + billentyű-latch — a begépelés és a BASIC él), Enterprise (Dave IRQ-réteg), HT1080Z (fantom-billentyű javítva, valódi Model I kulcsdekódolás), Amiga boot-tisztítás. Részletek a változáslistában.
- **v9.2.6** — **Mobil nézet újratervezve**: a géplista alul-felhúzható fiókba került (hívása a képernyő alatti „☰ Gépek" gomb), a téma/AI/fejlesztői gombok mobilon a fiókba költöznek, a képernyő + vezérlés + billentyűzet egyszerre látszik görgetés nélkül. Javítva a generikus billentyűzet-rács min-content széthúzása (a mobil vízszintes görgetés oka).
- **v9.3** — **Pillanatkép-mentés (snapshot)**: a 9 maggépen a futó mag teljes állapota menthető (böngésző + `.rhsnap` fájl) és visszatölthető; a zxs/zx81 saját natív formátumban (SNA/.z81) dolgozik, a régi 💾 gomb is erre fut. **Hibajavítás:** a ZX81 beágyazott ROM-ja a v9.2.x-ben friss böngészőben sosem töltődött be (a ROM-init az RH_ROMS definiálása ELŐTT futott) — a v9.3-ban sorrend-cserével javítva, így a ZX81 mostantól magától bootol. Verzióbélyegek egyeztetve (cím, logó, boot-képernyő, konzol-jelző, index.html).
- **v9.3.1** — **Amiga .snapshot kezelés a ZX Spectrumon**: a fájlcsatorna új kiterjesztése az Amiga-hosted Spectrum-emulátorok **`.snapshot`** fájljai (elemzés: 49 179 bájt = szabvány 48K SNA — 27 bájtos fejléc + RAM; a PC a verem tetején, RETN-szemanitika). DI-állapotban mentett fájloknál a betöltő engedélyezi a megszakításokat. A Pillanatkép fülön **beágyazott példák** (3D Psi-Chess, Deep Strike — Bill Bennett Amiga-gyűjteményéből), a build (`fejlesztes/v9/amigasnap.js`) visszavezetve. Nem betölthető (dokumentált): a 35 518 bájtos AMIGA.Z80/AMIGA.sna saját, tömörített formátum.
