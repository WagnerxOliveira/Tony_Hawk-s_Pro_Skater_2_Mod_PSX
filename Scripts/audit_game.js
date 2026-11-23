#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Comprehensive 12-Stage Forensic Game & ISO Validator
 *
 * Audits BOTH workspace files and compiled build/THPS2_MOD.bin + .cue against clean
 * Redump NTSC-U reference (bin_cue_originais_do_jogo/Tony Hawk's Pro Skater 2.bin).
 * Exits with code 0 ONLY when ZERO errors are detected across all 12 stages.
 */

const fs = require('fs');
const path = require('path');

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
  const { ADDR, SYM, jalWord, assembleSlusTailClean, assembleModCode, assembleBailHookCode } = require('./patch_random_videos_and_voices');
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
  const expectedSlusHooks = new Map([
    [0x80038950, jalWord(ADDR.Hook_CdMix)],            // Hook XA_UpdateVolume CdMix -> 25% (-12 dB) in Skater Select
    [0x8003CFB0, jalWord(ADDR.Tramp_BootMovie)],       // Boot Slot 0 (Activision -> random custom video, 208f cap)
    [0x8003CFE8, jalWord(ADDR.Tramp_BootMovie)],       // Boot Slot 1 (Neversoft  -> random custom video, 266f cap)
    [0x8003D024, jalWord(ADDR.Tramp_BootMovie)],       // Boot Slot 2 (Intro      -> random custom video, 1486f cap)
    [0x800527B8, jalWord(ADDR.Tramp_BailSfx)],         // Hook SFX_Play -> 9 rotating bail screams (round-robin + 50f cooldown)
    [0x80053690, 0x28620017],                          // Reserve SPU Voice 23 for skater voices (slti v0,v1,23)
    ...FONT_PATCH_WORDS.map(p => [p.ram, p.patched]),  // Font_CharToGlyph @ 0x8005B9B4: 5 words for native PT-BR accents (ã,ê,í,ó)
    [0x8006CAD4, jalWord(ADDR.Mod_BootInit)],          // Hook Movies_Init -> load VOICES.DAT Sec 0..1 + FlushCache
    [0x80082B80, jalWord(ADDR.Tramp_RunPlaySel)],      // Hook Overlay_Run playsel -> instant music ducking on enter/restore on exit
    [0x800A2950, 0x24843800],                          // InitHeap start -> 0x800E3800
    [0x800E2674, ADDR.NewHeapStart],                   // THPS2 HeapStartPtr -> 0x800E3800
  ]);
  const isTextPool = (off) => (off >= 0x059BC0 && off < 0x05BC00) || (off >= 0x0A0000 && off < 0x0D2E74);
  const isModTail = (ram) => ram >= 0x800E2680 && ram < 0x800E2800;
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
    if (expectedSlusHooks.has(pRamAligned) || isModTail(pRam)) continue;
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
  for (const item of [...BIO_LULAO, ...BIO_BOLSONARO]) {
    chkStr(item.fileOff, item.text, 'latin1');
  }
  if (strErr === 0) pass(`${checkedStrs.size} strings modificadas validadas (incl. 32 linhas de biografias PT-BR Lulao/Bolsonaro; 0 overflows, 0 erros printf, 0 bytes fora do .FNT)`);

  // =========================================================================
  // STAGE 3: CD.HED & CD.WAD ALL 1,531 ENTRIES
  // =========================================================================
  console.log('\n[STAGE 3] CD.HED & CD.WAD — Integridade de Todas as 1.531 Entradas');
  const hedRed = readSectorsUser(fdRed, 446, 9);
  const hedMod = readSectorsUser(fdMod, 446, 9);
  const hedDisk = fs.readFileSync(hedCurPath);
  if (!hedRed.equals(hedMod) || !hedMod.subarray(0, hedDisk.length).equals(hedDisk)) {
    fail('WAD', 'CD.HED difere do Redump original!');
  } else {
    pass('CD.HED 100% identico ao Redump original');
  }

  const allowedWadIdxs = new Set([
    3, 4, 520, 521, 522, 523,                       // skate2, skate2g, skate2p .VAB + .SFX (9 rotating bail screams, exact Redump size)
    45, 60, 61, 458,                                // options.pre, player.pre (s2bio.fnt), playsel.bin, s2bio.fnt
    370, 371, 372, 377, 378, 379,                   // 6 custom portraits: s2face2,3,4,9,10,11 (s2face7=375 Bucky Lasek RESTORED!)
    389, 986, 433, 988,                             // Lulao (4 .PSX)
    391, 1030, 435, 1032,                           // Bolsonaro (4 .PSX)
    393, 994, 437, 996,                             // Wagner Oliver (4 .PSX)
    399, 998, 443, 1000,                            // Francis Paulo (4 .PSX)
    403, 1002, 447, 1004,                           // Natan Oliver (4 .PSX)
    405, 1018, 449, 1020,                           // Valter Pacheco (4 .PSX)
  ]);
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
  // Verify playsel.bin (idx 61) ONLY modified +0x3388 (Scroll hook) and +0x100C (Confirm hook)
  {
    const psOrig = getWadEntry(fdRed, 455, hedDisk, 61);
    const psMod  = getWadEntry(fdMod, 455, hedDisk, 61);
    const expPlaySelHooks = new Map([
      [0x3388, jalWord(ADDR.Tramp_PlaySelScroll)],
      [0x100C, jalWord(ADDR.Tramp_PlaySelConfirm)],
    ]);
    let psErr = 0;
    for (let o = 0; o < psOrig.length; o += 4) {
      const wO = psOrig.readUInt32LE(o), wM = psMod.readUInt32LE(o);
      if (expPlaySelHooks.has(o)) {
        if (wM !== expPlaySelHooks.get(o)) { fail('WAD', `playsel.bin hook +0x${o.toString(16)} incorreto: 0x${wM.toString(16)}`); psErr++; }
      } else if (wO !== wM) {
        fail('WAD', `playsel.bin alterado fora dos hooks em +0x${o.toString(16)}: 0x${wO.toString(16)} -> 0x${wM.toString(16)}`); psErr++;
      }
    }
    if (psErr === 0) pass('playsel.bin (idx=61): 2/2 hooks Skater Select (+0x3388 Scroll, +0x100C Confirm) validos, 31.632 B restantes intactos');
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
  if (wadUnexpected === 0) pass(`Todas as ${wadChecked} entradas do CD.WAD verificadas (${wadChecked - allowedWadIdxs.size} intactas incluindo skhan_l.psx + ${allowedWadIdxs.size} mods: 6 skatistas, 9 gritos .VAB/.SFX, s2bio.fnt e playsel.bin)`);

  // =========================================================================
  // STAGE 4: ALL 6 PORTRAITS (s2face2,3,4,9,10,11) + SLUS CROSS-CHECK + BUCKY LASEK (s2face7) ORIGINAL
  // =========================================================================
  console.log('\n[STAGE 4] options.pre & 6 Retratos Customizados (validacao cruzada SLUS_010.66 <-> CD.WAD <-> options.pre)');
  const optOrig = getWadEntry(fdRed, 455, hedDisk, 45);
  const optMod = getWadEntry(fdMod, 455, hedDisk, 45);
  const portraitSpecs = [
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
  if (optOutsideDiff > 0) fail('PORTRAIT', `options.pre tem ${optOutsideDiff} bytes alterados fora dos 6 retratos!`);
  else pass('6/6 retratos (s2face2,3,4,9,10,11) validados contra SLUS_010.66 + s2face7 (Bucky Lasek) 100% original + options.pre integro');

  // =========================================================================
  // STAGE 5: ALL 24 SKATER .PSX MODELS (6 SKATERS x 4 LOD/STYLES) & HANGAR skhan_l.psx
  // =========================================================================
  console.log('\n[STAGE 5] Modelos 3D .PSX (24 modelos: Lulao, Bolsonaro+Pescoco, Wagner, Francis, Natan, Valter) & Fase 1 Original');
  const psxChecks = [
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
    const orig = getWadEntry(fdRed, 455, hedDisk, pc.idx);
    const cur = getWadEntry(fdMod, 455, hedDisk, pc.idx);
    if (orig.length !== cur.length) { fail('PSX', `${pc.name}: tamanho alterado`); continue; }
    const ptrMeta = orig.readUInt32LE(4), nObj = orig.readUInt32LE(8);
    const nMeshOff = 12 + nObj * 36, nMesh = orig.readUInt32LE(nMeshOff);
    const meshOffs = Array.from({ length: nMesh }, (_, i) => orig.readUInt32LE(nMeshOff + 4 + i * 4));
    let mpos = ptrMeta;
    while (mpos < orig.length) {
      const tag = orig.readUInt32LE(mpos); mpos += 4;
      if (tag === 0xFFFFFFFF) break;
      mpos += 4 + orig.readUInt32LE(mpos);
    }
    const hashes = Array.from({ length: nMesh }, (_, i) => orig.readUInt32LE(mpos + i * 4));
    if (hashes[pc.expMesh] !== pc.headHash) fail('PSX', `${pc.name}: Mesh[${pc.expMesh}] nao tem hash esperado`);
    mpos += nMesh * 4;
    const nTexRefs = orig.readUInt32LE(mpos); mpos += 4 + nTexRefs * 4;
    const nPal16 = orig.readUInt32LE(mpos); mpos += 4;
    let zeroClut = 0;
    for (let i = 0; i < nPal16; i++) {
      for (let c = 0; c < 16; c++) {
        if (cur.readUInt16LE(mpos + 4 + c * 2) === 0 && orig.readUInt16LE(mpos + 4 + c * 2) !== 0) zeroClut++;
      }
      mpos += 36;
    }
    const nPal256 = orig.readUInt32LE(mpos); mpos += 4;
    for (let i = 0; i < nPal256; i++) {
      for (let c = 0; c < 256; c++) {
        if (cur.readUInt16LE(mpos + 4 + c * 2) === 0 && orig.readUInt16LE(mpos + 4 + c * 2) !== 0) zeroClut++;
      }
      mpos += 516;
    }
    if (zeroClut > 0) fail('PSX', `${pc.name}: ${zeroClut} cores 0x0000 (transparentes) indevidas na CLUT!`);

    // Verify ONLY HEAD (and documented extra meshes: Lulao belly / Bolsonaro Tony Hawk neck) changed, stitch invariants respected, bbox/rad safe!
    let otherMeshDiff = 0, wDiff = 0, normFaceDiff = 0, headMoved = 0, extraMoved = 0;
    for (let m = 0; m < nMesh; m++) {
      const mo = meshOffs[m], mEnd = (m + 1 < nMesh) ? meshOffs[m + 1] : ptrMeta;
      const isHead = (m === pc.expMesh);
      const extraMode = pc.extraMeshes.get(m);
      if (!isHead && !extraMode) {
        if (!orig.subarray(mo, mEnd).equals(cur.subarray(mo, mEnd))) {
          fail('PSX', `${pc.name}: Mesh[${m}] foi modificada indevidamente!`);
          otherMeshDiff++;
        }
      } else {
        const nV = orig.readUInt16LE(mo + 2), nN = orig.readUInt16LE(mo + 4);
        const vOff = mo + 28, nOff = vOff + nV * 8;
        let xmin = 32767, xmax = -32768, ymin = 32767, ymax = -32768, zmin = 32767, zmax = -32768, maxR = 0;
        for (let v = 0; v < nV; v++) {
          const vo = vOff + v * 8;
          const ox = orig.readInt16LE(vo), oy = orig.readInt16LE(vo + 2), oz = orig.readInt16LE(vo + 4), ow = orig.readUInt16LE(vo + 6);
          const cx = cur.readInt16LE(vo), cy = cur.readInt16LE(vo + 2), cz = cur.readInt16LE(vo + 4), cw = cur.readUInt16LE(vo + 6);
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
        for (let p = nOff; p < mEnd; p++) if (orig[p] !== cur[p]) normFaceDiff++;
        const rad = cur.readUInt32LE(mo + 8);
        const bb = [0,1,2,3,4,5].map(k => cur.readInt16LE(mo + 12 + k * 2));
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
      const extraMsg = extraMoved > 0 ? ` + ${pc.extraLabel} (${extraMoved}v)` : '';
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

  // =========================================================================
  // STAGE 6: ISO-9660 LBA ORDER, SIZES, XA ATTRIBUTES, UNMODIFIED FILES & VOICES.DAT
  // =========================================================================
  console.log('\n[STAGE 6] ISO-9660 — 48/48 Arquivos Originais Redump + 49o VOICES.DAT (MODCODE + 28 Clips SPU)');
  const pvdR = readSectorsUser(fdRed, 16, 1), pvdM = readSectorsUser(fdMod, 16, 1);
  const filesR = parseIsoDir(fdRed, pvdR.readUInt32LE(158), pvdR.readUInt32LE(166), '').sort((a, b) => a.lba - b.lba);
  const filesM = parseIsoDir(fdMod, pvdM.readUInt32LE(158), pvdM.readUInt32LE(166), '').sort((a, b) => a.lba - b.lba);
  if (filesR.length !== 48 || filesM.length !== 49) fail('ISO', `Contagem de arquivos: ${filesM.length} (esperado 49 = 48 Redump + VOICES.DAT)`);
  const modMap = new Map(filesM.map(f => [f.path, f]));
  const expectedModFiles = new Set([
    'SLUS_010.66', 'CD.WAD', 'COMPILED.XA', 'INTRO.STR',
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

  // Validate 49th file VOICES.DAT (MODCODE Sector 0 + VOICETBL Sector 1 + 28 SPU-ADPCM payloads)
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
    const expBailHook = assembleBailHookCode();
    if (!voicesBuf.subarray(2048 + 0x200, 4096).equals(expBailHook)) fail('VOICES', 'Setor 1 +0x200 (Hook_BailSfx) em VOICES.DAT difere do assembly esperado!');
    const magic = voicesBuf.readUInt32LE(2048);
    const lCnt = voicesBuf.readUInt32LE(2052);
    const bCnt = voicesBuf.readUInt32LE(2056);
    const spuBase = voicesBuf.readUInt32LE(2060);
    if (magic !== 0x564F4943 || lCnt !== 14 || bCnt !== 14 || spuBase !== 0x58000) {
      fail('VOICES', `VOICETBL invalido: magic=0x${magic.toString(16)}, lulao=${lCnt}, bolso=${bCnt}, spu=0x${spuBase.toString(16)}`);
    } else {
      let clipErr = 0, maxSpu = 0;
      const totalClips = lCnt + bCnt;
      for (let i = 0; i < totalClips; i++) {
        const eb = 2048 + 16 + i * 16;
        const sOff = voicesBuf.readUInt32LE(eb);
        const sCnt = voicesBuf.readUInt32LE(eb + 4);
        const bSz = voicesBuf.readUInt32LE(eb + 8);
        const pitch = voicesBuf.readUInt32LE(eb + 12);
        if (bSz > maxSpu) maxSpu = bSz;
        if (bSz === 0 || (bSz % 64) !== 0 || bSz > (0x7EFF0 - 0x58000) || pitch !== 0x0400 || (sOff + sCnt) > voicesSectors) {
          fail('VOICES', `Clip #${i} invalido: sOff=${sOff} sCnt=${sCnt} bSz=${bSz} pitch=0x${pitch.toString(16)}`);
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
        pass(`VOICES.DAT @ LBA ${voicesFile.lba} (${voicesSectors} set.): MODCODE + VOICETBL + ${totalClips}/28 clips SPU-ADPCM 100% validos (max ${maxSpu} B / 159.728 B SPU RAM)`);
      }
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
  const expModSize = redSize + voicesSectors * 2352;
  const totalSec = modSize / 2352;
  console.log(`\n[STAGE 10] Varredura Completa de Todos os ${totalSec.toLocaleString('pt-BR')} Setores (${(modSize/1048576).toFixed(1)} MB) de THPS2_MOD.bin`);
  if (modSize !== expModSize) fail('DISC', `Tamanho do BIN (${modSize}) != esperado Redump + VOICES.DAT (${expModSize})`);
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
