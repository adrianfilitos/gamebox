const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, execFileSync } = require('child_process');
const express = require('express');
const httpProxy = require('http-proxy');

const log = require('./lib/log');
const cert = require('./lib/cert');
const detect = require('./lib/detect');
const covers = require('./lib/covers');
const deps = require('./lib/deps');
const launch = require('./lib/launch');
const processes = require('./lib/processes');
const stats = require('./lib/stats');
const updater = require('./lib/updater');

const APP_DIR = __dirname;
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');

function readJson(p, dflt) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch { return dflt; }
}

let CONFIG = readJson(path.join(APP_DIR, 'config.json'), {});

function saveConfig() {
  try { fs.writeFileSync(path.join(APP_DIR, 'config.json'), JSON.stringify(CONFIG, null, 2), 'utf8'); return true; } catch { return false; }
}

function appVersion() {
  try { return readJson(path.join(APP_DIR, 'version.json'), {}).version || CONFIG.app?.version || '2.0.0'; } catch { return '2.0.0'; }
}

const APP_VERSION = appVersion();
const PORT = CONFIG.app?.port || CONFIG.moonlight?.port || 4443;
const ML_TARGET = CONFIG.moonlight?.target;
const ML_PREFIX = CONFIG.moonlight?.pathPrefix || '/ml';
const SUNSHINE = CONFIG.sunshine;
const SETTINGS = Object.assign(
  {
    launchMode: 'user',
    autoStart: false,
    checkUpdates: true,
    updateManifest: '',
    scanOnStart: true,
    language: 'es',
    wizardCompleted: false,
  },
  CONFIG.settings || {}
);

const app = express();
app.use(express.json({ limit: '4mb' }));

log.info('inicio', { version: APP_VERSION, dir: APP_DIR, port: PORT });

// ---------- Biblioteca ----------
const GAMES_FILE = path.join(APP_DIR, 'games.json');

