#!/usr/bin/env node
'use strict';

/**
 * Crash Bandicoot 3: Warped — "Tomb Time" (Egypt) Brand-New THPS2 PS1 Level Compiler
 *
 * Builds a complete, native Neversoft PS1 THPS2 (SLUS-01066) level from scratch using
 * genuine extracted Crash Bandicoot 3 Egypt textures (raw 64KB TPAG + true CLUT) and
 * genuine extracted Crash Bandicoot 3 Egypt 3D models (.OBJ + .PNG):
 *
 *   Outputs into build/egypt/:
 *     - skegyp.psx   : World geometry, collision surfFlags (0x1A00/0x1A20 VERT/0x1A02 TRIGGER/0x0001 deco),
 *                      256-entry sunlit Egyptian RGBs Gouraud palette, exact 20x20 square TAG 0x0A CWorldGrid.
 *     - skegyp_2.psx : 2-Player level geometry alias.
 *     - skegyp_l.psx : Level VRAM texture bank (16 curated Crash 3 Egypt architectural textures +
 *                      gold rail metal + 9 Crash 3 3D prop textures, 0 transparent 0x0000 holes).
 *     - skegyp_o.psx : Interactive/collectible 3D objects:
 *                        * 0x5120A107 : Real Crash 3 Emerald-Gold Scarab (Sc1mG) -> 5x Goal 5 collectibles
 *                        * nsHash('eg_vase') : Real Crash 3 Royal Pharaoh Vase (Va1iG) -> 5x Goal 4 smashables
 *     - SkEgyp_T.trg : Native THPS2 v2.0 Trigger Script (AutoExec, Re_Start_Skate/2P, 11 Grind Rails
 *                      including 360-deg Empty Pool coping + Half-Pipe lips + Pyramid Spines + Obelisk Rail,
 *                      C-R-A-S-H / S-K-A-T-E, Secret Power Crystal, 5 Golden Scarabs, 18 Cash Pickups,
 *                      5 Smashable Vases + Goal 4 Counter 0x00CB, and 4 Live Bidirectional Gaps 4300..4303).
 *     - t1rend09.bmp : 176x48 8bpp Level Select preview card (<= 5 sectors).
 *     - t1levl09.bmp : 212x52 8bpp Level Select banner card (<= 6 sectors).
 *
 * Also renders a multi-angle 3D textured QA contact sheet to build/egypt/egypt_level_3d_qa.png!
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const psxLib = require('./psx_skater_lib');

const ROOT = psxLib.rootDir;
const CRASH3_BASE = path.join(ROOT, 'crash_3_psx', 'crash3_thps2_master', '02_extracted_crash3_complete');
const RAW_TPAG_DIR = path.join(CRASH3_BASE, '03_textures_tpag', 'raw_64kb');
const USED_SHEETS_DIR = path.join(CRASH3_BASE, '03_textures_tpag', 'used_palettized_sheets');
const OBJ_DIR = path.join(CRASH3_BASE, '04_models_3d_objects', 'obj');
const OUT_DIR = path.join(ROOT, 'build', 'egypt');
const FFMPEG = psxLib.ffmpegExe;

const clamp = psxLib.clamp;
const lerp = psxLib.lerp;
const nsHash = psxLib.nsHash;

// ============================================================================
// 1. Authentic Crash 3 Egypt Texture Extractor (Raw 64KB TPAG + True CLUT)
// ============================================================================

const tpagsByName = new Map();
function loadTpags() {
  if (tpagsByName.size > 0) return;
  for (const f of fs.readdirSync(RAW_TPAG_DIR)) {
    const name = f.split('_')[0];
    tpagsByName.set(name, fs.readFileSync(path.join(RAW_TPAG_DIR, f)));
  }
}

function abgr1555ToRgba(c16) {
  if (c16 === 0) return [8, 8, 8, 255]; // never leave transparent black in opaque level textures
  const r = ((c16 & 31) << 3) | ((c16 & 31) >> 2);
  const g = (((c16 >> 5) & 31) << 3) | (((c16 >> 5) & 31) >> 2);
  const b = (((c16 >> 10) & 31) << 3) | (((c16 >> 10) & 31) >> 2);
  return [r, g, b, 255];
}

function extractTile(tpagName, bpp, subpageX, clutX, clutY, minU, minV, w, h, dstW = 64, dstH = 64) {
  const tbuf = tpagsByName.get(tpagName);
  if (!tbuf) throw new Error('Missing Crash 3 TPAG: ' + tpagName);
  const clutOff = clutY * 512 + clutX;
  const pageX = subpageX * 128;
  const out = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = minV + Math.min(h - 1, Math.floor((y * h) / dstH));
    const vv = sy & 0x7F;
    for (let x = 0; x < dstW; x++) {
      const sx = minU + Math.min(w - 1, Math.floor((x * w) / dstW));
      let c16 = 0;
      if (bpp === 0) {
        const b = tbuf[vv * 512 + ((pageX + (sx >> 1)) & 0x1FF)];
        const idx = (sx & 1) ? (b >> 4) : (b & 15);
        c16 = tbuf.readUInt16LE((clutOff + idx * 2) & 0xFFFF);
      } else {
        const idx = tbuf[vv * 512 + ((pageX + sx) & 0x1FF)];
        c16 = tbuf.readUInt16LE((clutOff + idx * 2) & 0xFFFF);
      }
      const [r, g, b, a] = abgr1555ToRgba(c16);
      const di = (y * dstW + x) * 4;
      out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = a;
    }
  }
  return out;
}

function composite2x2(tl, tr, bl, br) {
  const out = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 32; y++) {
    tl.copy(out, (y * 64 + 0) * 4, y * 32 * 4, (y + 1) * 32 * 4);
    tr.copy(out, (y * 64 + 32) * 4, y * 32 * 4, (y + 1) * 32 * 4);
    bl.copy(out, ((y + 32) * 64 + 0) * 4, y * 32 * 4, (y + 1) * 32 * 4);
    br.copy(out, ((y + 32) * 64 + 32) * 4, y * 32 * 4, (y + 1) * 32 * 4);
  }
  return out;
}

function cropRgba(src, sw, sh, cx, cy, cw, ch, dw = 64, dh = 64) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = cy + Math.min(ch - 1, Math.floor((y * ch) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = cx + Math.min(cw - 1, Math.floor((x * cw) / dw));
      const si = (sy * sw + sx) * 4;
      const di = (y * dw + x) * 4;
      out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = 255;
    }
  }
  return out;
}

function makeEgyptSkyTex(withPyramids, withSun = false) {
  const W = 64, H = 64;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    let r, g, b;
    if (t < 0.42) {
      const u = t / 0.42;
      r = Math.round(16 + u * 54);
      g = Math.round(22 + u * 48);
      b = Math.round(92 + u * 42);
    } else if (t < 0.78) {
      const u = (t - 0.42) / 0.36;
      r = Math.round(70 + u * 172);
      g = Math.round(70 + u * 86);
      b = Math.round(134 - u * 82);
    } else {
      const u = (t - 0.78) / 0.22;
      r = Math.round(242 - u * 66);
      g = Math.round(156 - u * 52);
      b = Math.round(52 - u * 16);
    }
    for (let x = 0; x < W; x++) {
      let pr = r, pg = g, pb = b;
      if (y < 24 && (((x * 37 + y * 91) & 127) === 13)) {
        pr = 250; pg = 242; pb = 200;
      }
      if (withSun) {
        // Aspect-corrected circular golden Egyptian sun (skybox panel is wider than tall -> compensate x/y!)
        const sd = Math.hypot((x - 32) * 0.72, (y - 35) * 1.18);
        if (sd < 7.5) {
          pr = 255; pg = 238; pb = 158;
        } else if (sd < 15.0) {
          const gl = 1 - (sd - 7.5) / 7.5;
          pr = Math.min(255, pr + Math.round(gl * 64));
          pg = Math.min(255, pg + Math.round(gl * 50));
          pb = Math.min(255, pb + Math.round(gl * 18));
        }
      }
      if (withPyramids) {
        const pyrs = [
          { cx: 18, baseY: 57, h: 17, halfW: 16 },
          { cx: 44, baseY: 57, h: 12, halfW: 11 },
        ];
        for (const p of pyrs) {
          if (y >= p.baseY - p.h && y <= p.baseY) {
            const frac = (y - (p.baseY - p.h)) / p.h;
            const hw = frac * p.halfW;
            if (Math.abs(x - p.cx) <= hw) {
              const lit = x >= p.cx;
              pr = lit ? Math.round(186 - frac * 34) : Math.round(92 - frac * 22);
              pg = lit ? Math.round(130 - frac * 28) : Math.round(58 - frac * 14);
              pb = lit ? Math.round(56 - frac * 14) : Math.round(36 - frac * 8);
            }
          }
        }
        if (y >= 56 + Math.round(Math.sin(x * 0.22) * 1.5)) {
          pr = 166; pg = 118; pb = 56;
        }
      }
      const di = (y * W + x) * 4;
      out[di] = pr; out[di + 1] = pg; out[di + 2] = pb; out[di + 3] = 255;
    }
  }
  return out;
}

function makeGoldRailTex() {
  const W = 32, H = 32;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const shade = 0.65 + 0.35 * Math.sin((y / (H - 1)) * Math.PI);
    for (let x = 0; x < W; x++) {
      const band = ((x >> 2) & 1) ? 1.06 : 0.94;
      const r = clamp(Math.round(238 * shade * band), 24, 255);
      const g = clamp(Math.round(188 * shade * band), 20, 240);
      const b = clamp(Math.round(52 * shade * band), 16, 140);
      const di = (y * W + x) * 4;
      out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = 255;
    }
  }
  return out;
}

function loadPngDims(pngPath) {
  const b = fs.readFileSync(pngPath);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function buildCuratedTextures() {
  loadTpags();
  const sheetEg5 = psxLib.loadRgba(
    path.join(USED_SHEETS_DIR, 'Eg5iT_sub0_bpp0_clut_x64_y0.png'),
    256,
    128
  );
  // 16 curated real Crash 3 Egypt architectural textures + 1 gold rail metal (indices 0..16)
  const list = [
    { key: 'eg_tex_00', w: 64, h: 64, rgba: extractTile('Eg1iT', 0, 3, 64, 13, 96, 96, 32, 32, 64, 64) }, // 00 plaza sandstone
    { key: 'eg_tex_01', w: 64, h: 64, rgba: extractTile('Eg3iT', 0, 2, 224, 0, 96, 32, 32, 32, 64, 64) }, // 01 ramp limestone
    { key: 'eg_tex_02', w: 64, h: 64, rgba: extractTile('Eg1iT', 1, 1, 0, 2, 0, 64, 32, 32, 64, 64) },    // 02 nemes gold/blue coping
    {
      key: 'eg_tex_03', w: 64, h: 64, rgba: composite2x2(                                                  // 03 hieroglyphs A
        extractTile('Eg4iT', 0, 2, 384, 7, 64, 32, 64, 32, 32, 32),
        extractTile('Eg4iT', 0, 2, 32, 7, 0, 96, 64, 32, 32, 32),
        extractTile('Eg4iT', 0, 2, 192, 7, 0, 32, 64, 32, 32, 32),
        extractTile('Eg4iT', 0, 2, 320, 7, 64, 64, 64, 32, 32, 32)
      ),
    },
    {
      key: 'eg_tex_04', w: 64, h: 64, rgba: composite2x2(                                                  // 04 hieroglyphs B
        extractTile('Eg4iT', 0, 2, 64, 8, 128, 32, 64, 32, 32, 32),
        extractTile('Eg4iT', 0, 2, 448, 7, 128, 96, 64, 32, 32, 32),
        extractTile('Eg4iT', 0, 2, 256, 7, 64, 96, 64, 32, 32, 32),
        extractTile('Eg4iT', 0, 2, 0, 8, 128, 64, 64, 32, 32, 32)
      ),
    },
    {
      key: 'eg_tex_05', w: 64, h: 64, rgba: composite2x2(                                                  // 05 pharaoh mural (fixed sub=0 TR!)
        extractTile('Eg2iT', 1, 0, 0, 6, 64, 32, 64, 32, 32, 32),
        extractTile('Eg2iT', 1, 0, 0, 6, 64, 64, 64, 32, 32, 32),
        extractTile('Eg2iT', 1, 1, 0, 6, 0, 64, 64, 32, 32, 32),
        extractTile('Eg2iT', 1, 1, 0, 6, 0, 96, 64, 32, 32, 32)
      ),
    },
    {
      key: 'eg_tex_06', w: 64, h: 64, rgba: composite2x2(                                                  // 06 Dr. Cortex Pharaoh Easter Egg!
        extractTile('Eg4iT', 1, 0, 0, 3, 64, 64, 64, 32, 32, 32),
        extractTile('Eg4iT', 1, 0, 0, 2, 0, 32, 64, 32, 32, 32),
        extractTile('Eg1iT', 1, 0, 0, 9, 0, 32, 64, 32, 32, 32),
        extractTile('Eg3iT', 1, 0, 0, 5, 64, 32, 64, 32, 32, 32)
      ),
    },
    { key: 'eg_tex_07', w: 64, h: 64, rgba: cropRgba(sheetEg5, 256, 128, 0, 64, 64, 64, 64, 64) },         // 07 royal blue-gold pool mosaic!
    {
      key: 'eg_tex_08', w: 64, h: 64, rgba: Buffer.concat([                                                // 08 pool serpent wave wall
        extractTile('Eg3iT', 0, 3, 224, 6, 32, 96, 32, 32, 64, 16),
        extractTile('Eg1iT', 0, 3, 160, 12, 32, 32, 32, 32, 64, 48),
      ]),
    },
    { key: 'eg_tex_09', w: 64, h: 64, rgba: extractTile('Eg1iT', 1, 1, 0, 6, 64, 64, 32, 32, 64, 64) },    // 09 jeweled gold trim
    { key: 'eg_tex_10', w: 64, h: 64, rgba: extractTile('Eg1AT', 0, 1, 96, 0, 192, 32, 32, 32, 64, 64) },  // 10 zigzag temple cornice
    { key: 'eg_tex_11', w: 64, h: 64, rgba: extractTile('Eg4iT', 0, 1, 160, 5, 128, 96, 64, 32, 64, 64) }, // 11 pyramid stone masonry
    { key: 'eg_tex_12', w: 64, h: 64, rgba: extractTile('Eg1iT', 0, 0, 480, 10, 128, 32, 64, 64, 64, 64) },// 12 lapis pillar texture
    { key: 'eg_tex_13', w: 64, h: 64, rgba: extractTile('Eg1iT', 0, 3, 480, 12, 64, 32, 32, 32, 64, 64) }, // 13 gold temple door
    { key: 'eg_tex_14', w: 64, h: 64, rgba: extractTile('Eg1AT', 0, 2, 288, 0, 0, 32, 32, 32, 64, 64) },   // 14 desert sand dunes
    { key: 'eg_tex_15', w: 64, h: 64, rgba: makeEgyptSkyTex(true, false) },                                // 15 twilight sky + Giza silhouettes
    { key: 'eg_tex_16', w: 32, h: 32, rgba: makeGoldRailTex() },                                           // 16 metallic gold grind rail
    { key: 'eg_tex_17', w: 64, h: 64, rgba: makeEgyptSkyTex(false, false) },                               // 17 twilight upper dome sky
    { key: 'eg_tex_18', w: 64, h: 64, rgba: makeEgyptSkyTex(false, true) },                                // 18 single North golden sunset disc!
  ];
  return list;
}

// Texture index constants for architectural surfaces
const T = {
  PLAZA: 0,
  RAMP: 1,
  COPING: 2,
  HIERO_A: 3,
  HIERO_B: 4,
  PHARAOH: 5,
  CORTEX: 6,
  POOL_MOSAIC: 7,
  POOL_WALL: 8,
  TRIM: 9,
  CORNICE: 10,
  PYRAMID: 11,
  PILLAR: 12,
  DOOR: 13,
  SAND: 14,
  SKY_PYR: 15,
  RAIL: 16,
  SKY_TOP: 17,
  SKY_SUN: 18,
};

// ============================================================================
// 2. Crash 3 Egypt Real 3D .OBJ Model Loader (+ Zero-Bleed 64x64 Texture Prep)
// ============================================================================

function loadCrash3Obj(dirName) {
  const fullDir = path.join(OBJ_DIR, dirName);
  const files = fs.readdirSync(fullDir);
  const objPath = path.join(fullDir, files.find(f => f.endsWith('.obj')));
  const pngPath = path.join(fullDir, files.find(f => f.endsWith('.png')));
  const dims = loadPngDims(pngPath);
  // Downscale 256x256 Crash 3 model atlas to crisp 64x64 for PS1 VRAM economy
  const texW = 64, texH = 64;
  const rgba = psxLib.loadRgba(pngPath, texW, texH);
  // Ensure zero dark transparent holes in opaque 3D props
  for (let i = 0; i < texW * texH; i++) {
    rgba[i * 4 + 3] = 255;
    if (rgba[i * 4] < 8 && rgba[i * 4 + 1] < 8 && rgba[i * 4 + 2] < 8) {
      rgba[i * 4] = 12; rgba[i * 4 + 1] = 10; rgba[i * 4 + 2] = 12;
    }
  }

  const txt = fs.readFileSync(objPath, 'utf8');
  const verts = [];
  const uvs = [];
  const tris = [];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const raw of txt.split(/\r?\n/)) {
    const ln = raw.trim();
    if (ln.startsWith('v ')) {
      const [, x, y, z] = ln.split(/\s+/).map(Number);
      verts.push([x, y, z]);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    } else if (ln.startsWith('vt ')) {
      const [, u, v] = ln.split(/\s+/).map(Number);
      uvs.push([u, v]);
    } else if (ln.startsWith('f ')) {
      const parts = ln.split(/\s+/).slice(1);
      const idx = parts.map(tok => {
        const [vi, ti] = tok.split('/');
        return { vi: parseInt(vi, 10) - 1, ti: ti ? parseInt(ti, 10) - 1 : 0 };
      });
      for (let k = 1; k + 1 < idx.length; k++) {
        tris.push([idx[0], idx[k], idx[k + 1]]);
      }
    }
  }
  return {
    name: dirName,
    verts,
    uvs,
    tris,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 },
    texW,
    texH,
    rgba,
    srcDims: dims,
  };
}

// ============================================================================
// 3. 256-Entry Sunlit Egyptian RGBs Gouraud Palette (Level Geometry)
// ============================================================================

function buildEgyptRgbsPalette() {
  // 256 x { r, g, b, 0 } — 0x80 = 1.0x neutral; warm golden desert sun + cool lapis pool shadows!
  const pal = [];
  // 0..31: Warm golden sandstone ramp (dark shadow -> bright sunlit gold)
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    pal.push([
      clamp(Math.round(52 + t * 124), 16, 200),
      clamp(Math.round(46 + t * 114), 16, 188),
      clamp(Math.round(38 + t * 96), 16, 168),
    ]);
  }
  // 32..63: Neutral bright whites/creams (for faithful Crash 3 murals, Cortex egg, statues, skybox!)
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    const v = clamp(Math.round(64 + t * 108), 16, 180);
    pal.push([v, v, v]);
  }
  // 64..95: Cool Egyptian temple / recessed pool shading (subtle lapis tint in deep pool!)
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    pal.push([
      clamp(Math.round(56 + t * 92), 16, 168),
      clamp(Math.round(60 + t * 96), 16, 172),
      clamp(Math.round(76 + t * 100), 16, 188),
    ]);
  }
  // 96..127: Sunset amber/terracotta (for Great Pyramids & distant monuments)
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    pal.push([
      clamp(Math.round(72 + t * 124), 16, 210),
      clamp(Math.round(52 + t * 104), 16, 176),
      clamp(Math.round(38 + t * 72), 16, 132),
    ]);
  }
  while (pal.length < 256) pal.push([128, 128, 128]);
  return pal;
}

const RGBS_PAL = buildEgyptRgbsPalette();

// Helpers mapping directional sun lighting onto palette indices
const SUN_DIR = (() => {
  // Sun shines from South-West & high above: vector pointing TOWARD sun = (-0.45, -0.78, +0.43) (since -Y is UP!)
  const x = -0.45, y = -0.78, z = 0.43;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();

function shadeColorIdx(nx, ny, nz, family = 'sand', boost = 0) {
  const dot = nx * SUN_DIR[0] + ny * SUN_DIR[1] + nz * SUN_DIR[2];
  const lum = clamp(0.56 + dot * 0.36 + boost, 0.08, 1.0);
  const step = Math.round(lum * 31);
  if (family === 'neutral') return 32 + step;
  if (family === 'pool') return 64 + step;
  if (family === 'sunset') return 96 + step;
  return step; // 'sand'
}

// ============================================================================
// 4. Native THPS2 Level Mesh Builder (Exact PS1 Winding, Normals & Chunk Splitting)
// ============================================================================

class LevelSectorMesh {
  constructor(name, { isTriggerOnly = false, collidable = true } = {}) {
    this.name = name;
    this.hash = nsHash(name);
    this.isTriggerOnly = isTriggerOnly;
    this.collidable = collidable;
    this.verts = [];
    this.norms = [];
    this.faces = [];
    this.vertMap = new Map();
  }

  addV(x, y, z, dedup = true) {
    const rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    if (dedup) {
      const k = `${rx},${ry},${rz}`;
      const ex = this.vertMap.get(k);
      if (ex !== undefined) return ex;
      const idx = this.verts.length;
      if (idx >= 245) throw new Error(`Mesh ${this.name} exceeded 245 vertices! Split sector.`);
      this.verts.push([rx, ry, rz]);
      this.vertMap.set(k, idx);
      return idx;
    }
    const idx = this.verts.length;
    if (idx >= 245) throw new Error(`Mesh ${this.name} exceeded 245 vertices! Split sector.`);
    this.verts.push([rx, ry, rz]);
    return idx;
  }

  addN(nx, ny, nz) {
    const len = Math.hypot(nx, ny, nz) || 1;
    const fx = clamp(Math.round((nx / len) * 4096), -4096, 4096);
    const fy = clamp(Math.round((ny / len) * 4096), -4096, 4096);
    const fz = clamp(Math.round((nz / len) * 4096), -4096, 4096);
    for (let i = 0; i < this.norms.length; i++) {
      const n = this.norms[i];
      if (Math.abs(n[0] - fx) < 48 && Math.abs(n[1] - fy) < 48 && Math.abs(n[2] - fz) < 48) return i;
    }
    this.norms.push([fx, fy, fz]);
    return this.norms.length - 1;
  }

  /**
   * Add a textured Gouraud quad in Z-order [v0(TL), v1(TR), v2(BL), v3(BR)].
   * Automatically enforces PS1 front-facing winding: dot(cross(p1 - p0, p2 - p0), outNormal) < 0!
   * Uses fl=0x3823 (32 B, hardware-subdivided GT4) on large surfaces, or fl=0x1803 (28 B) on smaller ones.
   */
  addQuad(p0, p1, p2, p3, texIdx, surfFlags, {
    outNormal = null,
    uv = [0, 0, 63, 0, 0, 63, 63, 63],
    colors = null,
    family = 'sand',
    boost = 0,
    subdiv = false,
  } = {}) {
    const v0 = this.addV(p0[0], p0[1], p0[2]);
    const v1 = this.addV(p1[0], p1[1], p1[2]);
    const v2 = this.addV(p2[0], p2[1], p2[2]);
    const v3 = this.addV(p3[0], p3[1], p3[2]);

    const a = this.verts[v0], b = this.verts[v1], c = this.verts[v2];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let cx = e1[1] * e2[2] - e1[2] * e2[1];
    let cy = e1[2] * e2[0] - e1[0] * e2[2];
    let cz = e1[0] * e2[1] - e1[1] * e2[0];
    const cl = Math.hypot(cx, cy, cz);
    if (cl < 1e-4) return;

    // Default outward normal = -normalize(cross) so dot(cross, outN) < 0
    let nx, ny, nz;
    let q = [v0, v1, v2, v3];
    let quv = uv.slice();
    let qcol;
    if (outNormal) {
      const ol = Math.hypot(outNormal[0], outNormal[1], outNormal[2]) || 1;
      nx = outNormal[0] / ol; ny = outNormal[1] / ol; nz = outNormal[2] / ol;
      const dot = cx * nx + cy * ny + cz * nz;
      if (dot > 0) {
        // Flip horizontal Z-order to satisfy dot(cross(p1-p0, p2-p0), outNormal) < 0
        q = [v1, v0, v3, v2];
        quv = [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]];
        if (colors) qcol = [colors[1], colors[0], colors[3], colors[2]];
      } else {
        if (colors) qcol = colors.slice();
      }
    } else {
      nx = -cx / cl; ny = -cy / cl; nz = -cz / cl;
      if (colors) qcol = colors.slice();
    }
    if (!qcol) {
      const ci = shadeColorIdx(nx, ny, nz, family, boost);
      qcol = [ci, ci, ci, ci];
    }
    const ni = this.addN(nx, ny, nz);
    this.faces.push({
      fl: subdiv ? 0x3823 : 0x1803,
      sz: subdiv ? 32 : 28,
      v: q,
      c: qcol,
      ni,
      sf: surfFlags,
      ti: texIdx,
      uv: quv,
    });
  }

  /**
   * Add a textured Gouraud triangle (fl=0x1813, 28 B) — ideal for real Crash 3 3D props!
   */
  addTri(p0, p1, p2, texIdx, surfFlags, {
    outNormal = null,
    uv = [0, 0, 63, 0, 32, 63],
    colors = null,
    family = 'neutral',
    boost = 0.08,
  } = {}) {
    const v0 = this.addV(p0[0], p0[1], p0[2]);
    const v1 = this.addV(p1[0], p1[1], p1[2]);
    const v2 = this.addV(p2[0], p2[1], p2[2]);
    if (v0 === v1 || v1 === v2 || v0 === v2) return;

    const a = this.verts[v0], b = this.verts[v1], c = this.verts[v2];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    const cl = Math.hypot(cx, cy, cz);
    if (cl < 1e-4) return;

    let nx, ny, nz;
    let tv = [v0, v1, v2, 0];
    let tuv = [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], 0, 0];
    let tcol;
    if (outNormal) {
      const ol = Math.hypot(outNormal[0], outNormal[1], outNormal[2]) || 1;
      nx = outNormal[0] / ol; ny = outNormal[1] / ol; nz = outNormal[2] / ol;
      if (cx * nx + cy * ny + cz * nz > 0) {
        tv = [v1, v0, v2, 0];
        tuv = [uv[2], uv[3], uv[0], uv[1], uv[4], uv[5], 0, 0];
        if (colors) tcol = [colors[1], colors[0], colors[2], 0];
      } else {
        if (colors) tcol = [colors[0], colors[1], colors[2], 0];
      }
    } else {
      nx = -cx / cl; ny = -cy / cl; nz = -cz / cl;
      if (colors) tcol = [colors[0], colors[1], colors[2], 0];
    }
    if (!tcol) {
      const ci = shadeColorIdx(nx, ny, nz, family, boost);
      tcol = [ci, ci, ci, 0];
    }
    const ni = this.addN(nx, ny, nz);
    this.faces.push({
      fl: 0x1813,
      sz: 28,
      v: tv,
      c: tcol,
      ni,
      sf: surfFlags,
      ti: texIdx,
      uv: tuv,
    });
  }

  /**
   * Add an invisible THPS2 Trigger Box quad (fl=0x0080, sz=16 B, sf=0x0002) matching skhan.psx mesh #102!
   */
  addInvisibleTriggerQuad(p0, p1, p2, p3, outNormal) {
    const v0 = this.addV(p0[0], p0[1], p0[2]);
    const v1 = this.addV(p1[0], p1[1], p1[2]);
    const v2 = this.addV(p2[0], p2[1], p2[2]);
    const v3 = this.addV(p3[0], p3[1], p3[2]);
    const a = this.verts[v0], b = this.verts[v1], c = this.verts[v2];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    let q = [v0, v1, v2, v3];
    if (cx * outNormal[0] + cy * outNormal[1] + cz * outNormal[2] > 0) {
      q = [v1, v0, v3, v2];
    }
    const ni = this.addN(outNormal[0], outNormal[1], outNormal[2]);
    this.faces.push({
      fl: 0x0080,
      sz: 16,
      v: q,
      c: [0, 0, 0, 0],
      ni,
      sf: 0x0002,
      ti: 0,
      uv: null,
    });
  }

  /**
   * Build local-space binary mesh chunk + return world origin (cx, cy, cz) and bounding radius/box.
   * Re-centers vertices around mesh centroid so i16 local coords NEVER overflow even at R=7500!
   */
  compile() {
    if (this.verts.length === 0 || this.faces.length === 0) return null;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, y, z] of this.verts) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const ox = Math.round((x0 + x1) / 2);
    const oy = Math.round((y0 + y1) / 2);
    const oz = Math.round((z0 + z1) / 2);

    let lx0 = 1e9, lx1 = -1e9, ly0 = 1e9, ly1 = -1e9, lz0 = 1e9, lz1 = -1e9, maxR = 0;
    const localVerts = this.verts.map(([x, y, z]) => {
      const lx = x - ox, ly = y - oy, lz = z - oz;
      if (Math.abs(lx) > 32000 || Math.abs(ly) > 32000 || Math.abs(lz) > 32000) {
        throw new Error(`Mesh ${this.name} local coord overflow!`);
      }
      if (lx < lx0) lx0 = lx; if (lx > lx1) lx1 = lx;
      if (ly < ly0) ly0 = ly; if (ly > ly1) ly1 = ly;
      if (lz < lz0) lz0 = lz; if (lz > lz1) lz1 = lz;
      const r = Math.hypot(lx, ly, lz);
      if (r > maxR) maxR = r;
      return [lx, ly, lz];
    });

    const nV = localVerts.length;
    const nN = this.norms.length;
    const nF = this.faces.length;
    const faceBytes = this.faces.reduce((s, f) => s + f.sz, 0);
    const totalLen = (28 + nV * 8 + nN * 8 + faceBytes + 3) & ~3;
    const buf = Buffer.alloc(totalLen, 0);

    buf.writeUInt16LE(0x0008, 0);
    buf.writeUInt16LE(nV, 2);
    buf.writeUInt16LE(nN, 4);
    buf.writeUInt16LE(nF, 6);
    buf.writeUInt32LE((Math.ceil(maxR) << 12) >>> 0, 8);
    buf.writeInt16LE(lx1, 12); buf.writeInt16LE(lx0, 14);
    buf.writeInt16LE(ly1, 16); buf.writeInt16LE(ly0, 18);
    buf.writeInt16LE(lz1, 20); buf.writeInt16LE(lz0, 22);
    buf.writeUInt32LE(0xFFFF7FFF >>> 0, 24); // NEVER clip near/far prematurely!

    let p = 28;
    for (const [lx, ly, lz] of localVerts) {
      buf.writeInt16LE(lx, p);
      buf.writeInt16LE(ly, p + 2);
      buf.writeInt16LE(lz, p + 4);
      buf.writeInt16LE(0, p + 6);
      p += 8;
    }
    for (const [nx, ny, nz] of this.norms) {
      buf.writeInt16LE(nx, p);
      buf.writeInt16LE(ny, p + 2);
      buf.writeInt16LE(nz, p + 4);
      buf.writeInt16LE(0, p + 6);
      p += 8;
    }
    for (const f of this.faces) {
      buf.writeUInt16LE(f.fl, p);
      buf.writeUInt16LE(f.sz, p + 2);
      buf[p + 4] = f.v[0]; buf[p + 5] = f.v[1]; buf[p + 6] = f.v[2]; buf[p + 7] = f.v[3];
      buf[p + 8] = f.c[0]; buf[p + 9] = f.c[1]; buf[p + 10] = f.c[2]; buf[p + 11] = f.c[3];
      buf.writeUInt16LE(f.ni, p + 12);
      buf.writeUInt16LE(f.sf, p + 14);
      if (f.sz >= 28) {
        buf.writeUInt32LE(f.ti >>> 0, p + 16);
        for (let k = 0; k < 8; k++) buf[p + 20 + k] = f.uv[k];
      }
      if (f.sz === 32) {
        buf.writeUInt32LE(0, p + 28);
      }
      p += f.sz;
    }

    return {
      name: this.name,
      hash: this.hash,
      buf,
      ox, oy, oz,
      worldMin: [x0, y0, z0],
      worldMax: [x1, y1, z1],
      rad: Math.ceil(maxR),
      collidable: this.collidable,
      isTriggerOnly: this.isTriggerOnly,
      worldVerts: this.verts,
      faces: this.faces,
      norms: this.norms,
    };
  }
}

