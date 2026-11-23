#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) Surgical Skater Customization: Francis Paulo (Slot 7 / Rodney Mullen base)
 *
 *  - Portrait s2face9.bmp (SLUS 0x0C4C58 -> CD.WAD[377] + options.pre +0x2C6FC, EXACT 4,088 B, magenta idx 0)
 *  - 3D Head (Mesh[15] 0xba25cbf5 across mullen, mullen_L, mullen2b, mulln2bL):
 *    * Levels francis.png (+19° CCW straightening) + strong backlit shadow recovery -> clean fair white skin!
 *    * Sculpts Francis's voluminous fluffy dark hair silhouette & clean facial contours (100% w != 0 locked!)
 *    * Updates BOTH Style A head (0x8719fb31) & Style B head (0xef678ca2) + fair white hands (0xd0a94062)
 *  - Style A (textura_francis_a.png): White raglan t-shirt with black shoulders/collar + "Uber" & yellow "99"
 *    (horizontally flipped so they read LEFT-TO-RIGHT on PS1 GTE!) + black short sleeve/white forearm + 4-bit dark indigo jeans!
 *  - Style B (textura_francis_b.png): Black Bleach Shinigami kimono (shihakusho) with crisp white V-collar,
 *    white obi sash + bow, black kimono sleeves with white inner cuff + 4-bit black pleated hakama trousers!
 */

const fs = require('fs');
const path = require('path');
const {
  rootDir, clamp, lerp, probeDims, loadRgba, sampleBilinear, writePng,
  parsePsxStructure, writeTextureIntoPsx, buildFairHandsRgba,
  buildPortraitBmpFromInner46x36, recomputeMeshBounds, drawBitmapText,
  renderPs1SkaterPreview, getOrigWadSlice, patchWadAndOptionsPre,
} = require('./psx_skater_lib');

const previewDir = path.join(rootDir, 'build', '_francis_preview');
const facePath = path.join(rootDir, 'fotos_para_modificar_nos_skatistas', 'francis.png');
const faceDims = probeDims(facePath);
const faceRaw = loadRgba(facePath, faceDims.w, faceDims.h);

// Straighten tilted francis.png (head leans ~19° CW -> rotate CCW by 19°) and recover backlit face shadows!
const L_W = 400, L_H = 440;
const faceLeveled = Buffer.alloc(L_W * L_H * 4);
{
  const pivX = faceDims.w * 0.43, pivY = faceDims.h * 0.43;
  const ang = 19.0 * Math.PI / 180;
  const cA = Math.cos(ang), sA = Math.sin(ang);
  for (let y = 0; y < L_H; y++) {
    for (let x = 0; x < L_W; x++) {
      // Map leveled image [0..L_W, 0..L_H] centered on face pivot
      const u = (x - L_W * 0.50) * (faceDims.w / L_W);
      const v = (y - L_H * 0.46) * (faceDims.h / L_H);
      const sx = pivX + u * cA - v * sA;
      const sy = pivY + u * sA + v * cA;
      const s = sampleBilinear(faceRaw, faceDims.w, faceDims.h, sx, sy);

      // Strong backlit shadow recovery specifically calibrated for fair white skin while keeping hair/mouth rich dark!
      // Original backlit face pixels in francis.png sit around RGB (52..108, 42..86, 36..72); hair/mouth sit below ~38.
      const lum = (s[0] * 0.30 + s[1] * 0.59 + s[2] * 0.11) / 255;
      // Smooth S-curve: keep very dark hair/pupils/mouth (<0.12) dark, strongly brighten shadowed fair skin (0.14..0.50)!
      const skinT = clamp((lum - 0.10) / 0.24, 0, 1);
      const lift = lum < 0.10 ? 1.05 : (lum < 0.55 ? lerp(1.15, 2.75, Math.pow(skinT, 0.58)) : lerp(2.75, 1.08, clamp((lum - 0.55) / 0.45, 0, 1)));
      // Clean fair peachy-white skin balance (eliminates olive/gray cast of backlit shadows!)
      const r = clamp(Math.round(Math.pow(clamp((s[0] * lift * 1.10) / 255, 0, 1), 0.78) * 250), 10, 250);
      const g = clamp(Math.round(Math.pow(clamp((s[1] * lift * 0.99) / 255, 0, 1), 0.84) * 234), 10, 240);
      const b = clamp(Math.round(Math.pow(clamp((s[2] * lift * 0.94) / 255, 0, 1), 0.88) * 222), 10, 232);
      const d = (y * L_W + x) * 4;
      faceLeveled[d] = r; faceLeveled[d + 1] = g; faceLeveled[d + 2] = b; faceLeveled[d + 3] = 255;
    }
  }
}

