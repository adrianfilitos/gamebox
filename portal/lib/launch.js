const fs = require('fs');
const path = require('path');
const { execSync, execFileSync, spawn } = require('child_process');

const log = require('./log');

function activeInteractiveUser() {
  try {
    const out = execSync('powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_ComputerSystem).UserName"', { encoding: 'utf8' });
    const name = out.trim();
    if (name && name.includes('\\')) {
      const u = name.split('\\').pop();
      if (u && u.toUpperCase() !== 'SYSTEM') return [u];
    }
  } catch {}
  try {
    const out = execSync('query user', { encoding: 'utf8', shell: 'cmd.exe' });
    const users = [];
    for (const line of out.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      if (/NOMBRE|USERNAME|Nombre|SESI|ID\./i.test(t)) continue;
      const m = t.replace(/^>/, '').trim().split(/\s{2,}/);
      if (m.length && m[0]) users.push(m[0]);
    }
    return users;
  } catch {
    return [];
  }
}

// Lanzamiento en la sesión interactiva mediante tarea programada (modo sistema/kiosko).
function launchViaTask(command) {
  const dir = path.join(__dirname, '..', 'launch');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'launch-request.txt'), command, 'utf8');
  const users = activeInteractiveUser();
  if (!users.length) return { ok: false, error: 'No hay una sesión interactiva activa.' };
  const results = [];
  for (const u of users) {
    const task = `GameBox-Launch-${u}`;
    try {
      execSync(`schtasks /run /tn "${task}"`, { encoding: 'utf8' });
      results.push(`tarea ${task} lanzada`);
    } catch (e) {
      results.push(`tarea ${task}: ${String(e.message).split(/\r?\n/)[0]}`);
    }
  }
  log.info('lanzado por tarea', { command, users });
  return { ok: true, detail: results.join('; ') };
}

// Lanzamiento directo desde el propio usuario (modo usuario normal).
function launchDirect(command) {
  try {
    const dir = path.join(__dirname, '..', 'launch');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'launch-user.cmd');
    fs.writeFileSync(file, command.replace(/^\s+/, '') + '\n', 'utf8');
    const p = spawn('cmd.exe', ['/c', 'start', '/b', file], { detached: true, stdio: 'ignore', windowsHide: true });
    p.unref();
    log.info('lanzado directo', { command });
    return { ok: true, detail: 'proceso iniciado' };
  } catch (e) {
    log.error('error al lanzar directo', { command, error: e.message });
    return { ok: false, error: String(e.message) };
  }
}

function launch(command, mode) {
  if (mode === 'system') return launchViaTask(command);
  return launchDirect(command);
}

module.exports = { launch, launchDirect, launchViaTask, activeInteractiveUser };
