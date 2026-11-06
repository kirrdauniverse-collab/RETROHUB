// C64 / C16+4 engine - közös osztály, csak memóriatérkép különbözik



const PROFILES = {
  c64: {
    name: 'Commodore 64',
    ramSize: 0x10000,
    romBasic: 0xA000,
    romKernal: 0xE000,
    romChar: 0xD000,
    videoBase: 0x0400,
    videoSize: 0x400,
    cols: 40,
    rows: 25,
    colorBase: 0xD800,
    defaultFg: 14,  // light blue
    defaultBg: 6,    // blue
    charRomOffset: 0,
  },
  c16: {
    name: 'Commodore 16/+4',
    ramSize: 0x10000,
    romBasic: 0x8000,
    romKernal: 0x8000, // a C16 u24-u26 ROM-ok foglalják el
    romChar: 0x8000,
    videoBase: 0x0C00,
    videoSize: 0x400,
    cols: 40,
    rows: 25,
    colorBase: 0x0800,
    defaultFg: 2,    // white
    defaultBg: 0,    // black
    charRomOffset: 0,
  },
};

// C64 színtábla (16 szín)
const C64_COLORS = [
  [0,0,0],       // 0 black
  [255,255,255], // 1 white
  [136,0,0],     // 2 red
  [170,255,238], // 3 cyan
  [204,68,204],  // 4 purple
  [0,204,85],    // 5 green
  [0,0,170],     // 6 blue
  [238,238,119], // 7 yellow
  [170,68,0],    // 8 orange
  [102,0,0],     // 9 brown
  [204,119,119], // 10 light red
  [51,51,51],    // 11 dark grey
  [119,119,119], // 12 mid grey
  [170,255,102], // 13 light green
  [0,136,255],   // 14 light blue
  [187,187,187], // 15 light grey
];

class C64Family {
  mem;
  cpu;
  romBasic = null;
  romKernal = null;
  romChar = null;
  romLoaded = false;
  frames = 0;
  profile;
  border = 14;
  // C64 IO port: 0 = RAM, 1 = BASIC, 2 = KERNAL, 3 = CHAROM, 4 = I/O
  ioPort = 0xFF; // alap: minden ROM bekapcsolva
  ddr = 0x07;    // 0-2 bit output

  constructor(profileKey) {
    this.profile = PROFILES[profileKey];
    if (!this.profile) throw new Error('Ismeretlen profil: ' + profileKey);
    this.mem = new Uint8Array(0x10000);
    this.cpu = new Cpu6502({
      read: (a) => this.readMem(a & 0xFFFF),
      write: (a, v) => this.writeMem(a & 0xFFFF, v & 0xFF),
    });
  }

  readMem(a) {
    // C64: $0000-$0001 = CPU IO port
    if (a === 0) return this.ioPort;
    if (a === 1) {
      // bit 0: LORAM (BASIC), 1: HIRAM (KERNAL), 2: CHAREN (I/O or CHAROM)
      const v = this.ioPort & this.ddr;
      const dat = this.ioPort & ~this.ddr; // az olvasott bites input
      return v | dat | 0x1F; // felső bitek mindig olvashatóak
    }
    if (a < 0x8000) return this.mem[a]; // RAM
    if (a >= 0xE000) {
      if (this.romKernal && (this.ioPort & 0x02)) return this.romKernal[a - 0xE000];
      return this.mem[a];
    }
    if (a >= 0xD000 && a < 0xE000) {
      if (this.romChar && (this.ioPort & 0x04) && !(this.ioPort & 0x02)) return this.romChar[a - 0xD000];
      // VIC-II / SID / CIA I/O - visszaadunk valami értéket
      return this.mem[a];
    }
    if (a >= 0xA000 && a < 0xC000) {
      if (this.romBasic && (this.ioPort & 0x01) && (this.ioPort & 0x02)) return this.romBasic[a - 0xA000];
      return this.mem[a];
    }
    return this.mem[a];
  }

  writeMem(a, v) {
    if (a === 0) { this.ddr = v & 0x07; return; }
    if (a === 1) { this.ioPort = (this.ioPort & ~this.ddr) | (v & this.ddr); return; }
    this.mem[a & 0xFFFF] = v & 0xFF;
  }

  // Több ROM fájl (C64: BASIC + KERNAL + CHAR)
  loadRoms(roms) {
    if (roms.basic) this.romBasic = roms.basic;
    if (roms.kernal) this.romKernal = roms.kernal;
    if (roms.char) this.romChar = roms.char;
    this.romLoaded = true;
    this.ioPort = 0xFF & ~0x04; // BASIC + KERNAL be, CHARROM be (I/O kikapcsolva)
    this.ddr = 0x07;
    this.reset();
  }

