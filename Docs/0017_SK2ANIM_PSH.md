# 🦴 Arquitetura Esqueletal e Rigging (Neversoft Engine)

> **Documento de Engenharia:** Análise didática da estrutura de animação 3D, hierarquia de ossos (Nodes) e manipulação hexadecimal no ecossistema do *Tony Hawk's Pro Skater 2* (PSX).

Durante o processo de decodificação dos scripts lógicos (`.qb`), identificamos os arquivos com o sufixo `_PSH` (*PlayStation Header*). Este documento utiliza o arquivo **`0017_9AC27C8D.qb`** (referente ao skatista Bob Burnquist) como objeto de estudo para mapear como o jogo constrói o esqueleto dos personagens na memória RAM do console.

---

## 🧬 O Paradigma da Animação 3D (Nodes e Hierarquia)

Na *Neversoft Engine*, um skatista não é um bloco sólido de polígonos. Ele é construído como uma "marionete" digital, composta por várias partes independentes chamadas de **Nós (Nodes)**. 

Para que a animação funcione perfeitamente (cinemática), esses nós obedecem a um sistema de **Pai e Filho (`parent`)**:
* Se o **Pai** (Coxa) se move, o **Filho** (Canela) se move junto.
* O ponto zero do jogo, ou seja, o "Chão/Mundo", é chamado de **`Scene Root`**. Ele é o Pai supremo de onde o personagem nasce.

---

## 🗺️ A Ponte: TXT vs. Hexadecimal (HxD)

O arquivo `.txt` gerado pelos nossos scripts extratores funciona como um mapa para o arquivo binário bruto visualizado no programa **HxD**. A *engine* foi programada utilizando definições de linguagem C/C++, e os desenvolvedores deixaram o texto em formato ASCII puro no meio do código de máquina.

Ao abrir o arquivo `.qb` no HxD, a coluna da direita (Texto Decodificado) revela o seguinte padrão de arquitetura:

1. **A Definição (`#define`):** O jogo declara a existência de um osso. 
   * *Exemplo:* `define SK2ANIMPART_BURNQ_RIGHT_THIGH` (Cria a coxa direita).
2. **O Vínculo (`// parent:`):** Logo após definir o osso, o código aponta para quem ele deve seguir.
   * *Exemplo:* `parent: burnq_pelvis` (A coxa segue a pélvis).

### 📋 Mapeamento Completo do Esqueleto (Anatomia THPS2)

Através do cruzamento de dados do `.txt` com o Offset do `HxD`, mapeamos a árvore genealógica inteira do modelo 3D. 

Abaixo está o dicionário exato de vínculos que a *engine* lê de cima para baixo:

#### 1. Eixo Central e Tronco
| Nome do Osso (Node) | Segue o Movimento de (`parent`) | Tamanho do Pai (Bytes) | Função Visual |
| :--- | :--- | :---: | :--- |
| `burnq_pelvis` (Pélvis) | `Scene Root` | 10 bytes | Eixo gravitacional do skatista. |
| `burnq_stomach` (Estômago) | `burnq_pelvis` | 12 bytes | Dobra abdominal para agachamentos. |
| `burnq_chest` (Peito) | `burnq_stomach` | 13 bytes | Rotação do tronco superior. |
| `burnq_head` (Cabeça) | `burnq_chest` | 11 bytes | Acompanha a direção do corpo. |

#### 2. Membros Inferiores (Pernas)
| Nome do Osso (Node) | Segue o Movimento de (`parent`) | Tamanho do Pai (Bytes) | Função Visual |
| :--- | :--- | :---: | :--- |
| `burnq_right_thigh` (Coxa Dir.)| `burnq_pelvis` | 12 bytes | Articulação superior da perna. |
| `burnq_right_shin` (Canela Dir.)| `burnq_right_thigh` | 17 bytes | Articulação do joelho direito. |
| `burnq_right_shoe` (Sapato Dir.)| `burnq_right_shin` | 16 bytes | Ponto de contato com a lixa do skate. |
| *(O mesmo padrão se repete simetricamente para o lado esquerdo: `left_thigh`, `left_shin`, `left_shoe`)* |

