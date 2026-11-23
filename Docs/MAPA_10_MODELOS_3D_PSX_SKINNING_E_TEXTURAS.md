# 🧊 MAPA 10 — Modelos 3D `.PSX`, Skinning (`w=0/1/2`), Polaridade UV da GTE e Texturas BGR555

> **Especificação Binária Definitiva:** Anatomia completa do formato proprietário `.PSX` (`magic 0x00020004`) de skatistas e cenários no *Tony Hawk's Pro Skater 2 (PS1 — `SLUS-01066`)*, sistema de costura de vértices entre malhas, polaridade real de coordenadas UV na GTE do PlayStation 1, quantização BGR555 (8-bit e 4-bit *nibble-packed*) e retratos `s2face*.bmp`.

---

## 1. Anatomia Binária Completa de um Arquivo `.PSX` (`0x00020004`)

Todos os **227 arquivos `.PSX`** em `CD.WAD` (incluindo os 4 modelos por skatista — Style A Hi/Lo e Style B Hi/Lo — e as geometrias de fases como `skhan_l.psx`) obedecem à estrutura abaixo (validada por [`Scripts/psx_skater_lib.js`](../Scripts/psx_skater_lib.js) e [`Scripts/audit_game.js`](../Scripts/audit_game.js)):

```text
+0x0000  uint32  magic       = 0x00020004 (bytes: 04 00 02 00)
+0x0004  uint32  ptrMeta     Offset do bloco de metadados / paletas / texturas VRAM
+0x0008  uint32  numObjs     Número de objetos/nós (tipicamente 16 em skatistas)
+0x000C  Obj[numObjs]        36 bytes cada:
                               +0x04 int32 posX (fixed-point / 256)
                               +0x08 int32 posY (fixed-point / 256)
                               +0x0C int32 posZ (fixed-point / 256)
         uint32  numMeshes   Quantidade de malhas (corresponde aos ossos do .PSH)
         uint32  meshOffs[numMeshes]  Offsets absolutos de cada malha no arquivo

--- Bloco de Malhas (meshOffs[0] .. ptrMeta - 1) ---
  Para cada malha m:
    +0x00 uint16 flags
    +0x02 uint16 nVerts
    +0x04 uint16 nNorms
    +0x06 uint16 nFaces
    +0x08 uint32 boundingRadius (armazenado como rad * 256; deve cobrir maxR dos vértices!)
    +0x0C int16  xmax_div16     (teto de X / 16)
    +0x0E int16  xmin_div16     (piso de X / 16)
    +0x10 int16  ymax_div16     (teto de Y / 16)
    +0x12 int16  ymin_div16     (piso de Y / 16)
    +0x14 int16  zmax_div16     (teto de Z / 16)
    +0x16 int16  zmin_div16     (piso de Z / 16)
    +0x1C Vert[nVerts]          8 bytes cada: { int16 x, int16 y, int16 z, uint16 w }
          Norm[nNorms]          8 bytes cada: normais fixas por vértice
          Face[nFaces]          Comprimento variável (fLen em +0x02):
                                  +0x00 uint16 fl, +0x02 uint16 fLen
                                  +0x04 uint8 rv[4] (índices de vértices)
                                  +0x0B uint8 gpu   (bit 3 = quad, bit 2 = textured)
                                  +0x10 uint32 texId (se texturizado e fLen >= 28)
                                  +0x14 uint8 uv[3 ou 4][2]

--- Bloco de Metadados, CLUTs e Texturas VRAM (a partir de ptrMeta) ---
  Tags tagged-TLV [uint32 tag, uint32 len, payload] até tag == 0xFFFFFFFF
  uint32  meshHashes[numMeshes]       Hashes Neversoft de cada parte (ex.: HEAD, Chest, Pelvis)
  uint32  numTexRefs + uint32[numTexRefs]
  uint32  numPal16                    Paletas 4-bit (16 cores): [uint32 palId + 16×uint16 BGR555] = 36 B cada
  uint32  numPal256                   Paletas 8-bit (256 cores): [uint32 palId + 256×uint16 BGR555] = 516 B cada
  uint32  numTex + uint32 texOffs[numTex]
  Para cada textura t em texOffs[i]:
    +0x04 uint32 palSize (16 ou 256)
    +0x08 uint32 palId   (chave na tabela pal16 ou pal256)
    +0x0C uint32 texIdx  (ID referenciado por face.texId)
    +0x10 uint16 width
    +0x12 uint16 height
    +0x14 uint8  pixels[]  (8-bit: width*height B | 4-bit: ceil(width/2)*height B nibble-packed)
```

