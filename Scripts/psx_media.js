#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 Media Tool: RIFF-CDXA <-> Raw 2336B Mode 2 Form 2 Converter & mkpsxiso XML Generator
 */

const fs = require('fs');
const path = require('path');

const SYNC_BYTES = Buffer.from([0x00,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0x00]);
const toBcd = n => (((Math.floor(n / 10) % 10) << 4) | (n % 10)) & 0xFF;

function buildRiffCdxaHeader(dataByteLen) {
  const hdr = Buffer.alloc(44, 0);
  hdr.write('RIFF', 0, 'ascii');
  hdr.writeUInt32LE(dataByteLen + 36, 4);
  hdr.write('CDXAfmt ', 8, 'ascii');
  hdr.writeUInt32LE(16, 16);
  // Standard CDXA fmt payload (matches original THPS2 RIFF headers)
  Buffer.from('000000003d5558410100000000000000', 'hex').copy(hdr, 20);
  hdr.write('data', 36, 'ascii');
  hdr.writeUInt32LE(dataByteLen, 40);
  return hdr;
}

function detectFormat(filePath) {
  const sz = fs.statSync(filePath).size;
  const fd = fs.openSync(filePath, 'r');
  const head = Buffer.alloc(Math.min(64, sz));
  fs.readSync(fd, head, 0, head.length, 0);
  fs.closeSync(fd);
  if (head.length >= 44 && head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'CDXA') {
    return { format: 'RIFF_CDXA_2352', headerBytes: 44, sectorSize: 2352, sectors: Math.floor((sz - 44) / 2352), size: sz };
  }
  if (head.length >= 16 && head.subarray(0, 12).equals(SYNC_BYTES) && sz % 2352 === 0) {
    return { format: 'RAW_2352', headerBytes: 0, sectorSize: 2352, sectors: sz / 2352, size: sz };
  }
  if (head.length >= 4 && head.readUInt16LE(0) === 0x0160 && head.readUInt16LE(2) === 0x8001 && sz % 2048 === 0) {
    return { format: 'COOKED_MDEC_2048', headerBytes: 0, sectorSize: 2048, sectors: sz / 2048, size: sz };
  }
  if (sz % 2336 === 0) {
    return { format: 'RAW_2336', headerBytes: 0, sectorSize: 2336, sectors: sz / 2336, size: sz };
  }
  return { format: 'UNKNOWN', headerBytes: 0, sectorSize: 0, sectors: 0, size: sz };
}

function riffOr2352ToRaw2336(inPath, outPath) {
  const info = detectFormat(inPath);
  if (info.format === 'RAW_2336') {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.copyFileSync(inPath, outPath);
    return info.sectors;
  }
  if (info.format !== 'RIFF_CDXA_2352' && info.format !== 'RAW_2352') {
    throw new Error(`Formato nao suportado para conversao 2336B: ${inPath} (${info.format})`);
  }
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  const inFd = fs.openSync(inPath, 'r');
  const outFd = fs.openSync(outPath, 'w');
  const BATCH = 512;
  const inBuf = Buffer.alloc(BATCH * 2352);
  const outBuf = Buffer.alloc(BATCH * 2336);
  let pos = info.headerBytes;
  let remaining = info.sectors;
  while (remaining > 0) {
    const n = Math.min(BATCH, remaining);
    fs.readSync(inFd, inBuf, 0, n * 2352, pos);
    for (let i = 0; i < n; i++) {
      // Strip 12B sync + 4B header (MSF+mode), keep 2336B (8B subheader + 2328B data/ECC/EDC)
      inBuf.copy(outBuf, i * 2336, i * 2352 + 16, (i + 1) * 2352);
    }
    fs.writeSync(outFd, outBuf, 0, n * 2336);
    pos += n * 2352;
    remaining -= n;
  }
  fs.closeSync(inFd);
  fs.closeSync(outFd);
  return info.sectors;
}

/**
 * Pads or trims a raw 2336B Mode 2 STR stream to an exact target sector count,
 * preserving valid XA audio cadence (silent XA sector on audio slots) and null padding on video slots.
 */
