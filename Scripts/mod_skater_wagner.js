#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Surgical Skater Customization: Wagner Oliver (Slot 4 / Rune Glifberg base)
 *
 *  - Portrait s2face4.bmp (CD.WAD[372] + options.pre +0x276D4, EXACT 4,088 B, magenta idx 26)
 *  - 3D Head (Mesh[15] 0xe15f10ff across glif2, glif_L, glif2b, glif2b_L):
 *    * Collapses Rune Glifberg's 3D backwards-sideways sun visor (v[34,44,45] Hi / v[27,31] Lo) to zero area!
 *    * Sculpts balanced cranium & Wagner's facial proportions (locking 100% of w != 0 neck stitches!)
 *    * White-balanced fair skin tone from wagner.png (207x238) + short dark hair + 360° fair neck & hands!
 *  - Style A (textura_wagner_a.png): Burgundy hoodie "CIENCIA DA COMPUTACAO" + light distressed jeans + black/tan slip-ons
 *  - Style B (textura_wagner_b.png): Navy tactical Police uniform + "POLICJA" long sleeves + cargo pants + tactical boots
 */

const fs = require('fs');
const path = require('path');
const {
  rootDir, clamp, lerp, probeDims, loadRgba, sampleBilinear, writePng,
  parsePsxStructure, writeTextureIntoPsx, buildFairHandsRgba,
  buildPortraitBmpFromInner46x36, recomputeMeshBounds, drawBitmapText,
  renderPs1SkaterPreview, getOrigWadSlice, patchWadAndOptionsPre,
} = require('./psx_skater_lib');

const previewDir = path.join(rootDir, 'build', '_wagner_preview');
const facePath = path.join(rootDir, 'fotos_para_modificar_nos_skatistas', 'wagner.png');
const outfitAPath = path.join(rootDir, 'texturas_para_colocar_nos_skatistas', 'textura_wagner_a.png');
const outfitBPath = path.join(rootDir, 'texturas_para_colocar_nos_skatistas', 'textura_wagner_b.png');

const faceDims = probeDims(facePath);
const faceRaw = loadRgba(facePath, faceDims.w, faceDims.h);
const outADims = probeDims(outfitAPath);
const outARgba = loadRgba(outfitAPath, outADims.w, outADims.h);
const outBDims = probeDims(outfitBPath);
const outBRgba = loadRgba(outfitBPath, outBDims.w, outBDims.h);

// Neutralize warm indoor tungsten lighting of wagner.png into clean natural fair white skin!
const faceSrc = Buffer.alloc(faceRaw.length);
for (let i = 0; i < faceDims.w * faceDims.h; i++) {
  const r = faceRaw[i * 4], g = faceRaw[i * 4 + 1], b = faceRaw[i * 4 + 2];
  // Warm indoor white-balance lift (removes orange tungsten cast -> natural fair white skin!)
  faceSrc[i * 4 + 0] = clamp(Math.round(r * 1.08 + 14), 8, 250);
  faceSrc[i * 4 + 1] = clamp(Math.round(g * 1.28 + 18), 8, 246);
  faceSrc[i * 4 + 2] = clamp(Math.round(b * 1.54 + 22), 8, 244);
  faceSrc[i * 4 + 3] = 255;
}

const WAGNER_SKIN = [202, 156, 132]; // Natural fair white skin tone matching balanced wagner.png cheeks seamlessly!
const WAGNER_HAIR = [38, 30, 26];    // Short dark-brown/black hair

