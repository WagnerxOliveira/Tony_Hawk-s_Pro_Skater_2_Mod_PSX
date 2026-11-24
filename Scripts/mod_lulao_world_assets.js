#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) — Lulao World Assets Builder
 *
 * Reproducibly derives from originals_backup/CD.WAD (NEVER mutating backups!)
 * and builds + injects three custom 3D/texture world assets with ZERO CD.WAD offset shift:
 *
 *  1. items.psx   (WAD[8],  20 sectors = 40,960 B):
 *     Appends sculpted 3D uppercase letter 'X' (M[13], hash 0x58585858) matching
 *     Neversoft's native S-K-A-T-E italic geometry, scale, UV, and golden RGBs gradient.
 *     Dynamically spawned exclusively for Lulao (Slot 2) via Hook @ 0x80035D68 -> T-A-X-A-S.
 *
 *  2. skhan_o.psx (WAD[14], 122,236 B exact) & skhan_o2.psx (WAD[1109], exact):
 *     Replaces the Hangar Barrel (M[9], hash 0x4eb2c689) FLAMMABLE diamond with the
 *     iconic Brazilian Cachaça / Pinga 51 shield logo (ti=26, 64x64 256c) + top lid "51"
 *     stencil (ti=25, 64x64 16c). Exact same file size -> 0 bytes shifted.
 *
 *  3. skven_o.psx (WAD[1103], 5 sectors = 10,240 B) + skven_l.psx (WAD[1102], exact):
 *     Replaces the Venice Beach Spray Can (M[4], hash 0xa09e4e74) with a sculpted 8-sided
 *     3D "Garrafa de Pitu" glass bottle (40 verts, 38 quads, curved shoulder, slim neck,
 *     red screw cap) wrapped with a crisp double-sided "PITU" + red shrimp label in
 *     skven_l.psx T[127] (48x48 256c), glass base T[128] (32x32 16c), red cap T[129] (16x16 16c).
 *
 * Usage:
 *   node tools/mod_lulao_world_assets.js              # builds & patches CD.WAD + CD.HED
 *   node tools/mod_lulao_world_assets.js --preview    # also renders multi-angle PS1 3D QA PNGs
 *   node tools/mod_lulao_world_assets.js --dry-run --preview  # preview only, no CD.WAD/HED write
 */

const fs = require('fs');
const path = require('path');
const psxLib = require('./psx_skater_lib');
const haddadDilma = require('./mod_collectibles_haddad_dilma');

const ROOT = psxLib.rootDir;
const BACKUP_DIR = psxLib.backupDir;
const clamp = psxLib.clamp;
const lerp = psxLib.lerp;

const HASH_X_LETTER   = 0x58585858;
const HASH_BARREL_BDY = 0xd8113bf8;
const HASH_BARREL_LID = 0x5734bab8;
const HASH_SPRAY_MESH = 0xa09e4e74;
const HASH_SPRAY_BDY  = 0x0d3629b1;
const HASH_SPRAY_BOT  = 0x2beb7a83;
const HASH_SPRAY_CAP  = 0x28e700aa;

// ============================================================================
// Low-level PSX / Geometry Helpers
// ============================================================================

function parseHed(buf) {
  const entries = [];
  for (let off = 0; off + 12 <= buf.length; off += 12) {
    const hash = buf.readUInt32LE(off);
    const offset = buf.readUInt32LE(off + 4);
    const size = buf.readUInt32LE(off + 8);
    if (hash === 0xffffffff) break;
    entries.push({ idx: entries.length, hash, offset, size });
  }
  return entries;
}

function getOrigEntry(idx) {
  const hed = parseHed(fs.readFileSync(path.join(BACKUP_DIR, 'CD.HED')));
  const wad = fs.readFileSync(path.join(BACKUP_DIR, 'CD.WAD'));
  const e = hed[idx];
  return { ...e, buf: Buffer.from(wad.subarray(e.offset, e.offset + e.size)) };
}

function decodePsxTextureRgba(psxBuf, tex) {
  const rgba = Buffer.alloc(tex.w * tex.h * 4);
  if (!tex.palInfo) return rgba;
  if (tex.palSize === 256) {
    for (let p = 0; p < tex.w * tex.h; p++) {
      const ci = psxBuf[tex.dataOff + p];
      const v = psxBuf.readUInt16LE(tex.palInfo.offset + ci * 2);
      rgba[p * 4 + 0] = Math.round((v & 0x1f) * 255 / 31);
      rgba[p * 4 + 1] = Math.round(((v >> 5) & 0x1f) * 255 / 31);
      rgba[p * 4 + 2] = Math.round(((v >> 10) & 0x1f) * 255 / 31);
      rgba[p * 4 + 3] = v === 0 ? 0 : 255;
    }
  } else {
    const stride = Math.ceil(tex.w / 2);
    for (let y = 0; y < tex.h; y++) {
      for (let x = 0; x < tex.w; x++) {
        const b = psxBuf[tex.dataOff + y * stride + (x >> 1)];
        const ci = (x & 1) ? (b >> 4) : (b & 0xf);
        const v = psxBuf.readUInt16LE(tex.palInfo.offset + ci * 2);
        const p = y * tex.w + x;
        rgba[p * 4 + 0] = Math.round((v & 0x1f) * 255 / 31);
        rgba[p * 4 + 1] = Math.round(((v >> 5) & 0x1f) * 255 / 31);
        rgba[p * 4 + 2] = Math.round(((v >> 10) & 0x1f) * 255 / 31);
        rgba[p * 4 + 3] = v === 0 ? 0 : 255;
      }
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

/**
 * Verifies THPS2 PS1 front-facing winding law (proven empirically on M[6] T & Spray M[4]):
 * In THPS2 right-handed (X, Y_down, Z) space, front-facing NCLIP > 0 requires
 * dot((v1 - v0) x (v2 - v0), outwardNormal) < 0 for BOTH triangles (0,1,2) and (1,3,2)!
 */
function assertPs1QuadWinding(verts, vIdx, outNorm, label) {
  const p0 = verts[vIdx[0]], p1 = verts[vIdx[1]], p2 = verts[vIdx[2]], p3 = verts[vIdx[3]];
  const c1 = vecCross(vecSub(p1, p0), vecSub(p2, p0));
  const c2 = vecCross(vecSub(p3, p1), vecSub(p2, p1));
  const d1 = vecDot(c1, outNorm);
  const d2 = vecDot(c2, outNorm);
  if (d1 >= -1 || d2 >= -1) {
    throw new Error(`PS1 winding violation in ${label}: d1=${d1.toFixed(1)}, d2=${d2.toFixed(1)}, v=${JSON.stringify(vIdx)}`);
  }
}

/**
 * Serializes a THPS2 .PSX mesh block (28-byte header + nV*8 + nN*8 + faces).
 * Every quad face is 28 bytes:
 *   +0x00 uint16 flags (0x0803 / 0x1803 Gouraud quad, 0x0003 / 0x1003 Flat quad)
 *   +0x02 uint16 len   (28)
 *   +0x04 uint8[4] v   ([v0, v1, v2, v3] Z-order: TL, TR, BL, BR)
 *   +0x08 uint8[4] rgb (RGBs indices when bit 11 set, else [r,g,b,0x2c])
 *   +0x0C uint16 ni    (normal index)
 *   +0x0E uint16 surf  (0)
 *   +0x10 uint32 ti    (texture index)
 *   +0x14 uint8[8] uv  ([u0,v0, u1,v1, u2,v2, u3,v3])
 */
function serializeMesh({ unk0 = 8, verts, norms, faces }) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9, maxR = 0;
  for (const [x, y, z] of verts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    const r = Math.hypot(x, y, z);
    if (r > maxR) maxR = r;
  }
  const rad = Math.ceil(maxR) * 4096;
  const totalBytes = 28 + verts.length * 8 + norms.length * 8 + faces.length * 28;
  const buf = Buffer.alloc(totalBytes, 0);

  buf.writeUInt16LE(unk0, 0);
  buf.writeUInt16LE(verts.length, 2);
  buf.writeUInt16LE(norms.length, 4);
  buf.writeUInt16LE(faces.length, 6);
  buf.writeUInt32LE(rad >>> 0, 8);
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
    buf[off + 4] = f.v[0]; buf[off + 5] = f.v[1]; buf[off + 6] = f.v[2]; buf[off + 7] = f.v[3];
    buf[off + 8] = f.rgb[0]; buf[off + 9] = f.rgb[1]; buf[off + 10] = f.rgb[2]; buf[off + 11] = f.rgb[3];
    buf.writeUInt16LE(f.ni, off + 12);
    buf.writeUInt16LE(0, off + 14);
    buf.writeUInt32LE(f.ti, off + 16);
    for (let k = 0; k < 8; k++) buf[off + 20 + k] = f.uv[k];
    off += 28;
  }
  return buf;
}

/**
 * Find exact file offset of meshHashes, texHashes, and texOffs table inside any .PSX file.
 */
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

  let texOffsPos = -1, nTex = 0;
  if (cur + 4 <= buf.length) {
    const nPal4 = buf.readUInt32LE(cur); cur += 4 + nPal4 * (4 + 32);
    if (cur + 4 <= buf.length) {
      const nPal8 = buf.readUInt32LE(cur); cur += 4 + nPal8 * (4 + 512);
      if (cur + 4 <= buf.length) {
        nTex = buf.readUInt32LE(cur);
        texOffsPos = cur;
      }
    }
  }
  const texturesWithHash = p.textures.map(t => ({ ...t, hash: texHashes[t.texIdx] }));
  return { ...p, textures: texturesWithHash, meshHashesOff, texHashesOff, numTexHashes, texHashes, texOffsPos, nTex };
}

