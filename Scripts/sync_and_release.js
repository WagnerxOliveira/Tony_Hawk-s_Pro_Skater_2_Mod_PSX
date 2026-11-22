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

// 3. Regenerate all 9 technical Markdown maps
console.log('\n=== 3. Regenerando mapas tecnicos em Docs/ ===');
run('node', [path.join(rootDir, 'tools', 'generate_all_docs.js')]);

// 4. Sync open-source scripts into repo/Scripts/
console.log('\n=== 4. Sincronizando scripts open-source para repo/Scripts/ ===');
const scriptsToSync = [
  'thps2_wad.js',
  'psx_media.js',
  'build_iso.js',
  'create_patch.js',
  'replace_videos.js',
  'mod_skater_lulao.js',
  'mod_skater_bolsonaro.js',
  'mod_hangar_walls.js',
  'build_skater_voices.js',
  'patch_random_videos_and_voices.js',
  'fix_game_errors.js',
  'audit_game.js',
  'generate_all_docs.js',
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

// 5. Git commit & push on main
console.log('\n=== 5. Git commit & push para GitHub (origin/main) ===');
run('git', ['-C', repoDir, 'add', 'README.md', 'Docs', 'Scripts']);
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

4. COMO JOGAR NO EMULADOR (CONFIGURACAO RECOMENDADA SEM LAG E SEM SUMIR OBJETOS)
   - DuckStation (Recomendado): File -> Start File -> selecione "THPS2_MOD.cue"
     * Para zero input lag e zero desaparecimento do skatista/objetos das fases:
       - Copie o perfil "SLUS-01066.ini" (incluso neste ZIP!) para a pasta "gamesettings" do DuckStation, OU configure:
         * PGXP Depth Buffer     : DESATIVADO (evita sumir skatista/rampas na Ordering Table do PS1)
         * Widescreen Hack       : DESATIVADO / Aspect Ratio 4:3 (evita sumir objetos nas bordas)
         * Max Queued Frames     : 2 (evita atraso de resposta no controle)
         * PGXP CPU Mode         : ATIVADO (estabiliza geometria 3D sem quebrar profundidade)
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
TextureFilter = Nearest
SpriteTextureFilter = Nearest
LineDetectMode = Disabled
MaxQueuedFrames = 2
PGXPEnable = true
PGXPCPU = true
PGXPVertexCache = false
PGXPTextureCorrection = true
PGXPColorCorrection = true
PGXPDepthBuffer = false
PGXPCulling = false
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
  '- **Vídeos Aleatórios no Boot com Duração Exata Original (Activision `13,87s` + Neversoft `17,73s` + Intro):** a cada inicialização no DuckStation, 3 vídeos customizados diferentes são sorteados automaticamente entre os 20 vídeos do disco (Setor 60 do Memory Card + timers HW PS1), respeitando a duração exata de cada animação original sem alterar os vídeos de final de carreira.',
  '- **Vozes Rotativas na Seleção de Skatistas (Lulao & Bolsonaro) + Música Suavizada (`-12 dB`):** 28 áudios exclusivos em SPU-ADPCM hardware (`14` Lulao + `14` Bolsonaro em `VOICES.DAT`) tocando na Voz 23 dedicada ao navegar Left/Right e confirmar com **X**, com redução automática da música de fundo para **25%** durante a Seleção de Skatistas e restauração em **100%** nas fases.',
  '- **Lulao (Style A & B) e Bolsonaro (Style A & B):** retratos, nomes, roupas customizadas, escultura 3D do rosto em todos os 8 modelos `.PSX` e murais 256 cores nas paredes da Fase 1 (*The Hangar*).',
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
  '- Inclui toda a enciclopédia técnica (`Docs/MAPA_01..09_*.md`) e a suíte completa de scripts Node.js + Ghidra (`Scripts/`).',
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
