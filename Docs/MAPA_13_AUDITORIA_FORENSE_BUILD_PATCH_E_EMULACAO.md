# 🛡️ MAPA 13 — Auditoria Forense 10/10, Pipeline de Build/Patch `.xdelta` e Guia de Emulação (DuckStation & DualShock 4)

> **Engenharia de Confiabilidade & QA:** Especificação completa dos **10 estágios da auditoria forense automatizada**, pipeline de recompilação/patch delta com prova round-trip SHA-256, validação ao vivo via **DuckStation GDB Server** e configuração ideal de emulação + controle sem lag.

---

## 1. Os 10 Estágios da Auditoria Forense ([`Scripts/audit_game.js`](../Scripts/audit_game.js))

Toda compilação da ISO executa obrigatoriamente `node Scripts/audit_game.js`, comparando `build/THPS2_MOD.bin` + workspace contra a imagem limpa original Redump (`Tony Hawk's Pro Skater 2.bin`). O pipeline só prossegue para geração de `.xdelta` e publicação quando **TODOS os 10 estágios retornam 0 erros e 0 avisos**:

| Estágio | Alvo Auditado | Invariantes Verificadas |
| :---: | :--- | :--- |
| **1** | `SLUS_010.66` (Header & MIPS) | Tamanho `864.256 B`, header NTSC-U `+0x4C`, exatamente **293/293 palavras cirúrgicas** (hooks + 70 relocações `g_LevelTable` + motor THPS1 + 6 hooks `.TRG SecretFlag` + `g_MovieTable[4..15]` `vlc=16896/ringSec=16` + despacho `CCar 215/216` + `InitHeap 0x800EB000`), bootstrapper `0x800E2680..0x800E27FF` bit-a-bit, ausência de `0x0000FFF8` em `0x8005F320` e **0 diffs inesperados** no código MIPS. |
| **2** | Strings, `printf` & `.FNT` | Todas as **217 strings** modificadas sem overflow de slot NUL (incl. Silvio Santos + 32 linhas PT-BR de Lulao/Bolsonaro + `"Kickflip"` restaurado em `0x800D50F8`), especificadores `printf` idênticos e zero bytes fora do `.FNT`. |
| **3** | `CD.HED` & `CD.WAD` (`1.531` entradas) | `CD.HED` 1.521/1.531 entradas Redump + 10 modelos/texturas nos mesmos setores (0 deslocamento de offsets); 2/2 hooks em `playsel.bin`, **`levelsel.bin`/`levelsel.pre`/`options.bin` bit-a-bit (13+8 relocs + carregador 5 bursts contíguos 40 BMPs + skip `FileIO_Kick` + vídeos preview restaurados)**, `s2bio.fnt`/`player.pre` PT-BR sincronizados, 6 bancos `.VAB/.SFX` dos 9 gritos e 28 `.PSX` + ativos 3D do Lulão. |
| **4** | Retratos `s2face*.bmp` & `options.pre` | **Validação cruzada dinâmica contra `SLUS_010.66`:** verifica `s2face1,2,3,4,9,10,11` (`4.088 B`, header intacto, chaves magenta `#FF00FF` exatas e presença em `options.pre`), exige **`s2face7.bmp` (Bucky Lasek) 100% original Redump** e `0` bytes extras alterados em `options.pre`. |
| **5** | **28 Modelos 3D `.PSX`** & Mundo 3D | Audita todos os 4 `.PSX` de cada um dos 7 skatistas + `skhan_l.psx` original Redump + `items.psx` (`X` + Garrafa 51 + Aura Aditiva), `skhan_o/o2` (Barril 51+Lulão + Haddad 3D), `sksl2_o/l/l2` (Dilma 3D + Vento Estocado 3D), `c_kart.psx` (Bolsonaro 3D) e `skven_o/l` (Garrafa Pitú 3D). |
| **6** | ISO-9660, **`VOICES.DAT` & `THPS1.WAD`** | **48/48 arquivos originais** Redump + **49º `VOICES.DAT`** (`LBA 317893`, `1.174 set.`, **17 setores residentes `0..16`** incl. `THPS1_ENGINE 20 KB` bit-a-bit, 41 clips menu, `LULAO_GPBANK` 14×2, `BOLSO_GPBANK` 14×2, `LULAO_CASHART`, trava anti-chiado `vLOUT/vROUT`, OOM Guard `freeList[1]`) + **50º `THPS1.WAD`** (`LBA 319067`, contíguo logo após `VOICES.DAT`, `683 set.` / `1,33 MB`, **33 arquivos prioritários** validados com headers `BM`/`_TRG`/`0x00020004`). |
| **7** | Licença NTSC-U & `.CUE` | **16/16 setores de licença** (`LBA 0..15`) idênticos ao Redump + cue sheet `MODE2/2352` válido. |
| **8** | **20 Vídeos `.STR`** | `320×240` MDEC v2, `File=1 Channel=1`, taxa XA original (`37800 Hz Stereo` / `18900 Hz Mono`), `0` flags EOF prematuras e contagem exata de frames. |
| **9** | **`COMPILED.XA`** | Varredura integral de **105.952 setores ADPCM** (8 canais × 13.244 setores), `0` cabeçalhos corrompidos. |
| **10** | **Todos os 319.900 Setores da ISO** | Verificação completa de Sync (`00 FF..FF 00`), endereçamento MSF, Mode 2, Subheaders e **EDC Form 1 / Form 2** nos `752.404.800 B` (`717,5 MB`) de `THPS2_MOD.bin`. |

---

## 2. Pipeline Automatizado de Build, Patch `.xdelta` e Release

