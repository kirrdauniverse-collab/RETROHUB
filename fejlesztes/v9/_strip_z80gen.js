// Z80 CPU emulator - ported from original Retruhub.html
// Szigorúan megtartva az eredeti logikát (a Spectrum működött!).

const S = 0x80, ZF = 0x40, YF = 0x20, HF = 0x10, XF = 0x08, PF = 0x04, NF = 0x02, CF = 0x01;
const SZ = new Uint8Array(256), SZP = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let p = 0, v = i;
  for (let b = 0; b < 8; b++) { p ^= v & 1; v >>= 1; }
  SZ[i] = (i & S) | (i ? 0 : ZF) | (i & (YF | XF));
  SZP[i] = SZ[i] | (p ? 0 : PF);
}
const IM_TABLE = [0, 0, 1, 2, 0, 0, 1, 2];

class Z80 {
  constructor(bus) { this.bus = bus; this.reset(); }

  reset() {
    this.rReadMask = 0xFF;   // LD A,R maszk (a gépek különböző viselkedést mutathatnak)
    this.a = 0xFF; this.f = 0xFF;
    this.b = this.c = this.d = this.e = this.h = this.l = 0;
    this.a2 = this.f2 = 0;
    this.b2 = this.c2 = this.d2 = this.e2 = this.h2 = this.l2 = 0;
    this.ix = 0; this.iy = 0;
    this.sp = 0xFFFF; this.pc = 0;
    this.i = 0; this.r = 0;
    this.iff1 = 0; this.iff2 = 0; this.im = 0;
    this.halted = false; this.eiPending = false;
    this.t = 0;
  }

  get af() { return (this.a << 8) | this.f; }
  set af(v) { this.a = (v >> 8) & 0xFF; this.f = v & 0xFF; }
  get bc() { return (this.b << 8) | this.c; }
  set bc(v) { this.b = (v >> 8) & 0xFF; this.c = v & 0xFF; }
  get de() { return (this.d << 8) | this.e; }
  set de(v) { this.d = (v >> 8) & 0xFF; this.e = v & 0xFF; }
  get hl() { return (this.h << 8) | this.l; }
  set hl(v) { this.h = (v >> 8) & 0xFF; this.l = v & 0xFF; }

