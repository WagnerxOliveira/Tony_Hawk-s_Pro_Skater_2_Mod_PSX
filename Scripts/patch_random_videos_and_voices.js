#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) MIPS R3000A Runtime Patcher:
 *   1. Randomized Boot Videos (Activision + Neversoft + Intro slots):
 *      - Uses persistent PS1 Memory Card Slot 1 Sector 60 (0x3C) boot counter +
 *        hardware Root Counters (0x1F801100/10/20) + VSync(-1) + xorshift32 PRNG
 *        so EVERY cold boot in DuckStation plays 3 DIFFERENT random custom videos
 *        from all 20 full-screen custom videos (INTRO.STR + all 19 X\*.STR).
 *      - Never repeats the same video within a boot sequence, and never repeats
 *        the previous boot's first video. Gracefully falls back if no MC is inserted.
 *      - Leaves skater career ending videos (0x8003CC7C) 100% untouched!
 *
 *   2. Skater Select Voice Clips for Lulao (idx 2) & Bolsonaro (idx 3):
 *      - Loads resident MODCODE (2048 B -> 0x800E2800) + VOICETBL (2048 B -> 0x800E3000)
 *        once at boot from \VOICES.DAT;1 (calling BIOS FlushCache A0:0x44).
 *      - Reserves 0x800E2678..0x800E37FF below THPS2's heap (0x800E3800) with ZERO
 *        change to SLUS_010.66 file size and ZERO LBA shift on all 48 original ISO files!
 *      - Reserves SPU Hardware Voice 23 exclusively for skater voices (SFX uses 0..22).
 *      - Hooks playsel.bin +0x3388 (Left/Right scroll) & +0x100C (Confirm X) — both verified
 *        outside playsel.rel!
 *      - Every scroll onto Lulao/Bolsonaro (and every scroll away & back) advances through
 *        their 14 normalized SPU-ADPCM clips and plays immediately over menu music.
 *      - Pressing X to select Lulao/Bolsonaro cuts off any prior clip and plays the next clip.
 *      - Reads clips XA-safely (waits CDWAD idle, pauses & restores COMPILED.XA CdlSetmode 0xC8),
 *        DMAs to free upper SPU RAM 0x58000..0x7EFF0, frees temporary RAM immediately.
 */

const fs = require('fs');
const path = require('path');
const { buildVoicesBank } = require('./build_skater_voices');

const rootDir = path.resolve(__dirname, '..');
const slusPath = path.join(rootDir, 'SLUS_010.66');
const wadPath = path.join(rootDir, 'CD.WAD');
const hedPath = path.join(rootDir, 'CD.HED');
const backupDir = path.join(rootDir, 'originals_backup');
const voicesDatPath = path.join(rootDir, 'VOICES.DAT');

const SLUS_BASE = 0x80010000;
const SLUS_HDR = 0x800;

// ============================================================================
// Verified SLUS_010.66 Resident Function & Data Addresses
// ============================================================================
const SYM = {
  Movies_Init:            0x8007A6B4,
  PlayFullScreenMovie:    0x8007A804,
  GetSelectedSkaterIdx:   0x8008A3A8,
  SFX_Play:               0x800526B4,
  Mem_Alloc:              0x8005515C,
  Mem_Free:               0x800551A8,
  CDWAD_WaitIdle:         0x800544C4,
  XA_SetMode:             0x800387A8,
  XA_Pause:               0x80038D60,
  CdSearchFile:           0x800A0D28,
  CdPosToInt:             0x800A179C,
  CdIntToPos:             0x800A1698,
  CdControl:              0x800A08C4,
  CdRead:                 0x800A5B30,
  CdReadSync:             0x800A5CCC,
  VSync:                  0x800A38C4,
  FlushCache:             0x800AF500,
  SpuSetTransferStartAddr:0x800A3D74,
  SpuWrite:               0x800A42B4,
  SpuIsTransferCompleted: 0x800A4F84,
  SpuSetKey:              0x800A4CA4,
  ClearCardEvents:        0x800A8BB4,
  WaitCardEvent:          0x800A8D94,
  NewCardAck:             0x800A8EF4,
  _card_read:             0x800AF1F0,
  _card_write:            0x800A9CF4,
  g_Career:               0x800C2958,
};

// Fixed Mod RAM Addresses (reserved below heap 0x800E3800)
const ADDR = {
  HeapStartPtr:        0x800E2674,
  NewHeapStart:        0x800E3800,
  Mod_BootInit:        0x800E2680,
  Tramp_BootMovie:     0x800E2758,
  Tramp_PlaySelScroll: 0x800E2780,
  Tramp_PlaySelConfirm:0x800E27A8,
  g_VoicesBaseLba:     0x800E27D0,
  g_ModLoaded:         0x800E27D4,
  Str_VoicesPath:      0x800E27D8, // "\VOICES.DAT;1\0" (14 B)
  ModCodeBase:         0x800E2800, // Sector 0 of VOICES.DAT (2048 B)
  Entry_BootMovie:     0x800E2800,
  Entry_PlaySelScroll: 0x800E2808,
  Entry_PlaySelConfirm:0x800E2810,
  VoiceTblBase:        0x800E3000, // Sector 1 of VOICES.DAT (2048 B)
  SpuVoiceBuf:         0x00058000, // Upper SPU RAM (0x58000..0x7EFF0 = 159,728 B free)
};

// ============================================================================
// Clean Self-Verifying MIPS I (R3000A) Assembler
// ============================================================================
const R = {
  zero:0, at:1, v0:2, v1:3, a0:4, a1:5, a2:6, a3:7,
  t0:8, t1:9, t2:10, t3:11, t4:12, t5:13, t6:14, t7:15,
  s0:16, s1:17, s2:18, s3:19, s4:20, s5:21, s6:22, s7:23,
  t8:24, t9:25, k0:26, k1:27, gp:28, sp:29, fp:30, ra:31,
};

class MipsAsm {
  constructor(baseAddr) {
    this.base = baseAddr >>> 0;
    this.ops = []; // { addr, word?, fixup? }
    this.labels = new Map();
  }
  pc() { return (this.base + this.ops.length * 4) >>> 0; }
  label(name) {
    if (this.labels.has(name)) throw new Error(`Duplicate label: ${name}`);
    this.labels.set(name, this.pc());
  }
  align(n) {
    while ((this.pc() % n) !== 0) this.word(0);
  }
  padTo(targetAddr) {
    const t = targetAddr >>> 0;
    if (this.pc() > t) throw new Error(`Overflow: PC 0x${this.pc().toString(16)} > target 0x${t.toString(16)}`);
    while (this.pc() < t) this.word(0);
  }
  word(w) { this.ops.push({ addr: this.pc(), word: w >>> 0 }); }
  bytes(buf) {
    const paddedLen = Math.ceil(buf.length / 4) * 4;
    const tmp = Buffer.alloc(paddedLen, 0);
    buf.copy(tmp, 0);
    for (let i = 0; i < paddedLen; i += 4) this.word(tmp.readUInt32LE(i));
  }
  nop() { this.word(0); }