const FRANCIS_SKIN = [196, 156, 136]; // Clean fair white skin tone matching recovered francis.png cheeks seamlessly!
const FRANCIS_HAIR = [28, 24, 22];    // Deep dark voluminous fluffy hair

// 1. Portrait 46x36 inner from leveled & illuminated francis.png
function buildFrancisPortrait(origBmp) {
  const innerW = 46, innerH = 36;
  const inner = Buffer.alloc(innerW * innerH * 4);
  const x0 = L_W * 0.14, x1 = L_W * 0.86;
  const y0 = L_H * 0.08, y1 = L_H * 0.84;
  for (let y = 0; y < innerH; y++) {
    for (let x = 0; x < innerW; x++) {
      const sx = lerp(x0, x1, x / (innerW - 1));
      const sy = lerp(y0, y1, y / (innerH - 1));
      const c = sampleBilinear(faceLeveled, L_W, L_H, sx, sy);
      const d = (y * innerW + x) * 4;
      inner[d] = c[0]; inner[d + 1] = c[1]; inner[d + 2] = c[2]; inner[d + 3] = 255;
    }
  }
  return buildPortraitBmpFromInner46x36(origBmp, inner, 0); // Verified magenta idx=0 in s2face9.bmp (Slot 7 Francis)!
}

