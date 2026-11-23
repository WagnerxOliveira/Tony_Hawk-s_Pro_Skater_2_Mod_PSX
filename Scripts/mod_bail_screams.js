#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) — 9 Rotating Bail Screams (.VAB / .SFX In-Place Builder)
 *
 * Extracts 9 verified human screams from videos/ (6 dry solo screams from
 * "Loko em casa sozinho.mp4" + 3 fight/pain screams from "A-melhor-Luta-de-2016_720p.mp4"),
 * applies surgical DSP cleanup + peak normalization, encodes to Sony PS1 SPU-ADPCM 4-bit
 * at 7796 Hz (exact MIDI center=90, shift=0, note=60 -> 44100 / 2^(30/12) = 7795.85 Hz),
 * and injects them IN-PLACE into Program 2 of ALL 3 global skater soundbanks:
 *   - skate2.vab  (WAD[3],   159,888 B) + skate2.sfx  (WAD[4],   804 B)  [1P Male]
 *   - skate2g.vab (WAD[520], 160,800 B) + skate2g.sfx (WAD[521], 804 B)  [1P Female]
 *   - skate2p.vab (WAD[522], 160,576 B) + skate2p.sfx (WAD[523], 868 B)  [2P Splitscreen]
 *
 * Hardware Safety Invariant:
 *   - Max level VAB WAD[538] (360,784 B) + skate2g.vab (156,160 B) = 516,944 / 520,176 B SPU RAM.
 *   - All 9 screams + Sony terminators = 26,512 B <= 26,784 B (original Program 2 budget of skate2.vab).
 *   - Every .VAB and .SFX keeps its EXACT original Redump byte size -> 0 extra SPU RAM, CD.HED 100% unchanged!
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VID_DIR = path.join(ROOT, 'videos');
const CACHE_DIR = path.join(ROOT, 'build', '_bail_cache');
const ORIG_HED_PATH = path.join(ROOT, 'originals_backup', 'CD.HED');
const ORIG_WAD_PATH = path.join(ROOT, 'originals_backup', 'CD.WAD');
const CUR_HED_PATH = path.join(ROOT, 'CD.HED');
const CUR_WAD_PATH = path.join(ROOT, 'CD.WAD');

const FFMPEG = path.join(ROOT, 'tools', 'bin', 'ffmpeg', 'ffmpeg-9.1-essentials_build', 'bin', 'ffmpeg.exe');
const PSXAVENC = path.join(ROOT, 'tools', 'bin', 'psxavenc', 'bin', 'psxavenc.exe');

const BAIL_SAMPLE_RATE = 7796; // Exact PS1 VAB pitch for center=90, shift=0, note=60
const BAIL_CENTER_NOTE = 90;
const BAIL_SFX_IDS = [28, 29, 30, 181, 182, 183, 185, 186, 187];

// 9 audited scream clips (interleaved dry solo + fight impact for maximum variety on consecutive bails)
const BAIL_SCREAM_SPECS = [
  { slot: 0, sfxId: 28,  tone: 0, vagId: 26, vid: 'Loko em casa sozinho.mp4',       ss: 57.28,  dur: 0.84, name: 'bail0_loko_epico' },
  { slot: 1, sfxId: 29,  tone: 1, vagId: 27, vid: 'Loko em casa sozinho.mp4',       ss: 71.18,  dur: 0.65, name: 'bail1_loko_curto' },
  { slot: 2, sfxId: 30,  tone: 2, vagId: 28, vid: 'A-melhor-Luta-de-2016_720p.mp4', ss: 70.72,  dur: 0.54, name: 'bail2_luta_au' },
  { slot: 3, sfxId: 181, tone: 3, vagId: 29, vid: 'Loko em casa sozinho.mp4',       ss: 72.78,  dur: 0.66, name: 'bail3_loko_72s' },
  { slot: 4, sfxId: 182, tone: 4, vagId: 30, vid: 'Loko em casa sozinho.mp4',       ss: 12.16,  dur: 0.66, name: 'bail4_loko_12s' },
  { slot: 5, sfxId: 183, tone: 5, vagId: 31, vid: 'A-melhor-Luta-de-2016_720p.mp4', ss: 125.18, dur: 0.60, name: 'bail5_luta_125s' },
  { slot: 6, sfxId: 185, tone: 7, vagId: 33, vid: 'Loko em casa sozinho.mp4',       ss: 74.52,  dur: 0.74, name: 'bail6_loko_74s' },
  { slot: 7, sfxId: 186, tone: 8, vagId: 34, vid: 'A-melhor-Luta-de-2016_720p.mp4', ss: 137.78, dur: 0.64, name: 'bail7_luta_137s' },
  { slot: 8, sfxId: 187, tone: 9, vagId: 35, vid: 'Loko em casa sozinho.mp4',       ss: 36.90,  dur: 0.54, name: 'bail8_loko_37s' },
];

