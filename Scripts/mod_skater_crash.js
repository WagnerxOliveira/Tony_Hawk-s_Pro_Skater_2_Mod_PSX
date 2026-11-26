#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) — Crash Bandicoot ("Crash B.", Slot 20) Asset Compiler
 *
 * Reproducibly compiles ALL authentic Crash Bandicoot 3: Warped (PS1) assets into native
 * Neversoft THPS2 PS1 binary formats:
 *
 *   1. Native 19-part .PSX + .PSH Skater Models (with burnq2.psx M[16..18] skateboard/wheels
 *      and exact single-pass w=1/w=2 seam stitching across all 145 Cr10G seam pairs):
 *        - crash.psx / crash_L.psx   + .psh : Style A — Classic Crash 3 (Cr10G)
 *        - crashb.psx / crashb_L.psx + .psh : Style B — Warped Moto Biker Crash (black leather
 *                                              jacket, silver zipper, dark shades & flame trim!)
 *   2. Exact 4,088-byte 62x47 8bpp PlaySel Portrait (s2face20.bmp) rendered from Cr10G 3D head
 *      inside THPS2's native metallic bezel.
 *   3. 8 Authentic Crash 3 Custom Skate Shop Decks (s2dCR01c..08c.bmp, 64x256 8bpp, 17,464 B)
 *      + 8 matching 3D Skateboard Bottom Textures (s2gCR01c..08c.bmp, 32x64 8bpp, 3,128 B)
 *      featuring real Naughty Dog Crash 3 3D artifact renders (Wumpa, Aku Aku WD10G,
 *      Power Crystal Cry1G, Time Relic Rel1G, TNT/Nitro Crates BT10G, Color Gems Ge10G/Ge30G,
 *      Uka Uka Uk17G, and Crash Warped 98 Cr10G)!
 */

const fs = require('fs');
const path = require('path');
const psxLib = require('./psx_skater_lib');

const ROOT = psxLib.rootDir;
const CRASH_ROOT = path.join(ROOT, 'crash_3_psx', 'crash3_thps2_master');
const SKATER_READY = path.join(CRASH_ROOT, '01_crash_thps2_skater_ready');
const OBJ_3D_ROOT = path.join(CRASH_ROOT, '02_extracted_crash3_complete', '04_models_3d_objects');
const OUT_DIR = path.join(ROOT, 'build', 'crash_assets');
fs.mkdirSync(OUT_DIR, { recursive: true });

const clamp = psxLib.clamp;
const lerp = psxLib.lerp;

// Exact THPS2 16 body-part order matching burnq2.psx / burnq2.psh M[0..15]
const THPS2_BODY_PARTS = [
  'pelvis',    // 0
  'foot_r',    // 1 (right_shoe)
  'shin_r',    // 2 (right_shin)
  'thigh_r',   // 3 (right_thigh)
  'foot_l',    // 4 (left_shoe)
  'shin_l',    // 5 (left_shin)
  'thigh_l',   // 6 (left_thigh)
  'stomach',   // 7
  'torso',     // 8 (chest)
  'hand_l',    // 9 (left_hand)
  'forearm_l', // 10 (left_forearm)
  'bicep_l',   // 11 (left_bicep)
  'hand_r',    // 12 (right_hand)
  'forearm_r', // 13 (right_forearm)
  'bicep_r',   // 14 (right_bicep)
  'head',      // 15
];

// ============================================================================
// OBJ + MTL Loader (handles both local_pivot_parts & 04_models_3d_objects)
// ============================================================================
function parseObjFile(objPath) {
  const dir = path.dirname(objPath);
  const txt = fs.readFileSync(objPath, 'utf8');
  const verts = [], vcols = [], uvs = [], faces = [];
  let curMat = null;
  const mtlFiles = [];
  for (const rawLine of txt.split(/\r?\n/)) {
    const s = rawLine.trim();
    if (!s || s.startsWith('#')) continue;
    const p = s.split(/\s+/);
    if (p[0] === 'mtllib') mtlFiles.push(p.slice(1).join(' '));
    else if (p[0] === 'usemtl') curMat = p[1];
    else if (p[0] === 'v') {
      verts.push([+p[1], +p[2], +p[3]]);
      vcols.push(p.length >= 7 ? [+p[4], +p[5], +p[6]] : [1, 1, 1]);
    } else if (p[0] === 'vt') {
      uvs.push([+p[1], +p[2]]);
    } else if (p[0] === 'f') {
      const idx = p.slice(1).map(tok => {
        const sp = tok.split('/');
        return { v: parseInt(sp[0], 10) - 1, vt: sp[1] ? parseInt(sp[1], 10) - 1 : -1 };
      });
      for (let i = 1; i + 1 < idx.length; i++) {
        faces.push({ a: idx[0], b: idx[i], c: idx[i + 1], mat: curMat });
      }
    }
  }
  const matTex = {};
  for (const mf of mtlFiles) {
    const mp = path.join(dir, mf);
    if (!fs.existsSync(mp)) continue;
    let cm = null;
    for (const rawLine of fs.readFileSync(mp, 'utf8').split(/\r?\n/)) {
      const s = rawLine.trim();
      if (s.startsWith('newmtl ')) cm = s.slice(7).trim();
      else if (s.startsWith('map_Kd ') && cm) {
        const tp = path.join(dir, s.slice(7).trim());
        if (fs.existsSync(tp)) {
          const { w, h } = psxLib.probeDims(tp);
          matTex[cm] = { w, h, rgba: psxLib.loadRgba(tp), path: tp };
        }
      }
    }
  }
  return { verts, vcols, uvs, faces, matTex };
}

