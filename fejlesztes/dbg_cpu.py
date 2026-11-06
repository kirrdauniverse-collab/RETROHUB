#!/usr/bin/env python3
"""CPU-állapot debug: C64 és HT mag — meddig jutott a ROM?"""
from playwright.sync_api import sync_playwright

F = '/home/z/my-project/download/RETROHUB.html'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1366, 'height': 768})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.goto('file://' + F)
    pg.wait_for_timeout(2000)

    def boot(nev, wait=3000):
        pg.click(f'#list .mod:has-text("{nev}")', timeout=4000)
        pg.wait_for_timeout(300)
        pg.click('#load', timeout=3000)
        pg.wait_for_timeout(wait)

    boot('Commodore 64')
    d = pg.evaluate("""(() => { const c = RH.coreOf.c64, m = c.f, cpu = m.cpu;
      return { pc: cpu.pc.toString(16), halted: cpu.halted, cycles: cpu.cycles,
        io: m.ioPort.toString(16), ddr: m.ddr,
        kernal_fffc: m.romKernal[0xFFFC-0xE000].toString(16),
        ram_0400: m.mem[0x400], a: cpu.a.toString(16),
        irqVec: [m.readMem(0xFFFE), m.readMem(0xFFFF)].map(x=>x.toString(16)) }; })()""")
    print('C64 CPU:', d)

    pg.click('#eject'); pg.wait_for_timeout(300)
    boot('HT1080Z')
    d = pg.evaluate("""(() => { const c = RH.coreOf.ht, cpu = c._cpu || null;
      const m = c.mem;
      return { pc: window.RH_HT_CPU ? RH_HT_CPU.pc.toString(16) : 'nincs kint',
        rom0: [m[0], m[1], m[2]].map(x=>x.toString(16)),
        vid: [m[0x3C00], m[0x3C01], m[0x3C0A]].map(x=>x.toString(16)) }; })()""")
    print('HT:', d)
    print('HIBÁK:', errs if errs else '(nincs)')
    b.close()
