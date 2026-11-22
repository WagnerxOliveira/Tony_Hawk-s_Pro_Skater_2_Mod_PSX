# ⏱️ MAPA 02 — Cronômetro, Física, Equilíbrio e Sistema de Pontuação

Este guia mapeia os pontos críticos para modificar **tempo de sessão (cronômetro)**, **gravidade / física do skatista**, **equilíbrio de grind/manual**, **pontuação** e **objetivos de score**.

---

## 1. Cronômetro do Jogo (Run Timer / Tempo de Sessão)

| Ponto de Interesse | Endereço RAM | Offset em `SLUS_010.66` | Instrução / Dado | Como Modificar |
| :--- | :---: | :---: | :--- | :--- |
| Constante `120` → `300` (já patcheada no binário atual) | `0x80016848` | `0x007048` | `addiu $v0, $zero, 0x0078` (`120`) → `0x012C` (`300`) | Altere os 2 bytes inferiores (Little-Endian) para o valor desejado (ex.: `0x0258` = 600) |
| Função chamada logo após carregar a constante | `0x8005566C` | `0x045E6C` | `jal 0x8005566C` (recebe `&480($sp)` em `$a2`) | Use breakpoint no PCSX-Redux neste endereço para rastrear o ponteiro da struct de timer em RAM |
| Constante `60000` (`0xEA60` = 1 min em ms) | `0x800833E8` | `0x073BE8` | Imediato `0xEA60` (60.000 ms) | Rotina de conversão / formatação de minutos e segundos do cronômetro |
| Modos de jogo (`CAREER`, `PRACTICE`, `SINGLE`, `CONTEST`, etc.) | `0x800BA600` | `0x0AAE00` | Tabela de ponteiros de modo (`NONE`..`CONTEST`) | Permite identificar quando o timer está ativo (Career/Single = 2:00, Contest = 1:00, Free Skate = infinito) |
| HUD do relógio (fonte `time.fnt`) | `CD.WAD +0x1C8000` | `panel.pre` (idx 15) | Fonte numérica do cronômetro na tela | Extraia `panel.pre` via `thps2_wad.js unpack --pre` para alterar aparência do relógio |

### Procedimento Rápido para Congelar ou Customizar o Cronômetro (PCSX-Redux + Ghidra)
1. Inicie uma sessão no **The Hangar** no PCSX-Redux com **Search RAM (32-bit)** procurando o contador decrescente em milissegundos/frames (entre `120000` e `0` ou `7200` e `0`).
2. Coloque um **Write Breakpoint** no endereço de RAM encontrado.
3. O debugger parará exatamente na instrução `subu` / `addiu ..., -1` que decrementa o relógio:
   - **Tempo infinito:** substitua a instrução de escrita `sw` (ou o decremento) por `nop` (`0x00000000`).
   - **Tempo customizado (ex.: 5:00 ou 10:00):** coloque um **Write Breakpoint** ao clicar em *Retry* para capturar o exato `lui + ori/addiu` que recarrega o valor inicial do relógio.

---

## 2. Física do Skatista, Velocidade, Pulo e Equilíbrio

A física do THPS2 é controlada pela combinação de **3 camadas**:

### Camada A — Stats Base de Cada Skatista (`g_SkaterTable @ 0x800B6834`)
Cada skatista possui **10 bytes de atributos (1 a 10)** no offset **`+0x128`** de sua struct de `0x154` bytes (detalhados individualmente no [MAPA 04](MAPA_04_PERSONAGENS_E_STATS.md)):

| Byte Offset | Atributo | Efeito Direto na Física |
| :---: | :--- | :--- |
| `+0x128` | **Air** | Impulso vertical em rampas / vert |
| `+0x129` | **Hangtime** | Redução da aceleração gravitacional no ar |
| `+0x12A` | **Ollie** | Altura base do salto no plano |
| `+0x12B` | **Speed** | Velocidade máxima no solo |
| `+0x12C` | **Spin** | Velocidade angular de rotação (180/360/540/720/900) |
| `+0x12D` | **Landing** | Tolerância de ângulo na aterrissagem sem cair (bail) |
| `+0x12E` | **Switch** | Penalidade/habilidade andando em base invertida |
| `+0x12F` | **Rail Balance** | Estabilidade da barra de equilíbrio no grind |
| `+0x130` | **Lip Balance** | Estabilidade da barra de equilíbrio em lip tricks |
| `+0x131` | **Manual** | Estabilidade da barra de equilíbrio em manuals |

> **Dica de Modding Rápido:** aumentar qualquer stat acima de `10` (ex.: `0x0F` = 15 ou `0x14` = 20) diretamente no `SLUS_010.66` cria super-pulos, super-velocidade e equilíbrio extremo sem precisar mexer em assembly!

### Camada B — Modificadores de Física via Cheats (`0x80026C48`)
O engine já implementa multiplicadores globais de física acionados pelas flags de cheat (ver [MAPA 07](MAPA_07_CHEATS_COMANDOS_E_STRINGS.md)):
- **`Moon physics`** (`0x800C02C0`): reduz a gravidade global drasticamente.
- **`Perfect balance`** (`0x800C028C`): trava a deriva da barra de equilíbrio em grinds, lips e manuals.
- **`Always special`** (`0x800C0290`): mantém a barra Special em 100% permanentemente.
- **`Sim mode`** (`0x800C02AC`): aumenta gravidade e exige física realista.
- **`Slow-Nic`** (`0x800C02A0`): reduz o timestep do jogo em câmera lenta durante manobras.
- **`Weight`** (`0x800C0298`): altera massa/inércia do skatista.

### Camada C — Bônus dos Decks (`g_SkaterTable +0x28..+0x127`)
Cada skatista possui **8 decks** (32 bytes cada) contendo 3 inteiros de bônus de atributos (ex.: `+0x34`, `+0x38`, `+0x3C` para o 1º deck, variando de `1` a `5`).

---

## 3. Sistema de Pontuação, Multiplicadores e Limiares das Fases

1. **Pontuação Base de Cada Manobra:** armazenada em **`tricks.bin`** (`CD.WAD +0x0014E000`, `CD.HED idx=11`) logo após o nome da manobra no padrão `0x0A <uint16_le pontos>` — ver tabela completa de todas as manobras no [MAPA 05](MAPA_05_MANOBRAS_TRICKS_BIN.md).
2. **Metas de Pontuação (High Score / Pro Score / Sick Score) e Dinheiro por Objetivo:** armazenadas diretamente dentro de cada entrada de **`g_LevelTable`** (`0x800B8444`, stride `0x174`) — ver tabela completa no [MAPA 03](MAPA_03_FASES_E_OBJETOS_TRG.md).
3. **Bônus de Cash (50 / 100 / 200 / 250 / 500):** strings em `0x80069AC0..0x80069B08` (`g_StringTable @ 0x800C0300..0x800C0318`).
