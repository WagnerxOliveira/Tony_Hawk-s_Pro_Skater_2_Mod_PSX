#!/usr/bin/env node
'use strict';

/**
 * THPS1-in-THPS2 Custom 3D Satirical Goal Objects Sculptor & sk*_o.psx Injector
 *
 * Procedurally sculpts 6 bespoke, low-poly PS1 3D geometric collectibles + hand-crafted
 * 4-bit 16-color PS1 textures (strictly obeying PS1 hardware invariants: 0x7C1F magenta
 * alpha key, zero opaque 0x0000 black, maxDrawDist = 0xFFFF7FFF, < +4.5 KB per file)
 * and cleanly appends each mesh into its level's sk*_o.psx for THPS1.WAD:
 *
 *   [11] Warehouse    (skware_o.psx) -> 0x5111A101 : 3D Mandioca da Dilma (curved root + sliced tip + 3 leaves + band)
 *   [12] School       (skschl_o.psx) -> 0x5112A102 : 3D Triplex do Guaruja (3-story condo + balconies + rooftop pool & sign)
 *   [13] Mall         (skmall_o.psx) -> 0x5113A103 : 3D Mala do Mensalao (ajar executive briefcase bursting with banknotes)
 *   [15] Downtown     (skdown_o.psx) -> 0x5115A104 : 3D Cofre do Escandalo INSS (armored vault + dial wheel + overflowing coins)
 *   [16] Downhill Jam (skjam_o.psx)  -> 0x5116A105 : 3D Pedalinho de Atibaia (swan pedal boat + canopy + paddles)
 *   [18] Streets SF   (sksf_o.psx)   -> 0x5118A106 : 3D Picanha da Promessa (marbled steak + fat cap + skewer + tag)
 *
 * Also renders a 3D multi-angle verification contact sheet to build/thps1_custom_objects_preview.png!
 */

const fs = require('fs');
const path = require('path');
const psxLib = require('./psx_skater_lib');

const ROOT = psxLib.rootDir;
const FASES_DIR = path.join(ROOT, 'EXTRAIDOS_ARQUIVOS_THPS1', '02_Fases_do_Jogo');
const STAGE_DIR = path.join(ROOT, 'build', 'thps1_converted');
const PREVIEW_PNG = path.join(ROOT, 'build', 'thps1_custom_objects_preview.png');

const clamp = psxLib.clamp;
const lerp = psxLib.lerp;

const THPS1_OBJECT_SPECS = [
  { id: 11, key: 'mandioca',  dir: '01_Warehouse_WoodlandHills', oPsx: 'skware_o.psx', meshHash: 0x5111A101, title: 'MANDIOCA DA DILMA' },
  { id: 12, key: 'triplex',   dir: '02_School_Miami',            oPsx: 'skschl_o.psx', meshHash: 0x5112A102, title: 'TRIPLEX GUARUJA'   },
  { id: 13, key: 'mensalao',  dir: '03_Mall_NewYork',            oPsx: 'skmall_o.psx', meshHash: 0x5113A103, title: 'MALA DO MENSALAO'  },
  { id: 15, key: 'inss',      dir: '05_Downtown_Minneapolis',    oPsx: 'skdown_o.psx', meshHash: 0x5115A104, title: 'COFRE DO INSS'     },
  { id: 16, key: 'pedalinho', dir: '06_DownhillJam_Phoenix',     oPsx: 'skjam_o.psx',  meshHash: 0x5116A105, title: 'PEDALINHO ATIBAIA' },
  { id: 18, key: 'picanha',   dir: '08_Streets_SanFrancisco',    oPsx: 'sksf_o.psx',   meshHash: 0x5118A106, title: 'PICANHA PROMESSA'  },
];

// ============================================================================
// 1. Crisp 2D Pixel-Art Canvas + 5x7 Font + Exact 4-Bit PS1 Palette Encoder
// ============================================================================

const FONT_3X5 = {
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
  'K': ['101','101','110','101','101'],
  'L': ['100','100','100','100','111'],
  'M': ['101','111','111','101','101'],
  'N': ['110','101','101','101','101'],
  'O': ['010','101','101','101','010'],
  'P': ['110','101','110','100','100'],
  'Q': ['010','101','101','111','011'],
  'R': ['110','101','110','101','101'],
  'S': ['011','100','010','001','110'],
  'T': ['111','010','010','010','010'],
  'U': ['101','101','101','101','111'],
  'V': ['101','101','101','101','010'],
  'W': ['101','101','111','111','101'],
  'X': ['101','101','010','101','101'],
  'Y': ['101','101','010','010','010'],
  'Z': ['111','001','010','100','111'],
  '0': ['111','101','101','101','111'],
  '1': ['010','110','010','010','111'],
  '2': ['110','001','010','100','111'],
  '3': ['110','001','010','001','110'],
  '4': ['101','101','111','001','001'],
  '5': ['111','100','110','001','110'],
  '$': ['010','111','100','111','010'],
  '!': ['010','010','010','000','010'],
  '-': ['000','000','111','000','000'],
  ' ': ['000','000','000','000','000'],
};

class IndexedCanvas {
  constructor(w, h, paletteRgb, transparentIdx0 = false) {
    this.w = w;
    this.h = h;
    this.transparentIdx0 = transparentIdx0;
    this.px = new Uint8Array(w * h); // palette indices 0..15
    if (paletteRgb.length > 16) throw new Error('4-bit palette max 16 colors');
    this.palette = paletteRgb.slice();
    while (this.palette.length < 16) this.palette.push([16, 16, 16]);
  }
  set(x, y, ci) {
    const ix = Math.round(x), iy = Math.round(y);
    if (ix >= 0 && ix < this.w && iy >= 0 && iy < this.h) {
      this.px[iy * this.w + ix] = ci & 0x0F;
    }
  }
  fill(ci) { this.px.fill(ci & 0x0F); }
  rect(x, y, rw, rh, ci) {
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) this.set(i, j, ci);
  }
  frame(x, y, rw, rh, ci) {
    for (let i = x; i < x + rw; i++) { this.set(i, y, ci); this.set(i, y + rh - 1, ci); }
    for (let j = y; j < y + rh; j++) { this.set(x, j, ci); this.set(x + rw - 1, j, ci); }
  }
  circle(cx, cy, r, ci) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) this.set(x, y, ci);
      }
    }
  }
  line(x0, y0, x1, y1, ci) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.set(lerp(x0, x1, t), lerp(y0, y1, t), ci);
    }
  }
  text3x5(str, x, y, ci, scale = 1, shadowCi = -1) {
    const up = str.toUpperCase();
    let cx = x;
    for (let k = 0; k < up.length; k++) {
      const g = FONT_3X5[up[k]] || FONT_3X5[' '];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 3; c++) {
          if (g[r][c] === '1') {
            if (shadowCi >= 0) this.rect(cx + c * scale + 1, y + r * scale + 1, scale, scale, shadowCi);
            this.rect(cx + c * scale, y + r * scale, scale, scale, ci);
          }
        }
      }
      cx += 4 * scale;
    }
  }
  textCentered3x5(str, boxX, boxW, y, ci, scale = 1, shadowCi = -1) {
    const tw = str.length * 4 * scale - scale;
    this.text3x5(str, boxX + Math.floor((boxW - tw) / 2), y, ci, scale, shadowCi);
  }
  toPs1() {
    // Convert palette to exact PS1 BGR555 (0x7C1F at slot 0 when transparent, NEVER 0x0000 opaque!)
    const palBuf = Buffer.alloc(32);
    const palRgb = [];
    for (let i = 0; i < 16; i++) {
      let bgr;
      if (i === 0 && this.transparentIdx0) {
        bgr = 0x7C1F;
        palRgb.push([255, 0, 255, 0]);
      } else {
        const [r, g, b] = this.palette[i];
        const r5 = clamp(Math.round(r * 31 / 255), 0, 31);
        const g5 = clamp(Math.round(g * 31 / 255), 0, 31);
        const b5 = clamp(Math.round(b * 31 / 255), 0, 31);
        bgr = (b5 << 10) | (g5 << 5) | r5;
        if (bgr === 0x0000) bgr = 0x0421;
        if (bgr === 0x7C1F) bgr = (31 << 10) | (1 << 5) | 31;
        palRgb.push([Math.round((bgr & 31) * 255 / 31), Math.round(((bgr >> 5) & 31) * 255 / 31), Math.round(((bgr >> 10) & 31) * 255 / 31), 255]);
      }
      palBuf.writeUInt16LE(bgr, i * 2);
    }
    // Pack 4-bit nibbles (lo = even x, hi = odd x)
    const stride = Math.ceil(this.w / 2);
    const packed = Buffer.alloc(stride * this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x += 2) {
        const lo = this.px[y * this.w + x] & 0x0F;
        const hi = (x + 1 < this.w ? this.px[y * this.w + x + 1] : 0) & 0x0F;
        packed[y * stride + (x >> 1)] = lo | (hi << 4);
      }
    }
    return { w: this.w, h: this.h, palBuf, packed, palRgb, px: this.px };
  }
}

// ============================================================================
// 2. Low-Poly 3D Mesh Builder (Neversoft PS1 0x00020004 Binary Format)
// ============================================================================