// 1. Portrait 46x36 inner from balanced wagner.png (tightly framed on face & hair!)
function buildWagnerPortrait(origBmp) {
  const innerW = 46, innerH = 36;
  const inner = Buffer.alloc(innerW * innerH * 4);
  // Crop around head (x=14%..88%, y=2%..96%)
  const x0 = faceDims.w * 0.12, x1 = faceDims.w * 0.89;
  const y0 = faceDims.h * 0.01, y1 = faceDims.h * 0.96;
  for (let y = 0; y < innerH; y++) {
    for (let x = 0; x < innerW; x++) {
      const sx = lerp(x0, x1, x / (innerW - 1));
      const sy = lerp(y0, y1, y / (innerH - 1));
      const c = sampleBilinear(faceSrc, faceDims.w, faceDims.h, sx, sy);
      const d = (y * innerW + x) * 4;
      inner[d] = c[0]; inner[d + 1] = c[1]; inner[d + 2] = c[2]; inner[d + 3] = 255;
    }
  }
  return buildPortraitBmpFromInner46x36(origBmp, inner, 26); // Verified magenta idx=26 in s2face4.bmp!
}

// 2. 64x64 3D Head Texture anchored to uv_head_glif2.png (pupils v=28, nose (31.5,38), mouth v=46, chin v=54)
function buildWagnerHead64() {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  const w = faceDims.w, h = faceDims.h;

  const hairPx = (x, y) => {
    const strand = 0.86 + 0.18 * Math.sin(x * 0.75 + y * 0.32);
    const shade = 0.86 + 0.18 * (1 - clamp(y / 36, 0, 1));
    return [
      clamp(Math.round(WAGNER_HAIR[0] * strand * shade), 16, 110),
      clamp(Math.round(WAGNER_HAIR[1] * strand * shade), 14, 96),
      clamp(Math.round(WAGNER_HAIR[2] * strand * shade), 12, 88),
    ];
  };
  const neckPx = (x, y) => {
    const ang = ((x - 31.5) / 32) * Math.PI;
    const cyl = 0.92 + 0.06 * Math.cos(ang);
    const nape = (y >= 35 && y <= 41 && Math.abs(x - 31.5) > 13) ? lerp(0.84, 1.0, (y - 35) / 6) : 1.0;
    const bot = y >= 58 ? lerp(1.0, 0.88, (y - 58) / 5) : 1.0;
    const m = cyl * nape * bot;
    return [
      clamp(Math.round(WAGNER_SKIN[0] * m), 24, 248),
      clamp(Math.round(WAGNER_SKIN[1] * m), 20, 236),
      clamp(Math.round(WAGNER_SKIN[2] * m), 16, 224),
    ];
  };

  // Piecewise vertical landmark map: dst_v -> src_y in wagner.png (207x238)
  const mapY = y => {
    if (y <= 16) return lerp(h * 0.04, h * 0.18, clamp((y - 6) / 10, 0, 1));
    if (y <= 28) return lerp(h * 0.18, h * 0.44, (y - 16) / 12); // forehead -> pupils
    if (y <= 38) return lerp(h * 0.44, h * 0.58, (y - 28) / 10); // pupils -> nose tip
    if (y <= 46) return lerp(h * 0.58, h * 0.75, (y - 38) / 8);  // nose -> open mouth center
    if (y <= 54) return lerp(h * 0.75, h * 0.91, (y - 46) / 8);  // mouth -> chin bottom
    return lerp(h * 0.91, h * 0.98, clamp((y - 54) / 8, 0, 1));
  };
  // Horizontal landmark map (symmetrized around nose x=48.5% = 100.4px; note PS1 mirrors X so mirror srcX!)
  const mapX = x => {
    // Flip horizontally so Wagner's slight gaze/part matches photo naturally on PS1 screen!
    const fx = 63 - x;
    if (fx <= 12) return w * 0.14;
    if (fx <= 24) return lerp(w * 0.16, w * 0.35, (fx - 12) / 12);
    if (fx <= 31.5) return lerp(w * 0.35, w * 0.485, (fx - 24) / 7.5);
    if (fx <= 39) return lerp(w * 0.485, w * 0.625, (fx - 31.5) / 7.5);
    if (fx <= 51) return lerp(w * 0.625, w * 0.85, (fx - 39) / 12);
    return w * 0.86;
  };

  // Detect brown wooden door / bright cream wall background on outer sides of wagner.png
  const isWoodDoorBg = (rawC, sx) => {
    const [r, g, b] = rawC;
    if (sx < w * 0.16 && r > 170 && g > 140) return true; // bright cream wall on far left
    // Brown wood door is darker & more orange-brown than illuminated face skin
    if ((sx < w * 0.22 || sx > w * 0.80) && r < 150 && g < 92 && b < 55) return true;
    return false;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dxC = x - 31.5;
      const hr = hairPx(x, y), nk = neckPx(x, y);
      let col;

      if (y < 14) {
        col = hr;
      } else if (x >= 11 && x <= 52 && y >= 14 && y <= 57) {
        const sx = mapX(x), sy = mapY(y);
        const fc = sampleBilinear(faceSrc, w, h, sx, sy);
        const fcRaw = sampleBilinear(faceRaw, w, h, sx, sy);

        const sideHairAmt = clamp((36.5 - y) / 3.5, 0, 1);
        const sideBg = [
          Math.round(lerp(nk[0], hr[0], sideHairAmt)),
          Math.round(lerp(nk[1], hr[1], sideHairAmt)),
          Math.round(lerp(nk[2], hr[2], sideHairAmt)),
        ];

        let faceCol = [fc[0], fc[1], fc[2]];
        if (Math.abs(dxC) > 13.5 && isWoodDoorBg(fcRaw, sx)) faceCol = sideBg;

        // Forehead hairline curve
        const hairlineY = 16.0 + Math.pow(dxC / 18.0, 2) * 2.4;
        const hairBlend = y < hairlineY ? clamp((hairlineY - y) / 2.5, 0, 1) : 0;

        // Smooth blend to fair neck under chin (y >= 50)
        if (y >= 50) {
          const nt = clamp((y - 50) / 6.0, 0, 1);
          faceCol = [Math.round(lerp(faceCol[0], nk[0], nt)), Math.round(lerp(faceCol[1], nk[1], nt)), Math.round(lerp(faceCol[2], nk[2], nt))];
        }

        // Smooth wide-feathered oval jaw contour (zero vertical cliffs, zero wood-door streaks!)
        const sideHalf = (y > 35) ? lerp(17.0, 11.2, clamp((y - 35) / 19, 0, 1)) : 17.0;
        const outerT = clamp((Math.abs(dxC) - (sideHalf - 4.8)) / 5.0, 0, 1);
        const smoothT = outerT * outerT * (3 - 2 * outerT);
        const afterFh = [Math.round(lerp(faceCol[0], hr[0], hairBlend)), Math.round(lerp(faceCol[1], hr[1], hairBlend)), Math.round(lerp(faceCol[2], hr[2], hairBlend))];
        col = [Math.round(lerp(afterFh[0], sideBg[0], smoothT)), Math.round(lerp(afterFh[1], sideBg[1], smoothT)), Math.round(lerp(afterFh[2], sideBg[2], smoothT))];
      } else {
        const napeY = 35.0 + 1.2 * Math.cos(((x < 32 ? x : 64 - x) / 14) * Math.PI * 0.5);
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

// 3. STYLE A (textura_wagner_a.png): Burgundy Hoodie "CIENCIA DA COMPUTACAO" + Distressed Light Jeans + Slip-ons
function buildWagnerStyleATorso128x64() {
  const W = 128, H = 64;
  const rgba = Buffer.alloc(W * H * 4);
  const base = [92, 16, 30]; // Rich burgundy hoodie sampled from textura_wagner_a.png
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sideDist = Math.min(Math.abs(x - 32), Math.abs(x - 96));
      let shade = 0.78 + 0.24 * clamp(sideDist / 24, 0, 1);
      shade *= 0.94 + 0.06 * Math.sin(x * 0.28 + y * 0.14);
      // Ribbed hoodie waistband at bottom (y >= 58)
      if (y >= 58) shade *= (x % 2 === 0 ? 0.76 : 0.88);
      let r = Math.round(base[0] * shade), g = Math.round(base[1] * shade), b = Math.round(base[2] * shade);

      const dx = x - 64;
      // Front hood collar folds at top center (y <= 9, |dx| <= 13)
      if (y <= 9 && Math.abs(dx) <= 13) {
        const vEdge = Math.abs(Math.abs(dx) - (11 - y * 0.9));
        if (vEdge < 1.3) { r = Math.round(r * 0.58); g = Math.round(g * 0.58); b = Math.round(b * 0.58); }
        else if (Math.abs(dx) < Math.max(0, 6 - y * 0.8)) {
          // Fair neck peek inside V of hoodie
          r = Math.round(WAGNER_SKIN[0] * 0.88); g = Math.round(WAGNER_SKIN[1] * 0.88); b = Math.round(WAGNER_SKIN[2] * 0.88);
        }
      }
      // Back hood resting across upper shoulders (x < 22 or x > 106, y <= 18)
      if ((x < 22 || x > 106) && y <= 18) {
        const edge = y >= 16 ? 0.65 : 1.08;
        r = Math.round(r * edge); g = Math.round(g * edge); b = Math.round(b * edge);
      }
      // Front kangaroo pocket seams (x=46..82, y=38..56)
      if (x >= 46 && x <= 82 && y >= 38 && y <= 56) {
        const isTop = (y === 38 && Math.abs(dx) <= 14);
        const slopeX = 14 + (y - 38) * 0.28;
        const isSlant = Math.abs(Math.abs(dx) - slopeX) < 1.0 && y >= 38 && y <= 55;
        if (isTop || isSlant) { r = Math.round(r * 0.60); g = Math.round(g * 0.60); b = Math.round(b * 0.60); }
        else if (Math.abs(dx) < slopeX) { r = Math.round(r * 0.94); g = Math.round(g * 0.94); b = Math.round(g * 0.94); }
      }
      // Circular white gear badge on lower-right of kangaroo pocket (viewer's right = PS1 u≈52, y=49!)
      const distBadge = Math.hypot(x - 52, y - 49);
      if (distBadge <= 3.6) {
        if (distBadge >= 1.7) { r = 238; g = 238; b = 240; }
        else { r = 64; g = 18; b = 28; }
      }

      const d = (y * W + x) * 4;
      rgba[d] = clamp(r, 8, 250); rgba[d + 1] = clamp(g, 8, 250); rgba[d + 2] = clamp(b, 8, 250); rgba[d + 3] = 255;
    }
  }
  // Crisp white "CIENCIA" / "DA" / "COMPUTACAO" horizontally flipped & fitted inside flat front chest (u=48..80)!
  drawBitmapText(rgba, W, H, 'CIENCIA', 64, 14, [242, 242, 245], { flipX: true, scaleX: 1, scaleY: 1, gap: 1, maxWidth: 27 });
  drawBitmapText(rgba, W, H, 'DA', 64, 21, [242, 242, 245], { flipX: true, scaleX: 1, scaleY: 1, gap: 1 });
  drawBitmapText(rgba, W, H, 'COMPUTACAO', 64, 28, [242, 242, 245], { flipX: true, scaleX: 1, scaleY: 1, gap: 1, maxWidth: 32 });
  return rgba;
}

function buildWagnerStyleASleeves32x64() {
  const W = 32, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.80 + 0.22 * Math.sin((x / W) * Math.PI);
    const fold = 0.92 + 0.08 * Math.sin(y * 0.45);
    const cuff = y >= 56 ? (x % 2 === 0 ? 0.78 : 0.90) : 1.0;
    const m = cyl * fold * cuff;
    const d = (y * W + x) * 4;
    rgba[d] = clamp(Math.round(92 * m), 8, 245);
    rgba[d + 1] = clamp(Math.round(16 * m), 8, 245);
    rgba[d + 2] = clamp(Math.round(30 * m), 8, 245);
    rgba[d + 3] = 255;
  }
  return rgba;
}

