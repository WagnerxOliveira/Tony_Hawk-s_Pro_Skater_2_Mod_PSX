#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Surgical Skater Transformation Tool: Steve Caballero -> Lulao
 *
 * Performs ALL 4 modifications cleanly and preserves backups in originals_backup/:
 *  1. Renames "Steve Caballero" / "Steve" -> "Lulao" in SLUS_010.66 (g_SkaterTable[2] & g_MovieTable[19])
 *  2. Replaces menu portrait s2face2.bmp (62x47 8-bit BMP, EXACT 4,088 bytes) in BOTH:
 *     - CD.WAD standalone (idx 370)
 *     - options.pre (idx 45 -> s2face2.bmp)
 *     Preserving the original metallic UI bezel and #FF00FF magenta corner transparency!
 *  3. Replaces 3D outfit & face textures + BGR555 256-color CLUTs inside ALL 4 Caballero .PSX models:
 *     - cab.psx, cab_L.psx (Outfit A high/low)
 *     - cab2b.psx, cab2b_L.psx (Outfit B high/low)
 *     Mapping textura_lulao.png (navy suit, white collar, pink tie, green/yellow presidential sash + rosette)
 *     onto torso (front + continuous sash wrap on back), sleeves, and trousers, and lulao.png onto head UV!
 *  4. Sculpts the 3D HEAD vertex geometry (Mesh[12] in cab/cab_L, Mesh[15] in cab2b/cab2b_L) to match
 *     Lulao's facial geometry (smoother rounded cranium, broader forehead, fuller smiling cheeks,
 *     broader rounder nose, fuller rounded bearded jaw/chin, slightly more prominent ears) while keeping
 *     100% of w!=0 neck-seam stitch vertices locked and recomputing exact mesh bounding boxes!
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const ffmpegExe = path.join(rootDir, 'tools', 'bin', 'ffmpeg', 'ffmpeg-9.1-essentials_build', 'bin', 'ffmpeg.exe');
const suitImgPath = path.join(rootDir, 'texturas_para_colocar_nos_skatistas', 'textura_lulao.png');
const faceImgPath = path.join(rootDir, 'fotos_para_modificar_nos_skatistas', 'lulao.png');
const backupDir = path.join(rootDir, 'originals_backup');
const previewDir = path.join(rootDir, 'build', '_lulao_preview');

// --- Hashing & WAD Helpers ---
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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

// --- Image I/O (ffmpeg RGBA loader + pure-Node PNG writer) ---
function loadRgba(imgPath, w, h) {
  const args = ['-v', 'error', '-i', imgPath];
  if (w && h) args.push('-vf', `scale=${w}:${h}:flags=lanczos`);
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1');
  const r = spawnSync(ffmpegExe, args, { maxBuffer: 60 * 1024 * 1024 });
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
    const top = lerp(rgba[o00 + c], rgba[o10 + c], tx);
    const bot = lerp(rgba[o01 + c], rgba[o11 + c], tx);
    out[c] = Math.round(lerp(top, bot, ty));
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
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  fs.writeFileSync(filePath, Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]));
}

