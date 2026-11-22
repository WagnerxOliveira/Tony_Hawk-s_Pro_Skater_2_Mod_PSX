# 🎮 MAPA 07 — Cheats, Comandos de Controle e Tabela Mestra de Strings (`g_StringTable`)

---

## 1. Sistema de Cheats no `SLUS_010.66`

- **Ponteiros de nome dos cheats:** `0x800C028C` – `0x800C02D4` (dentro de `g_StringTable[]`)
- **Handler do menu de cheats:** `0x80026C48` (jump tables em `0x800AFC18`, `0x800AFC50`, `0x800AFC88`)

| Ponteiro RAM | Offset `SLUS` | String RAM | Texto Atual na ISO | Efeito no Jogo |
| :---: | :---: | :---: | :--- | :--- |
| `0x800C028C` | `0x0B0A8C` | `0x80069994` | `Perfect balance` | Equilíbrio perfeito em grind, lip e manual |
| `0x800C0290` | `0x0B0A90` | `0x800699A4` | `Always special` | Barra Special sempre cheia (100%) |
| `0x800C0294` | `0x0B0A94` | `0x800699B4` | `STUD` | Atributos no máximo (10/10 em tudo) |
| `0x800C0298` | `0x0B0A98` | `0x800699BC` | `Weight` | Altera massa/peso do skatista |
| `0x800C029C` | `0x0B0A9C` | `0x800699C4` | `Wireframe` | Renderização em wireframe (arame) |
| `0x800C02A0` | `0x0B0AA0` | `0x800699D0` | `Slow-Nic` | Câmera lenta durante manobras |
| `0x800C02A4` | `0x0B0AA4` | `0x800699DC` | `Cabecao!` | Modo Cabeção (Big Head) |
| `0x800C02A8` | `0x0B0AA8` | `0x800699E8` | `Crianca ` | Modo Criança (Kid Mode) |
| `0x800C02AC` | `0x0B0AAC` | `0x800699F4` | `Sim mode` | Física realista (Sim Mode) |
| `0x800C02B0` | `0x0B0AB0` | `0x80069A00` | `Smooth` | Suavização visual (Smooth) |
| `0x800C02B4` | `0x0B0AB4` | `0x80069A08` | `Big board` | Skate gigante (Big Board) |
| `0x800C02B8` | `0x0B0AB8` | `0x80069A14` | `High levels` | Fases esticadas verticalmente |
| `0x800C02BC` | `0x0B0ABC` | `0x80069A20` | `Wide levels` | Fases alargadas horizontalmente |
| `0x800C02C0` | `0x0B0AC0` | `0x80069A2C` | `Moon physics` | Gravidade lunar (Moon Physics) |
| `0x800C02C4` | `0x0B0AC4` | `0x80069A3C` | `Disco mode` | Luzes coloridas piscantes (Disco Mode) |
| `0x800C02C8` | `0x0B0AC8` | `0x80069A48` | `Level flip` | Fases espelhadas (Level Flip) |
| `0x800C02CC` | `0x0B0ACC` | `0x80069A54` | `McSqueeb` | Desbloqueia 80's Tony (McSqueeb) |
| `0x800C02D0` | `0x0B0AD0` | `0x80069A60` | `Spider-Man` | Desbloqueia Spider-Man |
| `0x800C02D4` | `0x0B0AD4` | `0x80069A6C` | `Officer Dick` | Desbloqueia Officer Dick (Gordao) |

---

## 2. Máscara de Bits dos Botões do Controle PS1 (Psy-Q `PadRead`)

Essencial para encontrar rotinas de combos, comandos de manobras e sequências de cheat no Ghidra (procurando instruções `andi $reg, <mask>` sobre a palavra de 16 bits do controle):

| Botão PS1 | Máscara Bit (Ativo = 1 em Psy-Q invertido) | Uso Padrão no THPS2 |
| :--- | :---: | :--- |
| `SELECT` | `0x0001` | Troca câmera |
| `L3` / `R3` | `0x0002` / `0x0004` | Analógico (DualShock) |
| `START` | `0x0008` | Menu de Pausa (onde os cheats com `L1` são inseridos) |
| `UP` / `RIGHT` / `DOWN` / `LEFT` | `0x0010` / `0x0020` / `0x0040` / `0x0080` | Direção, Manuais (`UP+DOWN`), Flip/Grab direcionais |
| `L2` / `R2` | `0x0100` / `0x0200` | Nollie / Switch Stance |
| `L1` / `R1` | `0x0400` / `0x0800` | Giro (Spin Left/Right) • **`L1` segurado = ativador de cheats no Pause** |
| `TRIANGLE` | `0x1000` | Grind / Lip Trick |
| `CIRCLE` | `0x2000` | Grab |
| `CROSS (X)` | `0x4000` | Ollie / Agachar / Confirmar |
| `SQUARE` | `0x8000` | Flip Trick |

---

## 3. Tabela Mestra de Strings / Tradução (`g_StringTable[]`)

- **Intervalo em RAM:** `0x800BF2E0` até `0x800C0888` (**1.387 ponteiros `const char*`**)
- **Intervalo no Arquivo `SLUS_010.66`:** `0x0AFAE0` até `0x0B1088`
- **Funções de leitura:** `0x80038B2C`, `0x80067DA0`, `0x80067E84`, `0x800680B8`, `0x8006840C`, `0x80068454`