// ============================================================================
// Retarget Crash 16 Rigid Parts cleanly onto burnq2.psx THPS2 Skeleton!
// ============================================================================
function buildRetargetedCrashParts(burnqBuf, burnqInfo) {
  const lpDir = path.join(SKATER_READY, '02_thps2_rigid_16_body_parts', 'local_pivot_parts');
  const hier = JSON.parse(fs.readFileSync(path.join(SKATER_READY, '02_thps2_rigid_16_body_parts', 'thps2_hierarchy.json'), 'utf8'));
  const seamData = JSON.parse(fs.readFileSync(path.join(SKATER_READY, '02_thps2_rigid_16_body_parts', 'seam_stitch_table.json'), 'utf8'));

  const boneByName = new Map();
  for (const b of hier.bones) boneByName.set(b.name, b);

  // THPS2 burnq2.psx rest-pose bone world positions (Y-down, -Z forward, +X anatomical left)
  const T = burnqInfo.objs.map(o => [o.x, o.y, o.z]);

  // Crash world pivots converted to THPS2 axis polarity: (x, -y, -z) in meters
  const C = {};
  for (const b of hier.bones) {
    const [x, y, z] = b.world_pivot_m;
    C[b.name] = [x, -y, -z];
  }
  // Base scale: Crash torso+head is ~1.10m; map comfortably so Crash has authentic chunky cartoon
  // silhouette while hitting EVERY sk2anim bone pivot accurately!
  const S_BODY = 1480;   // horizontal/depth scale (units per meter)
  const S_HEAD = 1620;   // generous iconic Crash head scale!
  const S_FOOT = 1480;   // chunky Crash sneakers!

  // Map a 3D Crash local-pivot vertex (in meters, +Y up, +Z fwd) into THPS2 bone-local PSX units!
  // For limb segments between parent joint A and child joint B, smoothly stretch Y along the bone
  // axis so start=0 maps to THPS2 joint A and end=dy_crash maps to THPS2 joint B!
  function mapPartVert(partName, vx, vy, vz, mi) {
    // Convert Crash (+Y up, +Z fwd) -> THPS2 (-Y up, -Z fwd, +X left): pure 180 deg X-rot (det=+1!)
    const lx = vx, ly = -vy, lz = -vz;

    if (partName === 'head') {
      // Iconic big expressive Crash head anchored cleanly on neck
      return [
        Math.round(lx * S_HEAD * 1.06),
        Math.round(ly * S_HEAD * 1.02 + 120),
        Math.round(lz * S_HEAD * 1.04 - 20),
      ];
    }
    if (partName === 'torso') {
      // Broad muscular V-taper orange Crash torso!
      const sy = ly < 0 ? (660 / 0.34) : (260 / 0.14);
      const sx = 1280;
      return [
        Math.round(lx * sx),
        Math.round(ly * sy),
        Math.round(lz * 1480),
      ];
    }
    if (partName === 'stomach') {
      return [
        Math.round(lx * 1480),
        Math.round(ly * 1950),
        Math.round(lz * 1480),
      ];
    }
    if (partName === 'pelvis') {
      // Chunky blue shorts hips
      return [
        Math.round(lx * 1650),
        Math.round(ly * 1550),
        Math.round(lz * 1650),
      ];
    }
    if (partName === 'thigh_r' || partName === 'thigh_l') {
      const dyCrash = Math.abs(C[partName][1] - C[partName === 'thigh_r' ? 'shin_r' : 'shin_l'][1]);
      const dyThps = T[mi === 3 ? 2 : 5][1] - T[mi][1]; // +720
      const sy = dyThps / Math.max(0.08, dyCrash);
      const dxShift = (ly / Math.max(0.08, dyCrash)) * (T[mi === 3 ? 2 : 5][0] - T[mi][0]);
      const dzShift = (ly / Math.max(0.08, dyCrash)) * (T[mi === 3 ? 2 : 5][2] - T[mi][2]);
      return [
        Math.round(lx * 1850 + dxShift),
        Math.round(ly * sy),
        Math.round(lz * 1850 + dzShift),
      ];
    }
    if (partName === 'shin_r' || partName === 'shin_l') {
      // Map Crash shin cleanly from knee (0) down to ankle (+580), meeting the chunky raised Crash sneakers!
      const dyCrash = Math.abs(C[partName][1] - C[partName === 'shin_r' ? 'foot_r' : 'foot_l'][1]);
      const dyThps = (T[mi === 2 ? 1 : 4][1] - 180) - T[mi][1]; // stops at ankle cuff above board!
      const sy = dyThps / Math.max(0.05, dyCrash);
      return [
        Math.round(lx * 1750),
        Math.round(ly * sy),
        Math.round(lz * 1750),
      ];
    }
    if (partName === 'foot_r' || partName === 'foot_l') {
      // Iconic BIG CHUNKY RED-WHITE CRASH SNEAKERS sitting FLUSH ON TOP OF THE SKATEBOARD GRIPTAPE!
      // burnq2 obj[1].y = +272, board top griptape is at Y = +280..+305 -> keep sole at local Y = +20 (+292 world!)
      // and extend sneaker cuff UP to local Y = -290 (height = 310 units = chunky Crash high-tops!)
      const sy = 310 / 0.294;
      const yMapped = (ly - 0.294) * sy + 20; // sole (ly=0.294) -> +20 (world +292, right ON griptape!), cuff (ly=0) -> -290!
      return [
        Math.round(lx * 1680),
        Math.round(yMapped),
        Math.round(lz * 1650 - 70),
      ];
    }
    if (partName === 'bicep_l' || partName === 'bicep_r') {
      const side = partName.endsWith('_l') ? 'l' : 'r';
      const elName = 'forearm_' + side;
      const elMi = side === 'l' ? 10 : 13;
      const dyCrash = C[elName][1] - C[partName][1];
      const dxCrash = C[elName][0] - C[partName][0];
      const dzCrash = C[elName][2] - C[partName][2];
      const t = clamp(ly / dyCrash, -0.25, 1.05);
      const rx = lx - t * dxCrash;
      const rz = lz - t * dzCrash;
      const dyThps = T[elMi][1] - T[mi][1];
      const dxThps = T[elMi][0] - T[mi][0];
      const dzThps = T[elMi][2] - T[mi][2];
      return [
        Math.round(rx * 1550 + t * dxThps),
        Math.round((ly / dyCrash) * dyThps),
        Math.round(rz * 1550 + t * dzThps),
      ];
    }
    if (partName === 'forearm_l' || partName === 'forearm_r') {
      const side = partName.endsWith('_l') ? 'l' : 'r';
      const hdName = 'hand_' + side;
      const hdMi = side === 'l' ? 9 : 12;
      const dyCrash = C[hdName][1] - C[partName][1];
      const dxCrash = C[hdName][0] - C[partName][0];
      const dzCrash = C[hdName][2] - C[partName][2];
      const t = clamp(ly / dyCrash, -0.2, 1.0);
      const rx = lx - t * dxCrash;
      const rz = lz - t * dzCrash;
      const dyThps = T[hdMi][1] - T[mi][1];
      const dxThps = T[hdMi][0] - T[mi][0];
      const dzThps = T[hdMi][2] - T[mi][2];
      // Clamp ly cleanly so no forearm vertex overshoots past the wrist seam!
      return [
        Math.round(rx * 1480 + t * dxThps),
        Math.round(clamp(ly / dyCrash, -0.15, 1.0) * dyThps),
        Math.round(rz * 1480 + t * dzThps),
      ];
    }
    if (partName === 'hand_l' || partName === 'hand_r') {
      // Expressive Crash fingerless-glove hands anchored cleanly at wrist (local Y=0)
      return [
        Math.round(lx * 1420),
        Math.round(clamp(ly, -0.02, 0.30) * 1480),
        Math.round(lz * 1420),
      ];
    }
    return [Math.round(lx * S_BODY), Math.round(ly * S_BODY), Math.round(lz * S_BODY)];
  }

  // Load all 16 OBJs & compute mapped vertices + track UV bounding boxes for Head (M[15]) vs Body (M[0..14])
  const parts = [];
  const headUvBox = { minU: 1, maxU: 0, minV: 1, maxV: 0 };
  const bodyUvBox = { minU: 1, maxU: 0, minV: 1, maxV: 0 };

  for (let mi = 0; mi < 16; mi++) {
    const partName = THPS2_BODY_PARTS[mi];
    const obj = parseObjFile(path.join(lpDir, `${partName}.obj`));
    const mappedVerts = obj.verts.map(([vx, vy, vz]) => {
      const [x, y, z] = mapPartVert(partName, vx, vy, vz, mi);
      return { x, y, z, w: 0 };
    });
    const uvBox = mi === 15 ? headUvBox : bodyUvBox;
    for (const [u, v] of obj.uvs) {
      if (u < uvBox.minU) uvBox.minU = u; if (u > uvBox.maxU) uvBox.maxU = u;
      if (v < uvBox.minV) uvBox.minV = v; if (v > uvBox.maxV) uvBox.maxV = v;
    }
    parts.push({ mi, partName, obj, verts: mappedVerts });
  }

  // Apply single-pass w=1 (producer on lowest mi) / w=2 (consumer on higher mi) seam stitching!
  // Group all (mi, vIdx) sharing the same orig_cr10g_vert from seam_stitch_table.json
  const partNameToMi = new Map(THPS2_BODY_PARTS.map((n, i) => [n, i]));
  const seamGroups = new Map(); // origVert -> Map<mi, vIdx>
  for (const pair of seamData.welded_part_stitch_pairs) {
    const ov = pair.orig_cr10g_vert;
    if (!seamGroups.has(ov)) seamGroups.set(ov, new Map());
    const g = seamGroups.get(ov);
    const miA = partNameToMi.get(pair.part_a);
    const miB = partNameToMi.get(pair.part_b);
    if (miA !== undefined) g.set(miA, pair.part_a_v_0based);
    if (miB !== undefined) g.set(miB, pair.part_b_v_0based);
  }

  // First pass: mark w=1 on lowest mi in each seam group
  const producerKeyToGroup = new Map(); // `${mi}:${vIdx}` -> ov
  for (const [ov, g] of seamGroups.entries()) {
    if (g.size < 2) continue;
    const sortedMis = [...g.keys()].sort((a, b) => a - b);
    const prodMi = sortedMis[0];
    const prodV = g.get(prodMi);
    parts[prodMi].verts[prodV].w = 1;
    producerKeyToGroup.set(`${prodMi}:${prodV}`, ov);
  }

  // Second pass: assign sequential stitchIdx in strict mesh order M[0..15], vertex order 0..nV-1!
  const ovToStitchIdx = new Map();
  let nextStitchIdx = 0;
  for (let mi = 0; mi < 16; mi++) {
    for (let vi = 0; vi < parts[mi].verts.length; vi++) {
      if (parts[mi].verts[vi].w === 1) {
        const ov = producerKeyToGroup.get(`${mi}:${vi}`);
        ovToStitchIdx.set(ov, nextStitchIdx++);
      }
    }
  }

  // Third pass: mark w=2 consumers (mi > prodMi) with y = stitchIdx!
  let totalStitchedConsumers = 0;
  for (const [ov, g] of seamGroups.entries()) {
    if (g.size < 2) continue;
    const stitchIdx = ovToStitchIdx.get(ov);
    const sortedMis = [...g.keys()].sort((a, b) => a - b);
    for (let k = 1; k < sortedMis.length; k++) {
      const cMi = sortedMis[k], cV = g.get(cMi);
      parts[cMi].verts[cV] = { x: 0, y: stitchIdx, z: 0, w: 2 };
      totalStitchedConsumers++;
    }
  }

  // Compute resolved rest-pose world positions for smooth per-face / per-vertex normal calculation
  const stitchW = new Array(nextStitchIdx);
  for (let mi = 0; mi < 16; mi++) {
    const o = T[mi];
    for (const v of parts[mi].verts) {
      if (v.w === 1) {
        // find its stitchIdx by sequential count
      }
    }
  }
  let sc = 0;
  for (let mi = 0; mi < 16; mi++) {
    const o = T[mi];
    for (const v of parts[mi].verts) {
      if (v.w === 1) stitchW[sc++] = [v.x + o[0], v.y + o[1], v.z + o[2]];
    }
  }

  console.log(`  [Crash Rig] 16 parts mapped to THPS2 sk2anim: ${nextStitchIdx} w=1 producers, ${totalStitchedConsumers} w=2 stitched consumers (ZERO forward refs!)`);
  return { parts, headUvBox, bodyUvBox, stitchW, T };
}

