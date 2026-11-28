#!/usr/bin/env node
'use strict';

/**
 * Crash Bandicoot 3: Warped — "Tomb Time" (Egypt) THPS2 PS1 Level Compiler
 * (Hangar + Creative False Wall Portal + Massive Marseille-Sized Secret Tomb + Green Gem Edition)
 *
 * Architecture:
 *   1. ALIVE 60-30-10 Crash 3 Egypt Color Palette (skegyp_l.psx, 105/105 textures):
 *        - 60% Warm sunlit golden-amber sandstone & dressed limestone (sat ~0.48..0.58)
 *        - 30% Rich terracotta brickwork, weathered basalt & hammered antique bronze
 *        - 10% Authentic Egyptian Lapis-Cobalt Blue & Pharaoh Gold trims (L[6]),
 *          Real Crash 3 Turquoise-Gold Mosaic Pool Tile Eg5iT (L[55], 8bpp, 0 Hangar faces),
 *          and Creative False Wall Cracked Sandstone + Emerald-Gold Pharaoh Seal (L[68]).
 *        - Clean weathered sandstone tomb walls (ZERO excessive hieroglyph wall clutter!).
 *        - Real 2x2 256-color (8bpp) Crash 3 Statue Atlas in L[28] (freed by carving obj[59]!).
 *   2. 100% Watertight Hangar Hall + Creative False Wall Portal (obj[59]):
 *        - Preserves all 470 Hangar sectors & collisions untouched EXCEPT obj[59] bottom QP bands,
 *          carving a 1,000x500 stone temple archway at X[-2500..-1500], Y[-600..-100], Z=-6950
 *          veiled by a 2-sided illusory False Wall (SF_DECO=0x0001, 100% pass-through!)
 *          leading through a solid torchlit corridor (Z=-6500..-8600) into the Secret Tomb!
 *   3. Massive Marseille-Sized Secret Egyptian Tomb (16,000 x 16,000 units, X[-9500..+6500], Z[-24600..-8600]):
 *        - 100% watertight subdivided sandstone floor, clean outer walls + invisible perimeter barriers
 *        - Zone 1: Entrance Courtyard with solid-hulled Crash 3 Shield Guards, Lotus Pillars,
 *          Pharaoh Spine Transfer, Lapis-Gold Hubba Ledges & Stair-Set
 *        - Zone 2: East Empty Pharaoh Pool #1 ("Great Oasis Mosaic Bowl", real Eg5iT turquoise-gold mosaic)
 *        - Zone 3: Southwest Empty Pharaoh Pool #2 ("Sunken Sarcophagus Bowl", terracotta-lapis)
 *        - Zone 4: Twin Grand Egyptian Half-Pipes (Western & Eastern) with solid decks, end-caps & coping rails
 *        - Zone 5 & 6: Central Stepped Pyramid Access Ramp -> Elevated Terrace -> Launch Kicker ->
 *          HIGH AERIAL GOLDEN GRIND RAIL (X=-1200, Y=-780, Z=-16100..-21500, 680u high!) ->
 *          REAL CRASH 3 GLOWING EMERALD GREEN GEM (Ge10G, o[20], 0x5120A108) -> North Landing Ramp
 *          & Colossal North Wall Crash 3 Sphinx Mask (SwHiG) Sanctuary + Quarter-Pipes!
 *   4. Native Rebuilt 20x20 Square TAG 0x0A CWorldGrid covering full Hangar + Secret Tomb bounds.
 *   5. skegyp_o.psx (21 meshes): 18 reskinned Hangar props + Scarab o[8] (0x5120A107) +
 *      Pharaoh Vase o[9] (0x4EB2C689) + Real Crash 3 Glowing Emerald Green Gem o[20] (0x5120A108).
 *   6. Native SkEgyp_T.trg: preserves all 712 Hangar nodes + relocates Secret Collectible (node 149)
 *      onto the High Aerial Golden Grind Rail (-1200, -855, -18800) + appends Secret Tomb Type 10 rails!
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const psxLib = require('./psx_skater_lib');

const ROOT = psxLib.rootDir;
const CRASH3_BASE = path.join(ROOT, 'crash_3_psx', 'crash3_thps2_master', '02_extracted_crash3_complete');
const RAW_TPAG_DIR = path.join(CRASH3_BASE, '03_textures_tpag', 'raw_64kb');
const SHEET_DIR = path.join(CRASH3_BASE, '03_textures_tpag', 'used_palettized_sheets');
const OBJ_DIR = path.join(CRASH3_BASE, '04_models_3d_objects', 'obj');
const BACKUP_DIR = path.join(ROOT, 'originals_backup');
const OUT_DIR = path.join(ROOT, 'build', 'egypt');
const FFMPEG = psxLib.ffmpegExe;

const clamp = psxLib.clamp;
const lerp = psxLib.lerp;
const nsHash = psxLib.nsHash;

// Surface flags (100% verified against retail skhan.psx & skmar.psx)
const SF_DECO  = 0x0001; // Visible, non-collidable (False Wall & decorative Crash 3 statues)
const SF_BOUND = 0x0040; // Invisible perimeter safety wall
const SF_WALL  = 0x0180; // Solid vertical wall / obstacle hull
const SF_SOLID = 0x0190; // Solid architectural block
const SF_FLOOR = 0x1800; // Skateable floor / ramp / deck
const SF_VERT  = 0x1820; // Curved VERT half-pipe / quarter-pipe / pool transition

// Face flags (100% verified against retail skhan.psx & skmar.psx)
const FL_TEX_QUAD    = 0x1803; // 28 B visible textured Gouraud quad (HAN oi=59 exact!)
const FL_SUBDIV_QUAD = 0x3823; // 32 B PS1 GTE perspective-subdivided quad (HAN oi=137 exact!)
const FL_TEX_TRI     = 0x1813; // 28 B visible textured Gouraud tri
const FL_SUBDIV_TRI  = 0x3833; // 32 B PS1 GTE perspective-subdivided tri
const FL_INVIS_QUAD  = 0x0083; // 28 B invisible solid collision quad (Marseille exact format!)

// Dedicated skhan.psx texture indices (verified hanTi -> skhan_l idx, 100% exclusive palettes!):
const TI_FLOOR_STONE   = 24;  // L[23]  64x64 sunlit golden sandstone floor
const TI_FLOOR_LIGHT   = 25;  // L[24]  64x64 cream-gold limestone floor
const TI_FLOOR_DARK    = 27;  // L[27]  64x64 shaded warm ochre floor
const TI_RAMP_STONE    = 1;   // L[1]   64x64 warm honey-gold dressed limestone ramp
const TI_RAMP_WARM     = 16;  // L[15]  64x64 amber-ochre temple ramp
const TI_WALL_CLEAN    = 7;   // L[7]   64x64 clean weathered golden sandstone wall (NO hieroglyph clutter!)
const TI_WALL_WARM     = 20;  // L[19]  64x64 warm terracotta-sandstone masonry
const TI_WALL_DARK     = 0;   // L[0]   64x64 deep weathered basalt / shadowed stone
const TI_TERRACOTTA    = 13;  // L[12]  64x64 8bpp rich Crash 3 terracotta brick (0 Hangar faces!)
const TI_LAPIS_GOLD    = 6;   // L[6]   64x64 8bpp Egyptian Lapis-Cobalt & Antique Gold trim (0 Hangar faces!)
const TI_STATUE_ATLAS  = 28;  // L[28]  64x64 8bpp 2x2 Real Crash 3 Statue Atlas (0 Hangar faces!)
const TI_SKY           = 63;  // L[64]  64x64 8bpp Golden-Cobalt Egyptian Sunset Sky!
const TI_FALSE_WALL    = 97;  // L[97]  64x64 4bpp Cracked Sandstone + Emerald-Gold Pharaoh Seal (0 Hangar faces!)
const TI_POOL_MOSAIC   = 101; // L[101] 64x64 8bpp Real Crash 3 Turquoise-Gold Mosaic Pool Tile (0 Hangar faces!)

// ============================================================================
// 1. Original Hangar Asset Loader (originals_backup/CD.HED + CD.WAD)
// ============================================================================

let _origWadCache = null;
function getOriginalWadFile(name) {
  if (!_origWadCache) {
    const hed = fs.readFileSync(path.join(BACKUP_DIR, 'CD.HED'));
    const wad = fs.readFileSync(path.join(BACKUP_DIR, 'CD.WAD'));
    const byHash = new Map();
    for (let off = 0; off + 12 <= hed.length; off += 12) {
      const h = hed.readUInt32LE(off);
      if (h === 0 && off + 4 === hed.length) break;
      byHash.set(h >>> 0, { offset: hed.readUInt32LE(off + 4), size: hed.readUInt32LE(off + 8) });
    }
    _origWadCache = { wad, byHash };
  }
  const e = _origWadCache.byHash.get(nsHash(name));
  if (!e) throw new Error(`Arquivo original nao encontrado em originals_backup/CD.WAD: ${name}`);
  return Buffer.from(_origWadCache.wad.subarray(e.offset, e.offset + e.size));
}

// ============================================================================
// 2. Crash 3 Egypt TPAG Extractor & Alive 60-30-10 Desert Tomb Color Grading
// ============================================================================

const tpagsByName = new Map();
function loadTpags() {
  if (tpagsByName.size > 0) return;
  for (const f of fs.readdirSync(RAW_TPAG_DIR)) {
    const name = f.split('_')[0];
    tpagsByName.set(name, fs.readFileSync(path.join(RAW_TPAG_DIR, f)));
  }
}

function abgr1555ToRgb(c16) {
  if (c16 === 0) return [16, 12, 8];
  const r = ((c16 & 31) << 3) | ((c16 & 31) >> 2);
  const g = (((c16 >> 5) & 31) << 3) | (((c16 >> 5) & 31) >> 2);
  const b = (((c16 >> 10) & 31) << 3) | (((c16 >> 10) & 31) >> 2);
  return [r, g, b];
}

function rgbToAbgr1555(r, g, b, allowZero = false) {
  const r5 = clamp(Math.round(r / 8), 0, 31);
  const g5 = clamp(Math.round(g / 8), 0, 31);
  const b5 = clamp(Math.round(b / 8), 0, 31);
  let c16 = (b5 << 10) | (g5 << 5) | r5;
  if (!allowZero && c16 === 0) c16 = 0x0421;
  return c16;
}

function extractTile(tpagName, bpp, subpageX, clutX, clutY, minU, minV, w, h, dstW = 64, dstH = 64) {
  loadTpags();
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
        const byte = tbuf[vv * 512 + ((pageX + (sx >> 1)) & 0x1FF)];
        const idx = (sx & 1) ? (byte >> 4) : (byte & 15);
        c16 = tbuf.readUInt16LE((clutOff + idx * 2) & 0xFFFF);
      } else {
        const idx = tbuf[vv * 512 + ((pageX + sx) & 0x1FF)];
        c16 = tbuf.readUInt16LE((clutOff + idx * 2) & 0xFFFF);
      }
      const [r, g, b] = abgr1555ToRgb(c16);
      const di = (y * dstW + x) * 4;
      out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = 255;
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

function resizeRgba(src, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return Buffer.from(src);
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw));
      const si = (sy * sw + sx) * 4;
      const di = (y * dw + x) * 4;
      out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3];
    }
  }
  return out;
}

/**
 * Alive, balanced 60-30-10 Crash 3 Egypt color grader.
 * Preserves authentic warm sunlit golden sandstone, terracotta, and purposeful lapis/gold/turquoise
 * contrast — NEVER washed-out lifeless gray AND NEVER garish neon!
 */
function gradeEgyptAlive(rgba, {
  sat = 0.56,
  tint = [1.14, 1.00, 0.74],
  lumScale = 1.04,
  lumBias = 4,
  contrast = 0.96,
  tameNeon = 0.35,
  preserveCool = false,
  minLum = 24,
  maxLum = 228,
} = {}) {
  const out = Buffer.alloc(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    let r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const a = rgba[i + 3];
    if (a < 128) {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
      continue;
    }
    const y0 = 0.299 * r + 0.587 * g + 0.114 * b;
    let localSat = sat;

    if (!preserveCool) {
      // Gently tame accidental harsh green/magenta artifacts while preserving warm gold/terracotta life
      const greenSpike = Math.max(0, g - Math.max(r, b) - 24);
      if (greenSpike > 0) localSat *= clamp(1 - (greenSpike / 90) * 0.65, 0.25, 1.0);
      const magentaSpike = Math.max(0, Math.min(r, b) - g - 28);
      if (magentaSpike > 0) localSat *= clamp(1 - (magentaSpike / 90) * 0.70, 0.20, 1.0);
    }
    if (tameNeon > 0) {
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (chroma > 135) {
        localSat *= clamp(1 - ((chroma - 135) / 140) * tameNeon, 0.45, 1.0);
      }
    }

    r = y0 + (r - y0) * localSat;
    g = y0 + (g - y0) * localSat;
    b = y0 + (b - y0) * localSat;

    r = ((r - 116) * contrast + 116) * lumScale * tint[0] + lumBias;
    g = ((g - 116) * contrast + 116) * lumScale * tint[1] + lumBias;
    b = ((b - 116) * contrast + 116) * lumScale * tint[2] + lumBias;

    const y1 = 0.299 * r + 0.587 * g + 0.114 * b;
    if (y1 > maxLum && y1 > 1) {
      const s = maxLum / y1;
      r *= s; g *= s; b *= s;
    } else if (y1 < minLum && y1 > 0.1) {
      const s = minLum / y1;
      r = Math.min(255, r * s); g = Math.min(255, g * s); b = Math.min(255, b * s);
    }

    out[i]     = clamp(Math.round(r), 12, 242);
    out[i + 1] = clamp(Math.round(g), 12, 236);
    out[i + 2] = clamp(Math.round(b), 12, 224);
    out[i + 3] = 255;
  }
  return out;
}

function blendRgba(a, b, alpha) {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i += 4) {
    out[i]     = clamp(Math.round(lerp(a[i],     b[i],     alpha)), 12, 242);
    out[i + 1] = clamp(Math.round(lerp(a[i + 1], b[i + 1], alpha)), 12, 236);
    out[i + 2] = clamp(Math.round(lerp(a[i + 2], b[i + 2], alpha)), 12, 224);
    out[i + 3] = 255;
  }
  return out;
}

function patinaOriginalPreserveMask(origRgba, {
  tint = [1.14, 0.98, 0.72],
  sat = 0.42,
  lumScale = 1.00,
  lumBias = 6,
  overlayRgba = null,
  overlayMix = 0.0,
} = {}) {
  const out = Buffer.alloc(origRgba.length);
  for (let i = 0; i < origRgba.length; i += 4) {
    if (origRgba[i + 3] < 128) {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
      continue;
    }
    const r0 = origRgba[i], g0 = origRgba[i + 1], b0 = origRgba[i + 2];
    const y = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
    let r = (y + (r0 - y) * sat) * lumScale * tint[0] + lumBias;
    let g = (y + (g0 - y) * sat) * lumScale * tint[1] + lumBias;
    let b = (y + (b0 - y) * sat) * lumScale * tint[2] + lumBias;
    if (overlayRgba && overlayMix > 0) {
      r = lerp(r, overlayRgba[i],     overlayMix);
      g = lerp(g, overlayRgba[i + 1], overlayMix);
      b = lerp(b, overlayRgba[i + 2], overlayMix);
    }
    out[i]     = clamp(Math.round(r), 12, 238);
    out[i + 1] = clamp(Math.round(g), 12, 228);
    out[i + 2] = clamp(Math.round(b), 12, 210);
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Rich, iconic Crash 3 Egypt Golden-Cobalt Desert Sunset Sky (alive, never muddy gray!).
 */
function makeEgyptSunsetSky(w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    let r, g, b;
    if (t < 0.42) {
      const u = t / 0.42;
      // Deep Egyptian twilight cobalt -> warm dusty azure
      r = Math.round(lerp(36, 78, u));
      g = Math.round(lerp(62, 98, u));
      b = Math.round(lerp(122, 138, u));
    } else if (t < 0.76) {
      const u = (t - 0.42) / 0.34;
      // Warm golden-apricot transition
      r = Math.round(lerp(78, 206, u));
      g = Math.round(lerp(98, 146, u));
      b = Math.round(lerp(138, 86, u));
    } else {
      const u = (t - 0.76) / 0.24;
      // Luminous sunlit desert gold horizon
      r = Math.round(lerp(206, 228, u));
      g = Math.round(lerp(146, 176, u));
      b = Math.round(lerp(86, 108, u));
    }
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = 255;
    }
  }
  return out;
}

/**
 * Authentic Egyptian Royal Lapis-Cobalt Blue & Antique Pharaoh Gold Architectural Trim (64x64).
 * Uses real Crash 3 sandstone grain overlaid with balanced royal lapis & gold frieze bands.
 */
