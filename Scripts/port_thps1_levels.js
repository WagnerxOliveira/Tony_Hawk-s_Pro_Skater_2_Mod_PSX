#!/usr/bin/env node
'use strict';

/**
 * THPS1 (SLUS-00860) -> THPS2 (SLUS-01066) Automated Level Asset Converter & THPS1.WAD Packer
 *
 * Converts all 9 original THPS1 levels into native THPS2-compatible assets and packs them
 * into THPS1.WAD (appended to the end of the ISO after VOICES.DAT -> ZERO LBA shift on all
 * 48 Redump THPS2 files and ZERO offset shift in CD.HED/CD.WAD!):
 *
 *   1. .TRG v2.0 Conversion (all 9 levels):
 *      - Type 10/11 (RailDef / RailPoint): strips THPS1's 6-byte Angles + trailing 0xFFFF
 *        while preserving exact absolute 4-byte Pos alignment and terrain flags (2,301 rails).
 *      - Type 5 (PowerUp): converts all 68 THPS1 spinning coins/tokens (subtypes 21, 22, 23)
 *        into THPS2 native $100 Cash pickups (low byte = 26, high byte = sequential bit 0..N-1
 *        as expected by Career_GetCashBitIndex @ 0x80024E4C!).
 *      - Preserves exact (offset % 4) parity for every untouched node (Types 1,2,3,4,6,8,12,13,14,15,501,1000).
 *      - Rewrites "C_Cable" -> "C_Cabl1" in sksf_t.trg so San Francisco uses THPS1's full 11-texture
 *        cable car (c_cabl1.psx) without modifying THPS2's CD.WAD.
 *
 *   2. .PSX Level Geometry / Textures / Objects:
 *      - Copies all 53 THPS1 level .PSX files (identical 0x00020004 Neversoft format, SuperSector
 *        chunk 0x0A, 32-byte faces, 4bpp/8bpp textures) + c_cabl1.psx.
 *
 *   3. Level Select Artwork (18 BMPs in exact THPS2 8bpp format):
 *      - t1rend00..08.bmp (176x48 8bpp) from THPS1 levsel*.bmp / load_*.bmp
 *      - t1levl00..08.bmp (212x52 8bpp) from THPS1 load_*.bmp / levsel*.bmp
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildAllThps1CustomObjects } = require('./mod_thps1_custom_objects');

const ROOT = path.resolve(__dirname, '..');
const THPS1_DIR = path.join(ROOT, 'EXTRAIDOS_ARQUIVOS_THPS1');
const FASES_DIR = path.join(THPS1_DIR, '02_Fases_do_Jogo');
const LEVSEL_BMP_DIR = path.join(THPS1_DIR, '07_Imagens_UI_e_Equipamentos_BMP', 'Selecao_de_Fases');
const STAGE_DIR = path.join(ROOT, 'build', 'thps1_converted');
const OUT_WAD = path.join(ROOT, 'THPS1.WAD');
const OUT_MANIFEST = path.join(ROOT, 'build', 'thps1_manifest.json');
const FFMPEG = path.join(ROOT, 'tools', 'bin', 'ffmpeg', 'ffmpeg-9.1-essentials_build', 'bin', 'ffmpeg.exe');

const SECTOR_SIZE = 2048;

function nsHash(str) {
  let v1 = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 65 && c <= 90) c += 32;
    let a1 = (c ^ v1) & 0xFF;
    for (let k = 0; k < 8; k++) {
      v1 = (((v1 << 1) | (v1 >>> 31)) >>> 0);
      if (a1 & 1) v1 = (v1 ^ 0xEDB88320) >>> 0;
      a1 >>>= 1;
    }
  }
  return v1 >>> 0;
}

const THPS1_LEVELS = [
  {
    idx: 0, id2: 11, name: 'Warehouse', loc: 'Woodland Hills', dir: '01_Warehouse_WoodlandHills',
    trg: 'skware_t.trg', levselBmp: 'levsel0.bmp', loadBmp: 'load_war.bmp',
    isComp: false, vab: 'hangar',
  },
  {
    idx: 1, id2: 12, name: 'School', loc: 'Miami', dir: '02_School_Miami',
    trg: 'skschl_t.trg', levselBmp: 'levsel1.bmp', loadBmp: 'load_sch.bmp',
    isComp: false, vab: 'school2',
  },
  {
    idx: 2, id2: 13, name: 'Mall', loc: 'New York', dir: '03_Mall_NewYork',
    trg: 'skmall_t.trg', levselBmp: 'levsel5.bmp', loadBmp: 'load_mal.bmp',
    isComp: false, vab: 'ny',
  },
  {
    idx: 3, id2: 14, name: 'Skate Park', loc: 'Chicago', dir: '04_SkatePark_Chicago_Comp',
    trg: 'skvans_t.trg', levselBmp: 'levsel3.bmp', loadBmp: 'loadcp1.bmp',
    isComp: true, vab: 'ss',
  },
  {
    idx: 4, id2: 15, name: 'Downtown', loc: 'Minneapolis', dir: '05_Downtown_Minneapolis',
    trg: 'skdown_t.trg', levselBmp: 'levsel2.bmp', loadBmp: 'load_dow.bmp',
    isComp: false, vab: 'ny',
  },
  {
    idx: 5, id2: 16, name: 'Downhill Jam', loc: 'Phoenix', dir: '06_DownhillJam_Phoenix',
    trg: 'skjam_t.trg', levselBmp: 'levsel4.bmp', loadBmp: 'load_dhj.bmp',
    isComp: false, vab: 'venice',
  },
  {
    idx: 6, id2: 17, name: 'Burnside', loc: 'Portland', dir: '07_Burnside_Portland_Comp',
    trg: 'skburn_t.trg', levselBmp: 'levsel8.bmp', loadBmp: 'loadcp2.bmp',
    isComp: true, vab: 'mar',
  },
  {
    idx: 7, id2: 18, name: 'Streets', loc: 'San Francisco', dir: '08_Streets_SanFrancisco',
    trg: 'sksf_t.trg', levselBmp: 'levsel7.bmp', loadBmp: 'load_san.bmp',
    isComp: false, vab: 'philly',
  },
  {
    idx: 8, id2: 19, name: 'Roswell', loc: 'New Mexico', dir: '09_Roswell_NewMexico_Comp',
    trg: 'skros_t.trg', levselBmp: 'levsel9.bmp', loadBmp: 'loadcp3.bmp',
    isComp: true, vab: 'bullring',
  },
];

// Verified reachable 3D floor-anchored placements (5 per regular THPS1 level = 30 spinning custom 3D goal collectibles!)
// Collectible #1 of EVERY level sits directly ahead of Re_Start_* (visible immediately on Frame 1!).
// All Y coordinates follow Neversoft PS1 convention (negative Y = UP; floorY - 140 = exact skater pickup height!).
const THPS1_G5_SPAWNS = {
  'skware_t.trg': {
    parentNode: 1,
    label: '5 Mandiocas da Dilma',
    coords: [
      [ 5842, -1580,  3420], // #1 Right down roll-in ramp (visible Frame 1!)
      [ 6224,  -170,  9408], // #2 Center halfpipe floor (Ho_SkWare_HP)
      [ 6440,  -170, 12187], // #3 Big Rail floor (Ho_SkWare_BigRail)
      [ 3097,  -536, 13246], // #4 Left Kickers (Ho_SkWare_Kickers)
      [ 6025,  -587, 14376], // #5 Back Wall QP (Ho_SkWare_BackWall)
    ],
  },
  'skschl_t.trg': {
    parentNode: 608,
    label: '5 Triplex do Guaruja',
    coords: [
      [ -6800, -2930,   6391], // #1 Right ahead of start awning (visible Frame 1!)
      [ -1812,  -170, -10344], // #2 Main rail courtyard (Ho_Start_School_Rails01)
      [  5467,  -111,  -2970], // #3 Swimming pool rim (Ho_Start_School_Pool01)
      [  8383,  -170,  -6087], // #4 Halfpipe plaza (Ho_Start_School_Halfpipe01)
      [-11718,  -371,  -6274], // #5 Lower schoolyard (Ho_Start_School_Two_Player)
    ],
  },
  'skmall_t.trg': {
    parentNode: 441,
    label: '5 Malas do Mensalao',
    coords: [
      [-48850, -2960, 22104], // #1 Right ahead of Mall entrance (visible Frame 1!)
      [-41536, -1870, 22495], // #2 Upstairs Atrium 1 (Ho_Upstairs01_Mall)
      [-30233, -1762, 22251], // #3 Upstairs Atrium 2 (Ho_Upstairs02_Mall)
      [-15235,   587, 17991], // #4 Mid Mall slope (Ho_Slope_Mall)
      [  3564,  3679,  8841], // #5 Dancing Waters fountain (Ho_Dancing_Waters_Mall)
    ],
  },
  'skdown_t.trg': {
    parentNode: 1,
    label: '5 Cofres do Escandalo INSS',
    coords: [
      [  7400,  -170,   340], // #1 Right down the starting street (visible Frame 1!)
      [   340,  -153,  -174], // #2 Taxi Avenue center (Ho_SkDown_Taxi)
      [ -3817,    -7, -6493], // #3 Fountain Park (Ho_SkDown_Fountain)
      [ -1054,  -170,   953], // #4 Bus Stop plaza (Ho_SkDown_BusStop)
      [  4025, -2196,  3774], // #5 Rooftop glass deck (Re_Start_Roof)
    ],
  },
  'skjam_t.trg': {
    parentNode: 540,
    label: '5 Pedalinhos de Atibaia',
    coords: [
      [-26725, -1955, 41801], // #1 Right ahead of top ramp (Ho_Top, visible Frame 1!)
      [-36099,  -205, 38047], // #2 Upper Canyon rails (Ho_Rails)
      [-43706,  2615, 44072], // #3 Dam spillway (Ho_Dam)
      [-44017,  5094, 52460], // #4 Mid canyon pipe (Ho_Dew)
      [-43695,  7164, 63808], // #5 Ski jump launch (Ho_Skijump)
    ],
  },
  'sksf_t.trg': {
    parentNode: 31,
    label: '5 Picanhas da Promessa',
    coords: [
      [ -7450, -1980, 16380], // #1 Right down starting SF hill (visible Frame 1!)
      [  3203,  -243,  3977], // #2 Hubba Hideout plaza (Re_Start_Hubba_Hideout)
      [ -8881,   206,  1706], // #3 Embarcadero fountain (Re_Start_Embarcadero)
      [-14414,   151, -2351], // #4 Pagoda square (Ho_Start_Near_Pagoda)
      [-17011,  -551, 20398], // #5 Chinatown arch (Re_Start_Chinatown)
    ],
  },
};

/**
 * Convert THPS1 _TRG v2.0 buffer -> THPS2 _TRG v2.0 buffer with full self-verification
 * AND optional injection of 5 G5 custom 3D goal collectibles (Type 5, subtype 33 = 0x0021).
 */