// 2. 64x64 3D Head Texture anchored to uv_head_mullen.png (eyes v=29, nose (30.5,38), mouth v=46, chin v=54)
function buildFrancisHead64() {
  const W = 64, H = 64;
  const rgba = Buffer.alloc(W * H * 4);

  const hairPx = (x, y) => {
    const wave = 0.82 + 0.24 * Math.sin(x * 0.65 + Math.sin(y * 0.45) * 1.6);
    const tuft = 0.90 + 0.14 * Math.cos(x * 1.15 - y * 0.55);
    const crown = 0.84 + 0.22 * (1 - clamp(y / 38, 0, 1));
    const m = wave * tuft * crown;
    return [
      clamp(Math.round(FRANCIS_HAIR[0] * m + 6), 14, 72),
      clamp(Math.round(FRANCIS_HAIR[1] * m + 5), 12, 64),
      clamp(Math.round(FRANCIS_HAIR[2] * m + 5), 12, 60),
    ];
  };
  const neckPx = (x, y) => {
    const ang = ((x - 31.5) / 32) * Math.PI;
    const cyl = 0.90 + 0.08 * Math.cos(ang);
    const bot = y >= 58 ? lerp(1.0, 0.88, (y - 58) / 5) : 1.0;
    const m = cyl * bot;
    return [
      clamp(Math.round(FRANCIS_SKIN[0] * m), 24, 248),
      clamp(Math.round(FRANCIS_SKIN[1] * m), 20, 236),
      clamp(Math.round(FRANCIS_SKIN[2] * m), 16, 224),
    ];
  };

  // In faceLeveled (400x440, eyes leveled at y≈44%, nose at y≈54%, open smile y≈66%, chin y≈77%, fluffy bangs down to y≈33%)
  const mapY = y => {
    if (y <= 17) return lerp(L_H * 0.16, L_H * 0.30, clamp((y - 6) / 11, 0, 1));
    if (y <= 29) return lerp(L_H * 0.30, L_H * 0.44, (y - 17) / 12); // bangs/forehead -> eyes
    if (y <= 38) return lerp(L_H * 0.44, L_H * 0.55, (y - 29) / 9);  // eyes -> nose tip
    if (y <= 46) return lerp(L_H * 0.55, L_H * 0.66, (y - 38) / 8);  // nose -> mouth center
    if (y <= 54) return lerp(L_H * 0.66, L_H * 0.77, (y - 46) / 8);  // mouth -> chin bottom
    return lerp(L_H * 0.77, L_H * 0.84, clamp((y - 54) / 8, 0, 1));
  };
  const mapX = x => {
    // Mirror horizontally so Francis's hair & expression match photo on PS1 GTE!
    const fx = 63 - x;
    if (fx <= 12) return L_W * 0.24;
    if (fx <= 24) return lerp(L_W * 0.24, L_W * 0.40, (fx - 12) / 12);
    if (fx <= 32) return lerp(L_W * 0.40, L_W * 0.50, (fx - 24) / 8);
    if (fx <= 40) return lerp(L_W * 0.50, L_W * 0.60, (fx - 32) / 8);
    if (fx <= 52) return lerp(L_W * 0.60, L_W * 0.76, (fx - 40) / 12);
    return L_W * 0.76;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dxC = x - 31.5;
      const hr = hairPx(x, y), nk = neckPx(x, y);
      let col;

      if (y < 16) {
        col = hr;
      } else if (x >= 11 && x <= 52 && y >= 16 && y <= 57) {
        const sx = mapX(x), sy = mapY(y);
        const fc = sampleBilinear(faceLeveled, L_W, L_H, sx, sy);

        // Fluffy bangs draping naturally over upper forehead & sides (keeps eyebrows & fair forehead super clear!)
        const bangsCurve = 16.5 + 1.8 * Math.sin(x * 0.48) + Math.pow(dxC / 18.0, 2) * 3.5;
        const hairBlend = y < bangsCurve ? clamp((bangsCurve - y) / 2.8, 0, 1) : 0;

        // Side framing: fluffy dark hair down to ear level (y <= 43), fair neck below!
        const sideHairAmt = clamp((43.0 - y) / 4.0, 0, 1);
        const sideBg = [
          Math.round(lerp(nk[0], hr[0], sideHairAmt)),
          Math.round(lerp(nk[1], hr[1], sideHairAmt)),
          Math.round(lerp(nk[2], hr[2], sideHairAmt)),
        ];

        // Detect bright gray/blue window background leaking on outer edges of francis.png
        let faceCol = [fc[0], fc[1], fc[2]];
        const isBlueSky = (fc[2] > fc[0] + 6 && fc[2] > 110) || (Math.abs(dxC) > 13 && fc[0] > 155 && Math.abs(fc[0] - fc[2]) < 16);
        if (isBlueSky && Math.abs(dxC) > 10) faceCol = sideBg;

        // Smooth blend into fair neck under chin (y >= 50)
        if (y >= 50) {
          const nt = clamp((y - 50) / 6.0, 0, 1);
          faceCol = [Math.round(lerp(faceCol[0], nk[0], nt)), Math.round(lerp(faceCol[1], nk[1], nt)), Math.round(lerp(faceCol[2], nk[2], nt))];
        }

        // Smooth wide-feathered oval jaw contour (zero harsh edges!)
        const sideHalf = (y > 35) ? lerp(16.8, 10.6, clamp((y - 35) / 19, 0, 1)) : 16.8;
        const outerT = clamp((Math.abs(dxC) - (sideHalf - 4.4)) / 4.8, 0, 1);
        const smoothT = outerT * outerT * (3 - 2 * outerT);
        const afterFh = [Math.round(lerp(faceCol[0], hr[0], hairBlend)), Math.round(lerp(faceCol[1], hr[1], hairBlend)), Math.round(lerp(faceCol[2], hr[2], hairBlend))];
        col = [Math.round(lerp(afterFh[0], sideBg[0], smoothT)), Math.round(lerp(afterFh[1], sideBg[1], smoothT)), Math.round(lerp(afterFh[2], sideBg[2], smoothT))];
      } else {
        // Back & sides of head: voluminous dark hair down to nape (y=44), fair neck below
        const napeY = 44.0 + 1.5 * Math.cos(((x < 32 ? x : 64 - x) / 14) * Math.PI * 0.5);
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

// 3. STYLE A (textura_francis_a.png): White Raglan T-Shirt with Black Collar/Shoulders + "Uber" & Yellow "99" + Dark Indigo 4-bit Jeans
function buildFrancisStyleATorso128x64() {
  const W = 128, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sideDist = Math.min(Math.abs(x - 32), Math.abs(x - 96));
    let shade = 0.84 + 0.16 * clamp(sideDist / 22, 0, 1);
    shade *= 0.96 + 0.04 * Math.sin(x * 0.30 + y * 0.22);

    // Crisp white cotton body
    let r = Math.round(234 * shade), g = Math.round(236 * shade), b = Math.round(240 * shade);
    const dxF = x - 64; // front center

    // Black ribbed crew-neck collar ring across top (y <= 5)
    if (y <= 5) {
      r = 22; g = 22; b = 26;
    }
    // Diagonal black RAGLAN shoulder panels (front & back sides approaching arm openings at x≈32 & x≈96)
    const raglanSpan = 16 - y * 0.62;
    if (raglanSpan > 0 && (Math.abs(x - 32) < raglanSpan || Math.abs(x - 96) < raglanSpan)) {
      const bSh = 0.84 + 0.16 * Math.sin(y * 0.25);
      r = Math.round(24 * bSh); g = Math.round(24 * bSh); b = Math.round(28 * bSh);
    }

    // Yellow-orange gradient circle for "99" logo on WEARER'S LEFT CHEST (= PS1 viewer's RIGHT -> u ≈ 56, y = 22!)
    const dist99 = Math.hypot(x - 56, y - 22);
    if (dist99 <= 5.4) {
      const gradT = clamp((y - 17) / 10, 0, 1);
      r = Math.round(lerp(252, 248, gradT));
      g = Math.round(lerp(222, 162, gradT));
      b = Math.round(lerp(22, 28, gradT));
    }

    // Subtle bottom shirt hem shadow (y >= 61)
    if (y >= 61) { r = Math.round(r * 0.82); g = Math.round(g * 0.82); b = Math.round(b * 0.84); }

    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 8, 250); rgba[d + 1] = clamp(g, 8, 250); rgba[d + 2] = clamp(b, 8, 250); rgba[d + 3] = 255;
  }

  // Crisp black "UBER" on wearer's right chest (= PS1 viewer's LEFT -> u = 69, y = 20, 1:1 100% flat on chest!)
  drawBitmapText(rgba, W, H, 'UBER', 69, 20, [20, 20, 24], { flipX: true, scaleX: 1, scaleY: 1, gap: 1 });
  // Crisp black "99" inside yellow circle (PS1 viewer's RIGHT -> u = 56, y = 20, flipX=true -> reads "99" LEFT-TO-RIGHT!)
  drawBitmapText(rgba, W, H, '99', 56, 20, [20, 20, 24], { flipX: true, scaleX: 1, scaleY: 1, gap: 1 });
  return rgba;
}

// Short black raglan upper sleeve (y=0..28) + bare fair white forearm (y=29..63)
function buildFrancisStyleASleeves32x64() {
  const W = 32, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.82 + 0.18 * Math.sin((x / W) * Math.PI);
    const d = (y * W + x) * 4;
    if (y < 29) { // Black raglan short sleeve
      const hem = y >= 27 ? 0.72 : 1.0;
      const m = cyl * hem;
      rgba[d] = clamp(Math.round(28 * m), 10, 80);
      rgba[d + 1] = clamp(Math.round(28 * m), 10, 80);
      rgba[d + 2] = clamp(Math.round(32 * m), 10, 90);
      rgba[d + 3] = 255;
    } else { // Bare fair white forearm with subtle cast shadow below cuff
      const cuffShadow = y < 32 ? lerp(0.76, 1.0, (y - 29) / 3) : 1.0;
      const m = cyl * cuffShadow;
      rgba[d] = clamp(Math.round(FRANCIS_SKIN[0] * m), 24, 248);
      rgba[d + 1] = clamp(Math.round(FRANCIS_SKIN[1] * m), 20, 236);
      rgba[d + 2] = clamp(Math.round(FRANCIS_SKIN[2] * m), 16, 224);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// Dark indigo denim jeans (64x128 -> quantized cleanly into 4-bit 16-color BGR555!)
function buildFrancisStyleAJeans64x128() {
  const W = 64, H = 128, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.78 + 0.24 * Math.sin((x / W) * Math.PI);
    const weave = 0.94 + 0.06 * Math.sin(x * 1.4 + y * 0.9);
    const crease = 0.95 + 0.05 * Math.sin(y * 0.28);
    const m = cyl * weave * crease;
    let r = Math.round(34 * m), g = Math.round(52 * m), b = Math.round(92 * m);
    // Waistband & subtle gold topstitching at top (y <= 8)
    if (y <= 8) { r = Math.round(r * 0.85); g = Math.round(g * 0.85); b = Math.round(b * 0.85); }
    if (y === 8 || x === 31) { r = Math.round(r * 0.72); g = Math.round(g * 0.72); b = Math.round(b * 0.75); }
    // Subtle dark cuff at ankle (y >= 121)
    if (y >= 121) { r = Math.round(r * 0.78); g = Math.round(g * 0.78); b = Math.round(b * 0.82); }
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 12, 240); rgba[d + 1] = clamp(g, 16, 240); rgba[d + 2] = clamp(b, 24, 245); rgba[d + 3] = 255;
  }
  return rgba;
}

function buildFrancisShoe32x32(isKimono = false) {
  const W = 32, H = 32, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (y * W + x) * 4;
    if (y >= 24) { // Crisp white sole (or sandal sole for kimono)
      rgba[d] = isKimono ? 215 : 230; rgba[d + 1] = isKimono ? 210 : 232; rgba[d + 2] = isKimono ? 202 : 236; rgba[d + 3] = 255;
    } else if (isKimono && y >= 14 && y <= 18 && x >= 10 && x <= 22) { // White tabi sock peek
      rgba[d] = 232; rgba[d + 1] = 232; rgba[d + 2] = 236; rgba[d + 3] = 255;
    } else {
      const sh = 0.82 + 0.18 * Math.sin((x / W) * Math.PI);
      rgba[d] = clamp(Math.round(30 * sh), 12, 90);
      rgba[d + 1] = clamp(Math.round(30 * sh), 12, 90);
      rgba[d + 2] = clamp(Math.round(34 * sh), 14, 96);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// 4. STYLE B (textura_francis_b.png): Black Bleach Shinigami Kimono (Shihakusho) + White V-Collar + White Obi Sash/Bow + 4-bit Pleated Hakama
function buildFrancisStyleBTorso128x64() {
  const W = 128, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sideDist = Math.min(Math.abs(x - 32), Math.abs(x - 96));
    const fold = 0.84 + 0.18 * clamp(sideDist / 24, 0, 1) + 0.08 * Math.sin(x * 0.42);
    // Rich obsidian kimono cloth (never hits 0x0000!)
    let r = Math.round(28 * fold), g = Math.round(28 * fold), b = Math.round(32 * fold);
    const dx = x - 64;

    // Crisp white inner Shinigami kimono V-neck collar (front center, y=0..22)
    if (y <= 22 && Math.abs(dx) <= 13) {
      const vHalf = Math.max(0, 10.5 - y * 0.50);
      if (Math.abs(dx) <= vHalf - 2.6 && y <= 14) {
        // Fair neck/chest skin inside top of white V-collar
        r = Math.round(FRANCIS_SKIN[0] * 0.90); g = Math.round(FRANCIS_SKIN[1] * 0.90); b = Math.round(FRANCIS_SKIN[2] * 0.90);
      } else if (Math.abs(dx) <= vHalf + 0.8 && Math.abs(dx) >= Math.max(0, vHalf - 3.2)) {
        // Crisp white overlapping kimono lapel strips!
        const wSh = 0.90 + 0.10 * Math.cos(y * 0.2);
        r = Math.round(238 * wSh); g = Math.round(238 * wSh); b = Math.round(244 * wSh);
      }
    }
    // White back inner collar edge at top of back (x < 16 or x > 112, y <= 4)
    if ((x < 16 || x > 112) && y <= 4) { r = 232; g = 232; b = 238; }

    // Wide crisp white OBI SASH wrapped 360° around the waist (y = 44..60) + front bow knot & ribbon tails!
    if (y >= 44 && y <= 60) {
      const obiShade = 0.86 + 0.14 * Math.sin((y - 44) / 16 * Math.PI);
      const crease = (y === 44 || y === 60 || y === 52) ? 0.80 : 1.0;
      r = Math.round(236 * obiShade * crease); g = Math.round(236 * obiShade * crease); b = Math.round(242 * obiShade * crease);
      // Central knot detail at front center (|dx| <= 4, y=47..56)
      if (Math.abs(dx) <= 4 && y >= 47 && y <= 56) {
        const kEdge = (Math.abs(dx) >= 3 || y === 47 || y === 56) ? 0.72 : 1.04;
        r = Math.round(r * kEdge); g = Math.round(g * kEdge); b = Math.round(b * kEdge);
      }
    }
    // Hanging white obi ribbon tails below the sash on front center (y = 60..63)
    if (y > 60 && ((dx >= -11 && dx <= -2) || (dx >= 2 && dx <= 11))) {
      r = 232; g = 232; b = 238;
    }

    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 12, 250); rgba[d + 1] = clamp(g, 12, 250); rgba[d + 2] = clamp(b, 14, 250); rgba[d + 3] = 255;
  }
  return rgba;
}

// Long black Shinigami kimono sleeves with crisp white inner-sleeve cuff border at wrist (y=50..63)!
function buildFrancisStyleBSleeves32x64() {
  const W = 32, H = 64, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cyl = 0.82 + 0.20 * Math.sin((x / W) * Math.PI);
    const fold = 0.92 + 0.08 * Math.sin(y * 0.35 + x * 0.3);
    const d = (y * W + x) * 4;
    if (y >= 52) { // Crisp white kimono under-sleeve trim peeking from wide cuff!
      const m = cyl * (y === 52 ? 0.78 : 1.0);
      rgba[d] = clamp(Math.round(234 * m), 160, 248);
      rgba[d + 1] = clamp(Math.round(234 * m), 160, 248);
      rgba[d + 2] = clamp(Math.round(240 * m), 165, 250);
      rgba[d + 3] = 255;
    } else {
      const m = cyl * fold;
      rgba[d] = clamp(Math.round(30 * m), 12, 76);
      rgba[d + 1] = clamp(Math.round(30 * m), 12, 76);
      rgba[d + 2] = clamp(Math.round(34 * m), 14, 82);
      rgba[d + 3] = 255;
    }
  }
  return rgba;
}