// ============================================================================
// 5. Arena Geometry Builders (Courtyard, Empty Pool, Grand Half-Pipe, Pyramid,
//    Sphinx Arch, Ledges, Corner QPs, Real Crash 3 3D Props, Skybox)
// ============================================================================

const SF_FLOOR   = 0x1A00; // Solid stone/concrete floor & lower transition
const SF_VERT    = 0x1A20; // Solid stone + VERT launch!
const SF_TRIG    = 0x1A02; // Solid stone + TRIGGER (Gaps!)
const SF_VERT_TG = 0x1A22; // Solid stone + VERT + TRIGGER!
const SF_WALL    = 0x0180; // Solid wallrideable temple wall
const SF_DECO    = 0x0001; // Visual-only non-collidable (statues, outer pyramids, skybox)

/**
 * Place a real extracted Crash 3 3D OBJ model into the level at world (wx, wyGround, wz),
 * scaled to exact targetHeight (in THPS2 units, where skater height ≈ 95..110), rotated by yawRad,
 * resting with its lowest point at wyGround (THPS2 -Y is UP!).
 */
function addCrash3PropSector(sectors, sectorName, objData, texIdx, wx, wyGround, wz, targetHeight, yawRad = 0, surfFlags = SF_DECO, family = 'neutral', boost = 0.14) {
  const b = objData.bounds;
  const srcH = Math.max(0.05, b.maxY - b.minY);
  const scale = targetHeight / srcH;
  const cy = Math.cos(yawRad), sy = Math.sin(yawRad);

  // Transform Crash 3 (+Y UP) -> THPS2 (-Y UP) with bottom anchored at wyGround
  const xform = ([x, y, z]) => {
    const dx = (x - b.cx) * scale;
    const dz = (z - b.cz) * scale;
    const rx = dx * cy - dz * sy;
    const rz = dx * sy + dz * cy;
    const ry = wyGround - (y - b.minY) * scale;
    return [wx + rx, ry, wz + rz];
  };

  // Split automatically if model > 220 unique verts (all our models are 16..191 verts -> 1 sector each!)
  const m = new LevelSectorMesh(sectorName, { collidable: (surfFlags & 1) === 0 });
  const maxU = objData.texW - 1, maxV = objData.texH - 1;

  // Estimate geometric centroid of transformed model for outward normal hint on closed shells
  const cWorld = [wx, wyGround - targetHeight * 0.5, wz];

  for (const [t0, t1, t2] of objData.tris) {
    const p0 = xform(objData.verts[t0.vi]);
    const p1 = xform(objData.verts[t1.vi]);
    const p2 = xform(objData.verts[t2.vi]);

    // Original Crash 3 OBJ triangle normal in +Y space -> flip Y when converting to THPS2 (-Y UP)!
    // Notice negating Y flips handedness once, so cross_thps2(p1-p0, p2-p0) points INWARD relative to +Y CCW,
    // which means dot(cross_thps2(p1-p0, p2-p0), outNormal) < 0 ALREADY holds for outward faces!
    // Verify via geometric face normal in OBJ space mapped to THPS2 space!
    const ov0 = objData.verts[t0.vi], ov1 = objData.verts[t1.vi], ov2 = objData.verts[t2.vi];
    const oe1 = [ov1[0] - ov0[0], ov1[1] - ov0[1], ov1[2] - ov0[2]];
    const oe2 = [ov2[0] - ov0[0], ov2[1] - ov0[1], ov2[2] - ov0[2]];
    const onx = oe1[1] * oe2[2] - oe1[2] * oe2[1];
    const ony = oe1[2] * oe2[0] - oe1[0] * oe2[2];
    const onz = oe1[0] * oe2[1] - oe1[1] * oe2[0];
    const ol = Math.hypot(onx, ony, onz);
    if (ol < 1e-6) continue;
    // Rotate normal by yawRad and negate Y!
    const wn = [
      (onx * cy - onz * sy) / ol,
      -ony / ol,
      (onx * sy + onz * cy) / ol,
    ];

    // Map OBJ UVs (v=0 bottom -> v=0 top) with 0.06 centroid inset to eliminate 64x64 atlas bleed!
    const rawUv = [t0, t1, t2].map(k => {
      const uv = objData.uvs[k.ti] || [0.5, 0.5];
      return [clamp(uv[0], 0, 1), clamp(1 - uv[1], 0, 1)];
    });
    const uC = (rawUv[0][0] + rawUv[1][0] + rawUv[2][0]) / 3;
    const vC = (rawUv[0][1] + rawUv[1][1] + rawUv[2][1]) / 3;
    const inset = 0.07;
    const uvPsx = [];
    for (const [u, v] of rawUv) {
      const iu = u + (uC - u) * inset;
      const iv = v + (vC - v) * inset;
      uvPsx.push(clamp(Math.round(iu * maxU), 0, maxU), clamp(Math.round(iv * maxV), 0, maxV));
    }
    m.addTri(p0, p1, p2, texIdx, surfFlags, {
      outNormal: wn,
      uv: uvPsx,
      family,
      boost,
    });
  }
  const c = m.compile();
  if (c) sectors.push(c);
}