// 100% full-length light distressed blue jeans (fills y=0..63 completely -> eliminates Rune Glifberg's bare shins!)
function buildWagnerStyleAJeans128x64() {
  const W = 128, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // Sample authentic faded blue denim from textura_wagner_a.png (x=34..102, y=170..275)
    const sx = 38 + ((x * 0.9) % 62);
    const sy = 175 + (y / (H - 1)) * 96;
    const s = sampleBilinear(outARgba, outADims.w, outADims.h, sx, sy);
    // Keep clean blue denim tone (guard against any dark gap between legs!)
    const isGap = s[0] + s[1] + s[2] < 160 || (s[2] < s[0] + 6);
    let r = isGap ? 118 : s[0], g = isGap ? 142 : s[1], b = isGap ? 174 : s[2];
    const weave = 0.95 + 0.05 * Math.sin(x * 1.9 + y * 1.1);
    const cyl = 0.84 + 0.18 * Math.sin(((x % 64) / 64) * Math.PI);
    r = Math.round(r * weave * cyl); g = Math.round(g * weave * cyl); b = Math.round(b * weave * cyl);
    // Subtle white distressed tear on knee area (x=46..54, y=34..39)
    if (x >= 47 && x <= 53 && y >= 34 && y <= 38 && (y % 2 === 0)) { r = 215; g = 218; b = 224; }
    // Rolled denim cuff at ankle hem (y >= 60)
    if (y >= 60) { r = Math.round(r * 0.78); g = Math.round(g * 0.78); b = Math.round(b * 0.82); }
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 12, 248); rgba[d + 1] = clamp(g, 12, 248); rgba[d + 2] = clamp(b, 12, 248); rgba[d + 3] = 255;
  }
  return rgba;
}