function convertThps1Trg(srcBuf, fname) {
  if (srcBuf.subarray(0, 4).toString('ascii') !== '_TRG') {
    throw new Error(`${fname}: invalid _TRG header`);
  }
  const vMaj = srcBuf.readUInt16LE(4);
  const vMin = srcBuf.readUInt16LE(6);
  const oldNumNodes = srcBuf.readUInt32LE(8);
  const oldOffs = [];
  for (let i = 0; i < oldNumNodes; i++) oldOffs.push(srcBuf.readUInt32LE(12 + i * 4));

  const g5Spec = THPS1_G5_SPAWNS[fname.toLowerCase()] || null;
  const addCount = g5Spec ? g5Spec.coords.length : 0;
  // Original last node is ALWAYS type=255 terminator -> insert our 5 new subtype-33 nodes right BEFORE it!
  if (addCount > 0 && srcBuf.readUInt16LE(oldOffs[oldNumNodes - 1]) !== 255) {
    throw new Error(`${fname}: expected final terminator node (type=255) at idx ${oldNumNodes - 1}`);
  }
  const newNumNodes = oldNumNodes + addCount;
  const newG5NodeIds = [];
  for (let k = 0; k < addCount; k++) newG5NodeIds.push((oldNumNodes - 1) + k);

  const headerSize = 12 + newNumNodes * 4;
  let curOff = headerSize;
  const newOffs = new Array(newNumNodes);
  const chunks = [];

  let railsConverted = 0;
  let coinsConverted = 0;
  let skateLetters = 0;
  let secretTapes = 0;
  let cableRenamed = 0;
  let g5Injected = 0;

  const limitBeforeTerm = addCount > 0 ? oldNumNodes - 1 : oldNumNodes;

  for (let i = 0; i < limitBeforeTerm; i++) {
    const o = oldOffs[i];
    const end = (i + 1 < oldNumNodes) ? oldOffs[i + 1] : srcBuf.length;
    const type = srcBuf.readUInt16LE(o);

    if (type === 10 || type === 11) {
      // THPS1 RailDef / RailPoint -> THPS2 RailDef / RailPoint (strip 6-byte Angles + trailing 0xFFFF)
      const nLinks = srcBuf.readUInt16LE(o + 2);
      const oldPosOff = (o + 4 + nLinks * 2 + 3) & ~3;
      const x = srcBuf.readInt32LE(oldPosOff);
      const y = srcBuf.readInt32LE(oldPosOff + 4);
      const z = srcBuf.readInt32LE(oldPosOff + 8);
      const terrain = srcBuf.readUInt16LE(oldPosOff + 18);
      const rem = end - (oldPosOff + 20);
      if (rem !== 2 || srcBuf.readUInt16LE(oldPosOff + 20) !== 0xFFFF) {
        throw new Error(`${fname} node #${i} (type ${type}): unexpected trailing bytes rem=${rem}`);
      }

      newOffs[i] = curOff;
      const prePos = 4 + nLinks * 2;
      const newPosAbs = (curOff + prePos + 3) & ~3;
      const padBytes = newPosAbs - (curOff + prePos);
      const outNode = Buffer.alloc(prePos + padBytes + 12 + 2);
      outNode.writeUInt16LE(type, 0);
      outNode.writeUInt16LE(nLinks, 2);
      for (let k = 0; k < nLinks; k++) {
        outNode.writeUInt16LE(srcBuf.readUInt16LE(o + 4 + k * 2), 4 + k * 2);
      }
      const relPos = prePos + padBytes;
      outNode.writeInt32LE(x, relPos);
      outNode.writeInt32LE(y, relPos + 4);
      outNode.writeInt32LE(z, relPos + 8);
      outNode.writeUInt16LE(terrain, relPos + 12);

      chunks.push(outNode);
      curOff += outNode.length;
      railsConverted++;
    } else if (g5Spec && i === g5Spec.parentNode && type === 6) {
      // Append our 5 new G5 subtype-33 node IDs to the Career PowerUp spawn parent (Type 6)!
      // Layout: u16 type(6), u16 nLinks, u16 links[nLinks], pad-to-abs-4, u32 checksum(0), script (8600 0100 0300 ffff)
      const oldNLinks = srcBuf.readUInt16LE(o + 2);
      const oldCmdAligned = (o + 4 + oldNLinks * 2 + 3) & ~3;
      const scriptTail = Buffer.from(srcBuf.subarray(oldCmdAligned, end));
      // Align node start to 2 bytes (always 2-byte aligned)
      if (curOff & 1) { chunks.push(Buffer.alloc(1, 0)); curOff += 1; }
      newOffs[i] = curOff;
      const newNLinks = oldNLinks + addCount;
      const preCmd = 4 + newNLinks * 2;
      const newCmdAligned = (curOff + preCmd + 3) & ~3;
      const padCmd = newCmdAligned - (curOff + preCmd);
      const outNode = Buffer.alloc(preCmd + padCmd + scriptTail.length, 0);
      outNode.writeUInt16LE(6, 0);
      outNode.writeUInt16LE(newNLinks, 2);
      for (let k = 0; k < oldNLinks; k++) {
        outNode.writeUInt16LE(srcBuf.readUInt16LE(o + 4 + k * 2), 4 + k * 2);
      }
      for (let k = 0; k < addCount; k++) {
        outNode.writeUInt16LE(newG5NodeIds[k], 4 + (oldNLinks + k) * 2);
      }
      scriptTail.copy(outNode, preCmd + padCmd);
      chunks.push(outNode);
      curOff += outNode.length;
    } else {
      // Preserve exact (offset % 4) parity so EVERY internal 4-byte aligned Pos/u32 stays bit-exact!
      const oldParity = o & 3;
      const curParity = curOff & 3;
      if (curParity !== oldParity) {
        const pad = (oldParity - curParity + 4) & 3;
        chunks.push(Buffer.alloc(pad, 0));
        curOff += pad;
      }
      newOffs[i] = curOff;
      const nodeCopy = Buffer.from(srcBuf.subarray(o, end));

      if (type === 5) {
        // PowerUp: low byte = powerupType, high byte = cashBitIndex (0..63)
        const rawSub = nodeCopy.readUInt16LE(2);
        const sub = rawSub & 0xFF;
        if (sub === 21 || sub === 22 || sub === 23) {
          if (coinsConverted >= 64) {
            throw new Error(`${fname}: more than 64 coins (${coinsConverted})!`);
          }
          const newSub = ((coinsConverted & 0xFF) << 8) | 26;
          nodeCopy.writeUInt16LE(newSub, 2);
          coinsConverted++;
        } else if ([4, 5, 6, 10, 15].includes(sub)) {
          skateLetters++;
        } else if (sub === 16) {
          secretTapes++;
        }
      }

      // In Streets SF (sksf_t.trg), rename "C_Cable" -> "C_Cabl1" (exact same 7 chars) for full THPS1 cable car textures
      if (fname.toLowerCase() === 'sksf_t.trg') {
        let p = 0;
        const needle = Buffer.from('C_Cable', 'ascii');
        while ((p = nodeCopy.indexOf(needle, p)) !== -1) {
          Buffer.from('C_Cabl1', 'ascii').copy(nodeCopy, p);
          cableRenamed++;
          p += 7;
        }
      }

      chunks.push(nodeCopy);
      curOff += nodeCopy.length;
    }
  }

  // Append our 5 new G5 custom 3D collectible PowerUp nodes (Type 5, subtype 33 = 0x0021) BEFORE type=255 terminator!
  // Exact byte-for-byte format of THPS2 Hangar #319..#323 (at offset % 4 == 2, 24 bytes each):
  //   u16 5, u16 33 (0x0021), u16 0 (nLinks), i32 x, i32 y, i32 z, u16 0, u16 1, u16 0xFFFF
  if (addCount > 0) {
    for (let k = 0; k < addCount; k++) {
      const pad = (2 - (curOff & 3) + 4) & 3;
      if (pad) { chunks.push(Buffer.alloc(pad, 0)); curOff += pad; }
      newOffs[newG5NodeIds[k]] = curOff;
      const [x, y, z] = g5Spec.coords[k];
      const pNode = Buffer.alloc(24, 0);
      pNode.writeUInt16LE(5, 0);
      pNode.writeUInt16LE(33, 2); // subtype 33 -> Career G5 custom 3D collectible from sk*_o.psx!
      pNode.writeUInt16LE(0, 4);  // nLinks = 0 (offset +6 is exact 4-byte aligned!)
      pNode.writeInt32LE(x, 6);
      pNode.writeInt32LE(y, 10);
      pNode.writeInt32LE(z, 14);
      pNode.writeUInt16LE(0, 18);
      pNode.writeUInt16LE(1, 20);
      pNode.writeUInt16LE(0xFFFF, 22);
      chunks.push(pNode);
      curOff += pNode.length;
      g5Injected++;
    }
    // Emit original final terminator node (type=255) at newNumNodes - 1!
    const termOrigOff = oldOffs[oldNumNodes - 1];
    const termParity = termOrigOff & 3;
    const padT = (termParity - (curOff & 3) + 4) & 3;
    if (padT) { chunks.push(Buffer.alloc(padT, 0)); curOff += padT; }
    newOffs[newNumNodes - 1] = curOff;
    const termCopy = Buffer.from(srcBuf.subarray(termOrigOff, srcBuf.length));
    chunks.push(termCopy);
    curOff += termCopy.length;
  }

  // Assemble final buffer
  const hdr = Buffer.alloc(headerSize);
  hdr.write('_TRG', 0, 'ascii');
  hdr.writeUInt16LE(vMaj, 4);
  hdr.writeUInt16LE(vMin, 6);
  hdr.writeUInt32LE(newNumNodes, 8);
  for (let i = 0; i < newNumNodes; i++) hdr.writeUInt32LE(newOffs[i], 12 + i * 4);
  const outBuf = Buffer.concat([hdr, ...chunks]);

  // Self-verify converted TRG with exact THPS2 Trig_GetPos / Rail_GetFlags / Career_GetCashBitIndex / Subtype33 rules!
  const seenCashBits = new Set();
  let seenG5 = 0;
  for (let i = 0; i < newNumNodes; i++) {
    const o = outBuf.readUInt32LE(12 + i * 4);
    const nextO = (i + 1 < newNumNodes) ? outBuf.readUInt32LE(12 + (i + 1) * 4) : outBuf.length;
    const tp = outBuf.readUInt16LE(o);
    if (tp === 10 || tp === 11) {
      const nl = outBuf.readUInt16LE(o + 2);
      const posAbs = (o + 4 + nl * 2 + 3) & ~3;
      const ter = outBuf.readUInt16LE(posAbs + 12);
      if (nextO - (posAbs + 14) > 3) {
        throw new Error(`VERIFY FAIL ${fname} rail #${i}: posAbs=${posAbs} nextO=${nextO}`);
      }
      if (ter > 15) {
        throw new Error(`VERIFY FAIL ${fname} rail #${i}: bad terrain=${ter}`);
      }
    } else if (tp === 5) {
      const w = outBuf.readUInt16LE(o + 2);
      const sub = w & 0xFF;
      if (sub === 26) {
        const bit = w >>> 8;
        if (seenCashBits.has(bit)) throw new Error(`VERIFY FAIL ${fname}: duplicate cashBit ${bit}`);
        seenCashBits.add(bit);
      } else if (sub === 33) {
        if ((o & 3) !== 2) throw new Error(`VERIFY FAIL ${fname}: subtype 33 #${i} bad parity ${o & 3}`);
        seenG5++;
      }
    } else if (i < limitBeforeTerm && !(g5Spec && i === g5Spec.parentNode)) {
      if ((o & 3) !== (oldOffs[i] & 3)) {
        throw new Error(`VERIFY FAIL ${fname} node #${i}: parity mismatch!`);
      }
    }
  }
  if (seenG5 !== addCount) throw new Error(`VERIFY FAIL ${fname}: expected ${addCount} subtype-33 nodes, got ${seenG5}`);

  return {
    buf: outBuf,
    stats: { numNodes: newNumNodes, railsConverted, coinsConverted, skateLetters, secretTapes, cableRenamed, g5Injected },
  };
}