  // Alternatív: egyetlen fájl betöltése (C16/+4 esetén, ahol a ROM-ok egyben vannak)
  // Várjuk, hogy a user C16-nál 4 ROM fájlt adjon (u23, u24, u25, u26)
  // Esetleg egybeolvasztva, abban a sorrendben.
  loadRom(bytes) {
    // Egyetlen ROM - feltételezzük, hogy C16 esetén ez a 32KB-os "BASIC" ROM, 0x8000-től
    this.romBasic = bytes.slice(0, 0x8000);
    if (bytes.length > 0x8000) {
      // Esetleg KERNAL is benne van
      this.romKernal = bytes.slice(0x8000, 0x10000);
    }
    this.romChar = null; // nincs külön CHAR ROM a C16-nál
    this.romLoaded = true;
    this.reset();
  }

  reset() {
    this.cpu.reset();
    this.ioPort = 0xFF & ~0x04;
    this.ddr = 0x07;
  }

  // A C64 billentyűzet 8x8 mátrixa (rögzített)
  kb = new Uint8Array(8).fill(0xFF);
  setKey(r, b, down) {
    if (r >= 0 && r < 8 && b >= 0 && b < 8) {
      if (down) this.kb[r] &= ~(1 << b);
      else this.kb[r] |= (1 << b);
    }
  }

  // CIA1: $DC00-$DCFF - billentyűzet
  // Egyszerűsített: a sor/oszlop címzés
  portIn(p) {
    // C64: CIA1 $DC00-$DC01 a billentyűzet
    // Ha a sor kiválasztva ($DC00), akkor az oszlop $DC01
    if (p === 0xDC01) {
      const sel = ~this.mem[0xDC00] & 0xFF;
      let v = 0xFF;
      for (let r = 0; r < 8; r++) if (sel & (1 << r)) v &= this.kb[r];
      return v;
    }
    return 0xFF;
  }

  portOut(p, v) {
    // A $DC00 a billentyűzet sor-kiválasztó
    if (p === 0xDC00) this.mem[0xDC00] = v;
    // $D020 - border color
    if (p === 0xD020) this.border = v & 0x0F;
  }

  runFrame() {
    const cpu = this.cpu;
    const end = cpu.cycles + 19656; // ~50 Hz C64-en
    let steps = 0;
    while (cpu.cycles < end && steps < 500000) {
      if (cpu.halted) { cpu.cycles += 1; break; }
      cpu.step();
      steps++;
      // C64 raster IRQ: $D012 = 0 → IRQ
      // Egyszerűsítjük: minden 312 lépésben IRQ
      if (steps % 312 === 0) cpu.irq();
    }
    this.frames++;
  }

  render(rgba) {
    const p = this.profile;
    const W = 320, H = 200;
    const bg = C64_COLORS[this.border & 0x0F] || C64_COLORS[0];
    // Border
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        rgba[o] = bg[0]; rgba[o + 1] = bg[1]; rgba[o + 2] = bg[2]; rgba[o + 3] = 255;
      }
    }
    // Képernyő tartalom (40x25 karakter)
    const cw = 8, ch = 8;
    const ox = 0, oy = 0;
    for (let row = 0; row < p.rows; row++) {
      for (let col = 0; col < p.cols; col++) {
        const addr = (p.videoBase + row * p.cols + col) & 0xFFFF;
        const charCode = this.mem[addr];
        const colorAddr = (p.colorBase + row * p.cols + col) & 0xFFFF;
        const color = this.mem[colorAddr] & 0x0F;
        const fg = C64_COLORS[color] || C64_COLORS[1];
        // A karakter bitmap
        let bitmap = [0,0,0,0,0,0,0,0];
        if (this.romChar) {
          // PETASCII: betűk 0x20-0x7F → charROM[0x00-0x5F], 0x80-0xFF → charROM[0x100-0x1FF]
          const off = (charCode & 0x7F) * 8 + (charCode & 0x80 ? 0x400 : 0);
          for (let i = 0; i < 8; i++) bitmap[i] = this.romChar[off + i] || 0;
        } else {
          // Nincs CHAR ROM, használjunk beépített ASCII-t (dePETASCII konverzió)
          // PETASCII 0x20-0x5A = ' '..'Z' sorban, 0x41-0x5A = 'A'-'Z' (caps)
          // Egyszerűsítve: használjuk az ASCII-t
          const a = charCode & 0x7F;
          // Töltsük be ASCII-t egy egyszerű fontból (nem implementáljuk teljesen)
          bitmap = [0,0,0,0,0,0,0,0];
        }
        // Rajzoljuk ki a karaktert
        for (let y = 0; y < 8; y++) {
          const bits = bitmap[y];
          for (let x = 0; x < 8; x++) {
            if (!((bits >> (7 - x)) & 1)) continue;
            const px = ox + col * cw + x;
            const py = oy + row * ch + y;
            if (px < W && py < H) {
              const o = (py * W + px) * 4;
              rgba[o] = fg[0]; rgba[o + 1] = fg[1]; rgba[o + 2] = fg[2]; rgba[o + 3] = 255;
            }
          }
        }
      }
    }
  }
}



const C64_PROFILES = PROFILES;