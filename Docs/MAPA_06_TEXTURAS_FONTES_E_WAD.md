# 🎨 MAPA 06 — Texturas (`.BMP`), Fontes (`.FNT`), Sub-arquivos `.PRE` e `CD.WAD`

- **`CD.HED`:** `18376` bytes = **`1531` entradas × 12 bytes** (`uint32 hash, uint32 offset, uint32 size`) + `00 00 00 00`.
- **`CD.WAD`:** `50405376` bytes (`48.07 MB`). **Regra crítica descoberta:** todos os arquivos são alinhados em setores de `2048` bytes (`0x800`), e até os 2 arquivos de tamanho `0` (`idx 525` e `527`) ocupam **1 setor de `2048` bytes** no `CD.WAD`.

---

## 1. Censo Completo por Categoria (`1.531` Arquivos)

| Categoria | Quantidade | Resolvidos por Nome | Tamanho Total | Descrição |
| :--- | :-: | :-: | :---: | :--- |
| **`BMP`** | 1040 | 793 (76%) | 10.32 MB | Texturas 2D, roupas de skatista, rostos, decks, telas de loading e UI (BMP 4-bit/8-bit indexado) |
| **`PSX`** | 227 | 146 (64%) | 27.34 MB | Modelos 3D, geometria de fases, skyboxes e texturas VRAM embutidas (magic `04 00 02 00`) |
| **`PSH`** | 74 | 74 (100%) | 0.12 MB | Headers C em texto plano (`#ifndef ..._PSH`) com hierarquia de ossos/esqueletos |
| **`DATA`** | 53 | 25 (47%) | 0.56 MB | Fontes (`.fnt`), `tricks.bin`, tabelas de animação e dados binários |
| **`PRK`** | 50 | 50 (100%) | 0.21 MB | 50 parques pré-fabricados do Park Editor (`park0.prk`..`park49.prk`, 2.560 B cada) |
| **`TRG`** | 25 | 13 (52%) | 0.51 MB | Triggers, spawns, coletáveis, rails e gaps das fases (`_TRG v2.0`) |
| **`VAB`** | 17 | 17 (100%) | 4.64 MB | Bancos de efeitos sonoros PSX (`pBAV`: header `.VH` + corpo ADPCM `.VB`) |
| **`OVL_BIN`** | 15 | 15 (100%) | 0.39 MB | 15 overlays de código MIPS R3000A relocáveis (menus, editor, opções) |
| **`PRE`** | 14 | 14 (100%) | 2.43 MB | 14 sub-arquivos empacotados de telas/HUD (contêm `.bmp`, `.fnt`, `.psx` e `.bin`) |
| **`OVL_REL`** | 14 | 14 (100%) | 0.02 MB | 15 tabelas de relocação de ponteiros para os overlays `.BIN` |
| **`EMPTY`** | 2 | 0 (0%) | 0.00 MB | Entradas vazias (0 bytes, mas reservam 2048 B no `CD.WAD`) |

---

## 2. Mapeamento Interno Completo de Todos os 14 Pacotes `.PRE`

Formato interno de um `.PRE`: `uint32 file_count`, seguido por `file_count` blocos de `[char name[] alinhado a 4 bytes][uint32 size][payload alinhado a 4 bytes]`.

### `panel.pre` (CD.HED idx=15 | Hash `0x072F42F3` | `CD.WAD +0x001C8000` | 32332 B | **12 arquivos internos**)
`time.fnt` (1916 B) • `score.fnt` (964 B) • `s2tricks.fnt` (8948 B) • `ingame1.fnt` (6212 B) • `s2switch.bmp` (1444 B) • `s2icon8.bmp` (1008 B) • `s2icon9.bmp` (1008 B) • `s2icon10.bmp` (1968 B) • `s2blood.bmp` (2956 B) • `scorep.bmp` (416 B) • `spec_bar.bmp` (2792 B) • `paused.bmp` (2488 B)

### `mainmenu.pre` (CD.HED idx=43 | Hash `0x3E59D9C5` | `CD.WAD +0x00254000` | 207976 B | **7 arquivos internos**)
`s2bgd2.bmp` (123960 B) • `s2wheel.bmp` (64584 B) • `s2arrow3.bmp` (912 B) • `mainf.fnt` (12808 B) • `s2font2.fnt` (3412 B) • `s2prmpt4.bmp` (880 B) • `s2prmpt1.bmp` (1292 B)

