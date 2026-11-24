# 🎵🎬 MAPA 08 — Áudio (`COMPILED.XA`, `.VAB`) e Vídeos (`.STR`, `g_MovieTable`)

---

## 1. Trilha Sonora Streaming (`COMPILED.XA`)

| Propriedade | Valor Verificado |
| :--- | :--- |
| Arquivo no Disco | `\COMPILED.XA;1` (referenciado em `SLUS_010.66 @ 0x800D6184` por `0x80038974`) |
| Formato Extraído no Workspace | **RIFF-CDXA**: 44 bytes header + **`105.952` setores raw de `2352` bytes** (`249.199.148` bytes) |
| Formato Necessário para `mkpsxiso` | **Raw Mode 2 Form 2**: `105.952 × 2336` bytes (convertido automaticamente por `Scripts/psx_media.js`) |
| Codec / Interleaving | **XA-ADPCM 4-bit, 37.800 Hz, Stereo**, `File=1`, **8 canais intercalados (`ch 0..7`)**, `Submode=0x64`, `Coding=0x01` |
| Taxa de Leitura por Canal | `150 setores/s ÷ 8 canais = 18,75 setores/segundo` por música |

### Tabela de Durações das Faixas (`g_XATrackLengths @ 0x800BA4F4`)
Referenciada por `0x80038AEC` e `0x80038CBC`. Ao substituir músicas em `COMPILED.XA`, atualize o comprimento correspondente em setores-por-canal (`segundos × 18.75`):

| Índice | Endereço RAM | Offset `SLUS_010.66` | Valor (Setores/Canal) | Duração Aprox. |
| :-: | :---: | :---: | :---: | :---: |
| 0 | `0x800BA4F4` | `0x0AACF4` | `2245` | `119.73s` |
| 1 | `0x800BA4F8` | `0x0AACF8` | `2112` | `112.64s` |
| 2 | `0x800BA4FC` | `0x0AACFC` | `1800` | `96.00s` |
| 3 | `0x800BA500` | `0x0AAD00` | `2041` | `108.85s` |
| 4 | `0x800BA504` | `0x0AAD04` | `2055` | `109.60s` |
| 5 | `0x800BA508` | `0x0AAD08` | `1692` | `90.24s` |
| 6 | `0x800BA50C` | `0x0AAD0C` | `2251` | `120.05s` |
| 7 | `0x800BA510` | `0x0AAD10` | `1802` | `96.11s` |
| 8 | `0x800BA514` | `0x0AAD14` | `2251` | `120.05s` |
| 9 | `0x800BA518` | `0x0AAD18` | `2250` | `120.00s` |
| 10 | `0x800BA51C` | `0x0AAD1C` | `2251` | `120.05s` |
| 11 | `0x800BA520` | `0x0AAD20` | `0xFFFFFFFF` | *(vazio / marcador)* |
| 12 | `0x800BA524` | `0x0AAD24` | `0xFFFFFFFF` | *(vazio / marcador)* |
| 13 | `0x800BA528` | `0x0AAD28` | `0xFFFFFFFF` | *(vazio / marcador)* |
| 14 | `0x800BA52C` | `0x0AAD2C` | `0xFFFFFFFF` | *(vazio / marcador)* |
| 15 | `0x800BA530` | `0x0AAD30` | `0xFFFFFFFF` | *(vazio / marcador)* |
| 16 | `0x800BA534` | `0x0AAD34` | `3748` | `199.89s` |
| 17 | `0x800BA538` | `0x0AAD38` | `4072` | `217.17s` |
| 18 | `0x800BA53C` | `0x0AAD3C` | `3862` | `205.97s` |
| 19 | `0x800BA540` | `0x0AAD40` | `4301` | `229.39s` |
| 20 | `0x800BA544` | `0x0AAD44` | `2765` | `147.47s` |
| 21 | `0x800BA548` | `0x0AAD48` | `3088` | `164.69s` |
| 22 | `0x800BA54C` | `0x0AAD4C` | `3052` | `162.77s` |
| 23 | `0x800BA550` | `0x0AAD50` | `4402` | `234.77s` |

