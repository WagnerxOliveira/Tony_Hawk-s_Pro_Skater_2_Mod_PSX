#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Surgical Skater Transformation Tool: Kareem Campbell -> Bolsonaro
 *
 * Performs ALL 4 modifications cleanly and idempotently from originals_backup/:
 *  1. Renames "Kareem Campbell" / "Kareem" -> "Bolsonaro" / "Bolso" in SLUS_010.66
 *     (g_SkaterTable[3] @ 0x0C4714 / 0x0C4724 & g_MovieTable[20] @ 0x0C86A8)
 *  2. Replaces menu portrait s2face3.bmp (62x47 8-bit BMP, EXACT 4,088 bytes) in BOTH:
 *     - CD.WAD standalone (idx 371)
 *     - options.pre (idx 45 @ +0x266CC -> s2face3.bmp)
 *     Preserving original metallic bezel and exact #FF00FF magenta transparency at palette index 39!
 *  3. Replaces 3D outfit, face & fair-skin hand textures + BGR555 256-color CLUTs inside ALL 4 models:
 *     - Style A: campb2.psx, campb2_L.psx -> textura_bolsonaro.png (Navy Presidential Suit + Sash)
 *     - Style B: campb2b.psx, campb2bL.psx -> textura_bolsonaro_b.png (Striped Prison Shirt "171" + Pants + Fair Forearms)
 *     - Face/Hair: bolsonaro.png mapped pixel-accurately onto Kareem's 64x64 head UV + fair hands!
 *  4. Sculpts the 3D HEAD vertex geometry (Mesh[15], hash 0x7806eefa across all 4 models):
 *     - Removes the protruding backwards baseball cap bill (tucks z > 135 smoothly into occipital contour)
 *     - Contours the tall cap crown into Bolsonaro's smoother side-parted hair silhouette
 *     - Refines nose bridge, cheekbones and square jaw/chin while strictly locking w != 0 neck-seam stitch verts
 *     - Recomputes exact hdrBbox & safe bounding sphere radius (rad) to prevent any frustum culling!
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const ffmpegExe = path.join(rootDir, 'tools', 'bin', 'ffmpeg', 'ffmpeg-9.1-essentials_build', 'bin', 'ffmpeg.exe');
const suitAImgPath = path.join(rootDir, 'texturas_para_colocar_nos_skatistas', 'textura_bolsonaro.png');
const suitBImgPath = path.join(rootDir, 'texturas_para_colocar_nos_skatistas', 'textura_bolsonaro_b.png');
const faceImgPath = path.join(rootDir, 'fotos_para_modificar_nos_skatistas', 'bolsonaro.png');
const backupDir = path.join(rootDir, 'originals_backup');
const previewDir = path.join(rootDir, 'build', '_bolsonaro_preview');

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
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  fs.writeFileSync(filePath, Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]));
}

function medianCutPalette(pixels, maxColors) {
  if (pixels.length === 0) return [[0, 0, 0]];
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
  if (val === 0) val = 0x0421; // Never emit 0x0000 transparent black for opaque pixels!
  return val;
}

function quantizeImageForPsx(rgba, w, h, maxColors = 256, reserveTransparentIdx = -1) {
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
      palBgr555[c] = 0x0000;
      effRgb[c] = [0, 0, 0];
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

      const er = (r - qr) * 0.60, eg = (g - qg) * 0.60, eb = (b - qb) * 0.60;
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

// ============================================================================
// LOAD HIGH-RES SOURCES
// ============================================================================
const faceSrcW = 556, faceSrcH = 556;
const suitASrcW = 114, suitASrcH = 174;
const suitBSrcW = 180, suitBSrcH = 397;
const faceSrc = loadRgba(faceImgPath, faceSrcW, faceSrcH);
const suitASrc = loadRgba(suitAImgPath, suitASrcW, suitASrcH);
const suitBSrc = loadRgba(suitBImgPath, suitBSrcW, suitBSrcH);

// Sample Bolsonaro's exact fair skin & dark-brown/graying hair tones from bolsonaro.png
function sampleSkinAndHair() {
  // Forehead / cheek clean skin patch (x=210..330, y=120..185)
  let sr = 0, sg = 0, sb = 0, sc = 0;
  for (let y = 120; y <= 185; y += 3) {
    for (let x = 210; x <= 330; x += 3) {
      const c = sampleBilinear(faceSrc, faceSrcW, faceSrcH, x, y);
      sr += c[0]; sg += c[1]; sb += c[2]; sc++;
    }
  }
  // Hair crown patch (x=185..375, y=15..68)
  let hr = 0, hg = 0, hb = 0, hc = 0;
  for (let y = 18; y <= 65; y += 2) {
    for (let x = 190; x <= 370; x += 3) {
      const c = sampleBilinear(faceSrc, faceSrcW, faceSrcH, x, y);
      if (c[0] + c[1] + c[2] < 380) { hr += c[0]; hg += c[1]; hb += c[2]; hc++; }
    }
  }
  return {
    skin: [Math.round(sr / sc), Math.round(sg / sc), Math.round(sb / sc)],
    hair: hc ? [Math.round(hr / hc), Math.round(hg / hc), Math.round(hb / hc)] : [74, 72, 68],
  };
}
const bolsoTones = sampleSkinAndHair();

// ============================================================================
// 1. PORTRAIT BMP (s2face3.bmp — EXACT 4,088 B, MAGENTA INDEX 39!)
// ============================================================================
function buildPortraitBmp(origBmpBuf) {
  const w = 62, h = 47, rowStride = 64, offBits = 1078;
  const MAGENTA_IDX = 39; // Verified exact transparency index in original s2face3.bmp!
  const isInner = (x, y) => x >= 7 && x <= 52 && y >= 4 && y <= 39;

  const innerW = 46, innerH = 36;
  // Crop bolsonaro.png tightly around head & face (x=42..514, y=4..526) -> 46x36
  const cropArgs = [
    '-v', 'error', '-i', faceImgPath,
    '-vf', `crop=472:522:42:4,scale=${innerW}:${innerH}:flags=lanczos`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'
  ];
  const innerRgba = spawnSync(ffmpegExe, cropArgs, { maxBuffer: 10 * 1024 * 1024 }).stdout;

  const fixedPalette = new Array(256).fill(null);
  fixedPalette[MAGENTA_IDX] = [255, 0, 255];
  const keyToIdx = new Map([['255,0,255', MAGENTA_IDX]]);
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
  for (let i = 0; i < innerW * innerH; i++) {
    innerPx.push([innerRgba[i * 4], innerRgba[i * 4 + 1], innerRgba[i * 4 + 2]]);
  }
  const faceCols = medianCutPalette(innerPx, freeCount);
  let fc = 0;
  for (let i = 0; i < 256; i++) {
    if (fixedPalette[i] === null) fixedPalette[i] = fc < faceCols.length ? faceCols[fc++] : [0, 0, 0];
  }

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
          if (c === MAGENTA_IDX) continue;
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
      const po = (y * w + x) * 4;
      previewRgba[po] = pr; previewRgba[po + 1] = pg; previewRgba[po + 2] = pb; previewRgba[po + 3] = 255;
    }
  }
  return { outBmp, previewRgba };
}

