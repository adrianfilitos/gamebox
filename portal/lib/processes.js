const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PS = 'powershell.exe';
const PS_ARGS = ['-NoProfile', '-NonInteractive', '-Command'];

function ps(script) {
  const tmp = path.join(os.tmpdir(), 'gbps-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.txt');
  try {
    execFileSync(PS, PS_ARGS.concat([`${script} | Out-File -LiteralPath '${tmp}' -Encoding utf8`]), { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return fs.readFileSync(tmp, 'utf8').replace(/^\uFEFF/, '').trim();
  } catch (e) {
    throw new Error(String(e.message).split(/\r?\n/)[0]);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function list() {
  try {
    const script =
      'Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64,SessionId,MainWindowTitle | ConvertTo-Json -Compress';
    const out = ps(script);
    const data = JSON.parse(out.trim() || '[]');
    const arr = Array.isArray(data) ? data : [data];
    return arr
      .filter((p) => p && p.Id)
      .map((p) => ({
        pid: p.Id,
        name: p.ProcessName,
        cpu: Math.round((p.CPU || 0) * 10) / 10,
        mem: Math.round((p.WorkingSet64 || 0) / 1048576 * 10) / 10,
        session: p.SessionId,
        title: p.MainWindowTitle || '',
      }));
  } catch (e) {
    return { error: String(e.message) };
  }
}

function kill(pid) {
  try {
    process.kill(pid);
    return { ok: true };
  } catch (e) {
    try {
      execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' });
      return { ok: true };
    } catch (e2) {
      return { ok: false, error: String(e2.message).split(/\r?\n/)[0] };
    }
  }
}

// Extrae el nombre del ejecutable de un comando de lanzamiento.
function exeNameFromCommand(command) {
  if (!command) return null;
  const m = command.match(/([^"\\\/]+)\.exe/i);
  return m ? m[1].toLowerCase() : null;
}

// Devuelve {pid, name, cpu, mem, title} de los procesos cuyo exe coincide con el comando del juego.
function runningFor(games) {
  const procs = list();
  if (!Array.isArray(procs)) return { procs: [], error: procs.error };
  const out = [];
  for (const g of games || []) {
    if (!g.command || /shell:AppsFolder/i.test(g.command)) continue;
    const exe = exeNameFromCommand(g.command);
    if (!exe) continue;
    const found = procs.filter((p) => p.name.toLowerCase() === exe || p.name.toLowerCase().includes(exe));
    if (found.length) {
      found.forEach((f) => out.push(Object.assign({ gameId: g.id, gameName: g.name }, f)));
    }
  }
  return { procs: out };
}

module.exports = { list, kill, runningFor, exeNameFromCommand };
