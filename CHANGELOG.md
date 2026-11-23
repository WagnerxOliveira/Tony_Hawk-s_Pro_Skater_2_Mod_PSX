# 📋 Changelog — Tony Hawk's Pro Skater 2 Mod (PS1 / `SLUS-01066`)

Todas as evoluções técnicas, correções binárias, customizações 3D e marcos de engenharia reversa documentados cronologicamente.

---

## [v2.0] — Customização Completa de 7 Skatistas 3D, Motor MIPS de Vozes/Gritos/Boot Aleatório & Enciclopédia v2

### 🎯 Modo Carreira Exclusivo do Lulao, "Roubei mais X" & Streamer SPU 2 KB em Gameplay (`Scripts/patch_random_videos_and_voices.js`)
- **88 Ponteiros Dinâmicos do Modo Carreira (`LULAO_STRDATA @ 0x800E4800..0x800E57FF`, Setores 4..5 de `VOICES.DAT`):**
  - `Lulao_SyncStrings @ 0x800E3800` salva os 88 ponteiros originais em `0x800E4B00` no primeiro uso e troca automaticamente toda a lista de objetivos das **8 fases do Modo Carreira** (*The Hangar*, *School II*, *Marseille*, *NY City*, *Venice Beach*, *SkateStreet*, *Philadelphia* e *The Bullring* — 50 metas regulares + 19 *short labels* HUD + 9 medalhas de competição + 5 textos de pódio) exclusivamente quando **Lulao (`Slot 2`)** está selecionado, restaurando 100% dos textos originais para todos os demais skatistas (inclusive após carga direta de Memory Card via 8 hooks em `Overlay_Run`).
- **Dinheiro Customizado ("Roubei mais 50/100/250") + Fala Aleatória em Toda Coleta:**
  - Troca dinâmica em `g_StringTable` para o Lulao: `$50` (`0x800C0310`) → `"Roubei mais 50!"`, `$100` (`0x800C0314`) → `"Roubei mais 100!"`, `$250` (`0x800C030C`) → `"Roubei mais 250!"`, *Cash Icons Cleared* (`0x800C01D4`) → `"Zerei o BNDES da Fase!"`, e label HUD `cash` (`0x800C080C`) → `"Roubei"` (exibindo `"Roubei $50"`, `"Roubei $150"`, etc.).
  - Hooks nos 3 chamadores de `Career_CollectCash` (`0x800368D4`, `0x80036914`, `0x80036954` → `Hook_CollectCash @ 0x800E3810`) disparam uma frase aleatória sem repetição imediata do Lulao a cada nota coletada.
- **Fala Aleatória Engraçada no Fim de Partida:**
  - Cobertura de 100% das rotas de encerramento (`0x8003C2E8` *Time is up* natural, `0x80030DA0` *Pause → End Run*, `0x8003C968` State 7, `0x8003C9F0` competições e `0x800813CC`), com trava 1-shot `g_EndRunSpoken` (zerada em `Hook_GameplayStart @ 0x8003D71C`) sorteando entre todos os 14 clipes do Lulao.
