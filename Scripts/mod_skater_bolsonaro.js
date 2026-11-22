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
const portraitImgPath = path.join(rootDir, 'fotos_para_modificar_nos_skatistas', 'bolsonaro.png');
const faceImgPath = path.join(rootDir, 'fotos_para_modificar_nos_skatistas', 'bolsonaro_rosto.png');
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
// LOAD HIGH-RES SOURCES (bolsonaro.png for Menu Portrait + bolsonaro_rosto.png for 3D Head!)
// ============================================================================
function readPngDims(pngPath) {
  const hdr = Buffer.alloc(24);
  const fd = fs.openSync(pngPath, 'r');
  fs.readSync(fd, hdr, 0, 24, 0);
  fs.closeSync(fd);
  if (hdr.readUInt32BE(0) !== 0x89504E47) throw new Error(`Nao e PNG valido: ${pngPath}`);
  return { w: hdr.readUInt32BE(16), h: hdr.readUInt32BE(20) };
}

const portraitDims = readPngDims(portraitImgPath);
const portraitSrcW = portraitDims.w, portraitSrcH = portraitDims.h;
const faceDims = readPngDims(faceImgPath);
const faceSrcW = faceDims.w, faceSrcH = faceDims.h;
const suitASrcW = 114, suitASrcH = 174;
const suitBSrcW = 180, suitBSrcH = 397;
const faceSrcRaw = loadRgba(faceImgPath, faceSrcW, faceSrcH);
const suitASrc = loadRgba(suitAImgPath, suitASrcW, suitASrcH);
const suitBSrc = loadRgba(suitBImgPath, suitBSrcW, suitBSrcH);

// Gentle clarity lift for PS1 BGR555 display while preserving bolsonaro_rosto.png's natural daylight color!
function normalizeFaceColor(r, g, b) {
  return [
    clamp(Math.round(r * 1.04 + 4), 8, 250),
    clamp(Math.round(g * 1.04 + 4), 8, 250),
    clamp(Math.round(b * 1.03 + 3), 8, 250),
  ];
}

const faceSrc = Buffer.alloc(faceSrcRaw.length);
for (let i = 0; i < faceSrcW * faceSrcH; i++) {
  const [nr, ng, nb] = normalizeFaceColor(faceSrcRaw[i * 4], faceSrcRaw[i * 4 + 1], faceSrcRaw[i * 4 + 2]);
  faceSrc[i * 4] = nr; faceSrc[i * 4 + 1] = ng; faceSrc[i * 4 + 2] = nb; faceSrc[i * 4 + 3] = 255;
}

// Sample calibrated fair skin, neck skin & dark-brown/graying short-hair tones from bolsonaro_rosto.png (499x502)
function sampleSkinAndHair() {
  // Forehead & cheek skin (x=180..320, y=95..140 & x=180..260, y=215..275)
  let sr = 0, sg = 0, sb = 0, sc = 0;
  for (let y = 95; y <= 140; y += 3) {
    for (let x = 185; x <= 325; x += 3) {
      const c = sampleBilinear(faceSrc, faceSrcW, faceSrcH, x, y);
      if (c[0] > 140 && c[0] > c[2] + 18) { sr += c[0]; sg += c[1]; sb += c[2]; sc++; }
    }
  }
  for (let y = 215; y <= 275; y += 3) {
    for (let x = 175; x <= 265; x += 3) {
      const c = sampleBilinear(faceSrc, faceSrcW, faceSrcH, x, y);
      if (c[0] > 140 && c[0] > c[2] + 18) { sr += c[0]; sg += c[1]; sb += c[2]; sc++; }
    }
  }
  // Natural neck skin patch (x=185..325, y=368..398 — strictly above white collar!)
  let nr = 0, ng = 0, nb = 0, nc = 0;
  for (let y = 368; y <= 398; y += 2) {
    for (let x = 185; x <= 325; x += 3) {
      const c = sampleBilinear(faceSrc, faceSrcW, faceSrcH, x, y);
      if (c[0] > 120 && c[0] > c[2] + 15) { nr += c[0]; ng += c[1]; nb += c[2]; nc++; }
    }
  }
  // Short dark-brown combed hair crown (x=170..330, y=18..52)
  let hr = 0, hg = 0, hb = 0, hc = 0;
  for (let y = 18; y <= 52; y += 2) {
    for (let x = 170; x <= 330; x += 3) {
      const c = sampleBilinear(faceSrc, faceSrcW, faceSrcH, x, y);
      if (c[0] + c[1] + c[2] < 270) { hr += c[0]; hg += c[1]; hb += c[2]; hc++; }
    }
  }
  const skin = sc ? [Math.round(sr / sc), Math.round(sg / sc), Math.round(sb / sc)] : [210, 158, 144];
  const neck = nc ? [Math.round(nr / nc), Math.round(ng / nc), Math.round(nb / nc)] : [196, 144, 132];
  return {
    skin,
    neck,
    hair: hc ? [clamp(Math.round(hr / hc), 36, 90), clamp(Math.round(hg / hc), 30, 80), clamp(Math.round(hb / hc), 26, 74)] : [62, 50, 44],
  };
}
const bolsoTones = sampleSkinAndHair();

