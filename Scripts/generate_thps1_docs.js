#!/usr/bin/env node
'use strict';

/**
 * Automated Encyclopedic Documentation Generator for THPS1 (SLUS-00860) Extraction & THPS1-in-THPS2 Integration
 *
 * Reads:
 *   - EXTRAIDOS_ARQUIVOS_THPS1/thps1_catalogo_completo.json (all 31 ISO + 669 CD.WAD + 58 .PRE sub-files)
 *   - EXTRAIDOS_ARQUIVOS_THPS1/thps1_iso_layout.xml (exact timestamps & types)
 *   - build/thps1_manifest.json (all 9 levels, 2,301 rails, 68 coins -> $100 Cash, 33 priority THPS1.WAD files)
 *   - tools/thps1_engine_mod.js (interleaved 20-level progression, goals, unlock thresholds, RAM layout)
 *
 * Writes verbatim copies to:
 *   - repo/Docs/MAPA_14_THPS1_ARQUIVOS_E_ENGENHARIA_REVERSA.md
 *   - docs/MAPA_14_THPS1_ARQUIVOS_E_ENGENHARIA_REVERSA.md
 *   - EXTRAIDOS_ARQUIVOS_THPS1/MAPA_COMPLETO_ARQUIVOS_THPS1.md
 */

const fs = require('fs');
const path = require('path');
const { THPS1_ADDR, DISPLAY_ORDER, UNLOCK_REQS, THPS1_DEFS, THPS1_GAPS } = require('./thps1_engine_mod');

const ROOT = path.resolve(__dirname, '..');
const CAT_PATH = path.join(ROOT, 'EXTRAIDOS_ARQUIVOS_THPS1', 'thps1_catalogo_completo.json');
const XML_PATH = path.join(ROOT, 'EXTRAIDOS_ARQUIVOS_THPS1', 'thps1_iso_layout.xml');
const MAN_PATH = path.join(ROOT, 'build', 'thps1_manifest.json');

const cat = JSON.parse(fs.readFileSync(CAT_PATH, 'utf8'));
const man = JSON.parse(fs.readFileSync(MAN_PATH, 'utf8'));
const xmlRaw = fs.readFileSync(XML_PATH, 'utf8');

const xmlMeta = new Map();
for (const m of xmlRaw.matchAll(/<file\s+name="([^"]+)"\s+type="([^"]+)"\s+date="([^"]+)"/g)) {
  const dt = m[3];
  const fmtDt = dt.length >= 14
    ? `${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)} ${dt.slice(8,10)}:${dt.slice(10,12)}:${dt.slice(12,14)}`
    : dt;
  xmlMeta.set(m[1].toUpperCase(), { type: m[2], date: fmtDt });
}

const fmtBytes = (n) => `${n.toLocaleString('pt-BR')} B`;
const fmtMB = (n) => `${(n / 1048576).toFixed(2).replace('.', ',')} MB`;
const hex = (n, w = 8) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(w, '0');

const ISO_ROLES = {
  'SYSTEM.CNF':   'Arquivo de boot da BIOS PS1: aponta para `cdrom:\\SLUS_008.60;1`, configura `TCB=4`, `EVENT=10`, `STACK=801FFF00`.',
  'SLUS_008.60':  'Executável principal `PS-X EXE` (MIPS R3000A) do THPS1 NTSC-U (841.728 B). Contém motor Neversoft v1, tabelas das 9 fases, física, GTE/SPU e lógica de carreira.',
  'CD.HED':       'Índice em ASCII plaintext (4-byte aligned + offset u32 + size u32) dos 669 arquivos empacotados em `CD.WAD` (sem hash!).',
  'CD.WAD':       'Contêiner principal de ativos (26,63 MB, alinhado a setores de 2.048 B) contendo todas as 9 fases, skatistas, decks, fontes, áudio `.VAB`, UI e `.PRE`.',
  'ATVILOGO.STR': 'Vídeo FMV MDEC+XA de abertura: logo da **Activision**.',
  'LOGO.STR':     'Vídeo FMV MDEC+XA de abertura: logo da **Neversoft** (olho perfurado).',
  'INTRO.STR':    'Vídeo FMV MDEC+XA principal de introdução do jogo (*Intro Montage*).',
  '411.STR':      'Vídeo bônus desbloqueável da revista em vídeo **411VM**.',
  'BAILS.STR':    'Vídeo bônus desbloqueável de quedas reais (*Neversoft Bails Tape*).',
  'AARON.STR':    'Vídeo bônus de créditos / homenagem especial (*Aaron / Neversoft Crew*).',
  'BURNQUIS.STR': 'Vídeo final de carreira do skatista **Bob Burnquist**.',
  'CAMPBELL.STR': 'Vídeo final de carreira do skatista **Kareem Campbell**.',
  'GLIFBERG.STR': 'Vídeo final de carreira do skatista **Rune Glifberg**.',
  'HAWK.STR':     'Vídeo final de carreira do skatista **Tony Hawk**.',
  'LASEK.STR':    'Vídeo final de carreira do skatista **Bucky Lasek**.',
  'MUSKA.STR':    'Vídeo final de carreira do skatista **Chad Muska**.',
  'REYNOLDS.STR': 'Vídeo final de carreira do skatista **Andrew Reynolds**.',
  'ROWLEY.STR':   'Vídeo final de carreira do skatista **Geoff Rowley**.',
  'STEAMER.STR':  'Vídeo final de carreira da skatista **Elissa Steamer**.',
  'THOMAS.STR':   'Vídeo final de carreira do skatista **Jamie Thomas**.',
  'DK.STR':       'Trilha sonora CD-XA multi-canal: **Dead Kennedys — *Police Truck*** (e faixas intercaladas).',
  'ERNIES.STR':   'Trilha sonora CD-XA multi-canal: **The Ernies — *Here & Now*** (e faixas intercaladas).',
  'EVENRUDE.STR': 'Trilha sonora CD-XA multi-canal: **Even Rude — *Vilified*** (e faixas intercaladas).',
  'GOLDFING.STR': 'Trilha sonora CD-XA multi-canal: **Goldfinger — *Superman*** (clássico tema do Warehouse!).',
  'PRIMUS.STR':   'Trilha sonora CD-XA multi-canal: **Primus — *Jerry Was a Race Car Driver*** (e faixas intercaladas).',
  'SPEED.STR':    'Trilha sonora CD-XA multi-canal: **Speedealer — *Screamer / Nothing to Me***.',
  'ST.STR':       'Trilha sonora CD-XA multi-canal: **Suicidal Tendencies — *Cyco Vision***.',
  'SUICIDE.STR':  'Trilha sonora CD-XA multi-canal: **The Suicide Machines — *New Girl***.',
  'UNSANE.STR':   'Trilha sonora CD-XA multi-canal: **Unsane — *Committed***.',
  'VANDALS.STR':  'Trilha sonora CD-XA multi-canal: **The Vandals — *Euro-Barge***.',
};