// ============================================================================
// 2. BOLSONARO 64x64 3D HEAD TEXTURE (ALIGNED TO KAREEM'S EXACT UV MAP!)
//    Verified Kareem UV landmarks:
//      - Top/Crown/Back Hair: y = 0..21 & outer edges x < 11 / x > 53
//      - Forehead:            y = 19..25, x = 15..49
//      - Eyes:                y = 26..30, x = 22..41
//      - Nose tip:            y = 33..37, x = 29..34
//      - Mouth:               y = 42..47, x = 24..39
//      - Chin / Neck:         y = 50..63
// ============================================================================
function buildBolsonaroHead64() {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);

  // Dark brown / subtle graying hair texture generator (sampled from bolsonaro.png crown with natural strands)
  const hairPixel = (x, y) => {
    const u = ((x * 5 + y * 2) % 160);
    const v = 16 + ((y * 3 + Math.floor(Math.sin(x * 0.45) * 4)) % 36);
    const s = sampleBilinear(faceSrc, faceSrcW, faceSrcH, 195 + u, clamp(v, 14, 52));
    // Keep rich dark-brown/graying hair with subtle side-part sheen
    const strand = 0.88 + 0.18 * Math.sin(x * 0.65 + y * 0.25);
    const crownShade = 0.82 + 0.22 * (1 - clamp(y / 64, 0, 1));
    return [
      clamp(Math.round(lerp(bolsoTones.hair[0], s[0], 0.55) * strand * crownShade), 18, 175),
      clamp(Math.round(lerp(bolsoTones.hair[1], s[1], 0.55) * strand * crownShade), 16, 170),
      clamp(Math.round(lerp(bolsoTones.hair[2], s[2], 0.55) * strand * crownShade), 14, 165),
    ];
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let col;
      // Neck/lower chin skin base under y > 54, center x=14..50
      // Side/back hair everywhere outside the facial oval!
      // Face oval centered at (32, 36.5), rx=19.5, ry=19.5
      // Source landmarks in bolsonaro.png (556x556):
      //   Hairline ~ y=85, Eyes ~ y=224, Nose tip ~ y=312, Mouth ~ y=405, Chin ~ y=502
      //   Face X span: x=105..455 (center ~ 282)
      const nx = (x - 32) / 18.5;
      const ny = (y - 36.5) / 19.0;
      const inFaceBox = (x >= 11 && x <= 53 && y >= 15 && y <= 57);

      if (y < 14) {
        // Pure crown/top hair (replaces Kareem's white baseball cap completely!)
        col = hairPixel(x, y);
        // Subtle side-part line on viewer's left (x ~ 21..23, y=4..14)
        if (Math.abs(x - 22) <= 1.2 && y >= 5) {
          col = col.map(c => Math.round(c * 0.68));
        }
      } else if (y >= 55 && Math.abs(x - 32) <= 21) {
        // Fair skin neck transition matching lower chin/jaw
        const edgeFade = clamp((Math.abs(x - 32) - 14) / 7, 0, 1);
        const neckShade = 0.80 + 0.12 * (1 - (y - 55) / 9);
        const sk = [Math.round(bolsoTones.skin[0] * neckShade), Math.round(bolsoTones.skin[1] * neckShade), Math.round(bolsoTones.skin[2] * neckShade)];
        const hr = hairPixel(x, y);
        col = [Math.round(lerp(sk[0], hr[0], edgeFade)), Math.round(lerp(sk[1], hr[1], edgeFade)), Math.round(lerp(sk[2], hr[2], edgeFade))];
      } else if (inFaceBox) {
        // Map (x=13..51 -> sx=108..454) and (y=17..55 -> sy=82..502)
        // Check exact landmark alignment:
        //   y=28 -> sy = 82 + (11/38)*420 = 204..224 (eyes!)
        //   y=35 -> sy = 82 + (18/38)*420 = 281..305 (nose!)
        //   y=44 -> sy = 82 + (27/38)*420 = 380..405 (mouth!)
        //   y=52 -> sy = 82 + (35/38)*420 = 469..495 (chin!)
        const sx = 282 + (x - 32) * 9.3;
        const sy = 96 + (y - 17) * 10.9;
        const fc = sampleBilinear(faceSrc, faceSrcW, faceSrcH, sx, sy);

        // Compute smooth elliptical hair blend around temples, forehead hairline, and outer ears/sides
        const hr = hairPixel(x, y);
        const hairlineY = 17.5 + (x > 34 ? 1.8 * clamp((x - 34) / 14, 0, 1) : 0) + Math.pow((x - 32) / 18, 2) * 3.5;
        let hairBlend = 0;
        if (y < hairlineY) {
          hairBlend = clamp((hairlineY - y) / 3.0, 0, 1);
        }
        // Taper side width smoothly along lower jaw/ears so photo background behind ears/neck is 100% eliminated!
        const sideHalf = (y > 38) ? lerp(16.8, 12.2, clamp((y - 38) / 15, 0, 1)) : 17.5;
        if (Math.abs(x - 32) > sideHalf - 2.0) {
          hairBlend = Math.max(hairBlend, clamp((Math.abs(x - 32) - (sideHalf - 2.0)) / 3.2, 0, 1));
        }
        // Prevent ONLY pure bright white sky background bleed at upper-outer corners (never bright cheek skin!)
        const isBrightBg = (fc[0] > 232 && fc[1] > 232 && fc[2] > 225 && (Math.abs(x - 32) > 13 || y < 21));
        if (isBrightBg) hairBlend = 1.0;

        // Clean lower chin/neck transition (y >= 51): eliminate any blue shirt/black suit collar pixels!
        let faceCol = [fc[0], fc[1], fc[2]];
        if (y >= 49) {
          const isCollar = (fc[2] > fc[0] - 5) || (fc[0] < 85 && fc[1] < 85) || (Math.abs(x - 32) > 9);
          const neckT = clamp((y - 51) / 4.0, 0, 1);
          const neckCol = [Math.round(bolsoTones.skin[0] * 0.85), Math.round(bolsoTones.skin[1] * 0.85), Math.round(bolsoTones.skin[2] * 0.85)];
          if (isCollar || neckT > 0) {
            const blendAmt = isCollar ? Math.max(neckT, 0.92) : neckT;
            faceCol = [
              Math.round(lerp(faceCol[0], neckCol[0], blendAmt)),
              Math.round(lerp(faceCol[1], neckCol[1], blendAmt)),
              Math.round(lerp(faceCol[2], neckCol[2], blendAmt)),
            ];
          }
        }
        col = [
          Math.round(lerp(faceCol[0], hr[0], hairBlend)),
          Math.round(lerp(faceCol[1], hr[1], hairBlend)),
          Math.round(lerp(faceCol[2], hr[2], hairBlend)),
        ];
      } else {
        // Sides & back of head -> Bolsonaro's dark brown/graying hair
        col = hairPixel(x, y);
      }
      const d = (y * W + x) * 4;
      rgba[d] = clamp(col[0], 8, 250); rgba[d + 1] = clamp(col[1], 8, 250); rgba[d + 2] = clamp(col[2], 8, 250); rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// ============================================================================
// 3. FAIR SKIN HANDS (64x16 — RECOLORED FROM KAREEM'S HAND TEXTURE!)
// ============================================================================
function buildFairHands64x16(origPsxBuf, handTex) {
  const W = handTex.w, H = handTex.h;
  const rgba = Buffer.alloc(W * H * 4);
  const pal = [];
  for (let c = 0; c < 256; c++) {
    const v = origPsxBuf.readUInt16LE(handTex.palInfo.offset + c * 2);
    pal.push([((v & 0x1F) * 255 / 31) | 0, (((v >> 5) & 0x1F) * 255 / 31) | 0, (((v >> 10) & 0x1F) * 255 / 31) | 0, v === 0 ? 0 : 255]);
  }
  // Find average luminance of opaque pixels in original hand texture so shading ratio is preserved
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
      const ratio = clamp(0.74 + (lum / avgL - 0.72) * 0.90, 0.56, 1.18);
      rgba[d] = clamp(Math.round((bolsoTones.skin[0] * 1.12) * ratio), 24, 250);
      rgba[d + 1] = clamp(Math.round((bolsoTones.skin[1] * 1.04) * ratio), 20, 232);
      rgba[d + 2] = clamp(Math.round((bolsoTones.skin[2] * 0.95) * ratio), 16, 215);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// ============================================================================
// 4. STYLE A (textura_bolsonaro.png): NAVY PRESIDENTIAL SUIT + SASH
// ============================================================================
function buildSuitTorsoA128x64() {
  const W = 128, H = 64;
  const rgba = Buffer.alloc(W * H * 4);

  // Sample pure navy cloth from right lapel/sleeve area of textura_bolsonaro.png (114x174)
  const navyAt = (u, v) => {
    const c = sampleBilinear(suitASrc, suitASrcW, suitASrcH, 86 + (u % 1) * 16, 40 + (v % 1) * 65);
    return [c[0], c[1], c[2]];
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let col;
      // Front chest maps to u = 32..96 (center x=64); Back wraps on x=0..32 and x=96..128
      if (x >= 32 && x <= 96) {
        // Sample cleanly inside jacket torso of textura_bolsonaro.png (x=17..92, y=5..144) — zero hand/background bleed!
        const u = (x - 32) / 64;
        const v = y / (H - 1);
        const sx = 17 + u * 75;
        const sy = 5 + v * 139;
        const c = sampleBilinear(suitASrc, suitASrcW, suitASrcH, sx, sy);
        // Clean ONLY sky/wall background at top corners OR reddish/pinkish hand skin (R > G + 24) at far lower-right hip (never yellow/green sash!)
        const isTopBg = (u < 0.16 || u > 0.84) && v < 0.18 && (c[0] > 130 && c[1] > 130 && c[2] > 115);
        const isHipHand = v > 0.78 && u > 0.84 && (c[0] > c[1] + 22 && c[0] > 110);
        const isHipLeftBg = v > 0.78 && u < 0.10 && (c[0] > 120 && c[1] > 115 && c[2] > 100);
        if (isTopBg || isHipHand || isHipLeftBg) {
          col = navyAt(u * 2, v);
        } else {
          col = [c[0], c[1], c[2]];
        }
        // Subtle cylindrical side darkening toward seams x=32 & x=96
        const edge = Math.min(x - 32, 96 - x);
        const sh = edge < 7 ? lerp(0.84, 1.0, edge / 7) : 1.0;
        col = col.map(v => Math.round(v * sh));
      } else {
        // Back of navy suit with continuous diagonal green-yellow-green presidential sash!
        const bx = x < 32 ? (32 - x) : (128 - x + 32); // 0..64 across back
        const bu = bx / 64;
        const bv = y / (H - 1);
        col = navyAt(bu * 1.5, bv);
        // Back center seam & subtle shoulder shading
        const bShade = 0.84 + 0.16 * Math.sin(bu * Math.PI);
        col = col.map(v => Math.round(v * bShade));
        if (Math.abs(bx - 32) < 1.0) col = col.map(v => Math.round(v * 0.72));
        // Diagonal sash across back (from top-right shoulder down to lower-left hip)
        const diag = (bu * 1.05 - bv * 0.88 - 0.08);
        const ad = Math.abs(diag);
        if (ad < 0.14) {
          if (ad < 0.052) col = [232, 206, 22];      // Bright Brazilian yellow center
          else if (ad < 0.125) col = [48, 152, 54];  // Brazilian green bands
          else col = [26, 94, 34];                   // Dark green sash border
          col = col.map(v => Math.round(v * (0.86 + 0.14 * Math.sin(bu * Math.PI))));
        }
      }
      const d = (y * W + x) * 4;
      rgba[d] = clamp(col[0], 8, 250); rgba[d + 1] = clamp(col[1], 8, 250); rgba[d + 2] = clamp(col[2], 8, 250); rgba[d + 3] = 255;
    }
  }
  return rgba;
}

function buildSuitPantsA64x64() {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = sampleBilinear(suitASrc, suitASrcW, suitASrcH, 86 + (x / W) * 16, 45 + (y / H) * 65);
      const cyl = 0.78 + 0.24 * Math.sin((x / W) * Math.PI);
      const crease = 0.93 + 0.07 * Math.cos(((x / W) * 2 - 1) * Math.PI * 2);
      const d = (y * W + x) * 4;
      if (y < 4) {
        const isBuckle = x >= 27 && x <= 36 && y >= 1 && y <= 2;
        if (isBuckle) { rgba[d] = 180; rgba[d+1] = 160; rgba[d+2] = 92; rgba[d+3] = 255; }
        else { rgba[d] = 18; rgba[d+1] = 20; rgba[d+2] = 28; rgba[d+3] = 255; }
      } else {
        rgba[d] = clamp(Math.round(c[0] * cyl * crease), 8, 245);
        rgba[d + 1] = clamp(Math.round(c[1] * cyl * crease), 8, 245);
        rgba[d + 2] = clamp(Math.round(c[2] * cyl * crease), 8, 245);
        rgba[d + 3] = 255;
      }
    }
  }
  return rgba;
}

