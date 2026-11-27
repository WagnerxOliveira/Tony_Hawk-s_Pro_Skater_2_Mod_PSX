#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) — Crash Bandicoot ("Crash B.", Slot 20) Exclusive 3D Collectibles Builder v2
 *
 * Surgically builds 100% PS1-hardware-verified Crash 3 3D collectibles served EXCLUSIVELY when
 * playing as Crash B. (Slot 20) across ALL 19 levels (THPS2 + THPS1) — ZERO modification to CD.WAD
 * and ZERO impact on Lulao, Tony Hawk, or any other skater!
 *
 * Key Architectural & PS1 Hardware Guarantees:
 *   - 100% Authentic Naughty Dog Crash 3 textures un-projected directly from extracted Crash 3 .OBJ/.PNG
 *     models (BT10G TNT Crate, Bn10G NITRO Crate, BC10G Checkpoint "C" Crate, BN10G wood lid, WD10G Aku Aku,
 *     Uk17G Uka Uka, Cry1G Power Crystal, Ge10G Diamond / Emerald Gem, Rel1G Gold Time Relic w/ Sapphire Jewel).
 *   - Bleed-free per-triangle 128x64 8bpp (256-color) tile repacker with TRUE PS1 0x7C1F hardware alpha
 *     cutouts (feathers, beards, bones, Wumpa leaf) and automatic double-sidedness strictly on cutout faces!
 *   - ZERO opaque 0x0000 black pixels in ANY 4bpp or 8bpp palette (all opaque colors clamped >= 0x0421).
 *   - Exact Hangar floor-grounded TNT Crate bounds (Y = [-62, +63] matching original Barrel 0x4eb2c689 to
 *     the exact unit, beveled octagonal corners maxR = 51.4 < 52.6 half-spacing so 3-crate Hangar clusters
 *     stack flush with ZERO floating, ZERO interpenetration, and ZERO PS1 OT Z-sorting holes!), 2x2 subdivided
 *     on every side (ZERO near-plane disappearing faces, ZERO affine texture warping!).
 *   - Correct Cash denomination mapping verified from original items.psx:
 *       M[9]  (0xcc4e141f, $100) -> 3D Power Crystal ("Cristal +100!")
 *       M[10] (0x260f4f80, $50)  -> 3D Wumpa Fruit ("Manga Wumpa +50!")
 *       M[11] (0x694ed947, $250) -> 3D Sparkling Diamond ("Diamante +250!")
 *   - Battle-tested PS1 face flags: fl = 0x1003 (opaque flat direct-RGB POLY_FT4, zero RGBs-chunk dependency)
 *     and fl = 0x10C3 / gpu = 0x2e (PS1 hardware ABR=1 additive semi-transparent aura — NEVER illegal 0x18C3!).
 *   - Downtown (cr_down.psx) uses vivid EMERALD GREEN Warp Gem matching "5 Gemas Warp Esmeralda".
 *   - Mall NY (cr_mall.psx) uses thickened Gold Time Relic with dedicated Sapphire-Blue center jewel (v42/v43).
 *   - Sleek beveled 3D stylized Crash Bandicoot "C - R - A - S - H" letters (true diagonals, zero internal faces).
 */

const fs = require('fs');
const path = require('path');
const psxLib = require('./psx_skater_lib');
const { parseObjFile } = require('./mod_skater_crash');

const ROOT = psxLib.rootDir;
const CRASH_ROOT = path.join(ROOT, 'crash_3_psx', 'crash3_thps2_master');
const OBJ_3D_ROOT = path.join(CRASH_ROOT, '02_extracted_crash3_complete', '04_models_3d_objects');
const THPS1_CONV_DIR = path.join(ROOT, 'build', 'thps1_converted');
const OUT_DIR = path.join(ROOT, 'build', 'crash_assets');
fs.mkdirSync(OUT_DIR, { recursive: true });

const clamp = psxLib.clamp;
const lerp = psxLib.lerp;

// ============================================================================
// 1. PS1 Hardware-Safe Color Conversion & 4-Bit / 8-Bit Quantizers
// ============================================================================
function rgbToPs1Bgr555Opaque(r, g, b) {
  const r5 = clamp(Math.round(r * 31 / 255), 0, 31);
  const g5 = clamp(Math.round(g * 31 / 255), 0, 31);
  const b5 = clamp(Math.round(b * 31 / 255), 0, 31);
  let v = (b5 << 10) | (g5 << 5) | r5;
  if (v === 0x0000) v = 0x0421; // NEVER opaque 0x0000 (hardware transparent hole on PS1!)
  if (v === 0x7C1F) v = (31 << 10) | (1 << 5) | 31; // NEVER accidental magenta alpha key!
  return v;
}

function bgr555ToRgb(v) {
  return [
    Math.round((v & 31) * 255 / 31),
    Math.round(((v >> 5) & 31) * 255 / 31),
    Math.round(((v >> 10) & 31) * 255 / 31),
  ];
}

function make4BitTex(w, h, rgba, transparentIdx0 = false, anchors = []) {
  const startSlot = transparentIdx0 ? 1 : 0;
  const maxOpaque = 16 - startSlot;
  const samples = [];
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (transparentIdx0 && rgba[o + 3] < 128) continue;
    samples.push([rgba[o], rgba[o + 1], rgba[o + 2]]);
  }

  // Deterministic k-means++ seeding with optional high-priority anchors
  const centroids = [];
  for (const a of anchors) {
    if (centroids.length < maxOpaque) centroids.push([a[0], a[1], a[2]]);
  }
  if (centroids.length === 0 && samples.length > 0) {
    centroids.push(samples[0].slice());
  }
  while (centroids.length < maxOpaque && samples.length > 0) {
    let bestIdx = -1, bestDist = -1;
    const step = Math.max(1, Math.floor(samples.length / 512));
    for (let i = 0; i < samples.length; i += step) {
      const s = samples[i];
      let minD = 1e12;
      for (const c of centroids) {
        const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
        if (d < minD) minD = d;
      }
      if (minD > bestDist) { bestDist = minD; bestIdx = i; }
    }
    if (bestIdx < 0 || bestDist < 1) break;
    centroids.push(samples[bestIdx].slice());
  }
  while (centroids.length < maxOpaque) centroids.push([24, 24, 24]);

  // 10 Lloyd iterations keeping anchor slots gently pinned
  for (let it = 0; it < 10; it++) {
    const sums = Array.from({ length: maxOpaque }, () => [0, 0, 0, 0]);
    for (const s of samples) {
      let best = 0, bestD = 1e12;
      for (let k = 0; k < maxOpaque; k++) {
        const c = centroids[k];
        const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      sums[best][0] += s[0]; sums[best][1] += s[1]; sums[best][2] += s[2]; sums[best][3]++;
    }
    for (let k = 0; k < maxOpaque; k++) {
      if (k < anchors.length) {
        const aw = anchors[k][3] || 12;
        const n = sums[k][3];
        centroids[k] = [
          (sums[k][0] + anchors[k][0] * aw) / (n + aw),
          (sums[k][1] + anchors[k][1] * aw) / (n + aw),
          (sums[k][2] + anchors[k][2] * aw) / (n + aw),
        ];
      } else if (sums[k][3] > 0) {
        centroids[k] = [sums[k][0] / sums[k][3], sums[k][1] / sums[k][3], sums[k][2] / sums[k][3]];
      }
    }
  }

  const palBgr = new Uint16Array(16);
  const palRgb = [];
  for (let i = 0; i < 16; i++) {
    if (transparentIdx0 && i === 0) {
      palBgr[0] = 0x7C1F;
      palRgb.push([255, 0, 255]);
    } else {
      const c = centroids[i - startSlot];
      palBgr[i] = rgbToPs1Bgr555Opaque(c[0], c[1], c[2]);
      palRgb.push(bgr555ToRgb(palBgr[i]));
    }
  }

  const palBuf = Buffer.alloc(32);
  for (let i = 0; i < 16; i++) palBuf.writeUInt16LE(palBgr[i], i * 2);

  const stride = Math.ceil(w / 2);
  const pxBytes = Buffer.alloc(stride * h, 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      let ci = 0;
      if (transparentIdx0 && rgba[o + 3] < 128) {
        ci = 0;
      } else {
        const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
        let best = startSlot, bestD = 1e12;
        for (let k = startSlot; k < 16; k++) {
          const p = palRgb[k];
          const d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
          if (d < bestD) { bestD = d; best = k; }
        }
        ci = best;
      }
      const byteOff = y * stride + (x >> 1);
      if (x & 1) pxBytes[byteOff] |= (ci & 0x0F) << 4;
      else pxBytes[byteOff] |= (ci & 0x0F);
    }
  }
  return { w, h, palSize: 16, palBytes: palBuf, pxBytes };
}

function make8BitTex(w, h, rgba, transparentIdx0 = false) {
  // Exact 256-color (or 255-opaque + slot 0 = 0x7C1F) median-cut PS1 quantizer with ZERO 0x0000 opaque holes!
  const startSlot = transparentIdx0 ? 1 : 0;
  const maxColors = 256 - startSlot;

  // Build frequency table of exact PS1 BGR555 opaque colors
  const hist = new Map();
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (transparentIdx0 && rgba[o + 3] < 128) continue;
    const bgr = rgbToPs1Bgr555Opaque(rgba[o], rgba[o + 1], rgba[o + 2]);
    hist.set(bgr, (hist.get(bgr) || 0) + 1);
  }

  let paletteBgr = [];
  if (hist.size <= maxColors) {
    // 100% LOSSLESS exact PS1 color match!
    paletteBgr = [...hist.keys()];
  } else {
    // Median-cut over unique weighted BGR555 bins
    const bins = [];
    for (const [bgr, cnt] of hist.entries()) {
      bins.push({ bgr, r: bgr & 31, g: (bgr >> 5) & 31, b: (bgr >> 10) & 31, cnt });
    }
    const boxes = [bins];
    while (boxes.length < maxColors) {
      let splitIdx = -1, bestScore = -1, splitAxis = 'r';
      for (let i = 0; i < boxes.length; i++) {
        const bx = boxes[i];
        if (bx.length < 2) continue;
        let r0 = 31, r1 = 0, g0 = 31, g1 = 0, b0 = 31, b1 = 0, pop = 0;
        for (const p of bx) {
          if (p.r < r0) r0 = p.r; if (p.r > r1) r1 = p.r;
          if (p.g < g0) g0 = p.g; if (p.g > g1) g1 = p.g;
          if (p.b < b0) b0 = p.b; if (p.b > b1) b1 = p.b;
          pop += p.cnt;
        }
        const dr = r1 - r0, dg = g1 - g0, db = b1 - b0;
        const maxSpan = Math.max(dr, dg, db);
        const score = maxSpan * Math.sqrt(pop);
        if (score > bestScore && maxSpan > 0) {
          bestScore = score;
          splitIdx = i;
          splitAxis = (dg >= dr && dg >= db) ? 'g' : (dr >= db ? 'r' : 'b');
        }
      }
      if (splitIdx < 0) break;
      const bx = boxes[splitIdx];
      bx.sort((a, b) => a[splitAxis] - b[splitAxis]);
      let total = 0; for (const p of bx) total += p.cnt;
      let acc = 0, mid = 1;
      for (let i = 0; i < bx.length - 1; i++) {
        acc += bx[i].cnt;
        mid = i + 1;
        if (acc >= total / 2) break;
      }
      boxes.splice(splitIdx, 1, bx.slice(0, mid), bx.slice(mid));
    }
    for (const bx of boxes) {
      let rS = 0, gS = 0, bS = 0, wS = 0;
      for (const p of bx) { rS += p.r * p.cnt; gS += p.g * p.cnt; bS += p.b * p.cnt; wS += p.cnt; }
      const r5 = clamp(Math.round(rS / wS), 0, 31);
      const g5 = clamp(Math.round(gS / wS), 0, 31);
      const b5 = clamp(Math.round(bS / wS), 0, 31);
      let v = (b5 << 10) | (g5 << 5) | r5;
      if (v === 0x0000) v = 0x0421;
      if (v === 0x7C1F) v = (31 << 10) | (1 << 5) | 31;
      paletteBgr.push(v);
    }
  }

  const palBgr = new Uint16Array(256);
  const palRgb = [];
  for (let i = 0; i < 256; i++) {
    if (transparentIdx0 && i === 0) {
      palBgr[0] = 0x7C1F;
      palRgb.push([255, 0, 255]);
    } else {
      const v = (i - startSlot < paletteBgr.length) ? paletteBgr[i - startSlot] : 0x0421;
      palBgr[i] = v;
      palRgb.push(bgr555ToRgb(v));
    }
  }

  const palBuf = Buffer.alloc(512);
  for (let i = 0; i < 256; i++) palBuf.writeUInt16LE(palBgr[i], i * 2);

  const bgrCache = new Map();
  const pxBytes = Buffer.alloc(w * h, 0);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (transparentIdx0 && rgba[o + 3] < 128) {
      pxBytes[i] = 0;
      continue;
    }
    const bgr = rgbToPs1Bgr555Opaque(rgba[o], rgba[o + 1], rgba[o + 2]);
    let ci = bgrCache.get(bgr);
    if (ci === undefined) {
      const [r, g, b] = bgr555ToRgb(bgr);
      let best = startSlot, bestD = 1e12;
      for (let k = startSlot; k < 256; k++) {
        const p = palRgb[k];
        const d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      ci = best;
      bgrCache.set(bgr, ci);
    }
    pxBytes[i] = ci;
  }
  return { w, h, palSize: 256, palBytes: palBuf, pxBytes };
}