### Como Traduzir Sem Limite de Caracteres (Técnica Profissional)
1. Em vez de sobrescrever a string original inline (que limita o tamanho ao texto em inglês), grave a nova string PT-BR em uma área livre no fim do executável (expandindo `t_size` em múltiplos de `0x800` se necessário).
2. Altere apenas o ponteiro de 4 bytes correspondente dentro de `g_StringTable[]` (`0x800BF2E0..0x800C0888`) para o novo endereço RAM.
3. Observe o caractere especial **`&`** usado pela engine Neversoft como **quebra de linha** nas caixas de diálogo (ex.: `"Salvou&[%s]...&espera..."`).

### Amostra das Strings PT-BR Já Presentes no `SLUS_010.66`

| Endereço RAM | Offset `SLUS_010.66` | Texto Atual |
| :---: | :---: | :--- |
| `0x80069400` | `0x059C00` | `Noob!...` |
| `0x800696B0` | `0x059EB0` | `Grava nao` |
| `0x800696EC` | `0x059EEC` | `Pega a fase!` |
| `0x8006976C` | `0x059F6C` | `Nao salvar sua vergonha` |
| `0x800697B4` | `0x059FB4` | `A file named&[%s]&already exists.  Escolha um nome diferente Noob.` |
| `0x80069868` | `0x05A068` | `Pro Lixo&[%s]...&tira a mao dessa porcaria do slot 1 da humilhacao` |
| `0x800699DC` | `0x05A1DC` | `Cabecao!` |
| `0x800699E8` | `0x05A1E8` | `Crianca ` |
| `0x80069AE4` | `0x05A2E4` | `250 Conto!!!` |
| `0x80069AF4` | `0x05A2F4` | `50 Conto` |
| `0x80069B00` | `0x05A300` | `100 Conto!` |
| `0x80069B0C` | `0x05A30C` | `%s Colete Lixo` |
| `0x80069BCC` | `0x05A3CC` | `Pague pra nao cair!` |
| `0x80069C64` | `0x05A464` | `Noob 01!` |
| `0x80069C70` | `0x05A470` | `Noob 02!` |
| `0x80069CB8` | `0x05A4B8` | `Noob 1 fez so isso` |
| `0x80069CCC` | `0x05A4CC` | `Noob 2 fez so isso` |
| `0x80069CE0` | `0x05A4E0` | `Mico do noob 1` |
| `0x80069CF0` | `0x05A4F0` | `Mico do noob 2` |
| `0x80069DB0` | `0x05A5B0` | `noob lixo! %d` |
| `0x80069DC0` | `0x05A5C0` | `noob lixo! %d` |
| `0x80069E18` | `0x05A618` | `Lista Noob!` |
| `0x80069E58` | `0x05A658` | `Salvar Choro` |
| `0x80069E68` | `0x05A668` | `Aperta lixo` |
| `0x80069EF0` | `0x05A6F0` | `Mude de Fase` |
| `0x80069F3C` | `0x05A73C` | `Parabens seu lixo ` |
| `0x80069F80` | `0x05A780` | `Lenda Noob` |
| `0x8006A088` | `0x05A888` | `%s Noob scores` |
| `0x8006A150` | `0x05A950` | `Aperta X Noob!     ` |
| `0x8006A1E0` | `0x05A9E0` | `Carregar Noob!` |
| `0x8006A1F0` | `0x05A9F0` | `Merda!!...` |
| `0x8006A1FC` | `0x05A9FC` | `Escolha Noob!` |
| `0x8006A20C` | `0x05AA0C` | `Noob  ` |
| `0x8006A2C8` | `0x05AAC8` | `3 medalhas pro Noob!  ` |
| `0x8006A310` | `0x05AB10` | `lds se quiser ser o lixo` |
| `0x8006A340` | `0x05AB40` | `Tenta ouro seu Noob` |
| `0x8006A354` | `0x05AB54` | `Voce e ruim demais!` |
| `0x8006A374` | `0x05AB74` | `1st noob!` |
| `0x8006A380` | `0x05AB80` | `2nd noob!` |
| `0x8006A38C` | `0x05AB8C` | `3rd noob!` |
| `0x8006A398` | `0x05AB98` | `Classificacao do Lixo` |
| `0x8006A3E4` | `0x05ABE4` | `Noob   %d heat %d over!` |
| `0x8006A414` | `0x05AC14` | `Noob   %d vai` |
| `0x8006A424` | `0x05AC24` | `Noob   %d vai sofrer` |
| `0x8006A444` | `0x05AC44` | `Merda!!` |
| `0x8006A670` | `0x05AE70` | `Noob  ` |
| `0x8006A6C8` | `0x05AEC8` | `Jogar de 2!` |
| `0x8006A6DC` | `0x05AEDC` | `Noob 1 controle  ` |
| `0x8006A6F0` | `0x05AEF0` | `Noob 2 controle  ` |
| `0x8006A704` | `0x05AF04` | `Noob   %d controle` |
| `0x8006AD6C` | `0x05B56C` | `Veja Noob!` |
| `0x8006AD8C` | `0x05B58C` | `Savae Noob?` |
| `0x8006AD98` | `0x05B598` | `Sair` |
| `0x8006ADA0` | `0x05B5A0` | `Coloca a bosta do controle` |
| `0x8006ADE0` | `0x05B5E0` | `escolha fase` |
