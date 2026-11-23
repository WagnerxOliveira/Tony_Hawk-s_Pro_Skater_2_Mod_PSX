#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Surgical Skater Transformation Tool: Bob Burnquist (Slot 1) -> Silvio Santos
 *
 * Performs ALL 5 modifications cleanly and idempotently from originals_backup/:
 *  1. Renames Bob Burnquist -> "Silvio Santos" / "Sil" / "Brazil's Silvio Santos" / "Can't Stop SS"
 *     in SLUS_010.66 (100% inline, zero pointer patches, zero overflows).
 *  2. Replaces menu portrait s2face1.bmp (62x47 8-bit BMP, EXACT 4,088 B) in BOTH:
 *     - CD.WAD[369] standalone (s2face1.bmp)
 *     - options.pre (CD.WAD[45] @ +0x246BC)
 *     Preserving original metallic bezel and exact #FF00FF magenta transparency at magIdx = 21!
 *  3. Replaces 3D face/hair, suit/Hawaiian outfit & fair-skin hand textures + BGR555 CLUTs across ALL 4 models:
 *     - Style A (burnq2.psx WAD[387], burnq_l.psx WAD[1010]): textura_silvio_a.png (Tailored Navy 2-Button Suit,
 *       Crisp White Shirt, Navy Tie, White Pocket Square, Long Suit Sleeves + White Cuffs, Dark Dress Shoes)
 *     - Style B (burnq2b.psx WAD[431], burnq2bl.psx WAD[1012]): textura_silvio_b.png (Royal-Blue Floral Hawaiian
 *       Shirt with Yellow Hot-Air Balloon/Palms/Hibiscus, Bare Forearms + Black Watch [no elbow pads!],
 *       Blue/White/Black Plaid Bermuda Shorts + Bare Shins [no knee pads!], Casual Sneakers)
 *     - Face/Hair: silvio.png cleanly mapped (zero glasses, zero bucket hat/helmet straps, zero photo mic bleed).
 *  4. Sculpts TRUE 3D HEAD geometry (Mesh[15] across all 4 models):
 *     - Style A (0xF5CF6046, 64v Hi / 32v Lo): completely eliminates the wide-brimmed bucket hat and sculpts
 *       Silvio Santos' symmetric combed-back dark-brown pompadour hair + smiling facial contours (locking w=2!).
 *     - Style B (0x9504086E, 57v Hi / 30v Lo): completely eliminates the bulky skate helmet shell/visor and
 *       sculpts matching Silvio Santos pompadour hair + facial contours (locking w=2!).
 *  5. Builds a TRUE 3D GEOMETRIC CHEST MICROPHONE directly inside Mesh[8] (burnq_chest) of BOTH burnq2.psx
 *     and burnq_l.psx (+23 w=0 verts, +41 normals maintaining strict nN === nV + nF, +18 36-byte POLY_FT3/FT4
 *     textured faces = +1,160 B, fitting inside the EXISTING CD sectors: 61,404 <= 61,440 B & 53,092 <= 53,248 B!):
 *     - Faceted 3D metallic Shure ball grill with bright chrome equatorial band
 *     - Tapered 3D brushed-silver cylindrical shaft hugging the ~25° chest tie slope (zero side gap!)
 *     - Horizontal 3D chrome tie-clip bar gripping the tie
 *     - Dedicated 16x32 metallic microphone atlas in right half (U=16..31) of texIdx=6 (32x32 16c)
 *     - Updates ONLY CD.HED[387].size and CD.HED[1010].size — ZERO CD.WAD offset shift & ZERO LBA shift!
 */

const fs = require('fs');
const path = require('path');
const lib = require('./psx_skater_lib');

const {
  rootDir, backupDir, clamp, lerp, nsHash, probeDims, loadRgba, sampleBilinear, writePng,
  quantizeImageForPsx, quantize4BitForPsx, parsePsxStructure, writeTextureIntoPsx,
  buildFairHandsRgba, buildPortraitBmpFromInner46x36, recomputeMeshBounds,
  renderPs1SkaterPreview, getOrigWadSlice,
} = lib;

const faceImgPath = path.join(rootDir, 'fotos_para_modificar_nos_skatistas', 'silvio.png');
const suitAImgPath = path.join(rootDir, 'texturas_para_colocar_nos_skatistas', 'textura_silvio_a.png');
const suitBImgPath = path.join(rootDir, 'texturas_para_colocar_nos_skatistas', 'textura_silvio_b.png');
const previewDir = path.join(rootDir, 'build', '_silvio_preview');

const faceDims = probeDims(faceImgPath);
const suitADims = probeDims(suitAImgPath);
const suitBDims = probeDims(suitBImgPath);

const faceSrc = loadRgba(faceImgPath, faceDims.w, faceDims.h);
const suitASrc = loadRgba(suitAImgPath, suitADims.w, suitADims.h);
const suitBSrc = loadRgba(suitBImgPath, suitBDims.w, suitBDims.h);

// Silvio Santos natural warm skin & rich dark-brown combed-back hair palette (sampled from silvio.png)
const SILVIO_SKIN = [206, 150, 122];
const SILVIO_SKIN_SHADOW = [156, 106, 84];
const SILVIO_HAIR_BASE = [46, 30, 22];
const SILVIO_HAIR_HI = [78, 52, 38];
const SILVIO_HAIR_DARK = [24, 16, 12];

// Tailored navy suit palette (sampled from textura_silvio_a.png)
const SUIT_NAVY = [20, 25, 42];
const SUIT_NAVY_HI = [34, 42, 66];
const SUIT_NAVY_DARK = [11, 14, 24];
const TIE_NAVY = [24, 30, 50];
const SHIRT_WHITE = [232, 234, 238];

// ============================================================================
// 1. PORTRAIT s2face1.bmp (4,088 B, magIdx = 21, options.pre +0x246BC)
// ============================================================================
function buildSilvioPortraitInner46x36() {
  const W = 46, H = 36;
  const rgba = Buffer.alloc(W * H * 4);
  const fw = faceDims.w, fh = faceDims.h;

  // Precompute smooth studio-background matte on full-res silvio.png using edge-connected flood fill
  // from the top/left/right borders so ALL bright purple/lavender/white studio glow around Silvio's
  // head & shoulders is replaced cleanly with ZERO step lines or face bleed!
  const bgMask = new Float32Array(fw * fh);
  const visited = new Uint8Array(fw * fh);
  const isBgPixel = (x, y) => {
    const o = (y * fw + x) * 4;
    const r = faceSrc[o], g = faceSrc[o + 1], b = faceSrc[o + 2];
    // Protect Silvio's skin & warm hair (r clearly > b, warm tones) and dark navy suit (low lum at bottom)
    if (y > fh * 0.72 && r < 65 && g < 70 && b < 85) return false; // dark suit shoulders
    const isPurpleOrBlue = (b > g + 16 && b > 105);
    const isBrightStudioGlow = (r > 185 && g > 185 && b > 195 && (x < fw * 0.34 || x > fw * 0.72));
    const isOuterLavender = (y < fh * 0.78 && (x < fw * 0.24 || x > fw * 0.76) && b > 95 && b >= r * 0.78);
    return isPurpleOrBlue || isBrightStudioGlow || isOuterLavender;
  };
  const q = [];
  for (let x = 0; x < fw; x++) {
    if (isBgPixel(x, 0)) { visited[x] = 1; q.push(x); }
  }
  for (let y = 0; y < Math.floor(fh * 0.80); y++) {
    for (const x of [0, fw - 1]) {
      const idx = y * fw + x;
      if (!visited[idx] && isBgPixel(x, y)) { visited[idx] = 1; q.push(idx); }
    }
  }
  let head = 0;
  while (head < q.length) {
    const idx = q[head++];
    bgMask[idx] = 1.0;
    const x = idx % fw, y = (idx / fw) | 0;
    if (x > 0 && !visited[idx - 1] && isBgPixel(x - 1, y)) { visited[idx - 1] = 1; q.push(idx - 1); }
    if (x + 1 < fw && !visited[idx + 1] && isBgPixel(x + 1, y)) { visited[idx + 1] = 1; q.push(idx + 1); }
    if (y > 0 && !visited[idx - fw] && isBgPixel(x, y - 1)) { visited[idx - fw] = 1; q.push(idx - fw); }
    if (y + 1 < fh && !visited[idx + fw] && isBgPixel(x, y + 1)) { visited[idx + fw] = 1; q.push(idx + fw); }
  }
  // 2-pass soft feathering on mask border (radius ~3px) for smooth anti-aliased hair/shoulder edges
  const softMask = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      let s = 0, c = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const ny = clamp(y + dy, 0, fh - 1);
        for (let dx = -2; dx <= 2; dx++) {
          const nx = clamp(x + dx, 0, fw - 1);
          s += bgMask[ny * fw + nx]; c++;
        }
      }
      softMask[y * fw + x] = s / c;
    }
  }

  // Balanced close-up portrait framing (full pompadour, broad smile & suit collar)
  const x0 = fw * 0.10, x1 = fw * 0.86;
  const y0 = fh * 0.01, y1 = fh * 0.85;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const u = (x + (sx + 0.5) / 3) / W;
          const v = (y + (sy + 0.5) / 3) / H;
          const fx = lerp(x0, x1, u);
          const fy = lerp(y0, y1, v);
          let [r, g, b] = sampleBilinear(faceSrc, fw, fh, fx, fy);
          const m = softMask[clamp(Math.round(fy), 0, fh - 1) * fw + clamp(Math.round(fx), 0, fw - 1)];
          if (m > 0.01) {
            // Classy dark broadcast studio gradient (coherent with other THPS2 mural portraits!)
            const rad = Math.hypot(u - 0.5, v - 0.45);
            const bgR = Math.round(lerp(36, 16, clamp(rad * 1.4, 0, 1)));
            const bgG = Math.round(lerp(44, 20, clamp(rad * 1.4, 0, 1)));
            const bgB = Math.round(lerp(66, 34, clamp(rad * 1.4, 0, 1)));
            r = Math.round(lerp(r, bgR, m));
            g = Math.round(lerp(g, bgG, m));
            b = Math.round(lerp(b, bgB, m));
          }
          sr += r; sg += g; sb += b;
        }
      }
      let r = sr / 9, g = sg / 9, b = sb / 9;
      r = clamp(Math.round((r - 128) * 1.09 + 132), 10, 248);
      g = clamp(Math.round((g - 128) * 1.07 + 130), 10, 246);
      b = clamp(Math.round((b - 128) * 1.05 + 127), 10, 246);
      const d = (y * W + x) * 4;
      rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// ============================================================================
// 2. SILVIO SANTOS 3D FACE & HAIR TEXTURES (Style A & Style B)
// ============================================================================
function hairColorAt(x, y, shade = 1.0) {
  const strand = 0.86 + 0.14 * Math.sin(x * 1.25 + Math.sin(y * 0.25) * 1.4) + 0.08 * Math.cos(y * 0.55 - x * 0.35);
  const s = shade * strand;
  return [
    clamp(Math.round(SILVIO_HAIR_BASE[0] * s), 12, 115),
    clamp(Math.round(SILVIO_HAIR_BASE[1] * s), 10, 82),
    clamp(Math.round(SILVIO_HAIR_BASE[2] * s), 8, 64),
  ];
}

/**
 * Builds Silvio Santos 64x64 face/head texture calibrated to exact 3D mesh UV landmarks:
 *   Style A (burnq2 texIdx=5): hairline V=12, brow V=23, eyes V=27.5, nose V=37.5, mouth V=44.5, chin V=53.5
 *   Style B (burnq2b texIdx=6): hairline V=17, brow V=26, eyes V=31.5, nose V=39.0, mouth V=45.5, chin V=53.5
 * Strictly masks the photo face inside an anatomical oval so white shirt collar / dark jacket corners
 * NEVER bleed onto the lower jawline or cheeks!
 */