function buildWagnerStyleAShoe32x16() {
  const W = 32, H = 16, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (y * W + x) * 4;
    if (y >= 11) { // Tan/beige vulcanized sole
      rgba[d] = 192; rgba[d + 1] = 172; rgba[d + 2] = 136; rgba[d + 3] = 255;
    } else { // Matte black slip-on canvas upper
      const sh = 0.82 + 0.20 * Math.sin((x / W) * Math.PI);
      rgba[d] = Math.round(32 * sh); rgba[d + 1] = Math.round(32 * sh); rgba[d + 2] = Math.round(36 * sh); rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// 4. STYLE B (textura_wagner_b.png): Navy Tactical Police Uniform + "POLICJA" Sleeves + Cargo Pants + Combat Boots
function buildWagnerStyleBTorso128x64() {
  const W = 128, H = 64, rgba = Buffer.alloc(W * H * 4);
  const navy = [28, 36, 70];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sideDist = Math.min(Math.abs(x - 32), Math.abs(x - 96));
    let sh = 0.80 + 0.22 * clamp(sideDist / 24, 0, 1);
    sh *= 0.95 + 0.05 * Math.sin(x * 0.35 + y * 0.22);
    let r = Math.round(navy[0] * sh), g = Math.round(navy[1] * sh), b = Math.round(navy[2] * sh);
    const dx = x - 64;

    // Center tactical zip/button placket (|dx| <= 1.5)
    if (Math.abs(dx) <= 1.5 && y <= 52) { r = Math.round(r * 0.72); g = Math.round(g * 0.72); b = Math.round(b * 0.75); }
    // Two tactical chest flap pockets (x=45..59 and x=69..83, y=14..28)
    if (((x >= 45 && x <= 59) || (x >= 69 && x <= 83)) && y >= 14 && y <= 28) {
      const isFlap = (y === 14 || y === 19 || x === 45 || x === 59 || x === 69 || x === 83 || y === 28);
      if (isFlap) { r = Math.round(r * 0.58); g = Math.round(g * 0.58); b = Math.round(b * 0.62); }
      else if (y < 19) { r = Math.round(r * 1.12); g = Math.round(g * 1.12); b = Math.round(b * 1.15); }
    }
    // White name tag above wearer's right chest pocket (PS1 viewer's left -> x=71..82, y=10..12)
    if (x >= 71 && x <= 82 && y >= 10 && y <= 12) { r = 216; g = 222; b = 232; }
    // Blue pen tucked into wearer's left pocket (PS1 viewer's right -> x=56..57, y=11..15)
    if ((x === 56 || x === 57) && y >= 11 && y <= 15) { r = 46; g = 92; b = 235; }
    // Shoulder epaulets (y <= 5)
    if (y <= 4 && (Math.abs(dx) >= 16 && Math.abs(dx) <= 28)) { r = Math.round(r * 0.74); g = Math.round(g * 0.74); b = Math.round(b * 0.80); }
    // Heavy black tactical duty belt + buckle + holster pouches along waist (y >= 53)
    if (y >= 53) {
      const isBuckle = Math.abs(dx) <= 4 && y >= 55 && y <= 61;
      const isPouch = (Math.abs(dx) >= 16 && Math.abs(dx) <= 26) && y >= 54;
      if (isBuckle) { r = 68; g = 72; b = 80; }
      else if (isPouch) { r = 18; g = 20; b = 24; }
      else { r = 24; g = 26; b = 32; }
    }
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 8, 250); rgba[d + 1] = clamp(g, 8, 250); rgba[d + 2] = clamp(b, 8, 250); rgba[d + 3] = 255;
  }
  return rgba;
}

