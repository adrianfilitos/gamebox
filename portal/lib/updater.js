const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { execFileSync } = require('child_process');

const PS = 'powershell.exe';

function semverCompare(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split('.').map(Number);
  const pb = String(b || '').replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function fetchJson(url, timeout = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'GameBox/2.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function check(manifestUrl, currentVersion) {
  if (!manifestUrl) return { enabled: false, reason: 'Sin URL de actualizaciones configurada' };
  let manifest;
  try {
    manifest = await fetchJson(manifestUrl);
  } catch (e) {
    return { enabled: true, error: 'No se pudo consultar: ' + e.message, current: currentVersion };
  }
  const latest = manifest.version;
  const cmp = semverCompare(currentVersion, latest);
  return {
    enabled: true,
    current: currentVersion,
    latest: latest,
    update: cmp < 0,
    url: manifest.url || null,
    sha256: manifest.sha256 || null,
    notes: manifest.notes || null,
  };
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'GameBox/2.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync(PS, ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`], { encoding: 'utf8' });
}

// Aplica la actualización de forma asíncrona:
// 1. Descarga y extrae a updates/stage-<version>
// 2. Copia los archivos preservados
// 3. Genera update.ps1 y lo lanza desacoplado (hace el swap y reinicia)
async function apply(manifest, ctx) {
  const { version, url } = manifest;
  if (!version || !url) throw new Error('Manifest incompleto');
  const rootDir = ctx.rootDir;
  const updatesDir = path.join(rootDir, 'updates');
  const stageDir = path.join(updatesDir, 'stage-' + version);
  fs.mkdirSync(stageDir, { recursive: true });

  const zipPath = path.join(updatesDir, 'download-' + version + '.zip');
  await download(url, zipPath);
  extractZip(zipPath, stageDir);

  // Si el zip trae una carpeta raíz, muévela un nivel.
  const inner = fs.readdirSync(stageDir);
  if (inner.length === 1 && fs.statSync(path.join(stageDir, inner[0])).isDirectory()) {
    const tmp = path.join(updatesDir, 'stage-' + version + '-inner');
    fs.renameSync(path.join(stageDir, inner[0]), tmp);
    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.renameSync(tmp, stageDir);
  }

  // Preservar datos (config, juegos, stats, portadas, logs, version propio no).
  const preserve = ctx.preserve || ['config.json', 'games.json', 'stats.json', 'covers', 'logs'];
  for (const name of preserve) {
    const src = path.join(ctx.appDir, name);
    const dst = path.join(stageDir, name);
    if (fs.existsSync(src)) {
      fs.rmSync(dst, { recursive: true, force: true });
      fs.cpSync(src, dst, { recursive: true });
    }
  }

  // Escribir el script de actualización.
  const script = path.join(updatesDir, 'update-' + version + '.ps1');
  const scriptBody = buildUpdateScript({
    rootDir,
    appDir: ctx.appDir,
    stageDir,
    version,
    startCmd: ctx.startCmd,
    taskName: ctx.taskName,
  });
  fs.writeFileSync(script, scriptBody, 'utf8');

  const ps = spawn(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  ps.unref();

  return { ok: true, script, version };
}

function buildUpdateScript({ rootDir, appDir, stageDir, version, startCmd, taskName }) {
  return `
$ErrorActionPreference = 'Stop'
Start-Sleep -Seconds 2
$old = Join-Path '${rootDir.replace(/\\/g, '\\\\')}' 'app.old-${version}'
$app = '${appDir.replace(/\\/g, '\\\\')}'
$stage = '${stageDir.replace(/\\/g, '\\\\')}'
# Detener el servicio del portal si está gestionado por tarea programada
if ('${taskName}') { schtasks /End /TN '${taskName}' 2>$null | Out-Null }
Start-Sleep -Seconds 1
# Terminar el proceso node del portal (este mismo proceso puede ser el que lanza el script)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
if (Test-Path $old) { Remove-Item -Recurse -Force $old }
Move-Item -LiteralPath $app -Destination $old
Move-Item -LiteralPath $stage -Destination $app
Remove-Item -Recurse -Force (Join-Path '${rootDir.replace(/\\/g, '\\\\')}' 'updates') -ErrorAction SilentlyContinue
# Arrancar de nuevo
if ('${taskName}') {
  schtasks /Run /TN '${taskName}' 2>$null | Out-Null
} elseif ('${startCmd}') {
  Start-Process -FilePath '${startCmd.replace(/'/g, "''")}' -WindowStyle Hidden
}
`;
}

module.exports = { check, apply, semverCompare };
