#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) — Crash Bandicoot ("Crash B.", Slot 20) Engine Integration
 *
 * Strictly ADDS Crash B. as brand-new playable Slot 20 with ZERO deletion or modification
 * of any existing skater (Slots 0..19 remain 100% intact!).
 *
 * Zero-Heap-Cost Resident Memory Map inside freed SLUS_010.66 g_LevelTable RAM
 * (0x800B82C4..0x800B943F = 4,476 B; ALL 102 legacy g_LevelTable refs relocated to 0x800E6000!):
 *   - 0x800B82C4..0x800B8417 ( 340 B): g_SkaterTable[20] ("Crash B.") IN-PLACE (0 skater-table relocs!)
 *   - 0x800B8418..0x800B841B (   4 B): g_CrashStyle (0 = Classic Crash 3, 1 = Warped Moto Biker)
 *   - 0x800B8444..0x800B85C3 ( 384 B): Relocated g_CreateASkaterExtraDecks[12] (only 2 refs in SLUS!)
 *   - 0x800B85C4..0x800B86A7 ( 228 B): g_CrashCareerData (SCareerSkater[20] — 100% MC save compatible!)
 *   - 0x800B86A8..0x800B86D7 (  48 B): g_CrashDeckShadow (+2=deckIdx=0, +22=brand=20, +42=wheel=1)
 *   - 0x800B86D8..0x800B873B ( 100 B): g_CrashExtCareer (THPS1 levels 11..19 progress for Crash B.)
 *   - 0x800B873C..0x800B89AF ( 628 B): Relocated g_Thps1Hed[52] (indexes ALL THPS1.WAD + 33 Crash assets!)
 *   - 0x800B89B0..0x800B8BFF ( 592 B): CRASH_CODE (8 resident MIPS R3000A hooks + 9-pair hash swap table)
 *   - 0x800B8C00..0x800B8E7F ( 640 B): Crash B. Skater Strings, 8 Crash 3 Deck Names & PT-BR Bio
 *   - 0x800B8E80..0x800B943F (1472 B): Crash B. Dynamic Goal/HUD/Cash/Podium String Table + Backup + Pool
 */

const fs = require('fs');
const path = require('path');
const { nsHash } = require('./psx_skater_lib');

const ROOT = path.resolve(__dirname, '..');
const ORIG_SLUS_PATH = path.join(ROOT, 'originals_backup', 'SLUS_010.66');
const ORIG_WAD_PATH  = path.join(ROOT, 'originals_backup', 'CD.WAD');
const ORIG_HED_PATH  = path.join(ROOT, 'originals_backup', 'CD.HED');

const SLUS_BASE = 0x80010000;
const SLUS_HDR  = 0x800;

const CRASH_ADDR = {
  SkaterEntry20:     0x800B82C4, // 340 B -> 0x800B8418
  CrashStyle:        0x800B8418, //   4 B -> 0x800B841C
  ExtraDecksReloc:   0x800B8444, // 384 B -> 0x800B85C4
  CrashCareerData:   0x800B85C4, // 228 B -> 0x800B86A8
  CrashDeckShadow:   0x800B86A8, //  48 B -> 0x800B86D8 (+2=deckIdx, +22=brandSkater, +42=wheelColor)
  CrashExtCareer:    0x800B86D8, // 100 B -> 0x800B873C
  Thps1Hed:          0x800B873C, // 564 B -> 0x800B8970 (46 * 12 + 4 = 556 B, we use 38!)
  CodeBase:          0x800B8970, // 816 B -> 0x800B8CA0 (we use ~668 B, 148 B free!)
  SkaterStrings:     0x800B8CA0, // 656 B -> 0x800B8F30 (we use ~628 B)
  StrMapBase:        0x800B8F30, // 50 * 8 + 8 = 408 B -> 0x800B90C8 (max 50 pairs + {0,0})
  StrOrigBackup:     0x800B90C8, // 50 * 4 = 200 B     -> 0x800B9190
  StrPoolBase:       0x800B9190, // 688 B              -> 0x800B9440 (we use ~295 B, 393 B free!)
  RegionEnd:         0x800B9440,

  // Fixed entry jump table @ 0x800B8970 (8 B per entry = j + nop)
  Entry_GetSkaterCareerData: 0x800B8970,
  Entry_GetSkaterStyle:      0x800B8978,
  Entry_SetSkaterStyle:      0x800B8980,
  Entry_SyncActiveDeck:      0x800B8988,
  Entry_EquipDeckBasePtr:    0x800B8990,
  Entry_EquipWheelBasePtr:   0x800B8998,
  Entry_EquipSponsorGuard:   0x800B89A0,
  Entry_CdWadCrashIntercept: 0x800B89A8,
  Entry_CrashCareerReset:    0x800B89B0,
};

// ============================================================================
// Self-Verifying MIPS I (R3000A) Assembler
// ============================================================================
const R = {
  zero:0, at:1, v0:2, v1:3, a0:4, a1:5, a2:6, a3:7,
  t0:8, t1:9, t2:10, t3:11, t4:12, t5:13, t6:14, t7:15,
  s0:16, s1:17, s2:18, s3:19, s4:20, s5:21, s6:22, s7:23,
  t8:24, t9:25, k0:26, k1:27, gp:28, sp:29, fp:30, ra:31,
};

function splitHiLo(addr) {
  const hi = ((addr + 0x8000) >>> 16) & 0xFFFF;
  const lo = addr & 0xFFFF;
  return { hi, lo };
}

class MipsAsm {
  constructor(baseAddr) {
    this.base = baseAddr >>> 0;
    this.bytesList = [];
    this.labels = new Map();
    this.fixups = [];
  }
  pc() { return (this.base + this.bytesList.length) >>> 0; }
  label(name) {
    if (this.labels.has(name)) throw new Error(`Duplicate label: ${name}`);
    this.labels.set(name, this.pc());
  }
  align(n) { while (this.bytesList.length % n !== 0) this.bytesList.push(0); }
  padTo(addr) {
    const need = (addr >>> 0) - this.base;
    if (need < this.bytesList.length) throw new Error(`padTo(0x${addr.toString(16)}) overflow (cur=0x${this.pc().toString(16)})`);
    while (this.bytesList.length < need) this.bytesList.push(0);
  }
  word(w) {
    const v = w >>> 0;
    this.bytesList.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
  }
  r(fn, rs, rt, rd, sh = 0) { this.word(((rs & 31) << 21) | ((rt & 31) << 16) | ((rd & 31) << 11) | ((sh & 31) << 6) | (fn & 63)); }
  i(op, rs, rt, imm) { this.word(((op & 63) << 26) | ((rs & 31) << 21) | ((rt & 31) << 16) | (imm & 0xFFFF)); }
  jOp(op, target) {
    if (typeof target === 'string') {
      this.fixups.push({ type: 'J', off: this.bytesList.length, op, target });
      this.word(0);
    } else {
      this.word(((op & 63) << 26) | ((target >>> 2) & 0x03FFFFFF));
    }
  }
  br(op, rs, rt, target) {
    if (typeof target === 'string') {
      this.fixups.push({ type: 'B', off: this.bytesList.length, op, rs, rt, target });
      this.word(0);
    } else {
      const rel = (((target >>> 0) - (this.pc() + 4)) >> 2) & 0xFFFF;
      this.i(op, rs, rt, rel);
    }
  }
  nop() { this.word(0); }
  sll(rd, rt, sh) { this.r(0x00, 0, rt, rd, sh); }
  jr(rs) { this.r(0x08, rs, 0, 0); }
  addu(rd, rs, rt) { this.r(0x21, rs, rt, rd); }
  subu(rd, rs, rt) { this.r(0x23, rs, rt, rd); }
  move(rd, rs) { this.addu(rd, rs, R.zero); }
  j(t) { this.jOp(0x02, t); }
  jal(t) { this.jOp(0x03, t); }
  beq(rs, rt, t) { this.br(0x04, rs, rt, t); }
  bne(rs, rt, t) { this.br(0x05, rs, rt, t); }
  addiu(rt, rs, imm) { this.i(0x09, rs, rt, imm); }
  sltiu(rt, rs, imm) { this.i(0x0B, rs, rt, imm); }
  lui(rt, imm) { this.i(0x0F, 0, rt, imm); }
  lw(rt, imm, rs) { this.i(0x23, rs, rt, imm); }
  lbu(rt, imm, rs) { this.i(0x24, rs, rt, imm); }
  sb(rt, imm, rs) { this.i(0x28, rs, rt, imm); }
  sw(rt, imm, rs) { this.i(0x2B, rs, rt, imm); }
  la(rt, target) {
    if (typeof target === 'string') {
      this.fixups.push({ type: 'LA', off: this.bytesList.length, rt, target });
      this.word(0); this.word(0);
    } else {
      const { hi, lo } = splitHiLo(target >>> 0);
      this.lui(rt, hi);
      this.addiu(rt, rt, lo);
    }
  }
  emit() {
    const buf = Buffer.from(this.bytesList);
    for (const f of this.fixups) {
      if (!this.labels.has(f.target)) throw new Error(`Unresolved label: ${f.target}`);
      const tgt = this.labels.get(f.target);
      const curPc = (this.base + f.off) >>> 0;
      if (f.type === 'J') {
        buf.writeUInt32LE((((f.op & 63) << 26) | ((tgt >>> 2) & 0x03FFFFFF)) >>> 0, f.off);
      } else if (f.type === 'B') {
        const rel = (tgt - (curPc + 4)) >> 2;
        if (rel < -32768 || rel > 32767) throw new Error(`Branch out of range to ${f.target}`);
        buf.writeUInt32LE((((f.op & 63) << 26) | ((f.rs & 31) << 21) | ((f.rt & 31) << 16) | (rel & 0xFFFF)) >>> 0, f.off);
      } else if (f.type === 'LA') {
        const { hi, lo } = splitHiLo(tgt);
        buf.writeUInt32LE(((0x0F << 26) | ((f.rt & 31) << 16) | hi) >>> 0, f.off);
        buf.writeUInt32LE(((0x09 << 26) | ((f.rt & 31) << 21) | ((f.rt & 31) << 16) | lo) >>> 0, f.off + 4);
      }
    }
    return buf;
  }
}