function buildSilvioFace64x64(isStyleB) {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  const fw = faceDims.w, fh = faceDims.h;

  const srcCx = fw * 0.468;
  const hairV = isStyleB ? 17.5 : 12.0;
  const eyeV  = isStyleB ? 31.0 : 27.5;
  const noseV = isStyleB ? 39.0 : 37.5;
  const chinV = 53.5;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - 31.5;
      const adx = Math.abs(dx);
      let r, g, b;

      // Smooth arched hairline curve (high clean forehead in center, neat temples/sideburns on sides!)
      const hairEdgeY = hairV + Math.pow(clamp(adx / 17.5, 0, 1.35), 2.1) * 9.5;
      const isTopHair = y < hairEdgeY - 1.5;
      const isSideHair = (adx > 19.5 && y < 32) || (adx > 24.0 && y < 37);

      if (isTopHair || isSideHair) {
        const crownHi = 1.0 + 0.24 * Math.exp(-Math.pow((y - 9) / 7, 2)) * Math.exp(-Math.pow(dx / 15, 2));
        const sideDark = lerp(1.0, 0.74, clamp((adx - 16) / 16, 0, 1));
        [r, g, b] = hairColorAt(x, y, crownHi * sideDark);
      } else {
        // Compute clean anatomical warm skin/ear/neck base first (used seamlessly outside oval face mask!)
        const isEar = (adx >= 19.0 && adx <= 24.5 && y >= 30 && y <= 41);
        const neckShade = y > 54
          ? lerp(0.86, 0.74, clamp((y - 54) / 10, 0, 1))
          : lerp(0.95, 0.80, clamp((adx - 13) / 17, 0, 1));
        let baseR, baseG, baseB;
        if (isEar) {
          const earDip = 0.86 + 0.14 * Math.sin(((y - 30) / 11) * Math.PI);
          baseR = Math.round(SILVIO_SKIN[0] * earDip);
          baseG = Math.round(SILVIO_SKIN[1] * earDip * 0.96);
          baseB = Math.round(SILVIO_SKIN[2] * earDip * 0.94);
        } else {
          baseR = Math.round(SILVIO_SKIN[0] * neckShade);
          baseG = Math.round(SILVIO_SKIN[1] * neckShade);
          baseB = Math.round(SILVIO_SKIN[2] * neckShade);
        }
        if (y < 39 && adx > 21) {
          const nt = clamp((39 - y) / 4.5, 0, 1);
          const [hr, hg, hb] = hairColorAt(x, y, 0.80);
          baseR = Math.round(lerp(baseR, hr, nt));
          baseG = Math.round(lerp(baseG, hg, nt));
          baseB = Math.round(lerp(baseB, hb, nt));
        }

        // Anatomical elliptical face mask tapering neatly along the jawline toward the chin!
        // Prevents ANY white shirt collar or dark jacket corner in silvio.png from touching the jaw!
        const jawT = clamp((y - eyeV) / Math.max(1, chinV - eyeV), 0, 1.2);
        const halfFaceW = lerp(16.5, 8.2, jawT * jawT); // 16.5 px at temples/cheeks -> 8.2 px at chin!
        const faceDist = Math.hypot(dx / halfFaceW, Math.max(0, (y - (chinV - 1.0)) / 2.2));
        const faceAlpha = (y <= chinV + 0.5) ? clamp((1.05 - faceDist) / 0.24, 0, 1) : 0;

        if (faceAlpha > 0.01) {
          // 3-segment piecewise vertical alignment (hairline -> eyes -> nose -> chin) for natural un-squished proportions!
          let srcY;
          if (y <= eyeV) {
            const t = clamp((y - hairV) / Math.max(1, eyeV - hairV), 0, 1);
            srcY = lerp(fh * 0.185, fh * 0.415, t);
          } else if (y <= noseV) {
            const t = clamp((y - eyeV) / Math.max(1, noseV - eyeV), 0, 1);
            srcY = lerp(fh * 0.415, fh * 0.530, t);
          } else {
            const t = clamp((y - noseV) / Math.max(1, chinV - noseV), 0, 1);
            srcY = lerp(fh * 0.530, fh * 0.742, t);
          }
          // Slightly wider horizontal span (0.295*fw across 16.5px) keeps Silvio's eyes & smile naturally proportioned!
          const srcX = srcCx + (dx / 16.5) * (fw * 0.295);
          const c = sampleBilinear(faceSrc, fw, fh, clamp(srcX, 24, fw - 24), clamp(srcY, 20, fh * 0.748));
          let pr = c[0], pg = c[1], pb = c[2];

          // Safety guard: suppress any stray white shirt collar, dark lapel, or purple studio pixel outside mouth/eyes!
          const inSmileBox = (adx < 8.5 && y >= noseV + 3 && y <= noseV + 11.5);
          const inEyeBox   = (adx >= 2.0 && adx <= 11.5 && y >= eyeV - 4.5 && y <= eyeV + 3.5);
          const isStrayCollar = !inSmileBox && !inEyeBox && (
            (pr > 175 && pg > 170 && pb > 165 && (pr - pb) < 22) || // white collar
            (pr < 90 && pg < 80 && y > noseV + 3) ||                // dark suit lapel
            (pb > pg + 14)                                          // purple studio glow
          );
          if (isStrayCollar) {
            pr = baseR; pg = baseG; pb = baseB;
          }

          // Clarity lift for eyes & iconic white teeth smile
          const contrast = inSmileBox ? 1.15 : (inEyeBox ? 1.14 : 1.07);
          pr = clamp(Math.round((pr - 128) * contrast + 132), 12, 248);
          pg = clamp(Math.round((pg - 128) * contrast + 129), 12, 246);
          pb = clamp(Math.round((pb - 128) * contrast + 125), 12, 244);

          r = lerp(baseR, pr, faceAlpha);
          g = lerp(baseG, pg, faceAlpha);
          b = lerp(baseB, pb, faceAlpha);

          // Soft feathered hairline transition (2.5 px)
          if (y < hairEdgeY + 2.0) {
            const ht = clamp((hairEdgeY + 2.0 - y) / 3.5, 0, 1);
            const [hr, hg, hb] = hairColorAt(x, y, 0.96);
            r = lerp(r, hr, ht); g = lerp(g, hg, ht); b = lerp(b, hb, ht);
          }
        } else {
          r = baseR; g = baseG; b = baseB;
        }
      }

      const d = (y * W + x) * 4;
      rgba[d] = clamp(Math.round(r), 10, 248);
      rgba[d + 1] = clamp(Math.round(g), 10, 246);
      rgba[d + 2] = clamp(Math.round(b), 10, 244);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

/**
 * Style A texIdx=6 (32x32, 16-color 4bpp) DUAL-ZONE ATLAS:
 *  - Left half  (U =  0..15, V =  0..31): Silvio Santos rich dark-brown combed-back hair crown (Mesh[15] t6)
 *  - Right half (U = 16..31, V =  0..31): DEDICATED HIGH-CONTRAST 3D METALLIC MICROPHONE ATLAS (Mesh[8] 3D Mic!):
 *      * V =  0..11: Woven metallic Shure ball-grill steel mesh (criss-cross silver/dark-steel pattern)
 *      * V = 12..15: Bright polished-chrome equatorial midline ring band (iconic horizontal Shure ring!)
 *      * V = 16..25: Brushed vertical cylindrical silver metallic shaft with specular sheen & dark neck collar
 *      * V = 26..31: Polished chrome horizontal tie-clip bar with metallic top bevel & dark bottom edge
 */
function buildStyleAHairAndMicAtlas32x32() {
  const W = 32, H = 32;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r, g, b;
      if (x < 16) {
        // Left half: Silvio Santos rich dark-brown combed-back hair (4-5 warm brown shades)
        const wave = 0.86 + 0.16 * Math.sin(x * 1.4 + y * 0.25) + 0.10 * Math.cos(y * 0.4);
        const hi = 1.0 + 0.18 * Math.exp(-Math.pow((x - 7.5) / 5.5, 2));
        [r, g, b] = hairColorAt(x * 2, y, wave * hi);
      } else {
        // Right half (lx = 0..15): High-contrast metallic Shure chest microphone textures!
        const lx = x - 16;
        if (y <= 11) {
          // Ball Grill Mesh: crisp woven silver/steel crosshatch (Shure SM58/lavalier mesh look!)
          const checker = ((lx + y) & 1) === 0;
          const dome = 0.82 + 0.24 * Math.sin(((lx + 0.5) / 16) * Math.PI);
          const base = checker ? 208 : 108;
          const v = clamp(Math.round(base * dome), 64, 244);
          r = v; g = v + 2; b = clamp(v + 6, 68, 250);
        } else if (y <= 15) {
          // Equatorial Chrome Band: crisp dark seam top/bottom + blazing brushed-chrome center!
          const isBorder = (y === 12 || y === 15);
          const spec = 0.80 + 0.28 * Math.sin(((lx + 0.5) / 16) * Math.PI);
          const base = isBorder ? 86 : 238;
          const v = clamp(Math.round(base * spec), 56, 250);
          r = v; g = v; b = clamp(v + 4, 60, 252);
        } else if (y <= 25) {
          // Tapered Brushed-Silver Cylindrical Shaft: vertical cylindrical specular highlight down center!
          const isCollar = (y === 16 || y === 17);
          const cyl = 0.62 + 0.42 * Math.pow(Math.sin(((lx + 0.5) / 16) * Math.PI), 0.75);
          const specPeak = 32 * Math.exp(-Math.pow((lx - 6.5) / 2.2, 2));
          const base = isCollar ? 132 : 196;
          const v = clamp(Math.round(base * cyl + specPeak), 72, 248);
          r = v; g = v + 1; b = clamp(v + 5, 76, 252);
        } else {
          // Horizontal Chrome Tie-Clip Bar (V=26..31)
          const rowBright = [152, 232, 248, 212, 138, 88][y - 26];
          const horizSpec = 0.86 + 0.18 * Math.cos(((lx - 7.5) / 8) * Math.PI * 0.7);
          const v = clamp(Math.round(rowBright * horizSpec), 64, 252);
          r = v; g = v + 1; b = clamp(v + 4, 68, 252);
        }
      }
      const d = (y * W + x) * 4;
      rgba[d] = clamp(r, 10, 252); rgba[d + 1] = clamp(g, 10, 252); rgba[d + 2] = clamp(b, 10, 252); rgba[d + 3] = 255;
    }
  }
  return rgba;
}

