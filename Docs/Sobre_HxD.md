# 🔬 Guia Seguro de Inspeção e Edição Hexadecimal com HxD (THPS2 PS1)

> **Guia Técnico Prático:** Como navegar, inspecionar estruturas binárias e editar dados com segurança no **HxD** para *Tony Hawk's Pro Skater 2 (`SLUS-01066`)* sem corromper instruções MIPS ou tabelas internas.

---

## 1. Regra Fundamental: Conversão `Offset no HxD ↔ Endereço RAM PS1`

O executável `SLUS_010.66` possui um cabeçalho `PS-X EXE` de exatos **`0x800` (2.048) bytes**, e seu corpo é carregado pela BIOS em **`0x80010000`**:

```text
RAM_Address = 0x80010000 + (Offset_HxD - 0x0800)
Offset_HxD  = (RAM_Address - 0x80010000) + 0x0800
```

| Exemplo Real no Projeto | Endereço RAM (Ghidra / DuckStation) | Offset no HxD (`SLUS_010.66`) |
| :--- | :---: | :---: |
| Base da tabela `g_SkaterTable[]` | `0x800B6834` | `0x0A7034` |
| Nome `"Valter Pacheco"` (Slot 9) | `0x800D45B4` | `0x0C4DB4` |
| Tabela de vídeos `g_MovieTable[]` | `0x800C1CB4` | `0x0B24B4` |
| Entry Point `THPS2_EntryPoint` | `0x800A2910` | `0x093110` |

---

## 2. Arquitetura Little-Endian (MIPS R3000A)

O PlayStation 1 opera em **Little-Endian**: o byte menos significativo vem primeiro no arquivo. No HxD, ative o painel **Data Inspector** (`View → Toolbars → Data Inspector`) configurado para *Little-Endian*:

- **Ponteiro RAM `0x800D45B4`** aparece no HxD como: `B4 45 0D 80`
- **Instrução MIPS `li $a0, 120` (`0x24040078`)** aparece como: `78 00 04 24`
- **Inteiro 16-bit `4088` (`0x0FF8`)** aparece como: `F8 0F`

---

## 3. Regras de Ouro para Edição de Textos/Strings no HxD

1. **Nunca estoure o terminador NUL (`0x00`):** uma string editada *inline* precisa ter comprimento **menor ou igual** ao slot original (incluindo os bytes de padding `0x00` até a próxima string alinhada em 4 bytes). Preencha bytes sobrando com `0x00` (nunca deixe lixo da string antiga).
2. **Apenas ASCII imprimível (`0x20..0x7E`):** as fontes `.FNT` originais do THPS2 NTSC-U **não mapeiam acentos Latin-1** (`>= 0x80`). Inserir `ã` (`0xE3`), `ç` (`0xE7`) ou `é` (`0xE9`) faz o jogo desenhar glifos quebrados ou corrompidos na tela! Use texto sem acento (`Lulao`, `Joao Paulo`, `Configuracoes`) ou redirecione glifos na `.FNT`.
3. **Preserve 100% os especificadores `printf`:** nunca remova, troque ou inverta `%s`, `%d`, `%i`, `%u` ou o caractere especial `&` (usado pela Neversoft como quebra de linha!).
4. **Precisa de texto maior que o slot original?** Em vez de invadir a string vizinha, grave o texto novo em uma região livre e atualize apenas o ponteiro de 4 bytes em `g_StringTable[]` (`0x0AFAE0..0x0B1088`).

---

## 4. ⚠️ Alerta Forense Crítico: Nunca Faça "Substituir Tudo" Cego!

Durante a auditoria inicial do projeto, identificamos na prática o que acontece quando se tenta editar um executável MIPS com *Find & Replace All* no HxD:

- **Bug Real Documentado (`78 00` → `2C 01`, `120` → `300`):** uma busca cega tentando aumentar o cronômetro de `120s` para `300s` alterou **8 instruções MIPS válidas** que usavam a constante `120` para coisas completamente diferentes — raycast de colisão (`0x80016848`), posição `(X,Y,Z)` do skatista (`0x80018EE0/EE4/F54`), ID de efeito sonoro (`0x8006237C`), hold do controle (`0x8006BC2C`), escala de fonte (`0x8007E880`) e tamanho de alocação na heap (`0x8008238C`). Resultado: skatista sumindo, clipping em paredes e controle travando! Todas foram restauradas por [`Scripts/fix_game_errors.js`](../Scripts/fix_game_errors.js).
- **Backup Corrompido (`0x0000FFF8` em `0x8005F320`):** uma edição manual prévia em uma cópia `.bak` antiga zerou 2 bytes de uma instrução `addiu $a0, -8` (`2484FFF8` → `0000FFF8`, opcode MIPS inválido!).

> **Boas práticas no projeto:** use o **HxD** para **inspeção visual e confirmação de offsets**, mas aplique todas as modificações definitivas via **scripts Node.js determinísticos e auditáveis** em `Scripts/`, sempre validando o resultado com [`Scripts/audit_game.js`](../Scripts/audit_game.js) (10 estágios automáticos).

---

## 5. Referências Cruzadas

- [MAPA 01 — Memória, `SLUS_010.66` e Registro Forense dos 8 Opcodes](MAPA_01_MEMORIA_E_EXECUTAVEL.md)
- [MAPA 07 — Cheats, Comandos e `g_StringTable[]`](MAPA_07_CHEATS_COMANDOS_E_STRINGS.md)
- [MAPA 13 — Auditoria Forense 10/10 e Pipeline de Build](MAPA_13_AUDITORIA_FORENSE_BUILD_PATCH_E_EMULACAO.md)
