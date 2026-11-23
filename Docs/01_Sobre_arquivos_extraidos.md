# 📂 Sobre os Arquivos Extraídos do Disco (THPS2 PS1 — `SLUS-01066`)

> **Referência Técnica:** Inventário estrutural de todos os **48 arquivos originais Redump** + o **49º arquivo do mod (`VOICES.DAT`)** presentes na imagem ISO-9660/CD-XA de *Tony Hawk's Pro Skater 2 (USA / NTSC-U)*.

---

## 1. Visão Geral da Estrutura do CD-ROM (PlayStation 1)

O disco original de THPS2 NTSC-U possui **318.043 setores** (`748.037.136 bytes` em Mode 2/2352, incluindo os 16 setores de licença NTSC-U em LBA `0..15` e o postgap de 150 setores). A imagem compilada do mod (`THPS2_MOD.bin`) preserva **100% dos 48 arquivos originais nos mesmos LBAs exatos** e adiciona apenas o 49º arquivo `VOICES.DAT` ao final (`LBA 317893`, `567 setores`, totalizando `318.610 setores` / `749.370.720 bytes`).

### Regra Crítica de Setores CD-ROM Mode 2 (`data` vs `xa`/`str`)

| Modo no `mkpsxiso` | Formato no Disco | Carga Útil por Setor | Quando Usar |
| :---: | :--- | :---: | :--- |
| **`data`** | Mode 2 **Form 1** (com ECC/EDC) | `2.048 B` | Executáveis (`SLUS_010.66`, `BMX\*.EXE`), `CD.HED`, `CD.WAD`, `VOICES.DAT`, `SYSTEM.CNF` e vídeos **sem áudio** (previews de fases). |
| **`xa`** | Mode 2 **Form 2** (streaming) | `2.336 B` | `COMPILED.XA` (trilha sonora de 8 canais intercalados XA-ADPCM). |
| **`str`** | Mode 2 **Form 2** (MDEC + XA) | `2.336 B` | `INTRO.STR`, `ATVILOGO.STR`, `LOGO.STR` e todos os 19 `X\*.STR` (vídeos em tela cheia com áudio XA em `File=1, Channel=1`). |

> **Atenção:** extrair arquivos `xa`/`str` como dados comuns de `2048 B` destrói os subcabeçalhos CD-XA e silencia o áudio! Sempre extraia via **CDmage** (formato RIFF-CDXA) ou **`dumpsxiso`** e converta com [`Scripts/psx_media.js`](../Scripts/psx_media.js).

---

## 2. Catálogo Completo dos 49 Arquivos do Disco

### A. Boot, Executável Principal e Container de Assets (Raiz)

| Arquivo | Tipo ISO | Papel Técnico |
| :--- | :---: | :--- |
| `SYSTEM.CNF` | `data` | Manifesto de inicialização da BIOS PS1 (`BOOT = cdrom:\SLUS_010.66;1`, `TCB=4`, `EVENT=16`, `STACK=801FFF00`). |
| `SLUS_010.66` | `data` | Executável principal `PS-X EXE` (`864.256 B`, carregado em `0x80010000..0x800E2800`, Entry Point `0x800A2910`). Contém a engine Neversoft, tabelas de skatistas/fases/vídeos/strings e os 9 hooks cirúrgicos do mod ([MAPA 01](MAPA_01_MEMORIA_E_EXECUTAVEL.md)). |
| `CD.HED` | `data` | Tabela de índice FAT (`18.372 B` = **1.531 entradas × 12 B** + terminador `0x00000000`) com hashes de 32 bits (`0x80053F10`), offsets e tamanhos ([02_Entender_Relacao_CD.HED_x_CD.WAD.md](02_Entender_Relacao_CD.HED_x_CD.WAD.md)). |
| `CD.WAD` | `data` | Container principal de assets (~`27,34 MB`) contendo **todos os 1.531 arquivos internos**: modelos 3D `.PSX`, esqueletos `.PSH`, texturas `.BMP`, pacotes `.PRE`, triggers `.TRG`, manobras `tricks.bin`, 17 bancos `.VAB`, 50 parques `.PRK` e 15 overlays MIPS `.BIN`/`.REL` ([MAPA 06](MAPA_06_TEXTURAS_FONTES_E_WAD.md)). |
| `VOICES.DAT` *(49º — Mod)* | `data` | Arquivo exclusivo do mod (`1.161.216 B` / `567 setores` @ `LBA 317893`): Setor 0 = código residente MIPS `MODCODE` (`0x800E2800`), Setor 1 = tabela `VOICETBL` (`0x800E3000`), Setores `2..566` = 28 vozes SPU-ADPCM de Lulao e Bolsonaro ([MAPA 12](MAPA_12_ENGINE_MOD_MIPS_VOICES_E_BOOT_ALEATORIO.md)). |

