(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const mainView = $('main-view');
  const consoleView = $('console-view');
  const consoleFrame = $('console-frame');
  const gamesGrid = $('games-grid');
  const emptyState = $('empty-state');
  const toast = $('toast');

  let toastTimer = null;

  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'toast ' + (type || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3800);
  }

  async function api(url, opts) {
    const r = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}));
    let data = null;
    try { data = await r.json(); } catch (e) { data = {}; }
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }

  function setPill(id, state, label) {
    const el = $(id);
    el.className = 'pill ' + state;
    el.lastChild.nodeValue = ' ' + label;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showView(name) {
    mainView.classList.add('hidden');
    consoleView.classList.add('hidden');
    if (name === 'main') mainView.classList.remove('hidden');
    if (name === 'console') consoleView.classList.remove('hidden');
  }

  async function loadStatus() {
    try {
      const s = await api('/api/status');
      setPill('pill-sunshine', s.sunshine && s.sunshine.up ? 'on' : 'off', 'Streaming ' + (s.sunshine && s.sunshine.up ? 'OK' : 'caído'));
      setPill('pill-moonlight', s.moonlight && s.moonlight.up ? 'on' : 'off', 'Consola ' + (s.moonlight && s.moonlight.up ? 'OK' : 'caída'));
      const ts = s.tailscale && s.tailscale.ip;
      setPill('pill-tailscale', ts ? 'on' : 'off', 'VPN ' + (ts ? 'OK' : 'no'));
      setPill('pill-session', s.activeUser ? 'warn' : 'off', 'Sesión ' + (s.activeUser || 'ninguna'));
      if (s.sunshine && s.sunshine.up) {
        const base = s.sunshine.apps + ' aplicaciones de streaming detectadas.';
        $('subtitle-line').textContent = ts ? base + ' VPN ' + s.tailscale.ip : base;
      }
    } catch (e) {
      setPill('pill-sunshine', 'off', 'Streaming ?');
    }
  }

  async function loadGames() {
    try {
      const data = await api('/api/games');
      gamesGrid.innerHTML = '';
      const games = data.games || [];
      if (!games.length) {
        emptyState.classList.remove('hidden');
        return;
      }
      emptyState.classList.add('hidden');
      games.forEach((g, i) => {
        const card = document.createElement('div');
        card.className = 'game-card ' + (g.command ? 'playable' : '');
        const initial = (g.name || '?').trim().charAt(0).toUpperCase() || '?';
        const playable = g.command
          ? '<button class="btn primary block game-play" data-play="' + esc(g.id) + '">Jugar</button>'
          : '<button class="btn ghost block game-play" data-play="' + esc(g.id) + '">Abrir</button>';
        card.innerHTML =
          '<div class="game-cover">' + esc(initial) + '</div>' +
          '<div class="game-info">' +
          '<div class="game-name">' + esc(g.name) + '</div>' +
          (g.description ? '<div class="game-desc">' + esc(g.description) + '</div>' : '') +
          '</div>' +
          playable;
        gamesGrid.appendChild(card);
      });
      gamesGrid.querySelectorAll('.game-play').forEach((btn) => {
        btn.addEventListener('click', () => playGame(btn.getAttribute('data-play')));
      });
    } catch (e) {
      showToast('Error cargando juegos: ' + e.message, 'error');
    }
  }

  async function playGame(id) {
    try {
      const r = await api('/api/play/' + encodeURIComponent(id), { method: 'POST' });
      if (r.ok) showToast('Juego lanzado en el equipo. Abriendo consola...', 'success');
      else showToast(r.error || 'No se pudo lanzar', 'error');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
    openConsole();
  }

  function openConsole() {
    showView('console');
    consoleFrame.src = '/ml/';
  }

  function closeConsole() {
    consoleFrame.src = 'about:blank';
    showView('main');
    loadStatus();
    loadGames();
  }

  function start() {
    showView('main');
    loadStatus();
    loadGames();
    setInterval(loadStatus, 20000);
  }

  $('btn-console').addEventListener('click', openConsole);
  $('btn-back').addEventListener('click', closeConsole);

  start();
})();
