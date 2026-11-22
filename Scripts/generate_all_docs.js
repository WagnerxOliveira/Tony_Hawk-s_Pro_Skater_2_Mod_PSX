#!/usr/bin/env node
'use strict';

/**
 * Automated Encyclopedic Reverse-Engineering Documentation Generator for THPS2 PS1 (SLUS-01066)
 * Reads the real binaries (SLUS_010.66, CD.HED, CD.WAD, COMPILED.XA, *.STR, BMX/*)
 * and generates 9 detailed, verified Markdown maps in both repo/Docs/ and docs/.
 */

const fs = require('fs');
const path = require('path');
const { inspectFile } = require('./psx_media');

const rootDir = path.resolve(__dirname, '..');
const repoDocsDir = path.join(rootDir, 'repo', 'Docs');
const localDocsDir = path.join(rootDir, 'docs');
fs.mkdirSync(repoDocsDir, { recursive: true });
fs.mkdirSync(localDocsDir, { recursive: true });

const exe = fs.readFileSync(path.join(rootDir, 'SLUS_010.66'));
const exeBak = fs.readFileSync(path.join(rootDir, 'SLUS_010.66.bak'));
const hed = fs.readFileSync(path.join(rootDir, 'CD.HED'));
const wad = fs.readFileSync(path.join(rootDir, 'CD.WAD'));
const baseRam = exe.readUInt32LE(0x18);

const hex = (n, w = 8) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(w, '0');
const ramToOff = a => (a - baseRam) + 0x800;
const offToRam = o => (baseRam + (o - 0x800)) >>> 0;
const readStr = (ram, buf = exe) => {
  if (ram < baseRam || ram >= baseRam + buf.length - 0x800) return null;
  const off = ramToOff(ram);
  const end = buf.indexOf(0, off);
  if (end < 0 || end - off > 300) return null;
  const s = buf.subarray(off, end).toString('latin1');
  return /^[\x20-\x7E\x80-\xFF]*$/.test(s) ? s : null;
};
const mdEsc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

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

function writeDoc(filename, content) {
  fs.writeFileSync(path.join(repoDocsDir, filename), content, 'utf8');
  fs.writeFileSync(path.join(localDocsDir, filename), content, 'utf8');
  console.log(`  [doc] ${filename} (${(content.length / 1024).toFixed(1)} KB)`);
}

// --- Load WAD entries + resolved names using thps2_wad.js list ---
const { execFileSync } = require('child_process');
const wadListRaw = execFileSync('node', [path.join(__dirname, 'thps2_wad.js'), 'list'], { encoding: 'utf8' });
const wadEntries = [];
for (const line of wadListRaw.split(/\r?\n/)) {
  const m = line.match(/^\s*(\d+)\s*\|\s*(0x[0-9A-F]{8})\s*\|\s*(\S+)\s*\|\s*off=(0x[0-9A-F]{8})\s*\|\s*sz=\s*(\d+)\s*\|\s*(.+)$/);
  if (m) {
    wadEntries.push({
      idx: parseInt(m[1], 10),
      hash: m[2],
      type: m[3],
      offset: parseInt(m[4], 16),
      size: parseInt(m[5], 10),
      name: m[6].trim(),
    });
  }
}

