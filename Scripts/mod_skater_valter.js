#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Surgical Skater Customization: Valter Pacheco (Slot 9 / ex-Andrew Reynolds)
 *
 *  - SLUS_010.66 Renames (preserving \X\REYNOLDS.STR;1 movie path 100% intact!):
 *    * 0x0C4DB4 (16 B): "Valter Pacheco\0\0"
 *    * 0x0C4DC4 ( 8 B): "Valter\0\0"
 *    * 0x0C873C (16 B): "Valter Pacheco\0\0"
 *    * 0x0A2034 (20 B): "Valter's only been\0\0"
 *  - Portrait s2face10.bmp (SLUS 0x0C4EA0 -> CD.WAD[378] + options.pre +0x2D708, EXACT 4,088 B, magenta idx 18)
 *  - Automatic white-scratch inpainting + vintage contrast recovery on valter.jpg (1205x1606)!
 *  - 3D Head (Mesh[15] 0x1ab6ae9d across rynld2, rynld_L, rynld2b, rynld2bL):
 *    * Neat short salt-and-pepper graying hair + mustache + clean fair white skin (0x5fd59d39) + fair hands (0x8a0750ed)
 *    * Locks 100% of w != 0 neck stitches!
 *  - Style A (valter_a.png): 64x64 Torso (0x18e956c6!) blue chambray button-down dress shirt w/ brass buttons,
 *    chest pocket & black leather belt + long chambray sleeves (0xf3d8ab16) + dark navy dress trousers (0x0807c422)!
 *  - Style B (valter_b.png): 128x64 Torso (0x68e173c3) forest-green V-neck t-shirt w/ crisp white "SAN MICHEL" + yellow
 *    shopping cart (horizontally flipped for PS1 GTE!) + short green sleeve/bare white forearm + blue jeans w/ brown belt & hip ID badge!
 */

const fs = require('fs');
const path = require('path');
const {
  rootDir, clamp, lerp, probeDims, loadRgba, sampleBilinear, writePng,
  parsePsxStructure, writeTextureIntoPsx, buildFairHandsRgba,
  buildPortraitBmpFromInner46x36, recomputeMeshBounds, drawBitmapText,
  renderPs1SkaterPreview, getOrigWadSlice, patchWadAndOptionsPre,
} = require('./psx_skater_lib');

const previewDir = path.join(rootDir, 'build', '_valter_preview');
const facePath = path.join(rootDir, 'fotos_para_modificar_nos_skatistas', 'valter.jpg');
const SW = 360, SH = 480;
const faceRaw = loadRgba(facePath, SW, SH);

// Step 0: Automatic white-scratch inpainting (removes white streaks on nose & upper temples/hair!) + vintage fade restoration
const faceClean = Buffer.from(faceRaw);
for (let pass = 0; pass < 2; pass++) {
  const src = Buffer.from(faceClean);
  for (let y = Math.floor(SH * 0.06); y < Math.floor(SH * 0.72); y++) {
    for (let x = Math.floor(SW * 0.16); x < Math.floor(SW * 0.80); x++) {
      const o = (y * SW + x) * 4;
      const r = src[o], g = src[o + 1], b = src[o + 2];
      const lum = r * 0.30 + g * 0.59 + b * 0.11;
      const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));
      // Sample 16-point ring at radius 3 & 5 around pixel to get local neighborhood median
      const ring = [];
      for (const rad of [3, 5]) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const nx = clamp(Math.round(x + Math.cos(a) * rad), 0, SW - 1);
          const ny = clamp(Math.round(y + Math.sin(a) * rad), 0, SH - 1);
          const no = (ny * SW + nx) * 4;
          const nl = src[no] * 0.30 + src[no + 1] * 0.59 + src[no + 2] * 0.11;
          ring.push([nl, src[no], src[no + 1], src[no + 2]]);
        }
      }
      ring.sort((a, c) => a[0] - c[0]);
      const med = ring[6]; // Slightly lower-than-median so adjacent scratch pixels can't pull it up!
      // White photographic scratches are significantly brighter AND more neutral/white than surrounding skin/hair!
      if (lum - med[0] > 22 && sat < 0.24) {
        faceClean[o] = med[1]; faceClean[o + 1] = med[2]; faceClean[o + 2] = med[3];
      }
    }
  }
}

