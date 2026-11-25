#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) — Lulao Collectibles & World Assets v2 Builder
 *
 * Reproducibly derives ALL assets from originals_backup/CD.WAD & fotos_para_coletaveis/
 * with ZERO CD.WAD offset shift and 100% PS1 hardware fidelity:
 *
 *   1. Hangar Barrel (skhan_o.psx WAD[14] & skhan_o2.psx WAD[1109], M[9] 0x4eb2c689):
 *      - Replaces single repeated 64x64 256c body with TWO dedicated 64x64 16-color textures
 *        (IDENTICAL VRAM footprint = 2048 halfwords, NET -416 B smaller file!):
 *          * ti=26 (0xd8113bf8): Front 180 deg — Authentic Pirassununga 51 shield logo
 *          * ti=39 (0x51101a51): Back  180 deg — Surgically cut-out Lulao caricature face
 *      - Keeps crisp "51" stencil on steel lid (ti=25, 0x5734bab8).
 *
 *   2. Dynamic Per-Skater Cash Bills ($100/$50/$250 in ALL levels — build/lulao_cash_art.bin):
 *      - Surgically replaces Tony Hawk's engraved oval portrait inside items.psx T[0..2]
 *        with Lulao's caricature engraved in each bill's EXACT monochrome 16-color palette
 *        ($100 sepia-gold, $50 steel-blue, $250 dollar-green).
 *      - Packed into VOICES.DAT (3 sectors) & stamped in RAM by Hook_PsxUpload ONLY when
 *        playing as Lulao (Slot 2); all other skaters keep original Tony Hawk bills!
 *
 *   3. Secret Tapes in ALL Levels -> 3D Garrafa de Cachaca 51 + Discrete Glowing Golden Aura
 *      (items.psx WAD[8], M[8] 0x7c1b2c4a):
 *      - Sculpted 8-sided 3D lathe bottle (6 rings, yellow "51" cap, clear glass neck/shoulder
 *        with embossed "51", wraparound Pirassununga 51 label from fitas_51.png, heavy glass base)
 *        using ALL 5 exclusive M[8] textures (5,248 B exact, 0 B texture growth -> 80 distinct colors!).
 *      - Surrounded by 3 crossed double-sided PS1 hardware Additive Semi-Transparent (ABR=1,
 *        fl=0x18C3) discrete shimmering golden aura halo planes with pal15[0] = 0x7C1F!
 *
 *   4. School II Hall Passes -> 3D Pacote de Vento Estocado
 *      (sksl2_o.psx WAD[1095] M[4] 0x12f6063f + sksl2_l.psx / sksl2_l2.psx):
 *      - Surgically extracts inflated pouch from vento_estocado.png (removing dashed margins).
 *      - Upgrades exclusive pass texture 0xaadfea6c to 48x64 16c (pal15[0]=0x7C1F) while
 *        shrinking unused key texture 0xcf459305 -> 4x4 (NET -240 B smaller!).
 *      - Sculpted 12v/10f true 3D inflated pillow-pouch (crimped edges at Z=0, puffed belly Z=+-26).
 *
 *   5. School II Golf Cart Driver -> 3D Bolsonaro Doidao Head
 *      (c_kart.psx WAD[1100] M[0] 0x0aaf35e6):
 *      - Surgically cuts out bolsonaro_doidao.png (red backdrop & corner signature removed).
 *      - Upgrades driver face texture ti=10 (0x3dd20ae8) from 32x32 -> 48x52 16c + hair ti=11.
 *      - Replaces security guard head + cap (18 faces) with sculpted watertight 3D low-poly
 *        caricature head connected seamlessly to neck verts V[65..68] within original 10 sectors!
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const psxLib = require('./psx_skater_lib');

const ROOT = psxLib.rootDir;
const BACKUP_DIR = psxLib.backupDir;
const PHOTOS_DIR = path.join(ROOT, 'fotos_para_coletaveis');
const FFMPEG = path.join(ROOT, 'tools', 'bin', 'ffmpeg', 'ffmpeg-9.1-essentials_build', 'bin', 'ffmpeg.exe');
const FFPROBE = path.join(ROOT, 'tools', 'bin', 'ffmpeg', 'ffmpeg-9.1-essentials_build', 'bin', 'ffprobe.exe');

const clamp = psxLib.clamp;
const lerp = psxLib.lerp;

const HASH_BARREL_BDY_FRONT = 0xd8113bf8;
const HASH_BARREL_BDY_BACK  = 0x51101a51;
const HASH_BARREL_LID       = 0x5734bab8;
const HASH_SECRET_TAPE      = 0x7c1b2c4a;
const HASH_HALL_PASS_MESH   = 0x12f6063f;
const HASH_HALL_PASS_TEX    = 0xaadfea6c;
const HASH_HALL_KEY_TEX     = 0xcf459305;
const HASH_KART_MESH        = 0x0aaf35e6;
const HASH_KART_FACE_TEX    = 0x3dd20ae8;
const HASH_KART_HAIR_TEX    = 0x61a0fdad;
const HASH_KART_VISOR_TEX   = 0xf3b04602;

// ============================================================================
// Image I/O, Connected Components, Flood-Fill, Resampling & 4-bit Quantization
// ============================================================================

function loadImageRgba(imgPath) {
  const pr = spawnSync(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', imgPath,
  ], { encoding: 'utf8' });
  if (pr.status !== 0) throw new Error(`ffprobe falhou em ${imgPath}: ${pr.stderr}`);
  const [w, h] = pr.stdout.trim().split(',').map(Number);
  const dec = spawnSync(FFMPEG, [
    '-v', 'error', '-i', imgPath, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
  ], { maxBuffer: 64 * 1024 * 1024 });
  if (dec.status !== 0 || dec.stdout.length !== w * h * 4) {
    throw new Error(`ffmpeg decode falhou em ${imgPath}`);
  }
  return { w, h, rgba: Buffer.from(dec.stdout) };
}

function keepLargestComponent(mask, w, h) {
  const visited = new Uint8Array(w * h);
  let bestCount = 0;
  let bestPixels = null;
  const queue = new Int32Array(w * h);

  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || visited[i]) continue;
    let head = 0, tail = 0;
    queue[tail++] = i;
    visited[i] = 1;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w, y = (p - x) / w;
      if (x > 0) { const n = p - 1; if (mask[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; } }
      if (x + 1 < w) { const n = p + 1; if (mask[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; } }
      if (y > 0) { const n = p - w; if (mask[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; } }
      if (y + 1 < h) { const n = p + w; if (mask[n] && !visited[n]) { visited[n] = 1; queue[tail++] = n; } }
    }
    if (tail > bestCount) {
      bestCount = tail;
      bestPixels = queue.slice(0, tail);
    }
  }
  const out = new Uint8Array(w * h);
  if (bestPixels) for (let i = 0; i < bestPixels.length; i++) out[bestPixels[i]] = 1;
  return out;
}

function floodFillBg(w, h, isBgFn, seeds = null) {
  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const tryPush = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (bg[p] || !isBgFn(x, y, p)) return;
    bg[p] = 1;
    queue[tail++] = p;
  };
  if (seeds) {
    for (const [sx, sy] of seeds) tryPush(sx, sy);
  } else {
    for (let x = 0; x < w; x++) { tryPush(x, 0); tryPush(x, h - 1); }
    for (let y = 0; y < h; y++) { tryPush(0, y); tryPush(w - 1, y); }
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w, y = (p - x) / w;
    tryPush(x - 1, y); tryPush(x + 1, y);
    tryPush(x, y - 1); tryPush(x, y + 1);
  }
  return bg;
}

function maskBBox(mask, w, h) {
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY, bw: maxX - minX + 1, bh: maxY - minY + 1 };
}

function resampleRgbaArea(src, sw, sh, sx0, sy0, sx1, sy1, dw, dh, alphaThreshold = 115) {
  const dst = Buffer.alloc(dw * dh * 4, 0);
  const cw = sx1 - sx0, ch = sy1 - sy0;
  for (let dy = 0; dy < dh; dy++) {
    const fy0 = sy0 + (dy / dh) * ch;
    const fy1 = sy0 + ((dy + 1) / dh) * ch;
    const iy0 = Math.max(0, Math.floor(fy0));
    const iy1 = Math.min(sh - 1, Math.ceil(fy1) - 1);
    for (let dx = 0; dx < dw; dx++) {
      const fx0 = sx0 + (dx / dw) * cw;
      const fx1 = sx0 + ((dx + 1) / dw) * cw;
      const ix0 = Math.max(0, Math.floor(fx0));
      const ix1 = Math.min(sw - 1, Math.ceil(fx1) - 1);
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, wSum = 0;
      for (let sy = iy0; sy <= iy1; sy++) {
        const wy = Math.min(fy1, sy + 1) - Math.max(fy0, sy);
        if (wy <= 0) continue;
        for (let sx = ix0; sx <= ix1; sx++) {
          const wx = Math.min(fx1, sx + 1) - Math.max(fx0, sx);
          if (wx <= 0) continue;
          const wt = wx * wy;
          const o = (sy * sw + sx) * 4;
          const a = src[o + 3] / 255;
          rSum += src[o + 0] * a * wt;
          gSum += src[o + 1] * a * wt;
          bSum += src[o + 2] * a * wt;
          aSum += a * wt;
          wSum += wt;
        }
      }
      const outA = wSum > 0 ? Math.round((aSum / wSum) * 255) : 0;
      const o = (dy * dw + dx) * 4;
      if (alphaThreshold >= 0 && outA < alphaThreshold) {
        dst[o] = 0; dst[o + 1] = 0; dst[o + 2] = 0; dst[o + 3] = 0;
      } else if (aSum > 1e-6) {
        dst[o + 0] = clamp(Math.round(rSum / aSum), 0, 255);
        dst[o + 1] = clamp(Math.round(gSum / aSum), 0, 255);
        dst[o + 2] = clamp(Math.round(bSum / aSum), 0, 255);
        dst[o + 3] = alphaThreshold >= 0 ? 255 : outA;
      }
    }
  }
  return dst;
}

function rgbToPs1Bgr555(r, g, b, avoidMagenta = true) {
  let r5 = clamp(Math.round(r * 31 / 255), 0, 31);
  let g5 = clamp(Math.round(g * 31 / 255), 0, 31);
  let b5 = clamp(Math.round(b * 31 / 255), 0, 31);
  let v = (b5 << 10) | (g5 << 5) | r5;
  if (avoidMagenta && v === 0x7c1f) v = (31 << 10) | (1 << 5) | 31;
  if (avoidMagenta && v === 0x0000) v = (1 << 10) | (1 << 5) | 1;
  return v;
}

function bgr555ToRgb(v) {
  return [
    Math.round((v & 31) * 255 / 31),
    Math.round(((v >> 5) & 31) * 255 / 31),
    Math.round(((v >> 10) & 31) * 255 / 31),
  ];
}

/**
 * High-precision weighted Lloyd k-means 16-color 4-bit PS1 quantizer.
 * When transparentKey0=true, index 0 is reserved strictly for PS1 hardware transparent key 0x7C1F!
 */
function quantize4BitWeighted(rgba, w, h, {
  transparentKey0 = false,
  anchors = [],
  weightFn = null,
  dither = 0.25,
} = {}) {
  const numOpaqueSlots = transparentKey0 ? 15 : 16;
  const startSlot = transparentKey0 ? 1 : 0;

  // Gather weighted opaque samples
  const samples = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (transparentKey0 && rgba[o + 3] < 128) continue;
      const wt = weightFn ? weightFn(x, y, rgba[o], rgba[o + 1], rgba[o + 2]) : 1.0;
      samples.push([rgba[o], rgba[o + 1], rgba[o + 2], wt]);
    }
  }

  // Initialize centroids with anchors + farthest-point k-means++ seeding
  const centroids = [];
  for (const anc of anchors) {
    if (centroids.length < numOpaqueSlots) centroids.push([anc[0], anc[1], anc[2]]);
  }
  if (centroids.length === 0 && samples.length > 0) {
    centroids.push([samples[0][0], samples[0][1], samples[0][2]]);
  }
  while (centroids.length < numOpaqueSlots && samples.length > 0) {
    let bestIdx = 0, bestScore = -1;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      let minD = 1e18;
      for (const c of centroids) {
        const dr = s[0] - c[0], dg = s[1] - c[1], db = s[2] - c[2];
        const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
        if (d < minD) minD = d;
      }
      const sc = minD * s[3];
      if (sc > bestScore) { bestScore = sc; bestIdx = i; }
    }
    centroids.push([samples[bestIdx][0], samples[bestIdx][1], samples[bestIdx][2]]);
  }
  while (centroids.length < numOpaqueSlots) centroids.push([128, 128, 128]);

  // 16 iterations of weighted Lloyd k-means (anchors gently preserved via high anchor pull)
  for (let it = 0; it < 16; it++) {
    const accR = new Float64Array(numOpaqueSlots);
    const accG = new Float64Array(numOpaqueSlots);
    const accB = new Float64Array(numOpaqueSlots);
    const accW = new Float64Array(numOpaqueSlots);
    // Keep anchor colors softly anchored so critical accent colors never wash out
    for (let a = 0; a < Math.min(anchors.length, numOpaqueSlots); a++) {
      const aw = anchors[a][3] ?? 14;
      accR[a] += anchors[a][0] * aw;
      accG[a] += anchors[a][1] * aw;
      accB[a] += anchors[a][2] * aw;
      accW[a] += aw;
    }
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      let bi = 0, bd = 1e18;
      for (let c = 0; c < numOpaqueSlots; c++) {
        const dr = s[0] - centroids[c][0], dg = s[1] - centroids[c][1], db = s[2] - centroids[c][2];
        const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bd) { bd = d; bi = c; }
      }
      accR[bi] += s[0] * s[3];
      accG[bi] += s[1] * s[3];
      accB[bi] += s[2] * s[3];
      accW[bi] += s[3];
    }
    for (let c = 0; c < numOpaqueSlots; c++) {
      if (accW[c] > 0) {
        centroids[c] = [accR[c] / accW[c], accG[c] / accW[c], accB[c] / accW[c]];
      }
    }
  }

  // Convert centroids to PS1 BGR555 palette
  const palBgr555 = new Uint16Array(16);
  const palRgb = [];
  if (transparentKey0) {
    palBgr555[0] = 0x7c1f;
    palRgb.push([255, 0, 255]);
  }
  for (let c = 0; c < numOpaqueSlots; c++) {
    const v = rgbToPs1Bgr555(centroids[c][0], centroids[c][1], centroids[c][2], true);
    palBgr555[startSlot + c] = v;
    palRgb.push(bgr555ToRgb(v));
  }

  // Map pixels with serpentine Floyd-Steinberg error diffusion (opaque-only error spread!)
  const errR = new Float32Array(w * h);
  const errG = new Float32Array(w * h);
  const errB = new Float32Array(w * h);
  const indices = new Uint8Array(w * h);
  const previewRgba = Buffer.alloc(w * h * 4, 0);

  for (let y = 0; y < h; y++) {
    const rev = (y & 1) === 1;
    for (let step = 0; step < w; step++) {
      const x = rev ? (w - 1 - step) : step;
      const p = y * w + x;
      const o = p * 4;
      if (transparentKey0 && rgba[o + 3] < 128) {
        indices[p] = 0;
        continue;
      }
      const r = clamp(rgba[o + 0] + errR[p], 0, 255);
      const g = clamp(rgba[o + 1] + errG[p], 0, 255);
      const b = clamp(rgba[o + 2] + errB[p], 0, 255);
      let bi = startSlot, bd = 1e18;
      for (let c = startSlot; c < 16; c++) {
        const pr = palRgb[c];
        const dr = r - pr[0], dg = g - pr[1], db = b - pr[2];
        const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bd) { bd = d; bi = c; }
      }
      indices[p] = bi;
      const chosen = palRgb[bi];
      previewRgba[o + 0] = chosen[0];
      previewRgba[o + 1] = chosen[1];
      previewRgba[o + 2] = chosen[2];
      previewRgba[o + 3] = 255;

      if (dither > 0) {
        const er = (r - chosen[0]) * dither;
        const eg = (g - chosen[1]) * dither;
        const eb = (b - chosen[2]) * dither;
        const dir = rev ? -1 : 1;
        const spread = (nx, ny, f) => {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) return;
          const np = ny * w + nx;
          if (transparentKey0 && rgba[np * 4 + 3] < 128) return;
          errR[np] += er * f; errG[np] += eg * f; errB[np] += eb * f;
        };
        spread(x + dir, y, 7 / 16);
        spread(x - dir, y + 1, 3 / 16);
        spread(x, y + 1, 5 / 16);
        spread(x + dir, y + 1, 1 / 16);
      }
    }
  }

  const stride = Math.ceil(w / 2);
  const packed = Buffer.alloc(stride * h, 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ci = indices[y * w + x] & 0xf;
      const off = y * stride + (x >> 1);
      if (x & 1) packed[off] |= (ci << 4);
      else packed[off] |= ci;
    }
  }
  return { w, h, palBgr555, palRgb, indices, packed, previewRgba };
}