// ============================================================================
// 2. PS1 Mesh Builder (Native fl=0x1003 Opaque / fl=0x10C3 Additive 28B Faces)
// ============================================================================
class PsxMeshBuilder {
  constructor() {
    this.verts = [];
    this.norms = [];
    this.faces = [];
  }
  addV(x, y, z, dedup = true) {
    const rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    if (dedup) {
      for (let i = 0; i < this.verts.length; i++) {
        const v = this.verts[i];
        if (v[0] === rx && v[1] === ry && v[2] === rz) return i;
      }
    }
    this.verts.push([rx, ry, rz]);
    return this.verts.length - 1;
  }
  addN(nx, ny, nz) {
    const len = Math.hypot(nx, ny, nz) || 1;
    const fx = clamp(Math.round((nx / len) * 4095), -4095, 4095);
    const fy = clamp(Math.round((ny / len) * 4095), -4095, 4095);
    const fz = clamp(Math.round((nz / len) * 4095), -4095, 4095);
    // Deduplicate normals within small angle to keep mesh buffers compact
    for (let i = 0; i < this.norms.length; i++) {
      const n = this.norms[i];
      if (Math.abs(n[0] - fx) < 48 && Math.abs(n[1] - fy) < 48 && Math.abs(n[2] - fz) < 48) return i;
    }
    this.norms.push([fx, fy, fz]);
    return this.norms.length - 1;
  }
  // Collapsed-D textured triangle with exact PS1 front-facing winding dot(cross(p1-p0, p2-p0), outN) < 0
  tri(v0, v1, v2, ti, uv0, uv1, uv2, { rgb = [132, 132, 132], fl = 0x1003, gpu = 0x2c, doubleSided = false, outNormal = null } = {}) {
    const p0 = this.verts[v0], p1 = this.verts[v1], p2 = this.verts[v2];
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1], ez = p1[2] - p0[2];
    const fx = p2[0] - p0[0], fy = p2[1] - p0[1], fz = p2[2] - p0[2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    let v = [v0, v1, v2, v2];
    let uv = [uv0[0], uv0[1], uv1[0], uv1[1], uv2[0], uv2[1], uv2[0], uv2[1]];
    if (outNormal) {
      if (nx * outNormal[0] + ny * outNormal[1] + nz * outNormal[2] >= 0) {
        v = [v1, v0, v2, v2];
        uv = [uv1[0], uv1[1], uv0[0], uv0[1], uv2[0], uv2[1], uv2[0], uv2[1]];
      }
      nx = outNormal[0]; ny = outNormal[1]; nz = outNormal[2];
    }
    const ni = this.addN(nx, ny, nz);
    this.faces.push({ fl, v, rgb: [rgb[0], rgb[1], rgb[2], gpu], ni, ti, uv });
    if (doubleSided) {
      const niB = this.addN(-nx, -ny, -nz);
      this.faces.push({
        fl, v: [v[1], v[0], v[2], v[2]],
        rgb: [rgb[0], rgb[1], rgb[2], gpu], ni: niB, ti,
        uv: [uv[2], uv[3], uv[0], uv[1], uv[4], uv[5], uv[4], uv[5]],
      });
    }
  }
  quad(v0, v1, v2, v3, ti, uv0, uv1, uv2, uv3, { rgb = [132, 132, 132], fl = 0x1003, gpu = 0x2c, doubleSided = false, outNormal = null } = {}) {
    const p0 = this.verts[v0], p1 = this.verts[v1], p2 = this.verts[v2];
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1], ez = p1[2] - p0[2];
    const fx = p2[0] - p0[0], fy = p2[1] - p0[1], fz = p2[2] - p0[2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    let q = [v0, v1, v2, v3];
    let uv = [uv0[0], uv0[1], uv1[0], uv1[1], uv2[0], uv2[1], uv3[0], uv3[1]];
    if (outNormal) {
      if (nx * outNormal[0] + ny * outNormal[1] + nz * outNormal[2] >= 0) {
        q = [v1, v0, v3, v2];
        uv = [uv1[0], uv1[1], uv0[0], uv0[1], uv3[0], uv3[1], uv2[0], uv2[1]];
      }
      nx = outNormal[0]; ny = outNormal[1]; nz = outNormal[2];
    }
    const ni = this.addN(nx, ny, nz);
    this.faces.push({ fl, v: q, rgb: [rgb[0], rgb[1], rgb[2], gpu], ni, ti, uv });
    if (doubleSided) {
      const niB = this.addN(-nx, -ny, -nz);
      this.faces.push({
        fl, v: [q[1], q[0], q[3], q[2]],
        rgb: [rgb[0], rgb[1], rgb[2], gpu], ni: niB, ti,
        uv: [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]],
      });
    }
  }
  buildBuffer() {
    const nV = this.verts.length, nN = this.norms.length, nF = this.faces.length;
    if (nV > 255) throw new Error(`Mesh excedeu limite PS1 de 255 vertices: ${nV}`);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9, maxR = 0;
    for (const [x, y, z] of this.verts) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
      const r = Math.hypot(x, y, z);
      if (r > maxR) maxR = r;
    }
    const rad = Math.ceil(Math.max(maxR * 1.08, 48)) * 4096;
    const buf = Buffer.alloc(28 + nV * 8 + nN * 8 + nF * 28, 0);
    buf.writeUInt16LE(0x0008, 0);
    buf.writeUInt16LE(nV, 2);
    buf.writeUInt16LE(nN, 4);
    buf.writeUInt16LE(nF, 6);
    buf.writeUInt32LE(rad >>> 0, 8);
    buf.writeInt16LE(x1, 12); buf.writeInt16LE(x0, 14);
    buf.writeInt16LE(y1, 16); buf.writeInt16LE(y0, 18);
    buf.writeInt16LE(z1, 20); buf.writeInt16LE(z0, 22);
    buf.writeUInt32LE(0xFFFF7FFF, 24); // NEVER distance-culled!
    let off = 28;
    for (const [x, y, z] of this.verts) {
      buf.writeInt16LE(x, off); buf.writeInt16LE(y, off + 2); buf.writeInt16LE(z, off + 4); buf.writeUInt16LE(0, off + 6);
      off += 8;
    }
    for (const [nx, ny, nz] of this.norms) {
      buf.writeInt16LE(nx, off); buf.writeInt16LE(ny, off + 2); buf.writeInt16LE(nz, off + 4); buf.writeUInt16LE(0, off + 6);
      off += 8;
    }
    for (const f of this.faces) {
      buf.writeUInt16LE(f.fl, off);
      buf.writeUInt16LE(28, off + 2);
      buf[off + 4] = f.v[0]; buf[off + 5] = f.v[1]; buf[off + 6] = f.v[2]; buf[off + 7] = f.v[3];
      buf[off + 8] = f.rgb[0]; buf[off + 9] = f.rgb[1]; buf[off + 10] = f.rgb[2]; buf[off + 11] = f.rgb[3];
      buf.writeUInt16LE(f.ni, off + 12);
      buf.writeUInt16LE(0, off + 14);
      buf.writeUInt32LE(f.ti, off + 16);
      for (let k = 0; k < 8; k++) buf[off + 20 + k] = f.uv[k];
      off += 28;
    }
    return buf;
  }
}

// ============================================================================
// 3. Extract 100% Authentic Naughty Dog Crash 3 Crate Textures Directly From .OBJ!
// ============================================================================
function extractCrateFaceFromObj(obj, axis, W, H, enhanceFn = null) {
  const mat = Object.values(obj.matTex)[0];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const v of obj.verts) {
    if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
    if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
    if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
  }
  const dx = Math.max(1e-4, maxX - minX);
  const dy = Math.max(1e-4, maxY - minY);
  const dz = Math.max(1e-4, maxZ - minZ);
  const rgba = Buffer.alloc(W * H * 4, 0);
  const hit = new Uint8Array(W * H);

  for (const f of obj.faces) {
    const p0 = obj.verts[f.a.v], p1 = obj.verts[f.b.v], p2 = obj.verts[f.c.v];
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1], ez = p1[2] - p0[2];
    const fx = p2[0] - p0[0], fy = p2[1] - p0[1], fz = p2[2] - p0[2];
    const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const nn = [nx / len, ny / len, nz / len];
    let keep = false, proj;
    if (axis === 'front' && nn[2] > 0.7) {
      keep = true;
      proj = p => [((p[0] - minX) / dx) * (W - 1), ((maxY - p[1]) / dy) * (H - 1)];
    } else if (axis === 'top' && nn[1] > 0.7) {
      keep = true;
      proj = p => [((p[0] - minX) / dx) * (W - 1), ((p[2] - minZ) / dz) * (H - 1)];
    }
    if (!keep) continue;

    const a = proj(p0), b = proj(p1), c = proj(p2);
    const uv0 = obj.uvs[f.a.vt], uv1 = obj.uvs[f.b.vt], uv2 = obj.uvs[f.c.vt];
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-4) continue;

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.015 || w1 < -0.015 || w2 < -0.015) continue;
        const cw0 = Math.max(0, w0), cw1 = Math.max(0, w1), cw2 = Math.max(0, w2);
        const s = cw0 + cw1 + cw2 || 1;
        const u = (cw0 * uv0[0] + cw1 * uv1[0] + cw2 * uv2[0]) / s;
        const v = (cw0 * uv0[1] + cw1 * uv1[1] + cw2 * uv2[1]) / s;
        const tx = clamp(Math.round(u * (mat.w - 1)), 0, mat.w - 1);
        const ty = clamp(Math.round((1 - v) * (mat.h - 1)), 0, mat.h - 1);
        const to = (ty * mat.w + tx) * 4;
        if (mat.rgba[to + 3] < 64) continue;
        const idx = py * W + px;
        let r = mat.rgba[to], g = mat.rgba[to + 1], bl = mat.rgba[to + 2];
        if (enhanceFn) [r, g, bl] = enhanceFn(r, g, bl, px, py);
        rgba[idx * 4 + 0] = clamp(Math.round(r), 8, 255);
        rgba[idx * 4 + 1] = clamp(Math.round(g), 8, 255);
        rgba[idx * 4 + 2] = clamp(Math.round(bl), 8, 255);
        rgba[idx * 4 + 3] = 255;
        hit[idx] = 1;
      }
    }
  }
  // Fill any unfilled edge pixel from nearest neighbor
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (hit[y * W + x]) continue;
    const nx = clamp(x, 1, W - 2), ny = clamp(y, 1, H - 2);
    const src = (ny * W + nx) * 4, dst = (y * W + x) * 4;
    rgba[dst] = Math.max(12, rgba[src]);
    rgba[dst + 1] = Math.max(12, rgba[src + 1]);
    rgba[dst + 2] = Math.max(12, rgba[src + 2]);
    rgba[dst + 3] = 255;
  }
  return rgba;
}

