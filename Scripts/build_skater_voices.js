#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Skater Select Voice Bank Builder
 *
 * Encodes all MP3 voice clips in:
 *   - audios_skatistas/lulao_audios/     (Lulao, skater idx 2)
 *   - audios_skatistas/bolsonaro_audios/ (Bolsonaro, skater idx 3)
 *
 * Pipeline per clip:
 *   1. ffmpeg: mono, 11025 Hz, highpass 80 Hz, EBU R128 loudness normalization (-13 LUFS, -1.0 dBTP)
 *   2. psxavenc: -t spu -f 11025 -a 64 -L (hardware PS1 SPU-ADPCM mono, 64-byte DMA aligned, one-shot stop flag)
 *   3. Appends an explicit 16-byte silent one-shot terminator block (0x00, 0x01, 0x00...) if not already silent+end,
 *      re-padded to 64 bytes so PS1 SPU Hardware Voice 23 always stops cleanly with zero pop/loop.
 *   4. Packs into root-level VOICES.DAT (2048-byte sector aligned):
 *      - Sector 0 (0x0000..0x07FF): Resident MODCODE (2048 B, loaded to RAM 0x800E2800 by SLUS_010.66)
 *      - Sector 1 (0x0800..0x0FFF): VOICETBL index (2048 B, loaded to RAM 0x800E3000 by SLUS_010.66)
 *      - Sectors 2..N:              28 SPU-ADPCM voice payloads (Lulao [0..13], Bolsonaro [14..27])
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const audiosRoot = path.join(rootDir, 'audios_skatistas');
const lulaoDir = path.join(audiosRoot, 'lulao_audios');
const bolsoDir = path.join(audiosRoot, 'bolsonaro_audios');
const cacheDir = path.join(rootDir, 'build', '_voice_cache');
const voicesDatPath = path.join(rootDir, 'VOICES.DAT');
const manifestPath = path.join(rootDir, 'build', 'voices_manifest.json');

const ffmpegExe = path.join(rootDir, 'tools', 'bin', 'ffmpeg', 'ffmpeg-9.1-essentials_build', 'bin', 'ffmpeg.exe');
const psxavencExe = path.join(rootDir, 'tools', 'bin', 'psxavenc', 'bin', 'psxavenc.exe');

// PS1 SPU upper-RAM reusable voice slot: 0x58000..0x7EFF0 (159,728 bytes free above shell.vab!)
const SPU_SAMPLE_RATE = 11025;
const SPU_PITCH = 0x0400; // exact 11025 / 44100 * 0x1000
const SPU_MAX_CLIP_BYTES = 0x7EFF0 - 0x58000; // 159,728 bytes (~25.3 seconds @ 11025 Hz!)
const MAX_CLIPS_PER_SKATER = 60; // Sector 1 holds header (16B) + up to 127 x 16B entries