// ============================================================================
// Surgical Cutouts for All 4 New Source Images
// ============================================================================

function cutoutLulaoHead() {
  const { w, h, rgba } = loadImageRgba(path.join(PHOTOS_DIR, 'lulao_no_dinheiro.png'));
  // Pure white background flood-fill from borders -> keeps all hair wisps & white beard inside contour!
  const bg = floodFillBg(w, h, (x, y, p) => {
    const o = p * 4;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    const minC = Math.min(r, g, b);
    const maxC = Math.max(r, g, b);
    return minC > 228 && (maxC - minC) < 22;
  });
  const fgRaw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    // Also exclude bottom-left artist signature region explicitly before CC just in case a pixel touched
    const x = i % w, y = (i - x) / w;
    if (x < 145 && y > 515) continue;
    if (!bg[i]) fgRaw[i] = 1;
  }
  const fg = keepLargestComponent(fgRaw, w, h);

  // Clean 1px soft white fringe along silhouette
  const out = Buffer.from(rgba);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const o = p * 4;
      if (!fg[p]) {
        out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0;
        continue;
      }
      // Check if on outer boundary & near-white halo
      let border = false;
      for (let dy = -1; dy <= 1 && !border; dy++) {
        for (let dx = -1; dx <= 1 && !border; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || !fg[ny * w + nx]) border = true;
        }
      }
      if (border && out[o] > 215 && out[o + 1] > 215 && out[o + 2] > 215) {
        out[o + 3] = 140;
      } else {
        out[o + 3] = 255;
      }
    }
  }
  const bbox = maskBBox(fg, w, h);
  return { w, h, rgba: out, mask: fg, bbox };
}

function cutoutFitas51() {
  const { w, h, rgba } = loadImageRgba(path.join(PHOTOS_DIR, 'fitas_51.png'));
  const bg = floodFillBg(w, h, (x, y, p) => {
    const o = p * 4;
    return rgba[o] > 242 && rgba[o + 1] > 242 && rgba[o + 2] > 242;
  });
  const fgRaw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (!bg[i]) fgRaw[i] = 1;
  const fg = keepLargestComponent(fgRaw, w, h);
  const out = Buffer.from(rgba);
  for (let i = 0; i < w * h; i++) {
    if (!fg[i]) { out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = 0; }
    else out[i * 4 + 3] = 255;
  }
  const bbox = maskBBox(fg, w, h);
  return { w, h, rgba: out, mask: fg, bbox };
}

function cutoutVentoEstocado() {
  const { w, h, rgba } = loadImageRgba(path.join(PHOTOS_DIR, 'vento_estocado.png'));
  // Left & right side margins outside the pinched pouch are flat pale cyan/teal (~(106,185,204)) with white dashes!
  // Detect the dark metallic blue edge of the pouch on each scanline to isolate the exact pouch contour cleanly.
  const fg = new Uint8Array(w * h);
  const leftEdge = new Int32Array(h);
  const rightEdge = new Int32Array(h);

  for (let y = 0; y < h; y++) {
    // Scan from left to find where the pale cyan dashed background transitions into the pouch edge
    // Background cyan has: r in [75..150] (or white dash > 175), g > 155, b > 170, and low (b - g) < 42
    // Pouch metallic blue edge is either dark navy (r < 55, g < 120) or rich vivid blue (b - r > 80 && g < 165)
    let lx = 0;
    for (let x = 0; x < Math.floor(w * 0.25); x++) {
      const o = (y * w + x) * 4;
      const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
      const isCyanMargin = (g >= 148 && b >= 165 && (b - g) <= 45 && r >= 65) || (r > 180 && g > 205 && b > 215);
      if (!isCyanMargin) { lx = x; break; }
      lx = x + 1;
    }
    let rx = w - 1;
    for (let x = w - 1; x >= Math.floor(w * 0.75); x--) {
      const o = (y * w + x) * 4;
      const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
      const isCyanMargin = (g >= 148 && b >= 165 && (b - g) <= 45 && r >= 65) || (r > 180 && g > 205 && b > 215);
      if (!isCyanMargin) { rx = x; break; }
      rx = x - 1;
    }
    // Top & bottom crimp corners reach nearly full width
    if (y < 24 || y > h - 22) { lx = Math.min(lx, 4); rx = Math.max(rx, w - 5); }
    leftEdge[y] = lx;
    rightEdge[y] = rx;
  }

  // Smooth the left/right pouch curves with a 9-tap median filter so dashed breaks never create jaggies!
  const smoothL = new Int32Array(h);
  const smoothR = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    const arrL = [], arrR = [];
    for (let dy = -5; dy <= 5; dy++) {
      const yy = clamp(y + dy, 0, h - 1);
      arrL.push(leftEdge[yy]); arrR.push(rightEdge[yy]);
    }
    arrL.sort((a, b) => a - b); arrR.sort((a, b) => a - b);
    smoothL[y] = arrL[5]; smoothR[y] = arrR[5];
  }

  // Trim any pale top/bottom margin (keep y=4..h-3)
  for (let y = 4; y < h - 2; y++) {
    // Inset by 1px to eliminate any pale cyan AA edge pixel
    const x0 = Math.min(w - 1, smoothL[y] + 1);
    const x1 = Math.max(0, smoothR[y] - 1);
    for (let x = x0; x <= x1; x++) fg[y * w + x] = 1;
  }

  const out = Buffer.from(rgba);
  for (let i = 0; i < w * h; i++) {
    if (!fg[i]) { out[i * 4] = 0; out[i * 4 + 1] = 0; out[i * 4 + 2] = 0; out[i * 4 + 3] = 0; }
    else out[i * 4 + 3] = 255;
  }
  const bbox = maskBBox(fg, w, h);
  return { w, h, rgba: out, mask: fg, bbox };
}

function cutoutBolsonaroDoidao() {
  const { w, h, rgba } = loadImageRgba(path.join(PHOTOS_DIR, 'bolsonaro_doidao.png'));
  // Solid crimson-red background: RGB ~ (156, 22, 14) + tiny white signature in bottom-right corner
  const bg = floodFillBg(w, h, (x, y, p) => {
    const o = p * 4;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    const isRedBg = (r > 95 && g < 62 && b < 55 && (r - g) > 55 && (r - b) > 60);
    const isCornerSig = (x > w - 35 && y > h - 38);
    return isRedBg || isCornerSig;
  });
  const fgRaw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (!bg[i]) fgRaw[i] = 1;
  const fg = keepLargestComponent(fgRaw, w, h);

  // Erode 1px red-contaminated fringe pixels & suppress red spill on boundary!
  const out = Buffer.from(rgba);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const o = p * 4;
      if (!fg[p]) {
        out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0;
        continue;
      }
      let distBg = 99;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || !fg[ny * w + nx]) {
            const d = Math.abs(dx) + Math.abs(dy);
            if (d < distBg) distBg = d;
          }
        }
      }
      if (distBg <= 2) {
        const r = out[o], g = out[o + 1], b = out[o + 2];
        // Drop pure red-fringe outer pixels cleanly
        if (distBg === 1 && (r - g) > 48 && g < 85 && b < 75) {
          fg[p] = 0;
          out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0;
          continue;
        }
        // Neutralize subtle red bleed on silver hair border
        if (y < h * 0.62 && (r - g) > 25 && Math.abs(g - b) < 25) {
          out[o] = clamp(Math.round((g + b) * 0.5 + 8), 0, 255);
        }
      }
      out[o + 3] = 255;
    }
  }
  const bbox = maskBBox(fg, w, h);
  return { w, h, rgba: out, mask: fg, bbox };
}

// ============================================================================
// PSX Low-Level Helpers (Shared with mod_lulao_world_assets.js)
// ============================================================================

function inspectPsxTables(buf) {
  const p = psxLib.parsePsxStructure(buf);
  let cur = p.ptrMeta;
  while (cur + 4 <= buf.length) {
    const tag = buf.readUInt32LE(cur);
    if (tag === 0xffffffff) { cur += 4; break; }
    const sz = buf.readUInt32LE(cur + 4);
    cur += 8 + sz;
  }
  const meshHashesOff = cur;
  cur += p.numMeshes * 4;
  const numTexHashes = buf.readUInt32LE(cur);
  const texHashesOff = cur;
  const texHashes = [];
  for (let i = 0; i < numTexHashes; i++) texHashes.push(buf.readUInt32LE(cur + 4 + i * 4));
  cur += 4 + numTexHashes * 4;

  const pal4Off = cur;
  const nPal4 = buf.readUInt32LE(cur); cur += 4 + nPal4 * 36;
  const pal8Off = cur;
  const nPal8 = buf.readUInt32LE(cur); cur += 4 + nPal8 * 516;
  const texOffsPos = cur;
  const nTex = buf.readUInt32LE(cur);
  const texOffs = [];
  for (let i = 0; i < nTex; i++) texOffs.push(buf.readUInt32LE(cur + 4 + i * 4));

  const texturesWithHash = p.textures.map(t => ({ ...t, hash: texHashes[t.texIdx] }));
  return {
    ...p,
    textures: texturesWithHash,
    meshHashesOff, texHashesOff, numTexHashes, texHashes,
    pal4Off, nPal4, pal8Off, nPal8, texOffsPos, nTex, texOffs,
  };
}

function decodePsxTextureRgba(psxBuf, tex, zeroIsBlack = true) {
  const rgba = Buffer.alloc(tex.w * tex.h * 4);
  if (!tex.palInfo) return rgba;
  const stride = tex.palSize === 256 ? tex.w : Math.ceil(tex.w / 2);
  for (let y = 0; y < tex.h; y++) {
    for (let x = 0; x < tex.w; x++) {
      const ci = tex.palSize === 256
        ? psxBuf[tex.dataOff + y * stride + x]
        : ((x & 1) ? (psxBuf[tex.dataOff + y * stride + (x >> 1)] >> 4) : (psxBuf[tex.dataOff + y * stride + (x >> 1)] & 0xf));
      const v = psxBuf.readUInt16LE(tex.palInfo.offset + ci * 2);
      const o = (y * tex.w + x) * 4;
      rgba[o + 0] = Math.round((v & 0x1f) * 255 / 31);
      rgba[o + 1] = Math.round(((v >> 5) & 0x1f) * 255 / 31);
      rgba[o + 2] = Math.round(((v >> 10) & 0x1f) * 255 / 31);
      rgba[o + 3] = (!zeroIsBlack && (v === 0 || v === 0x7c1f)) ? 0 : 255;
    }
  }
  return rgba;
}

function vecSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vecCross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function vecDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function vecNorm4096(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [Math.round(v[0] / len * 4095), Math.round(v[1] / len * 4095), Math.round(v[2] / len * 4095)];
}
function assertPs1QuadWinding(verts, vIdx, outNorm, label) {
  const p0 = verts[vIdx[0]], p1 = verts[vIdx[1]], p2 = verts[vIdx[2]], p3 = verts[vIdx[3]];
  const d1 = vecDot(vecCross(vecSub(p1, p0), vecSub(p2, p0)), outNorm);
  const d2 = vecDot(vecCross(vecSub(p3, p1), vecSub(p2, p1)), outNorm);
  if (d1 >= -1 || d2 >= -1) {
    throw new Error(`PS1 winding violation in ${label}: d1=${d1.toFixed(1)}, d2=${d2.toFixed(1)}, v=${JSON.stringify(vIdx)}`);
  }
}
function assertPs1TriWinding(verts, vIdx, outNorm, label) {
  const p0 = verts[vIdx[0]], p1 = verts[vIdx[1]], p2 = verts[vIdx[2]];
  const d1 = vecDot(vecCross(vecSub(p1, p0), vecSub(p2, p0)), outNorm);
  if (d1 >= -1) {
    throw new Error(`PS1 tri winding violation in ${label}: d1=${d1.toFixed(1)}, v=${JSON.stringify(vIdx)}`);
  }
}

function serializeMesh({ unk0 = 8, verts, norms, faces }) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9, maxR = 0;
  for (const [x, y, z] of verts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    const r = Math.hypot(x, y, z);
    if (r > maxR) maxR = r;
  }
  const totalBytes = 28 + verts.length * 8 + norms.length * 8 + faces.length * 28;
  const buf = Buffer.alloc(totalBytes, 0);
  buf.writeUInt16LE(unk0, 0);
  buf.writeUInt16LE(verts.length, 2);
  buf.writeUInt16LE(norms.length, 4);
  buf.writeUInt16LE(faces.length, 6);
  buf.writeUInt32LE((Math.ceil(maxR) * 4096) >>> 0, 8);
  buf.writeInt16LE(maxX, 12); buf.writeInt16LE(minX, 14);
  buf.writeInt16LE(maxY, 16); buf.writeInt16LE(minY, 18);
  buf.writeInt16LE(maxZ, 20); buf.writeInt16LE(minZ, 22);
  buf.writeUInt32LE(0xffff7fff, 24);

  let off = 28;
  for (const [x, y, z] of verts) {
    buf.writeInt16LE(Math.round(x), off);
    buf.writeInt16LE(Math.round(y), off + 2);
    buf.writeInt16LE(Math.round(z), off + 4);
    buf.writeUInt16LE(0, off + 6);
    off += 8;
  }
  for (const [nx, ny, nz] of norms) {
    buf.writeInt16LE(clamp(Math.round(nx), -4096, 4096), off);
    buf.writeInt16LE(clamp(Math.round(ny), -4096, 4096), off + 2);
    buf.writeInt16LE(clamp(Math.round(nz), -4096, 4096), off + 4);
    buf.writeUInt16LE(0, off + 6);
    off += 8;
  }
  for (const f of faces) {
    buf.writeUInt16LE(f.fl, off);
    buf.writeUInt16LE(28, off + 2);
    buf[off + 4] = f.v[0]; buf[off + 5] = f.v[1]; buf[off + 6] = f.v[2]; buf[off + 7] = f.v[3] ?? 0;
    buf[off + 8] = f.rgb[0]; buf[off + 9] = f.rgb[1]; buf[off + 10] = f.rgb[2]; buf[off + 11] = f.rgb[3] ?? 0;
    buf.writeUInt16LE(f.ni, off + 12);
    buf.writeUInt16LE(0, off + 14);
    buf.writeUInt32LE(f.ti, off + 16);
    for (let k = 0; k < 8; k++) buf[off + 20 + k] = f.uv[k] ?? 0;
    off += 28;
  }
  return buf;
}

/**
 * Cleanly replaces a single mesh inside any .PSX buffer, adjusting ptrMeta, all OBJ ptrRgbs,
 * subsequent meshOffs, and all texOffs!
 */
