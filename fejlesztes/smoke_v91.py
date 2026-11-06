#!/usr/bin/env python3
"""v9.1 füstteszt: bootok, gépelés, menük, billentyűzetek."""
import json
from playwright.sync_api import sync_playwright

F = '/home/z/my-project/download/RETROHUB.html'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1366, 'height': 768})
    errs = []
    pg.on('pageerror', lambda e: errs.append('PE: ' + str(e)[:250]))
    pg.on('console', lambda m: errs.append('[ce] ' + m.text[:200]) if m.type == 'error' else None)
    pg.goto('file://' + F)
    pg.wait_for_timeout(2500)

    rep = pg.evaluate("""({
      listak: document.querySelectorAll('#list .mod').length,
      rh: typeof RH, gen: typeof RHGEN, ai: typeof RHAI,
      kt: RH_C64_KTAB ? RH_C64_KTAB.length : -1,
      htkb: window.RH_HTKB ? RH_HTKB.rows.length : -1,
      tvc: typeof TVCMachine, primo: typeof PrimoMachine, ent: typeof EnterpriseMachine,
      sae: typeof ScriptedAmigaEmulator, asm: typeof RHASM,
      tools: RHGEN ? RHGEN.TOOLS.length : -1
    })""")
    print(json.dumps(rep, ensure_ascii=False))

    def boot(nev, wait=2600):
        pg.click(f'#list .mod:has-text("{nev}")', timeout=4000)
        pg.wait_for_timeout(300)
        pg.click('#load', timeout=3000)
        pg.wait_for_timeout(wait)
        return pg.evaluate("document.querySelector('#st')?.textContent")

    def scr64(rows=2):
        return pg.evaluate(f"""(() => {{
          const c = RH.coreOf.c64; if (!c) return null; const m = c.f.mem; let s='';
          for (let r=0;r<{rows};r++) {{ for (let i=0;i<40;i++) {{ let b=m[0x400+r*40+i]&0x7F;
            s += b<32?String.fromCharCode(b+64):(b<64?String.fromCharCode(b):'.'); }} s+='|'; }}
          return s; }})()""")

    print('Spectrum:', boot('ZX Spectrum 48K'))
    pg.click('#eject'); pg.wait_for_timeout(300)
    print('C64:', boot('Commodore 64', 3500))
    print('  C64 képernyő:', repr(scr64()))
    pg.evaluate("RH.coreOf.c64.typeText('PRINT 2+2')")
    pg.wait_for_timeout(6000)
    print('  C64 gépelés után:', repr(scr64(4)))

    pg.click('#eject'); pg.wait_for_timeout(300)
    print('HT:', boot('HT1080Z', 3500))
    hts = pg.evaluate("""(() => { const c=RH.coreOf.ht; if(!c) return null; let s='';
      for (let i=0;i<64;i++){ let b=c.mem[0x3C00+i]&0x3F; s += (b<32?String.fromCharCode(b+64):String.fromCharCode(b)); }
      return s; })()""")
    print('  HT képernyő:', repr(hts))
    pg.evaluate("RH.coreOf.ht.typeText('PRINT 26')")
    pg.wait_for_timeout(6000)
    hts2 = pg.evaluate("""(() => { const c=RH.coreOf.ht; let s='';
      for (let r=0;r<3;r++) for (let i=0;i<64;i++){ let b=c.mem[0x3C00+r*64+i]&0x3F; s += (b<32?String.fromCharCode(b+64):String.fromCharCode(b)); if(i===63)s+='|'; }
      return s; })()""")
    print('  HT gépelés után:', repr(hts2))
    pg.screenshot(path='/tmp/render/v91_ht.png')

    for nev in ['Videoton TVC', 'Primo B-64', 'Enterprise']:
        pg.click('#eject'); pg.wait_for_timeout(250)
        print(nev + ':', boot(nev, 3000))

    pg.click('#eject'); pg.wait_for_timeout(250)
    print('Amiga:', boot('Amiga', 6000))
    pg.screenshot(path='/tmp/render/v91_amiga.png')

    # billentyűzet láthatóság (v9.1)
    pg.click('#eject'); pg.wait_for_timeout(250)
    boot('Commodore 16', 2500)
    kbm = pg.evaluate("""(() => { const kb=document.querySelector('#rh-kb');
      return kb && !kb.hidden ? {lathato: kb.getBoundingClientRect().bottom <= innerHeight+2, gombok: kb.querySelectorAll('.kb-key').length} : {lathato:false, hidden:kb?.hidden}; })()""")
    print('C16 billentyűzet:', json.dumps(kbm, ensure_ascii=False))

    # fejlesztői központ
    pg.click('#devbtn'); pg.wait_for_timeout(500)
    grp = pg.evaluate("[...document.querySelectorAll('#rh-groupr button')].map(b=>b.textContent)")
    print('Csoportok:', grp)
    pg.click("#rh-groupr button:has-text('FEJLESZTÉS')"); pg.wait_for_timeout(300)
    sub = pg.evaluate("[...document.querySelectorAll('#rh-content .subtabs button')].map(b=>b.textContent)")
    print('Fejlesztés alcímkék:', sub)
    pg.click("#rh-content .subtabs button:has-text('Assembler')"); pg.wait_for_timeout(300)
    asm = pg.evaluate("""(() => { try { const r = RHASM.assemble('  org $8000\\nstart: ld a,2\\nloop: inc a\\n      jr loop', 0x8000); return r.bytes.length + ':' + r.listing; } catch(e) { return 'HIBA: '+e.message; } })()""")
    print('Assembler:', asm)
    pg.screenshot(path='/tmp/render/v91_dev.png')
    pg.click('#dclose')

    # AI modal
    pg.click('#rh-aibtn'); pg.wait_for_timeout(400)
    print('AI modal:', pg.evaluate("!!document.querySelector('#rh-ai-modal')"))
    pg.click('#rh-ai-modal button:has-text("Bezárás")')

    b.close()
    print('\\n--- HIBÁK (első 12) ---')
    seen = set()
    for e in errs[:12]:
        if e not in seen: seen.add(e); print(e)
    if not errs: print('(nincs)')
