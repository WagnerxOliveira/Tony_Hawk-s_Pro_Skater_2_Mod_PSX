# 📦 Extração de Assets: CD.WAD

> **Documentação Técnica:** Relatório de desempacotamento de dados brutos e especificação do script automatizado.

Este documento formaliza o resultado da extração completa do arquivo principal de dados do jogo (*Tony Hawk's Pro Skater 2 - PSX*), o `CD.WAD`, utilizando como mapa as estruturas de ponteiros dissecadas no índice `CD.HED`.

---

## 📊 Resumo da Extração

* **Arquivo Container Origem:** `CD.WAD` (~27.34 MB)
* **Arquivo Índice Origem:** `CD.HED` (18.372 bytes)
* **Total de Arquivos Extraídos:** **1.531 arquivos**
* **Formato de Saída:** Arquivos binários brutos com extensão temporária `.dat`
* **Diretório de Destino:** `Arquivos Originais/Arquivos Extraidos - WAD/WAD_Desempacotado/`

---

## ⚙️ O Script Extrator: thps2_wad_extractor.py

A extração em massa e cirúrgica de todos os blocos de dados foi realizada com sucesso através de um script automatizado desenvolvido sob medida em Python.

* **Nome do Script:** `thps2_wad_extractor.py`
* **Localização no Repositório:** `[Scripts/thps2_wad_extractor.py](../../Scripts/thps2_wad_extractor.py)`

### 🧠 Lógica e Funcionamento do Algoritmo

O script opera realizando uma leitura e fatiamento de fluxo de bytes em baixo nível (*Stream I/O*):

1. **Mapeamento de Caminhos Dinâmicos:** Utilizando a biblioteca nativa `os.path`, o script resolve de forma relativa a árvore de diretórios do projeto. Isso garante portabilidade total do código, permitindo sua execução em qualquer máquina sem quebrar os caminhos.
2. **Iteração de Tabela (FAT):** O algoritmo lê o arquivo `CD.HED` em blocos sequenciais de 12 bytes. Cada bloco é interpretado pela biblioteca `struct` usando a máscara `<III` (três inteiros de 4 bytes sem sinal, configurados em *Little Endian*, invertendo os bytes brutos para o padrão de leitura da nossa CPU).
3. **Fatiamento Cirúrgico (`seek` e `read`):** Para cada iteração válida, o script manipula o ponteiro de leitura do arquivo gigante `CD.WAD`:
   * `f_wad.seek(offset_val)`: Salta instantaneamente para o byte exato onde o asset começa (sempre alinhado em múltiplos de setores de `2048` bytes devido ao *Padding* do CD-ROM do PS1).
   * `f_wad.read(size_val)`: Copia apenas o comprimento exato do arquivo, isolando-o completamente do restante do bloco de dados.
4. **Nomenclatura de Preservação:** Como a Neversoft descartou as strings com os nomes reais dos arquivos para economizar memória RAM no hardware do PlayStation 1, os arquivos foram salvos seguindo o padrão de identificação única: `[ID_Quatro_Digitos]_[HASH_HEXADECIMAL].dat` (Exemplo: `0001_B57D1831.dat`).

---

## 📂 Natureza dos Arquivos Extraídos

Os 1.531 arquivos extraídos e armazenados na pasta `WAD_Desempacotado` constituem a totalidade dos recursos essenciais do jogo. Embora estejam todos temporariamente com a extensão genérica `.dat`, sua natureza oculta divide-se em:

* **Texturas e Elementos Visuais:** Formatos nativos de imagem do PS1 (como `.TIM`), contendo artes dos menus, fontes de texto mapeadas, logos de marcas de skate e as texturas dos cenários (como as paredes do *Hangar* ou da *School II*).
* **Modelos Geométricos 3D:** Estruturas de malhas (*meshes*) de colisão dos mapas, modelos tridimensionais dos skatistas profissionais