// Gentle vintage contrast + natural fair white skin restoration
const faceSrc = Buffer.alloc(faceClean.length);
for (let i = 0; i < SW * SH; i++) {
  const r = faceClean[i * 4], g = faceClean[i * 4 + 1], b = faceClean[i * 4 + 2];
  // Remove slight faded magenta-gray cast of vintage print -> crisp lively contrast & natural fair skin!
  const stretch = (v, lo, hi) => clamp(Math.round(((v - lo) / (hi - lo)) * 255), 10, 248);
  faceSrc[i * 4 + 0] = stretch(r, 16, 224);
  faceSrc[i * 4 + 1] = stretch(g, 18, 226);
  faceSrc[i * 4 + 2] = stretch(b, 20, 232);
  faceSrc[i * 4 + 3] = 255;
}

const VALTER_SKIN = [206, 160, 146]; // Natural fair white skin matching restored valter.jpg cheeks seamlessly
const VALTER_HAIR = [88, 86, 92];    // Short neat salt-and-pepper graying hair

// 1. Portrait 46x36 inner from scratch-repaired valter.jpg
function buildValterPortrait(origBmp) {
  const innerW = 46, innerH = 36;
  const inner = Buffer.alloc(innerW * innerH * 4);
  const x0 = SW * 0.13, x1 = SW * 0.81;
  const y0 = SH * 0.05, y1 = SH * 0.77;
  for (let y = 0; y < innerH; y++) {
    for (let x = 0; x < innerW; x++) {
      const sx = lerp(x0, x1, x / (innerW - 1));
      const sy = lerp(y0, y1, y / (innerH - 1));
      const c = sampleBilinear(faceSrc, SW, SH, sx, sy);
      const d = (y * innerW + x) * 4;
      inner[d] = c[0]; inner[d + 1] = c[1]; inner[d + 2] = c[2]; inner[d + 3] = 255;
    }
  }
  return buildPortraitBmpFromInner46x36(origBmp, inner, 18); // Verified magenta idx=18 in s2face10.bmp (Slot 9 Valter)!
}

