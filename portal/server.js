const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const express = require('express');
const httpProxy = require('http-proxy');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const PORT = CONFIG.moonlight.port || 4443;
const ML_TARGET = CONFIG.moonlight.target;
const ML_PREFIX = CONFIG.moonlight.pathPrefix || '/ml';
const AUTH = CONFIG.auth;
const SUNSHINE = CONFIG.sunshine;

const app = express();
app.use(express.json());

function sign(data) {
  return crypto.createHmac('sha256', AUTH.sessionSecret).update(data).digest('base64url');
}

function makeToken(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 7 * 24 * 3600 * 1000 })).toString('base64url');
  return payload + '.' + sign(payload);
}

function verifyToken(token) {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data.u;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

function currentUser(req) {
  return verifyToken(parseCookies(req.headers.cookie || '')['gb_session']);
}

function requireAuth(req, res, next) {
  if (!currentUser(req)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' });
  const okUser = crypto.timingSafeEqual(Buffer.from(username), Buffer.from(AUTH.username));
  const okPass = crypto.timingSafeEqual(Buffer.from(password), Buffer.from(AUTH.password));
  if (!okUser || !okPass) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const token = makeToken(username);
  res.setHeader('Set-Cookie', `gb_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}`);
  res.json({ ok: true, user: username });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'gb_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: currentUser(req) });
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
  try {
    const out = require('child_process').execSync('query user', { encoding: 'utf8', shell: 'cmd.exe' });
    const lines = out.split(/\r?\n/).filter((l) => l.trim());
    const users = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const m = line.trim().split(/\s{2,}/);
      if (m.length >= 2 && m[0] !== 'USERNAME' && m[0] !== 'Nombre') users.push(m[0]);
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
  if (!users.length) return { ok: false, error: 'No hay una sesión interactiva activa (nadie logueado en el equipo).' };
  const { execSync } = require('child_process');
  const results = [];
  for (const u of users) {
    const task = `GameBox-Launch-${u}`;
    try {
      execSync(`schtasks /run /tn "${task}"`, { encoding: 'utf8' });
      results.push(`tarea ${task} lanzada`);
    } catch (e) {
      results.push(`tarea ${task} falló: ${String(e.message).split(/\r?\n/)[0]}`);
    }
  }
  return { ok: true, detail: results.join('; ') };
}

app.get('/api/games', requireAuth, async (req, res) => {
  try {
    const gamesPath = path.join(__dirname, 'games.json');
    const games = fs.existsSync(gamesPath) ? JSON.parse(fs.readFileSync(gamesPath, 'utf8')) : [];
    res.json({ games });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/play/:id', requireAuth, async (req, res) => {
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

app.get('/api/status', requireAuth, async (req, res) => {
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
    const { execSync } = require('child_process');
    const out = execSync('query user', { encoding: 'utf8', shell: 'cmd.exe' });
    const lines = out.split(/\r?\n/).filter((l) => l.trim());
    for (const line of lines) {
      const m = line.trim().split(/\s{2,}/);
      if (m.length >= 2 && m[0] !== 'USERNAME' && m[0] !== 'Nombre') {
        status.activeUser = m[0];
        break;
      }
    }
  } catch {}
  res.json(status);
});

const proxy = httpProxy.createProxyServer({ target: ML_TARGET, ws: true, changeOrigin: false });

proxy.on('error', (err, req, res) => {
  if (res && res.writeHead) {
    try { res.writeHead(502); res.end('Proxy error'); } catch {}
  }
});

app.use(ML_PREFIX, requireAuth, (req, res) => {
  req.headers['x-forwarded-user'] = currentUser(req);
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

app.use('/sunshine', requireAuth, (req, res) => {
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
  const user = verifyToken(parseCookies(req.headers.cookie || '')['gb_session']);
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  req.headers['x-forwarded-user'] = user;
  req.headers['x-forwarded-proto'] = 'https';
  delete req.headers['x-forwarded-for'];
  proxy.ws(req, socket, head);
});

httpsServer.listen(PORT, '0.0.0.0', () => {
  console.log(`GameBox portal escuchando en https://0.0.0.0:${PORT}`);
});