function writeQuantizedTex(buf, tex, q) {
  if (!tex.palInfo) throw new Error(`Paleta ausente em tex[${tex.i}]`);
  for (let c = 0; c < tex.palSize; c++) {
    buf.writeUInt16LE(q.palBgr555[c], tex.palInfo.offset + c * 2);
  }
  if (tex.palSize === 256) {
    q.indices.copy(buf, tex.dataOff);
  } else {
    q.packed.copy(buf, tex.dataOff);
  }
}

// ============================================================================
// PART 1: Build Sculpted 3D Uppercase Letter 'X' in items.psx (WAD[8])
// ============================================================================

function buildLetterXMesh() {
  // Bold sporty forward-italic uppercase 'X' matching S, K, A, T, E in items.psx!
  // Note: In M[5] A & M[6] T, top shifts slightly toward +X and bottom toward -X (e.g. T top [-42..+47], bottom [-36..-9]),
  // so viewed from FRONT (Z=+17, yaw=0 looking at +Z? No, camera in front of +Z looks toward -Z -> +X is LEFT -> top leans RIGHT on screen!).
  // Wait: match exact same top-vs-bottom X bias as M[5] A (top center +25, bot center 0) & M[6] T (top +2.5, bot -22.5):
  // top center = -8, bottom center = +8 gives matching forward italic '/' when viewed from front (+Z)!
  const pts2d = [
    [-46, -51], //  0: TL outer
    [-20, -51], //  1: TL inner
    [ -3, -20], //  2: Top V-notch
    [+14, -51], //  3: TR inner
    [+40, -51], //  4: TR outer
    [+16,  -1], //  5: Right waist
    [+48, +50], //  6: BR outer
    [+22, +50], //  7: BR inner
    [ +3, +19], //  8: Bottom V-notch
    [-16, +50], //  9: BL inner
    [-42, +50], // 10: BL outer
    [-18,  +1], // 11: Left waist
  ];

  // Vertices 0..11 = Front (Z = +17), 12..23 = Back (Z = -16)
  const verts = [];
  for (const [x, y] of pts2d) verts.push([x, y, +17]);
  for (const [x, y] of pts2d) verts.push([x, y, -16]);

  const norms = [];
  const faces = [];

  // Map Y (-51..+50) -> authentic items.psx gold-to-amber RGBs gradient (exact match to M[5] A & M[6] T!)
  const frontRgbsForY = (y) => {
    if (y <= -35) return 177; // [215, 184, 61] bright sunlit gold top
    if (y <= -10) return 164; // [205, 174, 56] warm mid-top gold
    if (y <= +10) return 109; // [182, 139, 29] rich gold waist
    if (y <= +30) return 94;  // [171, 123, 26] amber-gold
    return 77;                // [156, 105, 23] deep amber base
  };
  const backRgbsForY = (y) => {
    if (y <= -35) return 160; // [201, 170, 60]
    if (y <= -10) return 150; // [194, 162, 58]
    if (y <= +10) return 105; // [178, 136, 29]
    if (y <= +30) return 89;  // [168, 118, 23]
    return 68;                // [149, 97, 21]
  };
  const uvFront = (x, y) => [
    clamp(Math.round((x + 48) / 98 * 14), 0, 14),
    clamp(Math.round((y + 51) / 101 * 14), 0, 14),
  ];

  // 5 convex quads covering the entire 'X' silhouette (in right-handed screen CW order [TL, TR, BL, BR])
  // Wait: remember Z=+17 outward normal is (0, 0, +4096).
  // For dot((v1-v0) x (v2-v0), (0,0,+1)) < 0, we need (v1-v0)_x*(v2-v0)_y - (v1-v0)_y*(v2-v0)_x < 0!
  // That means swapping the horizontal order [TR, TL, BR, BL] on Z=+17 (exact match to M[6] T F[9] v=[0,1,6,3]!),
  // and keeping [TL, TR, BL, BR] on Z=-16 (outward normal (0, 0, -4096) -> cross_z > 0 -> dot < 0)!
  const faceQuads = [
    // [TL, TR, BL, BR] in standard 2D (+X right, +Y down)
    [0,  1, 11, 2],  // Top-Left diagonal arm
    [3,  4,  2, 5],  // Top-Right diagonal arm
    [2,  5, 11, 8],  // Center hub diamond
    [11, 8, 10, 9],  // Bottom-Left diagonal arm
    [8,  5,  7, 6],  // Bottom-Right diagonal arm
  ];

  // Front faces (Z = +17, outward normal [0, 0, +4095]) -> swap columns: [TR, TL, BR, BL]
  for (let qi = 0; qi < faceQuads.length; qi++) {
    const [tl, tr, bl, br] = faceQuads[qi];
    const v = [tr, tl, br, bl];
    const outN = [0, 0, 4095];
    assertPs1QuadWinding(verts, v, outN, `X_front_${qi}`);
    const ni = norms.length;
    norms.push(outN);
    const uv = [];
    const rgb = [];
    for (const idx of v) {
      const [u, vv] = uvFront(verts[idx][0], verts[idx][1]);
      uv.push(u, vv);
      rgb.push(frontRgbsForY(verts[idx][1]));
    }
    faces.push({ fl: 0x0803, v, rgb, ni, ti: 3, uv });
  }

  // Back faces (Z = -16, outward normal [0, 0, -4095]) -> [TL+12, TR+12, BL+12, BR+12]
  for (let qi = 0; qi < faceQuads.length; qi++) {
    const [tl, tr, bl, br] = faceQuads[qi];
    const v = [tl + 12, tr + 12, bl + 12, br + 12];
    const outN = [0, 0, -4095];
    assertPs1QuadWinding(verts, v, outN, `X_back_${qi}`);
    const ni = norms.length;
    norms.push(outN);
    const uv = [];
    const rgb = [];
    for (const idx of v) {
      const [u, vv] = uvFront(verts[idx][0], verts[idx][1]);
      uv.push(u, vv);
      rgb.push(backRgbsForY(verts[idx][1]));
    }
    faces.push({ fl: 0x0803, v, rgb, ni, ti: 3, uv });
  }

  // 12 extruded side walls around the CW perimeter i -> j = (i+1)%12
  for (let i = 0; i < 12; i++) {
    const j = (i + 1) % 12;
    const dx = pts2d[j][0] - pts2d[i][0];
    const dy = pts2d[j][1] - pts2d[i][1];
    // For CW perimeter in +X right / +Y down, outward normal is (+dy, -dx, 0)!
    const outN = vecNorm4096([dy, -dx, 0]);
    // Check quad [i, j, i+12, j+12]:
    // e1 = (dx, dy, 0), e2 = (0, 0, -33) -> e1 x e2 = (-33*dy, +33*dx, 0) = -33 * outN -> dot < 0!
    const v = [i, j, i + 12, j + 12];
    assertPs1QuadWinding(verts, v, outN, `X_side_${i}`);
    const ni = norms.length;
    norms.push(outN);

    // Match Neversoft's lighting contrast on M[5] A & M[6] T:
    // Top surfaces = gleaming highlight (229), Right-lit bevels = bright white-mod gold (fl=0x0003),
    // Bottom/Left shadows = crisp dark bronze-gold bevel (ti=4) for dramatic 3D depth!
    const nx = outN[0] / 4095, ny = outN[1] / 4095;
    const v0y = clamp(Math.round((pts2d[i][1] + 51) / 101 * 10), 0, 10);
    const v1y = clamp(Math.round((pts2d[j][1] + 51) / 101 * 10), 0, 10);
    if (ny < -0.5) {
      // Bright top edge
      faces.push({ fl: 0x0803, v, rgb: [229, 226, 229, 226], ni, ti: 3, uv: [7, 0, 8, 0, 7, 0, 8, 0] });
    } else if (nx > 0.35 && ny <= 0.35) {
      // Sunlit right edge (matching M[5] F[7] & M[6] F[5])
      faces.push({ fl: 0x0003, v, rgb: [255, 255, 255, 0x2c], ni, ti: 3, uv: [11, v0y, 11, v1y, 11, v0y, 11, v1y] });
    } else if (ny > 0.5) {
      // Underside shadow
      faces.push({ fl: 0x0803, v, rgb: [14, 10, 14, 10], ni, ti: 4, uv: [5, 10, 6, 10, 5, 10, 6, 10] });
    } else {
      // Medium-dark bronze bevel
      faces.push({ fl: 0x0803, v, rgb: [46, 68, 46, 68], ni, ti: 4, uv: [6, v0y, 6, v1y, 6, v0y, 6, v1y] });
    }
  }

  return serializeMesh({ unk0: 8, verts, norms, faces });
}