---

## 2. Todos os 17 Bancos de Efeitos Sonoros (`.VAB` em `CD.WAD`)

> **Limite de Hardware PS1:** a SPU RAM total do PlayStation 1 é de **512 KB (524.288 bytes)**. Nunca exceda o espaço disponível de SPU RAM ao editar efeitos sonoros com *VABTool* / *PSound*.

| Idx `CD.HED` | Arquivo | Hash | Offset `CD.WAD` | Tamanho |
| :-: | :--- | :---: | :---: | :---: |
| 3 | `skate2.vab` | `0x28D98CA5` | `0x00021800` | 159888 B |
| 5 | `hangar.vab` | `0x1F71A09E` | `0x00049800` | 347264 B |
| 518 | `shell.vab` | `0x9528E717` | `0x009F1000` | 239200 B |
| 520 | `skate2g.vab` | `0x488AD7D5` | `0x00A2C000` | 160800 B |
| 522 | `skate2p.vab` | `0xCCD35BDD` | `0x00A54000` | 160576 B |
| 524 | `ware.vab` | `0x00FD5BF5` | `0x00A7C000` | 154496 B |
| 526 | `sf.vab` | `0x46D5EED4` | `0x00AA2800` | 249024 B |
| 528 | `mar.vab` | `0xC33EE58E` | `0x00AE0000` | 331984 B |
| 530 | `school2.vab` | `0x6C30C292` | `0x00B32000` | 357680 B |
| 532 | `ss.vab` | `0xFDD2C22E` | `0x00B8A000` | 356256 B |
| 534 | `ny.vab` | `0xA438A846` | `0x00BE1800` | 365408 B |
| 536 | `philly.vab` | `0x8E26EDC7` | `0x00C3B800` | 362208 B |
| 538 | `bullring.vab` | `0xF345F263` | `0x00C94800` | 366960 B |
| 540 | `b1.vab` | `0x7B88F05C` | `0x00CEF000` | 336512 B |
| 542 | `heaven.vab` | `0xA3B6A25F` | `0x00D42000` | 363072 B |
| 544 | `sked.vab` | `0xC32151A1` | `0x00D9B800` | 201696 B |
| 546 | `venice.vab` | `0xEB90F87A` | `0x00DCD800` | 355680 B |

---

## 3. Tabela Completa de Vídeos (`g_MovieTable @ 0x800C1CB4`, stride `0x24`)

- **Player MDEC/STR em `SLUS_010.66`:** `0x8007A6B8`, `0x8007A724`, `0x8007A8B0`, `0x8007AD80`, `0x8007AD9C`, `0x8007AE90`.
- **ATENÇÃO CRÍTICA PARA ÁUDIO:** todos os vídeos com áudio usam **`File=1, Channel=1` (`-F 1 -C 1 -X`)**. Usar o padrão `0/0` do `psxavenc` deixa os vídeos mudos no jogo!

