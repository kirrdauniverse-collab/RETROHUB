// 6502 CPU emulator - egyszerű de működőképes implementáció
// A C64 és a C16/+4 gépekhez használjuk (MOS 6510 / 7501 / 8501).
// Támogatja: minden hivatalos utasítás + a leggyakoribb nem dokumentáltakat.
// Forrás: saját implementáció, a 6502 referencia alapján.

const ZF = 0x02, NF = 0x80, CF = 0x01, VF = 0x40, IF = 0x04, DF = 0x08, BF = 0x10;


class Cpu6502 {
  bus;
  a = 0; x = 0; y = 0;
  sp = 0xFD; pc = 0;
  p = 0x24; // ZF + (unset bit)
  cycles = 0;
  halted = false;

  // Interrupt kérések
  irqPending = false;
  nmiPending = false;

  constructor(bus) { this.bus = bus; this.reset(); }

  reset() {
    this.a = 0; this.x = 0; this.y = 0;
    this.sp = 0xFD;
    // Reset vector a $FFFC-$FFFD
    this.pc = this.bus.read(0xFFFC) | (this.bus.read(0xFFFD) << 8);
    this.p = IF | BF | ZF;
    this.cycles = 0;
    this.halted = false;
  }

  irq() { this.irqPending = true; }
  nmi() { this.nmiPending = true; }

  push(v) {
    this.bus.write(0x100 + this.sp, v & 0xFF);
    this.sp = (this.sp - 1) & 0xFF;
  }
  pop() {
    this.sp = (this.sp + 1) & 0xFF;
    return this.bus.read(0x100 + this.sp);
  }
  setZN(v) {
    this.p = (this.p & ~(ZF | NF)) | (v === 0 ? ZF : 0) | (v & 0x80 ? NF : 0);
  }
  setFlags(mask, value) {
    this.p = (this.p & ~mask) | (value & mask);
  }
  branch(offset) {
    const old = this.pc;
    this.pc = (this.pc + offset) & 0xFFFF;
    this.cycles += 3;
    if ((old & 0xFF00) !== (this.pc & 0xFF00)) this.cycles += 2; // page boundary
    else this.cycles += 1;
  }

  // Addressing modes - return effective address
  addrImmediate() { const a = this.pc; this.pc = (this.pc + 1) & 0xFFFF; return a; }
  addrZero() { const a = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return a; }
  addrZeroX() { const z = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return (z + this.x) & 0xFF; }
  addrZeroY() { const z = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return (z + this.y) & 0xFF; }
  addrAbsolute() {
    const lo = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    const hi = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    return lo | (hi << 8);
  }
  addrAbsX() {
    const lo = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    const hi = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    return (lo | (hi << 8)) + this.x & 0xFFFF;
  }
  addrAbsY() {
    const lo = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    const hi = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    return ((lo | (hi << 8)) + this.y) & 0xFFFF;
  }
  addrIndX() {
    const z = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    const a = (z + this.x) & 0xFF;
    const lo = this.bus.read(a);
    const hi = this.bus.read((a + 1) & 0xFF);
    return lo | (hi << 8);
  }
  addrIndY() {
    const z = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
    const lo = this.bus.read(z);
    const hi = this.bus.read((z + 1) & 0xFF);
    return (((lo | (hi << 8)) + this.y) & 0xFFFF);
  }

  rd(a) { return this.bus.read(a & 0xFFFF); }
  wr(a, v) { this.bus.write(a & 0xFFFF, v & 0xFF); }