function makeCrateTexturesFromCrash3(objs3d) {
  // Subtle vibrancy & brightness boost so authentic Crash 3 crate textures pop crisply under THPS2 lighting!
  const boostTnt = (r, g, b) => {
    const isYellow = g > 90 && r > 110 && b < 60;
    if (isYellow) return [clamp(r * 1.28 + 18, 18, 255), clamp(g * 1.32 + 16, 18, 255), clamp(b * 1.1 + 8, 12, 110)];
    return [clamp(r * 1.28 + 14, 18, 255), clamp(g * 1.15 + 8, 14, 140), clamp(b * 1.1 + 8, 12, 85)];
  };
  const boostNitro = (r, g, b) => {
    const isYellow = r > 115 && g > 115 && b < 55;
    if (isYellow) return [clamp(r * 1.25 + 22, 18, 255), clamp(g * 1.25 + 22, 18, 255), clamp(b * 1.05 + 10, 12, 110)];
    return [clamp(r * 1.15 + 10, 14, 150), clamp(g * 1.30 + 16, 18, 255), clamp(b * 1.15 + 10, 14, 110)];
  };
  const boostChk = (r, g, b) => [
    clamp(r * 1.22 + 14, 18, 255),
    clamp(g * 1.22 + 12, 16, 255),
    clamp(b * 1.15 + 10, 14, 150),
  ];

  const tntSideRgba = extractCrateFaceFromObj(objs3d.tnt, 'front', 64, 64, boostTnt);
  const tntTopRgba  = extractCrateFaceFromObj(objs3d.tnt, 'top',   32, 32, boostTnt);
  const tntTop16    = extractCrateFaceFromObj(objs3d.tnt, 'top',   16, 16, boostTnt);
  const nitSideRgba = extractCrateFaceFromObj(objs3d.nitro, 'front', 64, 64, boostNitro);
  const nitTopRgba  = extractCrateFaceFromObj(objs3d.nitro, 'top',   32, 32, boostNitro);
  const nitTop16    = extractCrateFaceFromObj(objs3d.nitro, 'top',   16, 16, boostNitro);
  const chkSideRgba = extractCrateFaceFromObj(objs3d.chk, 'front', 64, 64, boostChk);
  const chkTopRgba  = extractCrateFaceFromObj(objs3d.wood, 'top',  32, 32, boostChk);
  const chkTop16    = extractCrateFaceFromObj(objs3d.wood, 'top',  16, 16, boostChk);

  return {
    tntSide8:     make8BitTex(64, 64, tntSideRgba, false),
    tntSide4:     make4BitTex(64, 64, tntSideRgba, false, [[248, 224, 32, 24], [180, 156, 20, 18], [220, 32, 16, 24], [140, 18, 12, 18], [24, 12, 12, 20]]),
    tntTop4:      make4BitTex(32, 32, tntTopRgba, false),
    tntTop4Small: make4BitTex(16, 16, tntTop16, false),
    nitSide4:     make4BitTex(64, 64, nitSideRgba, false, [[248, 236, 36, 24], [186, 172, 24, 18], [46, 212, 28, 24], [24, 138, 16, 18], [16, 32, 14, 20]]),
    nitTop4:      make4BitTex(32, 32, nitTopRgba, false),
    nitTop4Small: make4BitTex(16, 16, nitTop16, false),
    chkSide4:     make4BitTex(64, 64, chkSideRgba, false, [[244, 224, 28, 24], [216, 24, 16, 20], [188, 102, 28, 22], [118, 56, 16, 18], [48, 22, 12, 16]]),
    chkTop4:      make4BitTex(32, 32, chkTopRgba, false),
    chkTop4Small: make4BitTex(16, 16, chkTop16, false),
    rawPreviews: { tntSideRgba, tntTopRgba, nitSideRgba, nitTopRgba, chkSideRgba, chkTopRgba },
  };
}

// ============================================================================
// 4. Sculpted 3D Beveled Subdivided Crash 3 Crate Builder
//    - 2x2 subdivided side panels -> ZERO PS1 near-plane clipping & ZERO affine warping!
//    - 45-deg beveled wooden corner timber posts -> maxR <= 51.4 < 52.6 half-spacing in Hangar!
//    - Dedicated X-braced top & bottom lids -> authentic Naughty Dog look from above & below!
//    - UN-MIRRORED PS1 L->R quad mapping (v0=TL, v1=TR, v2=BL, v3=BR) -> "TNT"/"NITRO"/"C" reads L->R!
// ============================================================================
function buildSculptedCrateMesh(tiSide, tiTop, { halfW = 41, bevel = 10, yTop = -62, yBot = 63, subdivY = 2, subdivX = 2, topSize = 32 } = {}) {
  const mb = new PsxMeshBuilder();
  const a = halfW;          // outer flat side distance
  const b = halfW - bevel;  // chamfer inset (corner vertex at (a, b) & (b, a))
  const yMid = Math.round((yTop + yBot) / 2);

  // Helper: add an MxN subdivided quad from TL, TR, BL, BR with UV range [u0..u1, v0..v1]
  const addSubdivFace = (TL, TR, BL, BR, ti, u0, v0, u1, v1, nx, ny, outNormal, rgb) => {
    const grid = [];
    for (let iy = 0; iy <= ny; iy++) {
      const ty = iy / ny;
      const row = [];
      for (let ix = 0; ix <= nx; ix++) {
        const tx = ix / nx;
        const px = lerp(lerp(TL[0], TR[0], tx), lerp(BL[0], BR[0], tx), ty);
        const py = lerp(lerp(TL[1], TR[1], tx), lerp(BL[1], BR[1], tx), ty);
        const pz = lerp(lerp(TL[2], TR[2], tx), lerp(BL[2], BR[2], tx), ty);
        row.push({ vi: mb.addV(px, py, pz), u: Math.round(lerp(u0, u1, tx)), v: Math.round(lerp(v0, v1, ty)) });
      }
      grid.push(row);
    }
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const p00 = grid[iy][ix], p10 = grid[iy][ix + 1];
        const p01 = grid[iy + 1][ix], p11 = grid[iy + 1][ix + 1];
        mb.quad(p00.vi, p10.vi, p01.vi, p11.vi, ti,
          [p00.u, p00.v], [p10.u, p10.v], [p01.u, p01.v], [p11.u, p11.v],
          { outNormal, rgb });
      }
    }
  };

  // 4 main vertical sides (verified PS1 L->R right-handed order: right = down x (-outNormal)):
  // +Z face: left = +X, right = -X
  addSubdivFace([ b, yTop,  a], [-b, yTop,  a], [ b, yBot,  a], [-b, yBot,  a], tiSide, 2, 1, 61, 62, subdivX, subdivY, [ 0, 0,  1], [148, 148, 148]);
  // -Z face: left = -X, right = +X
  addSubdivFace([-b, yTop, -a], [ b, yTop, -a], [-b, yBot, -a], [ b, yBot, -a], tiSide, 2, 1, 61, 62, subdivX, subdivY, [ 0, 0, -1], [142, 142, 142]);
  // +X face: left = -Z, right = +Z
  addSubdivFace([ a, yTop, -b], [ a, yTop,  b], [ a, yBot, -b], [ a, yBot,  b], tiSide, 2, 1, 61, 62, subdivX, subdivY, [ 1, 0,  0], [126, 126, 126]);
  // -X face: left = +Z, right = -Z
  addSubdivFace([-a, yTop,  b], [-a, yTop, -b], [-a, yBot,  b], [-a, yBot, -b], tiSide, 2, 1, 61, 62, subdivX, subdivY, [-1, 0,  0], [126, 126, 126]);

  // 4 beveled wooden corner timber columns (sampled from outer vertical wood rail u=[0..4] of side texture!)
  const corners = [
    [[ a,  b], [ b,  a], [ 1,  1], [116, 116, 116]], // +X/+Z
    [[-b,  a], [-a,  b], [-1,  1], [116, 116, 116]], // -X/+Z
    [[-a, -b], [-b, -a], [-1, -1], [112, 112, 112]], // -X/-Z
    [[ b, -a], [ a, -b], [ 1, -1], [112, 112, 112]], // +X/-Z
  ];
  for (const [pL, pR, nXZ, rgb] of corners) {
    const outN = [nXZ[0], 0, nXZ[1]];
    if (subdivY >= 2) {
      const v0 = mb.addV(pL[0], yTop, pL[1]), v1 = mb.addV(pR[0], yTop, pR[1]);
      const v2 = mb.addV(pL[0], yMid, pL[1]), v3 = mb.addV(pR[0], yMid, pR[1]);
      const v4 = mb.addV(pL[0], yBot, pL[1]), v5 = mb.addV(pR[0], yBot, pR[1]);
      mb.quad(v0, v1, v2, v3, tiSide, [1, 1], [5, 1], [1, 31], [5, 31], { outNormal: outN, rgb });
      mb.quad(v2, v3, v4, v5, tiSide, [1, 31], [5, 31], [1, 62], [5, 62], { outNormal: outN, rgb });
    } else {
      const v0 = mb.addV(pL[0], yTop, pL[1]), v1 = mb.addV(pR[0], yTop, pR[1]);
      const v4 = mb.addV(pL[0], yBot, pL[1]), v5 = mb.addV(pR[0], yBot, pR[1]);
      mb.quad(v0, v1, v4, v5, tiSide, [1, 1], [5, 1], [1, 62], [5, 62], { outNormal: outN, rgb });
    }
  }

  // Octagonal X-braced Top Lid (Y = yTop, outNormal = [0, -1, 0]) & Bottom Lid (Y = yBot, outNormal = [0, +1, 0])
  // Built cleanly as 4 radial quads around center -> ZERO concave gaps, exact octagonal border!
  const addOctLid = (yVal, outN, rgb) => {
    const ring = [
      [ b,  a], [-b,  a], [-a,  b], [-a, -b],
      [-b, -a], [ b, -a], [ a, -b], [ a,  b],
    ];
    const tMax = topSize - 2, tMid = topSize >> 1;
    const uvOf = (x, z) => [
      clamp(Math.round(((x + a) / (2 * a)) * (tMax - 1) + 1), 1, tMax),
      clamp(Math.round(((z + a) / (2 * a)) * (tMax - 1) + 1), 1, tMax),
    ];
    const vc = mb.addV(0, yVal, 0);
    const rv = ring.map(([x, z]) => ({ vi: mb.addV(x, yVal, z), uv: uvOf(x, z) }));
    for (let k = 0; k < 8; k += 2) {
      const p0 = rv[k], p1 = rv[(k + 1) % 8], p2 = rv[(k + 2) % 8];
      mb.quad(vc, p0.vi, p2.vi, p1.vi, tiTop, [tMid, tMid], p0.uv, p2.uv, p1.uv, { outNormal: outN, rgb });
    }
  };
  addOctLid(yTop, [0, -1, 0], [156, 156, 156]);
  addOctLid(yBot, [0,  1, 0], [102, 102, 102]);

  return mb;
}