function replaceMeshInPsx(psxBuf, meshIdx, newMeshBuf) {
  const info = inspectPsxTables(psxBuf);
  const oldStart = info.meshOffs[meshIdx];
  const oldEnd = (meshIdx + 1 < info.numMeshes) ? info.meshOffs[meshIdx + 1] : info.ptrMeta;
  const delta = newMeshBuf.length - (oldEnd - oldStart);

  const out = Buffer.concat([
    Buffer.from(psxBuf.subarray(0, oldStart)),
    newMeshBuf,
    Buffer.from(psxBuf.subarray(oldEnd)),
  ]);

  out.writeUInt32LE((info.ptrMeta + delta) >>> 0, 4);
  const numObjs = out.readUInt32LE(8);
  for (let i = 0; i < numObjs; i++) {
    const o = 12 + i * 36;
    const oldRgbs = out.readUInt32LE(o + 32);
    if (oldRgbs >= info.ptrMeta) out.writeUInt32LE((oldRgbs + delta) >>> 0, o + 32);
  }
  const meshOffsStart = 12 + numObjs * 36 + 4;
  for (let i = meshIdx + 1; i < info.numMeshes; i++) {
    const pos = meshOffsStart + i * 4;
    out.writeUInt32LE((out.readUInt32LE(pos) + delta) >>> 0, pos);
  }
  if (info.nTex > 0) {
    const newTexOffsPos = info.texOffsPos + delta;
    for (let i = 0; i < info.nTex; i++) {
      const pos = newTexOffsPos + 4 + i * 4;
      out.writeUInt32LE((out.readUInt32LE(pos) + delta) >>> 0, pos);
    }
  }
  return out;
}

/**
 * Rebuilds the entire texture/palette section of a .PSX buffer cleanly!
 * Allows resizing textures, converting 8-bit <-> 4-bit, and adding new textures seamlessly.
 */
function rebuildPsxTextures(psxBuf, mutatorFn) {
  const info = inspectPsxTables(psxBuf);

  // Extract existing pal4, pal8, texHashes, and texture records
  const pal4 = [];
  for (let i = 0; i < info.nPal4; i++) {
    const o = info.pal4Off + 4 + i * 36;
    pal4.push({ id: psxBuf.readUInt32LE(o), data: Buffer.from(psxBuf.subarray(o + 4, o + 36)) });
  }
  const pal8 = [];
  for (let i = 0; i < info.nPal8; i++) {
    const o = info.pal8Off + 4 + i * 516;
    pal8.push({ id: psxBuf.readUInt32LE(o), data: Buffer.from(psxBuf.subarray(o + 4, o + 516)) });
  }
  const texHashes = [...info.texHashes];
  const texRecs = [];
  for (let i = 0; i < info.nTex; i++) {
    const o = info.texOffs[i];
    const end = (i + 1 < info.nTex) ? info.texOffs[i + 1] : psxBuf.length;
    const unk0 = psxBuf.readUInt32LE(o);
    const palSize = psxBuf.readUInt32LE(o + 4);
    const palId = psxBuf.readUInt32LE(o + 8);
    const texIdx = psxBuf.readUInt32LE(o + 12);
    const w = psxBuf.readUInt16LE(o + 16);
    const h = psxBuf.readUInt16LE(o + 18);
    const rawPixels = Buffer.from(psxBuf.subarray(o + 20, end));
    texRecs.push({ unk0, palSize, palId, texIdx, w, h, hash: texHashes[texIdx], rawPixels });
  }

  // Let caller mutate texHashes, pal4, pal8, texRecs
  mutatorFn({ texHashes, pal4, pal8, texRecs });

  // Serialize prefix up to texHashesOff
  const prefix = Buffer.from(psxBuf.subarray(0, info.texHashesOff));
  const thBuf = Buffer.alloc(4 + texHashes.length * 4);
  thBuf.writeUInt32LE(texHashes.length, 0);
  for (let i = 0; i < texHashes.length; i++) thBuf.writeUInt32LE(texHashes[i] >>> 0, 4 + i * 4);

  const p4Buf = Buffer.alloc(4 + pal4.length * 36);
  p4Buf.writeUInt32LE(pal4.length, 0);
  for (let i = 0; i < pal4.length; i++) {
    p4Buf.writeUInt32LE(pal4[i].id >>> 0, 4 + i * 36);
    pal4[i].data.copy(p4Buf, 4 + i * 36 + 4);
  }

  const p8Buf = Buffer.alloc(4 + pal8.length * 516);
  p8Buf.writeUInt32LE(pal8.length, 0);
  for (let i = 0; i < pal8.length; i++) {
    p8Buf.writeUInt32LE(pal8[i].id >>> 0, 4 + i * 516);
    pal8[i].data.copy(p8Buf, 4 + i * 516 + 4);
  }

  const texOffsTableLen = 4 + texRecs.length * 4;
  const texDataBase = prefix.length + thBuf.length + p4Buf.length + p8Buf.length + texOffsTableLen;

  const texOffsBuf = Buffer.alloc(texOffsTableLen);
  texOffsBuf.writeUInt32LE(texRecs.length, 0);
  const texChunks = [];
  let curOff = texDataBase;
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
    // Align each texture record cleanly to 4 bytes (PSX loader reads uint32 headers!)
    const padLen = (4 - ((20 + t.rawPixels.length) % 4)) % 4;
    const chunk = padLen ? Buffer.concat([hdr, t.rawPixels, Buffer.alloc(padLen, 0)]) : Buffer.concat([hdr, t.rawPixels]);
    texChunks.push(chunk);
    curOff += chunk.length;
  }

  return Buffer.concat([prefix, thBuf, p4Buf, p8Buf, texOffsBuf, ...texChunks]);
}

function palBgr555ToBuf(palArr) {
  const b = Buffer.alloc(32);
  for (let i = 0; i < 16; i++) b.writeUInt16LE(palArr[i] & 0xffff, i * 2);
  return b;
}

// ============================================================================
// PART 1: Hangar Barrel -> Front: Authentic Pirassununga 51 Logo, Back: Lulao Face!
// ============================================================================

function buildHangarBarrelArts(lulaoCut, bottle51Cut) {
  // Base authentic steel drum backdrop (extracted from original skhan_o.psx ti=26 clean side columns!)
  const origHed = fs.readFileSync(path.join(BACKUP_DIR, 'CD.HED'));
  const origWad = fs.readFileSync(path.join(BACKUP_DIR, 'CD.WAD'));
  const hOff = origHed.readUInt32LE(14 * 12 + 4), hSz = origHed.readUInt32LE(14 * 12 + 8);
  const origSkhan = origWad.subarray(hOff, hOff + hSz);
  const info = inspectPsxTables(origSkhan);
  const origBodyTex = info.textures.find(t => t.hash === HASH_BARREL_BDY_FRONT);
  const origBody = decodePsxTextureRgba(origSkhan, origBodyTex, true);

  // Build seamless 64x64 clean steel drum background from original left/right clean ribs (x=0..9 & x=54..63)
  const makeSteelDrum = () => {
    const drum = Buffer.alloc(64 * 64 * 4);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const srcX = (x < 10 || x >= 54) ? x : ((x & 1) ? (2 + ((x * 3 + y) % 7)) : (55 + ((x * 5 + y) % 7)));
        const so = (y * 64 + srcX) * 4;
        const o = (y * 64 + x) * 4;
        drum[o + 0] = origBody[so + 0];
        drum[o + 1] = origBody[so + 1];
        drum[o + 2] = origBody[so + 2];
        drum[o + 3] = 255;
      }
    }
    return drum;
  };

  // ---- 1A. FRONT 64x64 (16c): Authentic Pirassununga 51 Label directly from fitas_51.png! ----
  const front = makeSteelDrum();
  // Locate the crisp label region inside fitas_51.png (y ~ 48%..89% of bottle height, x ~ 12%..88% of bottle width)
  const bb = bottle51Cut.bbox;
  const labX0 = bb.minX + bb.bw * 0.04;
  const labX1 = bb.maxX - bb.bw * 0.04;
  const labY0 = bb.minY + bb.bh * 0.475;
  const labY1 = bb.minY + bb.bh * 0.895;
  // Resample real Pirassununga 51 label to 52x50 and center on the steel drum (x=6..57, y=7..56)
  const lw = 52, lh = 50;
  const labelRgba = resampleRgbaArea(bottle51Cut.rgba, bottle51Cut.w, bottle51Cut.h, labX0, labY0, labX1, labY1, lw, lh, -1);

  // Paint crisp dark gold outer trim + authentic Pirassununga 51 label on the drum front!
  for (let y = 6; y <= 57; y++) {
    for (let x = 5; x <= 58; x++) {
      const o = (y * 64 + x) * 4;
      if (y === 6 || y === 57 || x === 5 || x === 58) {
        front[o] = 175; front[o + 1] = 132; front[o + 2] = 32; front[o + 3] = 255;
      } else {
        const lo = ((y - 7) * lw + (x - 6)) * 4;
        // Slight metallic rib shading at y=21 & y=42 so it feels screen-printed onto the 51 drum!
        const rib = (y === 21 || y === 42) ? 0.88 : 1.0;
        front[o + 0] = clamp(Math.round(labelRgba[lo + 0] * rib), 0, 255);
        front[o + 1] = clamp(Math.round(labelRgba[lo + 1] * rib), 0, 255);
        front[o + 2] = clamp(Math.round(labelRgba[lo + 2] * rib), 0, 255);
        front[o + 3] = 255;
      }
    }
  }

  const qFront = quantize4BitWeighted(front, 64, 64, {
    transparentKey0: false,
    anchors: [
      [252, 208, 12, 26],   // iconic Pirassununga golden-yellow top
      [226, 20, 18, 28],    // vibrant Pirassununga red wave & script
      [18, 14, 14, 24],     // deep black "51" circle
      [252, 252, 252, 26],  // crisp white "51" digits & bottom band
      [194, 148, 52, 18],   // golden medallion ring
      [82, 86, 92, 14],     // steel drum body
      [48, 52, 58, 12],     // steel drum shadow rib
    ],
    weightFn: (x, y) => (x >= 16 && x <= 48 && y >= 18 && y <= 46) ? 3.5 : 1.0,
    dither: 0.14,
  });

  // ---- 1B. BACK 64x64 (16c): Surgically Cut-Out Lulao Caricature Face on the Steel Drum! ----
  const back = makeSteelDrum();
  const lb = lulaoCut.bbox;
  // Preserve exact caricature aspect ratio fitting cleanly inside 54x56 centered on the drum back!
  const aspect = lb.bw / lb.bh;
  let fw = 54, fh = Math.round(54 / aspect);
  if (fh > 56) { fh = 56; fw = Math.round(56 * aspect); }
  const lulaoSmall = resampleRgbaArea(lulaoCut.rgba, lulaoCut.w, lulaoCut.h, lb.minX, lb.minY, lb.maxX + 1, lb.maxY + 1, fw, fh, -1);
  const ox = Math.floor((64 - fw) / 2);
  const oy = Math.floor((64 - fh) / 2);

  // Subtle golden halo border behind Lulao's face on the drum back so he pops unmistakably against steel!
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const a = lulaoSmall[(y * fw + x) * 4 + 3] / 255;
      if (a < 0.08) continue;
      const dx = ox + x, dy = oy + y;
      if (dx < 0 || dx >= 64 || dy < 0 || dy >= 64) continue;
      const lo = (y * fw + x) * 4;
      const bo = (dy * 64 + dx) * 4;
      const rib = (dy === 21 || dy === 42) ? 0.90 : 1.0;
      back[bo + 0] = clamp(Math.round(lerp(back[bo + 0], lulaoSmall[lo + 0] * rib, a)), 0, 255);
      back[bo + 1] = clamp(Math.round(lerp(back[bo + 1], lulaoSmall[lo + 1] * rib, a)), 0, 255);
      back[bo + 2] = clamp(Math.round(lerp(back[bo + 2], lulaoSmall[lo + 2] * rib, a)), 0, 255);
      back[bo + 3] = 255;
    }
  }

  const qBack = quantize4BitWeighted(back, 64, 64, {
    transparentKey0: false,
    anchors: [
      [238, 236, 234, 22],  // bright silver hair & beard highlights
      [188, 184, 182, 16],  // mid silver hair & beard
      [226, 152, 114, 24],  // warm skin highlight
      [182, 102, 72, 22],   // warm rosy cheek / nose midtone
      [122, 56, 38, 20],    // deep facial contour / smile shadow
      [48, 24, 18, 16],     // dark eye / mouth line
      [82, 86, 92, 12],     // steel drum body
    ],
    weightFn: (x, y) => (x >= ox + 8 && x <= ox + fw - 8 && y >= oy + 12 && y <= oy + fh - 10) ? 3.5 : 1.0,
    dither: 0.18,
  });

  return { qFront, qBack, frontRaw: front, backRaw: back };
}

function patchHangarBarrelFrontBack(skhanBuf, barrelArts) {
  const info = inspectPsxTables(skhanBuf);
  const mIdx = info.meshHashes.indexOf(0x4eb2c689);
  if (mIdx !== 9) throw new Error(`Hangar barrel M[9] esperado, encontrado M[${mIdx}]`);

  // Step 1: Rebuild M[9] cleanly so:
  //   - Top & bottom lids (F[0..3], F[12..15]) remain 100% identical (ti=25)
  //   - Front 4 side panels (F[4..7], facing -Z/+X toward player) map continuous u = 0..63 on ti=26 (51 Logo!)
  //   - Back  4 side panels (F[8..11], facing +Z/-X opposite side) map continuous u = 0..63 on ti=39 (Lulao Face!)
  //   - All 8 side faces use clean 28-byte non-wrapping fl=0x1803 (saving 20 B over original 32-byte wrap faces!)
  const mo = info.meshOffs[mIdx];
  const mEnd = info.meshOffs[mIdx + 1];
  const nV = skhanBuf.readUInt16LE(mo + 2);
  const nN = skhanBuf.readUInt16LE(mo + 4);
  const nF = skhanBuf.readUInt16LE(mo + 6);
  const vOff = mo + 28;
  const nOff = vOff + nV * 8;
  let fp = nOff + nN * 8;

  const verts = [];
  for (let i = 0; i < nV; i++) {
    verts.push([skhanBuf.readInt16LE(vOff + i * 8), skhanBuf.readInt16LE(vOff + i * 8 + 2), skhanBuf.readInt16LE(vOff + i * 8 + 4)]);
  }
  const norms = [];
  for (let i = 0; i < nN; i++) {
    norms.push([skhanBuf.readInt16LE(nOff + i * 8), skhanBuf.readInt16LE(nOff + i * 8 + 2), skhanBuf.readInt16LE(nOff + i * 8 + 4)]);
  }

  const newTiBack = info.numTexHashes; // 39
  const faces = [];
  // Panel order around barrel:
  //   Side A (Front 51 Logo): F[11] (v15->8), F[4] (v8->9), F[5] (v9->10), F[6] (v10->11) -> centered at V[9]=(+34, -37) & V[8]=(-3,-49)!
  //   Wait: check original centered diamond! Original diamond at u=31 was right on V[8]=(-3,-49) & V[12]=(+6,+51)!
  //   So centering Side A at V[8] (-Z face, toward Hangar spawn!) uses panels: F[10], F[11], F[4], F[5] (u: 0->16->32->48->63, center u=32 at V[8]!),
  //   and centering Side B (Back Lulao Face!) at V[12] (+Z opposite face!) uses panels: F[6], F[7], F[8], F[9] (u: 0->16->32->48->63, center u=32 at V[12]!)!
  const frontMap = new Map([[10, [0, 16]], [11, [16, 32]], [4, [32, 48]], [5, [48, 63]]]);
  const backMap  = new Map([[6,  [0, 16]], [7,  [16, 32]], [8, [32, 48]], [9, [48, 63]]]);

  for (let fi = 0; fi < nF && fp + 4 <= mEnd; fi++) {
    const fl = skhanBuf.readUInt16LE(fp);
    const flen = skhanBuf.readUInt16LE(fp + 2);
    const v = [skhanBuf[fp + 4], skhanBuf[fp + 5], skhanBuf[fp + 6], skhanBuf[fp + 7]];
    const rgb = [skhanBuf[fp + 8], skhanBuf[fp + 9], skhanBuf[fp + 10], skhanBuf[fp + 11]];
    const ni = skhanBuf.readUInt16LE(fp + 12);
    let ti = skhanBuf.readUInt32LE(fp + 16);
    let uv = Array.from(skhanBuf.subarray(fp + 20, fp + 28));
    let newFl = fl;

    if (frontMap.has(fi)) {
      const [u0, u1] = frontMap.get(fi);
      newFl = fl & ~0x0020; // strip 32-byte UV wrap flag -> clean 28-byte quad!
      ti = 26;
      uv = [u0, 0, u1, 0, u0, 63, u1, 63];
    } else if (backMap.has(fi)) {
      const [u0, u1] = backMap.get(fi);
      newFl = fl & ~0x0020;
      ti = newTiBack;
      uv = [u0, 0, u1, 0, u0, 63, u1, 63];
    }
    faces.push({ fl: newFl, v, rgb, ni, ti, uv });
    fp += flen;
  }

  const newBarrelMesh = serializeMesh({ unk0: skhanBuf.readUInt16LE(mo), verts, norms, faces });
  let out = replaceMeshInPsx(skhanBuf, mIdx, newBarrelMesh);

  // Step 2: Rebuild textures in skhan_o / skhan_o2:
  //   - Convert ti=26 (0xd8113bf8) from 64x64 256c -> 64x64 16c (Front 51 Logo)
  //   - Remove old 8-bit palette for ti=26 (0xb526a881)
  //   - Add new 4-bit palettes for Front (0xb526a881) & Back (0x51101a52)
  //   - Append new texture ti=39 (0x51101a51, 64x64 16c, Back Lulao Face)
  out = rebuildPsxTextures(out, ({ texHashes, pal4, pal8, texRecs }) => {
    const frontRec = texRecs.find(t => t.hash === HASH_BARREL_BDY_FRONT);
    if (!frontRec) throw new Error('Textura 0xd8113bf8 nao encontrada no barril!');
    const oldPal8Id = frontRec.palId;
    const p8i = pal8.findIndex(p => p.id === oldPal8Id);
    if (p8i >= 0) pal8.splice(p8i, 1);

    const frontPalId = oldPal8Id;
    const backPalId = 0x51101a52;
    pal4.push({ id: frontPalId, data: palBgr555ToBuf(barrelArts.qFront.palBgr555) });
    pal4.push({ id: backPalId,  data: palBgr555ToBuf(barrelArts.qBack.palBgr555) });

    frontRec.palSize = 16;
    frontRec.palId = frontPalId;
    frontRec.w = 64;
    frontRec.h = 64;
    frontRec.rawPixels = barrelArts.qFront.packed;

    texHashes.push(HASH_BARREL_BDY_BACK);
    texRecs.push({
      unk0: frontRec.unk0,
      palSize: 16,
      palId: backPalId,
      texIdx: newTiBack,
      w: 64,
      h: 64,
      hash: HASH_BARREL_BDY_BACK,
      rawPixels: barrelArts.qBack.packed,
    });
  });

  // Self-verify parseable!
  const chk = inspectPsxTables(out);
  if (chk.numTexHashes !== info.numTexHashes + 1 || chk.nTex !== info.nTex + 1) {
    throw new Error(`Hangar barrel rebuild mismatch: texHashes=${chk.numTexHashes}, nTex=${chk.nTex}`);
  }
  return out;
}