function buildItemsPsxWithX() {
  const orig = getOrigEntry(8).buf;
  const info = inspectPsxTables(orig);
  const xMesh = buildLetterXMesh();

  // Original layout of items.psx:
  //   0x000..0x00B (12 B): header (ver, flags, ptrMeta)
  //   0x00C..0x1DF (13*36 = 468 B): numObjs + objs[0..12]
  //     (Wait: check header size! 0x000=ver(4), 0x004=ptrMeta(4), 0x008=numObjs(4), 0x00C=objs[0..12])
  //   0x1E0 (4 B): numMeshes (13)
  //   0x1E4..0x217 (13*4 = 52 B): meshOffs[0..12]
  //   0x218..0x2CAF: meshData[0..12]
  //   0x2CB0 (ptrMeta)..0x306B: tags (RGBs) + 0xFFFFFFFF
  //   0x306C..0x309F (13*4 = 52 B): meshHashes[0..12]
  //   0x30A0..EOF: texHashes + palettes + texOffs[0..12] + texData
  const numObjs = orig.readUInt32LE(8);
  const objsEnd = 12 + numObjs * 36;
  const numMeshes = orig.readUInt32LE(objsEnd);
  const meshOffsStart = objsEnd + 4;
  const meshDataStart = meshOffsStart + numMeshes * 4;
  if (meshDataStart !== info.meshOffs[0]) {
    throw new Error(`items.psx header mismatch: expected 0x${info.meshOffs[0].toString(16)}, got 0x${meshDataStart.toString(16)}`);
  }

  // Delta in bytes:
  //   +36 B (obj[13]) + 4 B (meshOffs[13]) = +40 B before meshDataStart
  //   +xMesh.length appended at end of meshData (before ptrMeta)
  //   +4 B (meshHashes[13]) after meshHashes[12]
  const hdrDelta = 40;
  const metaDelta = hdrDelta + xMesh.length;
  const tailDelta = metaDelta + 4;

  // Build obj[13] modeled identically to obj[5] ('A'), with meshIdx = 13
  const newObj = Buffer.from(orig.subarray(12 + 5 * 36, 12 + 6 * 36));
  newObj.writeUInt16LE(numMeshes, 22); // meshIdx = 13

  const newMeshOffs = Buffer.alloc((numMeshes + 1) * 4);
  for (let i = 0; i < numMeshes; i++) {
    newMeshOffs.writeUInt32LE(info.meshOffs[i] + hdrDelta, i * 4);
  }
  const xMeshOff = info.ptrMeta + hdrDelta;
  newMeshOffs.writeUInt32LE(xMeshOff, numMeshes * 4);

  // Assemble header + objs[0..13] + numMeshes + meshOffs[0..13]
  const hdrBuf = Buffer.from(orig.subarray(0, objsEnd));
  hdrBuf.writeUInt32LE(info.ptrMeta + metaDelta, 4); // ptrMeta
  hdrBuf.writeUInt32LE(numObjs + 1, 8);              // numObjs = 14

  const objsCombined = Buffer.concat([hdrBuf, newObj]);
  // CRITICAL: Update ptrRgbs (+32) in EVERY obj[0..13]!
  for (let i = 0; i <= numObjs; i++) {
    const o = 12 + i * 36;
    const oldRgbs = objsCombined.readUInt32LE(o + 32);
    if (oldRgbs >= info.ptrMeta) {
      objsCombined.writeUInt32LE(oldRgbs + metaDelta, o + 32);
    }
  }

  const numMeshesBuf = Buffer.alloc(4);
  numMeshesBuf.writeUInt32LE(numMeshes + 1, 0);

  const meshDataOrig = orig.subarray(meshDataStart, info.ptrMeta);
  const metaToHashesEnd = orig.subarray(info.ptrMeta, info.texHashesOff);
  const newHashBuf = Buffer.alloc(4);
  newHashBuf.writeUInt32LE(HASH_X_LETTER >>> 0, 0);

  const tailBuf = Buffer.from(orig.subarray(info.texHashesOff));
  // Shift every texOff in tailBuf by +tailDelta!
  const relTexOffsPos = info.texOffsPos - info.texHashesOff;
  for (let i = 0; i < info.nTex; i++) {
    const pos = relTexOffsPos + 4 + i * 4;
    tailBuf.writeUInt32LE(tailBuf.readUInt32LE(pos) + tailDelta, pos);
  }

  const out = Buffer.concat([
    objsCombined,
    numMeshesBuf,
    newMeshOffs,
    meshDataOrig,
    xMesh,
    metaToHashesEnd,
    newHashBuf,
    tailBuf,
  ]);

  const maxBytes = Math.ceil(orig.length / 2048) * 2048;
  if (out.length > maxBytes) {
    throw new Error(`items.psx overflow: ${out.length} B > ${maxBytes} B (20 sectors)!`);
  }
  // Self-verify parseable by psxLib!
  const check = psxLib.parsePsxStructure(out);
  if (check.numMeshes !== 14 || check.meshHashes[13] !== HASH_X_LETTER || check.textures.length !== info.textures.length) {
    throw new Error(`items.psx self-check failed! numMeshes=${check.numMeshes} hash13=0x${(check.meshHashes[13]||0).toString(16)} tex=${check.textures.length}`);
  }
  console.log(`  [PSX] items.psx: ${orig.length} B -> ${out.length} B (+${out.length - orig.length} B, livre na faixa de 20 setores: ${maxBytes - out.length} B), M[13] 'X' hash=0x${HASH_X_LETTER.toString(16)} (${xMesh.length} B)`);
  return out;
}

// ============================================================================
// Crisp Procedural 2D Canvas Primitives (for Pinga 51 & Garrafa de Pitu Art)
// ============================================================================

function blendPx(rgba, W, H, x, y, r, g, b, a) {
  const ix = Math.round(x), iy = Math.round(y);
  if (ix < 0 || ix >= W || iy < 0 || iy >= H || a <= 0) return;
  const o = (iy * W + ix) * 4;
  const k = clamp(a, 0, 1);
  rgba[o + 0] = Math.round(lerp(rgba[o + 0], r, k));
  rgba[o + 1] = Math.round(lerp(rgba[o + 1], g, k));
  rgba[o + 2] = Math.round(lerp(rgba[o + 2], b, k));
  rgba[o + 3] = 255;
}

function fillRect(rgba, W, H, x0, y0, x1, y1, r, g, b, a = 1) {
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.floor(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.floor(x1)); x++) {
      blendPx(rgba, W, H, x, y, r, g, b, a);
    }
  }
}

function fillEllipse(rgba, W, H, cx, cy, rx, ry, r, g, b, a = 1) {
  for (let y = Math.max(0, Math.floor(cy - ry - 1)); y <= Math.min(H - 1, Math.ceil(cy + ry + 1)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx - 1)); x <= Math.min(W - 1, Math.ceil(cx + rx + 1)); x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d <= 1.0) {
        const edge = clamp((1.0 - d) * Math.min(rx, ry) * 1.4, 0, 1);
        blendPx(rgba, W, H, x, y, r, g, b, a * edge);
      }
    }
  }
}

function drawGlyphRows(rgba, W, H, rows, x0, y0, color, outlineColor = null) {
  if (outlineColor) {
    for (let gy = 0; gy < rows.length; gy++) {
      for (let gx = 0; gx < rows[gy].length; gx++) {
        if (rows[gy][gx] !== '#') continue;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            blendPx(rgba, W, H, x0 + gx + ox, y0 + gy + oy, outlineColor[0], outlineColor[1], outlineColor[2], outlineColor[3] ?? 0.9);
          }
        }
      }
    }
  }
  for (let gy = 0; gy < rows.length; gy++) {
    for (let gx = 0; gx < rows[gy].length; gx++) {
      if (rows[gy][gx] !== '#') continue;
      blendPx(rgba, W, H, x0 + gx, y0 + gy, color[0], color[1], color[2], color[3] ?? 1.0);
    }
  }
}

// ============================================================================
// PART 2: Hangar Barrels -> Iconic Cachaça / Pinga 51 Logo (skhan_o & skhan_o2)
// ============================================================================