function buildWagnerStyleBSleeves32x64() {
  const W = 32, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.80 + 0.22 * Math.sin((x / W) * Math.PI);
    const fold = 0.94 + 0.06 * Math.sin(y * 0.4);
    let r = Math.round(28 * cyl * fold), g = Math.round(36 * cyl * fold), b = Math.round(70 * cyl * fold);
    // Dark navy shoulder patch & white "POLICJA" tab (y=7..13, x=4..27)
    if (y >= 7 && y <= 13 && x >= 4 && x <= 27) {
      const border = (y === 7 || y === 13 || x === 4 || x === 27);
      if (border) { r = 16; g = 20; b = 38; }
      else { r = 34; g = 44; b = 82; }
    }
    // Dark shield patch below tab (y=16..24, x=11..21)
    if (Math.hypot((x - 16) / 5.2, (y - 20) / 4.5) <= 1.0) { r = 18; g = 22; b = 34; }
    // Wrist cuff seam (y >= 58)
    if (y === 58) { r = 16; g = 20; b = 40; }
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 8, 245); rgba[d + 1] = clamp(g, 8, 245); rgba[d + 2] = clamp(b, 8, 245); rgba[d + 3] = 255;
  }
  drawBitmapText(rgba, W, H, 'POLICJA', 16, 8, [238, 240, 246], { flipX: false, scaleX: 1, scaleY: 1, gap: 0 });
  return rgba;
}