function buildStyleBHairCrown32x32() {
  const W = 32, H = 32;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wave = 0.86 + 0.16 * Math.sin(x * 1.1 + y * 0.25) + 0.08 * Math.cos(y * 0.45);
      const crownHi = 1.0 + 0.20 * Math.exp(-Math.pow((x - 15.5) / 9, 2)) * Math.exp(-Math.pow((y - 12) / 10, 2));
      const [r, g, b] = hairColorAt(x, y, wave * crownHi);
      const d = (y * W + x) * 4;
      rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// ============================================================================
// 3. STYLE A OUTFIT TEXTURES (textura_silvio_a.png — Tailored Dark Navy Suit!)
// ============================================================================
// NOTE: Front chest UVs in THPS2 PS1 run RIGHT-TO-LEFT on screen -> flipX = true!
// So wearer's LEFT chest (viewer's RIGHT on screen, white pocket square) lives at LOWER U (left side of x=32..63)!
function buildStyleASuitTorso128x64() {
  const W = 128, H = 64;
  const rgba = Buffer.alloc(W * H * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Base tailored dark-navy wool weave with cylindrical torso shading
      const sideDist = Math.min(Math.abs(x - 32), Math.abs(x - 96));
      let shade = 0.78 + 0.26 * clamp(sideDist / 24, 0, 1);
      const weave = 0.96 + 0.04 * Math.sin(x * 1.9 + y * 1.3);
      let r = Math.round(SUIT_NAVY[0] * shade * weave);
      let g = Math.round(SUIT_NAVY[1] * shade * weave);
      let b = Math.round(SUIT_NAVY[2] * shade * weave);

      // Front torso zone: x = 32..95 (center x = 63.5)
      if (x >= 32 && x <= 95) {
        // PS1 GTE mirror: dxScreen > 0 = viewer's RIGHT (wearer's LEFT chest -> white pocket square!)
        // Wait: verify from psx_skater_lib.js!
        // In psx_skater_lib.js: +X is viewer's LEFT, -X is viewer's RIGHT.
        // In burnq2.psx f[29]: v17(+206, viewer's LEFT) has U=79, v16(-205, viewer's RIGHT) has U=47!
        // Therefore U < 63.5 is VIEWER'S RIGHT (wearer's LEFT chest -> pocket square!), U > 63.5 is VIEWER'S LEFT!
        const dxScr = 63.5 - x; // + = viewer's right (wearer's left), - = viewer's left (wearer's right)
        const adx = Math.abs(dxScr);

        // 1. Tailored Suit Jacket V-Opening revealing crisp white dress shirt & dark navy tie!
        // Sharp tailored V closes cleanly at jacket top button (y=26), matching textura_silvio_a.png!
        if (y <= 26) {
          const vHalf = Math.max(0, 10.5 * (1 - y / 26.5));
          if (adx <= vHalf) {
            // Crisp white dress shirt with soft collar shading
            const sSh = 0.89 + 0.11 * (1 - adx / Math.max(1, vHalf));
            r = Math.round(SHIRT_WHITE[0] * sSh);
            g = Math.round(SHIRT_WHITE[1] * sSh);
            b = Math.round(SHIRT_WHITE[2] * sSh);

            // Subtle crisp shirt collar fold lines at top (y <= 5)
            if (y <= 5 && Math.abs(adx - (vHalf - 1.5)) < 0.9) {
              r = Math.round(r * 0.82); g = Math.round(g * 0.82); b = Math.round(b * 0.84);
            }

            // Clean Dark Navy Silk Tie down exact center (behind the 3D geometric microphone!)
            const tieHalf = y <= 5 ? lerp(3.2, 2.2, y / 5) : lerp(2.2, 3.0, (y - 5) / 21);
            if (adx <= tieHalf) {
              const tieCyl = 0.82 + 0.28 * Math.cos((adx / Math.max(1, tieHalf)) * Math.PI * 0.5);
              const silk = 0.94 + 0.08 * Math.sin((x + y) * 1.1);
              r = Math.round(TIE_NAVY[0] * tieCyl * silk);
              g = Math.round(TIE_NAVY[1] * tieCyl * silk);
              b = Math.round(TIE_NAVY[2] * tieCyl * silk);
              if (y >= 1 && y <= 4 && adx < 1.8) {
                r += 10; g += 12; b += 18;
              }
            }
          } else if (adx <= vHalf + 5.0) {
            // Tailored notched suit lapels flanking the white shirt V!
            const lapelHi = (Math.abs(adx - (vHalf + 4.3)) < 0.9) ? 0.72 : 1.25;
            r = Math.round(SUIT_NAVY[0] * shade * lapelHi);
            g = Math.round(SUIT_NAVY[1] * shade * lapelHi);
            b = Math.round(SUIT_NAVY[2] * shade * lapelHi);
          }
        }

        // 2. Crisp compact white pocket square on wearer's LEFT chest (dxScr = +11..+17.5, y = 13..15)
        if (dxScr >= 11.0 && dxScr <= 17.5 && y >= 13 && y <= 15) {
          const onWelt = (y === 15);
          if (onWelt) {
            r = SUIT_NAVY_DARK[0]; g = SUIT_NAVY_DARK[1]; b = SUIT_NAVY_DARK[2];
          } else {
            const pk = (y === 13) ? 0.92 : 1.0;
            r = Math.round(238 * pk); g = Math.round(240 * pk); b = Math.round(244 * pk);
          }
        }

        // 3. Jacket front center overlap seam + 2 dark buttons (matching textura_silvio_a.png!)
        if (y >= 27 && y <= 58 && Math.abs(dxScr) <= 1.0) {
          r = Math.round(r * 0.58); g = Math.round(g * 0.58); b = Math.round(b * 0.62);
        }
        for (const by of [30, 44]) {
          if (Math.hypot(dxScr - 1.2, y - by) <= 1.6) {
            r = 44; g = 50; b = 68;
          }
        }
        // Subtle lower jacket pocket flaps (y=46..47, adx=10..22)
        if ((y === 46 || y === 47) && adx >= 10 && adx <= 22) {
          const k = y === 46 ? 1.15 : 0.65;
          r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k);
        }
        // Subtle jacket bottom split at pelvis (y >= 58)
        if (y >= 58 && adx < 3.5) {
          r = Math.round(SUIT_NAVY_DARK[0] * 1.1);
          g = Math.round(SUIT_NAVY_DARK[1] * 1.1);
          b = Math.round(SUIT_NAVY_DARK[2] * 1.1);
        }
      } else {
        // Back of tailored navy suit jacket (center back seam at x=0/127 + shoulder yoke)
        if (x <= 1 || x >= 126) {
          r = Math.round(r * 0.72); g = Math.round(g * 0.72); b = Math.round(b * 0.76);
        }
        // Dark suit collar band around back neck (y <= 3)
        if (y <= 3) {
          r = Math.round(SUIT_NAVY_HI[0] * 0.9);
          g = Math.round(SUIT_NAVY_HI[1] * 0.9);
          b = Math.round(SUIT_NAVY_HI[2] * 0.9);
        }
      }

      const d = (y * W + x) * 4;
      rgba[d] = clamp(r, 8, 248); rgba[d + 1] = clamp(g, 8, 248); rgba[d + 2] = clamp(b, 10, 250); rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// Style A Long-Sleeve Navy Suit Arms + Crisp White Dress-Shirt Cuff at Wrist (texIdx=3, 32x64 256c)
function buildStyleASuitSleeves32x64() {
  const W = 32, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cyl = 0.76 + 0.28 * Math.sin(((x + 0.5) / W) * Math.PI);
      const d = (y * W + x) * 4;
      if (y >= 57) {
        // Crisp white dress-shirt cuff peeking cleanly at the wrist!
        const cuffShade = (y === 57 ? 0.78 : 0.96) * cyl;
        rgba[d] = clamp(Math.round(SHIRT_WHITE[0] * cuffShade), 120, 248);
        rgba[d + 1] = clamp(Math.round(SHIRT_WHITE[1] * cuffShade), 122, 248);
        rgba[d + 2] = clamp(Math.round(SHIRT_WHITE[2] * cuffShade), 126, 250);
        rgba[d + 3] = 255;
      } else {
        // Full-length tailored dark navy suit sleeve with subtle elbow crease
        const elbow = 1.0 - 0.12 * Math.exp(-Math.pow((y - 34) / 3.5, 2));
        const edge = y >= 55 ? 0.74 : 1.0;
        const s = cyl * elbow * edge;
        rgba[d] = clamp(Math.round(SUIT_NAVY[0] * s * 1.15), 8, 240);
        rgba[d + 1] = clamp(Math.round(SUIT_NAVY[1] * s * 1.15), 10, 240);
        rgba[d + 2] = clamp(Math.round(SUIT_NAVY[2] * s * 1.15), 14, 245);
        rgba[d + 3] = 255;
      }
    }
  }
  return rgba;
}

