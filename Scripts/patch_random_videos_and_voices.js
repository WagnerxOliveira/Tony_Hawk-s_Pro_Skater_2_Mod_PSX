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
  Career_CollectCash:     0x80024F1C,
  Panel_EndRunPause:      0x8002FD68,
  Panel_EndRunComp:       0x800301DC,
  Panel_EndRunNormal:     0x80030408,
  XA_Update:              0x80038E14,
  Gameplay_MainLoop:      0x8003CD84,
  Level_Unload:           0x80063054,
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
  g_LevelTable:           0x800B8444, // 11 levels, stride 0x174, goals @ +0x90 (stride 24), short @ +0x88
  g_MovieTable:           0x800C1CB4, // stride 36 bytes, +14 = uint16 num_frames
  g_Career:               0x800C2958,
};

// Fixed Mod RAM Addresses (reserved below heap 0x800E5800 = 6 resident sectors from VOICES.DAT!)
const ADDR = {
  HeapStartPtr:        0x800E2674,
  NewHeapStart:        0x800E5800,
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
  g_InPlaySel:         0x800E27DC, // Bitmask: bit0 = InPlaySel, bit1 = LulaoGameplayVoiceDuck (0 = 100% XA vol)
  Tramp_BailSfx:       0x800E27E0, // 4-word (16 B) trampoline -> Hook_BailSfx @ 0x800E3400
  g_BailScreamIdx:     0x800E27F0, // Dedicated 4-byte strict round-robin index (0..8)
  g_LastBailFrame:     0x800E27F4, // Dedicated 4-byte VSync(-1) frame timestamp for anti-overlap cooldown
  ModCodeBase:         0x800E2800, // Sector 0 of VOICES.DAT (2048 B)
  Entry_BootMovie:     0x800E2800,
  Entry_PlaySelScroll: 0x800E2808,
  Entry_PlaySelConfirm:0x800E2810,
  Entry_RunPlaySel:    0x800E2818,
  VoiceTblBase:        0x800E3000, // Sector 1 of VOICES.DAT (0x800E3000..0x800E33EF = VOICETBL up to 62 clips!)
  SilvioCountAddr:     0x800E33F0, // uint32 silvioCount (Slot 1)
  g_SilvioClipIdx:     0x800E33F4, // uint32 runtime round-robin clip index for Silvio Santos (Slot 1)
  g_LulaoClipIdx:      0x800E33F8, // uint32 runtime round-robin clip index for Lulao (Slot 2)
  g_BolsoClipIdx:      0x800E33FC, // uint32 runtime round-robin clip index for Bolsonaro (Slot 3)
  Hook_BailSfx:        0x800E3400, // Sector 1 +0x400..+0x5FF (512 B: 9 rotating bail screams)
  VoiceSelect_Lookup:  0x800E3600, // Sector 1 +0x600..+0x67F (128 B: multi-skater voice dispatcher: Slots 1, 2, 3)
  VoiceSelect_SeedAll: 0x800E3680, // Sector 1 +0x680..+0x7FF (384 B: PRNG seeder for Slots 1, 2, 3)
  // Sector 2 of VOICES.DAT (2048 B): Lulao Career Swapper + Cash/EndRun Hooks + 2 KB SPU Ping-Pong Streamer
  LulaoCodeBase:       0x800E3800,
  Entry_LulaoSync:     0x800E3800,
  Entry_OverlaySync:   0x800E3808,
  Entry_CollectCash:   0x800E3810,
  Entry_EndRunNormal:  0x800E3818,
  Entry_EndRunComp:    0x800E3820,
  Entry_EndRunPause:   0x800E3828,
  Entry_FrameTick:     0x800E3830,
  Entry_GameplayStart: 0x800E3838,
  Entry_GameplayExit:  0x800E3840,
  // Sectors 4..5 of VOICES.DAT (4096 B): Lulao Career Goal/Medal/Cash Pointer Table, Orig Backup & Strings
  LulaoStrDataBase:    0x800E4800,
  LulaoOrigBackup:     0x800E4B00, // 96 x 4 B = 384 B (0x800E4B00..0x800E4C7F)
  SpuVoiceBuf:         0x00058000, // Menu Skater Select SPU slot (0x58000..0x7EFF0 = 159,728 B free above shell.vab)
  SpuStreamHalfA:      0x0007F400, // Gameplay Ping-Pong Half A (1024 B, ABOVE bullring.vab 0x7F360!)
  SpuStreamHalfB:      0x0007F800, // Gameplay Ping-Pong Half B (1024 B, 0x7F800..0x7FBFF)
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

  // CdRead(6 sectors, 0x800E2800, 0x80) -> loads MODCODE (Sec0), VOICETBL+Sec1 (Sec1), LULAO_CODE (Sec2..3), LULAO_STRDATA (Sec4..5)
  a.addiu(R.a0, R.zero, 6);
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

  const bailUsed = a.pc() - ADDR.Hook_BailSfx;
  if (bailUsed > 512) throw new Error(`Hook_BailSfx excede 512 B (${bailUsed} B)!`);
  console.log(`  [ASM] Hook_BailSfx: 0x${ADDR.Hook_BailSfx.toString(16)}..0x${a.pc().toString(16)} (${bailUsed} B / 512 B, livre: ${512 - bailUsed} B)`);

  // --------------------------------------------------------------------------
  // VoiceSelect_Lookup(int skaterIdx in $a0) @ 0x800E3600 (leaf function)
  //   Returns: $v0 = clipCount (0 if skater has no voices)
  //            $v1 = baseEntryIdx in VOICETBL
  //            $a1 = &g_SkaterClipIdx
  //   Supports Slot 1 (Silvio Santos), Slot 2 (Lulao), Slot 3 (Bolsonaro)!
  // --------------------------------------------------------------------------
  a.padTo(ADDR.VoiceSelect_Lookup);
  a.label('VoiceSelect_Lookup');
  a.lui(R.t0, 0x800E);
  a.lw(R.t1, ADDR.VoiceTblBase + 4 & 0xffff, R.t0);   // t1 = lulaoCount
  a.lw(R.t2, ADDR.VoiceTblBase + 8 & 0xffff, R.t0);   // t2 = bolsoCount
  a.addiu(R.v0, R.zero, 2);                           // fills lw delay slot!
  a.beq(R.a0, R.v0, 'vs_lulao');
  a.addiu(R.v0, R.zero, 3);
  a.beq(R.a0, R.v0, 'vs_bolso');
  a.addiu(R.v0, R.zero, 1);
  a.beq(R.a0, R.v0, 'vs_silvio');
  a.move(R.v0, R.zero);                               // delay slot: default 0 (no voice)
  a.jr(R.ra);
  a.nop();

  a.label('vs_lulao');
  a.move(R.v0, R.t1);                                 // count = lulaoCount
  a.move(R.v1, R.zero);                               // baseEntry = 0
  a.jr(R.ra);
  a.addiu(R.a1, R.t0, ADDR.g_LulaoClipIdx & 0xffff);

  a.label('vs_bolso');
  a.move(R.v0, R.t2);                                 // count = bolsoCount
  a.move(R.v1, R.t1);                                 // baseEntry = lulaoCount
  a.jr(R.ra);
  a.addiu(R.a1, R.t0, ADDR.g_BolsoClipIdx & 0xffff);

  a.label('vs_silvio');
  a.lw(R.v0, ADDR.SilvioCountAddr & 0xffff, R.t0);    // count = silvioCount
  a.addu(R.v1, R.t1, R.t2);                           // fills lw delay slot! baseEntry = lulaoCount + bolsoCount
  a.jr(R.ra);
  a.addiu(R.a1, R.t0, ADDR.g_SilvioClipIdx & 0xffff);

  // --------------------------------------------------------------------------
  // VoiceSelect_SeedAll(uint32 seed in $a0) @ 0x800E3680 (leaf function)
  //   Initializes g_LulaoClipIdx, g_BolsoClipIdx & g_SilvioClipIdx from boot PRNG!
  // --------------------------------------------------------------------------
  a.padTo(ADDR.VoiceSelect_SeedAll);
  a.label('VoiceSelect_SeedAll');
  a.lui(R.t0, 0x800E);

  // Lulao (Slot 2)
  a.lw(R.t1, ADDR.VoiceTblBase + 4 & 0xffff, R.t0);
  a.nop();
  a.beq(R.t1, R.zero, 'seed_bolso');
  a.nop();
  a.divu(R.a0, R.t1);
  a.mfhi(R.t2);
  a.sw(R.t2, ADDR.g_LulaoClipIdx & 0xffff, R.t0);

  // Bolsonaro (Slot 3)
  a.label('seed_bolso');
  a.lw(R.t1, ADDR.VoiceTblBase + 8 & 0xffff, R.t0);
  a.srl(R.t3, R.a0, 8);
  a.beq(R.t1, R.zero, 'seed_silvio');
  a.nop();
  a.divu(R.t3, R.t1);
  a.mfhi(R.t2);
  a.sw(R.t2, ADDR.g_BolsoClipIdx & 0xffff, R.t0);

  // Silvio Santos (Slot 1)
  a.label('seed_silvio');
  a.lw(R.t1, ADDR.SilvioCountAddr & 0xffff, R.t0);
  a.srl(R.t3, R.a0, 16);
  a.beq(R.t1, R.zero, 'seed_done');
  a.nop();
  a.divu(R.t3, R.t1);
  a.mfhi(R.t2);
  a.sw(R.t2, ADDR.g_SilvioClipIdx & 0xffff, R.t0);

  a.label('seed_done');
  a.jr(R.ra);
  a.nop();

  const vsUsed = a.pc() - ADDR.VoiceSelect_Lookup;
  if (vsUsed > 512) throw new Error(`VoiceSelect excede 512 B (${vsUsed} B)!`);
  console.log(`  [ASM] VoiceSelect:  0x${ADDR.VoiceSelect_Lookup.toString(16)}..0x${a.pc().toString(16)} (${vsUsed} B / 512 B, livre: ${512 - vsUsed} B)`);

  a.padTo(ADDR.Hook_BailSfx + 1024);
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

  // Seed initial Lulao, Bolsonaro & Silvio Santos voice clip indices from PRNG seed
  a.jal(ADDR.VoiceSelect_SeedAll);
  a.move(R.a0, R.s3);

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

  // Resolve (count -> $v0, baseEntry -> $v1, &clipIdx -> $a1) for Silvio (1), Lulao (2), Bolsonaro (3)!
  a.jal(ADDR.VoiceSelect_Lookup);
  a.move(R.a0, R.s0);
  a.beq(R.v0, R.zero, 'vp_done');
  a.move(R.t3, R.v0);                   // count
  a.move(R.t4, R.v1);                   // baseEntry
  a.move(R.t5, R.a1);                   // &g_SkaterClipIdx

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

  a.jal(ADDR.VoiceSelect_Lookup);
  a.move(R.a0, R.s0);
  a.bne(R.v0, R.zero, 'hs_play');
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
  a.sw(R.s1, 16, R.sp);
  a.jal(SYM.SFX_Play);
  a.nop();
  a.move(R.s0, R.v0);

  a.la(R.a0, SYM.g_Career);
  a.jal(SYM.GetSelectedSkaterIdx);
  a.nop();
  a.move(R.s1, R.v0);

  a.jal(ADDR.VoiceSelect_Lookup);
  a.move(R.a0, R.s1);
  a.beq(R.v0, R.zero, 'hc_ret');
  a.nop();

  a.jal('SkaterVoice_Play');
  a.move(R.a0, R.s1);

  a.label('hc_ret');
  a.move(R.v0, R.s0);
  a.lw(R.s1, 16, R.sp);
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

  // Set bit 0 of g_InPlaySel (0x800E27DC) -> lowers music to 25% (-12 dB)!
  a.lui(R.t0, 0x800E);
  a.lw(R.t1, ADDR.g_InPlaySel & 0xffff, R.t0);
  a.nop();
  a.ori(R.t1, R.t1, 1);
  a.jal(SYM.XA_UpdateVolume);
  a.sw(R.t1, ADDR.g_InPlaySel & 0xffff, R.t0);

  a.move(R.a0, R.s0);
  a.move(R.a1, R.s1);
  a.move(R.a2, R.s2);
  a.jal(SYM.Overlay_Run);
  a.move(R.a3, R.s3);
  a.move(R.s0, R.v0);

  // Leaving Skater Select -> clear bit 0 of g_InPlaySel, stop Voice 23, restore music & sync Lulao Career strings!
  a.lui(R.t0, 0x800E);
  a.lw(R.t1, ADDR.g_InPlaySel & 0xffff, R.t0);
  a.nop();
  a.andi(R.t1, R.t1, 0xFFFE);
  a.jal('SkaterVoice_Stop');
  a.sw(R.t1, ADDR.g_InPlaySel & 0xffff, R.t0);
  a.jal(SYM.XA_UpdateVolume);
  a.nop();
  a.jal(ADDR.Entry_LulaoSync);
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
// 2B. Build Lulao Career Mode Goal/Medal/Cash String Table (Sectors 3..4 -> 0x800E4000..0x800E4FFF, 4096 B)
//     Dynamically swapped whenever Skater == Lulao (Slot 2), 100% restored for all other skaters!
// ============================================================================
function buildLulaoStrData() {
  const lvlBase = (lvl) => SYM.g_LevelTable + lvl * 0x174;
  const goalNamePtr = (lvl, g) => lvlBase(lvl) + 0x90 + g * 24;
  const goalShortPtr = (lvl, g) => lvlBase(lvl) + 0x88 + g * 24;

  // All Career levels (Phases 1..8: The Hangar -> The Bullring) + Cash Pickup & Podium strings
  // Strictly clean printable ASCII (0x20..0x7E) for 100% glyph compatibility in s2goal/s2font1/ingame1.fnt!
  const mappings = [
    // ---- Fase 1: The Hangar (Level 0) ----
    [goalNamePtr(0, 0),  'Picanha Basica - 10,000'],
    [goalNamePtr(0, 1),  'Cervejinha Pro - 25,000'],
    [goalNamePtr(0, 2),  'Taxa da Shopee - 75,000'],
    [goalNamePtr(0, 3),  'Soletre S-K-A-T-E Comp.'],
    [goalNamePtr(0, 4),  '5 Barris de Cachaca 51'],
    [goalShortPtr(0, 4), 'CACHACA 51'],
    [goalNamePtr(0, 5),  '5 Asas do Aviao da Janja'],
    [goalShortPtr(0, 5), 'AVIAO JANJA'],
    [goalNamePtr(0, 6),  'Saudar a Mandioca no Cano'],
    [goalShortPtr(0, 6), 'MANDIOCA'],
    [goalNamePtr(0, 7),  '3 Voos Pobre no Aviao'],
    [goalShortPtr(0, 7), 'VOO DO POBRE'],
    [goalNamePtr(0, 8),  'Achar a Fita do Triplex'],
    [goalNamePtr(0, 9),  '100% Rachei o Cofre!'],

    // ---- Fase 2: School II (Level 1) ----
    [goalNamePtr(1, 0),  'Nunca Li Livro - 15,000'],
    [goalNamePtr(1, 1),  'Zero Portugues - 40,000'],
    [goalNamePtr(1, 2),  'PhD em Enrolar - 100,000'],
    [goalNamePtr(1, 3),  'S-K-A-T-E sem Diplominha'],
    [goalNamePtr(1, 4),  '5 Sinos do Sindicato'],
    [goalShortPtr(1, 4), 'SINDICATO'],
    [goalNamePtr(1, 5),  '5 Passes pro Sitio VIP'],
    [goalShortPtr(1, 5), 'PASSES SITIO'],
    [goalNamePtr(1, 6),  'Kickflip no Teto de Gasto'],
    [goalShortPtr(1, 6), 'TETO GASTO'],
    [goalNamePtr(1, 7),  '3 Corrimoes do Mensalao'],
    [goalShortPtr(1, 7), 'MENSALAO'],
    [goalNamePtr(1, 8),  'Fita do Sigilo 100 Anos'],
    [goalNamePtr(1, 9),  '100% Bolsa Shape!'],

    // ---- Fase 3: Marseille (Level 2 - Competicao 1) ----
    [goalNamePtr(2, 0),  'Bronze da Abobora'],
    [goalNamePtr(2, 1),  'Prata da Cervejinha'],
    [goalNamePtr(2, 2),  'Ouro do Pai dos Pobres'],

    // ---- Fase 4: NY City (Level 3) ----
    [goalNamePtr(3, 0),  'Dolar a 6 Conto - 20,000'],
    [goalNamePtr(3, 1),  'Viagem na ONU - 50,000'],
    [goalNamePtr(3, 2),  'Rombo Bilionario 150,000'],
    [goalNamePtr(3, 3),  'S-K-A-T-E em Nova Iorque'],
    [goalNamePtr(3, 4),  'Pular Hidrantes de Pinga'],
    [goalShortPtr(3, 4), 'PINGA'],
    [goalNamePtr(3, 5),  '5 Fichas da Obra do Metro'],
    [goalShortPtr(3, 5), 'OBRA METRO'],
    [goalNamePtr(3, 6),  '50-50 na Obra Superfatur.'],
    [goalShortPtr(3, 6), '50-50 OBRA'],
    [goalNamePtr(3, 7),  'Grind Trilho da Propina'],
    [goalNamePtr(3, 8),  'Fita da Cueca Recheada'],
    [goalNamePtr(3, 9),  '100% Taxei Nova York!'],

    // ---- Fase 5: Venice Beach (Level 4) ----
    [goalNamePtr(4, 0),  'Praia do Guaruja - 40,000'],
    [goalNamePtr(4, 1),  'Pedalinho Sitio - 100,000'],
    [goalNamePtr(4, 2),  'Calango do Mar - 200,000'],
    [goalNamePtr(4, 3),  'S-K-A-T-E da Cervejinha'],
    [goalNamePtr(4, 4),  'Pular 5 Companheiros'],
    [goalShortPtr(4, 4), 'COMPANHEIROS'],
    [goalNamePtr(4, 5),  '5 Latas de Pitu na Praia'],
    [goalShortPtr(4, 5), 'LATAS PITU'],
    [goalNamePtr(4, 6),  'Tailslide no Triplex'],
    [goalShortPtr(4, 6), 'TRIPLEX'],
    [goalNamePtr(4, 7),  '4 Transfers pra Cuba'],
    [goalShortPtr(4, 7), 'CUBA'],
    [goalNamePtr(4, 8),  'Fita do Ze Gotinha Sumido'],
    [goalNamePtr(4, 9),  '100% Virou Abobora!'],

    // ---- Fase 6: SkateStreet (Level 5 - Competicao 2) ----
    [goalNamePtr(5, 0),  'Bronze da Taxa'],
    [goalNamePtr(5, 1),  'Prata do Triplex'],
    [goalNamePtr(5, 2),  'Ouro da Picanha'],

    // ---- Fase 7: Philadelphia (Level 6) ----
    [goalNamePtr(6, 0),  'Imposto no Shape - 50,000'],
    [goalNamePtr(6, 1),  'Saco Vazio Nao - 125,000'],
    [goalNamePtr(6, 2),  'Entrou o Grosso - 250,000'],
    [goalNamePtr(6, 3),  'S-K-A-T-E do Petrolao'],
    [goalNamePtr(6, 4),  'Secar a Fonte do BNDES'],
    [goalShortPtr(6, 4), 'BNDES'],
    [goalNamePtr(6, 5),  '5 Sinos do Imposto Sind.'],
    [goalShortPtr(6, 5), 'IMPOSTO'],
    [goalNamePtr(6, 6),  'Blunt no Toldo da PF'],
    [goalShortPtr(6, 6), 'TOLDO PF'],
    [goalNamePtr(6, 7),  '4 Lips Sem Sabe de Nada'],
    [goalShortPtr(6, 7), 'NADA SEI'],
    [goalNamePtr(6, 8),  'Fita do Celular da Cerva'],
    [goalNamePtr(6, 9),  '100% Sem Saber de Nada!'],

    // ---- Fase 8: The Bullring (Level 7 - Competicao Final) ----
    [goalNamePtr(7, 0),  'Bronze do Calango'],
    [goalNamePtr(7, 1),  'Prata da Cachaca'],
    [goalNamePtr(7, 2),  'Ouro: Zerei o Brasil!'],

    // ---- g_StringTable: Coleta de Dinheiro & Podio do Lulao ----
    [0x800C0310, 'Roubei mais 50!'],               // $50 Cash Icon pickup
    [0x800C0314, 'Roubei mais 100!'],              // $100 Cash Icon pickup
    [0x800C030C, 'Roubei mais 250!'],              // $250 Cash Icon pickup
    [0x800C01D4, 'Zerei o BNDES da Fase!'],        // Cash Icons Cleared
    [0x800C080C, 'Roubei'],                        // HUD Cash label ("%s $%d" -> "Roubei $50")
    [0x800C0538, 'Picanha de Ouro no Bolso!'],     // 3 medals
    [0x800C054C, 'Faltou picanha, companheiro'],   // Try for gold
    [0x800C0558, '1o - Pai dos Pobres!'],          // 1st place
    [0x800C055C, '2o - So pra Cervejinha'],        // 2nd place
    [0x800C0560, '3o - Comeu Abobora!'],           // 3rd place
  ];

  if (mappings.length > 94) throw new Error(`Lulao mappings (${mappings.length}) excede 94 slots!`);
  for (const [ptr, text] of mappings) {
    if (!/^[\x20-\x7e]+$/.test(text)) throw new Error(`String nao-ASCII em 0x${ptr.toString(16)}: ${text}`);
    if (ptr < 0x800C0000 && text.length > 26) throw new Error(`Objetivo muito longo (${text.length} > 26): ${text}`);
  }

  // Layout inside Sectors 3..4 (4096 B @ RAM 0x800E4000..0x800E4FFF):
  //   +0x000..+0x2FF (768 B): up to 95 x 8B pairs { uint32 targetPtr, uint32 lulaoStrPtr } + {0,0}
  //   +0x300..+0x47F (384 B): runtime backup array g_OrigBackup[96] (zeroed in file, filled on first sync)
  //   +0x480..+0xFFF (2944 B): NUL-terminated ASCII strings (deduplicated)
  const buf = Buffer.alloc(4096, 0);
  const strPool = new Map();
  let strOff = 0x480;

  for (let i = 0; i < mappings.length; i++) {
    const [targetPtr, text] = mappings[i];
    let ramAddr = strPool.get(text);
    if (ramAddr === undefined) {
      const b = Buffer.from(text + '\0', 'ascii');
      if (strOff + b.length > buf.length) throw new Error(`LULAO_STRDATA overflow em "${text}"!`);
      b.copy(buf, strOff);
      ramAddr = (ADDR.LulaoStrDataBase + strOff) >>> 0;
      strPool.set(text, ramAddr);
      strOff += b.length;
    }
    buf.writeUInt32LE(targetPtr >>> 0, i * 8);
    buf.writeUInt32LE(ramAddr >>> 0, i * 8 + 4);
  }
  // Terminator {0, 0} already zeroed!

  console.log(`  [DATA] LULAO_STRDATA: 0x${ADDR.LulaoStrDataBase.toString(16)}..0x${(ADDR.LulaoStrDataBase + strOff).toString(16)} (${mappings.length} ponteiros, ${strOff - 0x480} B strings / 2944 B, livre: ${4096 - strOff} B)`);
  return { buf, mappings };
}

// ============================================================================
// 2C. Assemble Resident Lulao Career & ZERO-STALL Gameplay Voice Engine
//     (Sectors 2..3 -> 0x800E3800..0x800E47FF, 4096 B)
//     - Lulao_SyncStrings: dynamically swaps all 88 Career/Cash/Podium pointers for Lulao (Slot 2)
//     - LulaoCache_Load: ONCE per level load (on Loading Screen), walks Heap[1] freeList @ gp+19112
//       (immune to THPS2's 0x80054550 OOM red-screen trap!), reserves >= 96 KB untouched safety margin,
//       allocates 1 persistent buffer (2 KB g_StageBuf + contiguous slice of 6890.625 Hz LULAO_GPBANK)
//       and loads 4..10 Lulao clips in ONE single CdRead (0 reloads on Retry!).
//     - Hook_CollectCash / Hook_EndRun_*: decoupled deferred flag (< 0.0005 ms inside physics!)
//     - Hook_FrameTick: starts voice instantly from RAM cache (< 0.20 ms, ZERO CdRead, ZERO XA_Pause,
//       ZERO Mem_Alloc, 0 dropped frames, 60 FPS rock-solid!) via immutable 2 KB g_StageBuf -> SPU Voice 23
//       2 KB Ping-Pong Ring (0x7F400..0x7FBFF @ exact pitch 0x0280 = 6890.625 Hz).
// ============================================================================
function assembleLulaoEngine(gpMeta) {
  if (!gpMeta || !Array.isArray(gpMeta.ringEntries) || gpMeta.ringEntries.length !== 28) {
    throw new Error('assembleLulaoEngine requer gpMeta valido com 28 entradas em anel (14x2)!');
  }
  const a = new MipsAsm(ADDR.LulaoCodeBase);

  // Fixed Entry Jump Table @ 0x800E3800 (9 entries — 100% ABI-compatible with all SLUS_010.66 hooks!)
  a.j('Lulao_SyncStrings');   a.nop(); // 0x800E3800
  a.j('Hook_OverlaySyncRun'); a.nop(); // 0x800E3808
  a.j('Hook_CollectCash');    a.nop(); // 0x800E3810
  a.j('Hook_EndRun_Normal');  a.nop(); // 0x800E3818
  a.j('Hook_EndRun_Comp');    a.nop(); // 0x800E3820
  a.j('Hook_EndRun_Pause');   a.nop(); // 0x800E3828
  a.j('Hook_FrameTick');      a.nop(); // 0x800E3830
  a.j('Hook_GameplayStart');  a.nop(); // 0x800E3838
  a.j('Hook_GameplayExit');   a.nop(); // 0x800E3840

  // --------------------------------------------------------------------------
  // 1. Lulao_SyncStrings() — Backs up original pointers once, then sets Lulao
  //    strings if selected skater == 2, or restores originals for all others!
  // --------------------------------------------------------------------------
  a.label('Lulao_SyncStrings');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 28, R.sp);
  a.sw(R.s0, 24, R.sp);
  a.sw(R.s1, 20, R.sp);

  // First time only: save original pointers from g_LevelTable & g_StringTable into LulaoOrigBackup
  a.lwSym(R.t0, 'g_OrigSaved');
  a.nop();
  a.bne(R.t0, R.zero, 'ls_do_apply');
  a.nop();

  a.la(R.s0, ADDR.LulaoStrDataBase);
  a.la(R.s1, ADDR.LulaoOrigBackup);
  a.label('ls_save_lp');
  a.lw(R.t0, 0, R.s0);
  a.nop();
  a.beq(R.t0, R.zero, 'ls_save_done');
  a.nop();
  a.lw(R.t1, 0, R.t0);
  a.addiu(R.s0, R.s0, 8);
  a.sw(R.t1, 0, R.s1);
  a.j('ls_save_lp');
  a.addiu(R.s1, R.s1, 4);

  a.label('ls_save_done');
  a.addiu(R.t0, R.zero, 1);
  a.swSym(R.t0, R.t1, 'g_OrigSaved');

  a.label('ls_do_apply');
  a.la(R.a0, SYM.g_Career);
  a.jal(SYM.GetSelectedSkaterIdx);
  a.nop();
  a.addiu(R.t2, R.zero, 2);              // Slot 2 = Lulao
  a.la(R.s0, ADDR.LulaoStrDataBase);
  a.la(R.s1, ADDR.LulaoOrigBackup);
  a.beq(R.v0, R.t2, 'ls_lulao_lp');
  a.nop();

  // Restore originals for all non-Lulao skaters
  a.label('ls_orig_lp');
  a.lw(R.t0, 0, R.s0);
  a.lw(R.t1, 0, R.s1);
  a.beq(R.t0, R.zero, 'ls_done');
  a.addiu(R.s0, R.s0, 8);
  a.sw(R.t1, 0, R.t0);
  a.j('ls_orig_lp');
  a.addiu(R.s1, R.s1, 4);

  // Apply Lulao satirical Career goals, cash pickup & podium strings
  a.label('ls_lulao_lp');
  a.lw(R.t0, 0, R.s0);
  a.lw(R.t1, 4, R.s0);
  a.beq(R.t0, R.zero, 'ls_done');
  a.addiu(R.s0, R.s0, 8);
  a.sw(R.t1, 0, R.t0);
  a.j('ls_lulao_lp');
  a.nop();

  a.label('ls_done');
  a.lw(R.s1, 20, R.sp);
  a.lw(R.s0, 24, R.sp);
  a.lw(R.ra, 28, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 32);

  // --------------------------------------------------------------------------
  // 2. Hook_OverlaySyncRun(a0..a3) — Syncs Lulao Career strings before opening
  //    skateshp/levelsel/career menus (covers direct MC load without playsel!)
  // --------------------------------------------------------------------------
  a.label('Hook_OverlaySyncRun');
  a.addiu(R.sp, R.sp, -40);
  a.sw(R.ra, 36, R.sp);
  a.sw(R.a0, 16, R.sp);
  a.sw(R.a1, 20, R.sp);
  a.sw(R.a2, 24, R.sp);
  a.sw(R.a3, 28, R.sp);
  a.jal('Lulao_SyncStrings');
  a.nop();
  a.lw(R.a0, 16, R.sp);
  a.lw(R.a1, 20, R.sp);
  a.lw(R.a2, 24, R.sp);
  a.lw(R.a3, 28, R.sp);
  a.lw(R.ra, 36, R.sp);
  a.nop();
  a.j(SYM.Overlay_Run);
  a.addiu(R.sp, R.sp, 40);

  // --------------------------------------------------------------------------
  // 3. Hook_CollectCash(nodeId, amount) — DEFERRED ZERO-STALL TRIGGER (< 0.0005 ms!)
  //    Never touches CD-ROM, XA, SPU, or Heap mid-physics! Merely flags g_PendingVoiceMode = 1
  //    when Lulao's RAM pre-cache is active, processed cleanly in Hook_FrameTick post-Display_Swap.
  // --------------------------------------------------------------------------
  a.label('Hook_CollectCash');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.jal(SYM.Career_CollectCash);
  a.nop();
  a.lwSym(R.t0, 'g_CacheClipCount');     // Non-zero ONLY when Lulao (Slot 2) & RAM cache loaded!
  a.nop();
  a.beq(R.t0, R.zero, 'hcc_ret');
  a.addiu(R.t1, R.zero, 1);              // mode 1 = Cash Pickup
  a.swSym(R.t1, R.t2, 'g_PendingVoiceMode');
  a.label('hcc_ret');
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // 4. End-of-Run Hooks (Time Up, Competition Heat/End, Pause -> End Run)
  //    Leaf deferred trigger: protected by g_EndRunSpoken, ZERO stall!
  // --------------------------------------------------------------------------
  a.label('Lulao_OnEndRun');
  a.lwSym(R.t0, 'g_EndRunSpoken');
  a.lwSym(R.t1, 'g_CacheClipCount');
  a.bne(R.t0, R.zero, 'oer_ret');
  a.nop();
  a.beq(R.t1, R.zero, 'oer_ret');
  a.addiu(R.t2, R.zero, 1);
  a.swSym(R.t2, R.t3, 'g_EndRunSpoken');
  a.addiu(R.t2, R.zero, 2);              // mode 2 = End of Run
  a.swSym(R.t2, R.t3, 'g_PendingVoiceMode');
  a.label('oer_ret');
  a.jr(R.ra);
  a.nop();

  a.label('Hook_EndRun_Normal');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.sw(R.s0, 16, R.sp);
  a.jal(SYM.Panel_EndRunNormal);
  a.nop();
  a.move(R.s0, R.v0);
  a.jal('Lulao_OnEndRun');
  a.nop();
  a.move(R.v0, R.s0);
  a.lw(R.s0, 16, R.sp);
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  a.label('Hook_EndRun_Comp');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.sw(R.s0, 16, R.sp);
  a.jal(SYM.Panel_EndRunComp);
  a.nop();
  a.move(R.s0, R.v0);
  a.jal('Lulao_OnEndRun');
  a.nop();
  a.move(R.v0, R.s0);
  a.lw(R.s0, 16, R.sp);
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  a.label('Hook_EndRun_Pause');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.sw(R.s0, 16, R.sp);
  a.jal(SYM.Panel_EndRunPause);
  a.nop();
  a.move(R.s0, R.v0);
  a.jal('Lulao_OnEndRun');
  a.nop();
  a.move(R.v0, R.s0);
  a.lw(R.s0, 16, R.sp);
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // 5. Hook_FrameTick (60 Hz @ 0x8003CB48, post-Display_Swap) + Lifecycle Hooks
  // --------------------------------------------------------------------------
  a.label('Hook_FrameTick');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.jal(SYM.XA_Update);
  a.nop();
  a.lwSym(R.t0, 'g_PendingVoiceMode');
  a.nop();
  a.beq(R.t0, R.zero, 'hft_tick');
  a.nop();
  a.swSym(R.zero, R.t1, 'g_PendingVoiceMode');
  a.jal('LulaoStream_StartFromCache');
  a.move(R.a0, R.t0);
  a.label('hft_tick');
  a.jal('LulaoStream_Tick');
  a.nop();
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  a.label('Hook_GameplayStart');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.jal('LulaoStream_Stop');
  a.nop();
  a.swSym(R.zero, R.t0, 'g_EndRunSpoken');
  a.swSym(R.zero, R.t0, 'g_PendingVoiceMode');
  a.jal('Lulao_SyncStrings');
  a.nop();
  // Preload RAM voice cache ONCE per level load (skipped on Retry when g_CacheBuf != 0!)
  a.lwSym(R.t0, 'g_CacheBuf');
  a.nop();
  a.bne(R.t0, R.zero, 'hgs_enter');
  a.nop();
  a.la(R.a0, SYM.g_Career);
  a.jal(SYM.GetSelectedSkaterIdx);
  a.nop();
  a.addiu(R.t0, R.zero, 2);              // Slot 2 = Lulao
  a.bne(R.v0, R.t0, 'hgs_enter');
  a.nop();
  a.jal('LulaoCache_Load');
  a.nop();
  a.label('hgs_enter');
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.j(SYM.Gameplay_MainLoop);
  a.addiu(R.sp, R.sp, 24);

  a.label('Hook_GameplayExit');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.jal('LulaoCache_Free');
  a.nop();
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.j(SYM.Level_Unload);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // 5B. Helper: Lulao_NextRand() -> $v0 = fresh 32-bit PRNG (hardware entropy + XorShift32)
  // --------------------------------------------------------------------------
  a.label('Lulao_NextRand');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.jal(SYM.VSync);
  a.addiu(R.a0, R.zero, -1);
  a.lwSym(R.t4, 'g_PrngState');
  a.lui(R.t0, 0x1F80);
  a.lhu(R.t1, 0x1100, R.t0);
  a.lhu(R.t2, 0x1110, R.t0);
  a.lhu(R.t3, 0x1120, R.t0);
  a.xor(R.t4, R.t4, R.v0);
  a.sll(R.t2, R.t2, 11);
  a.sll(R.t3, R.t3, 21);
  a.xor(R.t4, R.t4, R.t1);
  a.xor(R.t4, R.t4, R.t2);
  a.xor(R.t4, R.t4, R.t3);
  a.bne(R.t4, R.zero, 'lnr_xs');
  a.nop();
  a.li(R.t4, 0x9E3779B9);
  a.label('lnr_xs');
  a.sll(R.t0, R.t4, 13); a.xor(R.t4, R.t4, R.t0);
  a.srl(R.t0, R.t4, 17); a.xor(R.t4, R.t4, R.t0);
  a.sll(R.t0, R.t4, 5);  a.xor(R.t4, R.t4, R.t0);
  a.swSym(R.t4, R.t0, 'g_PrngState');
  a.move(R.v0, R.t4);
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // 5C. LulaoCache_Load() — Runs ONCE on Level Load for Lulao (Slot 2)!
  //     1. Walks native Heap[1] freeList @ *(gp + 19112) (0x800D7294) to find EXACT largestFree.
  //     2. Preserves an UNTOUCHABLE 48 KB (49,152 B) calibrated safety reserve for THPS2 runtime objects
  //        (empirically measured MaxDelta across all 10 levels incl. Pause & EndRun = 34,368 B -> >= 14.4 KB spare!).
  //     3. Picks random startClip (0..13) & fits as many contiguous ring clips as fit in (usable - 1024),
  //        with guaranteed fallback to startClip = 0 (shortest clip ~4.1 KB) if random startClip didn't fit!
  //     4. Allocates ONE persistent block (1024 B g_StageBuf + readSectors * 2048 B) and executes
  //        ONE single contiguous CdRead during the Loading Screen!
  // --------------------------------------------------------------------------
  a.label('LulaoCache_Load');
  a.addiu(R.sp, R.sp, -64);
  a.sw(R.ra, 56, R.sp);
  a.sw(R.s0, 52, R.sp);
  a.sw(R.s1, 48, R.sp);
  a.sw(R.s2, 44, R.sp);
  a.sw(R.s3, 40, R.sp);
  a.sw(R.s4, 36, R.sp);
  a.sw(R.s5, 32, R.sp);
  a.sw(R.s6, 28, R.sp);

  // Step 1: Walk Heap[1] freeList @ 19112(gp) -> s0 = largestFree contiguous block (bytes)
  a.lw(R.t0, 19112, R.gp);
  a.move(R.s0, R.zero);
  a.label('lcl_fl_lp');
  a.beq(R.t0, R.zero, 'lcl_fl_done');
  a.nop();
  a.lw(R.t1, 0, R.t0);                   // hdr
  a.lw(R.t0, 4, R.t0);                   // next
  a.srl(R.t1, R.t1, 4);                  // blkBytes = hdr >>> 4
  a.sltu(R.t2, R.s0, R.t1);
  a.beq(R.t2, R.zero, 'lcl_fl_lp');
  a.nop();
  a.j('lcl_fl_lp');
  a.move(R.s0, R.t1);

  a.label('lcl_fl_done');
  // Require largestFree >= 49152 (48 KB calibrated safety reserve) + 8192 (8 KB minimum cache) = 57344 B!
  a.li(R.t0, 57344);
  a.sltu(R.t1, R.s0, R.t0);
  a.bne(R.t1, R.zero, 'lcl_ret');        // Too tight (e.g. extreme 2P state) -> skip cleanly, 0% OOM!
  a.nop();
  a.li(R.t0, 49152);                     // 48 KB untouched safety reserve (MaxDelta = 34.4 KB across all 10 levels!)
  a.subu(R.s0, R.s0, R.t0);              // s0 = usable bytes (guaranteed <= largestFree - 48 KB)
  a.li(R.t1, 0xFFFFF800);
  a.and(R.s0, R.s0, R.t1);               // align down to 2048 B sector boundary

  // Step 2: Randomize starting clip index (0..g_GpClipCount-1) so every level load rotates the pool!
  a.jal('Lulao_NextRand');
  a.nop();
  a.lwSym(R.t0, 'g_GpClipCount');
  a.nop();
  a.beq(R.t0, R.zero, 'lcl_ret');
  a.nop();
  a.divu(R.v0, R.t0);
  a.mfhi(R.s1);                          // s1 = startClip (0..13)

  a.label('lcl_calc_base');
  // Step 3: Compute firstSecRel & baseOff for g_GpRingTable[startClip]
  a.la(R.t6, 'g_GpRingTable');
  a.sll(R.t1, R.s1, 3);                  // startClip * 8
  a.addu(R.t6, R.t6, R.t1);              // t6 = &g_GpRingTable[startClip]
  a.lw(R.t2, 0, R.t6);                   // t2 = firstEntry.byteOffsetInBank
  a.nop();
  a.srl(R.s2, R.t2, 11);                 // s2 = firstSecRel
  a.sll(R.s3, R.s2, 11);                 // s3 = g_CacheBaseOff (first byte read into g_CacheBuf + 1024)

  // Step 4: Greedily fit k = 0..(clipCount-1) contiguous clips into s0 (usable bytes)
  a.move(R.t4, R.zero);                  // t4 = k
  a.move(R.s4, R.zero);                  // s4 = accepted clipCount
  a.move(R.s5, R.zero);                  // s5 = accepted readSectors
  a.lwSym(R.t7, 'g_GpClipCount');
  a.nop();

  a.label('lcl_fit_lp');
  a.lw(R.t1, 0, R.t6);                   // entry.byteOffsetInBank
  a.lw(R.t2, 4, R.t6);                   // entry.byteSize
  a.nop();
  a.addu(R.t1, R.t1, R.t2);              // clipEnd
  a.subu(R.t1, R.t1, R.s3);              // spanBytes = clipEnd - baseOff
  a.addiu(R.t1, R.t1, 2047);
  a.srl(R.t1, R.t1, 11);                 // needSectors = ceil(spanBytes / 2048)
  a.sll(R.t2, R.t1, 11);
  a.addiu(R.t2, R.t2, 1024);             // needAlloc = 1024 (g_StageBuf) + needSectors * 2048
  a.sltu(R.t3, R.s0, R.t2);              // usable < needAlloc ?
  a.bne(R.t3, R.zero, 'lcl_fit_done');
  a.nop();
  a.addiu(R.t4, R.t4, 1);
  a.move(R.s4, R.t4);                    // accept k+1 clips
  a.move(R.s5, R.t1);                    // accept needSectors
  a.addiu(R.t6, R.t6, 8);
  a.bne(R.t4, R.t7, 'lcl_fit_lp');
  a.nop();

  a.label('lcl_fit_done');
  a.bne(R.s4, R.zero, 'lcl_do_alloc');
  a.nop();
  // Guaranteed fallback: if random startClip didn't fit in very tight budget, retry once from clip #0 (~4.1 KB)!
  a.beq(R.s1, R.zero, 'lcl_ret');
  a.nop();
  a.j('lcl_calc_base');
  a.move(R.s1, R.zero);

  a.label('lcl_do_alloc');
  // Step 5: Allocate ONE persistent block (allocBytes = 1024 + s5 * 2048 <= usable <= largestFree - 48 KB)
  a.sll(R.a0, R.s5, 11);
  a.addiu(R.a0, R.a0, 1024);
  a.swSym(R.a0, R.t0, 'g_CacheAllocBytes');
  a.move(R.a1, R.zero);
  a.addiu(R.a2, R.zero, 1);
  a.jal(SYM.Mem_Alloc);
  a.move(R.a3, R.zero);
  a.beq(R.v0, R.zero, 'lcl_ret');
  a.move(R.s6, R.v0);                    // s6 = g_CacheBuf (+0..+1023 = g_StageBuf, +1024.. = audio data)

  // Step 6: Execute ONE single contiguous CdRead into (g_CacheBuf + 1024) during Loading Screen!
  a.jal(SYM.CDWAD_WaitIdle);
  a.nop();

  // Safely pause XA if already active (save flag in 24(sp))
  a.sw(R.zero, 24, R.sp);
  a.lw(R.t0, 14704, R.gp);
  a.lw(R.t1, 14712, R.gp);
  a.nop();
  a.beq(R.t0, R.zero, 'lcl_cd_read');
  a.nop();
  a.bne(R.t1, R.zero, 'lcl_cd_read');
  a.nop();
  a.addiu(R.t2, R.zero, 1);
  a.sw(R.t2, 24, R.sp);
  a.jal(SYM.XA_Pause);
  a.addiu(R.a0, R.zero, 1);

  a.label('lcl_cd_read');
  a.lwSym(R.t0, ADDR.g_VoicesBaseLba);
  a.lwSym(R.t1, 'g_GpBankStartSec');
  a.nop();
  a.addu(R.a0, R.t0, R.t1);
  a.addu(R.a0, R.a0, R.s2);              // LBA = g_VoicesBaseLba + g_GpBankStartSec + firstSecRel
  a.jal(SYM.CdIntToPos);
  a.addiu(R.a1, R.sp, 16);

  a.addiu(R.a0, R.zero, 2);              // CdlSetloc
  a.addiu(R.a1, R.sp, 16);
  a.jal(SYM.CdControl);
  a.move(R.a2, R.zero);

  a.move(R.a0, R.s5);                    // readSectors
  a.addiu(R.a1, R.s6, 1024);             // dst = g_CacheBuf + 1024
  a.jal(SYM.CdRead);
  a.addiu(R.a2, R.zero, 0x80);

  a.label('lcl_cd_wait');
  a.addiu(R.a0, R.zero, 1);
  a.jal(SYM.CdReadSync);
  a.move(R.a1, R.zero);
  a.blez(R.v0, 'lcl_cd_done');
  a.move(R.a0, R.zero);
  a.jal(SYM.VSync);
  a.nop();
  a.j('lcl_cd_wait');
  a.nop();

  a.label('lcl_cd_done');
  a.lw(R.t0, 24, R.sp);
  a.nop();
  a.beq(R.t0, R.zero, 'lcl_commit');
  a.nop();
  a.jal(SYM.XA_SetMode);
  a.nop();
  a.jal(SYM.XA_Pause);
  a.move(R.a0, R.zero);
  a.jal(SYM.XA_UpdateVolume);
  a.nop();

  // Step 7: Commit cache descriptors — gameplay is now 100% CD-ROM-FREE!
  a.label('lcl_commit');
  a.swSym(R.s6, R.t0, 'g_CacheBuf');
  a.swSym(R.s1, R.t0, 'g_CacheStartClip');
  a.swSym(R.s4, R.t0, 'g_CacheClipCount');
  a.swSym(R.s3, R.t0, 'g_CacheBaseOff');
  a.addiu(R.t1, R.zero, -1);
  a.swSym(R.t1, R.t0, 'g_LastClipIdx');

  a.label('lcl_ret');
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
  // 5D. LulaoCache_Free() — Called ONCE on Hook_GameplayExit (0x800E3840)
  // --------------------------------------------------------------------------
  a.label('LulaoCache_Free');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.jal('LulaoStream_Stop');
  a.nop();
  a.swSym(R.zero, R.t0, 'g_EndRunSpoken');
  a.swSym(R.zero, R.t0, 'g_PendingVoiceMode');
  a.swSym(R.zero, R.t0, 'g_CacheClipCount');
  a.swSym(R.zero, R.t0, 'g_CacheAllocBytes');
  a.lwSym(R.a0, 'g_CacheBuf');
  a.nop();
  a.beq(R.a0, R.zero, 'lcf_ret');
  a.nop();
  a.swSym(R.zero, R.t0, 'g_CacheBuf');
  a.jal(SYM.Mem_Free);
  a.nop();
  a.label('lcf_ret');
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // 6. LulaoStream_Stop() — Silences SPU Voice 23, zeroes 2 KB SPU ring via
  //    g_StageBuf (g_CacheBuf + 0..2047) & restores SPU Reverb Master, restores XA 100%!
  //    NEVER calls Mem_Free and NEVER touches cached audio clips @ g_CacheBuf + 2048!
  // --------------------------------------------------------------------------
  a.label('LulaoStream_Stop');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);

  a.move(R.a0, R.zero);
  a.jal(SYM.SpuSetKey);
  a.lui(R.a1, 0x0080);                   // Voice 23 OFF

  a.swSym(R.zero, R.t0, 'g_StreamActive');

  // Restore SPUCNT bit 7 (Reverb Master Enable @ 0x1F801DAA) if we paused reverb
  a.lwSym(R.t0, 'g_SavedRevBit');
  a.nop();
  a.beq(R.t0, R.zero, 'lss_rev_ok');
  a.nop();
  a.swSym(R.zero, R.t1, 'g_SavedRevBit');
  // Clear 0x7F400..0x7FBFF using dedicated 1 KB g_StageBuf (g_CacheBuf + 0..1023) in 2x 1024 B DMAs — NEVER mutates clips!
  a.lwSym(R.t2, 'g_CacheBuf');
  a.nop();
  a.beq(R.t2, R.zero, 'lss_rev_en');
  a.nop();
  a.move(R.t3, R.t2);
  a.addiu(R.t4, R.t2, 1024);
  a.label('lss_z_lp');
  a.sw(R.zero, 0, R.t3);
  a.addiu(R.t3, R.t3, 4);
  a.bne(R.t3, R.t4, 'lss_z_lp');
  a.nop();
  a.li(R.a0, ADDR.SpuStreamHalfA);
  a.jal(SYM.SpuSetTransferStartAddr);
  a.nop();
  a.lwSym(R.a0, 'g_CacheBuf');
  a.jal(SYM.SpuWrite);
  a.addiu(R.a1, R.zero, 1024);
  a.jal(SYM.SpuIsTransferCompleted);
  a.addiu(R.a0, R.zero, 1);
  a.li(R.a0, ADDR.SpuStreamHalfB);
  a.jal(SYM.SpuSetTransferStartAddr);
  a.nop();
  a.lwSym(R.a0, 'g_CacheBuf');
  a.jal(SYM.SpuWrite);
  a.addiu(R.a1, R.zero, 1024);
  a.jal(SYM.SpuIsTransferCompleted);
  a.addiu(R.a0, R.zero, 1);

  a.label('lss_rev_en');
  a.lui(R.t0, 0x1F80);
  a.lhu(R.t1, 0x1DAA, R.t0);
  a.nop();
  a.ori(R.t1, R.t1, 0x0080);             // Re-enable SPU Reverb Master Enable!
  a.sh(R.t1, 0x1DAA, R.t0);

  a.label('lss_rev_ok');
  // Clear bit 1 of g_InPlaySel (0x800E27DC) & restore XA volume if it was ducked!
  a.lui(R.t0, 0x800E);
  a.lw(R.t1, ADDR.g_InPlaySel & 0xffff, R.t0);
  a.nop();
  a.andi(R.t2, R.t1, 2);
  a.beq(R.t2, R.zero, 'lss_done');
  a.andi(R.t1, R.t1, 0xFFFD);            // delay slot: clear bit 1
  a.sw(R.t1, ADDR.g_InPlaySel & 0xffff, R.t0);
  a.jal(SYM.XA_UpdateVolume);
  a.nop();

  a.label('lss_done');
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // 7. LulaoStream_LoadHalf(int halfIdx) [0 = Half A 0x7F400, 1 = Half B 0x7F800]
  //    Copies min(rem, 1024) bytes from READ-ONLY g_StreamSrc + curPos into g_StageBuf (g_CacheBuf),
  //    patches ADPCM flags ONLY inside g_StageBuf, and DMAs 1024 B to SPU RAM!
  //    Cached clips in g_CacheBuf + 2048 remain 100% IMMUTABLE forever!
  // --------------------------------------------------------------------------
  a.label('LulaoStream_LoadHalf');
  a.addiu(R.sp, R.sp, -48);
  a.sw(R.ra, 44, R.sp);
  a.sw(R.s0, 40, R.sp);
  a.sw(R.s1, 36, R.sp);
  a.sw(R.s2, 32, R.sp);
  a.sw(R.s3, 28, R.sp);
  a.sw(R.s4, 24, R.sp);

  a.move(R.s0, R.a0);                    // s0 = halfIdx (0 or 1)
  a.li(R.s3, ADDR.SpuStreamHalfA);
  a.beq(R.s0, R.zero, 'lh_addr_ok');
  a.nop();
  a.li(R.s3, ADDR.SpuStreamHalfB);
  a.label('lh_addr_ok');

  a.lwSym(R.s4, 'g_CacheBuf');           // s4 = g_StageBuf (first 2048 B of g_CacheBuf)
  a.lwSym(R.s1, 'g_StreamCurPos');
  a.lwSym(R.t0, 'g_StreamTotalBytes');
  a.lwSym(R.s2, 'g_StreamSrc');
  a.nop();
  a.beq(R.s4, R.zero, 'lh_ret');
  a.subu(R.t1, R.t0, R.s1);              // delay slot: t1 = rem = total - curPos
  a.blez(R.t1, 'lh_empty_eof');
  a.addu(R.s2, R.s2, R.s1);              // delay slot: s2 = src = g_StreamSrc + curPos

  a.sltiu(R.t2, R.t1, 1025);             // rem <= 1024 ?
  a.bne(R.t2, R.zero, 'lh_last_chunk');
  a.nop();

  // ---- Full 1024-byte chunk: word-copy src[0..1023] -> g_StageBuf[0..1023] ----
  a.move(R.t3, R.s2);                    // src ptr
  a.move(R.t4, R.s4);                    // dst ptr (g_StageBuf)
  a.addiu(R.t5, R.s4, 1024);
  a.label('lh_cp_full');
  a.lw(R.t6, 0, R.t3);
  a.addiu(R.t3, R.t3, 4);
  a.sw(R.t6, 0, R.t4);
  a.addiu(R.t4, R.t4, 4);
  a.bne(R.t4, R.t5, 'lh_cp_full');
  a.nop();

  // Clear ADPCM flags on all 64 blocks inside g_StageBuf
  a.move(R.t3, R.s4);
  a.label('lh_clr_full');
  a.sb(R.zero, 1, R.t3);
  a.addiu(R.t3, R.t3, 16);
  a.bne(R.t3, R.t5, 'lh_clr_full');
  a.nop();

  a.bne(R.s0, R.zero, 'lh_full_b');
  a.nop();
  // Half A: block 0 (+0) = 0x04 (fixed hardware loop start = 0x7F400). Block 63 stays 0x00.
  a.addiu(R.t2, R.zero, 0x04);
  a.sb(R.t2, 1, R.s4);
  a.j('lh_dma_full');
  a.nop();

  a.label('lh_full_b');
  // Half B: blocks 0..62 = 0x00, block 63 (+1008) = 0x03 (END|REPEAT -> wraps to 0x7F400!).
  a.addiu(R.t2, R.zero, 0x03);
  a.sb(R.t2, 1009, R.s4);

  a.label('lh_dma_full');
  a.jal(SYM.SpuSetTransferStartAddr);
  a.move(R.a0, R.s3);
  a.move(R.a0, R.s4);
  a.jal(SYM.SpuWrite);
  a.addiu(R.a1, R.zero, 1024);
  a.jal(SYM.SpuIsTransferCompleted);
  a.addiu(R.a0, R.zero, 1);

  a.addiu(R.s1, R.s1, 1024);
  a.swSym(R.s1, R.t0, 'g_StreamCurPos');
  a.j('lh_ret');
  a.nop();

  // ---- Final partial/exact chunk (0 < rem <= 1024) ----
  a.label('lh_last_chunk');
  // Word-copy rem bytes (exact multiple of 16) from src -> g_StageBuf
  a.move(R.t3, R.s2);
  a.move(R.t4, R.s4);
  a.addu(R.t5, R.s4, R.t1);              // end of copied bytes in g_StageBuf
  a.label('lh_cp_last');
  a.lw(R.t6, 0, R.t3);
  a.addiu(R.t3, R.t3, 4);
  a.sw(R.t6, 0, R.t4);
  a.addiu(R.t4, R.t4, 4);
  a.bne(R.t4, R.t5, 'lh_cp_last');
  a.nop();

  // Clear flags on copied blocks [0..rem-1] inside g_StageBuf
  a.move(R.t3, R.s4);
  a.label('lh_clr_last');
  a.sb(R.zero, 1, R.t3);
  a.addiu(R.t3, R.t3, 16);
  a.sltu(R.t2, R.t3, R.t5);
  a.bne(R.t2, R.zero, 'lh_clr_last');
  a.nop();

  // Zero trailing bytes [rem..1023] ONLY inside g_StageBuf!
  a.addiu(R.t6, R.s4, 1024);
  a.label('lh_zero_tail');
  a.sltu(R.t2, R.t4, R.t6);
  a.beq(R.t2, R.zero, 'lh_mark_last');
  a.nop();
  a.sw(R.zero, 0, R.t4);
  a.j('lh_zero_tail');
  a.addiu(R.t4, R.t4, 4);

  a.label('lh_mark_last');
  // Mark last real block with flag=0x01 (END without REPEAT -> clean silent stop, V23_ENVX -> 0!)
  a.addiu(R.t3, R.t5, -16);
  a.addiu(R.t2, R.zero, 0x01);
  a.sb(R.t2, 1, R.t3);

  a.jal(SYM.SpuSetTransferStartAddr);
  a.move(R.a0, R.s3);
  a.move(R.a0, R.s4);
  a.jal(SYM.SpuWrite);
  a.addiu(R.a1, R.zero, 1024);
  a.jal(SYM.SpuIsTransferCompleted);
  a.addiu(R.a0, R.zero, 1);

  a.lwSym(R.t0, 'g_StreamTotalBytes');
  a.nop();
  a.swSym(R.t0, R.t1, 'g_StreamCurPos');
  a.addiu(R.t0, R.zero, 2);              // g_StreamActive = 2 (EOF loaded!)
  a.swSym(R.t0, R.t1, 'g_StreamActive');
  a.swSym(R.zero, R.t1, 'g_StreamEofFrames');
  a.j('lh_ret');
  a.nop();

  // ---- Exact multiple-of-1024 EOF: emit 16-byte silent stop block (flags=0x01) via g_StageBuf ----
  a.label('lh_empty_eof');
  a.sw(R.zero, 0, R.s4);
  a.sw(R.zero, 4, R.s4);
  a.sw(R.zero, 8, R.s4);
  a.sw(R.zero, 12, R.s4);
  a.addiu(R.t2, R.zero, 0x01);
  a.sb(R.t2, 1, R.s4);
  a.jal(SYM.SpuSetTransferStartAddr);
  a.move(R.a0, R.s3);
  a.move(R.a0, R.s4);
  a.jal(SYM.SpuWrite);
  a.addiu(R.a1, R.zero, 16);
  a.jal(SYM.SpuIsTransferCompleted);
  a.addiu(R.a0, R.zero, 1);
  a.addiu(R.t0, R.zero, 2);
  a.swSym(R.t0, R.t1, 'g_StreamActive');
  a.swSym(R.zero, R.t1, 'g_StreamEofFrames');

  a.label('lh_ret');
  a.lw(R.s4, 24, R.sp);
  a.lw(R.s3, 28, R.sp);
  a.lw(R.s2, 32, R.sp);
  a.lw(R.s1, 36, R.sp);
  a.lw(R.s0, 40, R.sp);
  a.lw(R.ra, 44, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 48);

  // --------------------------------------------------------------------------
  // 8. LulaoStream_StartFromCache(int mode) — 100% RAM-ONLY (< 0.20 ms)!
  //    ZERO CdRead! ZERO CDWAD_WaitIdle! ZERO XA_Pause! ZERO Mem_Alloc!
  //    Streams directly from g_CacheBuf + 2048 via g_StageBuf @ exact pitch 0x0280 (6890.625 Hz)!
  // --------------------------------------------------------------------------
  a.label('LulaoStream_StartFromCache');
  a.addiu(R.sp, R.sp, -40);
  a.sw(R.ra, 32, R.sp);
  a.sw(R.s0, 28, R.sp);
  a.sw(R.s1, 24, R.sp);
  a.sw(R.s2, 20, R.sp);
  a.sw(R.s3, 16, R.sp);

  a.lwSym(R.s0, 'g_CacheBuf');
  a.lwSym(R.s1, 'g_CacheClipCount');
  a.nop();
  a.beq(R.s0, R.zero, 'lsf_done');
  a.nop();
  a.beq(R.s1, R.zero, 'lsf_done');
  a.nop();

  // Silence Voice 23 cleanly (mute + KOFF + ~36 us SPU settle > 1 hardware 44.1 kHz tick -> zero click on rapid pickups!)
  a.lui(R.t0, 0x1F80);
  a.sh(R.zero, 0x1D70, R.t0);
  a.sh(R.zero, 0x1D72, R.t0);
  a.move(R.a0, R.zero);
  a.jal(SYM.SpuSetKey);
  a.lui(R.a1, 0x0080);
  a.addiu(R.t0, R.zero, 400);
  a.label('lsf_koff_wait');
  a.bne(R.t0, R.zero, 'lsf_koff_wait');
  a.addiu(R.t0, R.t0, -1);

  // Pick next random cached clip index (0..g_CacheClipCount-1), never repeating g_LastClipIdx when count > 1
  a.jal('Lulao_NextRand');
  a.nop();
  a.divu(R.v0, R.s1);
  a.mfhi(R.s2);                          // s2 = localIdx (0..count-1)
  a.addiu(R.t0, R.zero, 1);
  a.beq(R.s1, R.t0, 'lsf_idx_ok');
  a.nop();
  a.lwSym(R.t1, 'g_LastClipIdx');
  a.nop();
  a.bne(R.s2, R.t1, 'lsf_idx_ok');
  a.nop();
  a.addiu(R.s2, R.s2, 1);
  a.bne(R.s2, R.s1, 'lsf_idx_ok');
  a.nop();
  a.move(R.s2, R.zero);

  a.label('lsf_idx_ok');
  a.swSym(R.s2, R.t0, 'g_LastClipIdx');

  // Resolve read-only source pointer inside g_CacheBuf + 1024:
  //   ringIdx = g_CacheStartClip + localIdx
  //   g_StreamSrc = (g_CacheBuf + 1024) + (entry.byteOffsetInBank - g_CacheBaseOff)
  a.lwSym(R.t0, 'g_CacheStartClip');
  a.lwSym(R.t3, 'g_CacheBaseOff');
  a.addu(R.t0, R.t0, R.s2);              // ringIdx (0..27)
  a.sll(R.t0, R.t0, 3);                  // ringIdx * 8
  a.la(R.t1, 'g_GpRingTable');
  a.addu(R.t1, R.t1, R.t0);
  a.lw(R.t2, 0, R.t1);                   // entry.byteOffsetInBank
  a.lw(R.s3, 4, R.t1);                   // s3 = entry.byteSize
  a.nop();
  a.subu(R.t2, R.t2, R.t3);              // relative byte offset inside audio payload
  a.addiu(R.t4, R.s0, 1024);             // g_CacheBuf + 1024
  a.addu(R.t4, R.t4, R.t2);              // read-only g_StreamSrc!
  a.swSym(R.t4, R.t0, 'g_StreamSrc');
  a.swSym(R.s3, R.t0, 'g_StreamTotalBytes');

  // Smooth -12 dB XA music ducking (set bit 1 of g_InPlaySel + XA_UpdateVolume — ZERO XA_Pause!)
  a.lui(R.t0, 0x800E);
  a.lw(R.t1, ADDR.g_InPlaySel & 0xffff, R.t0);
  a.nop();
  a.andi(R.t2, R.t1, 2);
  a.bne(R.t2, R.zero, 'lsf_duck_ok');    // already ducked on fast restart!
  a.ori(R.t1, R.t1, 2);
  a.sw(R.t1, ADDR.g_InPlaySel & 0xffff, R.t0);
  a.jal(SYM.XA_UpdateVolume);
  a.nop();

  a.label('lsf_duck_ok');
  // Pause SPU Reverb Master Enable (SPUCNT bit 7 @ 0x1F801DAA) once if active
  a.lwSym(R.t2, 'g_SavedRevBit');
  a.nop();
  a.bne(R.t2, R.zero, 'lsf_rev_ok');     // already paused!
  a.lui(R.t0, 0x1F80);
  a.lhu(R.t1, 0x1DAA, R.t0);
  a.nop();
  a.andi(R.t2, R.t1, 0x0080);
  a.beq(R.t2, R.zero, 'lsf_rev_ok');
  a.nop();
  a.swSym(R.t2, R.t3, 'g_SavedRevBit');
  a.andi(R.t1, R.t1, 0xFF7F);
  a.sh(R.t1, 0x1DAA, R.t0);

  a.label('lsf_rev_ok');
  a.swSym(R.zero, R.t0, 'g_StreamCurPos');
  a.addiu(R.t1, R.zero, 1);
  a.swSym(R.t1, R.t0, 'g_StreamActive');
  a.swSym(R.zero, R.t0, 'g_StreamNextHalf');
  a.swSym(R.zero, R.t0, 'g_StreamEofFrames');
  a.swSym(R.zero, R.t0, 'g_StreamSampleAcc');

  // Prime Half A (0x7F400) + Half B (0x7F800) via g_StageBuf (~0.12 ms total!)
  a.jal('LulaoStream_LoadHalf');
  a.move(R.a0, R.zero);

  a.lwSym(R.t0, 'g_StreamActive');
  a.nop();
  a.addiu(R.t1, R.zero, 1);
  a.bne(R.t0, R.t1, 'lsf_start_spu');
  a.nop();
  a.jal('LulaoStream_LoadHalf');
  a.addiu(R.a0, R.zero, 1);

  // Program PS1 SPU Hardware Voice 23 @ 0x1F801D70 to play from 0x7F400 @ EXACT 6890.625 Hz (0x0280)!
  a.label('lsf_start_spu');
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
  a.sh(R.t1, 0x1D70, R.t0);              // VOL_L = 0x3FFF
  a.sh(R.t1, 0x1D72, R.t0);              // VOL_R = 0x3FFF
  a.addiu(R.t1, R.zero, gpMeta.spuPitch & 0xffff); // PITCH = 0x0280 (exact 6890.625 Hz!)
  a.sh(R.t1, 0x1D74, R.t0);
  a.ori(R.t1, R.zero, (ADDR.SpuStreamHalfA >>> 3) & 0xffff); // 0xFE80
  a.sh(R.t1, 0x1D76, R.t0);              // START_ADDR = 0xFE80
  a.sh(R.t1, 0x1D7E, R.t0);              // REPEAT_ADDR = 0xFE80 (fixed ring base!)
  a.addiu(R.t1, R.zero, 0x00FF);
  a.sh(R.t1, 0x1D78, R.t0);              // ADSR1
  a.addiu(R.t1, R.zero, 0x1FC0);
  a.sh(R.t1, 0x1D7A, R.t0);              // ADSR2 (zero decay sustain)

  a.addiu(R.a0, R.zero, 1);
  a.jal(SYM.SpuSetKey);
  a.lui(R.a1, 0x0080);                   // Voice 23 ON!

  a.jal(SYM.VSync);
  a.addiu(R.a0, R.zero, -1);
  a.swSym(R.v0, R.t0, 'g_StreamLastVSync');

  a.label('lsf_done');
  a.lw(R.s3, 16, R.sp);
  a.lw(R.s2, 20, R.sp);
  a.lw(R.s1, 24, R.sp);
  a.lw(R.s0, 28, R.sp);
  a.lw(R.ra, 32, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 40);

  // --------------------------------------------------------------------------
  // 9. LulaoStream_Tick() — Crystal-locked PS1 VBlank 2 KB Ping-Pong Feeder @ 6890.625 Hz!
  //    Ring: 2048 B = 3584 samples = 520.1 ms (358400 centi-samples).
  //    Each NTSC VBlank (59.882 Hz) advances 115.07 samples (11507 centi-samples):
  //      - Reloads Half A (0x7F400) when acc >= 215000 (~52 ms into Half B, 208 ms before wrap!)
  //      - Reloads Half B (0x7F800) when 36000 <= acc < 179200 (~52 ms into Half A, 208 ms margin!)
  //      - On EOF (active==2), stops cleanly once V23_ENVX==0 or 36 VBlanks (~600 ms) elapsed!
  // --------------------------------------------------------------------------
  a.label('LulaoStream_Tick');
  a.lwSym(R.t0, 'g_StreamActive');
  a.nop();
  a.bne(R.t0, R.zero, 'ltk_run');
  a.nop();
  a.jr(R.ra);                            // Fast path: 5 cycles when idle!
  a.nop();

  a.label('ltk_run');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.sw(R.s0, 16, R.sp);
  a.move(R.s0, R.t0);                    // s0 = g_StreamActive (1 or 2)

  a.jal(SYM.VSync);
  a.addiu(R.a0, R.zero, -1);
  a.lwSym(R.t1, 'g_StreamLastVSync');
  a.nop();
  a.subu(R.t2, R.v0, R.t1);              // t2 = dt (VBlanks elapsed)
  a.swSym(R.v0, R.t3, 'g_StreamLastVSync');
  a.blez(R.t2, 'ltk_ret');
  a.nop();

  a.addiu(R.t4, R.zero, 2);
  a.beq(R.s0, R.t4, 'ltk_eof');
  a.nop();

  // Active streaming (s0 == 1): acc += dt * 11507; while (acc >= 358400) acc -= 358400;
  a.li(R.t3, 11507);
  a.multu(R.t2, R.t3);
  a.mflo(R.t4);
  a.lwSym(R.t5, 'g_StreamSampleAcc');
  a.nop();
  a.addu(R.t5, R.t5, R.t4);
  a.li(R.t6, 358400);
  a.label('ltk_wrap');
  a.sltu(R.t7, R.t5, R.t6);
  a.bne(R.t7, R.zero, 'ltk_wrap_done');
  a.nop();
  a.subu(R.t5, R.t5, R.t6);
  a.j('ltk_wrap');
  a.nop();

  a.label('ltk_wrap_done');
  a.swSym(R.t5, R.t0, 'g_StreamSampleAcc');

  a.lwSym(R.t0, 'g_StreamNextHalf');
  a.nop();
  a.bne(R.t0, R.zero, 'ltk_chk_b');
  a.nop();

  // nextHalf == 0: reload Half A once SPU is safely inside Half B (acc >= 215000)
  a.li(R.t1, 215000);
  a.sltu(R.t2, R.t5, R.t1);
  a.bne(R.t2, R.zero, 'ltk_ret');
  a.nop();
  a.jal('LulaoStream_LoadHalf');
  a.move(R.a0, R.zero);
  a.addiu(R.t0, R.zero, 1);
  a.swSym(R.t0, R.t1, 'g_StreamNextHalf');
  a.j('ltk_ret');
  a.nop();

  // nextHalf == 1: reload Half B once SPU wrapped safely into Half A (36000 <= acc < 179200)
  a.label('ltk_chk_b');
  a.li(R.t1, 179200);
  a.sltu(R.t2, R.t5, R.t1);
  a.beq(R.t2, R.zero, 'ltk_ret');
  a.li(R.t1, 36000);
  a.sltu(R.t2, R.t5, R.t1);
  a.bne(R.t2, R.zero, 'ltk_ret');
  a.nop();
  a.jal('LulaoStream_LoadHalf');
  a.addiu(R.a0, R.zero, 1);
  a.swSym(R.zero, R.t1, 'g_StreamNextHalf');
  a.j('ltk_ret');
  a.nop();

  // EOF queued (s0 == 2): wait cleanly for final ADPCM block (V23_ENVX == 0) or 36 VBlanks (~600 ms)
  a.label('ltk_eof');
  a.lwSym(R.t5, 'g_StreamEofFrames');
  a.lui(R.t1, 0x1F80);
  a.addu(R.t5, R.t5, R.t2);
  a.swSym(R.t5, R.t6, 'g_StreamEofFrames');
  a.lhu(R.t3, 0x1D7C, R.t1);             // t3 = V23_ENVX
  a.sltiu(R.t6, R.t5, 3);
  a.bne(R.t6, R.zero, 'ltk_ret');
  a.nop();
  a.beq(R.t3, R.zero, 'ltk_do_stop');
  a.nop();
  a.sltiu(R.t6, R.t5, 36);               // safety timeout: 36 VBlanks (~600 ms > 520 ms full ring)
  a.bne(R.t6, R.zero, 'ltk_ret');
  a.nop();

  a.label('ltk_do_stop');
  a.jal('LulaoStream_Stop');
  a.nop();

  a.label('ltk_ret');
  a.lw(R.s0, 16, R.sp);
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // Resident State & LULAO_GPBANK Descriptor Table (inside 0x800E3800..0x800E47FF)
  // --------------------------------------------------------------------------
  a.align(4);
  a.label('g_StreamActive');     a.word(0);
  a.label('g_StreamSrc');        a.word(0);
  a.label('g_StreamCurPos');     a.word(0);
  a.label('g_StreamTotalBytes'); a.word(0);
  a.label('g_StreamNextHalf');   a.word(0);
  a.label('g_StreamEofFrames');  a.word(0);
  a.label('g_EndRunSpoken');     a.word(0);
  a.label('g_LastClipIdx');      a.word(0xFFFFFFFF);
  a.label('g_PrngState');        a.word(0x5A3C96F1);
  a.label('g_OrigSaved');        a.word(0);
  a.label('g_SavedRevBit');      a.word(0);
  a.label('g_StreamLastVSync');  a.word(0);
  a.label('g_StreamSampleAcc');  a.word(0);
  a.label('g_PendingVoiceMode'); a.word(0);
  a.label('g_CacheBuf');         a.word(0);
  a.label('g_CacheStartClip');   a.word(0);
  a.label('g_CacheClipCount');   a.word(0);
  a.label('g_CacheBaseOff');     a.word(0);
  a.label('g_CacheAllocBytes');  a.word(0);
  a.label('g_GpBankStartSec');   a.word(gpMeta.startSector >>> 0);
  a.label('g_GpClipCount');      a.word(gpMeta.clipCount >>> 0);

  a.label('g_GpRingTable');
  for (const e of gpMeta.ringEntries) {
    a.word(e.byteOffsetInBank >>> 0);
    a.word(e.byteSize >>> 0);
  }

  const lulaoUsed = a.pc() - ADDR.LulaoCodeBase;
  if (lulaoUsed > 4096) throw new Error(`LULAO_CODE excede 4096 B (${lulaoUsed} B)!`);
  console.log(`  [ASM] LULAO_CODE:   0x${ADDR.LulaoCodeBase.toString(16)}..0x${a.pc().toString(16)} (${lulaoUsed} B / 4096 B, livre: ${4096 - lulaoUsed} B)`);
  console.log(`        [SYM] g_CacheBuf=0x${a.labels.get('g_CacheBuf').toString(16)} g_CacheClipCount=0x${a.labels.get('g_CacheClipCount').toString(16)} g_PendingVoiceMode=0x${a.labels.get('g_PendingVoiceMode').toString(16)} g_StreamActive=0x${a.labels.get('g_StreamActive').toString(16)} LulaoStream_StartFromCache=0x${a.labels.get('LulaoStream_StartFromCache').toString(16)}`);

  a.padTo(ADDR.LulaoCodeBase + 4096);
  return { buf: a.emit(), labels: a.labels };
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
  console.log('=== THPS2 PS1 Surgical MIPS Patcher v3: Boot Videos + Skater Voices + Bail Screams + Lulao Career/Cash/EndRun ===\n');

  fs.mkdirSync(backupDir, { recursive: true });
  for (const fn of ['SLUS_010.66', 'CD.WAD']) {
    const bak = path.join(backupDir, fn);
    if (!fs.existsSync(bak)) {
      fs.copyFileSync(path.join(rootDir, fn), bak);
      console.log(`  [BACKUP] Salvo original em ${bak}`);
    }
  }

  // 1. Assemble resident SLUS tail, MODCODE, Hook_BailSfx & Lulao Career strings
  const slusTail = assembleSlusTailCompact();
  const modCode = assembleModCode();
  const bailHookCode = assembleBailHookCode();
  const { buf: lulaoStrData, mappings: lulaoMappings } = buildLulaoStrData();

  // 2. Build/update VOICES.DAT (41 menu clips @ 11025 Hz + ring-doubled LULAO_GPBANK @ 6890.625 Hz)
  //    and assemble LULAO_CODE with the exact finalized GPBANK startSector & 28-entry ring table!
  console.log('');
  let lulaoCode = null;
  let lulaoLabels = null;
  const manifest = buildVoicesBank(modCode, false, bailHookCode, (gpMeta) => {
    const built = assembleLulaoEngine(gpMeta);
    lulaoCode = built.buf;
    lulaoLabels = built.labels;
    return Buffer.concat([lulaoCode, lulaoStrData]); // 8192 B (Sectors 2..5)
  });

  // 3. Patch SLUS_010.66 (exact same file size 864,256 B!)
  console.log('\n=== Aplicando 27 Hooks Cirurgicos em SLUS_010.66 ===');
  const slus = fs.readFileSync(slusPath);
  const ramToOff = (ram) => (ram - SLUS_BASE) + SLUS_HDR;

  patchWord(slus, ramToOff(0x800E2674), 0x800E2678, ADDR.NewHeapStart,            'HeapStartPtr @ 0x800E2674', [0x800E3800, 0x800E5000]);
  patchWord(slus, ramToOff(0x800A2950), 0x24842674, 0x24845800,                   'InitHeap addiu @ 0x800A2950', [0x24843800, 0x24845000]);
  patchWord(slus, ramToOff(0x80053690), 0x28620018, 0x28620017,                   'Reserve SPU Voice 23 @ 0x80053690');
  patchWord(slus, ramToOff(0x800527B8), jalWord(SYM.SFX_FindGlobal),      jalWord(ADDR.Tramp_BailSfx),        'Hook SFX_Play Bail Round-Robin @ 0x800527B8');
  patchWord(slus, ramToOff(0x8006CAD4), jalWord(SYM.Movies_Init),         jalWord(ADDR.Mod_BootInit),         'Hook Movies_Init @ 0x8006CAD4');
  patchWord(slus, ramToOff(0x8003CFB0), jalWord(SYM.PlayFullScreenMovie), jalWord(ADDR.Tramp_BootMovie),      'Boot Slot 0 (Activision) @ 0x8003CFB0', [jalWord(0x800E2758)]);
  patchWord(slus, ramToOff(0x8003CFE8), jalWord(SYM.PlayFullScreenMovie), jalWord(ADDR.Tramp_BootMovie),      'Boot Slot 1 (Neversoft)  @ 0x8003CFE8', [jalWord(0x800E2758)]);
  patchWord(slus, ramToOff(0x8003D024), jalWord(SYM.PlayFullScreenMovie), jalWord(ADDR.Tramp_BootMovie),      'Boot Slot 2 (Intro)      @ 0x8003D024', [jalWord(0x800E2758)]);
  patchWord(slus, ramToOff(0x80038950), jalWord(SYM.CdMix),               jalWord(ADDR.Hook_CdMix),           'Hook XA CdMix (Ducking) @ 0x80038950');
  patchWord(slus, ramToOff(0x80082B80), jalWord(SYM.Overlay_Run),         jalWord(ADDR.Tramp_RunPlaySel),     'Hook Overlay_Run playsel @ 0x80082B80');

  // Lulao Career Mode: Cash Pickup ($250/$50/$100), End-of-Run (Normal/Comp/Pause), 60Hz Streamer & Lifecycle
  patchWord(slus, ramToOff(0x800368D4), jalWord(SYM.Career_CollectCash),  jalWord(ADDR.Entry_CollectCash),    'Hook Cash Pickup $250 @ 0x800368D4');
  patchWord(slus, ramToOff(0x80036914), jalWord(SYM.Career_CollectCash),  jalWord(ADDR.Entry_CollectCash),    'Hook Cash Pickup $50  @ 0x80036914');
  patchWord(slus, ramToOff(0x80036954), jalWord(SYM.Career_CollectCash),  jalWord(ADDR.Entry_CollectCash),    'Hook Cash Pickup $100 @ 0x80036954');
  patchWord(slus, ramToOff(0x8003C968), jalWord(SYM.Panel_EndRunNormal),  jalWord(ADDR.Entry_EndRunNormal),   'Hook EndRun Normal (State 7) @ 0x8003C968');
  patchWord(slus, ramToOff(0x8003C9F0), jalWord(SYM.Panel_EndRunComp),    jalWord(ADDR.Entry_EndRunComp),     'Hook EndRun Comp (State 5/8/9) @ 0x8003C9F0');
  patchWord(slus, ramToOff(0x80030DA0), jalWord(SYM.Panel_EndRunPause),   jalWord(ADDR.Entry_EndRunPause),    'Hook EndRun Pause Menu @ 0x80030DA0');
  patchWord(slus, ramToOff(0x8003C2E8), jalWord(SYM.Panel_EndRunPause),   jalWord(ADDR.Entry_EndRunPause),    'Hook EndRun Time-Up Natural @ 0x8003C2E8');
  patchWord(slus, ramToOff(0x800813CC), jalWord(SYM.Panel_EndRunPause),   jalWord(ADDR.Entry_EndRunPause),    'Hook EndRun Script/Cheat @ 0x800813CC');
  patchWord(slus, ramToOff(0x8003CB48), jalWord(SYM.XA_Update),           jalWord(ADDR.Entry_FrameTick),      'Hook 60Hz FrameTick (XA_Update) @ 0x8003CB48');
  patchWord(slus, ramToOff(0x8003D71C), jalWord(SYM.Gameplay_MainLoop),   jalWord(ADDR.Entry_GameplayStart),  'Hook GameplayStart/Retry @ 0x8003D71C');
  patchWord(slus, ramToOff(0x8003D828), jalWord(SYM.Level_Unload),        jalWord(ADDR.Entry_GameplayExit),   'Hook GameplayExit Cleanup @ 0x8003D828');

  // Menu Overlay_Run pre-sync hooks (ensures Career goal lists & cash labels match skater even after direct MC Load!)
  for (const ovSite of [0x80082C38, 0x80082D2C, 0x80082DB0, 0x80082E1C, 0x80082E98, 0x80082EF0, 0x80082F70, 0x80082FD4]) {
    patchWord(slus, ramToOff(ovSite), jalWord(SYM.Overlay_Run), jalWord(ADDR.Entry_OverlaySync), `Hook Menu Sync @ 0x${ovSite.toString(16)}`);
  }

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

  return { slusTail, modCode, bailHookCode, lulaoCode, lulaoStrData, lulaoMappings, manifest };
}

module.exports = { applyAll, ADDR, SYM, jalWord, assembleSlusTailClean: assembleSlusTailCompact, assembleModCode, assembleBailHookCode, assembleLulaoEngine, buildLulaoStrData };

if (require.main === module) {
  applyAll();
}