// Bold iconic "51" bitmap (12x17 each digit -> ultra crisp & unmistakable at 64x64!)
const GLYPH_5_BIG = [
  '.##########.',
  '###########.',
  '###########.',
  '###.........',
  '###.........',
  '###..#####..',
  '##########..',
  '###########.',
  '###.....###.',
  '........###.',
  '........###.',
  '........###.',
  '###.....###.',
  '###########.',
  '.##########.',
  '..########..',
];

const GLYPH_1_BIG = [
  '....####....',
  '..######....',
  '.#######....',
  '########....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '....####....',
  '.##########.',
  '############',
  '############',
];

const MINI_3x5 = {
  'A': ['.#.','#.#','###','#.#','#.#'],
  'B': ['##.','#.#','##.','#.#','##.'],
  'C': ['###','#..','#..','#..','###'],
  'D': ['##.','#.#','#.#','#.#','##.'],
  'E': ['###','#..','##.','#..','###'],
  'G': ['###','#..','#.#','#.#','###'],
  'H': ['#.#','#.#','###','#.#','#.#'],
  'I': ['###','.#.','.#.','.#.','###'],
  'L': ['#..','#..','#..','#..','###'],
  'N': ['###','#.#','#.#','#.#','#.#'],
  'O': ['###','#.#','#.#','#.#','###'],
  'P': ['###','#.#','###','#..','#..'],
  'R': ['##.','#.#','##.','#.#','#.#'],
  'S': ['###','#..','###','..#','###'],
  '5': ['###','#..','###','..#','###'],
  '1': ['.#.','##.','.#.','.#.','###'],
  ' ': ['...','...','...','...','...'],
};

function drawMiniText(rgba, W, H, text, cx, y0, color) {
  const s = text.toUpperCase();
  const totalW = s.length * 4 - 1;
  const sx = Math.round(cx - totalW / 2);
  for (let i = 0; i < s.length; i++) {
    const g = MINI_3x5[s[i]] || MINI_3x5[' '];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
      if (g[y][x] === '#') blendPx(rgba, W, H, sx + i * 4 + x, y0 + y, color[0], color[1], color[2], 1);
    }
  }
}

function paintPinga51BarrelTextures(psxBuf) {
  const info = inspectPsxTables(psxBuf);
  const bodyTex = info.textures.find(t => t.hash === HASH_BARREL_BDY);
  const lidTex  = info.textures.find(t => t.hash === HASH_BARREL_LID);
  if (!bodyTex || !lidTex) throw new Error('Texturas de barril (0xd8113bf8 / 0x5734bab8) nao encontradas!');

  // ---- 1. Barrel Body (64x64 256-color) ----
  const origBody = decodePsxTextureRgba(psxBuf, bodyTex);
  const body = Buffer.from(origBody);
  const W = bodyTex.w, H = bodyTex.h;

  // Cleanly erase the original red FLAMMABLE diamond (x=11..53, y=2..42)
  // by sampling the authentic weathered steel drum columns at x=5..11 and x=53..59!
  for (let y = 2; y <= 42; y++) {
    for (let x = 11; x <= 53; x++) {
      const o = (y * W + x) * 4;
      const r = origBody[o], g = origBody[o + 1], b = origBody[o + 2];
      // Replace entire diamond footprint cleanly with drum steel + horizontal ribs from side columns
      const dx = Math.abs(x - 32), dy = Math.abs(y - 20);
      if (dx + dy <= 24 || (r - g > 22 && r - b > 22)) {
        const srcX = (x & 1) ? (5 + ((x * 3 + y) % 6)) : (54 + ((x * 5 + y) % 6));
        const so = (y * W + srcX) * 4;
        body[o + 0] = origBody[so + 0];
        body[o + 1] = origBody[so + 1];
        body[o + 2] = origBody[so + 2];
        body[o + 3] = 255;
      }
    }
  }

  // Paint the ICONIC Brazilian Cachaça / Pinga 51 Crest centered at (32, 31)
  // Fits 100% cleanly within x = 11..53 (F[7]+F[4] and F[11]+F[8] on BOTH sides of barrel!)
  const cx = 32, cy = 31;
  // Outer dark crimson medallion border + golden double-ring + crisp cream-white shield
  fillEllipse(body, W, H, cx, cy, 20.5, 22.5, 130, 12, 16, 1.0);
  fillEllipse(body, W, H, cx, cy, 19.0, 21.0, 228, 178, 42, 1.0);
  fillEllipse(body, W, H, cx, cy, 17.5, 19.5, 198, 22, 26, 1.0);
  fillEllipse(body, W, H, cx, cy, 15.8, 17.6, 250, 245, 232, 1.0);

  // Classic red top banner ribbon ("PINGA") + bottom red ribbon ("BRASIL")
  fillRect(body, W, H, cx - 14, cy - 16, cx + 14, cy - 10, 192, 18, 24, 0.96);
  drawMiniText(body, W, H, 'PINGA', cx, cy - 15, [255, 246, 204]);

  fillRect(body, W, H, cx - 14, cy + 10, cx + 14, cy + 16, 192, 18, 24, 0.96);
  drawMiniText(body, W, H, 'BRASIL', cx, cy + 11, [255, 234, 124]);

  // Massive unmistakable BOLD RED "51" right in the dead center of the medallion!
  drawGlyphRows(body, W, H, GLYPH_5_BIG, cx - 12, cy - 8, [208, 16, 22, 1.0], [242, 196, 62, 0.85]);
  drawGlyphRows(body, W, H, GLYPH_1_BIG, cx + 1,  cy - 8, [208, 16, 22, 1.0], [242, 196, 62, 0.85]);
  // Crisp dark inner drop shadow on bottom-right edge of "51" for extra pop
  drawGlyphRows(body, W, H, GLYPH_5_BIG, cx - 12, cy - 8, [196, 14, 20, 1.0], null);
  drawGlyphRows(body, W, H, GLYPH_1_BIG, cx + 1,  cy - 8, [196, 14, 20, 1.0], null);

  // Subtle metallic barrel-rib shading over the painted emblem so it looks genuinely printed on steel
  for (const ry of [21, 42]) {
    for (let x = 12; x <= 52; x++) {
      const o = (ry * W + x) * 4;
      body[o] = Math.round(body[o] * 0.88);
      body[o + 1] = Math.round(body[o + 1] * 0.88);
      body[o + 2] = Math.round(body[o + 2] * 0.88);
    }
  }

  const qBody = psxLib.quantizeImageForPsx(body, W, H, 256, -1, 0.22);
  writeQuantizedTex(psxBuf, bodyTex, qBody);

  // ---- 2. Barrel Lid (64x64 16-color) ----
  const lid = decodePsxTextureRgba(psxBuf, lidTex);
  const LW = lidTex.w, LH = lidTex.h;
  // Paint vintage crimson & cream "51" stencil right in the center of the steel drum lid (avoiding bung at x=8..14)
  fillEllipse(lid, LW, LH, 36, 32, 16.5, 16.5, 178, 22, 26, 0.90);
  fillEllipse(lid, LW, LH, 36, 32, 14.0, 14.0, 236, 226, 206, 0.92);
  drawGlyphRows(lid, LW, LH, GLYPH_5_BIG, 25, 24, [186, 18, 24, 1.0], null);
  drawGlyphRows(lid, LW, LH, GLYPH_1_BIG, 37, 24, [186, 18, 24, 1.0], null);

  const qLid = psxLib.quantize4BitForPsx(lid, LW, LH, -1, 0.22);
  writeQuantizedTex(psxBuf, lidTex, qLid);

  return { bodyRgba: body, lidRgba: lid };
}

// ============================================================================
// PART 3: Venice Beach -> 3D Sculpted "Garrafa de Pitu" (skven_o + skven_l)
// ============================================================================

// Bold crisp 7x9 font for "PITÚ" -> fits cleanly inside the front bottle panels with glass margin!
const PITU_GLYPHS = {
  'P': [
    '######.',
    '#######',
    '##...##',
    '##...##',
    '#######',
    '######.',
    '##.....',
    '##.....',
    '##.....',
  ],
  'I': [
    '.#####.',
    '.#####.',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '.#####.',
    '.#####.',
  ],
  'T': [
    '#######',
    '#######',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
  ],
  'U': [
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '#######',
    '.#####.',
  ],
};

// Iconic curved crimson Pitú Shrimp / Camarão silhouette (22x10)
const PITU_SHRIMP = [
  '....##.........#####..',
  '..##.#.......########.',
  '.#....##..###########.',
  '........#############.',
  '.....################.',
  '....############..###.',
  '...####..######....##.',
  '..###.....#####.......',
  '.##........##.##......',
  '............#..#......',
];