- **Pré-Cache Adaptativo Zero-Stall em Main RAM + Streamer SPU 2 KB (`LULAO_CODE @ 0x800E3800..0x800E47FF`, `NewHeapStart = 0x800E5800`):**
  - **Eliminação Total do Travamento na Coleta de Dinheiro e Fim de Partida (`1.110 ms` / ~66 frames → `< 0,20 ms` / `0 frames perdidos`, 60 FPS travados):**
    - Sub-banco compacto **`LULAO_GPBANK`** adicionado ao final de `VOICES.DAT` (`267 setores` em anel duplicado `2×`, 14 clipes do Lulao @ **`6.890,625 Hz` exatos / pitch `0x0280`** alinhados a `16 B` — mantendo todos os 41 clipes originais de menu em `11.025 Hz` 100% intactos!).
    - `LulaoCache_Load` pré-carrega 1 única vez na tela de loading da fase (`Hook_GameplayStart`, pulado em *Retry*!) após percorrer `freeList[1] @ 0x800D7294` (**imune ao trap OOM red-screen `0x80054550`** do `Mem_Alloc` do THPS2, preservando sempre `>= 96 KB` livres em `Heap[1]` para o motor do jogo em todas as fases).
    - **ZERO `CdRead`, ZERO `XA_Pause` e ZERO `Mem_Alloc`/`Mem_Free` durante toda a partida** (`COMPILED.XA` toca 100% ininterrupta com ducking suave `-12 dB`).
    - Disparo desacoplado (`Hook_CollectCash` / `Lulao_OnEndRun` apenas gravam `g_PendingVoiceMode` em `< 0,0005 ms`; `Hook_FrameTick` dispara após `Display_Swap`), **staging buffer imutável de `2.048 B`** (`g_CacheBuf + 0..2047`) para DMA SPU e limpeza segura do Reverb (`0x7F400..0x7FBFF`, acima de `bullring.vab 0x7F360`), feeder 60 Hz calibrado (`11.507` centi-amostras/VBlank NTSC, `260 ms` por metade) e liberação integral sem leak em `Hook_GameplayExit` (`LulaoCache_Free`).
    - Comprovado ao vivo no DuckStation GDB: 5 coletas rápidas seguidas (`3–5 ms` c/ overhead GDB, **0 hits em `CdRead`/`XA_Pause`**), reprodução integral até `V23_ENVX == 0`, Fim de Partida instantâneo, Retry sem reload e saída sem memory leak (**0 erros PSX**).

### ✨ Skatistas Personalizados (28 Modelos `.PSX` + 7 Retratos `s2face*.bmp`)
- **Silvio Santos (`Slot 1`, ex-Bob Burnquist — `burnq2*` — [`Scripts/mod_skater_silvio.js`](Scripts/mod_skater_silvio.js)):**
  - **Renomeação em `SLUS_010.66`:** `0x0C44EC`/`0x0C8688` `"Silvio Santos"`, `0x0C44FC` `"Sil"`, `0x0A17D8` `"Brazil's Silvio Santos"`, `0x0C459C` `"Can't Stop SS"` (preservando `\X\BURNQUIS.STR;1` e nomes de arquivos `.psx`).
  - **Microfone de Peito 3D Verdadeiramente Geométrico em `Chest Mesh[8]` (`burnq2.psx` & `burnq_l.psx`):** injetados cirurgicamente `+23` vértices `w=0`, `+41` normais (preservando o invariante estrito `nN === nV + nF` com remapeamento `normIdx += 23` nas faces originais) e `+18` polígonos texturizados `POLY_FT3/FT4` (`+1.160 B` — `61.404 B ≤ 61.440 B` em `burnq2.psx` e `53.092 B ≤ 53.248 B` em `burnq_l.psx`, zero deslocamento de offsets no `CD.WAD`!), formando globo metálico facetado + anel cromado equatorial + haste afilada inclinada sobre a gravata + presilha horizontal 3D com atlas metálico dedicado em `U=16..31` de `texIdx=6` (`32×32 16c`).
  - **Escultura 3D do Rosto & Topete (`HEAD Mesh[15]`):** eliminação completa do chapéu pescador (*bucket hat*) no Style A (`0xF5CF6046`) e do capacete preto no Style B (`0x9504086E`), esculpindo crânio simétrico com topete castanho-escuro penteado para trás e rosto sorridente de `silvio.png` (travando `w=2`).
  - **Roupas & Retrato:** Style A terno azul-marinho 2 botões, camisa branca em V, gravata, lenço branco de bolso (`flipX: true`), mangas compridas com punho branco e sapatos sociais; Style B camisa havaiana azul-royal florida com balão amarelo/palmeiras/hibiscos, antebraços limpos com relógio preto (sem cotoveleiras), bermuda xadrez e pernas limpas (sem joelheiras); retrato `s2face1.bmp` (`CD.WAD[369]` + `options.pre +0x246BC`, `magIdx=21`).
  - **13 Vozes SPU-ADPCM na Seleção de Skatistas:** adicionadas a `VOICES.DAT` (`41` clipes totais, `873 setores`) com reorganização do Setor 1 (`VOICETBL` expandido até 62 slots, `Hook_BailSfx @ 0x800E3400` e `VoiceSelect_Lookup @ 0x800E3600`, zero redução da Heap `0x800E3800`).
