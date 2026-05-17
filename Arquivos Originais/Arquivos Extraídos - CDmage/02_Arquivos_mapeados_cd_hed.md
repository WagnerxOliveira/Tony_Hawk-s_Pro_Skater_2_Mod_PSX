# 🗺️ Mapeamento de Memória: CD.HED -> CD.WAD

> **Documentação Técnica:** Estrutura de ponteiros do índice `CD.HED` de *Tony Hawk's Pro Skater 2 (PSX)*.

Durante a análise de engenharia reversa visual via HxD, confirmamos que o arquivo de índice `CD.HED` não utiliza metadados em texto plano. A tabela de alocação (FAT) do jogo é estritamente baseada em uma matriz contínua de blocos de **12 bytes**. Devido à arquitetura MIPS do PlayStation 1, a leitura da memória segue o formato **Little Endian** (bytes invertidos).

---

## 🧬 Anatomia da Struct (12 Bytes)

Cada arquivo embutido no `CD.WAD` responde a este contrato de memória exato:

1. **[Bytes 00-03] Hash do Nome:** Identificador único gerado por um algoritmo de hash da Neversoft (já que os nomes reais em string foram descartados para poupar RAM).
2. **[Bytes 04-07] Offset (Ponteiro):** Endereço físico hexadecimal indicando onde o arquivo começa dentro do `CD.WAD`.
3. **[Bytes 08-11] Tamanho (Size):** Comprimento exato do arquivo em bytes.

> ⚠️ **Regra de Alinhamento (Sector Padding):** O hardware de CD-ROM do PS1 lê dados em setores de **2048 bytes** (`0x800`). Portanto, **todos os Offsets** são obrigatoriamente múltiplos de `0x800`. O espaço sobressalente entre o fim real de um arquivo e o início do próximo múltiplo de `0x800` é preenchido com bytes nulos (`00`).

---

## 📊 Dissecação de Fronteiras (Amostragem Estrutural)

*Nota técnica: Transcrever as 1.531 linhas manualmente é redundante. A tabela abaixo mapeia os limites estruturais (Início, Meio e Fim) que validam a lógica iterativa do nosso script extrator.*

| ID do Ficheiro | Bloco Bruto (Hex 12 Bytes) | 🔑 Hash (Little Endian) | 📍 Offset (Início no WAD) | 📦 Tamanho (Decimal) |
| :--- | :--- | :--- | :--- | :--- |
| **0001 (Head)** | `31 18 7D B5 00 00 00 00 38 E4 01 00` | `B57D1831` | `0x00000000` (Byte 0) | `0x0001E438` (123.960 bytes) |
| **0002** | `01 48 8B 26 00 E8 01 00 B0 11 00 00` | `268B4801` | `0x0001E800` (Byte 124.928) | `0x000011B0` (4.528 bytes) |
| **...** | `...` | `...` | `...` | `...` |
| **Aleatório (Mid)** | `89 CD FD 4F 00 48 E2 00 F4 02 00 00` | `4FFDCD89` | `0x00E24800` (Byte 14.829.568) | `0x000002F4` (756 bytes) |
| **...** | `...` | `...` | `...` | `...` |
| **1531 (Tail)** | *(Bloco final extraído na Offset 0x47B8)* | `[Hash Final]` | `[Último Offset Múltiplo]` | `[Último Tamanho]` |
| **EOF / Null** | `00 00 00 00 00 00 00 00 00 00 00 00` | `N/A` | *Fim da Leitura* (`0x47C4`) | `N/A` |

---

## 🧮 Matemática Final da Matriz
* **Fim do Arquivo (EOF):** O último bloco válido contendo dados de arquivo termina exatamente no byte **18.372** (Endereço Hexadecimal: `0x47C4`).
* **Fórmula Aplicada:** `18.372 bytes totais ÷ 12 bytes por Struct`
* **Veredito de Extração:** A matriz atesta de forma inequívoca que o `CD.WAD` armazena exatamente **1.531 arquivos**. O algoritmo de extração deverá iterar sobre o índice exatamente 1.531 vezes.