function normalizeRaw2336Sectors(raw2336Path, out2336Path, targetSectors, opts = {}) {
  const fn = opts.fn ?? 1;
  const ch = opts.ch ?? 1;
  const coding = opts.coding ?? 0x04; // 0x01 = 37800Hz stereo, 0x04 = 18900Hz mono
  const audInterval = opts.audInterval ?? (coding === 0x01 ? 8 : 32);

  const src = fs.readFileSync(raw2336Path);
  if (src.length % 2336 !== 0) {
    throw new Error(`${raw2336Path} nao e multiplo de 2336 bytes (${src.length})`);
  }
  const srcSectors = src.length / 2336;
  const out = Buffer.alloc(targetSectors * 2336, 0);

  const copySectors = Math.min(srcSectors, targetSectors);
  src.copy(out, 0, 0, copySectors * 2336);

  // If padding is needed, fill remaining sectors with valid empty video sectors & silent XA audio sectors
  if (targetSectors > srcSectors) {
    // Prepare silent XA audio sector template (submode=0x64 realtime+audio+form2, coding=coding)
    const silentAud = Buffer.alloc(2336, 0);
    silentAud[0] = fn; silentAud[1] = ch; silentAud[2] = 0x64; silentAud[3] = coding;
    silentAud[4] = fn; silentAud[5] = ch; silentAud[6] = 0x64; silentAud[7] = coding;
    // Standard PSX XA-ADPCM silent sound groups (18 groups * 128 bytes = 2304 bytes, filter=0x0C)
    for (let g = 0; g < 18; g++) {
      const base = 8 + g * 128;
      silentAud.fill(0x0C, base, base + 16);
    }

    // Prepare empty non-video padding sector (matches original THPS2 trailing sectors: fn=1, ch=0, sm=0, cd=0)
    const emptyPad = Buffer.alloc(2336, 0);
    emptyPad[0] = fn; emptyPad[1] = 0; emptyPad[2] = 0x00; emptyPad[3] = 0x00;
    emptyPad[4] = fn; emptyPad[5] = 0; emptyPad[6] = 0x00; emptyPad[7] = 0x00;

    for (let s = srcSectors; s < targetSectors; s++) {
      if ((s + 1) % audInterval === 0) {
        silentAud.copy(out, s * 2336);
      } else {
        emptyPad.copy(out, s * 2336);
      }
    }
  }

  // Clear any premature mid-stream 0x80 EOF submode flag injected by psxavenc on non-final sectors
  // (matches original Neversoft THPS2 STR files which keep submode 0x64/0x48 without mid-stream EOF!)
  for (let s = 0; s < targetSectors - 1; s++) {
    const base = s * 2336;
    if (out[base + 2] & 0x80) {
      out[base + 2] &= 0x7F;
      out[base + 6] = out[base + 2];
    }
  }

  fs.mkdirSync(path.dirname(path.resolve(out2336Path)), { recursive: true });
  fs.writeFileSync(out2336Path, out);
  return { srcSectors, targetSectors };
}

function raw2336ToRiffCdxa(in2336Path, outRiffPath, startLba = 150) {
  const src = fs.readFileSync(in2336Path);
  if (src.length % 2336 !== 0) {
    throw new Error(`Entrada nao e multiplo de 2336 bytes: ${in2336Path}`);
  }
  const nsec = src.length / 2336;
  fs.mkdirSync(path.dirname(path.resolve(outRiffPath)), { recursive: true });
  const fd = fs.openSync(outRiffPath, 'w');
  fs.writeSync(fd, buildRiffCdxaHeader(nsec * 2352));

  const BATCH = 512;
  const outBuf = Buffer.alloc(BATCH * 2352);
  let idx = 0;
  while (idx < nsec) {
    const n = Math.min(BATCH, nsec - idx);
    for (let i = 0; i < n; i++) {
      const s = idx + i;
      const dst = i * 2352;
      SYNC_BYTES.copy(outBuf, dst);
      const lba = startLba + s;
      const frames = lba % 75;
      const totalSec = Math.floor(lba / 75);
      const secs = totalSec % 60;
      const mins = Math.floor(totalSec / 60);
      outBuf[dst + 12] = toBcd(mins);
      outBuf[dst + 13] = toBcd(secs);
      outBuf[dst + 14] = toBcd(frames);
      outBuf[dst + 15] = 0x02; // Mode 2
      src.copy(outBuf, dst + 16, s * 2336, (s + 1) * 2336);
    }
    fs.writeSync(fd, outBuf, 0, n * 2352);
    idx += n;
  }
  fs.closeSync(fd);
  return { sectors: nsec, bytes: 44 + nsec * 2352 };
}

