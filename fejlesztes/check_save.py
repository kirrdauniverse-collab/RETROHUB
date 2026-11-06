#!/usr/bin/env python3
"""v9.2 ellenőrzés: fájlmentés-fallback claude.use nélkül (GitHub Pages-szerű környezet).
Bizonyítja: TAP/tXT mentés működik sima böngészőben is (Blob + <a download>)."""
import os
from playwright.sync_api import sync_playwright

F = '/home/z/my-project/download/RETROHUB.html'

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(accept_downloads=True, viewport={'width': 1366, 'height': 768})
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.goto('file://' + F)
    pg.wait_for_timeout(2000)

    # 1) biztos, hogy Pages-szerű környezet: nincs window.claude
    has_claude = pg.evaluate("typeof window.claude !== 'undefined'")
    print('window.claude létezik:', has_claude, '(várható: False — fallbacket kell használnia)')
    assert not has_claude

    # 2) Uint8Array mentés (TAP/SNA/SCR út)
    with pg.expect_download(timeout=8000) as di:
        pg.evaluate("download('rh-teszt.tap', new Uint8Array([1,2,3,4,5]))")
    d = di.value
    d.save_as('/tmp/rh-teszt.tap')
    data = open('/tmp/rh-teszt.tap', 'rb').read()
    ok1 = (d.suggested_filename == 'rh-teszt.tap' and data == bytes([1,2,3,4,5]))
    print('Uint8 mentés:', d.suggested_filename, len(data), 'bájt — tartalom egyezik:', ok1)

    # 3) string mentés
    with pg.expect_download(timeout=8000) as di2:
        pg.evaluate("download('rh-teszt.txt', 'szia Retrohub')")
    d2 = di2.value
    d2.save_as('/tmp/rh-teszt.txt')
    ok2 = open('/tmp/rh-teszt.txt', 'rb').read() == b'szia Retrohub'
    print('String mentés:', d2.suggested_filename, '— tartalom egyezik:', ok2)

    # 4) naplóüzenet
    logok = pg.evaluate("document.body.innerText.includes('Mentve: rh-teszt.tap')")
    print('Napló "Mentve:" üzenet látszik:', logok)

    b.close()
    print('JS hibák:', errs[:5] if errs else '(nincs)')
    print('EREDMÉNY:', 'SIKER' if (ok1 and ok2 and not errs) else 'HIBA')