/**
 * Helper to add a subdivided flat floor patch (keeps quads <= 350 units -> zero PS1 affine distortion!).
 */
function addFloorGrid(sectors, name, x0, x1, z0, z1, y, texIdx, surfFlags, tileStep = 300, family = 'sand', boost = 0.04) {
  const nx = Math.max(1, Math.round((x1 - x0) / tileStep));
  const nz = Math.max(1, Math.round((z1 - z0) / tileStep));
  const m = new LevelSectorMesh(name, { collidable: (surfFlags & 1) === 0 });
  for (let iz = 0; iz < nz; iz++) {
    const za = lerp(z0, z1, iz / nz), zb = lerp(z0, z1, (iz + 1) / nz);
    for (let ix = 0; ix < nx; ix++) {
      const xa = lerp(x0, x1, ix / nx), xb = lerp(x0, x1, (ix + 1) / nx);
      m.addQuad(
        [xa, y, za], [xb, y, za], [xa, y, zb], [xb, y, zb],
        texIdx, surfFlags,
        { outNormal: [0, -1, 0], family, boost, subdiv: true }
      );
    }
  }
  const c = m.compile();
  if (c) sectors.push(c);
}

/**
 * Build a smooth 4-band circular-arc Quarter-Pipe curve strip along an extrusion axis!
 * Matches Neversoft's exact Marseille Pool / Hangar Half-Pipe transition math (lower 2 bands SF_FLOOR, upper 2 bands SF_VERT).
 *
 *   basePos(s) : point on bottom inner toe of the transition at parameter s in [0..1]
 *   outDir     : horizontal unit vector pointing FROM flat bottom TOWARD lip/wall
 *   R          : transition radius & height (goes from yBottom up to yBottom - R)
 */
function addTransitionBands(mesh, baseStart, baseEnd, outDir, yBottom, R, segsAlong, texIdx, {
  bands = 4,
  baseSf = SF_FLOOR,
  vertSf = SF_VERT,
  family = 'sand',
  boost = 0.04,
  copingTopBand = true,
  copingTex = T.COPING,
} = {}) {
  const angles = [];
  for (let b = 0; b <= bands; b++) {
    // 0 -> 22.5 -> 45 -> 67.5 -> 86 deg (prevents exact 90-deg vertical raycast degeneracy!)
    angles.push((b / bands) * (86 * Math.PI / 180));
  }
  for (let b = 0; b < bands; b++) {
    const a0 = angles[b], a1 = angles[b + 1];
    const d0 = R * Math.sin(a0), h0 = R * (1 - Math.cos(a0));
    const d1 = R * Math.sin(a1), h1 = R * (1 - Math.cos(a1));
    const midA = (a0 + a1) * 0.5;
    // Outward normal points INWARD toward skater (-outDir * sin(midA) + UP * cos(midA)), where UP = (0, -1, 0)
    const nOut = [-outDir[0] * Math.sin(midA), -Math.cos(midA), -outDir[2] * Math.sin(midA)];
    const sf = (b >= bands - 2) ? vertSf : baseSf;
    const useTex = (copingTopBand && b === bands - 1) ? copingTex : texIdx;
    const v0 = Math.round((1 - (b + 1) / bands) * 63);
    const v1 = Math.round((1 - b / bands) * 63);

    for (let s = 0; s < segsAlong; s++) {
      const t0 = s / segsAlong, t1 = (s + 1) / segsAlong;
      const bx0 = lerp(baseStart[0], baseEnd[0], t0), bz0 = lerp(baseStart[2], baseEnd[2], t0);
      const bx1 = lerp(baseStart[0], baseEnd[0], t1), bz1 = lerp(baseStart[2], baseEnd[2], t1);

      const pLow0  = [bx0 + outDir[0] * d0, yBottom - h0, bz0 + outDir[2] * d0];
      const pLow1  = [bx1 + outDir[0] * d0, yBottom - h0, bz1 + outDir[2] * d0];
      const pHigh0 = [bx0 + outDir[0] * d1, yBottom - h1, bz0 + outDir[2] * d1];
      const pHigh1 = [bx1 + outDir[0] * d1, yBottom - h1, bz1 + outDir[2] * d1];

      mesh.addQuad(
        pHigh0, pHigh1, pLow0, pLow1,
        useTex, sf,
        {
          outNormal: nOut,
          uv: useTex === copingTex ? [0, 0, 63, 0, 0, 63, 63, 63] : [0, v0, 63, v0, 0, v1, 63, v1],
          family,
          boost,
          subdiv: true,
        }
      );
    }
  }
}

/**
 * Build a smooth 3D concave quarter-bowl corner (4 azimuth slices x 4 elevation bands)
 * for the Empty Pharaoh Swimming Pool!
 * Corner center sits at (cx, yBottom, cz); wall sweeps from azStart to azEnd at radius R.
 */
function addPoolCorner(mesh, cx, cz, yBottom, R, azStart, azEnd, {
  azSteps = 4,
  bands = 4,
  texWall = T.POOL_WALL,
  texCoping = T.COPING,
} = {}) {
  const angles = [];
  for (let b = 0; b <= bands; b++) angles.push((b / bands) * (86 * Math.PI / 180));

  for (let b = 0; b < bands; b++) {
    const a0 = angles[b], a1 = angles[b + 1];
    const r0 = R * Math.sin(a0), h0 = R * (1 - Math.cos(a0));
    const r1 = R * Math.sin(a1), h1 = R * (1 - Math.cos(a1));
    const midA = (a0 + a1) * 0.5;
    const sf = (b >= bands - 2) ? SF_VERT : SF_FLOOR;
    const useTex = (b === bands - 1) ? texCoping : texWall;

    for (let s = 0; s < azSteps; s++) {
      const th0 = lerp(azStart, azEnd, s / azSteps);
      const th1 = lerp(azStart, azEnd, (s + 1) / azSteps);
      const midTh = (th0 + th1) * 0.5;
      const nOut = [-Math.cos(midTh) * Math.sin(midA), -Math.cos(midA), -Math.sin(midTh) * Math.sin(midA)];

      const pLow0  = [cx + Math.cos(th0) * r0, yBottom - h0, cz + Math.sin(th0) * r0];
      const pLow1  = [cx + Math.cos(th1) * r0, yBottom - h0, cz + Math.sin(th1) * r0];
      const pHigh0 = [cx + Math.cos(th0) * r1, yBottom - h1, cz + Math.sin(th0) * r1];
      const pHigh1 = [cx + Math.cos(th1) * r1, yBottom - h1, cz + Math.sin(th1) * r1];

      mesh.addQuad(
        pHigh0, pHigh1, pLow0, pLow1,
        useTex, sf,
        {
          outNormal: nOut,
          uv: [0, 0, 63, 0, 0, 63, 63, 63],
          family: 'pool',
          boost: b * 0.05,
        }
      );
    }
  }
}

/**
 * Add a solid 3D rectangular block/box (e.g., grind ledges, pyramid support pillars, temple arch piers).
 */
function addBox(mesh, x0, yTop, z0, x1, yBot, z1, texSide, texTop, sfSide = SF_WALL, sfTop = SF_FLOOR, family = 'sand', boost = 0.04) {
  // Top face (Y = yTop, normal = (0, -1, 0))
  if (texTop !== null) {
    mesh.addQuad(
      [x0, yTop, z0], [x1, yTop, z0], [x0, yTop, z1], [x1, yTop, z1],
      texTop, sfTop, { outNormal: [0, -1, 0], family, boost: boost + 0.08 }
    );
  }
  // North (-Z)
  mesh.addQuad([x1, yTop, z0], [x0, yTop, z0], [x1, yBot, z0], [x0, yBot, z0], texSide, sfSide, { outNormal: [0, 0, -1], family, boost });
  // South (+Z)
  mesh.addQuad([x0, yTop, z1], [x1, yTop, z1], [x0, yBot, z1], [x1, yBot, z1], texSide, sfSide, { outNormal: [0, 0, 1], family, boost });
  // West (-X)
  mesh.addQuad([x0, yTop, z0], [x0, yTop, z1], [x0, yBot, z0], [x0, yBot, z1], texSide, sfSide, { outNormal: [-1, 0, 0], family, boost });
  // East (+X)
  mesh.addQuad([x1, yTop, z1], [x1, yTop, z0], [x1, yBot, z1], [x1, yBot, z0], texSide, sfSide, { outNormal: [1, 0, 0], family, boost });
}

/**
 * Add a visible golden 3D rail bar along a polyline (visual-only SF_DECO; actual grinding uses Type 10 RailDef!).
 */
function addVisualRailBar(mesh, pts, halfW = 7, height = 10) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * halfW, pz = (dx / len) * halfW;
    const atL = [a[0] - px, a[1], a[2] - pz], atR = [a[0] + px, a[1], a[2] + pz];
    const btL = [b[0] - px, b[1], b[2] - pz], btR = [b[0] + px, b[1], b[2] + pz];
    const abL = [a[0] - px, a[1] + height, a[2] - pz], abR = [a[0] + px, a[1] + height, a[2] + pz];
    const bbL = [b[0] - px, b[1] + height, b[2] - pz], bbR = [b[0] + px, b[1] + height, b[2] + pz];
    const uv = [0, 0, 31, 0, 0, 31, 31, 31];
    mesh.addQuad(atL, atR, btL, btR, T.RAIL, SF_DECO, { outNormal: [0, -1, 0], uv, family: 'sunset', boost: 0.28 });
    mesh.addQuad(atL, btL, abL, bbL, T.RAIL, SF_DECO, { outNormal: [-px, 0, -pz], uv, family: 'sunset', boost: 0.14 });
    mesh.addQuad(btR, atR, bbR, abR, T.RAIL, SF_DECO, { outNormal: [px, 0, pz], uv, family: 'sunset', boost: 0.14 });
  }
}