// ============================================================================
// PART 2: Dynamic Per-Skater Lulao Banknote Portraits ($100, $50, $250 in ALL Levels!)
// ============================================================================

function buildLulaoCashBillArt(itemsPsxBuf, lulaoCut) {
  const info = inspectPsxTables(itemsPsxBuf);
  // T[0] = $100 (sepia-gold), T[1] = $50 (steel-blue), T[2] = $250 (dollar-green) — all 128x64 4-bit!
  // Central portrait strip: byte-aligned x = 32..79 (48 px = 24 bytes/row) x 64 rows = 1,536 B per bill!
  // Oval portrait ellipse inside the bill's engraved border: cx = 54.0, cy = 32.0, rx = 18.8, ry = 27.6!
  const STRIP_X0 = 32;
  const STRIP_W = 48; // 24 bytes/row (6 uint32 words!)
  const CX = 54.0, CY = 32.0, RX = 18.6, RY = 27.2;

  const lb = lulaoCut.bbox;
  // Crop slightly tight on Lulao's expressive face & beard so he fills the banknote oval dramatically!
  const lulaoOval = resampleRgbaArea(
    lulaoCut.rgba, lulaoCut.w, lulaoCut.h,
    lb.minX, lb.minY, lb.maxX + 1, lb.maxY + 1,
    40, 52, -1
  );

  // Convert Lulao portrait to high-contrast engraved-banknote luminance map (0..255)
  const lumMap = new Float32Array(40 * 52);
  const alphaMap = new Float32Array(40 * 52);
  for (let i = 0; i < 40 * 52; i++) {
    const o = i * 4;
    const a = lulaoOval[o + 3] / 255;
    alphaMap[i] = a;
    if (a < 0.05) { lumMap[i] = 0; continue; }
    // Perceptual luminance with classic intaglio currency contrast S-curve!
    let l = (0.299 * lulaoOval[o] + 0.587 * lulaoOval[o + 1] + 0.114 * lulaoOval[o + 2]) / 255;
    // Slight gamma + S-curve so silver hair/beard gleam bright while eyes, nose crease & smile stay crisp dark!
    l = clamp((l - 0.50) * 1.28 + 0.50, 0.03, 0.99);
    l = Math.pow(l, 0.92);
    lumMap[i] = l * 255;
  }

  const strips = [];
  const dataOffs = [];
  const previews = [];

  for (let bi = 0; bi < 3; bi++) {
    const tex = info.textures[bi];
    if (tex.w !== 128 || tex.h !== 64 || tex.palSize !== 16) {
      throw new Error(`Cash bill T[${bi}] dimensao inesperada: ${tex.w}x${tex.h} pal=${tex.palSize}`);
    }
    dataOffs.push(tex.dataOff);

    // Read bill's EXACT existing 16-color monochrome palette (treating 0x0000 as opaque black!)
    const palCols = [];
    for (let c = 0; c < 16; c++) {
      const v = itemsPsxBuf.readUInt16LE(tex.palInfo.offset + c * 2);
      const [r, g, b] = bgr555ToRgb(v);
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      palCols.push({ ci: c, v, r, g, b, l });
    }
    // Deduplicate identical luminance entries (e.g. two 0x0000 black entries)
    const usable = palCols.filter((p, idx) => idx === palCols.findIndex(q => q.v === p.v));
    const minL = Math.min(...usable.map(p => p.l));
    const maxL = Math.max(...usable.map(p => p.l));

    // Extract original 128x64 nibble indices of this bill
    const origIdx = new Uint8Array(128 * 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 128; x++) {
        const b = itemsPsxBuf[tex.dataOff + y * 64 + (x >> 1)];
        origIdx[y * 64 * 2 + x] = (x & 1) ? (b >> 4) : (b & 0xf);
      }
    }
    const newIdx = new Uint8Array(origIdx);

    // Target luminance grid inside oval with subtle banknote engraving backdrop + error diffusion!
    const targetL = new Float32Array(128 * 64);
    const inOval = new Uint8Array(128 * 64);

    for (let y = 0; y < 64; y++) {
      for (let x = STRIP_X0; x < STRIP_X0 + STRIP_W; x++) {
        const nx = (x - CX) / RX;
        const ny = (y - CY) / RY;
        const r2 = nx * nx + ny * ny;
        // Stay cleanly inside the dark engraved oval frame (r2 <= 0.90) so the original oval rim stays 100% crisp!
        if (r2 > 0.90) continue;
        // For $250 (bi=2), the large digit '2' overlaps the right side of the oval around x >= 68;
        // preserve both bright white halo AND deep black digit stroke pixels outside x=68!
        const curCol = palCols[origIdx[y * 128 + x]];
        if (x >= 68 && (curCol.l > 235 || curCol.v === 0)) continue;

        inOval[y * 128 + x] = 1;
        // Subtle banknote crosshatch vignette backdrop behind portrait (matches Tony Hawk's original mid-dark oval tone!)
        const hatch = ((y & 1) === 0 ? 5 : -5) + (((x + y) & 3) === 0 ? 3 : 0);
        const bgL = lerp(minL + (maxL - minL) * 0.24, minL + (maxL - minL) * 0.36, clamp(1 - r2, 0, 1)) + hatch;

        // Sample Lulao portrait centered at (54, 33) -> portrait box x=34..73, y=6..57
        const px = x - 34;
        const py = y - 6;
        let a = 0, fl = bgL;
        if (px >= 0 && px < 40 && py >= 0 && py < 52) {
          const pi = py * 40 + px;
          a = alphaMap[pi];
          // Map Lulao luminance [0..255] onto bill's exact tone range [minL + 2% .. maxL * 0.93]
          fl = minL + (lumMap[pi] / 255) * (maxL * 0.94 - minL);
        }
        // Soft radial edge feather near oval rim
        const edgeFade = clamp((0.90 - r2) * 8.0, 0, 1);
        targetL[y * 128 + x] = lerp(bgL, fl, a * edgeFade);
      }
    }

    // Serpentine Floyd-Steinberg 1D luminance quantization onto bill's EXACT 16-color monochrome palette!
    const err = new Float32Array(128 * 64);
    for (let y = 0; y < 64; y++) {
      const rev = (y & 1) === 1;
      for (let s = 0; s < STRIP_W; s++) {
        const x = rev ? (STRIP_X0 + STRIP_W - 1 - s) : (STRIP_X0 + s);
        const p = y * 128 + x;
        if (!inOval[p]) continue;
        const want = clamp(targetL[p] + err[p], minL, maxL);
        let best = usable[0], bestD = 1e9;
        for (const u of usable) {
          const d = Math.abs(u.l - want);
          if (d < bestD) { bestD = d; best = u; }
        }
        newIdx[p] = best.ci;
        const e = (want - best.l) * 0.45;
        const dir = rev ? -1 : 1;
        const sp = (nx, ny, f) => {
          if (nx < STRIP_X0 || nx >= STRIP_X0 + STRIP_W || ny < 0 || ny >= 64) return;
          const np = ny * 128 + nx;
          if (inOval[np]) err[np] += e * f;
        };
        sp(x + dir, y, 7 / 16);
        sp(x - dir, y + 1, 3 / 16);
        sp(x, y + 1, 5 / 16);
        sp(x + dir, y + 1, 1 / 16);
      }
    }

    // Pack 48x64 central strip (24 bytes/row * 64 rows = 1,536 B)
    const strip = Buffer.alloc(24 * 64, 0);
    const prevRgba = Buffer.alloc(128 * 64 * 4, 255);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 128; x++) {
        const ci = newIdx[y * 128 + x];
        const col = palCols[ci];
        const o = (y * 128 + x) * 4;
        prevRgba[o] = col.r; prevRgba[o + 1] = col.g; prevRgba[o + 2] = col.b; prevRgba[o + 3] = 255;
      }
      for (let sx = 0; sx < STRIP_W; sx++) {
        const ci = newIdx[y * 128 + STRIP_X0 + sx] & 0xf;
        const off = y * 24 + (sx >> 1);
        if (sx & 1) strip[off] |= (ci << 4);
        else strip[off] |= ci;
      }
    }
    strips.push(strip);
    previews.push(prevRgba);
  }

  // Pack VOICES.DAT CASHART binary payload (exact 3 sectors = 6,144 B):
  //   +0x000: uint32 magic = 0x43415348 ("CASH")
  //   +0x004: uint32 dataOff[0] ($100 T[0] offset inside items.psx!)
  //   +0x008: uint32 dataOff[1] ($50  T[1] offset inside items.psx!)
  //   +0x00C: uint32 dataOff[2] ($250 T[2] offset inside items.psx!)
  //   +0x010..+0x60F (1536 B): strip 0 ($100 sepia-gold)
  //   +0x610..+0xC0F (1536 B): strip 1 ($50  steel-blue)
  //   +0xC10..+0x120F (1536 B): strip 2 ($250 dollar-green)
  //   Total used = 4,624 B -> padded cleanly to 3 sectors = 6,144 B!
  const payload = Buffer.alloc(3 * 2048, 0);
  payload.writeUInt32LE(0x43415348, 0);
  payload.writeUInt32LE(dataOffs[0] >>> 0, 4);
  payload.writeUInt32LE(dataOffs[1] >>> 0, 8);
  payload.writeUInt32LE(dataOffs[2] >>> 0, 12);
  strips[0].copy(payload, 0x010);
  strips[1].copy(payload, 0x610);
  strips[2].copy(payload, 0xC10);

  return { payload, dataOffs, previews };
}

// ============================================================================
// PART 3: Secret Tape (ALL Levels) -> 3D Garrafa de 51 + Discrete Glowing Golden Aura
//         (items.psx WAD[8], M[8] hash 0x7c1b2c4a)
// ============================================================================

