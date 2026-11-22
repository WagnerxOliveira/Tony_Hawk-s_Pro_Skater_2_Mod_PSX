# 🛹 Tony Hawk's Pro Skater 2 (PS1 / SLUS-01066) — Engenharia Reversa & Modding Suite

<p align="center">
  <b>Documentação técnica completa de engenharia reversa, mapeamento binário de memória/assets e suíte automatizada de modding para Tony Hawk's Pro Skater 2 (PlayStation 1 — NTSC-U <code>SLUS-01066</code>).</b>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/Platform-PlayStation%201%20(MIPS%20R3000A)-003087?style=for-the-badge">
  <img alt="Game ID" src="https://img.shields.io/badge/Title%20ID-SLUS--01066%20(NTSC--U)-2ea44f?style=for-the-badge">
  <img alt="Engine" src="https://img.shields.io/badge/Engine-Neversoft%20%2F%20Psy--Q%20SDK-orange?style=for-the-badge">
  <img alt="Tools" src="https://img.shields.io/badge/Toolkit-Node.js%20%7C%20Ghidra%20%7C%20mkpsxiso%20%7C%20psxavenc-blueviolet?style=for-the-badge">
</p>

---

## 🎮 Como Baixar e Jogar o Mod (3 Passos Simples — Patch `.xdelta`)