function describeWadFile(e) {
  const n = e.name.toLowerCase();
  const ext = path.extname(n);
  if (ext === '.trg') return 'Script/Mapa de nós `_TRG v2.0` (spawns, trilhos `Type 10/11`, moedas `Type 5`, letras S-K-A-T-E, fita secreta, objetivos e gatilhos).';
  if (ext === '.pre') return `Pacote Neversoft \`.PRE\` contendo **${(e.preItems || []).length} sub-arquivos** empacotados contiguamente para carregamento rápido em RAM.`;
  if (ext === '.vab') return 'Banco de áudio SPU-ADPCM 4-bit Sony (`pBAV`: VH cabeçalho + VB ondas) para efeitos sonoros em SPU RAM.';
  if (ext === '.fnt') return 'Fonte bitmap proprietária Neversoft (glifos 4bpp + métricas de largura e tabela ASCII).';
  if (ext === '.rec') return 'Replay de demonstração pré-gravado (*Attract Mode* / câmera demo da fase).';
  if (ext === '.txt') return 'Arquivo de texto/configuração interno (ex.: lista de créditos ou tabela auxiliar).';
  if (ext === '.bmp') {
    if (n.startsWith('load')) return 'Tela de carregamento (*Loading Screen*) 8-bit indexado (256 cores) da fase.';
    if (n.startsWith('levsel')) return 'Miniatura/preview 8-bit da fase na tela de Seleção de Fases do THPS1.';
    if (n.startsWith('deck') || e.category.includes('Shapes_Decks')) return 'Textura 8-bit de *shape* (*deck*) de skate exibida na loja/seleção e aplicada sob o skate.';
    if (e.category.includes('Rodas_Wheels')) return 'Textura/ícone 8-bit de roda (*wheel*) na customização de equipamentos.';
    if (e.category.includes('Trucks')) return 'Textura/ícone 8-bit de *truck* metálico na customização de equipamentos.';
    if (e.category.includes('HUD_Icones')) return 'Sprite/ícone 8-bit de HUD, medalha, fita VHS ou indicador de interface.';
    return 'Imagem/fundo 8-bit indexado (`.BMP`) da interface de menus do THPS1.';
  }
  if (ext === '.psx') {
    if (n.endsWith('_l.psx') || n.endsWith('l2.psx')) return 'Biblioteca de texturas 4bpp/8bpp BGR555 + CLUTs da fase (`1P` ou `2P` *split-screen*).';
    if (n.endsWith('_o.psx') || n.endsWith('o2.psx')) return 'Objetos 3D dinâmicos/destrutíveis da fase (caixas, vidros, sinos, placas, rampas móveis).';
    if (n.endsWith('_2.psx')) return 'Geometria 3D simplificada da fase otimizada para modo 2 Jogadores (*Split-Screen*).';
    if (n.endsWith('_h.psx')) return 'Geometria 3D auxiliar de alta resolução / detalhes arquitetônicos adicionais da fase.';
    if (n.endsWith('_t.psx')) return 'Geometria/texturas auxiliares de topo/teto/transparências da fase.';
    if (n.startsWith('c_')) return 'Modelo 3D `.PSX` de veículo dinâmico em movimento (`taxi`, `van`, `police`, `cable car`).';
    if (n === 'items.psx') return 'Modelos 3D compartilhados de coletáveis (letras `S-K-A-T-E`, fitas secretas, moedas giratórias).';
    if (n === 'bits.psx') return 'Partículas 3D e fragmentos compartilhados (estilhaços de vidro, faíscas, madeira de caixa).';
    if (n === 'skmedals.psx') return 'Modelos 3D das medalhas de Ouro, Prata e Bronze exibidas no pódio de competições.';
    if (e.category.includes('Frontend_Selecao')) return 'Modelo 3D `.PSX` de alta resolução do skatista para a tela de Seleção de Personagem.';
    if (e.category.includes('Multiplayer_2P')) return 'Modelo 3D `.PSX` otimizado (Lo-LOD) do skatista para modo 2 Jogadores.';
    if (e.category.includes('Singleplayer_1P')) return 'Modelo 3D `.PSX` principal do skatista para gameplay Singleplayer.';
    return 'Geometria 3D principal (`SuperSectors` chunk `0x0A`) + colisão da fase no formato Neversoft `0x00020004`.';
  }
  return 'Ativo binário auxiliar do motor Neversoft THPS1.';
}

const ALL_20_SLOTS = [
  { slot: 0,  id: 0,  game: 'THPS2', name: 'The Hangar',   loc: 'Mullet Falls, MT',      type: 'Carreira (10 metas)',  req: 'Desbloqueada no início (`$0`)' },
  { slot: 1,  id: 11, game: 'THPS1', name: 'Warehouse',    loc: 'Woodland Hills, CA',    type: 'Carreira (10 metas)',  req: '`$1.000` acumulados' },
  { slot: 2,  id: 1,  game: 'THPS2', name: 'School II',    loc: 'Southern California',   type: 'Carreira (10 metas)',  req: '`$2.000` acumulados' },
  { slot: 3,  id: 12, game: 'THPS1', name: 'School',       loc: 'Miami, FL',             type: 'Carreira (10 metas)',  req: '`$3.500` acumulados' },
  { slot: 4,  id: 2,  game: 'THPS2', name: 'Marseille',    loc: 'France',                type: 'Competição (Medalha)', req: '`$5.500` acumulados' },
  { slot: 5,  id: 13, game: 'THPS1', name: 'Mall',         loc: 'New York, NY',          type: 'Carreira (10 metas)',  req: '`1` Medalha conquistada' },
  { slot: 6,  id: 3,  game: 'THPS2', name: 'NY City',      loc: 'New York',              type: 'Carreira (10 metas)',  req: '`$9.500` acumulados' },
  { slot: 7,  id: 14, game: 'THPS1', name: 'Skate Park',   loc: 'Chicago, IL',           type: 'Competição (Medalha)', req: '`$13.500` acumulados' },
  { slot: 8,  id: 4,  game: 'THPS2', name: 'Venice Beach', loc: 'California',            type: 'Carreira (10 metas)',  req: '`2` Medalhas conquistadas' },
  { slot: 9,  id: 15, game: 'THPS1', name: 'Downtown',     loc: 'Minneapolis, MN',       type: 'Carreira (10 metas)',  req: '`$21.000` acumulados' },
  { slot: 10, id: 5,  game: 'THPS2', name: 'Skatestreet',  loc: 'Ventura, CA',           type: 'Competição (Medalha)', req: '`$25.000` acumulados' },
  { slot: 11, id: 16, game: 'THPS1', name: 'Downhill Jam', loc: 'Phoenix, AZ',           type: 'Carreira (10 metas)',  req: '`3` Medalhas conquistadas' },
  { slot: 12, id: 6,  game: 'THPS2', name: 'Philadelphia', loc: 'Pennsylvania',          type: 'Carreira (10 metas)',  req: '`$34.000` acumulados' },
  { slot: 13, id: 17, game: 'THPS1', name: 'Burnside',     loc: 'Portland, OR',          type: 'Competição (Medalha)', req: '`$42.000` acumulados' },
  { slot: 14, id: 7,  game: 'THPS2', name: 'The Bullring', loc: 'Mexico',                type: 'Competição (Medalha)', req: '`4` Medalhas conquistadas' },
  { slot: 15, id: 18, game: 'THPS1', name: 'Streets',      loc: 'San Francisco, CA',     type: 'Carreira (10 metas)',  req: '`5` Medalhas conquistadas' },
  { slot: 16, id: 8,  game: 'THPS2', name: 'Chopper Drop', loc: 'Hawaii (Bônus)',        type: 'Carreira Bônus',       req: '`$55.000` acumulados' },
  { slot: 17, id: 19, game: 'THPS1', name: 'Roswell',      loc: 'New Mexico (Área 51)',  type: 'Competição (Medalha)', req: '`$60.000` acumulados' },
  { slot: 18, id: 9,  game: 'THPS2', name: 'Skate Heaven', loc: 'Secret Level (Bônus)',  type: 'Carreira Bônus',       req: '`6` Medalhas conquistadas' },
  { slot: 19, id: 10, game: 'THPS2', name: 'Custom Park',  loc: 'Park Editor (`sked`)',  type: 'Free Skate / Single',  req: 'Sempre disponível fora da Carreira' },
];