function build51BottleAndAuraTextures(bottle51Cut) {
  const bb = bottle51Cut.bbox;

  // 1. ti=5 (64x64 16c): Dedicated Pirassununga 51 Main Label (cropped cleanly from fitas_51.png!)
  //    Sample center 86% horizontally to avoid curved bottle edge dark rim so label wraps seamlessly 360 deg!
  const labRgba = resampleRgbaArea(
    bottle51Cut.rgba, bottle51Cut.w, bottle51Cut.h,
    bb.minX + bb.bw * 0.05, bb.minY + bb.bh * 0.475,
    bb.maxX - bb.bw * 0.05, bb.minY + bb.bh * 0.895,
    64, 64, -1
  );
  // Subtle cylindrical specular glass highlight + seamless 3px horizontal wave feather at x=0/63 wrap seam
  for (let y = 0; y < 64; y++) {
    const oL = (y * 64 + 0) * 4, oR = (y * 64 + 63) * 4;
    const midR = Math.round((labRgba[oL] + labRgba[oR]) * 0.5);
    const midG = Math.round((labRgba[oL + 1] + labRgba[oR + 1]) * 0.5);
    const midB = Math.round((labRgba[oL + 2] + labRgba[oR + 2]) * 0.5);
    for (let k = 0; k < 3; k++) {
      const t = (3 - k) / 4;
      for (const x of [k, 63 - k]) {
        const o = (y * 64 + x) * 4;
        labRgba[o + 0] = Math.round(lerp(labRgba[o + 0], midR, t));
        labRgba[o + 1] = Math.round(lerp(labRgba[o + 1], midG, t));
        labRgba[o + 2] = Math.round(lerp(labRgba[o + 2], midB, t));
      }
    }
    for (let x = 0; x < 64; x++) {
      const sh = Math.exp(-Math.pow((x - 7) / 2.6, 2)) * 0.14;
      const o = (y * 64 + x) * 4;
      labRgba[o + 0] = clamp(Math.round(lerp(labRgba[o + 0], 255, sh)), 0, 255);
      labRgba[o + 1] = clamp(Math.round(lerp(labRgba[o + 1], 255, sh)), 0, 255);
      labRgba[o + 2] = clamp(Math.round(lerp(labRgba[o + 2], 255, sh)), 0, 255);
      labRgba[o + 3] = 255;
    }
  }
  const qLabel = quantize4BitWeighted(labRgba, 64, 64, {
    transparentKey0: false,
    anchors: [
      [252, 210, 12, 26],   // iconic Pirassununga yellow
      [230, 18, 16, 28],    // vibrant Pirassununga red
      [16, 12, 12, 24],     // black "51" medallion
      [252, 252, 252, 26],  // crisp white "51" & lower label
      [204, 156, 48, 20],   // gold medallion ring & swoop
      [172, 172, 168, 10],  // sugarcane grey detail
    ],
    weightFn: (x, y) => (x >= 16 && x <= 48 && y >= 14 && y <= 46) ? 3.5 : 1.0,
    dither: 0.12,
  });

  // 2. ti=7 (64x16 16c): Clear Glass Neck + Shoulder + Embossed "51" + Liquid Meniscus!
  const neckRgba = resampleRgbaArea(
    bottle51Cut.rgba, bottle51Cut.w, bottle51Cut.h,
    bb.minX + bb.bw * 0.14, bb.minY + bb.bh * 0.175,
    bb.maxX - bb.bw * 0.14, bb.minY + bb.bh * 0.475,
    64, 16, -1
  );
  // Enhance crisp glass vertical reflections & subtle liquid sheen so clear glass gleams in 3D!
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 64; x++) {
      const o = (y * 64 + x) * 4;
      const spec = Math.exp(-Math.pow((x - 12) / 3.0, 2)) * 38 + Math.exp(-Math.pow((x - 52) / 2.6, 2)) * 26;
      const meniscus = (y === 3) ? -32 : 0;
      neckRgba[o + 0] = clamp(Math.round(neckRgba[o + 0] * 0.94 + spec + meniscus), 30, 255);
      neckRgba[o + 1] = clamp(Math.round(neckRgba[o + 1] * 0.97 + spec + meniscus), 35, 255);
      neckRgba[o + 2] = clamp(Math.round(neckRgba[o + 2] * 1.01 + spec + meniscus), 40, 255);
      neckRgba[o + 3] = 255;
    }
  }
  const qNeck = quantize4BitWeighted(neckRgba, 64, 16, { transparentKey0: false, dither: 0.18 });

  // 3. ti=8 (64x16 16c): Heavy Clear Glass Base!
  const baseRgba = resampleRgbaArea(
    bottle51Cut.rgba, bottle51Cut.w, bottle51Cut.h,
    bb.minX + bb.bw * 0.08, bb.minY + bb.bh * 0.895,
    bb.maxX - bb.bw * 0.08, bb.maxY,
    64, 16, -1
  );
  const qBase = quantize4BitWeighted(baseRgba, 64, 16, { transparentKey0: false, dither: 0.18 });

  // 4. ti=6 (16x16 16c): Iconic Tall Golden-Yellow "51" Screw Cap!
  const capRgba = resampleRgbaArea(
    bottle51Cut.rgba, bottle51Cut.w, bottle51Cut.h,
    bb.minX + bb.bw * 0.30, bb.minY + bb.bh * 0.01,
    bb.maxX - bb.bw * 0.30, bb.minY + bb.bh * 0.175,
    16, 16, -1
  );
  // Make the yellow cap rich, crisp and gleaming gold-yellow with subtle vertical grip lines
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const o = (y * 16 + x) * 4;
      const knurl = (y >= 1 && y <= 4 && (x & 1)) ? 0.92 : 1.0;
      const rim = (y === 15) ? 0.55 : 1.0; // dark seal line at cap base
      capRgba[o + 0] = clamp(Math.round(capRgba[o + 0] * knurl * rim), 20, 255);
      capRgba[o + 1] = clamp(Math.round(capRgba[o + 1] * knurl * rim), 16, 255);
      capRgba[o + 2] = clamp(Math.round(capRgba[o + 2] * knurl * rim), 8, 255);
      capRgba[o + 3] = 255;
    }
  }
  const qCap = quantize4BitWeighted(capRgba, 16, 16, { transparentKey0: false, dither: 0.12 });

  // 5. ti=9 (64x64 16c): DISCRETE GLOWING GOLDEN AURA HALO (for PS1 Hardware Additive ABR=1, fl=0x18C3!)
  //    CRITICAL PS1 HARDWARE PROPERTY:
  //    - pal15[0] = 0x7C1F -> becomes 0x0000 transparent cutout (outer corners completely invisible!)
  //    - pal15[1..15] -> automatically get bit 15 (0x8000 STP) set by SLUS @ 0x80052090!
  //    - With ABR=1 (Back + Fore), pure black adds 0 (seamless fade!), soft warm gold adds a
  //      discrete luminous golden glow around the bottle silhouette, and tiny 4-point sparkles twinkle!
  const auraRgba = Buffer.alloc(64 * 64 * 4, 0);
  // 6 tiny delicate golden starlight glints placed gracefully around the bottle silhouette
  const sparkles = [
    [13, 18, 4.2, 1.0],
    [51, 24, 3.8, 0.9],
    [10, 42, 3.5, 0.85],
    [53, 47, 4.0, 0.95],
    [22, 8,  3.2, 0.8],
    [44, 12, 3.0, 0.75],
  ];

  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      // Elliptical bottle-shaped silhouette halo centered at (32, 32):
      // Subtle ring-peaked golden glow strongest right outside the bottle contour (d ~ 0.45..0.75)
      // and smoothly fading to 0 at edges (d >= 0.96) so ZERO rectangular box edge EVER shows!
      const dx = (x - 31.5) / 29.0;
      const dy = (y - 32.0) / 30.0;
      const d = Math.hypot(dx, dy);

      // Soft discrete golden aura intensity (capped intentionally low ~0.48 so it stays DISCRETE and never washes out the 51 label!)
      let glow = 0;
      if (d < 0.96) {
        const outerFade = Math.pow(clamp(1.0 - d / 0.96, 0, 1), 1.85);
        // Slightly stronger around the rim of the bottle (d ~ 0.35..0.68), gentler right over center
        const ringBoost = 0.55 + 0.55 * Math.exp(-Math.pow((d - 0.52) / 0.28, 2));
        glow = outerFade * ringBoost * 0.52;
      }

      // Add delicate 4-point starlight sparkles!
      let sp = 0;
      for (const [sx, sy, sr, si] of sparkles) {
        const adx = Math.abs(x - sx), ady = Math.abs(y - sy);
        if (adx > sr + 1 && ady > sr + 1) continue;
        const core = Math.exp(-(adx * adx + ady * ady) / 1.4);
        const cross = (Math.exp(-adx * 1.1) * Math.exp(-ady / (sr * 0.65)) +
                       Math.exp(-ady * 1.1) * Math.exp(-adx / (sr * 0.65))) * 0.45;
        sp = Math.max(sp, (core + cross) * si);
      }

      const total = clamp(glow + sp * 0.78, 0, 1);
      const o = (y * 64 + x) * 4;
      if (total < 0.035) {
        auraRgba[o] = 0; auraRgba[o + 1] = 0; auraRgba[o + 2] = 0; auraRgba[o + 3] = 0;
      } else {
        // Warm amber-gold aura -> pale sunlit gold at sparkle tips!
        const r = clamp(Math.round(total * 215 + sp * 40), 10, 255);
        const g = clamp(Math.round(total * 164 + sp * 55), 8, 240);
        const b = clamp(Math.round(total * 34  + sp * 85), 2, 160);
        auraRgba[o + 0] = r;
        auraRgba[o + 1] = g;
        auraRgba[o + 2] = b;
        auraRgba[o + 3] = 255;
      }
    }
  }

  // Build exact monotonically smooth 15-level golden ramp palette + pal[0]=0x7C1F!
  const auraAnchors = [
    [24, 16, 2, 18],
    [48, 34, 6, 18],
    [76, 56, 10, 18],
    [108, 80, 16, 18],
    [142, 108, 24, 18],
    [186, 148, 42, 18],
    [246, 218, 118, 22], // bright sparkle star core
  ];
  const qAura = quantize4BitWeighted(auraRgba, 64, 64, {
    transparentKey0: true,
    anchors: auraAnchors,
    dither: 0.22,
  });

  return { qLabel, qNeck, qBase, qCap, qAura, auraRgba };
}

function build51BottleAndAuraMesh() {
  // Sculpted 8-sided 3D Garrafa de Cachaca 51 matching fitas_51.png proportions!
  // Height: Y = -92 (cap top) to Y = +84 (glass base) -> 176 units tall!
  // Radius: r = 27 body (54 dia), sleek shoulder, slim glass neck, iconic tall yellow cap!
  const rings = [
    { y: +84, r: 24 }, // 0: glass base bottom bevel
    { y: +72, r: 27 }, // 1: label bottom / heavy glass base top
    { y:  -6, r: 27 }, // 2: label top (huge crisp 78-unit tall Pirassununga 51 label!)
    { y: -36, r: 15 }, // 3: curved glass shoulder (embossed 51!)
    { y: -62, r: 10 }, // 4: slim clear glass neck top (base of yellow cap)
    { y: -92, r: 11 }, // 5: tall iconic golden-yellow "51" cap top!
  ];
  const N = 8;
  const verts = [];
  for (const ring of rings) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI * 0.5;
      verts.push([Math.round(Math.cos(a) * ring.r), ring.y, Math.round(Math.sin(a) * ring.r)]);
    }
  }

  // items.psx RGBs bright neutral daylight shading:
  //   235=[255,255,255], 229=[255,255,240], 208=[206,206,206], 206=[184,201,206], 196=[158,173,211]
  // Note: PS1 Gouraud multiplies texture * (RGB / 128); 128 is 1.0x! Let's use balanced 110..175 indices from items.psx!
  // Wait: let's stick with clean neutral bright indices we verified in items.psx (208=[206,206,206] specular, 206=[184,201,206], 108=[95,109,145])
  // Even better: for opaque bottle faces use fl=0x1003 (flat neutral [144,144,144,0x2c]) or fl=0x0003 with slight cylindrical shading per panel!
  // Using flat per-face RGB [r,g,b,0x2c] (fl=0x1003) lets us dial EXACT neutral sunlit brightness (148 front, 134 side, 118 shadow -> ZERO blue cast, 100% pure colors!!)!
  const panelLit = [132, 152, 158, 144, 126, 114, 120, 128];

  const norms = [];
  const faces = [];

  const addBand = (ringBot, ringTop, ti, vTop, vBot, wrapRepeats = 2, uMax = 63) => {
    const panelsPerRepeat = N / wrapRepeats;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const v = [ringTop * N + i, ringTop * N + j, ringBot * N + i, ringBot * N + j];
      const midA = ((i + 0.5) / N) * Math.PI * 2 - Math.PI * 0.5;
      const dr = rings[ringBot].r - rings[ringTop].r;
      const dy = rings[ringBot].y - rings[ringTop].y;
      const outN = vecNorm4096([dy * Math.cos(midA), -dr, dy * Math.sin(midA)]);
      assertPs1QuadWinding(verts, v, outN, `51_band_${ringBot}_${ringTop}_${i}`);
      const ni = norms.length;
      norms.push(outN);

      const seg = i % panelsPerRepeat;
      const u0 = Math.round((seg / panelsPerRepeat) * uMax);
      const u1 = Math.round(((seg + 1) / panelsPerRepeat) * uMax);
      const c = panelLit[i];
      faces.push({
        fl: 0x1003, // Textured flat quad with direct neutral RGB [c, c, c, 0x2c]!
        v,
        rgb: [c, c, c, 0x2c],
        ni,
        ti,
        uv: [u0, vTop, u1, vTop, u0, vBot, u1, vBot],
      });
    }
  };

  // Band 0 -> 1: Heavy Clear Glass Base (ti=8, 64x16)
  addBand(0, 1, 8, 0, 15, 2, 63);
  // Band 1 -> 2: Iconic Pirassununga 51 Label (ti=5, 64x64, full 64x64 dedicated!)
  addBand(1, 2, 5, 0, 63, 2, 63);
  // Band 2 -> 3: Curved Clear Glass Shoulder (ti=7, 64x16 lower half v=8..15)
  addBand(2, 3, 7, 7, 15, 2, 63);
  // Band 3 -> 4: Slim Clear Glass Neck + Liquid Line (ti=7, 64x16 upper half v=0..7)
  addBand(3, 4, 7, 0, 7, 2, 63);
  // Band 4 -> 5: Tall Iconic Golden-Yellow "51" Cap (ti=6, 16x16)
  addBand(4, 5, 6, 0, 15, 2, 15);

  // Close Octagonal Yellow Cap Top (Ring 5, Y = -92, ti=6)
  const capBase = 5 * N;
  const nUp = norms.length; norms.push([0, -4095, 0]);
  for (const [qi, v] of [[0, [capBase + 1, capBase + 0, capBase + 2, capBase + 7]], [1, [capBase + 2, capBase + 7, capBase + 3, capBase + 6]], [2, [capBase + 3, capBase + 6, capBase + 4, capBase + 5]]]) {
    assertPs1QuadWinding(verts, v, [0, -4095, 0], `51_capTop_${qi}`);
    faces.push({ fl: 0x1003, v, rgb: [152, 152, 152, 0x2c], ni: nUp, ti: 6, uv: [4, 2, 11, 2, 4, 5, 11, 5] });
  }

  // Close Octagonal Glass Bottom (Ring 0, Y = +84, ti=8)
  const nDn = norms.length; norms.push([0, 4095, 0]);
  for (const [qi, v] of [[0, [0, 1, 7, 2]], [1, [7, 2, 6, 3]], [2, [6, 3, 5, 4]]]) {
    assertPs1QuadWinding(verts, v, [0, 4095, 0], `51_bot_${qi}`);
    faces.push({ fl: 0x1003, v, rgb: [120, 120, 120, 0x2c], ni: nDn, ti: 8, uv: [16, 4, 48, 4, 16, 12, 48, 12] });
  }

  // ---- DISCRETE SHIMMERING GOLDEN AURA (2 crossed double-sided vertical planes = 4 additive quads!) ----
  // Using fl = 0x10C3 = 0x1000 | 0x0080 (ABR=1 Additive B+F) | 0x0040 (Semi-Trans ON) | 0x0003 (Textured Quad)
  // Direct neutral-gold RGB modulation [118, 108, 72, 0x2e] keeps the golden glow DISCRETE, warm, and sparkling!
  const auraR = 54, auraYTop = -112, auraYBot = +100;
  for (let ai = 0; ai < 2; ai++) {
    const ang = (ai * Math.PI) / 2 + Math.PI / 4; // 45 deg and 135 deg crossed star planes -> visible from ALL 360 deg!
    const cx = Math.round(Math.cos(ang) * auraR);
    const cz = Math.round(Math.sin(ang) * auraR);
    const baseV = verts.length;
    verts.push([-cx, auraYTop, -cz]); // 0: TL
    verts.push([+cx, auraYTop, +cz]); // 1: TR
    verts.push([-cx, auraYBot, -cz]); // 2: BL
    verts.push([+cx, auraYBot, +cz]); // 3: BR

    const outN1 = vecNorm4096([-cz, 0, cx]);
    const outN2 = [-outN1[0], 0, -outN1[2]];
    const ni1 = norms.length; norms.push(outN1);
    const ni2 = norms.length; norms.push(outN2);

    // Side 1
    let v1 = [baseV + 0, baseV + 1, baseV + 2, baseV + 3];
    const dCheck = vecDot(vecCross(vecSub(verts[v1[1]], verts[v1[0]]), vecSub(verts[v1[2]], verts[v1[0]])), outN1);
    if (dCheck >= 0) v1 = [baseV + 1, baseV + 0, baseV + 3, baseV + 2];
    assertPs1QuadWinding(verts, v1, outN1, `51_aura_${ai}_A`);
    faces.push({
      fl: 0x10c3, // PS1 Hardware Additive Semi-Transparent Textured Quad (ABR=1: Back + Fore)!
      v: v1,
      rgb: [116, 104, 68, 0x2e],
      ni: ni1,
      ti: 9,
      uv: [0, 0, 63, 0, 0, 63, 63, 63],
    });

    // Side 2 (reverse winding for back side!)
    const v2 = [v1[1], v1[0], v1[3], v1[2]];
    assertPs1QuadWinding(verts, v2, outN2, `51_aura_${ai}_B`);
    faces.push({
      fl: 0x10c3,
      v: v2,
      rgb: [116, 104, 68, 0x2e],
      ni: ni2,
      ti: 9,
      uv: [63, 0, 0, 0, 63, 63, 0, 63],
    });
  }

  const meshBuf = serializeMesh({ unk0: 8, verts, norms, faces });
  return { meshBuf, stats: { nV: verts.length, nN: norms.length, nF: faces.length, bytes: meshBuf.length } };
}

function patchSecretTape51InItemsPsx(itemsBuf, bottle51Cut) {
  const info = inspectPsxTables(itemsBuf);
  const tapeIdx = info.meshHashes.indexOf(HASH_SECRET_TAPE);
  if (tapeIdx !== 8) throw new Error(`Secret Tape M[8] esperado, encontrado M[${tapeIdx}]`);

  const arts = build51BottleAndAuraTextures(bottle51Cut);
  const { meshBuf, stats } = build51BottleAndAuraMesh();

  // Replace M[8] mesh
  let out = replaceMeshInPsx(itemsBuf, tapeIdx, meshBuf);

  // Overwrite the 5 dedicated M[8] textures IN-PLACE (exact same dimensions & 4-bit format -> 0 B texture growth!)
  const afterInfo = inspectPsxTables(out);
  const applyTex = (ti, q) => {
    const t = afterInfo.textures.find(x => x.texIdx === ti);
    if (!t || t.w !== q.w || t.h !== q.h || t.palSize !== 16) {
      throw new Error(`items.psx ti=${ti} mismatch: got ${t?.w}x${t?.h}, want ${q.w}x${q.h}`);
    }
    for (let c = 0; c < 16; c++) out.writeUInt16LE(q.palBgr555[c], t.palInfo.offset + c * 2);
    q.packed.copy(out, t.dataOff);
  };
  applyTex(5, arts.qLabel);
  applyTex(6, arts.qCap);
  applyTex(7, arts.qNeck);
  applyTex(8, arts.qBase);
  applyTex(9, arts.qAura);

  const maxBytes = 20 * 2048; // 40,960 B exact original 20 sectors!
  if (out.length > maxBytes) {
    throw new Error(`items.psx overflow apos Garrafa 51: ${out.length} B > ${maxBytes} B!`);
  }
  return { buf: out, stats, arts };
}