  _r(rs, rt, rd, sh, fn) {
    this.word(((rs & 31) << 21) | ((rt & 31) << 16) | ((rd & 31) << 11) | ((sh & 31) << 6) | (fn & 63));
  }
  _i(op, rs, rt, imm) {
    this.word(((op & 63) << 26) | ((rs & 31) << 21) | ((rt & 31) << 16) | (imm & 0xffff));
  }
  _j(op, target) {
    const addr = this.pc();
    if (typeof target === 'string') {
      this.ops.push({ addr, fixup: { type: 'J', op, label: target } });
    } else {
      this.word(((op & 63) << 26) | ((target >>> 2) & 0x03ffffff));
    }
  }
  _br(op, rs, rt, label) {
    this.ops.push({ addr: this.pc(), fixup: { type: 'B', op, rs, rt, label } });
  }

  // R-type
  sll(rd, rt, sh)   { this._r(0, rt, rd, sh, 0x00); }
  srl(rd, rt, sh)   { this._r(0, rt, rd, sh, 0x02); }
  sra(rd, rt, sh)   { this._r(0, rt, rd, sh, 0x03); }
  jr(rs)            { this._r(rs, 0, 0, 0, 0x08); }
  mfhi(rd)          { this._r(0, 0, rd, 0, 0x10); }
  mflo(rd)          { this._r(0, 0, rd, 0, 0x12); }
  multu(rs, rt)     { this._r(rs, rt, 0, 0, 0x19); }
  divu(rs, rt)      { this._r(rs, rt, 0, 0, 0x1b); }
  addu(rd, rs, rt)  { this._r(rs, rt, rd, 0, 0x21); }
  subu(rd, rs, rt)  { this._r(rs, rt, rd, 0, 0x23); }
  and(rd, rs, rt)   { this._r(rs, rt, rd, 0, 0x24); }
  or(rd, rs, rt)    { this._r(rs, rt, rd, 0, 0x25); }
  xor(rd, rs, rt)   { this._r(rs, rt, rd, 0, 0x26); }
  nor(rd, rs, rt)   { this._r(rs, rt, rd, 0, 0x27); }
  slt(rd, rs, rt)   { this._r(rs, rt, rd, 0, 0x2a); }
  sltu(rd, rs, rt)  { this._r(rs, rt, rd, 0, 0x2b); }
  move(rd, rs)      { this.addu(rd, rs, R.zero); }

  // I-type
  addiu(rt, rs, imm){ this._i(0x09, rs, rt, imm); }
  slti(rt, rs, imm) { this._i(0x0a, rs, rt, imm); }
  sltiu(rt, rs, imm){ this._i(0x0b, rs, rt, imm); }
  andi(rt, rs, imm) { this._i(0x0c, rs, rt, imm); }
  ori(rt, rs, imm)  { this._i(0x0d, rs, rt, imm); }
  xori(rt, rs, imm) { this._i(0x0e, rs, rt, imm); }
  lui(rt, imm)      { this._i(0x0f, 0, rt, imm); }
  lb(rt, imm, rs)   { this._i(0x20, rs, rt, imm); }
  lh(rt, imm, rs)   { this._i(0x21, rs, rt, imm); }
  lw(rt, imm, rs)   { this._i(0x23, rs, rt, imm); }
  lbu(rt, imm, rs)  { this._i(0x24, rs, rt, imm); }
  lhu(rt, imm, rs)  { this._i(0x25, rs, rt, imm); }
  sb(rt, imm, rs)   { this._i(0x28, rs, rt, imm); }
  sh(rt, imm, rs)   { this._i(0x29, rs, rt, imm); }
  sw(rt, imm, rs)   { this._i(0x2b, rs, rt, imm); }

  // Branches & Jumps
  j(t)              { this._j(0x02, t); }
  jal(t)            { this._j(0x03, t); }
  beq(rs, rt, lbl)  { this._br(0x04, rs, rt, lbl); }
  bne(rs, rt, lbl)  { this._br(0x05, rs, rt, lbl); }
  blez(rs, lbl)     { this._br(0x06, rs, 0, lbl); }
  bgtz(rs, lbl)     { this._br(0x07, rs, 0, lbl); }
  bltz(rs, lbl)     { this._br(0x01, rs, 0, lbl); }
  bgez(rs, lbl)     { this._br(0x01, rs, 1, lbl); }

  // Pseudo-instructions (exact 2-instruction pairs with label support)
  li(rt, val) {
    const u = val >>> 0;
    if (u <= 0x7fff || u >= 0xffff8000) {
      this.addiu(rt, R.zero, u & 0xffff);
    } else if ((u & 0xffff) === 0) {
      this.lui(rt, (u >>> 16) & 0xffff);
    } else {
      this.lui(rt, (u >>> 16) & 0xffff);
      this.ori(rt, rt, u & 0xffff);
    }
  }
  la(rt, target) {
    if (typeof target === 'string') {
      this.ops.push({ addr: this.pc(), fixup: { type: 'LA_HI', rt, label: target } });
      this.ops.push({ addr: this.pc(), fixup: { type: 'LA_LO', rt, label: target } });
    } else {
      const hi = ((target + 0x8000) >>> 16) & 0xffff;
      const lo = target & 0xffff;
      this.lui(rt, hi);
      this.addiu(rt, rt, lo);
    }
  }
  lwSym(rt, target) {
    if (typeof target === 'string') {
      this.ops.push({ addr: this.pc(), fixup: { type: 'LA_HI', rt, label: target } });
      this.ops.push({ addr: this.pc(), fixup: { type: 'LW_LO', rt, label: target } });
    } else {
      const hi = ((target + 0x8000) >>> 16) & 0xffff;
      const lo = target & 0xffff;
      this.lui(rt, hi);
      this.lw(rt, lo, rt);
    }
  }
  swSym(valReg, tmpReg, target) {
    if (valReg === tmpReg) throw new Error('swSym: valReg === tmpReg');
    if (typeof target === 'string') {
      this.ops.push({ addr: this.pc(), fixup: { type: 'LA_HI', rt: tmpReg, label: target } });
      this.ops.push({ addr: this.pc(), fixup: { type: 'SW_LO', rs: tmpReg, rt: valReg, label: target } });
    } else {
      const hi = ((target + 0x8000) >>> 16) & 0xffff;
      const lo = target & 0xffff;
      this.lui(tmpReg, hi);
      this.sw(valReg, lo, tmpReg);
    }
  }

