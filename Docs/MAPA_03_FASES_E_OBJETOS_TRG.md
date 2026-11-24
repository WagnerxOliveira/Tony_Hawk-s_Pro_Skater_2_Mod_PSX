# 🗺️ MAPA 03 — Todas as Fases (`g_LevelTable`) e Posicionamento de Objetos (`.TRG`)

Este documento mapeia **todas as 11 fases** dentro de `SLUS_010.66` (`g_LevelTable @ 0x800B8444`, stride `0x174`) e decodifica **todos os 25 arquivos `.TRG` (`_TRG v2.0`)** dentro de `CD.WAD`, incluindo **coordenadas reais (X, Y, Z)** de spawns, coletáveis, objetos dinâmicos e contagem de rails/triggers.

---

## 1. Tabela Mestra de Fases (`g_LevelTable` em `0x800B8444`, stride `0x174` = 372 B)

- **Rotinas que referenciam `g_LevelTable`:** `0x8001F9A0`, `0x80022D5C`, `0x80022DC0`, `0x80024354`, `0x80024570`, `0x8002472C`, `0x80024BF8`, `0x80024FC4`.

| Idx | Endereço RAM | Offset `SLUS_010.66` | Nome da Fase | Localização | Prefixo | Comp. | Preview `.STR` |
| :-: | :---: | :---: | :--- | :--- | :---: | :-: | :--- |
| 0 | `0x800B8444` | `0x0A8C44` | **The Hangar** | Mullet Falls MT | `hangar` | 0 | `HANGAR.STR` |
| 1 | `0x800B85B8` | `0x0A8DB8` | **School II** | Southern Cali | `school2` | 0 | `SCHOOL.STR` |
| 2 | `0x800B872C` | `0x0A8F2C` | **Marseille** | France | `mar` | 1 | `MAR.STR` |
| 3 | `0x800B88A0` | `0x0A90A0` | **NY City** | New York | `ny` | 0 | `NY.STR` |
| 4 | `0x800B8A14` | `0x0A9214` | **Venice Beach** | California | `venice` | 0 | `VENICE.STR` |
| 5 | `0x800B8B88` | `0x0A9388` | **SkateStreet** | Ventura | `ss` | 1 | `SS.STR` |
| 6 | `0x800B8CFC` | `0x0A94FC` | **Philadelphia** | Pennsylvania | `philly` | 0 | `PHILLY.STR` |
| 7 | `0x800B8E70` | `0x0A9670` | **The Bullring** | Mexico | `bullring` | 1 | `BULLRING.STR` |
| 8 | `0x800B8FE4` | `0x0A97E4` | **Chopper Drop** | Hawaii | `b1` | 0 | `B1.STR` |
| 9 | `0x800B9158` | `0x0A9958` | **Skate Heaven** |  | `heaven` | 0 | `HEAVEN.STR` |
| 10 | `0x800B92CC` | `0x0A9ACC` | **Custom park name goes here** |  | `sked` | 0 | `EDITOR.STR` |

### Objetivos, Dinheiro e Ponteiros de Gaps por Fase

- **[0] The Hangar** (`0x800B8444` | GapList `+0x170` = `0x800BA174`): `+0x30`: "s2rend06.bmp" • `+0x40`: "s2levl07.bmp" • `+0x90`: "Auge do Lixo 10,000" • `+0xa8`: "Quase bom - 25,000" • `+0xc0`: "Rei Noob!!! - 75,000" • `+0xd8`: "Forme o S-K-A-T-E" • `+0xe8`: "BARRELS" • `+0xf0`: "Barrel Hunt" • `+0x100`: "PILOT WINGS" • `+0x108`: "Collect 5 Pilot Wings" • `+0x118`: "NOSEGRIND" • `+0x120`: "Nosegrind Over The Pipe" • `+0x130`: "Hangtime Gaps" • `+0x138`: "Hit 3 Hangtime Gaps"
- **[1] School II** (`0x800B85B8` | GapList `+0x170` = `0x800BA174`): `+0x30`: "s2rend04.bmp" • `+0x40`: "s2levl04.bmp" • `+0x90`: "Level lixo - 15,000" • `+0xa8`: "Noob faz  - 40,000" • `+0xc0`: "Zezao fez - 100,000  " • `+0xd8`: "Forme o S-K-A-T-E" • `+0xe8`: "School Bells" • `+0xf0`: "Wallride 5 Bells" • `+0x100`: "Hall Passes" • `+0x108`: "Collect 5 Hall Passes" • `+0x118`: "Kickflip" • `+0x120`: "Kickflip TC's Roof Gap" • `+0x130`: "Roll Call Rails" • `+0x138`: "Grind 3 Roll Call Rails"
- **[2] Marseille** (`0x800B872C` | GapList `+0x170` = `0x800BA1A0`): `+0x30`: "s2rend01.bmp" • `+0x40`: "s2levl01.bmp" • `+0x90`: "Temp Score" • `+0xa8`: "Temp Score" • `+0xc0`: "Temp Score" • `+0xd8`: "Temp Score" • `+0xf0`: "Temp Score" • `+0x108`: "Temp Score" • `+0x120`: "Temp Score" • `+0x138`: "Temp Score" • `+0x150`: "Temp Score" • `+0x168`: "Temp Score"
- **[3] NY City** (`0x800B88A0` | GapList `+0x170` = `0x800BA1F8`): `+0x30`: "s2rend03.bmp" • `+0x40`: "s2levl03.bmp" • `+0x90`: "High Score - 20,000" • `+0xa8`: "Pro Score - 50,000" • `+0xc0`: "SICK Score! - 150,000" • `+0xd8`: "Forme o S-K-A-T-E" • `+0xe8`: "HYDRANTS" • `+0xf0`: "Ollie the Hydrants" • `+0x100`: "SUBWAY TOKENS" • `+0x108`: "5 Subway Tokens" • `+0x118`: "50-50" • `+0x120`: "50-50 Joey's Sculpture" • `+0x138`: "Grind the Subway Rails" • `+0x150`: "Acho a Porra da Fita"
- **[4] Venice Beach** (`0x800B8A14` | GapList `+0x170` = `0x800BA1B8`): `+0x30`: "s2rend07.bmp" • `+0x40`: "s2levl06.bmp" • `+0x90`: "High Score - 40,000" • `+0xa8`: "Pro Score - 100,000" • `+0xc0`: "SICK Score! - 200,000" • `+0xd8`: "Forme o S-K-A-T-E" • `+0xe8`: "Bums" • `+0xf0`: "Pule o Bebum 5x       " • `+0x100`: "Spray Cans" • `+0x108`: "Collect 5 Spray Cans" • `+0x118`: "Tailslide" • `+0x120`: "Tailslide Venice Ledge" • `+0x130`: "VB Transfers" • `+0x138`: "Hit 4 VB Transfers"
- **[5] SkateStreet** (`0x800B8B88` | GapList `+0x170` = `0x800BA174`): `+0x30`: "s2rend02.bmp" • `+0x40`: "s2levl02.bmp" • `+0x90`: "NOOB BRONZE " • `+0xa8`: "NOOB PRATA  " • `+0xc0`: "NOOB OURO " • `+0xd8`: "Almost a Million!" • `+0xf0`: "Almost a Million!" • `+0x108`: "Almost a Million!" • `+0x120`: "Almost a Million!" • `+0x138`: "Almost a Million!" • `+0x150`: "Almost a Million!" • `+0x168`: "Almost a Million!"
- **[6] Philadelphia** (`0x800B8CFC` | GapList `+0x170` = `0x800BA1D4`): `+0x30`: "s2rend05.bmp" • `+0x40`: "s2levl05.bmp" • `+0x90`: "High Score - 50,000" • `+0xa8`: "Pro Score - 125,000" • `+0xc0`: "SICK Score! - 250,000" • `+0xd8`: "Forme o S-K-A-T-E" • `+0xe8`: "FOUNTAIN" • `+0xf0`: "Seco a fonte, Noob" • `+0x100`: "LIBERTY BELLS" • `+0x108`: "Collect 5 Bells" • `+0x118`: "Blunt" • `+0x120`: "Bluntslide the Awning" • `+0x130`: "Phillyside Lips" • `+0x138`: "Liptrick 4 Skatepark Lips"
- **[7] The Bullring** (`0x800B8E70` | GapList `+0x170` = `0x800BA218`): `+0x30`: "s2rend08.bmp" • `+0x40`: "s2levl08.bmp" • `+0x90`: "High Score A" • `+0xa8`: "High Score A" • `+0xc0`: "High Score A" • `+0xd8`: "High Score A" • `+0xf0`: "High Score A" • `+0x108`: "High Score A" • `+0x120`: "High Score A" • `+0x138`: "High Score A" • `+0x150`: "Ten Million!" • `+0x168`: "Ten Million!"
- **[8] Chopper Drop** (`0x800B8FE4` | GapList `+0x170` = `0x800BA174`): `+0x30`: "s2rend09.bmp" • `+0x40`: "s2levl09.bmp"
- **[9] Skate Heaven** (`0x800B9158` | GapList `+0x170` = `0x800BA22C`): `+0x30`: "s2rend10.bmp" • `+0x40`: "s2levl00.bmp"
- **[10] Custom park name goes here** (`0x800B92CC` | GapList `+0x170` = `0x800BA188`): `+0x30`: "s2rend11.bmp" • `+0x40`: "s2levl10.bmp" • `+0x90`: "High Score A" • `+0xa8`: "High Score A" • `+0xc0`: "High Score A" • `+0xd8`: "High Score A" • `+0xf0`: "High Score A" • `+0x108`: "High Score A" • `+0x120`: "High Score A" • `+0x138`: "High Score A" • `+0x150`: "Ten Million!" • `+0x168`: "Ten Million!"

