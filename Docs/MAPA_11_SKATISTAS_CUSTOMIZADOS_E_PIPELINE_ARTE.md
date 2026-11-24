# 🎨 MAPA 11 — Os 7 Skatistas Personalizados, Mapeamento Real de Retratos e Pipeline de Arte 3D

> **Catálogo Cirúrgico do Mod (v2.0):** Documentação completa dos **7 skatistas personalizados** (**28 modelos 3D `.PSX`** em Style A & B + **7 retratos `s2face*.bmp`** + renomeações em `SLUS_010.66`), tabela definitiva de mapeamento real de retratos e guia de uso de [`Scripts/psx_skater_lib.js`](../Scripts/psx_skater_lib.js).

---

## 1. Alerta Técnico Crítico: Por Que `Slot ≠ s2faceN.bmp` no THPS2!

Na tabela mestre de skatistas em `SLUS_010.66` (`0x0C4398..0x0C5220`), a Neversoft numerou os arquivos `s2face*.bmp` em **ordem alfabética de sobrenome original** — movendo Tony Hawk (`s2face5.bmp`) para o `Slot 0` e invertendo Chad Muska (`s2face8.bmp`) com Rodney Mullen (`s2face9.bmp`). Portanto, **nunca assuma que `Slot N` usa `s2faceN.bmp`!**

### Tabela Definitiva Verificada (`SLUS_010.66` ↔ `CD.WAD` ↔ `options.pre`)

| Slot | Nome no Mod (`SLUS`) | Base 3D (`.PSX` × 4) | Retrato Real (`SLUS`) | `CD.WAD idx` | Offset `options.pre` | `magIdx` (`#FF00FF`) | Status no Mod |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `0` | Tony Hawk | `hawk2*` | `s2face5.bmp` (`0x0C44BC`) | `373` | `+0x286DC` | `22` | Original intacto |
| **`1`** | **Silvio Santos** | `burnq2`, `burnq_L`, `burnq2b`, `burnq2bL` | **`s2face1.bmp`** (`0x0C45C8`) | **`369`** | **`+0x246BC`** | **`21`** | ✅ **Customizado** (`silvio.png` + **Mic 3D**) |
| **`2`** | **Lulao** | `cab`, `cab_L`, `cab2b`, `cab2b_L` | **`s2face2.bmp`** (`0x0C46E0`) | **`370`** | **`+0x256C4`** | **`5`** | ✅ **Customizado** (`lulao.png`) |
| **`3`** | **Bolsonaro** | `campb2`, `campb2_L`, `campb2b`, `campb2bL` | **`s2face3.bmp`** (`0x0C47F4`) | **`371`** | **`+0x266CC`** | **`39`** | ✅ **Customizado** (`bolsonaro.png` + `bolsonaro_rosto.png`) |
| **`4`** | **Wagner Oliver** | `glif2`, `glif_L`, `glif2b`, `glif2b_L` | **`s2face4.bmp`** (`0x0C4910`) | **`372`** | **`+0x276D4`** | **`26`** | ✅ **Customizado** (`wagner.png`) |
| `5` | Eric Koston | `koston*` | `s2face6.bmp` (`0x0C4A28`) | `374` | `+0x296E4` | `11` | Original intacto |
| `6` | Bucky Lasek | `lasek2*` | `s2face7.bmp` (`0x0C4B30`) | `375` | `+0x2A6EC` | `0` | ✅ **Original Redump intacto** |
| **`7`** | **Francis Paulo** | `mullen`, `mullen_L`, `mullen2b`, `mulln2bL` | **`s2face9.bmp`** (`0x0C4C58`) | **`377`** | **`+0x2C6FC`** | **`0`** | ✅ **Customizado** (`francis.png`) |
| `8` | Borsato | `muska2*` | `s2face8.bmp` (`0x0C4D84`) | `376` | `+0x2B6F4` | `14` | Original intacto |
| **`9`** | **Valter Pacheco** | `rynld2`, `rynld_L`, `rynld2b`, `rynld2bL` | **`s2face10.bmp`** (`0x0C4EA0`) | **`378`** | **`+0x2D708`** | **`18`** | ✅ **Customizado** (`valter.jpg` restaurada) |
| **`10`** | **Natan Oliver** | `rowley2`, `rowley_L`, `rowley2b`, `rowly2bL` | **`s2face11.bmp`** (`0x0C4FA8`) | **`379`** | **`+0x2E714`** | **`7`** | ✅ **Customizado** (`natan.jpg`) |
| `11` | Elissa Steamer | `steam2*` | `s2face12.bmp` (`0x0C50E0`) | `380` | `+0x2F720` | `3` | Original intacto |
| `12` | Joao Paulo | `thomas2*` | `s2face13.bmp` (`0x0C5210`) | `381` | `+0x3072C` | `7` | Original intacto |