// Black pleated Shinigami hakama trousers (64x128 -> quantized cleanly into 4-bit 16-color BGR555!)
function buildFrancisStyleBHakama64x128() {
  const W = 64, H = 128, rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // Crisp vertical hakama pleats (6 deep pleats across circumference)
    const pleat = 0.68 + 0.36 * Math.pow(0.5 + 0.5 * Math.cos((x / W) * Math.PI * 10), 1.4);
    const cyl = 0.86 + 0.14 * Math.sin((x / W) * Math.PI);
    let r = Math.round(34 * pleat * cyl), g = Math.round(34 * pleat * cyl), b = Math.round(38 * pleat * cyl);

    // Continuation of white obi sash band at very top of hip (y <= 5) + diagonal white bow tails (y=5..22)
    if (y <= 4) {
      r = 228; g = 228; b = 234;
    } else if (y <= 22) {
      const dx = x - 32;
      const tailL = Math.abs(dx - (-3 - (y - 4) * 0.35)) < 3.2;
      const tailR = Math.abs(dx - (3 + (y - 4) * 0.35)) < 3.2;
      if (tailL || tailR) { r = 230; g = 230; b = 236; }
    }
    const d = (y * W + x) * 4;
    rgba[d] = clamp(r, 14, 248); rgba[d + 1] = clamp(g, 14, 248); rgba[d + 2] = clamp(b, 16, 250); rgba[d + 3] = 255;
  }
  return rgba;
}

