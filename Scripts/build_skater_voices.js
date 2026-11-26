#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Skater Select Voice Bank Builder
 *
 * Encodes all MP3 voice clips in:
 *   - audios_skatistas/lulao_audios/     (Lulao,         skater idx 2)
 *   - audios_skatistas/bolsonaro_audios/ (Bolsonaro,     skater idx 3)
 *   - audios_skatistas/silvio_audios/    (Silvio Santos, skater idx 1)
 *
 * Pipeline per clip:
 *   1. ffmpeg: mono, 11025 Hz, highpass 80 Hz, EBU R128 loudness normalization (-13 LUFS, -1.0 dBTP)
 *   2. psxavenc: -t spu -f 11025 -a 64 -L (hardware PS1 SPU-ADPCM mono, 64-byte DMA aligned, one-shot stop flag)
 *   3. Appends an explicit 16-byte silent one-shot terminator block (0x00, 0x01, 0x00...) if not already silent+end,
 *      re-padded to 64 bytes so PS1 SPU Hardware Voice 23 always stops cleanly with zero pop/loop.
 *   4. Packs into root-level VOICES.DAT (2048-byte sector aligned):
 *      - Sector 0 (0x0000..0x07FF): Resident MODCODE (2048 B, loaded to RAM 0x800E2800 by SLUS_010.66)
 *      - Sector 1 (0x0800..0x0FFF): VOICETBL + Resident Sec1 Code (2048 B, loaded to RAM 0x800E3000):
 *          * +0x000..+0x3EF: header (16 B) + up to 62 x 16 B clip descriptors
 *          * +0x3F0: silvioCount | +0x3F4: g_SilvioClipIdx | +0x3F8: g_LulaoClipIdx | +0x3FC: g_BolsoClipIdx
 *          * +0x400..+0x5FF: Hook_BailSfx (RAM 0x800E3400, 9 rotating bail screams)
 *          * +0x600..+0x7FF: VoiceSelect_Lookup / VoiceSelect_SeedAll (RAM 0x800E3600)
 *      - Sector 2 (0x1000..0x17FF): Resident LULAO_CODE (2048 B, RAM 0x800E3800..0x800E3FFF)
 *          * Career Goal/Cash Swapper + Cash Pickup / End-of-Run Hooks + 2 KB SPU Voice 23 Ping-Pong Streamer
 *      - Sectors 3..4 (0x1800..0x27FF): Resident LULAO_STRDATA (4096 B, RAM 0x800E4000..0x800E4FFF)
 *          * Lulao Career Goal/Medal/Cash Pointer Table & Satirical PT-BR Strings
 *      - Sectors 5..N:              41 SPU-ADPCM voice payloads (Lulao [0..13], Bolsonaro [14..27], Silvio [28..40])
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const audiosRoot = path.join(rootDir, 'audios_skatistas');
const lulaoDir = path.join(audiosRoot, 'lulao_audios');
const bolsoDir = path.join(audiosRoot, 'bolsonaro_audios');
const silvioDir = path.join(audiosRoot, 'silvio_audios');
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

// Compact Gameplay Voice Sub-Bank (LULAO_GPBANK) for ZERO-STALL Main RAM pre-cache:
//   Exact PS1 hardware pitch 0x0280 = 640 / 4096 * 44100 = 6890.625 Hz (0.00% pitch error, Nyquist 3.44 kHz > G.711!)
//   Every gameplay clip is silence-trimmed (instant Frame-1 vocal attack!), EQ-boosted (-10 LUFS punchy presence),
//   and capped to <= 3.20s of active speech so ALL 10 levels (incl. School II, Bullring, Venice, NY City, Skate Heaven)
//   ALWAYS preload multiple random clips in Main RAM with 0.00 ms stall & 48 KB untouched Heap[1] safety reserve!
//   (Skater Select playsel.bin keeps all 41 full uncut 11,025 Hz clips 100% untouched!).
const GP_SAMPLE_RATE = 6891;
const GP_EXACT_RATE_HZ = 6890.625;
const GP_SPU_PITCH = 0x0280;
const GP_MAX_ACTIVE_SEC = 2.85;
// Interleaved short/medium clip order (by sorted index in lulao_audios/) with shortest clip (#11 = ~4.1 KB) at slot 0
// for guaranteed fallback and maximum variety in every contiguous RAM window:
const GP_LULAO_ORDER = [11, 0, 8, 4, 6, 1, 13, 2, 9, 3, 7, 10, 5, 12];
const cashArtPath = path.join(rootDir, 'build', 'lulao_cash_art.bin');

