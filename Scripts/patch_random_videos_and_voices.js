#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) MIPS R3000A Runtime Patcher (v2):
 *   1. Randomized Boot Videos with EXACT Original Slot Durations (Activision + Neversoft + Intro):
 *      - Uses persistent PS1 Memory Card Slot 1 Sector 60 (0x3C) boot counter +
 *        hardware Root Counters (0x1F801100/10/20) + VSync(-1) + xorshift32 PRNG
 *        so EVERY cold boot in DuckStation plays 3 DIFFERENT random custom videos
 *        from all 20 full-screen custom videos (INTRO.STR + all 19 X\*.STR).
 *      - Temporarily clamps g_MovieTable[pickedIdx].num_frames to the EXACT original
 *        frame duration of the boot slot being played:
 *          * Slot 0 (Activision): 208 frames (13.87 s)
 *          * Slot 1 (Neversoft):  266 frames (17.73 s)
 *          * Slot 2 (Intro):      up to 1486 frames (99.07 s)
 *        and IMMEDIATELY restores original full num_frames after playback so skater
 *        career ending videos (0x8003CC7C) still play at 100% full length!
 *
 *   2. Skater Select Voice Clips for Lulao (idx 2) & Bolsonaro (idx 3) + Background Music Ducking:
 *      - Loads resident MODCODE (2048 B -> 0x800E2800) + VOICETBL (2048 B -> 0x800E3000)
 *        once at boot from \VOICES.DAT;1 (calling BIOS FlushCache A0:0x44).
 *      - Reserves 0x800E2678..0x800E37FF below THPS2's heap (0x800E3800) with ZERO
 *        change to SLUS_010.66 file size and ZERO LBA shift on all 48 original ISO files!
 *      - Reserves SPU Hardware Voice 23 exclusively for skater voices (SFX uses 0..22).
 *      - Hooks playsel.bin +0x3388 (Left/Right scroll) & +0x100C (Confirm X) — both verified
 *        outside playsel.rel!
 *      - Hooks XA_UpdateVolume CdMix (0x80038950) & Overlay_Run playsel (0x80082B80):
 *        automatically lowers COMPILED.XA background music to 25% (-12 dB) whenever inside
 *        Skater Select (23464($gp) == 2) so Lulao & Bolsonaro voices stand out crystal clear,
 *        and restores 100% full music volume automatically upon leaving Skater Select!
 */

const fs = require('fs');
const path = require('path');
const { buildVoicesBank } = require('./build_skater_voices');

const rootDir = path.resolve(__dirname, '..');
const slusPath = path.join(rootDir, 'SLUS_010.66');
const wadPath = path.join(rootDir, 'CD.WAD');
const hedPath = path.join(rootDir, 'CD.HED');
const backupDir = path.join(rootDir, 'originals_backup');

const SLUS_BASE = 0x80010000;
const SLUS_HDR = 0x800;

// ============================================================================
// Verified SLUS_010.66 Resident Function & Data Addresses
// ============================================================================
const SYM = {
  Movies_Init:            0x8007A6B4,
  PlayFullScreenMovie:    0x8007A804,
  Overlay_Run:            0x80023418,
  GetSelectedSkaterIdx:   0x8008A3A8,
  SFX_Play:               0x800526B4,
  SFX_FindGlobal:         0x80053A04,
  Mem_Alloc:              0x8005515C,
  Mem_Free:               0x800551A8,
  CDWAD_WaitIdle:         0x800544C4,
  XA_SetMode:             0x800387A8,
  XA_UpdateVolume:        0x80038804,
  XA_Pause:               0x80038D60,
  CdSearchFile:           0x800A0D28,
  CdMix:                  0x800A0C80,
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
  g_MovieTable:           0x800C1CB4, // stride 36 bytes, +14 = uint16 num_frames
  g_Career:               0x800C2958,
};

