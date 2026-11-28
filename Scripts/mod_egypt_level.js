#!/usr/bin/env node
'use strict';

/**
 * Crash Bandicoot 3: Warped — "Tomb Time" (Egypt) THPS2 PS1 Level Compiler (Hangar-Geometry Edition)
 *
 * Rebuilds Tomb Time (Level ID 20, Slot 19 right before Create-A-Park) directly on top of
 * Neversoft's 100% battle-tested, watertight The Hangar geometry & collision architecture
 * (`originals_backup` skhan.psx, skhan_2.psx, skhan_l.psx, skhan_o.psx, SkHan_T.trg):
 *
 *   - 100% Watertight Hangar Geometry & Collision:
 *       Every floor, half-pipe, quarter-pipe, spawn roll-in, perimeter wall, glass secret chamber,
 *       wind tunnel, helicopter, plane, and grind rail preserves Neversoft's exact collision
 *       geometry, normals, surfFlags, and TAG 0x0A CWorldGrid — ZERO pass-through anywhere!
 *   - Refined, Muted-Warm Desert Tomb Color Palette (Zero Garish/Neon Colors):
 *       All 105 textures of skhan_l.psx and all 39 textures of skhan_o.psx are reskinned using
 *       authentic extracted Crash 3 Egypt TPAGs (Eg1iT..Eg5iT, Eg1AT), carefully desaturated and
 *       warm-graded to weathered sandstone, aged limestone, dark hammered bronze, and subtle
 *       carved tomb murals — strictly preserving exact dimensions, bpp (4bpp/8bpp), texture hashes,
 *       and bit-for-bit 0x0000 transparency masks on every cutout/glass/rafter/propeller texture!
 *   - Authentic Crash 3 3D Collectibles & Smashables in skegyp_o.psx:
 *       * Mesh o[8] (hash updated -> 0x5120A107): Real Crash 3 Golden Scarab (Sc1mG) for Goal 5 (5x)
 *       * Mesh o[9] (hash kept   -> 0x4EB2C689): Real Crash 3 Pharaoh Vase (Va1iG) scaled to exact
 *         Hangar barrel bounds X[-48..52] Y[-62..63] Z[-49..51] for Goal 4 (5x smashables, 0 floating!)
 *   - Native SkEgyp_T.trg from SkHan_T.trg:
 *       Preserves all 713 nodes, spawns, rails, secret-room triggers, helicopter/glass events,
 *       S-K-A-T-E, cash, 5 Vases, 5 Scarabs, Secret Crystal, and remaps Hangar's 4 career gaps
 *       (2702->4300, 2701->4301, 2709->4302, 2710->4303) cleanly into Tomb Time's [4300..4399] range!
 *   - Fresh 3D-Rendered Level Select Cards (t1rend09.bmp 176x48 & t1levl09.bmp 212x52) +
 *     Multi-Angle 3D QA Sheet + 105-Texture Contact Sheet for visual verification.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const psxLib = require('./psx_skater_lib');

const ROOT = psxLib.rootDir;
const CRASH3_BASE = path.join(ROOT, 'crash_3_psx', 'crash3_thps2_master', '02_extracted_crash3_complete');
const RAW_TPAG_DIR = path.join(CRASH3_BASE, '03_textures_tpag', 'raw_64kb');
const OBJ_DIR = path.join(CRASH3_BASE, '04_models_3d_objects', 'obj');
const BACKUP_DIR = path.join(ROOT, 'originals_backup');
const OUT_DIR = path.join(ROOT, 'build', 'egypt');
const FFMPEG = psxLib.ffmpegExe;

const clamp = psxLib.clamp;
const lerp = psxLib.lerp;
const nsHash = psxLib.nsHash;

// ============================================================================
// 1. Original Hangar Asset Loader (originals_backup/CD.HED + CD.WAD)
// ============================================================================

let _origWadCache = null;
function getOriginalWadFile(name) {
  if (!_origWadCache) {
    const hed = fs.readFileSync(path.join(BACKUP_DIR, 'CD.HED'));
    const wad = fs.readFileSync(path.join(BACKUP_DIR, 'CD.WAD'));
    const byHash = new Map();
    for (let i = 0, off = 0; off + 12 <= hed.length; off += 12, i++) {
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
// 2. Crash 3 Egypt TPAG Extractor & Muted-Warm Desert Tomb Color Grading
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
  if (c16 === 0) return [12, 10, 8];
  const r = ((c16 & 31) << 3) | ((c16 & 31) >> 2);
  const g = (((c16 >> 5) & 31) << 3) | (((c16 >> 5) & 31) >> 2);
  const b = (((c16 >> 10) & 31) << 3) | (((c16 >> 10) & 31) >> 2);
  return [r, g, b];
}

function rgbToAbgr1555(r, g, b, allowZero = false) {
  let r5 = clamp(Math.round(r / 8), 0, 31);
  let g5 = clamp(Math.round(g / 8), 0, 31);
  let b5 = clamp(Math.round(b / 8), 0, 31);
  let c16 = (b5 << 10) | (g5 << 5) | r5;
  if (!allowZero && c16 === 0) c16 = 0x0421; // dark warm charcoal, NEVER transparent 0x0000
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
 * Cohesive, restrained, atmospheric desert-tomb color grading.
 * Eliminates all garish/neon cyan/blue/red/magenta hues and harmonizes every pixel into
 * weathered sandstone, warm limestone, aged bronze, and tomb umber matching Hangar's tonal balance.
 */