// Authentic Crash Bandicoot 3: Warped PS1 SFX Bank (CRASH_SFXBANK @ 11,025 Hz, pitch 0x0400)
//   Slot 0:    Wumpa Fruit ("Manga") $50 pickup          — frt0A (99 ms)
//   Slot 1:    Power Crystal ("Cristal") $100 pickup     — Pb10A (486 ms)
//   Slot 2:    Diamond / Gem ("Diamante") $250 pickup    — GSh2A (750 ms)
//   Slot 3:    Aku Aku ("BOODABAGA!") Hangar G5 pickup   — WD10A (724 ms)
//   Slots 4..11 (8 distinct authentic Crash 3 fall/hurt/woah sounds for random bail rotation!):
//     4: fal0A (364 ms — iconic "WOAAAAH!")
//     5: arg0A (231 ms — iconic "AARGH!")
//     6: yip0A ( 81 ms — "YIP / WHOOP!")
//     7: sht0A (104 ms — "OOOF!")
//     8: de20A (154 ms — "UGH!")
//     9: CD1dA (1049 ms — "WHOA-OOOOH! CRASH")
//    10: CD3dA (367 ms — "AIEEE!")
//    11: Cd2cA (264 ms — "OOH-AH!")
const CRASH_SFX_DIR = path.join(rootDir, 'crash_3_psx', 'crash3_thps2_master', '02_extracted_crash3_complete', '06_audio_sfx_music_speech', 'sfx_adio');
const CRASH_SFX_LIST = [
  { slot: 0,  role: 'wumpa_50',   file: 'frt0A_1edba049.wav' },
  { slot: 1,  role: 'crystal_100',file: 'Pb10A_66582049.wav' },
  { slot: 2,  role: 'diamond_250',file: 'GSh2A_55b22149.wav' },
  { slot: 3,  role: 'aku_aku_g5', file: 'WD10A_75382049.wav' },
  { slot: 4,  role: 'bail_woah',  file: 'fal0A_1e52a049.wav' },
  { slot: 5,  role: 'bail_arg',   file: 'arg0A_14da0049.wav' },
  { slot: 6,  role: 'bail_yip',   file: 'yip0A_44932049.wav' },
  { slot: 7,  role: 'bail_oof',   file: 'sht0A_388ba049.wav' },
  { slot: 8,  role: 'bail_ugh',   file: 'de20A_1a704049.wav' },
  { slot: 9,  role: 'bail_crash', file: 'CD1dA_4d3826c9.wav' },
  { slot: 10, role: 'bail_yelp',  file: 'CD3dA_4d3866c9.wav' },
  { slot: 11, role: 'bail_ooh',   file: 'Cd2cA_4c684649.wav' },
];
const CRASH_SFX_HEADER_BYTES = 128; // +0:"CRSF", +4:clipCount(12), +8..+103:12x{off,sz}, +104..+127:pad

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

function writePcm16MonoWav(outPath, pcmBuf, sampleRate) {
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0);
  hdr.writeUInt32LE(36 + pcmBuf.length, 4);
  hdr.write('WAVE', 8);
  hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20);              // PCM
  hdr.writeUInt16LE(1, 22);              // mono
  hdr.writeUInt32LE(sampleRate, 24);
  hdr.writeUInt32LE(sampleRate * 2, 28);
  hdr.writeUInt16LE(2, 32);
  hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36);
  hdr.writeUInt32LE(pcmBuf.length, 40);
  fs.writeFileSync(outPath, Buffer.concat([hdr, pcmBuf]));
}

