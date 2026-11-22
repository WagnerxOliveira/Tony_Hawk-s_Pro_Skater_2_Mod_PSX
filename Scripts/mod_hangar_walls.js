#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Level 1 (The Hangar) Wall Murals Modder
 *
 * Composites high-resolution, 256-color (8-bit BGR555) wall murals of Lulao & Bolsonaro
 * directly onto 6 prominent, upright (flipV=0), dedicated-palette (refs=1) walls in
 * skhan_l.psx (CD.WAD idx=13 — shared by BOTH 1-Player Career/Free Skate and 2-Player Hangar!):
 *   - lib#47 (128x64, pal 0xdcdfd62e, "Mullet Falls Airfield" 2000x750 giant wall): Lulao + Bolsonaro Dual Mural
 *   - lib#48 (128x64, pal 0xd68c9cc6, "Make 'Em Pay!" 2000x667 giant wall): Bolsonaro + Lulao Dual Mural
 *   - lib#52 ( 64x64, pal 0x4a5bfdaa, Hangar graffiti wall): Lulao Wall Mural
 *   - lib#53 ( 64x64, pal 0x40231b5b, "Montana Civil Air Patrol" 1000x667 wall): Bolsonaro Wall Mural
 *   - lib#54 ( 64x64, pal 0x9feab851, Hangar main 821x840 wall): Lulao Wall Mural
 *   - lib#55 ( 64x64, pal 0xbb6f18de, Hangar graffiti wall): Bolsonaro Wall Mural
 *
 * Strictly preserves exact skhan_l.psx size (316,604 B), PSX headers, palette IDs, and 0x0000 opacity rules!
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const ffmpegExe = path.join(rootDir, 'tools', 'bin', 'ffmpeg', 'ffmpeg-9.1-essentials_build', 'bin', 'ffmpeg.exe');
const lulaoImg = path.join(rootDir, 'fotos_para_modificar_nos_skatistas', 'lulao.png');
const bolsoImg = path.join(rootDir, 'fotos_para_modificar_nos_skatistas', 'bolsonaro.png');
const backupDir = path.join(rootDir, 'originals_backup');
const previewDir = path.join(rootDir, 'build', '_hangar_preview');

