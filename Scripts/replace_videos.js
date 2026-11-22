#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 Surgical Video Replacement Pipeline
 *
 * - Automatically backs up original .STR files to originals_backup/ before touching anything
 * - Reads exact original STR technical parameters (sector count, byte size, XA sample rate,
 *   mono/stereo, CD-XA file/channel numbers, audio interleave interval)
 * - Uses ffmpeg to pre-process each user video (aspect-ratio-preserving 320x240 letterbox/pillarbox,
 *   exact 15.00 fps, exact target duration with smooth fade-out, clean audio normalization)
 * - Encodes with psxavenc (-t str -v v2 -s 320x240 -r 15 -x 2 -F 1 -C 1 -b 4 -X)
 * - Pads/trims to the EXACT sector count and byte size of each original .STR file!
 * - Outputs BOTH the exact-size RIFF-CDXA .STR in the game folder AND the 2336B raw file for mkpsxiso
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  inspectFile,
  normalizeRaw2336Sectors,
  raw2336ToRiffCdxa,
} = require('./psx_media');

const rootDir = path.resolve(__dirname, '..');
const videosDir = path.join(rootDir, 'videos');
const backupDir = path.join(rootDir, 'originals_backup');
const stagingRawDir = path.join(rootDir, 'build', 'staging_raw');
const tempDir = path.join(rootDir, 'build', '_vid_tmp');

const ffmpegExe = path.join(rootDir, 'tools', 'bin', 'ffmpeg', 'ffmpeg-9.1-essentials_build', 'bin', 'ffmpeg.exe');
const psxavencExe = path.join(rootDir, 'tools', 'bin', 'psxavenc', 'bin', 'psxavenc.exe');

// Surgical mapping of all 15 user videos -> all 20 game videos (INTRO.STR + all 19 X\*.STR)
// Note: zueira.wmv has 2 video streams (v:0 = mjpeg thumbnail, v:1 = real 640x480 wmv3 video, 21m20s)
const VIDEO_MAP = [
  // Opening Intro (99.36s, 1486 frames, 37800Hz Stereo)
  {
    target: 'INTRO.STR',
    character: 'Intro do Jogo',
    source: 'The Calling Wherever Will You Go (Melhor cover).mp4',
    startSec: 0,
    slusFrames: 1486,
  },
  // 13 Pro Skaters (incl. custom PT-BR roster names in SLUS_010.66!)
  {
    target: 'X\\HAWK.STR',
    character: 'Tony Hawk',
    source: 'Funny Blink 182 Stay Together For The Kids.mp4',
    startSec: 0,
    slusFrames: 634,
  },
  {
    target: 'X\\BURNQUIS.STR',
    character: 'Bob Burnquist',
    source: 'Funny Three Doors Down Here without you.mp4',
    startSec: 0,
    slusFrames: 598,
  },
  {
    target: 'X\\CABALLER.STR',
    character: 'Steve Caballero',
    source: 'Flaute by Francis Naruto.mp4',
    startSec: 0,
    slusFrames: 606,
  },
  {
    target: 'X\\CAMPBELL.STR',
    character: 'Kareem Campbell',
    source: 'Naruto cover by Francis Flaute.mp4',
    startSec: 0,
    slusFrames: 644,
  },
  {
    target: 'X\\GLIFBERG.STR',
    character: 'Wagner Oliver (Glifberg)',
    source: 'Taking a Shower of his underwear 2 by Gner.mp4',
    startSec: 0,
    slusFrames: 627,
  },
  {
    target: 'X\\KOSTON.STR',
    character: 'Eric Koston',
    source: 'Naruto Shippuden Diver Opening 8 by Francis.mp4',
    startSec: 0,
    slusFrames: 629,
  },
  {
    target: 'X\\LASEK.STR',
    character: 'Bucky Lasek',
    source: 'Funny momment by Francis.mp4',
    startSec: 0,
    loopIfShorter: true, // 34.3s source -> 43.73s target
    slusFrames: 652,
  },
  {
    target: 'X\\MULLEN.STR',
    character: 'Francis Paulo (Mullen)',
    source: 'Francis Made in Japan.mp4',
    startSec: 0,
    slusFrames: 645,
  },
  {
    target: 'X\\MUSKA.STR',
    character: 'Joao Paulo / Borsato (Muska)',
    source: 'Taking a shower of his underwear By Francis.mp4',
    startSec: 0,
    slusFrames: 623,
  },
  {
    target: 'X\\REYNOLDS.STR',
    character: 'Andrew Reynolds',
    source: 'zueira.wmv',
    startSec: 10,
    vStream: '0:v:1',
    slusFrames: 623,
  },
  {
    target: 'X\\ROWLEY.STR',
    character: 'Natan Oliver (Rowley)',
    source: 'Loko em casa sozinho.mp4',
    startSec: 0,
    slusFrames: 611,
  },
  {
    target: 'X\\STEAMER.STR',
    character: 'Elissa Steamer',
    source: 'Unboxing Flaute by Francis.mp4',
    startSec: 0,
    slusFrames: 514,
  },
  {
    target: 'X\\THOMAS.STR',
    character: 'Joao Paulo / Jamie Thomas',
    source: 'The Calling Wherever Will You Go (versao cuequinha).mp4',
    startSec: 0,
    slusFrames: 622,
  },
  // Custom Skater + Bails + Secret Unlockable Characters (OD, PC, SM, MS)
  {
    target: 'X\\BAILS01.STR',
    character: 'Custom Skater (Bails 01)',
    source: 'zueira.wmv',
    startSec: 120,
    vStream: '0:v:1',
    slusFrames: 637,
  },
  {
    target: 'X\\BAILS02.STR',
    character: 'Bails (Bails 02)',
    source: 'zueira.wmv',
    startSec: 240,
    vStream: '0:v:1',
    slusFrames: 685,
  },
  {
    target: 'X\\OD.STR',
    character: 'Gordao / Officer Dick',
    source: 'A-melhor-Luta-de-2016_720p.mp4',
    startSec: 0,
    slusFrames: 859,
  },
  {
    target: 'X\\PC.STR',
    character: 'Private Carrera',
    source: 'zueira.wmv',
    startSec: 400,
    vStream: '0:v:1',
    slusFrames: 1144,
  },
  {
    target: 'X\\SM.STR',
    character: 'Spider-Man',
    source: 'zueira.wmv',
    startSec: 600,
    vStream: '0:v:1',
    slusFrames: 1236,
  },
  {
    target: 'X\\MS.STR',
    character: "80's Tony (McSqueeb)",
    source: 'zueira.wmv',
    startSec: 840,
    vStream: '0:v:1',
    slusFrames: 821,
  },
];