function buildPituBottleMesh() {
  // 8-sided sculpted Brazilian Garrafa de Pitú glass bottle (40 verts, 38 quads, 38 normals):
  //   Ring 0 (Base bottom):     Y = +80, r = 25
  //   Ring 1 (Body top):        Y = -12, r = 26  (tall cylindrical body -> HUGE readable "PITÚ" label!)
  //   Ring 2 (Curved shoulder): Y = -38, r = 12
  //   Ring 3 (Slim neck top):   Y = -72, r = 9
  //   Ring 4 (Cap top):         Y = -88, r = 10  (shiny red Pitú cap!)
  const rings = [
    { y: +80, r: 25 },
    { y: -12, r: 26 },
    { y: -38, r: 12 },
    { y: -72, r:  9 },
    { y: -88, r: 10 },
  ];
  const N = 8;
  const verts = [];
  for (const ring of rings) {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI * 0.5; // start at -90 deg (-Z)
      verts.push([Math.round(Math.cos(a) * ring.r), ring.y, Math.round(Math.sin(a) * ring.r)]);
    }
  }

  // Balanced Venice Beach sunlit Gouraud shading indices from skven_o.psx RGBs (gleaming glass without blowout!)
  // RGBs: 57=[192,192,192], 56=[181,183,184], 49=[143,146,148], 43=[128,128,128], 38=[115,119,122]
  const colShade = [49, 57, 56, 49, 43, 38, 43, 49];

  const norms = [];
  const faces = [];

  // Helper to emit an 8-quad cylindrical/conical band between ring lo (bottom) and ring hi (top)
  // Remember: as i increases (i -> j), we move from VIEWER'S LEFT to VIEWER'S RIGHT when looking from outside!
  // Quad [TL, TR, BL, BR] = [top(i), top(j), bot(i), bot(j)] -> proven PS1 front-facing & u increases left->right!
  const addBand = (ringBot, ringTop, ti, vTop, vBot, wrapRepeats = 2, uMax = 47) => {
    const panelsPerRepeat = N / wrapRepeats; // 4 panels per 180 deg = 2 full labels around bottle!
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const vTL = ringTop * N + i;
      const vTR = ringTop * N + j;
      const vBL = ringBot * N + i;
      const vBR = ringBot * N + j;
      const v = [vTL, vTR, vBL, vBR];

      // Outward face normal (accounting for conical slope on shoulder!)
      const midA = ((i + 0.5) / N) * Math.PI * 2 - Math.PI * 0.5;
      const dr = rings[ringBot].r - rings[ringTop].r;
      const dy = rings[ringBot].y - rings[ringTop].y; // positive (+Y down)
      // Outward normal for cone r(y) = rTop + (dr/dy)*(y-yTop) is (dy*cos, -dr, dy*sin)
      const outN = vecNorm4096([dy * Math.cos(midA), -dr, dy * Math.sin(midA)]);
      assertPs1QuadWinding(verts, v, outN, `Pitu_band_${ringBot}_${ringTop}_${i}`);

      const ni = norms.length;
      norms.push(outN);

      const seg = i % panelsPerRepeat;
      const u0 = Math.round((seg / panelsPerRepeat) * uMax);
      const u1 = Math.round(((seg + 1) / panelsPerRepeat) * uMax);
      const cL = colShade[i], cR = colShade[j];
      faces.push({
        fl: 0x1803,
        v,
        rgb: [cL, cR, cL, cR],
        ni,
        ti,
        uv: [u0, vTop, u1, vTop, u0, vBot, u1, vBot],
      });
    }
  };

  // Band 0 -> 1: Bottle Body with iconic "PITÚ" label (v = 19..47 on 48x48 T[127], ti=9)
  addBand(0, 1, 9, 19, 47, 2, 47);
  // Band 1 -> 2: Curved Glass Shoulder (v = 10..19 on 48x48 T[127], ti=9)
  addBand(1, 2, 9, 10, 19, 2, 47);
  // Band 2 -> 3: Slim Glass Neck + Red Collar (v = 0..10 on 48x48 T[127], ti=9)
  addBand(2, 3, 9, 0, 10, 2, 47);
  // Band 3 -> 4: Red Metallic Pitú Screw Cap (v = 0..15 on 16x16 T[129], ti=11)
  addBand(3, 4, 11, 0, 15, 2, 15);

  // Close Octagonal Cap Top (Ring 4, Y = -88, outward normal [0, -4095, 0], ti=11 16x16)
  // An octagon decomposes cleanly into 3 convex quads!
  // Let's check winding for normal (0, -4095, 0): need cross_y > 0!
  // Ring 4 vertices go CW when viewed from ABOVE (+Y down): (cos a, -88, sin a).
  // Wait: from ABOVE looking down (+Y), x=cos a goes right, z=sin a goes UP-or-DOWN?
  // e1 x e2 y-component is e1_z*e2_x - e1_x*e2_z. Let's pick [v0,v1,v2,v3] and assert winding!
  const capBase = 4 * N;
  const capQuads = [
    [capBase + 1, capBase + 0, capBase + 2, capBase + 7],
    [capBase + 2, capBase + 7, capBase + 3, capBase + 6],
    [capBase + 3, capBase + 6, capBase + 4, capBase + 5],
  ];
  for (let qi = 0; qi < capQuads.length; qi++) {
    const v = capQuads[qi];
    const outN = [0, -4095, 0];
    assertPs1QuadWinding(verts, v, outN, `Pitu_capTop_${qi}`);
    const ni = norms.length;
    norms.push(outN);
    const uv = [];
    for (const idx of v) {
      uv.push(
        clamp(Math.round((verts[idx][0] + 10) / 20 * 14) + 1, 0, 15),
        clamp(Math.round((verts[idx][2] + 10) / 20 * 14) + 1, 0, 15)
      );
    }
    faces.push({ fl: 0x1803, v, rgb: [62, 62, 57, 57], ni, ti: 11, uv });
  }

  // Close Octagonal Bottle Bottom (Ring 0, Y = +80, outward normal [0, +4095, 0], ti=10 32x32)
  const botQuads = [
    [0, 1, 7, 2],
    [7, 2, 6, 3],
    [6, 3, 5, 4],
  ];
  for (let qi = 0; qi < botQuads.length; qi++) {
    const v = botQuads[qi];
    const outN = [0, 4095, 0];
    assertPs1QuadWinding(verts, v, outN, `Pitu_bot_${qi}`);
    const ni = norms.length;
    norms.push(outN);
    const uv = [];
    for (const idx of v) {
      uv.push(
        clamp(Math.round((verts[idx][0] + 24) / 48 * 30) + 1, 0, 31),
        clamp(Math.round((verts[idx][2] + 24) / 48 * 30) + 1, 0, 31)
      );
    }
    faces.push({ fl: 0x1803, v, rgb: [43, 43, 43, 43], ni, ti: 10, uv });
  }

  return serializeMesh({ unk0: 8, verts, norms, faces });
}

function buildSkvenOPsxWithPitu() {
  const orig = getOrigEntry(1103).buf;
  const info = inspectPsxTables(orig);
  const sprayIdx = info.meshHashes.indexOf(HASH_SPRAY_MESH);
  if (sprayIdx !== 4) throw new Error(`Spray mesh 0xa09e4e74 esperado em M[4], encontrado em M[${sprayIdx}]!`);

  const oldStart = info.meshOffs[sprayIdx];
  const oldEnd = (sprayIdx + 1 < info.numMeshes) ? info.meshOffs[sprayIdx + 1] : info.ptrMeta;
  const oldSize = oldEnd - oldStart;

  const pituMesh = buildPituBottleMesh();
  const delta = pituMesh.length - oldSize;

  const out = Buffer.concat([
    Buffer.from(orig.subarray(0, oldStart)),
    pituMesh,
    Buffer.from(orig.subarray(oldEnd)),
  ]);

  // Update ptrMeta (+0x04)
  out.writeUInt32LE(info.ptrMeta + delta, 4);

  // CRITICAL: Update ptrRgbs (+32) in EVERY obj[0..numObjs-1]!
  const numObjs = out.readUInt32LE(8);
  for (let i = 0; i < numObjs; i++) {
    const o = 12 + i * 36;
    const oldRgbs = out.readUInt32LE(o + 32);
    if (oldRgbs >= info.ptrMeta) {
      out.writeUInt32LE(oldRgbs + delta, o + 32);
    }
  }

  // Update meshOffs[sprayIdx + 1 .. numMeshes - 1]
  const meshOffsStart = 12 + numObjs * 36 + 4;
  for (let i = sprayIdx + 1; i < info.numMeshes; i++) {
    const pos = meshOffsStart + i * 4;
    out.writeUInt32LE(out.readUInt32LE(pos) + delta, pos);
  }

  const maxBytes = Math.ceil(orig.length / 2048) * 2048;
  if (out.length > maxBytes) {
    throw new Error(`skven_o.psx overflow: ${out.length} B > ${maxBytes} B (5 sectors)!`);
  }

  const check = psxLib.parsePsxStructure(out);
  if (check.numMeshes !== info.numMeshes || check.meshHashes[4] !== HASH_SPRAY_MESH) {
    throw new Error(`skven_o.psx self-check failed!`);
  }
  console.log(`  [PSX] skven_o.psx: ${orig.length} B -> ${out.length} B (+${delta} B, livre na faixa de 5 setores: ${maxBytes - out.length} B), M[4] Garrafa Pitu (${pituMesh.length} B, 40v/38f)`);
  return out;
}