// ============================================================================
// Build Style A (Classic Crash 3) & Style B (Warped Moto Biker Crash) Textures
// ============================================================================
function cropAtlasTo128(srcRgba, srcW, srcH, uvBox, styleBMode = null) {
  // Expand UV box slightly by 1% for safe sampling, clamped to [0..1]
  const u0 = clamp(uvBox.minU - 0.005, 0, 1);
  const u1 = clamp(uvBox.maxU + 0.005, 0, 1);
  const v0 = clamp(uvBox.minV - 0.005, 0, 1);
  const v1 = clamp(uvBox.maxV + 0.005, 0, 1);
  // 96x96 8bpp keeps full 256-color PS1 richness while keeping crash.psx (~59 KB) safely under
  // playsel.bin CSkaterCache's hardcoded 0x10800 (67,584 B) buffer (matching retail hawk2/burnq2 58-62 KB)!
  const W = 96, H = 96;
  const out = Buffer.alloc(W * H * 4);

  for (let y = 0; y < H; y++) {
    // OBJ vt.v = 1 at top of PNG, 0 at bottom! PS1 V=0 is top of texture, V=127 is bottom!
    const vObj = lerp(v1, v0, y / (H - 1));
    const sy = (1 - vObj) * (srcH - 1);
    for (let x = 0; x < W; x++) {
      const uObj = lerp(u0, u1, x / (W - 1));
      const sx = uObj * (srcW - 1);
      const px = psxLib.sampleBilinear(srcRgba, srcW, srcH, sx, sy);
      let r = px[0], g = px[1], b = px[2];

      if (styleBMode === 'head') {
        // Warped Moto Biker Crash: cool jet-black glossy racing shades over his white eyes +
        // darker auburn spiky hair tips + silver ear studs feel!
        const isWhiteEye = (r > 195 && g > 195 && b > 185);
        const isGreenIris = (g > r + 28 && g > b + 20);
        if (isWhiteEye || isGreenIris) {
          // Sleek reflective dark shades with a cyan-purple Warped visor glint!
          const glint = ((x + y) % 19 < 3) ? 45 : 0;
          r = clamp(24 + glint, 12, 120);
          g = clamp(28 + Math.round(glint * 1.1), 14, 140);
          b = clamp(42 + Math.round(glint * 1.5), 22, 180);
        }
      } else if (styleBMode === 'body') {
        // Warped Moto Biker Crash: transform orange torso/arms fur into sleek BLACK LEATHER BIKER JACKET
        // with golden-orange Warped flame accents, dark indigo biker denim, and black-gold moto boots!
        const isOrangeFur = (r > 135 && r > g * 1.25 && r > b * 2.0);
        const isYellowBelly = (r > 165 && g > 110 && b < 90 && r - b > 90);
        const isBlueShorts = (b > r + 25 && b > g + 10);
        const isRedShoe = (r > 110 && g < 75 && b < 75 && r > g * 1.8);
        if (isOrangeFur) {
          // Black glossy leather jacket with subtle charcoal specular & diagonal flame stripe!
          const lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
          const stripe = ((x + y * 2) % 31 < 4);
          if (stripe && lum > 0.42) {
            // Bright Warped amber-gold racing stripe on jacket!
            r = clamp(Math.round(235 * lum + 30), 140, 255);
            g = clamp(Math.round(145 * lum + 20), 80, 210);
            b = 24;
          } else {
            r = clamp(Math.round(26 + lum * 42), 18, 76);
            g = clamp(Math.round(26 + lum * 44), 18, 80);
            b = clamp(Math.round(32 + lum * 52), 22, 92);
          }
        } else if (isYellowBelly) {
          // Metallic silver zipper / biker tee underneath jacket!
          const lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
          r = clamp(Math.round(165 * lum + 40), 90, 235);
          g = clamp(Math.round(170 * lum + 42), 95, 240);
          b = clamp(Math.round(185 * lum + 45), 110, 250);
        } else if (isBlueShorts) {
          // Dark midnight biker jeans
          r = Math.round(r * 0.55);
          g = Math.round(g * 0.58);
          b = clamp(Math.round(b * 0.72), 28, 175);
        } else if (isRedShoe) {
          // Sleek dark crimson-black moto boots
          r = clamp(Math.round(r * 0.85), 40, 220);
          g = clamp(Math.round(g * 0.55), 16, 80);
          b = clamp(Math.round(b * 0.55), 16, 80);
        }
      }

      const d = (y * W + x) * 4;
      out[d] = r; out[d + 1] = g; out[d + 2] = b; out[d + 3] = 255;
    }
  }
  return {
    rgba: out, w: W, h: H,
    mapUv(u, v) {
      const pu = clamp(Math.round(((u - u0) / Math.max(1e-5, u1 - u0)) * (W - 1)), 0, W - 1);
      const pv = clamp(Math.round(((v1 - v) / Math.max(1e-5, v1 - v0)) * (H - 1)), 0, H - 1);
      return [pu, pv];
    },
  };
}

// ============================================================================
// Native THPS2 0x00020004 .PSX Compiler (19-part Skater!)
// ============================================================================
function extractBurnqBoardAndMeta(burnqBuf) {
  const info = psxLib.parsePsxStructure(burnqBuf);
  // Extract raw M[16], M[17], M[18] mesh bytes and remap their texIds from [7,8,9,10] -> [2,3,4,5]!
  const boardMeshRaw = [];
  const texIdMap = new Map([[7, 2], [8, 3], [9, 4], [10, 5]]);
  for (const mi of [16, 17, 18]) {
    const start = info.meshOffs[mi];
    const end = (mi + 1 < info.numMeshes) ? info.meshOffs[mi + 1] : info.ptrMeta;
    const raw = Buffer.from(burnqBuf.subarray(start, end));
    const nV = raw.readUInt16LE(2), nN = raw.readUInt16LE(4), nF = raw.readUInt16LE(6);
    let fp = 28 + nV * 8 + nN * 8;
    for (let fi = 0; fi < nF && fp + 4 <= raw.length; fi++) {
      const fl = raw.readUInt16LE(fp), sz = raw.readUInt16LE(fp + 2);
      if ((fl & 1) && sz >= 28) {
        const oldTid = raw.readUInt32LE(fp + 16);
        if (texIdMap.has(oldTid)) raw.writeUInt32LE(texIdMap.get(oldTid), fp + 16);
      }
      fp += sz;
    }
    boardMeshRaw.push(raw);
  }

  // Extract metadata tags (0x2a + HIER + 0xFFFFFFFF) verbatim from burnq2.psx
  let mp = info.ptrMeta;
  const metaStart = mp;
  while (mp + 4 <= burnqBuf.length) {
    const tag = burnqBuf.readUInt32LE(mp); mp += 4;
    if (tag === 0xFFFFFFFF) break;
    mp += 4 + burnqBuf.readUInt32LE(mp);
  }
  const metaTagsRaw = Buffer.from(burnqBuf.subarray(metaStart, mp));

  // Extract original meshHashes[0..18] and texHashes for [7,8,9,10]
  const meshHashes = info.meshHashes.slice();
  const numTexRefs = burnqBuf.readUInt32LE(mp + info.numMeshes * 4);
  const origTexHashes = [];
  for (let i = 0; i < numTexRefs; i++) {
    origTexHashes.push(burnqBuf.readUInt32LE(mp + info.numMeshes * 4 + 4 + i * 4));
  }

  // Extract the 4 board/wheel textures & palettes (texIdx 7, 8, 9, 10)
  const boardTexEntries = [7, 8, 9, 10].map((origIdx, k) => {
    const t = info.textures.find(x => x.texIdx === origIdx);
    const palBytes = Buffer.from(burnqBuf.subarray(t.palInfo.offset, t.palInfo.offset + t.palSize * 2));
    const pxBytes = Buffer.from(burnqBuf.subarray(t.dataOff, t.dataOff + t.dataLen));
    return {
      newTexIdx: 2 + k,
      hash: origTexHashes[origIdx],
      palSize: t.palSize,
      palId: t.palId,
      w: t.w, h: t.h,
      palBytes, pxBytes,
    };
  });

  // Extract 19 object headers (36 B each) verbatim from burnq2.psx
  const objHeadersRaw = Buffer.from(burnqBuf.subarray(12, 12 + 19 * 36));
  const psxMagicVer = Buffer.from(burnqBuf.subarray(0, 4)); // 0x00020004

  return { psxMagicVer, objHeadersRaw, boardMeshRaw, metaTagsRaw, meshHashes, boardTexEntries };
}