// ============================================================================
// MAPA 01: MEMORIA E EXECUTAVEL (SLUS_010.66)
// ============================================================================
{
  const pc0 = exe.readUInt32LE(0x10);
  const tAddr = exe.readUInt32LE(0x18);
  const tSize = exe.readUInt32LE(0x1C);
  const sp0 = exe.readUInt32LE(0x30);
  const markerEnd = exe.indexOf(0, 0x4C);
  const marker = exe.subarray(0x4C, Math.min(markerEnd, 0x100)).toString('ascii');

  const md = `# 📘 MAPA 01 — Arquitetura de Memória e Executável Principal (\`SLUS_010.66\`)

> **Alvo:** Tony Hawk's Pro Skater 2 (PlayStation 1 — NTSC-U \`SLUS-01066\`)  
> **CPU:** MIPS R3000A (32-bit Little-Endian, 33,8688 MHz) + GTE (COP2)  
> **RAM Principal:** 2 MB (\`0x80000000\` – \`0x801FFFFF\`, KSEG0 cacheável)

---

## 1. Cabeçalho \`PS-X EXE\` (\`SLUS_010.66\`)

| Campo | Offset no Arquivo | Valor Atual | Significado Técnico |
| :--- | :---: | :---: | :--- |
| Magic | \`0x0000\` | \`PS-X EXE\` | Assinatura obrigatória da BIOS do PS1 |
| \`PC0\` (Entry Point) | \`0x0010\` | \`${hex(pc0)}\` | Primeira instrução executada; limpa \`.bss\` (\`0x800D8674..0x800E2674\`) |
| \`GP0\` | \`0x0014\` | \`0x00000000\` | Inicializado em runtime pelo código de startup |
| \`t_addr\` (Base RAM) | \`0x0018\` | \`${hex(tAddr)}\` | Endereço de carregamento do corpo do executável |
| \`t_size\` (Tamanho RAM) | \`0x001C\` | \`${hex(tSize)}\` (\`${tSize}\` B) | Fim da imagem em RAM: \`${hex(tAddr + tSize)}\` |
| \`s_addr\` (Stack) | \`0x0030\` | \`${hex(sp0)}\` | Topo da pilha (\`SYSTEM.CNF\` define \`801FFF00\`) |
| Tamanho total em disco | — | \`${exe.length}\` bytes | \`0x800\` (header) + \`${hex(tSize)}\` (binário) |
| License String | \`0x004C\` | \`${mdEsc(marker)}\` | *Pré-modificada.* Original NTSC-U: \`Sony Computer Entertainment Inc. for North America area\` |

### Fórmula Exata de Conversão \`Offset no Arquivo ↔ Endereço RAM\`
\`\`\`text
RAM_Address = 0x80010000 + (File_Offset - 0x0800)
File_Offset = (RAM_Address - 0x80010000) + 0x0800
\`\`\`

---

## 2. Mapa Global de Regiões na RAM do PS1 (2 MB)

| Faixa de RAM | Offset no Arquivo | Região / Conteúdo |
| :--- | :---: | :--- |
| \`0x80000000\` – \`0x8000FFFF\` | *(BIOS)* | Kernel da BIOS PS1, vetores de exceção e tabela de syscalls (\`A0\`, \`B0\`, \`C0\`) |
| \`0x80010000\` – \`0x800693BF\` | \`0x000800\` – \`0x059BBF\` | Código principal (\`.text\`): engine Neversoft, física, rendering, input, CD/WAD, Psy-Q SDK |
| \`0x800693C0\` – \`0x8006B200\` | \`0x059BC0\` – \`0x05BA00\` | Bloco principal de strings de UI, menus, Memory Card e Cheats (já parcialmente em PT-BR) |
| \`0x8006B200\` – \`0x800AFBFF\` | \`0x05BA00\` – \`0x0A03FF\` | Código adicional (\`.text\`): player MDEC/STR (\`0x8007A6B8+\`), timer (\`0x800833E8\`), entry point (\`0x800A2910\`) |
| \`0x800AFC00\` – \`0x800B6833\` | \`0x0A0400\` – \`0x0A7033\` | Jump tables (\`0x800AFC18..\`), textos de objetivos de fase, biografias de skatistas, gaps e strings de sistema |
| \`0x800B6834\` – \`0x800B8443\` | \`0x0A7034\` – \`0x0A8C43\` | **\`g_SkaterTable[]\`** — 20 skatistas × \`0x154\` bytes ([ver MAPA 04](MAPA_04_PERSONAGENS_E_STATS.md)) |
| \`0x800B8444\` – \`0x800B943F\` | \`0x0A8C44\` – \`0x0A9C3F\` | **\`g_LevelTable[]\`** — 11 fases × \`0x174\` bytes ([ver MAPA 03](MAPA_03_FASES_E_OBJETOS_TRG.md)) |
| \`0x800BA4F4\` – \`0x800BA573\` | \`0x0AACF4\` – \`0x0AAD73\` | **\`g_XATrackLengths[]\`** — Duração das músicas de \`COMPILED.XA\` ([ver MAPA 08](MAPA_08_AUDIO_XA_VAB_E_VIDEOS_STR.md)) |
| \`0x800BF2E0\` – \`0x800C0888\` | \`0x0AFAE0\` – \`0x0B1088\` | **\`g_StringTable[]\`** — 1.387 ponteiros de texto/localização ([ver MAPA 07](MAPA_07_CHEATS_COMANDOS_E_STRINGS.md)) |
| \`0x800C1CB4\` – \`0x800C219F\` | \`0x0B24B4\` – \`0x0B299F\` | **\`g_MovieTable[]\`** — 35 vídeos \`.STR\` × \`0x24\` bytes ([ver MAPA 08](MAPA_08_AUDIO_XA_VAB_E_VIDEOS_STR.md)) |
| \`0x800D2800\` – \`0x800D8673\` | \`0x0C3000\` – \`0x0C8E73\` | Strings de assets (\`tricks.bin\`, \`\CD.HED;1\`, \`\CD.WAD;1\`, \`\COMPILED.XA;1\`, nomes de modelos/fases/vídeos) |
| \`0x800D8674\` – \`0x800E2800\` | \`0x0C8E74\` – \`0x0D3000\` | \`.bss\` zerado na inicialização (\`0x800A2910\`) |
| \`0x800E2800\` – \`0x801FFEFF\` | *(Heap Dinâmico)* | Alocação dinâmica de overlays \`.BIN\`, níveis \`.PSX\`, triggers \`.TRG\`, ring buffers de vídeo/CD |

---

## 3. Funções Fundamentais Mapeadas em \`SLUS_010.66\`

| Endereço RAM | Offset no Arquivo | Nome Sugerido (Ghidra) | Função / Responsabilidade |
| :---: | :---: | :--- | :--- |
| \`0x800A2910\` | \`0x093110\` | \`THPS2_EntryPoint\` | Ponto de entrada; zera \`.bss\` e transfere para \`main\` |
| \`0x80053F10\` | \`0x044710\` | \`Neversoft_HashFilename_CaseInsensitive\` | Calcula o hash 32-bit de \`CD.HED\` (\`tolower\` + \`rol32\` + \`0xEDB88320\`) |
| \`0x80023130\` | \`0x013930\` | \`Neversoft_HashString_CaseSensitive\` | Variante case-sensitive do algoritmo de hash |
| \`0x80053F88\` | \`0x044788\` | \`CDWAD_OpenByFilename\` | Abre arquivo dentro de \`CD.WAD\` via busca de hash em \`CD.HED\` |
| \`0x80014130\` | \`0x004930\` | \`Tricks_LoadTableRef\` | Carrega \`tricks.bin\` (\`0x800D2848\`) na inicialização |
| \`0x80038974\` | \`0x029174\` | \`XA_InitCompiledXA\` | Abre \`\\COMPILED.XA;1\` (\`0x800D6184\`) via \`CdSearchFile\` |
| \`0x8003D3E8\` | \`0x02DBE8\` | \`BMX_LaunchDemoRef\` | Executa \`cdrom:\\BMX\\X.EXE;1\` (\`0x800B2064\`) |
| \`0x8007A6B8\` | \`0x06AEB8\` | \`Movie_PlayerRef1\` | Player MDEC/STR principal que lê \`g_MovieTable\` (\`0x800C1CB4\`) |
| \`0x80026C48\` | \`0x017448\` | \`Cheats_MenuHandlerRef\` | Handler da tela de cheats (\`g_CheatStringPtrs @ 0x800C028C\`) |
| \`0x80067DA0\` | \`0x0585A0\` | \`Text_LookupStringRef1\` | Resolve strings por ID em \`g_StringTable\` (\`0x800BF2E0\`) |

---

## 4. Algoritmo Exato de Hash da Neversoft (\`0x80053F10\`)

Ao contrário do CRC32 IEEE padrão, o THPS2 PS1 faz **rotação à esquerda (\`rol32\`)** com o polinômio \`0xEDB88320\` sem XOR final:

\`\`\`c
uint32_t Neversoft_HashFilename(const char *str) {
    uint32_t h = 0xFFFFFFFF;
    while (*str != 0) {
        uint8_t c = (uint8_t)*str++;
        if (c >= 'A' && c <= 'Z') c += 32; // tolower()
        uint8_t x = (uint8_t)(c ^ h);
        for (int i = 0; i < 8; i++) {
            h = (h << 1) | (h >> 31);      // rol32(h, 1)
            if (x & 1) h ^= 0xEDB88320;
            x >>= 1;
        }
    }
    return h;
}
\`\`\`

---

## 5. Registro Forense de Patches Existentes no Workspace

| Endereço RAM | Offset Arquivo | Original (\`.bak\`) | Modificado (\`SLUS_010.66\`) | Observação |
| :---: | :---: | :--- | :--- | :--- |
| \`0x80016848\` | \`0x007048\` | \`24020078\` (\`li $v0, 120\`) | \`2402012C\` (\`li $v0, 300\`) | Altera constante de \`120\` para \`300\` antes de \`jal 0x8005566C\` |
| \`0x8005F320\` | \`0x04FB20\` | \`2484FFF8\` (\`addiu $a0, -8\`) | *Corrompido apenas em \`rep\\*.bak\`* | **ATENÇÃO:** \`rep\\SLUS_010.66.bak\` tem \`0000FFF8\` (opcode inválido!) — nunca usar essa cópia |

---

## 6. Como Aplicar Símbolos Automaticamente no Ghidra

1. Abra o projeto no Ghidra com o plugin **\`ghidra_psx_ldr\`**.
2. Vá em **Window → Script Manager → Manage Script Directories** e adicione a pasta \`Scripts/\` (ou \`tools/\`).
3. Execute **\`ghidra_apply_symbols.py\`** para rotular automaticamente todas as tabelas e funções acima.
`;
  writeDoc('MAPA_01_MEMORIA_E_EXECUTAVEL.md', md);
}