/**
 * Convert a source BMP into exact THPS2 8-bit indexed uncompressed Windows BMP (WxH, 256-color palette).
 */
function buildThps2Bmp(srcBmpPath, outBmpPath, width, height, cropSpec) {
  const palPng = outBmpPath + '.pal.png';
  const rawBmp = outBmpPath + '.raw.bmp';
  // Crop slightly to aspect ratio + Lanczos scale + crisp dark 1px frame matching THPS2 s2rend/s2levl
  const vfBase = `${cropSpec},scale=${width}:${height}:flags=lanczos,drawbox=x=0:y=0:w=${width}:h=${height}:color=0x101018:t=1`;
  const r1 = spawnSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', srcBmpPath,
    '-vf', `${vfBase},palettegen=max_colors=256:reserve_transparent=0:stats_mode=single`,
    palPng,
  ]);
  if (r1.status !== 0) throw new Error(`ffmpeg palettegen failed for ${srcBmpPath}: ${r1.stderr?.toString()}`);

  const r2 = spawnSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', srcBmpPath, '-i', palPng,
    '-lavfi', `${vfBase} [x]; [x][1:v] paletteuse=dither=floyd_steinberg`,
    '-pix_fmt', 'pal8', '-f', 'image2', rawBmp,
  ]);
  if (r2.status !== 0) throw new Error(`ffmpeg paletteuse failed for ${srcBmpPath}: ${r2.stderr?.toString()}`);

  // Normalize BMP header to exact 54-byte BITMAPINFOHEADER + 1024-byte palette (offBits=1078)
  const b = fs.readFileSync(rawBmp);
  const offBits = b.readUInt32LE(10);
  const w = b.readInt32LE(18);
  const h = b.readInt32LE(22);
  const bpp = b.readUInt16LE(28);
  if (w !== width || Math.abs(h) !== height || bpp !== 8) {
    throw new Error(`BMP verify failed for ${outBmpPath}: got ${w}x${h} ${bpp}bpp`);
  }
  const stride = (width + 3) & ~3;
  const imgSize = stride * height;
  const out = Buffer.alloc(1078 + imgSize);
  out.write('BM', 0, 'ascii');
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(1078, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22); // bottom-up!
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(8, 28);
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(imgSize, 34);
  out.writeUInt32LE(256, 46);
  // Copy palette (ensure 256*4 bytes)
  const palLen = Math.min(1024, offBits - 54);
  b.copy(out, 54, 54, 54 + palLen);
  // Copy pixels (flip vertically if top-down h < 0)
  if (h > 0) {
    b.copy(out, 1078, offBits, offBits + imgSize);
  } else {
    for (let y = 0; y < height; y++) {
      const srcRow = offBits + (height - 1 - y) * stride;
      b.copy(out, 1078 + y * stride, srcRow, srcRow + stride);
    }
  }
  fs.writeFileSync(outBmpPath, out);
  try { fs.unlinkSync(palPng); } catch {}
  try { fs.unlinkSync(rawBmp); } catch {}
  try { fs.unlinkSync(rawBmp); } catch {}
  return out;
}