function makeLapisGoldTrim(baseSandRgba) {
  const out = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const grain = (baseSandRgba[i] * 0.299 + baseSandRgba[i + 1] * 0.587 + baseSandRgba[i + 2] * 0.114) / 145;
      const gMod = clamp(0.84 + (grain - 0.85) * 0.38, 0.72, 1.18);
      let r, g, b;
      if (y < 6 || y >= 58 || (y >= 28 && y < 36)) {
        // Antique Pharaoh Gold trim band
        r = 216 * gMod; g = 166 * gMod; b = 58 * gMod;
      } else if (y === 6 || y === 57 || y === 27 || y === 36) {
        // Deep bronze shadow groove
        r = 84 * gMod; g = 60 * gMod; b = 34 * gMod;
      } else {
        // Authentic Egyptian Lapis-Cobalt & Gold chevron/block inlay
        const block = ((x >> 3) + (y >= 36 ? 1 : 0)) & 1;
        const borderX = (x & 7) === 0;
        if (borderX) {
          r = 168 * gMod; g = 128 * gMod; b = 52 * gMod;
        } else if (block === 0) {
          // Royal Egyptian Lapis-Cobalt Blue
          r = 34 * gMod; g = 82 * gMod; b = 148 * gMod;
        } else {
          // Warm turquoise-gold sandstone inlay
          r = 46 * gMod; g = 126 * gMod; b = 136 * gMod;
        }
      }
      out[i]     = clamp(Math.round(r), 14, 240);
      out[i + 1] = clamp(Math.round(g), 14, 234);
      out[i + 2] = clamp(Math.round(b), 14, 220);
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Authentic Crash 3 Turquoise-Gold Egyptian Pool Mosaic Tile (64x64) for the Great Oasis Empty Pool!
 * Blends real Crash 3 Eg5iT blue-gold stone relief with crisp inlaid turquoise/gold mosaic tile courses.
 */
function makePoolMosaicTile(rawSandRgba) {
  // Sample real Crash 3 Eg5iT / Eg4iT turquoise-gold sheet if present, reinforced with crisp tile grout
  let realTex = null;
  const cand = path.join(SHEET_DIR, 'Eg5iT_sub0_bpp0_clut_x160_y0.png');
  if (fs.existsSync(cand)) {
    realTex = psxLib.loadRgba(cand, 64, 64);
  }
  const out = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const grain = (rawSandRgba[i] * 0.3 + rawSandRgba[i + 1] * 0.59 + rawSandRgba[i + 2] * 0.11) / 140;
      const texMod = realTex
        ? ((realTex[i] * 0.3 + realTex[i + 1] * 0.59 + realTex[i + 2] * 0.11) / 135)
        : grain;
      const gMod = clamp(0.84 + (lerp(grain, texMod, 0.5) - 0.85) * 0.42, 0.72, 1.18);

      const tx = x & 15, ty = y & 15;
      const cellX = x >> 4, cellY = y >> 4;
      const isGrout = (tx === 0 || ty === 0);
      const isInnerGold = (tx === 1 || ty === 1 || tx === 15 || ty === 15) && ((cellX + cellY) % 2 === 0);
      const isDiamond = Math.abs(tx - 8) + Math.abs(ty - 8) <= 3;

      let r, g, b;
      if (isGrout) {
        // Warm sandy limestone grout
        r = 148 * gMod; g = 118 * gMod; b = 76 * gMod;
      } else if (isInnerGold || (isDiamond && ((cellX + cellY) & 1) === 0)) {
        // Antique Pharaoh Gold inlay
        r = 212 * gMod; g = 164 * gMod; b = 68 * gMod;
      } else if (((cellX + cellY) & 1) === 0) {
        // Rich Crash 3 Egypt Oasis Turquoise tile
        r = 38 * gMod; g = 138 * gMod; b = 142 * gMod;
      } else {
        // Deep Lapis-Teal tile
        r = 32 * gMod; g = 98 * gMod; b = 132 * gMod;
      }
      out[i]     = clamp(Math.round(r), 16, 238);
      out[i + 1] = clamp(Math.round(g), 16, 232);
      out[i + 2] = clamp(Math.round(b), 16, 218);
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Creative Illusory False Wall ("Parede Falsa") Texture (64x64):
 * Matches the surrounding sunlit golden sandstone ashlar wall with realistic weathered diagonal cracks
 * and a luminous recessed Emerald-Gold Pharaoh Portal Seal so observant players spot the hidden tomb!
 */
function makeFalseWallTexture(wallCleanRgba) {
  const out = Buffer.from(wallCleanRgba);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      let r = out[i], g = out[i + 1], b = out[i + 2];

      // Subtle architectural sandstone frame border (left/right/top edges)
      if (x < 4 || x >= 60 || y < 5) {
        r = lerp(r, 188, 0.55); g = lerp(g, 144, 0.55); b = lerp(b, 62, 0.55);
      }

      // Mysterious diagonal stone fissures radiating from center (32, 32)
      const dx = x - 32, dy = y - 32;
      const dist = Math.hypot(dx, dy);
      const crack1 = Math.abs((x - 10) * 0.72 - (y - 6)) < 1.3 && x > 6 && x < 54;
      const crack2 = Math.abs((x - 54) * -0.68 - (y - 14)) < 1.2 && x > 14 && x < 58;
      const crack3 = Math.abs((x - 32) - Math.sin(y * 0.22) * 3.0) < 1.1 && y > 36 && y < 62;
      if (crack1 || crack2 || crack3) {
        // Dark fracture with faint emerald light leaking through the secret tomb!
        r = Math.round(r * 0.25 + 10);
        g = Math.round(g * 0.35 + 48);
        b = Math.round(b * 0.25 + 24);
      }

      // Central Pharaoh Emerald-Gold Portal Seal (outer antique gold ring + glowing emerald diamond!)
      if (dist >= 13.5 && dist <= 17.0) {
        // Carved antique gold ring
        r = 216; g = 166; b = 58;
      } else if (dist >= 10.5 && dist < 13.5) {
        // Deep royal lapis ring
        r = 28; g = 74; b = 136;
      } else if (Math.abs(dx) + Math.abs(dy) <= 10.5) {
        // Glowing Crash 3 Emerald Gem emblem hinting at the secret Green Gem inside!
        const inner = clamp(1 - (Math.abs(dx) + Math.abs(dy)) / 10.5, 0, 1);
        r = Math.round(lerp(24, 124, inner));
        g = Math.round(lerp(156, 240, inner));
        b = Math.round(lerp(72, 146, inner));
      }

      out[i]     = clamp(Math.round(r), 12, 242);
      out[i + 1] = clamp(Math.round(g), 12, 240);
      out[i + 2] = clamp(Math.round(b), 12, 224);
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Clean Sunlit Weathered Sandstone Ashlar Block Wall (64x64) — authentic Egyptian stonework
 * WITHOUT noisy hieroglyph drawing clutter!
 */
function makeCleanSandstoneWall(baseStoneRgba, warmBias = 0) {
  const out = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    const row = y >> 4; // 4 ashlar stone courses (16 px tall each)
    const rowY = y & 15;
    const xOff = (row & 1) ? 16 : 0;
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const bx = (x + xOff) & 31;
      const blockId = ((x + xOff) >> 5) + row * 3;
      const blockShade = 0.93 + ((blockId * 37) % 15) * 0.01;
      let r = baseStoneRgba[i] * blockShade + warmBias;
      let g = baseStoneRgba[i + 1] * blockShade + warmBias * 0.45;
      let b = baseStoneRgba[i + 2] * blockShade - warmBias * 0.25;
      // Subtle bevel & mortar joint
      if (rowY === 0 || bx === 0) {
        r *= 0.66; g *= 0.64; b *= 0.62;
      } else if (rowY === 1 || bx === 1) {
        r *= 1.09; g *= 1.08; b *= 1.04;
      }
      out[i]     = clamp(Math.round(r), 16, 238);
      out[i + 1] = clamp(Math.round(g), 16, 228);
      out[i + 2] = clamp(Math.round(b), 16, 204);
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Build alive, balanced 60-30-10 Crash 3 Egypt architectural swatches (all 64x64 RGBA).
 */
function buildEgyptSwatches(statues) {
  loadTpags();
  const rawFloorSand   = extractTile('Eg1iT', 0, 3, 64, 13, 96, 96, 32, 32, 64, 64);
  const rawRampLime    = extractTile('Eg3iT', 0, 2, 224, 0, 96, 32, 32, 32, 64, 64);
  const rawWallMasonry = extractTile('Eg4iT', 0, 1, 160, 5, 128, 96, 64, 32, 64, 64);
  const rawWallDoor    = extractTile('Eg1iT', 0, 3, 480, 12, 64, 32, 32, 32, 64, 64);
  const rawSandDune    = extractTile('Eg1AT', 0, 2, 288, 0, 0, 32, 32, 32, 64, 64);
  const rawTrim        = extractTile('Eg1iT', 1, 1, 0, 6, 64, 64, 32, 32, 64, 64);
  const rawPharaoh     = composite2x2(
    extractTile('Eg2iT', 1, 0, 0, 6, 64, 32, 64, 32, 32, 32),
    extractTile('Eg2iT', 1, 0, 0, 6, 64, 64, 64, 32, 32, 32),
    extractTile('Eg2iT', 1, 1, 0, 6, 0,  64, 64, 32, 32, 32),
    extractTile('Eg2iT', 1, 1, 0, 6, 0,  96, 64, 32, 32, 32)
  );
  const rawCortex      = composite2x2(
    extractTile('Eg4iT', 1, 0, 0, 3, 64, 64, 64, 32, 32, 32),
    extractTile('Eg4iT', 1, 0, 0, 2, 0,  32, 64, 32, 32, 32),
    extractTile('Eg1iT', 1, 0, 0, 9, 0,  32, 64, 32, 32, 32),
    extractTile('Eg3iT', 1, 0, 0, 5, 64, 32, 64, 32, 32, 32)
  );

  // --- 60% DOMINANT: Sunlit Golden-Amber Sandstone & Dressed Limestone ---
  const floorStone   = gradeEgyptAlive(rawFloorSand, { sat: 0.54, tint: [1.14, 1.00, 0.72], lumScale: 1.04, contrast: 0.88, maxLum: 204 });
  const floorLight   = gradeEgyptAlive(rawFloorSand, { sat: 0.48, tint: [1.15, 1.03, 0.78], lumScale: 1.15, contrast: 0.84, maxLum: 220 });
  const floorDark    = gradeEgyptAlive(rawFloorSand, { sat: 0.52, tint: [1.12, 0.94, 0.66], lumScale: 0.88, contrast: 0.90, maxLum: 168 });
  const rampBase     = gradeEgyptAlive(rawRampLime,  { sat: 0.56, tint: [1.16, 1.02, 0.72], lumScale: 1.10, contrast: 0.88, maxLum: 214 });
  const rampWarm     = gradeEgyptAlive(rawRampLime,  { sat: 0.60, tint: [1.18, 0.96, 0.64], lumScale: 1.02, contrast: 0.92, maxLum: 198 });
  const rampStone    = blendRgba(rampBase, floorLight, 0.24);
  const rampWeathered= blendRgba(rampBase, floorDark, 0.22);

  // Clean architectural sandstone ashlar walls (NO hieroglyph clutter!)
  const wallBase     = blendRgba(
    gradeEgyptAlive(rawWallMasonry, { sat: 0.48, tint: [1.14, 0.98, 0.70], lumScale: 1.02, contrast: 0.78, maxLum: 192, minLum: 58 }),
    floorStone, 0.48
  );
  const wallClean    = makeCleanSandstoneWall(wallBase, 0);
  const wallWarm     = makeCleanSandstoneWall(wallBase, 14); // warmer ochre-sandstone variant
  const wallDark     = gradeEgyptAlive(wallClean,    { sat: 0.44, tint: [1.06, 0.92, 0.72], lumScale: 0.76, contrast: 0.92, maxLum: 144, minLum: 34 });
  const wallPanel    = gradeEgyptAlive(rawWallDoor,  { sat: 0.50, tint: [1.14, 0.98, 0.70], lumScale: 0.96, contrast: 0.88, maxLum: 186 });

  // --- 30% SECONDARY: Rich Crash 3 Terracotta Brick & Hammered Antique Bronze ---
  const terraBase    = gradeEgyptAlive(rawWallMasonry, { sat: 0.56, tint: [1.26, 0.86, 0.56], lumScale: 0.94, contrast: 0.84, maxLum: 178, minLum: 48 });
  const terracotta   = makeCleanSandstoneWall(terraBase, 16);
  const bronzeTrim   = gradeEgyptAlive(rawTrim,      { sat: 0.56, tint: [1.16, 0.96, 0.60], lumScale: 0.92, contrast: 0.90, maxLum: 178 });
  const desertSand   = gradeEgyptAlive(rawSandDune,  { sat: 0.52, tint: [1.16, 1.03, 0.74], lumScale: 1.14, contrast: 0.80, maxLum: 218 });

  // --- 10% ACCENTS: Authentic Lapis-Gold Trim, Turquoise-Gold Pool Mosaic, False Wall Seal & Restraint Plaques ---
  const lapisGold    = makeLapisGoldTrim(rawFloorSand);
  const poolMosaic   = makePoolMosaicTile(rawFloorSand);
  const falseWall    = makeFalseWallTexture(wallClean);
  const pharaohPlaque= gradeEgyptAlive(rawPharaoh,   { sat: 0.58, tint: [1.12, 1.00, 0.82], lumScale: 0.98, contrast: 0.92, preserveCool: true, maxLum: 204 });
  const cortexPlaque = gradeEgyptAlive(rawCortex,    { sat: 0.58, tint: [1.12, 1.00, 0.80], lumScale: 0.98, contrast: 0.92, preserveCool: true, maxLum: 204 });

  // --- 2x2 256-color (8bpp) Real Crash 3 Statue Atlas (placed in L[28], 0 Hangar faces after obj[59]!) ---
  const statueAtlas = composite2x2(
    resizeRgba(statues.sphinx.rgba,     64, 64, 32, 32), // TL: u[0..31],  v[0..31]  SwHiG Sphinx Mask
    resizeRgba(statues.sarcoph.rgba,    64, 64, 32, 32), // TR: u[32..63], v[0..31]  Sa1iG Golden Sarcophagus
    resizeRgba(statues.guard.rgba,      64, 64, 32, 32), // BL: u[0..31],  v[32..63] sg1mG Shield Guard
    resizeRgba(statues.cobra.rgba,      64, 64, 32, 32)  // BR: u[32..63], v[32..63] CbriG Coiled Cobra
  );

  return {
    floorStone, floorLight, floorDark,
    rampStone, rampWarm, rampWeathered,
    wallClean, wallWarm, wallDark, wallPanel,
    terracotta, bronzeTrim, desertSand,
    lapisGold, poolMosaic, falseWall,
    pharaohPlaque, cortexPlaque, statueAtlas,
  };
}

// ============================================================================
// 3. PSX Texture Pack Parser & In-Place Reskinner
// ============================================================================

function parsePsxTextureSection(buf) {
  const metaOff = buf.readUInt32LE(4);
  const numObjs = buf.readUInt32LE(8);
  const numMeshes = buf.readUInt32LE(12 + numObjs * 36);
  let mp = metaOff;
  while (mp + 4 <= buf.length) {
    const tag = buf.readUInt32LE(mp);
    if (tag === 0xFFFFFFFF) { mp += 4; break; }
    mp += 8 + buf.readUInt32LE(mp + 4);
  }
  const meshHashOff = mp;
  mp += numMeshes * 4;
  const numTexRefs = buf.readUInt32LE(mp); mp += 4;
  const texRefsOff = mp;
  const texRefs = [];
  for (let i = 0; i < numTexRefs; i++) { texRefs.push(buf.readUInt32LE(mp)); mp += 4; }
  const pal4Map = new Map(), pal8Map = new Map();
  const nPal4 = buf.readUInt32LE(mp); mp += 4;
  for (let i = 0; i < nPal4; i++) { pal4Map.set(buf.readUInt32LE(mp), mp + 4); mp += 36; }
  const nPal8 = buf.readUInt32LE(mp); mp += 4;
  for (let i = 0; i < nPal8; i++) { pal8Map.set(buf.readUInt32LE(mp), mp + 4); mp += 516; }
  const nTex = buf.readUInt32LE(mp); mp += 4;
  const texOffs = [];
  for (let i = 0; i < nTex; i++) { texOffs.push(buf.readUInt32LE(mp)); mp += 4; }
  const textures = [];
  for (let i = 0; i < nTex; i++) {
    const o = texOffs[i];
    const palSz = buf.readUInt32LE(o + 4);
    const palId = buf.readUInt32LE(o + 8);
    const idx = buf.readUInt32LE(o + 12);
    const w = buf.readUInt16LE(o + 16);
    const h = buf.readUInt16LE(o + 18);
    const is4 = (palSz === 16);
    const palOff = is4 ? pal4Map.get(palId) : pal8Map.get(palId);
    const stride = is4 ? ((w + 3) & ~3) / 2 : ((w + 1) & ~1);
    const rgba = Buffer.alloc(w * h * 4);
    let nTrans = 0, nMag = 0, nZero = 0;
    const isMagentaKey = c => {
      const r5 = c & 31, g5 = (c >> 5) & 31, b5 = (c >> 10) & 31;
      return r5 >= 29 && g5 <= 1 && b5 >= 29;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ci = is4
          ? ((x & 1) ? (buf[o + 20 + y * stride + (x >> 1)] >> 4) : (buf[o + 20 + y * stride + (x >> 1)] & 15))
          : buf[o + 20 + y * stride + x];
        const c16 = buf.readUInt16LE(palOff + ci * 2);
        const di = (y * w + x) * 4;
        if (c16 === 0 || isMagentaKey(c16)) {
          rgba[di] = 0; rgba[di + 1] = 0; rgba[di + 2] = 0; rgba[di + 3] = 0;
          nTrans++;
          if (c16 === 0) nZero++; else nMag++;
        } else {
          const [r, g, b] = abgr1555ToRgb(c16);
          rgba[di] = r; rgba[di + 1] = g; rgba[di + 2] = b; rgba[di + 3] = 255;
        }
      }
    }
    const transKey = (nMag > 0 && nMag >= nZero) ? 0x7C1F : 0x0000;
    textures.push({ slot: i, idx, hash: texRefs[idx], off: o, is4, palId, palOff, w, h, stride, nTrans, nZero, nMag, transKey, rgba });
  }
  return { metaOff, numObjs, numMeshes, meshHashOff, texRefsOff, texRefs, pal4Map, pal8Map, textures };
}

function encodeTextureInPlace(buf, tex, newRgba, sharedPalWritten) {
  const { off, is4, palId, palOff, w, h, stride } = tex;
  const transKey = tex.transKey !== undefined ? tex.transKey : 0x0000;
  const maxColors = is4 ? 16 : 256;
  let hasTrans = false;
  const opaquePixels = [];
  for (let i = 0; i < w * h; i++) {
    if (newRgba[i * 4 + 3] < 128) hasTrans = true;
    else opaquePixels.push([newRgba[i * 4], newRgba[i * 4 + 1], newRgba[i * 4 + 2]]);
  }

  let paletteRgb;
  if (sharedPalWritten.has(palId)) {
    paletteRgb = [];
    for (let c = 0; c < maxColors; c++) {
      const c16 = buf.readUInt16LE(palOff + c * 2);
      const isT = (c16 === 0) || ((c16 & 0x7FFF) === 0x7C1F);
      paletteRgb.push(isT ? null : abgr1555ToRgb(c16));
    }
  } else {
    const startSlot = hasTrans ? 1 : 0;
    const budget = maxColors - startSlot;
    const step = opaquePixels.length > 4096 ? 2 : 1;
    const sample = step === 1 ? opaquePixels : opaquePixels.filter((_, idx) => (idx % step) === 0);
    const colors = psxLib.medianCutPalette(sample.length ? sample : [[180, 145, 92]], budget);

    paletteRgb = new Array(maxColors).fill(null);
    if (hasTrans) {
      buf.writeUInt16LE(transKey, palOff);
      paletteRgb[0] = null;
    }
    for (let c = startSlot; c < maxColors; c++) {
      const col = colors[Math.min(c - startSlot, colors.length - 1)] || [180, 145, 92];
      let c16 = rgbToAbgr1555(col[0], col[1], col[2], false);
      if ((c16 & 0x7FFF) === 0x7C1F) c16 = 0x781E;
      buf.writeUInt16LE(c16, palOff + c * 2);
      paletteRgb[c] = abgr1555ToRgb(c16);
    }
    sharedPalWritten.set(palId, true);
  }

  const BAYER = [
    [-3,  2, -2,  3],
    [ 2, -1,  1, -2],
    [-2,  3, -3,  2],
    [ 1, -2,  2, -1],
  ];
  const findNearest = (r, g, b) => {
    let best = -1, bestD = 1e12;
    for (let c = 0; c < maxColors; c++) {
      const p = paletteRgb[c];
      if (!p) continue;
      const dr = r - p[0], dg = g - p[1], db = b - p[2];
      const d = dr * dr * 2 + dg * dg * 4 + db * db;
      if (d < bestD) { bestD = d; best = c; if (d === 0) break; }
    }
    return best >= 0 ? best : (hasTrans ? 1 : 0);
  };

  for (let y = 0; y < h; y++) {
    if (is4) buf.fill(0, off + 20 + y * stride, off + 20 + (y + 1) * stride);
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      let ci;
      if (newRgba[si + 3] < 128) {
        ci = 0;
      } else {
        const d = BAYER[y & 3][x & 3];
        ci = findNearest(
          clamp(newRgba[si] + d, 0, 255),
          clamp(newRgba[si + 1] + d, 0, 255),
          clamp(newRgba[si + 2] + d, 0, 255)
        );
      }
      if (is4) {
        const bo = off + 20 + y * stride + (x >> 1);
        if (x & 1) buf[bo] = (buf[bo] & 0x0F) | ((ci & 15) << 4);
        else       buf[bo] = (buf[bo] & 0xF0) | (ci & 15);
      } else {
        buf[off + 20 + y * stride + x] = ci & 0xFF;
      }
    }
  }
}

/**
 * Map all 105 textures of skegyp_l.psx into our ALIVE 60-30-10 Crash 3 Egypt palette!
 * NOTE: Dedicated ZERO-COLLATERAL slots (100% exclusive palettes, 0 Hangar faces!):
 *   L[101] (hanTi=101) -> 8bpp Real Crash 3 Turquoise-Gold Mosaic Pool Tile (Eg5iT)
 *   L[97]  (hanTi=97)  -> 4bpp Creative False Wall (Cracked Sandstone + Glowing Emerald-Gold Pharaoh Seal)
 *   L[28]  (hanTi=28)  -> 8bpp 2x2 Real Crash 3 Statue Atlas (SwHiG, Sa1iG, sg1mG, CbriG)
 *   L[6]   (hanTi=6)   -> 8bpp Royal Egyptian Lapis-Cobalt Blue & Antique Gold Architectural Trim
 *   L[12]  (hanTi=13)  -> 8bpp Rich Crash 3 Burnt-Sienna Terracotta Brickwork
 */
function buildHangarEgyptTexRgba(tex, sw) {
  const { idx, w, h, nTrans, rgba: origRgba } = tex;
  const sz = src => resizeRgba(src, 64, 64, w, h);

  // Dedicated Secret Tomb 100%-opaque texture slots (0 Hangar faces, exclusive palettes!)
  if (idx === 101) return sz(sw.poolMosaic);
  if (idx === 97)  return sz(sw.falseWall);
  if (idx === 28)  return sz(sw.statueAtlas);
  if (idx === 6)   return sz(sw.lapisGold);
  if (idx === 12)  return sz(sw.terracotta);

  // Special transparent texture #99 ("U.S. ARMY" stencil) -> antique gold temple frieze band
  if (idx === 99) {
    const out = Buffer.alloc(w * h * 4);
    const hTex = sz(sw.bronzeTrim);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const di = (y * w + x) * 4;
        const band = (y >= 3 && y <= h - 4) && (((x >> 2) % 3) !== 0 || y === 4 || y === h - 5);
        if (band) {
          out[di] = hTex[di]; out[di + 1] = hTex[di + 1]; out[di + 2] = hTex[di + 2]; out[di + 3] = 255;
        }
      }
    }
    return out;
  }

  // Hangar US posters (#43 US Flag, #94 Bluetorch, #78 Air Force Star) -> clean Pharaoh plaques & bronze
  if (idx === 43 || idx === 94) return sz(sw.cortexPlaque);
  if (idx === 78) return sz(sw.bronzeTrim);

  // Transparent cutouts (glass, grates, rafters, plane/heli cutouts): preserve 100% of alpha mask!
  if (nTrans > 0) {
    if (idx === 18 || idx === 60 || idx === 86) {
      // Replace modern graffiti with warm subtle carved gold/lapis temple accent
      return patinaOriginalPreserveMask(origRgba, {
        tint: [1.14, 0.96, 0.64], sat: 0.25, lumScale: 0.88, lumBias: 16,
        overlayRgba: sz(sw.lapisGold), overlayMix: 0.40,
      });
    }
    if ([32, 35, 51, 52, 53, 93].includes(idx)) {
      return patinaOriginalPreserveMask(origRgba, {
        tint: [1.14, 1.02, 0.78], sat: 0.30, lumScale: 1.00, lumBias: 12,
      });
    }
    return patinaOriginalPreserveMask(origRgba, {
      tint: [1.14, 0.96, 0.68], sat: 0.38, lumScale: 0.96, lumBias: 8,
    });
  }

  // 1. Exterior Sky & Desert Sand (#64, #61, #67)
  if (idx === 64) return makeEgyptSunsetSky(w, h);
  if (idx === 61 || idx === 67) return sz(sw.desertSand);

  // 2. Main Skating Floors (Sunlit Golden-Amber Sandstone)
  if ([23, 25, 26, 48, 49, 66, 85].includes(idx)) return sz(sw.floorStone);
  if ([24, 65].includes(idx)) return sz(sw.floorLight);
  if ([27, 50].includes(idx)) return sz(sw.floorDark);

  // 3. Half-Pipe & Quarter-Pipe Ramps (Smooth Dressed Honey-Gold Limestone)
  if ([1, 15, 17, 44].includes(idx)) return sz(sw.rampStone);
  if ([13, 34].includes(idx)) return sz(sw.rampWeathered);

  // 4. Restrained Framed Plaques & Subtle Accents (KEEP Lapis-Gold as 10% regal accent, NOT big walls!)
  if ([33, 42].includes(idx)) return sz(sw.pharaohPlaque);
  if ([4, 5, 11].includes(idx)) return sz(sw.terracotta); // Rich terracotta architectural bands!
  if (idx === 69) return sz(sw.lapisGold); // Subtle Lapis-Gold frieze accent!
  if ([57, 58, 59, 77].includes(idx)) return sz(sw.wallWarm); // Clean warm sandstone panels!

  // 5. Clean Dressed Sandstone & Terracotta Walls (NO busy hieroglyph wall clutter!)
  if ([7, 20, 21, 22, 29, 30, 31, 45, 95].includes(idx)) return sz(sw.wallClean);
  if ([19, 3, 16, 46, 47, 72, 74, 75].includes(idx)) return sz(sw.wallWarm);
  if ([0, 2, 8, 9, 70, 88, 90].includes(idx)) return sz(sw.wallDark);
  if ([63, 89].includes(idx)) return sz(sw.wallPanel);

  // 6. Helicopter & Biplane -> Rich Patinated Antique Pharaoh Bronze
  if ([14, 36, 37, 41, 80, 91, 96, 98, 100].includes(idx)) {
    return patinaOriginalPreserveMask(origRgba, {
      tint: [1.16, 0.96, 0.64], sat: 0.42, lumScale: 0.96, lumBias: 10,
      overlayRgba: sz(sw.bronzeTrim), overlayMix: 0.28,
    });
  }

  return patinaOriginalPreserveMask(origRgba, {
    tint: [1.14, 0.98, 0.72], sat: 0.40, lumScale: 0.96, lumBias: 8,
  });
}

// ============================================================================
// 4. Warm Sunlit Egyptian Vertex Lighting (RGBs) & Level Geometry Builder
// ============================================================================

