# 📘 MAPA 01 — Arquitetura de Memória e Executável Principal (`SLUS_010.66`)

> **Alvo:** Tony Hawk's Pro Skater 2 (PlayStation 1 — NTSC-U `SLUS-01066`)  
> **CPU:** MIPS R3000A (32-bit Little-Endian, 33,8688 MHz) + GTE (COP2)  
> **RAM Principal:** 2 MB (`0x80000000` – `0x801FFFFF`, KSEG0 cacheável)

---

## 1. Cabeçalho `PS-X EXE` (`SLUS_010.66`)

| Campo | Offset no Arquivo | Valor Atual | Significado Técnico |
| :--- | :---: | :---: | :--- |
| Magic | `0x0000` | `PS-X EXE` | Assinatura obrigatória da BIOS do PS1 |
| `PC0` (Entry Point) | `0x0010` | `0x800A2910` | Primeira instrução executada; limpa `.bss` (`0x800D8674..0x800E2674`) |
| `GP0` | `0x0014` | `0x00000000` | Inicializado em runtime pelo código de startup |
| `t_addr` (Base RAM) | `0x0018` | `0x80010000` | Endereço de carregamento do corpo do executável |
| `t_size` (Tamanho RAM) | `0x001C` | `0x000D2800` (`862208` B) | Fim da imagem em RAM: `0x800E2800` |
| `s_addr` (Stack) | `0x0030` | `0x801FFFF0` | Topo da pilha (`SYSTEM.CNF` define `801FFF00`) |
| Tamanho total em disco | — | `864256` bytes | `0x800` (header) + `0x000D2800` (binário) |
| License String | `0x004C` | `Sony Computer Entertainment Inc. for North America area` | Assinatura oficial NTSC-U (restaurada e validada) |

### Fórmula Exata de Conversão `Offset no Arquivo ↔ Endereço RAM`
```text
RAM_Address = 0x80010000 + (File_Offset - 0x0800)
File_Offset = (RAM_Address - 0x80010000) + 0x0800
```

---

## 2. Mapa Global de Regiões na RAM do PS1 (2 MB)

| Faixa de RAM | Offset no Arquivo | Região / Conteúdo |
| :--- | :---: | :--- |
| `0x80000000` – `0x8000FFFF` | *(BIOS)* | Kernel da BIOS PS1, vetores de exceção e tabela de syscalls (`A0`, `B0`, `C0`) |
| `0x80010000` – `0x800693BF` | `0x000800` – `0x059BBF` | Código principal (`.text`): engine Neversoft, física, rendering, input, CD/WAD, Psy-Q SDK |
| `0x800693C0` – `0x8006B200` | `0x059BC0` – `0x05BA00` | Bloco principal de strings de UI, menus, Memory Card e Cheats (já parcialmente em PT-BR) |
| `0x8006B200` – `0x800AFBFF` | `0x05BA00` – `0x0A03FF` | Código adicional (`.text`): player MDEC/STR (`0x8007A6B8+`), timer (`0x800833E8`), entry point (`0x800A2910`) |
| `0x800AFC00` – `0x800B6833` | `0x0A0400` – `0x0A7033` | Jump tables (`0x800AFC18..`), textos de objetivos de fase, biografias de skatistas, gaps e strings de sistema |
| `0x800B6834` – `0x800B8443` | `0x0A7034` – `0x0A8C43` | **`g_SkaterTable[]`** — 20 skatistas × `0x154` bytes ([ver MAPA 04](MAPA_04_PERSONAGENS_E_STATS.md)) |
| `0x800B8444` – `0x800B943F` | `0x0A8C44` – `0x0A9C3F` | **`g_LevelTable[]`** — 11 fases × `0x174` bytes ([ver MAPA 03](MAPA_03_FASES_E_OBJETOS_TRG.md)) |
| `0x800BA4F4` – `0x800BA573` | `0x0AACF4` – `0x0AAD73` | **`g_XATrackLengths[]`** — Duração das músicas de `COMPILED.XA` ([ver MAPA 08](MAPA_08_AUDIO_XA_VAB_E_VIDEOS_STR.md)) |
| `0x800BF2E0` – `0x800C0888` | `0x0AFAE0` – `0x0B1088` | **`g_StringTable[]`** — 1.387 ponteiros de texto/localização ([ver MAPA 07](MAPA_07_CHEATS_COMANDOS_E_STRINGS.md)) |
| `0x800C1CB4` – `0x800C219F` | `0x0B24B4` – `0x0B299F` | **`g_MovieTable[]`** — 35 vídeos `.STR` × `0x24` bytes ([ver MAPA 08](MAPA_08_AUDIO_XA_VAB_E_VIDEOS_STR.md)) |
| `0x800D2800` – `0x800D8673` | `0x0C3000` – `0x0C8E73` | Strings de assets (`tricks.bin`, `CD.HED;1`, `CD.WAD;1`, `COMPILED.XA;1`, nomes de modelos/fases/vídeos) |
| `0x800D8674` – `0x800E2800` | `0x0C8E74` – `0x0D3000` | `.bss` zerado na inicialização (`0x800A2910`) |
| `0x800E2800` – `0x801FFEFF` | *(Heap Dinâmico)* | Alocação dinâmica de overlays `.BIN`, níveis `.PSX`, triggers `.TRG`, ring buffers de vídeo/CD |