// ============================================================================
// PART 4: School II Hall Passes -> 3D Inflated Pacote de Vento Estocado
//         (sksl2_o.psx M[4] + sksl2_l.psx / sksl2_l2.psx)
// ============================================================================

function buildVentoEstocadoTexture48x64(ventoCut) {
  const bb = ventoCut.bbox;
  // Per-scanline exact pouch un-pinch sampling: maps EVERY row's true cutout pouch span [rowL..rowR]
  // edge-to-edge across 48x64 -> 100% removes dashed cyan borders, ZERO side-view gap/slit on 3D pillow,
  // AND unlocks all 16 full opaque foil colors (no wasted transparent slot!)!
  const rowSpan = [];
  for (let y = 0; y < ventoCut.h; y++) {
    let lx = ventoCut.w, rx = -1;
    for (let x = 0; x < ventoCut.w; x++) {
      if (ventoCut.mask[y * ventoCut.w + x]) { if (x < lx) lx = x; if (x > rx) rx = x; }
    }
    rowSpan.push([lx, rx]);
  }
  const rgba = Buffer.alloc(48 * 64 * 4, 255);
  for (let dy = 0; dy < 64; dy++) {
    const sy0 = bb.minY + (dy / 64) * bb.bh;
    const sy1 = bb.minY + ((dy + 1) / 64) * bb.bh;
    const iy0 = Math.max(bb.minY, Math.floor(sy0));
    const iy1 = Math.min(bb.maxY, Math.ceil(sy1) - 1);
    for (let dx = 0; dx < 48; dx++) {
      let rS = 0, gS = 0, bS = 0, wS = 0;
      for (let sy = iy0; sy <= iy1; sy++) {
        const [rl, rr] = rowSpan[sy];
        if (rr <= rl) continue;
        // Inset 2px from detected border so zero pale-cyan margin fringe ever leaks!
        const xMin = Math.min(rr, rl + 2), xMax = Math.max(xMin + 1, rr - 1);
        const spanW = xMax - xMin;
        const fx0 = xMin + (dx / 48) * spanW;
        const fx1 = xMin + ((dx + 1) / 48) * spanW;
        const ix0 = Math.max(xMin, Math.floor(fx0));
        const ix1 = Math.min(xMax - 1, Math.ceil(fx1) - 1);
        for (let sx = ix0; sx <= ix1; sx++) {
          const o = (sy * ventoCut.w + sx) * 4;
          rS += ventoCut.rgba[o]; gS += ventoCut.rgba[o + 1]; bS += ventoCut.rgba[o + 2]; wS++;
        }
      }
      const o = (dy * 48 + dx) * 4;
      if (wS > 0) {
        const r = clamp(Math.round(((rS / wS) - 128) * 1.12 + 128), 4, 255);
        const g = clamp(Math.round(((gS / wS) - 128) * 1.12 + 128), 4, 255);
        const b = clamp(Math.round(((bS / wS) - 128) * 1.12 + 128), 4, 255);
        // Subtle metallic silver-blue crimped foil seal lines at top & bottom 2 rows!
        const crimp = (dy <= 1 || dy >= 62) ? ((dx & 1) ? 1.12 : 0.84) : 1.0;
        rgba[o + 0] = clamp(Math.round(r * crimp), 4, 255);
        rgba[o + 1] = clamp(Math.round(g * crimp), 4, 255);
        rgba[o + 2] = clamp(Math.round(b * crimp), 4, 255);
      }
      rgba[o + 3] = 255;
    }
  }
  return quantize4BitWeighted(rgba, 48, 64, {
    transparentKey0: false,
    anchors: [
      [252, 252, 252, 28],  // crisp white "VENTO ESTOCADO" text
      [220, 18, 18, 30],    // vivid red Dilma outfit
      [158, 12, 14, 18],    // shaded red dress fold
      [28, 148, 242, 24],   // bright metallic sky-blue foil bag
      [12, 82, 186, 22],    // deep royal blue bag body
      [6, 36, 108, 18],     // dark navy bag crease/shadow
      [120, 212, 252, 18],  // bright cyan foil sheen highlight
      [226, 178, 152, 22],  // Dilma face/arm skin tone
      [28, 24, 24, 18],     // dark shoe / hair / tornado contrast
    ],
    weightFn: (x, y, r, g, b) => {
      if (r > 150 && g < 70 && b < 70) return 4.0;
      if (y >= 4 && y <= 28 && r > 210 && g > 210 && b > 210) return 3.5;
      if (y >= 30 && y <= 44 && x >= 32) return 3.0;
      return 1.0;
    },
    dither: 0.14,
  });
}

function buildVentoEstocadoMesh() {
  // True 3D sculpted inflated chip-bag / pillow-pouch (12 verts, 5 normals, 10 quads = 444 B):
  //   Outer crimped foil corners at Z = 0: X in [-76..+76] (152 wide), Y in [-112..+106] (218 tall)
  //   Puffed pillow belly curving outward to Z = +28 (front) and Z = -28 (back)!
  const W = 76, YT = -112, YB = 106;
  const IW = 46, IYT = -54, IYB = 50, ZP = 28;

  const verts = [
    // 0..3: Outer crimped foil perimeter (Z = 0)
    [-W,  YT,   0], // 0: TL
    [+W,  YT,   0], // 1: TR
    [-W,  YB,   0], // 2: BL
    [+W,  YB,   0], // 3: BR
    // 4..7: Front inflated pillow crest (Z = +ZP)
    [-IW, IYT, +ZP], // 4: FTL
    [+IW, IYT, +ZP], // 5: FTR
    [-IW, IYB, +ZP], // 6: FBL
    [+IW, IYB, +ZP], // 7: FBR
    // 8..11: Back inflated pillow crest (Z = -ZP)
    [-IW, IYT, -ZP], // 8: BTL
    [+IW, IYT, -ZP], // 9: BTR
    [-IW, IYB, -ZP], // 10: BBL
    [+IW, IYB, -ZP], // 11: BBR
  ];

  const norms = [
    [0, 0,  4095], // 0: +Z front
    [0, 0, -4095], // 1: -Z back
    [ 2896, 0,  2896], // 2: right/front bevel
    [-2896, 0,  2896], // 3: left/front bevel
    [0, -2896,  2896], // 4: top/bot bevel
  ];

  // In PS1 right-handed space:
  //   - Looking at the +Z front side (from +Z toward -Z): +X is viewer's LEFT, -X is viewer's RIGHT -> u = (W - x)/(2W)!
  //   - Looking at the -Z back  side (from -Z toward +Z): -X is viewer's LEFT, +X is viewer's RIGHT -> u = (x + W)/(2W)!
  // Both sides read "VENTO ESTOCADO" 100% left-to-right!
  const uvOf = (vi) => {
    const [x, y] = verts[vi];
    return [
      clamp(Math.round((W - x) / (2 * W) * 47), 0, 47),
      clamp(Math.round((y - YT) / (YB - YT) * 63), 0, 63),
    ];
  };
  const uvOfBack = (vi) => {
    const [x, y] = verts[vi];
    return [
      clamp(Math.round((x + W) / (2 * W) * 47), 0, 47),
      clamp(Math.round((y - YT) / (YB - YT) * 63), 0, 63),
    ];
  };

  const faces = [];
  const emitQuad = (v, outN, ni, isBack, bright) => {
    // Auto-orient Z-order [v0,v1,v2,v3] to satisfy exact PS1 front-facing winding law!
    let q = v;
    const d1 = vecDot(vecCross(vecSub(verts[q[1]], verts[q[0]]), vecSub(verts[q[2]], verts[q[0]])), outN);
    if (d1 >= 0) q = [v[1], v[0], v[3], v[2]];
    assertPs1QuadWinding(verts, q, outN, `Vento_${isBack ? 'B' : 'F'}_${faces.length}`);
    const uv = [];
    for (const vi of q) {
      const [u, vv] = isBack ? uvOfBack(vi) : uvOf(vi);
      uv.push(u, vv);
    }
    faces.push({ fl: 0x2003, v: q, rgb: [bright, bright, bright, 0x2c], ni, ti: 14, uv });
  };

  // Front 5 pillow quads (+Z outward)
  emitQuad([4, 5, 6, 7], [0, 0, 4095], 0, false, 150);        // Center inflated belly
  emitQuad([0, 1, 4, 5], [0, -2400, 3300], 4, false, 162);    // Top glossy foil slope
  emitQuad([6, 7, 2, 3], [0, +2400, 3300], 4, false, 126);    // Bottom shaded foil slope
  emitQuad([0, 4, 2, 6], [-2800, 0, 2980], 3, false, 136);    // Left curved gusset
  emitQuad([5, 1, 7, 3], [+2800, 0, 2980], 2, false, 142);    // Right curved gusset

  // Back 5 pillow quads (-Z outward)
  emitQuad([8, 9, 10, 11], [0, 0, -4095], 1, true, 146);      // Back inflated belly
  emitQuad([0, 1, 8, 9], [0, -2400, -3300], 4, true, 158);    // Back top slope
  emitQuad([10, 11, 2, 3], [0, +2400, -3300], 4, true, 122);  // Back bottom slope
  emitQuad([0, 8, 2, 10], [-2800, 0, -2980], 3, true, 134);   // Back left gusset
  emitQuad([9, 1, 11, 3], [+2800, 0, -2980], 2, true, 140);   // Back right gusset

  const meshBuf = serializeMesh({ unk0: 8, verts, norms, faces });
  return { meshBuf, verts, faces, stats: { nV: verts.length, nN: norms.length, nF: faces.length, bytes: meshBuf.length } };
}

function patchSchool2VentoEstocado(sksl2O, sksl2L, sksl2L2, ventoCut) {
  const ventoTex = buildVentoEstocadoTexture48x64(ventoCut);
  const ventoMesh = buildVentoEstocadoMesh();

  // First, check sksl2_o.psx free space: if M[5] (Dilma) has 8 normals, compact its normals to 5 distinct normals
  // (-24 B, zero visual change!) so M[4] (444 B) + M[5] (564 B) both fit with 8 B spare inside 6,144 B!
  let newO = sksl2O;
  const oInfo = inspectPsxTables(newO);
  const passIdx = oInfo.meshHashes.indexOf(HASH_HALL_PASS_MESH);
  if (passIdx !== 4) throw new Error(`School II Hall Pass M[4] esperado, encontrado M[${passIdx}]`);

  // Compact redundant normals in M[5] (Dilma) if needed
  const m5o = oInfo.meshOffs[5], m5End = oInfo.ptrMeta;
  const nV5 = newO.readUInt16LE(m5o + 2), nN5 = newO.readUInt16LE(m5o + 4), nF5 = newO.readUInt16LE(m5o + 6);
  if (nN5 > 4) {
    // M[5] uses flat/prelit Gouraud shading (RGBs), normals are only needed for 4 horizontal arc angles -> compact 8 -> 4 saves 32 B!
    const v5 = [], n5 = [], f5 = [];
    for (let i = 0; i < nV5; i++) v5.push([newO.readInt16LE(m5o + 28 + i * 8), newO.readInt16LE(m5o + 28 + i * 8 + 2), newO.readInt16LE(m5o + 28 + i * 8 + 4)]);
    for (let i = 0; i < 4; i++) n5.push([newO.readInt16LE(m5o + 28 + nV5 * 8 + i * 8), newO.readInt16LE(m5o + 28 + nV5 * 8 + i * 8 + 2), newO.readInt16LE(m5o + 28 + nV5 * 8 + i * 8 + 4)]);
    let fp = m5o + 28 + nV5 * 8 + nN5 * 8;
    for (let fi = 0; fi < nF5 && fp + 4 <= m5End; fi++) {
      const fl = newO.readUInt16LE(fp), flen = newO.readUInt16LE(fp + 2);
      f5.push({
        fl, v: [newO[fp + 4], newO[fp + 5], newO[fp + 6], newO[fp + 7]],
        rgb: [newO[fp + 8], newO[fp + 9], newO[fp + 10], newO[fp + 11]],
        ni: newO.readUInt16LE(fp + 12) % 4,
        ti: newO.readUInt32LE(fp + 16),
        uv: Array.from(newO.subarray(fp + 20, fp + 28)),
      });
      fp += flen;
    }
    newO = replaceMeshInPsx(newO, 5, serializeMesh({ unk0: newO.readUInt16LE(m5o), verts: v5, norms: n5, faces: f5 }));
  }

  newO = replaceMeshInPsx(newO, passIdx, ventoMesh.meshBuf);
  if (newO.length > 6144) throw new Error(`sksl2_o.psx overflow apos Vento Estocado: ${newO.length} B > 6144 B!`);

  const patchL = (lBuf, label) => {
    const out = rebuildPsxTextures(lBuf, ({ pal4, texRecs }) => {
      const passRec = texRecs.find(t => t.hash === HASH_HALL_PASS_TEX);
      const keyRec  = texRecs.find(t => t.hash === HASH_HALL_KEY_TEX);
      if (!passRec || !keyRec) throw new Error(`Texturas de Hall Pass ausentes em ${label}!`);

      // Shrink unused key texture 0xcf459305 (16x64 256c = 1024 B -> 4x4 256c = 16 B, frees 1008 B!)
      keyRec.w = 4;
      keyRec.h = 4;
      keyRec.rawPixels = Buffer.alloc(16, 0);

      // Upgrade Hall Pass texture 0xaadfea6c (48x32 -> 48x64 16c, pal0=0x7C1F!)
      const p4 = pal4.find(p => p.id === passRec.palId);
      if (!p4) throw new Error(`Paleta 4-bit de 0xaadfea6c nao encontrada em ${label}`);
      p4.data = palBgr555ToBuf(ventoTex.palBgr555);
      passRec.w = 48;
      passRec.h = 64;
      passRec.rawPixels = ventoTex.packed;
    });
    const maxBytes = 167 * 2048; // 342,016 B exact!
    if (out.length > maxBytes) throw new Error(`${label} overflow: ${out.length} > ${maxBytes}`);
    return out;
  };

  const newL  = patchL(sksl2L,  'sksl2_l.psx');
  const newL2 = patchL(sksl2L2, 'sksl2_l2.psx');
  return { newO, newL, newL2, ventoTex, ventoMesh };
}

// ============================================================================
// PART 5A: School II Golf Cart Driver -> Sculpted 3D Bolsonaro Doidao Head!
//          (c_kart.psx WAD[1100], M[0] hash 0x0aaf35e6)
// ============================================================================

