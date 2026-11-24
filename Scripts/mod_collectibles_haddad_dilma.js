#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) — 3D Sculpted Collectibles Builder:
 *   1. The Hangar (LV 0, G5 "5 Asas do Aviao da Janja" -> "5 Taxads do Haddad"):
 *      Replaces Pilot Wings (skhan_o.psx & skhan_o2.psx M[8], hash 0xD0C4F2DA)
 *      and its exclusive texture ti=24 (0xDA38F58B, 128x32 4b -> 64x64 4b, 0 B texture delta!)
 *      with a pixel-perfectly cut-out, 3D sculpted/extruded silhouette geometry of
 *      Fernando Haddad & the "AJUSTE FISCAL" rabbit (~1.4x Pilot Wings scale, double-sided
 *      left-to-right readability, 3D contoured relief + color-matched 3D rim extrusion).
 *
 *   2. School II (LV 1, G4 "5 Sinos do Sindicato" -> "5 Dilmas no Barril"):
 *      Replaces the 5 wall-mounted School Bells (sksl2_o.psx M[5], hash 0x9DB64BF3)
 *      and their exclusive texture 0xFC079202 in sksl2_l.psx & sksl2_l2.psx
 *      (upgraded from 32x32 4b = 512 B to 40x64 4b = 1,280 B, +768 B inside 840 B free!)
 *      with a watertight, curved 3D sculpted oak half-barrel + Dilma Rousseff relief
 *      mounted flush to the wall (Z=0 -> Z=+38, ~1.5x original bell scale, 564 B <= 604 B).
 *
 * Both maintain ZERO CD.WAD offset shift (strictly within original Redump 2048 B sectors!).
 */

const fs = require('fs');
const path = require('path');
const psxLib = require('./psx_skater_lib');

const ROOT = psxLib.rootDir;
const clamp = psxLib.clamp;

const HASH_WINGS_MESH = 0xd0c4f2da;
const HASH_WINGS_TEX  = 0xda38f58b;
const HASH_BELL_MESH  = 0x9db64bf3;
const HASH_BELL_TEX   = 0xfc079202;

// ============================================================================
// Vector / Winding / PSX Binary Serialization Helpers
// ============================================================================

function vecSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vecCross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function vecDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function vecNorm4096(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [Math.round(v[0] / len * 4095), Math.round(v[1] / len * 4095), Math.round(v[2] / len * 4095)];
}

/**
 * Verifies THPS2 PS1 front-facing winding law (empirically proven in DuckStation):
 * Right-handed (X, Y_down, Z) space -> front-facing NCLIP > 0 requires
 * dot((v1 - v0) x (v2 - v0), outwardNormal) < 0 for BOTH triangles (0,1,2) and (1,3,2)!
 */
function assertPs1QuadWinding(verts, vIdx, outNorm, label) {
  const p0 = verts[vIdx[0]], p1 = verts[vIdx[1]], p2 = verts[vIdx[2]], p3 = verts[vIdx[3]];
  const d1 = vecDot(vecCross(vecSub(p1, p0), vecSub(p2, p0)), outNorm);
  const d2 = vecDot(vecCross(vecSub(p3, p1), vecSub(p2, p1)), outNorm);
  if (d1 >= -1 || d2 >= -1) {
    throw new Error(`PS1 quad winding violation in ${label}: d1=${d1.toFixed(1)}, d2=${d2.toFixed(1)}, v=${JSON.stringify(vIdx)}`);
  }
}

function assertPs1TriWinding(verts, vIdx, outNorm, label) {
  const p0 = verts[vIdx[0]], p1 = verts[vIdx[1]], p2 = verts[vIdx[2]];
  const d1 = vecDot(vecCross(vecSub(p1, p0), vecSub(p2, p0)), outNorm);
  if (d1 >= -1) {
    throw new Error(`PS1 tri winding violation in ${label}: d1=${d1.toFixed(1)}, v=${JSON.stringify(vIdx)}`);
  }
}

function buildPsxMeshBlock({ flags = 8, verts, norms, faces }) {
  const nV = verts.length, nN = norms.length, nF = faces.length;
  let minX = 32767, maxX = -32768, minY = 32767, maxY = -32768, minZ = 32767, maxZ = -32768;
  let maxR = 0;
  for (const [x, y, z] of verts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    const r = Math.hypot(x, y, z);
    if (r > maxR) maxR = r;
  }
  const rad = Math.ceil(maxR) * 4096;
  const totalSize = 28 + nV * 8 + nN * 8 + nF * 28;
  const buf = Buffer.alloc(totalSize);

  buf.writeUInt16LE(flags, 0);
  buf.writeUInt16LE(nV, 2);
  buf.writeUInt16LE(nN, 4);
  buf.writeUInt16LE(nF, 6);
  buf.writeUInt32LE(rad >>> 0, 8);
  buf.writeInt16LE(maxX, 12);
  buf.writeInt16LE(minX, 14);
  buf.writeInt16LE(maxY, 16);
  buf.writeInt16LE(minY, 18);
  buf.writeInt16LE(maxZ, 20);
  buf.writeInt16LE(minZ, 22);
  buf.writeUInt32LE(0xffff7fff, 24); // CRITICAL PS1 draw-distance sentinel (0x7FFF max draw dist, 0xFFFF)!

  let off = 28;
  for (const [x, y, z] of verts) {
    buf.writeInt16LE(x, off);
    buf.writeInt16LE(y, off + 2);
    buf.writeInt16LE(z, off + 4);
    buf.writeInt16LE(0, off + 6);
    off += 8;
  }
  for (const [nx, ny, nz] of norms) {
    buf.writeInt16LE(nx, off);
    buf.writeInt16LE(ny, off + 2);
    buf.writeInt16LE(nz, off + 4);
    buf.writeInt16LE(0, off + 6);
    off += 8;
  }
  for (const f of faces) {
    buf.writeUInt16LE(f.fl, off);
    buf.writeUInt16LE(28, off + 2);
    buf[off + 4] = f.v[0];
    buf[off + 5] = f.v[1];
    buf[off + 6] = f.v[2];
    buf[off + 7] = f.v[3] ?? 0;
    buf[off + 8]  = f.rgb[0];
    buf[off + 9]  = f.rgb[1];
    buf[off + 10] = f.rgb[2];
    buf[off + 11] = f.rgb[3] ?? 0;
    buf.writeUInt16LE(f.ni, off + 12);
    buf.writeUInt16LE(0, off + 14);
    buf.writeUInt32LE(f.ti, off + 16);
    for (let u = 0; u < 8; u++) buf[off + 20 + u] = f.uv[u] ?? 0;
    off += 28;
  }
  return buf;
}