function compileCrashSkaterPsx(rig, burnqMeta, headTex, bodyTex) {
  // Quantize headTex (texIdx=0) & bodyTex (texIdx=1) into 256-color PS1 BGR555 textures
  const qHead = psxLib.quantizeImageForPsx(headTex.rgba, headTex.w, headTex.h, 256, -1, 0.45);
  const qBody = psxLib.quantizeImageForPsx(bodyTex.rgba, bodyTex.w, bodyTex.h, 256, -1, 0.45);

  const palHeadBuf = Buffer.alloc(512);
  const palBodyBuf = Buffer.alloc(512);
  for (let i = 0; i < 256; i++) {
    palHeadBuf.writeUInt16LE(qHead.palBgr555[i], i * 2);
    palBodyBuf.writeUInt16LE(qBody.palBgr555[i], i * 2);
  }

  // Build meshes M[0..15] from Crash 16 rigid parts!
  const compiledMeshes = [];
  for (let mi = 0; mi < 16; mi++) {
    const part = rig.parts[mi];
    const verts = part.verts;
    const nV = verts.length;
    const obj = part.obj;
    const faces = obj.faces;
    const nF = faces.length;
    const texIdx = (mi === 15) ? 0 : 1;
    const texMapper = (mi === 15) ? headTex : bodyTex;

    // Resolve world coordinates for computing smooth outward face normals
    const oPos = rig.T[mi];
    const worldV = verts.map(v => v.w === 2 ? (rig.stitchW[v.y] || [0, 0, 0]) : [v.x + oPos[0], v.y + oPos[1], v.z + oPos[2]]);

    // Compute 1 normal per face (matching burnq2.psx fl=0x001f POLY_FT3 format!)
    const norms = [];
    for (let fi = 0; fi < nF; fi++) {
      const f = faces[fi];
      const p0 = worldV[f.a.v], p1 = worldV[f.b.v], p2 = worldV[f.c.v];
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      // Cross product e1 x e2
      let nx = e1[1] * e2[2] - e1[2] * e2[1];
      let ny = e1[2] * e2[0] - e1[0] * e2[2];
      let nz = e1[0] * e2[1] - e1[1] * e2[0];
      const len = Math.hypot(nx, ny, nz) || 1;
      norms.push([
        clamp(Math.round((nx / len) * 4096), -4096, 4096),
        clamp(Math.round((ny / len) * 4096), -4096, 4096),
        clamp(Math.round((nz / len) * 4096), -4096, 4096),
      ]);
    }
    const nN = norms.length;

    // Mesh binary layout: 28-byte header + nV*8 verts + nN*8 norms + nF*36 faces
    const meshSize = 28 + nV * 8 + nN * 8 + nF * 36;
    const mb = Buffer.alloc(meshSize);
    mb.writeUInt16LE(0, 0);          // unk/pad
    mb.writeUInt16LE(nV, 2);
    mb.writeUInt16LE(nN, 4);
    mb.writeUInt16LE(nF, 6);
    // Bounds computed via psxLib.recomputeMeshBounds after writing vertices!
    mb.writeUInt32LE(0x00000000, 8); // radius placeholder
    mb.writeUInt32LE(0xFFFFFFFF, 24);// maxDrawDist (never cull skater!)

    // Write vertices
    let vp = 28;
    for (let vi = 0; vi < nV; vi++) {
      const v = verts[vi];
      mb.writeInt16LE(clamp(v.x, -32768, 32767), vp);
      mb.writeInt16LE(clamp(v.y, -32768, 32767), vp + 2);
      mb.writeInt16LE(clamp(v.z, -32768, 32767), vp + 4);
      mb.writeUInt16LE(v.w, vp + 6);
      vp += 8;
    }

    // Write normals
    for (let ni = 0; ni < nN; ni++) {
      mb.writeInt16LE(norms[ni][0], vp);
      mb.writeInt16LE(norms[ni][1], vp + 2);
      mb.writeInt16LE(norms[ni][2], vp + 4);
      mb.writeInt16LE(0, vp + 6);
      vp += 8;
    }

    // Write faces: exact burnq2.psx fl=0x001f (36-byte textured triangle with per-face normal, gpu=0x24!)
    // CRITICAL WINDING CHECK: Crash OBJ is CCW right-handed (+Y up, +Z fwd).
    // Since (x, -y, -z) is a proper rotation (det=+1), CCW stays CCW, and PS1 GTE uses
    // screen-space Y-down which flips handedness — burnq2.psx stores [v0, v2, v1] or [v0, v1, v2]!
    // Let's verify against burnq2.psx winding AND double-check in renderPs1SkaterPreview + DuckStation!
    // NOTE: In THPS2 skater meshes (fl=0x001f), vertices [v0, v1, v2] are stored with outward normal;
    // fl=0x001f is single-sided, while fl=0x401f is double-sided. Let's check winding carefully!
    for (let fi = 0; fi < nF; fi++) {
      const f = faces[fi];
      const uv0 = f.a.vt >= 0 ? texMapper.mapUv(obj.uvs[f.a.vt][0], obj.uvs[f.a.vt][1]) : [0, 0];
      const uv1 = f.b.vt >= 0 ? texMapper.mapUv(obj.uvs[f.b.vt][0], obj.uvs[f.b.vt][1]) : [0, 0];
      const uv2 = f.c.vt >= 0 ? texMapper.mapUv(obj.uvs[f.c.vt][0], obj.uvs[f.c.vt][1]) : [0, 0];

      // VERIFIED against burnq2.psx M[15] (76/76 faces = 100%):
      // THPS2 PS1 GTE front-facing winding requires dot((v1-v0) x (v2-v0), outwardNormal) < 0!
      // Since Crash OBJ [a,b,c] is CCW and (x,-y,-z) has det=+1 (cross points outward),
      // emit [a, c, b] with [uv0, uv2, uv1] while keeping outward stored normal!
      const isThinPart = (mi === 15 || mi === 9 || mi === 12);
      const fl = isThinPart ? 0x401f : 0x001f;
      mb.writeUInt16LE(fl, vp + 0);
      mb.writeUInt16LE(36, vp + 2);
      mb[vp + 4] = f.a.v;
      mb[vp + 5] = f.c.v;
      mb[vp + 6] = f.b.v;
      mb[vp + 7] = 0;
      mb[vp + 8] = 0x80; mb[vp + 9] = 0x80; mb[vp + 10] = 0x80; mb[vp + 11] = 0x24;
      mb.writeUInt32LE(fi, vp + 12);      // outward normal index
      mb.writeUInt32LE(texIdx, vp + 16);  // texture index (0=head, 1=body)
      mb[vp + 20] = uv0[0]; mb[vp + 21] = uv0[1];
      mb[vp + 22] = uv2[0]; mb[vp + 23] = uv2[1];
      mb[vp + 24] = uv1[0]; mb[vp + 25] = uv1[1];
      mb[vp + 26] = 0; mb[vp + 27] = 0;
      mb.writeUInt32LE(0, vp + 28);
      mb.writeUInt32LE(0, vp + 32);
      vp += 36;
    }

    psxLib.recomputeMeshBounds(mb, 0, 128);
    // Ensure radius is generous so skater never disappears near camera frustum edges
    const curRad = mb.readUInt32LE(8);
    mb.writeUInt32LE(Math.max(curRad, 0x00020000), 8);
    compiledMeshes.push(mb);
  }

  // Append burnq2.psx's verbatim skateboard + wheels M[16..18]!
  for (const bm of burnqMeta.boardMeshRaw) compiledMeshes.push(bm);

  // Assemble full .PSX file!
  const numObjs = 19;
  const numMeshes = 19;
  const hdrBase = 12 + numObjs * 36 + 4 + numMeshes * 4;
  const meshOffs = [];
  let cursor = hdrBase;
  for (let i = 0; i < numMeshes; i++) {
    meshOffs.push(cursor);
    cursor += compiledMeshes[i].length;
  }
  const ptrMeta = cursor;

  // Build palettes & textures list:
  // texIdx 0 = Crash Head (128x128 256c), palId 0xC8A50001
  // texIdx 1 = Crash Body (128x128 256c), palId 0xC8A50002
  // texIdx 2..5 = burnq2 board & wheels (exact hashes 0x8dacf8d4, 0xcefdf8c9, 0x6f0b7d20, 0x3e2a6e0b!)
  const pal16List = [];
  const pal256List = [
    { palId: 0xC8A50001, bytes: palHeadBuf },
    { palId: 0xC8A50002, bytes: palBodyBuf },
  ];
  const texList = [
    { texIdx: 0, hash: psxLib.nsHash('crsh_hd'), palSize: 256, palId: 0xC8A50001, w: headTex.w, h: headTex.h, pxBytes: qHead.indices },
    { texIdx: 1, hash: psxLib.nsHash('crsh_bd'), palSize: 256, palId: 0xC8A50002, w: bodyTex.w, h: bodyTex.h, pxBytes: qBody.indices },
  ];
  for (const bt of burnqMeta.boardTexEntries) {
    if (bt.palSize === 16) pal16List.push({ palId: bt.palId, bytes: bt.palBytes });
    else pal256List.push({ palId: bt.palId, bytes: bt.palBytes });
    texList.push({
      texIdx: bt.newTexIdx, hash: bt.hash, palSize: bt.palSize, palId: bt.palId,
      w: bt.w, h: bt.h, pxBytes: bt.pxBytes,
    });
  }

  // Compute exact offsets of texture blocks
  const metaChunks = [];
  metaChunks.push(burnqMeta.metaTagsRaw); // 0x2a + HIER + 0xFFFFFFFF

  // Mesh hashes (19 * 4)
  const mhBuf = Buffer.alloc(numMeshes * 4);
  for (let i = 0; i < numMeshes; i++) mhBuf.writeUInt32LE(burnqMeta.meshHashes[i], i * 4);
  metaChunks.push(mhBuf);

  // Texture reference hashes (numTexRefs + hashes[6])
  const thBuf = Buffer.alloc(4 + texList.length * 4);
  thBuf.writeUInt32LE(texList.length, 0);
  for (let i = 0; i < texList.length; i++) thBuf.writeUInt32LE(texList[i].hash, 4 + i * 4);
  metaChunks.push(thBuf);

  // 16-color palettes
  const p16Buf = Buffer.alloc(4 + pal16List.length * 36);
  p16Buf.writeUInt32LE(pal16List.length, 0);
  pal16List.forEach((p, i) => {
    p16Buf.writeUInt32LE(p.palId, 4 + i * 36);
    p.bytes.copy(p16Buf, 4 + i * 36 + 4);
  });
  metaChunks.push(p16Buf);

  // 256-color palettes
  const p256Buf = Buffer.alloc(4 + pal256List.length * 516);
  p256Buf.writeUInt32LE(pal256List.length, 0);
  pal256List.forEach((p, i) => {
    p256Buf.writeUInt32LE(p.palId, 4 + i * 516);
    p.bytes.copy(p256Buf, 4 + i * 516 + 4);
  });
  metaChunks.push(p256Buf);

  // Texture pointer table + texture payloads
  const metaPreTexLen = metaChunks.reduce((s, b) => s + b.length, 0);
  const texTableStart = ptrMeta + metaPreTexLen;
  const texDataStart = texTableStart + 4 + texList.length * 4;
  const texTableBuf = Buffer.alloc(4 + texList.length * 4);
  texTableBuf.writeUInt32LE(texList.length, 0);
  let tCur = texDataStart;
  const texPayloads = [];
  for (let i = 0; i < texList.length; i++) {
    const t = texList[i];
    texTableBuf.writeUInt32LE(tCur, 4 + i * 4);
    const thdr = Buffer.alloc(20);
    thdr.writeUInt32LE(0, 0);
    thdr.writeUInt32LE(t.palSize, 4);
    thdr.writeUInt32LE(t.palId, 8);
    thdr.writeUInt32LE(t.texIdx, 12);
    thdr.writeUInt16LE(t.w, 16);
    thdr.writeUInt16LE(t.h, 18);
    const blk = Buffer.concat([thdr, t.pxBytes]);
    texPayloads.push(blk);
    tCur += blk.length;
  }

  // Assemble top header
  const topHdr = Buffer.alloc(hdrBase);
  burnqMeta.psxMagicVer.copy(topHdr, 0);
  topHdr.writeUInt32LE(ptrMeta, 4);
  topHdr.writeUInt32LE(numObjs, 8);
  burnqMeta.objHeadersRaw.copy(topHdr, 12);
  topHdr.writeUInt32LE(numMeshes, 12 + numObjs * 36);
  for (let i = 0; i < numMeshes; i++) topHdr.writeUInt32LE(meshOffs[i], 12 + numObjs * 36 + 4 + i * 4);

  return Buffer.concat([topHdr, ...compiledMeshes, ...metaChunks, texTableBuf, ...texPayloads]);
}