class MeshBuilder {
  constructor() {
    this.verts = [];  // [x, y, z]
    this.norms = [];  // [nx, ny, nz] in [-4096..4096]
    this.faces = [];  // { fl, v:[a,b,c,d], rgb:[r,g,b,0], ni, ti, uv:[u0,v0,u1,v1,u2,v2,u3,v3] }
  }
  addV(x, y, z) {
    this.verts.push([Math.round(x), Math.round(y), Math.round(z)]);
    return this.verts.length - 1;
  }
  addN(nx, ny, nz) {
    const len = Math.hypot(nx, ny, nz) || 1;
    const fx = clamp(Math.round((nx / len) * 4096), -4096, 4096);
    const fy = clamp(Math.round((ny / len) * 4096), -4096, 4096);
    const fz = clamp(Math.round((nz / len) * 4096), -4096, 4096);
    for (let i = 0; i < this.norms.length; i++) {
      const n = this.norms[i];
      if (Math.abs(n[0] - fx) < 64 && Math.abs(n[1] - fy) < 64 && Math.abs(n[2] - fz) < 64) return i;
    }
    this.norms.push([fx, fy, fz]);
    return this.norms.length - 1;
  }
  // Emit a 100% PS1-hardware-verified full-quad POLY_FT4 (fl = 0x2003: full 4-vertex quad, direct pure RGB
  // with ZERO RGBs-chunk lookup and ZERO bit-0x10 triangle clipping!).
  // Auto-orients Z-order [v0,v1,v2,v3] to satisfy exact PS1 front-facing winding law:
  //   dot(cross(p1 - p0, p2 - p0), outNormal) < 0
  // When doubleSided=true (thin cutout planes like leaves), emits BOTH outward and inward 0x2003 quads!
  quad(v0, v1, v2, v3, ti, u0, vT0, u1, vT1, {
    doubleSided = false,
    additive = false,
    rgb = [132, 132, 132],
    outNormal = null,
  } = {}) {
    const p0 = this.verts[v0], p1 = this.verts[v1], p2 = this.verts[v2];
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1], ez = p1[2] - p0[2];
    const fx = p2[0] - p0[0], fy = p2[1] - p0[1], fz = p2[2] - p0[2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    let q = [v0, v1, v2, v3];
    let uv = [u0, vT0, u1, vT0, u0, vT1, u1, vT1];
    if (outNormal) {
      const dot = nx * outNormal[0] + ny * outNormal[1] + nz * outNormal[2];
      if (dot >= 0) {
        q = [v1, v0, v3, v2];
        uv = [u1, vT0, u0, vT0, u1, vT1, u0, vT1];
      }
      nx = outNormal[0]; ny = outNormal[1]; nz = outNormal[2];
    }
    const ni = this.addN(nx, ny, nz);
    const fl = additive ? 0x10C3 : 0x2003;
    this.faces.push({
      fl,
      v: q,
      rgb: [rgb[0], rgb[1], rgb[2], 0x2c],
      ni,
      ti,
      uv,
    });
    if (doubleSided) {
      const niBack = this.addN(-nx, -ny, -nz);
      this.faces.push({
        fl,
        v: [q[1], q[0], q[3], q[2]],
        rgb: [rgb[0], rgb[1], rgb[2], 0x2c],
        ni: niBack,
        ti,
        uv: [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]],
      });
    }
  }
  // Explicit 3-vertex triangle (collapsed-D FT4 with fl=0x2003, pure direct RGB & exact outward PS1 winding!)
  tri(v0, v1, v2, ti, u0, vt0, u1, vt1, u2, vt2, { rgb = [132, 132, 132], outNormal = null } = {}) {
    const p0 = this.verts[v0], p1 = this.verts[v1], p2 = this.verts[v2];
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1], ez = p1[2] - p0[2];
    const fx = p2[0] - p0[0], fy = p2[1] - p0[1], fz = p2[2] - p0[2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    let v = [v0, v1, v2, v2];
    let uv = [u0, vt0, u1, vt1, u2, vt2, u2, vt2];
    if (outNormal) {
      const dot = nx * outNormal[0] + ny * outNormal[1] + nz * outNormal[2];
      if (dot >= 0) {
        v = [v1, v0, v2, v2];
        uv = [u1, vt1, u0, vt0, u2, vt2, u2, vt2];
      }
      nx = outNormal[0]; ny = outNormal[1]; nz = outNormal[2];
    }
    const ni = this.addN(nx, ny, nz);
    this.faces.push({
      fl: 0x2003,
      v,
      rgb: [rgb[0], rgb[1], rgb[2], 0x2c],
      ni,
      ti,
      uv,
    });
  }
  // Helper: axis-aligned 3D box (8 verts, 6 outward-wound fl=0x2003 FT4 quads) with EXACT PS1 right-handed L->R text orientation!
  box(x0, y0, z0, x1, y1, z1, ti, uvMap, opts = {}) {
    const flt = this.addV(x0, y0, z1), frt = this.addV(x1, y0, z1);
    const flb = this.addV(x0, y1, z1), frb = this.addV(x1, y1, z1);
    const blt = this.addV(x0, y0, z0), brt = this.addV(x1, y0, z0);
    const blb = this.addV(x0, y1, z0), brb = this.addV(x1, y1, z0);
    const u = (k) => uvMap[k] || uvMap.all;
    // Every face gets its exact outward normal -> auto-wound to PS1 dot(cross, outN) < 0!
    if (u('front')) { const [a,b,c,d] = u('front'); this.quad(frt, flt, frb, flb, ti, a, b, c, d, { ...opts, outNormal: [ 0,  0,  1], rgb: [138,138,138] }); }
    if (u('back'))  { const [a,b,c,d] = u('back');  this.quad(blt, brt, blb, brb, ti, a, b, c, d, { ...opts, outNormal: [ 0,  0, -1], rgb: [134,134,134] }); }
    if (u('right')) { const [a,b,c,d] = u('right'); this.quad(brt, frt, brb, frb, ti, a, b, c, d, { ...opts, outNormal: [ 1,  0,  0], rgb: [118,118,118] }); }
    if (u('left'))  { const [a,b,c,d] = u('left');  this.quad(flt, blt, flb, blb, ti, a, b, c, d, { ...opts, outNormal: [-1,  0,  0], rgb: [118,118,118] }); }
    if (u('top'))   { const [a,b,c,d] = u('top');   this.quad(blt, brt, flt, frt, ti, a, b, c, d, { ...opts, outNormal: [ 0, -1,  0], rgb: [148,148,148] }); }
    if (u('bot'))   { const [a,b,c,d] = u('bot');   this.quad(flb, frb, blb, brb, ti, a, b, c, d, { ...opts, outNormal: [ 0,  1,  0], rgb: [ 96, 96, 96] }); }
  }
  buildBuffer() {
    const nV = this.verts.length, nN = this.norms.length, nF = this.faces.length;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9, maxR = 0;
    for (const [x, y, z] of this.verts) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
      const r = Math.hypot(x, y, z);
      if (r > maxR) maxR = r;
    }
    const rad = Math.ceil(maxR * 1.06) * 4096;
    const buf = Buffer.alloc(28 + nV * 8 + nN * 8 + nF * 28, 0);
    buf.writeUInt16LE(0x0008, 0);
    buf.writeUInt16LE(nV, 2);
    buf.writeUInt16LE(nN, 4);
    buf.writeUInt16LE(nF, 6);
    buf.writeUInt32LE(rad >>> 0, 8);
    buf.writeInt16LE(x1, 12); buf.writeInt16LE(x0, 14);
    buf.writeInt16LE(y1, 16); buf.writeInt16LE(y0, 18);
    buf.writeInt16LE(z1, 20); buf.writeInt16LE(z0, 22);
    buf.writeUInt32LE(0xFFFF7FFF, 24); // NEVER vanish at distance!
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
    return { buf, nV, nN, nF, bbox: [x0, x1, y0, y1, z0, z1] };
  }
}

// ============================================================================
// 3. SIX BESPOKE SCULPTED 3D SATIRICAL OBJECTS + 4-BIT PIXEL-ART TEXTURES!
// ============================================================================

/**
 * [11] WAREHOUSE -> 3D MANDIOCA DA DILMA (Curved organic cassava root + sliced cream tip + 3 crown leaves + red/gold "DILMA" ribbon)
 * Texture Atlas (64x48, 4-bit 16c, slot 0 = 0x7C1F transparent for palmate leaves!):
 *   - Top 64x24 (y=0..23): Root bark with gnarly ridges + bright red/gold "MANDIOCA / DILMA" wrap band (y=8..17)
 *   - Bottom-left 32x24 (x=0..31, y=24..47): Creamy-white freshly cut cassava cross-section + golden glow accent
 *   - Bottom-right 32x24 (x=32..63, y=24..47): Cutout vibrant green cassava palmate leaf (transparent 0x7C1F edges!)
 */
