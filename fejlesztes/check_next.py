#!/usr/bin/env python3
"""Végső ellenőrzés: RETROHUB v9.1 a Next.js dev szerveren (port 3000)."""
import json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1400, 'height': 950})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:150]))
    pg.goto('http://127.0.0.1:3000/', wait_until='load', timeout=90000)
    pg.wait_for_timeout(2000)

    n = pg.evaluate("""() => { const f = document.querySelector('iframe');
      try { return f.contentDocument.querySelectorAll('#list .mod').length; } catch(e){ return 'ERR'; } }""")
    logo = pg.evaluate("""() => { const f = document.querySelector('iframe');
      try { return f.contentDocument.querySelector('.logo')?.textContent; } catch(e){ return '?'; } }""")
    print(json.dumps({'gepek': n, 'logo': logo}, ensure_ascii=False))

    pg.evaluate("""() => { const f = document.querySelector('iframe'); const d = f.contentDocument, w = f.contentWindow;
      const spec = [...d.querySelectorAll('#list .mod')].find(m => m.textContent.includes('ZX Spectrum 48K'));
      spec.click(); setTimeout(() => w.document.querySelector('#load').click(), 300); }""")
    pg.wait_for_timeout(3000)
    st = pg.evaluate("""() => { const f = document.querySelector('iframe');
      try { return f.contentDocument.querySelector('#st')?.textContent; } catch(e){ return '?'; } }""")
    kb = pg.evaluate("""() => { const f = document.querySelector('iframe'); const d = f.contentDocument;
      const kb = d.querySelector('#zx-kb');
      return kb && !kb.hidden ? { latszik: kb.getBoundingClientRect().bottom <= f.clientHeight + 2, gombok: kb.querySelectorAll('.kb-key').length } : { latszik: false }; }""")
    print('Spectrum:', st, '| billentyűzet:', json.dumps(kb, ensure_ascii=False))
    pg.screenshot(path='/tmp/render/vegszo_3000.png')
    print('HIBÁK:', errs if errs else '(nincs)')
    b.close()