// --- High-Quality Median-Cut Quantizer + Floyd-Steinberg Dithering ---
function medianCutPalette(pixels, maxColors) {
  if (pixels.length === 0) return [[0, 0, 0]];
  let buckets = [pixels];
  while (buckets.length < maxColors) {
    // Pick bucket with largest color range * log(count)
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
        bestScore = score;
        bestIdx = i;
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
  const r5 = (r >> 3) & 0x1F;
  const g5 = (g >> 3) & 0x1F;
  const b5 = (b >> 3) & 0x1F;
  let val = r5 | (g5 << 5) | (b5 << 10);
  // CRITICAL PS1 GPU RULE: 0x0000 is transparent! Use 0x0421 (RGB 8,8,8) for opaque black!
  if (val === 0) val = 0x0421;
  return val;
}

function quantizeImageForPsx(rgba, w, h, maxColors = 256) {
  // Snap colors to 5-bit PS1 RGB precision first for accurate palette generation
  const allPx = [];
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4] & 0xF8;
    const g = rgba[i * 4 + 1] & 0xF8;
    const b = rgba[i * 4 + 2] & 0xF8;
    allPx.push([r, g, b]);
  }
  const palRgb = medianCutPalette(allPx, maxColors);
  while (palRgb.length < maxColors) palRgb.push([8, 8, 8]);
  const palBgr555 = palRgb.map(([r, g, b]) => rgbToBgr555Opaque(r, g, b));
  // Effective RGB after BGR555 roundtrip
  const effRgb = palBgr555.map(v => [(v & 0x1F) << 3, ((v >> 5) & 0x1F) << 3, ((v >> 10) & 0x1F) << 3]);

  // Floyd-Steinberg error diffusion (mild 0.65 strength to keep PS1 low-res textures crisp without speckle)
  const errBuf = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    errBuf[i * 3] = rgba[i * 4];
    errBuf[i * 3 + 1] = rgba[i * 4 + 1];
    errBuf[i * 3 + 2] = rgba[i * 4 + 2];
  }
  const indices = Buffer.alloc(w * h);
  const outRgba = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const r = clamp(errBuf[idx * 3], 0, 255);
      const g = clamp(errBuf[idx * 3 + 1], 0, 255);
      const b = clamp(errBuf[idx * 3 + 2], 0, 255);
      let best = 0, bestD = 1e18;
      for (let c = 0; c < maxColors; c++) {
        const dr = r - effRgb[c][0], dg = g - effRgb[c][1], db = b - effRgb[c][2];
        const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bestD) { bestD = d; best = c; if (d === 0) break; }
      }
      indices[idx] = best;
      const [qr, qg, qb] = effRgb[best];
      outRgba[idx * 4] = qr; outRgba[idx * 4 + 1] = qg; outRgba[idx * 4 + 2] = qb; outRgba[idx * 4 + 3] = 255;

      const er = (r - qr) * 0.60, eg = (g - qg) * 0.60, eb = (b - qb) * 0.60;
      const spread = (nx, ny, wt) => {
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
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

// ============================================================================
// ASSET SYNTHESIS: PORTRAIT BMP, 3D HEAD TEXTURE, 3D SUIT/SASH/PANTS/SLEEVES
// ============================================================================
const faceSrcW = 319, faceSrcH = 360;
const suitSrcW = 202, suitSrcH = 391;
const faceSrc = loadRgba(faceImgPath, faceSrcW, faceSrcH);
const suitSrc = loadRgba(suitImgPath, suitSrcW, suitSrcH);

// 1. Build EXACT 4,088-byte 62x47 8-bit BMP for s2face2.bmp (preserving metallic bezel & #FF00FF corners!)
function buildPortraitBmp(origBmpBuf) {
  const w = 62, h = 47, rowStride = 64, offBits = 1078;
  // Extract original frame pixels outside inner rect (x=7..52, y=4..39)
  const frameColors = new Map();
  const isInner = (x, y) => x >= 7 && x <= 52 && y >= 4 && y <= 39;

  // Build RGBA canvas
  const canvas = Buffer.alloc(w * h * 4);
  // Crop lulao.png face tightly (x=18..300, y=4..326) -> 46x36 inner rect
  const innerW = 46, innerH = 36;
  const cropArgs = [
    '-v', 'error', '-i', faceImgPath,
    '-vf', `crop=282:322:18:4,scale=${innerW}:${innerH}:flags=lanczos`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'
  ];
  const innerRgba = spawnSync(ffmpegExe, cropArgs, { maxBuffer: 10 * 1024 * 1024 }).stdout;

  // Palette layout: index 5 MUST remain FF 00 FF 00 (magenta transparency key!)
  // Collect all unique bezel/frame colors first
  const fixedPalette = new Array(256).fill(null);
  fixedPalette[5] = [255, 0, 255]; // exact magenta transparency index from original s2face2.bmp!
  const keyToIdx = new Map([['255,0,255', 5]]);
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
        const rgb = [origBmpBuf[po + 2], origBmpBuf[po + 1], origBmpBuf[po]];
        allocSlot(rgb);
        const dst = (y * w + x) * 4;
        canvas[dst] = rgb[0]; canvas[dst + 1] = rgb[1]; canvas[dst + 2] = rgb[2]; canvas[dst + 3] = 255;
      } else {
        const ix = x - 7, iy = y - 4;
        const s = (iy * innerW + ix) * 4;
        const dst = (y * w + x) * 4;
        canvas[dst] = innerRgba[s]; canvas[dst + 1] = innerRgba[s + 1]; canvas[dst + 2] = innerRgba[s + 2]; canvas[dst + 3] = 255;
      }
    }
  }

  // Remaining slots go to median-cut of inner face pixels
  let freeCount = 0;
  for (let i = 0; i < 256; i++) if (fixedPalette[i] === null) freeCount++;
  const innerPx = [];
  for (let i = 0; i < innerW * innerH; i++) {
    innerPx.push([innerRgba[i * 4], innerRgba[i * 4 + 1], innerRgba[i * 4 + 2]]);
  }
  const faceCols = medianCutPalette(innerPx, freeCount);
  let fc = 0;
  for (let i = 0; i < 256; i++) {
    if (fixedPalette[i] === null) {
      fixedPalette[i] = fc < faceCols.length ? faceCols[fc++] : [0, 0, 0];
    }
  }

  // Copy exact original 4,088-byte BMP template header + write new palette & pixels!
  const outBmp = Buffer.from(origBmpBuf);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = fixedPalette[i];
    outBmp[54 + i * 4 + 0] = b;
    outBmp[54 + i * 4 + 1] = g;
    outBmp[54 + i * 4 + 2] = r;
    outBmp[54 + i * 4 + 3] = 0;
  }

  // Write pixel indices (exact bezel indices outside inner rect, Floyd-Steinberg inside inner rect!)
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
        const k = `${origBmpBuf[po + 2]},${origBmpBuf[po + 1]},${origBmpBuf[po]}`;
        cidx = keyToIdx.get(k) ?? 0;
      } else {
        const ix = x - 7, iy = y - 4, ii = iy * innerW + ix;
        const r = clamp(errBuf[ii * 3], 0, 255);
        const g = clamp(errBuf[ii * 3 + 1], 0, 255);
        const b = clamp(errBuf[ii * 3 + 2], 0, 255);
        let best = 0, bestD = 1e18;
        for (let c = 0; c < 256; c++) {
          if (c === 5) continue; // never match magenta transparency key inside portrait!
          const dr = r - fixedPalette[c][0], dg = g - fixedPalette[c][1], db = b - fixedPalette[c][2];
          const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
          if (d < bestD) { bestD = d; best = c; }
        }
        cidx = best;
        const [qr, qg, qb] = fixedPalette[cidx];
        const er = (r - qr) * 0.55, eg = (g - qg) * 0.55, eb = (b - qb) * 0.55;
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
      const d = (y * w + x) * 4;
      previewRgba[d] = pr; previewRgba[d + 1] = pg; previewRgba[d + 2] = pb; previewRgba[d + 3] = 255;
    }
  }
  return { bmpBuf: outBmp, previewRgba };
}