// 2. 64x64 3D Head Texture anchored to uv_head_rynld2.png (eyes v=29, nose (32,35), mustache v=41..45, lips v=46, chin v=54)
function buildValterHead64() {
  const W = 64, H = 64, rgba = Buffer.alloc(W * H * 4);

  const hairPx = (x, y) => {
    // Organic fine-grained salt-and-pepper short graying hair (zero regular checkerboard!)
    const h1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    const noise = h1 - Math.floor(h1);
    const streak = 0.88 + 0.16 * Math.sin(x * 0.72 + Math.sin(y * 0.35) * 1.5);
    const grain = 0.78 + 0.44 * noise;
    const crown = 0.86 + 0.18 * (1 - clamp(y / 36, 0, 1));
    // Slightly more silver along temples/sides, richer charcoal-gray on crown (matching valter.jpg!)
    const templeSilver = (Math.abs(x - 31.5) > 15 && y > 16) ? 1.18 : 1.0;
    const m = streak * grain * crown * templeSilver;
    return [
      clamp(Math.round(VALTER_HAIR[0] * m), 42, 168),
      clamp(Math.round(VALTER_HAIR[1] * m), 42, 168),
      clamp(Math.round(VALTER_HAIR[2] * m), 48, 178),
    ];
  };
  const neckPx = (x, y) => {
    const ang = ((x - 31.5) / 32) * Math.PI;
    const cyl = 0.91 + 0.07 * Math.cos(ang);
    const bot = y >= 58 ? lerp(1.0, 0.88, (y - 58) / 5) : 1.0;
    const m = cyl * bot;
    return [
      clamp(Math.round(VALTER_SKIN[0] * m), 24, 248),
      clamp(Math.round(VALTER_SKIN[1] * m), 20, 236),
      clamp(Math.round(VALTER_SKIN[2] * m), 16, 226),
    ];
  };

  // Landmarks verified on grid_valter.png: hairline y=25%, eyes y=42%, nose y=52%, mustache y=56..59%, lips y=61%, chin y=69%
  const mapY = y => {
    if (y <= 16) return lerp(SH * 0.10, SH * 0.25, clamp((y - 6) / 10, 0, 1));
    if (y <= 29) return lerp(SH * 0.25, SH * 0.42, (y - 16) / 13); // forehead -> eyes
    if (y <= 36) return lerp(SH * 0.42, SH * 0.52, (y - 29) / 7);  // eyes -> nose tip
    if (y <= 46) return lerp(SH * 0.52, SH * 0.61, (y - 36) / 10); // nose -> mustache -> lips!
    if (y <= 54) return lerp(SH * 0.61, SH * 0.695, (y - 46) / 8); // lips -> chin bottom
    return lerp(SH * 0.695, SH * 0.74, clamp((y - 54) / 8, 0, 1));
  };
  const mapX = x => {
    const fx = 63 - x;
    if (fx <= 12) return SW * 0.21;
    if (fx <= 24) return lerp(SW * 0.21, SW * 0.36, (fx - 12) / 12);
    if (fx <= 31.5) return lerp(SW * 0.36, SW * 0.468, (fx - 24) / 7.5);
    if (fx <= 39) return lerp(SW * 0.468, SW * 0.57, (fx - 31.5) / 7.5);
    if (fx <= 51) return lerp(SW * 0.57, SW * 0.72, (fx - 39) / 12);
    return SW * 0.72;
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
        const fc = sampleBilinear(faceSrc, SW, SH, sx, sy);

        const sideHairAmt = clamp((36.0 - y) / 3.8, 0, 1);
        const sideBg = [
          Math.round(lerp(nk[0], hr[0], sideHairAmt)),
          Math.round(lerp(nk[1], hr[1], sideHairAmt)),
          Math.round(lerp(nk[2], hr[2], sideHairAmt)),
        ];

        let faceCol = [fc[0], fc[1], fc[2]];
        // Eliminate vintage off-white backdrop & dark jacket/plaid collar outside jawline
        const isPaperBg = Math.abs(dxC) > 12.5 && fc[0] > 185 && fc[1] > 180 && fc[2] > 170 && Math.abs(fc[0] - fc[2]) < 22;
        const isJacketLeak = y > 47 && Math.abs(dxC) > 8.5 && (fc[0] < 95 && fc[1] < 95);
        if (isPaperBg || isJacketLeak) faceCol = sideBg;

        // Clean hairline curve across top of forehead (subtle natural widow's peak)
        const hairlineY = 16.5 + Math.pow(dxC / 18.0, 2) * 2.2;
        const hairBlend = y < hairlineY ? clamp((hairlineY - y) / 2.6, 0, 1) : 0;

        // Smooth blend into fair neck under chin (y >= 50)
        if (y >= 50) {
          const nt = clamp((y - 50) / 5.5, 0, 1);
          faceCol = [Math.round(lerp(faceCol[0], nk[0], nt)), Math.round(lerp(faceCol[1], nk[1], nt)), Math.round(lerp(faceCol[2], nk[2], nt))];
        }

        // Smooth wide-feathered oval jaw contour (zero harsh lines, zero background leakage!)
        const sideHalf = (y > 35) ? lerp(17.0, 10.6, clamp((y - 35) / 18, 0, 1)) : 17.0;
        const outerT = clamp((Math.abs(dxC) - (sideHalf - 4.4)) / 4.8, 0, 1);
        const smoothT = outerT * outerT * (3 - 2 * outerT);
        const afterFh = [Math.round(lerp(faceCol[0], hr[0], hairBlend)), Math.round(lerp(faceCol[1], hr[1], hairBlend)), Math.round(lerp(faceCol[2], hr[2], hairBlend))];
        col = [Math.round(lerp(afterFh[0], sideBg[0], smoothT)), Math.round(lerp(afterFh[1], sideBg[1], smoothT)), Math.round(lerp(afterFh[2], sideBg[2], smoothT))];
      } else {
        const napeY = 35.5 + 1.4 * Math.cos(((x < 32 ? x : 64 - x) / 14) * Math.PI * 0.5);
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

// 3. STYLE A (valter_a.png): CRITICAL 64x64 TORSO (0x18e956c6, front center u=31.5!) — Blue Chambray Button-Down Dress Shirt + Brass Buttons + Black Belt!
function buildValterStyleATorso64x64() {
  const W = 64, H = 64, rgba = Buffer.alloc(W * H * 4);
  const chambray = [56, 82, 134]; // Authentic woven blue chambray from valter_a.png
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sideDist = Math.min(Math.abs(x - 16), Math.abs(x - 48));
    let sh = 0.78 + 0.24 * clamp(sideDist / 12, 0, 1);
    // Subtle fine chambray weave texture (smooth authentic woven denim/chambray at 64x64!)
    const weave = 0.96 + 0.03 * Math.sin(x * 1.6 + y * 0.5) + 0.02 * Math.cos(y * 1.3);
    let r = Math.round(chambray[0] * sh * weave), g = Math.round(chambray[1] * sh * weave), b = Math.round(chambray[2] * sh * weave);
    const dx = x - 31.5;

    // Button-down dress shirt collar + open V neck skin peek (y=0..8, |dx| <= 5)
    if (y <= 7 && Math.abs(dx) <= 6) {
      const vHalf = Math.max(0, 3.2 - y * 0.45);
      if (Math.abs(dx) <= vHalf && y <= 6) {
        r = Math.round(VALTER_SKIN[0] * 0.90); g = Math.round(VALTER_SKIN[1] * 0.90); b = Math.round(VALTER_SKIN[2] * 0.90);
      } else if (Math.abs(Math.abs(dx) - (vHalf + 2.2)) < 0.9) {
        r = Math.round(r * 0.72); g = Math.round(g * 0.72); b = Math.round(b * 0.78); // Collar fold shadow
      }
    }
    // Two miniature tan/brass button-down collar tip buttons (x=28 & x=35, y=5)
    if ((x === 28 || x === 35) && y === 5) { r = 216; g = 180; b = 88; }

    // Center vertical dress shirt placket (x=31..32, y=7..55) + 4 tan/brass shirt buttons!
    if (y >= 7 && y <= 55 && (x === 31 || x === 32)) {
      r = Math.round(r * (x === 31 ? 0.76 : 1.06));
      g = Math.round(g * (x === 31 ? 0.76 : 1.06));
      b = Math.round(b * (x === 31 ? 0.80 : 1.08));
    }
    if (x === 31 && (y === 14 || y === 26 || y === 38 || y === 49)) { r = 224; g = 188; b = 96; }

    // Subtle chest pocket on wearer's left chest (= PS1 viewer's RIGHT -> x=23..28, y=16..26!)
    if (x >= 23 && x <= 28 && y >= 16 && y <= 26) {
      if (y === 16 || y === 26 || x === 23 || x === 28) { r = Math.round(r * 0.74); g = Math.round(g * 0.74); b = Math.round(b * 0.78); }
      else { r = Math.round(r * 1.06); g = Math.round(g * 1.06); b = Math.round(b * 1.08); }
    }

    // Sleek black leather dress belt + brushed silver buckle across bottom hem (y >= 56)
    if (y >= 56) {
      const isBuckle = Math.abs(dx) <= 2.2 && y >= 57 && y <= 62;
      r = isBuckle ? 148 : 22; g = isBuckle ? 152 : 22; b = isBuckle ? 160 : 26;
    }

    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 12, 248); rgba[d + 1] = clamp(g, 12, 248); rgba[d + 2] = clamp(b, 14, 250); rgba[d + 3] = 255;
  }
  return rgba;
}

