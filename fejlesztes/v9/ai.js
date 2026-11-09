/* ================================================================
   RETROHUB v9 — RHMS AI (globális AI-szolgáltató réteg)
   Előre beállított szolgáltatók, kulcskezelés (localStorage),
   modelllista-lekérés és chat OpenAI-kompatibilis végpontokkal.
   ================================================================ */
(function () {
  'use strict';
  const LS = 'rh-ai-v1';

  const PRESETS = [
    { id: 'pollinations', n: 'Pollinations (ingyenes, kulcs nélküli)', base: 'https://text.pollinations.ai/openai', model: 'openai', mdl: 'https://text.pollinations.ai/models' },
    { id: 'openai', n: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { id: 'openrouter', n: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
    { id: 'ollama', n: 'Ollama (helyi)', base: 'http://localhost:11434/v1', model: 'llama3.2' },
    { id: 'lmstudio', n: 'LM Studio (helyi)', base: 'http://localhost:1234/v1', model: 'local-model' },
    { id: 'egyeni', n: 'Egyéni (OpenAI-kompatibilis)', base: '', model: '' }
  ];

  const RHAI = {
    PRESETS: PRESETS,
    prov: 'pollinations',
    night: true,
    _cfg: {}
  };

  /* ---------- tárolás ---------- */
  function load() {
    try {
      const j = JSON.parse(localStorage.getItem(LS) || '{}');
      if (j.prov) RHAI.prov = j.prov;
      if (typeof j.night === 'boolean') RHAI.night = j.night;
      RHAI._cfg = j.cfg || {};
    } catch (e) { RHAI._cfg = {}; }
  }
  function persist() {
    try {
      localStorage.setItem(LS, JSON.stringify({ prov: RHAI.prov, night: RHAI.night, cfg: RHAI._cfg }));
    } catch (e) {}
  }
  load();

  RHAI.cfgOf = function (id) {
    const p = PRESETS.find(x => x.id === id) || PRESETS[0];
    const o = RHAI._cfg[id] || {};
    return {
      id: p.id, n: p.n,
      base: o.base || p.base || '',
      key: o.key || '',
      model: o.model || p.model || ''
    };
  };
  RHAI.setCfg = function (id, cfg) {
    RHAI._cfg[id] = Object.assign(RHAI._cfg[id] || {}, cfg);
    persist();
  };
  RHAI.resetCfg = function () { RHAI._cfg = {}; persist(); };

  /* ---------- segédek ---------- */
  function headers(c) {
    const h = { 'Content-Type': 'application/json' };
    if (c.key) h['Authorization'] = 'Bearer ' + c.key;
    return h;
  }

  /* ---------- modelllista (sosem blokkol) ---------- */
  RHAI.listModels = async function () {
    const c = RHAI.cfgOf(RHAI.prov);
    const urls = [];
    if (c.id === 'pollinations') urls.push(c.mdl || 'https://text.pollinations.ai/models');
    if (c.base) urls.push(c.base.replace(/\/$/, '') + '/models');
    let lastErr = null;
    for (const u of urls) {
      try {
        const mlc = new AbortController(); const mlt = setTimeout(() => mlc.abort(), 15000);
        let r; try { r = await fetch(u, { headers: c.key ? { 'Authorization': 'Bearer ' + c.key } : {}, signal: mlc.signal }); } finally { clearTimeout(mlt); }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        let models = [];
        if (Array.isArray(j)) {
          models = j.map(m => (typeof m === 'string' ? m : (m.name || m.id || m.model))).filter(Boolean);
        } else if (j && Array.isArray(j.data)) {
          models = j.data.map(m => (typeof m === 'string' ? m : (m.id || m.name))).filter(Boolean);
        } else if (j && Array.isArray(j.models)) {
          models = j.models.map(m => (typeof m === 'string' ? m : (m.name || m.id))).filter(Boolean);
        }
        if (!models.length) throw new Error('üres modelllista');
        return { models: models, src: u.indexOf('pollinations.ai/models') >= 0 ? 'pollinations' : 'API' };
      } catch (e) { lastErr = e; }
    }
    throw new Error(lastErr ? lastErr.message : 'nem elérhető modelllista');
  };

  /* ---------- chat (egyetlen válasz szöveg) ---------- */
  RHAI.chat = async function (prompt, system, history, ms) {
    const tryChain = RHAI.night
      ? [RHAI.prov, 'pollinations'].filter((v, i, a) => a.indexOf(v) === i)
      : [RHAI.prov];
    let lastErr = null;
    for (const pid of tryChain) {
      const c = RHAI.cfgOf(pid);
      if (!c.base) continue;
      try {
        const msgs = [];
        if (system) msgs.push({ role: 'system', content: system });
        (history || []).forEach(h => msgs.push(h));
        msgs.push({ role: 'user', content: prompt });
        const chc = new AbortController(); const cht = setTimeout(() => chc.abort(), ms || 120000);
        let r; try {
          r = await fetch(c.base.replace(/\/$/, '') + '/chat/completions', {
            method: 'POST',
            headers: headers(c),
            signal: chc.signal,
            body: JSON.stringify({ model: c.model || 'openai', messages: msgs, temperature: 0.6 })
          });
        } finally { clearTimeout(cht); }
        if (!r.ok) {
          const t = await r.text().catch(() => '');
          throw new Error('HTTP ' + r.status + (t ? ': ' + t.slice(0, 120) : ''));
        }
        const j = await r.json();
        const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (!txt) throw new Error('üres válasz');
        return txt;
      } catch (e) { lastErr = (e && e.name === 'AbortError') ? new Error('Időtúllépés / megszakítva') : e; }
    }
    throw new Error(lastErr ? lastErr.message : 'nincs beállított szolgáltató');
  };

  window.RHAI = RHAI;
})();
