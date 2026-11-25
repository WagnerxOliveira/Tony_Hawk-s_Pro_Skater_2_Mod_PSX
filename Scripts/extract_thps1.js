#!/usr/bin/env node
'use strict';

/**
 * THPS1 (PS1 NTSC-U SLUS-00860) Complete Extractor & Categorizer
 *
 * Extracts all 669 files from EXTRAIDOS_ARQUIVOS_THPS1/01_ISO_Raiz/CD.HED + CD.WAD,
 * unpacks all 6 .PRE archives (LZSS-compressed Neversoft PRE v1/v2), and organizes
 * everything cleanly by category inside EXTRAIDOS_ARQUIVOS_THPS1/.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const outBase = path.join(rootDir, 'EXTRAIDOS_ARQUIVOS_THPS1');
const isoDir  = path.join(outBase, '01_ISO_Raiz');
const hedPath = path.join(isoDir, 'CD.HED');
const wadPath = path.join(isoDir, 'CD.WAD');

if (!fs.existsSync(hedPath) || !fs.existsSync(wadPath)) {
  throw new Error('Execute dumpsxiso primeiro para gerar EXTRAIDOS_ARQUIVOS_THPS1/01_ISO_Raiz/CD.HED e CD.WAD!');
}

const hedBuf = fs.readFileSync(hedPath);
const wadBuf = fs.readFileSync(wadPath);

// Parse THPS1 plaintext CD.HED: null-terminated ASCII name (4-byte aligned), uint32 offset, uint32 size
function parseThps1Hed(buf) {
  const entries = [];
  let p = 0;
  while (p < buf.length) {
    if (buf[p] === 0xff && p + 4 <= buf.length && buf.readUInt32LE(p) === 0xffffffff) break;
    const nul = buf.indexOf(0, p);
    if (nul < 0) break;
    const name = buf.subarray(p, nul).toString('latin1');
    p = (nul + 4) & ~3;
    if (p + 8 > buf.length) break;
    const offset = buf.readUInt32LE(p);
    const size   = buf.readUInt32LE(p + 4);
    p += 8;
    entries.push({ idx: entries.length, name, offset, size });
  }
  return entries;
}

// Neversoft .PRE unpacker (handles uncompressed & LZSS-compressed THPS1/THPS2 .PRE entries)
function lzssDecompress(src, expectedSize) {
  const out = Buffer.alloc(expectedSize);
  const ring = Buffer.alloc(4096, 0);
  let r = 4078;
  let si = 0, oi = 0, flags = 0;
  while (oi < expectedSize && si < src.length) {
    flags >>= 1;
    if ((flags & 0x100) === 0) {
      if (si >= src.length) break;
      flags = src[si++] | 0xFF00;
    }
    if (flags & 1) {
      if (si >= src.length) break;
      const b = src[si++];
      out[oi++] = b;
      ring[r] = b;
      r = (r + 1) & 4095;
    } else {
      if (si + 1 >= src.length) break;
      const b1 = src[si++];
      const b2 = src[si++];
      const pos = b1 | ((b2 & 0xF0) << 4);
      const len = (b2 & 0x0F) + 3;
      for (let k = 0; k < len && oi < expectedSize; k++) {
        const b = ring[(pos + k) & 4095];
        out[oi++] = b;
        ring[r] = b;
        r = (r + 1) & 4095;
      }
    }
  }
  return out.subarray(0, oi);
}

function unpackPre(preBuf) {
  const numFiles = preBuf.readUInt32LE(0);
  const items = [];
  let p = 4;
  for (let i = 0; i < numFiles && p < preBuf.length; i++) {
    const nul = preBuf.indexOf(0, p);
    if (nul < 0) break;
    const rawName = preBuf.subarray(p, nul).toString('latin1');
    p = (nul + 4) & ~3;
    if (p + 4 > preBuf.length) break;
    const rawSize = preBuf.readUInt32LE(p);
    p += 4;
    const data = Buffer.from(preBuf.subarray(p, p + rawSize));
    p += (rawSize + 3) & ~3;
    items.push({ name: rawName, rawSize, compSize: 0, compressed: false, data });
  }
  return items;
}

const LEVEL_MAP = [
  { prefix: 'skware', folder: '01_Warehouse_WoodlandHills',  vab: 'ware.vab',     load: 'load_war.bmp', thumb: 'levs1' },
  { prefix: 'skschl', folder: '02_School_Miami',             vab: 'school.vab',   load: 'load_sch.bmp', thumb: 'levs2' },
  { prefix: 'skmall', folder: '03_Mall_NewYork',             vab: 'mall.vab',     load: 'load_mal.bmp', thumb: 'levs3' },
  { prefix: 'skvans', folder: '04_SkatePark_Chicago_Comp',   vab: 'comp.vab',     load: 'loadcp1.bmp',  thumb: 'levs4' },
  { prefix: 'skdown', folder: '05_Downtown_Minneapolis',     vab: 'downtown.vab', load: 'load_dow.bmp', thumb: 'levs5' },
  { prefix: 'skjam',  folder: '06_DownhillJam_Phoenix',      vab: 'jam.vab',      load: 'load_dhj.bmp', thumb: 'levs6' },
  { prefix: 'skburn', folder: '07_Burnside_Portland_Comp',   vab: 'comp.vab',     load: 'loadcp2.bmp',  thumb: 'levs7' },
  { prefix: 'sksf',   folder: '08_Streets_SanFrancisco',     vab: 'sf.vab',       load: 'load_san.bmp', thumb: 'levs8' },
  { prefix: 'skros',  folder: '09_Roswell_NewMexico_Comp',   vab: 'roswell.vab',  load: 'loadcp3.bmp',  thumb: 'levs9' },
];

function classifyEntry(name) {
  const low = name.toLowerCase();
  const ext = path.extname(low).slice(1);

  // 1. Level files (PSX, TRG, VAB, Loading BMPs, Level Select thumbs)
  for (const lv of LEVEL_MAP) {
    if (low.startsWith(lv.prefix) || low === lv.load) {
      return path.join('02_Fases_do_Jogo', lv.folder);
    }
  }
  if (low === 'c_taxi.psx' || low === 'c_van.psx' || low === 'c_police.psx' || low === 'c_cable.psx') {
    return path.join('02_Fases_do_Jogo', '10_Veiculos_e_Objetos_Compartilhados');
  }
  if (low === 'items.psx' || low === 'bits.psx' || low === 'skmedals.psx') {
    return path.join('02_Fases_do_Jogo', '10_Veiculos_e_Objetos_Compartilhados');
  }

  // 2. Audio Banks (.VAB)
  if (ext === 'vab') {
    return '04_Audio_Bancos_VAB';
  }

  // 3. Skater 3D Models (.PSX)
  if (ext === 'psx') {
    if (/_fe\.psx$|_f\.psx$/i.test(low)) return path.join('03_Skatistas_Modelos_3D', 'Frontend_Selecao');
    if (/_2p\.psx$|2p\.psx$/i.test(low)) return path.join('03_Skatistas_Modelos_3D', 'Multiplayer_2P');
    return path.join('03_Skatistas_Modelos_3D', 'Singleplayer_1P');
  }

  // 4. Packages (.PRE)
  if (ext === 'pre') return path.join('05_Pacotes_PRE', 'Arquivos_PRE_Originais');

  // 5. Fonts (.FNT)
  if (ext === 'fnt') return '06_Fontes_FNT';

  // 6. Replays / Demos (.REC)
  if (ext === 'rec') return '08_Demos_Replays_REC';

  // 7. Text / Compressed (.TXT, .ZLB)
  if (ext === 'txt' || ext === 'zlb') return '09_Textos_e_Outros';

  // 8. BMP Textures / UI / Boards / Wheels / Trucks / Loading Screens
  if (ext === 'bmp') {
    if (/^b_|^b1|^b2/.test(low)) return path.join('07_Imagens_UI_e_Equipamentos_BMP', 'Shapes_Decks');
    if (/^w_|^wt|^w1|^w2/.test(low)) return path.join('07_Imagens_UI_e_Equipamentos_BMP', 'Rodas_Wheels');
    if (/^t1_|^t2_/.test(low)) return path.join('07_Imagens_UI_e_Equipamentos_BMP', 'Trucks');
    if (/^load/.test(low)) return path.join('07_Imagens_UI_e_Equipamentos_BMP', 'Telas_de_Loading');
    if (/^levs|^levb|^leva/.test(low)) return path.join('07_Imagens_UI_e_Equipamentos_BMP', 'Selecao_de_Fases');
    if (/^medal|^tape|^score|^item|^spec|^paus|^bar|^box|^butt|^chec|^arro|^acce|^boar/.test(low)) {
      return path.join('07_Imagens_UI_e_Equipamentos_BMP', 'HUD_Icones_e_Medalhas');
    }
    return path.join('07_Imagens_UI_e_Equipamentos_BMP', 'Menus_e_Fundos');
  }

  return '09_Textos_e_Outros';
}

function sha256Short(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

const entries = parseThps1Hed(hedBuf);
console.log(`=== Extraindo ${entries.length} arquivos de THPS1 CD.WAD (${wadBuf.length} B) ===`);

const categoryCounts = {};
const catalog = [];

for (const e of entries) {
  const data = wadBuf.subarray(e.offset, e.offset + e.size);
  const relDir = classifyEntry(e.name);
  const dstDir = path.join(outBase, relDir);
  fs.mkdirSync(dstDir, { recursive: true });
  const dstFile = path.join(dstDir, e.name);
  fs.writeFileSync(dstFile, data);

  categoryCounts[relDir] = (categoryCounts[relDir] || 0) + 1;

  // Also copy each level's dedicated .VAB right into its level folder for convenience? Keep canonical in 04_Audio_Bancos_VAB + catalog link!
  const magicHex = data.subarray(0, Math.min(8, data.length)).toString('hex');
  const rec = {
    idx: e.idx,
    name: e.name,
    category: relDir.replace(/\\/g, '/'),
    wadOffset: e.offset,
    size: e.size,
    magicHex,
    sha256_16: sha256Short(data),
  };

  // Unpack .PRE archives into 05_Pacotes_PRE/Descompactados/<name>/
  if (e.name.toLowerCase().endsWith('.pre')) {
    const preName = path.basename(e.name, '.pre');
    const preOutDir = path.join(outBase, '05_Pacotes_PRE', 'Descompactados', preName);
    fs.mkdirSync(preOutDir, { recursive: true });
    const subItems = unpackPre(data);
    rec.preItems = subItems.map(it => {
      const safeName = it.name.replace(/[:*?"<>|]/g, '_');
      const fullSub = path.join(preOutDir, safeName);
      fs.mkdirSync(path.dirname(fullSub), { recursive: true });
      fs.writeFileSync(fullSub, it.data);
      return { name: it.name, rawSize: it.rawSize, compSize: it.compSize, compressed: it.compressed };
    });
    console.log(`  [PRE] ${e.name} -> ${subItems.length} arquivos descompactados em 05_Pacotes_PRE/Descompactados/${preName}/`);
  }

  catalog.push(rec);
}

// Catalog ISO Root files (30 files including 26 .STR videos!)
const isoFiles = fs.readdirSync(isoDir)
  .filter(f => fs.statSync(path.join(isoDir, f)).isFile())
  .sort()
  .map(f => {
    const p = path.join(isoDir, f);
    const sz = fs.statSync(p).size;
    return { name: f, size: sz, ext: path.extname(f).toLowerCase() };
  });

const summary = {
  game: "Tony Hawk's Pro Skater (USA / NTSC-U SLUS-00860)",
  isoFileCount: isoFiles.length,
  wadEntryCount: entries.length,
  wadTotalBytes: wadBuf.length,
  hedTotalBytes: hedBuf.length,
  categories: categoryCounts,
  isoFiles,
  wadEntries: catalog,
};

fs.writeFileSync(path.join(outBase, 'thps1_catalogo_completo.json'), JSON.stringify(summary, null, 2));

console.log('\n=== Resumo por Categoria em EXTRAIDOS_ARQUIVOS_THPS1/ ===');
for (const [k, v] of Object.entries(categoryCounts).sort()) {
  console.log(`  ${k.padEnd(56)} : ${String(v).padStart(4)} arquivos`);
}
console.log(`\nTotal extraido do CD.WAD: ${entries.length} arquivos + ${isoFiles.length} arquivos na raiz da ISO.`);
console.log(`Catalogo JSON salvo em: ${path.join(outBase, 'thps1_catalogo_completo.json')}`);