function encodeClipToSpu(mp3Path, cacheKey, force = false) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const wavPath = path.join(cacheDir, `${cacheKey}.wav`);
  const spuPath = path.join(cacheDir, `${cacheKey}.spu`);

  const srcStat = fs.statSync(mp3Path);
  if (!force && fs.existsSync(spuPath)) {
    const dstStat = fs.statSync(spuPath);
    if (dstStat.size >= 64 && dstStat.mtimeMs >= srcStat.mtimeMs) {
      return fs.readFileSync(spuPath);
    }
  }

  // Step 1: Decode & normalize MP3 -> 11025 Hz mono 16-bit PCM WAV
  // Trim trailing dead silence so clips feel snappy, and normalize voice volume to stand out over menu music.
  const ff = spawnSync(ffmpegExe, [
    '-y', '-v', 'error',
    '-i', mp3Path,
    '-ac', '1',
    '-ar', String(SPU_SAMPLE_RATE),
    '-af', 'highpass=f=80,loudnorm=I=-13:TP=-1.0:LRA=9,aresample=11025',
    '-c:a', 'pcm_s16le',
    wavPath,
  ], { encoding: 'utf8' });

  if (ff.status !== 0) {
    throw new Error(`ffmpeg falhou em ${path.basename(mp3Path)}: ${ff.stderr || ff.stdout}`);
  }

  // Step 2: Encode WAV -> raw PS1 SPU-ADPCM mono via psxavenc
  // -L sets one-shot ADPCM end flag (0x01) at the end of stream without looping;
  // default (no -D) prepends a 16-byte silent lead-in block to reset SPU decoder state.
  const rawSpuPath = path.join(cacheDir, `${cacheKey}.raw.spu`);
  const enc = spawnSync(psxavencExe, [
    '-q',
    '-t', 'spu',
    '-f', String(SPU_SAMPLE_RATE),
    '-a', '64',
    '-L',
    wavPath,
    rawSpuPath,
  ], { encoding: 'utf8' });

  if (enc.status !== 0) {
    throw new Error(`psxavenc falhou em ${path.basename(mp3Path)}: ${enc.stderr || enc.stdout}`);
  }

  let spu = fs.readFileSync(rawSpuPath);

  // Verify clean one-shot ADPCM flags on every 16-byte block:
  // psxavenc -L writes flag=0x01 on the final audio block (and zero-pads to 64B).
  // Ensure the final 64-byte chunk ends with a clean silent one-shot stop block (flag=0x01, bit1=0 -> silence & stop)
  // AND clear any accidental Loop Repeat bit (bit1 = 0x02) anywhere in the stream.
  for (let off = 0; off + 16 <= spu.length; off += 16) {
    // Strip bit 1 (loop repeat) & bit 2 (loop start) so one-shot never loops
    spu[off + 1] = spu[off + 1] & 0x01;
  }

  // Ensure an explicit trailing 16-byte silent stop block at the very end, padded to 64B
  const lastOff = spu.length - 16;
  const lastIsSilentStop =
    spu[lastOff] === 0x00 &&
    spu[lastOff + 1] === 0x01 &&
    spu.subarray(lastOff + 2, lastOff + 16).every(b => b === 0);

  if (!lastIsSilentStop) {
    const padTail = Buffer.alloc(64, 0);
    padTail[1] = 0x01; // silent stop immediately after last audio block
    padTail[17] = 0x01;
    padTail[33] = 0x01;
    padTail[49] = 0x01;
    spu = Buffer.concat([spu, padTail]);
  }

  // Final check: must fit inside our SPU RAM upper slot (0x58000..0x7EFF0)
  if (spu.length > SPU_MAX_CLIP_BYTES) {
    throw new Error(
      `Clip ${path.basename(mp3Path)} excede slot SPU RAM: ${spu.length} B > ${SPU_MAX_CLIP_BYTES} B`
    );
  }

  fs.writeFileSync(spuPath, spu);
  // Cleanup intermediate wav / raw
  try { fs.unlinkSync(wavPath); } catch (_) {}
  try { fs.unlinkSync(rawSpuPath); } catch (_) {}
  return spu;
}