function jalW(tgt) { return (0x0C000000 | ((tgt >>> 2) & 0x03FFFFFF)) >>> 0; }
function jW(tgt)   { return (0x08000000 | ((tgt >>> 2) & 0x03FFFFFF)) >>> 0; }
function r2f(ram)  { return (ram - SLUS_BASE) + SLUS_HDR; }

function patchExact(buf, off, origVal, newVal, label, altOrigs = []) {
  const cur = buf.readUInt32LE(off);
  if (cur !== origVal && cur !== newVal && !altOrigs.includes(cur)) {
    throw new Error(`Patch mismatch [${label}] @ 0x${off.toString(16)}: cur=0x${cur.toString(16)} exp=0x${origVal.toString(16)}`);
  }
  buf.writeUInt32LE(newVal >>> 0, off);
}

// ============================================================================
// 1. Assemble Resident CRASH_CODE @ 0x800B89B0..0x800B8BFF (592 B)
// ============================================================================
function assembleCrashCode() {
  const a = new MipsAsm(CRASH_ADDR.CodeBase);
  const MAX_BYTES = CRASH_ADDR.SkaterStrings - CRASH_ADDR.CodeBase; // 592 B

  // Fixed Entry Jump Table
  const entries = [
    [CRASH_ADDR.Entry_GetSkaterCareerData, 'Hook_GetSkaterCareerData'],
    [CRASH_ADDR.Entry_GetSkaterStyle,      'Hook_GetSkaterStyle'],
    [CRASH_ADDR.Entry_SetSkaterStyle,      'Hook_SetSkaterStyle'],
    [CRASH_ADDR.Entry_SyncActiveDeck,      'Hook_SyncActiveDeck'],
    [CRASH_ADDR.Entry_EquipDeckBasePtr,    'Hook_EquipDeckBasePtr'],
    [CRASH_ADDR.Entry_EquipWheelBasePtr,   'Hook_EquipWheelBasePtr'],
    [CRASH_ADDR.Entry_EquipSponsorGuard,   'Hook_EquipSponsorGuard'],
    [CRASH_ADDR.Entry_CdWadCrashIntercept, 'Hook_CdWadCrashIntercept'],
    [CRASH_ADDR.Entry_CrashCareerReset,    'Hook_CrashCareerReset'],
  ];
  for (const [addr, lbl] of entries) {
    a.padTo(addr);
    a.j(lbl);
    a.nop();
  }

  // 1. Hook_GetSkaterCareerData(int skaterIdx $a0) [j @ 0x8002600C]
  //    Returns &g_CrashCareerData (0x800B85C4) if a0 == 20, else 0x800BA78C + a0 * 228!
  a.label('Hook_GetSkaterCareerData');
  a.addiu(R.v1, R.zero, 20);
  a.beq(R.a0, R.v1, 'gscd_crash');
  a.sll(R.v0, R.a0, 3);
  a.subu(R.v0, R.v0, R.a0);
  a.sll(R.v0, R.v0, 3);
  a.addu(R.v0, R.v0, R.a0);
  a.sll(R.v0, R.v0, 2);
  a.la(R.v1, 0x800BA78C);
  a.jr(R.ra);
  a.addu(R.v0, R.v0, R.v1);
  a.label('gscd_crash');
  a.la(R.v0, CRASH_ADDR.CrashCareerData);
  a.jr(R.ra);
  a.nop();

  // 2. Hook_GetSkaterStyle(CCareer* $a0, int skaterIdx $a1) [j @ 0x8008A73C]
  a.label('Hook_GetSkaterStyle');
  a.addiu(R.v1, R.zero, 20);
  a.beq(R.a1, R.v1, 'gss_crash');
  a.sll(R.a1, R.a1, 2);
  a.addu(R.a0, R.a0, R.a1);
  a.lw(R.v0, 104, R.a0);
  a.jr(R.ra);
  a.nop();
  a.label('gss_crash');
  a.la(R.v1, CRASH_ADDR.CrashStyle);
  a.lw(R.v0, 0, R.v1);
  a.jr(R.ra);
  a.nop();

  // 3. Hook_SetSkaterStyle [j @ 0x8008A708]
  //    On entry: v1 = skaterIdx, s5 = g_Career, s1 = style; stack still holds s5 @ 36(sp), s1 @ 20(sp) (frame 48 B)
  a.label('Hook_SetSkaterStyle');
  a.addiu(R.t8, R.zero, 20);
  a.beq(R.v1, R.t8, 'sss_crash');
  a.sll(R.v1, R.v1, 2);
  a.addu(R.v1, R.s5, R.v1);
  a.lw(R.s5, 36, R.sp);
  a.sw(R.s1, 104, R.v1);
  a.lw(R.s1, 20, R.sp);
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 48);
  a.label('sss_crash');
  a.la(R.v1, CRASH_ADDR.CrashStyle);
  a.lw(R.s5, 36, R.sp);
  a.sw(R.s1, 0, R.v1);
  a.lw(R.s1, 20, R.sp);
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 48);

  // 4. Hook_SyncActiveDeck [jal @ 0x80083AC4, delay slot @ 0x80083AC8 executes sb a2, 0(a0)]
  //    On entry: a2 = skaterIdx, v0 = s7 + a2. Returns v0 = v1 = basePtr, a1 = lbu 22(v0)!
  a.label('Hook_SyncActiveDeck');
  a.addiu(R.t8, R.zero, 20);
  a.bne(R.a2, R.t8, 'sad_orig');
  a.nop();
  a.la(R.v0, CRASH_ADDR.CrashDeckShadow);
  a.label('sad_orig');
  a.lbu(R.a1, 22, R.v0);
  a.jr(R.ra);
  a.move(R.v1, R.v0); // fills lbu a1 load-delay slot too!

  // 5. Hook_EquipDeckBasePtr [jal @ equipsel +0x1088, delay slot executes sb t3, 62(v1)]
  //    On entry: a3 = 0x800B5E1C, t4 = curSkaterIdx -> returns v0 = basePtr for +2 & +22 writes!
  a.label('Hook_EquipDeckBasePtr');
  a.addiu(R.t8, R.zero, 20);
  a.beq(R.t4, R.t8, 'edb_crash');
  a.addu(R.v0, R.a3, R.t4);
  a.jr(R.ra);
  a.nop();
  a.label('edb_crash');
  a.la(R.v0, CRASH_ADDR.CrashDeckShadow);
  a.jr(R.ra);
  a.nop();

  // 6. Hook_EquipWheelBasePtr [jal @ equipsel +0x44B8, delay slot executes lbu a2, 364(s0)]
  //    On entry: v1 = 0x800B5E1C, a1 = curSkaterIdx -> returns v1 = basePtr for +42 write!
  a.label('Hook_EquipWheelBasePtr');
  a.addiu(R.t8, R.zero, 20);
  a.beq(R.a1, R.t8, 'ewb_crash');
  a.addu(R.v1, R.v1, R.a1);
  a.jr(R.ra);
  a.nop();
  a.label('ewb_crash');
  a.la(R.v1, CRASH_ADDR.CrashDeckShadow);
  a.jr(R.ra);
  a.nop();

  // 7. Hook_EquipSponsorGuard [jal @ equipsel +0x11CC, delay slot = nop]
  //    On entry: v0 = brandSkaterIdx (0..20), a1 = sponsorLogos[20]. Returns v1 = (v0<20 ? a1[v0] : 0)!
  a.label('Hook_EquipSponsorGuard');
  a.sltiu(R.t8, R.v0, 20);
  a.beq(R.t8, R.zero, 'esg_none');
  a.sll(R.v0, R.v0, 2);
  a.addu(R.v0, R.a1, R.v0);
  a.lw(R.v1, 0, R.v0);
  a.jr(R.ra);
  a.nop();
  a.label('esg_none');
  a.jr(R.ra);
  a.move(R.v1, R.zero);

  // 8. Hook_CdWadCrashIntercept [jal @ 0x80054154 inside CDWAD_Open]
  //    Calls original nsHash(a0) @ 0x80053F00 -> v0.
  //    ONLY if selectedSkaterIdx == 20 (Crash B.), swaps items.psx & level *_o.psx hashes
  //    to our Crash-exclusive 3D collectible banks in THPS1.WAD! Zero impact on Slots 0..19!
  a.label('Hook_CdWadCrashIntercept');
  a.addiu(R.sp, R.sp, -16);
  a.sw(R.ra, 12, R.sp);
  a.jal(0x80053F00);
  a.nop();

  // Inline fast-path GetSelectedSkaterIdx(0x800C2958): 100(g_Career) -> curPlayer, 4(g_Career + curPlayer*12) -> skaterIdx
  a.la(R.t0, 0x800C2958);
  a.lw(R.t1, 100, R.t0);
  a.nop();
  a.sll(R.t2, R.t1, 1);
  a.addu(R.t2, R.t2, R.t1);
  a.sll(R.t2, R.t2, 2);
  a.addu(R.t0, R.t0, R.t2);
  a.lw(R.t1, 4, R.t0);
  a.addiu(R.t2, R.zero, 20);        // fills lw delay slot!
  a.bne(R.t1, R.t2, 'cwi_ret');
  a.nop();

  a.la(R.t0, 'g_CrashHashSwapTbl');
  a.label('cwi_lp');
  a.lw(R.t1, 0, R.t0);
  a.nop();
  a.beq(R.t1, R.zero, 'cwi_ret');
  a.nop();
  a.beq(R.t1, R.v0, 'cwi_hit');
  a.addiu(R.t0, R.t0, 8);
  a.j('cwi_lp');
  a.nop();
  a.label('cwi_hit');
  a.lw(R.v0, -4, R.t0);
  a.nop();

  a.label('cwi_ret');
  a.lw(R.ra, 12, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 16);

  // 9. Hook_CrashCareerReset (tail-called from THPS1 Hook_CareerResetExt on New Career!)
  //    Zeroes g_CrashExtCareer[100 B], g_CrashStyle, resets g_CrashDeckShadow, then tail-jumps to 0x8002C4D8!
  a.label('Hook_CrashCareerReset');
  a.la(R.t8, CRASH_ADDR.CrashExtCareer);
  a.addiu(R.t9, R.t8, 100);
  a.label('ccr_lp');
  a.sw(R.zero, 0, R.t8);
  a.addiu(R.t8, R.t8, 4);
  a.bne(R.t8, R.t9, 'ccr_lp');
  a.nop();
  a.la(R.t8, CRASH_ADDR.CrashStyle);
  a.sw(R.zero, 0, R.t8);
  a.la(R.t8, CRASH_ADDR.CrashDeckShadow);
  a.sb(R.zero, 2, R.t8);
  a.addiu(R.t9, R.zero, 20);
  a.sb(R.t9, 22, R.t8);
  a.addiu(R.t9, R.zero, 1);
  a.sb(R.t9, 42, R.t8);
  a.j(0x8002C4D8);
  a.nop();

  // Crash-Exclusive Hash Swap Table (9 pairs + {0,0} terminator = 80 B)
  a.align(4);
  a.label('g_CrashHashSwapTbl');
  const swaps = [
    ['items.psx',    'crash_it.psx'],
    ['skhan_o.psx',  'cr_han_o.psx'],
    ['skhan_o2.psx', 'cr_han_o.psx'],
    ['skware_o.psx', 'cr_ware.psx'],
    ['skschl_o.psx', 'cr_schl.psx'],
    ['skmall_o.psx', 'cr_mall.psx'],
    ['skdown_o.psx', 'cr_down.psx'],
    ['skjam_o.psx',  'cr_jam.psx'],
    ['sksf_o.psx',   'cr_sf.psx'],
  ];
  for (const [src, dst] of swaps) {
    a.word(nsHash(src));
    a.word(nsHash(dst));
  }
  a.word(0);
  a.word(0);

  const used = a.pc() - CRASH_ADDR.CodeBase;
  if (used > MAX_BYTES) throw new Error(`CRASH_CODE exceeds ${MAX_BYTES} B (${used} B)!`);
  console.log(`  [ASM] CRASH_CODE  : 0x${CRASH_ADDR.CodeBase.toString(16)}..0x${a.pc().toString(16)} (${used} B / ${MAX_BYTES} B, livre: ${MAX_BYTES - used} B)`);
  a.padTo(CRASH_ADDR.CodeBase + MAX_BYTES);
  return a.emit();
}