// Style A Full-Length Tailored Dark Navy Suit Trousers (texIdx=1, 64x128 256c)
function buildStyleASuitPants64x128() {
  const W = 64, H = 128;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cyl = 0.76 + 0.28 * Math.sin(((x + 0.5) / W) * Math.PI);
      // Subtle tailored trouser front press crease at x=32
      const crease = 1.0 + 0.16 * Math.exp(-Math.pow((x - 31.5) / 2.2, 2));
      const kneeFold = 1.0 - 0.08 * Math.exp(-Math.pow((y - 68) / 5.5, 2));
      const hem = y >= 123 ? 0.72 : (y < 4 ? 0.76 : 1.0);
      const s = cyl * crease * kneeFold * hem;
      const d = (y * W + x) * 4;
      rgba[d] = clamp(Math.round(SUIT_NAVY[0] * s * 1.12), 8, 240);
      rgba[d + 1] = clamp(Math.round(SUIT_NAVY[1] * s * 1.12), 10, 240);
      rgba[d + 2] = clamp(Math.round(SUIT_NAVY[2] * s * 1.12), 14, 245);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// Style A Sleek Dark Dress Shoes (texIdx=2, 32x32 256c)
function buildStyleADressShoes32x32() {
  const W = 32, H = 32;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gloss = 1.0 + 0.45 * Math.exp(-Math.pow((x - 16) / 7, 2)) * Math.exp(-Math.pow((y - 11) / 6, 2));
      const isSole = (y >= 26);
      const base = isSole ? [16, 16, 20] : [26, 28, 36];
      const d = (y * W + x) * 4;
      rgba[d] = clamp(Math.round(base[0] * gloss), 10, 120);
      rgba[d + 1] = clamp(Math.round(base[1] * gloss), 10, 122);
      rgba[d + 2] = clamp(Math.round(base[2] * gloss), 12, 132);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// ============================================================================
// 4. STYLE B OUTFIT TEXTURES (textura_silvio_b.png — Iconic Florida Hawaiian Shirt + Plaid Shorts!)
// ============================================================================
function buildStyleBHawaiianTorso128x64() {
  const W = 128, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  const sw = suitBDims.w, sh = suitBDims.h;

  // Source front Hawaiian shirt bounds in textura_silvio_b.png (273x439):
  // x = 0.20..0.76 * W, y = 0.01..0.60 * H
  const sx0 = sw * 0.20, sx1 = sw * 0.76;
  const sy0 = sh * 0.015, sy1 = sh * 0.60;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sideDist = Math.min(Math.abs(x - 32), Math.abs(x - 96));
      const shade = 0.84 + 0.18 * clamp(sideDist / 22, 0, 1);
      let r, g, b;

      if (x >= 32 && x <= 95) {
        // Front torso: FLIP X so viewer's RIGHT (U=32..63) gets photo's RIGHT (yellow balloon & seagulls!)
        // and viewer's LEFT (U=64..95) gets photo's LEFT (floral collar lapel & green palms!)
        const uFront = 1.0 - (x - 32) / 63; // 1.0 at x=32 (right of photo), 0.0 at x=95 (left of photo)
        const vFront = y / (H - 1);
        const fx = lerp(sx0, sx1, uFront);
        const fy = lerp(sy0, sy1, vFront);
        const c = sampleBilinear(suitBSrc, sw, sh, fx, fy);
        r = c[0]; g = c[1]; b = c[2];
        // Clean chest V-skin at top center (y <= 7, around center) harmonized to Silvio's warm skin!
        const dx = x - 63.5;
        if (y <= 7 && Math.abs(dx) < Math.max(0, 5.5 - y * 0.72)) {
          r = Math.round(SILVIO_SKIN[0] * 0.94);
          g = Math.round(SILVIO_SKIN[1] * 0.94);
          b = Math.round(SILVIO_SKIN[2] * 0.94);
        } else if (y <= 6 && Math.abs(dx) > 13 && !(dx > 13 && dx < 22 && r > 150)) {
          // Ensure clean deep royal-blue shirt fabric at top shoulders (no outdoor street/tree bleed!)
          if (b < r + 25) { r = 18; g = 30; b = 138; }
        }
      } else {
        // Back & sides of Hawaiian shirt: seamless royal-blue tropical print + vibrant lower hibiscus flowers!
        const bx = x < 32 ? (32 - x) / 32 : (x - 95) / 32; // 0 at side seam -> 1 at center back
        const vBack = y / (H - 1);
        // Sample lower floral print & royal blue sky cleanly from photo avoiding neck V-opening!
        const sampleY = vBack < 0.24
          ? lerp(sh * 0.14, sh * 0.26, vBack / 0.24)
          : lerp(sh * 0.26, sh * 0.59, (vBack - 0.24) / 0.76);
        // Mirror left/right cleanly at side seams so seam x=32 & x=95 match seamlessly!
        const sampleX = x < 32
          ? lerp(sx1 - 4, sw * 0.48, bx)
          : lerp(sx0 + 4, sw * 0.52, bx);
        const c = sampleBilinear(suitBSrc, sw, sh, sampleX, sampleY);
        r = c[0]; g = c[1]; b = c[2];
        // Deep royal-blue collar along top back (y <= 3)
        if (y <= 3) { r = 18; g = 28; b = 132; }
      }

      // Gentle vivid saturation boost so tropical colors pop on PS1 BGR555!
      const avg = (r + g + b) / 3;
      r = clamp(Math.round((avg + (r - avg) * 1.15) * shade), 8, 250);
      g = clamp(Math.round((avg + (g - avg) * 1.15) * shade), 8, 250);
      b = clamp(Math.round((avg + (b - avg) * 1.18) * shade), 10, 252);
      const d = (y * W + x) * 4;
      rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// Style B Arms (texIdx=4, 32x64 256c): Royal-Blue Hawaiian Short Sleeve (V=0..27) + Bare Forearm (V=28..53, NO ELBOW PADS!) + Black Watch (V=54..58)
function buildStyleBArms32x64() {
  const W = 32, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  const sw = suitBDims.w, sh = suitBDims.h;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cyl = 0.78 + 0.24 * Math.sin(((x + 0.5) / W) * Math.PI);
      const d = (y * W + x) * 4;
      if (y <= 27) {
        // Short royal-blue Hawaiian sleeve sampled from left sleeve of textura_silvio_b.png
        const fx = lerp(sw * 0.10, sw * 0.21, x / (W - 1));
        const fy = lerp(sh * 0.08, sh * 0.28, y / 27);
        const c = sampleBilinear(suitBSrc, sw, sh, fx, fy);
        // Ensure clean deep royal blue fabric (no stray street background pixels!)
        const isBlue = c[2] > c[0] + 15;
        let r = isBlue ? c[0] : 18;
        let g = isBlue ? c[1] : 30;
        let b = isBlue ? c[2] : 142;
        const hem = y >= 25 ? 0.75 : 1.0;
        rgba[d] = clamp(Math.round(r * cyl * hem), 8, 245);
        rgba[d + 1] = clamp(Math.round(g * cyl * hem), 8, 245);
        rgba[d + 2] = clamp(Math.round(b * cyl * hem), 14, 250);
        rgba[d + 3] = 255;
      } else if (y >= 54 && y <= 58) {
        // Silvio's matte black wristwatch band (matching textura_silvio_b.png!)
        const isDial = (x >= 11 && x <= 20 && y >= 55 && y <= 57);
        const v = isDial ? 38 : 22;
        rgba[d] = Math.round(v * cyl);
        rgba[d + 1] = Math.round(v * cyl);
        rgba[d + 2] = Math.round((v + 4) * cyl);
        rgba[d + 3] = 255;
      } else {
        // Clean bare warm-Caucasian forearm (100% erases Bob's original black elbow pads!)
        const sleeveShadow = y <= 31 ? lerp(0.76, 1.0, (y - 27) / 4) : 1.0;
        rgba[d] = clamp(Math.round(SILVIO_SKIN[0] * cyl * sleeveShadow), 20, 248);
        rgba[d + 1] = clamp(Math.round(SILVIO_SKIN[1] * cyl * sleeveShadow), 18, 240);
        rgba[d + 2] = clamp(Math.round(SILVIO_SKIN[2] * cyl * sleeveShadow), 14, 232);
        rgba[d + 3] = 255;
      }
    }
  }
  return rgba;
}

// Style B Plaid Bermuda Shorts (texIdx=1, 64x64 256c): V=0..50 Blue/White/Black Plaid Shorts, V=51..63 Clean Bare Knees (NO KNEE PADS!)
function buildStyleBPlaidShorts64x64() {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  const sw = suitBDims.w, sh = suitBDims.h;

  // Sample authentic blue/white/grey/black plaid swatch directly from textura_silvio_b.png shorts!
  const px0 = sw * 0.24, px1 = sw * 0.46;
  const py0 = sh * 0.64, py1 = sh * 0.85;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cyl = 0.78 + 0.24 * Math.sin(((x + 0.5) / W) * Math.PI);
      const d = (y * W + x) * 4;
      if (y <= 44) {
        // Mirror-tile the real plaid swatch seamlessly horizontally around the thigh!
        // Hem cleanly at y=44 (STRICTLY above Mesh[2]'s jagged knee-pad UV seam V=47..63 -> razor-straight hem!)
        const uTile = ((x * 2) / W) % 2;
        const uMir = uTile <= 1 ? uTile : (2 - uTile);
        const vTile = y / 44;
        const c = sampleBilinear(suitBSrc, sw, sh, lerp(px0, px1, uMir), lerp(py0, py1, vTile));
        const hem = y >= 42 ? 0.74 : (y <= 2 ? 0.78 : 1.0);
        rgba[d] = clamp(Math.round(c[0] * cyl * hem * 1.06), 10, 246);
        rgba[d + 1] = clamp(Math.round(c[1] * cyl * hem * 1.06), 10, 246);
        rgba[d + 2] = clamp(Math.round(c[2] * cyl * hem * 1.08), 12, 248);
        rgba[d + 3] = 255;
      } else {
        // Clean bare knee skin below shorts hem (100% eliminates Bob's black knee pads & zigzag!)
        const hemShadow = y <= 48 ? lerp(0.74, 1.0, (y - 44) / 4) : 1.0;
        rgba[d] = clamp(Math.round(SILVIO_SKIN[0] * cyl * hemShadow), 20, 248);
        rgba[d + 1] = clamp(Math.round(SILVIO_SKIN[1] * cyl * hemShadow), 18, 240);
        rgba[d + 2] = clamp(Math.round(SILVIO_SKIN[2] * cyl * hemShadow), 14, 232);
        rgba[d + 3] = 255;
      }
    }
  }
  return rgba;
}

// Style B Bare Shins / Lower Legs (texIdx=2, 32x32 256c): 100% Bare Skin + Subtle White Ankle Sock (NO KNEE PADS!)
function buildStyleBShins32x32() {
  const W = 32, H = 32;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cyl = 0.78 + 0.24 * Math.sin(((x + 0.5) / W) * Math.PI);
      const d = (y * W + x) * 4;
      if (y >= 28) {
        // Subtle light ankle sock above sneaker
        const s = 226 * cyl;
        rgba[d] = clamp(Math.round(s), 140, 245);
        rgba[d + 1] = clamp(Math.round(s), 140, 245);
        rgba[d + 2] = clamp(Math.round(s + 4), 144, 248);
        rgba[d + 3] = 255;
      } else {
        rgba[d] = clamp(Math.round(SILVIO_SKIN[0] * cyl), 20, 248);
        rgba[d + 1] = clamp(Math.round(SILVIO_SKIN[1] * cyl), 18, 240);
        rgba[d + 2] = clamp(Math.round(SILVIO_SKIN[2] * cyl), 14, 232);
        rgba[d + 3] = 255;
      }
    }
  }
  return rgba;
}

