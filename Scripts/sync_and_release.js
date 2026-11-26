#!/usr/bin/env node
'use strict';

/**
 * Master Automated Build, Delta-Patch, Git Sync & GitHub Release Pipeline for THPS2 PSX Mod
 *
 * Whenever ANY modification is made to the game (SLUS_010.66, CD.WAD, videos .STR, COMPILED.XA, etc.),
 * running:
 *   node tools/sync_and_release.js "descricao da alteracao"
 * automatically:
 *   1. Rebuilds build/THPS2_MOD.bin + build/THPS2_MOD.cue (preserving exact Redump LBAs & license sectors)
 *   2. Generates & round-trip verifies build/THPS2_MOD_NTSC-U.xdelta against the clean original BIN
 *   3. Regenerates all 9 Reverse-Engineering Maps in Docs/ (MAPA_01..09)
 *   4. Syncs open-source Scripts/ + Docs/ + README.md into repo/, commits and pushes to origin/main
 *   5. Packages THPS2_MOD_Patcher_e_Guia.zip (1-click drag-and-drop patcher + .cue + guide)
 *      and THPS2_PSX_Modding_Toolkit_and_Docs.zip (scripts + full RE encyclopedia)
 *   6. Uploads/updates THPS2_MOD_NTSC-U.xdelta + both ZIPs on the public GitHub Release automatically!
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const repoDir = path.join(rootDir, 'repo');
const repoScriptsDir = path.join(repoDir, 'Scripts');
const ghRepo = 'WagnerxOliveira/Tony_Hawk-s_Pro_Skater_2_Mod_PSX';
const releaseTag = 'v2.0-mod-patch-e-toolkit';
const releaseTitle = 'THPS2 PSX Mod (Patch .xdelta) + Toolkit & Enciclopédia Técnica (v2.0)';

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const skipPatch = args.includes('--skip-patch');
const commitMsg = args.find(a => !a.startsWith('--')) || 'chore: Atualiza mod, patch .xdelta, documentacao tecnica e release';

function run(cmd, cmdArgs, opts = {}) {
  console.log(`> ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${cmdArgs.join(' ')}`);
  }
  return r;
}

// 1. Rebuild ISO (.bin/.cue) + Run 10-stage automated forensic audit
if (!skipBuild) {
  console.log('=== 1. Recompilando imagem local THPS2_MOD.bin/.cue ===');
  run('node', [path.join(rootDir, 'tools', 'build_iso.js')]);
  console.log('\n=== 1B. Executando auditoria forense completa (10 estagios) ===');
  run('node', [path.join(rootDir, 'tools', 'audit_game.js')]);
} else {
  console.log('=== 1. Pulando rebuild da ISO (--skip-build) ===');
}

// 2. Generate & verify .xdelta patch against original Redump BIN
if (!skipPatch) {
  console.log('\n=== 2. Gerando e validando patch delta THPS2_MOD_NTSC-U.xdelta ===');
  run('node', [path.join(rootDir, 'tools', 'create_patch.js')]);
} else {
  console.log('\n=== 2. Pulando geracao do patch (--skip-patch) ===');
}

const patchPath = path.join(rootDir, 'build', 'THPS2_MOD_NTSC-U.xdelta');
const manifestPath = path.join(rootDir, 'build', 'patch_manifest.json');
const cuePath = path.join(rootDir, 'build', 'THPS2_MOD.cue');
const xdeltaExe = path.join(rootDir, 'tools', 'bin', 'xdelta3', 'xdelta3-3.2.2-windows-x86_64', 'xdelta3.exe');

if (!fs.existsSync(patchPath) || !fs.existsSync(manifestPath)) {
  throw new Error('Patch .xdelta ou patch_manifest.json nao encontrado! Rode sem --skip-patch.');
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// 3. Regenerate all technical Markdown maps (MAPA_01..09 + MAPA_14 THPS1)
console.log('\n=== 3. Regenerando mapas tecnicos em Docs/ ===');
run('node', [path.join(rootDir, 'tools', 'generate_all_docs.js')]);
if (fs.existsSync(path.join(rootDir, 'tools', 'generate_thps1_docs.js'))) {
  run('node', [path.join(rootDir, 'tools', 'generate_thps1_docs.js')]);
}

// 4. Sync open-source scripts into repo/Scripts/
console.log('\n=== 4. Sincronizando scripts open-source para repo/Scripts/ ===');
const scriptsToSync = [
  'thps2_wad.js',
  'psx_media.js',
  'psx_skater_lib.js',
  'build_iso.js',
  'create_patch.js',
  'replace_videos.js',
  'mod_skater_silvio.js',
  'mod_skater_lulao.js',
  'mod_skater_bolsonaro.js',
  'mod_skater_wagner.js',
  'mod_skater_francis.js',
  'mod_skater_natan.js',
  'mod_skater_valter.js',
  'mod_skater_crash.js',
  'mod_crash_collectibles.js',
  'mod_crash_engine.js',
  'mod_skater_bios.js',
  'mod_bail_screams.js',
  'mod_hangar_walls.js',
  'mod_lulao_world_assets.js',
  'mod_collectibles_haddad_dilma.js',
  'mod_lulao_collectibles_v2.js',
  'extract_thps1.js',
  'mod_thps1_custom_objects.js',
  'port_thps1_levels.js',
  'thps1_engine_mod.js',
  'build_skater_voices.js',
  'patch_random_videos_and_voices.js',
  'fix_game_errors.js',
  'audit_game.js',
  'generate_all_docs.js',
  'generate_thps1_docs.js',
  'ghidra_apply_symbols.py',
  'thps2_build.xml',
  'sync_and_release.js',
];
fs.mkdirSync(repoScriptsDir, { recursive: true });
for (const f of scriptsToSync) {
  const src = path.join(rootDir, 'tools', f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(repoScriptsDir, f));
    console.log(`  [sync] Scripts/${f}`);
  }
}
fs.copyFileSync(path.join(repoDir, 'README.md'), path.join(rootDir, 'README.md'));
if (fs.existsSync(path.join(repoDir, 'CHANGELOG.md'))) {
  fs.copyFileSync(path.join(repoDir, 'CHANGELOG.md'), path.join(rootDir, 'CHANGELOG.md'));
}
if (fs.existsSync(path.join(repoDir, 'HISTORIA_DO_PROJETO_THPS2_MOD.md'))) {
  fs.copyFileSync(path.join(repoDir, 'HISTORIA_DO_PROJETO_THPS2_MOD.md'), path.join(rootDir, 'HISTORIA_DO_PROJETO_THPS2_MOD.md'));
}
// Mirror static technical maps (MAPA_10..13) from repo/Docs/ into local docs/
const localDocsDir = path.join(rootDir, 'docs');
fs.mkdirSync(localDocsDir, { recursive: true });
for (const f of fs.readdirSync(path.join(repoDir, 'Docs'))) {
  if (/^MAPA_\d+.*\.md$/i.test(f)) {
    fs.copyFileSync(path.join(repoDir, 'Docs', f), path.join(localDocsDir, f));
  }
}

// 5. Git commit & push on main
console.log('\n=== 5. Git commit & push para GitHub (origin/main) ===');
run('git', ['-C', repoDir, 'add', '.gitignore', 'README.md', 'CHANGELOG.md', 'HISTORIA_DO_PROJETO_THPS2_MOD.md', 'Docs', 'Scripts']);
const statusRes = spawnSync('git', ['-C', repoDir, 'status', '--porcelain'], { encoding: 'utf8' });
if (statusRes.stdout.trim().length > 0) {
  run('git', ['-C', repoDir, 'commit', '-m', commitMsg]);
  run('git', ['-C', repoDir, 'push', 'origin', 'main']);
} else {
  console.log('  Nenhuma alteracao nova de codigo/docs para commitar em repo/.');
}

// 6. Build Release Packages:
//    (A) THPS2_MOD_Patcher_e_Guia.zip -> 1-click drag-and-drop patcher (xdelta3 Apache 2.0 + .bat + .cue + guide)
//    (B) THPS2_PSX_Modding_Toolkit_and_Docs.zip -> Open-source scripts + all 9 Markdown maps
console.log('\n=== 6. Empacotando artefatos da Release ===');
const patcherPkgDir = path.join(rootDir, 'build', '_release_patcher_pkg');
const patcherZip = path.join(rootDir, 'build', 'THPS2_MOD_Patcher_e_Guia.zip');
fs.rmSync(patcherPkgDir, { recursive: true, force: true });
fs.mkdirSync(patcherPkgDir, { recursive: true });

fs.copyFileSync(xdeltaExe, path.join(patcherPkgDir, 'xdelta3.exe'));
fs.copyFileSync(cuePath, path.join(patcherPkgDir, 'THPS2_MOD.cue'));
fs.copyFileSync(manifestPath, path.join(patcherPkgDir, 'patch_manifest.json'));

const batScript = `@echo off
setlocal
title Aplicador Automatico de Patch - THPS2 PSX Mod (NTSC-U SLUS-01066)
echo ====================================================================
echo   Tony Hawk's Pro Skater 2 (PS1) - Aplicador de Patch (.xdelta)
echo ====================================================================
echo.

set "PATCH=%~dp0THPS2_MOD_NTSC-U.xdelta"
if not exist "%PATCH%" (
    echo [ERRO] Arquivo THPS2_MOD_NTSC-U.xdelta nao encontrado nesta pasta!
    echo Baixe THPS2_MOD_NTSC-U.xdelta na mesma Release do GitHub e coloque aqui junto.
    echo.
    pause
    exit /b 1
)

set "ORIG=%~1"
if "%ORIG%"=="" (
    echo Arraste o seu arquivo original "Tony Hawk's Pro Skater 2.bin" ^(NTSC-U Redump^)
    echo para cima deste .bat, OU digite/cole o caminho completo dele abaixo:
    echo.
    set /p "ORIG=Caminho do .bin original: "
)
set "ORIG=%ORIG:"=%"
if not exist "%ORIG%" (
    echo [ERRO] Arquivo original nao encontrado: "%ORIG%"
    pause
    exit /b 1
)

echo.
echo Aplicando patch em "%ORIG%"...
echo Aguarde alguns segundos...
"%~dp0xdelta3.exe" -d -f -s "%ORIG%" "%PATCH%" "%~dp0THPS2_MOD.bin"
if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao aplicar o patch!
    echo Verifique se seu .bin original e a versao NTSC-U Redump limpa:
    echo   MD5  : ${manifest.originalBin.md5}
    echo   SHA1 : ${manifest.originalBin.sha1}
    echo.
    pause
    exit /b 1
)

echo.
echo ====================================================================
echo   SUCESSO! Jogo modificado criado em:
echo     %~dp0THPS2_MOD.bin
echo     %~dp0THPS2_MOD.cue
echo.
echo   Abra THPS2_MOD.cue no DuckStation, PCSX-Redux ou RetroArch!
echo ====================================================================
echo.
pause
`;
fs.writeFileSync(path.join(patcherPkgDir, 'Aplicar_Patch_THPS2.bat'), batScript.replace(/\r?\n/g, '\r\n'), 'utf8');

const guideTxt = `====================================================================
  TONY HAWK'S PRO SKATER 2 MOD (PS1 / SLUS-01066) — COMO JOGAR
====================================================================

1. REQUISITO (BASE ORIGINAL LIMPA)
   Tenha sua copia original em .BIN de Tony Hawk's Pro Skater 2 (USA / NTSC-U):
   - Tamanho : ${manifest.originalBin.sizeBytes} bytes (${manifest.originalBin.sectors} setores)
   - MD5     : ${manifest.originalBin.md5}
   - SHA-1   : ${manifest.originalBin.sha1}

2. COMO APLICAR O PATCH EM 1 CLIQUE (WINDOWS)
   a) Extraia este ZIP em uma pasta e coloque o arquivo "THPS2_MOD_NTSC-U.xdelta"
      (baixado na mesma Release do GitHub) dentro da MESMA pasta.
   b) Arraste o seu arquivo original "Tony Hawk's Pro Skater 2.bin" para cima de:
        Aplicar_Patch_THPS2.bat
   c) Em poucos segundos serao gerados:
        THPS2_MOD.bin  (SHA-256 esperado: ${manifest.patchedBin.sha256})
        THPS2_MOD.cue  (ja incluso nesta pasta!)

3. ALTERNATIVA VIA INTERFACE GRAFICA (WINDOWS / LINUX / MACOS)
   - Use o Delta Patcher (https://github.com/marco-calautti/DeltaPatcher/releases):
     * Original file : seu "Tony Hawk's Pro Skater 2.bin"
     * XDelta patch  : THPS2_MOD_NTSC-U.xdelta
     * Clique em "Apply patch" e renomeie o resultado para "THPS2_MOD.bin" ao lado de "THPS2_MOD.cue".

4. COMO JOGAR NO EMULADOR (CONFIGURACAO RECOMENDADA ZERO ARTEFATOS E ZERO LAG)
   - DuckStation (Recomendado): File -> Start File -> selecione "THPS2_MOD.cue"
     * Para zero input lag, zero fendas/linhas vazias no chao (School II / NY City) e zero sumico de ceu/objetos:
       - Copie o perfil "SLUS-01066.ini" (incluso neste ZIP!) para a pasta "gamesettings" do DuckStation, OU configure:
         * PGXP Geometry Correction: DESATIVADO (o motor M3dAsm do THPS2 ja subdivide poligonos proximos em inteiros na CPU MIPS; ativar PGXP cria desalinhamento subpixel e abre fendas/linhas brancas no chao da School II e NY City!)
         * PGXP Depth Buffer       : DESATIVADO (evita sumir ceu, skatista e rampas na Ordering Table do PS1)
         * Widescreen Hack         : DESATIVADO / Aspect Ratio 4:3 (evita sumir objetos e paredes nas bordas)
         * Line Detect Mode        : Disabled | Texture Filter: Nearest | Resolution Scale: 5x (1080p)
         * Max Queued Frames       : 2 | Optimal Frame Pacing: ATIVADO (zero input lag)
       - Se voce usa controle DualShock 4 / DualSense via Bluetooth + DS4Windows:
         * Ative o HidHide ocultando o controle HID fisico (liberando apenas o DS4Windows.exe),
           configure BTPollRate = 4ms (250Hz nativo PS4), Idle Disconnect = 0 (desativado) e
           FlashWhenLate = False no DS4Windows, e mapeie o DuckStation em XInput-0 (sem RGBLED)
           + desative a Suspensao Seletiva USB do Windows para eliminar desconexoes Bluetooth!
   - PCSX-Redux / RetroArch (Beetle PSX HW / SwanStation): abra "THPS2_MOD.cue"

Atualizado automaticamente em: ${manifest.generatedAt}
`;
fs.writeFileSync(path.join(patcherPkgDir, 'LEIA-ME_COMO_JOGAR.txt'), guideTxt.replace(/\r?\n/g, '\r\n'), 'utf8');

const dsProfile = `[Console]
Region = NTSC-U

[GPU]
ResolutionScale = 5
Multisamples = 1
PerSampleShading = false
DownsampleMode = Disabled
DitheringMode = Scaled
TextureFilter = Nearest
SpriteTextureFilter = Nearest
LineDetectMode = Disabled
MaxQueuedFrames = 2
PGXPEnable = false
PGXPCPU = false
PGXPVertexCache = false
PGXPTextureCorrection = false
PGXPColorCorrection = false
PGXPDepthBuffer = false
PGXPCulling = false
PGXPPreserveProjFP = false
PGXPTolerance = -1
WidescreenHack = false
ForceRoundTextureCoordinates = false

[Display]
AspectRatio = 4:3
OptimalFramePacing = true
VSync = false

[CDROM]
RegionCheck = false
`;
fs.writeFileSync(path.join(patcherPkgDir, 'SLUS-01066.ini'), dsProfile.replace(/\r?\n/g, '\r\n'), 'utf8');

if (fs.existsSync(patcherZip)) fs.unlinkSync(patcherZip);
run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${patcherPkgDir}\\*' -DestinationPath '${patcherZip}' -Force`]);
fs.rmSync(patcherPkgDir, { recursive: true, force: true });

// Package (B): Toolkit + Docs ZIP
const toolkitPkgDir = path.join(rootDir, 'build', '_release_toolkit_pkg');
const toolkitZip = path.join(rootDir, 'build', 'THPS2_PSX_Modding_Toolkit_and_Docs.zip');
fs.rmSync(toolkitPkgDir, { recursive: true, force: true });
fs.mkdirSync(path.join(toolkitPkgDir, 'Docs'), { recursive: true });
fs.mkdirSync(path.join(toolkitPkgDir, 'Scripts'), { recursive: true });
fs.copyFileSync(path.join(repoDir, 'README.md'), path.join(toolkitPkgDir, 'README.md'));
if (fs.existsSync(path.join(repoDir, 'CHANGELOG.md'))) {
  fs.copyFileSync(path.join(repoDir, 'CHANGELOG.md'), path.join(toolkitPkgDir, 'CHANGELOG.md'));
}
if (fs.existsSync(path.join(repoDir, 'HISTORIA_DO_PROJETO_THPS2_MOD.md'))) {
  fs.copyFileSync(path.join(repoDir, 'HISTORIA_DO_PROJETO_THPS2_MOD.md'), path.join(toolkitPkgDir, 'HISTORIA_DO_PROJETO_THPS2_MOD.md'));
}
for (const f of fs.readdirSync(path.join(repoDir, 'Docs'))) {
  if (f.endsWith('.md')) fs.copyFileSync(path.join(repoDir, 'Docs', f), path.join(toolkitPkgDir, 'Docs', f));
}
for (const f of scriptsToSync) {
  const p = path.join(repoScriptsDir, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(toolkitPkgDir, 'Scripts', f));
}
if (fs.existsSync(toolkitZip)) fs.unlinkSync(toolkitZip);
run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${toolkitPkgDir}\\*' -DestinationPath '${toolkitZip}' -Force`]);
fs.rmSync(toolkitPkgDir, { recursive: true, force: true });

// 7. Create or update GitHub Release with the verified .xdelta patch + patcher + toolkit!
console.log('\n=== 7. Publicando / Atualizando GitHub Release ===');
const notes = [
  '## 🛹 Tony Hawk\'s Pro Skater 2 Mod (PS1 / SLUS-01066) — Patch `.xdelta` + Toolkit & Docs',
  '',
  '### 🎮 Como Baixar e Jogar no Emulador (DuckStation / PCSX-Redux / RetroArch)',
  '1. Baixe os dois arquivos abaixo desta Release:',
  '   - **`THPS2_MOD_NTSC-U.xdelta`** (patch delta binário verificado bit-a-bit)',
  '   - **`THPS2_MOD_Patcher_e_Guia.zip`** (contém aplicador automático `Aplicar_Patch_THPS2.bat`, `xdelta3.exe`, `THPS2_MOD.cue` e guia passo a passo)',
  '2. Extraia o ZIP em uma pasta e coloque `THPS2_MOD_NTSC-U.xdelta` na mesma pasta.',
  '3. **Arraste o seu arquivo original** `Tony Hawk\'s Pro Skater 2.bin` *(NTSC-U / Redump)* para cima de **`Aplicar_Patch_THPS2.bat`** (ou aplique via [Delta Patcher](https://github.com/marco-calautti/DeltaPatcher/releases)).',
  '4. Abra **`THPS2_MOD.cue`** no **DuckStation**, **PCSX-Redux** ou **RetroArch** e jogue!',
  '',
  '### ✨ Destaques do Mod',
  '- **🦊 NOVO PERSONAGEM JOGÁVEL ADICIONADO SEM EXCLUIR NINGUÉM — *Crash Bandicoot* (`Crash B.`, Novo `Slot 20` — 21º Skatista da Seleção!):** todos os 20 skatistas existentes (`Slots 0..19`) permanecem 100% intactos! O **`Crash B.`** estreia com **modelo 3D autêntico do *Crash Bandicoot 3: Warped*** em **Style A** (Clássico `crash.psx`, `59.324 B`) & **Style B** (Motoqueiro Warped `crashb.psx`, `59.324 B`), retrato **`s2face20.bmp`**, **Biografia PT-BR nativa**, **moveset completo do Bob Burnquist + seus 3 especiais (`Racket Air`, `BS Rocket Tailslide`, `One Foot Smith`) + 1 especial lendário do Rodney Mullen (`Casper to 360 Flip`, `↓ → ○`, ID `73`)** sincronizado nas 3 cópias de `tricks.bin` (`CD.HED[11]`, `panel.pre`, `tricksel.pre`), **8 shapes exclusivos temáticos do Crash 3** na Skate Shop (`s2dCR01c..08c.bmp`: *Wumpa Blast*, *Aku Aku Spirit*, *Power Crystal*, *Time Relic*, *TNT & Nitro*, *Gem Collector*, *Uka Uka Fury*, *Crash Warped 98*) + **8 gráficos embaixo do skate 3D (`s2gCR01c..08c.bmp`)** salvos no shadow dedicado `g_CrashDeckShadow`, e **coletáveis 3D & objetivos exclusivos do Crash 3 em TODAS as 19 fases (`C-R-A-S-H`, Caixas TNT/NITRO/Checkpoint, Frutas Wumpa, Cristais de Poder com aura `ABR=1`, Gemas Warp, Relíquias de Ouro, Máscaras Aku Aku & Uka Uka)** com **isolamento 100% estrito** (ao jogar com Lulão, Tony Hawk ou qualquer outro skatista `0..19`, seus coletáveis e textos originais permanecem intactos!). Todo o motor residente do `Slot 20` foi alojado a **custo ZERO de Heap** na RAM liberada da antiga `g_LevelTable` (`0x800B82C4..0x800B943F`, `102/102` refs relocadas!).',
  '- **Todas as 9 Fases de *Tony Hawk\'s Pro Skater 1* (`SLUS-00860`) Integradas e Intercaladas no Modo Carreira do THPS2 (19 Fases Jogáveis + Custom Park!):** *Warehouse*, *School*, *Mall*, *Skate Park Chicago*, *Downtown*, *Downhill Jam*, *Burnside*, *Streets (San Francisco)* e *Roswell* intercaladas uma a uma entre todas as fases do THPS2 (sem remover nenhuma fase!), com **60 novos objetivos satíricos (`10 × 6` fases regulares)**, **6 novos objetos 3D esculpidos (`30` coletáveis no mundo, incl. Malas #3/#4 em *Mall NY* auditadas fora das paredes)**, **24 Gaps ao vivo**, **3 telas oficiais de competição (`t1comp0/1/2.bmp`) para *Chicago*, *Burnside* e *Roswell***, **2.301 trilhos `.TRG` convertidos**, **68 moedas → `$100` Cash** para Stats e **som de caixa + skatista zero-stall (`CdReads = 0`, 333 remapes SFX/Shatter `.TRG`)**! **Transições Ultra-Rápidas em Hardware PS1 2× Real:** 37 ativos THPS1 alojados *in-place* em `CD.WAD` (`[573]`/`[578]` + zona fechada `[1127..1185]` `4.577/4.577` set., `0` deslocamento nos `1.472` itens THPS2!) + `THPS1.WAD` (`1,12 MB`, `38` arquivos = `5` THPS1 + `33` ativos exclusivos de `Crash B.`) + `FastMap` 100% crescente no `CD.WAD` (`PlaySel → LevelSel` `-1,55 s` / `288f`, `s2arrow8/9` em `levelsel.pre`) + motor `CDWAD` Turbo 60 Hz & `TURBO_BURST` + **pipeline DMA assíncrono em 3 fases na Tela de Objetivos (`tricks.bin` → `LULAO_GPBANK` → `BOLSO_GPBANK`, `0 CdReads` após apertar `X` e `-4,53 s` em *School Miami*!)** + `CASHART` boot-residente (`0x800EB000`).',
  '- **Vídeos Aleatórios no Boot com Duração Exata Original (Activision `13,87s` + Neversoft `17,73s` + Intro):** a cada inicialização no DuckStation, 3 vídeos customizados diferentes são sorteados automaticamente entre os 20 vídeos do disco (Setor 60 do Memory Card + timers HW PS1), respeitando a duração exata de cada animação original sem alterar os vídeos de final de carreira.',
  '- **41 Vozes Rotativas na Seleção de Skatistas (`Silvio Santos`, `Lulao` & `Bolsonaro`) + Música Suavizada (`-12 dB`):** 41 áudios exclusivos em SPU-ADPCM hardware (`13` Silvio Santos + `14` Lulao + `14` Bolsonaro em `VOICES.DAT`) tocando na Voz 23 dedicada ao navegar Left/Right e confirmar com **X**, com redução automática da música de fundo para **25%** durante a Seleção de Skatistas e restauração em **100%** nas fases.',
  '- **9 Gritos Alternados de Queda (*Bail*) + Biografias PT-BR Nativas (`á, ã, ç, é, ê, í, ó`):** 9 gritos extraídos injetados em `skate2/2g/2p .VAB/.SFX` (`0 B` extras em SPU RAM) com rotação estrita round-robin (`Hook_BailSfx @ 0x800E3400` + cooldown 50f) e fonte `s2bio.fnt` com glifos acentuados PT-BR para as biografias de Lulao e Bolsonaro.',
  '- **7 Skatistas Completamente Personalizados em Style A & B (28 modelos 3D `.PSX` + 7 retratos `s2face*.bmp`):**',
  '  - **Silvio Santos (Slot 1, ex-Bob Burnquist):** terno azul-marinho 2 botões, gravata, lenço branco de bolso + **microfone de peito 3D verdadeiramente geométrico (`+23v/+18f` em `Chest Mesh[8]` Hi/Lo-LOD)** (Style A) / camisa havaiana azul-royal com balão amarelo, palmeiras e hibiscos + bermuda xadrez sem joelheiras/cotoveleiras (Style B) + escultura facial 3D removendo chapéu pescador e capacete + retrato `s2face1.bmp` + **13 vozes**.',
  '  - **Lulao (Slot 2):** terno + faixa presidencial (Style A) / presidiário (Style B) + rosto + barriguinha 3D anatômica + biografia PT-BR + **14 vozes** + **Modo Carreira & Coletáveis 3D exclusivos** (`93` strings satíricas nas 8 fases com Trick+Gap `G6` 100% funcionais, **`S-K-A-T-E` → `T-A-X-A-S` 3D dinâmico** com letra `X`, **Barris Pinga 51** + **5 Haddads 3D Ajuste Fiscal** no Hangar, **5 Dilmas no Barril 3D** em School II, **5 Garrafas 3D de Pitú** em Venice Beach, `"Roubei mais 50!/100!/250!"`, e fala em cada dinheiro coletado e fim de partida com **0 ms de travamento / 60 FPS travados** via pré-cache adaptativo em RAM `LULAO_GPBANK`).',
  '  - **Bolsonaro (Slot 3):** terno + faixa (Style A) / listrado 171 (Style B) + rosto `bolsonaro_rosto.png` + cabelo curto 360° + **pescoço anatômico fino transplantado do Tony Hawk (`hawk2.psx`)** + biografia PT-BR + **14 vozes**.',
  '  - **Wagner Oliver (Slot 4):** moletom bordô `"CIÊNCIA DA COMPUTAÇÃO"` + jeans claro (Style A) / uniforme tático policial `"POLICJA"` + calça cargo + coturnos (Style B) + viseira 3D do Rune Glifberg removida.',
  '  - **Francis Paulo (Slot 7):** raglan branca `"Uber"` + `"99"` + jeans 4-bit (Style A) / kimono Shinigami Bleach preto com gola/faixa branca + hakama 4-bit (Style B) + cabelo volumoso 3D.',
  '  - **Valter Pacheco (Slot 9, ex-Andrew Reynolds):** camisa azul chambray manga longa + calça social (Style A) / camiseta verde `"SAN MICHEL"` + jeans com cinto e crachá (Style B) + restauração automática de foto 3×4 + cabelo grisalho/bigode 3D.',
  '  - **Natan Oliver (Slot 10):** camiseta azul `"LACTA"` com cordão vermelho e crachá + jeans (Style A) / terno preto com gravata vermelha e punhos brancos (Style B) + rosto e cabelo 3D.',
  '- **Auditoria Forense em 10 Estágios (0 erros):** todos os 48 arquivos originais mantêm LBA exato Redump + perfil `SLUS-01066.ini` incluso.',
  '',
  '### 🔐 Verificação de Integridade (Checksums)',
  '| Arquivo | Tamanho | Hash |',
  '| :--- | :---: | :--- |',
  `| Base Original Requerida (\`SLUS-01066\` Redump) | \`${manifest.originalBin.sizeBytes}\` B (\`${manifest.originalBin.sectors}\` setores) | MD5 \`${manifest.originalBin.md5}\`<br>SHA-1 \`${manifest.originalBin.sha1}\` |`,
  `| Patch \`THPS2_MOD_NTSC-U.xdelta\` | **${manifest.patch.sizeMB} MB** (\`${manifest.patch.sizeBytes}\` B) | SHA-256 \`${manifest.patch.sha256}\` |`,
  `| Resultado \`THPS2_MOD.bin\` (Verificado Round-Trip: ${manifest.patch.roundTripVerified ? '✅ SIM' : '⚠️'}) | \`${manifest.patchedBin.sizeBytes}\` B (\`${manifest.patchedBin.sectors}\` setores) | SHA-256 \`${manifest.patchedBin.sha256}\` |`,
  '',
  '### 📚 Para Desenvolvedores / Modders (`THPS2_PSX_Modding_Toolkit_and_Docs.zip`)',
  '- Inclui toda a enciclopédia técnica (`Docs/MAPA_01..14_*.md` incl. enciclopédia forense completa do THPS1 + guias + `CHANGELOG.md` + `HISTORIA_DO_PROJETO_THPS2_MOD.md`) e a suíte completa de scripts Node.js + Ghidra (`Scripts/`).',
  '',
  `> *Última atualização automática: \`${manifest.generatedAt}\` — Distribuição estritamente legal via patch delta (\`.xdelta\`), sem hospedar imagens comerciais completas.*`
].join('\n');

const checkRel = spawnSync('gh', ['release', 'view', releaseTag, '--repo', ghRepo], { encoding: 'utf8' });
if (checkRel.status === 0) {
  run('gh', ['release', 'upload', releaseTag, patchPath, patcherZip, toolkitZip, '--clobber', '--repo', ghRepo]);
  run('gh', ['release', 'edit', releaseTag, '--title', releaseTitle, '--notes', notes, '--latest', '--repo', ghRepo]);
} else {
  run('gh', ['release', 'create', releaseTag, patchPath, patcherZip, toolkitZip, '--title', releaseTitle, '--notes', notes, '--latest', '--repo', ghRepo]);
}

console.log(`\n=== PIPELINE COMPLETO CONCLUIDO COM SUCESSO! ===`);
console.log(`Release: https://github.com/${ghRepo}/releases/tag/${releaseTag}`);
