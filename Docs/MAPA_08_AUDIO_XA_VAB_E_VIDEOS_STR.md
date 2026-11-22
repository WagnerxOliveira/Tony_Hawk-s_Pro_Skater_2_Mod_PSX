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
| 18 | `0x800C1F3C` | `0x0B273C` | `\X\BURNQUIS.STR;1` | Bob Burnquist | 320×240 | **598** | `0x025800` | Sim | str (2336B) |
| 19 | `0x800C1F60` | `0x0B2760` | `\X\CABALLER.STR;1` | Lulao | 320×240 | **606** | `0x025800` | Sim | str (2336B) |
| 20 | `0x800C1F84` | `0x0B2784` | `\X\CAMPBELL.STR;1` | Kareem Campbell | 320×240 | **644** | `0x025800` | Sim | str (2336B) |
| 21 | `0x800C1FA8` | `0x0B27A8` | `\X\GLIFBERG.STR;1` | Wagner Oliver | 320×240 | **627** | `0x025800` | Sim | str (2336B) |
| 22 | `0x800C1FCC` | `0x0B27CC` | `\X\KOSTON.STR;1` | Eric Koston | 320×240 | **629** | `0x025800` | Sim | str (2336B) |
| 23 | `0x800C1FF0` | `0x0B27F0` | `\X\LASEK.STR;1` | Bucky Lasek | 320×240 | **652** | `0x025800` | Sim | str (2336B) |
| 24 | `0x800C2014` | `0x0B2814` | `\X\MULLEN.STR;1` | Francis Paulo | 320×240 | **645** | `0x025800` | Sim | str (2336B) |
| 25 | `0x800C2038` | `0x0B2838` | `\X\MUSKA.STR;1` | João Paulo | 320×240 | **623** | `0x025800` | Sim | str (2336B) |
| 26 | `0x800C205C` | `0x0B285C` | `\X\REYNOLDS.STR;1` | Andrew Reynolds | 320×240 | **623** | `0x025800` | Sim | str (2336B) |
| 27 | `0x800C2080` | `0x0B2880` | `\X\ROWLEY.STR;1` | Geoff Rowley | 320×240 | **611** | `0x025800` | Sim | str (2336B) |
| 28 | `0x800C20A4` | `0x0B28A4` | `\X\STEAMER.STR;1` | Elissa Steamer | 320×240 | **514** | `0x025800` | Sim | str (2336B) |
| 29 | `0x800C20C8` | `0x0B28C8` | `\X\THOMAS.STR;1` | Jamie Thomas | 320×240 | **622** | `0x025800` | Sim | str (2336B) |
| 30 | `0x800C20EC` | `0x0B28EC` | `\X\BAILS01.STR;1` | Custom Skater | 320×240 | **637** | `0x025800` | Sim | str (2336B) |
| 31 | `0x800C2110` | `0x0B2910` | `\X\OD.STR;1` | Officer Dick | 320×240 | **859** | `0x025800` | Sim | str (2336B) |
| 32 | `0x800C2134` | `0x0B2934` | `\X\PC.STR;1` | Private Carrera | 320×240 | **1144** | `0x025800` | Sim | str (2336B) |
| 33 | `0x800C2158` | `0x0B2958` | `\X\SM.STR;1` | Spider-Man | 320×240 | **1236** | `0x025800` | Sim | str (2336B) |
| 34 | `0x800C217C` | `0x0B297C` | `\X\MS.STR;1` | 80's Tony | 320×240 | **821** | `0x025800` | Sim | str (2336B) |