// Long blue chambray dress shirt sleeves (y=0..63) with tailored shirt cuff & brass button!
function buildValterStyleASleeves32x64() {
  const W = 32, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.80 + 0.22 * Math.sin((x / W) * Math.PI);
    const weave = 0.93 + 0.07 * Math.sin(x * 1.8 + y * 0.7);
    const cuff = y === 56 ? 0.74 : (y > 56 ? 1.06 : 1.0);
    let r = Math.round(56 * cyl * weave * cuff), g = Math.round(82 * cyl * weave * cuff), b = Math.round(134 * cyl * weave * cuff);
    if (x >= 14 && x <= 16 && y >= 59 && y <= 60) { r = 216; g = 180; b = 88; } // Brass cuff button!
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 12, 245); rgba[d + 1] = clamp(g, 16, 245); rgba[d + 2] = clamp(b, 22, 248); rgba[d + 3] = 255;
  }
  return rgba;
}

// Tailored dark navy dress trousers (64x128) with black belt + silver buckle!
function buildValterStyleAPants64x128() {
  const W = 64, H = 128, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.78 + 0.24 * Math.sin((x / W) * Math.PI);
    const crease = Math.abs(x - 32) <= 2 ? 1.12 : 1.0;
    let r = Math.round(24 * cyl * crease), g = Math.round(36 * cyl * crease), b = Math.round(72 * cyl * crease);
    if (y <= 7) {
      const isBuckle = Math.abs(x - 32) <= 3 && y >= 1 && y <= 6;
      r = isBuckle ? 148 : 22; g = isBuckle ? 152 : 22; b = isBuckle ? 160 : 26;
    }
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 12, 225); rgba[d + 1] = clamp(g, 14, 225); rgba[d + 2] = clamp(b, 20, 235); rgba[d + 3] = 255;
  }
  return rgba;
}