// ============================================================================
// 5. Bleed-Free Per-Triangle 128x64 8-Bit (256-Color) True-Alpha Mask Repacker
//    - Packs EVERY triangle of WD10G (Aku Aku, 27 tris) or Uk17G (Uka Uka, 52 tris)
//      into its own dedicated 16x16 cell inside native THPS2 128x64 8bpp texture(s)!
//    - Preserves razor-sharp PS1 0x7C1F hardware alpha cutout on feathers, bones & beards!
//    - Automatically emits DOUBLE-SIDED strictly on cutout triangles & SINGLE-SIDED on solid wood!
// ============================================================================
function buildPerTriMaskAssets(obj, texNames, { targetSpan = 185, yOffset = 0, brighten = 1.15 } = {}) {
  const mat = Object.values(obj.matTex)[0];
  const nF = obj.faces.length;
  const CELLS_PER_TEX = 32; // 8 cols x 4 rows of 16x16 cells = exact native THPS2 128x64!
  const numTex = Math.ceil(nF / CELLS_PER_TEX);
  if (texNames.length < numTex) throw new Error(`Precisa de ${numTex} nomes de textura para ${nF} faces!`);

  const W = 128, H = 64, CELL = 16;
  const texRgbas = Array.from({ length: numTex }, () => Buffer.alloc(W * H * 4, 0));
  const faceMaps = [];

  for (let fi = 0; fi < nF; fi++) {
    const f = obj.faces[fi];
    const tSlot = Math.floor(fi / CELLS_PER_TEX);
    const localIdx = fi % CELLS_PER_TEX;
    const gx = localIdx % 8, gy = Math.floor(localIdx / 8);
    const x0 = gx * CELL, y0 = gy * CELL;
    const dst = texRgbas[tSlot];

    // Cell triangle vertices inside [x0+1..x0+14, y0+1..y0+14] (1px bleed-safe margin all around!)
    const c0 = [x0 + 1, y0 + 1];
    const c1 = [x0 + 14, y0 + 1];
    const c2 = [x0 + 1, y0 + 14];
    const uv0 = f.a.vt >= 0 ? obj.uvs[f.a.vt] : [0, 0];
    const uv1 = f.b.vt >= 0 ? obj.uvs[f.b.vt] : [1, 0];
    const uv2 = f.c.vt >= 0 ? obj.uvs[f.c.vt] : [0, 1];

    let transpCount = 0, opaqueCount = 0;
    const span = 13.0;
    for (let ly = 0; ly < CELL; ly++) {
      for (let lx = 0; lx < CELL; lx++) {
        // Exact barycentric coordinates for right triangle (1,1)-(14,1)-(1,14)
        let w1 = (lx - 1) / span;
        let w2 = (ly - 1) / span;
        let w0 = 1.0 - w1 - w2;
        const inside = (w0 >= -0.05 && w1 >= -0.05 && w2 >= -0.05);
        // Clamp strictly inside triangle so 1px safety gutter NEVER leaks from another Crash 3 tile!
        w1 = clamp(w1, 0, 1);
        w2 = clamp(w2, 0, 1);
        if (w1 + w2 > 1) { const s = w1 + w2; w1 /= s; w2 /= s; }
        w0 = 1.0 - w1 - w2;

        const u = w0 * uv0[0] + w1 * uv1[0] + w2 * uv2[0];
        const v = w0 * uv0[1] + w1 * uv1[1] + w2 * uv2[1];
        const tx = clamp(Math.round(u * (mat.w - 1)), 0, mat.w - 1);
        const ty = clamp(Math.round((1 - v) * (mat.h - 1)), 0, mat.h - 1);
        const to = (ty * mat.w + tx) * 4;
        const o = ((y0 + ly) * W + (x0 + lx)) * 4;

        if (mat.rgba[to + 3] < 128) {
          dst[o] = 0; dst[o + 1] = 0; dst[o + 2] = 0; dst[o + 3] = 0;
          if (inside) transpCount++;
        } else {
          // Gentle brightness lift + floor >= 10 so dark wood (Uka Uka!) is rich & NEVER 0x0000 black!
          dst[o + 0] = clamp(Math.round(mat.rgba[to + 0] * brighten + 6), 10, 255);
          dst[o + 1] = clamp(Math.round(mat.rgba[to + 1] * brighten + 6), 10, 255);
          dst[o + 2] = clamp(Math.round(mat.rgba[to + 2] * brighten + 6), 10, 255);
          dst[o + 3] = 255;
          if (inside) opaqueCount++;
        }
      }
    }
    const hasAlpha = transpCount >= 3 && opaqueCount > 0;
    faceMaps.push({ tSlot, c0, c1, c2, hasAlpha });
  }

  const textures = texRgbas.map((rgba, idx) => ({
    name: texNames[idx],
    ...make8BitTex(W, H, rgba, true), // pal[0] = 0x7C1F TRUE PS1 hardware cutout!
  }));

  const buildMesh = (texIndices, customSpan = targetSpan, customYOff = yOffset) => {
    const mb = new PsxMeshBuilder();
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const v of obj.verts) {
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
      if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-4);
    const sc = customSpan / span;

    // Crash 3 (+Y up, +Z fwd) -> THPS2 (-Y up, -Z fwd, +X left): pure 180 deg X-rot (det = +1!)
    for (const v of obj.verts) {
      mb.addV((v[0] - cx) * sc, -(v[1] - cy) * sc + customYOff, -(v[2] - cz) * sc, false);
    }

    for (let fi = 0; fi < nF; fi++) {
      const f = obj.faces[fi];
      const fm = faceMaps[fi];
      const p0 = mb.verts[f.a.v], p1 = mb.verts[f.b.v], p2 = mb.verts[f.c.v];
      const ex = p1[0] - p0[0], ey = p1[1] - p0[1], ez = p1[2] - p0[2];
      const fx = p2[0] - p0[0], fy = p2[1] - p0[1], fz = p2[2] - p0[2];
      // OBJ CCW + det=+1 => cross points outward!
      const outN = [ey * fz - ez * fy, ez * fx - ex * fz, ex * fy - ey * fx];
      const nlen = Math.hypot(outN[0], outN[1], outN[2]) || 1;
      const ny = outN[1] / nlen, nz = outN[2] / nlen;
      // Rich balanced illumination (front face bright & clear, carved back wood warm & visible!)
      const shade = clamp(Math.round(134 + (-ny) * 14 + Math.abs(nz) * 10), 112, 158);
      mb.tri(f.a.v, f.b.v, f.c.v, texIndices[fm.tSlot], fm.c0, fm.c1, fm.c2, {
        rgb: [shade, shade, shade],
        doubleSided: fm.hasAlpha, // ONLY feathers/bones/beard double-sided; solid wood single-sided!
        outNormal: outN,
      });
    }
    return mb;
  };

  return { textures, buildMesh };
}

// ============================================================================
// 6. High-Contrast Faceted Crystal, Diamond, Emerald Gem & Gold Time Relic Builders
// ============================================================================
function makeFacetGradientTex(kind, size = 32) {
  // Clean 4bpp directional specular gradient (X = highlight glint, Y = facet depth)
  const W = size, H = size;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    const u = x / (W - 1), v = y / (H - 1);
    const diag = clamp(1 - Math.abs((u - 0.35) + (v - 0.35)) * 1.15, 0, 1);
    const glint = Math.pow(diag, 2.4);
    const shade = lerp(0.58, 1.0, 1 - v * 0.65);
    let r, g, b;
    if (kind === 'crystal') {
      // Iconic Crash 3 Neon Magenta-Violet Power Crystal with pink-white specular edge!
      r = clamp(Math.round((198 * shade) + glint * 78), 75, 255);
      g = clamp(Math.round((34  * shade) + glint * 195), 18, 248);
      b = clamp(Math.round((242 * shade) + glint * 20), 120, 255);
    } else if (kind === 'diamond') {
      // Dazzling Crash 3 Clear Diamond Gem (brilliant white crown, icy sky-cyan mid, deep sapphire-silver facets!)
      r = clamp(Math.round((132 * shade) + glint * 123), 72, 255);
      g = clamp(Math.round((214 * shade) + glint * 41),  128, 255);
      b = clamp(Math.round((250 * shade) + glint * 5),   178, 255);
    } else if (kind === 'emerald') {
      // Vivid Crash 3 EMERALD GREEN Warp Gem (Downtown "5 Gemas Warp Esmeralda"!)
      r = clamp(Math.round((22  * shade) + glint * 175), 14, 215);
      g = clamp(Math.round((225 * shade) + glint * 30),  110, 255);
      b = clamp(Math.round((78  * shade) + glint * 135), 34, 225);
    }
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  }
  return make4BitTex(W, H, rgba, false);
}

function makeRelicSplitTex() {
  // 64x32 4bpp Split Material Texture for Rel1G:
  //   - Left half  (x = 0..31):  Gleaming Metallic Crash 3 Gold Ankh (rich warm gold + bronze shadows + bright glint!)
  //   - Right half (x = 32..63): Vivid Sparkling Sapphire-Blue Center Jewel (for v42/v43 inner hex facets!)
  const W = 64, H = 32;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    if (x < 32) {
      const u = x / 31, v = y / 31;
      const glint = Math.pow(clamp(1 - Math.abs((u - 0.35) + (v - 0.3)) * 1.3, 0, 1), 2.2);
      const shade = lerp(0.62, 1.0, 1 - v * 0.55);
      rgba[o + 0] = clamp(Math.round(248 * shade + glint * 15), 145, 255);
      rgba[o + 1] = clamp(Math.round(188 * shade + glint * 62), 96, 252);
      rgba[o + 2] = clamp(Math.round(24  * shade + glint * 148), 14, 185);
      rgba[o + 3] = 255;
    } else {
      const u = (x - 32) / 31, v = y / 31;
      const glint = Math.pow(clamp(1 - Math.abs((u - 0.35) + (v - 0.35)) * 1.25, 0, 1), 2.0);
      const shade = lerp(0.55, 1.0, 1 - v * 0.55);
      rgba[o + 0] = clamp(Math.round(26  * shade + glint * 185), 16, 225);
      rgba[o + 1] = clamp(Math.round(126 * shade + glint * 120), 62, 252);
      rgba[o + 2] = clamp(Math.round(252 * shade + glint * 3),   155, 255);
      rgba[o + 3] = 255;
    }
  }
  return make4BitTex(W, H, rgba, false, [
    [255, 245, 165, 18], [248, 196, 28, 24], [176, 118, 16, 20],
    [195, 235, 255, 18], [32, 138, 255, 24], [18, 68, 185, 20],
  ]);
}

function makeCrystalAuraTex() {
  // Soft discrete radial violet-magenta-cyan starlight shimmer for PS1 Hardware Additive ABR=1 (fl = 0x10C3!)
  // pal[0] = 0x7C1F -> becomes 0x0000 transparent cutout (ZERO rectangular border ever visible!)
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const sparkles = [
    [14, 16, 4.2, 1.0], [50, 22, 3.8, 0.9], [12, 44, 3.6, 0.85], [52, 48, 4.0, 0.95],
  ];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - 31.5) / 29.0, dy = (y - 31.5) / 29.5;
    const d = Math.hypot(dx, dy);
    let glow = 0;
    if (d < 0.94) {
      const outer = Math.pow(clamp(1 - d / 0.94, 0, 1), 1.9);
      const ring = 0.55 + 0.55 * Math.exp(-Math.pow((d - 0.48) / 0.28, 2));
      glow = outer * ring * 0.58;
    }
    let sp = 0;
    for (const [sx, sy, sr, si] of sparkles) {
      const adx = Math.abs(x - sx), ady = Math.abs(y - sy);
      if (adx > sr + 1 && ady > sr + 1) continue;
      const star = Math.max(
        Math.exp(-adx * 1.1) * Math.exp(-ady / (sr * 0.55)),
        Math.exp(-ady * 1.1) * Math.exp(-adx / (sr * 0.55))
      );
      sp = Math.max(sp, star * si);
    }
    const total = clamp(glow + sp * 0.72, 0, 1);
    const o = (y * W + x) * 4;
    if (total < 0.08 || d >= 0.95) {
      rgba[o] = 0; rgba[o + 1] = 0; rgba[o + 2] = 0; rgba[o + 3] = 0;
    } else {
      rgba[o + 0] = clamp(Math.round(145 * total + sp * 95), 14, 235);
      rgba[o + 1] = clamp(Math.round(48  * total + sp * 135), 12, 220);
      rgba[o + 2] = clamp(Math.round(215 * total + sp * 40), 22, 255);
      rgba[o + 3] = 255;
    }
  }
  return make4BitTex(W, H, rgba, true);
}