function sculptMandiocaDaDilma(ti) {
  const pal = [
    [255, 0, 255],   // 0: transparent 0x7C1F
    [76, 44, 22],    // 1: dark earthy bark
    [118, 72, 36],   // 2: medium cassava bark
    [156, 102, 54],  // 3: light bark highlight
    [194, 144, 88],  // 4: root ridge tan
    [244, 234, 198], // 5: creamy-white sliced cassava flesh
    [222, 206, 158], // 6: inner flesh ring
    [206, 22, 24],   // 7: bold PT/satirical crimson red band
    [140, 12, 16],   // 8: dark crimson shadow
    [252, 214, 28],  // 9: bright golden yellow text & star
    [255, 250, 224], // 10: bright white sparkle
    [28, 108, 30],   // 11: deep cassava leaf green
    [48, 164, 46],   // 12: vibrant mid leaf green
    [112, 214, 72],  // 13: bright leaf vein highlight
    [46, 26, 14],    // 14: deep root crevice
    [242, 168, 22],  // 15: warm gold border
  ];
  const cv = new IndexedCanvas(64, 48, pal, true);
  cv.fill(2);
  // 1. Bark region (0..63, 0..23) with organic horizontal striation & gnarly knots
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 64; x++) {
      const h = ((x * 13 + y * 29) ^ (x * 7)) & 15;
      let ci = 2;
      if ((y % 4 === 0 && h < 9) || h === 0) ci = 1;
      else if (y % 4 === 2 && h > 9) ci = 3;
      else if (h === 15) ci = 4;
      if ((y === 2 || y === 21) && (x % 5 === 0)) ci = 14;
      cv.set(x, y, ci);
    }
  }
  // Red & gold satirical wrap band (y=7..16) reading "DILMA" cleanly 3x around circumference!
  cv.rect(0, 7, 64, 10, 7);
  cv.rect(0, 7, 64, 1, 9);
  cv.rect(0, 16, 64, 1, 9);
  cv.text3x5('DILMA', 1, 9, 9, 1, 8);
  cv.text3x5('DILMA', 22, 9, 9, 1, 8);
  cv.text3x5('DILMA', 43, 9, 9, 1, 8);

  // 2. Cut cassava cream tip (0..31, 24..47)
  cv.rect(0, 24, 32, 24, 1);
  cv.circle(16, 36, 11, 2);
  cv.circle(16, 36, 9.5, 6);
  cv.circle(16, 36, 7.5, 5);
  cv.circle(16, 36, 2.5, 6);
  cv.set(16, 36, 10);

  // 3. Palmate green cassava leaf cutout (32..63, 24..47) on transparent 0x7C1F!
  cv.rect(32, 24, 32, 24, 0);
  // Draw 3 palmate lobes radiating from stem at (48, 46)
  const lobes = [
    { ang: -Math.PI / 2, len: 20, w: 5.0 },
    { ang: -Math.PI / 2 - 0.58, len: 16, w: 4.0 },
    { ang: -Math.PI / 2 + 0.58, len: 16, w: 4.0 },
  ];
  for (let y = 24; y < 48; y++) {
    for (let x = 32; x < 64; x++) {
      const dx = x - 48, dy = y - 46;
      let hit = 0;
      for (const lb of lobes) {
        const along = dx * Math.cos(lb.ang) + dy * Math.sin(lb.ang);
        const perp = Math.abs(-dx * Math.sin(lb.ang) + dy * Math.cos(lb.ang));
        if (along >= 0 && along <= lb.len) {
          const t = along / lb.len;
          const halfW = lb.w * Math.sin(t * Math.PI);
          if (perp <= halfW) {
            if (perp < 0.9) hit = Math.max(hit, 3); // central bright vein
            else if (perp > halfW - 1.2) hit = Math.max(hit, 1); // dark edge
            else hit = Math.max(hit, 2); // mid green
          }
        }
      }
      if (hit === 1) cv.set(x, y, 11);
      else if (hit === 2) cv.set(x, y, 12);
      else if (hit === 3) cv.set(x, y, 13);
    }
  }
  cv.line(48, 44, 48, 47, 11);

  // Build 3D curved organic cassava root (6 rings x 6 sides = 36 verts + 2 caps + 3 leaves = 48 verts, 42 faces!)
  const mb = new MeshBuilder();
  const rings = [
    { y: -74, cx:  -8, cz:  -4, rx: 14, rz: 13, v: 1  }, // crown neck
    { y: -42, cx: -14, cz:  -2, rx: 28, rz: 24, v: 5  }, // upper swell
    { y: -12, cx:  -6, cz:   4, rx: 33, rz: 28, v: 8  }, // top of "DILMA" band
    { y:  22, cx:  10, cz:   6, rx: 31, rz: 26, v: 16 }, // bottom of "DILMA" band
    { y:  58, cx:  16, cz:  -2, rx: 22, rz: 19, v: 21 }, // lower taper
    { y:  88, cx:  10, cz:  -8, rx: 12, rz: 11, v: 23 }, // sliced tip rim
  ];
  const SIDES = 6;
  const ringIdx = [];
  for (const r of rings) {
    const idxs = [];
    for (let s = 0; s < SIDES; s++) {
      const ang = (s / SIDES) * Math.PI * 2;
      idxs.push(mb.addV(r.cx + Math.cos(ang) * r.rx, r.y, r.cz + Math.sin(ang) * r.rz));
    }
    ringIdx.push(idxs);
  }
  // Bark sides (5 bands * 6 sides = 30 outward-wound fl=0x2003 quads!)
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const cxMid = (rings[ri].cx + rings[ri + 1].cx) * 0.5;
    const czMid = (rings[ri].cz + rings[ri + 1].cz) * 0.5;
    for (let s = 0; s < SIDES; s++) {
      const s2 = (s + 1) % SIDES;
      const angMid = ((s + 0.5) / SIDES) * Math.PI * 2;
      const u0 = Math.round((s / SIDES) * 63);
      const u1 = Math.round(((s + 1) / SIDES) * 63);
      const outN = [Math.cos(angMid), 0, Math.sin(angMid)];
      const shade = 122 + Math.round(16 * Math.abs(Math.cos(angMid)));
      void cxMid; void czMid;
      mb.quad(ringIdx[ri][s], ringIdx[ri][s2], ringIdx[ri + 1][s], ringIdx[ri + 1][s2], ti, u0, rings[ri].v, u1, rings[ri + 1].v, { outNormal: outN, rgb: [shade, shade, shade] });
    }
  }
  // Top crown cap (2 outward-up quads) + Bottom freshly sliced cream tip (2 outward-down quads!)
  const tR = ringIdx[0];
  mb.quad(tR[0], tR[1], tR[5], tR[2], ti, 4, 2, 12, 5, { outNormal: [0, -1, 0] });
  mb.quad(tR[5], tR[2], tR[4], tR[3], ti, 4, 2, 12, 5, { outNormal: [0, -1, 0] });
  const bR = ringIdx[rings.length - 1];
  mb.quad(bR[0], bR[1], bR[5], bR[2], ti, 6, 27, 25, 36, { outNormal: [0, 1, 0], rgb: [145, 145, 145] });
  mb.quad(bR[5], bR[2], bR[4], bR[3], ti, 6, 36, 25, 45, { outNormal: [0, 1, 0], rgb: [145, 145, 145] });

  // 3 sculpted arching cassava leaves sprouting from crown (-8, -74, -4) -> double-sided 0x2003 cutout quads!
  for (let li = 0; li < 3; li++) {
    const ang = (li / 3) * Math.PI * 2 + 0.3;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const px = -dz * 28, pz = dx * 28;
    const tipL = mb.addV(-8 + dx * 48 + px, -124, -4 + dz * 48 + pz);
    const tipR = mb.addV(-8 + dx * 48 - px, -124, -4 + dz * 48 - pz);
    const bL   = mb.addV(-8 + dx * 6 + px * 0.45, -74, -4 + dz * 6 + pz * 0.45);
    const bR   = mb.addV(-8 + dx * 6 - px * 0.45, -74, -4 + dz * 6 - pz * 0.45);
    mb.quad(tipL, tipR, bL, bR, ti, 33, 24, 62, 47, { doubleSided: true, rgb: [142, 142, 142] });
  }

  return { tex: cv.toPs1(), mesh: mb.buildBuffer() };
}

/**
 * [12] SCHOOL -> 3D PRÉDIO DO TRIPLEX DO GUARUJÁ (3-story beachfront condo + protruding balconies + rooftop pool & "TRIPLEX" neon sign!)
 * Texture Atlas (64x48, 4-bit 16c, opaque):
 *   - Top-left 40x28 (x=0..39, y=0..27): 3-story sunlit beachfront facade with cyan panoramic glass windows, white balconies & gold railings
 *   - Top-right 24x28 (x=40..63, y=0..27): Rooftop shimmering cyan pool + cream terrace tiles & beach sand/ocean rim
 *   - Bottom 64x20 (x=0..63, y=28..47): Bold luxury red-and-gold rooftop billboard reading "TRIPLEX / GUARUJA"
 */
function sculptTriplexDoGuaruja(ti) {
  const pal = [
    [18, 34, 64],    // 0: deep ocean navy
    [244, 240, 228], // 1: sunlit white stucco wall
    [212, 206, 190], // 2: shaded cream wall
    [164, 158, 144], // 3: concrete shadow / trim
    [42, 168, 228],  // 4: bright sea-view glass cyan
    [24, 114, 178],  // 5: mid glass blue
    [152, 232, 252], // 6: glass/pool specular glint
    [242, 194, 42],  // 7: luxury gold balcony railing & trim
    [188, 134, 18],  // 8: shaded gold
    [214, 26, 28],   // 9: bold crimson billboard background
    [142, 14, 18],   // 10: dark crimson shadow
    [242, 214, 144], // 11: Guaruja golden beach sand
    [28, 196, 204],  // 12: turquoise pool water
    [255, 252, 232], // 13: crisp bright white text
    [34, 158, 72],   // 14: palm / terrace hedge green
    [68, 76, 92],    // 15: dark architectural frame
  ];
  const cv = new IndexedCanvas(64, 48, pal, false);
  cv.fill(1);

  // 1. 3-Story Condo Facade (0..39, 0..27) -> 3 floors of 9px each!
  cv.rect(0, 0, 40, 28, 1);
  for (let f = 0; f < 3; f++) {
    const fy = 1 + f * 9;
    // Concrete slab + gold railing
    cv.rect(0, fy + 6, 40, 2, 2);
    cv.rect(0, fy + 5, 40, 1, 7);
    cv.rect(0, fy + 8, 40, 1, 3);
    // 3 panoramic sea-view windows per floor
    for (let w = 0; w < 3; w++) {
      const wx = 3 + w * 12;
      cv.rect(wx, fy, 10, 5, 5);
      cv.rect(wx + 1, fy + 1, 8, 3, 4);
      cv.line(wx + 1, fy + 1, wx + 4, fy + 4, 6); // glass glint
      cv.frame(wx, fy, 10, 5, 15);
    }
  }

  // 2. Rooftop Pool & Beach Sand Base (40..63, 0..27)
  // Upper half (40..63, 0..15): Rooftop pool deck
  cv.rect(40, 0, 24, 16, 2);
  cv.frame(40, 0, 24, 16, 7);
  cv.rect(43, 3, 18, 10, 12);
  cv.frame(43, 3, 18, 10, 1);
  cv.line(45, 5, 52, 5, 6);
  cv.line(51, 9, 58, 9, 6);
  cv.rect(41, 1, 3, 3, 14); // potted terrace bush
  cv.rect(60, 12, 3, 3, 14);
  // Lower half (40..63, 16..27): Beach sand + sea foam strip
  cv.rect(40, 16, 24, 7, 11);
  cv.rect(40, 23, 24, 1, 13);
  cv.rect(40, 24, 24, 4, 4);
  cv.rect(40, 26, 24, 2, 5);

  // 3. Rooftop Billboard Sign (0..63, 28..47) -> "TRIPLEX" / "GUARUJA"
  cv.rect(0, 28, 64, 20, 9);
  cv.frame(0, 28, 64, 20, 7);
  cv.frame(1, 29, 62, 18, 8);
  cv.textCentered3x5('TRIPLEX', 2, 60, 31, 13, 1, 10);
  cv.textCentered3x5('GUARUJA', 2, 60, 39, 7, 1, 10);

  const mb = new MeshBuilder();
  // Beachfront pedestal base (Y=+64..+84)
  mb.box(-56, 64, -46, 56, 84, 46, ti, {
    front: [41, 17, 62, 27], back: [41, 17, 62, 27],
    left: [41, 17, 62, 27], right: [41, 17, 62, 27],
    top: [41, 16, 62, 22], bot: [41, 24, 62, 27],
  });
  // Main 3-story tower block (Y=-64..+64)
  mb.box(-44, -64, -34, 44, 64, 34, ti, {
    front: [0, 0, 39, 27], back: [0, 0, 39, 27],
    left: [0, 0, 39, 27], right: [0, 0, 39, 27],
    top: [40, 0, 63, 15], bot: [40, 16, 63, 22],
  });
  // 2 Protruding 3D Balcony Ledges (Floors 2 & 3!) for unmistakable architectural silhouette!
  for (const by of [-24, 18]) {
    mb.box(-50, by, -40, 50, by + 10, 40, ti, {
      front: [0, 5, 39, 8], back: [0, 5, 39, 8],
      left: [0, 5, 39, 8], right: [0, 5, 39, 8],
      top: [40, 0, 46, 6], bot: [40, 0, 46, 6],
    });
  }
  // Penthouse rooftop elevator cap + glowing red/gold "TRIPLEX GUARUJA" billboard sign (Y=-114..-66)!
  mb.box(-46, -114, -7, 46, -66, 7, ti, {
    front: [0, 28, 63, 47], back: [0, 28, 63, 47],
    left: [0, 28, 4, 47], right: [59, 28, 63, 47],
    top: [0, 28, 63, 30], bot: [0, 45, 63, 47],
  });

  return { tex: cv.toPs1(), mesh: mb.buildBuffer() };
}