function inspectPsxTables(buf) {
  const p = psxLib.parsePsxStructure(buf);
  let cur = p.ptrMeta;
  let rgbsOff = -1, rgbsSz = 0;
  while (cur + 4 <= buf.length) {
    const tag = buf.readUInt32LE(cur);
    if (tag === 0xffffffff) { cur += 4; break; }
    const sz = buf.readUInt32LE(cur + 4);
    if (tag === 0x73424752) { rgbsOff = cur + 8; rgbsSz = sz; }
    cur += 8 + sz;
  }
  const meshHashesOff = cur;
  cur += p.numMeshes * 4;
  const numTexHashes = buf.readUInt32LE(cur);
  const texHashes = [];
  for (let i = 0; i < numTexHashes; i++) texHashes.push(buf.readUInt32LE(cur + 4 + i * 4));
  cur += 4 + numTexHashes * 4;
  const numPal16 = buf.readUInt32LE(cur); cur += 4 + numPal16 * 36;
  const numPal256 = buf.readUInt32LE(cur); cur += 4 + numPal256 * 516;
  const numTex = buf.readUInt32LE(cur);
  const texOffTblOff = cur + 4;
  const textures = p.textures.map(t => ({ ...t, hash: texHashes[t.texIdx] }));
  return { ...p, rgbsOff, rgbsSz, meshHashesOff, texHashes, numTex, texOffTblOff, textures };
}

function findClosestRgbIndex(psxBuf, info, targetRgb) {
  if (info.rgbsOff < 0 || info.rgbsSz < 4) return 0;
  let best = 0, bestD = 1e18;
  const n = info.rgbsSz >> 2;
  for (let i = 0; i < n; i++) {
    const r = psxBuf[info.rgbsOff + i * 4];
    const g = psxBuf[info.rgbsOff + i * 4 + 1];
    const b = psxBuf[info.rgbsOff + i * 4 + 2];
    const d = (r - targetRgb[0]) ** 2 + (g - targetRgb[1]) ** 2 + (b - targetRgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Replaces mesh `meshIdx` inside a .PSX buffer with `newMeshBuf`, updating:
 *  - ptrMeta (+0x04)
 *  - obj[i].ptrRgbs (+32 in every 36-byte obj record) when >= oldPtrMeta
 *  - meshOffs[meshIdx+1 .. numMeshes-1]
 *  - texOffTbl[0 .. numTex-1]
 */
function replacePsxMesh(psxBuf, meshIdx, newMeshBuf) {
  const info = inspectPsxTables(psxBuf);
  const oldStart = info.meshOffs[meshIdx];
  const oldEnd = (meshIdx + 1 < info.numMeshes) ? info.meshOffs[meshIdx + 1] : info.ptrMeta;
  const delta = newMeshBuf.length - (oldEnd - oldStart);

  const out = Buffer.concat([
    psxBuf.subarray(0, oldStart),
    newMeshBuf,
    psxBuf.subarray(oldEnd),
  ]);

  if (delta !== 0) {
    out.writeUInt32LE(info.ptrMeta + delta, 4);
    for (let i = 0; i < info.objs.length; i++) {
      const o = 12 + i * 36 + 32;
      const ptr = out.readUInt32LE(o);
      if (ptr >= info.ptrMeta) out.writeUInt32LE(ptr + delta, o);
    }
    const meshTblOff = 12 + info.objs.length * 36;
    for (let m = meshIdx + 1; m < info.numMeshes; m++) {
      const mo = meshTblOff + 4 + m * 4;
      out.writeUInt32LE(out.readUInt32LE(mo) + delta, mo);
    }
    const newTexTblOff = info.texOffTblOff + delta;
    for (let t = 0; t < info.numTex; t++) {
      const to = newTexTblOff + t * 4;
      out.writeUInt32LE(out.readUInt32LE(to) + delta, to);
    }
  }
  return out;
}

/**
 * Replaces a 4-bit (16-color) texture in a .PSX buffer (supporting dimension & byte-size changes!),
 * updating its 16-entry CLUT, width/height header, pixel block, and shifting subsequent texOffs!
 */
function replacePsxTexture4Bit(psxBuf, targetHash, newW, newH, pal15, indices) {
  const info = inspectPsxTables(psxBuf);
  const tex = info.textures.find(t => t.hash === targetHash);
  if (!tex) throw new Error(`Texture 0x${targetHash.toString(16)} not found in PSX!`);
  if (tex.palSize !== 16) throw new Error(`Texture 0x${targetHash.toString(16)} is not 4-bit (palSize=${tex.palSize})!`);

  // Pack 4-bit pixels (low nibble = even x, high nibble = odd x; row stride padded to even bytes)
  const rawStride = Math.ceil(newW / 2);
  const rowBytes = (rawStride + 1) & ~1;
  const newPix = Buffer.alloc(rowBytes * newH);
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x += 2) {
      const lo = indices[y * newW + x] & 0x0f;
      const hi = (x + 1 < newW) ? (indices[y * newW + x + 1] & 0x0f) : 0;
      newPix[y * rowBytes + (x >> 1)] = lo | (hi << 4);
    }
  }

  const hdrOff = tex.dataOff - 20;
  // Verify header layout: +0:unk0, +4:palId, +8:texIdx, +12:w(u16), +14:h(u16), +16:data... wait!
  // Let's verify exact offset of w and h right before dataOff!
  let wOff = -1;
  for (const cand of [tex.dataOff - 4, tex.dataOff - 8]) {
    if (cand >= 0 && psxBuf.readUInt16LE(cand) === tex.w && psxBuf.readUInt16LE(cand + 2) === tex.h) {
      wOff = cand; break;
    }
  }
  if (wOff < 0) throw new Error(`Cannot locate (w=${tex.w}, h=${tex.h}) header before dataOff=0x${tex.dataOff.toString(16)}`);

  const oldPixLen = tex.dataLen;
  const delta = newPix.length - oldPixLen;

  const out = Buffer.concat([
    psxBuf.subarray(0, tex.dataOff),
    newPix,
    psxBuf.subarray(tex.dataOff + oldPixLen),
  ]);

  // Write updated 16-color CLUT (palInfo.offset is BEFORE texture data, so unaffected by delta!)
  if (tex.palInfo.offset >= tex.dataOff) {
    throw new Error(`Unexpected palInfo.offset >= dataOff!`);
  }
  for (let c = 0; c < 16; c++) {
    out.writeUInt16LE(pal15[c] & 0xffff, tex.palInfo.offset + c * 2);
  }
  // Write updated width & height
  out.writeUInt16LE(newW, wOff);
  out.writeUInt16LE(newH, wOff + 2);

  // Shift any texture offset entries pointing AFTER this texture's dataOff
  if (delta !== 0) {
    for (let t = 0; t < info.numTex; t++) {
      const to = info.texOffTblOff + t * 4;
      const oldOff = out.readUInt32LE(to);
      if (oldOff > tex.dataOff) {
        out.writeUInt32LE(oldOff + delta, to);
      }
    }
  }
  return out;
}

// ============================================================================
// Image Segmentation, Perfect Photo Cutouts & Weighted PS1 Quantization
// ============================================================================

function keepLargestComponent(mask, w, h) {
  const vis = new Uint8Array(w * h);
  let best = [];
  const q = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || vis[i]) continue;
    let head = 0, tail = 0;
    q[tail++] = i; vis[i] = 1;
    const comp = [];
    while (head < tail) {
      const cur = q[head++];
      comp.push(cur);
      const x = cur % w, y = (cur / w) | 0;
      if (x > 0 && mask[cur - 1] && !vis[cur - 1]) { vis[cur - 1] = 1; q[tail++] = cur - 1; }
      if (x + 1 < w && mask[cur + 1] && !vis[cur + 1]) { vis[cur + 1] = 1; q[tail++] = cur + 1; }
      if (y > 0 && mask[cur - w] && !vis[cur - w]) { vis[cur - w] = 1; q[tail++] = cur - w; }
      if (y + 1 < h && mask[cur + w] && !vis[cur + w]) { vis[cur + w] = 1; q[tail++] = cur + w; }
    }
    if (comp.length > best.length) best = comp;
  }
  const out = new Uint8Array(w * h);
  for (const idx of best) out[idx] = 1;
  return out;
}

