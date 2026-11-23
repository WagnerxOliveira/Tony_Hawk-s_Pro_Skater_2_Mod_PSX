# 🛠️ Ferramentas Utilizadas no Projeto

Este documento detalha o ecossistema completo de ferramentas utilizado na **engenharia reversa, modificação 3D/texturas, injeção MIPS R3000A, recompilação ISO, validação forense, geração de patch `.xdelta` e testes ao vivo** de *Tony Hawk's Pro Skater 2 (PS1 — NTSC-U `SLUS-01066`)*.

---

## 1. Runtime e Automação Principal (Stack de Produção)

| Ferramenta | Papel no Projeto | Referência |
| :--- | :--- | :--- |
| **Node.js (v18+)** | Motor principal de **toda a suíte moderna** (`Scripts/*.js`): unpack/repack `CD.HED`/`CD.WAD`/`.PRE`, quantizadores BGR555 8-bit/4-bit, escultura 3D `.PSX`, assembler MIPS R3000A, build ISO, auditoria forense 10/10, testes GDB e automação de releases. | [nodejs.org](https://nodejs.org/) |
| **Git & GitHub CLI (`gh`)** | Versionamento de scripts/documentação e publicação automatizada da Release `v2.0-mod-patch-e-toolkit` via [`Scripts/sync_and_release.js`](../Scripts/sync_and_release.js). | [cli.github.com](https://cli.github.com/) |
| **Python 3.x** | Scripts legados de classificação/extração inicial (`Scripts/*.py`) e automação de símbolos no Ghidra (`Scripts/ghidra_apply_symbols.py`). | [python.org](https://www.python.org/) |
| **Java JDK (17/21)** | Runtime necessário para **Ghidra** e **jPSXdec**. | [adoptium.net](https://adoptium.net/) |

---

## 2. Compilação ISO, Setores CD-XA e Distribuição Delta (`.xdelta`)

| Ferramenta | Papel no Projeto | Referência |
| :--- | :--- | :--- |
| **`mkpsxiso` v2.30 & `dumpsxiso`** | Extrai e recompila a imagem PS1 Mode 2/2352 (`THPS2_MOD.bin`/`.cue`) preservando os **16 setores de licença NTSC-U** e a **ordem exata de 48 LBAs Redump** + 49º arquivo `VOICES.DAT` (`Scripts/thps2_build.xml`). | [GitHub (Lameguy64/mkpsxiso)](https://github.com/Lameguy64/mkpsxiso) |
| **`xdelta3` (v3.2.2)** | Gera o patch delta binário `THPS2_MOD_NTSC-U.xdelta` (com verificação round-trip SHA-256 em [`Scripts/create_patch.js`](../Scripts/create_patch.js)) e acompanha o aplicador 1-clique `Aplicar_Patch_THPS2.bat`. | [GitHub (jmacd/xdelta)](https://github.com/jmacd/xdelta) |
| **CDmage** | Utilitário visual alternativo para extrair os arquivos originais do `.bin`/`.cue` em formato RIFF-CDXA ([tutorial passo a passo](00_CDmage_extraindo_arquivos.md)). | [RomHacking.net](https://www.romhacking.net/utilities/1437/) |

---

## 3. Áudio (`COMPILED.XA`, SPU-ADPCM `.VAG`/`.VAB`) e Vídeos (`.STR` MDEC v2)

| Ferramenta | Papel no Projeto | Referência |
| :--- | :--- | :--- |
| **`psxavenc`** | Codificador oficial de vídeos `.STR` MDEC v2 (`320×240`, `15 fps`) com áudio XA-ADPCM em `File=1, Channel=1` (`-F 1 -C 1 -X`) e encoder de vozes SPU-ADPCM (`11.025 Hz` mono) usado por `replace_videos.js` e `build_skater_voices.js`. | [GitHub (WonderfulToolchain/psxavenc)](https://github.com/WonderfulToolchain/psxavenc) |
| **`ffmpeg` & `ffprobe`** | Decodificação/redimensionamento Lanczos de fotos/texturas RGBA para o pipeline 3D (`psx_skater_lib.js`), normalização de áudio (loudnorm/resample) e preparo de vídeos `.STR`. | [ffmpeg.org](https://ffmpeg.org/) |
| **jPSXdec / Audacity / VGMTrans** | Inspeção visual de frames `.STR`, análise de bancos sonoros `.VAB` e edição manual de amostras de áudio quando necessário. | [jPSXdec](https://github.com/m35/jpsxdec) • [Audacity](https://www.audacityteam.org/) |

---

## 4. Engenharia Reversa (`SLUS_010.66`, Overlays `.BIN`/`.REL`)

| Ferramenta | Papel no Projeto | Referência |
| :--- | :--- | :--- |
| **Ghidra + `ghidra_psx_ldr`** | Descompilação completa de `SLUS_010.66` (MIPS R3000A) e overlays (`playsel.bin`, `levelsel.bin`, etc.). Use [`Scripts/ghidra_apply_symbols.py`](../Scripts/ghidra_apply_symbols.py) para rotular automaticamente todas as tabelas e funções mapeadas. | [ghidra-sre.org](https://ghidra-sre.org/) |
| **HxD** | Inspeção hexadecimal rápida de offsets, structs Little-Endian e strings ([guia seguro de uso](Sobre_HxD.md)). | [mh-nexus.de](https://mh-nexus.de/en/hxd/) |

---

## 5. Emulação, QA Automatizado via GDB e Controle Sem Lag

| Ferramenta | Papel no Projeto | Referência |
| :--- | :--- | :--- |
| **DuckStation (Qt + GDB Server)** | Emulador principal de teste e validação ao vivo! Suporta depuração remota via **GDB Server** (usada nas provas automatizadas de RAM, carrossel 3D, SPU Voz 23 e gameplay em *The Hangar*) + perfil dedicado `SLUS-01066.ini` ([MAPA 13](MAPA_13_AUDITORIA_FORENSE_BUILD_PATCH_E_EMULACAO.md)). | [duckstation.org](https://www.duckstation.org/) |
| **PCSX-Redux** | Emulador/debugger complementar de PS1 com busca de RAM e breakpoints de hardware em tempo real. | [GitHub (grumpycoders/pcsx-redux)](https://github.com/grumpycoders/pcsx-redux) |
| **DS4Windows + HidHide** | Configuração sem desconexões Bluetooth e zero input lag para controles **DualShock 4 / DualSense** no Windows (250 Hz / `4ms` via XInput + ocultação do dispositivo HID físico). | [DS4Windows](https://ds4-windows.com/) |