function buildValterShoe32x32(isStyleB = false) {
  const W = 32, H = 32, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (y * W + x) * 4;
    if (isStyleB && y >= 24) { rgba[d] = 212; rgba[d + 1] = 214; rgba[d + 2] = 218; rgba[d + 3] = 255; }
    else {
      const sh = 0.80 + 0.24 * Math.sin((x / W) * Math.PI);
      rgba[d] = clamp(Math.round(30 * sh), 12, 86);
      rgba[d + 1] = clamp(Math.round(28 * sh), 12, 82);
      rgba[d + 2] = clamp(Math.round(30 * sh), 12, 86);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// 4. STYLE B (valter_b.png): 128x64 Torso (0x68e173c3) Forest-Green V-Neck T-Shirt "SAN MICHEL" + Yellow Cart + Classic Blue Jeans w/ Brown Belt & Hip ID!
function buildValterStyleBTorso128x64() {
  const W = 128, H = 64, rgba = Buffer.alloc(W * H * 4);
  const green = [24, 72, 46]; // Deep San Michel forest-green cotton from valter_b.png
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sideDist = Math.min(Math.abs(x - 32), Math.abs(x - 96));
    let sh = 0.78 + 0.24 * clamp(sideDist / 24, 0, 1);
    sh *= 0.95 + 0.05 * Math.sin(x * 0.28 + y * 0.22);
    let r = Math.round(green[0] * sh), g = Math.round(green[1] * sh), b = Math.round(green[2] * sh);
    const dx = x - 64;

    // Clean V-neck collar opening (y=0..10) + fair skin peek inside V!
    if (y <= 11 && Math.abs(dx) <= 10) {
      const vHalf = Math.max(0, 7.6 - y * 0.78);
      if (Math.abs(dx) <= vHalf && y <= 8) {
        r = Math.round(VALTER_SKIN[0] * 0.92); g = Math.round(VALTER_SKIN[1] * 0.92); b = Math.round(VALTER_SKIN[2] * 0.92);
      } else if (Math.abs(Math.abs(dx) - (vHalf + 1.4)) < 1.2) {
        r = Math.round(r * 0.72); g = Math.round(g * 0.72); b = Math.round(b * 0.72);
      }
    }

    // Golden-yellow shopping cart icon to viewer's RIGHT of "SAN" (viewer's right = smaller u -> x=49..53, y=12..17!)
    // Basket (x=49..52, y=13..15), angled handle (x=53, y=12), two wheels (x=49,52, y=17)
    const isCartBasket = (x >= 49 && x <= 52 && (y === 13 || y === 15)) || ((x === 49 || x === 52) && y === 14);
    const isCartHandle = (x === 53 && y === 12);
    const isCartWheels = ((x === 49 || x === 52) && y === 17);
    if (isCartBasket || isCartHandle || isCartWheels) { r = 228; g = 212; b = 52; }

    // Golden-yellow horizontal underline bar directly under "MICHEL" (x=47..65, y=26)
    if (x >= 47 && x <= 65 && y === 26) { r = 224; g = 206; b = 52; }

    // Subtle brown leather belt band peeking at bottom hem (y >= 61)
    if (y >= 61) {
      const isBuckle = Math.abs(dx) <= 3;
      r = isBuckle ? 162 : 76; g = isBuckle ? 166 : 44; b = isBuckle ? 174 : 28;
    }

    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 10, 250); rgba[d + 1] = clamp(g, 12, 250); rgba[d + 2] = clamp(b, 10, 250); rgba[d + 3] = 255;
  }
  // Crisp white "SAN" (cx=60, y=13) + "MICHEL" (cx=56, y=20, maxWidth=19) horizontally flipped so it reads LEFT-TO-RIGHT on PS1!
  drawBitmapText(rgba, W, H, 'SAN', 60, 13, [242, 246, 244], { flipX: true, scaleX: 1, scaleY: 1, gap: 1 });
  drawBitmapText(rgba, W, H, 'MICHEL', 56, 20, [242, 246, 244], { flipX: true, scaleX: 1, scaleY: 1, gap: 1, maxWidth: 19 });
  return rgba;
}