/**
 * [13] MALL -> 3D MALA DE DINHEIRO DO MENSALÃO (Hard-shell executive leather briefcase bursting open with overflowing cash stacks!)
 * Texture Atlas (64x48, 4-bit 16c, opaque):
 *   - Top-left 44x28 (x=0..43, y=0..27): Mahogany leather briefcase shell, brass corners, gold locks & bold red stamp "MENSALAO"
 *   - Top-right 20x28 (x=44..63, y=0..27): Rich emerald-green stacked banknotes + golden wrapper band & "$$$"!
 *   - Bottom 64x20 (x=0..63, y=28..47): Briefcase leather trim, handle grain & brass clasp detail
 */
function sculptMalaDoMensalao(ti) {
  const pal = [
    [34, 18, 12],    // 0: deepest dark leather outline
    [68, 36, 20],    // 1: rich mahogany briefcase leather
    [102, 56, 30],   // 2: warm mid leather highlight
    [138, 82, 46],   // 3: leather edge sheen
    [246, 204, 44],  // 4: bright polished brass/gold clasps
    [184, 134, 20],  // 5: shaded brass
    [214, 22, 24],   // 6: bold crimson "MENSALAO" stamp
    [136, 12, 16],   // 7: dark crimson shadow
    [32, 136, 52],   // 8: deep dollar banknote green
    [68, 188, 78],   // 9: bright banknote green
    [144, 232, 128], // 10: banknote highlight cream-green
    [250, 246, 220], // 11: white bill edge / crisp text
    [224, 214, 172], // 12: bill stack paper stripes
    [18, 82, 32],    // 13: dark green bill detail
    [252, 224, 96],  // 14: gold text highlight
    [52, 28, 16],    // 15: stitched leather seam
  ];
  const cv = new IndexedCanvas(64, 48, pal, false);
  cv.fill(1);

  // 1. Front/Back Leather Case Panel (0..43, 0..27)
  cv.rect(0, 0, 44, 28, 1);
  cv.frame(0, 0, 44, 28, 0);
  cv.frame(1, 1, 42, 26, 2);
  // Brass corner protectors!
  for (const [cx, cy] of [[1,1],[38,1],[1,22],[38,22]]) {
    cv.rect(cx, cy, 5, 5, 4);
    cv.frame(cx, cy, 5, 5, 5);
  }
  // Dual brass lock clasps at top
  cv.rect(11, 1, 5, 4, 4); cv.frame(11, 1, 5, 4, 0);
  cv.rect(28, 1, 5, 4, 4); cv.frame(28, 1, 5, 4, 0);
  // Bold Crimson & Gold "MENSALAO" wax-seal badge right in the center!
  cv.rect(4, 7, 36, 15, 6);
  cv.frame(4, 7, 36, 15, 4);
  cv.textCentered3x5('MENSALAO', 5, 34, 9, 11, 1, 7);
  cv.textCentered3x5('$$$ PT $$$', 5, 34, 16, 14, 1, 7);

  // 2. Banknote Stack Texture (44..63, 0..27)
  cv.rect(44, 0, 20, 28, 9);
  for (let y = 1; y < 27; y += 2) cv.line(44, y, 63, y, 8); // bill layers!
  cv.frame(44, 0, 20, 28, 13);
  cv.rect(45, 2, 18, 24, 9);
  cv.frame(46, 3, 16, 22, 10);
  // Golden currency strap right across the middle!
  cv.rect(44, 10, 20, 7, 4);
  cv.frame(44, 10, 20, 7, 5);
  cv.textCentered3x5('$$$', 45, 18, 11, 13, 1);

  // 3. Leather Trim / Handle / Side Seam (0..63, 28..47)
  cv.rect(0, 28, 64, 20, 2);
  cv.rect(0, 36, 64, 4, 4); // brass center zipper/latch line around sides!
  cv.line(0, 35, 63, 35, 0);
  cv.line(0, 40, 63, 40, 0);
  // Stacked white/green bill edges on right half (32..63, 41..47)
  for (let y = 41; y < 48; y++) cv.line(32, y, 63, y, (y & 1) ? 11 : 8);

  const mb = new MeshBuilder();
  // Main lower leather briefcase body (X=-70..70, Y=-26..+72, Z=-26..+26)
  mb.box(-70, -26, -26, 70, 72, 26, ti, {
    front: [0, 0, 43, 27], back: [0, 0, 43, 27],
    left: [0, 28, 30, 47], right: [0, 28, 30, 47],
    top: [32, 41, 63, 47], bot: [0, 28, 30, 35],
  });
  // 3 Chunky 3D overflowing stacks of green banknotes bursting out of the top gap!
  mb.box(-54, -76, -16, -14, -22, 16, ti, {
    front: [44, 0, 63, 27], back: [44, 0, 63, 27],
    left: [32, 41, 63, 47], right: [32, 41, 63, 47],
    top: [44, 0, 63, 27], bot: [44, 0, 63, 27],
  });
  mb.box(-10, -88, -18, 28, -22, 18, ti, {
    front: [44, 0, 63, 27], back: [44, 0, 63, 27],
    left: [32, 41, 63, 47], right: [32, 41, 63, 47],
    top: [44, 0, 63, 27], bot: [44, 0, 63, 27],
  });
  mb.box(30, -70, -14, 58, -22, 14, ti, {
    front: [44, 0, 63, 27], back: [44, 0, 63, 27],
    left: [32, 41, 63, 47], right: [32, 41, 63, 47],
    top: [44, 0, 63, 27], bot: [44, 0, 63, 27],
  });
  // Popped-open upper briefcase rim tilted slightly back + sculpted 3D leather carry handle!
  mb.box(-70, -46, -34, 70, -28, -16, ti, {
    front: [0, 28, 30, 39], back: [0, 28, 30, 39],
    left: [0, 28, 30, 39], right: [0, 28, 30, 39],
    top: [0, 28, 30, 34], bot: [0, 28, 30, 34],
  });
  // Top carry handle crossbar + twin uprights (X=-26..+26, Y=-104..-88)
  mb.box(-28, -106, -8, 28, -92, 8, ti, { all: [0, 28, 28, 34] });
  mb.box(-28, -94, -6, -16, -44, 6, ti, { all: [0, 36, 20, 40] });
  mb.box(16, -94, -6, 28, -44, 6, ti, { all: [0, 36, 20, 40] });

  return { tex: cv.toPs1(), mesh: mb.buildBuffer() };
}

/**
 * [15] DOWNTOWN -> 3D COFRE DO ESCÂNDALO DO INSS (Armored blue-steel pension vault + 3D combination wheel + spilling gold coins!)
 * Texture Atlas (64x48, 4-bit 16c, opaque):
 *   - Top-left 40x32 (x=0..39, y=0..31): Riveted blue-steel vault door with yellow/blue "INSS" badge & red "ROUBO!" stamp
 *   - Top-right 24x24 (x=40..63, y=0..23): Chrome spoked vault combination dial wheel
 *   - Bottom-right 24x24 (x=40..63, y=24..47): Shimmering pile of golden pension coins & banknotes
 *   - Bottom-left 40x16 (x=0..39, y=32..47): Armored steel side plates with rivets
 */