---

## 2. Anatomia Binária dos Arquivos `.TRG` (`_TRG v2.0`)

Cada arquivo `.TRG` dentro de `CD.WAD` define **todos os posicionamentos de objetos, spawns, coletáveis, rails, câmeras e scripts de eventos** de uma fase:

```c
struct TRGHeader {
    char     magic[4];      // "_TRG"
    uint16_t ver_major;     // 2
    uint16_t ver_minor;     // 0
    uint32_t num_nodes;     // Quantidade total de nós na fase
    uint32_t offsets[];     // Array de num_nodes offsets relativos ao início do .TRG
};
```

### Tipos de Nó (`uint16 node_type` em `+0x00` de cada nó)

| Tipo | Nome Técnico | Estrutura / Posicionamento (X, Y, Z) |
| :-: | :--- | :--- |
| `1` | **Baddy / Objeto Dinâmico** | `uint16 type, uint16 subtype, links..., int32 X, int32 Y, int32 Z, int16 rot[3], script...` (carros, helicóptero, touro, pedestres, objetos móveis) |
| `2` | **Crate / Objeto Quebrável** | Referência de objeto destrutível (`uint32 checksum`) |
| `4` / `15` | **AutoExec (1P / 2P)** | Script inicial que carrega geometria `_l.psx` e objetos `_o.psx` da fase |
| `5` | **Powerup / Coletável** | `uint16 type=5, uint16 subtype, uint16 num_links, links[], int32 X, int32 Y, int32 Z` (letras S-K-A-T-E, Fita Secreta, Dinheiro, Pilot Wings, Sinos, etc.) |
| `6` | **CommandPoint / Trigger** | Gatilhos de gaps, áreas de evento e scripts de objetivos |
| `8` | **Restart / Spawn Point** | `uint16 type=8, uint16 num_links, uint16 links[], int32 X, int32 Y, int32 Z, int16 rot[3], char name[]` |
| `10` | **RailPoint** | `uint16 type=10, uint16 num_links, links[], int32 X, int32 Y, int32 Z` (vértices de corrimãos/bordas grindáveis) |
| `12` | **TrickObject / MeshRef** | Vincula `uint32 checksum` de malha 3D do `.PSX` a triggers/gaps |
| `13` | **CameraPath / Point** | `uint16 type=13, uint16 num_links, links[], int32 X, int32 Y, int32 Z` |
| `255` | **Terminator** | Fim da tabela de nós (`0x00FF`) |

---

## 3. Inventário Completo dos 25 Arquivos `.TRG` e Coordenadas Reais (X, Y, Z)

| Idx `CD.HED` | Arquivo | Hash | Offset `CD.WAD` | Tamanho | Nós | Restarts (t8) | Powerups (t5) | Objetos (t1) | Rails (t10) | Triggers (t6) | Malhas Carregadas (AutoExec) |
| :-: | :--- | :---: | :---: | :---: | :-: | :-: | :-: | :-: | :-: | :-: | :--- |
| 12 | `skhan_t.trg` | `0xCD8D0D3F` | `0x00156800` | 23680 B | 713 | 14 | 19 | 81 | 181 | 188 | `SkHan_l, SkHan_O, SkHan_l2, SkHan_O2` |
| 1054 | `skb1_t.trg` | `0x6B3306C1` | `0x01885000` | 5614 B | 164 | 8 | 0 | 20 | 66 | 23 | `Skate, SkB1_O` |
| 1059 | `(unknown_D90B544F.trg)` | `0xD90B544F` | `0x01923800` | 1808 B | 48 | 2 | 0 | 1 | 9 | 34 | `Skate, SkB1_O` |
| 1063 | `skmar_t.trg` | `0x61E1AC32` | `0x0197C800` | 22378 B | 682 | 12 | 8 | 33 | 288 | 175 | `Skate, SkMar_L, SkMar_O, SkMar_L2` |
| 1071 | `skss_t.trg` | `0xF5455F3E` | `0x01A93000` | 24270 B | 842 | 15 | 8 | 44 | 328 | 149 | `SkSS_l, SkSS_O, SkSS_l2, SkSS_O2` |
| 1078 | `skny_t.trg` | `0x6F38A42E` | `0x01BB4000` | 29156 B | 1015 | 20 | 23 | 65 | 388 | 234 | `SkNY_l2, SkNY_O2, SkNY_O, SkNY_l` |
| 1085 | `skph_t.trg` | `0x19C9C448` | `0x01CE3000` | 32116 B | 1145 | 15 | 24 | 60 | 570 | 223 | `SkPH_l, SkPH_O, SkPH_l2, SkPH_O2` |
| 1093 | `sksl2_t.trg` | `0x69219DC4` | `0x01E19000` | 27452 B | 920 | 13 | 23 | 29 | 502 | 179 | `Skate, SkSl2_L, SkSl2_O, SkSl2_L2` |
| 1101 | `skven_t.trg` | `0x3BF0118C` | `0x01F62800` | 29640 B | 997 | 15 | 23 | 46 | 427 | 299 | `Skate, SkVen_L, SkVen_O, SkVen_L2` |
| 1111 | `skbul_t.trg` | `0x42202B5D` | `0x02139000` | 40838 B | 1500 | 18 | 10 | 46 | 673 | 354 | `Skate, SkBul_L, SkBul_O, SkBul_L2` |
| 1120 | `skhvn_t.trg` | `0x62733C14` | `0x02288000` | 39110 B | 1289 | 20 | 0 | 19 | 758 | 191 | `Skate, SkHvn_L, SkHvn_O, SkHvn_L2` |
| 1127 | `skware_t.trg` | `0x15D7D0F6` | `0x0239B800` | 10590 B | 313 | 9 | 12 | 53 | 60 | 64 | `Skate, SkWare_L, SkWare_O` |
| 1136 | `(unknown_C3BA3679.trg)` | `0xC3BA3679` | `0x0251D800` | 28160 B | 965 | 10 | 17 | 17 | 342 | 234 | `SkSchl_o` |
| 1138 | `(unknown_D90BFFD8.trg)` | `0xD90BFFD8` | `0x0255A800` | 10656 B | 333 | 9 | 0 | 2 | 164 | 17 | `Skate, SkBurn_L, SkBurn_O` |
| 1149 | `(unknown_98266C2E.trg)` | `0x98266C2E` | `0x02735000` | 28532 B | 765 | 12 | 21 | 65 | 235 | 162 | `SkMall_l, SkMall_o, SkMallo2, SkMallL2` |
| 1150 | `(unknown_8AF0AF98.trg)` | `0x8AF0AF98` | `0x0273C000` | 18796 B | 606 | 14 | 21 | 48 | 100 | 146 | `skjam_l, skjam_o, skjaml2, skjamo2` |
| 1157 | `(unknown_9BBAE136.trg)` | `0x9BBAE136` | `0x0288E000` | 33084 B | 1006 | 18 | 22 | 50 | 415 | 155 | `Skate, SkDown_L, SkDown_O, SkDownL2` |
| 1165 | `(unknown_0A6195CD.trg)` | `0x0A6195CD` | `0x029D8000` | 7972 B | 248 | 8 | 0 | 1 | 123 | 41 | `Skate, SkVans_L, SkVans_O` |
| 1170 | `(unknown_C7400461.trg)` | `0xC7400461` | `0x02A7B000` | 12864 B | 324 | 12 | 0 | 40 | 87 | 58 | `Skate, SkRos_L, SkRos_O, SkRosO2` |
| 1177 | `(unknown_9AAF54E0.trg)` | `0x9AAF54E0` | `0x02B4D000` | 35476 B | 1000 | 19 | 11 | 67 | 449 | 163 | `Skate, SkSF_L, SkSF_O, SkSF_L2` |
| 1187 | `sked_t.trg` | `0xCD83E332` | `0x02C90000` | 2944 B | 91 | 3 | 0 | 0 | 0 | 0 | `Skate` |
| 1190 | `(unknown_37477108.trg)` | `0x37477108` | `0x02D0D000` | 17796 B | 765 | 3 | 0 | 0 | 624 | 0 | `Skate` |
| 1198 | `sked2_t.trg` | `0x857F2386` | `0x02DA4000` | 17796 B | 765 | 3 | 0 | 0 | 624 | 0 | `Skate` |
| 1206 | `(unknown_04878941.trg)` | `0x04878941` | `0x02E32800` | 17796 B | 765 | 3 | 0 | 0 | 624 | 0 | `Skate` |
| 1214 | `(unknown_22CC2AAE.trg)` | `0x22CC2AAE` | `0x02EC9800` | 17796 B | 765 | 3 | 0 | 0 | 624 | 0 | `Skate` |