function buildSuitSleevesA64x64() {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = sampleBilinear(suitASrc, suitASrcW, suitASrcH, 86 + (x / W) * 16, 45 + (y / H) * 65);
      const cyl = 0.84 + 0.18 * Math.sin((x / W) * Math.PI);
      const elbow = 1.0 - 0.10 * Math.exp(-Math.pow((y - 32) / 4.5, 2));
      const d = (y * W + x) * 4;
      if (y >= H - 4) {
        const cw = Math.round(230 * cyl);
        rgba[d] = cw; rgba[d + 1] = cw; rgba[d + 2] = Math.min(242, cw + 6); rgba[d + 3] = 255;
      } else {
        rgba[d] = clamp(Math.round(c[0] * cyl * elbow), 8, 245);
        rgba[d + 1] = clamp(Math.round(c[1] * cyl * elbow), 8, 245);
        rgba[d + 2] = clamp(Math.round(c[2] * cyl * elbow), 8, 245);
        rgba[d + 3] = 255;
      }
    }
  }
  return rgba;
}

// ============================================================================
// 5. STYLE B (textura_bolsonaro_b.png): STRIPED PRISON "171" SHIRT + PANTS + FAIR FOREARMS
// ============================================================================
function samplePrisonPaletteB() {
  let dr = 0, dg = 0, db = 0, dc = 0, lr = 0, lg = 0, lb = 0, lc = 0;
  for (let y = 120; y <= 290; y += 2) {
    for (let x = 45; x <= 135; x += 2) {
      const c = sampleBilinear(suitBSrc, suitBSrcW, suitBSrcH, x, y);
      const lum = c[0] * 0.30 + c[1] * 0.59 + c[2] * 0.11;
      if (lum < 65) { dr += c[0]; dg += c[1]; db += c[2]; dc++; }
      else if (lum > 175) { lr += c[0]; lg += c[1]; lb += c[2]; lc++; }
    }
  }
  return {
    dark: dc ? [Math.round(dr / dc), Math.round(dg / dc), Math.round(db / dc)] : [26, 28, 32],
    light: lc ? [Math.round(lr / lc), Math.round(lg / lc), Math.round(lb / lc)] : [224, 224, 226],
  };
}
const bolsoBCols = samplePrisonPaletteB();