function dilateMask(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) { out[y * w + x] = 1; continue; }
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      let hit = 0;
      for (let yy = y0; yy <= y1 && !hit; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          if (mask[yy * w + xx]) { hit = 1; break; }
        }
      }
      out[y * w + x] = hit;
    }
  }
  return out;
}

function cutoutHaddadPhoto() {
  const srcPath = path.join(ROOT, 'fotos_para_coletaveis/haddad_hangar.jpg');
  const { w, h } = psxLib.probeDims(srcPath);
  const src = psxLib.loadRgba(srcPath, w, h);

  const lumaArr = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lumaArr[i] = 0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2];
  }

  const ink = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, o = i * 4;
      const r = src[o], g = src[o + 1], b = src[o + 2];
      const luma = lumaArr[i];

      // Exclude artist signature "CLAYTON" & outside horizon lines
      if (x >= 352 && y >= 384) continue;
      if (y >= 296 && y <= 314 && (x < 68 || x > 395 || (x >= 252 && x <= 325))) continue;
      // Exclude tiny pale-grey crowd smudge on upper-left edge of blue tablecloth
      if (x <= 82 && y >= 245 && y <= 286 && luma > 140 && (b - r) < 16) continue;

      // Exclude warm tan stage floor wash (y >= 292), preserving rabbit's buck teeth!
      const inBuckTeeth = (x >= 132 && x <= 172 && y >= 315 && y <= 350);
      if (y >= 292 && !inBuckTeeth && luma > 138 && (r - b) > 28 && r > 170 && g > 125) continue;

      if (luma < 142) { ink[i] = 1; continue; }

      const inCrowdBand = (y >= 212 && y <= 312);
      if (!inCrowdBand && luma < 195) {
        const localMax = Math.max(
          lumaArr[i - 1], lumaArr[i + 1], lumaArr[i - w], lumaArr[i + w],
          lumaArr[i - w - 1], lumaArr[i - w + 1], lumaArr[i + w - 1], lumaArr[i + w + 1]
        );
        if (localMax - luma > 26) { ink[i] = 1; continue; }
      }
      if (inCrowdBand && luma < 165) {
        const localMax = Math.max(lumaArr[i - 1], lumaArr[i + 1], lumaArr[i - w], lumaArr[i + w]);
        if (localMax > 230 && localMax - luma > 75) { ink[i] = 1; continue; }
      }
      if (r - g > 35 && r - b > 20 && luma < 228) { ink[i] = 1; continue; }
      if (y < 242 && x > 140 && x < 395 && r > 145 && r - b > 26 && luma < 228) { ink[i] = 1; continue; }
      if (y >= 268 && y <= 378 && x >= 68 && x <= 254 && (b - r) > 18 && luma < 235) { ink[i] = 1; continue; }
    }
  }

  const barrier1 = dilateMask(ink, w, h, 1);
  const barrier2 = dilateMask(ink, w, h, 2);
  const barrier = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      barrier[i] = (y >= 218 && y <= 310) ? barrier1[i] : barrier2[i];
    }
  }
  for (let y = 296; y <= 314; y++) {
    for (let x = 0; x < 64; x++) barrier[y * w + x] = 0;
    for (let x = 400; x < w; x++) barrier[y * w + x] = 0;
  }

  const bg = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  const seed = (x, y) => {
    x = clamp(x, 0, w - 1); y = clamp(y, 0, h - 1);
    const idx = y * w + x;
    if (!bg[idx] && !barrier[idx]) { bg[idx] = 1; q[tail++] = idx; }
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }

  const pockets = [
    [55, 255], [75, 258], [72, 272], [95, 258], [118, 256], [58, 278], [52, 295],
    [206, 245], [218, 250], [235, 245], [250, 245], [268, 246], [282, 248],
    [214, 260], [234, 258], [254, 258],
    [262, 282], [278, 286], [298, 288], [322, 296], [344, 302],
    [264, 315], [285, 325], [304, 345], [295, 375], [345, 368], [372, 342],
    [125, 202], [138, 218], [98, 222],
    [40, 330], [66, 362], [68, 374], [258, 352], [264, 362],
  ];
  for (const [px, py] of pockets) seed(px, py);

  while (head < tail) {
    const cur = q[head++];
    const x = cur % w, y = (cur / w) | 0;
    if (x > 0 && !bg[cur - 1] && !barrier[cur - 1]) { bg[cur - 1] = 1; q[tail++] = cur - 1; }
    if (x + 1 < w && !bg[cur + 1] && !barrier[cur + 1]) { bg[cur + 1] = 1; q[tail++] = cur + 1; }
    if (y > 0 && !bg[cur - w] && !barrier[cur - w]) { bg[cur - w] = 1; q[tail++] = cur - w; }
    if (y + 1 < h && !bg[cur + w] && !barrier[cur + w]) { bg[cur + w] = 1; q[tail++] = cur + w; }
  }

  let fg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) fg[i] = bg[i] ? 0 : 1;
  fg = keepLargestComponent(fg, w, h);

  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(fg);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!fg[i]) continue;
        if (fg[i - 1] && fg[i + 1] && fg[i - w] && fg[i + w]) continue;
        const o = i * 4;
        const r = src[o], g = src[o + 1], b = src[o + 2];
        const luma = lumaArr[i];
        const isTan = (y >= 292 && luma > 135 && r - b > 22);
        const isPale = (luma > 162 && Math.max(r, g, b) - Math.min(r, g, b) < 40);
        if (isTan || isPale) next[i] = 0;
      }
    }
    fg = next;
  }
  fg = keepLargestComponent(fg, w, h);

  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (fg[y * w + x]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const cut = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = (minY + y) * w + (minX + x);
      const so = si * 4, doff = (y * cw + x) * 4;
      if (fg[si]) {
        let r = src[so], g = src[so + 1], b = src[so + 2];
        // Crisp dark ink reinforcement for "AJUSTE FISCAL" and facial contours on PS1 64x64
        if (lumaArr[si] < 120) {
          r = Math.round(r * 0.72); g = Math.round(g * 0.72); b = Math.round(b * 0.72);
        }
        cut[doff] = r; cut[doff + 1] = g; cut[doff + 2] = b; cut[doff + 3] = 255;
      }
    }
  }
  return { w: cw, h: ch, rgba: cut };
}