function nsHash(str) {
  let v1 = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i); if (c >= 65 && c <= 90) c += 32;
    let a1 = (c ^ v1) & 0xFF;
    for (let k = 0; k < 8; k++) { v1 = (((v1 << 1) | (v1 >>> 31)) >>> 0); if (a1 & 1) v1 = (v1 ^ 0xEDB88320) >>> 0; a1 >>>= 1; }
  }
  return v1 >>> 0;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function loadCroppedRgba(imgPath, vf) {
  const r = spawnSync(ffmpegExe, ['-v', 'error', '-i', imgPath, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg erro em ${imgPath}: ${r.stderr.toString()}`);
  return r.stdout;
}

function crc32(buf) {
  let c = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function writePng(filePath, w, h, rgba) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 4)] = 0; rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4); }
  fs.writeFileSync(filePath, Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]));
}

function medianCutPalette(pixels, maxColors) {
  if (!pixels.length) return [[8, 8, 8]];
  let buckets = [pixels];
  while (buckets.length < maxColors) {
    let bestIdx = -1, bestScore = -1, bestChan = 0;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.length < 2) continue;
      let r0=255,r1=0,g0=255,g1=0,b0=255,b1=0;
      for (const p of b) {
        if(p[0]<r0)r0=p[0]; if(p[0]>r1)r1=p[0];
        if(p[1]<g0)g0=p[1]; if(p[1]>g1)g1=p[1];
        if(p[2]<b0)b0=p[2]; if(p[2]>b1)b1=p[2];
      }
      const dr=r1-r0, dg=g1-g0, db=b1-b0, range=Math.max(dr,dg,db);
      if (range === 0) continue;
      const score = range * Math.sqrt(b.length);
      if (score > bestScore) { bestScore = score; bestIdx = i; bestChan = (dr>=dg&&dr>=db)?0:(dg>=db?1:2); }
    }
    if (bestIdx < 0) break;
    const b = buckets[bestIdx];
    b.sort((a, c) => a[bestChan] - c[bestChan]);
    const mid = b.length >> 1;
    buckets.splice(bestIdx, 1, b.slice(0, mid), b.slice(mid));
  }
  return buckets.map(b => {
    let sr=0,sg=0,sb=0; for (const p of b) { sr+=p[0]; sg+=p[1]; sb+=p[2]; }
    return [Math.round(sr/b.length), Math.round(sg/b.length), Math.round(sb/b.length)];
  });
}

function rgbToBgr555Opaque(r, g, b) {
  let v = ((r >> 3) & 0x1F) | (((g >> 3) & 0x1F) << 5) | (((b >> 3) & 0x1F) << 10);
  if (v === 0) v = 0x0421;
  return v;
}

function quantize256(rgba, w, h) {
  const px = [];
  for (let i = 0; i < w * h; i++) px.push([rgba[i*4]&0xF8, rgba[i*4+1]&0xF8, rgba[i*4+2]&0xF8]);
  const palRgb = medianCutPalette(px, 256);
  while (palRgb.length < 256) palRgb.push([8, 8, 8]);
  const palBgr555 = new Uint16Array(256);
  const eff = new Array(256);
  for (let c = 0; c < 256; c++) {
    const v = rgbToBgr555Opaque(palRgb[c][0], palRgb[c][1], palRgb[c][2]);
    palBgr555[c] = v;
    eff[c] = [((v&0x1F)*255/31)|0, (((v>>5)&0x1F)*255/31)|0, (((v>>10)&0x1F)*255/31)|0];
  }
  const indices = Buffer.alloc(w * h);
  const outRgba = Buffer.alloc(w * h * 4);
  const errBuf = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { errBuf[i*3]=rgba[i*4]; errBuf[i*3+1]=rgba[i*4+1]; errBuf[i*3+2]=rgba[i*4+2]; }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const r = clamp(errBuf[idx*3],0,255), g = clamp(errBuf[idx*3+1],0,255), b = clamp(errBuf[idx*3+2],0,255);
      let best = 0, bestD = 1e18;
      for (let c = 0; c < 256; c++) {
        const dr=r-eff[c][0], dg=g-eff[c][1], db=b-eff[c][2];
        const d = dr*dr*0.30 + dg*dg*0.59 + db*db*0.11;
        if (d < bestD) { bestD = d; best = c; if (d === 0) break; }
      }
      indices[idx] = best;
      const [qr, qg, qb] = eff[best];
      outRgba[idx*4]=qr; outRgba[idx*4+1]=qg; outRgba[idx*4+2]=qb; outRgba[idx*4+3]=255;
      const er=(r-qr)*0.58, eg=(g-qg)*0.58, eb=(b-qb)*0.58;
      const sp=(nx,ny,wt)=>{ if(nx>=0&&nx<w&&ny>=0&&ny<h){const ni=(ny*w+nx)*3; errBuf[ni]+=er*wt; errBuf[ni+1]+=eg*wt; errBuf[ni+2]+=eb*wt;} };
      sp(x+1,y,7/16); sp(x-1,y+1,3/16); sp(x,y+1,5/16); sp(x+1,y+1,1/16);
    }
  }
  return { palBgr555, indices, outRgba };
}

function parsePsxTexLib(buf) {
  const ptrMeta = buf.readUInt32LE(4), numObjs = buf.readUInt32LE(8);
  const numMeshes = buf.readUInt32LE(12 + numObjs * 36);
  let mpos = ptrMeta;
  while (mpos + 4 <= buf.length) { const tag = buf.readUInt32LE(mpos); mpos += 4; if (tag === 0xFFFFFFFF) break; mpos += 4 + buf.readUInt32LE(mpos); }
  mpos += numMeshes * 4;
  const numTexRefs = buf.readUInt32LE(mpos); mpos += 4 + numTexRefs * 4;
  const numPal16 = buf.readUInt32LE(mpos); mpos += 4;
  const pal16 = new Map();
  for (let i = 0; i < numPal16; i++) { pal16.set(buf.readUInt32LE(mpos), { offset: mpos + 4, count: 16, refs: 0 }); mpos += 36; }
  const numPal256 = buf.readUInt32LE(mpos); mpos += 4;
  const pal256 = new Map();
  for (let i = 0; i < numPal256; i++) { pal256.set(buf.readUInt32LE(mpos), { offset: mpos + 4, count: 256, refs: 0 }); mpos += 516; }
  const numTex = buf.readUInt32LE(mpos); mpos += 4;
  const texOffs = Array.from({ length: numTex }, (_, i) => buf.readUInt32LE(mpos + i * 4));
  const textures = texOffs.map((to, i) => {
    const palSize = buf.readUInt32LE(to + 4), palId = buf.readUInt32LE(to + 8);
    const w = buf.readUInt16LE(to + 16), h = buf.readUInt16LE(to + 18);
    const nextOff = (i + 1 < numTex) ? texOffs[i + 1] : buf.length;
    const palInfo = palSize === 16 ? pal16.get(palId) : pal256.get(palId);
    if (palInfo) palInfo.refs++;
    return { i, palSize, palId, w, h, dataOff: to + 20, dataLen: nextOff - (to + 20), palInfo };
  });
  return { textures };
}

function decode256ToRgba(buf, t) {
  const rgba = Buffer.alloc(t.w * t.h * 4);
  const pal = [];
  for (let c = 0; c < 256; c++) {
    const v = buf.readUInt16LE(t.palInfo.offset + c * 2);
    pal.push([((v&0x1F)*255/31)|0, (((v>>5)&0x1F)*255/31)|0, (((v>>10)&0x1F)*255/31)|0]);
  }
  for (let i = 0; i < t.w * t.h; i++) {
    const p = pal[buf[t.dataOff + i]];
    rgba[i*4]=p[0]; rgba[i*4+1]=p[1]; rgba[i*4+2]=p[2]; rgba[i*4+3]=255;
  }
  return rgba;
}

// Composite a clean portrait mural onto an existing Hangar concrete wall (preserving architectural wall border + subtle weathered grit!)
function compositeSingleWallMural(origWallRgba, W, H, faceRgba, fw, fh, padX, padY) {
  const out = Buffer.from(origWallRgba);
  const ox = Math.floor((W - fw) / 2), oy = Math.floor((H - fh) / 2);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fx = x - ox, fy = y - oy;
      if (fx >= 0 && fx < fw && fy >= 0 && fy < fh) {
        const fo = (fy * fw + fx) * 4;
        const wo = (y * W + x) * 4;
        // Thin dark poster frame + slight weathered concrete texture multiplication so it looks painted on the Hangar wall!
        const isBorder = (fx === 0 || fx === fw - 1 || fy === 0 || fy === fh - 1);
        if (isBorder) {
          out[wo] = 28; out[wo+1] = 28; out[wo+2] = 30; out[wo+3] = 255;
        } else {
          // Subtle concrete luminance grain (12% influence) keeps faces super clear & vibrant while fitting Hangar lighting!
          const wLum = (origWallRgba[wo]*0.30 + origWallRgba[wo+1]*0.59 + origWallRgba[wo+2]*0.11) / 145;
          const grit = clamp(lerp(1.0, wLum, 0.14), 0.84, 1.08);
          out[wo]   = clamp(Math.round(faceRgba[fo]   * grit), 8, 250);
          out[wo+1] = clamp(Math.round(faceRgba[fo+1] * grit), 8, 250);
          out[wo+2] = clamp(Math.round(faceRgba[fo+2] * grit), 8, 250);
          out[wo+3] = 255;
        }
      }
    }
  }
  return out;
}

// Composite BOTH Lulao & Bolsonaro side-by-side on a giant 128x64 Hangar main wall!
function compositeDualWallMural(origWallRgba, leftRgba, rightRgba) {
  const W = 128, H = 64, fw = 56, fh = 56;
  const out = Buffer.from(origWallRgba);
  const place = (src, ox, oy) => {
    for (let fy = 0; fy < fh; fy++) {
      for (let fx = 0; fx < fw; fx++) {
        const x = ox + fx, y = oy + fy;
        const fo = (fy * fw + fx) * 4, wo = (y * W + x) * 4;
        const isBorder = (fx === 0 || fx === fw - 1 || fy === 0 || fy === fh - 1);
        if (isBorder) {
          out[wo] = 24; out[wo+1] = 24; out[wo+2] = 28; out[wo+3] = 255;
        } else {
          const wLum = (origWallRgba[wo]*0.30 + origWallRgba[wo+1]*0.59 + origWallRgba[wo+2]*0.11) / 145;
          const grit = clamp(lerp(1.0, wLum, 0.12), 0.86, 1.06);
          out[wo]   = clamp(Math.round(src[fo]   * grit), 8, 250);
          out[wo+1] = clamp(Math.round(src[fo+1] * grit), 8, 250);
          out[wo+2] = clamp(Math.round(src[fo+2] * grit), 8, 250);
          out[wo+3] = 255;
        }
      }
    }
  };
  place(leftRgba, 5, 4);
  place(rightRgba, 67, 4);
  return out;
}

// ============================================================================
// MAIN EXECUTION (--preview or apply)
// ============================================================================
const previewOnly = process.argv.includes('--preview');
const origHed = fs.readFileSync(path.join(backupDir, 'CD.HED'));
const origWad = fs.readFileSync(path.join(backupDir, 'CD.WAD'));

const libHash = nsHash('skhan_l.psx');
let libOff = -1, libSize = 0, libIdx = -1;
for (let i = 0; i < (origHed.length - 4) / 12; i++) {
  if (origHed.readUInt32LE(i * 12) === libHash) {
    libIdx = i; libOff = origHed.readUInt32LE(i * 12 + 4); libSize = origHed.readUInt32LE(i * 12 + 8); break;
  }
}
if (libOff < 0) throw new Error('skhan_l.psx nao encontrado em CD.HED!');
const skhanLib = Buffer.from(origWad.subarray(libOff, libOff + libSize));
const info = parsePsxTexLib(skhanLib);

// Prepare sharp, tightly-framed portraits (56x56 for 128x64 dual murals & 54x54 for 64x64 single murals)
// Dynamic crop for Bolsonaro's laughing photo (315x397 -> clean square crop around face & head!)
function readPngDims(pngPath) {
  const hdr = Buffer.alloc(24); const fd = fs.openSync(pngPath, 'r');
  fs.readSync(fd, hdr, 0, 24, 0); fs.closeSync(fd);
  return { w: hdr.readUInt32BE(16), h: hdr.readUInt32BE(20) };
}
const bd = readPngDims(bolsoImg);
const bCropW = Math.min(bd.w, Math.round(bd.w * 0.78));
const bCropH = Math.min(bd.h - 14, bCropW);
const bolsoVf56 = `crop=${bCropW}:${bCropH}:0:14,eq=brightness=0.08:contrast=1.14:saturation=1.08,scale=56:56:flags=lanczos`;
const bolsoVf54 = `crop=${bCropW}:${bCropH}:0:14,eq=brightness=0.08:contrast=1.14:saturation=1.08,scale=54:54:flags=lanczos`;

const lulao56 = loadCroppedRgba(lulaoImg, 'crop=290:318:14:4,scale=56:56:flags=lanczos');
const bolso56 = loadCroppedRgba(bolsoImg, bolsoVf56);
const lulao54 = loadCroppedRgba(lulaoImg, 'crop=290:318:14:4,scale=54:54:flags=lanczos');
const bolso54 = loadCroppedRgba(bolsoImg, bolsoVf54);

const wallTargets = [
  { idx: 47, palId: 0xdcdfd62e, name: 'wall47_mullet_falls_Lulao_Bolso', mode: 'dual', left: lulao56, right: bolso56 },
  { idx: 48, palId: 0xd68c9cc6, name: 'wall48_make_em_pay_Bolso_Lulao',  mode: 'dual', left: bolso56, right: lulao56 },
  { idx: 52, palId: 0x4a5bfdaa, name: 'wall52_graffiti_Lulao',           mode: 'single', face: lulao54, fw: 54, fh: 54 },
  { idx: 53, palId: 0x40231b5b, name: 'wall53_montana_cap_Bolsonaro',    mode: 'single', face: bolso54, fw: 54, fh: 54 },
  { idx: 54, palId: 0x9feab851, name: 'wall54_main_wall_Lulao',          mode: 'single', face: lulao54, fw: 54, fh: 54 },
  { idx: 55, palId: 0xbb6f18de, name: 'wall55_graffiti_Bolsonaro',       mode: 'single', face: bolso54, fw: 54, fh: 54 },
];

console.log('=== Aplicando murais 256 cores de Lulao e Bolsonaro em 6 paredes da Fase 1 (The Hangar / skhan_l.psx) ===');
fs.mkdirSync(previewDir, { recursive: true });
for (const wt of wallTargets) {
  const t = info.textures[wt.idx];
  if (!t || t.palId !== wt.palId || t.palSize !== 256 || t.palInfo.refs !== 1) {
    throw new Error(`Alvo invalido em skhan_l.psx tex[${wt.idx}] (palId=0x${t?.palId?.toString(16)}, refs=${t?.palInfo?.refs})!`);
  }
  const origRgba = decode256ToRgba(skhanLib, t);
  const compRgba = wt.mode === 'dual'
    ? compositeDualWallMural(origRgba, wt.left, wt.right)
    : compositeSingleWallMural(origRgba, t.w, t.h, wt.face, wt.fw, wt.fh);
  const q = quantize256(compRgba, t.w, t.h);
  for (let c = 0; c < 256; c++) skhanLib.writeUInt16LE(q.palBgr555[c], t.palInfo.offset + c * 2);
  q.indices.copy(skhanLib, t.dataOff);
  writePng(path.join(previewDir, `${wt.name}.png`), t.w, t.h, q.outRgba);
  console.log(`  [OK] skhan_l.psx tex[${String(wt.idx).padStart(2)}] (${t.w}x${t.h}, pal=0x${wt.palId.toString(16)}) -> ${wt.name}`);
}
console.log(`\nPreviews salvos em: ${previewDir}`);

if (previewOnly) {
  console.log('Modo --preview ativo: CD.WAD nao foi alterado ainda.');
  process.exit(0);
}

const curWad = fs.readFileSync(path.join(rootDir, 'CD.WAD'));
skhanLib.copy(curWad, libOff);
fs.writeFileSync(path.join(rootDir, 'CD.WAD'), curWad);
console.log(`[CD.WAD idx=${libIdx} @ 0x${libOff.toString(16)}] skhan_l.psx (${libSize} B) atualizado com 100% de precisao!`);
