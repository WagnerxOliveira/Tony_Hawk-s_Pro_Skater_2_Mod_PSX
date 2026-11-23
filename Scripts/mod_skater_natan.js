#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Surgical Skater Customization: Natan Oliver (Slot 10 / Geoff Rowley base)
 *
 *  - Portrait s2face10.bmp (CD.WAD[378] + options.pre +0x2D708, EXACT 4,088 B, magenta idx 18)
 *  - 3D Head (Mesh[15] 0xba25cbf5 across rowley2, rowley_L, rowley2b, rowly2bL):
 *    * Sharp frontal 3x4 natan.jpg (847x804) -> clean fair white skin + short dark upswept hair + 360° neck!
 *    * Updates BOTH Style A head (0xdce93a50) & Style B head (0x775fc79d) + fair white hands (0x5ceb082c)
 *    * Sculpts Natan's neat short-hair crown & athletic jawline (100% w != 0 stitches strictly locked!)
 *  - Style A (textura_natan.png): Clean royal-blue crew-neck t-shirt + red V-lanyard + white ID badge
 *    + crisp white "LACTA" chest logo (horizontally flipped for PS1 GTE!) + short blue sleeve / bare white
 *    forearm with gold watch + dark indigo jeans (64x64) + black sneakers with white sole!
 *  - Style B (textura_natan_b.png): Sharp black 2-button tailored suit + white dress shirt + crimson silk tie
 *    + notched lapels + pocket square + full-length black sleeves with crisp white cuffs + black dress trousers & shoes!
 */

const fs = require('fs');
const path = require('path');
const {
  rootDir, clamp, lerp, probeDims, loadRgba, sampleBilinear, writePng,
  parsePsxStructure, writeTextureIntoPsx, buildFairHandsRgba,
  buildPortraitBmpFromInner46x36, recomputeMeshBounds, drawBitmapText,
  renderPs1SkaterPreview, getOrigWadSlice, patchWadAndOptionsPre,
} = require('./psx_skater_lib');

const previewDir = path.join(rootDir, 'build', '_natan_preview');
const facePath = path.join(rootDir, 'fotos_para_modificar_nos_skatistas', 'natan.jpg');
const faceDims = probeDims(facePath);
const faceRaw = loadRgba(facePath, faceDims.w, faceDims.h);

// Subtle clean studio lift on natan.jpg -> bright crisp fair white skin!
const faceSrc = Buffer.alloc(faceRaw.length);
for (let i = 0; i < faceDims.w * faceDims.h; i++) {
  const r = faceRaw[i * 4], g = faceRaw[i * 4 + 1], b = faceRaw[i * 4 + 2];
  faceSrc[i * 4 + 0] = clamp(Math.round(r * 1.04 + 6), 8, 250);
  faceSrc[i * 4 + 1] = clamp(Math.round(g * 1.05 + 6), 8, 246);
  faceSrc[i * 4 + 2] = clamp(Math.round(b * 1.07 + 6), 8, 244);
  faceSrc[i * 4 + 3] = 255;
}

const NATAN_SKIN = [206, 162, 136]; // Clean natural fair white skin matching natan.jpg cheeks seamlessly
const NATAN_HAIR = [44, 34, 28];    // Short dark-brown upswept hair

// 1. Portrait 46x36 inner from sharp frontal 3x4 natan.jpg
function buildNatanPortrait(origBmp) {
  const innerW = 46, innerH = 36;
  const inner = Buffer.alloc(innerW * innerH * 4);
  const x0 = faceDims.w * 0.14, x1 = faceDims.w * 0.86;
  const y0 = faceDims.h * 0.02, y1 = faceDims.h * 0.91;
  for (let y = 0; y < innerH; y++) {
    for (let x = 0; x < innerW; x++) {
      const sx = lerp(x0, x1, x / (innerW - 1));
      const sy = lerp(y0, y1, y / (innerH - 1));
      const c = sampleBilinear(faceSrc, faceDims.w, faceDims.h, sx, sy);
      const d = (y * innerW + x) * 4;
      inner[d] = c[0]; inner[d + 1] = c[1]; inner[d + 2] = c[2]; inner[d + 3] = 255;
    }
  }
  return buildPortraitBmpFromInner46x36(origBmp, inner, 18); // Verified magenta idx=18 in s2face10.bmp!
}