const preEntries = cat.wadEntries.filter(e => Array.isArray(e.preItems) && e.preItems.length > 0);
const totalPreSubFiles = preEntries.reduce((a, e) => a + e.preItems.length, 0);
const totalIsoBytes = cat.isoFiles.reduce((a, f) => a + f.size, 0);

// Group WAD entries by normalized category path
const byCat = new Map();
for (const e of cat.wadEntries) {
  const c = e.category.replace(/\\/g, '/');
  if (!byCat.has(c)) byCat.set(c, []);
  byCat.get(c).push(e);
}
const sortedCats = [...byCat.keys()].sort();

const lines = [];
const push = (...s) => lines.push(...s);

push(
`# 🏛️ MAPA 14 — Enciclopédia Forense Completa de *Tony Hawk's Pro Skater 1* (\`SLUS-00860\`) & Integração Intercalada das 9 Fases no Motor do THPS2

> **Disco Analisado:** *Tony Hawk's Pro Skater (USA / NTSC-U \`SLUS-00860\`)* — Neversoft / Activision (Agosto de 1999)  
> **Pasta de Extração Categorizada Local:** \`EXTRAIDOS_ARQUIVOS_THPS1/\`  
> **Escopo Documentado:** **31 arquivos da raiz da ISO** + **669 arquivos internos do \`CD.WAD\`** + **${totalPreSubFiles} sub-arquivos desempacotados dos 6 pacotes \`.PRE\`** + **arquitetura binária completa da integração das 9 fases do THPS1 intercaladas no Modo Carreira do THPS2 (\`SLUS-01066\`)**.

---

## 1. Visão Geral Didática: Como o Disco do THPS1 é Construído

Se você já explorou o [MAPA 01](MAPA_01_MEMORIA_E_EXECUTAVEL.md) e o [MAPA 06](MAPA_06_TEXTURAS_FONTES_E_WAD.md) do **THPS2**, vai reconhecer imediatamente o "DNA" da engine da Neversoft no **THPS1** — mas com **três diferenças arquiteturais fascinantes** que explicam por que os dois jogos são irmãos quase gêmeos e, ao mesmo tempo, exigem engenharia cirúrgica para rodarem juntos no PlayStation 1:

| Característica Técnica | *Tony Hawk's Pro Skater 1* (\`SLUS-00860\`, 1999) | *Tony Hawk's Pro Skater 2* (\`SLUS-01066\`, 2000) | Impacto na Integração THPS1 → THPS2 |
| :--- | :--- | :--- | :--- |
| **Tamanho Total do Disco** | **31 arquivos na raiz** (~${fmtMB(totalIsoBytes)} de dados úteis) | **48 arquivos Redump** + \`VOICES.DAT\` + **\`THPS1.WAD\`** (50º arquivo) | Preserva 48/48 LBAs Redump do THPS2 sem mover 1 setor original! |
| **Executável \`PS-X EXE\`** | \`SLUS_008.60\` (\`841.728 B\`) | \`SLUS_010.66\` (\`864.256 B\`) | Motor residente MIPS de 20 fases em \`0x800E6000..0x800EAFFF\`. |
| **Índice \`CD.HED\`** | **ASCII em texto puro** (\`15.461 B\`, nome \`\\0\` alinhado a 4 B + offset + size) | **Hashes Neversoft 32-bit** (\`0x80053F10\`, 12 B/entrada, sem nomes) | Extração do THPS1 revela 100% dos 669 nomes reais de fábrica! |
| **Contêiner \`CD.WAD\`** | \`26.630.144 B\` (**669 arquivos**) | \`86.173.696 B\` (**1.531 arquivos**) | **Descoberta forense:** 43 \`.PSX\` do THPS1 já estão idênticos em \`CD.WAD[1127..1183]\` do THPS2! |
| **Trilha Sonora** | **10 arquivos \`.STR\` separados** (\`DK.STR\`, \`GOLDFING.STR\`, \`PRIMUS.STR\`...) | **1 arquivo \`COMPILED.XA\`** de 8 canais intercalados | Hook em \`XA_GetLevelTrack @ 0x80038C98\` (\`andi v1,v1,0xF\`) toca faixas reais do THPS2 nas 9 fases! |
| **Geometria 3D \`.PSX\`** | Versão \`0x00020004\` com \`SuperSectors\` (chunk \`0x0A\`), faces 32 B | Versão \`0x00020004\` — **100% compatível no nível da GPU/GTE!** | As malhas e texturas 4bpp/8bpp das 9 fases rodam nativamente a 60 FPS no THPS2! |
| **Gatilhos \`.TRG v2.0\`** | **Trilhos \`Type 10/11\` têm +6 B (\`Angles\`) + \`0xFFFF\`**; moedas giratórias \`Type 5 (21/22/23)\` | **Trilhos \`Type 10/11\` sem \`Angles\`/terminador**; dinheiro \`Type 5 (26 = $100)\` | \`Scripts/port_thps1_levels.js\` converte **2.301 trilhos** + **68 nós de moedas → \`$100\` Cash**! |
| **Fases do Modo Carreira** | **9 fases** (6 regulares com 5 metas cada + 3 competições de medalhas) | **10 fases** (5 regulares com 10 metas + 3 comp. + 2 bônus) + Custom Park | **19 fases jogáveis intercaladas** (THPS2 ↔ THPS1) + Custom Park! |

\`\`\`mermaid
flowchart TB
    ISO["💿 Tony Hawk's Pro Skater (USA) .BIN/.CUE<br/>SLUS-00860 (1999)"] --> DUMP["dumpsxiso -> 01_ISO_Raiz/ (31 arquivos)"]
    DUMP --> EXT["Scripts/extract_thps1.js<br/>Parser CD.HED ASCII + Desempacotador .PRE"]
    EXT --> TREE["📂 EXTRAIDOS_ARQUIVOS_THPS1/<br/>669 arquivos do CD.WAD + 58 sub-arquivos .PRE<br/>organizados em 9 categorias / 25 subpastas"]
    TREE --> PORT["Scripts/port_thps1_levels.js + mod_thps1_custom_objects.js<br/>• Converte 2.301 trilhos .TRG + 68 moedas -> $100 Cash + 333 remapes SFX/Shatter<br/>• Esculpe 6 objetos 3D satiricos (fl=0x2003) nos sk*_o.psx<br/>• Injeta 30 coletaveis Type 5 subtype 33 (5 por fase regular, Mall #3/#4 auditados)<br/>• Gera 18 BMPs Level Select + 3 telas Comp (t1comp0..2.bmp) + 60 metas + 24 Gaps"]
    PORT --> WAD["📦 THPS1.WAD (50º arquivo da ISO)<br/>${fmtMB(man.totalBytes)} • ${man.totalSectors} setores • ${man.totalFiles} arquivos prioritários"]
    WAD --> ENG["⚡ Motor Residente MIPS (0x800E6000..0x800EC7FF)<br/>• g_ExtLevelTable[20] (60 metas) + g_Thps1GapList[24] + CASHART @ 0x800EB000<br/>• Hook_CdWadFallback + Entry_CompLoadBmp + FastBurst 1-Visita + Fade 2×<br/>• 70+13+8 relocações + Carrossel Intercalado 19 fases"]
\`\`\`

---

## 2. Estrutura de Pastas Criada em \`EXTRAIDOS_ARQUIVOS_THPS1/\`

Todos os **31 arquivos da raiz**, **669 arquivos do \`CD.WAD\`** e **${totalPreSubFiles} sub-arquivos dos 6 \`.PRE\`** foram extraídos e categorizados automaticamente por [\`Scripts/extract_thps1.js\`](../Scripts/extract_thps1.js):

| Subpasta dentro de \`EXTRAIDOS_ARQUIVOS_THPS1/\` | Qtd. Arquivos | Conteúdo |
| :--- | :---: | :--- |
| \`01_ISO_Raiz/\` | **31** | Imagem ISO bruta extraída (\`SYSTEM.CNF\`, \`SLUS_008.60\`, \`CD.HED\`, \`CD.WAD\`, 27 \`.STR\` + \`license_data.dat\`). |
| \`02_Fases_do_Jogo/01_Warehouse_WoodlandHills/\` | **6** | Fase 1 (*Warehouse*): 4 \`.PSX\` + \`skware_t.trg\` + \`load_war.bmp\`. |
| \`02_Fases_do_Jogo/02_School_Miami/\` | **7** | Fase 2 (*School*): 5 \`.PSX\` + \`skschl_t.trg\` + \`load_sch.bmp\`. |
| \`02_Fases_do_Jogo/03_Mall_NewYork/\` | **8** | Fase 3 (*Mall*): 6 \`.PSX\` + \`skmall_t.trg\` + \`load_mal.bmp\`. |
| \`02_Fases_do_Jogo/04_SkatePark_Chicago_Comp/\` | **7** | Fase 4 (*Skate Park Chicago — Comp*): 5 \`.PSX\` + \`skvans_t.trg\` + \`loadcp1.bmp\`. |
| \`02_Fases_do_Jogo/05_Downtown_Minneapolis/\` | **8** | Fase 5 (*Downtown*): 6 \`.PSX\` + \`skdown_t.trg\` + \`load_dow.bmp\`. |
| \`02_Fases_do_Jogo/06_DownhillJam_Phoenix/\` | **8** | Fase 6 (*Downhill Jam*): 6 \`.PSX\` + \`skjam_t.trg\` + \`load_dhj.bmp\`. |
| \`02_Fases_do_Jogo/07_Burnside_Portland_Comp/\` | **6** | Fase 7 (*Burnside — Comp*): 4 \`.PSX\` + \`skburn_t.trg\` + \`loadcp2.bmp\`. |
| \`02_Fases_do_Jogo/08_Streets_SanFrancisco/\` | **8** | Fase 8 (*Streets San Francisco*): 6 \`.PSX\` + \`sksf_t.trg\` + \`load_san.bmp\`. |
| \`02_Fases_do_Jogo/09_Roswell_NewMexico_Comp/\` | **8** | Fase 9 (*Roswell — Comp*): 6 \`.PSX\` + \`skros_t.trg\` + \`loadcp3.bmp\`. |
| \`02_Fases_do_Jogo/10_Veiculos_e_Objetos_Compartilhados/\` | **7** | Veículos (\`c_taxi\`, \`c_van\`, \`c_police\`, \`c_cable\`) + \`items.psx\`, \`bits.psx\`, \`skmedals.psx\`. |
| \`03_Skatistas_Modelos_3D/Singleplayer_1P/\` | **12** | Modelos 3D \`.PSX\` de gameplay dos 10 pros + Officer Dick + Private Carrera. |
| \`03_Skatistas_Modelos_3D/Frontend_Selecao/\` | **12** | Modelos 3D \`.PSX\` de alta resolução exibidos na tela de Seleção de Skatistas. |
| \`03_Skatistas_Modelos_3D/Multiplayer_2P/\` | **9** | Modelos 3D \`.PSX\` otimizados (Lo-LOD) para tela dividida (*Split-Screen*). |
| \`04_Audio_Bancos_VAB/\` | **10** | Todos os 10 bancos de efeitos sonoros SPU-ADPCM (\`skate.vab\`, \`ware.vab\`, \`school.vab\`, etc.). |
| \`05_Pacotes_PRE/Arquivos_PRE_Originais/\` | **6** | Os 6 pacotes \`.PRE\` originais do \`CD.WAD\`. |
| \`05_Pacotes_PRE/Desempacotados/\` | **${totalPreSubFiles}** | Todos os ${totalPreSubFiles} sub-arquivos desempacotados de cada \`.PRE\` em pastas individuais. |
| \`06_Fontes_FNT/\` | **11** | Todas as 11 fontes bitmap Neversoft (\`.FNT\`) usadas no HUD, menus e créditos. |
| \`07_Imagens_UI_e_Equipamentos_BMP/Menus_e_Fundos/\` | **25** | Fundos de tela, painéis de menu, logos e molduras. |
| \`07_Imagens_UI_e_Equipamentos_BMP/Selecao_de_Fases/\` | **17** | Miniaturas \`levsel0..9.bmp\` e elementos visuais da tela de Seleção de Fases. |
| \`07_Imagens_UI_e_Equipamentos_BMP/Telas_de_Loading/\` | **7** | Imagens de carregamento gerais e telas de transição. |
| \`07_Imagens_UI_e_Equipamentos_BMP/HUD_Icones_e_Medalhas/\` | **39** | Ícones de HUD, fitas, botões do controle PS1, medalhas e indicadores. |
| \`07_Imagens_UI_e_Equipamentos_BMP/Shapes_Decks/\` | **369** | Toda a biblioteca de 369 *decks* (shapes) de marcas licenciadas de 1999! |
| \`07_Imagens_UI_e_Equipamentos_BMP/Rodas_Wheels/\` | **60** | Todos os 60 conjuntos de rodas (*wheels*) do Skate Shop do THPS1. |
| \`07_Imagens_UI_e_Equipamentos_BMP/Trucks/\` | **6** | Todos os 6 modelos de *trucks* metálicos. |
| \`08_Demos_Replays_REC/\` | **10** | Os 10 arquivos \`.REC\` de demonstração automática (*Attract Mode*). |
| \`09_Textos_e_Outros/\` | **3** | Arquivos auxiliares (\`credits.txt\`, tabelas de manobras/texto). |

---

## 3. Catálogo Completo dos 31 Arquivos da Raiz da ISO (\`01_ISO_Raiz/\`)

| # | Arquivo | Tipo ISO | Data Original (1999) | Tamanho | Papel no Jogo |
| :---: | :--- | :---: | :---: | :---: | :--- |`);