---

## 4. Amostra de Coordenadas Exatas (X, Y, Z) e Offsets para Edição Direta

> Para mover qualquer spawn, coletável (S-K-A-T-E, fita, cash) ou objeto de uma fase, basta editar os **3 inteiros `int32_le` (X, Y, Z)** no offset indicado abaixo (relativo ao início do arquivo `.TRG`) e reempacotar com `node tools/thps2_wad.js repack`.

### `skhan_t.trg` (CD.HED idx=12, `CD.WAD +0x00156800`, 713 nós)
- **Spawns / Restarts (Type 8 — 14 no total, primeiros 8):**
  - Node #0 `"Start"` | offset XYZ `+0x0B44` (WAD `0x00157344`) → `X=-1001, Y=-2154, Z=2801`
  - Node #136 `"Node#136"` | offset XYZ `+0x1EBA` (WAD `0x001586BA`) → `X=262012928, Y=-47513600, Z=-458686465`
  - Node #159 `"Heli Side"` | offset XYZ `+0x2160` (WAD `0x00158960`) → `X=7097, Y=-380, Z=-3501`
  - Node #160 `"Control Room"` | offset XYZ `+0x21C4` (WAD `0x001589C4`) → `X=11010, Y=-1130, Z=-3641`
  - Node #368 `"Re_2P"` | offset XYZ `+0x3730` (WAD `0x00159F30`) → `X=-1198, Y=-2154, Z=2801`
  - Node #369 `"Node#369"` | offset XYZ `+0x379A` (WAD `0x00159F9A`) → `X=-57737216, Y=9240575, Z=169345024`
  - Node #370 `"2P Start 1"` | offset XYZ `+0x380C` (WAD `0x0015A00C`) → `X=-786, Y=-2154, Z=2801`
  - Node #531 `"Node#531"` | offset XYZ `+0x4686` (WAD `0x0015AE86`) → `X=-69402624, Y=-141099009, Z=183631871`
- **Coletáveis / Powerups (Type 5 — 19 no total, primeiros 6):**
  - Node #149 (subtype `0x10`) | offset XYZ `+0x1FFC` (WAD `0x001587FC`) → `X=11009, Y=-1004, Z=-3182`
  - Node #311 (subtype `0x5`) | offset XYZ `+0x3172` (WAD `0x00159972`) → `X=-65601536, Y=-49610753, Z=-229507073`
  - Node #312 (subtype `0x4`) | offset XYZ `+0x318C` (WAD `0x0015998C`) → `X=397, Y=-989, Z=-6996`
  - Node #313 (subtype `0x6`) | offset XYZ `+0x31A4` (WAD `0x001599A4`) → `X=1383, Y=-649, Z=-3503`
  - Node #314 (subtype `0xf`) | offset XYZ `+0x31BC` (WAD `0x001599BC`) → `X=2796, Y=-1113, Z=246`
  - Node #315 (subtype `0xa`) | offset XYZ `+0x31D4` (WAD `0x001599D4`) → `X=6711, Y=-1173, Z=-3506`

### `skb1_t.trg` (CD.HED idx=1054, `CD.WAD +0x01885000`, 164 nós)
- **Spawns / Restarts (Type 8 — 8 no total, primeiros 8):**
  - Node #2 `"Re_Start_Skate"` | offset XYZ `+0x02FC` (WAD `0x018852FC`) → `X=-935, Y=-1689, Z=1614`
  - Node #6 `"Re_Start_Dist"` | offset XYZ `+0x0390` (WAD `0x01885390`) → `X=2549, Y=-2082, Z=-1452`
  - Node #106 `"Re_2P"` | offset XYZ `+0x0F94` (WAD `0x01885F94`) → `X=-1011, Y=-1689, Z=1614`
  - Node #107 `"ÿRe_Start_2P"` | offset XYZ `+0x0FDE` (WAD `0x01885FDE`) → `X=-56229888, Y=-110624769, Z=105840639`
  - Node #136 `"Node#136"` | offset XYZ `+0x126E` (WAD `0x0188626E`) → `X=-61276160, Y=-110624769, Z=106037247`
  - Node #137 `"Ho_SkB1_BigRoll"` | offset XYZ `+0x12C4` (WAD `0x018862C4`) → `X=2549, Y=-2082, Z=-1455`
  - Node #138 `"Ho_SkB1_Dock"` | offset XYZ `+0x1318` (WAD `0x01886318`) → `X=2379, Y=476, Z=6629`
  - Node #139 `"Node#139"` | offset XYZ `+0x136A` (WAD `0x0188636A`) → `X=-61276160, Y=-68288513, Z=94699519`

### `(unknown_D90B544F.trg)` (CD.HED idx=1059, `CD.WAD +0x01923800`, 48 nós)
- **Spawns / Restarts (Type 8 — 2 no total, primeiros 8):**
  - Node #2 `"Re_Start_Skate"` | offset XYZ `+0x011C` (WAD `0x0192391C`) → `X=-935, Y=-1039, Z=1434`
  - Node #13 `"Re_Start_Dist"` | offset XYZ `+0x02AC` (WAD `0x01923AAC`) → `X=2549, Y=-2082, Z=-1452`

### `skmar_t.trg` (CD.HED idx=1063, `CD.WAD +0x0197C800`, 682 nós)
- **Spawns / Restarts (Type 8 — 12 no total, primeiros 8):**
  - Node #0 `"Re_Start_Skate"` | offset XYZ `+0x0AD8` (WAD `0x0197D2D8`) → `X=3872, Y=-297, Z=-373`
  - Node #269 `"Re_Start_2P"` | offset XYZ `+0x2CEC` (WAD `0x0197F4EC`) → `X=3553, Y=-297, Z=-492`
  - Node #270 `"Node#270"` | offset XYZ `+0x2DDE` (WAD `0x0197F5DE`) → `X=274595840, Y=-19464192, Z=-16580609`
  - Node #639 `"Node#639"` | offset XYZ `+0x4C8A` (WAD `0x0198148A`) → `X=-42008576, Y=1226833919, Z=590413824`
  - Node #651 `"Node#651"` | offset XYZ `+0x4DF2` (WAD `0x019815F2`) → `X=195887104, Y=-19464192, Z=448331775`
  - Node #652 `"Node#652"` | offset XYZ `+0x4EF2` (WAD `0x019816F2`) → `X=-395706368, Y=-19398657, Z=548339711`
  - Node #658 `"Node#658"` | offset XYZ `+0x50CE` (WAD `0x019818CE`) → `X=253755392, Y=-19464192, Z=-24379393`
  - Node #662 `"Ho_Start_Street_Area_West"` | offset XYZ `+0x5174` (WAD `0x01981974`) → `X=6204, Y=-128, Z=6505`
- **Coletáveis / Powerups (Type 5 — 8 no total, primeiros 6):**
  - Node #498 (subtype `0x1a`) | offset XYZ `+0x40DE` (WAD `0x019808DE`) → `X=-44040192, Y=1212415999, Z=1038876672`
  - Node #644 (subtype `0x19`) | offset XYZ `+0x4D4A` (WAD `0x0198154A`) → `X=-39256064, Y=-95420417, Z=-91095041`
  - Node #645 (subtype `0x19`) | offset XYZ `+0x4D64` (WAD `0x01981564`) → `X=-672, Y=18176, Z=18611`
  - Node #646 (subtype `0x19`) | offset XYZ `+0x4D7C` (WAD `0x0198157C`) → `X=-670, Y=18683, Z=11256`
  - Node #647 (subtype `0x19`) | offset XYZ `+0x4D94` (WAD `0x01981594`) → `X=-670, Y=18443, Z=8669`
  - Node #648 (subtype `0x1a`) | offset XYZ `+0x4DAC` (WAD `0x019815AC`) → `X=-3861, Y=-1058, Z=4199`

