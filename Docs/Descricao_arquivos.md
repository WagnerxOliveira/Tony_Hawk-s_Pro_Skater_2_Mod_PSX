# 💿 Requisitos da Cópia Original Limpa (NTSC-U `SLUS-01066` Redump)

> **Política Legal:** Este repositório **não hospeda nem aponta links para download de imagens comerciais** (`.bin`/`.cue`). Para aplicar o mod ou executar o pipeline de build, utilize **sua própria cópia legal** de *Tony Hawk's Pro Skater 2 (USA — PlayStation 1)* extraída do disco original.

---

## 1. Arquivos Originais Requeridos (Base Limpa Redump)

O patch delta distribuído na aba **[Releases](https://github.com/WagnerxOliveira/Tony_Hawk-s_Pro_Skater_2_Mod_PSX/releases/latest)** (`THPS2_MOD_NTSC-U.xdelta`) exige exatamente a imagem NTSC-U padrão **Redump**:

| Propriedade | Valor Exato Verificado |
| :--- | :--- |
| **Jogo / Região / ID** | *Tony Hawk's Pro Skater 2* — USA (NTSC-U) — `SLUS-01066` |
| **Formato** | Mode 2/2352 (`.bin` + `.cue`) |
| **Tamanho exato do `.bin`** | `748.037.136 bytes` (`318.043 setores`) |
| **MD5** | `AC85AE22723EAF944B0F899AA53244DD` |
| **SHA-1** | `F5CB80A7D55AACED7FCC9C5A82A6C28B89DC489A` |

---

## 2. Papel de Cada Arquivo

- **`.bin` (Binary Image):** contém todos os `318.043 setores` brutos de `2.352 bytes` (incluindo os 16 setores de licença NTSC-U, sistema de arquivos ISO-9660, executável `SLUS_010.66`, `CD.WAD`, áudio streaming `COMPILED.XA` e vídeos `.STR`).
- **`.cue` (Cue Sheet):** descritor de texto que informa ao emulador (DuckStation, PCSX-Redux, RetroArch) o modo da trilha (`MODE2/2352`).

---

## 3. Como Aplicar o Patch `.xdelta` Legalmente

1. Baixe `THPS2_MOD_NTSC-U.xdelta` e `THPS2_MOD_Patcher_e_Guia.zip` na **[Última Release](https://github.com/WagnerxOliveira/Tony_Hawk-s_Pro_Skater_2_Mod_PSX/releases/latest)**.
2. Extraia o ZIP em uma pasta e coloque `THPS2_MOD_NTSC-U.xdelta` na mesma pasta.
3. Arraste seu arquivo `.bin` original sobre **`Aplicar_Patch_THPS2.bat`** (ou use o **Delta Patcher** no Windows/Linux/macOS).
4. Abra o **`THPS2_MOD.cue`** gerado no DuckStation (recomendado copiar o perfil `SLUS-01066.ini` incluso no ZIP — veja [MAPA 13](MAPA_13_AUDITORIA_FORENSE_BUILD_PATCH_E_EMULACAO.md)).
