#!/usr/bin/env node
'use strict';

/**
 * Automated Repo Sync, Git Commit/Merge/Push & Open-Source Toolkit Release Script
 *
 * Syncs local tools/ and docs/ into repo/, regenerates all 9 reverse-engineering Markdown maps,
 * commits cleanly, pushes to origin/main, and updates the public GitHub Release with ONLY
 * open-source tooling, Ghidra scripts, XML descriptors, and Markdown documentation
 * (never uploading copyrighted commercial game ISOs or game assets).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const repoDir = path.join(rootDir, 'repo');
const repoScriptsDir = path.join(repoDir, 'Scripts');
const releaseTag = 'v2.0-toolkit-docs';
const releaseTitle = 'THPS2 PSX Modding Toolkit & Complete Reverse Engineering Docs (v2.0)';

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`);
  }
  return r;
}

// 1. Regenerate all 9 technical maps directly from current workspace binaries
console.log('=== 1. Regenerando mapas tecnicos em Docs/ ===');
run('node', [path.join(rootDir, 'tools', 'generate_all_docs.js')]);

// 2. Sync open-source scripts into repo/Scripts/
console.log('\n=== 2. Sincronizando scripts open-source para repo/Scripts/ ===');
const scriptsToSync = [
  'thps2_wad.js',
  'psx_media.js',
  'build_iso.js',
  'replace_videos.js',
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

// Mirror README.md locally too
fs.copyFileSync(path.join(repoDir, 'README.md'), path.join(rootDir, 'README.md'));

// 3. Git commit & push on main
console.log('\n=== 3. Git commit & push para GitHub ===');
const commitMsg = process.argv[2] || 'docs/tools: Atualiza mapeamento completo de engenharia reversa e suite de modding THPS2 PSX';
run('git', ['-C', repoDir, 'add', 'README.md', 'Docs', 'Scripts']);
const statusRes = spawnSync('git', ['-C', repoDir, 'status', '--porcelain'], { encoding: 'utf8' });
if (statusRes.stdout.trim().length > 0) {
  run('git', ['-C', repoDir, 'commit', '-m', commitMsg]);
  run('git', ['-C', repoDir, 'push', 'origin', 'main']);
} else {
  console.log('  Nenhuma alteracao nova para commitar em repo/.');
}

// 4. Build clean open-source Toolkit + Docs Release ZIP (zero copyrighted binaries!)
console.log('\n=== 4. Empacotando Release open-source (Toolkit + Docs) ===');
const pkgDir = path.join(rootDir, 'build', '_release_toolkit_pkg');
const zipPath = path.join(rootDir, 'build', 'THPS2_PSX_Modding_Toolkit_and_Docs_v2.0.zip');
fs.rmSync(pkgDir, { recursive: true, force: true });
fs.mkdirSync(path.join(pkgDir, 'Docs'), { recursive: true });
fs.mkdirSync(path.join(pkgDir, 'Scripts'), { recursive: true });
fs.copyFileSync(path.join(repoDir, 'README.md'), path.join(pkgDir, 'README.md'));
for (const f of fs.readdirSync(path.join(repoDir, 'Docs'))) {
  if (f.endsWith('.md')) {
    fs.copyFileSync(path.join(repoDir, 'Docs', f), path.join(pkgDir, 'Docs', f));
  }
}
for (const f of scriptsToSync) {
  const p = path.join(repoScriptsDir, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(pkgDir, 'Scripts', f));
}
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${pkgDir}\\*' -DestinationPath '${zipPath}' -Force`]);
fs.rmSync(pkgDir, { recursive: true, force: true });

// 5. Create or update GitHub Release via gh CLI
console.log('\n=== 5. Atualizando GitHub Release (Toolkit + Documentacao) ===');
const notes = [
  '## 🛹 THPS2 PSX (SLUS-01066) — Modding Toolkit & Enciclopédia Técnica (v2.0)',
  '',
  '### Conteúdo deste pacote (100% open-source, sem binários proprietários):',
  '- **9 Mapas Técnicos de Engenharia Reversa (`Docs/MAPA_01..09_*.md`)**: endereços RAM/File de `SLUS_010.66`, cronômetro/física, todas as 11 fases + coordenadas XYZ dos 25 arquivos `.TRG`, todos os 20 skatistas/stats/decks, todas as manobras de `tricks.bin`, censo completo de `CD.WAD`/`.PRE`, cheats/controle/1.387 strings, `COMPILED.XA`/`.VAB`/35 vídeos `.STR`, 15 overlays `.BIN`/`.REL` e demo `BMX`.',
  '- **Suíte Node.js + Ghidra (`Scripts/`)**: `thps2_wad.js` (unpack/repack SHA-256 bit-a-bit de `CD.HED`/`CD.WAD`/`.PRE`), `psx_media.js` (conversor RIFF-CDXA ↔ 2336B + gerador XML `mkpsxiso`), `build_iso.js`, `replace_videos.js` (`ffmpeg`+`psxavenc`), `ghidra_apply_symbols.py` e `generate_all_docs.js`.',
  '',
  '> *Aviso legal: Esta release contém exclusivamente ferramentas de código aberto e documentação técnica. Utilize sua própria cópia legal de THPS2 NTSC-U (`SLUS-01066`) para compilar sua imagem local com `node Scripts/build_iso.js`.*'
].join('\n');

const checkRel = spawnSync('gh', ['release', 'view', releaseTag, '--repo', 'WagnerxOliveira/Tony_Hawk-s_Pro_Skater_2_Mod_PSX'], { encoding: 'utf8' });
if (checkRel.status === 0) {
  run('gh', ['release', 'upload', releaseTag, zipPath, '--clobber', '--repo', 'WagnerxOliveira/Tony_Hawk-s_Pro_Skater_2_Mod_PSX']);
  run('gh', ['release', 'edit', releaseTag, '--title', releaseTitle, '--notes', notes, '--repo', 'WagnerxOliveira/Tony_Hawk-s_Pro_Skater_2_Mod_PSX']);
} else {
  run('gh', ['release', 'create', releaseTag, zipPath, '--title', releaseTitle, '--notes', notes, '--repo', 'WagnerxOliveira/Tony_Hawk-s_Pro_Skater_2_Mod_PSX']);
}

console.log('\n=== SINCRONIZACAO E RELEASE CONCLUIDOS COM SUCESSO! ===');
