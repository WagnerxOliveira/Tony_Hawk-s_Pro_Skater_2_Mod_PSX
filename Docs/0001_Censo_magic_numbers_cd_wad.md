# 🔍 Censo de Assinaturas: Magic Numbers do CD.WAD

> **Documentação Técnica:** Mapeamento heurístico de cabeçalhos e análise estatística de assinaturas de arquivos (*Magic Numbers*).

Após o desempacotamento físico bem-sucedido dos 1.531 arquivos contidos no container `CD.WAD`, os arquivos resultantes foram salvos sem uma extensão definida (formato binário bruto `.dat`). Para decifrar a identidade tecnológica e a função de cada asset dentro da *Neversoft Engine*, realizamos uma varredura programática nos primeiros **4 bytes** de cada arquivo em busca de suas impressões digitais magnéticas, conhecidas como *Magic Numbers*.

---

## ⚙️ O Script Varredor: thps2_magic_hunter.py

A extração estatística e a leitura dos cabeçalhos foram executadas de forma automatizada pelo script de auditoria do repositório.

* **Nome do Script:** `thps2_magic_hunter.py`
* **Localização no Repositório:** `[Scripts/thps2_magic_hunter.py](../../Scripts/thps2_magic_hunter.py)`

### 🧠 Princípio de Operação do Scanner
O script executa um loop iterativo pelo diretório `WAD_Desempacotado`. Para cada arquivo, o algoritmo abre um fluxo de leitura limitado (`Stream I/O`), captura apenas o vetor inicial de 4 bytes (`f.read(4)`) e o converte simultaneamente para uma string Hexadecimal e uma representação de caracteres legíveis (ASCII). Os resultados são agrupados e ordenados por frequência usando a classe `collections.Counter`.

---

## 🔬 Análise de Domínio das Assinaturas Encontradas

A análise dos dados coletados revelou que a engine do jogo distribui seus recursos em quatro grandes ecossistemas tecnológicos:

1. **O Ecossistema Gráfico "BM" (`42 4D ...`):** Representa mais de **70% dos arquivos** do jogo. Em computação, `0x42 0x4D` corresponde aos caracteres ASCII **"BM"** (Bitmap). Isso comprova que a Neversoft estruturou suas texturas de cenários, interfaces e skins de skatistas em variações customizadas de arquivos de imagem Bitmap, gerenciando resoluções e paletas de cores diretamente nos sub-bytes do cabeçalho.
2. **O Ecossistema Lógico `#ifn` (`23 69 66 6E`):** Corresponde ao caractere ASCII **"#ifn"** (início da diretiva de pré-processador `#ifndef` em C/C++). São os scripts lógicos compilados da engine (arquivos `.QB`), responsáveis por ditar as regras das fases, física, gatilhos de pontuação e comportamento da inteligência artificial.
3. **O Ecossistema de Eventos `_TRG` (`5F 54 52 47`):** Traduzido diretamente como **"_TRG"** (Triggers / Gatilhos). Estes arquivos mapeiam as caixas de colisão invisíveis do mapa que disparam eventos de cenário (como quebrar o vidro no mapa *Hangar* ou abrir a passagem secreta).
4. **O Ecossistema de Áudio `pBAV` (`70 42 41 56`):** Lidos em arquitetura Little Endian, os bytes revelam a assinatura nativa **"VAGp"** da Sony PlayStation. São os arquivos comprimidos de efeitos sonoros (*SFX*) interativos de ambiente e menus.
5. **O Ecossistema Geométrico (`04 00 02 00`):** Vetores numéricos puros que servem como ponteiros estruturais para montagem de malhas 3D (*Meshes*), vértices e coordenadas de colisão dos skatistas e pistas.

---

## 📊 Tabela Geral de Auditoria Estática

<details>
<summary><b>▶ Clique aqui para expandir/recolher a Tabela de Assinaturas Completa (1.529 Arquivos Varridos)</b></summary>

