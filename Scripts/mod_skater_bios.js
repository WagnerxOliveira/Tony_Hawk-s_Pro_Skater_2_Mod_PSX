#!/usr/bin/env node
'use strict';

/**
 * THPS2 PS1 (SLUS-01066) — Skater Select PT-BR Biographies & Native Accented s2bio.fnt Patcher
 *
 * Patches:
 *   1. SLUS_010.66 — Font_CharToGlyph @ RAM 0x8005B9B4 (5 immediate-field MIPS words, 0 relocation):
 *      Remaps 4 unused French/German lowercase slots (oe=0x9C, a-uml=0xE4, o-uml=0xF6, u-uml=0xFC)
 *      in type==2 (94-glyph mixed-case) fonts to native Portuguese diacritics:
 *        - 0xE1 ('á') -> Glyph 85 (native slot, acute accent refined '/')
 *        - 0xE7 ('ç') -> Glyph 86 (native Neversoft cedilla, 100% preserved)
 *        - 0xE9 ('é') -> Glyph 87 (native slot, acute accent refined '/', separated from 0xEA)
 *        - 0xE3 ('ã') -> Glyph 90 (replaces 'œ' 0x9C; hwW=2, h=8, base=7, adv=7 -> exact 32 B)
 *        - 0xEA ('ê') -> Glyph 91 (replaces 'ä' 0xE4; hwW=2, h=7, base=7, adv=7 -> exact 28 B)
 *        - 0xED ('í') -> Glyph 92 (replaces 'ö' 0xF6; hwW=2, h=7, base=7, adv=4 -> exact 28 B)
 *        - 0xF3 ('ó') -> Glyph 93 (replaces 'ü' 0xFC; hwW=2, h=7, base=7, adv=7 -> exact 28 B)
 *   2. s2bio.fnt (exact 4,468 B in-place in BOTH CD.WAD[458] AND player.pre WAD[60] +0x14):
 *      Zero byte-size change -> CD.HED, player.pre offsets, and all 1,529 other WAD entries remain 100% untouched.
 *   3. SLUS_010.66 — g_SkaterTable[2].bio_lines (Lulao @ RAM 0x800B9DEC, 16 lines)
 *                  & g_SkaterTable[3].bio_lines (Bolsonaro @ RAM 0x800B9E30, 16 lines):
 *      All 32 lines fit 1:1 inline inside their exact Redump 4-byte-aligned slots (0 overflows, 0 pointer changes).
 *
 * Idempotent: always derives canonical s2bio.fnt from originals_backup/CD.WAD and slot bounds from Redump BIN.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REDUMP_BIN = path.join(ROOT, 'bin_cue_originais_do_jogo', "Tony Hawk's Pro Skater 2.bin");
const SLUS_PATH = path.join(ROOT, 'SLUS_010.66');
const ORIG_HED_PATH = path.join(ROOT, 'originals_backup', 'CD.HED');
const ORIG_WAD_PATH = path.join(ROOT, 'originals_backup', 'CD.WAD');
const CUR_HED_PATH = path.join(ROOT, 'CD.HED');
const CUR_WAD_PATH = path.join(ROOT, 'CD.WAD');

const SLUS_RAM_BASE = 0x8000F800; // RAM = fileOff + 0x8000F800 (loadAddr 0x80010000 @ file 0x800)

// 5 surgical in-place MIPS R3000A immediate tweaks in Font_CharToGlyph @ 0x8005B9B4
const FONT_PATCH_WORDS = [
  { ram: 0x8005BAC4, orig: 0x2C420003, patched: 0x2C420002, desc: "sltiu v0,v0,2 (separate 'ê' 0xEA from 'é' 0xE9)" },
  { ram: 0x8005BAF4, orig: 0x2402009C, patched: 0x240200E3, desc: "addiu v0,zero,0xE3 ('ã' -> Glyph 90)" },
  { ram: 0x8005BAFC, orig: 0x240200E4, patched: 0x240200EA, desc: "addiu v0,zero,0xEA ('ê' -> Glyph 91)" },
  { ram: 0x8005BB0C, orig: 0x240200F6, patched: 0x240200ED, desc: "addiu v0,zero,0xED ('í' -> Glyph 92)" },
  { ram: 0x8005BB1C, orig: 0x240200FC, patched: 0x240200F3, desc: "addiu v0,zero,0xF3 ('ó' -> Glyph 93)" },
];

// Strictly whitelisted PT-BR Latin-1 high bytes supported by patched Font_CharToGlyph + s2bio.fnt
const PTBR_ALLOWED_HIGH_BYTES = new Set([0xE1, 0xE3, 0xE7, 0xE9, 0xEA, 0xED, 0xF3]); // á, ã, ç, é, ê, í, ó

// Exact 16-line PT-BR biographies (ISO-8859-1 / Latin-1)
const BIO_LULAO = [
  { fileOff: 0x0A18F4, text: 'Ex-detento vip da PF,' },
  { fileOff: 0x0A190C, text: 'jura não saber nada' },
  { fileOff: 0x0A1920, text: 'de triplex, sítio ou' },
  { fileOff: 0x0A1938, text: 'da grana na cueca e' },
  { fileOff: 0x0A194C, text: 'mensalão. Prometeu a' },
  { fileOff: 0x0A1964, text: 'picanha e cerveja na' },
  { fileOff: 0x0A197C, text: 'brasa, mas entregou é' },
  { fileOff: 0x0A1994, text: 'abóbora, imposto no' },
  { fileOff: 0x0A19A8, text: 'shape chinês e rombo' },
  { fileOff: 0x0A19C0, text: 'bilionário. Após uma' },
  { fileOff: 0x0A19D8, text: 'dose de cachaça,' },
  { fileOff: 0x0C63AC, text: 'inventa dados,' },
  { fileOff: 0x0A19EC, text: 'tropeça no português,' },
  { fileOff: 0x0A1A04, text: 'fala bobagem e diz:' },
  { fileOff: 0x0A1A18, text: "'Roubou o shape? Foi" },
  { fileOff: 0x0C63BC, text: "pela cerveja!'" },
];

const BIO_BOLSONARO = [
  { fileOff: 0x0A1A30, text: 'Direto da Papuda' },
  { fileOff: 0x0A1A44, text: 'e barrado pelo TSE,' },
  { fileOff: 0x0C63CC, text: 'seu golpe falho' },
  { fileOff: 0x0A1A58, text: 'e papo de ditadura' },
  { fileOff: 0x0A1A6C, text: 'sempre caem mal.' },
  { fileOff: 0x0A1A80, text: 'Fora do skate, tá' },
  { fileOff: 0x0A1A94, text: 'dando cloroquina pras' },
  { fileOff: 0x0A1AAC, text: 'emas, vendendo umas' },
  { fileOff: 0x0A1AC0, text: 'joias das Arábias,' },
  { fileOff: 0x0A1AD4, text: 'jurando que vacina' },
  { fileOff: 0x0A1AE8, text: 'faz virar jacaré,' },
  { fileOff: 0x0C63DC, text: 'ou pedindo pix.' },
  { fileOff: 0x0C63EC, text: 'Dica pro skate:' },
  { fileOff: 0x0A1AFC, text: "'Se quebrou? E daí?" },
  { fileOff: 0x0A1B10, text: 'Não sou coveiro,' },
  { fileOff: 0x0A1B24, text: "sou imbrochável'" },
];

const BIO_SLOT_OFFSETS = new Set([...BIO_LULAO, ...BIO_BOLSONARO].map(x => x.fileOff));

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

function findHedEntry(hedBuf, name) {
  const h = nsHash(name);
  for (let off = 0; off + 12 <= hedBuf.length; off += 12) {
    if (hedBuf.readUInt32LE(off) === h) {
      return { idx: off / 12, hash: h, offset: hedBuf.readUInt32LE(off + 4), size: hedBuf.readUInt32LE(off + 8) };
    }
  }
  throw new Error(`Entrada ${name} nao encontrada em CD.HED!`);
}

// Parse a Neversoft 4bpp .FNT into header descriptors + per-glyph pixel nibble arrays
function parseFnt(buf) {
  const numGlyphs = buf.readUInt32LE(0);
  let pixOff = 4 + numGlyphs * 16 + 32;
  const glyphs = [];
  for (let i = 0; i < numGlyphs; i++) {
    const o = 4 + i * 16;
    const hwW = buf.readUInt32LE(o);
    const h = buf.readUInt32LE(o + 4);
    const baseY = buf.readUInt32LE(o + 8);
    const adv = buf.readUInt32LE(o + 12);
    const byteLen = (hwW * 2 * h + 3) & ~3;
    const rows = [];
    for (let y = 0; y < h; y++) {
      let s = '';
      for (let x = 0; x < hwW * 4; x++) {
        const b = buf[pixOff + y * (hwW * 2) + (x >> 1)];
        const n = (x & 1) ? (b >> 4) : (b & 0xF);
        s += n === 15 ? '.' : n.toString(16).toUpperCase();
      }
      rows.push(s);
    }
    glyphs.push({ i, hwW, h, baseY, adv, pixOff, byteLen, rows });
    pixOff += byteLen;
  }
  return { numGlyphs, glyphs, totalBytes: pixOff };
}

// Write a single glyph's header + 4bpp nibble rows into fntBuf (strictly preserving original byteLen!)
function writeGlyphInPlace(fntBuf, g, { hwW, h, baseY, adv, rows }) {
  const newByteLen = (hwW * 2 * h + 3) & ~3;
  if (newByteLen !== g.byteLen) {
    throw new Error(`Glyph[${g.i}] byteLen mismatch: ${newByteLen} != ${g.byteLen}`);
  }
  if (rows.length !== h) {
    throw new Error(`Glyph[${g.i}] row count mismatch: ${rows.length} != ${h}`);
  }
  const hdrOff = 4 + g.i * 16;
  fntBuf.writeUInt32LE(hwW, hdrOff);
  fntBuf.writeUInt32LE(h, hdrOff + 4);
  fntBuf.writeUInt32LE(baseY, hdrOff + 8);
  fntBuf.writeUInt32LE(adv, hdrOff + 12);

  // Zero-pad first (transparent = 0xFF nibble pair for unused trailing bytes)
  fntBuf.fill(0xFF, g.pixOff, g.pixOff + g.byteLen);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    if (row.length !== hwW * 4) {
      throw new Error(`Glyph[${g.i}] row ${y} width mismatch: ${row.length} != ${hwW * 4}`);
    }
    for (let xb = 0; xb < hwW * 2; xb++) {
      const cLo = row[xb * 2];
      const cHi = row[xb * 2 + 1];
      const nLo = cLo === '.' ? 15 : parseInt(cLo, 16);
      const nHi = cHi === '.' ? 15 : parseInt(cHi, 16);
      fntBuf[g.pixOff + y * (hwW * 2) + xb] = (nHi << 4) | nLo;
    }
  }
}

/**
 * Deterministically builds the 4,468-byte PT-BR patched s2bio.fnt from the clean original s2bio.fnt.
 *
 * Palette reference (s2bio.fnt CLUT @ +0x5E4):
 *   '.' (F) = transparent
 *   '6' = RGB(80,80,112) brightest highlight   '5' = RGB(72,72,104)
 *   '8' = RGB(64,64,96)                        '2' = RGB(64,64,88)
 *   '3' = RGB(56,56,80)                        '9' = RGB(48,48,72)
 *   '4' = RGB(48,48,64)                        'A' = RGB(40,40,56)
 *   '1' = RGB(32,32,48)                        'C' = RGB(32,32,40)
 *   'B' = RGB(24,24,32)                        '0' = RGB(16,16,24)
 *   'D' = RGB(8,8,16)   '7' = RGB(8,8,8)       'E' = RGB(0,0,0) dark edge
 */