function cutoutDilmaPhoto() {
  const srcPath = path.join(ROOT, 'fotos_para_coletaveis/dilma_barril.png');
  const { w, h } = psxLib.probeDims(srcPath);
  const src = psxLib.loadRgba(srcPath, w, h);

  const isBgColor = (x, y) => {
    const o = (y * w + x) * 4;
    const r = src[o], g = src[o + 1], b = src[o + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (g - r >= 4 && g >= 88) return true;
    if (g >= r - 2 && g >= b - 12 && luma >= 122 && r < 215) return true;
    if (luma >= 180 && (r - b < 35)) return true;
    if (y >= 198 && x >= 102 && luma >= 132 && sat < 55) return true;
    return false;
  };

  const bg = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  const seed = (x, y) => {
    const idx = y * w + x;
    if (!bg[idx] && isBgColor(x, y)) { bg[idx] = 1; q[tail++] = idx; }
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }

  while (head < tail) {
    const cur = q[head++];
    const x = cur % w, y = (cur / w) | 0;
    if (x > 0 && !bg[cur - 1] && isBgColor(x - 1, y)) { bg[cur - 1] = 1; q[tail++] = cur - 1; }
    if (x + 1 < w && !bg[cur + 1] && isBgColor(x + 1, y)) { bg[cur + 1] = 1; q[tail++] = cur + 1; }
    if (y > 0 && !bg[cur - w] && isBgColor(x, y - 1)) { bg[cur - w] = 1; q[tail++] = cur - w; }
    if (y + 1 < h && !bg[cur + w] && isBgColor(x, y + 1)) { bg[cur + w] = 1; q[tail++] = cur + w; }
  }

  let fg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) fg[i] = bg[i] ? 0 : 1;
  fg = keepLargestComponent(fg, w, h);

  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(fg);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!fg[i]) continue;
        if (fg[i - 1] && fg[i + 1] && fg[i - w] && fg[i + w]) continue;
        const o = i * 4;
        const r = src[o], g = src[o + 1], b = src[o + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const inFace = (y >= 16 && y <= 65 && x >= 44 && x <= 88);
        if (!inFace && ((g >= r - 10 && luma > 95) || (luma > 142 && r - b < 50))) next[i] = 0;
        if (y >= 205 && x >= 106 && luma > 105) next[i] = 0;
      }
    }
    fg = next;
  }
  {
    const next = new Uint8Array(fg);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (fg[i] && (fg[i - 1] + fg[i + 1] + fg[i - w] + fg[i + w]) <= 1) next[i] = 0;
    }
    fg = next;
  }
  fg = keepLargestComponent(fg, w, h);

  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (fg[y * w + x]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const cut = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = (minY + y) * w + (minX + x);
      const so = si * 4, doff = (y * cw + x) * 4;
      if (fg[si]) {
        let r = src[so], g = src[so + 1], b = src[so + 2];
        const isEdge = x === 0 || y === 0 || x === cw - 1 || y === ch - 1 ||
          !fg[si - 1] || !fg[si + 1] || !fg[si - w] || !fg[si + w];
        if (isEdge) {
          if (g > r * 0.85) { g = Math.round(r * 0.78); b = Math.min(b, Math.round(r * 0.65)); }
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const inFace = (minY + y >= 15 && minY + y <= 65);
          if (!inFace && lum > 145) {
            r = Math.round(r * 0.72); g = Math.round(g * 0.66); b = Math.round(b * 0.58);
          }
        }
        cut[doff] = r; cut[doff + 1] = g; cut[doff + 2] = b; cut[doff + 3] = 255;
      }
    }
  }
  return { w: cw, h: ch, rgba: cut };
}

function resampleCutoutArea(src, sw, sh, tw, th, opts = {}) {
  const pad = opts.pad ?? 1;
  const innerW = tw - pad * 2, innerH = th - pad * 2;
  const scale = Math.min(innerW / sw, innerH / sh);
  const drawW = sw * scale, drawH = sh * scale;
  const offX = (tw - drawW) * 0.5;
  const offY = (th - drawH) * 0.5;
  const out = Buffer.alloc(tw * th * 4);

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx0 = (x - offX) / scale, sx1 = (x + 1 - offX) / scale;
      const sy0 = (y - offY) / scale, sy1 = (y + 1 - offY) / scale;
      const ix0 = Math.max(0, Math.floor(sx0)), ix1 = Math.min(sw - 1, Math.floor(sx1));
      const iy0 = Math.max(0, Math.floor(sy0)), iy1 = Math.min(sh - 1, Math.floor(sy1));
      if (sx1 <= 0 || sx0 >= sw || sy1 <= 0 || sy0 >= sh) continue;

      let wSum = 0, aSum = 0, rSum = 0, gSum = 0, bSum = 0;
      for (let sy = iy0; sy <= iy1; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = ix0; sx <= ix1; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const wt = wx * wy;
          const o = (sy * sw + sx) * 4;
          wSum += wt;
          if (src[o + 3] >= 128) {
            aSum += wt;
            rSum += src[o] * wt;
            gSum += src[o + 1] * wt;
            bSum += src[o + 2] * wt;
          }
        }
      }
      if (wSum > 0 && aSum / wSum >= (opts.alphaThresh ?? 0.44)) {
        let r = rSum / aSum, g = gSum / aSum, b = bSum / aSum;
        const cont = opts.contrast ?? 1.12;
        const sat = opts.sat ?? 1.18;
        r = (r - 128) * cont + 128;
        g = (g - 128) * cont + 128;
        b = (b - 128) * cont + 128;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = clamp(Math.round(lum + (r - lum) * sat), 0, 255);
        g = clamp(Math.round(lum + (g - lum) * sat), 0, 255);
        b = clamp(Math.round(lum + (b - lum) * sat), 0, 255);
        const doff = (y * tw + x) * 4;
        out[doff] = r; out[doff + 1] = g; out[doff + 2] = b; out[doff + 3] = 255;
      }
    }
  }
  return out;
}