function sculptCofreDoInss(ti) {
  const pal = [
    [22, 30, 44],    // 0: darkest vault outline
    [42, 66, 102],   // 1: armored steel blue body
    [72, 104, 148],  // 2: mid steel blue highlight
    [118, 152, 194], // 3: bright steel bevel
    [186, 204, 224], // 4: polished chrome dial/rivets
    [244, 250, 255], // 5: bright white specular & text
    [16, 78, 168],   // 6: official INSS deep blue banner
    [252, 208, 24],  // 7: gleaming gold coins & INSS yellow
    [214, 154, 16],  // 8: mid gold coin shadow
    [146, 98, 10],   // 9: deep coin crevice
    [220, 26, 28],   // 10: scandal red warning stripe
    [140, 14, 18],   // 11: dark red shadow
    [54, 184, 72],   // 12: escaped green banknote accent
    [255, 238, 128], // 13: bright coin glint
    [60, 72, 88],    // 14: gunmetal steel frame
    [92, 108, 128],  // 15: gunmetal highlight
  ];
  const cv = new IndexedCanvas(64, 48, pal, false);
  cv.fill(1);

  // 1. Armored Vault Door (0..39, 0..31)
  cv.rect(0, 0, 40, 32, 1);
  cv.frame(0, 0, 40, 32, 0);
  cv.frame(1, 1, 38, 30, 3);
  cv.frame(3, 3, 34, 26, 0);
  // Corner steel rivets
  for (const [rx, ry] of [[2,2],[37,2],[2,29],[37,29],[2,15],[37,15]]) cv.set(rx, ry, 4);
  // Top INSS official header badge (y=2..11 — sits cleanly ABOVE the 3D chrome safe dial!)
  cv.rect(5, 2, 30, 9, 6);
  cv.frame(5, 2, 30, 9, 7);
  cv.textCentered3x5('INSS', 6, 28, 4, 7, 1, 0);
  // Red scandal stripe at bottom (y=23..30 — sits cleanly BELOW the 3D chrome safe dial!)
  cv.rect(4, 22, 32, 8, 10);
  cv.frame(4, 22, 32, 8, 7);
  cv.textCentered3x5('ROUBO!', 5, 30, 24, 5, 1, 11);

  // 2. Chrome Combination Dial Wheel (40..63, 0..23)
  cv.rect(40, 0, 24, 24, 14);
  cv.circle(52, 12, 10, 0);
  cv.circle(52, 12, 9, 4);
  cv.circle(52, 12, 6.5, 14);
  cv.circle(52, 12, 3, 7);
  cv.line(52, 3, 52, 21, 5);
  cv.line(43, 12, 61, 12, 5);
  cv.circle(52, 12, 2, 5);

  // 3. Overflowing Gold Coins & Cash Heap (40..63, 24..47)
  cv.rect(40, 24, 24, 24, 9);
  for (let cy = 26; cy <= 45; cy += 4) {
    for (let cx = 42; cx <= 61; cx += 5) {
      const ox = ((cy >> 2) & 1) ? 2 : 0;
      cv.circle(cx + ox, cy, 2.5, 8);
      cv.circle(cx + ox, cy, 1.8, 7);
      cv.set(cx + ox - 1, cy - 1, 13);
    }
  }
  // A couple bright green bills peeking through the gold!
  cv.rect(44, 30, 6, 4, 12); cv.rect(54, 38, 6, 4, 12);

  // 4. Riveted Armored Side Panels (0..39, 32..47)
  cv.rect(0, 32, 40, 16, 1);
  cv.frame(0, 32, 40, 16, 0);
  cv.frame(1, 33, 38, 14, 2);
  for (let rx = 4; rx < 38; rx += 6) { cv.set(rx, 35, 4); cv.set(rx, 44, 4); }
  cv.rect(6, 38, 28, 4, 10); // red caution stripe around sides!

  const mb = new MeshBuilder();
  // Heavy steel vault body (X=-56..+56, Y=-52..+70, Z=-44..+44)
  mb.box(-56, -52, -44, 56, 70, 44, ti, {
    front: [0, 0, 39, 31], back: [0, 0, 39, 31],
    left: [0, 32, 39, 47], right: [0, 32, 39, 47],
    top: [40, 24, 63, 47], bot: [0, 32, 39, 47],
  });
  // 2 Thick steel feet runners (Y=+70..+84)
  mb.box(-50, 70, -38, -26, 84, 38, ti, { all: [0, 32, 16, 47] });
  mb.box(26, 70, -38, 50, 84, 38, ti, { all: [0, 32, 16, 47] });
  // Protruding 3D Chrome Combination Dial Wheels centered cleanly between "INSS" and "ROUBO!" (Y=-12..+22)!
  mb.box(-17, -10, 44, 17, 24, 62, ti, {
    front: [40, 0, 63, 23], back: [40, 0, 63, 23],
    left: [40, 0, 46, 23], right: [57, 0, 63, 23],
    top: [40, 0, 63, 6], bot: [40, 17, 63, 23],
  });
  mb.box(-17, -10, -62, 17, 24, -44, ti, {
    front: [40, 0, 63, 23], back: [40, 0, 63, 23],
    left: [40, 0, 46, 23], right: [57, 0, 63, 23],
    top: [40, 0, 63, 6], bot: [40, 17, 63, 23],
  });
  // Overflowing 3D Pyramid of Gold Coins bursting out the cracked top of the vault (Y=-94..-52)!
  const t0 = mb.addV(-42, -52, -32), t1 = mb.addV(42, -52, -32), t2 = mb.addV(-42, -52, 32), t3 = mb.addV(42, -52, 32);
  const p0 = mb.addV(-18, -94, -14), p1 = mb.addV(18, -94, -14), p2 = mb.addV(-18, -94, 14), p3 = mb.addV(18, -94, 14);
  mb.quad(p3, p2, t3, t2, ti, 40, 24, 63, 47, { outNormal: [ 0, -0.4,  1], rgb: [148,148,148] });
  mb.quad(p0, p1, t0, t1, ti, 40, 24, 63, 47, { outNormal: [ 0, -0.4, -1], rgb: [142,142,142] });
  mb.quad(p1, p3, t1, t3, ti, 40, 24, 63, 47, { outNormal: [ 1, -0.4,  0], rgb: [132,132,132] });
  mb.quad(p2, p0, t2, t0, ti, 40, 24, 63, 47, { outNormal: [-1, -0.4,  0], rgb: [132,132,132] });
  mb.quad(p0, p1, p2, p3, ti, 40, 24, 63, 47, { outNormal: [ 0, -1,    0], rgb: [152,152,152] });

  return { tex: cv.toPs1(), mesh: mb.buildBuffer() };
}

/**
 * [16] DOWNHILL JAM -> 3D PEDALINHO DO SÍTIO DE ATIBAIA (Sculpted white/cyan swan pedal boat + striped red/white canopy + orange beak!)
 * Texture Atlas (64x48, 4-bit 16c, opaque):
 *   - Top 64x22 (x=0..63, y=0..21): White & turquoise boat hull with bold blue/gold "ATIBAIA" side lettering & red stripe
 *   - Bottom-left 32x26 (x=0..31, y=22..47): Red-and-white classic resort striped sun-canopy roof
 *   - Bottom-right 32x26 (x=32..63, y=22..47): Swan white feathers + cartoon eye (top) + bright orange duck/swan beak (bottom)
 */
function sculptPedalinhoDeAtibaia(ti) {
  const pal = [
    [20, 32, 52],    // 0: deep navy eye / outline
    [248, 250, 254], // 1: bright fiberglass white hull & swan
    [214, 224, 236], // 2: shaded hull white
    [164, 184, 206], // 3: hull underside shadow
    [28, 174, 214],  // 4: vibrant turquoise water-line stripe
    [16, 114, 168],  // 5: deep lake blue
    [224, 28, 30],   // 6: bright red canopy & paddle-wheel stripe
    [152, 16, 20],   // 7: dark red shade
    [252, 146, 22],  // 8: bright orange swan/duck beak!
    [212, 98, 12],   // 9: shaded orange beak
    [252, 214, 34],  // 10: sunny gold trim
    [120, 74, 36],   // 11: wooden seat deck
    [176, 118, 62],  // 12: warm wood highlight
    [152, 236, 252], // 13: glossy fiberglass highlight
    [62, 186, 86],   // 14: lakeside green trim
    [92, 102, 116],  // 15: chrome canopy poles
  ];
  const cv = new IndexedCanvas(64, 48, pal, false);
  cv.fill(1);

  // 1. Boat Hull Side Panel (0..63, 0..21)
  cv.rect(0, 0, 64, 12, 1);
  cv.rect(0, 12, 64, 3, 6);  // classic red trim stripe
  cv.rect(0, 15, 64, 7, 4);  // turquoise lower hull
  cv.rect(0, 19, 64, 3, 5);
  cv.line(0, 0, 63, 0, 2);
  cv.textCentered3x5('ATIBAIA', 4, 56, 3, 5, 1, 2);

  // 2. Red-and-White Striped Resort Canopy (0..31, 22..47)
  for (let x = 0; x < 32; x++) {
    const col = ((x >> 2) & 1) ? 1 : 6;
    cv.line(x, 22, x, 47, col);
  }
  cv.frame(0, 22, 32, 26, 7);
  cv.rect(0, 45, 32, 3, 10); // golden fringe valence!

  // 3. Swan Head/Neck (32..63, 22..35) + Bright Orange Beak (32..63, 36..47)
  cv.rect(32, 22, 32, 14, 1);
  cv.frame(32, 22, 32, 14, 2);
  // Crisp cute cartoon eyes on both left & right of swan head tile!
  cv.circle(40, 28, 2.6, 0); cv.set(41, 27, 1);
  cv.circle(55, 28, 2.6, 0); cv.set(54, 27, 1);
  // Bright orange beak tile!
  cv.rect(32, 36, 32, 12, 8);
  cv.rect(32, 43, 32, 5, 9);
  cv.line(34, 38, 60, 38, 10);

  const mb = new MeshBuilder();
  // Boat Hull (tapered bow at +X, stern at -X, Y=+16..+66, Z=-36..+36)
  // Main cockpit hull box (-68..+44)
  mb.box(-68, 16, -34, 44, 62, 34, ti, {
    front: [0, 0, 63, 21], back: [0, 0, 63, 21],
    left: [0, 0, 24, 21], right: [40, 0, 63, 21],
    top: [0, 15, 30, 21], bot: [0, 15, 63, 21],
  });
  // Pointed front bow wedge (+44..+78) with exact outward PS1 winding!
  const bTL = mb.addV(44, 16, -34), bTR = mb.addV(44, 16, 34);
  const bBL = mb.addV(44, 62, -34), bBR = mb.addV(44, 62, 34);
  const bowT = mb.addV(80, 18, 0), bowB = mb.addV(72, 60, 0);
  mb.quad(bowT, bTR, bowB, bBR, ti, 36, 0, 63, 21, { outNormal: [0.6, 0,  0.8], rgb: [138,138,138] });
  mb.quad(bTL, bowT, bBL, bowB, ti, 36, 0, 63, 21, { outNormal: [0.6, 0, -0.8], rgb: [134,134,134] });
  mb.tri(bTL, bowT, bTR, ti, 0, 0, 20, 5, 0, 10, { outNormal: [0, -1, 0], rgb: [148,148,148] });
  mb.tri(bTR, bowB, bBL, ti, 0, 15, 20, 20, 0, 20, { outNormal: [0, 1, 0], rgb: [100,100,100] });

  // Sculpted Graceful Swan Neck (+46..+68, Y=-58..+20) + Head (+52..+78, Y=-82..-54) + Orange Beak (+78..+102, Y=-70..-56)!
  mb.box(42, -56, -12, 64, 20, 12, ti, { all: [32, 22, 38, 35] });
  mb.box(46, -84, -15, 76, -54, 15, ti, {
    front: [32, 22, 63, 35], back: [32, 22, 63, 35],
    left: [32, 22, 38, 35], right: [32, 22, 38, 35],
    top: [32, 22, 38, 35], bot: [32, 22, 38, 35],
  });
  mb.box(76, -72, -11, 100, -56, 11, ti, { all: [32, 36, 63, 47] });

  // Classic Red-and-White Striped Sun-Canopy Roof (X=-64..+24, Y=-74..-58, Z=-36..+36) + 2 vertical poles!
  mb.box(-64, -74, -36, 24, -58, 36, ti, { all: [0, 22, 31, 47] });
  mb.box(-56, -58, -32, -48, 16, -24, ti, { all: [0, 22, 4, 28] });
  mb.box(-56, -58, 24, -48, 16, 32, ti, { all: [0, 22, 4, 28] });
  mb.box(10, -58, -32, 18, 16, -24, ti, { all: [0, 22, 4, 28] });
  mb.box(10, -58, 24, 18, 16, 32, ti, { all: [0, 22, 4, 28] });

  return { tex: cv.toPs1(), mesh: mb.buildBuffer() };
}

