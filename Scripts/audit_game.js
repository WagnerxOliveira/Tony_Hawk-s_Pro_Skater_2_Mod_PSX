#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Comprehensive 12-Stage Forensic Game & ISO Validator
 *
 * Audits BOTH workspace files and compiled build/THPS2_MOD.bin + .cue against clean
 * Redump NTSC-U reference (bin_cue_originais_do_jogo/Tony Hawk's Pro Skater 2.bin).
 * Exits with code 0 ONLY when ZERO errors are detected across all 12 stages.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const psxLib = require('./psx_skater_lib');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

const rootDir = path.resolve(__dirname, '..');
const redumpBin = path.join(rootDir, 'bin_cue_originais_do_jogo', "Tony Hawk's Pro Skater 2.bin");
const modBin = path.join(rootDir, 'build', 'THPS2_MOD.bin');
const modCue = path.join(rootDir, 'build', 'THPS2_MOD.cue');
const slusCurPath = path.join(rootDir, 'SLUS_010.66');
const hedCurPath = path.join(rootDir, 'CD.HED');

const errors = [];
const warnings = [];
function fail(stage, msg) { errors.push(`[${stage}] ${msg}`); console.error(`  [ERROR] ${msg}`); }
function warn(stage, msg) { warnings.push(`[${stage}] ${msg}`); console.warn(`  [WARN]  ${msg}`); }
function pass(msg) { console.log(`  [PASS]  ${msg}`); }

const edcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let edc = i;
  for (let j = 0; j < 8; j++) edc = (edc >>> 1) ^ ((edc & 1) ? 0xD8018001 : 0);
  edcTable[i] = edc >>> 0;
}
function calcEdc(buf, start, len) {
  let edc = 0;
  for (let i = 0; i < len; i++) edc = (edc >>> 8) ^ edcTable[(edc ^ buf[start + i]) & 0xFF];
  return edc >>> 0;
}
function toBcd(n) { return ((Math.floor(n / 10) << 4) | (n % 10)) & 0xFF; }

function readSectorsUser(fd, lba, count) {
  const out = Buffer.alloc(count * 2048);
  const raw = Buffer.alloc(2352);
  for (let i = 0; i < count; i++) {
    fs.readSync(fd, raw, 0, 2352, (lba + i) * 2352);
    raw.copy(out, i * 2048, 24, 24 + 2048);
  }
  return out;
}

function getWadEntry(fdIso, wadLba, hed, idx) {
  const off = hed.readUInt32LE(idx * 12 + 4);
  const sz = hed.readUInt32LE(idx * 12 + 8);
  const nSec = Math.max(1, Math.ceil(sz / 2048));
  return readSectorsUser(fdIso, wadLba + off / 2048, nSec).slice(0, sz);
}

function parseIsoDir(fd, dirLba, dirSize, prefix) {
  const files = [];
  const buf = readSectorsUser(fd, dirLba, Math.ceil(dirSize / 2048));
  let pos = 0;
  while (pos < dirSize) {
    const recLen = buf[pos];
    if (recLen === 0) { pos = (Math.floor(pos / 2048) + 1) * 2048; continue; }
    const lba = buf.readUInt32LE(pos + 2);
    const size = buf.readUInt32LE(pos + 10);
    const flags = buf[pos + 25];
    const nameLen = buf[pos + 32];
    const name = buf.slice(pos + 33, pos + 33 + nameLen).toString('ascii');
    const suOff = pos + 33 + nameLen + ((nameLen % 2 === 0) ? 1 : 0);
    const su = buf.slice(suOff, pos + recLen);
    const xaAttr = (su.length >= 14 && su[6] === 0x58 && su[7] === 0x41) ? su.readUInt16BE(4) : null;
    if (name !== '\x00' && name !== '\x01') {
      const cleanName = name.replace(/;1$/, '');
      const fullPath = prefix ? `${prefix}/${cleanName}` : cleanName;
      if (flags & 2) files.push(...parseIsoDir(fd, lba, size, fullPath));
      else files.push({ path: fullPath, lba, size, flags, xaAttr });
    }
    pos += recLen;
  }
  return files;
}

if (!fs.existsSync(redumpBin)) { console.error('Redump BIN nao encontrado:', redumpBin); process.exit(2); }
if (!fs.existsSync(modBin)) { console.error('Mod BIN nao encontrado:', modBin); process.exit(2); }

const fdRed = fs.openSync(redumpBin, 'r');
const fdMod = fs.openSync(modBin, 'r');