function quantizeAlphaCutout16(rgba, w, h, weightFn = null, anchorColors = []) {
  const samples = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (rgba[o + 3] >= 128) {
        const wt = weightFn ? weightFn(x, y, rgba[o], rgba[o + 1], rgba[o + 2]) : 1;
        for (let k = 0; k < wt; k++) samples.push([rgba[o], rgba[o + 1], rgba[o + 2]]);
      }
    }
  }
  const targetK = 15 - anchorColors.length;
  let boxes = [samples];
  while (boxes.length < targetK) {
    let bestIdx = -1, bestScore = -1, bestCh = 0;
    for (let bi = 0; bi < boxes.length; bi++) {
      const box = boxes[bi];
      if (box.length < 2) continue;
      let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
      for (const p of box) {
        if (p[0] < rMin) rMin = p[0]; if (p[0] > rMax) rMax = p[0];
        if (p[1] < gMin) gMin = p[1]; if (p[1] > gMax) gMax = p[1];
        if (p[2] < bMin) bMin = p[2]; if (p[2] > bMax) bMax = p[2];
      }
      const sr = (rMax - rMin) * 1.4, sg = (gMax - gMin) * 2.0, sb = (bMax - bMin) * 1.1;
      const maxS = Math.max(sr, sg, sb);
      const score = maxS * Math.sqrt(box.length);
      if (score > bestScore && maxS > 0) {
        bestScore = score; bestIdx = bi;
        bestCh = (sg >= sr && sg >= sb) ? 1 : (sr >= sb ? 0 : 2);
      }
    }
    if (bestIdx < 0) break;
    const box = boxes.splice(bestIdx, 1)[0];
    box.sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes.push(box.slice(0, mid), box.slice(mid));
  }

  const cents = [
    ...anchorColors.map(c => [...c]),
    ...boxes.map(box => {
      let sr = 0, sg = 0, sb = 0;
      for (const p of box) { sr += p[0]; sg += p[1]; sb += p[2]; }
      return [sr / box.length, sg / box.length, sb / box.length];
    }),
  ];
  for (let it = 0; it < 8; it++) {
    const sums = cents.map(() => [0, 0, 0, 0]);
    for (const p of samples) {
      let best = 0, bestD = 1e18;
      for (let c = 0; c < cents.length; c++) {
        const dr = p[0] - cents[c][0], dg = p[1] - cents[c][1], db = p[2] - cents[c][2];
        const d = dr * dr * 2 + dg * dg * 4 + db * db * 1.5;
        if (d < bestD) { bestD = d; best = c; }
      }
      sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3]++;
    }
    for (let c = anchorColors.length; c < cents.length; c++) {
      if (sums[c][3] > 0) {
        cents[c][0] = sums[c][0] / sums[c][3];
        cents[c][1] = sums[c][1] / sums[c][3];
        cents[c][2] = sums[c][2] / sums[c][3];
      }
    }
  }

  // CRITICAL THPS2 PS1 HARDWARE INVARIANT (verified in SLUS_010.66 @ 0x80052060..0x800520B4):
  // THPS2's CLUT uploader converts 0x0000 -> 0x8000 (OPAQUE BLACK!) and ONLY converts
  // 0x7C1F (magenta) -> 0x0000 (100% PS1 GPU hardware transparent)!
  const pal15 = [0x7c1f];
  const palDec = [[0, 0, 0]];
  for (let c = 0; c < 15; c++) {
    const col = cents[c] || [16, 16, 16];
    let v = psxLib.rgbToBgr555Opaque(
      clamp(Math.round(col[0]), 0, 255),
      clamp(Math.round(col[1]), 0, 255),
      clamp(Math.round(col[2]), 0, 255)
    );
    if ((v & 0x7fff) === 0) v = 0x8421;
    if ((v & 0x7fff) === 0x7c1f) v = 0xf81f; // never collide with magenta transparency key!
    pal15.push(v);
    palDec.push([((v & 31) * 255 / 31) | 0, (((v >> 5) & 31) * 255 / 31) | 0, (((v >> 10) & 31) * 255 / 31) | 0]);
  }

  const indices = new Uint8Array(w * h);
  const rgbaOut = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] < 128) { indices[i] = 0; continue; }
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    let bestC = 1, bestD = 1e18;
    for (let c = 1; c < palDec.length; c++) {
      const dr = r - palDec[c][0], dg = g - palDec[c][1], db = b - palDec[c][2];
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 1.5;
      if (d < bestD) { bestD = d; bestC = c; }
    }
    indices[i] = bestC;
    rgbaOut[i * 4] = palDec[bestC][0];
    rgbaOut[i * 4 + 1] = palDec[bestC][1];
    rgbaOut[i * 4 + 2] = palDec[bestC][2];
    rgbaOut[i * 4 + 3] = 255;
  }
  return { pal15, indices, rgba: rgbaOut };
}

function buildHaddadTexture64() {
  const cut = cutoutHaddadPhoto();
  const rs = resampleCutoutArea(cut.rgba, cut.w, cut.h, 64, 64, { pad: 1, contrast: 1.15, sat: 1.22, alphaThresh: 0.44 });
  const q = quantizeAlphaCutout16(
    rs, 64, 64,
    (x, y) => (y < 32 && x > 28) ? 3 : 1,
    [
      [226, 28, 38],   // red bowtie
      [142, 224, 242], // sky-blue tablecloth
      [252, 118, 162], // vivid pink rabbit nose (far from Haddad's warm peach skin!)
      [252, 252, 252], // crisp white rabbit
      [16, 22, 34],    // deep navy ink & tuxedo
    ]
  );
  return { w: 64, h: 64, ...q };
}

function buildDilmaTexture40x64() {
  const cut = cutoutDilmaPhoto();
  const rs = resampleCutoutArea(cut.rgba, cut.w, cut.h, 40, 64, { pad: 1, contrast: 1.14, sat: 1.20, alphaThresh: 0.44 });
  const q = quantizeAlphaCutout16(
    rs, 40, 64,
    (x, y) => (y >= 4 && y <= 22 && x >= 10 && x <= 28) ? 4 : 1,
    [
      [224, 20, 34],   // bright crimson PT blazer (avoids matching dark amber wood!)
      [52, 24, 18],    // dark hair & barrel hoops
      [244, 202, 176], // warm bright face skin
      [238, 136, 18],  // glowing oak barrel stave
    ]
  );
  return { w: 40, h: 64, ...q };
}

// ============================================================================
// 1. 3D SCULPTED ANATOMICAL RELIEF FIGURINE — HADDAD NO HANGAR (M[8], 0xD0C4F2DA)
// ============================================================================
// Pilot Wings original bbox: [-156..+160, -59..+1, -11..+14] (dx=316, dy=60, dz=25, rad=170)
// Haddad 3D cutout (~1.4x visual presence, hovering cleanly above Pilot Wings base):
//   X in [-120..+120] (W=240), Y in [-216..+24] (H=240), Z in [-26..+26] (52 units plump 3D volume!)
//   5x5 anatomical 3D relief grid (16 front quads + 16 back quads = 32 quads, 34 verts, 1,452 B):
//   - Outer border pins cleanly to Z=0 (ZERO detached/floating ribbons anywhere!)
//   - Interior anatomical 3D relief bulges out over Haddad's caricature head (+24), hands/top-hat (+20),
//     tuxedo torso (+18), rabbit ears (+14), and plump "AJUSTE FISCAL" rabbit belly (+26)!
//   - Linear UV across [0..63]x[0..63] guarantees 100.0% pixel coverage & hardware 0x0000 cutout silhouette!