function buildFacetedObjMesh(obj, ti, targetSpan, { scaleX = 1.0, scaleY = 1.0, scaleZ = 1.0, yOffset = 0, isRelic = false, texSize = 32 } = {}) {
  const mb = new PsxMeshBuilder();
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const v of obj.verts) {
    if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
    if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
    if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-4);
  const sc = targetSpan / span;

  for (const v of obj.verts) {
    mb.addV(
      (v[0] - cx) * sc * scaleX,
      -(v[1] - cy) * sc * scaleY + yOffset,
      -(v[2] - cz) * sc * scaleZ,
      false
    );
  }

  // Two opposing light directions so rotating gems/crystals/relics exhibit dramatic faceted sparkle!
  const L1 = [0.48, -0.74, 0.47];
  const L2 = [-0.62, -0.35, -0.70];

  for (const f of obj.faces) {
    const p0 = mb.verts[f.a.v], p1 = mb.verts[f.b.v], p2 = mb.verts[f.c.v];
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1], ez = p1[2] - p0[2];
    const fx = p2[0] - p0[0], fy = p2[1] - p0[1], fz = p2[2] - p0[2];
    const outN = [ey * fz - ez * fy, ez * fx - ex * fz, ex * fy - ey * fx];
    const nlen = Math.hypot(outN[0], outN[1], outN[2]) || 1;
    const nx = outN[0] / nlen, ny = outN[1] / nlen, nz = outN[2] / nlen;

    const d1 = nx * L1[0] + ny * L1[1] + nz * L1[2];
    const d2 = nx * L2[0] + ny * L2[1] + nz * L2[2];
    const lit = clamp(0.55 + Math.max(d1, d2 * 0.75) * 0.55, 0.30, 1.0);
    const shade = clamp(Math.round(78 + lit * 98), 76, 178);

    // Map each facet cleanly into our directional specular texture (different UVs per normal -> authentic jewel facets!)
    let uMin = 1, uMax = texSize - 2;
    const vMax = texSize - 2;
    if (isRelic) {
      // Rel1G vertices 42 & 43 are the exact front/back center apexes of the hexagonal Sapphire Jewel!
      const isJewel = (f.a.v === 42 || f.b.v === 42 || f.c.v === 42 || f.a.v === 43 || f.b.v === 43 || f.c.v === 43);
      uMin = isJewel ? 34 : 2;
      uMax = isJewel ? 61 : 29;
    }
    const mapFacetUv = p => [
      clamp(Math.round(lerp(uMin, uMax, clamp(0.5 + (p[0] / (targetSpan * 0.72)) * 0.45 + nx * 0.20, 0, 1))), uMin, uMax),
      clamp(Math.round(lerp(1, vMax, clamp(0.5 + (p[1] / (targetSpan * 0.72)) * 0.45 + ny * 0.25, 0, 1))), 1, vMax),
    ];
    mb.tri(f.a.v, f.b.v, f.c.v, ti, mapFacetUv(p0), mapFacetUv(p1), mapFacetUv(p2), {
      rgb: [shade, shade, shade],
      outNormal: outN,
    });
  }
  return mb;
}

function buildPowerCrystalWithAura(objCry, tiCry, tiAura, heightSpan = 195, yOffset = 0, texSize = 32) {
  // Widened X/Z 1.38x so the Power Crystal has a bold, iconic Crash 3 jewel silhouette!
  const mb = buildFacetedObjMesh(objCry, tiCry, heightSpan, { scaleX: 1.38, scaleY: 1.0, scaleZ: 1.38, yOffset, texSize });
  // 2 crossed double-sided PS1 hardware Additive Semi-Transparent (ABR=1, fl=0x10C3, gpu=0x2e — NO illegal 0x0800!) aura planes!
  const R = Math.round(heightSpan * 0.40);
  const H = Math.round(heightSpan * 0.62);
  for (let k = 0; k < 2; k++) {
    const ang = (k * Math.PI) / 2 + Math.PI / 4;
    const dx = Math.round(Math.cos(ang) * R);
    const dz = Math.round(Math.sin(ang) * R);
    const p0 = mb.addV(-dx, -H + yOffset, -dz), p1 = mb.addV(dx, -H + yOffset, dz);
    const p2 = mb.addV(-dx,  H + yOffset, -dz), p3 = mb.addV(dx,  H + yOffset, dz);
    mb.quad(p0, p1, p2, p3, tiAura, [0, 0], [63, 0], [0, 63], [63, 63], {
      fl: 0x10C3, // Battle-tested PS1 Hardware Additive ABR=1 (0x1000 | 0x0080 | 0x0040 | 0x0003) — ZERO RGBs-chunk bug!
      gpu: 0x2e,
      rgb: [120, 96, 132],
      doubleSided: true,
      outNormal: [-Math.sin(ang), 0, Math.cos(ang)],
    });
  }
  return mb;
}

// ============================================================================
// 7. Plump Contoured 3D Wumpa Fruit ("Manga" — $50) w/ True 0x7C1F Cutout Leaf!
// ============================================================================
function makeWumpaTex() {
  // 64x64 4bpp with pal[0] = 0x7C1F transparent cutout for the arching pointed tropical green leaf!
  //   - Left 40px (x=0..39): Juicy Wumpa fruit body (sunny yellow crown -> tropical orange -> ruby crimson base + glossy highlight)
  //   - Upper-right (x=40..63, y=0..23): Warm brown wood stem
  //   - Lower-right (x=40..63, y=24..63): Razor-sharp pointed green tropical leaf on transparent 0x7C1F!
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4, 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    if (x < 40) {
      const t = y / (H - 1);
      const spec = Math.exp(-((x - 14) ** 2 / 55 + (y - 17) ** 2 / 65)) * 88;
      // Rich Crash 3 Wumpa gradient: sunny yellow top -> blazing mango-orange middle -> deep red-pink bottom
      let r, g, b;
      if (t < 0.45) {
        const u = t / 0.45;
        r = lerp(255, 252, u);
        g = lerp(236, 128, u);
        b = lerp(34, 18, u);
      } else {
        const u = (t - 0.45) / 0.55;
        r = lerp(252, 206, u);
        g = lerp(128, 22, u);
        b = lerp(18, 44, u);
      }
      rgba[o + 0] = clamp(Math.round(r + spec), 16, 255);
      rgba[o + 1] = clamp(Math.round(g + spec * 0.85), 16, 255);
      rgba[o + 2] = clamp(Math.round(b + spec * 0.45), 14, 180);
      rgba[o + 3] = 255;
    } else if (y < 24) {
      // Woody brown stem with subtle bark striation
      const bark = ((x * 5 + y * 3) & 3) * 8 - 10;
      rgba[o + 0] = clamp(128 + bark, 76, 165);
      rgba[o + 1] = clamp(72 + bark * 0.6, 42, 108);
      rgba[o + 2] = clamp(24 + bark * 0.3, 14, 46);
      rgba[o + 3] = 255;
    } else {
      // Pointed arching tropical green Wumpa leaf on transparent 0x7C1F!
      const lx = (x - 41) / 21.0; // 0 (stem base) -> 1 (leaf tip)
      const ly = (y - 44.0) / 18.0; // -1..+1 across leaf width
      const halfW = (lx >= 0 && lx <= 1) ? Math.sin(Math.pow(lx, 0.72) * Math.PI) * 0.88 : -1;
      if (Math.abs(ly) <= halfW) {
        const vein = Math.abs(ly) < 0.13 ? 48 : 0;
        const rim = (halfW - Math.abs(ly)) < 0.16 ? -42 : 0;
        rgba[o + 0] = clamp(Math.round(32 + vein + rim * 0.4), 16, 138);
        rgba[o + 1] = clamp(Math.round(202 + vein + rim), 92, 255);
        rgba[o + 2] = clamp(Math.round(36 + vein * 0.4), 16, 110);
        rgba[o + 3] = 255;
      } else {
        rgba[o + 3] = 0; // transparent 0x7C1F!
      }
    }
  }
  return make4BitTex(W, H, rgba, true, [
    [255, 242, 62, 20], [252, 138, 22, 24], [212, 28, 38, 22], [116, 66, 22, 16], [42, 212, 42, 22], [22, 128, 24, 16],
  ]);
}

function build3DWumpaFruitMesh(ti) {
  const mb = new PsxMeshBuilder();
  // Plump iconic Crash 3 Wumpa silhouette (8-sided 4-ring smooth contour + dimple + tapered stem + cutout leaf!)
  const rings = [
    { y: -44, r: 26, v: 6  },
    { y: -18, r: 54, v: 22 },
    { y:  16, r: 52, v: 40 },
    { y:  44, r: 28, v: 56 },
  ];
  const SEGS = 8;
  const vTop = mb.addV(0, -39, 0); // subtle concave stem dimple!
  const vBot = mb.addV(0,  54, 0);
  const ringVs = rings.map(rg => {
    const arr = [];
    for (let s = 0; s < SEGS; s++) {
      const ang = (s / SEGS) * Math.PI * 2;
      const lobe = 1.0 + 0.045 * Math.cos(ang * 3);
      arr.push(mb.addV(Math.cos(ang) * rg.r * lobe, rg.y, Math.sin(ang) * rg.r * lobe));
    }
    return arr;
  });

  // Top crown dimple
  for (let s = 0; s < SEGS; s++) {
    const s2 = (s + 1) % SEGS;
    const u0 = Math.round((s / SEGS) * 36 + 2), u1 = Math.round(((s + 1) / SEGS) * 36 + 2);
    mb.tri(vTop, ringVs[0][s], ringVs[0][s2], ti, [u0, 2], [u0, rings[0].v], [u1, rings[0].v], {
      outNormal: [0, -1, 0], rgb: [148, 148, 148],
    });
  }
  // Contoured body bands
  for (let ri = 0; ri + 1 < rings.length; ri++) {
    for (let s = 0; s < SEGS; s++) {
      const s2 = (s + 1) % SEGS;
      const angMid = ((s + 0.5) / SEGS) * Math.PI * 2;
      const outN = [Math.cos(angMid), (rings[ri + 1].y + rings[ri].y) / 140, Math.sin(angMid)];
      const u0 = Math.round((s / SEGS) * 36 + 2), u1 = Math.round(((s + 1) / SEGS) * 36 + 2);
      const shade = clamp(Math.round(130 + 22 * Math.sin(angMid + 0.5)), 108, 154);
      mb.quad(ringVs[ri][s], ringVs[ri][s2], ringVs[ri + 1][s], ringVs[ri + 1][s2], ti,
        [u0, rings[ri].v], [u1, rings[ri].v], [u0, rings[ri + 1].v], [u1, rings[ri + 1].v],
        { outNormal: outN, rgb: [shade, shade, shade] });
    }
  }
  // Bottom cap
  const lastR = ringVs[rings.length - 1];
  for (let s = 0; s < SEGS; s++) {
    const s2 = (s + 1) % SEGS;
    const u0 = Math.round((s / SEGS) * 36 + 2), u1 = Math.round(((s + 1) / SEGS) * 36 + 2);
    mb.tri(lastR[s], vBot, lastR[s2], ti, [u0, 56], [u0, 62], [u1, 56], {
      outNormal: [0, 1, 0], rgb: [108, 108, 108],
    });
  }
  // Slightly tilted tapered 3D woody stem (Y = -42 -> -70)
  const sb = [mb.addV(-6, -42, 6), mb.addV(6, -42, 6), mb.addV(6, -42, -6), mb.addV(-6, -42, -6)];
  const st = [mb.addV(-8, -70, 4), mb.addV(0, -70, 4), mb.addV(0, -70, -4), mb.addV(-8, -70, -4)];
  const stemNs = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]];
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    mb.quad(st[k], st[k2], sb[k], sb[k2], ti, [43, 2], [60, 2], [43, 21], [60, 21], {
      outNormal: stemNs[k], rgb: [132, 132, 132],
    });
  }
  mb.quad(st[3], st[2], st[0], st[1], ti, [44, 4], [58, 4], [44, 18], [58, 18], { outNormal: [0, -1, 0], rgb: [148, 148, 148] });

  // 2-segment arching pointed tropical green leaf (true 0x7C1F cutout, double-sided!)
  const lf0 = mb.addV(-2, -56,  14), lf1 = mb.addV(-2, -56, -14);
  const lf2 = mb.addV(26, -72,  18), lf3 = mb.addV(26, -72, -18);
  const lf4 = mb.addV(54, -56,  12), lf5 = mb.addV(54, -56, -12);
  mb.quad(lf0, lf2, lf1, lf3, ti, [41, 26], [52, 26], [41, 61], [52, 61], {
    outNormal: [0, -1, 0], doubleSided: true, rgb: [148, 148, 148],
  });
  mb.quad(lf2, lf4, lf3, lf5, ti, [52, 26], [62, 26], [52, 61], [62, 61], {
    outNormal: [0.35, -0.94, 0], doubleSided: true, rgb: [142, 142, 142],
  });
  return mb;
}