function prisonStripeB(x, y, W, H, period = 7.4, phase = 0.5) {
  const wave = Math.sin((x / W) * Math.PI * 4) * 0.28 + Math.cos((y / H) * Math.PI * 6) * 0.14;
  const pos = ((y + phase + wave) % period + period) % period;
  const half = period * 0.5;
  let t;
  if (pos < half - 0.55) t = 0;
  else if (pos < half + 0.55) t = (pos - (half - 0.55)) / 1.1;
  else if (pos < period - 0.55) t = 1;
  else t = 1 - (pos - (period - 0.55)) / 1.1;
  return [
    clamp(Math.round(lerp(bolsoBCols.dark[0], bolsoBCols.light[0], t)), 10, 245),
    clamp(Math.round(lerp(bolsoBCols.dark[1], bolsoBCols.light[1], t)), 10, 245),
    clamp(Math.round(lerp(bolsoBCols.dark[2], bolsoBCols.light[2], t)), 10, 245),
  ];
}

// Crisp 4x7 pixel bitmap for "171" prison badge on left chest (viewer's right, verified upright!)
const GLYPH_171 = {
  '1': [
    '0110',
    '1110',
    '0110',
    '0110',
    '0110',
    '0110',
    '1111',
  ],
  '7': [
    '1111',
    '1111',
    '0011',
    '0110',
    '0110',
    '1100',
    '1100',
  ],
};