function buildHaddad3DMesh(psxBuf, tex64) {
  const info = inspectPsxTables(psxBuf);
  const cCenter = findClosestRgbIndex(psxBuf, info, [148, 148, 148]);
  const cEdge   = findClosestRgbIndex(psxBuf, info, [122, 122, 122]);
  const ti = 24; // exclusive 64x64 4-bit texture 0xDA38F58B

  // Center Haddad cleanly around Pilot Wings' pickup pivot (Pilot Wings: X=[-156..160], Y=[-59..+1], rad=170).
  // W=220, H=220, Y in [-150..+70] keeps Haddad dead-center inside the blue pickup glow (~1.5x visual presence)!
  const W = 220, H = 220, yTop = -150;
  // Grid columns & rows aligned to anatomical landmarks of haddad_64x64:
  //   uCols: [0, 16, 32, 48, 63]
  //   vRows: [0, 16, 32, 48, 63]
  const uCols = [0, 16, 32, 48, 63];
  const vRows = [0, 16, 32, 48, 63];

  // Anatomical 3D Z-thickness map (row x col) — smooth sculpted relief (outer border=0 -> seamless!)
  //   Row 1 (v=16): col1=rabbit ears(10), col2=hands/ear(13), col3=Haddad head/face(16)!
  //   Row 2 (v=32): col1=top hat(14),     col2=hands/bow(16), col3=tuxedo chest(14)!
  //   Row 3 (v=48): col1=plump rabbit(18),col2=rabbit/leg(15),col3=tuxedo hip/leg(12)!
  const zDepth = [
    [0,  0,  0,  0, 0],
    [0, 10, 13, 16, 0],
    [0, 14, 16, 14, 0],
    [0, 18, 15, 12, 0],
    [0,  0,  0,  0, 0],
  ];

  // Build vertex pool: shared perimeter (Z=0) + 9 front interior (+Z) + 9 back interior (-Z) = 34 verts!
  const verts = [];
  const frontIdx = Array.from({ length: 5 }, () => new Array(5));
  const backIdx  = Array.from({ length: 5 }, () => new Array(5));
  const uvToXY = (u, v) => [
    Math.round((0.5 - u / 63) * W),
    Math.round(yTop + (v / 63) * H),
  ];

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const [x, y] = uvToXY(uCols[c], vRows[r]);
      const z = zDepth[r][c];
      if (z === 0) {
        const idx = verts.length;
        verts.push([x, y, 0]);
        frontIdx[r][c] = idx;
        backIdx[r][c] = idx;
      } else {
        frontIdx[r][c] = verts.length;
        verts.push([x, y, +z]);
        backIdx[r][c] = verts.length;
        verts.push([x, y, -z]);
      }
    }
  }

  const norms = [];
  const faces = [];

  // 16 Front (+Z) sculpted relief quads (viewer's LEFT is +X -> u increases as c increases 0..4!)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const tl = frontIdx[r][c], tr = frontIdx[r][c + 1];
      const bl = frontIdx[r + 1][c], br = frontIdx[r + 1][c + 1];
      const qv = [tl, tr, bl, br];
      // Outward normal points toward +Z (computed directly from true 3D sloped surface!)
      const nVec = vecCross(vecSub(verts[bl], verts[tl]), vecSub(verts[tr], verts[tl]));
      const outN = vecNorm4096(nVec[2] >= 0 ? nVec : [-nVec[0], -nVec[1], -nVec[2]]);
      assertPs1QuadWinding(verts, qv, outN, `Haddad_front_${r}_${c}`);
      const ni = norms.length;
      norms.push(outN);
      const col = (zDepth[r][c] > 0 || zDepth[r + 1][c + 1] > 0) ? cCenter : cEdge;
      faces.push({
        fl: 0x0803,
        v: qv,
        rgb: [
          zDepth[r][c] > 0 ? cCenter : cEdge,
          zDepth[r][c + 1] > 0 ? cCenter : cEdge,
          zDepth[r + 1][c] > 0 ? cCenter : cEdge,
          zDepth[r + 1][c + 1] > 0 ? cCenter : cEdge,
        ],
        ni,
        ti,
        uv: [
          uCols[c], vRows[r], uCols[c + 1], vRows[r],
          uCols[c], vRows[r + 1], uCols[c + 1], vRows[r + 1],
        ],
      });
    }
  }

  // 16 Back (-Z) sculpted relief quads (seamless physical back of the 3D figurine!)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      // Standing at -Z looking toward 0: viewer's LEFT is -X (c+1), viewer's RIGHT is +X (c)!
      const tl = backIdx[r][c + 1], tr = backIdx[r][c];
      const bl = backIdx[r + 1][c + 1], br = backIdx[r + 1][c];
      const qv = [tl, tr, bl, br];
      const nVec = vecCross(vecSub(verts[bl], verts[tl]), vecSub(verts[tr], verts[tl]));
      const outN = vecNorm4096(nVec[2] <= 0 ? nVec : [-nVec[0], -nVec[1], -nVec[2]]);
      assertPs1QuadWinding(verts, qv, outN, `Haddad_back_${r}_${c}`);
      const ni = norms.length;
      norms.push(outN);
      faces.push({
        fl: 0x0803,
        v: qv,
        rgb: [
          zDepth[r][c + 1] > 0 ? cCenter : cEdge,
          zDepth[r][c] > 0 ? cCenter : cEdge,
          zDepth[r + 1][c + 1] > 0 ? cCenter : cEdge,
          zDepth[r + 1][c] > 0 ? cCenter : cEdge,
        ],
        ni,
        ti,
        uv: [
          uCols[c + 1], vRows[r], uCols[c], vRows[r],
          uCols[c + 1], vRows[r + 1], uCols[c], vRows[r + 1],
        ],
      });
    }
  }

  const meshBuf = buildPsxMeshBlock({ flags: 8, verts, norms, faces });
  return {
    meshBuf,
    stats: { nV: verts.length, nN: norms.length, nF: faces.length, bytes: meshBuf.length, missed: 0 },
    geometry: { verts, norms, faces },
  };
}

// ============================================================================
// 2. TRUE 3D CURVED HALF-BARREL + DILMA BUST — SCHOOL II BELLS (sksl2_o.psx M[5])
// ============================================================================
// Original School Bell bbox: [-43..+42, -43..+42, 0..+32] (85x85x32, rad=63, 420 B, 184 B free -> 604 B max!)
// New 3D Dilma no Barril (~1.5x bell scale, exact 40:64 vertical barrel aspect ratio):
//   X in [-50..+50] (W=100), Y in [-82..+74] (H=156), Z in [0..+42] (flush on School II wall at Z=0!)
//   5-column x 4-row true 3D half-cylinder barrel + curved Dilma bust (20 verts, 12 quads, 588 B <= 604 B!):
//   - Left & right edges curve smoothly ALL THE WAY back to Z=0 on the wall -> ZERO detached floating ribbons!
//   - Wooden oak barrel bulges out in a true semicircle (Z = 0 -> +28 -> +42 -> +28 -> 0)!
//   - Dilma's smiling face & crimson blazer emerge cleanly in 3D relief above the barrel rim!