> **Blindagem Automática:** o Estágio 4 de [`Scripts/audit_game.js`](../Scripts/audit_game.js) faz **validação cruzada dinâmica** lendo `SLUS_010.66` em tempo real e exigindo que cada retrato auditado coincida exatamente com o arquivo apontado para o respectivo skatista + que `s2face7.bmp` (Bucky Lasek) permaneça 100% original Redump.

---

## 2. Ficha Técnica Detalhada dos 7 Skatistas Personalizados (28 Modelos `.PSX`)

### Slot 1 — **Silvio Santos** *(ex-Bob Burnquist)* ([`Scripts/mod_skater_silvio.js`](../Scripts/mod_skater_silvio.js))
- **Modelos (`CD.WAD`):** `burnq2.psx` (`387`, `60.244 → 61.404 B`, mesmos `30` setores), `burnq_L.psx` (`1010`, `51.932 → 53.092 B`, mesmos `26` setores), `burnq2b.psx` (`431`, `58.016 B` exatos), `burnq2bL.psx` (`1012`, `50.840 B` exatos).
- **Renomeação `SLUS_010.66` (preservando `\X\BURNQUIS.STR;1`):** `0x0C44EC` `"Silvio Santos"`, `0x0C44FC` `"Sil"`, `0x0C8688` `"Silvio Santos"`, `0x0A17D8` `"Brazil's Silvio Santos"`, `0x0C459C` `"Can't Stop SS"`.
- **Microfone de Peito 3D Geométrico Real em `Chest Mesh[8]` (Style A Hi & Lo-LOD):**
  - Injeção cirúrgica de **`+23` vértices `w=0`**, **`+41` normais** (mantendo estritamente `nN === nV + nF` com remapeamento `normIdx += 23` nas faces originais) e **`+18` primitivas `POLY_FT3`/`POLY_FT4` de 36 B** (`+1.160 B` exatos, deslocando `ptrMeta`, `meshOffs[9..18]` e `texOffs[0..10]` sem alterar nenhum offset do `CD.WAD`!).
  - Inclui globo metálico facetado (4 tris superiores + 3 quads cinta equatorial cromada + 3 quads funil inferior), haste cilíndrica afilada acompanhando a inclinação de `~25,7°` do peito (zero vão lateral!) + base fechada e presilha horizontal cromada 3D; texturizado via atlas metálico dedicado em `U=16..31` de `texIdx=6` (`32×32 16c`, com UVs da copa do cabelo de `Mesh[15]` remapeadas para `U=0..14`).
- **Escultura 3D da Cabeça (`HEAD Mesh[15]`):** remoção completa do chapéu pescador (*bucket hat*, `0xF5CF6046`) no Style A e do capacete preto (`0x9504086E`) no Style B, esculpindo o topete castanho-escuro penteado para trás e rosto sorridente de `silvio.png` (travando `w=2`).
- **Roupas & Retrato:** **Style A** — terno azul-marinho 2 botões, camisa branca em V, gravata, lenço branco de bolso (`flipX: true`), mangas compridas com punho branco e sapatos sociais; **Style B** — camisa havaiana azul-royal florida com balão amarelo/palmeiras/hibiscos, antebraços pele clara com relógio preto (sem cotoveleiras), bermuda xadrez e pernas limpas (sem joelheiras); retrato `s2face1.bmp` (`magIdx = 21`) com fundo de estúdio suavizado via flood-fill.
- **Vozes:** **13 clipes rotativos SPU-ADPCM** em `VOICES.DAT` ([MAPA 12](MAPA_12_ENGINE_MOD_MIPS_VOICES_E_BOOT_ALEATORIO.md)).