function buildPrisonTorsoB128x64() {
  const W = 128, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let [r, g, b] = prisonStripeB(x, y, W, H, 7.4, 0.8);
      const sideDist = Math.min(Math.abs(x - 32), Math.abs(x - 96));
      let shade = 0.78 + 0.24 * clamp(sideDist / 24, 0, 1);
      shade *= (0.94 + 0.06 * Math.sin((x / W) * Math.PI * 10));
      if (y > 57) shade *= lerp(1.0, 0.78, (y - 57) / 6);
      r = Math.round(r * shade); g = Math.round(g * shade); b = Math.round(b * shade);

      const dx = x - 64;
      // 1. V-neck fair skin chest opening at top center (matching textura_bolsonaro_b.png!)
      if (y <= 11) {
        const vHalf = Math.max(0, 8.2 - y * 0.76);
        if (Math.abs(dx) <= vHalf) {
          const skShade = 0.84 + 0.14 * (1 - y / 11);
          r = Math.round(bolsoTones.skin[0] * skShade);
          g = Math.round(bolsoTones.skin[1] * skShade);
          b = Math.round(bolsoTones.skin[2] * skShade);
        } else if (Math.abs(dx) <= vHalf + 1.5) {
          // Dark V-neck ribbed trim
          r = 26; g = 28; b = 32;
        }
      }

      // 2. Crisp white "171" prison badge on left chest (viewer's right, x=68..86, y=13..24)
      if (x >= 68 && x <= 86 && y >= 13 && y <= 24) {
        const onBorder = (x === 68 || x === 86 || y === 13 || y === 24);
        if (onBorder) {
          r = 42; g = 44; b = 48;
        } else {
          r = 236; g = 236; b = 238;
        }
      }

      const d = (y * W + x) * 4;
      rgba[d] = clamp(r, 8, 250); rgba[d + 1] = clamp(g, 8, 250); rgba[d + 2] = clamp(b, 8, 250); rgba[d + 3] = 255;
    }
  }

  // Stamp bold black "171" inside the white chest badge (x0=71, y0=15)
  const drawDigit = (ch, ox, oy) => {
    const rows = GLYPH_171[ch];
    for (let gy = 0; gy < rows.length; gy++) {
      for (let gx = 0; gx < rows[gy].length; gx++) {
        if (rows[gy][gx] === '1') {
          const d = ((oy + gy) * W + (ox + gx)) * 4;
          rgba[d] = 16; rgba[d + 1] = 18; rgba[d + 2] = 22; rgba[d + 3] = 255;
        }
      }
    }
  };
  drawDigit('1', 70, 15);
  drawDigit('7', 75, 15);
  drawDigit('1', 80, 15);

  return rgba;
}

// Style B Sleeves (64x64): Upper half (y=0..33) short striped prison sleeve, lower half (y=34..63) fair forearms + wrist cuffs!
function buildPrisonSleevesB64x64() {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cyl = 0.80 + 0.22 * Math.sin((x / W) * Math.PI);
      const d = (y * W + x) * 4;
      if (y <= 33) {
        let [r, g, b] = prisonStripeB(x, y, W, H, 7.4, 0.5);
        const hem = y >= 31 ? 0.72 : 1.0;
        rgba[d] = clamp(Math.round(r * cyl * hem), 8, 245);
        rgba[d + 1] = clamp(Math.round(g * cyl * hem), 8, 245);
        rgba[d + 2] = clamp(Math.round(b * cyl * hem), 8, 245);
        rgba[d + 3] = 255;
      } else if (y >= 56 && y <= 60) {
        // Subtle metallic steel cuff band near wrist (nod to textura_bolsonaro_b.png!)
        const metal = Math.round((135 + 45 * Math.sin((x / W) * Math.PI * 2)) * (y === 58 ? 1.15 : 0.75));
        rgba[d] = clamp(metal, 30, 220); rgba[d + 1] = clamp(metal, 30, 220); rgba[d + 2] = clamp(metal + 10, 35, 230); rgba[d + 3] = 255;
      } else {
        // Bolsonaro's fair skin forearm with natural arm shadow right under sleeve edge
        const sleeveShadow = y <= 37 ? lerp(0.76, 1.0, (y - 33) / 4) : 1.0;
        rgba[d] = clamp(Math.round(bolsoTones.skin[0] * cyl * sleeveShadow), 16, 250);
        rgba[d + 1] = clamp(Math.round(bolsoTones.skin[1] * cyl * sleeveShadow), 14, 240);
        rgba[d + 2] = clamp(Math.round(bolsoTones.skin[2] * cyl * sleeveShadow), 12, 232);
        rgba[d + 3] = 255;
      }
    }
  }
  return rgba;
}

