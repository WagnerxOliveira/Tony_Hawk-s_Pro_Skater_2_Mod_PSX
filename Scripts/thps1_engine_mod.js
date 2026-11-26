#!/usr/bin/env node
'use strict';

/**
 * THPS1-in-THPS2 Complete Interleaved 19-Level Engine Mod (SLUS-01066)
 *
 * Resident Memory Map (loaded into RAM 0x800E6000..0x800EBFFF from VOICES.DAT Sectors 7..18 = 24,576 B):
 *   - 0x800E6000..0x800E7D0F (7,440 B): g_ExtLevelTable[20] (0..10 = THPS2 intact, 11..19 = ALL 9 THPS1 levels!)
 *   - 0x800E7D20..0x800E7D6F (   80 B): g_DisplayOrderWords[20] (interleaved THPS2 <-> THPS1 order)
 *   - 0x800E7D70..0x800E7D83 (   20 B): g_SlotOfLevel[20] (inverse map levelId -> displaySlot)
 *   - 0x800E8000..0x800E840F (1,040 B): g_ExtLightTable[20]  (expanded 0x800B961C, stride 52)
 *   - 0x800E8410..0x800E854F (  320 B): g_ExtShadowTable[20] (expanded 0x800B9824, stride 16)
 *   - 0x800E8550..0x800E8A4F (1,280 B): g_ExtSkyTable[20]    (expanded 0x800BB95C, stride 64)
 *   - 0x800E8A50..0x800E8F5F (1,296 B): g_Thps1Hed[]         (76+1 entries for THPS1.WAD fallback loader)
 *   - 0x800E9000..0x800E96DF (1,760 B): g_Thps1Strings       (level names, cities, TRGs, BMPs, THPS1 goals, "\THPS1.WAD;1")
 *   - 0x800E96E0..0x800E96FF (   32 B): Runtime state (g_Thps1BaseLba, g_Thps1Inited, g_Thps1ScratchOff, g_Thps1ScratchSz)
 *   - 0x800E9700..0x800E9ECF (2,000 B): g_ExtCareer[20]      (per-skater progress for THPS1 levels 11..19)
 *   - 0x800EA000..0x800EBFFF (8,192 B): THPS1_CODE           (MIPS R3000A runtime hooks)
 *
 * Interleaved Progression Order (19 playable levels + Custom Park sked):
 *   Slot  0: [ 0] The Hangar       (THPS2 #1)       -> Unlocked at start ($0)
 *   Slot  1: [11] Warehouse        (THPS1 #1)       -> Unlocks at $1,000
 *   Slot  2: [ 1] School II        (THPS2 #2)       -> Unlocks at $2,000
 *   Slot  3: [12] School           (THPS1 #2)       -> Unlocks at $3,500
 *   Slot  4: [ 2] Marseille        (THPS2 #3 Comp)  -> Unlocks at $5,500
 *   Slot  5: [13] Mall             (THPS1 #3)       -> Unlocks with 1 Medal
 *   Slot  6: [ 3] NY City          (THPS2 #4)       -> Unlocks at $9,500
 *   Slot  7: [14] Skate Park       (THPS1 #4 Comp)  -> Unlocks at $13,500
 *   Slot  8: [ 4] Venice Beach     (THPS2 #5)       -> Unlocks with 2 Medals
 *   Slot  9: [15] Downtown         (THPS1 #5)       -> Unlocks at $21,000
 *   Slot 10: [ 5] SkateStreet      (THPS2 #6 Comp)  -> Unlocks at $25,000
 *   Slot 11: [16] Downhill Jam     (THPS1 #6)       -> Unlocks with 3 Medals
 *   Slot 12: [ 6] Philadelphia     (THPS2 #7)       -> Unlocks at $34,000
 *   Slot 13: [17] Burnside         (THPS1 #7 Comp)  -> Unlocks at $42,000
 *   Slot 14: [ 7] The Bullring     (THPS2 #8 Comp)  -> Unlocks with 4 Medals
 *   Slot 15: [18] Streets          (THPS1 #8)       -> Unlocks with 5 Medals
 *   Slot 16: [ 8] Chopper Drop     (THPS2 Bonus 1)  -> Unlocks at $55,000
 *   Slot 17: [19] Roswell          (THPS1 #9 Comp)  -> Unlocks at $60,000
 *   Slot 18: [ 9] Skate Heaven     (THPS2 Bonus 2)  -> Unlocks with 6 Medals
 *   Slot 19: [10] Custom Park      (THPS2 sked)     -> Free Skate / Single Session
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'build', 'thps1_manifest.json');
const ORIG_SLUS_PATH = path.join(ROOT, 'originals_backup', 'SLUS_010.66');
const ORIG_WAD_PATH = path.join(ROOT, 'originals_backup', 'CD.WAD');
const ORIG_HED_PATH = path.join(ROOT, 'originals_backup', 'CD.HED');

const SLUS_BASE = 0x80010000;
const SLUS_HDR = 0x800;

const THPS1_ADDR = {
  Base:              0x800E6000,
  TotalBytes:        10 * 2048, // 20,480 B (0x800E6000..0x800EAFFF)
  NewHeapStart:      0x800EC800, // Heap begins right after boot-resident CASHART (0x800EB000..0x800EC7FF)

  ExtLevelTable:     0x800E6000, // 20 * 0x174 = 7,440 B -> 0x800E7D10
  DisplayOrderWords: 0x800E7D20, // 20 * 4 = 80 B -> 0x800E7D70 (interleaved carousel order)
  SlotOfLevel:       0x800E7D70, // 20 B -> 0x800E7D84
  LoadOrderWords:    0x800E7D90, // 20 * 4 = 80 B -> 0x800E7DE0 (legacy load order)
  S2RendDiscOrder:   0x800E7DE0, // 11 B (padded 16 B): exact CD.WAD sector order for s2rend01..11 (sec 9553..9607)
  S2LevlDiscOrder:   0x800E7DF0, // 11 B (padded 16 B): exact CD.WAD sector order for s2levl00..10 (sec 9476..9541)
  T1DiscOrder:       0x800E7E00, //  9 B (padded 16 B): exact THPS1.WAD sector order [11..19]
  FastBurstRendDesc: 0x800E7E10, //  reused as start of 5-descriptor FastBurstMapDesc (80 B -> 0x800E7E60)!
  FastBurstMapDesc:  0x800E7E10, //  5 * 16 B = 80 B -> 0x800E7E60 (all 5 strictly ascending CD.WAD bursts, max 55s = 112 KB!)
  Thps1GapList:      0x800E7E60, // 24+1 * 12 B = 300 B -> 0x800E7F8C (live THPS1 G6/G7 gap table)
  g_TurboState:      0x800E7F90, // 32 B -> 0x800E7FB0: LastBarFrame(+0), LastPadFrame(+4), BurstBuf(+8), StartSec(+12), EndSec(+16), XaSaved(+20)

  ExtLightTable:     0x800E8000, // 20 * 52 = 1,040 B -> 0x800E8410
  ExtShadowTable:    0x800E8410, // 20 * 16 = 320 B   -> 0x800E8550
  ExtSkyTable:       0x800E8550, // 20 * 64 = 1,280 B -> 0x800E8A50
  Thps1Hed:          0x800B873C, // Relocated into freed SLUS g_LevelTable RAM (52 * 12 + 4 = 628 B -> 0x800B89B0!)
  TurboBurstBase:    0x800E8AB0, // 672 B -> 0x800E8D50: Entry_BurstCdOpen (contiguous CD-ROM streaming cache!)
  Thps1StringsSpill: 0x800E8D50, // 688 B overflow string pool -> 0x800E9000 (ZERO NewHeapStart shift!)

  Thps1Strings:      0x800E9000, // 1,760 B primary string pool -> 0x800E96E0
  g_Thps1BaseLba:    0x800E96E0,
  g_Thps1Inited:     0x800E96E4,
  g_Thps1ScratchOff: 0x800E96E8,
  g_Thps1ScratchSz:  0x800E96EC,
  g_Thps1StrPathPtr: 0x800E96F0,
  g_SavedRendSprites:0x800E96F4, // CLevelRend->spritesBase for unified ascending FastMap burst!
  g_FastBurstXaSaved:0x800E96F8, // XA paused state across FastMap!

  ExtCareer:         0x800E9700, // 20 skaters * 100 B = 2,000 B -> 0x800E9ED0
  TurboAuxBase:      0x800E9ED0, // 304 B -> 0x800EA000: Entry_LoadingBarThrottle, Entry_CdPollPadThrottle, Entry_BurstFree
  Entry_BurstCdOpen:        0x800E8AB0,
  Entry_LoadingBarThrottle: 0x800E9ED0,
  Entry_CdPollPadThrottle:  0x800E9F10,
  Entry_BurstFree:          0x800E9F48,

  CodeBase:          0x800EA000, // 4,096 B -> 0x800EAFFF
  Entry_CdWadFallback:        0x800EA000,
  Entry_CareerCountMedals:    0x800EA008,
  Entry_CareerLevelIsOpenIn:  0x800EA010,
  Entry_CareerLevelIsOpenMod: 0x800EA018,
  Entry_CareerHasGoal:        0x800EA020,
  Entry_CareerCountLvlGoals:  0x800EA028,
  Entry_CareerCountCash:      0x800EA030,
  Entry_CareerHasCashNode:    0x800EA038,
  Entry_CareerCollectCashBit: 0x800EA040,
  Entry_CareerGiveGoalBit:    0x800EA048,
  Entry_CareerSetMedal:       0x800EA050,
  Entry_CareerSetAllGoals:    0x800EA058,
  Entry_GetLevelFlags:        0x800EA060,
  Entry_CompLoadBmp:          0x800EA068,
  Entry_ShowGoalsBtn:         0x800EA070,
  Entry_LevelSelMoveCursor:   0x800EA078,
  Entry_LevelSelPct:          0x800EA080,
  Entry_LevelSelShowPct:      0x800EA088,
  Entry_SecretFlagSet:        0x800EA090,
  Entry_SecretFlagGet:        0x800EA098,
  Entry_TrigHasGoal:          0x800EA0A0,
  Entry_CompInitPodium:       0x800EA0A8,
  Entry_CompPrizeAB:          0x800EA0B0,
  Entry_CompPrizeC:           0x800EA0B8,
  Entry_CareerCountGolds:     0x800EA0C0,
  Entry_CareerResetExt:       0x800EA0C8,
  Entry_HiScore_s7_s2:        0x800EA0D0,
  Entry_HiScore_v1_s2:        0x800EA0D8,
  Entry_HiScore_t3_v0:        0x800EA0E0,
  Entry_HiScore_a0_s1:        0x800EA0E8,
  Entry_HiScore_v1_a0:        0x800EA0F0,
  Entry_Car215_SetModel:      0x800EA0F8,
  Entry_Car216_SetModel:      0x800EA100,
  Entry_LevelSelFastRend:     0x800EA108,
  Entry_LevelSelFastMap:      0x800EA110,
  Entry_SetGapList:           0x800EA118,
  Entry_GapChecklistGuard:    0x800EA120,
};

// Display/Progression Order: THPS2 <-> THPS1 strictly interleaved (0..18) + Custom Park (10) at slot 19
const DISPLAY_ORDER = [0, 11, 1, 12, 2, 13, 3, 14, 4, 15, 5, 16, 6, 17, 7, 18, 8, 19, 9, 10];
const SLOT_OF_LEVEL = new Array(20).fill(0);
for (let s = 0; s < DISPLAY_ORDER.length; s++) SLOT_OF_LEVEL[DISPLAY_ORDER[s]] = s;

// Interleaved unlock requirements (cashRequired @ +0x44, medalsRequired @ +0x48) keyed by internal levelId (0..19)
const UNLOCK_REQS = {
  0:  { cash: 0,     medals: 0 }, // Slot  0: THPS2 Hangar (UNLOCKED AT START!)
  11: { cash: 1000,  medals: 0 }, // Slot  1: THPS1 Warehouse
  1:  { cash: 2000,  medals: 0 }, // Slot  2: THPS2 School II
  12: { cash: 3500,  medals: 0 }, // Slot  3: THPS1 School
  2:  { cash: 5500,  medals: 0 }, // Slot  4: THPS2 Marseille (Comp)
  13: { cash: 0,     medals: 1 }, // Slot  5: THPS1 Mall
  3:  { cash: 9500,  medals: 0 }, // Slot  6: THPS2 NY City
  14: { cash: 13500, medals: 0 }, // Slot  7: THPS1 Skate Park Chicago (Comp)
  4:  { cash: 0,     medals: 2 }, // Slot  8: THPS2 Venice Beach
  15: { cash: 21000, medals: 0 }, // Slot  9: THPS1 Downtown
  5:  { cash: 25000, medals: 0 }, // Slot 10: THPS2 SkateStreet (Comp)
  16: { cash: 0,     medals: 3 }, // Slot 11: THPS1 Downhill Jam
  6:  { cash: 34000, medals: 0 }, // Slot 12: THPS2 Philadelphia
  17: { cash: 42000, medals: 0 }, // Slot 13: THPS1 Burnside (Comp)
  7:  { cash: 0,     medals: 4 }, // Slot 14: THPS2 The Bullring (Comp)
  18: { cash: 0,     medals: 5 }, // Slot 15: THPS1 Streets SF
  8:  { cash: 55000, medals: 0 }, // Slot 16: THPS2 Chopper Drop
  19: { cash: 60000, medals: 0 }, // Slot 17: THPS1 Roswell (Comp)
  9:  { cash: 0,     medals: 6 }, // Slot 18: THPS2 Skate Heaven
  10: { cash: 0,     medals: 0 }, // Slot 19: Custom Park (Free Skate)
};

// All 9 THPS1 Level Definitions:
// - ALL 6 regular career THPS1 levels have FULL 10-goal checklists (G0..G9 = 10 x 10% = 100%, identical to THPS2!),
//   with creative satirical names matching our 6 custom sculpted 3D objects (G5, subtype 33) and live THPS1 Gaps (G6/G7)!
// - All 3 competition THPS1 levels (14, 17, 19) preserve native Medal Competition mode (isComp = 1).
const THPS1_DEFS = [
  {
    id: 11, name: 'Warehouse', loc: 'Woodland Hills', vab: 'hangar', isComp: 0, trg: 'SkWare_T',
    rend: 't1rend00.bmp', levl: 't1levl00.bmp', globeLon: 2668, globeLat: -6, lightFrom: 0, primBufDelta: 12000,
    gapMin: 1000, gapMax: 1099,
    scores: [5000, 15000, 35000], par: [20000, 7000, 3000],
    goals: [
      { type: 0, p1: 5000,       p2: 0,             text: 'Nota Baixa - 5,000',     cash: 150 },
      { type: 0, p1: 15000,      p2: 0,             text: 'Nota Pro - 15,000',      cash: 250 },
      { type: 0, p1: 35000,      p2: 0,             text: 'Nota Lula - 35,000',     cash: 400 },
      { type: 1, p1: 0,          p2: 0,             text: 'Formar T-A-X-A-S',       cash: 200 },
      { type: 4, p1: 5,          p2: 'CAIXAS TAXA', text: 'Quebrar 5 Caixas Taxa',  cash: 250 },
      { type: 3, p1: 0x5111A101, p2: 'MANDIOCAS',   text: '5 Mandiocas da Dilma',   cash: 300 },
      { type: 5, p1: 0,          p2: '50-50',       text: '50-50 Trilhao da Taxa',  cash: 300 },
      { type: 2, p1: 0,          p2: 'VOOS JANJA',  text: '3 Voos Canal da Janja',  cash: 350 },
      { type: 6, p1: 0,          p2: 0,             text: 'Pinga 51 Secreta',       cash: 350 },
      { type: 7, p1: 0,          p2: 0,             text: '100% Bolsa Mandioca!',   cash: 500 },
    ],
  },
  {
    id: 12, name: 'School', loc: 'Miami', vab: 'school2', isComp: 0, trg: 'SkSchl_T',
    rend: 't1rend01.bmp', levl: 't1levl01.bmp', globeLon: 3160, globeLat: -16, lightFrom: 1, primBufDelta: -20000,
    gapMin: 2000, gapMax: 2099,
    scores: [7500, 25000, 55000], par: [20000, 7000, 3000],
    goals: [
      { type: 0, p1: 7500,       p2: 0,               text: 'Merenda - 7,500',        cash: 200 },
      { type: 0, p1: 25000,      p2: 0,               text: 'Nota MEC - 25,000',      cash: 350 },
      { type: 0, p1: 55000,      p2: 0,               text: 'Sem Diploma - 55,000',   cash: 500 },
      { type: 1, p1: 0,          p2: 0,               text: 'Formar T-A-X-A-S',       cash: 250 },
      { type: 4, p1: 5,          p2: 'MESAS MERENDA', text: 'Grind 5 Mesas do MEC',   cash: 300 },
      { type: 3, p1: 0x5112A102, p2: 'TRIPLEX',       text: '5 Triplex do Guaruja',   cash: 400 },
      { type: 5, p1: 0,          p2: 'Kickflip',      text: 'Kickflip Canteiro L',    cash: 400 },
      { type: 2, p1: 0,          p2: 'SALTOS MEC',    text: '3 Saltos Sem-Diploma',   cash: 450 },
      { type: 6, p1: 0,          p2: 0,               text: 'Pinga 51 Secreta',       cash: 400 },
      { type: 7, p1: 0,          p2: 0,               text: '100% Triplex Quitado!',  cash: 600 },
    ],
  },
  {
    id: 13, name: 'Mall', loc: 'New York', vab: 'ny', isComp: 0, trg: 'SkMall_T',
    rend: 't1rend02.bmp', levl: 't1levl02.bmp', globeLon: 3238, globeLat: -24, lightFrom: 3, primBufDelta: -28000,
    gapMin: 2300, gapMax: 2399,
    scores: [10000, 30000, 65000], par: [20000, 7000, 3000],
    goals: [
      { type: 0, p1: 10000,      p2: 0,             text: 'Shopee - 10,000',        cash: 300 },
      { type: 0, p1: 30000,      p2: 0,             text: 'Shein Pro - 30,000',     cash: 500 },
      { type: 0, p1: 65000,      p2: 0,             text: 'Taxa 92% - 65,000',      cash: 700 },
      { type: 1, p1: 0,          p2: 0,             text: 'Formar T-A-X-A-S',       cash: 400 },
      { type: 4, p1: 5,          p2: 'PLACAS TAXA', text: 'Quebrar 5 Placas Taxa',  cash: 400 },
      { type: 3, p1: 0x5113A103, p2: 'MALAS $$$',   text: '5 Malas do Mensalao',    cash: 500 },
      { type: 5, p1: 0,          p2: 'Grind',       text: 'Grind Atrio do BNDES',   cash: 500 },
      { type: 2, p1: 0,          p2: 'SALTOS MALL', text: '3 Saltos Isencao Zero',  cash: 550 },
      { type: 6, p1: 0,          p2: 0,             text: 'Pinga 51 Secreta',       cash: 500 },
      { type: 7, p1: 0,          p2: 0,             text: '100% Mensalao Pago!',    cash: 750 },
    ],
  },
  {
    id: 14, name: 'Skate Park', loc: 'Chicago', vab: 'ss', isComp: 1, trg: 'skvans_t',
    rend: 't1rend03.bmp', levl: 't1levl03.bmp', globeLon: 3040, globeLat: -25, lightFrom: 5, primBufDelta: -8000,
    gapMin: 4000, gapMax: 4099,
    scores: [35000, 22000, 12000], par: [3000, 2250, 1500],
    goals: [],
  },
  {
    id: 15, name: 'Downtown', loc: 'Minneapolis', vab: 'ny', isComp: 0, trg: 'SkDown_T',
    rend: 't1rend04.bmp', levl: 't1levl04.bmp', globeLon: 2960, globeLat: -27, lightFrom: 3, primBufDelta: -18000,
    gapMin: 1100, gapMax: 1299,
    scores: [15000, 40000, 85000], par: [20000, 7000, 3000],
    goals: [
      { type: 0, p1: 15000,      p2: 0,               text: 'Taxa INSS - 15,000',     cash: 450 },
      { type: 0, p1: 40000,      p2: 0,               text: 'Sigilo 100 - 40,000',    cash: 700 },
      { type: 0, p1: 85000,      p2: 0,               text: 'Pro INSS - 85,000',      cash: 950 },
      { type: 1, p1: 0,          p2: 0,               text: 'Formar T-A-X-A-S',       cash: 550 },
      { type: 4, p1: 5,          p2: 'PLACAS SIGILO', text: '5 Placas do Sigilo',     cash: 600 },
      { type: 3, p1: 0x5115A104, p2: 'COFRES INSS',   text: '5 Cofres Roubo INSS',    cash: 700 },
      { type: 5, p1: 0,          p2: 'Tailslide',     text: 'Tailslide Borda INSS',   cash: 700 },
      { type: 2, p1: 0,          p2: 'PULO CENTRO',   text: '3 Saltos do Desconto',   cash: 750 },
      { type: 6, p1: 0,          p2: 0,               text: 'Pinga 51 Secreta',       cash: 700 },
      { type: 7, p1: 0,          p2: 0,               text: '100% INSS na Conta!',    cash: 1000 },
    ],
  },
  {
    id: 16, name: 'Downhill Jam', loc: 'Phoenix', vab: 'venice', isComp: 0, trg: 'SkJam_T',
    rend: 't1rend05.bmp', levl: 't1levl05.bmp', globeLon: 2740, globeLat: -10, lightFrom: 4, primBufDelta: -24000,
    gapMin: 2600, gapMax: 2699,
    scores: [20000, 45000, 95000], par: [20000, 7000, 3000],
    goals: [
      { type: 0, p1: 20000,      p2: 0,              text: 'Represa - 20,000',       cash: 550 },
      { type: 0, p1: 45000,      p2: 0,              text: 'Sitio Pro - 45,000',     cash: 850 },
      { type: 0, p1: 95000,      p2: 0,              text: 'Atibaia - 95,000',       cash: 1100 },
      { type: 1, p1: 0,          p2: 0,              text: 'Formar T-A-X-A-S',       cash: 650 },
      { type: 4, p1: 5,          p2: 'TORNEIRAS',    text: '5 Torneiras Petrolao',   cash: 700 },
      { type: 3, p1: 0x5116A105, p2: 'PEDALINHOS',   text: '5 Pedalinhos Atibaia',   cash: 800 },
      { type: 5, p1: 0,          p2: 'Heelflip',     text: 'Heelflip Lago Sitio',    cash: 800 },
      { type: 2, p1: 0,          p2: 'VOOS REPRESA', text: '3 Voos da Inflacao',     cash: 850 },
      { type: 6, p1: 0,          p2: 0,              text: 'Pinga 51 Secreta',       cash: 800 },
      { type: 7, p1: 0,          p2: 0,              text: '100% Sitio de Amigo!',   cash: 1200 },
    ],
  },
  {
    id: 17, name: 'Burnside', loc: 'Portland', vab: 'mar', isComp: 1, trg: 'SkBurn_T',
    rend: 't1rend06.bmp', levl: 't1levl06.bmp', globeLon: 2560, globeLat: -28, lightFrom: 2, primBufDelta: -8000,
    gapMin: 4100, gapMax: 4199,
    scores: [55000, 40000, 25000], par: [4000, 3000, 2000],
    goals: [],
  },
  {
    id: 18, name: 'Streets', loc: 'San Francisco', vab: 'philly', isComp: 0, trg: 'SkSF_T',
    rend: 't1rend07.bmp', levl: 't1levl07.bmp', globeLon: 2580, globeLat: -14, lightFrom: 6, primBufDelta: -28000,
    gapMin: 3000, gapMax: 3399,
    scores: [25000, 55000, 110000], par: [20000, 7000, 3000],
    goals: [
      { type: 0, p1: 25000,      p2: 0,             text: 'Abobora - 25,000',       cash: 750 },
      { type: 0, p1: 55000,      p2: 0,             text: 'Picanha - 55,000',       cash: 1100 },
      { type: 0, p1: 110000,     p2: 0,             text: 'Churrasco - 110,000',    cash: 1400 },
      { type: 1, p1: 0,          p2: 0,             text: 'Formar T-A-X-A-S',       cash: 850 },
      { type: 4, p1: 5,          p2: 'VIATURAS PF', text: 'Pular 5 Viaturas PF',    cash: 900 },
      { type: 3, p1: 0x5118A106, p2: 'PICANHAS',    text: '5 Picanhas Promessa',    cash: 1000 },
      { type: 5, p1: 0,          p2: 'Nosegrind',   text: 'Nosegrind Hubba PF',     cash: 1000 },
      { type: 2, p1: 0,          p2: 'FUGAS DA PF', text: '3 Fugas da PF',          cash: 1050 },
      { type: 6, p1: 0,          p2: 0,             text: 'Pinga 51 Secreta',       cash: 1000 },
      { type: 7, p1: 0,          p2: 0,             text: '100% Picanha e 51!',     cash: 1500 },
    ],
  },
  {
    id: 19, name: 'Roswell', loc: 'New Mexico', vab: 'bullring', isComp: 1, trg: 'SkRos_T',
    rend: 't1rend08.bmp', levl: 't1levl08.bmp', globeLon: 2800, globeLat: -8, lightFrom: 7, primBufDelta: -20000,
    gapMin: 4200, gapMax: 4299,
    scores: [75000, 55000, 35000], par: [5000, 3500, 2000],
    goals: [],
  },
];

// 24 Live Verified THPS1 Gaps (4 per regular THPS1 level: 1x gt=2 for G6 Trick+Gap + 3x gt=1 for G7 Multi-Gap!)
// Every gapId matches an exact live 0x00C9 EndGap trigger inside its level's .TRG and falls inside [gapMin, gapMax]!
const THPS1_GAPS = [
  // [11] Warehouse (gapMin=1000, gapMax=1099)
  { f0: 25, gt: 2, gapId: 21000, pts: 300, name: '[TRILHAO DA TAXA]'   },
  { f0: 19, gt: 1, gapId: 11000, pts: 250, name: '[CANAL DA JANJA]'    },
  { f0: 19, gt: 1, gapId:  1006, pts: 200, name: '[RAMPA DO ICMS]'     },
  { f0: 19, gt: 1, gapId:  1007, pts: 300, name: '[PULO DO HALFPIPE]'  },
  // [12] School (gapMin=2000, gapMax=2099)
  { f0: 19, gt: 2, gapId:  2010, pts: 250, name: '[CANTEIRO DO L]'     },
  { f0: 19, gt: 1, gapId:  2009, pts: 250, name: '[MINI SALTO DO MEC]' },
  { f0: 19, gt: 1, gapId:  2011, pts: 250, name: '[RAMPA DO ENEM]'     },
  { f0: 25, gt: 1, gapId: 22002, pts: 500, name: '[CORRIMAO DA GREVE]' },
  // [13] Mall (gapMin=2300, gapMax=2399)
  { f0: 25, gt: 2, gapId: 22301, pts: 500, name: '[ATRIO DO BNDES]'    },
  { f0: 19, gt: 1, gapId:  2305, pts: 200, name: '[VOO DA ALFANDEGA]'  },
  { f0: 19, gt: 1, gapId:  2306, pts: 200, name: '[JARDIM DO IMPOSTO]' },
  { f0: 19, gt: 1, gapId:  2310, pts: 300, name: '[FONTE DA PROPINA]'  },
  // [15] Downtown (gapMin=1100, gapMax=1299)
  { f0: 25, gt: 2, gapId: 21200, pts: 250, name: '[BORDA DO INSS]'     },
  { f0: 19, gt: 1, gapId:  1100, pts: 200, name: '[RAMPA SINDICATO]'   },
  { f0: 19, gt: 1, gapId:  1106, pts: 250, name: '[PULO NO TAXI DO L]' },
  { f0: 19, gt: 1, gapId:  1108, pts: 300, name: '[SALTO ESCRITORIO]'  },
  // [16] Downhill Jam (gapMin=2600, gapMax=2699)
  { f0: 19, gt: 2, gapId:  2609, pts: 300, name: '[LAGO DE ATIBAIA]'   },
  { f0: 19, gt: 1, gapId:  2611, pts: 150, name: '[INFLACAO 25%]'      },
  { f0: 19, gt: 1, gapId:  2603, pts: 250, name: '[INFLACAO 50%]'      },
  { f0: 19, gt: 1, gapId:  2604, pts: 500, name: '[INFLACAO 100%]'     },
  // [18] Streets SF (gapMin=3000, gapMax=3399)
  { f0: 25, gt: 2, gapId: 23002, pts: 500, name: '[HUBBA DA PF]'       },
  { f0: 19, gt: 1, gapId:  3311, pts: 300, name: '[CANTEIRO DA FUGA]'  },
  { f0: 19, gt: 1, gapId:  3314, pts: 500, name: '[RAMPA DO HABEAS]'   },
  { f0: 19, gt: 1, gapId:  3320, pts: 500, name: '[KICKER DO INDULTO]' },
];

// ============================================================================
// Self-Verifying MIPS I (R3000A) Assembler
// ============================================================================
const R = {
  zero: 0, at: 1, v0: 2, v1: 3,
  a0: 4, a1: 5, a2: 6, a3: 7,
  t0: 8, t1: 9, t2: 10, t3: 11, t4: 12, t5: 13, t6: 14, t7: 15,
  s0: 16, s1: 17, s2: 18, s3: 19, s4: 20, s5: 21, s6: 22, s7: 23,
  t8: 24, t9: 25, k0: 26, k1: 27, gp: 28, sp: 29, fp: 30, ra: 31,
};

function splitHiLo(addr) {
  const hi = ((addr + 0x8000) >>> 16) & 0xFFFF;
  const lo = addr & 0xFFFF;
  return { hi, lo };
}

class MipsAsm {
  constructor(baseAddr) {
    this.base = baseAddr >>> 0;
    this.bytesList = [];
    this.labels = new Map();
    this.fixups = [];
  }
  pc() { return (this.base + this.bytesList.length) >>> 0; }
  label(name) {
    if (this.labels.has(name)) throw new Error(`Duplicate label: ${name}`);
    this.labels.set(name, this.pc());
  }
  align(n) { while (this.bytesList.length % n !== 0) this.bytesList.push(0); }
  padTo(addr) {
    const need = (addr >>> 0) - this.base;
    if (need < this.bytesList.length) throw new Error(`padTo(0x${addr.toString(16)}) overflow (cur=0x${this.pc().toString(16)})`);
    while (this.bytesList.length < need) this.bytesList.push(0);
  }
  word(w) {
    const v = w >>> 0;
    this.bytesList.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
  }
  bytes(buf) { for (let i = 0; i < buf.length; i++) this.bytesList.push(buf[i]); }
  r(fn, rs, rt, rd, sh = 0) { this.word(((rs & 31) << 21) | ((rt & 31) << 16) | ((rd & 31) << 11) | ((sh & 31) << 6) | (fn & 63)); }
  i(op, rs, rt, imm) { this.word(((op & 63) << 26) | ((rs & 31) << 21) | ((rt & 31) << 16) | (imm & 0xFFFF)); }
  jOp(op, target) {
    if (typeof target === 'string') {
      this.fixups.push({ type: 'J', off: this.bytesList.length, op, target });
      this.word(0);
    } else {
      this.word(((op & 63) << 26) | (((target >>> 2) & 0x03FFFFFF)));
    }
  }
  br(op, rs, rt, target) {
    if (typeof target === 'string') {
      this.fixups.push({ type: 'B', off: this.bytesList.length, op, rs, rt, target });
      this.word(0);
    } else {
      const rel = (((target >>> 0) - (this.pc() + 4)) >> 2) & 0xFFFF;
      this.i(op, rs, rt, rel);
    }
  }
  nop() { this.word(0); }
  sll(rd, rt, sh) { this.r(0x00, 0, rt, rd, sh); }
  srl(rd, rt, sh) { this.r(0x02, 0, rt, rd, sh); }
  sra(rd, rt, sh) { this.r(0x03, 0, rt, rd, sh); }
  sllv(rd, rt, rs) { this.r(0x04, rs, rt, rd); }
  srav(rd, rt, rs) { this.r(0x07, rs, rt, rd); }
  jr(rs) { this.r(0x08, rs, 0, 0); }
  jalr(rd, rs) { this.r(0x09, rs, 0, rd); }
  mfhi(rd) { this.r(0x10, 0, 0, rd); }
  mflo(rd) { this.r(0x12, 0, 0, rd); }
  mult(rs, rt) { this.r(0x18, rs, rt, 0); }
  divu(rs, rt) { this.r(0x1B, rs, rt, 0); }
  addu(rd, rs, rt) { this.r(0x21, rs, rt, rd); }
  subu(rd, rs, rt) { this.r(0x23, rs, rt, rd); }
  and(rd, rs, rt) { this.r(0x24, rs, rt, rd); }
  or(rd, rs, rt) { this.r(0x25, rs, rt, rd); }
  slt(rd, rs, rt) { this.r(0x2A, rs, rt, rd); }
  sltu(rd, rs, rt) { this.r(0x2B, rs, rt, rd); }
  move(rd, rs) { this.addu(rd, rs, R.zero); }
  bltz(rs, t) { this.br(0x01, rs, 0, t); }
  bgez(rs, t) { this.br(0x01, rs, 1, t); }
  j(t) { this.jOp(0x02, t); }
  jal(t) { this.jOp(0x03, t); }
  beq(rs, rt, t) { this.br(0x04, rs, rt, t); }
  bne(rs, rt, t) { this.br(0x05, rs, rt, t); }
  blez(rs, t) { this.br(0x06, rs, 0, t); }
  bgtz(rs, t) { this.br(0x07, rs, 0, t); }
  addiu(rt, rs, imm) { this.i(0x09, rs, rt, imm); }
  slti(rt, rs, imm) { this.i(0x0A, rs, rt, imm); }
  sltiu(rt, rs, imm) { this.i(0x0B, rs, rt, imm); }
  andi(rt, rs, imm) { this.i(0x0C, rs, rt, imm); }
  ori(rt, rs, imm) { this.i(0x0D, rs, rt, imm); }
  lui(rt, imm) { this.i(0x0F, 0, rt, imm); }
  lb(rt, imm, rs) { this.i(0x20, rs, rt, imm); }
  lh(rt, imm, rs) { this.i(0x21, rs, rt, imm); }
  lw(rt, imm, rs) { this.i(0x23, rs, rt, imm); }
  lbu(rt, imm, rs) { this.i(0x24, rs, rt, imm); }
  lhu(rt, imm, rs) { this.i(0x25, rs, rt, imm); }
  sb(rt, imm, rs) { this.i(0x28, rs, rt, imm); }
  sh(rt, imm, rs) { this.i(0x29, rs, rt, imm); }
  sw(rt, imm, rs) { this.i(0x2B, rs, rt, imm); }
  li(rt, val) {
    const u = val >>> 0;
    if (u <= 0xFFFF) { this.ori(rt, R.zero, u); }
    else { this.lui(rt, (u >>> 16) & 0xFFFF); if (u & 0xFFFF) this.ori(rt, rt, u & 0xFFFF); }
  }
  la(rt, addrOrLabel) {
    if (typeof addrOrLabel === 'string') {
      this.fixups.push({ type: 'LA', off: this.bytesList.length, rt, target: addrOrLabel });
      this.word(0); this.word(0);
    } else {
      const { hi, lo } = splitHiLo(addrOrLabel >>> 0);
      this.lui(rt, hi);
      this.addiu(rt, rt, lo);
    }
  }
  emit() {
    const buf = Buffer.from(this.bytesList);
    for (const f of this.fixups) {
      if (!this.labels.has(f.target)) throw new Error(`Unresolved label: ${f.target}`);
      const tgt = this.labels.get(f.target);
      const curPc = (this.base + f.off) >>> 0;
      if (f.type === 'J') {
        buf.writeUInt32LE((((f.op & 63) << 26) | ((tgt >>> 2) & 0x03FFFFFF)) >>> 0, f.off);
      } else if (f.type === 'B') {
        const rel = (tgt - (curPc + 4)) >> 2;
        if (rel < -32768 || rel > 32767) throw new Error(`Branch out of range to ${f.target}`);
        buf.writeUInt32LE((((f.op & 63) << 26) | ((f.rs & 31) << 21) | ((f.rt & 31) << 16) | (rel & 0xFFFF)) >>> 0, f.off);
      } else if (f.type === 'LA') {
        const { hi, lo } = splitHiLo(tgt);
        buf.writeUInt32LE(((0x0F << 26) | ((f.rt & 31) << 16) | hi) >>> 0, f.off);
        buf.writeUInt32LE(((0x09 << 26) | ((f.rt & 31) << 21) | ((f.rt & 31) << 16) | lo) >>> 0, f.off + 4);
      }
    }
    return buf;
  }
}

// ============================================================================
// 1. Build Resident 24 KB THPS1 Engine Block (RAM 0x800E6000..0x800EBFFF)
// ============================================================================
function buildThps1ResidentBlock() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifesto THPS1 ausente em ${MANIFEST_PATH}. Execute node tools/port_thps1_levels.js primeiro.`);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const origSlus = fs.readFileSync(ORIG_SLUS_PATH);
  const ramToFile = (ram) => (ram - SLUS_BASE) + SLUS_HDR;

  const block = Buffer.alloc(THPS1_ADDR.TotalBytes, 0);
  const putAt = (ram, buf) => buf.copy(block, ram - THPS1_ADDR.Base);

  // --- A. Build THPS1 String Pool (Primary @ 0x800E9000..0x800E96E0 + Spill @ 0x800E8C80..0x800E9000) ---
  let strCursor = THPS1_ADDR.Thps1Strings;
  let strSpillCursor = THPS1_ADDR.Thps1StringsSpill;
  const strMap = new Map();
  function internStr(s) {
    if (strMap.has(s)) return strMap.get(s);
    const raw = Buffer.from(s + '\0', 'ascii');
    const len = raw.length; // byte-packed C strings (lbu), zero wasted alignment padding!
    let addr;
    if (strCursor + len <= THPS1_ADDR.g_Thps1BaseLba) {
      addr = strCursor;
      strCursor += len;
    } else if (strSpillCursor + len <= THPS1_ADDR.Thps1Strings) {
      addr = strSpillCursor;
      strSpillCursor += len;
    } else {
      throw new Error(`Thps1Strings overflow (primary=0x${strCursor.toString(16)}, spill=0x${strSpillCursor.toString(16)}, str="${s}")`);
    }
    putAt(addr, raw);
    strMap.set(s, addr);
    return addr;
  }
  const strEmpty = internStr('');
  const strThps1WadPath = internStr('\\THPS1.WAD;1');
  const strCVan = internStr('c_van');
  const strCCab1 = internStr('c_cabl1');
  const strT1Comp0 = internStr('t1comp0.bmp');
  const strT1Comp1 = internStr('t1comp1.bmp');
  const strT1Comp2 = internStr('t1comp2.bmp');
  block.writeUInt32LE(strThps1WadPath >>> 0, THPS1_ADDR.g_Thps1StrPathPtr - THPS1_ADDR.Base);

  // --- B. Build g_ExtLevelTable[20] @ 0x800E6000 ---
  // Copy original THPS2 11 entries [0..10] verbatim (preserving all pointers & goals!)
  const origLtOff = ramToFile(0x800B8444);
  origSlus.copy(block, 0, origLtOff, origLtOff + 11 * 0x174);
  // Apply fixed School II G6 "Kickflip" pointer intact (data in SLUS is patched too)
  // Update interleaved unlock thresholds (+0x44 cash, +0x48 medals) for [0..10]
  for (let i = 0; i < 11; i++) {
    const req = UNLOCK_REQS[i];
    const baseOff = i * 0x174;
    block.writeUInt32LE(req.cash >>> 0, baseOff + 0x44);
    block.writeUInt32LE(req.medals >>> 0, baseOff + 0x48);
  }

  // Construct entries [11..19] for ALL 9 THPS1 levels!
  // Start each from a clean template of Hangar [0] (for career) or Marseille [2] (for comp) so
  // all secondary physics/camera/OOB fields (+0x60..+0x7C, +0x170) are 100% valid!
  for (const def of THPS1_DEFS) {
    const dstOff = def.id * 0x174;
    const tplIdx = def.isComp ? 2 : 0;
    origSlus.copy(block, dstOff, origLtOff + tplIdx * 0x174, origLtOff + (tplIdx + 1) * 0x174);

    block.writeUInt32LE(internStr(def.name) >>> 0, dstOff + 0x00);
    block.writeUInt32LE(internStr(def.loc) >>> 0,  dstOff + 0x04);
    block.writeUInt32LE(internStr(def.vab) >>> 0,  dstOff + 0x08);
    block.writeUInt32LE(def.isComp >>> 0,          dstOff + 0x0C);
    block.writeUInt32LE(0,                         dstOff + 0x10);
    block.writeUInt32LE(internStr(def.trg) >>> 0,  dstOff + 0x14);
    block.writeUInt32LE(def.scores[0] >>> 0,       dstOff + 0x18);
    block.writeUInt32LE(def.scores[1] >>> 0,       dstOff + 0x1C);
    block.writeUInt32LE(def.scores[2] >>> 0,       dstOff + 0x20);
    block.writeUInt32LE(def.par[0] >>> 0,          dstOff + 0x24);
    block.writeUInt32LE(def.par[1] >>> 0,          dstOff + 0x28);
    block.writeUInt32LE(def.par[2] >>> 0,          dstOff + 0x2C);
    block.writeUInt32LE(internStr(def.rend) >>> 0, dstOff + 0x30);
    block.writeUInt32LE(0,                         dstOff + 0x34); // videoSlot=0 -> crisp static BMP preview!
    block.writeUInt32LE(def.globeLon >>> 0,        dstOff + 0x38);
    block.writeInt32LE(def.globeLat,               dstOff + 0x3C);
    block.writeUInt32LE(internStr(def.levl) >>> 0, dstOff + 0x40);

    const req = UNLOCK_REQS[def.id];
    block.writeUInt32LE(req.cash >>> 0,            dstOff + 0x44);
    block.writeUInt32LE(req.medals >>> 0,          dstOff + 0x48);
    block.writeUInt32LE(def.isComp ? 1 : 0,        dstOff + 0x4C);
    block.writeInt32LE(def.primBufDelta || 0,      dstOff + 0x50); // Native Neversoft per-level PrimBuf delta (2x in Heap[1]!)
    block.writeUInt32LE(0,                         dstOff + 0x54);
    block.writeUInt32LE(0,                         dstOff + 0x58);
    block.writeUInt32LE(0,                         dstOff + 0x5C);
    block.writeInt32LE(-18,                        dstOff + 0x60);
    block.writeUInt32LE(def.gapMin >>> 0,          dstOff + 0x78); // Gap ID range min (Career_IsGapInCurrentLevel @ 0x80024780!)
    block.writeUInt32LE(def.gapMax >>> 0,          dstOff + 0x7C); // Gap ID range max (Career_IsGapInCurrentLevel @ 0x80024798!)
    block.writeUInt32LE(0x800BA174,                dstOff + 0x170); // OOB bail strings

    // Populate ALL 10 Goal slots (+0x80, stride 24):
    // Career THPS1 levels fill ALL 10 slots G0..G9 (identical to THPS2!), comp levels use Marseille template.
    for (let g = 0; g < 10; g++) {
      const gf = dstOff + 0x80 + g * 24;
      if (!def.isComp && g < def.goals.length) {
        const gd = def.goals[g];
        block.writeUInt32LE(gd.type >>> 0, gf + 0);
        block.writeUInt32LE(gd.p1 >>> 0,   gf + 4);
        block.writeUInt32LE((typeof gd.p2 === 'string' ? internStr(gd.p2) : gd.p2) >>> 0, gf + 8);
        block.writeUInt32LE(gd.cash >>> 0, gf + 12);
        block.writeUInt32LE(internStr(gd.text) >>> 0, gf + 16);
        block.writeUInt32LE(0, gf + 20);
      } else if (def.isComp) {
        // Comp template placeholder (same as Marseille)
        block.writeUInt32LE(0, gf + 0);
        block.writeUInt32LE(10000000, gf + 4);
        block.writeUInt32LE(0, gf + 8);
        block.writeUInt32LE(1000, gf + 12);
        block.writeUInt32LE(strEmpty >>> 0, gf + 16);
        block.writeUInt32LE(0, gf + 20);
      } else {
        // Unused goal slots G5..G9 -> type=8 (inactive, empty text)
        block.writeUInt32LE(8, gf + 0);
        block.writeUInt32LE(10000000, gf + 4);
        block.writeUInt32LE(0, gf + 8);
        block.writeUInt32LE(0, gf + 12);
        block.writeUInt32LE(strEmpty >>> 0, gf + 16);
        block.writeUInt32LE(0, gf + 20);
      }
    }
  }

  // --- C. Display Order, Inverse Lookup, Legacy Load Order & Contiguous Fast-Burst Level Select Tables ---
  for (let i = 0; i < 20; i++) {
    block.writeUInt32LE(DISPLAY_ORDER[i] >>> 0, (THPS1_ADDR.DisplayOrderWords - THPS1_ADDR.Base) + i * 4);
    block.writeUInt8(SLOT_OF_LEVEL[i] & 0xFF, (THPS1_ADDR.SlotOfLevel - THPS1_ADDR.Base) + i);
    block.writeUInt32LE(i >>> 0, (THPS1_ADDR.LoadOrderWords - THPS1_ADDR.Base) + i * 4);
  }
  // Exact contiguous disc-LBA order of all 40 Level Select BMPs — 100% INSIDE CD.WAD (ZERO Minute-71 seeks!):
  //   - t1rend: CD.WAD[573] sec 7500..7544 (45 sec, stride 5 sec = 10,240 B, LBA 7955)
  //   - t1levl: CD.WAD[578] sec 7594..7647 (54 sec, stride 6 sec = 12,288 B, LBA 8049)
  //   - s2levl: CD.WAD      sec 9476..9541 (66 sec, stride 6 sec = 12,288 B, LBA 9931)
  //   - s2rend: CD.WAD      sec 9553..9607 (55 sec, stride 5 sec = 10,240 B, LBA 10008)
  const S2_REND_DISC_ORDER = [2, 5, 3, 1, 6, 0, 4, 7, 8, 9, 10];
  const S2_LEVL_DISC_ORDER = [9, 2, 5, 3, 1, 6, 4, 0, 7, 8, 10];
  const T1_DISC_ORDER      = [11, 12, 13, 14, 15, 16, 17, 18, 19];
  const inPlace = manifest.cdWadInPlace;
  if (!inPlace || !Array.isArray(inPlace.bmps) || inPlace.bmps.length !== 18) {
    throw new Error('thps1_manifest.json sem cdWadInPlace.bmps (rode tools/port_thps1_levels.js primeiro!)');
  }
  const T1_REND_CD_SEC = inPlace.rendBaseSec; // 7500 (LBA 7955)
  const T1_LEVL_CD_SEC = inPlace.levlBaseSec; // 7594 (LBA 8049)
  for (let k = 0; k < 9; k++) {
    const rName = `t1rend0${k}.bmp`, lName = `t1levl0${k}.bmp`;
    const rEnt = inPlace.bmps.find(e => e.name === rName);
    const lEnt = inPlace.bmps.find(e => e.name === lName);
    if (!rEnt || (rEnt.cdWadOff >> 11) !== T1_REND_CD_SEC + k * 5) throw new Error(`FastBurst mismatch: ${rName}`);
    if (!lEnt || (lEnt.cdWadOff >> 11) !== T1_LEVL_CD_SEC + k * 6) throw new Error(`FastBurst mismatch: ${lName}`);
  }
  putAt(THPS1_ADDR.S2RendDiscOrder, Buffer.from(S2_REND_DISC_ORDER));
  putAt(THPS1_ADDR.S2LevlDiscOrder, Buffer.from(S2_LEVL_DISC_ORDER));
  putAt(THPS1_ADDR.T1DiscOrder,     Buffer.from(T1_DISC_ORDER));

  // Write burst descriptor tables:
  //   { u32 srcFlags (bit0: 0=CD.WAD; bit1: 1=upload to g_SavedRendSprites with mode=-1),
  //     u32 secOff, u16 count, u16 strideSec, u32 orderPtr }
  function writeBurstDesc(ram, srcFlags, secOff, count, strideSec, orderPtr) {
    const off = ram - THPS1_ADDR.Base;
    block.writeUInt32LE(srcFlags >>> 0, off + 0);
    block.writeUInt32LE(secOff >>> 0, off + 4);
    block.writeUInt16LE(count & 0xFFFF, off + 8);
    block.writeUInt16LE(strideSec & 0xFFFF, off + 10);
    block.writeUInt32LE(orderPtr >>> 0, off + 12);
  }
  // Single-Pass Strictly Ascending CD.WAD-ONLY FastBurst (ZERO Minute-71 seeks, ZERO backward seeks, max 55s = 112 KB!):
  //   - FastRend saves CLevelRend->spritesBase and returns immediately in 0 frames!
  //   - FastMap frees g_BurstBuf and reads all 40 BMPs monotonically forward from LBA 7955 -> LBA 10062!
  writeBurstDesc(THPS1_ADDR.FastBurstMapDesc +  0, 2, T1_REND_CD_SEC, 9, 5, THPS1_ADDR.T1DiscOrder);         // CD.WAD[573] LBA 7955  (45s) -> CLevelRend!
  writeBurstDesc(THPS1_ADDR.FastBurstMapDesc + 16, 0, T1_LEVL_CD_SEC, 9, 6, THPS1_ADDR.T1DiscOrder);         // CD.WAD[578] LBA 8049  (54s) -> CLevelMap!
  writeBurstDesc(THPS1_ADDR.FastBurstMapDesc + 32, 0, 9476,           6, 6, THPS1_ADDR.S2LevlDiscOrder + 0); // CD.WAD      LBA 9931  (36s) -> CLevelMap!
  writeBurstDesc(THPS1_ADDR.FastBurstMapDesc + 48, 0, 9512,           5, 6, THPS1_ADDR.S2LevlDiscOrder + 6); // CD.WAD      LBA 9967  (30s) -> CLevelMap!
  writeBurstDesc(THPS1_ADDR.FastBurstMapDesc + 64, 2, 9553,          11, 5, THPS1_ADDR.S2RendDiscOrder);     // CD.WAD      LBA 10008 (55s) -> CLevelRend!

  // --- C2. Build Live THPS1 Gap Table @ 0x800E7E60 (24 gaps + sentinel = 300 B <= 416 B!) ---
  let gapOff = THPS1_ADDR.Thps1GapList - THPS1_ADDR.Base;
  for (const g of THPS1_GAPS) {
    block.writeUInt16LE(g.f0 & 0xFFFF, gapOff + 0);
    block.writeUInt16LE(g.gt & 0xFFFF, gapOff + 2);
    block.writeInt16LE(g.gapId,        gapOff + 4);
    block.writeUInt16LE(g.pts & 0xFFFF, gapOff + 6);
    block.writeUInt32LE(internStr(g.name) >>> 0, gapOff + 8);
    gapOff += 12;
  }
  // Sentinel entry (gapId = -1 terminates all g_GapList scans!)
  block.writeUInt16LE(0, gapOff + 0);
  block.writeUInt16LE(0, gapOff + 2);
  block.writeInt16LE(-1, gapOff + 4);
  block.writeUInt16LE(0, gapOff + 6);
  block.writeUInt32LE(0, gapOff + 8);
  gapOff += 12;
  if (THPS1_ADDR.Base + gapOff > THPS1_ADDR.ExtLightTable) {
    throw new Error(`Thps1GapList overflow: 0x${(THPS1_ADDR.Base + gapOff).toString(16)} > 0x${THPS1_ADDR.ExtLightTable.toString(16)}`);
  }

  // --- D. Extended Light (stride 52), Shadow (stride 16), and THPS1 HighScore Table (stride 64 @ 0x800E8550) ---
  const origLightOff = ramToFile(0x800B961C);
  const origShadowOff = ramToFile(0x800B9824);
  origSlus.copy(block, THPS1_ADDR.ExtLightTable - THPS1_ADDR.Base, origLightOff, origLightOff + 11 * 52);
  origSlus.copy(block, THPS1_ADDR.ExtShadowTable - THPS1_ADDR.Base, origShadowOff, origShadowOff + 11 * 16);
  for (const def of THPS1_DEFS) {
    const src = def.lightFrom;
    origSlus.copy(block, (THPS1_ADDR.ExtLightTable - THPS1_ADDR.Base) + def.id * 52, origLightOff + src * 52, origLightOff + (src + 1) * 52);
    origSlus.copy(block, (THPS1_ADDR.ExtShadowTable - THPS1_ADDR.Base) + def.id * 16, origShadowOff + src * 16, origShadowOff + (src + 1) * 16);
    // Initialize THPS1 per-level HighScore leaderboard (8 entries * 8 B = 64 B) at ExtSkyTable + (id - 11) * 64
    const hsBase = (THPS1_ADDR.ExtSkyTable - THPS1_ADDR.Base) + (def.id - 11) * 64;
    for (let r = 0; r < 8; r++) {
      const eOff = hsBase + r * 8;
      block[eOff + 0] = 0x4E; // 'N'
      block[eOff + 1] = 0x45; // 'E'
      block[eOff + 2] = 0x56; // 'V'
      block[eOff + 3] = 0;    // skaterId 0
      block.writeUInt32LE((8 - r) * 1000, eOff + 4);
    }
  }

  // --- E. THPS1.HED Lookup Table is now relocated inside SLUS_010.66 @ 0x800B873C (written by mod_crash_engine.js!) ---
  const maxHedEntries = 52;

  // --- E2. Assemble Turbo CD-ROM Burst Cache @ 0x800E8AB0 (464 B) & Throttle/Free Helpers @ 0x800E9ED0 (304 B) ---
  putAt(THPS1_ADDR.TurboBurstBase, assembleTurboBurstCode());
  putAt(THPS1_ADDR.TurboAuxBase,   assembleTurboAuxCode());

  // --- F. Assemble THPS1_CODE @ 0x800EA000 (4,096 B) ---
  const codeBuf = assembleThps1Code(strThps1WadPath, strCVan, strCCab1, strT1Comp0, strT1Comp1, strT1Comp2);
  putAt(THPS1_ADDR.CodeBase, codeBuf);

  const primaryUsed = strCursor - THPS1_ADDR.Thps1Strings;
  const spillUsed = strSpillCursor - THPS1_ADDR.Thps1StringsSpill;
  console.log(`  [THPS1] StringPool: primary=${primaryUsed}B/1760B + spill=${spillUsed}B/896B (total ${primaryUsed + spillUsed} B)`);
  console.log(`  [THPS1] GapTable  : ${THPS1_GAPS.length} gaps + sentinel @ 0x${THPS1_ADDR.Thps1GapList.toString(16)} (${(THPS1_GAPS.length + 1) * 12} B / 416 B)`);
  console.log(`  [THPS1] THPS1.HED : ${manifest.entries.length} arquivos indexados em 0x${THPS1_ADDR.Thps1Hed.toString(16)} (max ${maxHedEntries})`);
  return { block, manifest };
}

// ============================================================================
// 2. Assemble MIPS R3000A Resident Runtime Hooks (0x800EA000..0x800EAFFF)
// ============================================================================
function assembleThps1Code(strThps1WadPath, strCVan, strCCab1, strT1Comp0, strT1Comp1, strT1Comp2) {
  const a = new MipsAsm(THPS1_ADDR.CodeBase);

  const SYM = {
    GetSelectedSkaterIdx: 0x8008A3A8,
    Career_GetSkaterProg: 0x8002600C,
    Career_IsFreeSkate:   0x8006198C,
    CdSearchFile:         0x800A0D28,
    CdPosToInt:           0x800A179C,
    g_Career:             0x800C2958,
    g_SkaterProgBase:     0x800BA78C, // stride 228 B (0xE4)
  };

  // Fixed 8-byte jump table @ 0x800EA000
  const entries = [
    [THPS1_ADDR.Entry_CdWadFallback,        'Hook_CdWadFallback'],
    [THPS1_ADDR.Entry_CareerCountMedals,    'Hook_CareerCountMedals'],
    [THPS1_ADDR.Entry_CareerLevelIsOpenIn,  'Hook_CareerLevelIsOpenInner'],
    [THPS1_ADDR.Entry_CareerLevelIsOpenMod, 'Hook_CareerLevelIsOpenMode'],
    [THPS1_ADDR.Entry_CareerHasGoal,        'Hook_CareerHasGoal'],
    [THPS1_ADDR.Entry_CareerCountLvlGoals,  'Hook_CareerCountLvlGoals'],
    [THPS1_ADDR.Entry_CareerCountCash,      'Hook_CareerCountCash'],
    [THPS1_ADDR.Entry_CareerHasCashNode,    'Hook_CareerHasCashNode'],
    [THPS1_ADDR.Entry_CareerCollectCashBit, 'Hook_CareerCollectCashBit'],
    [THPS1_ADDR.Entry_CareerGiveGoalBit,    'Hook_CareerGiveGoalBit'],
    [THPS1_ADDR.Entry_CareerSetMedal,       'Hook_CareerSetMedal'],
    [THPS1_ADDR.Entry_CareerSetAllGoals,    'Hook_CareerSetAllGoals'],
    [THPS1_ADDR.Entry_GetLevelFlags,        'Helper_GetLevelFlags'],
    [THPS1_ADDR.Entry_CompLoadBmp,          'Hook_CompLoadBmp'],
    [THPS1_ADDR.Entry_ShowGoalsBtn,         'Hook_ShowGoalsBtn'],
    [THPS1_ADDR.Entry_LevelSelMoveCursor,   'Hook_LevelSelMoveCursor'],
    [THPS1_ADDR.Entry_LevelSelPct,          'Hook_LevelSelPct'],
    [THPS1_ADDR.Entry_LevelSelShowPct,      'Hook_LevelSelShowPct'],
    [THPS1_ADDR.Entry_SecretFlagSet,        'Hook_SecretFlagSet'],
    [THPS1_ADDR.Entry_SecretFlagGet,        'Hook_SecretFlagGet'],
    [THPS1_ADDR.Entry_TrigHasGoal,          'Hook_TrigHasGoal'],
    [THPS1_ADDR.Entry_CompInitPodium,       'Hook_CompInitPodium'],
    [THPS1_ADDR.Entry_CompPrizeAB,          'Hook_CompPrizeAB'],
    [THPS1_ADDR.Entry_CompPrizeC,           'Hook_CompPrizeC'],
    [THPS1_ADDR.Entry_CareerCountGolds,     'Hook_CareerCountGolds'],
    [THPS1_ADDR.Entry_CareerResetExt,       'Hook_CareerResetExt'],
    [THPS1_ADDR.Entry_HiScore_s7_s2,        'Hook_HiScore_s7_s2'],
    [THPS1_ADDR.Entry_HiScore_v1_s2,        'Hook_HiScore_v1_s2'],
    [THPS1_ADDR.Entry_HiScore_t3_v0,        'Hook_HiScore_t3_v0'],
    [THPS1_ADDR.Entry_HiScore_a0_s1,        'Hook_HiScore_a0_s1'],
    [THPS1_ADDR.Entry_HiScore_v1_a0,        'Hook_HiScore_v1_a0'],
    [THPS1_ADDR.Entry_Car215_SetModel,      'Hook_Car215_SetModel'],
    [THPS1_ADDR.Entry_Car216_SetModel,      'Hook_Car216_SetModel'],
    [THPS1_ADDR.Entry_LevelSelFastRend,     'Hook_LevelSelFastRend'],
    [THPS1_ADDR.Entry_LevelSelFastMap,      'Hook_LevelSelFastMap'],
    [THPS1_ADDR.Entry_SetGapList,           'Hook_SetGapList'],
    [THPS1_ADDR.Entry_GapChecklistGuard,    'Hook_GapChecklistGuard'],
  ];
  for (const [addr, lbl] of entries) {
    a.padTo(addr);
    a.j(lbl);
    a.nop();
  }

  // --------------------------------------------------------------------------
  // Leaf Helper: Helper_ExtCareerPtr(SCareerSkater* $a0) -> $v0 = &g_ExtCareer[skaterIdx]
  //   For Slot 20 Crash B. ($a0 == 0x800B85C4), returns dedicated g_CrashExtCareer (0x800B86D8)!
  //   For Slots 0..19, computes skaterIdx = ($a0 - 0x800BA78C) / 228 (exact integer division, 0..19).
  //   Clobbers: $v0, $v1, $t8, $t9 (preserves $a0..$a3, $t0..$t7, $s0..$s7, $ra!)
  // --------------------------------------------------------------------------
  a.label('Helper_ExtCareerPtr');
  a.la(R.t8, 0x800B85C4);          // g_CrashCareerData (Slot 20 Crash B.!)
  a.bne(R.a0, R.t8, 'ecp_std');
  a.nop();
  a.la(R.v0, 0x800B86D8);          // g_CrashExtCareer (100 B in freed SLUS RAM!)
  a.jr(R.ra);
  a.nop();
  a.label('ecp_std');
  a.la(R.t8, SYM.g_SkaterProgBase);
  a.subu(R.v0, R.a0, R.t8);
  a.addiu(R.t9, R.zero, 228);
  a.divu(R.v0, R.t9);
  a.mflo(R.v0);                    // v0 = skaterIdx (0..19)
  a.sltiu(R.t8, R.v0, 20);
  a.bne(R.t8, R.zero, 'ecp_ok');
  a.nop();
  a.move(R.v0, R.zero);
  a.label('ecp_ok');
  // v0 = skaterIdx * 100 = (skaterIdx * 25) * 4
  a.sll(R.t8, R.v0, 4);            // * 16
  a.sll(R.t9, R.v0, 3);            // * 8
  a.addu(R.t8, R.t8, R.t9);        // * 24
  a.addu(R.t8, R.t8, R.v0);        // * 25
  a.sll(R.v0, R.t8, 2);            // * 100
  a.la(R.t8, THPS1_ADDR.ExtCareer);
  a.jr(R.ra);
  a.addu(R.v0, R.v0, R.t8);

  // --------------------------------------------------------------------------
  // Helper_GetLevelFlagsPtr(SCareerSkater* $a0, int levelId in $a1) -> $v0 = uint16*
  //   For levelId < 10: returns $a0 + 12 + levelId*2
  //   For levelId >= 11: returns &g_ExtCareer[skaterIdx].levelFlags[levelId - 11]
  //   Preserves $a0, $a1, $a2, $a3, $t0..$t7, $s0..$s7!
  // --------------------------------------------------------------------------
  a.label('Helper_GetLevelFlagsPtr');
  a.slti(R.t8, R.a1, 11);
  a.beq(R.t8, R.zero, 'glfp_ext');
  a.nop();
  a.sll(R.v0, R.a1, 1);
  a.addu(R.v0, R.a0, R.v0);
  a.jr(R.ra);
  a.addiu(R.v0, R.v0, 12);
  a.label('glfp_ext');
  a.addiu(R.sp, R.sp, -8);
  a.sw(R.ra, 0, R.sp);
  a.jal('Helper_ExtCareerPtr');
  a.nop();
  a.addiu(R.t8, R.a1, -11);
  a.sll(R.t8, R.t8, 1);
  a.addu(R.v0, R.v0, R.t8);
  a.lw(R.ra, 0, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 8);

  // --------------------------------------------------------------------------
  // Helper_GetLevelFlags(SCareerSkater* $a0, int levelId in $a1) -> $v0 = uint16
  // --------------------------------------------------------------------------
  a.label('Helper_GetLevelFlags');
  a.addiu(R.sp, R.sp, -8);
  a.sw(R.ra, 0, R.sp);
  a.jal('Helper_GetLevelFlagsPtr');
  a.nop();
  a.lhu(R.v0, 0, R.v0);
  a.lw(R.ra, 0, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 8);

  // --------------------------------------------------------------------------
  // Helper_GetCashBitsPtr(SCareerSkater* $a0, int levelId in $a1) -> $v0 = uint32[2]*
  //   For levelId < 10: returns $a0 + 60 + levelId*8
  //   For levelId >= 11: returns &g_ExtCareer[skaterIdx].cashBits[levelId - 11] (+28 + (lvl-11)*8)
  // --------------------------------------------------------------------------
  a.label('Helper_GetCashBitsPtr');
  a.slti(R.t8, R.a1, 11);
  a.beq(R.t8, R.zero, 'gcbp_ext');
  a.nop();
  a.sll(R.v0, R.a1, 3);
  a.addu(R.v0, R.a0, R.v0);
  a.jr(R.ra);
  a.addiu(R.v0, R.v0, 60);
  a.label('gcbp_ext');
  a.addiu(R.sp, R.sp, -8);
  a.sw(R.ra, 0, R.sp);
  a.jal('Helper_ExtCareerPtr');
  a.nop();
  a.addiu(R.t8, R.a1, -11);
  a.sll(R.t8, R.t8, 3);
  a.addu(R.v0, R.v0, R.t8);
  a.addiu(R.v0, R.v0, 28);
  a.lw(R.ra, 0, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 8);

  // --------------------------------------------------------------------------
  // 1. Hook_CdWadFallback [hooked @ 0x80054190 inside CDWAD_Open]
  //    On entry: $s1 = entryPtr (from CD.HED, or 0 if absent), $a1 = file hash, $sp untouched!
  //    PRIORITY OVERRIDE: Scans g_Thps1Hed (33 entries, <2 us!) FIRST so ALL 9 converted THPS1 .TRG
  //    files (THPS2 rails + $100 Cash coins), retail .PSX deltas, c_cabl1.psx, and 18 Level Select BMPs
  //    always override Neversoft's unconverted THPS1 leftovers inside retail CD.WAD[1127..1183]!
  //    ZERO CdSearchFile at runtime: thps1BaseLba = g_VoicesBaseLba + g_VoicesTotalSectors!
  // --------------------------------------------------------------------------
  a.label('Hook_CdWadFallback');
  a.addiu(R.s0, R.sp, 16);        // execute original delay slot unconditionally!

  // Leaf lookup (clobbers only $t0..$t5 — preserves $a0..$a3, $s0..$s3, $ra, $sp!)
  a.lui(R.t0, 0x800E);
  a.lw(R.t2, 0x27C4, R.t0);       // t2 = g_VoicesBaseLba (resolved once at boot in Mod_BootInit!)
  a.la(R.t1, THPS1_ADDR.g_Thps1Inited);
  a.lw(R.t3, 0, R.t1);            // t3 = g_VoicesTotalSectors (stamped by build_skater_voices.js!)
  a.beq(R.t2, R.zero, 'cw_not_in_thps1');
  a.nop();
  a.beq(R.t3, R.zero, 'cw_not_in_thps1');
  a.addu(R.t2, R.t2, R.t3);       // t2 = exact THPS1.WAD base LBA!
  a.la(R.t1, THPS1_ADDR.g_Thps1BaseLba);
  a.sw(R.t2, 0, R.t1);            // publish for diagnostics

  a.la(R.t0, THPS1_ADDR.Thps1Hed);
  a.label('cw_loop');
  a.lw(R.t1, 0, R.t0);            // entry.hash
  a.nop();
  a.beq(R.t1, R.zero, 'cw_not_in_thps1');
  a.nop();
  a.beq(R.t1, R.a1, 'cw_hit');
  a.nop();
  a.j('cw_loop');
  a.addiu(R.t0, R.t0, 12);

  a.label('cw_hit');
  // effectiveOffset = ((thps1BaseLba - lw 24440($gp)) << 11) + entry.relOffset
  a.lw(R.t1, 24440, R.gp);        // CD.WAD start LBA
  a.lw(R.t4, 4, R.t0);            // entry.relOffset
  a.subu(R.t2, R.t2, R.t1);       // delta sectors
  a.sll(R.t2, R.t2, 11);          // delta bytes
  a.addu(R.t2, R.t2, R.t4);       // effectiveOffset
  a.lw(R.t5, 8, R.t0);            // entry.size
  a.la(R.s1, THPS1_ADDR.g_Thps1ScratchOff);
  a.sw(R.t2, 0, R.s1);
  a.sw(R.t5, 4, R.s1);
  a.jal(THPS1_ADDR.Entry_BurstFree); // auto-evict any active CD.WAD burst cache before THPS1.WAD read!
  a.nop();
  a.j(0x800541F4);
  a.nop();

  a.label('cw_not_in_thps1');
  a.bne(R.s1, R.zero, 'cw_found_orig');
  a.nop();
  a.j(0x80054198);                // original missing-file error handler
  a.nop();

  a.label('cw_found_orig');
  // Contiguous CD-ROM Burst Streaming Cache: serves hot clusters in 0.00f from RAM via native PreMgr memcpy!
  a.jal(THPS1_ADDR.Entry_BurstCdOpen);
  a.nop();
  a.bne(R.v0, R.zero, 'cw_burst_hit');
  a.nop();
  a.j(0x800541F4);
  a.nop();
  a.label('cw_burst_hit');
  a.j(0x80054244);                // CDWAD_Open epilogue (v0 = fileSize, g_IsPreFile=1!)
  a.nop();

  // --------------------------------------------------------------------------
  // 2. Hook_CareerCountMedals(SCareerSkater* $a0) [replaces 0x80025848]
  //    Counts medals across ALL 6 competition levels: THPS2 (2,5,7) + THPS1 (14,17,19)
  // --------------------------------------------------------------------------
  a.label('Hook_CareerCountMedals');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.sw(R.s0, 16, R.sp);
  a.sw(R.s1, 12, R.sp);
  a.sw(R.s2, 8, R.sp);
  a.move(R.s0, R.a0);             // s0 = skaterProg
  a.move(R.s1, R.zero);           // s1 = medalCount
  a.move(R.s2, R.zero);           // s2 = idx 0..19

  a.label('ccm_loop');
  // Check g_ExtLevelTable[s2].isComp (+0x0C)
  a.sll(R.v1, R.s2, 1);
  a.addu(R.v1, R.v1, R.s2);
  a.sll(R.v0, R.v1, 5);
  a.subu(R.v0, R.v0, R.v1);
  a.sll(R.v0, R.v0, 2);
  a.la(R.t0, THPS1_ADDR.ExtLevelTable);
  a.addu(R.t0, R.t0, R.v0);
  a.lw(R.v0, 12, R.t0);
  a.nop();
  a.beq(R.v0, R.zero, 'ccm_next');
  a.nop();
  a.move(R.a0, R.s0);
  a.jal('Helper_GetLevelFlags');
  a.move(R.a1, R.s2);
  a.andi(R.v0, R.v0, 0x1C00);     // Gold | Silver | Bronze
  a.beq(R.v0, R.zero, 'ccm_next');
  a.nop();
  a.addiu(R.s1, R.s1, 1);

  a.label('ccm_next');
  a.addiu(R.s2, R.s2, 1);
  a.slti(R.v0, R.s2, 20);
  a.bne(R.v0, R.zero, 'ccm_loop');
  a.nop();

  a.move(R.v0, R.s1);
  a.lw(R.s2, 8, R.sp);
  a.lw(R.s1, 12, R.sp);
  a.lw(R.s0, 16, R.sp);
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // 3. Hook_CareerLevelIsOpenInner(int levelId $a0, SCareerSkater* $a1) [replaces 0x800258A0]
  //    Walks DisplayOrder[0..slot(levelId)] checking cash (+0x44) & medals (+0x48)!
  //    Only Hangar (slot 0) starts unlocked; every subsequent interleaved level unlocks in order!
  // --------------------------------------------------------------------------
  a.label('Hook_CareerLevelIsOpenInner');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 28, R.sp);
  a.sw(R.s0, 24, R.sp);
  a.sw(R.s1, 20, R.sp);
  a.sw(R.s2, 16, R.sp);
  a.sw(R.s3, 12, R.sp);

  // Check g_AllLevelsCheat @ 0x800D6344 (0x800D0000 + 25412)
  a.lui(R.v0, 0x800D);
  a.lw(R.v0, 25412, R.v0);
  a.nop();
  a.bne(R.v0, R.zero, 'clio_open');
  a.nop();

  a.bltz(R.a0, 'clio_open');
  a.slti(R.v0, R.a0, 20);
  a.beq(R.v0, R.zero, 'clio_closed');
  a.nop();
  // Custom park (id=10) is always open when queried here
  a.addiu(R.v0, R.zero, 10);
  a.beq(R.a0, R.v0, 'clio_open');
  a.nop();

  a.move(R.s0, R.a1);             // s0 = skaterProg
  // targetSlot = SlotOfLevel[levelId]
  a.la(R.t0, THPS1_ADDR.SlotOfLevel);
  a.addu(R.t0, R.t0, R.a0);
  a.lbu(R.s1, 0, R.t0);           // s1 = targetSlot (0..18)
  a.move(R.s2, R.zero);           // s2 = curSlot (0..targetSlot)

  a.label('clio_loop');
  a.sll(R.t0, R.s2, 2);
  a.la(R.t1, THPS1_ADDR.DisplayOrderWords);
  a.addu(R.t1, R.t1, R.t0);
  a.lw(R.s3, 0, R.t1);            // s3 = curLevelId = DisplayOrder[curSlot]
  a.nop();

  // entry = &g_ExtLevelTable[s3]
  a.sll(R.v1, R.s3, 1);
  a.addu(R.v1, R.v1, R.s3);
  a.sll(R.v0, R.v1, 5);
  a.subu(R.v0, R.v0, R.v1);
  a.sll(R.v0, R.v0, 2);
  a.la(R.t0, THPS1_ADDR.ExtLevelTable);
  a.addu(R.t0, R.t0, R.v0);

  a.lw(R.t1, 0x48, R.t0);         // medalsRequired
  a.lw(R.t2, 0x44, R.t0);         // cashRequired
  a.bne(R.t1, R.zero, 'clio_chk_medals');
  a.nop();

  // Check totalCashEarned (skaterProg+4) >= cashRequired
  a.lw(R.v0, 4, R.s0);
  a.nop();
  a.slt(R.v0, R.v0, R.t2);
  a.bne(R.v0, R.zero, 'clio_closed');
  a.nop();
  a.j('clio_next');
  a.nop();

  a.label('clio_chk_medals');
  a.sw(R.t1, 8, R.sp);            // save medalsRequired across jal
  a.jal('Hook_CareerCountMedals');
  a.move(R.a0, R.s0);
  a.lw(R.t1, 8, R.sp);
  a.nop();
  a.slt(R.v0, R.v0, R.t1);
  a.bne(R.v0, R.zero, 'clio_closed');
  a.nop();

  a.label('clio_next');
  a.addiu(R.s2, R.s2, 1);
  a.slt(R.v0, R.s1, R.s2);        // stop once curSlot > targetSlot
  a.beq(R.v0, R.zero, 'clio_loop');
  a.nop();

  a.label('clio_open');
  a.addiu(R.v0, R.zero, 1);
  a.j('clio_ret');
  a.nop();

  a.label('clio_closed');
  a.move(R.v0, R.zero);

  a.label('clio_ret');
  a.lw(R.s3, 12, R.sp);
  a.lw(R.s2, 16, R.sp);
  a.lw(R.s1, 20, R.sp);
  a.lw(R.s0, 24, R.sp);
  a.lw(R.ra, 28, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 32);

  // --------------------------------------------------------------------------
  // 4. Hook_CareerLevelIsOpenMode(int levelId $a0, int mode $a1) [replaces 0x8002597C]
  //    Mode 1 (Career): check CURRENT skater via Hook_CareerLevelIsOpenInner
  //    Mode 2..4 (Single/Free/2P): open if ANY skater unlocked it (same as vanilla THPS2!)
  // --------------------------------------------------------------------------
  a.label('Hook_CareerLevelIsOpenMode');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 28, R.sp);
  a.sw(R.s0, 24, R.sp);
  a.sw(R.s1, 20, R.sp);
  a.sw(R.s2, 16, R.sp);
  a.move(R.s1, R.a0);             // s1 = levelId
  a.move(R.s2, R.a1);             // s2 = mode

  // Cheat all-levels-open check @ 0x800D6344
  a.lui(R.v0, 0x800D);
  a.lw(R.v0, 25412, R.v0);
  a.nop();
  a.bne(R.v0, R.zero, 'cliom_yes');
  a.nop();

  // If mode == 1 (Career): check current skater
  a.addiu(R.v0, R.zero, 1);
  a.bne(R.s2, R.v0, 'cliom_other_modes');
  a.nop();
  a.la(R.a0, SYM.g_Career);
  a.jal(SYM.GetSelectedSkaterIdx);
  a.nop();
  a.jal(SYM.Career_GetSkaterProg);
  a.move(R.a0, R.v0);
  a.move(R.a0, R.s1);
  a.jal('Hook_CareerLevelIsOpenInner');
  a.move(R.a1, R.v0);
  a.j('cliom_ret');
  a.nop();

  // Non-Career modes (Free Skate / Single Session / 2P): open if ANY skater (0..20) has unlocked it!
  a.label('cliom_other_modes');
  a.move(R.s0, R.zero);
  a.label('cliom_any_loop');
  a.jal(SYM.Career_GetSkaterProg);
  a.move(R.a0, R.s0);
  a.move(R.a0, R.s1);
  a.jal('Hook_CareerLevelIsOpenInner');
  a.move(R.a1, R.v0);
  a.bne(R.v0, R.zero, 'cliom_yes');
  a.addiu(R.s0, R.s0, 1);
  a.slti(R.v0, R.s0, 21);
  a.bne(R.v0, R.zero, 'cliom_any_loop');
  a.nop();
  a.move(R.v0, R.zero);
  a.j('cliom_ret');
  a.nop();

  a.label('cliom_yes');
  a.addiu(R.v0, R.zero, 1);

  a.label('cliom_ret');
  a.lw(R.s2, 16, R.sp);
  a.lw(R.s1, 20, R.sp);
  a.lw(R.s0, 24, R.sp);
  a.lw(R.ra, 28, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 32);

  // --------------------------------------------------------------------------
  // 5. Hook_CareerHasGoal(int goalIdx $a0) [replaces 0x800240D4]
  // --------------------------------------------------------------------------
  a.label('Hook_CareerHasGoal');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.sw(R.s0, 16, R.sp);
  a.move(R.s0, R.a0);
  a.la(R.a0, SYM.g_Career);
  a.jal(SYM.GetSelectedSkaterIdx);
  a.nop();
  a.jal(SYM.Career_GetSkaterProg);
  a.move(R.a0, R.v0);
  a.lui(R.a1, 0x800D);
  a.lw(R.a1, 25200, R.a1);        // g_CurrentLevel
  a.move(R.a0, R.v0);
  a.jal('Helper_GetLevelFlags');
  a.nop();
  a.srav(R.v0, R.v0, R.s0);
  a.andi(R.v0, R.v0, 1);
  a.lw(R.s0, 16, R.sp);
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // 6. Hook_CareerCountLvlGoals(SCareerSkater* $a0, int levelId $a1) [replaces 0x8002413C]
  //    ALL regular career levels (both THPS2 0..9 AND THPS1 11..19) now have FULL 10 goals (bits 0..9)!
  // --------------------------------------------------------------------------
  a.label('Hook_CareerCountLvlGoals');
  a.addiu(R.sp, R.sp, -16);
  a.sw(R.ra, 12, R.sp);
  a.jal('Helper_GetLevelFlags');
  a.nop();
  a.move(R.a2, R.zero);           // count
  a.move(R.v1, R.zero);           // bit 0..9
  a.addiu(R.t1, R.zero, 10);

  a.label('cclg_loop');
  a.srav(R.t0, R.v0, R.v1);
  a.andi(R.t0, R.t0, 1);
  a.addu(R.a2, R.a2, R.t0);
  a.addiu(R.v1, R.v1, 1);
  a.slt(R.t0, R.v1, R.t1);
  a.bne(R.t0, R.zero, 'cclg_loop');
  a.nop();

  a.move(R.v0, R.a2);
  a.lw(R.ra, 12, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 16);

  // --------------------------------------------------------------------------
  // 7. Hook_CareerCountCash() [replaces 0x800241BC]
  // --------------------------------------------------------------------------
  a.label('Hook_CareerCountCash');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 16, R.sp);
  a.la(R.a0, SYM.g_Career);
  a.jal(SYM.GetSelectedSkaterIdx);
  a.nop();
  a.jal(SYM.Career_GetSkaterProg);
  a.move(R.a0, R.v0);
  a.lui(R.a1, 0x800D);
  a.lw(R.a1, 25200, R.a1);
  a.move(R.a0, R.v0);
  a.jal('Helper_GetCashBitsPtr');
  a.nop();
  // Count set bits across 2 uint32 words at 0(v0) and 4(v0)
  a.move(R.v1, R.v0);
  a.move(R.a2, R.zero);
  a.move(R.a3, R.zero);
  a.label('ccc_w');
  a.lw(R.a1, 0, R.v1);
  a.move(R.a0, R.zero);
  a.label('ccc_b');
  a.srav(R.v0, R.a1, R.a0);
  a.andi(R.v0, R.v0, 1);
  a.addu(R.a2, R.a2, R.v0);
  a.addiu(R.a0, R.a0, 1);
  a.slti(R.v0, R.a0, 32);
  a.bne(R.v0, R.zero, 'ccc_b');
  a.nop();
  a.addiu(R.a3, R.a3, 1);
  a.slti(R.v0, R.a3, 2);
  a.bne(R.v0, R.zero, 'ccc_w');
  a.addiu(R.v1, R.v1, 4);
  a.move(R.v0, R.a2);
  a.lw(R.ra, 16, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // 8. Hook_CareerHasCashNode [hooked @ 0x80024EE0 inside Career_HasCashNode]
  //    On entry: $v0 = skaterProg, $s0 = bitIndex (0..63), returns to 0x80024F04 with $v1 = word, $v0 = bitIndex & 31!
  // --------------------------------------------------------------------------
  a.label('Hook_CareerHasCashNode');
  a.addiu(R.sp, R.sp, -16);
  a.sw(R.ra, 12, R.sp);
  a.lui(R.a1, 0x800D);
  a.lw(R.a1, 25200, R.a1);
  a.move(R.a0, R.v0);
  a.jal('Helper_GetCashBitsPtr');
  a.nop();
  a.sra(R.a1, R.s0, 5);
  a.sll(R.a1, R.a1, 2);
  a.addu(R.v0, R.v0, R.a1);
  a.lw(R.v1, 0, R.v0);
  a.andi(R.v0, R.s0, 0x1F);
  a.lw(R.ra, 12, R.sp);
  a.addiu(R.sp, R.sp, 16);
  a.j(0x80024F04);
  a.nop();

  // --------------------------------------------------------------------------
  // 9. Hook_CareerCollectCashBit [hooked @ 0x80024F5C inside Career_CollectCash]
  //    On entry: $s0 = skaterProg, $v0 = bitIndex (0..63), $s1 = amount ($50/$100/$250)
  //    Sets the cash bit in skaterProg+60 (<10) or g_ExtCareer (>=11), then jumps to 0x80024F94
  //    where THPS2 natively adds $s1 to BOTH totalCashEarned (+4) AND currentCashSpendable (+8) for Stats!
  // --------------------------------------------------------------------------
  a.label('Hook_CareerCollectCashBit');
  a.addiu(R.sp, R.sp, -16);
  a.sw(R.ra, 12, R.sp);
  a.sw(R.v0, 8, R.sp);            // save bitIndex
  a.lui(R.a1, 0x800D);
  a.lw(R.a1, 25200, R.a1);
  a.move(R.a0, R.s0);
  a.jal('Helper_GetCashBitsPtr');
  a.nop();
  a.lw(R.t0, 8, R.sp);            // t0 = bitIndex
  a.nop();
  a.sra(R.a0, R.t0, 5);
  a.sll(R.a0, R.a0, 2);
  a.addu(R.a1, R.v0, R.a0);       // a1 = &word
  a.andi(R.v0, R.t0, 0x1F);
  a.addiu(R.v1, R.zero, 1);
  a.sllv(R.v1, R.v1, R.v0);
  a.lw(R.a0, 0, R.a1);
  a.nop();
  a.or(R.a0, R.a0, R.v1);
  a.sw(R.a0, 0, R.a1);
  a.lw(R.ra, 12, R.sp);
  a.addiu(R.sp, R.sp, 16);
  a.j(0x80024F94);                // continues natively: totalCash += amount; spendableCash += amount!
  a.nop();

  // --------------------------------------------------------------------------
  // 10. Hook_CareerGiveGoalBit [hooked @ 0x800243A4 inside Career_GiveGoal]
  //     On entry: $s2 = skaterProg, $s0 = g_CurrentLevel, $s3 = goalIdx, $s1 = g_ExtLevelTable
  //     Sets goal bit in 1096($gp) AND in levelFlags[g_CurrentLevel] (<10 or >=11),
  //     then jumps to 0x8002442C (skipping the 0..9 total-goals loop or recounting cleanly!).
  // --------------------------------------------------------------------------
  a.label('Hook_CareerGiveGoalBit');
  a.addiu(R.sp, R.sp, -16);
  a.sw(R.ra, 12, R.sp);
  a.move(R.a0, R.s2);             // skaterProg
  a.jal('Helper_GetLevelFlagsPtr');
  a.move(R.a1, R.s0);             // levelId
  a.addiu(R.a0, R.zero, 1);
  a.sllv(R.a0, R.a0, R.s3);       // mask = 1 << goalIdx
  a.lw(R.t0, 1096, R.gp);
  a.lhu(R.t1, 0, R.v0);
  a.or(R.t0, R.t0, R.a0);
  a.or(R.t1, R.t1, R.a0);
  a.sw(R.t0, 1096, R.gp);
  a.sh(R.t1, 0, R.v0);

  // Recount total goals across THPS2 levels 0..9 (matching vanilla a3 -> sb a3, 0(s2))
  a.move(R.a3, R.zero);
  a.move(R.t0, R.zero);
  a.addiu(R.a2, R.s2, 12);
  a.addiu(R.s1, R.s1, 12);
  a.lw(R.ra, 12, R.sp);
  a.addiu(R.sp, R.sp, 16);
  a.j(0x800243D8);
  a.nop();

  // --------------------------------------------------------------------------
  // 11. Hook_CareerSetMedal(int levelId $a0, int medalBit $a1) [replaces 0x8002465C]
  // --------------------------------------------------------------------------
  a.label('Hook_CareerSetMedal');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 28, R.sp);
  a.sw(R.s0, 24, R.sp);
  a.sw(R.s1, 20, R.sp);
  a.sw(R.s2, 16, R.sp);
  a.move(R.s0, R.a0);             // levelId
  a.move(R.s1, R.a1);             // bit (10=Gold, 11=Silver, 12=Bronze)
  a.la(R.a0, SYM.g_Career);
  a.jal(SYM.GetSelectedSkaterIdx);
  a.nop();
  a.jal(SYM.Career_GetSkaterProg);
  a.move(R.a0, R.v0);
  a.move(R.s2, R.v0);             // s2 = skaterProg
  a.move(R.a0, R.s2);
  a.jal('Helper_GetLevelFlagsPtr');
  a.move(R.a1, R.s0);
  a.addiu(R.t0, R.zero, 1);
  a.sllv(R.t0, R.t0, R.s1);
  a.lhu(R.t1, 0, R.v0);
  a.nop();
  a.or(R.t1, R.t1, R.t0);
  a.sh(R.t1, 0, R.v0);

  // Recount gold medals (bit 0x400) across all 20 levels via Hook_CareerCountGolds -> sb v0, 3(s2)
  a.jal('Hook_CareerCountGolds');
  a.move(R.a0, R.s2);
  a.sb(R.v0, 3, R.s2);
  a.lw(R.s2, 16, R.sp);
  a.lw(R.s1, 20, R.sp);
  a.lw(R.s0, 24, R.sp);
  a.lw(R.ra, 28, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 32);

  // --------------------------------------------------------------------------
  // 12. Hook_CareerSetAllGoals [hooked @ 0x800245B8]
  //     On entry: $v0 = skaterProg, sets bit 0x8000 on levelFlags[g_CurrentLevel], jumps to 0x8002460C!
  // --------------------------------------------------------------------------
  a.label('Hook_CareerSetAllGoals');
  a.lui(R.a1, 0x800D);
  a.lw(R.a1, 25200, R.a1);
  a.move(R.a0, R.v0);
  a.jal('Helper_GetLevelFlagsPtr');
  a.nop();
  a.lhu(R.v1, 0, R.v0);
  a.nop();
  a.ori(R.v1, R.v1, 0x8000);
  a.sh(R.v1, 0, R.v0);
  a.j(0x8002460C);
  a.nop();

  // --------------------------------------------------------------------------
  // 13. Hook_CompLoadBmp [j @ 0x80022E2C inside GoalList_Open]
  //     Fixes black pre-level Competition screen on THPS1 Competitions (Chicago=14, Burnside=17, Roswell=19)!
  //     On entry: $a1 = levelId, $a0 = 13.
  //     Loads t1comp0.bmp (Chicago), t1comp1.bmp (Burnside), or t1comp2.bmp (Roswell) via 0x80022E50;
  //     falls back bit-exact to 0x80022F98 with $a1 = 210 for any other level!
  // --------------------------------------------------------------------------
  a.label('Hook_CompLoadBmp');
  a.addiu(R.v0, R.zero, 14);       // Skate Park Chicago
  a.beq(R.a1, R.v0, 'clb_chi');
  a.addiu(R.v0, R.zero, 17);       // Burnside Portland
  a.beq(R.a1, R.v0, 'clb_bur');
  a.addiu(R.v0, R.zero, 19);       // Roswell New Mexico
  a.beq(R.a1, R.v0, 'clb_ros');
  a.nop();
  a.j(0x80022F98);
  a.addiu(R.a1, R.zero, 210);      // original delay slot @ 0x80022E30!
  a.label('clb_chi');
  a.la(R.a0, strT1Comp0);
  a.j('clb_go');
  a.nop();
  a.label('clb_bur');
  a.la(R.a0, strT1Comp1);
  a.j('clb_go');
  a.nop();
  a.label('clb_ros');
  a.la(R.a0, strT1Comp2);
  a.label('clb_go');
  a.j(0x80022E50);
  a.nop();

  // --------------------------------------------------------------------------
  // 14. Hook_ShowGoalsBtn [jal @ 0x8002D904 in Pause Menu]
  //     Original: `slti v0, v0, 8`. Returns v0 = 1 if level < 8 || level >= 11!
  // --------------------------------------------------------------------------
  a.label('Hook_ShowGoalsBtn');
  a.slti(R.t0, R.v0, 8);
  a.bne(R.t0, R.zero, 'sgb_yes');
  a.slti(R.t1, R.v0, 11);
  a.beq(R.t1, R.zero, 'sgb_yes');
  a.nop();
  a.jr(R.ra);
  a.move(R.v0, R.zero);
  a.label('sgb_yes');
  a.jr(R.ra);
  a.addiu(R.v0, R.zero, 1);

  // --------------------------------------------------------------------------
  // 15. Hook_LevelSelMoveCursor [jal @ levelsel.bin +0x12A8]
  //     On entry: $s2 = delta (+1 or -1), $s3 = 10
  //     Advances g_SelectedLevel (0x800D8278) along DisplayOrderWords[0..19]!
  //     In Career Mode (0x800D839C == 1), wraps 0..18 (19 career/bonus levels: Hangar..Skate Heaven).
  //     In Free Skate / Single Session / 2P, wraps 0..19 (includes Custom Park id=10!).
  //     Returns to levelsel.bin +0x1320 (cleanly skipping old 0..10 wrap & 8/9 skip!).
  // --------------------------------------------------------------------------
  a.label('Hook_LevelSelMoveCursor');
  a.lui(R.t0, 0x800E);
  a.lw(R.t1, -32136, R.t0);       // t1 = current g_SelectedLevel (0..19)
  a.lw(R.t2, -31844, R.t0);       // t2 = gameMode (1=Career)
  a.sltiu(R.t3, R.t1, 20);
  a.bne(R.t3, R.zero, 'lsmc_id_ok');
  a.nop();
  a.move(R.t1, R.zero);
  a.label('lsmc_id_ok');
  // curSlot = SlotOfLevel[curLevel]
  a.la(R.t3, THPS1_ADDR.SlotOfLevel);
  a.addu(R.t3, R.t3, R.t1);
  a.lbu(R.t4, 0, R.t3);           // t4 = curSlot (0..19)
  // maxSlots = (gameMode == 1) ? 19 : 20
  a.addiu(R.t5, R.zero, 1);
  a.beq(R.t2, R.t5, 'lsmc_19');
  a.addiu(R.t5, R.zero, 20);
  a.j('lsmc_step');
  a.nop();
  a.label('lsmc_19');
  a.addiu(R.t5, R.zero, 19);

  a.label('lsmc_step');
  a.addu(R.t4, R.t4, R.s2);       // curSlot += delta
  a.bgez(R.t4, 'lsmc_hi');
  a.nop();
  a.addiu(R.t4, R.t5, -1);        // wrap to last slot
  a.label('lsmc_hi');
  a.slt(R.t3, R.t4, R.t5);
  a.bne(R.t3, R.zero, 'lsmc_store');
  a.nop();
  a.move(R.t4, R.zero);           // wrap to 0

  a.label('lsmc_store');
  a.sll(R.t4, R.t4, 2);
  a.la(R.t3, THPS1_ADDR.DisplayOrderWords);
  a.addu(R.t3, R.t3, R.t4);
  a.lw(R.v0, 0, R.t3);            // newLevelId = DisplayOrderWords[curSlot]
  a.nop();
  a.sw(R.v0, -32136, R.t0);       // store new g_SelectedLevel!
  // Set s0 = 0 (not hidden bonus) so levelsel +0x1320 shows Career Goal panel cleanly!
  a.jr(R.ra);
  a.move(R.s0, R.zero);

  // --------------------------------------------------------------------------
  // 16. Hook_LevelSelPct(SCareerSkater* $a0, int levelId $a1, int isComp $a2) -> $v0 = pct (0..100)
  //     Called from levelsel.bin +0x13F8!
  // --------------------------------------------------------------------------
  a.label('Hook_LevelSelPct');
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.sw(R.s0, 16, R.sp);
  a.sw(R.s1, 12, R.sp);
  a.move(R.s0, R.a0);             // skaterProg
  a.move(R.s1, R.a1);             // levelId
  a.beq(R.a2, R.zero, 'lsp_normal');
  a.nop();

  // Competition level: Gold=90, Silver=60, Bronze=30, +10 if 0x8000 (All Cash)
  a.jal('Helper_GetLevelFlags');
  a.nop();
  a.move(R.t0, R.zero);
  a.andi(R.t1, R.v0, 0x0400);
  a.bne(R.t1, R.zero, 'lsp_g');
  a.andi(R.t1, R.v0, 0x0800);
  a.bne(R.t1, R.zero, 'lsp_s');
  a.andi(R.t1, R.v0, 0x1000);
  a.bne(R.t1, R.zero, 'lsp_b');
  a.nop();
  a.j('lsp_cash10');
  a.nop();
  a.label('lsp_g'); a.addiu(R.t0, R.zero, 90); a.j('lsp_cash10'); a.nop();
  a.label('lsp_s'); a.addiu(R.t0, R.zero, 60); a.j('lsp_cash10'); a.nop();
  a.label('lsp_b'); a.addiu(R.t0, R.zero, 30);
  a.label('lsp_cash10');
  a.andi(R.t1, R.v0, 0x8000);
  a.beq(R.t1, R.zero, 'lsp_done_comp');
  a.nop();
  a.addiu(R.t0, R.t0, 10);
  a.label('lsp_done_comp');
  a.j('lsp_ret');
  a.move(R.v0, R.t0);

  a.label('lsp_normal');
  a.jal('Hook_CareerCountLvlGoals');
  a.nop();
  // ALL regular career levels (THPS2 + THPS1): 10 goals * 10% = 100%!
  a.sll(R.t1, R.v0, 2);
  a.addu(R.t1, R.t1, R.v0);
  a.sll(R.v0, R.t1, 1);

  a.label('lsp_ret');
  a.lw(R.s1, 12, R.sp);
  a.lw(R.s0, 16, R.sp);
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);

  // --------------------------------------------------------------------------
  // 17. Hook_LevelSelShowPct [jal @ levelsel.bin +0x121C, nop @ +0x1220]
  //     Original: `slti v0, v0, 8; xori v0, v0, 1; sw v0, 16(v1)` where 16(v1) = isHidden (0=SHOW %, 1=HIDE %)!
  //     Show % (return 0) for ALL 19 career/bonus levels (0..9 and 11..19), hide (return 1) ONLY for Custom Park (10)!
  // --------------------------------------------------------------------------
  a.label('Hook_LevelSelShowPct');
  a.addiu(R.t0, R.zero, 10);
  a.beq(R.v0, R.t0, 'lssp_hide');
  a.nop();
  a.jr(R.ra);
  a.move(R.v0, R.zero);            // 0 = SHOW %
  a.label('lssp_hide');
  a.jr(R.ra);
  a.addiu(R.v0, R.zero, 1);        // 1 = HIDE %

  // --------------------------------------------------------------------------
  // 18. SecretFlagSet / SecretFlagGet (SCareerSkater+32 + levelId for op 0xCB / 0xCC)
  //     Helper_GetSecretFlagPtr($a0 = skaterProg, $a1 = levelId) -> $v0 = uint8*
  // --------------------------------------------------------------------------
  a.label('Hook_SecretFlagSet');
  a.slti(R.t8, R.a1, 11);
  a.beq(R.t8, R.zero, 'sfs_ext');
  a.nop();
  a.addu(R.v0, R.a0, R.a1);
  a.jr(R.ra);
  a.addiu(R.v0, R.v0, 32);
  a.label('sfs_ext');
  a.addiu(R.sp, R.sp, -8);
  a.sw(R.ra, 0, R.sp);
  a.jal('Helper_ExtCareerPtr');
  a.nop();
  a.addiu(R.t8, R.a1, -11);
  a.addu(R.v0, R.v0, R.t8);
  a.addiu(R.v0, R.v0, 18);        // secretFlags @ ExtCareer + 18
  a.lw(R.ra, 0, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 8);

  a.label('Hook_SecretFlagGet');
  a.j('Hook_SecretFlagSet');
  a.nop();

  // --------------------------------------------------------------------------
  // 19. Hook_TrigHasGoal(SCareerSkater* $a0 = v0, int levelId $a1 = v1) -> $v0 = uint16 levelFlags
  // --------------------------------------------------------------------------
  a.label('Hook_TrigHasGoal');
  a.j('Helper_GetLevelFlags');
  a.nop();

  // --------------------------------------------------------------------------
  // 20. Hook_CompInitPodium [jal @ 0x8007E58C]
  //     On entry: $v0 = skaterProg, $a1 = g_CurrentLevel (unshifted!), returns $v1 = uint16 levelFlags
  // --------------------------------------------------------------------------
  a.label('Hook_CompInitPodium');
  a.addiu(R.sp, R.sp, -8);
  a.sw(R.ra, 0, R.sp);
  a.jal('Helper_GetLevelFlags');
  a.move(R.a0, R.v0);
  a.move(R.v1, R.v0);
  a.lw(R.ra, 0, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 8);

  // --------------------------------------------------------------------------
  // 21. Hook_CompPrizeAB [jal @ 0x8007D628 and 0x8007D674]
  //     Preserves $t0, $a0, $a1, $a2, $s0, $s1; returns $v0 = levelFlags(t0, a2)
  // --------------------------------------------------------------------------
  a.label('Hook_CompPrizeAB');
  a.addiu(R.sp, R.sp, -16);
  a.sw(R.ra, 12, R.sp);
  a.sw(R.a0, 8, R.sp);
  a.sw(R.a1, 4, R.sp);
  a.move(R.a0, R.t0);
  a.jal('Helper_GetLevelFlags');
  a.move(R.a1, R.a2);
  a.lw(R.a1, 4, R.sp);
  a.lw(R.a0, 8, R.sp);
  a.lw(R.ra, 12, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 16);

  // --------------------------------------------------------------------------
  // 22. Hook_CompPrizeC [jal @ 0x8007D6D4]
  //     Preserves $t0, $a1, $a2, $a3, $s0, $s1; returns $a0 = levelFlags(t0, a3)
  // --------------------------------------------------------------------------
  a.label('Hook_CompPrizeC');
  a.addiu(R.sp, R.sp, -16);
  a.sw(R.ra, 12, R.sp);
  a.sw(R.a1, 4, R.sp);
  a.move(R.a0, R.t0);
  a.jal('Helper_GetLevelFlags');
  a.move(R.a1, R.a3);
  a.move(R.a0, R.v0);
  a.lw(R.a1, 4, R.sp);
  a.lw(R.ra, 12, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 16);

  // --------------------------------------------------------------------------
  // 23. Hook_CareerCountGolds($a0 = skaterProg) -> $v0 = count of Gold medals (0x400) across levels 0..19
  // --------------------------------------------------------------------------
  a.label('Hook_CareerCountGolds');
  a.addiu(R.sp, R.sp, -32);
  a.sw(R.ra, 28, R.sp);
  a.sw(R.s0, 24, R.sp);
  a.sw(R.s1, 20, R.sp);
  a.sw(R.s2, 16, R.sp);
  a.sw(R.s3, 12, R.sp);
  a.move(R.s0, R.a0);              // skaterProg
  a.move(R.s1, R.zero);            // levelId = 0..19
  a.move(R.s2, R.zero);            // count = 0
  a.la(R.s3, THPS1_ADDR.ExtLevelTable + 12); // &entry[0].isComp
  a.label('ccg_loop');
  a.lw(R.t0, 0, R.s3);
  a.nop();
  a.beq(R.t0, R.zero, 'ccg_next');
  a.nop();
  a.move(R.a0, R.s0);
  a.jal('Helper_GetLevelFlags');
  a.move(R.a1, R.s1);
  a.andi(R.t0, R.v0, 0x0400);      // Gold medal bit only
  a.beq(R.t0, R.zero, 'ccg_next');
  a.nop();
  a.addiu(R.s2, R.s2, 1);
  a.label('ccg_next');
  a.addiu(R.s3, R.s3, 0x174);
  a.addiu(R.s1, R.s1, 1);
  a.slti(R.t0, R.s1, 20);
  a.bne(R.t0, R.zero, 'ccg_loop');
  a.nop();
  a.move(R.v0, R.s2);
  a.lw(R.s3, 12, R.sp);
  a.lw(R.s2, 16, R.sp);
  a.lw(R.s1, 20, R.sp);
  a.lw(R.s0, 24, R.sp);
  a.lw(R.ra, 28, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 32);

  // --------------------------------------------------------------------------
  // 24. Hook_CareerResetExt [jal @ 0x80023988 inside Career_InitAll]
  //     Zeroes g_ExtCareer[2000 B], then tail-jumps to Hook_CrashCareerReset (0x800B89F0 -> 0x8002C4D8)!
  // --------------------------------------------------------------------------
  a.label('Hook_CareerResetExt');
  a.la(R.t8, THPS1_ADDR.ExtCareer);
  a.addiu(R.t9, R.t8, 2000);
  a.label('cre_loop');
  a.sw(R.zero, 0, R.t8);
  a.addiu(R.t8, R.t8, 4);
  a.bne(R.t8, R.t9, 'cre_loop');
  a.nop();
  a.j(0x800B89B0);                 // Hook_CrashCareerReset -> resets Crash B. Slot 20 & tail-jumps to 0x8002C4D8!
  a.nop();

  // --------------------------------------------------------------------------
  // 25. High Score Table Safe Offset Helpers (levels 0..10 -> 0x800BB95C, levels 11..19 -> 0x800E8550)
  //     Leaf stubs clobbering ONLY $t8, $t9 + target register, with delay-slot instructions absorbed cleanly!
  //     Delta = 0x800E8550 - 0x800BB95C = 0x0002CBF4 (works identically across +4564 and +4568 base adds!)
  // --------------------------------------------------------------------------
  const HS_DELTA = (THPS1_ADDR.ExtSkyTable - 0x800BB95C) >>> 0;
  function emitHiScoreStub(lbl, dstReg, srcReg, epilogueFn = null) {
    a.label(lbl);
    a.sltiu(R.t8, srcReg, 11);
    a.bne(R.t8, R.zero, lbl + '_orig');
    a.sll(dstReg, srcReg, 6);
    a.addiu(R.t8, srcReg, -11);
    a.sll(R.t8, R.t8, 6);
    a.li(R.t9, HS_DELTA);
    a.addu(dstReg, R.t8, R.t9);
    a.label(lbl + '_orig');
    if (epilogueFn) {
      a.jr(R.ra);
      epilogueFn();
    } else {
      a.jr(R.ra);
      a.nop();
    }
  }
  emitHiScoreStub('Hook_HiScore_s7_s2', R.s7, R.s2);
  emitHiScoreStub('Hook_HiScore_v1_s2', R.v1, R.s2, () => a.addu(R.v0, R.v0, R.v1)); // absorbs 0x8002F09C
  emitHiScoreStub('Hook_HiScore_t3_v0', R.t3, R.v0, () => a.addu(R.v0, R.t6, R.t3)); // absorbs 0x8003003C
  emitHiScoreStub('Hook_HiScore_a0_s1', R.a0, R.s1);
  emitHiScoreStub('Hook_HiScore_v1_a0', R.v1, R.a0, () => a.lui(R.a0, 0x800C));      // absorbs 0x80033070

  // --------------------------------------------------------------------------
  // 26. Hook_Car215_SetModel [jal @ 0x80061A58] & Hook_Car216_SetModel [jal @ 0x80061A70]
  //     THPS1 Streets SF uses Baddy subtype 215 = c_van (THPS2 reused 215 for c_bus!)
  //     and Baddy subtype 216 = c_cable (renamed c_cabl1 in sksf_t.trg to preserve NY City subway!).
  //     For THPS2 levels (g_CurrentLevel < 11), leaves $a1 untouched ("c_bus" / "c_cable") -> 0 impact!
  //     For THPS1 levels (g_CurrentLevel >= 11), redirects 215 -> "c_van" and 216 -> "c_cabl1"!
  // --------------------------------------------------------------------------
  a.label('Hook_Car215_SetModel');
  a.lui(R.t8, 0x800D);
  a.lw(R.t8, 25200, R.t8);         // t8 = g_CurrentLevel (0x800D6270)
  a.nop();
  a.sltiu(R.t9, R.t8, 11);
  a.bne(R.t9, R.zero, 'car215_orig');
  a.nop();
  a.la(R.a1, strCVan);             // THPS1: subtype 215 -> "c_van" (c_van.psx in CD.WAD!)
  a.label('car215_orig');
  a.j(0x80049EA4);                 // tail-call CBody::SetModel(this, modelName)
  a.nop();

  a.label('Hook_Car216_SetModel');
  a.lui(R.t8, 0x800D);
  a.lw(R.t8, 25200, R.t8);         // t8 = g_CurrentLevel (0x800D6270)
  a.nop();
  a.sltiu(R.t9, R.t8, 11);
  a.bne(R.t9, R.zero, 'car216_orig');
  a.nop();
  a.la(R.a1, strCCab1);            // THPS1: subtype 216 -> "c_cabl1" (full 11-tex SF Cable Car in THPS1.WAD!)
  a.label('car216_orig');
  a.j(0x80049EA4);                 // tail-call CBody::SetModel(this, modelName)
  a.nop();

  // --------------------------------------------------------------------------
  // 27. Zero-Minute-71-Seek Strictly Ascending CD.WAD-ONLY Level Select Loader
  //     - Hook_LevelSelFastRend: saves CLevelRend->spritesBase and returns in 0 frames (ZERO seek, ZERO back-and-forth!).
  //     - Hook_LevelSelFastMap: frees g_BurstBuf (s2win4..s2arrow8), pauses XA ONCE, then streams ALL 40 LevelSel BMPs
  //       monotonically forward inside CD.WAD:
  //         Burst 0: CD.WAD[573] LBA 7955  (45s) -> t1rend00..08 -> CLevelRend!
  //         Burst 1: CD.WAD[578] LBA 8049  (54s) -> t1levl00..08 -> CLevelMap!
  //         Burst 2: CD.WAD      LBA 9931  (66s) -> s2levl00..10 -> CLevelMap! (1 single CdRead!)
  //         Burst 3: CD.WAD      LBA 10008 (55s) -> s2rend01..11 -> CLevelRend! (+11s forward!)
  //       then resumes XA ONCE! Eliminates the 64-frame Minute-71 seek AND all backward seeks!
  // --------------------------------------------------------------------------
  a.label('Hook_LevelSelFastRend');
  a.addiu(R.t0, R.s1, 300);        // spritesBase = &CLevelRend->sprites[0]
  a.la(R.t1, THPS1_ADDR.g_SavedRendSprites);
  a.sw(R.t0, 0, R.t1);             // remember for single-pass ascending upload during FastMap!
  a.jr(R.ra);
  a.nop();

  a.label('Hook_LevelSelFastMap');
  a.addiu(R.a0, R.s2, 624);        // spritesBase = &CLevelMap->sprites[0]
  a.lw(R.a1, 36, R.s2);            // modeOrNeg1 = CLevelMap->gameMode (>= 0)
  a.la(R.a2, THPS1_ADDR.FastBurstMapDesc);
  a.j('Helper_RunFastBurstGroup');
  a.addiu(R.a3, R.zero, 5);        // 5 strictly ascending CD.WAD bursts (t1rend + t1levl + s2levl x2 + s2rend)!

  // Helper_RunFastBurstGroup($a0=spritesBase, $a1=modeOrNeg1, $a2=descPtr, $a3=numDescs)
  // Stack frame (64 B): 0..15=argSave, 16..19=CdlLOC, 20=totalSec/rem, 24=activeMode, 28..60=s0..s7,ra
  a.label('Helper_RunFastBurstGroup');
  a.addiu(R.sp, R.sp, -64);
  a.sw(R.ra, 60, R.sp);
  a.sw(R.s7, 56, R.sp);
  a.sw(R.s6, 52, R.sp);
  a.sw(R.s5, 48, R.sp);
  a.sw(R.s4, 44, R.sp);
  a.sw(R.s3, 40, R.sp);
  a.sw(R.s2, 36, R.sp);
  a.sw(R.s1, 32, R.sp);
  a.sw(R.s0, 28, R.sp);
  a.move(R.s0, R.a0);              // s0 = spritesBase
  a.move(R.s1, R.a1);              // s1 = gameMode (>= 0)
  a.move(R.s2, R.a2);              // s2 = descPtr
  a.move(R.s3, R.a3);              // s3 = numDescs

  // Free LevelSel s2win4..s2arrow8 burst buffer BEFORE allocating 55-sector buffer (0 B leaked!)
  a.jal(THPS1_ADDR.Entry_BurstFree);
  a.nop();

  // Temp burst buffer: 55 * 2048 = 112,640 B top-down in Heap[1] (proven safe inside LevelSel!)
  a.li(R.a0, 112640);
  a.addiu(R.a1, R.zero, 1);
  a.addiu(R.a2, R.zero, 1);
  a.jal(0x8005515C);               // Mem_Alloc
  a.move(R.a3, R.zero);
  a.beq(R.v0, R.zero, 'fbg_epilogue');
  a.move(R.s4, R.v0);              // s4 = buf

  // Wait CDWAD idle & pause XA ONCE if active and not yet paused
  a.jal(0x800544C4);               // CDWAD_WaitIdle
  a.nop();
  a.la(R.t2, THPS1_ADDR.g_FastBurstXaSaved);
  a.sw(R.zero, 0, R.t2);
  a.lw(R.t0, 14704, R.gp);         // xaActive
  a.lw(R.t1, 14712, R.gp);         // xaPaused
  a.nop();
  a.beq(R.t0, R.zero, 'fbg_desc_loop');
  a.nop();
  a.bne(R.t1, R.zero, 'fbg_desc_loop');
  a.nop();
  a.addiu(R.t3, R.zero, 1);
  a.sw(R.t3, 0, R.t2);
  a.jal(0x80038D60);               // XA_Pause(1)
  a.addiu(R.a0, R.zero, 1);

  a.label('fbg_desc_loop');
  a.lw(R.t0, 24440, R.gp);         // CD.WAD start LBA (455) — ALL 4 bursts live inside CD.WAD!
  a.lw(R.t1, 4, R.s2);             // secOff
  a.nop();
  a.addu(R.a0, R.t0, R.t1);        // target LBA = baseLba + secOff
  a.lhu(R.t2, 8, R.s2);            // count
  a.lhu(R.t3, 10, R.s2);           // strideSec
  a.nop();
  a.mult(R.t2, R.t3);
  a.mflo(R.t4);                    // totalSectors = count * strideSec
  a.sw(R.t4, 20, R.sp);

  a.jal(0x800A1698);               // CdIntToPos(lba, &loc @ 16(sp))
  a.addiu(R.a1, R.sp, 16);
  a.addiu(R.a0, R.zero, 2);        // CdlSetloc
  a.addiu(R.a1, R.sp, 16);
  a.jal(0x800A08C4);               // CdControl
  a.move(R.a2, R.zero);
  a.lw(R.a0, 20, R.sp);            // totalSectors
  a.move(R.a1, R.s4);              // buf
  a.jal(0x800A5B30);               // CdRead(totalSectors, buf, CdlModeSpeed 0x80)
  a.addiu(R.a2, R.zero, 0x80);

  // Tight zero-VSync CdReadSync(1, 0) poll -> immediate handoff to next contiguous burst!
  a.label('fbg_cd_wait');
  a.addiu(R.a0, R.zero, 1);
  a.jal(0x800A5CCC);               // CdReadSync(1, 0)
  a.move(R.a1, R.zero);
  a.bgtz(R.v0, 'fbg_cd_wait');
  a.nop();

  // Select target sprite array (s5) & activeMode (24(sp)): bit1 of srcFlags redirects t1rend -> CLevelRend!
  a.label('fbg_upload_init');
  a.lw(R.t0, 0, R.s2);
  a.move(R.s5, R.s0);              // default: caller's spritesBase
  a.sw(R.s1, 24, R.sp);            // default: caller's modeOrNeg1
  a.andi(R.t0, R.t0, 2);
  a.beq(R.t0, R.zero, 'fbg_tgt_ok');
  a.nop();
  a.la(R.t1, THPS1_ADDR.g_SavedRendSprites);
  a.lw(R.s5, 0, R.t1);             // target = CLevelRend->spritesBase
  a.addiu(R.t2, R.zero, -1);
  a.sw(R.t2, 24, R.sp);            // activeMode = -1 (no lock tint!)
  a.label('fbg_tgt_ok');
  a.move(R.s6, R.s4);              // s6 = curBmpPtr
  a.lw(R.s7, 12, R.s2);            // s7 = curOrderPtr
  a.lhu(R.t0, 8, R.s2);            // rem = count
  a.nop();
  a.sw(R.t0, 20, R.sp);

  a.label('fbg_upload_loop');
  a.lbu(R.t0, 0, R.s7);            // lv = *curOrderPtr
  a.nop();
  a.sll(R.t1, R.t0, 2);
  a.addu(R.t1, R.s5, R.t1);
  a.lw(R.a0, 0, R.t1);             // spr = activeSprites[lv]
  a.nop();
  a.beq(R.a0, R.zero, 'fbg_upload_next');
  a.nop();
  a.lw(R.v1, 0, R.a0);
  a.nop();
  a.lw(R.v0, 16, R.v1);            // vtable[4] = CSprite::LoadBmp
  a.nop();
  a.jalr(R.ra, R.v0);
  a.move(R.a1, R.s6);              // curBmpPtr

  // If CLevelMap burst (activeMode >= 0), apply lock tint (0x8005E39C) when level is locked
  a.lw(R.t8, 24, R.sp);            // t8 = activeMode
  a.nop();
  a.bltz(R.t8, 'fbg_upload_next');
  a.nop();
  a.lbu(R.a0, 0, R.s7);            // lv
  a.addiu(R.t0, R.zero, 10);       // delay slot
  a.bne(R.a0, R.t0, 'fbg_chk_open');
  a.addiu(R.t0, R.zero, 1);
  a.bne(R.t8, R.t0, 'fbg_upload_next'); // lv==10 & mode!=1 -> UNLOCKED
  a.nop();
  a.j('fbg_do_lock');              // lv==10 & mode==1 (Career) -> LOCKED
  a.nop();

  a.label('fbg_chk_open');
  a.jal('Hook_CareerLevelIsOpenMode');
  a.move(R.a1, R.t8);
  a.bne(R.v0, R.zero, 'fbg_upload_next');
  a.nop();

  a.label('fbg_do_lock');
  a.lbu(R.t0, 0, R.s7);
  a.nop();
  a.sll(R.t1, R.t0, 2);
  a.addu(R.t1, R.s5, R.t1);
  a.lw(R.a0, 0, R.t1);
  a.nop();
  a.jal(0x8005E39C);               // CSprite::SetLockedTint(spr)
  a.nop();

  a.label('fbg_upload_next');
  a.lhu(R.t0, 10, R.s2);           // strideSec
  a.addiu(R.s7, R.s7, 1);          // curOrderPtr++ (fills load delay)
  a.sll(R.t0, R.t0, 11);           // strideBytes = strideSec * 2048
  a.addu(R.s6, R.s6, R.t0);        // curBmpPtr += strideBytes
  a.lw(R.t1, 20, R.sp);
  a.nop();
  a.addiu(R.t1, R.t1, -1);
  a.bne(R.t1, R.zero, 'fbg_upload_loop');
  a.sw(R.t1, 20, R.sp);

  a.addiu(R.s2, R.s2, 16);
  a.addiu(R.s3, R.s3, -1);
  a.bne(R.s3, R.zero, 'fbg_desc_loop');
  a.nop();

  // Resume XA cleanly ONCE at end of FastMap (s1 >= 0) if g_FastBurstXaSaved != 0
  a.bltz(R.s1, 'fbg_free');
  a.nop();
  a.la(R.t0, THPS1_ADDR.g_FastBurstXaSaved);
  a.lw(R.t1, 0, R.t0);
  a.nop();
  a.beq(R.t1, R.zero, 'fbg_free');
  a.nop();
  a.sw(R.zero, 0, R.t0);
  a.jal(0x800387A8);               // XA_SetMode
  a.nop();
  a.jal(0x80038D60);               // XA_Pause(0)
  a.move(R.a0, R.zero);

  a.label('fbg_free');
  a.jal(0x800551A8);               // Mem_Free(buf)
  a.move(R.a0, R.s4);

  a.label('fbg_epilogue');
  a.lw(R.s0, 28, R.sp);
  a.lw(R.s1, 32, R.sp);
  a.lw(R.s2, 36, R.sp);
  a.lw(R.s3, 40, R.sp);
  a.lw(R.s4, 44, R.sp);
  a.lw(R.s5, 48, R.sp);
  a.lw(R.s6, 52, R.sp);
  a.lw(R.s7, 56, R.sp);
  a.lw(R.ra, 60, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 64);

  // --------------------------------------------------------------------------
  // 28. Hook_SetGapList [jal @ 0x80083848 inside Game_StartLevel, $s1 = new levelId 0..19]
  //     Returns $v0 = g_Thps1GapList (0x800E7E60) for THPS1 levels (11..19), or vanilla 0x800BC52C for THPS2!
  // --------------------------------------------------------------------------
  a.label('Hook_SetGapList');
  a.sltiu(R.t8, R.s1, 11);
  a.bne(R.t8, R.zero, 'sgl_thps2');
  a.nop();
  a.la(R.v0, THPS1_ADDR.Thps1GapList);
  a.jr(R.ra);
  a.nop();
  a.label('sgl_thps2');
  a.lui(R.v0, 0x800C);
  a.jr(R.ra);
  a.addiu(R.v0, R.v0, -15060); // 0x800BC52C (vanilla THPS2 g_GapList!)

  // --------------------------------------------------------------------------
  // 29. Hook_GapChecklistGuard [jal @ 0x80024CD4 inside Career_GapAward_Start]
  //     Prevents 0x80024AE4 from indexing g_Career+5268 + g_CurrentLevel*12 past level 10!
  //     For THPS2 levels (0..10), tail-jumps to original 0x80024AE4; for THPS1 (11..19), returns cleanly
  //     while in-run G6/G7 goal bitmasks (1084(gp) & 1088(gp)) continue tracking 100% natively!
  // --------------------------------------------------------------------------
  a.label('Hook_GapChecklistGuard');
  a.lui(R.t8, 0x800D);
  a.lw(R.t8, 25200, R.t8);
  a.nop();
  a.sltiu(R.t9, R.t8, 11);
  a.beq(R.t9, R.zero, 'gcg_skip');
  a.nop();
  a.j(0x80024AE4);
  a.nop();
  a.label('gcg_skip');
  a.jr(R.ra);
  a.nop();

  const used = a.pc() - THPS1_ADDR.CodeBase;
  if (used > 4096) throw new Error(`THPS1_CODE exceeds 4096 B (${used} B)!`);
  console.log(`  [ASM] THPS1_CODE  : 0x${THPS1_ADDR.CodeBase.toString(16)}..0x${a.pc().toString(16)} (${used} B / 4096 B, livre: ${4096 - used} B)`);
  a.padTo(THPS1_ADDR.CodeBase + 4096);
  return a.emit();
}

// ============================================================================
// 2B. Assemble Turbo CD-ROM Contiguous Streaming Cache @ 0x800E8AB0 (464 B)
//     Called from Hook_CdWadFallback (cw_found_orig) with $s1 = &hedEntry.offset.
//     Serves hot contiguous clusters in ONE single CdRead (0.00f RAM memcpy via PreMgr!):
//       - sec 0    (s2bgd6..skate2.sfx, 147s = 301 KB) on EVERY regular level load!
//       - sec 61   (s2_scrib..skate2.sfx, 86s = 176 KB) on EVERY competition level load!
//       - sec 347  (items.psx + bits.psx, 25s = 51 KB) on EVERY level load!
//       - sec 4569 (s2win4 + s2medal1..3 + s2arrow9/8, 24s = 49 KB) in LevelSel (survives s2face*.bmp <= 3s)!
// ============================================================================
function assembleTurboBurstCode() {
  const a = new MipsAsm(THPS1_ADDR.TurboBurstBase);
  const MAX_BYTES = THPS1_ADDR.Thps1StringsSpill - THPS1_ADDR.TurboBurstBase; // 464 B

  a.label('Entry_BurstCdOpen');
  a.addiu(R.sp, R.sp, -56);
  a.sw(R.ra, 52, R.sp);
  a.sw(R.s7, 48, R.sp);
  a.sw(R.s6, 44, R.sp);
  a.sw(R.s5, 40, R.sp);
  a.sw(R.s4, 36, R.sp);
  a.sw(R.s0, 32, R.sp);

  // Note: 0x80054274 in CDWAD_Read is NOPped so 18968($gp) (g_IsPreFile) works even when no .PRE is loaded!
  a.lw(R.t1, 0, R.s1);             // byteOff
  a.lw(R.s4, 4, R.s1);             // s4 = fileSize
  a.nop();
  a.srl(R.s5, R.t1, 11);           // s5 = fileSec
  a.addiu(R.t2, R.s4, 2047);
  a.srl(R.s6, R.t2, 11);           // s6 = fileSecs
  a.bne(R.s6, R.zero, 'bco_chk_act');
  a.nop();
  a.addiu(R.s6, R.zero, 1);

  a.label('bco_chk_act');
  a.la(R.s0, THPS1_ADDR.g_TurboState);
  a.lw(R.t0, 8, R.s0);             // g_BurstBuf
  a.nop();
  a.beq(R.t0, R.zero, 'bco_try_pre');
  a.lw(R.t1, 12, R.s0);            // g_BurstStartSec
  a.lw(R.t2, 16, R.s0);            // g_BurstEndSec
  a.sltu(R.t3, R.s5, R.t1);        // fileSec < StartSec ?
  a.bne(R.t3, R.zero, 'bco_evict');
  a.addu(R.t4, R.s5, R.s6);        // fileEndSec
  a.sltu(R.t3, R.t2, R.t4);        // EndSec < fileEndSec ?
  a.beq(R.t3, R.zero, 'bco_hit');
  a.nop();

  a.label('bco_evict');
  // Immediately evict & free g_BurstBuf on first miss -> ZERO Heap[1] fragmentation!
  a.jal(THPS1_ADDR.Entry_BurstFree);
  a.nop();

  a.label('bco_try_pre');
  a.lw(R.t0, 18928, R.gp);         // g_CdState: only prefetch when idle!
  a.nop();
  a.bne(R.t0, R.zero, 'bco_miss0');
  a.nop();

  a.beq(R.s5, R.zero, 'bco_c0');
  a.addiu(R.t0, R.zero, 61);
  a.beq(R.s5, R.t0, 'bco_c61');
  a.addiu(R.t0, R.zero, 4569);
  a.beq(R.s5, R.t0, 'bco_c4569');
  a.nop();
  a.j('bco_miss0');
  a.nop();

  a.label('bco_c0');
  a.addiu(R.s6, R.zero, 67);       // s2bgd6 + s2_scrib + s2pressx (137 KB, freed BEFORE skate2.vab permanent .VH -> 0 frag!)
  a.j('bco_alloc');
  a.lui(R.t5, 0x0004);             // minFree = 262,144 B

  a.label('bco_c61');
  a.addiu(R.s6, R.zero, 6);        // s2_scrib + s2pressx (12 KB, Competitions, freed BEFORE skate2.vab!)
  a.j('bco_alloc');
  a.lui(R.t5, 0x0002);             // minFree = 131,072 B

  a.label('bco_c4569');
  a.addiu(R.s6, R.zero, 12);       // s2win4 + s2medal1..3 (24 KB, LevelSel, all temp -> freed before s2face2!)
  a.lui(R.t5, 0x0003);             // minFree = 196,608 B

  a.label('bco_alloc');
  // Walk Heap[1] freeList @ 19112(gp) -> t6 = largestFree (100% OOM-proof!)
  a.lw(R.t0, 19112, R.gp);
  a.move(R.t6, R.zero);
  a.label('bco_fl');
  a.beq(R.t0, R.zero, 'bco_fl_done');
  a.nop();
  a.lw(R.t1, 0, R.t0);
  a.lw(R.t0, 4, R.t0);
  a.srl(R.t1, R.t1, 4);
  a.sltu(R.t2, R.t6, R.t1);
  a.beq(R.t2, R.zero, 'bco_fl');
  a.nop();
  a.j('bco_fl');
  a.move(R.t6, R.t1);

  a.label('bco_fl_done');
  a.sltu(R.t2, R.t6, R.t5);
  a.bne(R.t2, R.zero, 'bco_miss0');
  a.sll(R.a0, R.s6, 11);           // allocBytes = nSec * 2048
  a.addiu(R.a1, R.zero, 1);
  a.addiu(R.a2, R.zero, 1);
  a.jal(0x8005515C);               // Mem_Alloc(bytes, 1, 1, 0)
  a.move(R.a3, R.zero);
  a.beq(R.v0, R.zero, 'bco_miss0');
  a.move(R.s7, R.v0);              // s7 = buf

  // Stop active FMV & pause XA only if playing
  a.jal(0x8007AFE4);               // Movie_Stop
  a.nop();
  a.lw(R.t0, 14704, R.gp);         // xaActive
  a.lw(R.t1, 14712, R.gp);         // xaPaused
  a.sw(R.zero, 20, R.s0);          // g_BurstXaSaved = 0
  a.beq(R.t0, R.zero, 'bco_cd_go');
  a.nop();
  a.bne(R.t1, R.zero, 'bco_cd_go');
  a.nop();
  a.addiu(R.t2, R.zero, 1);
  a.sw(R.t2, 20, R.s0);
  a.jal(0x80038D60);               // XA_Pause(1)
  a.addiu(R.a0, R.zero, 1);

  a.label('bco_cd_go');
  a.lw(R.t0, 24440, R.gp);         // CD.WAD base LBA
  a.nop();
  a.addu(R.a0, R.t0, R.s5);        // absLba
  a.jal(0x800A1698);               // CdIntToPos(absLba, sp+16)
  a.addiu(R.a1, R.sp, 16);
  a.addiu(R.a0, R.zero, 2);        // CdlSetloc
  a.addiu(R.a1, R.sp, 16);
  a.jal(0x800A08C4);               // CdControl
  a.move(R.a2, R.zero);
  a.move(R.a0, R.s6);              // nSec
  a.move(R.a1, R.s7);              // buf
  a.jal(0x800A5B30);               // CdRead(nSec, buf, 0x80)
  a.addiu(R.a2, R.zero, 0x80);

  a.label('bco_wait');
  a.addiu(R.a0, R.zero, 1);
  a.jal(0x800A5CCC);               // CdReadSync(1, 0)
  a.move(R.a1, R.zero);
  a.blez(R.v0, 'bco_cd_done');
  a.nop();
  a.jal(THPS1_ADDR.Entry_LoadingBarThrottle);
  a.nop();
  a.j('bco_wait');
  a.nop();

  a.label('bco_cd_done');
  a.lw(R.t0, 20, R.s0);
  a.nop();
  a.beq(R.t0, R.zero, 'bco_commit');
  a.nop();
  a.sw(R.zero, 20, R.s0);
  a.jal(0x800387A8);               // XA_SetMode
  a.nop();
  a.jal(0x80038D60);               // XA_Pause(0)
  a.move(R.a0, R.zero);

  a.label('bco_commit');
  a.sw(R.s7, 8, R.s0);             // g_BurstBuf = buf
  a.sw(R.s5, 12, R.s0);            // g_BurstStartSec = fileSec
  a.addu(R.t1, R.s5, R.s6);
  a.sw(R.t1, 16, R.s0);            // g_BurstEndSec = fileSec + nSec

  a.label('bco_hit');
  a.lw(R.t0, 8, R.s0);             // g_BurstBuf
  a.lw(R.t1, 12, R.s0);            // g_BurstStartSec
  a.addiu(R.t3, R.zero, 1);
  a.subu(R.t2, R.s5, R.t1);        // relSec
  a.sll(R.t2, R.t2, 11);
  a.addu(R.t2, R.t0, R.t2);        // dataPtr
  a.sw(R.t3, 18968, R.gp);         // g_IsPreFile = 1
  a.sw(R.t2, 18972, R.gp);         // g_PreDataPtr = dataPtr
  a.sw(R.s4, 18976, R.gp);         // g_PreDataSize = fileSize
  a.sw(R.t3, 18936, R.gp);         // g_FileOpen = 1
  a.sw(R.s4, 19012, R.gp);         // g_FileSize = fileSize
  a.j('bco_ret');
  a.move(R.v0, R.s4);

  a.label('bco_miss0');
  a.move(R.v0, R.zero);

  a.label('bco_ret');
  a.lw(R.s0, 32, R.sp);
  a.lw(R.s4, 36, R.sp);
  a.lw(R.s5, 40, R.sp);
  a.lw(R.s6, 44, R.sp);
  a.lw(R.s7, 48, R.sp);
  a.lw(R.ra, 52, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 56);

  const used = a.pc() - THPS1_ADDR.TurboBurstBase;
  if (used > MAX_BYTES) throw new Error(`TURBO_BURST exceeds ${MAX_BYTES} B (${used} B)!`);
  console.log(`  [ASM] TURBO_BURST : 0x${THPS1_ADDR.TurboBurstBase.toString(16)}..0x${a.pc().toString(16)} (${used} B / ${MAX_BYTES} B, livre: ${MAX_BYTES - used} B)`);
  a.padTo(THPS1_ADDR.TurboBurstBase + MAX_BYTES);
  return a.emit();
}

// ============================================================================
// 2C. Assemble Turbo CD Throttle & Free Helpers @ 0x800E9ED0 (304 B)
//     - Entry_LoadingBarThrottle (0x800E9ED0): 60 Hz GPU ClearImage throttle on LoadingBar_Draw
//     - Entry_CdPollPadThrottle  (0x800E9F10): 60 Hz SIO Pad_Update throttle inside CDWAD_Poll
//     - Entry_BurstFree          (0x800E9F48): Safe Mem_Free(g_BurstBuf) preserving all $s* regs
// ============================================================================
function assembleTurboAuxCode() {
  const a = new MipsAsm(THPS1_ADDR.TurboAuxBase);
  const MAX_BYTES = THPS1_ADDR.CodeBase - THPS1_ADDR.TurboAuxBase; // 304 B

  a.padTo(THPS1_ADDR.Entry_LoadingBarThrottle);
  a.lui(R.t1, 0x800D);
  a.lw(R.t2, 28872, R.t1);         // g_FrameCounter (0x800D70C8)
  a.la(R.t3, THPS1_ADDR.g_TurboState);
  a.lw(R.t4, 0, R.t3);             // g_LastBarFrame
  a.nop();
  a.beq(R.t2, R.t4, 'lbt_skip');
  a.nop();
  a.sw(R.t2, 0, R.t3);
  a.j(0x80022AB4);                 // continue original LoadingBar_Draw (0x80022AB4 is addiu sp,-32 -> fills load delay!)
  a.lw(R.v0, 22380, R.t1);         // replay original 0x80022AB0 in delay slot!
  a.label('lbt_skip');
  a.jr(R.ra);
  a.nop();

  a.padTo(THPS1_ADDR.Entry_CdPollPadThrottle);
  a.lui(R.t1, 0x800D);
  a.lw(R.t2, 28872, R.t1);         // g_FrameCounter
  a.la(R.t3, THPS1_ADDR.g_TurboState);
  a.lw(R.t4, 4, R.t3);             // g_LastPadFrame
  a.nop();
  a.beq(R.t2, R.t4, 'cppt_skip');
  a.nop();
  a.sw(R.t2, 4, R.t3);
  a.j(0x8006B978);                 // tail-call Pad_Update once per VBlank!
  a.nop();
  a.label('cppt_skip');
  a.jr(R.ra);
  a.nop();

  a.padTo(THPS1_ADDR.Entry_BurstFree);
  a.la(R.t0, THPS1_ADDR.g_TurboState);
  a.lw(R.a0, 8, R.t0);             // g_BurstBuf
  a.nop();
  a.beq(R.a0, R.zero, 'bf_ret');
  a.nop();
  a.addiu(R.sp, R.sp, -24);
  a.sw(R.ra, 20, R.sp);
  a.sw(R.zero, 8, R.t0);           // clear g_BurstBuf BEFORE Mem_Free!
  a.sw(R.zero, 12, R.t0);
  a.sw(R.zero, 16, R.t0);
  a.jal(0x800551A8);               // Mem_Free(a0)
  a.nop();
  a.lw(R.ra, 20, R.sp);
  a.nop();
  a.jr(R.ra);
  a.addiu(R.sp, R.sp, 24);
  a.label('bf_ret');
  a.jr(R.ra);
  a.nop();

  const used = a.pc() - THPS1_ADDR.TurboAuxBase;
  if (used > MAX_BYTES) throw new Error(`TURBO_AUX exceeds ${MAX_BYTES} B (${used} B)!`);
  console.log(`  [ASM] TURBO_AUX   : 0x${THPS1_ADDR.TurboAuxBase.toString(16)}..0x${a.pc().toString(16)} (${used} B / ${MAX_BYTES} B, livre: ${MAX_BYTES - used} B)`);
  a.padTo(THPS1_ADDR.TurboAuxBase + MAX_BYTES);
  return a.emit();
}

// ============================================================================
// 3. Patch Helper with Strict Verification + .REL Guard
// ============================================================================
function jalW(tgt) { return (0x0C000000 | ((tgt >>> 2) & 0x03FFFFFF)) >>> 0; }
function jW(tgt) { return (0x08000000 | ((tgt >>> 2) & 0x03FFFFFF)) >>> 0; }

function parseRelOffsets(relBuf) {
  // THPS2 .rel stores relocation entries starting after header — collect all u32 offsets that appear < overlay size
  // so we never accidentally overwrite a relocated instruction without checking!
  const set = new Set();
  for (let off = 0; off + 4 <= relBuf.length; off += 4) {
    const v = relBuf.readUInt32LE(off);
    if (v > 0 && v < 0x10000 && (v & 3) === 0) set.add(v);
  }
  return set;
}

function patchExact(buf, off, origVal, newVal, label, altOrigs = []) {
  const cur = buf.readUInt32LE(off);
  if (cur !== origVal && cur !== newVal && !altOrigs.includes(cur)) {
    throw new Error(`Patch mismatch [${label}] @ 0x${off.toString(16)}: cur=0x${cur.toString(16)} exp=0x${origVal.toString(16)}`);
  }
  buf.writeUInt32LE(newVal >>> 0, off);
}

/**
 * Automatically relocates ALL `lui reg, 0x800c` + `addiu/lw ..., reg, imm` pairs referencing
 * g_LevelTable (0x800B8444..0x800B9437) -> g_ExtLevelTable (0x800E6000..0x800E6FF3)!
 * Works backwards from every instruction whose (0x800C0000 + simm) falls in g_LevelTable to its
 * defining `lui rs, 0x800C`, catching ALL long-lived saved registers (`$s5` @ 0x80024430, 0x80034370, 0x80034558)!
 */
