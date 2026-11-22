#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Surgical Binary & Media Bug Fixer
 *
 * Fixes ALL verified game-breaking binary, 3D model, font, and STR media defects:
 *  1. SLUS_010.66 — Reverts 8 blindly corrupted MIPS R3000A instructions (78 00 -> 2C 01, 120 -> 300):
 *       - 0x80016848 (off 0x007048): Vector3_Scale collision raycast probe (2.5x -> 1.0x)
 *       - 0x80018EE0 (off 0x0096E0): Skater state 5 pos.x displacement (2.5x -> 1.0x)
 *       - 0x80018EE4 (off 0x0096E4): Skater state 5 pos.y displacement (2.5x -> 1.0x)
 *       - 0x80018F54 (off 0x009754): Skater state 6 pos.z displacement (2.5x -> 1.0x)
 *       - 0x8006237C (off 0x052B7C): SFX_Play sound ID (300 -> 120)
 *       - 0x8006BC2C (off 0x05C42C): g_PadManager (0x800C08FC) input hold threshold (300 -> 120 frames)
 *       - 0x8007E880 (off 0x06F080): Font_SetScale UI font scale (300 -> 120)
 *       - 0x8008238C (off 0x072B8C): Mem_New C++ object allocation size (300 -> 120 bytes)
 *  2. SLUS_010.66 — Restores corrupted PS-X EXE header NTSC-U region/license string (+0x4C..+0x82)
 *  3. SLUS_010.66 — Replaces unmapped Latin-1 0xE3 ('ã') at +0x0C8732 ("Joao Paulo") for THPS2 .FNT
 *  4. CD.WAD (Lulao 4 .PSX models) — Re-runs mod_skater_lulao.js using hash-based HEAD resolution so
 *     cab_L.psx Mesh[12] (limb) bbox is restored clean and Mesh[15] (true low-LOD HEAD) is sculpted,
 *     with safe bounding sphere radius & bounding box on all 4 models.
 *  5. All 20 .STR videos — Clears stray mid-stream 0x80 EOF submode flag injected by psxavenc on
 *     non-final sectors (0xE4 -> 0x64) to match native Neversoft STR stream subheaders.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const slusPath = path.join(rootDir, 'SLUS_010.66');
const backupDir = path.join(rootDir, 'originals_backup');

// Form 2 EDC calculator (polynomial 0xD8018001)
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

// =========================================================================
// 1. FIX SLUS_010.66 (8 MIPS opcodes + PS-X EXE NTSC-U header + 0xE3 char)
// =========================================================================
console.log('=== 1. Corrigindo SLUS_010.66 (8 instrucoes MIPS + header NTSC-U + char 0xE3) ===');
fs.mkdirSync(backupDir, { recursive: true });
const slusBak = path.join(backupDir, 'SLUS_010.66.pre_bugfix');
if (!fs.existsSync(slusBak)) {
  fs.copyFileSync(slusPath, slusBak);
  console.log(`  [backup] SLUS_010.66 -> originals_backup\\SLUS_010.66.pre_bugfix`);
}

const slus = fs.readFileSync(slusPath);
if (slus.length !== 864256 || slus.subarray(0, 8).toString('ascii') !== 'PS-X EXE') {
  throw new Error(`SLUS_010.66 invalido (tamanho=${slus.length})`);
}

const mipsFixes = [
  { ram: 0x80016848, off: 0x007048, orig: 0x24020078, bad: 0x2402012C, desc: 'Vector3_Scale collision raycast (120)' },
  { ram: 0x80018EE0, off: 0x0096E0, orig: 0x24040078, bad: 0x2404012C, desc: 'Skater state 5 pos.x FixedPoint_Mul12 (120)' },
  { ram: 0x80018EE4, off: 0x0096E4, orig: 0x24040078, bad: 0x2404012C, desc: 'Skater state 5 pos.y FixedPoint_Mul12 (120)' },
  { ram: 0x80018F54, off: 0x009754, orig: 0x24040078, bad: 0x2404012C, desc: 'Skater state 6 pos.z FixedPoint_Mul12 (120)' },
  { ram: 0x8006237C, off: 0x052B7C, orig: 0x24040078, bad: 0x2404012C, desc: 'SFX_Play sound ID (120)' },
  { ram: 0x8006BC2C, off: 0x05C42C, orig: 0x24040078, bad: 0x2404012C, desc: 'g_PadManager input hold counter (120 frames)' },
  { ram: 0x8007E880, off: 0x06F080, orig: 0x24040078, bad: 0x2404012C, desc: 'Font_SetScale UI text scale (120)' },
  { ram: 0x8008238C, off: 0x072B8C, orig: 0x24040078, bad: 0x2404012C, desc: 'Mem_New C++ object alloc size (120 bytes)' },
];