// 2. Build 64x64 3D Head/Face Texture (exact UV landmark alignment to cab.psx Mesh[12]!)
function buildHeadTexture64() {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);

  // Sample PURE silver-gray curly hair from lulao.png (top crown strip x=96..226, y=1..14 — zero forehead skin!)
  const hairSample = (x, y) => {
    const u = ((x * 3.7 + Math.sin(y * 0.45) * 4) % 240 + 240) % 240;
    const tx = u < 120 ? (96 + u) : (96 + 239 - u);
    const v = ((y * 1.9 + Math.cos(x * 0.35) * 2) % 22 + 22) % 22;
    const ty = v < 11 ? (2 + v) : (2 + 21 - v);
    const c = sampleBilinear(faceSrc, faceSrcW, faceSrcH, tx, ty);
    // Keep neutral salt-and-pepper silver/gray hair tone (desaturate any slight warm bleed)
    const lum = c[0] * 0.30 + c[1] * 0.59 + c[2] * 0.11;
    const edgeShade = (x < 10 || x > 54) ? 0.84 : (y < 6 ? 0.94 : 0.90);
    const r = Math.round(lerp(lum, c[0], 0.25) * edgeShade);
    const g = Math.round(lerp(lum, c[1], 0.25) * edgeShade);
    const b = Math.round(lerp(lum, c[2], 0.25) * edgeShade);
    return [r, g, b];
  };

  // Warm neck skin tone sampled from Lulao's cheek/jaw skin
  const neckSkin = [194, 142, 114];

  // Piecewise vertical landmark map from dst_y -> src_y in lulao.png (319x360)
  // Control points verified directly on grid_lulao.png & cab_head_uv_overlay.png:
  //   dst_y=12 (upper hair/forehead) -> src_y=18
  //   dst_y=28 (eyes)                -> src_y=140
  //   dst_y=38 (nose tip)            -> src_y=184
  //   dst_y=46 (smiling tongue)      -> src_y=227
  //   dst_y=55 (bottom of beard)     -> src_y=302
  const mapY = dy => {
    if (dy <= 12) return lerp(4, 18, dy / 12);
    if (dy <= 28) return lerp(18, 140, (dy - 12) / 16);
    if (dy <= 38) return lerp(140, 184, (dy - 28) / 10);
    if (dy <= 46) return lerp(184, 227, (dy - 38) / 8);
    if (dy <= 55) return lerp(227, 302, (dy - 46) / 9);
    return 302 + (dy - 55) * 6;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Base: hair for upper/side/back head, warm skin for bottom neck strip (y >= 54)
      const hCol = hairSample(x, y);
      let baseCol = hCol;
      if (y >= 50) {
        const nt = clamp((y - 50) / 7, 0, 1);
        // Subtle shading on sides of neck
        const nShade = 1.0 - 0.14 * Math.abs((x - 31.5) / 32);
        baseCol = [
          Math.round(lerp(hCol[0], neckSkin[0] * nShade, nt)),
          Math.round(lerp(hCol[1], neckSkin[1] * nShade, nt)),
          Math.round(lerp(hCol[2], neckSkin[2] * nShade, nt)),
        ];
      }

      // Compute exact face photo coordinate (centered at dst_x=31 -> src_x=174, eye sep 16px -> 92px)
      const sx = 174 + (x - 31) * 5.65;
      const sy = mapY(y);

      // Compute smooth oval face mask so ears/hair/beard blend cleanly without any blue collar or white photo bg!
      // Face oval centered at (31.5, 35.5), rx=21.5, ry=21.5 (wider at ears y=26..42!)
      const dx = (x - 31.5) / (y >= 25 && y <= 43 ? 23.0 : 19.5);
      const dy = (y - 34.5) / 21.8;
      const r2 = dx * dx + dy * dy;
      let faceAlpha = clamp((1.08 - Math.sqrt(r2)) / 0.22, 0, 1);

      // Keep top hair crown seamless (y < 14 blends into hair texture)
      if (y < 16) faceAlpha *= clamp((y - 8) / 8, 0, 1);
      // Cut off strictly above Lulao's light-blue shirt collar in lulao.png (src_y > 296 outside chin oval!)
      if (sy > 290) faceAlpha *= clamp((308 - sy) / 18, 0, 1);
      // Also avoid sampling white photo background at upper corners of lulao.png
      if (sx < 36 || sx > 286) faceAlpha = 0;

      let out = baseCol;
      if (faceAlpha > 0.001) {
        const fc = sampleBilinear(faceSrc, faceSrcW, faceSrcH, sx, sy);
        // Guard against light-blue shirt collar bleeding into lower sides of chin (high blue > red+10 at y > 48)
        if (y >= 47 && fc[2] > fc[0] + 8 && fc[2] > 140) {
          faceAlpha = 0;
        }
        // Guard against pale gray studio background behind ears/temples (y < 42, lateral, low saturation & bright)
        const maxC = Math.max(fc[0], fc[1], fc[2]), minC = Math.min(fc[0], fc[1], fc[2]);
        if (Math.abs(x - 31.5) > 15 && y < 44 && (maxC - minC) < 16 && minC > 195) {
          faceAlpha *= 0.15;
        }
        out = [
          Math.round(lerp(baseCol[0], fc[0], faceAlpha)),
          Math.round(lerp(baseCol[1], fc[1], faceAlpha)),
          Math.round(lerp(baseCol[2], fc[2], faceAlpha)),
        ];
      }

      const d = (y * W + x) * 4;
      rgba[d] = out[0]; rgba[d + 1] = out[1]; rgba[d + 2] = out[2]; rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// 3. Build 128x64 Suit + Presidential Sash Torso Texture (Front centered x=26..102, Back wrapping x=0..26 & 102..127!)
function buildSuitTorsoTexture128x64() {
  const W = 128, H = 64;
  const rgba = Buffer.alloc(W * H * 4);

  // Sample clean tailored navy blue suit cloth from textura_lulao.png (x=126..166, y=112..210)
  const navyCloth = (x, y) => {
    const u = ((x * 1.6) % 72 + 72) % 72;
    const tx = u < 36 ? (126 + u) : (126 + 71 - u);
    const v = ((y * 2.2) % 160 + 160) % 160;
    const ty = v < 80 ? (116 + v) : (116 + 159 - v);
    return sampleBilinear(suitSrc, suitSrcW, suitSrcH, tx, ty);
  };

  // Sample authentic presidential sash ribbon (green-yellow-green diagonal band from textura_lulao.png!)
  // Cross-section across sash width t in [-1..+1]: green edge, bright yellow center stripe, green edge
  const sashColor = (t, shade = 1.0) => {
    const a = Math.abs(t);
    let c;
    if (a < 0.34) c = [242, 206, 22];        // golden yellow center stripe
    else if (a < 0.42) c = [148, 178, 42];   // smooth yellow-green transition
    else if (a < 0.92) c = [66, 146, 62];    // Brazilian green outer bands
    else c = [42, 102, 42];                  // crisp dark green sash border
    return [Math.round(c[0] * shade), Math.round(c[1] * shade), Math.round(c[2] * shade)];
  };

  // Step A: Fill entire 128x64 wrap with rich navy blue suit fabric + subtle back spine seam at x=0/127
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = navyCloth(x, y);
      // Subtle center-back tailored jacket seam around x=0 and x=127
      const distBackCenter = Math.min(x, W - 1 - x);
      const seamShade = distBackCenter <= 1 ? 0.78 : (distBackCenter <= 3 ? 0.92 : 1.0);
      const d = (y * W + x) * 4;
      rgba[d] = Math.round(c[0] * seamShade);
      rgba[d + 1] = Math.round(c[1] * seamShade);
      rgba[d + 2] = Math.round(c[2] * seamShade);
      rgba[d + 3] = 255;
    }
  }

  // Step B: Paint the CONTINUOUS green-yellow presidential sash across the BACK of the suit!
  // On cab_torso_uv_overlay.png:
  //   Right shoulder front is around x=46..56, y=0 -> wraps over shoulder to back right side x=102..127, y=0..24
  //   Continues diagonally across center back (x=127 -> 0, y=24..40) down to left hip x=0..26, y=40..63!
  // Wait: let's check left/right orientation!
  // In front view (centered x=64): wearer's RIGHT shoulder is on the viewer's LEFT (x=42..54, y=0..10),
  // and sash goes down to wearer's LEFT hip (viewer's RIGHT, x=80..94, y=42..63)!
  // Wrapping around cylinder: viewer's LEFT edge (x=26 -> 0) connects to BACK wearer's RIGHT side!
  // Viewer's RIGHT edge (x=102 -> 127) connects to BACK wearer's LEFT side!
  // Therefore on the BACK:
  //   Top of wearer's RIGHT shoulder is at x=0..26, y=0..20!
  //   Diagonal goes from (x=22, y=0) -> across x=0/127 at y=28 -> down to wearer's LEFT hip at (x=102, y=54)!
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x >= 26 && x <= 101) continue; // front handled directly from textura_lulao.png below!
      // Unwrap back x into continuous coordinate bx in [0..52] where bx=0 is x=26 (back right) and bx=52 is x=102 (back left)
      const bx = x < 26 ? (26 - x) : (26 + (128 - x));
      // Line from (bx=4, y=0) to (bx=52, y=52): y_center(bx) = (bx - 4) * (52 / 48)
      const yc = (bx - 4) * 1.08;
      const dist = (y - yc) / Math.SQRT2;
      const halfWidth = 7.2;
      if (Math.abs(dist) <= halfWidth) {
        const t = dist / halfWidth;
        const shade = 0.90 - 0.12 * Math.abs(bx - 26) / 26;
        const sc = sashColor(t, shade);
        const alpha = clamp((halfWidth - Math.abs(dist)) / 1.2, 0, 1);
        const d = (y * W + x) * 4;
        rgba[d] = Math.round(lerp(rgba[d], sc[0], alpha));
        rgba[d + 1] = Math.round(lerp(rgba[d + 1], sc[1], alpha));
        rgba[d + 2] = Math.round(lerp(rgba[d + 2], sc[2], alpha));
      }
    }
  }

  // Step C: Map the ACTUAL HIGH-RES FRONT SUIT + COLLAR + PINK TIE + SASH + GOLD EMBLEM + ROSETTE from textura_lulao.png!
  // Front UV region: x = 24..103 (width=80, centered at x=63.5), y = 0..63 (height=64)
  for (let y = 0; y < H; y++) {
    for (let x = 24; x <= 103; x++) {
      // Map dst_x=63.5 -> src_x=90 (tie & button center), dst_x=24 -> src_x=34, dst_x=103 -> src_x=154 (excludes outer wrist!)
      const sx = x <= 63.5
        ? lerp(34, 90, (x - 24) / (63.5 - 24))
        : lerp(90, 154, (x - 63.5) / (103 - 63.5));
      // Map dst_y=0 -> src_y=94 (clean white dress shirt collar below beard!), dst_y=63 -> src_y=328 (rosette + gold medallion!)
      const sy = lerp(94, 328, y / 63);
      const fc = sampleBilinear(suitSrc, suitSrcW, suitSrcH, sx, sy);

      // Cleanly replace any beard/skin or sky pixels near very top edge (y < 6)
      if (y < 6) {
        // Center V-neck collar stays crisp white dress shirt if any chin/beard pixel appears
        if (Math.abs(x - 63.5) < 10 && fc[0] > 140 && fc[0] > fc[2] + 10) {
          const d = (y * W + x) * 4;
          rgba[d] = 232; rgba[d + 1] = 232; rgba[d + 2] = 236;
          continue;
        }
        // Shoulder edges: replace ONLY pale cream/cyan architectural background (high blue > 130!), never green/yellow sash!
        if ((x < 46 || x > 80) && fc[2] > 130 && fc[1] > 140) {
          continue;
        }
      }

      // Soft horizontal feather at edges x=24..29 and x=98..103 so front blends seamlessly into navy back!
      let alpha = 1.0;
      if (x < 29) alpha = (x - 24) / 5;
      else if (x > 98) alpha = (103 - x) / 5;

      const d = (y * W + x) * 4;
      rgba[d] = Math.round(lerp(rgba[d], fc[0], alpha));
      rgba[d + 1] = Math.round(lerp(rgba[d + 1], fc[1], alpha));
      rgba[d + 2] = Math.round(lerp(rgba[d + 2], fc[2], alpha));
    }
  }
  return rgba;
}

