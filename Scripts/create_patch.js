#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 Legal Delta Patch (.xdelta) Generator & Round-Trip Verifier
 *
 * Compares the clean Redump NTSC-U (SLUS-01066) original BIN in bin_cue_originais_do_jogo/
 * against build/THPS2_MOD.bin using xdelta3 (1 GB source window, max compression -9),
 * then verifies 100% bit-for-bit round-trip reconstruction via SHA-256!
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const origDir = path.join(rootDir, 'bin_cue_originais_do_jogo');
const modBin = path.join(rootDir, 'build', 'THPS2_MOD.bin');
const patchOut = path.join(rootDir, 'build', 'THPS2_MOD_NTSC-U.xdelta');
const manifestOut = path.join(rootDir, 'build', 'patch_manifest.json');
const xdeltaExe = path.join(rootDir, 'tools', 'bin', 'xdelta3', 'xdelta3-3.2.2-windows-x86_64', 'xdelta3.exe');

if (!fs.existsSync(xdeltaExe)) {
  console.error('xdelta3.exe nao encontrado em:', xdeltaExe);
  process.exit(1);
}
if (!fs.existsSync(origDir)) {
  console.error('Pasta bin_cue_originais_do_jogo/ nao encontrada!');
  process.exit(1);
}
const EXPECTED_ORIG_SIZE = 748037136; // Exact Redump NTSC-U SLUS-01066 (318,043 sectors)
const origBins = fs.readdirSync(origDir).filter(f => /\.bin$/i.test(f));
if (origBins.length === 0) {
  console.error('Nenhum arquivo .bin original encontrado em:', origDir);
  process.exit(1);
}
const matchedBin =
  origBins.find(f => fs.statSync(path.join(origDir, f)).size === EXPECTED_ORIG_SIZE) ||
  origBins.find(f => /pro skater 2/i.test(f));
if (!matchedBin) {
  console.error(`THPS2 NTSC-U Redump BIN (${EXPECTED_ORIG_SIZE} B) nao encontrado em ${origDir}! Encontrados:`, origBins);
  process.exit(1);
}
const origBin = path.join(origDir, matchedBin);
if (fs.statSync(origBin).size !== EXPECTED_ORIG_SIZE) {
  console.error(`Tamanho inesperado para ${matchedBin}: ${fs.statSync(origBin).size} B (esperado ${EXPECTED_ORIG_SIZE} B Redump SLUS-01066)!`);
  process.exit(1);
}
if (!fs.existsSync(modBin)) {
  console.error('build/THPS2_MOD.bin nao encontrado! Rode primeiro: node tools/build_iso.js');
  process.exit(1);
}

function hashFile(filePath, alg) {
  const h = crypto.createHash(alg);
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(4 * 1024 * 1024);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
    h.update(n === buf.length ? buf : buf.subarray(0, n));
  }
  fs.closeSync(fd);
  return h.digest('hex').toUpperCase();
}

const skipVerify = process.argv.includes('--no-verify');

console.log('=== 1. Verificando BIN Original vs Modificado ===');
const origSize = fs.statSync(origBin).size;
const modSize = fs.statSync(modBin).size;
const origMd5 = hashFile(origBin, 'md5');
const origSha1 = hashFile(origBin, 'sha1');
const modSha256 = hashFile(modBin, 'sha256');
console.log(`  Original : ${path.basename(origBin)} (${origSize} B / ${origSize / 2352} setores)`);
console.log(`             MD5  = ${origMd5}`);
console.log(`             SHA1 = ${origSha1}`);
console.log(`  Mod      : ${path.basename(modBin)} (${modSize} B / ${modSize / 2352} setores)`);
console.log(`             SHA256 = ${modSha256}`);

console.log('\n=== 2. Gerando patch delta xdelta3 (-S none, janela 128MB — ultra-rapido para aplicar!) ===');
const t0 = Date.now();
const rEnc = spawnSync(xdeltaExe, [
  '-e', '-3', '-S', 'none', '-f',
  '-B', '134217728',
  '-s', origBin,
  modBin,
  patchOut
], { stdio: 'inherit' });
if (rEnc.status !== 0) {
  console.error(`xdelta3 encode falhou com codigo ${rEnc.status}`);
  process.exit(rEnc.status || 1);
}
const dtEnc = ((Date.now() - t0) / 1000).toFixed(2);
const patchSize = fs.statSync(patchOut).size;
const patchSha256 = hashFile(patchOut, 'sha256');
console.log(`  Patch gerado em ${dtEnc}s: ${patchOut}`);
console.log(`  Tamanho : ${(patchSize / 1048576).toFixed(2)} MB (${patchSize} bytes)`);
console.log(`  SHA256  : ${patchSha256}`);

let verified = false;
if (!skipVerify) {
  console.log('\n=== 3. Validacao Round-Trip (Aplicando patch e conferindo SHA-256) ===');
  const tmpVerify = path.join(rootDir, 'build', '_verify_patched.bin');
  const t1 = Date.now();
  const rDec = spawnSync(xdeltaExe, ['-d', '-f', '-s', origBin, patchOut, tmpVerify], { stdio: 'inherit' });
  if (rDec.status !== 0) {
    try { fs.unlinkSync(tmpVerify); } catch {}
    console.error(`xdelta3 decode falhou com codigo ${rDec.status}`);
    process.exit(rDec.status || 1);
  }
  const verifySha256 = hashFile(tmpVerify, 'sha256');
  try { fs.unlinkSync(tmpVerify); } catch {}
  const dtDec = ((Date.now() - t1) / 1000).toFixed(2);
  if (verifySha256 !== modSha256) {
    console.error(`FALHA NA VERIFICACAO! Esperado=${modSha256}, Obtido=${verifySha256}`);
    process.exit(1);
  }
  verified = true;
  console.log(`  [OK] Patch reconstruiu o BIN 100% IDENTICO (SHA-256 match) em ${dtDec}s!`);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  targetGame: "Tony Hawk's Pro Skater 2 (USA) [SLUS-01066]",
  originalBin: {
    file: path.basename(origBin),
    sizeBytes: origSize,
    sectors: origSize / 2352,
    md5: origMd5,
    sha1: origSha1,
  },
  patchedBin: {
    file: path.basename(modBin),
    sizeBytes: modSize,
    sectors: modSize / 2352,
    sha256: modSha256,
  },
  patch: {
    file: path.basename(patchOut),
    sizeBytes: patchSize,
    sizeMB: Number((patchSize / 1048576).toFixed(2)),
    sha256: patchSha256,
    roundTripVerified: verified,
  }
};
fs.writeFileSync(manifestOut, JSON.stringify(manifest, null, 2));
console.log(`\nManifesto salvo em: ${manifestOut}`);