function buildBolsonaroKartTextures(bolsoCut) {
  const bb = bolsoCut.bbox;

  // 1. ti=10 (48x52 16c, 1,248 B): High-detail Bolsonaro Doidao caricature face!
  //    Sample the full caricature head cleanly; fill any transparent outside corners with hair/skin tone
  //    so edge UV clamping on the 3D cranial dome NEVER exposes magenta or harsh black seams!
  const rawFace = resampleRgbaArea(
    bolsoCut.rgba, bolsoCut.w, bolsoCut.h,
    bb.minX + bb.bw * 0.04, bb.minY + bb.bh * 0.02,
    bb.maxX - bb.bw * 0.04, bb.maxY - bb.bh * 0.01,
    48, 52, -1
  );
  // Fill outside-silhouette pixels with nearest warm hair/neck color (opaque 3D head texture!)
  const faceRgba = Buffer.from(rawFace);
  for (let y = 0; y < 52; y++) {
    for (let x = 0; x < 48; x++) {
      const o = (y * 48 + x) * 4;
      const a = rawFace[o + 3] / 255;
      if (a >= 0.96) { faceRgba[o + 3] = 255; continue; }
      // Hair color in upper 58%, warm neck/jaw tone in lower 42%
      const bgR = y < 30 ? 96 : 168;
      const bgG = y < 30 ? 86 : 108;
      const bgB = y < 30 ? 74 : 84;
      faceRgba[o + 0] = clamp(Math.round(lerp(bgR, rawFace[o + 0], a)), 0, 255);
      faceRgba[o + 1] = clamp(Math.round(lerp(bgG, rawFace[o + 1], a)), 0, 255);
      faceRgba[o + 2] = clamp(Math.round(lerp(bgB, rawFace[o + 2], a)), 0, 255);
      faceRgba[o + 3] = 255;
    }
  }
  const qFace = quantize4BitWeighted(faceRgba, 48, 52, {
    transparentKey0: false,
    anchors: [
      [250, 252, 252, 32],  // wide bulging white eyeballs & big toothy grin!
      [118, 178, 172, 24],  // crazy pale cyan-green irises!
      [238, 174, 146, 26],  // bright warm skin highlight (forehead/nose/cheeks)
      [212, 134, 102, 24],  // mid skin tone
      [166, 86, 60, 22],    // deep skin crease / smile wrinkles
      [108, 46, 28, 24],    // furrowed dark brown eyebrows & mouth interior!
      [34, 22, 16, 24],     // pupils & tooth outline
      [172, 166, 154, 18],  // silver-grey temples/hair highlight
      [96, 84, 68, 18],     // dark brown-grey swept hair
    ],
    weightFn: (x, y) => {
      // Extra weight on eyes (y=17..28) and maniacal grin (y=34..46)!
      if (x >= 10 && x <= 38 && y >= 16 && y <= 29) return 4.5;
      if (x >= 12 && x <= 36 && y >= 33 && y <= 46) return 4.0;
      return 1.0;
    },
    dither: 0.14,
  });

  // 2. ti=11 (8x16 16c, 64 B): Pure combed brown-silver Bolsonaro hair texture for crown/sides/back (ZERO forehead skin!)
  const hairRgba = Buffer.alloc(8 * 16 * 4, 255);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 8; x++) {
      // Natural combed silver-streaked dark brown/ash hair matching Bolsonaro's caricature temples & crown!
      const strand = Math.sin(x * 1.9 + y * 0.45) * 0.5 + 0.5;
      const silverMix = (y >= 4 && y <= 12) ? (0.35 + 0.35 * strand) : (0.15 + 0.25 * strand);
      const shade = 0.72 + 0.28 * (1 - y / 16);
      const baseR = lerp(64, 168, silverMix) * shade;
      const baseG = lerp(54, 162, silverMix) * shade;
      const baseB = lerp(42, 148, silverMix) * shade;
      const o = (y * 8 + x) * 4;
      hairRgba[o + 0] = clamp(Math.round(baseR), 24, 220);
      hairRgba[o + 1] = clamp(Math.round(baseG), 20, 215);
      hairRgba[o + 2] = clamp(Math.round(baseB), 16, 205);
      hairRgba[o + 3] = 255;
    }
  }
  const qHair = quantize4BitWeighted(hairRgba, 8, 16, { transparentKey0: false, dither: 0.12 });

  return { qFace, qHair, faceRgba };
}

function patchSchool2KartBolsonaro(origKartBuf, bolsoCut) {
  const info = inspectPsxTables(origKartBuf);
  const arts = buildBolsonaroKartTextures(bolsoCut);

  const mo = info.meshOffs[0], mEnd = info.ptrMeta;
  const nV = origKartBuf.readUInt16LE(mo + 2);
  const nN = origKartBuf.readUInt16LE(mo + 4);
  const nF = origKartBuf.readUInt16LE(mo + 6);
  const vOff = mo + 28, nOff = vOff + nV * 8;
  let fp = nOff + nN * 8;

  const verts = [];
  for (let i = 0; i < nV; i++) {
    verts.push([
      origKartBuf.readInt16LE(vOff + i * 8),
      origKartBuf.readInt16LE(vOff + i * 8 + 2),
      origKartBuf.readInt16LE(vOff + i * 8 + 4),
    ]);
  }
  const norms = [];
  for (let i = 0; i < nN; i++) {
    norms.push([
      origKartBuf.readInt16LE(nOff + i * 8),
      origKartBuf.readInt16LE(nOff + i * 8 + 2),
      origKartBuf.readInt16LE(nOff + i * 8 + 4),
    ]);
  }

  // Keep ALL non-head/cap faces (everything except ti=10, 11, 12!) 100% BYTE-FOR-BYTE INTACT!
  // Also record normal indices freed by the 18 removed head/cap faces so we reuse them (0 B normal growth!).
  const keptRawFaces = [];
  const usedNorms = new Set();
  const freedNorms = [];
  for (let fi = 0; fi < nF && fp + 4 <= mEnd; fi++) {
    const fl = origKartBuf.readUInt16LE(fp);
    const flen = origKartBuf.readUInt16LE(fp + 2);
    const ni = origKartBuf.readUInt16LE(fp + 12);
    const ti = (flen >= 20 && (fl & 1)) ? origKartBuf.readUInt32LE(fp + 16) : -1;
    if (ti !== 10 && ti !== 11 && ti !== 12) {
      keptRawFaces.push(Buffer.from(origKartBuf.subarray(fp, fp + flen)));
      usedNorms.add(ni);
    } else {
      freedNorms.push(ni);
    }
    fp += flen;
  }
  const reusableNorms = freedNorms.filter(ni => !usedNorms.has(ni));

  // Build Sculpted Watertight 3D Caricature Head of Bolsonaro Doidao!
  // Coordinate system of c_kart.psx M[0] (verified!):
  //   Neck base connected to torso (ti=9):
  //     V[65]=(592,-513,578) Back-Right, V[66]=(464,-513,578) Back-Left
  //     V[67]=(436,-481,399) Front-Left, V[68]=(621,-481,399) Front-Right
  //   Driver looks toward -Z (front of golf cart)! Roof is at Y = -1254 (tons of room!).
  //   Center X = 528. Let's make Bolsonaro's head expressive & slightly oversized (~1.22x caricature):
  //     Width X: [324..732] (408 wide), Height Y: [-980..-465] (515 tall), Depth Z: [120..650] (530 deep)!
  //
  //   Reuse freed vertex slots V[69..75, 77..80] (11 slots) + append 5 new verts (total 16 cranial verts + 4 shared neck = 20)!
  const allocSlot = (() => {
    const freeSlots = [69, 70, 71, 72, 73, 74, 75, 77, 78, 79, 80];
    return (xyz) => {
      if (freeSlots.length > 0) {
        const idx = freeSlots.shift();
        verts[idx] = xyz;
        return idx;
      }
      const idx = verts.length;
      verts.push(xyz);
      return idx;
    };
  })();

  // Front sculpted 3D caricature grid (looking from -Z toward +Z: +X is viewer's LEFT, -X is viewer's RIGHT!):
  // Wait: verify viewer's left/right when standing IN FRONT of the golf cart (at Z = -1000 looking toward +Z)!
  // Remember PS1 right-handed space (+X right when looking toward +Z, +Y down):
  //   - Looking FROM front (-Z) TOWARD driver (+Z): +X is VIEWER'S RIGHT -> so u=0 (left of photo) is at -X (X=324), u=47 (right of photo) is at +X (X=732)!
  // Let's double check original c_kart F[78] (forehead): V[72]=(357,-837,213) u=11, V[73]=(699,-837,213) u=19 -> YES!! Smaller X = smaller U (left of photo), Larger X = larger U (right of photo)!!
  const CX = 528;
  // Row 0: Top of swept hair crown (Y = -980..-945)
  const vHairL = allocSlot([CX - 155, -935, 315]); // Left temple hair top
  const vHairC = allocSlot([CX,       -980, 245]); // Swept hair crest front-top
  const vHairR = allocSlot([CX + 155, -935, 315]); // Right temple hair top
  // Row 1: Forehead / Brow ridge (Y = -855)
  const vBrowL = allocSlot([CX - 196, -845, 290]); // Left side brow / temple
  const vBrowC = allocSlot([CX,       -855, 165]); // Furrowed brow center
  const vBrowR = allocSlot([CX + 196, -845, 290]); // Right side brow / temple
  // Row 2: Bulging Eyes & Nose / Cheekbones / Ears (Y = -695)
  const vEarL  = allocSlot([CX - 208, -685, 345]); // Left ear / cheekbone edge
  const vNoseC = allocSlot([CX,       -690, 118]); // Prominent caricature nose tip!
  const vEarR  = allocSlot([CX + 208, -685, 345]); // Right ear / cheekbone edge
  // Row 3: Maniacal Grinning Jaw / Chin (Y = -525..-475)
  const vJawL  = allocSlot([CX - 156, -540, 325]); // Left jaw corner
  const vChinC = allocSlot([CX,       -475, 195]); // Grinning chin tip!
  const vJawR  = allocSlot([CX + 156, -540, 325]); // Right jaw corner
  // Back of skull (4 verts closing the cranium smoothly & rounded to V[65..68] neck!)
  const vBackTopC = allocSlot([CX,       -945, 485]); // Rounded crown rear top
  const vBackMidL = allocSlot([CX - 170, -735, 575]); // Rounded occiput left
  const vBackMidR = allocSlot([CX + 170, -735, 575]); // Rounded occiput right
  const vBackLowC = allocSlot([CX,       -625, 610]); // Smooth lower skull rear

  // Reuse freed normal slots from removed security guard head/cap faces (0 B normal table growth!)
  const addNorm = (v) => {
    const nv = vecNorm4096(v);
    if (reusableNorms.length > 0) {
      const idx = reusableNorms.shift();
      norms[idx] = nv;
      return idx;
    }
    const idx = norms.length;
    norms.push(nv);
    return idx;
  };
  const normFront = addNorm([0, 0, -4095]);       // Front (-Z)
  const nFL = addNorm([-2600, 0, -3160]);   // Front-Left
  const nFR = addNorm([+2600, 0, -3160]);   // Front-Right
  const nTop = addNorm([0, -4095, 0]);      // Top (-Y)
  const nBack = addNorm([0, 0, +4095]);     // Back (+Z)
  const nBot = addNorm([0, +4095, 0]);      // Under-chin (+Y)

  // UV coordinates on 48x52 Bolsonaro face texture (ti=10):
  const faceUV = new Map([
    [vHairL, [7,  4]],  [vHairC, [24, 1]],  [vHairR, [40, 4]],
    [vBrowL, [3,  16]], [vBrowC, [24, 15]], [vBrowR, [44, 16]],
    [vEarL,  [1,  30]], [vNoseC, [24, 29]], [vEarR,  [46, 30]],
    [vJawL,  [8,  44]], [vChinC, [24, 51]], [vJawR,  [39, 44]],
  ]);

  // c_kart RGBs indices: 104=[202,190,152] bright sunlit, 96=[169,161,132] mid-bright, 76=[126,122,106] neutral, 58=[99,97,83] soft shadow
  const newHeadRawFaces = [];
  const pushFace = (isTri, vArr, outN, ni, ti, rgbIdxArr, uvs) => {
    let v = [...vArr];
    let r = [...rgbIdxArr];
    let u = [...uvs];
    if (isTri) {
      const d = vecDot(vecCross(vecSub(verts[v[1]], verts[v[0]]), vecSub(verts[v[2]], verts[v[0]])), outN);
      if (d >= 0) {
        v = [v[0], v[2], v[1]];
        r = [r[0], r[2], r[1]];
        u = [u[0], u[1], u[4], u[5], u[2], u[3]];
      }
      assertPs1TriWinding(verts, v, outN, `Bolso_tri_${newHeadRawFaces.length}`);
      const fb = Buffer.alloc(28, 0);
      fb.writeUInt16LE(0x3813, 0); // Gouraud textured tri (exact match to c_kart!)
      fb.writeUInt16LE(28, 2);
      fb[4] = v[0]; fb[5] = v[1]; fb[6] = v[2]; fb[7] = 0;
      fb[8] = r[0]; fb[9] = r[1]; fb[10] = r[2]; fb[11] = 0;
      fb.writeUInt16LE(ni, 12); fb.writeUInt16LE(0, 14);
      fb.writeUInt32LE(ti, 16);
      for (let k = 0; k < 6; k++) fb[20 + k] = u[k];
      newHeadRawFaces.push(fb);
    } else {
      const d = vecDot(vecCross(vecSub(verts[v[1]], verts[v[0]]), vecSub(verts[v[2]], verts[v[0]])), outN);
      if (d >= 0) {
        v = [v[1], v[0], v[3], v[2]];
        r = [r[1], r[0], r[3], r[2]];
        u = [u[2], u[3], u[0], u[1], u[6], u[7], u[4], u[5]];
      }
      assertPs1QuadWinding(verts, v, outN, `Bolso_quad_${newHeadRawFaces.length}`);
      const fb = Buffer.alloc(28, 0);
      fb.writeUInt16LE(0x3803, 0); // Gouraud textured quad (exact match to c_kart!)
      fb.writeUInt16LE(28, 2);
      fb[4] = v[0]; fb[5] = v[1]; fb[6] = v[2]; fb[7] = v[3];
      fb[8] = r[0]; fb[9] = r[1]; fb[10] = r[2]; fb[11] = r[3];
      fb.writeUInt16LE(ni, 12); fb.writeUInt16LE(0, 14);
      fb.writeUInt32LE(ti, 16);
      for (let k = 0; k < 8; k++) fb[20 + k] = u[k];
      newHeadRawFaces.push(fb);
    }
  };

  const addFaceQuad = (v0, v1, v2, v3, outN, ni, rgbs) => {
    const u0 = faceUV.get(v0), u1 = faceUV.get(v1), u2 = faceUV.get(v2), u3 = faceUV.get(v3);
    pushFace(false, [v0, v1, v2, v3], outN, ni, 10, rgbs, [...u0, ...u1, ...u2, ...u3]);
  };
  const addHairQuad = (v0, v1, v2, v3, outN, ni, rgbs) => {
    pushFace(false, [v0, v1, v2, v3], outN, ni, 11, rgbs, [0, 0, 7, 0, 0, 15, 7, 15]);
  };
  const addHairTri = (v0, v1, v2, outN, ni, rgbs) => {
    pushFace(true, [v0, v1, v2], outN, ni, 11, rgbs, [0, 0, 7, 0, 4, 15]);
  };

  // ---- 6 Front Sculpted Face Quads (ti=10, 48x52 Bolsonaro Doidao!) ----
  // Left & Right Forehead/Hairline
  addFaceQuad(vHairL, vHairC, vBrowL, vBrowC, [-1800, -1400, -3400], nFL, [76, 96, 76, 100]);
  addFaceQuad(vHairC, vHairR, vBrowC, vBrowR, [+1800, -1400, -3400], nFR, [96, 76, 100, 76]);
  // Left & Right Bulging Eyes / Cheeks / Prominent Nose Bridge
  addFaceQuad(vBrowL, vBrowC, vEarL,  vNoseC, [-2200,  -200, -3450], nFL, [76, 100, 76, 104]);
  addFaceQuad(vBrowC, vBrowR, vNoseC, vEarR,  [+2200,  -200, -3450], nFR, [100, 76, 104, 76]);
  // Left & Right Maniacal Grin / Jawline / Chin
  addFaceQuad(vEarL,  vNoseC, vJawL,  vChinC, [-2000,  +800, -3480], nFL, [76, 104, 69, 96]);
  addFaceQuad(vNoseC, vEarR,  vChinC, vJawR,  [+2000,  +800, -3480], nFR, [104, 76, 96, 69]);

  // ---- Watertight Hair Crown, Side Temples, Occiput Back & Neck Closure (ti=11 hair + ti=10 jaw under) ----
  // Crown top (2 tris)
  addHairTri(vHairL, vHairC, vBackTopC, [-1200, -3900, +400], nTop, [76, 96, 76]);
  addHairTri(vHairC, vHairR, vBackTopC, [+1200, -3900, +400], nTop, [96, 76, 76]);
  // Left side skull (2 quads)
  addHairQuad(vBackTopC, vHairL, vBackMidL, vBrowL, [-3600, -1400, +1300], nBack, [69, 76, 58, 69]);
  addHairQuad(vBackMidL, vBrowL, 66,        vEarL,  [-3800, +400,  +1200], nBack, [58, 69, 45, 58]);
  // Right side skull (2 quads)
  addHairQuad(vHairR, vBackTopC, vBrowR, vBackMidR, [+3600, -1400, +1300], nBack, [76, 69, 69, 58]);
  addHairQuad(vBrowR, vBackMidR, vEarR,  65,        [+3800, +400,  +1200], nBack, [69, 58, 58, 45]);
  // Back of skull (2 quads -> seamlessly meets neck V[65], V[66]!)
  addHairQuad(vBackTopC, vBackMidL, vBackMidR, vBackLowC, [0, -1400, +3850], nBack, [69, 58, 58, 58]);
  addHairQuad(vBackMidL, vBackMidR, 66, 65,               [0, +800,  +4000], nBack, [58, 58, 45, 45]);
  // Lower cheek & under-chin sealing cleanly to torso neck V[65..68] (clean quads -> saves 56 B!)
  pushFace(false, [vEarL, vJawL, 66, 67],   [-3300, +2300, +100], nBot, 10, [58, 58, 45, 45], [4, 34, 8, 44, 4, 48, 10, 48]);
  pushFace(false, [vJawR, vEarR, 68, 65],   [+3300, +2300, +100], nBot, 10, [58, 58, 45, 45], [39, 44, 44, 34, 38, 48, 44, 48]);
  pushFace(false, [vJawL, vChinC, 67, 68],  [0, +3800, -1500],    nBot, 10, [58, 69, 45, 45], [10, 46, 24, 51, 14, 50, 34, 50]);
  pushFace(true,  [vChinC, vJawR, 68],      [+1600, +3600, -1200], nBot, 10, [69, 58, 45],    [24, 51, 39, 44, 34, 50]);

  // Serialize rebuilt M[0] preserving original header flags, bbox & all kept cart faces + new Bolsonaro head!
  const allFacesBuf = Buffer.concat([...keptRawFaces, ...newHeadRawFaces]);
  const totalF = keptRawFaces.length + newHeadRawFaces.length;
  const hdr = Buffer.from(origKartBuf.subarray(mo, mo + 28));
  hdr.writeUInt16LE(verts.length, 2);
  hdr.writeUInt16LE(norms.length, 4);
  hdr.writeUInt16LE(totalF, 6);
  const vBuf = Buffer.alloc(verts.length * 8, 0);
  for (let i = 0; i < verts.length; i++) {
    vBuf.writeInt16LE(Math.round(verts[i][0]), i * 8);
    vBuf.writeInt16LE(Math.round(verts[i][1]), i * 8 + 2);
    vBuf.writeInt16LE(Math.round(verts[i][2]), i * 8 + 4);
  }
  const nBuf = Buffer.alloc(norms.length * 8, 0);
  for (let i = 0; i < norms.length; i++) {
    nBuf.writeInt16LE(clamp(Math.round(norms[i][0]), -4096, 4096), i * 8);
    nBuf.writeInt16LE(clamp(Math.round(norms[i][1]), -4096, 4096), i * 8 + 2);
    nBuf.writeInt16LE(clamp(Math.round(norms[i][2]), -4096, 4096), i * 8 + 4);
  }
  const newMesh0 = Buffer.concat([hdr, vBuf, nBuf, allFacesBuf]);

  let out = replaceMeshInPsx(origKartBuf, 0, newMesh0);

  // Upgrade ti=10 (face: 32x32 -> 48x52 16c), update ti=11 (hair: 8x16 16c), shrink unused ti=12 (visor: 16x16 -> 4x4 16c)!
  out = rebuildPsxTextures(out, ({ pal4, texRecs }) => {
    const fRec = texRecs.find(t => t.hash === HASH_KART_FACE_TEX);
    const hRec = texRecs.find(t => t.hash === HASH_KART_HAIR_TEX);
    const vRec = texRecs.find(t => t.hash === HASH_KART_VISOR_TEX);
    if (!fRec || !hRec || !vRec) throw new Error('Texturas da cabeca do motorista nao encontradas em c_kart.psx!');

    const fPal = pal4.find(p => p.id === fRec.palId);
    const hPal = pal4.find(p => p.id === hRec.palId);
    fPal.data = palBgr555ToBuf(arts.qFace.palBgr555);
    hPal.data = palBgr555ToBuf(arts.qHair.palBgr555);

    fRec.w = 48; fRec.h = 52; fRec.rawPixels = arts.qFace.packed;
    hRec.w = 8;  hRec.h = 16; hRec.rawPixels = arts.qHair.packed;
    vRec.w = 4;  vRec.h = 4;  vRec.rawPixels = Buffer.alloc(8, 0);
  });

  const maxBytes = 10 * 2048; // 20,480 B exact original 10 sectors!
  if (out.length > maxBytes) {
    throw new Error(`c_kart.psx overflow: ${out.length} B > ${maxBytes} B!`);
  }
  return {
    buf: out,
    arts,
    stats: { origSize: origKartBuf.length, newSize: out.length, maxBytes, nV: verts.length, nF: totalF, headFaces: newHeadRawFaces.length },
  };
}

