#!/usr/bin/env node
'use strict';

/**
 * One-command PS1 ISO (.BIN/.CUE) builder for THPS2 (SLUS-01066)
 * - Automatically converts all RIFF-CDXA (.XA / .STR) files to raw 2336B sectors in build/staging_raw/
 *   (skips already up-to-date conversions via mtime/size cache for fast rebuilds in seconds!)
 * - Generates tools/thps2_build.xml
 * - Runs mkpsxiso.exe to produce build/THPS2_MOD.bin + build/THPS2_MOD.cue
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { detectFormat, riffOr2352ToRaw2336, generateMkpsxisoXml } = require('./psx_media');

const rootDir = path.resolve(__dirname, '..');
const stagingDir = path.join(rootDir, 'build', 'staging_raw');
const xmlPath = path.join(rootDir, 'tools', 'thps2_build.xml');
const outBin = path.join(rootDir, 'build', 'THPS2_MOD.bin');
const outCue = path.join(rootDir, 'build', 'THPS2_MOD.cue');
const mkpsxisoExe = path.join(rootDir, 'tools', 'bin', 'mkpsxiso', 'mkpsxiso-2.30-win64', 'mkpsxiso.exe');

if (!fs.existsSync(mkpsxisoExe)) {
  console.error('mkpsxiso.exe nao encontrado em:', mkpsxisoExe);
  process.exit(1);
}

const forceAll = process.argv.includes('--force');
const mixedFiles = [
  'COMPILED.XA',
  'ATVILOGO.STR',
  'INTRO.STR',
  'LOGO.STR',
  ...fs.readdirSync(path.join(rootDir, 'X')).filter(f => /\.str$/i.test(f)).sort().map(f => path.join('X', f))
];

console.log(`=== 1. Preparando setores raw 2336B em ${stagingDir} ===`);
let converted = 0, cached = 0;
for (const rel of mixedFiles) {
  const src = path.join(rootDir, rel);
  const dst = path.join(stagingDir, rel);
  const srcInfo = detectFormat(src);
  const expectedRawSize = srcInfo.sectors * 2336;
  const srcMtime = fs.statSync(src).mtimeMs;

  if (!forceAll && fs.existsSync(dst)) {
    const dstStat = fs.statSync(dst);
    if (dstStat.size === expectedRawSize && dstStat.mtimeMs >= srcMtime) {
      cached++;
      continue;
    }
  }
  const secs = riffOr2352ToRaw2336(src, dst);
  console.log(`  [conv] ${rel.padEnd(18)} -> ${secs} setores 2336B (${(secs * 2336 / 1048576).toFixed(2)} MB)`);
  converted++;
}
console.log(`Concluido: ${converted} convertidos, ${cached} reaproveitados do cache.\n`);

console.log(`=== 2. Gerando XML do mkpsxiso ===`);
generateMkpsxisoXml(rootDir, stagingDir, xmlPath, outBin, outCue);
console.log(`  XML: ${xmlPath}\n`);

console.log(`=== 3. Compilando ISO PS1 (.BIN / .CUE) com mkpsxiso ===`);
const t0 = Date.now();
const res = spawnSync(mkpsxisoExe, ['-y', xmlPath], { stdio: 'inherit' });
if (res.status !== 0) {
  console.error(`mkpsxiso falhou com codigo ${res.status}`);
  process.exit(res.status || 1);
}
const dt = ((Date.now() - t0) / 1000).toFixed(2);
const binSz = fs.statSync(outBin).size;
console.log(`\n=== SUCESSO EM ${dt}s ===`);
console.log(`  BIN: ${outBin} (${(binSz / 1048576).toFixed(2)} MB, ${binSz / 2352} setores)`);
console.log(`  CUE: ${outCue}`);
