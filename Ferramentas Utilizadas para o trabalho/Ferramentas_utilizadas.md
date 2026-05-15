# 🛠️ Ferramentas Utilizadas no Projeto

Este documento detalha o ecossistema de ferramentas necessário para a extração, análise, modificação e remontagem dos arquivos do jogo **Tony Hawk's Pro Skater 2 (PSX)**. O objetivo é a manipulação total dos ativos para fins didáticos.

---

## 🏗️ 1. Infraestrutura e Dependências
Antes de baixar as ferramentas específicas, é necessário preparar o ambiente com as linguagens de execução.

### **Java Runtime Environment (JRE/JDK)**
* **Utilidade:** Necessário para rodar o **Ghidra** e o **jPSXdec**.
* **Como baixar:** [Download Oracle JDK](https://www.oracle.com/java/technologies/downloads/) ou [OpenJDK](https://adoptium.net/).

### **Python 3.x**
* **Utilidade:** Utilizado para a criação de scripts de automação (como o `ler_toc.py`) e ferramentas customizadas de extração do arquivo `CD.WAD`.
* **Como baixar:** [Python.org](https://www.python.org/downloads/).

---

## 🎮 2. Emulação e Diagnóstico
Ferramentas para executar o jogo e observar o comportamento da memória e dos arquivos em tempo real.

<table>
  <tr>
    <td><strong>Ferramenta</strong></td>
    <td><strong>Descrição e Uso</strong></td>
    <td><strong>Download</strong></td>
  </tr>
  <tr>
    <td><strong>DuckStation</strong></td>
    <td>O melhor emulador para desenvolvimento. Permite visualizar o log do console, depurar memória e testar as modificações rapidamente.</td>
    <td><a href="https://www.duckstation.org/">Site Oficial</a></td>
  </tr>
</table>

---

## 💿 3. Manipulação da Imagem de Disco
A primeira etapa consiste em abrir a imagem `.bin/.cue` e extrair o sistema de arquivos visível.

<table>
  <tr>
    <td><strong>Ferramenta</strong></td>
    <td><strong>Descrição e Uso</strong></td>
    <td><strong>Download</strong></td>
  </tr>
  <tr>
    <td><strong>CDmage</strong></td>
    <td>Utilizada para importar/exportar arquivos dentro da imagem do disco sem corromper os setores. Essencial para reinserir arquivos modificados.</td>
    <td><a href="https://www.romhacking.net/utilities/1437/">RomHacking.net</a></td>
  </tr>
</table>

---

## 🔍 4. Extração e Análise de Ativos (Media)
Após extrair os arquivos do disco, usamos estas ferramentas para converter formatos proprietários do PS1 (STR, XA, TIM) em formatos editáveis (AVI, WAV, PNG).

<table>
  <tr>
    <td><strong>Ferramenta</strong></td>
    <td><strong>Descrição e Uso</strong></td>
    <td><strong>Download</strong></td>
  </tr>
  <tr>
    <td><strong>jPSXdec</strong></td>
    <td>Ferramenta baseada em Java para visualizar e converter vídeos (STR) e imagens do PlayStation. É a mais precisa para extrair frames sem perda de qualidade.</td>
    <td><a href="https://github.com/m35/jpsxdec">GitHub</a></td>
  </tr>
  <tr>
    <td><strong>VGMTrans</strong></td>
    <td>Utilizada para analisar arquivos de música sequencial e extrair amostras sonoras (DLS/SF2) e sequências MIDI.</td>
    <td><a href="https://github.com/vgmtrans/vgmtrans/releases">GitHub</a></td>
  </tr>
</table>

---

## 🧠 5. Engenharia Reversa e Modificação Binária
Aqui entramos na lógica do jogo: edição de textos, valores hexadecimais e descompilação do executável (`SLUS_010.91`).

<table>
  <tr>
    <td><strong>Ferramenta</strong></td>
    <td><strong>Descrição e Uso</strong></td>
    <td><strong>Download</strong></td>
  </tr>
  <tr>
    <td><strong>HxD</strong></td>
    <td>Editor hexadecimal para busca de strings (textos) e alteração direta de bytes no executável ou nos arquivos de dados do jogo.</td>
    <td><a href="https://mh-nexus.de/en/hxd/">Site Oficial</a></td>
  </tr>
  <tr>
    <td><strong>Ghidra</strong></td>
    <td>Desenvolvido pela NSA, é usado para descompilar o código MIPS do PS1, permitindo entender como o jogo lê o arquivo <code>CD.WAD</code> e processa a física.</td>
    <td><a href="https://ghidra-sre.org/">Ghidra-SRE</a></td>
  </tr>
</table>

---

## 🎨 6. Edição de Áudio e Texturas
Ferramentas para modificar os arquivos que foram extraídos antes de prepará-los para a reinserção.

<table>
  <tr>
    <td><strong>Ferramenta</strong></td>
    <td><strong>Descrição e Uso</strong></td>
    <td><strong>Download</strong></td>
  </tr>
  <tr>
    <td><strong>Audacity</strong></td>
    <td>Editor de áudio para processar as trilhas sonoras e efeitos de som antes de convertê-los de volta para o formato XA/VAG do PS1.</td>
    <td><a href="https://www.audacityteam.org/">Site Oficial</a></td>
  </tr>
  <tr>
    <td><strong>FastStone Photo Resizer</strong></td>
    <td>Útil para redimensionar em massa e converter texturas do jogo para a paleta de cores correta exigida pelo hardware do PS1.</td>
    <td><a href="https://www.faststone.org/FSResizerDownload.htm">Site Oficial</a></td>
  </tr>
  <tr>
    <td><strong>PSX XA Audio Tool</strong></td>
    <td>Ferramenta específica para converter arquivos WAV de volta para o formato de áudio comprimido XA utilizado no Tony Hawk's.</td>
    <td><a href="https://www.romhacking.net/utilities/1070/">RomHacking.net</a></td>
  </tr>
</table>

---

## 🚀 Próximos Passos Sugeridos
* **TIM2View:** Para visualizar e editar as paletas de cores das imagens `.TIM` (texturas do cenário).
* **Blender (com plugins de PS1):** Caso avance para a modificação dos modelos 3D dos skatistas ou das pistas.