---

## 2. Sistema de Skinning por Costura (`w = 0`, `1`, `2`) — Regras de Escultura 3D

No PS1 não existe *vertex shader* de pesos contínuos. A engine Neversoft une as 16 malhas rígidas do esqueleto (`.PSH`) usando o campo `uint16 w` de cada vértice:

| Valor de `w` | Papel na Malha | Regra de Modificação Segura |
| :---: | :--- | :--- |
| **`w = 0`** | **Vértice livre** (rosto, nariz, cabelo, barriga, roupas) | Pode ser esculpido livremente mantendo `rad` e `hdrBbox` atualizados (`recomputeMeshBounds`). |
| **`w = 1`** | **Produtor de costura** em uma malha-pai (ex.: anel do pescoço em `Chest Mesh[8]`, cintura em `Pelvis`/`Stomach`) | Só pode ser movido quando a alteração é **intencional na junta compartilhada** (ex.: barriguinha 3D do Lulao em `Pelvis`/`Stomach`, ou transplante do pescoço fino do Tony Hawk em `Chest Mesh[8]` do Bolsonaro — onde os vértices `w=2` da cabeça acompanham o anel automaticamente!). **Nunca alterar em `HEAD`!** |
| **`w = 2`** | **Consumidor de costura** na malha-filha (`v.y` guarda o índice global no pool de vértices `w=1`!) | **NUNCA MODIFICAR!** Alterar `x/y/z` de um vértice `w=2` quebra o índice de referência `v.y` e provoca rasgos gigantes ou crash visual na articulação! |

### Atualização Obrigatória de Bounding Sphere e Bounding Box (`recomputeMeshBounds`)

Sempre que vértices `w=0` ou `w=1` são movidos, é obrigatório recalcular:
- **`boundingRadius` (`mo + 0x08`):** `Math.max(origRad, Math.ceil((maxR + pad) / 16) * 4096)` (pois o motor testa frustum culling contra `rad / 256`);
- **`hdrBbox` (`mo + 0x0C..0x16`):** `[ceil(xmax/16), floor(xmin/16), ceil(ymax/16), floor(ymin/16), ceil(zmax/16), floor(zmin/16)]`.

---

## 3. Descoberta Crítica: Polaridade Real das UVs na GTE do PlayStation 1

Durante a engenharia reversa dos modelos originais (especificamente `rowley2.psx`, onde a própria Neversoft gravou o texto **`"qilF"`** espelhado horizontalmente na textura do peito para que aparecesse escrito **`"FLIP"`** na tela!), comprovamos a polaridade exata da câmera/GTE do THPS2:

- Ao olhar o skatista **de frente (`-Z`)** no PS1 / DuckStation:
  - Coordenada 3D **`+X`** projeta para a **ESQUERDA da tela do jogador** (`U` cresce: `U ≈ 76..82`);
  - Coordenada 3D **`-X`** projeta para a **DIREITA da tela do jogador** (`U` decresce: `U ≈ 46..51`).
- Consequência prática em **todas** as texturas frontais de peito (`128×64` ou `64×64`):
  - **Qualquer texto ou logo no peito** (`"CIÊNCIA DA COMPUTAÇÃO"`, `"Uber"`, `"99"`, `"LACTA"`, `"SAN MICHEL"`) **DEVE ser desenhado espelhado horizontalmente (`flipX: true` em `drawBitmapText`)** para ser lido da **esquerda para a direita** no jogo real!
  - **Posicionamento assimétrico no peito:** lado esquerdo da tela (peito direito do skatista) → **`U > 64`** (ex.: `"Uber"` em `U=69`); lado direito da tela (peito esquerdo do skatista) → **`U < 64`** (ex.: `"99"` em `U=56`, `"LACTA"` em `U=54`, `"SAN MICHEL"` em `U=56`).
  - O renderizador de QA `renderPs1SkaterPreview` em [`Scripts/psx_skater_lib.js`](../Scripts/psx_skater_lib.js) usa projeção exata **`sx = ox - rx * sc`**, reproduzindo 1:1 a orientação real do DuckStation antes mesmo de compilar a ISO.