function buildWagnerStyleBPants64x64() {
  const W = 64, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.80 + 0.22 * Math.sin((x / W) * Math.PI);
    const crease = 0.94 + 0.06 * Math.cos(((x / W) * 2 - 1) * Math.PI * 2);
    let r = Math.round(28 * cyl * crease), g = Math.round(36 * cyl * crease), b = Math.round(70 * cyl * crease);
    // Side tactical cargo pocket (x=10..24 & x=40..54, y=20..36)
    if (((x >= 10 && x <= 24) || (x >= 40 && x <= 54)) && y >= 20 && y <= 36) {
      if (y === 20 || y === 24 || y === 36 || x === 10 || x === 24 || x === 40 || x === 54) {
        r = Math.round(r * 0.62); g = Math.round(g * 0.62); b = Math.round(b * 0.68);
      } else if (y === 22) { // small silver text/stitch on cargo flap
        r = 140; g = 148; b = 172;
      }
    }
    if (y < 4) { r = 20; g = 22; b = 28; } // tactical belt waistband
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 8, 245); rgba[d + 1] = clamp(g, 8, 245); rgba[d + 2] = clamp(b, 8, 245); rgba[d + 3] = 255;
  }
  return rgba;
}

function buildWagnerStyleBBoots32x16() {
  const W = 32, H = 16, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sh = 0.78 + 0.25 * Math.sin((x / W) * Math.PI);
    const sole = y >= 12 ? 0.68 : 1.0;
    const d = (y * W + x) * 4;
    rgba[d] = clamp(Math.round(28 * sh * sole), 10, 80);
    rgba[d + 1] = clamp(Math.round(30 * sh * sole), 10, 82);
    rgba[d + 2] = clamp(Math.round(34 * sh * sole), 12, 88);
    rgba[d + 3] = 255;
  }
  return rgba;
}