### B. Trilha Sonora Streaming (Raiz)

| Arquivo | Tipo ISO | Papel Técnico |
| :--- | :---: | :--- |
| `COMPILED.XA` | `xa` | Trilha sonora completa em **XA-ADPCM 4-bit, 37.800 Hz Stereo**, `105.952 setores` intercalados em **8 canais simultâneos (`ch 0..7`)**, `File=1` ([MAPA 08](MAPA_08_AUDIO_XA_VAB_E_VIDEOS_STR.md)). |

### C. Vídeos de Boot e Previews de Fases (Raiz — 13 arquivos)

| Arquivos | Tipo ISO | Características |
| :--- | :---: | :--- |
| `ATVILOGO.STR`, `LOGO.STR`, `INTRO.STR` | `str` | Animações de abertura (Activision, Neversoft e Intro principal). `320×240`, `15 fps`, MDEC v2 + áudio XA `37.800 Hz Stereo` (`F=1, C=1`). No mod, os 3 slots são sorteados aleatoriamente entre os 20 vídeos customizados preservando a duração original de cada slot. |
| `HANGAR.STR`, `SCHOOL.STR`, `MAR.STR`, `NY.STR`, `VENICE.STR`, `SS.STR`, `PHILLY.STR`, `BULLRING.STR`, `B1.STR`, `HEAVEN.STR`, `EDITOR.STR` | `data` | Vídeos curtos de preview em miniatura na tela de Seleção de Fases (**sem faixa de áudio XA** — gravados como Mode 2 Form 1 `data`). |

### D. Vídeos de Final de Carreira e Bails (Pasta `X\` — 19 arquivos)

| Arquivos | Tipo ISO | Características |
| :--- | :---: | :--- |
| `X\OD.STR`, `X\PC.STR`, `X\SM.STR`, `X\MS.STR` | `str` | Vídeos dos skatistas secretos (*Officer Dick*, *Private Carrera*, *Spider-Man*, *80's Tony*) — `37.800 Hz Stereo`. |
| `X\HAWK.STR`, `X\BURNQUIS.STR`, `X\CABALLER.STR`, `X\CAMPBELL.STR`, `X\GLIFBERG.STR`, `X\KOSTON.STR`, `X\LASEK.STR`, `X\MULLEN.STR`, `X\MUSKA.STR`, `X\REYNOLDS.STR`, `X\ROWLEY.STR`, `X\STEAMER.STR`, `X\THOMAS.STR`, `X\BAILS01.STR`, `X\BAILS02.STR` | `str` | Vídeos de final de carreira dos 13 pros + 2 compilações de quedas (*Bails*) — `18.900 Hz Mono`, `File=1, Channel=1`. |

### E. Demo Jogável Embutida (Pasta `BMX\` — 10 arquivos)

| Arquivos | Tipo ISO | Papel Técnico |
| :--- | :---: | :--- |
| `BMX\X.EXE`, `BOOT.BIN`, `FRONT.BIN`, `GAME.BIN`, `EDITOR.BIN`, `EXIT.BIN`, `BMXCD.HED`, `BMXCD.WAD`, `FE.WAD`, `FE.STR` | `data` | Demo jogável de *Mat Hoffman's Pro BMX* acionada em `SLUS_010.66 @ 0x8003D3E8`. **Atenção:** `BMX\FE.STR` **não é vídeo** — é um container binário indexado por `BMX\FE.WAD` ([MAPA 09](MAPA_09_OVERLAYS_E_DEMO_BMX.md)). |

---

## 3. Referências Cruzadas

- [Passo a passo de extração com CDmage](00_CDmage_extraindo_arquivos.md)
- [Relação entre `CD.HED` e `CD.WAD`](02_Entender_Relacao_CD.HED_x_CD.WAD.md)
- [MAPA 06 — Censo de 1.531 arquivos do `CD.WAD`](MAPA_06_TEXTURAS_FONTES_E_WAD.md)
- [MAPA 13 — Auditoria Forense, Build ISO e Patch `.xdelta`](MAPA_13_AUDITORIA_FORENSE_BUILD_PATCH_E_EMULACAO.md)