// Short forest-green t-shirt sleeve (y=0..28) + bare fair white forearm (y=29..63)
function buildValterStyleBSleeves32x64() {
  const W = 32, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.80 + 0.22 * Math.sin((x / W) * Math.PI);
    const d = (y * W + x) * 4;
    if (y < 29) {
      const hem = y >= 27 ? 0.74 : 1.0;
      const m = cyl * hem;
      rgba[d] = clamp(Math.round(24 * m), 10, 110);
      rgba[d + 1] = clamp(Math.round(72 * m), 18, 160);
      rgba[d + 2] = clamp(Math.round(46 * m), 14, 130);
      rgba[d + 3] = 255;
    } else {
      const cuffShadow = y < 32 ? lerp(0.76, 1.0, (y - 29) / 3) : 1.0;
      const m = cyl * cuffShadow;
      rgba[d] = clamp(Math.round(VALTER_SKIN[0] * m), 24, 248);
      rgba[d + 1] = clamp(Math.round(VALTER_SKIN[1] * m), 20, 236);
      rgba[d + 2] = clamp(Math.round(VALTER_SKIN[2] * m), 16, 226);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// Classic medium-dark blue denim jeans (64x128) with brown leather belt, silver buckle & white/green corporate ID badge on hip!
function buildValterStyleBJeans64x128() {
  const W = 64, H = 128, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.78 + 0.24 * Math.sin((x / W) * Math.PI);
    const weave = 0.94 + 0.06 * Math.sin(x * 1.6 + y * 0.9);
    const fade = (y >= 26 && y <= 66 && x >= 18 && x <= 46) ? 1.15 : 1.0;
    let r = Math.round(38 * cyl * weave * fade), g = Math.round(62 * cyl * weave * fade), b = Math.round(108 * cyl * weave * fade);

    // Dark brown leather belt + brushed silver buckle across waist (y=0..8)
    if (y <= 8) {
      const isBuckle = Math.abs(x - 32) <= 4 && y >= 1 && y <= 7;
      r = isBuckle ? 168 : 78; g = isBuckle ? 172 : 44; b = isBuckle ? 180 : 28;
    }
    // White & green San Michel corporate ID badge clipped at outer hip pocket (x=48..57, y=10..27)
    if (x >= 48 && x <= 57 && y >= 10 && y <= 27) {
      if (y <= 14) { r = 28; g = 76; b = 48; } // Forest-green ID top stripe
      else if (x === 48 || x === 57 || y === 27) { r = 172; g = 176; b = 182; }
      else { r = 234; g = 236; b = 240; }
    }
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 12, 245); rgba[d + 1] = clamp(g, 14, 245); rgba[d + 2] = clamp(b, 16, 248); rgba[d + 3] = 255;
  }
  return rgba;
}