### Slot 2 — **Lulao** ([`Scripts/mod_skater_lulao.js`](../Scripts/mod_skater_lulao.js))
- **Modelos (`CD.WAD`):** `cab.psx` (`389`), `cab_L.psx` (`986`), `cab2b.psx` (`433`), `cab2b_L.psx` (`988`).
- **Renomeação `SLUS_010.66`:** `0x0C45F0` `"Lulao"`, `0x0C4600` `"Lulao"`, `0x0C8698` `"Lulao"`.
- **Escultura 3D:** cabeça (`HEAD` `0x0f88a1f8` Style A / `0x9504086e` Style B) com remoção do boné original + **barriguinha 3D anatômica** esculpida de forma contínua em `Pelvis`/`Stomach` (`w1ok`) e `Chest` (`w0only`) com recálculo de `rad`/`hdrBbox`.
- **Roupas:** **Style A** — terno social escuro + gravata + faixa presidencial verde-amarela; **Style B** — uniforme listrado de presidiário.
- **Vozes:** 14 clipes rotativos SPU-ADPCM em `VOICES.DAT` ([MAPA 12](MAPA_12_ENGINE_MOD_MIPS_VOICES_E_BOOT_ALEATORIO.md)).

### Slot 3 — **Bolsonaro** ([`Scripts/mod_skater_bolsonaro.js`](../Scripts/mod_skater_bolsonaro.js))
- **Modelos (`CD.WAD`):** `campb2.psx` (`391`), `campb2_L.psx` (`1030`), `campb2b.psx` (`435`), `campb2bL.psx` (`1032`).
- **Renomeação `SLUS_010.66`:** `0x0C4714` `"Bolsonaro"`, `0x0C4724` `"Bolso"`, `0x0C86A8` `"Bolsonaro"`.
- **Escultura 3D & Transplante de Pescoço:**
  - `HEAD Mesh[15]` (`0x7806eefa`): remoção do boné + reconstrução simétrica do crânio com cabelo curto 360° e textura facial `bolsonaro_rosto.png`; retrato `s2face3.bmp` com a foto rindo (`bolsonaro.png`).
  - **Transplante do Pescoço Anatômico do Tony Hawk (`hawk2.psx`):** os vértices `w=1` do colar largo de dreadlocks de Kareem Campbell em `Chest Mesh[8]` (`0x8d486d4f` — `8v` Hi-LOD / `6v` Lo-LOD) foram substituídos pelo anel fino anatômico de 5 pontos do Tony Hawk, mantendo braços e estômago (`w=2`) 100% intactos.
- **Roupas:** **Style A** — terno azul-marinho + faixa presidencial verde-amarela; **Style B** — uniforme listrado `"171"`. Mãos recoloridas para pele clara.
- **Vozes:** 14 clipes rotativos SPU-ADPCM em `VOICES.DAT`.

### Slot 4 — **Wagner Oliver** ([`Scripts/mod_skater_wagner.js`](../Scripts/mod_skater_wagner.js))
- **Modelos (`CD.WAD`):** `glif2.psx` (`393`), `glif_L.psx` (`994`), `glif2b.psx` (`437`), `glif2b_L.psx` (`996`).
- **Escultura 3D:** `HEAD Mesh[15]` (`0xe15f10ff`) com **colapso completo para área zero da viseira 3D do Rune Glifberg** (`v[34,44,45]` Hi-LOD / `v[27,31]` Lo-LOD), balanço de branco natural em `wagner.png` (pele branca) e mãos claras (`0xecafff57`).
- **Roupas:**
  - **Style A:** moletom bordô com `"CIÊNCIA DA COMPUTAÇÃO"` (espelhado na UV frontal para leitura correta na GTE) + bolso canguru + engrenagem branca + **calça jeans clara comprida** (preenchendo 100% de `0x089fe07e`, eliminando as canelas nuas da bermuda original) + slip-on preto/bege.
  - **Style B:** uniforme tático policial azul-marinho (tratando ambos `palId` de torso: **`0x93c7f9b1` em Hi-LOD e `0xde14dd2f` em Lo-LOD**!) + **mangas compridas com patch `"POLICJA"`** (`0xc6e2c2af`) + cinto tático + calça cargo + coturnos pretos.