// Style B Casual Vacation Sneakers (texIdx=3, 32x32 256c)
function buildStyleBSneakers32x32() {
  const W = 32, H = 32;
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cyl = 0.82 + 0.20 * Math.sin(((x + 0.5) / W) * Math.PI);
      const isSole = y >= 25;
      const isStripe = (y >= 16 && y <= 19);
      const base = isSole ? [225, 225, 228] : (isStripe ? [34, 54, 136] : [196, 200, 208]);
      const d = (y * W + x) * 4;
      rgba[d] = clamp(Math.round(base[0] * cyl), 16, 246);
      rgba[d + 1] = clamp(Math.round(base[1] * cyl), 16, 246);
      rgba[d + 2] = clamp(Math.round(base[2] * cyl), 20, 248);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// ============================================================================
// 5. 3D HEAD GEOMETRY SCULPTING (REMOVES BUCKET HAT IN STYLE A & HELMET IN STYLE B!)
// ============================================================================
function sculptStyleAHeadAndRemapCrownUv(buf, psxInfo, headMeshIdx) {
  const mo = psxInfo.meshOffs[headMeshIdx];
  const mEnd = (headMeshIdx + 1 < psxInfo.numMeshes) ? psxInfo.meshOffs[headMeshIdx + 1] : psxInfo.ptrMeta;
  const nV = buf.readUInt16LE(mo + 2), nN = buf.readUInt16LE(mo + 4), nF = buf.readUInt16LE(mo + 6);
  const vOff = mo + 28, fOff = vOff + nV * 8 + nN * 8;

  // Exact symmetric Silvio Santos anatomical head targets (eliminates flaring bucket hat brim & flat square crown!)
  // Centerline cx = +2. STRICTLY preserves all w=2 neck-seam stitch vertices!
  const highTargets = {
    // Eliminated Bucket Hat Front/Side/Rear Brim Ring -> tucked cleanly onto hairline, temples & nape!
    51: [   2, -214, -220], // front hairline center (pulled in from -31,-203,-279!)
    52: [-102, -206, -184], 53: [ 106, -206, -184], // front-side hairline (pulled in from ±143,-197,-216!)
    54: [-144, -172,  -92], 55: [ 148, -172,  -92], // upper temples (pulled in from ±210,-165,-100!)
     8: [-148, -104,  -34], 23: [ 152, -104,  -34], // side hair above ears (pulled in from ±203,-103,-32!)
    36: [-118,  -56,   54], 35: [ 122,  -56,   54], // lower-rear behind ears (pulled in from ±178,-19,61!)
     7: [   2,  -46,   76],                         // clean nape curve (pulled in from 2,22,142!)

    // Bucket Hat Square Crown -> Silvio Santos' full, smooth, combed-back dark-brown pompadour dome!
    62: [   2, -320,  -22],                         // rounded crown apex (smoothed from -334)
    37: [ -70, -310, -124], 56: [  74, -310, -124], // rounded pompadour front crest!
    13: [   2, -264, -204],                         // pompadour front sweep above forehead
    48: [ -98, -250, -154], 49: [ 102, -250, -154], // pompadour front-sides
    60: [-118, -274,  -34], 61: [ 122, -274,  -34], // upper side hair sweep
    30: [-146, -196,  -42], 14: [ 150, -196,  -42], // mid side hair
    57: [ -96, -248,   74], 11: [ 100, -248,   74], // upper occiput back hair
    38: [-106, -126,   74], 39: [ 110, -126,   74], // lower occiput
    50: [   2, -112,  102],                         // rounded rear skull center

    // Symmetric Silvio Santos Face (broad warm smile cheeks, natural nose, level brows & firm chin!)
    10: [   2, -190, -220],                         // upper forehead center
     9: [ -92, -184, -190], 24: [  96, -184, -190], // forehead sides
    12: [-132, -162, -118], 25: [ 136, -162, -118], // outer temples
    44: [   2, -146, -230],                         // between eyebrows
    46: [ -98, -144, -205], 47: [ 102, -144, -205], // eyebrows
    63: [   2, -116, -235],                         // nose bridge
     5: [-132, -116, -152], 21: [ 136, -116, -152], // outer eye / temple
    42: [ -28,  -68, -242], 43: [  32,  -68, -242], // nose sides
    33: [-108,  -68, -190], 34: [ 112,  -68, -190], // smiling full cheekbones!
    15: [   2,  -42, -280],                         // Silvio's friendly natural nose tip
    40: [   2,  -24, -254],                         // philtrum
     6: [ -46,  -32, -226], 22: [  50,  -32, -226], // smile nasolabial folds
    41: [   2,    8, -258],                         // broad smiling mouth center
    32: [ -74,   24, -200], 31: [  78,   24, -200], // full smiling lower cheeks
    45: [   2,   58, -250],                         // chin cleft
     3: [ -40,   84, -230],  4: [  44,   84, -230], // warm rounded chin
     2: [ -52,  100, -142], 20: [  56,  100, -142], // under chin
    28: [-112,   16,  -62], 29: [ 116,   16,  -62], // jaw corners
     1: [-108,  -18,   14], 19: [ 112,  -18,   14], // under ears
    58: [-140,  -84,  -40], 59: [ 144,  -84,  -40], // ears
     0: [   2,    2,   66],                         // lower back neck
  };

  const lowTargets = {
    10: [   2, -214, -220],                         // front hairline
    26: [-102, -206, -184], 27: [ 106, -206, -184], // front-side hairline
    28: [-144, -172,  -92], 29: [ 148, -172,  -92], // upper temples
     1: [-140,  -84,  -40], 16: [ 144,  -84,  -40], // ears / mid sides
     8: [-118,  -56,   54], 19: [ 122,  -56,   54], // lower rear behind ears
     7: [   2,  -46,   76],                         // nape
    24: [ -84, -318, -126], 30: [  88, -318, -126], // pompadour crest
    23: [-146, -196,  -42], 11: [ 150, -196,  -42], // mid side hair
    31: [ -96, -248,   74],  9: [ 100, -248,   74], // upper occiput
     5: [ -92, -184, -190], 17: [  96, -184, -190], // forehead sides
    25: [   2, -116, -235],                         // nose bridge
    12: [   2,  -42, -280],                         // nose tip
     6: [ -46,  -26, -248], 18: [  50,  -26, -248], // smile cheeks
     3: [ -40,   84, -240],  4: [  44,   84, -240], // chin
     2: [   2,  100, -142],                         // under chin
    21: [-112,   16,  -62], 22: [ 116,   16,  -62], // jaw corners
     0: [   2,    2,   66],                         // back neck
  };

  const targets = (nV === 64) ? highTargets : lowTargets;
  for (let v = 0; v < nV; v++) {
    const vo = vOff + v * 8;
    const w = buf.readUInt16LE(vo + 6);
    if (w !== 0) continue; // STRICT INVARIANT: NEVER touch w=2 neck-seam stitch vertices!
    const t = targets[v];
    if (t) {
      buf.writeInt16LE(clamp(Math.round(t[0]), -32767, 32767), vo);
      buf.writeInt16LE(clamp(Math.round(t[1]), -32767, 32767), vo + 2);
      buf.writeInt16LE(clamp(Math.round(t[2]), -32767, 32767), vo + 4);
    }
  }

  // Remap Mesh[15] texIdx=6 UVs strictly into left half U=0..15 (leaving U=16..31 100% exclusive to 3D Chest Mic!)
  let fp = fOff;
  for (let fi = 0; fi < nF && fp + 4 <= mEnd; fi++) {
    const fLen = buf.readUInt16LE(fp + 2);
    const gpu = buf[fp + 11], quad = (gpu & 8) !== 0;
    const tid = buf.readUInt32LE(fp + 16);
    if (tid === 6) {
      const nv = quad ? 4 : 3;
      for (let k = 0; k < nv; k++) {
        const origU = buf[fp + 20 + k * 2];
        const newU = clamp(Math.round((origU / 31) * 14), 0, 14);
        buf[fp + 20 + k * 2] = newU;
      }
    }
    fp += fLen;
  }

  recomputeMeshBounds(buf, mo, 8);
}

function sculptStyleBHead(buf, psxInfo, headMeshIdx) {
  const mo = psxInfo.meshOffs[headMeshIdx];
  const nV = buf.readUInt16LE(mo + 2);
  const vOff = mo + 28;

  // Eliminates bulky skate helmet shell & visor overhang -> exact Silvio Santos pompadour hair + smiling face!
  // Centerline cx = +4. STRICTLY preserves all w=2 neck-seam stitch vertices!
  const highTargets = {
    // Eliminated Helmet Visor & Bulky Rim -> smooth Silvio hairline & combed-back side hair!
    51: [   4, -220, -226],                         // front hairline center (pulled in from z=-299!)
    52: [-102, -210, -188], 53: [ 110, -210, -188], // front-side hairline (pulled in from -244!)
    54: [-144, -180, -104], 55: [ 152, -180, -104], // temples (pulled in from ±186,-206,-134!)
     9: [   4, -206, -228],                         // upper forehead center (pulled in from -268)
     8: [ -92, -196, -196], 22: [ 100, -196, -196], // forehead sides
    11: [-124, -188, -142], 23: [ 132, -188, -142], // outer forehead / temple hair
     7: [-144,  -92,  -44], 21: [ 152,  -92,  -44], // ears / mid-sides (pulled in from ±168)
    34: [-116,  -68,   52], 33: [ 124,  -68,   52], // behind ears
     6: [   4,  -52,   84],                         // smooth nape

    // Eliminated Tall Helmet Crown -> Silvio Santos combed-back dark-brown pompadour dome!
    35: [   4, -322,  -84],                         // rounded pompadour top (lowered from -378!)
    12: [   4, -286, -198],                         // pompadour front wave (lowered from -344,-242!)
    46: [-102, -286, -126], 47: [ 110, -286, -126], // pompadour upper sides (lowered from -331)
    28: [-138, -242,  -32], 13: [ 146, -242,  -32], // mid-upper side hair (lowered from -286, ±165)
    10: [   4, -274,   72],                         // upper rear crown (lowered from -317)
    36: [-112, -212,   74], 37: [ 120, -212,   74], // upper occiput
    50: [   4, -162,  106],                         // rounded rear occiput (pulled in from z=+155!)

    // Symmetric Silvio Santos Face (matching Style A proportions!)
    56: [   4, -170, -238],                         // mid forehead
    44: [ -96, -162, -212], 45: [ 104, -162, -212], // outer brows
    42: [   4, -138, -244],                         // glabella
     5: [-124, -146, -148], 20: [ 132, -146, -148], // temples
    40: [ -22, -104, -248], 41: [  30, -104, -248], // inner eye / nose bridge
    31: [-112,  -94, -196], 32: [ 120,  -94, -196], // cheekbones
    14: [   4,  -58, -282],                         // natural nose tip
    38: [   4,  -38, -252],                         // under nose
    49: [ -36,  -50, -240], 48: [  44,  -50, -240], // nose wings
    39: [   4,   -2, -256],                         // broad smiling mouth
    30: [ -74,   12, -198], 29: [  82,   12, -198], // full smiling cheeks
    43: [   4,   52, -248],                         // chin front
     3: [ -40,   78, -224],  4: [  48,   78, -224], // rounded chin
     2: [ -44,   92, -140], 19: [  52,   92, -140], // under chin
    26: [-110,  -12,  -68], 27: [ 118,  -12,  -68], // jaw corners
     1: [-102,  -30,    8], 18: [ 110,  -30,    8], // under ears
     0: [   4,  -38,   70],                         // back neck
  };

  const lowTargets = {
     8: [   4, -220, -226],                         // front hairline (from z=-299!)
     5: [-102, -210, -188], 17: [ 110, -210, -188], // front-side hairline
    28: [-144, -180, -104], 29: [ 152, -180, -104], // temples
    21: [   4, -322,  -84],                         // pompadour top (from -378!)
    10: [   4, -286, -198],                         // pompadour front (from -344,-242!)
    20: [-102, -286, -126], 11: [ 110, -286, -126], // pompadour upper sides
     9: [   4, -274,   72],                         // upper rear crown
    22: [-112, -212,   74], 23: [ 120, -212,   74], // upper occiput
    27: [   4, -162,  106],                         // rear occiput (from z=+155!)
     6: [   4,  -52,   84],                         // nape
     7: [-116,  -68,   52], 18: [ 124,  -68,   52], // behind ears
    26: [   4, -138, -244],                         // brow/bridge
    12: [   4,  -58, -282],                         // nose tip
    25: [ -36,  -38, -248], 24: [  44,  -38, -248], // cheeks
     3: [ -40,   74, -240],  4: [  48,   74, -240], // chin
     2: [   4,   92, -140],                         // under chin
     1: [-106,  -20,  -32], 16: [ 114,  -20,  -32], // jaw
     0: [   4,  -38,   70],                         // back neck
  };

  const targets = (nV === 57) ? highTargets : lowTargets;
  for (let v = 0; v < nV; v++) {
    const vo = vOff + v * 8;
    const w = buf.readUInt16LE(vo + 6);
    if (w !== 0) continue; // STRICT INVARIANT: NEVER touch w=2 neck-seam stitch vertices!
    const t = targets[v];
    if (t) {
      buf.writeInt16LE(clamp(Math.round(t[0]), -32767, 32767), vo);
      buf.writeInt16LE(clamp(Math.round(t[1]), -32767, 32767), vo + 2);
      buf.writeInt16LE(clamp(Math.round(t[2]), -32767, 32767), vo + 4);
    }
  }
  recomputeMeshBounds(buf, mo, 8);
}

// ============================================================================
// 6. TRUE 3D GEOMETRIC CHEST MICROPHONE INJECTOR FOR Mesh[8] (Style A Hi & Lo!)
// ============================================================================
/**
 * Builds the exact 23-vertex (w=0), 18-polygon (36-byte POLY_FT3/FT4) true 3D Shure-style
 * chest microphone (matching textura_silvio_a.png proportions!) tilted flush along Mesh[8]'s
 * front chest slope (atan2(101, 210) ~ 25.7°), with automated PS1 GTE front-facing winding verification!
 *
 * Byte overhead inside Mesh[8]:
 *   23 verts * 8B + (23 vertNorms + 18 faceNorms) * 8B + 18 prims * 36B = 184 + 328 + 648 = 1,160 B!
 *   - burnq2.psx: 60,244 + 1,160 = 61,404 B <= 61,440 B (30 sectors — 36 B spare, ZERO WAD offset shift!)
 *   - burnq_l.psx: 51,932 + 1,160 = 53,092 B <= 53,248 B (26 sectors — 156 B spare, ZERO WAD offset shift!)
 */
function build3DChestMicrophoneSpec() {
  // Chest front surface centerline (X=0): v[18]=(1,-431,-136) -> mid(0,-221,-237)
  // Unit tangent down along tie: tDown = (0, +0.9012, -0.4335)
  // Unit outward chest normal:   nOut  = (0, -0.4335, -0.9012)
  const ox = 1, oy = -322, oz = -189; // Surface anchor right on Silvio's upper-mid navy tie!
  const tDown = [0, 0.9012, -0.4335];
  const nOut  = [0, -0.4335, -0.9012];

  const toChest = (lx, ly, lz) => [
    Math.round(ox + lx),
    Math.round(oy + ly * tDown[1] + lz * nOut[1]),
    Math.round(oz + ly * tDown[2] + lz * nOut[2]),
  ];

  // Local coordinates (lx = left/right, ly = down along tie, lz = proud OUT in front of tie toward camera!)
  // Proportions calibrated directly to textura_silvio_a.png:
  //   - Ball grill: height 56 (-64..-8), width 48 (-24..+24), protrudes lz = 58 (embedded cleanly at lz = 4!)
  //   - Tapered shaft: height 98 (+4..+102), width tapers 24 (-12..+12) -> 18 (-9..+9), protrudes lz = 42 -> 34
  //   - Horizontal tie-clip bar: sleek metallic bar at ly=+47..+57, width 62 (-31..+31), protrudes lz = 48!
  const localPts = [
    // [0] Ball Grill Top Apex
    [  0, -66, 31],
    // [1..4] Ball Grill Upper-Equator Ring (ly = -48): FL, FR, BR, BL
    [-23, -48, 57], [ 23, -48, 57], [ 23, -48,  6], [-23, -48,  6],
    // [5..8] Ball Grill Lower-Equator Ring (ly = -20): FL, FR, BR, BL (metallic chrome midline band!)
    [-24, -20, 58], [ 24, -20, 58], [ 24, -20,  6], [-24, -20,  6],
    // [9..12] Neck Collar / Shaft Top Ring (ly = +4): FL, FR, BR, BL
    [-12,   4, 42], [ 12,   4, 42], [ 12,   4,  4], [-12,   4,  4],
    // [13..16] Tapered Shaft Bottom Ring (ly = +102): FL, FR, BR, BL
    [ -9, 102, 34], [  9, 102, 34], [  9, 102,  2], [ -9, 102,  2],
    // [17..19] Horizontal 3D Tie-Clip Bar — Left Profile (lx = -31, ly = +47..+57)
    [-31,  47,  4], [-31,  52, 48], [-31,  57,  4],
    // [20..22] Horizontal 3D Tie-Clip Bar — Right Profile (lx = +31, ly = +47..+57)
    [ 31,  47,  4], [ 31,  52, 48], [ 31,  57,  4],
  ];
  const verts = localPts.map(p => toChest(p[0], p[1], p[2]));
  if (verts.length !== 23) throw new Error(`Esperado 23 vertices do microfone, obtido ${verts.length}`);

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const norm4096 = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [Math.round(v[0] / l * 4096), Math.round(v[1] / l * 4096), Math.round(v[2] / l * 4096)];
  };

  // Helper to construct a guaranteed PS1 front-facing TRI (p0,p1,p2) with dot(cross(p1-p0,p2-p0), outDir) < 0!
  const faces = [];
  const addTri = (a, b, c, uvA, uvB, uvC, hintOutLocal) => {
    const hintOut = [
      hintOutLocal[0],
      hintOutLocal[1] * tDown[1] + hintOutLocal[2] * nOut[1],
      hintOutLocal[1] * tDown[2] + hintOutLocal[2] * nOut[2],
    ];
    let idx = [a, b, c], uvs = [uvA, uvB, uvC];
    const cr = cross(sub(verts[idx[1]], verts[idx[0]]), sub(verts[idx[2]], verts[idx[0]]));
    if (dot(cr, hintOut) > 0) {
      // Swap b & c so PS1 GTE outward normal matches hintOut!
      idx = [a, c, b]; uvs = [uvA, uvC, uvB];
    }
    const finalCr = cross(sub(verts[idx[1]], verts[idx[0]]), sub(verts[idx[2]], verts[idx[0]]));
    // Outward normal in THPS2 = -finalCr!
    const outN = norm4096([-finalCr[0], -finalCr[1], -finalCr[2]]);
    if (dot(outN, hintOut) <= 0) throw new Error('Winding assertion failed on 3D Mic Tri!');
    faces.push({ quad: false, idx, uvs, normal: outN, texIdx: 6 });
  };

  // Helper to construct a guaranteed PS1 front-facing QUAD (strip order: TL, BL, TR, BR -> tri1=(0,1,2), tri2=(1,3,2))!
  const addQuad = (tl, bl, tr, br, uvTL, uvBL, uvTR, uvBR, hintOutLocal) => {
    const hintOut = [
      hintOutLocal[0],
      hintOutLocal[1] * tDown[1] + hintOutLocal[2] * nOut[1],
      hintOutLocal[1] * tDown[2] + hintOutLocal[2] * nOut[2],
    ];
    let idx = [tl, bl, tr, br], uvs = [uvTL, uvBL, uvTR, uvBR];
    const cr = cross(sub(verts[idx[1]], verts[idx[0]]), sub(verts[idx[2]], verts[idx[0]]));
    if (dot(cr, hintOut) > 0) {
      // Swap horizontal sides (tl<->tr, bl<->br) to flip winding cleanly while preserving quad strip topology!
      idx = [tr, br, tl, bl]; uvs = [uvTR, uvBR, uvTL, uvBL];
    }
    const cr1 = cross(sub(verts[idx[1]], verts[idx[0]]), sub(verts[idx[2]], verts[idx[0]]));
    const cr2 = cross(sub(verts[idx[3]], verts[idx[1]]), sub(verts[idx[2]], verts[idx[1]]));
    const outN = norm4096([-(cr1[0] + cr2[0]), -(cr1[1] + cr2[1]), -(cr1[2] + cr2[2])]);
    if (dot(outN, hintOut) <= 0) throw new Error('Winding assertion failed on 3D Mic Quad!');
    faces.push({ quad: true, idx, uvs, normal: outN, texIdx: 6 });
  };

  // UV tiles inside texIdx=6 right half (U=16..31, V=0..31):
  //   Ball Grill Mesh:     U=17..30, V=1..11
  //   Grill+Chrome Band:   U=17..30, V=8..15
  //   Lower Grill Taper:   U=17..30, V=11..16
  //   Brushed Silver Shaft:U=17..30, V=17..25
  //   Chrome Tie-Clip Bar: U=17..30, V=26..31

  // 1. Ball Grill Top Dome (4 tris — closed 360°!)
  addTri(0, 1, 2, [23, 1], [17, 10], [30, 10], [ 0, -1,  1]); // Front-top dome
  addTri(0, 4, 1, [23, 1], [17, 10], [30, 10], [-1, -1,  0]); // Left-top dome
  addTri(0, 2, 3, [23, 1], [17, 10], [30, 10], [ 1, -1,  0]); // Right-top dome
  addTri(0, 3, 4, [23, 1], [17, 10], [30, 10], [ 0, -1, -1]); // Back-top dome (visible from above!)

  // 2. Ball Grill Equatorial Band (3 visible quads: front, left, right — includes iconic chrome ring!)
  addQuad(1, 5, 2, 6, [17, 7], [17, 15], [30, 7], [30, 15], [ 0,  0,  1]); // Front grill + chrome band
  addQuad(4, 8, 1, 5, [17, 7], [17, 15], [30, 7], [30, 15], [-1,  0,  0]); // Left grill + chrome band
  addQuad(2, 6, 3, 7, [17, 7], [17, 15], [30, 7], [30, 15], [ 1,  0,  0]); // Right grill + chrome band

  // 3. Ball Grill Lower Taper into Shaft Collar (3 visible quads: front, left, right)
  addQuad(5, 9, 6, 10, [17, 12], [19, 17], [30, 12], [28, 17], [ 0,  1,  1]); // Front lower taper
  addQuad(8, 12, 5, 9, [17, 12], [19, 17], [30, 12], [28, 17], [-1,  1,  0]); // Left lower taper
  addQuad(6, 10, 7, 11,[17, 12], [19, 17], [30, 12], [28, 17], [ 1,  1,  0]); // Right lower taper

  // 4. Tapered Cylindrical Silver Shaft (4 quads: front, left, right, closed bottom cap!)
  addQuad(9, 13, 10, 14, [17, 17], [18, 25], [30, 17], [29, 25], [ 0,  0,  1]); // Front shaft
  addQuad(12, 16, 9, 13, [17, 17], [18, 25], [30, 17], [29, 25], [-1,  0,  0]); // Left shaft
  addQuad(10, 14, 11, 15,[17, 17], [18, 25], [30, 17], [29, 25], [ 1,  0,  0]); // Right shaft
  addQuad(13, 16, 14, 15,[20, 22], [20, 25], [27, 22], [27, 25], [ 0,  1,  0]); // Closed bottom cap

  // 5. Horizontal 3D Metallic Tie-Clip Bar (4 faces: upper bevel, lower bevel, left end, right end)
  addQuad(17, 18, 20, 21, [17, 26], [17, 28], [30, 26], [30, 28], [ 0, -1,  1]); // Clip upper-front chrome bevel
  addQuad(18, 19, 21, 22, [17, 28], [17, 31], [30, 28], [30, 31], [ 0,  1,  1]); // Clip lower-front chrome bevel
  addTri(17, 19, 18, [17, 26], [17, 31], [23, 28], [-1, 0, 0]);                  // Clip left chrome cap
  addTri(20, 21, 22, [24, 26], [30, 28], [24, 31], [ 1, 0, 0]);                  // Clip right chrome cap

  if (faces.length !== 18) throw new Error(`Esperado 18 faces do microfone, obtido ${faces.length}`);

  // Compute smooth per-vertex normals by averaging adjacent face normals (maintaining nN === nV + nF!)
  const vNorms = verts.map((_, vi) => {
    let sx = 0, sy = 0, sz = 0, c = 0;
    for (const f of faces) {
      if (f.idx.includes(vi)) { sx += f.normal[0]; sy += f.normal[1]; sz += f.normal[2]; c++; }
    }
    return c ? norm4096([sx, sy, sz]) : norm4096([0, -1775, -3690]);
  });

  return { verts, vNorms, faces };
}