  emit() {
    const out = Buffer.alloc(this.ops.length * 4);
    for (let i = 0; i < this.ops.length; i++) {
      const o = this.ops[i];
      let w;
      if (!o.fixup) {
        w = o.word;
      } else {
        const f = o.fixup;
        if (!this.labels.has(f.label)) throw new Error(`Undefined label: ${f.label}`);
        const tgt = this.labels.get(f.label);
        if (f.type === 'J') {
          if (((o.addr + 4) & 0xf0000000) !== (tgt & 0xf0000000)) {
            throw new Error(`Jump out of 256MB segment: 0x${o.addr.toString(16)} -> 0x${tgt.toString(16)}`);
          }
          w = ((f.op & 63) << 26) | ((tgt >>> 2) & 0x03ffffff);
        } else if (f.type === 'B') {
          const delta = ((tgt - (o.addr + 4)) >> 2);
          if (delta < -32768 || delta > 32767) throw new Error(`Branch out of range: ${f.label} (${delta})`);
          w = ((f.op & 63) << 26) | ((f.rs & 31) << 21) | ((f.rt & 31) << 16) | (delta & 0xffff);
        } else if (f.type === 'LA_HI') {
          const hi = ((tgt + 0x8000) >>> 16) & 0xffff;
          w = (0x0f << 26) | ((f.rt & 31) << 16) | hi;
        } else if (f.type === 'LA_LO') {
          const lo = tgt & 0xffff;
          w = (0x09 << 26) | ((f.rt & 31) << 21) | ((f.rt & 31) << 16) | lo;
        } else if (f.type === 'LW_LO') {
          const lo = tgt & 0xffff;
          w = (0x23 << 26) | ((f.rt & 31) << 21) | ((f.rt & 31) << 16) | lo;
        } else if (f.type === 'SW_LO') {
          const lo = tgt & 0xffff;
          w = (0x2b << 26) | ((f.rs & 31) << 21) | ((f.rt & 31) << 16) | lo;
        } else {
          throw new Error(`Unknown fixup: ${f.type}`);
        }
      }
      out.writeUInt32LE(w >>> 0, i * 4);
    }
    return out;
  }
}

// ============================================================================
// 1. Assemble Resident Bootstrapper + Trampolines (0x800E2680..0x800E27FF in SLUS)
// ============================================================================
function assembleSlusTailClean() {
  const a = new MipsAsm(ADDR.Mod_BootInit);

  a.label('Mod_BootInit');
  a.addiu(R.sp, R.sp, -64);
  a.sw(R.ra, 56, R.sp);
  a.sw(R.s0, 52, R.sp);

  // 1. Original Movies_Init()
  a.jal(SYM.Movies_Init);
  a.nop();

  // 2. g_ModLoaded = 0
  a.swSym(R.zero, R.t0, ADDR.g_ModLoaded);

  // 3. CdSearchFile(&fp @ 16($sp), "\VOICES.DAT;1")
  a.addiu(R.a0, R.sp, 16);
  a.la(R.a1, ADDR.Str_VoicesPath);
  a.jal(SYM.CdSearchFile);
  a.nop();
  a.beq(R.v0, R.zero, 'boot_done');
  a.nop();

  // 4. g_VoicesBaseLba = CdPosToInt(&fp.pos @ 16($sp))
  a.addiu(R.a0, R.sp, 16);
  a.jal(SYM.CdPosToInt);
  a.nop();
  a.swSym(R.v0, R.t0, ADDR.g_VoicesBaseLba);

  // 5. CdControl(CdlSetloc=2, &fp.pos, 0)
  a.addiu(R.a0, R.zero, 2);
  a.addiu(R.a1, R.sp, 16);
  a.jal(SYM.CdControl);
  a.move(R.a2, R.zero);

  // 6. CdRead(2 sectors, 0x800E2800, 0x80)
  a.addiu(R.a0, R.zero, 2);
  a.la(R.a1, ADDR.ModCodeBase);
  a.jal(SYM.CdRead);
  a.addiu(R.a2, R.zero, 0x80);

  // 7. Wait for CdReadSync(1, 0) <= 0
  a.label('boot_wait');
  a.addiu(R.a0, R.zero, 1);
  a.jal(SYM.CdReadSync);
  a.move(R.a1, R.zero);
  a.blez(R.v0, 'boot_loaded');
  a.nop();
  a.jal(SYM.VSync);
  a.move(R.a0, R.zero);
  a.j('boot_wait');
  a.nop();

  // 8. Check magic 0x564F4943 @ 0x800E3000
  a.label('boot_loaded');
  a.lwSym(R.v0, ADDR.VoiceTblBase);
  a.li(R.v1, 0x564F4943);
  a.bne(R.v0, R.v1, 'boot_done');
  a.nop();

  // 9. BIOS FlushCache() (A0:0x44)
  a.jal(SYM.FlushCache);
  a.nop();

  // 10. g_ModLoaded = 1
  a.addiu(R.v0, R.zero, 1);
  a.swSym(R.v0, R.t0, ADDR.g_ModLoaded);

  a.label('boot_done');
  a.lw(R.s0, 52, R.sp);
  a.lw(R.ra, 56, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 64);

  const bootEnd = a.pc();
  console.log(`  [ASM] Mod_BootInit: 0x${ADDR.Mod_BootInit.toString(16)}..0x${bootEnd.toString(16)} (${bootEnd - ADDR.Mod_BootInit} B)`);

  function emitTramp(atAddr, modEntry, fallbackAddr, tag) {
    a.padTo(atAddr);
    a.lwSym(R.t0, ADDR.g_ModLoaded);
    a.nop();
    a.beq(R.t0, R.zero, `fb_${tag}`);
    a.nop();
    a.j(modEntry);
    a.nop();
    a.label(`fb_${tag}`);
    a.j(fallbackAddr);
    a.nop();
  }

  emitTramp(ADDR.Tramp_BootMovie,      ADDR.Entry_BootMovie,      SYM.PlayFullScreenMovie,  'boot');
  emitTramp(ADDR.Tramp_PlaySelScroll,  ADDR.Entry_PlaySelScroll,  SYM.GetSelectedSkaterIdx, 'scroll');
  emitTramp(ADDR.Tramp_PlaySelConfirm, ADDR.Entry_PlaySelConfirm, SYM.SFX_Play,             'confirm');

  a.padTo(ADDR.g_VoicesBaseLba);
  a.word(0); // g_VoicesBaseLba
  a.word(0); // g_ModLoaded

  a.padTo(ADDR.Str_VoicesPath);
  a.bytes(Buffer.from('\\VOICES.DAT;1\0', 'ascii'));

  a.padTo(0x800E2800);
  const bin = a.emit();
  if (bin.length !== 0x180) throw new Error(`SLUS tail size mismatch: ${bin.length} != 384`);
  return bin;
}