#### 3. Membros Superiores (Braços)
| Nome do Osso (Node) | Segue o Movimento de (`parent`) | Tamanho do Pai (Bytes) | Função Visual |
| :--- | :--- | :---: | :--- |
| `burnq_right_bicep` (Bíceps) | `burnq_chest` | 11 bytes | Rotação do ombro. |
| `burnq_right_forearm` (Antebraço)| `burnq_right_bicep` | 17 bytes | Articulação do cotovelo. |
| `burnq_right_hand` (Mão) | `burnq_right_forearm`| 19 bytes | Utilizada para manobras de *Grab*. |

#### 4. O Skate e Acessórios (Props)
Uma sacada de mestre da *Neversoft*: o skate não é um veículo à parte, ele faz parte do esqueleto do skatista!
| Nome do Osso (Node) | Segue o Movimento de (`parent`) | Tamanho do Pai (Bytes) | Função Visual |
| :--- | :--- | :---: | :--- |
| `burnq_board` (Prancha/Shape) | `Scene Root` | 10 bytes | Segue o chão (Mundo 3D). |
| `burnq_front_wheel` (Rodas Diant.)| `burnq_board` | 11 bytes | Acompanha o *Shape*. |
| `burnq_back_wheel` (Rodas Tras.) | `burnq_board` | 11 bytes | Acompanha o *Shape*. |

---

## ⚙️ A Regra de Ouro do Modding Hexadecimal

Para manipular essas conexões no HxD e criar modificações na física, existe uma regra absoluta de arquitetura de memória do PS1: **A massa (tamanho) do arquivo NUNCA pode ser alterada.** Se o arquivo original possui `1422 bytes`, o modificado deve manter exatamente `1422 bytes`.
* ❌ **Proibido usar `Backspace`, `Delete` ou `Enter`** (Altera o tamanho estrutural e causa travamento do jogo).
* ✅ **Obrigatório Sobrescrever:** Você clica antes da palavra e digita por cima.
* ✅ **Preenchimento de Segurança:** Se a sua nova palavra for menor que a original, você **deve preencher a diferença com a Barra de Espaço** para igualar os bytes.

---

## 🛹 Tutorial Prático: O Mod do "Hoverboard" (Rodas Invisíveis)

Para demonstrar a aplicação prática desse mapeamento, vamos alterar a hierarquia do skate para criar um efeito de *Hoverboard* (Skatista flutuando apenas no shape, sem as rodas).

**A Lógica:**
Originalmente, as rodas (`WHEEL`) têm como pai a prancha (`burnq_board`). Vamos desvincular as rodas da prancha e prendê-las no ponto zero do mundo (`Scene Root`). Assim, quando a prancha andar, as rodas ficarão travadas no chão lá no início da fase.

**O Passo a Passo no HxD:**
1. Abra o arquivo original (Ex: `0017_9AC27C8D.qb`) no HxD.
2. Aperte **`Ctrl + F`** e busque por `parent: burnq_board`.
3. O HxD vai focar na área onde as rodas são definidas (próximo ao final do arquivo).
4. Na coluna de texto à direita, clique exatamente antes do `b` de `burnq_board`.
5. Digite a sua nova âncora: `Scene Root`.
6. **Atenção ao Preenchimento:**
   * A palavra original `burnq_board` tem **11 letras** (11 bytes).
   * A nova palavra `Scene Root` tem **10 letras** (10 bytes).
   * Aperte a **Barra de Espaço uma vez** ao final para inteirar os 11 bytes (`Scene Root `).
7. O texto modificado ficará vermelho. Pressione **`Ctrl + S`** para salvar.
8. Recompile o `.WAD`, e ao iniciar a fase, o skatista estará surfando no ar!