### `multisel.pre` (CD.HED idx=44 | Hash `0xB3116FD9` | `CD.WAD +0x00287000` | 144316 B | **8 arquivos internos**)
`mainf.fnt` (12808 B) • `s2font2.fnt` (3412 B) • `s2bgd4.bmp` (123960 B) • `s2arrow8.bmp` (248 B) • `s2arrow9.bmp` (248 B) • `s2prmpt1.bmp` (1292 B) • `s2prmpt2.bmp` (1316 B) • `s2prmpt4.bmp` (880 B)

### `options.pre` (CD.HED idx=45 | Hash `0x25A9CFC7` | `CD.WAD +0x002AA800` | 218964 B | **31 arquivos internos**)
`mem_card.psx` (6612 B) • `boombox.psx` (22720 B) • `control.psx` (67216 B) • `mainf.fnt` (12808 B) • `s2font2.fnt` (3412 B) • `s2tricks.fnt` (8948 B) • `s2arrow8.bmp` (248 B) • `s2arrow9.bmp` (248 B) • `s2prmpt1.bmp` (1292 B) • `s2prmpt2.bmp` (1316 B) • `s2prmpt4.bmp` (880 B) • `s2prmpt5.bmp` (848 B) • `s2video.bmp` (18268 B) • `s2face0.bmp` (4088 B) • `s2face1.bmp` (4088 B) • `s2face2.bmp` (4088 B) • `s2face3.bmp` (4088 B) • `s2face4.bmp` (4088 B) • `s2face5.bmp` (4088 B) • `s2face6.bmp` (4088 B) • `s2face7.bmp` (4088 B) • `s2face8.bmp` (4088 B) • `s2face9.bmp` (4088 B) • `s2face10.bmp` (4088 B) • `s2face11.bmp` (4088 B) • `s2face12.bmp` (4088 B) • `s2face13.bmp` (4088 B) • `s2face14.bmp` (4088 B) • `s2face15.bmp` (4088 B) • `s2face16.bmp` (4088 B) • `s2face18.bmp` (4088 B)

### `cresel.pre` (CD.HED idx=46 | Hash `0xA7DCE1DB` | `CD.WAD +0x002E0000` | 194924 B | **13 arquivos internos**)
`mainf.fnt` (12808 B) • `s2font1.fnt` (5792 B) • `s2font2.fnt` (3412 B) • `s2tricks.fnt` (8948 B) • `s2bgd4.bmp` (123960 B) • `s2arrow8.bmp` (248 B) • `s2arrow9.bmp` (248 B) • `s2prmpt0.bmp` (1352 B) • `s2prmpt1.bmp` (1292 B) • `s2prmpt2.bmp` (1316 B) • `s2prmpt3.bmp` (1288 B) • `s2prmpt5.bmp` (848 B) • `tricks.bin` (33168 B)

### `levelsel.pre` (CD.HED idx=47 | Hash `0xEE59B265` | `CD.WAD +0x00310000` | 281224 B | **20 arquivos internos**)
`levelsel.bin` (24012 B) • `levelsel.rel` (1540 B) • `mainf.fnt` (12808 B) • `s2font2.fnt` (3412 B) • `s2font1.fnt` (5792 B) • `ingame1.fnt` (6212 B) • `s2tricks.fnt` (8948 B) • `s2bgd3.bmp` (123960 B) • `s2prmpt0.bmp` (1352 B) • `s2prmpt1.bmp` (1292 B) • `s2prmpt2.bmp` (1316 B) • `s2prmpt4.bmp` (880 B) • `s2prmpt5.bmp` (848 B) • `s2versus.bmp` (3088 B) • `globe.psx` (43940 B) • `s2crossh.bmp` (416 B) • `levna.bmp` (9528 B) • `s2win5.bmp` (17880 B) • `s2levl11.bmp` (12104 B) • `s2lvgoal.bmp` (1524 B)

### `equipsel.pre` (CD.HED idx=48 | Hash `0xBBFE5E24` | `CD.WAD +0x00355000` | 330544 B | **23 arquivos internos**)
`equipsel.bin` (26824 B) • `equipsel.rel` (1900 B) • `s2font2.fnt` (3412 B) • `s2font1.fnt` (5792 B) • `s2menu1.fnt` (2928 B) • `s2bgd5.bmp` (123960 B) • `s2prmpt0.bmp` (1352 B) • `s2prmpt1.bmp` (1292 B) • `s2prmpt2.bmp` (1316 B) • `s2prmpt4.bmp` (880 B) • `s2prmpt5.bmp` (848 B) • `s2dots2.bmp` (1160 B) • `s2win6.bmp` (10480 B) • `s2arrow1.bmp` (552 B) • `s2arrow2.bmp` (548 B) • `s2arrow4.bmp` (360 B) • `s2arrow5.bmp` (360 B) • `s2eqicn1.bmp` (3868 B) • `s2eqicn2.bmp` (2680 B) • `s2eqicn3.bmp` (2164 B) • `barrel.psx` (105364 B) • `s2d__00z.bmp` (16508 B) • `truck.psx` (15564 B)