- **Bolsonaro (`Slot 3` — `campb2*`):** reconstrução simétrica do crânio com `bolsonaro_rosto.png`, cabelo curto 360°, retrato rindo (`s2face3.bmp`), roupas Style A (terno + faixa) / Style B (listrado `"171"`) e **transplante cirúrgico do pescoço anatômico fino do Tony Hawk (`hawk2.psx`)** em `Chest Mesh[8]` eliminando o colar largo de dreadlocks.
- **Lulao (`Slot 2` — `cab*`):** Style A (terno + faixa presidencial), Style B (uniforme de presidiário), rosto 3D, retrato (`s2face2.bmp`) e **barriguinha 3D anatômica** esculpida em `Pelvis`/`Stomach`/`Chest`.
- **Wagner Oliver (`Slot 4` — `glif2*`):** remoção completa da viseira 3D do Rune Glifberg (`HEAD Mesh[15]`), Style A (moletom bordô `"CIÊNCIA DA COMPUTAÇÃO"` + jeans comprido), Style B (uniforme policial `"POLICJA"` com suporte aos palIds distintos de Hi/Lo-LOD + calça cargo + coturnos) e retrato `s2face4.bmp`.
- **Francis Paulo (`Slot 7` — `mullen*`):** nivelamento `+19°` CCW + recuperação de sombra em `francis.png`, cabelo volumoso 3D, Style A (raglan `"UBER"` + `"99"` + jeans **4-bit 16 cores nibble-packed**), Style B (kimono Shinigami *Bleach* + hakama **4-bit 16 cores**) e retrato `s2face9.bmp`.
- **Valter Pacheco (`Slot 9`, ex-Andrew Reynolds — `rynld2*`):** renomeação em 4 offsets de `SLUS_010.66` preservando `\X\REYNOLDS.STR;1`, restauração automática de riscos brancos (*inpainting*) em `valter.jpg`, cabelo grisalho orgânico + bigode 3D, Style A (torso nativo **`64×64`** chambray manga longa + calça social), Style B (`"SAN MICHEL"` + jeans com cinto e crachá) e retrato `s2face10.bmp`.
- **Natan Oliver (`Slot 10` — `rowley2*`):** Style A (camiseta azul `"LACTA"` limpa + cordão vermelho/crachá + relógio dourado + jeans), Style B (terno preto 2 botões + gravata vermelha + punhos brancos) e retrato `s2face11.bmp`.
- **Biblioteca Compartilhada [`Scripts/psx_skater_lib.js`](Scripts/psx_skater_lib.js):** quantizadores BGR555 8-bit & 4-bit (regra anti-`0x0000`), texto espelhado para polaridade UV da GTE (`flipX: true`) e renderizador 3D multi-ângulo de QA com projeção real PS1.

### ✍️ Biografias PT-BR com Acentuação Nativa (`Scripts/mod_skater_bios.js` & `s2bio.fnt`)
- **Suporte Nativo a Acentuação PT-BR (`á, ã, ç, é, ê, í, ó`) em `s2bio.fnt` + `SLUS_010.66`:**
  - Aplicadas **5 palavras MIPS cirúrgicas in-place** em `Font_CharToGlyph @ RAM 0x8005B9B4` (`0x8005BAC4/BAF4/BAFC/BB0C/BB1C`) remapeando 4 slots não utilizados em NTSC-U (`œ/ä/ö/ü` → Glifos `90..93`) para `ã (0xE3)`, `ê (0xEA)`, `í (0xED)` e `ó (0xF3)` e separando `ê` de `é`.
  - Desenhados pixel-a-pixel em 4bpp na paleta oficial de `s2bio.fnt` (`4.468 B` exatos, sincronizado in-place em `CD.WAD[458]` e `player.pre +0x14`) os acentos agudos (`á, é, í, ó`), til (`ã`) e circunflexo (`ê`), preservando o `ç` original da Neversoft e mantendo `CD.HED` 100% inalterado.