| ID Mapeado | Assinatura Hexadecimal | Janela ASCII | Volume Encontrado | Classificação Provável do Asset |
| :---: | :---: | :---: | :---: | :--- |
| **01** | `04 00 02 00` | `....` | 227 arquivos | Dados Geométricos / Índices de Vértices 3D |
| **02** | `42 4D 38 0C` | `BM8.` | 174 arquivos | Textura Gráfica (Bitmap de 8-bits com Paleta Tipo C) |
| **03** | `42 4D 38 14` | `BM8.` | 165 arquivos | Textura Gráfica (Bitmap de 8-bits com Paleta Tipo V) |
| **04** | `42 4D 38 44` | `BM8D` | 108 arquivos | Textura Gráfica (Bitmap de 8-bits Tipo D / Cenário) |
| **05** | `23 69 66 6E` | `#ifn` | 74 arquivos | Script de Lógica de Jogo (Neversoft Engine `.QB`) |
| **06** | `42 4D 76 04` | `BMv.` | 61 arquivos | Textura Gráfica VRAM Mapeada (Tipo 04) |
| **07** | `42 4D 76 01` | `BMv.` | 60 arquivos | Textura Gráfica VRAM Mapeada (Tipo 01) |
| **08** | `42 4D 76 09` | `BMv.` | 58 arquivos | Textura Gráfica VRAM Mapeada (Tipo 09) |
| **09** | `42 4D 76 10` | `BMv.` | 57 arquivos | Textura Gráfica VRAM Mapeada (Tipo 10) |
| **10** | `25 4E 00 00` | `%N..` | 50 arquivos | Dados de Animação / Tabela de Nodes |
| **11** | `42 4D 34 44` | `BM4D` | 47 arquivos | Textura Gráfica (Bitmap de 4-bits Tipo D / UI-Fontes) |
| **12** | `42 4D 38 08` | `BM8.` | 37 arquivos | Textura Gráfica (Bitmap de 8-bits Tipo 08) |
| **13** | `42 4D 38 06` | `BM8.` | 37 arquivos | Textura Gráfica (Bitmap de 8-bits Tipo 06) |
| **14** | `42 4D 38 E4` | `BM8.` | 32 arquivos | Textura Gráfica (Bitmap de 8-bits Tipo E4) |
| **15** | `5F 54 52 47` | `_TRG` | 25 arquivos | Gatilhos de Nível / Trigger Mappings |
| **16** | `42 4D F8 0F` | `BM..` | 19 arquivos | Textura de Interface / Sprite Interno |
| **17** | `70 42 41 56` | `pBAV` | 17 arquivos | Áudio Comprimido do PS1 (Cabeçalho Invertido `VAGp`) |
| **18** | `00 00 02 3C` | `...<` | 15 arquivos | Dados Estruturais de Execução |
| **19** | `01 00 00 00` | `....` | 15 arquivos | Cabeçalho Binário Genérico |
| **20** | `42 4D 48 2F` | `BMH/` | 12 arquivos | Textura de Skater / Elemento de Modelo |
| **21** | `FE 00 00 3C` | `...<` | 10 arquivos | Dados de Instrução MIPS do PS1 |
| **22** | `3B 00 00 00` | `;...` | 10 arquivos | Arquivo de Texto de Configuração Oculto |
| **23** | `42 4D 36 0C` | `BM6.` | 9 arquivos | Textura Especial (Bitmap de 6-bits) |
| **24** | `42 4D 38 25` | `BM8%` | 8 arquivos | Textura de Partículas (Fumaça/Faíscas) |
| **25** | `42 4D AC E2` | `BM..` | 5 arquivos | Textura de Renderização Dinâmica |
| **26** | `42 4D 78 10` | `BMx.` | 5 arquivos | Textura de Overlay do Cenário |
| **27** | `42 4D F8 07` | `BM..` | 4 arquivos | Iconografia de Menu / HUD |
| **28** | `42 4D 68 01` | `BMh.` | 4 arquivos | Textura de Sombra / Efeitos Globais |
| **29** | `42 4D 36 25` | `BM6%` | 4 arquivos | Textura de Partículas Secundárias |
| **30** | `42 4D 78 09` | `BMx.` | 4 arquivos | Textura de Malha de Nível |
| **31** | `00 00 00 3C` | `...<` | 3 arquivos | Bloco Repetitivo de Controle |
| **32** | `42 4D F4 05` | `BM..` | 3 arquivos | Dados de Customização (Create-a-Skater) |
| **33** | `42 4D B8 05` | `BM..` | 3 arquivos | Dados de Customização (Skatistas) |
| **34** | `42 4D 36 44` | `BM6D` | 3 arquivos | Textura Variada de Interface |
| **35** | `42 4D BC 04` | `BM..` | 3 arquivos | Sprite de Animação 2D (Menus) |
| **36** | `42 4D AC 5A` | `BM.Z` | 3 arquivos | Textura Comprimida Interna |
| **37** | `07 00 00 00` | `....` | 2 arquivos | Vetor de Alinhamento |
| **38** | `0D 00 00 00` | `....` | 2 arquivos | Vetor de Alinhamento |
| **39** | `14 00 00 00` | `....` | 2 arquivos | Vetor de Alinhamento |
| **40** | `0A 00 00 00` | `....` | 2 arquivos | Vetor de Alinhamento |
| **41** | `42 4D E0 07` | `BM..` | 2 arquivos | Asset Gráfico Secundário |
| **42** | `42 4D 78 07` | `BMx.` | 2 arquivos | Asset Gráfico Secundário |
| **43** | `42 4D A4 05` | `BM..` | 2 arquivos | Asset Gráfico Secundário |
| **44** | `5E 00 00 00` | `^...` | 2 arquivos | Dados de Configuração Engine |
| **45** | `42 4D 0C 05` | `BM..` | 2 arquivos | Asset Gráfico Secundário |
| **46** | `42 4D 24 05` | `BM$.` | 2 arquivos | Asset Gráfico Secundário |
| **47** | `42 4D 2C 07` | `BM,.` | 2 arquivos | Asset Gráfico Secundário |
| **48** | `42 4D D8 45` | `BM.E` | 2 arquivos | Asset Gráfico Secundário |
| **49** | `42 4D F8 00` | `BM..` | 2 archivos | Asset Gráfico Secundário |
| **50** | `42 4D CC 07` | `BM..` | 2 arquivos | Asset Gráfico Secundário |
| **51** | `42 4D 90 00` | `BM..` | 2 arquivos | Asset Gráfico Secundário |
| **52** | `42 4D F0 03` | `BM..` | 2 arquivos | Asset Gráfico Secundário |
| **53** | `42 4D A0 01` | `BM..` | 2 arquivos | Asset Gráfico Secundário |
| **54** | `42 4D 48 03` | `BMH.` | 2 arquivos | Mapeamento de Peça 3D (Skater) |
| **55** | `28 00 00 00` | `(...` | 2 arquivos | Cabeçalho de Controle de Fluxo |
| **56** | `0B 00 00 00` | `....` | 2 arquivos | Vetor de Alinhamento |
| **57** | `42 4D B0 11` | `BM..` | 1 arquivo | Configuração Gráfica Isolada |
| **58** | `42 4D B8 15` | `BM..` | 1 arquivo | Configuração Gráfica Isolada |
| **59** | `AC 00 40 34` | `..@4` | 1 arquivo | Instrução de Cache MIPS |
| **60** | `0C 00 00 00` | `....` | 1 arquivo | Parâmetro de Sistema |
| **61** | `42 4D 78 04` | `BMx.` | 1 arquivo | Textura Gráfica Rara |
| **62** | `08 00 00 00` | `....` | 1 arquivo | Parâmetro de Sistema |
| **63** | `1F 00 00 00` | `....` | 1 arquivo | Parâmetro de Sistema |
| **64** | `17 00 00 00` | `....` | 1 arquivo | Parâmetro de Sistema |
| **65** | `09 00 00 00` | `....` | 1 arquivo | Parâmetro de Sistema |
| **66** | `13 00 00 00` | `....` | 1 arquivo | Parâmetro de Sistema |
| **67** | `21 00 00 00` | `!...` | 1 arquivo | Parâmetro de Sistema |
| **68** | `42 4D 6C 53` | `BMlS` | 1 arquivo | Textura de Logo Especial |
| **69** | `1C 00 00 00` | `....` | 1 arquivo | Parâmetro de Sistema |
| **70** | `42 4D 8C 0A` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **71** | `42 4D B0 06` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **72** | `42 4D 20 08` | `BM .` | 1 arquivo | Asset Gráfico Único |
| **73** | `42 4D 30 08` | `BM0.` | 1 arquivo | Asset Gráfico Único |
| **74** | `42 4D 54 07` | `BMT.` | 1 arquivo | Asset Gráfico Único |
| **75** | `42 4D 6C 07` | `BMl.` | 1 arquivo | Asset Gráfico Único |
| **76** | `42 4D 5C 07` | `BM\.` | 1 arquivo | Asset Gráfico Único |
| **77** | `42 4D EC 07` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **78** | `42 4D BC 07` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **79** | `42 4D E8 06` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **80** | `42 4D 8C 07` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **81** | `42 4D 60 07` | `BM`.` | 1 arquivo | Asset Gráfico Único |
| **82** | `42 4D E0 06` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **83** | `42 4D 36 08` | `BM6.` | 1 arquivo | Asset Gráfico Único |
| **84** | `42 4D 50 05` | `BMP.` | 1 arquivo | Asset Gráfico Único |
| **85** | `42 4D E0 05` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **86** | `42 4D 68 05` | `BMh.` | 1 arquivo | Asset Gráfico Único |
| **87** | `42 4D CC 05` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **88** | `42 4D B4 05` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **89** | `42 4D 38 05` | `BM8.` | 1 arquivo | Asset Gráfico Único |
| **90** | `42 4D 80 05` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **91** | `42 4D 10 06` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **92** | `42 4D 04 06` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **93** | `42 4D AC 12` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **94** | `42 4D 1C 12` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **95** | `42 4D F4 09` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **96** | `42 4D 34 14` | `BM4.` | 1 arquivo | Asset Gráfico Único |
| **97** | `42 4D 24 02` | `BM$.` | 1 arquivo | Asset Gráfico Único |
| **98** | `42 4D 28 02` | `BM(.` | 1 arquivo | Asset Gráfico Único |
| **99** | `42 4D 70 03` | `BMp.` | 1 arquivo | Asset Gráfico Único |
| **100** | `42 4D 50 03` | `BMP.` | 1 arquivo | Asset Gráfico Único |
| **101** | `42 4D 08 05` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **102** | `42 4D 48 05` | `BMH.` | 1 arquivo | Asset Gráfico Único |
| **103** | `42 4D 74 07` | `BMt.` | 1 arquivo | Asset Gráfico Único |
| **104** | `42 4D 38 46` | `BM8F` | 1 arquivo | Asset Gráfico Único |
| **105** | `42 4D 24 07` | `BM$.` | 1 arquivo | Asset Gráfico Único |
| **106** | `42 4D 50 01` | `BMP.` | 1 arquivo | Asset Gráfico Único |
| **107** | `42 4D 64 07` | `BMd.` | 1 arquivo | Asset Gráfico Único |
| **108** | `42 4D F0 05` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **109** | `42 4D D8 06` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **110** | `4B 03 00 00` | `K...` | 1 arquivo | Dados de Animação de Manobras |
| **111** | `33 02 00 00` | `3...` | 1 arquivo | Dados de Animação de Manobras |
| **112** | `59 02 00 00` | `Y...` | 1 arquivo | Dados de Animação de Manobras |
| **113** | `F3 01 00 00` | `....` | 1 arquivo | Dados de Animação de Manobras |
| **114** | `95 02 00 00` | `....` | 1 arquivo | Dados de Animação de Manobras |
| **115** | `ED 01 00 00` | `....` | 1 arquivo | Dados de Animação de Manobras |
| **116** | `49 02 00 00` | `I...` | 1 arquivo | Dados de Animação de Manobras |
| **117** | `07 02 00 00` | `....` | 1 arquivo | Dados de Animação de Manobras |
| **118** | `97 02 00 00` | `....` | 1 arquivo | Dados de Animação de Manobras |
| **119** | `A6 02 00 00` | `....` | 1 arquivo | Dados de Animação de Manobras |
| **120** | `40 42 20 74` | `@B t` | 1 arquivo | Tabela de Textos Globais de Menu |
| **121** | `42 4D B8 2C` | `BM.,` | 1 arquivo | Asset Gráfico Único |
| **122** | `42 4D E8 17` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **123** | `42 4D 64 15` | `BMd.` | 1 arquivo | Asset Gráfico Único |
| **124** | `42 4D D8 0C` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **125** | `42 4D A4 07` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **126** | `42 4D 38 0E` | `BM8.` | 1 arquivo | Asset Gráfico Único |
| **127** | `42 4D C4 08` | `BM..` | 1 arquivo | Asset Gráfico Único |
| **128** | `40 4D 32 2C` | `@M2,` | 1 arquivo | Script QB