# RETROHUB v9.2.3

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
- **Fájlcsatornák gépenként:** TAP/TZX/Z81 (Spectrum/ZX81), PRG/P00/T64 (C64), PRG (C16), CAS (TVC), PP/PTP quickload (Primo), CMD/BAS (HT1080Z), ADF behelyezés DF0:-be (Amiga).
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
