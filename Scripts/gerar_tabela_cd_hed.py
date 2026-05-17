import struct
import os

def gerar_markdown_completo():
    # Descobre a pasta onde este script está salvo (.../Scripts)
    diretorio_script = os.path.dirname(os.path.abspath(__file__))
    
    # Navega para a pasta correta do CD.HED e do Markdown
    pasta_alvo = os.path.join(diretorio_script, "..", "Arquivos Originais", "Arquivos Extraídos - CDmage")
    
    caminho_hed = os.path.join(pasta_alvo, "CD.HED")
    caminho_md = os.path.join(pasta_alvo, "02_Arquivos_mapeados_cd_hed.md")

    if not os.path.exists(caminho_hed):
        print(f"Erro: O arquivo não foi encontrado no caminho: {caminho_hed}")
        return

    with open(caminho_hed, 'rb') as f:
        dados = f.read()

    total_arquivos = len(dados) // 12

    with open(caminho_md, 'w', encoding='utf-8') as md:
        # Escrevendo o cabeçalho e a explicação
        md.write("# 🗺️ Mapeamento de Memória: CD.HED -> CD.WAD\n\n")
        md.write("> **Documentação Técnica:** Estrutura de ponteiros do índice `CD.HED` de *Tony Hawk's Pro Skater 2 (PSX)*.\n\n")
        md.write("Durante a análise de engenharia reversa visual via HxD, confirmamos que o arquivo de índice `CD.HED` não utiliza metadados em texto plano. A tabela de alocação (FAT) do jogo é estritamente baseada em uma matriz contínua de blocos de **12 bytes**. Devido à arquitetura MIPS do PlayStation 1, a leitura da memória segue o formato **Little Endian** (bytes invertidos).\n\n")
        md.write("---\n\n")
        md.write("## 🧬 Anatomia da Struct (12 Bytes)\n\n")
        md.write("Cada arquivo embutido no `CD.WAD` responde a este contrato de memória exato:\n\n")
        md.write("1. **[Bytes 00-03] Hash do Nome:** Identificador único gerado por um algoritmo de hash da Neversoft.\n")
        md.write("2. **[Bytes 04-07] Offset (Ponteiro):** Endereço físico hexadecimal indicando onde o arquivo começa dentro do `CD.WAD`.\n")
        md.write("3. **[Bytes 08-11] Tamanho (Size):** Comprimento exato do arquivo em bytes.\n\n")
        md.write("> ⚠️ **Regra de Alinhamento (Sector Padding):** O hardware de CD-ROM do PS1 lê dados em setores de **2048 bytes** (`0x800`). Portanto, **todos os Offsets** são obrigatoriamente múltiplos de `0x800`. O espaço sobressalente entre o fim real de um arquivo e o início do próximo múltiplo de `0x800` é preenchido com bytes nulos (`00`).\n\n")
        md.write("---\n\n")
        md.write("## 📊 Tabela de Dissecação Completa\n\n")
        
        # Cabeçalho da tabela
        md.write("| ID do Ficheiro | Bloco Bruto (12 Bytes) | 🔑 Hash (Little Endian) | 📍 Offset (Início no WAD) | 📦 Tamanho (Decimal) |\n")
        md.write("| :--- | :---: | :---: | :---: | :---: |\n")

        arquivos_validos = 0
        ultimo_offset = 0

        # Iterando sobre todos os blocos de 12 bytes
        for i in range(total_arquivos):
            bloco = dados[i*12 : (i+1)*12]
            
            if len(bloco) < 12:
                break

            hash_val, offset_val, size_val = struct.unpack('<III', bloco)

            bloco_hex = bloco.hex().upper()
            bloco_formatado = f"{bloco_hex[0:8]} {bloco_hex[8:16]} {bloco_hex[16:24]}"

            if hash_val == 0 and offset_val == 0 and size_val == 0:
                md.write(f"| **EOF / Null** | `{bloco_formatado}` | `N/A` | *Fim da Leitura*<br>*(Byte {i*12})* | `N/A` |\n")
                break

            arquivos_validos += 1
            ultimo_offset = i * 12

            hash_str = f"{hash_val:08X}"
            offset_hex = f"0x{offset_val:08X}"
            size_hex = f"0x{size_val:08X}"

            linha = f"| **{i+1:04d}** | `{bloco_formatado}` | `{hash_str}` | `{offset_hex}`<br>*(Byte {offset_val})* | `{size_hex}`<br>*({size_val} bytes)* |\n"
            md.write(linha)

        md.write("\n---\n\n")
        md.write("## 🧮 Matemática Final da Matriz\n")
        md.write(f"* **Fim do Arquivo (EOF):** O último bloco válido contendo dados de arquivo termina exatamente no byte **{ultimo_offset + 12}** (Endereço Hexadecimal: `0x{ultimo_offset + 12:04X}`).\n")
        md.write(f"* **Fórmula Aplicada:** `{ultimo_offset + 12} bytes úteis ÷ 12 bytes por Struct`\n")
        md.write(f"* **Veredito de Extração:** A matriz atesta de forma inequívoca que o `CD.WAD` armazena exatamente **{arquivos_validos} arquivos**. O algoritmo de extração deverá iterar sobre o índice exatamente {arquivos_validos} vezes.\n")

    print(f"Sucesso! O arquivo Markdown foi reescrito com todas as {arquivos_validos} linhas mapeadas perfeitamente.")

if __name__ == "__main__":
    gerar_markdown_completo()