function paintPituBottleTextures(skvenLBuf) {
  const info = inspectPsxTables(skvenLBuf);
  const bodyTex = info.textures.find(t => t.hash === HASH_SPRAY_BDY);
  const botTex  = info.textures.find(t => t.hash === HASH_SPRAY_BOT);
  const capTex  = info.textures.find(t => t.hash === HASH_SPRAY_CAP);
  if (!bodyTex || !botTex || !capTex) {
    throw new Error('Texturas do spray em skven_l.psx nao encontradas!');
  }

  // ---- 1. Bottle Body + Neck + Shoulder + Iconic PITÚ Label (48x48 256-color) ----
  const W = bodyTex.w, H = bodyTex.h; // 48 x 48
  const body = Buffer.alloc(W * H * 4);

  // Fill realistic translucent clear/pale-green cachaça glass with crisp vertical specular reflections!
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Specular glass streaks at x ~ 9 and x ~ 38
      const spec1 = Math.exp(-Math.pow((x - 9) / 2.6, 2));
      const spec2 = Math.exp(-Math.pow((x - 38) / 2.2, 2)) * 0.55;
      const edgeDark = 1.0 - 0.24 * Math.pow((x - 24) / 24, 2);
      // Classic Pitú pale-green cachaça glass tint (rich enough to show clearly under Venice sunlight!)
      let r = (146 * edgeDark) + spec1 * 76 + spec2 * 52;
      let g = (182 * edgeDark) + spec1 * 56 + spec2 * 44;
      let b = (164 * edgeDark) + spec1 * 62 + spec2 * 48;
      // Shoulder glass reflection band (y = 10..19)
      if (y >= 10 && y < 19) {
        const sh = Math.exp(-Math.pow((y - 14) / 2.5, 2));
        r += sh * 26; g += sh * 28; b += sh * 26;
      }
      // Thick bottle glass base (y = 44..47)
      if (y >= 44) {
        r *= 0.74; g *= 0.84; b *= 0.79;
      }
      const o = (y * W + x) * 4;
      body[o + 0] = clamp(Math.round(r), 10, 255);
      body[o + 1] = clamp(Math.round(g), 10, 255);
      body[o + 2] = clamp(Math.round(b), 10, 255);
      body[o + 3] = 255;
    }
  }

  // Red & Gold Pitú Neck Collar Label (y = 2..7)
  fillRect(body, W, H, 0, 2, W - 1, 7, 198, 20, 26, 0.96);
  fillRect(body, W, H, 0, 2, W - 1, 2, 245, 210, 68, 1.0);
  fillRect(body, W, H, 0, 7, W - 1, 7, 245, 210, 68, 1.0);
  fillRect(body, W, H, 15, 4, 33, 5, 252, 248, 236, 0.92);

  // Iconic Rectangular PITÚ Main Label (y = 21..43, x = 4..43 -> leaves clear glass border on sides so ENTIRE "PITÚ" reads straight-on!)
  fillRect(body, W, H, 4, 21, 43, 43, 198, 20, 26, 1.0);
  fillRect(body, W, H, 5, 22, 42, 42, 244, 206, 56, 1.0);
  fillRect(body, W, H, 6, 23, 41, 41, 254, 252, 244, 1.0);

  // Warm yellow glow oval behind the iconic Pitú Shrimp (y = 23..31)
  fillEllipse(body, W, H, 24, 27, 12, 4.0, 255, 234, 134, 0.72);
  // Iconic Crimson-Red Pitú Shrimp / Camarão silhouette (centered at x=13..34, y=22..31)
  drawGlyphRows(body, W, H, PITU_SHRIMP, 13, 22, [212, 18, 24, 1.0], [140, 10, 14, 0.45]);

  // Bold, ULTRA-CRISP "PITÚ" lettering across y = 32..40!
  // 4 letters x 7 px + 3 x 2 px gaps = 34 px wide -> centered at x = 7..40 (3 px inside white label!)
  const pituColor = [196, 12, 20, 1.0];
  const pituShadow = [242, 196, 58, 0.55];
  drawGlyphRows(body, W, H, PITU_GLYPHS['P'], 7,  32, pituColor, pituShadow);
  drawGlyphRows(body, W, H, PITU_GLYPHS['I'], 16, 32, pituColor, pituShadow);
  drawGlyphRows(body, W, H, PITU_GLYPHS['T'], 25, 32, pituColor, pituShadow);
  drawGlyphRows(body, W, H, PITU_GLYPHS['U'], 34, 32, pituColor, pituShadow);
  // Crisp acute accent (´) above 'U' -> "PITÚ"!
  blendPx(body, W, H, 37, 30, 196, 12, 20, 1.0);
  blendPx(body, W, H, 38, 30, 196, 12, 20, 1.0);
  blendPx(body, W, H, 38, 29, 196, 12, 20, 1.0);
  blendPx(body, W, H, 39, 29, 196, 12, 20, 1.0);

  // Subtle curved bottle sheen across the label
  for (let y = 21; y <= 43; y++) {
    for (let x = 4; x <= 43; x++) {
      const sh = Math.exp(-Math.pow((x - 10) / 2.2, 2)) * 0.12;
      const o = (y * W + x) * 4;
      body[o + 0] = clamp(Math.round(lerp(body[o + 0], 255, sh)), 0, 255);
      body[o + 1] = clamp(Math.round(lerp(body[o + 1], 255, sh)), 0, 255);
      body[o + 2] = clamp(Math.round(lerp(body[o + 2], 255, sh)), 0, 255);
    }
  }

  const qBody = psxLib.quantizeImageForPsx(body, W, H, 256, -1, 0.12);
  writeQuantizedTex(skvenLBuf, bodyTex, qBody);

  // ---- 2. Bottle Glass Base (32x32 16-color) ----
  const BW = botTex.w, BH = botTex.h;
  const bot = Buffer.alloc(BW * BH * 4);
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const d = Math.hypot(x - BW / 2, y - BH / 2) / (BW / 2);
      const ring = Math.exp(-Math.pow((d - 0.72) / 0.18, 2));
      const r = clamp(Math.round(118 + ring * 64), 16, 240);
      const g = clamp(Math.round(156 + ring * 68), 24, 248);
      const b = clamp(Math.round(138 + ring * 60), 20, 242);
      const o = (y * BW + x) * 4;
      bot[o] = r; bot[o + 1] = g; bot[o + 2] = b; bot[o + 3] = 255;
    }
  }
  const qBot = psxLib.quantize4BitForPsx(bot, BW, BH, -1, 0.25);
  writeQuantizedTex(skvenLBuf, botTex, qBot);

  // ---- 3. Red Metallic Pitú Screw Cap (16x16 16-color) ----
  const CW = capTex.w, CH = capTex.h;
  const cap = Buffer.alloc(CW * CH * 4);
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const ridge = (x & 1) ? 1.06 : 0.88;
      const topRim = (y <= 1 || y >= CH - 2) ? 1.15 : 1.0;
      const spec = Math.exp(-Math.pow((x - 4) / 2.2, 2)) * 55;
      const o = (y * CW + x) * 4;
      cap[o + 0] = clamp(Math.round(212 * ridge * topRim + spec), 20, 255);
      cap[o + 1] = clamp(Math.round(22 * ridge + spec * 0.7), 8, 245);
      cap[o + 2] = clamp(Math.round(26 * ridge + spec * 0.7), 8, 245);
      cap[o + 3] = 255;
    }
  }
  // Golden ring near base of cap
  fillRect(cap, CW, CH, 0, CH - 3, CW - 1, CH - 2, 242, 200, 58, 0.95);
  const qCap = psxLib.quantize4BitForPsx(cap, CW, CH, -1, 0.15);
  writeQuantizedTex(skvenLBuf, capTex, qCap);

  return { bodyRgba: body, botRgba: bot, capRgba: cap };
}

// ============================================================================
// Accurate PS1 Right-Handed Multi-Angle Preview Renderer (exact PS1 GTE view!)
// ============================================================================