// ============================================================================
// MAPA 02: CRONOMETRO, FISICA E PONTUACAO
// ============================================================================
{
  const md = `# ⏱️ MAPA 02 — Cronômetro, Física, Equilíbrio e Sistema de Pontuação

Este guia mapeia os pontos críticos para modificar **tempo de sessão (cronômetro)**, **gravidade / física do skatista**, **equilíbrio de grind/manual**, **pontuação** e **objetivos de score**.

---

## 1. Cronômetro do Jogo (Run Timer / Tempo de Sessão)

| Ponto de Interesse | Endereço RAM | Offset em \`SLUS_010.66\` | Instrução / Dado | Como Modificar |
| :--- | :---: | :---: | :--- | :--- |
| Constante \`120\` → \`300\` (já patcheada no binário atual) | \`0x80016848\` | \`0x007048\` | \`addiu $v0, $zero, 0x0078\` (\`120\`) → \`0x012C\` (\`300\`) | Altere os 2 bytes inferiores (Little-Endian) para o valor desejado (ex.: \`0x0258\` = 600) |
| Função chamada logo após carregar a constante | \`0x8005566C\` | \`0x045E6C\` | \`jal 0x8005566C\` (recebe \`&480($sp)\` em \`$a2\`) | Use breakpoint no PCSX-Redux neste endereço para rastrear o ponteiro da struct de timer em RAM |
| Constante \`60000\` (\`0xEA60\` = 1 min em ms) | \`0x800833E8\` | \`0x073BE8\` | Imediato \`0xEA60\` (60.000 ms) | Rotina de conversão / formatação de minutos e segundos do cronômetro |
| Modos de jogo (\`CAREER\`, \`PRACTICE\`, \`SINGLE\`, \`CONTEST\`, etc.) | \`0x800BA600\` | \`0x0AAE00\` | Tabela de ponteiros de modo (\`NONE\`..\`CONTEST\`) | Permite identificar quando o timer está ativo (Career/Single = 2:00, Contest = 1:00, Free Skate = infinito) |
| HUD do relógio (fonte \`time.fnt\`) | \`CD.WAD +0x1C8000\` | \`panel.pre\` (idx 15) | Fonte numérica do cronômetro na tela | Extraia \`panel.pre\` via \`thps2_wad.js unpack --pre\` para alterar aparência do relógio |

### Procedimento Rápido para Congelar ou Customizar o Cronômetro (PCSX-Redux + Ghidra)
1. Inicie uma sessão no **The Hangar** no PCSX-Redux com **Search RAM (32-bit)** procurando o contador decrescente em milissegundos/frames (entre \`120000\` e \`0\` ou \`7200\` e \`0\`).
2. Coloque um **Write Breakpoint** no endereço de RAM encontrado.
3. O debugger parará exatamente na instrução \`subu\` / \`addiu ..., -1\` que decrementa o relógio:
   - **Tempo infinito:** substitua a instrução de escrita \`sw\` (ou o decremento) por \`nop\` (\`0x00000000\`).
   - **Tempo customizado (ex.: 5:00 ou 10:00):** coloque um **Write Breakpoint** ao clicar em *Retry* para capturar o exato \`lui + ori/addiu\` que recarrega o valor inicial do relógio.

---

## 2. Física do Skatista, Velocidade, Pulo e Equilíbrio

A física do THPS2 é controlada pela combinação de **3 camadas**:

### Camada A — Stats Base de Cada Skatista (\`g_SkaterTable @ 0x800B6834\`)
Cada skatista possui **10 bytes de atributos (1 a 10)** no offset **\`+0x128\`** de sua struct de \`0x154\` bytes (detalhados individualmente no [MAPA 04](MAPA_04_PERSONAGENS_E_STATS.md)):

| Byte Offset | Atributo | Efeito Direto na Física |
| :---: | :--- | :--- |
| \`+0x128\` | **Air** | Impulso vertical em rampas / vert |
| \`+0x129\` | **Hangtime** | Redução da aceleração gravitacional no ar |
| \`+0x12A\` | **Ollie** | Altura base do salto no plano |
| \`+0x12B\` | **Speed** | Velocidade máxima no solo |
| \`+0x12C\` | **Spin** | Velocidade angular de rotação (180/360/540/720/900) |
| \`+0x12D\` | **Landing** | Tolerância de ângulo na aterrissagem sem cair (bail) |
| \`+0x12E\` | **Switch** | Penalidade/habilidade andando em base invertida |
| \`+0x12F\` | **Rail Balance** | Estabilidade da barra de equilíbrio no grind |
| \`+0x130\` | **Lip Balance** | Estabilidade da barra de equilíbrio em lip tricks |
| \`+0x131\` | **Manual** | Estabilidade da barra de equilíbrio em manuals |

> **Dica de Modding Rápido:** aumentar qualquer stat acima de \`10\` (ex.: \`0x0F\` = 15 ou \`0x14\` = 20) diretamente no \`SLUS_010.66\` cria super-pulos, super-velocidade e equilíbrio extremo sem precisar mexer em assembly!

### Camada B — Modificadores de Física via Cheats (\`0x80026C48\`)
O engine já implementa multiplicadores globais de física acionados pelas flags de cheat (ver [MAPA 07](MAPA_07_CHEATS_COMANDOS_E_STRINGS.md)):
- **\`Moon physics\`** (\`0x800C02C0\`): reduz a gravidade global drasticamente.
- **\`Perfect balance\`** (\`0x800C028C\`): trava a deriva da barra de equilíbrio em grinds, lips e manuals.
- **\`Always special\`** (\`0x800C0290\`): mantém a barra Special em 100% permanentemente.
- **\`Sim mode\`** (\`0x800C02AC\`): aumenta gravidade e exige física realista.
- **\`Slow-Nic\`** (\`0x800C02A0\`): reduz o timestep do jogo em câmera lenta durante manobras.
- **\`Weight\`** (\`0x800C0298\`): altera massa/inércia do skatista.

### Camada C — Bônus dos Decks (\`g_SkaterTable +0x28..+0x127\`)
Cada skatista possui **8 decks** (32 bytes cada) contendo 3 inteiros de bônus de atributos (ex.: \`+0x34\`, \`+0x38\`, \`+0x3C\` para o 1º deck, variando de \`1\` a \`5\`).

---

## 3. Sistema de Pontuação, Multiplicadores e Limiares das Fases

1. **Pontuação Base de Cada Manobra:** armazenada em **\`tricks.bin\`** (\`CD.WAD +0x0014E000\`, \`CD.HED idx=11\`) logo após o nome da manobra no padrão \`0x0A <uint16_le pontos>\` — ver tabela completa de todas as manobras no [MAPA 05](MAPA_05_MANOBRAS_TRICKS_BIN.md).
2. **Metas de Pontuação (High Score / Pro Score / Sick Score) e Dinheiro por Objetivo:** armazenadas diretamente dentro de cada entrada de **\`g_LevelTable\`** (\`0x800B8444\`, stride \`0x174\`) — ver tabela completa no [MAPA 03](MAPA_03_FASES_E_OBJETOS_TRG.md).
3. **Bônus de Cash (50 / 100 / 200 / 250 / 500):** strings em \`0x80069AC0..0x80069B08\` (\`g_StringTable @ 0x800C0300..0x800C0318\`).
`;
  writeDoc('MAPA_02_CRONOMETRO_FISICA_E_PONTUACAO.md', md);
}