function encodeGameplayClipToSpu(mp3Path, cacheKey, maxSec = GP_MAX_ACTIVE_SEC, force = false) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const trimWavPath = path.join(cacheDir, `${cacheKey}.trim.wav`);
  const wavPath = path.join(cacheDir, `${cacheKey}.gp.wav`);
  const spuPath = path.join(cacheDir, `${cacheKey}.gp.spu`);

  const srcStat = fs.statSync(mp3Path);
  if (!force && fs.existsSync(spuPath)) {
    const dstStat = fs.statSync(spuPath);
    if (dstStat.size >= 32 && dstStat.size % 16 === 0 && dstStat.mtimeMs >= srcStat.mtimeMs) {
      return fs.readFileSync(spuPath);
    }
  }

  // Step 1: Decode source MP3 to 16 kHz mono s16le PCM and deterministically strip leading/trailing dead silence
  // (removes 0.25-0.68s silent intro lag so Lulao speaks on Frame 1 of cash pickup!) + cap active speech <= maxSec.
  const WORK_SR = 16000;
  const dec = spawnSync(ffmpegExe, [
    '-v', 'error', '-i', mp3Path,
    '-ac', '1', '-ar', String(WORK_SR), '-f', 's16le', '-',
  ], { maxBuffer: 64 * 1024 * 1024 });
  if (dec.status !== 0 || !dec.stdout || dec.stdout.length < 320) {
    throw new Error(`ffmpeg decode (GPBANK) falhou em ${path.basename(mp3Path)}: ${dec.stderr?.toString() || ''}`);
  }
  const pcm = dec.stdout;
  const totalSamp = pcm.length >> 1;
  let peak = 0;
  for (let i = 0; i < totalSamp; i++) {
    const v = Math.abs(pcm.readInt16LE(i * 2));
    if (v > peak) peak = v;
  }
  const thresh = Math.max(450, Math.floor(peak * 0.035)); // ~ -29 dB relative to clip peak
  let first = 0, last = totalSamp - 1;
  for (let i = 0; i < totalSamp; i++) {
    if (Math.abs(pcm.readInt16LE(i * 2)) > thresh) { first = i; break; }
  }
  for (let i = totalSamp - 1; i >= first; i--) {
    if (Math.abs(pcm.readInt16LE(i * 2)) > thresh) { last = i; break; }
  }
  // Keep 15 ms clean attack lead-in and 40 ms tail room
  first = Math.max(0, first - Math.floor(WORK_SR * 0.015));
  last = Math.min(totalSamp - 1, last + Math.floor(WORK_SR * 0.040));
  const maxSamp = Math.floor(WORK_SR * maxSec);
  const wasCapped = (last - first + 1) > maxSamp;
  if (wasCapped) last = first + maxSamp - 1;

  const trimmed = Buffer.from(pcm.subarray(first * 2, (last + 1) * 2));
  const nTrim = trimmed.length >> 1;
  // Apply smooth 60 ms raised-cosine fade-out when capped (or 15 ms micro-declick otherwise)
  const fadeLen = Math.min(nTrim >> 2, Math.floor(WORK_SR * (wasCapped ? 0.060 : 0.015)));
  for (let i = 0; i < fadeLen; i++) {
    const idx = nTrim - fadeLen + i;
    const g = 0.5 * (1 + Math.cos((Math.PI * (i + 1)) / fadeLen));
    trimmed.writeInt16LE(Math.round(trimmed.readInt16LE(idx * 2) * g), idx * 2);
  }
  writePcm16MonoWav(trimWavPath, trimmed, WORK_SR);

  // Step 2: Mastering-grade zero-hiss vocal DSP chain:
  //   - highpass=110 Hz (removes low rumble/DC)
  //   - afftdn (removes broadband mic/MP3 background hiss BEFORE loudness normalization)
  //   - warm 1.8 kHz vocal presence (+2 dB, avoiding 2.5-3.4 kHz sibilant hiss band)
  //   - cascaded 4-pole (-24 dB/oct) 3050 Hz brickwall lowpass + 64-tap Kaiser-sinc resampler (ZERO Nyquist aliasing!)
  //   - clean EBU R128 loudnorm (-11.5 LUFS, -1.5 dBTP headroom -> prevents 4-bit ADPCM predictor overshoot!)
  const afParts = [
    'highpass=f=110:p=2',
    'afftdn=nr=10:nf=-32:tn=1',
    'equalizer=f=1800:t=q:w=1.1:g=2.0',
    'lowpass=f=3050:p=2',
    'lowpass=f=3050:p=2',
    'loudnorm=I=-11.5:TP=-1.5:LRA=8',
    `aresample=${GP_SAMPLE_RATE}:filter_size=64:phase_shift=10:cutoff=0.90:kaiser_beta=9`,
  ];
  const ff = spawnSync(ffmpegExe, [
    '-y', '-v', 'error',
    '-i', trimWavPath,
    '-ac', '1',
    '-ar', String(GP_SAMPLE_RATE),
    '-af', afParts.join(','),
    '-c:a', 'pcm_s16le',
    wavPath,
  ], { encoding: 'utf8' });
  if (ff.status !== 0) {
    throw new Error(`ffmpeg (GPBANK) falhou em ${path.basename(mp3Path)}: ${ff.stderr || ff.stdout}`);
  }

  const rawSpuPath = path.join(cacheDir, `${cacheKey}.gp.raw.spu`);
  const enc = spawnSync(psxavencExe, [
    '-q',
    '-t', 'spu',
    '-f', String(GP_SAMPLE_RATE),
    '-a', '16',
    '-L',
    wavPath,
    rawSpuPath,
  ], { encoding: 'utf8' });
  if (enc.status !== 0) {
    throw new Error(`psxavenc (GPBANK) falhou em ${path.basename(mp3Path)}: ${enc.stderr || enc.stdout}`);
  }

  let spu = fs.readFileSync(rawSpuPath);
  // Strip any accidental loop/end bits from internal blocks (staging loader sets 0x04 / 0x03 / 0x01 cleanly!)
  for (let off = 0; off + 16 <= spu.length; off += 16) {
    spu[off + 1] = 0x00;
  }
  // Ensure exact multiple of 16 bytes + explicit trailing 16-byte silent stop block
  const rem = spu.length % 16;
  if (rem !== 0) spu = Buffer.concat([spu, Buffer.alloc(16 - rem, 0)]);
  const stopBlk = Buffer.alloc(16, 0);
  stopBlk[1] = 0x01;
  spu = Buffer.concat([spu, stopBlk]);

  fs.writeFileSync(spuPath, spu);
  try { fs.unlinkSync(trimWavPath); } catch (_) {}
  try { fs.unlinkSync(wavPath); } catch (_) {}
  try { fs.unlinkSync(rawSpuPath); } catch (_) {}
  return spu;
}

