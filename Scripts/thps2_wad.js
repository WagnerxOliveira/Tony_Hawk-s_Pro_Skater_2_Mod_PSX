#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Complete CD.HED / CD.WAD / .PRE Unpacker & Repacker
 *
 * - Exact Neversoft hash algorithm reverse-engineered from SLUS_010.66 @ 0x80053F10
 * - Resolves real filenames from SLUS_010.66, overlays, .PRE, .PSH, .TRG, and THPS2 naming dictionary
 * - Strict 2048-byte (0x800) CD sector alignment for CD.WAD repacking
 * - Full .PRE sub-archive unpack/repack with 4-byte aligned filenames
 */

const fs = require('fs');
const path = require('path');

const SECTOR_SIZE = 2048;

function nsHash(str) {
  let v1 = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 65 && c <= 90) c += 32; // tolower
    let a1 = (c ^ v1) & 0xFF;
    for (let k = 0; k < 8; k++) {
      v1 = (((v1 << 1) | (v1 >>> 31)) >>> 0); // rol32(v1, 1)
      if (a1 & 1) v1 = (v1 ^ 0xEDB88320) >>> 0;
      a1 >>>= 1;
    }
  }
  return v1 >>> 0;
}

const hex8 = n => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
const alignUp = (n, a) => (n + (a - 1)) & ~(a - 1);

function parseHed(hedPath) {
  const buf = fs.readFileSync(hedPath);
  const entries = [];
  for (let off = 0; off + 12 <= buf.length; off += 12) {
    const hash = buf.readUInt32LE(off);
    if (hash === 0 && off + 4 === buf.length) break;
    const offset = buf.readUInt32LE(off + 4);
    const size = buf.readUInt32LE(off + 8);
    entries.push({ idx: entries.length, hash, offset, size });
  }
  return entries;
}

function classifyBuffer(b, size) {
  if (size === 0) return { type: 'EMPTY', ext: '.bin' };
  const u32 = b.length >= 4 ? b.readUInt32LE(0) : 0;
  const ascii4 = b.subarray(0, 4).toString('ascii');
  if (b[0] === 0x42 && b[1] === 0x4D) return { type: 'BMP', ext: '.bmp' };
  if (u32 === 0x00020004 || u32 === 0x00020006 || u32 === 0x00020003) return { type: 'PSX', ext: '.psx' };
  if (ascii4 === '_TRG') return { type: 'TRG', ext: '.trg' };
  if (ascii4 === 'pBAV') return { type: 'VAB', ext: '.vab' };
  if (ascii4 === '#ifn') return { type: 'PSH', ext: '.psh' };
  if (u32 === 0x00004E25) return { type: 'PRK', ext: '.prk' };
  if (u32 === 0x3C020000) return { type: 'OVL_BIN', ext: '.bin' };
  if (u32 === 0x00000001 && size < 4096) return { type: 'OVL_REL', ext: '.rel' };
  if (u32 >= 2 && u32 <= 200 && b.length >= 20) {
    const nul = b.indexOf(0, 4);
    if (nul > 6 && nul < 24) {
      const first = b.subarray(4, nul).toString('ascii');
      if (/^[A-Za-z0-9_]+\.[A-Za-z0-9]{2,4}$/.test(first)) {
        return { type: 'PRE', ext: '.pre' };
      }
    }
  }
  return { type: 'DATA', ext: '.dat' };
}