// Fixed Mod RAM Addresses (reserved below heap 0x800E3800)
const ADDR = {
  HeapStartPtr:        0x800E2674,
  NewHeapStart:        0x800E3800,
  Mod_BootInit:        0x800E2680,
  Tramp_BootMovie:     0x800E2734,
  Tramp_PlaySelScroll: 0x800E2744,
  Tramp_PlaySelConfirm:0x800E2754,
  Tramp_RunPlaySel:    0x800E2764,
  Tramp_Dispatch:      0x800E2774,
  Hook_CdMix:          0x800E2798, // 44 B (0x800E2798..0x800E27C3)
  g_VoicesBaseLba:     0x800E27C4,
  g_ModLoaded:         0x800E27C8,
  Str_VoicesPath:      0x800E27CC, // "\VOICES.DAT;1\0" (14 B -> padded 16 B to 0x800E27DC)
  g_InPlaySel:         0x800E27DC, // Dedicated 4-byte flag (1 while inside playsel.bin; NEVER touches 23464($gp)!)
  Tramp_BailSfx:       0x800E27E0, // 4-word (16 B) trampoline -> Hook_BailSfx @ 0x800E3200
  g_BailScreamIdx:     0x800E27F0, // Dedicated 4-byte strict round-robin index (0..8)
  g_LastBailFrame:     0x800E27F4, // Dedicated 4-byte VSync(-1) frame timestamp for anti-overlap cooldown
  ModCodeBase:         0x800E2800, // Sector 0 of VOICES.DAT (2048 B)
  Entry_BootMovie:     0x800E2800,
  Entry_PlaySelScroll: 0x800E2808,
  Entry_PlaySelConfirm:0x800E2810,
  Entry_RunPlaySel:    0x800E2818,
  VoiceTblBase:        0x800E3000, // Sector 1 of VOICES.DAT (0x800E3000..0x800E31FF = VOICETBL)
  Hook_BailSfx:        0x800E3200, // Sector 1 upper region (0x800E3200..0x800E37FF = 1536 B resident Bail Round-Robin code!)
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
    this.ops = [];
    this.labels = new Map();
  }
  pc() { return (this.base + this.ops.length * 4) >>> 0; }
  label(name) {
    if (this.labels.has(name)) throw new Error(`Duplicate label: ${name}`);
    this.labels.set(name, this.pc());
  }
  align(n) { while ((this.pc() % n) !== 0) this.word(0); }
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

  j(t)              { this._j(0x02, t); }
  jal(t)            { this._j(0x03, t); }
  beq(rs, rt, lbl)  { this._br(0x04, rs, rt, lbl); }
  bne(rs, rt, lbl)  { this._br(0x05, rs, rt, lbl); }
  blez(rs, lbl)     { this._br(0x06, rs, 0, lbl); }
  bgtz(rs, lbl)     { this._br(0x07, rs, 0, lbl); }
  bltz(rs, lbl)     { this._br(0x01, rs, 0, lbl); }
  bgez(rs, lbl)     { this._br(0x01, rs, 1, lbl); }

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
// 1. Assemble Resident Bootstrapper + 4 Trampolines + Hook_CdMix (0x800E2680..0x800E27FF)
// ============================================================================
function assembleSlusTailCompact() {
  const a = new MipsAsm(ADDR.Mod_BootInit);

  // Share $s0 = 0x800E0000 across Mod_BootInit -> saves 5 redundant lui instructions (20 B!)
  a.label('Mod_BootInit');
  a.addiu(R.sp, R.sp, -48);
  a.sw(R.ra, 40, R.sp);
  a.sw(R.s0, 36, R.sp);
  a.jal(SYM.Movies_Init);
  a.lui(R.s0, 0x800E);                     // delay slot: s0 = 0x800E0000!

  // g_ModLoaded = 0
  a.sw(R.zero, ADDR.g_ModLoaded & 0xffff, R.s0);

  // CdSearchFile(&fp @ 16($sp), "\VOICES.DAT;1")
  a.addiu(R.a1, R.s0, ADDR.Str_VoicesPath & 0xffff);
  a.jal(SYM.CdSearchFile);
  a.addiu(R.a0, R.sp, 16);
  a.beq(R.v0, R.zero, 'boot_done');
  a.addiu(R.a0, R.sp, 16);

  // g_VoicesBaseLba = CdPosToInt(&fp.pos)
  a.jal(SYM.CdPosToInt);
  a.nop();
  a.sw(R.v0, ADDR.g_VoicesBaseLba & 0xffff, R.s0);

  // CdControl(CdlSetloc=2, &fp.pos, 0)
  a.addiu(R.a0, R.zero, 2);
  a.addiu(R.a1, R.sp, 16);
  a.jal(SYM.CdControl);
  a.move(R.a2, R.zero);

  // CdRead(2 sectors, 0x800E2800, 0x80)
  a.addiu(R.a0, R.zero, 2);
  a.addiu(R.a1, R.s0, ADDR.ModCodeBase & 0xffff);
  a.jal(SYM.CdRead);
  a.addiu(R.a2, R.zero, 0x80);

  // Wait for CdReadSync(1, 0) <= 0
  a.label('boot_wait');
  a.addiu(R.a0, R.zero, 1);
  a.jal(SYM.CdReadSync);
  a.move(R.a1, R.zero);
  a.blez(R.v0, 'boot_loaded');
  a.move(R.a0, R.zero);
  a.jal(SYM.VSync);
  a.nop();
  a.j('boot_wait');
  a.nop();

  // Check magic 0x564F4943 @ 0x800E3000
  a.label('boot_loaded');
  a.lw(R.v0, ADDR.VoiceTblBase & 0xffff, R.s0);
  a.li(R.v1, 0x564F4943);
  a.bne(R.v0, R.v1, 'boot_done');
  a.nop();

  // BIOS FlushCache() (A0:0x44)
  a.jal(SYM.FlushCache);
  a.nop();

  // g_ModLoaded = 1
  a.addiu(R.v0, R.zero, 1);
  a.sw(R.v0, ADDR.g_ModLoaded & 0xffff, R.s0);

  a.label('boot_done');
  a.lw(R.s0, 36, R.sp);
  a.lw(R.ra, 40, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 48);

  const bootEnd = a.pc();
  console.log(`  [ASM] Mod_BootInit: 0x${ADDR.Mod_BootInit.toString(16)}..0x${bootEnd.toString(16)} (${bootEnd - ADDR.Mod_BootInit} B)`);

  // Compact 4-word (16 B) trampolines sharing one 9-word (36 B) Tramp_Dispatch!
  function emitTramp(atAddr, modEntry, fallbackAddr) {
    a.padTo(atAddr);
    a.la(R.t2, fallbackAddr);                  // 2 words: fallback target
    a.j('Tramp_Dispatch');                     // 1 word
    a.addiu(R.t1, R.zero, modEntry & 0xffff);  // 1 word (delay slot: low 16 bits of 0x800E28xx)
  }

  emitTramp(ADDR.Tramp_BootMovie,      ADDR.Entry_BootMovie,      SYM.PlayFullScreenMovie);
  emitTramp(ADDR.Tramp_PlaySelScroll,  ADDR.Entry_PlaySelScroll,  SYM.GetSelectedSkaterIdx);
  emitTramp(ADDR.Tramp_PlaySelConfirm, ADDR.Entry_PlaySelConfirm, SYM.SFX_Play);
  emitTramp(ADDR.Tramp_RunPlaySel,     ADDR.Entry_RunPlaySel,     SYM.Overlay_Run);

  a.padTo(ADDR.Tramp_Dispatch);
  a.label('Tramp_Dispatch');
  a.lui(R.t0, 0x800E);
  a.lw(R.t3, ADDR.g_ModLoaded & 0xffff, R.t0);
  a.addu(R.t1, R.t0, R.t1);                    // fills lw load-delay slot -> t1 = 0x800E28xx!
  a.beq(R.t3, R.zero, 'td_fb');
  a.nop();
  a.jr(R.t1);
  a.nop();
  a.label('td_fb');
  a.jr(R.t2);
  a.nop();

  // Hook_CdMix(CdlATV* a0): reduces background XA music to 25% (-12 dB) while g_InPlaySel != 0 (0x800E27DC)!
  a.padTo(ADDR.Hook_CdMix);
  a.lui(R.t0, 0x800E);
  a.lw(R.t0, ADDR.g_InPlaySel & 0xffff, R.t0);
  a.lbu(R.t2, 0, R.a0);                        // fills lw load-delay slot! val0 = Left CD-XA vol
  a.beq(R.t0, R.zero, 'cdmix_go');             // if NOT inside playsel.bin -> 100% full volume!
  a.lbu(R.t3, 2, R.a0);                        // delay slot! val2 = Right CD-XA vol
  a.srl(R.t2, R.t2, 2);                        // 25% (-12 dB) — soft background music!
  a.srl(R.t3, R.t3, 2);                        // 25% (-12 dB)
  a.sb(R.t2, 0, R.a0);
  a.sb(R.t3, 2, R.a0);
  a.label('cdmix_go');
  a.j(SYM.CdMix);
  a.nop();

  a.padTo(ADDR.g_VoicesBaseLba);
  a.word(0); // g_VoicesBaseLba
  a.word(0); // g_ModLoaded

  a.padTo(ADDR.Str_VoicesPath);
  a.bytes(Buffer.from('\\VOICES.DAT;1\0', 'ascii'));

  a.padTo(ADDR.g_InPlaySel);
  a.word(0); // g_InPlaySel (0 = outside playsel, 1 = inside playsel)

  // Trampoline for SFX_Play Bail Round-Robin @ 0x800E27E0..0x800E27EF (reuses Tramp_Dispatch!)
  emitTramp(ADDR.Tramp_BailSfx, ADDR.Hook_BailSfx, SYM.SFX_FindGlobal);

  a.padTo(ADDR.g_BailScreamIdx);
  a.word(0); // g_BailScreamIdx (0..8)
  a.padTo(ADDR.g_LastBailFrame);
  a.word(0); // g_LastBailFrame (VSync(-1) frame stamp)

  a.padTo(0x800E2800);
  const bin = a.emit();
  if (bin.length !== 0x180) throw new Error(`SLUS tail size mismatch: ${bin.length} != 384`);
  return bin;
}