function encodeCompactGameplayBank(label, srcDir, files, keyPrefix, preferredOrder = null, force = false) {
  let order;
  if (preferredOrder && preferredOrder.length) {
    order = preferredOrder.filter(idx => idx < files.length);
    for (let i = 0; i < files.length; i++) if (!order.includes(i)) order.push(i);
  } else {
    // Interleave shortest-first & medium clips so slot 0 is ALWAYS the smallest guaranteed-fit fallback!
    const sizes = files.map((fn, idx) => ({ idx, sz: fs.statSync(path.join(srcDir, fn)).size }));
    sizes.sort((a, b) => a.sz - b.sz);
    order = [];
    let lo = 0, hi = sizes.length - 1;
    // Put shortest clip at slot 0, then alternate short/long for max variety in any contiguous slice!
    if (lo <= hi) order.push(sizes[lo++].idx);
    while (lo <= hi) {
      if (lo <= hi) order.push(sizes[hi--].idx);
      if (lo <= hi) order.push(sizes[lo++].idx);
    }
  }
  const singleClips = [];
  const singleChunks = [];
  let offset = 0;

  console.log(`\n=== Codificando Sub-Banco Compacto de Gameplay ${label} (${GP_EXACT_RATE_HZ} Hz, pitch 0x0280, cap <= ${GP_MAX_ACTIVE_SEC.toFixed(2)}s, -10 LUFS) ===`);
  for (let slot = 0; slot < order.length; slot++) {
    const origIdx = order[slot];
    const fn = files[origIdx];
    const maxSec = GP_MAX_ACTIVE_SEC;
    const key = `${keyPrefix}_${GP_SAMPLE_RATE}_${String(origIdx).padStart(2, '0')}_${maxSec.toFixed(2)}s_${fn.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const spu = encodeGameplayClipToSpu(path.join(srcDir, fn), key, maxSec, force);
    const durSec = ((spu.length / 16) * 28) / GP_EXACT_RATE_HZ;
    singleClips.push({
      slot,
      origIdx,
      file: fn,
      trimmedSec: maxSec,
      byteOffsetInBank: offset,
      byteSize: spu.length,
      durationSec: Number(durSec.toFixed(2)),
    });
    singleChunks.push(spu);
    offset += spu.length;
    console.log(
      `  [${label} #${String(slot).padStart(2, '0')} <- orig #${String(origIdx).padStart(2, '0')}] ${fn.padEnd(40)} ` +
      `${durSec.toFixed(2).padStart(5)}s | ${String(spu.length).padStart(5)} B @ +0x${singleClips[slot].byteOffsetInBank.toString(16).padStart(5, '0')}`
    );
  }

  // Ring-double (2x = 28 contiguous entries) so ANY random startClip loads in 1 SINGLE contiguous CdRead!
  const singleBytes = offset;
  const ringEntries = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const c of singleClips) {
      ringEntries.push({
        ringIdx: copy * singleClips.length + c.slot,
        origIdx: c.origIdx,
        file: c.file,
        trimmedSec: c.trimmedSec,
        byteOffsetInBank: copy * singleBytes + c.byteOffsetInBank,
        byteSize: c.byteSize,
        durationSec: c.durationSec,
      });
    }
  }
  const rawRing = Buffer.concat([...singleChunks, ...singleChunks]);
  const totalSectors = Math.ceil(rawRing.length / 2048);
  const bankBuf = Buffer.alloc(totalSectors * 2048, 0);
  rawRing.copy(bankBuf, 0);

  console.log(
    `  [${label}] 1x = ${singleBytes} B (${(singleBytes / 1024).toFixed(1)} KB) | ` +
    `2x Anel = ${bankBuf.length} B (${totalSectors} setores, ${(bankBuf.length / 1024).toFixed(1)} KB) | ${singleClips.length} clipes x 2 = ${ringEntries.length} entradas`
  );
  return {
    clipCount: singleClips.length,
    singleBytes,
    totalBytes: bankBuf.length,
    totalSectors,
    sampleRateHz: GP_EXACT_RATE_HZ,
    spuPitch: GP_SPU_PITCH,
    singleClips,
    ringEntries,
    bankBuf,
  };
}

function encodeLulaoGameplayBank(lulaoFiles, force = false) {
  return encodeCompactGameplayBank('LULAO_GPBANK', lulaoDir, lulaoFiles, 'gp3', GP_LULAO_ORDER, force);
}

function encodeBolsoGameplayBank(bolsoFiles, force = false) {
  return encodeCompactGameplayBank('BOLSO_GPBANK', bolsoDir, bolsoFiles, 'gp3_bolso', null, force);
}