function buildFilenameResolver(entries, wadBuf, slusPath) {
  const hashToIdx = new Map();
  for (const e of entries) hashToIdx.set(e.hash, e.idx);
  const resolved = new Map(); // idx -> realName

  const tryName = name => {
    if (!name || name.length > 64) return;
    const h = nsHash(name);
    if (hashToIdx.has(h) && !resolved.has(hashToIdx.get(h))) {
      resolved.set(hashToIdx.get(h), name);
    }
  };

  const reFile = /[A-Za-z0-9_\\\/-]{1,32}\.[A-Za-z0-9]{2,4}/g;
  const harvest = buf => {
    const s = buf.toString('latin1');
    let m;
    reFile.lastIndex = 0;
    while ((m = reFile.exec(s)) !== null) {
      tryName(m[0]);
      const bn = m[0].split(/[\\\/]/).pop();
      if (bn !== m[0]) tryName(bn);
    }
  };

  let slusStr = '';
  if (slusPath && fs.existsSync(slusPath)) {
    const exe = fs.readFileSync(slusPath);
    harvest(exe);
    slusStr = exe.toString('latin1');
  }

  for (const e of entries) {
    if (e.size === 0) continue;
    const slice = wadBuf.subarray(e.offset, e.offset + e.size);
    if (slice.length >= 2 && slice[0] === 0x42 && slice[1] === 0x4D) continue;
    harvest(slice);
  }

  // Known THPS2 PS1 prefixes & dynamic filename templates
  const levelCodes = [
    'skhan','sksch','skmar','skny','skven','skss','skphi','skbul','skhvn','skb1','sked',
    'skware','skchc','skskp','skchp','hangar','school2','school','mar','ny','venice','ss',
    'philly','bullring','b1','heaven','sked','editor','ware','chic','down','mall','burn',
    'ros','sf','stre','comp'
  ];
  const levelSufs = ['', '_l', '_t', '_g', '_o', '_s', '_2', '_2p', '_sky', 'sky', '_t2', '_2t', '_l2', '_2l', '_o2', '_2o', '_d', '_a', '_b', '_c', '_e', '_f', '_h', '_m', '_n', '_p', '_r', '_w', '2', '2_l', '2_t', '2_o', '2_g', '2_sky'];
  const exts = ['psx','trg','bmp','vab','bin','rel','pre','fnt','psh','dat','prk','rec','trk','sk2','anm','txt','tim'];

  for (const l of levelCodes) {
    for (const suf of levelSufs) {
      for (const ext of ['psx','trg','vab','bmp','bin','rel','pre','dat','rec','psh']) {
        tryName(`${l}${suf}.${ext}`);
      }
    }
  }

  // Skater model prefixes from SLUS roster table
  const skaters = [
    'hawk2','hawk2b','burnq2','burnq2b','cab','cab2','cabb','campb2','campb2b','glif2','glif2b',
    'koston','kostonb','lasek2','lasek2b','mullen','mullenb','muska2','muska2b','rynld2','rynld2b',
    'rowley2','rowley2b','steam2','steam2b','thomas2','thomas2b','secret1','secret1b','secret2','secret2b',
    'secret3','secret3b','spidey','dick','carrera','mcsqueeb','sk2def','sk2anim','custom','cas'
  ];
  for (const sk of skaters) {
    for (const suf of ['', '_l', '_L', 'b', 'b_l', 'b_L', '2', '_2', '_a', '_b', '_c', '_d', '_t', '_o', '_h', '_p', '_s', '_1', '_2', '_3', '_4']) {
      for (const ext of ['psx','psh','bmp','bin','rel','dat','anm']) {
        tryName(`${sk}${suf}.${ext}`);
      }
    }
  }

  // Harvest all alphanumeric tokens from SLUS and test with extensions + numbered suffixes
  if (slusStr) {
    const tokens = new Set();
    const reTok = /[A-Za-z][A-Za-z0-9_]{1,14}/g;
    let m;
    while ((m = reTok.exec(slusStr)) !== null) tokens.add(m[0].toLowerCase());
    for (const t of tokens) {
      for (const ext of exts) {
        tryName(`${t}.${ext}`);
        tryName(`${t}_l.${ext}`);
        tryName(`${t}_t.${ext}`);
        tryName(`${t}_o.${ext}`);
        tryName(`${t}_s.${ext}`);
        tryName(`${t}_g.${ext}`);
        tryName(`${t}2.${ext}`);
      }
    }
  }

  // Expand prefixes from already-resolved numbered filenames (e.g. crpants0.bmp -> crpants0..30.bmp)
  const resolvedList = [...resolved.values()];
  const prefixExts = new Set();
  for (const fn of resolvedList) {
    const m = fn.match(/^([A-Za-z0-9_-]+?)(\d{1,2})\.([A-Za-z0-9]{2,4})$/);
    if (m) prefixExts.add(`${m[1]}|${m[3]}`);
  }
  for (const pe of prefixExts) {
    const [pref, ext] = pe.split('|');
    for (let i = 0; i <= 55; i++) {
      tryName(`${pref}${i}.${ext}`);
      tryName(`${pref}${String(i).padStart(2, '0')}.${ext}`);
    }
  }
  // Parks park0..park55
  for (let i = 0; i <= 60; i++) {
    tryName(`park${i}.prk`);
    tryName(`park${String(i).padStart(2, '0')}.prk`);
  }

  return resolved;
}

