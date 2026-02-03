const fs = require('fs');
const path = require('path');

function fileStatSafe(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function listFilesSafe(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

function pickBestCandidate(candidates, preferredSubstrings = []) {
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((filePath) => {
      const stat = fileStatSafe(filePath);
      const base = path.basename(filePath).toLowerCase();
      let score = 0;

      for (const s of preferredSubstrings) {
        if (s && base.includes(String(s).toLowerCase())) score += 100;
      }

      if (stat) {
        score += Math.min(50, Math.floor(stat.size / (1024 * 1024))); // size heuristic
        score += Math.min(50, Math.floor(stat.mtimeMs / 1e9)); // weak tie-break
      }

      return { filePath, score, mtimeMs: stat?.mtimeMs ?? 0, size: stat?.size ?? 0 };
    })
    .sort((a, b) => (b.score - a.score) || (b.mtimeMs - a.mtimeMs) || (b.size - a.size));

  return scored[0].filePath;
}

function ensureDirExists(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(source, dest) {
  ensureDirExists(path.dirname(dest));
  fs.copyFileSync(source, dest);
}

function main() {
  const desktopDir = path.resolve(__dirname, '..');
  const pkgPath = path.join(desktopDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const version = pkg.version;

  const distDir = path.join(desktopDir, 'dist_release');

  const stableZip = path.join(distDir, 'ICS-Analyzer-Windows-Installer.zip');
  const stableExe = path.join(distDir, 'ICS-Analyzer-Windows-Installer.exe');
  const stableBlockmap = path.join(distDir, 'ICS-Analyzer-Windows-Installer.exe.blockmap');

  const files = listFilesSafe(distDir);
  if (files.length === 0) {
    console.error(`[stable-assets] Pasta de saída vazia ou ausente: ${distDir}`);
    process.exitCode = 1;
    return;
  }

  const zipCandidates = files
    .filter((f) => f.toLowerCase().endsWith('.zip'))
    .filter((f) => f.toLowerCase() !== path.basename(stableZip).toLowerCase())
    .map((f) => path.join(distDir, f));

  const exeCandidates = files
    .filter((f) => f.toLowerCase().endsWith('.exe'))
    .filter((f) => f.toLowerCase() !== path.basename(stableExe).toLowerCase())
    .map((f) => path.join(distDir, f));

  const blockmapCandidates = files
    .filter((f) => f.toLowerCase().endsWith('.blockmap'))
    .filter((f) => f.toLowerCase() !== path.basename(stableBlockmap).toLowerCase())
    .map((f) => path.join(distDir, f));

  const preferred = [`-${version}`, 'windows-installer', 'installer'];

  const zipSource = pickBestCandidate(zipCandidates, preferred);
  const exeSource = pickBestCandidate(exeCandidates, preferred);
  const blockmapSource = pickBestCandidate(blockmapCandidates, preferred);

  if (!zipSource && !exeSource) {
    console.error('[stable-assets] Não encontrei artefatos .zip/.exe em dist_release/.');
    process.exitCode = 1;
    return;
  }

  const outputs = [];

  if (zipSource) {
    copyFile(zipSource, stableZip);
    outputs.push({ type: 'zip', src: zipSource, dest: stableZip });
  } else {
    console.warn('[stable-assets] Aviso: não encontrei .zip para copiar.');
  }

  if (exeSource) {
    copyFile(exeSource, stableExe);
    outputs.push({ type: 'exe', src: exeSource, dest: stableExe });
  }

  if (blockmapSource && exeSource) {
    copyFile(blockmapSource, stableBlockmap);
    outputs.push({ type: 'blockmap', src: blockmapSource, dest: stableBlockmap });
  }

  console.log('[stable-assets] OK. Artefatos estáveis gerados/atualizados:');
  for (const o of outputs) {
    console.log(`- ${o.type}: ${path.basename(o.dest)}  (de ${path.basename(o.src)})`);
  }

  console.log('[stable-assets] Upload esperado no GitHub Release (para evitar 404):');
  console.log(`- ${path.basename(stableZip)}`);
}

main();