function buildEgyptWorld(textures, props) {
  const sectors = [];

  // --------------------------------------------------------------------------
  // TRUE NEVERSOFT MARSEILLE / VENICE SCALE (X,Z in [-5000..+5000] = 10,000 x 10,000 units!)
  //   A. COURTYARD SANDSTONE PLAZA (Y=0, exact Empty Pool cutout X in [+1700..+4200], Z in [-1250..+1250])
  // --------------------------------------------------------------------------
  // Helper splitting wide areas into <= 2200-unit sectors so every mesh stays < 100 verts & zero affine warp!
  const addTiledPlaza = (prefix, x0, x1, z0, z1, texIdx = T.PLAZA, sf = SF_FLOOR, tileStep = 450, boost = 0.04) => {
    const sx = Math.max(1, Math.ceil((x1 - x0) / 1800));
    const sz = Math.max(1, Math.ceil((z1 - z0) / 1800));
    let k = 0;
    for (let iz = 0; iz < sz; iz++) {
      const za = Math.round(lerp(z0, z1, iz / sz)), zb = Math.round(lerp(z0, z1, (iz + 1) / sz));
      for (let ix = 0; ix < sx; ix++) {
        const xa = Math.round(lerp(x0, x1, ix / sx)), xb = Math.round(lerp(x0, x1, (ix + 1) / sx));
        addFloorGrid(sectors, `${prefix}_${k++}`, xa, xb, za, zb, 0, texIdx, sf, tileStep, 'sand', boost);
      }
    }
  };
  // North Strip (Z in [-5000..-1250])
  addTiledPlaza('eg_plaza_n', -5000,  5000, -5000, -1250);
  // South Strip (Z in [+1250..+5000])
  addTiledPlaza('eg_plaza_s', -5000,  5000,  1250,  5000);
  // Mid-West & Central Strip (Z in [-1250..+1250], X in [-5000..+1100])
  addTiledPlaza('eg_plaza_m', -5000,  1100, -1250,  1250);
  // Gap 4300 Launch/Land strips right beside Empty Pharaoh Pool (SF_TRIG = 0x1A02!)
  addFloorGrid(sectors, 'eg_gap_pool_w', 1100, 1700, -1250, 1250, 0, T.TRIM, SF_TRIG, 500, 'sand', 0.14);
  addFloorGrid(sectors, 'eg_gap_pool_e', 4200, 5000, -1250, 1250, 0, T.TRIM, SF_TRIG, 500, 'sand', 0.14);

  // --------------------------------------------------------------------------
  // B. EMPTY PHARAOH SWIMMING POOL / BOWL (X in [+1700..+4200], Z in [-1250..+1250], depth Y=+520!)
  //    True Marseille-scale recessed bowl: Royal Blue-Gold Mosaic floor + 4-band curved VERT walls + 4 corners!
  // --------------------------------------------------------------------------
  const poolR = 520;
  const pX0 = 1700, pX1 = 4200, pZ0 = -1250, pZ1 = 1250;
  const pInX0 = pX0 + poolR; // 2220
  const pInX1 = pX1 - poolR; // 3680
  const pInZ0 = pZ0 + poolR; // -730
  const pInZ1 = pZ1 - poolR; // +730

  // Recessed Pool Floor (Royal Blue & Gold Crash 3 Mosaic!)
  addFloorGrid(sectors, 'eg_pool_floor', pInX0, pInX1, pInZ0, pInZ1, poolR, T.POOL_MOSAIC, SF_FLOOR, 365, 'pool', 0.24);

  // 4 Straight Curved Pool Walls
  const mPoolW = new LevelSectorMesh('eg_pool_wall_w');
  addTransitionBands(mPoolW, [pInX0, poolR, pInZ0], [pInX0, poolR, pInZ1], [-1, 0, 0], poolR, poolR, 5, T.POOL_WALL, { family: 'pool', boost: 0.10, vertSf: SF_VERT_TG });
  sectors.push(mPoolW.compile());

  const mPoolE = new LevelSectorMesh('eg_pool_wall_e');
  addTransitionBands(mPoolE, [pInX1, poolR, pInZ1], [pInX1, poolR, pInZ0], [1, 0, 0], poolR, poolR, 5, T.POOL_WALL, { family: 'pool', boost: 0.10, vertSf: SF_VERT_TG });
  sectors.push(mPoolE.compile());

  const mPoolN = new LevelSectorMesh('eg_pool_wall_n');
  addTransitionBands(mPoolN, [pInX1, poolR, pInZ0], [pInX0, poolR, pInZ0], [0, 0, -1], poolR, poolR, 5, T.POOL_WALL, { family: 'pool', boost: 0.10 });
  sectors.push(mPoolN.compile());

  const mPoolS = new LevelSectorMesh('eg_pool_wall_s');
  addTransitionBands(mPoolS, [pInX0, poolR, pInZ1], [pInX1, poolR, pInZ1], [0, 0, 1], poolR, poolR, 5, T.POOL_WALL, { family: 'pool', boost: 0.10 });
  sectors.push(mPoolS.compile());

  // 4 Smooth Concave Quarter-Bowl Corners + Watertight Deck Spandrel Fillers
  const poolCorners = [
    { name: 'eg_pool_c_nw', cx: pInX0, cz: pInZ0, ax: pX0, az: pZ0, a0: Math.PI,       a1: Math.PI * 1.5 },
    { name: 'eg_pool_c_ne', cx: pInX1, cz: pInZ0, ax: pX1, az: pZ0, a0: Math.PI * 1.5, a1: Math.PI * 2.0 },
    { name: 'eg_pool_c_se', cx: pInX1, cz: pInZ1, ax: pX1, az: pZ1, a0: 0,             a1: Math.PI * 0.5 },
    { name: 'eg_pool_c_sw', cx: pInX0, cz: pInZ1, ax: pX0, az: pZ1, a0: Math.PI * 0.5, a1: Math.PI       },
  ];
  for (const pc of poolCorners) {
    const mc = new LevelSectorMesh(pc.name);
    addPoolCorner(mc, pc.cx, pc.cz, poolR, poolR, pc.a0, pc.a1, { azSteps: 4, bands: 4 });
    const rimR = poolR * Math.sin(86 * Math.PI / 180);
    const deckY = poolR - poolR * (1 - Math.cos(86 * Math.PI / 180));
    for (let s = 0; s < 4; s++) {
      const th0 = lerp(pc.a0, pc.a1, s / 4), th1 = lerp(pc.a0, pc.a1, (s + 1) / 4);
      const r0 = [pc.cx + Math.cos(th0) * rimR, deckY, pc.cz + Math.sin(th0) * rimR];
      const r1 = [pc.cx + Math.cos(th1) * rimR, deckY, pc.cz + Math.sin(th1) * rimR];
      mc.addTri(r0, r1, [pc.ax, 0, pc.az], T.COPING, SF_FLOOR, { outNormal: [0, -1, 0], family: 'sand', boost: 0.08 });
    }
    sectors.push(mc.compile());
  }
  // Stitch golden coping collar cleanly around the 4 straight sides of the pool rim (from lipY≈36 up to Y=0)
  {
    const rimR = poolR * Math.sin(86 * Math.PI / 180);
    const lipY = poolR - poolR * (1 - Math.cos(86 * Math.PI / 180));
    const mCollar = new LevelSectorMesh('eg_pool_collar');
    mCollar.addQuad([pX0, 0, pInZ0], [pInX0 - rimR, lipY, pInZ0], [pX0, 0, pInZ1], [pInX0 - rimR, lipY, pInZ1], T.COPING, SF_FLOOR, { outNormal: [0, -1, 0] });
    mCollar.addQuad([pInX1 + rimR, lipY, pInZ0], [pX1, 0, pInZ0], [pInX1 + rimR, lipY, pInZ1], [pX1, 0, pInZ1], T.COPING, SF_FLOOR, { outNormal: [0, -1, 0] });
    mCollar.addQuad([pInX0, 0, pZ0], [pInX1, 0, pZ0], [pInX0, lipY, pInZ0 - rimR], [pInX1, lipY, pInZ0 - rimR], T.COPING, SF_FLOOR, { outNormal: [0, -1, 0] });
    mCollar.addQuad([pInX0, lipY, pInZ1 + rimR], [pInX1, lipY, pInZ1 + rimR], [pInX0, 0, pZ1], [pInX1, 0, pZ1], T.COPING, SF_FLOOR, { outNormal: [0, -1, 0] });
    sectors.push(mCollar.compile());
  }

  // --------------------------------------------------------------------------
  // C. GRAND EGYPTIAN HALF-PIPE + EAST SPINE TRANSFER (X in [-4380..-1140], Z in [-1600..+1600])
  //    True THPS2 Vert Half-Pipe: R=580 (height ~540!), wide 1,500-unit flat bottom, massive Spine!
  // --------------------------------------------------------------------------
  const hpR = 580;
  const hpZ0 = -1600, hpZ1 = 1600;
  const hpXWestToe = -3800, hpXEastToe = -2300;
  const hpXWestLip = hpXWestToe - hpR; // -4380
  const hpXEastLip = hpXEastToe + hpR; // -1720
  const hpTopY = -(hpR * (1 - Math.cos(86 * Math.PI / 180))); // ~ -540

  // West Half-Pipe Ramp (SF_VERT) + West Observation Deck (X in [-5000..-4380])
  const mHpW = new LevelSectorMesh('eg_hp_west');
  addTransitionBands(mHpW, [hpXWestToe, 0, hpZ0], [hpXWestToe, 0, hpZ1], [-1, 0, 0], 0, hpR, 6, T.RAMP, { family: 'sand', boost: 0.08 });
  for (let s = 0; s < 4; s++) {
    const za = lerp(hpZ0, hpZ1, s / 4), zb = lerp(hpZ0, hpZ1, (s + 1) / 4);
    mHpW.addQuad([-5000, hpTopY, za], [hpXWestLip, hpTopY, za], [-5000, hpTopY, zb], [hpXWestLip, hpTopY, zb], T.TRIM, SF_FLOOR, { outNormal: [0, -1, 0], boost: 0.14, subdiv: true });
  }
  mHpW.addQuad([-5000, hpTopY, hpZ0], [hpXWestToe, hpTopY, hpZ0], [-5000, 0, hpZ0], [hpXWestToe, 0, hpZ0], T.HIERO_A, SF_WALL, { outNormal: [0, 0, -1], subdiv: true });
  mHpW.addQuad([hpXWestToe, hpTopY, hpZ1], [-5000, hpTopY, hpZ1], [hpXWestToe, 0, hpZ1], [-5000, 0, hpZ1], T.HIERO_A, SF_WALL, { outNormal: [0, 0, 1], subdiv: true });
  sectors.push(mHpW.compile());

  // East Half-Pipe Ramp (Gap 4301 West Side: eg_gap_spine_w, SF_VERT_TG = 0x1A22!)
  const mHpE = new LevelSectorMesh('eg_gap_spine_w');
  addTransitionBands(mHpE, [hpXEastToe, 0, hpZ1], [hpXEastToe, 0, hpZ0], [1, 0, 0], 0, hpR, 6, T.RAMP, { vertSf: SF_VERT_TG, family: 'sand', boost: 0.10 });
  sectors.push(mHpE.compile());

  // East Spine Backside Ramp facing Central Pyramid (Gap 4301 East Side: eg_gap_spine_e, SF_VERT_TG = 0x1A22!)
  const spineEastToe = hpXEastLip + hpR; // -1140!
  const mSpineE = new LevelSectorMesh('eg_gap_spine_e');
  addTransitionBands(mSpineE, [spineEastToe, 0, hpZ0], [spineEastToe, 0, hpZ1], [-1, 0, 0], 0, hpR, 6, T.RAMP, { vertSf: SF_VERT_TG, family: 'sand', boost: 0.10 });
  for (let s = 0; s < 4; s++) {
    const za = lerp(hpZ0, hpZ1, s / 4), zb = lerp(hpZ0, hpZ1, (s + 1) / 4);
    mSpineE.addQuad([hpXEastLip - 40, hpTopY, za], [hpXEastLip + 40, hpTopY, za], [hpXEastLip - 40, hpTopY, zb], [hpXEastLip + 40, hpTopY, zb], T.COPING, SF_FLOOR, { outNormal: [0, -1, 0], boost: 0.18 });
  }
  // Watertight 4-band curved end-caps matching exact circular-arc Spine profile on North & South ends!
  for (let b = 0; b < 4; b++) {
    const a0 = (b / 4) * (86 * Math.PI / 180), a1 = ((b + 1) / 4) * (86 * Math.PI / 180);
    const d0 = hpR * Math.sin(a0), y0 = -(hpR * (1 - Math.cos(a0)));
    const d1 = hpR * Math.sin(a1), y1 = -(hpR * (1 - Math.cos(a1)));
    const w0 = hpXEastToe + d0, e0 = spineEastToe - d0;
    const w1 = hpXEastToe + d1, e1 = spineEastToe - d1;
    const vTop = Math.round((1 - (b + 1) / 4) * 63), vBot = Math.round((1 - b / 4) * 63);
    mSpineE.addQuad([e1, y1, hpZ0], [w1, y1, hpZ0], [e0, y0, hpZ0], [w0, y0, hpZ0], T.HIERO_B, SF_WALL, { outNormal: [0, 0, -1], uv: [0, vTop, 63, vTop, 0, vBot, 63, vBot], family: 'sand', boost: 0.10 });
    mSpineE.addQuad([w1, y1, hpZ1], [e1, y1, hpZ1], [w0, y0, hpZ1], [e0, y0, hpZ1], T.HIERO_B, SF_WALL, { outNormal: [0, 0, 1], uv: [0, vTop, 63, vTop, 0, vBot, 63, vBot], family: 'sand', boost: 0.10 });
  }
  sectors.push(mSpineE.compile());

  // --------------------------------------------------------------------------
  // D. CENTRAL STEPPED GOLDEN PYRAMID FUNBOX (X,Z in [-780..+780], plateau [-260..+260] @ Y=-260)
  // --------------------------------------------------------------------------
  const pyrB = 780, pyrT = 260, pyrY = -260;
  const mPyrMain = new LevelSectorMesh('eg_pyramid_main');
  mPyrMain.addQuad([-pyrT, pyrY, -pyrT], [pyrT, pyrY, -pyrT], [-pyrT, pyrY, pyrT], [pyrT, pyrY, pyrT], T.TRIM, SF_FLOOR, { outNormal: [0, -1, 0], family: 'sunset', boost: 0.18, subdiv: true });
  mPyrMain.addQuad([-pyrT, pyrY, pyrT], [pyrT, pyrY, pyrT], [-pyrB, 0, pyrB], [pyrB, 0, pyrB], T.PYRAMID, SF_FLOOR, { outNormal: [0, -0.89, 0.45], family: 'sand', boost: 0.12, subdiv: true });
  mPyrMain.addQuad([pyrT, pyrY, -pyrT], [-pyrT, pyrY, -pyrT], [pyrB, 0, -pyrB], [-pyrB, 0, -pyrB], T.PYRAMID, SF_FLOOR, { outNormal: [0, -0.89, -0.45], family: 'sand', boost: 0.08, subdiv: true });
  mPyrMain.addQuad([-pyrT, pyrY, -pyrT], [-pyrT, pyrY, pyrT], [-pyrB, 0, -pyrB], [-pyrB, 0, pyrB], T.PYRAMID, SF_FLOOR, { outNormal: [-0.45, -0.89, 0], family: 'sand', boost: 0.14, subdiv: true });
  sectors.push(mPyrMain.compile());

  // East bank (+X, faces Empty Pool! Separate trigger mesh for Gap 4302 [GRIND OBELISCO]!)
  const mPyrEast = new LevelSectorMesh('eg_gap_pyr_e');
  mPyrEast.addQuad([pyrT, pyrY, pyrT], [pyrT, pyrY, -pyrT], [pyrB, 0, pyrB], [pyrB, 0, -pyrB], T.PYRAMID, SF_TRIG, { outNormal: [0.45, -0.89, 0], family: 'sand', boost: 0.10, subdiv: true });
  sectors.push(mPyrEast.compile());

  // --------------------------------------------------------------------------
  // E. NORTH GREAT SPHINX TEMPLE QUARTER-PIPE WALL & ARCHWAY (Z = -3800..-4360)
  // --------------------------------------------------------------------------
  const nQpR = 560;
  const nQpTopY = -(nQpR * (1 - Math.cos(86 * Math.PI / 180))); // ~ -521
  const mNqpW = new LevelSectorMesh('eg_gap_sphinx_w');
  addTransitionBands(mNqpW, [-800, 0, -3800], [-4350, 0, -3800], [0, 0, -1], 0, nQpR, 6, T.RAMP, { vertSf: SF_VERT_TG, family: 'sand', boost: 0.10 });
  for (let s = 0; s < 4; s++) {
    const xa = lerp(-4350, -800, s / 4), xb = lerp(-4350, -800, (s + 1) / 4);
    mNqpW.addQuad([xa, nQpTopY, -4980], [xb, nQpTopY, -4980], [xa, nQpTopY, -4360], [xb, nQpTopY, -4360], T.HIERO_B, SF_FLOOR, { outNormal: [0, -1, 0], boost: 0.10, subdiv: true });
  }
  sectors.push(mNqpW.compile());

  const mNqpE = new LevelSectorMesh('eg_gap_sphinx_e');
  addTransitionBands(mNqpE, [4350, 0, -3800], [800, 0, -3800], [0, 0, -1], 0, nQpR, 6, T.RAMP, { vertSf: SF_VERT_TG, family: 'sand', boost: 0.10 });
  for (let s = 0; s < 4; s++) {
    const xa = lerp(800, 4350, s / 4), xb = lerp(800, 4350, (s + 1) / 4);
    mNqpE.addQuad([xa, nQpTopY, -4980], [xb, nQpTopY, -4980], [xa, nQpTopY, -4360], [xb, nQpTopY, -4360], T.HIERO_B, SF_FLOOR, { outNormal: [0, -1, 0], boost: 0.10, subdiv: true });
  }
  sectors.push(mNqpE.compile());

  // Monumental Central Sphinx Temple Archway (X in [-800..+800], Z in [-4650..-3820], height 1180!)
  const mArch = new LevelSectorMesh('eg_sphinx_arch');
  addBox(mArch, -800, -920, -4560, -460, 0, -3860, T.HIERO_A, T.TRIM, SF_WALL, SF_FLOOR, 'sand', 0.10);
  addBox(mArch,  460, -920, -4560,  800, 0, -3860, T.HIERO_A, T.TRIM, SF_WALL, SF_FLOOR, 'sand', 0.10);
  addBox(mArch, -860, -1180, -4600, 860, -700, -3820, T.CORNICE, T.TRIM, SF_DECO, SF_DECO, 'sand', 0.14);
  // Crisp front Pharaoh Mural plaque on South face of lintel (Z = -3814)
  mArch.addQuad([-540, -1150, -3814], [540, -1150, -3814], [-540, -720, -3814], [540, -720, -3814], T.PHARAOH, SF_DECO, { outNormal: [0, 0, 1], family: 'neutral', boost: 0.24, subdiv: true });
  // Towering Golden Temple Door recessed inside the archway (Z = -4540)
  mArch.addQuad([-460, -700, -4540], [460, -700, -4540], [-460, 0, -4540], [460, 0, -4540], T.DOOR, SF_WALL, { outNormal: [0, 0, 1], family: 'sunset', boost: 0.16, subdiv: true });
  // Carved pedestal resting on West Half-Pipe Deck to hold the second Golden Sphinx Mask!
  addBox(mArch, -4880, hpTopY - 240, -220, -4480, hpTopY, 220, T.HIERO_A, T.TRIM, SF_DECO, SF_DECO, 'sand', 0.14);
  sectors.push(mArch.compile());

  // --------------------------------------------------------------------------
  // F. SOUTH SPAWN ROLL-IN RAMP (4x2 crisp tile grid!), SUBDIVIDED CARVED GRIND LEDGES & SW/SE CORNER QPs
  // --------------------------------------------------------------------------
  const mSpawn = new LevelSectorMesh('eg_spawn_rollin');
  for (let ix = 0; ix < 4; ix++) {
    const xa = lerp(-780, 780, ix / 4), xb = lerp(-780, 780, (ix + 1) / 4);
    for (let iz = 0; iz < 2; iz++) {
      const za = lerp(3960, 4860, iz / 2), zb = lerp(3960, 4860, (iz + 1) / 2);
      mSpawn.addQuad([xa, -240, za], [xb, -240, za], [xa, -240, zb], [xb, -240, zb], T.PLAZA, SF_FLOOR, { outNormal: [0, -1, 0], boost: 0.12, subdiv: true });
    }
    for (let iz = 0; iz < 2; iz++) {
      const t0 = iz / 2, t1 = (iz + 1) / 2;
      const za = lerp(3100, 3960, t0), zb = lerp(3100, 3960, t1);
      const ya = lerp(0, -240, t0), yb = lerp(0, -240, t1);
      mSpawn.addQuad([xa, ya, za], [xb, ya, za], [xa, yb, zb], [xb, yb, zb], T.RAMP, SF_FLOOR, { outNormal: [0, -0.96, -0.27], boost: 0.12, subdiv: true });
    }
  }
  // Subdivided side retaining cheeks (zero PS1 near-plane clipping!)
  for (let s = 0; s < 3; s++) {
    const za = lerp(3100, 3960, s / 3), zb = lerp(3100, 3960, (s + 1) / 3);
    const ya = lerp(0, -240, s / 3), yb = lerp(0, -240, (s + 1) / 3);
    mSpawn.addQuad([-780, ya, za], [-780, yb, zb], [-780, 0, za], [-780, 0, zb], T.HIERO_A, SF_WALL, { outNormal: [-1, 0, 0] });
    mSpawn.addQuad([ 780, yb, zb], [ 780, ya, za], [ 780, 0, zb], [ 780, 0, za], T.HIERO_A, SF_WALL, { outNormal: [ 1, 0, 0] });
  }
  for (let s = 0; s < 2; s++) {
    const za = lerp(3960, 4860, s / 2), zb = lerp(3960, 4860, (s + 1) / 2);
    mSpawn.addQuad([-780, -240, za], [-780, -240, zb], [-780, 0, za], [-780, 0, zb], T.HIERO_A, SF_WALL, { outNormal: [-1, 0, 0] });
    mSpawn.addQuad([ 780, -240, zb], [ 780, -240, za], [ 780, 0, zb], [ 780, 0, za], T.HIERO_A, SF_WALL, { outNormal: [ 1, 0, 0] });
  }
  sectors.push(mSpawn.compile());

  // Subdivided Carved Hieroglyph Grind Ledges (<= 325-unit segments -> ZERO PS1 GTE near-plane pop-out!)
  const addSegmentedLedge = (name, x0, yTop, z0, x1, yBot, z1, texSide, texTop, segsX, segsZ, boost = 0.10) => {
    const m = new LevelSectorMesh(name);
    for (let ix = 0; ix < segsX; ix++) {
      const xa = lerp(x0, x1, ix / segsX), xb = lerp(x0, x1, (ix + 1) / segsX);
      for (let iz = 0; iz < segsZ; iz++) {
        const za = lerp(z0, z1, iz / segsZ), zb = lerp(z0, z1, (iz + 1) / segsZ);
        m.addQuad([xa, yTop, za], [xb, yTop, za], [xa, yTop, zb], [xb, yTop, zb], texTop, SF_FLOOR, { outNormal: [0, -1, 0], boost: boost + 0.08 });
        if (iz === 0)         m.addQuad([xb, yTop, za], [xa, yTop, za], [xb, yBot, za], [xa, yBot, za], texSide, SF_WALL, { outNormal: [ 0, 0, -1], boost });
        if (iz === segsZ - 1) m.addQuad([xa, yTop, zb], [xb, yTop, zb], [xa, yBot, zb], [xb, yBot, zb], texSide, SF_WALL, { outNormal: [ 0, 0,  1], boost });
        if (ix === 0)         m.addQuad([xa, yTop, za], [xa, yTop, zb], [xa, yBot, za], [xa, yBot, zb], texSide, SF_WALL, { outNormal: [-1, 0,  0], boost });
        if (ix === segsX - 1) m.addQuad([xb, yTop, zb], [xb, yTop, za], [xb, yBot, zb], [xb, yBot, za], texSide, SF_WALL, { outNormal: [ 1, 0,  0], boost });
      }
    }
    sectors.push(m.compile());
  };
  addSegmentedLedge('eg_ledge_sw', -1340, -130,  1600, -1040, 0,  2900, T.HIERO_B, T.TRIM, 1, 4, 0.10);
  addSegmentedLedge('eg_ledge_se',   940, -130,  1600,  1240, 0,  2900, T.HIERO_B, T.TRIM, 1, 4, 0.10);
  addSegmentedLedge('eg_ledge_ne',  2000, -125, -2640,  3900, 0, -2380, T.HIERO_A, T.TRIM, 6, 1, 0.12);

  // SW & SE South Quarter-Pipes (Z = +3900..+4440, R = 540, SF_VERT -> massive combo rebound!)
  const sQpR = 540;
  const sQpTopY = -(sQpR * (1 - Math.cos(86 * Math.PI / 180)));
  const mSqpW = new LevelSectorMesh('eg_south_qp_w');
  addTransitionBands(mSqpW, [-4300, 0, 3900], [-1080, 0, 3900], [0, 0, 1], 0, sQpR, 5, T.RAMP, { family: 'sand', boost: 0.08 });
  mSqpW.addQuad([-4300, sQpTopY, 4440], [-1080, sQpTopY, 4440], [-4300, sQpTopY, 4980], [-1080, sQpTopY, 4980], T.HIERO_A, SF_FLOOR, { outNormal: [0, -1, 0], subdiv: true });
  sectors.push(mSqpW.compile());

  const mSqpE = new LevelSectorMesh('eg_south_qp_e');
  addTransitionBands(mSqpE, [1080, 0, 3900], [4300, 0, 3900], [0, 0, 1], 0, sQpR, 5, T.RAMP, { family: 'sand', boost: 0.08 });
  mSqpE.addQuad([1080, sQpTopY, 4440], [4300, sQpTopY, 4440], [1080, sQpTopY, 4980], [4300, sQpTopY, 4980], T.HIERO_A, SF_FLOOR, { outNormal: [0, -1, 0], subdiv: true });
  sectors.push(mSqpE.compile());

  // --------------------------------------------------------------------------
  // G. VISUAL GOLDEN GRIND RAILS (matching exact Type 10 RailDef coordinates!)
  // --------------------------------------------------------------------------
  const mRails = new LevelSectorMesh('eg_visual_rails', { collidable: false });
  // 1. Elevated Golden Obelisk Rail (Pyramid East -> Pool West Deck!)
  addVisualRailBar(mRails, [[320, -270, 0], [920, -210, 0], [1560, -145, 0]], 14, 20);
  // 2. Twin Pyramid Spine Rails (West & East edges of plateau)
  addVisualRailBar(mRails, [[-260, -16, 740], [-260, -272, 260], [-260, -272, -260], [-260, -16, -740]], 12, 18);
  addVisualRailBar(mRails, [[ 260, -16, 740], [ 260, -272, 260], [ 260, -272, -260], [ 260, -16, -740]], 12, 18);
  // 3. Support gold pillars under Obelisk Rail
  addBox(mRails,  890, -206, -30,  950, 0, 30, T.PILLAR, T.TRIM, SF_DECO, SF_DECO, 'sunset', 0.14);
  addBox(mRails, 1530, -142, -30, 1590, 0, 30, T.PILLAR, T.TRIM, SF_DECO, SF_DECO, 'sunset', 0.14);
  // 4. Pool Rim Golden Coping Rail visual accents (4 straight segments)
  addVisualRailBar(mRails, [[pX0, -6, pInZ0], [pX0, -6, pInZ1]], 12, 14);
  addVisualRailBar(mRails, [[pX1, -6, pInZ0], [pX1, -6, pInZ1]], 12, 14);
  addVisualRailBar(mRails, [[pInX0, -6, pZ0], [pInX1, -6, pZ0]], 12, 14);
  addVisualRailBar(mRails, [[pInX0, -6, pZ1], [pInX1, -6, pZ1]], 12, 14);
  sectors.push(mRails.compile());

  // --------------------------------------------------------------------------
  // H. PERIMETER TEMPLE WALLS (X = +/-5000, Z = +/-5000, H = 540, SF_WALL wallrideable!)
  // --------------------------------------------------------------------------
  const wallH = -540;
  const addPerimeterWall = (name, pStart, pEnd, outN, segs, texMain) => {
    const m = new LevelSectorMesh(name);
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const x0 = lerp(pStart[0], pEnd[0], t0), z0 = lerp(pStart[2], pEnd[2], t0);
      const x1 = lerp(pStart[0], pEnd[0], t1), z1 = lerp(pStart[2], pEnd[2], t1);
      const useTex = (i % 4 === 1) ? T.PHARAOH : ((i % 4 === 3) ? T.CORTEX : texMain);
      m.addQuad([x0, wallH, z0], [x1, wallH, z1], [x0, 0, z0], [x1, 0, z1], useTex, SF_WALL, { outNormal: outN, family: (useTex === T.PHARAOH || useTex === T.CORTEX) ? 'neutral' : 'sand', boost: 0.08, subdiv: true });
      m.addQuad([x0, wallH - 96, z0], [x1, wallH - 96, z1], [x0, wallH, z0], [x1, wallH, z1], T.CORNICE, SF_DECO, { outNormal: outN, family: 'sand', boost: 0.14 });
    }
    sectors.push(m.compile());
  };
  addPerimeterWall('eg_wall_n', [-5000, 0, -5000], [ 5000, 0, -5000], [ 0, 0,  1], 12, T.HIERO_A);
  addPerimeterWall('eg_wall_s', [ 5000, 0,  5000], [-5000, 0,  5000], [ 0, 0, -1], 12, T.HIERO_B);
  addPerimeterWall('eg_wall_w', [-5000, 0,  5000], [-5000, 0, -5000], [ 1, 0,  0], 12, T.HIERO_A);
  addPerimeterWall('eg_wall_e', [ 5000, 0, -5000], [ 5000, 0,  5000], [-1, 0,  0], 12, T.HIERO_B);

  // --------------------------------------------------------------------------
  // I. REAL EXTRACTED CRASH 3 EGYPT 3D LANDMARKS (Monumental Scale, Zero-Snag SF_DECO!)
  // --------------------------------------------------------------------------
  // 1. Giant Golden Pharaoh / Sphinx Masks crowning North Temple Archway & West Half-Pipe Pedestal!
  addCrash3PropSector(sectors, 'eg_prop_sphinx_arch', props.SwHiG.obj, props.SwHiG.texIdx,     0, -1180, -4180, 620, 0, SF_DECO, 'neutral', 0.24);
  addCrash3PropSector(sectors, 'eg_prop_sphinx_hp',   props.SwHiG.obj, props.SwHiG.texIdx, -4680, hpTopY - 240, 0, 440, -Math.PI * 0.5, SF_DECO, 'neutral', 0.22);

  // 2. 4x Standing Golden Pharaoh Sarcophagi (Sa1iG) — facing INWARD toward Half-Pipe & Temple Plaza!
  addCrash3PropSector(sectors, 'eg_prop_sarc_1', props.Sa1iG.obj, props.Sa1iG.texIdx, -4680, hpTopY, -980, 480, -Math.PI * 0.5, SF_DECO, 'neutral', 0.22);
  addCrash3PropSector(sectors, 'eg_prop_sarc_2', props.Sa1iG.obj, props.Sa1iG.texIdx, -4680, hpTopY,  980, 480, -Math.PI * 0.5, SF_DECO, 'neutral', 0.22);
  addCrash3PropSector(sectors, 'eg_prop_sarc_3', props.Sa1iG.obj, props.Sa1iG.texIdx, -1180, 0, -3420, 500, 0, SF_DECO, 'neutral', 0.22);
  addCrash3PropSector(sectors, 'eg_prop_sarc_4', props.Sa1iG.obj, props.Sa1iG.texIdx,  1180, 0, -3420, 500, 0, SF_DECO, 'neutral', 0.22);

  // 3. 4x Lotus Pillars (Pl2iG) framing the Great Sphinx Temple Archway & Plaza!
  addCrash3PropSector(sectors, 'eg_prop_pil_1', props.Pl2iG.obj, props.Pl2iG.texIdx,  -720, 0, -3640, 680, 0, SF_DECO, 'neutral', 0.16);
  addCrash3PropSector(sectors, 'eg_prop_pil_2', props.Pl2iG.obj, props.Pl2iG.texIdx,   720, 0, -3640, 680, 0, SF_DECO, 'neutral', 0.16);
  addCrash3PropSector(sectors, 'eg_prop_pil_3', props.Pl2iG.obj, props.Pl2iG.texIdx, -1880, 0, -2360, 600, 0, SF_DECO, 'neutral', 0.16);
  addCrash3PropSector(sectors, 'eg_prop_pil_4', props.Pl2iG.obj, props.Pl2iG.texIdx,  4560, 0, -1720, 600, 0, SF_DECO, 'neutral', 0.16);

  // 4. 2x Egyptian Shield Guards (sg1mG) flanking the South Spawn Roll-In Ramp!
  addCrash3PropSector(sectors, 'eg_prop_guard_l', props.sg1mG.obj, props.sg1mG.texIdx, -980, 0, 3550, 440,  Math.PI * 0.25, SF_DECO, 'neutral', 0.20);
  addCrash3PropSector(sectors, 'eg_prop_guard_r', props.sg1mG.obj, props.sg1mG.texIdx,  980, 0, 3550, 440, -Math.PI * 0.25, SF_DECO, 'neutral', 0.20);

  // 5. 2x Egyptian Mummies (Mu1iG) watching over the Empty Pharaoh Swimming Pool!
  addCrash3PropSector(sectors, 'eg_prop_mummy_1', props.Mu1iG.obj, props.Mu1iG.texIdx, 2500, 0, -1620, 420, 0, SF_DECO, 'neutral', 0.22);
  addCrash3PropSector(sectors, 'eg_prop_mummy_2', props.Mu1iG.obj, props.Mu1iG.texIdx, 3400, 0, -1620, 420, 0, SF_DECO, 'neutral', 0.22);

  // 6. 2x Coiled Cobras (CbriG) guarding the Central Stepped Pyramid (seated flush on sandstone!)
  addCrash3PropSector(sectors, 'eg_prop_cobra_1', props.CbriG.obj, props.CbriG.texIdx, -820, 18,  940, 270, -Math.PI * 0.15, SF_DECO, 'neutral', 0.22);
  addCrash3PropSector(sectors, 'eg_prop_cobra_2', props.CbriG.obj, props.CbriG.texIdx,  840, 18, -900, 270,  Math.PI * 0.85, SF_DECO, 'neutral', 0.22);

  // 7. Real Crash 3 Ankh Platform (Pl3iG) inlaid on Central Pyramid Plateau + 2 Octagonal Hieroglyph Pedestals (El2iG)
  addCrash3PropSector(sectors, 'eg_prop_ankh_top', props.Pl3iG.obj, props.Pl3iG.texIdx,     0, pyrY + 10, 0, 48, 0, SF_DECO, 'neutral', 0.20);
  addCrash3PropSector(sectors, 'eg_prop_ped_1',    props.El2iG.obj, props.El2iG.texIdx,  2950, 0,  1720, 130, 0, SF_DECO, 'neutral', 0.16);
  addCrash3PropSector(sectors, 'eg_prop_ped_2',    props.El2iG.obj, props.El2iG.texIdx, -3050, 0, -2300, 130, 0, SF_DECO, 'neutral', 0.16);

  // --------------------------------------------------------------------------
  // J. 5 INVISIBLE GOAL-4 VASE SMASH TRIGGER BOXES (fl=0x0080, sf=0x0002, matching skhan.psx #102!)
  // --------------------------------------------------------------------------
  const VASE_POSITIONS = [
    [ 1090, -130,  2250], // Vase #0: Right on South-East Carved Ledge (visible ahead from Spawn!)
    [-1190, -130,  2250], // Vase #1: On South-West Carved Ledge
    [    0, -260,     0], // Vase #2: Peak of Central Stepped Pyramid!
    [ 2950, -125, -2510], // Vase #3: North-East Plaza Ledge above Empty Pool!
    [-3050,    0, -1960], // Vase #4: North exit of Grand Egyptian Half-Pipe!
  ];
  VASE_POSITIONS.forEach(([vx, vy, vz], idx) => {
    const mt = new LevelSectorMesh(`eg_vase_trig_${idx}`, { isTriggerOnly: true, collidable: true });
    const hw = 145, hh = 210;
    const x0 = vx - hw, x1 = vx + hw, y0 = vy - hh, y1 = vy + 30, z0 = vz - hw, z1 = vz + hw;
    mt.addInvisibleTriggerQuad([x0, y0, z0], [x1, y0, z0], [x0, y0, z1], [x1, y0, z1], [ 0, -1,  0]);
    mt.addInvisibleTriggerQuad([x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1], [ 0,  0,  1]);
    mt.addInvisibleTriggerQuad([x1, y0, z0], [x0, y0, z0], [x1, y1, z0], [x0, y1, z0], [ 0,  0, -1]);
    mt.addInvisibleTriggerQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z0], [x0, y1, z1], [-1,  0,  0]);
    mt.addInvisibleTriggerQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z1], [x1, y1, z0], [ 1,  0,  0]);
    sectors.push(mt.compile());
  });

  // --------------------------------------------------------------------------
  // K. TOWERING OUTER GREAT PYRAMIDS OF GIZA + OUTER DESERT SAND + 360-DEG TWILIGHT SKYBOX
  // --------------------------------------------------------------------------
  const addGreatPyramid = (name, cx, cz, halfBase, height) => {
    const m = new LevelSectorMesh(name, { collidable: false });
    const apex = [cx, -height, cz];
    const sw = [cx - halfBase, 40, cz + halfBase];
    const se = [cx + halfBase, 40, cz + halfBase];
    const ne = [cx + halfBase, 40, cz - halfBase];
    const nw = [cx - halfBase, 40, cz - halfBase];
    const uv = [32, 0, 0, 63, 63, 63];
    m.addTri(apex, sw, se, T.PYRAMID, SF_DECO, { outNormal: [ 0, -0.5,  0.86], uv, family: 'sunset', boost:  0.14 });
    m.addTri(apex, se, ne, T.PYRAMID, SF_DECO, { outNormal: [ 0.86, -0.5, 0], uv, family: 'sunset', boost: -0.08 });
    m.addTri(apex, ne, nw, T.PYRAMID, SF_DECO, { outNormal: [ 0, -0.5, -0.86], uv, family: 'sunset', boost: -0.14 });
    m.addTri(apex, nw, sw, T.PYRAMID, SF_DECO, { outNormal: [-0.86, -0.5, 0], uv, family: 'sunset', boost:  0.22 });
    sectors.push(m.compile());
  };
  addGreatPyramid('eg_giza_pyr_1', -3800, -10200, 3100, 3700);
  addGreatPyramid('eg_giza_pyr_2',  4000, -10800, 2700, 3100);
  addGreatPyramid('eg_giza_pyr_3',  9800,  -2800, 2300, 2500);
  addGreatPyramid('eg_giza_pyr_4', -9900,  -2500, 2200, 2400);

  // Outer Desert Sand Apron (4 separate sectors so local coords stay small!)
  const addDesertStrip = (name, x0, x1, z0, z1) => {
    const m = new LevelSectorMesh(name, { collidable: false });
    m.addQuad([x0, 44, z0], [x1, 44, z0], [x0, 44, z1], [x1, 44, z1], T.SAND, SF_DECO, { outNormal: [0, -1, 0], family: 'sunset', boost: 0.06 });
    sectors.push(m.compile());
  };
  addDesertStrip('eg_desert_n', -14400,  14400, -14400,  -5000);
  addDesertStrip('eg_desert_s', -14400,  14400,   5000,  14400);
  addDesertStrip('eg_desert_w', -14400,  -5000,  -5000,   5000);
  addDesertStrip('eg_desert_e',   5000,  14400,  -5000,   5000);

  // 360-Degree Egyptian Twilight Skybox (16 individual single-panel sectors so local coords stay tiny & zero clipping!)
  const skyR = 14200, skyTopY = -6800, skyBotY = 900, skySegs = 16;
  for (let i = 0; i < skySegs; i++) {
    const mSky = new LevelSectorMesh(`eg_sky_${i}`, { collidable: false });
    const a0 = (i / skySegs) * Math.PI * 2;
    const a1 = ((i + 1) / skySegs) * Math.PI * 2;
    const midA = (a0 + a1) * 0.5;
    const x0 = Math.cos(a0) * skyR, z0 = Math.sin(a0) * skyR;
    const x1 = Math.cos(a1) * skyR, z1 = Math.sin(a1) * skyR;
    const nIn = [-Math.cos(midA), 0, -Math.sin(midA)];
    const col = [60, 60, 60, 60];
    const skyTex = (i === 11) ? T.SKY_SUN : T.SKY_PYR;
    mSky.addQuad([x0, skyTopY, z0], [x1, skyTopY, z1], [x0, skyBotY, z0], [x1, skyBotY, z1], skyTex, SF_DECO, { outNormal: nIn, colors: col });
    mSky.addTri([0, -8200, 0], [x0, skyTopY, z0], [x1, skyTopY, z1], T.SKY_TOP, SF_DECO, { outNormal: [0, 1, 0], uv: [32, 2, 4, 16, 60, 16], colors: [58, 58, 58] });
    sectors.push(mSky.compile());
  }

  return { sectors, VASE_POSITIONS, hpTopY, poolR, pX0, pX1, pZ0, pZ1, pInX0, pInX1, pInZ0, pInZ1, hpXWestLip, hpXEastLip, hpZ0, hpZ1, nQpTopY, sQpTopY };
}