// ============================================================================
// 1B. Assemble Resident Bail Scream Round-Robin Hook (0x800E3200..0x800E37FF)
//     Loaded inside VOICES.DAT Sector 1 (+0x200) at boot & covered by FlushCache!
// ============================================================================
function assembleBailHookCode() {
  const a = new MipsAsm(ADDR.Hook_BailSfx);

  // Called from SFX_Play @ 0x800527B8 replacing `jal SFX_FindGlobal(a0)`:
  //   a0 = s0 = s1 = 16-bit sfxId
  //   s4 = volume, s5 = loopFlag, s6 = -1, s7 = pitch
  //   Safe caller-saved temps: t0..t3, v0, v1, a0..a3
  a.label('Hook_BailSfx');
  a.addiu(R.t0, R.a0, -28);
  a.sltiu(R.t1, R.t0, 3);                      // 28..30 (Skater_BailImpactSFX ground slam)
  a.bne(R.t1, R.zero, 'is_bail');
  a.addiu(R.t0, R.a0, -181);                   // delay slot
  a.sltiu(R.t1, R.t0, 7);                      // 181..187 (bail anim grunts + pit falls)
  a.bne(R.t1, R.zero, 'is_bail');
  a.addiu(R.t0, R.a0, -384);                   // delay slot
  a.sltiu(R.t1, R.t0, 2);                      // 384..385 (long scream)
  a.bne(R.t1, R.zero, 'is_bail');
  a.addiu(R.t0, R.a0, -393);                   // delay slot
  a.sltiu(R.t1, R.t0, 3);                      // 393..395 (2P female bail remaps)
  a.bne(R.t1, R.zero, 'is_bail');
  a.nop();

  // Fast path (~6 cycles) for all non-bail SFX
  a.j(SYM.SFX_FindGlobal);
  a.nop();

  // Bail voice SFX intercepted!
  a.label('is_bail');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 16, R.sp);

  // VSync(-1) -> v0 = current 60Hz VBlank counter (preserves s0..s7 per MIPS O32 ABI)
  a.jal(SYM.VSync);
  a.addiu(R.a0, R.zero, -1);

  // Cooldown anti-overlap check (50 frames ~= 0.83 s): prevent 2 screams overlapping on same fall!
  a.lui(R.t0, 0x800E);
  a.lw(R.t1, ADDR.g_LastBailFrame & 0xffff, R.t0);
  a.nop();
  a.beq(R.t1, R.zero, 'do_rotate');
  a.subu(R.t2, R.v0, R.t1);                    // delay slot: elapsed = now - prev
  a.sltiu(R.t3, R.t2, 50);
  a.beq(R.t3, R.zero, 'do_rotate');
  a.nop();

  // Suppress duplicate overlapping bail grunt cleanly: s0 = 0xFFFF -> SFX_FindLevel fails too, return -1
  a.ori(R.s0, R.zero, 0xFFFF);
  a.addiu(R.v0, R.zero, -1);
  a.lw(R.ra, 16, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // Strict non-repeating Round-Robin rotation: 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 0
  a.label('do_rotate');
  a.sw(R.v0, ADDR.g_LastBailFrame & 0xffff, R.t0);
  a.lw(R.t1, ADDR.g_BailScreamIdx & 0xffff, R.t0);
  a.nop();
  a.sltiu(R.t2, R.t1, 9);
  a.bne(R.t2, R.zero, 'idx_ok');
  a.nop();
  a.move(R.t1, R.zero);

  a.label('idx_ok');
  a.addiu(R.t2, R.t1, 1);
  a.addiu(R.t3, R.zero, 9);
  a.bne(R.t2, R.t3, 'save_next');
  a.nop();
  a.move(R.t2, R.zero);

  a.label('save_next');
  a.sw(R.t2, ADDR.g_BailScreamIdx & 0xffff, R.t0);

  // Load newSfxId = BailIdTable[idx] (9 x u16)
  a.la(R.t3, 'BailIdTable');
  a.sll(R.t1, R.t1, 1);
  a.addu(R.t3, R.t3, R.t1);
  a.lhu(R.a0, 0, R.t3);
  a.nop();
  a.move(R.s0, R.a0);
  a.move(R.s1, R.a0);

  // Boost volume floor to 10240 so screams cut cleanly over COMPILED.XA & concrete slam SFX
  a.slti(R.t2, R.s4, 10240);
  a.beq(R.t2, R.zero, 'vol_ok');
  a.nop();
  a.addiu(R.s4, R.zero, 10240);

  a.label('vol_ok');
  a.lw(R.ra, 16, R.sp);
  a.addiu(R.sp, R.sp, 24);
  a.j(SYM.SFX_FindGlobal);
  a.nop();

  a.align(4);
  a.label('BailIdTable');
  const tbl = Buffer.alloc(20, 0);
  const ids = [28, 29, 30, 181, 182, 183, 185, 186, 187];
  for (let i = 0; i < ids.length; i++) tbl.writeUInt16LE(ids[i], i * 2);
  a.bytes(tbl);

  const used = a.pc() - ADDR.Hook_BailSfx;
  if (used > 1536) throw new Error(`Hook_BailSfx excede 1536 B (${used} B)!`);
  console.log(`  [ASM] Hook_BailSfx: 0x${ADDR.Hook_BailSfx.toString(16)}..0x${a.pc().toString(16)} (${used} B / 1536 B, livre: ${1536 - used} B)`);

  a.padTo(ADDR.Hook_BailSfx + 1536);
  return a.emit();
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
  a.j('Hook_RunPlaySel');      a.nop(); // 0x800E2818

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

  // Helper: ZeroBuf128($a0 = ptr) — zeroes 128 bytes cleanly
  a.label('ZeroBuf128');
  a.addiu(R.t1, R.a0, 128);
  a.label('zb_lp');
  a.sw(R.zero, 0, R.a0);
  a.addiu(R.a0, R.a0, 4);
  a.bne(R.a0, R.t1, 'zb_lp');
  a.nop();
  a.jr(R.ra);
  a.nop();

  // --------------------------------------------------------------------------
  // Unified Helper: McOpSec60($a0 = buf128, $a1 = isWrite [0=read, 1=write])
  // Retries cleanly on NEWCARD (rc==4) / rc==3 with NewCardAck(0).
  // Bounded attempts guarantee zero hangs on missing/unformatted Memory Cards!
  // --------------------------------------------------------------------------
  a.label('McOpSec60');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 28, R.sp);
  a.sw(R.s0, 24, R.sp);
  a.sw(R.s1, 20, R.sp);
  a.sw(R.s2, 16, R.sp);
  a.move(R.s0, R.a0);            // s0 = buf128
  a.move(R.s2, R.a1);            // s2 = isWrite (0=read, 1=write)
  a.addiu(R.s1, R.zero, 3);      // s1 = max attempts

  a.label('mco_loop');
  a.jal(SYM.ClearCardEvents);
  a.nop();
  a.move(R.a0, R.zero);          // chan = 0 (Port 1 Slot A)
  a.addiu(R.a1, R.zero, 60);     // sector = 60 (0x3C unused reserved sector)
  a.bne(R.s2, R.zero, 'mco_do_wr');
  a.move(R.a2, R.s0);
  a.jal(SYM._card_read);
  a.nop();
  a.j('mco_wait');
  a.nop();
  a.label('mco_do_wr');
  a.jal(SYM._card_write);
  a.nop();

  a.label('mco_wait');
  a.jal(SYM.WaitCardEvent);
  a.nop();
  a.beq(R.v0, R.zero, 'mco_ret'); // 0 = IOE OK
  a.addiu(R.t0, R.zero, 4);
  a.beq(R.v0, R.t0, 'mco_ack');
  a.addiu(R.t0, R.zero, 3);
  a.bne(R.v0, R.t0, 'mco_ret');   // Timeout (no card) or error -> exit immediately!
  a.nop();

  a.label('mco_ack');
  a.addiu(R.s1, R.s1, -1);
  a.blez(R.s1, 'mco_ret');
  a.nop();
  a.jal(SYM.ClearCardEvents);
  a.nop();
  a.jal(SYM.NewCardAck);
  a.move(R.a0, R.zero);
  a.jal(SYM.WaitCardEvent);
  a.nop();
  a.j('mco_loop');
  a.nop();

  a.label('mco_ret');
  a.lw(R.s2, 16, R.sp);
  a.lw(R.s1, 20, R.sp);
  a.lw(R.s0, 24, R.sp);
  a.lw(R.ra, 28, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 32);

  // --------------------------------------------------------------------------
  // 1. BootRand_PlaySlot(int origArg)  [origArg = -1 (Acti), -2 (Never), -3 (Intro)]
  //    Draws 3 distinct random videos AND clamps each boot slot to its EXACT
  //    original duration (208f Activision, 266f Neversoft, 1486f Intro), restoring
  //    full num_frames immediately after playback so Career Endings stay untouched!
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
  a.sltiu(R.t0, R.s0, 3);
  a.beq(R.t0, R.zero, 'br_fallback_orig');
  a.move(R.s5, R.a0);

  a.lwSym(R.v0, 'g_BootPicked');
  a.nop();
  a.bne(R.v0, R.zero, 'br_play_slot');
  a.nop();

  // Hardware entropy: Root Counters 0, 1, 2 + VSync(-1)
  a.jal(SYM.VSync);
  a.addiu(R.a0, R.zero, -1);
  a.move(R.s1, R.v0);
  a.lui(R.t0, 0x1F80);
  a.lhu(R.t1, 0x1100, R.t0);
  a.lhu(R.t2, 0x1110, R.t0);
  a.lhu(R.t3, 0x1120, R.t0);
  a.sll(R.t2, R.t2, 11);
  a.sll(R.t3, R.t3, 21);
  a.xor(R.s1, R.s1, R.t1);
  a.xor(R.s1, R.s1, R.t2);
  a.xor(R.s1, R.s1, R.t3);

  a.jal('ZeroBuf128');
  a.addiu(R.a0, R.sp, 16);

  a.addiu(R.s2, R.zero, 1);    // bootCounter = 1
  a.li(R.s3, 0x9E3779B9);      // seed
  a.addiu(R.s4, R.zero, 0xFF); // prevVideo0

  // Try reading MC Slot 1 Sector 60
  a.addiu(R.a0, R.sp, 16);
  a.jal('McOpSec60');
  a.move(R.a1, R.zero);        // isWrite = 0 (read)
  a.move(R.s5, R.v0);          // s5 = mcReadOk (0 = present)
  a.bne(R.s5, R.zero, 'br_mix_seed');
  a.nop();

  a.lw(R.t0, 16, R.sp);
  a.li(R.t1, 0x5448524E);      // "THRN"
  a.bne(R.t0, R.t1, 'br_mc_fresh');
  a.nop();

  a.lw(R.s2, 20, R.sp);
  a.lw(R.s3, 24, R.sp);
  a.lw(R.s4, 28, R.sp);
  a.nop();
  a.j('br_mix_seed');
  a.addiu(R.s2, R.s2, 1);

  a.label('br_mc_fresh');
  a.jal('ZeroBuf128');
  a.addiu(R.a0, R.sp, 16);

  a.label('br_mix_seed');
  a.li(R.t0, 0x9E3779B1);
  a.multu(R.s2, R.t0);
  a.mflo(R.t1);
  a.xor(R.s3, R.s3, R.t1);
  a.xor(R.s3, R.s3, R.s1);
  a.li(R.t0, 0xA5A55A5A);
  a.xor(R.s3, R.s3, R.t0);

  a.addiu(R.t4, R.zero, 4);
  a.label('br_xs4');
  a.jal('XorShift32');
  a.move(R.a0, R.s3);
  a.move(R.s3, R.v0);
  a.addiu(R.t4, R.t4, -1);
  a.bne(R.t4, R.zero, 'br_xs4');
  a.nop();

  // Pick 3 distinct movies from pool, slot 0 != prevVideo0
  a.label('br_pick0');
  a.jal('PickOneMovie');
  a.move(R.a0, R.s3);
  a.move(R.s3, R.v0);
  a.beq(R.v1, R.s4, 'br_pick0');
  a.nop();
  a.la(R.t2, 'g_BootSlots');
  a.sb(R.v1, 0, R.t2);
  a.move(R.s4, R.v1);

  a.label('br_pick1');
  a.jal('PickOneMovie');
  a.move(R.a0, R.s3);
  a.move(R.s3, R.v0);
  a.beq(R.v1, R.s4, 'br_pick1');
  a.nop();
  a.la(R.t2, 'g_BootSlots');
  a.sb(R.v1, 1, R.t2);
  a.move(R.s1, R.v1);

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

  // Seed initial Lulao & Bolsonaro voice clip indices from PRNG seed
  a.lwSym(R.t0, ADDR.VoiceTblBase + 4);
  a.nop();
  a.beq(R.t0, R.zero, 'br_skip_v1');
  a.nop();
  a.divu(R.s3, R.t0);
  a.mfhi(R.t1);
  a.swSym(R.t1, R.t2, 'g_LulaoClipIdx');
  a.label('br_skip_v1');

  a.lwSym(R.t0, ADDR.VoiceTblBase + 8);
  a.nop();
  a.beq(R.t0, R.zero, 'br_skip_v2');
  a.srl(R.t3, R.s3, 8);
  a.divu(R.t3, R.t0);
  a.mfhi(R.t1);
  a.swSym(R.t1, R.t2, 'g_BolsoClipIdx');
  a.label('br_skip_v2');

  // Persist updated state to MC Sector 60 if card was present (s5 == 0)
  a.bne(R.s5, R.zero, 'br_mark_done');
  a.li(R.t0, 0x5448524E);
  a.sw(R.t0, 16, R.sp);
  a.sw(R.s2, 20, R.sp);
  a.sw(R.s3, 24, R.sp);
  a.sw(R.s4, 28, R.sp);
  a.addiu(R.a0, R.sp, 16);
  a.jal('McOpSec60');
  a.addiu(R.a1, R.zero, 1);    // isWrite = 1

  a.label('br_mark_done');
  a.addiu(R.t0, R.zero, 1);
  a.swSym(R.t0, R.t1, 'g_BootPicked');

  // ---- Play g_BootSlots[slot] clamped to g_MovieTable[slot].num_frames! ----
  a.label('br_play_slot');
  a.addiu(R.t0, R.zero, 2);
  a.bne(R.s0, R.t0, 'br_keep_picked');
  a.nop();
  a.swSym(R.zero, R.t1, 'g_BootPicked');
  a.label('br_keep_picked');

  // Load movieIdx = g_BootSlots[slot] into $t4
  a.la(R.t0, 'g_BootSlots');
  a.addu(R.t0, R.t0, R.s0);
  a.lbu(R.t4, 0, R.t0);          // t4 = picked movieIdx

  // Compute origEntry = g_MovieTable + slot * 36 -> t3 = origFrames (208 / 266 / 1486)
  a.la(R.t2, SYM.g_MovieTable);
  a.sll(R.t0, R.s0, 3);
  a.addu(R.t0, R.t0, R.s0);
  a.sll(R.t0, R.t0, 2);
  a.addu(R.t0, R.t2, R.t0);
  a.lhu(R.t3, 14, R.t0);         // t3 = origFrames of boot slot (Acti=208, Never=266, Intro=1486)

  // Compute pickedEntry = g_MovieTable + movieIdx * 36 -> s1, savedFrames -> s2
  a.sll(R.t0, R.t4, 3);
  a.addu(R.t0, R.t0, R.t4);
  a.sll(R.t0, R.t0, 2);
  a.addu(R.s1, R.t2, R.t0);      // s1 = &g_MovieTable[pickedIdx]
  a.lhu(R.s2, 14, R.s1);         // s2 = savedFrames (full video length!)
  a.nop();

  // Clamp num_frames = min(savedFrames, origFrames) so boot slot matches EXACT original time!
  a.sltu(R.t0, R.s2, R.t3);      // if savedFrames < origFrames, keep savedFrames (no EOF overshoot!)
  a.bne(R.t0, R.zero, 'br_do_play');
  a.nor(R.a0, R.zero, R.t4);     // delay slot: a0 = ~pickedIdx
  a.sh(R.t3, 14, R.s1);          // temporarily set num_frames = origFrames!

  a.label('br_do_play');
  a.jal(SYM.PlayFullScreenMovie);
  a.nop();

  // ALWAYS restore original full num_frames so Career Ending videos play full length!
  a.sh(R.s2, 14, R.s1);
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
  a.move(R.a0, R.zero);
  a.jal(SYM.SpuSetKey);
  a.lui(R.a1, 0x0080);           // 1 << 23 = 0x00800000
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

  a.jal('SkaterVoice_Stop');
  a.move(R.s0, R.a0);

  a.lwSym(R.s1, ADDR.VoiceTblBase + 4); // lulaoCount
  a.lwSym(R.s2, ADDR.VoiceTblBase + 8); // bolsoCount
  a.la(R.t5, 'g_LulaoClipIdx');
  a.addiu(R.t0, R.zero, 2);
  a.beq(R.s0, R.t0, 'vp_sel_l');
  a.addiu(R.t0, R.zero, 3);
  a.bne(R.s0, R.t0, 'vp_done');
  a.move(R.t3, R.s2);                   // count = bolsoCount
  a.move(R.t4, R.s1);                   // baseEntry = lulaoCount
  a.j('vp_adv');
  a.addiu(R.t5, R.t5, 4);               // &g_BolsoClipIdx == &g_LulaoClipIdx + 4

  a.label('vp_sel_l');
  a.move(R.t3, R.s1);                   // count = lulaoCount
  a.move(R.t4, R.zero);                 // baseEntry = 0

  a.label('vp_adv');
  a.beq(R.t3, R.zero, 'vp_done');
  a.nop();
  a.lw(R.t1, 0, R.t5);
  a.nop();
  a.sltu(R.t2, R.t1, R.t3);
  a.bne(R.t2, R.zero, 'vp_idx_ok');
  a.nop();
  a.move(R.t1, R.zero);
  a.label('vp_idx_ok');
  a.addu(R.s3, R.t4, R.t1);             // tableEntryIdx = baseEntry + clipIdx
  a.addiu(R.t1, R.t1, 1);
  a.bne(R.t1, R.t3, 'vp_idx_st');
  a.nop();
  a.move(R.t1, R.zero);
  a.label('vp_idx_st');
  a.sw(R.t1, 0, R.t5);

  a.label('vp_fetch');
  a.sll(R.t0, R.s3, 4);
  a.la(R.t1, ADDR.VoiceTblBase + 0x10);
  a.addu(R.s1, R.t1, R.t0);
  a.lw(R.s2, 0, R.s1);
  a.lw(R.s3, 4, R.s1);
  a.lw(R.s4, 8, R.s1);
  a.nop();
  a.beq(R.s3, R.zero, 'vp_done');
  a.sll(R.a0, R.s3, 11);

  a.move(R.a1, R.zero);
  a.addiu(R.a2, R.zero, 1);
  a.jal(SYM.Mem_Alloc);
  a.move(R.a3, R.zero);
  a.beq(R.v0, R.zero, 'vp_done');
  a.move(R.s6, R.v0);

  a.jal(SYM.CDWAD_WaitIdle);
  a.nop();

  a.move(R.s5, R.zero);
  a.lw(R.t0, 14704, R.gp);
  a.lw(R.t1, 14712, R.gp);
  a.nop();
  a.beq(R.t0, R.zero, 'vp_cd_read');
  a.nop();
  a.bne(R.t1, R.zero, 'vp_cd_read');
  a.nop();
  a.addiu(R.s5, R.zero, 1);
  a.jal(SYM.XA_Pause);
  a.addiu(R.a0, R.zero, 1);

  a.label('vp_cd_read');
  a.lwSym(R.t0, ADDR.g_VoicesBaseLba);
  a.nop();
  a.addu(R.a0, R.t0, R.s2);
  a.jal(SYM.CdIntToPos);
  a.addiu(R.a1, R.sp, 16);

  a.addiu(R.a0, R.zero, 2);
  a.addiu(R.a1, R.sp, 16);
  a.jal(SYM.CdControl);
  a.move(R.a2, R.zero);

  a.move(R.a0, R.s3);
  a.move(R.a1, R.s6);
  a.jal(SYM.CdRead);
  a.addiu(R.a2, R.zero, 0x80);

  a.label('vp_cd_wait');
  a.addiu(R.a0, R.zero, 1);
  a.jal(SYM.CdReadSync);
  a.move(R.a1, R.zero);
  a.blez(R.v0, 'vp_cd_done');
  a.move(R.a0, R.zero);
  a.jal(SYM.VSync);
  a.nop();
  a.j('vp_cd_wait');
  a.nop();

  a.label('vp_cd_done');
  a.beq(R.s5, R.zero, 'vp_spu_dma');
  a.nop();
  a.jal(SYM.XA_SetMode);
  a.nop();
  a.jal(SYM.XA_Pause);
  a.move(R.a0, R.zero);
  // Keep CD-XA mix volume lowered via Hook_CdMix!
  a.jal(SYM.XA_UpdateVolume);
  a.nop();

  a.label('vp_spu_dma');
  a.li(R.a0, ADDR.SpuVoiceBuf);
  a.jal(SYM.SpuSetTransferStartAddr);
  a.nop();

  a.move(R.a0, R.s6);
  a.jal(SYM.SpuWrite);
  a.move(R.a1, R.s4);

  a.jal(SYM.SpuIsTransferCompleted);
  a.addiu(R.a0, R.zero, 1);

  a.jal(SYM.Mem_Free);
  a.move(R.a0, R.s6);

  // Program PS1 SPU Hardware Voice 23 registers directly @ 0x1F801D70
  a.lui(R.t0, 0x1F80);
  a.lhu(R.t1, 0x1D92, R.t0);
  a.lhu(R.t2, 0x1D96, R.t0);
  a.lhu(R.t3, 0x1D9A, R.t0);
  a.andi(R.t1, R.t1, 0xFF7F);
  a.andi(R.t2, R.t2, 0xFF7F);
  a.andi(R.t3, R.t3, 0xFF7F);
  a.sh(R.t1, 0x1D92, R.t0);
  a.sh(R.t2, 0x1D96, R.t0);
  a.sh(R.t3, 0x1D9A, R.t0);

  a.addiu(R.t1, R.zero, 0x3FFF);
  a.sh(R.t1, 0x1D70, R.t0);
  a.sh(R.t1, 0x1D72, R.t0);

  a.lw(R.t2, 12, R.s1);
  a.li(R.t3, ADDR.SpuVoiceBuf >>> 3);
  a.sh(R.t2, 0x1D74, R.t0);
  a.sh(R.t3, 0x1D76, R.t0);

  a.addiu(R.t1, R.zero, 0x00FF);
  a.sh(R.t1, 0x1D78, R.t0);
  a.addiu(R.t1, R.zero, 0x1FC0);
  a.sh(R.t1, 0x1D7A, R.t0);

  a.li(R.t2, ADDR.SpuVoiceBuf);
  a.addu(R.t2, R.t2, R.s4);
  a.addiu(R.t2, R.t2, -16);
  a.srl(R.t2, R.t2, 3);
  a.sh(R.t2, 0x1D7E, R.t0);

  a.addiu(R.a0, R.zero, 1);
  a.jal(SYM.SpuSetKey);
  a.lui(R.a1, 0x0080);

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
  // 4. Hook_PlaySel_Scroll(void* g_Career)  [playsel.bin +0x3388]
  // --------------------------------------------------------------------------
  a.label('Hook_PlaySel_Scroll');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 24, R.sp);
  a.sw(R.s0, 20, R.sp);
  a.jal(SYM.GetSelectedSkaterIdx);
  a.nop();
  a.move(R.s0, R.v0);

  a.addiu(R.t0, R.zero, 2);
  a.beq(R.s0, R.t0, 'hs_play');
  a.addiu(R.t0, R.zero, 3);
  a.beq(R.s0, R.t0, 'hs_play');
  a.nop();
  a.jal('SkaterVoice_Stop');
  a.nop();
  a.j('hs_ret');
  a.nop();

  a.label('hs_play');
  a.jal('SkaterVoice_Play');
  a.move(R.a0, R.s0);

  a.label('hs_ret');
  a.move(R.v0, R.s0);
  a.lw(R.s0, 20, R.sp);
  a.lw(R.ra, 24, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 32);

  // --------------------------------------------------------------------------
  // 5. Hook_PlaySel_Confirm(sfxId, vol, pan)  [playsel.bin +0x100C]
  // --------------------------------------------------------------------------
  a.label('Hook_PlaySel_Confirm');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 24, R.sp);
  a.sw(R.s0, 20, R.sp);
  a.jal(SYM.SFX_Play);
  a.nop();
  a.move(R.s0, R.v0);

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
  // 6. Hook_RunPlaySel(a0, a1, a2, a3)  [SLUS_010.66 @ 0x80082B80]
  //    Lowers background music immediately on entering Skater Select (25% / -12 dB)
  //    and restores 100% full music volume + stops Voice 23 upon exiting!
  // --------------------------------------------------------------------------
  a.label('Hook_RunPlaySel');
  a.addiu(R.sp, R.sp, -40);
  a.sw(R.ra, 32, R.sp);
  a.sw(R.s0, 28, R.sp);
  a.sw(R.s1, 24, R.sp);
  a.sw(R.s2, 20, R.sp);
  a.sw(R.s3, 16, R.sp);
  a.move(R.s0, R.a0);
  a.move(R.s1, R.a1);
  a.move(R.s2, R.a2);
  a.move(R.s3, R.a3);

  // Set private flag g_InPlaySel = 1 (NEVER touches THPS2's 23464($gp)!) -> lowers music to 25% (-12 dB)!
  a.lui(R.t0, 0x800E);
  a.addiu(R.t1, R.zero, 1);
  a.jal(SYM.XA_UpdateVolume);
  a.sw(R.t1, ADDR.g_InPlaySel & 0xffff, R.t0);

  a.move(R.a0, R.s0);
  a.move(R.a1, R.s1);
  a.move(R.a2, R.s2);
  a.jal(SYM.Overlay_Run);
  a.move(R.a3, R.s3);
  a.move(R.s0, R.v0);

  // Leaving Skater Select -> clear g_InPlaySel = 0 (leaving 23464($gp) 100% untouched!), stop Voice 23 & restore 100% music!
  a.lui(R.t0, 0x800E);
  a.jal('SkaterVoice_Stop');
  a.sw(R.zero, ADDR.g_InPlaySel & 0xffff, R.t0);
  a.jal(SYM.XA_UpdateVolume);
  a.nop();

  a.move(R.v0, R.s0);
  a.lw(R.s3, 16, R.sp);
  a.lw(R.s2, 20, R.sp);
  a.lw(R.s1, 24, R.sp);
  a.lw(R.s0, 28, R.sp);
  a.lw(R.ra, 32, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 40);

  // --------------------------------------------------------------------------
  // Resident Mod Data & State Variables (inside 0x800E2800..0x800E2FFF)
  // --------------------------------------------------------------------------
  a.align(4);
  a.label('g_BootPicked');   a.word(0);
  a.label('g_LulaoClipIdx'); a.word(0);
  a.label('g_BolsoClipIdx'); a.word(0);
  a.label('g_BootSlots');    a.bytes(Buffer.from([2, 17, 18, 0]));

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
function patchWord(buf, fileOff, expectedOrig, newVal, desc, prevValidVals = []) {
  const cur = buf.readUInt32LE(fileOff);
  if (cur !== expectedOrig && cur !== newVal && !prevValidVals.includes(cur)) {
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
  console.log('=== THPS2 PS1 Surgical MIPS Patcher v2: Boot Video Durations + Skater Voices + Music Ducking ===\n');

  fs.mkdirSync(backupDir, { recursive: true });
  for (const fn of ['SLUS_010.66', 'CD.WAD']) {
    const bak = path.join(backupDir, fn);
    if (!fs.existsSync(bak)) {
      fs.copyFileSync(path.join(rootDir, fn), bak);
      console.log(`  [BACKUP] Salvo original em ${bak}`);
    }
  }

  // 1. Assemble SLUS tail (0x800E2680..0x800E27FF), MODCODE (0x800E2800..0x800E2FFF) & Hook_BailSfx (0x800E3200..0x800E37FF)
  const slusTail = assembleSlusTailCompact();
  const modCode = assembleModCode();
  const bailHookCode = assembleBailHookCode();

  // 2. Build/update VOICES.DAT with MODCODE (Sec 0) + VOICETBL & Hook_BailSfx (Sec 1) + 28 SPU clips
  console.log('');
  const manifest = buildVoicesBank(modCode, false, bailHookCode);

  // 3. Patch SLUS_010.66 (exact same file size 864,256 B!)
  console.log('\n=== Aplicando 10 Hooks Cirurgicos em SLUS_010.66 ===');
  const slus = fs.readFileSync(slusPath);
  const ramToOff = (ram) => (ram - SLUS_BASE) + SLUS_HDR;

  patchWord(slus, ramToOff(0x800E2674), 0x800E2678, ADDR.NewHeapStart,            'HeapStartPtr @ 0x800E2674');
  patchWord(slus, ramToOff(0x800A2950), 0x24842674, 0x24843800,                   'InitHeap addiu @ 0x800A2950');
  patchWord(slus, ramToOff(0x80053690), 0x28620018, 0x28620017,                   'Reserve SPU Voice 23 @ 0x80053690');
  patchWord(slus, ramToOff(0x800527B8), jalWord(SYM.SFX_FindGlobal),      jalWord(ADDR.Tramp_BailSfx),     'Hook SFX_Play Bail Round-Robin @ 0x800527B8');
  patchWord(slus, ramToOff(0x8006CAD4), jalWord(SYM.Movies_Init),         jalWord(ADDR.Mod_BootInit),      'Hook Movies_Init @ 0x8006CAD4');
  patchWord(slus, ramToOff(0x8003CFB0), jalWord(SYM.PlayFullScreenMovie), jalWord(ADDR.Tramp_BootMovie),   'Boot Slot 0 (Activision) @ 0x8003CFB0', [jalWord(0x800E2758)]);
  patchWord(slus, ramToOff(0x8003CFE8), jalWord(SYM.PlayFullScreenMovie), jalWord(ADDR.Tramp_BootMovie),   'Boot Slot 1 (Neversoft)  @ 0x8003CFE8', [jalWord(0x800E2758)]);
  patchWord(slus, ramToOff(0x8003D024), jalWord(SYM.PlayFullScreenMovie), jalWord(ADDR.Tramp_BootMovie),   'Boot Slot 2 (Intro)      @ 0x8003D024', [jalWord(0x800E2758)]);
  patchWord(slus, ramToOff(0x80038950), jalWord(SYM.CdMix),               jalWord(ADDR.Hook_CdMix),        'Hook XA CdMix (25% PlaySel) @ 0x80038950');
  patchWord(slus, ramToOff(0x80082B80), jalWord(SYM.Overlay_Run),         jalWord(ADDR.Tramp_RunPlaySel),  'Hook Overlay_Run playsel @ 0x80082B80');

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
  patchWord(wad, playselOff + 0x3388, jalWord(SYM.GetSelectedSkaterIdx), jalWord(ADDR.Tramp_PlaySelScroll),  'playsel.bin Scroll  +0x3388', [jalWord(0x800E2780)]);
  patchWord(wad, playselOff + 0x100C, jalWord(SYM.SFX_Play),             jalWord(ADDR.Tramp_PlaySelConfirm), 'playsel.bin Confirm +0x100C', [jalWord(0x800E27A8)]);
  fs.writeFileSync(wadPath, wad);
  console.log(`  [OK] CD.WAD gravado (${wad.length} B — todos os offsets 100% preservados!)`);

  return { slusTail, modCode, bailHookCode, manifest };
}

module.exports = { applyAll, ADDR, SYM, jalWord, assembleSlusTailClean: assembleSlusTailCompact, assembleModCode, assembleBailHookCode };

if (require.main === module) {
  applyAll();
}