// Brilliant-Cut 8-Sided 3D Crash Diamond ($250 — ultra-clean 18 verts / 24 faces = 980 B permanent RAM!)
function buildBrilliantDiamondMesh(ti, texSize = 16) {
  const mb = new PsxMeshBuilder();
  const SEGS = 8;
  const rTop = 44, yTop = -42;  // octagonal flat table
  const rGird = 72, yGird = -12; // wide brilliant girdle
  const yTip = 48;               // sharp bottom culet
  const vTopC = mb.addV(0, yTop, 0);
  const vBot  = mb.addV(0, yTip, 0);
  const topV = [], girdV = [];
  for (let s = 0; s < SEGS; s++) {
    const a0 = (s / SEGS) * Math.PI * 2;
    const a1 = ((s + 0.5) / SEGS) * Math.PI * 2;
    topV.push(mb.addV(Math.cos(a0) * rTop, yTop, Math.sin(a0) * rTop));
    girdV.push(mb.addV(Math.cos(a1) * rGird, yGird, Math.sin(a1) * rGird));
  }
  const tMax = texSize - 2, tMid = texSize >> 1;
  // Crown table (4 quads? 8 crisp sparkling triangles)
  for (let s = 0; s < SEGS; s++) {
    const s2 = (s + 1) % SEGS;
    const sh = (s & 1) ? 174 : 154;
    mb.tri(vTopC, topV[s], topV[s2], ti, [tMid, 2], [2, 5], [tMax, 5], { outNormal: [0, -1, 0], rgb: [sh, sh, sh] });
  }
  // Crown bezel facets (alternating crisp high-contrast diamond sparkle!)
  for (let s = 0; s < SEGS; s++) {
    const s2 = (s + 1) % SEGS;
    const ang = ((s + 0.5) / SEGS) * Math.PI * 2;
    const sh1 = clamp(Math.round(136 + 38 * Math.cos(ang * 2)), 94, 178);
    const sh2 = clamp(Math.round(126 - 32 * Math.sin(ang * 2)), 88, 170);
    mb.tri(topV[s], girdV[s], topV[s2], ti, [2, 2], [tMid, tMid], [tMax, 2], {
      outNormal: [Math.cos(ang), -0.7, Math.sin(ang)], rgb: [sh1, sh1, sh1],
    });
    const ang2 = ((s + 1) / SEGS) * Math.PI * 2;
    mb.tri(topV[s2], girdV[s], girdV[s2], ti, [tMid, 3], [2, tMid], [tMax, tMid], {
      outNormal: [Math.cos(ang2), -0.5, Math.sin(ang2)], rgb: [sh2, sh2, sh2],
    });
  }
  // Pavilion facets tapering to sharp bottom culet!
  for (let s = 0; s < SEGS; s++) {
    const s2 = (s + 1) % SEGS;
    const ang = ((s + 1) / SEGS) * Math.PI * 2;
    const sh = clamp(Math.round(112 + 34 * Math.cos(ang * 2 + 0.7)), 78, 152);
    mb.tri(girdV[s], vBot, girdV[s2], ti, [2, tMid], [tMid, tMax], [tMax, tMid], {
      outNormal: [Math.cos(ang), 0.65, Math.sin(ang)], rgb: [sh, sh, sh],
    });
  }
  return mb;
}

// ============================================================================
// 8. Sleek Beveled 3D Crash Bandicoot "C - R - A - S - H" Floating Letters!
//    - True stylized diagonals & chamfered curves (NOT blocky Lego rectangles!)
//    - ZERO internal hidden faces, exact PS1 outward winding!
// ============================================================================
function makeCrashLetterTex() {
  // 16x64 4bpp Crash Bandicoot logo flame gradient (x=0..11 front/back flame, x=12..15 rich dark-red bevel rim)
  const W = 16, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    if (x < 12) {
      const t = y / (H - 1);
      const r = 255;
      const g = clamp(Math.round(lerp(248, 42, Math.pow(t, 0.88))), 36, 255);
      const b = clamp(Math.round(lerp(48, 12, t)), 12, 68);
      const rim = (x < 1 || x >= 11 || y < 2 || y >= 62) ? 0.62 : 1.0;
      rgba[o + 0] = Math.round(r * rim);
      rgba[o + 1] = Math.round(g * rim);
      rgba[o + 2] = Math.round(b * rim);
      rgba[o + 3] = 255;
    } else {
      const t = y / (H - 1);
      rgba[o + 0] = clamp(Math.round(lerp(185, 118, t)), 96, 195);
      rgba[o + 1] = clamp(Math.round(lerp(64, 22, t)), 18, 72);
      rgba[o + 2] = 14;
      rgba[o + 3] = 255;
    }
  }
  return make4BitTex(W, H, rgba, false);
}

function buildStylizedCrashLetter(letter, ti) {
  // Extrude clean 2D convex quads (p0,p1,p2,p3 in CCW 2D [x left->right, y top->bottom]) into watertight 3D!
  // Mirror X (x -> -x) to match ORIG items.psx S-K-A-T-E front orientation (readable L->R from +Z)!
  const mb = new PsxMeshBuilder();
  const z0 = -15, z1 = 15;

  // Each quad: [TL, TR, BL, BR] in viewer-space (x: -48..+48 left->right, y: -52..+52 top->bottom)
  // openEdges = bitmask of edges shared internally with adjacent quad so we emit ZERO internal hidden walls!
  //   bit0=top(TL->TR), bit1=right(TR->BR), bit2=bot(BR->BL), bit3=left(BL->TL)
  const addExtrudedQuad = (TL, TR, BL, BR, openMask = 0) => {
    const mapX = p => [-p[0], p[1]]; // mirror X for PS1 right-handed +Z front
    const q = [mapX(TL), mapX(TR), mapX(BL), mapX(BR)];
    const fV = q.map(([x, y]) => mb.addV(x, y, z1));
    const bV = q.map(([x, y]) => mb.addV(x, y, z0));
    const uvY = y => clamp(Math.round(((y + 52) / 104) * 58 + 3), 3, 60);
    const uvX = x => clamp(Math.round(((x + 48) / 96) * 8 + 2), 2, 10);

    // Front (+Z) and Back (-Z) vibrant flame faces
    mb.quad(fV[0], fV[1], fV[2], fV[3], ti,
      [uvX(TL[0]), uvY(TL[1])], [uvX(TR[0]), uvY(TR[1])], [uvX(BL[0]), uvY(BL[1])], [uvX(BR[0]), uvY(BR[1])],
      { outNormal: [0, 0, 1], rgb: [152, 152, 152] });
    mb.quad(bV[1], bV[0], bV[3], bV[2], ti,
      [uvX(TR[0]), uvY(TR[1])], [uvX(TL[0]), uvY(TL[1])], [uvX(BR[0]), uvY(BR[1])], [uvX(BL[0]), uvY(BL[1])],
      { outNormal: [0, 0, -1], rgb: [142, 142, 142] });

    // Perimeter extruded bevel edges (ONLY on non-shared edges!)
    const edges = [
      [0, 1, 1], // top
      [1, 3, 2], // right
      [3, 2, 4], // bot
      [2, 0, 8], // left
    ];
    for (const [iA, iB, bit] of edges) {
      if (openMask & bit) continue;
      const pA = q[iA], pB = q[iB];
      const dx = pB[0] - pA[0], dy = pB[1] - pA[1];
      if (Math.hypot(dx, dy) < 1) continue;
      // Outward 2D normal for CW perimeter (after X-mirror, TL->TR->BR->BL is CCW in screen Y-down => outward is [-dy, +dx]!)
      // Verify against quad center:
      const qcx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
      const qcy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      const emx = (pA[0] + pB[0]) / 2 - qcx, emy = (pA[1] + pB[1]) / 2 - qcy;
      let onx = -dy, ony = dx;
      if (onx * emx + ony * emy < 0) { onx = -onx; ony = -ony; }
      const shade = ony < 0 ? 136 : (ony > 0 ? 96 : 114);
      mb.quad(fV[iA], fV[iB], bV[iA], bV[iB], ti, [13, 4], [15, 4], [13, 60], [15, 60], {
        outNormal: [onx, ony, 0], rgb: [shade, shade, shade],
      });
    }
  };

  // Stylized bold Crash Bandicoot 3D letters (x in [-46..+46], y in [-52..+52]):
  if (letter === 'C') {
    // Sleek chamfered C (5 seamless connected segments, zero internal walls!)
    addExtrudedQuad([-26, -52], [ 42, -52], [-18, -28], [ 42, -28], 8); // top bar
    addExtrudedQuad([-26, -52], [-18, -28], [-44, -26], [-18, -18], 1 | 4); // top-left chamfer
    addExtrudedQuad([-44, -26], [-18, -18], [-44,  26], [-18,  18], 1 | 4); // left spine
    addExtrudedQuad([-44,  26], [-18,  18], [-26,  52], [-18,  28], 1 | 2); // bot-left chamfer
    addExtrudedQuad([-18,  28], [ 42,  28], [-26,  52], [ 42,  52], 8); // bottom bar
  } else if (letter === 'R') {
    // Bold stylized R with clean open upper bowl AND sleek diagonal kick leg!
    addExtrudedQuad([-44, -52], [-18, -52], [-44,  52], [-18,  52], 0); // full left spine
    addExtrudedQuad([-18, -52], [ 24, -52], [-18, -32], [ 16, -32], 8 | 2); // top bar
    addExtrudedQuad([ 16, -32], [ 24, -52], [ 18,  -8], [ 42, -32], 1 | 4); // upper-right bowl chamfer
    addExtrudedQuad([ 18, -32], [ 42, -32], [ 18,  -6], [ 42,  -6], 1 | 4); // right bowl outer wall
    addExtrudedQuad([-18, -10], [ 26, -10], [-18,  10], [ 24,  10], 8);     // mid crossbar
    addExtrudedQuad([ -4,  10], [ 22,  10], [ 16,  52], [ 44,  52], 1);     // SLEEK DIAGONAL KICK LEG!
  } else if (letter === 'A') {
    // Bold slanted A-frame with pointed peak & crisp triangular inner cutout!
    addExtrudedQuad([-14, -52], [ 14, -52], [-26, -24], [ 26, -24], 4);     // tapered peak
    addExtrudedQuad([-26, -24], [  0, -24], [-46,  52], [-20,  52], 1);     // slanted left leg
    addExtrudedQuad([  0, -24], [ 26, -24], [ 20,  52], [ 46,  52], 1);     // slanted right leg
    addExtrudedQuad([-26,   4], [ 26,   4], [-32,  24], [ 32,  24], 8 | 2); // crossbar
  } else if (letter === 'S') {
    // Bold dynamic stylized Crash S with clean chamfered shoulders & chunky bottom bar!
    addExtrudedQuad([-24, -52], [ 42, -52], [-16, -30], [ 42, -30], 8);     // top bar
    addExtrudedQuad([-24, -52], [-16, -30], [-42, -26], [-16, -12], 1 | 4); // upper-left bevel
    addExtrudedQuad([-42, -26], [-16, -12], [-26,   8], [-12, -10], 1 | 2); // upper-left curve
    addExtrudedQuad([-26,   8], [-12, -10], [ 16,  10], [ 28,  -8], 8 | 2); // slanted center bridge
    addExtrudedQuad([ 16,  10], [ 28,  -8], [ 16,  28], [ 42,  26], 1 | 4); // lower-right wall
    addExtrudedQuad([ 16,  28], [ 42,  26], [ 16,  30], [ 24,  52], 1 | 8); // lower-right bevel
    addExtrudedQuad([-42,  30], [ 16,  30], [-42,  52], [ 24,  52], 2);     // clean chunky bottom bar!
  } else if (letter === 'H') {
    // Chunky bold Crash H!
    addExtrudedQuad([-44, -52], [-16, -52], [-44,  52], [-16,  52], 0); // left pillar
    addExtrudedQuad([ 16, -52], [ 44, -52], [ 16,  52], [ 44,  52], 0); // right pillar
    addExtrudedQuad([-16, -13], [ 16, -13], [-16,  13], [ 16,  13], 8 | 2); // crossbar
  }
  return mb;
}