### `skss_t.trg` (CD.HED idx=1071, `CD.WAD +0x01A93000`, 842 nós)
- **Spawns / Restarts (Type 8 — 15 no total, primeiros 8):**
  - Node #1 `"Node#1"` | offset XYZ `+0x0D92` (WAD `0x01A93D92`) → `X=660930560, Y=-228458497, Z=1304756223`
  - Node #209 `"Half Pipe"` | offset XYZ `+0x1D0C` (WAD `0x01A94D0C`) → `X=-49360, Y=-3812, Z=19947`
  - Node #474 `"Re_Start_2P_SS_Wave_RollIn"` | offset XYZ `+0x2F9C` (WAD `0x01A95F9C`) → `X=-62642, Y=-3818, Z=24793`
  - Node #692 `"Node#692"` | offset XYZ `+0x44BA` (WAD `0x01A974BA`) → `X=669450240, Y=-228458497, Z=1301086207`
  - Node #694 `"Ho_Waterfall"` | offset XYZ `+0x45E0` (WAD `0x01A975E0`) → `X=-55471, Y=-3487, Z=19919`
  - Node #695 `"Ho_Bowl"` | offset XYZ `+0x46AC` (WAD `0x01A976AC`) → `X=-52475, Y=-3335, Z=20748`
  - Node #696 `"Ho_Mini Halfpipe"` | offset XYZ `+0x47AC` (WAD `0x01A977AC`) → `X=-60412, Y=-2996, Z=16014`
  - Node #697 `"Ho_Kiddie"` | offset XYZ `+0x489C` (WAD `0x01A9789C`) → `X=-55191, Y=-2735, Z=16162`
- **Coletáveis / Powerups (Type 5 — 8 no total, primeiros 6):**
  - Node #681 (subtype `0x19`) | offset XYZ `+0x438A` (WAD `0x01A9738A`) → `X=673120256, Y=-230883329, Z=1208352767`
  - Node #682 (subtype `0x19`) | offset XYZ `+0x43A4` (WAD `0x01A973A4`) → `X=-56920, Y=-3676, Z=16059`
  - Node #683 (subtype `0x1a`) | offset XYZ `+0x43BC` (WAD `0x01A973BC`) → `X=-50412, Y=-3209, Z=33541`
  - Node #684 (subtype `0x1a`) | offset XYZ `+0x43D4` (WAD `0x01A973D4`) → `X=-51689, Y=-3849, Z=15747`
  - Node #685 (subtype `0x1a`) | offset XYZ `+0x43EC` (WAD `0x01A973EC`) → `X=-61210, Y=-3919, Z=28849`
  - Node #686 (subtype `0x1a`) | offset XYZ `+0x4404` (WAD `0x01A97404`) → `X=-62078, Y=-4027, Z=22508`

### `skny_t.trg` (CD.HED idx=1078, `CD.WAD +0x01BB4000`, 1015 nós)
- **Spawns / Restarts (Type 8 — 20 no total, primeiros 8):**
  - Node #4 `"Node#4"` | offset XYZ `+0x1022` (WAD `0x01BB5022`) → `X=145227776, Y=-3211265, Z=1554448383`
  - Node #5 `"Node#5"` | offset XYZ `+0x10C2` (WAD `0x01BB50C2`) → `X=741015552, Y=25231359, Z=1598685184`
  - Node #65 `"Re_Subway_South"` | offset XYZ `+0x1680` (WAD `0x01BB5680`) → `X=-60721, Y=-2275, Z=29197`
  - Node #90 `"Re_Dummy"` | offset XYZ `+0x196C` (WAD `0x01BB596C`) → `X=-54457, Y=384, Z=27379`
  - Node #102 `"Re_Dummy"` | offset XYZ `+0x1AD8` (WAD `0x01BB5AD8`) → `X=-51793, Y=0, Z=16197`
  - Node #105 `"Node#105"` | offset XYZ `+0x1BC6` (WAD `0x01BB5BC6`) → `X=-250347520, Y=65534, Z=1061486592`
  - Node #111 `"Node#111"` | offset XYZ `+0x1D2A` (WAD `0x01BB5D2A`) → `X=-333185024, Y=65534, Z=2107310080`
  - Node #113 `"Node#113"` | offset XYZ `+0x1DFA` (WAD `0x01BB5DFA`) → `X=382009344, Y=65535, Z=918683648`
- **Coletáveis / Powerups (Type 5 — 23 no total, primeiros 6):**
  - Node #329 (subtype `0x1a`) | offset XYZ `+0x308C` (WAD `0x01BB708C`) → `X=-61164, Y=-1087, Z=14637`
  - Node #334 (subtype `0xa`) | offset XYZ `+0x312C` (WAD `0x01BB712C`) → `X=-58071, Y=-607, Z=31280`
  - Node #607 (subtype `0x4`) | offset XYZ `+0x4382` (WAD `0x01BB8382`) → `X=544931840, Y=-41680897, Z=1144061951`
  - Node #608 (subtype `0x6`) | offset XYZ `+0x439C` (WAD `0x01BB839C`) → `X=-56045, Y=104, Z=20847`
  - Node #609 (subtype `0x5`) | offset XYZ `+0x43B4` (WAD `0x01BB83B4`) → `X=-60221, Y=-472, Z=24697`
  - Node #610 (subtype `0xf`) | offset XYZ `+0x43CC` (WAD `0x01BB83CC`) → `X=-54571, Y=138, Z=27847`

### `skph_t.trg` (CD.HED idx=1085, `CD.WAD +0x01CE3000`, 1145 nós)
- **Spawns / Restarts (Type 8 — 15 no total, primeiros 8):**
  - Node #0 `"Start"` | offset XYZ `+0x11FC` (WAD `0x01CE41FC`) → `X=5757, Y=-490, Z=7583`
  - Node #204 `"Node#204"` | offset XYZ `+0x22CE` (WAD `0x01CE52CE`) → `X=650182656, Y=-48103424, Z=-699924481`
  - Node #205 `"Back of THPS Park"` | offset XYZ `+0x235C` (WAD `0x01CE535C`) → `X=-5387, Y=-29, Z=-6792`
  - Node #233 `"Phillyside"` | offset XYZ `+0x2614` (WAD `0x01CE5614`) → `X=20399, Y=-298, Z=780`
  - Node #360 `"Node#360"` | offset XYZ `+0x2FFE` (WAD `0x01CE5FFE`) → `X=-264830976, Y=-11403265, Z=-341966849`
  - Node #489 `"Node#489"` | offset XYZ `+0x3A3A` (WAD `0x01CE6A3A`) → `X=208928768, Y=-32112640, Z=285802495`
  - Node #490 `"Node#490"` | offset XYZ `+0x3AA6` (WAD `0x01CE6AA6`) → `X=162791424, Y=-32112640, Z=306577407`
  - Node #826 `"Node#826"` | offset XYZ `+0x59AE` (WAD `0x01CE89AE`) → `X=422445056, Y=-31326208, Z=470745087`
- **Coletáveis / Powerups (Type 5 — 24 no total, primeiros 6):**
  - Node #359 (subtype `0x10`) | offset XYZ `+0x2FE6` (WAD `0x01CE5FE6`) → `X=-218103808, Y=-96141313, Z=-6946817`
  - Node #553 (subtype `0x21`) | offset XYZ `+0x4104` (WAD `0x01CE7104`) → `X=-135, Y=-1201, Z=5799`
  - Node #554 (subtype `0x21`) | offset XYZ `+0x411C` (WAD `0x01CE711C`) → `X=-5682, Y=-557, Z=30`
  - Node #555 (subtype `0x21`) | offset XYZ `+0x4134` (WAD `0x01CE7134`) → `X=-2038, Y=-904, Z=-5982`
  - Node #556 (subtype `0x21`) | offset XYZ `+0x414C` (WAD `0x01CE714C`) → `X=3840, Y=-710, Z=-5226`
  - Node #676 (subtype `0x5`) | offset XYZ `+0x4C1E` (WAD `0x01CE7C1E`) → `X=-336592896, Y=-69599233, Z=-55508993`