// 5. 3D Head Sculpt for Valter Pacheco (HEAD Mesh[15] 0x1ab6ae9d: neat short haircut + mature facial balance; w!=0 LOCKED!)
function sculptValterHead(buf, info, headMi) {
  const mo = info.meshOffs[headMi];
  const nVerts = buf.readUInt16LE(mo + 2);
  const vOff = mo + 28;
  for (let v = 0; v < nVerts; v++) {
    const vo = vOff + v * 8;
    let x = buf.readInt16LE(vo), y = buf.readInt16LE(vo + 2), z = buf.readInt16LE(vo + 4);
    const w = buf.readUInt16LE(vo + 6);
    if (w !== 0) continue; // STRICTLY LOCK 100% of w=1/w=2 neck seam stitches!

    // Trim Andrew Reynolds' longer side/back hair cleanly into Valter's neat short salt-and-pepper cut
    if (z > 30 && y > -150 && y < 40) z = Math.round(z * 0.93);
    if (Math.abs(x) > 125 && y > -130 && y < 30) x = Math.round(x * 0.95);
    // Clean fuller rounded crown
    if (y < -150) y = Math.round(y - 8 * clamp((-150 - y) / 100, 0, 1));

    buf.writeInt16LE(x, vo);
    buf.writeInt16LE(y, vo + 2);
    buf.writeInt16LE(z, vo + 4);
  }
  recomputeMeshBounds(buf, mo, 8);
  return { nVerts };
}

// 6. Rename Andrew Reynolds -> Valter Pacheco in SLUS_010.66 (exact NUL-padded in-place patches!)
function patchSlusValterNames() {
  const slusPath = path.join(rootDir, 'SLUS_010.66');
  const slus = fs.readFileSync(slusPath);
  const patches = [
    { off: 0x0C4DB4, len: 16, str: 'Valter Pacheco', expectOld: ['Andrew Reynolds', 'Valter Pacheco'] },
    { off: 0x0C4DC4, len: 8,  str: 'Valter',         expectOld: ['Andrew', 'Valter'] },
    { off: 0x0C873C, len: 16, str: 'Valter Pacheco', expectOld: ['Andrew Reynolds', 'Valter Pacheco'] },
    { off: 0x0A2034, len: 20, str: "Valter's only been", expectOld: ["Andrew's only been", "Valter's only been"] },
  ];
  for (const p of patches) {
    const cur = slus.subarray(p.off, p.off + p.len).toString('latin1').replace(/\0+$/, '');
    if (!p.expectOld.includes(cur)) throw new Error(`String inesperada em SLUS 0x${p.off.toString(16)}: "${cur}"`);
    slus.fill(0, p.off, p.off + p.len);
    slus.write(p.str, p.off, 'latin1');
    console.log(`  [SLUS_010.66 @ 0x${p.off.toString(16)}] "${cur}" -> "${p.str}" (${p.str.length}/${p.len - 1} B)`);
  }
  fs.writeFileSync(slusPath, slus);
}