// ============================================================================
// 6. Native .PSX Binary Writers: skegyp.psx (Level + TAG 0x0A), skegyp_l.psx, skegyp_o.psx
// ============================================================================

function buildLevelPsx(sectors, texIds) {
  const numObjs = sectors.length;
  const numMeshes = sectors.length;

  // Layout:
  //   12 B header + numObjs*36 B SObjects + 4 B meshCount + numMeshes*4 B meshPtrs
  //   + mesh data + ptrMeta (RGBs + TAG 0x0A + 0xFFFFFFFF) + meshHashes + texIds + 12 B empty tex trailer
  const headerAndTables = 12 + numObjs * 36 + 4 + numMeshes * 4;
  let curOff = headerAndTables;
  const meshOffs = [];
  for (const s of sectors) {
    meshOffs.push(curOff);
    curOff += s.buf.length;
  }
  const ptrMeta = curOff;

  // Build RGBs chunk (tag 0x73424752, len 1024, 256 x {r,g,b,0})
  const rgbsChunk = Buffer.alloc(8 + 1024, 0);
  rgbsChunk.writeUInt32LE(0x73424752, 0);
  rgbsChunk.writeUInt32LE(1024, 4);
  for (let i = 0; i < 256; i++) {
    rgbsChunk[8 + i * 4]     = RGBS_PAL[i][0];
    rgbsChunk[8 + i * 4 + 1] = RGBS_PAL[i][1];
    rgbsChunk[8 + i * 4 + 2] = RGBS_PAL[i][2];
    rgbsChunk[8 + i * 4 + 3] = 0;
  }

  // Build EXACT Square 20x20 TAG 0x0A (CWorldGrid) covering playable bounds [-5400..+5400] x [-5400..+5400]!
  const gMin = -5400, gMax = 5400, gridN = 20;
  const cellSpan = (gMax - gMin) / gridN; // 540 units per cell!
  const gridCells = Array.from({ length: gridN * gridN }, () => []);

  for (let oi = 0; oi < sectors.length; oi++) {
    const s = sectors[oi];
    if (!s.collidable) continue; // Only collidable & trigger sectors go into physics CWorldGrid!
    const bx0 = s.worldMin[0] - 120, bx1 = s.worldMax[0] + 120;
    const bz0 = s.worldMin[2] - 120, bz1 = s.worldMax[2] + 120;
    const cx0 = clamp(Math.floor((bx0 - gMin) / cellSpan) - 1, 0, gridN - 1);
    const cx1 = clamp(Math.floor((bx1 - gMin) / cellSpan) + 1, 0, gridN - 1);
    const cz0 = clamp(Math.floor((bz0 - gMin) / cellSpan) - 1, 0, gridN - 1);
    const cz1 = clamp(Math.floor((bz1 - gMin) / cellSpan) + 1, 0, gridN - 1);
    for (let gz = cz0; gz <= cz1; gz++) {
      for (let gx = cx0; gx <= cx1; gx++) {
        gridCells[gz * gridN + gx].push(oi);
      }
    }
  }

  // Serialize TAG 0x0A exactly matching skhan.psx byte structure:
  //   20 B header: i32 minX<<12, minZ<<12, maxX<<12, maxZ<<12, i16 gridX=20, gridZ=20
  //   400 cells (z=0..19 outer, x=0..19 inner): u32 0, u32 0, u32 count, u32 objIdx[count], u32 0
  const gridBodyParts = [];
  const gridHdr = Buffer.alloc(20);
  gridHdr.writeInt32LE(gMin << 12, 0);
  gridHdr.writeInt32LE(gMin << 12, 4);
  gridHdr.writeInt32LE(gMax << 12, 8);
  gridHdr.writeInt32LE(gMax << 12, 12);
  gridHdr.writeInt16LE(gridN, 16);
  gridHdr.writeInt16LE(gridN, 18);
  gridBodyParts.push(gridHdr);

  for (let ci = 0; ci < gridN * gridN; ci++) {
    const arr = gridCells[ci];
    const cb = Buffer.alloc(16 + arr.length * 4, 0);
    // +0: u32 0, +4: u32 0, +8: u32 count, +12..: u32 indices[], last: u32 0
    cb.writeUInt32LE(arr.length, 8);
    for (let k = 0; k < arr.length; k++) cb.writeUInt32LE(arr[k], 12 + k * 4);
    gridBodyParts.push(cb);
  }
  const gridBody = Buffer.concat(gridBodyParts);
  const gridChunk = Buffer.alloc(8 + gridBody.length);
  gridChunk.writeUInt32LE(0x0000000A, 0);
  gridChunk.writeUInt32LE(gridBody.length, 4);
  gridBody.copy(gridChunk, 8);

  const endMarker = Buffer.alloc(4);
  endMarker.writeUInt32LE(0xFFFFFFFF >>> 0, 0);

  // Post-END: meshHashes[numMeshes], texCount, texIds[texCount], 12 B empty embedded texture trailer
  const postEnd = Buffer.alloc(numMeshes * 4 + 4 + texIds.length * 4 + 12, 0);
  let pp = 0;
  for (let i = 0; i < numMeshes; i++) { postEnd.writeUInt32LE(sectors[i].hash >>> 0, pp); pp += 4; }
  postEnd.writeUInt32LE(texIds.length, pp); pp += 4;
  for (let i = 0; i < texIds.length; i++) { postEnd.writeUInt32LE(texIds[i] >>> 0, pp); pp += 4; }

  // Assemble Header + SObjects + MeshPtrs
  const headBuf = Buffer.alloc(headerAndTables, 0);
  headBuf.writeUInt16LE(4, 0);
  headBuf.writeUInt16LE(2, 2);
  headBuf.writeUInt32LE(ptrMeta >>> 0, 4);
  headBuf.writeUInt32LE(numObjs >>> 0, 8);

  const rgbDataOff = ptrMeta + 8; // Exact RGBs[0] file offset (verified in skhan.psx!)
  for (let i = 0; i < numObjs; i++) {
    const s = sectors[i];
    const o = 12 + i * 36;
    headBuf.writeUInt32LE(0, o);
    headBuf.writeInt32LE(s.ox << 12, o + 4);
    headBuf.writeInt32LE(s.oy << 12, o + 8);
    headBuf.writeInt32LE(s.oz << 12, o + 12);
    headBuf.writeUInt32LE(0, o + 16);
    headBuf.writeUInt16LE(0, o + 20);
    headBuf.writeUInt16LE(i, o + 22);
    headBuf.writeInt16LE(0, o + 24);
    headBuf.writeInt16LE(0, o + 26);
    headBuf.writeUInt32LE(0, o + 28);
    headBuf.writeUInt32LE(rgbDataOff >>> 0, o + 32);
  }
  const mtOff = 12 + numObjs * 36;
  headBuf.writeUInt32LE(numMeshes, mtOff);
  for (let i = 0; i < numMeshes; i++) headBuf.writeUInt32LE(meshOffs[i] >>> 0, mtOff + 4 + i * 4);

  return Buffer.concat([headBuf, ...sectors.map(s => s.buf), rgbsChunk, gridChunk, endMarker, postEnd]);
}