// ============================================================================
// Multi-Angle PS1 Software 3D QA Renderer (Supports Transparent Key 0x7C1F & Additive 0x00C0!)
// ============================================================================

function renderPs1Qa(meshPsxBuf, texPsxBuf, meshIdx, views, cellW, cellH, sc, outPath, focusCenter = [0, 0, 0], onlyTis = null) {
  const mInfo = inspectPsxTables(meshPsxBuf);
  const tInfo = inspectPsxTables(texPsxBuf);
  const texByHash = new Map();
  for (const t of tInfo.textures) {
    // Check if ANY palette slot has 0x7C1F -> transparent cutout!
    let hasTrans = false;
    if (t.palInfo) {
      for (let c = 0; c < t.palSize; c++) {
        if ((texPsxBuf.readUInt16LE(t.palInfo.offset + c * 2) & 0x7fff) === 0x7c1f) { hasTrans = true; break; }
      }
    }
    const rgba = Buffer.alloc(t.w * t.h * 4);
    const stride = t.palSize === 256 ? t.w : Math.ceil(t.w / 2);
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const ci = t.palSize === 256
          ? texPsxBuf[t.dataOff + y * stride + x]
          : ((x & 1) ? (texPsxBuf[t.dataOff + y * stride + (x >> 1)] >> 4) : (texPsxBuf[t.dataOff + y * stride + (x >> 1)] & 0xf));
        const v = t.palInfo ? texPsxBuf.readUInt16LE(t.palInfo.offset + ci * 2) : 0;
        const o = (y * t.w + x) * 4;
        rgba[o] = Math.round((v & 31) * 255 / 31);
        rgba[o + 1] = Math.round(((v >> 5) & 31) * 255 / 31);
        rgba[o + 2] = Math.round(((v >> 10) & 31) * 255 / 31);
        rgba[o + 3] = (hasTrans && v === 0x7c1f) ? 0 : 255;
      }
    }
    texByHash.set(t.hash, { ...t, rgba, hasTrans });
  }

  // Parse RGBs table
  const rgbs = [];
  let cur = mInfo.ptrMeta;
  while (cur + 4 <= meshPsxBuf.length) {
    const tag = meshPsxBuf.readUInt32LE(cur); if (tag === 0xffffffff) break;
    const sz = meshPsxBuf.readUInt32LE(cur + 4);
    if (tag === 0x73424752) {
      for (let i = 0; i < Math.floor(sz / 4); i++) {
        rgbs.push([meshPsxBuf[cur + 8 + i * 4], meshPsxBuf[cur + 8 + i * 4 + 1], meshPsxBuf[cur + 8 + i * 4 + 2]]);
      }
    }
    cur += 8 + sz;
  }

  const mo = mInfo.meshOffs[meshIdx];
  const mEnd = (meshIdx + 1 < mInfo.numMeshes) ? mInfo.meshOffs[meshIdx + 1] : mInfo.ptrMeta;
  const nV = meshPsxBuf.readUInt16LE(mo + 2), nN = meshPsxBuf.readUInt16LE(mo + 4), nF = meshPsxBuf.readUInt16LE(mo + 6);
  const vOff = mo + 28;
  const verts = [];
  for (let i = 0; i < nV; i++) {
    verts.push([
      meshPsxBuf.readInt16LE(vOff + i * 8) - focusCenter[0],
      meshPsxBuf.readInt16LE(vOff + i * 8 + 2) - focusCenter[1],
      meshPsxBuf.readInt16LE(vOff + i * 8 + 4) - focusCenter[2],
    ]);
  }
  const faces = [];
  let fp = vOff + nV * 8 + nN * 8;
  for (let fi = 0; fi < nF && fp + 4 <= mEnd; fi++) {
    const fl = meshPsxBuf.readUInt16LE(fp), flen = meshPsxBuf.readUInt16LE(fp + 2);
    if (flen < 12 || fp + flen > mEnd) break;
    const v = [meshPsxBuf[fp + 4], meshPsxBuf[fp + 5], meshPsxBuf[fp + 6], meshPsxBuf[fp + 7]];
    const rgb = [meshPsxBuf[fp + 8], meshPsxBuf[fp + 9], meshPsxBuf[fp + 10], meshPsxBuf[fp + 11]];
    const isTri = (fl & 0x10) !== 0;
    const isGouraud = (fl & 0x0800) !== 0;
    const isAdditive = (fl & 0x00c0) === 0x00c0;
    const ti = (flen >= 20 && (fl & 1)) ? meshPsxBuf.readUInt32LE(fp + 16) : -1;
    const uvs = flen >= 28 ? [
      [meshPsxBuf[fp + 20], meshPsxBuf[fp + 21]],
      [meshPsxBuf[fp + 22], meshPsxBuf[fp + 23]],
      [meshPsxBuf[fp + 24], meshPsxBuf[fp + 25]],
      [meshPsxBuf[fp + 26], meshPsxBuf[fp + 27]],
    ] : [];
    faces.push({ fl, isTri, isGouraud, isAdditive, v, rgb, ti, uvs });
    fp += flen;
  }

  const W = cellW * views.length, H = cellH;
  const img = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { img[i * 4] = 32; img[i * 4 + 1] = 38; img[i * 4 + 2] = 52; img[i * 4 + 3] = 255; }

  views.forEach((vw, vi) => {
    const ox = vi * cellW + cellW * 0.5, oy = cellH * 0.5;
    const zbuf = new Float32Array(cellW * cellH).fill(1e9);
    const yaw = (vw.yaw || 0) * Math.PI / 180;
    const pitch = (vw.pitch || 0) * Math.PI / 180;
    const cY = Math.cos(yaw), sY = Math.sin(yaw);
    const cP = Math.cos(pitch), sP = Math.sin(pitch);

    const proj = (p) => {
      const rx = p[0] * cY + p[2] * sY;
      const rz0 = -p[0] * sY + p[2] * cY;
      const ry = p[1] * cP - rz0 * sP;
      const rz = p[1] * sP + rz0 * cP;
      return { sx: ox + rx * sc, sy: oy + ry * sc, sz: rz };
    };

    const drawTri = (p0, p1, p2, uv0, uv1, uv2, c0, c1, c2, tex, isAdditive) => {
      const area = (p1.sx - p0.sx) * (p2.sy - p0.sy) - (p2.sx - p0.sx) * (p1.sy - p0.sy);
      if (area <= 0.05) return;
      const minX = Math.max(vi * cellW, Math.floor(Math.min(p0.sx, p1.sx, p2.sx)));
      const maxX = Math.min((vi + 1) * cellW - 1, Math.ceil(Math.max(p0.sx, p1.sx, p2.sx)));
      const minY = Math.max(0, Math.floor(Math.min(p0.sy, p1.sy, p2.sy)));
      const maxY = Math.min(cellH - 1, Math.ceil(Math.max(p0.sy, p1.sy, p2.sy)));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const w0 = ((p1.sx - x) * (p2.sy - y) - (p2.sx - x) * (p1.sy - y)) / area;
          const w1 = ((p2.sx - x) * (p0.sy - y) - (p0.sx - x) * (p2.sy - y)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
          const z = w0 * p0.sz + w1 * p1.sz + w2 * p2.sz;
          const zi = y * cellW + (x - vi * cellW);
          if (!isAdditive && z >= zbuf[zi]) continue;
          if (isAdditive && z >= zbuf[zi] + 65) continue; // draw aura smoothly around bottle
          let tr = 200, tg = 200, tb = 200;
          if (tex && uv0) {
            const u = clamp(Math.round(w0 * uv0[0] + w1 * uv1[0] + w2 * uv2[0]), 0, tex.w - 1);
            const vv = clamp(Math.round(w0 * uv0[1] + w1 * uv1[1] + w2 * uv2[1]), 0, tex.h - 1);
            const to = (vv * tex.w + u) * 4;
            if (tex.rgba[to + 3] < 128) continue;
            tr = tex.rgba[to]; tg = tex.rgba[to + 1]; tb = tex.rgba[to + 2];
          }
          const vr = w0 * c0[0] + w1 * c1[0] + w2 * c2[0];
          const vg = w0 * c0[1] + w1 * c1[1] + w2 * c2[1];
          const vb = w0 * c0[2] + w1 * c1[2] + w2 * c2[2];
          const fr = clamp(Math.round(tr * vr / 128), 0, 255);
          const fg = clamp(Math.round(tg * vg / 128), 0, 255);
          const fb = clamp(Math.round(tb * vb / 128), 0, 255);
          const o = (y * W + x) * 4;
          if (isAdditive) {
            img[o + 0] = clamp(img[o + 0] + fr, 0, 255);
            img[o + 1] = clamp(img[o + 1] + fg, 0, 255);
            img[o + 2] = clamp(img[o + 2] + fb, 0, 255);
          } else {
            zbuf[zi] = z;
            img[o + 0] = fr; img[o + 1] = fg; img[o + 2] = fb;
          }
        }
      }
    };

    // Pass 1: Opaque faces, Pass 2: Additive semi-transparent faces!
    for (const passAdd of [false, true]) {
      for (const f of faces) {
        if (f.isAdditive !== passAdd) continue;
        if (onlyTis && !onlyTis.includes(f.ti)) continue;
        const tex = f.ti >= 0 ? (texByHash.get(mInfo.texHashes[f.ti]) || null) : null;
        const p0 = proj(verts[f.v[0]]), p1 = proj(verts[f.v[1]]), p2 = proj(verts[f.v[2]]);
        const p3 = f.isTri ? null : proj(verts[f.v[3]]);
        const getCol = (k) => (f.isGouraud && rgbs[f.rgb[k]]) ? rgbs[f.rgb[k]] : [f.rgb[0] || 128, f.rgb[1] || 128, f.rgb[2] || 128];
        const c0 = getCol(0), c1 = getCol(1), c2 = getCol(2), c3 = f.isTri ? c0 : getCol(3);
        drawTri(p0, p1, p2, f.uvs[0], f.uvs[1], f.uvs[2], c0, c1, c2, tex, f.isAdditive);
        if (!f.isTri && p3) drawTri(p1, p3, p2, f.uvs[1], f.uvs[3], f.uvs[2], c1, c3, c2, tex, f.isAdditive);
      }
    }
  });

  psxLib.writePng(outPath, W, H, img);
}

module.exports = {
  HASH_BARREL_BDY_FRONT,
  HASH_BARREL_BDY_BACK,
  HASH_SECRET_TAPE,
  HASH_HALL_PASS_MESH,
  HASH_HALL_PASS_TEX,
  HASH_HALL_KEY_TEX,
  HASH_KART_MESH,
  HASH_KART_FACE_TEX,
  cutoutLulaoHead,
  cutoutFitas51,
  cutoutVentoEstocado,
  cutoutBolsonaroDoidao,
  buildHangarBarrelArts,
  patchHangarBarrelFrontBack,
  buildLulaoCashBillArt,
  patchSecretTape51InItemsPsx,
  patchSchool2VentoEstocado,
  patchSchool2KartBolsonaro,
  renderPs1Qa,
  inspectPsxTables,
};