const VAB_TARGETS = [
  { name: 'skate2',  vabIdx: 3,   sfxIdx: 4,   unusedP2Vags: [32, 36, 37] },
  { name: 'skate2g', vabIdx: 520, sfxIdx: 521, unusedP2Vags: [32, 36, 37] },
  { name: 'skate2p', vabIdx: 522, sfxIdx: 523, unusedP2Vags: [32, 36, 43] },
];

// Build a valid Sony PS1 silent VAG dummy of exact byte length (multiple of 16, >= 48 B)
function makeSilentVag(byteLen) {
  if (byteLen < 48 || (byteLen & 15) !== 0) {
    throw new Error(`Invalid silent VAG size: ${byteLen}`);
  }
  const buf = Buffer.alloc(byteLen, 0);
  // Sony VABTool pattern: block 0 = all zero lead-in; middle blocks = 0x0C, 0x00, 0..0;
  // penultimate block = 0x0C, 0x01, 0..0 (one-shot stop); last block = 0x07, 0x00, 0x77 x 14 (Sony sentinel)
  for (let o = 16; o < byteLen - 32; o += 16) buf[o] = 0x0C;
  buf[byteLen - 32] = 0x0C;
  buf[byteLen - 31] = 0x01;
  buf[byteLen - 16] = 0x07;
  buf[byteLen - 15] = 0x00;
  buf.fill(0x77, byteLen - 14, byteLen);
  return buf;
}

