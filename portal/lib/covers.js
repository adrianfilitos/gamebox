const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const COVERS_DIR = path.join(__dirname, '..', 'covers');

function ensureDir() {
  try { fs.mkdirSync(COVERS_DIR, { recursive: true }); } catch {}
}

function localPath(id) {
  ensureDir();
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const f = path.join(COVERS_DIR, id + '.' + ext);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// Devuelve la ruta local de la portada, descargándola de coverUrl si hace falta (cache).
function resolve(id, coverUrl) {
  ensureDir();
  const existing = localPath(id);
  if (existing) return existing;
  if (coverUrl && /^https?:/i.test(coverUrl)) {
    const ext = (coverUrl.split('?')[0].match(/\.(png|jpe?g|webp)$/i) || [])[1] || 'jpg';
    const target = path.join(COVERS_DIR, `${id}.${ext}`);
    try {
      const fetched = fetchToFile(coverUrl, target, 15000);
      if (fetched && fs.existsSync(target) && fs.statSync(target).size > 1000) return target;
      try { fs.unlinkSync(target); } catch {}
    } catch {}
  }
  return null;
}

function fetchToFile(url, file, timeout) {
  return new Promise((resolve) => {
    const mod = /^https:/i.test(url) ? https : http;
    const req = mod.get(url, { timeout, headers: { 'User-Agent': 'GameBox/2.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchToFile(res.headers.location, file, timeout).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        resolve(false);
        return;
      }
      const out = fs.createWriteStream(file);
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(true); });
      out.on('error', () => { try { fs.unlinkSync(file); } catch {} resolve(false); });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => { try { fs.unlinkSync(file); } catch {} resolve(false); });
  });
}

const PALETTES = [
  ['#7b5cff', '#22d3a5'],
  ['#f4535a', '#f5b942'],
  ['#22a3d3', '#7b5cff'],
  ['#f5b942', '#f4535a'],
  ['#3bd0a0', '#1f6feb'],
  ['#e5534b', '#a371f7'],
  ['#2da44e', '#22a3d3'],
];

function paletteFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

// SVG placeholder con inicial + gradiente.
function placeholderSvg(id, name) {
  const [c1, c2] = paletteFor(id);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="460" height="215" rx="14" fill="url(#g)"/>
  <text x="230" y="120" font-family="Segoe UI, Arial, sans-serif" font-size="92" font-weight="800" fill="rgba(255,255,255,0.92)" text-anchor="middle">${escapeXml(initial)}</text>
</svg>`;
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { resolve, placeholderSvg, localPath };