function buildPrisonPantsB64x64() {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let [r, g, b] = prisonStripeB(x, y, W, H, 7.6, 0.5);
      const cyl = 0.80 + 0.22 * Math.sin((x / W) * Math.PI);
      const crease = 0.94 + 0.06 * Math.cos(((x / W) * 2 - 1) * Math.PI * 2);
      const top = y < 3 ? 0.74 : 1.0;
      const d = (y * W + x) * 4;
      rgba[d] = clamp(Math.round(r * cyl * crease * top), 8, 245);
      rgba[d + 1] = clamp(Math.round(g * cyl * crease * top), 8, 245);
      rgba[d + 2] = clamp(Math.round(b * cyl * crease * top), 8, 245);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// ============================================================================
// PSX PARSER, TEXTURE WRITER & 3D HEAD SCULPTOR (REMOVES BACKWARDS CAP BILL!)
// ============================================================================
function parsePsxStructure(buf) {
  const ptrMeta = buf.readUInt32LE(4);
  const numObjs = buf.readUInt32LE(8);
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
  return { ptrMeta, numMeshes, meshOffs, meshHashes, textures };
}

function writeTextureIntoPsx(buf, tex, rgba, preserveAlpha = false) {
  if (tex.palSize !== 256 || !tex.palInfo) throw new Error(`Esperado 256-col em tex[${tex.i}]`);
  if (tex.dataLen !== tex.w * tex.h) throw new Error(`dataLen mismatch em tex[${tex.i}]`);
  // If preserveAlpha=true (hands), find original transparent index (0x0000) so alpha matches original!
  let transIdx = -1;
  if (preserveAlpha) {
    for (let c = 0; c < 256; c++) {
      if (buf.readUInt16LE(tex.palInfo.offset + c * 2) === 0x0000) { transIdx = c; break; }
    }
  }
  const q = quantizeImageForPsx(rgba, tex.w, tex.h, 256, transIdx);
  for (let c = 0; c < 256; c++) buf.writeUInt16LE(q.palBgr555[c], tex.palInfo.offset + c * 2);
  q.indices.copy(buf, tex.dataOff);
  return q.outRgba;
}

/**
 * Surgically sculpts Kareem's 3D HEAD (Mesh[15], hash 0x7806eefa) into Bolsonaro:
 *  - Strictly locks all w != 0 neck-seam stitch vertices!
 *  - Removes the protruding backwards baseball cap bill (z > 135) by smoothly tucking it into occipital contour!
 *  - Lowers/contours tall cap crown into Bolsonaro's side-parted hair dome
 *  - Refines nose bridge (slightly narrower, sharper profile), cheekbones, and squarer jaw/chin
 *  - Updates exact hdrBbox & safe bounding sphere rad!
 */
function sculptHeadGeometryToBolsonaro(buf, psxInfo, headMeshIdx) {
  const mo = psxInfo.meshOffs[headMeshIdx];
  const mEnd = (headMeshIdx + 1 < psxInfo.numMeshes) ? psxInfo.meshOffs[headMeshIdx + 1] : psxInfo.ptrMeta;
  const nVerts = buf.readUInt16LE(mo + 2), nNorms = buf.readUInt16LE(mo + 4), nFaces = buf.readUInt16LE(mo + 6);
  const vOff = mo + 28, nOff = vOff + nVerts * 8, fOff = nOff + nNorms * 8;

  const origVerts = Array.from({ length: nVerts }, (_, v) => ({
    idx: v,
    x: buf.readInt16LE(vOff + v * 8), y: buf.readInt16LE(vOff + v * 8 + 2),
    z: buf.readInt16LE(vOff + v * 8 + 4), w: buf.readUInt16LE(vOff + v * 8 + 6),
  }));

  const vertUvAcc = Array.from({ length: nVerts }, () => ({ su: 0, sv: 0, cnt: 0 }));
  const faces = [];
  let fp = fOff;
  for (let fi = 0; fi < nFaces && fp + 4 <= mEnd; fi++) {
    const fl = buf.readUInt16LE(fp), fLen = buf.readUInt16LE(fp + 2);
    if (fLen < 12 || fp + fLen > mEnd) break;
    const rv = [buf[fp + 4], buf[fp + 5], buf[fp + 6], buf[fp + 7]];
    const gpu = buf[fp + 11], quad = (gpu & 8) !== 0;
    if (((fl & 1) || (gpu & 4)) && fLen >= 28) {
      const uvs = [[buf[fp+20],buf[fp+21]],[buf[fp+22],buf[fp+23]],[buf[fp+24],buf[fp+25]]];
      if (quad) uvs.push([buf[fp+26],buf[fp+27]]);
      for (let k = 0; k < (quad ? 4 : 3); k++) {
        if (rv[k] < nVerts) { vertUvAcc[rv[k]].su += uvs[k][0]; vertUvAcc[rv[k]].sv += uvs[k][1]; vertUvAcc[rv[k]].cnt++; }
      }
    }
    faces.push({ rawVerts: rv, quad });
    fp += fLen;
  }

  // Head X center from front face verts (z < -150, w === 0)
  let sumX = 0, cntX = 0;
  for (const v of origVerts) if (v.w === 0 && v.z < -150) { sumX += v.x; cntX++; }
  const cx = cntX ? sumX / cntX : 5;

  const newVerts = origVerts.map(v => {
    if (v.w !== 0) return { ...v }; // NEVER touch neck-seam stitch vertices!
    let x = v.x, y = v.y, z = v.z;
    const acc = vertUvAcc[v.idx];
    const u = acc.cnt ? acc.su / acc.cnt : 32;
    const uvY = acc.cnt ? acc.sv / acc.cnt : 32;
    const dx = x - cx;

    // 1. REMOVE BACKWARDS BASEBALL CAP BILL (protruding z > 135 near y = -60..+40)!
    if (z > 135) {
      // Smoothly collapse backwards cap visor inward onto natural back-of-head skull contour (z ~ 108..132)
      z = 112 + (z - 135) * 0.14;
      x = cx + dx * 0.68;
      if (y > -60) y = lerp(y, -48, 0.55);
    }

    // 2. CAP CROWN -> BOLSONARO'S SMOOTHER NATURAL SIDE-PARTED HAIR DOME (y < -200)
    if (y < -200) {
      const topT = clamp((-200 - y) / 160, 0, 1);
      // Lower tall baseball-cap crown by ~12% and slightly narrow blocky cap corners
      y = -200 - (-200 - y) * (1.0 - 0.13 * topT);
      x = cx + dx * (1.0 - 0.06 * topT);
      if (z > 0) z *= (1.0 - 0.10 * topT);
    }

    // 3. FOREHEAD & BROW (uvY 16..27, z < -180): Bolsonaro's slightly broader, prominent forehead
    if (uvY >= 16 && uvY <= 27 && z < -180) {
      x = cx + dx * 1.04;
      z -= 8;
    }

    // 4. NOSE (uvY 28..40, u 25..38, z < -230): Narrower, straighter, slightly longer nose bridge
    if (uvY >= 28 && uvY <= 40 && u >= 25 && u <= 38 && z < -230) {
      x = cx + dx * 0.86;
      z -= 10;
    }

    // 5. CHEEKS & JAW / CHIN (uvY 38..54, z < -140): Bolsonaro's slightly squarer, firmer lower jaw & chin
    if (uvY >= 38 && uvY <= 54 && z < -140) {
      const jawT = clamp((y + 40) / 130, 0, 1);
      x = cx + dx * (1.0 + 0.08 * jawT);
      if (y > 20 && Math.abs(dx) < 60) {
        y += 12; // slightly longer, squarer chin
        z -= 6;
      }
    }

    return {
      idx: v.idx,
      x: clamp(Math.round(x), -32767, 32767),
      y: clamp(Math.round(y), -32767, 32767),
      z: clamp(Math.round(z), -32767, 32767),
      w: v.w,
    };
  });

  // Write sculpted vertices + exact hdrBbox + safe bounding sphere radius
  let xmin = 32767, xmax = -32768, ymin = 32767, ymax = -32768, zmin = 32767, zmax = -32768, maxVertR = 0;
  for (let v = 0; v < nVerts; v++) {
    const nv = newVerts[v];
    buf.writeInt16LE(nv.x, vOff + v * 8);
    buf.writeInt16LE(nv.y, vOff + v * 8 + 2);
    buf.writeInt16LE(nv.z, vOff + v * 8 + 4);
    if (nv.x < xmin) xmin = nv.x; if (nv.x > xmax) xmax = nv.x;
    if (nv.y < ymin) ymin = nv.y; if (nv.y > ymax) ymax = nv.y;
    if (nv.z < zmin) zmin = nv.z; if (nv.z > zmax) zmax = nv.z;
    const r = Math.hypot(nv.x, nv.y, nv.z); if (r > maxVertR) maxVertR = r;
  }
  const origRad = buf.readUInt32LE(mo + 0x08);
  buf.writeUInt32LE(Math.max(origRad, Math.ceil(maxVertR / 16) * 4096), mo + 0x08);
  buf.writeInt16LE(Math.ceil(xmax / 16), mo + 0x0C);
  buf.writeInt16LE(Math.floor(xmin / 16), mo + 0x0E);
  buf.writeInt16LE(Math.ceil(ymax / 16), mo + 0x10);
  buf.writeInt16LE(Math.floor(ymin / 16), mo + 0x12);
  buf.writeInt16LE(Math.ceil(zmax / 16), mo + 0x14);
  buf.writeInt16LE(Math.floor(zmin / 16), mo + 0x16);

  return { origVerts, newVerts, faces };
}

function renderHeadComparisonPng(sculptResult, outPath) {
  const PW = 240, PH = 240, W = PW * 2, H = PH * 2;
  const img = Buffer.alloc(W * H * 4, 22);
  for (let i = 0; i < W * H; i++) img[i * 4 + 3] = 255;
  const drawLine = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) { const o = (y0 * W + x0) * 4; img[o] = r; img[o+1] = g; img[o+2] = b; img[o+3] = 255; }
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  };
  const sc = 0.36;
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
  plot(PW * 0.5, PH * 0.65, sculptResult.origVerts, v => [v.x, v.y], [120, 150, 180]);
  plot(PW * 1.5, PH * 0.65, sculptResult.origVerts, v => [v.z, v.y], [120, 150, 180]);
  plot(PW * 0.5, PH * 1.65, sculptResult.origVerts, v => [v.x, v.y], [150, 50, 50]);
  plot(PW * 0.5, PH * 1.65, sculptResult.newVerts,  v => [v.x, v.y], [70, 255, 110]);
  plot(PW * 1.5, PH * 1.65, sculptResult.origVerts, v => [v.z, v.y], [150, 50, 50]);
  plot(PW * 1.5, PH * 1.65, sculptResult.newVerts,  v => [v.z, v.y], [70, 255, 110]);
  writePng(outPath, W, H, img);
}