// 2. 64x64 3D Head Texture anchored to uv_head_rowley2.png (eyes v=29, nose (31,38), lips v=46, chin v=54)
function buildNatanHead64() {
  const W = 64, H = 64, rgba = Buffer.alloc(W * H * 4);
  const w = faceDims.w, h = faceDims.h;

  const hairPx = (x, y) => {
    const strand = 0.84 + 0.20 * Math.sin(x * 0.88 + y * 0.25);
    const crown = 0.86 + 0.18 * (1 - clamp(y / 36, 0, 1));
    return [
      clamp(Math.round(NATAN_HAIR[0] * strand * crown), 16, 110),
      clamp(Math.round(NATAN_HAIR[1] * strand * crown), 14, 96),
      clamp(Math.round(NATAN_HAIR[2] * strand * crown), 12, 86),
    ];
  };
  const neckPx = (x, y) => {
    const ang = ((x - 31.5) / 32) * Math.PI;
    const cyl = 0.91 + 0.07 * Math.cos(ang);
    const bot = y >= 58 ? lerp(1.0, 0.88, (y - 58) / 5) : 1.0;
    const m = cyl * bot;
    return [
      clamp(Math.round(NATAN_SKIN[0] * m), 24, 248),
      clamp(Math.round(NATAN_SKIN[1] * m), 20, 236),
      clamp(Math.round(NATAN_SKIN[2] * m), 16, 224),
    ];
  };

  // Landmarks verified on grid_natan.png (847x804): hairline y=24%, eyes y=49%, nose y=62%, lips y=73%, chin y=86%
  const mapY = y => {
    if (y <= 16) return lerp(h * 0.08, h * 0.24, clamp((y - 6) / 10, 0, 1));
    if (y <= 29) return lerp(h * 0.24, h * 0.49, (y - 16) / 13); // forehead -> pupils
    if (y <= 38) return lerp(h * 0.49, h * 0.62, (y - 29) / 9);  // pupils -> nose tip
    if (y <= 46) return lerp(h * 0.62, h * 0.73, (y - 38) / 8);  // nose -> lips
    if (y <= 54) return lerp(h * 0.73, h * 0.86, (y - 46) / 8);  // lips -> chin bottom
    return lerp(h * 0.86, h * 0.93, clamp((y - 54) / 8, 0, 1));
  };
  const mapX = x => {
    const fx = 63 - x;
    if (fx <= 12) return w * 0.21;
    if (fx <= 23) return lerp(w * 0.21, w * 0.37, (fx - 12) / 11);
    if (fx <= 31.5) return lerp(w * 0.37, w * 0.48, (fx - 23) / 8.5);
    if (fx <= 40) return lerp(w * 0.48, w * 0.585, (fx - 31.5) / 8.5);
    if (fx <= 51) return lerp(w * 0.585, w * 0.76, (fx - 40) / 11);
    return w * 0.76;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dxC = x - 31.5;
      const hr = hairPx(x, y), nk = neckPx(x, y);
      let col;

      if (y < 15) {
        col = hr;
      } else if (x >= 11 && x <= 52 && y >= 15 && y <= 57) {
        const sx = mapX(x), sy = mapY(y);
        const fc = sampleBilinear(faceSrc, w, h, sx, sy);

        const sideHairAmt = clamp((36.5 - y) / 3.8, 0, 1);
        const sideBg = [
          Math.round(lerp(nk[0], hr[0], sideHairAmt)),
          Math.round(lerp(nk[1], hr[1], sideHairAmt)),
          Math.round(lerp(nk[2], hr[2], sideHairAmt)),
        ];

        let faceCol = [fc[0], fc[1], fc[2]];
        // Eliminate light-gray studio paper background & dark jacket/striped shirt collar outside jawline
        const isGrayStudioBg = Math.abs(dxC) > 12.5 && Math.abs(fc[0] - fc[2]) < 14 && fc[1] > 165;
        const isCollarLeak = y > 44 && Math.abs(dxC) > 7.5 && (fc[2] >= fc[0] - 8 || (fc[0] < 95 && fc[1] < 95));
        if (isGrayStudioBg || isCollarLeak) faceCol = sideBg;

        // Clean hairline curve across top of forehead
        const hairlineY = 16.2 + Math.pow(dxC / 18.0, 2) * 2.2;
        const hairBlend = y < hairlineY ? clamp((hairlineY - y) / 2.6, 0, 1) : 0;

        // Smooth blend into fair neck under chin (y >= 50)
        if (y >= 50) {
          const nt = clamp((y - 50) / 5.5, 0, 1);
          faceCol = [Math.round(lerp(faceCol[0], nk[0], nt)), Math.round(lerp(faceCol[1], nk[1], nt)), Math.round(lerp(faceCol[2], nk[2], nt))];
        }

        // Smooth wide-feathered oval jaw contour (zero harsh edges, zero studio-paper leakage!)
        const sideHalf = (y > 35) ? lerp(17.0, 10.6, clamp((y - 35) / 18, 0, 1)) : 17.0;
        const outerT = clamp((Math.abs(dxC) - (sideHalf - 4.4)) / 4.8, 0, 1);
        const smoothT = outerT * outerT * (3 - 2 * outerT);
        const afterFh = [Math.round(lerp(faceCol[0], hr[0], hairBlend)), Math.round(lerp(faceCol[1], hr[1], hairBlend)), Math.round(lerp(faceCol[2], hr[2], hairBlend))];
        col = [Math.round(lerp(afterFh[0], sideBg[0], smoothT)), Math.round(lerp(afterFh[1], sideBg[1], smoothT)), Math.round(lerp(afterFh[2], sideBg[2], smoothT))];
      } else {
        const napeY = 36.0 + 1.4 * Math.cos(((x < 32 ? x : 64 - x) / 14) * Math.PI * 0.5);
        if (y <= napeY - 1.5) col = hr;
        else if (y < napeY + 2.5) {
          const t = clamp((y - (napeY - 1.5)) / 4.0, 0, 1);
          col = [Math.round(lerp(hr[0], nk[0], t)), Math.round(lerp(hr[1], nk[1], t)), Math.round(lerp(hr[2], nk[2], t))];
        } else col = nk;
      }
      const d = (y * W + x) * 4;
      rgba[d] = clamp(col[0], 8, 250); rgba[d + 1] = clamp(col[1], 8, 250); rgba[d + 2] = clamp(col[2], 8, 250); rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// 3. STYLE A (textura_natan.png): Clean Royal-Blue T-Shirt + Red V-Lanyard + White ID Badge + White "LACTA" + Dark Jeans + Sneakers
function buildNatanStyleATorso128x64() {
  const W = 128, H = 64, rgba = Buffer.alloc(W * H * 4);
  const blue = [18, 42, 134]; // Crisp corporate royal-blue from textura_natan.png
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sideDist = Math.min(Math.abs(x - 32), Math.abs(x - 96));
    let sh = 0.78 + 0.24 * clamp(sideDist / 24, 0, 1);
    sh *= 0.95 + 0.05 * Math.sin(x * 0.30 + y * 0.18);
    let r = Math.round(blue[0] * sh), g = Math.round(blue[1] * sh), b = Math.round(blue[2] * sh);
    const dx = x - 64;

    // Crew-neck rib collar + subtle fair neck peek at top front center
    if (y <= 4) {
      if (Math.abs(dx) <= 6 && y <= 2) { r = Math.round(NATAN_SKIN[0] * 0.90); g = Math.round(NATAN_SKIN[1] * 0.90); b = Math.round(NATAN_SKIN[2] * 0.90); }
      else { r = Math.round(r * 0.76); g = Math.round(g * 0.76); b = Math.round(b * 0.82); }
    }

    // Red corporate V-lanyard descending symmetrically from neck to badge clip at (x=64, y=26)!
    if (y >= 1 && y <= 27 && Math.abs(dx) <= 14) {
      const targetX = Math.max(0, 8.8 * (1 - y / 26.0));
      if (Math.abs(Math.abs(dx) - targetX) <= 1.25) {
        const isStripe = (y % 4 === 0);
        r = isStripe ? 236 : 196; g = isStripe ? 165 : 28; b = isStripe ? 165 : 34;
      }
    }
    // Silver lanyard clasp (x=63..65, y=26..28) + Crisp white corporate ID badge (x=60..68, y=29..39)
    if (y >= 26 && y <= 28 && Math.abs(dx) <= 1.2) { r = 185; g = 192; b = 200; }
    if (x >= 60 && x <= 68 && y >= 29 && y <= 39) {
      if (y <= 31) { r = 192; g = 34; b = 40; } // Red Lacta/Mondelez header bar on ID badge
      else if (x === 60 || x === 68 || y === 39) { r = 165; g = 170; b = 180; }
      else if (y >= 34 && y <= 36 && x >= 62 && x <= 66) { r = 110; g = 115; b = 128; } // Badge text lines
      else { r = 240; g = 242; b = 246; }
    }
    // Red lanyard looping subtly behind back of collar (x < 14 or x > 114, y=3..5)
    if ((x < 14 || x > 114) && y >= 3 && y <= 4) { r = 186; g = 28; b = 34; }

    // Curved white Lacta smile swoosh under "LACTA" (wearer's left chest = PS1 viewer's right -> x=48..60, y=21..22)
    if (x >= 48 && x <= 60) {
      const curveY = 21.0 + 0.9 * Math.sin(((x - 48) / 12) * Math.PI);
      if (Math.abs(y - curveY) <= 0.72) { r = 240; g = 242; b = 246; }
    }

    if (y >= 61) { r = Math.round(r * 0.78); g = Math.round(g * 0.78); b = Math.round(b * 0.84); }
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 8, 250); rgba[d + 1] = clamp(g, 8, 250); rgba[d + 2] = clamp(b, 8, 250); rgba[d + 3] = 255;
  }
  // Crisp white "LACTA" on wearer's left chest (= PS1 viewer's RIGHT -> cx=54, y=14, 100% flat on chest!)
  drawBitmapText(rgba, W, H, 'LACTA', 54, 14, [244, 246, 250], { flipX: true, scaleX: 1, scaleY: 1, gap: 1, maxWidth: 13 });
  return rgba;
}