cat.isoFiles.forEach((f, idx) => {
  const m = xmlMeta.get(f.name.toUpperCase()) || { type: 'data', date: '—' };
  const role = ISO_ROLES[f.name.toUpperCase()] || 'Arquivo de mídia/sistema do disco PS1.';
  push(`| ${idx + 1} | \`${f.name}\` | \`${m.type}\` | \`${m.date}\` | ${fmtBytes(f.size)} (${fmtMB(f.size)}) | ${role} |`);
});

push(`
> **Curiosidade histórica de engenharia:** repare nos 10 arquivos \`.STR\` de ~43,8 MB (\`DK.STR\`, \`GOLDFING.STR\`, \`PRIMUS.STR\`, etc.). Diferente do THPS2 — que consolidou toda a trilha sonora em um único \`COMPILED.XA\` de 8 canais —, o THPS1 armazenava a trilha em múltiplos arquivos Mode 2 Form 2 multi-canal separados na raiz do disco!

---

## 4. A Descoberta Forense em \`CD.WAD[1127..1183]\` & O Compacto \`THPS1.WAD\`

Ao cruzar cada arquivo extraído do THPS1 com o \`CD.WAD\` comercial do THPS2 (\`originals_backup/CD.WAD\`), fizemos uma **descoberta arqueológica impressionante**:

> 🔎 **A Neversoft deixou resquícios de TODAS as 9 fases do THPS1 escondidos dentro do disco retail de THPS2 (\`CD.WAD[1127..1183]\`)**, provavelmente usados como bancos de teste durante o desenvolvimento do motor do THPS2!

Porém, **não era possível simplesmente apontar o THPS2 para essas sobras originais**, por três motivos críticos provados byte a byte:
1. **Todos os 9 \`.TRG\` deixados pela Neversoft em \`CD.WAD[1127..1183]\` estavam SEM conversão** (ainda continham moedas THPS1 \`subtype 21/22/23\` em vez de \`$100 Cash\`, e trilhos no formato antigo!).
2. **4 modelos \`.PSX\` diferiam da versão final USA do THPS1** (\`skware.psx\`, \`skware_2.psx\`, \`skware_l.psx\`, \`skschl.psx\`), **\`skvans_t.psx\`** (Skate Park Chicago) **estava ausente**, e **\`c_cable.psx\`** no THPS2 tinha apenas 1 textura placeholder em vez das 11 texturas reais do bonde de San Francisco.
3. **Os outros 43 arquivos \`.PSX\` eram 100% idênticos bit-a-bit ao THPS1 USA!**

### Solução Cirúrgica: Deduplicação + Prioridade Absoluta em \`Hook_CdWadFallback\`
Em vez de duplicar 7,7 MB de geometria já presente no disco, [\`Scripts/port_thps1_levels.js\`](../Scripts/port_thps1_levels.js) + [\`Scripts/mod_thps1_custom_objects.js\`](../Scripts/mod_thps1_custom_objects.js) deduplicam automaticamente os \`.PSX\` idênticos e empacotam em **\`THPS1.WAD\`** (50º arquivo da ISO, imediatamente após \`VOICES.DAT\`, **zero deslocamento em 48/48 arquivos Redump**) **apenas os ${man.totalFiles} arquivos novos, esculpidos ou divergentes** (**\`${fmtMB(man.totalBytes)}\` / \`${man.totalSectors} setores\`**):
- **18 BMPs de Level Select** (\`t1rend00..08.bmp\` \`176×48\` + \`t1levl00..08.bmp\` \`212×52\`, posicionados **contiguamente nos setores \`0..98\` de \`THPS1.WAD\`** para carregamento em **1 única visita contígua** via \`FastBurst\`!),
- **9 arquivos \`.TRG\` integralmente convertidos** (2.301 trilhos + 68 moedas → \`$100 Cash\` + **30 coletáveis 3D \`Type 5 subtype 33\` injetados** — 5 por fase regular, com Malas #3/#4 de *Mall NY* auditadas em espaço aberto contra os 11.126 triângulos — + **333 remapes cirúrgicos SFX/Shatter** (\`84\` shatters + \`249\` SFX) + \`C_Cable → C_Cabl1\`),
- **6 arquivos \`sk*_o.psx\` com novos objetos 3D geométricos esculpidos** (\`skware_o\`, \`skschl_o\`, \`skmall_o\`, \`skdown_o\`, \`skjam_o\`, \`sksf_o\`: \`+2,8 KB..+3,9 KB\` cada, todos em \`fl = 0x2003\` full-quad + texturas \`64×48\` 4-bit 16 cores),
- **4 \`.PSX\` divergentes do THPS1 USA** (\`skware.psx\`, \`skware_2.psx\`, \`skware_l.psx\`, \`skschl.psx\`),
- **2 \`.PSX\` exclusivos ausentes no THPS2** (\`skvans_t.psx\` + \`c_cabl1.psx\` com as 11 texturas reais do bonde de São Francisco),
- **3 telas oficiais de competição \`512×240\` 8bpp** (\`t1comp0.bmp\` *Skate Park Chicago*, \`t1comp1.bmp\` *Burnside* e \`t1comp2.bmp\` *Roswell*, \`123.960 B\` / \`61\` set. cada, despachadas por \`Entry_CompLoadBmp @ 0x80022E2C\`).

No executável, \`Hook_CdWadFallback @ 0x80054190\` consulta **\`g_Thps1Hed\` (${man.totalFiles} entradas) PRIMEIRO** como sobreposição prioritária (sem nunca chamar \`CdSearchFile\` em runtime — calcula \`thps1BaseLba = g_VoicesBaseLba + 1174\` diretamente da RAM!) e só cai para o \`CD.HED\` original quando o arquivo não está na tabela prioritária.

### Tabela dos ${man.totalFiles} Arquivos Empacotados em \`THPS1.WAD\`

| # | Arquivo | Hash Neversoft | Offset em \`THPS1.WAD\` | Tamanho | Setores | Função |
| :---: | :--- | :---: | :---: | :---: | :---: | :--- |`);