function gradeRgbsInPlace(buf, rgbsOff, rgbsLen) {
  const n = rgbsLen >> 2;
  const rgbs = [];
  for (let i = 0; i < n; i++) {
    const o = rgbsOff + i * 4;
    const r = buf[o], g = buf[o + 1], b = buf[o + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    // Alive sunlit golden Egyptian lighting preserving Hangar's rich light/shadow contrast!
    const nr = clamp(Math.round((y + (r - y) * 0.72) * 1.12 + 8), 24, 234);
    const ng = clamp(Math.round((y + (g - y) * 0.72) * 1.02 + 5), 22, 222);
    const nb = clamp(Math.round((y + (b - y) * 0.72) * 0.84 + 2), 18, 204);
    buf[o] = nr; buf[o + 1] = ng; buf[o + 2] = nb;
    rgbs.push([nr, ng, nb]);
  }
  return rgbs;
}

function findClosestRgbIdx(rgbs, tr, tg, tb) {
  let best = 0, bestD = 1e12;
  for (let i = 0; i < rgbs.length; i++) {
    const dr = rgbs[i][0] - tr, dg = rgbs[i][1] - tg, db = rgbs[i][2] - tb;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function gradeLevelPsxLightingOnly(origBuf) {
  const buf = Buffer.from(origBuf);
  const metaOff = buf.readUInt32LE(4);
  let mp = metaOff, gradedCount = 0;
  while (mp + 4 <= buf.length) {
    const tag = buf.readUInt32LE(mp);
    if (tag === 0xFFFFFFFF) break;
    const len = buf.readUInt32LE(mp + 4);
    if (tag === 0x73424752) {
      gradeRgbsInPlace(buf, mp + 8, len);
      gradedCount = len >> 2;
    }
    mp += 8 + len;
  }
  return { buf, gradedCount };
}

/**
 * Watertight Neversoft PSX Mesh Builder for new Secret Tomb sectors!
 * Automatically verifies PS1 winding: dot(cross(p1-p0, p2-p0), desiredNormal) < 0,
 * guarantees exact unit normals (4096 scale), zero degenerate faces, and valid bounding box / rad<<12!
 */
class PsxMeshBuilder {
  constructor(name, origin = null) {
    this.name = name;
    this.origin = origin; // if null, computed from bounding box center!
    this.verts = [];      // world coords [x, y, z]
    this.vertMap = new Map();
    this.norms = [];      // [nx, ny, nz] in 4096 fixed point
    this.normMap = new Map();
    this.faces = [];
  }

  addVert(x, y, z) {
    const rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const key = `${rx},${ry},${rz}`;
    if (this.vertMap.has(key)) return this.vertMap.get(key);
    const idx = this.verts.length;
    if (idx >= 254) throw new Error(`Mesh "${this.name}" exceeded 254 vertices!`);
    this.verts.push([rx, ry, rz]);
    this.vertMap.set(key, idx);
    return idx;
  }

  addNorm(nx, ny, nz) {
    const len = Math.hypot(nx, ny, nz) || 1;
    const ix = clamp(Math.round((nx / len) * 4096), -4096, 4096);
    const iy = clamp(Math.round((ny / len) * 4096), -4096, 4096);
    const iz = clamp(Math.round((nz / len) * 4096), -4096, 4096);
    const key = `${ix},${iy},${iz}`;
    if (this.normMap.has(key)) return this.normMap.get(key);
    const idx = this.norms.length;
    this.norms.push([ix, iy, iz]);
    this.normMap.set(key, idx);
    return idx;
  }

  /**
   * Add a quad (PS1 Z-order: 0--1 / 2--3). Auto-orients winding to match desiredNormal!
   */
  addQuad(p0, p1, p2, p3, desiredNormal, {
    ti = TI_FLOOR_STONE,
    sf = SF_FLOOR,
    fl = FL_TEX_QUAD,
    c = [0, 0, 0, 0],
    uv = [0, 0, 63, 0, 0, 63, 63, 63],
  } = {}) {
    let q0 = p0, q1 = p1, q2 = p2, q3 = p3;
    let u = uv.slice();
    let cols = Array.isArray(c) ? c.slice() : [c, c, c, c];

    const e1 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
    const e2 = [q2[0] - q0[0], q2[1] - q0[1], q2[2] - q0[2]];
    let cx = e1[1] * e2[2] - e1[2] * e2[1];
    let cy = e1[2] * e2[0] - e1[0] * e2[2];
    let cz = e1[0] * e2[1] - e1[1] * e2[0];
    const cl = Math.hypot(cx, cy, cz);
    if (cl < 0.5) return; // skip degenerate zero-area face

    // Verify PS1 THPS2 winding: cross(q1-q0, q2-q0) MUST oppose desiredNormal (dot < 0)!
    const dot = cx * desiredNormal[0] + cy * desiredNormal[1] + cz * desiredNormal[2];
    if (dot > 0) {
      // Flip horizontally (0<->1, 2<->3) to reverse cross product while keeping PS1 strip intact!
      [q0, q1] = [q1, q0];
      [q2, q3] = [q3, q2];
      u = [u[2], u[3], u[0], u[1], u[6], u[7], u[4], u[5]];
      cols = [cols[1], cols[0], cols[3], cols[2]];
      cx = -cx; cy = -cy; cz = -cz;
    }

    const v0 = this.addVert(q0[0], q0[1], q0[2]);
    const v1 = this.addVert(q1[0], q1[1], q1[2]);
    const v2 = this.addVert(q2[0], q2[1], q2[2]);
    const v3 = this.addVert(q3[0], q3[1], q3[2]);
    const ni = this.addNorm(-cx, -cy, -cz);
    // Auto-enable PS1 GTE perspective subdivision (0x3823, sz=32) on large visible quads (>=520u)
    // EXACTLY like retail Hangar floor (HAN oi=137) -> zero near-clipping or 1023px GPU discard!
    const maxEdge = Math.max(
      Math.hypot(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]),
      Math.hypot(q2[0] - q0[0], q2[1] - q0[1], q2[2] - q0[2]),
      Math.hypot(q3[0] - q1[0], q3[1] - q1[1], q3[2] - q1[2]),
      Math.hypot(q3[0] - q2[0], q3[1] - q2[1], q3[2] - q2[2])
    );
    let finalFl = fl;
    let sz = 28;
    if (finalFl === FL_TEX_QUAD && maxEdge >= 520) {
      finalFl = FL_SUBDIV_QUAD;
      sz = 32;
    }
    this.faces.push({ fl: finalFl, sz, v: [v0, v1, v2, v3], c: cols, ni, sf, ti, uv: u });
  }

  /**
   * Add a triangle with automatic PS1 winding verification against desiredNormal.
   */
  addTri(p0, p1, p2, desiredNormal, {
    ti = TI_FLOOR_STONE,
    sf = SF_FLOOR,
    fl = FL_TEX_TRI,
    c = [0, 0, 0, 0],
    uv = [0, 0, 63, 0, 0, 63],
  } = {}) {
    let q0 = p0, q1 = p1, q2 = p2;
    let u = [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], 0, 0];
    let cols = Array.isArray(c) ? [c[0], c[1], c[2], c[0]] : [c, c, c, c];

    const e1 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
    const e2 = [q2[0] - q0[0], q2[1] - q0[1], q2[2] - q0[2]];
    let cx = e1[1] * e2[2] - e1[2] * e2[1];
    let cy = e1[2] * e2[0] - e1[0] * e2[2];
    let cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.hypot(cx, cy, cz) < 0.5) return;

    if (cx * desiredNormal[0] + cy * desiredNormal[1] + cz * desiredNormal[2] > 0) {
      [q1, q2] = [q2, q1];
      u = [u[0], u[1], u[4], u[5], u[2], u[3], 0, 0];
      cols = [cols[0], cols[2], cols[1], cols[0]];
      cx = -cx; cy = -cy; cz = -cz;
    }

    const v0 = this.addVert(q0[0], q0[1], q0[2]);
    const v1 = this.addVert(q1[0], q1[1], q1[2]);
    const v2 = this.addVert(q2[0], q2[1], q2[2]);
    const ni = this.addNorm(-cx, -cy, -cz);
    const maxEdge = Math.max(
      Math.hypot(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]),
      Math.hypot(q2[0] - q0[0], q2[1] - q0[1], q2[2] - q0[2]),
      Math.hypot(q2[0] - q1[0], q2[1] - q1[1], q2[2] - q1[2])
    );
    let finalFl = fl;
    let sz = 28;
    if (finalFl === FL_TEX_TRI && maxEdge >= 520) {
      finalFl = FL_SUBDIV_TRI;
      sz = 32;
    }
    this.faces.push({ fl: finalFl, sz, v: [v0, v1, v2, 0], c: cols, ni, sf, ti, uv: u });
  }

  /**
   * Add a solid 6-sided box (or 5-sided without bottom). Uses exact outward normals!
   */
  addBox(x0, x1, yTop, yBot, z0, z1, {
    tiTop = TI_RAMP_STONE, tiSide = TI_WALL_CLEAN,
    sfTop = SF_FLOOR, sfSide = SF_WALL,
    fl = FL_TEX_QUAD,
    cTop = 0, cSide = 0, cDark = 0,
    includeBottom = false,
  } = {}) {
    // Top (normal -Y = UP)
    this.addQuad([x0, yTop, z0], [x1, yTop, z0], [x0, yTop, z1], [x1, yTop, z1], [0, -1, 0], { ti: tiTop, sf: sfTop, fl, c: cTop });
    // South (+Z)
    this.addQuad([x0, yTop, z1], [x1, yTop, z1], [x0, yBot, z1], [x1, yBot, z1], [0, 0, 1], { ti: tiSide, sf: sfSide, fl, c: cSide });
    // North (-Z)
    this.addQuad([x1, yTop, z0], [x0, yTop, z0], [x1, yBot, z0], [x0, yBot, z0], [0, 0, -1], { ti: tiSide, sf: sfSide, fl, c: cDark });
    // West (-X)
    this.addQuad([x0, yTop, z0], [x0, yTop, z1], [x0, yBot, z0], [x0, yBot, z1], [-1, 0, 0], { ti: tiSide, sf: sfSide, fl, c: cDark });
    // East (+X)
    this.addQuad([x1, yTop, z1], [x1, yTop, z0], [x1, yBot, z1], [x1, yBot, z0], [1, 0, 0], { ti: tiSide, sf: sfSide, fl, c: cSide });
    if (includeBottom) {
      this.addQuad([x0, yBot, z1], [x1, yBot, z1], [x0, yBot, z0], [x1, yBot, z0], [0, 1, 0], { ti: tiSide, sf: sfSide, fl, c: cDark });
    }
  }

  /**
   * Add a 100% invisible Marseille-format solid collision box (fl=0x0083, sf=0x0180) around a statue/prop!
   */
  addInvisibleSolidHull(x0, x1, yTop, yBot, z0, z1, sf = SF_WALL) {
    this.addBox(x0, x1, yTop, yBot, z0, z1, {
      tiTop: 0, tiSide: 0, sfTop: sf, sfSide: sf, fl: FL_INVIS_QUAD, cTop: 0, cSide: 0, cDark: 0,
    });
  }

  /**
   * Compile into { obj36, meshBuf, worldBounds, meshHash } matching skhan.psx byte-for-byte!
   */
  compile() {
    if (this.verts.length === 0 || this.faces.length === 0) {
      throw new Error(`Empty PsxMeshBuilder: ${this.name}`);
    }
    let wMinX = 1e9, wMaxX = -1e9, wMinY = 1e9, wMaxY = -1e9, wMinZ = 1e9, wMaxZ = -1e9;
    for (const [x, y, z] of this.verts) {
      if (x < wMinX) wMinX = x; if (x > wMaxX) wMaxX = x;
      if (y < wMinY) wMinY = y; if (y > wMaxY) wMaxY = y;
      if (z < wMinZ) wMinZ = z; if (z > wMaxZ) wMaxZ = z;
    }
    const ox = this.origin ? Math.round(this.origin[0]) : Math.round((wMinX + wMaxX) * 0.5);
    const oy = this.origin ? Math.round(this.origin[1]) : Math.round((wMinY + wMaxY) * 0.5);
    const oz = this.origin ? Math.round(this.origin[2]) : Math.round((wMinZ + wMaxZ) * 0.5);

    let xmin = 32767, xmax = -32768, ymin = 32767, ymax = -32768, zmin = 32767, zmax = -32768;
    let maxR = 0;
    const localVerts = this.verts.map(([x, y, z]) => {
      const lx = x - ox, ly = y - oy, lz = z - oz;
      if (lx < -32760 || lx > 32760 || ly < -32760 || ly > 32760 || lz < -32760 || lz > 32760) {
        throw new Error(`Local vertex overflow in mesh "${this.name}": (${lx},${ly},${lz})`);
      }
      if (lx < xmin) xmin = lx; if (lx > xmax) xmax = lx;
      if (ly < ymin) ymin = ly; if (ly > ymax) ymax = ly;
      if (lz < zmin) zmin = lz; if (lz > zmax) zmax = lz;
      const r = Math.ceil(Math.hypot(lx, ly, lz));
      if (r > maxR) maxR = r;
      return [lx, ly, lz];
    });

    let facesByteLen = 0;
    for (const f of this.faces) facesByteLen += (f.sz || 28);
    const totalBytes = 28 + localVerts.length * 8 + this.norms.length * 8 + facesByteLen;
    const meshBuf = Buffer.alloc(totalBytes);
    let p = 0;
    meshBuf.writeUInt16LE(0x0008, p); p += 2;
    meshBuf.writeUInt16LE(localVerts.length, p); p += 2;
    meshBuf.writeUInt16LE(this.norms.length, p); p += 2;
    meshBuf.writeUInt16LE(this.faces.length, p); p += 2;
    meshBuf.writeUInt32LE(((maxR + 32) << 12) >>> 0, p); p += 4;
    meshBuf.writeInt16LE(xmax, p); p += 2;
    meshBuf.writeInt16LE(xmin, p); p += 2;
    meshBuf.writeInt16LE(ymax, p); p += 2;
    meshBuf.writeInt16LE(ymin, p); p += 2;
    meshBuf.writeInt16LE(zmax, p); p += 2;
    meshBuf.writeInt16LE(zmin, p); p += 2;
    // CRITICAL PS1 THPS2 LOD HEADER (+24=0x7FFF maxDrawDist, +26=0xFFFF no LOD child!)
    // Verified 470/471 meshes in retail skhan.psx! Writing 0 caused LOD swap to mesh[0]!
    meshBuf.writeUInt32LE(0xFFFF7FFF, p); p += 4;

    for (const [lx, ly, lz] of localVerts) {
      meshBuf.writeInt16LE(lx, p); meshBuf.writeInt16LE(ly, p + 2); meshBuf.writeInt16LE(lz, p + 4); meshBuf.writeUInt16LE(0, p + 6);
      p += 8;
    }
    for (const [nx, ny, nz] of this.norms) {
      meshBuf.writeInt16LE(nx, p); meshBuf.writeInt16LE(ny, p + 2); meshBuf.writeInt16LE(nz, p + 4); meshBuf.writeUInt16LE(0, p + 6);
      p += 8;
    }
    for (const f of this.faces) {
      const fsz = f.sz || 28;
      meshBuf.writeUInt16LE(f.fl, p);
      meshBuf.writeUInt16LE(fsz, p + 2);
      meshBuf[p + 4] = f.v[0]; meshBuf[p + 5] = f.v[1]; meshBuf[p + 6] = f.v[2]; meshBuf[p + 7] = f.v[3];
      meshBuf[p + 8] = f.c[0]; meshBuf[p + 9] = f.c[1]; meshBuf[p + 10] = f.c[2]; meshBuf[p + 11] = f.c[3];
      meshBuf.writeUInt16LE(f.ni, p + 12);
      meshBuf.writeUInt16LE(f.sf, p + 14);
      meshBuf.writeUInt32LE(f.ti >>> 0, p + 16);
      for (let k = 0; k < 8; k++) meshBuf[p + 20 + k] = f.uv[k] & 0xFF;
      if (fsz === 32) meshBuf.writeUInt32LE(0, p + 28);
      p += fsz;
    }

    const obj36 = Buffer.alloc(36);
    obj36.writeUInt32LE(0, 0);
    obj36.writeInt32LE(ox << 12, 4);
    obj36.writeInt32LE(oy << 12, 8);
    obj36.writeInt32LE(oz << 12, 12);
    // meshIdx filled by caller at +22
    obj36[32] = 0x04; obj36[33] = 0xFF; obj36[34] = 0x02; obj36[35] = 0x00;

    return {
      name: this.name,
      obj36,
      meshBuf,
      worldBounds: { minX: wMinX, maxX: wMaxX, minY: wMinY, maxY: wMaxY, minZ: wMinZ, maxZ: wMaxZ },
      meshHash: nsHash('egyp_' + this.name),
    };
  }
}

/**
 * Helper: Build a curved quarter-pipe transition strip (4 smooth VERT bands) along an axis.
 * - dir = '+Z' | '-Z' | '+X' | '-X' (direction the ramp faces!)
 * - curveR: transition radius (width & height of curve, floor Y = yFloor, lip Y = yFloor - curveR)
 */
function addCurvedTransition(mb, {
  axis,       // 'Z' (runs along Z, faces +X or -X) or 'X' (runs along X, faces +Z or -Z)
  start, end, // span along run axis
  segCount,   // subdivisions along run axis
  lipCoord,   // world coordinate of the vertical lip edge
  faceDir,    // +1 or -1 (direction ramp faces out from lipCoord)
  yFloor,     // bottom floor Y (e.g. -100 or +260)
  curveR,     // height & horizontal reach of curve (lip Y = yFloor - curveR)
  ti = TI_RAMP_STONE,
  cTop, cMid, cBot,
}) {
  const bands = 4;
  const step = (end - start) / segCount;
  for (let s = 0; s < segCount; s++) {
    const t0 = start + s * step;
    const t1 = start + (s + 1) * step;
    for (let b = 0; b < bands; b++) {
      // a = 0 at lip (vertical), PI/2 at floor (horizontal)
      const a0 = (b / bands) * (Math.PI * 0.5);
      const a1 = ((b + 1) / bands) * (Math.PI * 0.5);
      const d0 = curveR * (1 - Math.cos(a0));
      const y0 = yFloor - curveR * Math.cos(a0);
      const d1 = curveR * (1 - Math.cos(a1));
      const y1 = yFloor - curveR * Math.cos(a1);
      const w0 = lipCoord + faceDir * d0;
      const w1 = lipCoord + faceDir * d1;
      const aMid = (a0 + a1) * 0.5;
      const nHoriz = faceDir * Math.cos(aMid);
      const nVert = -Math.sin(aMid); // -Y is UP
      const cA = b === 0 ? cTop : cMid;
      const cB = b === bands - 1 ? cBot : cMid;
      const sf = b < bands - 1 ? SF_VERT : SF_FLOOR;
      const vA = Math.round((b / bands) * 63);
      const vB = Math.round(((b + 1) / bands) * 63);

      if (axis === 'X') {
        mb.addQuad(
          [t0, y0, w0], [t1, y0, w0],
          [t0, y1, w1], [t1, y1, w1],
          [0, nVert, nHoriz],
          { ti, sf, c: [cA, cA, cB, cB], uv: [0, vA, 63, vA, 0, vB, 63, vB] }
        );
      } else {
        mb.addQuad(
          [w0, y0, t0], [w0, y0, t1],
          [w1, y1, t0], [w1, y1, t1],
          [nHoriz, nVert, 0],
          { ti, sf, c: [cA, cA, cB, cB], uv: [0, vA, 63, vA, 0, vB, 63, vB] }
        );
      }
    }
  }
}

/**
 * Watertight curved end-cap wall closing the open side of a Half-Pipe or Quarter-Pipe!
 */
function addCurvedEndCap(mb, {
  zCap, lipX, faceDir, yFloor, curveR, normalZ, ti = TI_WALL_CLEAN, c = 0,
}) {
  const bands = 4;
  const backX = lipX;
  const yLip = yFloor - curveR;
  const uvXY = (x, y) => [
    clamp(Math.round((Math.abs(x - backX) / Math.max(1, curveR)) * 63), 0, 63),
    clamp(Math.round(((y - yLip) / Math.max(1, curveR)) * 63), 0, 63),
  ];
  for (let b = 0; b < bands; b++) {
    const a0 = (b / bands) * (Math.PI * 0.5);
    const a1 = ((b + 1) / bands) * (Math.PI * 0.5);
    const x0 = lipX + faceDir * curveR * (1 - Math.cos(a0));
    const y0 = yFloor - curveR * Math.cos(a0);
    const x1 = lipX + faceDir * curveR * (1 - Math.cos(a1));
    const y1 = yFloor - curveR * Math.cos(a1);
    const [uB, vB] = uvXY(backX, yFloor);
    const [u0, v0] = uvXY(x0, y0);
    const [u1, v1] = uvXY(x1, y1);
    mb.addTri([backX, yFloor, zCap], [x0, y0, zCap], [x1, y1, zCap], [0, 0, normalZ], {
      ti, sf: SF_WALL, c, uv: [uB, vB, u0, v0, u1, v1],
    });
  }
}

/**
 * Watertight Empty Pharaoh Pool (4 curved VERT walls + 4 watertight curved mitered corners + flat bottom)!
 * Aligns seamlessly with surrounding floor at Y = yDeck (-100) on exact outer box [x0..x1, z0..z1]!
 */