// ============================================================================
// 2. Patch tricks.bin Buffer (Adds 21-Entry Table + Crash B. Bob+Rodney Block)
// ============================================================================
function buildPatchedTricksBin(origTricks) {
  // Original tricks.bin = 33,168 B (0x8190).
  // Append at 0x8190:
  //   - 0x8190..0x81B9 (42 B): 21 uint16 skater offsets ([0..19] verbatim, [20] = 0x81BC)
  //   - 0x81BA..0x81BB ( 2 B): alignment pad
  //   - 0x81BC..0x8337 (380 B): Bob Burnquist [1] (0x0AB0..0x0C1D, 366 B)
  //                           + Rodney Mullen's "Casper to 360 Flip" (0003 0002 0004 0009 77e7 a032, 12 B)
  //                           + 0000 terminator (2 B)
  // Total = 33,592 B (fits inside original 17 sectors = 34,816 B AND inside panel.pre & tricksel.pre slack!)
  if (origTricks.length !== 33168) {
    throw new Error(`tricks.bin tamanho inesperado: ${origTricks.length} != 33168`);
  }
  const origTblOff = origTricks.readUInt16LE(0);
  if (origTblOff !== 0x00AC) throw new Error(`tricks.bin header[0] inesperado: 0x${origTblOff.toString(16)}`);

  // Verify Bob Burnquist [1] @ 0x0AB0..0x0C1F and Rodney Mullen [7] special @ 0x0262..0x026D
  const bobOff = origTricks.readUInt16LE(origTblOff + 1 * 2);
  if (bobOff !== 0x0AB0 || origTricks.readUInt16LE(0x0C1E) !== 0x0000) {
    throw new Error(`Bob Burnquist trick block mismatch (bobOff=0x${bobOff.toString(16)})`);
  }
  const rodneyCasper = Buffer.from([0x03,0x00, 0x02,0x00, 0x04,0x00, 0x09,0x00, 0xe7,0x77, 0x32,0xa0]);
  if (!origTricks.subarray(0x0262, 0x026E).equals(rodneyCasper)) {
    throw new Error('Rodney Mullen Casper to 360 Flip bytes mismatch @ 0x0262!');
  }

  // Insert Rodney's special right after Bob's 3 specials (0x0AB0..0x0AD3 = 36 B) so all 4 specials sit together!
  const bobSpecials = origTricks.subarray(0x0AB0, 0x0AD4); // 36 B: Racket Air, BS Rocket Tailslide, One Foot Smith
  const bobRegulars = origTricks.subarray(0x0AD4, 0x0C1E); // 330 B: all regular Bob Burnquist tricks
  const crashBlock  = Buffer.concat([bobSpecials, rodneyCasper, bobRegulars, Buffer.from([0x00, 0x00])]); // 380 B

  const newTblOff   = 0x8190;
  const crashBlkOff = 0x81BC; // 0x8190 + 21*2 = 0x81BA -> align 4 = 0x81BC
  const out = Buffer.alloc(crashBlkOff + crashBlock.length, 0); // 33,592 B (exact multiple of 4!)
  origTricks.copy(out, 0);
  out.writeUInt16LE(newTblOff, 0); // Point skater offset table to 0x8190 (read via lhu!)

  for (let i = 0; i < 20; i++) {
    out.writeUInt16LE(origTricks.readUInt16LE(origTblOff + i * 2), newTblOff + i * 2);
  }
  out.writeUInt16LE(crashBlkOff, newTblOff + 20 * 2);
  crashBlock.copy(out, crashBlkOff);

  if (out.length !== 33592 || out.length > 17 * 2048) {
    throw new Error(`Patched tricks.bin size unexpected: ${out.length}`);
  }
  return out;
}