### `eqlogos.pre` (CD.HED idx=49 | Hash `0x7969F5FD` | `CD.WAD +0x003A6000` | 8076 B | **10 arquivos internos**)
`s2logofi.bmp` (1316 B) • `s2logoze.bmp` (840 B) • `s2logoat.bmp` (760 B) • `s2logosh.bmp` (600 B) • `s2logogi.bmp` (360 B) • `s2logofl.bmp` (516 B) • `s2logoci.bmp` (1000 B) • `s2logobi.bmp` (440 B) • `s2logoto.bmp` (840 B) • `s2logopo.bmp` (1200 B)

### `carsel.pre` (CD.HED idx=52 | Hash `0xBC01B1DE` | `CD.WAD +0x003AB800` | 153856 B | **9 arquivos internos**)
`mainf.fnt` (12808 B) • `s2font2.fnt` (3412 B) • `s2tricks.fnt` (8948 B) • `s2bgd4.bmp` (123960 B) • `s2arrow1.bmp` (552 B) • `s2arrow2.bmp` (548 B) • `s2prmpt1.bmp` (1292 B) • `s2prmpt2.bmp` (1316 B) • `s2prmpt5.bmp` (848 B)

### `statedit.pre` (CD.HED idx=55 | Hash `0x86310DB3` | `CD.WAD +0x003D6800` | 265452 B | **19 arquivos internos**)
`s2font1.fnt` (5792 B) • `s2font2.fnt` (3412 B) • `s2font3.fnt` (3424 B) • `s2menu1.fnt` (2928 B) • `s2skata2.fnt` (2612 B) • `anims_fe.psx` (32748 B) • `cretex.bin` (20452 B) • `sk2def.psh` (8406 B) • `anims_fe.psh` (1443 B) • `s2dots.bmp` (1908 B) • `s2arrow6.bmp` (144 B) • `s2arrow7.bmp` (144 B) • `s2win6.bmp` (10480 B) • `s2crskw1.bmp` (42912 B) • `s2prmpt1.bmp` (1292 B) • `s2prmpt2.bmp` (1316 B) • `s2prmpt4.bmp` (880 B) • `s2prmpt5.bmp` (848 B) • `s2bgd4.bmp` (123960 B)

### `tricksel.pre` (CD.HED idx=59 | Hash `0xA679A4CF` | `CD.WAD +0x00467000` | 298004 B | **20 arquivos internos**)
`s2font1.fnt` (5792 B) • `s2font2.fnt` (3412 B) • `s2font3.fnt` (3424 B) • `s2menu1.fnt` (2928 B) • `s2skata2.fnt` (2612 B) • `anims_fe.psx` (32748 B) • `cretex.bin` (20452 B) • `sk2def.psh` (8406 B) • `anims_fe.psh` (1443 B) • `s2arrow8.bmp` (248 B) • `s2arrow9.bmp` (248 B) • `s2win6.bmp` (10480 B) • `s2crskw1.bmp` (42912 B) • `s2prmpt1.bmp` (1292 B) • `s2prmpt2.bmp` (1316 B) • `s2prmpt3.bmp` (1288 B) • `s2prmpt5.bmp` (848 B) • `s2bgd4.bmp` (123960 B) • `s2symbol.fnt` (656 B) • `tricks.bin` (33168 B)

