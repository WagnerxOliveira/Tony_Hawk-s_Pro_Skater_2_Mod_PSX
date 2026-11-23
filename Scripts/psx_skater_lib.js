#!/usr/bin/env node
'use strict';

/**
 * Shared PS1 THPS2 (SLUS-01066) Skater Modding Library
 *
 * Provides verified, byte-exact helpers for:
 *  - Neversoft CRC/hash (0x80053F10), PNG I/O, ffmpeg RGBA loading & probing
 *  - 8-bit 256-color AND 4-bit 16-color (nibble-packed!) BGR555 median-cut + Floyd-Steinberg quantizers
 *    (strictly preventing opaque 0x0000 black and preserving exact alpha transparency indices!)
 *  - Exact 4,088-byte s2face*.bmp portrait builder (preserving original metallic bezel & magenta key!)
 *  - Fair-skin hands recolorer (preserving original 0x0000 alpha)
 *  - Crisp PS1-UV-aware horizontal-mirror text/logo rasterizer (so chest text reads LEFT-TO-RIGHT on PS1 GTE!)
 *  - Full .PSX parser, bounding-box/radius recomputer & REAL PS1-polarity 3D textured multi-angle preview renderer!
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const ffmpegExe = path.join(rootDir, 'tools', 'bin', 'ffmpeg', 'ffmpeg-9.1-essentials_build', 'bin', 'ffmpeg.exe');
const ffprobeExe = path.join(rootDir, 'tools', 'bin', 'ffmpeg', 'ffmpeg-9.1-essentials_build', 'bin', 'ffprobe.exe');
const backupDir = path.join(rootDir, 'originals_backup');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

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

function probeDims(imgPath) {
  const r = spawnSync(ffprobeExe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', imgPath], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe falhou em ${imgPath}: ${r.stderr}`);
  const [w, h] = r.stdout.trim().split(',').map(Number);
  return { w, h };
}

function loadRgba(imgPath, w, h, vfExtra = '') {
  const args = ['-v', 'error', '-i', imgPath];
  const vf = [];
  if (vfExtra) vf.push(vfExtra);
  if (w && h) vf.push(`scale=${w}:${h}:flags=lanczos`);
  if (vf.length) args.push('-vf', vf.join(','));
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1');
  const r = spawnSync(ffmpegExe, args, { maxBuffer: 80 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg falhou ao ler ${imgPath}: ${r.stderr.toString()}`);
  return r.stdout;
}

function sampleBilinear(rgba, w, h, fx, fy) {
  const x = clamp(fx, 0, w - 1.001);
  const y = clamp(fy, 0, h - 1.001);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0, ty = y - y0;
  const o00 = (y0 * w + x0) * 4, o10 = (y0 * w + x1) * 4;
  const o01 = (y1 * w + x0) * 4, o11 = (y1 * w + x1) * 4;
  const out = [0, 0, 0, 255];
  for (let c = 0; c < 3; c++) {
    out[c] = Math.round(lerp(lerp(rgba[o00 + c], rgba[o10 + c], tx), lerp(rgba[o01 + c], rgba[o11 + c], tx), ty));
  }
  return out;
}

function crc32(buf) {
  let c = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
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
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  fs.writeFileSync(filePath, Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]));
}

function medianCutPalette(pixels, maxColors) {
  if (pixels.length === 0) return [[8, 8, 8]];
  let buckets = [pixels];
  while (buckets.length < maxColors) {
    let bestIdx = -1, bestScore = -1, bestChan = 0;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.length < 2) continue;
      let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0;
      for (const p of b) {
        if (p[0] < r0) r0 = p[0]; if (p[0] > r1) r1 = p[0];
        if (p[1] < g0) g0 = p[1]; if (p[1] > g1) g1 = p[1];
        if (p[2] < b0) b0 = p[2]; if (p[2] > b1) b1 = p[2];
      }
      const dr = r1 - r0, dg = g1 - g0, db = b1 - b0;
      const range = Math.max(dr, dg, db);
      if (range === 0) continue;
      const score = range * Math.sqrt(b.length);
      if (score > bestScore) {
        bestScore = score; bestIdx = i;
        bestChan = (dr >= dg && dr >= db) ? 0 : (dg >= db ? 1 : 2);
      }
    }
    if (bestIdx < 0) break;
    const b = buckets[bestIdx];
    b.sort((a, c) => a[bestChan] - c[bestChan]);
    const mid = b.length >> 1;
    buckets.splice(bestIdx, 1, b.slice(0, mid), b.slice(mid));
  }
  return buckets.map(b => {
    let sr = 0, sg = 0, sb = 0;
    for (const p of b) { sr += p[0]; sg += p[1]; sb += p[2]; }
    return [Math.round(sr / b.length), Math.round(sg / b.length), Math.round(sb / b.length)];
  });
}

function rgbToBgr555Opaque(r, g, b) {
  const r5 = (r >> 3) & 0x1F, g5 = (g >> 3) & 0x1F, b5 = (b >> 3) & 0x1F;
  let val = r5 | (g5 << 5) | (b5 << 10);
  if (val === 0) val = 0x0421; // NEVER emit 0x0000 transparent black for opaque pixels!
  return val;
}

function quantizeImageForPsx(rgba, w, h, maxColors = 256, reserveTransparentIdx = -1, ditherStrength = 0.58) {
  const opaquePixels = [];
  for (let i = 0; i < w * h; i++) {
    if (reserveTransparentIdx >= 0 && rgba[i * 4 + 3] < 128) continue;
    opaquePixels.push([rgba[i * 4] & 0xF8, rgba[i * 4 + 1] & 0xF8, rgba[i * 4 + 2] & 0xF8]);
  }
  const slots = reserveTransparentIdx >= 0 ? maxColors - 1 : maxColors;
  const palRgb = medianCutPalette(opaquePixels, slots);
  while (palRgb.length < slots) palRgb.push([8, 8, 8]);

  const palBgr555 = new Uint16Array(maxColors);
  const effRgb = new Array(maxColors);
  let pi = 0;
  for (let c = 0; c < maxColors; c++) {
    if (c === reserveTransparentIdx) {
      palBgr555[c] = 0x0000; effRgb[c] = [0, 0, 0];
    } else {
      const [r, g, b] = palRgb[pi++];
      const v = rgbToBgr555Opaque(r, g, b);
      palBgr555[c] = v;
      effRgb[c] = [((v & 0x1F) * 255 / 31) | 0, (((v >> 5) & 0x1F) * 255 / 31) | 0, (((v >> 10) & 0x1F) * 255 / 31) | 0];
    }
  }

  const indices = Buffer.alloc(w * h);
  const outRgba = Buffer.alloc(w * h * 4);
  const errBuf = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    errBuf[i * 3] = rgba[i * 4]; errBuf[i * 3 + 1] = rgba[i * 4 + 1]; errBuf[i * 3 + 2] = rgba[i * 4 + 2];
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (reserveTransparentIdx >= 0 && rgba[idx * 4 + 3] < 128) {
        indices[idx] = reserveTransparentIdx;
        outRgba[idx * 4] = 255; outRgba[idx * 4 + 1] = 0; outRgba[idx * 4 + 2] = 255; outRgba[idx * 4 + 3] = 255;
        continue;
      }
      const r = clamp(errBuf[idx * 3], 0, 255);
      const g = clamp(errBuf[idx * 3 + 1], 0, 255);
      const b = clamp(errBuf[idx * 3 + 2], 0, 255);
      let best = 0, bestD = 1e18;
      for (let c = 0; c < maxColors; c++) {
        if (c === reserveTransparentIdx) continue;
        const dr = r - effRgb[c][0], dg = g - effRgb[c][1], db = b - effRgb[c][2];
        const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bestD) { bestD = d; best = c; if (d === 0) break; }
      }
      indices[idx] = best;
      const [qr, qg, qb] = effRgb[best];
      outRgba[idx * 4] = qr; outRgba[idx * 4 + 1] = qg; outRgba[idx * 4 + 2] = qb; outRgba[idx * 4 + 3] = 255;

      const er = (r - qr) * ditherStrength, eg = (g - qg) * ditherStrength, eb = (b - qb) * ditherStrength;
      const spread = (nx, ny, wt) => {
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && !(reserveTransparentIdx >= 0 && rgba[(ny * w + nx) * 4 + 3] < 128)) {
          const ni = (ny * w + nx) * 3;
          errBuf[ni] += er * wt; errBuf[ni + 1] += eg * wt; errBuf[ni + 2] += eb * wt;
        }
      };
      spread(x + 1, y, 7 / 16);
      spread(x - 1, y + 1, 3 / 16);
      spread(x, y + 1, 5 / 16);
      spread(x + 1, y + 1, 1 / 16);
    }
  }
  return { palBgr555, indices, outRgba };
}

function quantize4BitForPsx(rgba, w, h, reserveTransparentIdx = -1) {
  const q = quantizeImageForPsx(rgba, w, h, 16, reserveTransparentIdx, 0.45);
  const stride = Math.ceil(w / 2);
  const packed = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x += 2) {
      const lo = q.indices[y * w + x] & 0x0F;
      const hi = (x + 1 < w ? q.indices[y * w + x + 1] : 0) & 0x0F;
      packed[y * stride + (x >> 1)] = lo | (hi << 4);
    }
  }
  return { palBgr555: q.palBgr555, packed, outRgba: q.outRgba };
}

function parsePsxStructure(buf) {
  const ptrMeta = buf.readUInt32LE(4);
  const numObjs = buf.readUInt32LE(8);
  const objs = Array.from({ length: numObjs }, (_, i) => {
    const o = 12 + i * 36;
    return { x: buf.readInt32LE(o + 4) / 256, y: buf.readInt32LE(o + 8) / 256, z: buf.readInt32LE(o + 12) / 256 };
  });
  const numMeshes = buf.readUInt32LE(12 + numObjs * 36);
  const meshOffs = Array.from({ length: numMeshes }, (_, i) => buf.readUInt32LE(12 + numObjs * 36 + 4 + i * 4));
  let mpos = ptrMeta;
  while (mpos + 4 <= buf.length) {
    const tag = buf.readUInt32LE(mpos); mpos += 4;
    if (tag === 0xFFFFFFFF) break;
    mpos += 4 + buf.readUInt32LE(mpos);
  }
  const meshHashes = Array.from({ length: numMeshes }, (_, i) => buf.readUInt32LE(mpos + i * 4));
  mpos += numMeshes * 4;
  const numTexRefs = buf.readUInt32LE(mpos); mpos += 4 + numTexRefs * 4;
  const numPal16 = buf.readUInt32LE(mpos); mpos += 4;
  const pal16 = new Map();
  for (let i = 0; i < numPal16; i++) { pal16.set(buf.readUInt32LE(mpos), { offset: mpos + 4, count: 16 }); mpos += 36; }
  const numPal256 = buf.readUInt32LE(mpos); mpos += 4;
  const pal256 = new Map();
  for (let i = 0; i < numPal256; i++) { pal256.set(buf.readUInt32LE(mpos), { offset: mpos + 4, count: 256 }); mpos += 516; }
  const numTex = buf.readUInt32LE(mpos); mpos += 4;
  const texOffs = Array.from({ length: numTex }, (_, i) => buf.readUInt32LE(mpos + i * 4));
  const textures = [];
  for (let i = 0; i < numTex; i++) {
    const to = texOffs[i];
    const palSize = buf.readUInt32LE(to + 4), palId = buf.readUInt32LE(to + 8), texIdx = buf.readUInt32LE(to + 12);
    const w = buf.readUInt16LE(to + 16), h = buf.readUInt16LE(to + 18);
    const nextOff = (i + 1 < numTex) ? texOffs[i + 1] : buf.length;
    textures.push({
      i, texIdx, palSize, palId, w, h, dataOff: to + 20, dataLen: nextOff - (to + 20),
      palInfo: palSize === 16 ? pal16.get(palId) : pal256.get(palId),
    });
  }
  return { ptrMeta, objs, numMeshes, meshOffs, meshHashes, textures };
}

function writeTextureIntoPsx(buf, tex, rgba, preserveAlpha = false) {
  if (!tex.palInfo) throw new Error(`Paleta ausente em tex[${tex.i}]`);
  let transIdx = -1;
  if (preserveAlpha) {
    for (let c = 0; c < tex.palSize; c++) {
      if (buf.readUInt16LE(tex.palInfo.offset + c * 2) === 0x0000) { transIdx = c; break; }
    }
  }
  if (tex.palSize === 256) {
    if (tex.dataLen !== tex.w * tex.h) throw new Error(`dataLen 8-bit mismatch em tex[${tex.i}]: ${tex.dataLen} vs ${tex.w * tex.h}`);
    const q = quantizeImageForPsx(rgba, tex.w, tex.h, 256, transIdx);
    for (let c = 0; c < 256; c++) buf.writeUInt16LE(q.palBgr555[c], tex.palInfo.offset + c * 2);
    q.indices.copy(buf, tex.dataOff);
    return q.outRgba;
  } else if (tex.palSize === 16) {
    const expLen = Math.ceil(tex.w / 2) * tex.h;
    if (tex.dataLen !== expLen) throw new Error(`dataLen 4-bit mismatch em tex[${tex.i}]: ${tex.dataLen} vs ${expLen}`);
    const q = quantize4BitForPsx(rgba, tex.w, tex.h, transIdx);
    for (let c = 0; c < 16; c++) buf.writeUInt16LE(q.palBgr555[c], tex.palInfo.offset + c * 2);
    q.packed.copy(buf, tex.dataOff);
    return q.outRgba;
  }
  throw new Error(`palSize nao suportado: ${tex.palSize}`);
}

function buildFairHandsRgba(origPsxBuf, handTex, targetSkin) {
  const W = handTex.w, H = handTex.h;
  const rgba = Buffer.alloc(W * H * 4);
  const pal = [];
  for (let c = 0; c < handTex.palSize; c++) {
    const v = origPsxBuf.readUInt16LE(handTex.palInfo.offset + c * 2);
    pal.push([((v & 0x1F) * 255 / 31) | 0, (((v >> 5) & 0x1F) * 255 / 31) | 0, (((v >> 10) & 0x1F) * 255 / 31) | 0, v === 0 ? 0 : 255]);
  }
  let sumL = 0, cntL = 0;
  for (let i = 0; i < W * H; i++) {
    const p = pal[origPsxBuf[handTex.dataOff + i]];
    if (p[3] > 0) { sumL += p[0] * 0.30 + p[1] * 0.59 + p[2] * 0.11; cntL++; }
  }
  const avgL = Math.max(40, sumL / Math.max(1, cntL));
  for (let i = 0; i < W * H; i++) {
    const p = pal[origPsxBuf[handTex.dataOff + i]];
    const d = i * 4;
    if (p[3] === 0) {
      rgba[d] = 0; rgba[d + 1] = 0; rgba[d + 2] = 0; rgba[d + 3] = 0;
    } else {
      const lum = p[0] * 0.30 + p[1] * 0.59 + p[2] * 0.11;
      const ratio = clamp(0.80 + (lum / avgL - 0.78) * 0.85, 0.58, 1.15);
      rgba[d] = clamp(Math.round(targetSkin[0] * ratio), 24, 250);
      rgba[d + 1] = clamp(Math.round(targetSkin[1] * ratio), 20, 238);
      rgba[d + 2] = clamp(Math.round(targetSkin[2] * ratio), 16, 228);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// Build EXACT 4,088-byte 62x47 8-bit BMP for s2face*.bmp from pre-processed inner 46x36 RGBA!
function buildPortraitBmpFromInner46x36(origBmpBuf, innerRgba, magIdx) {
  const w = 62, h = 47, rowStride = 64, offBits = 1078, innerW = 46, innerH = 36;
  const isInner = (x, y) => x >= 7 && x <= 52 && y >= 4 && y <= 39;

  const fixedPalette = new Array(256).fill(null);
  fixedPalette[magIdx] = [255, 0, 255];
  const keyToIdx = new Map([['255,0,255', magIdx]]);
  let nextSlot = 0;
  const allocSlot = rgb => {
    const k = rgb.join(',');
    if (keyToIdx.has(k)) return keyToIdx.get(k);
    while (nextSlot < 256 && fixedPalette[nextSlot] !== null) nextSlot++;
    if (nextSlot >= 256) return -1;
    fixedPalette[nextSlot] = rgb;
    keyToIdx.set(k, nextSlot);
    return nextSlot;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isInner(x, y)) {
        const ci = origBmpBuf[offBits + (h - 1 - y) * rowStride + x];
        const po = 54 + ci * 4;
        allocSlot([origBmpBuf[po + 2], origBmpBuf[po + 1], origBmpBuf[po]]);
      }
    }
  }
  let freeCount = 0;
  for (let i = 0; i < 256; i++) if (fixedPalette[i] === null) freeCount++;
  const innerPx = [];
  for (let i = 0; i < innerW * innerH; i++) innerPx.push([innerRgba[i * 4], innerRgba[i * 4 + 1], innerRgba[i * 4 + 2]]);
  const faceCols = medianCutPalette(innerPx, freeCount);
  let fc = 0;
  for (let i = 0; i < 256; i++) if (fixedPalette[i] === null) fixedPalette[i] = fc < faceCols.length ? faceCols[fc++] : [8, 8, 8];

  const outBmp = Buffer.from(origBmpBuf);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = fixedPalette[i];
    outBmp[54 + i * 4 + 0] = b; outBmp[54 + i * 4 + 1] = g; outBmp[54 + i * 4 + 2] = r; outBmp[54 + i * 4 + 3] = 0;
  }
  const previewRgba = Buffer.alloc(w * h * 4);
  const errBuf = new Float32Array(innerW * innerH * 3);
  for (let i = 0; i < innerW * innerH; i++) {
    errBuf[i * 3] = innerRgba[i * 4]; errBuf[i * 3 + 1] = innerRgba[i * 4 + 1]; errBuf[i * 3 + 2] = innerRgba[i * 4 + 2];
  }
  for (let y = 0; y < h; y++) {
    const bmpRow = offBits + (h - 1 - y) * rowStride;
    for (let x = 0; x < w; x++) {
      let cidx;
      if (!isInner(x, y)) {
        const origCi = origBmpBuf[bmpRow + x];
        const po = 54 + origCi * 4;
        cidx = keyToIdx.get(`${origBmpBuf[po + 2]},${origBmpBuf[po + 1]},${origBmpBuf[po]}`) ?? 0;
      } else {
        const ix = x - 7, iy = y - 4, ii = iy * innerW + ix;
        const r = clamp(errBuf[ii * 3], 0, 255), g = clamp(errBuf[ii * 3 + 1], 0, 255), b = clamp(errBuf[ii * 3 + 2], 0, 255);
        let best = 0, bestD = 1e18;
        for (let c = 0; c < 256; c++) {
          if (c === magIdx) continue;
          const dr = r - fixedPalette[c][0], dg = g - fixedPalette[c][1], db = b - fixedPalette[c][2];
          const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
          if (d < bestD) { bestD = d; best = c; }
        }
        cidx = best;
        const [qr, qg, qb] = fixedPalette[cidx];
        const er = (r - qr) * 0.52, eg = (g - qg) * 0.52, eb = (b - qb) * 0.52;
        const sp = (nx, ny, wt) => {
          if (nx >= 0 && nx < innerW && ny >= 0 && ny < innerH) {
            const ni = (ny * innerW + nx) * 3;
            errBuf[ni] += er * wt; errBuf[ni + 1] += eg * wt; errBuf[ni + 2] += eb * wt;
          }
        };
        sp(ix + 1, iy, 7 / 16); sp(ix - 1, iy + 1, 3 / 16); sp(ix, iy + 1, 5 / 16); sp(ix + 1, iy + 1, 1 / 16);
      }
      outBmp[bmpRow + x] = cidx;
      const [pr, pg, pb] = fixedPalette[cidx];
      const po = (y * w + x) * 4;
      previewRgba[po] = pr; previewRgba[po + 1] = pg; previewRgba[po + 2] = pb; previewRgba[po + 3] = 255;
    }
  }
  return { outBmp, previewRgba };
}

function recomputeMeshBounds(buf, mo, extraPad = 0) {
  const nVerts = buf.readUInt16LE(mo + 2);
  const vOff = mo + 28;
  let xmin = 32767, xmax = -32768, ymin = 32767, ymax = -32768, zmin = 32767, zmax = -32768, maxR = 0;
  for (let v = 0; v < nVerts; v++) {
    const vo = vOff + v * 8;
    const x = buf.readInt16LE(vo), y = buf.readInt16LE(vo + 2), z = buf.readInt16LE(vo + 4), w = buf.readUInt16LE(vo + 6);
    if (w !== 2) {
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      if (z < zmin) zmin = z; if (z > zmax) zmax = z;
      const r = Math.hypot(x, y, z); if (r > maxR) maxR = r;
    }
  }
  xmax += extraPad; xmin -= extraPad; ymax += extraPad; ymin -= extraPad; zmax += extraPad; zmin -= extraPad;
  const origRad = buf.readUInt32LE(mo + 0x08);
  buf.writeUInt32LE(Math.max(origRad, Math.ceil((maxR + extraPad) / 16) * 4096), mo + 0x08);
  buf.writeInt16LE(Math.ceil(xmax / 16), mo + 0x0C);
  buf.writeInt16LE(Math.floor(xmin / 16), mo + 0x0E);
  buf.writeInt16LE(Math.ceil(ymax / 16), mo + 0x10);
  buf.writeInt16LE(Math.floor(ymin / 16), mo + 0x12);
  buf.writeInt16LE(Math.ceil(zmax / 16), mo + 0x14);
  buf.writeInt16LE(Math.floor(zmin / 16), mo + 0x16);
}

// Compact crisp 3x5 & 4x5 uppercase/digit/symbol font (drawn HORIZONTALLY FLIPPED for PS1 Chest UV so it reads LEFT-TO-RIGHT on PS1!)
const FONT_3x5 = {
  'A': ['010','101','111','101','101'],
  'B': ['110','101','110','101','110'],
  'C': ['011','100','100','100','011'],
  'D': ['110','101','101','101','110'],
  'E': ['111','100','110','100','111'],
  'F': ['111','100','110','100','100'],
  'G': ['011','100','101','101','011'],
  'H': ['101','101','111','101','101'],
  'I': ['111','010','010','010','111'],
  'J': ['001','001','001','101','010'],
  'L': ['100','100','100','100','111'],
  'M': ['101','111','111','101','101'],
  'N': ['111','101','101','101','101'],
  'O': ['010','101','101','101','010'],
  'P': ['110','101','110','100','100'],
  'R': ['110','101','110','101','101'],
  'S': ['011','100','010','001','110'],
  'T': ['111','010','010','010','010'],
  'U': ['101','101','101','101','010'],
  'V': ['101','101','101','101','010'],
  '9': ['011','101','011','001','110'],
  ' ': ['000','000','000','000','000'],
};

// Draw text centered horizontally at cx in a PS1 chest texture (flipX=true means it reads LEFT-TO-RIGHT on real PS1/DuckStation!)
function drawBitmapText(rgba, W, H, text, cx, y0, color, opts = {}) {
  const flipX = opts.flipX !== false;
  const scaleX = opts.scaleX || 1;
  const scaleY = opts.scaleY || 1;
  const gap = opts.gap !== undefined ? opts.gap : 1;
  const maxWidth = opts.maxWidth || 0;
  const chars = text.toUpperCase().split('');
  const rawW = chars.length * (3 * scaleX + gap) - gap;
  const rawH = 5 * scaleY;

  if (maxWidth > 0 && rawW > maxWidth) {
    // Crisp horizontal area-fit onto [cx - maxWidth/2 .. cx + maxWidth/2] so long words stay 100% on the flat front chest!
    const tmp = new Float32Array(rawW * rawH);
    for (let ci = 0; ci < chars.length; ci++) {
      const g = FONT_3x5[chars[ci]] || FONT_3x5[' '];
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) {
        if (g[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scaleY; sy++) for (let sx = 0; sx < scaleX; sx++) {
          tmp[(gy * scaleY + sy) * rawW + (ci * (3 * scaleX + gap) + gx * scaleX + sx)] = 1;
        }
      }
    }
    const dstW = maxWidth;
    const startX = Math.round(cx - dstW / 2);
    for (let dy = 0; dy < rawH; dy++) {
      for (let dx = 0; dx < dstW; dx++) {
        const s0 = (dx / dstW) * rawW, s1 = ((dx + 1) / dstW) * rawW;
        let cov = 0, wsum = 0;
        for (let ix = Math.floor(s0); ix < Math.ceil(s1); ix++) {
          const ov = Math.min(s1, ix + 1) - Math.max(s0, ix);
          if (ix >= 0 && ix < rawW && ov > 0) { cov += tmp[dy * rawW + ix] * ov; wsum += ov; }
        }
        const a = wsum > 0 ? clamp(cov / wsum * 1.35, 0, 1) : 0;
        if (a < 0.28) continue;
        const px = flipX ? Math.round(cx + dstW / 2 - 1 - dx) : (startX + dx);
        const py = y0 + dy;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          const d = (py * W + px) * 4;
          rgba[d] = Math.round(lerp(rgba[d], color[0], a));
          rgba[d + 1] = Math.round(lerp(rgba[d + 1], color[1], a));
          rgba[d + 2] = Math.round(lerp(rgba[d + 2], color[2], a));
          rgba[d + 3] = 255;
        }
      }
    }
    return;
  }

  const startX = Math.round(cx - rawW / 2);
  for (let ci = 0; ci < chars.length; ci++) {
    const g = FONT_3x5[chars[ci]] || FONT_3x5[' '];
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (g[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scaleY; sy++) {
          for (let sx = 0; sx < scaleX; sx++) {
            const lx = ci * (3 * scaleX + gap) + gx * scaleX + sx;
            const px = flipX ? Math.round(cx + rawW / 2 - 1 - lx) : (startX + lx);
            const py = y0 + gy * scaleY + sy;
            if (px >= 0 && px < W && py >= 0 && py < H) {
              const d = (py * W + px) * 4;
              rgba[d] = color[0]; rgba[d + 1] = color[1]; rgba[d + 2] = color[2]; rgba[d + 3] = 255;
            }
          }
        }
      }
    }
  }
}

// REAL PS1 GTE-polarity 3D Textured Multi-Angle Renderer!
// Matches REAL DuckStation screen orientation: looking at front (-Z), +X maps to VIEWER'S LEFT (-sx), -X maps to VIEWER'S RIGHT (+sx)!
function renderPs1SkaterPreview(psxBuf, meshIndices, views, cellW, cellH, sc, yShift, outPath) {
  const info = parsePsxStructure(psxBuf);
  const texByIdx = new Map();
  for (const t of info.textures) {
    const rgba = Buffer.alloc(t.w * t.h * 4);
    if (t.palInfo) {
      if (t.palSize === 256) {
        for (let p = 0; p < t.w * t.h; p++) {
          const ci = psxBuf[t.dataOff + p], v = psxBuf.readUInt16LE(t.palInfo.offset + ci * 2);
          rgba[p*4] = ((v & 0x1F)*255/31)|0; rgba[p*4+1] = (((v>>5)&0x1F)*255/31)|0; rgba[p*4+2] = (((v>>10)&0x1F)*255/31)|0; rgba[p*4+3] = v === 0 ? 0 : 255;
        }
      } else if (t.palSize === 16) {
        const st = Math.ceil(t.w / 2);
        for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
          const b = psxBuf[t.dataOff + y * st + (x >> 1)], ci = (x & 1) ? (b >> 4) : (b & 0xF);
          const v = psxBuf.readUInt16LE(t.palInfo.offset + ci * 2), p = y * t.w + x;
          rgba[p*4] = ((v & 0x1F)*255/31)|0; rgba[p*4+1] = (((v>>5)&0x1F)*255/31)|0; rgba[p*4+2] = (((v>>10)&0x1F)*255/31)|0; rgba[p*4+3] = v === 0 ? 0 : 255;
        }
      }
    }
    texByIdx.set(t.texIdx, { ...t, rgba });
  }

  const meshes = [];
  for (let mi = 0; mi < info.numMeshes; mi++) {
    const mo = info.meshOffs[mi], mEnd = (mi + 1 < info.numMeshes) ? info.meshOffs[mi + 1] : info.ptrMeta;
    const nV = psxBuf.readUInt16LE(mo + 2), nN = psxBuf.readUInt16LE(mo + 4), nF = psxBuf.readUInt16LE(mo + 6);
    const vOff = mo + 28, fOff = vOff + nV * 8 + nN * 8;
    const verts = Array.from({ length: nV }, (_, v) => ({
      idx: v, x: psxBuf.readInt16LE(vOff + v*8), y: psxBuf.readInt16LE(vOff + v*8 + 2), z: psxBuf.readInt16LE(vOff + v*8 + 4), w: psxBuf.readUInt16LE(vOff + v*8 + 6),
    }));
    const faces = [];
    let fp = fOff;
    for (let fi = 0; fi < nF && fp + 4 <= mEnd; fi++) {
      const fl = psxBuf.readUInt16LE(fp), fLen = psxBuf.readUInt16LE(fp + 2);
      if (fLen < 12 || fp + fLen > mEnd) break;
      const rv = [psxBuf[fp+4], psxBuf[fp+5], psxBuf[fp+6], psxBuf[fp+7]];
      const gpu = psxBuf[fp+11], quad = (gpu & 8) !== 0;
      const textured = (fl & 1) !== 0 || (gpu & 4) !== 0;
      let texId = -1, uvs = [];
      if (textured && fLen >= 28) {
        texId = psxBuf.readUInt32LE(fp + 16);
        uvs = [[psxBuf[fp+20],psxBuf[fp+21]],[psxBuf[fp+22],psxBuf[fp+23]],[psxBuf[fp+24],psxBuf[fp+25]]];
        if (quad) uvs.push([psxBuf[fp+26],psxBuf[fp+27]]);
      }
      faces.push({ rv, quad, textured, texId, uvs });
      fp += fLen;
    }
    meshes.push({ mi, verts, faces });
  }

  const posOf = m => info.objs[m.mi] || { x: 0, y: 0, z: 0 };
  const worldOf = (m, v) => { const o = posOf(m); return { x: v.x + o.x, y: v.y + o.y, z: v.z + o.z }; };
  const stitchW = [];
  for (const m of meshes) for (const v of m.verts) if (v.w === 1) stitchW.push(worldOf(m, v));
  const resolve = m => m.verts.map(v => v.w === 2 ? (stitchW[v.y] || { x: 0, y: 0, z: 0 }) : worldOf(m, v));

  const targetMeshes = meshIndices.map(mi => meshes[mi]).filter(Boolean);
  let ySum = 0, yCnt = 0, xSum = 0, zSum = 0;
  for (const m of targetMeshes) for (const p of resolve(m)) { xSum += p.x; ySum += p.y; zSum += p.z; yCnt++; }
  const cx = xSum / Math.max(1, yCnt), cy0 = ySum / Math.max(1, yCnt) + yShift, cz = zSum / Math.max(1, yCnt);

  const W = cellW * views.length, H = cellH;
  const img = Buffer.alloc(W * H * 4, 24);
  for (let i = 0; i < W * H; i++) img[i * 4 + 3] = 255;

  views.forEach((vw, vi) => {
    const ox = vi * cellW + cellW * 0.5, oy = cellH * 0.5;
    const zbuf = new Float32Array(cellW * cellH).fill(1e9);
    const yaw = vw.yaw * Math.PI / 180, cY = Math.cos(yaw), sY = Math.sin(yaw);
    // REAL PS1 GTE Screen Projection: -rx puts +X on viewer's LEFT & -X on viewer's RIGHT (exact match to DuckStation!)
    const proj = p => {
      const dx = p.x - cx, dy = p.y - cy0, dz = p.z - cz;
      const rx = dx * cY + dz * sY;
      const rz = -dx * sY + dz * cY;
      return { sx: ox - rx * sc, sy: oy + dy * sc, sz: rz };
    };
    const drawTri = (p0, p1, p2, uv0, uv1, uv2, tex, shade) => {
      const minX = Math.max(vi * cellW, Math.floor(Math.min(p0.sx, p1.sx, p2.sx)));
      const maxX = Math.min((vi + 1) * cellW - 1, Math.ceil(Math.max(p0.sx, p1.sx, p2.sx)));
      const minY = Math.max(0, Math.floor(Math.min(p0.sy, p1.sy, p2.sy)));
      const maxY = Math.min(cellH - 1, Math.ceil(Math.max(p0.sy, p1.sy, p2.sy)));
      const area = (p1.sx - p0.sx) * (p2.sy - p0.sy) - (p2.sx - p0.sx) * (p1.sy - p0.sy);
      if (Math.abs(area) < 0.01) return;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const w0 = ((p1.sx - x) * (p2.sy - y) - (p2.sx - x) * (p1.sy - y)) / area;
        const w1 = ((p2.sx - x) * (p0.sy - y) - (p0.sx - x) * (p2.sy - y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
        const z = w0 * p0.sz + w1 * p1.sz + w2 * p2.sz;
        const zi = y * cellW + (x - vi * cellW);
        if (z < zbuf[zi]) {
          zbuf[zi] = z;
          let r = 180, g = 180, b = 180;
          if (tex && uv0) {
            const u = clamp(Math.round(w0 * uv0[0] + w1 * uv1[0] + w2 * uv2[0]) & (tex.w - 1), 0, tex.w - 1);
            const vv = clamp(Math.round(w0 * uv0[1] + w1 * uv1[1] + w2 * uv2[1]), 0, tex.h - 1);
            const to = (vv * tex.w + u) * 4;
            r = tex.rgba[to]; g = tex.rgba[to + 1]; b = tex.rgba[to + 2];
          }
          const o = (y * W + x) * 4;
          img[o] = Math.min(255, Math.round(r * shade));
          img[o + 1] = Math.min(255, Math.round(g * shade));
          img[o + 2] = Math.min(255, Math.round(b * shade));
          img[o + 3] = 255;
        }
      }
    };
    for (const m of targetMeshes) {
      const wvs = resolve(m);
      for (const f of m.faces) {
        if (!f.textured || f.uvs.length < 3) continue;
        const p0 = proj(wvs[f.rv[0]]), p1 = proj(wvs[f.rv[1]]), p2 = proj(wvs[f.rv[2]]);
        const p3 = f.quad ? proj(wvs[f.rv[3]]) : null;
        const tex = texByIdx.get(f.texId);
        const e1x = p1.sx - p0.sx, e1y = p1.sy - p0.sy, e1z = p1.sz - p0.sz;
        const e2x = p2.sx - p0.sx, e2y = p2.sy - p0.sy, e2z = p2.sz - p0.sz;
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        const shade = 0.72 + 0.28 * Math.abs(nz / (Math.hypot(nx, ny, nz) || 1));
        if (f.quad && p3) {
          drawTri(p0, p1, p2, f.uvs[0], f.uvs[1], f.uvs[2], tex, shade);
          drawTri(p1, p3, p2, f.uvs[1], f.uvs[3], f.uvs[2], tex, shade);
        } else {
          drawTri(p0, p1, p2, f.uvs[0], f.uvs[1], f.uvs[2], tex, shade);
        }
      }
    }
  });
  if (outPath) writePng(outPath, W, H, img);
  return { w: W, h: H, rgba: img };
}

function getOrigWadSlice(name) {
  const origHed = fs.readFileSync(path.join(backupDir, 'CD.HED'));
  const origWad = fs.readFileSync(path.join(backupDir, 'CD.WAD'));
  const h = nsHash(name);
  for (let i = 0; i < (origHed.length - 4) / 12; i++) {
    if (origHed.readUInt32LE(i * 12) === h) {
      const o = origHed.readUInt32LE(i * 12 + 4), s = origHed.readUInt32LE(i * 12 + 8);
      return Buffer.from(origWad.subarray(o, o + s));
    }
  }
  throw new Error(`Nao encontrado em originals_backup/CD.WAD: ${name}`);
}

function patchWadAndOptionsPre({ portraitName, portraitBuf, preOffset, modelsMap }) {
  const curHed = fs.readFileSync(path.join(rootDir, 'CD.HED'));
  const curWad = fs.readFileSync(path.join(rootDir, 'CD.WAD'));
  const patchSameSize = (name, newBuf) => {
    const h = nsHash(name);
    for (let i = 0; i < (curHed.length - 4) / 12; i++) {
      if (curHed.readUInt32LE(i * 12) === h) {
        const o = curHed.readUInt32LE(i * 12 + 4), s = curHed.readUInt32LE(i * 12 + 8);
        if (newBuf.length !== s) throw new Error(`Tamanho divergente para ${name}: ${newBuf.length} vs ${s}`);
        newBuf.copy(curWad, o);
        console.log(`  [CD.WAD idx=${String(i).padStart(4)} @ 0x${o.toString(16)}] ${name} (${s} B) atualizado!`);
        return;
      }
    }
    throw new Error(`Nao encontrado em CD.HED: ${name}`);
  };
  if (portraitName && portraitBuf) {
    patchSameSize(portraitName, portraitBuf);
    const optH = nsHash('options.pre');
    let optOff = -1, optSz = 0;
    for (let i = 0; i < (curHed.length - 4) / 12; i++) {
      if (curHed.readUInt32LE(i * 12) === optH) {
        optOff = curHed.readUInt32LE(i * 12 + 4); optSz = curHed.readUInt32LE(i * 12 + 8); break;
      }
    }
    const optEntry = curWad.subarray(optOff, optOff + optSz);
    if (optEntry[preOffset] !== 0x42 || optEntry[preOffset + 1] !== 0x4D) {
      throw new Error(`Assinatura BM nao encontrada em options.pre +0x${preOffset.toString(16)}!`);
    }
    portraitBuf.copy(optEntry, preOffset);
    console.log(`  [CD.WAD options.pre +0x${preOffset.toString(16)}] ${portraitName} (${portraitBuf.length} B) atualizado dentro de options.pre!`);
  }
  for (const [name, buf] of modelsMap.entries()) patchSameSize(name, buf);
  fs.writeFileSync(path.join(rootDir, 'CD.WAD'), curWad);
}

module.exports = {
  rootDir, backupDir, ffmpegExe, ffprobeExe,
  clamp, lerp, nsHash, probeDims, loadRgba, sampleBilinear, writePng,
  medianCutPalette, rgbToBgr555Opaque, quantizeImageForPsx, quantize4BitForPsx,
  parsePsxStructure, writeTextureIntoPsx, buildFairHandsRgba,
  buildPortraitBmpFromInner46x36, recomputeMeshBounds, drawBitmapText,
  renderPs1SkaterPreview, getOrigWadSlice, patchWadAndOptionsPre,
};