// ============================================================================
// MAPA 03: TODAS AS FASES E POSICIONAMENTO DE OBJETOS (.TRG)
// ============================================================================
{
  let md = `# 🗺️ MAPA 03 — Todas as Fases (\`g_LevelTable\`) e Posicionamento de Objetos (\`.TRG\`)

Este documento mapeia **todas as 11 fases** dentro de \`SLUS_010.66\` (\`g_LevelTable @ 0x800B8444\`, stride \`0x174\`) e decodifica **todos os 25 arquivos \`.TRG\` (\`_TRG v2.0\`)** dentro de \`CD.WAD\`, incluindo **coordenadas reais (X, Y, Z)** de spawns, coletáveis, objetos dinâmicos e contagem de rails/triggers.

---

## 1. Tabela Mestra de Fases (\`g_LevelTable\` em \`0x800B8444\`, stride \`0x174\` = 372 B)

- **Rotinas que referenciam \`g_LevelTable\`:** \`0x8001F9A0\`, \`0x80022D5C\`, \`0x80022DC0\`, \`0x80024354\`, \`0x80024570\`, \`0x8002472C\`, \`0x80024BF8\`, \`0x80024FC4\`.

| Idx | Endereço RAM | Offset \`SLUS_010.66\` | Nome da Fase | Localização | Prefixo | Comp. | Preview \`.STR\` |
| :-: | :---: | :---: | :--- | :--- | :---: | :-: | :--- |
`;

  const levelStrMap = ['HANGAR.STR','SCHOOL.STR','MAR.STR','NY.STR','VENICE.STR','SS.STR','PHILLY.STR','BULLRING.STR','B1.STR','HEAVEN.STR','EDITOR.STR'];
  const levelGoals = [];
  for (let i = 0; i < 11; i++) {
    const addr = 0x800B8444 + i * 0x174;
    const off = ramToOff(addr);
    const name = readStr(exe.readUInt32LE(off)) || '?';
    const loc = readStr(exe.readUInt32LE(off + 4)) || '';
    const pref = readStr(exe.readUInt32LE(off + 8)) || '';
    const comp = exe.readUInt32LE(off + 12);
    md += `| ${i} | \`${hex(addr)}\` | \`${hex(off,6)}\` | **${mdEsc(name.trim())}** | ${mdEsc(loc.trim())} | \`${mdEsc(pref)}\` | ${comp} | \`${levelStrMap[i]}\` |\n`;

    // Extract goal strings & cash values inside this 0x174 struct
    const goals = [];
    for (let k = 0x18; k < 0x170; k += 4) {
      const v = exe.readUInt32LE(off + k);
      const s = readStr(v);
      if (s && s.length >= 4 && !/^\s+$/.test(s)) {
        goals.push(`\`+0x${k.toString(16)}\`: "${mdEsc(s)}"`);
      }
    }
    const gapPtr = exe.readUInt32LE(off + 0x170);
    levelGoals.push({ i, name: name.trim(), addr, off, gapPtr, goals });
  }

  md += `\n### Objetivos, Dinheiro e Ponteiros de Gaps por Fase\n\n`;
  for (const lg of levelGoals) {
    md += `- **[${lg.i}] ${lg.name}** (\`${hex(lg.addr)}\` | GapList \`+0x170\` = \`${hex(lg.gapPtr)}\`): ${lg.goals.slice(0, 14).join(' • ')}\n`;
  }

  // Decode ALL 25 .TRG files with real node stats + extracted Restart/Spawn (Type 8), Baddy/Prop (Type 1) & Powerup (Type 5) XYZ coordinates!
  md += `\n---\n\n## 2. Anatomia Binária dos Arquivos \`.TRG\` (\`_TRG v2.0\`)\n\n`;
  md += `Cada arquivo \`.TRG\` dentro de \`CD.WAD\` define **todos os posicionamentos de objetos, spawns, coletáveis, rails, câmeras e scripts de eventos** de uma fase:\n\n`;
  md += `\`\`\`c
struct TRGHeader {
    char     magic[4];      // "_TRG"
    uint16_t ver_major;     // 2
    uint16_t ver_minor;     // 0
    uint32_t num_nodes;     // Quantidade total de nós na fase
    uint32_t offsets[];     // Array de num_nodes offsets relativos ao início do .TRG
};
\`\`\`\n\n`;
  md += `### Tipos de Nó (\`uint16 node_type\` em \`+0x00\` de cada nó)\n\n`;
  md += `| Tipo | Nome Técnico | Estrutura / Posicionamento (X, Y, Z) |\n| :-: | :--- | :--- |\n`;
  md += `| \`1\` | **Baddy / Objeto Dinâmico** | \`uint16 type, uint16 subtype, links..., int32 X, int32 Y, int32 Z, int16 rot[3], script...\` (carros, helicóptero, touro, pedestres, objetos móveis) |\n`;
  md += `| \`2\` | **Crate / Objeto Quebrável** | Referência de objeto destrutível (\`uint32 checksum\`) |\n`;
  md += `| \`4\` / \`15\` | **AutoExec (1P / 2P)** | Script inicial que carrega geometria \`_l.psx\` e objetos \`_o.psx\` da fase |\n`;
  md += `| \`5\` | **Powerup / Coletável** | \`uint16 type=5, uint16 subtype, uint16 num_links, links[], int32 X, int32 Y, int32 Z\` (letras S-K-A-T-E, Fita Secreta, Dinheiro, Pilot Wings, Sinos, etc.) |\n`;
  md += `| \`6\` | **CommandPoint / Trigger** | Gatilhos de gaps, áreas de evento e scripts de objetivos |\n`;
  md += `| \`8\` | **Restart / Spawn Point** | \`uint16 type=8, uint16 num_links, uint16 links[], int32 X, int32 Y, int32 Z, int16 rot[3], char name[]\` |\n`;
  md += `| \`10\` | **RailPoint** | \`uint16 type=10, uint16 num_links, links[], int32 X, int32 Y, int32 Z\` (vértices de corrimãos/bordas grindáveis) |\n`;
  md += `| \`12\` | **TrickObject / MeshRef** | Vincula \`uint32 checksum\` de malha 3D do \`.PSX\` a triggers/gaps |\n`;
  md += `| \`13\` | **CameraPath / Point** | \`uint16 type=13, uint16 num_links, links[], int32 X, int32 Y, int32 Z\` |\n`;
  md += `| \`255\` | **Terminator** | Fim da tabela de nós (\`0x00FF\`) |\n\n`;

  md += `---\n\n## 3. Inventário Completo dos 25 Arquivos \`.TRG\` e Coordenadas Reais (X, Y, Z)\n\n`;

  const trgEntries = wadEntries.filter(e => e.type === 'TRG');
  md += `| Idx \`CD.HED\` | Arquivo | Hash | Offset \`CD.WAD\` | Tamanho | Nós | Restarts (t8) | Powerups (t5) | Objetos (t1) | Rails (t10) | Triggers (t6) | Malhas Carregadas (AutoExec) |\n`;
  md += `| :-: | :--- | :---: | :---: | :---: | :-: | :-: | :-: | :-: | :-: | :-: | :--- |\n`;

  const detailedTrgDumps = [];
  for (const e of trgEntries) {
    const b = wad.subarray(e.offset, e.offset + e.size);
    const numNodes = b.readUInt32LE(8);
    const counts = {};
    const restarts = [];
    const powerups = [];
    const baddies = [];
    const autoexecMeshes = new Set();

    for (let n = 0; n < numNodes; n++) {
      const noff = b.readUInt32LE(12 + n * 4);
      const nextOff = (n + 1 < numNodes) ? b.readUInt32LE(12 + (n + 1) * 4) : e.size;
      if (noff + 2 > e.size) continue;
      const nt = b.readUInt16LE(noff);
      counts[nt] = (counts[nt] || 0) + 1;

      if (nt === 4 || nt === 15) {
        const chunk = b.subarray(noff, nextOff).toString('latin1');
        const ms = chunk.match(/Sk[A-Za-z0-9_]{2,14}/gi);
        if (ms) ms.forEach(x => autoexecMeshes.add(x));
      } else if (nt === 8 && noff + 20 <= e.size) {
        // Restart: +2 = linkCount, links at +4..+4+2*lc, then XYZ int32!
        const lc = b.readUInt16LE(noff + 2);
        const posOff = noff + 4 + lc * 2;
        if (posOff + 18 <= nextOff) {
          const x = b.readInt32LE(posOff);
          const y = b.readInt32LE(posOff + 4);
          const z = b.readInt32LE(posOff + 8);
          // Name starts after 6 bytes of angles (posOff + 18)
          const nameStart = posOff + 18;
          const nul = b.indexOf(0, nameStart);
          const nm = (nul > nameStart && nul < nextOff) ? b.subarray(nameStart, nul).toString('latin1') : `Node#${n}`;
          restarts.push({ node: n, off: posOff, x, y, z, name: nm });
        }
      } else if (nt === 5 && noff + 18 <= nextOff) {
        const sub = b.readUInt16LE(noff + 2);
        const lc = b.readUInt16LE(noff + 4);
        const posOff = noff + 6 + lc * 2;
        if (posOff + 12 <= nextOff) {
          const x = b.readInt32LE(posOff);
          const y = b.readInt32LE(posOff + 4);
          const z = b.readInt32LE(posOff + 8);
          powerups.push({ node: n, off: posOff, subtype: sub, x, y, z });
        }
      } else if (nt === 1 && noff + 24 <= nextOff) {
        const sub = b.readUInt16LE(noff + 2);
        const posOff = noff + 12;
        if (posOff + 12 <= nextOff) {
          const x = b.readInt32LE(posOff);
          const y = b.readInt32LE(posOff + 4);
          const z = b.readInt32LE(posOff + 8);
          baddies.push({ node: n, off: posOff, subtype: sub, x, y, z });
        }
      }
    }

    md += `| ${e.idx} | \`${e.name}\` | \`${e.hash}\` | \`${hex(e.offset)}\` | ${e.size} B | ${numNodes} | ${counts[8]||0} | ${counts[5]||0} | ${counts[1]||0} | ${counts[10]||0} | ${counts[6]||0} | \`${[...autoexecMeshes].slice(0,4).join(', ')}\` |\n`;
    detailedTrgDumps.push({ e, numNodes, restarts, powerups, baddies });
  }

  md += `\n---\n\n## 4. Amostra de Coordenadas Exatas (X, Y, Z) e Offsets para Edição Direta\n\n`;
  md += `> Para mover qualquer spawn, coletável (S-K-A-T-E, fita, cash) ou objeto de uma fase, basta editar os **3 inteiros \`int32_le\` (X, Y, Z)** no offset indicado abaixo (relativo ao início do arquivo \`.TRG\`) e reempacotar com \`node tools/thps2_wad.js repack\`.\n\n`;

  for (const d of detailedTrgDumps) {
    if (d.restarts.length === 0 && d.powerups.length === 0) continue;
    md += `### \`${d.e.name}\` (CD.HED idx=${d.e.idx}, \`CD.WAD +${hex(d.e.offset)}\`, ${d.numNodes} nós)\n`;
    if (d.restarts.length > 0) {
      md += `- **Spawns / Restarts (Type 8 — ${d.restarts.length} no total, primeiros 8):**\n`;
      for (const r of d.restarts.slice(0, 8)) {
        md += `  - Node #${r.node} \`"${mdEsc(r.name)}"\` | offset XYZ \`+${hex(r.off,4)}\` (WAD \`${hex(d.e.offset + r.off)}\`) → \`X=${r.x}, Y=${r.y}, Z=${r.z}\`\n`;
      }
    }
    if (d.powerups.length > 0) {
      md += `- **Coletáveis / Powerups (Type 5 — ${d.powerups.length} no total, primeiros 6):**\n`;
      for (const p of d.powerups.slice(0, 6)) {
        md += `  - Node #${p.node} (subtype \`0x${p.subtype.toString(16)}\`) | offset XYZ \`+${hex(p.off,4)}\` (WAD \`${hex(d.e.offset + p.off)}\`) → \`X=${p.x}, Y=${p.y}, Z=${p.z}\`\n`;
      }
    }
    md += `\n`;
  }

  writeDoc('MAPA_03_FASES_E_OBJETOS_TRG.md', md);
}

