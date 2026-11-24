# 🛹 Tony Hawk's Pro Skater 2 (PS1 / SLUS-01066) — Engenharia Reversa & Modding Suite

<p align="center">
  <b>Documentação técnica completa de engenharia reversa, mapeamento binário de memória/assets, escultura 3D PSX, engine residente MIPS R3000A e suíte automatizada de modding para Tony Hawk's Pro Skater 2 (PlayStation 1 — NTSC-U <code>SLUS-01066</code>).</b>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/Platform-PlayStation%201%20(MIPS%20R3000A)-003087?style=for-the-badge">
  <img alt="Game ID" src="https://img.shields.io/badge/Title%20ID-SLUS--01066%20(NTSC--U)-2ea44f?style=for-the-badge">
  <img alt="Engine" src="https://img.shields.io/badge/Engine-Neversoft%20%2F%20Psy--Q%20SDK-orange?style=for-the-badge">
  <img alt="Audit" src="https://img.shields.io/badge/Forensic%20Audit-10%2F10%20PASSED-brightgreen?style=for-the-badge">
  <img alt="Tools" src="https://img.shields.io/badge/Toolkit-Node.js%20%7C%20Ghidra%20%7C%20mkpsxiso%20%7C%20psxavenc-blueviolet?style=for-the-badge">
</p>

---

## 🎮 Como Baixar e Jogar o Mod (3 Passos Simples — Patch `.xdelta`)