### `sksl2_t.trg` (CD.HED idx=1093, `CD.WAD +0x01E19000`, 920 nós)
- **Spawns / Restarts (Type 8 — 13 no total, primeiros 8):**
  - Node #0 `"Node#0"` | offset XYZ `+0x0E76` (WAD `0x01E19E76`) → `X=103350272, Y=-1966080, Z=325517311`
  - Node #2 `"Re_Start_2P"` | offset XYZ `+0x102C` (WAD `0x01E1A02C`) → `X=1407, Y=-30, Z=4966`
  - Node #3 `"Node#3"` | offset XYZ `+0x111A` (WAD `0x01E1A11A`) → `X=114491392, Y=-1966080, Z=325517311`
  - Node #150 `"Node#150"` | offset XYZ `+0x1DDE` (WAD `0x01E1ADDE`) → `X=896598016, Y=-39190528, Z=1617887231`
  - Node #151 `"Re_Start_Roof_Gaps"` | offset XYZ `+0x1F50` (WAD `0x01E1AF50`) → `X=5181, Y=-628, Z=10746`
  - Node #214 `"Node#214"` | offset XYZ `+0x26FA` (WAD `0x01E1B6FA`) → `X=-325517312, Y=64290815, Z=2108030976`
  - Node #658 `"Ho_Start_Bike_Racks"` | offset XYZ `+0x4CB8` (WAD `0x01E1DCB8`) → `X=8184, Y=898, Z=35906`
  - Node #659 `"Node#659"` | offset XYZ `+0x4DAE` (WAD `0x01E1DDAE`) → `X=-325517312, Y=64290815, Z=2108030976`
- **Coletáveis / Powerups (Type 5 — 23 no total, primeiros 6):**
  - Node #205 (subtype `0x5`) | offset XYZ `+0x263C` (WAD `0x01E1B63C`) → `X=6201, Y=-61, Z=9046`
  - Node #206 (subtype `0xa`) | offset XYZ `+0x2654` (WAD `0x01E1B654`) → `X=-938, Y=602, Z=32098`
  - Node #207 (subtype `0x4`) | offset XYZ `+0x266C` (WAD `0x01E1B66C`) → `X=13001, Y=-530, Z=10960`
  - Node #208 (subtype `0x6`) | offset XYZ `+0x2684` (WAD `0x01E1B684`) → `X=9124, Y=386, Z=24822`
  - Node #209 (subtype `0xf`) | offset XYZ `+0x269C` (WAD `0x01E1B69C`) → `X=4501, Y=602, Z=36706`
  - Node #218 (subtype `0x10`) | offset XYZ `+0x2932` (WAD `0x01E1B932`) → `X=896598016, Y=-69074944, Z=1528758271`

### `skven_t.trg` (CD.HED idx=1101, `CD.WAD +0x01F62800`, 997 nós)
- **Spawns / Restarts (Type 8 — 15 no total, primeiros 8):**
  - Node #0 `"Node#0"` | offset XYZ `+0x0FA6` (WAD `0x01F637A6`) → `X=2040659968, Y=-13107200, Z=498008063`
  - Node #2 `"Re_Start_2P"` | offset XYZ `+0x113C` (WAD `0x01F6393C`) → `X=31308, Y=-200, Z=7428`
  - Node #3 `"Re_2P"` | offset XYZ `+0x1248` (WAD `0x01F63A48`) → `X=30968, Y=-200, Z=7428`
  - Node #458 `"Ho_Start_Semi_Pool"` | offset XYZ `+0x3A28` (WAD `0x01F66228`) → `X=35385, Y=156, Z=6713`
  - Node #459 `"Ho_Start_Triple_Rail"` | offset XYZ `+0x3B3C` (WAD `0x01F6633C`) → `X=28509, Y=-30, Z=2595`
  - Node #460 `"Re_Start_Seashell_Roof"` | offset XYZ `+0x3C54` (WAD `0x01F66454`) → `X=31808, Y=-981, Z=905`
  - Node #461 `"Re_Start_Venice_Ledge"` | offset XYZ `+0x3DAC` (WAD `0x01F665AC`) → `X=43949, Y=156, Z=-2249`
  - Node #462 `"Re_Start_West_Side_Roof"` | offset XYZ `+0x3F00` (WAD `0x01F66700`) → `X=19860, Y=-540, Z=-9351`
- **Coletáveis / Powerups (Type 5 — 23 no total, primeiros 6):**
  - Node #256 (subtype `0x21`) | offset XYZ `+0x2738` (WAD `0x01F64F38`) → `X=36763, Y=-595, Z=6245`
  - Node #266 (subtype `0x21`) | offset XYZ `+0x27CA` (WAD `0x01F64FCA`) → `X=1822687232, Y=-22282240, Z=315752447`
  - Node #267 (subtype `0x21`) | offset XYZ `+0x27E4` (WAD `0x01F64FE4`) → `X=18696, Y=-1062, Z=-6742`
  - Node #268 (subtype `0x21`) | offset XYZ `+0x27FC` (WAD `0x01F64FFC`) → `X=15551, Y=-1020, Z=7167`
  - Node #269 (subtype `0x21`) | offset XYZ `+0x2814` (WAD `0x01F65014`) → `X=39554, Y=-212, Z=-3527`
  - Node #316 (subtype `0x10`) | offset XYZ `+0x2BC8` (WAD `0x01F653C8`) → `X=28239, Y=-1214, Z=-1183`

### `skbul_t.trg` (CD.HED idx=1111, `CD.WAD +0x02139000`, 1500 nós)
- **Spawns / Restarts (Type 8 — 18 no total, primeiros 8):**
  - Node #1 `"Node#1"` | offset XYZ `+0x17E2` (WAD `0x0213A7E2`) → `X=132382720, Y=-82509824, Z=55836671`
  - Node #3 `"Re_2P"` | offset XYZ `+0x18D4` (WAD `0x0213A8D4`) → `X=1275, Y=-749, Z=-680`
  - Node #5 `"Node#5"` | offset XYZ `+0x195E` (WAD `0x0213A95E`) → `X=-83820544, Y=-49020929, Z=155975679`
  - Node #732 `"Re_Start_North_Gate"` | offset XYZ `+0x55EC` (WAD `0x0213E5EC`) → `X=0, Y=-902, Z=6141`
  - Node #733 `"Node#733"` | offset XYZ `+0x56B2` (WAD `0x0213E6B2`) → `X=0, Y=-83623936, Z=-386793473`
  - Node #734 `"Node#734"` | offset XYZ `+0x577A` (WAD `0x0213E77A`) → `X=382402560, Y=-72482816, Z=65535`
  - Node #735 `"Node#735"` | offset XYZ `+0x5842` (WAD `0x0213E842`) → `X=-386859008, Y=-72417281, Z=65535`
  - Node #876 `"Ho_Dropin"` | offset XYZ `+0x64C0` (WAD `0x0213F4C0`) → `X=2020, Y=-1259, Z=851`
- **Coletáveis / Powerups (Type 5 — 10 no total, primeiros 6):**
  - Node #847 (subtype `0x18`) | offset XYZ `+0x6262` (WAD `0x0213F262`) → `X=-280559616, Y=-155910145, Z=280625151`
  - Node #848 (subtype `0x18`) | offset XYZ `+0x627C` (WAD `0x0213F27C`) → `X=4281, Y=-2380, Z=-4281`
  - Node #849 (subtype `0x18`) | offset XYZ `+0x6294` (WAD `0x0213F294`) → `X=2720, Y=-2039, Z=-3`
  - Node #850 (subtype `0x18`) | offset XYZ `+0x62AC` (WAD `0x0213F2AC`) → `X=-2720, Y=-2039, Z=-3`
  - Node #851 (subtype `0x18`) | offset XYZ `+0x62C4` (WAD `0x0213F2C4`) → `X=0, Y=-2032, Z=-2720`
  - Node #852 (subtype `0x18`) | offset XYZ `+0x62DC` (WAD `0x0213F2DC`) → `X=0, Y=-2032, Z=2720`

