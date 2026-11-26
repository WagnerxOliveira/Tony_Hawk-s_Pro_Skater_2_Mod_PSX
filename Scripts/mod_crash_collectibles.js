#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) — Crash Bandicoot ("Crash B.", Slot 20) Exclusive 3D Collectibles Builder
 *
 * Builds 100% isolated Crash 3 3D collectibles served EXCLUSIVELY when playing as Crash B. (Slot 20)
 * across ALL 19 levels (THPS2 + THPS1) — ZERO modification to CD.WAD and ZERO effect on Lulao,
 * Tony Hawk, or any other skater!
 *
 *   1. crash_it.psx (replaces items.psx for Crash B. ONLY in ALL 19 levels! <= 39 KB):
 *      - M[0] (0x6f0f6b9f): Authentic 3D Crash 3 Red TNT Crate (BT10G geometry & texture)
 *      - M[1] (0xf6063a25): Authentic 3D Crash 3 Neon-Green NITRO Crate
 *      - M[2] (0x81010ab3): Authentic 3D Crash 3 Checkpoint "C" Crate (BC10G)
 *      - M[3..7] (S,K,A,T,E): Sculpted 3D bevelled "C - R - A - S - H" floating jungle letters!
 *      - M[8] (0x7c1b2c4a Secret Tape): Authentic 3D Cry1G Power Crystal + 3 crossed PS1 ABR=1
 *                                       additive violet-cyan shimmering aura planes (0x18C3)!
 *      - M[9] (0xcc4e141f $50 Cash):  Sculpted 3D Wumpa Fruit (tropical gradient + green leaf!)
 *      - M[10] (0x260f4f80 $100 Cash): Authentic 3D Ge10G Warp Gem (cyan-emerald faceted diamond!)
 *      - M[11] (0x694ed947 $250 Cash): Authentic 3D Rel1G Gold Time Relic (metallic Ankh trophy!)
 *      - M[12] (0x4605a8d0 Stat Point): Authentic 3D WD10G Aku Aku Mask (colorful feathers + face!)
 *      - M[13] (0x58585858 fallback): Sculpted 3D "H" letter
 *
 *   2. Crash-only Level Collectible Bank Swaps (stored in THPS1.WAD, served ONLY for Slot 20!):
 *      - cr_han_o.psx (Hangar skhan_o.psx / skhan_o2.psx):
 *          * Barrels (0x4eb2c689)     -> 3D Red TNT Crates!
 *          * Pilot Wings (0xd0c4f2da) -> 3D Aku Aku Masks!
 *      - cr_ware.psx (THPS1 Warehouse 0x5111A101)     -> 3D TNT Crates!
 *      - cr_schl.psx (THPS1 School Miami 0x5112A102)  -> 3D Aku Aku Masks!
 *      - cr_mall.psx (THPS1 Mall NY 0x5113A103)       -> 3D Gold Time Relics!
 *      - cr_down.psx (THPS1 Downtown 0x5115A104)      -> 3D Warp Gems!
 *      - cr_jam.psx  (THPS1 Downhill Jam 0x5116A105)  -> 3D Uka Uka Masks!
 *      - cr_sf.psx   (THPS1 Streets SF 0x5118A106)    -> 3D Power Crystals + Aura!
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
// PS1 Mesh Builder (exact battle-tested fl=0x2003 / 0x18C3 28-byte faces)
// ============================================================================
class PsxMeshBuilder {
  constructor() {
    this.verts = [];
    this.norms = [];
    this.faces = [];
  }
  addV(x, y, z) {
    this.verts.push([Math.round(x), Math.round(y), Math.round(z)]);
    return this.verts.length - 1;
  }
  addN(nx, ny, nz) {
    const len = Math.hypot(nx, ny, nz) || 1;
    this.norms.push([
      clamp(Math.round((nx / len) * 4095), -4095, 4095),
      clamp(Math.round((ny / len) * 4095), -4095, 4095),
      clamp(Math.round((nz / len) * 4095), -4095, 4095),
    ]);
    return this.norms.length - 1;
  }
  // Collapsed-D textured triangle with exact PS1 front-facing winding dot(cross, outN) < 0
  tri(v0, v1, v2, ti, uv0, uv1, uv2, { rgb = [132, 132, 132], fl = 0x2003, gpu = 0x2c, doubleSided = false, outNormal = null } = {}) {
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
  quad(v0, v1, v2, v3, ti, uv0, uv1, uv2, uv3, { rgb = [132, 132, 132], fl = 0x2003, gpu = 0x2c, doubleSided = false, outNormal = null } = {}) {
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
  box(x0, y0, z0, x1, y1, z1, ti, u0 = 1, v0 = 1, u1 = 62, v1 = 62, opts = {}) {
    const flt = this.addV(x0, y0, z1), frt = this.addV(x1, y0, z1);
    const flb = this.addV(x0, y1, z1), frb = this.addV(x1, y1, z1);
    const blt = this.addV(x0, y0, z0), brt = this.addV(x1, y0, z0);
    const blb = this.addV(x0, y1, z0), brb = this.addV(x1, y1, z0);
    const a = [u0, v0], b = [u1, v0], c = [u0, v1], d = [u1, v1];
    this.quad(frt, flt, frb, flb, ti, a, b, c, d, { ...opts, outNormal: [0, 0, 1], rgb: opts.rgbFront || [142, 142, 142] });
    this.quad(blt, brt, blb, brb, ti, a, b, c, d, { ...opts, outNormal: [0, 0, -1], rgb: opts.rgbBack || [136, 136, 136] });
    this.quad(brt, frt, brb, frb, ti, a, b, c, d, { ...opts, outNormal: [1, 0, 0], rgb: opts.rgbSide || [122, 122, 122] });
    this.quad(flt, blt, flb, blb, ti, a, b, c, d, { ...opts, outNormal: [-1, 0, 0], rgb: opts.rgbSide || [122, 122, 122] });
    this.quad(blt, brt, flt, frt, ti, a, b, c, d, { ...opts, outNormal: [0, -1, 0], rgb: opts.rgbTop || [152, 152, 152] });
    this.quad(flb, frb, blb, brb, ti, a, b, c, d, { ...opts, outNormal: [0, 1, 0], rgb: opts.rgbBot || [104, 104, 104] });
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
    const rad = Math.ceil(Math.max(maxR * 1.15, 160)) * 4096;
    const buf = Buffer.alloc(28 + nV * 8 + nN * 8 + nF * 28, 0);
    buf.writeUInt16LE(0x0008, 0);
    buf.writeUInt16LE(nV, 2);
    buf.writeUInt16LE(nN, 4);
    buf.writeUInt16LE(nF, 6);
    buf.writeUInt32LE(rad >>> 0, 8);
    buf.writeInt16LE(x1, 12); buf.writeInt16LE(x0, 14);
    buf.writeInt16LE(y1, 16); buf.writeInt16LE(y0, 18);
    buf.writeInt16LE(z1, 20); buf.writeInt16LE(z0, 22);
    buf.writeUInt32LE(0xFFFF7FFF, 24);
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
// Convert ANY Authentic Crash 3 .OBJ into a PS1 MeshBuilder!
// ============================================================================
function buildMeshFromCrash3Obj(obj, ti, targetSpan, opts = {}) {
  const { doubleSided = false, texW = 64, texH = 64, uvBox = null, yOffset = 0, shadeMode = 'tex', rgbScale = 1.0 } = opts;
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

  // Convert Crash 3 (+Y up, +Z fwd) -> THPS2 (-Y up, -Z fwd, +X left): pure 180 deg X-rot (det = +1!)
  for (const v of obj.verts) {
    mb.addV(
      (v[0] - cx) * sc,
      -(v[1] - cy) * sc + yOffset,
      -(v[2] - cz) * sc
    );
  }

  for (const f of obj.faces) {
    const p0 = mb.verts[f.a.v], p1 = mb.verts[f.b.v], p2 = mb.verts[f.c.v];
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1], ez = p1[2] - p0[2];
    const fx = p2[0] - p0[0], fy = p2[1] - p0[1], fz = p2[2] - p0[2];
    // OBJ CCW + det=+1 => cross points outward!
    const outN = [ey * fz - ez * fy, ez * fx - ex * fz, ex * fy - ey * fx];
    const nlen = Math.hypot(outN[0], outN[1], outN[2]) || 1;
    const ny = outN[1] / nlen, nz = outN[2] / nlen;
    // Baked directional facet shading for crystal/gem/relic sparkle!
    const shade = clamp(Math.round((118 + (-ny) * 28 + Math.abs(nz) * 18) * rgbScale), 72, 185);
    const rgb = [shade, shade, shade];

    let uv0, uv1, uv2;
    if (shadeMode === 'planar') {
      // Clean metallic/crystalline planar facet UVs so every facet shimmers beautifully!
      const mapP = p => [
        clamp(Math.round(((p[0] / (targetSpan * 0.6)) * 0.5 + 0.5) * (texW - 2) + 1), 1, texW - 2),
        clamp(Math.round(((p[1] / (targetSpan * 0.6)) * 0.5 + 0.5) * (texH - 2) + 1), 1, texH - 2),
      ];
      uv0 = mapP(p0); uv1 = mapP(p1); uv2 = mapP(p2);
    } else if (f.a.vt >= 0 && f.b.vt >= 0 && f.c.vt >= 0) {
      const mUv = ([u, v]) => {
        if (uvBox) {
          const nu = (u - uvBox.minU) / Math.max(1e-5, uvBox.maxU - uvBox.minU);
          const nv = (uvBox.maxV - v) / Math.max(1e-5, uvBox.maxV - uvBox.minV);
          return [clamp(Math.round(nu * (texW - 1)), 0, texW - 1), clamp(Math.round(nv * (texH - 1)), 0, texH - 1)];
        }
        return [clamp(Math.round(u * (texW - 1)), 0, texW - 1), clamp(Math.round((1 - v) * (texH - 1)), 0, texH - 1)];
      };
      uv0 = mUv(obj.uvs[f.a.vt]);
      uv1 = mUv(obj.uvs[f.b.vt]);
      uv2 = mUv(obj.uvs[f.c.vt]);
    } else {
      uv0 = [4, 4]; uv1 = [texW - 4, 4]; uv2 = [texW >> 1, texH - 4];
    }
    mb.tri(f.a.v, f.b.v, f.c.v, ti, uv0, uv1, uv2, { rgb, doubleSided, outNormal: outN });
  }
  return mb;
}

// ============================================================================
// Hand-Crafted 4-Bit (16-Color) 64x64 Crash 3 Collectible Textures!
// ============================================================================
function make4BitTex(w, h, rgba, transparentIdx0 = false) {
  const q = psxLib.quantize4BitForPsx(rgba, w, h, transparentIdx0 ? 0 : -1);
  const palBuf = Buffer.alloc(32);
  for (let i = 0; i < 16; i++) {
    palBuf.writeUInt16LE(transparentIdx0 && i === 0 ? 0x7C1F : q.palBgr555[i], i * 2);
  }
  return { w, h, palSize: 16, palBytes: palBuf, pxBytes: q.packed, previewRgba: q.outRgba };
}

function cropObjMatTo64(obj, tintFn = null) {
  const mat = Object.values(obj.matTex)[0];
  let minU = 1, maxU = 0, minV = 1, maxV = 0;
  for (const [u, v] of obj.uvs) {
    if (u < minU) minU = u; if (u > maxU) maxU = u;
    if (v < minV) minV = v; if (v > maxV) maxV = v;
  }
  const uvBox = { minU: clamp(minU - 0.005, 0, 1), maxU: clamp(maxU + 0.005, 0, 1), minV: clamp(minV - 0.005, 0, 1), maxV: clamp(maxV + 0.005, 0, 1) };
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const vObj = lerp(uvBox.maxV, uvBox.minV, y / (H - 1));
    const sy = (1 - vObj) * (mat.h - 1);
    for (let x = 0; x < W; x++) {
      const uObj = lerp(uvBox.minU, uvBox.maxU, x / (W - 1));
      const sx = uObj * (mat.w - 1);
      let [r, g, b] = psxLib.sampleBilinear(mat.rgba, mat.w, mat.h, sx, sy);
      if (tintFn) [r, g, b] = tintFn(r, g, b, x, y);
      const o = (y * W + x) * 4;
      rgba[o] = clamp(Math.round(r), 8, 255);
      rgba[o + 1] = clamp(Math.round(g), 8, 255);
      rgba[o + 2] = clamp(Math.round(b), 8, 255);
      rgba[o + 3] = 255;
    }
  }
  return { rgba, uvBox };
}

function drawCrateFaceTexture(kind) {
  // Crisp authentic Crash 3 64x64 crate texture: 'TNT' (red wood + yellow TNT), 'NITRO' (neon green + yellow NITRO), 'CHK' (wood + yellow C)
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  const put = (x, y, r, g, b) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const border = x < 6 || x >= 58 || y < 6 || y >= 58;
    const innerRim = x === 6 || x === 57 || y === 6 || y === 57;
    const plank = ((y % 12) === 0) ? -22 : (((x * 7 + y * 3) % 13) - 6);
    if (kind === 'TNT') {
      if (border) put(x, y, clamp(128 + plank, 65, 165), clamp(26 + plank * 0.4, 14, 48), 16);
      else if (innerRim) put(x, y, 52, 12, 10);
      else put(x, y, clamp(205 + plank, 145, 240), clamp(32 + plank * 0.4, 18, 56), 20);
    } else if (kind === 'NITRO') {
      if (border) put(x, y, clamp(24 + plank * 0.4, 12, 50), clamp(148 + plank, 95, 185), 24);
      else if (innerRim) put(x, y, 12, 62, 14);
      else put(x, y, clamp(42 + plank * 0.5, 22, 78), clamp(225 + plank, 175, 255), 36);
    } else { // Checkpoint "C" wooden crate
      if (border) put(x, y, clamp(132 + plank, 80, 165), clamp(76 + plank * 0.6, 44, 102), 26);
      else if (innerRim) put(x, y, 64, 34, 12);
      else put(x, y, clamp(188 + plank, 140, 218), clamp(118 + plank * 0.7, 82, 148), 42);
    }
  }
  // Yellow horizontal bands + crisp PS1-oriented bold label (NOTE: horizontally mirrored for PS1 box() right-handed L->R!)
  const bandCol = kind === 'TNT' ? [245, 215, 28] : kind === 'NITRO' ? [250, 235, 38] : [250, 210, 24];
  for (let x = 7; x < 57; x++) {
    for (const by of [11, 12, 51, 52]) put(x, by, bandCol[0], bandCol[1], bandCol[2]);
  }
  const FONT = {
    T:['1111','0110','0110','0110','0110'], N:['1001','1101','1011','1001','1001'],
    I:['1110','0100','0100','0100','1110'], R:['1110','1001','1110','1010','1001'],
    O:['0110','1001','1001','1001','0110'], C:['0111','1000','1000','1000','0111'],
  };
  const label = kind === 'TNT' ? 'TNT' : kind === 'NITRO' ? 'NITRO' : 'C';
  const scX = label.length === 1 ? 7 : label.length === 3 ? 3 : 2;
  const scY = label.length === 1 ? 6 : 4;
  const gap = label.length === 5 ? 1 : 2;
  const totalW = label.length * 4 * scX + (label.length - 1) * gap;
  const x0 = Math.round((W - totalW) / 2), y0 = Math.round((H - 5 * scY) / 2);
  for (let pass = 0; pass < 2; pass++) {
    const col = pass === 0 ? [28, 16, 12] : bandCol;
    for (let i = 0; i < label.length; i++) {
      const g = FONT[label[i]];
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 4; gx++) {
        if (g[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scY; sy++) for (let sx = 0; sx < scX; sx++) {
          const lx = i * (4 * scX + gap) + gx * scX + sx;
          // Mirror X so it reads LEFT-TO-RIGHT on PS1 box()!
          const px = x0 + (totalW - 1 - lx);
          const py = y0 + gy * scY + sy;
          if (pass === 0) {
            put(px - 1, py, col[0], col[1], col[2]); put(px + 1, py, col[0], col[1], col[2]);
            put(px, py - 1, col[0], col[1], col[2]); put(px, py + 1, col[0], col[1], col[2]);
          } else {
            put(px, py, col[0], col[1], col[2]);
          }
        }
      }
    }
  }
  return rgba;
}

function makeCrashLetterTex() {
  // Vibrant Crash Bandicoot logo gradient: bright golden-yellow top -> blazing orange middle -> crimson bottom, dark wood rim on right half!
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    if (x < 48) {
      // Front/back face Crash jungle flame gradient
      const t = y / (H - 1);
      const r = 255;
      const g = clamp(Math.round(lerp(245, 58, Math.pow(t, 0.9))), 45, 255);
      const b = clamp(Math.round(lerp(42, 14, t)), 12, 65);
      const border = (x < 3 || x >= 45 || y < 3 || y >= 61) ? 0.55 : 1.0;
      rgba[o] = Math.round(r * border); rgba[o + 1] = Math.round(g * border); rgba[o + 2] = Math.round(b * border); rgba[o + 3] = 255;
    } else {
      // Rich dark-amber extruded bevel sides
      rgba[o] = 165; rgba[o + 1] = 48; rgba[o + 2] = 14; rgba[o + 3] = 255;
    }
  }
  return rgba;
}

