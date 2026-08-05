const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const httpProxy = require('http-proxy');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const PORT = CONFIG.moonlight.port || 4443;
const ML_TARGET = CONFIG.moonlight.target;
const ML_PREFIX = CONFIG.moonlight.pathPrefix || '/ml';
const SUNSHINE = CONFIG.sunshine;

const app = express();
app.use(express.json());

const ML_USER = 'admin';

app.get('/api/me', (req, res) => {
  res.json({ user: ML_USER });
});

function sunshineRequest(pathname, { method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUNSHINE.baseUrl + pathname);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        rejectUnauthorized: false,
        headers: { Authorization: 'Basic ' + Buffer.from(`${SUNSHINE.username}:${SUNSHINE.password}`).toString('base64') },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function sunshineAppList() {
  const r = await sunshineRequest('/api/apps');
  if (r.status !== 200) throw new Error('Sunshine API ' + r.status);
  return JSON.parse(r.body).apps || [];
}

function activeInteractiveUser() {
  const { execSync } = require('child_process');
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

function launchInSession(launchCmd) {
  const dir = 'C:\\GameBox\\portal-launch';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'launch-request.txt'), launchCmd, 'utf8');
  const users = activeInteractiveUser();
  if (!users.length) return { ok: false, error: 'No hay una sesiÃ³n interactiva activa (nadie logueado en el equipo).' };
  const { execSync } = require('child_process');
  const results = [];
  for (const u of users) {
    const task = `GameBox-Launch-${u}`;
    try {
      execSync(`schtasks /run /tn "${task}"`, { encoding: 'utf8' });
      results.push(`tarea ${task} lanzada`);
    } catch (e) {
      results.push(`tarea ${task} fallÃ³: ${String(e.message).split(/\r?\n/)[0]}`);
    }
  }
  return { ok: true, detail: results.join('; ') };
}

app.get('/api/games', async (req, res) => {
  try {
    const gamesPath = path.join(__dirname, 'games.json');
    const games = fs.existsSync(gamesPath) ? JSON.parse(fs.readFileSync(gamesPath, 'utf8')) : [];
    res.json({ games });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/play/:id', async (req, res) => {
  try {
    const gamesPath = path.join(__dirname, 'games.json');
    const games = fs.existsSync(gamesPath) ? JSON.parse(fs.readFileSync(gamesPath, 'utf8')) : [];
    const game = games.find((g) => g.id === req.params.id);
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' });
    if (!game.command) return res.status(400).json({ error: 'Este juego no tiene comando de lanzamiento configurado' });
    const result = launchInSession(game.command);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get('/api/status', async (req, res) => {
  const status = {
    portal: { up: true, port: PORT },
    sunshine: { up: false, apps: 0 },
    moonlight: { up: false },
    tailscale: { ip: null },
    activeUser: null,
  };
  try {
    const apps = await sunshineAppList();
    status.sunshine.up = true;
    status.sunshine.apps = apps.length;
  } catch (e) {
    status.sunshine.error = String(e.message);
  }
  try {
    const r = await fetch(`http://127.0.0.1:8080${ML_PREFIX}/`, { signal: AbortSignal.timeout(4000) });
    status.moonlight.up = r.ok;
  } catch {
    status.moonlight.up = false;
  }
  try {
    const { execSync } = require('child_process');
    const out = execSync('"C:\\Program Files\\Tailscale\\tailscale.exe" ip -4', { encoding: 'utf8' });
    status.tailscale.ip = out.trim() || null;
  } catch {
    status.tailscale.ip = null;
  }
  try {
    const users = activeInteractiveUser();
    status.activeUser = users[0] || null;
  } catch {}
  res.json(status);
});

const proxy = httpProxy.createProxyServer({ target: ML_TARGET, ws: true, changeOrigin: false });

proxy.on('error', (err, req, res) => {
  if (res && res.writeHead) {
    try { res.writeHead(502); res.end('Proxy error'); } catch {}
  }
});

app.use(ML_PREFIX, (req, res) => {
  req.headers['x-forwarded-user'] = ML_USER;
  req.headers['x-forwarded-proto'] = 'https';
  delete req.headers['x-forwarded-for'];
  req.url = req.originalUrl;
  proxy.web(req, res);
});

const sunshineProxy = httpProxy.createProxyServer({ target: SUNSHINE.baseUrl, secure: false, changeOrigin: true });
sunshineProxy.on('error', (err, req, res) => {
  if (res && res.writeHead) {
    try { res.writeHead(502); res.end('Proxy error'); } catch {}
  }
});

app.use('/sunshine', (req, res) => {
  const basic = 'Basic ' + Buffer.from(`${SUNSHINE.username}:${SUNSHINE.password}`).toString('base64');
  req.headers.authorization = basic;
  req.headers['x-forwarded-proto'] = 'https';
  delete req.headers['x-forwarded-for'];
  req.url = req.originalUrl.replace(/^\/sunshine/, '') || '/';
  sunshineProxy.web(req, res);
});

app.use(express.static(path.join(__dirname, 'public')));

const keyPath = CONFIG.moonlight.ssl.privateKeyPem;
const certPath = CONFIG.moonlight.ssl.certificatePem;
const httpsServer = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app);

httpsServer.on('upgrade', (req, socket, head) => {
  if (!req.url || !req.url.startsWith(ML_PREFIX)) {
    socket.destroy();
    return;
  }
  req.headers['x-forwarded-user'] = ML_USER;
  req.headers['x-forwarded-proto'] = 'https';
  delete req.headers['x-forwarded-for'];
  proxy.ws(req, socket, head);
});

httpsServer.listen(PORT, '0.0.0.0', () => {
  console.log(`GameBox portal escuchando en https://0.0.0.0:${PORT}`);
});