/**
 * Replaces an embedded file inside a Neversoft .PRE archive in-place inside CD.WAD (0 offset shift!).
 */
function replaceFileInPre(wadBuf, hedBuf, origWad, origHed, preHedIdx, targetName, newData, label) {
  const preOff = origHed.readUInt32LE(preHedIdx * 12 + 4);
  const origPreSz = origHed.readUInt32LE(preHedIdx * 12 + 8);
  const slotSz = origHed.readUInt32LE((preHedIdx + 1) * 12 + 4) - preOff;
  const origPre = origWad.subarray(preOff, preOff + origPreSz);

  const count = origPre.readUInt32LE(0);
  const parts = [Buffer.alloc(4)];
  parts[0].writeUInt32LE(count, 0);
  let p = 4;
  let replaced = false;
  for (let k = 0; k < count; k++) {
    let e = p;
    while (e < origPre.length && origPre[e] !== 0) e++;
    const nm = origPre.subarray(p, e).toString('ascii');
    const np = (e + 1 + 3) & ~3;
    const fsz = origPre.readUInt32LE(np);
    const dStart = np + 4;
    const dPadded = (fsz + 3) & ~3;
    const rawData = origPre.subarray(dStart, dStart + fsz);

    const nLen = np - p;
    const payload = nm.toLowerCase() === targetName.toLowerCase() ? (replaced = true, newData) : rawData;
    const outDPad = (payload.length + 3) & ~3;
    const entry = Buffer.alloc(nLen + 4 + outDPad, 0);
    origPre.copy(entry, 0, p, np);
    entry.writeUInt32LE(payload.length >>> 0, nLen);
    payload.copy(entry, nLen + 4);
    parts.push(entry);
    p = dStart + dPadded;
  }
  if (!replaced) throw new Error(`${targetName} nao encontrado em ${label} (HED[${preHedIdx}])`);
  const rebuilt = Buffer.concat(parts);
  if (rebuilt.length > slotSz) {
    throw new Error(`${label} estourou slot: ${rebuilt.length} > ${slotSz}`);
  }
  wadBuf.fill(0, preOff, preOff + slotSz);
  rebuilt.copy(wadBuf, preOff);
  hedBuf.writeUInt32LE(rebuilt.length >>> 0, preHedIdx * 12 + 8);
  console.log(`  [PRE]   ${label.padEnd(14)} (HED[${preHedIdx}]): ${targetName} ${origPreSz} -> ${rebuilt.length} B / ${slotSz} B (slack ${slotSz - rebuilt.length} B, 0 shift!)`);
}