let slusChanged = 0;
for (const f of mipsFixes) {
  const cur = slus.readUInt32LE(f.off);
  if (cur === f.bad) {
    slus.writeUInt32LE(f.orig, f.off);
    console.log(`  [FIXED] 0x${f.ram.toString(16).toUpperCase()}: 0x${cur.toString(16)} -> 0x${f.orig.toString(16)} (${f.desc})`);
    slusChanged++;
  } else if (cur === f.orig) {
    console.log(`  [OK]    0x${f.ram.toString(16).toUpperCase()}: ja restaurado (0x${f.orig.toString(16)})`);
  } else {
    throw new Error(`Valor inesperado em 0x${f.ram.toString(16)}: 0x${cur.toString(16)}`);
  }
}

// Restore PS-X EXE header license string (+0x4C..+0x82, exact 55 bytes)
const expectedLic = Buffer.from('Sony Computer Entertainment Inc. for North America area', 'ascii');
const curLic = slus.subarray(0x4C, 0x4C + expectedLic.length);
if (!curLic.equals(expectedLic)) {
  expectedLic.copy(slus, 0x4C);
  console.log(`  [FIXED] Header +0x4C: restaurado "${expectedLic.toString('ascii')}"`);
  slusChanged++;
} else {
  console.log(`  [OK]    Header +0x4C: assinatura NTSC-U ja correta`);
}

// Fix unmapped 0xE3 ('ã') at 0x0C8732 ("Joao Paulo")
if (slus[0x0C8732] === 0xE3) {
  slus[0x0C8732] = 0x61; // 'a'
  console.log(`  [FIXED] 0x800D7F30 (off 0x0C8730): "Jo\\xE3o Paulo" -> "Joao Paulo" (ASCII mapeado na fonte .FNT)`);
  slusChanged++;
} else {
  console.log(`  [OK]    0x800D7F30: "${slus.subarray(0x0C8730, 0x0C873A).toString('ascii')}"`);
}

if (slusChanged > 0) {
  fs.writeFileSync(slusPath, slus);
  console.log(`  SLUS_010.66 salvo (${slusChanged} correcoes aplicadas).`);
}

// =========================================================================
// 2. RE-APPLY FIXED mod_skater_lulao.js (restores cab_L Mesh[12], sculpts Mesh[15])
// =========================================================================
console.log('\n=== 2. Reaplicando mod_skater_lulao.js corrigido (cab_L Mesh[15] + bbox/rad seguros) ===');
const lulaoRes = spawnSync(process.execPath, [path.join(__dirname, 'mod_skater_lulao.js')], { stdio: 'inherit' });
if (lulaoRes.status !== 0) {
  throw new Error(`mod_skater_lulao.js falhou com status ${lulaoRes.status}`);
}

// =========================================================================
// 3. FIX PREMATURE 0x80 EOF SUBMODE FLAG IN ALL 20 REPLACED .STR VIDEOS
// =========================================================================
console.log('\n=== 3. Limpando flag EOF prematura (0x80) em subheaders dos 20 videos .STR ===');
const strFiles = [
  'INTRO.STR',
  ...fs.readdirSync(path.join(rootDir, 'X')).filter(f => /\.str$/i.test(f)).sort().map(f => path.join('X', f)),
];

let totalSectorsFixed = 0;
let totalFilesFixed = 0;
for (const rel of strFiles) {
  const full = path.join(rootDir, rel);
  const buf = fs.readFileSync(full);
  const isRiff = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'CDXA';
  if (!isRiff) continue;
  const nSec = Math.floor((buf.length - 44) / 2352);
  let fixedInFile = 0;
  for (let s = 0; s < nSec - 1; s++) {
    const secOff = 44 + s * 2352;
    const sm = buf[secOff + 18];
    if (sm & 0x80) {
      const newSm = sm & 0x7F;
      buf[secOff + 18] = newSm;
      buf[secOff + 22] = newSm;
      // Recompute Form 2 EDC if non-zero (bytes 16..2347 -> uint32 at 2348)
      if ((newSm & 0x20) && buf.readUInt32LE(secOff + 2348) !== 0) {
        buf.writeUInt32LE(calcEdc(buf, secOff + 16, 2332), secOff + 2348);
      }
      fixedInFile++;
    }
  }
  if (fixedInFile > 0) {
    fs.writeFileSync(full, buf);
    // Remove stale raw cache so build_iso.js re-stages the fixed STR
    const cachedRaw = path.join(rootDir, 'build', 'staging_raw', rel);
    if (fs.existsSync(cachedRaw)) fs.unlinkSync(cachedRaw);
    console.log(`  [FIXED] ${rel.padEnd(18)}: ${fixedInFile} setor(es) com EOF prematuro limpo(s) (0xE4 -> 0x64)`);
    totalSectorsFixed += fixedInFile;
    totalFilesFixed++;
  }
}
console.log(`  Resumo .STR: ${totalFilesFixed} arquivo(s) corrigido(s), ${totalSectorsFixed} setor(es) limpo(s).`);
console.log('\n=== TODAS AS CORRECOES BINARIAS E DE MIDIA APLICADAS COM SUCESSO! ===');