/**
 * [18] STREETS SF -> 3D PICANHA DA PROMESSA (Juicy flame-seared triangular Brazilian Picanha + golden fat cap + stainless skewer + "PICANHA" flag!)
 * Texture Atlas (64x48, 4-bit 16c, opaque):
 *   - Top-left 44x32 (x=0..43, y=0..31): Flame-seared marbled crimson Picanha meat with crisp charcoal grill marks & creamy-gold fat cap band on top!
 *   - Top-right 20x32 (x=44..63, y=0..31): Golden-white sizzling "capa de gordura" (crispy grilled fat cap texture!)
 *   - Bottom 64x16 (x=0..63, y=32..47): Stainless steel skewer blade (left) + wooden handle (mid) + bright yellow/green "PICANHA" flag (right)
 */
function sculptPicanhaDaPromessa(ti) {
  const pal = [
    [42, 14, 10],    // 0: charcoal grill sear mark
    [118, 26, 20],   // 1: rich grilled dark beef
    [168, 42, 32],   // 2: juicy medium-rare crimson steak
    [206, 72, 56],   // 3: marbled rosy meat highlight
    [232, 146, 126], // 4: fine marbling fat veins
    [252, 244, 208], // 5: creamy-white fat cap (capa de gordura!)
    [244, 214, 134], // 6: golden-roasted fat crust
    [204, 148, 54],  // 7: crispy caramelized fat edge
    [192, 206, 220], // 8: stainless steel churrasco skewer
    [246, 250, 255], // 9: steel specular gleam & crisp text
    [118, 66, 30],   // 10: wooden skewer handle
    [164, 98, 46],   // 11: wood handle highlight
    [28, 152, 54],   // 12: Brazilian flag green ribbon
    [252, 214, 26],  // 13: Brazilian flag golden yellow
    [18, 54, 148],   // 14: bold navy flag text
    [76, 18, 14],    // 15: deep seared meat shadow
  ];
  const cv = new IndexedCanvas(64, 48, pal, false);
  cv.fill(2);

  // 1. Marbled Flame-Seared Picanha Face (0..43, 0..31)
  cv.rect(0, 0, 44, 32, 2);
  // Creamy-gold fat cap along top 7 rows!
  cv.rect(0, 0, 44, 6, 5);
  cv.rect(0, 0, 44, 2, 7);
  cv.rect(0, 6, 44, 2, 6);
  // Juicy marbling & diagonal charcoal grill marks across the beef!
  for (let y = 8; y < 32; y++) {
    for (let x = 0; x < 44; x++) {
      const h = ((x * 17 + y * 11) ^ (y * 23)) & 15;
      if (h === 0 || h === 1) cv.set(x, y, 1);
      else if (h === 13 || h === 14) cv.set(x, y, 3);
      else if (h === 15) cv.set(x, y, 4);
      // Classic crosshatch churrasco grill sear bars!
      if ((x + y) % 10 === 0 || (x + y) % 10 === 1) cv.set(x, y, 0);
      if ((x - y + 40) % 12 === 0) cv.set(x, y, 15);
    }
  }
  cv.frame(0, 8, 44, 24, 1);

  // 2. Golden Fat Cap Side Crust (44..63, 0..31)
  cv.rect(44, 0, 20, 32, 5);
  for (let y = 0; y < 32; y++) {
    for (let x = 44; x < 64; x++) {
      const h = ((x * 7 + y * 19) & 7);
      if (h === 0 || h === 1) cv.set(x, y, 7);
      else if (h === 2 || h === 3) cv.set(x, y, 6);
    }
  }
  // Crispy diagonal fat scoring lines (churrascaria diamond cuts!)
  for (let k = -24; k < 48; k += 8) {
    cv.line(44, k, 63, k + 19, 7);
    cv.line(63, k, 44, k + 19, 7);
  }

  // 3. Skewer Steel (0..15, 32..47) + Wood Handle (16..27, 32..47) + "PICANHA" Flag (28..63, 32..47)
  cv.rect(0, 32, 16, 16, 8);
  cv.rect(0, 35, 16, 4, 9);
  cv.rect(16, 32, 12, 16, 10);
  cv.rect(16, 36, 12, 4, 11);
  cv.frame(16, 32, 12, 16, 0);
  // Crisp green-and-gold "PICANHA" churrasco marker flag!
  cv.rect(28, 32, 36, 16, 13);
  cv.frame(28, 32, 36, 16, 12);
  cv.frame(29, 33, 34, 14, 12);
  cv.textCentered3x5('PICANHA', 30, 32, 37, 14, 1, 9);

  const mb = new MeshBuilder();
  // Classic thick 3D triangular/teardrop Picanha cut (7-point outer contour extruded Z = -24..+24!)
  // Remember Y negative = UP! Top curved edge = thick white/gold FAT CAP!
  const pts = [
    [-68, -20], // 0: left tip
    [-34, -56], // 1: top-left fat cap arc
    [ 16, -60], // 2: top-mid fat cap peak
    [ 64, -34], // 3: top-right fat cap corner
    [ 70,  16], // 4: right rounded belly
    [ 22,  52], // 5: bottom-right curve
    [-38,  42], // 6: bottom-left taper
  ];
  const cF = mb.addV(2, -4, 28);   // slightly puffed juicy center front!
  const cB = mb.addV(2, -4, -28);  // slightly puffed juicy center back!
  const fV = pts.map(([x, y]) => mb.addV(x, y, 22));
  const bV = pts.map(([x, y]) => mb.addV(x, y, -22));

  // Front & Back meat faces + outward-wound side crust rim!
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const isFatSide = (i === 0 || i === 1 || i === 2);
    // Outward 2D normal of rim segment pts[i] -> pts[j] (pts runs clockwise in X/Y-down -> outN = (dy, -dx))
    const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1];
    const sideOut = [dy, -dx, 0];
    if (isFatSide) {
      mb.quad(fV[i], fV[j], bV[i], bV[j], ti, 44, 0, 63, 31, { outNormal: sideOut, rgb: [148,148,148] });
    } else {
      mb.quad(fV[i], fV[j], bV[i], bV[j], ti, 0, 12, 43, 31, { outNormal: sideOut, rgb: [126,126,126] });
    }
    // Front (+Z) & Back (-Z) face fan: center cF/cB ALWAYS samples rich seared beef (22, 21)!
    const uA = clamp(Math.round(((pts[i][0] + 70) / 140) * 43), 0, 43);
    const vA = clamp(Math.round(((pts[i][1] + 62) / 116) * 31), 0, 31);
    const uB = clamp(Math.round(((pts[j][0] + 70) / 140) * 43), 0, 43);
    const vB = clamp(Math.round(((pts[j][1] + 62) / 116) * 31), 0, 31);
    mb.tri(fV[i], fV[j], cF, ti, uA, vA, uB, vB, 22, 21, { outNormal: [0, 0,  1], rgb: [142, 142, 142] });
    mb.tri(bV[j], bV[i], cB, ti, uB, vB, uA, vA, 22, 21, { outNormal: [0, 0, -1], rgb: [138, 138, 138] });
  }

  // Stainless steel churrasco skewer + wooden handle piercing horizontally/diagonally through the Picanha!
  // Skewer tip (+70..+102) & Wooden handle (-108..-68)
  mb.box(66, -12, -5, 102, 0, 5, ti, { all: [0, 32, 15, 47] });
  mb.box(-108, -14, -9, -66, 2, 9, ti, { all: [16, 32, 27, 47] });
  // Crisp golden-green "PICANHA" steakhouse marker flag planted right on top of the fat cap (Y=-112..-60)!
  mb.box(-38, -110, -5, 38, -68, 5, ti, {
    front: [28, 32, 63, 47], back: [28, 32, 63, 47],
    left: [28, 32, 32, 47], right: [60, 32, 63, 47],
    top: [28, 32, 63, 35], bot: [28, 44, 63, 47],
  });
  // Flag pole pin connecting flag to steak
  mb.box(-4, -70, -3, 4, -54, 3, ti, { all: [0, 32, 15, 47] });

  return { tex: cv.toPs1(), mesh: mb.buildBuffer() };
}