function relocateLevelTableRefs(buf, origBuf, startOff, endOff, tag) {
  let count = 0;
  const updatedLuis = new Set();
  for (let off = startOff; off < endOff; off += 4) {
    const i2 = origBuf.readUInt32LE(off);
    const o2 = (i2 >>> 26) & 0x3F;
    const rs2 = (i2 >>> 21) & 0x1F;
    const simm2 = ((i2 & 0xFFFF) << 16) >> 16;
    if (![0x09, 0x20, 0x21, 0x23, 0x24, 0x25, 0x28, 0x29, 0x2B].includes(o2)) continue;
    const oldAddr = (0x800C0000 + simm2) >>> 0;
    if (oldAddr < 0x800B8444 || oldAddr >= 0x800B9438) continue;

    // Scan backwards up to 300 instructions for the closest `lui rs2, ...`
    let luiOff = -1, luiVal = 0;
    for (let k = 1; k <= 300 && off - k * 4 >= startOff; k++) {
      const pi = origBuf.readUInt32LE(off - k * 4);
      const pop = (pi >>> 26) & 0x3F;
      const prt = (pi >>> 16) & 0x1F;
      if (pop === 0x0F && prt === rs2) {
        luiOff = off - k * 4;
        luiVal = pi & 0xFFFF;
        break;
      }
    }
    if (luiOff < 0 || luiVal !== 0x800C) continue;

    const delta = oldAddr - 0x800B8444;
    const newAddr = (THPS1_ADDR.ExtLevelTable + delta) >>> 0;
    const { hi, lo } = splitHiLo(newAddr);
    const newLui = ((0x0F << 26) | (rs2 << 16) | hi) >>> 0;
    const newUse = ((i2 & 0xFFFF0000) | lo) >>> 0;
    if (!updatedLuis.has(luiOff)) {
      buf.writeUInt32LE(newLui, luiOff);
      updatedLuis.add(luiOff);
    }
    buf.writeUInt32LE(newUse, off);
    count++;
  }
  console.log(`  [RELOC] ${tag.padEnd(18)}: ${count} referencias g_LevelTable (${updatedLuis.size} lui) -> 0x${THPS1_ADDR.ExtLevelTable.toString(16)}`);
  return count;
}