function ensureBackup(rel) {
  const orig = path.join(rootDir, rel);
  const bak = path.join(backupDir, rel);
  if (!fs.existsSync(bak)) {
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.copyFileSync(orig, bak);
    console.log(`  [backup] ${rel} -> originals_backup\\${rel}`);
  }
  return bak;
}

function convertOne(entry) {
  const bakPath = ensureBackup(entry.target);
  const origInfo = inspectFile(bakPath);
  const srcPath = path.join(videosDir, entry.source);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Video fonte nao encontrado: ${srcPath}`);
  }

  const isStereo378 = origInfo.audCod === 0x01;
  const sampleRate = isStereo378 ? 37800 : 18900;
  const channels = isStereo378 ? 2 : 1;
  const audInterval = isStereo378 ? 8 : 32;
  const fn = origInfo.fn >= 0 ? origInfo.fn : 1;
  const ch = origInfo.ch >= 0 ? origInfo.ch : 1;

  // Target exact frames = slusFrames + 4 (matches original THPS2 margin of +4 frames over SLUS table)
  // Using +6 input frames so psxavenc outputs >= slusFrames+2 frames while fitting cleanly in origInfo.sectors
  const maxFramesForSectors = Math.floor(origInfo.sectors / 10);
  const targetFrames = Math.min(entry.slusFrames + 6, maxFramesForSectors);
  const targetDurationSec = (targetFrames / 15.0).toFixed(4);
  const fadeOutStart = Math.max(0, ((entry.slusFrames - 12) / 15.0)).toFixed(3);

  fs.mkdirSync(tempDir, { recursive: true });
  const safeBase = entry.target.replace(/[\\\/.]/g, '_');
  const prepFile = path.join(tempDir, `${safeBase}_prep.mkv`);
  const encRawFile = path.join(tempDir, `${safeBase}_enc.raw2336`);
  const finalRawFile = path.join(stagingRawDir, entry.target);
  const finalGameFile = path.join(rootDir, entry.target);

  console.log(`\n>>> [${entry.target}] (${entry.character})`);
  console.log(`    Fonte : ${entry.source} (inicio=${entry.startSec}s)`);
  console.log(`    Alvo  : ${origInfo.size} B (${origInfo.sectors} setores) | ${origInfo.vidW}x${origInfo.vidH} @ 15fps (${targetFrames}f / ${targetDurationSec}s) | XA ${sampleRate}Hz ${channels===2?'Stereo':'Mono'} F=${fn} C=${ch}`);

  // Step 1: ffmpeg pre-process (exact 320x240 aspect-preserving, 15fps, PCM audio, exact duration)
  const ffArgs = ['-y', '-loglevel', 'error'];
  if (entry.loopIfShorter) {
    ffArgs.push('-stream_loop', '-1');
  }
  if (entry.startSec > 0) {
    ffArgs.push('-ss', String(entry.startSec));
  }
  ffArgs.push('-i', srcPath);
  if (entry.vStream) {
    ffArgs.push('-map', entry.vStream, '-map', '0:a:0');
  } else {
    ffArgs.push('-map', '0:v:0', '-map', '0:a:0');
  }
  const vf = [
    `scale=${origInfo.vidW}:${origInfo.vidH}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${origInfo.vidW}:${origInfo.vidH}:(ow-iw)/2:(oh-ih)/2:black`,
    'fps=15',
    'format=yuv420p',
    `fade=t=out:st=${fadeOutStart}:d=0.7`
  ].join(',');
  const af = `aresample=${sampleRate},afade=t=out:st=${fadeOutStart}:d=0.7`;

  ffArgs.push(
    '-t', String(targetDurationSec),
    '-vf', vf,
    '-af', af,
    '-c:v', 'libx264', '-crf', '14', '-preset', 'ultrafast',
    '-c:a', 'pcm_s16le', '-ar', String(sampleRate), '-ac', String(channels),
    prepFile
  );

  const r1 = spawnSync(ffmpegExe, ffArgs, { stdio: 'inherit' });
  if (r1.status !== 0) throw new Error(`ffmpeg falhou (${r1.status}) em ${entry.target}`);

  // Step 2: psxavenc encode to 2336B raw Mode 2 Form 2 STR
  const avArgs = [
    '-q',
    '-t', 'str',
    '-v', 'v2',
    '-s', `${origInfo.vidW}x${origInfo.vidH}`,
    '-r', '15',
    '-x', '2',
    '-f', String(sampleRate),
    '-c', String(channels),
    '-b', '4',
    '-F', String(fn),
    '-C', String(ch),
    '-X',
    prepFile,
    encRawFile,
  ];
  const r2 = spawnSync(psxavencExe, avArgs, { stdio: 'inherit' });
  if (r2.status !== 0) throw new Error(`psxavenc falhou (${r2.status}) em ${entry.target}`);

  // Step 3: Normalize to EXACT sector count of original STR (2336B raw for mkpsxiso)
  const norm = normalizeRaw2336Sectors(encRawFile, finalRawFile, origInfo.sectors, {
    fn, ch, coding: origInfo.audCod, audInterval
  });

  // Step 4: Wrap into EXACT original byte-size RIFF-CDXA .STR in game folder
  const riff = raw2336ToRiffCdxa(finalRawFile, finalGameFile);

  // Cleanup temp intermediate files
  try { fs.unlinkSync(prepFile); } catch {}
  try { fs.unlinkSync(encRawFile); } catch {}

  // Strict forensic verification
  const newInfo = inspectFile(finalGameFile);
  if (newInfo.size !== origInfo.size) {
    throw new Error(`TAMANHO DIVERGENTE em ${entry.target}: orig=${origInfo.size} vs novo=${newInfo.size}`);
  }
  if (newInfo.maxFrame < entry.slusFrames) {
    throw new Error(`FRAMES INSUFICIENTES em ${entry.target}: encoded=${newInfo.maxFrame} < slus=${entry.slusFrames}`);
  }
  console.log(`    [OK] Encoded=${norm.srcSectors} sec -> Padded/Exact=${norm.targetSectors} sec | Bytes=${newInfo.size} (EXACT MATCH!) | ${newInfo.vidW}x${newInfo.vidH} v${newInfo.mdecVer} frames=${newInfo.maxFrame} (SLUS=${entry.slusFrames}) F=${newInfo.fn} C=${newInfo.ch} cod=0x${newInfo.audCod.toString(16)}`);
  return {
    target: entry.target,
    character: entry.character,
    source: entry.source,
    origBytes: origInfo.size,
    newBytes: newInfo.size,
    sectors: origInfo.sectors,
    encodedSectors: norm.srcSectors,
    slusFrames: entry.slusFrames,
    encodedFrames: newInfo.maxFrame,
    audio: `${sampleRate}Hz ${channels===2?'Stereo':'Mono'}`,
  };
}

// --- CLI ---
const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const onlyTarget = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const restoreMode = args.includes('--restore');

if (restoreMode) {
  for (const e of VIDEO_MAP) {
    const bak = path.join(backupDir, e.target);
    const dst = path.join(rootDir, e.target);
    if (fs.existsSync(bak)) {
      fs.copyFileSync(bak, dst);
      console.log(`Restaurado: ${e.target}`);
    }
  }
  process.exit(0);
}

const list = onlyTarget
  ? VIDEO_MAP.filter(e => e.target.toLowerCase() === onlyTarget.toLowerCase())
  : VIDEO_MAP;

if (list.length === 0) {
  console.error('Nenhum alvo encontrado para:', onlyTarget);
  process.exit(1);
}

const t0 = Date.now();
const results = [];
for (const entry of list) {
  results.push(convertOne(entry));
}
try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n========================================`);
console.log(`CONCLUIDO: ${results.length}/${list.length} videos convertidos em ${dt}s (100% tamanho exato!)`);
console.log(`========================================`);