### `skhvn_t.trg` (CD.HED idx=1120, `CD.WAD +0x02288000`, 1289 nós)
- **Spawns / Restarts (Type 8 — 20 no total, primeiros 8):**
  - Node #1 `"Re_Start_Skate"` | offset XYZ `+0x147C` (WAD `0x0228947C`) → `X=-1087, Y=-1, Z=2490`
  - Node #245 `"Re_SkHvn_EnemaIsland"` | offset XYZ `+0x2984` (WAD `0x0228A984`) → `X=71962, Y=824, Z=-46911`
  - Node #303 `"Re_SkHvn_SadLands"` | offset XYZ `+0x2F54` (WAD `0x0228AF54`) → `X=9238, Y=1198, Z=8229`
  - Node #304 `"Re_SkHvn_Wallows"` | offset XYZ `+0x3080` (WAD `0x0228B080`) → `X=1128, Y=-33, Z=6302`
  - Node #305 `"Re_SkHvn_CombiBowl"` | offset XYZ `+0x31AC` (WAD `0x0228B1AC`) → `X=7667, Y=-34, Z=-2702`
  - Node #306 `"Re_SkHvn_TonyRamp"` | offset XYZ `+0x32D8` (WAD `0x0228B2D8`) → `X=12026, Y=109, Z=-64`
  - Node #806 `"Node#806"` | offset XYZ `+0x5C32` (WAD `0x0228DC32`) → `X=487522304, Y=18350081, Z=1851392000`
  - Node #830 `"Re_2P"` | offset XYZ `+0x6158` (WAD `0x0228E158`) → `X=-849, Y=-1, Z=2577`

### `skware_t.trg` (CD.HED idx=1127, `CD.WAD +0x0239B800`, 313 nós)
- **Spawns / Restarts (Type 8 — 9 no total, primeiros 8):**
  - Node #82 `"Re_Start_2P"` | offset XYZ `+0x0E70` (WAD `0x0239C670`) → `X=7449, Y=-1441, Z=2731`
  - Node #83 `"Re_Start_Skate"` | offset XYZ `+0x0ED4` (WAD `0x0239C6D4`) → `X=5842, Y=-1441, Z=2731`
  - Node #166 `"Ho_SkWare_BigRail"` | offset XYZ `+0x1B50` (WAD `0x0239D350`) → `X=6440, Y=-30, Z=12187`
  - Node #167 `"Node#167"` | offset XYZ `+0x1C0E` (WAD `0x0239D40E`) → `X=497090560, Y=-94437376, Z=212467711`
  - Node #168 `"Ho_SkWare_BigRailGap"` | offset XYZ `+0x1C5C` (WAD `0x0239D45C`) → `X=4932, Y=-834, Z=4465`
  - Node #169 `"Ho_SkWare_Kickers"` | offset XYZ `+0x1CAC` (WAD `0x0239D4AC`) → `X=3097, Y=-396, Z=13246`
  - Node #170 `"Node#170"` | offset XYZ `+0x1CFA` (WAD `0x0239D4FA`) → `X=394854400, Y=-29294592, Z=942211071`
  - Node #171 `"Ho_SkWare_HP"` | offset XYZ `+0x1D4C` (WAD `0x0239D54C`) → `X=6224, Y=-30, Z=9408`
- **Coletáveis / Powerups (Type 5 — 12 no total, primeiros 6):**
  - Node #12 (subtype `0xa`) | offset XYZ `+0x06C4` (WAD `0x0239BEC4`) → `X=4184, Y=-621, Z=5665`
  - Node #13 (subtype `0xf`) | offset XYZ `+0x06DE` (WAD `0x0239BEDE`) → `X=508166144, Y=-62390272, Z=616628223`
  - Node #15 (subtype `0x15`) | offset XYZ `+0x0726` (WAD `0x0239BF26`) → `X=508231680, Y=-68550656, Z=438173695`
  - Node #16 (subtype `0x10`) | offset XYZ `+0x0742` (WAD `0x0239BF42`) → `X=600702976, Y=-67305472, Z=616628223`
  - Node #17 (subtype `0x6`) | offset XYZ `+0x075E` (WAD `0x0239BF5E`) → `X=502857728, Y=-27983872, Z=795148287`
  - Node #28 (subtype `0x5`) | offset XYZ `+0x083C` (WAD `0x0239C03C`) → `X=3395, Y=-425, Z=10902`

### `(unknown_C3BA3679.trg)` (CD.HED idx=1136, `CD.WAD +0x0251D800`, 965 nós)
- **Spawns / Restarts (Type 8 — 10 no total, primeiros 8):**
  - Node #393 `"Node#393"` | offset XYZ `+0x3B62` (WAD `0x02521362`) → `X=-402980864, Y=-182910977, Z=418906111`
  - Node #394 `"Ho_Start_School_Two_Player"` | offset XYZ `+0x3C00` (WAD `0x02521400`) → `X=-11718, Y=-231, Z=-6274`
  - Node #851 `"Node#851"` | offset XYZ `+0x6112` (WAD `0x02523912`) → `X=-118751232, Y=-1900545, Z=-677838849`
  - Node #852 `"Node#852"` | offset XYZ `+0x61A2` (WAD `0x025239A2`) → `X=-662437888, Y=-13500417, Z=-811401217`
  - Node #853 `"Node#853"` | offset XYZ `+0x625A` (WAD `0x02523A5A`) → `X=358285312, Y=1900544, Z=-194641920`
  - Node #854 `"Node#854"` | offset XYZ `+0x62EA` (WAD `0x02523AEA`) → `X=549388288, Y=-1966080, Z=-398852097`
  - Node #855 `"Node#855"` | offset XYZ `+0x637E` (WAD `0x02523B7E`) → `X=180355072, Y=-1966080, Z=-590479361`
  - Node #856 `"Node#856"` | offset XYZ `+0x6412` (WAD `0x02523C12`) → `X=544604160, Y=-2424832, Z=-152698881`
- **Coletáveis / Powerups (Type 5 — 17 no total, primeiros 6):**
  - Node #23 (subtype `0x10`) | offset XYZ `+0x1260` (WAD `0x0251EA60`) → `X=-15081, Y=-2080, Z=-3020`
  - Node #24 (subtype `0x5`) | offset XYZ `+0x127A` (WAD `0x0251EA7A`) → `X=-927006720, Y=-73859073, Z=41680895`
  - Node #41 (subtype `0x4`) | offset XYZ `+0x1464` (WAD `0x0251EC64`) → `X=-12130, Y=-590, Z=-5877`
  - Node #134 (subtype `0x6`) | offset XYZ `+0x1F5C` (WAD `0x0251F75C`) → `X=-4948, Y=-222, Z=-10347`
  - Node #135 (subtype `0x17`) | offset XYZ `+0x1F78` (WAD `0x0251F778`) → `X=-15195, Y=-2768, Z=15641`
  - Node #417 (subtype `0x16`) | offset XYZ `+0x3F1C` (WAD `0x0252171C`) → `X=-5509, Y=-778, Z=-12167`

### `(unknown_D90BFFD8.trg)` (CD.HED idx=1138, `CD.WAD +0x0255A800`, 333 nós)
- **Spawns / Restarts (Type 8 — 9 no total, primeiros 8):**
  - Node #1 `"Node#1"` | offset XYZ `+0x0592` (WAD `0x0255AD92`) → `X=216662016, Y=-42139648, Z=-208666625`
  - Node #101 `"Re_Start_2P"` | offset XYZ `+0x11B4` (WAD `0x0255B9B4`) → `X=-1204, Y=-642, Z=3732`
  - Node #160 `"Node#160"` | offset XYZ `+0x170E` (WAD `0x0255BF0E`) → `X=216662016, Y=-42139648, Z=-208666625`
  - Node #161 `"Ho_SkBurn_TripleRail"` | offset XYZ `+0x17E8` (WAD `0x0255BFE8`) → `X=-2749, Y=-633, Z=45`
  - Node #162 `"Ho_SkBurn_MainWall"` | offset XYZ `+0x184C` (WAD `0x0255C04C`) → `X=-853, Y=-370, Z=1416`
  - Node #163 `"Node#163"` | offset XYZ `+0x18AE` (WAD `0x0255C0AE`) → `X=-124518400, Y=-24182785, Z=29818879`
  - Node #164 `"Node#164"` | offset XYZ `+0x1912` (WAD `0x0255C112`) → `X=-149028864, Y=-70975489, Z=305790975`
  - Node #165 `"Node#165"` | offset XYZ `+0x1972` (WAD `0x0255C172`) → `X=-140181504, Y=-37552129, Z=-27983873`