function readLibrary() {
  return readJson(GAMES_FILE, []);
}
function writeLibrary(list) {
  try {
    fs.writeFileSync(GAMES_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

function fileExistsCheck(command) {
  if (!command) return true;
  const m = command.match(/"([^"]+\.exe)"/i);
  if (m) return fs.existsSync(m[1]);
  return true;
}

function rescanLibrary() {
  const detection = detect.detect();
  const library = readLibrary();
  const byId = {};
  for (const g of library) byId[g.id] = g;

  const detected = [].concat(detection.steam, detection.epic, detection.xbox);
  for (const d of detected) {
    if (byId[d.id]) {
      Object.assign(byId[d.id], {
        name: d.name,
        description: d.description,
        command: d.command,
        category: d.category,
        detectedBy: d.detectedBy,
        coverUrl: d.coverUrl,
        exeName: d.exeName,
        installed: true,
      });
    } else {
      byId[d.id] = Object.assign({}, d, { favorite: false, hidden: false });
    }
  }
  for (const g of Object.values(byId)) {
    if (g.detectedBy) {
      g.installed = detected.some((d) => d.id === g.id);
    } else {
      g.installed = fileExistsCheck(g.command);
    }
    if (g.installed === undefined) g.installed = true;
  }
  const merged = Object.values(byId);
  writeLibrary(merged);
  log.info('biblioteca actualizada', { detected: detected.length, total: merged.length, errors: detection.errors });
  return { total: merged.length, detected: detected.length, errors: detection.errors, sources: {
    steam: detection.steam.length, epic: detection.epic.length, xbox: detection.xbox.length,
  } };
}

function withMeta(game) {
  const st = stats.summary().games.find((g) => g.id === game.id);
  return Object.assign({}, game, {
    cover: '/api/covers/' + encodeURIComponent(game.id),
    stats: st || { launches: 0, playSeconds: 0, lastLaunched: null },
  });
}

// ---------- API ----------
app.get('/api/app', (req, res) => {
  res.json({ name: CONFIG.app?.name || 'GameBox', version: APP_VERSION, dir: APP_DIR, root: ROOT_DIR });
});

app.get('/api/status', async (req, res) => {
  const status = {
    portal: { up: true, port: PORT, version: APP_VERSION },
    sunshine: { up: false, apps: 0 },
    moonlight: { up: false, configured: !!ML_TARGET },
    tailscale: { ip: null },
    activeUser: null,
  };
  if (SUNSHINE) {
    try {
      const r = await new Promise((resolve, reject) => {
        const url = new URL(SUNSHINE.baseUrl + '/api/apps');
        const req = https.request({
          hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', rejectUnauthorized: false,
          headers: { Authorization: 'Basic ' + Buffer.from(`${SUNSHINE.username}:${SUNSHINE.password}`).toString('base64') },
        }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
        req.on('error', reject); req.end();
      });
      status.sunshine.up = r.status === 200;
      if (r.status === 200) status.sunshine.apps = (JSON.parse(r.body).apps || []).length;
    } catch (e) { status.sunshine.error = e.message; }
  }
  if (ML_TARGET) {
    try {
      const r = await fetch(ML_TARGET + ML_PREFIX + '/', { signal: AbortSignal.timeout(4000) });
      status.moonlight.up = r.ok;
    } catch { status.moonlight.up = false; }
  }
  try {
    const out = execSync('"C:\\Program Files\\Tailscale\\tailscale.exe" ip -4', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    status.tailscale.ip = out.trim() || null;
  } catch {}
  try { status.activeUser = launch.activeInteractiveUser()[0] || null; } catch {}
  res.json(status);
});

app.get('/api/games', (req, res) => {
  let games = readLibrary();
  games = games.filter((g) => !g.hidden);
  res.json({ games: games.map(withMeta) });
});

app.get('/api/categories', (req, res) => {
  const games = readLibrary().filter((g) => !g.hidden);
  const map = {};
  for (const g of games) {
    const c = g.category || 'Otros';
    map[c] = (map[c] || 0) + 1;
  }
  res.json({ categories: Object.keys(map).map((name) => ({ name, count: map[name] })) });
});

app.post('/api/games/rescan', (req, res) => {
  try { res.json(rescanLibrary()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/games/:id', (req, res) => {
  const library = readLibrary();
  const g = library.find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'No encontrado' });
  for (const k of ['name', 'description', 'command', 'category', 'favorite', 'hidden']) {
    if (k in req.body) g[k] = req.body[k];
  }
  writeLibrary(library);
  res.json({ ok: true, game: g });
});

app.post('/api/games/clear-hidden', (req, res) => {
  const library = readLibrary();
  for (const g of library) if (g.hidden) g.hidden = false;
  writeLibrary(library);
  res.json({ ok: true, restored: library.length });
});

app.get('/api/covers/:id', async (req, res) => {
  const id = req.params.id;
  const game = readLibrary().find((g) => g.id === id);
  const file = covers.resolve(id, game && game.coverUrl);
  if (file) return res.sendFile(file);
  const name = (game && game.name) || id;
  res.set('Content-Type', 'image/svg+xml');
  res.send(covers.placeholderSvg(id, name));
});

app.post('/api/play/:id', (req, res) => {
  try {
    const game = readLibrary().find((g) => g.id === req.params.id);
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' });
    if (!game.command) return res.status(400).json({ error: 'Este elemento no tiene comando de lanzamiento' });
    if (game.installed === false) return res.status(400).json({ error: 'El juego no está instalado en el equipo' });
    const result = launch.launch(game.command, SETTINGS.launchMode);
    if (result.ok) stats.trackLaunch(game);
    log.info('lanzar', { id: game.id, name: game.name, mode: SETTINGS.launchMode, ok: result.ok });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Procesos ----------
app.get('/api/processes', (req, res) => {
  const games = readLibrary().filter((g) => g.command);
  const running = processes.runningFor(games);
  const all = processes.list();
  res.json({ all: Array.isArray(all) ? all : [], running: Array.isArray(running.procs) ? running.procs : [] });
});

app.post('/api/processes/kill', (req, res) => {
  const pid = parseInt(req.body.pid, 10);
  if (!pid) return res.status(400).json({ error: 'pid requerido' });
  res.json(processes.kill(pid));
});

// ---------- Estadísticas ----------
app.get('/api/stats', (req, res) => {
  res.json(stats.summary());
});

// ---------- Logs ----------
app.get('/api/logs', (req, res) => {
  const lines = Math.min(parseInt(req.query.lines, 10) || 200, 2000);
  res.json({ logs: log.tail(lines, req.query.filter) });
});

app.get('/api/health', (req, res) => {
  res.json({
    up: true,
    uptimeSec: Math.round(process.uptime()),
    version: APP_VERSION,
    errors: log.recentErrors(20),
    deps: deps.checkAll(APP_VERSION, PORT),
  });
});

// ---------- Dependencias ----------
app.get('/api/deps', (req, res) => {
  res.json({ deps: deps.checkAll(APP_VERSION, PORT) });
});

// ---------- Ajustes ----------
app.get('/api/settings', (req, res) => {
  res.json({ settings: SETTINGS, app: { name: CONFIG.app?.name || 'GameBox', version: APP_VERSION } });
});

app.post('/api/settings', (req, res) => {
  const allowed = ['launchMode', 'autoStart', 'checkUpdates', 'updateManifest', 'scanOnStart', 'language', 'wizardCompleted'];
  for (const k of allowed) {
    if (k in req.body) SETTINGS[k] = req.body[k];
  }
  CONFIG.settings = SETTINGS;
  saveConfig();
  applyAutoStart(SETTINGS.autoStart);
  log.info('ajustes guardados', { launchMode: SETTINGS.launchMode, autoStart: SETTINGS.autoStart });
  res.json({ ok: true, settings: SETTINGS });
});

function applyAutoStart(enabled) {
  const task = CONFIG.app?.taskName || 'GameBox-App';
  const script = CONFIG.app?.startScript;
  if (!script) return;
  try {
    if (enabled) {
      execFileSync('schtasks.exe', ['/Create', '/F', '/TN', task, '/TR', `"${script}"`, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/IT'], { encoding: 'utf8' });
    } else {
      execFileSync('schtasks.exe', ['/Delete', '/F', '/TN', task], { encoding: 'utf8' });
    }
  } catch {}
}

// ---------- Configuración (archivo) ----------
function sanitizedConfig() {
  const c = JSON.parse(JSON.stringify(CONFIG));
  const mask = (o, keys) => { for (const k of keys) if (o && k in o) o[k] = '••••'; };
  mask(c.sunshine, ['password']);
  mask(c.kiosk, ['password']);
  mask(c.auth, ['password', 'sessionSecret']);
  return c;
}

app.get('/api/config', (req, res) => {
  res.json({ config: sanitizedConfig(), path: path.join(APP_DIR, 'config.json') });
});

app.post('/api/config', (req, res) => {
  if (req.body.app) CONFIG.app = Object.assign({}, CONFIG.app, req.body.app);
  if (req.body.settings) {
    for (const k of Object.keys(req.body.settings)) if (k in SETTINGS) SETTINGS[k] = req.body.settings[k];
    CONFIG.settings = SETTINGS;
  }
  saveConfig();
  res.json({ ok: true, config: sanitizedConfig() });
});

// ---------- Actualizaciones ----------
app.get('/api/update/check', async (req, res) => {
  try {
    const r = await updater.check(SETTINGS.updateManifest, APP_VERSION);
    log.info('comprobar actualización', { r });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/update/apply', async (req, res) => {
  try {
    const manifest = req.body;
    if (!manifest.url) {
      const r = await updater.check(SETTINGS.updateManifest, APP_VERSION);
      if (!r.update) return res.json({ ok: false, reason: 'No hay actualización disponible' });
      manifest = r;
    }
    const ctx = {
      rootDir: ROOT_DIR,
      appDir: APP_DIR,
      startCmd: CONFIG.app?.startScript,
      taskName: CONFIG.app?.taskName,
    };
    const r = await updater.apply(manifest, ctx);
    log.info('aplicar actualización', { version: manifest.version });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Asistente (configuración guiada) ----------
app.get('/api/wizard', (req, res) => {
  res.json({ completed: !!SETTINGS.wizardCompleted });
});

// ---------- Consola Moonlight (opcional) ----------
let proxy = null;
if (ML_TARGET) {
  proxy = httpProxy.createProxyServer({ target: ML_TARGET, ws: true, changeOrigin: false });
  proxy.on('error', (err, req, res) => { if (res && res.writeHead) { try { res.writeHead(502); res.end('Proxy error'); } catch {} } });

  app.use(ML_PREFIX, (req, res) => {
    req.headers['x-forwarded-user'] = 'admin';
    req.headers['x-forwarded-proto'] = 'https';
    delete req.headers['x-forwarded-for'];
    req.url = req.originalUrl;
    proxy.web(req, res);
  });
}

// ---------- Panel Sunshine (opcional) ----------
if (SUNSHINE) {
  const sunshineProxy = httpProxy.createProxyServer({ target: SUNSHINE.baseUrl, secure: false, changeOrigin: true });
  sunshineProxy.on('error', (err, req, res) => { if (res && res.writeHead) { try { res.writeHead(502); res.end('Proxy error'); } catch {} } });
  app.use('/sunshine', (req, res) => {
    req.headers.authorization = 'Basic ' + Buffer.from(`${SUNSHINE.username}:${SUNSHINE.password}`).toString('base64');
    req.headers['x-forwarded-proto'] = 'https';
    delete req.headers['x-forwarded-for'];
    req.url = req.originalUrl.replace(/^\/sunshine/, '') || '/';
    sunshineProxy.web(req, res);
  });
}

app.use(express.static(path.join(APP_DIR, 'public')));

// ---------- Servidor HTTPS ----------
const tls = cert.resolve({
  key: CONFIG.moonlight?.ssl?.privateKeyPem,
  cert: CONFIG.moonlight?.ssl?.certificatePem,
  dataDir: path.join(APP_DIR, 'data'),
});
const httpsServer = https.createServer(tls, app);

httpsServer.on('upgrade', (req, socket, head) => {
  if (!ML_TARGET || !proxy || !req.url || !req.url.startsWith(ML_PREFIX)) { socket.destroy(); return; }
  req.headers['x-forwarded-user'] = 'admin';
  req.headers['x-forwarded-proto'] = 'https';
  delete req.headers['x-forwarded-for'];
  proxy.ws(req, socket, head);
});

httpsServer.listen(PORT, '0.0.0.0', () => {
  log.info('listo', { url: 'https://localhost:' + PORT });
  console.log(`GameBox v${APP_VERSION} escuchando en https://0.0.0.0:${PORT}`);
});

// ---------- Tareas en segundo plano ----------
setInterval(() => {
  try {
    const games = readLibrary().filter((g) => g.command);
    const running = processes.runningFor(games);
    if (Array.isArray(running.procs)) {
      const byId = {};
      for (const g of games) byId[g.id] = g;
      stats.accumulate(running.procs, byId);
    }
  } catch {}
}, 30000);

if (SETTINGS.scanOnStart) {
  setTimeout(() => { try { rescanLibrary(); } catch {} }, 4000);
}