/**
 * Surgically injects the 3D chest microphone into Mesh[8] (burnq_chest) of a .PSX buffer,
 * preserving ALL stitch invariants (w=0 appended at end), strict nN === nV + nF (remapping
 * original Mesh[8] face normIdx += K_V), recalculating hdrBbox/rad, and shifting ptrMeta,
 * meshOffs[9..18], and texOffs[0..10] by exact +delta bytes!
 */
function inject3DChestMicIntoPsx(origBuf, micSpec) {
  const info = parsePsxStructure(origBuf);
  const mo8 = info.meshOffs[8];
  const mEnd8 = info.meshOffs[9];

  const flags = origBuf.readUInt16LE(mo8 + 0);
  const oldNV = origBuf.readUInt16LE(mo8 + 2);
  const oldNN = origBuf.readUInt16LE(mo8 + 4);
  const oldNF = origBuf.readUInt16LE(mo8 + 6);
  if (oldNN !== oldNV + oldNF) {
    throw new Error(`Mesh[8] violacao inesperada de nN===nV+nF: ${oldNN} != ${oldNV}+${oldNF}`);
  }

  const addV = micSpec.verts.length;   // 23
  const addF = micSpec.faces.length;   // 18
  const newNV = oldNV + addV;
  const newNF = oldNF + addF;
  const newNN = newNV + newNF;         // strict nN === nV + nF!
  if (newNV > 255) throw new Error(`Mesh[8] newNV excede 255 (${newNV})`);

  const vOff = mo8 + 28;
  const nOff = vOff + oldNV * 8;
  const fOff = nOff + oldNN * 8;
  const oldVertBytes = origBuf.subarray(vOff, nOff);
  const oldVertNormBytes = origBuf.subarray(nOff, nOff + oldNV * 8);
  const oldFaceNormBytes = origBuf.subarray(nOff + oldNV * 8, fOff);
  const oldFaceBytes = Buffer.from(origBuf.subarray(fOff, mEnd8));

  // Remap every original Mesh[8] primitive's normIdx (+0x0C) by +addV because we inserted addV vertex normals
  // cleanly at the end of the vertex-normal section [oldNV .. oldNV + addV - 1]!
  let fp = 0;
  for (let fi = 0; fi < oldNF; fi++) {
    const fLen = oldFaceBytes.readUInt16LE(fp + 2);
    const oldNormIdx = oldFaceBytes.readUInt16LE(fp + 12);
    oldFaceBytes.writeUInt16LE(oldNormIdx + addV, fp + 12);
    fp += fLen;
  }
  if (fp !== oldFaceBytes.length) throw new Error(`Mesh[8] face walk mismatch: ${fp} vs ${oldFaceBytes.length}`);

  // Build new vertex buffer (all w = 0!)
  const newVertBytes = Buffer.alloc(addV * 8);
  for (let i = 0; i < addV; i++) {
    const [x, y, z] = micSpec.verts[i];
    newVertBytes.writeInt16LE(x, i * 8 + 0);
    newVertBytes.writeInt16LE(y, i * 8 + 2);
    newVertBytes.writeInt16LE(z, i * 8 + 4);
    newVertBytes.writeUInt16LE(0, i * 8 + 6); // w = 0 (non-stitch, rigidly attached to Chest bone!)
  }

  // Build new vertex-normal & face-normal buffers
  const newVertNormBytes = Buffer.alloc(addV * 8);
  for (let i = 0; i < addV; i++) {
    const [nx, ny, nz] = micSpec.vNorms[i];
    newVertNormBytes.writeInt16LE(nx, i * 8 + 0);
    newVertNormBytes.writeInt16LE(ny, i * 8 + 2);
    newVertNormBytes.writeInt16LE(nz, i * 8 + 4);
    newVertNormBytes.writeInt16LE(0, i * 8 + 6);
  }
  const newFaceNormBytes = Buffer.alloc(addF * 8);
  for (let i = 0; i < addF; i++) {
    const [nx, ny, nz] = micSpec.faces[i].normal;
    newFaceNormBytes.writeInt16LE(nx, i * 8 + 0);
    newFaceNormBytes.writeInt16LE(ny, i * 8 + 2);
    newFaceNormBytes.writeInt16LE(nz, i * 8 + 4);
    newFaceNormBytes.writeInt16LE(0, i * 8 + 6);
  }

  // Build 18 new 36-byte POLY_FT4 / POLY_FT3 textured primitives
  const newFaceBytes = Buffer.alloc(addF * 36, 0);
  for (let i = 0; i < addF; i++) {
    const f = micSpec.faces[i];
    const o = i * 36;
    newFaceBytes.writeUInt16LE(f.quad ? 0x000F : 0x001F, o + 0);  // flags (textured quad / tri)
    newFaceBytes.writeUInt16LE(36, o + 2);                         // len = 36 B
    newFaceBytes[o + 4] = oldNV + f.idx[0];
    newFaceBytes[o + 5] = oldNV + f.idx[1];
    newFaceBytes[o + 6] = oldNV + f.idx[2];
    newFaceBytes[o + 7] = f.quad ? (oldNV + f.idx[3]) : 0;
    newFaceBytes[o + 8] = 0x80;                                    // neutral RGB lighting (1.0x)
    newFaceBytes[o + 9] = 0x80;
    newFaceBytes[o + 10] = 0x80;
    newFaceBytes[o + 11] = f.quad ? 0x2C : 0x24;                   // GPU cmd: POLY_FT4 / POLY_FT3
    newFaceBytes.writeUInt16LE(newNV + oldNF + i, o + 12);         // exact face normal index!
    newFaceBytes.writeUInt16LE(0, o + 14);
    newFaceBytes.writeUInt32LE(f.texIdx, o + 16);                  // texIdx = 6 (metallic mic atlas!)
    const nv = f.quad ? 4 : 3;
    for (let k = 0; k < nv; k++) {
      newFaceBytes[o + 20 + k * 2] = f.uvs[k][0];
      newFaceBytes[o + 21 + k * 2] = f.uvs[k][1];
    }
  }

  // Assemble rebuilt Mesh[8] header + payload
  const newMesh8Hdr = Buffer.from(origBuf.subarray(mo8, mo8 + 28));
  newMesh8Hdr.writeUInt16LE(flags, 0);
  newMesh8Hdr.writeUInt16LE(newNV, 2);
  newMesh8Hdr.writeUInt16LE(newNN, 4);
  newMesh8Hdr.writeUInt16LE(newNF, 6);

  const newMesh8 = Buffer.concat([
    newMesh8Hdr,
    oldVertBytes, newVertBytes,
    oldVertNormBytes, newVertNormBytes,
    oldFaceNormBytes, newFaceNormBytes,
    oldFaceBytes, newFaceBytes,
  ]);
  const delta = newMesh8.length - (mEnd8 - mo8);
  if (delta !== 1160) throw new Error(`Delta inesperado em Mesh[8]: ${delta} (esperado 1160)`);

  // Stitch complete .PSX file back together and shift ALL 3 offset tables by +delta!
  const outBuf = Buffer.concat([
    origBuf.subarray(0, mo8),
    newMesh8,
    origBuf.subarray(mEnd8),
  ]);

  // 1. Shift ptrMeta (+0x04)
  const newPtrMeta = origBuf.readUInt32LE(4) + delta;
  outBuf.writeUInt32LE(newPtrMeta, 4);

  // 2. Shift meshOffs[9..numMeshes-1]
  const numObjs = outBuf.readUInt32LE(8);
  const meshOffTbl = 12 + numObjs * 36 + 4;
  for (let mi = 9; mi < info.numMeshes; mi++) {
    outBuf.writeUInt32LE(origBuf.readUInt32LE(meshOffTbl + mi * 4) + delta, meshOffTbl + mi * 4);
  }

  // 3. Shift texOffs[0..numTex-1] inside relocated metadata section
  let mp = newPtrMeta;
  while (outBuf.readUInt32LE(mp) !== 0xFFFFFFFF) mp += 8 + outBuf.readUInt32LE(mp + 4);
  mp += 4;                          // skip 0xFFFFFFFF
  mp += info.numMeshes * 4;         // skip meshHashes
  const numTexRefs = outBuf.readUInt32LE(mp); mp += 4 + numTexRefs * 4;
  const numPal16 = outBuf.readUInt32LE(mp); mp += 4 + numPal16 * 36;
  const numPal256 = outBuf.readUInt32LE(mp); mp += 4 + numPal256 * 516;
  const numTex = outBuf.readUInt32LE(mp); mp += 4;
  for (let ti = 0; ti < numTex; ti++) {
    outBuf.writeUInt32LE(outBuf.readUInt32LE(mp + ti * 4) + delta, mp + ti * 4);
  }

  // Recompute exact Mesh[8] hdrBbox & rad including the protruding 3D chest microphone!
  recomputeMeshBounds(outBuf, mo8, 12);

  // Self-verify parsePsxStructure on the rebuilt .PSX!
  const verify = parsePsxStructure(outBuf);
  if (verify.textures.length !== info.textures.length) {
    throw new Error(`Falha ao validar PSX reconstruido: numTex ${verify.textures.length} != ${info.textures.length}`);
  }
  return outBuf;
}