// ============================================================================
// MAIN EXECUTION (--preview or full apply)
// ============================================================================
const previewOnly = process.argv.includes('--preview');
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

console.log('=== 1. Gerando texturas de alta precisao para Bolsonaro (Style A: Terno + Faixa | Style B: Listrado 171) ===');
const portrait = buildPortraitBmp(getOrigWadSlice('s2face3.bmp'));
const headRgba64 = buildBolsonaroHead64();
const suitATorso128 = buildSuitTorsoA128x64();
const suitAPants64 = buildSuitPantsA64x64();
const suitASleeves64 = buildSuitSleevesA64x64();
const prisonBTorso128 = buildPrisonTorsoB128x64();
const prisonBSleeves64 = buildPrisonSleevesB64x64();
const prisonBPants64 = buildPrisonPantsB64x64();

const HEAD_HASH = 0x7806eefa;
const HAND_PAL_ID = 0x8bfd3c0c;
const modelSpecs = [
  {
    name: 'campb2.psx', headMeshHash: HEAD_HASH,
    texMap: {
      0xf41a667c: suitATorso128,
      0x95269976: suitAPants64,
      0xa2b40ddb: suitASleeves64,
      0x59e2e72c: headRgba64,
    }
  },
  {
    name: 'campb2_L.psx', headMeshHash: HEAD_HASH,
    texMap: {
      0xf41a667c: suitATorso128,
      0x95269976: suitAPants64,
      0xa2b40ddb: suitASleeves64,
      0x59e2e72c: headRgba64,
    }
  },
  {
    name: 'campb2b.psx', headMeshHash: HEAD_HASH,
    texMap: {
      0x7eca42fc: prisonBTorso128,
      0x792c8a53: prisonBPants64,
      0x10bcae0e: prisonBSleeves64,
      0xc9d4330e: headRgba64,
    }
  },
  {
    name: 'campb2bL.psx', headMeshHash: HEAD_HASH,
    texMap: {
      0x7eca42fc: prisonBTorso128,
      0x792c8a53: prisonBPants64,
      0x10bcae0e: prisonBSleeves64,
      0xc9d4330e: headRgba64,
    }
  },
];

const modifiedModels = new Map();
const prevA = {}, prevB = {};
let headSculpt = null;