man.entries.forEach((en, idx) => {
  let role = 'Override/Asset THPS1';
  if (en.name.startsWith('t1rend')) role = 'Banner 3D/Render `176×48` 8bpp no carrossel do Level Select';
  else if (en.name.startsWith('t1levl')) role = 'Cartão/Mapa `212×52` 8bpp no painel direito do Level Select';
  else if (en.name.startsWith('t1comp')) role = 'Tela oficial de competição `512×240` 8bpp (`123.960 B`, despachada por `Entry_CompLoadBmp`)';
  else if (en.name.endsWith('.trg')) role = '`.TRG v2.0` convertido (trilhos THPS2 + moedas → `$100` Cash + 5 coletáveis 3D + remapeamento SFX/Shatter)';
  else if (en.name.endsWith('_o.psx')) role = 'Objetos da fase + **Novo Objeto 3D Geométrico Satírico esculpido (`fl=0x2003`)**';
  else if (en.name === 'c_cabl1.psx') role = 'Bonde de San Francisco (11 texturas originais THPS1)';
  else if (en.name === 'skvans_t.psx') role = 'Geometria auxiliar de Skate Park Chicago (ausente no THPS2)';
  else role = 'Geometria/Texturas THPS1 USA (override sobre sobra divergente do THPS2)';
  push(`| ${idx + 1} | \`${en.name}\` | \`${en.hashHex.toUpperCase()}\` | \`${hex(en.relOffset)}\` | ${fmtBytes(en.size)} | ${en.sectors} | ${role} |`);
});