// 5. Sculpt HEAD Mesh[15] (0xe15f10ff) — collapses Rune Glifberg's 3D visor & contours Wagner's clean skull/face!
function sculptWagnerHead(buf, info, headMeshIdx) {
  const mo = info.meshOffs[headMeshIdx];
  const nVerts = buf.readUInt16LE(mo + 2);
  const vOff = mo + 28;
  const isHi = (nVerts === 48), isLo = (nVerts === 34);

  const verts = Array.from({ length: nVerts }, (_, v) => ({
    idx: v, x: buf.readInt16LE(vOff + v*8), y: buf.readInt16LE(vOff + v*8 + 2), z: buf.readInt16LE(vOff + v*8 + 4), w: buf.readUInt16LE(vOff + v*8 + 6),
  }));

  // 1. Sculpt clean symmetrical short-hair skull & Wagner's facial structure (strictly keeping w != 0 locked!)
  const newVerts = verts.map(v => {
    if (v.w !== 0) return { ...v };
    let { x, y, z } = v;
    // Smooth top dome & slightly broader defined forehead matching wagner.png
    if (y < -210) {
      const t = clamp((-210 - y) / 130, 0, 1);
      y = -210 - (-210 - y) * (1.0 - 0.06 * t);
      if (z < -60) z -= Math.round(6 * t);
    }
    // Slight brow/cheek definition & expressive jaw/chin for Wagner
    if (z < -160 && y > -40 && y < 95) {
      x = Math.round(x * 1.03);
      if (y > 20 && Math.abs(x) < 60) { y += 6; z -= 6; }
    }
    // Straighten nose tip cleanly
    if (z < -250 && Math.abs(x) < 30 && y > -110 && y < -40) {
      z -= 6;
    }
    // Trim right-side ear/visor-anchor bulge (v[25] Hi / v[23] Lo was +169 to hold visor -> balanced +154!)
    if ((isHi && v.idx === 25) || (isLo && v.idx === 23)) {
      x = 154; z = -34;
    }
    return { idx: v.idx, x: clamp(Math.round(x), -32767, 32767), y: clamp(Math.round(y), -32767, 32767), z: clamp(Math.round(z), -32767, 32767), w: v.w };
  });

  // 2. COMPLETELY ELIMINATE RUNE GLIFBERG'S 3D BACKWARDS-SIDEWAYS SUN VISOR (zero-area collapse -> 100% invisible!)
  const snap = (dst, src) => {
    if (dst < newVerts.length && newVerts[dst].w === 0) {
      newVerts[dst].x = src.x; newVerts[dst].y = src.y; newVerts[dst].z = src.z;
    }
  };
  if (isHi) {
    // Faces [75, 81, 83, 84] are pure visor polygons anchored at v[25] -> collapsing v[34,44,45] onto v[25] zeroes all 4!
    for (const vi of [34, 44, 45]) snap(vi, newVerts[25]);
  } else if (isLo) {
    // Faces [52, 56, 58, 59] are pure visor polygons anchored at v[23] -> collapsing v[27,31] onto v[23] zeroes all 4!
    for (const vi of [27, 31]) snap(vi, newVerts[23]);
  }

  for (let v = 0; v < nVerts; v++) {
    const nv = newVerts[v];
    buf.writeInt16LE(nv.x, vOff + v * 8);
    buf.writeInt16LE(nv.y, vOff + v * 8 + 2);
    buf.writeInt16LE(nv.z, vOff + v * 8 + 4);
  }
  recomputeMeshBounds(buf, mo, 8);
  return { nVerts };
}