/**
 * Build skegyp_l.psx (Level VRAM Texture Bank, exact match to skhan_l.psx / skmar_l.psx!)
 */
function buildLevelTexPsx(textures) {
  const nTex = textures.length;
  const texIds = textures.map(t => nsHash(t.key));
  const encoded = textures.map((t, idx) => {
    const q = psxLib.quantizeImageForPsx(t.rgba, t.w, t.h, 256, -1, 0.52);
    const palId = nsHash(`${t.key}_pal8`);
    return { ...t, idx, palId, palBgr555: q.palBgr555, indices: q.indices, outRgba: q.outRgba };
  });

  // Header: 20 B (ver=4, unk2=2, ptrMeta=0x10, numObjs=0, meshCount=0, END=0xFFFFFFFF)
  const hdr = Buffer.alloc(20, 0);
  hdr.writeUInt16LE(4, 0);
  hdr.writeUInt16LE(2, 2);
  hdr.writeUInt32LE(0x10, 4);
  hdr.writeUInt32LE(0, 8);
  hdr.writeUInt32LE(0, 12);
  hdr.writeUInt32LE(0xFFFFFFFF >>> 0, 16);

  // texIds table
  const tidBuf = Buffer.alloc(4 + nTex * 4);
  tidBuf.writeUInt32LE(nTex, 0);
  for (let i = 0; i < nTex; i++) tidBuf.writeUInt32LE(texIds[i] >>> 0, 4 + i * 4);

  // numPal16 = 0
  const pal16Buf = Buffer.alloc(4, 0);

  // numPal256 = nTex (each 4 B palId + 512 B = 516 B)
  const pal256Buf = Buffer.alloc(4 + nTex * 516);
  pal256Buf.writeUInt32LE(nTex, 0);
  for (let i = 0; i < nTex; i++) {
    const po = 4 + i * 516;
    pal256Buf.writeUInt32LE(encoded[i].palId >>> 0, po);
    for (let c = 0; c < 256; c++) pal256Buf.writeUInt16LE(encoded[i].palBgr555[c], po + 4 + c * 2);
  }

  // Texture offset table + texture headers & pixel data
  const preTexOff = hdr.length + tidBuf.length + pal16Buf.length + pal256Buf.length + 4 + nTex * 4;
  const texOffBuf = Buffer.alloc(4 + nTex * 4);
  texOffBuf.writeUInt32LE(nTex, 0);

  let curOff = preTexOff;
  const texChunks = [];
  for (let i = 0; i < nTex; i++) {
    const e = encoded[i];
    texOffBuf.writeUInt32LE(curOff >>> 0, 4 + i * 4);
    const th = Buffer.alloc(20);
    th.writeUInt32LE(1, 0);           // unk/version = 1 (matches skhan_l.psx!)
    th.writeUInt32LE(256, 4);         // palSize = 256 (8bpp)
    th.writeUInt32LE(e.palId >>> 0, 8);
    th.writeUInt32LE(i, 12);          // texIdx = index into texIds[]
    th.writeUInt16LE(e.w, 16);
    th.writeUInt16LE(e.h, 18);
    const chunk = Buffer.concat([th, e.indices]);
    texChunks.push(chunk);
    curOff += chunk.length;
  }

  return {
    buf: Buffer.concat([hdr, tidBuf, pal16Buf, pal256Buf, texOffBuf, ...texChunks]),
    texIds,
    encoded,
  };
}

/**
 * Build skegyp_o.psx (Interactive & Collectible Crash 3 Egypt 3D Objects):
 *   Mesh 0 (0x5120A107)       : Real Crash 3 Emerald-Gold Scarab (Sc1mG) -> 5x Goal 5 spinning collectibles!
 *   Mesh 1 (nsHash('eg_vase')): Real Crash 3 Royal Pharaoh Vase (Va1iG)  -> 5x Goal 4 smashable vases!
 * Uses proven fl=0x2003 direct-RGB FT4 (100% verified on all 14 THPS1 & Crash B. 3D objects!).
 */
function buildObjectsPsx(scarabObj, vaseObj) {
  const entries = [
    { hash: 0x5120A107, texKey: 'ego_scarab', obj: scarabObj, targetSpan: 112, centerY: true,  pitchX: -0.42 },
    { hash: nsHash('eg_vase'), texKey: 'ego_vase', obj: vaseObj, targetSpan: 138, centerY: false, pitchX: 0 },
  ];

  const compiledMeshes = [];
  const texSpecs = [];

  entries.forEach((e, idx) => {
    const b = e.obj.bounds;
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ, 0.05);
    const scale = e.targetSpan / span;
    const cyMid = (b.minY + b.maxY) * 0.5;
    const cp = Math.cos(e.pitchX), sp = Math.sin(e.pitchX);

    const xform = ([x, y, z]) => {
      const dx = (x - b.cx) * scale;
      // If centerY: center vertically around Y=0 (floating spinning collectible!); else bottom anchored at Y=0 (resting on ledge/floor!)
      const dy = e.centerY ? -(y - cyMid) * scale : -(y - b.minY) * scale;
      const dz = (z - b.cz) * scale;
      // Optional gentle display tilt so Scarab's emerald-gold carapace faces camera dramatically!
      const ry = dy * cp - dz * sp;
      const rz = dy * sp + dz * cp;
      return [Math.round(dx), Math.round(ry), Math.round(rz)];
    };

    const verts = e.obj.verts.map(xform);
    const norms = [];
    const addN = (nx, ny, nz) => {
      const l = Math.hypot(nx, ny, nz) || 1;
      const fx = clamp(Math.round((nx / l) * 4096), -4096, 4096);
      const fy = clamp(Math.round((ny / l) * 4096), -4096, 4096);
      const fz = clamp(Math.round((nz / l) * 4096), -4096, 4096);
      norms.push([fx, fy, fz]);
      return norms.length - 1;
    };

    const faces = [];
    const maxU = e.obj.texW - 1, maxV = e.obj.texH - 1;
    for (const [t0, t1, t2] of e.obj.tris) {
      const ov0 = e.obj.verts[t0.vi], ov1 = e.obj.verts[t1.vi], ov2 = e.obj.verts[t2.vi];
      const oe1 = [ov1[0] - ov0[0], ov1[1] - ov0[1], ov1[2] - ov0[2]];
      const oe2 = [ov2[0] - ov0[0], ov2[1] - ov0[1], ov2[2] - ov0[2]];
      const onx = oe1[1] * oe2[2] - oe1[2] * oe2[1];
      const ony = oe1[2] * oe2[0] - oe1[0] * oe2[2];
      const onz = oe1[0] * oe2[1] - oe1[1] * oe2[0];
      const ol = Math.hypot(onx, ony, onz);
      if (ol < 1e-6) continue;
      // Rotate normal to THPS2 (-Y UP + pitchX)
      const ny0 = -ony / ol, nz0 = onz / ol;
      const outN = [onx / ol, ny0 * cp - nz0 * sp, ny0 * sp + nz0 * cp];

      const p0 = verts[t0.vi], p1 = verts[t1.vi], p2 = verts[t2.vi];
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const cx = e1[1] * e2[2] - e1[2] * e2[1];
      const cy = e1[2] * e2[0] - e1[0] * e2[2];
      const cz = e1[0] * e2[1] - e1[1] * e2[0];
      if (Math.hypot(cx, cy, cz) < 1e-4) continue;

      const rawUv = [t0, t1, t2].map(k => {
        const uv = e.obj.uvs[k.ti] || [0.5, 0.5];
        return [clamp(uv[0], 0, 1), clamp(1 - uv[1], 0, 1)];
      });
      const uC = (rawUv[0][0] + rawUv[1][0] + rawUv[2][0]) / 3;
      const vC = (rawUv[0][1] + rawUv[1][1] + rawUv[2][1]) / 3;
      const psxUv = rawUv.map(([u, v]) => [
        clamp(Math.round((u + (uC - u) * 0.07) * maxU), 0, maxU),
        clamp(Math.round((v + (vC - v) * 0.07) * maxV), 0, maxV),
      ]);

      let v = [t0.vi, t1.vi, t2.vi, t2.vi];
      let uv = [psxUv[0][0], psxUv[0][1], psxUv[1][0], psxUv[1][1], psxUv[2][0], psxUv[2][1], psxUv[2][0], psxUv[2][1]];
      if (cx * outN[0] + cy * outN[1] + cz * outN[2] > 0) {
        v = [t1.vi, t0.vi, t2.vi, t2.vi];
        uv = [psxUv[1][0], psxUv[1][1], psxUv[0][0], psxUv[0][1], psxUv[2][0], psxUv[2][1], psxUv[2][0], psxUv[2][1]];
      }
      const ni = addN(outN[0], outN[1], outN[2]);
      // Gentle directional tint around neutral 138 so collectibles pop vividly!
      const lum = clamp(124 + Math.round((outN[0] * -0.4 + outN[1] * -0.75 + outN[2] * 0.4) * 28), 96, 162);
      faces.push({ fl: 0x2003, sz: 28, v, rgb: [lum, lum, lum, 0x2C], ni, ti: idx, uv });
    }

    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9, maxR = 0;
    for (const [x, y, z] of verts) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
      const r = Math.hypot(x, y, z);
      if (r > maxR) maxR = r;
    }

    const totalLen = (28 + verts.length * 8 + norms.length * 8 + faces.length * 28 + 3) & ~3;
    const mb = Buffer.alloc(totalLen, 0);
    mb.writeUInt16LE(0x0008, 0);
    mb.writeUInt16LE(verts.length, 2);
    mb.writeUInt16LE(norms.length, 4);
    mb.writeUInt16LE(faces.length, 6);
    mb.writeUInt32LE((Math.ceil(maxR) << 12) >>> 0, 8);
    mb.writeInt16LE(x1, 12); mb.writeInt16LE(x0, 14);
    mb.writeInt16LE(y1, 16); mb.writeInt16LE(y0, 18);
    mb.writeInt16LE(z1, 20); mb.writeInt16LE(z0, 22);
    mb.writeUInt32LE(0xFFFF7FFF >>> 0, 24);
    let p = 28;
    for (const [x, y, z] of verts) { mb.writeInt16LE(x, p); mb.writeInt16LE(y, p + 2); mb.writeInt16LE(z, p + 4); p += 8; }
    for (const [nx, ny, nz] of norms) { mb.writeInt16LE(nx, p); mb.writeInt16LE(ny, p + 2); mb.writeInt16LE(nz, p + 4); p += 8; }
    for (const f of faces) {
      mb.writeUInt16LE(f.fl, p);
      mb.writeUInt16LE(f.sz, p + 2);
      mb[p + 4] = f.v[0]; mb[p + 5] = f.v[1]; mb[p + 6] = f.v[2]; mb[p + 7] = f.v[3];
      mb[p + 8] = f.rgb[0]; mb[p + 9] = f.rgb[1]; mb[p + 10] = f.rgb[2]; mb[p + 11] = f.rgb[3];
      mb.writeUInt16LE(f.ni, p + 12);
      mb.writeUInt16LE(0, p + 14);
      mb.writeUInt32LE(f.ti, p + 16);
      for (let k = 0; k < 8; k++) mb[p + 20 + k] = f.uv[k];
      p += 28;
    }

    compiledMeshes.push({ hash: e.hash, buf: mb });
    const q = psxLib.quantizeImageForPsx(e.obj.rgba, e.obj.texW, e.obj.texH, 256, -1, 0.52);
    texSpecs.push({
      id: nsHash(e.texKey),
      palId: nsHash(`${e.texKey}_pal8`),
      w: e.obj.texW,
      h: e.obj.texH,
      palBgr555: q.palBgr555,
      indices: q.indices,
    });
  });

  const nM = compiledMeshes.length;
  const headSize = 12 + nM * 36 + 4 + nM * 4;
  let curOff = headSize;
  const meshOffs = [];
  for (const m of compiledMeshes) { meshOffs.push(curOff); curOff += m.buf.length; }
  const ptrMeta = curOff;

  const head = Buffer.alloc(headSize, 0);
  head.writeUInt16LE(4, 0);
  head.writeUInt16LE(2, 2);
  head.writeUInt32LE(ptrMeta >>> 0, 4);
  head.writeUInt32LE(nM, 8);
  for (let i = 0; i < nM; i++) {
    const o = 12 + i * 36;
    head.writeUInt16LE(i, o + 22);
  }
  const mtOff = 12 + nM * 36;
  head.writeUInt32LE(nM, mtOff);
  for (let i = 0; i < nM; i++) head.writeUInt32LE(meshOffs[i] >>> 0, mtOff + 4 + i * 4);

  const endMark = Buffer.alloc(4); endMark.writeUInt32LE(0xFFFFFFFF >>> 0, 0);
  const hashBuf = Buffer.alloc(nM * 4);
  for (let i = 0; i < nM; i++) hashBuf.writeUInt32LE(compiledMeshes[i].hash >>> 0, i * 4);

  const nTex = texSpecs.length;
  const tidBuf = Buffer.alloc(4 + nTex * 4);
  tidBuf.writeUInt32LE(nTex, 0);
  for (let i = 0; i < nTex; i++) tidBuf.writeUInt32LE(texSpecs[i].id >>> 0, 4 + i * 4);

  const pal16Buf = Buffer.alloc(4, 0);
  const pal256Buf = Buffer.alloc(4 + nTex * 516);
  pal256Buf.writeUInt32LE(nTex, 0);
  for (let i = 0; i < nTex; i++) {
    const po = 4 + i * 516;
    pal256Buf.writeUInt32LE(texSpecs[i].palId >>> 0, po);
    for (let c = 0; c < 256; c++) pal256Buf.writeUInt16LE(texSpecs[i].palBgr555[c], po + 4 + c * 2);
  }

  const preTexOff = ptrMeta + 4 + hashBuf.length + tidBuf.length + pal16Buf.length + pal256Buf.length + 4 + nTex * 4;
  const texOffBuf = Buffer.alloc(4 + nTex * 4);
  texOffBuf.writeUInt32LE(nTex, 0);
  let toff = preTexOff;
  const texChunks = [];
  for (let i = 0; i < nTex; i++) {
    const ts = texSpecs[i];
    texOffBuf.writeUInt32LE(toff >>> 0, 4 + i * 4);
    const th = Buffer.alloc(20);
    th.writeUInt32LE(1, 0);
    th.writeUInt32LE(256, 4);
    th.writeUInt32LE(ts.palId >>> 0, 8);
    th.writeUInt32LE(i, 12);
    th.writeUInt16LE(ts.w, 16);
    th.writeUInt16LE(ts.h, 18);
    const c = Buffer.concat([th, ts.indices]);
    texChunks.push(c);
    toff += c.length;
  }

  return Buffer.concat([head, ...compiledMeshes.map(m => m.buf), endMark, hashBuf, tidBuf, pal16Buf, pal256Buf, texOffBuf, ...texChunks]);
}