// ============================================================================
// MAIN (--preview or full apply)
// ============================================================================
const previewOnly = process.argv.includes('--preview');
console.log('=== VALTER PACHECO (Slot 9, ex-Andrew Reynolds: rynld2, rynld_L, rynld2b, rynld2bL + s2face10.bmp + SLUS) ===');
const portrait = buildValterPortrait(getOrigWadSlice('s2face10.bmp'));
const head64 = buildValterHead64();
const torsoA = buildValterStyleATorso64x64();
const sleeveA = buildValterStyleASleeves32x64();
const pantsA = buildValterStyleAPants64x128();
const shoeA = buildValterShoe32x32(false);
const torsoB = buildValterStyleBTorso128x64();
const sleeveB = buildValterStyleBSleeves32x64();
const jeansB = buildValterStyleBJeans64x128();
const shoeB = buildValterShoe32x32(true);

const HEAD_HASH = 0x1ab6ae9d, HAND_PAL = 0x8a0750ed;
const modelSpecs = [
  { name: 'rynld2.psx',   texMap: { 0x18e956c6: torsoA, 0x0807c422: pantsA, 0x5fd59d39: head64, 0xf3d8ab16: sleeveA, 0x8acfcde0: shoeA } },
  { name: 'rynld_L.psx',  texMap: { 0x18e956c6: torsoA, 0x0807c422: pantsA, 0x5fd59d39: head64, 0xf3d8ab16: sleeveA, 0x8acfcde0: shoeA } },
  { name: 'rynld2b.psx',  texMap: { 0x68e173c3: torsoB, 0xc34e2152: jeansB, 0x5fd59d39: head64, 0xcb631f54: sleeveB, 0x8acfcde0: shoeB } },
  { name: 'rynld2bL.psx', texMap: { 0x68e173c3: torsoB, 0xc34e2152: jeansB, 0x5fd59d39: head64, 0xcb631f54: sleeveB, 0x8acfcde0: shoeB } },
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
      writeTextureIntoPsx(buf, t, buildFairHandsRgba(buf, t, VALTER_SKIN), true); rep++;
    } else if (sp.texMap[t.palId]) {
      writeTextureIntoPsx(buf, t, sp.texMap[t.palId], false); rep++;
    }
  }
  const sc = sculptValterHead(buf, info, headMi);
  modified.set(sp.name, buf);
  console.log(`  [OK] ${sp.name.padEnd(13)} | ${buf.length} B | ${rep} texturas BGR555 + HEAD M[${headMi}] (${sc.nVerts}v)`);
}

fs.mkdirSync(previewDir, { recursive: true });
writePng(path.join(previewDir, 'preview_valter_repaired_photo.png'), SW, SH, faceSrc);
writePng(path.join(previewDir, 'preview_s2face10.png'), 62, 47, portrait.previewRgba);
writePng(path.join(previewDir, 'preview_head_64x64.png'), 64, 64, head64);
renderPs1SkaterPreview(modified.get('rynld2.psx'), [0, 7, 8, 15], [{ yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: -90 }, { yaw: 180 }], 150, 220, 0.14, 0, path.join(previewDir, 'preview_valter_styleA_ps1.png'));
renderPs1SkaterPreview(modified.get('rynld2b.psx'), [0, 7, 8, 15], [{ yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: -90 }, { yaw: 180 }], 150, 220, 0.14, 0, path.join(previewDir, 'preview_valter_styleB_ps1.png'));
renderPs1SkaterPreview(modified.get('rynld2.psx'), [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [{ yaw: 0 }, { yaw: 35 }, { yaw: 180 }], 150, 260, 0.085, 0, path.join(previewDir, 'preview_valter_fullA.png'));
renderPs1SkaterPreview(modified.get('rynld2b.psx'), [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [{ yaw: 0 }, { yaw: 35 }, { yaw: 180 }], 150, 260, 0.085, 0, path.join(previewDir, 'preview_valter_fullB.png'));
console.log(`Previews salvos em: ${previewDir}`);

if (!previewOnly) {
  patchSlusValterNames();
  patchWadAndOptionsPre({ portraitName: 's2face10.bmp', portraitBuf: portrait.outBmp, preOffset: 0x2D708, modelsMap: modified });
  console.log('=== VALTER PACHECO APLICADO EM SLUS_010.66 + CD.WAD + options.pre COM 100% DE PRECISAO! ===');
}