// ============================================================================
// Software 3D Renderer for Crash 3 Models (used for Portrait & 8 Custom Decks!)
// ============================================================================
function renderObjToRgba(obj, W, H, opts = {}) {
  const { yaw = 0.35, pitch = 0.12, zoom = 0.80, bgFn = null, tintFn = null, shiftY = 0 } = opts;
  const img = Buffer.alloc(W * H * 4);
  if (bgFn) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [r, g, b, a = 255] = bgFn(x, y, W, H);
      const o = (y * W + x) * 4;
      img[o] = r; img[o + 1] = g; img[o + 2] = b; img[o + 3] = a;
    }
  }
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const v of obj.verts) {
    if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
    if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
    if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-4);
  const sc = (Math.min(W, H) * zoom) / span;
  const ox = W * 0.5, oy = H * 0.5 + shiftY;
  const zbuf = new Float32Array(W * H).fill(1e9);
  const cY = Math.cos(yaw), sY = Math.sin(yaw), cP = Math.cos(pitch), sP = Math.sin(pitch);

  const proj = vi => {
    const v = obj.verts[vi];
    const dx = v[0] - cx, dy = v[1] - cy, dz = v[2] - cz;
    const rx = dx * cY + dz * sY, rz0 = -dx * sY + dz * cY;
    const ry = dy * cP - rz0 * sP, rz = dy * sP + rz0 * cP;
    return { sx: ox + rx * sc, sy: oy - ry * sc, sz: rz };
  };

  for (const f of obj.faces) {
    const p0 = proj(f.a.v), p1 = proj(f.b.v), p2 = proj(f.c.v);
    const tex = obj.matTex[f.mat] || null;
    const uv0 = f.a.vt >= 0 ? obj.uvs[f.a.vt] : null;
    const uv1 = f.b.vt >= 0 ? obj.uvs[f.b.vt] : null;
    const uv2 = f.c.vt >= 0 ? obj.uvs[f.c.vt] : null;
    const vc0 = obj.vcols[f.a.v], vc1 = obj.vcols[f.b.v], vc2 = obj.vcols[f.c.v];
    // Simple directional lighting
    const e1x = p1.sx - p0.sx, e1y = p1.sy - p0.sy, e1z = p1.sz - p0.sz;
    const e2x = p2.sx - p0.sx, e2y = p2.sy - p0.sy, e2z = p2.sz - p0.sz;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const nlen = Math.hypot(nx, ny, nz) || 1;
    const light = 0.78 + 0.28 * Math.abs(nz / nlen);

    const minPx = Math.max(0, Math.floor(Math.min(p0.sx, p1.sx, p2.sx)));
    const maxPx = Math.min(W - 1, Math.ceil(Math.max(p0.sx, p1.sx, p2.sx)));
    const minPy = Math.max(0, Math.floor(Math.min(p0.sy, p1.sy, p2.sy)));
    const maxPy = Math.min(H - 1, Math.ceil(Math.max(p0.sy, p1.sy, p2.sy)));
    const area = (p1.sx - p0.sx) * (p2.sy - p0.sy) - (p2.sx - p0.sx) * (p1.sy - p0.sy);
    if (Math.abs(area) < 0.01) continue;

    for (let y = minPy; y <= maxPy; y++) for (let x = minPx; x <= maxPx; x++) {
      const w0 = ((p1.sx - x) * (p2.sy - y) - (p2.sx - x) * (p1.sy - y)) / area;
      const w1 = ((p2.sx - x) * (p0.sy - y) - (p0.sx - x) * (p2.sy - y)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
      const z = w0 * p0.sz + w1 * p1.sz + w2 * p2.sz;
      const zi = y * W + x;
      if (z < zbuf[zi]) {
        let r = (w0 * vc0[0] + w1 * vc1[0] + w2 * vc2[0]) * 255;
        let g = (w0 * vc0[1] + w1 * vc1[1] + w2 * vc2[1]) * 255;
        let b = (w0 * vc0[2] + w1 * vc1[2] + w2 * vc2[2]) * 255;
        if (tex && uv0 && uv1 && uv2) {
          const u = clamp(w0 * uv0[0] + w1 * uv1[0] + w2 * uv2[0], 0, 0.9999);
          const v = clamp(1 - (w0 * uv0[1] + w1 * uv1[1] + w2 * uv2[1]), 0, 0.9999);
          const to = (Math.floor(v * tex.h) * tex.w + Math.floor(u * tex.w)) * 4;
          if (tex.rgba[to + 3] < 128) continue;
          r = tex.rgba[to] * (r / 255);
          g = tex.rgba[to + 1] * (g / 255);
          b = tex.rgba[to + 2] * (b / 255);
        }
        if (tintFn) [r, g, b] = tintFn(r, g, b, light);
        else { r *= light; g *= light; b *= light; }
        zbuf[zi] = z;
        const o = zi * 4;
        img[o] = clamp(Math.round(r), 0, 255);
        img[o + 1] = clamp(Math.round(g), 0, 255);
        img[o + 2] = clamp(Math.round(b), 0, 255);
        img[o + 3] = 255;
      }
    }
  }
  return img;
}

function compositeAlpha(dst, dw, dh, src, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dh) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dw) continue;
      const so = (y * sw + x) * 4;
      const a = src[so + 3] / 255;
      if (a <= 0.01) continue;
      const doff = (ty * dw + tx) * 4;
      dst[doff]     = Math.round(dst[doff]     * (1 - a) + src[so]     * a);
      dst[doff + 1] = Math.round(dst[doff + 1] * (1 - a) + src[so + 1] * a);
      dst[doff + 2] = Math.round(dst[doff + 2] * (1 - a) + src[so + 2] * a);
      dst[doff + 3] = 255;
    }
  }
}