### `player.pre` (CD.HED idx=60 | Hash `0xE594A7E0` | `CD.WAD +0x004B0000` | 223996 B | **33 arquivos internos**)
`s2bio.fnt` (4468 B) • `s2font1.fnt` (5792 B) • `s2font2.fnt` (3412 B) • `s2font3.fnt` (3424 B) • `s2tricks.fnt` (8948 B) • `s2prmpt0.bmp` (1352 B) • `s2prmpt1.bmp` (1292 B) • `s2prmpt2.bmp` (1316 B) • `s2prmpt3.bmp` (1288 B) • `s2prmpt4.bmp` (880 B) • `s2prmpt5.bmp` (848 B) • `s2dots.bmp` (1908 B) • `s2bgd1.bmp` (123960 B) • `s2face14.bmp` (4088 B) • `s2win3.bmp` (17880 B) • `s2win4.bmp` (17976 B) • `s2medal1.bmp` (1836 B) • `s2medal2.bmp` (1828 B) • `s2medal3.bmp` (1836 B) • `s2scroll.bmp` (336 B) • `s2arrow1.bmp` (552 B) • `s2arrow2.bmp` (548 B) • `s2arrow8.bmp` (248 B) • `s2arrow9.bmp` (248 B) • `anims_fe.psh` (1443 B) • `s2icon1.bmp` (2040 B) • `s2icon2.bmp` (1892 B) • `s2icon3.bmp` (1464 B) • `s2icon4.bmp` (1520 B) • `s2icon5.bmp` (1464 B) • `s2icon6.bmp` (1464 B) • `s2icon7.bmp` (1752 B) • `s2face17.bmp` (4088 B)

### `player2.pre` (CD.HED idx=63 | Hash `0x08288982` | `CD.WAD +0x004F0000` | 18200 B | **7 arquivos internos**)
`s2arrow1.bmp` (552 B) • `s2arrow2.bmp` (548 B) • `sk2def.psh` (8406 B) • `anims_fe.psh` (1443 B) • `s2arrow8.bmp` (248 B) • `s2arrow9.bmp` (248 B) • `mem_card.psx` (6612 B)

### `create.pre` (CD.HED idx=69 | Hash `0x24A39C9C` | `CD.WAD +0x00511000` | 165828 B | **28 arquivos internos**)
`s2font1.fnt` (5792 B) • `s2font2.fnt` (3412 B) • `s2font3.fnt` (3424 B) • `s2menu1.fnt` (2928 B) • `s2skata2.fnt` (2612 B) • `s2symbol.fnt` (656 B) • `anims_fe.psx` (32748 B) • `s2arrow6.bmp` (144 B) • `s2arrow7.bmp` (144 B) • `s2icon3.bmp` (1464 B) • `s2icon4.bmp` (1520 B) • `s2icon5.bmp` (1464 B) • `s2icon6.bmp` (1464 B) • `s2icon7.bmp` (1752 B) • `s2dots.bmp` (1908 B) • `tricks.bin` (33168 B) • `s2win6.bmp` (10480 B) • `s2arrow8.bmp` (248 B) • `s2arrow9.bmp` (248 B) • `s2prmpt0.bmp` (1352 B) • `s2prmpt1.bmp` (1292 B) • `s2prmpt2.bmp` (1316 B) • `s2prmpt3.bmp` (1288 B) • `s2prmpt4.bmp` (880 B) • `s2prmpt5.bmp` (848 B) • `sk2def.psh` (8406 B) • `anims_fe.psh` (1443 B) • `s2crskw1.bmp` (42912 B)

---

## 3. Fontes (`.FNT`) Diretas em `CD.WAD` (Para Acentuação PT-BR)

| Idx | Arquivo | Hash | Offset `CD.WAD` | Tamanho |
| :-: | :--- | :---: | :---: | :---: |
| 455 | `s2font1.fnt` | `0x94FF9B35` | `0x008C2000` | 5792 B |
| 456 | `s2font2.fnt` | `0xE81D024A` | `0x008C3800` | 3412 B |
| 457 | `s2font3.fnt` | `0xABA13BC7` | `0x008C4800` | 3424 B |
| 458 | `s2bio.fnt` | `0x716D3010` | `0x008C5800` | 4468 B |
| 459 | `s2tricks.fnt` | `0xC3DCAB14` | `0x008C7000` | 8948 B |
| 514 | `s2goal.fnt` | `0x46E40BFC` | `0x009E7800` | 5212 B |
| 549 | `mainf.fnt` | `0xD8BA7FEE` | `0x00E43800` | 12808 B |
| 565 | `s2symbol.fnt` | `0x8BFD6BAA` | `0x00E5C000` | 656 B |
| 937 | `stats1.fnt` | `0xDDEAA21B` | `0x012C5800` | 5100 B |
| 968 | `stats2.fnt` | `0xA1083B64` | `0x0161F800` | 4276 B |
| 970 | `ingame1.fnt` | `0xFBE576BA` | `0x0164B800` | 6212 B |
| 971 | `time.fnt` | `0x416C87DE` | `0x0164D800` | 1916 B |
| 972 | `score.fnt` | `0x88B546DD` | `0x0164E000` | 964 B |
| 973 | `credits.fnt` | `0x1AABA82F` | `0x0164E800` | 3972 B |
| 974 | `s2skata1.fnt` | `0x549385D8` | `0x0164F800` | 2852 B |
| 975 | `s2skata2.fnt` | `0x28711CA7` | `0x01650800` | 2612 B |
| 976 | `s2menu1.fnt` | `0x604231AE` | `0x01651800` | 2928 B |
| 977 | `s2park1.fnt` | `0x24205964` | `0x01652800` | 3440 B |