console.log('\n=== 2. Aplicando texturas PS1 (BGR555), maos claras e esculpindo cabeca 3D nos 4 .PSX ===');
for (const spec of modelSpecs) {
  const psxBuf = getOrigWadSlice(spec.name);
  const info = parsePsxStructure(psxBuf);
  const headMeshIdx = info.meshHashes.indexOf(spec.headMeshHash);
  if (headMeshIdx < 0) throw new Error(`HEAD hash 0x${spec.headMeshHash.toString(16)} nao encontrado em ${spec.name}!`);
  let replacedTex = 0;
  for (const t of info.textures) {
    if (t.palId === HAND_PAL_ID) {
      const fairHands = buildFairHands64x16(psxBuf, t);
      const qRgba = writeTextureIntoPsx(psxBuf, t, fairHands, true);
      replacedTex++;
      if (spec.name === 'campb2.psx') prevA.hands = qRgba;
    } else if (spec.texMap[t.palId]) {
      const qRgba = writeTextureIntoPsx(psxBuf, t, spec.texMap[t.palId], false);
      replacedTex++;
      if (spec.name === 'campb2.psx') prevA[t.palId] = qRgba;
      if (spec.name === 'campb2b.psx') prevB[t.palId] = qRgba;
    }
  }
  const sculpt = sculptHeadGeometryToBolsonaro(psxBuf, info, headMeshIdx);
  if (spec.name === 'campb2.psx') headSculpt = sculpt;
  modifiedModels.set(spec.name, psxBuf);
  console.log(`  [OK] ${spec.name.padEnd(13)} | ${psxBuf.length} B (tamanho exato!) | ${replacedTex} texturas BGR555 + HEAD Mesh[${headMeshIdx}] (${sculpt.newVerts.length} verts, bone removido + rosto esculpido!)`);
}

fs.mkdirSync(previewDir, { recursive: true });
writePng(path.join(previewDir, 'preview_s2face3.png'), 62, 47, portrait.previewRgba);
writePng(path.join(previewDir, 'preview_head_64x64.png'), 64, 64, prevA[0x59e2e72c]);
writePng(path.join(previewDir, 'preview_hands_64x16.png'), 64, 16, prevA.hands);
writePng(path.join(previewDir, 'preview_styleA_torso_128x64.png'), 128, 64, prevA[0xf41a667c]);
writePng(path.join(previewDir, 'preview_styleA_pants_64x64.png'), 64, 64, prevA[0x95269976]);
writePng(path.join(previewDir, 'preview_styleA_sleeves_64x64.png'), 64, 64, prevA[0xa2b40ddb]);
writePng(path.join(previewDir, 'preview_styleB_torso_128x64.png'), 128, 64, prevB[0x7eca42fc]);
writePng(path.join(previewDir, 'preview_styleB_sleeves_64x64.png'), 64, 64, prevB[0x10bcae0e]);
writePng(path.join(previewDir, 'preview_styleB_pants_64x64.png'), 64, 64, prevB[0x792c8a53]);
renderHeadComparisonPng(headSculpt, path.join(previewDir, 'preview_head_3d_before_after.png'));
console.log(`\nPreviews visuais salvos em: ${previewDir}`);

if (previewOnly) {
  console.log('Modo --preview ativo: nenhum arquivo do jogo foi alterado ainda.');
  process.exit(0);
}

console.log('\n=== 3. Renomeando Kareem Campbell -> Bolsonaro em SLUS_010.66 ===');
const slusPath = path.join(rootDir, 'SLUS_010.66');
const slus = fs.readFileSync(slusPath);
const patchString = (fileOff, maxSlotLen, newStr) => {
  const curEnd = slus.indexOf(0, fileOff);
  const curStr = slus.subarray(fileOff, curEnd).toString('latin1');
  if (newStr.length > maxSlotLen) throw new Error(`String "${newStr}" maior que slot ${maxSlotLen}`);
  slus.fill(0, fileOff, fileOff + maxSlotLen + 1);
  Buffer.from(newStr, 'ascii').copy(slus, fileOff);
  console.log(`  [SLUS +0x${fileOff.toString(16)}] "${curStr}" -> "${newStr}"`);
};
patchString(0x0C4714, 15, 'Bolsonaro'); // g_SkaterTable[3].full_name @ 0x800D3F14
patchString(0x0C4724,  7, 'Bolso');     // g_SkaterTable[3].short_name @ 0x800D3F24
patchString(0x0C86A8, 15, 'Bolsonaro'); // g_MovieTable[20].label @ 0x800D7EA8
fs.writeFileSync(slusPath, slus);

console.log('\n=== 4. Aplicando s2face3.bmp (WAD + options.pre) e os 4 modelos .PSX em CD.WAD ===');
const curHed = fs.readFileSync(path.join(rootDir, 'CD.HED'));
const curWad = fs.readFileSync(path.join(rootDir, 'CD.WAD'));

function patchWadEntrySameSize(name, newBuf) {
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
  throw new Error(`Entrada nao encontrada em CD.HED: ${name}`);
}

patchWadEntrySameSize('s2face3.bmp', portrait.outBmp);

// Patch s2face3.bmp inside options.pre in-place (preserving Lulao's s2face2.bmp inside current CD.WAD!)
const optHash = nsHash('options.pre');
let optOff = -1, optSize = 0;
for (let i = 0; i < (curHed.length - 4) / 12; i++) {
  if (curHed.readUInt32LE(i * 12) === optHash) {
    optOff = curHed.readUInt32LE(i * 12 + 4);
    optSize = curHed.readUInt32LE(i * 12 + 8);
    break;
  }
}
const optEntry = curWad.subarray(optOff, optOff + optSize);
const origFace3Offset = 0x266CC; // Verified exact offset of s2face3.bmp inside options.pre
if (optEntry[origFace3Offset] !== 0x42 || optEntry[origFace3Offset + 1] !== 0x4D) {
  throw new Error(`Assinatura BM nao encontrada em options.pre +0x${origFace3Offset.toString(16)}!`);
}
portrait.outBmp.copy(optEntry, origFace3Offset);
console.log(`  [CD.WAD options.pre +0x${origFace3Offset.toString(16)}] s2face3.bmp (${portrait.outBmp.length} B) atualizado dentro de options.pre!`);

for (const [name, buf] of modifiedModels.entries()) {
  patchWadEntrySameSize(name, buf);
}

fs.writeFileSync(path.join(rootDir, 'CD.WAD'), curWad);
console.log('\n=== TODAS AS MODIFICACOES DO BOLSONARO APLICADAS COM 100% DE PRECISAO! ===');