// ============================================================================
// 3. Patch playsel.bin (CD.HED[61]) — Expand 20 -> 21 Skaters Cleanly!
// ============================================================================
function patchPlaySelBin(wadBuf, origWad, hedBuf) {
  const psOff = hedBuf.readUInt32LE(61 * 12 + 4);
  const psSz  = hedBuf.readUInt32LE(61 * 12 + 8);
  const psOrig = origWad.subarray(psOff, psOff + psSz);
  const ps = Buffer.from(wadBuf.subarray(psOff, psOff + psSz)); // preserve voice hooks already applied @ +0x3388, +0x100C, +0x415C!

  // 1. Expand CPlaySel allocation: new(5080 -> 7260) @ +0x0398
  patchExact(ps, 0x0398, 0x240413D8, 0x24041C5C, 'playsel CPlaySel new(5080->7260)');

  // 2. Shift ALL 28 CPlaySel tail field refs [4976..5076] by +132 B ([5108..5208]) to make room for texSlots[20] (21st slot)!
  let tailShifted = 0;
  for (let o = 0; o < ps.length; o += 4) {
    if (o === 0x0398) continue;
    const origW = psOrig.readUInt32LE(o);
    const op = (origW >>> 26) & 63;
    const simm = ((origW & 0xFFFF) << 16) >> 16;
    if ([0x09,0x20,0x21,0x23,0x24,0x25,0x28,0x29,0x2B].includes(op) && simm >= 4976 && simm <= 5076) {
      const newW = ((origW & 0xFFFF0000) | ((simm + 132) & 0xFFFF)) >>> 0;
      patchExact(ps, o, origW, newW, `playsel tail +132 @ +0x${o.toString(16)}`);
      tailShifted++;
    }
  }
  if (tailShifted !== 28) throw new Error(`Expected 28 playsel tail shifts, got ${tailShifted}`);
  // Bump texSlots cleanup/init loop 20 -> 21 @ +0x1F88
  patchExact(ps, 0x1F88, 0x28820014, 0x28820015, 'playsel texSlots loop 20->21 @ +0x1F88');

  // 3. Relocate embedded CSkaterCache from CPlaySel + 220 -> CPlaySel + 5216 (0x1460) (exact 7 refs!)
  const cacheRefs = [0x1CB4, 0x2164, 0x240C, 0x25F8, 0x2678, 0x2684, 0x2AB0];
  for (const o of cacheRefs) {
    const origW = psOrig.readUInt32LE(o);
    if ((origW & 0xFFFF) !== 220) throw new Error(`Unexpected CSkaterCache ref @ +0x${o.toString(16)}: 0x${origW.toString(16)}`);
    const newW = ((origW & 0xFFFF0000) | 5216) >>> 0;
    patchExact(ps, o, origW, newW, `playsel CSkaterCache +220->+5216 @ +0x${o.toString(16)}`);
  }

  // 4. Inside CSkaterCache (+0x42F0..+0x4F40):
  //    - boneMap[19][21] stride 80 -> 84 @ +0x46CC & +0x473C
  patchExact(ps, 0x46CC, 0x26B50050, 0x26B50054, 'CSkaterCache boneMap stride 80->84 #1');
  patchExact(ps, 0x473C, 0x26310050, 0x26310054, 'CSkaterCache boneMap stride 80->84 #2');

  //    - Shift ALL internal CSkaterCache offsets after boneMap:
  //        1604->1680 (+76), 1608->1684 (+76), 1612->1688 (+76), 1616->1692 (+76), 1620->1696 (+76),
  //        1700->1780 (+80), 1780->1864 (+84), 1860->1948 (+88), 1940->2032 (+92)
  const cacheOffMap = new Map([
    [1604, 1680], [1608, 1684], [1612, 1688], [1616, 1692], [1620, 1696],
    [1700, 1780], [1780, 1864], [1860, 1948], [1940, 2032],
  ]);
  let cacheFieldShifts = 0;
  for (let o = 0x42F0; o < 0x4F40; o += 4) {
    const origW = psOrig.readUInt32LE(o);
    const op = (origW >>> 26) & 63;
    const simm = ((origW & 0xFFFF) << 16) >> 16;
    if ([0x09,0x20,0x21,0x23,0x24,0x25,0x28,0x29,0x2B].includes(op) && cacheOffMap.has(simm)) {
      const newW = ((origW & 0xFFFF0000) | (cacheOffMap.get(simm) & 0xFFFF)) >>> 0;
      patchExact(ps, o, origW, newW, `CSkaterCache off ${simm}->${cacheOffMap.get(simm)} @ +0x${o.toString(16)}`);
      cacheFieldShifts++;
    }
  }
  if (cacheFieldShifts !== 58) throw new Error(`Expected 58 CSkaterCache field shifts, got ${cacheFieldShifts}`);

  //    - Expand CSkaterCache::Update (+0x4BB4..+0x4DF4) stack frame: -176 -> -184 (+8 B) so int order[21] @ 24(sp)..107(sp)
  //      never overlaps scratch filename buffer @ 108(sp)!
  patchExact(ps, 0x4BB4, 0x27BDFF50, 0x27BDFF48, 'CSkaterCache::Update stack -176->-184');
  patchExact(ps, 0x4DF4, 0x27BD00B0, 0x27BD00B8, 'CSkaterCache::Update stack +176->+184');
  patchExact(ps, 0x4C68, 0x27B30068, 0x27B3006C, 'CSkaterCache::Update scratch 104(sp)->108(sp)');
  for (let o = 0x4BB8; o <= 0x4DF0; o += 4) {
    const origW = psOrig.readUInt32LE(o);
    const op = (origW >>> 26) & 63;
    const rs = (origW >>> 21) & 31;
    const simm = ((origW & 0xFFFF) << 16) >> 16;
    if ((op === 0x23 || op === 0x2B) && rs === 29 && simm >= 136 && simm <= 172) {
      const newW = ((origW & 0xFFFF0000) | ((simm + 8) & 0xFFFF)) >>> 0;
      patchExact(ps, o, origW, newW, `CSkaterCache::Update savedReg ${simm}->${simm+8}(sp) @ +0x${o.toString(16)}`);
    }
  }

  //    - Bump ALL 8 CSkaterCache 20 -> 21 loops!
  const cacheLoops20 = [0x4388, 0x4444, 0x4794, 0x4858, 0x4BF8, 0x4C58, 0x4C74, 0x4DA4];
  for (const o of cacheLoops20) {
    const origW = psOrig.readUInt32LE(o);
    if ((origW & 0xFFFF) !== 20) throw new Error(`CSkaterCache loop mismatch @ +0x${o.toString(16)}`);
    patchExact(ps, o, origW, (origW & 0xFFFF0000) | 21, `CSkaterCache loop 20->21 @ +0x${o.toString(16)}`);
  }

  // 5. Bump playsel.bin CAS sentinel 20 -> 21 (including IsCustomSkaterSelected xori @ +0x32C8!) & carousel wrap 21 -> 22!
  patchExact(ps, 0x0330, 0x2A020014, 0x2A020015, 'playsel unlock loop 20->21 @ +0x0330');
  patchExact(ps, 0x08F0, 0x24020014, 0x24020015, 'playsel CAS sentinel #1 20->21 @ +0x08F0');
  patchExact(ps, 0x1074, 0x24130014, 0x24130015, 'playsel CAS sentinel #2 20->21 @ +0x1074');
  patchExact(ps, 0x139C, 0x24020014, 0x24020015, 'playsel CAS sentinel #3 20->21 @ +0x139C');
  patchExact(ps, 0x32C8, 0x38420014, 0x38420015, 'playsel IsCustomSkaterSelected xori 20->21 @ +0x32C8');
  patchExact(ps, 0x32EC, 0x24110014, 0x24110015, 'playsel CAS sentinel #4 20->21 @ +0x32EC');
  patchExact(ps, 0x3328, 0x28420015, 0x28420016, 'playsel carousel wrap 21->22 @ +0x3328');

  ps.copy(wadBuf, psOff);
  console.log(`  [OK]    playsel.bin (HED[61]): CPlaySel 5080->7260, 28 tail shifts, CSkaterCache +5216 (58 field shifts, 8 loops 20->21), IsCustomSkater=21, carousel 21->22!`);
}

// ============================================================================
// 4. Patch equipsel.bin (CD.HED[39] + equipsel.pre CD.HED[48] + 0x18)
// ============================================================================
function patchEquipSelBin(wadBuf, origWad, hedBuf, origHed) {
  const eqOff = hedBuf.readUInt32LE(39 * 12 + 4);
  const eqSz  = hedBuf.readUInt32LE(39 * 12 + 8);
  const eqPreOff = hedBuf.readUInt32LE(48 * 12 + 4) + 0x18;
  const eq = Buffer.from(wadBuf.subarray(eqOff, eqOff + eqSz)); // preserves g_LevelTable reloc @ +0x50C8!

  // 1. Brand match loop 20 -> 21 (+0x2CC8) so Crash B. ("CR") finds his 8 custom Crash 3 decks!
  patchExact(eq, 0x2CC8, 0x2A020014, 0x2A020015, 'equipsel brand match loop 20->21 @ +0x2CC8');

  // 2. Guard sponsorLogos[20] OOB when skaterIdx == 20 (+0x11CC..+0x11D8)
  patchExact(eq, 0x11CC, 0x00000000, jalW(CRASH_ADDR.Entry_EquipSponsorGuard), 'equipsel sponsorLogos guard jal @ +0x11CC');
  patchExact(eq, 0x11D0, 0x00021080, 0x00000000,                                'equipsel sponsorLogos delay nop');
  patchExact(eq, 0x11D4, 0x00A21021, 0x00000000,                                'equipsel sponsorLogos nop2');
  patchExact(eq, 0x11D8, 0x8C430000, 0x00000000,                                'equipsel sponsorLogos nop3');

  // 3. Save equipped deckIdx (+2) & brandSkater (+22) into g_CrashDeckShadow when skater == 20 (+0x1088..+0x108C)
  patchExact(eq, 0x1088, 0xA06B003E, jalW(CRASH_ADDR.Entry_EquipDeckBasePtr),  'equipsel saveDeck jal @ +0x1088');
  patchExact(eq, 0x108C, 0x00EC1021, 0xA06B003E,                                'equipsel saveDeck delay sb t3,62(v1) @ +0x108C');

  // 4. Save wheel color (+42) into g_CrashDeckShadow when skater == 20 (+0x44B8..+0x44BC)
  patchExact(eq, 0x44B8, 0x9206016C, jalW(CRASH_ADDR.Entry_EquipWheelBasePtr), 'equipsel saveWheel jal @ +0x44B8');
  patchExact(eq, 0x44BC, 0x00651821, 0x9206016C,                                'equipsel saveWheel delay lbu a2,364(s0) @ +0x44BC');

  eq.copy(wadBuf, eqOff);
  eq.copy(wadBuf, eqPreOff);
  console.log(`  [OK]    equipsel.bin atualizado em HED[39] (0x${eqOff.toString(16)}) e equipsel.pre (0x${eqPreOff.toString(16)})!`);
}