// Short royal-blue sleeve (y=0..28) + bare fair white forearm + classy gold watch near wrist (y=55..58)!
function buildNatanStyleASleeves32x64() {
  const W = 32, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.80 + 0.22 * Math.sin((x / W) * Math.PI);
    const d = (y * W + x) * 4;
    if (y < 29) {
      const hem = y >= 27 ? 0.74 : 1.0;
      const m = cyl * hem;
      rgba[d] = clamp(Math.round(18 * m), 10, 120);
      rgba[d + 1] = clamp(Math.round(42 * m), 14, 160);
      rgba[d + 2] = clamp(Math.round(134 * m), 30, 235);
      rgba[d + 3] = 255;
    } else if (y >= 55 && y <= 58) { // Gold wristwatch matching textura_natan.png!
      const isDial = (x >= 12 && x <= 19 && y >= 55 && y <= 58);
      rgba[d] = isDial ? 235 : 196; rgba[d + 1] = isDial ? 204 : 158; rgba[d + 2] = isDial ? 102 : 68; rgba[d + 3] = 255;
    } else {
      const cuffShadow = y < 32 ? lerp(0.76, 1.0, (y - 29) / 3) : 1.0;
      const m = cyl * cuffShadow;
      rgba[d] = clamp(Math.round(NATAN_SKIN[0] * m), 24, 248);
      rgba[d + 1] = clamp(Math.round(NATAN_SKIN[1] * m), 20, 236);
      rgba[d + 2] = clamp(Math.round(NATAN_SKIN[2] * m), 16, 224);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

function buildNatanStyleAJeans64x64() {
  const W = 64, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.78 + 0.24 * Math.sin((x / W) * Math.PI);
    const weave = 0.94 + 0.06 * Math.sin(x * 1.5 + y * 1.1);
    const thighHighlight = (y >= 14 && y <= 34 && x >= 18 && x <= 46) ? 1.16 : 1.0;
    const m = cyl * weave * thighHighlight;
    let r = Math.round(24 * m), g = Math.round(36 * m), b = Math.round(68 * m);
    if (y <= 4 || x === 31) { r = Math.round(r * 0.75); g = Math.round(g * 0.75); b = Math.round(b * 0.78); }
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 12, 230); rgba[d + 1] = clamp(g, 16, 235); rgba[d + 2] = clamp(b, 24, 245); rgba[d + 3] = 255;
  }
  return rgba;
}