try {
  // =========================================================================
  // STAGE 1: SLUS_010.66 EXECUTABLE HEADER & CODE INTEGRITY
  // =========================================================================
  console.log('\n[STAGE 1] SLUS_010.66 — Header PS-X EXE & Integridade 100% do Codigo MIPS');
  const slusOrig = readSectorsUser(fdRed, 24, 422);
  const slusIso = readSectorsUser(fdMod, 24, 422);
  const slusDisk = fs.readFileSync(slusCurPath);

  if (!slusIso.equals(slusDisk)) fail('SLUS', 'SLUS_010.66 na ISO difere do arquivo no workspace! Recompile a ISO.');
  if (slusIso.length !== 864256) fail('SLUS', `Tamanho incorreto: ${slusIso.length} (esperado 864256)`);

  const expLic = 'Sony Computer Entertainment Inc. for North America area';
  const gotLic = slusIso.subarray(0x4C, 0x4C + expLic.length).toString('latin1');
  if (gotLic !== expLic) fail('SLUS', `Header +0x4C invalido: "${gotLic}"`);
  else pass('Header PS-X EXE +0x4C NTSC-U 100% valido');

  // Verify ZERO unintended diffs in executable MIPS code regions (outside known text pools & documented mod hooks)
  const { ADDR, SYM, jalWord, assembleSlusTailClean, assembleModCode, assembleBailHookCode, assembleLulaoEngine, assembleCrashSfxCode, buildLulaoStrData } = require('./patch_random_videos_and_voices');
  const { THPS1_ADDR, buildThps1ResidentBlock, applyThps1EnginePatches } = require('./thps1_engine_mod');
  const { CRASH_ADDR, applyCrashEnginePatches, buildPatchedTricksBin } = require('./mod_crash_engine');
  const {
    VAB_TARGETS,
    BAIL_SFX_IDS,
    BAIL_CENTER_NOTE,
    loadAll9BailVags,
    patchSingleVab,
    patchSingleSfx,
  } = require('./mod_bail_screams');
  const {
    FONT_PATCH_WORDS,
    PTBR_ALLOWED_HIGH_BYTES,
    BIO_LULAO,
    BIO_BOLSONARO,
    BIO_SLOT_OFFSETS,
    buildPatchedS2BioFnt,
  } = require('./mod_skater_bios');
  // Compute exact deterministic THPS1-in-THPS2 + Crash B. (Slot 20) engine diffs on clean copies of SLUS_010.66, CD.WAD & CD.HED
  const origWadForRef = fs.readFileSync(path.join(rootDir, 'originals_backup', 'CD.WAD'));
  const origHedForRef = fs.readFileSync(path.join(rootDir, 'originals_backup', 'CD.HED'));
  const thps1Man = JSON.parse(fs.readFileSync(path.join(rootDir, 'build', 'thps1_manifest.json'), 'utf8'));
  const slusThps1Ref = Buffer.from(slusOrig);
  const wadThps1Ref = Buffer.from(origWadForRef);
  const hedThps1Ref = Buffer.from(origHedForRef);
  {
    // Pre-apply playsel.bin's 3 voice/fade hooks before THPS1+Crash engine patches (matching patch_random_videos_and_voices.js order!)
    const psRefOff = hedThps1Ref.readUInt32LE(61 * 12 + 4);
    wadThps1Ref.writeUInt32LE(jalWord(ADDR.Tramp_PlaySelScroll),  psRefOff + 0x3388);
    wadThps1Ref.writeUInt32LE(jalWord(ADDR.Tramp_PlaySelConfirm), psRefOff + 0x100C);
    wadThps1Ref.writeUInt32LE(0x24040070,                         psRefOff + 0x415C);
    const savedLog = console.log;
    console.log = () => {};
    try {
      applyThps1EnginePatches(slusThps1Ref, wadThps1Ref, hedThps1Ref);
      applyCrashEnginePatches(slusThps1Ref, wadThps1Ref, hedThps1Ref, thps1Man);
    }
    finally { console.log = savedLog; }
  }
  const thps1SlusWords = [];
  for (let off = 0x800; off < slusOrig.length; off += 4) {
    const wO = slusOrig.readUInt32LE(off);
    const wR = slusThps1Ref.readUInt32LE(off);
    if (wO !== wR) thps1SlusWords.push([(0x80010000 + (off - 0x800)) >>> 0, wR]);
  }
  const expectedSlusHooks = new Map([
    ...thps1SlusWords,                                 // All 70 g_LevelTable relocs + THPS1-in-THPS2 + Turbo CDWAD engine hooks (deterministic!)
    [0x800230D4, jalWord(ADDR.Entry_GoalListTick)],    // Hook GoalList_Loop Pad_Update -> 60 Hz non-blocking DMA poll (tricks.bin + Lulao/Bolso)
    [0x80030DA0, jalWord(ADDR.Entry_EndRunPause)],     // Hook Pause -> End Run (Lulao random funny voice)
    [0x80034890, jalWord(ADDR.Entry_GoalListAsync)],   // Hook GoalList_Loop entry -> async DMA preload (tricks.bin + Lulao/Bolso)
    [0x80035D68, jalWord(ADDR.Entry_SpawnLetter)],     // Hook 3D S-K-A-T-E -> T-A-X-A-S dynamic spawn (Lulao only!)
    [0x80036858, jalWord(ADDR.Entry_GoalPickupSfx)],   // Hook School Miami Triplex box smash (SFX 83) + skater bump (0x80049D34)
    [0x8003C2E8, jalWord(ADDR.Entry_EndRunPause)],     // Hook Time-Up Natural End Run (Lulao random funny voice)
    [0x800813CC, jalWord(ADDR.Entry_EndRunPause)],     // Hook Script/Cheat End Run (Lulao random funny voice)
    [0x800368D4, jalWord(ADDR.Entry_CollectCash)],     // Hook Cash Pickup $250 (Lulao voice)
    [0x80036914, jalWord(ADDR.Entry_CollectCash)],     // Hook Cash Pickup $50  (Lulao voice)
    [0x80036954, jalWord(ADDR.Entry_CollectCash)],     // Hook Cash Pickup $100 (Lulao voice)
    [0x80038950, jalWord(ADDR.Hook_CdMix)],            // Hook XA_UpdateVolume CdMix -> 25% (-12 dB) ducking
    [0x8003C968, jalWord(ADDR.Entry_EndRunNormal)],    // Hook EndRun Normal (State 7: Time is up -> Lulao voice)
    [0x8003C9F0, jalWord(ADDR.Entry_EndRunComp)],      // Hook EndRun Comp (State 5/8/9 -> Lulao voice)
    [0x8003CB48, jalWord(ADDR.Entry_FrameTick)],       // Hook 60Hz FrameTick (XA_Update + 2KB SPU Ping-Pong Streamer)
    [0x8003CFB0, jalWord(ADDR.Tramp_BootMovie)],       // Boot Slot 0 (Activision -> random custom video, 208f cap)
    [0x8003CFE8, jalWord(ADDR.Tramp_BootMovie)],       // Boot Slot 1 (Neversoft  -> random custom video, 266f cap)
    [0x8003D024, jalWord(ADDR.Tramp_BootMovie)],       // Boot Slot 2 (Intro      -> random custom video, 1486f cap)
    [0x8003D71C, jalWord(ADDR.Entry_GameplayStart)],   // Hook GameplayStart/Retry (reset stream & sync Lulao goals)
    [0x8003D828, jalWord(ADDR.Entry_GameplayExit)],    // Hook GameplayExit Cleanup (stop Voice 23 & Mem_Free)
    [0x800527B8, jalWord(ADDR.Tramp_BailSfx)],         // Hook SFX_Play -> 9 rotating bail screams (round-robin + 50f cooldown)
    [0x80053690, 0x28620017],                          // Reserve SPU Voice 23 for skater voices (slti v0,v1,23)
    ...FONT_PATCH_WORDS.map(p => [p.ram, p.patched]),  // Font_CharToGlyph @ 0x8005B9B4: 5 words for native PT-BR accents (ã,ê,í,ó)
    [0x800623B8, jalWord(ADDR.Entry_CarHitVoice)],     // Hook School II Golf Cart RunOver (Bolsonaro Zero-Stall!)
    [0x8006833C, jalWord(ADDR.Entry_PsxUpload)],       // Hook PSX Upload (Dynamic Lulao Cash Bills)
    [0x80068394, jalWord(ADDR.Entry_PsxUpload)],       // Hook PSX Upload (Dynamic Lulao Cash Bills)
    [0x80068944, jalWord(ADDR.Entry_PsxUpload)],       // Hook PSX Upload (Dynamic Lulao Cash Bills)
    [0x80068AA0, jalWord(ADDR.Entry_PsxUpload)],       // Hook PSX Upload (Dynamic Lulao Cash Bills)
    [0x8006CAD4, jalWord(ADDR.Mod_BootInit)],          // Hook Movies_Init -> load VOICES.DAT Sec 0..16 + FlushCache
    [0x80082B80, jalWord(ADDR.Tramp_RunPlaySel)],      // Hook Overlay_Run playsel -> instant music ducking + sync Lulao goals on exit
    [0x80082C38, jalWord(ADDR.Entry_OverlaySync)],     // Hook Menu Sync (skateshp/career)
    [0x80082D2C, jalWord(ADDR.Entry_OverlaySync)],     // Hook Menu Sync (levelsel)
    [0x80082DB0, jalWord(ADDR.Entry_OverlaySync)],     // Hook Menu Sync
    [0x80082E1C, jalWord(ADDR.Entry_OverlaySync)],     // Hook Menu Sync
    [0x80082E98, jalWord(ADDR.Entry_OverlaySync)],     // Hook Menu Sync
    [0x80082EF0, jalWord(ADDR.Entry_OverlaySync)],     // Hook Menu Sync
    [0x80082F70, jalWord(ADDR.Entry_OverlaySync)],     // Hook Menu Sync
    [0x80082FD4, jalWord(ADDR.Entry_OverlaySync)],     // Hook Menu Sync
    [0x800A294C, 0x3C04800F],                          // InitHeap lui -> 0x800F (signed addiu -0x3800 = 0x800EC800)
    [0x800A2950, 0x2484C800],                          // InitHeap start -> 0x800EC800 (above boot-resident CASHART @ 0x800EB000!)
    [0x800E2674, ADDR.NewHeapStart],                   // THPS2 HeapStartPtr -> 0x800EC800
  ]);
  const isTextPool = (off) => (off >= 0x059BC0 && off < 0x05BC00) || (off >= 0x0A0000 && off < 0x0D2E74);
  const isModTail = (ram) => ram >= 0x800E2680 && ram < 0x800E2800;
  const isCrashDataRegion = (ram) => ram >= CRASH_ADDR.SkaterEntry20 && ram < CRASH_ADDR.RegionEnd;
  let codeDiffWords = 0, verifiedHooks = 0;
  for (let off = 0x800; off < slusOrig.length; off += 4) {
    const wO = slusOrig.readUInt32LE(off);
    const wC = slusIso.readUInt32LE(off);
    const ram = 0x80010000 + (off - 0x800);
    if (expectedSlusHooks.has(ram)) {
      if (wC !== expectedSlusHooks.get(ram)) {
        fail('SLUS', `Hook MIPS esperado em 0x${ram.toString(16).toUpperCase()} incorreto: 0x${wC.toString(16)} != 0x${expectedSlusHooks.get(ram).toString(16)}`);
        codeDiffWords++;
      } else {
        verifiedHooks++;
      }
      continue;
    }
    if (isModTail(ram)) continue;
    if (wO !== wC && !isTextPool(off)) {
      fail('SLUS', `Codigo MIPS modificado inesperadamente em 0x${ram.toString(16).toUpperCase()} (off 0x${off.toString(16)}): 0x${wO.toString(16)} -> 0x${wC.toString(16)}`);
      codeDiffWords++;
    }
  }
  const expTail = assembleSlusTailClean();
  const gotTail = slusIso.subarray(0x800 + (0x800E2680 - 0x80010000), 0x800 + (0x800E2800 - 0x80010000));
  if (!gotTail.equals(expTail)) {
    fail('SLUS', 'Bootstrapper/trampolins em 0x800E2680..0x800E27FF diferem do binario MIPS esperado!');
    codeDiffWords++;
  }
  if (codeDiffWords === 0 && verifiedHooks === expectedSlusHooks.size) {
    pass(`Codigo MIPS 100% integro (${verifiedHooks}/${expectedSlusHooks.size} hooks cirurgicos + bootstrapper 0x800E2680..0x800E27FF verificados, 0 diffs inesperados)`);
  }

  // Verify known bad opcode 0x0000FFF8 at 0x8005F320 is absent
  if (slusIso.readUInt32LE(0x04FB20) === 0x0000FFF8) {
    fail('SLUS', 'Instrucao corrompida 0x0000FFF8 detectada em 0x8005F320!');
  }

  // =========================================================================
  // STAGE 2: SLUS_010.66 STRING BOUNDARIES, PRINTF SPECIFIERS & FONT ASCII
  // =========================================================================
  console.log('\n[STAGE 2] SLUS_010.66 — Auditoria Completa de Strings, Printf e Fonte .FNT');
  const checkedStrs = new Set();
  let strErr = 0;
  for (let p = 0x800; p < slusOrig.length; p++) {
    if (slusOrig[p] === slusIso[p]) continue;
    const pRam = (0x80010000 + (p - 0x800)) >>> 0;
    const pRamAligned = (pRam & ~3) >>> 0;
    if (expectedSlusHooks.has(pRamAligned) || isModTail(pRam) || isCrashDataRegion(pRam)) continue;
    let s = p;
    // Walk back only through printable ASCII bytes (avoid stepping back into preceding MIPS code bytes!)
    while (s > 0x800 && slusOrig[s - 1] >= 0x20 && slusOrig[s - 1] <= 0x7E) s--;
    if (checkedStrs.has(s)) continue;
    checkedStrs.add(s);
    let eO = s; while (eO < slusOrig.length && slusOrig[eO] !== 0) eO++;
    let eC = s; while (eC < slusIso.length && slusIso[eC] !== 0) eC++;
    let slotEnd = eO; while (slotEnd < slusOrig.length && slusOrig[slotEnd] === 0) slotEnd++;
    const origStr = slusOrig.subarray(s, eO);
    const curStr = slusIso.subarray(s, eC);
    const ram = 0x80010000 + (s - 0x800);

    if (eC >= slotEnd) {
      fail('STRINGS', `Overflow em 0x${ram.toString(16)}: curEnd=${eC} >= slotEnd=${slotEnd}`);
      strErr++;
    }
    const fmtO = (origStr.toString('latin1').match(/%[0-9.\-+l]*[sdxXucf%]/g) || []).join(',');
    const fmtC = (curStr.toString('latin1').match(/%[0-9.\-+l]*[sdxXucf%]/g) || []).join(',');
    if (fmtO !== fmtC) {
      fail('STRINGS', `Printf mismatch em 0x${ram.toString(16)}: "${fmtO}" vs "${fmtC}"`);
      strErr++;
    }
    const isPtBrBio = BIO_SLOT_OFFSETS.has(s);
    for (let k = 0; k < curStr.length; k++) {
      const b = curStr[k];
      const okAscii = b >= 0x20 && b <= 0x7E;
      const okPtBr = isPtBrBio && PTBR_ALLOWED_HIGH_BYTES.has(b);
      if (!okAscii && !okPtBr) {
        fail('STRINGS', `Byte fora do ASCII .FNT (0x${b.toString(16)}) em 0x${ram.toString(16)} +${k}: "${curStr.toString('latin1')}"`);
        strErr++;
      }
    }
  }
  const chkStr = (off, exp, encoding = 'ascii') => {
    const end = slusIso.indexOf(0, off);
    const got = slusIso.subarray(off, end).toString(encoding);
    if (got !== exp) fail('STRINGS', `Esperado "${exp}" em +0x${off.toString(16)}, encontrado "${got}"`);
  };
  chkStr(0x0C44EC, 'Silvio Santos');
  chkStr(0x0C44FC, 'Sil');
  chkStr(0x0C8688, 'Silvio Santos');
  chkStr(0x0A17D8, "Brazil's Silvio Santos");
  chkStr(0x0C459C, "Can't Stop SS");
  chkStr(0x0C45F0, 'Lulao');
  chkStr(0x0C4600, 'Lulao');
  chkStr(0x0C8698, 'Lulao');
  chkStr(0x0C4714, 'Bolsonaro');
  chkStr(0x0C4724, 'Bolso');
  chkStr(0x0C86A8, 'Bolsonaro');
  chkStr(0x0C8730, 'Joao Paulo');
  chkStr(0x0C4DB4, 'Valter Pacheco');
  chkStr(0x0C4DC4, 'Valter');
  chkStr(0x0C873C, 'Valter Pacheco');
  chkStr(0x0A2034, "Valter's only been");
  chkStr(0x0C58F8, 'Kickflip'); // School II G6.paramStr @ 0x800D50F8 restored for Trick+Gap matcher 0x800662AC!
  for (const item of [...BIO_LULAO, ...BIO_BOLSONARO]) {
    chkStr(item.fileOff, item.text, 'latin1');
  }
  if (strErr === 0) pass(`${checkedStrs.size} strings modificadas validadas (incl. Silvio Santos + 32 linhas de biografias PT-BR Lulao/Bolsonaro; 0 overflows, 0 erros printf, 0 bytes fora do .FNT)`);

  // =========================================================================
  // STAGE 3: CD.HED & CD.WAD ALL 1,531 ENTRIES
  // =========================================================================
  console.log('\n[STAGE 3] CD.HED & CD.WAD — Integridade de Todas as 1.531 Entradas');
  const { SILVIO_MIC_DELTA, SILVIO_MIC_VERTS, SILVIO_MIC_FACES } = require('./mod_skater_silvio');
  const { HASH_X_LETTER, buildItemsPsxWithX, buildSkvenOPsxWithPitu } = require('./mod_lulao_world_assets');
  const hedRed = readSectorsUser(fdRed, 446, 9);
  const hedMod = readSectorsUser(fdMod, 446, 9);
  const hedDisk = fs.readFileSync(hedCurPath);
  if (!hedMod.subarray(0, hedDisk.length).equals(hedDisk)) {
    fail('WAD', 'CD.HED na ISO difere do arquivo CD.HED no workspace!');
  } else {
    // Allow ONLY size-field updates strictly within SAME CD sector allocations (ZERO offset shifts on all 1,472 THPS2 entries!)
    const allowedHedSizeDelta = new Map([
      [8,    1688],             // items.psx:   39096 -> 40784 B (<= 40960 B, same 20 sectors, +3D 'X' M[13] + 3D Garrafa 51 & Aura M[8])
      [11,   424],              // tricks.bin:  33168 -> 33592 B (<= 34816 B, same 17 sectors, +Slot 20 Crash B. Bob+Rodney moveset!)
      [14,   -316],             // skhan_o.psx: 122236 -> 121920 B (<= 122880 B, same 60 sectors, Barril 51+Lulao + 3D Haddad M[8])
      [46,   424],              // panel.pre:   194924 -> 195348 B (same sectors, embedded tricks.bin +Slot 20 Crash B.!)
      [47,   536],              // levelsel.pre: 281224 -> 281760 B (<= 282624 B, same 138 sectors, +s2arrow8.bmp & +s2arrow9.bmp)
      [59,   424],              // tricksel.pre: 298004 -> 298428 B (same sectors, embedded tricks.bin +Slot 20 Crash B.!)
      [387,  SILVIO_MIC_DELTA], // burnq2.psx:  60244 -> 61404 B (<= 61440 B, same 30 sectors, +3D Mic)
      [1010, SILVIO_MIC_DELTA], // burnq_l.psx: 51932 -> 53092 B (<= 53248 B, same 26 sectors, +3D Mic)
      [1094, 528],              // sksl2_l.psx: 341176 -> 341704 B (<= 342016 B, same 167 sectors, Dilma 40x64 + Vento Estocado 48x64)
      [1095, 168],              // sksl2_o.psx:   5960 ->   6128 B (<=   6144 B, same 3 sectors, 3D Dilma M[5] + 3D Vento Estocado M[4])
      [1096, 528],              // sksl2_l2.psx:341176 -> 341704 B (<= 342016 B, same 167 sectors, 2P)
      [1100, 644],              // c_kart.psx:   19792 ->  20436 B (<=  20480 B, same 10 sectors, Cabeca 3D Bolsonaro Doidao)
      [1103, 1116],             // skven_o.psx:  9076 -> 10192 B (<= 10240 B, same 5 sectors, 3D Garrafa Pitu M[4])
      [1109, -316],             // skhan_o2.psx:123480 -> 123164 B (<= 124928 B, same 61 sectors, Barril 51+Lulao + 3D Haddad M[8] 2P)
    ]);
    const zoneLo = 1127, zoneHi = 1185;
    const zoneStartOff = hedRed.readUInt32LE(zoneLo * 12 + 4);
    const zoneEndOff   = hedRed.readUInt32LE((zoneHi + 1) * 12 + 4);
    const zoneSpans = [];
    let hedErr = 0, zoneSecSum = 0;
    for (let idx = 0; idx * 12 + 12 <= hedDisk.length; idx++) {
      const hR = hedRed.readUInt32LE(idx * 12), hM = hedMod.readUInt32LE(idx * 12);
      if (hR === 0xFFFFFFFF && hM === 0xFFFFFFFF) break;
      const oR = hedRed.readUInt32LE(idx * 12 + 4), oM = hedMod.readUInt32LE(idx * 12 + 4);
      const sR = hedRed.readUInt32LE(idx * 12 + 8), sM = hedMod.readUInt32LE(idx * 12 + 8);
      const secR = Math.max(1, Math.ceil(sR / 2048));
      const secM = Math.max(1, Math.ceil(sM / 2048));
      if (idx >= zoneLo && idx <= zoneHi) {
        // Closed-zone THPS1 repack [1127..1185]: preserve exact hash, stay strictly inside [zoneStartOff..zoneEndOff), 2048-aligned!
        if (hR !== hM || (oM % 2048) !== 0 || oM < zoneStartOff || (oM + secM * 2048) > zoneEndOff) {
          fail('WAD', `CD.HED[${idx}] zona THPS1 invalida: hash 0x${hR.toString(16)}->0x${hM.toString(16)}, off 0x${oM.toString(16)}, sec=${secM}`);
          hedErr++;
        } else {
          zoneSpans.push([oM, oM + secM * 2048, idx]);
          zoneSecSum += secM;
        }
        continue;
      }
      const expS = sR + (allowedHedSizeDelta.get(idx) || 0);
      if (hR !== hM || oR !== oM || sM !== expS || secR !== secM) {
        fail('WAD', `CD.HED[${idx}] invalido: hash 0x${hR.toString(16)}->0x${hM.toString(16)}, off 0x${oR.toString(16)}->0x${oM.toString(16)}, sz ${sR}->${sM} (exp ${expS}), sec ${secR}->${secM}`);
        hedErr++;
      }
    }
    zoneSpans.sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < zoneSpans.length; k++) {
      if (zoneSpans[k][0] < zoneSpans[k - 1][1]) {
        fail('WAD', `Overlap na zona fechada CD.WAD[1127..1185]: idx ${zoneSpans[k - 1][2]} e ${zoneSpans[k][2]}`);
        hedErr++;
      }
    }
    if (zoneSecSum !== (zoneEndOff - zoneStartOff) / 2048) {
      fail('WAD', `Zona fechada CD.WAD[1127..1185] soma setores ${zoneSecSum} != ${(zoneEndOff - zoneStartOff) / 2048}`);
      hedErr++;
    }
    if (!hedRed.subarray(hedDisk.length).equals(hedMod.subarray(hedDisk.length))) {
      fail('WAD', 'Bytes apos tabela CD.HED diferem do Redump!');
      hedErr++;
    }
    if (hedErr === 0) pass(`CD.HED 100% integro: 1.472/1.472 entradas THPS2 com 0 deslocamento (11 no mesmo setor incl. levelsel.pre +s2arrow8/9) + zona fechada THPS1 [1127..1185] exata (${zoneSecSum}/${zoneSecSum} setores, 0 overlap)`);
  }

  const allowedWadIdxs = new Set([
    3, 4, 520, 521, 522, 523,                       // skate2, skate2g, skate2p .VAB + .SFX (9 rotating bail screams, exact Redump size)
    8, 14, 1094, 1095, 1096, 1100, 1102, 1103, 1109,// Lulao world assets: items (3D X + 51 Bottle/Aura), skhan_o/o2 (Barril 51+Lulao + Haddad), sksl2_o/l/l2 (Dilma + Vento Estocado), c_kart (Bolsonaro), skven_o/l (Pitu)
    11, 46, 59,                                     // tricks.bin + panel.pre + tricksel.pre (Slot 20 Crash B. Bob Burnquist + Rodney Mullen Casper to 360 Flip!)
    33, 35, 37, 39, 41, 45, 47, 48, 60, 61, 67, 458,// levelsel/multisel/options/equipsel/tricksel/playsel/creedit + PREs (g_LevelTable relocs + Crash Slot 20 + s2bio.fnt + s2arrow8/9)
    369, 370, 371, 372, 377, 378, 379,              // 7 custom portraits: s2face1,2,3,4,9,10,11 (s2face7=375 Bucky Lasek RESTORED!)
    387, 1010, 431, 1012,                           // Silvio Santos (4 .PSX, incl. 3D Chest Mic on 387 & 1010)
    389, 986, 433, 988,                             // Lulao (4 .PSX)
    391, 1030, 435, 1032,                           // Bolsonaro (4 .PSX)
    393, 994, 437, 996,                             // Wagner Oliver (4 .PSX)
    399, 998, 443, 1000,                            // Francis Paulo (4 .PSX)
    403, 1002, 447, 1004,                           // Natan Oliver (4 .PSX)
    405, 1018, 449, 1020,                           // Valter Pacheco (4 .PSX)
    573, 578,                                       // Dead PRE-shadowed slots: s2bgd3.bmp (9 t1rend BMPs @ LBA 7955) & s2bgd5.bmp (9 t1levl BMPs @ LBA 8049)
  ]);
  for (let zi = 1127; zi <= 1185; zi++) allowedWadIdxs.add(zi); // Closed-zone THPS1 in-place repack (0 shift outside [1127..1185]!)
  let wadChecked = 0, wadUnexpected = 0;
  for (let idx = 0; idx * 12 + 12 <= hedDisk.length; idx++) {
    const h = hedDisk.readUInt32LE(idx * 12);
    if (h === 0xFFFFFFFF) break;
    const off = hedDisk.readUInt32LE(idx * 12 + 4);
    const sz = hedDisk.readUInt32LE(idx * 12 + 8);
    const nSec = Math.max(1, Math.ceil(sz / 2048));
    const bRed = readSectorsUser(fdRed, 455 + off / 2048, nSec);
    const bMod = readSectorsUser(fdMod, 455 + off / 2048, nSec);
    wadChecked++;
    if (!bRed.equals(bMod) && !allowedWadIdxs.has(idx)) {
      fail('WAD', `Entrada CD.WAD inesperadamente alterada: idx=${idx} hash=0x${h.toString(16)}`);
      wadUnexpected++;
    }
  }
  // Verify ALL patched frontend overlays & tricks.bin copies (playsel, levelsel, equipsel, tricksel, multisel, creedit, options + PREs) match deterministic reference bit-for-bit!
  {
    let ovErr = 0;
    const refChecks = [
      [11, 'tricks.bin'],
      [33, 'levelsel.bin'],
      [35, 'multisel.bin'],
      [37, 'options.bin'],
      [39, 'equipsel.bin'],
      [41, 'tricksel.bin'],
      [46, 'panel.pre'],
      [47, 'levelsel.pre'],
      [48, 'equipsel.pre'],
      [59, 'tricksel.pre'],
      [61, 'playsel.bin'],
      [67, 'creedit.bin'],
    ];
    for (const [idx, nm] of refChecks) {
      const o = hedDisk.readUInt32LE(idx * 12 + 4), s = hedDisk.readUInt32LE(idx * 12 + 8);
      const got = getWadEntry(fdMod, 455, hedDisk, idx);
      const exp = wadThps1Ref.subarray(o, o + s);
      if (!got.equals(exp)) { fail('WAD', `${nm} (idx=${idx}) difere dos patches deterministicos THPS1 + Crash B. Slot 20!`); ovErr++; }
    }
    const lsGot = getWadEntry(fdMod, 455, hedDisk, 33);
    const lsPreGot = getWadEntry(fdMod, 455, hedDisk, 47);
    if (!lsPreGot.subarray(0x18, 0x18 + lsGot.length).equals(lsGot)) {
      fail('WAD', 'levelsel.pre +0x18 dessincronizado de levelsel.bin!'); ovErr++;
    }
    const eqGot = getWadEntry(fdMod, 455, hedDisk, 39);
    const eqPreGot = getWadEntry(fdMod, 455, hedDisk, 48);
    if (!eqPreGot.subarray(0x18, 0x18 + eqGot.length).equals(eqGot)) {
      fail('WAD', 'equipsel.pre +0x18 dessincronizado de equipsel.bin!'); ovErr++;
    }
    if (ovErr === 0) pass('12/12 overlays & tricks.bin/PREs (playsel, equipsel+pre, levelsel+pre, tricks.bin+panel.pre+tricksel.pre, options, multisel, tricksel, creedit) 100% bit-a-bit validos!');
  }
  // Verify s2bio.fnt (idx 458) & player.pre (idx 60) ONLY modified s2bio.fnt (+0x14..+0x1187) identically!
  {
    const fntOrig = getWadEntry(fdRed, 455, hedDisk, 458);
    const fntMod  = getWadEntry(fdMod, 455, hedDisk, 458);
    const preOrig = getWadEntry(fdRed, 455, hedDisk, 60);
    const preMod  = getWadEntry(fdMod, 455, hedDisk, 60);
    const expFnt  = buildPatchedS2BioFnt(fntOrig);
    let fntErr = 0;
    if (!fntMod.equals(expFnt)) { fail('WAD', 's2bio.fnt (idx=458) difere do binario PT-BR esperado!'); fntErr++; }
    if (!preMod.subarray(0x14, 0x14 + 4468).equals(expFnt)) { fail('WAD', 'player.pre (idx=60) +0x14 dessincronizado de s2bio.fnt!'); fntErr++; }
    if (!preOrig.subarray(0, 0x14).equals(preMod.subarray(0, 0x14)) || !preOrig.subarray(0x14 + 4468).equals(preMod.subarray(0x14 + 4468))) {
      fail('WAD', 'player.pre (idx=60) alterado fora do slot de s2bio.fnt!'); fntErr++;
    }
    if (fntErr === 0) pass('s2bio.fnt (idx=458) & player.pre (idx=60 +0x14): fonte PT-BR (á,ã,ç,é,ê,í,ó, 4.468 B) 100% sincronizada, 219.528 B restantes de player.pre intactos');
  }
  // Verify skate2, skate2g, skate2p .VAB + .SFX (WAD[3,4,520,521,522,523]): 9 rotating bail screams, exact Redump size, 0 SPU bloat!
  {
    const bailClips = loadAll9BailVags(false);
    let vabErr = 0;
    for (const cfg of VAB_TARGETS) {
      const vOrig = getWadEntry(fdRed, 455, hedDisk, cfg.vabIdx);
      const vMod  = getWadEntry(fdMod, 455, hedDisk, cfg.vabIdx);
      const sOrig = getWadEntry(fdRed, 455, hedDisk, cfg.sfxIdx);
      const sMod  = getWadEntry(fdMod, 455, hedDisk, cfg.sfxIdx);
      const expV  = patchSingleVab(vOrig, cfg, bailClips);
      const expS  = patchSingleSfx(sOrig, cfg);
      if (vMod.subarray(0, 4).toString('ascii') !== 'pBAV' || vMod.length !== vOrig.length || !vMod.equals(expV)) {
        fail('WAD', `${cfg.name}.vab (idx=${cfg.vabIdx}) difere do banco de 9 gritos esperado!`);
        vabErr++;
      }
      if (sMod.length !== sOrig.length || !sMod.equals(expS)) {
        fail('WAD', `${cfg.name}.sfx (idx=${cfg.sfxIdx}) difere do mapeamento de 9 gritos esperado!`);
        vabErr++;
      }
    }
    if (vabErr === 0) pass(`skate2/skate2g/skate2p .VAB+.SFX (idx=3,4,520..523): 9 gritos de queda (${BAIL_SFX_IDS.length} IDs, center=${BAIL_CENTER_NOTE}) 100% validos, 0 B extras em SPU RAM`);
  }
  if (wadUnexpected === 0) pass(`Todas as ${wadChecked} entradas do CD.WAD verificadas (${wadChecked - allowedWadIdxs.size} intactas incluindo skhan_l.psx + ${allowedWadIdxs.size} mods: 7 skatistas, 9 gritos .VAB/.SFX, s2bio.fnt e playsel.bin)`);

  // =========================================================================
  // STAGE 4: ALL 7 PORTRAITS (s2face1,2,3,4,9,10,11) + SLUS CROSS-CHECK + BUCKY LASEK (s2face7) ORIGINAL
  // =========================================================================
  console.log('\n[STAGE 4] options.pre & 7 Retratos Customizados (validacao cruzada SLUS_010.66 <-> CD.WAD <-> options.pre)');
  const optOrig = getWadEntry(fdRed, 455, hedDisk, 45);
  const optMod = getWadEntry(fdMod, 455, hedDisk, 45);
  const portraitSpecs = [
    { nm: 's2face1.bmp',  idx: 369, magIdx: 21, preOff: 0x246BC, slusFaceOff: 0x0C45C8, slusNameOff: 0x0C44EC, skater: 'Silvio Santos' },
    { nm: 's2face2.bmp',  idx: 370, magIdx: 5,  preOff: 0x256C4, slusFaceOff: 0x0C46E0, slusNameOff: 0x0C45F0, skater: 'Lulao' },
    { nm: 's2face3.bmp',  idx: 371, magIdx: 39, preOff: 0x266CC, slusFaceOff: 0x0C47F4, slusNameOff: 0x0C4714, skater: 'Bolsonaro' },
    { nm: 's2face4.bmp',  idx: 372, magIdx: 26, preOff: 0x276D4, slusFaceOff: 0x0C4910, slusNameOff: 0x0C4824, skater: 'Wagner Oliver' },
    { nm: 's2face9.bmp',  idx: 377, magIdx: 0,  preOff: 0x2C6FC, slusFaceOff: 0x0C4C58, slusNameOff: 0x0C4B68, skater: 'Francis Paulo' },
    { nm: 's2face10.bmp', idx: 378, magIdx: 18, preOff: 0x2D708, slusFaceOff: 0x0C4EA0, slusNameOff: 0x0C4DB4, skater: 'Valter Pacheco' },
    { nm: 's2face11.bmp', idx: 379, magIdx: 7,  preOff: 0x2E714, slusFaceOff: 0x0C4FA8, slusNameOff: 0x0C4EDC, skater: 'Natan Oliver' },
  ];
  for (const ps of portraitSpecs) {
    // Dynamic cross-check against SLUS_010.66 skater table!
    const slusFace = slusIso.subarray(ps.slusFaceOff, slusIso.indexOf(0, ps.slusFaceOff)).toString('ascii');
    const slusSkater = slusIso.subarray(ps.slusNameOff, slusIso.indexOf(0, ps.slusNameOff)).toString('ascii').trim();
    if (slusFace !== ps.nm || slusSkater !== ps.skater) {
      fail('PORTRAIT', `Divergencia SLUS_010.66 para ${ps.skater}: esperado ${ps.nm}, encontrado ${slusSkater} -> ${slusFace}`);
    }
    const o = getWadEntry(fdRed, 455, hedDisk, ps.idx);
    const m = getWadEntry(fdMod, 455, hedDisk, ps.idx);
    if (m.length !== 4088 || !o.subarray(0, 54).equals(m.subarray(0, 54))) {
      fail('PORTRAIT', `Header/tamanho de ${ps.nm} invalido`);
    }
    if (m[54 + ps.magIdx * 4] !== 255 || m[54 + ps.magIdx * 4 + 1] !== 0 || m[54 + ps.magIdx * 4 + 2] !== 255) {
      fail('PORTRAIT', `Indice ${ps.magIdx} de ${ps.nm} nao e magenta #FF00FF!`);
    }
    if (optMod.indexOf(m) !== ps.preOff) {
      fail('PORTRAIT', `${ps.nm} nao encontrado no offset 0x${ps.preOff.toString(16)} de options.pre!`);
    }
  }
  // Explicitly assert Bucky Lasek (s2face7.bmp, idx=375, +0x2A6EC) is 100% Redump original!
  {
    const f7Orig = getWadEntry(fdRed, 455, hedDisk, 375);
    const f7Mod  = getWadEntry(fdMod, 455, hedDisk, 375);
    if (!f7Orig.equals(f7Mod) || !optMod.subarray(0x2A6EC, 0x2A6EC + 4088).equals(f7Orig)) {
      fail('PORTRAIT', 's2face7.bmp (Bucky Lasek) nao esta 100% identico ao original Redump!');
    }
  }
  let optOutsideDiff = 0;
  for (let i = 0; i < optOrig.length; i++) {
    const inAny = portraitSpecs.some(ps => i >= ps.preOff && i < ps.preOff + 4088);
    if (inAny) continue;
    if (optOrig[i] !== optMod[i]) optOutsideDiff++;
  }
  if (optOutsideDiff > 0) fail('PORTRAIT', `options.pre tem ${optOutsideDiff} bytes alterados fora dos 7 retratos!`);
  else pass('7/7 retratos (s2face1,2,3,4,9,10,11) validados contra SLUS_010.66 + s2face7 (Bucky Lasek) 100% original + options.pre integro');

  // =========================================================================
  // STAGE 5: ALL 28 SKATER .PSX MODELS (7 SKATERS x 4 LOD/STYLES) & HANGAR skhan_l.psx
  // =========================================================================
  console.log('\n[STAGE 5] Modelos 3D .PSX (28 modelos: Silvio+Mic3D, Lulao, Bolsonaro+Pescoco, Wagner, Francis, Natan, Valter) & Fase 1 Original');
  const psxChecks = [
    { idx: 387,  name: 'burnq2.psx',   headHash: 0xf5cf6046, expMesh: 15, extraLabel: 'Mic3D',       extraMeshes: new Map([[8,'mic3d']]), allowDelta: SILVIO_MIC_DELTA, allowHeadUvRemap: true },
    { idx: 1010, name: 'burnq_L.psx',  headHash: 0xf5cf6046, expMesh: 15, extraLabel: 'Mic3D',       extraMeshes: new Map([[8,'mic3d']]), allowDelta: SILVIO_MIC_DELTA, allowHeadUvRemap: true },
    { idx: 431,  name: 'burnq2b.psx',  headHash: 0x9504086e, expMesh: 15, extraLabel: '',            extraMeshes: new Map() },
    { idx: 1012, name: 'burnq2bL.psx', headHash: 0x9504086e, expMesh: 15, extraLabel: '',            extraMeshes: new Map() },
    { idx: 389,  name: 'cab.psx',      headHash: 0x0f88a1f8, expMesh: 12, extraLabel: 'Barriguinha', extraMeshes: new Map([[0,'w1ok'],[7,'w1ok'],[13,'w0only']]) },
    { idx: 986,  name: 'cab_L.psx',    headHash: 0x0f88a1f8, expMesh: 15, extraLabel: 'Barriguinha', extraMeshes: new Map([[3,'w1ok'],[10,'w1ok'],[16,'w0only']]) },
    { idx: 433,  name: 'cab2b.psx',    headHash: 0x9504086e, expMesh: 15, extraLabel: 'Barriguinha', extraMeshes: new Map([[0,'w1ok'],[7,'w1ok'],[8,'w0only']]) },
    { idx: 988,  name: 'cab2b_L.psx',  headHash: 0x9504086e, expMesh: 15, extraLabel: 'Barriguinha', extraMeshes: new Map([[0,'w1ok'],[7,'w1ok'],[8,'w0only']]) },
    { idx: 391,  name: 'campb2.psx',   headHash: 0x7806eefa, expMesh: 15, extraLabel: 'PescocoHawk', extraMeshes: new Map([[8,'w1ok']]) },
    { idx: 1030, name: 'campb2_L.psx', headHash: 0x7806eefa, expMesh: 15, extraLabel: 'PescocoHawk', extraMeshes: new Map([[8,'w1ok']]) },
    { idx: 435,  name: 'campb2b.psx',  headHash: 0x7806eefa, expMesh: 15, extraLabel: 'PescocoHawk', extraMeshes: new Map([[8,'w1ok']]) },
    { idx: 1032, name: 'campb2bL.psx', headHash: 0x7806eefa, expMesh: 15, extraLabel: 'PescocoHawk', extraMeshes: new Map([[8,'w1ok']]) },
    { idx: 393,  name: 'glif2.psx',    headHash: 0xe15f10ff, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 994,  name: 'glif_L.psx',   headHash: 0xe15f10ff, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 437,  name: 'glif2b.psx',   headHash: 0xe15f10ff, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 996,  name: 'glif2b_L.psx', headHash: 0xe15f10ff, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 399,  name: 'mullen.psx',   headHash: 0xba25cbf5, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 998,  name: 'mullen_L.psx', headHash: 0xba25cbf5, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 443,  name: 'mullen2b.psx', headHash: 0xba25cbf5, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 1000, name: 'mulln2bL.psx', headHash: 0xba25cbf5, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 403,  name: 'rowley2.psx',  headHash: 0xba25cbf5, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 1002, name: 'rowley_L.psx', headHash: 0xba25cbf5, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 447,  name: 'rowley2b.psx', headHash: 0xba25cbf5, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 1004, name: 'rowly2bL.psx', headHash: 0xba25cbf5, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 405,  name: 'rynld2.psx',   headHash: 0x1ab6ae9d, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 1018, name: 'rynld_L.psx',  headHash: 0x1ab6ae9d, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 449,  name: 'rynld2b.psx',  headHash: 0x1ab6ae9d, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
    { idx: 1020, name: 'rynld2bL.psx', headHash: 0x1ab6ae9d, expMesh: 15, extraLabel: '', extraMeshes: new Map() },
  ];
  for (const pc of psxChecks) {
    const orig = getWadEntry(fdRed, 455, hedRed, pc.idx);
    const cur  = getWadEntry(fdMod, 455, hedDisk, pc.idx);
    const expDelta = pc.allowDelta || 0;
    if (cur.length !== orig.length + expDelta) { fail('PSX', `${pc.name}: tamanho ${cur.length} != esperado ${orig.length + expDelta}`); continue; }
    const ptrMetaO = orig.readUInt32LE(4), ptrMetaC = cur.readUInt32LE(4);
    if (ptrMetaC !== ptrMetaO + expDelta) { fail('PSX', `${pc.name}: ptrMeta 0x${ptrMetaC.toString(16)} != 0x${(ptrMetaO + expDelta).toString(16)}`); continue; }
    const nObj = orig.readUInt32LE(8);
    const nMeshOff = 12 + nObj * 36, nMesh = orig.readUInt32LE(nMeshOff);
    const meshOffsO = Array.from({ length: nMesh }, (_, i) => orig.readUInt32LE(nMeshOff + 4 + i * 4));
    const meshOffsC = Array.from({ length: nMesh }, (_, i) => cur.readUInt32LE(nMeshOff + 4 + i * 4));
    let mposO = ptrMetaO, mposC = ptrMetaC;
    while (mposO < orig.length) {
      const tag = orig.readUInt32LE(mposO); mposO += 4; mposC += 4;
      if (tag === 0xFFFFFFFF) break;
      const len = orig.readUInt32LE(mposO); mposO += 4 + len; mposC += 4 + len;
    }
    const hashes = Array.from({ length: nMesh }, (_, i) => cur.readUInt32LE(mposC + i * 4));
    if (hashes[pc.expMesh] !== pc.headHash) fail('PSX', `${pc.name}: Mesh[${pc.expMesh}] nao tem hash esperado`);
    mposO += nMesh * 4; mposC += nMesh * 4;
    const nTexRefs = orig.readUInt32LE(mposO); mposO += 4 + nTexRefs * 4; mposC += 4 + nTexRefs * 4;
    const nPal16 = orig.readUInt32LE(mposO); mposO += 4; mposC += 4;
    let zeroClut = 0;
    for (let i = 0; i < nPal16; i++) {
      for (let c = 0; c < 16; c++) {
        if (cur.readUInt16LE(mposC + 4 + c * 2) === 0 && orig.readUInt16LE(mposO + 4 + c * 2) !== 0) zeroClut++;
      }
      mposO += 36; mposC += 36;
    }
    const nPal256 = orig.readUInt32LE(mposO); mposO += 4; mposC += 4;
    for (let i = 0; i < nPal256; i++) {
      for (let c = 0; c < 256; c++) {
        if (cur.readUInt16LE(mposC + 4 + c * 2) === 0 && orig.readUInt16LE(mposO + 4 + c * 2) !== 0) zeroClut++;
      }
      mposO += 516; mposC += 516;
    }
    if (zeroClut > 0) fail('PSX', `${pc.name}: ${zeroClut} cores 0x0000 (transparentes) indevidas na CLUT!`);

    // Verify ONLY HEAD (and documented extra meshes: Silvio 3D Chest Mic / Lulao belly / Bolsonaro Tony Hawk neck) changed, stitch invariants respected, bbox/rad safe!
    let otherMeshDiff = 0, wDiff = 0, normFaceDiff = 0, headMoved = 0, extraMoved = 0;
    for (let m = 0; m < nMesh; m++) {
      const moO = meshOffsO[m], mEndO = (m + 1 < nMesh) ? meshOffsO[m + 1] : ptrMetaO;
      const moC = meshOffsC[m], mEndC = (m + 1 < nMesh) ? meshOffsC[m + 1] : ptrMetaC;
      const isHead = (m === pc.expMesh);
      const extraMode = pc.extraMeshes.get(m);
      if (!isHead && !extraMode) {
        if (!orig.subarray(moO, mEndO).equals(cur.subarray(moC, mEndC))) {
          fail('PSX', `${pc.name}: Mesh[${m}] foi modificada indevidamente!`);
          otherMeshDiff++;
        }
      } else if (extraMode === 'mic3d') {
        // Validate injected 3D geometric chest microphone in Mesh[8]:
        //  - nV === oldNV + 23, nF === oldNF + 18, strict nN === nV + nF
        //  - All original vertices [0..oldNV-1] 100% byte-identical (w=0/1/2 stitches untouched!)
        //  - All added mic vertices [oldNV..nV-1] strictly w=0
        //  - hdrBbox & rad cover every vertex (including protruding 3D mic!)
        const oldNV = orig.readUInt16LE(moO + 2), oldNF = orig.readUInt16LE(moO + 6);
        const curNV = cur.readUInt16LE(moC + 2), curNN = cur.readUInt16LE(moC + 4), curNF = cur.readUInt16LE(moC + 6);
        if (curNV !== oldNV + SILVIO_MIC_VERTS || curNF !== oldNF + SILVIO_MIC_FACES || curNN !== curNV + curNF) {
          fail('PSX', `${pc.name} M[${m}] Mic3D contagens invalidas: v=${curNV} n=${curNN} f=${curNF}`);
          wDiff++;
        }
        if (!orig.subarray(moO + 28, moO + 28 + oldNV * 8).equals(cur.subarray(moC + 28, moC + 28 + oldNV * 8))) {
          fail('PSX', `${pc.name} M[${m}] Mic3D alterou vertices originais do peito!`);
          wDiff++;
        }
        let xmin = 32767, xmax = -32768, ymin = 32767, ymax = -32768, zmin = 32767, zmax = -32768, maxR = 0;
        for (let v = 0; v < curNV; v++) {
          const vo = moC + 28 + v * 8;
          const cx = cur.readInt16LE(vo), cy = cur.readInt16LE(vo + 2), cz = cur.readInt16LE(vo + 4), cw = cur.readUInt16LE(vo + 6);
          if (v >= oldNV && cw !== 0) wDiff++;
          if (cw !== 2) {
            if (cx < xmin) xmin = cx; if (cx > xmax) xmax = cx;
            if (cy < ymin) ymin = cy; if (cy > ymax) ymax = cy;
            if (cz < zmin) zmin = cz; if (cz > zmax) zmax = cz;
            const r = Math.hypot(cx, cy, cz); if (r > maxR) maxR = r;
          }
        }
        const rad = cur.readUInt32LE(moC + 8);
        const bb = [0,1,2,3,4,5].map(k => cur.readInt16LE(moC + 12 + k * 2));
        if (rad / 256 < maxR) fail('PSX', `${pc.name} M[${m}] Mic3D: rad/256 (${(rad/256).toFixed(1)}) < maxVertR (${maxR.toFixed(1)})!`);
        if (bb[0]*16 < xmax || bb[1]*16 > xmin || bb[2]*16 < ymax || bb[3]*16 > ymin || bb[4]*16 < zmax || bb[5]*16 > zmin) {
          fail('PSX', `${pc.name} M[${m}] Mic3D: hdrBbox [${bb}] nao cobre todos os vertices!`);
        }
        extraMoved = SILVIO_MIC_VERTS;
      } else {
        const nV = orig.readUInt16LE(moO + 2), nN = orig.readUInt16LE(moO + 4);
        const vOffO = moO + 28, nOffO = vOffO + nV * 8;
        const vOffC = moC + 28, nOffC = vOffC + nV * 8;
        let xmin = 32767, xmax = -32768, ymin = 32767, ymax = -32768, zmin = 32767, zmax = -32768, maxR = 0;
        for (let v = 0; v < nV; v++) {
          const voO = vOffO + v * 8, voC = vOffC + v * 8;
          const ox = orig.readInt16LE(voO), oy = orig.readInt16LE(voO + 2), oz = orig.readInt16LE(voO + 4), ow = orig.readUInt16LE(voO + 6);
          const cx = cur.readInt16LE(voC), cy = cur.readInt16LE(voC + 2), cz = cur.readInt16LE(voC + 4), cw = cur.readUInt16LE(voC + 6);
          if (ow !== cw) wDiff++;
          const moved = (ox !== cx || oy !== cy || oz !== cz);
          // HEAD & w0only: NEVER touch w != 0! w1ok (Lulao belly / Bolsonaro neck): NEVER touch w === 2!
          if (moved) {
            if ((isHead || extraMode === 'w0only') && ow !== 0) wDiff++;
            if (extraMode === 'w1ok' && ow === 2) wDiff++;
            if (isHead) headMoved++; else extraMoved++;
          }
          if (cw !== 2) {
            if (cx < xmin) xmin = cx; if (cx > xmax) xmax = cx;
            if (cy < ymin) ymin = cy; if (cy > ymax) ymax = cy;
            if (cz < zmin) zmin = cz; if (cz > zmax) zmax = cz;
            const r = Math.hypot(cx, cy, cz); if (r > maxR) maxR = r;
          }
        }
        if (!(isHead && pc.allowHeadUvRemap)) {
          for (let p = 0; p < (mEndO - nOffO); p++) if (orig[nOffO + p] !== cur[nOffC + p]) normFaceDiff++;
        } else {
          // Allow ONLY U-coordinate remap (0..14) on texIdx=6 crown faces of Silvio Style A!
          if (!orig.subarray(nOffO, nOffO + nN * 8).equals(cur.subarray(nOffC, nOffC + nN * 8))) normFaceDiff++;
          const nF = orig.readUInt16LE(moO + 6);
          let fpO = nOffO + nN * 8, fpC = nOffC + nN * 8;
          for (let fi = 0; fi < nF; fi++) {
            const fLen = orig.readUInt16LE(fpO + 2);
            const tid = orig.readUInt32LE(fpO + 16);
            for (let b = 0; b < fLen; b++) {
              const isCrownU = (tid === 6 && (b === 20 || b === 22 || b === 24 || b === 26));
              if (!isCrownU && orig[fpO + b] !== cur[fpC + b]) normFaceDiff++;
            }
            fpO += fLen; fpC += fLen;
          }
        }
        const rad = cur.readUInt32LE(moC + 8);
        const bb = [0,1,2,3,4,5].map(k => cur.readInt16LE(moC + 12 + k * 2));
        if (rad / 256 < maxR) fail('PSX', `${pc.name} M[${m}]: rad/256 (${(rad/256).toFixed(1)}) < maxVertR (${maxR.toFixed(1)})!`);
        if (bb[0]*16 < xmax || bb[1]*16 > xmin || bb[2]*16 < ymax || bb[3]*16 > ymin || bb[4]*16 < zmax || bb[5]*16 > zmin) {
          fail('PSX', `${pc.name} M[${m}]: hdrBbox [${bb}] nao cobre todos os vertices!`);
        }
      }
    }
    if (headMoved === 0) fail('PSX', `${pc.name}: HEAD Mesh[${pc.expMesh}] nao teve nenhum vertice esculpido!`);
    if (pc.extraMeshes.size > 0 && extraMoved === 0) fail('PSX', `${pc.name}: ${pc.extraLabel} 3D nao teve nenhum vertice esculpido!`);
    if (wDiff > 0) fail('PSX', `${pc.name}: ${wDiff} stitch vertices foram violados!`);
    if (normFaceDiff > 0) fail('PSX', `${pc.name}: ${normFaceDiff} bytes em normais/faces alterados!`);
    if (!otherMeshDiff && !wDiff && !normFaceDiff && !zeroClut && headMoved > 0 && (pc.extraMeshes.size === 0 || extraMoved > 0)) {
      const extraMsg = extraMoved > 0 ? ` + ${pc.extraLabel} (${extraMoved}v${pc.allowDelta ? '/18f' : ''})` : '';
      pass(`${pc.name.padEnd(12)}: HEAD M[${pc.expMesh}] (${headMoved}v)${extraMsg}, costuras ok, bbox/rad ok, 0 CLUT 0x0000`);
    }
  }

  // Validate Level 1 Hangar Texture Library (skhan_l.psx, idx 13) restored 100% original!
  {
    const hOrig = getWadEntry(fdRed, 455, hedDisk, 13);
    const hCur = getWadEntry(fdMod, 455, hedDisk, 13);
    if (!hOrig.equals(hCur)) fail('HANGAR', `skhan_l.psx difere do original Redump (${hCur.length} B)!`);
    else pass('skhan_l.psx (Fase 1 The Hangar 1P/2P): 100% restaurado ao original Redump (316.604 B intocados)');
  }
  // Validate Lulao 3D World Assets: items.psx (3D 'X' + 3D 51 Bottle/Aura), skhan_o/o2 (Barril 51+Lulao + Haddad), skven_o/l (Pitu), sksl2 (Dilma + Vento), c_kart (Bolsonaro)
  {
    const psxLib = require('./psx_skater_lib');
    const itemsMod = getWadEntry(fdMod, 455, hedDisk, 8);
    const ip = psxLib.parsePsxStructure(itemsMod);
    const bMo = ip.meshOffs[8];
    const bV = itemsMod.readUInt16LE(bMo + 2), bF = itemsMod.readUInt16LE(bMo + 6);
    const bDrawDist = itemsMod.readUInt32LE(bMo + 24);
    const auraTex = ip.textures.find(t => t.texIdx === 9);
    const auraPal0 = auraTex ? itemsMod.readUInt16LE(auraTex.palInfo.offset) : 0;
    if (ip.numMeshes !== 14 || ip.meshHashes[13] !== HASH_X_LETTER || bV !== 56 || bF !== 50 || bDrawDist !== 0xffff7fff || !auraTex || auraPal0 !== 0x7c1f) {
      fail('WORLD3D', `items.psx (idx=8) invalido: meshes=${ip.numMeshes}, M[8]=${bV}v/${bF}f, drawDist=0x${bDrawDist.toString(16)}, auraPal0=0x${auraPal0.toString(16)}`);
    } else {
      pass(`items.psx (idx=8, ${itemsMod.length}/40960 B): letra 3D 'X' (M[13]) + 3D Garrafa 51 + Aura Dourada Aditiva (M[8], ${bV}v/${bF}f, alpha 0x7c1f) 100% validos`);
    }
    const skvenOMod = getWadEntry(fdMod, 455, hedDisk, 1103);
    const expSkvenO = buildSkvenOPsxWithPitu();
    if (!skvenOMod.equals(expSkvenO)) fail('WORLD3D', `skven_o.psx (idx=1103) difere da Garrafa 3D de Pitu esperada!`);
    else {
      const vp = psxLib.parsePsxStructure(skvenOMod);
      const mo = vp.meshOffs[4];
      const nV = skvenOMod.readUInt16LE(mo + 2), nN = skvenOMod.readUInt16LE(mo + 4), nF = skvenOMod.readUInt16LE(mo + 6);
      if (nV !== 40 || nN !== 38 || nF !== 38) fail('WORLD3D', `skven_o.psx M[4] Pitu contagens invalidas: ${nV}v/${nN}n/${nF}f`);
      else pass(`skven_o.psx (idx=1103) & skven_l.psx (idx=1102): Garrafa 3D de Pitu (${nV}v/${nF}f, ${skvenOMod.length}/10240 B) + rotulo PITU validos`);
    }
    const skhanOMod = getWadEntry(fdMod, 455, hedDisk, 14);
    const skhanO2Mod = getWadEntry(fdMod, 455, hedDisk, 1109);
    const hp1 = psxLib.parsePsxStructure(skhanOMod);
    const hp2 = psxLib.parsePsxStructure(skhanO2Mod);
    const hMo = hp1.meshOffs[8];
    const hV = skhanOMod.readUInt16LE(hMo + 2), hF = skhanOMod.readUInt16LE(hMo + 6);
    const hDrawDist = skhanOMod.readUInt32LE(hMo + 24);
    const hTex = hp1.textures.find(t => t.texIdx === 24);
    const hPal0 = hTex ? skhanOMod.readUInt16LE(hTex.palInfo.offset) : 0;
    const bFrontTex = hp1.textures.find(t => t.texIdx === 26);
    const bBackTex  = hp1.textures.find(t => t.texIdx === 39);
    if (hp1.numMeshes < 10 || hp2.numMeshes < 10 || hV !== 34 || hF !== 32 || hDrawDist !== 0xffff7fff || !hTex || hTex.w !== 64 || hTex.h !== 64 || hPal0 !== 0x7c1f || !bFrontTex || bFrontTex.palSize !== 16 || !bBackTex || bBackTex.w !== 64 || bBackTex.h !== 64) {
      fail('WORLD3D', `skhan_o / skhan_o2 invalido (M[8] Haddad=${hV}v/${hF}f, barril ti26=${bFrontTex ? bFrontTex.palSize : 'missing'}, ti39=${bBackTex ? bBackTex.w + 'x' + bBackTex.h : 'missing'})!`);
    } else {
      pass(`skhan_o.psx (idx=14, ${skhanOMod.length}/122880 B) & skhan_o2.psx (idx=1109): Barris 51 Frente + Lulao Atras (ti=26/39 64x64 16c) + 3D Haddad M[8] (${hV}v/${hF}f) validos`);
    }
    const sksl2OMod = getWadEntry(fdMod, 455, hedDisk, 1095);
    const sksl2LMod = getWadEntry(fdMod, 455, hedDisk, 1094);
    const sksl2L2Mod = getWadEntry(fdMod, 455, hedDisk, 1096);
    const dp = psxLib.parsePsxStructure(sksl2OMod);
    const dl1 = psxLib.parsePsxStructure(sksl2LMod);
    const dl2 = psxLib.parsePsxStructure(sksl2L2Mod);
    const dMo = dp.meshOffs[5];
    const dV = sksl2OMod.readUInt16LE(dMo + 2), dF = sksl2OMod.readUInt16LE(dMo + 6);
    const dDrawDist = sksl2OMod.readUInt32LE(dMo + 24);
    const dt1 = dl1.textures.find(t => t.palId === 2582071966);
    const dt2 = dl2.textures.find(t => t.palId === 2582071966);
    const dPal0 = dt1 ? sksl2LMod.readUInt16LE(dt1.palInfo.offset) : 0;
    const vMo = dp.meshOffs[4];
    const vV = sksl2OMod.readUInt16LE(vMo + 2), vF = sksl2OMod.readUInt16LE(vMo + 6);
    const vDrawDist = sksl2OMod.readUInt32LE(vMo + 24);
    const vt1 = dl1.textures.find(t => t.palId === 0xabe1c32e);
    const vt2 = dl2.textures.find(t => t.palId === 0xabe1c32e);
    if (dV !== 20 || dF !== 12 || dDrawDist !== 0xffff7fff || !dt1 || dt1.w !== 40 || dt1.h !== 64 || !dt2 || dPal0 !== 0x7c1f || vV !== 12 || vF !== 10 || vDrawDist !== 0xffff7fff || !vt1 || vt1.w !== 48 || vt1.h !== 64 || !vt2) {
      fail('WORLD3D', `School II Dilma/Vento invalido (M[5]=${dV}v/${dF}f, M[4]=${vV}v/${vF}f, vTex=${vt1 ? vt1.w + 'x' + vt1.h : 'missing'})!`);
    } else {
      pass(`sksl2_o.psx (idx=1095, ${sksl2OMod.length}/6144 B) & sksl2_l/l2.psx (${sksl2LMod.length}/342016 B): 3D Dilma M[5] (40x64) + 3D Vento Estocado M[4] (${vV}v/${vF}f, 48x64) validos`);
    }
    const kartMod = getWadEntry(fdMod, 455, hedDisk, 1100);
    const kp = psxLib.parsePsxStructure(kartMod);
    const kMo = kp.meshOffs[0];
    const kV = kartMod.readUInt16LE(kMo + 2), kF = kartMod.readUInt16LE(kMo + 6);
    const kFace = kp.textures.find(t => t.texIdx === 10);
    if (kV !== 190 || kF !== 140 || !kFace || kFace.w !== 48 || kFace.h !== 52) {
      fail('WORLD3D', `c_kart.psx (idx=1100) Bolsonaro invalido: ${kV}v/${kF}f, face=${kFace ? kFace.w + 'x' + kFace.h : 'missing'}`);
    } else {
      pass(`c_kart.psx (idx=1100, ${kartMod.length}/20480 B): Cabeca 3D Bolsonaro Doidao (${kV}v/${kF}f, face 48x52 16c) 100% valida`);
    }
  }

  // =========================================================================
  // STAGE 6: ISO-9660 LBA ORDER, SIZES, XA ATTRIBUTES, UNMODIFIED FILES, VOICES.DAT & THPS1.WAD
  // =========================================================================
  console.log('\n[STAGE 6] ISO-9660 — 48/48 Arquivos Originais Redump + 49o VOICES.DAT + 50o THPS1.WAD');
  const pvdR = readSectorsUser(fdRed, 16, 1), pvdM = readSectorsUser(fdMod, 16, 1);
  const filesR = parseIsoDir(fdRed, pvdR.readUInt32LE(158), pvdR.readUInt32LE(166), '').sort((a, b) => a.lba - b.lba);
  const filesM = parseIsoDir(fdMod, pvdM.readUInt32LE(158), pvdM.readUInt32LE(166), '').sort((a, b) => a.lba - b.lba);
  if (filesR.length !== 48 || filesM.length !== 50) fail('ISO', `Contagem de arquivos: ${filesM.length} (esperado 50 = 48 Redump + VOICES.DAT + THPS1.WAD)`);
  const modMap = new Map(filesM.map(f => [f.path, f]));
  const expectedModFiles = new Set([
    'SLUS_010.66', 'CD.HED', 'CD.WAD', 'COMPILED.XA', 'INTRO.STR',
    'X/OD.STR', 'X/BAILS02.STR', 'X/BURNQUIS.STR', 'X/CABALLER.STR', 'X/CAMPBELL.STR',
    'X/GLIFBERG.STR', 'X/HAWK.STR', 'X/KOSTON.STR', 'X/LASEK.STR', 'X/MS.STR',
    'X/MULLEN.STR', 'X/MUSKA.STR', 'X/BAILS01.STR', 'X/PC.STR', 'X/REYNOLDS.STR',
    'X/ROWLEY.STR', 'X/SM.STR', 'X/STEAMER.STR', 'X/THOMAS.STR'
  ]);
  let lbaOk = 0, unmodOk = 0;
  for (const fr of filesR) {
    const fm = modMap.get(fr.path);
    if (!fm) { fail('ISO', `Arquivo ausente: ${fr.path}`); continue; }
    if (fr.lba !== fm.lba || fr.size !== fm.size || fr.xaAttr !== fm.xaAttr) {
      fail('ISO', `Metadados divergentes em ${fr.path}: LBA ${fr.lba}->${fm.lba}, sz ${fr.size}->${fm.size}, XA ${fr.xaAttr}->${fm.xaAttr}`);
    } else lbaOk++;
    if (!expectedModFiles.has(fr.path)) {
      const nSec = Math.ceil(fr.size / 2048);
      const bR = Buffer.alloc(nSec * 2352), bM = Buffer.alloc(nSec * 2352);
      fs.readSync(fdRed, bR, 0, bR.length, fr.lba * 2352);
      fs.readSync(fdMod, bM, 0, bM.length, fm.lba * 2352);
      if (!bR.equals(bM)) fail('ISO', `Arquivo nao-modificado difere do Redump: ${fr.path}`);
      else unmodOk++;
    }
  }
  if (lbaOk === 48) pass(`48/48 arquivos originais com LBA, tamanho e atributos CD-XA 100% identicos ao Redump (${unmodOk} arquivos intocados bit-a-bit)`);

  // Validate 49th file VOICES.DAT (MODCODE Sector 0 + VOICETBL/Sec1Code Sector 1 + 41 SPU-ADPCM payloads)
  const voicesFile = modMap.get('VOICES.DAT');
  let voicesSectors = 0;
  if (!voicesFile) {
    fail('VOICES', 'VOICES.DAT ausente na ISO!');
  } else {
    voicesSectors = Math.ceil(voicesFile.size / 2048);
    const voicesBuf = readSectorsUser(fdMod, voicesFile.lba, voicesSectors);
    const voicesDisk = fs.readFileSync(path.join(rootDir, 'VOICES.DAT'));
    if (!voicesBuf.equals(voicesDisk)) fail('VOICES', 'VOICES.DAT na ISO difere do arquivo no workspace!');
    const expModCode = assembleModCode();
    if (!voicesBuf.subarray(0, 2048).equals(expModCode)) fail('VOICES', 'Setor 0 (MODCODE) em VOICES.DAT difere do assembly esperado!');
    const expSec1Code = assembleBailHookCode();
    if (!voicesBuf.subarray(2048 + 0x400, 4096).equals(expSec1Code)) fail('VOICES', 'Setor 1 +0x400 (Hook_BailSfx + VoiceSelect) em VOICES.DAT difere do assembly esperado!');
    const voicesManifestPath = path.join(rootDir, 'build', 'voices_manifest.json');
    const voicesManifest = fs.existsSync(voicesManifestPath) ? JSON.parse(fs.readFileSync(voicesManifestPath, 'utf8')) : null;
    const gpMeta = voicesManifest && voicesManifest.gameplayBank;
    const bolsoMeta = voicesManifest && voicesManifest.bolsoGameplayBank;
    const cashMeta = voicesManifest && voicesManifest.cashArt;
    const crashSfxMeta = voicesManifest && voicesManifest.crashSfxBank;
    if (!gpMeta || gpMeta.clipCount !== 14 || !Array.isArray(gpMeta.ringEntries) || gpMeta.ringEntries.length !== 28 || gpMeta.spuPitch !== 0x0280 || !bolsoMeta || bolsoMeta.clipCount !== 14 || bolsoMeta.ringEntries.length !== 28 || !cashMeta || !cashMeta.startSector || !crashSfxMeta || crashSfxMeta.clipCount !== 12 || !crashSfxMeta.perClipPitch || !Array.isArray(crashSfxMeta.pitches) || crashSfxMeta.pitches.length !== 12) {
      fail('VOICES', 'Manifesto build/voices_manifest.json sem gameplayBank/bolsoGameplayBank/cashArt/crashSfxBank validos!');
    } else {
      const fullGpMeta = { ...gpMeta, bolso: bolsoMeta, cashArt: cashMeta, crash: crashSfxMeta };
      const { buf: expLulaoCode, labels: lulaoLabels } = assembleLulaoEngine(fullGpMeta);
      if (!voicesBuf.subarray(4096, 10240).equals(expLulaoCode)) fail('VOICES', 'Setores 2..4 (LULAO_CODE 6144 B) em VOICES.DAT diferem do assembly esperado!');

      // Static MIPS invariant audit on LULAO_CODE:
      //  1) LulaoStream_StartFromCache MUST have ZERO calls to CdRead/CdControl/CDWAD_WaitIdle/XA_Pause/Mem_Alloc/Mem_Free!
      //  2) LulaoCache_Load MUST walk Heap[1] freeList @ 19112(gp) (lw t0, 19112(gp) = 0x8F884AA8) BEFORE Mem_Alloc!
      const forbiddenInStart = new Map([
        [jalWord(SYM.CdRead),         'CdRead'],
        [jalWord(SYM.CdControl),      'CdControl'],
        [jalWord(SYM.CDWAD_WaitIdle), 'CDWAD_WaitIdle'],
        [jalWord(SYM.XA_Pause),       'XA_Pause'],
        [jalWord(SYM.Mem_Alloc),      'Mem_Alloc'],
        [jalWord(SYM.Mem_Free),       'Mem_Free'],
      ]);
      const startFnPc = lulaoLabels.get('LulaoStream_StartFromCache');
      const tickFnPc  = lulaoLabels.get('LulaoStream_Tick');
      const spawnFnPc = lulaoLabels.get('Hook_SpawnLetter');
      let mipsInvErr = 0;
      let startMutesL = false, startMutesR = false, tickMutesL = false, tickMutesR = false;
      for (let pc = startFnPc; pc < tickFnPc; pc += 4) {
        const w = voicesBuf.readUInt32LE(4096 + (pc - ADDR.LulaoCodeBase));
        if (w === 0xA5001D84) startMutesL = true; // sh zero, 0x1D84(t0) -> vLOUT = 0
        if (w === 0xA5001D86) startMutesR = true; // sh zero, 0x1D86(t0) -> vROUT = 0
        if (forbiddenInStart.has(w)) {
          fail('VOICES', `Violacao Zero-Stall: LulaoStream_StartFromCache @ 0x${pc.toString(16)} chama ${forbiddenInStart.get(w)}!`);
          mipsInvErr++;
        }
      }
      for (let pc = tickFnPc; pc < spawnFnPc; pc += 4) {
        const w = voicesBuf.readUInt32LE(4096 + (pc - ADDR.LulaoCodeBase));
        if (w === 0xA5001D84) tickMutesL = true;
        if (w === 0xA5001D86) tickMutesR = true;
      }
      if (!startMutesL || !startMutesR || !tickMutesL || !tickMutesR) {
        fail('VOICES', `Violacao Anti-Chiado SPU Reverb: vLOUT/vROUT mute ausente (start=${startMutesL}/${startMutesR}, tick=${tickMutesL}/${tickMutesR})!`);
        mipsInvErr++;
      }
      const heapWalkPc  = lulaoLabels.get('Heap1_LargestFree');
      const cacheLoadPc = lulaoLabels.get('LulaoCache_StartAsync');
      const cacheFreePc = lulaoLabels.get('LulaoCache_Free');
      const jalHeapWalk = jalWord(heapWalkPc);
      let seenFreeListWalk = false, seenWalkCall = false, allocBeforeWalk = false, seenLevel14980 = false;
      const jalMemAlloc = jalWord(SYM.Mem_Alloc);
      for (let pc = heapWalkPc; pc < cacheLoadPc; pc += 4) {
        if (voicesBuf.readUInt32LE(4096 + (pc - ADDR.LulaoCodeBase)) === 0x8F884AA8) seenFreeListWalk = true; // lw t0, 19112(gp)
      }
      for (let pc = cacheLoadPc; pc < cacheFreePc; pc += 4) {
        const w = voicesBuf.readUInt32LE(4096 + (pc - ADDR.LulaoCodeBase));
        if (w === jalHeapWalk) seenWalkCall = true;
        if (w === 0x8F883A84) seenLevel14980 = true;   // lw t0, 14980(gp) (g_CurrentLevel)
        if (w === jalMemAlloc && !seenWalkCall) allocBeforeWalk = true;
      }
      if (!seenFreeListWalk || !seenWalkCall || allocBeforeWalk || !seenLevel14980) {
        fail('VOICES', `Violacao OOM/Level Guard: LulaoCache_StartAsync (walk=${seenFreeListWalk}, call=${seenWalkCall}, before=${allocBeforeWalk}, lv14980=${seenLevel14980})!`);
        mipsInvErr++;
      }

      // Validate LULAO_GPBANK payloads (14x2 ring-doubled, 16B-aligned, exact copy-1 === copy-2 parity)
      const gpBaseOff = gpMeta.startSector * 2048;
      let gpErr = 0;
      if (gpBaseOff + gpMeta.totalBytes > voicesBuf.length) {
        fail('VOICES', `LULAO_GPBANK excede VOICES.DAT (${gpBaseOff + gpMeta.totalBytes} > ${voicesBuf.length})`);
        gpErr++;
      } else {
        const halfA = voicesBuf.subarray(gpBaseOff, gpBaseOff + gpMeta.singleBytes);
        const halfB = voicesBuf.subarray(gpBaseOff + gpMeta.singleBytes, gpBaseOff + 2 * gpMeta.singleBytes);
        if (!halfA.equals(halfB)) {
          fail('VOICES', 'LULAO_GPBANK anel 2x inconsistente (copia 1 != copia 2)!');
          gpErr++;
        }
        for (let i = 0; i < gpMeta.ringEntries.length; i++) {
          const re = gpMeta.ringEntries[i];
          if (re.byteSize === 0 || (re.byteSize % 16) !== 0 || (re.byteOffsetInBank % 16) !== 0 || (re.byteOffsetInBank + re.byteSize) > gpMeta.totalBytes) {
            fail('VOICES', `LULAO_GPBANK entrada #${i} invalida: off=${re.byteOffsetInBank} sz=${re.byteSize}`);
            gpErr++;
          }
        }
        // Verify minimum random clip count across ALL 14 starting slots for School II fragmented (28 KB) & NY City (60 KB)
        let minClips28k = 999, minClips60k = 999;
        for (let s = 0; s < gpMeta.clipCount; s++) {
          const baseOff = Math.floor(gpMeta.ringEntries[s].byteOffsetInBank / 2048) * 2048;
          let c28 = 0, c60 = 0;
          for (let k = 0; k < gpMeta.clipCount; k++) {
            const re = gpMeta.ringEntries[s + k];
            const needSec = Math.ceil((re.byteOffsetInBank + re.byteSize - baseOff) / 2048);
            const needAlloc = 1024 + needSec * 2048;
            if (needAlloc <= 28672) c28 = k + 1;
            if (needAlloc <= 61440) c60 = k + 1;
          }
          if (c28 < minClips28k) minClips28k = c28;
          if (c60 < minClips60k) minClips60k = c60;
        }
        if (minClips28k < 2 || minClips60k < 5) {
          fail('VOICES', `LULAO_GPBANK variedade insuficiente: min28KB=${minClips28k} (req >=2), min60KB=${minClips60k} (req >=5)`);
          gpErr++;
        }
      }
      // Validate BOLSO_GPBANK (14x2 ring-doubled) & LULAO_CASHART (magic "CASH" + exact items.psx T[0..2] offsets!)
      const bBaseOff = bolsoMeta.startSector * 2048;
      if (bBaseOff + bolsoMeta.totalBytes > voicesBuf.length || !voicesBuf.subarray(bBaseOff, bBaseOff + bolsoMeta.singleBytes).equals(voicesBuf.subarray(bBaseOff + bolsoMeta.singleBytes, bBaseOff + 2 * bolsoMeta.singleBytes))) {
        fail('VOICES', 'BOLSO_GPBANK anel 2x invalido em VOICES.DAT!');
        gpErr++;
      }
      const cBaseOff = cashMeta.startSector * 2048;
      if (cashMeta.startSector !== 17 || cBaseOff + 6144 > voicesBuf.length || voicesBuf.readUInt32LE(cBaseOff) !== 0x43415348) {
        fail('VOICES', `LULAO_CASHART boot-residente invalido em VOICES.DAT @ setor +${cashMeta.startSector} (esperado setor 17)!`);
        gpErr++;
      }
      // Validate CRASH_SFXBANK ("CRSF" magic, 12 native Crash 3 .VAG clips + exact per-clip Naughty Dog SPU pitches @ +104..+127)
      const crBaseOff = crashSfxMeta.startSector * 2048;
      const EXP_CRASH_PITCHES = [0x03A0, 0x0343, 0x045A, 0x03A0, 0x0340, 0x0400, 0x03A0, 0x03A0, 0x03FF, 0x02E0, 0x0299, 0x039B];
      if (crBaseOff + crashSfxMeta.totalBytes > voicesBuf.length || voicesBuf.readUInt32LE(crBaseOff) !== 0x43525346 || voicesBuf.readUInt32LE(crBaseOff + 4) !== 12) {
        fail('VOICES', `CRASH_SFXBANK invalido em VOICES.DAT @ setor +${crashSfxMeta.startSector}!`);
        gpErr++;
      } else {
        for (let i = 0; i < 12; i++) {
          const eOff = voicesBuf.readUInt32LE(crBaseOff + 8 + i * 8);
          const eSz  = voicesBuf.readUInt32LE(crBaseOff + 12 + i * 8);
          const ePitch = voicesBuf.readUInt16LE(crBaseOff + 104 + i * 2);
          if (eSz === 0 || (eSz % 16) !== 0 || (eOff % 16) !== 0 || (eOff + eSz) > crashSfxMeta.totalBytes) {
            fail('VOICES', `CRASH_SFXBANK slot #${i} invalido: off=${eOff} sz=${eSz}`);
            gpErr++;
          }
          if (ePitch !== EXP_CRASH_PITCHES[i]) {
            fail('VOICES', `CRASH_SFXBANK slot #${i} pitch SPU divergente: 0x${ePitch.toString(16)} != esperado 0x${EXP_CRASH_PITCHES[i].toString(16)}!`);
            gpErr++;
          }
          if (i < 8 && (eOff + eSz) > 16 * 2048) {
            fail('VOICES', `CRASH_SFXBANK core slot #${i} ultrapassa limite de fallback 16 setores (32 KB): ${eOff + eSz} B!`);
            gpErr++;
          }
        }
      }
      if (mipsInvErr === 0 && gpErr === 0) {
        pass(`LULAO_GPBANK + BOLSO_GPBANK + CRASH_SFXBANK (12 .VAG Crash 3 pitch SPU individual 0x0299..0x045A) + CASHART Boot-Residente: 0 CdRead/XA_Pause/Mem_Alloc em gameplay`);
      }
      const { buf: expLulaoStrData, mappings: lulaoMappings } = buildLulaoStrData(fullGpMeta);
      const expCrashSfxCode = assembleCrashSfxCode(fullGpMeta, lulaoLabels);
      expCrashSfxCode.copy(expLulaoStrData, 0xB40);
      if (!voicesBuf.subarray(10240, 14336).equals(expLulaoStrData)) fail('VOICES', 'Setores 5..6 (LULAO_STRDATA + CRASH_SFX_CODE + ringTables) em VOICES.DAT diferem dos dados esperados!');
      // Pillar 1 & 2 invariants on LULAO_STRDATA:
      //  - NEVER overwrite ANY Trick+Gap G6.paramStr (levels 0,1,3,4,6 -> matcher 0x800662AC)!
      //  - MUST include T-A-X-A-S toast pointers (0x800C08E8..0x800C08F8) & HUD words (0x800D7704..0x800D7714)!
      const forbiddenG6Shorts = new Set([0, 1, 3, 4, 6].map(lv => (SYM.g_LevelTable + lv * 0x174 + 0x88 + 6 * 24) >>> 0));
      const mapByAddr = new Map(lulaoMappings);
      for (const badPtr of forbiddenG6Shorts) {
        if (mapByAddr.has(badPtr)) fail('VOICES', `Violacao Pilar 1: LULAO_STRDATA sobrescreve G6.paramStr em 0x${badPtr.toString(16)}!`);
      }
      const expHudTaxas = [[0x800D7704, 0x54], [0x800D7708, 0x41], [0x800D770C, 0x58], [0x800D7710, 0x41], [0x800D7714, 0x53]];
      for (const [ptr, ch] of expHudTaxas) {
        if (mapByAddr.get(ptr) !== ch) fail('VOICES', `Violacao Pilar 2: HUD T-A-X-A-S em 0x${ptr.toString(16)} esperado 0x${ch.toString(16)}, encontrado ${mapByAddr.get(ptr)}`);
      }
    }
    const magic = voicesBuf.readUInt32LE(2048);
    const lCnt = voicesBuf.readUInt32LE(2052);
    const bCnt = voicesBuf.readUInt32LE(2056);
    const spuBase = voicesBuf.readUInt32LE(2060);
    const sCnt = voicesBuf.readUInt32LE(2048 + 0x3F0);
    if (magic !== 0x564F4943 || lCnt !== 14 || bCnt !== 14 || sCnt !== 13 || spuBase !== 0x58000) {
      fail('VOICES', `VOICETBL invalido: magic=0x${magic.toString(16)}, lulao=${lCnt}, bolso=${bCnt}, silvio=${sCnt}, spu=0x${spuBase.toString(16)}`);
    } else {
      let clipErr = 0, maxSpu = 0;
      const totalClips = lCnt + bCnt + sCnt;
      for (let i = 0; i < totalClips; i++) {
        const eb = 2048 + 16 + i * 16;
        const sOff = voicesBuf.readUInt32LE(eb);
        const sCntSec = voicesBuf.readUInt32LE(eb + 4);
        const bSz = voicesBuf.readUInt32LE(eb + 8);
        const pitch = voicesBuf.readUInt32LE(eb + 12);
        if (bSz > maxSpu) maxSpu = bSz;
        if (bSz === 0 || (bSz % 64) !== 0 || bSz > (0x7EFF0 - 0x58000) || pitch !== 0x0400 || (sOff + sCntSec) > voicesSectors) {
          fail('VOICES', `Clip #${i} invalido: sOff=${sOff} sCnt=${sCntSec} bSz=${bSz} pitch=0x${pitch.toString(16)}`);
          clipErr++; continue;
        }
        const payload = voicesBuf.subarray(sOff * 2048, sOff * 2048 + bSz);
        let hasLoopRepeat = false, hasEnd = false;
        for (let o = 0; o + 16 <= bSz; o += 16) {
          const fl = payload[o + 1];
          if (fl & 0x02) hasLoopRepeat = true;
          if (fl & 0x01) hasEnd = true;
        }
        if (hasLoopRepeat || !hasEnd) {
          fail('VOICES', `Clip #${i} flags ADPCM invalidas: hasEnd=${hasEnd} hasLoopRepeat=${hasLoopRepeat}`);
          clipErr++;
        }
      }
      if (clipErr === 0) {
        // Also validate THPS1 Resident Engine Block (Sectors 7..16 = 20,480 B at file off 14336..34816) bit-for-bit!
        const savedLog2 = console.log; console.log = () => {};
        let expThps1Blk;
        try { expThps1Blk = buildThps1ResidentBlock().block; } finally { console.log = savedLog2; }
        expThps1Blk.writeUInt32LE(voicesSectors >>> 0, THPS1_ADDR.g_Thps1Inited - THPS1_ADDR.Base);
        const gotThps1Blk = voicesBuf.subarray(14336, 14336 + THPS1_ADDR.TotalBytes);
        if (!gotThps1Blk.equals(expThps1Blk)) {
          fail('VOICES', 'Setores 7..16 (THPS1_ENGINE 20.480 B) em VOICES.DAT diferem do bloco residente esperado!');
        } else {
          pass(`VOICES.DAT @ LBA ${voicesFile.lba} (${voicesSectors} set.): 20 setores residentes (MODCODE + VOICETBL + BailSfx + VoiceSelect + LULAO_CODE 6KB + LULAO_STRDATA + THPS1_ENGINE 20KB + CASHART 6KB) + ${totalClips}/41 clips SPU-ADPCM 100% validos (max ${maxSpu} B / 159.728 B SPU RAM)`);
        }
      }
    }
  }

  // Validate 50th file THPS1.WAD (contiguous right after VOICES.DAT -> ZERO CdSearchFile at runtime!)
  const thps1File = modMap.get('THPS1.WAD');
  let thps1Sectors = 0;
  if (!thps1File) {
    fail('THPS1', 'THPS1.WAD ausente na ISO!');
  } else {
    thps1Sectors = Math.ceil(thps1File.size / 2048);
    if (voicesFile && thps1File.lba !== voicesFile.lba + voicesSectors) {
      fail('THPS1', `THPS1.WAD LBA (${thps1File.lba}) nao e contiguo apos VOICES.DAT (${voicesFile.lba + voicesSectors})!`);
    }
    const thps1Iso = readSectorsUser(fdMod, thps1File.lba, thps1Sectors);
    const thps1Disk = fs.readFileSync(path.join(rootDir, 'THPS1.WAD'));
    if (!thps1Iso.equals(thps1Disk)) fail('THPS1', 'THPS1.WAD na ISO difere do arquivo no workspace!');
    let t1Err = 0;
    if (thps1Man.totalSectors !== thps1Sectors || thps1Man.totalBytes !== thps1Disk.length) {
      fail('THPS1', `THPS1.WAD divergente do manifesto: ${thps1Disk.length} B (${thps1Sectors} set.)`); t1Err++;
    }
    for (const en of thps1Man.entries) {
      const slice = thps1Iso.subarray(en.relOffset, en.relOffset + en.size);
      if (en.name.endsWith('.bmp') && slice.subarray(0, 2).toString('ascii') !== 'BM') { fail('THPS1', `${en.name} nao e BMP valido!`); t1Err++; }
      if (en.name.endsWith('.trg') && slice.subarray(0, 4).toString('ascii') !== '_TRG') { fail('THPS1', `${en.name} nao e _TRG valido!`); t1Err++; }
      if (en.name.endsWith('.psx') && slice.readUInt32LE(0) !== 0x00020004) { fail('THPS1', `${en.name} nao e PSX 0x00020004 valido!`); t1Err++; }
    }
    // Verify ALL 39 in-place CD.WAD THPS1/Egypt files (20 LevelSel BMPs @ [573]/[578] + 19 level files @ [1127..1185]) cryptographically via SHA-256!
    const inPlace = thps1Man.cdWadInPlace;
    const inPlaceZoneMap = new Map();
    if (!inPlace || !Array.isArray(inPlace.bmps) || inPlace.bmps.length !== 20 || !Array.isArray(inPlace.levelFiles) || inPlace.levelFiles.length !== 19) {
      fail('THPS1', 'Manifesto build/thps1_manifest.json sem bloco cdWadInPlace valido (20 BMPs + 19 arquivos de fase)!');
      t1Err++;
    } else {
      for (const b of inPlace.bmps) {
        const raw = readSectorsUser(fdMod, b.lba, b.sectors).subarray(0, b.size);
        if (raw.subarray(0, 2).toString('ascii') !== 'BM' || sha256(raw) !== b.sha256) {
          fail('THPS1', `BMP in-place ${b.name} @ LBA ${b.lba} corrompido ou SHA-256 divergente!`);
          t1Err++;
        }
      }
      for (const zf of inPlace.levelFiles) {
        const raw = readSectorsUser(fdMod, zf.lba, zf.sectors).subarray(0, zf.size);
        inPlaceZoneMap.set(zf.name, raw);
        if (sha256(raw) !== zf.sha256) { fail('THPS1', `Arquivo in-place ${zf.name} @ LBA ${zf.lba} SHA-256 divergente!`); t1Err++; }
        if (zf.name.endsWith('.trg') && raw.subarray(0, 4).toString('ascii') !== '_TRG') { fail('THPS1', `${zf.name} nao e _TRG valido!`); t1Err++; }
        if (zf.name.endsWith('.psx') && raw.readUInt32LE(0) !== 0x00020004) { fail('THPS1', `${zf.name} nao e PSX 0x00020004 valido!`); t1Err++; }
      }
    }
    // Verify all 6 sculpted 3D satirical THPS1 objects (0x5111A101..0x5118A106) inside CD.WAD[1127..1185] (zero-seek in-place!)
    const customObjChecks = [
      ['skware_o.psx', 0x5111A101, 'Mandioca da Dilma'],
      ['skschl_o.psx', 0x5112A102, 'Triplex do Guaruja'],
      ['skmall_o.psx', 0x5113A103, 'Mala do Mensalao'],
      ['skdown_o.psx', 0x5115A104, 'Cofre do INSS'],
      ['skjam_o.psx',  0x5116A105, 'Pedalinho de Atibaia'],
      ['sksf_o.psx',   0x5118A106, 'Picanha da Promessa'],
    ];
    for (const [oName, expHash, label] of customObjChecks) {
      const b = inPlaceZoneMap.get(oName);
      if (!b) { fail('THPS1', `Objeto 3D esculpido ${oName} (${label}) ausente em CD.WAD[1127..1185]!`); t1Err++; continue; }
      const ptrMeta = b.readUInt32LE(4);
      const nObj = b.readUInt32LE(8);
      const meshListOff = 12 + nObj * 36;
      const nMesh = b.readUInt32LE(meshListOff);
      const lastMeshPtr = b.readUInt32LE(meshListOff + 4 + (nMesh - 1) * 4);
      let cur = ptrMeta;
      while (cur + 4 <= b.length) {
        const tag = b.readUInt32LE(cur);
        if (tag === 0xFFFFFFFF) { cur += 4; break; }
        cur += 8 + b.readUInt32LE(cur + 4);
      }
      const lastHash = b.readUInt32LE(cur + (nMesh - 1) * 4);
      const maxDist = b.readUInt32LE(lastMeshPtr + 24);
      if (lastHash !== expHash || maxDist !== 0xFFFF7FFF) {
        fail('THPS1', `${oName} (${label}) invalido: hash=0x${lastHash.toString(16)} (exp 0x${expHash.toString(16)}), maxDist=0x${maxDist.toString(16)}`);
        t1Err++;
      }
    }
    // Verify all 3 Competition Invite/Loading BMPs (t1comp0/1/2.bmp: exact 512x240 8bpp 123,960 B matching s2bgd7/8/9.bmp!)
    for (const cBmp of ['t1comp0.bmp', 't1comp1.bmp', 't1comp2.bmp']) {
      const en = thps1Man.entries.find(e => e.name === cBmp);
      if (!en || en.size !== 123960) {
        fail('THPS1', `Tela de competicao ${cBmp} ausente ou tamanho invalido (${en ? en.size : 'missing'} != 123960)!`);
        t1Err++; continue;
      }
      const cb = thps1Iso.subarray(en.relOffset, en.relOffset + en.size);
      if (cb.readInt32LE(18) !== 512 || cb.readInt32LE(22) !== 240 || cb.readUInt16LE(28) !== 8 || cb.readUInt32LE(10) !== 1078) {
        fail('THPS1', `${cBmp} cabecalho BMP fora do padrao s2bgd7/8/9.bmp (512x240 8bpp offBits=1078)!`);
        t1Err++;
      }
    }
    const { THPS1_DEFS, THPS1_GAPS } = require('./thps1_engine_mod');
    const totalThps1Goals = THPS1_DEFS.reduce((s, d) => s + (d.goals ? d.goals.length : 0), 0);
    const totalInjectedCol = thps1Man.levels.reduce((s, l) => s + ((l.trgStats && l.trgStats.g5Injected) || 0), 0);
    const totalThps1Assets = thps1Man.totalFiles + (inPlace ? inPlace.bmps.length + inPlace.levelFiles.length : 0);
    if (totalThps1Goals !== 70 || THPS1_GAPS.length !== 28 || totalInjectedCol !== 30 || thps1Man.totalFiles !== 43 || totalThps1Assets !== 82) {
      fail('THPS1', `Invariante 70 metas/30+5 objetos/28 gaps/43 THPS1.WAD/82 ativos violado: goals=${totalThps1Goals}, gaps=${THPS1_GAPS.length}, col=${totalInjectedCol}, wad=${thps1Man.totalFiles}, total=${totalThps1Assets}`);
      t1Err++;
    }
    // Brand-New Crash 3 Egypt Level ("Tomb Time", Level ID 20, Slot 19 right before Create-A-Park!) Forensic Validation:
    {
      let egErr = 0;
      const reqEgypt = ['skegyp.psx', 'skegyp_2.psx', 'skegyp_l.psx', 'skegyp_o.psx', 'skegyp_t.trg'];
      for (const ef of reqEgypt) {
        const en = thps1Man.entries.find(e => e.name.toLowerCase() === ef);
        if (!en) { fail('EGYPT20', `Arquivo da fase Egito ausente em THPS1.WAD: ${ef}`); egErr++; continue; }
        const raw = thps1Iso.subarray(en.relOffset, en.relOffset + en.size);
        if (ef === 'skegyp.psx') {
          const pm = raw.readUInt32LE(4), nObj = raw.readUInt32LE(8);
          let p = pm, okRgbs = false, okGrid = false;
          while (p + 4 <= raw.length) {
            const tag = raw.readUInt32LE(p); p += 4;
            if (tag === 0xFFFFFFFF) break;
            const len = raw.readUInt32LE(p); p += 4;
            if (tag === 0x73424752 && len === 1024) okRgbs = true;
            if (tag === 0x0000000A && raw.readInt16LE(p + 16) === 20 && raw.readInt16LE(p + 18) === 20) okGrid = true;
            p += len;
          }
          if (!okRgbs || !okGrid || nObj < 50) {
            fail('EGYPT20', `skegyp.psx estruturalmente invalido (objs=${nObj}, rgbs=${okRgbs}, grid20x20=${okGrid})`); egErr++;
          }
        }
        if (ef === 'skegyp_l.psx') {
          const lInfo = psxLib.parsePsxStructure(raw);
          if (lInfo.textures.length < 25) { fail('EGYPT20', `skegyp_l.psx poucas texturas (${lInfo.textures.length})`); egErr++; }
          for (const t of lInfo.textures) {
            if (!t.palInfo) continue;
            for (let c = 0; c < t.palSize; c++) {
              if (raw.readUInt16LE(t.palInfo.offset + c * 2) === 0x0000) {
                fail('EGYPT20', `skegyp_l.psx tex[${t.texIdx}] contem 0x0000 opaco no slot ${c}`); egErr++; break;
              }
            }
          }
        }
        if (ef === 'skegyp_o.psx') {
          const oInfo = psxLib.parsePsxStructure(raw);
          if (oInfo.numMeshes !== 2 || oInfo.meshHashes[0] !== 0x5120A107 || oInfo.textures.length !== 2) {
            fail('EGYPT20', `skegyp_o.psx invalido (meshes=${oInfo.numMeshes}, hash0=0x${(oInfo.meshHashes[0]||0).toString(16)})`); egErr++;
          }
        }
        if (ef === 'skegyp_t.trg' && (raw.subarray(0, 4).toString('ascii') !== '_TRG' || raw.readUInt32LE(8) < 50)) {
          fail('EGYPT20', `skegyp_t.trg invalido`); egErr++;
        }
      }
      if (egErr === 0) {
        pass(`Fase Inedita Tomb Time (Egito - Crash 3, ID 20, Slot 19 antes do Create-A-Park): 5/5 arquivos em THPS1.WAD (skegyp.psx c/ TAG 0x0A 20x20 + RGBs, skegyp_l.psx 0 CLUT 0x0000, skegyp_o.psx Scarab 0x5120A107 + Vase Va1iG, SkEgyp_T.trg) + t1rend09/t1levl09 in-place 100% validos!`);
      }
    }
    // Crash Bandicoot ("Crash B.", Brand-New Slot 20) Forensic Validation:
    //  1) All 33 Crash binary assets present & valid in THPS1.WAD (skater .PSX <= 67,584 B CSkaterCache limit, 8 Skate Shop decks, 8 3D board-bottom BMPs, portrait, crash_it.psx numObjs=14, 7 cr_*.psx with exact RGBs pointer relocation!)
    //  2) g_SkaterTable[0..19] ZERO deletions + g_SkaterTable[20] ("Crash B.") unlocked, PT-BR Bio, 8 Crash 3 decks!
    //  3) tricks.bin Slot 20 = Bob Burnquist [1] normal moveset + Bob's 3 specials [40,41,42] + Rodney Mullen Casper to 360 Flip [73]!
    let crErr = 0;
    const reqCrashFiles = [
      'crash.psx', 'crash_L.psx', 'crashb.psx', 'crashb_L.psx',
      'crash.psh', 'crash_L.psh', 'crashb.psh', 'crashb_L.psh',
      's2face20.bmp', 'crash_it.psx',
      'cr_han_o.psx', 'cr_ware.psx', 'cr_schl.psx', 'cr_mall.psx', 'cr_down.psx', 'cr_jam.psx', 'cr_sf.psx',
      ...Array.from({ length: 8 }, (_, i) => `s2dCR0${i + 1}c.bmp`),
      ...Array.from({ length: 8 }, (_, i) => `s2gCR0${i + 1}c.bmp`),
    ];
    for (const cName of reqCrashFiles) {
      const en = thps1Man.entries.find(e => e.name === cName);
      if (!en) { fail('CRASH20', `Ativo Crash B. ausente em THPS1.WAD: ${cName}`); crErr++; continue; }
      const raw = thps1Iso.subarray(en.relOffset, en.relOffset + en.size);
      if (/^crash.*\.psx$/i.test(cName) && cName !== 'crash_it.psx') {
        if (en.size > 0x10800 || raw.readUInt32LE(0) !== 0x00020004 || raw.readUInt32LE(8) !== 19) {
          fail('CRASH20', `Modelo ${cName} invalido ou > 67.584 B (CSkaterCache): sz=${en.size}, objs=${raw.readUInt32LE(8)}`); crErr++;
        } else {
          // Verify native THPS2 Gouraud hardware invariants on ALL 19 meshes (fl0=0x0008, nN=nV+nF, w24=0xFFFF7FFF)
          const meshOffBase = 12 + 19 * 36 + 4;
          for (let mi = 0; mi < 19; mi++) {
            const mo = raw.readUInt32LE(meshOffBase + mi * 4);
            const fl0 = raw.readUInt16LE(mo), nV = raw.readUInt16LE(mo + 2), nN = raw.readUInt16LE(mo + 4), nF = raw.readUInt16LE(mo + 6), w24 = raw.readUInt32LE(mo + 24);
            if (fl0 !== 0x0008 || nN !== nV + nF || w24 !== 0xFFFF7FFF) {
              fail('CRASH20', `${cName} M[${mi}] viola formato Gouraud nativo (fl0=0x${fl0.toString(16)} nN=${nN} vs nV+nF=${nV+nF} w24=0x${w24.toString(16)})`);
              crErr++; break;
            }
          }
        }
      }
      if (/^crash.*\.psh$/i.test(cName)) {
        const expPfx = cName.replace(/\.psh$/i, '').toUpperCase() + 'PART_';
        const cnt = (raw.toString('ascii').match(new RegExp(expPfx, 'g')) || []).length;
        if (cnt !== 19) {
          fail('CRASH20', `${cName} sem 19 entradas ${expPfx} (encontradas ${cnt}) — causaria colapso PlaySel & overwrite de CTex[1]!`);
          crErr++;
        }
      }
      if (cName === 's2face20.bmp' && (en.size !== 4088 || raw[54 + 21 * 4] !== 255 || raw[54 + 21 * 4 + 1] !== 0 || raw[54 + 21 * 4 + 2] !== 255)) {
        fail('CRASH20', `Retrato s2face20.bmp invalido (sz=${en.size}, magIdx=21)`); crErr++;
      }
      if (/^s2dCR0\dc\.bmp$/.test(cName) && en.size !== 17464) { fail('CRASH20', `Deck ${cName} tamanho ${en.size} != 17464`); crErr++; }
      if (/^s2gCR0\dc\.bmp$/.test(cName) && en.size !== 3128) { fail('CRASH20', `Board-bottom ${cName} tamanho ${en.size} != 3128`); crErr++; }
      if (cName === 'crash_it.psx') {
        if (en.size > 40784 || raw.readUInt32LE(0) !== 0x00020004 || raw.readUInt32LE(8) !== 14) {
          fail('CRASH20', `crash_it.psx invalido ou > 40.784 B: sz=${en.size}, objs=${raw.readUInt32LE(8)}`); crErr++;
        } else {
          // Verify ZERO illegal 0x18C3 (bit 0x0800 RGBs) on M[8] aura & ZERO opaque 0x0000 CLUT holes in crash_it.psx!
          const ciInfo = psxLib.parsePsxStructure(raw);
          let hasIllegal18c3 = false, has10c3Aura = false;
          for (let mi = 0; mi < ciInfo.numMeshes; mi++) {
            const mo = ciInfo.meshOffs[mi], mEnd = (mi + 1 < ciInfo.numMeshes) ? ciInfo.meshOffs[mi + 1] : ciInfo.ptrMeta;
            const nV = raw.readUInt16LE(mo + 2), nN = raw.readUInt16LE(mo + 4), nF = raw.readUInt16LE(mo + 6);
            let fp = mo + 28 + nV * 8 + nN * 8;
            for (let fi = 0; fi < nF && fp + 4 <= mEnd; fi++) {
              const fl = raw.readUInt16LE(fp), fLen = raw.readUInt16LE(fp + 2);
              if (fl === 0x18c3) hasIllegal18c3 = true;
              if (mi === 8 && fl === 0x10c3) has10c3Aura = true;
              fp += fLen;
            }
          }
          if (hasIllegal18c3 || !has10c3Aura) {
            fail('CRASH20', `crash_it.psx aura/flags invalidas (illegal18c3=${hasIllegal18c3}, aura10c3=${has10c3Aura})`); crErr++;
          }
          for (const t of ciInfo.textures) {
            if (!t.palInfo) continue;
            for (let c = 0; c < t.palSize; c++) {
              if (raw.readUInt16LE(t.palInfo.offset + c * 2) === 0x0000) {
                fail('CRASH20', `crash_it.psx textura ${t.texIdx} contem pixel 0x0000 opaco no slot ${c}`); crErr++; break;
              }
            }
          }
        }
      }
      if (/^cr_.*\.psx$/.test(cName)) {
        const pm = raw.readUInt32LE(4), nObj = raw.readUInt32LE(8);
        const rgb0 = nObj > 0 ? raw.readUInt32LE(12 + 32) : 0;
        if (raw.readUInt32LE(0) !== 0x00020004 || rgb0 !== pm + 8) {
          fail('CRASH20', `${cName} RGBs pointer nao relocado: rgb0=0x${rgb0.toString(16)} != ptrMeta+8=0x${(pm + 8).toString(16)}`); crErr++;
        } else {
          const cInfo = psxLib.parsePsxStructure(raw);
          // Verify all Crash-appended palettes (palId >= 0xC3000000) have ZERO opaque 0x0000 holes!
          for (const t of cInfo.textures) {
            if (!t.palInfo || (t.palId >>> 24) !== 0xC3) continue;
            for (let c = 0; c < t.palSize; c++) {
              if (raw.readUInt16LE(t.palInfo.offset + c * 2) === 0x0000) {
                fail('CRASH20', `${cName} paleta Crash 0x${t.palId.toString(16)} contem 0x0000 opaco no slot ${c}`); crErr++; break;
              }
            }
          }
          // Verify Hangar TNT Crate (0x4eb2c689) is strictly floor-grounded (Y=[-62..+63], maxXZ<=42, subdivided nF>=20)
          if (cName === 'cr_han_o.psx') {
            const miTnt = cInfo.meshHashes.indexOf(0x4eb2c689);
            if (miTnt < 0) { fail('CRASH20', 'cr_han_o.psx sem mesh TNT 0x4eb2c689'); crErr++; }
            else {
              const mo = cInfo.meshOffs[miTnt];
              const nF = raw.readUInt16LE(mo + 6);
              const x1 = raw.readInt16LE(mo + 12), x0 = raw.readInt16LE(mo + 14);
              const y1 = raw.readInt16LE(mo + 16), y0 = raw.readInt16LE(mo + 18);
              const z1 = raw.readInt16LE(mo + 20), z0 = raw.readInt16LE(mo + 22);
              if (y1 !== 63 || y0 !== -62 || x1 > 44 || x0 < -44 || z1 > 44 || z0 < -44 || nF < 20) {
                fail('CRASH20', `cr_han_o.psx TNT fora dos limites de solo/pilha: X=[${x0},${x1}] Y=[${y0},${y1}] Z=[${z0},${z1}] nF=${nF}`); crErr++;
              }
            }
          }
          // Verify Streets SF Crystal aura uses fl=0x10C3 (NEVER illegal 0x18C3!)
          if (cName === 'cr_sf.psx') {
            const miCry = cInfo.meshHashes.indexOf(0x5118a106);
            if (miCry >= 0) {
              const mo = cInfo.meshOffs[miCry], mEnd = (miCry + 1 < cInfo.numMeshes) ? cInfo.meshOffs[miCry + 1] : cInfo.ptrMeta;
              const nV = raw.readUInt16LE(mo + 2), nN = raw.readUInt16LE(mo + 4), nF = raw.readUInt16LE(mo + 6);
              let fp = mo + 28 + nV * 8 + nN * 8, bad18 = false, ok10 = false;
              for (let fi = 0; fi < nF && fp + 4 <= mEnd; fi++) {
                const fl = raw.readUInt16LE(fp), fLen = raw.readUInt16LE(fp + 2);
                if (fl === 0x18c3) bad18 = true;
                if (fl === 0x10c3) ok10 = true;
                fp += fLen;
              }
              if (bad18 || !ok10) { fail('CRASH20', `cr_sf.psx aura invalida (bad18=${bad18}, ok10=${ok10})`); crErr++; }
            }
          }
        }
      }
    }
    const r2fS = (ram) => 0x800 + (ram - 0x80010000);
    const readSlusCStr = (ram) => { const o = r2fS(ram); return slusIso.subarray(o, slusIso.indexOf(0, o)).toString('latin1'); };
    const slot20Off = r2fS(CRASH_ADDR.SkaterEntry20);
    const crName = readSlusCStr(slusIso.readUInt32LE(slot20Off + 0x20));
    const crFace = readSlusCStr(slusIso.readUInt32LE(slot20Off + 0x134));
    const crUnlk = slusIso.readUInt32LE(slot20Off + 0x13C);
    const crBio0 = readSlusCStr(slusIso.readUInt32LE(r2fS(slusIso.readUInt32LE(slot20Off + 0x138))));
    if (crName !== 'Crash B.' || crFace !== 's2face20.bmp' || crUnlk !== 1 || !crBio0.includes('Ilha Wumpa')) {
      fail('CRASH20', `g_SkaterTable[20] invalido: name="${crName}", face="${crFace}", unlk=${crUnlk}, bio0="${crBio0}"`); crErr++;
    }
    // Verify tricks.bin Slot 20 = Bob Burnquist [1] 3 specials (36 B) + Rodney Mullen Casper to 360 Flip (12 B) + ALL Bob regular tricks (330 B) + 0x0000!
    const trIso = getWadEntry(fdMod, 455, hedDisk, 11);
    const trTbl = trIso.readUInt16LE(0);
    const bobOff = trIso.readUInt16LE(trTbl + 1 * 2);
    const crOff  = trIso.readUInt16LE(trTbl + 20 * 2);
    const rodneyCasper = Buffer.from([0x03,0x00, 0x02,0x00, 0x04,0x00, 0x09,0x00, 0xe7,0x77, 0x32,0xa0]);
    const okSpecBob = trIso.subarray(crOff, crOff + 36).equals(trIso.subarray(bobOff, bobOff + 36));
    const okSpecRod = trIso.subarray(crOff + 36, crOff + 48).equals(rodneyCasper);
    const okRegBob  = trIso.subarray(crOff + 48, crOff + 378).equals(trIso.subarray(bobOff + 36, bobOff + 366));
    const okTerm    = trIso.readUInt16LE(crOff + 378) === 0;
    if (trTbl !== 0x8190 || crOff !== 0x81BC || !okSpecBob || !okSpecRod || !okRegBob || !okTerm) {
      fail('CRASH20', `tricks.bin Slot 20 divergente: tbl=0x${trTbl.toString(16)} crOff=0x${crOff.toString(16)} bobSpec=${okSpecBob} rodSpec=${okSpecRod} bobReg=${okRegBob} term=${okTerm}`); crErr++;
    }
    if (crErr === 0) {
      pass(`Crash B. (Novo Slot 20 — 0 skatistas excluidos!): 33/33 ativos em THPS1.WAD (4 .PSX <= 67.5 KB c/ Gouraud nativo fl0=8/nN=nV+nF + 4 .PSH CRASH*PART_, 8 shapes s2dCR/s2gCR, crash_it.psx <= 40.784 B + 7 cr_*.psx RGBs/TNT Y=[-62,+63]/aura 0x10C3/0 CLUT 0x0000 ok) + tricks.bin (Bob + Casper to 360 Flip [73]) 100% validos`);
    }
    if (t1Err === 0) {
      pass(`THPS1 + Egito Zero-Seek CD.WAD + THPS1.WAD @ LBA ${thps1File.lba} (${thps1Sectors} set., ${(thps1Disk.length/1048576).toFixed(2)} MB): 39 ativos in-place em CD.WAD (20 BMPs LevelSel + 9 TRGs c/ ${totalInjectedCol} coletaveis 3D + 6 sk*_o.psx + 4 PSXs) + ${thps1Man.totalFiles} em THPS1.WAD (5 THPS1 + 33 Crash B. + 5 Egito) + ${totalThps1Goals} metas + ${THPS1_GAPS.length} Gaps ao vivo 100% validos`);
    }
  }

  // =========================================================================
  // STAGE 7: LICENSE SECTORS 0..15 & CUE SHEET
  // =========================================================================
  console.log('\n[STAGE 7] Setores de Licenca NTSC-U (0..15) & CUE Sheet');
  const licR = Buffer.alloc(16 * 2352), licM = Buffer.alloc(16 * 2352);
  fs.readSync(fdRed, licR, 0, licR.length, 0);
  fs.readSync(fdMod, licM, 0, licM.length, 0);
  if (!licR.equals(licM)) fail('LICENSE', 'Setores de licenca 0..15 diferem do Redump NTSC-U!');
  else pass('16/16 setores de licenca NTSC-U (0..15) 100% identicos ao Redump');
  const cueTxt = fs.readFileSync(modCue, 'utf8');
  if (!cueTxt.includes('THPS2_MOD.bin') || !cueTxt.includes('MODE2/2352')) fail('CUE', 'THPS2_MOD.cue invalido');
  else pass('THPS2_MOD.cue valido (MODE2/2352)');

  // =========================================================================
  // STAGE 8: ALL 20 REPLACED .STR VIDEOS (FRAMES, CODING, SUBHEADER, ZERO MID-EOF)
  // =========================================================================
  console.log('\n[STAGE 8] Auditoria Completa dos 20 Videos .STR (MDEC v2, XA, Frames, Subheaders)');
  // Read g_MovieTable @ SLUS RAM 0x800C1CB4 -> file off 0x0B24B4 (23 entries * 28 bytes? Wait: check g_MovieTable frame counts!)
  // Actually let's check our known STR list & verify no mid-stream 0x80 EOF, File=1, Channel=1, valid MDEC v2 320x240!
  const strSpecs = [
    ['X/OD.STR', 167885, 8632, 0x01], ['X/BAILS02.STR', 176517, 6912, 0x04], ['X/BURNQUIS.STR', 183429, 6048, 0x04],
    ['X/CABALLER.STR', 189477, 6144, 0x04], ['X/CAMPBELL.STR', 195621, 6496, 0x04], ['X/GLIFBERG.STR', 202117, 6336, 0x04],
    ['X/HAWK.STR', 208453, 6400, 0x04], ['X/KOSTON.STR', 214853, 6336, 0x04], ['X/LASEK.STR', 221189, 6560, 0x04],
    ['X/MS.STR', 227749, 8256, 0x01], ['X/MULLEN.STR', 236005, 6496, 0x04], ['X/MUSKA.STR', 242501, 6272, 0x04],
    ['X/BAILS01.STR', 248773, 6432, 0x04], ['X/PC.STR', 255205, 11480, 0x01], ['X/REYNOLDS.STR', 266685, 6272, 0x04],
    ['X/ROWLEY.STR', 272957, 6176, 0x04], ['X/SM.STR', 279133, 12400, 0x01], ['X/STEAMER.STR', 291533, 5184, 0x04],
    ['X/THOMAS.STR', 296717, 6272, 0x04], ['INTRO.STR', 302989, 14904, 0x01]
  ];
  let strFail = 0;
  for (const [name, lba, nSec, expCoding] of strSpecs) {
    const sBuf = Buffer.alloc(nSec * 2352);
    fs.readSync(fdMod, sBuf, 0, sBuf.length, lba * 2352);
    let midEof = 0, badCoding = 0, badFnCh = 0, w = 0, h = 0, ver = 0, maxF = 0;
    for (let s = 0; s < nSec; s++) {
      const sec = sBuf.subarray(s * 2352, (s + 1) * 2352);
      const fn = sec[16], ch = sec[17], sm = sec[18], cd = sec[19];
      if (s < nSec - 1 && (sm & 0x80)) midEof++;
      if (sm & 0x04) { // XA audio sector
        if (fn !== 1 || ch !== 1) badFnCh++;
        if (cd !== expCoding) badCoding++;
      } else if (sm & 0x08) { // Video sector
        if (sec.readUInt16LE(24) === 0x0160 && sec.readUInt16LE(26) === 0x8001) {
          if (!w) { w = sec.readUInt16LE(40); h = sec.readUInt16LE(42); ver = sec.readUInt16LE(50); }
          const f = sec.readUInt32LE(32);
          if (f > maxF) maxF = f;
        }
      }
    }
    if (midEof || badCoding || badFnCh || w !== 320 || h !== 240 || ver !== 2 || maxF < 50) {
      fail('STR', `${name}: midEof=${midEof} badCoding=${badCoding} badFnCh=${badFnCh} ${w}x${h} v${ver} frames=${maxF}`);
      strFail++;
    }
  }
  if (strFail === 0) pass('20/20 videos .STR validos (320x240 MDEC v2, File=1 Ch=1, taxa XA exata, 0 EOF prematuro)');

  // =========================================================================
  // STAGE 9: COMPILED.XA FULL 105,952-SECTOR ADPCM & CHANNEL AUDIT
  // =========================================================================
  console.log('\n[STAGE 9] COMPILED.XA — Validacao Integral de 105.952 Setores ADPCM (8 Canais)');
  const CHUNK = 2048;
  const xaBuf = Buffer.alloc(CHUNK * 2352);
  let badAdpcm = 0;
  const chCnt = new Array(8).fill(0);
  for (let s = 0; s < 105952; s += CHUNK) {
    const cnt = Math.min(CHUNK, 105952 - s);
    fs.readSync(fdMod, xaBuf, 0, cnt * 2352, (38916 + s) * 2352);
    for (let k = 0; k < cnt; k++) {
      const sec = xaBuf.subarray(k * 2352, (k + 1) * 2352);
      const ch = sec[17];
      if (ch < 8) chCnt[ch]++;
      for (let sg = 0; sg < 18; sg++) {
        const g = 24 + sg * 128;
        if (sec[g]!==sec[g+4]||sec[g+1]!==sec[g+5]||sec[g+2]!==sec[g+6]||sec[g+3]!==sec[g+7]||
            sec[g+8]!==sec[g+12]||sec[g+9]!==sec[g+13]||sec[g+10]!==sec[g+14]||sec[g+11]!==sec[g+15]) {
          badAdpcm++;
          break;
        }
      }
    }
  }
  if (badAdpcm > 0 || chCnt.some(c => c !== 13244)) {
    fail('XA', `COMPILED.XA invalido: badAdpcm=${badAdpcm}, canais=${JSON.stringify(chCnt)}`);
  } else {
    pass('COMPILED.XA 100% valido (105.952 setores, 8 canais x 13.244, 0 cabecalhos ADPCM corrompidos)');
  }

  // =========================================================================
  // STAGE 10: FULL DISC SECTOR SYNC / MSF / MODE / SUBHEADER / EDC SCAN
  // =========================================================================
  const modSize = fs.statSync(modBin).size;
  const redSize = fs.statSync(redumpBin).size;
  const expModSize = redSize + (voicesSectors + thps1Sectors) * 2352;
  const totalSec = modSize / 2352;
  console.log(`\n[STAGE 10] Varredura Completa de Todos os ${totalSec.toLocaleString('pt-BR')} Setores (${(modSize/1048576).toFixed(1)} MB) de THPS2_MOD.bin`);
  if (modSize !== expModSize) fail('DISC', `Tamanho do BIN (${modSize}) != esperado Redump + VOICES.DAT + THPS1.WAD (${expModSize})`);
  const syncPat = Buffer.from([0x00,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0x00]);
  const scanBuf = Buffer.alloc(CHUNK * 2352);
  let badSync = 0, badMsf = 0, badMode = 0, badSub = 0, badEdc1 = 0, badEdc2 = 0;
  for (let s = 0; s < totalSec; s += CHUNK) {
    const cnt = Math.min(CHUNK, totalSec - s);
    fs.readSync(fdMod, scanBuf, 0, cnt * 2352, s * 2352);
    for (let k = 0; k < cnt; k++) {
      const lba = s + k;
      const sec = scanBuf.subarray(k * 2352, (k + 1) * 2352);
      if (!sec.subarray(0, 12).equals(syncPat)) badSync++;
      const absSec = lba + 150;
      if (sec[12] !== toBcd(Math.floor(absSec / 4500)) ||
          sec[13] !== toBcd(Math.floor((absSec % 4500) / 75)) ||
          sec[14] !== toBcd(absSec % 75)) badMsf++;
      if (sec[15] !== 2) badMode++;
      if (sec.readUInt32BE(16) !== sec.readUInt32BE(20)) badSub++;
      if (sec[18] & 0x20) {
        const edc = sec.readUInt32LE(2348);
        if (edc !== 0 && edc !== calcEdc(sec, 16, 2332)) badEdc2++;
      } else {
        if (sec.readUInt32LE(2072) !== calcEdc(sec, 16, 2056)) badEdc1++;
      }
    }
  }
  if (badSync || badMsf || badMode || badSub || badEdc1 || badEdc2) {
    fail('DISC', `Erros de setor: sync=${badSync} msf=${badMsf} mode=${badMode} sub=${badSub} edc1=${badEdc1} edc2=${badEdc2}`);
  } else {
    pass(`${totalSec.toLocaleString('pt-BR')}/${totalSec.toLocaleString('pt-BR')} setores 100% perfeitos (0 erros de Sync, MSF, Mode 2, Subheader ou EDC Form1/Form2)`);
  }

} finally {
  fs.closeSync(fdRed);
  fs.closeSync(fdMod);
}

console.log('\n========================================================================');
if (errors.length === 0) {
  console.log(`AUDITORIA FINAL: 100% APROVADO — 0 ERROS, ${warnings.length} AVISOS!`);
  console.log('========================================================================');
  process.exit(0);
} else {
  console.error(`AUDITORIA FALHOU: ${errors.length} ERRO(S), ${warnings.length} AVISO(S)!`);
  for (const e of errors) console.error('  -', e);
  console.log('========================================================================');
  process.exit(1);
}
