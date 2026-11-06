/* ================================================================
   RETROHUB v9 — HT1080Z (TRS-80 Model I) billentyűzet-mátrix
   8 sor × 8 oszlop, aktív low; sor = port $FF-be írt érték,
   oszlopok = port $FF-ből olvasott bitek (0 = nyomott).
   52 tényleges gomb: 6 sor × 8 + ENTER/BREAK/2×SHIFT
   ================================================================ */
(function () {
  'use strict';
  function K(l, r, c, sub, wide) { const o = { l: l, r: r, c: c }; if (sub) o.s = sub; if (wide) o.w = 1; return o; }

  const rows = [
    // r0
    [K('@', 0, 0), K('A', 0, 1), K('B', 0, 2), K('C', 0, 3), K('D', 0, 4), K('E', 0, 5), K('F', 0, 6), K('G', 0, 7)],
    // r1
    [K('H', 1, 0), K('I', 1, 1), K('J', 1, 2), K('K', 1, 3), K('L', 1, 4), K('M', 1, 5), K('N', 1, 6), K('O', 1, 7)],
    // r2
    [K('P', 2, 0), K('Q', 2, 1), K('R', 2, 2), K('S', 2, 3), K('T', 2, 4), K('U', 2, 5), K('V', 2, 6), K('W', 2, 7)],
    // r3
    [K('X', 3, 0), K('Y', 3, 1), K('Z', 3, 2), K('↑', 3, 3, '+'), K('↓', 3, 4, '-'), K('←', 3, 5, '='), K('→', 3, 6, '*'), K('SPACE', 3, 7, '', 1)],
    // r4
    [K('0', 4, 0), K('1', 4, 1), K('2', 4, 2, '"'), K('3', 4, 3), K('4', 4, 4), K('5', 4, 5), K('6', 4, 6), K('7', 4, 7)],
    // r5
    [K('8', 5, 0, '('), K('9', 5, 1, ')'), K(':', 5, 2, '<'), K(';', 5, 3, '>'), K(',', 5, 4), K('.', 5, 5), K('/', 5, 6), K('CLEAR', 5, 7, '', 1)],
    // r6 — módosítók (kalibrált: ENTER bit0, BREAK bit1, SHIFT bal bit6, jobb bit7)
    [K('ENTER', 6, 0, '', 1), K('BREAK', 6, 1, '', 1), K('SHIFT', 6, 6, '', 1), K('SHIFT', 6, 7, '', 1)]
  ];

  // karakter → mátrix (a typeText használja)
  const map = {
    '\n': { r: 6, c: 0 },
    ' ': { r: 3, c: 7 },
    '@': { r: 0, c: 0 },
    '/': { r: 5, c: 6 },
    ':': { r: 5, c: 2 }, ';': { r: 5, c: 3 }, ',': { r: 5, c: 4 }, '.': { r: 5, c: 5 }
  };
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((ch, i) => {
    // A→r0c1 … G→r0c7, H→r1c0 … O→r1c7, P→r2c0 … W→r2c7, X Y Z→r3c0-2
    let r, c;
    if (i < 7) { r = 0; c = i + 1; }
    else if (i < 15) { r = 1; c = i - 7; }
    else if (i < 23) { r = 2; c = i - 15; }
    else { r = 3; c = i - 23; }
    map[ch] = { r: r, c: c };
  });
  '0123456789'.split('').forEach((ch, i) => {
    map[ch] = i < 8 ? { r: 4, c: i } : { r: 5, c: i - 8 };
  });
  // shiftelt karakterek
  const shmap = {
    '"': { r: 4, c: 2 }, '(': { r: 5, c: 0 }, ')': { r: 5, c: 1 },
    '<': { r: 5, c: 2 }, '>': { r: 5, c: 3 },
    '+': { r: 3, c: 3 }, '-': { r: 3, c: 4 }, '=': { r: 3, c: 5 }, '*': { r: 3, c: 6 }
  };

  // fizikai billentyűzet (KeyboardEvent.code → mátrix)
  const phys = {
    Enter: { r: 6, c: 0 }, Space: { r: 3, c: 7 }, Backspace: { r: 5, c: 7 },
    ArrowUp: { r: 3, c: 3 }, ArrowDown: { r: 3, c: 4 }, ArrowLeft: { r: 3, c: 5 }, ArrowRight: { r: 3, c: 6 },
    ShiftLeft: { r: 6, c: 6 }, ShiftRight: { r: 6, c: 7 }
  };
  '@ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:;,./'.split('').forEach(ch => { phys['Key' + ch] = map[ch]; phys['Digit' + ch] = map[ch]; });
  phys.Minus = { r: 3, c: 4, sh: 1 }; phys.Equal = { r: 3, c: 5, sh: 1 };
  phys.Quote = { r: 4, c: 2, sh: 1 }; phys.Comma = { r: 5, c: 4 }; phys.Period = { r: 5, c: 5 };
  phys.Slash = { r: 5, c: 6 }; phys.Semicolon = { r: 5, c: 3 };

  window.RH_HTKB = { rows: rows, map: map, shmap: shmap, phys: phys };
})();