// ============================================================================
// 2. Assemble Resident MODCODE Engine (0x800E2800..0x800E2FFF, Sector 0 of VOICES.DAT)
// ============================================================================
function assembleModCode() {
  const a = new MipsAsm(ADDR.ModCodeBase);

  // Fixed Entry Jump Table @ 0x800E2800
  a.j('BootRand_PlaySlot');    a.nop(); // 0x800E2800
  a.j('Hook_PlaySel_Scroll');  a.nop(); // 0x800E2808
  a.j('Hook_PlaySel_Confirm'); a.nop(); // 0x800E2810

  // --------------------------------------------------------------------------
  // Helper: XorShift32(seed in $a0) -> returns new seed in $v0 (non-zero)
  // --------------------------------------------------------------------------
  a.label('XorShift32');
  a.bne(R.a0, R.zero, 'xs_nz');
  a.move(R.v0, R.a0);
  a.li(R.v0, 0x9E3779B9);
  a.label('xs_nz');
  a.sll(R.t0, R.v0, 13);
  a.xor(R.v0, R.v0, R.t0);
  a.srl(R.t0, R.v0, 17);
  a.xor(R.v0, R.v0, R.t0);
  a.sll(R.t0, R.v0, 5);
  a.jr(R.ra);
  a.xor(R.v0, R.v0, R.t0);

  // Helper: PickOneMovie(seed in $a0) -> $v0 = newSeed, $v1 = g_MoviePool[newSeed % 20]
  a.label('PickOneMovie');
  a.addiu(R.sp, R.sp, -16);
  a.sw(R.ra, 12, R.sp);
  a.jal('XorShift32');
  a.nop();
  a.addiu(R.t0, R.zero, 20);
  a.divu(R.v0, R.t0);
  a.mfhi(R.t1);
  a.la(R.t2, 'g_MoviePool');
  a.addu(R.t2, R.t2, R.t1);
  a.lbu(R.v1, 0, R.t2);
  a.lw(R.ra, 12, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 16);

  // --------------------------------------------------------------------------
  // Helper: McReadSec60(buf128 in $a0) -> returns 0 on OK, non-zero on error/no card
  // Retries once on NEWCARD (rc == 4) after NewCardAck(0), identical to libmcrd!
  // --------------------------------------------------------------------------
  a.label('McReadSec60');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 28, R.sp);
  a.sw(R.s0, 24, R.sp);
  a.sw(R.s1, 20, R.sp);
  a.move(R.s0, R.a0);         // s0 = buf128
  a.addiu(R.s1, R.zero, 3);   // s1 = max attempts (3)

  a.label('mcr_loop');
  a.jal(SYM.ClearCardEvents);
  a.nop();
  a.move(R.a0, R.zero);       // chan = 0 (Port 1 Slot A)
  a.addiu(R.a1, R.zero, 60);  // sector = 60 (0x3C unused reserved sector!)
  a.jal(SYM._card_read);
  a.move(R.a2, R.s0);
  a.jal(SYM.WaitCardEvent);
  a.nop();
  a.beq(R.v0, R.zero, 'mcr_ret'); // 0 = IOE OK!
  a.nop();
  // If rc == 4 (NEWCARD) or rc == 3, acknowledge card and retry!
  a.addiu(R.t0, R.zero, 4);
  a.beq(R.v0, R.t0, 'mcr_ack');
  a.addiu(R.t0, R.zero, 3);
  a.bne(R.v0, R.t0, 'mcr_ret'); // Timeout (no card) or hard error -> return immediately!
  a.nop();

  a.label('mcr_ack');
  a.addiu(R.s1, R.s1, -1);
  a.blez(R.s1, 'mcr_ret');
  a.nop();
  a.jal(SYM.ClearCardEvents);
  a.nop();
  a.jal(SYM.NewCardAck);
  a.move(R.a0, R.zero);
  a.jal(SYM.WaitCardEvent);
  a.nop();
  a.j('mcr_loop');
  a.nop();

  a.label('mcr_ret');
  a.lw(R.s1, 20, R.sp);
  a.lw(R.s0, 24, R.sp);
  a.lw(R.ra, 28, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 32);

  // --------------------------------------------------------------------------
  // Helper: McWriteSec60(buf128 in $a0) -> returns 0 on OK
  // --------------------------------------------------------------------------
  a.label('McWriteSec60');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 28, R.sp);
  a.sw(R.s0, 24, R.sp);
  a.sw(R.s1, 20, R.sp);
  a.move(R.s0, R.a0);
  a.addiu(R.s1, R.zero, 2);

  a.label('mcw_loop');
  a.jal(SYM.ClearCardEvents);
  a.nop();
  a.move(R.a0, R.zero);
  a.addiu(R.a1, R.zero, 60);
  a.jal(SYM._card_write);
  a.move(R.a2, R.s0);
  a.jal(SYM.WaitCardEvent);
  a.nop();
  a.beq(R.v0, R.zero, 'mcw_ret');
  a.nop();
  a.addiu(R.t0, R.zero, 4);
  a.bne(R.v0, R.t0, 'mcw_ret');
  a.nop();
  a.addiu(R.s1, R.s1, -1);
  a.blez(R.s1, 'mcw_ret');
  a.nop();
  a.jal(SYM.ClearCardEvents);
  a.nop();
  a.jal(SYM.NewCardAck);
  a.move(R.a0, R.zero);
  a.jal(SYM.WaitCardEvent);
  a.nop();
  a.j('mcw_loop');
  a.nop();

  a.label('mcw_ret');
  a.lw(R.s1, 20, R.sp);
  a.lw(R.s0, 24, R.sp);
  a.lw(R.ra, 28, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 32);

  // --------------------------------------------------------------------------
  // 1. BootRand_PlaySlot(int origArg)  [origArg = -1 (Acti), -2 (Never), -3 (Intro)]
  // --------------------------------------------------------------------------
  a.label('BootRand_PlaySlot');
  a.addiu(R.sp, R.sp, -192);
  a.sw(R.ra, 184, R.sp);
  a.sw(R.s0, 180, R.sp);
  a.sw(R.s1, 176, R.sp);
  a.sw(R.s2, 172, R.sp);
  a.sw(R.s3, 168, R.sp);
  a.sw(R.s4, 164, R.sp);
  a.sw(R.s5, 160, R.sp);
  // slot = ~origArg  (-1 -> 0, -2 -> 1, -3 -> 2)
  a.nor(R.s0, R.zero, R.a0);
  // Sanity: if slot >= 3, call original directly!
  a.sltiu(R.t0, R.s0, 3);
  a.beq(R.t0, R.zero, 'br_fallback_orig');
  a.move(R.s5, R.a0); // save origArg in s5 just in case

  // Check if g_BootPicked != 0
  a.lwSym(R.v0, 'g_BootPicked');
  a.nop();
  a.bne(R.v0, R.zero, 'br_play_slot');
  a.nop();

  // ---- First boot slot: gather true persistent + hardware entropy ----
  // Hardware entropy: Root Counters 0, 1, 2 (0x1F801100/10/20) + VSync(-1)
  a.jal(SYM.VSync);
  a.addiu(R.a0, R.zero, -1);
  a.move(R.s1, R.v0);          // s1 = hwEntropy
  a.lui(R.t0, 0x1F80);
  a.lhu(R.t1, 0x1100, R.t0);
  a.lhu(R.t2, 0x1110, R.t0);
  a.lhu(R.t3, 0x1120, R.t0);
  a.sll(R.t2, R.t2, 11);
  a.sll(R.t3, R.t3, 21);
  a.xor(R.s1, R.s1, R.t1);
  a.xor(R.s1, R.s1, R.t2);
  a.xor(R.s1, R.s1, R.t3);

  // Stack 128-byte MC buffer @ 16($sp)..143($sp)
  // Zero it first
  a.addiu(R.t0, R.sp, 16);
  a.addiu(R.t1, R.sp, 144);
  a.label('br_zbuf');
  a.sw(R.zero, 0, R.t0);
  a.addiu(R.t0, R.t0, 4);
  a.bne(R.t0, R.t1, 'br_zbuf');
  a.nop();

  // Default state if MC absent or first boot
  a.addiu(R.s2, R.zero, 1);    // s2 = bootCounter = 1
  a.li(R.s3, 0x9E3779B9);      // s3 = seed
  a.addiu(R.s4, R.zero, 0xFF); // s4 = prevVideo0 (none)

  // Try reading MC Slot 1 Sector 60
  a.jal('McReadSec60');
  a.addiu(R.a0, R.sp, 16);
  a.move(R.s5, R.v0);          // s5 = mcReadOk (0 = card present!)
  a.bne(R.s5, R.zero, 'br_mix_seed');
  a.nop();

  // Card read OK! Check magic "THRN" = 0x5448524E at 16($sp)
  a.lw(R.t0, 16, R.sp);
  a.li(R.t1, 0x5448524E);
  a.bne(R.t0, R.t1, 'br_mc_fresh');
  a.nop();

  // Existing persistent state found on Memory Card!
  a.lw(R.s2, 20, R.sp);        // bootCounter
  a.lw(R.s3, 24, R.sp);        // lastSeed
  a.lw(R.s4, 28, R.sp);        // prevVideo0
  a.nop();
  a.addiu(R.s2, R.s2, 1);      // bootCounter++
  a.j('br_mix_seed');
  a.nop();

  a.label('br_mc_fresh');
  // Re-zero buffer cleanly before writing our 16-byte header
  a.addiu(R.t0, R.sp, 16);
  a.addiu(R.t1, R.sp, 144);
  a.label('br_zbuf2');
  a.sw(R.zero, 0, R.t0);
  a.addiu(R.t0, R.t0, 4);
  a.bne(R.t0, R.t1, 'br_zbuf2');
  a.nop();

  // Mix bootCounter * 0x9E3779B1 ^ lastSeed ^ hwEntropy ^ 0xA5A55A5A
  a.label('br_mix_seed');
  a.li(R.t0, 0x9E3779B1);
  a.multu(R.s2, R.t0);
  a.mflo(R.t1);
  a.xor(R.s3, R.s3, R.t1);
  a.xor(R.s3, R.s3, R.s1);
  a.li(R.t0, 0xA5A55A5A);
  a.xor(R.s3, R.s3, R.t0);

  // Run 4 rounds of XorShift32 so consecutive boots diverge completely
  a.addiu(R.t4, R.zero, 4);
  a.label('br_xs4');
  a.jal('XorShift32');
  a.move(R.a0, R.s3);
  a.move(R.s3, R.v0);
  a.addiu(R.t4, R.t4, -1);
  a.bne(R.t4, R.zero, 'br_xs4');
  a.nop();

  // Pick 3 DISTINCT movies from the 20-video pool, with slot 0 != prevVideo0!
  // Step A: pick slot 0 (must differ from s4 = prevVideo0)
  a.label('br_pick0');
  a.jal('PickOneMovie');
  a.move(R.a0, R.s3);
  a.move(R.s3, R.v0);
  a.beq(R.v1, R.s4, 'br_pick0'); // never repeat previous boot's first video!
  a.nop();
  a.la(R.t2, 'g_BootSlots');
  a.sb(R.v1, 0, R.t2);          // g_BootSlots[0] = movieIdx0
  a.move(R.s4, R.v1);           // s4 = movieIdx0 (to save as new prevVideo0!)

  // Step B: pick slot 1 (must differ from movieIdx0 in s4)
  a.label('br_pick1');
  a.jal('PickOneMovie');
  a.move(R.a0, R.s3);
  a.move(R.s3, R.v0);
  a.beq(R.v1, R.s4, 'br_pick1');
  a.nop();
  a.la(R.t2, 'g_BootSlots');
  a.sb(R.v1, 1, R.t2);
  a.move(R.s1, R.v1);           // s1 = movieIdx1

  // Step C: pick slot 2 (must differ from s4 and s1)
  a.label('br_pick2');
  a.jal('PickOneMovie');
  a.move(R.a0, R.s3);
  a.move(R.s3, R.v0);
  a.beq(R.v1, R.s4, 'br_pick2');
  a.nop();
  a.beq(R.v1, R.s1, 'br_pick2');
  a.nop();
  a.la(R.t2, 'g_BootSlots');
  a.sb(R.v1, 2, R.t2);

  // Also seed starting voice indices from s3 so even the first voice clip varies across boots!
  a.lwSym(R.t0, ADDR.VoiceTblBase + 4); // lulaoCount
  a.nop();
  a.beq(R.t0, R.zero, 'br_skip_vseed');
  a.nop();
  a.divu(R.s3, R.t0);
  a.mfhi(R.t1);
  a.swSym(R.t1, R.t2, 'g_LulaoClipIdx');
  a.label('br_skip_vseed');

  a.lwSym(R.t0, ADDR.VoiceTblBase + 8); // bolsoCount
  a.nop();
  a.beq(R.t0, R.zero, 'br_skip_vseed2');
  a.nop();
  a.srl(R.t3, R.s3, 8);
  a.divu(R.t3, R.t0);
  a.mfhi(R.t1);
  a.swSym(R.t1, R.t2, 'g_BolsoClipIdx');
  a.label('br_skip_vseed2');

  // If MC was present (s5 == 0), persist updated (magic, bootCounter, seed, prevVideo0) to Sector 60!
  a.bne(R.s5, R.zero, 'br_mark_done');
  a.nop();
  a.li(R.t0, 0x5448524E);
  a.sw(R.t0, 16, R.sp);         // magic
  a.sw(R.s2, 20, R.sp);         // bootCounter
  a.sw(R.s3, 24, R.sp);         // seed
  a.sw(R.s4, 28, R.sp);         // prevVideo0 (slot 0 movieIdx)
  a.jal('McWriteSec60');
  a.addiu(R.a0, R.sp, 16);

  a.label('br_mark_done');
  a.addiu(R.t0, R.zero, 1);
  a.swSym(R.t0, R.t1, 'g_BootPicked');

  // ---- Play g_BootSlots[slot] via PlayFullScreenMovie(~movieIdx) ----
  a.label('br_play_slot');
  a.addiu(R.t0, R.zero, 2);
  a.bne(R.s0, R.t0, 'br_keep_picked');
  a.nop();
  a.swSym(R.zero, R.t1, 'g_BootPicked');
  a.label('br_keep_picked');
  a.la(R.t0, 'g_BootSlots');
  a.addu(R.t0, R.t0, R.s0);
  a.lbu(R.t1, 0, R.t0);         // t1 = movieIdx (2 or 16..34)
  a.nop();
  a.nor(R.a0, R.zero, R.t1);    // a0 = ~movieIdx (negative arg expected by Movies_Select!)
  a.jal(SYM.PlayFullScreenMovie);
  a.nop();
  a.j('br_exit');
  a.nop();

  a.label('br_fallback_orig');
  a.jal(SYM.PlayFullScreenMovie);
  a.move(R.a0, R.s5);

  a.label('br_exit');
  a.lw(R.s5, 160, R.sp);
  a.lw(R.s4, 164, R.sp);
  a.lw(R.s3, 168, R.sp);
  a.lw(R.s2, 172, R.sp);
  a.lw(R.s1, 176, R.sp);
  a.lw(R.s0, 180, R.sp);
  a.lw(R.ra, 184, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 192);

  // --------------------------------------------------------------------------
  // 2. SkaterVoice_Stop() — Cleanly silences SPU Hardware Voice 23
  // --------------------------------------------------------------------------
  a.label('SkaterVoice_Stop');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 16, R.sp);
  a.move(R.a0, R.zero);         // SPU_OFF = 0
  a.lui(R.a1, 0x0080);          // 1 << 23 = 0x00800000
  a.jal(SYM.SpuSetKey);
  a.nop();
  a.lw(R.ra, 16, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // 3. SkaterVoice_Play(int skaterIdx)  [skaterIdx = 2 (Lulao) or 3 (Bolsonaro)]
  // --------------------------------------------------------------------------
  a.label('SkaterVoice_Play');
  a.addiu(R.sp, R.sp, -64);
  a.sw(R.ra, 56, R.sp);
  a.sw(R.s0, 52, R.sp);
  a.sw(R.s1, 48, R.sp);
  a.sw(R.s2, 44, R.sp);
  a.sw(R.s3, 40, R.sp);
  a.sw(R.s4, 36, R.sp);
  a.sw(R.s5, 32, R.sp);
  a.sw(R.s6, 28, R.sp);

  a.move(R.s0, R.a0);           // s0 = skaterIdx (2 or 3)

  // Immediately stop any currently playing voice clip on Voice 23
  a.jal('SkaterVoice_Stop');
  a.nop();

  // Select entry index & advance rotating counter for Lulao (2) or Bolsonaro (3)
  a.lwSym(R.s1, ADDR.VoiceTblBase + 4); // s1 = lulaoCount
  a.lwSym(R.s2, ADDR.VoiceTblBase + 8); // s2 = bolsoCount
  a.addiu(R.t0, R.zero, 2);
  a.beq(R.s0, R.t0, 'vp_lulao');
  a.addiu(R.t0, R.zero, 3);
  a.beq(R.s0, R.t0, 'vp_bolso');
  a.nop();
  a.j('vp_done');
  a.nop();

  a.label('vp_lulao');
  a.beq(R.s1, R.zero, 'vp_done');
  a.nop();
  a.lwSym(R.t1, 'g_LulaoClipIdx');
  a.nop();
  // Ensure t1 < lulaoCount
  a.sltu(R.t2, R.t1, R.s1);
  a.bne(R.t2, R.zero, 'vp_l_ok');
  a.nop();
  a.move(R.t1, R.zero);
  a.label('vp_l_ok');
  a.move(R.s3, R.t1);           // s3 = tableEntryIdx (0 .. lulaoCount-1)
  a.addiu(R.t1, R.t1, 1);
  a.bne(R.t1, R.s1, 'vp_l_st');
  a.nop();
  a.move(R.t1, R.zero);
  a.label('vp_l_st');
  a.swSym(R.t1, R.t2, 'g_LulaoClipIdx');
  a.j('vp_fetch');
  a.nop();

  a.label('vp_bolso');
  a.beq(R.s2, R.zero, 'vp_done');
  a.nop();
  a.lwSym(R.t1, 'g_BolsoClipIdx');
  a.nop();
  a.sltu(R.t2, R.t1, R.s2);
  a.bne(R.t2, R.zero, 'vp_b_ok');
  a.nop();
  a.move(R.t1, R.zero);
  a.label('vp_b_ok');
  a.addu(R.s3, R.s1, R.t1);     // s3 = lulaoCount + clipIdx
  a.addiu(R.t1, R.t1, 1);
  a.bne(R.t1, R.s2, 'vp_b_st');
  a.nop();
  a.move(R.t1, R.zero);
  a.label('vp_b_st');
  a.swSym(R.t1, R.t2, 'g_BolsoClipIdx');

  // Lookup clip descriptor at VOICETBL + 0x10 + s3 * 16
  a.label('vp_fetch');
  a.sll(R.t0, R.s3, 4);
  a.la(R.t1, ADDR.VoiceTblBase + 0x10);
  a.addu(R.s1, R.t1, R.t0);     // s1 = &entry
  a.lw(R.s2, 0, R.s1);          // s2 = sectorOffset
  a.lw(R.s3, 4, R.s1);          // s3 = sectorCount
  a.lw(R.s4, 8, R.s1);          // s4 = byteSize
  // Load spuPitch later from 12($s1)
  a.nop();
  a.beq(R.s3, R.zero, 'vp_done');
  a.nop();

  // Allocate temporary Main RAM buffer: Mem_Alloc(sectorCount * 2048, 0, 1, 0)
  a.sll(R.a0, R.s3, 11);
  a.move(R.a1, R.zero);
  a.addiu(R.a2, R.zero, 1);
  a.jal(SYM.Mem_Alloc);
  a.move(R.a3, R.zero);
  a.beq(R.v0, R.zero, 'vp_done');
  a.move(R.s6, R.v0);           // s6 = ramBuf

  // Wait for any in-flight async CD.WAD read to complete first (prevents race!)
  a.jal(SYM.CDWAD_WaitIdle);
  a.nop();

  // Check if COMPILED.XA is currently playing: (14704($gp) != 0 && 14712($gp) == 0)
  a.move(R.s5, R.zero);         // s5 = wasXAPlaying
  a.lw(R.t0, 14704, R.gp);
  a.lw(R.t1, 14712, R.gp);
  a.nop();
  a.beq(R.t0, R.zero, 'vp_cd_read');
  a.nop();
  a.bne(R.t1, R.zero, 'vp_cd_read');
  a.nop();
  // Pause XA cleanly!
  a.addiu(R.s5, R.zero, 1);
  a.jal(SYM.XA_Pause);
  a.addiu(R.a0, R.zero, 1);

  // Compute absolute LBA = g_VoicesBaseLba + sectorOffset -> CdlLOC @ 16($sp)
  a.label('vp_cd_read');
  a.lwSym(R.t0, ADDR.g_VoicesBaseLba);
  a.nop();
  a.addu(R.a0, R.t0, R.s2);
  a.jal(SYM.CdIntToPos);
  a.addiu(R.a1, R.sp, 16);

  // CdControl(CdlSetloc=2, &loc @ 16($sp), 0)
  a.addiu(R.a0, R.zero, 2);
  a.addiu(R.a1, R.sp, 16);
  a.jal(SYM.CdControl);
  a.move(R.a2, R.zero);

  // CdRead(sectorCount, ramBuf, 0x80 = CdlModeSpeed)
  a.move(R.a0, R.s3);
  a.move(R.a1, R.s6);
  a.jal(SYM.CdRead);
  a.addiu(R.a2, R.zero, 0x80);

  // Wait for CD read completion
  a.label('vp_cd_wait');
  a.addiu(R.a0, R.zero, 1);
  a.jal(SYM.CdReadSync);
  a.move(R.a1, R.zero);
  a.blez(R.v0, 'vp_cd_done');
  a.nop();
  a.jal(SYM.VSync);
  a.move(R.a0, R.zero);
  a.j('vp_cd_wait');
  a.nop();

  // Resume COMPILED.XA if it was playing! (XA_SetMode restores CdlSetmode 0xC8 + XA_Pause(0) seeks & resumes!)
  a.label('vp_cd_done');
  a.beq(R.s5, R.zero, 'vp_spu_dma');
  a.nop();
  a.jal(SYM.XA_SetMode);
  a.nop();
  a.jal(SYM.XA_Pause);
  a.move(R.a0, R.zero);

  // DMA upload ramBuf -> SPU RAM 0x58000
  a.label('vp_spu_dma');
  a.li(R.a0, ADDR.SpuVoiceBuf);
  a.jal(SYM.SpuSetTransferStartAddr);
  a.nop();

  a.move(R.a0, R.s6);
  a.jal(SYM.SpuWrite);
  a.move(R.a1, R.s4);

  a.jal(SYM.SpuIsTransferCompleted);
  a.addiu(R.a0, R.zero, 1);

  // Immediately free temporary Main RAM buffer!
  a.jal(SYM.Mem_Free);
  a.move(R.a0, R.s6);

  // Program PS1 SPU Hardware Voice 23 registers directly @ 0x1F801D70!
  a.lui(R.t0, 0x1F80);          // t0 = 0x1F800000
  // Clear PMON, NON, EON bit 23 (bit 7 of upper halfwords 0x1D92, 0x1D96, 0x1D9A)
  a.lhu(R.t1, 0x1D92, R.t0);
  a.lhu(R.t2, 0x1D96, R.t0);
  a.lhu(R.t3, 0x1D9A, R.t0);
  a.andi(R.t1, R.t1, 0xFF7F);
  a.andi(R.t2, R.t2, 0xFF7F);
  a.andi(R.t3, R.t3, 0xFF7F);
  a.sh(R.t1, 0x1D92, R.t0);
  a.sh(R.t2, 0x1D96, R.t0);
  a.sh(R.t3, 0x1D9A, R.t0);

  // Voice 23 regs @ 0x1F801D70:
  a.addiu(R.t1, R.zero, 0x3FFF); // Full clean stereo volume (0x3FFF L & R)
  a.sh(R.t1, 0x1D70, R.t0);      // Vol L
  a.sh(R.t1, 0x1D72, R.t0);      // Vol R

  a.lw(R.t2, 12, R.s1);          // spuPitch (0x0400 = 11025 Hz)
  a.nop();
  a.sh(R.t2, 0x1D74, R.t0);      // Pitch

  a.li(R.t3, ADDR.SpuVoiceBuf >>> 3); // Start addr / 8 = 0xB000
  a.sh(R.t3, 0x1D76, R.t0);      // Start Addr

  a.addiu(R.t1, R.zero, 0x00FF); // ADSR1: instant attack, max sustain level
  a.sh(R.t1, 0x1D78, R.t0);
  a.addiu(R.t1, R.zero, 0x1FC0); // ADSR2: flat sustain, instant release
  a.sh(R.t1, 0x1D7A, R.t0);

  // Repeat addr / 8 = (SpuVoiceBuf + byteSize - 16) >> 3 (trailing silent block!)
  a.li(R.t2, ADDR.SpuVoiceBuf);
  a.addu(R.t2, R.t2, R.s4);
  a.addiu(R.t2, R.t2, -16);
  a.srl(R.t2, R.t2, 3);
  a.sh(R.t2, 0x1D7E, R.t0);      // Repeat Addr

  // Trigger Key On on Voice 23: SpuSetKey(1, 0x00800000)
  a.addiu(R.a0, R.zero, 1);
  a.lui(R.a1, 0x0080);
  a.jal(SYM.SpuSetKey);
  a.nop();

  a.label('vp_done');
  a.lw(R.s6, 28, R.sp);
  a.lw(R.s5, 32, R.sp);
  a.lw(R.s4, 36, R.sp);
  a.lw(R.s3, 40, R.sp);
  a.lw(R.s2, 44, R.sp);
  a.lw(R.s1, 48, R.sp);
  a.lw(R.s0, 52, R.sp);
  a.lw(R.ra, 56, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 64);

  // --------------------------------------------------------------------------
  // 4. Hook_PlaySel_Scroll(void* g_Career)  [replaces playsel.bin +0x3388 jal 0x8008A3A8]
  // --------------------------------------------------------------------------
  a.label('Hook_PlaySel_Scroll');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 24, R.sp);
  a.sw(R.s0, 20, R.sp);

  // Call original GetSelectedSkaterIdx(a0)
  a.jal(SYM.GetSelectedSkaterIdx);
  a.nop();
  a.move(R.s0, R.v0);            // s0 = new highlighted skaterIdx

  // If Lulao (2) or Bolsonaro (3) -> play next rotating voice clip!
  a.addiu(R.t0, R.zero, 2);
  a.beq(R.s0, R.t0, 'hs_play');
  a.addiu(R.t0, R.zero, 3);
  a.beq(R.s0, R.t0, 'hs_play');
  a.nop();

  // Otherwise (scrolled onto any other skater) -> stop Voice 23 cleanly
  a.jal('SkaterVoice_Stop');
  a.nop();
  a.j('hs_ret');
  a.nop();

  a.label('hs_play');
  a.jal('SkaterVoice_Play');
  a.move(R.a0, R.s0);

  a.label('hs_ret');
  a.move(R.v0, R.s0);            // return original skaterIdx in $v0!
  a.lw(R.s0, 20, R.sp);
  a.lw(R.ra, 24, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 32);

  // --------------------------------------------------------------------------
  // 5. Hook_PlaySel_Confirm(sfxId, vol, pan)  [replaces playsel.bin +0x100C jal 0x800526B4]
  // --------------------------------------------------------------------------
  a.label('Hook_PlaySel_Confirm');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 24, R.sp);
  a.sw(R.s0, 20, R.sp);

  // Call original SFX_Play(a0, a1, a2) (confirm chime!)
  a.jal(SYM.SFX_Play);
  a.nop();
  a.move(R.s0, R.v0);            // preserve original return value

  // Query confirmed skaterIdx = GetSelectedSkaterIdx(0x800C2958)
  a.la(R.a0, SYM.g_Career);
  a.jal(SYM.GetSelectedSkaterIdx);
  a.nop();

  a.addiu(R.t0, R.zero, 2);
  a.beq(R.v0, R.t0, 'hc_play');
  a.addiu(R.t0, R.zero, 3);
  a.bne(R.v0, R.t0, 'hc_ret');
  a.nop();

  a.label('hc_play');
  a.jal('SkaterVoice_Play');
  a.move(R.a0, R.v0);

  a.label('hc_ret');
  a.move(R.v0, R.s0);
  a.lw(R.s0, 20, R.sp);
  a.lw(R.ra, 24, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 32);

  // --------------------------------------------------------------------------
  // Resident Mod Data & State Variables (inside 0x800E2800..0x800E2FFF)
  // --------------------------------------------------------------------------
  a.align(4);
  a.label('g_BootPicked');   a.word(0);
  a.label('g_LulaoClipIdx'); a.word(0);
  a.label('g_BolsoClipIdx'); a.word(0);
  a.label('g_BootSlots');    a.bytes(Buffer.from([2, 17, 18, 0])); // fallback triple

  // All 20 custom full-screen videos on disc: INTRO.STR (2) + all 19 X\*.STR (16..34)
  a.label('g_MoviePool');
  a.bytes(Buffer.from([
    2, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
  ]));

  const usedBytes = a.pc() - ADDR.ModCodeBase;
  if (usedBytes > 2048) throw new Error(`MODCODE excede 2048 B (${usedBytes} B)!`);
  console.log(`  [ASM] MODCODE: 0x${ADDR.ModCodeBase.toString(16)}..0x${a.pc().toString(16)} (${usedBytes} B / 2048 B, livre: ${2048 - usedBytes} B)`);

  a.padTo(ADDR.ModCodeBase + 2048);
  return a.emit();
}