push(`
---

## 5. Anatomia Binária da Conversão \`.TRG v2.0\` (Trilhos + Moedas → \`$100\` Cash)

### 5.1 Conversão de Trilhos (\`Type 10 RailDef\` & \`Type 11 RailPoint\`) — **2.301 / 2.301 Convertidos**
Na engine Neversoft, todo corrimão ou borda de *grind* é uma cadeia ligada de nós \`Type 10\` e \`Type 11\` no arquivo \`.TRG\`. Entre o THPS1 e o THPS2, a estrutura binária desses nós encolheu em 8 bytes:

\`\`\`text
[THPS1 Type 10/11] u16 type | u16 nLinks | u16 links[nLinks] | pad4 | i32 x,y,z | u16 angles[3] (6 B) | u16 terrain | u16 0xFFFF
[THPS2 Type 10/11] u16 type | u16 nLinks | u16 links[nLinks] | pad4 | i32 x,y,z | u16 terrain
\`\`\`

- Remover os 6 bytes de \`angles[3]\` e o terminador \`0xFFFF\` exige cuidado cirúrgico com o **alinhamento absoluto de 4 bytes** (\`curOff % 4\`) de **todos** os nós subsequentes no \`.TRG\` (especialmente nós \`Type 1, 2, 4, 5, 13, 14, 15\` que possuem vetores \`int32\`). Nosso conversor preserva a paridade exata \`(offset % 4)\` de todos os nós não-trilho e valida 100% da tabela de offsets após a reconstrução!

### 5.2 Conversão de Todas as Moedas do THPS1 em Notas de \`$100\` do THPS2 (\`Type 5 PowerUp\`)
- No **THPS1**, cada moeda flutuante giratória é um nó \`Type 5\` com subtipo **\`21\`** (Bronze), **\`22\`** (Prata) ou **\`23\`** (Ouro).
- No **THPS2**, desmontando \`PowerUp_Spawn @ 0x8004BA5C\` e \`Career_GetCashBitIndex @ 0x80024E4C\`, provamos que o motor lê:
  - **Byte baixo** (\`lbu s2, 0(s0)\`): tipo do item — **\`26\` (\`0x1A\`) = Nota de \`$100\` Cash** (\`case 26 @ 0x80035C10 → 0x80035E94\`);
  - **Byte alto** (\`lhu v0, 2(v1); srl v0, v0, 8\`): índice único de persistência do bit de coleta (\`coinIdx = 0..63\`) salvo no array \`cashBits[2]\` de cada fase!
- Portanto, ao reescrever cada moeda para **\`((coinIdx << 8) | 26)\`**, cada moeda do THPS1 nasce automaticamente como uma **nota de \`$100\` nativa do THPS2** (exibindo inclusive o rosto do Lulão via \`Hook_PsxUpload\` e disparando \`"Roubei mais 100!"\` + fala aleatória zero-stall quando o Lulão está jogando!), soma diretamente em \`totalCashEarned\` e \`currentCashSpendable\` do skatista, persiste em \`g_ExtCareer[skater]\` para não renascer após coletada e **compra Stats, Manobras e Shapes no Skate Shop junto com o dinheiro do THPS2!**

### Resumo das 9 Fases Convertidas (**60 Objetivos Satíricos Completos \`G0..G9\`**, **30 Objetos 3D Esculpidos**, Trilhos e Moedas → \`$100\` Cash)

| ID THPS2 | Fase THPS1 | Tipo | Trilhos | Moedas → \`$100\` | Objeto 3D Esculpido (\`G5\`, 5× por fase) | Lista Completa de 10 Objetivos (\`G0..G9\`) |
| :---: | :--- | :---: | :---: | :---: | :--- | :--- |`);

const activeCoinsMap = {
  11: '6 nós (`$600`)',
  12: '11 nós (`$1.100`)',
  13: '15 nós (`$1.500`)',
  14: 'Comp (Medalha)',
  15: '16 nós (`$1.600`)',
  16: '15 nós (`$1.500`)',
  17: 'Comp (Medalha)',
  18: '5 nós (`$500`)',
  19: 'Comp (Medalha)',
};
const sculptedObjMap = {
  11: '**3D Mandioca da Dilma** (`0x5111A101`, `48v/40f`, `+3.252 B` em `skware_o.psx`)',
  12: '**3D Triplex do Guarujá** (`0x5112A102`, `40v/30f`, `+2.844 B` em `skschl_o.psx`)',
  13: '**3D Mala do Mensalão** (`0x5113A103`, `64v/48f`, `+3.540 B` em `skmall_o.psx`)',
  14: '— *(Competição)*',
  15: '**3D Cofre do Escândalo INSS** (`0x5115A104`, `48v/35f`, `+3.080 B` em `skdown_o.psx`)',
  16: '**3D Pedalinho de Atibaia** (`0x5116A105`, `78v/58f`, `+3.948 B` em `skjam_o.psx`)',
  17: '— *(Competição)*',
  18: '**3D Picanha da Promessa** (`0x5118A106`, `48v/45f`, `+3.384 B` em `sksf_o.psx`)',
  19: '— *(Competição)*',
};

for (const lv of man.levels) {
  const def = THPS1_DEFS.find(d => d.id === lv.id2);
  const goalsTxt = def.isComp
    ? 'Competição: Medalhas Ouro / Prata / Bronze (3 baterias)'
    : def.goals.map((g, i) => `${i + 1}) ${g.text} (\\$${g.cash})`).join('; ');
  push(`| \`${lv.id2}\` | **${lv.name}** (*${lv.loc}*) | ${lv.isComp ? 'Comp' : 'Carreira (10)'} | **${lv.trgStats.railsConverted}** | ${activeCoinsMap[lv.id2]} | ${sculptedObjMap[lv.id2]} | ${goalsTxt} |`);
}

push(`
### 5.3 Tabela dos 24 Gaps Ao Vivo do THPS1 (\`g_Thps1GapList @ 0x800E7E60\`, \`Entry_SetGapList @ 0x80083848\`)
Cada uma das 6 fases regulares do THPS1 recebeu **4 Gaps reais verificados** contra opcodes \`0x00C9 EndGap\` dentro do próprio \`.TRG\` (\`1× gt=2\` para a meta **Trick+Gap \`G6\`** + \`3× gt=1\` para a meta **Multi-Gap \`G7\`**), ativados dinamicamente em \`Game_StartLevel @ 0x80083848\` (\`Entry_SetGapList\`) e protegidos contra escrita fora de faixa na tabela de 11 níveis por \`Entry_GapChecklistGuard @ 0x80024CD4\`:

| # | Fase | Gap ID (\`.TRG\`) | Tipo | Pontos | Nome Satírico no HUD |
| :---: | :--- | :---: | :---: | :---: | :--- |`);

const gapLvlName = (gid) => {
  const base = gid % 10000;
  if (base >= 1000 && base <= 1099) return '[11] Warehouse';
  if (base >= 2000 && base <= 2099) return '[12] School';
  if (base >= 2300 && base <= 2399) return '[13] Mall';
  if (base >= 1100 && base <= 1299) return '[15] Downtown';
  if (base >= 2600 && base <= 2699) return '[16] Downhill Jam';
  return '[18] Streets SF';
};
THPS1_GAPS.forEach((gp, idx) => {
  push(`| ${idx + 1} | ${gapLvlName(gp.gapId)} | \`${gp.gapId}\` | ${gp.gt === 2 ? '`G6` Trick+Gap' : '`G7` Multi-Gap'} | \`${gp.pts}\` | \`${gp.name}\` |`);
});

push(`
---

## 6. Progressão Intercalada das 19 Fases & Arquitetura do Motor Residente MIPS

Seguindo rigorosamente a mecânica de desbloqueio e a interface de Seleção de Fases do THPS2, **todas as 19 fases do Modo Carreira começam bloqueadas, exceto *The Hangar***, e vão se abrindo alternando sempre **THPS2 ↔ THPS1**:

| Slot Carrossel | ID Interno | Jogo | Fase | Localização | Modo | Requisito de Desbloqueio |
| :---: | :---: | :---: | :--- | :--- | :---: | :--- |`);

for (const s of ALL_20_SLOTS) {
  push(`| **${s.slot}** | \`${s.id}\` | **${s.game}** | **${s.name}** | ${s.loc} | ${s.type} | ${s.req} |`);
}

