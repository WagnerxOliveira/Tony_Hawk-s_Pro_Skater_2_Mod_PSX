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
| License String | `0x004C` | `Nossa Fi Oiam Entertainment Inc. for Bursen Vurto Furto` | *Pré-modificada.* Original NTSC-U: `Sony Computer Entertainment Inc. for North America area` |

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

## 5. Registro Forense de Patches Existentes no Workspace

| Endereço RAM | Offset Arquivo | Original (`.bak`) | Modificado (`SLUS_010.66`) | Observação |
| :---: | :---: | :--- | :--- | :--- |
| `0x80016848` | `0x007048` | `24020078` (`li $v0, 120`) | `2402012C` (`li $v0, 300`) | Altera constante de `120` para `300` antes de `jal 0x8005566C` |
| `0x8005F320` | `0x04FB20` | `2484FFF8` (`addiu $a0, -8`) | *Corrompido apenas em `rep\*.bak`* | **ATENÇÃO:** `rep\SLUS_010.66.bak` tem `0000FFF8` (opcode inválido!) — nunca usar essa cópia |

---

## 6. Como Aplicar Símbolos Automaticamente no Ghidra

1. Abra o projeto no Ghidra com o plugin **`ghidra_psx_ldr`**.
2. Vá em **Window → Script Manager → Manage Script Directories** e adicione a pasta `Scripts/` (ou `tools/`).
3. Execute **`ghidra_apply_symbols.py`** para rotular automaticamente todas as tabelas e funções acima.