function buildNatanStyleAShoe32x32() {
  const W = 32, H = 32, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (y * W + x) * 4;
    if (y >= 24) { rgba[d] = 232; rgba[d + 1] = 234; rgba[d + 2] = 238; rgba[d + 3] = 255; }
    else {
      const sh = 0.82 + 0.20 * Math.sin((x / W) * Math.PI);
      rgba[d] = clamp(Math.round(28 * sh), 12, 84);
      rgba[d + 1] = clamp(Math.round(28 * sh), 12, 84);
      rgba[d + 2] = clamp(Math.round(32 * sh), 14, 90);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// 4. STYLE B (textura_natan_b.png): Sharp Black 2-Button Tailored Suit + White Shirt + Crimson Tie + Full Black Sleeves w/ White Cuffs + Dress Trousers & Shoes
function buildNatanStyleBTorso128x64() {
  const W = 128, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sideDist = Math.min(Math.abs(x - 32), Math.abs(x - 96));
    const sh = 0.78 + 0.24 * clamp(sideDist / 24, 0, 1);
    // Rich tailored matte charcoal-black wool suit (never hits 0x0000!)
    let r = Math.round(30 * sh), g = Math.round(30 * sh), b = Math.round(34 * sh);
    const dx = x - 64;

    // White dress shirt V-opening (y=0..33)
    const vHalf = Math.max(0, 10.0 - y * 0.31);
    if (y <= 33 && Math.abs(dx) <= vHalf) {
      const shirtSh = 0.90 + 0.10 * Math.cos((dx / 10) * Math.PI * 0.5);
      r = Math.round(240 * shirtSh); g = Math.round(242 * shirtSh); b = Math.round(246 * shirtSh);
      // Subtle crisp dress collar diagonal seam (y=2..9)
      if (Math.abs(y - (5.5 - Math.abs(dx) * 0.35)) < 0.85 && Math.abs(dx) >= 2.2) { r = 198; g = 202; b = 210; }
      // Rich crimson/burgundy silk tie (Windsor knot at y=4..9, sleek blade y=9..33)
      const tieHalf = y <= 8 ? lerp(3.4, 1.6, clamp((y - 3) / 5, 0, 1)) : lerp(1.7, 3.0, clamp((y - 8) / 22, 0, 1));
      if (y >= 3 && Math.abs(dx) <= tieHalf) {
        const silk = 0.76 + 0.32 * Math.cos((dx / Math.max(1, tieHalf)) * Math.PI * 0.5);
        r = clamp(Math.round(168 * silk), 48, 224);
        g = clamp(Math.round(24 * silk), 12, 72);
        b = clamp(Math.round(30 * silk), 14, 80);
      }
    } else if (y <= 35 && Math.abs(dx) > vHalf && Math.abs(dx) <= vHalf + 4.8) {
      // Tailored notched suit jacket lapels (slightly satin highlight + outer seam)
      const isEdge = Math.abs(Math.abs(dx) - (vHalf + 4.5)) < 0.8;
      r = isEdge ? 18 : 40; g = isEdge ? 18 : 40; b = isEdge ? 22 : 46;
    }

    // Center jacket closure + 2 tailored dark suit buttons (y=36 & y=48)
    if (y >= 34 && y <= 58 && Math.abs(dx) <= 0.7) { r = 18; g = 18; b = 22; }
    if ((Math.hypot(dx - 0.5, y - 36) <= 1.6) || (Math.hypot(dx - 0.5, y - 48) <= 1.6)) { r = 68; g = 70; b = 78; }

    // Tiny crimson tie tip & subtle jacket bottom cutaway notch (y >= 56, |dx| <= 4)
    if (y >= 57 && Math.abs(dx) <= (y - 55) * 0.9) {
      if (Math.abs(dx) <= 1.4 && y <= 61) { r = 148; g = 22; b = 28; }
      else { r = 20; g = 20; b = 24; }
    }

    // Breast welt pocket + folded dark pocket square on wearer's left chest (= PS1 viewer's RIGHT -> x=48..55, y=16..20!)
    if (x >= 48 && x <= 55 && y === 19) { r = 52; g = 54; b = 62; }
    if (x >= 49 && x <= 54 && y >= 16 && y <= 18 && Math.abs(x - 51.5) <= (y - 15.5) * 1.4) { r = 48; g = 52; b = 66; }

    // Side flap hip pockets (x=45..56 and x=72..83, y=46..48)
    if (((x >= 45 && x <= 56) || (x >= 72 && x <= 83)) && (y === 46 || y === 47)) { r = 46; g = 46; b = 52; }

    // Crisp white dress collar band peeking across back of neck (x < 12 or x > 116, y <= 2)
    if ((x < 12 || x > 116) && y <= 2) { r = 236; g = 238; b = 242; }

    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 12, 250); rgba[d + 1] = clamp(g, 12, 250); rgba[d + 2] = clamp(b, 14, 250); rgba[d + 3] = 255;
  }
  return rgba;
}