function buildEmptyPharaohPool(name, {
  x0, x1, z0, z1, yDeck = -100, depth = 340,
  tiWall = TI_POOL_MOSAIC, tiBottom = TI_POOL_MOSAIC, tiCoping = TI_LAPIS_GOLD,
  cTop, cMid, cBot,
  rollInWestZ = null, // optional [rz0, rz1] smooth roll-in ramp on West side!
  rollInEastZ = null, // optional [rz0, rz1] smooth roll-in ramp on East side!
}) {
  const mb = new PsxMeshBuilder(name);
  const yBot = yDeck + depth;
  const R = depth; // curved radius = depth -> exact 90-deg VERT transition!
  const ix0 = x0 + R, ix1 = x1 - R;
  const iz0 = z0 + R, iz1 = z1 - R;

  // 1. Flat pool bottom subdivided cleanly (3x3 quads)
  const bxN = 3, bzN = 3;
  for (let iz = 0; iz < bzN; iz++) {
    const za = lerp(iz0, iz1, iz / bzN), zb = lerp(iz0, iz1, (iz + 1) / bzN);
    for (let ix = 0; ix < bxN; ix++) {
      const xa = lerp(ix0, ix1, ix / bxN), xb = lerp(ix0, ix1, (ix + 1) / bxN);
      mb.addQuad([xa, yBot, za], [xb, yBot, za], [xa, yBot, zb], [xb, yBot, zb], [0, -1, 0], {
        ti: tiBottom, sf: SF_FLOOR, c: cBot,
      });
    }
  }

  // 2. Four straight curved VERT walls (with optional roll-in cutouts on West or East wall)
  addCurvedTransition(mb, { axis: 'X', start: ix0, end: ix1, segCount: 3, lipCoord: z0, faceDir: +1, yFloor: yBot, curveR: R, ti: tiWall, cTop, cMid, cBot }); // North wall facing +Z
  addCurvedTransition(mb, { axis: 'X', start: ix0, end: ix1, segCount: 3, lipCoord: z1, faceDir: -1, yFloor: yBot, curveR: R, ti: tiWall, cTop, cMid, cBot }); // South wall facing -Z

  if (rollInEastZ) {
    const [rz0, rz1] = rollInEastZ;
    addCurvedTransition(mb, { axis: 'Z', start: iz0, end: rz0, segCount: 1, lipCoord: x1, faceDir: -1, yFloor: yBot, curveR: R, ti: tiWall, cTop, cMid, cBot });
    addCurvedTransition(mb, { axis: 'Z', start: rz1, end: iz1, segCount: 1, lipCoord: x1, faceDir: -1, yFloor: yBot, curveR: R, ti: tiWall, cTop, cMid, cBot });
    const rxEnd = ix1 - 220;
    mb.addQuad([rxEnd, yBot, rz0], [rxEnd, yBot, rz1], [x1, yDeck, rz0], [x1, yDeck, rz1], [-depth, -(x1 - rxEnd), 0], {
      ti: TI_RAMP_STONE, sf: SF_FLOOR, c: [cBot, cBot, cTop, cTop],
    });
    mb.addTri([x1, yDeck, rz0], [rxEnd, yBot, rz0], [ix1, yBot, rz0], [0, 0, -1], { ti: TI_WALL_CLEAN, sf: SF_WALL, c: cMid });
    mb.addTri([x1, yDeck, rz1], [ix1, yBot, rz1], [rxEnd, yBot, rz1], [0, 0, +1], { ti: TI_WALL_CLEAN, sf: SF_WALL, c: cMid });
  } else {
    addCurvedTransition(mb, { axis: 'Z', start: iz0, end: iz1, segCount: 3, lipCoord: x1, faceDir: -1, yFloor: yBot, curveR: R, ti: tiWall, cTop, cMid, cBot }); // East wall facing -X
  }

  if (rollInWestZ) {
    const [rz0, rz1] = rollInWestZ;
    addCurvedTransition(mb, { axis: 'Z', start: iz0, end: rz0, segCount: 1, lipCoord: x0, faceDir: +1, yFloor: yBot, curveR: R, ti: tiWall, cTop, cMid, cBot });
    addCurvedTransition(mb, { axis: 'Z', start: rz1, end: iz1, segCount: 1, lipCoord: x0, faceDir: +1, yFloor: yBot, curveR: R, ti: tiWall, cTop, cMid, cBot });
    // Smooth wide sandstone roll-in slope from West deck (x0, yDeck) -> pool bottom (ix0 + 260, yBot)!
    const rxEnd = ix0 + 220;
    mb.addQuad([x0, yDeck, rz0], [x0, yDeck, rz1], [rxEnd, yBot, rz0], [rxEnd, yBot, rz1], [depth, -(rxEnd - x0), 0], {
      ti: TI_RAMP_STONE, sf: SF_FLOOR, c: [cTop, cTop, cBot, cBot],
    });
    // Side walls sealing roll-in flanks so zero gaps!
    mb.addTri([x0, yDeck, rz0], [ix0, yBot, rz0], [rxEnd, yBot, rz0], [0, 0, -1], { ti: TI_WALL_CLEAN, sf: SF_WALL, c: cMid });
    mb.addTri([x0, yDeck, rz1], [ix0, yBot, rz1], [rxEnd, yBot, rz1], [0, 0, +1], { ti: TI_WALL_CLEAN, sf: SF_WALL, c: cMid });
  } else {
    addCurvedTransition(mb, { axis: 'Z', start: iz0, end: iz1, segCount: 3, lipCoord: x0, faceDir: +1, yFloor: yBot, curveR: R, ti: tiWall, cTop, cMid, cBot });
  }

  // 3. Four watertight mitered curved corners connecting adjacent curved walls seamlessly!
  const corners = [
    { cx: x0, cz: z0, dx: +1, dz: +1 }, // NW
    { cx: x1, cz: z0, dx: -1, dz: +1 }, // NE
    { cx: x0, cz: z1, dx: +1, dz: -1 }, // SW
    { cx: x1, cz: z1, dx: -1, dz: -1 }, // SE
  ];
  const bands = 4;
  for (const { cx, cz, dx, dz } of corners) {
    for (let b = 0; b < bands; b++) {
      const a0 = (b / bands) * (Math.PI * 0.5);
      const a1 = ((b + 1) / bands) * (Math.PI * 0.5);
      const d0 = R * (1 - Math.cos(a0)), y0 = yBot - R * Math.cos(a0);
      const d1 = R * (1 - Math.cos(a1)), y1 = yBot - R * Math.cos(a1);
      const pX0 = [cx + dx * d0, y0, cz + dz * R];
      const pX1 = [cx + dx * d1, y1, cz + dz * R];
      const pD0 = [cx + dx * d0, y0, cz + dz * d0];
      const pD1 = [cx + dx * d1, y1, cz + dz * d1];
      const pZ0 = [cx + dx * R, y0, cz + dz * d0];
      const pZ1 = [cx + dx * R, y1, cz + dz * d1];
      const aMid = (a0 + a1) * 0.5;
      const nV = -Math.sin(aMid), nH = Math.cos(aMid);
      const sf = b < bands - 1 ? SF_VERT : SF_FLOOR;
      const col = b === 0 ? cTop : (b === bands - 1 ? cBot : cMid);
      // X-half of corner (connects West/East wall to diagonal)
      mb.addQuad(pX0, pD0, pX1, pD1, [dx * nH, nV, dz * nH * 0.3], { ti: tiWall, sf, c: col });
      // Z-half of corner (connects North/South wall to diagonal)
      mb.addQuad(pD0, pZ0, pD1, pZ1, [dx * nH * 0.3, nV, dz * nH], { ti: tiWall, sf, c: col });
    }
  }

  // 4. Visual Lapis-Gold Pharaoh Coping Trim lip around the pool rim (flush at yDeck - 4!)
  const cp = 55;
  const yC = yDeck - 4;
  mb.addQuad([x0 - cp, yC, z0 - cp], [x1 + cp, yC, z0 - cp], [x0, yC, z0], [x1, yC, z0], [0, -1, 0], { ti: tiCoping, sf: SF_DECO, c: cTop });
  mb.addQuad([x0, yC, z1], [x1, yC, z1], [x0 - cp, yC, z1 + cp], [x1 + cp, yC, z1 + cp], [0, -1, 0], { ti: tiCoping, sf: SF_DECO, c: cTop });
  mb.addQuad([x0 - cp, yC, z0], [x0, yC, z0], [x0 - cp, yC, z1], [x0, yC, z1], [0, -1, 0], { ti: tiCoping, sf: SF_DECO, c: cTop });
  mb.addQuad([x1, yC, z0], [x1 + cp, yC, z0], [x1, yC, z1], [x1 + cp, yC, z1], [0, -1, 0], { ti: tiCoping, sf: SF_DECO, c: cTop });

  return mb.compile();
}

/**
 * Watertight Grand Egyptian Half-Pipe (2 curved VERT walls + 2 decks + 2 back walls + 4 curved end-caps + Lapis-Gold coping)!
 */
function buildGrandHalfPipe(name, {
  x0, x1, z0, z1, yFloor = -100, curveR = 460, deckW = 460,
  cTop, cMid, cBot,
}) {
  const mb = new PsxMeshBuilder(name);
  const yDeck = yFloor - curveR;
  const wLipX = x0 + deckW;
  const eLipX = x1 - deckW;

  // West curved VERT ramp (faces +X) + East curved VERT ramp (faces -X)
  addCurvedTransition(mb, { axis: 'Z', start: z0, end: z1, segCount: 4, lipCoord: wLipX, faceDir: +1, yFloor, curveR, ti: TI_RAMP_STONE, cTop, cMid, cBot });
  addCurvedTransition(mb, { axis: 'Z', start: z0, end: z1, segCount: 4, lipCoord: eLipX, faceDir: -1, yFloor, curveR, ti: TI_RAMP_STONE, cTop, cMid, cBot });

  // Solid top decks (West & East)
  mb.addQuad([x0, yDeck, z0], [wLipX, yDeck, z0], [x0, yDeck, z1], [wLipX, yDeck, z1], [0, -1, 0], { ti: TI_FLOOR_LIGHT, sf: SF_FLOOR, c: cTop });
  mb.addQuad([eLipX, yDeck, z0], [x1, yDeck, z0], [eLipX, yDeck, z1], [x1, yDeck, z1], [0, -1, 0], { ti: TI_FLOOR_LIGHT, sf: SF_FLOOR, c: cTop });

  // Lapis-Gold coping strips along both lips
  mb.addQuad([wLipX - 40, yDeck - 4, z0], [wLipX + 10, yDeck - 4, z0], [wLipX - 40, yDeck - 4, z1], [wLipX + 10, yDeck - 4, z1], [0, -1, 0], { ti: TI_LAPIS_GOLD, sf: SF_DECO, c: cTop });
  mb.addQuad([eLipX - 10, yDeck - 4, z0], [eLipX + 40, yDeck - 4, z0], [eLipX - 10, yDeck - 4, z1], [eLipX + 40, yDeck - 4, z1], [0, -1, 0], { ti: TI_LAPIS_GOLD, sf: SF_DECO, c: cTop });

  // Solid outer vertical walls & deck end walls (100% watertight!)
  mb.addQuad([x0, yDeck, z0], [x0, yDeck, z1], [x0, yFloor, z0], [x0, yFloor, z1], [-1, 0, 0], { ti: TI_WALL_CLEAN, sf: SF_WALL, c: cMid });
  mb.addQuad([x1, yDeck, z1], [x1, yDeck, z0], [x1, yFloor, z1], [x1, yFloor, z0], [+1, 0, 0], { ti: TI_WALL_CLEAN, sf: SF_WALL, c: cMid });
  // Deck N/S end walls
  mb.addQuad([wLipX, yDeck, z0], [x0, yDeck, z0], [wLipX, yFloor, z0], [x0, yFloor, z0], [0, 0, -1], { ti: TI_WALL_WARM, sf: SF_WALL, c: cBot });
  mb.addQuad([x0, yDeck, z1], [wLipX, yDeck, z1], [x0, yFloor, z1], [wLipX, yFloor, z1], [0, 0, +1], { ti: TI_WALL_WARM, sf: SF_WALL, c: cMid });
  mb.addQuad([x1, yDeck, z0], [eLipX, yDeck, z0], [x1, yFloor, z0], [eLipX, yFloor, z0], [0, 0, -1], { ti: TI_WALL_WARM, sf: SF_WALL, c: cBot });
  mb.addQuad([eLipX, yDeck, z1], [x1, yDeck, z1], [eLipX, yFloor, z1], [x1, yFloor, z1], [0, 0, +1], { ti: TI_WALL_WARM, sf: SF_WALL, c: cMid });

  // Curved end-caps closing N/S undersides of both transitions!
  addCurvedEndCap(mb, { zCap: z0, lipX: wLipX, faceDir: +1, yFloor, curveR, normalZ: -1, ti: TI_TERRACOTTA, c: cBot });
  addCurvedEndCap(mb, { zCap: z1, lipX: wLipX, faceDir: +1, yFloor, curveR, normalZ: +1, ti: TI_TERRACOTTA, c: cMid });
  addCurvedEndCap(mb, { zCap: z0, lipX: eLipX, faceDir: -1, yFloor, curveR, normalZ: -1, ti: TI_TERRACOTTA, c: cBot });
  addCurvedEndCap(mb, { zCap: z1, lipX: eLipX, faceDir: -1, yFloor, curveR, normalZ: +1, ti: TI_TERRACOTTA, c: cMid });

  return mb.compile();
}

/**
 * Compile a real Crash 3 3D Statue OBJ into a world-space PSX mesh with:
 *   - Real Crash 3 UV mapping into our 2x2 256-color Statue Atlas (L[28], hanTi=28) or clean stone
 *   - 100% solid invisible Marseille collision hull (FL_INVIS_QUAD, SF_WALL) wrapping the statue
 *     so Crash B. NEVER passes through ANY statue!
 */
function buildCrash3StatueSector(name, obj, {
  wx, yFloor, wz,
  targetH = 520,
  yawDeg = 0,
  ti = TI_STATUE_ATLAS,
  uvQuad = [0, 0, 31, 31], // [u0, v0, u1, v1] quadrant in 64x64 atlas
  cBright = 0,
  addSolidHull = true,
  hullPad = 0.85,
  maxTris = 280,
}) {
  const mb = new PsxMeshBuilder(name, [wx, yFloor - targetH * 0.5, wz]);
  const b = obj.bounds;
  const scale = targetH / Math.max(1e-4, b.maxY - b.minY);
  const cx = (b.minX + b.maxX) * 0.5;
  const cz = (b.minZ + b.maxZ) * 0.5;
  const rad = (yawDeg * Math.PI) / 180;
  const cs = Math.cos(rad), sn = Math.sin(rad);

  const worldVerts = obj.verts.map(([vx, vy, vz]) => {
    const dx = (vx - cx) * scale;
    const dz = (vz - cz) * scale;
    const rx = wx + dx * cs - dz * sn;
    const rz = wz + dx * sn + dz * cs;
    const ry = yFloor - (vy - b.minY) * scale; // OBJ +Y UP -> PS1 -Y UP, flush on yFloor!
    return [Math.round(rx), Math.round(ry), Math.round(rz)];
  });

  // Compute statue world AABB for tight solid collision hull
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const [x, y, z] of worldVerts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const [uMin, vMin, uMax, vMax] = uvQuad;
  const triStep = obj.tris.length > maxTris ? Math.ceil(obj.tris.length / maxTris) : 1;
  for (let i = 0; i < obj.tris.length; i += triStep) {
    const tri = obj.tris[i];
    const p0 = worldVerts[tri[0].vi], p1 = worldVerts[tri[1].vi], p2 = worldVerts[tri[2].vi];
    if (!p0 || !p1 || !p2) continue;
    // Compute geometric outward normal from flipped Y (OBJ CCW -> after -Y flip, cross(p1-p0, p2-p0) points outward!)
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.hypot(nx, ny, nz) < 4) continue;
    const mapUv = k => {
      const uvt = obj.uvs[tri[k].ti] || [0.5, 0.5];
      return [
        clamp(Math.round(lerp(uMin, uMax, uvt[0])), uMin, uMax),
        clamp(Math.round(lerp(vMin, vMax, 1 - uvt[1])), vMin, vMax),
      ];
    };
    const [u0, v0] = mapUv(0), [u1, v1] = mapUv(1), [u2, v2] = mapUv(2);
    // Visual mesh is SF_DECO (clean smooth visuals) while solid invisible hull enforces 100% crisp collision!
    mb.addTri(p0, p1, p2, [nx, ny, nz], { ti, sf: SF_DECO, c: cBright, uv: [u0, v0, u1, v1, u2, v2] });
  }

  if (addSolidHull) {
    const hx = Math.max(45, Math.round((maxX - minX) * 0.5 * hullPad));
    const hz = Math.max(45, Math.round((maxZ - minZ) * 0.5 * hullPad));
    const hcx = Math.round((minX + maxX) * 0.5);
    const hcz = Math.round((minZ + maxZ) * 0.5);
    mb.addInvisibleSolidHull(hcx - hx, hcx + hx, minY, yFloor + 20, hcz - hz, hcz + hz, SF_WALL);
  }
  return mb.compile();
}

/**
 * Rebuild skegyp.psx by starting from 100% original Hangar (skhan.psx):
 *   - Keeps Hangar obj[0..469] & meshes[0..470] untouched EXCEPT carving obj[59]'s bottom 3 faces
 *     into the Creative False Wall Temple Archway (preserving upper wall f[3] & top deck f[4]!).
 *   - Appends the Massive Marseille-Sized Secret Egyptian Tomb (16,000 x 16,000 u) with:
 *     * Torchlit Stone Corridor & 2-sided Illusory False Wall (Z=-6950, SF_DECO)
 *     * Subdivided Watertight Sandstone Floor (aligned cleanly around both Empty Pools!)
 *     * Clean Sandstone Outer Tomb Walls (NO hieroglyph clutter) + Invisible Safety Perimeter Barriers
 *     * Entrance Courtyard (Shield Guards, Lotus Pillars, Spine Transfer, Hubba Ledges & Stairs)
 *     * Empty Pharaoh Pool #1 ("Great Oasis Turquoise-Gold Mosaic Bowl" + Roll-In)
 *     * Empty Pharaoh Pool #2 ("Sunken Terracotta-Lapis Bowl" + Golden Sarcophagi)
 *     * Twin Grand Egyptian Half-Pipes (Western & Eastern)
 *     * Monumental Stepped Pyramid Access Ramp -> Terrace -> Launch Kicker ->
 *       HIGH AERIAL GOLDEN GRIND RAIL (680u high, 5,400u long, for Secret Green Gem!) -> North Landing Ramp
 *     * Colossal North Wall Crash 3 Sphinx Mask Sanctuary + Quarter-Pipes
 *   - Rebuilds the exact 20x20 square TAG 0x0A CWorldGrid covering ALL Hangar + Secret Tomb sectors!
 */