const SCULPTORS = {
  mandioca:  sculptMandiocaDaDilma,
  triplex:   sculptTriplexDoGuaruja,
  mensalao:  sculptMalaDoMensalao,
  inss:      sculptCofreDoInss,
  pedalinho: sculptPedalinhoDeAtibaia,
  picanha:   sculptPicanhaDaPromessa,
};

// ============================================================================
// 4. Clean PS1 .PSX Appender (Appends 1 New Mesh + 1 New 4-bit Texture + Palette)
// ============================================================================

function inspectPsxFull(buf) {
  const ver = buf.readUInt32LE(0);
  const ptrMeta = buf.readUInt32LE(4);
  const nObj = buf.readUInt32LE(8);
  const offNMesh = 12 + nObj * 36;
  const nMesh = buf.readUInt32LE(offNMesh);
  const meshOffs = [];
  for (let i = 0; i < nMesh; i++) meshOffs.push(buf.readUInt32LE(offNMesh + 4 + i * 4));

  let cur = ptrMeta;
  const chunks = [];
  while (cur + 4 <= buf.length) {
    const tag = buf.readUInt32LE(cur);
    if (tag === 0xFFFFFFFF) { cur += 4; break; }
    const sz = buf.readUInt32LE(cur + 4);
    chunks.push({ tag, data: Buffer.from(buf.subarray(cur + 8, cur + 8 + sz)) });
    cur += 8 + sz;
  }
  const meshHashesOff = cur;
  const meshHashes = [];
  for (let i = 0; i < nMesh; i++) { meshHashes.push(buf.readUInt32LE(cur)); cur += 4; }

  const texHashesOff = cur;
  const nTexHashes = buf.readUInt32LE(cur); cur += 4;
  const texHashes = [];
  for (let i = 0; i < nTexHashes; i++) { texHashes.push(buf.readUInt32LE(cur)); cur += 4; }

  const nPal4 = buf.readUInt32LE(cur); cur += 4;
  const pal4 = [];
  for (let i = 0; i < nPal4; i++) {
    pal4.push({ id: buf.readUInt32LE(cur), data: Buffer.from(buf.subarray(cur + 4, cur + 36)) });
    cur += 36;
  }

  const nPal8 = buf.readUInt32LE(cur); cur += 4;
  const pal8 = [];
  for (let i = 0; i < nPal8; i++) {
    pal8.push({ id: buf.readUInt32LE(cur), data: Buffer.from(buf.subarray(cur + 4, cur + 516)) });
    cur += 516;
  }

  const nTex = buf.readUInt32LE(cur); cur += 4;
  const texOffs = [];
  for (let i = 0; i < nTex; i++) { texOffs.push(buf.readUInt32LE(cur)); cur += 4; }

  const texRecs = [];
  for (let i = 0; i < nTex; i++) {
    const o = texOffs[i];
    const end = (i + 1 < nTex) ? texOffs[i + 1] : buf.length;
    texRecs.push({
      unk0: buf.readUInt32LE(o),
      palSize: buf.readUInt32LE(o + 4),
      palId: buf.readUInt32LE(o + 8),
      texIdx: buf.readUInt32LE(o + 12),
      w: buf.readUInt16LE(o + 16),
      h: buf.readUInt16LE(o + 18),
      rawPixels: Buffer.from(buf.subarray(o + 20, end)),
    });
  }

  return {
    ver, ptrMeta, nObj, offNMesh, nMesh, meshOffs,
    chunks, meshHashesOff, meshHashes,
    texHashesOff, nTexHashes, texHashes,
    pal4, pal8, texRecs,
  };
}

function appendCustomMeshToPsx(origBuf, spec) {
  const info = inspectPsxFull(origBuf);
  const newTi = info.texHashes.length;
  const newTexHash = psxLib.nsHash(`t1_obj_${spec.key}_tex`) >>> 0;
  const newPalId = psxLib.nsHash(`t1_obj_${spec.key}_pal`) >>> 0;

  // Sculpt custom 3D mesh + 4-bit texture targeting texture index `newTi`!
  const sculpted = SCULPTORS[spec.key](newTi);
  const newMeshBuf = sculpted.mesh.buf;

  // 1. Header + Objects (verbatim, updating ptrRgbs after computing delta)
  const objsEnd = info.offNMesh;
  const hdrAndObjs = Buffer.from(origBuf.subarray(0, objsEnd));

  // 2. Mesh Offset Table (nMesh + 1 entries -> grows by +4 bytes!)
  const oldMeshDataStart = info.offNMesh + 4 + info.nMesh * 4;
  const oldMeshData = Buffer.from(origBuf.subarray(oldMeshDataStart, info.ptrMeta));
  const meshShift = 4; // +1 uint32 in meshOffs[]!
  const newMeshStart = info.ptrMeta + meshShift;
  const newPtrMeta = newMeshStart + newMeshBuf.length;
  const metaDelta = newPtrMeta - info.ptrMeta; // = 4 + newMeshBuf.length!

  hdrAndObjs.writeUInt32LE(newPtrMeta >>> 0, 4);
  for (let i = 0; i < info.nObj; i++) {
    const o = 12 + i * 36;
    const oldRgbs = hdrAndObjs.readUInt32LE(o + 32);
    if (oldRgbs >= info.ptrMeta) hdrAndObjs.writeUInt32LE((oldRgbs + metaDelta) >>> 0, o + 32);
  }

  const meshTableBuf = Buffer.alloc(4 + (info.nMesh + 1) * 4);
  meshTableBuf.writeUInt32LE((info.nMesh + 1) >>> 0, 0);
  for (let i = 0; i < info.nMesh; i++) {
    meshTableBuf.writeUInt32LE((info.meshOffs[i] + meshShift) >>> 0, 4 + i * 4);
  }
  meshTableBuf.writeUInt32LE(newMeshStart >>> 0, 4 + info.nMesh * 4);

  // 3. Tagged Chunks (verbatim + 0xFFFFFFFF terminator)
  const chunkParts = [];
  for (const ch of info.chunks) {
    const chHdr = Buffer.alloc(8);
    chHdr.writeUInt32LE(ch.tag >>> 0, 0);
    chHdr.writeUInt32LE(ch.data.length >>> 0, 4);
    chunkParts.push(chHdr, ch.data);
  }
  const termBuf = Buffer.alloc(4); termBuf.writeUInt32LE(0xFFFFFFFF, 0);
  chunkParts.push(termBuf);

  // 4. Mesh Hashes (nMesh + 1)
  const mhBuf = Buffer.alloc((info.nMesh + 1) * 4);
  for (let i = 0; i < info.nMesh; i++) mhBuf.writeUInt32LE(info.meshHashes[i] >>> 0, i * 4);
  mhBuf.writeUInt32LE(spec.meshHash >>> 0, info.nMesh * 4);

  // 5. Tex Hashes + Pal4 + Pal8 + Textures
  const texHashes = [...info.texHashes, newTexHash];
  const pal4 = [...info.pal4, { id: newPalId, data: sculpted.tex.palBuf }];
  const pal8 = info.pal8;
  const texRecs = [
    ...info.texRecs,
    {
      unk0: 0x00020004,
      palSize: 16,
      palId: newPalId,
      texIdx: newTi,
      w: sculpted.tex.w,
      h: sculpted.tex.h,
      rawPixels: sculpted.tex.packed,
    },
  ];

  const thBuf = Buffer.alloc(4 + texHashes.length * 4);
  thBuf.writeUInt32LE(texHashes.length >>> 0, 0);
  for (let i = 0; i < texHashes.length; i++) thBuf.writeUInt32LE(texHashes[i] >>> 0, 4 + i * 4);

  const p4Buf = Buffer.alloc(4 + pal4.length * 36);
  p4Buf.writeUInt32LE(pal4.length >>> 0, 0);
  for (let i = 0; i < pal4.length; i++) {
    p4Buf.writeUInt32LE(pal4[i].id >>> 0, 4 + i * 36);
    pal4[i].data.copy(p4Buf, 4 + i * 36 + 4);
  }

  const p8Buf = Buffer.alloc(4 + pal8.length * 516);
  p8Buf.writeUInt32LE(pal8.length >>> 0, 0);
  for (let i = 0; i < pal8.length; i++) {
    p8Buf.writeUInt32LE(pal8[i].id >>> 0, 4 + i * 516);
    pal8[i].data.copy(p8Buf, 4 + i * 516 + 4);
  }

  const preTex = Buffer.concat([hdrAndObjs, meshTableBuf, oldMeshData, newMeshBuf, ...chunkParts, mhBuf, thBuf, p4Buf, p8Buf]);
  const texOffsTableLen = 4 + texRecs.length * 4;
  const texOffsBuf = Buffer.alloc(texOffsTableLen);
  texOffsBuf.writeUInt32LE(texRecs.length >>> 0, 0);

  let curOff = preTex.length + texOffsTableLen;
  const texChunks = [];
  for (let i = 0; i < texRecs.length; i++) {
    const t = texRecs[i];
    texOffsBuf.writeUInt32LE(curOff >>> 0, 4 + i * 4);
    const hdr = Buffer.alloc(20);
    hdr.writeUInt32LE(t.unk0 >>> 0, 0);
    hdr.writeUInt32LE(t.palSize >>> 0, 4);
    hdr.writeUInt32LE(t.palId >>> 0, 8);
    hdr.writeUInt32LE(t.texIdx >>> 0, 12);
    hdr.writeUInt16LE(t.w, 16);
    hdr.writeUInt16LE(t.h, 18);
    const padLen = (4 - ((20 + t.rawPixels.length) % 4)) % 4;
    const chunk = padLen ? Buffer.concat([hdr, t.rawPixels, Buffer.alloc(padLen, 0)]) : Buffer.concat([hdr, t.rawPixels]);
    texChunks.push(chunk);
    curOff += chunk.length;
  }

  const out = Buffer.concat([preTex, texOffsBuf, ...texChunks]);

  // Self-verify round-trip with psxLib.parsePsxStructure!
  const chk = psxLib.parsePsxStructure(out);
  const foundIdx = chk.meshHashes.indexOf(spec.meshHash >>> 0);
  if (foundIdx !== info.nMesh) throw new Error(`${spec.oPsx}: mesh hash verify failed (got ${foundIdx})`);
  const foundTex = chk.textures.find(t => t.texIdx === newTi);
  if (!foundTex || foundTex.w !== sculpted.tex.w || foundTex.h !== sculpted.tex.h) {
    throw new Error(`${spec.oPsx}: texture verify failed!`);
  }
  return { out, sculpted, origSize: origBuf.length, newSize: out.length, newTi };
}