// ============================================================================
// MAPA 04: TODOS OS PERSONAGENS, STATS, DECKS E MODELOS
// ============================================================================
{
  let md = `# 🛹 MAPA 04 — Todos os Personagens (\`g_SkaterTable\`), Modelos, Stats e Decks

- **Endereço Base em RAM:** \`0x800B6834\` (\`SLUS_010.66 +0x0A7034\`)
- **Tamanho por Entrada:** \`0x154\` (340 bytes) | **Total:** 20 skatistas (\`0..19\`)
- **Rotinas que leem esta tabela:** \`0x800102FC\`, \`0x80011134\`, \`0x80011178\`, \`0x8002223C\`, \`0x800257B0\`, \`0x80026650\`, \`0x80026B1C\`

---

## 1. Layout Exato da Struct \`SkaterEntry\` (\`0x154\` bytes)

| Offset Relativo | Tamanho | Campo | Descrição |
| :---: | :---: | :--- | :--- |
| \`+0x000\` | 4 B | \`const char *model_a\` | Modelo 3D Roupa A (ex.: \`hawk2\` → \`hawk2.psx\` + \`hawk2.psh\`) |
| \`+0x004\` | 4 B | \`const char *model_a_low\` | Modelo 3D LOD baixo Roupa A (\`hawk2_L\`) |
| \`+0x008\` | 4 B | \`const char *model_b\` | Modelo 3D Roupa B (\`hawk2b\`) |
| \`+0x00C\` | 4 B | \`const char *model_b_low\` | Modelo 3D LOD baixo Roupa B (\`hawk2b_L\`) |
| \`+0x010\` / \`+0x014\` | 8 B | \`model_secret\` / \`_low\` | Modelo secreto/alternativo (ex.: \`secret4\` para 80's Tony) |
| \`+0x020\` | 4 B | \`const char *full_name\` | Nome completo exibido nos menus |
| \`+0x024\` | 4 B | \`const char *short_name\` | Nome curto |
| \`+0x028\` – \`+0x127\` | 256 B | \`DeckEntry decks[8]\` | 8 decks × 32 bytes (\`bmp_name\`, \`deck_name\`, \`flags\`, 3 bônus de atributos) |
| \`+0x128\` – \`+0x131\` | 10 B | \`uint8_t stats[10]\` | \`[Air, Hang, Ollie, Speed, Spin, Land, Switch, Rail, Lip, Manual]\` (1..10) |
| \`+0x132\` | 1 B | \`uint8_t stance\` | \`0 = Regular\`, \`1 = Goofy\` |
| \`+0x134\` | 4 B | \`const char *face_bmp\` | Textura de rosto no menu (ex.: \`s2face5.bmp\` em \`CD.WAD\`) |
| \`+0x138\` | 4 B | \`const char **bio_lines\` | Ponteiro para array de linhas da biografia |
| \`+0x140\` | 4 B | \`uint32_t scale_or_id\` | Escala/peso/ID interno |
| \`+0x150\` | 4 B | \`void *special_tricks\` | Ponteiro para lista de manobras especiais padrão |

---

## 2. Tabela Completa de Todos os 20 Skatistas

| Idx | RAM | Offset \`SLUS\` | Nome Atual | Modelo A / B | Rosto (\`.BMP\`) | Offset Stats (\`SLUS\`) | Stats \`[Air,Hng,Oll,Spd,Spn,Lnd,Swt,Rl,Lip,Man]\` | Vídeo Final |
| :-: | :---: | :---: | :--- | :--- | :--- | :---: | :--- | :--- |
`;

  const videoBySkater = [
    'X\\HAWK.STR','X\\BURNQUIS.STR','X\\CABALLER.STR','X\\CAMPBELL.STR','X\\GLIFBERG.STR',
    'X\\KOSTON.STR','X\\LASEK.STR','X\\MULLEN.STR','X\\MUSKA.STR','X\\REYNOLDS.STR',
    'X\\ROWLEY.STR','X\\STEAMER.STR','X\\THOMAS.STR','X\\BAILS01.STR','X\\BAILS01.STR',
    'X\\BAILS01.STR','X\\BAILS01.STR','X\\OD.STR','X\\PC.STR','X\\SM.STR'
  ];

  const decksSection = [];
  for (let i = 0; i < 20; i++) {
    const addr = 0x800B6834 + i * 0x154;
    const off = ramToOff(addr);
    const modA = readStr(exe.readUInt32LE(off)) || '?';
    const modB = readStr(exe.readUInt32LE(off + 8)) || '-';
    const fullName = readStr(exe.readUInt32LE(off + 0x20)) || '?';
    const face = readStr(exe.readUInt32LE(off + 0x134)) || '-';
    const stats = Array.from(exe.subarray(off + 0x128, off + 0x132));
    const statsFileOff = off + 0x128;
    md += `| ${i} | \`${hex(addr)}\` | \`${hex(off,6)}\` | **${mdEsc(fullName)}** | \`${modA}\` / \`${modB}\` | \`${face}\` | \`${hex(statsFileOff,6)}\` | \`[${stats.join(',')}]\` | \`${videoBySkater[i]}\` |\n`;

    // Collect 8 decks for pro skaters
    if (i < 13 || i >= 17) {
      const decks = [];
      for (let d = 0; d < 8; d++) {
        const doff = off + 0x28 + d * 0x20;
        const dbmp = readStr(exe.readUInt32LE(doff));
        const dname = readStr(exe.readUInt32LE(doff + 4));
        if (dbmp || dname) decks.push(`\`${dbmp || '-'}\` (${mdEsc(dname || '-')})`);
      }
      if (decks.length > 0) decksSection.push(`- **[${i}] ${mdEsc(fullName)}** (Bio \`${hex(exe.readUInt32LE(off + 0x138))}\` | Specials \`${hex(exe.readUInt32LE(off + 0x150))}\`): ${decks.join(' • ')}`);
    }
  }

  md += `\n---\n\n## 3. Decks, Biografias e Ponteiros de Especiais por Personagem\n\n` + decksSection.join('\n') + '\n';
  writeDoc('MAPA_04_PERSONAGENS_E_STATS.md', md);
}