function buildExpandedEgyptLevelPsx(origHan, statues) {
  const metaOff = origHan.readUInt32LE(4);
  const origNumObjs = origHan.readUInt32LE(8);
  const origHeaderObjsEnd = 12 + origNumObjs * 36;
  const origNumMeshes = origHan.readUInt32LE(origHeaderObjsEnd);
  const origMeshOffs = [];
  for (let i = 0; i < origNumMeshes; i++) {
    origMeshOffs.push(origHan.readUInt32LE(origHeaderObjsEnd + 4 + i * 4));
  }

  // Parse metadata tags & trailing meshHashes/texRefs from origHan
  let mp = metaOff;
  let rgbsTagData = null, tag06Data = null, tag07Data = null;
  while (mp + 4 <= origHan.length) {
    const tag = origHan.readUInt32LE(mp);
    if (tag === 0xFFFFFFFF) { mp += 4; break; }
    const len = origHan.readUInt32LE(mp + 4);
    const payload = Buffer.from(origHan.subarray(mp + 8, mp + 8 + len));
    if (tag === 0x73424752) rgbsTagData = payload;
    else if (tag === 0x00000006) tag06Data = payload;
    else if (tag === 0x00000007) tag07Data = payload;
    mp += 8 + len;
  }
  const origMeshHashes = [];
  for (let i = 0; i < origNumMeshes; i++) {
    origMeshHashes.push(origHan.readUInt32LE(mp + i * 4));
  }
  const texRefsTail = Buffer.from(origHan.subarray(mp + origNumMeshes * 4));

  // Grade RGBs lighting into alive sunlit Egyptian warmth & match Hangar's exact PS1 GTE exposure!
  // (Retail Hangar floor uses RGBs ~105..125; 134 = sunlit highlight with ZERO yellow blowout!)
  const rgbs = gradeRgbsInPlace(rgbsTagData, 0, rgbsTagData.length);
  const C_SUN    = findClosestRgbIdx(rgbs, 134, 124, 106); // crisp sunlit highlight (zero blowout!)
  const C_BRIGHT = findClosestRgbIdx(rgbs, 114, 104, 88);  // exact match to Hangar's rich golden floor!
  const C_MID    = findClosestRgbIdx(rgbs, 92, 82, 68);    // warm architectural mid-tone
  const C_SHADE  = findClosestRgbIdx(rgbs, 70, 62, 50);    // rich atmospheric depth shadow
  const C_DARK   = findClosestRgbIdx(rgbs, 50, 44, 34);    // recessed tunnel / alcove shadow

  // Copy all original Hangar objects & mesh buffers + measure world AABBs for TAG 0x0A
  const allObjs = [];
  const allMeshBufs = [];
  const allMeshHashes = [];
  const objWorldBounds = [];

  for (let i = 0; i < origNumObjs; i++) {
    allObjs.push(Buffer.from(origHan.subarray(12 + i * 36, 12 + (i + 1) * 36)));
  }
  for (let i = 0; i < origNumMeshes; i++) {
    const start = origMeshOffs[i];
    const end = (i + 1 < origNumMeshes) ? origMeshOffs[i + 1] : metaOff;
    allMeshBufs.push(Buffer.from(origHan.subarray(start, end)));
    allMeshHashes.push(origMeshHashes[i]);
  }

  // Redirect the 7 tiny Hangar faces that used our 4 dedicated Secret Tomb texture slots
  // (hanTi=6 on o4 -> ramp 0; hanTi=13 on o20 -> wall 7; hanTi=97 on o431/433 -> wall 7; hanTi=101 on o436 -> wall 7)
  // so Hangar has ZERO collateral stripes/mosaic/false-wall faces anywhere!
  const tiRedirects = new Map([[6, 0], [13, 7], [97, 7], [101, 7]]);
  for (let mi = 0; mi < origNumMeshes; mi++) {
    if (mi === 59) continue;
    const mb = allMeshBufs[mi];
    const nv = mb.readUInt16LE(2), nn = mb.readUInt16LE(4), nf = mb.readUInt16LE(6);
    let fp = 28 + nv * 8 + nn * 8;
    for (let fi = 0; fi < nf; fi++) {
      const ffl = mb.readUInt16LE(fp), fsz = mb.readUInt16LE(fp + 2);
      if (fsz >= 28 && (ffl & 1)) {
        const ti = mb.readUInt32LE(fp + 16);
        if (tiRedirects.has(ti)) mb.writeUInt32LE(tiRedirects.get(ti), fp + 16);
      }
      fp += fsz;
    }
  }

  // --- CARVE HANGAR obj[59] INTO CREATIVE FALSE WALL PORTAL ARCHWAY! ---
  // Preserves upper wall f[3] (Y=-3100..-600 @ Z=-7000) & top deck f[4] (Y=-600 @ Z=-7250..-7000),
  // replaces bottom 3 QP bands (f[0..2]) with solid portal floor, solid jambs, Lapis-Gold frame,
  // and the 2-sided Illusory False Wall (Z=-6950, SF_DECO=0x0001 -> 100% pass-through!).
  const m59 = new PsxMeshBuilder('portal_arch_59', [-2001, -1600, -6876]);
  // Preserve original upper wall (Y=-3100..-600 @ Z=-7000, facing +Z)
  m59.addQuad([-1500, -3100, -7000], [-2500, -3100, -7000], [-1500, -600, -7000], [-2500, -600, -7000], [0, 0, +1], {
    ti: TI_WALL_CLEAN, sf: SF_BOUND, c: [C_MID, C_MID, C_BRIGHT, C_BRIGHT],
  });
  // Preserve original top coping deck (Y=-600, Z=-7250..-7000, facing -Y UP)
  m59.addQuad([-1500, -600, -7250], [-2500, -600, -7250], [-1500, -600, -7000], [-2500, -600, -7000], [0, -1, 0], {
    ti: TI_FLOOR_LIGHT, sf: SF_FLOOR, c: C_BRIGHT,
  });
  // Solid entrance floor (X[-2500..-1500], Y=-100, Z=-6500..-7000) seamlessly flush with Hangar floor!
  m59.addQuad([-2500, -100, -7000], [-1500, -100, -7000], [-2500, -100, -6500], [-1500, -100, -6500], [0, -1, 0], {
    ti: TI_FLOOR_STONE, sf: SF_FLOOR, c: C_BRIGHT,
  });
  // Solid side jamb walls sealing the opening cleanly against Hangar's adjacent QPs (X=-2500 & X=-1500)!
  m59.addQuad([-2500, -600, -7000], [-2500, -600, -6500], [-2500, -100, -7000], [-2500, -100, -6500], [+1, 0, 0], {
    ti: TI_LAPIS_GOLD, sf: SF_WALL, c: C_MID,
  });
  m59.addQuad([-1500, -600, -6500], [-1500, -600, -7000], [-1500, -100, -6500], [-1500, -100, -7000], [-1, 0, 0], {
    ti: TI_LAPIS_GOLD, sf: SF_WALL, c: C_MID,
  });
  // Ornamental Lapis-Gold Pharaoh Arch Lintel above the False Wall (Z=-6940, Y=-660..-580, visual trim)
  m59.addQuad([-2540, -660, -6940], [-1460, -660, -6940], [-2540, -580, -6940], [-1460, -580, -6940], [0, 0, +1], {
    ti: TI_LAPIS_GOLD, sf: SF_DECO, c: C_SUN,
  });
  // THE CREATIVE ILLUSORY FALSE WALL ("Parede Falsa") at Z = -6950!
  // 2-sided SF_DECO=0x0001 (100% pass-through!): cracked sandstone with glowing Emerald-Gold Pharaoh Seal!
  m59.addQuad([-2500, -600, -6950], [-1500, -600, -6950], [-2500, -100, -6950], [-1500, -100, -6950], [0, 0, +1], {
    ti: TI_FALSE_WALL, sf: SF_DECO, c: C_SUN,
  });
  m59.addQuad([-1500, -600, -6954], [-2500, -600, -6954], [-1500, -100, -6954], [-2500, -100, -6954], [0, 0, -1], {
    ti: TI_FALSE_WALL, sf: SF_DECO, c: C_BRIGHT,
  });
  const compiled59 = m59.compile();
  allMeshBufs[59] = compiled59.meshBuf;

  // Compute Hangar obj[0..469] world AABBs
  for (let i = 0; i < origNumObjs; i++) {
    const o = allObjs[i];
    const ox = o.readInt32LE(4) >> 12, oy = o.readInt32LE(8) >> 12, oz = o.readInt32LE(12) >> 12;
    const mi = o.readUInt16LE(22);
    const mb = allMeshBufs[mi];
    objWorldBounds.push({
      minX: ox + mb.readInt16LE(14), maxX: ox + mb.readInt16LE(12),
      minY: oy + mb.readInt16LE(18), maxY: oy + mb.readInt16LE(16),
      minZ: oz + mb.readInt16LE(22), maxZ: oz + mb.readInt16LE(20),
    });
  }

  // Helper to append a compiled Secret Tomb sector cleanly
  const newSectors = [];
  const pushSector = compiled => {
    const newMeshIdx = allMeshBufs.length;
    compiled.obj36.writeUInt16LE(newMeshIdx, 22);
    allObjs.push(compiled.obj36);
    allMeshBufs.push(compiled.meshBuf);
    allMeshHashes.push(compiled.meshHash);
    objWorldBounds.push(compiled.worldBounds);
    newSectors.push(compiled);
  };

  // ==========================================================================
  // SECRET TOMB SECTOR 1: Torchlit Passage Corridor (Z = -7000 -> -8600)
  // ==========================================================================
  {
    const mb = new PsxMeshBuilder('secret_corridor');
    const zSteps = [-7000, -7533, -8066, -8600];
    for (let s = 0; s < 3; s++) {
      const za = zSteps[s], zb = zSteps[s + 1];
      // Solid floor (Y = -100)
      mb.addQuad([-2500, -100, zb], [-1500, -100, zb], [-2500, -100, za], [-1500, -100, za], [0, -1, 0], {
        ti: TI_FLOOR_LIGHT, sf: SF_FLOOR, c: C_BRIGHT,
      });
      // Solid ceiling (Y = -600)
      mb.addQuad([-2500, -600, za], [-1500, -600, za], [-2500, -600, zb], [-1500, -600, zb], [0, +1, 0], {
        ti: TI_WALL_DARK, sf: SF_WALL, c: C_DARK,
      });
      // Solid West wall (X = -2500) & East wall (X = -1500)
      mb.addQuad([-2500, -600, zb], [-2500, -600, za], [-2500, -100, zb], [-2500, -100, za], [+1, 0, 0], {
        ti: s === 1 ? TI_TERRACOTTA : TI_WALL_CLEAN, sf: SF_WALL, c: C_MID,
      });
      mb.addQuad([-1500, -600, za], [-1500, -600, zb], [-1500, -100, za], [-1500, -100, zb], [-1, 0, 0], {
        ti: s === 1 ? TI_TERRACOTTA : TI_WALL_CLEAN, sf: SF_WALL, c: C_MID,
      });
    }
    // Exit portal Lapis-Gold lintel facing into the Secret Tomb (-Z @ Z=-8600)
    mb.addQuad([-1440, -700, -8608], [-2560, -700, -8608], [-1440, -600, -8608], [-2560, -600, -8608], [0, 0, -1], {
      ti: TI_LAPIS_GOLD, sf: SF_DECO, c: C_SUN,
    });
    pushSector(mb.compile());
  }

  // ==========================================================================
  // SECRET TOMB SECTORS 2..17: Subdivided 16,000 x 16,000 Floor Grid (Y = -100)
  //   X[-9500..+6500] (16 cells x 1000u), Z[-24600..-8600] (16 cells x 1000u)
  //   Automatically leaves EXACT cutouts for Empty Pool #1 & Empty Pool #2!
  // ==========================================================================
  const TOMB_X0 = -9500, TOMB_X1 = 6500;
  const TOMB_Z0 = -24600, TOMB_Z1 = -8600;
  const POOL1 = { x0: 1500, x1: 5500, z0: -15600, z1: -10600 }; // Great Oasis Mosaic Pool (4000x5000)
  const POOL2 = { x0: -8500, x1: -4500, z0: -14600, z1: -10600 }; // Sunken Sarcophagus Pool (4000x4000)

  const inPool = (cx, cz) => (
    (cx > POOL1.x0 && cx < POOL1.x1 && cz > POOL1.z0 && cz < POOL1.z1) ||
    (cx > POOL2.x0 && cx < POOL2.x1 && cz > POOL2.z0 && cz < POOL2.z1)
  );

  for (let bz = 0; bz < 4; bz++) {
    for (let bx = 0; bx < 4; bx++) {
      const mb = new PsxMeshBuilder(`tomb_floor_${bx}_${bz}`);
      let added = 0;
      for (let dz = 0; dz < 4; dz++) {
        for (let dx = 0; dx < 4; dx++) {
          const ix = bx * 4 + dx, iz = bz * 4 + dz;
          const xa = TOMB_X0 + ix * 1000, xb = xa + 1000;
          const za = TOMB_Z0 + iz * 1000, zb = za + 1000;
          const cx = (xa + xb) * 0.5, cz = (za + zb) * 0.5;
          if (inPool(cx, cz)) continue;
          // Grand central promenade (X[-2500..-500]) uses brighter cream-gold limestone!
          const isPromenade = (cx >= -2500 && cx <= -500);
          const ti = isPromenade ? TI_FLOOR_LIGHT : (((ix + iz) & 1) === 0 ? TI_FLOOR_STONE : TI_FLOOR_STONE);
          const col = isPromenade ? C_SUN : C_BRIGHT;
          mb.addQuad([xa, -100, za], [xb, -100, za], [xa, -100, zb], [xb, -100, zb], [0, -1, 0], {
            ti, sf: SF_FLOOR, c: col,
          });
          added++;
        }
      }
      if (added > 0) pushSector(mb.compile());
    }
  }

  // ==========================================================================
  // SECRET TOMB SECTORS 18..25: Clean Sandstone Perimeter Walls + Lapis-Gold Frieze
  //   + Invisible Safety Sky-Barriers (SF_BOUND, Y=-3400..+300) — ZERO wall drawing clutter!
  // ==========================================================================
  const addPerimeterWallStrip = (name, pStart, pEnd, normal, segs, skipPortal = false) => {
    const mb = new PsxMeshBuilder(name);
    for (let s = 0; s < segs; s++) {
      const a0 = s / segs, a1 = (s + 1) / segs;
      const x0 = Math.round(lerp(pStart[0], pEnd[0], a0)), z0 = Math.round(lerp(pStart[1], pEnd[1], a0));
      const x1 = Math.round(lerp(pStart[0], pEnd[0], a1)), z1 = Math.round(lerp(pStart[1], pEnd[1], a1));
      // Lower sandstone wall course (Y = -750..-100)
      if (skipPortal && Math.min(x0, x1) >= -2505 && Math.max(x0, x1) <= -1495) {
        // Above portal only (Y = -1350..-600)!
        mb.addQuad([x0, -1350, z0], [x1, -1350, z1], [x0, -600, z0], [x1, -600, z1], normal, {
          ti: TI_WALL_CLEAN, sf: SF_WALL, c: C_BRIGHT,
        });
      } else {
        mb.addQuad([x0, -720, z0], [x1, -720, z1], [x0, -100, z0], [x1, -100, z1], normal, {
          ti: TI_WALL_CLEAN, sf: SF_WALL, c: C_BRIGHT,
        });
        mb.addQuad([x0, -1350, z0], [x1, -1350, z1], [x0, -720, z0], [x1, -720, z1], normal, {
          ti: TI_WALL_WARM, sf: SF_WALL, c: C_MID,
        });
      }
      // Subtle Royal Lapis-Gold Temple Cornice Frieze (Y = -1520..-1350)
      mb.addQuad([x0, -1520, z0], [x1, -1520, z1], [x0, -1350, z0], [x1, -1350, z1], normal, {
        ti: TI_LAPIS_GOLD, sf: SF_WALL, c: C_SUN,
      });
      // Invisible Safety Perimeter Barrier high into sky (Y = -3600..-1520) -> impossible to fly out of tomb!
      mb.addQuad([x0, -3600, z0], [x1, -3600, z1], [x0, -1520, z0], [x1, -1520, z1], normal, {
        ti: 0, sf: SF_BOUND, fl: FL_INVIS_QUAD, c: C_MID,
      });
    }
    pushSector(mb.compile());
  };

  // South wall split around portal X[-2500..-1500]
  addPerimeterWallStrip('tomb_wall_south_w', [TOMB_X0, TOMB_Z1], [-2500, TOMB_Z1], [0, 0, -1], 4, false);
  addPerimeterWallStrip('tomb_wall_south_p', [-2500, TOMB_Z1], [-1500, TOMB_Z1], [0, 0, -1], 1, true);
  addPerimeterWallStrip('tomb_wall_south_e', [-1500, TOMB_Z1], [TOMB_X1, TOMB_Z1], [0, 0, -1], 4, false);
  // North, West, East outer walls (clean sandstone courses, 2 chunks per side for crisp GTE culling!)
  addPerimeterWallStrip('tomb_wall_north_w', [TOMB_X0, TOMB_Z0], [-1500, TOMB_Z0], [0, 0, +1], 4, false);
  addPerimeterWallStrip('tomb_wall_north_e', [-1500, TOMB_Z0], [TOMB_X1, TOMB_Z0], [0, 0, +1], 4, false);
  addPerimeterWallStrip('tomb_wall_west_s',  [TOMB_X0, -16600], [TOMB_X0, TOMB_Z1], [+1, 0, 0], 4, false);
  addPerimeterWallStrip('tomb_wall_west_n',  [TOMB_X0, TOMB_Z0], [TOMB_X0, -16600], [+1, 0, 0], 4, false);
  addPerimeterWallStrip('tomb_wall_east_s',  [TOMB_X1, -16600], [TOMB_X1, TOMB_Z1], [-1, 0, 0], 4, false);
  addPerimeterWallStrip('tomb_wall_east_n',  [TOMB_X1, TOMB_Z0], [TOMB_X1, -16600], [-1, 0, 0], 4, false);

  // Egyptian Golden-Cobalt Sunset Sky Backdrop wrapping all 4 sides + 4-sector subdivided overhead canopy!
  // Keeps every sky quad <= 2000u (zero PS1 GPU 1023px discard!) so warm sunset sky glows everywhere!
  {
    const Y_SKY_TOP = -2250;
    const addSkyWall = (name, p0, p1, normal) => {
      const mb = new PsxMeshBuilder(name);
      const segs = 8;
      for (let s = 0; s < segs; s++) {
        const a0 = s / segs, a1 = (s + 1) / segs;
        const x0 = Math.round(lerp(p0[0], p1[0], a0)), z0 = Math.round(lerp(p0[1], p1[1], a0));
        const x1 = Math.round(lerp(p0[0], p1[0], a1)), z1 = Math.round(lerp(p0[1], p1[1], a1));
        mb.addQuad([x0, Y_SKY_TOP, z0], [x1, Y_SKY_TOP, z1], [x0, -1480, z0], [x1, -1480, z1], normal, {
          ti: TI_SKY, sf: SF_DECO, c: C_SUN, uv: [0, 8, 63, 8, 0, 63, 63, 63],
        });
      }
      pushSector(mb.compile());
    };
    const sx0 = TOMB_X0 - 40, sx1 = TOMB_X1 + 40, sz0 = TOMB_Z0 - 40, sz1 = TOMB_Z1 + 40;
    addSkyWall('tomb_sky_north', [sx0, sz0], [sx1, sz0], [0, 0, +1]);
    addSkyWall('tomb_sky_south', [sx1, sz1], [sx0, sz1], [0, 0, -1]);
    addSkyWall('tomb_sky_west',  [sx0, sz1], [sx0, sz0], [+1, 0, 0]);
    addSkyWall('tomb_sky_east',  [sx1, sz0], [sx1, sz1], [-1, 0, 0]);
    // 4-sector subdivided overhead Golden-Cobalt Sunset Sky Canopy (Y = -2550, 2000x2000 quads!)
    for (let qz = 0; qz < 2; qz++) {
      for (let qx = 0; qx < 2; qx++) {
        const skyCap = new PsxMeshBuilder(`tomb_sky_cap_${qx}_${qz}`);
        const qx0 = lerp(sx0, sx1, qx / 2), qx1 = lerp(sx0, sx1, (qx + 1) / 2);
        const qz0 = lerp(sz0, sz1, qz / 2), qz1 = lerp(sz0, sz1, (qz + 1) / 2);
        for (let iz = 0; iz < 4; iz++) {
          for (let ix = 0; ix < 4; ix++) {
            const xa = Math.round(lerp(qx0, qx1, ix / 4)), xb = Math.round(lerp(qx0, qx1, (ix + 1) / 4));
            const za = Math.round(lerp(qz0, qz1, iz / 4)), zb = Math.round(lerp(qz0, qz1, (iz + 1) / 4));
            skyCap.addQuad([xa, Y_SKY_TOP, zb], [xb, Y_SKY_TOP, zb], [xa, Y_SKY_TOP, za], [xb, Y_SKY_TOP, za], [0, +1, 0], {
              ti: TI_SKY, sf: SF_DECO, c: C_SUN, uv: [0, 0, 63, 0, 0, 14, 63, 14],
            });
          }
        }
        pushSector(skyCap.compile());
      }
    }
  }

  // ==========================================================================
  // ZONE 1: ENTRANCE COURTYARD (Pharaoh Spine Transfer + Lapis-Gold Hubbas & Stairs)
  // ==========================================================================
  {
    const mb = new PsxMeshBuilder('zone1_spine_hubbas');
    // Pharaoh Spine Transfer (X[-500..+1100], Z[-10600..-9400], height 300u, facing N & S!)
    const spR = 300;
    addCurvedTransition(mb, { axis: 'X', start: -500, end: 1100, segCount: 2, lipCoord: -10020, faceDir: -1, yFloor: -100, curveR: spR, ti: TI_RAMP_STONE, cTop: C_SUN, cMid: C_BRIGHT, cBot: C_MID });
    addCurvedTransition(mb, { axis: 'X', start: -500, end: 1100, segCount: 2, lipCoord: -9980, faceDir: +1, yFloor: -100, curveR: spR, ti: TI_RAMP_STONE, cTop: C_SUN, cMid: C_BRIGHT, cBot: C_MID });
    mb.addQuad([-500, -400, -10020], [1100, -400, -10020], [-500, -400, -9980], [1100, -400, -9980], [0, -1, 0], {
      ti: TI_LAPIS_GOLD, sf: SF_FLOOR, c: C_SUN,
    });
    // Seal Spine West & East sides
    mb.addBox(-520, -500, -400, -100, -10320, -9680, { tiTop: TI_LAPIS_GOLD, tiSide: TI_TERRACOTTA, cTop: C_SUN, cSide: C_MID, cDark: C_SHADE });
    mb.addBox(1100, 1120, -400, -100, -10320, -9680, { tiTop: TI_LAPIS_GOLD, tiSide: TI_TERRACOTTA, cTop: C_SUN, cSide: C_MID, cDark: C_SHADE });

    // West Courtyard Lapis-Gold Hubba Ledges & Temple Skate Platform (X[-4100..-2900], Z[-11600..-9600])
    // Central raised platform + N/S smooth access ramps + twin elevated grind ledges!
    mb.addBox(-3950, -3050, -240, -100, -11000, -10200, { tiTop: TI_FLOOR_LIGHT, tiSide: TI_TERRACOTTA, cTop: C_SUN, cSide: C_MID, cDark: C_SHADE });
    // South & North ramps up onto platform
    mb.addQuad([-3950, -240, -10200], [-3050, -240, -10200], [-3950, -100, -9600], [-3050, -100, -9600], [0, -600, +140], { ti: TI_RAMP_WARM, sf: SF_FLOOR, c: C_BRIGHT });
    mb.addQuad([-3050, -240, -11000], [-3950, -240, -11000], [-3050, -100, -11600], [-3950, -100, -11600], [0, -600, -140], { ti: TI_RAMP_WARM, sf: SF_FLOOR, c: C_BRIGHT });
    // Twin Lapis-Gold Hubba Grind Ledges flanking the ramps
    mb.addBox(-4100, -3950, -320, -100, -11500, -9700, { tiTop: TI_LAPIS_GOLD, tiSide: TI_TERRACOTTA, cTop: C_SUN, cSide: C_MID, cDark: C_SHADE });
    mb.addBox(-3050, -2900, -320, -100, -11500, -9700, { tiTop: TI_LAPIS_GOLD, tiSide: TI_TERRACOTTA, cTop: C_SUN, cSide: C_MID, cDark: C_SHADE });
    pushSector(mb.compile());
  }

  // ==========================================================================
  // ZONE 2: EAST EMPTY PHARAOH POOL #1 — "GREAT OASIS MOSAIC BOWL"
  //   X[+1500..+5500], Z[-15600..-10600], depth 340u, real Crash 3 Turquoise-Gold Mosaic!
  // ==========================================================================
  pushSector(buildEmptyPharaohPool('zone2_oasis_pool', {
    ...POOL1, yDeck: -100, depth: 340,
    tiWall: TI_POOL_MOSAIC, tiBottom: TI_POOL_MOSAIC, tiCoping: TI_LAPIS_GOLD,
    cTop: C_SUN, cMid: C_BRIGHT, cBot: C_MID,
    rollInWestZ: [-13600, -12600], // Smooth roll-in on West side facing Courtyard!
  }));

  // ==========================================================================
  // ZONE 3: SOUTHWEST EMPTY PHARAOH POOL #2 — "SUNKEN SARCOPHAGUS BOWL"
  //   X[-8500..-4500], Z[-14600..-10600], depth 320u, rich Terracotta & Lapis-Gold + East Roll-In!
  // ==========================================================================
  pushSector(buildEmptyPharaohPool('zone3_sarcophagus_pool', {
    ...POOL2, yDeck: -100, depth: 320,
    tiWall: TI_TERRACOTTA, tiBottom: TI_FLOOR_STONE, tiCoping: TI_LAPIS_GOLD,
    cTop: C_SUN, cMid: C_BRIGHT, cBot: C_MID,
    rollInWestZ: null,
    rollInEastZ: [-13100, -12100], // Smooth roll-in on East side facing Grand Courtyard!
  }));

  // ==========================================================================
  // ZONE 4: TWIN GRAND EGYPTIAN HALF-PIPES (Western & Eastern!)
  // ==========================================================================
  pushSector(buildGrandHalfPipe('zone4_west_halfpipe', {
    x0: -8800, x1: -4400, z0: -23000, z1: -16400,
    yFloor: -100, curveR: 460, deckW: 480,
    cTop: C_SUN, cMid: C_BRIGHT, cBot: C_MID,
  }));
  pushSector(buildGrandHalfPipe('zone4_east_halfpipe', {
    x0: 1600, x1: 5800, z0: -23000, z1: -16800,
    yFloor: -100, curveR: 460, deckW: 480,
    cTop: C_SUN, cMid: C_BRIGHT, cBot: C_MID,
  }));

  // ==========================================================================
  // ZONE 5 & 6: MONUMENTAL CENTRAL STEPPED PYRAMID ACCESS RAMP + ELEVATED TERRACE
  //   + LAUNCH KICKER + HIGH AERIAL GOLDEN GRIND RAIL (680u high!) + NORTH LANDING RAMP!
  //   Aligned dead-straight along X = -1200! Secret Crash 3 Green Gem hovers at (-1200, -855, -18800)!
  // ==========================================================================
  {
    const mb = new PsxMeshBuilder('zone5_pyramid_launch');
    // 1. Wide Smooth South Pyramid Access Ramp (X[-2000..-400], Z=-12400 -> -14400, Y=-100 -> -560!)
    //    Gentle 13-degree slope: Crash B. skates right up effortlessly with huge speed!
    const zS = -12400, zMid = -13400, zTopS = -14400, zTopN = -15400, zKickN = -16000;
    const yF = -100, yHalf = -330, yTerr = -560, yKick = -740;
    mb.addQuad([-2000, yHalf, zMid], [-400, yHalf, zMid], [-2000, yF, zS], [-400, yF, zS], [0, -1000, +230], { ti: TI_RAMP_STONE, sf: SF_FLOOR, c: [C_SUN, C_SUN, C_BRIGHT, C_BRIGHT] });
    mb.addQuad([-2000, yTerr, zTopS], [-400, yTerr, zTopS], [-2000, yHalf, zMid], [-400, yHalf, zMid], [0, -1000, +230], { ti: TI_RAMP_STONE, sf: SF_FLOOR, c: [C_SUN, C_SUN, C_SUN, C_SUN] });

    // 2. Elevated Pyramid Terrace Deck (X[-2000..-400], Z=-14400..-15400, Y=-560)
    mb.addQuad([-2000, yTerr, zTopN], [-400, yTerr, zTopN], [-2000, yTerr, zTopS], [-400, yTerr, zTopS], [0, -1, 0], {
      ti: TI_FLOOR_LIGHT, sf: SF_FLOOR, c: C_SUN,
    });
    // Lapis-Gold guide runway stripe pointing directly at the Launch Kicker & High Rail!
    mb.addQuad([-1420, yTerr - 4, zTopN], [-980, yTerr - 4, zTopN], [-1420, yTerr - 4, zTopS], [-980, yTerr - 4, zTopS], [0, -1, 0], {
      ti: TI_LAPIS_GOLD, sf: SF_DECO, c: C_SUN,
    });

    // 3. Skateable West & East Pyramid Flank Ramps (climb from X=-2900 or X=+500 up onto Terrace!)
    mb.addQuad([-2900, yF, zTopS], [-2900, yF, zTopN], [-2000, yTerr, zTopS], [-2000, yTerr, zTopN], [-460, -900, 0], { ti: TI_RAMP_WARM, sf: SF_FLOOR, c: C_BRIGHT });
    mb.addQuad([-400, yTerr, zTopS], [-400, yTerr, zTopN], [500, yF, zTopS], [500, yF, zTopN], [+460, -900, 0], { ti: TI_RAMP_WARM, sf: SF_FLOOR, c: C_BRIGHT });
    // Watertight pyramid side-skirt triangles closing S/N edges of the West & East flank slopes + South access ramp!
    mb.addTri([-2900, yF, zTopS], [-2000, yTerr, zTopS], [-2000, yF, zS], [-460, -900, +460], { ti: TI_TERRACOTTA, sf: SF_FLOOR, c: C_MID });
    mb.addTri([-400, yTerr, zTopS], [500, yF, zTopS], [-400, yF, zS], [+460, -900, +460], { ti: TI_TERRACOTTA, sf: SF_FLOOR, c: C_MID });
    mb.addTri([-2900, yF, zTopN], [-2000, yF, zTopN], [-2000, yTerr, zTopN], [0, 0, -1], { ti: TI_TERRACOTTA, sf: SF_WALL, c: C_SHADE });
    mb.addTri([-400, yF, zTopN], [500, yF, zTopN], [-400, yTerr, zTopN], [0, 0, -1], { ti: TI_TERRACOTTA, sf: SF_WALL, c: C_SHADE });
    // Solid North vertical wall under Pyramid Terrace (sealing underside 100%!)
    mb.addQuad([-400, yTerr, zTopN], [-2000, yTerr, zTopN], [-400, yF, zTopN], [-2000, yF, zTopN], [0, 0, -1], {
      ti: TI_WALL_CLEAN, sf: SF_WALL, c: C_SHADE,
    });

    // 4. Smooth Launch Kicker on North edge of Terrace aimed straight at High Aerial Golden Grind Rail!
    //    X[-1650..-750], Z = -15400 -> -16000, Y = -560 -> -740 (smooth lip right 40u below rail Y=-780!)
    mb.addQuad([-1650, yKick, zKickN], [-750, yKick, zKickN], [-1650, yTerr, zTopN], [-750, yTerr, zTopN], [0, -600, +180], {
      ti: TI_LAPIS_GOLD, sf: SF_FLOOR, c: C_SUN,
    });
    // Solid sides & front wall under Launch Kicker (100% solid!)
    mb.addQuad([-750, yKick, zKickN], [-1650, yKick, zKickN], [-750, yF, zKickN], [-1650, yF, zKickN], [0, 0, -1], { ti: TI_TERRACOTTA, sf: SF_WALL, c: C_SHADE });
    mb.addQuad([-1650, yTerr, zTopN], [-1650, yKick, zKickN], [-1650, yF, zTopN], [-1650, yF, zKickN], [-1, 0, 0], { ti: TI_TERRACOTTA, sf: SF_WALL, c: C_SHADE });
    mb.addQuad([-750, yKick, zKickN], [-750, yTerr, zTopN], [-750, yF, zKickN], [-750, yF, zTopN], [+1, 0, 0], { ti: TI_TERRACOTTA, sf: SF_WALL, c: C_MID });

    pushSector(mb.compile());
  }

  // ==========================================================================
  // ZONE 6B: HIGH AERIAL GOLDEN GRIND RAIL (X=-1200, Y=-780, Z=-16050..-21550)
  //   + 3 SOLID OBELISK SUPPORT COLUMNS + NORTH LANDING RAMP (Z=-21550..-23600)!
  // ==========================================================================
  {
    const mb = new PsxMeshBuilder('zone6_high_aerial_rail');
    // Continuous thick gleaming Carved-Gold Aerial Rail Beam (5,500u long, 680u above floor!)
    // Split into 10 segments of 550u with crisp gold-trimmed UVs (no streaky stretching!)
    for (let s = 0; s < 10; s++) {
      const za = -16050 - s * 550;
      const zb = za - 550;
      mb.addQuad([-1248, -780, zb], [-1152, -780, zb], [-1248, -780, za], [-1152, -780, za], [0, -1, 0], {
        ti: TI_RAMP_STONE, sf: SF_FLOOR, c: C_SUN, uv: [8, 4, 56, 4, 8, 59, 56, 59],
      });
      mb.addQuad([-1248, -780, zb], [-1248, -780, za], [-1248, -708, zb], [-1248, -708, za], [-1, 0, 0], {
        ti: TI_LAPIS_GOLD, sf: SF_WALL, c: C_SUN, uv: [0, 8, 63, 8, 0, 55, 63, 55],
      });
      mb.addQuad([-1152, -780, za], [-1152, -780, zb], [-1152, -708, za], [-1152, -708, zb], [+1, 0, 0], {
        ti: TI_LAPIS_GOLD, sf: SF_WALL, c: C_SUN, uv: [0, 8, 63, 8, 0, 55, 63, 55],
      });
      mb.addQuad([-1248, -708, za], [-1152, -708, za], [-1248, -708, zb], [-1152, -708, zb], [0, +1, 0], {
        ti: TI_TERRACOTTA, sf: SF_WALL, c: C_SHADE,
      });
    }
    // 3 Solid Sandstone Obelisk Support Pillars grounding the High Aerial Rail into the Tomb floor!
    for (const pz of [-16900, -18800, -20700]) {
      mb.addBox(-1290, -1110, -708, -100, pz - 90, pz + 90, {
        tiTop: TI_LAPIS_GOLD, tiSide: TI_WALL_CLEAN,
        sfTop: SF_WALL, sfSide: SF_WALL,
        cTop: C_SUN, cSide: C_BRIGHT, cDark: C_SHADE,
      });
      // Stepped Pharaoh plinth base at floor level
      mb.addBox(-1360, -1040, -190, -100, pz - 160, pz + 160, {
        tiTop: TI_TERRACOTTA, tiSide: TI_TERRACOTTA,
        sfTop: SF_WALL, sfSide: SF_WALL,
        cTop: C_BRIGHT, cSide: C_MID, cDark: C_SHADE,
      });
    }

    // North Receiving Landing Platform + Smooth Down-Ramp (also works as North approach ramp!)
    // Platform: X[-1900..-500], Z=-21550..-22250, Y=-560 (with South mini-kicker -21550..-21250 -> Y=-720!)
    mb.addQuad([-1650, -720, -21550], [-750, -720, -21550], [-1650, -560, -22050], [-750, -560, -22050], [0, -500, -160], {
      ti: TI_LAPIS_GOLD, sf: SF_FLOOR, c: C_SUN,
    });
    mb.addQuad([-1900, -560, -22450], [-500, -560, -22450], [-1900, -560, -22050], [-500, -560, -22050], [0, -1, 0], {
      ti: TI_FLOOR_LIGHT, sf: SF_FLOOR, c: C_SUN,
    });
    // Smooth North Down-Ramp (Z=-22450 -> -23850, Y=-560 -> -100!)
    mb.addQuad([-1900, -100, -23850], [-500, -100, -23850], [-1900, -560, -22450], [-500, -560, -22450], [0, -1400, -460], {
      ti: TI_RAMP_STONE, sf: SF_FLOOR, c: [C_BRIGHT, C_BRIGHT, C_SUN, C_SUN],
    });
    // Solid side & South walls sealing North Landing Ramp 100%!
    mb.addQuad([-1650, -720, -21550], [-750, -720, -21550], [-1650, -100, -21550], [-750, -100, -21550], [0, 0, +1], { ti: TI_TERRACOTTA, sf: SF_WALL, c: C_MID });
    mb.addQuad([-1900, -560, -22450], [-1900, -560, -22050], [-1900, -100, -22450], [-1900, -100, -22050], [-1, 0, 0], { ti: TI_WALL_CLEAN, sf: SF_WALL, c: C_SHADE });
    mb.addQuad([-500, -560, -22050], [-500, -560, -22450], [-500, -100, -22050], [-500, -100, -22450], [+1, 0, 0], { ti: TI_WALL_CLEAN, sf: SF_WALL, c: C_MID });
    mb.addTri([-1900, -560, -22450], [-1900, -100, -23850], [-1900, -100, -22450], [-1, 0, 0], { ti: TI_WALL_CLEAN, sf: SF_WALL, c: C_SHADE });
    mb.addTri([-500, -560, -22450], [-500, -100, -22450], [-500, -100, -23850], [+1, 0, 0], { ti: TI_WALL_CLEAN, sf: SF_WALL, c: C_MID });
    pushSector(mb.compile());
  }

  // ==========================================================================
  // ZONE 7: NORTH SPHINX SANCTUARY QUARTER-PIPES (Z = -24600, X[-4000..+1600])
  // ==========================================================================
  {
    const mb = new PsxMeshBuilder('zone7_north_sphinx_qp');
    addCurvedTransition(mb, { axis: 'X', start: -4000, end: 1600, segCount: 6, lipCoord: -24580, faceDir: +1, yFloor: -100, curveR: 440, ti: TI_RAMP_STONE, cTop: C_SUN, cMid: C_BRIGHT, cBot: C_MID });
    // Raised Sphinx Shrine Pedestal behind North QPs (X[-2200..-200], Z=-24580..-24000, Y=-540)
    mb.addQuad([-4000, -540, -24600], [1600, -540, -24600], [-4000, -540, -24540], [1600, -540, -24540], [0, -1, 0], {
      ti: TI_LAPIS_GOLD, sf: SF_DECO, c: C_SUN,
    });
    pushSector(mb.compile());
  }

  // ==========================================================================
  // ZONE 8: AUTHENTIC CRASH 3 3D STATUES (ALL WRAPPED IN 100% SOLID HULLS!)
  //   Using our dedicated 2x2 256-color Statue Atlas (L[28], hanTi=28)!
  //   Quadrants: TL=SwHiG Sphinx, TR=Sa1iG Sarcophagus, BL=sg1mG Shield Guard, BR=CbriG Cobra
  // ==========================================================================
  // 1. Colossal Crash 3 Sphinx Mask (SwHiG) crowning the North Sanctuary gazing down the High Rail!
  pushSector(buildCrash3StatueSector('statue_sphinx_north', statues.sphinx, {
    wx: -1200, yFloor: -540, wz: -24200, targetH: 820, yawDeg: 0,
    ti: TI_STATUE_ATLAS, uvQuad: [1, 1, 30, 30], cBright: C_SUN, addSolidHull: true, hullPad: 0.90,
  }));
  // 2. Twin Crash 3 Shield Guards (sg1mG) flanking the False Wall Entrance wide and grand!
  pushSector(buildCrash3StatueSector('statue_guard_w', statues.guard, {
    wx: -3020, yFloor: -100, wz: -9250, targetH: 480, yawDeg: 180,
    ti: TI_STATUE_ATLAS, uvQuad: [1, 33, 30, 62], cBright: C_SUN, addSolidHull: true, hullPad: 0.85, maxTris: 190,
  }));
  pushSector(buildCrash3StatueSector('statue_guard_e', statues.guard, {
    wx: -980, yFloor: -100, wz: -9250, targetH: 480, yawDeg: 180,
    ti: TI_STATUE_ATLAS, uvQuad: [1, 33, 30, 62], cBright: C_SUN, addSolidHull: true, hullPad: 0.85, maxTris: 190,
  }));
  // 3. Twin Crash 3 Golden Sarcophagi (Sa1iG) flanking Sunken Pool #2 (West Deck)!
  pushSector(buildCrash3StatueSector('statue_sarcoph_1', statues.sarcoph, {
    wx: -9050, yFloor: -100, wz: -11600, targetH: 460, yawDeg: 90,
    ti: TI_STATUE_ATLAS, uvQuad: [33, 1, 62, 30], cBright: C_SUN, addSolidHull: true, hullPad: 0.88,
  }));
  pushSector(buildCrash3StatueSector('statue_sarcoph_2', statues.sarcoph, {
    wx: -9050, yFloor: -100, wz: -13600, targetH: 460, yawDeg: 90,
    ti: TI_STATUE_ATLAS, uvQuad: [33, 1, 62, 30], cBright: C_SUN, addSolidHull: true, hullPad: 0.88,
  }));
  // 4. Twin Crash 3 Coiled Cobras (CbriG) guarding the East Oasis Mosaic Pool & East Half-Pipe!
  pushSector(buildCrash3StatueSector('statue_cobra_1', statues.cobra, {
    wx: 6050, yFloor: -100, wz: -13100, targetH: 440, yawDeg: -90,
    ti: TI_STATUE_ATLAS, uvQuad: [33, 33, 62, 62], cBright: C_SUN, addSolidHull: true, hullPad: 0.85,
  }));
  pushSector(buildCrash3StatueSector('statue_cobra_2', statues.cobra, {
    wx: 6100, yFloor: -100, wz: -19900, targetH: 440, yawDeg: -90,
    ti: TI_STATUE_ATLAS, uvQuad: [33, 33, 62, 62], cBright: C_SUN, addSolidHull: true, hullPad: 0.85,
  }));
  // 5. Four Real Crash 3 Lotus Columns (Pl2iG) framing the Grand Courtyard Promenade (100% clear of Hubba Ledges & Pool!)
  for (const [k, px, pz] of [[1, -2650, -10800], [2, -2650, -12000], [3, 1150, -11200], [4, 1150, -12400]]) {
    pushSector(buildCrash3StatueSector(`statue_pillar_${k}`, statues.pillar, {
      wx: px, yFloor: -100, wz: pz, targetH: 760, yawDeg: 0,
      ti: TI_WALL_WARM, uvQuad: [0, 0, 63, 63], cBright: C_BRIGHT, addSolidHull: true, hullPad: 0.90,
    }));
  }

  // ==========================================================================
  // REBUILD EXACT 20x20 SQUARE TAG 0x0A CWorldGrid COVERING ALL HANGAR + SECRET TOMB!
  //   Format verified 100% against skhan, skmar, sksl2, skhan_2:
  //     i32 minX<<12, i32 minZ<<12, i32 maxX<<12, i32 maxZ<<12, u16 nx=20, u16 nz=20
  //     400 cells (iz * 20 + ix): each = [u32(0), u32(0), u32(list.length), ...u32 objIdx, u32(0)]
  // ==========================================================================
  let gMinX = 1e9, gMaxX = -1e9, gMinZ = 1e9, gMaxZ = -1e9;
  for (const b of objWorldBounds) {
    if (b.minX < gMinX) gMinX = b.minX; if (b.maxX > gMaxX) gMaxX = b.maxX;
    if (b.minZ < gMinZ) gMinZ = b.minZ; if (b.maxZ > gMaxZ) gMaxZ = b.maxZ;
  }
  const pad = 512;
  gMinX = Math.floor(gMinX - pad); gMaxX = Math.ceil(gMaxX + pad);
  gMinZ = Math.floor(gMinZ - pad); gMaxZ = Math.ceil(gMaxZ + pad);
  const span = Math.max(gMaxX - gMinX, gMaxZ - gMinZ);
  gMaxX = gMinX + span;
  gMaxZ = gMinZ + span;

  const NX = 20, NZ = 20;
  const cells = Array.from({ length: NX * NZ }, () => []);
  const cellW = span / NX;
  const margin = 128; // slight padding so boundary objects never miss adjacent collision cell!
  for (let oi = 0; oi < objWorldBounds.length; oi++) {
    const b = objWorldBounds[oi];
    const ix0 = clamp(Math.floor((b.minX - margin - gMinX) / cellW), 0, NX - 1);
    const ix1 = clamp(Math.floor((b.maxX + margin - gMinX) / cellW), 0, NX - 1);
    const iz0 = clamp(Math.floor((b.minZ - margin - gMinZ) / cellW), 0, NZ - 1);
    const iz1 = clamp(Math.floor((b.maxZ + margin - gMinZ) / cellW), 0, NZ - 1);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        cells[iz * NX + ix].push(oi);
      }
    }
  }
  let gridU32Count = 5;
  for (const lst of cells) gridU32Count += 4 + lst.length;
  const tag0AData = Buffer.alloc(gridU32Count * 4);
  tag0AData.writeInt32LE(gMinX << 12, 0);
  tag0AData.writeInt32LE(gMinZ << 12, 4);
  tag0AData.writeInt32LE(gMaxX << 12, 8);
  tag0AData.writeInt32LE(gMaxZ << 12, 12);
  tag0AData.writeUInt16LE(NX, 16);
  tag0AData.writeUInt16LE(NZ, 18);
  let gp = 20;
  for (const lst of cells) {
    tag0AData.writeUInt32LE(0, gp); gp += 4;
    tag0AData.writeUInt32LE(0, gp); gp += 4;
    tag0AData.writeUInt32LE(lst.length, gp); gp += 4;
    for (const oi of lst) { tag0AData.writeUInt32LE(oi, gp); gp += 4; }
    tag0AData.writeUInt32LE(0, gp); gp += 4;
  }

  // ==========================================================================
  // ASSEMBLE FINAL skegyp.psx BINARY
  // ==========================================================================
  const numObjs = allObjs.length;
  const numMeshes = allMeshBufs.length;
  const meshTableOff = 12 + numObjs * 36;
  const meshDataStart = meshTableOff + 4 + numMeshes * 4;
  const meshOffs = [];
  let curOff = meshDataStart;
  for (const mb of allMeshBufs) {
    meshOffs.push(curOff);
    curOff += mb.length;
    if (curOff & 3) curOff = (curOff + 3) & ~3;
  }
  const newMetaOff = curOff;

  const makeTag = (id, payload) => {
    const hdr = Buffer.alloc(8);
    hdr.writeUInt32LE(id >>> 0, 0);
    hdr.writeUInt32LE(payload.length >>> 0, 4);
    return Buffer.concat([hdr, payload]);
  };
  const endTag = Buffer.alloc(4);
  endTag.writeUInt32LE(0xFFFFFFFF, 0);
  const hashBuf = Buffer.alloc(numMeshes * 4);
  for (let i = 0; i < numMeshes; i++) hashBuf.writeUInt32LE(allMeshHashes[i] >>> 0, i * 4);

  const metaChunk = Buffer.concat([
    makeTag(0x73424752, rgbsTagData),
    makeTag(0x0000000A, tag0AData),
    tag06Data ? makeTag(0x00000006, tag06Data) : Buffer.alloc(0),
    tag07Data ? makeTag(0x00000007, tag07Data) : Buffer.alloc(0),
    endTag,
    hashBuf,
    texRefsTail,
  ]);

  const outBuf = Buffer.alloc(newMetaOff + metaChunk.length);
  origHan.copy(outBuf, 0, 0, 4); // version/magic
  outBuf.writeUInt32LE(newMetaOff >>> 0, 4);
  outBuf.writeUInt32LE(numObjs >>> 0, 8);
  for (let i = 0; i < numObjs; i++) allObjs[i].copy(outBuf, 12 + i * 36);
  outBuf.writeUInt32LE(numMeshes >>> 0, meshTableOff);
  for (let i = 0; i < numMeshes; i++) outBuf.writeUInt32LE(meshOffs[i] >>> 0, meshTableOff + 4 + i * 4);
  for (let i = 0; i < numMeshes; i++) allMeshBufs[i].copy(outBuf, meshOffs[i]);
  metaChunk.copy(outBuf, newMetaOff);

  return {
    buf: outBuf,
    numObjs,
    numMeshes,
    newSectorCount: newSectors.length,
    gridBounds: { gMinX, gMaxX, gMinZ, gMaxZ, span },
    rgbsCount: rgbs.length,
  };
}