function buildDilma3DMesh(psxBuf, tex40x64) {
  const info = inspectPsxTables(psxBuf);
  const cCenter = findClosestRgbIndex(psxBuf, info, [162, 158, 148]); // bright front highlight
  const cMid    = findClosestRgbIndex(psxBuf, info, [132, 129, 122]); // cylindrical mid-tone
  const cWall   = findClosestRgbIndex(psxBuf, info, [88, 86, 82]);    // shaded edge touching wall
  const ti = 16; // exclusive 40x64 4-bit texture 0xFC079202 in sksl2_l.psx

  // 5 semicircle columns across X (viewer's LEFT is +X -> u = 0..39):
  //   col 0 (+50, u=0):  wall edge (Z = 0!)
  //   col 1 (+30, u=8):  curved barrel side (Z = 0.72 * zMax)
  //   col 2 (  0, u=20): front spine (Z = 1.00 * zMax)
  //   col 3 (-30, u=31): curved barrel side (Z = 0.72 * zMax)
  //   col 4 (-50, u=39): wall edge (Z = 0!)
  const cols = [
    { x: +50, u: 0,  zMul: 0.00, colIdx: cWall },
    { x: +30, u: 8,  zMul: 0.72, colIdx: cMid },
    { x:   0, u: 20, zMul: 1.00, colIdx: cCenter },
    { x: -30, u: 31, zMul: 0.72, colIdx: cMid },
    { x: -50, u: 39, zMul: 0.00, colIdx: cWall },
  ];
  // 4 vertical rows (top hair -> shoulders/barrel rim -> barrel belly -> barrel base):
  // Top & bottom center taper cleanly back toward Z=8 so there are no open hollow ends from above/below!
  const rows = [
    { y: -82, v: 0,  zMax: 10 }, // Row 0: Top of Dilma's hair (gentle taper toward wall)
    { y: -24, v: 24, zMax: 34 }, // Row 1: Dilma's face/shoulders + top iron hoop of barrel
    { y: +30, v: 46, zMax: 42 }, // Row 2: Widest 3D curved oak barrel belly!
    { y: +74, v: 63, zMax: 12 }, // Row 3: Tapered barrel base curving neatly into wall
  ];

  const verts = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      verts.push([cols[c].x, rows[r].y, Math.round(rows[r].zMax * cols[c].zMul)]);
    }
  }

  // 8 shared curved surface normals (4 column azimuths x 2 vertical tilts) to stay strictly <= 604 B!
  //   28 + 20*8(160) + 8*8(64) + 12*28(336) = 588 B <= 604 B (16 B spare!!)!
  const norms = [
    vecNorm4096([+3200, -700, +2400]), // 0: upper far-left
    vecNorm4096([+1400, -500, +3800]), // 1: upper mid-left
    vecNorm4096([-1400, -500, +3800]), // 2: upper mid-right
    vecNorm4096([-3200, -700, +2400]), // 3: upper far-right
    vecNorm4096([+3200, +600, +2400]), // 4: lower far-left
    vecNorm4096([+1400, +500, +3800]), // 5: lower mid-left
    vecNorm4096([-1400, +500, +3800]), // 6: lower mid-right
    vecNorm4096([-3200, +600, +2400]), // 7: lower far-right
  ];

  const faces = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const tl = r * 5 + c, tr = r * 5 + (c + 1);
      const bl = (r + 1) * 5 + c, br = (r + 1) * 5 + (c + 1);
      const qv = [tl, tr, bl, br];
      const ni = (r === 0 ? 0 : 4) + c;
      assertPs1QuadWinding(verts, qv, norms[ni], `Dilma_cyl_${r}_${c}`);
      faces.push({
        fl: 0x1803,
        v: qv,
        rgb: [cols[c].colIdx, cols[c + 1].colIdx, cols[c].colIdx, cols[c + 1].colIdx],
        ni,
        ti,
        uv: [
          cols[c].u, rows[r].v, cols[c + 1].u, rows[r].v,
          cols[c].u, rows[r + 1].v, cols[c + 1].u, rows[r + 1].v,
        ],
      });
    }
  }

  const meshBuf = buildPsxMeshBlock({ flags: 8, verts, norms, faces });
  if (meshBuf.length > 604) {
    throw new Error(`Dilma M[5] size ${meshBuf.length} B exceeds sksl2_o.psx sector budget (604 B)!`);
  }
  return {
    meshBuf,
    stats: { nV: verts.length, nN: norms.length, nF: faces.length, bytes: meshBuf.length, missed: 0 },
    geometry: { verts, norms, faces },
  };
}

// ============================================================================
// Software PS1 GTE Multi-Angle 3D Preview Renderer (With Hardware 0x0000 Alpha!)
// ============================================================================

function renderPs1MeshPreview(geometry, tex, outPath, anglesDeg, bgRgb = [42, 52, 68]) {
  const PW = 220, PH = 220;
  const totalW = PW * anglesDeg.length;
  const out = Buffer.alloc(totalW * PH * 4);
  for (let i = 0; i < totalW * PH; i++) {
    out[i * 4] = bgRgb[0]; out[i * 4 + 1] = bgRgb[1]; out[i * 4 + 2] = bgRgb[2]; out[i * 4 + 3] = 255;
  }

  const { verts, faces } = geometry;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const [x, y, z] of verts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, cz = (minZ + maxZ) * 0.5;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const scale = (PW * 0.72) / span;

  const drawTri = (zbuf, ox, p0, p1, p2, uv0, uv1, uv2, shade) => {
    // PS1 GTE screen projection: remember looking from +Z toward 0 with Y_down:
    // Viewer's RIGHT is -X, Viewer's DOWN is +Y! So screenX = -camX!
    const x0 = p0[0], y0 = p0[1], x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
    // Backface cull matching PS1 NCLIP (screen-space signed area)
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area <= 0) return; // cull backfaces!

    const minSX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxSX = Math.min(PW - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minSY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxSY = Math.min(PH - 1, Math.ceil(Math.max(y0, y1, y2)));

    for (let sy = minSY; sy <= maxSY; sy++) {
      for (let sx = minSX; sx <= maxSX; sx++) {
        const px = sx + 0.5, py = sy + 0.5;
        const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
        const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
        const z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2];
        const zi = sy * PW + sx;
        if (z <= zbuf[zi]) continue; // larger Z is closer to viewer at +Z!

        const u = clamp(Math.round(w0 * uv0[0] + w1 * uv1[0] + w2 * uv2[0]), 0, tex.w - 1);
        const v = clamp(Math.round(w0 * uv0[1] + w1 * uv1[1] + w2 * uv2[1]), 0, tex.h - 1);
        const ci = tex.indices[v * tex.w + u];
        if (ci === 0) continue; // Hardware PS1 0x0000 transparency!

        zbuf[zi] = z;
        const to = (v * tex.w + u) * 4;
        const doff = (sy * totalW + ox + sx) * 4;
        out[doff + 0] = clamp(Math.round(tex.rgba[to + 0] * shade), 0, 255);
        out[doff + 1] = clamp(Math.round(tex.rgba[to + 1] * shade), 0, 255);
        out[doff + 2] = clamp(Math.round(tex.rgba[to + 2] * shade), 0, 255);
      }
    }
  };

  for (let ai = 0; ai < anglesDeg.length; ai++) {
    const yaw = (anglesDeg[ai] * Math.PI) / 180;
    const pitch = (10 * Math.PI) / 180;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const cpi = Math.cos(pitch), spi = Math.sin(pitch);
    const zbuf = new Float32Array(PW * PH).fill(-1e9);
    const ox = ai * PW;

    const proj = verts.map(([x, y, z]) => {
      const rx = x - cx, ry = y - cy, rz = z - cz;
      const x1 = rx * cyw + rz * syw;
      const z1 = -rx * syw + rz * cyw;
      const y2 = ry * cpi - z1 * spi;
      const z2 = ry * spi + z1 * cpi;
      // Camera at +Z looking toward 0 -> screenX = PW/2 - x1*scale (since +X is viewer's LEFT!)
      return [PW * 0.5 - x1 * scale, PH * 0.5 + y2 * scale, z2];
    });

    for (const f of faces) {
      const isTri = (f.fl & 0x10) !== 0;
      const shade = 0.96;
      if (isTri) {
        drawTri(zbuf, ox, proj[f.v[0]], proj[f.v[1]], proj[f.v[2]],
          [f.uv[0], f.uv[1]], [f.uv[2], f.uv[3]], [f.uv[4], f.uv[5]], shade);
      } else {
        drawTri(zbuf, ox, proj[f.v[0]], proj[f.v[1]], proj[f.v[2]],
          [f.uv[0], f.uv[1]], [f.uv[2], f.uv[3]], [f.uv[4], f.uv[5]], shade);
        drawTri(zbuf, ox, proj[f.v[1]], proj[f.v[3]], proj[f.v[2]],
          [f.uv[2], f.uv[3]], [f.uv[6], f.uv[7]], [f.uv[4], f.uv[5]], shade);
      }
    }
  }
  psxLib.writePng(outPath, totalW, PH, out);
}