---

## 3. Funções Fundamentais Mapeadas em `SLUS_010.66`

| Endereço RAM | Offset no Arquivo | Nome Sugerido (Ghidra) | Função / Responsabilidade |
| :---: | :---: | :--- | :--- |
| `0x800A2910` | `0x093110` | `THPS2_EntryPoint` | Ponto de entrada; zera `.bss` e transfere para `main` |
| `0x80053F10` | `0x044710` | `Neversoft_HashFilename_CaseInsensitive` | Calcula o hash 32-bit de `CD.HED` (`tolower` + `rol32` + `0xEDB88320`) |
| `0x80023130` | `0x013930` | `Neversoft_HashString_CaseSensitive` | Variante case-sensitive do algoritmo de hash |
| `0x80053F88` | `0x044788` | `CDWAD_OpenByFilename` | Abre arquivo dentro de `CD.WAD` via busca de hash em `CD.HED` |
| `0x80014130` | `0x004930` | `Tricks_LoadTableRef` | Carrega `tricks.bin` (`0x800D2848`) na inicialização |
| `0x80038974` | `0x029174` | `XA_InitCompiledXA` | Abre `\COMPILED.XA;1` (`0x800D6184`) via `CdSearchFile` |
| `0x8003D3E8` | `0x02DBE8` | `BMX_LaunchDemoRef` | Executa `cdrom:\BMX\X.EXE;1` (`0x800B2064`) |
| `0x8007A6B8` | `0x06AEB8` | `Movie_PlayerRef1` | Player MDEC/STR principal que lê `g_MovieTable` (`0x800C1CB4`) |
| `0x80026C48` | `0x017448` | `Cheats_MenuHandlerRef` | Handler da tela de cheats (`g_CheatStringPtrs @ 0x800C028C`) |
| `0x80067DA0` | `0x0585A0` | `Text_LookupStringRef1` | Resolve strings por ID em `g_StringTable` (`0x800BF2E0`) |

---

## 4. Algoritmo Exato de Hash da Neversoft (`0x80053F10`)

Ao contrário do CRC32 IEEE padrão, o THPS2 PS1 faz **rotação à esquerda (`rol32`)** com o polinômio `0xEDB88320` sem XOR final:

```c
uint32_t Neversoft_HashFilename(const char *str) {
    uint32_t h = 0xFFFFFFFF;
    while (*str != 0) {
        uint8_t c = (uint8_t)*str++;
        if (c >= 'A' && c <= 'Z') c += 32; // tolower()
        uint8_t x = (uint8_t)(c ^ h);
        for (int i = 0; i < 8; i++) {
            h = (h << 1) | (h >> 31);      // rol32(h, 1)
            if (x & 1) h ^= 0xEDB88320;
            x >>= 1;
        }
    }
    return h;
}
```

---

## 5. Registro Forense de Correções de Bugs em `SLUS_010.66`

Durante auditoria forense contra o binário limpo NTSC-U Redump, foi identificada e corrigida (`Scripts/fix_game_errors.js`) uma substituição hexadecimal cega pré-existente (`78 00` → `2C 01`, `120` → `300`) que havia corrompido **8 instruções MIPS** de física, posição do skatista, controle, fonte, áudio e alocador de heap — além do cabeçalho NTSC-U `+0x4C` e do byte não-ASCII `0xE3`:

| Endereço RAM | Offset Arquivo | Corrompido (`300`) | Restaurado (`120`) | Função Real Descompilada (MIPS R3000A) |
| :---: | :---: | :--- | :--- | :--- |
| `0x80016848` | `0x007048` | `2402012C` | `24020078` (`li $v0, 120`) | `Vector3_Scale` (`0x8005566C`) — comprimento do raycast de colisão do skatista (2,5× causava clipping!) |
| `0x80018EE0` | `0x0096E0` | `2404012C` | `24040078` (`li $a0, 120`) | `FixedPoint_Mul12` (`0x8006CBF4`) — deslocamento `pos.x` do skatista no estado 5 (causava sumiço/teleporte!) |
| `0x80018EE4` | `0x0096E4` | `2404012C` | `24040078` (`li $a0, 120`) | `FixedPoint_Mul12` (`0x8006CBF4`) — deslocamento `pos.y` do skatista no estado 5 |
| `0x80018F54` | `0x009754` | `2404012C` | `24040078` (`li $a0, 120`) | `FixedPoint_Mul12` (`0x8006CBF4`) — deslocamento `pos.z` do skatista no estado 6 |
| `0x8006237C` | `0x052B7C` | `2404012C` | `24040078` (`li $a0, 120`) | `SFX_Play` (`0x800526B4`) — tocava ID de efeito sonoro errado (`300` em vez de `120`) |
| `0x8006BC2C` | `0x05C42C` | `2404012C` | `24040078` (`li $a0, 120`) | `g_PadManager` (`0x800C08FC`) — contador de hold do controle (aumentava 2 s → 5 s!) |
| `0x8007E880` | `0x06F080` | `2404012C` | `24040078` (`li $a0, 120`) | `Font_SetScale` (`0x80034CE0`) — escala de fonte na UI (estourava texto 2,5×!) |
| `0x8008238C` | `0x072B8C` | `2404012C` | `24040078` (`li $a0, 120`) | `Mem_New` (`0x80084ABC → 0x800392B0`) — tamanho de alocação de objeto C++ na heap de 2 MB |
| `0x8005F320` | `0x04FB20` | *Apenas em `rep\*.bak`* | `2484FFF8` (`addiu $a0, -8`) | **ATENÇÃO:** `rep\SLUS_010.66.bak` tem `0000FFF8` (opcode inválido!) — nunca usar essa cópia |

---

## 5B. Hooks MIPS R3000A do Mod (`patch_random_videos_and_voices.js`)

Arena dedicada de **4,5 KB** reservada abaixo da heap (`0x800E2678..0x800E37FF`, sem alterar o tamanho do `SLUS_010.66` nem os 48 LBAs originais da ISO):

| Endereço RAM | Arquivo / Origem | Alteração | Função |
| :---: | :---: | :--- | :--- |
| `0x800E2674` | `SLUS_010.66` | `0x800E2678 → 0x800E3800` | Nova base da heap THPS2 (`0x8006C8E4`) |
| `0x800A2950` | `SLUS_010.66` | `addiu $a0,$a0,0x3800` | Nova base `InitHeap` no Entry Point |
| `0x80053690` | `SLUS_010.66` | `slti $v0,$v1,23` | Reserva a **Voz 23** da SPU exclusivamente para vozes de skatistas (SFX usa `0..22`) |
| `0x8006CAD4` | `SLUS_010.66` | `jal 0x800E2680` | `Mod_BootInit`: executa `Movies_Init()`, lê Setores `0..1` de `\VOICES.DAT;1` para `0x800E2800..0x800E37FF` e chama BIOS `FlushCache()` (`0x800AF500`) |
| `0x8003CFB0` / `CFE8` / `D024` | `SLUS_010.66` | `jal 0x800E2758` | `BootRand_PlaySlot`: sorteia 3 vídeos distintos (Activision, Neversoft e Intro) entre os 20 vídeos customizados com entropia persistente no Setor `60` (`0x3C`) do Memory Card + Root Counters HW |
| `playsel.bin +0x3388` | `CD.WAD[61]` | `jal 0x800E2780` | `Hook_PlaySel_Scroll`: ao navegar Left/Right até **Lulao (idx 2)** ou **Bolsonaro (idx 3)**, rotaciona e toca o próximo áudio SPU-ADPCM na Voz 23 |
| `playsel.bin +0x100C` | `CD.WAD[61]` | `jal 0x800E27A8` | `Hook_PlaySel_Confirm`: ao confirmar **Lulao** ou **Bolsonaro** com **X**, toca o chime + próximo áudio SPU-ADPCM do skatista |

---

## 6. Como Aplicar Símbolos Automaticamente no Ghidra

1. Abra o projeto no Ghidra com o plugin **`ghidra_psx_ldr`**.
2. Vá em **Window → Script Manager → Manage Script Directories** e adicione a pasta `Scripts/` (ou `tools/`).
3. Execute **`ghidra_apply_symbols.py`** para rotular automaticamente todas as tabelas e funções acima.