function gradeEgyptMuted(rgba, {
  sat = 0.28,           // strong desaturation: 0.20..0.38 keeps authentic warm desert tones without neon!
  tint = [1.08, 0.99, 0.84], // warm sandstone/limestone harmony
  lumScale = 1.0,
  lumBias = 0,
  contrast = 0.92,
  killCool = 0.78,      // suppress loud cyans/blues/greens into warm weathered stone!
  minLum = 18,
  maxLum = 212,
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

    // Suppress loud cool/neon hues (cyan, turquoise, vivid blue, neon magenta) toward neutral stone
    const coolExcess = Math.max(0, b - r, (g + b) * 0.5 - r);
    let localSat = sat;
    if (coolExcess > 18) {
      const k = clamp((coolExcess - 18) / 80, 0, 1) * killCool;
      localSat *= (1 - k);
    }
    // Also tame overly bright reds/oranges so nothing screams neon
    const redExcess = Math.max(0, r - g - 35);
    if (redExcess > 0) {
      localSat *= clamp(1 - (redExcess / 110) * 0.55, 0.12, 1.0);
    }

    r = y0 + (r - y0) * localSat;
    g = y0 + (g - y0) * localSat;
    b = y0 + (b - y0) * localSat;

    // Apply soft contrast around mid-tone (112) & warm sandstone tint
    r = ((r - 112) * contrast + 112) * lumScale * tint[0] + lumBias;
    g = ((g - 112) * contrast + 112) * lumScale * tint[1] + lumBias;
    b = ((b - 112) * contrast + 112) * lumScale * tint[2] + lumBias;

    // Soft luminance clamping for natural PS1 atmospheric depth
    const y1 = 0.299 * r + 0.587 * g + 0.114 * b;
    if (y1 > maxLum && y1 > 1) {
      const s = maxLum / y1;
      r *= s; g *= s; b *= s;
    } else if (y1 < minLum && y1 > 0.1) {
      const s = minLum / y1;
      r = Math.min(255, r * s); g = Math.min(255, g * s); b = Math.min(255, b * s);
    }

    out[i]     = clamp(Math.round(r), 10, 232);
    out[i + 1] = clamp(Math.round(g), 10, 224);
    out[i + 2] = clamp(Math.round(b), 10, 206);
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Blend two equal-size RGBA textures: out = a * (1 - alpha) + b * alpha
 */
function blendRgba(a, b, alpha) {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i += 4) {
    out[i]     = clamp(Math.round(lerp(a[i],     b[i],     alpha)), 10, 240);
    out[i + 1] = clamp(Math.round(lerp(a[i + 1], b[i + 1], alpha)), 10, 240);
    out[i + 2] = clamp(Math.round(lerp(a[i + 2], b[i + 2], alpha)), 10, 240);
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Recolor an original Hangar texture while preserving 100% of its exact 0x0000 alpha mask
 * and subtle architectural shading/detail (ideal for glass panes, grates, rafters, wheels,
 * helicopter/plane details, and transparent cutouts!).
 */
function patinaOriginalPreserveMask(origRgba, {
  tint = [1.06, 0.94, 0.76],
  sat = 0.22,
  lumScale = 0.96,
  lumBias = 4,
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
    out[i]     = clamp(Math.round(r), 10, 224);
    out[i + 1] = clamp(Math.round(g), 10, 214);
    out[i + 2] = clamp(Math.round(b), 10, 196);
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Calm, atmospheric golden-dusk Egyptian desert sky gradient (NOT neon!).
 */
function makeMutedDesertSky(w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    // Soft dusty twilight slate -> warm desert ochre horizon -> muted sand haze
    let r, g, b;
    if (t < 0.55) {
      const u = t / 0.55;
      r = Math.round(lerp(66, 134, u));
      g = Math.round(lerp(72, 122, u));
      b = Math.round(lerp(86, 102, u));
    } else {
      const u = (t - 0.55) / 0.45;
      r = Math.round(lerp(134, 178, u));
      g = Math.round(lerp(122, 152, u));
      b = Math.round(lerp(102, 114, u));
    }
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = 255;
    }
  }
  return out;
}

/**
 * Build cohesive, muted-warm Crash 3 Egypt architectural source swatches (all 64x64 RGBA).
 */
function buildEgyptSwatches() {
  loadTpags();
  const rawFloorSand  = extractTile('Eg1iT', 0, 3, 64, 13, 96, 96, 32, 32, 64, 64);
  const rawRampLime   = extractTile('Eg3iT', 0, 2, 224, 0, 96, 32, 32, 32, 64, 64);
  const rawWallMasonry= extractTile('Eg4iT', 0, 1, 160, 5, 128, 96, 64, 32, 64, 64);
  const rawWallDoor   = extractTile('Eg1iT', 0, 3, 480, 12, 64, 32, 32, 32, 64, 64);
  const rawSandDune   = extractTile('Eg1AT', 0, 2, 288, 0, 0, 32, 32, 32, 64, 64);
  const rawCornice    = extractTile('Eg1AT', 0, 1, 96, 0, 192, 32, 32, 32, 64, 64);
  const rawTrim       = extractTile('Eg1iT', 1, 1, 0, 6, 64, 64, 32, 32, 64, 64);
  const rawPillar     = extractTile('Eg1iT', 0, 0, 480, 10, 128, 32, 64, 64, 64, 64);
  const rawHieroA     = composite2x2(
    extractTile('Eg4iT', 0, 2, 384, 7, 64, 32, 64, 32, 32, 32),
    extractTile('Eg4iT', 0, 2, 32,  7, 0,  96, 64, 32, 32, 32),
    extractTile('Eg4iT', 0, 2, 192, 7, 0,  32, 64, 32, 32, 32),
    extractTile('Eg4iT', 0, 2, 320, 7, 64, 64, 64, 32, 32, 32)
  );
  const rawHieroB     = composite2x2(
    extractTile('Eg4iT', 0, 2, 64,  8, 128, 32, 64, 32, 32, 32),
    extractTile('Eg4iT', 0, 2, 448, 7, 128, 96, 64, 32, 32, 32),
    extractTile('Eg4iT', 0, 2, 256, 7, 64,  96, 64, 32, 32, 32),
    extractTile('Eg4iT', 0, 2, 0,   8, 128, 64, 64, 32, 32, 32)
  );
  const rawPharaoh    = composite2x2(
    extractTile('Eg2iT', 1, 0, 0, 6, 64, 32, 64, 32, 32, 32),
    extractTile('Eg2iT', 1, 0, 0, 6, 64, 64, 64, 32, 32, 32),
    extractTile('Eg2iT', 1, 1, 0, 6, 0,  64, 64, 32, 32, 32),
    extractTile('Eg2iT', 1, 1, 0, 6, 0,  96, 64, 32, 32, 32)
  );
  const rawCortex     = composite2x2(
    extractTile('Eg4iT', 1, 0, 0, 3, 64, 64, 64, 32, 32, 32),
    extractTile('Eg4iT', 1, 0, 0, 2, 0,  32, 64, 32, 32, 32),
    extractTile('Eg1iT', 1, 0, 0, 9, 0,  32, 64, 32, 32, 32),
    extractTile('Eg3iT', 1, 0, 0, 5, 64, 32, 64, 32, 32, 32)
  );

  // Every swatch is strictly graded to a calm, cohesive, muted-warm desert tomb palette!
  const floorStone   = gradeEgyptMuted(rawFloorSand,   { sat: 0.22, tint: [1.06, 0.98, 0.84], lumScale: 0.95, contrast: 0.80, maxLum: 170 });
  const floorLight   = gradeEgyptMuted(rawFloorSand,   { sat: 0.20, tint: [1.07, 1.00, 0.87], lumScale: 1.06, contrast: 0.76, maxLum: 186 });
  const floorDark    = gradeEgyptMuted(rawFloorSand,   { sat: 0.20, tint: [1.04, 0.95, 0.81], lumScale: 0.82, contrast: 0.82, maxLum: 148 });
  const rampBase     = gradeEgyptMuted(rawRampLime,    { sat: 0.24, tint: [1.09, 1.00, 0.83], lumScale: 1.04, contrast: 0.82, maxLum: 186 });
  const rampWarm     = gradeEgyptMuted(rawRampLime,    { sat: 0.26, tint: [1.11, 0.99, 0.80], lumScale: 0.96, contrast: 0.84, maxLum: 176 });
  const wallRaw      = gradeEgyptMuted(rawWallMasonry, { sat: 0.20, tint: [1.06, 0.96, 0.82], lumScale: 0.96, contrast: 0.72, maxLum: 164, minLum: 48 });
  const wallMasonry  = blendRgba(wallRaw, floorStone, 0.42); // clean weathered sandstone ashlar without harsh dark stripes!
  const wallDark     = gradeEgyptMuted(wallMasonry,    { sat: 0.18, tint: [1.04, 0.94, 0.80], lumScale: 0.78, contrast: 0.86, maxLum: 138, minLum: 36 });
  const wallPanel    = gradeEgyptMuted(rawWallDoor,    { sat: 0.22, tint: [1.07, 0.96, 0.80], lumScale: 0.88, contrast: 0.82, maxLum: 158 });
  const pillarStone  = gradeEgyptMuted(rawPillar,      { sat: 0.18, tint: [1.05, 0.96, 0.82], lumScale: 0.90, contrast: 0.80, maxLum: 164 });
  const corniceBand  = gradeEgyptMuted(rawCornice,     { sat: 0.22, tint: [1.07, 0.96, 0.80], lumScale: 0.88, contrast: 0.82, maxLum: 158 });
  const bronzeTrim   = gradeEgyptMuted(rawTrim,        { sat: 0.24, tint: [1.08, 0.94, 0.72], lumScale: 0.80, contrast: 0.82, maxLum: 148 });
  const desertSand   = gradeEgyptMuted(rawSandDune,    { sat: 0.22, tint: [1.08, 1.00, 0.85], lumScale: 1.06, contrast: 0.74, maxLum: 190 });
  const hieroCarvedA = gradeEgyptMuted(rawHieroA,      { sat: 0.18, tint: [1.07, 0.98, 0.83], lumScale: 0.92, contrast: 0.82, maxLum: 168 });
  const hieroCarvedB = gradeEgyptMuted(rawHieroB,      { sat: 0.18, tint: [1.07, 0.97, 0.81], lumScale: 0.90, contrast: 0.82, maxLum: 166 });
  const pharaohCarv  = gradeEgyptMuted(rawPharaoh,     { sat: 0.22, tint: [1.07, 0.97, 0.82], lumScale: 0.90, contrast: 0.84, maxLum: 166 });
  const cortexCarv   = gradeEgyptMuted(rawCortex,      { sat: 0.24, tint: [1.07, 0.97, 0.82], lumScale: 0.90, contrast: 0.84, maxLum: 166 });

  // Soft weathered blend variants for Hangar concrete/wall/ramp nuance
  const wallWeathered = blendRgba(wallMasonry, floorStone, 0.35);
  const rampStone     = blendRgba(rampBase, floorLight, 0.28); // subtle sandstone texture on half-pipe & QPs!
  const rampWeathered = blendRgba(rampBase, wallWeathered, 0.32);
  const cartoucheA    = blendRgba(hieroCarvedA, wallPanel, 0.35);
  const cartoucheB    = blendRgba(hieroCarvedB, bronzeTrim, 0.30);

  return {
    floorStone, floorLight, floorDark,
    rampStone, rampWarm, rampWeathered,
    wallMasonry, wallDark, wallPanel, wallWeathered,
    pillarStone, corniceBand, bronzeTrim, desertSand,
    hieroCarvedA, hieroCarvedB, pharaohCarv, cortexCarv,
    cartoucheA, cartoucheB,
  };
}

// ============================================================================
// 3. PSX Texture Pack Parser & In-Place Reskinner (Exact w/h, bpp, Hashes, Alpha!)
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

/**
 * Quantize RGBA (with optional alpha=0 transparent pixels!) into an exact 4bpp (16-color)
 * or 8bpp (256-color) PS1 CLUT + indexed pixel block written directly back into `buf`!
 * Strictly preserves Neversoft's EXACT original transparency key (0x0000 OR 0x7C1F magenta)!
 */
function encodeTextureInPlace(buf, tex, newRgba, sharedPalWritten) {
  const { off, is4, palId, palOff, w, h, stride } = tex;
  const transKey = tex.transKey !== undefined ? tex.transKey : 0x0000;
  const maxColors = is4 ? 16 : 256;
  let hasTrans = false;
  const opaquePixels = [];
  for (let i = 0; i < w * h; i++) {
    if (newRgba[i * 4 + 3] < 128) {
      hasTrans = true;
    } else {
      opaquePixels.push([newRgba[i * 4], newRgba[i * 4 + 1], newRgba[i * 4 + 2]]);
    }
  }

  let paletteRgb; // array of [r,g,b] for each index (index 0 = transKey if hasTrans)
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
    const colors = psxLib.medianCutPalette(sample.length ? sample : [[128, 114, 92]], budget);

    paletteRgb = new Array(maxColors).fill(null);
    if (hasTrans) {
      buf.writeUInt16LE(transKey, palOff);
      paletteRgb[0] = null;
    }
    for (let c = startSlot; c < maxColors; c++) {
      const col = colors[Math.min(c - startSlot, colors.length - 1)] || [128, 114, 92];
      let c16 = rgbToAbgr1555(col[0], col[1], col[2], false);
      if ((c16 & 0x7FFF) === 0x7C1F) c16 = 0x781E; // never collide opaque color with magenta key!
      buf.writeUInt16LE(c16, palOff + c * 2);
      paletteRgb[c] = abgr1555ToRgb(c16);
    }
    sharedPalWritten.set(palId, true);
  }

  // Nearest-color index mapping (with subtle ordered Bayer dithering for smooth PS1 sandstone!)
  const BAYER = [
    [-4,  2, -2,  4],
    [ 3, -1,  1, -3],
    [-2,  4, -4,  2],
    [ 1, -3,  3, -1],
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
        const r = clamp(newRgba[si] + d, 0, 255);
        const g = clamp(newRgba[si + 1] + d, 0, 255);
        const b = clamp(newRgba[si + 2] + d, 0, 255);
        ci = findNearest(r, g, b);
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
 * Decide the exact muted-warm Egyptian Tomb replacement RGBA for each Hangar texture idx (0..104).
 */
function buildHangarEgyptTexRgba(tex, sw) {
  const { idx, w, h, nTrans, rgba: origRgba } = tex;
  const sz = src => resizeRgba(src, 64, 64, w, h);

  // Special transparent texture #99 ("U.S. ARMY" stencil) -> replace with subtle carved hieroglyph border (keep crisp cutout!)
  if (idx === 99) {
    const out = Buffer.alloc(w * h * 4);
    const hTex = sz(sw.bronzeTrim);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const di = (y * w + x) * 4;
        const band = (y >= 3 && y <= h - 4) && (((x >> 2) % 3) !== 0 || y === 4 || y === h - 5);
        if (band) {
          out[di] = hTex[di]; out[di + 1] = hTex[di + 1]; out[di + 2] = hTex[di + 2]; out[di + 3] = 255;
        } else {
          out[di] = 0; out[di + 1] = 0; out[di + 2] = 0; out[di + 3] = 0;
        }
      }
    }
    return out;
  }

  // Replace opaque/nearly-opaque Hangar US posters (#43 US Flag, #78 Air Force Star, #94 Bluetorch) BEFORE alpha-cutout check!
  if ([43, 94].includes(idx)) return sz(sw.cortexCarv); // Subtle Dr. Cortex Pharaoh stone bas-relief!
  if (idx === 78) return sz(sw.bronzeTrim); // Patinated bronze temple panel (no US Air Force star!)

  // Textures with genuine 0x0000 or 0x7C1F alpha cutouts (grates, glass, crossbeams, decals, heli/plane cutouts):
  // Preserve 100% of original alpha silhouettes while patinating into weathered bronze / amber sandstone!
  if (nTrans > 0) {
    // Graffiti decals (#18, #60, #86) -> muted carved ochre/sandstone tomb markings (no pink/blue graffiti!)
    if (idx === 18 || idx === 60 || idx === 86) {
      return patinaOriginalPreserveMask(origRgba, {
        tint: [1.06, 0.90, 0.66], sat: 0.14, lumScale: 0.78, lumBias: 16,
        overlayRgba: sz(sw.hieroCarvedA), overlayMix: 0.55,
      });
    }
    // Glass fracture & transparent window panes (#32, #35, #51, #52, #53, #93) -> warm dusty amber crystal glass
    if ([32, 35, 51, 52, 53, 93].includes(idx)) {
      return patinaOriginalPreserveMask(origRgba, {
        tint: [1.10, 0.98, 0.76], sat: 0.16, lumScale: 0.96, lumBias: 10,
      });
    }
    // Rafters, fences, chains, plane/heli silhouettes, wheels -> weathered antique bronze & dark cedar
    return patinaOriginalPreserveMask(origRgba, {
      tint: [1.08, 0.94, 0.74], sat: 0.18, lumScale: 0.92, lumBias: 6,
    });
  }

  // --- OPAQUE TEXTURE CATEGORIES (ALL 0x0000-FREE, MUTED WARM DESERT TOMB PALETTE!) ---

  // 1. Exterior Sky & Snow (#61, #64, #67) -> Muted dusk desert sky & soft desert sand
  if (idx === 64) return makeMutedDesertSky(w, h);
  if (idx === 61 || idx === 67) return sz(sw.desertSand);

  // 2. Concrete Skating Floors & Pads (#23, 24, 25, 26, 27, 48, 49, 50, 65, 66, 85)
  if ([23, 25, 26, 48, 49, 66, 85].includes(idx)) return sz(sw.floorStone);
  if ([24, 65].includes(idx)) return sz(sw.floorLight);
  if ([27, 50].includes(idx)) return sz(sw.floorDark);

  // 3. Half-Pipe & Quarter-Pipe Ramps (Hangar plywood #1, 13, 15, 17, 34, 44)
  //    Warm smooth dressed limestone — clearly distinct from dusty floor so skating transitions read cleanly!
  if ([1, 15, 17, 44].includes(idx)) return sz(sw.rampStone);
  if ([13, 34].includes(idx)) return sz(sw.rampWeathered);

  // 4. Hangar Posters, Military Signs & Sponsor Banners -> Weathered Carved Egyptian Tomb Murals & Hieroglyphs!
  if ([4, 5, 11, 69].includes(idx)) return sz(sw.hieroCarvedA);
  if ([12, 77].includes(idx)) return sz(sw.hieroCarvedB);
  if ([33, 42].includes(idx)) return sz(sw.pharaohCarv);
  if ([43, 94].includes(idx)) return sz(sw.cortexCarv); // Subtle Dr. Cortex Pharaoh stone bas-relief Easter Egg!
  if ([57, 58, 59].includes(idx)) return sz(idx === 58 ? sw.cartoucheB : sw.cartoucheA);
  if ([6, 28].includes(idx)) return sz(sw.rampWarm);

  // 5. Walls, Siding, Columns, Trusses, Steel Framing & Ceiling
  if ([7, 19, 20, 21, 22, 29, 30, 31, 45, 95].includes(idx)) return sz(sw.wallMasonry);
  if ([0, 2, 8, 9, 70, 88, 90].includes(idx)) return sz(sw.wallDark);
  if ([3, 16, 46, 47, 72, 74, 75].includes(idx)) return sz(sw.wallWeathered);
  if ([63, 89].includes(idx)) return sz(sw.wallPanel);

  // 6. Helicopter & Biplane Surfaces (#14, 36, 37, 41, 78, 80, 91, 96, 98, 100) -> Patinated Antique Bronze Craft!
  if ([14, 36, 37, 41, 78, 80, 91, 96, 98, 100].includes(idx)) {
    return patinaOriginalPreserveMask(origRgba, {
      tint: [1.10, 0.94, 0.72], sat: 0.20, lumScale: 0.90, lumBias: 8,
      overlayRgba: sz(sw.bronzeTrim), overlayMix: 0.25,
    });
  }

  // Fallback for any other opaque detail texture: warm sandstone patina preserving original detail!
  return patinaOriginalPreserveMask(origRgba, {
    tint: [1.08, 0.96, 0.78], sat: 0.20, lumScale: 0.92, lumBias: 6,
  });
}

// ============================================================================
// 4. Warm-Sandstone RGBs Vertex Lighting Grade (skegyp.psx & skegyp_2.psx)
// ============================================================================

function gradeLevelPsxLighting(origBuf) {
  const buf = Buffer.from(origBuf);
  const metaOff = buf.readUInt32LE(4);
  let mp = metaOff;
  let gradedCount = 0;
  while (mp + 4 <= buf.length) {
    const tag = buf.readUInt32LE(mp);
    if (tag === 0xFFFFFFFF) break;
    const len = buf.readUInt32LE(mp + 4);
    if (tag === 0x73424752) { // 'RGBs'
      const n = len >> 2;
      for (let i = 0; i < n; i++) {
        const o = mp + 8 + i * 4;
        const r = buf[o], g = buf[o + 1], b = buf[o + 2];
        // Subtle warm torchlit sandstone grade — preserves Hangar's baked depth & shadows without oversaturation!
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        const nr = clamp(Math.round((y + (r - y) * 0.45) * 1.07 + 4), 16, 212);
        const ng = clamp(Math.round((y + (g - y) * 0.45) * 0.99 + 2), 16, 200);
        const nb = clamp(Math.round((y + (b - y) * 0.45) * 0.87),     14, 180);
        buf[o] = nr; buf[o + 1] = ng; buf[o + 2] = nb;
      }
      gradedCount = n;
    }
    mp += 8 + len;
  }
  return { buf, gradedCount };
}

// ============================================================================
// 5. Crash 3 3D .OBJ Loader & skegyp_o.psx Builder (Scarab o[8] + Vase o[9]!)
// ============================================================================

function loadCrash3Obj(dirName) {
  const fullDir = path.join(OBJ_DIR, dirName);
  const files = fs.readdirSync(fullDir);
  const objPath = path.join(fullDir, files.find(f => f.endsWith('.obj')));
  const pngPath = path.join(fullDir, files.find(f => f.endsWith('.png')));
  const texW = 64, texH = 64;
  const rawRgba = psxLib.loadRgba(pngPath, texW, texH);
  // Force opaque alpha=255 on all 3D OBJ texels so opaque models NEVER get 0x0000 transparent holes!
  for (let i = 0; i < texW * texH; i++) {
    rawRgba[i * 4 + 3] = 255;
    if (rawRgba[i * 4] < 10 && rawRgba[i * 4 + 1] < 10 && rawRgba[i * 4 + 2] < 10) {
      rawRgba[i * 4] = 24; rawRgba[i * 4 + 1] = 20; rawRgba[i * 4 + 2] = 16;
    }
  }
  // Subtle muted-warm harmony for Scarab & Vase so they belong naturally in the tomb!
  const rgba = gradeEgyptMuted(rawRgba, {
    sat: 0.52,
    tint: [1.08, 0.99, 0.82],
    lumScale: 1.04,
    contrast: 0.95,
    killCool: 0.35,
    minLum: 22,
    maxLum: 220,
  });

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

/**
 * Compile a Crash 3 .OBJ into a native Neversoft PSX mesh binary chunk (matching skhan_o.psx format).
 * Fits precisely into `targetBox = { xmin, xmax, ymin, ymax, zmin, zmax }` (PS1 coords: -Y = UP!).
 */
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
  // Seat bottom cleanly on targetBox.ymax (remember in PS1 Y grows DOWNWARD -> ymax is floor!)
  const verts = [];
  let xmin = 32767, xmax = -32768, ymin = 32767, ymax = -32768, zmin = 32767, zmax = -32768;
  for (const v of obj.verts) {
    const px = Math.round(tcx + (v[0] - cx) * uniformScale);
    // OBJ +Y is UP, PS1 -Y is UP -> bottom (v[1] == b.minY) maps exactly to targetBox.ymax!
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
      const u = clamp(Math.round(uvt[0] * 63), 0, 63);
      const v = clamp(Math.round((1 - uvt[1]) * 63), 0, 63);
      return [u, v];
    };
    const [u0, v0] = uv(0), [u1, v1] = uv(1), [u2, v2] = uv(2);
    // Double-sided triangle (or outward-wound): emit standard fl=0x1013 (28 B, textured triangle)
    // Remember PS1 OBJ +Y flip inverts handedness -> swap i1/i2 so front face points OUTWARD!
    faces.push({ i0, i1: i2, i2: i1, u0, v0, u1: u2, v1: v2, u2: u1, v2: v1, ni });
  }

  let radius = 0;
  for (const v of verts) radius = Math.max(radius, Math.ceil(Math.hypot(v[0], v[1], v[2])));

  // Binary layout: 28-byte header + verts*8 + norms*8 + faces*28
  const totalBytes = 28 + verts.length * 8 + norms.length * 8 + faces.length * 28;
  const out = Buffer.alloc(totalBytes);
  let p = 0;
  out.writeUInt16LE(0x0008, p); p += 2; // flags (same as skhan_o.psx o[8]/o[9])
  out.writeUInt16LE(verts.length, p); p += 2;
  out.writeUInt16LE(norms.length, p); p += 2;
  out.writeUInt16LE(faces.length, p); p += 2;
  out.writeUInt32LE(radius, p); p += 4;
  out.writeInt16LE(xmax, p); p += 2;
  out.writeInt16LE(xmin, p); p += 2;
  out.writeInt16LE(ymax, p); p += 2;
  out.writeInt16LE(ymin, p); p += 2;
  out.writeInt16LE(zmax, p); p += 2;
  out.writeInt16LE(zmin, p); p += 2;
  out.writeUInt32LE(0, p); p += 4;

  for (const v of verts) {
    out.writeInt16LE(v[0], p); out.writeInt16LE(v[1], p + 2); out.writeInt16LE(v[2], p + 4); out.writeUInt16LE(0, p + 6);
    p += 8;
  }
  for (const n of norms) {
    out.writeInt16LE(n[0], p); out.writeInt16LE(n[1], p + 2); out.writeInt16LE(n[2], p + 4); out.writeUInt16LE(0, p + 6);
    p += 8;
  }
  for (const f of faces) {
    out.writeUInt16LE(0x1013, p);     // fl = textured Gouraud tri (matching skhan_o o[9] poly[0]!)
    out.writeUInt16LE(28, p + 2);     // sz = 28 bytes
    out[p + 4] = f.i0; out[p + 5] = f.i1; out[p + 6] = f.i2; out[p + 7] = 0;
    out[p + 8] = colorIdx; out[p + 9] = colorIdx; out[p + 10] = colorIdx; out[p + 11] = colorIdx;
    out.writeUInt16LE(f.ni, p + 12);
    out.writeUInt16LE(0x0001, p + 14); // sf (matches skhan_o barrel/collectible!)
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
 * Rebuild skegyp_o.psx from originals_backup skhan_o.psx:
 *   - Keeps ALL 20 object slots & 18 solid Hangar structures intact (glass panes, helicopter, plane, fans, doors)
 *   - Replaces o[8] (Pilot Wings) with Real Crash 3 Golden Scarab (Sc1mG) + hash 0x5120A107
 *   - Replaces o[9] (Smashable Barrels) with Real Crash 3 Pharaoh Vase (Va1iG) + hash 0x4EB2C689 (exact floor bounds!)
 *   - Reskins all 39 object textures into cohesive muted-warm Egyptian sandstone / antique bronze + Scarab + Vase!
 */
function buildEgyptObjectsPsx(origObjBuf, levelTexByHash, sw, scarabObj, vaseObj) {
  const metaOff = origObjBuf.readUInt32LE(4);
  const numObjs = origObjBuf.readUInt32LE(8);
  const headerAndObjsEnd = 12 + numObjs * 36;
  const numMeshes = origObjBuf.readUInt32LE(headerAndObjsEnd);
  const origMeshOffs = [];
  for (let i = 0; i < numMeshes; i++) origMeshOffs.push(origObjBuf.readUInt32LE(headerAndObjsEnd + 4 + i * 4));
  const meshDataStart = headerAndObjsEnd + 4 + numMeshes * 4;

  // Find brightest warm-neutral entry in skhan_o.psx RGBs chunk (for clean Scarab & Vase shading)
  const metaTail = Buffer.from(origObjBuf.subarray(metaOff));
  let bestBrightIdx = 0;
  let mp = 0;
  while (mp + 4 <= metaTail.length) {
    const tag = metaTail.readUInt32LE(mp);
    if (tag === 0xFFFFFFFF) { mp += 4; break; }
    const len = metaTail.readUInt32LE(mp + 4);
    if (tag === 0x73424752) {
      const n = len >> 2;
      let bestLum = -1;
      for (let i = 0; i < n; i++) {
        const o = mp + 8 + i * 4;
        const r = metaTail[o], g = metaTail[o + 1], b = metaTail[o + 2];
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        const nr = clamp(Math.round((y + (r - y) * 0.45) * 1.07 + 4), 16, 212);
        const ng = clamp(Math.round((y + (g - y) * 0.45) * 0.99 + 2), 16, 200);
        const nb = clamp(Math.round((y + (b - y) * 0.45) * 0.87),     14, 180);
        metaTail[o] = nr; metaTail[o + 1] = ng; metaTail[o + 2] = nb;
        if (y > bestLum) { bestLum = y; bestBrightIdx = i; }
      }
    }
    mp += 8 + len;
  }

  // Update meshHashes[8] from 0xd0c4f2da -> 0x5120A107 (Tomb Time Goal 5: 5 Escaravelhos Reais!)
  const oldHash8 = metaTail.readUInt32LE(mp + 8 * 4);
  if (oldHash8 !== 0xd0c4f2da) throw new Error(`Unexpected skhan_o mesh[8] hash: 0x${oldHash8.toString(16)}`);
  metaTail.writeUInt32LE(0x5120A107 >>> 0, mp + 8 * 4);

  // Compile replacement meshes for o[8] (Scarab) and o[9] (Pharaoh Vase seated flush on Hangar barrel bounds!)
  const scarabMesh = compileCrash3ObjToPsxMesh(
    scarabObj,
    { xmin: -68, xmax: 68, ymin: -72, ymax: 18, zmin: -56, zmax: 56 },
    24, // o[8] Pilot Wings 64x64 texture slot
    bestBrightIdx
  );
  const vaseMesh = compileCrash3ObjToPsxMesh(
    vaseObj,
    { xmin: -48, xmax: 52, ymin: -62, ymax: 63, zmin: -49, zmax: 51 }, // EXACT Hangar barrel floor bounds!
    26, // o[9] Barrel Side 64x64 texture slot
    bestBrightIdx
  );

  // Reassemble mesh table + mesh chunks (4-byte aligned) + metaTail with adjusted offsets!
  const meshChunks = [];
  for (let i = 0; i < numMeshes; i++) {
    if (i === 8) {
      meshChunks.push(scarabMesh);
    } else if (i === 9) {
      meshChunks.push(vaseMesh);
    } else {
      const start = origMeshOffs[i];
      const end = (i + 1 < numMeshes) ? origMeshOffs[i + 1] : metaOff;
      meshChunks.push(Buffer.from(origObjBuf.subarray(start, end)));
    }
  }

  const newMeshOffs = [];
  let curOff = meshDataStart;
  for (const ch of meshChunks) {
    newMeshOffs.push(curOff);
    curOff += ch.length;
    if (curOff & 3) curOff = (curOff + 3) & ~3;
  }
  const newMetaOff = curOff;
  const metaDelta = newMetaOff - metaOff;

  // Adjust internal texture offsets inside metaTail (all texOffs are absolute file offsets!)
  let tp = mp + numMeshes * 4;
  const numTexRefs = metaTail.readUInt32LE(tp); tp += 4 + numTexRefs * 4;
  const nPal4 = metaTail.readUInt32LE(tp); tp += 4 + nPal4 * 36;
  const nPal8 = metaTail.readUInt32LE(tp); tp += 4 + nPal8 * 516;
  const nTex = metaTail.readUInt32LE(tp); tp += 4;
  for (let i = 0; i < nTex; i++) {
    const oldTexOff = metaTail.readUInt32LE(tp + i * 4);
    metaTail.writeUInt32LE((oldTexOff + metaDelta) >>> 0, tp + i * 4);
  }

  const outBuf = Buffer.alloc(newMetaOff + metaTail.length);
  origObjBuf.copy(outBuf, 0, 0, headerAndObjsEnd + 4);
  outBuf.writeUInt32LE(newMetaOff >>> 0, 4);
  for (let i = 0; i < numMeshes; i++) outBuf.writeUInt32LE(newMeshOffs[i] >>> 0, headerAndObjsEnd + 4 + i * 4);
  for (let i = 0; i < numMeshes; i++) meshChunks[i].copy(outBuf, newMeshOffs[i]);
  metaTail.copy(outBuf, newMetaOff);

  // Reskin ALL 39 textures inside skegyp_o.psx!
  const parsedO = parsePsxTextureSection(outBuf);
  const sharedPal = new Map();
  for (const t of parsedO.textures) {
    let rgba;
    if (t.idx === 24) {
      // Slot 24: Real Crash 3 Golden Scarab (Sc1mG)!
      rgba = resizeRgba(scarabObj.rgba, scarabObj.texW, scarabObj.texH, t.w, t.h);
    } else if (t.idx === 26 || t.idx === 25) {
      // Slot 25/26: Real Crash 3 Pharaoh Vase (Va1iG)!
      rgba = resizeRgba(vaseObj.rgba, vaseObj.texW, vaseObj.texH, t.w, t.h);
    } else if (levelTexByHash.has(t.hash)) {
      // Shared with skegyp_l.psx -> exact matching Egyptian Tomb texture!
      const lt = levelTexByHash.get(t.hash);
      rgba = resizeRgba(lt.rgba, lt.w, lt.h, t.w, t.h);
    } else {
      // Object-only texture -> cohesive weathered bronze / amber glass / sandstone preserving alpha mask!
      rgba = patinaOriginalPreserveMask(t.rgba, {
        tint: [1.09, 0.94, 0.72], sat: 0.20, lumScale: 0.92, lumBias: 8,
      });
    }
    encodeTextureInPlace(outBuf, t, rgba, sharedPal);
  }
  return outBuf;
}

// ============================================================================
// 6. Native SkEgyp_T.trg Builder (from originals_backup SkHan_T.trg)
// ============================================================================

function buildEgyptTrgFromHangar(origTrg) {
  const numNodes = origTrg.readUInt32LE(8);
  const origOffs = [];
  for (let i = 0; i < numNodes; i++) origOffs.push(origTrg.readUInt32LE(12 + i * 4));

  // Hangar career gap ID remapping -> Tomb Time [4300..4399]:
  //   2702 [HALFPIPE GRIND]    (gt=2) -> 4300 [GRIND DO FARAO]
  //   2701 [HALFPIPE HANGTIME] (gt=1) -> 4301 [VOO DO HALFPIPE]
  //   2709 [WINGTIP HANGTIME]  (gt=1) -> 4302 [VOO DA ESFINGE]
  //   2710 [SKYCRANE HANGTIME] (gt=1) -> 4303 [SALTO DA TUMBA]
  //   All other Hangar gaps (2700, 2703..2721) -> 4304..4325
  const GAP_REMAP = new Map([
    [2702, 4300],
    [2701, 4301],
    [2709, 4302],
    [2710, 4303],
    [2700, 4304],
    [2703, 4305], [2704, 4306], [2705, 4307], [2706, 4308], [2707, 4309],
    [2708, 4310], [2711, 4311], [2712, 4312], [2713, 4313], [2714, 4314],
    [2716, 4316], [2717, 4317], [2718, 4318], [2719, 4319], [2720, 4320],
    [2721, 4321],
  ]);

  // Helper: replace an even-padded NUL-terminated ASCII string inside a node buffer
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

  const newNodes = [];
  let strPatched = 0, gapPatched = 0;

  for (let i = 0; i < numNodes; i++) {
    const start = origOffs[i];
    const end = (i + 1 < numNodes) ? origOffs[i + 1] : origTrg.length;
    let nb = Buffer.from(origTrg.subarray(start, end));
    const type = nb.readUInt16LE(0);

    // 1. Replace asset filenames in Type 4 (AutoExec), Type 15 (AutoExec2P), and Type 8 (Restart)
    if (type === 4 || type === 8 || type === 15) {
      for (const [pat, rep] of replacements) {
        let searchFrom = 0;
        while (true) {
          const idx = nb.indexOf(pat, searchFrom);
          if (idx < 0) break;
          // Ensure match starts on an even bytecode boundary (all TRG opcodes/strings are 2-byte aligned!)
          if ((idx & 1) !== 0) { searchFrom = idx + 1; continue; }
          nb = Buffer.concat([nb.subarray(0, idx), rep, nb.subarray(idx + pat.length)]);
          searchFrom = idx + rep.length;
          strPatched++;
        }
      }
    }

    // 2. Remap Hangar EndGap (opcode 0x00C9 = 201) IDs into Tomb Time [4300..4321]
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
    }

    // Preserve 2-byte alignment between nodes
    if (nb.length & 1) nb = Buffer.concat([nb, Buffer.from([0])]);
    newNodes.push(nb);
  }

  const hdrSize = 12 + numNodes * 4;
  let totalLen = hdrSize;
  const newOffs = [];
  for (const nb of newNodes) { newOffs.push(totalLen); totalLen += nb.length; }
  const out = Buffer.alloc(totalLen);
  origTrg.copy(out, 0, 0, 12); // '_TRG', ver 2.0, numNodes
  for (let i = 0; i < numNodes; i++) out.writeUInt32LE(newOffs[i] >>> 0, 12 + i * 4);
  for (let i = 0; i < numNodes; i++) newNodes[i].copy(out, newOffs[i]);

  console.log(`  [TRG]   SkEgyp_T.trg compilado a partir de SkHan_T.trg (${numNodes} nos, ${out.length} B, ${strPatched} refs SkEgyp*, ${gapPatched} EndGaps -> 4300..4321)`);
  return out;
}

// ============================================================================
// 7. Software 3D Textured Renderer of Real PSX Level (for QA Sheet & LevelSel BMPs!)
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
      meshIdx: levelBuf.readUInt16LE(p + 22), // Neversoft 36-byte object header: meshIdx is at +22!
    });
    p += 36;
  }
  const numMeshes = levelBuf.readUInt32LE(p); p += 4;
  const meshOffs = [];
  for (let i = 0; i < numMeshes; i++) { meshOffs.push(levelBuf.readUInt32LE(p)); p += 4; }

  // Read RGBs & texRefs
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
    const h = levelBuf.readUInt32LE(mp); mp += 4;
    texList.push(texByHash.get(h) || null);
  }

  const meshes = [];
  for (const obj of objs) {
    if (obj.meshIdx >= numMeshes) continue;
    let o = meshOffs[obj.meshIdx];
    const nv = levelBuf.readUInt16LE(o + 2);
    const nn = levelBuf.readUInt16LE(o + 4);
    const np = levelBuf.readUInt16LE(o + 6);
    o += 28;
    const verts = [];
    for (let i = 0; i < nv; i++) {
      verts.push([
        obj.x + levelBuf.readInt16LE(o),
        obj.y + levelBuf.readInt16LE(o + 2),
        obj.z + levelBuf.readInt16LE(o + 4),
      ]);
      o += 8;
    }
    o += nn * 8;
    const faces = [];
    for (let i = 0; i < np; i++) {
      const fl = levelBuf.readUInt16LE(o);
      const sz = levelBuf.readUInt16LE(o + 2);
      if ((fl & 0x0080) === 0 && (fl & 0x0001) && sz >= 28) {
        const isTri = (fl & 0x0010) !== 0;
        const v = [levelBuf[o + 4], levelBuf[o + 5], levelBuf[o + 6], levelBuf[o + 7]];
        const c = [levelBuf[o + 8], levelBuf[o + 9], levelBuf[o + 10], levelBuf[o + 11]];
        const ti = levelBuf.readUInt32LE(o + 16);
        const uv = [
          levelBuf[o + 20], levelBuf[o + 21],
          levelBuf[o + 22], levelBuf[o + 23],
          levelBuf[o + 24], levelBuf[o + 25],
          levelBuf[o + 26], levelBuf[o + 27],
        ];
        faces.push({ isTri, v, c, ti, uv });
      }
      o += sz;
    }
    meshes.push({ verts, faces });
  }
  return { meshes, texList, rgbs };
}