// 4. Build Navy Blue Suit Trousers Texture (works for both 128x64 Outfit A and 64x64 / 32x32 Outfit B)
function buildSuitPantsTexture(W, H) {
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Sample rich tailored dark navy suit trouser cloth from textura_lulao.png (x=40..155, y=352..388 + navy suit body)
      const u = ((x * 1.4) % 72 + 72) % 72;
      const tx = u < 36 ? (126 + u) : (126 + 71 - u);
      const v = ((y * 2.0) % 140 + 140) % 140;
      const ty = v < 70 ? (120 + v) : (120 + 139 - v);
      const c = sampleBilinear(suitSrc, suitSrcW, suitSrcH, tx, ty);
      // Slightly deeper trouser navy with subtle vertical press crease + dark leather belt at top waistband
      let mul = 0.84 + 0.08 * Math.sin((x / W) * Math.PI * 4);
      if (y < Math.max(3, Math.round(H * 0.08))) {
        // Dark belt & subtle metallic buckle at front center
        const isBuckle = Math.abs(x - W * 0.5) < W * 0.05 && y >= 1 && y <= Math.max(2, Math.round(H * 0.06));
        const d = (y * W + x) * 4;
        if (isBuckle) { rgba[d] = 176; rgba[d+1] = 160; rgba[d+2] = 96; rgba[d+3] = 255; }
        else { rgba[d] = 18; rgba[d+1] = 20; rgba[d+2] = 26; rgba[d+3] = 255; }
        continue;
      }
      const d = (y * W + x) * 4;
      rgba[d] = clamp(Math.round(c[0] * mul), 8, 255);
      rgba[d + 1] = clamp(Math.round(c[1] * mul), 8, 255);
      rgba[d + 2] = clamp(Math.round(c[2] * mul), 8, 255);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// 5. Build Navy Blue Suit Sleeve Texture (32x64) with elbow shading + crisp white dress shirt cuff at wrist!
function buildSuitSleeveTexture(W = 32, H = 64) {
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Pure navy suit cloth region on right lapel/arm (x=156..178, y=120..215 — zero sash or seam bleed!)
      const tx = 156 + (x / W) * 22;
      const ty = 120 + (y / H) * 95;
      const c = sampleBilinear(suitSrc, suitSrcW, suitSrcH, tx, ty);
      // Cylindrical sleeve shading + subtle elbow fold around y=30..36
      const cyl = 0.85 + 0.16 * Math.sin((x / W) * Math.PI);
      const fold = 1.0 - 0.10 * Math.exp(-Math.pow((y - 32) / 4, 2));
      const d = (y * W + x) * 4;
      if (y >= H - 4) {
        // Crisp white dress shirt cuff peeking at wrist
        const cw = Math.round(228 * cyl);
        rgba[d] = cw; rgba[d + 1] = cw; rgba[d + 2] = Math.min(240, cw + 6); rgba[d + 3] = 255;
      } else {
        // Suit cuff buttons at y=H-7 and y=H-10
        const isBtn = (x >= 14 && x <= 17) && (y === H - 7 || y === H - 10);
        if (isBtn) {
          rgba[d] = 16; rgba[d + 1] = 24; rgba[d + 2] = 44; rgba[d + 3] = 255;
        } else {
          rgba[d] = clamp(Math.round(c[0] * cyl * fold), 8, 255);
          rgba[d + 1] = clamp(Math.round(c[1] * cyl * fold), 8, 255);
          rgba[d + 2] = clamp(Math.round(c[2] * cyl * fold), 8, 255);
          rgba[d + 3] = 255;
        }
      }
    }
  }
  return rgba;
}