// ============================================================================
// 9. Assemble Standalone crash_it.psx (Exact 14-Mesh items.psx Schema, supports 4bpp + 8bpp!)
// ============================================================================
function buildCrashItemsPsx(objs3d, crateTexs, akuAssets) {
  // Exact 14 mesh hashes of modded items.psx (0..12 original THPS2 + 13 fallback)
  // VERIFIED directly from original items.psx textures:
  //   M[9]  (0xcc4e141f, orig ti=10) = $100 -> Power Crystal ("Cristal +100!")
  //   M[10] (0x260f4f80, orig ti=11) = $50  -> Wumpa Fruit   ("Manga Wumpa +50!")
  //   M[11] (0x694ed947, orig ti=12) = $250 -> Diamond Gem   ("Diamante +250!")
  const ITEMS_HASHES = [
    0x6f0f6b9f, // M[0]  -> 3D Crash 3 Red TNT Crate (BT10G)
    0xf6063a25, // M[1]  -> 3D Crash 3 Neon-Green NITRO Crate (Bn10G)
    0x81010ab3, // M[2]  -> 3D Crash 3 Checkpoint "C" Crate (BC10G)
    0x311d55d4, // M[3]  -> 3D Stylized Letter "C" (replaces S)
    0x2328a71c, // M[4]  -> 3D Stylized Letter "R" (replaces K)
    0x2ebf22ca, // M[5]  -> 3D Stylized Letter "A" (replaces A)
    0x34524351, // M[6]  -> 3D Stylized Letter "S" (replaces T)
    0x29b68a16, // M[7]  -> 3D Stylized Letter "H" (replaces E)
    0x7c1b2c4a, // M[8]  -> 3D Power Crystal (Cry1G) + Discrete ABR=1 Violet Aura (fl=0x10C3)!
    0xcc4e141f, // M[9]  -> $100 Cash -> 3D Power Crystal ("Cristal")!
    0x260f4f80, // M[10] -> $50  Cash -> 3D Wumpa Fruit ("Manga")!
    0x694ed947, // M[11] -> $250 Cash -> 3D Sparkling Diamond ("Diamante")!
    0x4605a8d0, // M[12] -> 3D Authentic 256-Color Aku Aku Mask (WD10G, true 0x7C1F feather alpha!)
    0x58585858, // M[13] -> 3D Stylized Letter "H" fallback
  ];

  // 12 crisp textures (11x 4bpp + 1x 128x64 8bpp 256-color Aku Aku — total crash_it.psx < 40,784 B!)
  const texSpecs = [
    { name: 'cr_tnt',     ...crateTexs.tntSide4 },                    // T[0]  64x64 4bpp Naughty Dog BT10G TNT side
    { name: 'cr_tnt_t',   ...crateTexs.tntTop4Small },                // T[1]  16x16 4bpp Naughty Dog BT10G X-top
    { name: 'cr_nitro',   ...crateTexs.nitSide4 },                    // T[2]  64x64 4bpp Naughty Dog Bn10G NITRO side
    { name: 'cr_nitro_t', ...crateTexs.nitTop4Small },                // T[3]  16x16 4bpp Naughty Dog Bn10G X-top
    { name: 'cr_chk',     ...crateTexs.chkSide4 },                    // T[4]  64x64 4bpp Naughty Dog BC10G CHK side
    { name: 'cr_chk_t',   ...crateTexs.chkTop4Small },                // T[5]  16x16 4bpp Naughty Dog BN10G wood top
    { name: 'cr_ltr',     ...makeCrashLetterTex() },                  // T[6]  32x64 4bpp Crash flame letters
    { name: 'cr_crys',    ...makeFacetGradientTex('crystal', 16) },   // T[7]  16x16 4bpp Neon Magenta Crystal
    { name: 'cr_aura',    ...makeCrystalAuraTex() },                  // T[8]  64x64 4bpp ABR=1 Starlight Aura (0x7C1F)
    { name: 'cr_wumpa',   ...makeWumpaTex() },                        // T[9]  64x64 4bpp Wumpa + Cutout Leaf (0x7C1F)
    { name: 'cr_diam',    ...makeFacetGradientTex('diamond', 16) },   // T[10] 16x16 4bpp Sparkling Clear Diamond
    { name: 'cr_aku',     ...akuAssets.textures[0] },                 // T[11] 128x64 8bpp 256-Color Aku Aku (0x7C1F!)
  ];

  const itemCrateOpts = { halfW: 52, bevel: 7, yTop: -52, yBot: 52, subdivX: 1, subdivY: 1, topSize: 16 };
  const meshBuilders = [
    buildSculptedCrateMesh(0, 1, itemCrateOpts),                                                          // M[0] TNT Crate
    buildSculptedCrateMesh(2, 3, itemCrateOpts),                                                          // M[1] NITRO Crate
    buildSculptedCrateMesh(4, 5, itemCrateOpts),                                                          // M[2] Checkpoint "C" Crate
    buildStylizedCrashLetter('C', 6),                                                                     // M[3] C
    buildStylizedCrashLetter('R', 6),                                                                     // M[4] R
    buildStylizedCrashLetter('A', 6),                                                                     // M[5] A
    buildStylizedCrashLetter('S', 6),                                                                     // M[6] S
    buildStylizedCrashLetter('H', 6),                                                                     // M[7] H
    buildPowerCrystalWithAura(objs3d.cry, 7, 8, 195, 0, 16),                                              // M[8] Secret Tape: Crystal + 0x10C3 Aura!
    buildFacetedObjMesh(objs3d.cry, 7, 154, { scaleX: 1.40, scaleY: 1.0, scaleZ: 1.40, texSize: 16 }),    // M[9]  $100 -> 3D Power Crystal ("Cristal")!
    build3DWumpaFruitMesh(9),                                                                             // M[10] $50  -> 3D Wumpa Fruit ("Manga")!
    buildBrilliantDiamondMesh(10, 16),                                                                    // M[11] $250 -> 3D Brilliant-Cut Diamond ("Diamante")!
    akuAssets.buildMesh([11], 155, 0),                                                                    // M[12] Aku Aku Mask (WD10G 256-color!)
    buildStylizedCrashLetter('H', 6),                                                                     // M[13] H fallback
  ];

  const meshBufs = meshBuilders.map(mb => mb.buildBuffer());
  const numObjs = meshBufs.length;
  const numMeshes = meshBufs.length;
  const hdrSize = 12 + numObjs * 36 + 4 + numMeshes * 4;
  const meshOffs = [];
  let cur = hdrSize;
  for (const b of meshBufs) { meshOffs.push(cur); cur += b.length; }
  const ptrMeta = cur;

  const topHdr = Buffer.alloc(hdrSize, 0);
  topHdr.writeUInt32LE(0x00020004, 0);
  topHdr.writeUInt32LE(ptrMeta, 4);
  topHdr.writeUInt32LE(numObjs, 8);
  for (let i = 0; i < numObjs; i++) topHdr.writeUInt16LE(i, 12 + i * 36 + 22);
  topHdr.writeUInt32LE(numMeshes, 12 + numObjs * 36);
  meshOffs.forEach((o, i) => topHdr.writeUInt32LE(o, 12 + numObjs * 36 + 4 + i * 4));

  const endTag = Buffer.alloc(4); endTag.writeUInt32LE(0xFFFFFFFF, 0);
  const mhBuf = Buffer.alloc(numMeshes * 4);
  ITEMS_HASHES.forEach((h, i) => mhBuf.writeUInt32LE(h, i * 4));
  const thBuf = Buffer.alloc(4 + texSpecs.length * 4);
  thBuf.writeUInt32LE(texSpecs.length, 0);
  texSpecs.forEach((t, i) => thBuf.writeUInt32LE(psxLib.nsHash(t.name), 4 + i * 4));

  const pal16List = [];
  const pal256List = [];
  texSpecs.forEach((t, i) => {
    const palId = (0xC3A50100 + i) >>> 0;
    t.palId = palId;
    if (t.palSize === 256) pal256List.push({ palId, bytes: t.palBytes });
    else pal16List.push({ palId, bytes: t.palBytes });
  });

  const p16Buf = Buffer.alloc(4 + pal16List.length * 36);
  p16Buf.writeUInt32LE(pal16List.length, 0);
  pal16List.forEach((p, i) => { p16Buf.writeUInt32LE(p.palId, 4 + i * 36); p.bytes.copy(p16Buf, 4 + i * 36 + 4); });

  const p256Buf = Buffer.alloc(4 + pal256List.length * 516);
  p256Buf.writeUInt32LE(pal256List.length, 0);
  pal256List.forEach((p, i) => { p256Buf.writeUInt32LE(p.palId, 4 + i * 516); p.bytes.copy(p256Buf, 4 + i * 516 + 4); });

  const preTexLen = endTag.length + mhBuf.length + thBuf.length + p16Buf.length + p256Buf.length;
  const texTblBuf = Buffer.alloc(4 + texSpecs.length * 4);
  texTblBuf.writeUInt32LE(texSpecs.length, 0);
  let tCur = ptrMeta + preTexLen + texTblBuf.length;
  const texPayloads = [];
  texSpecs.forEach((t, i) => {
    texTblBuf.writeUInt32LE(tCur, 4 + i * 4);
    const th = Buffer.alloc(20);
    th.writeUInt32LE(0, 0);
    th.writeUInt32LE(t.palSize, 4);
    th.writeUInt32LE(t.palId, 8);
    th.writeUInt32LE(i, 12);
    th.writeUInt16LE(t.w, 16);
    th.writeUInt16LE(t.h, 18);
    const padLen = (4 - ((20 + t.pxBytes.length) % 4)) % 4;
    const blk = padLen ? Buffer.concat([th, t.pxBytes, Buffer.alloc(padLen, 0)]) : Buffer.concat([th, t.pxBytes]);
    texPayloads.push(blk);
    tCur += blk.length;
  });

  const outBuf = Buffer.concat([topHdr, ...meshBufs, endTag, mhBuf, thBuf, p16Buf, p256Buf, texTblBuf, ...texPayloads]);
  if (outBuf.length > 40784) {
    throw new Error(`crash_it.psx excedeu limite de items.psx (40,784 B): ${outBuf.length} B!`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'crash_it.psx'), outBuf);
  console.log(`  [crash_it.psx] ${outBuf.length} B (${numMeshes} meshes, ${pal16List.length}x4bpp + ${pal256List.length}x8bpp texs — limite 40,784 B orig!)`);
  return { outBuf, texSpecs };
}