function renderPs1MeshPreview(meshPsxBuf, texSourcePsxBuf, meshIndices, views, cellW, cellH, sc, outPath) {
  const mInfo = inspectPsxTables(meshPsxBuf);
  const tInfo = inspectPsxTables(texSourcePsxBuf);

  // Build hash->decoded texture map from texSourcePsxBuf
  const texByHash = new Map();
  for (const t of tInfo.textures) {
    texByHash.set(t.hash, { ...t, rgba: decodePsxTextureRgba(texSourcePsxBuf, t) });
  }
  const texHashes = mInfo.texHashes;

  // Parse RGBs table if present in meshPsxBuf
  const rgbs = [];
  let cur = mInfo.ptrMeta;
  while (cur + 4 <= meshPsxBuf.length) {
    const tag = meshPsxBuf.readUInt32LE(cur);
    if (tag === 0xffffffff) break;
    const sz = meshPsxBuf.readUInt32LE(cur + 4);
    if (tag === 0x73424752) { // 'RGBs'
      for (let i = 0; i < Math.floor(sz / 4); i++) {
        const o = cur + 8 + i * 4;
        rgbs.push([meshPsxBuf[o], meshPsxBuf[o + 1], meshPsxBuf[o + 2]]);
      }
    }
    cur += 8 + sz;
  }

  function loadMesh(mi) {
    const mo = mInfo.meshOffs[mi];
    const mEnd = (mi + 1 < mInfo.numMeshes) ? mInfo.meshOffs[mi + 1] : mInfo.ptrMeta;
    const nV = meshPsxBuf.readUInt16LE(mo + 2), nN = meshPsxBuf.readUInt16LE(mo + 4), nF = meshPsxBuf.readUInt16LE(mo + 6);
    const vOff = mo + 28, fOff = vOff + nV * 8 + nN * 8;
    const verts = [];
    for (let i = 0; i < nV; i++) {
      verts.push([meshPsxBuf.readInt16LE(vOff + i * 8), meshPsxBuf.readInt16LE(vOff + i * 8 + 2), meshPsxBuf.readInt16LE(vOff + i * 8 + 4)]);
    }
    const faces = [];
    let fp = fOff;
    for (let fi = 0; fi < nF && fp + 4 <= mEnd; fi++) {
      const fl = meshPsxBuf.readUInt16LE(fp), fLen = meshPsxBuf.readUInt16LE(fp + 2);
      if (fLen < 12 || fp + fLen > mEnd) break;
      const v = [meshPsxBuf[fp + 4], meshPsxBuf[fp + 5], meshPsxBuf[fp + 6], meshPsxBuf[fp + 7]];
      const rgb = [meshPsxBuf[fp + 8], meshPsxBuf[fp + 9], meshPsxBuf[fp + 10], meshPsxBuf[fp + 11]];
      const isTri = (fl & 0x10) !== 0;
      const isGouraud = (fl & 0x0800) !== 0;
      const ti = fLen >= 20 ? meshPsxBuf.readUInt32LE(fp + 16) : -1;
      const uvs = fLen >= 28 ? [
        [meshPsxBuf[fp + 20], meshPsxBuf[fp + 21]],
        [meshPsxBuf[fp + 22], meshPsxBuf[fp + 23]],
        [meshPsxBuf[fp + 24], meshPsxBuf[fp + 25]],
        [meshPsxBuf[fp + 26], meshPsxBuf[fp + 27]],
      ] : [];
      faces.push({ fl, isTri, isGouraud, v, rgb, ti, uvs });
      fp += fLen;
    }
    return { mi, verts, faces };
  }

  const meshes = meshIndices.map(loadMesh);
  const W = cellW * views.length, H = cellH;
  const img = Buffer.alloc(W * H * 4, 28);
  for (let i = 0; i < W * H; i++) img[i * 4 + 3] = 255;

  views.forEach((vw, vi) => {
    const ox = vi * cellW + cellW * 0.5, oy = cellH * 0.5;
    const zbuf = new Float32Array(cellW * cellH).fill(1e9);
    const yaw = (vw.yaw || 0) * Math.PI / 180;
    const pitch = (vw.pitch || 0) * Math.PI / 180;
    const cY = Math.cos(yaw), sY = Math.sin(yaw);
    const cP = Math.cos(pitch), sP = Math.sin(pitch);

    // Exact PS1 GTE right-handed camera looking down +Z (+X right, +Y down, +Z depth into screen!)
    const proj = (p, xOff = 0) => {
      const x0 = p[0] + xOff, y0 = p[1], z0 = p[2];
      const rx = x0 * cY + z0 * sY;
      const rz0 = -x0 * sY + z0 * cY;
      const ry = y0 * cP - rz0 * sP;
      const rz = y0 * sP + rz0 * cP;
      return { sx: ox + rx * sc, sy: oy + ry * sc, sz: rz };
    };

    const drawTri = (p0, p1, p2, uv0, uv1, uv2, c0, c1, c2, tex) => {
      // REAL PS1 GTE NCLIP back-face culling: cull if area <= 0!
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
          if (z < zbuf[zi]) {
            zbuf[zi] = z;
            let tr = 200, tg = 200, tb = 200;
            if (tex && uv0) {
              const u = ((Math.round(w0 * uv0[0] + w1 * uv1[0] + w2 * uv2[0]) % tex.w) + tex.w) % tex.w;
              const vv = clamp(Math.round(w0 * uv0[1] + w1 * uv1[1] + w2 * uv2[1]), 0, tex.h - 1);
              const to = (vv * tex.w + u) * 4;
              tr = tex.rgba[to]; tg = tex.rgba[to + 1]; tb = tex.rgba[to + 2];
            }
            const vr = w0 * c0[0] + w1 * c1[0] + w2 * c2[0];
            const vg = w0 * c0[1] + w1 * c1[1] + w2 * c2[1];
            const vb = w0 * c0[2] + w1 * c1[2] + w2 * c2[2];
            const o = (y * W + x) * 4;
            img[o + 0] = clamp(Math.round(tr * vr / 128), 0, 255);
            img[o + 1] = clamp(Math.round(tg * vg / 128), 0, 255);
            img[o + 2] = clamp(Math.round(tb * vb / 128), 0, 255);
            img[o + 3] = 255;
          }
        }
      }
    };

    const spacing = vw.spacing || 0;
    const xStart = -((meshes.length - 1) * spacing) / 2;
    meshes.forEach((m, idx) => {
      const xOff = xStart + idx * spacing;
      for (const f of m.faces) {
        const th = texHashes[f.ti];
        const tex = texByHash.get(th) || null;
        const p0 = proj(m.verts[f.v[0]], xOff);
        const p1 = proj(m.verts[f.v[1]], xOff);
        const p2 = proj(m.verts[f.v[2]], xOff);
        const p3 = f.isTri ? null : proj(m.verts[f.v[3]], xOff);
        const getCol = (k) => {
          if (f.isGouraud && rgbs[f.rgb[k]]) return rgbs[f.rgb[k]];
          return [f.rgb[0] || 128, f.rgb[1] || 128, f.rgb[2] || 128];
        };
        const c0 = getCol(0), c1 = getCol(1), c2 = getCol(2), c3 = f.isTri ? c0 : getCol(3);
        drawTri(p0, p1, p2, f.uvs[0], f.uvs[1], f.uvs[2], c0, c1, c2, tex);
        if (!f.isTri && p3) {
          drawTri(p1, p3, p2, f.uvs[1], f.uvs[3], f.uvs[2], c1, c3, c2, tex);
        }
      }
    });
  });

  psxLib.writePng(outPath, W, H, img);
}

