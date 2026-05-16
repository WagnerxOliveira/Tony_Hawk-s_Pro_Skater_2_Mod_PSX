# Extração de Arquivos Originais com CDMage

Para iniciar qualquer modificação (modding) no **Tony Hawk's Pro Skater 2** do PlayStation 1, o primeiro passo é extrair os ficheiros internos do jogo. Nós faremos isso a partir da imagem do CD original, utilizando o programa **CDMage**. 

O CDMage é a ferramenta ideal para esta tarefa porque ele entende perfeitamente a estrutura de setores dos CDs de PS1, garantindo que nenhum ficheiro (como o executável ou os blocos de dados) seja corrompido durante a extração.

Abaixo, confira o passo a passo detalhado:

---

### Passo 1: Os Ficheiros do Jogo
Antes de abrir qualquer programa, certifique-se de que possui a imagem original do jogo no seu computador. Geralmente, ela vem dividida em dois ficheiros: um `.bin` (que contém os dados pesados) e um `.cue` (que é um ficheiro de texto pequeno a funcionar como um "mapa" do CD).

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/00.png" alt="Arquivos originais bin e cue" width="800">
</div>

### Passo 2: Aceder ao CDMage
Abra o programa **CDMage**. Verá um ecrã em branco dividido em dois painéis. É aqui que a estrutura do disco será montada.

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/01.png" alt="Tela inicial do CDMage" width="800">
</div>

Vá até ao menu superior esquerdo e clique em **File** e depois em **Open...** (Também pode utilizar o atalho de teclado `Ctrl + O`).

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/02.png" alt="Menu File Open no CDMage" width="400">
</div>

### Passo 3: Carregar o Ficheiro Correto
Na janela que se abrir, navegue até à pasta onde guardou o jogo original. 
**Atenção:** Selecione sempre o ficheiro com a extensão **`.cue`**. É ele que dirá ao programa como ler as faixas de dados corretamente. Clique em "Abrir".

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/03.png" alt="Selecionando o arquivo cue" width="600">
</div>

### Passo 4: Explorar o Disco
Após o carregamento, a estrutura do CD vai aparecer no painel da esquerda. Verá algo como `Session 1` e, logo abaixo, o `Track 1` (Faixa 1).

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/04.png" alt="Estrutura da imagem carregada" width="800">
</div>

Clique no **`Track 1`**. Ao fazer isso, o painel da direita será preenchido com todos os ficheiros que rodam dentro do seu PlayStation 1. Verá ficheiros importantes como o `CD.WAD` (onde ficam as texturas e modelos) e o `SLUS_010.66` (o motor do jogo).

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/05.png" alt="Arquivos internos do jogo" width="800">
</div>

### Passo 5: Selecionar os Ficheiros para Extração
Para extrair tudo, selecione todos os ficheiros que apareceram no painel da direita. Pode clicar no primeiro ficheiro, segurar a tecla `Shift` no teclado e clicar no último, ou apenas pressionar o atalho `Ctrl + A`. Todos eles ficarão destacados a azul.

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/06.png" alt="Selecionando todos os arquivos da lista" width="800">
</div>

Com tudo selecionado, clique com o botão direito do rato em cima de qualquer ficheiro da seleção e escolha a opção **Extract Files...** (Extrair Ficheiros...).

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/07.png" alt="Opção Extract Files no menu" width="600">
</div>

### Passo 6: Configurar o Local de Destino
Uma nova janela de opções aparecerá. No campo superior chamado **Extract files to:**, deve escolher a pasta para onde os ficheiros irão. 
*Recomendação:* Aponte para a pasta `Arquivos Extraídos - CDmage` dentro do seu diretório de trabalho no VS Code. Mantenha todas as outras opções exatamente como estão e clique no botão **Extract**.

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/08.png" alt="Janela de opções de extração" width="400">
</div>

### Passo 7: Aguardar a Extração
O CDMage começará a copiar os ficheiros do formato ISO/BIN para o seu Windows. Poderá acompanhar o progresso através de uma barra azul no canto inferior direito do ecrã.

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/09.png" alt="Barra de progresso da extração" width="800">
</div>

Quando o processo terminar, uma pequena janela aparecerá com a mensagem **"Extraction completed successfully."** (Extração concluída com sucesso). Isso significa que tudo ocorreu bem e nenhum ficheiro foi perdido ou corrompido. Clique em **OK**.

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/10.png" alt="Mensagem de sucesso da extração" width="300">
</div>

### Passo 8: Verificação Final
Pronto! Agora pode fechar o CDMage e abrir o explorador de ficheiros (ou o seu VS Code). Todos os ficheiros originais do jogo estarão lá, prontos para serem analisados e modificados nos próximos passos do nosso projeto.

<div align="center">
  <img src="imgs/imgs_arquivos_extraidos_cdmage/11.png" alt="Arquivos extraídos na pasta de destino" width="800">
</div>