function buildPatchedS2BioFnt(origS2BioBuf) {
  if (!origS2BioBuf) {
    const oHed = fs.readFileSync(ORIG_HED_PATH);
    const oWad = fs.readFileSync(ORIG_WAD_PATH);
    const e = findHedEntry(oHed, 's2bio.fnt');
    origS2BioBuf = oWad.subarray(e.offset, e.offset + e.size);
  }
  const fntBuf = Buffer.from(origS2BioBuf);
  const parsed = parseFnt(fntBuf);
  if (parsed.numGlyphs !== 94 || fntBuf.length !== 4468 || parsed.totalBytes !== 4468) {
    throw new Error(`s2bio.fnt invalido: numGlyphs=${parsed.numGlyphs}, size=${fntBuf.length}`);
  }

  const gA = parsed.glyphs[49]; // 'a' (hwW=2, h=5, base=5, adv=7)
  const gE = parsed.glyphs[53]; // 'e' (hwW=2, h=5, base=5, adv=7)
  const gI = parsed.glyphs[57]; // 'i' (hwW=1, h=7, base=7, adv=3) -> stem at y=2..6
  const gO = parsed.glyphs[63]; // 'o' (hwW=2, h=5, base=5, adv=7)

  // Crisp right-leaning acute accent '/' matching s2bio.fnt italic slant
  const ACUTE_ROWS = [
    '....46E.',
    '...38B..',
  ];
  // Crisp tilde '~' matching s2bio.fnt italic anti-aliased shading
  const TILDE_ROWS = [
    '..46A.5.',
    '.E8.35E.',
  ];
  // Crisp circumflex '^' inspired by native Glyph[88] ('ô') with slightly clearer apex
  const CIRCUMFLEX_ROWS = [
    '...752..',
    '..38E84.',
  ];

  // Glyph 85 ('á' 0xE1): refine native French grave '\' into Portuguese acute '/' over exact 'a'
  writeGlyphInPlace(fntBuf, parsed.glyphs[85], {
    hwW: 2, h: 7, baseY: 7, adv: 7,
    rows: [...ACUTE_ROWS, ...gA.rows],
  });

  // Glyph 86 ('ç' 0xE7): keep 100% native Neversoft original!

  // Glyph 87 ('é' 0xE9): refine native French grave '\' into Portuguese acute '/' over exact 'e'
  writeGlyphInPlace(fntBuf, parsed.glyphs[87], {
    hwW: 2, h: 7, baseY: 7, adv: 7,
    rows: [...ACUTE_ROWS, ...gE.rows],
  });

  // Glyph 90 ('ã' 0xE3, replaces 'œ' 32 B): hwW=2, h=8, baseY=7, adv=7 -> exact 32 B (y=7 transparent pad)
  writeGlyphInPlace(fntBuf, parsed.glyphs[90], {
    hwW: 2, h: 8, baseY: 7, adv: 7,
    rows: [...TILDE_ROWS, ...gA.rows, '........'],
  });

  // Glyph 91 ('ê' 0xEA, replaces 'ä' 28 B): hwW=2, h=7, baseY=7, adv=7 -> exact 28 B
  writeGlyphInPlace(fntBuf, parsed.glyphs[91], {
    hwW: 2, h: 7, baseY: 7, adv: 7,
    rows: [...CIRCUMFLEX_ROWS, ...gE.rows],
  });

  // Glyph 92 ('í' 0xED, replaces 'ö' 28 B): hwW=2, h=7, baseY=7, adv=4 -> exact 28 B
  // Uses exact native 'i' stem (y=2..6, padded right with transparent '....') topped by crisp acute '/'
  writeGlyphInPlace(fntBuf, parsed.glyphs[92], {
    hwW: 2, h: 7, baseY: 7, adv: 4,
    rows: [
      '..46....',
      '.38B....',
      gI.rows[2] + '....',
      gI.rows[3] + '....',
      gI.rows[4] + '....',
      gI.rows[5] + '....',
      gI.rows[6] + '....',
    ],
  });

  // Glyph 93 ('ó' 0xF3, replaces 'ü' 28 B): hwW=2, h=7, baseY=7, adv=7 -> exact 28 B
  writeGlyphInPlace(fntBuf, parsed.glyphs[93], {
    hwW: 2, h: 7, baseY: 7, adv: 7,
    rows: [...ACUTE_ROWS, ...gO.rows],
  });

  return fntBuf;
}