| Idx | RAM | Offset `SLUS` | Arquivo CD | Rótulo | Res. | `num_frames` (`+0x0E`) | FrameBuf | Áudio | Modo ISO |
| :-: | :---: | :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| 0 | `0x800C1CB4` | `0x0B24B4` | `\ATVILOGO.STR;1` | Activision Logo | 320×240 | **208** | `0x025800` | Sim | str (2336B) |
| 1 | `0x800C1CD8` | `0x0B24D8` | `\LOGO.STR;1` | Neversoft Logo | 320×192 | **266** | `0x01E000` | Sim | str (2336B) |
| 2 | `0x800C1CFC` | `0x0B24FC` | `\INTRO.STR;1` | Intro | 320×240 | **1486** | `0x038400` | Sim | str (2336B) |
| 3 | `0x800C1D20` | `0x0B2520` | `\ATVILOGO.STR;1` | *(preview)* | 320×240 | **208** | `0x025800` | Sim | str (2336B) |
| 4 | `0x800C1D44` | `0x0B2544` | `\STATIC.STR;1` | *(preview)* | 176×48 | **102** | `0x008400` | Não | data (2048B) |
| 5 | `0x800C1D68` | `0x0B2568` | `\HANGAR.STR;1` | *(preview)* | 176×48 | **450** | `0x008400` | Não | data (2048B) |
| 6 | `0x800C1D8C` | `0x0B258C` | `\SCHOOL.STR;1` | *(preview)* | 176×48 | **450** | `0x008400` | Não | data (2048B) |
| 7 | `0x800C1DB0` | `0x0B25B0` | `\MAR.STR;1` | *(preview)* | 176×48 | **450** | `0x008400` | Não | data (2048B) |
| 8 | `0x800C1DD4` | `0x0B25D4` | `\NY.STR;1` | *(preview)* | 176×48 | **450** | `0x008400` | Não | data (2048B) |
| 9 | `0x800C1DF8` | `0x0B25F8` | `\VENICE.STR;1` | *(preview)* | 176×48 | **450** | `0x008400` | Não | data (2048B) |
| 10 | `0x800C1E1C` | `0x0B261C` | `\SS.STR;1` | *(preview)* | 176×48 | **450** | `0x008400` | Não | data (2048B) |
| 11 | `0x800C1E40` | `0x0B2640` | `\PHILLY.STR;1` | *(preview)* | 176×48 | **450** | `0x008400` | Não | data (2048B) |
| 12 | `0x800C1E64` | `0x0B2664` | `\BULLRING.STR;1` | *(preview)* | 176×48 | **450** | `0x008400` | Não | data (2048B) |
| 13 | `0x800C1E88` | `0x0B2688` | `\B1.STR;1` | *(preview)* | 176×48 | **450** | `0x008400` | Não | data (2048B) |
| 14 | `0x800C1EAC` | `0x0B26AC` | `\HEAVEN.STR;1` | *(preview)* | 176×48 | **450** | `0x008400` | Não | data (2048B) |
| 15 | `0x800C1ED0` | `0x0B26D0` | `\EDITOR.STR;1` | *(preview)* | 176×48 | **450** | `0x008400` | Não | data (2048B) |
| 16 | `0x800C1EF4` | `0x0B26F4` | `\X\BAILS02.STR;1` | Bails | 320×240 | **685** | `0x025800` | Sim | str (2336B) |
| 17 | `0x800C1F18` | `0x0B2718` | `\X\HAWK.STR;1` | Tony Hawk | 320×240 | **634** | `0x025800` | Sim | str (2336B) |
| 18 | `0x800C1F3C` | `0x0B273C` | `\X\BURNQUIS.STR;1` | Silvio Santos | 320×240 | **598** | `0x025800` | Sim | str (2336B) |
| 19 | `0x800C1F60` | `0x0B2760` | `\X\CABALLER.STR;1` | Lulao | 320×240 | **606** | `0x025800` | Sim | str (2336B) |
| 20 | `0x800C1F84` | `0x0B2784` | `\X\CAMPBELL.STR;1` | Bolsonaro | 320×240 | **644** | `0x025800` | Sim | str (2336B) |
| 21 | `0x800C1FA8` | `0x0B27A8` | `\X\GLIFBERG.STR;1` | Wagner Oliver | 320×240 | **627** | `0x025800` | Sim | str (2336B) |
| 22 | `0x800C1FCC` | `0x0B27CC` | `\X\KOSTON.STR;1` | Eric Koston | 320×240 | **629** | `0x025800` | Sim | str (2336B) |
| 23 | `0x800C1FF0` | `0x0B27F0` | `\X\LASEK.STR;1` | Bucky Lasek | 320×240 | **652** | `0x025800` | Sim | str (2336B) |
| 24 | `0x800C2014` | `0x0B2814` | `\X\MULLEN.STR;1` | Francis Paulo | 320×240 | **645** | `0x025800` | Sim | str (2336B) |
| 25 | `0x800C2038` | `0x0B2838` | `\X\MUSKA.STR;1` | Joao Paulo | 320×240 | **623** | `0x025800` | Sim | str (2336B) |
| 26 | `0x800C205C` | `0x0B285C` | `\X\REYNOLDS.STR;1` | Valter Pacheco | 320×240 | **623** | `0x025800` | Sim | str (2336B) |
| 27 | `0x800C2080` | `0x0B2880` | `\X\ROWLEY.STR;1` | Geoff Rowley | 320×240 | **611** | `0x025800` | Sim | str (2336B) |
| 28 | `0x800C20A4` | `0x0B28A4` | `\X\STEAMER.STR;1` | Elissa Steamer | 320×240 | **514** | `0x025800` | Sim | str (2336B) |
| 29 | `0x800C20C8` | `0x0B28C8` | `\X\THOMAS.STR;1` | Jamie Thomas | 320×240 | **622** | `0x025800` | Sim | str (2336B) |
| 30 | `0x800C20EC` | `0x0B28EC` | `\X\BAILS01.STR;1` | Custom Skater | 320×240 | **637** | `0x025800` | Sim | str (2336B) |
| 31 | `0x800C2110` | `0x0B2910` | `\X\OD.STR;1` | Officer Dick | 320×240 | **859** | `0x025800` | Sim | str (2336B) |
| 32 | `0x800C2134` | `0x0B2934` | `\X\PC.STR;1` | Private Carrera | 320×240 | **1144** | `0x025800` | Sim | str (2336B) |
| 33 | `0x800C2158` | `0x0B2958` | `\X\SM.STR;1` | Spider-Man | 320×240 | **1236** | `0x025800` | Sim | str (2336B) |
| 34 | `0x800C217C` | `0x0B297C` | `\X\MS.STR;1` | 80's Tony | 320×240 | **821** | `0x025800` | Sim | str (2336B) |