push(`
### Mapa da Arena Residente MIPS (\`0x800E6000..0x800EC7FF\` — \`VOICES.DAT\` Setores \`7..19\`, \`26.624 B\`)

| Endereço RAM | Tamanho | Estrutura / Código Residente | Papel no Motor de 20 Fases |
| :--- | :---: | :--- | :--- |
| \`0x800E6000..0x800E7D0F\` | \`7.440 B\` | \`g_ExtLevelTable[20]\` | Cópia expandida de \`0x800B8444\` (stride \`0x174\`): slots \`0..10\` do THPS2 intactos + slots \`11..19\` das 9 fases THPS1 (**60 objetivos satíricos completos \`G0..G9\`** nas 6 fases regulares + \`gapMin/gapMax\` disjuntos + \`+0x50 primBufDelta\` calibrado: \`+12000\` *Warehouse*, \`-20000\` *School*, \`-18000\` *Downtown*, \`-24000\` *Downhill Jam*, \`-28000\` *Mall*/*Streets SF*). Todas as **70 referências em \`SLUS_010.66\`**, **13 em \`levelsel.bin\`** e **8 em \`options.bin\`** foram relocadas para cá! |
| \`0x800E7D20..0x800E7D6F\` | \`80 B\` | \`g_DisplayOrderWords[20]\` | Ordem intercalada do carrossel: \`[${DISPLAY_ORDER.join(', ')}]\`. |
| \`0x800E7D70..0x800E7D83\` | \`20 B\` | \`g_SlotOfLevel[20]\` | Mapa inverso instantâneo \`levelId → displaySlot\`. |
| \`0x800E7DE0..0x800E7E5F\` | \`128 B\` | \`FastBurst Descriptors\` | Descritores unificados **1-Visita a \`THPS1.WAD\`** (mantendo \`XA\` pausado entre \`CLevelRend\` e \`CLevelMap\`, \`-20%\` no Level Select: \`471f → 378f\`, **40/40 fotos no Frame 1**) + **vídeos preview inferiores restaurados** (\`vlcBufSize=16896\`, \`ringSec=16\`, \`90,8 KB\` livres na \`Heap[1]\`). |
| \`0x800E7E60..0x800E7FFF\` | \`416 B\` | \`g_Thps1GapList[24+1]\` | **24 Gaps ao vivo do THPS1** (\`300 B\` usados / \`116 B\` livres: 4 por fase regular, \`1× G6 Trick+Gap\` + \`3× G7 Multi-Gap\`), selecionados dinamicamente por \`Entry_SetGapList @ 0x80083848\`. |
| \`0x800E8000..0x800E840F\` | \`1.040 B\` | \`g_ExtLightTable[20]\` | Tabela expandida de iluminação direcional (stride \`52 B\`). |
| \`0x800E8410..0x800E854F\` | \`320 B\` | \`g_ExtShadowTable[20]\` | Tabela expandida de cor/intensidade de sombra (stride \`16 B\`). |
| \`0x800E8550..0x800E8A4F\` | \`1.280 B\` | \`g_ExtHighScoreTable[20]\` | Tabela expandida de recordes (*High Scores*, stride \`64 B\`), com 6 hooks seguros mantendo \`0..10\` nativos para compatibilidade de Memory Card! |
| \`0x800E8A50..0x800E8C7F\` | \`560 B\` | \`g_Thps1Hed[${man.totalFiles}+1]\` | Índice residente em RAM de \`THPS1.WAD\` (**${man.totalFiles} entradas prioritárias** + sentinela \`0xFFFFFFFF\`, suporte até 46 entradas). |
| \`0x800E8C80..0x800E96DF\` | \`2.656 B\` | \`g_Thps1Strings\` (2 segmentos) | Pool compacto byte-packed em 2 segmentos (\`0x800E9000..0x800E96DF\` primário + \`0x800E8C80..0x800E8FFF\` spill): nomes das 9 fases, **60 títulos satíricos pixel-validados em \`s2goal.fnt\`**, \`t1comp0..2.bmp\`, rótulos HUD e **24 nomes de Gaps**. |
| \`0x800E96E0..0x800E96FF\` | \`32 B\` | Estado de Runtime | \`g_Thps1BaseLba\`, \`g_VoicesTotalSectors (1174)\`, \`g_SavedRendSprites @ 0x800E96F4\`, \`g_FastBurstXaSaved @ 0x800E96F8\`. |
| \`0x800E9700..0x800E9ECF\` | \`2.000 B\` | \`g_ExtCareer[20 × 100 B]\` | Progresso completo (flags das **10 metas/fase**, medalhas, \`secretFlags\` via 6 hooks \`.TRG\`, bits de \`$100\` Cash) dos 20 skatistas nas 9 fases THPS1 (\`11..19\`), limpo em \`Career_InitAll @ 0x80023988\`. |
| \`0x800EA000..0x800EAFFF\` | \`4.096 B\` | \`THPS1_CODE\` | **32 rotinas MIPS R3000A** (\`4.072 B\` usados / \`24 B\` livres): \`Hook_CdWadFallback\`, \`Entry_CompLoadBmp @ 0x80022E2C\` (\`t1comp0/1/2.bmp\`), \`FastBurst\` 1-Visita, contagem **10 metas × 10% = 100%**, \`Entry_SetGapList @ 0x80083848\`, \`Entry_GapChecklistGuard @ 0x80024CD4\`, botão \`View Goals\`, prêmios/pódio de competição, High Scores, 6 hooks \`.TRG SecretFlag\` e despacho \`Hook_Car215/216_SetModel\`. |
| \`0x800EB000..0x800EC7FF\` | \`6.144 B\` | \`LULAO_CASHART\` Boot-Residente | Arte das notas do Lulão (Setores \`17..19\` de \`VOICES.DAT\`) carregada no boot — zero seek de CD ao entrar em qualquer fase (\`-1,92 s\` em \`items.psx → bits.psx\`!). |
| \`0x800EC800..0x801FFFFF\` | \`~1,09 MB\` | \`NewHeapStart\` | Heap dinâmica principal do THPS2 (\`InitHeap @ 0x800A294C/50\` e \`HeapStartPtr @ 0x800E2674\`). |

---

## 7. Anatomia dos 6 Pacotes \`.PRE\` do THPS1 (**${totalPreSubFiles} Sub-Arquivos Desempacotados**)

Cada pacote \`.PRE\` do THPS1 começa com \`uint32 numFiles\`, seguido sequencialmente por cada entrada: \`nome ASCII (null-terminated, pad 4 B) + uint32 rawSize + bytes do arquivo (pad 4 B)\`. Todos os 6 pacotes foram extraídos em \`EXTRAIDOS_ARQUIVOS_THPS1/05_Pacotes_PRE/Desempacotados/\`:
`);

for (const pe of preEntries) {
  push(`### \`${pe.name}\` (\`CD.WAD[${pe.idx}]\`, ${fmtBytes(pe.size)}, **${pe.preItems.length} sub-arquivos**)`);
  push(`| # | Sub-Arquivo | Tamanho | Pasta Extraída |`);
  push(`| :---: | :--- | :---: | :--- |`);
  pe.preItems.forEach((it, k) => {
    push(`| ${k + 1} | \`${it.name}\` | ${fmtBytes(it.rawSize)} | \`05_Pacotes_PRE/Desempacotados/${path.parse(pe.name).name}/${it.name}\` |`);
  });
  push('');
}