// ============================================================================
// 1. PORTRAIT BMP (s2face3.bmp — EXACT 4,088 B, MAGENTA INDEX 39, LAUGHING bolsonaro.png!)
// ============================================================================
function buildPortraitBmp(origBmpBuf) {
  const w = 62, h = 47, rowStride = 64, offBits = 1078;
  const MAGENTA_IDX = 39; // Verified exact transparency index in original s2face3.bmp!
  const isInner = (x, y) => x >= 7 && x <= 52 && y >= 4 && y <= 39;

  const innerW = 46, innerH = 36;
  // Expressive tight crop around laughing Bolsonaro head & face in bolsonaro.png (315x397)
  const cw = Math.min(portraitSrcW, Math.round(portraitSrcW * 0.75));
  const ch = Math.min(portraitSrcH - 14, Math.round(cw * 1.11));
  const cropArgs = [
    '-v', 'error', '-i', portraitImgPath,
    '-vf', `crop=${cw}:${ch}:0:14,eq=brightness=0.07:contrast=1.12:saturation=1.06,scale=${innerW}:${innerH}:flags=lanczos`,
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
// 2. BOLSONARO 64x64 3D HEAD TEXTURE — bolsonaro_rosto.png (499x502) PIECEWISE
//    SUB-PIXEL LANDMARK MAP ONTO VERIFIED KAREEM HEAD Mesh[15] UV + 360° SHORT HAIR!
//    Exact verified Mesh[15] UV landmarks (kareem_orig_head_uv_overlay.png):
//      - Crown hair:       v = 0..16
//      - Forehead:         v = 16..24, u = 20..43
//      - Eyebrows:         v = 24..26
//      - EXACT Pupils:     v = 28, u = 25.5 (left) & u = 37.5 (right)
//      - EXACT Nose tip:   v = 33.5, u = 31.5
//      - EXACT Mouth:      v = 43, u = 25..38
//      - EXACT Chin base:  v = 51..52, u = 27..35
//      - Cheeks & Ears:    u = 11..52, v = 24..50
//      - Short Hair Nape:  v = 34..37 (sides/back) -> 360° Seamless Fair Neck v = 38..63!
// ============================================================================
function buildBolsonaroHead64() {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);

  // Authentic short combed dark-brown hair with silvering temples sampled STRICTLY inside solid hair of bolsonaro_rosto.png!
  const hairPixel = (x, y) => {
    const u = ((x * 4 + y * 2) % 104);
    const v = 24 + ((y * 2 + Math.floor(Math.sin(x * 0.42) * 3)) % 22);
    const s = sampleBilinear(faceSrc, faceSrcW, faceSrcH, 176 + u, clamp(v, 22, 46));
    const strand = 0.90 + 0.14 * Math.sin(x * 0.68 + y * 0.24);
    const crownShade = 0.88 + 0.16 * (1 - clamp(y / 38, 0, 1));
    // Natural silver-gray temple/side highlights matching bolsonaro_rosto.png!
    const isSide = (x < 18 || x > 46) && y >= 18 && y <= 36;
    const silver = isSide && ((x * 5 + y * 11) % 7 === 0) ? 1.35 : ((y >= 20 && y <= 36 && ((x * 7 + y * 13) % 11 === 0)) ? 1.20 : 1.0);
    return [
      clamp(Math.round(lerp(bolsoTones.hair[0], s[0], 0.45) * strand * crownShade * silver), 26, 165),
      clamp(Math.round(lerp(bolsoTones.hair[1], s[1], 0.45) * strand * crownShade * silver), 22, 158),
      clamp(Math.round(lerp(bolsoTones.hair[2], s[2], 0.45) * strand * crownShade * silver), 20, 152),
    ];
  };

  // Seamless 360° fair neck skin (smooth cosine cylindrical shading, zero step seam at u=0/63!)
  const neckSkinPixel = (x, y) => {
    const ang = ((x - 31.5) / 32) * Math.PI;
    const cylShade = 0.94 + 0.05 * Math.cos(ang);
    const napeShadow = (y >= 35 && y <= 41 && Math.abs(x - 31.5) > 13) ? lerp(0.84, 1.0, (y - 35) / 6) : 1.0;
    const collarShadow = y >= 58 ? lerp(1.0, 0.88, (y - 58) / 5) : 1.0;
    const mul = cylShade * napeShadow * collarShadow;
    return [
      clamp(Math.round(bolsoTones.neck[0] * mul), 24, 245),
      clamp(Math.round(bolsoTones.neck[1] * mul), 20, 230),
      clamp(Math.round(bolsoTones.neck[2] * mul), 16, 218),
    ];
  };

  // Pre-leveling rotation: +4.5° around eye midpoint (287, 182) levels eyes horizontally!
  const rotRad = (4.5 * Math.PI) / 180;
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
  const pivX = 287, pivY = 182;
  const sampleLeveled = (rx, ry) => {
    const dx = rx - pivX, dy = ry - pivY;
    const sx = pivX + dx * cosR + dy * sinR;
    const sy = pivY - dx * sinR + dy * cosR;
    return sampleBilinear(faceSrc, faceSrcW, faceSrcH, sx, sy);
  };

  // Piecewise vertical landmark map (dst_y -> leveled src_y in 499x502 bolsonaro_rosto.png)
  const mapY = y => {
    if (y <= 16) return lerp(20, 66, clamp((y - 6) / 10, 0, 1));
    if (y <= 22) return lerp(66, 118, (y - 16) / 6);
    if (y <= 28) return lerp(118, 182, (y - 22) / 6);
    if (y <= 34) return lerp(182, 246, (y - 28) / 6);
    if (y <= 43) return lerp(246, 300, (y - 34) / 9);
    if (y <= 51) return lerp(300, 360, (y - 43) / 8);
    return lerp(360, 396, clamp((y - 51) / 6, 0, 1));
  };

  // Piecewise horizontal landmark map (dst_x -> leveled src_x; symmetrizes ~10° turn!)
  const mapX = x => {
    if (x <= 12) return 108 - (12 - x) * 6.0;
    if (x <= 16) return lerp(108, 142, (x - 12) / 4);
    if (x <= 25.5) return lerp(142, 232, (x - 16) / 9.5);
    if (x <= 31.5) return lerp(232, 298, (x - 25.5) / 6.0);
    if (x <= 37.5) return lerp(298, 342, (x - 31.5) / 6.0);
    if (x <= 46.5) return lerp(342, 384, (x - 37.5) / 9.0);
    return 384 + (x - 46.5) * 6.0;
  };

  // Guard against white/gray studio horizontal-blinds background (neutral low-chroma bright/mid-gray!)
  const isStudioBg = c => {
    const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    return (mn > 130 && (mx - mn) < 24 && (c[0] - c[2]) < 20) || (mn > 168 && (mx - mn) < 32);
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let col;
      const dxC = x - 31.5;
      const hr = hairPixel(x, y);
      const nk = neckSkinPixel(x, y);

      if (y < 14) {
        // Pure short top/crown hair with natural left side-part around x=20
        col = hr;
        if (Math.abs(x - 20.5) <= 1.0 && y >= 4) col = col.map(c => Math.round(c * 0.78));
      } else if (x >= 11 && x <= 52 && y >= 14 && y <= 57) {
        const ry = mapY(y);
        let rx = mapX(x);
        let fc;

        // Right ear / right temple / lower right jaw: follow Bolsonaro's curved jaw edge (xStart tapers from 43.5 at cheek to 38.5 at lower jaw!)
        // so ZERO white studio blinds or anti-aliased edge pixels appear, and BOTH ears & jawlines are 100% symmetrical!
        const mirStart = (y >= 40) ? lerp(43.5, 38.2, clamp((y - 40) / 12, 0, 1)) : 43.5;
        if (x > mirStart) {
          const mirrorX = 63 - x; // symmetric mirror around x=31.5
          const rxMir = mapX(mirrorX);
          const fcDirect = sampleLeveled(rx, ry);
          const fcMir = sampleLeveled(rxMir, ry);
          const mirT = clamp((x - mirStart) / 2.2, 0, 1);
          const useMir = isStudioBg(fcDirect) ? 1.0 : mirT;
          fc = [
            Math.round(lerp(fcDirect[0], fcMir[0] * 0.96, useMir)),
            Math.round(lerp(fcDirect[1], fcMir[1] * 0.96, useMir)),
            Math.round(lerp(fcDirect[2], fcMir[2] * 0.96, useMir)),
          ];
        } else {
          fc = sampleLeveled(rx, ry);
        }

        // Clean background guard (removes any studio blinds at outer edges around ears/hairline)
        const sideHairAmt = clamp((36.5 - y) / 3.5, 0, 1);
        const sideBg = [
          Math.round(lerp(nk[0], hr[0], sideHairAmt)),
          Math.round(lerp(nk[1], hr[1], sideHairAmt)),
          Math.round(lerp(nk[2], hr[2], sideHairAmt)),
        ];

        let faceCol = [fc[0], fc[1], fc[2]];
        if ((Math.abs(dxC) > 13.0 || (y >= 38 && Math.abs(dxC) > 6.5)) && isStudioBg(faceCol)) {
          faceCol = sideBg;
        }
        // Remove small stray nape-hair speck right below earlobes (y >= 40, outer jaw/ear edge)
        if (y >= 40 && Math.abs(dxC) >= 13.0 && (faceCol[0] + faceCol[1] + faceCol[2] < 245)) {
          faceCol = nk;
        }

        // Upper forehead hairline curve (natural side-part sweep)
        const hairlineY = 16.0 + (dxC > 2 ? 1.0 * clamp((dxC - 2) / 14, 0, 1) : 0) + Math.pow(dxC / 18.0, 2) * 2.2;
        const hairBlend = y < hairlineY ? clamp((hairlineY - y) / 2.6, 0, 1) : 0;

        // Cleanly exclude white dress shirt collar & black suit jacket under chin (y >= 49)
        if (y >= 49) {
          const mx = Math.max(faceCol[0], faceCol[1], faceCol[2]), mn = Math.min(faceCol[0], faceCol[1], faceCol[2]);
          const isCollarOrSuit = (mn > 175 && (mx - mn) < 28) || (faceCol[0] + faceCol[1] + faceCol[2] < 145) || (faceCol[2] > faceCol[0] + 6);
          const neckT = clamp((y - 51.5) / 4.5, 0, 1);
          const amt = isCollarOrSuit ? Math.max(neckT, 0.96) : neckT;
          faceCol = [
            Math.round(lerp(faceCol[0], nk[0], amt)),
            Math.round(lerp(faceCol[1], nk[1], amt)),
            Math.round(lerp(faceCol[2], nk[2], amt)),
          ];
        }

        // Smooth feather at outer ear/neck boundary (|dxC| -> 19..21.5) so cheeks wrap smoothly around head!
        const sideHalf = (y > 40) ? lerp(19.5, 13.5, clamp((y - 40) / 14, 0, 1)) : 19.5;
        const outerT = clamp((Math.abs(dxC) - (sideHalf - 2.4)) / 3.0, 0, 1);

        const afterForehead = [
          Math.round(lerp(faceCol[0], hr[0], hairBlend)),
          Math.round(lerp(faceCol[1], hr[1], hairBlend)),
          Math.round(lerp(faceCol[2], hr[2], hairBlend)),
        ];
        col = [
          Math.round(lerp(afterForehead[0], sideBg[0], outerT)),
          Math.round(lerp(afterForehead[1], sideBg[1], outerT)),
          Math.round(lerp(afterForehead[2], sideBg[2], outerT)),
        ];
      } else {
        // SIDES & BACK OF HEAD/NECK:
        // Short men's haircut ends naturally at y = 34..37 -> 100% SEAMLESS FAIR SKIN NECK y = 38..63!
        const napeLineY = 34.5 + 1.2 * Math.cos(((x < 32 ? x : 64 - x) / 14) * Math.PI * 0.5);
        if (y <= napeLineY - 1.5) {
          col = hr;
        } else if (y < napeLineY + 2.5) {
          const t = clamp((y - (napeLineY - 1.5)) / 4.0, 0, 1);
          col = [
            Math.round(lerp(hr[0], nk[0], t)),
            Math.round(lerp(hr[1], nk[1], t)),
            Math.round(lerp(hr[2], nk[2], t)),
          ];
        } else {
          col = nk;
        }
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
 * Surgically re-symmetrizes and sculpts Kareem's crooked-cap 3D HEAD (Mesh[15], hash 0x7806eefa)
 * into a 100% balanced, anatomically clean human head for Bolsonaro (bolsonaro_rosto.png):
 *  - Strictly locks ALL w != 0 neck-seam stitch vertices!
 *  - Eliminates the ~25° sideways skull twist inherited from Kareem's cocked baseball cap (symmetric around cx=+5)
 *  - Eliminates the entire backwards baseball cap visor shell (zero-area degenerate collapse -> 100% invisible)
 *  - Eliminates the overhanging occipital shelf above the nape (smooth rounded occiput -> fair neck)
 *  - Keeps natural human nose tip (-306 vs extreme -321/-331), level eye sockets, flat closed-mouth & firm square chin
 *  - Recomputes exact hdrBbox & safe bounding sphere rad across ALL 4 models (High-LOD 70v & Low-LOD 39v)!
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

  const faces = [];
  let fp = fOff;
  for (let fi = 0; fi < nFaces && fp + 4 <= mEnd; fi++) {
    const fl = buf.readUInt16LE(fp), fLen = buf.readUInt16LE(fp + 2);
    if (fLen < 12 || fp + fLen > mEnd) break;
    const rv = [buf[fp + 4], buf[fp + 5], buf[fp + 6], buf[fp + 7]];
    const gpu = buf[fp + 11], quad = (gpu & 8) !== 0;
    const textured = (fl & 1) !== 0 || (gpu & 4) !== 0;
    let uvs = [];
    if (textured && fLen >= 28) {
      uvs = [[buf[fp+20],buf[fp+21]],[buf[fp+22],buf[fp+23]],[buf[fp+24],buf[fp+25]]];
      if (quad) uvs.push([buf[fp+26],buf[fp+27]]);
    }
    faces.push({ rawVerts: rv, quad, textured, uvs });
    fp += fLen;
  }

  const isHighLod = (nVerts === 70);
  const isLowLod  = (nVerts === 39);
  const innerSkullPt = { x: 5, y: -150, z: 20 };

  // Exact symmetric anatomical targets around centerline cx = +5 (High-LOD 70v & Low-LOD 39v)
  const highTargets = {
    // Centerline crown, forehead, nose & occiput (x = +5)
    42: [  5, -330,   10], // crown top-back (smoothed from tall cap -359)
    41: [  5, -318, -162], // crown top-front
    12: [  5, -258, -238], // top forehead
    10: [  5, -189, -262], // mid forehead
    49: [  5, -151, -256], // between eyebrows
    17: [  5,  -90, -306], // natural nose tip (retracted from spiky -321/-331)
    11: [  5, -220,  110], // upper occipital center
     7: [  5, -102,   94], // lower occipital center (smooth rounded curve into nape!)
     0: [  5,  -48,   74], // clean nape transition into neck

    // Symmetric Front Face pairs around cx = +5
    15: [ -98, -304, -148], 40: [ 108, -304, -148], // upper front temples
    14: [-105, -238, -208], 28: [ 115, -238, -208], // upper forehead sides
     9: [ -86, -196, -236], 26: [  96, -196, -236], // mid forehead sides
     5: [-119, -179, -171], 23: [ 129, -179, -171], // outer temples
    50: [ -75, -145, -240], 51: [  85, -145, -240], // eyebrows
    58: [ -91, -118, -225], 57: [ 101, -118, -225], // outer eye sockets (strictly level!)
    47: [ -26, -116, -256], 48: [  36, -116, -256], // inner eye / nose bridge
    36: [-112,  -80, -212], 37: [ 122,  -80, -212], // cheekbones
     6: [ -38,  -79, -268], 24: [  48,  -79, -268], // nose wings (no pinched crease!)
    45: [  -9,  -59, -288], 52: [  19,  -59, -288], // nostril base
    35: [ -76,  -15, -244], 34: [  86,  -15, -244], // mid cheeks
    46: [ -19,    3, -286], 53: [  29,    3, -286], // upper lip / closed mouth
    59: [ -24,   34, -276], 60: [  34,   34, -276], // lower lip / chin top (no droop!)
    31: [-118,   -1,  -67], 32: [ 128,   -1,  -67], // jaw corners
     1: [-109,   27,  -10], 21: [ 119,   27,  -10], // lower jaw under ears
     3: [ -41,   86, -252],  4: [  51,   86, -252], // firm symmetric chin front
     2: [ -46,   89, -155], 22: [  56,   89, -155], // under chin

    // Symmetric Side & Back Cranium pairs (eliminating 25° crooked cap twist & mushroom overhang!)
     8: [-144, -128,  -32], 25: [ 154, -128,  -32], // mid-sides (ears)
    13: [-142, -238,  -42], 27: [ 152, -238,  -42], // upper sides
    33: [-102, -306,   -4], 16: [ 112, -306,   -4], // upper-back crown
    43: [-106, -214,   78], 44: [ 116, -214,   78], // upper occiput
    39: [ -95,  -92,   64], 38: [ 105,  -92,   64], // lower occiput behind ears (zero shelf!)
  };

  const lowTargets = {
    27: [  5, -330,   10], // crown top-back
    11: [  5, -318, -205], // crown top-front
     9: [  5, -151, -256], // between eyebrows
    14: [  5,  -90, -306], // nose tip
    10: [  5, -220,  110], // upper occipital center
     7: [  5, -102,   94], // lower occipital center
     0: [  5,  -48,   74], // nape center
     2: [  5,   89, -155], // under chin center

     8: [ -98, -304, -175], 21: [ 108, -304, -175], // upper front temples
     6: [ -38,  -56, -286], 20: [  48,  -56, -286], // nose/cheek front
     3: [ -41,   86, -252],  4: [  51,   86, -252], // chin front
     1: [-113,   13,  -39], 18: [ 123,   13,  -39], // jaw under ears

     5: [-144, -128,  -32], 19: [ 154, -128,  -32], // mid-sides (ears)
    12: [-142, -238,  -42], 22: [ 152, -238,  -42], // upper sides
    24: [-102, -306,   -4], 13: [ 112, -306,   -4], // upper-back crown
    28: [-106, -214,   78], 29: [ 116, -214,   78], // upper occiput
    26: [ -95,  -92,   64], 25: [ 105,  -92,   64], // lower occiput
  };

  const targets = isHighLod ? highTargets : (isLowLod ? lowTargets : {});

  const newVerts = origVerts.map(v => {
    if (v.w !== 0) return { ...v }; // STRICT INVARIANT: NEVER touch neck-seam stitch vertices!
    const t = targets[v.idx];
    if (t) {
      return {
        idx: v.idx,
        x: clamp(Math.round(t[0]), -32767, 32767),
        y: clamp(Math.round(t[1]), -32767, 32767),
        z: clamp(Math.round(t[2]), -32767, 32767),
        w: v.w,
      };
    }
    return { ...v };
  });

  // 2. COMPLETELY ELIMINATE BACKWARDS BASEBALL CAP VISOR SHELL (zero-area degenerate collapse -> 100% invisible!)
  const snapTo = (dstIdx, srcPt) => {
    if (dstIdx < newVerts.length && newVerts[dstIdx].w === 0) {
      newVerts[dstIdx].x = srcPt.x; newVerts[dstIdx].y = srcPt.y; newVerts[dstIdx].z = srcPt.z;
    }
  };
  if (isHighLod) {
    snapTo(54, newVerts[39]);
    snapTo(55, newVerts[7]);
    snapTo(56, newVerts[38]);
    for (const vi of [64, 65, 66, 67, 68, 69]) snapTo(vi, innerSkullPt);
  } else if (isLowLod) {
    snapTo(30, newVerts[7]);
    snapTo(31, newVerts[7]);
    for (const vi of [34, 35, 36, 37, 38]) snapTo(vi, innerSkullPt);
  }

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

// 5-Angle 3D Textured Software Rasterizer (Top = Original Kareem, Bottom = New Bolsonaro — Front, 3/4 L, 3/4 R, Side R, Back!)
function renderHeadTextured5ViewsPng(sculptResult, origHeadRgba, newHeadRgba, outPath) {
  const views = [
    { yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: -90 }, { yaw: 180 }
  ];
  const cellW = 160, cellH = 180, W = cellW * views.length, H = cellH * 2;
  const img = Buffer.alloc(W * H * 4, 24);
  for (let i = 0; i < W * H; i++) img[i * 4 + 3] = 255;

  // Approximate neck-base ring positions for w=2 stitch vertices (in head-local space) so Back view renders sealed neck!
  const neckApprox = {
    18: { x: -72, y: 128, z: -18 },
    19: { x: -32, y: 132, z: -96 },
    20: { x:  54, y: 112, z:  92 },
    29: { x:  82, y: 128, z: -18 },
    30: { x:  42, y: 132, z: -96 },
    61: { x: -44, y: 112, z:  92 },
    62: { x: -86, y: 118, z:  46 },
    63: { x:  96, y: 118, z:  46 },
  };

  const renderRow = (rowIdx, verts, texRgba) => {
    const yOff = rowIdx * cellH;
    const sc = 0.40, cyOff = 105;
    views.forEach((vw, vi) => {
      const ox = vi * cellW + cellW * 0.5, oy = yOff + cellH * 0.52;
      const zbuf = new Float32Array(cellW * cellH).fill(1e9);
      const yaw = vw.yaw * Math.PI / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);
      const proj = v => {
        const pt = (v.w === 2 && neckApprox[v.idx]) ? neckApprox[v.idx] : v;
        const rx = pt.x * cy + pt.z * sy;
        const rz = -pt.x * sy + pt.z * cy;
        return { sx: ox + rx * sc, sy: oy + (pt.y + cyOff) * sc, sz: rz };
      };
      const drawTri = (p0, p1, p2, uv0, uv1, uv2, shade) => {
        const minX = Math.max(vi * cellW, Math.floor(Math.min(p0.sx, p1.sx, p2.sx)));
        const maxX = Math.min((vi + 1) * cellW - 1, Math.ceil(Math.max(p0.sx, p1.sx, p2.sx)));
        const minY = Math.max(yOff, Math.floor(Math.min(p0.sy, p1.sy, p2.sy)));
        const maxY = Math.min(yOff + cellH - 1, Math.ceil(Math.max(p0.sy, p1.sy, p2.sy)));
        const area = (p1.sx - p0.sx) * (p2.sy - p0.sy) - (p2.sx - p0.sx) * (p1.sy - p0.sy);
        if (Math.abs(area) < 0.01) return;
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const w0 = ((p1.sx - x) * (p2.sy - y) - (p2.sx - x) * (p1.sy - y)) / area;
            const w1 = ((p2.sx - x) * (p0.sy - y) - (p0.sx - x) * (p2.sy - y)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
            const z = w0 * p0.sz + w1 * p1.sz + w2 * p2.sz;
            const zi = (y - yOff) * cellW + (x - vi * cellW);
            if (z < zbuf[zi]) {
              zbuf[zi] = z;
              const u = clamp(Math.round(w0 * uv0[0] + w1 * uv1[0] + w2 * uv2[0]) & 63, 0, 63);
              const vv = clamp(Math.round(w0 * uv0[1] + w1 * uv1[1] + w2 * uv2[1]), 0, 63);
              const to = (vv * 64 + u) * 4;
              const o = (y * W + x) * 4;
              img[o] = Math.min(255, Math.round(texRgba[to] * shade));
              img[o + 1] = Math.min(255, Math.round(texRgba[to + 1] * shade));
              img[o + 2] = Math.min(255, Math.round(texRgba[to + 2] * shade));
              img[o + 3] = 255;
            }
          }
        }
      };
      for (const f of sculptResult.faces) {
        if (!f.textured || f.uvs.length < 3) continue;
        const v0 = verts[f.rawVerts[0]], v1 = verts[f.rawVerts[1]], v2 = verts[f.rawVerts[2]];
        const v3 = f.quad ? verts[f.rawVerts[3]] : null;
        if (!v0 || !v1 || !v2) continue;
        const p0 = proj(v0), p1 = proj(v1), p2 = proj(v2), p3 = v3 ? proj(v3) : null;
        const e1x = p1.sx - p0.sx, e1y = p1.sy - p0.sy, e1z = p1.sz - p0.sz;
        const e2x = p2.sx - p0.sx, e2y = p2.sy - p0.sy, e2z = p2.sz - p0.sz;
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        const shade = 0.74 + 0.26 * Math.abs(nz / (Math.hypot(nx, ny, nz) || 1));
        if (f.quad && p3) {
          drawTri(p0, p1, p2, f.uvs[0], f.uvs[1], f.uvs[2], shade);
          drawTri(p1, p3, p2, f.uvs[1], f.uvs[3], f.uvs[2], shade);
        } else {
          drawTri(p0, p1, p2, f.uvs[0], f.uvs[1], f.uvs[2], shade);
        }
      }
    });
  };
  renderRow(0, sculptResult.origVerts, origHeadRgba);
  renderRow(1, sculptResult.newVerts, newHeadRgba);
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
let origHeadRgba = null;

console.log('\n=== 2. Aplicando texturas PS1 (BGR555), maos claras e esculpindo cabeca 3D nos 4 .PSX ===');
for (const spec of modelSpecs) {
  const psxBuf = getOrigWadSlice(spec.name);
  const info = parsePsxStructure(psxBuf);
  const headMeshIdx = info.meshHashes.indexOf(spec.headMeshHash);
  if (headMeshIdx < 0) throw new Error(`HEAD hash 0x${spec.headMeshHash.toString(16)} nao encontrado em ${spec.name}!`);
  let replacedTex = 0;
  for (const t of info.textures) {
    if (spec.name === 'campb2.psx' && t.palId === 0x59e2e72c) {
      origHeadRgba = Buffer.alloc(64 * 64 * 4);
      for (let p = 0; p < 64 * 64; p++) {
        const ci = psxBuf[t.dataOff + p];
        const v = psxBuf.readUInt16LE(t.palInfo.offset + ci * 2);
        origHeadRgba[p * 4] = ((v & 0x1F) * 255 / 31) | 0;
        origHeadRgba[p * 4 + 1] = (((v >> 5) & 0x1F) * 255 / 31) | 0;
        origHeadRgba[p * 4 + 2] = (((v >> 10) & 0x1F) * 255 / 31) | 0;
        origHeadRgba[p * 4 + 3] = 255;
      }
    }
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
  console.log(`  [OK] ${spec.name.padEnd(13)} | ${psxBuf.length} B (tamanho exato!) | ${replacedTex} texturas BGR555 + HEAD Mesh[${headMeshIdx}] (${sculpt.newVerts.length} verts, cranio simetrizado + bolsonaro_rosto.png!)`);
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
renderHeadTextured5ViewsPng(headSculpt, origHeadRgba, prevA[0x59e2e72c], path.join(previewDir, 'preview_head_3d_textured_5views.png'));
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