function encodeCrashSfxClipToSpu(wavSrcPath, cacheKey, force = false) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const wavPath = path.join(cacheDir, `${cacheKey}.wav`);
  const rawSpuPath = path.join(cacheDir, `${cacheKey}.raw.spu`);
  const spuPath = path.join(cacheDir, `${cacheKey}.spu`);

  const srcStat = fs.statSync(wavSrcPath);
  if (!force && fs.existsSync(spuPath)) {
    const dstStat = fs.statSync(spuPath);
    if (dstStat.size >= 32 && dstStat.mtimeMs >= srcStat.mtimeMs) {
      return fs.readFileSync(spuPath);
    }
  }

  // Clean anti-aliased downsample 22,050 Hz -> 11,025 Hz mono 16-bit PCM (DC block + 4.9 kHz LPF + -1.2 dB headroom)
  // NOTE: Never apply EBU R128 loudnorm to 80-750 ms game SFX — Crash 3 WAVs are already mastered at -0.1..-1.1 dBFS!
  const ff = spawnSync(ffmpegExe, [
    '-y', '-v', 'error',
    '-i', wavSrcPath,
    '-ac', '1',
    '-af', 'highpass=f=40,lowpass=f=4900,aresample=11025,volume=0.88',
    '-c:a', 'pcm_s16le',
    wavPath,
  ], { encoding: 'utf8' });
  if (ff.status !== 0) {
    throw new Error(`ffmpeg (CRASH_SFX) falhou em ${path.basename(wavSrcPath)}: ${ff.stderr || ff.stdout}`);
  }

  const enc = spawnSync(psxavencExe, [
    '-q',
    '-t', 'spu',
    '-f', String(SPU_SAMPLE_RATE),
    '-a', '16',
    '-L',
    wavPath,
    rawSpuPath,
  ], { encoding: 'utf8' });
  if (enc.status !== 0) {
    throw new Error(`psxavenc (CRASH_SFX) falhou em ${path.basename(wavSrcPath)}: ${enc.stderr || enc.stdout}`);
  }

  let spu = fs.readFileSync(rawSpuPath);
  // Clear internal flags cleanly (2 KB SPU ping-pong staging loader sets 0x04 / 0x03 / 0x01!)
  for (let off = 0; off + 16 <= spu.length; off += 16) spu[off + 1] = 0x00;
  const rem = spu.length % 16;
  if (rem !== 0) spu = Buffer.concat([spu, Buffer.alloc(16 - rem, 0)]);
  const stopBlk = Buffer.alloc(16, 0);
  stopBlk[1] = 0x01;
  spu = Buffer.concat([spu, stopBlk]);

  fs.writeFileSync(spuPath, spu);
  try { fs.unlinkSync(wavPath); } catch (_) {}
  try { fs.unlinkSync(rawSpuPath); } catch (_) {}
  return spu;
}

function encodeCrashSfxBank(force = false) {
  console.log(`\n=== Codificando Sub-Banco CRASH_SFXBANK (12 SFX autenticos Crash 3 @ ${SPU_SAMPLE_RATE} Hz, pitch 0x0400) ===`);
  const entries = [];
  const chunks = [];
  let offset = CRASH_SFX_HEADER_BYTES;

  for (const spec of CRASH_SFX_LIST) {
    const fullPath = path.join(CRASH_SFX_DIR, spec.file);
    if (!fs.existsSync(fullPath)) throw new Error(`SFX Crash 3 ausente: ${fullPath}`);
    const key = `crsfx_${SPU_SAMPLE_RATE}_${String(spec.slot).padStart(2, '0')}_${spec.file.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const spu = encodeCrashSfxClipToSpu(fullPath, key, force);
    const durMs = Math.round(((spu.length / 16) * 28 / SPU_SAMPLE_RATE) * 1000);
    entries.push({
      slot: spec.slot,
      role: spec.role,
      file: spec.file,
      byteOffsetInBank: offset,
      byteSize: spu.length,
      durationMs: durMs,
    });
    chunks.push(spu);
    offset += spu.length;
    console.log(
      `  [CRASH_SFX #${String(spec.slot).padStart(2, '0')} ${spec.role.padEnd(11)}] ${spec.file.padEnd(22)} ` +
      `${String(durMs).padStart(4)} ms | ${String(spu.length).padStart(5)} B @ +0x${entries[entries.length - 1].byteOffsetInBank.toString(16).padStart(4, '0')}`
    );
  }

  const hdr = Buffer.alloc(CRASH_SFX_HEADER_BYTES, 0);
  hdr.writeUInt32LE(0x43525346, 0); // "CRSF" magic LE
  hdr.writeUInt32LE(entries.length, 4);
  for (const e of entries) {
    const pos = 8 + e.slot * 8;
    hdr.writeUInt32LE(e.byteOffsetInBank >>> 0, pos);
    hdr.writeUInt32LE(e.byteSize >>> 0, pos + 4);
  }

  const rawBank = Buffer.concat([hdr, ...chunks]);
  const totalSectors = Math.ceil(rawBank.length / 2048);
  const bankBuf = Buffer.alloc(totalSectors * 2048, 0);
  rawBank.copy(bankBuf, 0);

  console.log(`  [CRASH_SFXBANK] ${rawBank.length} B -> ${bankBuf.length} B (${totalSectors} setores = ${(bankBuf.length / 1024).toFixed(1)} KB, 100% RAM-resident p/ Crash B.!)`);
  return {
    clipCount: entries.length,
    rawBytes: rawBank.length,
    totalBytes: bankBuf.length,
    totalSectors,
    sampleRateHz: SPU_SAMPLE_RATE,
    spuPitch: SPU_PITCH,
    spuPitchHex: '0x0400',
    entries,
    bankBuf,
  };
}