Seguindo o padrão profissional e legal de ROM hacking, o mod é distribuído na aba **[Releases](https://github.com/WagnerxOliveira/Tony_Hawk-s_Pro_Skater_2_Mod_PSX/releases/latest)** como um **patch delta binário (`.xdelta`)**, contendo apenas as modificações (sem distribuir a imagem original comercial):

1. **Baixe os arquivos da [Última Release](https://github.com/WagnerxOliveira/Tony_Hawk-s_Pro_Skater_2_Mod_PSX/releases/latest):**
   - `THPS2_MOD_NTSC-U.xdelta` *(patch delta verificado bit-a-bit)*
   - `THPS2_MOD_Patcher_e_Guia.zip` *(contém o aplicador em 1 clique `Aplicar_Patch_THPS2.bat`, `xdelta3.exe`, `THPS2_MOD.cue` e guia)*
2. **Aplique sobre sua cópia original limpa** de *Tony Hawk's Pro Skater 2 (USA / NTSC-U `SLUS-01066`, Redump)*:
   - **Base requerida:** `748.037.136 bytes` (`318.043 setores`) • MD5 `AC85AE22723EAF944B0F899AA53244DD` • SHA-1 `F5CB80A7D55AACED7FCC9C5A82A6C28B89DC489A`
   - **Windows (1 clique):** extraia o ZIP, coloque o `.xdelta` na mesma pasta e **arraste o seu `.bin` original** para cima de `Aplicar_Patch_THPS2.bat`.
   - **Alternativa GUI (Windows/Linux/macOS):** use o [Delta Patcher](https://github.com/marco-calautti/DeltaPatcher/releases) selecionando seu `.bin` original + `THPS2_MOD_NTSC-U.xdelta`.
3. **Jogue no Emulador:** abra o arquivo **`THPS2_MOD.cue`** gerado no **DuckStation**, **PCSX-Redux** ou **RetroArch** *(ou grave/rode em PS1 compatível — a imagem preserva os 16 setores de licença originais e o layout LBA exato!)*.
   - **Perfil otimizado DuckStation (`SLUS-01066.ini`, incluso no ZIP):** copie para a pasta `gamesettings/` do DuckStation para garantir **zero input lag** (`MaxQueuedFrames = 2`), **zero sumiço do skatista/objetos** (`PGXPDepthBuffer = false`, `WidescreenHack = false`, `4:3`) e gráfico limpo em 1080p!

---

## 🎯 Visão Geral

Este repositório é uma base aberta de **engenharia reversa, documentação binária e automação de build** para **Tony Hawk's Pro Skater 2 (PSX)**. Todo o mapeamento de endereços de RAM, offsets de arquivo, estruturas da engine Neversoft, formatos proprietários (`CD.HED`, `CD.WAD`, `.PRE`, `.TRG`, `tricks.bin`, `.BIN/.REL`, `.STR`, `.XA`) e scripts de empacotamento foi verificado diretamente contra os binários reais do jogo, com validação **bit-a-bit (SHA-256)** de desempacotamento e reempacotamento.

---

## 📚 Enciclopédia Técnica de Mapeamento (`Docs/`)

Cada subsistema do jogo possui seu próprio mapa dedicado com **endereços RAM (`0x800xxxxx`)**, **offsets de arquivo**, **layouts de structs C** e **instruções práticas de modificação**:

| Documento | Escopo Mapeado |
| :--- | :--- |
| 📘 **[MAPA 01 — Memória e Executável (`SLUS_010.66`)](Docs/MAPA_01_MEMORIA_E_EXECUTAVEL.md)** | Cabeçalho `PS-X EXE`, conversão `File ↔ RAM`, mapa completo dos 2 MB de RAM, Entry Point `0x800A2910`, algoritmo exato `Neversoft_HashFilename` (`0x80053F10`), registro forense de patches e integração Ghidra. |
| ⏱️ **[MAPA 02 — Cronômetro, Física e Pontuação](Docs/MAPA_02_CRONOMETRO_FISICA_E_PONTUACAO.md)** | Rotinas de cronômetro (`0x800833E8`), modos de jogo (`0x800BA600`), camadas de física/gravidade/equilíbrio, stats base, bônus de decks e multiplicadores de pontuação. |
| 🗺️ **[MAPA 03 — Fases (`g_LevelTable`) e Objetos (`.TRG`)](Docs/MAPA_03_FASES_E_OBJETOS_TRG.md)** | Todas as **11 fases** em `0x800B8444` (stride `0x174`), objetivos, dinheiro, gap lists, anatomia do formato `_TRG v2.0`, e **todos os 25 arquivos `.TRG`** com **coordenadas reais `(X, Y, Z)`** de spawns, coletáveis (S-K-A-T-E, fitas, cash) e objetos. |
| 🛹 **[MAPA 04 — Personagens (`g_SkaterTable`), Stats e Decks](Docs/MAPA_04_PERSONAGENS_E_STATS.md)** | Todos os **20 skatistas** em `0x800B6834` (stride `0x154`), modelos 3D (`.PSX`/`.PSH`), rostos (`.BMP`), 10 atributos iniciais (`+0x128`), todos os **8 decks por skatista**, bios (`+0x138`) e especiais (`+0x150`). |
| 🤸 **[MAPA 05 — Todas as Manobras (`tricks.bin`)](Docs/MAPA_05_MANOBRAS_TRICKS_BIN.md)** | Anatomia do bytecode (`0x0B <nome>\0 0x0A <uint16 pontos>`) e **catálogo completo de todas as manobras** com offset interno, offset absoluto no `CD.WAD`, tipo (Normal / Special) e pontuação base. |
| 🎨 **[MAPA 06 — Texturas, Fontes, `.PRE` e `CD.WAD`](Docs/MAPA_06_TEXTURAS_FONTES_E_WAD.md)** | Relação `CD.HED` × `CD.WAD` (alinhamento `2048 B` + regra das entradas vazias), censo dos **1.531 arquivos**, **mapeamento interno de todos os 14 pacotes `.PRE`**, fontes `.FNT` e texturas principais de UI. |
| 🎮 **[MAPA 07 — Cheats, Comandos e Tabela de Strings](Docs/MAPA_07_CHEATS_COMANDOS_E_STRINGS.md)** | Todos os cheats (`g_CheatStringPtrs @ 0x800C028C`, handler `0x80026C48`), máscara de bits do controle PS1 (`PadRead`), e **Tabela Mestra de Localização `g_StringTable[]` (`0x800BF2E0..0x800C0888`, 1.387 ponteiros)**. |
| 🎵 **[MAPA 08 — Áudio (`COMPILED.XA`, `.VAB`) e Vídeos (`.STR`)](Docs/MAPA_08_AUDIO_XA_VAB_E_VIDEOS_STR.md)** | Estrutura de 8 canais intercalados de `COMPILED.XA`, tabela `g_XATrackLengths @ 0x800BA4F4`, todos os **17 bancos `.VAB`** (limite 512 KB SPU RAM) e **todos os 35 registros de `g_MovieTable @ 0x800C1CB4`** (`File=1, Channel=1`). |
| 🧩 **[MAPA 09 — Overlays `.BIN`/`.REL` e Demo `BMX\`](Docs/MAPA_09_OVERLAYS_E_DEMO_BMX.md)** | Todos os **15 overlays MIPS relocáveis** (`edmod.bin`, `creedit.bin`, `options.bin`, `levelsel.bin`, etc.) + anatomia completa da demo jogável *Mat Hoffman's Pro BMX* (`BMX\X.EXE`, `BMXCD.HED`, `FE.WAD`/`FE.STR`). |
| 🛠️ **[Guia de Ferramentas Utilizadas](Docs/Ferramentas_utilizadas.md)** | Ecossistema completo de análise estática/dinâmica (Ghidra, `ghidra_psx_ldr`, PCSX-Redux, DuckStation, HxD, `mkpsxiso`, `psxavenc`, `ffmpeg`). |

---

## ⚙️ Suíte de Automação e Ferramentas (`Scripts/`)

| Script | Linguagem | Função |
| :--- | :---: | :--- |
| **[`Scripts/thps2_wad.js`](Scripts/thps2_wad.js)** | Node.js | Unpack/Repack completo de `CD.HED`, `CD.WAD` e todos os 14 `.PRE` com resolução automática de **1.161+ nomes reais** e integridade **SHA-256 bit-a-bit**. |
| **[`Scripts/psx_media.js`](Scripts/psx_media.js)** | Node.js | Conversor streaming `RIFF-CDXA (44B+2352B) ↔ Raw Mode 2 (2336B)`, normalizador de contagem exata de setores e gerador do XML do `mkpsxiso`. |
| **[`Scripts/build_iso.js`](Scripts/build_iso.js)** | Node.js | Compilador em um comando da imagem `.BIN/.CUE` via `mkpsxiso v2.30` preservando a **ordem exata de LBAs Redump e os 16 setores de licença originais**. |
| **[`Scripts/create_patch.js`](Scripts/create_patch.js)** | Node.js | Gera `THPS2_MOD_NTSC-U.xdelta` (`xdelta3 -3 -S none`) comparando com o `.BIN` original Redump e executa **validação round-trip SHA-256 automática**. |
| **[`Scripts/sync_and_release.js`](Scripts/sync_and_release.js)** | Node.js | Pipeline mestre: recompila a ISO, audita 10 estágios forenses (`audit_game.js`), regenera e valida o `.xdelta`, atualiza os 9 mapas `Docs/`, faz commit/push no GitHub e publica automaticamente a Release. |
| **[`Scripts/mod_skater_lulao.js`](Scripts/mod_skater_lulao.js)** | Node.js | Transformação cirúrgica do Steve Caballero em **Lulao** (Style A terno + faixa, Style B uniforme listrado, retrato `s2face2.bmp` e escultura 3D nos 4 `.PSX`). |
| **[`Scripts/mod_skater_bolsonaro.js`](Scripts/mod_skater_bolsonaro.js)** | Node.js | Transformação cirúrgica do Kareem Campbell em **Bolsonaro** (Style A terno + faixa, Style B uniforme listrado `"171"`, retrato `s2face3.bmp`, mãos claras e escultura 3D sem boné nos 4 `.PSX`). |
| **[`Scripts/mod_hangar_walls.js`](Scripts/mod_hangar_walls.js)** | Node.js | Aplica murais 256 cores de **Lulao e Bolsonaro** em 6 paredes principais da Fase 1 (*The Hangar* — `skhan_l.psx`, visíveis em 1P e 2P). |
| **[`Scripts/fix_game_errors.js`](Scripts/fix_game_errors.js)** | Node.js | Correção cirúrgica e reprodutível de todos os bugs binários (8 opcodes MIPS `120→300`, header NTSC-U `+0x4C`, caractere `0xE3`, `cab_L.psx Mesh[15]` e flag EOF prematura nos `.STR`). |
| **[`Scripts/audit_game.js`](Scripts/audit_game.js)** | Node.js | Validador forense automatizado em **10 estágios** (código MIPS, 174 strings, 1.531 entradas `CD.WAD`, 4 `.PSX`, 48 LBAs, 16 setores de licença, 20 `.STR`, `COMPILED.XA` e 318.043 setores EDC/MSF). |
| **[`Scripts/replace_videos.js`](Scripts/replace_videos.js)** | Node.js | Pipeline cirúrgico (`ffmpeg` + `psxavenc`) para substituir `INTRO.STR` e os 19 `X\*.STR` mantendo `320×240`, `15 fps`, `MDEC v2`, `F=1 C=1`, taxa XA original e **exatamente o mesmo tamanho em bytes**. |
| **[`Scripts/ghidra_apply_symbols.py`](Scripts/ghidra_apply_symbols.py)** | Ghidra Py | Rotula automaticamente todas as tabelas e funções mapeadas dentro do projeto Ghidra. |
| **[`Scripts/generate_all_docs.js`](Scripts/generate_all_docs.js)** | Node.js | Regenera automaticamente os 9 mapas técnicos (`Docs/MAPA_01..09_*.md`) diretamente a partir dos binários extraídos. |
| **[`Scripts/thps2_build.xml`](Scripts/thps2_build.xml)** | XML | Descritor de disco `mkpsxiso v2.30` separando corretamente arquivos `data` (2048B), `xa` (2336B) e `str` (2336B). |

---

## 🚀 Fluxo Rápido de Trabalho (Build Local em Segundos)

> **Pré-requisitos locais:** Node.js (v18+), sua própria cópia legal extraída de *THPS2 NTSC-U (`SLUS-01066`)*, e os binários portáteis `mkpsxiso`, `psxavenc` e `ffmpeg` em `tools/bin/`.

```powershell
# 1. Listar todos os 1.531 arquivos de CD.HED/CD.WAD com nomes reais resolvidos
node Scripts/thps2_wad.js list

# 2. Desempacotar CD.WAD + todos os 14 pacotes .PRE para edição
node Scripts/thps2_wad.js unpack work_wad --pre

# 3. Reempacotar CD.HED + CD.WAD após modificar texturas, tricks.bin, .TRG ou .PRE
node Scripts/thps2_wad.js repack work_wad CD.HED CD.WAD --from-pre

# 4. Substituir vídeos (.STR) mantendo tamanho exato em bytes e áudio XA (F=1 C=1)
node Scripts/replace_videos.js

# 5. Compilar a imagem PS1 jogável (build/THPS2_MOD.bin + build/THPS2_MOD.cue)
node Scripts/build_iso.js
```

---

## 📂 Arquitetura do Repositório

```text
.
├── Docs/                    # Enciclopédia técnica (MAPA_01..09 + guias detalhados)
├── Scripts/                 # Ferramentas Node.js, Ghidra Python e utilitários de análise
├── Build/                   # Diretório de saída local (imagens .bin/.cue ignoradas no Git)
├── Arquivos_Originais/      # Referências estruturais de pesquisa
├── Arquivos_Trabalho/       # Artefatos decodificados de estudo (PSH, TRG, etc.)
└── README.md                # Este guia principal
```

---

## ⚖️ Aviso Legal e Política de Releases

Este repositório é um projeto independente de **engenharia reversa, pesquisa técnica e preservação de software**, estritamente educacional e sem fins lucrativos.
- **Releases públicas deste repositório distribuem apenas ferramentas open-source, scripts, patches e documentação técnica** — imagens completas de disco protegidas por direitos autorais (`.BIN`/`.CUE` comerciais) **não** são hospedadas nas Releases públicas.
- Para testar o mod em emuladores (**DuckStation**, **PCSX-Redux** ou **Mednafen**), utilize sua própria cópia legal de *Tony Hawk's Pro Skater 2 (SLUS-01066)* com o pipeline de build acima.
- Todos os direitos sobre *Tony Hawk's Pro Skater 2* pertencem à Activision / Neversoft.