### `(unknown_98266C2E.trg)` (CD.HED idx=1149, `CD.WAD +0x02735000`, 765 nós)
- **Spawns / Restarts (Type 8 — 12 no total, primeiros 8):**
  - Node #40 `"Node#40"` | offset XYZ `+0x115E` (WAD `0x0273615E`) → `X=1032585216, Y=-186974209, Z=1448673279`
  - Node #41 `"Ho_Upstairs01_Mall"` | offset XYZ `+0x11C8` (WAD `0x027361C8`) → `X=-41536, Y=-1730, Z=22495`
  - Node #42 `"Node#42"` | offset XYZ `+0x12C2` (WAD `0x027362C2`) → `X=-1981349888, Y=-106233857, Z=1458307071`
  - Node #102 `"Ho_Slope_Mall"` | offset XYZ `+0x19D0` (WAD `0x027369D0`) → `X=-15235, Y=727, Z=17991`
  - Node #125 `"Node#125"` | offset XYZ `+0x1C96` (WAD `0x02736C96`) → `X=233570304, Y=250281984, Z=579403776`
  - Node #299 `"Re_Start_Mall_2Player"` | offset XYZ `+0x413C` (WAD `0x0273913C`) → `X=-49712, Y=-2833, Z=21699`
  - Node #582 `"Ho_Start_Mall"` | offset XYZ `+0x5F3C` (WAD `0x0273AF3C`) → `X=-47804, Y=-2568, Z=22712`
  - Node #583 `"Ho_Car_Mall"` | offset XYZ `+0x5F94` (WAD `0x0273AF94`) → `X=-29583, Y=-729, Z=20791`
- **Coletáveis / Powerups (Type 5 — 21 no total, primeiros 6):**
  - Node #136 (subtype `0x10`) | offset XYZ `+0x1E20` (WAD `0x02736E20`) → `X=-16117, Y=-470, Z=17544`
  - Node #137 (subtype `0x4`) | offset XYZ `+0x1E3A` (WAD `0x02736E3A`) → `X=2039087104, Y=-64815105, Z=1283063807`
  - Node #165 (subtype `0xa`) | offset XYZ `+0x213C` (WAD `0x0273713C`) → `X=8580, Y=3335, Z=8841`
  - Node #181 (subtype `0x17`) | offset XYZ `+0x22FC` (WAD `0x027372FC`) → `X=-20467, Y=-947, Z=26195`
  - Node #182 (subtype `0x5`) | offset XYZ `+0x2316` (WAD `0x02737316`) → `X=1104347136, Y=-74907649, Z=1458372607`
  - Node #183 (subtype `0x17`) | offset XYZ `+0x2332` (WAD `0x02737332`) → `X=1338966016, Y=239730688, Z=577699840`

### `(unknown_8AF0AF98.trg)` (CD.HED idx=1150, `CD.WAD +0x0273C000`, 606 nós)
- **Spawns / Restarts (Type 8 — 14 no total, primeiros 8):**
  - Node #0 `"Node#0"` | offset XYZ `+0x0992` (WAD `0x0273C992`) → `X=-1682964480, Y=-123273217, Z=-1537081345`
  - Node #4 `"Node#4"` | offset XYZ `+0x0AAE` (WAD `0x0273CAAE`) → `X=1430650880, Y=442892287, Z=-481230848`
  - Node #513 `"Ho_Top"` | offset XYZ `+0x3C0C` (WAD `0x0273FC0C`) → `X=-26725, Y=-1815, Z=41801`
  - Node #514 `"Ho_Rails"` | offset XYZ `+0x3CB8` (WAD `0x0273FCB8`) → `X=-36099, Y=-65, Z=38047`
  - Node #515 `"Node#515"` | offset XYZ `+0x3D0E` (WAD `0x0273FD0E`) → `X=1533411328, Y=23068671, Z=-1894383616`
  - Node #516 `"Ho_Rails2"` | offset XYZ `+0x3D60` (WAD `0x0273FD60`) → `X=-45241, Y=1864, Z=37680`
  - Node #517 `"Node#517"` | offset XYZ `+0x3DB6` (WAD `0x0273FDB6`) → `X=1430650880, Y=180617215, Z=-1406664704`
  - Node #518 `"Ho_Dam2"` | offset XYZ `+0x3E0C` (WAD `0x0273FE0C`) → `X=-41446, Y=1717, Z=46091`
- **Coletáveis / Powerups (Type 5 — 21 no total, primeiros 6):**
  - Node #13 (subtype `0x17`) | offset XYZ `+0x0BE8` (WAD `0x0273CBE8`) → `X=-31964, Y=-2353, Z=42664`
  - Node #18 (subtype `0x16`) | offset XYZ `+0x0C78` (WAD `0x0273CC78`) → `X=-34959, Y=-1325, Z=38101`
  - Node #27 (subtype `0x15`) | offset XYZ `+0x0D78` (WAD `0x0273CD78`) → `X=-36837, Y=-1051, Z=40132`
  - Node #28 (subtype `0x5`) | offset XYZ `+0x0D92` (WAD `0x0273CD92`) → `X=1870462976, Y=-49152001, Z=-2005008385`
  - Node #29 (subtype `0x15`) | offset XYZ `+0x0DAE` (WAD `0x0273CDAE`) → `X=1903230976, Y=-45744129, Z=-2117337089`
  - Node #35 (subtype `0x17`) | offset XYZ `+0x0E5C` (WAD `0x0273CE5C`) → `X=-44026, Y=829, Z=39799`

### `(unknown_9BBAE136.trg)` (CD.HED idx=1157, `CD.WAD +0x0288E000`, 1006 nós)
- **Spawns / Restarts (Type 8 — 18 no total, primeiros 8):**
  - Node #24 `"Node#24"` | offset XYZ `+0x1476` (WAD `0x0288F476`) → `X=555352064, Y=-5308416, Z=22347775`
  - Node #28 `"Re_Start_Roof"` | offset XYZ `+0x15B4` (WAD `0x0288F5B4`) → `X=4025, Y=-2056, Z=3774`
  - Node #29 `"Node#29"` | offset XYZ `+0x161E` (WAD `0x0288F61E`) → `X=-250150912, Y=8781823, Z=-425525248`
  - Node #50 `"Re_Start_Office"` | offset XYZ `+0x1A64` (WAD `0x0288FA64`) → `X=3774, Y=-1101, Z=11934`
  - Node #94 `"Re_Start_Angle"` | offset XYZ `+0x21AC` (WAD `0x028901AC`) → `X=10268, Y=-523, Z=0`
  - Node #95 `"Node#95"` | offset XYZ `+0x224A` (WAD `0x0289024A`) → `X=559284224, Y=-115671040, Z=-99221505`
  - Node #473 `"Node#473"` | offset XYZ `+0x489E` (WAD `0x0289289E`) → `X=-158138368, Y=-3014657, Z=-781975553`
  - Node #474 `"Node#474"` | offset XYZ `+0x49C2` (WAD `0x028929C2`) → `X=-250150912, Y=8781823, Z=-425525248`
- **Coletáveis / Powerups (Type 5 — 22 no total, primeiros 6):**
  - Node #20 (subtype `0xa`) | offset XYZ `+0x1408` (WAD `0x0288F408`) → `X=9290, Y=-1392, Z=0`
  - Node #21 (subtype `0x5`) | offset XYZ `+0x1422` (WAD `0x0288F422`) → `X=60162048, Y=-48037888, Z=61865983`
  - Node #22 (subtype `0xf`) | offset XYZ `+0x143E` (WAD `0x0288F43E`) → `X=706871296, Y=-110493696, Z=355794943`
  - Node #23 (subtype `0x4`) | offset XYZ `+0x145A` (WAD `0x0288F45A`) → `X=-424542208, Y=-32178177, Z=-425459713`
  - Node #30 (subtype `0x10`) | offset XYZ `+0x16BC` (WAD `0x0288F6BC`) → `X=3094, Y=-2264, Z=-867`
  - Node #31 (subtype `0x6`) | offset XYZ `+0x16D6` (WAD `0x0288F6D6`) → `X=476381184, Y=-114753536, Z=665387007`

### `(unknown_0A6195CD.trg)` (CD.HED idx=1165, `CD.WAD +0x029D8000`, 248 nós)
- **Spawns / Restarts (Type 8 — 8 no total, primeiros 8):**
  - Node #13 `"Node#13"` | offset XYZ `+0x05BA` (WAD `0x029D85BA`) → `X=-22085632, Y=-3014657, Z=-251133953`
  - Node #14 `"Re_Start_2P"` | offset XYZ `+0x0684` (WAD `0x029D8684`) → `X=-397, Y=-47, Z=-3867`
  - Node #130 `"Node#130"` | offset XYZ `+0x1156` (WAD `0x029D9156`) → `X=-22085632, Y=-3014657, Z=-248905729`
  - Node #131 `"Node#131"` | offset XYZ `+0x11FA` (WAD `0x029D91FA`) → `X=-155779072, Y=-3014657, Z=-198115329`
  - Node #132 `"Node#132"` | offset XYZ `+0x124A` (WAD `0x029D924A`) → `X=-44367872, Y=-3014657, Z=210173951`
  - Node #133 `"Ho_SkVans_FunBox"` | offset XYZ `+0x1298` (WAD `0x029D9298`) → `X=-3380, Y=-601, Z=1973`
  - Node #134 `"Ho_SkVans_Pool"` | offset XYZ `+0x12EC` (WAD `0x029D92EC`) → `X=1368, Y=-47, Z=68`
  - Node #246 `"Node#246"` | offset XYZ `+0x1EE2` (WAD `0x029D9EE2`) → `X=-18219008, Y=-3014657, Z=-253362177`