  // Compare
  cmp(reg, v) {
    const r = (reg - v) & 0xFF;
    this.setFlags(CF | ZF | NF, (reg >= v ? CF : 0) | (r === 0 ? ZF : 0) | (r & NF));
  }
  // ADC
  adc(v) {
    if (this.p & DF) {
      /* v9.3.5: helyes NMOS-dekád korrekció — a régi kód a hi>9-es +6-os
         korrekciót elhagyta és a lo ≥ 0x20-nál rossz átvitelt adott, ezért
         a BASIC 3.5 (C16/Plus4) BCD-alapú FP→ASCII számkiírása szemetet
         nyomtatott (a C64 BASIC 2 bináris osztásos, azért nem érintett). */
      let lo = (this.a & 0x0F) + (v & 0x0F) + (this.p & CF ? 1 : 0);
      if (lo > 9) lo += 6;
      let hi = (this.a >> 4) + (v >> 4) + (lo > 0x0F ? 1 : 0);
      if (hi > 9) hi += 6;
      const res = ((hi << 4) | (lo & 0x0F)) & 0xFF;
      this.setFlags(CF | VF, (hi > 0x0F ? CF : 0) | (((~(this.a ^ v) & (this.a ^ res) & 0x80) ? VF : 0)));
      this.setZN(res);
      this.a = res;
    } else {
      const sum = this.a + v + (this.p & CF ? 1 : 0);
      const res = sum & 0xFF;
      this.setFlags(CF | VF | ZF | NF, (sum > 0xFF ? CF : 0) | ((~(this.a ^ v) & (this.a ^ res) & 0x80) ? VF : 0) | (res === 0 ? ZF : 0) | (res & NF));
      this.a = res;
    }
  }
  sbc(v) {
    if (this.p & DF) {
      /* v9.3.5: NMOS-dekád SBC — a hi alulcsordulásnál dekád korrekció (+10),
         nem bináris fallback; a VF-képlet marad. */
      let lo = (this.a & 0x0F) - (v & 0x0F) - (this.p & CF ? 0 : 1);
      let hi = (this.a >> 4) - (v >> 4);
      if (lo < 0) { lo += 10; hi--; }
      let cf = 0;
      if (hi < 0) { hi += 10; } else { cf = CF; }
      const res = ((hi << 4) | (lo & 0x0F)) & 0xFF;
      this.setFlags(CF | VF, cf | (((~(this.a ^ v) & (this.a ^ res) & 0x80) ? VF : 0)));
      this.setZN(res);
      this.a = res;
    } else {
      const diff = this.a - v - (this.p & CF ? 0 : 1);
      const res = diff & 0xFF;
      this.setFlags(CF | VF | ZF | NF, (diff >= 0 ? CF : 0) | ((~(this.a ^ v) & (this.a ^ res) & 0x80) ? VF : 0) | (res === 0 ? ZF : 0) | (res & NF));
      this.a = res;
    }
  }
  asl(v) {
    this.setFlags(CF, v & 0x80 ? CF : 0);
    const r = (v << 1) & 0xFF;
    this.setZN(r);
    return r;
  }
  lsr(v) {
    this.setFlags(CF, v & 1 ? CF : 0);
    const r = v >> 1;
    this.setZN(r);
    return r;
  }
  rol(v) {
    const c = v & 0x80 ? CF : 0;
    const r = ((v << 1) | (this.p & CF ? 1 : 0)) & 0xFF;
    this.setFlags(CF | ZF | NF, c | (r === 0 ? ZF : 0) | (r & NF));
    return r;
  }
  ror(v) {
    const c = v & 1 ? CF : 0;
    const r = ((v >> 1) | (this.p & CF ? 0x80 : 0)) & 0xFF;
    this.setFlags(CF | ZF | NF, c | (r === 0 ? ZF : 0) | (r & NF));
    return r;
  }
  bit(v) {
    this.setFlags(ZF | NF | VF, (v & this.a) === 0 ? ZF : 0 | (v & (NF | VF)));
  }