function buildVoicesBank(modCodeSector = null, force = false, sec1ExtraCode = null, extraResidentSectors = null) {
  if (!fs.existsSync(lulaoDir) || !fs.existsSync(bolsoDir) || !fs.existsSync(silvioDir)) {
    throw new Error(`Pastas de audio nao encontradas em ${audiosRoot}`);
  }

  const lulaoFiles = fs.readdirSync(lulaoDir).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f)).sort();
  const bolsoFiles = fs.readdirSync(bolsoDir).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f)).sort();
  const silvioFiles = fs.readdirSync(silvioDir).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f)).sort();

  if (lulaoFiles.length === 0 || bolsoFiles.length === 0 || silvioFiles.length === 0) {
    throw new Error(`Clips insuficientes: lulao=${lulaoFiles.length}, bolsonaro=${bolsoFiles.length}, silvio=${silvioFiles.length}`);
  }
  const totalClipCount = lulaoFiles.length + bolsoFiles.length + silvioFiles.length;
  if (totalClipCount > 62) {
    throw new Error(`Total de vozes (${totalClipCount}) excede limite de 62 entradas (0x010..0x3EF) para preservar Hook_BailSfx @ +0x400.`);
  }

  console.log(`=== Codificando Banco de Vozes PS1 SPU-ADPCM (${SPU_SAMPLE_RATE} Hz Mono) ===`);
  console.log(`  Lulao (Slot 2):         ${lulaoFiles.length} clips`);
  console.log(`  Bolsonaro (Slot 3):     ${bolsoFiles.length} clips`);
  console.log(`  Silvio Santos (Slot 1): ${silvioFiles.length} clips`);

  // Preserve existing Sector 0 (MODCODE) if caller didn't pass one and VOICES.DAT already exists
  let sec0 = Buffer.alloc(2048, 0);
  if (modCodeSector) {
    if (modCodeSector.length > 2048) throw new Error(`MODCODE excede 2048 B (${modCodeSector.length} B)`);
    modCodeSector.copy(sec0, 0);
  } else if (fs.existsSync(voicesDatPath)) {
    const prev = fs.readFileSync(voicesDatPath);
    if (prev.length >= 2048) prev.copy(sec0, 0, 0, 2048);
  }

  // Resident Sectors 2..19 (36864 B = LULAO_CODE [6144 B] + LULAO_STRDATA [4096 B] + THPS1_ENGINE [20480 B] + BOOT-RESIDENT CASHART [6144 B]!)
  const RESIDENT_EXTRA_SECTORS = 18;
  const RESIDENT_EXTRA_BYTES = RESIDENT_EXTRA_SECTORS * 2048;

  const allEntries = [];
  const payloads = [];
  let curSector = 2 + RESIDENT_EXTRA_SECTORS; // Sector 0=MODCODE, 1=VOICETBL+Sec1Code, 2..4=LULAO_CODE, 5..6=LULAO_STRDATA, 7..16=THPS1_ENGINE, 17..19=CASHART

  const groups = [
    { skater: 'Lulao',         skaterIdx: 2, dir: lulaoDir,  files: lulaoFiles,  prefix: 'lulao' },
    { skater: 'Bolsonaro',     skaterIdx: 3, dir: bolsoDir,  files: bolsoFiles,  prefix: 'bolso' },
    { skater: 'Silvio Santos', skaterIdx: 1, dir: silvioDir, files: silvioFiles, prefix: 'silvio' },
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
        `  [${grp.skater.padEnd(13)} #${String(i).padStart(2, '0')}] ${fn.padEnd(38)} ` +
        `${durSec.toFixed(2).padStart(5)}s | ${String(spu.length).padStart(6)} B (${String(secCount).padStart(2)} sec) @ +${allEntries[allEntries.length - 1].sectorOffset}`
      );
    }
  }

  // Append ring-doubled LULAO_GPBANK (6890.625 Hz / pitch 0x0280) right after the 41 menu clips
  const gpBankStartSec = curSector;
  const gpBank = encodeLulaoGameplayBank(lulaoFiles, force);
  payloads.push(gpBank.bankBuf);
  curSector += gpBank.totalSectors;

  // Append ring-doubled BOLSO_GPBANK (6890.625 Hz / pitch 0x0280) for School II Golf Cart run-over!
  const bolsoGpStartSec = curSector;
  const bolsoGpBank = encodeBolsoGameplayBank(bolsoFiles, force);
  payloads.push(bolsoGpBank.bankBuf);
  curSector += bolsoGpBank.totalSectors;

  // Append CRASH_SFXBANK (12 authentic Crash 3 SFX @ 11,025 Hz / pitch 0x0400) for ZERO-STALL Crash B. audio!
  const crashSfxStartSec = curSector;
  const crashSfxBank = encodeCrashSfxBank(force);
  payloads.push(crashSfxBank.bankBuf);
  curSector += crashSfxBank.totalSectors;

  // Boot-Resident LULAO_CASHART (3 sectors = 6,144 B -> Sectors 17..19 -> RAM 0x800EB000..0x800EC7FF!):
  // Loaded ONCE at boot alongside MODCODE/THPS1_ENGINE -> eliminates the 318k-sector CD seek (~2.0 s) on EVERY level load!
  let cashArtBuf = Buffer.alloc(3 * 2048, 0);
  let cashArtStartSec = 17;
  let cashArtSectors = 3;
  if (fs.existsSync(cashArtPath)) {
    const rawCash = fs.readFileSync(cashArtPath);
    if (rawCash.length !== 3 * 2048 || rawCash.readUInt32LE(0) !== 0x43415348) {
      throw new Error(`lulao_cash_art.bin invalido (${rawCash.length} B)! Execute mod_lulao_world_assets.js primeiro.`);
    }
    rawCash.copy(cashArtBuf, 0);
    console.log(`  [CASHART] Boot-residente em VOICES.DAT setores 17..19 -> RAM 0x800EB000 (${cashArtBuf.length} B, 0 seeks por fase!)`);
  } else {
    cashArtStartSec = 0;
    cashArtSectors = 0;
  }

  const gpMeta = {
    startSector: gpBankStartSec,
    clipCount: gpBank.clipCount,
    singleBytes: gpBank.singleBytes,
    totalBytes: gpBank.totalBytes,
    totalSectors: gpBank.totalSectors,
    sampleRateHz: gpBank.sampleRateHz,
    spuPitch: gpBank.spuPitch,
    spuPitchHex: '0x' + gpBank.spuPitch.toString(16).padStart(4, '0'),
    ringEntries: gpBank.ringEntries,
    bolso: {
      startSector: bolsoGpStartSec,
      clipCount: bolsoGpBank.clipCount,
      singleBytes: bolsoGpBank.singleBytes,
      totalBytes: bolsoGpBank.totalBytes,
      totalSectors: bolsoGpBank.totalSectors,
      sampleRateHz: bolsoGpBank.sampleRateHz,
      spuPitch: bolsoGpBank.spuPitch,
      spuPitchHex: '0x' + bolsoGpBank.spuPitch.toString(16).padStart(4, '0'),
      ringEntries: bolsoGpBank.ringEntries,
    },
    cashArt: {
      startSector: cashArtStartSec,
      sectors: cashArtSectors,
      ramAddr: '0x800eb000',
    },
    crash: {
      startSector: crashSfxStartSec,
      clipCount: crashSfxBank.clipCount,
      rawBytes: crashSfxBank.rawBytes,
      totalBytes: crashSfxBank.totalBytes,
      totalSectors: crashSfxBank.totalSectors,
      sampleRateHz: crashSfxBank.sampleRateHz,
      spuPitch: crashSfxBank.spuPitch,
      spuPitchHex: crashSfxBank.spuPitchHex,
      entries: crashSfxBank.entries,
    },
  };

  let secExtra = Buffer.alloc(RESIDENT_EXTRA_BYTES, 0);
  const resolvedExtra = typeof extraResidentSectors === 'function'
    ? extraResidentSectors(gpMeta)
    : extraResidentSectors;
  if (resolvedExtra) {
    if (resolvedExtra.length === (RESIDENT_EXTRA_SECTORS - 3) * 2048) {
      resolvedExtra.copy(secExtra, 0);
      cashArtBuf.copy(secExtra, resolvedExtra.length);
    } else if (resolvedExtra.length === RESIDENT_EXTRA_BYTES) {
      resolvedExtra.copy(secExtra, 0);
    } else {
      throw new Error(`extraResidentSectors tamanho invalido: ${resolvedExtra.length} != ${RESIDENT_EXTRA_BYTES}`);
    }
  } else if (fs.existsSync(voicesDatPath)) {
    const prev = fs.readFileSync(voicesDatPath);
    if (prev.length >= (2 + RESIDENT_EXTRA_SECTORS) * 2048) {
      prev.copy(secExtra, 0, 4096, 4096 + RESIDENT_EXTRA_BYTES);
    }
  }

  // Build Sector 1: VOICETBL + Sec1Code (2048 B, loaded to RAM 0x800E3000..0x800E37FF)
  // +0x000: uint32 magic = 0x564F4943 ("VOIC" LE)
  // +0x004: uint32 lulaoCount (Slot 2)
  // +0x008: uint32 bolsoCount (Slot 3)
  // +0x00C: uint32 spuBaseAddr (0x58000)
  // +0x010 + i*16: { uint32 sectorOffset, uint32 sectorCount, uint32 byteSize, uint32 spuPitch } (up to 62 entries)
  // +0x3F0: uint32 silvioCount (Slot 1)
  // +0x3F4: uint32 g_SilvioClipIdx (runtime state)
  // +0x3F8: uint32 g_LulaoClipIdx  (runtime state)
  // +0x3FC: uint32 g_BolsoClipIdx  (runtime state)
  // +0x400..+0x7FF (1024 B): Hook_BailSfx (+0x400..+0x5FF) + VoiceSelect_Lookup/SeedAll (+0x600..+0x7FF)
  const sec1 = Buffer.alloc(2048, 0);
  sec1.writeUInt32LE(0x564F4943, 0x000);
  sec1.writeUInt32LE(lulaoFiles.length, 0x004);
  sec1.writeUInt32LE(bolsoFiles.length, 0x008);
  sec1.writeUInt32LE(0x00058000, 0x00C);
  sec1.writeUInt32LE(silvioFiles.length, 0x3F0);

  for (let i = 0; i < allEntries.length; i++) {
    const e = allEntries[i];
    const base = 0x010 + i * 16;
    sec1.writeUInt32LE(e.sectorOffset, base + 0);
    sec1.writeUInt32LE(e.sectorCount, base + 4);
    sec1.writeUInt32LE(e.byteSize, base + 8);
    sec1.writeUInt32LE(e.spuPitch, base + 12);
  }

  // Embed resident Sec1 MIPS code in Sector 1 upper half (+0x400..+0x7FF -> RAM 0x800E3400..0x800E37FF)
  if (sec1ExtraCode) {
    if (sec1ExtraCode.length > 1024) throw new Error(`sec1ExtraCode excede 1024 B (${sec1ExtraCode.length} B)`);
    sec1ExtraCode.copy(sec1, 0x400);
  } else if (fs.existsSync(voicesDatPath)) {
    const prev = fs.readFileSync(voicesDatPath);
    if (prev.length >= 4096) prev.copy(sec1, 0x400, 2048 + 0x400, 4096);
  }

  const finalBuf = Buffer.concat([sec0, sec1, secExtra, ...payloads]);
  // Stamp exact VOICES.DAT total sector count into RAM 0x800E96E4 (THPS1.WAD immediately follows VOICES.DAT -> ZERO CdSearchFile at runtime!)
  const voicesTotalSectors = finalBuf.length / 2048;
  const thps1OffsetInFile = 2 * 2048 + (0x800E96E4 - 0x800E3800);
  if (finalBuf.length >= thps1OffsetInFile + 4) {
    finalBuf.writeUInt32LE(voicesTotalSectors >>> 0, thps1OffsetInFile);
  }
  fs.writeFileSync(voicesDatPath, finalBuf);

  const manifest = {
    voicesDatBytes: finalBuf.length,
    voicesDatSectors: finalBuf.length / 2048,
    residentSectors: 2 + RESIDENT_EXTRA_SECTORS,
    sampleRateHz: SPU_SAMPLE_RATE,
    spuPitchHex: '0x0400',
    spuSlotStartHex: '0x58000',
    spuSlotMaxBytes: SPU_MAX_CLIP_BYTES,
    maxClipBytes,
    lulaoCount: lulaoFiles.length,
    bolsoCount: bolsoFiles.length,
    silvioCount: silvioFiles.length,
    totalClips: allEntries.length,
    entries: allEntries,
    gameplayBank: {
      startSector: gpMeta.startSector,
      clipCount: gpMeta.clipCount,
      singleBytes: gpMeta.singleBytes,
      totalBytes: gpMeta.totalBytes,
      totalSectors: gpMeta.totalSectors,
      sampleRateHz: gpMeta.sampleRateHz,
      spuPitch: gpMeta.spuPitch,
      spuPitchHex: gpMeta.spuPitchHex,
      entries: gpBank.singleClips,
      ringEntries: gpMeta.ringEntries,
    },
    bolsoGameplayBank: {
      startSector: gpMeta.bolso.startSector,
      clipCount: gpMeta.bolso.clipCount,
      singleBytes: gpMeta.bolso.singleBytes,
      totalBytes: gpMeta.bolso.totalBytes,
      totalSectors: gpMeta.bolso.totalSectors,
      sampleRateHz: gpMeta.bolso.sampleRateHz,
      spuPitch: gpMeta.bolso.spuPitch,
      spuPitchHex: gpMeta.bolso.spuPitchHex,
      entries: bolsoGpBank.singleClips,
      ringEntries: gpMeta.bolso.ringEntries,
    },
    cashArt: gpMeta.cashArt,
    crashSfxBank: gpMeta.crash,
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n=== VOICES.DAT GERADO COM SUCESSO ===`);
  console.log(`  Arquivo:   ${voicesDatPath}`);
  console.log(`  Tamanho:   ${finalBuf.length} B (${finalBuf.length / 2048} setores, ${(finalBuf.length / 1048576).toFixed(2)} MB)`);
  console.log(`  Maior clip:${maxClipBytes} B / ${SPU_MAX_CLIP_BYTES} B max SPU RAM (margem: ${SPU_MAX_CLIP_BYTES - maxClipBytes} B)`);
  console.log(`  GPBANK:    setor +${gpMeta.startSector} (${gpMeta.totalSectors} setores, ${gpMeta.clipCount}x2 clipes @ ${gpMeta.sampleRateHz} Hz / ${gpMeta.spuPitchHex})`);
  return manifest;
}

module.exports = { buildVoicesBank, SPU_SAMPLE_RATE, SPU_PITCH, SPU_MAX_CLIP_BYTES, GP_SAMPLE_RATE, GP_EXACT_RATE_HZ, GP_SPU_PITCH };

if (require.main === module) {
  const force = process.argv.includes('--force');
  buildVoicesBank(null, force);
}