// Full-length tailored black suit sleeves (y=0..56) + crisp white dress shirt cuff peeking at wrist (y=57..63)!
function buildNatanStyleBSleeves32x64() {
  const W = 32, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.80 + 0.22 * Math.sin((x / W) * Math.PI);
    const d = (y * W + x) * 4;
    if (y >= 57) { // Crisp white dress shirt cuff!
      const m = cyl * (y === 57 ? 0.82 : 1.0);
      rgba[d] = clamp(Math.round(238 * m), 170, 250);
      rgba[d + 1] = clamp(Math.round(240 * m), 172, 250);
      rgba[d + 2] = clamp(Math.round(244 * m), 176, 250);
      rgba[d + 3] = 255;
    } else {
      const m = cyl * (0.94 + 0.06 * Math.sin(y * 0.32));
      rgba[d] = clamp(Math.round(30 * m), 12, 76);
      rgba[d + 1] = clamp(Math.round(30 * m), 12, 76);
      rgba[d + 2] = clamp(Math.round(34 * m), 14, 82);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

function buildNatanStyleBPants64x128() {
  const W = 64, H = 128, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.78 + 0.24 * Math.sin((x / W) * Math.PI);
    // Crisp tailored vertical center trouser crease highlight
    const crease = Math.abs(x - 32) <= 2 ? 1.16 : 1.0;
    let r = Math.round(28 * cyl * crease), g = Math.round(28 * cyl * crease), b = Math.round(32 * cyl * crease);
    if (y <= 6) { // Black leather dress belt + subtle silver buckle
      const isBuckle = Math.abs(x - 32) <= 3 && y >= 1 && y <= 5;
      r = isBuckle ? 148 : 20; g = isBuckle ? 152 : 20; b = isBuckle ? 160 : 24;
    }
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 12, 220); rgba[d + 1] = clamp(g, 12, 220); rgba[d + 2] = clamp(b, 14, 225); rgba[d + 3] = 255;
  }
  return rgba;
}