function encodeBailScream(spec, force = false) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const wavPath = path.join(CACHE_DIR, `${spec.name}.wav`);
  const spuPath = path.join(CACHE_DIR, `${spec.name}.vag`);
  const srcPath = path.join(VID_DIR, spec.vid);

  if (!force && fs.existsSync(spuPath)) {
    const cached = fs.readFileSync(spuPath);
    if (cached.length >= 64 && (cached.length & 15) === 0) return cached;
  }
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Video fonte nao encontrado: ${srcPath}`);
  }

  const fadeOutStart = Math.max(0.05, spec.dur - 0.025).toFixed(3);
  const ff = spawnSync(FFMPEG, [
    '-y', '-v', 'error',
    '-ss', String(spec.ss), '-t', String(spec.dur), '-i', srcPath,
    '-vn', '-ac', '1', '-ar', String(BAIL_SAMPLE_RATE),
    '-af', `highpass=f=85,lowpass=f=3600,acompressor=threshold=-16dB:ratio=3:attack=5:release=60:makeup=2,alimiter=limit=0.92:level=true,afade=t=in:st=0:d=0.008,afade=t=out:st=${fadeOutStart}:d=0.025`,
    '-c:a', 'pcm_s16le', wavPath,
  ], { encoding: 'utf8' });
  if (ff.status !== 0) throw new Error(`ffmpeg falhou em ${spec.name}: ${ff.stderr}`);

  // Peak-normalize PCM to -0.8 dBFS (91% full scale) so all 9 screams hit uniformly over game SFX & XA music
  const wBuf = fs.readFileSync(wavPath);
  let dataOff = 12;
  while (dataOff + 8 < wBuf.length && wBuf.subarray(dataOff, dataOff + 4).toString('ascii') !== 'data') {
    dataOff += 8 + wBuf.readUInt32LE(dataOff + 4);
  }
  const pcmOff = dataOff + 8;
  const pcmLen = wBuf.readUInt32LE(dataOff + 4);
  let maxAbs = 1;
  for (let i = 0; i < pcmLen; i += 2) {
    const v = Math.abs(wBuf.readInt16LE(pcmOff + i));
    if (v > maxAbs) maxAbs = v;
  }
  const gain = (32767 * 0.91) / maxAbs;
  for (let i = 0; i < pcmLen; i += 2) {
    const v = Math.max(-32768, Math.min(32767, Math.round(wBuf.readInt16LE(pcmOff + i) * gain)));
    wBuf.writeInt16LE(v, pcmOff + i);
  }
  fs.writeFileSync(wavPath, wBuf);

  const rawSpuPath = path.join(CACHE_DIR, `${spec.name}.raw.spu`);
  const enc = spawnSync(PSXAVENC, ['-q', '-t', 'spu', '-f', String(BAIL_SAMPLE_RATE), '-a', '16', '-L', wavPath, rawSpuPath], { encoding: 'utf8' });
  if (enc.status !== 0) throw new Error(`psxavenc falhou em ${spec.name}: ${enc.stderr}`);

  const raw = fs.readFileSync(rawSpuPath);
  if (raw.length < 32 || (raw.length & 15) !== 0) {
    throw new Error(`Tamanho SPU-ADPCM invalido para ${spec.name}: ${raw.length}`);
  }
  // Ensure clean one-shot ADPCM flags (strip loop bit1/bit2; final audio block has bit0=0x01)
  for (let o = 0; o + 16 <= raw.length; o += 16) raw[o + 1] = raw[o + 1] & 0x01;
  raw[raw.length - 15] = 0x01;

  // Append exact Sony VABTool 16-byte silent stop sentinel (0x07, 0x00, 0x77 x 14) matching native skate2.vab!
  const sentinel = Buffer.alloc(16, 0x77);
  sentinel[0] = 0x07;
  sentinel[1] = 0x00;
  const vag = Buffer.concat([raw, sentinel]);
  fs.writeFileSync(spuPath, vag);
  return vag;
}

function loadAll9BailVags(force = false) {
  return BAIL_SCREAM_SPECS.map(spec => ({
    ...spec,
    vag: encodeBailScream(spec, force),
  }));
}

function patchSingleVab(origVabBuf, targetCfg, encodedClips) {
  if (origVabBuf.subarray(0, 4).toString('ascii') !== 'pBAV') {
    throw new Error(`${targetCfg.name}.vab: magic pBAV invalido!`);
  }
  const nProg = origVabBuf.readUInt16LE(18);
  const nVag = origVabBuf.readUInt16LE(22);
  const vagTabOff = 2080 + nProg * 512;
  const vbStart = vagTabOff + 512;
  const origVbSize = origVabBuf.length - vbStart;

  // Extract all original VAG payloads [1..nVag]
  const origVags = [];
  let cur = vbStart;
  for (let v = 1; v <= nVag; v++) {
    const sz = origVabBuf.readUInt16LE(vagTabOff + v * 2) * 8;
    origVags[v] = origVabBuf.subarray(cur, cur + sz);
    cur += sz;
  }
  if (cur !== origVabBuf.length) {
    throw new Error(`${targetCfg.name}.vab: soma VAGs (${cur}) != fileSize (${origVabBuf.length})`);
  }

  // Build replacement map for Program 2 VAGs
  const newVags = origVags.slice();
  const replacedSet = new Set([...encodedClips.map(c => c.vagId), ...targetCfg.unusedP2Vags]);
  let origP2Bytes = 0;
  for (const vid of replacedSet) origP2Bytes += origVags[vid].length;

  let newScreamsBytes = 0;
  for (const c of encodedClips) {
    newVags[c.vagId] = c.vag;
    newScreamsBytes += c.vag.length;
  }

  // Distribute remaining P2 budget across the 3 unused P2 dummy VAGs so total VB size is 100% EXACT Redump!
  const remaining = origP2Bytes - newScreamsBytes;
  const [d0, d1, d2] = targetCfg.unusedP2Vags;
  const d0Sz = 64, d1Sz = 64, d2Sz = remaining - d0Sz - d1Sz;
  if (d2Sz < 48 || (d2Sz & 15) !== 0) {
    throw new Error(`${targetCfg.name}.vab: orcamento P2 excedido! orig=${origP2Bytes}B, screams=${newScreamsBytes}B, d2Sz=${d2Sz}B`);
  }
  newVags[d0] = makeSilentVag(d0Sz);
  newVags[d1] = makeSilentVag(d1Sz);
  newVags[d2] = makeSilentVag(d2Sz);

  // Clone header + tone tables; update Program 2 Tone attributes (T0..T11)
  const out = Buffer.from(origVabBuf);
  const setP2Tone = (toneIdx, vagId) => {
    const o = 2080 + 2 * 512 + toneIdx * 32;
    out[o + 0] = 0;                 // prior
    out[o + 1] = 0;                 // mode
    out[o + 2] = 127;               // vol (full hardware volume)
    out[o + 3] = 64;                // pan (center)
    out[o + 4] = BAIL_CENTER_NOTE;  // center = 90 -> 7796 Hz @ note=60
    out[o + 5] = 0;                 // shift = 0
    out[o + 6] = 0;                 // min note
    out[o + 7] = 120;               // max note
    out.writeUInt16LE(vagId, o + 22);
  };

  for (const c of encodedClips) setP2Tone(c.tone, c.vagId);
  // Alias remaining unused P2 tones (T6, T10, T11) to real scream VAGs (zero extra SPU RAM!)
  setP2Tone(6,  encodedClips[1].vagId);
  setP2Tone(10, encodedClips[2].vagId);
  setP2Tone(11, encodedClips[0].vagId);

  // Rewrite VAG size table (u16 = size >> 3) + concatenate all VAG payloads
  let wOff = vbStart;
  for (let v = 1; v <= nVag; v++) {
    const chunk = newVags[v];
    if ((chunk.length & 15) !== 0) throw new Error(`${targetCfg.name}.vab VAG[${v}] desalinhado: ${chunk.length}`);
    out.writeUInt16LE(chunk.length >> 3, vagTabOff + v * 2);
    chunk.copy(out, wOff);
    wOff += chunk.length;
  }
  if (wOff !== origVabBuf.length || (wOff - vbStart) !== origVbSize) {
    throw new Error(`${targetCfg.name}.vab: tamanho final divergente (${wOff} != ${origVabBuf.length})`);
  }
  return out;
}

function patchSingleSfx(origSfxBuf, targetCfg) {
  const out = Buffer.from(origSfxBuf);
  // Exact 1:1 mapping for all 9 universal bail SFX IDs + aliases (184, 384, 385, 393, 394, 395)
  const idToTone = new Map([
    [28,  0], [29,  1], [30,  2],
    [181, 3], [182, 4], [183, 5], [184, 6],
    [185, 7], [186, 8], [187, 9],
    [384, 11], [385, 11], [393, 0], [394, 3], [395, 7],
  ]);
  const seen = new Set();
  for (let o = 0; o + 16 <= out.length; o += 16) {
    const sfxId = out.readUInt16LE(o + 8);
    if (idToTone.has(sfxId)) {
      out[o + 1] = 2;                   // Program 2
      out[o + 2] = idToTone.get(sfxId); // Exact Tone index
      out[o + 3] = 60;                  // Exact MIDI note C4 -> 7796 Hz @ center=90
      out.writeUInt16LE(4096, o + 6);   // Full 1.0x volume multiplier
      seen.add(sfxId);
    }
  }
  for (const id of BAIL_SFX_IDS) {
    if (!seen.has(id)) throw new Error(`${targetCfg.name}.sfx: sfxId ${id} ausente!`);
  }
  return out;
}

function buildAllPatchedBanks(origWadBuf, origHedBuf, forceEncode = false) {
  const clips = loadAll9BailVags(forceEncode);
  const results = [];
  for (const cfg of VAB_TARGETS) {
    const vabOff = origHedBuf.readUInt32LE(cfg.vabIdx * 12 + 4);
    const vabSz  = origHedBuf.readUInt32LE(cfg.vabIdx * 12 + 8);
    const sfxOff = origHedBuf.readUInt32LE(cfg.sfxIdx * 12 + 4);
    const sfxSz  = origHedBuf.readUInt32LE(cfg.sfxIdx * 12 + 8);

    const origVab = origWadBuf.subarray(vabOff, vabOff + vabSz);
    const origSfx = origWadBuf.subarray(sfxOff, sfxOff + sfxSz);

    const patchedVab = patchSingleVab(origVab, cfg, clips);
    const patchedSfx = patchSingleSfx(origSfx, cfg);
    results.push({ ...cfg, vabOff, vabSz, sfxOff, sfxSz, patchedVab, patchedSfx });
  }
  return { clips, results };
}

function applyBailScreams(forceEncode = false) {
  console.log('=== 1. Codificando 9 gritos de queda (7796 Hz, SPU-ADPCM 4-bit, Sony VABTool format) ===');
  const origHed = fs.readFileSync(ORIG_HED_PATH);
  const origWad = fs.readFileSync(ORIG_WAD_PATH);
  const curHed  = fs.readFileSync(CUR_HED_PATH);
  const curWad  = fs.readFileSync(CUR_WAD_PATH);

  const { clips, results } = buildAllPatchedBanks(origWad, origHed, forceEncode);
  let totalVagBytes = 0;
  for (const c of clips) {
    totalVagBytes += c.vag.length;
    console.log(`  Slot ${c.slot} | sfxId=${String(c.sfxId).padStart(3)} | P2:T${c.tone} -> VAG[${c.vagId}] | ${String(c.vag.length).padStart(4)} B | ${c.vid} @ ${c.ss}s (+${c.dur}s)`);
  }
  console.log(`  Total 9 VAGs = ${totalVagBytes} B <= 26.784 B (orcamento nativo skate2.vab Program 2)`);

  console.log('\n=== 2. Injetando in-place em CD.WAD (skate2, skate2g, skate2p .VAB & .SFX) ===');
  for (const r of results) {
    const curVabOff = curHed.readUInt32LE(r.vabIdx * 12 + 4);
    const curVabSz  = curHed.readUInt32LE(r.vabIdx * 12 + 8);
    const curSfxOff = curHed.readUInt32LE(r.sfxIdx * 12 + 4);
    const curSfxSz  = curHed.readUInt32LE(r.sfxIdx * 12 + 8);
    if (curVabSz !== r.patchedVab.length || curSfxSz !== r.patchedSfx.length) {
      throw new Error(`Tamanho em CD.HED divergente para ${r.name}`);
    }
    r.patchedVab.copy(curWad, curVabOff);
    r.patchedSfx.copy(curWad, curSfxOff);
    console.log(`  [OK] ${r.name}.vab (WAD[${r.vabIdx}], ${curVabSz} B) + ${r.name}.sfx (WAD[${r.sfxIdx}], ${curSfxSz} B) gravados in-place!`);
  }
  fs.writeFileSync(CUR_WAD_PATH, curWad);
  console.log('[OK] CD.WAD atualizado com 0 alteracoes em CD.HED e 0 bytes extras em SPU RAM.');
}

module.exports = {
  BAIL_SAMPLE_RATE,
  BAIL_CENTER_NOTE,
  BAIL_SFX_IDS,
  BAIL_SCREAM_SPECS,
  VAB_TARGETS,
  loadAll9BailVags,
  patchSingleVab,
  patchSingleSfx,
  buildAllPatchedBanks,
};

if (require.main === module) {
  applyBailScreams(process.argv.includes('--force'));
}