  step() {
    if (this.halted) { this.cycles += 1; return; }
    // NMI check
    if (this.nmiPending) {
      this.nmiPending = false;
      this.push((this.pc >> 8) & 0xFF);
      this.push(this.pc & 0xFF);
      this.push((this.p | BF) & ~IF);
      this.pc = this.bus.read(0xFFFA) | (this.bus.read(0xFFFB) << 8);
      this.setFlags(IF, IF);
      this.cycles += 7;
      return;
    }
    // IRQ check
    if (this.irqPending && !(this.p & IF)) {
      this.irqPending = false;
      this.push((this.pc >> 8) & 0xFF);
      this.push(this.pc & 0xFF);
      this.push((this.p | BF) & ~IF);
      this.pc = this.bus.read(0xFFFE) | (this.bus.read(0xFFFF) << 8);
      this.setFlags(IF, IF);
      this.cycles += 7;
      return;
    }

    const op = this.bus.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    this.cycles += 2; // base cycle count

    // Quick lookup tables
    switch (op) {
      // ----- LDA -----
      case 0xA9: this.a = this.rd(this.addrImmediate()); this.setZN(this.a); break;
      case 0xA5: this.a = this.rd(this.addrZero()); this.setZN(this.a); break;
      case 0xB5: this.a = this.rd(this.addrZeroX()); this.setZN(this.a); break;
      case 0xAD: this.a = this.rd(this.addrAbsolute()); this.setZN(this.a); break;
      case 0xBD: this.a = this.rd(this.addrAbsX()); this.setZN(this.a); this.cycles += 1; break;
      case 0xB9: this.a = this.rd(this.addrAbsY()); this.setZN(this.a); this.cycles += 1; break;
      case 0xA1: this.a = this.rd(this.addrIndX()); this.setZN(this.a); break;
      case 0xB1: this.a = this.rd(this.addrIndY()); this.setZN(this.a); this.cycles += 1; break;
      // ----- LDX -----
      case 0xA2: this.x = this.rd(this.addrImmediate()); this.setZN(this.x); break;
      case 0xA6: this.x = this.rd(this.addrZero()); this.setZN(this.x); break;
      case 0xB6: this.x = this.rd(this.addrZeroY()); this.setZN(this.x); break;
      case 0xAE: this.x = this.rd(this.addrAbsolute()); this.setZN(this.x); break;
      case 0xBE: this.x = this.rd(this.addrAbsY()); this.setZN(this.x); this.cycles += 1; break;
      // ----- LDY -----
      case 0xA0: this.y = this.rd(this.addrImmediate()); this.setZN(this.y); break;
      case 0xA4: this.y = this.rd(this.addrZero()); this.setZN(this.y); break;
      case 0xB4: this.y = this.rd(this.addrZeroX()); this.setZN(this.y); break;
      case 0xAC: this.y = this.rd(this.addrAbsolute()); this.setZN(this.y); break;
      case 0xBC: this.y = this.rd(this.addrAbsX()); this.setZN(this.y); this.cycles += 1; break;
      // ----- STA -----
      case 0x85: this.wr(this.addrZero(), this.a); break;
      case 0x95: this.wr(this.addrZeroX(), this.a); break;
      case 0x8D: this.wr(this.addrAbsolute(), this.a); break;
      case 0x9D: this.wr(this.addrAbsX(), this.a); this.cycles += 1; break;
      case 0x99: this.wr(this.addrAbsY(), this.a); this.cycles += 1; break;
      case 0x81: this.wr(this.addrIndX(), this.a); break;
      case 0x91: this.wr(this.addrIndY(), this.a); this.cycles += 1; break;
      // ----- STX -----
      case 0x86: this.wr(this.addrZero(), this.x); break;
      case 0x96: this.wr(this.addrZeroY(), this.x); break;
      case 0x8E: this.wr(this.addrAbsolute(), this.x); break;
      // ----- STY -----
      case 0x84: this.wr(this.addrZero(), this.y); break;
      case 0x94: this.wr(this.addrZeroX(), this.y); break;
      case 0x8C: this.wr(this.addrAbsolute(), this.y); break;
      // ----- Transfers -----
      case 0xAA: this.x = this.a; this.setZN(this.x); break; // TAX
      case 0xA8: this.y = this.a; this.setZN(this.y); break; // TAY
      case 0x8A: this.a = this.x; this.setZN(this.a); break; // TXA
      case 0x98: this.a = this.y; this.setZN(this.a); break; // TYA
      case 0xBA: this.x = this.sp; this.setZN(this.x); break; // TSX
      case 0x9A: this.sp = this.x; break; // TXS
      // ----- Stack -----
      case 0x48: this.push(this.a); break; // PHA
      case 0x68: this.a = this.pop(); this.setZN(this.a); break; // PLA
      case 0x08: this.push(this.p | BF); break; // PHP
      case 0x28: this.p = (this.pop() & ~BF) | (this.p & BF); break; // PLP
      // ----- Logic -----
      case 0x29: this.a &= this.rd(this.addrImmediate()); this.setZN(this.a); break;
      case 0x25: this.a &= this.rd(this.addrZero()); this.setZN(this.a); break;
      case 0x35: this.a &= this.rd(this.addrZeroX()); this.setZN(this.a); break;
      case 0x2D: this.a &= this.rd(this.addrAbsolute()); this.setZN(this.a); break;
      case 0x3D: this.a &= this.rd(this.addrAbsX()); this.setZN(this.a); this.cycles += 1; break;
      case 0x39: this.a &= this.rd(this.addrAbsY()); this.setZN(this.a); this.cycles += 1; break;
      case 0x21: this.a &= this.rd(this.addrIndX()); this.setZN(this.a); break;
      case 0x31: this.a &= this.rd(this.addrIndY()); this.setZN(this.a); this.cycles += 1; break;
      case 0x09: this.a |= this.rd(this.addrImmediate()); this.setZN(this.a); break;
      case 0x05: this.a |= this.rd(this.addrZero()); this.setZN(this.a); break;
      case 0x15: this.a |= this.rd(this.addrZeroX()); this.setZN(this.a); break;
      case 0x0D: this.a |= this.rd(this.addrAbsolute()); this.setZN(this.a); break;
      case 0x1D: this.a |= this.rd(this.addrAbsX()); this.setZN(this.a); this.cycles += 1; break;
      case 0x19: this.a |= this.rd(this.addrAbsY()); this.setZN(this.a); this.cycles += 1; break;
      case 0x01: this.a |= this.rd(this.addrIndX()); this.setZN(this.a); break;
      case 0x11: this.a |= this.rd(this.addrIndY()); this.setZN(this.a); this.cycles += 1; break;
      case 0x49: this.a ^= this.rd(this.addrImmediate()); this.setZN(this.a); break;
      case 0x45: this.a ^= this.rd(this.addrZero()); this.setZN(this.a); break;
      case 0x55: this.a ^= this.rd(this.addrZeroX()); this.setZN(this.a); break;
      case 0x4D: this.a ^= this.rd(this.addrAbsolute()); this.setZN(this.a); break;
      case 0x5D: this.a ^= this.rd(this.addrAbsX()); this.setZN(this.a); this.cycles += 1; break;
      case 0x59: this.a ^= this.rd(this.addrAbsY()); this.setZN(this.a); this.cycles += 1; break;
      case 0x41: this.a ^= this.rd(this.addrIndX()); this.setZN(this.a); break;
      case 0x51: this.a ^= this.rd(this.addrIndY()); this.setZN(this.a); this.cycles += 1; break;
      // ----- BIT -----
      case 0x24: this.bit(this.rd(this.addrZero())); break;
      case 0x2C: this.bit(this.rd(this.addrAbsolute())); break;
      // ----- ADC -----
      case 0x69: this.adc(this.rd(this.addrImmediate())); break;
      case 0x65: this.adc(this.rd(this.addrZero())); break;
      case 0x75: this.adc(this.rd(this.addrZeroX())); break;
      case 0x6D: this.adc(this.rd(this.addrAbsolute())); break;
      case 0x7D: this.adc(this.rd(this.addrAbsX())); this.cycles += 1; break;
      case 0x79: this.adc(this.rd(this.addrAbsY())); this.cycles += 1; break;
      case 0x61: this.adc(this.rd(this.addrIndX())); break;
      case 0x71: this.adc(this.rd(this.addrIndY())); this.cycles += 1; break;
      // ----- SBC -----
      case 0xE9: this.sbc(this.rd(this.addrImmediate())); break;
      case 0xE5: this.sbc(this.rd(this.addrZero())); break;
      case 0xF5: this.sbc(this.rd(this.addrZeroX())); break;
      case 0xED: this.sbc(this.rd(this.addrAbsolute())); break;
      case 0xFD: this.sbc(this.rd(this.addrAbsX())); this.cycles += 1; break;
      case 0xF9: this.sbc(this.rd(this.addrAbsY())); this.cycles += 1; break;
      case 0xE1: this.sbc(this.rd(this.addrIndX())); break;
      case 0xF1: this.sbc(this.rd(this.addrIndY())); this.cycles += 1; break;
      // ----- CMP -----
      case 0xC9: this.cmp(this.a, this.rd(this.addrImmediate())); break;
      case 0xC5: this.cmp(this.a, this.rd(this.addrZero())); break;
      case 0xD5: this.cmp(this.a, this.rd(this.addrZeroX())); break;
      case 0xCD: this.cmp(this.a, this.rd(this.addrAbsolute())); break;
      case 0xDD: this.cmp(this.a, this.rd(this.addrAbsX())); this.cycles += 1; break;
      case 0xD9: this.cmp(this.a, this.rd(this.addrAbsY())); this.cycles += 1; break;
      case 0xC1: this.cmp(this.a, this.rd(this.addrIndX())); break;
      case 0xD1: this.cmp(this.a, this.rd(this.addrIndY())); this.cycles += 1; break;
      // ----- CPX -----
      case 0xE0: this.cmp(this.x, this.rd(this.addrImmediate())); break;
      case 0xE4: this.cmp(this.x, this.rd(this.addrZero())); break;
      case 0xEC: this.cmp(this.x, this.rd(this.addrAbsolute())); break;
      // ----- CPY -----
      case 0xC0: this.cmp(this.y, this.rd(this.addrImmediate())); break;
      case 0xC4: this.cmp(this.y, this.rd(this.addrZero())); break;
      case 0xCC: this.cmp(this.y, this.rd(this.addrAbsolute())); break;
      // ----- INC -----
      case 0xE6: { const a = this.addrZero(); const v = (this.rd(a) + 1) & 0xFF; this.wr(a, v); this.setZN(v); this.cycles += 2; break; }
      case 0xF6: { const a = this.addrZeroX(); const v = (this.rd(a) + 1) & 0xFF; this.wr(a, v); this.setZN(v); this.cycles += 2; break; }
      case 0xEE: { const a = this.addrAbsolute(); const v = (this.rd(a) + 1) & 0xFF; this.wr(a, v); this.setZN(v); this.cycles += 2; break; }
      case 0xFE: { const a = this.addrAbsX(); const v = (this.rd(a) + 1) & 0xFF; this.wr(a, v); this.setZN(v); this.cycles += 3; break; }
      // ----- DEC -----
      case 0xC6: { const a = this.addrZero(); const v = (this.rd(a) - 1) & 0xFF; this.wr(a, v); this.setZN(v); this.cycles += 2; break; }
      case 0xD6: { const a = this.addrZeroX(); const v = (this.rd(a) - 1) & 0xFF; this.wr(a, v); this.setZN(v); this.cycles += 2; break; }
      case 0xCE: { const a = this.addrAbsolute(); const v = (this.rd(a) - 1) & 0xFF; this.wr(a, v); this.setZN(v); this.cycles += 2; break; }
      case 0xDE: { const a = this.addrAbsX(); const v = (this.rd(a) - 1) & 0xFF; this.wr(a, v); this.setZN(v); this.cycles += 3; break; }
      // ----- INX/INY/DEX/DEY -----
      case 0xE8: this.x = (this.x + 1) & 0xFF; this.setZN(this.x); break;
      case 0xC8: this.y = (this.y + 1) & 0xFF; this.setZN(this.y); break;
      case 0xCA: this.x = (this.x - 1) & 0xFF; this.setZN(this.x); break;
      case 0x88: this.y = (this.y - 1) & 0xFF; this.setZN(this.y); break;
      // ----- Shifts (accumulator) -----
      case 0x0A: this.a = this.asl(this.a); break;
      case 0x4A: this.a = this.lsr(this.a); break;
      case 0x2A: this.a = this.rol(this.a); break;
      case 0x6A: this.a = this.ror(this.a); break;
      // ----- Shifts (memory) -----
      case 0x06: { const a = this.addrZero(); this.wr(a, this.asl(this.rd(a))); this.cycles += 2; break; }
      case 0x16: { const a = this.addrZeroX(); this.wr(a, this.asl(this.rd(a))); this.cycles += 2; break; }
      case 0x0E: { const a = this.addrAbsolute(); this.wr(a, this.asl(this.rd(a))); this.cycles += 2; break; }
      case 0x1E: { const a = this.addrAbsX(); this.wr(a, this.asl(this.rd(a))); this.cycles += 3; break; }
      case 0x46: { const a = this.addrZero(); this.wr(a, this.lsr(this.rd(a))); this.cycles += 2; break; }
      case 0x56: { const a = this.addrZeroX(); this.wr(a, this.lsr(this.rd(a))); this.cycles += 2; break; }
      case 0x4E: { const a = this.addrAbsolute(); this.wr(a, this.lsr(this.rd(a))); this.cycles += 2; break; }
      case 0x5E: { const a = this.addrAbsX(); this.wr(a, this.lsr(this.rd(a))); this.cycles += 3; break; }
      case 0x26: { const a = this.addrZero(); this.wr(a, this.rol(this.rd(a))); this.cycles += 2; break; }
      case 0x36: { const a = this.addrZeroX(); this.wr(a, this.rol(this.rd(a))); this.cycles += 2; break; }
      case 0x2E: { const a = this.addrAbsolute(); this.wr(a, this.rol(this.rd(a))); this.cycles += 2; break; }
      case 0x3E: { const a = this.addrAbsX(); this.wr(a, this.rol(this.rd(a))); this.cycles += 3; break; }
      case 0x66: { const a = this.addrZero(); this.wr(a, this.ror(this.rd(a))); this.cycles += 2; break; }
      case 0x76: { const a = this.addrZeroX(); this.wr(a, this.ror(this.rd(a))); this.cycles += 2; break; }
      case 0x6E: { const a = this.addrAbsolute(); this.wr(a, this.ror(this.rd(a))); this.cycles += 2; break; }
      case 0x7E: { const a = this.addrAbsX(); this.wr(a, this.ror(this.rd(a))); this.cycles += 3; break; }
      // ----- Jumps -----
      case 0x4C: this.pc = this.addrAbsolute(); break; // JMP abs
      case 0x6C: { // JMP (ind) - buggy 6502 page boundary
        const lo = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
        const hi = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
        const ptr = lo | (hi << 8);
        const lo2 = this.bus.read(ptr);
        const hi2 = this.bus.read((ptr & 0xFF00) | ((ptr + 1) & 0xFF)); // bug
        this.pc = lo2 | (hi2 << 8);
        this.cycles += 3;
        break;
      }
      // ----- JSR / RTS -----
      case 0x20: {
        const lo = this.bus.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
        const hi = this.bus.read(this.pc);
        const target = lo | (hi << 8);
        this.push(this.pc >> 8); this.push(this.pc & 0xFF);
        this.pc = target;
        this.cycles += 4;
        break;
      }
      case 0x60: {
        const lo = this.pop(); const hi = this.pop();
        this.pc = ((lo | (hi << 8)) + 1) & 0xFFFF;
        this.cycles += 4;
        break;
      }
      // ----- RTI -----
      case 0x40: {
        this.p = (this.pop() & ~BF) | (this.p & BF);
        const lo = this.pop(); const hi = this.pop();
        this.pc = lo | (hi << 8);
        this.cycles += 4;
        break;
      }
      // ----- Branches -----
      case 0x10: { const o = this.fetchOffset(); if (!(this.p & NF)) this.branch(o); break; } // BPL
      case 0x30: { const o = this.fetchOffset(); if (this.p & NF) this.branch(o); break; } // BMI
      case 0x50: { const o = this.fetchOffset(); if (!(this.p & VF)) this.branch(o); break; } // BVC
      case 0x70: { const o = this.fetchOffset(); if (this.p & VF) this.branch(o); break; } // BVS
      case 0x90: { const o = this.fetchOffset(); if (!(this.p & CF)) this.branch(o); break; } // BCC
      case 0xB0: { const o = this.fetchOffset(); if (this.p & CF) this.branch(o); break; } // BCS
      case 0xD0: { const o = this.fetchOffset(); if (!(this.p & ZF)) this.branch(o); break; } // BNE
      case 0xF0: { const o = this.fetchOffset(); if (this.p & ZF) this.branch(o); break; } // BEQ
      // ----- Flags -----
      case 0x18: this.setFlags(CF, 0); break; // CLC
      case 0x38: this.setFlags(CF, CF); break; // SEC
      case 0x58: this.setFlags(IF, 0); break; // CLI
      case 0x78: this.setFlags(IF, IF); break; // SEI
      case 0xB8: this.setFlags(VF, 0); break; // CLV
      case 0xD8: this.setFlags(DF, 0); break; // CLD
      case 0xF8: this.setFlags(DF, DF); break; // SED
      // ----- NOP -----
      case 0xEA: break;
      // ----- BRK -----
      case 0x00: {
        this.pc = (this.pc + 1) & 0xFFFF;
        this.push(this.pc >> 8); this.push(this.pc & 0xFF);
        this.push(this.p | BF);
        this.pc = this.bus.read(0xFFFE) | (this.bus.read(0xFFFF) << 8);
        this.setFlags(IF, IF);
        this.cycles += 5;
        break;
      }
      default:
        // Ismeretlen opcode - egyszerűen lépjünk tovább
        // A legtöbb nem dokumentált opcode-otNOP-ként kezeljük
        break;
    }
  }

  fetchOffset() {
    const v = this.bus.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    return v & 0x80 ? v - 0x100 : v;
  }
}