function readRedumpSlus() {
  const fd = fs.openSync(REDUMP_BIN, 'r');
  const slusRed = Buffer.alloc(422 * 2048);
  const sec = Buffer.alloc(2352);
  for (let i = 0; i < 422; i++) {
    fs.readSync(fd, sec, 0, 2352, (24 + i) * 2352);
    sec.copy(slusRed, i * 2048, 24, 24 + 2048);
  }
  fs.closeSync(fd);
  return slusRed;
}

function applyBiosAndFont() {
  const slusRed = readRedumpSlus();
  const slusBuf = fs.readFileSync(SLUS_PATH);
  const slusBefore = Buffer.from(slusBuf);

  console.log('=== 1. Patchando Font_CharToGlyph @ RAM 0x8005B9B4 (5 palavras MIPS in-place) ===');
  for (const p of FONT_PATCH_WORDS) {
    const off = p.ram - SLUS_RAM_BASE;
    const cur = slusBuf.readUInt32LE(off);
    const red = slusRed.readUInt32LE(off);
    if (red !== p.orig) {
      throw new Error(`Redump mismatch @ 0x${p.ram.toString(16)}: got 0x${red.toString(16)}, exp 0x${p.orig.toString(16)}`);
    }
    if (cur !== p.orig && cur !== p.patched) {
      throw new Error(`Unexpected MIPS word @ 0x${p.ram.toString(16)}: 0x${cur.toString(16)}`);
    }
    slusBuf.writeUInt32LE(p.patched >>> 0, off);
    console.log(`  [MIPS] 0x${p.ram.toString(16).toUpperCase()} (file 0x${off.toString(16).toUpperCase()}): 0x${p.orig.toString(16).toUpperCase()} -> 0x${p.patched.toString(16).toUpperCase()}  | ${p.desc}`);
  }

  console.log('\n=== 2. Patchando 32 linhas de biografia (Lulao Slot 2 + Bolsonaro Slot 3) em SLUS_010.66 ===');
  const allowedTouchRanges = FONT_PATCH_WORDS.map(p => [p.ram - SLUS_RAM_BASE, p.ram - SLUS_RAM_BASE + 4]);

  const patchSkaterBio = (skaterName, arrFileOff, expectedLines) => {
    console.log(`\n  --- ${skaterName} (bio_lines[] @ file 0x${arrFileOff.toString(16).toUpperCase()}) ---`);
    for (let i = 0; i < expectedLines.length; i++) {
      const ptrRam = slusBuf.readUInt32LE(arrFileOff + i * 4);
      const ptrOff = ptrRam - SLUS_RAM_BASE;
      const spec = expectedLines[i];
      if (ptrOff !== spec.fileOff) {
        throw new Error(`${skaterName} L${i}: ponteiro bio_lines aponta para 0x${ptrOff.toString(16)}, esperado 0x${spec.fileOff.toString(16)}`);
      }
      // Compute exact Redump slotEnd (identical rule to tools/audit_game.js Stage 2)
      let eO = ptrOff;
      while (slusRed[eO] !== 0) eO++;
      let slotEnd = eO;
      while (slusRed[slotEnd] === 0) slotEnd++;
      const maxLen = slotEnd - ptrOff - 1;

      const encoded = Buffer.from(spec.text, 'latin1');
      if (encoded.length !== spec.text.length) {
        throw new Error(`${skaterName} L${i}: comprimento Latin-1 divergente`);
      }
      for (let k = 0; k < encoded.length; k++) {
        const b = encoded[k];
        if ((b < 0x20 || b > 0x7E) && !PTBR_ALLOWED_HIGH_BYTES.has(b)) {
          throw new Error(`${skaterName} L${i} +${k}: byte 0x${b.toString(16)} fora do charset suportado em "${spec.text}"`);
        }
      }
      if (encoded.length > maxLen) {
        throw new Error(`${skaterName} L${i}: OVERFLOW (${encoded.length}B > max ${maxLen}B): "${spec.text}"`);
      }

      // Write string + NUL-pad entire remainder of Redump slot
      encoded.copy(slusBuf, ptrOff);
      slusBuf.fill(0x00, ptrOff + encoded.length, slotEnd);
      allowedTouchRanges.push([ptrOff, slotEnd]);

      console.log(`  L${String(i).padStart(2)} @ 0x${ptrOff.toString(16).toUpperCase().padStart(6, '0')} (${String(encoded.length).padStart(2)}/${String(maxLen).padStart(2)}B): "${spec.text}"`);
    }
    // Verify NULL terminator of bio_lines[] pointer array is untouched
    const nullWord = slusBuf.readUInt32LE(arrFileOff + expectedLines.length * 4);
    if (nullWord !== 0) throw new Error(`${skaterName}: bio_lines[16] != NULL (0x${nullWord.toString(16)})`);
  };

  patchSkaterBio('Lulao (Slot 2)', 0x0AA5EC, BIO_LULAO);
  patchSkaterBio('Bolsonaro (Slot 3)', 0x0AA630, BIO_BOLSONARO);

  // Strict post-write invariant: verify 0 bytes modified in SLUS_010.66 outside the 5 MIPS words & 32 bio slots
  let unexpectedSlusDiffs = 0;
  for (let off = 0; off < slusBuf.length; off++) {
    if (slusBuf[off] !== slusBefore[off]) {
      const ok = allowedTouchRanges.some(([a, b]) => off >= a && off < b);
      if (!ok) {
        console.error(`  [ERR] Byte inesperado alterado em SLUS_010.66 @ 0x${off.toString(16)}`);
        unexpectedSlusDiffs++;
      }
    }
  }
  if (unexpectedSlusDiffs > 0) throw new Error(`Abortado: ${unexpectedSlusDiffs} bytes inesperados em SLUS_010.66!`);
  fs.writeFileSync(SLUS_PATH, slusBuf);
  console.log('\n[OK] SLUS_010.66 gravado com 5 palavras MIPS + 32 linhas de biografia (0 bytes fora do escopo).');

  console.log('\n=== 3. Patchando s2bio.fnt (4.468 B in-place) em CD.WAD[458] e player.pre (WAD[60] +0x14) ===');
  const patchedFnt = buildPatchedS2BioFnt();
  const curHed = fs.readFileSync(CUR_HED_PATH);
  const curWad = fs.readFileSync(CUR_WAD_PATH);

  const eFnt = findHedEntry(curHed, 's2bio.fnt');
  const ePre = findHedEntry(curHed, 'player.pre');
  if (eFnt.size !== patchedFnt.length) {
    throw new Error(`Tamanho de s2bio.fnt em CD.HED (${eFnt.size}) != ${patchedFnt.length}`);
  }
  // Verify player.pre[0] header says "s2bio.fnt" and size == 4468 at +0x10, data at +0x14
  const preHdrName = curWad.subarray(ePre.offset + 4, ePre.offset + 14).toString('ascii');
  const preFntSize = curWad.readUInt32LE(ePre.offset + 0x10);
  if (preHdrName !== 's2bio.fnt\0' || preFntSize !== patchedFnt.length) {
    throw new Error(`player.pre[0] inesperado: name=${JSON.stringify(preHdrName)}, size=${preFntSize}`);
  }

  patchedFnt.copy(curWad, eFnt.offset);
  patchedFnt.copy(curWad, ePre.offset + 0x14);
  fs.writeFileSync(CUR_WAD_PATH, curWad);

  console.log(`  [OK] CD.WAD[${eFnt.idx}] (s2bio.fnt @ 0x${eFnt.offset.toString(16)}, ${eFnt.size} B) atualizado in-place.`);
  console.log(`  [OK] CD.WAD[${ePre.idx}] (player.pre +0x14 @ 0x${(ePre.offset + 0x14).toString(16)}, ${preFntSize} B) sincronizado in-place.`);
  console.log('  [OK] CD.HED 100% preservado (0 bytes deslocados).');
}

module.exports = {
  FONT_PATCH_WORDS,
  PTBR_ALLOWED_HIGH_BYTES,
  BIO_LULAO,
  BIO_BOLSONARO,
  BIO_SLOT_OFFSETS,
  buildPatchedS2BioFnt,
  parseFnt,
};

if (require.main === module) {
  applyBiosAndFont();
}