// ============================================================================
// 7. SLUS_010.66 INLINE RENAMING (Bob Burnquist -> Silvio Santos)
// ============================================================================
function patchSlusStrings() {
  const slusPath = path.join(rootDir, 'SLUS_010.66');
  const slus = fs.readFileSync(slusPath);

  const patches = [
    { off: 0x0C44EC, max: 15, text: 'Silvio Santos',          desc: 'g_SkaterTable[1] fullName' },
    { off: 0x0C8688, max: 15, text: 'Silvio Santos',          desc: 'g_MovieTable[18] skaterName' },
    { off: 0x0A17D8, max: 23, text: "Brazil's Silvio Santos", desc: 'Bio Slot 1 line 0' },
    { off: 0x0C44FC, max:  3, text: 'Sil',                    desc: 'g_SkaterTable[1] shortName' },
    { off: 0x0C459C, max: 15, text: "Can't Stop SS",          desc: 'Deck 7 name' },
  ];

  console.log('\n=== Patching SLUS_010.66 Strings (Bob Burnquist -> Silvio Santos) ===');
  for (const p of patches) {
    const bytes = Buffer.from(p.text, 'ascii');
    if (bytes.length > p.max) throw new Error(`Overflow em ${p.desc}: ${bytes.length} > ${p.max}`);
    slus.fill(0, p.off, p.off + p.max + 1);
    bytes.copy(slus, p.off);
    console.log(`  [SLUS +0x${p.off.toString(16)}] ${p.desc.padEnd(28)} -> "${p.text}" (${bytes.length}/${p.max} B)`);
  }
  fs.writeFileSync(slusPath, slus);
}