// 6. Build Silver/Gray Hair Texture (32x32) for cab2b helmet slot
function buildSilverHairTexture32() {
  const W = 32, H = 32;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tx = 96 + (x / W) * 120;
      const ty = 2 + (y / H) * 12;
      const c = sampleBilinear(faceSrc, faceSrcW, faceSrcH, tx, ty);
      const lum = c[0] * 0.30 + c[1] * 0.59 + c[2] * 0.11;
      const d = (y * W + x) * 4;
      rgba[d] = Math.round(lerp(lum, c[0], 0.25));
      rgba[d + 1] = Math.round(lerp(lum, c[1], 0.25));
      rgba[d + 2] = Math.round(lerp(lum, c[2], 0.25));
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// ============================================================================
// NEVERSOFT .PSX PARSER, TEXTURE/CLUT PATCHER & 3D HEAD GEOMETRY SCULPTOR
// ============================================================================
function parsePsxStructure(buf) {
  const ptrMeta = buf.readUInt32LE(4);
  const numObjs = buf.readUInt32LE(8);
  const numMeshes = buf.readUInt32LE(12 + numObjs * 36);
  const meshOffs = Array.from({length: numMeshes}, (_, i) => buf.readUInt32LE(12 + numObjs * 36 + 4 + i * 4));

  let mpos = ptrMeta;
  while (mpos + 4 <= buf.length) {
    const tag = buf.readUInt32LE(mpos); mpos += 4;
    if (tag === 0xFFFFFFFF) break;
    mpos += 4 + buf.readUInt32LE(mpos);
  }
  mpos += numMeshes * 4;
  const numTexRefs = buf.readUInt32LE(mpos); mpos += 4 + numTexRefs * 4;
  const numPal16 = buf.readUInt32LE(mpos); mpos += 4;
  const pal16 = new Map();
  for (let i = 0; i < numPal16; i++) {
    const pid = buf.readUInt32LE(mpos);
    pal16.set(pid, { offset: mpos + 4, count: 16 });
    mpos += 36;
  }
  const numPal256 = buf.readUInt32LE(mpos); mpos += 4;
  const pal256 = new Map();
  for (let i = 0; i < numPal256; i++) {
    const pid = buf.readUInt32LE(mpos);
    pal256.set(pid, { offset: mpos + 4, count: 256 });
    mpos += 516;
  }
  const numTex = buf.readUInt32LE(mpos); mpos += 4;
  const texOffs = Array.from({length: numTex}, (_, i) => buf.readUInt32LE(mpos + i * 4));
  const textures = [];
  for (let i = 0; i < numTex; i++) {
    const to = texOffs[i];
    const palSize = buf.readUInt32LE(to + 4);
    const palId = buf.readUInt32LE(to + 8);
    const texIdx = buf.readUInt32LE(to + 12);
    const w = buf.readUInt16LE(to + 16), h = buf.readUInt16LE(to + 18);
    const nextOff = (i + 1 < numTex) ? texOffs[i + 1] : buf.length;
    textures.push({
      i, texIdx, palSize, palId, w, h, dataOff: to + 20, dataLen: nextOff - (to + 20),
      palInfo: palSize === 16 ? pal16.get(palId) : pal256.get(palId),
    });
  }
  return { ptrMeta, numMeshes, meshOffs, textures };
}

function writeTextureIntoPsx(buf, tex, rgba) {
  if (tex.palSize !== 256 || !tex.palInfo) {
    throw new Error(`Esperado 256-col paletted texture em tex[${tex.i}], obtido ${tex.palSize}`);
  }
  if (tex.dataLen !== tex.w * tex.h) {
    throw new Error(`Tamanho inesperado de pixel data em tex[${tex.i}]: ${tex.dataLen} vs ${tex.w * tex.h}`);
  }
  const q = quantizeImageForPsx(rgba, tex.w, tex.h, 256);
  // Write 256 x uint16 BGR555 CLUT
  for (let c = 0; c < 256; c++) {
    buf.writeUInt16LE(q.palBgr555[c], tex.palInfo.offset + c * 2);
  }
  // Write 8-bit indexed pixel buffer
  q.indices.copy(buf, tex.dataOff);
  return q.outRgba;
}

/**
 * Surgically sculpts the 3D HEAD mesh geometry to match Lulao's facial proportions & silhouette:
 * - Strictly preserves all w != 0 neck-seam stitch vertices so neck stays 100% hermetically welded!
 * - Uses UV + 3D anatomical region deformers so it works seamlessly on cab.psx, cab_L.psx, cab2b.psx & cab2b_L.psx!
 * - Recomputes exact bounding box (xmax, xmin, ymax, ymin, zmax, zmin) in mesh header!
 */
function sculptHeadGeometryToLulao(buf, psxInfo, headMeshIdx, faceTexIdx) {
  const mo = psxInfo.meshOffs[headMeshIdx];
  const mEnd = (headMeshIdx + 1 < psxInfo.numMeshes) ? psxInfo.meshOffs[headMeshIdx + 1] : psxInfo.ptrMeta;
  const nVerts = buf.readUInt16LE(mo + 2);
  const nNorms = buf.readUInt16LE(mo + 4);
  const nFaces = buf.readUInt16LE(mo + 6);
  const vOff = mo + 28;
  const nOff = vOff + nVerts * 8;
  const fOff = nOff + nNorms * 8;

  const origVerts = [];
  for (let v = 0; v < nVerts; v++) {
    origVerts.push({
      idx: v,
      x: buf.readInt16LE(vOff + v * 8),
      y: buf.readInt16LE(vOff + v * 8 + 2),
      z: buf.readInt16LE(vOff + v * 8 + 4),
      w: buf.readUInt16LE(vOff + v * 8 + 6),
    });
  }

  // Gather average face UV (u, v) per vertex (and track whether vertex uses helmet texture in cab2b!)
  const vertUvAcc = Array.from({length: nVerts}, () => ({ su: 0, sv: 0, cnt: 0, hasFace: false, onlyOther: true }));
  const faces = [];
  let fp = fOff;
  for (let fi = 0; fi < nFaces && fp + 4 <= mEnd; fi++) {
    const fFlags = buf.readUInt16LE(fp);
    const fLen = buf.readUInt16LE(fp + 2);
    if (fLen < 12 || fp + fLen > mEnd) break;
    const rawVerts = [buf[fp + 4], buf[fp + 5], buf[fp + 6], buf[fp + 7]];
    const gpuCmd = buf[fp + 11];
    const quad = (gpuCmd & 0x08) !== 0;
    const textured = (fFlags & 0x0001) !== 0 || (gpuCmd & 0x04) !== 0;
    let texId = -1, uvs = [];
    if (textured && fLen >= 28) {
      texId = buf.readUInt32LE(fp + 16);
      uvs = [[buf[fp+20],buf[fp+21]], [buf[fp+22],buf[fp+23]], [buf[fp+24],buf[fp+25]]];
      if (quad) uvs.push([buf[fp+26],buf[fp+27]]);
      const n = quad ? 4 : 3;
      for (let k = 0; k < n; k++) {
        const vi = rawVerts[k];
        if (vi < nVerts) {
          if (texId === faceTexIdx) {
            vertUvAcc[vi].su += uvs[k][0];
            vertUvAcc[vi].sv += uvs[k][1];
            vertUvAcc[vi].cnt++;
            vertUvAcc[vi].hasFace = true;
            vertUvAcc[vi].onlyOther = false;
          }
        }
      }
    }
    faces.push({ rawVerts, quad, texId, uvs });
    fp += fLen;
  }

  // Compute head horizontal center X from front face vertices
  let sumX = 0, cntX = 0;
  for (const v of origVerts) {
    if (v.w === 0) { sumX += v.x; cntX++; }
  }
  const cx = cntX ? sumX / cntX : -18;

  const newVerts = origVerts.map(v => {
    // STRICT INVARIANT: never move neck-seam stitch vertices (w != 0)!
    if (v.w !== 0) return { ...v };

    let x = v.x, y = v.y, z = v.z;
    const acc = vertUvAcc[v.idx];
    const u = acc.cnt ? acc.su / acc.cnt : 32;
    const uvY = acc.cnt ? acc.sv / acc.cnt : 32;
    const dx = x - cx;

    // 1. Cranium / Hair Dome: lower Steve's tall spiky hair peaks smoothly & round temples for Lulao's broad dome
    if (y < -150) {
      const topT = clamp((-150 - y) / 185, 0, 1);
      // Reduce spiky peak height smoothly (-12% above -150) & broaden temples slightly (+7%)
      y = -150 - (-150 - y) * (1.0 - 0.13 * topT);
      x = cx + dx * (1.0 + 0.08 * (1.0 - topT * 0.5));
      // If cab2b helmet-only shell vertex, tuck slightly closer to scalp
      if (acc.onlyOther) {
        y += 14 * topT;
        z *= 0.94;
      }
    }

    // 2. Forehead (14 <= uvY <= 26, front z < -130): Lulao's broad, expressive forehead
    if (acc.hasFace && uvY >= 14 && uvY <= 27 && z < -130) {
      x = cx + (x - cx) * 1.07;
      z -= 6;
    }

    // 3. Nose (uvY 28..42, center u 24..39, z < -215): broader, rounder nose instead of sharp pointy tip
    if (acc.hasFace && uvY >= 28 && uvY <= 42 && u >= 24 && u <= 39 && z < -215) {
      if (z < -265) {
        // Soften sharp nose tip & widen tip slightly for Lulao's fuller rounded nose
        z += 12;
        x = cx + (x - cx) * 1.24;
        y += 4;
      } else {
        // Broaden nose bridge & nostrils slightly forward
        x = cx + (x - cx) * 1.15;
        z -= 8;
      }
    }

    // 4. Cheeks / Zygomatic Arch (uvY 30..47, lateral, front z < -100): Lulao's fuller, rounder smiling cheeks
    if (acc.hasFace && uvY >= 30 && uvY <= 47 && Math.abs(dx) > 48 && z < -100) {
      x = cx + (x - cx) * 1.14;
      z -= 16;
    }

    // 5. Lower Face / Bearded Jaw & Rounded Chin (uvY 41..56, y > 0, z < -80): Lulao's full bearded jaw & chin!
    if (acc.hasFace && uvY >= 41 && uvY <= 56 && y > 0 && z < -80) {
      const chinT = clamp((y - 10) / 145, 0, 1);
      // Broaden jaw & bring chin/beard smoothly forward and rounded
      x = cx + (x - cx) * (1.0 + 0.16 * chinT);
      z -= Math.round(16 * chinT);
      if (Math.abs(dx) < 55 && y > 80) {
        y += 8; // slightly fuller rounded bearded chin
      }
    }

    // 6. Ears (side UVs u <= 15 or u >= 49, mid-height, |z| < 95): Lulao's slightly more prominent ears
    if (acc.hasFace && (u <= 15 || u >= 49) && uvY >= 20 && uvY <= 48 && Math.abs(z) < 95) {
      x += (dx < 0 ? -14 : 14);
    }

    return {
      idx: v.idx,
      x: clamp(Math.round(x), -32767, 32767),
      y: clamp(Math.round(y), -32767, 32767),
      z: clamp(Math.round(z), -32767, 32767),
      w: v.w,
    };
  });

  // Write sculpted vertices back into PSX buffer + update exact bounding box in header!
  let xmin = 32767, xmax = -32768, ymin = 32767, ymax = -32768, zmin = 32767, zmax = -32768;
  for (let v = 0; v < nVerts; v++) {
    const nv = newVerts[v];
    buf.writeInt16LE(nv.x, vOff + v * 8);
    buf.writeInt16LE(nv.y, vOff + v * 8 + 2);
    buf.writeInt16LE(nv.z, vOff + v * 8 + 4);
    if (nv.w !== 2) {
      if (nv.x < xmin) xmin = nv.x; if (nv.x > xmax) xmax = nv.x;
      if (nv.y < ymin) ymin = nv.y; if (nv.y > ymax) ymax = nv.y;
      if (nv.z < zmin) zmin = nv.z; if (nv.z > zmax) zmax = nv.z;
    }
  }
  // Update int16 bounding box in mesh header (+0x0C..+0x17, units = coords / 16 rounded outward)
  buf.writeInt16LE(Math.ceil(xmax / 16), mo + 0x0C);
  buf.writeInt16LE(Math.floor(xmin / 16), mo + 0x0E);
  buf.writeInt16LE(Math.ceil(ymax / 16), mo + 0x10);
  buf.writeInt16LE(Math.floor(ymin / 16), mo + 0x12);
  buf.writeInt16LE(Math.ceil(zmax / 16), mo + 0x14);
  buf.writeInt16LE(Math.floor(zmin / 16), mo + 0x16);

  return { origVerts, newVerts, faces };
}

// Render Before vs After 3D Head Comparison PNG (Front + Side views overlaid!)
function renderHeadComparisonPng(sculptResult, outPath) {
  const PW = 240, PH = 240, W = PW * 2, H = PH * 2;
  const img = Buffer.alloc(W * H * 4, 22);
  for (let i = 0; i < W * H; i++) img[i * 4 + 3] = 255;

  const drawLine = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) {
        const o = (y0 * W + x0) * 4;
        img[o] = r; img[o+1] = g; img[o+2] = b; img[o+3] = 255;
      }
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  };
  const sc = 0.42;
  const plot = (ox, oy, verts, proj, col) => {
    for (const f of sculptResult.faces) {
      const ord = f.quad ? [0, 1, 3, 2] : [0, 1, 2];
      for (let k = 0; k < ord.length; k++) {
        const a = verts[f.rawVerts[ord[k]]], b = verts[f.rawVerts[ord[(k + 1) % ord.length]]];
        if (!a || !b || a.w === 2 || b.w === 2) continue;
        const [ax, ay] = proj(a), [bx, by] = proj(b);
        drawLine(ox + ax * sc, oy + ay * sc, ox + bx * sc, oy + by * sc, col[0], col[1], col[2]);
      }
    }
  };
  // Top row: Original Steve Caballero (Front + Side) in dim gray-blue
  plot(PW * 0.5, PH * 0.55, sculptResult.origVerts, v => [v.x, v.y], [120, 150, 180]);
  plot(PW * 1.5, PH * 0.55, sculptResult.origVerts, v => [v.z, v.y], [120, 150, 180]);
  // Bottom row: Overlay Original (dim red) + Sculpted Lulao (bright green/gold!)
  plot(PW * 0.5, PH * 1.55, sculptResult.origVerts, v => [v.x, v.y], [140, 50, 50]);
  plot(PW * 0.5, PH * 1.55, sculptResult.newVerts,  v => [v.x, v.y], [70, 255, 110]);
  plot(PW * 1.5, PH * 1.55, sculptResult.origVerts, v => [v.z, v.y], [140, 50, 50]);
  plot(PW * 1.5, PH * 1.55, sculptResult.newVerts,  v => [v.z, v.y], [70, 255, 110]);

  writePng(outPath, W, H, img);
}

