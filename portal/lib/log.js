const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_LINES = 8000;

function init() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
  try { if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '', 'utf8'); } catch {}
}

function write(level, msg, extra) {
  init();
  const entry = { t: new Date().toISOString(), level, msg };
  if (extra && typeof extra === 'object') {
    for (const k of Object.keys(extra)) {
      if (typeof extra[k] !== 'object') entry[k] = extra[k];
    }
  }
  try { fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8'); } catch {}
  try {
    const data = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = data.split('\n');
    if (lines.length > MAX_LINES) fs.writeFileSync(LOG_FILE, lines.slice(-MAX_LINES).join('\n'), 'utf8');
  } catch {}
}

function info(msg, extra) { write('info', msg, extra); }
function warn(msg, extra) { write('warn', msg, extra); }
function error(msg, extra) { write('error', msg, extra); }

function readAll() {
  init();
  try {
    const data = fs.readFileSync(LOG_FILE, 'utf8');
    return data.split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return { t: '', level: 'info', msg: l }; }
    });
  } catch { return []; }
}

function tail(lines = 200, filter) {
  let out = readAll();
  if (filter) out = out.filter((e) => (e.msg || '').toLowerCase().includes(filter.toLowerCase()));
  return out.slice(-lines);
}

function recentErrors(count = 20) {
  return readAll().filter((e) => e.level === 'error').slice(-count);
}

module.exports = { init, info, warn, error, tail, recentErrors };