---

## 4. Banco de Vozes SPU-ADPCM (`VOICES.DAT`) & Vídeos Aleatórios de Boot

- **49º Arquivo da ISO (`\VOICES.DAT;1`):** posicionado após `INTRO.STR` e antes do postgap de 150 setores, preservando **48/48 LBAs originais Redump**.
- **Layout de `VOICES.DAT` (2.095.104 B / 1023 setores):**
  - **Setor 0 (`0x0000..0x07FF`):** `MODCODE` MIPS R3000A carregado em `0x800E2800` no boot via `Mod_BootInit` + `FlushCache()`.
  - **Setor 1 (`0x0800..0x0FFF`):** `VOICETBL` carregado em `0x800E3000` (`magic = 0x564F4943`, 14 clips Lulao + 14 clips Bolsonaro + 13 clips Silvio Santos) + `Hook_BailSfx @ 0x800E3400` + `VoiceSelect_Lookup @ 0x800E3600`.
  - **Setores `2..3` (`0x1000..0x1FFF`):** `LULAO_CODE` (`0x800E3800..0x800E47FF`): swapper dinâmico de 88 strings do Modo Carreira + motor de pré-cache adaptativo em Main RAM (zero-stall, OOM guard em `freeList[1] @ 0x800D7294`, staging buffer 2 KB, streamer SPU 2 KB Ping-Pong).
  - **Setores `4..5` (`0x2000..0x2FFF`):** `LULAO_STRDATA` (`0x800E4800..0x800E57FF`): 88 ponteiros + backup runtime + strings satíricas das 8 fases e `"Roubei mais 50!/100!/250!"`.
  - **Setores `6..876`:** 41 streams SPU-ADPCM mono `11025 Hz` (`pitch = 0x0400`, maior clip = `148928 B` / `159728 B` na SPU RAM `0x58000..0x7EFF0`) para a Seleção de Skatistas (`playsel.bin`).
  - **Setores `877..1022` (`LULAO_GPBANK`):** sub-banco compacto em anel `2×` (`14 × 2 = 28` entradas, `299.008 B` / `146` setores, `6890.625 Hz` exatos / `pitch = 0x0280`, alinhado a `16 B`) pré-carregado 1 única vez no loading da fase para **0,00 ms de acesso ao CD-ROM durante partidas**.