function makeCrystalTex() {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - 32) / 32, dy = (y - 32) / 32;
    const glint = Math.exp(-((dx + 0.25) * (dx + 0.25) * 8 + (dy + 0.15) * (dy + 0.15) * 4));
    const facet = ((Math.floor(x / 16) + Math.floor(y / 16)) & 1) ? 1.0 : 0.82;
    const o = (y * W + x) * 4;
    rgba[o]     = clamp(Math.round((210 + glint * 45) * facet), 120, 255);
    rgba[o + 1] = clamp(Math.round((45  + glint * 185) * facet), 28, 245);
    rgba[o + 2] = clamp(Math.round((245 + glint * 10) * facet), 170, 255);
    rgba[o + 3] = 255;
  }
  return rgba;
}

function makeCrystalAuraTex() {
  // Soft radial violet-magenta-cyan star shimmer for ABR=1 additive semi-transparency (idx 0 = transparent!)
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - 31.5) / 30, dy = (y - 31.5) / 30;
    const r = Math.hypot(dx, dy);
    const star = Math.max(Math.exp(-Math.abs(dx) * 8) * Math.exp(-r * 2.2), Math.exp(-Math.abs(dy) * 8) * Math.exp(-r * 2.2));
    const halo = Math.max(0, 1 - r) * Math.max(0, 1 - r) * 0.65 + star * 0.55;
    const o = (y * W + x) * 4;
    if (halo < 0.08 || r > 0.96) {
      rgba[o] = 0; rgba[o + 1] = 0; rgba[o + 2] = 0; rgba[o + 3] = 0;
    } else {
      const k = clamp(halo, 0, 1);
      rgba[o]     = clamp(Math.round(140 * k), 12, 165);
      rgba[o + 1] = clamp(Math.round(58 * k), 8, 95);
      rgba[o + 2] = clamp(Math.round(195 * k), 18, 225);
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

function makeWumpaTex() {
  // Left 48px = juicy Wumpa fruit body gradient (yellow top -> orange mid -> crimson bottom);
  // Right 16px = top half brown stem, bottom half vibrant green leaf!
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    if (x < 48) {
      const t = y / (H - 1);
      const spec = Math.exp(-((x - 16) * (x - 16) / 70 + (y - 18) * (y - 18) / 70)) * 95;
      rgba[o]     = clamp(Math.round(lerp(255, 220, t) + spec), 20, 255);
      rgba[o + 1] = clamp(Math.round(lerp(225, 36, Math.pow(t, 0.85)) + spec * 0.8), 20, 255);
      rgba[o + 2] = clamp(Math.round(lerp(20, 58, t) + spec * 0.4), 14, 160);
      rgba[o + 3] = 255;
    } else if (y < 32) {
      // Brown stem
      rgba[o] = 128; rgba[o + 1] = 74; rgba[o + 2] = 24; rgba[o + 3] = 255;
    } else {
      // Crisp bright green Wumpa leaf with pale center vein
      const vein = Math.abs(x - 56) < 2 ? 45 : 0;
      rgba[o] = clamp(32 + vein, 16, 130);
      rgba[o + 1] = clamp(210 + vein, 140, 255);
      rgba[o + 2] = clamp(42 + vein * 0.4, 20, 110);
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

function makeGemTex() {
  // Sparkling cyan-emerald diamond gem!
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - 32) / 32, dy = (y - 32) / 32;
    const spec = Math.exp(-((dx + 0.2) * (dx + 0.2) * 9 + (dy + 0.2) * (dy + 0.2) * 9));
    const facet = ((Math.floor(x / 12) + Math.floor(y / 12)) & 1) ? 1.0 : 0.80;
    const o = (y * W + x) * 4;
    rgba[o]     = clamp(Math.round((78 + spec * 175) * facet), 42, 255);
    rgba[o + 1] = clamp(Math.round((235 + spec * 20) * facet), 155, 255);
    rgba[o + 2] = clamp(Math.round((195 + spec * 60) * facet), 125, 255);
    rgba[o + 3] = 255;
  }
  return rgba;
}

function makeRelicTex() {
  // Gleaming Gold Time Relic Ankh with vibrant sapphire-blue jewel center!
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - 32) / 32, dy = (y - 18) / 24;
    const isJewel = (dx * dx + dy * dy) < 0.14;
    const o = (y * W + x) * 4;
    if (isJewel) {
      rgba[o] = 45; rgba[o + 1] = 145; rgba[o + 2] = 255; rgba[o + 3] = 255;
    } else {
      const shimmer = 0.78 + 0.22 * Math.cos((x + y) * 0.16);
      rgba[o]     = clamp(Math.round(252 * shimmer), 165, 255);
      rgba[o + 1] = clamp(Math.round(202 * shimmer), 115, 240);
      rgba[o + 2] = clamp(Math.round(38  * shimmer), 18, 95);
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

// ============================================================================
// Sculpted 3D Meshes: C-R-A-S-H Letters & 3D Wumpa Fruit & Power Crystal+Aura
// ============================================================================
function build3DLetterMesh(letter, ti) {
  // Each letter built from clean bold extruded 3D blocks (X[-48..+48], Y[-52..+52], Z[-16..+16])!
  // Note: PS1 horizontal coordinate X: +X is viewer's LEFT, -X is viewer's RIGHT when facing -Z,
  // so mirror block X (x -> -x) so letters read LEFT-TO-RIGHT cleanly as they spin!
  const mb = new PsxMeshBuilder();
  const addBlk = (x0, y0, x1, y1) => {
    // Flip X for right-handed PS1 front view
    const ax0 = -x1, ax1 = -x0;
    const z0 = -15, z1 = 15;
    const flt = mb.addV(ax0, y0, z1), frt = mb.addV(ax1, y0, z1);
    const flb = mb.addV(ax0, y1, z1), frb = mb.addV(ax1, y1, z1);
    const blt = mb.addV(ax0, y0, z0), brt = mb.addV(ax1, y0, z0);
    const blb = mb.addV(ax0, y1, z0), brb = mb.addV(ax1, y1, z0);
    const fv0 = clamp(Math.round(((y0 + 52) / 104) * 58 + 3), 3, 61);
    const fv1 = clamp(Math.round(((y1 + 52) / 104) * 58 + 3), 3, 61);
    // Front & back faces use bright Crash flame gradient (u=4..44)
    mb.quad(frt, flt, frb, flb, ti, [4, fv0], [44, fv0], [4, fv1], [44, fv1], { outNormal: [0, 0, 1], rgb: [145, 145, 145] });
    mb.quad(blt, brt, blb, brb, ti, [4, fv0], [44, fv0], [4, fv1], [44, fv1], { outNormal: [0, 0, -1], rgb: [140, 140, 140] });
    // Sides use dark amber bevel (u=52..60)
    mb.quad(brt, frt, brb, frb, ti, [52, 4], [60, 4], [52, 60], [60, 60], { outNormal: [1, 0, 0], rgb: [115, 115, 115] });
    mb.quad(flt, blt, flb, blb, ti, [52, 4], [60, 4], [52, 60], [60, 60], { outNormal: [-1, 0, 0], rgb: [115, 115, 115] });
    mb.quad(blt, brt, flt, frt, ti, [52, 4], [60, 4], [52, 60], [60, 60], { outNormal: [0, -1, 0], rgb: [138, 138, 138] });
    mb.quad(flb, frb, blb, brb, ti, [52, 4], [60, 4], [52, 60], [60, 60], { outNormal: [0, 1, 0], rgb: [96, 96, 96] });
  };
  // Coordinates: x in [-46..+46] (left->right), y in [-52..+52] (top->bottom)
  if (letter === 'C') {
    addBlk(-44, -52, -16, 52);  // left stem
    addBlk(-16, -52, 44, -26);  // top bar
    addBlk(-16, 26, 44, 52);    // bottom bar
  } else if (letter === 'R') {
    addBlk(-44, -52, -16, 52);  // left stem
    addBlk(-16, -52, 42, -28);  // top bar
    addBlk(16, -28, 42, 4);     // upper right bowl
    addBlk(-16, -12, 24, 10);   // middle bar
    addBlk(12, 10, 44, 52);     // right leg
  } else if (letter === 'A') {
    addBlk(-44, -24, -18, 52);  // left leg
    addBlk(18, -24, 44, 52);    // right leg
    addBlk(-28, -52, 28, -24);  // top crown
    addBlk(-18, 2, 18, 24);     // crossbar
  } else if (letter === 'S') {
    addBlk(-42, -52, 42, -28);  // top bar
    addBlk(-42, -28, -14, -6);  // upper left
    addBlk(-42, -12, 42, 12);   // middle bar
    addBlk(14, 6, 42, 28);      // lower right
    addBlk(-42, 28, 42, 52);    // bottom bar
  } else if (letter === 'H') {
    addBlk(-44, -52, -16, 52);  // left stem
    addBlk(16, -52, 44, 52);    // right stem
    addBlk(-16, -14, 16, 14);   // crossbar
  }
  return mb;
}

function build3DWumpaFruitMesh(ti) {
  // Sculpted 8-sided 3D tropical Wumpa Fruit (Y-down: top=-56, bottom=+56, radius~58) + brown stem + curved green leaf!
  const mb = new PsxMeshBuilder();
  const rings = [
    { y: -46, r: 22, v: 6  },
    { y: -26, r: 54, v: 18 },
    { y:   2, r: 60, v: 34 },
    { y:  30, r: 48, v: 48 },
    { y:  52, r: 22, v: 58 },
  ];
  const SEGS = 8;
  const vTop = mb.addV(0, -56, 0);
  const vBot = mb.addV(0,  58, 0);
  const ringVs = rings.map(rg => {
    const arr = [];
    for (let s = 0; s < SEGS; s++) {
      const ang = (s / SEGS) * Math.PI * 2;
      // Subtle organic Wumpa lobe modulation
      const lobe = 1.0 + 0.06 * Math.cos(ang * 3);
      arr.push(mb.addV(Math.cos(ang) * rg.r * lobe, rg.y, Math.sin(ang) * rg.r * lobe));
    }
    return arr;
  });

  // Top cap
  for (let s = 0; s < SEGS; s++) {
    const s2 = (s + 1) % SEGS;
    const u0 = Math.round((s / SEGS) * 44 + 2), u1 = Math.round(((s + 1) / SEGS) * 44 + 2);
    mb.tri(vTop, ringVs[0][s], ringVs[0][s2], ti, [u0, 2], [u0, rings[0].v], [u1, rings[0].v], {
      outNormal: [0, -1, 0], rgb: [148, 148, 148],
    });
  }
  // Body bands
  for (let ri = 0; ri + 1 < rings.length; ri++) {
    for (let s = 0; s < SEGS; s++) {
      const s2 = (s + 1) % SEGS;
      const angMid = ((s + 0.5) / SEGS) * Math.PI * 2;
      const outN = [Math.cos(angMid), (rings[ri + 1].y + rings[ri].y) / 140, Math.sin(angMid)];
      const u0 = Math.round((s / SEGS) * 44 + 2), u1 = Math.round(((s + 1) / SEGS) * 44 + 2);
      const shade = clamp(Math.round(126 + 24 * Math.sin(angMid)), 105, 152);
      mb.quad(
        ringVs[ri][s], ringVs[ri][s2], ringVs[ri + 1][s], ringVs[ri + 1][s2],
        ti, [u0, rings[ri].v], [u1, rings[ri].v], [u0, rings[ri + 1].v], [u1, rings[ri + 1].v],
        { outNormal: outN, rgb: [shade, shade, shade] }
      );
    }
  }
  // Bottom cap
  const lastR = ringVs[rings.length - 1];
  for (let s = 0; s < SEGS; s++) {
    const s2 = (s + 1) % SEGS;
    const u0 = Math.round((s / SEGS) * 44 + 2), u1 = Math.round(((s + 1) / SEGS) * 44 + 2);
    mb.tri(lastR[s], vBot, lastR[s2], ti, [u0, 58], [u0, 62], [u1, 58], {
      outNormal: [0, 1, 0], rgb: [108, 108, 108],
    });
  }
  // Brown 3D stem sticking out of the top (-54 -> -78)
  mb.box(-5, -78, -5, 5, -48, 5, ti, 50, 4, 62, 28, { rgbFront: [130, 130, 130], rgbSide: [110, 110, 110] });
  // Vibrant 3D curved green Wumpa leaf on upper-right! (double-sided!)
  const l0 = mb.addV(3, -66, 0);
  const l1 = mb.addV(28, -80, 16);
  const l2 = mb.addV(28, -80, -16);
  const l3 = mb.addV(58, -68, 0);
  mb.quad(l0, l1, l2, l3, ti, [50, 36], [62, 36], [50, 60], [62, 60], {
    outNormal: [0, -1, 0], doubleSided: true, rgb: [148, 148, 148],
  });
  return mb;
}

function buildPowerCrystalWithAura(objCry, tiCry, tiAura, heightSpan = 215) {
  const mb = buildMeshFromCrash3Obj(objCry, tiCry, heightSpan, { shadeMode: 'planar', rgbScale: 1.05 });
  // Add 3 crossed double-sided PS1 hardware Additive Semi-Transparent (ABR=1, fl=0x18C3, gpu=0x2e) shimmering violet aura planes!
  const R = Math.round(heightSpan * 0.48), H = Math.round(heightSpan * 0.68);
  for (let k = 0; k < 3; k++) {
    const ang = (k * Math.PI) / 3;
    const dx = Math.cos(ang) * R, dz = Math.sin(ang) * R;
    const p0 = mb.addV(-dx, -H, -dz), p1 = mb.addV(dx, -H, dz);
    const p2 = mb.addV(-dx,  H, -dz), p3 = mb.addV(dx,  H, dz);
    mb.quad(p0, p1, p2, p3, tiAura, [1, 1], [62, 1], [1, 62], [62, 62], {
      fl: 0x18C3, gpu: 0x2e, rgb: [128, 128, 128], doubleSided: true,
      outNormal: [-Math.sin(ang), 0, Math.cos(ang)],
    });
  }
  return mb;
}

// ============================================================================
// Assemble Standalone crash_it.psx (Exact 14-Mesh items.psx Schema!)
// ============================================================================
function buildCrashItemsPsx(objs3d) {
  // Exact 14 mesh hashes of modded items.psx (0..12 original THPS2 + 13 Lulao X fallback)
  const ITEMS_HASHES = [
    0x6f0f6b9f, // M[0]  -> 3D Red TNT Crate
    0xf6063a25, // M[1]  -> 3D Neon-Green NITRO Crate
    0x81010ab3, // M[2]  -> 3D Checkpoint "C" Crate
    0x311d55d4, // M[3]  -> 3D Letter "C" (replaces S)
    0x2328a71c, // M[4]  -> 3D Letter "R" (replaces K)
    0x2ebf22ca, // M[5]  -> 3D Letter "A" (replaces A)
    0x34524351, // M[6]  -> 3D Letter "S" (replaces T)
    0x29b68a16, // M[7]  -> 3D Letter "H" (replaces E)
    0x7c1b2c4a, // M[8]  -> 3D Power Crystal (Cry1G) + Violet-Cyan Aura! (Secret Tape!)
    0xcc4e141f, // M[9]  -> 3D Wumpa Fruit ($50 Cash!)
    0x260f4f80, // M[10] -> 3D Warp Gem (Ge10G) ($100 Cash!)
    0x694ed947, // M[11] -> 3D Gold Time Relic (Rel1G) ($250 Cash!)
    0x4605a8d0, // M[12] -> 3D Aku Aku Mask (WD10G) (Stat Point!)
    0x58585858, // M[13] -> 3D Letter "H" fallback
  ];

  // Build all 10 4-bit 64x64 Crash 3 textures (total 20,480 B!)
  const akuCrop = cropObjMatTo64(objs3d.aku);
  const texSpecs = [
    { name: 'cr_tnt',   ...make4BitTex(64, 64, drawCrateFaceTexture('TNT'), false) },    // T[0]
    { name: 'cr_nitro', ...make4BitTex(64, 64, drawCrateFaceTexture('NITRO'), false) },  // T[1]
    { name: 'cr_chk',   ...make4BitTex(64, 64, drawCrateFaceTexture('CHK'), false) },    // T[2]
    { name: 'cr_ltr',   ...make4BitTex(64, 64, makeCrashLetterTex(), false) },           // T[3]
    { name: 'cr_crys',  ...make4BitTex(64, 64, makeCrystalTex(), false) },               // T[4]
    { name: 'cr_aura',  ...make4BitTex(64, 64, makeCrystalAuraTex(), true) },            // T[5] ABR=1!
    { name: 'cr_wumpa', ...make4BitTex(64, 64, makeWumpaTex(), false) },                 // T[6]
    { name: 'cr_gem',   ...make4BitTex(64, 64, makeGemTex(), false) },                   // T[7]
    { name: 'cr_relic', ...make4BitTex(64, 64, makeRelicTex(), false) },                 // T[8]
    { name: 'cr_aku',   ...make4BitTex(64, 64, akuCrop.rgba, false) },                   // T[9]
  ];

  // Build all 14 3D collectible meshes!
  const mkCrate = ti => {
    const mb = new PsxMeshBuilder();
    mb.box(-56, -56, -56, 56, 56, 56, ti, 1, 1, 62, 62);
    return mb;
  };
  const meshBuilders = [
    mkCrate(0),                                                                                   // M[0] TNT Crate
    mkCrate(1),                                                                                   // M[1] Nitro Crate
    mkCrate(2),                                                                                   // M[2] Checkpoint Crate
    build3DLetterMesh('C', 3),                                                                    // M[3] C
    build3DLetterMesh('R', 3),                                                                    // M[4] R
    build3DLetterMesh('A', 3),                                                                    // M[5] A
    build3DLetterMesh('S', 3),                                                                    // M[6] S
    build3DLetterMesh('H', 3),                                                                    // M[7] H
    buildPowerCrystalWithAura(objs3d.cry, 4, 5, 210),                                             // M[8] Power Crystal + Aura!
    build3DWumpaFruitMesh(6),                                                                     // M[9] 3D Wumpa Fruit!
    buildMeshFromCrash3Obj(objs3d.gem, 7, 130, { shadeMode: 'planar', rgbScale: 1.08 }),          // M[10] 3D Warp Gem!
    buildMeshFromCrash3Obj(objs3d.rel, 8, 175, { shadeMode: 'planar', rgbScale: 1.05 }),          // M[11] 3D Gold Time Relic!
    buildMeshFromCrash3Obj(objs3d.aku, 9, 160, { doubleSided: true, uvBox: akuCrop.uvBox }),      // M[12] 3D Aku Aku Mask!
    build3DLetterMesh('H', 3),                                                                    // M[13] H fallback
  ];

  const meshBufs = meshBuilders.map(mb => mb.buildBuffer());
  const numObjs = meshBufs.length; // 14 SObject records matching items.psx structure (modelIndex = 0..13, u32 = 0)!
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
  for (let i = 0; i < numObjs; i++) {
    topHdr.writeUInt16LE(i, 12 + i * 36 + 22); // SObject.modelIndex = i
  }
  topHdr.writeUInt32LE(numMeshes, 12 + numObjs * 36);
  meshOffs.forEach((o, i) => topHdr.writeUInt32LE(o, 12 + numObjs * 36 + 4 + i * 4));

  // Metadata: end tag (0xFFFFFFFF), meshHashes[14], texHashes[10], pal16[10], pal256[0], texTable[10], texPayloads
  const endTag = Buffer.alloc(4); endTag.writeUInt32LE(0xFFFFFFFF, 0);
  const mhBuf = Buffer.alloc(numMeshes * 4);
  ITEMS_HASHES.forEach((h, i) => mhBuf.writeUInt32LE(h, i * 4));
  const thBuf = Buffer.alloc(4 + texSpecs.length * 4);
  thBuf.writeUInt32LE(texSpecs.length, 0);
  texSpecs.forEach((t, i) => thBuf.writeUInt32LE(psxLib.nsHash(t.name), 4 + i * 4));

  const p16Buf = Buffer.alloc(4 + texSpecs.length * 36);
  p16Buf.writeUInt32LE(texSpecs.length, 0);
  texSpecs.forEach((t, i) => {
    const palId = (0xC3A50100 + i) >>> 0;
    t.palId = palId;
    p16Buf.writeUInt32LE(palId, 4 + i * 36);
    t.palBytes.copy(p16Buf, 4 + i * 36 + 4);
  });
  const p256Buf = Buffer.alloc(4, 0);

  const preTexLen = endTag.length + mhBuf.length + thBuf.length + p16Buf.length + p256Buf.length;
  const texTblBuf = Buffer.alloc(4 + texSpecs.length * 4);
  texTblBuf.writeUInt32LE(texSpecs.length, 0);
  let tCur = ptrMeta + preTexLen + texTblBuf.length;
  const texPayloads = [];
  texSpecs.forEach((t, i) => {
    texTblBuf.writeUInt32LE(tCur, 4 + i * 4);
    const th = Buffer.alloc(20);
    th.writeUInt32LE(0, 0);
    th.writeUInt32LE(16, 4);
    th.writeUInt32LE(t.palId, 8);
    th.writeUInt32LE(i, 12);
    th.writeUInt16LE(t.w, 16);
    th.writeUInt16LE(t.h, 18);
    const blk = Buffer.concat([th, t.pxBytes]);
    texPayloads.push(blk);
    tCur += blk.length;
  });

  const outBuf = Buffer.concat([topHdr, ...meshBufs, endTag, mhBuf, thBuf, p16Buf, p256Buf, texTblBuf, ...texPayloads]);
  fs.writeFileSync(path.join(OUT_DIR, 'crash_it.psx'), outBuf);
  console.log(`  [crash_it.psx] ${outBuf.length} B (${numMeshes} meshes, ${texSpecs.length} 4bpp texs — MENOR que items.psx original 40,784 B!)`);
  return { outBuf, texSpecs };
}

// ============================================================================
// Replace Specific Collectible Meshes Inside Existing Level *_o.psx Banks
// (for Crash-Only Hangar & THPS1 Level Swaps in THPS1.WAD!)
// ============================================================================
function replaceMeshesAndAppendTexsInPsx(origBuf, replacements) {
  // replacements: [{ meshHash, buildMeshFn(newTexIdxList), newTexs: [{ name, w, h, palBytes, pxBytes }] }]
  const info = psxLib.parsePsxStructure(origBuf);
  const numObjs = info.objs.length;
  const numMeshes = info.numMeshes;

  // Parse existing metadata sections verbatim
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

  // Extract raw original mesh buffers
  const meshBufs = [];
  for (let mi = 0; mi < numMeshes; mi++) {
    const s = info.meshOffs[mi];
    const e = (mi + 1 < numMeshes) ? info.meshOffs[mi + 1] : info.ptrMeta;
    meshBufs.push(Buffer.from(origBuf.subarray(s, e)));
  }

  // Apply replacements & append new 4bpp textures cleanly!
  let nextPalId = 0xC3B50001;
  for (const rep of replacements) {
    const mi = meshHashes.indexOf(rep.meshHash);
    if (mi < 0) throw new Error(`Mesh hash 0x${rep.meshHash.toString(16)} nao encontrado!`);
    const newTexIds = [];
    for (const nt of rep.newTexs) {
      const ti = texHashes.length;
      texHashes.push(psxLib.nsHash(nt.name));
      const palId = (nextPalId++) >>> 0;
      pal16List.push({ palId, bytes: nt.palBytes });
      const th = Buffer.alloc(20);
      th.writeUInt32LE(0, 0);
      th.writeUInt32LE(16, 4);
      th.writeUInt32LE(palId, 8);
      th.writeUInt32LE(ti, 12);
      th.writeUInt16LE(nt.w, 16);
      th.writeUInt16LE(nt.h, 18);
      texBlocks.push(Buffer.concat([th, nt.pxBytes]));
      newTexIds.push(ti);
    }
    meshBufs[mi] = rep.buildMeshFn(newTexIds).buildBuffer();
  }

  // Reassemble valid .PSX
  const hdrSize = 12 + numObjs * 36 + 4 + numMeshes * 4;
  const topHdr = Buffer.from(origBuf.subarray(0, hdrSize));
  let cur = hdrSize;
  for (let i = 0; i < numMeshes; i++) {
    topHdr.writeUInt32LE(cur, 12 + numObjs * 36 + 4 + i * 4);
    cur += meshBufs[i].length;
  }
  const ptrMeta = cur;
  topHdr.writeUInt32LE(ptrMeta, 4);

  // CRITICAL: Relocate SObject[i].rgbOff (+32) whenever ptrMeta shifts (preserves RGBs vertex color pointers for all untouched level objects!)
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

function buildCrashLevelObjectSwaps(objs3d) {
  const texTnt   = { name: 'c3_tnt',   ...make4BitTex(64, 64, drawCrateFaceTexture('TNT'), false) };
  const texAkuC  = cropObjMatTo64(objs3d.aku);
  const texAku   = { name: 'c3_aku',   ...make4BitTex(64, 64, texAkuC.rgba, false) };
  const texUkaC  = cropObjMatTo64(objs3d.uka);
  const texUka   = { name: 'c3_uka',   ...make4BitTex(64, 64, texUkaC.rgba, false) };
  const texRel   = { name: 'c3_rel',   ...make4BitTex(64, 64, makeRelicTex(), false) };
  const texGem   = { name: 'c3_gem',   ...make4BitTex(64, 64, makeGemTex(), false) };
  const texCry   = { name: 'c3_cry',   ...make4BitTex(64, 64, makeCrystalTex(), false) };
  const texAura  = { name: 'c3_aura',  ...make4BitTex(64, 64, makeCrystalAuraTex(), true) };

  const built = [];

  // 1. Hangar (skhan_o.psx -> cr_han_o.psx):
  //    - 5 Pilot Wings (0xd0c4f2da) -> 3D Aku Aku Masks (WD10G)!
  //    - 5 Barrels (0x4eb2c689)     -> 3D Crash 3 Red TNT Crates!
  const origHanO = psxLib.getOrigWadSlice('skhan_o.psx');
  const crHanO = replaceMeshesAndAppendTexsInPsx(origHanO, [
    {
      meshHash: 0xd0c4f2da,
      newTexs: [texAku],
      buildMeshFn: ([ti]) => buildMeshFromCrash3Obj(objs3d.aku, ti, 190, { doubleSided: true, uvBox: texAkuC.uvBox }),
    },
    {
      meshHash: 0x4eb2c689,
      newTexs: [texTnt],
      buildMeshFn: ([ti]) => {
        const mb = new PsxMeshBuilder();
        // Hangar barrels sit on floor Y=0 going UP to Y=-300 (height ~300, width ~190)
        mb.box(-105, -260, -105, 105, 0, 105, ti, 1, 1, 62, 62);
        return mb;
      },
    },
  ]);
  fs.writeFileSync(path.join(OUT_DIR, 'cr_han_o.psx'), crHanO);
  built.push(['cr_han_o.psx', crHanO.length]);

  // 2. ALL 6 THPS1 Career Levels' G5 custom collectibles!
  const thps1Specs = [
    {
      out: 'cr_ware.psx', src: 'skware_o.psx', hash: 0x5111A101,
      newTexs: [texTnt],
      buildMeshFn: ([ti]) => { const mb = new PsxMeshBuilder(); mb.box(-80, -80, -80, 80, 80, 80, ti, 1, 1, 62, 62); return mb; },
    },
    {
      out: 'cr_schl.psx', src: 'skschl_o.psx', hash: 0x5112A102,
      newTexs: [texAku],
      buildMeshFn: ([ti]) => buildMeshFromCrash3Obj(objs3d.aku, ti, 195, { doubleSided: true, uvBox: texAkuC.uvBox }),
    },
    {
      out: 'cr_mall.psx', src: 'skmall_o.psx', hash: 0x5113A103,
      newTexs: [texRel],
      buildMeshFn: ([ti]) => buildMeshFromCrash3Obj(objs3d.rel, ti, 210, { shadeMode: 'planar', rgbScale: 1.05 }),
    },
    {
      out: 'cr_down.psx', src: 'skdown_o.psx', hash: 0x5115A104,
      newTexs: [texGem],
      buildMeshFn: ([ti]) => buildMeshFromCrash3Obj(objs3d.gem, ti, 175, { shadeMode: 'planar', rgbScale: 1.08 }),
    },
    {
      out: 'cr_jam.psx', src: 'skjam_o.psx', hash: 0x5116A105,
      newTexs: [texUka],
      buildMeshFn: ([ti]) => buildMeshFromCrash3Obj(objs3d.uka, ti, 195, { doubleSided: true, uvBox: texUkaC.uvBox }),
    },
    {
      out: 'cr_sf.psx', src: 'sksf_o.psx', hash: 0x5118A106,
      newTexs: [texCry, texAura],
      buildMeshFn: ([tiC, tiA]) => buildPowerCrystalWithAura(objs3d.cry, tiC, tiA, 225),
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
// Render Visual Verification Contact Sheet of ALL crash_it.psx 3D Collectibles!
// ============================================================================
function renderCrashItemsPreview(psxBuf) {
  const showMeshes = [
    { mi: 0, label: 'TNT CRATE' },
    { mi: 1, label: 'NITRO CRATE' },
    { mi: 2, label: 'CHK CRATE' },
    { mi: 3, label: 'LETTER C' },
    { mi: 4, label: 'LETTER R' },
    { mi: 5, label: 'LETTER A' },
    { mi: 6, label: 'LETTER S' },
    { mi: 7, label: 'LETTER H' },
    { mi: 8, label: 'CRYSTAL+AURA' },
    { mi: 9, label: 'WUMPA $50' },
    { mi: 10, label: 'GEM $100' },
    { mi: 11, label: 'RELIC $250' },
    { mi: 12, label: 'AKU STAT' },
  ];
  const cellW = 160, cellH = 160, cols = 5, rows = 3;
  const W = cellW * cols, H = cellH * rows;
  const sheet = Buffer.alloc(W * H * 4, 24);
  for (let i = 0; i < W * H; i++) sheet[i * 4 + 3] = 255;

  showMeshes.forEach((item, idx) => {
    const gx = idx % cols, gy = Math.floor(idx / cols);
    const sc = item.mi === 8 ? 0.42 : (item.mi >= 3 && item.mi <= 7) ? 0.85 : 0.62;
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
  console.log('=== [mod_crash_collectibles] Compilando coletaveis 3D exclusivos do Crash B. ===');
  const manifest = JSON.parse(fs.readFileSync(path.join(OBJ_3D_ROOT, 'tgeo_models_manifest.json'), 'utf8'));
  const loadObj = ename => {
    const e = manifest.find(x => x.ename === ename);
    if (!e) throw new Error(`Modelo Crash 3 ausente: ${ename}`);
    return parseObjFile(path.join(OBJ_3D_ROOT, e.obj));
  };
  const objs3d = {
    cry: loadObj('Cry1G'),
    gem: loadObj('Ge10G'),
    rel: loadObj('Rel1G'),
    aku: loadObj('WD10G'),
    uka: loadObj('Uk17G'),
  };

  const { outBuf } = buildCrashItemsPsx(objs3d);
  renderCrashItemsPreview(outBuf);
  buildCrashLevelObjectSwaps(objs3d);
  console.log('=== [mod_crash_collectibles] Concluido com sucesso! ===');
}

if (require.main === module) {
  buildAllCrashCollectibles();
}

module.exports = { buildAllCrashCollectibles };