// ============================================================================
// 5. Main Entry: Apply ALL Crash B. Slot 20 Engine Patches
// ============================================================================
function applyCrashEnginePatches(slusBuf, wadBuf, hedBuf, thps1Manifest) {
  console.log('\n=== Aplicando Motor Crash Bandicoot ("Crash B.", Novo Slot 20) ===');
  const origSlus = fs.readFileSync(ORIG_SLUS_PATH);
  const origWad  = fs.readFileSync(ORIG_WAD_PATH);
  const origHed  = fs.readFileSync(ORIG_HED_PATH);

  // Zero our allocated dead g_LevelTable region cleanly before populating (0x800B8418..0x800B943F)
  // NOTE: Preserve 0x800B82C4..0x800B8443 first by copying ExtraDecks from origSlus!
  slusBuf.fill(0, r2f(CRASH_ADDR.SkaterEntry20), r2f(CRASH_ADDR.RegionEnd));

  // --- A. Relocate g_CreateASkaterExtraDecks[12] (0x800B82C4 -> 0x800B8444, 384 B) & update ONLY 2 SLUS refs ---
  origSlus.copy(slusBuf, r2f(CRASH_ADDR.ExtraDecksReloc), r2f(0x800B82C4), r2f(0x800B82C4) + 384);
  patchExact(slusBuf, r2f(0x80010350), 0x244281C4, 0x24428344, 'ExtraDecks reloc #1 @ 0x80010350');
  patchExact(slusBuf, r2f(0x80083BB8), 0x244281C4, 0x24428344, 'ExtraDecks reloc #2 @ 0x80083BB8');

  // --- B. Build Crash B. Skater Strings, 8 Deck Names & PT-BR Bio @ 0x800B8C00..0x800B8E7F ---
  let sCur = CRASH_ADDR.SkaterStrings;
  function putStr(s, encoding = 'latin1') {
    const raw = Buffer.from(s + '\0', encoding);
    if (sCur + raw.length > CRASH_ADDR.StrMapBase) {
      throw new Error(`Crash SkaterStrings overflow em "${s}" (cur=0x${sCur.toString(16)})`);
    }
    raw.copy(slusBuf, r2f(sCur));
    const addr = sCur;
    sCur += raw.length;
    return addr;
  }

  const strModelA  = putStr('crash');
  const strModelAL = putStr('crash_L');
  const strModelB  = putStr('crashb');
  const strModelBL = putStr('crashb_L');
  const strFullNm  = putStr('Crash B.');
  const strShortNm = putStr('Crash');
  const strFaceBmp = putStr('s2face20.bmp');

  const crashDecks = [
    { file: 's2dCR01c.bmp', name: 'Wumpa Blast',     price: 0,    st: [1, 1, 1] },
    { file: 's2dCR02c.bmp', name: 'Aku Aku Spirit',  price: 250,  st: [2, 1, 1] },
    { file: 's2dCR03c.bmp', name: 'Power Crystal',   price: 500,  st: [2, 2, 1] },
    { file: 's2dCR04c.bmp', name: 'Time Relic',      price: 750,  st: [3, 2, 3] },
    { file: 's2dCR05c.bmp', name: 'TNT & Nitro',     price: 1000, st: [4, 3, 3] },
    { file: 's2dCR06c.bmp', name: 'Gem Collector',   price: 1250, st: [4, 3, 4] },
    { file: 's2dCR07c.bmp', name: 'Uka Uka Fury',    price: 1500, st: [4, 5, 4] },
    { file: 's2dCR08c.bmp', name: 'Crash Warped 98', price: 2000, st: [5, 5, 5] },
  ];
  const deckPtrs = crashDecks.map(d => ({
    ...d,
    filePtr: putStr(d.file),
    namePtr: putStr(d.name),
  }));

  // PT-BR Bio using proven s2bio.fnt Latin-1 accents (á, ã, ç, é, ê, í, ó)
  const bioLines = [
    'Direto da Ilha Wumpa',
    'para o skate mundial!',
    'Criado pelo Dr. Cortex,',
    'Crash escapou do',
    'castelo girando tudo',
    'e trouxe Aku Aku para',
    'proteger seus combos.',
    'Domina todas manobras',
    'e especiais do Bob',
    'Burnquist, além do',
    'lendário Casper to 360',
    'Flip de Rodney Mullen.',
    'Pegue Frutas Wumpa,',
    'Cristais e Relíquias!',
  ];
  const bioStrPtrs = bioLines.map(ln => putStr(ln, 'latin1'));
  sCur = ((sCur + 3) & ~3) >>> 0; // 4-byte align pointer array (unsigned 32-bit!)
  const bioArrAddr = sCur;
  if (bioArrAddr + (bioStrPtrs.length + 1) * 4 > CRASH_ADDR.StrMapBase) {
    throw new Error('Crash Bio pointer array overflow!');
  }
  for (let i = 0; i < bioStrPtrs.length; i++) {
    slusBuf.writeUInt32LE(bioStrPtrs[i] >>> 0, r2f(bioArrAddr + i * 4));
  }
  slusBuf.writeUInt32LE(0, r2f(bioArrAddr + bioStrPtrs.length * 4));
  sCur = bioArrAddr + (bioStrPtrs.length + 1) * 4;
  console.log(`  [DATA]  Crash Bio & Decks: 0x${CRASH_ADDR.SkaterStrings.toString(16)}..0x${sCur.toString(16)} (${sCur - CRASH_ADDR.SkaterStrings} B / 640 B)`);

  // --- C. Install g_SkaterTable[20] ("Crash B.") IN-PLACE @ 0x800B82C4 (340 B, cloned from Bob Burnquist [1]) ---
  const bobSrc = r2f(0x800B6834 + 1 * 0x154);
  const dst20  = r2f(CRASH_ADDR.SkaterEntry20);
  origSlus.copy(slusBuf, dst20, bobSrc, bobSrc + 0x154);
  slusBuf.writeUInt32LE(strModelA  >>> 0, dst20 + 0x00);
  slusBuf.writeUInt32LE(strModelAL >>> 0, dst20 + 0x04);
  slusBuf.writeUInt32LE(strModelB  >>> 0, dst20 + 0x08);
  slusBuf.writeUInt32LE(strModelBL >>> 0, dst20 + 0x0C);
  slusBuf.writeUInt32LE(strFullNm  >>> 0, dst20 + 0x20);
  slusBuf.writeUInt32LE(strShortNm >>> 0, dst20 + 0x24);
  for (let d = 0; d < 8; d++) {
    const dk = deckPtrs[d];
    const off = dst20 + 0x28 + d * 32;
    slusBuf.writeUInt32LE(dk.filePtr >>> 0, off + 0x00);
    slusBuf.writeUInt32LE(dk.namePtr >>> 0, off + 0x04);
    slusBuf.writeUInt32LE(dk.price   >>> 0, off + 0x08);
    slusBuf.writeUInt32LE(dk.st[0]   >>> 0, off + 0x0C);
    slusBuf.writeUInt32LE(dk.st[1]   >>> 0, off + 0x10);
    slusBuf.writeUInt32LE(dk.st[2]   >>> 0, off + 0x14);
    slusBuf.writeUInt32LE(0,                off + 0x18);
    slusBuf.writeUInt32LE(0,                off + 0x1C);
  }
  slusBuf.writeUInt32LE(strFaceBmp >>> 0, dst20 + 0x134);
  slusBuf.writeUInt32LE(bioArrAddr >>> 0, dst20 + 0x138);
  slusBuf.writeUInt32LE(1,                dst20 + 0x13C); // unlocked & visible in PlaySel!
  slusBuf.writeUInt32LE(0,                dst20 + 0x140); // standard Pro skater flags!

  // --- D. Initialize g_CrashDeckShadow (+2=0, +22=20, +42=1), g_CrashStyle=0, & Relocated g_Thps1Hed @ 0x800B873C ---
  slusBuf.writeUInt32LE(0, r2f(CRASH_ADDR.CrashStyle));
  slusBuf[r2f(CRASH_ADDR.CrashDeckShadow + 2)]  = 0;  // Deck 0 (Wumpa Blast)
  slusBuf[r2f(CRASH_ADDR.CrashDeckShadow + 22)] = 20; // Brand Skater 20 (Crash B.)
  slusBuf[r2f(CRASH_ADDR.CrashDeckShadow + 42)] = 1;  // Wheel color 1

  const maxHed = Math.floor((CRASH_ADDR.CodeBase - CRASH_ADDR.Thps1Hed - 4) / 12);
  if (thps1Manifest.entries.length > maxHed) {
    throw new Error(`THPS1.WAD entries (${thps1Manifest.entries.length}) > maxHed (${maxHed})!`);
  }
  let hedRam = CRASH_ADDR.Thps1Hed;
  for (const e of thps1Manifest.entries) {
    slusBuf.writeUInt32LE(e.hash      >>> 0, r2f(hedRam + 0));
    slusBuf.writeUInt32LE(e.relOffset >>> 0, r2f(hedRam + 4));
    slusBuf.writeUInt32LE(e.size      >>> 0, r2f(hedRam + 8));
    hedRam += 12;
  }
  slusBuf.writeUInt32LE(0, r2f(hedRam)); // null terminator
  console.log(`  [HED]   g_Thps1Hed relocado em SLUS @ 0x${CRASH_ADDR.Thps1Hed.toString(16)}: ${thps1Manifest.entries.length}/${maxHed} entradas (THPS1 + 33 Crash assets!)`);

  // --- E. Build Crash B. Dynamic Goal/HUD/Cash/Podium String Map @ 0x800B8E80..0x800B943F ---
  //        Applied ONLY when Crash B. (Slot 20) is active; 100% restored for all other skaters!
  const goalNamePtr = (lvlIdx, gIdx) => (0x800E6000 + lvlIdx * 0x174 + 0x80 + gIdx * 24 + 16) >>> 0;
  const goalShortPtr = (lvlIdx, gIdx) => (0x800E6000 + lvlIdx * 0x174 + 0x80 + gIdx * 24 + 8) >>> 0;

  const crashMappings = [
    // THPS2 Hangar (0): Barrels -> TNT Crates, Pilot Wings -> Aku Aku Masks, SKATE -> CRASH, Tape -> Power Crystal
    [goalNamePtr(0, 3),  'Formar C-R-A-S-H'],
    [goalNamePtr(0, 4),  'Quebrar 5 Caixas TNT'],
    [goalShortPtr(0, 4), 'CAIXAS TNT'],
    [goalNamePtr(0, 5),  '5 Mascaras Aku Aku'],
    [goalShortPtr(0, 5), 'AKU AKU'],
    [goalNamePtr(0, 8),  'Cristal de Poder Secreto'],
    // THPS2 School II (1), NY City (3), Venice (4), Philly (6): SKATE -> CRASH & Secret Tape -> Power Crystal
    [goalNamePtr(1, 3),  'Formar C-R-A-S-H'],
    [goalNamePtr(1, 8),  'Cristal de Poder Secreto'],
    [goalNamePtr(3, 3),  'Formar C-R-A-S-H'],
    [goalNamePtr(3, 8),  'Cristal de Poder Secreto'],
    [goalNamePtr(4, 3),  'Formar C-R-A-S-H'],
    [goalNamePtr(4, 8),  'Cristal de Poder Secreto'],
    [goalNamePtr(6, 3),  'Formar C-R-A-S-H'],
    [goalNamePtr(6, 8),  'Cristal de Poder Secreto'],
    // ALL 6 Regular THPS1 Levels (11,12,13,15,16,18): SKATE -> CRASH, G5 -> Custom Crash 3 3D Objects, Tape -> Crystal!
    [goalNamePtr(11, 3), 'Formar C-R-A-S-H'],
    [goalNamePtr(11, 5), '5 Caixas TNT Warped'],
    [goalNamePtr(11, 8), 'Cristal de Poder Secreto'],
    [goalNamePtr(12, 3), 'Formar C-R-A-S-H'],
    [goalNamePtr(12, 5), '5 Mascaras Aku Aku'],
    [goalNamePtr(12, 8), 'Cristal de Poder Secreto'],
    [goalNamePtr(13, 3), 'Formar C-R-A-S-H'],
    [goalNamePtr(13, 5), '5 Reliquias de Ouro'],
    [goalNamePtr(13, 8), 'Cristal de Poder Secreto'],
    [goalNamePtr(15, 3), 'Formar C-R-A-S-H'],
    [goalNamePtr(15, 5), '5 Gemas Warp Esmeralda'],
    [goalNamePtr(15, 8), 'Cristal de Poder Secreto'],
    [goalNamePtr(16, 3), 'Formar C-R-A-S-H'],
    [goalNamePtr(16, 5), '5 Mascaras Uka Uka'],
    [goalNamePtr(16, 8), 'Cristal de Poder Secreto'],
    [goalNamePtr(18, 3), 'Formar C-R-A-S-H'],
    [goalNamePtr(18, 5), '5 Cristais de Poder'],
    [goalNamePtr(18, 8), 'Cristal de Poder Secreto'],
    // Cash / Wumpa / Gem / Relic Pickup Banners & Podium
    [0x800C0310, 'Fruta Wumpa +50!'],
    [0x800C0314, 'Gema Warp +100!'],
    [0x800C030C, 'Reliquia Ouro +250!'],
    [0x800C01D4, 'Todas Wumpas da Fase!'],
    [0x800C080C, 'Wumpas'],
    // Banner letters S,K,A,T,E -> C,R,A,S,H
    [0x800C08E8, 'C'],
    [0x800C08EC, 'R'],
    [0x800C08F0, 'A'],
    [0x800C08F4, 'S'],
    [0x800C08F8, 'H'],
    // HUD top-left static ASCII words 0x800D7704..0x800D7714 -> C, R, A, S, H
    [0x800D7704, 0x00000043], // 'C'
    [0x800D7708, 0x00000052], // 'R'
    [0x800D770C, 0x00000041], // 'A'
    [0x800D7710, 0x00000053], // 'S'
    [0x800D7714, 0x00000048], // 'H'
  ];
  // Check capacity (StrMapBase..StrOrigBackup = 344 B -> wait: 47 mappings * 8 + 8 = 384 B!)
  // Let's dynamically place StrOrigBackup right after StrMapBase? NO, Lulao_SyncStrings reads fixed constants!
  // Let's keep fixed StrMapMax = 50 -> StrMapBase=0x800B8E80 (51*8=408 B -> 0x800B9018), StrOrigBackup=0x800B9018 (50*4=200 B -> 0x800B90E0), StrPool=0x800B90E0..0x800B9440 (864 B)!
  if (crashMappings.length > 50) throw new Error(`Crash mappings (${crashMappings.length}) > 50!`);

  const poolMap = new Map();
  let poolCur = CRASH_ADDR.StrPoolBase;
  for (let i = 0; i < crashMappings.length; i++) {
    const [tgt, val] = crashMappings[i];
    let writeVal;
    if (typeof val === 'number') {
      writeVal = val >>> 0;
    } else {
      if (!/^[\x20-\x7e]+$/.test(val)) throw new Error(`Crash goal string nao-ASCII: ${val}`);
      if (poolMap.has(val)) {
        writeVal = poolMap.get(val);
      } else {
        const b = Buffer.from(val + '\0', 'ascii');
        if (poolCur + b.length > CRASH_ADDR.RegionEnd) {
          throw new Error(`Crash StrPool overflow em "${val}" (cur=0x${poolCur.toString(16)})`);
        }
        b.copy(slusBuf, r2f(poolCur));
        writeVal = poolCur >>> 0;
        poolMap.set(val, writeVal);
        poolCur += b.length;
      }
    }
    slusBuf.writeUInt32LE(tgt >>> 0,      r2f(CRASH_ADDR.StrMapBase + i * 8));
    slusBuf.writeUInt32LE(writeVal >>> 0, r2f(CRASH_ADDR.StrMapBase + i * 8 + 4));
  }
  slusBuf.writeUInt32LE(0, r2f(CRASH_ADDR.StrMapBase + crashMappings.length * 8));
  slusBuf.writeUInt32LE(0, r2f(CRASH_ADDR.StrMapBase + crashMappings.length * 8 + 4));
  console.log(`  [DATA]  Crash Goal/HUD Map: ${crashMappings.length}/50 ponteiros, ${poolCur - CRASH_ADDR.StrPoolBase}/${CRASH_ADDR.RegionEnd - CRASH_ADDR.StrPoolBase} B strings (dedup=${poolMap.size})`);

  // --- F. Write Resident CRASH_CODE @ 0x800B89B0 & Hook SLUS_010.66 ---
  const crashCode = assembleCrashCode();
  crashCode.copy(slusBuf, r2f(CRASH_ADDR.CodeBase));

  // Career_GetSkaterData @ 0x8002600C -> j Hook_GetSkaterCareerData
  patchExact(slusBuf, r2f(0x8002600C), 0x000410C0, jW(CRASH_ADDR.Entry_GetSkaterCareerData), 'Career_GetSkaterData j @ 0x8002600C');
  patchExact(slusBuf, r2f(0x80026010), 0x00441023, 0x00000000,                               'Career_GetSkaterData delay nop');

  // GetSkaterStyle @ 0x8008A73C -> j Hook_GetSkaterStyle
  patchExact(slusBuf, r2f(0x8008A73C), 0x00052880, jW(CRASH_ADDR.Entry_GetSkaterStyle),      'GetSkaterStyle j @ 0x8008A73C');
  patchExact(slusBuf, r2f(0x8008A740), 0x00852021, 0x00000000,                               'GetSkaterStyle delay nop');

  // SetSkaterStyle @ 0x8008A708 -> j Hook_SetSkaterStyle
  patchExact(slusBuf, r2f(0x8008A708), 0x00031880, jW(CRASH_ADDR.Entry_SetSkaterStyle),      'SetSkaterStyle j @ 0x8008A708');
  patchExact(slusBuf, r2f(0x8008A70C), 0x02A31821, 0x00000000,                               'SetSkaterStyle delay nop');

  // SyncActiveDeck @ 0x80083AC4..0x80083ACC -> jal Hook_SyncActiveDeck
  patchExact(slusBuf, r2f(0x80083AC4), 0xA0860000, jalW(CRASH_ADDR.Entry_SyncActiveDeck),    'SyncActiveDeck jal @ 0x80083AC4');
  patchExact(slusBuf, r2f(0x80083AC8), 0x90450016, 0xA0860000,                               'SyncActiveDeck delay sb a2,0(a0) @ 0x80083AC8');
  patchExact(slusBuf, r2f(0x80083ACC), 0x00401821, 0x00000000,                               'SyncActiveDeck nop @ 0x80083ACC');

  // CDWAD_Open Crash-Exclusive Collectibles Hash Intercept @ 0x80054154
  patchExact(slusBuf, r2f(0x80054154), 0x0C014FC0, jalW(CRASH_ADDR.Entry_CdWadCrashIntercept), 'CDWAD_Open Crash hash intercept @ 0x80054154');

  // 5x tricks.bin lh -> lhu (opcode 0x21 -> 0x25, allowing unsigned offsets >= 0x8000!)
  patchExact(slusBuf, r2f(0x80014150), 0x84640000, 0x94640000, 'tricks.bin lhu #1 @ 0x80014150');
  patchExact(slusBuf, r2f(0x80088E84), 0x84450000, 0x94450000, 'tricks.bin lhu #2 @ 0x80088E84');
  patchExact(slusBuf, r2f(0x80088F5C), 0x84660000, 0x94660000, 'tricks.bin lhu #3 @ 0x80088F5C');
  patchExact(slusBuf, r2f(0x80089AA0), 0x84650000, 0x94650000, 'tricks.bin lhu #4 @ 0x80089AA0');
  patchExact(slusBuf, r2f(0x80089ADC), 0x84660000, 0x94660000, 'tricks.bin lhu #5 @ 0x80089ADC');

  // SLUS Skater-count loops 20 -> 21 (excluding fixed 20-slot MC/deck arrays!)
  patchExact(slusBuf, r2f(0x80023870), 0x2A020014, 0x2A020015, 'Career_InitAll skaters 20->21 @ 0x80023870');
  patchExact(slusBuf, r2f(0x80026618), 0x2A020014, 0x2A020015, 'Career_UnlockAll skaters 20->21 @ 0x80026618');
  patchExact(slusBuf, r2f(0x80026DF4), 0x28C20014, 0x28C20015, 'UnlockFlags1 skaters 20->21 @ 0x80026DF4');
  patchExact(slusBuf, r2f(0x80026E1C), 0x24A71A8C, 0x24A71BE0, 'UnlockFlags2 span 6796->7136 @ 0x80026E1C');
  patchExact(slusBuf, r2f(0x8008182C), 0x28C20014, 0x28C20015, 'CheatUnlock skaters 20->21 @ 0x8008182C');
  patchExact(slusBuf, r2f(0x80034AE8), 0x2A020014, 0x2A020015, 'CareerComplete skaters 20->21 @ 0x80034AE8');

  // --- G. Patch tricks.bin in CD.HED[11], panel.pre (HED[46]), AND tricksel.pre (HED[59]) ---
  const trOff = origHed.readUInt32LE(11 * 12 + 4);
  const trSz  = origHed.readUInt32LE(11 * 12 + 8);
  const trSlot = origHed.readUInt32LE(12 * 12 + 4) - trOff;
  const origTricks = origWad.subarray(trOff, trOff + trSz);
  const newTricks = buildPatchedTricksBin(origTricks);
  wadBuf.fill(0, trOff, trOff + trSlot);
  newTricks.copy(wadBuf, trOff);
  hedBuf.writeUInt32LE(newTricks.length >>> 0, 11 * 12 + 8);
  console.log(`  [WAD]   tricks.bin (HED[11]): ${trSz} -> ${newTricks.length} B / ${trSlot} B (Bob Burnquist + Rodney Mullen Casper to 360 Flip!)`);
  replaceFileInPre(wadBuf, hedBuf, origWad, origHed, 46, 'tricks.bin', newTricks, 'panel.pre');
  replaceFileInPre(wadBuf, hedBuf, origWad, origHed, 59, 'tricks.bin', newTricks, 'tricksel.pre');

  // --- H. Patch playsel.bin (CD.HED[61]) & equipsel.bin (CD.HED[39] + equipsel.pre CD.HED[48]) ---
  patchPlaySelBin(wadBuf, origWad, hedBuf);
  patchEquipSelBin(wadBuf, origWad, hedBuf, origHed);
}

module.exports = {
  CRASH_ADDR,
  applyCrashEnginePatches,
  buildPatchedTricksBin,
};
