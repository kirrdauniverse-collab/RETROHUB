
/* ================================================================
   RETROHUB v9 — RHGEN központi menümotor
   Minden gépen AZONOS menüszerkezet (a Spectrum-modell szerint):
   VEZÉRLÉS · HARDVER · FEJLESZTÉS · PAINT · HANG · NAPLÓ
   ================================================================ */
(function () {
  'use strict';
  const Q = s => document.querySelector(s);

  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function row(...kids) { const r = el('div', 'row'); kids.forEach(k => r.append(k)); return r; }
  function btn(lbl, fn, cls) { const b = el('button', cls || '', lbl); if (fn) b.onclick = fn; return b; }
  function help(t) { return el('p', 'help', t); }
  function note(t) { return el('div', 'note', t); }

  /* ---------------- egységes eszközcsoportok ---------------- */
  const TOOLS = [
    { id: 'ctrl', n: 'VEZÉRLÉS', d: 'Fájl/kazetta/lemez, begépelés, joystick/gamepad, reset' },
    { id: 'hw', n: 'HARDVER', d: 'RAM, ROM, grafika, hang és gépspecifikus jellemzők' },
    { id: 'dev', n: 'FEJLESZTÉS', d: 'BASIC · Assembler · Memória · AI programozó · Játékstúdió' },
    { id: 'paint', n: 'PAINT', d: 'Karakteres/pixel rajzoló a gép grafikája szerint' },
    { id: 'snd', n: 'HANG', d: '4 csatornás tracker (WebAudio), effekt, WAV-mentés, hangfájl' },
    { id: 'log', n: 'NAPLÓ', d: 'Egységes eseménynapló' }
  ];

  /* ---------------- gépenkénti konfiguráció ---------------- */
  const CFG = {
    zx81: { n: 'Sinclair ZX81' },
    zxs: { n: 'ZX Spectrum 48K' },
    c64: { n: 'Commodore 64', fileAcc: '.prg,.p00,.t64', fileN: 'PRG / P00 / T64 programfájl', saveNote: 'C64: pillanatkép mentés/betöltés él (VEZÉRLÉS csoport, v9.3) — PRG-betöltés és begépelés szintén.' },
    c16: { n: 'Commodore 16 / Plus/4', fileAcc: '.prg', fileN: 'PRG programfájl', saveNote: 'C16: pillanatkép mentés/betöltés él (VEZÉRLÉS csoport, v9.3) — PRG-betöltés és begépelés szintén.' },
    ht: { n: 'HT1080Z (TRS-80 Model I)', fileAcc: '.cmd,.cas,.bas,.txt', fileN: 'CMD (system) / CAS / BASIC forrás', saveNote: 'HT1080Z: pillanatkép mentés/betöltés él (VEZÉRLÉS csoport, v9.3) — CMD/BAS betöltés és begépelés szintén.' },
    tvc: { n: 'Videoton TVC 64+', fileAcc: '.cas,.txt', fileN: 'CAS kazettafájl', saveNote: 'TVC: pillanatkép mentés/betöltés él (VEZÉRLÉS csoport, v9.3) — CAS-betöltés és begépelés szintén.' },
    primo: { n: 'Primo B-64', fileAcc: '.pp,.ptp,.txt', fileN: 'PP quickload / PTP kazetta', saveNote: 'Primo: pillanatkép mentés/betöltés él (VEZÉRLÉS csoport, v9.3) — PP quickload és begépelés szintén.' },
    ent: { n: 'Enterprise 64/128', fileAcc: '.tap,.txt', fileN: 'TAP kazettafájl', saveNote: 'Enterprise: pillanatkép mentés/betöltés él (VEZÉRLÉS csoport, v9.3) — begépelés szintén.' },
    amiga: { n: 'Commodore Amiga 500 (SAE mag)', fileAcc: '.adf,.adz,.adf.gz,.hdf,.vhd,.hd0', fileN: 'ADF/ADZ lemez (DF0) vagy HDF merevlemez (IDE0)', saveNote: 'Amiga: a lemezműveletek élnek (ADF → DF0, HDF → IDE0/A1200), pillanatkép nem.' }
  };

  /* ---------------- eseménynapló ---------------- */
  const logs = [];
  function log(m) { logs.push({ t: new Date(), m: String(m) }); if (logs.length > 500) logs.shift(); }

  /* ---------------- aktív gép ---------------- */
  let AMID = null, APROF = null;
  function setActive(mid, prof) {
    AMID = mid; APROF = prof || null;
    log('Aktív gép: ' + (CFG[mid] ? CFG[mid].n : (prof && prof.n) || mid || '—'));
  }

  /* ================= csoport-tartalom ================= */
  let curMid = null, curGroup = 'ctrl';

  function modOf(mid) { return (window.RetroShell && RetroShell.modules || []).find(x => x.id === mid); }
  function coreOf(mid) { return mid === 'amiga' ? null : (window.RH && RH.coreOf[mid]) || null; }
  function hasCore(mid) { return mid === 'amiga' ? true : !!coreOf(mid); }
  function typeTo(mid, txt) {
    if (mid === 'amiga') return RH.AMIGA.typeText(txt);
    const c = coreOf(mid);
    if (!c || !c.typeText) return false;
    c.typeText(txt); return true;
  }

  /* ---- VEZÉRLÉS ---- */
  function pCtrl(mid) {
    const c = CFG[mid] || {}, fr = document.createDocumentFragment();
    const core = hasCore(mid);
    fr.append(el('h3', null, 'Vezérlés — ' + c.n));
    if (core) {
      const fi = el('input'); fi.type = 'file'; fi.style.display = 'none';
      if (c.fileAcc) fi.accept = c.fileAcc;
      fi.onchange = () => {
        const f = fi.files[0]; if (!f) return;
        f.arrayBuffer().then(ab => {
          if (mid === 'amiga') log('Amiga DF0: ' + RH.AMIGA.insertDisk(f.name, new Uint8Array(ab)));
          else { const co = coreOf(mid); log(c.n + ': ' + (co ? co.loadFile(f.name, new Uint8Array(ab)) : 'mag nincs betöltve')); }
        });
      };
      fr.append(fi);
      fr.append(row(btn('📁 ' + (c.fileN || 'Fájl megnyitása…'), () => fi.click(), 'primary')));
      if (mid === 'amiga') fr.append(row(btn('⏏ Lemez kiadása (DF0)', () => log(RH.AMIGA.ejectDisk()))));
    }
    /* begépelés */
    const ti = el('input'); ti.type = 'text'; ti.placeholder = 'Begépelendő sor (pl. PRINT 2+2)';
    ti.style.flex = '1';
    const tbtn = btn('⌨ Begépelés', () => {
      const v = ti.value; if (!v) return;
      if (typeTo(mid, v + '\n')) log('Begépelve: ' + v);
      else note('Begépeléshez futó emulátor-mag kell (▶ gomb).');
      ti.value = '';
    }, 'primary');
    fr.append(row(ti, tbtn));
    /* joystick / gamepad */
    const jbtn = btn('🎮 Gamepad-teszt', () => {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      const g = [...gps].find(x => x);
      log(g ? ('Gamepad: ' + g.id + ' — ' + g.buttons.length + ' gomb, ' + g.axes.length + ' tengely') : 'Nincs csatlakoztatott gamepad.');
    });
    fr.append(row(jbtn));
    if (core) fr.append(row(btn('↻ Reset', () => { mid === 'amiga' ? RH.AMIGA.reset() : RH.doReset(mid); }, 'primary')));
    /* v9.3 — pillanatkép: a futó mag állapotának mentése/betöltése (böngésző vagy .rhsnap fájl) */
    if (window.RH_SNAP) RH_SNAP.ctrlPane(fr, mid, { el: el, btn: btn, row: row, note: note, help: help });
    fr.append(help('A fájl megnyitása a képernyő alatti FÁJL / KAZETTA gombbal is elérhető; a begépelés a gép saját ROM-jába üti be a karaktereket.'));
    return fr;
  }

  /* ---- HARDVER ---- */
  function pHw(mid) {
    const c = CFG[mid] || {}, m = modOf(mid), fr = document.createDocumentFragment();
    fr.append(el('h3', null, 'Hardver — ' + c.n));
    if (m) {
      const ch = el('div', 'chips');
      [['CPU', m.cpu], ['RAM', m.ram], ['Felbontás', m.res[0] + '×' + m.res[1]], ['Szöveg', m.txt], ['Színek', String(m.col)], ['Hang', m.snd]]
        .forEach(p => { const s = el('span', 'pchip', p[0] + ': ' + p[1]); ch.append(s); });
      fr.append(ch);
      const w = el('div'); w.style.margin = '6px 0';
      (m.pal || []).forEach(k => { const s = el('span', 'sw'); s.style.background = k; w.append(s); });
      fr.append(w, el('p', 'help', 'Színtábla: ' + (m.pal || []).length + ' megjelenített alapszín, ' + m.col + ' hardveres szín.'));
    }
    const roms = { c64: 'BASIC 8K + KERNAL 8K + CHAR 4K', c16: 'BASIC 16K + KERNAL 16K', ht: 'HT1.ROM 12K (TRS-80 Level II)', tvc: 'TVC 2.2 sys 16K + ext 8K', primo: 'B64 ROM 16K', ent: 'EXOS 32K + BASIC 16K', amiga: 'AROS Kickstart 512K + Ext', zx81: 'ZX81 ROM 8K', zxs: 'Spectrum ROM 16K' };
    fr.append(el('p', 'help', 'Beágyazott ROM: ' + (roms[mid] || '—') + ' — letöltés nélkül fut.'));
    const kb = KB[mid];
    if (kb && kb.rows) {
      let n = 0; kb.rows.forEach(r => n += r.length);
      fr.append(el('p', 'help', 'Virtuális billentyűzet: ' + n + ' gomb (' + kb.rows.length + ' sor), a képernyő alatt mindig az aktuális gépé látszik.'));
    }
    if (!hasCore(mid)) fr.append(note('Ennél a gépnél nincs emulátor-mag: a hardver adatlap a fejlesztői funkciók (AI, tracker, rajzoló) mellett tájékoztató.'));
    return fr;
  }

  /* ---- FEJLESZTÉS (alcímkékkel) ---- */
  const DEVTABS = [
    { id: 'basic', n: 'BASIC' }, { id: 'asm', n: 'Assembler' }, { id: 'mem', n: 'Memória' },
    { id: 'ai', n: 'AI programozó' }, { id: 'studio', n: 'Játékstúdió' }
  ];
  let curDevTab = 'basic';

  function dBasic(mid) {
    const fr = document.createDocumentFragment();
    const ta = el('textarea'); ta.rows = 8; ta.spellcheck = false;
    ta.value = '10 PRINT "HELLO RETROHUB"\n20 GOTO 10\nRUN\n';
    const out = el('div', 'help', 'A BASIC-sort a gép saját ROM-ja fogadja (valódi billentyűzet-emuláció).');
    fr.append(ta, row(btn('▶ Begépelés és futtatás', () => {
      const lines = ta.value.split('\n').filter(x => x.length);
      let ok = true;
      lines.forEach(l => { if (!typeTo(mid, l + '\n')) ok = false; });
      out.textContent = ok ? ('Begépelve ' + lines.length + ' sor.') : 'Begépeléshez futó emulátor-mag kell (indítsd a ▶ gombbal).';
    }, 'primary')));
    fr.append(out);
    return fr;
  }

  function dAsm(mid) {
    const fr = document.createDocumentFragment();
    const z80m = ['ht', 'tvc', 'primo', 'ent', 'zxs', 'zx81'].indexOf(mid) >= 0;
    if (!z80m) { fr.append(note('A 6502-magos gépekhez (C64, C16) az assembler ebben a verzióban még nem érhető el — a Z80-as gépeken teljes.')); return fr; }
    const ORG = { ht: 0x7000, tvc: 0x8000, primo: 0x7000, ent: 0x4000, zxs: 0x8000, zx81: 0x4082 };
    const oi = el('input'); oi.type = 'text'; oi.value = (ORG[mid] || 0x8000).toString(16).toUpperCase(); oi.size = 6;
    const ta = el('textarea'); ta.rows = 10; ta.spellcheck = false;
    ta.value = '; RETROHUB Z80 demó\n        org $' + oi.value + '\nstart:  ld a,2\n        out ($fe),a   ; keret színe (Spectrum)\nloop:   inc a\n        jr loop\n';
    const out = el('pre', 'help', ' Fordítás után betölthető a memóriába.');
    fr.append(row(el('span', null, 'ORG: $'), oi), ta,
      row(btn('⚙ Fordítás', () => {
        try {
          const r = window.RHASM.assemble(ta.value, parseInt(oi.value, 16));
          out.textContent = r.bytes.length + ' bájt — ' + r.listing.slice(0, 400);
          out._bytes = r.bytes; out._org = r.org;
        } catch (e) { out.textContent = 'HIBA: ' + e.message; out._bytes = null; }
      }), btn('⬇ Betöltés a memóriába', () => {
        const c = coreOf(mid);
        if (!c || !out._bytes) { out.textContent = out._bytes ? 'Előbb indítsd a magot (▶).' : 'Előbb fordíts.'; return; }
        out._bytes.forEach((b, i) => c.memWrite(out._org + i, b));
        log('Assembler: ' + out._bytes.length + ' bájt betöltve a $' + out._org.toString(16).toUpperCase() + ' címre.');
      }, 'primary')), out);
    return fr;
  }

  function dMem(mid) {
    const fr = document.createDocumentFragment();
    const c = coreOf(mid);
    const ai = el('input'); ai.type = 'text'; ai.value = mid === 'c64' ? '0400' : mid === 'ht' ? '3C00' : mid === 'c16' ? '0C00' : '8000'; ai.size = 6;
    const grid = el('div', 'rh-memgrid');
    let timer = null;
    function render() {
      const cc = coreOf(mid);
      if (!cc) { grid.textContent = 'Az élő memórianézethez futó mag kell (▶ gomb).'; return; }
      const base = parseInt(ai.value, 16) || 0;
      let s = '      ' + Array.from({ length: 16 }, (_, i) => i.toString(16).padStart(1, '0')).join(' ') + '\n';
      for (let r = 0; r < 8; r++) {
        s += (base + r * 16).toString(16).padStart(4, '0').toUpperCase() + '  ';
        for (let i = 0; i < 16; i++) {
          const a = base + r * 16 + i;
          const v = cc.memRead(a);
          s += (v == null ? '??' : v.toString(16).padStart(2, '0').toUpperCase()) + ' ';
        }
        s += '\n';
      }
      grid.textContent = s;
    }
    fr.append(row(el('span', null, 'Cím: $'), ai, btn('↻ Frissítés', render), btn('⏱ Élő nézet', () => {
      if (timer) { clearInterval(timer); timer = null; log('élő nézet: ki'); }
      else { timer = setInterval(render, 500); log('élő nézet: 500 ms'); }
    })));
    fr.append(grid, help('A memória a mag bankszervezésével egyenesen olvasható. Írás: az Assembler „Betöltés” gombja vagy a BASIC POKE útján.'));
    render();
    return fr;
  }

  function dAi(mid) {
    const fr = document.createDocumentFragment();
    const SYS = {
      c64: 'You write Commodore 64 BASIC V2 programs. Reply ONLY with the BASIC listing, line numbers included, no explanation.',
      c16: 'You write Commodore 16 / Plus/4 BASIC 3.5 programs. Reply ONLY with the listing, line numbers included.',
      ht: 'You write TRS-80 Level II BASIC programs for a 64x16 text screen. Reply ONLY with the listing, line numbers included.',
      tvc: 'You write Videoton TVC BASIC programs. Reply ONLY with the listing, line numbers included.',
      primo: 'You write Primo BASIC programs. Reply ONLY with the listing, line numbers included.',
      ent: 'You write Enterprise BASIC programs. Reply ONLY with the listing, line numbers included.',
      amiga: 'You write short AmigaBASIC programs. Reply ONLY with the listing, line numbers included.'
    };
    const ta = el('textarea'); ta.rows = 4; ta.placeholder = 'Kérés (pl.: írj egy pattogó labda demót!)';
    const out = el('div', 'rh-ai-log', 'Válasz itt jelenik meg. Szolgáltató: a 🤖 AI gombnál állítható.');
    const res = el('textarea'); res.rows = 7; res.spellcheck = false; res.hidden = true;
    fr.append(ta, row(btn('🤖 Kérés az AI-hoz', async () => {
      if (!ta.value.trim()) return;
      out.textContent = 'Gondolkodom…';
      try {
        const r = await RHAI.chat(ta.value, SYS[mid] || 'You write short retro BASIC programs. Reply ONLY with the listing.', []);
        res.value = r; res.hidden = false;
        out.textContent = 'Kész — a válasz begépelhető vagy szerkeszthető.';
        log('AI-válasz megérkezett (' + r.length + ' karakter).');
      } catch (e) {
        out.textContent = 'HIBA: ' + e.message;
        out.className = 'rh-ai-log err';
        log('AI-hiba: ' + e.message);
      }
    }, 'primary')), out, res,
      row(btn('⌨ Begépelés a gépre', () => {
        const lines = res.value.split('\n').map(x => x.trim()).filter(x => /^\d/.test(x) || /^(RUN|LIST)/i.test(x));
        if (!lines.length) return;
        lines.forEach(l => typeTo(mid, l + '\n'));
        log('AI-program begépelve (' + lines.length + ' sor).');
      })));
    fr.append(help('A szolgáltató és a kulcs a fejlécben lévő 🤖 AI gombbal állítható. Éjszakai módban a hálózat nélküli hívások automatikusan tartalék-láncra váltanak.'));
    return fr;
  }

  function dStudio(mid) {
    const fr = document.createDocumentFragment();
    const N = 8;
    const cells = [];
    const g = el('div'); g.style.cssText = 'display:grid;grid-template-columns:repeat(8,26px);gap:2px;margin:6px 0';
    for (let i = 0; i < N * N; i++) {
      const c = el('div'); c.style.cssText = 'width:26px;height:26px;background:#000;border:1px solid #444;cursor:pointer';
      c.dataset.on = '0';
      c.onclick = () => { c.dataset.on = c.dataset.on === '1' ? '0' : '1'; c.style.background = c.dataset.on === '1' ? 'var(--fg)' : '#000'; };
      cells.push(c); g.append(c);
    }
    const out = el('textarea'); out.rows = 4; out.readOnly = true; out.spellcheck = false;
    function toData() {
      let lines = [];
      for (let r = 0; r < N; r += 2) {
        let vals = [];
        for (let r2 = r; r2 < r + 2; r2++) {
          let b = 0;
          for (let cix = 0; cix < N; cix++) b = (b << 1) | (cells[r2 * N + cix].dataset.on === '1' ? 1 : 0);
          vals.push(b);
        }
        lines.push('DATA ' + vals.join(','));
      }
      return lines.join('\n');
    }
    fr.append(el('p', 'help', '8×8 sprite/UDG rajzoló — két bájtos sorokként DATA-listába exportálható, és begépelhető a gépre.'), g,
      row(btn('⬇ DATA-lista készítése', () => { out.value = toData(); }), btn('⌨ Begépelés a gépre', () => {
        if (!out.value) out.value = toData();
        typeTo(mid, out.value + '\n');
      }), btn('🗑 Törlés', () => cells.forEach(c => { c.dataset.on = '0'; c.style.background = '#000'; }))), out);
    return fr;
  }

  function pDev(mid) {
    const fr = document.createDocumentFragment();
    const tabs = el('div', 'subtabs');
    DEVTABS.forEach(t => {
      const b = btn(t.n, () => { curDevTab = t.id; renderGroup(); });
      if (t.id === curDevTab) b.classList.add('on');
      tabs.append(b);
    });
    fr.append(tabs);
    fr.append(curDevTab === 'basic' ? dBasic(mid) : curDevTab === 'asm' ? dAsm(mid) : curDevTab === 'mem' ? dMem(mid) : curDevTab === 'ai' ? dAi(mid) : dStudio(mid));
    return fr;
  }

  /* ---- PAINT ---- */
  function pPaint(mid) {
    const fr = document.createDocumentFragment();
    const m = modOf(mid) || {};
    const CW = 32, CH = 16, CELL = 14;
    const cv = el('canvas'); cv.width = CW * CELL; cv.height = CH * CELL;
    cv.className = 'rh-paint-cv';
    const ctx = cv.getContext('2d');
    let color = m.pal && m.pal[1] || '#fff';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    let drawing = false;
    function paint(e) {
      const r = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / CELL), y = Math.floor((e.clientY - r.top) / CELL);
      if (x < 0 || y < 0 || x >= CW || y >= CH) return;
      ctx.fillStyle = color; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    cv.onpointerdown = e => { drawing = true; paint(e); };
    cv.onpointermove = e => { if (drawing) paint(e); };
    window.addEventListener('pointerup', () => drawing = false);
    const pal = el('div', 'rh-pal');
    (m.pal || ['#000', '#fff']).forEach(k => {
      const s = el('span', 'sw'); s.style.background = k;
      s.onclick = () => { color = k; [...pal.children].forEach(x => x.classList.remove('on')); s.classList.add('on'); };
      pal.append(s);
    });
    fr.append(el('h3', null, 'Paint — ' + CW + '×' + CH + ' karaktermozaik'), row(cv), pal,
      row(btn('🧹 Törlés', () => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); }),
        btn('⌨ Képernyőre írása', () => {
          const c = coreOf(mid);
          if (!c || !c.screenWrite) { log('A képernyőre íráshoz futó mag kell.'); return; }
          const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
          for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
            const px = (y * CELL + 3) * cv.width * 4 + (x * CELL + 3) * 4;
            const on = img[px] > 60 || img[px + 1] > 60 || img[px + 2] > 60;
            c.screenWrite(y, x, on ? 0x2A : 32); /* '*' vagy szóköz */
          }
          log('Paint: ' + CW * CH + ' karakter a képernyő-memóriába írva.');
        }),
        btn('💾 PNG mentés', () => {
          const a = el('a'); a.download = 'retrohub-paint.png'; a.href = cv.toDataURL('image/png'); a.click();
        }, 'primary')));
    return fr;
  }

  /* ---- HANG (4 csatornás tracker) ---- */
  let AC = null;
  function audioCtx() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
  const NOTE_RE = /^([A-G])(#|b)?(\d)$/;
  function noteHz(s) {
    const m = NOTE_RE.exec(s.trim().toUpperCase()); if (!m) return 0;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 440 * Math.pow(2, (base - 9) / 12 + (parseInt(m[3], 10) - 4));
  }
  function pSnd(mid) {
    const fr = document.createDocumentFragment();
    const ta = el('textarea'); ta.rows = 8; ta.spellcheck = false;
    ta.value = 'C4 E4 G4 C5\nE4 G4 B4 E5\nG4 C5 E5 G5\nC5 E5 G5 C6';
    const tempo = el('input'); tempo.type = 'text'; tempo.value = '280'; tempo.size = 5;
    const wave = el('select');
    [['square', 'Négyzet (beep)'], ['sawtooth', 'Fűrész'], ['triangle', 'Háromszög'], ['sine', 'Színusz']].forEach(w => {
      const o = el('option', null, w[1]); o.value = w[0]; wave.append(o);
    });
    let playing = false;
    function stopAll() { playing = false; }
    function play() {
      if (playing) return; playing = true;
      const ac = audioCtx(); const step = 60 / Math.max(60, parseInt(tempo.value, 10) || 280);
      const rows = ta.value.split('\n').map(r => r.trim()).filter(Boolean);
      let t = ac.currentTime + 0.05;
      rows.forEach(r => {
        r.split(/\s+/).forEach((n, ch) => {
          const hz = noteHz(n); if (!hz) return;
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = wave.value; o.frequency.value = hz;
          g.gain.setValueAtTime(0.001, t);
          g.gain.linearRampToValueAtTime(0.18, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + step * 0.9);
          o.connect(g).connect(ac.destination);
          o.start(t); o.stop(t + step);
        });
        t += step;
      });
      log('Tracker: ' + rows.length + ' lépés lejátszása (' + wave.value + ').');
      setTimeout(stopAll, (t - ac.currentTime) * 1000 + 100);
    }
    function wavSave() {
      const sr = 22050, stepS = 60 / Math.max(60, parseInt(tempo.value, 10) || 280);
      const rows = ta.value.split('\n').map(r => r.trim()).filter(Boolean);
      const len = Math.ceil(sr * stepS) * rows.length;
      const buf = new ArrayBuffer(44 + len * 2), v = new DataView(buf);
      const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      ws(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); ws(8, 'WAVEfmt '); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
      v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      ws(36, 'data'); v.setUint32(40, len * 2, true);
      for (let i = 0; i < len; i++) {
        const rowN = Math.floor(i / (sr * stepS)), ph = (i % Math.floor(sr * stepS)) / sr;
        const hz = noteHz(rows[rowN].split(/\s+/)[0]) || 0;
        const smp = hz ? Math.round(9000 * Math.sign(Math.sin(2 * Math.PI * hz * ph))) : 0;
        v.setInt16(44 + i * 2, smp, true);
      }
      const a = el('a'); a.download = 'retrohub-track.wav'; a.href = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })); a.click();
      log('Tracker: WAV exportálva (' + len + ' minta).');
    }
    const fi = el('input'); fi.type = 'file'; fi.accept = 'audio/*'; fi.style.display = 'none';
    const au = el('audio'); au.controls = true; au.style.width = '100%'; au.hidden = true;
    fi.onchange = () => { const f = fi.files[0]; if (!f) return; au.src = URL.createObjectURL(f); au.hidden = false; au.play(); log('Hangfájl: ' + f.name); };
    fr.append(el('h3', null, 'Hang — 4 csatornás tracker (WebAudio)'), ta,
      row(el('span', null, 'Tempó: '), tempo, wave, btn('▶ Lejátszás', play, 'primary'), btn('⏹ Stop', stopAll)),
      row(btn('💾 WAV mentés', wavSave), btn('🎵 Hangfájl lejátszása…', () => fi.click())),
      au, help('A tracker minden gépen szól — WebAudio alapú, a gép hangchipjétől függetlenül. Mintaillesztés: C D E F G A B, #/b, oktáv 1-6.'));
    return fr;
  }

  /* ---- NAPLÓ ---- */
  function pLog(mid) {
    const fr = document.createDocumentFragment();
    const box = el('div', 'rh-ai-log'); box.style.height = '260px';
    function refresh() {
      box.innerHTML = '';
      logs.slice(-100).forEach(l => {
        const d = el('div', 'sys', l.t.toTimeString().slice(0, 8) + '  ' + l.m);
        box.append(d);
      });
      box.scrollTop = box.scrollHeight;
    }
    refresh();
    fr.append(el('h3', null, 'Napló'), box, row(btn('🧹 Törlés', () => { logs.length = 0; refresh(); }), btn('↻ Frissítés', refresh)));
    return fr;
  }

  function grpBody(mid, gid) {
    switch (gid) {
      case 'ctrl': return pCtrl(mid);
      case 'hw': return pHw(mid);
      case 'dev': return pDev(mid);
      case 'paint': return pPaint(mid);
      case 'snd': return pSnd(mid);
      default: return pLog(mid);
    }
  }

  function renderGroup() {
    const gr = Q('#rh-groupr'), ct = Q('#rh-content');
    if (!gr || !ct) return;
    const mid = curMid;
    gr.innerHTML = '';
    TOOLS.forEach(t => {
      const b = btn(t.n, () => { curGroup = t.id; renderGroup(); });
      b.title = t.d;
      if (t.id === curGroup) b.classList.add('on');
      gr.append(b);
    });
    ct.innerHTML = '';
    ct.append(grpBody(mid, curGroup));
  }

  function openTool(mid, id) {
    if (mid) curMid = mid;
    if (id) curGroup = id;
    /* a központ nyitottságát a shell kezeli (devbtn/F12) — itt csak a tartalom épül */
    renderGroup();
  }

  /* ================= profil-gépek generikus pane-je ================= */
  function pane(x, m, core) {
    const p = Q('#pane');
    if (!p) return;
    curMid = m.id;
    p.innerHTML = '';
    p.append(grpBody(m.id, x.id));
    if (!window.RH || !RH.coreOf[m.id]) {
      const n = el('div', 'note');
      n.textContent = '▒ Profil-gép: emulátor-mag nincs bekötve — a fejlesztői központ (AI, tracker, rajzoló, napló) ennek ellenére teljesen működik.';
      p.append(n);
    }
  }

  /* ================= billentyűzetek ================= */
  /* C64: pozíciók a KERNAL kulcstáblájából */
  function c64pos(sc) {
    const t = window.RH_C64_KTAB || [];
    for (let i = 0; i < 64; i++) if ((t[i] & 0x7F) === sc) return { r: i >> 3, c: i & 7 };
    return null;
  }
  function c64Rows() {
    function L(l, sc, s) { const p = c64pos(sc); return p ? Object.assign({ l: l, r: p.r, c: p.c }, s ? { s: s } : {}) : null; }
    const SP = { l: 'SPACE', r: 7, c: 4, w: 2 };
    const rows = [
      [L('←', 0x5F), L('1', 0x31), L('2', 0x32, '"'), L('3', 0x33, '#'), L('4', 0x34, '$'), L('5', 0x35, '%'), L('6', 0x36, '&'), L('7', 0x37, "'"), L('8', 0x38, '('), L('9', 0x39, ')'), L('0', 0x30), L('+', 0x2B), L('-', 0x2D), L('£', 0x5C), { l: 'HOME', r: 6, c: 3, w: 2 }, { l: 'DEL', r: 0, c: 0, w: 2 }],
      [Object.assign({ l: 'CTRL', r: 7, c: 2, w: 1, mod: 1 }), L('Q', 0x51), L('W', 0x57), L('E', 0x45), L('R', 0x52), L('T', 0x54), L('Y', 0x59), L('U', 0x55), L('I', 0x49), L('O', 0x4F), L('P', 0x50), L('@', 0x40), L('*', 0x2A), L('↑', 0x5E), { l: 'RESTORE', r: -1, c: -1, w: 2 }],
      [{ l: 'RUN/STOP', r: 7, c: 7, w: 1 }, { l: 'CBM', r: 7, c: 5, w: 1, mod: 1 }, L('A', 0x41), L('S', 0x53), L('D', 0x44), L('F', 0x46), L('G', 0x47), L('H', 0x48), L('J', 0x4A), L('K', 0x4B), L('L', 0x4C), L(':', 0x3A), L(';', 0x3B), L('=', 0x3D), { l: 'RETURN', r: 0, c: 1, w: 2 }],
      [{ l: 'SHIFT', r: 1, c: 7, w: 2, mod: 1 }, L('Z', 0x5A), L('X', 0x58), L('C', 0x43), L('V', 0x56), L('B', 0x42), L('N', 0x4E), L('M', 0x4D), L(',', 0x2C), L('.', 0x2E), L('/', 0x2F), { l: 'SHIFT', r: 6, c: 4, w: 2, mod: 1 }, { l: '↓', r: 0, c: 7 }, { l: '→', r: 0, c: 2 }],
      [SP]
    ];
    return rows.map(r => r.filter(Boolean));
  }
  function c16Rows() {
    /* A C16 KERNAL valódi mátrixa (a ROM $E026 unshifted / $E067 shifted táblái
       szerint — a fizikai elrendezés vizuális, a (r,c) a ROM-féle sor/oszlop) */
    const K = (l, r, c, s, mod, w) => { const o = { l: l, r: r, c: c }; if (s) o.s = s; if (mod) o.mod = 1; if (w) o.w = w; return o; };
    return [
      [K('←', 6, 0), K('1', 7, 0, '!'), K('2', 7, 3, '"'), K('3', 1, 0, '#'), K('4', 1, 3, '$'), K('5', 2, 0, '%'), K('6', 2, 3, '&'), K('7', 3, 0, '\''), K('8', 3, 3, '('), K('9', 4, 0, ')'), K('0', 4, 3), K('+', 6, 6), K('-', 5, 6, '_'), K('£', 0, 2), K('HOME', 7, 1), K('DEL', 0, 0, 'INS', 0, 2)],
      [K('CTRL', 7, 2), K('Q', 7, 6), K('W', 1, 1), K('E', 1, 6), K('R', 2, 1), K('T', 2, 6), K('Y', 3, 1), K('U', 3, 6), K('I', 4, 1), K('O', 4, 6), K('P', 5, 1), K('@', 0, 7), K('*', 6, 1, '<'), K('↑', 5, 3), K('RUN/STOP', 7, 7)],
      [K('C=', 7, 5), K('SHIFT', 1, 7), K('A', 1, 2), K('S', 1, 5), K('D', 2, 2), K('F', 2, 5), K('G', 3, 2), K('H', 3, 5), K('J', 4, 2), K('K', 4, 5), K('L', 5, 2), K(':', 5, 5, '['), K(';', 6, 2, ']'), K('=', 6, 5, '_'), K('RETURN', 0, 1, '', 0, 2)],
      [K('ESC', 6, 4), K('Z', 1, 4), K('X', 2, 7), K('C', 2, 4), K('V', 3, 7), K('B', 3, 4), K('N', 4, 7), K('M', 4, 4), K(',', 5, 7, '<'), K('.', 5, 4, '>'), K('/', 6, 7, '?'), K('F1', 0, 3), K('F2', 0, 4), K('F3', 0, 5), K('HELP', 0, 6)],
      [K('↓', 5, 0), K('↑', 5, 3), K('←', 6, 0), K('→', 6, 3)]
    ];
  }
  function fromLibRows(lib, keyFns) {
    return lib.map(row => row.map(k => {
      const o = { l: k.label || k.l, r: keyFns.a(k), c: keyFns.b(k) };
      if (k.sub) o.s = k.sub;
      if (k.wide) o.w = 2;
      if (/SHIFT|CTRL|CTR|CAPS|ALT|ESC/i.test(o.l)) o.mod = 1;
      return o;
    }));
  }
  function amigaRows() {
    function K(l, code, w, s) { const o = { l: l, code: code }; if (w) o.w = w; if (s) o.s = s; if (/SHIFT|CTRL|ALT|AMI/.test(l)) o.mod = 1; return o; }
    return [
      [K('ESC', 'Escape'), K('F1', 'F1'), K('F2', 'F2'), K('F3', 'F3'), K('F4', 'F4'), K('F5', 'F5'), K('F6', 'F6'), K('F7', 'F7'), K('F8', 'F8'), K('F9', 'F9'), K('F10', 'F10')],
      [K('←`', 'Backquote'), K('1', 'Digit1'), K('2', 'Digit2'), K('3', 'Digit3'), K('4', 'Digit4'), K('5', 'Digit5'), K('6', 'Digit6'), K('7', 'Digit7'), K('8', 'Digit8'), K('9', 'Digit9'), K('0', 'Digit0'), K('-', 'Minus'), K('=', 'Equal'), K('\\', 'Backslash'), K('⌫', 'Backspace', 2)],
      [K('TAB', 'Tab', 2), K('Q', 'KeyQ'), K('W', 'KeyW'), K('E', 'KeyE'), K('R', 'KeyR'), K('T', 'KeyT'), K('Y', 'KeyY'), K('U', 'KeyU'), K('I', 'KeyI'), K('O', 'KeyO'), K('P', 'KeyP'), K('[', 'BracketLeft'), K(']', 'BracketRight'), K('DEL', 'Delete', 1), K('RETURN', 'Enter', 2)],
      [K('CTRL', 'ControlLeft', 2), K('A', 'KeyA'), K('S', 'KeyS'), K('D', 'KeyD'), K('F', 'KeyF'), K('G', 'KeyG'), K('H', 'KeyH'), K('J', 'KeyJ'), K('K', 'KeyK'), K('L', 'KeyL'), K(';', 'Semicolon'), K("'", 'Quote'), K('CAPS', 'CapsLock', 1)],
      [K('SHIFT', 'ShiftLeft', 2), K('Z', 'KeyZ'), K('X', 'KeyX'), K('C', 'KeyC'), K('V', 'KeyV'), K('B', 'KeyB'), K('N', 'KeyN'), K('M', 'KeyM'), K(',', 'Comma'), K('.', 'Period'), K('/', 'Slash'), K('SHIFT', 'ShiftRight', 2), K('↑', 'ArrowUp'), K('↓', 'ArrowDown')],
      [K('LAMI', 'MetaLeft', 1), K('ALT', 'AltLeft', 1), K('SPACE', 'Space', 6), K('RALT', 'AltRight', 1), K('RAMI', 'MetaRight', 1), K('←', 'ArrowLeft'), K('→', 'ArrowRight')]
    ];
  }

  const KB = {
    c64: { rows: null, title: 'COMMODORE 64 BILLENTYŰZET' },
    c16: { rows: null, title: 'COMMODORE 16 / PLUS/4 BILLENTYŰZET' },
    ht: { rows: null, title: 'HT1080Z (TRS-80) BILLENTYŰZET' },
    tvc: { rows: null, title: 'VIDEOTON TVC BILLENTYŰZET' },
    primo: { rows: null, title: 'PRIMO BILLENTYŰZET' },
    ent: { rows: null, title: 'ENTERPRISE BILLENTYŰZET' },
    amiga: { rows: null, title: 'AMIGA BILLENTYŰZET' }
  };

  function kbRows(mid) {
    const k = KB[mid];
    if (k.rows) return k.rows;
    try {
      if (mid === 'c64') k.rows = c64Rows();
      else if (mid === 'c16') k.rows = c16Rows();
      else if (mid === 'ht' && window.RH_HTKB) k.rows = RH_HTKB.rows;
      else if (mid === 'tvc' && window.TVC_ROWS) k.rows = fromLibRows(TVC_ROWS, { a: k2 => k2.line, b: k2 => k2.bit });
      else if (mid === 'primo' && window.PRIMO_LAYOUT) k.rows = fromLibRows(PRIMO_LAYOUT, { a: k2 => k2.group, b: k2 => k2.bit });
      else if (mid === 'ent' && window.EP_LAYOUT) k.rows = fromLibRows(EP_LAYOUT, { a: k2 => k2.row, b: k2 => k2.bit });
      else if (mid === 'amiga') k.rows = amigaRows();
    } catch (e) { log('billentyűzet-hiba: ' + e.message); }
    return k.rows || [];
  }

  /* ============ fizikai billentyűzet-híd (v9.2.3) ============
     A window-szintű keydown/keyup eseményeket a virtuális billentyűzet
     mátrix-koordinátáira képezi le, és a mag matrix() hívására továbbítja.
     A Shift+szimbólum kombinációkat a gombok sub-címkéi alapján oldja fel. */
  const PHYS_SPECIAL = {
    Enter: ['RETURN', 'ENTER', 'BE', '⏎'],
    Backspace: ['DEL', 'ERASE', '⌫', 'CLS'],
    Tab: ['TAB'],
    Escape: ['ESC', 'BRK', 'STOP'],
    ArrowLeft: ['←', 'LEFT', 'CRSR↔'],
    ArrowRight: ['→', 'RIGHT', 'CRSR↔'],
    ArrowUp: ['↑', 'UP', 'CRSR↕'],
    ArrowDown: ['↓', 'DOWN', 'CRSR↕'],
    Delete: ['DEL', 'ERASE'],
    Insert: ['INS'],
    Home: ['HOME', 'CLR', 'CLS'],
    ControlLeft: ['CTRL', 'CTR'],
    ControlRight: ['CTRL', 'CTR'],
    ShiftLeft: ['SHIFT'],
    ShiftRight: ['SHIFT'],
    AltLeft: ['ALT'],
    AltRight: ['ALT'],
    CapsLock: ['CAPS'],
    Space: ['SPACE']
  };
  const PHYS_HELD = {};
  function physFind(mid, label) {
    try {
      const rows = kbRows(mid);
      for (const row of rows) for (const k of row) {
        if (k && k.r >= 0 && k.l && k.l.toUpperCase() === label) return k;
      }
    } catch (e) {}
    return null;
  }
  function physFindSub(mid, ch) {
    try {
      const rows = kbRows(mid);
      for (const row of rows) for (const k of row) {
        if (k && k.r >= 0 && k.s && k.s.length === 1 && k.s === ch) return k;
      }
    } catch (e) {}
    return null;
  }
  function rhPhysKey(e, on) {
    const mid = (window.RHGEN && window.RHGEN._active) || null;
    if (!mid || mid === 'amiga') return; /* az Amigát az SAE kezeli */
    const c = coreOf(mid);
    if (!c || !c.matrix) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    let kk = null, needShift = null;
    const spec = PHYS_SPECIAL[e.code];
    if (spec) { for (const lb of spec) { kk = physFind(mid, lb); if (kk) break; } }
    if (!kk && e.key && e.key.length === 1) {
      const up = e.key.toUpperCase();
      kk = physFind(mid, up) || physFind(mid, e.key);
      if (!kk) {
        kk = physFindSub(mid, e.key);
        if (kk) needShift = physFind(mid, 'SHIFT');
      }
    }
    if (!kk) return;
    if (on) {
      e.preventDefault();
      if (e.repeat) return;
      const entry = { keys: [kk], shift: null };
      if (needShift) { keyDown(mid, needShift, true); entry.shift = needShift; }
      keyDown(mid, kk, true);
      PHYS_HELD[e.code] = entry;
    } else {
      const entry = PHYS_HELD[e.code];
      if (!entry) return;
      for (const k of entry.keys) keyDown(mid, k, false);
      if (entry.shift) keyDown(mid, entry.shift, false);
      delete PHYS_HELD[e.code];
    }
  }
  window.addEventListener('keydown', e => rhPhysKey(e, true), true);
  window.addEventListener('keyup', e => rhPhysKey(e, false), true);
  window.addEventListener('blur', () => {
    const mid = (window.RHGEN && window.RHGEN._active) || null;
    for (const code in PHYS_HELD) {
      const en = PHYS_HELD[code];
      for (const k of en.keys) keyDown(mid, k, false);
      if (en.shift) keyDown(mid, en.shift, false);
      delete PHYS_HELD[code];
    }
  });

  const stuck = {};
  function keyDown(mid, k, on) {
    if (k.code) { if (mid === 'amiga' && window.RH) RH.AMIGA.key(k.code, on); return; }
    if (k.r < 0) return;
    const c = coreOf(mid);
    if (c && c.matrix) c.matrix(k.r, k.c, on);
  }
  function showKeyboard(mid) {
    const grid = Q('#rh-kb-grid'), title = Q('#rh-kb-title'), st = Q('#rh-kb-status');
    if (!grid) return;
    const k = KB[mid];
    if (title && k) title.textContent = k.title;
    if (st) st.innerHTML = '';
    grid.innerHTML = '';
    stuck[mid] = {};
    kbRows(mid).forEach(rowK => {
      const rd = el('div', 'kbrow');
      rowK.forEach(kk => {
        const b = el('div', 'kb-key' + (kk.w ? ' w' + Math.min(12, kk.w * 2) : '') + (kk.mod ? ' mod' : ''));
        const main = el('b', null, kk.l);
        b.append(main);
        if (kk.s) { b.append(el('span', 'sub', kk.s)); }
        b.dataset.l = kk.l;
        if (kk.mod) {
          b.onclick = () => {
            const on = !b.classList.contains('stuck');
            b.classList.toggle('stuck', on);
            keyDown(mid, kk, on);
          };
        } else {
          b.onpointerdown = () => keyDown(mid, kk, true);
          b.onpointerup = b.onpointerleave = () => keyDown(mid, kk, false);
        }
        rd.append(b);
      });
      grid.append(rd);
    });
  }

  /* ================= Z80 assembler (RHASM) ================= */
  const R8 = { B: 0, C: 1, D: 2, E: 3, H: 4, L: 5, '(HL)': 6, A: 7 };
  const RR = { BC: 0, DE: 1, HL: 2, SP: 3 };
  const RP = { BC: 0, DE: 1, HL: 2, AF: 3 };
  const CC = { NZ: 0, Z: 1, NC: 2, C: 3 };
  const RHASM = {
    assemble(src, orgIn) {
      let org = orgIn >>> 0;
      const lines = src.split('\n');
      const labels = {};
      const stmts = [];
      lines.forEach(raw => {
        let l = raw.replace(/;.*$/, '').trim();
        if (!l) return;
        const lm = /^([A-Za-z_][\w.]*):?\s*(.*)$/.exec(l);
        if (lm && /:$/.test(l.trim()) || (lm && lm[1] && !/^(LD|JP|JR|INC|DEC|ADD|ADC|SUB|SBC|AND|OR|XOR|CP|CALL|RET|PUSH|POP|OUT|IN|EX|DI|EI|NOP|HALT|ORG|DB|DEFB|DS|EQU)$/i.test(lm[1]) && lm[2] !== undefined)) {
          const rest = lm[2].trim();
          labels[lm[1].toUpperCase()] = null; /* jelölés */
          stmts.push({ lbl: lm[1].toUpperCase(), text: rest });
          return;
        }
        stmts.push({ text: l });
      });
      function parseExpr(s) {
        s = s.trim();
        if (/^\$[0-9A-F]+$/i.test(s)) return parseInt(s.slice(1), 16);
        if (/^&H[0-9A-F]+$/i.test(s)) return parseInt(s.slice(2), 16);
        if (/^\d+$/.test(s)) return parseInt(s, 10);
        if (/^'[A-Za-z]'$/.test(s)) return s.charCodeAt(1);
        const k = s.toUpperCase();
        if (k in labels) return labels[k];
        throw new Error('ismeretlen érték: ' + s);
      }
      /* 1. menet: címkek címei */
      let pass = 1, pc = org;
      let bytes = [], listing = '';
      function out(...bs) { bs.forEach(b => bytes.push(b & 0xFF)); pc += bs.length; }
      function run() {
        pc = org; bytes = []; listing = '';
        for (const st of stmts) {
          if (st.lbl) { labels[st.lbl] = pc; if (!st.text) continue; }
          const t = (st.text || '').trim();
          if (!t) continue;
          const parts = t.split(/\s+/);
          const op = parts[0].toUpperCase();
          const args = t.slice(parts[0].length).split(',').map(x => x.trim()).filter(x => x.length || t.indexOf(',') >= 0);
          try { enc(op, args); } catch (e) { throw new Error((st.lbl ? st.lbl + ': ' : '') + t + ' — ' + e.message); }
        }
      }
      function reg8(s) { const u = s.toUpperCase(); if (!(u in R8)) throw new Error('8 bites regiszter kell: ' + s); return R8[u]; }
      function isR8(s) { return s.toUpperCase() in R8; }
      function immOrLabel(s) { return parseExpr(s); }
      function enc(op, a) {
        const A0 = (a[0] || '').toUpperCase(), A1 = (a[1] || '').toUpperCase();
        switch (op) {
          case 'NOP': out(0x00); return;
          case 'HALT': out(0x76); return;
          case 'DI': out(0xF3); return;
          case 'EI': out(0xFB); return;
          case 'EX': if (A0 === 'DE' && A1 === 'HL') out(0xEB); else if (A0 === 'AF') out(0x08); else if (A0 === '(SP)' && A1 === 'HL') out(0xE3); else if (A0 === '(SP)' && A1 === 'IX') { out(0xDD); out(0xE3); } else throw new Error('EX?'); return;
          case 'EXX': out(0xD9); return;
          case 'ORG': org = immOrLabel(a[0]); pc = org; bytes = []; return;
          case 'DB': case 'DEFB': a.forEach(x => out(immOrLabel(x) & 0xFF)); return;
          case 'DS': { const n = immOrLabel(a[0]); for (let i = 0; i < n; i++) out(0); return; }
          case 'LD': {
            if (A0 === 'A' && A1 === '(BC)') return out(0x0A);
            if (A0 === 'A' && A1 === '(DE)') return out(0x1A);
            if (A0 === 'A' && A1 === 'I') return out(0xED, 0x57);
            if (A0 === 'A' && A1 === 'R') return out(0xED, 0x5F);
            if (A0 === 'I' && A1 === 'A') return out(0xED, 0x47);
            if (A0 === 'R' && A1 === 'A') return out(0xED, 0x4F);
            if (A0 === 'A' && /^\(.*\)$/.test(A1) && A1 !== '(HL)' && A1 !== '(BC)' && A1 !== '(DE)') return out(0x3A, immOrLabel(A1.slice(1, -1)) & 0xFF, (immOrLabel(A1.slice(1, -1)) >> 8) & 0xFF);
            if (/^\((BC|DE)\)$/.test(A0) && A1 === 'A') return out(A0 === '(BC)' ? 0x02 : 0x12);
            if (A0 in R8 && A1 in R8) return out(0x40 + R8[A0] * 8 + R8[A1]);
            if (A0 in R8 && !/^\(.*\)$/.test(A1)) return out(0x06 + R8[A0] * 8, immOrLabel(A1) & 0xFF);
            if (A0 === '(HL)' && A1 in R8) return out(0x70 + R8[A1]);
            if (A0 === '(HL)' && !/^\(.*\)$/.test(A1)) return out(0x36, immOrLabel(A1) & 0xFF);
            if (A0 === 'HL' && /^\(.*\)$/.test(A1)) { const v = immOrLabel(A1.slice(1, -1)); return out(0x2A, v & 0xFF, (v >> 8) & 0xFF); }
            if (A0 === 'BC' && /^\(.*\)$/.test(A1)) { const v = immOrLabel(A1.slice(1, -1)); return out(0xED, 0x4B, v & 0xFF, (v >> 8) & 0xFF); }
            if (A0 === 'DE' && /^\(.*\)$/.test(A1)) { const v = immOrLabel(A1.slice(1, -1)); return out(0xED, 0x5B, v & 0xFF, (v >> 8) & 0xFF); }
            if (A0 === 'SP' && /^\(.*\)$/.test(A1)) { const v = immOrLabel(A1.slice(1, -1)); return out(0xED, 0x7B, v & 0xFF, (v >> 8) & 0xFF); }
            if (/^\(.*\)$/.test(A0) && A1 === 'HL') { const v = immOrLabel(A0.slice(1, -1)); return out(0x22, v & 0xFF, (v >> 8) & 0xFF); }
            if (/^\(.*\)$/.test(A0) && (A1 === 'BC' || A1 === 'DE' || A1 === 'SP')) { const v = immOrLabel(A0.slice(1, -1)); return out(0xED, { BC: 0x43, DE: 0x53, SP: 0x73 }[A1], v & 0xFF, (v >> 8) & 0xFF); }
            if (A0 in RR) { const v = immOrLabel(A1); return out(0x01 + RR[A0] * 0x10, v & 0xFF, (v >> 8) & 0xFF); }
            throw new Error('LD forma nem támogatott');
          }
          case 'INC': case 'DEC': {
            const base = op === 'INC' ? 0x04 : 0x05;
            if (A0 in R8) return out(base + R8[A0] * 8);
            if (A0 === '(HL)') return out(base + 0x30);
            if (A0 === 'IX') return out(0xDD, op === 'INC' ? 0x23 : 0x2B);
            if (A0 === 'IY') return out(0xFD, op === 'INC' ? 0x23 : 0x2B);
            if (A0 in RR) return out((op === 'INC' ? 0x03 : 0x0B) + RR[A0] * 0x10);
            throw new Error(op + '?');
          }
          case 'ADD': case 'ADC': case 'SUB': case 'SBC': case 'AND': case 'XOR': case 'OR': case 'CP': {
            let src = A0;
            if ((op === 'ADD' || op === 'ADC' || op === 'SBC') && A0 === 'A') src = A1;
            if (op === 'ADD' && A0 === 'HL') { const u = A1; if (u === 'IX') return out(0xDD, 0x09); if (u === 'IY') return out(0xFD, 0x09); return out(0x09 + RR[u] * 0x10); }
            if (op === 'ADC' && A0 === 'HL') return out(0xED, 0x4A + RR[A1] * 0x10);
            if (op === 'SBC' && A0 === 'HL') return out(0xED, 0x42 + RR[A1] * 0x10);
            if (isR8(src)) return out(ARITH(op) + R8[src.toUpperCase()]);
            return out(ARITH(op) + 0x46, immOrLabel(src) & 0xFF);
          }
          case 'JP': {
            if (A0 === '(HL)') return out(0xE9);
            if (A0 in CC) { const v = immOrLabel(a[1]); return out(0xC2 + CC[A0] * 8, v & 0xFF, (v >> 8) & 0xFF); }
            const v = immOrLabel(a[0]); return out(0xC3, v & 0xFF, (v >> 8) & 0xFF);
          }
          case 'JR': {
            if (A0 in CC) { const v = immOrLabel(a[1]); return out(0x20 + CC[A0] * 8, (v - pc - 2) & 0xFF); }
            const v = immOrLabel(a[0]); return out(0x18, (v - pc - 2) & 0xFF);
          }
          case 'CALL': {
            if (A0 in CC) { const v = immOrLabel(a[1]); return out(0xC4 + CC[A0] * 8, v & 0xFF, (v >> 8) & 0xFF); }
            const v = immOrLabel(a[0]); return out(0xCD, v & 0xFF, (v >> 8) & 0xFF);
          }
          case 'RET': if (A0 && A0 in CC) return out(0xC0 + CC[A0] * 8); return out(0xC9);
          case 'PUSH': { if (A0 === 'IX') return out(0xDD, 0xE5); if (A0 === 'IY') return out(0xFD, 0xE5); return out(0xC5 + RP[A0] * 0x10); }
          case 'POP': { if (A0 === 'IX') return out(0xDD, 0xE1); if (A0 === 'IY') return out(0xFD, 0xE1); return out(0xC1 + RP[A0] * 0x10); }
          case 'OUT': { if (A0 === '(C)') return out(0xED, 0x41 + R8[A1] * 8); return out(0xD3, immOrLabel(A0.replace(/[()]/g, '')) & 0xFF); }
          case 'IN': { if (A1 === '(C)') return out(0xED, 0x40 + R8[A0] * 8); return out(0xDB, immOrLabel(A1.replace(/[()]/g, '')) & 0xFF); }
          default: throw new Error('ismeretlen utasítás: ' + op);
        }
        function isR16src(s) { return s === 'IX' || s === 'IY'; }
        function ARITH(o) { return { ADD: 0x80, ADC: 0x88, SUB: 0x90, SBC: 0x98, AND: 0xA0, XOR: 0xA8, OR: 0xB0, CP: 0xB8 }[o]; }
      }
      run(); run(); /* két menet: először a címkék, aztán a kód */
      listing = bytes.slice(0, 16).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      return { bytes: bytes, org: org, listing: 'első bájtok @ $' + org.toString(16).toUpperCase() + ': ' + listing };
    }
  };

  window.RHASM = RHASM;
  window.RHGEN = {
    CFG: CFG, TOOLS: TOOLS,
    log: log, setActive: setActive, openTool: openTool, pane: pane, showKeyboard: showKeyboard,
    get logs() { return logs; }
  };
})();