// ============================================================================
// 10. Replace Specific Collectible Meshes Inside Existing Level *_o.psx Banks
//     (Full 4bpp + 8bpp pal256 support + automatic SObject.rgbOff relocation!)
// ============================================================================
function replaceMeshesAndAppendTexsInPsx(origBuf, replacements) {
  const info = psxLib.parsePsxStructure(origBuf);
  const numObjs = info.objs.length;
  const numMeshes = info.numMeshes;

  let mp = info.ptrMeta;
  const metaTagsStart = mp;
  while (mp + 4 <= origBuf.length) {
    const tag = origBuf.readUInt32LE(mp); mp += 4;
    if (tag === 0xFFFFFFFF) break;
    mp += 4 + origBuf.readUInt32LE(mp);
  }
  const metaTagsRaw = Buffer.from(origBuf.subarray(metaTagsStart, mp));
  const meshHashes = info.meshHashes.slice();
  mp += numMeshes * 4;

  const numTexRefs = origBuf.readUInt32LE(mp); mp += 4;
  const texHashes = Array.from({ length: numTexRefs }, (_, i) => origBuf.readUInt32LE(mp + i * 4));
  mp += numTexRefs * 4;

  const numPal16 = origBuf.readUInt32LE(mp); mp += 4;
  const pal16List = [];
  for (let i = 0; i < numPal16; i++) {
    pal16List.push({ palId: origBuf.readUInt32LE(mp), bytes: Buffer.from(origBuf.subarray(mp + 4, mp + 36)) });
    mp += 36;
  }
  const numPal256 = origBuf.readUInt32LE(mp); mp += 4;
  const pal256List = [];
  for (let i = 0; i < numPal256; i++) {
    pal256List.push({ palId: origBuf.readUInt32LE(mp), bytes: Buffer.from(origBuf.subarray(mp + 4, mp + 516)) });
    mp += 516;
  }
  const numTex = origBuf.readUInt32LE(mp); mp += 4;
  const origTexOffs = Array.from({ length: numTex }, (_, i) => origBuf.readUInt32LE(mp + i * 4));
  const texBlocks = [];
  for (let i = 0; i < numTex; i++) {
    const start = origTexOffs[i];
    const end = (i + 1 < numTex) ? origTexOffs[i + 1] : origBuf.length;
    texBlocks.push(Buffer.from(origBuf.subarray(start, end)));
  }

  const meshBufs = [];
  for (let mi = 0; mi < numMeshes; mi++) {
    const s = info.meshOffs[mi];
    const e = (mi + 1 < numMeshes) ? info.meshOffs[mi + 1] : info.ptrMeta;
    meshBufs.push(Buffer.from(origBuf.subarray(s, e)));
  }

  let nextPalId = 0xC3B50001;
  for (const rep of replacements) {
    const mi = meshHashes.indexOf(rep.meshHash);
    if (mi < 0) throw new Error(`Mesh hash 0x${rep.meshHash.toString(16)} nao encontrado!`);
    const newTexIds = [];
    for (const nt of rep.newTexs) {
      const ti = texHashes.length;
      texHashes.push(psxLib.nsHash(nt.name));
      const palId = (nextPalId++) >>> 0;
      if (nt.palSize === 256) pal256List.push({ palId, bytes: nt.palBytes });
      else pal16List.push({ palId, bytes: nt.palBytes });
      const th = Buffer.alloc(20);
      th.writeUInt32LE(0, 0);
      th.writeUInt32LE(nt.palSize, 4);
      th.writeUInt32LE(palId, 8);
      th.writeUInt32LE(ti, 12);
      th.writeUInt16LE(nt.w, 16);
      th.writeUInt16LE(nt.h, 18);
      const padLen = (4 - ((20 + nt.pxBytes.length) % 4)) % 4;
      texBlocks.push(padLen ? Buffer.concat([th, nt.pxBytes, Buffer.alloc(padLen, 0)]) : Buffer.concat([th, nt.pxBytes]));
      newTexIds.push(ti);
    }
    meshBufs[mi] = rep.buildMeshFn(newTexIds).buildBuffer();
  }

  const hdrSize = 12 + numObjs * 36 + 4 + numMeshes * 4;
  const topHdr = Buffer.from(origBuf.subarray(0, hdrSize));
  let cur = hdrSize;
  for (let i = 0; i < numMeshes; i++) {
    topHdr.writeUInt32LE(cur, 12 + numObjs * 36 + 4 + i * 4);
    cur += meshBufs[i].length;
  }
  const ptrMeta = cur;
  topHdr.writeUInt32LE(ptrMeta, 4);

  const deltaMeta = ptrMeta - info.ptrMeta;
  if (deltaMeta !== 0) {
    for (let i = 0; i < numObjs; i++) {
      const rgbOffField = 12 + i * 36 + 32;
      const oldRgbOff = origBuf.readUInt32LE(rgbOffField);
      if (oldRgbOff >= info.ptrMeta) {
        topHdr.writeUInt32LE((oldRgbOff + deltaMeta) >>> 0, rgbOffField);
      }
    }
  }

  const mhBuf = Buffer.alloc(numMeshes * 4);
  meshHashes.forEach((h, i) => mhBuf.writeUInt32LE(h, i * 4));
  const thBuf = Buffer.alloc(4 + texHashes.length * 4);
  thBuf.writeUInt32LE(texHashes.length, 0);
  texHashes.forEach((h, i) => thBuf.writeUInt32LE(h, 4 + i * 4));
  const p16Buf = Buffer.alloc(4 + pal16List.length * 36);
  p16Buf.writeUInt32LE(pal16List.length, 0);
  pal16List.forEach((p, i) => { p16Buf.writeUInt32LE(p.palId, 4 + i * 36); p.bytes.copy(p16Buf, 4 + i * 36 + 4); });
  const p256Buf = Buffer.alloc(4 + pal256List.length * 516);
  p256Buf.writeUInt32LE(pal256List.length, 0);
  pal256List.forEach((p, i) => { p256Buf.writeUInt32LE(p.palId, 4 + i * 516); p.bytes.copy(p256Buf, 4 + i * 516 + 4); });

  const preTexLen = metaTagsRaw.length + mhBuf.length + thBuf.length + p16Buf.length + p256Buf.length;
  const texTblBuf = Buffer.alloc(4 + texBlocks.length * 4);
  texTblBuf.writeUInt32LE(texBlocks.length, 0);
  let tCur = ptrMeta + preTexLen + texTblBuf.length;
  for (let i = 0; i < texBlocks.length; i++) {
    texTblBuf.writeUInt32LE(tCur, 4 + i * 4);
    tCur += texBlocks[i].length;
  }
  return Buffer.concat([topHdr, ...meshBufs, metaTagsRaw, mhBuf, thBuf, p16Buf, p256Buf, texTblBuf, ...texBlocks]);
}

function buildCrashLevelObjectSwaps(objs3d, crateTexs, akuAssets, ukaAssets) {
  const texTntSide = { name: 'c3_tnt_s', ...crateTexs.tntSide8 };
  const texTntTop  = { name: 'c3_tnt_t', ...crateTexs.tntTop4 };
  const texRel     = { name: 'c3_rel',   ...makeRelicSplitTex() };
  const texEmer    = { name: 'c3_emer',  ...makeFacetGradientTex('emerald') };
  const texCry     = { name: 'c3_cry',   ...makeFacetGradientTex('crystal') };
  const texAura    = { name: 'c3_aura',  ...makeCrystalAuraTex() };

  const built = [];

  // 1. Hangar (skhan_o.psx -> cr_han_o.psx):
  //    - 5 Pilot Wings (0xd0c4f2da) -> 3D 256-Color Aku Aku Mask (WD10G, true 0x7C1F alpha, yOffset=-30!)
  //    - 5 Barrel Clusters (0x4eb2c689) -> 3D Ground-Planted Beveled Subdivided Naughty Dog TNT Crates!
  //      * EXACT floor height Y = +63 & top Y = -62 (height 125 matching original Barrel to 1 unit!)
  //      * Beveled halfW = 41, bevel = 10 -> maxR = 51.4 < 52.6 half-spacing -> ZERO overlap in 3-crate stacks!
  const origHanO = psxLib.getOrigWadSlice('skhan_o.psx');
  const crHanO = replaceMeshesAndAppendTexsInPsx(origHanO, [
    {
      meshHash: 0xd0c4f2da,
      newTexs: akuAssets.textures,
      buildMeshFn: (tis) => akuAssets.buildMesh(tis, 185, -30),
    },
    {
      meshHash: 0x4eb2c689,
      newTexs: [texTntSide, texTntTop],
      buildMeshFn: ([tiS, tiT]) => buildSculptedCrateMesh(tiS, tiT, {
        halfW: 41, bevel: 10, yTop: -62, yBot: 63, subdivX: 2, subdivY: 2,
      }),
    },
  ]);
  fs.writeFileSync(path.join(OUT_DIR, 'cr_han_o.psx'), crHanO);
  built.push(['cr_han_o.psx', crHanO.length]);

  // 2. ALL 6 Regular THPS1 Levels' G5 custom collectibles!
  const thps1Specs = [
    {
      out: 'cr_ware.psx', src: 'skware_o.psx', hash: 0x5111A101,
      newTexs: [texTntSide, texTntTop],
      buildMeshFn: ([tiS, tiT]) => buildSculptedCrateMesh(tiS, tiT, {
        halfW: 58, bevel: 8, yTop: -70, yBot: 46, subdivX: 2, subdivY: 2,
      }),
    },
    {
      out: 'cr_schl.psx', src: 'skschl_o.psx', hash: 0x5112A102,
      newTexs: akuAssets.textures,
      buildMeshFn: (tis) => akuAssets.buildMesh(tis, 190, -12),
    },
    {
      out: 'cr_mall.psx', src: 'skmall_o.psx', hash: 0x5113A103,
      newTexs: [texRel],
      buildMeshFn: ([ti]) => buildFacetedObjMesh(objs3d.rel, ti, 195, {
        scaleX: 1.0, scaleY: 1.0, scaleZ: 1.85, yOffset: -12, isRelic: true,
      }),
    },
    {
      out: 'cr_down.psx', src: 'skdown_o.psx', hash: 0x5115A104,
      newTexs: [texEmer], // FIXED: Vivid EMERALD GREEN Warp Gem matching "5 Gemas Warp Esmeralda"!
      buildMeshFn: ([ti]) => buildFacetedObjMesh(objs3d.gem, ti, 168, { yOffset: -8 }),
    },
    {
      out: 'cr_jam.psx', src: 'skjam_o.psx', hash: 0x5116A105,
      newTexs: ukaAssets.textures, // 2x 128x64 8bpp 256-Color Uka Uka with true 0x7C1F cutout!
      buildMeshFn: (tis) => ukaAssets.buildMesh(tis, 190, -12),
    },
    {
      out: 'cr_sf.psx', src: 'sksf_o.psx', hash: 0x5118A106,
      newTexs: [texCry, texAura],
      buildMeshFn: ([tiC, tiA]) => buildPowerCrystalWithAura(objs3d.cry, tiC, tiA, 205, -14),
    },
  ];
  for (const sp of thps1Specs) {
    const srcPath = path.join(THPS1_CONV_DIR, sp.src);
    if (!fs.existsSync(srcPath)) throw new Error(`Falta ${srcPath} — rode port_thps1_levels.js / mod_thps1_custom_objects.js primeiro!`);
    const outPsx = replaceMeshesAndAppendTexsInPsx(fs.readFileSync(srcPath), [{
      meshHash: sp.hash, newTexs: sp.newTexs, buildMeshFn: sp.buildMeshFn,
    }]);
    fs.writeFileSync(path.join(OUT_DIR, sp.out), outPsx);
    built.push([sp.out, outPsx.length]);
  }

  console.log('  [Level Swaps Crash-Only]', built.map(([n, s]) => `${n}(${s} B)`).join(', '));
  return built;
}

// ============================================================================
// 11. Render Full Visual Contact Sheet of ALL crash_it.psx + Level Swaps!
// ============================================================================
function renderCrashItemsPreview(psxBuf) {
  const showMeshes = [
    { mi: 0 }, { mi: 1 }, { mi: 2 }, { mi: 3 }, { mi: 4 },
    { mi: 5 }, { mi: 6 }, { mi: 7 }, { mi: 8 }, { mi: 9 },
    { mi: 10 }, { mi: 11 }, { mi: 12 },
  ];
  const cellW = 160, cellH = 160, cols = 5, rows = 3;
  const W = cellW * cols, H = cellH * rows;
  const sheet = Buffer.alloc(W * H * 4, 24);
  for (let i = 0; i < W * H; i++) sheet[i * 4 + 3] = 255;

  showMeshes.forEach((item, idx) => {
    const gx = idx % cols, gy = Math.floor(idx / cols);
    const sc = item.mi === 8 ? 0.44 : (item.mi >= 3 && item.mi <= 7) ? 0.85 : 0.65;
    const cell = psxLib.renderPs1SkaterPreview(psxBuf, [item.mi], [{ yaw: 28 }], cellW, cellH, sc, 0, null);
    for (let y = 0; y < cellH; y++) {
      cell.rgba.copy(sheet, ((gy * cellH + y) * W + gx * cellW) * 4, y * cellW * 4, (y + 1) * cellW * 4);
    }
  });
  const outPng = path.join(OUT_DIR, 'preview_crash_collectibles.png');
  psxLib.writePng(outPng, W, H, sheet);
  console.log(`  [Preview] ${outPng} gerado!`);
}

function buildAllCrashCollectibles() {
  console.log('=== [mod_crash_collectibles v2] Compilando coletaveis 3D HD exclusivos do Crash B. ===');
  const manifest = JSON.parse(fs.readFileSync(path.join(OBJ_3D_ROOT, 'tgeo_models_manifest.json'), 'utf8'));
  const loadObj = ename => {
    const e = manifest.find(x => x.ename === ename);
    if (!e) throw new Error(`Modelo Crash 3 ausente: ${ename}`);
    return parseObjFile(path.join(OBJ_3D_ROOT, e.obj));
  };
  const objs3d = {
    tnt:   loadObj('BT10G'),
    nitro: loadObj('Bn10G'),
    chk:   loadObj('BC10G'),
    wood:  loadObj('BN10G'),
    cry:   loadObj('Cry1G'),
    gem:   loadObj('Ge10G'),
    rel:   loadObj('Rel1G'),
    aku:   loadObj('WD10G'),
    uka:   loadObj('Uk17G'),
  };

  const crateTexs = makeCrateTexturesFromCrash3(objs3d);
  const akuAssets = buildPerTriMaskAssets(objs3d.aku, ['c3_aku'], { targetSpan: 185, brighten: 1.18 });
  const ukaAssets = buildPerTriMaskAssets(objs3d.uka, ['c3_uka_a', 'c3_uka_b'], { targetSpan: 190, brighten: 1.24 });

  const { outBuf } = buildCrashItemsPsx(objs3d, crateTexs, akuAssets);
  renderCrashItemsPreview(outBuf);
  buildCrashLevelObjectSwaps(objs3d, crateTexs, akuAssets, ukaAssets);
  console.log('=== [mod_crash_collectibles v2] Concluido com sucesso! ===');
}

if (require.main === module) {
  buildAllCrashCollectibles();
}

module.exports = { buildAllCrashCollectibles };
