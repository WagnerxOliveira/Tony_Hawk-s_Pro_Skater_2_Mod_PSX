# 🧩 MAPA 09 — Overlays MIPS Relocáveis (`.BIN`/`.REL`) e Demo Embutida (`BMX\`)

---

## 1. Todos os 15 Overlays de Código MIPS em `CD.WAD`

Para economizar os 2 MB de RAM do PS1, o THPS2 carrega a lógica de cada tela de menu/editor dinamicamente a partir de pares **`<nome>.bin` + `<nome>.rel`** dentro de `CD.WAD`.
- Todo overlay `.BIN` começa com stubs relocáveis `lui $v0, 0x0000 / addiu $v0, ...` (`00 00 02 3C`), cujos endereços absolutos são corrigidos em tempo de carga pela tabela `.REL` correspondente.

| # | Overlay `.BIN` | Idx `CD.HED` | Hash `.BIN` | Offset `CD.WAD` | Tamanho `.BIN` | Relocação `.REL` (Idx / Tamanho) | Responsabilidade |
| :-: | :--- | :-: | :---: | :---: | :---: | :--- | :--- |
| 1 | `credits.bin` | 23 | `0x4CD0B99E` | `0x00208000` | 10452 B | `credits.rel` (idx 24, 872 B) | Tela de Créditos |
| 2 | `mainmenu.bin` | 25 | `0x4EB1FFB7` | `0x0020B800` | 14416 B | `mainmenu.rel` (idx 26, 1036 B) | Menu Principal |
| 3 | `cresave.bin` | 27 | `0x0A239DEB` | `0x00210000` | 11896 B | `cresave.rel` (idx 28, 824 B) | Salvar/Carregar Skatista Customizado |
| 4 | `cresel.bin` | 29 | `0xD734C7A9` | `0x00213800` | 16008 B | `cresel.rel` (idx 30, 1088 B) | Seleção de Skatista Customizado |
| 5 | `handicap.bin` | 31 | `0xD14E432C` | `0x00218000` | 12656 B | `handicap.rel` (idx 32, 792 B) | Configuração de Handicap (2P) |
| 6 | `levelsel.bin` | 33 | `0x9EB19417` | `0x0021C000` | 24012 B | `levelsel.rel` (idx 34, 1540 B) | Seleção de Fases e Previews .STR |
| 7 | `multisel.bin` | 35 | `0xC3F949AB` | `0x00222800` | 11076 B | `multisel.rel` (idx 36, 740 B) | Seleção de Modos Multiplayer |
| 8 | `options.bin` | 37 | `0x5541E9B5` | `0x00226000` | 46708 B | `options.rel` (idx 38, 2824 B) | Menu de Opções, Áudio, Música e Cheats |
| 9 | `equipsel.bin` | 39 | `0xCB167856` | `0x00232800` | 26824 B | `equipsel.rel` (idx 40, 1900 B) | Seleção de Equipamentos / Decks |
| 10 | `edmod.bin` | 41 | `0xFC01FEC9` | `0x0023A000` | 99052 B | — | Park Editor (Editor Completo de Pistas) |
| 11 | `carsel.bin` | 50 | `0xCCE997AC` | `0x003A8000` | 11348 B | `carsel.rel` (idx 51, 788 B) | Seleção de Carreira |
| 12 | `statedit.bin` | 53 | `0xF6D92BC1` | `0x003D1800` | 18328 B | `statedit.rel` (idx 54, 1180 B) | Tela de Edição de Stats |
| 13 | `tricksel.bin` | 57 | `0xD69182BD` | `0x0045F800` | 26748 B | `tricksel.rel` (idx 58, 1648 B) | Tela de Edição e Compra de Manobras |
| 14 | `playsel.bin` | 61 | `0xD09507D4` | `0x004E7000` | 31640 B | `playsel.rel` (idx 62, 2064 B) | Tela de Seleção de Skatista (Roster) |
| 15 | `creedit.bin` | 67 | `0x461B7213` | `0x00503000` | 52672 B | `creedit.rel` (idx 68, 3240 B) | Create-a-Skater (Editor de Personagem) |

---

## 2. Demo Jogável Embutida — Pasta `BMX\` (*Mat Hoffman's Pro BMX*)

Acionada a partir de `SLUS_010.66 @ 0x8003D3E8` via `cdrom:\BMX\X.EXE;1`.

| Arquivo | Tamanho | Papel Técnico |
| :--- | :---: | :--- |
| `BMX\X.EXE` | 81.920 B | Executável `PS-X EXE` (`0x80010000..0x80023800`, `PC=0x80023718`) — loader dos overlays |
| `BMX\BOOT.BIN` | 32.060 B | Overlay MIPS de boot (header 4B `0x0A` + código MIPS) |
| `BMX\FRONT.BIN` | 217.092 B | Overlay MIPS do menu frontend (header 4B `0x11` + código MIPS) |
| `BMX\GAME.BIN` | 623.164 B | Overlay MIPS principal de gameplay (header 4B `0x18` + código MIPS) |
| `BMX\EDITOR.BIN` | 809.252 B | Overlay MIPS do editor de pistas (header 4B `0x1F` + código MIPS) |
| `BMX\EXIT.BIN` | 860 B | Overlay MIPS de retorno ao menu/boot (header 4B `0x26` + código MIPS) |
| `BMX\BMXCD.HED` / `BMXCD.WAD` | 4.677 B / 8,09 MB | Arquivo estilo THPS1 (nomes em texto plano + offset + size, terminador `0xFF`, **209 arquivos**) |
| `BMX\FE.WAD` / `BMX\FE.STR` | 2.912 B / 4,50 MB | **ATENÇÃO:** `BMX\FE.STR` **NÃO é vídeo!** É o blob binário indexado por `FE.WAD` (**91 arquivos**) |

### Amostra dos Arquivos em `BMX\FE.WAD` → `BMX\FE.STR`
- `fe_sfx.vb`: offset `0x00000000`, tamanho `305328` B
- `fe_sfx.vh`: offset `0x0004A8B0`, tamanho `4128` B
- `legal.bin`: offset `0x0004B8D0`, tamanho `154120` B
- `font256.bin`: offset `0x000712D8`, tamanho `32808` B
- `biofont.bin`: offset `0x00079300`, tamanho `3112` B
- `title_h.bin`: offset `0x00079F28`, tamanho `154120` B
- `press.bin`: offset `0x0009F930`, tamanho `32808` B
- `start.bin`: offset `0x000A7958`, tamanho `32808` B
- `main_h.bin`: offset `0x000AF980`, tamanho `154120` B
- `main_h1.bin`: offset `0x000D5388`, tamanho `154120` B
- `opt_ctr.bin`: offset `0x000FAD90`, tamanho `154120` B
- `opt_snd.bin`: offset `0x00120798`, tamanho `154120` B
- `options.bin`: offset `0x001461A0`, tamanho `154120` B
- `select_b.bin`: offset `0x0016BBA8`, tamanho `154120` B
- `select_c.bin`: offset `0x001915B0`, tamanho `154120` B
- `selectp.bin`: offset `0x001B6FB8`, tamanho `154120` B
- `matthps2.bin`: offset `0x001DC9C0`, tamanho `16272` B
- `mikthps2.bin`: offset `0x001E0950`, tamanho `16272` B
- `notavail.bin`: offset `0x001E48E0`, tamanho `16272` B
- `corey.bin`: offset `0x001E8870`, tamanho `16572` B