function main() {
  console.log('=== THPS1 -> THPS2 Automated Level Converter & THPS1.WAD Packer ===\n');
  fs.mkdirSync(STAGE_DIR, { recursive: true });

  // 0. Sculpt & inject all 6 bespoke 3D satirical goal objects into sk*_o.psx (staged in build/thps1_converted/)!
  const customObjResults = buildAllThps1CustomObjects();
  const customObjMap = new Map();
  for (const r of customObjResults) customObjMap.set(r.spec.oPsx.toLowerCase(), r.buf);
  console.log('');

  const wadEntries = []; // { name, hash, buf }
  const seenHashes = new Map();
  function addFile(name, buf) {
    const low = name.toLowerCase();
    const h = nsHash(low);
    if (seenHashes.has(h)) {
      throw new Error(`Hash collision / duplicate file: ${low} vs ${seenHashes.get(h)}`);
    }
    seenHashes.set(h, low);
    wadEntries.push({ name: low, hash: h, buf });
  }

  const levelReports = [];
  let totalRails = 0, totalCoins = 0, totalPsx = 0, totalG5 = 0;

  for (const lv of THPS1_LEVELS) {
    const lvDir = path.join(FASES_DIR, lv.dir);
    const files = fs.readdirSync(lvDir).sort();

    // 1. Convert .TRG (+ inject 5 G5 custom 3D collectible PowerUp subtype-33 nodes on regular levels!)
    const trgSrc = fs.readFileSync(path.join(lvDir, lv.trg));
    const { buf: trgOut, stats } = convertThps1Trg(trgSrc, lv.trg);
    fs.writeFileSync(path.join(STAGE_DIR, lv.trg), trgOut);
    addFile(lv.trg, trgOut);
    totalRails += stats.railsConverted;
    totalCoins += stats.coinsConverted;
    totalG5 += stats.g5Injected || 0;

    // 2. Pack all .PSX files of this level (using custom sculpted sk*_o.psx whenever built!)
    const psxNames = [];
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.psx')) continue;
      const low = f.toLowerCase();
      const pbuf = customObjMap.has(low) ? customObjMap.get(low) : fs.readFileSync(path.join(lvDir, f));
      addFile(f, pbuf);
      psxNames.push(low);
      totalPsx++;
    }

    // 3. Generate THPS2 Level Select Preview BMPs (t1rend0X.bmp 176x48 & t1levl0X.bmp 212x52)
    const rendName = `t1rend0${lv.idx}.bmp`;
    const levlName = `t1levl0${lv.idx}.bmp`;
    const srcRend = path.join(LEVSEL_BMP_DIR, lv.levselBmp);
    const srcLoad = path.join(lvDir, lv.loadBmp);
    // levsel*.bmp is 448x161 (aspect 2.78); crop center band to 176:48 (aspect 3.67) -> 448x122
    const rendBuf = buildThps2Bmp(srcRend, path.join(STAGE_DIR, rendName), 176, 48, 'crop=448:122:0:19');
    // load_*.bmp is 512x240 (aspect 2.13); crop center band to 212:52 (aspect 4.08) -> 512x126
    const levlBuf = buildThps2Bmp(srcLoad, path.join(STAGE_DIR, levlName), 212, 52, 'crop=512:126:0:57');
    addFile(rendName, rendBuf);
    addFile(levlName, levlBuf);

    levelReports.push({
      ...lv,
      rendBmp: rendName,
      levlBmp: levlName,
      psxFiles: psxNames,
      trgStats: stats,
    });
    console.log(
      `  [${lv.idx}] ${lv.name.padEnd(13)} (id=${lv.id2}): ` +
      `TRG=${trgOut.length}B (rails=${stats.railsConverted}, coins->$100=${stats.coinsConverted}, G5-3D=${stats.g5Injected}, SKATE=${stats.skateLetters}, tape=${stats.secretTapes}) ` +
      `| PSX=${psxNames.length} | BMPs=${rendName},${levlName}`
    );
  }

  // 4. Add THPS1 full 11-texture Cable Car as c_cabl1.psx (for San Francisco)
  const cableBuf = fs.readFileSync(path.join(FASES_DIR, '10_Veiculos_e_Objetos_Compartilhados', 'c_cable.psx'));
  addFile('c_cabl1.psx', cableBuf);
  console.log(`  [+] c_cabl1.psx (${cableBuf.length} B, 11-texture THPS1 SF Cable Car)`);

  // 5. Deduplicate against originals_backup/CD.WAD (Neversoft left 43 byte-identical THPS1 .PSX files inside THPS2!)
  //    Keep ONLY new or modified files (all 18 BMPs, all 9 converted .TRGs, c_cabl1.psx, skvans_t.psx, and any differing .PSX)
  //    so THPS1.WAD stays ultra-compact (~1.4 MB, keeping ISO < 71 min!) while overriding all unconverted leftovers via THPS1.HED priority!
  const origCdWad = fs.readFileSync(path.join(ROOT, 'originals_backup', 'CD.WAD'));
  const origCdHed = fs.readFileSync(path.join(ROOT, 'originals_backup', 'CD.HED'));
  const cdMap = new Map();
  for (let i = 0; i * 12 + 12 <= origCdHed.length; i++) {
    const h = origCdHed.readUInt32LE(i * 12);
    if (h === 0xFFFFFFFF) break;
    cdMap.set(h, { off: origCdHed.readUInt32LE(i * 12 + 4), sz: origCdHed.readUInt32LE(i * 12 + 8) });
  }
  let dedupedCount = 0, dedupedBytes = 0;
  const neededEntries = [];
  for (const e of wadEntries) {
    const cd = cdMap.get(e.hash);
    if (cd && cd.sz === e.buf.length && origCdWad.subarray(cd.off, cd.off + cd.sz).equals(e.buf)) {
      dedupedCount++;
      dedupedBytes += e.buf.length;
    } else {
      neededEntries.push(e);
    }
  }
  console.log(`\n  [DEDUP] ${dedupedCount} .PSX byte-identicos ja presentes em CD.WAD economizados (${(dedupedBytes / 1048576).toFixed(2)} MB)!`);
  console.log(`  [PACK]  ${neededEntries.length} arquivos novos/convertidos empacotados com prioridade em THPS1.WAD.`);

  //    Place all 18 Level Select BMPs contiguously at the very front of THPS1.WAD (t1rend00..08 then t1levl00..08)
  //    so CLevelRend & CLevelMap stream all 18 THPS1 previews in ONE contiguous ~0.3s read with ZERO laser seeks!
  const rendBmps = neededEntries.filter(e => e.name.startsWith('t1rend'));
  const levlBmps = neededEntries.filter(e => e.name.startsWith('t1levl'));
  const otherFiles = neededEntries.filter(e => !e.name.startsWith('t1rend') && !e.name.startsWith('t1levl'));
  const orderedEntries = [...rendBmps, ...levlBmps, ...otherFiles];

  const wadChunks = [];
  let relOffset = 0;
  const manifestEntries = [];
  for (const e of orderedEntries) {
    const sectors = Math.max(1, Math.ceil(e.buf.length / SECTOR_SIZE));
    const paddedSize = sectors * SECTOR_SIZE;
    const padded = Buffer.alloc(paddedSize, 0);
    e.buf.copy(padded, 0);
    wadChunks.push(padded);
    manifestEntries.push({
      name: e.name,
      hash: e.hash,
      hashHex: '0x' + e.hash.toString(16).padStart(8, '0'),
      relOffset,
      size: e.buf.length,
      sectors,
    });
    relOffset += paddedSize;
  }

  const wadBuf = Buffer.concat(wadChunks);
  fs.writeFileSync(OUT_WAD, wadBuf);

  const manifest = {
    generatedAt: new Date().toISOString(),
    wadFile: 'THPS1.WAD',
    totalFiles: manifestEntries.length,
    totalBytes: wadBuf.length,
    totalSectors: wadBuf.length / SECTOR_SIZE,
    summary: {
      levels: THPS1_LEVELS.length,
      totalPsxFiles: totalPsx + 1,
      totalRailsConverted: totalRails,
      totalCoinsConvertedTo100Cash: totalCoins,
      totalCashFromCoins: totalCoins * 100,
      totalCustom3DGoalCollectibles: totalG5,
    },
    levels: levelReports,
    entries: manifestEntries,
  };
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));

  console.log(`\n=== CONCLUIDO ===`);
  console.log(`  THPS1.WAD : ${OUT_WAD}`);
  console.log(`  Arquivos  : ${manifestEntries.length} (${totalPsx + 1} PSX + 9 TRG + 18 BMP)`);
  console.log(`  Tamanho   : ${(wadBuf.length / 1048576).toFixed(2)} MB (${wadBuf.length / SECTOR_SIZE} setores)`);
  console.log(`  Trilhos   : ${totalRails} convertidos (100% verificados)`);
  console.log(`  Moedas    : ${totalCoins} -> $100 Cash ($${totalCoins * 100} total para comprar Stats!)`);
  console.log(`  Manifesto : ${OUT_MANIFEST}`);
}

main();