// ============================================================================
// MAIN EXECUTION (--preview or full --apply)
// ============================================================================
const previewOnly = process.argv.includes('--preview');

// Ensure backups of SLUS_010.66, CD.HED, CD.WAD exist BEFORE any modification!
function ensureBackup(rel) {
  const src = path.join(rootDir, rel);
  const bak = path.join(backupDir, rel);
  if (!fs.existsSync(bak)) {
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.copyFileSync(src, bak);
    console.log(`  [backup] ${rel} -> originals_backup\\${rel}`);
  }
  return bak;
}

ensureBackup('SLUS_010.66');
ensureBackup('CD.HED');
ensureBackup('CD.WAD');

// Always read clean unmodded cab models & s2face2.bmp from originals_backup so script is 100% idempotent!
const origHed = fs.readFileSync(path.join(backupDir, 'CD.HED'));
const origWad = fs.readFileSync(path.join(backupDir, 'CD.WAD'));
const getOrigWadSlice = name => {
  const h = nsHash(name);
  for (let i = 0; i < (origHed.length - 4) / 12; i++) {
    if (origHed.readUInt32LE(i * 12) === h) {
      const o = origHed.readUInt32LE(i * 12 + 4), s = origHed.readUInt32LE(i * 12 + 8);
      return Buffer.from(origWad.subarray(o, o + s));
    }
  }
  throw new Error(`Nao encontrado no CD.WAD: ${name}`);
};