// ============================================================================
// Helper to patch a 32-bit word with strict original/idempotent verification
// ============================================================================
function patchWord(buf, fileOff, expectedOrig, newVal, desc) {
  const cur = buf.readUInt32LE(fileOff);
  if (cur !== expectedOrig && cur !== newVal) {
    throw new Error(
      `Mismatch em ${desc} (off 0x${fileOff.toString(16)}): atual=0x${cur.toString(16)}, esperado orig=0x${expectedOrig.toString(16)} ou novo=0x${newVal.toString(16)}`
    );
  }
  buf.writeUInt32LE(newVal >>> 0, fileOff);
  console.log(`  [PATCH] ${desc.padEnd(44)} 0x${expectedOrig.toString(16).padStart(8,'0')} -> 0x${(newVal>>>0).toString(16).padStart(8,'0')}`);
}

function jalWord(target) {
  return (0x0C000000 | ((target >>> 2) & 0x03FFFFFF)) >>> 0;
}

// ============================================================================
// Main Execution
// ============================================================================
function applyAll() {
  console.log('=== THPS2 PS1 Surgical MIPS Patcher: Random Boot Videos + Skater Select Voices ===\n');

  // 0. Ensure clean backups exist in originals_backup/
  fs.mkdirSync(backupDir, { recursive: true });
  for (const fn of ['SLUS_010.66', 'CD.WAD']) {
    const bak = path.join(backupDir, fn);
    if (!fs.existsSync(bak)) {
      fs.copyFileSync(path.join(rootDir, fn), bak);
      console.log(`  [BACKUP] Salvo original em ${bak}`);
    }
  }

  // 1. Assemble SLUS tail (0x800E2680..0x800E27FF) & MODCODE (0x800E2800..0x800E2FFF)
  const slusTail = assembleSlusTailClean();
  const modCode = assembleModCode();

  // 2. Build/update VOICES.DAT with assembled MODCODE in Sector 0 + VOICETBL in Sector 1 + 28 SPU clips
  console.log('');
  const manifest = buildVoicesBank(modCode, false);

  // 3. Patch SLUS_010.66 (exact same file size 864,256 B!)
  console.log('\n=== Aplicando Hooks Cirurgicos em SLUS_010.66 ===');
  const slus = fs.readFileSync(slusPath);
  const ramToOff = (ram) => (ram - SLUS_BASE) + SLUS_HDR;

  patchWord(slus, ramToOff(0x800E2674), 0x800E2678, ADDR.NewHeapStart,            'HeapStartPtr @ 0x800E2674');
  patchWord(slus, ramToOff(0x800A2950), 0x24842674, 0x24843800,                   'InitHeap addiu @ 0x800A2950');
  patchWord(slus, ramToOff(0x80053690), 0x28620018, 0x28620017,                   'Reserve SPU Voice 23 @ 0x80053690');
  patchWord(slus, ramToOff(0x8006CAD4), jalWord(SYM.Movies_Init),         jalWord(ADDR.Mod_BootInit),      'Hook Movies_Init @ 0x8006CAD4');
  patchWord(slus, ramToOff(0x8003CFB0), jalWord(SYM.PlayFullScreenMovie), jalWord(ADDR.Tramp_BootMovie),   'Boot Slot 0 (Activision) @ 0x8003CFB0');
  patchWord(slus, ramToOff(0x8003CFE8), jalWord(SYM.PlayFullScreenMovie), jalWord(ADDR.Tramp_BootMovie),   'Boot Slot 1 (Neversoft)  @ 0x8003CFE8');
  patchWord(slus, ramToOff(0x8003D024), jalWord(SYM.PlayFullScreenMovie), jalWord(ADDR.Tramp_BootMovie),   'Boot Slot 2 (Intro)      @ 0x8003D024');

  // Copy 384-byte bootstrapper + trampolines into 0x800E2680..0x800E27FF
  slusTail.copy(slus, ramToOff(ADDR.Mod_BootInit));
  fs.writeFileSync(slusPath, slus);
  console.log(`  [OK] SLUS_010.66 gravado (${slus.length} B — tamanho 100% preservado!)`);

  // 4. Patch playsel.bin inside CD.WAD (entry 61, verified offset via CD.HED!)
  console.log('\n=== Aplicando Hooks Cirurgicos em playsel.bin (CD.WAD idx=61) ===');
  const hed = fs.readFileSync(hedPath);
  const playselHash = hed.readUInt32LE(61 * 12);
  const playselOff  = hed.readUInt32LE(61 * 12 + 4);
  const playselSz   = hed.readUInt32LE(61 * 12 + 8);
  if (playselHash !== 0xD09507D4 || playselSz !== 31640) {
    throw new Error(`CD.HED[61] nao e playsel.bin esperado: hash=0x${playselHash.toString(16)}, sz=${playselSz}`);
  }
  const wad = fs.readFileSync(wadPath);
  patchWord(wad, playselOff + 0x3388, jalWord(SYM.GetSelectedSkaterIdx), jalWord(ADDR.Tramp_PlaySelScroll),  'playsel.bin Scroll  +0x3388');
  patchWord(wad, playselOff + 0x100C, jalWord(SYM.SFX_Play),             jalWord(ADDR.Tramp_PlaySelConfirm), 'playsel.bin Confirm +0x100C');
  fs.writeFileSync(wadPath, wad);
  console.log(`  [OK] CD.WAD gravado (${wad.length} B — todos os offsets 100% preservados!)`);

  return { slusTail, modCode, manifest };
}

module.exports = { applyAll, ADDR, SYM, jalWord, assembleSlusTailClean, assembleModCode };

if (require.main === module) {
  applyAll();
}