  // ---------- busz ----------
  rd(a) { return this.bus.read(a & 0xFFFF) & 0xFF; }
  wr(a, v) { this.bus.write(a & 0xFFFF, v & 0xFF); }
  rd16(a) { return this.rd(a) | (this.rd((a + 1) & 0xFFFF) << 8); }
  wr16(a, v) { this.wr(a, v & 0xFF); this.wr((a + 1) & 0xFFFF, v >> 8); }
  fetch() {
    const v = this.rd(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    this.r = (this.r & 0x80) | ((this.r + 1) & 0x7F);
    return v;
  }
  fetch16() { const v = this.rd16(this.pc); this.pc = (this.pc + 2) & 0xFFFF; return v; }
  disp() { const d = this.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return d < 128 ? d : d - 256; }
  push(v) { this.sp = (this.sp - 2) & 0xFFFF; this.wr16(this.sp, v); }
  pop() { const v = this.rd16(this.sp); this.sp = (this.sp + 2) & 0xFFFF; return v; }

  // memória-cím: (HL) vagy (IX+d)/(IY+d)
  ea(xy) {
    if (!xy) return this.hl;
    return (this[xy] + this.disp()) & 0xFFFF;
  }

  // ---------- regiszter-hozzáférés (xy = null | 'ix' | 'iy') ----------
  getR(i, xy) {
    switch (i) {
      case 0: return this.b;
      case 1: return this.c;
      case 2: return this.d;
      case 3: return this.e;
      case 4: return xy ? this[xy] >> 8 : this.h;
      case 5: return xy ? this[xy] & 0xFF : this.l;
      default: return this.a;
    }
  }
  setR(i, v, xy) {
    v &= 0xFF;
    switch (i) {
      case 0: this.b = v; break;
      case 1: this.c = v; break;
      case 2: this.d = v; break;
      case 3: this.e = v; break;
      case 4: if (xy) this[xy] = (v << 8) | (this[xy] & 0xFF); else this.h = v; break;
      case 5: if (xy) this[xy] = (this[xy] & 0xFF00) | v; else this.l = v; break;
      default: this.a = v;
    }
  }
  getRP(p, xy) {
    switch (p) {
      case 0: return this.bc;
      case 1: return this.de;
      case 2: return xy ? this[xy] : this.hl;
      default: return this.sp;
    }
  }
  setRP(p, v, xy) {
    v &= 0xFFFF;
    switch (p) {
      case 0: this.bc = v; break;
      case 1: this.de = v; break;
      case 2: if (xy) this[xy] = v; else this.hl = v; break;
      default: this.sp = v;
    }
  }

  cond(y) {
    const f = this.f;
    switch (y) {
      case 0: return !(f & ZF);
      case 1: return !!(f & ZF);
      case 2: return !(f & CF);
      case 3: return !!(f & CF);
      case 4: return !(f & PF);
      case 5: return !!(f & PF);
      case 6: return !(f & S);
      default: return !!(f & S);
    }
  }

  // ---------- ALU ----------
  addA(v, c) {
    const a = this.a, r = a + v + c;
    this.f = SZ[r & 0xFF] | ((a ^ v ^ r) & HF) | (((a ^ v ^ 0x80) & (v ^ r) & 0x80) >> 5) | (r > 0xFF ? CF : 0);
    this.a = r & 0xFF;
  }
  subA(v, c) {
    const a = this.a, r = a - v - c;
    this.f = SZ[r & 0xFF] | NF | ((a ^ v ^ r) & HF) | (((a ^ v) & (a ^ r) & 0x80) >> 5) | (r < 0 ? CF : 0);
    this.a = r & 0xFF;
  }
  cpA(v) {
    const a = this.a, r = a - v;
    this.f = (SZ[r & 0xFF] & ~(YF | XF)) | (v & (YF | XF)) | NF | ((a ^ v ^ r) & HF)
           | (((a ^ v) & (a ^ r) & 0x80) >> 5) | (r < 0 ? CF : 0);
  }
  logic(op, v) {
    if (op === 0) { this.a &= v; this.f = SZP[this.a] | HF; }
    else if (op === 1) { this.a ^= v; this.f = SZP[this.a]; }
    else { this.a |= v; this.f = SZP[this.a]; }
  }
  alu(y, v) {
    switch (y) {
      case 0: this.addA(v, 0); break;
      case 1: this.addA(v, (this.f & CF) ? 1 : 0); break;
      case 2: this.subA(v, 0); break;
      case 3: this.subA(v, (this.f & CF) ? 1 : 0); break;
      case 4: this.logic(0, v); break;
      case 5: this.logic(1, v); break;
      case 6: this.logic(2, v); break;
      default: this.cpA(v);
    }
  }
  inc8(v) {
    const r = (v + 1) & 0xFF;
    this.f = (this.f & CF) | SZ[r] | (((v & 0x0F) === 0x0F) ? HF : 0) | (v === 0x7F ? PF : 0);
    return r;
  }
  dec8(v) {
    const r = (v - 1) & 0xFF;
    this.f = (this.f & CF) | SZ[r] | NF | (((v & 0x0F) === 0) ? HF : 0) | (v === 0x80 ? PF : 0);
    return r;
  }
  add16(a, b) {
    const r = a + b;
    this.f = (this.f & (S | ZF | PF)) | (((a ^ b ^ r) >> 8) & HF) | ((r >> 8) & (YF | XF)) | (r > 0xFFFF ? CF : 0);
    return r & 0xFFFF;
  }
  adc16(a, b) {
    const c = (this.f & CF) ? 1 : 0, r = a + b + c;
    this.f = ((r >> 8) & (S | YF | XF)) | ((r & 0xFFFF) ? 0 : ZF) | (((a ^ b ^ r) >> 8) & HF)
           | (((a ^ r) & (b ^ r) & 0x8000) >> 13) | (r > 0xFFFF ? CF : 0);
    return r & 0xFFFF;
  }
  sbc16(a, b) {
    const c = (this.f & CF) ? 1 : 0, r = a - b - c;
    this.f = ((r >> 8) & (S | YF | XF)) | ((r & 0xFFFF) ? 0 : ZF) | (((a ^ b ^ r) >> 8) & HF)
           | (((a ^ b) & (a ^ r) & 0x8000) >> 13) | NF | (r < 0 ? CF : 0);
    return r & 0xFFFF;
  }
  rot(y, v) {  // CB-s forgatások/léptetések
    const f = this.f; let r, c;
    switch (y) {
      case 0: c = v >> 7; r = ((v << 1) | c) & 0xFF; break;
      case 1: c = v & 1; r = (v >> 1) | (c << 7); break;
      case 2: c = v >> 7; r = ((v << 1) | (f & CF)) & 0xFF; break;
      case 3: c = v & 1; r = (v >> 1) | ((f & CF) << 7); break;
      case 4: c = v >> 7; r = (v << 1) & 0xFF; break;          // SLA
      case 5: c = v & 1; r = (v >> 1) | (v & 0x80); break;     // SRA
      case 6: c = v >> 7; r = ((v << 1) | 1) & 0xFF; break;    // SLL (undok.)
      default: c = v & 1; r = v >> 1;                          // SRL
    }
    this.f = SZP[r] | c;
    return r;
  }
  rotA(y) {  // RLCA RRCA RLA RRA
    const a = this.a, f = this.f; let c, r;
    switch (y) {
      case 0: c = a >> 7; r = ((a << 1) | c) & 0xFF; break;
      case 1: c = a & 1; r = (a >> 1) | (c << 7); break;
      case 2: c = a >> 7; r = ((a << 1) | (f & CF)) & 0xFF; break;
      default: c = a & 1; r = (a >> 1) | ((f & CF) << 7);
    }
    this.a = r;
    this.f = (f & (S | ZF | PF)) | (r & (YF | XF)) | c;
  }
  daa() {
    const a = this.a, n = this.f & NF, hIn = this.f & HF;
    let adj = 0, c = this.f & CF;
    if (hIn || (a & 0x0F) > 9) adj |= 0x06;
    if (c || a > 0x99) { adj |= 0x60; c = CF; } else c = 0;
    const r = (n ? (a - adj) : (a + adj)) & 0xFF;
    const h = n ? (hIn && (a & 0x0F) < 6) : ((a & 0x0F) > 9);
    this.a = r;
    this.f = SZP[r] | n | (h ? HF : 0) | c;
  }

  // ---------- fő dekóder ----------
  exec(op, xy) {
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
    switch (x) {
      case 0:
        switch (z) {
          case 0:
            if (y === 0) return 4;                                  // NOP
            if (y === 1) {                                          // EX AF,AF'
              let t = this.a; this.a = this.a2; this.a2 = t;
              t = this.f; this.f = this.f2; this.f2 = t;
              return 4;
            }
            if (y === 2) {                                          // DJNZ
              const d = this.disp();
              this.b = (this.b - 1) & 0xFF;
              if (this.b) { this.pc = (this.pc + d) & 0xFFFF; return 13; }
              return 8;
            }
            if (y === 3) { const d = this.disp(); this.pc = (this.pc + d) & 0xFFFF; return 12; }  // JR
            { const d = this.disp();                                // JR cc
              if (this.cond(y - 4)) { this.pc = (this.pc + d) & 0xFFFF; return 12; }
              return 7; }
          case 1:
            if (!(y & 1)) { this.setRP(y >> 1, this.fetch16(), xy); return 10; }   // LD rp,nn
            this.setRP(2, this.add16(this.getRP(2, xy), this.getRP(y >> 1, xy)), xy); // ADD HL,rp
            return 11;
          case 2:
            switch (y) {
              case 0: this.wr(this.bc, this.a); return 7;           // LD (BC),A
              case 1: this.a = this.rd(this.bc); return 7;          // LD A,(BC)
              case 2: this.wr(this.de, this.a); return 7;           // LD (DE),A
              case 3: this.a = this.rd(this.de); return 7;          // LD A,(DE)
              case 4: this.wr16(this.fetch16(), this.getRP(2, xy)); return 16; // LD (nn),HL
              case 5: this.setRP(2, this.rd16(this.fetch16()), xy); return 16; // LD HL,(nn)
              case 6: this.wr(this.fetch16(), this.a); return 13;   // LD (nn),A
              default: this.a = this.rd(this.fetch16()); return 13; // LD A,(nn)
            }
          case 3: {                                                 // INC/DEC rp
            const p = y >> 1, v = this.getRP(p, xy);
            this.setRP(p, (y & 1) ? v - 1 : v + 1, xy);
            return 6;
          }
          case 4:                                                   // INC r
            if (y === 6) { const ad = this.ea(xy); this.wr(ad, this.inc8(this.rd(ad))); return xy ? 23 : 11; }
            this.setR(y, this.inc8(this.getR(y, xy)), xy); return 4;
          case 5:                                                   // DEC r
            if (y === 6) { const ad = this.ea(xy); this.wr(ad, this.dec8(this.rd(ad))); return xy ? 23 : 11; }
            this.setR(y, this.dec8(this.getR(y, xy)), xy); return 4;
          case 6:                                                   // LD r,n
            if (y === 6) { const ad = this.ea(xy); this.wr(ad, this.fetch()); return xy ? 19 : 10; }
            this.setR(y, this.fetch(), xy); return 7;
          default:
            switch (y) {
              case 0: case 1: case 2: case 3: this.rotA(y); return 4;
              case 4: this.daa(); return 4;
              case 5: this.a ^= 0xFF; this.f = (this.f & (S | ZF | PF | CF)) | (this.a & (YF | XF)) | HF | NF; return 4; // CPL
              case 6: this.f = (this.f & (S | ZF | PF)) | (this.a & (YF | XF)) | CF; return 4;                       // SCF
              default: {                                                                                              // CCF
                const oc = this.f & CF;
                this.f = (this.f & (S | ZF | PF)) | (this.a & (YF | XF)) | (oc ? HF : CF);
                return 4;
              }
            }
        }
      case 1:
        if (op === 0x76) { this.halted = true; return 4; }          // HALT
        if (y === 6) { const ad = this.ea(xy); this.wr(ad, this.getR(z, null)); return xy ? 19 : 7; }
        if (z === 6) { const ad = this.ea(xy); this.setR(y, this.rd(ad), null); return xy ? 19 : 7; }
        this.setR(y, this.getR(z, xy), xy); return 4;
      case 2: {
        const v = (z === 6) ? this.rd(this.ea(xy)) : this.getR(z, xy);
        this.alu(y, v);
        return (z === 6) ? (xy ? 19 : 7) : 4;
      }
      default:
        switch (z) {
          case 0: if (this.cond(y)) { this.pc = this.pop(); return 11; } return 5;
          case 1:
            if (!(y & 1)) {                                         // POP
              const v = this.pop();
              if ((y >> 1) === 3) this.af = v; else this.setRP(y >> 1, v, xy);
              return 10;
            }
            switch (y >> 1) {
              case 0: this.pc = this.pop(); return 10;              // RET
              case 1:                                               // EXX
                { let t = this.bc; this.bc = (this.b2 << 8) | this.c2; this.b2 = t >> 8; this.c2 = t & 0xFF;
                  t = this.de; this.de = (this.d2 << 8) | this.e2; this.d2 = t >> 8; this.e2 = t & 0xFF;
                  t = this.hl; this.hl = (this.h2 << 8) | this.l2; this.h2 = t >> 8; this.l2 = t & 0xFF; }
                return 4;
              case 2: this.pc = this.getRP(2, xy); return xy ? 8 : 4;  // JP (HL)
              default: this.sp = this.getRP(2, xy); return xy ? 10 : 6; // LD SP,HL
            }
          case 2: { const nn = this.fetch16(); if (this.cond(y)) this.pc = nn; return 10; }  // JP cc,nn
          case 3:
            switch (y) {
              case 0: this.pc = this.fetch16(); return 10;          // JP nn
              case 1: return 4;                                     // CB (kezeli a step)
              case 2: { const n = this.fetch(); this.bus.out((this.a << 8) | n, this.a); return 11; } // OUT (n),A
              case 3: { const n = this.fetch(); this.a = this.bus.in((this.a << 8) | n) & 0xFF; return 11; } // IN A,(n)
              case 4: {                                             // EX (SP),HL
                const tmp = this.rd16(this.sp);
                this.wr16(this.sp, this.getRP(2, xy));
                this.setRP(2, tmp, xy);
                return xy ? 23 : 19;
              }
              case 5: { const t = this.de; this.de = this.hl; this.hl = t; return 4; } // EX DE,HL
              case 6: this.iff1 = 0; this.iff2 = 0; return 4;       // DI
              default: this.iff1 = 1; this.iff2 = 1; this.eiPending = true; return 4; // EI
            }
          case 4: { const nn = this.fetch16(); if (this.cond(y)) { this.push(this.pc); this.pc = nn; return 17; } return 10; }
          case 5:
            if (!(y & 1)) { // PUSH
              this.push((y >> 1) === 3 ? this.af : this.getRP(y >> 1, xy));
              return xy && (y >> 1) === 2 ? 15 : 11;
            }
            if (y === 1) { const nn = this.fetch16(); this.push(this.pc); this.pc = nn; return 17; } // CALL nn
            return 4;
          case 6: this.alu(y, this.fetch()); return 7;
          default: this.push(this.pc); this.pc = y * 8; return 11; // RST
        }
    }
  }

  // ---------- CB prefix (DDCB/FDCB is ugyanide, xy-val) ----------
  execCB(xy) {
    let ad = null, op;
    if (xy) { ad = (this[xy] + this.disp()) & 0xFFFF; op = this.fetch(); }
    else op = this.fetch();
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
    if (!xy && z === 6) ad = this.hl;
    const v = ad !== null ? this.rd(ad) : this.getR(z, null);

    if (x === 1) {  // BIT
      const yx = ad !== null ? ((ad >> 8) & (YF | XF)) : (v & (YF | XF));
      this.f = (this.f & CF) | HF | yx;
      if (!(v & (1 << y))) this.f |= ZF | PF;
      if (y === 7 && (v & 0x80)) this.f |= S;
      return ad !== null ? (xy ? 20 : 12) : 8;
    }
    const r = x === 0 ? this.rot(y, v) : (x === 2 ? (v & ~(1 << y)) : (v | (1 << y)));
    if (ad !== null) { this.wr(ad, r); if (xy && z !== 6) this.setR(z, r, null); }
    else this.setR(z, r, null);
    return ad !== null ? (xy ? 23 : 15) : 8;
  }

  // ---------- ED prefix ----------
  execED() {
    const op = this.fetch();
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
    if (x === 2 && y >= 4 && z <= 3) return this.block(y, z);
    if (x !== 1) return 8;
    switch (z) {
      case 0: {                                                     // IN r,(C)
        const v = this.bus.in(this.bc) & 0xFF;
        if (y !== 6) this.setR(y, v, null);
        this.f = (this.f & CF) | SZP[v];
        return 12;
      }
      case 1: this.bus.out(this.bc, y === 6 ? 0 : this.getR(y, null)); return 12; // OUT (C),r
      case 2: {                                                     // SBC/ADC HL,rp
        const p = y >> 1, v = this.getRP(p, null);
        this.hl = (y & 1) ? this.adc16(this.hl, v) : this.sbc16(this.hl, v);
        return 15;
      }
      case 3: {                                                     // LD (nn),rp / LD rp,(nn)
        const nn = this.fetch16();
        if (y & 1) this.setRP(y >> 1, this.rd16(nn), null);
        else this.wr16(nn, this.getRP(y >> 1, null));
        return 20;
      }
      case 4: { const v = this.a; this.a = 0; this.subA(v, 0); return 8; }   // NEG
      case 5: this.iff1 = this.iff2; this.pc = this.pop(); return 14;       // RETN/RETI
      case 6: this.im = IM_TABLE[y]; return 8;                              // IM
      default:
        switch (y) {
          case 0: this.i = this.a; return 9;                                 // LD I,A
          case 1: this.r = this.a; return 9;                                 // LD R,A
          case 2: this.a = this.i; this.f = (this.f & CF) | SZ[this.a] | (this.iff2 ? PF : 0); return 9;
          case 3: this.a = this.r & this.rReadMask; this.f = (this.f & CF) | SZ[this.a] | (this.iff2 ? PF : 0); return 9;
          case 4: {                                                          // RRD
            const m = this.rd(this.hl);
            this.wr(this.hl, ((this.a & 0x0F) << 4) | (m >> 4));
            this.a = (this.a & 0xF0) | (m & 0x0F);
            this.f = (this.f & CF) | SZP[this.a];
            return 18;
          }
          case 5: {                                                          // RLD
            const m = this.rd(this.hl);
            this.wr(this.hl, ((m << 4) | (this.a & 0x0F)) & 0xFF);
            this.a = (this.a & 0xF0) | (m >> 4);
            this.f = (this.f & CF) | SZP[this.a];
            return 18;
          }
          default: return 8;
        }
    }
  }

  block(y, z) {
    const bus = this.bus;
    if (z === 0) {                                                       // LDI/LDD/LDIR/LDDR
      const v = this.rd(this.hl); this.wr(this.de, v);
      const inc = (y & 1) ? -1 : 1;
      this.hl = (this.hl + inc) & 0xFFFF;
      this.de = (this.de + inc) & 0xFFFF;
      this.bc = (this.bc - 1) & 0xFFFF;
      const n = (this.a + v) & 0xFF;
      this.f = (this.f & (S | ZF | CF)) | ((n & 2) << 4) | (n & XF) | (this.bc ? PF : 0);
      if (y >= 6 && this.bc) { this.pc = (this.pc - 2) & 0xFFFF; return 21; }
      return 16;
    }
    if (z === 1) {                                                       // CPI/CPD/CPIR/CPDR
      const v = this.rd(this.hl);
      const r = (this.a - v) & 0xFF;
      const hf = (this.a ^ v ^ r) & HF;
      this.hl = (this.hl + ((y & 1) ? -1 : 1)) & 0xFFFF;
      this.bc = (this.bc - 1) & 0xFFFF;
      const n = (r - (hf ? 1 : 0)) & 0xFF;
      this.f = (this.f & CF) | (r & S) | (r === 0 ? ZF : 0) | hf | NF | ((n & 2) << 4) | (n & XF) | (this.bc ? PF : 0);
      if (y >= 6 && this.bc && r) { this.pc = (this.pc - 2) & 0xFFFF; return 21; }
      return 16;
    }
    const inc = (y & 1) ? -1 : 1;
    if (z === 2) {                                                       // INI/IND/INIR/INDR
      const v = bus.in(this.bc) & 0xFF;
      this.wr(this.hl, v);
      this.b = (this.b - 1) & 0xFF;
    } else {                                                             // OUTI/OUTD/OTIR/OTDR
      const v = this.rd(this.hl);
      this.b = (this.b - 1) & 0xFF;
      bus.out(this.bc, v);
    }
    this.hl = (this.hl + inc) & 0xFFFF;
    this.f = (this.b ? 0 : ZF) | (this.b & S) | NF;
    if (y >= 6 && this.b) { this.pc = (this.pc - 2) & 0xFFFF; return 21; }
    return 16;
  }

  // ---------- léptetés / megszakítások ----------
  step() {
    if (this.halted) {
      this.t += 4;
      this.r = (this.r & 0x80) | ((this.r + 1) & 0x7F);
      return 4;
    }
    this.eiPending = false;
    let xy = null, pre = 0, op = this.fetch();
    while (op === 0xDD || op === 0xFD) {
      xy = op === 0xDD ? 'ix' : 'iy';
      pre += 4;
      op = this.fetch();
    }
    let t;
    if (op === 0xCB) t = this.execCB(xy);
    else if (op === 0xED) { xy = null; t = this.execED(); }
    else t = this.exec(op, xy);
    t += pre;
    this.t += t;
    return t;
  }

  // maskálható megszakítás (INT). Visszatérés: elfogadta-e
  interrupt() {
    if (!this.iff1 || this.eiPending) return false;
    this.halted = false;
    this.iff1 = 0; this.iff2 = 0;
    this.push(this.pc);
    if (this.im === 2) this.pc = this.rd16(((this.i << 8) | 0xFF) & 0xFFFF);
    else this.pc = 0x38;
    this.t += 13;
    return true;
  }

  nmi() {
    this.halted = false;
    this.iff2 = this.iff1; this.iff1 = 0;
    this.push(this.pc);
    this.pc = 0x66;
    this.t += 11;
  }
}