function buildNatanStyleBShoe32x64() {
  const W = 32, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (y * W + x) * 4;
    // Polished black leather dress shoe with specular sheen
    const sheen = 0.78 + 0.34 * Math.pow(Math.sin((x / W) * Math.PI), 2);
    const sole = y >= 54 ? 0.65 : 1.0;
    rgba[d] = clamp(Math.round(28 * sheen * sole), 12, 88);
    rgba[d + 1] = clamp(Math.round(28 * sheen * sole), 12, 88);
    rgba[d + 2] = clamp(Math.round(32 * sheen * sole), 14, 94);
    rgba[d + 3] = 255;
  }
  return rgba;
}

// 5. 3D Head Sculpt for Natan Oliver (HEAD Mesh[15] 0xba25cbf5: neat short upswept crown + crisp jawline; w!=0 LOCKED!)
function sculptNatanHead(buf, info, headMi) {
  const mo = info.meshOffs[headMi];
  const nVerts = buf.readUInt16LE(mo + 2);
  const vOff = mo + 28;
  for (let v = 0; v < nVerts; v++) {
    const vo = vOff + v * 8;
    let x = buf.readInt16LE(vo), y = buf.readInt16LE(vo + 2), z = buf.readInt16LE(vo + 4);
    const w = buf.readUInt16LE(vo + 6);
    if (w !== 0) continue; // STRICTLY LOCK 100% of w=1/w=2 neck seam stitches!

    // Trim Geoff Rowley's shaggy side/back hair into Natan's neat short athletic haircut with slight top lift!
    if (y < -150) {
      const t = clamp((-150 - y) / 110, 0, 1);
      y = Math.round(y - 12 * t);       // neat upswept top hair
      x = Math.round(x * (1 - 0.05 * t)); // cleaner closely-trimmed sides
    }
    if (z > 40 && y > -150 && y < 40) {
      z = Math.round(z * 0.94); // trim shaggy back hair cleanly
    }
    buf.writeInt16LE(x, vo);
    buf.writeInt16LE(y, vo + 2);
    buf.writeInt16LE(z, vo + 4);
  }
  recomputeMeshBounds(buf, mo, 8);
  return { nVerts };
}