// ============================================================================
// High-Level Patching Entry Points (Used by mod_lulao_world_assets.js!)
// ============================================================================

function patchHangarHaddadInPsx(psxBuf, label, tex64) {
  const origSecs = Math.ceil(psxBuf.length / 2048);
  const { meshBuf, stats, geometry } = buildHaddad3DMesh(psxBuf, tex64);
  let out = replacePsxMesh(psxBuf, 8, meshBuf);
  out = replacePsxTexture4Bit(out, HASH_WINGS_TEX, 64, 64, tex64.pal15, tex64.indices);
  const newSecs = Math.ceil(out.length / 2048);
  if (newSecs !== origSecs) {
    throw new Error(`${label} sector overflow! orig=${psxBuf.length} (${origSecs} sec), new=${out.length} (${newSecs} sec)`);
  }
  return { buf: out, stats, geometry, origSize: psxBuf.length, newSize: out.length, maxBytes: origSecs * 2048 };
}

function patchSchool2Dilma(sl2OBuf, sl2LBuf, sl2L2Buf, tex40x64) {
  const oOrigSecs = Math.ceil(sl2OBuf.length / 2048);
  const lOrigSecs = Math.ceil(sl2LBuf.length / 2048);
  const l2OrigSecs = Math.ceil(sl2L2Buf.length / 2048);

  const { meshBuf, stats, geometry } = buildDilma3DMesh(sl2OBuf, tex40x64);
  const newO = replacePsxMesh(sl2OBuf, 5, meshBuf);
  const newL = replacePsxTexture4Bit(sl2LBuf, HASH_BELL_TEX, 40, 64, tex40x64.pal15, tex40x64.indices);
  const newL2 = replacePsxTexture4Bit(sl2L2Buf, HASH_BELL_TEX, 40, 64, tex40x64.pal15, tex40x64.indices);

  if (Math.ceil(newO.length / 2048) !== oOrigSecs) {
    throw new Error(`sksl2_o.psx sector overflow: ${newO.length} > ${oOrigSecs * 2048}`);
  }
  if (Math.ceil(newL.length / 2048) !== lOrigSecs) {
    throw new Error(`sksl2_l.psx sector overflow: ${newL.length} > ${lOrigSecs * 2048}`);
  }
  if (Math.ceil(newL2.length / 2048) !== l2OrigSecs) {
    throw new Error(`sksl2_l2.psx sector overflow: ${newL2.length} > ${l2OrigSecs * 2048}`);
  }
  return {
    newO, newL, newL2, stats, geometry,
    sizes: {
      o: [sl2OBuf.length, newO.length, oOrigSecs * 2048],
      l: [sl2LBuf.length, newL.length, lOrigSecs * 2048],
      l2: [sl2L2Buf.length, newL2.length, l2OrigSecs * 2048],
    },
  };
}

module.exports = {
  HASH_WINGS_MESH,
  HASH_WINGS_TEX,
  HASH_BELL_MESH,
  HASH_BELL_TEX,
  buildHaddadTexture64,
  buildDilmaTexture40x64,
  patchHangarHaddadInPsx,
  patchSchool2Dilma,
  renderPs1MeshPreview,
};

if (require.main === module) {
  const previewDir = process.argv.includes('--preview-dir')
    ? process.argv[process.argv.indexOf('--preview-dir') + 1]
    : path.join(ROOT, 'scratch_qa_3d');
  fs.mkdirSync(previewDir, { recursive: true });

  function parseHed(buf) {
    const entries = [];
    for (let off = 0; off + 12 <= buf.length; off += 12) {
      const hash = buf.readUInt32LE(off), offset = buf.readUInt32LE(off + 4), size = buf.readUInt32LE(off + 8);
      if (hash === 0xffffffff) break;
      entries.push({ idx: entries.length, hash, offset, size });
    }
    return entries;
  }
  const hed = parseHed(fs.readFileSync(path.join(psxLib.backupDir, 'CD.HED')));
  const wad = fs.readFileSync(path.join(psxLib.backupDir, 'CD.WAD'));
  const getE = (i) => Buffer.from(wad.subarray(hed[i].offset, hed[i].offset + hed[i].size));

  const hadTex = buildHaddadTexture64();
  const dilTex = buildDilmaTexture40x64();

  const resH1 = patchHangarHaddadInPsx(getE(14), 'skhan_o.psx', hadTex);
  const resH2 = patchHangarHaddadInPsx(getE(1109), 'skhan_o2.psx', hadTex);
  const resD  = patchSchool2Dilma(getE(1095), getE(1094), getE(1096), dilTex);

  console.log('=== 3D HADDAD HANGAR (M[8], 0xD0C4F2DA) ===');
  console.log('  Mesh stats:', resH1.stats);
  console.log(`  skhan_o.psx:  ${resH1.origSize} -> ${resH1.newSize} / ${resH1.maxBytes} B (free=${resH1.maxBytes - resH1.newSize} B)`);
  console.log(`  skhan_o2.psx: ${resH2.origSize} -> ${resH2.newSize} / ${resH2.maxBytes} B (free=${resH2.maxBytes - resH2.newSize} B)`);

  console.log('=== 3D DILMA NO BARRIL SCHOOL II (M[5], 0x9DB64BF3) ===');
  console.log('  Mesh stats:', resD.stats);
  console.log(`  sksl2_o.psx:  ${resD.sizes.o[0]} -> ${resD.sizes.o[1]} / ${resD.sizes.o[2]} B (free=${resD.sizes.o[2] - resD.sizes.o[1]} B)`);
  console.log(`  sksl2_l.psx:  ${resD.sizes.l[0]} -> ${resD.sizes.l[1]} / ${resD.sizes.l[2]} B (free=${resD.sizes.l[2] - resD.sizes.l[1]} B)`);
  console.log(`  sksl2_l2.psx: ${resD.sizes.l2[0]} -> ${resD.sizes.l2[1]} / ${resD.sizes.l2[2]} B (free=${resD.sizes.l2[2] - resD.sizes.l2[1]} B)`);

  // Verify round-trip parsePsxStructure on ALL 5 patched PSX buffers!
  for (const [nm, buf] of [
    ['skhan_o.psx', resH1.buf], ['skhan_o2.psx', resH2.buf],
    ['sksl2_o.psx', resD.newO], ['sksl2_l.psx', resD.newL], ['sksl2_l2.psx', resD.newL2]
  ]) {
    const p = inspectPsxTables(buf);
    console.log(`  Round-trip parse OK: ${nm} (objs=${p.objs.length}, meshes=${p.numMeshes}, tex=${p.textures.length})`);
  }

  // Render multi-angle 3D PS1 GTE previews!
  const hadPng = path.join(previewDir, 'haddad_3d_multiangle.png');
  const dilPng = path.join(previewDir, 'dilma_3d_multiangle.png');
  renderPs1MeshPreview(resH1.geometry, hadTex, hadPng, [0, 35, 75, 180], [44, 54, 70]);
  renderPs1MeshPreview(resD.geometry, dilTex, dilPng, [0, 30, -30, 62], [68, 62, 56]);
  console.log('Wrote 3D previews:', hadPng, dilPng);
}