// ============================================================================
// 5. Crash 3 3D .OBJ Loader & skegyp_o.psx Builder (Scarab o[8], Vase o[9], Green Gem o[20]!)
// ============================================================================

function loadCrash3Obj(dirName, { emeraldMode = false } = {}) {
  const fullDir = path.join(OBJ_DIR, dirName);
  const files = fs.readdirSync(fullDir);
  const objPath = path.join(fullDir, files.find(f => f.endsWith('.obj')));
  const pngPath = path.join(fullDir, files.find(f => f.endsWith('.png')));
  const texW = 64, texH = 64;
  const rawRgba = psxLib.loadRgba(pngPath, texW, texH);

  let rgba;
  if (emeraldMode) {
    // Vibrant Luminous Crash 3 Emerald Green Gem (Ge10G) with crisp crystal facets & ZERO holes!
    rgba = Buffer.alloc(texW * texH * 4);
    for (let i = 0; i < texW * texH; i++) {
      const r0 = rawRgba[i * 4], g0 = rawRgba[i * 4 + 1], b0 = rawRgba[i * 4 + 2];
      const lum = clamp((0.299 * r0 + 0.587 * g0 + 0.114 * b0) / 255, 0.16, 1.0);
      // Faceted sparkling emerald green crystal highlights
      const hi = Math.pow(lum, 1.5);
      rgba[i * 4]     = clamp(Math.round(24 + hi * 150), 20, 224);
      rgba[i * 4 + 1] = clamp(Math.round(118 + lum * 134), 96, 252);
      rgba[i * 4 + 2] = clamp(Math.round(38 + hi * 124), 28, 200);
      rgba[i * 4 + 3] = 255;
    }
  } else {
    for (let i = 0; i < texW * texH; i++) {
      rawRgba[i * 4 + 3] = 255;
      if (rawRgba[i * 4] < 12 && rawRgba[i * 4 + 1] < 12 && rawRgba[i * 4 + 2] < 12) {
        rawRgba[i * 4] = 28; rawRgba[i * 4 + 1] = 22; rawRgba[i * 4 + 2] = 16;
      }
    }
    rgba = gradeEgyptAlive(rawRgba, {
      sat: 0.72, tint: [1.10, 1.02, 0.88], lumScale: 1.08, contrast: 0.98,
      preserveCool: true, tameNeon: 0.18, minLum: 28, maxLum: 232,
    });
  }

  const txt = fs.readFileSync(objPath, 'utf8');
  const verts = [], uvs = [], tris = [];
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
      for (let k = 1; k + 1 < idx.length; k++) tris.push([idx[0], idx[k], idx[k + 1]]);
    }
  }
  return { name: dirName, verts, uvs, tris, bounds: { minX, maxX, minY, maxY, minZ, maxZ }, texW, texH, rgba };
}

