/* ================================================================
   RETROHUB v9 — boot: modulregisztrációk, billentyűzet-szinkron,
   globális AI-párbeszédablak, v9 marker
   ================================================================ */
(function () {
  'use strict';
  const Q = s => document.querySelector(s);
  const RH = window.RH, RHGEN = window.RHGEN, AI = window.RHAI;
  RH.coreOf = {};
  RH.subSel = {};

  /* v9.1: a vezérlősáv és a billentyűzet a stage-be tartozik (görgethető,
     látható területen) — a build a body végére tette, ahol overflow:hidden levágta */
  (function moveIntoStage() {
    const stage = document.querySelector('section.stage');
    const bar = Q('#rh-bar'), kb = Q('#rh-kb');
    if (stage && bar && kb) stage.append(bar, kb);
  })();

  let activeMid = null;         // 'c64' stb. vagy 'amiga'
  let core = null;

  /* ---------- fejlesztői pane DOM ---------- */
  const db = Q('#dev .db');
  const dp = document.createElement('div');
  dp.className = 'pane'; dp.id = 'rh-devpane'; dp.hidden = true;
  dp.innerHTML = '<div class="chips" id="rh-chips"></div><div id="rh-groupr"></div><div id="rh-content"></div>';
  db.appendChild(dp);

  function chipsFill(mid) {
    const m = (RetroShell.modules || []).find(x => x.id === mid);
    const c = Q('#rh-chips'); c.innerHTML = '';
    if (m) [['CPU', m.cpu], ['RAM', m.ram], ['Felbontás', m.res[0] + '×' + m.res[1]], ['Szöveg', m.txt], ['Színek', String(m.col)], ['Hang', m.snd]]
      .forEach(p => { const s = document.createElement('span'); s.className = 'pchip'; s.textContent = p[0] + ': ' + p[1]; c.append(s); });
  }

  /* ---------- UI-váltás ---------- */
  function setRhUI(on) {
    Q('#term').hidden = on;
    Q('#rh-wrap').hidden = !on;
    Q('#rh-bar').hidden = !on;
    Q('#crt').classList.toggle('gfx', on);
  }

  /* ---------- Amiga külön út (SAE) ---------- */
  function amigaMount() {
    setRhUI(true);
    let cv = Q('#rh-ami-cv');
    if (!cv) { cv = document.createElement('div'); cv.id = 'rh-ami-cv'; cv.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center'; Q('#rh-wrap').appendChild(cv); }
    Q('#rh-canvas').style.display = 'none';
    RH.AMIGA.boot('rh-ami-cv', m => RHGEN.log('Amiga: ' + m));
    RHGEN.setActive('amiga', null);
    chipsFill('amiga');
  }
  function amigaUnmount() {
    RH.AMIGA.stop();
    Q('#rh-canvas').style.display = '';
    setRhUI(false);
  }

  /* ---------- regisztráció ---------- */
  function registerCore(mid) {
    RetroShell.register({
      id: mid,
      mount() {
        if (mid === 'amiga') { amigaMount(); return; }
        setRhUI(true);
        Q('#rh-canvas').style.display = '';
        try {
          core = RH.createCore(mid);
          RH.coreOf[mid] = core;
          core.mount(Q('#rh-canvas'));
          RHGEN.log(RHGEN.CFG[mid].n + ': emulátor-mag elindítva (beágyazott ROM)');
        } catch (e) {
          RHGEN.log('HIBA a mag indításakor: ' + (e && e.message || e));
        }
        RHGEN.setActive(mid, null);
        chipsFill(mid);
      },
      unmount() {
        if (mid === 'amiga') { amigaUnmount(); activeMid = null; return; }
        if (core) { try { core.unmount(); } catch (e) {} }
        delete RH.coreOf[mid];
        core = null;
        activeMid = null;
        setRhUI(false);
      },
      reset() { RH.doReset(mid); },
      open() { RH.fileOpen(mid); },
      snap() { RHGEN.log((RHGEN.CFG[mid] || {}).saveNote || 'Mentés nem elérhető ennél a magnál.'); },
      devPane: '#rh-devpane', devChips: '#rh-chips',
      devTools: RHGEN.TOOLS,
      devOpen(id) { RHGEN.openTool(mid, id); }
    });
  }
  ['c64', 'c16', 'ht', 'tvc', 'primo', 'ent', 'amiga'].forEach(registerCore);

  /* ---------- vezérlés: reset / pause / fájl ---------- */
  RH.doReset = function (mid) {
    if (mid === 'amiga') { RH.AMIGA.reset(); RHGEN.log('Amiga: hard reset'); return; }
    const c = RH.coreOf[mid];
    if (c) { try { c.reset(); RHGEN.log('reset'); } catch (e) { RHGEN.log('reset hiba: ' + e.message); } }
  };
  RH.doPause = function () { RHGEN.log('A futás megállítása/indítása a képernyő alatti ▶/⏸ gombokkal érhető el.'); };

  const rhFile = document.createElement('input');
  rhFile.type = 'file'; rhFile.style.display = 'none';
  document.body.appendChild(rhFile);
  RH.fileOpen = function (mid) {
    if (mid === 'amiga') rhFile.accept = '.adf,.adz,.adf.gz';
    else if (mid === 'c64') rhFile.accept = '.prg,.p00,.t64';
    else if (mid === 'primo') rhFile.accept = '.pp,.ptp';
    else if (mid === 'ht') rhFile.accept = '.cmd,.cas,.bas,.txt';
    else if (mid === 'c16') rhFile.accept = '.prg';
    else rhFile.accept = '';
    rhFile.onchange = async () => {
      const f = rhFile.files[0]; if (!f) return;
      try {
        if (mid === 'amiga') RHGEN.log(RH.AMIGA.insertDisk(f.name, new Uint8Array(await f.arrayBuffer())));
        else {
          const u8 = new Uint8Array(await f.arrayBuffer());
          const c2 = RH.coreOf[mid];
          RHGEN.log((RHGEN.CFG[mid] || {}).n + ': ' + (c2 ? c2.loadFile(f.name, u8) : 'mag nincs betöltve'));
        }
      } catch (e) { RHGEN.log('fájlhiba: ' + e.message); }
    };
    rhFile.click();
  };

  /* ---------- billentyűzet-szinkron (250 ms) ---------- */
  Q('#rh-kbtoggle').addEventListener('click', () => { const kb = Q('#rh-kb'); kb.dataset.off = kb.hidden ? '0' : '1'; });
  setInterval(() => {
    let mid = null;
    if (window.__zxOn) mid = 'zxs';
    else if (window.__z81On) mid = 'zx81';
    else if (activeMid) mid = activeMid;
    const rhkb = Q('#rh-kb'), zxkb = Q('#zx-kb'), z81kb = Q('#z81-kb');
    if (mid === 'zxs') { zxkb.hidden = false; z81kb.hidden = true; rhkb.hidden = true; return; }
    if (mid === 'zx81') { z81kb.hidden = false; zxkb.hidden = true; rhkb.hidden = true; return; }
    if (mid && RHGEN.CFG[mid]) {
      if (rhkb.dataset.mid !== mid) { RHGEN.showKeyboard(mid); rhkb.dataset.mid = mid; }
      rhkb.hidden = rhkb.dataset.off === '1';
      zxkb.hidden = true; z81kb.hidden = true;
      return;
    }
    // nincs aktív gép (vagy profil): minden billentyűzet el
    rhkb.hidden = true; zxkb.hidden = true; z81kb.hidden = true;
    if (!mid && rhkb.dataset.mid) rhkb.dataset.mid = '';
  }, 250);

  /* ---------- aktív gép követése a mountból ---------- */
  const origSetActive = RHGEN.setActive;
  RHGEN.setActive = function (mid, prof) { activeMid = mid; origSetActive(mid, prof); };

  /* ---------- C16 koordináták (kalibrációig sor-folytonos) ---------- */
  RH.c16Coord = function (ch) {
    if (!RH._c16map) {
      RH._c16map = {};
      const L = ['←1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '+', '-', '£', 'HOME', 'DEL'];
      void L;
      // a buildC16Layout sorrendjében: index → (r,c)
      const labels = ['←', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '+', '-', '£', 'HOME', 'DEL',
        'CTRL', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '@', '*', '↑', 'RESTORE',
        'RUNSTOP', 'CBM', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ':', ';', '=', 'RETURN',
        'SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'SHIFT2', '↓', '→'];
      labels.forEach((lab, i) => { RH._c16map[lab] = { r: Math.floor(i / 8), c: i % 8 }; });
    }
    if (ch === '\n') return RH._c16map['RETURN'];
    if (ch === ' ') return RH._c16map['SPACE'] || { r: 5, c: 0 };
    const up = String(ch).toUpperCase();
    return RH._c16map[up] || null;
  };

  /* ---------- GLOBÁLIS AI-PÁRBESZÉDABLAK (🤖) ---------- */
  window.RHAIopen = function () {
    let modal = Q('#rh-ai-modal');
    if (modal) { modal.remove(); return; }
    const c = AI.cfgOf(AI.prov);
    const provSel = document.createElement('select'); provSel.style.flex = '1';
    AI.PRESETS.forEach(p => {
      const o = document.createElement('option'); o.value = p.id; o.textContent = p.n;
      if (p.id === AI.prov) o.selected = true; provSel.append(o);
    });
    const urlIn = document.createElement('input'); urlIn.type = 'text'; urlIn.style.width = '100%'; urlIn.value = c.base || ''; urlIn.placeholder = 'API-cím (pl. https://api.openai.com/v1)';
    const keyIn = document.createElement('input'); keyIn.type = 'password'; keyIn.style.width = '100%'; keyIn.value = c.key || ''; keyIn.placeholder = 'API-kulcs (csak a böngészőben marad)';
    const modelIn = document.createElement('input'); modelIn.type = 'text'; modelIn.value = c.model || ''; modelIn.placeholder = 'modellnév (kézzel is beírható)'; modelIn.style.flex = '1';
    const dl2 = document.createElement('datalist'); dl2.id = 'rh9-models';
    modelIn.setAttribute('list', 'rh9-models');
    const remember = document.createElement('input'); remember.type = 'checkbox'; remember.checked = true;
    const night = document.createElement('input'); night.type = 'checkbox'; night.checked = AI.night;
    const info = document.createElement('div'); info.className = 'help'; info.textContent = 'Aktív: ' + c.n;

    function applyProv() {
      const cc = AI.cfgOf(provSel.value);
      urlIn.value = cc.base || ''; keyIn.value = cc.key || ''; modelIn.value = cc.model || '';
      info.textContent = 'Aktív: ' + cc.n;
    }
    provSel.addEventListener('change', applyProv);

    function save() {
      AI.setCfg(provSel.value, { base: urlIn.value.trim(), key: remember.checked ? keyIn.value : '', model: modelIn.value.trim() });
      AI.prov = provSel.value;
      AI.night = night.checked;
      info.textContent = 'Mentve. Aktív: ' + AI.cfgOf(AI.prov).n;
      RHGEN.log('AI-szolgáltató mentve: ' + AI.cfgOf(AI.prov).n);
    }

    const modBtn = document.createElement('button'); modBtn.textContent = '⟳ Modellek';
    modBtn.onclick = async () => {
      save();
      info.textContent = 'Modelllista lekérése…';
      try {
        const r = await AI.listModels();
        dl2.innerHTML = '';
        r.models.forEach(m => { const o = document.createElement('option'); o.value = m; dl2.append(o); });
        info.textContent = 'Modellek (' + r.models.length + ' db, forrás: ' + r.src + ')';
        RHGEN.log('modelllista OK: ' + r.models.length + ' modell');
      } catch (e) {
        info.textContent = 'HIBA: ' + e.message + ' — a modellnév kézzel is beírható.';
        RHGEN.log('modelllista hiba: ' + e.message);
      }
    };

    const testBtn = document.createElement('button'); testBtn.textContent = '🧪 Kapcsolat-teszt';
    testBtn.onclick = async () => {
      save();
      info.textContent = 'Teszt…';
      try {
        const r = await AI.chat('Say OK', 'You are a test endpoint. Reply with the single word OK.', []);
        info.textContent = 'Sikeres kapcsolat: ' + r.trim().slice(0, 40);
      } catch (e) { info.textContent = 'Teszt hiba: ' + e.message; }
    };

    const box = document.createElement('div'); box.className = 'box';
    box.innerHTML = '<h3>🤖 RETROHUB AI — globális beállítások</h3>';
    const r1 = document.createElement('div'); r1.className = 'row'; r1.append(provSel);
    const r2 = document.createElement('div'); r2.className = 'row'; r2.append(urlIn);
    const r3 = document.createElement('div'); r3.className = 'row'; r3.append(keyIn);
    const r4 = document.createElement('div'); r4.className = 'row'; r4.append(modelIn, dl2, modBtn);
    const r5 = document.createElement('div'); r5.className = 'row';
    const lab1 = document.createElement('label'); lab1.append(remember, ' kulcs megjegyzése (localStorage)');
    const lab2 = document.createElement('label'); lab2.append(night, ' 🌙 éjszakai mód (tartalék-lánccal)');
    r5.append(lab1, lab2);
    const r6 = document.createElement('div'); r6.className = 'btn-row';
    const saveBtn = document.createElement('button'); saveBtn.className = 'primary'; saveBtn.textContent = '💾 Mentés és bezárás';
    saveBtn.onclick = () => { save(); modal.remove(); };
    const closeBtn = document.createElement('button'); closeBtn.textContent = 'Bezárás'; closeBtn.onclick = () => modal.remove();
    r6.append(saveBtn, testBtn, closeBtn);
    box.append(r1, r2, r3, r4, r5, r6, info,
      (() => { const p = document.createElement('p'); p.className = 'help'; p.textContent = 'Pollinations ingyenes és kulcs nélküli — alapértelmezés. Helyi szervereknél (Ollama: OLLAMA_ORIGINS=* ollama serve; LM Studio: CORS engedélyezése) a böngésző CORS-engedélyt kér. A lista lekérésének kudarca sosem blokkol: a modellnév kézzel is beírható.'; return p; })());
    modal = document.createElement('div'); modal.id = 'rh-ai-modal';
    modal.appendChild(box);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  };
  Q('#rh-aibtn').addEventListener('click', () => RHAIopen());

  /* ---------- v9 marker ---------- */
  RHGEN.log('[RH9] Központosított menürendszer, gépenkénti billentyűzetek, beágyazott ROM-ok — 23 gép, 9 emulátor-mag. v9.2: böngésző-mentés fallback (Pages-kompatibilis), AI-szolgáltató környezetfigyelés.');
  console.log('[RH9] RETROHUB v9 aktív: egységes menük + billentyűzetek + RHMS AI');
})();