// ============================================================================
// 7. Native THPS2 v2.0 Trigger Script Builder (SkEgyp_T.trg)
// ============================================================================

function strEven(s) {
  const b = Buffer.from(s + '\0', 'ascii');
  return (b.length & 1) ? Buffer.concat([b, Buffer.alloc(1, 0)]) : b;
}
function u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xFFFF, 0); return b; }
function i16(v) { const b = Buffer.alloc(2); b.writeInt16LE(v, 0); return b; }
function u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b; }
function i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v | 0, 0); return b; }

function buildEgyptTrg(worldInfo) {
  const { VASE_POSITIONS, hpTopY, poolR, pX0, pX1, pZ0, pZ1, pInX0, pInX1, pInZ0, pInZ1, hpXWestLip, hpXEastLip, hpZ0, hpZ1, nQpTopY, sQpTopY } = worldInfo;

  // Build ordered node factory functions (receives exact absolute nodeOff so internal 4-byte alignments are ALWAYS bit-exact!)
  const nodeBuilders = [];
  const addNode = (fn, reqMod4 = null) => {
    const id = nodeBuilders.length;
    nodeBuilders.push({ fn, reqMod4 });
    return id;
  };

  // Reserve core IDs
  const idReStart   = addNode(null, 0); // #0: Re_Start_Skate
  const idAutoExec  = addNode(null, 2); // #1: Type 4 AutoExec
  const idReStart2P = addNode(null, 0); // #2: Re_Start_2P
  const idAutoExec2 = addNode(null, 2); // #3: Type 15 AutoExec2
  const idStartup   = addNode(null, 0); // #4: Type 6 Startup activator (spawns PowerUps & Vases!)
  const idGoal4Mgr  = addNode(null, 0); // #5: Type 1 sub=0x00CB (Goal 4 Vase Counter Manager!)

  const startupLinks = [];

  // --- A. 11 GRIND RAILS (Type 10 RailDef + linked Type 10 chain!) ---
  const addRailChain = (pts, closed = false, terrain = 1) => {
    const ids = [];
    for (let i = 0; i < pts.length; i++) ids.push(addNode(null, null));
    for (let i = 0; i < pts.length; i++) {
      const links = [];
      if (i + 1 < pts.length) links.push(ids[i + 1]);
      else if (closed) links.push(ids[0]);
      const [x, y, z] = pts[i];
      nodeBuilders[ids[i]].fn = (absOff) => {
        const pre = Buffer.concat([u16(10), u16(links.length), ...links.map(u16)]);
        const pad = ((absOff + pre.length + 3) & ~3) - (absOff + pre.length);
        return Buffer.concat([pre, Buffer.alloc(pad, 0), i32(x), i32(y), i32(z), u16(terrain)]);
      };
    }
  };

  // 1. 360-degree Empty Pharaoh Pool Coping Rail (16 smooth points around circular-cornered bowl!)
  const poolRailPts = [];
  const rimY = -6;
  const rC = poolR * Math.sin(86 * Math.PI / 180);
  // NW corner (PI -> 1.5*PI)
  for (let k = 0; k <= 3; k++) { const a = lerp(Math.PI, Math.PI * 1.5, k / 3); poolRailPts.push([Math.round(pInX0 + Math.cos(a) * rC), rimY, Math.round(pInZ0 + Math.sin(a) * rC)]); }
  // NE corner (1.5*PI -> 2*PI)
  for (let k = 0; k <= 3; k++) { const a = lerp(Math.PI * 1.5, Math.PI * 2, k / 3); poolRailPts.push([Math.round(pInX1 + Math.cos(a) * rC), rimY, Math.round(pInZ0 + Math.sin(a) * rC)]); }
  // SE corner (0 -> 0.5*PI)
  for (let k = 0; k <= 3; k++) { const a = lerp(0, Math.PI * 0.5, k / 3); poolRailPts.push([Math.round(pInX1 + Math.cos(a) * rC), rimY, Math.round(pInZ1 + Math.sin(a) * rC)]); }
  // SW corner (0.5*PI -> PI)
  for (let k = 0; k <= 3; k++) { const a = lerp(Math.PI * 0.5, Math.PI, k / 3); poolRailPts.push([Math.round(pInX0 + Math.cos(a) * rC), rimY, Math.round(pInZ1 + Math.sin(a) * rC)]); }
  addRailChain(poolRailPts, true, 0); // stone pool coping!

  // 2 & 3. Grand Egyptian Half-Pipe West & East Coping Rails
  addRailChain([[hpXWestLip, Math.round(hpTopY) - 6, hpZ0 + 30], [hpXWestLip, Math.round(hpTopY) - 6, hpZ1 - 30]], false, 1);
  addRailChain([[hpXEastLip, Math.round(hpTopY) - 6, hpZ0 + 30], [hpXEastLip, Math.round(hpTopY) - 6, hpZ1 - 30]], false, 1);

  // 4 & 5. Twin Pyramid Spine Grind Rails (South -> Plateau -> North)
  addRailChain([[-260, -16, 740], [-260, -272, 260], [-260, -272, -260], [-260, -16, -740]], false, 1);
  addRailChain([[ 260, -16, 740], [ 260, -272, 260], [ 260, -272, -260], [ 260, -16, -740]], false, 1);

  // 6. Elevated Golden Obelisk Rail (Pyramid East -> Pool West Deck!)
  addRailChain([[320, -270, 0], [920, -210, 0], [1560, -145, 0]], false, 1);

  // 7 & 8. North Great Sphinx Temple NW & NE Quarter-Pipe Coping Rails
  addRailChain([[-4320, Math.round(nQpTopY) - 6, -4354], [-820, Math.round(nQpTopY) - 6, -4354]], false, 1);
  addRailChain([[  820, Math.round(nQpTopY) - 6, -4354], [4320, Math.round(nQpTopY) - 6, -4354]], false, 1);

  // 9 & 10. South Carved Hieroglyph Ledge Rails + NE Plaza Ledge Rail
  addRailChain([[-1190, -134, 1610], [-1190, -134, 2890]], false, 0);
  addRailChain([[ 1090, -134, 1610], [ 1090, -134, 2890]], false, 0);
  addRailChain([[ 2020, -129, -2510], [3880, -129, -2510]], false, 0);

  // 11 & 12. SW & SE South Quarter-Pipe Coping Rails
  addRailChain([[-4280, Math.round(sQpTopY) - 6, 4434], [-1100, Math.round(sQpTopY) - 6, 4434]], false, 1);
  addRailChain([[ 1100, Math.round(sQpTopY) - 6, 4434], [ 4280, Math.round(sQpTopY) - 6, 4434]], false, 1);

  // --- B. POWERUPS (Type 5, exact 24 B when absOff % 4 === 2!) ---
  const addPowerUp = (sub16, x, y, z) => {
    const id = addNode((absOff) => {
      const pre = Buffer.concat([u16(5), u16(sub16), u16(0)]);
      const pad = ((absOff + pre.length + 3) & ~3) - (absOff + pre.length);
      return Buffer.concat([pre, Buffer.alloc(pad, 0), i32(x), i32(y), i32(z), u16(0), u16(1), u16(0xFFFF)]);
    }, 2);
    startupLinks.push(id);
    return id;
  };

  // G3: C-R-A-S-H / S-K-A-T-E (verified live order: 4='C'/'S', 5='R'/'K', 6='A'/'A', 15='S'/'T', 10='H'/'E'!)
  addPowerUp( 4,     0, -200,  2250); // 'C' — right down spawn roll-in!
  addPowerUp( 5,     0, -390,     0); // 'R' — floating high above Central Pyramid plateau!
  addPowerUp( 6, -3050, -190,     0); // 'A' — center of Grand Egyptian Half-Pipe!
  addPowerUp(15,  2950,  340,     0); // 'S' — floating inside the Empty Pharaoh Swimming Pool!
  addPowerUp(10,     0, -210, -3350); // 'H' — directly in front of the Great Sphinx Temple Archway!

  // G8: Secret Power Crystal / Secret Tape (subtype 16 = 0x0010!) — soaring above Half-Pipe Spine!
  addPowerUp(16, -1720, -780,     0);

  // G5: 5x Real Crash 3 Spinning Emerald-Gold Scarab Beetles (subtype 33 = 0x0021 -> 0x5120A107 in skegyp_o.psx!)
  addPowerUp(33,     0, -145,  2750); // Scarab #1 — directly ahead down Spawn Roll-In on Frame 1!
  addPowerUp(33, -1720, -640,  -850); // Scarab #2 — North Half-Pipe Spine Lip!
  addPowerUp(33,  2950, -145,  1220); // Scarab #3 — South Rim of Empty Pharaoh Pool!
  addPowerUp(33,  2450, -620, -4220); // Scarab #4 — Above North-East Sphinx Temple Quarter-Pipe!
  addPowerUp(33, -2450, -620, -4220); // Scarab #5 — Above North-West Sphinx Temple Quarter-Pipe!

  // 18 Cash Pickups (6x Wumpa $50 [25], 6x Crystal $100 [26], 6x Diamond $250 [24] with unique high-byte cashBit 0..17!)
  const cashSpecs = [
    // Wumpa Fruit ($50, sub 25) along courtyard & pool deck lines
    [25,  -560, -135,  2550], [25,   560, -135,  2550], [25, -1190, -245,  1950],
    [25,  1090, -245,  1950], [25,  1400, -135,  -560], [25,  1400, -135,   560],
    // Power Crystals ($100, sub 26) along Pyramid rails, Obelisk & Pool Bowl
    [26,  -260, -365,     0], [26,   260, -365,     0], [26,   920, -310,     0],
    [26,  2400,  360,   420], [26,  3500,  360,  -420], [26,  2950, -245, -2510],
    // Clear Gems / Diamonds ($250, sub 24) high on Half-Pipe, Pool Air & North/South QPs
    [24, -4370, -660,     0], [24, -1720, -660,   850], [24,  4190, -155,     0],
    [24, -2650, -640, -4220], [24,  2650, -640, -4220], [24, -2650, -620,  4320],
  ];
  cashSpecs.forEach(([sub, x, y, z], bitIdx) => {
    addPowerUp(((bitIdx & 0xFF) << 8) | (sub & 0xFF), x, y, z);
  });

  // --- C. GOAL 4: 5 SMASHABLE REAL CRASH 3 ROYAL PHARAOH VASES (Type 1 0x0192 + Trigger + Goal4 0x00CB!) ---
  // Configure #5 (Goal 4 Counter Manager, exact match to skhan_t.trg #336!)
  nodeBuilders[idGoal4Mgr].fn = (absOff) => {
    const pre = Buffer.concat([u16(1), u16(0x00CB), u16(0x1000), u16(0), u16(0x0200), u16(0xFF04)]);
    const pad = ((absOff + pre.length + 3) & ~3) - (absOff + pre.length);
    return Buffer.concat([
      pre, Buffer.alloc(pad, 0),
      i32(0), i32(-500), i32(0),
      i16(0), i16(0), i16(0),
      u16(0x42C0), u16(0x0000), u16(0x4100),
    ]);
  };

  const vaseModelHash = nsHash('eg_vase');
  VASE_POSITIONS.forEach(([vx, vy, vz], idx) => {
    // 1. Smashable 3D Royal Pharaoh Vase (Type 1, sub=0x0192, flags=0x1000, shatter=3 -> SFX 60 in mar.vab!)
    const idVase = addNode((absOff) => {
      const pre = Buffer.concat([u16(1), u16(0x0192), u16(0x1000), u16(0), u16(0x0200), u16(0xFF04)]);
      const pad = ((absOff + pre.length + 3) & ~3) - (absOff + pre.length);
      return Buffer.concat([
        pre, Buffer.alloc(pad, 0),
        i32(vx), i32(vy), i32(vz),
        i16(0), i16(idx * 512), i16(0),
        u16(0x4105),
        u16(0x212F), u16(0x0000), u32(vaseModelHash),
        u16(0x4309), u16(0x0003),
        u16(0x4100),
      ]);
    }, 0);
    startupLinks.push(idVase);

    // 2. Goal-4 Kill/Shatter Node (Type 6, exact match to skhan_t.trg #337: 0600 0100 <vaseId> [pad] 00000000 0c00 ffff)
    const idKill = addNode((absOff) => {
      const pre = Buffer.concat([u16(6), u16(1), u16(idVase)]);
      const pad = ((absOff + pre.length + 3) & ~3) - (absOff + pre.length);
      return Buffer.concat([pre, Buffer.alloc(pad, 0), u32(0), u16(0x000C), u16(0xFFFF)]);
    }, 0);

    // 3. Invisible Trigger Poly Listener (Type 6, exact match to skhan_t.trg #259: signals idKill + idGoal4Mgr!)
    const trigHash = nsHash(`eg_vase_trig_${idx}`);
    addNode((absOff) => {
      const pre = Buffer.concat([u16(6), u16(2), u16(idKill), u16(idGoal4Mgr)]);
      const pad = ((absOff + pre.length + 3) & ~3) - (absOff + pre.length);
      return Buffer.concat([pre, Buffer.alloc(pad, 0), u32(trigHash), u16(0x0086), u16(0x0001), u16(0x0003), u16(0xFFFF)]);
    }, 0);
  });

  // --- D. 4 LIVE BIDIRECTIONAL GAPS (4300..4303, exact match to skhan_t.trg #84/#85!) ---
  const addBidirectionalGap = (meshNameA, meshNameB, gapId) => {
    const hA = nsHash(meshNameA), hB = nsHash(meshNameB);
    for (const [src, dst] of [[hA, hB], [hB, hA]]) {
      addNode((absOff) => {
        const pre = Buffer.concat([u16(6), u16(0)]);
        const pad = ((absOff + pre.length + 3) & ~3) - (absOff + pre.length);
        return Buffer.concat([
          pre, Buffer.alloc(pad, 0),
          u32(src),
          u16(0x00C9), u16(0x0000), u32(dst), u16(gapId),
          u16(0x0086), u16(0x0001), u16(0x0003), u16(0xFFFF),
        ]);
      }, 2);
    }
  };
  addBidirectionalGap('eg_gap_pool_w',   'eg_gap_pool_e',   4300); // [PISCINA DO FARAO] (gt=2, G6 Kickflip!)
  addBidirectionalGap('eg_pool_wall_w',  'eg_pool_wall_e',  4300); // Also trigger pool transfer wall-to-wall!
  addBidirectionalGap('eg_gap_spine_w',  'eg_gap_spine_e',  4301); // [TRANSFER HALF EGIPCIO] (gt=1, G7!)
  addBidirectionalGap('eg_gap_pyr_e',    'eg_gap_pool_w',   4302); // [GRIND DO OBELISCO] (gt=1, G7!)
  addBidirectionalGap('eg_gap_sphinx_w', 'eg_gap_sphinx_e', 4303); // [SALTO DA ESFINGE] (gt=1, G7!)

  // --- E. FILL RESERVED CORE NODES (#0 Re_Start_Skate, #1 AutoExec, #2 Re_Start_2P, #3 AutoExec2, #4 Startup) ---
  // #4 Startup Type 6 (exact match to skhan_t.trg #238: 0x0086 0x0001 0x0003 0xFFFF -> spawns PowerUps & Vases!)
  nodeBuilders[idStartup].fn = (absOff) => {
    const pre = Buffer.concat([u16(6), u16(startupLinks.length), ...startupLinks.map(u16)]);
    const pad = ((absOff + pre.length + 3) & ~3) - (absOff + pre.length);
    return Buffer.concat([pre, Buffer.alloc(pad, 0), u32(0), u16(0x0086), u16(0x0001), u16(0x0003), u16(0xFFFF)]);
  };

  // #0 Re_Start_Skate (Spawn on South Roll-In at (0, -245, +4250), Yaw=0 -> faces -Z straight across the park!)
  nodeBuilders[idReStart].fn = (absOff) => {
    const pre = Buffer.concat([u16(8), u16(1), u16(idStartup)]);
    const pad = ((absOff + pre.length + 3) & ~3) - (absOff + pre.length);
    return Buffer.concat([
      pre, Buffer.alloc(pad, 0),
      i32(0), i32(-248), i32(4250),
      i16(0), i16(0), i16(0),
      strEven('Re_Start_Skate'),
      u16(0x0002), strEven('Re_Start_Skate'), u16(0x0000),
      // Draw distance = 18500 (crisp towering Giza Pyramids & 360-deg twilight skybox!), fog start = 2048
      u16(0x0068), u16(0x000A), u16(18500), u16(0x0800),
      u16(0x00C8), u16(0x0030), Buffer.from([0x32, 0x62]),
      u16(0x00CA), u16(0x0090), Buffer.from([0x66, 0x42]),
      u16(0x009D), u16(0x0000),
      u16(0x00A6), u16(0x0800),
      u16(0x00A9), u16(0x0080),
      u16(0x0080), strEven('SkEgyp'),
      u16(0x0003), u16(0xFFFF),
    ]);
  };

  // #1 AutoExec (Type 4, exact SkVen_T.trg #1 format!)
  nodeBuilders[idAutoExec].fn = () => Buffer.concat([
    u16(4),
    u16(0x008C), strEven('Re_Start_Skate'),
    u16(0x00B2), strEven('Re_Start_2P'),
    u16(0x0093), u16(0x0001), // outdoor sky enabled!
    u16(0x007E), strEven('SkEgyp_L'),
    u16(0x007E), strEven('SkEgyp_O'),
    u16(0x008E), strEven('SkEgyp_O'),
    u16(0xFFFF),
  ]);

  // #2 Re_Start_2P (Type 8)
  nodeBuilders[idReStart2P].fn = (absOff) => {
    const pre = Buffer.concat([u16(8), u16(0)]);
    const pad = ((absOff + pre.length + 3) & ~3) - (absOff + pre.length);
    return Buffer.concat([
      pre, Buffer.alloc(pad, 0),
      i32(280), i32(-248), i32(4250),
      i16(0), i16(0), i16(0),
      strEven('Re_Start_2P'),
      u16(0x0068), u16(0x000A), u16(12000), u16(0x0400),
      u16(0x00C8), u16(0x0030), Buffer.from([0x32, 0x62]),
      u16(0x00CA), u16(0x0090), Buffer.from([0x66, 0x42]),
      u16(0x009D), u16(0x0000),
      u16(0x00A6), u16(0x0800),
      u16(0x00A9), u16(0x0080),
      u16(0x0080), strEven('SkEgyp_2'),
      u16(0x0003), u16(0xFFFF),
    ]);
  };

  // #3 AutoExec2 (Type 15, 2P mode)
  nodeBuilders[idAutoExec2].fn = () => Buffer.concat([
    u16(15),
    u16(0x00B2), strEven('Re_Start_2P'),
    u16(0x0093), u16(0x0001),
    u16(0x007E), strEven('SkEgyp_L'),
    u16(0x007E), strEven('SkEgyp_O'),
    u16(0x008E), strEven('SkEgyp_O'),
    u16(0xFFFF),
  ]);

  // Final Terminator Node (Type 255 = 0x00FF)
  addNode(() => u16(0x00FF), 2);

  // Serialize all nodes with exact alignment padding
  const numNodes = nodeBuilders.length;
  const headerSize = 12 + numNodes * 4;
  let curOff = headerSize;
  const offs = new Array(numNodes);
  const chunks = [];
  for (let i = 0; i < numNodes; i++) {
    const nb = nodeBuilders[i];
    if (nb.reqMod4 !== null) {
      const pad = (nb.reqMod4 - (curOff & 3) + 4) & 3;
      if (pad) { chunks.push(Buffer.alloc(pad, 0)); curOff += pad; }
    } else if (curOff & 1) {
      chunks.push(Buffer.alloc(1, 0)); curOff += 1;
    }
    offs[i] = curOff;
    const data = nb.fn(curOff);
    chunks.push(data);
    curOff += data.length;
  }

  const hdr = Buffer.alloc(headerSize, 0);
  hdr.write('_TRG', 0, 'ascii');
  hdr.writeUInt16LE(2, 4);
  hdr.writeUInt16LE(0, 6);
  hdr.writeUInt32LE(numNodes, 8);
  for (let i = 0; i < numNodes; i++) hdr.writeUInt32LE(offs[i] >>> 0, 12 + i * 4);
  return Buffer.concat([hdr, ...chunks]);
}

