# 🗺️ Mapeamento de Memória: CD.HED -> CD.WAD

> Documentação técnica da estrutura de ponteiros do índice `CD.HED` do jogo Tony Hawk's Pro Skater 2 (PS1).
> Durante a engenharia reversa, descobrimos que cada ficheiro embutido no `CD.WAD` não possui nome em texto legível. Em vez disso, é representado por uma `struct` exata de **12 bytes**, lida em formato **Little Endian** (de trás para a frente, padrão do processador MIPS).

### 🧬 A Estrutura da Struct (12 Bytes)
1. **Hash do Nome (4 bytes):** Identificador algorítmico do arquivo.
2. **Offset (4 bytes):** Endereço de início do arquivo dentro do `CD.WAD`. Sempre alinhado em múltiplos de `0x800` (2048 bytes, o tamanho de um setor de CD-ROM).
3. **Tamanho (4 bytes):** Comprimento exato do arquivo em bytes.

---

### 📊 Tabela de Dissecação (Amostragem do HxD)

Abaixo está a amostragem dos primeiros arquivos e de um arquivo intermediário, provando a consistência da matriz:

| ID do Ficheiro | Bloco Bruto (Hex 12 Bytes) | 🔑 Hash (Little Endian) | 📍 Offset (Início no WAD) | 📦 Tamanho do Ficheiro |
| :--- | :--- | :--- | :--- | :--- |
| **Ficheiro 0001** | `31 18 7D B5 00 00 00 00 38 E4 01 00` | `B5 7D 18 31` | `0x00000000` (Byte 0) | `0x0001E438` (123.960 bytes) |
| **Ficheiro 0002** | `01 48 8B 26 00 E8 01 00 B0 11 00 00` | `26 8B 48 01` | `0x0001E800` (Byte 124.928) | `0x000011B0` (4.528 bytes) |
| **...** | `...` | `...` | `...` | `...` |
| **Ficheiro Aleatório** | `89 CD FD 4F 00 48 E2 00 F4 02 00 00` | `4F FD CD 89` | `0x00E24800` (Byte 14.829.568) | `0x000002F4` (756 bytes) |
| **...** | `...` | `...` | `...` | `...` |
| **Ficheiro 1531** | *(Últimos 12 bytes antes do offset 0x47C0)* | *[Hash final]* | *[Último Offset Alinhado]* | *[Último Tamanho]* |

---

### 🧮 Conclusão da Análise Matemática
* **Tamanho total do `CD.HED`:** 18.376 bytes úteis (até o preenchimento de EOF).
* **Fórmula Aplicada:** `18.376 bytes totais ÷ 12 bytes por bloco = 1.531`
* **Resultado:** O arquivo `CD.WAD` contém exatamente **1.531 arquivos empacotados**.