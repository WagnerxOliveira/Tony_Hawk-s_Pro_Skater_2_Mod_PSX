# 🛹 Tony Hawk's Pro Skater 2 Mod - PSX

<p align="center">
  <b>Construindo um Mod para o jogo do console de PlayStation 1, para fins didáticos. Aprendendo diversas alterações no game original com engenharia reversa.</b>
</p>

---

## 🎯 Sobre o Projeto
Este repositório é uma iniciativa educacional focada na engenharia reversa e modificação (modding) de um dos maiores clássicos do PlayStation 1. O objetivo principal é aplicar conceitos práticos de Ciência da Computação para entender a fundo como os dados eram estruturados na quinta geração de consoles.

O projeto abrange desde a análise estrutural da memória até a criação de scripts em Python para automatizar a leitura, o corte e a extração de tabelas de arquivos complexos, com foco principal no desempacotamento do arquivo `CD.WAD`.

## 🚀 Objetivos e Escopo
* **Extração de Dados:** Desenvolver e utilizar ferramentas para ler a Tabela de Conteúdo (TOC) e extrair os ativos originais do disco.
* **Modificação Binária:** Alterar strings, valores hexadecimais e mídia (áudio/texturas) para mapear o comportamento da engine do jogo.
* **Engenharia Reversa:** Utilizar descompiladores e editores de memória para entender a lógica do executável.
* **Testes e Emulação:** Garantir que o mod rode perfeitamente em emuladores precisos (como o DuckStation), validando as modificações na experiência clássica de proporção 4:3.

## 📂 Estrutura do Repositório
* `/` **(Raiz):** Scripts de desenvolvimento, automação e documentação principal.
* `Arquivos Originais - PSX/`: Diretório estruturado via Git LFS contendo as imagens base `.bin` e `.cue` para o ambiente de desenvolvimento local.
* `Ferramentas Utilizadas para o trabalho/`: Documentação da suíte de softwares necessários para reproduzir as alterações.

## 🛠️ Tecnologias e Ferramentas
O projeto utiliza um ecossistema variado de ferramentas de extração e análise profunda. Para visualizar a lista completa (incluindo **Ghidra**, **HxD**, **CDmage**, **jPSXdec**, entre outras) e aprender a configurar o seu próprio ambiente, consulte nossa documentação dedicada:

👉 **[Acesse o Guia de Ferramentas Utilizadas](Ferramentas%20Utilizadas%20para%20o%20trabalho/Ferramentas_utilizadas.md)**

---
*Aviso Legal: Este é um projeto de pesquisa independente, estritamente didático e sem fins lucrativos. Todos os direitos da marca Tony Hawk's Pro Skater e seus respectivos ativos originais pertencem à Activision.*