console.log('=== 1. Gerando texturas de alta precisao para Lulao ===');
const portrait = buildPortraitBmp(getOrigWadSlice('s2face2.bmp'));
const headRgba64 = buildHeadTexture64();
const torsoRgba128 = buildSuitTorsoTexture128x64();
const pantsRgba128 = buildSuitPantsTexture(128, 64);
const pantsRgba64 = buildSuitPantsTexture(64, 64);
const shinRgba32 = buildSuitPantsTexture(32, 32);
const sleeveRgba32 = buildSuitSleeveTexture(32, 64);
const hairRgba32 = buildSilverHairTexture32();

// Modify all 4 .PSX models in memory (same byte size!)
const modelSpecs = [
  {
    name: 'cab.psx', headMesh: 12, faceTexIdx: 3,
    texMap: {
      0xf59659e3: torsoRgba128,  // Torso (128x64)
      0x7a948d36: pantsRgba128,  // Pants (128x64)
      0x134420c2: headRgba64,    // Face/Head (64x64)
      0x720a8ef1: sleeveRgba32,  // Sleeves (32x64)
    }
  },
  {
    name: 'cab_L.psx', headMesh: 12, faceTexIdx: 7,
    texMap: {
      0xf59659e3: torsoRgba128,
      0x7a948d36: pantsRgba128,
      0x134420c2: headRgba64,
      0x720a8ef1: sleeveRgba32,
    }
  },
  {
    name: 'cab2b.psx', headMesh: 15, faceTexIdx: 6,
    texMap: {
      0x2fd2c5c1: torsoRgba128,  // Shirt -> Suit + Sash (128x64)
      0xf98267a1: headRgba64,    // Head/Face (64x64)
      0x6cfa5ba3: sleeveRgba32,  // Sleeve (32x64)
      0xbcd7678d: pantsRgba64,   // Shorts -> Navy Trousers (64x64)
      0x1a0761b6: shinRgba32,    // Shins -> Navy Trousers (32x32)
      0x604135d3: hairRgba32,    // Helmet -> Silver Hair (32x32)
    }
  },
  {
    name: 'cab2b_L.psx', headMesh: 15, faceTexIdx: 6,
    texMap: {
      0x2fd2c5c1: torsoRgba128,
      0xf98267a1: headRgba64,
      0x882e3822: sleeveRgba32,
      0xbcd7678d: pantsRgba64,
      0x1a0761b6: shinRgba32,
      0x604135d3: hairRgba32,
    }
  },
];

const modifiedModels = new Map();
let cabPreviewQ = {};
let cabSculpt = null;