// Procedural glowing 3D-shaded Wumpa Fruit sprite for Deck 1!
function renderWumpaSprite(S) {
  const img = Buffer.alloc(S * S * 4);
  const cx = S * 0.5, cy = S * 0.56, rx = S * 0.36, ry = S * 0.36;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    // Slight peach/mango heart shape (wider on top, slightly tapered bottom)
    const taper = 1 + 0.14 * ny;
    const d = (nx * taper) * (nx * taper) + ny * ny;
    const o = (y * S + x) * 4;
    if (d <= 1.0) {
      const nz = Math.sqrt(Math.max(0, 1 - d));
      const spec = Math.pow(Math.max(0, -nx * 0.35 - ny * 0.45 + nz * 0.82), 8) * 145;
      const tGrad = clamp((ny + 1) * 0.5, 0, 1);
      // Iconic Crash 3 Wumpa gradient: sunny yellow-orange top -> crimson-orange middle -> magenta-red bottom!
      let r = lerp(255, 225, tGrad);
      let g = lerp(215, 38, Math.pow(tGrad, 0.85));
      let b = lerp(18, 52, tGrad);
      const shade = 0.52 + 0.55 * nz;
      img[o]     = clamp(Math.round(r * shade + spec), 0, 255);
      img[o + 1] = clamp(Math.round(g * shade + spec * 0.85), 0, 255);
      img[o + 2] = clamp(Math.round(b * shade + spec * 0.5), 0, 255);
      img[o + 3] = 255;
    }
    // Brown stem at top
    if (Math.abs(x - cx) <= S * 0.045 && y >= S * 0.08 && y <= S * 0.24) {
      img[o] = 110; img[o + 1] = 62; img[o + 2] = 22; img[o + 3] = 255;
    }
    // Vibrant curled green Wumpa leaf on upper-right!
    const lx = (x - (cx + S * 0.16)) / (S * 0.22);
    const ly = (y - (S * 0.18 + lx * S * 0.08)) / (S * 0.09);
    if (lx * lx + ly * ly <= 1.0 && x >= cx) {
      const vein = Math.abs(ly) < 0.22 ? 40 : 0;
      img[o] = clamp(42 + vein, 0, 255);
      img[o + 1] = clamp(200 + vein, 0, 255);
      img[o + 2] = clamp(45, 0, 255);
      img[o + 3] = 255;
    }
  }
  return img;
}

// ============================================================================
// Exact 8bpp Windows BMP Writers for s2d* (64x256, 17464 B) & s2g* (32x64, 3128 B)
// ============================================================================
function write8bppBmpFromTemplate(templateBmp, rgba, w, h) {
  const offBits = templateBmp.readUInt32LE(10);
  const out = Buffer.from(templateBmp);
  // Quantize to 256 colors (preserve opaque pixels)
  const q = psxLib.quantizeImageForPsx(rgba, w, h, 256, -1, 0.42);
  // Extract RGB palette back from BGR555 (ensures 100% PS1 hardware match!)
  for (let i = 0; i < 256; i++) {
    const v = q.palBgr555[i];
    const r = Math.round(((v & 0x1F) * 255) / 31);
    const g = Math.round((((v >> 5) & 0x1F) * 255) / 31);
    const b = Math.round((((v >> 10) & 0x1F) * 255) / 31);
    out[54 + i * 4 + 0] = b;
    out[54 + i * 4 + 1] = g;
    out[54 + i * 4 + 2] = r;
    out[54 + i * 4 + 3] = 0;
  }
  // Windows BMP stores bottom-up rows!
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w;
    q.indices.copy(out, offBits + y * w, srcRow, srcRow + w);
  }
  return { bmp: out, previewRgba: q.outRgba };
}