// --- .PRE SUB-ARCHIVE PARSER & REPACKER ---
// Format: uint32 count; repeated count times: [null-terminated name padded to 4-byte boundary][uint32 size][payload padded to 4-byte boundary?]
// Let's inspect exact padding rule dynamically and preserve exact layout!
function parsePre(buf) {
  const count = buf.readUInt32LE(0);
  let pos = 4;
  const items = [];
  for (let i = 0; i < count; i++) {
    const nul = buf.indexOf(0, pos);
    if (nul < 0) throw new Error(`Invalid .PRE: missing null terminator at entry ${i}, pos=${pos}`);
    const name = buf.subarray(pos, nul).toString('ascii');
    const nameLenWithPad = alignUp(nul - pos + 1, 4);
    const padBytes = buf.subarray(nul, pos + nameLenWithPad);
    pos += nameLenWithPad;
    const size = buf.readUInt32LE(pos);
    pos += 4;
    const data = buf.subarray(pos, pos + size);
    const dataEnd = pos + size;
    const nextAligned = alignUp(dataEnd, 4);
    // Check if there is 4-byte padding after data (only if nextAligned <= buf.length and not last or padded)
    let dataPad = 0;
    if (i < count - 1) {
      dataPad = nextAligned - dataEnd;
    } else {
      dataPad = buf.length - dataEnd;
    }
    const trailingDataPad = buf.subarray(dataEnd, dataEnd + dataPad);
    pos = dataEnd + dataPad;
    items.push({ name, size, data, namePadLen: nameLenWithPad - name.length, dataPadLen: dataPad, trailingDataPad });
  }
  return { count, items, totalConsumed: pos, fileSize: buf.length };
}

function buildPre(items) {
  const parts = [];
  const hdr = Buffer.alloc(4);
  hdr.writeUInt32LE(items.length, 0);
  parts.push(hdr);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const nameBuf = Buffer.from(it.name, 'ascii');
    const paddedLen = alignUp(nameBuf.length + 1, 4);
    const nb = Buffer.alloc(paddedLen, 0);
    nameBuf.copy(nb, 0);
    parts.push(nb);

    const szBuf = Buffer.alloc(4);
    szBuf.writeUInt32LE(it.data.length, 0);
    parts.push(szBuf);
    parts.push(it.data);

    // 4-byte align after payload between entries (and at end if originally padded)
    const rem = it.data.length % 4;
    if (i < items.length - 1) {
      if (rem !== 0) parts.push(Buffer.alloc(4 - rem, 0));
    } else if (it.padEnd && rem !== 0) {
      parts.push(Buffer.alloc(4 - rem, 0));
    }
  }
  return Buffer.concat(parts);
}

function unpackPreFile(preBuf, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const parsed = parsePre(preBuf);
  const manifest = [];
  const usedNames = new Set();
  for (let i = 0; i < parsed.items.length; i++) {
    const it = parsed.items[i];
    let safeName = it.name;
    if (usedNames.has(safeName.toLowerCase())) {
      safeName = `${String(i).padStart(2, '0')}_${it.name}`;
    }
    usedNames.add(safeName.toLowerCase());
    fs.writeFileSync(path.join(outDir, safeName), it.data);
    manifest.push({
      name: it.name,
      file: safeName,
      padEnd: i === parsed.items.length - 1 ? (it.dataPadLen > 0) : undefined
    });
  }
  fs.writeFileSync(path.join(outDir, '_pre_manifest.json'), JSON.stringify(manifest, null, 2));
  return parsed.items.length;
}

function repackPreDir(inDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(inDir, '_pre_manifest.json'), 'utf8'));
  const items = manifest.map(m => ({
    name: m.name,
    data: fs.readFileSync(path.join(inDir, m.file)),
    padEnd: Boolean(m.padEnd)
  }));
  return buildPre(items);
}