Seguindo o padrão profissional e legal de ROM hacking, o mod é distribuído na aba **[Releases](https://github.com/WagnerxOliveira/Tony_Hawk-s_Pro_Skater_2_Mod_PSX/releases/latest)** como um **patch delta binário (`.xdelta`)**, contendo apenas as modificações (sem distribuir a imagem original comercial):

1. **Baixe os arquivos da [Última Release](https://github.com/WagnerxOliveira/Tony_Hawk-s_Pro_Skater_2_Mod_PSX/releases/latest):**
   - `THPS2_MOD_NTSC-U.xdelta` *(patch delta verificado bit-a-bit por round-trip SHA-256)*
   - `THPS2_MOD_Patcher_e_Guia.zip` *(contém o aplicador em 1 clique `Aplicar_Patch_THPS2.bat`, `xdelta3.exe`, `THPS2_MOD.cue`, perfil `SLUS-01066.ini` e guia)*
2. **Aplique sobre sua cópia original limpa** de *Tony Hawk's Pro Skater 2 (USA / NTSC-U `SLUS-01066`, Redump)*:
   - **Base requerida:** `748.037.136 bytes` (`318.043 setores`) • MD5 `AC85AE22723EAF944B0F899AA53244DD` • SHA-1 `F5CB80A7D55AACED7FCC9C5A82A6C28B89DC489A`
   - **Windows (1 clique):** extraia o ZIP, coloque o `.xdelta` na mesma pasta e **arraste o seu `.bin` original** para cima de `Aplicar_Patch_THPS2.bat`.
   - **Alternativa GUI (Windows/Linux/macOS):** use o [Delta Patcher](https://github.com/marco-calautti/DeltaPatcher/releases) selecionando seu `.bin` original + `THPS2_MOD_NTSC-U.xdelta`.
3. **Jogue no Emulador:** abra o arquivo **`THPS2_MOD.cue`** gerado no **DuckStation**, **PCSX-Redux** ou **RetroArch** *(ou rode em PS1 compatível — a imagem preserva os 16 setores de licença originais e todos os 48 LBAs exatos Redump!)*.
   - **Perfil otimizado DuckStation (`SLUS-01066.ini`, incluso no ZIP) e guia DualShock 4 Bluetooth:** veja [MAPA 13 — Auditoria, Build e Emulação](Docs/MAPA_13_AUDITORIA_FORENSE_BUILD_PATCH_E_EMULACAO.md).

---

## ✨ Destaques Atuais do Mod (v2.0)

- **7 Skatistas Completamente Personalizados em Style A & B (28 Modelos 3D `.PSX` + 7 Retratos `s2face*.bmp`):**
  - **Silvio Santos (`Slot 1`, ex-Bob Burnquist):** terno azul-marinho 2 botões sob medida, camisa branca, gravata, lenço branco de bolso, mangas compridas com punho branco + **microfone de peito 3D verdadeiramente geométrico injetado em `Chest Mesh[8]`** (`+23` vértices `w=0`, `+18` faces `POLY_FT3/FT4` com globo metálico facetado, anel cromado, haste afilada inclinada sobre a gravata e presilha horizontal 3D em `burnq2.psx` e `burnq_l.psx`, cabendo nos mesmos setores!) (Style A) / camisa havaiana azul-royal florida com balão amarelo, palmeiras e hibiscos + antebraços limpos com relógio preto + bermuda xadrez + pernas limpas sem joelheiras/cotoveleiras (Style B) + escultura facial 3D removendo chapéu pescador e capacete + retrato `s2face1.bmp` + **13 vozes SPU-ADPCM** ([MAPA 11](Docs/MAPA_11_SKATISTAS_CUSTOMIZADOS_E_PIPELINE_ARTE.md)).
  - **Lulao (`Slot 2`):** terno + faixa presidencial (Style A) / presidiário (Style B) + rosto 3D + **barriguinha 3D anatômica** + biografia PT-BR nativa + **14 vozes SPU-ADPCM** + **Modo Carreira exclusivo** (88 ponteiros dinâmicos trocados só quando o Lulao é selecionado: 50 metas satíricas nas 5 fases regulares + 9 medalhas nas 3 competições de *The Hangar* até *The Bullring*, textos `"Roubei mais 50!"` / `"Roubei mais 100!"` / `"Roubei mais 250!"` / `"Zerei o BNDES da Fase!"` / HUD `"Roubei $X"`, fala aleatória a cada dinheiro coletado e no fim de partida com **0 ms de travamento / 60 FPS travados** via **Pré-Cache Adaptativo em Main RAM + Streamer SPU 2 KB Ping-Pong**).
  - **Bolsonaro (`Slot 3`):** terno + faixa (Style A) / listrado `"171"` (Style B) + rosto `bolsonaro_rosto.png` + cabelo curto 360° + **transplante do pescoço anatômico fino do Tony Hawk (`hawk2.psx`)** em `Chest Mesh[8]` + biografia PT-BR nativa + **14 vozes SPU-ADPCM**.
  - **Wagner Oliver (`Slot 4`):** moletom bordô `"CIÊNCIA DA COMPUTAÇÃO"` + jeans comprido (Style A) / uniforme tático policial `"POLICJA"` + calça cargo + coturnos (Style B) + **remoção da viseira 3D do Rune Glifberg**.
  - **Francis Paulo (`Slot 7`):** raglan branca `"UBER"` + `"99"` + jeans **4-bit 16 cores** (Style A) / kimono Shinigami *Bleach* + hakama **4-bit 16 cores** (Style B) + cabelo volumoso 3D + retrato em `s2face9.bmp`.
  - **Valter Pacheco (`Slot 9`, ex-Andrew Reynolds):** camisa azul chambray manga longa `64×64` + calça social (Style A) / camiseta verde `"SAN MICHEL"` + jeans com cinto e crachá (Style B) + restauração automática (*inpainting*) de riscos na foto 3×4 + cabelo grisalho/bigode 3D + retrato em `s2face10.bmp`.
  - **Natan Oliver (`Slot 10`):** camiseta azul `"LACTA"` com cordão vermelho/crachá e relógio + jeans (Style A) / terno preto 2 botões com gravata vermelha e punhos brancos (Style B) + retrato em `s2face11.bmp`.
- **Vídeos Aleatórios Persistentes no Boot com Duração Exata Original:** motor residente MIPS (`BootRand_PlaySlot @ 0x800E2800`) sorteia 3 vídeos customizados distintos nos slots Activision (`208f`), Neversoft (`266f`) e Intro (`≤1486f`) usando entropia persistente no Setor 60 (`0x3C`) do Memory Card + timers HW, mantendo os vídeos finais de carreira 100% intactos ([MAPA 12](Docs/MAPA_12_ENGINE_MOD_MIPS_VOICES_E_BOOT_ALEATORIO.md)).
- **41 Vozes SPU-ADPCM (`Silvio Santos`, `Lulao`, `Bolsonaro`) + Pré-Cache RAM Zero-Stall (`LULAO_GPBANK`) + Ducking `-12 dB`:** `VOICES.DAT` (49º arquivo ISO @ `LBA 317893`, `1.023 setores`, 6 setores residentes `0x800E2800..0x800E57FF`) armazena **41 falas a `11.025 Hz`** para a Seleção de Skatistas **e** o sub-banco compacto em anel `2×` **`LULAO_GPBANK` (`6.890,625 Hz / 0x0280`, `<= 2,85s`, `-10 LUFS`, `146 setores`)** pré-carregado 1 única vez no loading da fase com guarda OOM calibrado em `freeList[1]` (reserva intocável de `48 KB`, **`4..14` clipes aleatórios validados ao vivo em TODAS as 10 fases**, incluindo *NY City*, *Venice*, *School II*, *Bullring* e *Skate Heaven*) + **ring buffer SPU 2 KB (`0x7F400..0x7FBFF`)** — garantindo **0 chamadas `CdRead`/`XA_Pause`/`Mem_Alloc` durante partidas** (`< 0,20 ms` / **0 frames perdidos**!), música `COMPILED.XA` 100% contínua com ducking `-12 dB` e 0 bytes de leak na saída da fase.
- **9 Gritos Alternados de Queda (*Bail*) em Partida + Biografias PT-BR Nativas (`á, ã, ç, é, ê, í, ó`):** 9 gritos extraídos e injetados em `skate2/2g/2p .VAB/.SFX` (`0 B` extras em SPU RAM) com rotação estrita round-robin (`Hook_BailSfx @ 0x800E3400` + cooldown 50f) e glifos PT-BR 4bpp em `s2bio.fnt` (`Font_CharToGlyph @ 0x8005B9B4`).
- **Auditoria Forense 10/10 + Prova ao Vivo no DuckStation (GDB):** 0 erros, 0 avisos em **319.066 setores** (`715,7 MB`), 34 hooks MIPS + invariantes Zero-Stall/OOM Guard validados bit-a-bit, validação cruzada dinâmica `SLUS_010.66 ↔ CD.WAD ↔ options.pre` (7 retratos + Bucky Lasek `s2face7.bmp` e *The Hangar* `skhan_l.psx` 100% originais Redump). Confira o histórico completo no **[CHANGELOG.md](CHANGELOG.md)**.

---

## 📚 Enciclopédia Técnica de Mapeamento (`Docs/`)

Cada subsistema do jogo possui seu próprio mapa dedicado com **endereços RAM (`0x800xxxxx`)**, **offsets de arquivo**, **layouts de structs C** e **instruções práticas de modificação**:

| Documento | Escopo Mapeado |
| :--- | :--- |
| 📘 **[MAPA 01 — Memória e Executável (`SLUS_010.66`)](Docs/MAPA_01_MEMORIA_E_EXECUTAVEL.md)** | Cabeçalho `PS-X EXE`, conversão `File ↔ RAM`, mapa dos 2 MB de RAM, Entry Point `0x800A2910`, algoritmo `Neversoft_HashFilename` (`0x80053F10`), registro forense dos 8 opcodes restaurados e tabela dos 11 hooks MIPS do mod. |
| ⏱️ **[MAPA 02 — Cronômetro, Física e Pontuação](Docs/MAPA_02_CRONOMETRO_FISICA_E_PONTUACAO.md)** | Rotinas de cronômetro (`0x800833E8`), modos de jogo (`0x800BA600`), camadas de física/gravidade/equilíbrio, stats base, bônus de decks e multiplicadores. |
| 🗺️ **[MAPA 03 — Fases (`g_LevelTable`) e Objetos (`.TRG`)](Docs/MAPA_03_FASES_E_OBJETOS_TRG.md)** | Todas as **11 fases** em `0x800B8444` (stride `0x174`), objetivos, dinheiro, gap lists, anatomia `_TRG v2.0` e **todos os 25 `.TRG`** com coordenadas reais `(X, Y, Z)`. |
| 🛹 **[MAPA 04 — Personagens (`g_SkaterTable`), Stats e Decks](Docs/MAPA_04_PERSONAGENS_E_STATS.md)** | Todos os **20 skatistas** em `0x800B6834` (stride `0x154`), modelos `.PSX`/`.PSH`, alerta crítico `Slot ≠ s2faceN.bmp`, 10 stats iniciais (`+0x128`), 8 decks por skatista, bios e especiais. |
| 🤸 **[MAPA 05 — Todas as Manobras (`tricks.bin`)](Docs/MAPA_05_MANOBRAS_TRICKS_BIN.md)** | Anatomia do bytecode (`0x0B <nome>\0 0x0A <uint16 pontos>`) e catálogo completo de todas as manobras normais e especiais. |
| 🎨 **[MAPA 06 — Texturas, Fontes, `.PRE` e `CD.WAD`](Docs/MAPA_06_TEXTURAS_FONTES_E_WAD.md)** | Relação `CD.HED` × `CD.WAD`, censo dos **1.531 arquivos**, mapeamento interno de todos os **14 pacotes `.PRE`**, fontes `.FNT` e retratos `s2face*.bmp`. |
| 🎮 **[MAPA 07 — Cheats, Comandos e Tabela de Strings](Docs/MAPA_07_CHEATS_COMANDOS_E_STRINGS.md)** | Todos os cheats (`g_CheatStringPtrs @ 0x800C028C`), máscara de bits do controle PS1 (`PadRead`) e **Tabela Mestra `g_StringTable[]` (`1.387` ponteiros)**. |
| 🎵 **[MAPA 08 — Áudio (`COMPILED.XA`, `.VAB`), Vídeos (`.STR`) e `VOICES.DAT`](Docs/MAPA_08_AUDIO_XA_VAB_E_VIDEOS_STR.md)** | Estrutura de 8 canais de `COMPILED.XA`, `g_XATrackLengths @ 0x800BA4F4`, 17 bancos `.VAB`, todos os 35 registros de `g_MovieTable @ 0x800C1CB4` e catálogo dos 28 clipes SPU-ADPCM. |
| 🧩 **[MAPA 09 — Overlays `.BIN`/`.REL`, Hooks em `playsel.bin` e Demo `BMX\`](Docs/MAPA_09_OVERLAYS_E_DEMO_BMX.md)** | Todos os **15 overlays MIPS relocáveis**, hooks `+0x3388`/`+0x100C` em `playsel.bin` e anatomia completa da demo *Mat Hoffman's Pro BMX*. |
| 🧊 **[MAPA 10 — Modelos 3D `.PSX`, Skinning (`w=0/1/2`) e Texturas BGR555](Docs/MAPA_10_MODELOS_3D_PSX_SKINNING_E_TEXTURAS.md)** | Anatomia binária `.PSX` (`0x00020004`), skinning por vértices de costura, polaridade real UV da GTE (`"qilF"`), quantização BGR555 8-bit & 4-bit *nibble-packed* (regra anti-`0x0000`) e formato `s2face*.bmp`. |
| 🧑 **[MAPA 11 — Os 7 Skatistas Personalizados e Pipeline de Arte 3D](Docs/MAPA_11_SKATISTAS_CUSTOMIZADOS_E_PIPELINE_ARTE.md)** | Tabela definitiva `Slot ↔ s2face*.bmp ↔ options.pre ↔ magIdx`, ficha cirúrgica dos 7 skatistas (28 `.PSX` incl. microfone 3D geométrico do Silvio Santos + 7 retratos) e guia de uso de `Scripts/psx_skater_lib.js`. |
| ⚡ **[MAPA 12 — Engine Residente MIPS (`MODCODE`), Boot Aleatório e Vozes SPU](Docs/MAPA_12_ENGINE_MOD_MIPS_VOICES_E_BOOT_ALEATORIO.md)** | Arena residente `0x800E2680..0x800E37FF`, mapa dos 11 hooks MIPS, RNG persistente no Setor 60 do Memory Card, cap de duração de boot, SPU Voz 23, ducking `-12 dB`, correção do bug *"Continuar"* e diagrama Mermaid. |
| 🛡️ **[MAPA 13 — Auditoria Forense 10/10, Build `.xdelta` e Guia DuckStation/DS4](Docs/MAPA_13_AUDITORIA_FORENSE_BUILD_PATCH_E_EMULACAO.md)** | Os 10 estágios da auditoria automatizada, pipeline round-trip `.xdelta`, testes ao vivo no DuckStation GDB, perfil `SLUS-01066.ini` e guia DualShock 4 + `HidHide`. |

### 📖 Guias Didáticos e Referências Complementares (`Docs/`)
- [🛠️ Ferramentas Utilizadas no Projeto](Docs/Ferramentas_utilizadas.md) • [💿 Requisitos da Base Original Redump](Docs/Descricao_arquivos.md) • [📂 Sobre os 49 Arquivos do Disco](Docs/01_Sobre_arquivos_extraidos.md)
- [🔗 Relação `CD.HED` × `CD.WAD`](Docs/02_Entender_Relacao_CD.HED_x_CD.WAD.md) • [🔬 Guia Seguro de HxD](Docs/Sobre_HxD.md) • [💿 Extração Visual com CDmage](Docs/00_CDmage_extraindo_arquivos.md)
- [🦴 Arquitetura Esqueletal `.PSH` (`burnq2.psh`)](Docs/0017_SK2ANIM_PSH.md) • [🔍 Censo de Magic Numbers do `CD.WAD`](Docs/0001_Censo_magic_numbers_cd_wad.md) • [📦 Histórico de Extração `CD.WAD`](Docs/0000_WAD_ARQUIVOS_EXTRAIDOS.md) • [🗺️ Tabela Completa `CD.HED` (1.531 entradas)](Docs/02_Arquivos_mapeados_cd_hed.md)
- [📋 Histórico de Versões (`CHANGELOG.md`)](CHANGELOG.md)

---

## ⚙️ Suíte de Automação e Ferramentas (`Scripts/`)

| Script | Linguagem | Função |
| :--- | :---: | :--- |
| **[`Scripts/thps2_wad.js`](Scripts/thps2_wad.js)** | Node.js | Unpack/Repack completo de `CD.HED`, `CD.WAD` e todos os 14 `.PRE` com resolução automática de **1.161+ nomes reais** e integridade **SHA-256 bit-a-bit**. |
| **[`Scripts/psx_skater_lib.js`](Scripts/psx_skater_lib.js)** | Node.js | Biblioteca compartilhada de modding 3D PSX: quantizadores BGR555 8-bit & 4-bit *nibble-packed*, texto espelhado para GTE (`flipX`), gerador de retratos `s2face*.bmp` (`4.088 B`), recomputador de `rad`/`hdrBbox` e renderizador 3D multi-ângulo com projeção real PS1. |
| **[`Scripts/mod_skater_silvio.js`](Scripts/mod_skater_silvio.js)** | Node.js | Customização de Bob Burnquist → **Silvio Santos (`Slot 1`)**: renomeação em 5 offsets de `SLUS_010.66`, retrato `s2face1.bmp` (`magIdx=21`), escultura facial 3D removendo chapéu pescador/capacete, Style A terno azul-marinho + **microfone de peito 3D geométrico real (`+23v/+18f/+1.160 B` em `Chest Mesh[8]` Hi/Lo-LOD)** e Style B camisa havaiana azul-royal + bermuda xadrez (sem joelheiras/cotoveleiras). |
| **[`Scripts/mod_skater_lulao.js`](Scripts/mod_skater_lulao.js)** | Node.js | Customização de Steve Caballero → **Lulao (`Slot 2`)**: Style A terno + faixa, Style B presidiário, `s2face2.bmp`, escultura facial e **barriguinha 3D anatômica** nos 4 `.PSX`. |
| **[`Scripts/mod_skater_bolsonaro.js`](Scripts/mod_skater_bolsonaro.js)** | Node.js | Customização de Kareem Campbell → **Bolsonaro (`Slot 3`)**: Style A terno + faixa, Style B listrado `"171"`, `s2face3.bmp`, rosto `bolsonaro_rosto.png`, cabelo curto 360° e **transplante do pescoço fino do Tony Hawk (`hawk2.psx`)** em `Chest Mesh[8]`. |
| **[`Scripts/mod_skater_wagner.js`](Scripts/mod_skater_wagner.js)** | Node.js | Customização de Rune Glifberg → **Wagner Oliver (`Slot 4`)**: Style A moletom `"CIÊNCIA DA COMPUTAÇÃO"` + jeans comprido, Style B uniforme policial `"POLICJA"` + cargo/coturnos, `s2face4.bmp` e **remoção da viseira 3D**. |
| **[`Scripts/mod_skater_francis.js`](Scripts/mod_skater_francis.js)** | Node.js | Customização de Rodney Mullen → **Francis Paulo (`Slot 7`)**: Style A raglan `"UBER"` + `"99"` + jeans **4-bit 16 cores**, Style B kimono Shinigami + hakama **4-bit 16 cores**, `s2face9.bmp` (foto nivelada `+19°`) e cabelo volumoso 3D. |
| **[`Scripts/mod_skater_valter.js`](Scripts/mod_skater_valter.js)** | Node.js | Customização de Andrew Reynolds → **Valter Pacheco (`Slot 9`)**: renomeação em 4 offsets de `SLUS_010.66`, *inpainting* de riscos em `valter.jpg`, `s2face10.bmp`, Style A torso `64×64` chambray manga longa + calça social e Style B `"SAN MICHEL"` + jeans com crachá. |
| **[`Scripts/mod_skater_natan.js`](Scripts/mod_skater_natan.js)** | Node.js | Customização de Geoff Rowley → **Natan Oliver (`Slot 10`)**: Style A camiseta `"LACTA"` + cordão vermelho/crachá + relógio, Style B terno preto 2 botões com gravata vermelha e punhos brancos + `s2face11.bmp`. |
| **[`Scripts/mod_hangar_walls.js`](Scripts/mod_hangar_walls.js)** | Node.js | Ferramenta opcional/reprodutível para aplicar murais 256 cores na Fase 1 (*The Hangar* — `skhan_l.psx`); no mod v2.0 atual, `skhan_l.psx` encontra-se restaurado 100% original Redump. |
| **[`Scripts/build_skater_voices.js`](Scripts/build_skater_voices.js)** | Node.js | Converte e normaliza os **41 áudios de menu** (`11.025 Hz` mono: 14 Lulao + 14 Bolsonaro + 13 Silvio Santos) **+** o sub-banco compacto em anel `2×` **`LULAO_GPBANK`** (`6.890,625 Hz` / `0x0280`, `<= 2,85s`, `-10 LUFS`, 14×2 clipes alinhados a `16 B`) empacotados em `VOICES.DAT` (`1.023 setores`). |
| **[`Scripts/mod_skater_bios.js`](Scripts/mod_skater_bios.js)** | Node.js | Patcher das **32 linhas de biografia PT-BR** de **Lulao (`Slot 2`)** e **Bolsonaro (`Slot 3`)** em `SLUS_010.66` + **5 palavras MIPS in-place** em `Font_CharToGlyph @ 0x8005B9B4` e glifos PT-BR 4bpp (`á, ã, ç, é, ê, í, ó`) em `s2bio.fnt` (`CD.WAD[458]` + `player.pre +0x14`, `4.468 B` exatos). |
| **[`Scripts/mod_bail_screams.js`](Scripts/mod_bail_screams.js)** | Node.js | Extrator DSP + codificador SPU-ADPCM 4-bit (`7.796 Hz`, `center=90`, Sony VABTool) que injeta **9 gritos alternados de queda (*bail*)** no `Program 2` de `skate2.vab/sfx`, `skate2g.vab/sfx` e `skate2p.vab/sfx` com tamanho exato Redump (`0 B` extras em SPU RAM). |
| **[`Scripts/patch_random_videos_and_voices.js`](Scripts/patch_random_videos_and_voices.js)** | Node.js | Assembler & patcher MIPS R3000A: **3 vídeos aleatórios no boot**, **41 vozes rotativas na SPU Voz 23** com ducking `-12 dB`, **9 gritos de queda** (`Hook_BailSfx`), **88 strings dinâmicas do Modo Carreira do Lulao** e **pré-cache adaptativo Zero-Stall em Main RAM** (`LulaoCache_Load` c/ reserva calibrada `48 KB` em `freeList[1]`, fallback `#0`, `1 KB g_StageBuf`, disparo desacoplado e streamer SPU 2 KB em todas as 10 fases, **0 ms CD stall**). |
| **[`Scripts/replace_videos.js`](Scripts/replace_videos.js)** | Node.js | Pipeline cirúrgico (`ffmpeg` + `psxavenc`) para substituir `INTRO.STR` e os 19 `X\*.STR` mantendo `320×240`, `15 fps`, `MDEC v2`, `F=1 C=1`, taxa XA original e tamanho exato em setores. |
| **[`Scripts/psx_media.js`](Scripts/psx_media.js)** | Node.js | Conversor streaming `RIFF-CDXA (44B+2352B) ↔ Raw Mode 2 (2336B)`, normalizador de setores e gerador do XML do `mkpsxiso`. |
| **[`Scripts/build_iso.js`](Scripts/build_iso.js)** | Node.js | Compilador em um comando da imagem `.BIN/.CUE` via `mkpsxiso v2.30` preservando **48/48 LBAs Redump**, os **16 setores de licença NTSC-U** e o 49º arquivo `VOICES.DAT`. |
| **[`Scripts/audit_game.js`](Scripts/audit_game.js)** | Node.js | Validador forense automatizado em **10 estágios** (34 hooks MIPS + bootstrapper + invariantes estáticos Zero-Stall/OOM Guard, **218 strings incl. Silvio Santos + 32 linhas de bio PT-BR**, 1.531 entradas `CD.WAD`, **7 retratos + `s2face7` original**, **28 `.PSX` incl. Mic 3D** + `skhan_l.psx`, 48 LBAs + `VOICES.DAT` 41 clips + `LULAO_GPBANK` 14×2 variedade garantida, 16 setores de licença, 20 `.STR`, `COMPILED.XA` e **319.066 setores EDC/MSF**). |
| **[`Scripts/create_patch.js`](Scripts/create_patch.js)** | Node.js | Gera `THPS2_MOD_NTSC-U.xdelta` (`xdelta3 -3 -S none`) comparando com o `.BIN` original Redump e executa **validação round-trip SHA-256 automática**. |
| **[`Scripts/sync_and_release.js`](Scripts/sync_and_release.js)** | Node.js | Pipeline mestre: recompila a ISO, audita 10 estágios, gera/valida `.xdelta`, regenera `Docs/MAPA_01..09`, sincroniza `Scripts/`, `Docs/`, `README.md` e `CHANGELOG.md`, faz `git push origin main` e publica automaticamente na GitHub Release. |
| **[`Scripts/fix_game_errors.js`](Scripts/fix_game_errors.js)** | Node.js | Correção cirúrgica e reprodutível dos bugs binários históricos (8 opcodes MIPS `120→300`, header NTSC-U `+0x4C`, caractere `0xE3`, `cab_L.psx` e flags EOF nos `.STR`). |
| **[`Scripts/generate_all_docs.js`](Scripts/generate_all_docs.js)** | Node.js | Regenera automaticamente os mapas binários (`Docs/MAPA_01..09_*.md`) diretamente a partir dos arquivos reais do jogo. |
| **[`Scripts/ghidra_apply_symbols.py`](Scripts/ghidra_apply_symbols.py)** | Ghidra Py | Rotula automaticamente todas as tabelas e funções mapeadas dentro do projeto Ghidra. |
| **[`Scripts/thps2_build.xml`](Scripts/thps2_build.xml)** | XML | Descritor de disco `mkpsxiso v2.30` separando arquivos `data` (2048B), `xa` (2336B) e `str` (2336B). |

---

## 🚀 Fluxo Rápido de Trabalho (Build Local em Segundos)

> **Pré-requisitos locais:** Node.js (v18+), sua própria cópia legal extraída de *THPS2 NTSC-U (`SLUS-01066`)*, e os binários portáteis `mkpsxiso`, `psxavenc`, `ffmpeg` e `xdelta3` em `tools/bin/`.

```powershell
# 1. Listar todos os 1.531 arquivos de CD.HED/CD.WAD com nomes reais resolvidos
node Scripts/thps2_wad.js list

# 2. Gerar preview 3D multi-ângulo (projeção GTE real PS1) de um skatista sem alterar CD.WAD
node Scripts/mod_skater_valter.js --preview

# 3. Compilar a imagem PS1 jogável (build/THPS2_MOD.bin + build/THPS2_MOD.cue)
node Scripts/build_iso.js

# 4. Executar auditoria forense completa de 10 estágios (0 erros, 0 avisos)
node Scripts/audit_game.js

# 5. Pipeline completo (Build + Audit 10/10 + .xdelta round-trip + Docs + Git + Release)
node Scripts/sync_and_release.js "descricao tecnica da alteracao"
```

---

## 📂 Arquitetura do Repositório

```text
.
├── Docs/                    # Enciclopédia técnica (MAPA_01..13 + guias práticos)
├── Scripts/                 # Suíte Node.js, Ghidra Python e scripts de engenharia reversa
├── Build/                   # Diretório de saída local (.bin/.cue ignorados no Git)
├── Arquivos_Originais/      # Referências estruturais de pesquisa
├── Arquivos_Trabalho/       # Artefatos decodificados de estudo (PSH, TRG, etc.)
├── CHANGELOG.md             # Histórico completo de versões e marcos técnicos
└── README.md                # Este guia principal
```

---

## ⚖️ Aviso Legal e Política de Releases

Este repositório é um projeto independente de **engenharia reversa, pesquisa técnica e preservação de software**, estritamente educacional e sem fins lucrativos.
- **Releases públicas deste repositório distribuem apenas ferramentas open-source, scripts, patch delta `.xdelta` e documentação técnica** — imagens completas de disco protegidas por direitos autorais (`.BIN`/`.CUE` comerciais) **não** são hospedadas nem linkadas neste repositório.
- Para jogar o mod no **DuckStation**, **PCSX-Redux** ou **RetroArch**, aplique o patch `.xdelta` sobre sua própria cópia legal de *Tony Hawk's Pro Skater 2 (`SLUS-01066`)*.
- Todos os direitos sobre *Tony Hawk's Pro Skater 2* pertencem à Activision / Neversoft.