function inspectFile(filePath) {
  const info = detectFormat(filePath);
  const fd = fs.openSync(filePath, 'r');
  let vidW = 0, vidH = 0, mdecVer = 0, maxFrame = 0, fn = -1, ch = -1, audCod = -1, audInt = 0;
  if (info.format === 'RIFF_CDXA_2352' || info.format === 'RAW_2352' || info.format === 'RAW_2336') {
    const subOff = info.sectorSize === 2352 ? 16 : 0;
    const dataOff = info.sectorSize === 2352 ? 24 : 8;
    const sec = Buffer.alloc(info.sectorSize);
    let firstAud = -1;
    for (let s = 0; s < Math.min(info.sectors, 128); s++) {
      fs.readSync(fd, sec, 0, info.sectorSize, info.headerBytes + s * info.sectorSize);
      const sm = sec[subOff + 2];
      if (sm & 0x04) {
        if (firstAud < 0) { firstAud = s; fn = sec[subOff]; ch = sec[subOff + 1]; audCod = sec[subOff + 3]; }
        else if (audInt === 0) audInt = s - firstAud;
      } else if (vidW === 0 && sec.readUInt16LE(dataOff) === 0x0160 && sec.readUInt16LE(dataOff + 2) === 0x8001) {
        vidW = sec.readUInt16LE(dataOff + 16);
        vidH = sec.readUInt16LE(dataOff + 18);
        mdecVer = sec.readUInt16LE(dataOff + 26);
      }
    }
    for (let s = Math.max(0, info.sectors - 256); s < info.sectors; s++) {
      fs.readSync(fd, sec, 0, info.sectorSize, info.headerBytes + s * info.sectorSize);
      if (!(sec[subOff + 2] & 0x04) && sec.readUInt16LE(dataOff) === 0x0160 && sec.readUInt16LE(dataOff + 2) === 0x8001) {
        const f = sec.readUInt32LE(dataOff + 8);
        if (f > maxFrame) maxFrame = f;
      }
    }
  } else if (info.format === 'COOKED_MDEC_2048') {
    const sec = Buffer.alloc(2048);
    fs.readSync(fd, sec, 0, 2048, 0);
    vidW = sec.readUInt16LE(16); vidH = sec.readUInt16LE(18); mdecVer = sec.readUInt16LE(26);
    fs.readSync(fd, sec, 0, 2048, (info.sectors - 1) * 2048);
    maxFrame = sec.readUInt32LE(8);
  }
  fs.closeSync(fd);
  return { ...info, vidW, vidH, mdecVer, maxFrame, fn, ch, audCod, audInt };
}

function extractLicenseFromOriginalBin(origBinPath, outLicensePath) {
  const fd = fs.openSync(origBinPath, 'r');
  const licBuf = Buffer.alloc(16 * 2336);
  const sec2352 = Buffer.alloc(2352);
  for (let s = 0; s < 16; s++) {
    fs.readSync(fd, sec2352, 0, 2352, s * 2352);
    sec2352.copy(licBuf, s * 2336, 16, 2352);
  }
  fs.closeSync(fd);
  fs.mkdirSync(path.dirname(path.resolve(outLicensePath)), { recursive: true });
  fs.writeFileSync(outLicensePath, licBuf);
  return outLicensePath;
}