- **Biografias Customizadas (32 Linhas 1:1 Inline, 0 Overflows):** inseridas integralmente nos slots originais de **Lulao (`Slot 2`, `0x800B9DEC`, 16 linhas)** e **Bolsonaro (`Slot 3`, `0x800B9E30`, 16 linhas)** com largura máxima de `152 px` (dentro do teto original `158 px` da caixa de biografia).

### 🔧 Correções Cirúrgicas & Restaurações
- **Mapeamento Real dos Retratos de Mural (`s2face*.bmp`):** corrigido o deslocamento histórico da tabela alfabética da Neversoft (`Slot ≠ s2faceN.bmp`), restaurando **Bucky Lasek (`s2face7.bmp`)** 100% ao original Redump e posicionando Francis (`s2face9`), Valter (`s2face10`) e Natan (`s2face11`) nos slots exatos referenciados por `SLUS_010.66` (com validação cruzada dinâmica no Estágio 4 de `audit_game.js`).
- **Fluxo "Continuar" na Seleção de Skatistas:** isolada a flag privada `g_InPlaySel @ 0x800E27DC` (sem tocar em `23464($gp)`), corrigindo definitivamente o retorno indevido para a Roda Gigante (`State 0`) e garantindo transição limpa para *Level Select* (`State 2`).
- **Fase 1 (*The Hangar* — `skhan_l.psx`):** restaurada 100% bit-a-bit ao original Redump (`316.604 B`).

### 🔊 Motor Residente MIPS R3000A (`VOICES.DAT` & `0x800E2680..0x800E37FF`) & Gritos de Queda (`.VAB`)
- **9 Gritos Alternados de Queda (*Bail*) em Partida (`Scripts/mod_bail_screams.js` + `Hook_BailSfx @ 0x800E3200`):**
  - Extraídos e auditados 9 gritos distintos dos vídeos (`6` de *Loko em casa sozinho.mp4* + `3` de *A-melhor-Luta-de-2016_720p.mp4*), pré-processados via DSP (`85 Hz–3,6 kHz`, normalização `-0,8 dBFS`, fades anti-clique) e codificados em SPU-ADPCM 4-bit Sony VABTool (`7.796 Hz`, `center=90`, `26.512 B ≤ 26.784 B`).
  - Injetados in-place no `Program 2` dos 3 bancos globais (`skate2.vab/sfx`, `skate2g.vab/sfx`, `skate2p.vab/sfx`) mantendo **tamanho exato Redump (`0 B` extras em SPU RAM, `CD.HED` 100% intacto)** — seguro mesmo na fase mais pesada (`WAD[538]`, `516.944 / 520.176 B` SPU RAM).
  - Hook cirúrgico em `SFX_Play @ 0x800527B8` (`Tramp_BailSfx @ 0x800E27E0` → `Hook_BailSfx @ 0x800E3200` no Setor 1 de `VOICES.DAT`) garantindo **rotação estrita round-robin (`0→1→...→8→0`, um grito diferente a cada queda)** + **cooldown anti-sobreposição de 50 frames (`~0,83 s`)**.