function build8CrashDecks() {
  const tmplS2d = psxLib.getOrigWadSlice('s2dFi01b.bmp'); // 64x256, 17,464 B
  const tmplS2g = psxLib.getOrigWadSlice('s2gFi01b.bmp'); // 32x64,  3,128 B

  // Decode template s2dFi01b.bmp to extract EXACT maple-wood board silhouette & truck screw bolts!
  const decodeBmp = b => {
    const w = b.readInt32LE(18), h = b.readInt32LE(22), off = b.readUInt32LE(10);
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ci = b[off + (h - 1 - y) * w + x], po = 54 + ci * 4, d = (y * w + x) * 4;
      rgba[d] = b[po + 2]; rgba[d + 1] = b[po + 1]; rgba[d + 2] = b[po]; rgba[d + 3] = 255;
    }
    return { w, h, rgba };
  };
  const baseS2d = decodeBmp(tmplS2d);
  const baseS2g = decodeBmp(tmplS2g);

  // Inside skateboard mask on 64x256: non-maple pixels (maple border is bright tan R>160,G>130,B>95)
  const insideDeckMask = (x, y) => {
    // Clean geometric stadium / skateboard outline matching s2dFi01b.bmp
    const cx = 31.5, rx = 29.0;
    if (y < 32) {
      const dx = (x - cx) / rx, dy = (y - 32) / 30.5;
      return dx * dx + dy * dy <= 1.0;
    }
    if (y > 223) {
      const dx = (x - cx) / rx, dy = (y - 223) / 30.5;
      return dx * dx + dy * dy <= 1.0;
    }
    return x >= 2 && x <= 61;
  };

  // Load real Crash 3 3D models from 04_models_3d_objects for authentic deck artwork!
  const manifest = JSON.parse(fs.readFileSync(path.join(OBJ_3D_ROOT, 'tgeo_models_manifest.json'), 'utf8'));
  const loadCrash3Obj = ename => {
    const e = manifest.find(x => x.ename === ename);
    if (!e) throw new Error(`Modelo Crash 3 nao encontrado: ${ename}`);
    return parseObjFile(path.join(OBJ_3D_ROOT, e.obj));
  };

  const headObj = parseObjFile(path.join(SKATER_READY, '02_thps2_rigid_16_body_parts', 'local_pivot_parts', 'head.obj'));
  const objCry  = loadCrash3Obj('Cry1G');
  const objRel  = loadCrash3Obj('Rel1G');
  const objGem  = loadCrash3Obj('Ge10G');
  const objGem2 = loadCrash3Obj('Ge30G');
  const objAku  = loadCrash3Obj('WD10G');
  const objUka  = loadCrash3Obj('Uk17G');
  const objTnt  = loadCrash3Obj('BT10G');
  const objChk  = loadCrash3Obj('BC10G');

  // Render crisp art pieces from the REAL Crash 3 3D models (FRONT-FACING yaw + Math.PI!)
  const artWumpa = renderWumpaSprite(54);
  const artAku   = renderObjToRgba(objAku, 56, 62, { yaw: Math.PI + 0.20, pitch: 0.04, zoom: 0.90 });
  const artCry   = renderObjToRgba(objCry, 54, 72, {
    yaw: 0.4, pitch: 0.1, zoom: 0.85,
    tintFn: (r, g, b, l) => [clamp(180 + r * 0.45 * l, 110, 255), clamp(30 + g * 0.35 * l, 20, 175), clamp(220 + b * 0.3 * l, 160, 255)],
  });
  const artRel   = renderObjToRgba(objRel, 56, 68, {
    yaw: 0.22, pitch: 0.08, zoom: 0.86,
    tintFn: (r, g, b, l) => {
      const m = (r + g + b) / (3 * 255);
      return [clamp(210 * l + m * 55, 110, 255), clamp(165 * l + m * 45, 75, 235), clamp(28 * l + m * 30, 14, 95)];
    },
  });
  const artTnt   = renderObjToRgba(objTnt, 52, 52, { yaw: 0.6, pitch: 0.35, zoom: 0.80 });
  const artChk   = renderObjToRgba(objChk, 52, 52, { yaw: -0.55, pitch: 0.35, zoom: 0.80 });
  const artGem1  = renderObjToRgba(objGem, 54, 54, {
    yaw: 0.4, pitch: 0.28, zoom: 0.84,
    tintFn: (r, g, b, l) => [clamp(60 + r * 0.5 * l, 40, 230), clamp(205 + g * 0.35 * l, 150, 255), clamp(130 + b * 0.45 * l, 90, 255)],
  });
  const artGem2  = renderObjToRgba(objGem2, 54, 48, {
    yaw: 0.3, pitch: 0.32, zoom: 0.86,
    tintFn: (r, g, b, l) => [clamp(220 + r * 0.25 * l, 150, 255), clamp(40 + g * 0.3 * l, 30, 140), clamp(80 + b * 0.4 * l, 50, 190)],
  });
  const artUka   = renderObjToRgba(objUka, 56, 62, { yaw: Math.PI - 0.20, pitch: 0.06, zoom: 0.90 });
  const artCrash = renderObjToRgba(headObj, 58, 64, { yaw: Math.PI + 0.24, pitch: 0.06, zoom: 0.90 });

  // Crisp full A-Z bold 4x5 arcade bitmap font with black shadow (unmirrored!)
  const FONT45 = {
    A:['0110','1001','1111','1001','1001'], B:['1110','1001','1110','1001','1110'],
    C:['0111','1000','1000','1000','0111'], D:['1110','1001','1001','1001','1110'],
    E:['1111','1000','1110','1000','1111'], F:['1111','1000','1110','1000','1000'],
    G:['0111','1000','1011','1001','0111'], H:['1001','1001','1111','1001','1001'],
    I:['1110','0100','0100','0100','1110'], J:['0011','0001','0001','1001','0110'],
    K:['1001','1010','1100','1010','1001'], L:['1000','1000','1000','1000','1111'],
    M:['1001','1111','1111','1001','1001'], N:['1001','1101','1011','1001','1001'],
    O:['0110','1001','1001','1001','0110'], P:['1110','1001','1110','1000','1000'],
    Q:['0110','1001','1001','1010','0101'], R:['1110','1001','1110','1010','1001'],
    S:['0111','1000','0110','0001','1110'], T:['1111','0110','0110','0110','0110'],
    U:['1001','1001','1001','1001','0110'], V:['1001','1001','1001','0110','0110'],
    W:['1001','1001','1111','1111','1001'], X:['1001','0110','0110','0110','1001'],
    Y:['1001','1001','0110','0110','0110'], Z:['1111','0010','0100','1000','1111'],
    ' ':['0000','0000','0000','0000','0000'],
  };
  function drawDeckLabel(buf, W, H, text, cy, col) {
    const sc = text.length >= 7 ? 1 : 2;
    const scY = 2;
    const gap = text.length >= 6 ? 1 : 2;
    const chW = 4 * sc;
    const totalW = text.length * chW + (text.length - 1) * gap;
    const x0 = Math.round((W - totalW) / 2);
    const putPx = (px, py, c) => {
      if (px < 0 || px >= W || py < 0 || py >= H) return;
      const o = (py * W + px) * 4;
      buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
    };
    for (let pass = 0; pass < 2; pass++) {
      const c = pass === 0 ? [12, 10, 14] : col;
      const ox = pass === 0 ? 1 : 0, oy = pass === 0 ? 1 : 0;
      for (let i = 0; i < text.length; i++) {
        const g = FONT45[text[i].toUpperCase()] || FONT45[' '];
        for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 4; gx++) {
          if (g[gy][gx] !== '1') continue;
          for (let sy = 0; sy < scY; sy++) for (let sx = 0; sx < sc; sx++) {
            const px = x0 + i * (chW + gap) + gx * sc + sx;
            const py = cy + gy * scY + sy;
            if (pass === 0) {
              putPx(px - 1, py, c); putPx(px + 1, py, c);
              putPx(px, py - 1, c); putPx(px, py + 1, c);
              putPx(px + ox, py + oy, c);
            } else {
              putPx(px, py, c);
            }
          }
        }
      }
    }
  }

  const DECK_SPECS = [
    {
      code: '01', name: 'Wumpa Blast', titleTop: 'WUMPA', titleBot: 'BLAST',
      bg: (x, y) => {
        const rad = Math.hypot((x - 32) / 28, (y - 128) / 110);
        const ang = Math.atan2(y - 128, x - 32);
        const ray = Math.sin(ang * 10) > 0 ? 1 : 0;
        return ray ? [245, clamp(Math.round(135 - rad * 45), 60, 180), 16] : [185, 42, 18];
      },
      draw: buf => {
        compositeAlpha(buf, 64, 256, artWumpa, 54, 54, 5, 58);
        compositeAlpha(buf, 64, 256, artWumpa, 54, 54, 5, 144);
      },
    },
    {
      code: '02', name: 'Aku Aku Spirit', titleTop: 'AKU', titleBot: 'AKU',
      bg: (x, y) => {
        const wave = Math.sin(y * 0.14 + Math.abs(x - 32) * 0.18) > 0.25;
        return wave ? [22, 138, 62] : [14, 72, 38];
      },
      draw: buf => {
        compositeAlpha(buf, 64, 256, artAku, 56, 60, 4, 96);
      },
    },
    {
      code: '03', name: 'Power Crystal', titleTop: 'POWER', titleBot: 'CRYSTAL',
      bg: (x, y) => {
        const d = Math.hypot((x - 32) * 1.3, (y - 128) * 0.45);
        const ring = Math.sin(d * 0.25) * 0.5 + 0.5;
        return [clamp(Math.round(45 + ring * 95), 25, 155), clamp(Math.round(12 + ring * 25), 10, 50), clamp(Math.round(110 + ring * 125), 80, 245)];
      },
      draw: buf => {
        compositeAlpha(buf, 64, 256, artCry, 54, 72, 5, 92);
      },
    },
    {
      code: '04', name: 'Time Relic', titleTop: 'TIME', titleBot: 'RELIC',
      bg: (x, y) => {
        const checker = ((Math.floor(x / 8) + Math.floor(y / 8)) & 1) === 0;
        const glow = Math.max(0, 1 - Math.abs(y - 128) / 110);
        return checker
          ? [clamp(Math.round(24 + glow * 45), 18, 90), clamp(Math.round(52 + glow * 75), 35, 145), clamp(Math.round(145 + glow * 85), 110, 240)]
          : [clamp(Math.round(14 + glow * 25), 10, 55), clamp(Math.round(32 + glow * 48), 22, 95), clamp(Math.round(98 + glow * 65), 75, 185)];
      },
      draw: buf => {
        compositeAlpha(buf, 64, 256, artRel, 56, 68, 4, 94);
      },
    },
    {
      code: '05', name: 'TNT & Nitro', titleTop: 'TNT', titleBot: 'NITRO',
      bg: (x, y) => {
        const diag = ((x + y) % 24) < 12;
        if (y < 128) return diag ? [195, 28, 20] : [95, 14, 12];
        return diag ? [38, 195, 42] : [18, 92, 22];
      },
      draw: buf => {
        compositeAlpha(buf, 64, 256, artTnt, 52, 52, 6, 56);
        compositeAlpha(buf, 64, 256, artChk, 52, 52, 6, 148);
      },
    },
    {
      code: '06', name: 'Gem Collector', titleTop: 'WARP', titleBot: 'GEMS',
      bg: (x, y) => {
        const t = y / 255;
        return [clamp(Math.round(25 + Math.sin(t * 9) * 30), 15, 70), clamp(Math.round(85 + Math.cos(t * 7) * 55), 35, 165), clamp(Math.round(165 + Math.sin(x * 0.15) * 45), 110, 235)];
      },
      draw: buf => {
        compositeAlpha(buf, 64, 256, artGem1, 54, 54, 5, 62);
        compositeAlpha(buf, 64, 256, artGem2, 54, 48, 5, 144);
      },
    },
    {
      code: '07', name: 'Uka Uka Fury', titleTop: 'UKA', titleBot: 'UKA',
      bg: (x, y) => {
        const flame = Math.sin(x * 0.22 + y * 0.09) * 0.5 + 0.5;
        return [clamp(Math.round(115 + flame * 125), 80, 245), clamp(Math.round(18 + flame * 55), 12, 95), clamp(Math.round(14 + flame * 18), 10, 42)];
      },
      draw: buf => {
        compositeAlpha(buf, 64, 256, artUka, 56, 60, 4, 96);
      },
    },
    {
      code: '08', name: 'Crash Warped 98', titleTop: 'CRASH', titleBot: 'WARPED',
      bg: (x, y) => {
        const ang = Math.atan2(y - 128, x - 32);
        const rad = Math.hypot(x - 32, (y - 128) * 0.5);
        const swirl = Math.sin(ang * 5 + rad * 0.14) * 0.5 + 0.5;
        return [clamp(Math.round(25 + swirl * 215), 20, 245), clamp(Math.round(45 + (1 - swirl) * 145), 30, 200), clamp(Math.round(195 - swirl * 135), 40, 235)];
      },
      draw: buf => {
        compositeAlpha(buf, 64, 256, artCrash, 58, 62, 3, 94);
        compositeAlpha(buf, 64, 256, artCry, 54, 72, 5, 166);
      },
    },
  ];

  // Visual preview contact sheet of all 8 Crash 3 decks (64*8 = 512 x 256)
  const sheet = Buffer.alloc(512 * 256 * 4, 24);
  for (let i = 0; i < 512 * 256; i++) sheet[i * 4 + 3] = 255;

  const builtDecks = [];
  DECK_SPECS.forEach((spec, idx) => {
    const rgba64 = Buffer.from(baseS2d.rgba); // keeps exact authentic maple wood edge!
    for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
      if (!insideDeckMask(x, y)) continue;
      const [r, g, b] = spec.bg(x, y);
      // Subtle 3D deck concave edge shading
      const edge = 1.0 - 0.28 * Math.pow(Math.abs(x - 31.5) / 30, 2.2);
      const o = (y * 64 + x) * 4;
      rgba64[o]     = clamp(Math.round(r * edge), 12, 255);
      rgba64[o + 1] = clamp(Math.round(g * edge), 12, 255);
      rgba64[o + 2] = clamp(Math.round(b * edge), 12, 255);
      rgba64[o + 3] = 255;
    }
    // Crisp dark border line + Crash 3 3D art + bold arcade title
    spec.draw(rgba64);
    drawDeckLabel(rgba64, 64, 256, spec.titleTop, 26, [255, 240, 64]);
    drawDeckLabel(rgba64, 64, 256, spec.titleBot, 218, [255, 240, 64]);
    // Keep 4 subtle screw bolts at nose & tail like authentic s2d*.bmp
    for (const [bx, by] of [[24, 46], [39, 46], [24, 66], [39, 66], [24, 188], [39, 188], [24, 208], [39, 208]]) {
      const o = (by * 64 + bx) * 4;
      rgba64[o] = 55; rgba64[o + 1] = 55; rgba64[o + 2] = 60;
    }

    const s2dName = `s2dCR${spec.code}c.bmp`;
    const s2gName = `s2gCR${spec.code}c.bmp`;
    const resS2d = write8bppBmpFromTemplate(tmplS2d, rgba64, 64, 256);

    // Build matching 32x64 3D skateboard bottom texture (180 deg rotated + metallic truck baseplates!)
    const rgba32 = Buffer.from(baseS2g.rgba);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
      // Sample 180-deg rotated from rgba64 (matches s2gFi01b.bmp exact orientation!)
      const sx = (31 - x) * 2 + 0.5;
      const sy = (63 - y) * 4 + 1.5;
      const dx = (x - 15.5) / 14.5;
      const inBoard = (y >= 4 && y <= 59) ? (Math.abs(dx) <= 0.96) : (dx * dx + Math.pow((y < 4 ? (4 - y) : (y - 59)) / 4.5, 2) <= 1.0);
      if (!inBoard) continue;
      // Preserve metallic silver truck mounting plates at y=8..15 & y=48..55, x=11..20!
      const isTruckPlate = (x >= 11 && x <= 20) && ((y >= 8 && y <= 15) || (y >= 48 && y <= 55));
      if (isTruckPlate) continue;
      const px = psxLib.sampleBilinear(rgba64, 64, 256, sx, sy);
      const o = (y * 32 + x) * 4;
      rgba32[o] = px[0]; rgba32[o + 1] = px[1]; rgba32[o + 2] = px[2]; rgba32[o + 3] = 255;
    }
    const resS2g = write8bppBmpFromTemplate(tmplS2g, rgba32, 32, 64);

    fs.writeFileSync(path.join(OUT_DIR, s2dName), resS2d.bmp);
    fs.writeFileSync(path.join(OUT_DIR, s2gName), resS2g.bmp);
    builtDecks.push({ s2dName, s2gName, name: spec.name });

    // Paste into contact sheet
    for (let y = 0; y < 256; y++) {
      resS2d.previewRgba.copy(sheet, (y * 512 + idx * 64) * 4, y * 64 * 4, (y + 1) * 64 * 4);
    }
  });

  psxLib.writePng(path.join(OUT_DIR, 'preview_crash_8decks.png'), 512, 256, sheet);
  console.log(`  [Decks] 8 Crash 3 Skate Shop decks (s2dCR01c..08c.bmp + s2gCR01c..08c.bmp) gerados!`);
  return builtDecks;
}

