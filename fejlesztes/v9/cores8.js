
/* ================================================================
   RETROHUB v9 — RH mag-réteg (cores8)
   createCore(mid): c64, c16, ht, tvc, primo, ent + RH.AMIGA (SAE)
   Közös felület: mount/unmount/reset/matrix/typeText/loadFile/
   memRead/memWrite/screenWrite
   ================================================================ */
(function () {
  'use strict';
  function b64u8(b64) {
    const s = atob(b64), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  const ROM = window.RH_ROMS || {};

  /* ---------------- közös keretloop ---------------- */
  function makeLoop(core, canvas, machine, renderFn, opts) {
    const o = opts || {};
    const ctx = canvas.getContext('2d');
    let W = o.w || canvas.width, H = o.h || canvas.height;
    canvas.width = W; canvas.height = H;
    let img = ctx.createImageData(W, H);
    let frames = 0, lastT = 0, fpsAcc = 0, fpsN = 0, raf = null, running = true, paused = false;
    /* v9.3.5: rAF-orvos — rejtett/átfedett ablaknál a böngésző leállítja a requestAnimationFrame-et,
       és a teljes emuláció megfagy (a gép „nem indul el”). A 60 ms-os setTimeout-őr is erőlteti
       a futást (kb. 16 fps), ha az rAF nem tüzel; látható ablaknál az rAF dominál, a timer leselejtezik. */
    let pulse = 0;
    /* v9.3.7: valós idejű catch-up — a lassú renderelés (nagy canvas) visszafogja az rAF-et,
       és az emulált gép a valós idő alatt lemarad (a TVC/Ent ROM key-scanje „elveszi” a
       gyors leütéseket). Ha a tick óta több mint egy képkocka idő telt el, több runFrame fut. */
    function tickWatchdog() { if (running) tick(performance.now()); }
    function tick(t) {
      if (!running) return;
      clearTimeout(pulse); pulse = 0; if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick); pulse = setTimeout(tickWatchdog, 60);
      if (!running) return;
      if (!paused) {
        /* v9.3.7: lemaradás-kiegyenlítés (max 4 frame / tick — a CPU ne ragadjon be) */
        let n = 1;
        if (lastT && t > lastT) {
          const target = Math.min(4, Math.max(1, Math.round((t - lastT) / 20)));
          n = target;
        }
        try {
          for (let i = 0; i < n && running; i++) { machine.runFrame(); core._processTyping(); }
        } catch (e) { RHGEN.log('maghiba: ' + e.message); running = false; }
      }
      if (renderFn) {
        try { renderFn(img.data); ctx.putImageData(img, 0, 0); } catch (e) {}
      }
      frames++; core._ctl._frames = frames;
      const st = document.querySelector('#rh-frames'), sf = document.querySelector('#rh-fps'), ss = document.querySelector('#rh-status');
      if (st) st.textContent = String(frames);
      fpsAcc += t - (lastT || t); lastT = t; fpsN++;
      if (fpsAcc >= 500) {
        if (sf) sf.textContent = String(Math.round(1000 * fpsN / fpsAcc));
        if (ss) ss.textContent = paused ? 'Szünet' : 'Fut';
        fpsAcc = 0; fpsN = 0;
      }
    }
    core._ctl = {
      start() { if (raf === null && pulse === 0) { lastT = 0; raf = requestAnimationFrame(tick); pulse = setTimeout(tickWatchdog, 60); } running = true; },
      stop() { running = false; core._tdisposed = true; /* v9.3.7: a wall-clock gépelő tisztítása */ if (raf) cancelAnimationFrame(raf); raf = null; clearTimeout(pulse); pulse = 0; },
      pause(p) { paused = !!p; },
      _frames: 0
    };
    core._resize = (w, h) => { W = w; H = h; canvas.width = w; canvas.height = h; img = ctx.createImageData(w, h); };
    core._ctl.start();
  }

  /* ---------------- begépelő sor ---------------- */
  function makeTyper(core, applyAction) {
    core._tq = [];
    core._tcount = 0;
    /* v9.3.7: EMULÁLT-KÉPKOCKA-alapú gépelés — a makeLoop minden runFrame után hívja!
       (a headless oldalak setInterval-jét a böngésző fojtja 1 s-1 percre, a régi
       frame-arányos verzió meg a lassú rAF-et követte) — így a lépésköz a GÉP
       saját idejében mérődik: core._tstep = press hossz emulált frame-ekben,
       a ROM key-scanje mindig észreveszi a leütést. */
    core._processTyping = function () {
      if (!core._tq.length) return;
      core._tcount++;
      if (core._tcount % (core._tstep || 5)) return;
      const a = core._tq.shift();
      applyAction(a);
    };
  }
  function pushChar(core, steps) { steps.forEach(s => core._tq.push(s)); }

  /* ================= C64 ================= */
  function makeC64() {
    const m = new C64Family('c64');
    m.loadRoms({ basic: b64u8(ROM.c64basic), kernal: b64u8(ROM.c64kernal), char: b64u8(ROM.c64char) });
    /* CIA-portok bekötése a CPU buszra + minimál CIA1 Timer-A emuláció
       (a KERNAL bootja a $DC04/05 timer-IRQ-ra vár) */
    const cia = { latch: 0xFFFF, cnt: 0xFFFF, cra: 0, ier: 0, icr: 0 };
    const oldRead = m.readMem.bind(m), oldWrite = m.writeMem.bind(m);
    m.cpu.bus = {
      read: a => {
        a &= 0xFFFF;
        if (a === 0xD012) return Math.floor((m.cpu.cycles % 19656) / 63) & 0xFF; /* raster sor */
        if (a === 0xD019) return 0x00; /* VIC IRQ státusz: PAL */
        if ((a & 0xFF00) === 0xDC00) {
          switch (a & 0x0F) {
            case 0x04: return cia.cnt & 0xFF;
            case 0x05: return (cia.cnt >> 8) & 0xFF;
            case 0x0D: { const v = cia.icr ? (cia.icr | 0x80) : 0; cia.icr = 0; return v; }
            case 0x0E: return cia.cra;
            default: return m.portIn(a & 0xFFFF);
          }
        }
        return oldRead(a);
      },
      write: (a, v) => {
        a &= 0xFFFF; v &= 0xFF;
        if ((a & 0xFF00) === 0xDC00) {
          switch (a & 0x0F) {
            case 0x04: cia.latch = (cia.latch & 0xFF00) | v; return;
            case 0x05: cia.latch = (cia.latch & 0x00FF) | (v << 8); return;
            case 0x0E: cia.cra = v; if (v & 0x10) cia.cnt = cia.latch; return; /* force load */
            case 0x0D: if (v & 0x80) cia.ier |= (v & 0x1F); else cia.ier &= ~(v & 0x1F); cia.icr = 0; return;
          }
          m.portOut(a & 0xFFFF, v); return;
        }
        oldWrite(a, v);
      }
    };
    function ciaTick(dt) {
      if (!(cia.cra & 1)) return;
      let c = cia.cnt - dt;
      while (c < 0) {
        c += cia.latch || 0x10000;
        cia.icr |= 1;                     /* Timer-A underflow */
        if (cia.ier & 1) m.cpu.irq();
      }
      cia.cnt = c & 0xFFFF;
    }
    /* runFrame felülírás, hogy a timer lépésenként számoljon */
    m.runFrame = function () {
      const end = m.cpu.cycles + 19656;
      let guard = 0;
      while (m.cpu.cycles < end && guard++ < 600000) {
        if (m.cpu.halted) { m.cpu.cycles += 1; break; }
        const t0 = m.cpu.cycles;
        m.cpu.step();
        ciaTick(m.cpu.cycles - t0);
      }
      m.frames++;
    };
    const KT = window.RH_C64_KTAB, KTS = window.RH_C64_KTABS;
    function findPos(tbl, val) {
      for (let i = 0; i < 64; i++) if ((tbl[i] & 0x7F) === (val & 0x7F)) return { r: i >> 3, c: i & 7 };
      return null;
    }
    function charSteps(ch) {
      const st = [];
      const key = (p) => { st.push({ r: p.r, c: p.c, d: 1 }, { r: p.r, c: p.c, d: 0 }); };
      if (ch === '\n') { key({ r: 0, c: 1 }); return st; }
      if (ch === ' ') { key({ r: 7, c: 4 }); return st; }
      let p = findPos(KT, ch.charCodeAt(0));
      if (p) { key(p); return st; }
      p = findPos(KTS, ch.charCodeAt(0));
      if (p) { st.push({ r: 1, c: 7, d: 1 }); key(p); st.push({ r: 1, c: 7, d: 0 }); return st; }
      return st;
    }
    const core = {
      f: m,
      _cpu: m.cpu,
      _cia: cia,
      get mem() { return m.mem; },
      mount(cv) {
        makeLoop(core, cv, m, rgba => m.render(rgba), { w: 320, h: 200 });
      },
      unmount() { core._ctl.stop(); },
      reset() { m.reset(); },
      matrix(r, c, down) { m.setKey(r, c, down); },
      loadFile(name, u8) {
        let addr = null, data = null;
        if (/\.p00$/i.test(name)) { addr = u8[26] | (u8[27] << 8); data = u8.subarray(28); }
        else if (/\.t64$/i.test(name)) {
          const off = u8[64 + 8] | (u8[64 + 9] << 8) | (u8[64 + 10] << 16) | (u8[64 + 11] << 24);
          addr = u8[64 + 2] | (u8[64 + 3] << 8);
          data = u8.subarray(off, u8.length);
        } else { addr = u8[0] | (u8[1] << 8); data = u8.subarray(2); }
        if (addr == null || !data) return 'ismeretlen fájlformátum';
        for (let i = 0; i < data.length && addr + i < 0x10000; i++) m.mem[(addr + i) & 0xFFFF] = data[i];
        /* v9.3.7: BASIC-program felismerés + programpointerek + automatikus indítás.
           Korábban a RUN üres programot futtatott: a KERNAL a $2D/$2F pointerek
           alapján olvassa a programot, és a reset-utáni értékük $0801 (üres program),
           tehát a RAM-ba másolt sorokat a RUN nem látta. */
        let res = name + ' betöltve a $' + addr.toString(16).toUpperCase() + ' címre (' + data.length + ' bájt)';
        const isB = addr === 0x0801 && data.length >= 6 &&
          data[data.length - 2] === 0 && data[data.length - 1] === 0 &&
          (data[0] & 1) === 0 && data[0] >= 2 && data[0] <= data.length &&
          (data[2] | (data[3] << 8)) <= 63999;
        if (isB) {
          const end = (addr + data.length) & 0xFFFF;
          m.mem[0x2D] = end & 0xFF; m.mem[0x2E] = end >> 8; /* program vége → változók kezdete */
          m.mem[0x2F] = end & 0xFF; m.mem[0x30] = end >> 8; /* tömbterület vége */
          setTimeout(() => { try { core.typeText('RUN\n'); } catch (e) {} }, 500);
          res += ' — RUN elindítva';
        } else {
          setTimeout(() => { try { core.typeText('SYS' + addr + '\n'); } catch (e) {} }, 500);
          res += ' — SYS' + addr + ' begépelve';
        }
        return res;
      },
      memRead(a) { return m.readMem(a & 0xFFFF); },
      memWrite(a, v) { m.mem[a & 0xFFFF] = v & 0xFF; },
      screenWrite(y, x, code) {
        m.mem[0x0400 + (y & 31) * 40 + (x & 63)] = code & 0xFF;
        m.mem[0xD800 + (y & 31) * 40 + (x & 63)] = 14;
      }
    };
    makeTyper(core, a => m.setKey(a.r, a.c, !!a.d));
    core.typeText = str => { for (const ch of String(str)) pushChar(core, charSteps(ch)); return true; };
    return core;
  }

  /* ================= C16 / Plus/4 ================= */
  function makeC16() {
    const m = new C64Family('c16');
    m.tedKeyIdx = 0; /* TED key-index: 0 = nincs esemény */
    m.tedRowSel = 0xFF; /* TED billentyű-latch: utoljára kiválasztott sor(ok) (aktív low) */
    /* C16 memóriatérkép: $8000-$BFFF BASIC ROM, $C000-$FFFF KERNAL ROM.
       FONTOS: a felülírást a loadRoms() ELŐTT telepítjük, hogy a reset-vektor
       olvasása ($FFFC) már a helyes térképen történjen (a dump $C000-tól indul). */
    const origSetKey16 = m.setKey.bind(m);
    m.setKey = function (r, c2, down) {
      origSetKey16(r, c2, down);
      /* TED auto-szkenner: lenyomási él → kulcs-index a pufferbe.
         Index-képlet: sor*8 + oszlop + 1 (a 8×8-as mátrix bejárása). */
      if (down && !m.tedKeyIdx) m.tedKeyIdx = (r & 7) * 8 + (c2 & 7) + 1;
    };
    const origRead = m.readMem.bind(m);
    m.readMem = function (a) {
      a &= 0xFFFF;
      /* TED regiszterek ($FF00-$FF1F) a KERNAL ROM fölött állnak:
         $FF09 bit1 = TED időzítő-IRQ (a jiffy + kurzor ehhez fut),
         $FF1D = hang-generátor visszolvasás; a KERNAL $CE8A-nál addig vár,
         amíg ≥ $A3 — ROM-bájtot visszaadva örök körbe ragadna. */
      /* TED billentyűzet (a C16 a TED-be épített auto-szkennert használja):
         $FD01 olvasás: bit3 = új kulcs-esemény várakozik;
         $FD00 olvasás: az esemény kulcs-indexe (1-alapú), majd törlődik. */
      if (a === 0xFD00) { const v = m.tedKeyIdx | 0; m.tedKeyIdx = 0; return v; }
      /* bit7 = esemény érhető el, bit3 = lenyomás (a KERNAL $CE1D/$EA95 szerint) */
      if (a === 0xFD01) return (m.tedKeyIdx ? 0x88 : 0x00);
      /* TED billentyű-latch, kézi szken mód: a KERNAL $DB70-es rutinja a sor-
         kiválasztást $FD30/$FF08-ra írja (aktív low, egy-hot), majd $FF08
         olvasással kapja meg az oszlop-állapotot. Enélkül a $DB11-es jiffy-
         szkenner nem lát billentyűt — ez volt a C16 némán maradásának oka. */
      if (a === 0xFF08) {
        let vv = 0xFF;
        for (let r2 = 0; r2 < 8; r2++) if (!(m.tedRowSel & (1 << r2))) vv &= m.kb[r2];
        return vv;
      }
      /* A teljes TED regiszterterület ($FF00-$FF1F) a KERNAL ROM FELETT van:
         az olvasás a RAM-ba írt regiszterértékeket adja vissza. A KERNAL az
         IRQ-jában $FF0B-be $CC/$A1-et ír a $CE42-es editor-tick vezérléséhez —
         ROM-bájt visszaadása esetén a $CE38-as BIT mindig V=0-t adott, a tick
         (és vele a $DB11-es jiffy-billentyűszkenner) sosem futott le. */
      if (a >= 0xFF00 && a <= 0xFF1F) {
        if (a === 0xFF1D) return 0xA3; /* hang-generátor: a $CE8A várakozása ezt igényli */
        if (a === 0xFF09) return m.mem[a] | 0x02; /* TED időzítő-IRQ bit mindig jelzett */
        return m.mem[a];
      }
      /* v9.3.5: TED RAM-bank ($FF3F = RAM $8000-$FFFF-en, $FF3E = ROM vissza) —
         a kernel bankolt olvasói ($04B0+: STA $FF3F / LDA ($22),Y / STA $FF3E)
         enélkül ROM-bájtot olvastak a memtop alatti temp-string területről
         ($FCFC), ezért minden BASIC-kiírás (PRINT, RAM-szám) szemét volt. */
      if (m.tedRamBank && a >= 0x8000) return m.mem[a];
      if (a >= 0x8000 && a < 0xC000 && m.romBasic) return m.romBasic[a - 0x8000];
      if (a >= 0xC000 && m.romKernal) return m.romKernal[a - 0xC000];
      return origRead(a);
    };
    const origWrite = m.writeMem.bind(m);
    m.writeMem = function (a, v) {
      a &= 0xFFFF; v &= 0xFF;
      if (a === 0xFD30 || a === 0xFF08) { m.tedRowSel = v; return; } /* TED sor-kiválasztás */
      /* v9.3.5: TED ROM-bankkapcsoló: $FF3F → RAM látszik, $FF3E → ROM vissza */
      if (a === 0xFF3F) { m.tedRamBank = true; return; }
      if (a === 0xFF3E) { m.tedRamBank = false; return; }
      if (a === 0 || a === 1) return origWrite(a, v); m.mem[a] = v;
    };
    m.loadRoms({ basic: b64u8(ROM.c16low), kernal: b64u8(ROM.c16high), char: null });
    /* a C16 karakterkészlete a KERNAL ROM-ban van ($D000-$DFFF) */
    if (m.romKernal && m.romKernal.length >= 0x2000) m.romChar = m.romKernal.subarray(0x1000, 0x2000);
    /* Boot-javítás: a KERNAL a $F49C-nél a gépnyelvi monitor parancspromptjára lép
       (a dump $8006-os bájtja 0, így a KERNAL nem találja a BASIC-bankot).
       Itt a saját BASIC cold startjára ugrik ($8019) — minden init után, ezért
       már élő I/O-vektorokkal fut le: banner + READY. */
    if (m.romKernal) { m.romKernal[0x349C] = 0x4C; m.romKernal[0x349D] = 0x19; m.romKernal[0x349E] = 0x80; }
    /* a loadRoms() a régi (hibás) térképpel resetelt — most, a jó térképpel újra */
    m.reset();
    /* a C16 szín-RAM ($0800) alapértelmezése fehér (1) — a KERNAL a színeket
       nem írja felül bootnál, feketén feketén láthatatlan lenne a szöveg */
    m.mem.fill(1, 0x0800, 0x0C00);
    /* a KERNAL keyscan-kapuja ($07D8 bit7): a cold-start útirányítás miatt a
       normál init sorozat nem fut le, így a szerkesztő nem engélyezi a
       TED-billentyűzet olvasást — a futtató hurok kapcsolja be (20 frame után) */
    /* TED jiffy-IRQ: ~1/50 s PAL (1,76 MHz / 35200 ciklus) */
    m.runFrame = function () {
      const cpu = m.cpu;
      const end = cpu.cycles + 35200;
      let guard = 0;
      while (cpu.cycles < end && guard++ < 900000) {
        if (cpu.halted) { cpu.cycles += 1; break; }
        cpu.step();
      }
      if (m.frames > 20 && !(m.mem[0x07D8] & 0x80)) m.mem[0x07D8] = 0x80;
      cpu.irq();
      m.frames++;
    };
    const core = {
      f: m,
      get mem() { return m.mem; },
      mount(cv) { makeLoop(core, cv, m, rgba => m.render(rgba), { w: 320, h: 200 }); },
      unmount() { core._ctl.stop(); },
      reset() { m.reset(); },
      matrix(r, c, down) { m.setKey(r, c, down); },
      loadFile(name, u8) {
        if (/\.prg$/i.test(name) || u8[0] === 0x01) {
          const addr = u8[0] | (u8[1] << 8), data = u8.subarray(2);
          for (let i = 0; i < data.length && addr + i < 0x10000; i++) m.mem[(addr + i) & 0xFFFF] = data[i];
          /* v9.3.7: BASIC-program pointerek ($1001-es BASIC start) + automatikus
             RUN — a C16-nál is ugyanaz a hiba volt: a RUN üres programot futtatott,
             mert a $2D/$2F pointerek reset-utáni értéke $1001 maradt. */
          let res = name + ' betöltve a $' + addr.toString(16).toUpperCase() + ' címre (' + data.length + ' bájt)';
          const isB = addr === 0x1001 && data.length >= 6 &&
            data[data.length - 2] === 0 && data[data.length - 1] === 0 &&
            (data[0] & 1) === 0 && data[0] >= 2 && data[0] <= data.length &&
            (data[2] | (data[3] << 8)) <= 63999;
          if (isB) {
            const end = (addr + data.length) & 0xFFFF;
            m.mem[0x2D] = end & 0xFF; m.mem[0x2E] = end >> 8;
            m.mem[0x2F] = end & 0xFF; m.mem[0x30] = end >> 8;
            setTimeout(() => { try { core.typeText('RUN\n'); } catch (e) {} }, 500);
            res += ' — RUN elindítva';
          } else {
            setTimeout(() => { try { core.typeText('SYS' + addr + '\n'); } catch (e) {} }, 500);
            res += ' — SYS' + addr + ' begépelve';
          }
          return res;
        }
        return 'ismeretlen fájlformátum';
      },
      memRead(a) { return m.readMem(a & 0xFFFF); },
      memWrite(a, v) { m.mem[a & 0xFFFF] = v & 0xFF; },
      screenWrite(y, x, code) {
        m.mem[0x0C00 + (y & 31) * 40 + (x & 63)] = code & 0xFF;
        m.mem[0x0800 + (y & 31) * 40 + (x & 63)] = 2;
      }
    };
    makeTyper(core, a => m.setKey(a.r, a.c, !!a.d));
    core.typeText = str => {
      const cc = window.RH && RH.c16Coord;
      for (const ch of String(str)) {
        let p = cc ? cc(ch) : null;
        if (!p) { p = cc ? cc(String(ch).toUpperCase()) : null; }
        if (!p) continue;
        const steps = [];
        if (p.sh) steps.push({ r: 1, c: 7, d: 1 }); /* SHIFT lenyomva */
        steps.push({ r: p.r, c: p.c, d: 1 }, { r: p.r, c: p.c, d: 0 });
        if (p.sh) steps.push({ r: 1, c: 7, d: 0 });
        pushChar(core, steps);
      }
      return true;
    };
    return core;
  }

  /* ================= HT1080Z (TRS-80 Model I) ================= */
  function makeHT() {
    const rom = b64u8(ROM.ht);
    const mem = new Uint8Array(0x10000);
    mem.set(rom.subarray(0, 0x3000), 0);
    const kbRow = new Uint8Array(8).fill(0xFF); /* bit=0 nyomott */
    let selRow = 0xFF;
    const font = b64u8(ROM.c64char); /* 8×8 karakterkészlet a kijelzőhöz */
    const HKB = window.RH_HTKB;
    const cpu = new Z80({
      read: a => {
        a &= 0xFFFF;
        /* Model I: MEMÓRIALEKÉPEZETT billentyűzet $3800-$3FFF:
           A8-A10 = sor, A0-A2 = oszlopbít (0 = nyomott) */
        if (a >= 0x3800 && a < 0x3C00) {
          /* Valódi Model I dekódolás: A0-A7 EGY-HOT oszlopkiválasztás ($01..$80),
             a visszaadott bájt bit r = az r. sor állapota a kiválasztott oszlopban
             (0 = nyomva). A ROM a $3801/$3802/.../$3880 címeket olvassa (LD A,(BC)
             RLC C léptetéssel) — a bináris (a&7) dekódolás miatt a korábbi kód
             nem tudott billentyűt átadni. */
          const lb = a & 0xFF;
          if (lb && !(lb & (lb - 1))) {
            const cc = 31 - Math.clz32(lb);
            let v2 = 0xFF;
            for (let r2 = 0; r2 < 8; r2++) if (!(kbRow[r2] & (1 << cc))) v2 &= ~(1 << r2) & 0xFF;
            /* A ROM (new^old)&new él-detektort használ ($03EB-$03F0) — a lenyomott
               billentyűt SET bitként várja (aktív-magas). A belső mátrix aktív-alacsony,
               ezért a visszaadott bájtot invertáljuk. Az eredeti polaritással a ROM
               fantom '0. soros' eseményeket látott (maszk = ~lenyomva). */
            return (~v2) & 0xFF;
          }
          return 0x00; /* nem one-hot cím = nincs billentyű (aktív-magas: 0x00) */
        }
        return mem[a];
      },
      write: (a, v) => { a &= 0xFFFF; if (a >= 0x3000) mem[a] = v & 0xFF; },
      in: p => {
        p &= 0xFF;
        if (p === 0xFE || p === 0xFF) {
          /* aktív-magas visszaadás (a $03EB-es ROM-detektornak) */
          if (selRow === 0xFF || (selRow & (selRow - 1)) !== 0) return 0x00;
          for (let i = 0; i < 8; i++) if (!((selRow >> i) & 1)) return (~kbRow[i]) & 0xFF;
          return 0x00;
        }
        return 0xFF;
      },
      out: (p, v) => { p &= 0xFF; if (p === 0xFF) selRow = v & 0xFF; }
    });
    function keyP(r, c, d) { if (r >= 0 && r < 8 && c >= 0 && c < 8) { if (d) kbRow[r] &= ~(1 << c) & 0xFF; else kbRow[r] |= (1 << c); } }
    const core = {
      _cpu: cpu,
      /* v9.3: a billentyű-mátrix kifelé látható — a pillanatkép-modul sorosítja */
      _kb: kbRow,
      get mem() { return mem; },
      /* egységes core.f fasád (cpu + mem) a diagnosztikai/UI-rétegnek */
      get f() { return { cpu: cpu, mem: mem, get frames() { return (core._ctl && core._ctl._frames) || 0; } }; },
      mount(cv) {
        /* 64×16 karakter, 8×12 cella → 512×192, zöld; Z80 @ 1,77 MHz, 60 Hz */
        const W = 512, H = 192, CW = 8, CH = 12;
        const machine = {
          _f: 0, _hold: 0,
          runFrame() {
            let n = 29500;
            let guard = 0;
            while (n > 0 && guard++ < 400000) n -= cpu.step();
            /* v9.2.6 — automata boot-válasz: a HT1080Z ROM "READY ?" boot-
               lekérdezéseknél megáll. Amíg a 0. sorban a "READY ?" látszik
               (és nincs ">"), ENTER-t (0,6) küldünk ~0,5 s-enként; a valódi
               BASIC ">" prompt megjelenésekor a segély leáll. */
            this._f++;
            if (this._hold > 0) { this._hold--; if (this._hold === 0) keyP(0, 6, false); }
            if (this._f % 30 === 0) {
              /* képernyőkód → szöveg (0-31: @A-Z[\]^_, 32-63: ASCII) */
              const CS = '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_';
              let s = '';
              for (let col = 0; col < 16; col++) { const v = mem[0x3C00 + col] & 0x3F; s += (v >= 32) ? String.fromCharCode(v) : CS[v]; }
              if (s.indexOf('READY') >= 0 && s.indexOf('?') >= 0 && s.indexOf('>') < 0 && this._hold === 0) {
                keyP(0, 6, true);
                this._hold = 7;
              }
            }
          }
        };
        const render = rgba => {
          for (let i = 0; i < W * H; i++) { const o = i * 4; rgba[o] = 0; rgba[o + 1] = 0; rgba[o + 2] = 0; rgba[o + 3] = 255; }
          for (let row = 0; row < 16; row++) {
            for (let col = 0; col < 64; col++) {
              const code = mem[0x3C00 + row * 64 + col] & 0x3F;
              for (let yy = 0; yy < 8; yy++) {
                const bits = font[code * 8 + yy] || 0;
                if (!bits) continue;
                for (let xx = 0; xx < 6; xx++) {
                  if ((bits >> (7 - xx)) & 1) {
                    const px = col * CW + xx + 1, py = row * CH + yy + 2;
                    const o = (py * W + px) * 4;
                    rgba[o] = 80; rgba[o + 1] = 255; rgba[o + 2] = 110;
                  }
                }
              }
            }
          }
        };
        makeLoop(core, cv, machine, render, { w: W, h: H });
      },
      unmount() { core._ctl.stop(); },
      reset() {
        cpu.reset();
        /* A RAM $00-ról indul: a $20-töltés a $4036+ billentyű-árnyék-állapotot
           is szeméttel töltötte, amiből a ROM kulcsszkenere (a $4036+-ot NEM
           inicializálja) minden szkenneléskor fantom 'új lenyomást' látott →
           garbage karakter → ?SN ERROR → végtelen READY/ERROR körforgás. */
        for (let i = 0x3000; i < 0x8000; i++) mem[i] = 0x00;
        /* a kulcsszken 'előző állapot' bájtjai: aktív-magasban a semmi = 0x00
           (a ROM saját RAM-initje így is nullázza; az invertált olvasással
           együtt már nincs fantom-esemény sem bootnál, sem gépelésnél) */
        for (let i = 0x4036; i <= 0x403D; i++) mem[i] = 0x00;
        selRow = 0xFF; kbRow.fill(0xFF);
      },
      matrix: (r, c, down) => keyP(r, c, down),
      loadFile(name, u8) {
        if (/\.cmd$/i.test(name) || u8[0] === 0x05) {
          let i = 0, n = 0, addr = 0;
          while (i + 2 < u8.length && u8[i] === 0x05) {
            addr = (u8[i + 1] << 8) | u8[i + 2]; i += 3;
            while (i < u8.length && u8[i] !== 0x00) { mem[addr & 0xFFFF] = u8[i++]; addr++; n++; }
            if (i < u8.length) i++;
          }
          return name + ' CMD betöltve (' + n + ' bájt) — a ROM-ban SYSTEM paranccsal indítható';
        }
        if (/\.bas$|\.txt$/i.test(name)) {
          core.typeText(new TextDecoder().decode(u8).replace(/\r/g, ''));
          return name + ' BASIC-forrás begépelve';
        }
        return 'ismeretlen fájlformátum (CMD/CAS/BAS támogatott)';
      },
      memRead: a => mem[a & 0xFFFF],
      memWrite: (a, v) => { if ((a & 0xFFFF) >= 0x3000) mem[a & 0xFFFF] = v & 0xFF; },
      screenWrite: (y, x, code) => { mem[0x3C00 + (y & 15) * 64 + (x & 63)] = code & 0x3F; }
    };
    makeTyper(core, a => keyP(a.r, a.c, !!a.d));
    core.typeText = str => {
      const SH = { r: 0, c: 7 }; /* SHIFT (0,7) — v9.2.6 kalibráció */
      for (const ch of String(str)) {
        if (ch === '\n') { pushChar(core, [{ r: 0, c: 6, d: 1 }, { r: 0, c: 6, d: 0 }]); continue; } /* ENTER */
        let p = HKB.map[ch];
        if (p) { pushChar(core, [{ r: p.r, c: p.c, d: 1 }, { r: p.r, c: p.c, d: 0 }]); continue; }
        p = HKB.shmap[ch];
        if (p) { pushChar(core, [{ r: SH.r, c: SH.c, d: 1 }, { r: p.r, c: p.c, d: 1 }, { r: p.r, c: p.c, d: 0 }, { r: SH.r, c: SH.c, d: 0 }]); }
      }
      return true;
    };
    return core;
  }

  /* ================= TVC ================= */
  function makeTVC() {
    const m = new TVCMachine(b64u8(ROM.tvc), b64u8(ROM.tvcext));
    /* karakter → mátrix a TVC_ROWS-ból */
    const cmap = {}, smap = {};
    (window.TVC_ROWS || []).forEach(row => row.forEach(k => {
      const p = { line: k.line, bit: k.bit };
      if (k.label && k.label.length === 1) cmap[k.label] = p;
      if (k.sub && k.sub.length === 1) smap[k.sub] = p;
    }));
    cmap['\n'] = { line: 5, bit: 4 }; cmap[' '] = { line: 7, bit: 5 };
    const SHIFT = { line: 6, bit: 3 };
    const core = {
      f: m,
      mount(cv) { makeLoop(core, cv, m, rgba => renderTVC(m, rgba), { w: TVC_SCREEN_W, h: TVC_SCREEN_H }); },
      unmount() { core._ctl.stop(); },
      reset() { m.reset(); },
      matrix(l, b, down) { down ? m.keyDown(l, b) : m.keyUp(l, b); },
      loadFile(name, u8) {
        if (/\.cas$/i.test(name)) {
          if (u8.length < 0x91 || u8[0] !== 0x11) return 'nem TVC .cas fájl';
          m.ram.set(u8.subarray(0x90), 0x19EF);
          return name + ' CAS betöltve a $19EF címre (' + (u8.length - 0x90) + ' bájt) — LOAD utána futtatható';
        }
        if (/\.txt$/i.test(name)) { core.typeText(new TextDecoder().decode(u8)); return name + ' begépelve'; }
        return 'ismeretlen fájlformátum';
      },
      memRead(a) { return m.readMem(a & 0xFFFF); },
      memWrite(a, v) { m.writeMem(a & 0xFFFF, v & 0xFF); },
      screenWrite(y, x, code) { /* a VRAM-ablak függő — alap: 0 környéke */
        try { m.vram[m.vramScreen * 0x4000 + y * 40 + x] = code & 0xFF; } catch (e) {}
      }
    };
    makeTyper(core, a => a.line != null ? (a.d ? m.keyDown(a.line, a.bit) : m.keyUp(a.line, a.bit)) : (a.d ? m.keyDown(a.r, a.c) : m.keyUp(a.r, a.c)));
    core._tstep = 6; /* v9.3.7: TVC lépésköz emulált frame-ekben */
    core.typeText = str => {
      /* v9.3.7: bemelegítés — a ROM szerkesztője az első ~7 leütést elnyeli;
         a SHIFT (6,3) önmagában semmit nem ír és nem mozgat — 8 lenyomás */
      const w = [];
      for (let i = 0; i < 8; i++) w.push({ line: SHIFT.line, bit: SHIFT.bit, d: 1 }, { line: SHIFT.line, bit: SHIFT.bit, d: 0 });
      pushChar(core, w);
      for (const ch of String(str)) {
        let p = cmap[ch] || cmap[ch.toUpperCase()];
        if (p) { pushChar(core, [{ line: p.line, bit: p.bit, d: 1 }, { line: p.line, bit: p.bit, d: 0 }]); continue; }
        p = smap[ch];
        if (p) pushChar(core, [{ line: SHIFT.line, bit: SHIFT.bit, d: 1 }, { line: p.line, bit: p.bit, d: 1 }, { line: p.line, bit: p.bit, d: 0 }, { line: SHIFT.line, bit: SHIFT.bit, d: 0 }]);
      }
      return true;
    };
    return core;
  }

  /* ================= Primo ================= */
  function makePrimo() {
    const m = new PrimoMachine(b64u8(ROM.primo));
    const cmap = {}, smap = {};
    (window.PRIMO_LAYOUT || []).forEach(row => row.forEach(k => {
      const p = { group: k.group, bit: k.bit };
      if (k.label && k.label.length === 1) cmap[k.label] = p;
      if (k.sub && k.sub.length === 1) smap[k.sub] = p;
    }));
    cmap['\n'] = { group: 3, bit: 7 }; cmap[' '] = { group: 1, bit: 9 };
    const SHIFT = { group: 0, bit: 3 };
    const core = {
      f: m,
      mount(cv) { makeLoop(core, cv, m, rgba => renderPrimo(m, rgba), { w: PRIMO_SCREEN_W, h: PRIMO_SCREEN_H }); },
      unmount() { core._ctl.stop(); },
      reset() { m.reset(); },
      matrix(g, b, down) { down ? m.keyDown(g, b) : m.keyUp(g, b); },
      loadFile(name, u8) {
        if (/\.pp$|\.ptp$/i.test(name) && (u8[0] === 0x50 || u8[0] === 0x54)) {
          const start = (u8[11] << 8) | u8[12];
          const end = (u8[13] << 8) | u8[14];
          const len = end >= start ? (end - start + 1) : (u8.length - 16);
          const data = u8.subarray(16, 16 + len);
          for (let i = 0; i < data.length; i++) m.writeMem((start + i) & 0xFFFF, data[i]);
          return name + ' betöltve a $' + start.toString(16).toUpperCase() + ' címre (' + len + ' bájt)';
        }
        if (/\.txt$/i.test(name)) { core.typeText(new TextDecoder().decode(u8)); return name + ' begépelve'; }
        return 'ismeretlen fájlformátum';
      },
      memRead(a) { return m.readMem(a & 0xFFFF); },
      memWrite(a, v) { m.writeMem(a & 0xFFFF, v & 0xFF); },
      screenWrite(y, x, code) { try { m.vram[(y * 32 + x) & 0x3FFF] = code & 0xFF; } catch (e) {} }
    };
    makeTyper(core, a => a.d ? m.keyDown(a.group != null ? a.group : a.r, a.group != null ? a.bit : a.c) : m.keyUp(a.group != null ? a.group : a.r, a.group != null ? a.bit : a.c));
    core.typeText = str => {
      for (const ch of String(str)) {
        let p = cmap[ch] || cmap[ch.toUpperCase()];
        if (p) { pushChar(core, [{ group: p.group, bit: p.bit, d: 1 }, { group: p.group, bit: p.bit, d: 0 }]); continue; }
        p = smap[ch];
        if (p) pushChar(core, [{ group: SHIFT.group, bit: SHIFT.bit, d: 1 }, { group: p.group, bit: p.bit, d: 1 }, { group: p.group, bit: p.bit, d: 0 }, { group: SHIFT.group, bit: SHIFT.bit, d: 0 }]);
      }
      return true;
    };
    return core;
  }

  /* ================= Enterprise ================= */
  function makeEnt() {
    const m = new EnterpriseMachine(b64u8(ROM.exos), b64u8(ROM.ebasic));
    const cmap = {}, smap = {};
    (window.EP_LAYOUT || []).forEach(row => row.forEach(k => {
      const p = { row: k.row, bit: k.bit };
      if (k.label && k.label.length === 1) cmap[k.label] = p;
      if (k.sub && k.sub.length === 1) smap[k.sub] = p;
    }));
    cmap['\n'] = { row: 7, bit: 6 }; cmap[' '] = { row: 8, bit: 6 };
    const SHIFTS = [{ row: 0, bit: 7 }, { row: 8, bit: 5 }];
    const core = {
      f: m,
      mount(cv) {
        const W = window.EP_VISIBLE_W || 800, H = window.EP_VISIBLE_H || 280;
        makeLoop(core, cv, m, rgba => renderEnterprise(m, rgba), { w: W, h: H });
      },
      unmount() { core._ctl.stop(); },
      reset() { m.reset(); },
      matrix(r, b, down) { down ? m.keyDown(r, b) : m.keyUp(r, b); },
      loadFile(name, u8) {
        if (/\.tap$/i.test(name)) { return 'TAP betöltés hamarosan — addig a begépelés él.'; }
        if (/\.txt$/i.test(name)) { core.typeText(new TextDecoder().decode(u8)); return name + ' begépelve'; }
        return 'ismeretlen fájlformátum';
      },
      memRead(a) { return m.readMem(a & 0xFFFF) & 0xFF; },
      memWrite(a, v) { try { m.writeMem(a & 0xFFFF, v & 0xFF); } catch (e) {} },
      screenWrite(y, x, code) { try { m.videoMem((y * 52 + x) & 0xFFFF, code & 0xFF); } catch (e) {} }
    };
    makeTyper(core, a => a.d ? m.keyDown(a.row != null ? a.row : a.r, a.row != null ? a.bit : a.c) : m.keyUp(a.row != null ? a.row : a.r, a.row != null ? a.bit : a.c));
    core._tstep = 7; /* v9.3.7: IS-BASIC lépésköz emulált frame-ekben */
    core.typeText = str => {
      /* v9.3.7: bemelegítés — az IS-BASIC az első leütéseket is elnyeli; SHIFT ×8 */
      { const sh0 = SHIFTS[0]; const w = []; for (let i = 0; i < 8; i++) w.push({ row: sh0.row, bit: sh0.bit, d: 1 }, { row: sh0.row, bit: sh0.bit, d: 0 }); pushChar(core, w); }
      for (const ch of String(str)) {
        let p = cmap[ch] || cmap[ch.toUpperCase()];
        if (p) { pushChar(core, [{ row: p.row, bit: p.bit, d: 1 }, { row: p.row, bit: p.bit, d: 0 }]); continue; }
        p = smap[ch];
        if (p) {
          const sh = SHIFTS[0];
          pushChar(core, [{ row: sh.row, bit: sh.bit, d: 1 }, { row: p.row, bit: p.bit, d: 1 }, { row: p.row, bit: p.bit, d: 0 }, { row: sh.row, bit: sh.bit, d: 0 }]);
        }
      }
      return true;
    };
    return core;
  }

  /* ================= Amiga (SAE híd) ================= */
  const AMIGA = {
    _sae: null, _cfg: null, _running: false, _gen: 0,
    boot(containerId, logFn) {
      const say = m => { try { logFn && logFn(m); } catch (e) {} };
      if (this._running) { say('már fut'); return; }
      const gen = ++this._gen; /* v9.3.5: az induló start-lánc generációja — stop() érvényteleníti */
      try {
        const sae = new window.ScriptedAmigaEmulator();
        const cfg = sae.getConfig();
        cfg.video.id = containerId;
        cfg.video.api = 0; /* Canvas */
        cfg.video.pauseInBackground = true;
        /* v9.3.5: egér — a Lock mód pointer-lockot kér, ami iframe-en belül (engedély nélkül)
           mindig elutasított, és akkor az SAE mouse.attach SOSEM futott le → nem mozgott az egér.
           'Show' módon (0) az SAE közvetlenül a canvasra köti az egér-eseményeket. */
        cfg.video.cursor = 0; /* SAEC_Config_Video_Cursor_Show */
        cfg.audio.mode = 3; /* On_Best */
        if (location.protocol === 'file:') cfg.audio.api = 0; /* v9.3.4: AudioWorklet file://-n nem tölthető be (CORS) — rögtön ScriptProcessor */
        /* v9.3.6: HDF behelyezve → A1200 mód (68020 + AGA + 2 MB chip + Gayle IDE);
           KS 1.3 az IDE-merevlemezről nem bootol, ezért HDF-módban KS 3.1 megy fel */
        const hdf = this._hdfPending || null;
        if (hdf) sae.setModel(5, 0); else sae.setModel(1, 0); /* A500, 512K chip — v9.3.6: A1200 config 0 (a config 1 autoconfig-probe-ja STOP-ba fagyott) */
        this._containerId = containerId; this._logFn = logFn;
        /* AROS ROM beállítása */
        const bin = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(u8.length, i + 0x8000))); return s; };
        let crcT = null;
        function crc32(s) {
          if (!crcT) { crcT = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); crcT[n] = c; } }
          let c = -1; for (let i = 0; i < s.length; i++) c = crcT[(c ^ s.charCodeAt(i)) & 0xFF] ^ (c >>> 8);
          return (c ^ -1) >>> 0;
        }
        const saeSet = (dst, name, data) => { dst.clr(); dst.name = name; dst.data = data; dst.size = data.length; dst.crc32 = false; };
        /* v9.3.3: valódi Kickstart — A500/68000: KS 1.3 (34.5); a KS 3.1 (40.68) 68020-at követel, ezért csak tartalék */
        /* v9.3.6: HDF-módban a KS 3.1 előnyben (IDE/RDB boot) */
        const ROMKEY = hdf ? (ROM.amiga ? 'amiga' : (ROM.amiga13 ? 'amiga13' : null))
                           : (ROM.amiga13 ? 'amiga13' : (ROM.amiga ? 'amiga' : null));
        if (ROMKEY) {
          saeSet(cfg.memory.rom, ROMKEY === 'amiga' ? 'kick31.rom' : 'kick13.rom', bin(b64u8(ROM[ROMKEY])));
          cfg.memory.extRom.clr();
          say('Valódi Kickstart ROM betöltve: ' + (ROMKEY === 'amiga' ? 'KS 3.1 (40.68)' : 'KS 1.3 (34.5)'));
        } else {
          const rom = bin(b64u8(ROM.aros)), ext = bin(b64u8(ROM.arosext));
          saeSet(cfg.memory.rom, 'aros.rom', rom);
          saeSet(cfg.memory.extRom, 'aros.ext', ext);
        }
        /* v9.3.6: HDF csatolása a Gayle IDE-re — a filesys.reset() az induláskor
           olvassa a mount.config bejegyzéseket (initialize_mountinfo). */
        if (hdf) {
          const ci = cfg.mount.config[0].ci;
          ci.controller_type = 1; /* SAEC_Config_Mount_Controller_Type_MB_IDE */
          ci.controller_unit = 0;
          ci.file.clr(); ci.file.name = hdf.name; ci.file.data = hdf.s; ci.file.size = hdf.s.length; ci.file.crc32 = false;
          ci.readonly = false; ci.blocksize = 512; /* v9.3.6: 0 maradt volna -> IDE IRQ-vihar */
        }
        /* v9.3.6: a DF0 meghajtó JELEN van (üres, type = 1) — a KS boot képernyő
           folyamatosan figyeli a DF0-t, így a behelyezett lemezt magától észreveszi.
           (Régi magatartás: type = 0, kikapcsolt meghajtó; a ROM bekapcsoláskor
           enumerálta a meghajtókat, a később behelyezett lemezt nem látta.) */
        cfg.floppy.drive[0].type = 1;
        if (cfg.floppy.drive[1]) cfg.floppy.drive[1].type = 0;
        this._sae = sae; this._cfg = cfg;
        say('SAE indítása (' + (ROMKEY === 'amiga' ? 'KS 3.1' : (ROMKEY ? 'KS 1.3' : 'AROS')) + ' ROM, ' + (hdf ? 'A1200, HDF→IDE0' : 'A500') + ')…');
        const self = this;
        const stale = () => gen !== self._gen; /* v9.3.5: közben leállították → lánc abortál */
        sae.start().then(err => {
          if (stale()) { try { sae.stop(); } catch (e) {} throw new Error('elavult SAE start megszakítva'); }
          if (err !== 0 && cfg.audio.mode >= 2) {
            cfg.audio.api = 0; /* ScriptProcessor */
            return sae.start();
          }
          return err;
        }).then(err => {
          if (stale()) { try { sae.stop(); } catch (e) {} throw new Error('elavult SAE start megszakítva'); }
          if (err !== 0) { cfg.audio.mode = 1; return sae.start(); }
          return err;
        }).then(err => {
          if (stale()) { try { sae.stop(); } catch (e) {} throw new Error('elavult SAE start megszakítva'); }
          if (err === 0) { self._running = true; say('Amiga elindult — Kickstart képernyő. ADF lemez a VEZÉRLÉS csoportban helyezhető be.'); }
          else say('SAE hiba: ' + err);
        }).catch(e => { const msg = e && e.message || String(e); if (msg.indexOf('elavult') < 0) say('SAE hiba: ' + msg); });
      } catch (e) { say('Amiga boot hiba: ' + (e && e.message || e)); }
    },
    stop() {
      this._gen++; /* v9.3.5: a futó start-lánc is érvénytelenítve */
      try { if (this._sae) this._sae.stop(); } catch (e) {} /* akkor is, ha még nem 'running' — a quit-flag átvészeli az indulást */
      this._running = false;
    },
    reset() { try { if (this._sae) this._sae.reset(true, false); } catch (e) {} },
    key(code, down) {
      try { if (this._sae) this._sae.keyPress({ code: code, repeat: false, defaultPrevented: false, target: null }, down); } catch (e) {}
    },
    typeText(str) {
      if (!this._running) return false;
      const MAPC = { '\n': 'Enter', ' ': 'Space', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', ';': 'Semicolon', "'": 'Quote', '`': 'Backquote', '\\': 'Backslash', ',': 'Comma', '.': 'Period', '/': 'Slash' };
      const SHIFTS = { '!': 'Digit1', '"': 'Digit2', '#': 'Digit3', '$': 'Digit4', '%': 'Digit5', '&': 'Digit6', '/': 'Digit7', '(': 'Digit8', ')': 'Digit9', '=': 'Digit0', '?': 'Minus', '*': 'Backquote', ':': 'Semicolon', '<': 'Comma', '>': 'Period', '_': 'Minus' };
      let i = 0;
      const tick = () => {
        if (i >= str.length) return;
        const ch = str[i++];
        let code = null, sh = false;
        if (/[a-z]/.test(ch)) code = 'Key' + ch.toUpperCase();
        else if (/[A-Z]/.test(ch)) { code = 'Key' + ch; sh = true; }
        else if (/\d/.test(ch)) code = 'Digit' + ch;
        else if (ch in MAPC) code = MAPC[ch];
        else if (ch in SHIFTS) { code = SHIFTS[ch]; sh = true; }
        if (code) {
          if (sh) this.key('ShiftLeft', true);
          this.key(code, true);
          setTimeout(() => { this.key(code, false); if (sh) this.key('ShiftLeft', false); }, 40);
        }
        setTimeout(tick, 90);
      };
      tick();
      return true;
    },
    insertDisk(name, u8) {
      if (!this._cfg) return 'Előbb indítsd el az Amigát (▶).';
      const lower = String(name || '').toLowerCase();
      if (/\.(hdf|vhd|hd0)$/.test(lower)) return this.insertHDF(name, u8); /* v9.3.6: merevlemez-kép */
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(u8.length, i + 0x8000)));
      try {
        const f = this._cfg.floppy.drive[0].file;
        f.clr(); f.name = name; f.data = s; f.size = s.length; f.crc32 = false;
        this._cfg.floppy.drive[0].type = 1;
        /* v9.3.6: a fájl objektumot is átadjuk — a régi insert(0) undefined
           fájllal hívta a disk_insert_2-t, az a file.size-nál elhasalt. */
        if (this._running && this._sae.insert) this._sae.insert(0, f);
        return name + ' behelyezve DF0-be (' + u8.length + ' bájt) — a Kickstart képernyő magától betölti.';
      } catch (e) { return 'lemezhiba: ' + e.message; }
    },
    /* v9.3.6: HDF merevlemez-kép → A1200 mód (KS 3.1), teljes újraindítással */
    insertHDF(name, u8) {
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(u8.length, i + 0x8000)));
      this._hdfPending = { name: String(name), s: s, size: u8.length };
      if (this._running) {
        this._gen++;
        try { if (this._sae) this._sae.stop(); } catch (e) {}
        this._running = false; this._sae = null; this._cfg = null;
        setTimeout(() => this.boot(this._containerId || 'rh-ami-cv', this._logFn), 80);
        return name + ' behelyezve IDE0-ra — A1200 (KS 3.1) újraindítás (' + u8.length + ' bájt)…';
      }
      return name + ' HDF beállítva (' + u8.length + ' bájt) — a ▶ indítás A1200 módban csatolja IDE0-ra.';
    },
    ejectDisk() {
      try {
        if (this._cfg) this._cfg.floppy.drive[0].file.clr();
        if (this._running && this._sae.eject) this._sae.eject(0);
        let m = 'DF0 kiadva';
        if (this._hdfPending) { this._hdfPending = null; m += ' — HDF eltávolítva, a következő ▶ indítás újra A500 (KS 1.3) módban lesz'; }
        return m;
      } catch (e) { return 'kiadási hiba: ' + e.message; }
    }
  };

  /* ---------------- gyár ---------------- */
  window.RH = window.RH || {};
  RH.createCore = function (mid) {
    switch (mid) {
      case 'c64': return makeC64();
      case 'c16': return makeC16();
      case 'ht': return makeHT();
      case 'tvc': return makeTVC();
      case 'primo': return makePrimo();
      case 'ent': return makeEnt();
      default: throw new Error('ismeretlen mag: ' + mid);
    }
  };
  RH.AMIGA = AMIGA;

  /* ---------------- ▶/⏸/↻ vezérlősáv ---------------- */
  function wireBar() {
    const st = document.querySelector('#rh-start'), pa = document.querySelector('#rh-pause'), rs = document.querySelector('#rh-reset2');
    if (st) st.onclick = () => { Object.values(RH.coreOf || {}).forEach(c => { try { c._ctl.pause(false); } catch (e) {} }); RHGEN.log('futás indítva'); };
    if (pa) pa.onclick = () => { Object.values(RH.coreOf || {}).forEach(c => { try { c._ctl.pause(true); } catch (e) {} }); RHGEN.log('szünet'); };
    if (rs) rs.onclick = () => { /* v9.3.4: a ténylegesen futó gép resetelése — nem mindig 'c64' */
      const mid = document.querySelector('#rh-kb') ? (document.querySelector('#rh-kb').dataset.mid || '') : '';
      RH.doReset(window.RH_CUR_MID || mid || 'c64');
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireBar);
  else wireBar();
})();