// ============================================================================
// MAIN (--preview or full apply)
// ============================================================================
const previewOnly = process.argv.includes('--preview');
console.log('=== NATAN OLIVER (Slot 10: rowley2, rowley_L, rowley2b, rowly2bL + s2face10.bmp) ===');
const portrait = buildNatanPortrait(getOrigWadSlice('s2face10.bmp'));
const head64 = buildNatanHead64();
const torsoA = buildNatanStyleATorso128x64();
const sleeveA = buildNatanStyleASleeves32x64();
const jeansA = buildNatanStyleAJeans64x64();
const shoeA = buildNatanStyleAShoe32x32();
const torsoB = buildNatanStyleBTorso128x64();
const sleeveB = buildNatanStyleBSleeves32x64();
const pantsB = buildNatanStyleBPants64x128();
const shoeB = buildNatanStyleBShoe32x64();

const HEAD_HASH = 0xba25cbf5, HAND_PAL = 0x5ceb082c;
const modelSpecs = [
  { name: 'rowley2.psx',  texMap: { 0x3ebcf7e8: torsoA, 0x3c3290ac: jeansA, 0xdce93a50: head64, 0x0e7a7687: sleeveA, 0xb13b6fa4: shoeA } },
  { name: 'rowley_L.psx', texMap: { 0x3ebcf7e8: torsoA, 0x3c3290ac: jeansA, 0xdce93a50: head64, 0x0e7a7687: sleeveA, 0xb13b6fa4: shoeA } },
  { name: 'rowley2b.psx', texMap: { 0x19ddcb4b: torsoB, 0xdedcbe8f: pantsB, 0x775fc79d: head64, 0x48c0229e: sleeveB, 0xea6a239c: shoeB } },
  { name: 'rowly2bL.psx', texMap: { 0x19ddcb4b: torsoB, 0xdedcbe8f: pantsB, 0x775fc79d: head64, 0x48c0229e: sleeveB, 0xea6a239c: shoeB } },
];

const modified = new Map();
for (const sp of modelSpecs) {
  const buf = getOrigWadSlice(sp.name);
  const info = parsePsxStructure(buf);
  const headMi = info.meshHashes.indexOf(HEAD_HASH);
  if (headMi < 0) throw new Error(`HEAD nao encontrado em ${sp.name}`);
  let rep = 0;
  for (const t of info.textures) {
    if (t.palId === HAND_PAL) {
      writeTextureIntoPsx(buf, t, buildFairHandsRgba(buf, t, NATAN_SKIN), true); rep++;
    } else if (sp.texMap[t.palId]) {
      writeTextureIntoPsx(buf, t, sp.texMap[t.palId], false); rep++;
    }
  }
  const sc = sculptNatanHead(buf, info, headMi);
  modified.set(sp.name, buf);
  console.log(`  [OK] ${sp.name.padEnd(13)} | ${buf.length} B | ${rep} texturas BGR555 + HEAD M[${headMi}] (${sc.nVerts}v)`);
}

fs.mkdirSync(previewDir, { recursive: true });
writePng(path.join(previewDir, 'preview_s2face10.png'), 62, 47, portrait.previewRgba);
writePng(path.join(previewDir, 'preview_head_64x64.png'), 64, 64, head64);
renderPs1SkaterPreview(modified.get('rowley2.psx'), [0, 7, 8, 15], [{ yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: -90 }, { yaw: 180 }], 150, 220, 0.14, 0, path.join(previewDir, 'preview_natan_styleA_ps1.png'));
renderPs1SkaterPreview(modified.get('rowley2b.psx'), [0, 7, 8, 15], [{ yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: -90 }, { yaw: 180 }], 150, 220, 0.14, 0, path.join(previewDir, 'preview_natan_styleB_ps1.png'));
renderPs1SkaterPreview(modified.get('rowley2.psx'), [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [{ yaw: 0 }, { yaw: 35 }, { yaw: 180 }], 150, 260, 0.085, 0, path.join(previewDir, 'preview_natan_fullA.png'));
renderPs1SkaterPreview(modified.get('rowley2b.psx'), [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [{ yaw: 0 }, { yaw: 35 }, { yaw: 180 }], 150, 260, 0.085, 0, path.join(previewDir, 'preview_natan_fullB.png'));
console.log(`Previews salvos em: ${previewDir}`);

if (!previewOnly) {
  patchWadAndOptionsPre({ portraitName: 's2face10.bmp', portraitBuf: portrait.outBmp, preOffset: 0x2D708, modelsMap: modified });
  console.log('=== NATAN OLIVER APLICADO EM CD.WAD + options.pre COM 100% DE PRECISAO! ===');
}
