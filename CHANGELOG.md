# 📋 Changelog — Tony Hawk's Pro Skater 2 Mod (PS1 / `SLUS-01066`)

Todas as evoluções técnicas, correções binárias, customizações 3D e marcos de engenharia reversa documentados cronologicamente.

---

## [v2.0] — Customização Completa de 6 Skatistas 3D, Motor MIPS de Vozes/Boot Aleatório & Enciclopédia v2

### ✨ Skatistas Personalizados (24 Modelos `.PSX` + 6 Retratos `s2face*.bmp`)
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

### 🔊 Motor Residente MIPS R3000A (`VOICES.DAT` & `0x800E2680..0x800E37FF`)
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