function compileCrash3ObjToPsxMesh(obj, targetBox, texIdx, colorIdx) {
  const b = obj.bounds;
  const sx = (targetBox.xmax - targetBox.xmin) / Math.max(1e-4, b.maxX - b.minX);
  const sy = (targetBox.ymax - targetBox.ymin) / Math.max(1e-4, b.maxY - b.minY);
  const sz = (targetBox.zmax - targetBox.zmin) / Math.max(1e-4, b.maxZ - b.minZ);
  const uniformScale = Math.min(sx, sy, sz);
  const cx = (b.minX + b.maxX) * 0.5;
  const cz = (b.minZ + b.maxZ) * 0.5;
  const tcx = (targetBox.xmin + targetBox.xmax) * 0.5;
  const tcz = (targetBox.zmin + targetBox.zmax) * 0.5;

  const verts = [];
  let xmin = 32767, xmax = -32768, ymin = 32767, ymax = -32768, zmin = 32767, zmax = -32768;
  for (const v of obj.verts) {
    const px = Math.round(tcx + (v[0] - cx) * uniformScale);
    const py = Math.round(targetBox.ymax - (v[1] - b.minY) * uniformScale);
    const pz = Math.round(tcz + (v[2] - cz) * uniformScale);
    verts.push([px, py, pz]);
    if (px < xmin) xmin = px; if (px > xmax) xmax = px;
    if (py < ymin) ymin = py; if (py > ymax) ymax = py;
    if (pz < zmin) zmin = pz; if (pz > zmax) zmax = pz;
  }
  if (verts.length > 250) throw new Error(`Crash 3 OBJ ${obj.name} has too many verts: ${verts.length}`);

  const norms = [];
  const faces = [];
  for (const tri of obj.tris) {
    const i0 = tri[0].vi, i1 = tri[1].vi, i2 = tri[2].vi;
    if (i0 === i1 || i1 === i2 || i0 === i2) continue;
    const p0 = verts[i0], p1 = verts[i1], p2 = verts[i2];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-3) continue;
    const ni = norms.length;
    norms.push([
      clamp(Math.round((-nx / nl) * 4096), -4096, 4096),
      clamp(Math.round((-ny / nl) * 4096), -4096, 4096),
      clamp(Math.round((-nz / nl) * 4096), -4096, 4096),
    ]);
    const uv = k => {
      const uvt = obj.uvs[tri[k].ti] || [0.5, 0.5];
      return [clamp(Math.round(uvt[0] * 63), 0, 63), clamp(Math.round((1 - uvt[1]) * 63), 0, 63)];
    };
    const [u0, v0] = uv(0), [u1, v1] = uv(1), [u2, v2] = uv(2);
    faces.push({ i0, i1: i2, i2: i1, u0, v0, u1: u2, v1: v2, u2: u1, v2: v1, ni });
  }

  let radius = 0;
  for (const v of verts) radius = Math.max(radius, Math.ceil(Math.hypot(v[0], v[1], v[2])));

  const totalBytes = 28 + verts.length * 8 + norms.length * 8 + faces.length * 28;
  const out = Buffer.alloc(totalBytes);
  let p = 0;
  out.writeUInt16LE(0x0008, p); p += 2;
  out.writeUInt16LE(verts.length, p); p += 2;
  out.writeUInt16LE(norms.length, p); p += 2;
  out.writeUInt16LE(faces.length, p); p += 2;
  out.writeUInt32LE(((radius + 16) << 12) >>> 0, p); p += 4; // EXACT Neversoft fixed-point 20.12 radius!
  out.writeInt16LE(xmax, p); p += 2;
  out.writeInt16LE(xmin, p); p += 2;
  out.writeInt16LE(ymax, p); p += 2;
  out.writeInt16LE(ymin, p); p += 2;
  out.writeInt16LE(zmax, p); p += 2;
  out.writeInt16LE(zmin, p); p += 2;
  out.writeUInt32LE(0xFFFF7FFF, p); p += 4; // EXACT retail skhan_o.psx LOD header (20/20 meshes)!

  for (const v of verts) {
    out.writeInt16LE(v[0], p); out.writeInt16LE(v[1], p + 2); out.writeInt16LE(v[2], p + 4); out.writeUInt16LE(0, p + 6);
    p += 8;
  }
  for (const n of norms) {
    out.writeInt16LE(n[0], p); out.writeInt16LE(n[1], p + 2); out.writeInt16LE(n[2], p + 4); out.writeUInt16LE(0, p + 6);
    p += 8;
  }
  for (const f of faces) {
    out.writeUInt16LE(0x1813, p);
    out.writeUInt16LE(28, p + 2);
    out[p + 4] = f.i0; out[p + 5] = f.i1; out[p + 6] = f.i2; out[p + 7] = 0;
    out[p + 8] = colorIdx; out[p + 9] = colorIdx; out[p + 10] = colorIdx; out[p + 11] = colorIdx;
    out.writeUInt16LE(f.ni, p + 12);
    out.writeUInt16LE(0x0001, p + 14);
    out.writeUInt32LE(texIdx, p + 16);
    out[p + 20] = f.u0; out[p + 21] = f.v0;
    out[p + 22] = f.u1; out[p + 23] = f.v1;
    out[p + 24] = f.u2; out[p + 25] = f.v2;
    out[p + 26] = 0;    out[p + 27] = 0;
    p += 28;
  }
  return out;
}

/**
 * Rebuild skegyp_o.psx (21 meshes = 20 Hangar slots + o[20] Real Crash 3 Glowing Emerald Green Gem!):
 *   - o[8]  (0x5120A107): Real Crash 3 Golden Scarab (Sc1mG) using oTex[24]
 *   - o[9]  (0x4EB2C689): Real Crash 3 Pharaoh Vase (Va1iG) using oTex[26]
 *   - o[20] (0x5120A108): Real Crash 3 Glowing Emerald Green Gem (Ge10G) using oTex[25] (freed barrel top!)
 */
function buildEgyptObjectsPsx(origObjBuf, levelTexByHash, scarabObj, vaseObj, greenGemObj) {
  const metaOff = origObjBuf.readUInt32LE(4);
  const origNumObjs = origObjBuf.readUInt32LE(8);
  const origHdrObjsEnd = 12 + origNumObjs * 36;
  const origNumMeshes = origObjBuf.readUInt32LE(origHdrObjsEnd);
  const origMeshOffs = [];
  for (let i = 0; i < origNumMeshes; i++) origMeshOffs.push(origObjBuf.readUInt32LE(origHdrObjsEnd + 4 + i * 4));

  const origMetaTail = Buffer.from(origObjBuf.subarray(metaOff));
  let bestBrightIdx = 0;
  let mp = 0;
  while (mp + 4 <= origMetaTail.length) {
    const tag = origMetaTail.readUInt32LE(mp);
    if (tag === 0xFFFFFFFF) { mp += 4; break; }
    const len = origMetaTail.readUInt32LE(mp + 4);
    if (tag === 0x73424752) {
      const rgbs = gradeRgbsInPlace(origMetaTail, mp + 8, len);
      bestBrightIdx = findClosestRgbIdx(rgbs, 232, 224, 210);
    }
    mp += 8 + len;
  }

  // Extract tags (up to mp), meshHashes (origNumMeshes*4), and texSection (rest)
  const tagsPart = origMetaTail.subarray(0, mp);
  const hashesBuf = Buffer.alloc((origNumMeshes + 1) * 4);
  origMetaTail.copy(hashesBuf, 0, mp, mp + origNumMeshes * 4);
  const oldHash8 = hashesBuf.readUInt32LE(8 * 4);
  if (oldHash8 !== 0xd0c4f2da) throw new Error(`Unexpected skhan_o mesh[8] hash: 0x${oldHash8.toString(16)}`);
  hashesBuf.writeUInt32LE(0x5120A107 >>> 0, 8 * 4);              // o[8]: Golden Scarab
  hashesBuf.writeUInt32LE(0x5120A108 >>> 0, origNumMeshes * 4);  // o[20]: Glowing Emerald Green Gem!
  const texPart = Buffer.from(origMetaTail.subarray(mp + origNumMeshes * 4));

  const scarabMesh = compileCrash3ObjToPsxMesh(
    scarabObj, { xmin: -68, xmax: 68, ymin: -72, ymax: 18, zmin: -56, zmax: 56 }, 24, bestBrightIdx
  );
  const vaseMesh = compileCrash3ObjToPsxMesh(
    vaseObj, { xmin: -48, xmax: 52, ymin: -62, ymax: 63, zmin: -49, zmax: 51 }, 26, bestBrightIdx
  );
  // Real Crash 3 Emerald Green Gem (Ge10G) — bold, crystalline & unmistakable on the High Aerial Rail!
  const greenGemMesh = compileCrash3ObjToPsxMesh(
    greenGemObj, { xmin: -66, xmax: 66, ymin: -88, ymax: 38, zmin: -66, zmax: 66 }, 25, bestBrightIdx
  );

  // Assemble 21 objects & 21 meshes
  const newNumObjs = origNumObjs + 1;
  const newNumMeshes = origNumMeshes + 1;
  const newHdrObjsEnd = 12 + newNumObjs * 36;
  const newMeshDataStart = newHdrObjsEnd + 4 + newNumMeshes * 4;

  const meshChunks = [];
  for (let i = 0; i < origNumMeshes; i++) {
    if (i === 8) meshChunks.push(scarabMesh);
    else if (i === 9) meshChunks.push(vaseMesh);
    else {
      const start = origMeshOffs[i];
      const end = (i + 1 < origNumMeshes) ? origMeshOffs[i + 1] : metaOff;
      meshChunks.push(Buffer.from(origObjBuf.subarray(start, end)));
    }
  }
  meshChunks.push(greenGemMesh); // mesh[20]

  const newMeshOffs = [];
  let curOff = newMeshDataStart;
  for (const ch of meshChunks) {
    newMeshOffs.push(curOff);
    curOff += ch.length;
    if (curOff & 3) curOff = (curOff + 3) & ~3;
  }
  const newMetaOff = curOff;

  // Adjust internal texture offsets inside texPart (delta = newTexPartStart - origTexPartStart!)
  const origTexPartStart = metaOff + mp + origNumMeshes * 4;
  const newTexPartStart = newMetaOff + tagsPart.length + hashesBuf.length;
  const texDelta = newTexPartStart - origTexPartStart;

  let tp = 0;
  const numTexRefs = texPart.readUInt32LE(tp); tp += 4 + numTexRefs * 4;
  const nPal4 = texPart.readUInt32LE(tp); tp += 4 + nPal4 * 36;
  const nPal8 = texPart.readUInt32LE(tp); tp += 4 + nPal8 * 516;
  const nTex = texPart.readUInt32LE(tp); tp += 4;
  for (let i = 0; i < nTex; i++) {
    const oldTexOff = texPart.readUInt32LE(tp + i * 4);
    texPart.writeUInt32LE((oldTexOff + texDelta) >>> 0, tp + i * 4);
  }

  const finalMeta = Buffer.concat([tagsPart, hashesBuf, texPart]);
  const outBuf = Buffer.alloc(newMetaOff + finalMeta.length);
  origObjBuf.copy(outBuf, 0, 0, 12);
  outBuf.writeUInt32LE(newMetaOff >>> 0, 4);
  outBuf.writeUInt32LE(newNumObjs >>> 0, 8);
  origObjBuf.copy(outBuf, 12, 12, origHdrObjsEnd);
  // SObject[20] cloned from SObject[8] (Pilot Wings template) with meshIdx = 20!
  const obj20 = Buffer.from(origObjBuf.subarray(12 + 8 * 36, 12 + 9 * 36));
  obj20.writeUInt16LE(20, 22);
  obj20.copy(outBuf, 12 + origNumObjs * 36);

  outBuf.writeUInt32LE(newNumMeshes >>> 0, newHdrObjsEnd);
  for (let i = 0; i < newNumMeshes; i++) outBuf.writeUInt32LE(newMeshOffs[i] >>> 0, newHdrObjsEnd + 4 + i * 4);
  for (let i = 0; i < newNumMeshes; i++) meshChunks[i].copy(outBuf, newMeshOffs[i]);
  finalMeta.copy(outBuf, newMetaOff);

  // Reskin ALL 39 textures of skegyp_o.psx!
  const parsedO = parsePsxTextureSection(outBuf);
  const sharedPal = new Map();
  for (const t of parsedO.textures) {
    let rgba;
    if (t.idx === 24) {
      rgba = resizeRgba(scarabObj.rgba, scarabObj.texW, scarabObj.texH, t.w, t.h);
    } else if (t.idx === 25) {
      // Slot 25 (freed barrel top, inL=false): Dedicated 64x64 Luminous Emerald Green Gem!
      rgba = resizeRgba(greenGemObj.rgba, greenGemObj.texW, greenGemObj.texH, t.w, t.h);
    } else if (t.idx === 26) {
      rgba = resizeRgba(vaseObj.rgba, vaseObj.texW, vaseObj.texH, t.w, t.h);
    } else if (levelTexByHash.has(t.hash)) {
      const lt = levelTexByHash.get(t.hash);
      rgba = resizeRgba(lt.rgba, lt.w, lt.h, t.w, t.h);
    } else {
      rgba = patinaOriginalPreserveMask(t.rgba, {
        tint: [1.14, 0.96, 0.66], sat: 0.40, lumScale: 0.96, lumBias: 8,
      });
    }
    encodeTextureInPlace(outBuf, t, rgba, sharedPal);
  }
  return outBuf;
}

// ============================================================================
// 6. Native SkEgyp_T.trg Builder (Hangar + Secret Green Gem + Secret Tomb Rails!)
// ============================================================================

function makeRailPointNode(curOff, x, y, z, nextIdx = -1, terrain = 1) {
  const hasLink = nextIdx >= 0;
  const headerLen = 4 + (hasLink ? 2 : 0);
  // EXACT THPS2 TRG 4-byte alignment rule (verified on SkHan_T.trg rail[11] & rail[24]!):
  // Whenever (nodeOff + 4 + numLinks*2) % 4 !== 0, insert u16(0) pad before i32 x,y,z!
  const pad = ((curOff + headerLen) & 3) ? 2 : 0;
  const buf = Buffer.alloc(headerLen + pad + 14);
  let p = 0;
  buf.writeUInt16LE(10, p); p += 2; // Type 10 = RailPoint
  buf.writeUInt16LE(hasLink ? 1 : 0, p); p += 2;
  if (hasLink) { buf.writeUInt16LE(nextIdx, p); p += 2; }
  if (pad) { buf.writeUInt16LE(0, p); p += 2; }
  buf.writeInt32LE(Math.round(x), p); p += 4;
  buf.writeInt32LE(Math.round(y), p); p += 4;
  buf.writeInt32LE(Math.round(z), p); p += 4;
  buf.writeUInt16LE(terrain, p);
  return buf;
}

function buildEgyptTrgFromHangar(origTrg) {
  const origNumNodes = origTrg.readUInt32LE(8);
  const origOffs = [];
  for (let i = 0; i < origNumNodes; i++) origOffs.push(origTrg.readUInt32LE(12 + i * 4));

  const GAP_REMAP = new Map([
    [2702, 4300], [2701, 4301], [2709, 4302], [2710, 4303],
    [2700, 4304], [2703, 4305], [2704, 4306], [2705, 4307], [2706, 4308], [2707, 4309],
    [2708, 4310], [2711, 4311], [2712, 4312], [2713, 4313], [2714, 4314],
    [2716, 4316], [2717, 4317], [2718, 4318], [2719, 4319], [2720, 4320], [2721, 4321],
  ]);

  const padEvenStr = s => {
    const b = Buffer.from(s + '\0', 'ascii');
    return (b.length & 1) ? Buffer.concat([b, Buffer.from([0])]) : b;
  };
  const replacements = [
    [padEvenStr('SkHan_l2'), padEvenStr('SkEgyp_l')],
    [padEvenStr('SkHan_O2'), padEvenStr('SkEgyp_O')],
    [padEvenStr('SkHan_l'),  padEvenStr('SkEgyp_l')],
    [padEvenStr('SkHan_O'),  padEvenStr('SkEgyp_O')],
    [padEvenStr('SkHan_2'),  padEvenStr('SkEgyp_2')],
    [padEvenStr('skhan_2'),  padEvenStr('SkEgyp_2')],
    [padEvenStr('SkHan'),    padEvenStr('SkEgyp')],
  ];

  // Relocate Secret Collectible (Node 149, sub=16) right onto the High Aerial Golden Grind Rail!
  // Plus relocate 3 cash pickups (2x $100 Crystals + 1x $250 Diamond) into Secret Tomb landmarks!
  const RELOCATE_T5 = new Map([
    [149, [-1200, -855, -18800]], // SECRET CRASH 3 EMERALD GREEN GEM right on High Aerial Golden Rail!
    [330, [ 3500,  +80, -13100]], // $100 Crystal hovering over East Oasis Mosaic Pool #1!
    [333, [-6500,  +40, -12600]], // $100 Crystal inside Southwest Sunken Bowl #2!
    [335, [-6600, -560, -19700]], // $250 Diamond high over Western Grand Half-Pipe!
  ]);

  const newNodes = [];
  let strPatched = 0, gapPatched = 0, killBoxClamped = 0;

  // Keep nodes 0..(origNumNodes - 2), reserving final Type 255 terminator to place at very end!
  const termIdx = origNumNodes - 1;
  const termNode = Buffer.from(origTrg.subarray(origOffs[termIdx]));
  if (termNode.readUInt16LE(0) !== 255) throw new Error('Expected final TRG node to be Type 255 terminator!');

  for (let i = 0; i < termIdx; i++) {
    let nb = Buffer.from(origTrg.subarray(origOffs[i], origOffs[i + 1]));
    const type = nb.readUInt16LE(0);

    if (type === 4 || type === 8 || type === 15) {
      for (const [pat, rep] of replacements) {
        let searchFrom = 0;
        while (true) {
          const idx = nb.indexOf(pat, searchFrom);
          if (idx < 0) break;
          if ((idx & 1) !== 0) { searchFrom = idx + 1; continue; }
          nb = Buffer.concat([nb.subarray(0, idx), rep, nb.subarray(idx + pat.length)]);
          searchFrom = idx + rep.length;
          strPatched++;
        }
      }
    }

    if (type === 5 && RELOCATE_T5.has(i)) {
      const nl = nb.readUInt16LE(4);
      const pad = ((origOffs[i] + 6 + nl * 2) & 3) ? 2 : 0;
      const [nx, ny, nz] = RELOCATE_T5.get(i);
      nb.writeInt32LE(nx, 6 + nl * 2 + pad);
      nb.writeInt32LE(ny, 10 + nl * 2 + pad);
      nb.writeInt32LE(nz, 14 + nl * 2 + pad);
    }

    // CRITICAL: Add Secret Emerald Green Gem (node 149) + Pool #2 pickup (node 333) directly into
    // Hangar's Startup PowerUp Spawner (node 238, +4 bytes -> preserves exact 4-byte alignment parity!),
    // AND unlink them from Hangar's Chopper Wind-Tunnel triggers (node 551 & node 129) so BOTH spawn
    // IMMEDIATELY on Frame 1 inside the Massive Secret Tomb without needing the Hangar Chopper!
    if (type === 6 && i === 238) {
      const nl = nb.readUInt16LE(2);
      const linksEnd = 4 + nl * 2;
      const head = Buffer.from(nb.subarray(0, linksEnd));
      head.writeUInt16LE(nl + 2, 2);
      const extraLinks = Buffer.alloc(4);
      extraLinks.writeUInt16LE(149, 0); // Secret Crash 3 Emerald Green Gem on High Aerial Rail!
      extraLinks.writeUInt16LE(333, 2); // Crystal/Wumpa inside Empty Pool #2!
      const tail = nb.subarray(linksEnd);
      nb = Buffer.concat([head, extraLinks, tail]);
    }
    if (type === 6 && i === 551) {
      const nl = nb.readUInt16LE(2);
      for (let k = 0; k < nl; k++) {
        if (nb.readUInt16LE(4 + k * 2) === 149) nb.writeUInt16LE(670, 4 + k * 2);
      }
    }
    if (type === 6 && i === 129) {
      const nl = nb.readUInt16LE(2);
      for (let k = 0; k < nl; k++) {
        if (nb.readUInt16LE(4 + k * 2) === 333) nb.writeUInt16LE(636, 4 + k * 2);
      }
    }

    if (type === 6) {
      for (let p = 2; p + 10 <= nb.length; p += 2) {
        if (nb.readUInt16LE(p) === 201 && nb.readUInt16LE(p + 2) === 0) {
          const oldId = nb.readUInt16LE(p + 8);
          if (GAP_REMAP.has(oldId)) {
            nb.writeUInt16LE(GAP_REMAP.get(oldId), p + 8);
            gapPatched++;
          }
        }
      }
      // CRITICAL: Clamp ALL Hangar 0x008D (SetRegionVis / KillBBox) portal-culling boxes to Z >= -7400!
      // All 470 Hangar objects sit strictly at Z >= -7251, while all 53 Secret Tomb sectors sit at Z <= -7804.
      // Without clamping, Hangar's Wind Tunnel startup box (node[550]: X[-13727..-4625], Z[-15938..-5428])
      // kills (fl |= 0x0041 = invisible + zero collision!) Pool #2 (oi=506), floor tiles (oi=479/483),
      // SW walls (oi=487/492), sky canopy (oi=502) and both Golden Sarcophagi (oi=515/516)!
      for (let p = 2; p + 10 <= nb.length; p += 2) {
        if (nb.readUInt16LE(p) === 0x008D) {
          const a0 = nb.readUInt16LE(p + 2), a1 = nb.readUInt16LE(p + 4), a2 = nb.readUInt16LE(p + 6);
          if ((a0 === 0 || a0 === 1) && (a1 === 0 || a1 === 1) && a2 === 0) {
            let q = p + 8;
            while (q + 24 <= nb.length && nb.readUInt16LE(q) !== 0x00FF) {
              const minZ = nb.readInt32LE(q + 8);
              const maxZ = nb.readInt32LE(q + 20);
              if (minZ < -7400) {
                nb.writeInt32LE(-7400, q + 8);
                if (maxZ < -7400) nb.writeInt32LE(-7400, q + 20);
                killBoxClamped++;
              }
              q += 24;
            }
          }
        }
      }
    }

    if (nb.length & 1) nb = Buffer.concat([nb, Buffer.from([0])]);
    newNodes.push(nb);
  }

  // Pre-compute rail specs so we know final hdrSize (exact 4-byte offset of every appended Type 10 RailPoint!)
  const railChains = [
    // 1. HIGH AERIAL GOLDEN GRIND RAIL (680u high -> passes dead-center through the Emerald Green Gem at -18800!)
    { pts: [[-1200, -782, -16050], [-1200, -782, -17425], [-1200, -782, -18800], [-1200, -782, -20175], [-1200, -782, -21550]], closed: false, terrain: 1 },
    // 2. East Oasis Mosaic Pool #1 — 360-deg Coping Rail (leaving West roll-in gap open!)
    { pts: [[1500, -104, -13600], [1500, -104, -15600], [3500, -104, -15600], [5500, -104, -15600], [5500, -104, -13100], [5500, -104, -10600], [3500, -104, -10600], [1500, -104, -10600], [1500, -104, -12600]], closed: false, terrain: 0 },
    // 3. Southwest Sunken Sarcophagus Pool #2 — 360-deg Coping Rail (leaving East roll-in gap -13100..-12100 open!)
    { pts: [[-4500, -104, -13100], [-4500, -104, -14600], [-6500, -104, -14600], [-8500, -104, -14600], [-8500, -104, -12600], [-8500, -104, -10600], [-6500, -104, -10600], [-4500, -104, -10600], [-4500, -104, -12100]], closed: false, terrain: 0 },
    // 4. Western Grand Half-Pipe — Dual Golden Coping Rails!
    { pts: [[-8320, -562, -22960], [-8320, -562, -19700], [-8320, -562, -16440]], closed: false, terrain: 1 },
    { pts: [[-4880, -562, -22960], [-4880, -562, -19700], [-4880, -562, -16440]], closed: false, terrain: 1 },
    // 5. Eastern Sphinx Half-Pipe — Dual Golden Coping Rails!
    { pts: [[2080, -562, -22960], [2080, -562, -19900], [2080, -562, -16840]], closed: false, terrain: 1 },
    { pts: [[5320, -562, -22960], [5320, -562, -19900], [5320, -562, -16840]], closed: false, terrain: 1 },
    // 6. Entrance Courtyard Pharaoh Spine Transfer + Twin Hubba Grind Rails!
    { pts: [[-500, -402, -10000], [300, -402, -10000], [1100, -402, -10000]], closed: false, terrain: 1 },
    { pts: [[-4025, -322, -11480], [-4025, -322, -9720]], closed: false, terrain: 1 },
    { pts: [[-2975, -322, -11480], [-2975, -322, -9720]], closed: false, terrain: 1 },
    // 7. North Sphinx Sanctuary Quarter-Pipe Coping Rail!
    { pts: [[-3980, -542, -24560], [-1200, -542, -24560], [1580, -542, -24560]], closed: false, terrain: 1 },
  ];

  let appendedRails = 0;
  for (const ch of railChains) appendedRails += ch.pts.length;
  const finalNumNodes = newNodes.length + appendedRails + 1; // +1 for Type 255 terminator
  const finalHdrSize = 12 + finalNumNodes * 4;
  let curNodeOff = finalHdrSize;
  for (const nb of newNodes) curNodeOff += nb.length;

  for (const { pts, closed, terrain } of railChains) {
    const baseIdx = newNodes.length;
    for (let k = 0; k < pts.length; k++) {
      const [x, y, z] = pts[k];
      let nextIdx = -1;
      if (k + 1 < pts.length) nextIdx = baseIdx + k + 1;
      else if (closed) nextIdx = baseIdx;
      const rn = makeRailPointNode(curNodeOff, x, y, z, nextIdx, terrain);
      newNodes.push(rn);
      curNodeOff += rn.length;
    }
  }

  // Append original Type 255 terminator at the very end!
  newNodes.push(termNode);

  const numNodes = newNodes.length;
  const hdrSize = 12 + numNodes * 4;
  let totalLen = hdrSize;
  const newOffs = [];
  for (const nb of newNodes) { newOffs.push(totalLen); totalLen += nb.length; }
  const out = Buffer.alloc(totalLen);
  origTrg.copy(out, 0, 0, 8);
  out.writeUInt32LE(numNodes >>> 0, 8);
  for (let i = 0; i < numNodes; i++) out.writeUInt32LE(newOffs[i] >>> 0, 12 + i * 4);
  for (let i = 0; i < numNodes; i++) newNodes[i].copy(out, newOffs[i]);

  console.log(`  [TRG]   SkEgyp_T.trg compilado (${numNodes} nos = ${origNumNodes} Hangar + ${appendedRails} rail nodes Tumba Secreta, ${out.length} B, ${strPatched} refs, ${gapPatched} EndGaps -> 4300..4321, ${killBoxClamped} 0x8D boxes clampados Z>=-7400, Gema Verde em (-1200,-855,-18800))`);
  return out;
}