push(`---

## 8. Catálogo Forense Integral de Todos os 669 Arquivos de \`CD.WAD\` do THPS1 (Por Categoria)

A tabela a seguir cataloga **100% dos 669 arquivos** extraídos de \`CD.HED\`/\`CD.WAD\` de *Tony Hawk's Pro Skater 1*, agrupados exatamente pelas **25 subpastas categorizadas** de \`EXTRAIDOS_ARQUIVOS_THPS1/\`, com índice original, offset em \`CD.WAD\`, tamanho real, *magic bytes* iniciais e hash SHA-256 resumido:
`);

for (const c of sortedCats) {
  const list = byCat.get(c);
  const catBytes = list.reduce((a, e) => a + e.size, 0);
  push(`### 📂 \`${c}/\` (${list.length} arquivos — ${fmtBytes(catBytes)})`);
  push(`| WAD # | Arquivo | Offset \`CD.WAD\` | Tamanho | Magic (8 B) | SHA-256 (16) | Descrição Técnica |`);
  push(`| :---: | :--- | :---: | :---: | :---: | :---: | :--- |`);
  for (const e of list) {
    push(`| ${e.idx} | \`${e.name}\` | \`${hex(e.wadOffset)}\` | ${fmtBytes(e.size)} | \`${e.magicHex}\` | \`${e.sha256_16}\` | ${describeWadFile(e)} |`);
  }
  push('');
}

push(`---

## 9. Verificação Ao Vivo no DuckStation (Prova Empírica Completa)

- **Carrossel Intercalado 19 Fases:** percorrido ao vivo na ordem exata \`[0, 11, 1, 12, 2, 13, 3, 14, 4, 15, 5, 16, 6, 17, 7, 18, 8, 19, 9, 0]\` com **40/40 bitmaps carregados** sem corrupção de VRAM, badges \`LEVEL GOALS: 0%\` funcionais e desbloqueio progressivo comprovado (apenas *The Hangar* liberada com \`$0\`; *Warehouse* liberada ao atingir \`$1.000\`, mantendo *School II* trancada até \`$2.000\`).
- **6/6 Fases Regulares do THPS1 com 10/10 Objetivos Satíricos, 6 Objetos 3D Esculpidos e 24 Gaps Ao Vivo (60 FPS, Zero Travamento):**
  - **60/60 títulos de checklist** comprovados ao vivo via \`○ VEJA NOOB!\` em todas as 6 telas (*Warehouse*, *School*, *Mall*, *Downtown*, *Downhill Jam* e *Streets*): alinhamento exato medido pixel a pixel em \`s2goal.fnt\` com folga \`>= 14 px\` até a coluna \`$cash\`!
  - **6/6 novos objetos 3D geométricos (\`fl = 0x2003\`, texto legível esquerda→direita sem artefatos)** comprovados visualmente em jogo + banners HUD de coleta ao vivo (\`"1 OF 5 MANDIOCAS"\`, \`"1 OF 5 TRIPLEX"\`, \`"1 OF 5 MALAS $$$"\`):
    - \`[11] Warehouse\` (**3D Mandioca da Dilma**): \`G5=5, G6=1, G7=3, GapList=0x800E7E60, PrimBuf=84,2%, Heap[1]=158,6 KB\`
    - \`[12] School\` (**3D Triplex do Guarujá**): \`G5=5, G6=1, G7=3, GapList=0x800E7E60, PrimBuf=84,2%, Heap[1]=19,5 KB\`
    - \`[13] Mall\` (**3D Mala do Mensalão**): \`G5=5, G6=1, G7=3, GapList=0x800E7E60, PrimBuf=66,7%, Heap[1]=51,5 KB\`
    - \`[15] Downtown\` (**3D Cofre do Escândalo INSS**): \`G5=5, G6=1, G7=3, GapList=0x800E7E60, PrimBuf=66,4%, Heap[1]=15,3 KB\`
    - \`[16] Downhill Jam\` (**3D Pedalinho de Atibaia**): \`G5=5, G6=1, G7=3, GapList=0x800E7E60, PrimBuf=70,0%, Heap[1]=50,6 KB\`
    - \`[18] Streets SF\` (**3D Picanha da Promessa**): \`G5=5, G6=1, G7=3, GapList=0x800E7E60, PrimBuf=62,7%, Heap[1]=13,3 KB\`
- **Aceleração de Menus, Telas de Competição, *Mall NY* #3/#4 & Áudio de Caixa Zero-Stall (Provados Ao Vivo via GDB no DuckStation):**
  - **Velocidade de Menus/Carregamento:** \`PlaySel CONTINUE → State 2\` em \`49–50f (0,82 s)\` (zero seek); \`State 2 → LevelSel Ready\` de \`471f → 378f (-20% / -1,55 s)\`; \`items.psx → bits.psx\` do Lulão de \`139f → 24f (-1,92 s)\` via \`CASHART\` boot-residente (\`0x800EB000\`); carregamento total de *School Miami* de \`1.030f → 930f (-1,67 s)\`.
  - **3/3 Telas de Competição THPS1 (\`t1comp0/1/2.bmp\` via \`Entry_CompLoadBmp\`):** *Skate Park Chicago (\`14\`)*, *Burnside (\`17\`)* e *Roswell (\`19\`)* exibem arte completa + título + regras + \`"PRESS (X) TO PLAY / (△) TO GO BACK"\` sem tela preta!
  - ***Mall NY* Malas #3 e #4:** auditadas contra todos os \`11.126\` triângulos de \`skmall.psx\` (\`#3 [-29583, -869, 20791], minWall=498 u\` e \`#4 [-13620, 2192, 7934], minWall=335 u\`, 0 props em 800 u) e coletadas ao vivo (\`"1 OF 5 MALAS $$$"\` / \`"2 OF 5 MALAS $$$"\`).
  - **Som de Caixa + Skatista (\`CdReads = 0\` / \`0,00 ms\` stall):** *School Miami* \`Triplex #1\` dispara \`SFX 316 + SFX 83 (vol=12288) + 0x80049D34()\`; caixas derrubáveis \`n711\` (*School*) e \`n244\` (*Warehouse*) disparam \`KnockDown(3) → SFX 60 (vol=12288) + Skater_BumpSfx + SFX 69 (vol=11264)\`.
- **Smoke-Test 3D ao Vivo em Todas as 9/9 Fases do THPS1 + Regressão THPS2:** todas as 9 fases (incluindo as 3 competições *Skate Park Chicago*, *Burnside* e *Roswell*) + *The Hangar* (regressão) carregaram e renderizaram em 3D real a 60 FPS com 0 travamentos, 0 exceções MIPS e 0 \`FatalError\`, preservando 100% intactos os recursos do THPS2 e do Lulão!
`);

const content = lines.join('\n');
const targets = [
  path.join(ROOT, 'repo', 'Docs', 'MAPA_14_THPS1_ARQUIVOS_E_ENGENHARIA_REVERSA.md'),
  path.join(ROOT, 'docs', 'MAPA_14_THPS1_ARQUIVOS_E_ENGENHARIA_REVERSA.md'),
  path.join(ROOT, 'EXTRAIDOS_ARQUIVOS_THPS1', 'MAPA_COMPLETO_ARQUIVOS_THPS1.md'),
];
for (const t of targets) {
  fs.mkdirSync(path.dirname(t), { recursive: true });
  fs.writeFileSync(t, content, 'utf8');
  console.log(`  [doc] ${path.relative(ROOT, t)} (${(content.length / 1024).toFixed(1)} KB, ${lines.length} linhas)`);
}
console.log('MAPA 14 THPS1 gerado com sucesso em todos os 3 destinos!');
