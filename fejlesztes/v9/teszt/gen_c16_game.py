#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
C16/+4 'LABDA' játék PRG-generátor.
CBM BASIC 2.0-kompatibilis tokenek (BASIC 3.5-ben azonos bájtértékek),
standard CBM PRG formátum: [01 00] + sorok [link(2) + sorszám(2, bináris LE)
+ tokenizált tartalom + 00] + EOF 00 00; utolsó sor linkje az EOF-markerre
mutat (ROM $A7C6 konvenció). Az isB-detektáláshoz az ELSŐ link páros.
"""
import sys

TOK = {
    'END': 0x80, 'FOR': 0x81, 'NEXT': 0x82, 'DATA': 0x83, 'INPUT#': 0x84,
    'INPUT': 0x85, 'DIM': 0x86, 'READ': 0x87, 'LET': 0x88, 'GOTO': 0x89,
    'RUN': 0x8A, 'IF': 0x8B, 'RESTORE': 0x8C, 'GOSUB': 0x8D, 'RETURN': 0x8E,
    'REM': 0x8F, 'STOP': 0x90, 'ON': 0x91, 'WAIT': 0x92, 'LOAD': 0x93,
    'SAVE': 0x94, 'VERIFY': 0x95, 'DEF': 0x96, 'POKE': 0x97, 'PRINT#': 0x98,
    'PRINT': 0x99, 'CONT': 0x9A, 'LIST': 0x9B, 'CLR': 0x9C, 'CMD': 0x9D,
    'SYS': 0x9E, 'OPEN': 0x9F, 'CLOSE': 0xA0, 'GET': 0xA1, 'NEW': 0xA2,
    'TAB(': 0xA3, 'TO': 0xA4, 'FN': 0xA5, 'SPC(': 0xA6, 'THEN': 0xA7,
    'NOT': 0xA8, 'STEP': 0xA9, 'AND': 0xAF, 'OR': 0xB0,
    '>': 0xB1, '=': 0xB2, '<': 0xB3,
    'SGN': 0xB4, 'INT': 0xB5, 'ABS': 0xB6, 'USR': 0xB7, 'FRE': 0xB8,
    'POS': 0xB9, 'SQR': 0xBA, 'RND': 0xBB, 'LOG': 0xBC, 'EXP': 0xBD,
    'COS': 0xBE, 'SIN': 0xBF, 'TAN': 0xC0, 'ATN': 0xC1, 'PEEK': 0xC2,
    'LEN': 0xC3, 'STR$': 0xC4, 'VAL': 0xC5, 'ASC': 0xC6, 'CHR$': 0xC7,
    'LEFT$': 0xC8, 'RIGHT$': 0xC9, 'MID$': 0xCA,
    '+': 0xAA, '-': 0xAB, '*': 0xAC, '/': 0xAD, '^': 0xAE,
}
# leghosszabb előre (GOSUB előbb mint GO, PRINT# előbb mint PRINT)
KEYS = sorted(TOK.keys(), key=len, reverse=True)


def tokenize_line(text):
    out = bytearray()
    i = 0
    inq = False
    while i < len(text):
        ch = text[i]
        if ch == '"':
            inq = not inq
            out.append(ord(ch))
            i += 1
            continue
        if not inq:
            for k in KEYS:
                if text.startswith(k, i):
                    out.append(TOK[k])
                    i += len(k)
                    break
            else:
                out.append(ord(ch))
                i += 1
        else:
            out.append(ord(ch))
            i += 1
    return bytes(out)


def build_prg(lines):
    body = bytearray()
    offsets = []          # minden sor kezdete (body-n belül)
    for lineno, src in lines:
        offsets.append(len(body))
        body += b'\x00\x00'                    # link-helyfoglaló
        body += bytes([lineno & 0xFF, (lineno >> 8) & 0xFF])
        body += tokenize_line(src)
        body += b'\x00'                        # soremelés
    eof = len(body)                            # EOF-marker pozíciója
    body += b'\x00\x00'
    base = 0x1001                              # CBM link = ABSZOLÚT cím ($1001-relatív fájlban)
    for idx, off in enumerate(offsets):
        nxt = offsets[idx + 1] if idx + 1 < len(offsets) else eof
        abs_addr = base + nxt
        body[off] = abs_addr & 0xFF
        body[off + 1] = (abs_addr >> 8) & 0xFF
    return bytes([0x01, 0x10]) + bytes(body)   # load cím $1001 (little-endian: 01 10)


LINES = [
    (10,  'REM C16 PLUS4 LABDA DEMO'),
    (20,  'PRINT CHR$(147);TAB(10);"C16+4 LABDA JATEK"'),
    (30,  'PRINT TAB(4);"DEMO: A GEP JATCIK IS"'),
    (40,  'FOR T=1 TO 900:NEXT T'),
    (50,  'PRINT CHR$(147)'),
    (60,  'SC=0:PX=18:BX=19:BY=3:VX=1:VY=1'),
    (70,  'POKE 3072+40*22+PX,15'),
    (80,  'POKE 3072+37,48+SC'),
    (90,  'POKE 3072+40*BY+BX,42:POKE 2048+40*BY+BX,1+(SC AND 2)*3'),
    (100, 'FOR T=1 TO 150:NEXT T'),
    (110, 'POKE 3072+40*22+PX,32'),
    (120, 'POKE 3072+40*BY+BX,32:POKE 2048+40*BY+BX,0'),
    (130, 'BX=BX+VX:BY=BY+VY'),
    (140, 'IF BX=1 OR BX=38 THEN VX=-VX'),
    (150, 'IF BY=2 THEN VY=1'),
    (160, 'IF BY=22 AND ABS(BX-PX)<3 THEN SC=SC+1:VY=-1'),
    (170, 'IF BY=23 THEN PRINT CHR$(147);TAB(12);"VEGE! PONT:";SC:END'),
    (180, 'GET A$'),
    (190, 'IF A$="," THEN IF PX>0 THEN PX=PX-1'),
    (200, 'IF A$="." THEN IF PX<38 THEN PX=PX+1'),
    (210, 'IF PX<BX THEN PX=PX+1'),
    (220, 'IF PX>BX THEN PX=PX-1'),
    (230, 'GOTO 70'),
]

if __name__ == '__main__':
    prg = build_prg(LINES)
    data = prg[2:]                               # load cím nélküli tartalom
    ok_even = (data[0] & 1) == 0
    ok_eof = data[-2] == 0 and data[-1] == 0
    ok_len = 2 <= data[0] <= len(data)
    print('PRG méret:', len(prg), 'bájt | első link:', data[0],
          'páros:', ok_even, '| EOF 00 00:', ok_eof)
    assert ok_even and ok_eof and ok_len, 'isB-feltétel sérül!'
    print('első 24 bájt:', ' '.join(f'{b:02X}' for b in prg[:24]))
    print('utolsó 12 bájt:', ' '.join(f'{b:02X}' for b in prg[-12:]))
    for p in ('/home/z/my-project/scripts/c16_labda.prg',):
        open(p, 'wb').write(prg)
        print('kész:', p)