// ============================================================================
// 4. Apply All THPS1 Engine Patches to SLUS_010.66 & CD.WAD (levelsel + options)
// ============================================================================
function applyThps1EnginePatches(slusBuf, wadBuf, hedBuf) {
  console.log('\n=== Aplicando Hooks do Motor THPS1-in-THPS2 (19 Fases Intercaladas) ===');
  const origSlus = fs.readFileSync(ORIG_SLUS_PATH);
  const origWad = fs.readFileSync(ORIG_WAD_PATH);
  const r2f = (ram) => (ram - SLUS_BASE) + SLUS_HDR;

  // --- A. SLUS_010.66 Patches ---
  // 1. Relocate ALL 70 g_LevelTable references in code section (0x800..0xA0000) -> 0x800E6000
  //    (Explicitly verify long-range $s5 uses @ 0x80024430, 0x80034370, 0x80034558!)
  const slusRelocs = relocateLevelTableRefs(slusBuf, origSlus, SLUS_HDR, 0xA0000, 'SLUS_010.66');
  if (slusRelocs !== 70) throw new Error(`Expected 70 g_LevelTable relocs in SLUS_010.66, got ${slusRelocs}`);
  for (const checkPc of [0x80024430, 0x80034370, 0x80034558]) {
    if ((slusBuf.readUInt32LE(r2f(checkPc)) & 0xFFFF) !== 0x6000) {
      throw new Error(`Long-range g_LevelTable reloc FAILED at 0x${checkPc.toString(16)}!`);
    }
  }

  // 2. Relocate ExtLightTable (0x800B961C -> 0x800E8000) @ 0x800484AC / 0x800484B8
  {
    const { hi, lo } = splitHiLo(THPS1_ADDR.ExtLightTable);
    patchExact(slusBuf, r2f(0x800484AC), 0x3C04800C, (0x3C040000 | hi) >>> 0, 'ExtLightTable lui @ 0x800484AC');
    patchExact(slusBuf, r2f(0x800484B8), 0x2484961C, (0x24840000 | lo) >>> 0, 'ExtLightTable lo  @ 0x800484B8');
  }
  // 3. Relocate ExtShadowTable (0x800B9824 -> 0x800E8410) @ 0x8004907C / 0x80049088 / 0x800490E0
  {
    const { hi, lo } = splitHiLo(THPS1_ADDR.ExtShadowTable);
    patchExact(slusBuf, r2f(0x8004907C), 0x3C09800C, (0x3C090000 | hi) >>> 0, 'ExtShadowTable lui @ 0x8004907C');
    patchExact(slusBuf, r2f(0x80049088), 0x25239824, (0x25230000 | lo) >>> 0, 'ExtShadowTable lo1 @ 0x80049088');
    patchExact(slusBuf, r2f(0x800490E0), 0x25249824, (0x25240000 | lo) >>> 0, 'ExtShadowTable lo2 @ 0x800490E0');
  }
  // 4. High Score Table Safe Redirection (6 sites: 0..10 -> 0x800BB95C, 11..19 -> 0x800E8550, ZERO memory corruption & ZERO delay-slot hazards!)
  patchExact(slusBuf, r2f(0x8002E988), 0x0012B980, jalW(THPS1_ADDR.Entry_HiScore_s7_s2), 'HiScoreDisplay1 sll s7,s2,6 @ 0x8002E988');
  patchExact(slusBuf, r2f(0x8002F098), 0x00121980, jalW(THPS1_ADDR.Entry_HiScore_v1_s2), 'HiScoreDisplay2 sll v1,s2,6 @ 0x8002F098');
  patchExact(slusBuf, r2f(0x8002F09C), 0x00431021, 0x00000000,                           'HiScoreDisplay2 delay nop (absorbed!)');
  patchExact(slusBuf, r2f(0x80030038), 0x00025980, jalW(THPS1_ADDR.Entry_HiScore_t3_v0), 'HiScoreInsert   sll t3,v0,6 @ 0x80030038');
  patchExact(slusBuf, r2f(0x8003003C), 0x01CB1021, 0x00000000,                           'HiScoreInsert   delay nop (absorbed!)');
  patchExact(slusBuf, r2f(0x80032E78), 0x00112180, jalW(THPS1_ADDR.Entry_HiScore_a0_s1), 'HiScoreEdit1    sll a0,s1,6 @ 0x80032E78');
  patchExact(slusBuf, r2f(0x80032F08), 0x00112180, jalW(THPS1_ADDR.Entry_HiScore_a0_s1), 'HiScoreEdit2    sll a0,s1,6 @ 0x80032F08');
  patchExact(slusBuf, r2f(0x8003306C), 0x00041980, jalW(THPS1_ADDR.Entry_HiScore_v1_a0), 'HiScoreCommit   sll v1,a0,6 @ 0x8003306C');
  patchExact(slusBuf, r2f(0x80033070), 0x3C04800C, 0x00000000,                           'HiScoreCommit   delay nop (absorbed!)');
  // Restore original 0x8003307C (in case a previous run patched it as ExtSkyTable)
  slusBuf.writeUInt32LE(0x2505FB98, r2f(0x8003307C));
  // Career_InitAll @ 0x80023988 -> also clear g_ExtCareer on New Career!
  patchExact(slusBuf, r2f(0x80023988), 0x0C00B136, jalW(THPS1_ADDR.Entry_CareerResetExt), 'Career_InitAll clear ExtCareer @ 0x80023988');

  // 5. Hook CDWAD_Open fallback @ 0x80054190 (`bne s1, zero, 0x800541F4` + delay slot `addiu s0, sp, 16`)
  patchExact(slusBuf, r2f(0x80054190), 0x16200018, jW(THPS1_ADDR.Entry_CdWadFallback), 'CDWAD_Open THPS1.WAD fallback @ 0x80054190');
  patchExact(slusBuf, r2f(0x80054194), 0x27B00010, 0x00000000, 'CDWAD_Open delay nop @ 0x80054194');

  // 6. Hook Career Functions (interleaved progression + ExtCareer for levels 11..19)
  patchExact(slusBuf, r2f(0x80025848), 0x00003021, jW(THPS1_ADDR.Entry_CareerCountMedals),    'Career_CountMedals @ 0x80025848');
  patchExact(slusBuf, r2f(0x8002584C), 0x00002821, 0x00000000,                                 'Career_CountMedals nop');
  patchExact(slusBuf, r2f(0x800258A0), 0x3C02800D, jW(THPS1_ADDR.Entry_CareerLevelIsOpenIn),  'Career_LevelIsOpen_Inner @ 0x800258A0');
  patchExact(slusBuf, r2f(0x800258A4), 0x8C426344, 0x00000000,                                 'Career_LevelIsOpen_Inner nop');
  patchExact(slusBuf, r2f(0x8002597C), 0x3C02800D, jW(THPS1_ADDR.Entry_CareerLevelIsOpenMod), 'Career_LevelIsOpen @ 0x8002597C');
  patchExact(slusBuf, r2f(0x80025980), 0x8C426344, 0x00000000,                                 'Career_LevelIsOpen nop');
  patchExact(slusBuf, r2f(0x800240D4), 0x27BDFFE8, jW(THPS1_ADDR.Entry_CareerHasGoal),        'Career_HasGoal @ 0x800240D4');
  patchExact(slusBuf, r2f(0x800240D8), 0xAFB00010, 0x00000000,                                 'Career_HasGoal nop');
  patchExact(slusBuf, r2f(0x8002413C), 0x00003021, jW(THPS1_ADDR.Entry_CareerCountLvlGoals),  'Career_CountLevelGoals @ 0x8002413C');
  patchExact(slusBuf, r2f(0x80024140), 0x00001821, 0x00000000,                                 'Career_CountLevelGoals nop');
  patchExact(slusBuf, r2f(0x800241BC), 0x27BDFFE8, jW(THPS1_ADDR.Entry_CareerCountCash),      'Career_CountCash @ 0x800241BC');
  patchExact(slusBuf, r2f(0x800241C0), 0x3C04800C, 0x00000000,                                 'Career_CountCash nop');
  patchExact(slusBuf, r2f(0x8002465C), 0x27BDFFE0, jW(THPS1_ADDR.Entry_CareerSetMedal),       'Career_SetMedal @ 0x8002465C');
  patchExact(slusBuf, r2f(0x80024660), 0xAFB00010, 0x00000000,                                 'Career_SetMedal nop');

  // Career_HasCashNode @ 0x80024EE0..0x80024EE4
  patchExact(slusBuf, r2f(0x80024EE0), 0x00102943, jW(THPS1_ADDR.Entry_CareerHasCashNode),    'Career_HasCashNode @ 0x80024EE0');
  patchExact(slusBuf, r2f(0x80024EE4), 0x3C03800D, 0x00000000,                                 'Career_HasCashNode nop');

  // Career_CollectCash bit set @ 0x80024F5C..0x80024F60
  patchExact(slusBuf, r2f(0x80024F5C), 0x00022143, jW(THPS1_ADDR.Entry_CareerCollectCashBit), 'Career_CollectCashBit @ 0x80024F5C');
  patchExact(slusBuf, r2f(0x80024F60), 0x00042080, 0x00000000,                                 'Career_CollectCashBit nop');

  // Career_GiveGoal bit set @ 0x800243A4..0x800243A8
  patchExact(slusBuf, r2f(0x800243A4), 0x2645000C, jW(THPS1_ADDR.Entry_CareerGiveGoalBit),    'Career_GiveGoalBit @ 0x800243A4');
  patchExact(slusBuf, r2f(0x800243A8), 0x00A03021, 0x00000000,                                 'Career_GiveGoalBit nop');

  // Career_SetAllGoalsBit @ 0x800245B8..0x800245BC
  patchExact(slusBuf, r2f(0x800245B8), 0x3C05800D, jW(THPS1_ADDR.Entry_CareerSetAllGoals),    'Career_SetAllGoals @ 0x800245B8');
  patchExact(slusBuf, r2f(0x800245BC), 0x8CA56270, 0x00000000,                                 'Career_SetAllGoals nop');

  // Restore Career_PrintGoalList @ 0x80025EE4..0x80025EEC to vanilla 10-goal loop (all THPS1 levels have full 10 goals!)
  patchExact(slusBuf, r2f(0x80025EE4), 0x2A82000A, 0x2A82000A, 'GoalList vanilla 10-goal slti @ 0x80025EE4', [jW(THPS1_ADDR.Entry_CompLoadBmp), jalW(THPS1_ADDR.Entry_CompLoadBmp)]);
  patchExact(slusBuf, r2f(0x80025EE8), 0x1440FFC4, 0x1440FFC4, 'GoalList vanilla 10-goal bne @ 0x80025EE8', [0x26520010]);
  patchExact(slusBuf, r2f(0x80025EEC), 0x26520010, 0x26520010, 'GoalList vanilla 10-goal addiu @ 0x80025EEC', [0x00000000]);

  // Competition Loading/Invite BMP hook @ 0x80022E2C (Chicago=14 -> t1comp0.bmp, Burnside=17 -> t1comp1.bmp, Roswell=19 -> t1comp2.bmp!)
  patchExact(slusBuf, r2f(0x80022E2C), 0x08008BE6, jW(THPS1_ADDR.Entry_CompLoadBmp), 'GoalList_Open THPS1 Comp BMP @ 0x80022E2C');
  patchExact(slusBuf, r2f(0x80022E30), 0x240500D2, 0x00000000,                       'GoalList_Open Comp BMP delay nop @ 0x80022E30');

  // Punchier CModel::KnockDown box/crate hit (8192 -> 12288) & bounce (8192 -> 11264) volume so box crash stands out over skater grunt!
  patchExact(slusBuf, r2f(0x80044318), 0x24052000, 0x24053000, 'CModel::KnockDown Hit SFX vol 8192->12288 @ 0x80044318');
  patchExact(slusBuf, r2f(0x80044A08), 0x24052000, 0x24052C00, 'CModel::KnockDown Bounce SFX vol 8192->11264 @ 0x80044A08');

  // Snappier Fade_Start tile-wipes between menus & gameplay (respecting Mode-1 >= 96 and Mode-2 >= 32 minimums!)
  patchExact(slusBuf, r2f(0x80082B48), 0x240400EC, 0x24040070, 'Fade_Start MainMenu->PlaySel 236->112 @ 0x80082B48');
  patchExact(slusBuf, r2f(0x80083328), 0x240400EC, 0x24040070, 'Fade_Start Gameplay->Menu 236->112 @ 0x80083328');
  patchExact(slusBuf, r2f(0x8002310C), 0x24040034, 0x24040022, 'Fade_Start GoalList->Game 52->34 @ 0x8002310C');

  // TURBO CDWAD ENGINE (Zero rotational-overshoot polling + 60 Hz GPU/SIO throttling + Pre-less RAM Burst):
  //   - 0x80054274: NOP redundant g_PreMgr!=0 guard in CDWAD_Read (g_IsPreFile @ 18968(gp) is already 0 unless PreMgr or TURBO_BURST hit!)
  //   - 0x80054440: immediately jump to 0x800543CC (zero g_CdState & g_FileOpen) on CdReadSync(1)==0 (delay slot writes bytesRead!)
  //   - 0x800544EC: NOP duplicate LoadingBar_Draw inside CDWAD_WaitIdle spin-loop
  //   - 0x80054504: NOP redundant trailing CDWAD_Poll after CDWAD_WaitIdle exits
  //   - 0x80022AAC: throttle LoadingBar_Draw GPU ClearImage to 60 Hz (eliminates 500x/frame GPU FIFO stalls!)
  //   - 0x800543DC: throttle Pad_Update inside CDWAD_Poll to 60 Hz (microsecond CdReadSync handoff!)
  patchExact(slusBuf, r2f(0x80054274), 0x1040000C, 0x00000000,                           'CDWAD_Read allow g_IsPreFile without PreMgr @ 0x80054274');
  patchExact(slusBuf, r2f(0x80054440), 0x00000000, jW(0x800543CC),                       'CDWAD_Poll instant idle on sync==0 @ 0x80054440');
  patchExact(slusBuf, r2f(0x800544EC), 0x0C008AAB, 0x00000000,                           'CDWAD_WaitIdle drop dup LoadingBar @ 0x800544EC');
  patchExact(slusBuf, r2f(0x80054504), 0x0C0150C3, 0x00000000,                           'CDWAD_WaitIdle drop extra Poll @ 0x80054504');
  patchExact(slusBuf, r2f(0x80022AAC), 0x3C02800D, jW(THPS1_ADDR.Entry_LoadingBarThrottle), 'LoadingBar_Draw 60Hz throttle j @ 0x80022AAC');
  patchExact(slusBuf, r2f(0x80022AB0), 0x8C42576C, 0x00000000,                           'LoadingBar_Draw 60Hz throttle nop @ 0x80022AB0');
  patchExact(slusBuf, r2f(0x800543DC), 0x0C01AE5E, jalW(THPS1_ADDR.Entry_CdPollPadThrottle), 'CDWAD_Poll Pad_Update 60Hz throttle @ 0x800543DC');

  // Pause Menu "View Goals" button visibility for THPS1 levels @ 0x8002D900 (jal in nop slot; nop @ 0x8002D904; original bne @ 0x8002D908 untouched!)
  patchExact(slusBuf, r2f(0x8002D900), 0x00000000, jalW(THPS1_ADDR.Entry_ShowGoalsBtn),        'PauseMenu ShowGoalsBtn jal @ 0x8002D900');
  patchExact(slusBuf, r2f(0x8002D904), 0x28420008, 0x00000000,                                 'PauseMenu ShowGoalsBtn delay nop @ 0x8002D904', [jalW(THPS1_ADDR.Entry_ShowGoalsBtn)]);

  // XA_GetLevelTrack @ 0x80038C98: clamp levelId to 0..15 so all 9 THPS1 levels play real COMPILED.XA songs!
  patchExact(slusBuf, r2f(0x80038C98), 0x04610002, 0x3063000F,                                 'XA_GetLevelTrack andi v1,v1,0xF @ 0x80038C98');
  patchExact(slusBuf, r2f(0x80038CA0), 0x24620007, 0x00000000,                                 'XA_GetLevelTrack nop @ 0x80038CA0');

  // Comp_CountMedals1 @ 0x8007C9BC -> unified Hook_CareerCountMedals & >= 3 check!
  patchExact(slusBuf, r2f(0x8007C9BC), 0x00003021, 0x00402021,                                 'Comp_CountMedals1 move a0,v0 @ 0x8007C9BC');
  patchExact(slusBuf, r2f(0x8007C9C0), 0x00002821, jalW(THPS1_ADDR.Entry_CareerCountMedals),   'Comp_CountMedals1 jal @ 0x8007C9C0');
  patchExact(slusBuf, r2f(0x8007C9C4), 0x2444000C, 0x00000000,                                 'Comp_CountMedals1 nop');
  patchExact(slusBuf, r2f(0x8007C9C8), 0x3C03800E, jW(0x8007CA0C),                             'Comp_CountMedals1 skip loop');
  patchExact(slusBuf, r2f(0x8007C9CC), 0x2463600C, 0x00403021,                                 'Comp_CountMedals1 move a2,v0 (delay)');
  patchExact(slusBuf, r2f(0x8007CA0C), 0x38C20003, 0x28C20003,                                 'Comp_CountMedals1 slti v0,a2,3 (>=3)');
  patchExact(slusBuf, r2f(0x8007CA14), 0x2C420001, 0x38420001,                                 'Comp_CountMedals1 xori v0,v0,1 (>=3)');

  // Comp_CountMedals2 @ 0x8007CA3C -> unified Hook_CareerCountGolds & >= 3 check!
  patchExact(slusBuf, r2f(0x8007CA3C), 0x00003021, 0x00402021,                                 'Comp_CountMedals2 move a0,v0 @ 0x8007CA3C');
  patchExact(slusBuf, r2f(0x8007CA40), 0x00002821, jalW(THPS1_ADDR.Entry_CareerCountGolds),    'Comp_CountMedals2 jal @ 0x8007CA40');
  patchExact(slusBuf, r2f(0x8007CA44), 0x2444000C, 0x00000000,                                 'Comp_CountMedals2 nop');
  patchExact(slusBuf, r2f(0x8007CA48), 0x3C03800E, jW(0x8007CA8C),                             'Comp_CountMedals2 skip loop');
  patchExact(slusBuf, r2f(0x8007CA4C), 0x2463600C, 0x00403021,                                 'Comp_CountMedals2 move a2,v0 (delay)');
  patchExact(slusBuf, r2f(0x8007CA8C), 0x38C20003, 0x28C20003,                                 'Comp_CountMedals2 slti v0,a2,3 (>=3)');
  patchExact(slusBuf, r2f(0x8007CA94), 0x2C420001, 0x38420001,                                 'Comp_CountMedals2 xori v0,v0,1 (>=3)');

  // Comp_EndPrizeMoney @ 0x8007D628, 0x8007D674, 0x8007D6D4 (Chicago/Burnside/Roswell medal prize money!)
  patchExact(slusBuf, r2f(0x8007D628), 0x00062840, jalW(THPS1_ADDR.Entry_CompPrizeAB),         'Comp_EndPrizeMoney Gold check @ 0x8007D628');
  patchExact(slusBuf, r2f(0x8007D62C), 0x01051821, 0x00062840,                                 'Comp_EndPrizeMoney sll a1,a2,1 (delay)');
  patchExact(slusBuf, r2f(0x8007D630), 0x9462000C, 0x00000000,                                 'Comp_EndPrizeMoney nop');
  patchExact(slusBuf, r2f(0x8007D674), 0x00062040, jalW(THPS1_ADDR.Entry_CompPrizeAB),         'Comp_EndPrizeMoney Silver check @ 0x8007D674');
  patchExact(slusBuf, r2f(0x8007D678), 0x01041021, 0x00062040,                                 'Comp_EndPrizeMoney sll a0,a2,1 (delay)');
  patchExact(slusBuf, r2f(0x8007D67C), 0x9442000C, 0x00000000,                                 'Comp_EndPrizeMoney nop');
  patchExact(slusBuf, r2f(0x8007D6D4), 0x00073040, jalW(THPS1_ADDR.Entry_CompPrizeC),          'Comp_EndPrizeMoney Bronze check @ 0x8007D6D4');
  patchExact(slusBuf, r2f(0x8007D6D8), 0x01061021, 0x00073040,                                 'Comp_EndPrizeMoney sll a2,a3,1 (delay)');
  patchExact(slusBuf, r2f(0x8007D6DC), 0x9444000C, 0x00000000,                                 'Comp_EndPrizeMoney nop');

  // Comp_InitPodium @ 0x8007E588..0x8007E590 (v0 = skaterProg, a1 = g_CurrentLevel -> v1 = levelFlags)
  patchExact(slusBuf, r2f(0x8007E588), 0x00052040, jalW(THPS1_ADDR.Entry_CompInitPodium),      'Comp_InitPodium @ 0x8007E588');
  patchExact(slusBuf, r2f(0x8007E58C), 0x00441021, 0x00000000,                                 'Comp_InitPodium nop1');
  patchExact(slusBuf, r2f(0x8007E590), 0x9443000C, 0x00000000,                                 'Comp_InitPodium nop2');

  // CCar::CCar vehicle model dispatch for THPS1 Streets SF (215 -> c_van, 216 -> c_cabl1; THPS2 levels untouched!)
  patchExact(slusBuf, r2f(0x80061A58), 0x0C0127A9, jalW(THPS1_ADDR.Entry_Car215_SetModel),     'CCar 215 c_bus/c_van @ 0x80061A58');
  patchExact(slusBuf, r2f(0x80061A70), 0x0C0127A9, jalW(THPS1_ADDR.Entry_Car216_SetModel),     'CCar 216 c_cable/c_cabl1 @ 0x80061A70');

  // Switch g_GapList (0x800D70A8) to g_Thps1GapList (0x800E7E60) on THPS1 levels 11..19 & guard 11-level Gap Checklist!
  patchExact(slusBuf, r2f(0x80083848), 0x3C02800C, jalW(THPS1_ADDR.Entry_SetGapList),          'Game_StartLevel SetGapList jal @ 0x80083848');
  patchExact(slusBuf, r2f(0x8008384C), 0x2442C52C, 0x00000000,                                 'Game_StartLevel SetGapList delay nop @ 0x8008384C');
  patchExact(slusBuf, r2f(0x80024CD4), 0x0C0092B9, jalW(THPS1_ADDR.Entry_GapChecklistGuard),   'Career_GapAward_Start GapChecklistGuard @ 0x80024CD4');

  // Hook all 6 .TRG SecretFlagSet / SecretFlagGet / TrigHasGoal sites so THPS1 secret areas (levels 11..19)
  // read/write g_ExtCareer.secretFlags & levelFlags cleanly without overflowing SCareerSkater!
  // Block 1 (0x80046F20..0x80046FEC):
  patchExact(slusBuf, r2f(0x80046F20), 0x24420020, jalW(THPS1_ADDR.Entry_SecretFlagSet),       'TRG SecretFlagSet1 jal @ 0x80046F20');
  patchExact(slusBuf, r2f(0x80046F24), 0x00451021, 0x00402021,                                 'TRG SecretFlagSet1 move a0,v0 (delay)');
  patchExact(slusBuf, r2f(0x80046F88), 0x00000000, jalW(THPS1_ADDR.Entry_SecretFlagGet),       'TRG SecretFlagGet1 jal @ 0x80046F88');
  patchExact(slusBuf, r2f(0x80046F8C), 0x00451021, 0x00402021,                                 'TRG SecretFlagGet1 move a0,v0 (delay)');
  patchExact(slusBuf, r2f(0x80046F90), 0x90420020, 0x90420000,                                 'TRG SecretFlagGet1 lbu v0,0(v0)');
  patchExact(slusBuf, r2f(0x80046FE0), 0x00000000, 0x00402021,                                 'TRG TrigHasGoal1 move a0,v0 @ 0x80046FE0');
  patchExact(slusBuf, r2f(0x80046FE4), 0x00031840, jalW(THPS1_ADDR.Entry_TrigHasGoal),         'TRG TrigHasGoal1 jal @ 0x80046FE4');
  patchExact(slusBuf, r2f(0x80046FE8), 0x00431021, 0x00602821,                                 'TRG TrigHasGoal1 move a1,v1 (delay)');
  patchExact(slusBuf, r2f(0x80046FEC), 0x8444000C, 0x00402021,                                 'TRG TrigHasGoal1 move a0,v0');
  // Block 2 (0x8004D91C..0x8004DA08):
  patchExact(slusBuf, r2f(0x8004D91C), 0x24420020, 0x3C05800D,                                 'TRG SecretFlagSet2 lui a1,0x800D @ 0x8004D91C');
  patchExact(slusBuf, r2f(0x8004D920), 0x3C05800D, 0x8CA56270,                                 'TRG SecretFlagSet2 lw a1,25200(a1)');
  patchExact(slusBuf, r2f(0x8004D924), 0x8CA56270, jalW(THPS1_ADDR.Entry_SecretFlagSet),       'TRG SecretFlagSet2 jal');
  patchExact(slusBuf, r2f(0x8004D928), 0x24030001, 0x00402021,                                 'TRG SecretFlagSet2 move a0,v0 (delay)');
  patchExact(slusBuf, r2f(0x8004D92C), 0x00451021, 0x24030001,                                 'TRG SecretFlagSet2 addiu v1,zero,1');
  patchExact(slusBuf, r2f(0x8004D984), 0x00000000, jalW(THPS1_ADDR.Entry_SecretFlagGet),       'TRG SecretFlagGet2 jal @ 0x8004D984');
  patchExact(slusBuf, r2f(0x8004D988), 0x00451021, 0x00402021,                                 'TRG SecretFlagGet2 move a0,v0 (delay)');
  patchExact(slusBuf, r2f(0x8004D98C), 0x90420020, 0x90420000,                                 'TRG SecretFlagGet2 lbu v0,0(v0)');
  patchExact(slusBuf, r2f(0x8004D9FC), 0x00000000, 0x00402021,                                 'TRG TrigHasGoal2 move a0,v0 @ 0x8004D9FC');
  patchExact(slusBuf, r2f(0x8004DA00), 0x00031840, jalW(THPS1_ADDR.Entry_TrigHasGoal),         'TRG TrigHasGoal2 jal @ 0x8004DA00');
  patchExact(slusBuf, r2f(0x8004DA04), 0x00431021, 0x00602821,                                 'TRG TrigHasGoal2 move a1,v1 (delay)');
  patchExact(slusBuf, r2f(0x8004DA08), 0x8444000C, 0x00402021,                                 'TRG TrigHasGoal2 move a0,v0');

  // Right-size Level Select preview .STR buffers (g_MovieTable[4..15]: STATIC..EDITOR):
  //   All 11 on-disc preview .STRs (5,005 total frames audited!) are 176x48 @ 15fps silent streams,
  //   exactly 5 sectors/frame (10 KB/frame), with absolute peak MDEC VLC output = 15,876 B (PHILLY.STR).
  //   - vlcBufSize (+16): 33,792 -> 16,896 B (+1,020 B safety margin above worst frame, saves 33 KB across 2x buffers)
  //   - ringSec    (+20):     48 ->     16 sectors (32 KB = 3.2 full frames lookahead, saves 64 KB)
  //   Total Movie_AllocBuffers drops 182.8 KB -> 81.5 KB (-101.3 KB!), leaving ~85.8 KB contiguous in Heap[1]
  //   so background FileIO pre-loads (66 KB) coexist simultaneously with looping preview videos with +20 KB free!
  for (let m = 4; m <= 15; m++) {
    const vlcRam  = 0x800C1CB4 + m * 36 + 16;
    const ringRam = 0x800C1CB4 + m * 36 + 20;
    patchExact(slusBuf, r2f(vlcRam),  33792, 16896, `g_MovieTable[${m}].vlcBufSize 33792->16896`);
    patchExact(slusBuf, r2f(ringRam),    48,    16, `g_MovieTable[${m}].ringSec 48->16`, [20]);
  }

  // --- B. Patch levelsel.bin (WAD[33]) AND its uncompressed copy in levelsel.pre (WAD[47] + 0x18)! ---
  console.log('\n=== Aplicando Patches Cirurgicos em levelsel.bin + levelsel.pre ===');
  const lsOff = hedBuf.readUInt32LE(33 * 12 + 4);
  const lsSz  = hedBuf.readUInt32LE(33 * 12 + 8);
  const lsPreOff = hedBuf.readUInt32LE(47 * 12 + 4) + 0x18;
  const lsRelOff = hedBuf.readUInt32LE(34 * 12 + 4);
  const lsRelSz  = hedBuf.readUInt32LE(34 * 12 + 8);
  const lsOrig = origWad.subarray(lsOff, lsOff + lsSz);
  const lsRelSet = parseRelOffsets(origWad.subarray(lsRelOff, lsRelOff + lsRelSz));

  // Verify levelsel.pre + 0x18 matches levelsel.bin verbatim in original backup
  if (!origWad.subarray(lsPreOff, lsPreOff + lsSz).equals(lsOrig)) {
    throw new Error('levelsel.pre + 0x18 does not match levelsel.bin in original backup!');
  }

  const lsMod = Buffer.from(lsOrig);

  function patchLs(off, origVal, newVal, desc) {
    if (lsRelSet.has(off)) {
      console.log(`  [WARN-REL-CHK] levelsel +0x${off.toString(16)} (${desc}) appeared in raw .rel scan (verifying non-relocated imm)`);
    }
    patchExact(lsMod, off, origVal, newVal, `levelsel +0x${off.toString(16)} ${desc}`);
  }

  // 1. Relocate all 13 g_LevelTable references in levelsel.bin -> 0x800E6000
  const lsRelocs = relocateLevelTableRefs(lsMod, lsOrig, 0, lsOrig.length, 'levelsel.bin');
  if (lsRelocs !== 13) throw new Error(`Expected 13 g_LevelTable relocs in levelsel.bin, got ${lsRelocs}`);

  // 2. Expand CLevelRend (300 -> 460 B, sprites[20] @ +300) & hook Instant 2-Burst CD-ROM Loader!
  patchLs(0x0970, 0x2404012C, 0x240401CC, 'CLevelRend new(300 -> 460)');
  // Skip FileIO_Kick (+0x0ABC) because our 5-burst CdRead loader already uploaded all 40 BMPs synchronously;
  // calling FileIO_Kick on an empty queue unconditionally sets active=1 and reads stale playsel ring entries!
  patchLs(0x0ABC, 0x0C0168EE, 0x00000000, 'LevelSel::ctor skip empty FileIO_Kick');
  patchLs(0x287C, 0x263400CC, 0x2634012C, 'CLevelRend sprites +204->+300 (ctor)');
  patchLs(0x28B0, 0x2A62000B, 0x2A620014, 'CLevelRend ctor loop 11->20');
  // Tighten initial preview video countdown (32 -> 10 frames = 0.16s) so bottom FMV starts smoothly right away!
  patchLs(0x2AD4, 0x24030020, 0x2403000A, 'CLevelRend init video delay 32->10 frames');
  // At +0x2AF8: jal Entry_LevelSelFastRend (keeps delay slot +0x2AFC `sw v1, 296(s1)`!) then `b +0x2B7C` (skip 20 FileIO queues!)
  patchLs(0x2AF8, 0x0C0167FF, jalW(THPS1_ADDR.Entry_LevelSelFastRend), 'CLevelRend jal FastRend');
  patchLs(0x2B00, 0x263500F8, 0x1000001E, 'CLevelRend b +0x2B7C (+30 words)');
  patchLs(0x2B04, 0x27B30050, 0x00000000, 'CLevelRend delay nop');
  patchLs(0x2BE4, 0x265000CC, 0x2650012C, 'CLevelRend dtor +204->+300');
  patchLs(0x2C14, 0x2A22000B, 0x2A220014, 'CLevelRend dtor loop 11->20');
  patchLs(0x2DA0, 0x8C4400CC, 0x8C44012C, 'CLevelRend draw +204->+300');
  // Skip now-unused FileIO async polling loop in CLevelRend::Update State 0 (+0x2EA0 -> b +0x2F18)!
  patchLs(0x2EA0, 0x00009821, 0x1000001D, 'CLevelRend::Update skip async poll -> +0x2F18');
  patchLs(0x2EA4, 0x269200CC, 0x00000000, 'CLevelRend::Update delay nop');
  patchLs(0x3048, 0x269000CC, 0x2690012C, 'CLevelRend swap +204->+300');

  // 3. Expand CLevelMap (624 -> 784 B, sprites[20] @ +624) & hook Instant 3-Burst CD-ROM Loader!
  patchLs(0x09B8, 0x24040270, 0x24040310, 'CLevelMap new(624 -> 784)');
  patchLs(0x32B0, 0x265401E8, 0x26540270, 'CLevelMap sprites +488->+624 (ctor)');
  patchLs(0x3314, 0x2A22000B, 0x2A220014, 'CLevelMap ctor loop 11->20');
  // At +0x343C: jal Entry_LevelSelFastMap (keeps delay slot +0x3440 `sw zero, 620(s2)`!) then `b +0x34BC` (skip 20 FileIO queues!)
  patchLs(0x343C, 0x0C0167FF, jalW(THPS1_ADDR.Entry_LevelSelFastMap), 'CLevelMap jal FastMap');
  patchLs(0x3444, 0x26550224, 0x1000001D, 'CLevelMap b +0x34BC (+29 words)');
  patchLs(0x3448, 0x27B40050, 0x00000000, 'CLevelMap delay nop');
  patchLs(0x351C, 0x265001E8, 0x26500270, 'CLevelMap dtor +488->+624');
  patchLs(0x3554, 0x2A22000B, 0x2A220014, 'CLevelMap dtor loop 11->20');
  // Skip now-unused FileIO async polling loop in CLevelMap::Update (+0x3630 -> b +0x36C0)!
  patchLs(0x3630, 0x3C04800D, 0x10000023, 'CLevelMap::Update skip async poll -> +0x36C0');
  patchLs(0x3634, 0x8C8474E4, 0x00000000, 'CLevelMap::Update delay nop');
  patchLs(0x36CC, 0x268501E8, 0x26850270, 'CLevelMap draw1 +488->+624');
  patchLs(0x3724, 0x8C6401E8, 0x8C640270, 'CLevelMap draw2 +488->+624');
  patchLs(0x3818, 0x268501E8, 0x26850270, 'CLevelMap draw3 +488->+624');
  patchLs(0x3BBC, 0x8C4401E8, 0x8C440270, 'CLevelMap draw4 +488->+624');
  patchLs(0x3C00, 0x8C4401E8, 0x8C440270, 'CLevelMap draw5 +488->+624');

  // 4. Hook MoveCursor (+0x12A8..+0x131C) -> interleaved DisplayOrder carousel!
  //    At +0x12A8: jal Entry_LevelSelMoveCursor; nop; beq zero, zero, +0x1320; nop
  //    (Uses relative branch `beq zero, zero, +27` so ZERO overlay relocation needed!)
  patchLs(0x12A8, 0x3C02800E, jalW(THPS1_ADDR.Entry_LevelSelMoveCursor), 'MoveCursor interleaved jal');
  patchLs(0x12AC, 0x8C428278, 0x00000000, 'MoveCursor nop');
  patchLs(0x12B0, 0x00000000, 0x1000001B, 'MoveCursor b +0x1320 (relative +27 words)');
  patchLs(0x12B4, 0x00521021, 0x00000000, 'MoveCursor delay nop');

  // 5. Patch IsLevelUnlocked (+0x3128): route ALL levels 0..19 straight to Career_LevelIsOpen (0x8002597C)!
  patchLs(0x3124, 0x10400009, 0x00000000, 'IsLevelUnlocked skip loop1');
  patchLs(0x3128, 0x2A220008, 0x00000000, 'IsLevelUnlocked skip <8 check');
  patchLs(0x312C, 0x14400007, 0x00000000, 'IsLevelUnlocked fallthrough -> jal 0x8002597c');

  // 6. Hook ShowPct (+0x121C..+0x1220) so ALL 19 career levels (0..9, 11..19) show their % badge cleanly!
  patchLs(0x121C, 0x28420008, jalW(THPS1_ADDR.Entry_LevelSelShowPct), 'LevelSel ShowPct jal');
  patchLs(0x1220, 0x38420001, 0x00000000,                             'LevelSel ShowPct delay nop');

  // 7. Hook LevelSelPct (+0x13F8..+0x1478): on entry v0=skaterProg, a3=levelId, a0=isComp -> a2=pct, branch to +0x147C!
  //    +0x13F8: move a2, a0 (isComp)
  //    +0x13FC: move a0, v0 (skaterProg)
  //    +0x1400: jal Entry_LevelSelPct
  //    +0x1404: move a1, a3 (levelId, delay slot)
  //    +0x1408: beq zero, zero, +0x147C (+28 words)
  //    +0x140C: move a2, v0 (delay slot: a2 = pct!)
  patchLs(0x13F8, 0x1080001A, 0x00803021, 'LevelSelPct move a2, a0 (isComp)');
  patchLs(0x13FC, 0x00003021, 0x00402021, 'LevelSelPct move a0, v0 (skaterProg)');
  patchLs(0x1400, 0x2444000C, jalW(THPS1_ADDR.Entry_LevelSelPct), 'LevelSelPct jal');
  patchLs(0x1404, 0x00881021, 0x00E02821, 'LevelSelPct move a1, a3 (levelId)');
  patchLs(0x1408, 0x94450000, 0x1000001C, 'LevelSelPct b +0x147C (+28 words)');
  patchLs(0x140C, 0x00000000, 0x00403021, 'LevelSelPct move a2, v0 (pct)');

  // 8. Bottom Level Select preview FMV (.STR) RESTORED! (+0x2F7C stays original `beq a0, zero, +0x2FC0` = 0x10800010!)
  //    With g_MovieTable[4..15].ringSec reduced 48->20 (40 KB = 4 full frames), Movie_AllocBuffers uses 122.5 KB
  //    (< 150.8 KB contiguous free Heap[1]) -> real looping bottom preview videos play smoothly on ALL THPS2 levels
  //    with ZERO OOM, while THPS1 levels (videoSlot == 0) display their instant static t1rend BMP cleanly!
  patchLs(0x2F7C, 0x10800010, 0x10800010, 'CLevelRend bottom preview FMV ENABLED (ringSec=20)');

  // Write patched levelsel.bin to BOTH WAD[33] AND levelsel.pre (WAD[47] + 0x18)!
  // Also append s2arrow8.bmp (248 B) & s2arrow9.bmp (248 B) into levelsel.pre's 1,400 B free slack (281,224 -> 281,760 B,
  // SAME 138 sectors, 0 offset shift!) so s2arrow8/9 load in 0.00f with ZERO backward seek and ZERO Heap[1] fragmentation!
  lsMod.copy(wadBuf, lsOff);
  lsMod.copy(wadBuf, lsPreOff);
  const origHed = fs.readFileSync(ORIG_HED_PATH);
  const lpBase = hedBuf.readUInt32LE(47 * 12 + 4);
  const lpOrigSz = origHed.readUInt32LE(47 * 12 + 8);
  const lpSlotSz = origHed.readUInt32LE(48 * 12 + 4) - lpBase;
  const a8Off = origHed.readUInt32LE(477 * 12 + 4), a8Sz = origHed.readUInt32LE(477 * 12 + 8);
  const a9Off = origHed.readUInt32LE(476 * 12 + 4), a9Sz = origHed.readUInt32LE(476 * 12 + 8);
  const a8Data = origWad.subarray(a8Off, a8Off + a8Sz);
  const a9Data = origWad.subarray(a9Off, a9Off + a9Sz);
  const packPreItem = (name, data) => {
    const nLen = (name.length + 1 + 3) & ~3;
    const dLen = (data.length + 3) & ~3;
    const out = Buffer.alloc(nLen + 4 + dLen, 0);
    out.write(name, 0, 'ascii');
    out.writeUInt32LE(data.length >>> 0, nLen);
    data.copy(out, nLen + 4);
    return out;
  };
  const extraPre = Buffer.concat([packPreItem('s2arrow8.bmp', a8Data), packPreItem('s2arrow9.bmp', a9Data)]);
  const lpNewSz = lpOrigSz + extraPre.length;
  if (lpNewSz > lpSlotSz) throw new Error(`levelsel.pre overflow: ${lpNewSz} > ${lpSlotSz}`);
  wadBuf.writeUInt32LE(22, lpBase); // 20 -> 22 archived files!
  extraPre.copy(wadBuf, lpBase + lpOrigSz);
  hedBuf.writeUInt32LE(lpNewSz >>> 0, 47 * 12 + 8);
  console.log(`  [OK] levelsel.bin atualizado em WAD[33] (0x${lsOff.toString(16)}) e levelsel.pre (0x${lsPreOff.toString(16)}, +s2arrow8/9 -> ${lpNewSz}/${lpSlotSz} B, mesmos 138 setores!)`);

  // --- C. Patch options.bin (WAD[37]) & remaining 5 frontend overlays (zero refs left to 0x800B8444..9437!) ---
  console.log('\n=== Aplicando Relocacao g_LevelTable em options.bin e Overlays de Frontend ===');
  const optOff = hedBuf.readUInt32LE(37 * 12 + 4);
  const optSz  = hedBuf.readUInt32LE(37 * 12 + 8);
  const optOrig = origWad.subarray(optOff, optOff + optSz);
  const optMod = Buffer.from(optOrig);
  const optRelocs = relocateLevelTableRefs(optMod, optOrig, 0, optOrig.length, 'options.bin');
  if (optRelocs !== 8) throw new Error(`Expected 8 g_LevelTable relocs in options.bin, got ${optRelocs}`);
  optMod.copy(wadBuf, optOff);
  console.log(`  [OK] options.bin atualizado em WAD[37] (0x${optOff.toString(16)})`);

  // Relocate the 1 remaining g_LevelTable ref (0x800B8450 -> 0x800E600C) in each frontend overlay so
  // 0x800B8444..0x800B943F is 100% dead & safely reusable for Crash B. (Slot 20)!
  for (const [idx, nm, preIdx] of [
    [35, 'multisel.bin', null],
    [39, 'equipsel.bin', 48],
    [41, 'tricksel.bin', null],
    [61, 'playsel.bin',  null],
    [67, 'creedit.bin',  null],
  ]) {
    const o = hedBuf.readUInt32LE(idx * 12 + 4);
    const s = hedBuf.readUInt32LE(idx * 12 + 8);
    const origOv = origWad.subarray(o, o + s);
    // Start from live wadBuf slice to preserve any existing voice/fade patches (e.g. playsel.bin)!
    const modOv = Buffer.from(wadBuf.subarray(o, o + s));
    const n = relocateLevelTableRefs(modOv, origOv, 0, origOv.length, nm);
    if (n !== 1) throw new Error(`Expected 1 g_LevelTable reloc in ${nm}, got ${n}`);
    modOv.copy(wadBuf, o);
    if (preIdx !== null) {
      const preOff = hedBuf.readUInt32LE(preIdx * 12 + 4) + 0x18;
      modOv.copy(wadBuf, preOff);
    }
  }
}

module.exports = {
  THPS1_ADDR,
  DISPLAY_ORDER,
  SLOT_OF_LEVEL,
  UNLOCK_REQS,
  THPS1_DEFS,
  THPS1_GAPS,
  buildThps1ResidentBlock,
  applyThps1EnginePatches,
};