// ============================================================================
// MAPA 05: TODAS AS MANOBRAS (tricks.bin)
// ============================================================================
{
  const trkEntry = wadEntries.find(e => e.idx === 11);
  const trk = wad.subarray(trkEntry.offset, trkEntry.offset + trkEntry.size);
  const trkLatin = trk.toString('latin1');

  // Parse all real trick entries matching 0x0B <ASCII name>\0 [optional 0x0A <uint16_le points>]
  const tricks = [];
  for (let i = 0; i < trk.length - 4; i++) {
    if (trk[i] === 0x0B) {
      // check if valid printable string right after 0x0B
      let j = i + 1;
      while (j < trk.length && trk[j] >= 0x20 && trk[j] <= 0x7E) j++;
      const len = j - (i + 1);
      if (len >= 3 && len <= 40 && j < trk.length && trk[j] === 0x00) {
        const name = trk.subarray(i + 1, j).toString('latin1');
        // Filter out non-trick garbage bytes
        if (/^[A-Za-z0-9{][\x20-\x7E]+$/.test(name)) {
          let pts = null, ptsOff = null;
          if (j + 3 < trk.length && trk[j + 1] === 0x0A) {
            pts = trk.readUInt16LE(j + 2);
            ptsOff = j + 2;
          }
          const isSpecial = name.startsWith('{') && name.endsWith('}');
          tricks.push({ off: i + 1, name, pts, ptsOff, isSpecial });
          i = j;
        }
      }
    }
  }

  let md = `# 🤸 MAPA 05 — Todas as Manobras (\`tricks.bin\`)

- **Localização no \`CD.HED\`:** Índice \`11\` | Hash \`${trkEntry.hash}\` (\`nsHash("tricks.bin")\`)
- **Localização no \`CD.WAD\`:** Offset \`${hex(trkEntry.offset)}\` | Tamanho \`${trkEntry.size}\` bytes
- **Carregamento em \`SLUS_010.66\`:** String \`"tricks.bin"\` em \`0x800D2848\`, carregada em \`0x80014130\`

---

## 1. Formato do Bytecode de Manobras

Dentro de \`tricks.bin\`, as definições de manobra seguem o padrão de bytecode da engine Neversoft:
\`\`\`text
[0x0B] [Nome ASCII da Manobra] [0x00] [0x0A] [uint16_le Pontuação Base] ...
\`\`\`
- Nomes entre chaves \`{...}\` indicam **Special Tricks** (manobras especiais douradas, ex.: \`{The 900}\`, \`{Heelflip Darkslide}\`, \`{Spidey Grind}\`).
- Para alterar a pontuação de qualquer manobra, basta editar os **2 bytes (\`uint16_le\`)** no offset de pontuação indicado abaixo e reempacotar \`CD.WAD\` com \`node tools/thps2_wad.js repack\`.

---

## 2. Catálogo Completo de Manobras Extraídas (\`${tricks.length}\` entradas)

| # | Offset em \`tricks.bin\` | Offset Absoluto \`CD.WAD\` | Nome da Manobra | Tipo | Offset Pontos (\`tricks.bin\`) | Pontos Base |
| :-: | :---: | :---: | :--- | :---: | :---: | :---: |
`;
  tricks.forEach((t, idx) => {
    const ptsStr = t.pts !== null ? String(t.pts) : '*(variável/combo)*';
    const ptsOffStr = t.ptsOff !== null ? `\`+${hex(t.ptsOff,4)}\`` : '—';
    md += `| ${idx + 1} | \`+${hex(t.off,4)}\` | \`${hex(trkEntry.offset + t.off)}\` | \`${mdEsc(t.name)}\` | ${t.isSpecial ? '⭐ Special' : 'Normal'} | ${ptsOffStr} | **${ptsStr}** |\n`;
  });

  writeDoc('MAPA_05_MANOBRAS_TRICKS_BIN.md', md);
}

// ============================================================================
// MAPA 06: TEXTURAS, FONTES, .PRE E CENSO COMPLETO DE CD.HED / CD.WAD
// ============================================================================
{
  const typeCounts = new Map();
  for (const e of wadEntries) {
    if (!typeCounts.has(e.type)) typeCounts.set(e.type, { total: 0, bytes: 0, res: 0 });
    const o = typeCounts.get(e.type);
    o.total++; o.bytes += e.size;
    if (!e.name.startsWith('(unknown_')) o.res++;
  }

  let md = `# 🎨 MAPA 06 — Texturas (\`.BMP\`), Fontes (\`.FNT\`), Sub-arquivos \`.PRE\` e \`CD.WAD\`

- **\`CD.HED\`:** \`${hed.length}\` bytes = **\`${wadEntries.length}\` entradas × 12 bytes** (\`uint32 hash, uint32 offset, uint32 size\`) + \`00 00 00 00\`.
- **\`CD.WAD\`:** \`${wad.length}\` bytes (\`${(wad.length / 1048576).toFixed(2)} MB\`). **Regra crítica descoberta:** todos os arquivos são alinhados em setores de \`2048\` bytes (\`0x800\`), e até os 2 arquivos de tamanho \`0\` (\`idx 525\` e \`527\`) ocupam **1 setor de \`2048\` bytes** no \`CD.WAD\`.

---

## 1. Censo Completo por Categoria (\`1.531\` Arquivos)

| Categoria | Quantidade | Resolvidos por Nome | Tamanho Total | Descrição |
| :--- | :-: | :-: | :---: | :--- |
`;
  for (const [t, o] of [...typeCounts.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const desc = {
      BMP: 'Texturas 2D, roupas de skatista, rostos, decks, telas de loading e UI (BMP 4-bit/8-bit indexado)',
      PSX: 'Modelos 3D, geometria de fases, skyboxes e texturas VRAM embutidas (magic `04 00 02 00`)',
      PSH: 'Headers C em texto plano (`#ifndef ..._PSH`) com hierarquia de ossos/esqueletos',
      PRK: '50 parques pré-fabricados do Park Editor (`park0.prk`..`park49.prk`, 2.560 B cada)',
      DATA: 'Fontes (`.fnt`), `tricks.bin`, tabelas de animação e dados binários',
      TRG: 'Triggers, spawns, coletáveis, rails e gaps das fases (`_TRG v2.0`)',
      VAB: 'Bancos de efeitos sonoros PSX (`pBAV`: header `.VH` + corpo ADPCM `.VB`)',
      OVL_BIN: '15 overlays de código MIPS R3000A relocáveis (menus, editor, opções)',
      OVL_REL: '15 tabelas de relocação de ponteiros para os overlays `.BIN`',
      PRE: '14 sub-arquivos empacotados de telas/HUD (contêm `.bmp`, `.fnt`, `.psx` e `.bin`)',
      EMPTY: 'Entradas vazias (0 bytes, mas reservam 2048 B no `CD.WAD`)'
    }[t] || 'Outros';
    md += `| **\`${t}\`** | ${o.total} | ${o.res} (${((o.res/o.total)*100).toFixed(0)}%) | ${(o.bytes/1048576).toFixed(2)} MB | ${desc} |\n`;
  }

  // Inspect ALL 14 .PRE sub-archives and list EVERY internal file!
  md += `\n---\n\n## 2. Mapeamento Interno Completo de Todos os 14 Pacotes \`.PRE\`\n\n`;
  md += `Formato interno de um \`.PRE\`: \`uint32 file_count\`, seguido por \`file_count\` blocos de \`[char name[] alinhado a 4 bytes][uint32 size][payload alinhado a 4 bytes]\`.\n\n`;

  const alignUp = (n, a) => (n + (a - 1)) & ~(a - 1);
  const preEntries = wadEntries.filter(e => e.type === 'PRE');
  for (const pe of preEntries) {
    const buf = wad.subarray(pe.offset, pe.offset + pe.size);
    const cnt = buf.readUInt32LE(0);
    let pos = 4;
    const items = [];
    for (let i = 0; i < cnt; i++) {
      const nul = buf.indexOf(0, pos);
      const name = buf.subarray(pos, nul).toString('ascii');
      pos += alignUp(nul - pos + 1, 4);
      const sz = buf.readUInt32LE(pos);
      pos += 4;
      items.push({ name, sz });
      pos = (i < cnt - 1) ? alignUp(pos + sz, 4) : pos + sz;
    }
    md += `### \`${pe.name}\` (CD.HED idx=${pe.idx} | Hash \`${pe.hash}\` | \`CD.WAD +${hex(pe.offset)}\` | ${pe.size} B | **${cnt} arquivos internos**)\n`;
    md += items.map(it => `\`${it.name}\` (${it.sz} B)`).join(' • ') + '\n\n';
  }

  // Fonts & Key UI textures list
  const fonts = wadEntries.filter(e => /\.fnt$/i.test(e.name));
  md += `---\n\n## 3. Fontes (\`.FNT\`) Diretas em \`CD.WAD\` (Para Acentuação PT-BR)\n\n`;
  md += `| Idx | Arquivo | Hash | Offset \`CD.WAD\` | Tamanho |\n| :-: | :--- | :---: | :---: | :---: |\n`;
  for (const f of fonts) md += `| ${f.idx} | \`${f.name}\` | \`${f.hash}\` | \`${hex(f.offset)}\` | ${f.size} B |\n`;

  // Key BMP categories (faces, backgrounds, loading screens, decks)
  const uiBmps = wadEntries.filter(e => /^(s2bgd|s2face|s2press|s2logo|s2icon|load|loading|s2_scrib)/i.test(e.name));
  md += `\n---\n\n## 4. Texturas-Chave de UI, Rostos e Telas de Loading (\`${uiBmps.length}\` principais)\n\n`;
  md += `| Idx | Arquivo | Hash | Offset \`CD.WAD\` | Tamanho |\n| :-: | :--- | :---: | :---: | :---: |\n`;
  for (const b of uiBmps) md += `| ${b.idx} | \`${b.name}\` | \`${b.hash}\` | \`${hex(b.offset)}\` | ${b.size} B |\n`;

  md += `\n> **Para listar ou extrair TODOS os 1.531 arquivos (incluindo todas as 1.040 texturas \`.BMP\` e 227 modelos \`.PSX\`):**\n> \`\`\`powershell\n> node Scripts/thps2_wad.js list\n> node Scripts/thps2_wad.js unpack work_wad --pre\n> \`\`\`\n`;

  writeDoc('MAPA_06_TEXTURAS_FONTES_E_WAD.md', md);
}

// ============================================================================
// MAPA 07: CHEATS, COMANDOS E TABELA MESTRA DE STRINGS
// ============================================================================
{
  let md = `# 🎮 MAPA 07 — Cheats, Comandos de Controle e Tabela Mestra de Strings (\`g_StringTable\`)

---

## 1. Sistema de Cheats no \`SLUS_010.66\`

- **Ponteiros de nome dos cheats:** \`0x800C028C\` – \`0x800C02D4\` (dentro de \`g_StringTable[]\`)
- **Handler do menu de cheats:** \`0x80026C48\` (jump tables em \`0x800AFC18\`, \`0x800AFC50\`, \`0x800AFC88\`)

| Ponteiro RAM | Offset \`SLUS\` | String RAM | Texto Atual na ISO | Efeito no Jogo |
| :---: | :---: | :---: | :--- | :--- |
`;
  const cheatDesc = [
    'Equilíbrio perfeito em grind, lip e manual',
    'Barra Special sempre cheia (100%)',
    'Atributos no máximo (10/10 em tudo)',
    'Altera massa/peso do skatista',
    'Renderização em wireframe (arame)',
    'Câmera lenta durante manobras',
    'Modo Cabeção (Big Head)',
    'Modo Criança (Kid Mode)',
    'Física realista (Sim Mode)',
    'Suavização visual (Smooth)',
    'Skate gigante (Big Board)',
    'Fases esticadas verticalmente',
    'Fases alargadas horizontalmente',
    'Gravidade lunar (Moon Physics)',
    'Luzes coloridas piscantes (Disco Mode)',
    'Fases espelhadas (Level Flip)',
    'Desbloqueia 80\'s Tony (McSqueeb)',
    'Desbloqueia Spider-Man',
    'Desbloqueia Officer Dick (Gordao)'
  ];
  for (let i = 0; i < 19; i++) {
    const ptrRam = 0x800C028C + i * 4;
    const ptrOff = ramToOff(ptrRam);
    const strRam = exe.readUInt32LE(ptrOff);
    const s = readStr(strRam) || '?';
    md += `| \`${hex(ptrRam)}\` | \`${hex(ptrOff,6)}\` | \`${hex(strRam)}\` | \`${mdEsc(s)}\` | ${cheatDesc[i] || ''} |\n`;
  }

  md += `\n---

## 2. Máscara de Bits dos Botões do Controle PS1 (Psy-Q \`PadRead\`)

Essencial para encontrar rotinas de combos, comandos de manobras e sequências de cheat no Ghidra (procurando instruções \`andi $reg, <mask>\` sobre a palavra de 16 bits do controle):

| Botão PS1 | Máscara Bit (Ativo = 1 em Psy-Q invertido) | Uso Padrão no THPS2 |
| :--- | :---: | :--- |
| \`SELECT\` | \`0x0001\` | Troca câmera |
| \`L3\` / \`R3\` | \`0x0002\` / \`0x0004\` | Analógico (DualShock) |
| \`START\` | \`0x0008\` | Menu de Pausa (onde os cheats com \`L1\` são inseridos) |
| \`UP\` / \`RIGHT\` / \`DOWN\` / \`LEFT\` | \`0x0010\` / \`0x0020\` / \`0x0040\` / \`0x0080\` | Direção, Manuais (\`UP+DOWN\`), Flip/Grab direcionais |
| \`L2\` / \`R2\` | \`0x0100\` / \`0x0200\` | Nollie / Switch Stance |
| \`L1\` / \`R1\` | \`0x0400\` / \`0x0800\` | Giro (Spin Left/Right) • **\`L1\` segurado = ativador de cheats no Pause** |
| \`TRIANGLE\` | \`0x1000\` | Grind / Lip Trick |
| \`CIRCLE\` | \`0x2000\` | Grab |
| \`CROSS (X)\` | \`0x4000\` | Ollie / Agachar / Confirmar |
| \`SQUARE\` | \`0x8000\` | Flip Trick |

---

## 3. Tabela Mestra de Strings / Tradução (\`g_StringTable[]\`)

- **Intervalo em RAM:** \`0x800BF2E0\` até \`0x800C0888\` (**1.387 ponteiros \`const char*\`**)
- **Intervalo no Arquivo \`SLUS_010.66\`:** \`0x0AFAE0\` até \`0x0B1088\`
- **Funções de leitura:** \`0x80038B2C\`, \`0x80067DA0\`, \`0x80067E84\`, \`0x800680B8\`, \`0x8006840C\`, \`0x80068454\`

### Como Traduzir Sem Limite de Caracteres (Técnica Profissional)
1. Em vez de sobrescrever a string original inline (que limita o tamanho ao texto em inglês), grave a nova string PT-BR em uma área livre no fim do executável (expandindo \`t_size\` em múltiplos de \`0x800\` se necessário).
2. Altere apenas o ponteiro de 4 bytes correspondente dentro de \`g_StringTable[]\` (\`0x800BF2E0..0x800C0888\`) para o novo endereço RAM.
3. Observe o caractere especial **\`&\`** usado pela engine Neversoft como **quebra de linha** nas caixas de diálogo (ex.: \`"Salvou&[%s]...&espera..."\`).

### Amostra das Strings PT-BR Já Presentes no \`SLUS_010.66\`

| Endereço RAM | Offset \`SLUS_010.66\` | Texto Atual |
| :---: | :---: | :--- |
`;
  const raw = exe.toString('latin1');
  const ptRe = /\b(nao|voce|fase|bosta|merda|lixo|vergonha|choro|mude|jogar|escolha|carregando|salvou|espera|sair|nasceu|cresceu|noob|pega|conto|cabecao|crianca|porra)\b/i;
  const reStr = /[\x20-\x7E]{4,}/g;
  let sm;
  let shown = 0;
  while ((sm = reStr.exec(raw)) !== null && shown < 55) {
    if (sm.index >= 0x800 && ptRe.test(sm[0])) {
      const ram = offToRam(sm.index);
      md += `| \`${hex(ram)}\` | \`${hex(sm.index,6)}\` | \`${mdEsc(sm[0])}\` |\n`;
      shown++;
    }
  }

  writeDoc('MAPA_07_CHEATS_COMANDOS_E_STRINGS.md', md);
}

// ============================================================================
// MAPA 08: AUDIO (COMPILED.XA + .VAB) E VIDEOS (.STR + MovieTable)
// ============================================================================
{
  let md = `# 🎵🎬 MAPA 08 — Áudio (\`COMPILED.XA\`, \`.VAB\`) e Vídeos (\`.STR\`, \`g_MovieTable\`)

---

## 1. Trilha Sonora Streaming (\`COMPILED.XA\`)

| Propriedade | Valor Verificado |
| :--- | :--- |
| Arquivo no Disco | \`\\COMPILED.XA;1\` (referenciado em \`SLUS_010.66 @ 0x800D6184\` por \`0x80038974\`) |
| Formato Extraído no Workspace | **RIFF-CDXA**: 44 bytes header + **\`105.952\` setores raw de \`2352\` bytes** (\`249.199.148\` bytes) |
| Formato Necessário para \`mkpsxiso\` | **Raw Mode 2 Form 2**: \`105.952 × 2336\` bytes (convertido automaticamente por \`Scripts/psx_media.js\`) |
| Codec / Interleaving | **XA-ADPCM 4-bit, 37.800 Hz, Stereo**, \`File=1\`, **8 canais intercalados (\`ch 0..7\`)**, \`Submode=0x64\`, \`Coding=0x01\` |
| Taxa de Leitura por Canal | \`150 setores/s ÷ 8 canais = 18,75 setores/segundo\` por música |

### Tabela de Durações das Faixas (\`g_XATrackLengths @ 0x800BA4F4\`)
Referenciada por \`0x80038AEC\` e \`0x80038CBC\`. Ao substituir músicas em \`COMPILED.XA\`, atualize o comprimento correspondente em setores-por-canal (\`segundos × 18.75\`):

| Índice | Endereço RAM | Offset \`SLUS_010.66\` | Valor (Setores/Canal) | Duração Aprox. |
| :-: | :---: | :---: | :---: | :---: |
`;
  for (let i = 0; i < 24; i++) {
    const a = 0x800BA4F4 + i * 4;
    const o = ramToOff(a);
    const v = exe.readUInt32LE(o);
    if (v === 0 && i > 18) break;
    const dur = v === 0xFFFFFFFF ? '*(vazio / marcador)*' : `\`${(v / 18.75).toFixed(2)}s\``;
    md += `| ${i} | \`${hex(a)}\` | \`${hex(o,6)}\` | \`${v === 0xFFFFFFFF ? '0xFFFFFFFF' : v}\` | ${dur} |\n`;
  }

  // 17 .VAB sound banks
  const vabs = wadEntries.filter(e => e.type === 'VAB');
  md += `\n---\n\n## 2. Todos os 17 Bancos de Efeitos Sonoros (\`.VAB\` em \`CD.WAD\`)\n\n`;
  md += `> **Limite de Hardware PS1:** a SPU RAM total do PlayStation 1 é de **512 KB (524.288 bytes)**. Nunca exceda o espaço disponível de SPU RAM ao editar efeitos sonoros com *VABTool* / *PSound*.\n\n`;
  md += `| Idx \`CD.HED\` | Arquivo | Hash | Offset \`CD.WAD\` | Tamanho |\n| :-: | :--- | :---: | :---: | :---: |\n`;
  for (const v of vabs) md += `| ${v.idx} | \`${v.name}\` | \`${v.hash}\` | \`${hex(v.offset)}\` | ${v.size} B |\n`;

  // Complete 35-entry MovieTable!
  md += `\n---\n\n## 3. Tabela Completa de Vídeos (\`g_MovieTable @ 0x800C1CB4\`, stride \`0x24\`)\n\n`;
  md += `- **Player MDEC/STR em \`SLUS_010.66\`:** \`0x8007A6B8\`, \`0x8007A724\`, \`0x8007A8B0\`, \`0x8007AD80\`, \`0x8007AD9C\`, \`0x8007AE90\`.\n`;
  md += `- **ATENÇÃO CRÍTICA PARA ÁUDIO:** todos os vídeos com áudio usam **\`File=1, Channel=1\` (\`-F 1 -C 1 -X\`)**. Usar o padrão \`0/0\` do \`psxavenc\` deixa os vídeos mudos no jogo!\n\n`;
  md += `| Idx | RAM | Offset \`SLUS\` | Arquivo CD | Rótulo | Res. | \`num_frames\` (\`+0x0E\`) | FrameBuf | Áudio | Modo ISO |\n`;
  md += `| :-: | :---: | :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: |\n`;

  for (let i = 0; i < 35; i++) {
    const a = 0x800C1CB4 + i * 0x24;
    const o = ramToOff(a);
    const sPath = readStr(exe.readUInt32LE(o)) || '?';
    const pLab = exe.readUInt32LE(o + 4);
    const sLab = pLab ? (readStr(pLab) || '-') : '*(preview)*';
    const w = exe.readUInt16LE(o + 10);
    const h = exe.readUInt16LE(o + 12);
    const nf = exe.readUInt16LE(o + 14);
    const fb = exe.readUInt32LE(o + 16);
    const aud = exe.readUInt32LE(o + 24);
    const mode = aud === 0 ? 'data (2048B)' : 'str (2336B)';
    md += `| ${i} | \`${hex(a)}\` | \`${hex(o,6)}\` | \`${sPath}\` | ${mdEsc(sLab)} | ${w}×${h} | **${nf}** | \`${hex(fb,6)}\` | ${aud ? 'Sim' : 'Não'} | ${mode} |\n`;
  }

  writeDoc('MAPA_08_AUDIO_XA_VAB_E_VIDEOS_STR.md', md);
}

// ============================================================================
// MAPA 09: OVERLAYS RELOCAVEIS (.BIN/.REL) E DEMO BMX
// ============================================================================
{
  const ovls = wadEntries.filter(e => e.type === 'OVL_BIN');
  const rels = wadEntries.filter(e => e.type === 'OVL_REL');

  let md = `# 🧩 MAPA 09 — Overlays MIPS Relocáveis (\`.BIN\`/\`.REL\`) e Demo Embutida (\`BMX\\\`)

---

## 1. Todos os 15 Overlays de Código MIPS em \`CD.WAD\`

Para economizar os 2 MB de RAM do PS1, o THPS2 carrega a lógica de cada tela de menu/editor dinamicamente a partir de pares **\`<nome>.bin\` + \`<nome>.rel\`** dentro de \`CD.WAD\`.
- Todo overlay \`.BIN\` começa com stubs relocáveis \`lui $v0, 0x0000 / addiu $v0, ...\` (\`00 00 02 3C\`), cujos endereços absolutos são corrigidos em tempo de carga pela tabela \`.REL\` correspondente.

| # | Overlay \`.BIN\` | Idx \`CD.HED\` | Hash \`.BIN\` | Offset \`CD.WAD\` | Tamanho \`.BIN\` | Relocação \`.REL\` (Idx / Tamanho) | Responsabilidade |
| :-: | :--- | :-: | :---: | :---: | :---: | :--- | :--- |
`;

  const ovlDesc = {
    'credits.bin': 'Tela de Créditos',
    'mainmenu.bin': 'Menu Principal',
    'cresave.bin': 'Salvar/Carregar Skatista Customizado',
    'cresel.bin': 'Seleção de Skatista Customizado',
    'handicap.bin': 'Configuração de Handicap (2P)',
    'levelsel.bin': 'Seleção de Fases e Previews .STR',
    'multisel.bin': 'Seleção de Modos Multiplayer',
    'options.bin': 'Menu de Opções, Áudio, Música e Cheats',
    'equipsel.bin': 'Seleção de Equipamentos / Decks',
    'edmod.bin': 'Park Editor (Editor Completo de Pistas)',
    'carsel.bin': 'Seleção de Carreira',
    'statedit.bin': 'Tela de Edição de Stats',
    'tricksel.bin': 'Tela de Edição e Compra de Manobras',
    'playsel.bin': 'Tela de Seleção de Skatista (Roster)',
    'creedit.bin': 'Create-a-Skater (Editor de Personagem)'
  };

  ovls.forEach((o, i) => {
    const rel = rels.find(r => r.idx === o.idx + 1);
    const relTxt = rel ? `\`${rel.name}\` (idx ${rel.idx}, ${rel.size} B)` : '—';
    md += `| ${i + 1} | \`${o.name}\` | ${o.idx} | \`${o.hash}\` | \`${hex(o.offset)}\` | ${o.size} B | ${relTxt} | ${ovlDesc[o.name] || ''} |\n`;
  });

  // Parse BMX directory
  const bmxHed = fs.readFileSync(path.join(rootDir, 'BMX', 'BMXCD.HED'));
  const bmxEntries = [];
  let pos = 0;
  while (pos < bmxHed.length && bmxHed[pos] !== 0xFF) {
    const nul = bmxHed.indexOf(0, pos);
    if (nul < 0) break;
    const name = bmxHed.subarray(pos, nul).toString('ascii');
    let nxt = nul + 1;
    while (nxt % 4 !== 0) nxt++;
    bmxEntries.push({ name, offset: bmxHed.readUInt32LE(nxt), size: bmxHed.readUInt32LE(nxt + 4) });
    pos = nxt + 8;
  }

  // Parse BMX/FE.WAD
  const feWad = fs.readFileSync(path.join(rootDir, 'BMX', 'FE.WAD'));
  const feItems = [];
  for (let off = 0; off + 32 <= feWad.length; off += 32) {
    const nul = feWad.indexOf(0, off);
    const name = feWad.subarray(off, Math.min(nul >= 0 ? nul : off + 20, off + 20)).toString('ascii');
    if (!name) continue;
    feItems.push({ name, offset: feWad.readUInt32LE(off + 20), size: feWad.readUInt32LE(off + 24) });
  }

  md += `\n---

## 2. Demo Jogável Embutida — Pasta \`BMX\\\` (*Mat Hoffman's Pro BMX*)

Acionada a partir de \`SLUS_010.66 @ 0x8003D3E8\` via \`cdrom:\\BMX\\X.EXE;1\`.

| Arquivo | Tamanho | Papel Técnico |
| :--- | :---: | :--- |
| \`BMX\\X.EXE\` | 81.920 B | Executável \`PS-X EXE\` (\`0x80010000..0x80023800\`, \`PC=0x80023718\`) — loader dos overlays |
| \`BMX\\BOOT.BIN\` | 32.060 B | Overlay MIPS de boot (header 4B \`0x0A\` + código MIPS) |
| \`BMX\\FRONT.BIN\` | 217.092 B | Overlay MIPS do menu frontend (header 4B \`0x11\` + código MIPS) |
| \`BMX\\GAME.BIN\` | 623.164 B | Overlay MIPS principal de gameplay (header 4B \`0x18\` + código MIPS) |
| \`BMX\\EDITOR.BIN\` | 809.252 B | Overlay MIPS do editor de pistas (header 4B \`0x1F\` + código MIPS) |
| \`BMX\\EXIT.BIN\` | 860 B | Overlay MIPS de retorno ao menu/boot (header 4B \`0x26\` + código MIPS) |
| \`BMX\\BMXCD.HED\` / \`BMXCD.WAD\` | 4.677 B / 8,09 MB | Arquivo estilo THPS1 (nomes em texto plano + offset + size, terminador \`0xFF\`, **${bmxEntries.length} arquivos**) |
| \`BMX\\FE.WAD\` / \`BMX\\FE.STR\` | 2.912 B / 4,50 MB | **ATENÇÃO:** \`BMX\\FE.STR\` **NÃO é vídeo!** É o blob binário indexado por \`FE.WAD\` (**${feItems.length} arquivos**) |

### Amostra dos Arquivos em \`BMX\\FE.WAD\` → \`BMX\\FE.STR\`
` + feItems.slice(0, 20).map(it => `- \`${it.name}\`: offset \`${hex(it.offset)}\`, tamanho \`${it.size}\` B`).join('\n') + `\n`;

  writeDoc('MAPA_09_OVERLAYS_E_DEMO_BMX.md', md);
}

console.log('\nTodos os 9 mapas tecnicos gerados com sucesso em repo/Docs/ e docs/!');