- **Vídeos Aleatórios Persistentes no Boot (`BootRand_PlaySlot`):** sorteia 3 vídeos customizados distintos nos slots Activision (`208f`), Neversoft (`266f`) e Intro (`≤1486f`) usando entropia persistente no Setor 60 (`0x3C`) do Memory Card + timers HW, preservando intactos os vídeos de final de carreira.
- **28 Vozes SPU-ADPCM Rotativas (`14` Lulao + `14` Bolsonaro):** empacotadas no 49º arquivo da ISO (`VOICES.DAT @ LBA 317893`), reproduzidas na **Voz 23 dedicada** ao navegar Left/Right e confirmar com **X**, com **atenuação automática de `-12 dB` (25%)** da música `COMPILED.XA` durante a Seleção de Skatistas (`Hook_CdMix` + `Hook_RunPlaySel`) e restauração imediata a 100% nas fases.

### 🛡️ Auditoria Forense 10/10 & Documentação Completa
- **Auditoria Forense (`Scripts/audit_game.js`):** expandida para validar 9 hooks MIPS, 181 strings, 1.531 entradas `CD.WAD`, validação cruzada de 6 retratos + `s2face7` original, 24 `.PSX` (incl. CLUTs 4-bit), 48 LBAs Redump + `VOICES.DAT`, 20 `.STR`, 105.952 setores `COMPILED.XA` e 318.610 setores EDC/MSF — **0 erros, 0 avisos** + prova ao vivo no DuckStation (GDB).
- **Documentação (`Docs/`):** preenchidos os 3 arquivos vazios, corrigidas imprecisões legadas, removido link externo impróprio e adicionados **MAPA 10, 11, 12 e 13** + este `CHANGELOG.md`.

---

## [v1.2] — Pipeline Cirúrgico de Vídeos `.STR` & Áudio Streaming `COMPILED.XA`
- Substituição automatizada de `INTRO.STR` e dos 19 `X\*.STR` via [`Scripts/replace_videos.js`](Scripts/replace_videos.js) (`320×240`, `15 fps`, MDEC v2, `File=1, Channel=1`, taxa XA exata e tamanho exato em setores).
- Conversor streaming `RIFF-CDXA ↔ Raw Mode 2 (2336 B)` em [`Scripts/psx_media.js`](Scripts/psx_media.js) e compilação ISO 1-comando via `mkpsxiso v2.30` ([`Scripts/build_iso.js`](Scripts/build_iso.js)).
- Pipeline legal de distribuição via patch delta `.xdelta` com validação round-trip SHA-256 ([`Scripts/create_patch.js`](Scripts/create_patch.js) e [`Scripts/sync_and_release.js`](Scripts/sync_and_release.js)).

---

## [v1.1] — Auditoria & Correção Forense de Bugs Binários ([`Scripts/fix_game_errors.js`](Scripts/fix_game_errors.js))
- Restauração de **8 instruções MIPS corrompidas** pela substituição cega `120 → 300` (`Vector3_Scale`, `FixedPoint_Mul12`, `SFX_Play`, `g_PadManager`, `Font_SetScale`, `Mem_New`).
- Restauração do cabeçalho NTSC-U `+0x4C`, remoção do byte não-ASCII `0xE3` em strings e correção de flags EOF prematuras nos vídeos `.STR`.

---

## [v1.0] — Engenharia Reversa Completa & Toolkit `CD.HED`/`CD.WAD`/`.PRE`
- Descoberta do algoritmo exato `Neversoft_HashFilename` (`0x80053F10`: `tolower` + `rol32` + `0xEDB88320`), resolução de **1.161+ nomes reais** entre as 1.531 entradas de `CD.WAD` e `unpack`/`repack` bit-a-bit (SHA-256 idêntico) em [`Scripts/thps2_wad.js`](Scripts/thps2_wad.js) incluindo todos os 14 pacotes `.PRE`.
- Criação da enciclopédia automatizada `Docs/MAPA_01..09_*.md` ([`Scripts/generate_all_docs.js`](Scripts/generate_all_docs.js)) e script de rotulagem Ghidra ([`Scripts/ghidra_apply_symbols.py`](Scripts/ghidra_apply_symbols.py)).