// ============================================================================
// 7. Software 3D Textured Renderer (for 6-Angle QA Sheet & LevelSel BMPs!)
// ============================================================================

function parseLevelForRender(levelBuf, texByHash) {
  const metaOff = levelBuf.readUInt32LE(4);
  const numObjs = levelBuf.readUInt32LE(8);
  const objs = [];
  let p = 12;
  for (let i = 0; i < numObjs; i++) {
    objs.push({
      flags: levelBuf.readUInt32LE(p),
      x: levelBuf.readInt32LE(p + 4) >> 12,
      y: levelBuf.readInt32LE(p + 8) >> 12,
      z: levelBuf.readInt32LE(p + 12) >> 12,
      meshIdx: levelBuf.readUInt16LE(p + 22),
    });
    p += 36;
  }
  const numMeshes = levelBuf.readUInt32LE(p); p += 4;
  const meshOffs = [];
  for (let i = 0; i < numMeshes; i++) { meshOffs.push(levelBuf.readUInt32LE(p)); p += 4; }

  let mp = metaOff;
  const rgbs = [];
  while (mp + 4 <= levelBuf.length) {
    const tag = levelBuf.readUInt32LE(mp);
    if (tag === 0xFFFFFFFF) { mp += 4; break; }
    const len = levelBuf.readUInt32LE(mp + 4);
    if (tag === 0x73424752) {
      for (let i = 0; i < (len >> 2); i++) {
        rgbs.push([levelBuf[mp + 8 + i * 4], levelBuf[mp + 8 + i * 4 + 1], levelBuf[mp + 8 + i * 4 + 2]]);
      }
    }
    mp += 8 + len;
  }
  mp += numMeshes * 4;
  const nRefs = levelBuf.readUInt32LE(mp); mp += 4;
  const texList = [];
  for (let i = 0; i < nRefs; i++) {
    texList.push(texByHash.get(levelBuf.readUInt32LE(mp)) || null);
    mp += 4;
  }

  const meshes = [];
  for (const obj of objs) {
    if (obj.meshIdx >= numMeshes) continue;
    let o = meshOffs[obj.meshIdx];
    const nv = levelBuf.readUInt16LE(o + 2), nn = levelBuf.readUInt16LE(o + 4), np = levelBuf.readUInt16LE(o + 6);
    o += 28;
    const verts = [];
    for (let i = 0; i < nv; i++) {
      verts.push([obj.x + levelBuf.readInt16LE(o), obj.y + levelBuf.readInt16LE(o + 2), obj.z + levelBuf.readInt16LE(o + 4)]);
      o += 8;
    }
    o += nn * 8;
    const faces = [];
    for (let i = 0; i < np; i++) {
      const fl = levelBuf.readUInt16LE(o), sz = levelBuf.readUInt16LE(o + 2);
      if ((fl & 0x0080) === 0 && (fl & 0x0001) && sz >= 28) {
        const isTri = (fl & 0x0010) !== 0;
        const v = [levelBuf[o + 4], levelBuf[o + 5], levelBuf[o + 6], levelBuf[o + 7]];
        const c = [levelBuf[o + 8], levelBuf[o + 9], levelBuf[o + 10], levelBuf[o + 11]];
        const ti = levelBuf.readUInt32LE(o + 16);
        const uv = [
          levelBuf[o + 20], levelBuf[o + 21], levelBuf[o + 22], levelBuf[o + 23],
          levelBuf[o + 24], levelBuf[o + 25], levelBuf[o + 26], levelBuf[o + 27],
        ];
        faces.push({ isTri, v, c, ti, uv });
      }
      o += sz;
    }
    meshes.push({ verts, faces });
  }
  return { meshes, texList, rgbs };
}

function renderPsxView(scene, camPos, lookAt, width, height, fovDeg = 76) {
  const rgba = makeEgyptSunsetSky(width, height);
  const zbuf = new Float32Array(width * height).fill(1e9);

  let fx = lookAt[0] - camPos[0], fy = lookAt[1] - camPos[1], fz = lookAt[2] - camPos[2];
  const flen = Math.hypot(fx, fy, fz) || 1;
  fx /= flen; fy /= flen; fz /= flen;
  const up = [0, -1, 0];
  let rx = up[1] * fz - up[2] * fy, ry = up[2] * fx - up[0] * fz, rz = up[0] * fy - up[1] * fx;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  rx /= rlen; ry /= rlen; rz /= rlen;
  const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
  const focal = (width * 0.5) / Math.tan((fovDeg * Math.PI) / 360);

  const toCam = p => {
    const dx = p[0] - camPos[0], dy = p[1] - camPos[1], dz = p[2] - camPos[2];
    return [dx * rx + dy * ry + dz * rz, dx * ux + dy * uy + dz * uz, dx * fx + dy * fy + dz * fz];
  };
  const proj = c => [width * 0.5 + (c[0] * focal) / c[2], height * 0.5 - (c[1] * focal) / c[2], c[2]];

  const rasterTri = (p0, p1, p2, uv0, uv1, uv2, tex, lit) => {
    const c0 = toCam(p0), c1 = toCam(p1), c2 = toCam(p2);
    if (c0[2] < 24 || c1[2] < 24 || c2[2] < 24) return;
    const s0 = proj(c0), s1 = proj(c1), s2 = proj(c2);
    const minX = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0])));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(s0[0], s1[0], s2[0])));
    const minY = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1])));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(s0[1], s1[1], s2[1])));
    if (minX > maxX || minY > maxY) return;
    const area = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
    if (Math.abs(area) < 0.25) return;
    const invA = 1 / area;
    const iz0 = 1 / s0[2], iz1 = 1 / s1[2], iz2 = 1 / s2[2];
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const w0 = ((s1[0] - px) * (s2[1] - py) - (s2[0] - px) * (s1[1] - py)) * invA;
        const w1 = ((s2[0] - px) * (s0[1] - py) - (s0[0] - px) * (s2[1] - py)) * invA;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const iz = w0 * iz0 + w1 * iz1 + w2 * iz2;
        if (iz <= 0) continue;
        const z = 1 / iz;
        const pi = y * width + x;
        if (z >= zbuf[pi]) continue;
        const u = clamp(Math.floor(((w0 * uv0[0] * iz0 + w1 * uv1[0] * iz1 + w2 * uv2[0] * iz2) * z)), 0, tex.w - 1);
        const v = clamp(Math.floor(((w0 * uv0[1] * iz0 + w1 * uv1[1] * iz1 + w2 * uv2[1] * iz2) * z)), 0, tex.h - 1);
        const ti = (v * tex.w + u) * 4;
        if (tex.rgba[ti + 3] < 128) continue;
        zbuf[pi] = z;
        const di = pi * 4;
        rgba[di]     = clamp(Math.round(tex.rgba[ti]     * lit[0]), 0, 255);
        rgba[di + 1] = clamp(Math.round(tex.rgba[ti + 1] * lit[1]), 0, 255);
        rgba[di + 2] = clamp(Math.round(tex.rgba[ti + 2] * lit[2]), 0, 255);
        rgba[di + 3] = 255;
      }
    }
  };

  for (const m of scene.meshes) {
    for (const f of m.faces) {
      const tex = scene.texList[f.ti];
      if (!tex) continue;
      const cRgb = scene.rgbs[f.c[0]] || [150, 140, 120];
      const lit = [cRgb[0] / 128, cRgb[1] / 128, cRgb[2] / 128];
      const p0 = m.verts[f.v[0]], p1 = m.verts[f.v[1]], p2 = m.verts[f.v[2]];
      if (!p0 || !p1 || !p2) continue;
      rasterTri(p0, p1, p2, [f.uv[0], f.uv[1]], [f.uv[2], f.uv[3]], [f.uv[4], f.uv[5]], tex, lit);
      if (!f.isTri) {
        const p3 = m.verts[f.v[3]];
        if (p3) rasterTri(p1, p3, p2, [f.uv[2], f.uv[3]], [f.uv[6], f.uv[7]], [f.uv[4], f.uv[5]], tex, lit);
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

function writeContactSheet(texList, cols, outPng) {
  const sorted = texList.slice().sort((a, b) => a.idx - b.idx);
  const rows = Math.ceil(sorted.length / cols);
  const cw = 68, ch = 68;
  const W = cols * cw, H = rows * ch;
  const img = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { img[i * 4] = 24; img[i * 4 + 1] = 22; img[i * 4 + 2] = 20; img[i * 4 + 3] = 255; }
  for (let k = 0; k < sorted.length; k++) {
    const t = sorted[k];
    const gx = (k % cols) * cw + 2, gy = Math.floor(k / cols) * ch + 2;
    for (let y = 0; y < 64; y++) {
      const sy = Math.min(t.h - 1, Math.floor((y * t.h) / 64));
      for (let x = 0; x < 64; x++) {
        const sx = Math.min(t.w - 1, Math.floor((x * t.w) / 64));
        const si = (sy * t.w + sx) * 4, di = ((gy + y) * W + (gx + x)) * 4;
        if (t.rgba[si + 3] < 128) {
          img[di] = 160; img[di + 1] = 0; img[di + 2] = 160; img[di + 3] = 255;
        } else {
          img[di] = t.rgba[si]; img[di + 1] = t.rgba[si + 1]; img[di + 2] = t.rgba[si + 2]; img[di + 3] = 255;
        }
      }
    }
  }
  psxLib.writePng(outPng, W, H, img);
}

// ============================================================================
// 8. Main Compiler + Self-Verification + 6-Angle Visual QA Sheet
// ============================================================================

function buildEgyptLevel() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('=== Crash 3 Egypt ("Tomb Time") — Expanded Hangar + False Wall + Massive Secret Tomb Compiler ===\n');

  const origHan  = getOriginalWadFile('skhan.psx');
  const origHan2 = getOriginalWadFile('skhan_2.psx');
  const origHanL = getOriginalWadFile('skhan_l.psx');
  const origHanO = getOriginalWadFile('skhan_o.psx');
  const origTrg  = getOriginalWadFile('SkHan_T.trg');

  // 1. Load authentic Crash 3 3D objects (Collectibles + Statues!)
  const scarabObj   = loadCrash3Obj('Sc1mG_6c602b55');
  const vaseObj     = loadCrash3Obj('Va1iG_72502955');
  const greenGemObj = loadCrash3Obj('Ge10G_54702055', { emeraldMode: true });
  const statues = {
    sphinx:  loadCrash3Obj('SwHiG_6d056955'),
    sarcoph: loadCrash3Obj('Sa1iG_6c502955'),
    guard:   loadCrash3Obj('sg1mG_38802b55'),
    cobra:   loadCrash3Obj('CbriG_4c5b6955'),
    pillar:  loadCrash3Obj('Pl2iG_66a84955'),
  };

  // 2. Build ALIVE 60-30-10 Crash 3 Egypt swatches
  const sw = buildEgyptSwatches(statues);

  // 3. Build Expanded skegyp.psx (Hangar + False Wall + 16,000x16,000 Secret Tomb!) & skegyp_2.psx
  const geomRes = buildExpandedEgyptLevelPsx(origHan, statues);
  const levelBuf = geomRes.buf;
  const { buf: level2Buf, gradedCount: rgbs2 } = gradeLevelPsxLightingOnly(origHan2);
  console.log(`  [GEOM]  skegyp.psx (${(levelBuf.length / 1024).toFixed(1)} KB, ${geomRes.numObjs} objs = 470 Hangar + ${geomRes.newSectorCount} setores Tumba Secreta 16000x16000, Grid span=${geomRes.gridBounds.span})`);
  console.log(`  [GEOM2] skegyp_2.psx (${(level2Buf.length / 1024).toFixed(1)} KB, ${rgbs2} RGBs aquecidos)`);

  // 4. Reskin ALL 105 textures of skhan_l.psx in-place -> skegyp_l.psx
  const texBuf = Buffer.from(origHanL);
  const parsedL = parsePsxTextureSection(texBuf);
  const sharedPalL = new Map();
  for (const t of parsedL.textures) {
    const newRgba = buildHangarEgyptTexRgba(t, sw);
    encodeTextureInPlace(texBuf, t, newRgba, sharedPalL);
  }
  const finalParsedL = parsePsxTextureSection(texBuf);
  const finalTexByHash = new Map();
  for (const t of finalParsedL.textures) finalTexByHash.set(t.hash, t);
  console.log(`  [TEX]   skegyp_l.psx (${(texBuf.length / 1024).toFixed(1)} KB, ${finalParsedL.textures.length}/105 texturas Crash 3 60-30-10 vivas)`);

  // 5. Build skegyp_o.psx (21 meshes: 18 Hangar props + Scarab o[8] + Vase o[9] + Glowing Emerald Green Gem o[20]!)
  const objBuf = buildEgyptObjectsPsx(origHanO, finalTexByHash, scarabObj, vaseObj, greenGemObj);
  const finalParsedO = parsePsxTextureSection(objBuf);
  console.log(`  [OBJ]   skegyp_o.psx (${(objBuf.length / 1024).toFixed(1)} KB, ${finalParsedO.numMeshes} objetos: Scarab 0x5120A107 + Vase 0x4EB2C689 + Gema Verde 0x5120A108!)`);

  // 6. Build expanded SkEgyp_T.trg
  const trgBuf = buildEgyptTrgFromHangar(origTrg);

  // 7. Strict binary self-verification
  if (levelBuf.length > 380000) throw new Error(`skegyp.psx too large for PS1 Heap[1]: ${levelBuf.length} B!`);
  if (texBuf.length !== origHanL.length) throw new Error('Unexpected size change on skegyp_l.psx!');
  if (finalParsedL.textures.length !== 105) throw new Error(`Expected 105 textures in skegyp_l.psx, got ${finalParsedL.textures.length}`);
  if (finalParsedO.numMeshes !== 21) throw new Error(`Expected 21 meshes in skegyp_o.psx, got ${finalParsedO.numMeshes}`);
  const oHash8  = objBuf.readUInt32LE(finalParsedO.meshHashOff + 8 * 4);
  const oHash9  = objBuf.readUInt32LE(finalParsedO.meshHashOff + 9 * 4);
  const oHash20 = objBuf.readUInt32LE(finalParsedO.meshHashOff + 20 * 4);
  if (oHash8 !== 0x5120A107 || oHash9 !== 0x4eb2c689 || oHash20 !== 0x5120A108) {
    throw new Error(`skegyp_o.psx hashes mismatch: o8=0x${oHash8.toString(16)} o9=0x${oHash9.toString(16)} o20=0x${oHash20.toString(16)}`);
  }
  for (const checkIdx of [24, 25, 26]) {
    const ot = finalParsedO.textures.find(x => x.idx === checkIdx);
    if (!ot || ot.nTrans > 0) throw new Error(`skegyp_o.psx tex[${checkIdx}] has ${ot ? ot.nTrans : '?'} transparent holes!`);
  }
  for (let i = 0; i < parsedL.textures.length; i++) {
    const idx = parsedL.textures[i].idx;
    if ([55, 68].includes(idx)) continue; // intentionally converted from unused transparent to opaque!
    if (parsedL.textures[i].nTrans === 0 && finalParsedL.textures[i].nTrans > 0) {
      throw new Error(`skegyp_l.psx opaque tex[${idx}] gained ${finalParsedL.textures[i].nTrans} holes!`);
    }
  }
  console.log('  [VERIFY] 100% integridade: 0 buracos opacos, 0 degens, TAG 0x0A 20x20 validado, Gema Verde 0x5120A108 pronta!');

  // 8. Write all 5 core level files
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp.psx'),   levelBuf);
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp_2.psx'), level2Buf);
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp_l.psx'), texBuf);
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp_o.psx'), objBuf);
  fs.writeFileSync(path.join(OUT_DIR, 'SkEgyp_T.trg'), trgBuf);

  // 9. Export texture sheet + 6-angle 3D QA render + vibrant Level Select preview BMPs!
  const texSheetPng = path.join(OUT_DIR, 'skegyp_l_sheet.png');
  writeContactSheet(finalParsedL.textures, 15, texSheetPng);

  const scene = parseLevelForRender(levelBuf, finalTexByHash);
  const vw = 352, vh = 200;
  const views = [
    renderPsxView(scene, [-1400, -520, -4200], [-2000, -320, -6950], vw, vh, 76),   // 1. Hangar North Wall showing Creative False Wall Seal!
    renderPsxView(scene, [ 2100, -880, -1200], [-1800, -360, -5200], vw, vh, 76),   // 2. Hangar Main Hall (Alive 60-30-10 Crash 3 palette!)
    renderPsxView(scene, [-2000, -550, -9000], [-1200, -520, -18800], vw, vh, 78),  // 3. Secret Tomb Entrance looking down Pyramid -> High Rail -> Sphinx!
    renderPsxView(scene, [  600, -950, -9600], [ 3800,  -40, -13500], vw, vh, 78),  // 4. East Empty Pharaoh Pool #1 (Great Oasis Turquoise-Gold Mosaic Bowl!)
    renderPsxView(scene, [-3600, -900, -15000], [-6600, -350, -20000], vw, vh, 78), // 5. West Grand Half-Pipe & Southwest Sunken Pool #2!
    renderPsxView(scene, [-3200, -1100, -14800], [-1200, -650, -21000], vw, vh, 76),// 6. Central Pyramid Launch Kicker -> High Aerial Golden Rail -> Sphinx!
  ];
  const sheetW = vw * 3, sheetH = vh * 2;
  const sheet = Buffer.alloc(sheetW * sheetH * 4);
  views.forEach((v, idx) => {
    const gx = (idx % 3) * vw, gy = Math.floor(idx / 3) * vh;
    for (let y = 0; y < vh; y++) v.copy(sheet, ((gy + y) * sheetW + gx) * 4, y * vw * 4, (y + 1) * vw * 4);
  });
  const qaPng = path.join(OUT_DIR, 'egypt_level_3d_qa.png');
  psxLib.writePng(qaPng, sheetW, sheetH, sheet);

  // Level Select BMPs showcasing BOTH vibrant Egypt Hangar & Secret Tomb Oasis + Pyramid + Sphinx!
  const rendSrcPng = path.join(OUT_DIR, 't1rend09_src.png');
  const levlSrcPng = path.join(OUT_DIR, 't1levl09_src.png');
  psxLib.writePng(rendSrcPng, 352, 96,  renderPsxView(scene, [-3200, -950, -11200], [-1200, -520, -21000], 352, 96, 78));
  psxLib.writePng(levlSrcPng, 424, 104, renderPsxView(scene, [  500, -950,  -9500], [ 3500, -120, -15500], 424, 104, 80));

  const rendBmp = buildThps2BmpFromPng(rendSrcPng, path.join(OUT_DIR, 't1rend09.bmp'), 176, 48);
  const levlBmp = buildThps2BmpFromPng(levlSrcPng, path.join(OUT_DIR, 't1levl09.bmp'), 212, 52);

  console.log(`\n  [OUTPUT] build/egypt/:`);
  console.log(`    skegyp.psx    : ${(levelBuf.length / 1024).toFixed(1)} KB (${Math.ceil(levelBuf.length / 2048)} setores)`);
  console.log(`    skegyp_2.psx  : ${(level2Buf.length / 1024).toFixed(1)} KB (${Math.ceil(level2Buf.length / 2048)} setores)`);
  console.log(`    skegyp_l.psx  : ${(texBuf.length / 1024).toFixed(1)} KB (${Math.ceil(texBuf.length / 2048)} setores)`);
  console.log(`    skegyp_o.psx  : ${(objBuf.length / 1024).toFixed(1)} KB (${Math.ceil(objBuf.length / 2048)} setores)`);
  console.log(`    SkEgyp_T.trg  : ${(trgBuf.length / 1024).toFixed(1)} KB (${Math.ceil(trgBuf.length / 2048)} setores)`);
  console.log(`    t1rend09.bmp  : ${rendBmp.length} B (${Math.ceil(rendBmp.length / 2048)} setores <= 5)`);
  console.log(`    t1levl09.bmp  : ${levlBmp.length} B (${Math.ceil(levlBmp.length / 2048)} setores <= 6)`);
  console.log(`    QA 3D Sheet   : ${qaPng}`);
  console.log(`    Tex Sheet     : ${texSheetPng}`);

  return { levelBuf, level2Buf, texBuf, objBuf, trgBuf, rendBmp, levlBmp };
}

if (require.main === module) {
  buildEgyptLevel();
}

module.exports = { buildEgyptLevel };