// 5. 3D Head Sculpt for Francis Paulo (HEAD Mesh[15] 0xba25cbf5: voluminous fluffy dark hair + balanced youthful face; w!=0 LOCKED!)
function sculptFrancisHead(buf, info, headMi) {
  const mo = info.meshOffs[headMi];
  const nVerts = buf.readUInt16LE(mo + 2);
  const vOff = mo + 28;
  for (let v = 0; v < nVerts; v++) {
    const vo = vOff + v * 8;
    let x = buf.readInt16LE(vo), y = buf.readInt16LE(vo + 2), z = buf.readInt16LE(vo + 4);
    const w = buf.readUInt16LE(vo + 6);
    if (w !== 0) continue; // STRICTLY LOCK 100% of w=1/w=2 neck seam stitches!

    // Voluminous fluffy crown & upper sides (Francis's signature fluffy hair silhouette!)
    if (y < -115) {
      const t = clamp((-115 - y) / 140, 0, 1);
      y = Math.round(y - 24 * t);       // fuller height on top crown
      x = Math.round(x * (1 + 0.13 * t)); // wider fluffy side hair volume
      z = Math.round(z * (1 + 0.08 * t));
    }
    // Slight soft bangs volume over upper forehead (z < -150, y in [-230..-110])
    if (z < -150 && y < -110 && y > -245) {
      z = Math.round(z - 12);
    }
    // Natural clean youthful jaw/cheek contour
    if (z < -120 && y > -40 && y < 75 && Math.abs(x) > 85) {
      x = Math.round(x * 0.96);
    }

    buf.writeInt16LE(x, vo);
    buf.writeInt16LE(y, vo + 2);
    buf.writeInt16LE(z, vo + 4);
  }
  recomputeMeshBounds(buf, mo, 12);
  return { nVerts };
}