console.log('\n=== 2. Aplicando texturas PS1 (BGR555) e esculpindo geometria 3D do rosto nos 4 .PSX ===');
for (const spec of modelSpecs) {
  const psxBuf = getOrigWadSlice(spec.name);
  const info = parsePsxStructure(psxBuf);
  let replacedTex = 0;
  for (const t of info.textures) {
    const newRgba = spec.texMap[t.palId];
    if (newRgba) {
      const qRgba = writeTextureIntoPsx(psxBuf, t, newRgba);
      replacedTex++;
      if (spec.name === 'cab.psx') {
        cabPreviewQ[t.palId] = { w: t.w, h: t.h, rgba: qRgba };
      }
    }
  }
  const sculpt = sculptHeadGeometryToLulao(psxBuf, info, spec.headMesh, spec.faceTexIdx);
  if (spec.name === 'cab.psx') cabSculpt = sculpt;
  modifiedModels.set(spec.name, psxBuf);
  console.log(`  [OK] ${spec.name.padEnd(12)} | ${psxBuf.length} B (tamanho exato!) | ${replacedTex} texturas BGR555 + HEAD Mesh[${spec.headMesh}] (${sculpt.newVerts.length} verts) esculpido!`);
}

// Save visual verification previews in build/_lulao_preview/
fs.mkdirSync(previewDir, { recursive: true });
writePng(path.join(previewDir, 'preview_s2face2.png'), 62, 47, portrait.previewRgba);
writePng(path.join(previewDir, 'preview_head_tex_64x64.png'), 64, 64, cabPreviewQ[0x134420c2].rgba);
writePng(path.join(previewDir, 'preview_torso_tex_128x64.png'), 128, 64, cabPreviewQ[0xf59659e3].rgba);
writePng(path.join(previewDir, 'preview_pants_128x64.png'), 128, 64, cabPreviewQ[0x7a948d36].rgba);
writePng(path.join(previewDir, 'preview_sleeve_32x64.png'), 32, 64, cabPreviewQ[0x720a8ef1].rgba);
renderHeadComparisonPng(cabSculpt, path.join(previewDir, 'preview_head_3d_before_after.png'));
console.log(`\nPreviews visuais salvos em: ${previewDir}`);

if (previewOnly) {
  console.log('Modo --preview ativo: nenhum arquivo do jogo foi alterado ainda.');
  process.exit(0);
}

// ============================================================================
// APPLY TO GAME FILES: SLUS_010.66 + CD.WAD (in-place exact-size updates!)
// ============================================================================
console.log('\n=== 3. Renomeando Steve Caballero -> Lulao em SLUS_010.66 ===');
const slusPath = path.join(rootDir, 'SLUS_010.66');
const slus = fs.readFileSync(slusPath);
const patchString = (fileOff, maxSlotLen, expectedOld, newStr) => {
  const curEnd = slus.indexOf(0, fileOff);
  const curStr = slus.subarray(fileOff, curEnd).toString('latin1');
  if (newStr.length > maxSlotLen) throw new Error(`String "${newStr}" maior que slot ${maxSlotLen}`);
  slus.fill(0, fileOff, fileOff + maxSlotLen + 1);
  Buffer.from(newStr, 'ascii').copy(slus, fileOff);
  console.log(`  [SLUS +0x${fileOff.toString(16)}] "${curStr}" -> "${newStr}"`);
};
patchString(0x0C45F0, 15, 'Steve Caballero', 'Lulao'); // g_SkaterTable[2].full_name @ 0x800D3DF0
patchString(0x0C4600,  5, 'Steve',           'Lulao'); // g_SkaterTable[2].short_name @ 0x800D3E00
patchString(0x0C8698, 15, 'Steve Caballero', 'Lulao'); // g_MovieTable[19].label @ 0x800D7E98
fs.writeFileSync(slusPath, slus);

console.log('\n=== 4. Aplicando s2face2.bmp (WAD + options.pre) e os 4 modelos .PSX em CD.WAD ===');
const curHed = fs.readFileSync(path.join(rootDir, 'CD.HED'));
const curWad = fs.readFileSync(path.join(rootDir, 'CD.WAD'));

function patchWadEntrySameSize(name, newBuf) {
  const h = nsHash(name);
  for (let i = 0; i < (curHed.length - 4) / 12; i++) {
    if (curHed.readUInt32LE(i * 12) === h) {
      const off = curHed.readUInt32LE(i * 12 + 4);
      const sz = curHed.readUInt32LE(i * 12 + 8);
      if (newBuf.length !== sz) throw new Error(`Tamanho divergente para ${name}: ${newBuf.length} vs ${sz}`);
      newBuf.copy(curWad, off);
      console.log(`  [CD.WAD idx=${String(i).padStart(4)} @ 0x${off.toString(16)}] ${name} (${sz} B) atualizado!`);
      return;
    }
  }
  throw new Error(`Entrada nao encontrada em CD.HED: ${name}`);
}

// 4a. Patch standalone s2face2.bmp (idx 370)
patchWadEntrySameSize('s2face2.bmp', portrait.bmpBuf);

// 4b. Patch s2face2.bmp INSIDE options.pre (idx 45)!
{
  const alignUp = (n, a) => (n + (a - 1)) & ~(a - 1);
  const optH = nsHash('options.pre');
  let optOff = -1, optSz = 0;
  for (let i = 0; i < (curHed.length - 4) / 12; i++) {
    if (curHed.readUInt32LE(i * 12) === optH) {
      optOff = curHed.readUInt32LE(i * 12 + 4);
      optSz = curHed.readUInt32LE(i * 12 + 8);
      break;
    }
  }
  const preBuf = curWad.subarray(optOff, optOff + optSz);
  const cnt = preBuf.readUInt32LE(0);
  let pos = 4, patchedInPre = false;
  for (let i = 0; i < cnt; i++) {
    const nul = preBuf.indexOf(0, pos);
    const nm = preBuf.subarray(pos, nul).toString('ascii');
    pos += alignUp(nul - pos + 1, 4);
    const sz = preBuf.readUInt32LE(pos);
    pos += 4;
    if (nm.toLowerCase() === 's2face2.bmp') {
      if (portrait.bmpBuf.length !== sz) throw new Error(`options.pre s2face2.bmp size mismatch!`);
      portrait.bmpBuf.copy(preBuf, pos);
      patchedInPre = true;
      console.log(`  [CD.WAD options.pre +0x${pos.toString(16)}] s2face2.bmp (${sz} B) atualizado dentro de options.pre!`);
    }
    pos = (i < cnt - 1) ? alignUp(pos + sz, 4) : pos + sz;
  }
  if (!patchedInPre) throw new Error('s2face2.bmp nao encontrado dentro de options.pre!');
}

// 4c. Patch all 4 3D skater models (cab.psx, cab_L.psx, cab2b.psx, cab2b_L.psx)
for (const [name, buf] of modifiedModels.entries()) {
  patchWadEntrySameSize(name, buf);
}

fs.writeFileSync(path.join(rootDir, 'CD.WAD'), curWad);
console.log('\n=== TODAS AS MODIFICACOES DO LULAO APLICADAS COM 100% DE PRECISAO! ===');