### Slot 7 — **Francis Paulo** ([`Scripts/mod_skater_francis.js`](../Scripts/mod_skater_francis.js))
- **Modelos (`CD.WAD`):** `mullen.psx` (`399`), `mullen_L.psx` (`998`), `mullen2b.psx` (`443`), `mulln2bL.psx` (`1000`).
- **Foto, Retrato e 3D:** nivelamento automático de `+19°` CCW + curva S de recuperação de sombra retroiluminada em `francis.png` para pele branca natural → `s2face9.bmp`, cabeça 3D em ambos palIds (`0x8719fb31` Style A e `0xef678ca2` Style B), escultura de **cabelo volumoso 3D** em `HEAD Mesh[15]` (`0xba25cbf5`) e mãos claras (`0xd0a94062`).
- **Roupas (com Calças 4-Bit 16 Cores!):**
  - **Style A:** raglan branca com gola e ombros pretos + `"UBER"` (`U=69`) e círculo amarelo-laranja `"99"` (`U=56`) lidos esquerda→direita na GTE + manga curta preta/antebraço branco + **jeans índigo escuro em 4-bit 16 cores nibble-packed** (`0xa9d25833`).
  - **Style B:** kimono Shinigami (*Bleach*) preto com gola interna branca em V, faixa/laço branco na cintura, mangas pretas com punho branco + **calça hakama preta plissada em 4-bit 16 cores** (`0x1850b7b3`).

### Slot 9 — **Valter Pacheco** *(ex-Andrew Reynolds)* ([`Scripts/mod_skater_valter.js`](../Scripts/mod_skater_valter.js))
- **Modelos (`CD.WAD`):** `rynld2.psx` (`405`), `rynld_L.psx` (`1018`), `rynld2b.psx` (`449`), `rynld2bL.psx` (`1020`).
- **Renomeação `SLUS_010.66` (preservando `\X\REYNOLDS.STR;1` intacto!):** `0x0C4DB4` `"Valter Pacheco"`, `0x0C4DC4` `"Valter"`, `0x0C873C` `"Valter Pacheco"` e `0x0A2034` `"Valter's only been"`.
- **Restauração Automática de Foto e 3D:** filtro de *inpainting* de 2 passagens por mediana de vizinhança remove os riscos brancos originais sobre o nariz e a testa/têmporas de `valter.jpg` → `s2face10.bmp` (`magIdx = 18`), cabelo grisalho orgânico (sal e pimenta) + bigode em `0x5fd59d39`, escultura 3D em `HEAD Mesh[15]` (`0x1ab6ae9d`) e mãos claras (`0x8a0750ed`).
- **Roupas:**
  - **Style A:** **torso nativo `64×64`** (`0x18e956c6` — metade da largura padrão!) com camisa social azul chambray de botões dourados, bolso no peito e cinto preto + mangas compridas chambray com botão de punho + calça social azul-marinho.
  - **Style B:** torso `128×64` (`0x68e173c3`) camiseta gola V verde-musgo `"SAN MICHEL"` + carrinho amarelo + sublinhado (leitura esquerda→direita na GTE) + manga curta verde/antebraço branco + jeans azul com cinto marrom e crachá no quadril.

### Slot 10 — **Natan Oliver** ([`Scripts/mod_skater_natan.js`](../Scripts/mod_skater_natan.js))
- **Modelos (`CD.WAD`):** `rowley2.psx` (`403`), `rowley_L.psx` (`1002`), `rowley2b.psx` (`447`), `rowly2bL.psx` (`1004`).
- **Retrato e 3D:** `s2face11.bmp` (`magIdx = 7`), cabeça 3D em ambos palIds (`0xdce93a50` Style A e `0x775fc79d` Style B), corte curto atlético esculpido em `HEAD Mesh[15]` (`0xba25cbf5`) e mãos claras (`0x5ceb082c`).
- **Roupas:**
  - **Style A:** camiseta azul royal limpa (sem braço cruzado da foto) com cordão vermelho em V + crachá branco + logo `"LACTA"` com sorriso branco + manga curta azul/antebraço branco com relógio dourado + jeans escuro (`64×64`) + tênis preto/solado branco.
  - **Style B:** terno preto 2 botões com camisa branca, gravata vermelha vinho, lapelas e lenço de bolso + **mangas compridas pretas com punhos brancos** (`0x48c0229e`) + calça social preta + sapato social preto.