// ============================================================================
// MAIN (--preview or full apply)
// ============================================================================
const previewOnly = process.argv.includes('--preview');
console.log('=== WAGNER OLIVER (Slot 4: glif2, glif_L, glif2b, glif2b_L + s2face4.bmp) ===');
const portrait = buildWagnerPortrait(getOrigWadSlice('s2face4.bmp'));
const head64 = buildWagnerHead64();
const torsoA = buildWagnerStyleATorso128x64();
const sleeveA = buildWagnerStyleASleeves32x64();
const jeansA = buildWagnerStyleAJeans128x64();
const shoeA = buildWagnerStyleAShoe32x16();
const torsoB = buildWagnerStyleBTorso128x64();
const sleeveB = buildWagnerStyleBSleeves32x64();
const pantsB = buildWagnerStyleBPants64x64();
const bootB = buildWagnerStyleBBoots32x16();

const HEAD_HASH = 0xe15f10ff, HAND_PAL = 0xecafff57;
const modelSpecs = [
  { name: 'glif2.psx',    texMap: { 0x37f719a2: torsoA, 0x089fe07e: jeansA, 0x3caa91d3: head64, 0x22d61b92: sleeveA, 0x51fd1b77: shoeA } },
  { name: 'glif_L.psx',   texMap: { 0x37f719a2: torsoA, 0x089fe07e: jeansA, 0x3caa91d3: head64, 0x22d61b92: sleeveA, 0x51fd1b77: shoeA } },
  { name: 'glif2b.psx',   texMap: { 0x93c7f9b1: torsoB, 0x24fce3d7: pantsB, 0x3caa91d3: head64, 0xc6e2c2af: sleeveB, 0x8ed83ff7: bootB } },
  { name: 'glif2b_L.psx', texMap: { 0xde14dd2f: torsoB, 0x24fce3d7: pantsB, 0x3caa91d3: head64, 0xc6e2c2af: sleeveB, 0x8ed83ff7: bootB } },
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
      writeTextureIntoPsx(buf, t, buildFairHandsRgba(buf, t, WAGNER_SKIN), true); rep++;
    } else if (sp.texMap[t.palId]) {
      writeTextureIntoPsx(buf, t, sp.texMap[t.palId], false); rep++;
    }
  }
  const sc = sculptWagnerHead(buf, info, headMi);
  modified.set(sp.name, buf);
  console.log(`  [OK] ${sp.name.padEnd(13)} | ${buf.length} B | ${rep} texturas BGR555 + HEAD M[${headMi}] (${sc.nVerts}v, viseira 3D removida!)`);
}

fs.mkdirSync(previewDir, { recursive: true });
writePng(path.join(previewDir, 'preview_s2face4.png'), 62, 47, portrait.previewRgba);
writePng(path.join(previewDir, 'preview_head_64x64.png'), 64, 64, head64);
renderPs1SkaterPreview(modified.get('glif2.psx'), [0, 7, 8, 15], [{ yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: -90 }, { yaw: 180 }], 150, 220, 0.14, 0, path.join(previewDir, 'preview_wagner_styleA_ps1.png'));
renderPs1SkaterPreview(modified.get('glif2b.psx'), [0, 7, 8, 15], [{ yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: -90 }, { yaw: 180 }], 150, 220, 0.14, 0, path.join(previewDir, 'preview_wagner_styleB_ps1.png'));
renderPs1SkaterPreview(modified.get('glif2.psx'), [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [{ yaw: 0 }, { yaw: 35 }, { yaw: 180 }], 150, 260, 0.085, 0, path.join(previewDir, 'preview_wagner_fullA.png'));
renderPs1SkaterPreview(modified.get('glif2b.psx'), [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [{ yaw: 0 }, { yaw: 35 }, { yaw: 180 }], 150, 260, 0.085, 0, path.join(previewDir, 'preview_wagner_fullB.png'));
console.log(`Previews salvos em: ${previewDir}`);

if (!previewOnly) {
  patchWadAndOptionsPre({ portraitName: 's2face4.bmp', portraitBuf: portrait.outBmp, preOffset: 0x276D4, modelsMap: modified });
  console.log('=== WAGNER OLIVER APLICADO EM CD.WAD + options.pre COM 100% DE PRECISAO! ===');
}