// --- CLI COMMANDS ---
function cmdList(hedPath, wadPath, slusPath) {
  const entries = parseHed(hedPath);
  const wadBuf = fs.readFileSync(wadPath);
  const resolved = buildFilenameResolver(entries, wadBuf, slusPath);
  let resCount = 0;
  for (const e of entries) {
    const b = wadBuf.subarray(e.offset, e.offset + Math.min(32, e.size));
    const info = classifyBuffer(b, e.size);
    const name = resolved.get(e.idx) || `(unknown_${hex8(e.hash).slice(2)}${info.ext})`;
    if (resolved.has(e.idx)) resCount++;
    console.log(`${String(e.idx).padStart(4)} | ${hex8(e.hash)} | ${info.type.padEnd(7)} | off=${hex8(e.offset)} | sz=${String(e.size).padStart(7)} | ${name}`);
  }
  console.error(`\nTotal: ${entries.length} arquivos | Resolvidos: ${resCount} (${((resCount / entries.length) * 100).toFixed(1)}%)`);
}

function cmdUnpack(hedPath, wadPath, slusPath, outDir, unpackPre) {
  const entries = parseHed(hedPath);
  const wadBuf = fs.readFileSync(wadPath);
  const resolved = buildFilenameResolver(entries, wadBuf, slusPath);
  fs.mkdirSync(outDir, { recursive: true });
  const filesDir = path.join(outDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });

  const manifest = {
    sourceHed: path.resolve(hedPath),
    sourceWad: path.resolve(wadPath),
    wadTotalSize: wadBuf.length,
    entries: []
  };

  const usedDiskNames = new Set();
  let preUnpacked = 0;
  for (const e of entries) {
    const data = wadBuf.subarray(e.offset, e.offset + e.size);
    const info = classifyBuffer(data.subarray(0, 32), e.size);
    const realName = resolved.get(e.idx) || null;
    let diskName = realName ? realName.replace(/[\\\/:*?"<>|]/g, '_') : `unk_${String(e.idx).padStart(4, '0')}_${hex8(e.hash).slice(2)}${info.ext}`;
    if (usedDiskNames.has(diskName.toLowerCase())) {
      diskName = `${String(e.idx).padStart(4, '0')}_${diskName}`;
    }
    usedDiskNames.add(diskName.toLowerCase());

    const outPath = path.join(filesDir, diskName);
    fs.writeFileSync(outPath, data);

    let preDirRel = null;
    if (unpackPre && info.type === 'PRE') {
      preDirRel = path.join('pre_unpacked', diskName.replace(/\.pre$/i, ''));
      unpackPreFile(data, path.join(outDir, preDirRel));
      preUnpacked++;
    }

    manifest.entries.push({
      idx: e.idx,
      hash: hex8(e.hash),
      name: realName,
      file: path.join('files', diskName),
      type: info.type,
      preDir: preDirRel,
      originalOffset: e.offset,
      originalSize: e.size
    });
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Unpack concluido em: ${outDir}`);
  console.log(`  Arquivos extraidos : ${entries.length}`);
  console.log(`  Nomes resolvidos   : ${resolved.size} / ${entries.length} (${((resolved.size / entries.length) * 100).toFixed(1)}%)`);
  if (unpackPre) console.log(`  Sub-arquivos .PRE  : ${preUnpacked} desempacotados em pre_unpacked/`);
}

function cmdRepack(inDir, outHedPath, outWadPath, usePreDirs) {
  const manifest = JSON.parse(fs.readFileSync(path.join(inDir, 'manifest.json'), 'utf8'));
  const wadChunks = [];
  const hedBuf = Buffer.alloc(manifest.entries.length * 12 + 4, 0);
  let curOffset = 0;

  for (let i = 0; i < manifest.entries.length; i++) {
    const entry = manifest.entries[i];
    let data;
    if (usePreDirs && entry.preDir && fs.existsSync(path.join(inDir, entry.preDir, '_pre_manifest.json'))) {
      data = repackPreDir(path.join(inDir, entry.preDir));
    } else {
      data = fs.readFileSync(path.join(inDir, entry.file));
    }

    // Compute hash: use entry.name if newly added (no hash), otherwise preserve original hash or recompute from name
    let hashVal;
    if (entry.hash) {
      hashVal = parseInt(entry.hash, 16) >>> 0;
    } else if (entry.name) {
      hashVal = nsHash(entry.name);
    } else {
      throw new Error(`Entry ${i} sem hash nem name!`);
    }

    hedBuf.writeUInt32LE(hashVal, i * 12);
    hedBuf.writeUInt32LE(curOffset, i * 12 + 4);
    hedBuf.writeUInt32LE(data.length, i * 12 + 8);

    wadChunks.push(data);
    const paddedSize = Math.max(SECTOR_SIZE, alignUp(data.length, SECTOR_SIZE));
    const padLen = paddedSize - data.length;
    if (padLen > 0) wadChunks.push(Buffer.alloc(padLen, 0));
    curOffset += paddedSize;
  }

  fs.mkdirSync(path.dirname(path.resolve(outHedPath)), { recursive: true });
  fs.mkdirSync(path.dirname(path.resolve(outWadPath)), { recursive: true });
  fs.writeFileSync(outHedPath, hedBuf);
  fs.writeFileSync(outWadPath, Buffer.concat(wadChunks));
  console.log(`Repack concluido!`);
  console.log(`  CD.HED: ${outHedPath} (${hedBuf.length} bytes, ${manifest.entries.length} entradas)`);
  console.log(`  CD.WAD: ${outWadPath} (${curOffset} bytes, ${(curOffset / 1048576).toFixed(2)} MB)`);
}

// --- MAIN ---
function usage() {
  console.log(`THPS2 PS1 CD.HED / CD.WAD / .PRE Tool (Node.js)

Uso:
  node tools/thps2_wad.js hash <nome_arquivo>
  node tools/thps2_wad.js list [CD.HED] [CD.WAD] [SLUS_010.66]
  node tools/thps2_wad.js unpack <outDir> [--pre] [--hed CD.HED] [--wad CD.WAD] [--slus SLUS_010.66]
  node tools/thps2_wad.js repack <inDir> <out.HED> <out.WAD> [--from-pre]
  node tools/thps2_wad.js unpack-pre <arquivo.pre> <outDir>
  node tools/thps2_wad.js repack-pre <inDir> <out.pre>
`);
}

const args = process.argv.slice(2);
if (args.length === 0) { usage(); process.exit(0); }

const cmd = args[0];
const getFlag = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};

const rootDir = path.resolve(__dirname, '..');
const defHed = path.join(rootDir, 'CD.HED');
const defWad = path.join(rootDir, 'CD.WAD');
const defSlus = path.join(rootDir, 'SLUS_010.66');

if (cmd === 'hash') {
  const name = args[1];
  if (!name) { usage(); process.exit(1); }
  console.log(`${name} -> ${hex8(nsHash(name))}`);
} else if (cmd === 'list') {
  cmdList(args[1] || defHed, args[2] || defWad, args[3] || defSlus);
} else if (cmd === 'unpack') {
  const outDir = args[1];
  if (!outDir) { usage(); process.exit(1); }
  cmdUnpack(getFlag('--hed', defHed), getFlag('--wad', defWad), getFlag('--slus', defSlus), outDir, args.includes('--pre'));
} else if (cmd === 'repack') {
  const [, inDir, outHed, outWad] = args;
  if (!inDir || !outHed || !outWad) { usage(); process.exit(1); }
  cmdRepack(inDir, outHed, outWad, args.includes('--from-pre'));
} else if (cmd === 'unpack-pre') {
  const [, preFile, outDir] = args;
  const n = unpackPreFile(fs.readFileSync(preFile), outDir);
  console.log(`Unpacked ${n} files from ${preFile} -> ${outDir}`);
} else if (cmd === 'repack-pre') {
  const [, inDir, outFile] = args;
  const buf = repackPreDir(inDir);
  fs.writeFileSync(outFile, buf);
  console.log(`Repacked ${inDir} -> ${outFile} (${buf.length} bytes)`);
} else {
  usage();
  process.exit(1);
}
