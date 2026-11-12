#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RETROHUB v9 build: egyetlen HTML összeállítása a forrás-összetevőkből.
 - RETROSHELL váz (CSS, shell, Spectrum+ZX81 magok és panelek) átemelése
 - 23 gépes gépnyilvántartás, státusz-jelölések
 - beágyazott ROM-ok (RH_ROMS)
 - generikus Z80 gépek (HT1080Z, TVC, Primo, Enterprise), 6502 gépek (C64, C16/Plus4)
 - SAE Amiga mag inline
 - központi menümotor (RHGEN), RHMS AI, billentyűzet-építő
"""
import os, re, base64, zipfile, sys

SRC = '/home/z/my-project/upload/osszetevok/RETROSHELL – Emulátor keretrendszer-Működő Spectrum és ZX81 nagyo retro felülettel és sok fejlesztői funkciókkal.html'
ZIP = '/home/z/my-project/upload/RETROHUB.html'
AMIGA_SAE = '/home/z/my-project/upload/forras/amiga_proj/public/sae'
LIB = '/home/z/my-project/upload/osszetevok/rwsrc/src/lib'
OUT = '/home/z/my-project/download/RETROHUB.html'
PARTS = '/home/z/my-project/scripts/v9'

os.makedirs(PARTS, exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# ---------------------------------------------------------------- forrás feldarabolás
data = open(SRC, encoding='utf-8', errors='replace').read()
L = data.split('\n')

def seg(a, b):  # 1-alapú, zárt intervallum
    return '\n'.join(L[a-1:b])

css      = seg(9, 187)      # <style> tartalom
body     = seg(190, 464)    # <body> ... (fejléc, lista, képernyő, panelek)
shell1   = seg(466, 529)    # RETROSHELL váz-script (IIFE)
spec2    = seg(532, 3484)   # Spectrum modul (AY, Z80, Spectrum, eszközök) — globális scope
zx81_3   = seg(3487, 4756)  # ZX81 modul
regs4    = seg(4759, 4784)  # zxs regisztráció (a <script> nyitótag NEM része)
regs5    = seg(4787, 4819)  # zx81 regisztráció (a <script> nyitótag NEM része)

# ---------------------------------------------------------------- TS -> JS csípző (soralapú, konzervatív)
def strip_ts(src: str) -> str:
    # 1) interface blokkok kiszedése kapcsos-zárójeles egyeztetéssel
    out_lines = []
    lines = src.split('\n')
    i = 0
    while i < len(lines):
        l = lines[i]
        if re.match(r'^\s*(export\s+)?interface\s+\w+', l):
            depth = 0
            started = False
            while i < len(lines):
                depth += lines[i].count('{') - lines[i].count('}')
                if '{' in lines[i]: started = True
                i += 1
                if started and depth <= 0: break
            continue
        out_lines.append(l)
        i += 1
    src2 = '\n'.join(out_lines)
    # 2) import sorok, export prefixek, type-alias sorok
    src2 = re.sub(r'^[ \t]*import\s[^;]*;[ \t]*$', '', src2, flags=re.M)
    src2 = re.sub(r'^[ \t]*(export[ \t]+)?type\s+\w+[^;]*;[ \t]*$', '', src2, flags=re.M)
    src2 = re.sub(r'^([ \t]*)export\s+default\s+', r'\1', src2, flags=re.M)
    src2 = re.sub(r'^([ \t]*)export\s+\{[^}]*\};?[ \t]*$', '', src2, flags=re.M)
    src2 = re.sub(r'^([ \t]*)export\s+(?=(const|let|var|class|function|async))', r'\1', src2, flags=re.M)
    # 3) private/public/readonly prefixek
    src2 = re.sub(r'\b(private|public|protected|readonly)\s+', '', src2)
    # 4) "as const" / " as X" kasztok
    src2 = re.sub(r'\s+as\s+(const|[A-Za-z_][\w.<>\[\]|]*)', '', src2)
    # 5) típusannotációk — csak kódsorokon, komment nélkül, ternary/case mentesen
    fixed = []
    for l in src2.split('\n'):
        code = l
        comment = ''
        ci = code.find('//')
        if ci >= 0:
            code, comment = code[:ci], code[ci:]
        ternary = re.search(r'\?\s*[^?:\s][^?:]*\s*:', code)
        safe = (not ternary) and ('case ' not in code) and (not re.search(r'\bdefault\s*:', code))
        if (':' in code):
            TY = r'[A-Za-z_][\w<>\[\]]*(?:\s*\|\s*[A-Za-z_][\w<>\[\]]*)*'
            is_sig = re.search(r'(\w+\s*\(|\w+\s*=\s*\()', code) is not None or re.match(r'^\s*\w+\??\s*:\s*[A-Za-z_][\w<>\[\]]*\s*,?\s*$', code) is not None
            # --- visszatérési típus: ") : Típus {" / ") : Típus =>" (mindig, ternary-biztos) ---
            code = re.sub(r'\)\s*:\s*\{[^}]*\}\s*\{', ') {', code)
            code = re.sub(r'\)\s*:\s*[A-Za-z_][^{\n=]*\{', ') {', code)
            code = re.sub(r'\)\s*:\s*[A-Za-z_][^\n=]*=>', ') =>', code)
            # --- paraméterek csak függvény-kontextusban ---
            if is_sig:
                code = re.sub(r'(\(\s*)(\w+)\??\s*:\s*\{[^}]*\}(?=\s*[,)])', r'\1\2', code)
                code = re.sub(r'([(,]\s*)(\w+)\??\s*:\s*' + TY + r'(?=\s*[,)])', r'\1\2', code)
                code = re.sub(r'^(\s*)(\w+)\??\s*:\s*' + TY + r'\s*,?\s*$', lambda m: m.group(1) + m.group(2) + (',' if code.rstrip().endswith(',') else ''), code)
            # --- ternary-érzékeny szabályok csak tiszta sorokon ---
            if safe:
                code = re.sub(r'(\b\w+)\s*:\s*Record<[^>]*>(?=\s*[=;,)])', r'\1', code)
                code = re.sub(r'(\b\w+)\s*:\s*\[[^\]=]*\](?:\[\])?(?=\s*=)', r'\1', code)
                code = re.sub(r'(\b\w+)\s*:\s*[A-Za-z_][\w<>\[\]]*\[\](?=\s*[=;,)])', r'\1', code)
                code = re.sub(r'(\bconst\s+\w+|\b\w+)\s*:\s*' + TY + r'(?=\s*=)', r'\1', code)
                code = re.sub(r'(\b\w+)\s*:\s*' + TY + r'\s*;', r'\1;', code)
        fixed.append(code + comment)
    return '\n'.join(fixed)

# ---------------------------------------------------------------- ROM-ok a ZIP-ből
z = zipfile.ZipFile(ZIP)
def zread(nm):
    return z.read('RETROHUB_összetevők/' + nm)

ROMS = {}
ROMS['zx81']    = zread('ZX81/ROM/zx81.rom')
ROMS['c64basic']  = zread('Commodore 64_128/ROM/BASIC.ROM')
ROMS['c64kernal'] = zread('Commodore 64_128/ROM/KERNAL.ROM')
ROMS['c64char']   = zread('Commodore 64_128/ROM/CHAR.ROM')
ROMS['c16low']  = zread('Commodeore 16_plus4/ROM/basic')
ROMS['c16high'] = zread('Commodeore 16_plus4/ROM/kernal')
ROMS['ht']      = zread('HT1080Z/ROM/HT1.ROM')
ROMS['tvc']     = zread('TVC/ROM/Basic-2_2/TVC22_D6.64K') + zread('TVC/ROM/Basic-2_2/TVC22_D4.64K')
ROMS['tvcext']  = zread('TVC/ROM/Basic-2_2/TVC22_D7.64K')
ROMS['primo']   = zread('Primo/ROM/b64.rom')
ROMS['exos']    = zread('Enterprise/ROM/Exos (198x)(Enterprise)/Exos (198x)(Enterprise).bin')
ROMS['ebasic']  = zread('Enterprise/ROM/BASIC Interpreter v2.1 (1985)(Intelligent Software)/BASIC Interpreter v2.1 (1985)(Intelligent Software).bin')
ROMS['aros']    = open('/home/z/my-project/upload/forras/amiga_proj/public/media/aros-rom.bin', 'rb').read()
ROMS['arosext'] = open('/home/z/my-project/upload/forras/amiga_proj/public/media/aros-ext.bin', 'rb').read()

# v9.3.3: valódi Kickstart ROM-ok (kulcs nélküli dumpok; a checksum mező 0x14–0x17 javítva, hogy az összeg 0 legyen)
def _fixck(d):
    import struct as _s
    field = _s.unpack('>I', d[0x14:0x18])[0]
    t = 0
    for i in range(0, len(d) - 3, 4):
        t = (t + _s.unpack('>I', d[i:i + 4])[0]) & 0xFFFFFFFF
    t_others = (t - field) & 0xFFFFFFFF
    d = bytearray(d); d[0x14:0x18] = _s.pack('>I', (-t_others) & 0xFFFFFFFF)
    return bytes(d)

try:
    ROMS['amiga'] = _fixck(open('/home/z/my-project/upload/Kickstart v3.1 rev 40.68 (1993)(Commodore)(A1200)[!].rom', 'rb').read())
    ROMS['amiga13'] = _fixck(open('/home/z/my-project/upload/Kick.rom', 'rb').read()[:262144])
    print('KS ROM: amiga (KS 3.1 40.68) + amiga13 (KS 1.3 34.5) beágyazva')
except OSError as e:
    print(f'KS ROM figyelmeztetés: {e} — AROS marad')

for k, v in ROMS.items():
    print(f'ROM {k}: {len(v):,} bytes')

roms_js = 'window.RH_ROMS={\n' + ',\n'.join(
    f"{k}: '{base64.b64encode(v).decode()}'" for k, v in ROMS.items()) + '\n};\n'

# ---------------------------------------------------------------- SAE összeállítás
SAE_ORDER = ["prototypes","utils","dms","config","roms","memory","autoconf","expansion","events",
             "gayle","ide","filesys","hardfile","dongle","input","serpar","custom","blitter","copper",
             "playfield","video","audio","cia","disk","rtc","m68k","cpu","amiga"]
sae_parts = []
for nm in SAE_ORDER:
    p = os.path.join(AMIGA_SAE, nm + '.js')
    sae_parts.append(f'// ===== SAE: {nm}.js =====\n' + open(p, encoding='utf-8', errors='replace').read())
sae_js = '\n\n'.join(sae_parts)
print('SAE össz-méret:', len(sae_js), 'bytes')

# ---------------------------------------------------------------- TS magok átalakítása + IIFE csomagolás
def iife(name, code, exports):
    # exports: 'Név' (azonos lokál+globál) vagy 'Globál=Lokál'
    exp = ''
    for k in exports:
        if '=' in k:
            g, l = k.split('=', 1)
            exp += '  window.%s = %s;\n' % (g, l)
        else:
            exp += '  window.%s = %s;\n' % (k, k)
    head = '/* ===== %s (IIFE) ===== */\n(function(){\n"use strict";\n' % name
    return head + code + '\n' + exp + '})();\n'

cpu6502_raw = strip_ts(open(f'{LIB}/legacy/cpu6502.ts', encoding='utf-8', errors='replace').read())
# JSR javítás: a kanonikus 6502 a verem tetejére az UTOLSÓ operandusbájt címét teszi,
# az RTS +1-gyel tér vissza. Az eredeti kód eggyel korábbi címet tett (off-by-one).
cpu6502_raw = cpu6502_raw.replace(
    'this.push((this.pc - 1) >> 8); this.push((this.pc - 1) & 0xFF);',
    'this.push(this.pc >> 8); this.push(this.pc & 0xFF);')
c64fam_raw  = strip_ts(open(f'{LIB}/legacy/c64.ts', encoding='utf-8', errors='replace').read())
z80gen_raw  = strip_ts(open(f'{LIB}/legacy/z80.js', encoding='utf-8', errors='replace').read())
kbd_tvc_raw = strip_ts(open(f'{LIB}/tvc/keyboard.ts', encoding='utf-8', errors='replace').read())
kbd_primo_raw = strip_ts(open(f'{LIB}/primo/keyboard.ts', encoding='utf-8', errors='replace').read())
kbd_ent_raw = strip_ts(open(f'{LIB}/enterprise/keyboard.ts', encoding='utf-8', errors='replace').read())

cpu6502_js = iife('Cpu6502 (6502 mag)', cpu6502_raw, ['Cpu6502'])
c64fam_raw += '\nconst C64_PROFILES = PROFILES;'
c64fam_js  = iife('C64Family (C64/C16 gép)', c64fam_raw, ['C64Family', 'C64_COLORS', 'C64_PROFILES'])
z80gen_js  = iife('Z80 generikus mag', z80gen_raw, ['Z80'])
kbd_tvc_js = iife('TVC billentyűzet-mátrix', kbd_tvc_raw, ['TVC_ROWS'])
kbd_primo_js = iife('Primo billentyűzet-mátrix', kbd_primo_raw, ['PRIMO_LAYOUT', 'PRIMO_SHIFT'])
kbd_ent_js = iife('Enterprise billentyűzet-mátrix', kbd_ent_raw, ['EP_LAYOUT', 'EP_SHIFT_L', 'EP_SHIFT_R'])

# géposztályok: TVC / Primo / Enterprise (RWCORES)
def fam(parts):
    code = '\n\n'.join(strip_ts(open(f'{LIB}/{p}', encoding='utf-8', errors='replace').read()) for p in parts)
    return code

# a gépek a zx81/z80.ts (callback-alapú) Z80-ját használják — ezt egy közös IIFE-ben szolgáltatjuk
z80cb_raw = strip_ts(open(f'{LIB}/zx81/z80.ts', encoding='utf-8', errors='replace').read())
z80cb_js = iife('Z80 (callback-alapú, RWCORES gépekhez)', z80cb_raw, ['Z80C=Z80'])
z80cb_alias = 'const Z80 = window.Z80C;'

# a primo machine.ts és screen.ts ugyanazokat a FG/BG konstansokat deklarája — duplikátumok kiszűrése
def dedupe_consts(code):
    seen = set()
    out = []
    for l in code.split('\n'):
        m = re.match(r'^const (\w+) =', l)
        if m:
            if m.group(1) in seen:
                continue
            seen.add(m.group(1))
        out.append(l)
    return '\n'.join(out)

tvc_code = dedupe_consts(fam(['tvc/crtc.ts', 'tvc/machine.ts', 'tvc/screen.ts']))
primo_code = dedupe_consts(fam(['primo/machine.ts', 'primo/screen.ts']))
ent_code = dedupe_consts(fam(['enterprise/dave.ts', 'enterprise/nick.ts', 'enterprise/machine.ts', 'enterprise/screen.ts']))
# a gépek a callback-alapú Z80-at várják
tvc_code = z80cb_alias + '\n' + tvc_code
primo_code = z80cb_alias + '\n' + primo_code
ent_code = z80cb_alias + '\n' + ent_code

machine_tvc_js = iife('TVC machine (RWCORES)', tvc_code, ['TVCMachine', 'TVC_SCREEN_W', 'TVC_SCREEN_H', 'renderTVC', 'TVC_PALLETE_RGB'])
machine_primo_js = iife('Primo machine (RWCORES)', primo_code, ['PrimoMachine', 'PRIMO_SCREEN_W', 'PRIMO_SCREEN_H', 'renderPrimo'])
machine_ent_js = iife('Enterprise machine (RWCORES)', ent_code, ['EnterpriseMachine', 'renderEnterprise'])

for nm, s in [('cpu6502', cpu6502_raw), ('c64fam', c64fam_raw), ('z80gen', z80gen_raw),
              ('kbd_tvc', kbd_tvc_raw), ('kbd_primo', kbd_primo_raw), ('kbd_ent', kbd_ent_raw)]:
    open(f'{PARTS}/_strip_{nm}.js', 'w', encoding='utf-8').write(s)

# ---------------------------------------------------------------- C64 KERNAL billentyűtábla kinyerése
# a KERNAL ROM fájl a $E000-nál kezdődik: fájl-offset = cím - 0xE000
kt = ROMS['c64kernal']
KTAB_UNSHIFT = kt[0x0B81:0x0B81+64]   # $EB81
KTAB_SHIFT   = kt[0x0BC1:0x0BC1+64]   # $EBC1
k64 = 'window.RH_C64_KTAB=[' + ','.join(str(b) for b in KTAB_UNSHIFT) + '];\n'
k64 += 'window.RH_C64_KTABS=[' + ','.join(str(b) for b in KTAB_SHIFT) + '];\n'
open(f'{PARTS}/_c64_ktab.js', 'w', encoding='utf-8').write(k64)
print('C64 keytab unshift első 8:', [hex(b) for b in KTAB_UNSHIFT[:8]])

# ---------------------------------------------------------------- shell1 javítások
s = shell1
# 1) MODS cseréje 23 gépre
mods_new = """var MODS=[
{id:'zx81',real:1,n:'Sinclair ZX81',y:1981,k:'8',cpu:'Z80 @ 3,25 MHz',ram:'1–64 KB',res:[256,192],txt:'32×24',col:2,gfx:'block',snd:'nincs (opc. ZON X-81 AY)',st:'MŰKÖDIK',pal:['#000','#fff'],boot:'\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n(C) 1981 Sinclair Research Ltd\\n\\nK'},
{id:'zxs',real:1,n:'ZX Spectrum 48K',y:1982,k:'8',cpu:'Z80A @ 3,5 MHz',ram:'48 KB',res:[256,192],txt:'32×24',col:15,gfx:'attr',snd:'beeper',st:'MŰKÖDIK',pal:['#000','#0000d7','#d70000','#d700d7','#00d700','#00d7d7','#d7d700','#d7d7d7'],boot:'\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n(C) 1982 Sinclair Research Ltd'},
{id:'c64',real:1,n:'Commodore 64',y:1982,k:'8',cpu:'6510 @ 1 MHz',ram:'64 KB',res:[320,200],txt:'40×25',col:16,gfx:'pixel',snd:'SID 6581',st:'RÉSZLEGES (KERNAL fut, BASIC-prompt még nem jelenik meg)',pal:['#000','#fff','#883932','#67b6bd','#8b5429','#55a049','#40318d','#bfce72','#8b5429','#574200','#b86962','#505050','#787878','#94e089','#7869c4','#9f9f9f'],boot:'\\n    **** COMMODORE 64 BASIC V2 ****\\n\\n 64K RAM SYSTEM  38911 BASIC BYTES FREE\\n\\nREADY.'},
{id:'c16',real:1,n:'Commodore 16 / Plus/4',y:1984,k:'8',cpu:'7501 @ 1,76 MHz',ram:'16/64 KB',res:[320,200],txt:'40×25',col:16,gfx:'pixel',snd:'TED hang',st:'RÉSZLEGES',pal:['#000','#fff','#68372b','#70a4b2','#6f3d86','#588d43','#352879','#b8c76f','#6f4f25','#433900','#9a6759','#444','#6c6c6c','#9ad284','#6c5eb5','#959595'],boot:'\\n\\n**** COMMODORE BASIC 3.5 ****\\n\\n 60671 BASIC BYTES FREE\\n\\nREADY.'},
{id:'ht',real:1,n:'HT1080Z',y:1983,k:'8',cpu:'Z80 @ 1,77 MHz',ram:'16 KB',res:[384,192],txt:'64×16',col:2,gfx:'text',snd:'kazetta hang',st:'BETA (TRS-80 Model I szint)',pal:['#000','#fff'],boot:'\\n\\nRADIO SHACK TRS-80 MICROCOMPUTER\\nLEVEL II BASIC\\nREADY\\n>'},
{id:'tvc',real:1,n:'Videoton TVC 64+',y:1986,k:'8',cpu:'Z80 @ 3,5 MHz',ram:'64 KB',res:[512,240],txt:'32×24 / 40×25',col:16,gfx:'text',snd:'beep',st:'RÉSZLEGES (kijelzés korlátozott)',pal:['#000','#f00','#0f0','#ff0','#00f','#f0f','#0ff','#fff'],boot:'\\n\\n\\n\\nTVC 64+\\nVIDEOTON\\n\\nREADY'},
{id:'primo',real:1,n:'Primo B-64',y:1984,k:'8',cpu:'U880D (Z80) @ 3,5 MHz',ram:'64 KB',res:[256,192],txt:'32×24',col:2,gfx:'text',snd:'beep',st:'MŰKÖDIK (kijelzés közelítő)',pal:['#000','#fff'],boot:'\\n\\n\\n\\n\\n\\nPRIMO B64\\n\\nReady'},
{id:'ent',real:1,n:'Enterprise 64/128',y:1984,k:'8',cpu:'Z80 @ 4 MHz',ram:'64/128 KB',res:[672,256],txt:'52×26',col:256,gfx:'pixel',snd:'DAVE 4 csat.',st:'RÉSZLEGES (kijelzés korlátozott)',pal:['#000','#fff','#f00','#0f0','#00f','#ff0','#0ff','#f0f'],boot:'\\n\\n\\n\\nENTERPRISE COMPUTERS\\nEXOS 2.1\\n\\nREADY'},
{id:'amiga',real:1,n:'Commodore Amiga 500',y:1987,k:'16',cpu:'68000 @ 7,16 MHz',ram:'512 KB–1 MB',res:[320,256],txt:'80×32',col:4096,gfx:'pixel',snd:'Paula 4×8 bit',st:'MŰKÖDIK (SAE mag)',pal:['#05a','#fff','#000','#f80','#d00','#0a0','#fd0','#aaa'],boot:'\\n\\n\\n\\n\\n\\n\\n\\n         [ Kickstart 1.3 ]\\n\\n      Tedd be a Workbench lemezt'},
{id:'c128',n:'Commodore 128',y:1985,k:'8',cpu:'8502 @ 1–2 MHz',ram:'128 KB',res:[320,200],txt:'40/80×25',col:16,gfx:'pixel',snd:'SID 6581',st:'PROFIL (mag nincs)',pal:['#000','#fff','#883932','#67b6bd','#8b5429','#55a049','#40318d','#bfce72'],boot:'\\n\\n    **** COMMODORE 128 BASIC V7 ****\\n\\n 122365 BASIC BYTES FREE\\n\\nREADY.'},
{id:'vic20',n:'Commodore VIC-20',y:1980,k:'8',cpu:'6502 @ 1,02 MHz',ram:'5 KB',res:[176,184],txt:'22×23',col:16,gfx:'pixel',snd:'VIC hang',st:'PROFIL (mag nincs)',pal:['#000','#fff','#a4406c','#7fbfc6','#8b5429','#55a049','#40318d','#bfce72'],boot:'\\n\\n**** COMMODORE VIC-20 ****\\n\\n 3583 BASIC BYTES FREE\\n\\nREADY.'},
{id:'abc80',n:'Luxor ABC 80',y:1978,k:'8',cpu:'Z80 @ 3 MHz',ram:'16–32 KB',res:[240,240],txt:'40×25',col:2,gfx:'text',snd:'nincs',st:'PROFIL (mag nincs)',pal:['#000','#fff'],boot:'\\n\\nABC 80\\nLUXOR\\n\\nREADY'},
{id:'ace',n:'Jupiter ACE',y:1982,k:'8',cpu:'Z80 @ 3,25 MHz',ram:'3–51 KB',res:[256,192],txt:'32×24',col:2,gfx:'text',snd:'beep',st:'PROFIL (mag nincs)',pal:['#000','#fff'],boot:'\\n\\n\\n\\n\\nJUPITER ACE\\n\\n0 0 FORTH-83\\n\\nReady'},
{id:'atari800xl',n:'Atari 800XL',y:1983,k:'8',cpu:'6502C @ 1,79 MHz',ram:'64 KB',res:[320,192],txt:'40×24',col:256,gfx:'pixel',snd:'POKEY 4 csat.',st:'PROFIL (mag nincs)',pal:['#000','#fff','#f0f','#0ff','#f00','#0f0','#00f','#ff0'],boot:'\\n\\nATARI 800XL\\nMEMO PAD\\n\\nREADY'},
{id:'a2600',n:'Atari 2600',y:1977,k:'con',cpu:'6507 @ 1,19 MHz',ram:'128 B',res:[160,192],txt:'—',col:128,gfx:'pixel',snd:'TIA',st:'PROFIL (mag nincs)',pal:['#000','#fff','#f00','#0f0','#00f','#ff0','#0ff','#f0f'],boot:'\\n\\n\\n\\n\\n\\n\\n      ATARI 2600\\n\\n   (nincs kazetta)'},
{id:'st520',n:'Atari 520ST',y:1985,k:'16',cpu:'68000 @ 8 MHz',ram:'512 KB',res:[320,200],txt:'40×25',col:16,gfx:'pixel',snd:'YM2149',st:'PROFIL (mag nincs)',pal:['#fff','#000','#f00','#0f0','#00f','#0ff','#ff0','#f0f'],boot:'\\n\\n\\n\\n\\n            ATARI ST\\n         TOS 1.04  (nincs lemez)'},
{id:'cpc464',n:'Amstrad CPC 464',y:1984,k:'8',cpu:'Z80A @ 4 MHz',ram:'64 KB',res:[320,200],txt:'40×25',col:27,gfx:'pixel',snd:'AY-3-8912',st:'PROFIL (mag nincs)',pal:['#000','#00f','#f00','#f0f','#0f0','#0ff','#ff0','#fff'],boot:'\\n Amstrad 64K Microcomputer  (v1)\\n\\n (c) 1984 Amstrad Consumer Electronics plc\\n\\n BASIC 1.0\\n\\nReady'},
{id:'msx1',n:'MSX1',y:1983,k:'8',cpu:'Z80A @ 3,58 MHz',ram:'8–64 KB',res:[256,192],txt:'32×24',col:16,gfx:'tile',snd:'AY-3-8910',st:'PROFIL (mag nincs)',pal:['#000','#3eb849','#5dc878','#5455ed','#7d76fc','#d4524d','#42ebf5','#fb5d5c','#fcd04c','#c3cb3e','#b7b7b7','#fff'],boot:'\\n MSX BASIC version 1.0\\n Copyright 1983 by Microsoft\\n 28815 Bytes free\\n Ok'},
{id:'megadrive',n:'Sega Mega Drive',y:1988,k:'16',cpu:'68000 + Z80',ram:'64 KB + 64 KB VRAM',res:[320,224],txt:'—',col:61,gfx:'tile',snd:'YM2612 + PSG',st:'PROFIL (mag nincs)',pal:['#000','#e00','#0a0','#00e','#ee0','#0ee','#e0e','#eee'],boot:'\\n\\n\\n\\n\\n\\n\\n            SEGA\\n      (nincs kazetta)'},
{id:'snes',n:'Super Nintendo',y:1990,k:'16',cpu:'65C816 @ 3,58 MHz',ram:'128 KB',res:[256,224],txt:'—',col:256,gfx:'tile',snd:'S-SMP (SPC700)',st:'PROFIL (mag nincs)',pal:['#000','#1f1f7f','#7f1f1f','#1f7f1f','#7f7f1f','#bfbfbf','#fff','#ff9f1f'],boot:'\\n\\n\\n\\n\\n\\n\\n     SUPER NINTENDO ENTERTAINMENT\\n               SYSTEM'},
{id:'sms',n:'Sega Master System',y:1985,k:'con',cpu:'Z80 @ 3,58 MHz',ram:'8 KB',res:[256,192],txt:'—',col:32,gfx:'tile',snd:'SN76489',st:'PROFIL (mag nincs)',pal:['#000','#550','#0a0','#0f5','#00f','#a0f','#f00','#fa0','#ff0','#fff'],boot:'\\n\\n\\n\\n\\n\\n\\n         SEGA\\n\\n   (nincs kazetta)'},
{id:'nes',n:'Nintendo NES',y:1983,k:'con',cpu:'2A03 @ 1,79 MHz',ram:'2 KB',res:[256,240],txt:'—',col:54,gfx:'tile',snd:'APU (5 csat.)',st:'PROFIL (mag nincs)',pal:['#626262','#002b9c','#3a1ca8','#7b0f7b','#a0123d','#a41f00','#7f2a00','#3b3a00','#0b5100','#0f5a00','#0b5a1d','#0b4d57'],boot:'\\n\\n\\n\\n\\n\\n\\n      NINTENDO ENTERTAINMENT\\n              SYSTEM\\n\\n      (nincs kazetta)'},
{id:'gb',n:'Nintendo Game Boy',y:1989,k:'con',cpu:'LR35902 @ 4,19 MHz',ram:'8 KB',res:[160,144],txt:'—',col:4,gfx:'tile',snd:'4 csatorna',st:'PROFIL (mag nincs)',pal:['#0f380f','#306230','#8bac0f','#9bbc0f'],boot:'\\n\\n\\n\\n\\n\\n\\n        Nintendo\\u00ae\\n\\n   (nincs kazetta)'}
];"""
s = re.sub(r'var MODS=\[.*?\n\];', lambda m: mods_new, s, count=1, flags=re.S)
assert 'zx81' in s and 'c128' in s, 'MODS csere sikertelen'

# 2) státusz-jelvény a listában
s = s.replace(
  "d.children[1].textContent=loaded===m?'FUT':(m.k==='con'?'KONZOL':m.k+' BIT');if(loaded===m)d.children[1].className='badge run';",
  "d.children[1].textContent=loaded===m?'FUT':(m.st||((m.k==='con'?'KONZOL':m.k+' BIT')));if(loaded===m)d.children[1].className='badge run';"
  "d.children[1].title=m.st||'';")
# 3) gép alcím
s = s.replace(
  "d.children[2].textContent=m.y+' · '+m.cpu+' · '+m.ram+(m.real?'  ·  ✔ VALÓDI EMULÁTOR':'');",
  "d.children[2].textContent=m.y+' · '+m.cpu+' · '+m.ram+(m.real?'  ·  ✔ EMULÁTOR-MAG':'  ·  fejlesztői központ él');")
# 4) profil boot üzenet
s = s.replace("show(out+'\\n[ nincs emulátor-mag csatlakoztatva ]')",
  "show(out+'\\n[ profil: emulátor-mag nincs bekötve — a fejlesztői központ (AI, eszközök) ennek ellenére teljesen működik. Nyisd meg: F12 ]')")
s = s.replace("'ÁLLAPOT: '+m.n.toUpperCase()+' – KERET BETÖLTVE, MAG HIÁNYZIK'",
  "'ÁLLAPOT: '+m.n.toUpperCase()+' – PROFIL (fejlesztői központ él, mag nincs)'")
# 5) generikus panelek a mag nélküli gépekhez
s = s.replace("real?core.devOpen(x.id):pane(x,m)",
  "real?core.devOpen(x.id):(window.RHGEN?RHGEN.pane(x,m,core):pane(x,m))")
# 5b) buildDev mutassa a #rh-devpane-t is
s = s.replace("['#pane','#zx-pane','#z81-pane'].forEach(function(q){$(q).hidden=q!==(real?core.devPane:'#pane')});",
  "['#pane','#zx-pane','#z81-pane','#rh-devpane'].forEach(function(q){$(q).hidden=q!==(real?core.devPane:'#pane')});")
# 5c) a mag nélküli gépek eszközlistája = a 6 egységes csoport
s = re.sub(r'function tools\(m\)\{var g=m\.gfx;return \[.*?\]\}\n',
           'function tools(m){return (window.RHGEN?RHGEN.TOOLS:[]).slice();}\n', s, count=1, flags=re.S)
assert 'RHGEN.TOOLS' in s, 'tools csere sikertelen'
# 6) üdvözlés + cím
s = s.replace("RETROSHELL  v0.1", "RETROHUB  v9.2")
s = s.replace("Válassz modult a bal oldali listából,\n  majd nyomd meg a ▶ gombot.\n\n  Moduláris, 8 és 16 bites gépekhez.",
  "Válassz gépet a bal oldali listából, majd nyomd meg\n  a ▶ gombot. A fejlesztői központ (F12) minden gépen\n  azonos menüszerkezetet ad: Vezérlés · Hardver ·\n  Fejlesztés · Paint · Hang · Napló.\n\n  23 gép, 9 emulátor-maggal.")

shell1 = s

# ---------------------------------------------------------------- body javítások
b = body
b = b.replace('RETRO<b>SHELL</b> <span style="font-size:18px;color:var(--dim)">v0.5</span>',
              'RETRO<b>HUB</b> <span style="font-size:18px;color:var(--dim)">v9.2</span>')
b = b.replace('<button id="devbtn" disabled>Fejlesztői központ [F12]</button>',
              '<button id="rh-aibtn" title="Globális AI-programozó beállítások">🤖 AI</button>'
              '<button id="devbtn" disabled>Fejlesztői központ [F12]</button>')
b = b.replace('<div class="zxscreen" id="z81-wrap" hidden><canvas id="z81-screen" width="256" height="192"></canvas></div>',
              '<div class="zxscreen" id="z81-wrap" hidden><canvas id="z81-screen" width="256" height="192"></canvas></div>'
              '<div class="zxscreen" id="rh-wrap" hidden><canvas id="rh-canvas" width="384" height="288" tabindex="0"></canvas></div>')
b += '''
  <div class="zx" id="rh-bar" hidden><div class="tvbar"><button class="primary" id="rh-start">▶</button><button id="rh-pause">⏸</button><button id="rh-reset2">↻</button><span>Állapot: <span class="val" id="rh-status">Idle</span></span><span>Kpk: <span class="val" id="rh-frames">0</span></span><span>FPS: <span class="val" id="rh-fps">0</span></span></div><div class="row"><button id="rh-kbtoggle">⌨ Billentyűzet ki/be</button></div></div>
  <div class="zx" id="rh-kb" hidden><div class="keyboard"><div class="kb-header"><span class="kb-title" id="rh-kb-title">Billentyűzet</span><div class="kb-status" id="rh-kb-status"></div></div><div id="rh-kb-grid"></div></div></div>
'''
body = b

# ---------------------------------------------------------------- v9.3 JAVÍTÁS: ZX81 beágyazott ROM sorrend
# A korábbi init a ZX81-modul (zx81_3) végére fűzve az RH_ROMS blokk ELŐTT futott,
# így a beágyazott ROM friss böngészőben sosem töltődött be. Most az RH_ROMS
# definiáló blokkba került — a definíció UTÁN fut, ezért már látja az adatot.
# (A pillanatkép-modul prologusa további tartalék: ott ez már no-op.)
roms_js += '''
// === v9.3: beágyazott ZX81 ROM (a definíció UTÁN — már látja az RH_ROMS-ot) ===
try { if (!Z81.rom && window.RH_ROMS && RH_ROMS.zx81) {
  const __b = atob(RH_ROMS.zx81), __u = new Uint8Array(__b.length);
  for (let __i = 0; __i < __b.length; __i++) __u[__i] = __b.charCodeAt(__i);
  Z81.rom = __u; const __st = document.querySelector('#z81-romst'); if (__st) __st.textContent = '✓';
  log('ZX81: beágyazott ROM betöltve (8 KB)');
} } catch (e) {}
'''

# ---------------------------------------------------------------- további részek betöltése
def part(fn):
    return open(os.path.join(PARTS, fn), encoding='utf-8').read()

add_css  = part('add_css.css')
engine   = part('engine.js')
ai       = part('ai.js')
cores    = part('cores8.js')
boot9    = part('boot9.js')
snap9    = part('snap.js')   # v9.3 pillanatkép-modul
amigasnap = part('amigasnap.js')   # v9.3.1 Amiga .snapshot példák (RH_AGDEX)
ht_kbd   = part('ht_kbd.js')   # HT1080Z mátrix-adat

# szintaxis-ellenőrzés
import subprocess, tempfile
def jscheck(nm, code):
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
        f.write(code); p = f.name
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    if r.returncode != 0:
        print(f'!!! JS SYNTAX HIBA ({nm}):\n', r.stderr[:3000]); sys.exit(1)
    os.unlink(p)
    print(f'JS OK: {nm} ({len(code):,} b)')

jscheck('engine', engine); jscheck('ai', ai); jscheck('cores', cores); jscheck('boot9', boot9); jscheck('ht_kbd', ht_kbd); jscheck('snap9', snap9); jscheck('amigasnap', amigasnap)
jscheck('cpu6502', cpu6502_js); jscheck('c64fam', c64fam_js); jscheck('z80gen', z80gen_js)
jscheck('z80cb', z80cb_js)
jscheck('kbd_tvc', kbd_tvc_js); jscheck('kbd_primo', kbd_primo_js)
jscheck('kbd_ent', kbd_ent_js); jscheck('machine_tvc', machine_tvc_js)
jscheck('machine_primo', machine_primo_js); jscheck('machine_ent', machine_ent_js); jscheck('ht_kbd', ht_kbd)

# ---------------------------------------------------------------- végső HTML
html = f'''<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RETROHUB v9.3.1 — Retro emulátor platform AI támogatással</title>
<style>
{css}

/* ===== RETROHUB v9 kiegészítések ===== */
{add_css}
</style>
</head>
<body>
{body}
<script>
{shell1}
</script>
<script>
{spec2}
</script>
<script>
{zx81_3}
</script>
<script>
{regs4}
</script>
<script>
{regs5}
</script>
<script>
{roms_js}
{k64}
</script>
<script>
{z80gen_js}
{z80cb_js}
</script>
<script>
{cpu6502_js}
{c64fam_js}
{kbd_tvc_js}
{kbd_primo_js}
{kbd_ent_js}
{machine_tvc_js}
{machine_primo_js}
{machine_ent_js}
{ht_kbd}
</script>
<script>
{sae_js}
</script>
<script>
{cores}
</script>
<script>
{ai}
</script>
<script>
{engine}
</script>
<script>
{boot9}
</script>
<script>
{snap9}
</script>
<script>
{amigasnap}
</script>
</body>
</html>
'''
# ---------------------------------------------------------------- v9.3: verzióbélyeg-normalizálás
def stamp_fix(html, pat, repl, tag, expect=1):
    hits = re.findall(pat, html)
    if len(hits) < expect:
        print(f'!!! STAMP HIBA ({tag}): {len(hits)} egyezés (legalább {expect} várt)'); sys.exit(1)
    print(f'STAMP OK: {tag} ({len(hits)} hely)')
    return re.sub(pat, repl, html)

html = stamp_fix(html, r'<title>RETROHUB v9\.[0-9.]+ — ', '<title>RETROHUB v9.3.1 — ', 'cím')
html = stamp_fix(html, r'color:var\(--dim\)">v9\.[0-9.]+</span>', 'color:var(--dim)">v9.3.1</span>', 'logó')
html = stamp_fix(html, r'RETROHUB  v9\.[0-9.]+\\n', 'RETROHUB  v9.3.1\\n', 'boot-képernyő')
html = stamp_fix(html, r"\[RH9\] RETROHUB v9\.[0-9.]+ aktív", "[RH9] RETROHUB v9.3.1 aktív", 'konzol-jelző')

# ---------------------------------------------------------------- v9.2: célzott javítások a generált HTML-en
def vpatch(html, old, new, tag):
    n = html.count(old)
    if n != 1:
        print(f'!!! PATCH HIBA ({tag}): {n} egyezés (1 várt)'); sys.exit(1)
    print(f'PATCH OK: {tag}')
    return html.replace(old, new)

# 1) Fájlmentés fallback — ha nincs claude.use('downloads') (GitHub Pages, közvetlen
#    megnyitás, sima böngésző), sima Blob + <a download> mentést használunk.
html = vpatch(html,
    "const dl = await zxCap('downloads'); if (!dl) { log('Mentés: a fájlmentés ebben a nézetben nem érhető el'); return; }",
    """const dl = await zxCap('downloads');
    if (!dl) {
      const __blob = (data instanceof Blob) ? data : new Blob([u8], { type: 'application/octet-stream' });
      const __url = URL.createObjectURL(__blob);
      const __a = document.createElement('a');
      __a.href = __url; __a.download = name;
      document.body.appendChild(__a); __a.click(); __a.remove();
      setTimeout(() => URL.revokeObjectURL(__url), 4000);
      log('Mentve: ' + name + ' (böngészős letöltés)');
      return;
    }""",
    'save-fallback')

# 2) Az AI-programozó „Claude (beépített)” szolgáltatója csak claude.use-os környezetben él;
#    máshol (GitHub Pages, sima böngésző) eltávolítjuk a listából és letiltjuk a menüpontot.
html = vpatch(html,
    "if (!aiProv.some(p => p.type === 'shell')) { aiProv.unshift({ name: 'Claude (beépített, saját fiókod)', type: 'shell', url: '', key: '', model: 'claude', models: [] }); aiSel = 0; }",
    '''if (window.claude && claude.use) { if (!aiProv.some(p => p.type === 'shell')) { aiProv.unshift({ name: 'Claude (beépített, saját fiókod)', type: 'shell', url: '', key: '', model: 'claude', models: [] }); aiSel = 0; } } else { aiProv = aiProv.filter(function (p) { return p.type !== 'shell'; }); if (aiSel >= aiProv.length) aiSel = 0; const __shopt = document.querySelector('#ai-type option[value="shell"]'); if (__shopt) { __shopt.disabled = true; __shopt.textContent = 'Claude (beépített) — csak AI-elemző felületen'; } }''',
    'ai-shell-guard')

# 3) Pontatlan súgószöveg: a külső API-k böngészőből MŰKÖDNEK (az RHMS AI / Pollinations bizonyítja)
html = vpatch(html,
    'A külső API-k (OpenAI, helyi modellek…) ebből a publikált oldalból a böngésző tűzfala miatt nem érhetők el.',
    'A külső API-k (OpenAI, OpenRouter, Groq, Ollama, Pollinations…) böngészőből is működnek — a 🤖 fejléc-gombbal (globális RHMS AI) konfigurálhatók; a Pollinations kulcs nélkül is elérhető.',
    'help-text')

# 4) A forrás-szegmens <body>-t is tartalmaz, a sablon mellé rakja — duplikáció megszűnt
html = vpatch(html, '<body>\n<body>', '<body>', 'body-dup')

# 5) v9.2.1: ZX81 súgószöveg a valóságnak megfelelően — a ROM BE van ágyazva
html = vpatch(html,
    'A ROM-ot nem &aacute;gyazom be, a saj&aacute;t, jogtiszta p&eacute;ld&aacute;nyodat t&ouml;ltsd be.',
    'A ROM be van &aacute;gyazva, &iacute;gy offline is fut; ha saj&aacute;t, jogtiszta p&eacute;ld&aacute;nyod van, azt is bet&ouml;ltheted.',
    'zx81-rom-help')

# 6) v9.2.1: Pages-en (nincs claude.use) legyen alapértelmezett AI-szolgáltató — Pollinations
html = vpatch(html,
    "if (aiSel >= aiProv.length) aiSel = 0; const __shopt = document.querySelector('#ai-type option[value=\"shell\"]');",
    "if (aiSel >= aiProv.length) aiSel = 0; if (!aiProv.length) { aiProv.push({ name: 'Pollinations (ingyenes, kulcs nélküli)', type: 'openai', url: 'https://text.pollinations.ai/openai', key: '', model: 'openai', models: ['openai', 'mistral', 'llama'] }); aiSel = 0; } const __shopt = document.querySelector('#ai-type option[value=\"shell\"]');",
    'pollinations-default')

# 7) v9.3.1: ZX Spectrum fájlcsatorna — .snapshot kiterjesztés (Amiga-emulátorok,
#    szabvány 48K SNA tartalommal) + DI-mentésnél megszakítás-engedélyezés
html = vpatch(html,
    '<input accept=".sna,.z80,.tap,.tzx,.scr,.rom,.trd" id="file-input" type="file"/>',
    '<input accept=".sna,.snapshot,.z80,.tap,.tzx,.scr,.rom,.trd" id="file-input" type="file"/>',
    'accept-snapshot')
html = vpatch(html,
    "if (ext === 'sna' || ext === 'z80') { engine.script.length = 0; if (ext === 'sna') { if (buf.length < 131103 && engine.m128) engine.setModel('48'); engine.loadSNA(buf); } else engine.loadZ80(buf); audio.aySync = true; $('hw-model').value = engine.model; $('hw-ay').checked = engine.ayOn || engine.m128; renderFrame(); start(); }",
    "if (ext === 'sna' || ext === 'snapshot' || ext === 'z80') { engine.script.length = 0; if (ext === 'sna' || ext === 'snapshot') { if (buf.length < 131103 && engine.m128) engine.setModel('48'); engine.loadSNA(buf); if (ext === 'snapshot' && !engine.cpu.iff2) { engine.cpu.iff2 = 1; engine.cpu.iff1 = 1; log('Amiga .snapshot: a mentés DI állapotban volt — a megszakítások engedélyezve.'); } } else engine.loadZ80(buf); audio.aySync = true; $('hw-model').value = engine.model; $('hw-ay').checked = engine.ayOn || engine.m128; renderFrame(); start(); }",
    'dispatch-snapshot')

open(OUT, 'w', encoding='utf-8').write(html)
print('KÉSZ:', OUT, f'{len(html.encode("utf-8")):,} bytes')