// ============================================================================
// MAIN (--preview or full apply)
// ============================================================================
const previewOnly = process.argv.includes('--preview');
console.log('=== FRANCIS PAULO (Slot 7: mullen, mullen_L, mullen2b, mulln2bL + s2face9.bmp) ===');
const portrait = buildFrancisPortrait(getOrigWadSlice('s2face9.bmp'));
const head64 = buildFrancisHead64();
const torsoA = buildFrancisStyleATorso128x64();
const sleeveA = buildFrancisStyleASleeves32x64();
const jeansA = buildFrancisStyleAJeans64x128();
const shoeA = buildFrancisShoe32x32(false);
const torsoB = buildFrancisStyleBTorso128x64();
const sleeveB = buildFrancisStyleBSleeves32x64();
const hakamaB = buildFrancisStyleBHakama64x128();
const shoeB = buildFrancisShoe32x32(true);

const HEAD_HASH = 0xba25cbf5, HAND_PAL = 0xd0a94062;
const modelSpecs = [
  { name: 'mullen.psx',   texMap: { 0xee6cee24: torsoA, 0xa9d25833: jeansA, 0x8719fb31: head64, 0x2c63acb5: sleeveA, 0x888bef42: shoeA } },
  { name: 'mullen_L.psx', texMap: { 0xee6cee24: torsoA, 0xa9d25833: jeansA, 0x8719fb31: head64, 0x2c63acb5: sleeveA, 0x888bef42: shoeA } },
  { name: 'mullen2b.psx', texMap: { 0x28a131c6: torsoB, 0x1850b7b3: hakamaB, 0xef678ca2: head64, 0x8e11c65a: sleeveB, 0x888bef42: shoeB } },
  { name: 'mulln2bL.psx', texMap: { 0x28a131c6: torsoB, 0x1850b7b3: hakamaB, 0xef678ca2: head64, 0x8e11c65a: sleeveB, 0x888bef42: shoeB } },
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
      writeTextureIntoPsx(buf, t, buildFairHandsRgba(buf, t, FRANCIS_SKIN), true); rep++;
    } else if (sp.texMap[t.palId]) {
      writeTextureIntoPsx(buf, t, sp.texMap[t.palId], false); rep++;
    }
  }
  const sc = sculptFrancisHead(buf, info, headMi);
  modified.set(sp.name, buf);
  console.log(`  [OK] ${sp.name.padEnd(13)} | ${buf.length} B | ${rep} texturas (incl. calca 4-bit 16-cor!) + HEAD M[${headMi}] (${sc.nVerts}v)`);
}