// ============================================================================
// 8. MAIN PIPELINE
// ============================================================================
function run() {
  console.log('=== THPS2 PS1 (SLUS-01066): Bob Burnquist (Slot 1) -> SILVIO SANTOS ===');
  fs.mkdirSync(previewDir, { recursive: true });

  // 1. Portrait s2face1.bmp (WAD[369], options.pre +0x246BC, magIdx=21)
  const origFace1 = getOrigWadSlice('s2face1.bmp');
  const inner46x36 = buildSilvioPortraitInner46x36();
  const { outBmp: newFace1, previewRgba: face1Prev } = buildPortraitBmpFromInner46x36(origFace1, inner46x36, 21);
  if (newFace1.length !== 4088) throw new Error(`s2face1.bmp tamanho incorreto: ${newFace1.length}`);
  writePng(path.join(previewDir, 's2face1_preview.png'), 62, 47, face1Prev);
  console.log('  [PORTRAIT] s2face1.bmp (4,088 B, magIdx=21) gerado!');

  // 2. Shared synthesized textures
  const faceStyleA = buildSilvioFace64x64(false);
  const faceStyleB = buildSilvioFace64x64(true);
  const hairMicAtlasA = buildStyleAHairAndMicAtlas32x32();
  const hairCrownB = buildStyleBHairCrown32x32();

  const suitATorso = buildStyleASuitTorso128x64();
  const suitASleeves = buildStyleASuitSleeves32x64();
  const suitAPants = buildStyleASuitPants64x128();
  const suitAShoes = buildStyleADressShoes32x32();

  const hawaiiBTorso = buildStyleBHawaiianTorso128x64();
  const hawaiiBArms = buildStyleBArms32x64();
  const plaidBShorts = buildStyleBPlaidShorts64x64();
  const bareBShins = buildStyleBShins32x32();
  const casualBShoes = buildStyleBSneakers32x32();

  // Save texture QA sheets
  writePng(path.join(previewDir, 'tex_styleA_torso.png'), 128, 64, suitATorso);
  writePng(path.join(previewDir, 'tex_styleA_face.png'), 64, 64, faceStyleA);
  writePng(path.join(previewDir, 'tex_styleA_hair_mic.png'), 32, 32, hairMicAtlasA);
  writePng(path.join(previewDir, 'tex_styleB_torso.png'), 128, 64, hawaiiBTorso);
  writePng(path.join(previewDir, 'tex_styleB_shorts.png'), 64, 64, plaidBShorts);
  writePng(path.join(previewDir, 'tex_styleB_arms.png'), 32, 64, hawaiiBArms);

  // 3. Build 3D Chest Microphone geometry spec (23 verts w=0, 18 faces, +1,160 B!)
  const micSpec = build3DChestMicrophoneSpec();
  console.log(`  [3D MIC]   Especificacao validada: ${micSpec.verts.length} verts (w=0), ${micSpec.faces.length} faces POLY_FT3/FT4, +1,160 B exatos!`);

  // 4. Patch Style A Hi & Lo (burnq2.psx WAD[387] & burnq_l.psx WAD[1010])
  const modelsMap = new Map();
  for (const name of ['burnq2.psx', 'burnq_l.psx']) {
    const orig = getOrigWadSlice(name);
    const maxSectorBytes = Math.ceil(orig.length / 2048) * 2048;

    // Step A: Inject true 3D geometric chest microphone into Mesh[8]
    const buf = inject3DChestMicIntoPsx(orig, micSpec);
    if (buf.length > maxSectorBytes) {
      throw new Error(`${name} excedeu capacidade de setores: ${buf.length} > ${maxSectorBytes}`);
    }

    // Step B: Parse rebuilt structure, sculpt Head Mesh[15] (removes bucket hat!) + remap crown UVs to U=0..14
    const info = parsePsxStructure(buf);
    sculptStyleAHeadAndRemapCrownUv(buf, info, 15);

    // Step C: Write all Style A textures & CLUTs (preserving 0x0000 alpha ONLY on hands texIdx=4!)
    const texBy = id => info.textures.find(t => t.texIdx === id);
    writeTextureIntoPsx(buf, texBy(0), suitATorso, false);
    writeTextureIntoPsx(buf, texBy(1), suitAPants, false);
    writeTextureIntoPsx(buf, texBy(2), suitAShoes, false);
    writeTextureIntoPsx(buf, texBy(3), suitASleeves, false);
    writeTextureIntoPsx(buf, texBy(5), faceStyleA, false);
    writeTextureIntoPsx(buf, texBy(6), hairMicAtlasA, false);

    // Fair hands matching Silvio's skin tone (preserving exact original 0x0000 transparency on 16c 4bpp texIdx=4!)
    const handTex = texBy(4);
    const origHandInfo = parsePsxStructure(orig).textures.find(t => t.texIdx === 4);
    const handRgba = buildFairHands4BitRgba(orig, origHandInfo, SILVIO_SKIN);
    writeTextureIntoPsx(buf, handTex, handRgba, true);

    modelsMap.set(name, buf);
    console.log(`  [STYLE A]  ${name.padEnd(12)} -> ${orig.length} B -> ${buf.length} B (cap ${maxSectorBytes} B, folga ${maxSectorBytes - buf.length} B)`);
  }

  // 5. Patch Style B Hi & Lo (burnq2b.psx WAD[431] & burnq2bl.psx WAD[1012]) — exact Redump size!
  for (const name of ['burnq2b.psx', 'burnq2bl.psx']) {
    const orig = getOrigWadSlice(name);
    const buf = Buffer.from(orig);
    const info = parsePsxStructure(buf);
    sculptStyleBHead(buf, info, 15);

    const texBy = id => info.textures.find(t => t.texIdx === id);
    writeTextureIntoPsx(buf, texBy(0), hawaiiBTorso, false);
    writeTextureIntoPsx(buf, texBy(1), plaidBShorts, false);
    writeTextureIntoPsx(buf, texBy(2), bareBShins, false);
    writeTextureIntoPsx(buf, texBy(3), casualBShoes, false);
    writeTextureIntoPsx(buf, texBy(4), hawaiiBArms, false);
    writeTextureIntoPsx(buf, texBy(6), faceStyleB, false);
    writeTextureIntoPsx(buf, texBy(7), hairCrownB, false);

    const handTex = texBy(5);
    const origHandInfo = parsePsxStructure(orig).textures.find(t => t.texIdx === 5);
    const handRgba = buildFairHands4BitRgba(orig, origHandInfo, SILVIO_SKIN);
    writeTextureIntoPsx(buf, handTex, handRgba, true);

    modelsMap.set(name, buf);
    console.log(`  [STYLE B]  ${name.padEnd(12)} -> ${buf.length} B (tamanho exato Redump preservado!)`);
  }

  // 6. Render REAL PS1 GTE-Polarity 3D Multi-Angle QA Previews (Full Body + Close-Up Head & 3D Mic!)
  renderPs1SkaterPreview(
    modelsMap.get('burnq2.psx'),
    [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
    [{ yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: 90 }, { yaw: 180 }],
    220, 340, 0.10, 0,
    path.join(previewDir, 'silvio_styleA_body.png')
  );
  renderPs1SkaterPreview(
    modelsMap.get('burnq2.psx'),
    [7, 8, 15],
    [{ yaw: 0 }, { yaw: 30 }, { yaw: -30 }, { yaw: 60 }, { yaw: 90 }],
    220, 280, 0.25, -70,
    path.join(previewDir, 'silvio_styleA_closeup_mic.png')
  );
  renderPs1SkaterPreview(
    modelsMap.get('burnq_l.psx'),
    [7, 8, 15],
    [{ yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: 90 }],
    220, 280, 0.25, -70,
    path.join(previewDir, 'silvio_styleA_lo_mic.png')
  );
  renderPs1SkaterPreview(
    modelsMap.get('burnq2b.psx'),
    [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
    [{ yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: 90 }, { yaw: 180 }],
    220, 340, 0.10, 0,
    path.join(previewDir, 'silvio_styleB_body.png')
  );
  renderPs1SkaterPreview(
    modelsMap.get('burnq2b.psx'),
    [7, 8, 15],
    [{ yaw: 0 }, { yaw: 30 }, { yaw: -30 }, { yaw: 90 }],
    220, 280, 0.25, -70,
    path.join(previewDir, 'silvio_styleB_closeup.png')
  );
  console.log(`  [PREVIEW]  Previews 3D salvos em ${previewDir}`);

  // 7. Patch CD.WAD, options.pre & CD.HED (ONLY updating size of burnq2.psx [387] and burnq_l.psx [1010] within SAME CD sectors!)
  console.log('\n=== Gravando CD.WAD, options.pre & CD.HED (0 deslocamento de offsets!) ===');
  const curHed = fs.readFileSync(path.join(rootDir, 'CD.HED'));
  const curWad = fs.readFileSync(path.join(rootDir, 'CD.WAD'));
  const origHed = fs.readFileSync(path.join(backupDir, 'CD.HED'));

  const writeEntry = (name, newBuf, allowSameSectorGrowth = false) => {
    const h = nsHash(name);
    for (let i = 0; i < (curHed.length - 4) / 12; i++) {
      if (curHed.readUInt32LE(i * 12) === h) {
        const off = origHed.readUInt32LE(i * 12 + 4);
        const origSz = origHed.readUInt32LE(i * 12 + 8);
        const origSectors = Math.max(1, Math.ceil(origSz / 2048));
        const newSectors = Math.max(1, Math.ceil(newBuf.length / 2048));
        if (!allowSameSectorGrowth && newBuf.length !== origSz) {
          throw new Error(`Tamanho divergente para ${name}: ${newBuf.length} vs ${origSz}`);
        }
        if (newSectors !== origSectors) {
          throw new Error(`${name} mudou contagem de setores: ${origSectors} -> ${newSectors}!`);
        }
        // Zero-pad the remaining bytes in the existing sector allocation before writing
        curWad.fill(0, off, off + origSectors * 2048);
        newBuf.copy(curWad, off);
        curHed.writeUInt32LE(newBuf.length, i * 12 + 8);
        console.log(`  [CD.WAD idx=${String(i).padStart(4)} @ 0x${off.toString(16)}] ${name.padEnd(13)} (${origSz} -> ${newBuf.length} B, ${origSectors} setores intactos)`);
        return;
      }
    }
    throw new Error(`Entrada nao encontrada em CD.HED: ${name}`);
  };

  // Portrait standalone + inside options.pre
  writeEntry('s2face1.bmp', newFace1, false);
  const optH = nsHash('options.pre');
  let optOff = -1, optSz = 0;
  for (let i = 0; i < (curHed.length - 4) / 12; i++) {
    if (curHed.readUInt32LE(i * 12) === optH) {
      optOff = curHed.readUInt32LE(i * 12 + 4); optSz = curHed.readUInt32LE(i * 12 + 8); break;
    }
  }
  const optEntry = curWad.subarray(optOff, optOff + optSz);
  if (optEntry[0x246BC] !== 0x42 || optEntry[0x246BD] !== 0x4D) {
    throw new Error('Assinatura BM nao encontrada em options.pre +0x246BC!');
  }
  newFace1.copy(optEntry, 0x246BC);
  console.log('  [CD.WAD options.pre +0x246bc] s2face1.bmp (4,088 B) sincronizado!');

  // 4 Skater models
  writeEntry('burnq2.psx', modelsMap.get('burnq2.psx'), true);
  writeEntry('burnq_l.psx', modelsMap.get('burnq_l.psx'), true);
  writeEntry('burnq2b.psx', modelsMap.get('burnq2b.psx'), false);
  writeEntry('burnq2bl.psx', modelsMap.get('burnq2bl.psx'), false);

  fs.writeFileSync(path.join(rootDir, 'CD.WAD'), curWad);
  fs.writeFileSync(path.join(rootDir, 'CD.HED'), curHed);

  // 8. Patch SLUS_010.66 inline strings
  patchSlusStrings();

  console.log('\n[OK] SILVIO SANTOS (Slot 1) aplicado com sucesso! Inspecione build/_silvio_preview/ agora.');
}

// 4-bit 16-color fair-hands recolor helper (buildFairHandsRgba in lib assumes 8-bit, Bob's hands are 64x32 4-bit 16c!)
function buildFairHands4BitRgba(origPsxBuf, handTex, targetSkin) {
  const W = handTex.w, H = handTex.h;
  const rgba = Buffer.alloc(W * H * 4);
  const pal = [];
  for (let c = 0; c < handTex.palSize; c++) {
    const v = origPsxBuf.readUInt16LE(handTex.palInfo.offset + c * 2);
    pal.push([((v & 0x1F) * 255 / 31) | 0, (((v >> 5) & 0x1F) * 255 / 31) | 0, (((v >> 10) & 0x1F) * 255 / 31) | 0, v === 0 ? 0 : 255]);
  }
  const stride = Math.ceil(W / 2);
  const getIdx = (x, y) => {
    const b = origPsxBuf[handTex.dataOff + y * stride + (x >> 1)];
    return (x & 1) ? (b >> 4) : (b & 0x0F);
  };
  let sumL = 0, cntL = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = pal[getIdx(x, y)];
    if (p[3] > 0) { sumL += p[0] * 0.30 + p[1] * 0.59 + p[2] * 0.11; cntL++; }
  }
  const avgL = Math.max(40, sumL / Math.max(1, cntL));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = pal[getIdx(x, y)];
    const d = (y * W + x) * 4;
    if (p[3] === 0) {
      rgba[d] = 0; rgba[d + 1] = 0; rgba[d + 2] = 0; rgba[d + 3] = 0;
    } else {
      const lum = p[0] * 0.30 + p[1] * 0.59 + p[2] * 0.11;
      const ratio = clamp(0.84 + (lum / avgL - 0.80) * 0.75, 0.62, 1.12);
      rgba[d] = clamp(Math.round(targetSkin[0] * ratio), 24, 248);
      rgba[d + 1] = clamp(Math.round(targetSkin[1] * ratio), 20, 240);
      rgba[d + 2] = clamp(Math.round(targetSkin[2] * ratio), 16, 232);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

const SILVIO_MIC_DELTA = 1160;
const SILVIO_MIC_VERTS = 23;
const SILVIO_MIC_FACES = 18;

module.exports = { run, SILVIO_MIC_DELTA, SILVIO_MIC_VERTS, SILVIO_MIC_FACES };

if (require.main === module) {
  run();
}