---

## 4. Texturas-Chave de UI, Rostos e Telas de Loading (`65` principais)

| Idx | Arquivo | Hash | Offset `CD.WAD` | Tamanho |
| :-: | :--- | :---: | :---: | :---: |
| 0 | `s2bgd6.bmp` | `0xB57D1831` | `0x00000000` | 123960 B |
| 1 | `s2_scrib.bmp` | `0x268B4801` | `0x0001E800` | 4528 B |
| 2 | `s2pressx.bmp` | `0x71D310F5` | `0x00020000` | 5560 B |
| 65 | `s2face0.bmp` | `0x5F18299D` | `0x004FA000` | 4088 B |
| 70 | `s2bgd4.bmp` | `0x8A23B8C3` | `0x00539800` | 123960 B |
| 369 | `s2face1.bmp` | `0x1CA41010` | `0x006B6800` | 4088 B |
| 370 | `s2face2.bmp` | `0x6046896F` | `0x006B7800` | 4088 B |
| 371 | `s2face3.bmp` | `0x23FAB0E2` | `0x006B8800` | 4088 B |
| 372 | `s2face4.bmp` | `0x46373FB8` | `0x006B9800` | 4088 B |
| 373 | `s2face5.bmp` | `0x058B0635` | `0x006BA800` | 4088 B |
| 374 | `s2face6.bmp` | `0x79699F4A` | `0x006BB800` | 4088 B |
| 375 | `s2face7.bmp` | `0x3AD5A6C7` | `0x006BC800` | 4088 B |
| 376 | `s2face8.bmp` | `0x7BB488FC` | `0x006BD800` | 4088 B |
| 377 | `s2face9.bmp` | `0x3808B171` | `0x006BE800` | 4088 B |
| 378 | `s2face10.bmp` | `0xE3901318` | `0x006BF800` | 4088 B |
| 379 | `s2face11.bmp` | `0xA02C2A95` | `0x006C0800` | 4088 B |
| 380 | `s2face12.bmp` | `0xDCCEB3EA` | `0x006C1800` | 4088 B |
| 381 | `s2face13.bmp` | `0x9F728A67` | `0x006C2800` | 4088 B |
| 382 | `s2face14.bmp` | `0xFABF053D` | `0x006C3800` | 4088 B |
| 383 | `s2face15.bmp` | `0xB9033CB0` | `0x006C4800` | 4088 B |
| 384 | `s2face16.bmp` | `0xC5E1A5CF` | `0x006C5800` | 4088 B |
| 385 | `s2face17.bmp` | `0x865D9C42` | `0x006C6800` | 4088 B |
| 386 | `s2face18.bmp` | `0xC73CB279` | `0x006C7800` | 4088 B |
| 460 | `s2bgd1.bmp` | `0xD0B0976B` | `0x008C9800` | 123960 B |
| 478 | `s2icon1.bmp` | `0x336CE9A2` | `0x008F8800` | 2040 B |
| 479 | `s2icon2.bmp` | `0x4F8E70DD` | `0x008F9000` | 1892 B |
| 480 | `s2icon3.bmp` | `0x0C324950` | `0x008F9800` | 1464 B |
| 481 | `s2icon4.bmp` | `0x69FFC60A` | `0x008FA000` | 1520 B |
| 482 | `s2icon7.bmp` | `0x151D5F75` | `0x008FA800` | 1752 B |
| 483 | `s2icon5.bmp` | `0x2A43FF87` | `0x008FB000` | 1464 B |
| 484 | `s2icon6.bmp` | `0x56A166F8` | `0x008FB800` | 1464 B |
| 509 | `s2bgd7.bmp` | `0xF6C121BC` | `0x00969000` | 123960 B |
| 510 | `s2bgd8.bmp` | `0xB7A00F87` | `0x00987800` | 123960 B |
| 511 | `s2bgd9.bmp` | `0xF41C360A` | `0x009A6000` | 123960 B |
| 512 | `s2bgd10.bmp` | `0x9EA91152` | `0x009C4800` | 123960 B |
| 515 | `s2press2.bmp` | `0x7EEBCE7C` | `0x009E9000` | 3680 B |
| 516 | `s2press3.bmp` | `0x3D57F7F1` | `0x009EA000` | 2088 B |
| 548 | `s2bgd0.bmp` | `0x930CAEE6` | `0x00E25000` | 123960 B |
| 559 | `s2icon8.bmp` | `0x547C714E` | `0x00E58000` | 1008 B |
| 560 | `s2icon9.bmp` | `0x17C048C3` | `0x00E58800` | 1008 B |
| 561 | `s2icon10.bmp` | `0x73D7FFA8` | `0x00E59000` | 1968 B |
| 570 | `s2bgd2.bmp` | `0xAC520E14` | `0x00E77000` | 123960 B |
| 573 | `s2bgd3.bmp` | `0xEFEE3799` | `0x00EA6000` | 123960 B |
| 578 | `s2bgd5.bmp` | `0xC99F814E` | `0x00ED5000` | 123960 B |
| 585 | `s2logofi.bmp` | `0xF09F1BED` | `0x00F19000` | 1316 B |
| 586 | `s2logoze.bmp` | `0x6E5C0F54` | `0x00F19800` | 840 B |
| 587 | `s2logoat.bmp` | `0xA1A62960` | `0x00F1A000` | 760 B |
| 588 | `s2logosh.bmp` | `0xEC48B20B` | `0x00F1A800` | 600 B |
| 589 | `s2logogi.bmp` | `0x11C7D3EB` | `0x00F1B000` | 360 B |
| 590 | `s2logofl.bmp` | `0xAA0C3445` | `0x00F1B800` | 516 B |
| 591 | `s2logoci.bmp` | `0xE3620E1A` | `0x00F1C000` | 1000 B |
| 592 | `s2logobi.bmp` | `0x023AC61C` | `0x00F1C800` | 440 B |
| 593 | `s2logoto.bmp` | `0x47178247` | `0x00F1D000` | 840 B |
| 594 | `s2logopo.bmp` | `0xB5B25FB6` | `0x00F1D800` | 1200 B |
| 946 | `loadingt.bmp` | `0x8B4AAEF6` | `0x013BB800` | 123960 B |
| 949 | `loadingg.bmp` | `0x163C34DB` | `0x01417000` | 123960 B |
| 950 | `load_hor.bmp` | `0xEEA09F77` | `0x01435800` | 123960 B |
| 960 | `load_fre.bmp` | `0x7CD57B96` | `0x01566800` | 123960 B |
| 961 | `load_sin.bmp` | `0x26A354BD` | `0x01585000` | 123960 B |
| 962 | `load_tag.bmp` | `0x7A8B942E` | `0x015A3800` | 123960 B |
| 963 | `load_con.bmp` | `0x730873D5` | `0x015C2000` | 123960 B |
| 964 | `load_trk.bmp` | `0x37A9C411` | `0x015E0800` | 123960 B |
| 965 | `loading.bmp` | `0xDB72EB47` | `0x015FF000` | 123564 B |
| 1053 | `s2bgd12.bmp` | `0xA1F7B1A0` | `0x01866800` | 123960 B |
| 1119 | `s2bgd11.bmp` | `0xDD1528DF` | `0x02269800` | 123960 B |

> **Formato dos Retratos `s2face0..18.bmp`:** todos possuem exatamente `4.088 B` (`62×47` 8-bit indexado, janela interna `46×36` dentro da moldura metálica, transparência magenta `#FF00FF` no índice `magIdx` específico de cada arquivo) e **devem ser atualizados em dobro**: entrada solta em `CD.WAD` **+** cópia embutida dentro de `options.pre` (`idx=45`). Veja detalhes completos no [MAPA 10](MAPA_10_MODELOS_3D_PSX_SKINNING_E_TEXTURAS.md) e [MAPA 11](MAPA_11_SKATISTAS_CUSTOMIZADOS_E_PIPELINE_ARTE.md).

> **Para listar ou extrair TODOS os 1.531 arquivos (incluindo todas as 1.040 texturas `.BMP` e 227 modelos `.PSX`):**
> ```powershell
> node Scripts/thps2_wad.js list
> node Scripts/thps2_wad.js unpack work_wad --pre
> ```