fs.mkdirSync(previewDir, { recursive: true });
writePng(path.join(previewDir, 'preview_s2face9.png'), 62, 47, portrait.previewRgba);
writePng(path.join(previewDir, 'preview_head_64x64.png'), 64, 64, head64);
renderPs1SkaterPreview(modified.get('mullen.psx'), [0, 7, 8, 15], [{ yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: -90 }, { yaw: 180 }], 150, 220, 0.14, 0, path.join(previewDir, 'preview_francis_styleA_ps1.png'));
renderPs1SkaterPreview(modified.get('mullen2b.psx'), [0, 7, 8, 15], [{ yaw: 0 }, { yaw: 35 }, { yaw: -35 }, { yaw: -90 }, { yaw: 180 }], 150, 220, 0.14, 0, path.join(previewDir, 'preview_francis_styleB_ps1.png'));
renderPs1SkaterPreview(modified.get('mullen.psx'), [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [{ yaw: 0 }, { yaw: 35 }, { yaw: 180 }], 150, 260, 0.085, 0, path.join(previewDir, 'preview_francis_fullA.png'));
renderPs1SkaterPreview(modified.get('mullen2b.psx'), [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [{ yaw: 0 }, { yaw: 35 }, { yaw: 180 }], 150, 260, 0.085, 0, path.join(previewDir, 'preview_francis_fullB.png'));
console.log(`Previews salvos em: ${previewDir}`);

if (!previewOnly) {
  patchWadAndOptionsPre({ portraitName: 's2face9.bmp', portraitBuf: portrait.outBmp, preOffset: 0x2C6FC, modelsMap: modified });
  console.log('=== FRANCIS PAULO APLICADO EM CD.WAD + options.pre COM 100% DE PRECISAO! ===');
}