- **Vídeos Aleatórios no Boot (Duração Exata Original):** `BootRand_PlaySlot` substitui os 3 slots de inicialização (`ATVILOGO` = `208` frames / `13,87s`, `LOGO` = `266` frames / `17,73s`, `INTRO` = até `1486` frames / `99,07s`) por 3 vídeos customizados distintos entre os 20 disponíveis (`[2, 16..34]`), usando contador persistente no **Setor 60 (`0x3C`)** do Memory Card + timers de hardware (`0x1F801100/10/20`) + `VSync(-1)`. O campo `g_MovieTable[idx].num_frames` é ajustado temporariamente para a duração exata do slot de boot e restaurado imediatamente ao término, mantendo os vídeos finais de carreira com duração integral.
- **Atenuação Automática da Música (`-12 dB`) & Pré-Cache Zero-Stall:** `Hook_CdMix` (`0x80038950`) + `Hook_RunPlaySel` (`0x80082B80`) usam a bitmask privada `g_InPlaySel` (`0x800E27DC`: bit 0 = Seleção de Skatistas, bit 1 = Voz do Lulao em Partida) para reduzir `COMPILED.XA` para **25% (`vol >> 2`)** enquanto **Silvio Santos**, **Lulao** ou **Bolsonaro** falam, restaurando **100%** automaticamente sem jamais pausar o streaming musical durante partidas.