### `(unknown_C7400461.trg)` (CD.HED idx=1170, `CD.WAD +0x02A7B000`, 324 nós)
- **Spawns / Restarts (Type 8 — 12 no total, primeiros 8):**
  - Node #103 `"Node#103"` | offset XYZ `+0x112E` (WAD `0x02A7C12E`) → `X=86114304, Y=-39256064, Z=38469631`
  - Node #153 `"Re_Start_Skate"` | offset XYZ `+0x14A8` (WAD `0x02A7C4A8`) → `X=1599, Y=-872, Z=5065`
  - Node #154 `"Node#154"` | offset XYZ `+0x15E2` (WAD `0x02A7C5E2`) → `X=-471138304, Y=-28246017, Z=-217186305`
  - Node #155 `"Ho_Curved_Rail"` | offset XYZ `+0x1638` (WAD `0x02A7C638`) → `X=-1999, Y=-599, Z=4466`
  - Node #156 `"Node#156"` | offset XYZ `+0x16A6` (WAD `0x02A7C6A6`) → `X=104792064, Y=-57147392, Z=320864255`
  - Node #157 `"Node#157"` | offset XYZ `+0x1712` (WAD `0x02A7C712`) → `X=222691328, Y=-1966080, Z=-161153025`
  - Node #178 `"Node#178"` | offset XYZ `+0x1DB6` (WAD `0x02A7CDB6`) → `X=262012928, Y=-39256064, Z=285147135`
  - Node #190 `"Re_Start_2P"` | offset XYZ `+0x1F68` (WAD `0x02A7CF68`) → `X=1999, Y=-872, Z=4899`

### `(unknown_9AAF54E0.trg)` (CD.HED idx=1177, `CD.WAD +0x02B4D000`, 1000 nós)
- **Spawns / Restarts (Type 8 — 19 no total, primeiros 8):**
  - Node #1 `"Node#1"` | offset XYZ `+0x100A` (WAD `0x02B4E00A`) → `X=-1114832896, Y=-26869761, Z=1336868863`
  - Node #23 `"Re_Start_Skate"` | offset XYZ `+0x12DC` (WAD `0x02B4E2DC`) → `X=-8404, Y=-2113, Z=17177`
  - Node #24 `"Re_Start_Embarcadero"` | offset XYZ `+0x13C8` (WAD `0x02B4E3C8`) → `X=-8881, Y=346, Z=1706`
  - Node #25 `"Re_Start_Hubba_Hideout"` | offset XYZ `+0x1450` (WAD `0x02B4E450`) → `X=3203, Y=-103, Z=3977`
  - Node #412 `"Re_Start_2P"` | offset XYZ `+0x4034` (WAD `0x02B51034`) → `X=-6254, Y=291, Z=6089`
  - Node #430 `"Re_Start_Roof_Access"` | offset XYZ `+0x43C4` (WAD `0x02B513C4`) → `X=-1749, Y=-548, Z=2068`
  - Node #708 `"Ho_Start_EMB_A"` | offset XYZ `+0x648C` (WAD `0x02B5348C`) → `X=-7732, Y=389, Z=443`
  - Node #709 `"Ho_Start_Fountain_Backside"` | offset XYZ `+0x6510` (WAD `0x02B53510`) → `X=980, Y=291, Z=3088`
- **Coletáveis / Powerups (Type 5 — 11 no total, primeiros 6):**
  - Node #390 (subtype `0x6`) | offset XYZ `+0x3DBE` (WAD `0x02B50DBE`) → `X=-1113522176, Y=-88145921, Z=1370292223`
  - Node #391 (subtype `0x10`) | offset XYZ `+0x3DDA` (WAD `0x02B50DDA`) → `X=-855506944, Y=-86114305, Z=-186974209`
  - Node #392 (subtype `0xa`) | offset XYZ `+0x3DF6` (WAD `0x02B50DF6`) → `X=-716242944, Y=-88670209, Z=-891158529`
  - Node #393 (subtype `0x16`) | offset XYZ `+0x3E12` (WAD `0x02B50E12`) → `X=-45744128, Y=-180027393, Z=834142207`
  - Node #394 (subtype `0x5`) | offset XYZ `+0x3E2E` (WAD `0x02B50E2E`) → `X=461242368, Y=-39976960, Z=261554175`
  - Node #395 (subtype `0x4`) | offset XYZ `+0x3E4A` (WAD `0x02B50E4A`) → `X=-296747008, Y=-56033281, Z=604700671`

### `sked_t.trg` (CD.HED idx=1187, `CD.WAD +0x02C90000`, 91 nós)
- **Spawns / Restarts (Type 8 — 3 no total, primeiros 8):**
  - Node #75 `"Node#75"` | offset XYZ `+0x0916` (WAD `0x02C90916`) → `X=11141120, Y=0, Z=0`
  - Node #76 `"Node#76"` | offset XYZ `+0x0992` (WAD `0x02C90992`) → `X=0, Y=0, Z=0`
  - Node #77 `"Re_2P"` | offset XYZ `+0x0A10` (WAD `0x02C90A10`) → `X=340, Y=0, Z=0`

### `(unknown_37477108.trg)` (CD.HED idx=1190, `CD.WAD +0x02D0D000`, 765 nós)
- **Spawns / Restarts (Type 8 — 3 no total, primeiros 8):**
  - Node #32 `"Node#32"` | offset XYZ `+0x0EB2` (WAD `0x02D0DEB2`) → `X=22282240, Y=0, Z=-22282240`
  - Node #33 `"Node#33"` | offset XYZ `+0x0F2E` (WAD `0x02D0DF2E`) → `X=33423360, Y=0, Z=-22282240`
  - Node #34 `"Re_2P"` | offset XYZ `+0x0FAC` (WAD `0x02D0DFAC`) → `X=169, Y=0, Z=-340`

### `sked2_t.trg` (CD.HED idx=1198, `CD.WAD +0x02DA4000`, 765 nós)
- **Spawns / Restarts (Type 8 — 3 no total, primeiros 8):**
  - Node #32 `"Node#32"` | offset XYZ `+0x0EB2` (WAD `0x02DA4EB2`) → `X=22282240, Y=0, Z=-22282240`
  - Node #33 `"Node#33"` | offset XYZ `+0x0F2E` (WAD `0x02DA4F2E`) → `X=33423360, Y=0, Z=-22282240`
  - Node #34 `"Re_2P"` | offset XYZ `+0x0FAC` (WAD `0x02DA4FAC`) → `X=169, Y=0, Z=-340`

### `(unknown_04878941.trg)` (CD.HED idx=1206, `CD.WAD +0x02E32800`, 765 nós)
- **Spawns / Restarts (Type 8 — 3 no total, primeiros 8):**
  - Node #32 `"Node#32"` | offset XYZ `+0x0EB2` (WAD `0x02E336B2`) → `X=22282240, Y=0, Z=-22282240`
  - Node #33 `"Node#33"` | offset XYZ `+0x0F2E` (WAD `0x02E3372E`) → `X=33423360, Y=0, Z=-22282240`
  - Node #34 `"Re_2P"` | offset XYZ `+0x0FAC` (WAD `0x02E337AC`) → `X=169, Y=0, Z=-340`

### `(unknown_22CC2AAE.trg)` (CD.HED idx=1214, `CD.WAD +0x02EC9800`, 765 nós)
- **Spawns / Restarts (Type 8 — 3 no total, primeiros 8):**
  - Node #32 `"Node#32"` | offset XYZ `+0x0EB2` (WAD `0x02ECA6B2`) → `X=22282240, Y=0, Z=-22282240`
  - Node #33 `"Node#33"` | offset XYZ `+0x0F2E` (WAD `0x02ECA72E`) → `X=33423360, Y=0, Z=-22282240`
  - Node #34 `"Re_2P"` | offset XYZ `+0x0FAC` (WAD `0x02ECA7AC`) → `X=169, Y=0, Z=-340`