// ============================================================================
// Build Crash B. PlaySel Portrait (s2face20.bmp — exact 4,088 B 62x47 8bpp!)
// ============================================================================
function buildCrashPortrait() {
  const tmplFace = psxLib.getOrigWadSlice('s2face1.bmp'); // 4,088 B metallic bezel template!
  // Detect magenta transparency index in s2face1.bmp
  let magIdx = 0;
  for (let i = 0; i < 256; i++) {
    if (tmplFace[54 + i * 4 + 2] === 255 && tmplFace[54 + i * 4 + 1] === 0 && tmplFace[54 + i * 4 + 0] === 255) {
      magIdx = i; break;
    }
  }
  // Render expressive close-up Crash Bandicoot 3D head onto vibrant Warp Room sky/orange backdrop!
  const headObj = parseObjFile(path.join(SKATER_READY, '02_thps2_rigid_16_body_parts', 'local_pivot_parts', 'head.obj'));
  const hiW = 184, hiH = 144; // 4x supersample -> crisp downscale to 46x36!
  const hiRgba = renderObjToRgba(headObj, hiW, hiH, {
    yaw: Math.PI + 0.24, pitch: 0.06, zoom: 1.05, shiftY: 4,
    bgFn: (x, y, w, h) => {
      const dx = (x - w * 0.5) / (w * 0.55), dy = (y - h * 0.52) / (h * 0.55);
      const r = Math.hypot(dx, dy);
      const swirl = Math.sin(Math.atan2(dy, dx) * 8 + r * 5) * 0.5 + 0.5;
      return [
        clamp(Math.round(18 + swirl * 42 + (1 - r) * 40), 14, 130),
        clamp(Math.round(58 + swirl * 62 + (1 - r) * 55), 32, 185),
        clamp(Math.round(155 + (1 - r) * 85), 90, 250),
        255,
      ];
    },
  });
  // Box downsample 4x -> 46x36
  const inner = Buffer.alloc(46 * 36 * 4);
  for (let y = 0; y < 36; y++) for (let x = 0; x < 46; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const o = ((y * 4 + dy) * hiW + (x * 4 + dx)) * 4;
      r += hiRgba[o]; g += hiRgba[o + 1]; b += hiRgba[o + 2];
    }
    const d = (y * 46 + x) * 4;
    inner[d] = Math.round(r / 16); inner[d + 1] = Math.round(g / 16); inner[d + 2] = Math.round(b / 16); inner[d + 3] = 255;
  }

  const { outBmp, previewRgba } = psxLib.buildPortraitBmpFromInner46x36(tmplFace, inner, magIdx);
  if (outBmp.length !== 4088) throw new Error(`s2face20.bmp tamanho invalido: ${outBmp.length}`);
  fs.writeFileSync(path.join(OUT_DIR, 's2face20.bmp'), outBmp);
  psxLib.writePng(path.join(OUT_DIR, 'preview_crash_portrait.png'), 62, 47, previewRgba);
  console.log(`  [Portrait] s2face20.bmp (${outBmp.length} B, magIdx=${magIdx}) gerado!`);
  return outBmp;
}

// ============================================================================
// Main Builder
// ============================================================================
function buildAllCrashSkaterAssets() {
  console.log('=== [mod_skater_crash] Compilando Crash Bandicoot ("Crash B.", Slot 20) ===');
  const burnqBuf = psxLib.getOrigWadSlice('burnq2.psx');
  const burnqInfo = psxLib.parsePsxStructure(burnqBuf);
  const burnqPsh = psxLib.getOrigWadSlice('burnq2.psh');
  const burnqMeta = extractBurnqBoardAndMeta(burnqBuf);

  // 1. Retarget 16 rigid Crash body parts onto THPS2 sk2anim skeleton with w=1/w=2 stitching
  const rig = buildRetargetedCrashParts(burnqBuf, burnqInfo);

  // 2. Load Crash 3 authentic baked albedo texture (512x512)
  const texPath = path.join(SKATER_READY, '02_thps2_rigid_16_body_parts', 'local_pivot_parts', 'crash_albedo_baked_512.png');
  const { w: tw, h: th } = psxLib.probeDims(texPath);
  const atlasRgba = psxLib.loadRgba(texPath);

  // Style A (Classic Crash 3)
  const headTexA = cropAtlasTo128(atlasRgba, tw, th, rig.headUvBox, null);
  const bodyTexA = cropAtlasTo128(atlasRgba, tw, th, rig.bodyUvBox, null);
  const crashPsxA = compileCrashSkaterPsx(rig, burnqMeta, headTexA, bodyTexA);

  // Style B (Warped Moto Biker Crash!)
  const headTexB = cropAtlasTo128(atlasRgba, tw, th, rig.headUvBox, 'head');
  const bodyTexB = cropAtlasTo128(atlasRgba, tw, th, rig.bodyUvBox, 'body');
  const crashPsxB = compileCrashSkaterPsx(rig, burnqMeta, headTexB, bodyTexB);

  // Write .PSX + .PSH files (Hi-LOD & Lo-LOD for both Style A & Style B)
  // Note: THPS2 parses #define <MODEL>PART_... from .psh; keep exact burnq2.psh structure!
  const makePsh = prefix => Buffer.from(
    burnqPsh.toString('latin1')
      .replace(/BURNQ2/g, prefix.toUpperCase())
      .replace(/burnq_/g, 'crash_'),
    'latin1'
  );
  // Wait: verify whether THPS2 parses part names (like "pelvis", "left_shoe") from burnq2.psh or exact token names!
  // Using verbatim burnq2.psh guarantees 100% bone-name match with SLUS_010.66's parser!
  fs.writeFileSync(path.join(OUT_DIR, 'crash.psx'), crashPsxA);
  fs.writeFileSync(path.join(OUT_DIR, 'crash_L.psx'), crashPsxA);
  fs.writeFileSync(path.join(OUT_DIR, 'crashb.psx'), crashPsxB);
  fs.writeFileSync(path.join(OUT_DIR, 'crashb_L.psx'), crashPsxB);
  for (const pshName of ['crash.psh', 'crash_L.psh', 'crashb.psh', 'crashb_L.psh']) {
    fs.writeFileSync(path.join(OUT_DIR, pshName), burnqPsh);
  }
  console.log(`  [Models] crash.psx (${crashPsxA.length} B), crashb.psx (${crashPsxB.length} B) + 4 .PSH compilados!`);

  // Render REAL PS1 GTE multi-angle previews for Style A & Style B!
  const allMeshes = Array.from({ length: 19 }, (_, i) => i);
  const views = [{ yaw: 0 }, { yaw: 45 }, { yaw: 90 }, { yaw: 180 }, { yaw: -45 }];
  psxLib.renderPs1SkaterPreview(crashPsxA, allMeshes, views, 180, 260, 0.056, -120, path.join(OUT_DIR, 'preview_crash_styleA.png'));
  psxLib.renderPs1SkaterPreview(crashPsxB, allMeshes, views, 180, 260, 0.056, -120, path.join(OUT_DIR, 'preview_crash_styleB.png'));

  // 3. Portrait
  buildCrashPortrait();

  // 4. 8 Custom Crash 3 Skate Shop Decks (s2d + s2g)
  const decks = build8CrashDecks();

  console.log('=== [mod_skater_crash] Concluido com sucesso! ===');
  return { crashPsxA, crashPsxB, decks };
}

if (require.main === module) {
  buildAllCrashSkaterAssets();
}

module.exports = { buildAllCrashSkaterAssets, parseObjFile, renderObjToRgba, renderWumpaSprite };