| # | Skatista | Arquivo Original | Duração | Bytes SPU | Setores | Offset Setor |
| :-: | :--- | :--- | :-: | :-: | :-: | :-: |
| 0 | **Lulao** (idx 2) | `cade_o_ze_gotinha.mp3` | 6.07s | 38272 B | 19 | +6 |
| 1 | **Lulao** (idx 2) | `lula_cantando_numb.mp3` | 14.16s | 89216 B | 44 | +25 |
| 2 | **Lulao** (idx 2) | `lula_cara_sem_dente.mp3` | 6.19s | 38976 B | 20 | +69 |
| 3 | **Lulao** (idx 2) | `lula_o_cracudo_nao_arruma_desculpas.mp3` | 17.18s | 108224 B | 53 | +89 |
| 4 | **Lulao** (idx 2) | `lula_pobre_andar_de_aviao.mp3` | 5.79s | 36480 B | 18 | +142 |
| 5 | **Lulao** (idx 2) | `lula_por_favor_me_ajuda.mp3` | 5.15s | 32448 B | 16 | +160 |
| 6 | **Lulao** (idx 2) | `lula_saco_de_pe_nao_para_vazio.mp3` | 3.02s | 19008 B | 10 | +176 |
| 7 | **Lulao** (idx 2) | `lula_vai_todo_mindo_se_fdr.mp3` | 5.14s | 32384 B | 16 | +186 |
| 8 | **Lulao** (idx 2) | `o_bagulho_e_loko_manolo.mp3` | 2.52s | 15872 B | 8 | +202 |
| 9 | **Lulao** (idx 2) | `o_brasil_acabou.mp3` | 4.28s | 26944 B | 14 | +210 |
| 10 | **Lulao** (idx 2) | `pense_no_lula.mp3` | 12.56s | 79104 B | 39 | +224 |
| 11 | **Lulao** (idx 2) | `pergunta_pro_google.mp3` | 1.31s | 8256 B | 5 | +263 |
| 12 | **Lulao** (idx 2) | `setembro_vai_entrar_o_grosso-lula.mp3` | 8.20s | 51648 B | 26 | +268 |
| 13 | **Lulao** (idx 2) | `solta_meu_pai.mp3` | 3.69s | 23232 B | 12 | +294 |
| 14 | **Bolsonaro** (idx 3) | `a_sra_nao_pode.mp3` | 3.49s | 22016 B | 11 | +306 |
| 15 | **Bolsonaro** (idx 3) | `bolsonaro_acabou_porra.mp3` | 1.27s | 8000 B | 4 | +317 |
| 16 | **Bolsonaro** (idx 3) | `bolsonaro_cara_de_homossexual.mp3` | 4.01s | 25280 B | 13 | +321 |
| 17 | **Bolsonaro** (idx 3) | `bolsonaro_familia.mp3` | 20.37s | 128320 B | 63 | +334 |
| 18 | **Bolsonaro** (idx 3) | `bolsonaro_historico_de_atleta.mp3` | 14.58s | 91840 B | 45 | +397 |
| 19 | **Bolsonaro** (idx 3) | `bolsonaro_popcorn_and_ice_cream.mp3` | 13.00s | 81920 B | 40 | +442 |
| 20 | **Bolsonaro** (idx 3) | `bolsonaro_posso_fazer_uma_brincadeira.mp3` | 3.09s | 19456 B | 10 | +482 |
| 21 | **Bolsonaro** (idx 3) | `bolsonaro_prisao.mp3` | 1.56s | 9856 B | 5 | +492 |
| 22 | **Bolsonaro** (idx 3) | `bolsonaro_risada.mp3` | 6.54s | 41216 B | 21 | +497 |
| 23 | **Bolsonaro** (idx 3) | `bolsonaro_tomar_um_cafe.mp3` | 2.84s | 17920 B | 9 | +518 |
| 24 | **Bolsonaro** (idx 3) | `canalhas_canalhas.mp3` | 4.33s | 27264 B | 14 | +527 |
| 25 | **Bolsonaro** (idx 3) | `eu_tenho_nada_a_ver_com_isso.mp3` | 1.36s | 8576 B | 5 | +541 |
| 26 | **Bolsonaro** (idx 3) | `explica.mp3` | 4.17s | 26240 B | 13 | +546 |
| 27 | **Bolsonaro** (idx 3) | `fica_aqui.mp3` | 3.61s | 22720 B | 12 | +559 |
| 28 | **Silvio Santos** (idx 1) | `abertura.mp3` | 15.67s | 98752 B | 49 | +571 |
| 29 | **Silvio Santos** (idx 1) | `aiaiuiui.mp3` | 14.83s | 93440 B | 46 | +620 |
| 30 | **Silvio Santos** (idx 1) | `cala_a_boca.mp3` | 1.82s | 11456 B | 6 | +666 |
| 31 | **Silvio Santos** (idx 1) | `certa_a_resposta.mp3` | 1.22s | 7680 B | 4 | +672 |
| 32 | **Silvio Santos** (idx 1) | `certa_resposta.mp3` | 1.87s | 11776 B | 6 | +676 |
| 33 | **Silvio Santos** (idx 1) | `nao_consegue.mp3` | 1.27s | 8000 B | 4 | +682 |
| 34 | **Silvio Santos** (idx 1) | `oi.mp3` | 1.12s | 7040 B | 4 | +686 |
| 35 | **Silvio Santos** (idx 1) | `olha_so.mp3` | 14.23s | 89664 B | 44 | +690 |
| 36 | **Silvio Santos** (idx 1) | `rap.mp3` | 5.79s | 36480 B | 18 | +734 |
| 37 | **Silvio Santos** (idx 1) | `ritmo_de_dance.mp3` | 23.64s | 148928 B | 73 | +752 |
| 38 | **Silvio Santos** (idx 1) | `ritmo_de_festa.mp3` | 6.55s | 41280 B | 21 | +825 |
| 39 | **Silvio Santos** (idx 1) | `seu_tempo_acabou.mp3` | 2.16s | 13632 B | 7 | +846 |
| 40 | **Silvio Santos** (idx 1) | `silvio.mp3` | 7.59s | 47808 B | 24 | +853 |