// ============================================================================
// 5. Software 3D Textured Z-Buffered Preview Renderer (6-Panel Contact Sheet!)
// ============================================================================

function renderPreviewSheet(results, outPngPath) {
  const CELL_W = 240, CELL_H = 220;
  const COLS = 3, ROWS = 2;
  const W = CELL_W * COLS, H = CELL_H * ROWS;
  const img = Buffer.alloc(W * H * 4, 0);
  // Rich dark slate backdrop
  for (let i = 0; i < W * H; i++) {
    img[i * 4] = 24; img[i * 4 + 1] = 28; img[i * 4 + 2] = 40; img[i * 4 + 3] = 255;
  }

  function putPx(x, y, r, g, b) {
    if (x >= 0 && x < W && y >= 0 && y < H) {
      const o = (y * W + x) * 4;
      img[o] = r; img[o + 1] = g; img[o + 2] = b; img[o + 3] = 255;
    }
  }

  results.forEach((res, idx) => {
    const col = idx % COLS, row = Math.floor(idx / COLS);
    const ox = col * CELL_W, oy = row * CELL_H;
    // Draw cell border + subtle grid backdrop
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const edge = (x === 0 || y === 0 || x === CELL_W - 1 || y === CELL_H - 1);
        const grid = (!edge && ((x % 20 === 0) || (y % 20 === 0)));
        if (edge) putPx(ox + x, oy + y, 76, 92, 124);
        else if (grid) putPx(ox + x, oy + y, 30, 36, 52);
      }
    }

    // Render 2 views inside each cell: 3/4 front-left (left half) + 3/4 back-right (right half)
    const meshBuf = res.sculpted.mesh.buf;
    const tex = res.sculpted.tex;
    const nV = meshBuf.readUInt16LE(2), nN = meshBuf.readUInt16LE(4), nF = meshBuf.readUInt16LE(6);
    const verts = [];
    for (let i = 0; i < nV; i++) {
      verts.push([meshBuf.readInt16LE(28 + i * 8), meshBuf.readInt16LE(28 + i * 8 + 2), meshBuf.readInt16LE(28 + i * 8 + 4)]);
    }
    const fBase = 28 + nV * 8 + nN * 8;
    const faces = [];
    for (let i = 0; i < nF; i++) {
      const fo = fBase + i * 28;
      faces.push({
        v: [meshBuf[fo + 4], meshBuf[fo + 5], meshBuf[fo + 6], meshBuf[fo + 7]],
        uv: [meshBuf[fo + 20], meshBuf[fo + 21], meshBuf[fo + 22], meshBuf[fo + 23],
             meshBuf[fo + 24], meshBuf[fo + 25], meshBuf[fo + 26], meshBuf[fo + 27]],
      });
    }

    const zbuf = new Float32Array(CELL_W * CELL_H).fill(1e9);
    const views = [
      { cx: 66,  cy: 108, yaw: 0.52,  pitch: 0.24, scale: 0.62 },
      { cx: 174, cy: 108, yaw: -2.42, pitch: 0.20, scale: 0.62 },
    ];
    for (const vw of views) {
      const cy = Math.cos(vw.yaw), sy = Math.sin(vw.yaw);
      const cp = Math.cos(vw.pitch), sp = Math.sin(vw.pitch);
      const proj = verts.map(([x, y, z]) => {
        const rx = x * cy + z * sy;
        const rz = -x * sy + z * cy;
        const ry2 = y * cp - rz * sp;
        const rz2 = y * sp + rz * cp;
        const persp = 420 / (420 + rz2);
        return [vw.cx + rx * vw.scale * persp, vw.cy + ry2 * vw.scale * persp, rz2];
      });
      const drawTri = (pA, uvA, pB, uvB, pC, uvC, shade) => {
        const minX = Math.max(2, Math.floor(Math.min(pA[0], pB[0], pC[0])));
        const maxX = Math.min(CELL_W - 3, Math.ceil(Math.max(pA[0], pB[0], pC[0])));
        const minY = Math.max(2, Math.floor(Math.min(pA[1], pB[1], pC[1])));
        const maxY = Math.min(CELL_H - 28, Math.ceil(Math.max(pA[1], pB[1], pC[1])));
        const denom = (pB[1] - pC[1]) * (pA[0] - pC[0]) + (pC[0] - pB[0]) * (pA[1] - pC[1]);
        if (Math.abs(denom) < 1e-4) return;
        for (let py = minY; py <= maxY; py++) {
          for (let px = minX; px <= maxX; px++) {
            const w0 = ((pB[1] - pC[1]) * (px - pC[0]) + (pC[0] - pB[0]) * (py - pC[1])) / denom;
            const w1 = ((pC[1] - pA[1]) * (px - pC[0]) + (pA[0] - pC[0]) * (py - pC[1])) / denom;
            const w2 = 1 - w0 - w1;
            if (w0 < -0.002 || w1 < -0.002 || w2 < -0.002) continue;
            const zz = w0 * pA[2] + w1 * pB[2] + w2 * pC[2];
            const zi = py * CELL_W + px;
            if (zz >= zbuf[zi]) continue;
            const tu = clamp(Math.round(w0 * uvA[0] + w1 * uvB[0] + w2 * uvC[0]), 0, tex.w - 1);
            const tv = clamp(Math.round(w0 * uvA[1] + w1 * uvB[1] + w2 * uvC[1]), 0, tex.h - 1);
            const ci = tex.px[tv * tex.w + tu];
            const rgba = tex.palRgb[ci];
            if (rgba[3] === 0) continue; // transparent 0x7C1F cutout!
            zbuf[zi] = zz;
            putPx(ox + px, oy + py,
              clamp(Math.round(rgba[0] * shade), 0, 255),
              clamp(Math.round(rgba[1] * shade), 0, 255),
              clamp(Math.round(rgba[2] * shade), 0, 255));
          }
        }
      };
      for (const f of faces) {
        const p0 = proj[f.v[0]], p1 = proj[f.v[1]], p2 = proj[f.v[2]], p3 = proj[f.v[3]];
        // Simple directional shading from screen-space normal
        const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
        const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        const light = 0.66 + 0.34 * Math.abs((nx * 0.3 - ny * 0.5 - nz * 0.8) / nl);
        drawTri(p0, [f.uv[0], f.uv[1]], p1, [f.uv[2], f.uv[3]], p2, [f.uv[4], f.uv[5]], light);
        if (f.v[2] !== f.v[3]) {
          drawTri(p1, [f.uv[2], f.uv[3]], p3, [f.uv[6], f.uv[7]], p2, [f.uv[4], f.uv[5]], light);
        }
      }
    }

    // Draw crisp label bar at bottom of cell
    for (let y = CELL_H - 22; y < CELL_H - 1; y++) {
      for (let x = 1; x < CELL_W - 1; x++) putPx(ox + x, oy + y, 16, 20, 30);
    }
    const labelCv = new IndexedCanvas(CELL_W - 8, 16, [[16,20,30],[252,216,48],[220,234,255]], false);
    labelCv.fill(0);
    labelCv.textCentered3x5(res.spec.title, 0, CELL_W - 8, 2, 1, 2);
    for (let y = 0; y < 14; y++) {
      for (let x = 0; x < CELL_W - 8; x++) {
        if (labelCv.px[y * (CELL_W - 8) + x] === 1) putPx(ox + 4 + x, oy + CELL_H - 18 + y, 252, 216, 48);
      }
    }
  });

  psxLib.writePng(outPngPath, W, H, img);
}

// ============================================================================
// 6. Exported Builder + CLI Entrypoint
// ============================================================================

function buildAllThps1CustomObjects() {
  fs.mkdirSync(STAGE_DIR, { recursive: true });
  const results = [];
  console.log('=== THPS1 Custom 3D Satirical Goal Objects Sculptor (6 Levels) ===');
  for (const spec of THPS1_OBJECT_SPECS) {
    const srcPath = path.join(FASES_DIR, spec.dir, spec.oPsx);
    const origBuf = fs.readFileSync(srcPath);
    const res = appendCustomMeshToPsx(origBuf, spec);
    const outPath = path.join(STAGE_DIR, spec.oPsx);
    fs.writeFileSync(outPath, res.out);
    const delta = res.newSize - res.origSize;
    if (delta > 5120) {
      throw new Error(`${spec.oPsx} grew by +${delta} B (> 5,120 B Heap[1] safety budget!)`);
    }
    console.log(
      `  [${spec.id}] ${spec.oPsx.padEnd(13)} +${String(delta).padStart(4)} B (${res.origSize} -> ${res.newSize} B) | ` +
      `hash=0x${spec.meshHash.toString(16).toUpperCase()} | V=${res.sculpted.mesh.nV} F=${res.sculpted.mesh.nF} ` +
      `tex=${res.sculpted.tex.w}x${res.sculpted.tex.h} 4bpp (ti=${res.newTi}) | ${spec.title}`
    );
    results.push({ spec, outPath, buf: res.out, ...res });
  }
  renderPreviewSheet(results, PREVIEW_PNG);
  console.log(`  [Preview] 6-panel 3D verification sheet -> ${PREVIEW_PNG}`);
  return results;
}

module.exports = { THPS1_OBJECT_SPECS, buildAllThps1CustomObjects };

if (require.main === module) {
  buildAllThps1CustomObjects();
}
