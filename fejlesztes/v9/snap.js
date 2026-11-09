/* ================================================================
   RETROHUB v9.3 — Pillanatkép (snapshot) modul
   A futó emulátor-mag állapotának mentése és visszatöltése:
   - a böngésző tárolójába (localStorage; gépenként több pillanatkép),
   - fájlba (.rhsnap — JSON boríték, a memóriakép base64-ben utazik).
   Fedett gépek:
     c64, c16, ht, tvc, primo, ent  → teljes állapot-sorosítás
       (CPU-regiszterek, 64K memória, periféria/bank/kirajzoló-állapot)
     zxs → 48K SNA bináris pillanatkép (a Spectrum-mag natív formátuma)
     zx81 → .z81 szöveges pillanatkép (EightyOne-formátum)
   Amiga: a SAE mag belső állapota nem sorosítható — a modul őszintén
   jelzi ezt, a lemezműveletek (ADF) ettől függetlenül élnek.
   A pillanatkép a VEZÉRLÉS csoportból és a zxs/zx81 "Pillanatkép"
   eszközfüléről érhető el; a régi 💾 gomb is erre fut mostantól.
   ================================================================ */
(function () {
  'use strict';

  /* ---------- v9.3 JAVÍTÁS: ZX81 beágyazott ROM sorrend ----------
     A v9.2.x-ben a ZX81-modul végére fűzött ROM-init az RH_ROMS definiáló
     scriptblokk ELŐTT futott, így friss böngészőben a beágyazott ROM soha
     nem töltődött be (a gép "Előbb töltsd be a ZX81 ROM-ot" üzenettel
     állt meg, a pillanatkép sem volt használható). Ez a blokk utoljára
     fut, az RH_ROMS már létezik — itt a betöltés szabályosan lemegy.
     (A build_v9.py a jövőbeli buildekben az initet az RH_ROMS blokkba
     helyezi; ez a prologus ott már nem tesz semmit.) */
  try {
    if (typeof Z81 !== 'undefined' && !Z81.rom && window.RH_ROMS && RH_ROMS.zx81) {
      var __b = atob(RH_ROMS.zx81), __u = new Uint8Array(__b.length);
      for (var __i = 0; __i < __b.length; __i++) __u[__i] = __b.charCodeAt(__i);
      Z81.rom = __u;
      var __st = document.querySelector('#z81-romst'); if (__st) __st.textContent = '✓';
      log('ZX81: beágyazott ROM betöltve (8 KB) — v9.3 sorrendjavítás');
    }
  } catch (e) {}

  var LSP = 'rhsnap.';            /* localStorage kulcs-előtag */
  var HUB = 'v9.3';
  var FMT = 'RETROHUB-SNAP';
  var STATE_MACH = { c64: 1, c16: 1, ht: 1, tvc: 1, primo: 1, ent: 1 };

  /* ---------- kisegítők ---------- */
  function log(m) { if (window.RHGEN && window.RHGEN.log) window.RHGEN.log(m); }
  function b64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + 0x8000, u8.length)));
    return btoa(s);
  }
  function ub64(s) {
    var bin = atob(s), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function stamp() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function fstamp() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function kbTxt(txt) { return Math.max(1, Math.round(txt.length / 1024)) + ' KB'; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  /* csak szám/igazhamis mezőket vesz fel (a szelektív mentés verzióbiztos) */
  function pick(o, keys) {
    var r = {};
    (keys || []).forEach(function (k) {
      var v = o ? o[k] : undefined;
      if (typeof v === 'number' && isFinite(v)) r[k] = v;
      else if (typeof v === 'boolean') r[k] = v;
    });
    return r;
  }
  function activeMid() {
    if (window.__zxOn) return 'zxs';
    if (window.__z81On) return 'zx81';
    return (window.RHGEN && window.RHGEN._active) || null;
  }
  function machName(mid) {
    return (window.RHGEN && window.RHGEN.CFG && window.RHGEN.CFG[mid] && window.RHGEN.CFG[mid].n) || mid;
  }

  /* ---------- CPU-állapot: közös, tulajdonság-listás másolás ----------
     A Z80-ok (HT / TVC / Primo / Enterprise / régi Spectrum) és a 6502-es
     (C64, C16) regiszterkészlete átfed, ezért az uniót másoljuk: minden
     mező, ami számként vagy logikaiként olvasható, bekerül. */
  var CPU_FIELDS = ['a', 'f', 'b', 'c', 'd', 'e', 'h', 'l',
    'a2', 'f2', 'b2', 'c2', 'd2', 'e2', 'h2', 'l2',
    'ix', 'iy', 'sp', 'pc', 'i', 'r', 'im',
    'iff1', 'iff2', 'halted', 'eiPending', 't', 'tstates',
    'nmiPending', 'intPending', 'rReadMask', 'haltCycles',
    'x', 'y', 'p', 'cycles', 'irqPending'];
  function cpuSave(cpu) { return pick(cpu, CPU_FIELDS); }
  function cpuPut(cpu, o) {
    if (!cpu || !o) return;
    Object.keys(o).forEach(function (k) {
      if (k in cpu) { try { cpu[k] = o[k]; } catch (e) {} }
    });
  }
  /* tömb-visszaírás: Uint8Array/Uint16Array .set, sima tömb in-place */
  function putArr(t, v) {
    if (!t || !v) return;
    if (typeof t.set === 'function') { try { t.set(v); } catch (e) {} return; }
    if (Array.isArray(t)) { for (var i = 0; i < t.length && i < v.length; i++) t[i] = v[i]; }
  }
  /* segédobjektum visszaírása (num + arr mezők) */
  function putAux(target, aux) {
    if (!target || !aux) return;
    if (aux.num) Object.keys(aux.num).forEach(function (k) {
      if (typeof target[k] === 'number') { try { target[k] = aux.num[k]; } catch (e) {} }
    });
    if (aux.bool) Object.keys(aux.bool).forEach(function (k) {
      if (typeof target[k] === 'boolean') { try { target[k] = aux.bool[k]; } catch (e) {} }
    });
    if (aux.arr) Object.keys(aux.arr).forEach(function (k) { putArr(target[k], aux.arr[k]); });
  }

  /* ================= ÁLLAPOT-SOROSÍTÁS (state-magok) =================
     Minden géphez: memóriaképek + számozott/logikai/periféria-mezők.
     A restore a célmezőket írja vissza, ha azok léteznek — így egy
     korábbi/újabb build között is csak annyi töltődik vissza, amennyi
     az adott magban értelmezett. */

  function snapState(mid) {
    var RH = window.RH, core = RH && RH.coreOf ? RH.coreOf[mid] : null;
    if (!core) return null;
    var m = core.f, aux, s;

    if (mid === 'c64') {
      /* 6502 + RAM + CIA1 Timer-A + IO-port (ROM-bankolás) + billentyű-mátrix */
      s = {
        cpu: cpuSave(m.cpu),
        mems: { ram: { size: m.mem.length, b64: b64(m.mem) } },
        aux: {
          num: pick(m, ['ioPort', 'ddr', 'border', 'frames']),
          arr: { kb: Array.prototype.slice.call(m.kb) },
          obj: { cia: core._cia ? pick(core._cia, ['latch', 'cnt', 'cra', 'ier', 'icr']) : null }
        }
      };
      return s;
    }
    if (mid === 'c16') {
      /* 6502 + RAM + TED kulcs-index / sor-latch (a C16 KERNAL-protokoll) */
      return {
        cpu: cpuSave(m.cpu),
        mems: { ram: { size: m.mem.length, b64: b64(m.mem) } },
        aux: {
          num: pick(m, ['ioPort', 'ddr', 'border', 'frames', 'tedKeyIdx', 'tedRowSel']),
          arr: { kb: Array.prototype.slice.call(m.kb) }
        }
      };
    }
    if (mid === 'ht') {
      /* Z80 + RAM (a $3800-as memórialeképezett billentyűzet állapotaival) */
      return {
        cpu: cpuSave(core._cpu),
        mems: { ram: { size: core.mem.length, b64: b64(core.mem) } },
        aux: core._kb ? { arr: { kb: Array.prototype.slice.call(core._kb) } } : {}
      };
    }
    if (mid === 'tvc') {
      /* Z80 + RAM + VRAM + CRTC (MC6845) + bankolás + hang/kazetta-bitek */
      aux = {
        num: pick(m, ['bank1Sel', 'bank3Sel', 'bank4Sel', 'vramBank1', 'vramBank3', 'vramScreen',
          'videoMode', 'border', 'keyLine', 'activeSlot', 'soundFreq', 'soundVolume',
          'sndIntEn', 'cassetteFf', 'cassetteMotor', 'cassetteInput', 'intFlipflop',
          'frameCount', 'sndDividerSync']),
        arr: {
          keyLines: Array.prototype.slice.call(m.keyLines),
          sndPorts: Array.prototype.slice.call(m.sndPorts),
          palette: Array.prototype.slice.call(m.palette || [])
        },
        obj: m.crtc ? { crtc: { num: pick(m.crtc, ['addr']), arr: { regs: Array.prototype.slice.call(m.crtc.regs) } } } : {}
      };
      return {
        cpu: cpuSave(m.cpu),
        mems: { ram: { size: m.ram.length, b64: b64(m.ram) }, vram: { size: m.vram.length, b64: b64(m.vram) } },
        aux: aux
      };
    }
    if (mid === 'primo') {
      /* Z80 + RAM + VRAM + portFD memória-konfiguráció + hang-bitek */
      return {
        cpu: cpuSave(m.cpu),
        mems: { ram: { size: m.ram.length, b64: b64(m.ram) }, vram: { size: m.vram.length, b64: b64(m.vram) } },
        aux: {
          num: pick(m, ['portFD', 'frameCount', 'speakerToggles', 'toggleFreq']),
          bool: pick(m, ['nmiEnabled', 'speaker', 'displayPage', 'lastSpeaker']),
          arr: { keyGroups: Array.prototype.slice.call(m.keyGroups) }
        }
      };
    }
    if (mid === 'ent') {
      /* Z80 + RAM + VRAM + Dave (IRQ, szegmensek, hangregiszterek) + Nick (LPT) */
      return {
        cpu: cpuSave(m.cpu),
        mems: { ram: { size: m.ram.length, b64: b64(m.ram) }, vram: { size: m.vram.length, b64: b64(m.vram) } },
        aux: {
          num: pick(m, ['irqStatus', 'irqEnable', 'keyRow', 'selIntHz', 'selAcc', 'hz1Acc',
            'FIXBIAS', 'BORDER', 'LPL', 'LPH', 'lptFlags', 'lptAddr', 'LD1', 'LD2',
            'linesRemaining', 'renderLine']),
          bool: pick(m, ['vsync']),
          arr: {
            segment: Array.prototype.slice.call(m.segment),
            keyLines: Array.prototype.slice.call(m.keyLines),
            daveRegs: Array.prototype.slice.call(m.daveRegs),
            lptCol: m.LPT ? Array.prototype.slice.call(m.LPT.COL) : []
          }
        }
      };
    }
    return null;
  }

  function putState(mid, s) {
    var RH = window.RH, core = RH && RH.coreOf ? RH.coreOf[mid] : null;
    if (!core) throw new Error('A mag nincs betöltve — indítsd el a gépet (▶), majd töltsd be a pillanatképet.');
    if (!s || !s.mems || !s.mems.ram) throw new Error('Sérült pillanatkép (hiányzó memóriakép).');
    var m = core.f;
    cpuPut(m.cpu !== undefined ? m.cpu : core._cpu, s.cpu);
    var ram = ub64(s.mems.ram.b64);
    if (s.mems.ram.size !== undefined && ram.length !== s.mems.ram.size) throw new Error('A memóriakép mérete eltér (várt: ' + s.mems.ram.size + ' bájt).');

    if (mid === 'c64') {
      if (m.mem.length !== ram.length) throw new Error('A C64 RAM mérete eltér.');
      m.mem.set(ram); putAux(m, s.aux);
      if (s.aux && s.aux.obj && s.aux.obj.cia && core._cia) putAux(core._cia, { num: s.aux.obj.cia });
      return;
    }
    if (mid === 'c16') {
      if (m.mem.length !== ram.length) throw new Error('A C16 RAM mérete eltér.');
      m.mem.set(ram); putAux(m, s.aux);
      return;
    }
    if (mid === 'ht') {
      if (core.mem.length !== ram.length) throw new Error('A HT1080Z RAM mérete eltér.');
      core.mem.set(ram); putAux(core, s.aux);
      return;
    }
    /* TVC / Primo / Enterprise: ram + vram két képben */
    if (!s.mems.vram) throw new Error('Sérült pillanatkép (hiányzó VRAM-kép).');
    var vram = ub64(s.mems.vram.b64);
    if (mid === 'tvc') {
      m.ram.set(ram); m.vram.set(vram);
      putAux(m, s.aux);
      if (s.aux && s.aux.obj && s.aux.obj.crtc && m.crtc) {
        putAux(m.crtc, { num: s.aux.obj.crtc.num, arr: s.aux.obj.crtc.arr });
      }
      return;
    }
    if (mid === 'primo') {
      m.ram.set(ram); m.vram.set(vram); putAux(m, s.aux);
      return;
    }
    if (mid === 'ent') {
      m.ram.set(ram); m.vram.set(vram); putAux(m, s.aux);
      if (s.aux && s.aux.arr && m.LPT && s.aux.arr.lptCol) putArr(m.LPT.COL, s.aux.arr.lptCol);
      return;
    }
    throw new Error('Ismeretlen mag: ' + mid);
  }

  /* ================= BORITÉK ================= */
  function envelope(mid, kind, body) {
    return Object.assign({
      fmt: FMT, ver: 1, hub: HUB,
      machine: mid, machineName: machName(mid),
      kind: kind, created: new Date().toISOString(), createdLocal: stamp()
    }, body || {});
  }

  function buildEnv(mid) {
    if (!mid) mid = activeMid();
    var c = CAP.cap(mid);
    if (!c) throw new Error(machName(mid || '?') + ': a pillanatkép ennél a magnál most nem elérhető.');
    if (c.kind === 'sna') {
      /* ZX Spectrum: a mag natív 48K SNA formátuma (49179 bájt) */
      return envelope(mid, 'sna', { dataType: 'b64', data: b64(engine.saveSNA()) });
    }
    if (c.kind === 'z81') {
      /* ZX81: a mag natív .z81 szöveges formátuma (EightyOne) */
      return envelope(mid, 'z81', { dataType: 'text', data: String(z81SnapSave()) });
    }
    return envelope(mid, 'state', { state: snapState(mid) });
  }

  /* ================= NYILVÁNOS API ================= */
  var CAP = {
    /* képesség: null = nincs (Amiga, profilok, nem futó mag) */
    cap: function (mid) {
      if (!mid) mid = activeMid();
      if (!mid || mid === 'amiga') return null;
      try {
        if (mid === 'zxs') return (typeof engine !== 'undefined' && engine && engine.cpu) ? { kind: 'sna' } : null;
        if (mid === 'zx81') return (typeof Z81 !== 'undefined' && Z81 && Z81.m && typeof z81SnapSave === 'function') ? { kind: 'z81' } : null;
        var RH = window.RH;
        if (!RH || !RH.coreOf || !RH.coreOf[mid]) return null;
        if (!STATE_MACH[mid]) return null;
        return { kind: 'state' };
      } catch (e) { return null; }
    },

    list: function (mid) {
      var out = [];
      try {
        var pre = LSP + mid + '.';
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(pre) === 0) {
            var raw = lsGet(k);
            var env = null;
            try { env = JSON.parse(raw); } catch (e) {}
            out.push({
              id: k.slice(pre.length),
              created: (env && env.createdLocal) || k.slice(pre.length),
              kind: (env && env.kind) || '?',
              bytes: raw ? raw.length : 0,
              size: raw ? kbTxt(raw) : '?'
            });
          }
        }
      } catch (e) {}
      out.sort(function (a, b) { return b.id.localeCompare(a.id); });
      return out.slice(0, 24);
    },

    save: function (mid) {
      if (!mid) mid = activeMid();
      if (!mid) throw new Error('Nincs aktív gép — indítsd el az emulátort (▶).');
      var env = buildEnv(mid);
      var txt = JSON.stringify(env);
      var key = LSP + mid + '.' + Date.now();
      try { localStorage.setItem(key, txt); }
      catch (e) { throw new Error('A böngésző tárolója megtelt — törölj egy régi pillanatképet, vagy ments fájlba (.rhsnap).'); }
      log((env.machineName || mid) + ': pillanatkép mentve a böngészőbe — ' + stamp() + ' (' + kbTxt(txt) + ')');
      return env;
    },

    load: function (mid, id) {
      var txt = lsGet(LSP + mid + '.' + id);
      if (!txt) throw new Error('A pillanatkép nem található a böngészőben.');
      return CAP.loadText(mid, txt);
    },

    del: function (mid, id) {
      lsDel(LSP + mid + '.' + id);
      log(mid + ': pillanatkép törölve.');
    },

    saveFile: function (mid) {
      if (!mid) mid = activeMid();
      var env = buildEnv(mid);
      var txt = JSON.stringify(env);
      var name = mid + '-pillanatkep-' + fstamp() + '.rhsnap';
      if (typeof download !== 'function') throw new Error('A fájlletöltés ebben a környezetben nem elérhető.');
      download(name, txt);
      log((env.machineName || mid) + ': pillanatkép fájlba mentve — ' + name + ' (' + kbTxt(txt) + ')');
      return name;
    },

    /* .rhsnap fájl VAGY böngészőben tárolt szöveg visszatöltése */
    loadText: function (mid, text) {
      if (!mid) mid = activeMid();
      var env;
      try { env = JSON.parse(text); } catch (e) { throw new Error('Érvénytelen pillanatkép (nem olvasható JSON).'); }
      if (!env || env.fmt !== FMT) throw new Error('Ez nem RETROHUB pillanatkép (hiányzó formátumjelzés).');
      var mm = env.machine || mid;
      if (mm !== mid) throw new Error('A pillanatkép más géphez készült (' + (env.machineName || mm) + ') — indítsd be azt a gépet.');
      if (activeMid() !== mid) throw new Error('A gép nincs elindítva — válaszd ki a listából és nyomd meg a ▶ gombot.');
      if (env.kind === 'sna') {
        if (typeof engine === 'undefined' || !engine || !engine.cpu) throw new Error('A ZX Spectrum magja nem érhető el.');
        var u8 = ub64(String(env.data));
        engine.script.length = 0;
        if (u8.length < 131103 && engine.m128) engine.setModel('48');
        engine.loadSNA(u8);
        try { if (typeof renderFrame === 'function') renderFrame(); } catch (e) {}
        log('ZX Spectrum: pillanatkép visszatöltve (SNA, ' + stamp() + ')');
      } else if (env.kind === 'z81') {
        if (typeof z81Z81Load !== 'function') throw new Error('A ZX81 modul nem érhető el.');
        z81Z81Load(String(env.data));
        log('ZX81: pillanatkép visszatöltve (.z81)');
      } else if (env.kind === 'state') {
        putState(mid, env.state);
        log((env.machineName || mid) + ': pillanatkép visszatöltve (CPU + memória + periféria-állapot)');
      } else {
        throw new Error('Ismeretlen pillanatkép-típus: ' + env.kind);
      }
      return true;
    },

    /* a régi 💾 gombhoz (modul.snap): true, ha ténylegesen mentett */
    saveActive: function () {
      var mid = activeMid();
      if (!mid || !CAP.cap(mid)) return false;
      try { CAP.save(mid); return true; } catch (e) { log('Pillanatkép-hiba: ' + (e && e.message || e)); return true; }
    },

    /* ---------- felületek ---------- */

    /* v9 VEZÉRLÉS csoport (pCtrl) — a motor saját el/btn/row/note segíőivel */
    ctrlPane: function (fr, mid, ui) {
      var el = ui.el, btn = ui.btn, row = ui.row, note = ui.note, help = ui.help;
      var c = CAP.cap(mid);
      if (!c) {
        if (mid === 'amiga') {
          fr.append(el('h3', null, 'Pillanatkép'));
          fr.append(note('Amiga: pillanatkép nem elérhető — a SAE mag belső állapota nem sorosítható. A lemezműveletek (ADF behelyezés/kiadás) ennek ellenére élnek.'));
        } else if (STATE_MACH[mid] || mid === 'zxs' || mid === 'zx81') {
          fr.append(el('h3', null, 'Pillanatkép'));
          fr.append(note('A pillanatkép-eléréshez futó emulátor-mag kell: válaszd ki a gépet a listából és nyomd meg a ▶ gombot.'));
        }
        return;
      }
      fr.append(el('h3', null, 'Pillanatkép'));
      var st = el('div', 'help', 'A pillanatkép a mag teljes állapotát rögzíti (CPU, memória, perifériák).');
      var lst = el('div');
      function renderLst() {
        lst.textContent = '';
        var items = [];
        try { items = CAP.list(mid); } catch (e) {}
        if (!items.length) { lst.append(el('div', 'help', 'Még nincs böngészőbe mentett pillanatkép ennél a gépnél.')); return; }
        items.forEach(function (it) {
          var r = el('div');
          r.style.margin = '2px 0';
          var nm = el('span', null, it.created + ' — ' + (it.kind === 'sna' ? 'SNA' : it.kind === 'z81' ? '.z81' : 'állapot') + ', ' + it.size);
          nm.style.marginRight = '8px';
          var bl = btn('Betöltés', function () {
            try { CAP.load(mid, it.id); st.textContent = 'Visszatöltve: ' + it.created; } catch (e) { st.textContent = 'Hiba: ' + (e && e.message || e); }
          });
          var bd = btn('✕', function () { CAP.del(mid, it.id); renderLst(); });
          bd.title = 'Pillanatkép törlése';
          r.append(nm, bl, bd);
          lst.append(r);
        });
      }
      fr.append(row(btn('💾 Mentés a böngészőbe', function () {
        try { CAP.save(mid); renderLst(); st.textContent = 'Pillanatkép elmentve a böngészőbe.'; }
        catch (e) { st.textContent = 'Hiba: ' + (e && e.message || e); }
      }, 'primary')));
      var fi = el('input'); fi.type = 'file'; fi.accept = '.rhsnap,.json'; fi.style.display = 'none';
      fi.onchange = function () {
        var f = fi.files[0]; fi.value = '';
        if (!f) return;
        f.text().then(function (t) {
          try { CAP.loadText(mid, t); renderLst(); }
          catch (e) { st.textContent = 'Hiba: ' + (e && e.message || e); }
        });
      };
      fr.append(fi);
      fr.append(row(
        btn('💾 Mentés fájlba (.rhsnap)', function () {
          try { CAP.saveFile(mid); } catch (e) { st.textContent = 'Hiba: ' + (e && e.message || e); }
        }),
        btn('📂 Betöltés fájlból', function () { fi.click(); })
      ));
      renderLst();
      fr.append(lst, st);
      fr.append(help('A fájl (.rhsnap) bármely RETROHUB-példányra visszatölthető; a böngészőbeli pillanatképek gépenként külön lista alatt állnak.'));
    },

    /* zxs / zx81 örökölt eszközfül: a legacy devOpen 'snap' ágából hívódik */
    openLegacy: function (mid) {
      if (mid === 'zxs') {
        var tv = document.getElementById('toolview'), tiles = document.getElementById('tiles');
        if (!tv || !tiles) return false;
        var sec = document.getElementById('rh-snap-sec');
        if (!sec) {
          sec = document.createElement('section');
          sec.className = 'tool'; sec.id = 'rh-snap-sec';
          tv.appendChild(sec);
        }
        var tt = document.getElementById('tool-title');
        if (tt) tt.textContent = 'Pillanatkép — ZX Spectrum állapot mentése/betöltése';
        CAP.ctrlPane(sec, mid, {
          el: function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; },
          btn: function (l, f, c) { var b = document.createElement('button'); b.textContent = l; if (c) b.className = c; if (f) b.onclick = f; return b; },
          row: function () { var r = document.createElement('div'); r.className = 'btn-row'; for (var i = 0; i < arguments.length; i++) r.appendChild(arguments[i]); return r; },
          note: function (t) { var d = document.createElement('div'); d.className = 'note'; d.textContent = t; return d; },
          help: function (t) { var p = document.createElement('p'); p.className = 'help'; p.textContent = t; return p; }
        });
        document.querySelectorAll('#toolview .tool').forEach(function (s) { s.classList.toggle('on', s.id === 'rh-snap-sec'); });
        tiles.style.display = 'none';
        tv.style.display = '';
        return true;
      }
      if (mid === 'zx81') {
        var pane = document.getElementById('z81-pane');
        if (!pane) return false;
        var sec2 = document.getElementById('z81t-snap');
        if (!sec2) {
          sec2 = document.createElement('section');
          sec2.className = 'z81tool'; sec2.id = 'z81t-snap';
          pane.appendChild(sec2);
        }
        CAP.ctrlPane(sec2, mid, {
          el: function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; },
          btn: function (l, f, c) { var b = document.createElement('button'); b.textContent = l; if (c) b.className = c; if (f) b.onclick = f; return b; },
          row: function () { var r = document.createElement('div'); r.className = 'btn-row'; for (var i = 0; i < arguments.length; i++) r.appendChild(arguments[i]); return r; },
          note: function (t) { var d = document.createElement('div'); d.className = 'note'; d.textContent = t; return d; },
          help: function (t) { var p = document.createElement('p'); p.className = 'help'; p.textContent = t; return p; }
        });
        if (typeof z81Tool === 'function') z81Tool('snap');
        return true;
      }
      return false;
    }
  };

  window.RH_SNAP = CAP;
})();