---

## 3. Biblioteca Compartilhada (`Scripts/psx_skater_lib.js`) e Status da Fase 1 (*The Hangar*)

Para padronizar a criação de novos skatistas com qualidade de produção, toda a infraestrutura comum foi consolidada em [`Scripts/psx_skater_lib.js`](../Scripts/psx_skater_lib.js):
- `quantizeImageForPsx` (8-bit 256 cores) e `quantize4BitForPsx` (4-bit 16 cores *nibble-packed*) com proteção anti-`0x0000`;
- `writeTextureIntoPsx` (detecta automaticamente `palSize === 16` ou `256` e preserva alfa `0x0000` em mãos);
- `buildPortraitBmpFromInner46x36` (gera `4.088 B` exatos travando moldura + `magIdx`);
- `drawBitmapText` (com `flipX: true` para a GTE do PS1 e `maxWidth` para encaixe limpo na frente plana do peito);
- `renderPs1SkaterPreview` (renderizador 3D multi-ângulo com projeção real `-rx` da GTE — executável via `--preview` sem alterar `CD.WAD`);
- `patchWadAndOptionsPre` (atualiza simultaneamente `CD.WAD` e `options.pre` preservando exatamente os tamanhos originais).

> **Fase 1 (*The Hangar* — `skhan_l.psx`):** os murais temporários testados via [`Scripts/mod_hangar_walls.js`](../Scripts/mod_hangar_walls.js) foram removidos a pedido do projeto; `skhan_l.psx` (`316.604 B`) encontra-se **100% restaurado ao original Redump** e validado bit-a-bit no Estágio 5 de `audit_game.js`.

---

## 4. Assets 3D & Texturas de Mundo do Lulao (`Scripts/mod_lulao_world_assets.js`)

Todos os 3 conjuntos abaixo são gerados de forma determinística a partir de `originals_backup/CD.WAD`, respeitando a lei empírica de *winding* PS1 GTE (`dot((v1 - v0) × (v2 - v0), normalExterna) < 0`), polaridade UV esquerda→direita e **zero deslocamento de offsets no `CD.WAD`** (expansões contidas na alocação original de setores de `2.048 B`, atualizando apenas `CD.HED[idx].size` + `obj[i].ptrRgbs @ +32`):

| Asset / Arquivo | Entrada `CD.WAD` | Tamanho (Orig → Mod / Alocado) | Modificação Cirúrgica |
| :--- | :---: | :---: | :--- |
| **Letra 3D Maiúscula `X`** (`items.psx`) | `WAD[8]` | `39.096 → 40.152 B` / `40.960 B` (`20 set.`) | Anexada `M[13]` (`hash = 0x58585858`, `24v/22n/22f`, `1.012 B`, +`obj[13]`, `ptrRgbs` e `texOffs[0..12]` ajustados) com inclinação itálica e gradiente dourado-âmbar `RGBs` idênticos a `T`/`A`/`S`. |
| **Barris Pinga 51** (`skhan_o.psx` & `skhan_o2.psx`) | `WAD[14]` / `WAD[1109]` | `122.236 B` / `123.480 B` (**exato, 0 B shift**) | Em `M[9]` (`0x4EB2C689`), substituído o losango `"FLAMMABLE"` em `ti=26` (`64×64 256c`, `0xD8113BF8`) pelo escudo **`PINGA 51 BRASIL`** + estêncil `"51"` na tampa `ti=25` (`64×64 16c`, `0x5734BAB8`). |
| **Garrafa 3D de Pitú** (`skven_o.psx` + `skven_l.psx`) | `WAD[1103]` + `WAD[1102]` | `9.076 → 10.192 B` / `10.240 B` (`5 set.`) + `345.016 B` (exato) | `skven_o.psx M[4]` (`0xA09E4E74`, antiga lata de spray) substituído por garrafa octogonal 3D esculpida (`40v/38n/38f`: base, corpo, ombro curvo, gargalo fino com colarinho e tampa rosqueada). Texturas exclusivas em `skven_l.psx`: `T[127]` (`48×48 256c`, vidro verde-claro + rótulo frente/verso com camarão vermelho e **`"PITÚ"`**), `T[128]` (`32×32 16c`, base) e `T[129]` (`16×16 16c`, tampa vermelha/dourada). |