```powershell
# Pipeline completo ponta a ponta (usado automaticamente após qualquer modificação nos binários):
node Scripts/sync_and_release.js "<descrição técnica clara da alteração>"

# Apenas documentação ou scripts (sem alterar binários do jogo):
node Scripts/sync_and_release.js --skip-build --skip-patch "<descrição>"
```

Etapas executadas automaticamente por [`Scripts/sync_and_release.js`](../Scripts/sync_and_release.js):
1. **`build_iso.js`** → prepara setores raw `2336 B` em cache e recompila `build/THPS2_MOD.bin/.cue` via `mkpsxiso v2.30`;
2. **`audit_game.js`** → executa os 10 estágios forenses acima (aborta se houver qualquer erro);
3. **`create_patch.js`** → gera `build/THPS2_MOD_NTSC-U.xdelta` (`xdelta3 -3 -S none`) contra o `.bin` Redump e executa **reaplicação round-trip verificando SHA-256 bit-a-bit**;
4. **`generate_all_docs.js`** → regenera `Docs/MAPA_01..09_*.md` diretamente dos binários reais;
5. **Sync + Git** → copia `Scripts/`, `Docs/`, `README.md` e `CHANGELOG.md` para `repo/`, realiza `git commit` e `git push origin main`;
6. **Empacotamento & GitHub Release (`--clobber`)** → atualiza `THPS2_MOD_NTSC-U.xdelta`, `THPS2_MOD_Patcher_e_Guia.zip` (com `Aplicar_Patch_THPS2.bat`, `xdelta3.exe`, `THPS2_MOD.cue`, `SLUS-01066.ini` e guia) e `THPS2_PSX_Modding_Toolkit_and_Docs.zip` na Release `v2.0-mod-patch-e-toolkit`.

---

## 3. Protocolo de Prova ao Vivo no DuckStation via GDB Server

Além da auditoria estática, todas as mudanças críticas são comprovadas em execução real no **DuckStation** via protocolo **GDB Remote (`TCP 2345`)**:
- **Fast-skip determinístico dos vídeos de boot:** breakpoint em `0x8003CF60` + escrita `0xDEADBEEF` em `0x1F800000` (scratchpad);
- **Injeção limpa de botões do controle:** breakpoint no leitor de pad (`0x8006B6D8`) escrevendo no buffer `0x800C0BD4`;
- **Verificações em RAM ao vivo:** strings renomeadas (`0x800D45B4 = "Valter Pacheco"`), entrada em `playsel.bin` (`0x80082B80`, `g_InPlaySel = 1`), renderização 3D real no carrossel dos skatistas (`idx = 2, 3, 4, 6, 7, 9, 10`), transição `Continuar → State 2 Level Select` (`0x80082BF8`, `g_InPlaySel = 0`), entrada em *The Hangar* (`State 6 @ 0x80083164`) e auditoria de **`0` erros/avisos PSX** em `duckstation.log` (restaurando `settings.ini` automaticamente em bloco `finally`).

---

## 4. Guia de Emulação Perfeita (DuckStation + DualShock 4 Bluetooth)

### Perfil Otimizado Zero-Artefatos `SLUS-01066.ini` (Incluso em `THPS2_MOD_Patcher_e_Guia.zip`)
Copie `SLUS-01066.ini` para a pasta `gamesettings/` do DuckStation. As chaves abaixo foram provadas em teste A/B/C/D ao vivo e eliminam **100%** das linhas brancas vazias no chão (*School II*, *NY City*), céu sumindo e objetos desaparecendo:

| Parâmetro | Valor Recomendado | Por Quê? |
| :--- | :---: | :--- |
| `PGXPEnable` + `PGXPCPU` | **`false`** | O motor `M3dAsm` do THPS2 (`0x800956B8..0x80097F00`) subdivide polígonos próximos em inteiros na CPU MIPS; ativar PGXP desalinha quads subdivididos dos vizinhos e abre **linhas brancas vazias no chão de School II e NY City**! |
| `PGXPDepthBuffer` + `PGXPCulling` | **`false`** | O THPS2 gerencia profundidade via Ordering Table nativa do PS1; ativar Depth Buffer faz o **céu, skatista e rampas sumirem**! |
| `WidescreenHack` / `AspectRatio` | **`false`** / **`4:3`** | Evita frustum culling prematuro de paredes e objetos nas bordas da tela. |
| `ResolutionScale` + `TextureFilter` | **`5`** (`1080p`) + **`Nearest`** | Máxima nitidez 5× HD sem borramento `Scale2x` e sem artefatos de costura (`LineDetectMode = Disabled`, `Multisamples = 1`, `ForceRoundTextureCoordinates = false`). |
| `MaxQueuedFrames` + `OptimalFramePacing` | **`2`** + **`true`** | Elimina input lag perceptível nos comandos de manobras/ollie. |

### Controle DualShock 4 / DualSense via Bluetooth no Windows (Zero Desconexões)
1. **HidHide:** oculte o controle HID físico do Windows e libere visibilidade apenas para `DS4Windows.exe` (evita conflito de duplo input SDL/XInput).
2. **DS4Windows:** configure `BTPollRate = 4ms` (`250 Hz` nativo do PS4), `Idle Disconnect = 0` (desativado) e `FlashWhenLate = False`.
3. **DuckStation:** mapeie a Porta 1 em `XInput-0` com `RGBLED` desativado.
4. **Windows (Energia):** desative a **Suspensão Seletiva USB** no Plano de Energia para impedir quedas aleatórias do adaptador Bluetooth.