function generateMkpsxisoXml(rootDir, stagingRawDir, outXmlPath, outBinPath, outCuePath, licensePath = null) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const rawRef = rel => esc(path.resolve(stagingRawDir, rel));
  const dataRef = rel => esc(path.resolve(rootDir, rel));

  // Exact original Redump NTSC-U (SLUS-01066) disc LBA order!
  // Keeping identical file order preserves exact LBAs for all unmodified files (tiny, fast xdelta3 patches!).
  const bmxOrder = [
    'X.EXE', 'BOOT.BIN', 'FRONT.BIN', 'FE.WAD', 'FE.STR',
    'GAME.BIN', 'BMXCD.HED', 'BMXCD.WAD', 'EXIT.BIN', 'EDITOR.BIN'
  ];
  const xOrder = [
    'OD.STR', 'BAILS02.STR', 'BURNQUIS.STR', 'CABALLER.STR', 'CAMPBELL.STR',
    'GLIFBERG.STR', 'HAWK.STR', 'KOSTON.STR', 'LASEK.STR', 'MS.STR',
    'MULLEN.STR', 'MUSKA.STR', 'BAILS01.STR', 'PC.STR', 'REYNOLDS.STR',
    'ROWLEY.STR', 'SM.STR', 'STEAMER.STR', 'THOMAS.STR'
  ];

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<iso_project image_name="${esc(path.resolve(outBinPath))}" cue_sheet="${esc(path.resolve(outCuePath))}">`,
    '  <track type="data" cdvd_style="false">',
    '    <identifiers',
    '      system="PLAYSTATION"',
    '      application="PLAYSTATION"',
    '      volume=""',
    '      volume_set=""',
    '      publisher=""',
    '      data_preparer=""',
    '      copyright=""',
    '    />',
  ];

  if (licensePath && fs.existsSync(licensePath)) {
    lines.push(`    <license file="${esc(path.resolve(licensePath))}"/>`);
  }

  lines.push(
    '    <directory_tree>',
    `      <file name="SYSTEM.CNF" type="data" source="${dataRef('SYSTEM.CNF')}"/>`,
    `      <file name="SLUS_010.66" type="data" source="${dataRef('SLUS_010.66')}"/>`,
    `      <file name="CD.HED" type="data" source="${dataRef('CD.HED')}"/>`,
    `      <file name="CD.WAD" type="data" source="${dataRef('CD.WAD')}"/>`,
    '      <dir name="BMX">',
    ...bmxOrder.map(f => `        <file name="${f}" type="data" source="${dataRef(path.join('BMX', f))}"/>`),
    '      </dir>',
    `      <file name="EDITOR.STR" type="data" source="${dataRef('EDITOR.STR')}"/>`,
    `      <file name="B1.STR" type="data" source="${dataRef('B1.STR')}"/>`,
    `      <file name="BULLRING.STR" type="data" source="${dataRef('BULLRING.STR')}"/>`,
    `      <file name="COMPILED.XA" type="xa" source="${rawRef('COMPILED.XA')}"/>`,
    `      <file name="ATVILOGO.STR" type="str" source="${rawRef('ATVILOGO.STR')}"/>`,
    `      <file name="HANGAR.STR" type="data" source="${dataRef('HANGAR.STR')}"/>`,
    `      <file name="HEAVEN.STR" type="data" source="${dataRef('HEAVEN.STR')}"/>`,
    `      <file name="LOGO.STR" type="str" source="${rawRef('LOGO.STR')}"/>`,
    `      <file name="MAR.STR" type="data" source="${dataRef('MAR.STR')}"/>`,
    `      <file name="NY.STR" type="data" source="${dataRef('NY.STR')}"/>`,
    `      <file name="PHILLY.STR" type="data" source="${dataRef('PHILLY.STR')}"/>`,
    `      <file name="SCHOOL.STR" type="data" source="${dataRef('SCHOOL.STR')}"/>`,
    `      <file name="SS.STR" type="data" source="${dataRef('SS.STR')}"/>`,
    `      <file name="VENICE.STR" type="data" source="${dataRef('VENICE.STR')}"/>`,
    '      <dir name="X">',
    ...xOrder.map(f => `        <file name="${f}" type="str" source="${rawRef(path.join('X', f))}"/>`),
    '      </dir>',
    `      <file name="INTRO.STR" type="str" source="${rawRef('INTRO.STR')}"/>`,
    ...(fs.existsSync(path.join(rootDir, 'VOICES.DAT'))
      ? [`      <file name="VOICES.DAT" type="data" source="${dataRef('VOICES.DAT')}"/>`]
      : []),
    ...(fs.existsSync(path.join(rootDir, 'THPS1.WAD'))
      ? [`      <file name="THPS1.WAD" type="data" source="${dataRef('THPS1.WAD')}"/>`]
      : []),
    '      <dummy sectors="150"/>',
    '    </directory_tree>',
    '  </track>',
    '</iso_project>'
  );

  fs.mkdirSync(path.dirname(path.resolve(outXmlPath)), { recursive: true });
  fs.writeFileSync(outXmlPath, lines.join('\r\n') + '\r\n', 'utf8');
  return outXmlPath;
}

module.exports = {
  detectFormat,
  riffOr2352ToRaw2336,
  normalizeRaw2336Sectors,
  raw2336ToRiffCdxa,
  inspectFile,
  extractLicenseFromOriginalBin,
  generateMkpsxisoXml,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const rootDir = path.resolve(__dirname, '..');
  if (!cmd) {
    console.log(`PSX Media & mkpsxiso XML Tool (Node.js)

Uso:
  node tools/psx_media.js inspect <arquivo.str|xa>
  node tools/psx_media.js riff2raw <in.str|xa> <out.raw2336>
  node tools/psx_media.js raw2riff <in.raw2336> <out.str|xa>
  node tools/psx_media.js gen-xml [out.xml]
`);
    process.exit(0);
  }
  if (cmd === 'inspect') {
    console.log(JSON.stringify(inspectFile(args[1]), null, 2));
  } else if (cmd === 'riff2raw') {
    const secs = riffOr2352ToRaw2336(args[1], args[2]);
    console.log(`Convertido ${args[1]} -> ${args[2]} (${secs} setores de 2336B)`);
  } else if (cmd === 'raw2riff') {
    const res = raw2336ToRiffCdxa(args[1], args[2]);
    console.log(`Encapsulado ${args[1]} -> ${args[2]} (${res.sectors} setores, ${res.bytes} bytes)`);
  } else if (cmd === 'gen-xml') {
    const outXml = args[1] || path.join(rootDir, 'tools', 'thps2_build.xml');
    const staging = path.join(rootDir, 'build', 'staging_raw');
    const outBin = path.join(rootDir, 'build', 'THPS2_MOD.bin');
    const outCue = path.join(rootDir, 'build', 'THPS2_MOD.cue');
    generateMkpsxisoXml(rootDir, staging, outXml, outBin, outCue);
    console.log(`XML mkpsxiso gerado em: ${outXml}`);
  } else {
    console.error('Comando desconhecido:', cmd);
    process.exit(1);
  }
}