---

## 4. Quantização BGR555 (8-bit 256 Cores & 4-bit 16 Cores) e Regra Anti-`0x0000`

A GPU do PlayStation 1 usa cores de **15 bits BGR555** (`0BBBBBGGGGGRRRRR` em `uint16_le`):

```c
uint16_t bgr555 = ((r >> 3) & 0x1F)
                | (((g >> 3) & 0x1F) << 5)
                | (((b >> 3) & 0x1F) << 10);
if (bgr555 == 0x0000) bgr555 = 0x0421; // PROIBIDO emitir 0x0000 em pixel opaco!
```

### Três Regras Críticas de Paletas (CLUT) no THPS2
1. **Regra Anti-`0x0000` (Buraco Transparente):** no hardware PS1, o valor `0x0000` na CLUT significa **pixel 100% transparente**. Qualquer pixel preto opaco (ex.: terno preto, kimono, cabelo preto) deve ser codificado no mínimo como `0x0421` (`RGB(8,8,8)`), nunca `0x0000`!
2. **Texturas de Mãos com Transparência Real:** as texturas de mãos (`64×32` ou `64×16`) contêm transparência legítima (`0x0000`) entre os dedos. Ao clarear/recolorir mãos (`buildFairHandsRgba`), preservamos exatamente o índice `0x0000` original.
3. **Texturas 4-bit `16` Cores (*Nibble-Packed*):** diversos modelos (ex.: calças `tex[1]` `64×128` em `mullen.psx` `0xa9d25833` e `mullen2b.psx` `0x1850b7b3`) utilizam **paletas de 16 cores (4 bits por pixel)** empacotadas em `Math.ceil(w/2) * h` bytes:
   - **Nibble baixo (`byte & 0x0F`)** = pixel par (`x`);
   - **Nibble alto (`byte >> 4`)** = pixel ímpar (`x + 1`).
   - `quantize4BitForPsx` em `psx_skater_lib.js` aplica median-cut de 16 cores + Floyd-Steinberg suave + empacotamento nibble sem jamais emitir `0x0000` indevido.

---

## 5. Anatomia dos Retratos de Seleção (`s2face*.bmp` — `4.088 B`)

Todos os 19 retratos de skatistas (`s2face0.bmp`..`s2face18.bmp`) possuem estrutura idêntica:
- **Formato:** Windows BMP **8-bit indexado** (`62×47` pixels, *row stride* alinhado a 4 bytes = `64 B/linha`, ordem *bottom-up*, header `54 B` + paleta `1.024 B` + pixels `3.008 B` + padding = **exatos `4.088 bytes`**).
- **Moldura e Janela Interna:** a moldura metálica chanfrada ocupa a borda externa; a foto do rosto ocupa exclusivamente o retângulo interno **`x ∈ [7..52]` (`46 px`) × `y ∈ [4..39]` (`36 px`)**.
- **Chave de Transparência Magenta (`#FF00FF`):** os 4 cantos arredondados da moldura usam um **índice de paleta específico de cada arquivo** apontando para `BGR(255, 0, 255)` (ex.: `idx 5` em `s2face2`, `idx 39` em `s2face3`, `idx 26` em `s2face4`, `idx 0` em `s2face9`, `idx 18` em `s2face10`, `idx 7` em `s2face11`). `buildPortraitBmpFromInner46x36` trava esse índice e todas as cores da moldura original antes de alocar os slots restantes da paleta para o rosto!
- **Gravação Dupla Obrigatória:** cada retrato precisa ser atualizado **tanto em `CD.WAD` (entrada solta) quanto dentro de `options.pre` (`CD.WAD[45]`)** no offset exato correspondente — veja a tabela completa no [MAPA 11](MAPA_11_SKATISTAS_CUSTOMIZADOS_E_PIPELINE_ARTE.md).