// ============================================================================
// 8. 3D Software Textured Z-Buffer Preview Renderer + Level Select BMP Builder
//    (Renders real perspective views directly from our compiled skegyp.psx!)
// ============================================================================

function renderLevelView(sectors, texList, camPos, lookAt, W, H, fovDeg = 68) {
  const rgba = Buffer.alloc(W * H * 4);
  const zbuf = new Float32Array(W * H);
  zbuf.fill(1e9);

  // Warm Egyptian twilight background gradient
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const r = Math.round(lerp(24, 185, Math.pow(t, 1.3)));
    const g = Math.round(lerp(30, 120, Math.pow(t, 1.3)));
    const b = Math.round(lerp(96, 62, t));
    for (let x = 0; x < W; x++) {
      const di = (y * W + x) * 4;
      rgba[di] = r; rgba[di + 1] = g; rgba[di + 2] = b; rgba[di + 3] = 255;
    }
  }

  // Camera basis (THPS2 world: -Y is UP, so worldUp = [0, -1, 0])
  const fwd = [lookAt[0] - camPos[0], lookAt[1] - camPos[1], lookAt[2] - camPos[2]];
  const fl = Math.hypot(fwd[0], fwd[1], fwd[2]) || 1;
  fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
  const upW = [0, -1, 0];
  // right = normalize(cross(fwd, upW)) — check polarity: when fwd=(0,0,-1), cross((0,0,-1),(0,-1,0)) = (-1,0,0), so use cross(upW, fwd) = (+1,0,0)!
  let rx = upW[1] * fwd[2] - upW[2] * fwd[1];
  let ry = upW[2] * fwd[0] - upW[0] * fwd[2];
  let rz = upW[0] * fwd[1] - upW[1] * fwd[0];
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  // camUp = cross(fwd, right) -> points toward screen-top (world -Y!)
  const ux = fwd[1] * rz - fwd[2] * ry;
  const uy = fwd[2] * rx - fwd[0] * rz;
  const uz = fwd[0] * ry - fwd[1] * rx;

  const fScale = (W * 0.5) / Math.tan((fovDeg * Math.PI) / 360);

  const project = (pt) => {
    const dx = pt[0] - camPos[0], dy = pt[1] - camPos[1], dz = pt[2] - camPos[2];
    const cz = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
    if (cz < 20) return null;
    const cx = dx * rx + dy * ry + dz * rz;
    const cy = dx * ux + dy * uy + dz * uz;
    return [W * 0.5 + (cx / cz) * fScale, H * 0.5 - (cy / cz) * fScale, cz];
  };

  const rasterTri = (p0, p1, p2, uv0, uv1, uv2, tex, lit) => {
    const a = project(p0), b = project(p1), c = project(p2);
    if (!a || !b || !c) return;
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 0.25) return;
    const invA = 1 / area;
    const tw = tex.w, th = tex.h, td = tex.rgba;
    const iz0 = 1 / a[2], iz1 = 1 / b[2], iz2 = 1 / c[2];
    const u0z = uv0[0] * iz0, v0z = uv0[1] * iz0;
    const u1z = uv1[0] * iz1, v1z = uv1[1] * iz1;
    const u2z = uv2[0] * iz2, v2z = uv2[1] * iz2;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) * invA;
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) * invA;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
        const iz = w0 * iz0 + w1 * iz1 + w2 * iz2;
        const z = 1 / iz;
        const idx = y * W + x;
        if (z >= zbuf[idx]) continue;
        zbuf[idx] = z;
        const u = clamp(Math.round(((w0 * u0z + w1 * u1z + w2 * u2z) * z)), 0, tw - 1);
        const v = clamp(Math.round(((w0 * v0z + w1 * v1z + w2 * v2z) * z)), 0, th - 1);
        const ti = (v * tw + u) * 4;
        const di = idx * 4;
        rgba[di]     = clamp(Math.round(td[ti]     * lit[0]), 0, 255);
        rgba[di + 1] = clamp(Math.round(td[ti + 1] * lit[1]), 0, 255);
        rgba[di + 2] = clamp(Math.round(td[ti + 2] * lit[2]), 0, 255);
        rgba[di + 3] = 255;
      }
    }
  };

  for (const s of sectors) {
    if (s.isTriggerOnly) continue;
    for (const f of s.faces) {
      if (f.fl === 0x0080) continue;
      const tex = texList[f.ti];
      if (!tex) continue;
      const cRgb = RGBS_PAL[f.c[0]] || [128, 128, 128];
      const lit = [cRgb[0] / 128, cRgb[1] / 128, cRgb[2] / 128];
      const p0 = s.worldVerts[f.v[0]], p1 = s.worldVerts[f.v[1]], p2 = s.worldVerts[f.v[2]];
      const uv0 = [f.uv[0], f.uv[1]], uv1 = [f.uv[2], f.uv[3]], uv2 = [f.uv[4], f.uv[5]];
      rasterTri(p0, p1, p2, uv0, uv1, uv2, tex, lit);
      if (f.fl !== 0x1813) {
        const p3 = s.worldVerts[f.v[3]];
        const uv3 = [f.uv[6], f.uv[7]];
        rasterTri(p1, p3, p2, uv1, uv3, uv2, tex, lit);
      }
    }
  }
  return rgba;
}

function buildThps2BmpFromPng(srcPngPath, outBmpPath, width, height) {
  const palPng = outBmpPath + '.pal.png';
  const rawBmp = outBmpPath + '.raw.bmp';
  const vfBase = `scale=${width}:${height}:flags=lanczos,drawbox=x=0:y=0:w=${width}:h=${height}:color=0x101018:t=1`;
  const r1 = spawnSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', srcPngPath,
    '-vf', `${vfBase},palettegen=max_colors=256:reserve_transparent=0:stats_mode=single`,
    palPng,
  ]);
  if (r1.status !== 0) throw new Error(`ffmpeg palettegen failed: ${r1.stderr?.toString()}`);
  const r2 = spawnSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', srcPngPath, '-i', palPng,
    '-lavfi', `${vfBase} [x]; [x][1:v] paletteuse=dither=floyd_steinberg`,
    '-pix_fmt', 'pal8', '-f', 'image2', rawBmp,
  ]);
  if (r2.status !== 0) throw new Error(`ffmpeg paletteuse failed: ${r2.stderr?.toString()}`);

  const b = fs.readFileSync(rawBmp);
  const offBits = b.readUInt32LE(10);
  const w = b.readInt32LE(18), h = b.readInt32LE(22), bpp = b.readUInt16LE(28);
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
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(8, 28);
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(imgSize, 34);
  out.writeUInt32LE(256, 46);
  b.copy(out, 54, 54, 54 + Math.min(1024, offBits - 54));
  if (h > 0) {
    b.copy(out, 1078, offBits, offBits + imgSize);
  } else {
    for (let y = 0; y < height; y++) {
      b.copy(out, 1078 + y * stride, offBits + (height - 1 - y) * stride, offBits + (height - y) * stride);
    }
  }
  fs.writeFileSync(outBmpPath, out);
  try { fs.unlinkSync(palPng); } catch {}
  try { fs.unlinkSync(rawBmp); } catch {}
  return out;
}

// ============================================================================
// 9. Main Compiler + Self-Verification + 3D QA Sheet
// ============================================================================

function buildEgyptLevel() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('=== Crash 3 Egypt ("Tomb Time") Native THPS2 PS1 Level Compiler ===\n');

  // 1. Curate authentic Crash 3 Egypt architectural textures
  const textures = buildCuratedTextures();

  // 2. Load all 9 real Crash 3 Egypt 3D models (7 world props + 2 collectibles!)
  const propSpecs = [
    ['Sa1iG', 'Sa1iG_6c502955'],
    ['SwHiG', 'SwHiG_6d056955'],
    ['Mu1iG', 'Mu1iG_60f02955'],
    ['sg1mG', 'sg1mG_38802b55'],
    ['CbriG', 'CbriG_4c5b6955'],
    ['Pl2iG', 'Pl2iG_66a84955'],
    ['Pl3iG', 'Pl3iG_66a86955'],
    ['El2iG', 'El2iG_50a84955'],
  ];
  const props = {};
  for (const [shortName, dirName] of propSpecs) {
    const obj = loadCrash3Obj(dirName);
    const texIdx = textures.length;
    textures.push({ key: `eg_prop_tex_${shortName.toLowerCase()}`, w: obj.texW, h: obj.texH, rgba: obj.rgba });
    props[shortName] = { obj, texIdx };
  }
  const scarabObj = loadCrash3Obj('Sc1mG_6c602b55');
  const vaseObj   = loadCrash3Obj('Va1iG_72502955');
  console.log(`  [ASSETS] ${textures.length} textures VRAM (${18} arq/ceu/trilho + ${propSpecs.length} props 3D) + 2 coletaveis 3D reais Crash 3 (Sc1mG, Va1iG).`);

  // 3. Build 3D arena geometry & compile skegyp_l.psx, skegyp.psx, skegyp_2.psx, skegyp_o.psx, SkEgyp_T.trg
  const worldInfo = buildEgyptWorld(textures, props);
  const { buf: texBuf, texIds } = buildLevelTexPsx(textures);
  const levelBuf = buildLevelPsx(worldInfo.sectors, texIds);
  const objBuf   = buildObjectsPsx(scarabObj, vaseObj);
  const trgBuf   = buildEgyptTrg(worldInfo);

  // Self-verify TAG 0x0A, surfFlags & object hashes!
  const verifyLevel = () => {
    const ptrMeta = levelBuf.readUInt32LE(4);
    const numObjs = levelBuf.readUInt32LE(8);
    let p = ptrMeta, sawRgbs = false, sawGrid = false;
    while (p < levelBuf.length) {
      const tag = levelBuf.readUInt32LE(p); p += 4;
      if (tag === 0xFFFFFFFF) break;
      const len = levelBuf.readUInt32LE(p); p += 4;
      if (tag === 0x73424752 && len === 1024) sawRgbs = true;
      if (tag === 0x0000000A) {
        sawGrid = true;
        const gX = levelBuf.readInt16LE(p + 16), gZ = levelBuf.readInt16LE(p + 18);
        let cp = p + 20, totalRefs = 0;
        for (let i = 0; i < gX * gZ; i++) {
          const cnt = levelBuf.readUInt32LE(cp + 8);
          totalRefs += cnt;
          cp += 16 + cnt * 4;
        }
        if (cp !== p + len) throw new Error(`TAG 0x0A byte-length mismatch: ${cp - p} vs ${len}`);
        console.log(`  [VERIFY] TAG 0x0A CWorldGrid 20x20 EXATO (${len} B, ${totalRefs} refs em 400 celulas)`);
      }
      p += len;
    }
    if (!sawRgbs || !sawGrid) throw new Error('Missing RGBs or TAG 0x0A in skegyp.psx!');
    let totalFaces = 0, vertFaces = 0, trigFaces = 0;
    for (const s of worldInfo.sectors) {
      for (const f of s.faces) {
        totalFaces++;
        if (f.sf & 0x0020) vertFaces++;
        if (f.sf & 0x0002) trigFaces++;
      }
    }
    console.log(`  [VERIFY] skegyp.psx: ${numObjs} setores, ${totalFaces} poligonos (${vertFaces} VERT 0x0020, ${trigFaces} TRIGGER 0x0002)`);
    const parsedObj = psxLib.parsePsxStructure(objBuf);
    if (parsedObj.numMeshes !== 2 || parsedObj.meshHashes[0] !== 0x5120A107 || parsedObj.textures.length !== 2) {
      throw new Error('skegyp_o.psx self-verify failed!');
    }
    console.log(`  [VERIFY] skegyp_o.psx: 2 objetos (Scarab 0x${parsedObj.meshHashes[0].toString(16)}, Vase 0x${parsedObj.meshHashes[1].toString(16)}), 2 texturas 8bpp`);
  };
  verifyLevel();

  // Write all 5 core level files!
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp.psx'),   levelBuf);
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp_2.psx'), levelBuf);
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp_l.psx'), texBuf);
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp_o.psx'), objBuf);
  fs.writeFileSync(path.join(OUT_DIR, 'SkEgyp_T.trg'), trgBuf);

  // 4. Render 4 multi-angle 3D QA views + generate real Level Select BMPs (t1rend09.bmp & t1levl09.bmp)!
  const vw = 352, vh = 200;
  const views = [
    renderLevelView(worldInfo.sectors, textures, [    0, -680,  4200], [    0, -200,  -900], vw, vh, 72), // Spawn overview -> Pyramid + Arch + Half-Pipe + Pool!
    renderLevelView(worldInfo.sectors, textures, [  960, -680,  2200], [ 2950,  220,     0], vw, vh, 70), // Empty Pharaoh Pool & Mosaic Bowl + Mummies!
    renderLevelView(worldInfo.sectors, textures, [-1350, -760,  2600], [-3100, -280,     0], vw, vh, 72), // Grand Egyptian Half-Pipe + Sarcophagi + Spine!
    renderLevelView(worldInfo.sectors, textures, [    0, -600, -1600], [    0, -640, -4500], vw, vh, 72), // Great Sphinx Archway + Pharaoh Mural + Giza Pyramids!
  ];

  // Compose 2x2 QA Contact Sheet
  const sheetW = vw * 2, sheetH = vh * 2;
  const sheet = Buffer.alloc(sheetW * sheetH * 4);
  views.forEach((v, idx) => {
    const gx = (idx % 2) * vw, gy = Math.floor(idx / 2) * vh;
    for (let y = 0; y < vh; y++) {
      v.copy(sheet, ((gy + y) * sheetW + gx) * 4, y * vw * 4, (y + 1) * vw * 4);
    }
  });
  const qaPng = path.join(OUT_DIR, 'egypt_level_3d_qa.png');
  psxLib.writePng(qaPng, sheetW, sheetH, sheet);

  // Render crisp panoramic views specifically framed for t1rend09.bmp (176x48) & t1levl09.bmp (212x52)!
  const rendSrcPng = path.join(OUT_DIR, 't1rend09_src.png');
  const levlSrcPng = path.join(OUT_DIR, 't1levl09_src.png');
  const rendRgba = renderLevelView(worldInfo.sectors, textures, [-240, -640, 3800], [80, -300, -1900], 352, 96, 80);
  const levlRgba = renderLevelView(worldInfo.sectors, textures, [ 680, -740, 2900], [2000, -120, -1500], 424, 104, 82);
  psxLib.writePng(rendSrcPng, 352, 96, rendRgba);
  psxLib.writePng(levlSrcPng, 424, 104, levlRgba);

  const rendBmp = buildThps2BmpFromPng(rendSrcPng, path.join(OUT_DIR, 't1rend09.bmp'), 176, 48);
  const levlBmp = buildThps2BmpFromPng(levlSrcPng, path.join(OUT_DIR, 't1levl09.bmp'), 212, 52);

  console.log(`\n  [OUTPUT] build/egypt/:`);
  console.log(`    skegyp.psx    : ${(levelBuf.length / 1024).toFixed(1)} KB (${Math.ceil(levelBuf.length / 2048)} setores)`);
  console.log(`    skegyp_l.psx  : ${(texBuf.length / 1024).toFixed(1)} KB (${Math.ceil(texBuf.length / 2048)} setores)`);
  console.log(`    skegyp_o.psx  : ${(objBuf.length / 1024).toFixed(1)} KB (${Math.ceil(objBuf.length / 2048)} setores)`);
  console.log(`    SkEgyp_T.trg  : ${(trgBuf.length / 1024).toFixed(1)} KB (${Math.ceil(trgBuf.length / 2048)} setores)`);
  console.log(`    t1rend09.bmp  : ${rendBmp.length} B (${Math.ceil(rendBmp.length / 2048)} setores <= 5)`);
  console.log(`    t1levl09.bmp  : ${levlBmp.length} B (${Math.ceil(levlBmp.length / 2048)} setores <= 6)`);
  console.log(`    QA 3D Sheet   : ${qaPng}`);

  return { levelBuf, texBuf, objBuf, trgBuf, rendBmp, levlBmp };
}

if (require.main === module) {
  buildEgyptLevel();
}

module.exports = { buildEgyptLevel };