function renderPsxView(scene, camPos, lookAt, width, height, fovDeg = 72) {
  const rgba = Buffer.alloc(width * height * 4);
  const zbuf = new Float32Array(width * height).fill(1e9);

  // Warm muted desert dusk background
  for (let y = 0; y < height; y++) {
    const t = y / Math.max(1, height - 1);
    const r = Math.round(lerp(82, 146, t));
    const g = Math.round(lerp(76, 128, t));
    const b = Math.round(lerp(72, 102, t));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }

  // Camera basis (PS1 -Y = UP)
  let fx = lookAt[0] - camPos[0], fy = lookAt[1] - camPos[1], fz = lookAt[2] - camPos[2];
  const flen = Math.hypot(fx, fy, fz) || 1;
  fx /= flen; fy /= flen; fz /= flen;
  const up = [0, -1, 0];
  let rx = up[1] * fz - up[2] * fy;
  let ry = up[2] * fx - up[0] * fz;
  let rz = up[0] * fy - up[1] * fx;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  rx /= rlen; ry /= rlen; rz /= rlen;
  const ux = fy * rz - fz * ry;
  const uy = fz * rx - fx * rz;
  const uz = fx * ry - fy * rx;
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
      const cRgb = scene.rgbs[f.c[0]] || [128, 128, 128];
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
    const gx = (k % cols) * cw + 2;
    const gy = Math.floor(k / cols) * ch + 2;
    for (let y = 0; y < 64; y++) {
      const sy = Math.min(t.h - 1, Math.floor((y * t.h) / 64));
      for (let x = 0; x < 64; x++) {
        const sx = Math.min(t.w - 1, Math.floor((x * t.w) / 64));
        const si = (sy * t.w + sx) * 4;
        const di = ((gy + y) * W + (gx + x)) * 4;
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
// 8. Main Compiler + Self-Verification + Visual QA Sheet
// ============================================================================

function buildEgyptLevel() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('=== Crash 3 Egypt ("Tomb Time") — Hangar-Geometry Watertight Compiler ===\n');

  // 1. Load clean original Hangar level files from originals_backup/CD.WAD
  const origHan  = getOriginalWadFile('skhan.psx');
  const origHan2 = getOriginalWadFile('skhan_2.psx');
  const origHanL = getOriginalWadFile('skhan_l.psx');
  const origHanO = getOriginalWadFile('skhan_o.psx');
  const origTrg  = getOriginalWadFile('SkHan_T.trg');

  // 2. Build cohesive, muted-warm Crash 3 Egypt swatches + load real Crash 3 Scarab & Pharaoh Vase OBJs
  const sw = buildEgyptSwatches();
  const scarabObj = loadCrash3Obj('Sc1mG_6c602b55');
  const vaseObj   = loadCrash3Obj('Va1iG_72502955');

  // 3. Compile skegyp.psx & skegyp_2.psx (100% Hangar geometry & collision + subtle warm tomb RGBs lighting)
  const { buf: levelBuf, gradedCount: rgbs1 }  = gradeLevelPsxLighting(origHan);
  const { buf: level2Buf, gradedCount: rgbs2 } = gradeLevelPsxLighting(origHan2);
  console.log(`  [GEOM]  skegyp.psx (${levelBuf.length} B, 470 setores Hangar, ${rgbs1} RGBs aquecidos) & skegyp_2.psx (${level2Buf.length} B, ${rgbs2} RGBs)`);

  // 4. Reskin ALL 105 textures of skhan_l.psx in-place -> skegyp_l.psx (exact w/h, bpp, hashes & alpha masks!)
  const texBuf = Buffer.from(origHanL);
  const parsedL = parsePsxTextureSection(texBuf);
  const sharedPalL = new Map();
  const levelTexByHash = new Map();
  const sheetListL = [];
  for (const t of parsedL.textures) {
    const newRgba = buildHangarEgyptTexRgba(t, sw);
    encodeTextureInPlace(texBuf, t, newRgba, sharedPalL);
    const decodedEntry = { idx: t.idx, hash: t.hash, w: t.w, h: t.h, rgba: newRgba };
    levelTexByHash.set(t.hash, decodedEntry);
    sheetListL.push(decodedEntry);
  }
  // Re-decode final quantized skegyp_l.psx so QA sheet & 3D render reflect exact 15-bit PS1 CLUT output!
  const finalParsedL = parsePsxTextureSection(texBuf);
  const finalTexByHash = new Map();
  for (const t of finalParsedL.textures) finalTexByHash.set(t.hash, t);
  console.log(`  [TEX]   skegyp_l.psx (${texBuf.length} B, ${finalParsedL.textures.length}/105 texturas Crash 3 Egito em paleta arenito quente)`);

  // 5. Build skegyp_o.psx (18 Hangar solid structures reskinned + real Crash 3 Scarab o[8] + Pharaoh Vase o[9]!)
  const objBuf = buildEgyptObjectsPsx(origHanO, finalTexByHash, sw, scarabObj, vaseObj);
  const finalParsedO = parsePsxTextureSection(objBuf);
  console.log(`  [OBJ]   skegyp_o.psx (${objBuf.length} B, ${finalParsedO.numMeshes} objetos: 18 estruturas Hangar + Scarab 0x5120A107 + Vase 0x4EB2C689)`);

  // 6. Build SkEgyp_T.trg from SkHan_T.trg
  const trgBuf = buildEgyptTrgFromHangar(origTrg);

  // 7. Strict binary self-verification
  if (levelBuf.length !== origHan.length || texBuf.length !== origHanL.length) {
    throw new Error('Unexpected size mismatch on skegyp.psx / skegyp_l.psx!');
  }
  if (finalParsedL.textures.length !== 105) throw new Error(`Expected 105 textures in skegyp_l.psx, got ${finalParsedL.textures.length}`);
  if (finalParsedO.numMeshes !== 20) throw new Error(`Expected 20 meshes in skegyp_o.psx, got ${finalParsedO.numMeshes}`);
  const oHash8 = objBuf.readUInt32LE(finalParsedO.meshHashOff + 8 * 4);
  const oHash9 = objBuf.readUInt32LE(finalParsedO.meshHashOff + 9 * 4);
  if (oHash8 !== 0x5120A107 || oHash9 !== 0x4eb2c689) {
    throw new Error(`skegyp_o.psx collectible hashes mismatch: o8=0x${oHash8.toString(16)} o9=0x${oHash9.toString(16)}`);
  }
  // Verify ZERO 0x0000 opaque holes in Scarab (tex[24]) and Vase (tex[26])!
  for (const checkIdx of [24, 26]) {
    const ot = finalParsedO.textures.find(x => x.idx === checkIdx);
    if (!ot || ot.nTrans > 0) throw new Error(`skegyp_o.psx tex[${checkIdx}] has ${ot ? ot.nTrans : '?'} transparent pixels!`);
  }
  // Verify ZERO opaque textures gained unintended 0x0000 transparent holes in skegyp_l.psx
  for (let i = 0; i < parsedL.textures.length; i++) {
    if (parsedL.textures[i].nTrans === 0 && finalParsedL.textures[i].nTrans > 0) {
      throw new Error(`skegyp_l.psx opaque tex[${parsedL.textures[i].idx}] gained ${finalParsedL.textures[i].nTrans} 0x0000 holes!`);
    }
  }
  console.log('  [VERIFY] 100% integridade verificada: 0 buracos 0x0000 em texturas opacas, 100% geometria/colisao Hangar preservada!');

  // 8. Write all 5 core level files
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp.psx'),   levelBuf);
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp_2.psx'), level2Buf);
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp_l.psx'), texBuf);
  fs.writeFileSync(path.join(OUT_DIR, 'skegyp_o.psx'), objBuf);
  fs.writeFileSync(path.join(OUT_DIR, 'SkEgyp_T.trg'), trgBuf);

  // 9. Export texture sheet + 4-angle 3D QA render + Level Select preview BMPs (t1rend09.bmp & t1levl09.bmp)!
  const texSheetPng = path.join(OUT_DIR, 'skegyp_l_sheet.png');
  writeContactSheet(finalParsedL.textures, 15, texSheetPng);

  const scene = parseLevelForRender(levelBuf, finalTexByHash);
  const vw = 352, vh = 200;
  // Hangar real world coordinates (Spawn is around [-1001, -2154, 2801], main floor around Y=-1600, Z=[-3500..2500])
  // Remember in skhan.psx: obj pos >> 12 -> let's frame 4 iconic views inside Hangar's real hall!
  const views = [
    renderPsxView(scene, [ -900,  -900,   600], [   600,  -350, -3600], vw, vh, 76), // From main floor looking across central Hangar hall & half-pipe!
    renderPsxView(scene, [-3600, -1100, -3500], [  2600,  -450, -3500], vw, vh, 76), // Looking down the iconic central Half-Pipe!
    renderPsxView(scene, [ 2200,  -900, -1200], [ -1800,  -350, -5400], vw, vh, 76), // Looking across half-pipe, ramps & sandstone hieroglyph walls!
    renderPsxView(scene, [ -600, -1200, -6400], [  -600,  -350,   600], vw, vh, 76), // Looking back from far wall across quarter-pipes & roll-in!
  ];
  const sheetW = vw * 2, sheetH = vh * 2;
  const sheet = Buffer.alloc(sheetW * sheetH * 4);
  views.forEach((v, idx) => {
    const gx = (idx % 2) * vw, gy = Math.floor(idx / 2) * vh;
    for (let y = 0; y < vh; y++) v.copy(sheet, ((gy + y) * sheetW + gx) * 4, y * vw * 4, (y + 1) * vw * 4);
  });
  const qaPng = path.join(OUT_DIR, 'egypt_level_3d_qa.png');
  psxLib.writePng(qaPng, sheetW, sheetH, sheet);

  const rendSrcPng = path.join(OUT_DIR, 't1rend09_src.png');
  const levlSrcPng = path.join(OUT_DIR, 't1levl09_src.png');
  psxLib.writePng(rendSrcPng, 352, 96,  renderPsxView(scene, [ 2100,  -880, -1200], [-1800, -360, -5200], 352, 96, 78));
  psxLib.writePng(levlSrcPng, 424, 104, renderPsxView(scene, [-3400, -1080, -3400], [ 2600, -440, -3500], 424, 104, 80));

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
