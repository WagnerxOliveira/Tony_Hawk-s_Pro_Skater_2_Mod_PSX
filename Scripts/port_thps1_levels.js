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
      [-29583,  -869, 20791], // #3 Lower Atrium open floor by car (Ho_Car_Mall, minWallDist=498!)
      [-13620,  2192,  7934], // #4 Mid-lower Mall open rail corridor (Ho_Rail_Mall, wide open!)
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

// Per-level THPS1 -> THPS2 .TRG Type-1 (Baddy) Shatter (0x4309) & Script SFX (0x4290/0x4291/0x4508) Remap Table.
// Every target ID is 100% verified present inside the level's assigned THPS2 .SFX/.VAB bank (resident SPU RAM, 0 ms CD stall!).
// Note on CModel::KnockDown (0x80044218):
//   - shatterType 1 -> SFX 104 (ny/ss) + 0x80049D34 skater bump + bounce 102/103
//   - shatterType 3 -> SFX  60 (hangar/school2/venice/philly/mar) + 0x80049D34 skater bump + bounce 69
//   - shatterType 5 in THPS1 Warehouse crates skips BOTH hit SFX and skater bump in THPS2 -> remap to 3!
const THPS1_SFX_REMAP = {
  'skware_t.trg': { // hangar.sfx: 60, 69, 106, 107, 256, 308, 309
    shatter: { 1: 3, 4: 3, 5: 3 },
    sfx:     { 83: 60, 84: 69, 86: 106, 87: 107, 88: 60, 152: 256, 153: 308, 154: 309 },
  },
  'skschl_t.trg': { // school2.sfx: 60, 69, 83, 84, 256, 267, 316
    shatter: {},
    sfx:     { 62: 256, 63: 83, 65: 267, 66: 60, 68: 69 },
    injectG4Sfx: { nodeId: 252, sfxId: 83 }, // G4 "Grind 5 Mesas do MEC" -> crisp heavy wood/table smash!
  },
  'skmall_t.trg': { // ny.sfx: 102, 103, 104, 106, 107
    shatter: { 4: 1, 5: 1 },
    sfx:     { 83: 104, 76: 106, 77: 107, 85: 106, 89: 107 },
  },
  'skdown_t.trg': { // ny.sfx: 102, 103, 104, 106, 107
    shatter: { 4: 1 },
    sfx:     { 108: 104, 76: 106, 86: 106, 87: 107, 88: 106 },
  },
  'skjam_t.trg': {  // venice.sfx: 60, 69, 83, 84
    shatter: { 1: 3, 2: 3 },
    sfx:     { 93: 60, 94: 69, 95: 60, 96: 69, 97: 83, 98: 84, 99: 60, 100: 69, 101: 83 },
  },
  'sksf_t.trg': {   // philly.sfx: 60, 69
    shatter: { 1: 3, 2: 3 },
    sfx:     { 124: 60, 86: 60, 87: 69, 88: 60, 123: 69, 125: 60, 126: 69, 127: 60, 128: 69 },
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
  let shattersRemapped = 0;
  let sfxRemapped = 0;
  const sfxSpec = THPS1_SFX_REMAP[fname.toLowerCase()] || null;

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
      let nodeCopy = Buffer.from(srcBuf.subarray(o, end));

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
      } else if (type === 1 && sfxSpec) {
        // Baddy / Interactive Object script tail starts strictly AFTER Pos(12) + Angles(6)!
        // Header: u16 type(1), u16 sub, u16 flags, u16 nLinks, u16 links[nLinks], u16 a, u16 b, pad-to-abs-4, Pos(12), Ang(6)
        const nl = nodeCopy.readUInt16LE(6);
        const posRel = ((o + 12 + nl * 2 + 3) & ~3) - o;
        const scStart = posRel + 18;
        if (scStart >= 30 && scStart + 2 <= nodeCopy.length) {
          for (let p = scStart; p + 4 <= nodeCopy.length; p += 2) {
            const op = nodeCopy.readUInt16LE(p);
            const arg = nodeCopy.readUInt16LE(p + 2);
            if (op === 0x4309 && sfxSpec.shatter[arg] !== undefined) {
              nodeCopy.writeUInt16LE(sfxSpec.shatter[arg], p + 2);
              shattersRemapped++;
            } else if ((op === 0x4290 || op === 0x4291 || op === 0x4508) && sfxSpec.sfx[arg] !== undefined) {
              nodeCopy.writeUInt16LE(sfxSpec.sfx[arg], p + 2);
              sfxRemapped++;
            }
          }
          // Optional 4-byte 0x4290(sfxId) injection right before G4 0x42C0 (exact +4 B preserves mod-4 parity!)
          if (sfxSpec.injectG4Sfx && i === sfxSpec.injectG4Sfx.nodeId) {
            let insPos = -1;
            for (let p = scStart; p + 2 <= nodeCopy.length; p += 2) {
              if (nodeCopy.readUInt16LE(p) === 0x42C0) { insPos = p; break; }
            }
            if (insPos < 0) {
              throw new Error(`${fname} node #${i}: expected 0x42C0 for injectG4Sfx!`);
            }
            const ins = Buffer.alloc(4);
            ins.writeUInt16LE(0x4290, 0);
            ins.writeUInt16LE(sfxSpec.injectG4Sfx.sfxId, 2);
            nodeCopy = Buffer.concat([nodeCopy.subarray(0, insPos), ins, nodeCopy.subarray(insPos)]);
            sfxRemapped++;
          }
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
    stats: { numNodes: newNumNodes, railsConverted, coinsConverted, skateLetters, secretTapes, cableRenamed, g5Injected, shattersRemapped, sfxRemapped },
  };
}

/**
 * Convert a THPS1 512x240 competition loading screen (loadcp1/2/3.bmp) into an exact THPS2
 * s2bgd7/8/9.bmp-compatible 512x240 8bpp uncompressed Windows BMP (exact 123,960 B / 61 sectors,
 * offBits=1078, nCol=0, imgSize=0), cropping out THPS1's baked-in bottom "LOADING..." bar so
 * THPS2's native progress bar & "PRESS X TO CONTINUE" render cleanly over a dark slate footer!
 */
function buildCompLoadBmp(srcBmpPath, outBmpPath) {
  const palPng = outBmpPath + '.pal.png';
  const rawBmp = outBmpPath + '.raw.bmp';
  // Keep top 512x174 (entire level screenshot + competition title + rules), frame cleanly inside 512x240
  // on deep charcoal (#0a0c12) with crisp steel-gold border + divider line above THPS2's y=210 prompt!
  const vfBase = [
    'crop=512:174:0:0',
    'pad=512:240:0:6:color=0x0a0c12',
    'drawbox=x=0:y=6:w=512:h=174:color=0x464e62:t=1',
    'drawbox=x=16:y=183:w=480:h=2:color=0xc89a2c:t=fill',
    'drawbox=x=0:y=0:w=512:h=240:color=0x161a24:t=1',
  ].join(',');

  const r1 = spawnSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', srcBmpPath,
    '-vf', `${vfBase},palettegen=max_colors=256:reserve_transparent=0:stats_mode=single`,
    palPng,
  ]);
  if (r1.status !== 0) throw new Error(`ffmpeg comp palettegen failed for ${srcBmpPath}: ${r1.stderr?.toString()}`);

  const r2 = spawnSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', srcBmpPath, '-i', palPng,
    '-lavfi', `${vfBase} [x]; [x][1:v] paletteuse=dither=floyd_steinberg`,
    '-pix_fmt', 'pal8', '-f', 'image2', rawBmp,
  ]);
  if (r2.status !== 0) throw new Error(`ffmpeg comp paletteuse failed for ${srcBmpPath}: ${r2.stderr?.toString()}`);

  const b = fs.readFileSync(rawBmp);
  const offBits = b.readUInt32LE(10);
  const w = b.readInt32LE(18);
  const h = b.readInt32LE(22);
  const bpp = b.readUInt16LE(28);
  if (w !== 512 || Math.abs(h) !== 240 || bpp !== 8) {
    throw new Error(`Comp BMP verify failed for ${outBmpPath}: got ${w}x${h} ${bpp}bpp`);
  }
  const stride = 512;
  const imgSize = stride * 240; // 122,880 B
  // Match exact THPS2 s2bgd7/8/9.bmp specification: 1078 + 122880 + 2 = 123,960 B, imgSize=0, nCol=0!
  const out = Buffer.alloc(123960, 0);
  out.write('BM', 0, 'ascii');
  out.writeUInt32LE(123960, 2);
  out.writeUInt32LE(1078, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(512, 18);
  out.writeInt32LE(240, 22); // bottom-up
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(8, 28);
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(0, 34);  // biSizeImage = 0 (exact match to s2bgd7/8/9.bmp)
  out.writeUInt32LE(0, 46);  // biClrUsed = 0 (256 full palette)
  const palLen = Math.min(1024, offBits - 54);
  b.copy(out, 54, 54, 54 + palLen);
  if (h > 0) {
    b.copy(out, 1078, offBits, offBits + imgSize);
  } else {
    for (let y = 0; y < 240; y++) {
      const srcRow = offBits + (239 - y) * stride;
      b.copy(out, 1078 + y * stride, srcRow, srcRow + stride);
    }
  }
  fs.writeFileSync(outBmpPath, out);
  try { fs.unlinkSync(palPng); } catch {}
  try { fs.unlinkSync(rawBmp); } catch {}
  return out;
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

    // 3B. For THPS1 Competition levels (Chicago=3, Burnside=6, Roswell=8), generate full-screen
    //     512x240 8bpp Competition Invite & Rules screen (t1comp0/1/2.bmp) matching THPS2 s2bgd7/8/9.bmp!
    let compBmpName = null;
    if (lv.isComp) {
      const compIdx = lv.idx === 3 ? 0 : (lv.idx === 6 ? 1 : 2);
      compBmpName = `t1comp${compIdx}.bmp`;
      const compBuf = buildCompLoadBmp(srcLoad, path.join(STAGE_DIR, compBmpName));
      addFile(compBmpName, compBuf);
    }

    levelReports.push({
      ...lv,
      rendBmp: rendName,
      levlBmp: levlName,
      compBmp: compBmpName,
      psxFiles: psxNames,
      trgStats: stats,
    });
    console.log(
      `  [${lv.idx}] ${lv.name.padEnd(13)} (id=${lv.id2}): ` +
      `TRG=${trgOut.length}B (rails=${stats.railsConverted}, coins->$100=${stats.coinsConverted}, G5-3D=${stats.g5Injected}, shat=${stats.shattersRemapped}, sfx=${stats.sfxRemapped}) ` +
      `| PSX=${psxNames.length} | BMPs=${rendName},${levlName}${compBmpName ? ',' + compBmpName : ''}`
    );
  }

  // 4. Add THPS1 full 11-texture Cable Car as c_cabl1.psx (for San Francisco)
  const cableBuf = fs.readFileSync(path.join(FASES_DIR, '10_Veiculos_e_Objetos_Compartilhados', 'c_cable.psx'));
  addFile('c_cabl1.psx', cableBuf);
  console.log(`  [+] c_cabl1.psx (${cableBuf.length} B, 11-texture THPS1 SF Cable Car)`);

  // 5. Deduplicate against originals_backup/CD.WAD (Neversoft left 43 byte-identical THPS1 .PSX files inside THPS2!)
  const origCdWad = fs.readFileSync(path.join(ROOT, 'originals_backup', 'CD.WAD'));
  const origCdHed = fs.readFileSync(path.join(ROOT, 'originals_backup', 'CD.HED'));
  const curCdWad  = fs.readFileSync(path.join(ROOT, 'CD.WAD'));
  const curCdHed  = fs.readFileSync(path.join(ROOT, 'CD.HED'));
  const crypto    = require('crypto');
  const sha256    = b => crypto.createHash('sha256').update(b).digest('hex');

  const cdMap = new Map();
  for (let i = 0; i * 12 + 12 <= origCdHed.length; i++) {
    const h = origCdHed.readUInt32LE(i * 12);
    if (h === 0xFFFFFFFF) break;
    cdMap.set(h, { idx: i, off: origCdHed.readUInt32LE(i * 12 + 4), sz: origCdHed.readUInt32LE(i * 12 + 8) });
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

  // 6. ZERO-MINUTE-71-SEEK CD.WAD IN-PLACE PLACEMENT:
  //    A) Place t1rend00..08 (45s) into dead PRE-shadowed CD.WAD[573] (s2bgd3.bmp, 61s @ LBA 7955, 100% inside levelsel.pre!)
  //       and t1levl00..08 (54s) into dead PRE-shadowed CD.WAD[578] (s2bgd5.bmp, 61s @ LBA 8049, 100% inside equipsel.pre!).
  //       -> ZERO CD.HED offset shift! Eliminates the 64-frame (-1.07s) Minute-71 seek on EVERY Level Select entry!
  //    B) Repack closed THPS1 zone CD.WAD[1127..1185] (LBA 18686..23262, EXACTLY 4,577 -> 4,577 sectors, Delta = 0!)
  //       with ALL 19 modified THPS1 files (9 TRGs + 4 divergent PSXs + 6 sculpted 3D sk*_o.psx) in optimal ascending
  //       level-load order (_t.trg -> _l.psx -> _o.psx -> .psx), keeping ALL 1,472 THPS2 entries at 0 offset shift!
  //       -> Eliminates ALL 3 full-disc Minute-71 seeks (-2.5..-4.5s) on THPS1 level loads!
  const rendBmps = neededEntries.filter(e => e.name.startsWith('t1rend')).sort((a, b) => a.name.localeCompare(b.name));
  const levlBmps = neededEntries.filter(e => e.name.startsWith('t1levl')).sort((a, b) => a.name.localeCompare(b.name));
  if (rendBmps.length !== 9 || levlBmps.length !== 9) {
    throw new Error(`Esperados 9 t1rend + 9 t1levl BMPs, encontrados ${rendBmps.length}+${levlBmps.length}`);
  }

  const REND_SLOT_IDX = 573; // s2bgd3.bmp (61s @ LBA 7955, 100% shadowed by levelsel.pre)
  const LEVL_SLOT_IDX = 578; // s2bgd5.bmp (61s @ LBA 8049, 100% shadowed by equipsel.pre)
  const rendSlotOff = origCdHed.readUInt32LE(REND_SLOT_IDX * 12 + 4);
  const rendSlotEnd = origCdHed.readUInt32LE((REND_SLOT_IDX + 1) * 12 + 4);
  const levlSlotOff = origCdHed.readUInt32LE(LEVL_SLOT_IDX * 12 + 4);
  const levlSlotEnd = origCdHed.readUInt32LE((LEVL_SLOT_IDX + 1) * 12 + 4);
  if (rendSlotEnd - rendSlotOff !== 61 * SECTOR_SIZE || levlSlotEnd - levlSlotOff !== 61 * SECTOR_SIZE) {
    throw new Error('Slots CD.WAD[573]/[578] nao possuem 61 setores originais!');
  }

  const rendBlock = Buffer.alloc(61 * SECTOR_SIZE, 0);
  const cdWadBmpsMeta = [];
  for (let k = 0; k < 9; k++) {
    const e = rendBmps[k];
    if (e.buf.length > 5 * SECTOR_SIZE) throw new Error(`${e.name} > 5 setores`);
    e.buf.copy(rendBlock, k * 5 * SECTOR_SIZE);
    cdWadBmpsMeta.push({
      name: e.name, hash: e.hash, hashHex: '0x' + e.hash.toString(16).padStart(8, '0'),
      cdHedIdx: REND_SLOT_IDX, cdWadOff: rendSlotOff + k * 5 * SECTOR_SIZE,
      lba: 455 + ((rendSlotOff >> 11) + k * 5), size: e.buf.length, sectors: 5, sha256: sha256(e.buf),
    });
  }
  rendBlock.copy(curCdWad, rendSlotOff);

  const levlBlock = Buffer.alloc(61 * SECTOR_SIZE, 0);
  for (let k = 0; k < 9; k++) {
    const e = levlBmps[k];
    if (e.buf.length > 6 * SECTOR_SIZE) throw new Error(`${e.name} > 6 setores`);
    e.buf.copy(levlBlock, k * 6 * SECTOR_SIZE);
    cdWadBmpsMeta.push({
      name: e.name, hash: e.hash, hashHex: '0x' + e.hash.toString(16).padStart(8, '0'),
      cdHedIdx: LEVL_SLOT_IDX, cdWadOff: levlSlotOff + k * 6 * SECTOR_SIZE,
      lba: 455 + ((levlSlotOff >> 11) + k * 6), size: e.buf.length, sectors: 6, sha256: sha256(e.buf),
    });
  }
  levlBlock.copy(curCdWad, levlSlotOff);

  // Closed-zone repack of CD.WAD[1127..1185] (exact 4,577 -> 4,577 sectors, 0 shift outside [1127..1185]!)
  const ZONE_START_IDX = 1127;
  const ZONE_END_IDX   = 1185;
  const zoneStartOff   = origCdHed.readUInt32LE(ZONE_START_IDX * 12 + 4);
  const zoneEndOff     = origCdHed.readUInt32LE((ZONE_END_IDX + 1) * 12 + 4);
  const zoneTotalSec   = (zoneEndOff - zoneStartOff) / SECTOR_SIZE;

  const modByHash = new Map();
  const remainingForThps1Wad = [];
  for (const e of neededEntries) {
    if (e.name.startsWith('t1rend') || e.name.startsWith('t1levl')) continue;
    const cd = cdMap.get(e.hash);
    if (cd && cd.idx >= ZONE_START_IDX && cd.idx <= ZONE_END_IDX) {
      modByHash.set(e.hash, e);
    } else {
      remainingForThps1Wad.push(e);
    }
  }

  // Group entries by original index, and within each level cluster sort into exact engine load order:
  //   _t.trg (rank 0) -> _o.psx (rank 1) -> _l.psx (rank 2) -> base .psx (rank 3) -> other (rank 4)
  const LEVEL_GROUPS = [
    [1127, 1131, 'skware'], [1132, 1137, 'skschl'], [1138, 1142, 'skburn'],
    [1143, 1149, 'skmall'], [1150, 1156, 'skjam'],  [1157, 1164, 'skdown'],
    [1165, 1169, 'skvans'], [1170, 1176, 'skros'],  [1177, 1185, 'sksf'],
  ];
  const zoneItems = [];
  for (const [lo, hi, pfx] of LEVEL_GROUPS) {
    const rankMap = new Map([
      [nsHash(`${pfx}_t.trg`), 0],
      [nsHash(`${pfx}_o.psx`), 1],
      [nsHash(`${pfx}_l.psx`), 2],
      [nsHash(`${pfx}.psx`),   3],
    ]);
    const grp = [];
    for (let idx = lo; idx <= hi; idx++) {
      const h = origCdHed.readUInt32LE(idx * 12);
      const oOff = origCdHed.readUInt32LE(idx * 12 + 4);
      const oSz  = origCdHed.readUInt32LE(idx * 12 + 8);
      const mod  = modByHash.get(h);
      const data = mod ? mod.buf : origCdWad.subarray(oOff, oOff + oSz);
      const sec  = Math.max(1, Math.ceil(data.length / SECTOR_SIZE));
      grp.push({ idx, hash: h, name: mod ? mod.name : null, isMod: !!mod, data, size: data.length, sectors: sec, rank: rankMap.has(h) ? rankMap.get(h) : 4 });
    }
    grp.sort((a, b) => (a.rank - b.rank) || (a.idx - b.idx));
    zoneItems.push(...grp);
  }
  const packedSec = zoneItems.reduce((s, it) => s + it.sectors, 0);
  if (packedSec > zoneTotalSec) {
    throw new Error(`Zona CD.WAD[1127..1185] estourou: ${packedSec} > ${zoneTotalSec} setores!`);
  }
  curCdWad.fill(0, zoneStartOff, zoneEndOff);
  let writeOff = zoneStartOff;
  const cdWadZoneMeta = [];
  for (const it of zoneItems) {
    it.data.copy(curCdWad, writeOff);
    curCdHed.writeUInt32LE(writeOff >>> 0, it.idx * 12 + 4);
    curCdHed.writeUInt32LE(it.size >>> 0,  it.idx * 12 + 8);
    if (it.isMod) {
      cdWadZoneMeta.push({
        name: it.name, hash: it.hash, hashHex: '0x' + it.hash.toString(16).padStart(8, '0'),
        cdHedIdx: it.idx, cdWadOff: writeOff, lba: 455 + (writeOff >> 11),
        size: it.size, sectors: it.sectors, sha256: sha256(it.data),
      });
    }
    writeOff += it.sectors * SECTOR_SIZE;
  }

  fs.writeFileSync(path.join(ROOT, 'CD.WAD'), curCdWad);
  fs.writeFileSync(path.join(ROOT, 'CD.HED'), curCdHed);
  console.log(`  [FAST-CDWAD] 18 BMPs LevelSel gravados in-place em CD.WAD[573] (LBA 7955) & CD.WAD[578] (LBA 8049) (0 shift!).`);
  console.log(`  [FAST-CDWAD] ${cdWadZoneMeta.length} arquivos THPS1 (9 TRGs + 4 PSXs + 6 sk*_o.psx esculpidos) gravados na zona fechada CD.WAD[1127..1185] (${packedSec}/${zoneTotalSec} setores, delta=${packedSec - zoneTotalSec}, 0 shift em todos 1.472 itens THPS2!).`);
  console.log(`  [PACK]       ${remainingForThps1Wad.length} arquivos exclusivos empacotados em THPS1.WAD (ultraleve!).`);

  const wadChunks = [];
  let relOffset = 0;
  const manifestEntries = [];
  for (const e of remainingForThps1Wad) {
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
    cdWadInPlace: {
      rendSlotIdx: REND_SLOT_IDX,
      rendBaseSec: rendSlotOff >> 11,
      levlSlotIdx: LEVL_SLOT_IDX,
      levlBaseSec: levlSlotOff >> 11,
      zoneStartIdx: ZONE_START_IDX,
      zoneEndIdx: ZONE_END_IDX,
      zoneStartOff,
      zoneEndOff,
      zoneTotalSectors: zoneTotalSec,
      zoneUsedSectors: packedSec,
      bmps: cdWadBmpsMeta,
      levelFiles: cdWadZoneMeta,
    },
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
  console.log(`  Arquivos  : ${manifestEntries.length} em THPS1.WAD + ${cdWadBmpsMeta.length + cdWadZoneMeta.length} in-place em CD.WAD`);
  console.log(`  Tamanho   : ${(wadBuf.length / 1048576).toFixed(2)} MB (${wadBuf.length / SECTOR_SIZE} setores)`);
  console.log(`  Trilhos   : ${totalRails} convertidos (100% verificados)`);
  console.log(`  Moedas    : ${totalCoins} -> $100 Cash ($${totalCoins * 100} total para comprar Stats!)`);
  console.log(`  Manifesto : ${OUT_MANIFEST}`);
}

main();