// ============================================================================
// Main Orchestrator: Build, Verify, Optional Preview, Inject CD.WAD + CD.HED
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const doPreview = args.includes('--preview');
  const dryRun = args.includes('--dry-run');
  const previewDirArg = args.find(a => a.startsWith('--preview-dir='));
  const previewDir = previewDirArg
    ? previewDirArg.slice('--preview-dir='.length)
    : path.join(ROOT, 'build', 'qa_world_assets');

  console.log('=== THPS2 Lulao World Assets Builder (3D X + Pinga 51 + 3D Pitu + 3D Haddad + 3D Dilma) ===');

  // 1. items.psx (WAD[8]) with 3D uppercase 'X' (M[13])
  const itemsPsx = buildItemsPsxWithX();

  // 2. skhan_o.psx (WAD[14]) + skhan_o2.psx (WAD[1109]) with Pinga 51 barrels + 3D Haddad (M[8])
  let skhanO = getOrigEntry(14).buf;
  const barrelArts = paintPinga51BarrelTextures(skhanO);
  console.log(`  [PSX] skhan_o.psx:  Barril Pinga 51 aplicado (ti=26 64x64 256c + ti=25 64x64 16c)`);

  let skhanO2 = getOrigEntry(1109).buf;
  paintPinga51BarrelTextures(skhanO2);
  console.log(`  [PSX] skhan_o2.psx: Barril Pinga 51 (2P) aplicado`);

  const hadTex = haddadDilma.buildHaddadTexture64();
  const hadRes1 = haddadDilma.patchHangarHaddadInPsx(skhanO, 'skhan_o.psx', hadTex);
  const hadRes2 = haddadDilma.patchHangarHaddadInPsx(skhanO2, 'skhan_o2.psx', hadTex);
  skhanO = hadRes1.buf;
  skhanO2 = hadRes2.buf;
  console.log(`  [PSX] skhan_o.psx:  ${hadRes1.origSize} -> ${hadRes1.newSize} / ${hadRes1.maxBytes} B -> 3D Haddad M[8] (${hadRes1.stats.nV}v/${hadRes1.stats.nF}f, 64x64 16c)`);
  console.log(`  [PSX] skhan_o2.psx: ${hadRes2.origSize} -> ${hadRes2.newSize} / ${hadRes2.maxBytes} B -> 3D Haddad M[8] (2P)`);

  // 3. skven_o.psx (WAD[1103]) + skven_l.psx (WAD[1102]) with 3D Garrafa de Pitú
  const skvenO = buildSkvenOPsxWithPitu();
  const skvenL = getOrigEntry(1102).buf;
  const pituArts = paintPituBottleTextures(skvenL);
  console.log(`  [PSX] skven_l.psx:  ${skvenL.length} B (exato, 0 B shift) -> Rotulo PITU + Camarao (48x48 256c) + base vidro + tampa vermelha`);

  // 4. sksl2_o.psx (WAD[1095]) + sksl2_l.psx (WAD[1094]) + sksl2_l2.psx (WAD[1096]) with 3D Dilma no Barril (M[5])
  const dilTex = haddadDilma.buildDilmaTexture40x64();
  const dilRes = haddadDilma.patchSchool2Dilma(
    getOrigEntry(1095).buf,
    getOrigEntry(1094).buf,
    getOrigEntry(1096).buf,
    dilTex
  );
  const sksl2O = dilRes.newO, sksl2L = dilRes.newL, sksl2L2 = dilRes.newL2;
  console.log(`  [PSX] sksl2_o.psx:  ${dilRes.sizes.o[0]} -> ${dilRes.sizes.o[1]} / ${dilRes.sizes.o[2]} B -> 3D Dilma no Barril M[5] (${dilRes.stats.nV}v/${dilRes.stats.nF}f)`);
  console.log(`  [PSX] sksl2_l.psx:  ${dilRes.sizes.l[0]} -> ${dilRes.sizes.l[1]} / ${dilRes.sizes.l[2]} B -> Textura 0xfc079202 (40x64 16c)`);
  console.log(`  [PSX] sksl2_l2.psx: ${dilRes.sizes.l2[0]} -> ${dilRes.sizes.l2[1]} / ${dilRes.sizes.l2[2]} B -> Textura 0xfc079202 (2P, 40x64 16c)`);

  if (doPreview) {
    fs.mkdirSync(previewDir, { recursive: true });
    // Render T-A-X-A-S lineup in real PS1 GTE projection (yaw=0 shows front face!)
    renderPs1MeshPreview(itemsPsx, itemsPsx, [6, 5, 13, 5, 3], [
      { yaw: 0, pitch: 0, spacing: 118 },
    ], 580, 180, 0.85, path.join(previewDir, 'taxas_lineup_ps1.png'));
    renderPs1MeshPreview(itemsPsx, itemsPsx, [13], [
      { yaw: 0, pitch: 0 }, { yaw: 35, pitch: 12 }, { yaw: -35, pitch: -10 }, { yaw: 180, pitch: 0 },
    ], 160, 160, 1.05, path.join(previewDir, 'letter_X_angles_ps1.png'));

    // Render Hangar Pinga 51 barrel (texture + lid + 3D multi-angle!)
    psxLib.writePng(path.join(previewDir, 'hangar_barrel_51_body.png'), 64, 64, barrelArts.bodyRgba);
    psxLib.writePng(path.join(previewDir, 'hangar_barrel_51_lid.png'), 64, 64, barrelArts.lidRgba);
    renderPs1MeshPreview(skhanO, skhanO, [9], [
      { yaw: 0, pitch: 10 }, { yaw: 35, pitch: 12 }, { yaw: 90, pitch: 15 }, { yaw: 180, pitch: 10 },
    ], 160, 160, 0.92, path.join(previewDir, 'hangar_barrel_51_3d.png'));

    // Render Venice 3D Garrafa de Pitú (textures + 3D multi-angle, centered on front label yaw=90!)
    psxLib.writePng(path.join(previewDir, 'venice_pitu_label_48x48.png'), 48, 48, pituArts.bodyRgba);
    psxLib.writePng(path.join(previewDir, 'venice_pitu_cap_16x16.png'), 16, 16, pituArts.capRgba);
    renderPs1MeshPreview(skvenO, skvenL, [4], [
      { yaw: 90, pitch: 8 }, { yaw: 135, pitch: 10 }, { yaw: 270, pitch: 8 }, { yaw: 0, pitch: 10 },
    ], 160, 180, 0.85, path.join(previewDir, 'venice_pitu_bottle_3d.png'));

    // Render Hangar 3D Haddad + School II 3D Dilma no Barril multi-angle QA!
    haddadDilma.renderPs1MeshPreview(hadRes1.geometry, hadTex, path.join(previewDir, 'hangar_haddad_3d.png'), [0, 35, 75, 180], [44, 54, 70]);
    haddadDilma.renderPs1MeshPreview(dilRes.geometry, dilTex, path.join(previewDir, 'school2_dilma_3d.png'), [0, 30, -30, 62], [68, 62, 56]);

    console.log(`  [QA] Previews 3D PS1 gerados em: ${previewDir}`);
  }

  if (dryRun) {
    console.log('  [DRY-RUN] CD.WAD e CD.HED nao foram modificados.');
    return;
  }

  // Inject cleanly into workspace CD.WAD and CD.HED (updating ONLY size within existing sector allocations!)
  const curHed = fs.readFileSync(path.join(ROOT, 'CD.HED'));
  const curWad = fs.readFileSync(path.join(ROOT, 'CD.WAD'));
  const origHed = parseHed(fs.readFileSync(path.join(BACKUP_DIR, 'CD.HED')));

  const updates = [
    { idx: 8,    name: 'items.psx',    buf: itemsPsx, allowGrowWithinSectors: true },
    { idx: 14,   name: 'skhan_o.psx',  buf: skhanO,   allowGrowWithinSectors: true },
    { idx: 1109, name: 'skhan_o2.psx', buf: skhanO2,  allowGrowWithinSectors: true },
    { idx: 1103, name: 'skven_o.psx',  buf: skvenO,   allowGrowWithinSectors: true },
    { idx: 1102, name: 'skven_l.psx',  buf: skvenL,   allowGrowWithinSectors: false },
    { idx: 1095, name: 'sksl2_o.psx',  buf: sksl2O,   allowGrowWithinSectors: true },
    { idx: 1094, name: 'sksl2_l.psx',  buf: sksl2L,   allowGrowWithinSectors: true },
    { idx: 1096, name: 'sksl2_l2.psx', buf: sksl2L2,  allowGrowWithinSectors: true },
  ];

  for (const u of updates) {
    const origE = origHed[u.idx];
    const curOff = curHed.readUInt32LE(u.idx * 12 + 4);
    const maxBytes = Math.ceil(origE.size / 2048) * 2048;
    if (curOff !== origE.offset) {
      throw new Error(`Offset divergente em CD.HED[${u.idx}] (${u.name}): 0x${curOff.toString(16)} vs 0x${origE.offset.toString(16)}`);
    }
    if (!u.allowGrowWithinSectors && u.buf.length !== origE.size) {
      throw new Error(`Tamanho divergente para ${u.name}: ${u.buf.length} vs ${origE.size}`);
    }
    if (u.buf.length > maxBytes) {
      throw new Error(`${u.name} excede alocacao de setores: ${u.buf.length} > ${maxBytes}`);
    }
    // Zero-pad remainder of sector allocation cleanly before copying!
    curWad.fill(0, curOff, curOff + maxBytes);
    u.buf.copy(curWad, curOff);
    curHed.writeUInt32LE(u.buf.length >>> 0, u.idx * 12 + 8);
    console.log(`  [PATCH] WAD[${String(u.idx).padStart(4)}] @ 0x${curOff.toString(16)}: ${u.name} (${origE.size} -> ${u.buf.length} B / ${maxBytes} B)`);
  }

  fs.writeFileSync(path.join(ROOT, 'CD.WAD'), curWad);
  fs.writeFileSync(path.join(ROOT, 'CD.HED'), curHed);
  console.log('=== Concluido com sucesso! Zero deslocamento de offsets no CD.WAD! ===');
}

if (require.main === module) main();
module.exports = { HASH_X_LETTER, buildItemsPsxWithX, paintPinga51BarrelTextures, buildSkvenOPsxWithPitu, paintPituBottleTextures };
