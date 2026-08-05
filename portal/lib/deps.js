const { execFileSync } = require('child_process');

const PS = 'powershell.exe';
const PS_ARGS = ['-NoProfile', '-NonInteractive', '-Command'];

function ps(script) {
  try {
    return execFileSync(PS, PS_ARGS.concat(['[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;' + script]), { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
  } catch (e) {
    return String(e.message).split(/\r?\n/)[0];
  }
}

function viGEmBus() {
  try {
    const out = ps("(Get-Service -Name 'ViGEmBus' -ErrorAction SilentlyContinue).Status");
    const running = /running/i.test(out);
    return { ok: running, installed: !!out, detail: out ? (running ? 'Driver activo' : 'Instalado pero no iniciado (' + out + ')') : 'No instalado' };
  } catch (e) {
    return { ok: false, installed: false, detail: 'No instalado' };
  }
}

function sunshine() {
  try {
    const out = ps("(Get-NetTCPConnection -LocalPort 47990 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count");
    return { ok: Number(out) > 0, detail: Number(out) > 0 ? 'Panel en localhost:47990' : 'Servicio no escuchando' };
  } catch (e) {
    return { ok: false, detail: String(e.message) };
  }
}

function moonlight() {
  try {
    const out = ps("(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count");
    return { ok: Number(out) > 0, detail: Number(out) > 0 ? 'Consola en localhost:8080' : 'No escuchando' };
  } catch (e) {
    return { ok: false, detail: String(e.message) };
  }
}

function tailscale() {
  try {
    const out = execFileSync('C:\\Program Files\\Tailscale\\tailscale.exe', ['ip', '-4'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    return { ok: !!out, ip: out || null, detail: out ? 'IP ' + out : 'No conectado' };
  } catch {
    return { ok: false, ip: null, detail: 'No instalado' };
  }
}

function port(port) {
  try {
    const out = ps(`(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count`);
    return { ok: Number(out) > 0, detail: Number(out) > 0 ? `Puerto ${port} en uso (servidor)` : `Puerto ${port} libre` };
  } catch (e) {
    return { ok: false, detail: String(e.message) };
  }
}

function checkAll(version, portNumber) {
  return [
    { id: 'node', name: 'Node.js', ok: true, detail: 'Node.js ' + process.version.replace(/^v/, '') + ' integrado' },
    { id: 'vigembus', name: 'ViGEmBus (mandos)', ...viGEmBus() },
    { id: 'sunshine', name: 'Sunshine (streaming)', ...sunshine() },
    { id: 'moonlight', name: 'Consola Moonlight Web', ...moonlight() },
    { id: 'tailscale', name: 'Tailscale (VPN)', ...tailscale() },
    { id: 'port', name: 'Puerto ' + portNumber, ...port(portNumber) },
  ];
}

module.exports = { checkAll, viGEmBus, sunshine, moonlight, tailscale };