function buildVoicesBank(modCodeSector = null, force = false, sec1ExtraCode = null) {
  if (!fs.existsSync(lulaoDir) || !fs.existsSync(bolsoDir)) {
    throw new Error(`Pastas de audio nao encontradas em ${audiosRoot}`);
  }

  const lulaoFiles = fs.readdirSync(lulaoDir).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f)).sort();
  const bolsoFiles = fs.readdirSync(bolsoDir).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f)).sort();

  if (lulaoFiles.length === 0 || bolsoFiles.length === 0) {
    throw new Error(`Clips insuficientes: lulao=${lulaoFiles.length}, bolsonaro=${bolsoFiles.length}`);
  }
  if (lulaoFiles.length + bolsoFiles.length > 30) {
    throw new Error(`Total de vozes excede limite de 30 entradas (0x10..0x1F0) para preservar Hook_BailSfx @ +0x200.`);
  }

  console.log(`=== Codificando Banco de Vozes PS1 SPU-ADPCM (${SPU_SAMPLE_RATE} Hz Mono) ===`);
  console.log(`  Lulao:     ${lulaoFiles.length} clips`);
  console.log(`  Bolsonaro: ${bolsoFiles.length} clips`);

  // Preserve existing Sector 0 (MODCODE) if caller didn't pass one and VOICES.DAT already exists
  let sec0 = Buffer.alloc(2048, 0);
  if (modCodeSector) {
    if (modCodeSector.length > 2048) throw new Error(`MODCODE excede 2048 B (${modCodeSector.length} B)`);
    modCodeSector.copy(sec0, 0);
  } else if (fs.existsSync(voicesDatPath)) {
    const prev = fs.readFileSync(voicesDatPath);
    if (prev.length >= 2048) prev.copy(sec0, 0, 0, 2048);
  }

  const allEntries = [];
  const payloads = [];
  let curSector = 2; // Sector 0 = MODCODE, Sector 1 = VOICETBL

  const groups = [
    { skater: 'Lulao', skaterIdx: 2, dir: lulaoDir, files: lulaoFiles, prefix: 'lulao' },
    { skater: 'Bolsonaro', skaterIdx: 3, dir: bolsoDir, files: bolsoFiles, prefix: 'bolso' },
  ];

  let maxClipBytes = 0;
  for (const grp of groups) {
    for (let i = 0; i < grp.files.length; i++) {
      const fn = grp.files[i];
      const fullPath = path.join(grp.dir, fn);
      const spu = encodeClipToSpu(fullPath, `${grp.prefix}_${String(i).padStart(2, '0')}_${fn.replace(/[^a-zA-Z0-9._-]/g, '_')}`, force);
      const secCount = Math.ceil(spu.length / 2048);
      const padded = Buffer.alloc(secCount * 2048, 0);
      spu.copy(padded, 0);

      const durSec = (spu.length / 16) * 28 / SPU_SAMPLE_RATE;
      if (spu.length > maxClipBytes) maxClipBytes = spu.length;

      allEntries.push({
        skater: grp.skater,
        skaterIdx: grp.skaterIdx,
        clipIdx: i,
        file: fn,
        sectorOffset: curSector,
        sectorCount: secCount,
        byteSize: spu.length,
        spuPitch: SPU_PITCH,
        durationSec: Number(durSec.toFixed(2)),
      });
      payloads.push(padded);
      curSector += secCount;
      console.log(
        `  [${grp.skater.padEnd(9)} #${String(i).padStart(2, '0')}] ${fn.padEnd(42)} ` +
        `${durSec.toFixed(2).padStart(5)}s | ${String(spu.length).padStart(6)} B (${String(secCount).padStart(2)} sec) @ +${allEntries[allEntries.length - 1].sectorOffset}`
      );
    }
  }

  // Build Sector 1: VOICETBL (2048 B, loaded to RAM 0x800E3000)
  // +0x00: uint32 magic = 0x564F4943 ("VOIC" LE)
  // +0x04: uint32 lulaoCount
  // +0x08: uint32 bolsoCount
  // +0x0C: uint32 spuBaseAddr (0x58000)
  // +0x10 + i*16: { uint32 sectorOffset, uint32 sectorCount, uint32 byteSize, uint32 spuPitch }
  const sec1 = Buffer.alloc(2048, 0);
  sec1.writeUInt32LE(0x564F4943, 0x00);
  sec1.writeUInt32LE(lulaoFiles.length, 0x04);
  sec1.writeUInt32LE(bolsoFiles.length, 0x08);
  sec1.writeUInt32LE(0x00058000, 0x0C);

  for (let i = 0; i < allEntries.length; i++) {
    const e = allEntries[i];
    const base = 0x10 + i * 16;
    sec1.writeUInt32LE(e.sectorOffset, base + 0);
    sec1.writeUInt32LE(e.sectorCount, base + 4);
    sec1.writeUInt32LE(e.byteSize, base + 8);
    sec1.writeUInt32LE(e.spuPitch, base + 12);
  }

  // Embed resident Bail Round-Robin MIPS hook in Sector 1 upper region (+0x200..+0x7FF -> RAM 0x800E3200..0x800E37FF)
  if (sec1ExtraCode) {
    if (sec1ExtraCode.length > 1536) throw new Error(`sec1ExtraCode excede 1536 B (${sec1ExtraCode.length} B)`);
    sec1ExtraCode.copy(sec1, 0x200);
  } else if (fs.existsSync(voicesDatPath)) {
    const prev = fs.readFileSync(voicesDatPath);
    if (prev.length >= 4096) prev.copy(sec1, 0x200, 2048 + 0x200, 4096);
  }

  const finalBuf = Buffer.concat([sec0, sec1, ...payloads]);
  fs.writeFileSync(voicesDatPath, finalBuf);

  const manifest = {
    voicesDatBytes: finalBuf.length,
    voicesDatSectors: finalBuf.length / 2048,
    sampleRateHz: SPU_SAMPLE_RATE,
    spuPitchHex: '0x0400',
    spuSlotStartHex: '0x58000',
    spuSlotMaxBytes: SPU_MAX_CLIP_BYTES,
    maxClipBytes,
    lulaoCount: lulaoFiles.length,
    bolsoCount: bolsoFiles.length,
    entries: allEntries,
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n=== VOICES.DAT GERADO COM SUCESSO ===`);
  console.log(`  Arquivo:   ${voicesDatPath}`);
  console.log(`  Tamanho:   ${finalBuf.length} B (${finalBuf.length / 2048} setores, ${(finalBuf.length / 1048576).toFixed(2)} MB)`);
  console.log(`  Maior clip:${maxClipBytes} B / ${SPU_MAX_CLIP_BYTES} B max SPU RAM (margem: ${SPU_MAX_CLIP_BYTES - maxClipBytes} B)`);
  return manifest;
}

module.exports = { buildVoicesBank, SPU_SAMPLE_RATE, SPU_PITCH, SPU_MAX_CLIP_BYTES };

if (require.main === module) {
  const force = process.argv.includes('--force');
  buildVoicesBank(null, force);
}
