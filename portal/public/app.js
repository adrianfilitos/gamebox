(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const presentationView = $('presentation-view');
  const appView = $('app-view');
  const wizardEl = $('wizard');
  const toast = $('toast');

  const views = ['library', 'console', 'stats', 'settings', 'system'];
  const sysPanes = ['procs', 'logs', 'update', 'config'];

  const state = {
    games: [],
    categories: [],
    query: '',
    category: 'Todos',
    settings: null,
    updateInfo: null,
    consoleConfigured: false,
    runningGames: {},
  };

  let toastTimer = null;

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      navigator.standalone === true
    );
  }

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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtTime(secs) {
    secs = Math.round(secs || 0);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return h + ' h ' + m + ' m';
    if (m > 0) return m + ' min';
    return secs + ' s';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  }

  // ---------- Estado / status ----------
  function setPill(id, stateName, label) {
    const el = $(id);
    el.className = 'pill ' + stateName;
    el.lastChild.nodeValue = ' ' + label;
  }

  async function loadStatus() {
    try {
      const s = await api('/api/status');
      setPill('pill-sunshine', s.sunshine && s.sunshine.up ? 'on' : 'off', 'Streaming ' + (s.sunshine && s.sunshine.up ? 'OK' : 'apagado'));
      setPill('pill-moonlight', s.moonlight && s.moonlight.up ? 'on' : 'off', 'Consola ' + (s.moonlight && s.moonlight.up ? 'OK' : 'apagada'));
      setPill('pill-session', s.activeUser ? 'warn' : 'off', s.activeUser || 'Sin sesión');
      state.consoleConfigured = !!s.moonlight && s.moonlight.configured;
    } catch (e) {
      setPill('pill-sunshine', 'off', 'Streaming ?');
    }
  }

  // ---------- Router / vistas ----------
  function route() {
    const h = (location.hash || '#/library').replace('#/', '') || 'library';
    showView(views.includes(h) ? h : 'library');
  }

  function showView(name) {
    for (const v of views) $('view-' + v).classList.toggle('hidden', v !== name);
    document.querySelectorAll('.tabbar .tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    if (name === 'library') loadLibrary();
    else if (name === 'console') loadConsole();
    else if (name === 'stats') loadStats();
    else if (name === 'settings') loadSettings();
    else if (name === 'system') loadSystem();
  }

  document.querySelectorAll('.tabbar .tab').forEach((t) => {
    t.addEventListener('click', () => { location.hash = '#/' + t.dataset.view; });
  });

  function loadConsole() {
    if (state.consoleConfigured) {
      $('console-unavailable').classList.add('hidden');
      const frame = $('console-frame');
      if (frame.src.indexOf('/ml/') === -1) frame.src = '/ml/';
      frame.classList.remove('hidden');
    } else {
      $('console-frame').classList.add('hidden');
      $('console-unavailable').classList.remove('hidden');
    }
  }

  $('btn-back').addEventListener('click', () => { location.hash = '#/library'; });

  // ---------- Biblioteca ----------
  async function loadLibrary() {
    try {
      const [g, cat, proc] = await Promise.all([api('/api/games'), api('/api/categories'), api('/api/processes')]);
      state.games = g.games;
      state.categories = cat.categories;
      state.runningGames = {};
      (proc.running || []).forEach((p) => { state.runningGames[p.gameId] = true; });
      renderCategories();
      renderGames();
    } catch (e) {
      showToast('Error cargando biblioteca: ' + e.message, 'error');
    }
  }

  function renderCategories() {
    const wrap = $('category-chips');
    wrap.innerHTML = '';
    const cats = [{ name: 'Todos' }, { name: 'Favoritos' }].concat(state.categories || []);
    cats.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip' + (c.name === state.category ? ' active' : '');
      b.textContent = c.name;
      b.addEventListener('click', () => { state.category = c.name; renderCategories(); renderGames(); });
      wrap.appendChild(b);
    });
  }

  function filteredGames() {
    const q = state.query.trim().toLowerCase();
    return (state.games || []).filter((g) => {
      if (state.category === 'Favoritos' && !g.favorite) return false;
      if (state.category !== 'Todos' && state.category !== 'Favoritos' && (g.category || 'Otros') !== state.category) return false;
      if (q && !(g.name || '').toLowerCase().includes(q) && !(g.description || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderGames() {
    const grid = $('games-grid');
    const games = filteredGames();
    grid.innerHTML = '';
    $('empty-state').classList.toggle('hidden', games.length > 0);
    games.forEach((g) => {
      const card = document.createElement('div');
      card.className = 'game-card' + (g.favorite ? ' favorite' : '');
      const running = state.runningGames[g.id];
      const name = esc(g.name || '?');
      const category = esc(g.category || 'Otros');
      const initial = (g.name || '?').trim().charAt(0).toUpperCase() || '?';
      const statsTxt = (g.stats ? g.stats.launches : 0) + ' lanz. · ' + fmtTime(g.stats ? g.stats.playSeconds : 0);
      card.innerHTML =
        '<div class="game-cover">' +
          (g.cover ? '<img src="' + esc(g.cover) + '" alt="" loading="lazy" onerror="this.remove()">' : '') +
          '<span class="cover-init">' + esc(initial) + '</span>' +
          (running ? '<span class="badge running">EN JUEGO</span>' : '') +
          (g.installed === false ? '<span class="badge missing">NO INSTALADO</span>' : '') +
          '<button class="hide-btn" data-id="' + esc(g.id) + '" title="Ocultar">✕</button>' +
          '<button class="fav-btn" data-id="' + esc(g.id) + '" title="Favorito">' + (g.favorite ? '★' : '☆') + '</button>' +
        '</div>' +
        '<div class="game-info">' +
          '<div class="game-name">' + name + '</div>' +
          '<div class="game-meta">' + category + ' · ' + statsTxt + '</div>' +
          (g.description ? '<div class="game-desc">' + esc(g.description) + '</div>' : '') +
          '<button class="btn ' + (g.command ? 'primary' : 'ghost') + ' block game-play" data-play="' + esc(g.id) + '">' + (g.command ? 'Jugar' : 'Abrir') + '</button>' +
        '</div>';
      grid.appendChild(card);
    });
    grid.querySelectorAll('.game-play').forEach((b) => b.addEventListener('click', () => playGame(b.dataset.play)));
    grid.querySelectorAll('.fav-btn').forEach((b) => b.addEventListener('click', () => toggleFavorite(b.dataset.id)));
    grid.querySelectorAll('.hide-btn').forEach((b) => b.addEventListener('click', () => hideGame(b.dataset.id)));
  }

  async function hideGame(id) {
    try {
      await api('/api/games/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ hidden: true }) });
      state.games = state.games.filter((g) => g.id !== id);
      renderGames();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function toggleFavorite(id) {
    const g = state.games.find((x) => x.id === id);
    if (!g) return;
    try {
      await api('/api/games/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ favorite: !g.favorite }) });
      g.favorite = !g.favorite;
      renderGames();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function playGame(id) {
    try {
      const r = await api('/api/play/' + encodeURIComponent(id), { method: 'POST' });
      if (r.ok) { showToast('Lanzado. Abriendo consola...', 'success'); location.hash = '#/console'; }
      else showToast(r.error || 'No se pudo lanzar', 'error');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  }

  $('search-input').addEventListener('input', (e) => { state.query = e.target.value; renderGames(); });
  $('btn-rescan').addEventListener('click', async () => {
    $('btn-rescan').disabled = true;
    showToast('Reescanando juegos...');
    try {
      const r = await api('/api/games/rescan', { method: 'POST' });
      showToast('Biblioteca actualizada: ' + r.total + ' juegos', 'success');
      await loadLibrary();
    } catch (e) { showToast(e.message, 'error'); }
    $('btn-rescan').disabled = false;
  });

  // ---------- Estadísticas ----------
  async function loadStats() {
    try {
      const s = await api('/api/stats');
      const t = s.totals || {};
      $('stats-cards').innerHTML =
        '<div class="stat-card"><div class="stat-num">' + (t.launches || 0) + '</div><div class="stat-label">Lanzamientos</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + fmtTime(t.playSeconds) + '</div><div class="stat-label">Tiempo jugado</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + (s.games ? s.games.length : 0) + '</div><div class="stat-label">Juegos usados</div></div>';
      renderTopList($('stats-top'), s.mostPlayed || [], true);
      renderTopList($('stats-recent'), s.recent || [], false);
    } catch (e) { showToast(e.message, 'error'); }
  }

  function renderTopList(el, list, showTime) {
    if (!list.length) { el.innerHTML = '<p class="muted empty-line">Todavía sin datos.</p>'; return; }
    el.innerHTML = list.map((g) =>
      '<div class="list-row">' +
        '<div class="list-main"><span class="list-name">' + esc(g.name) + '</span><span class="list-sub">' + (showTime ? fmtTime(g.playSeconds) : fmtDate(g.lastLaunched)) + '</span></div>' +
        '<span class="list-right">' + (g.launches || 0) + ' lanz.</span>' +
      '</div>'
    ).join('');
  }

  // ---------- Ajustes ----------
  async function loadSettings() {
    try {
      const r = await api('/api/settings');
      state.settings = r.settings;
      $('set-launchmode').value = r.settings.launchMode || 'user';
      $('set-autostart').checked = !!r.settings.autoStart;
      $('set-checkupdates').checked = r.settings.checkUpdates !== false;
      $('set-scanonstart').checked = r.settings.scanOnStart !== false;
      $('set-updatemanifest').value = r.settings.updateManifest || '';
      renderDeps();
    } catch (e) { showToast(e.message, 'error'); }
  }

  $('btn-save-settings').addEventListener('click', async () => {
    try {
      const body = {
        launchMode: $('set-launchmode').value,
        autoStart: $('set-autostart').checked,
        checkUpdates: $('set-checkupdates').checked,
        scanOnStart: $('set-scanonstart').checked,
        updateManifest: $('set-updatemanifest').value.trim(),
      };
      await api('/api/settings', { method: 'POST', body: JSON.stringify(body) });
      showToast('Ajustes guardados', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  async function renderDeps() {
    try {
      const r = await api('/api/deps');
      $('deps-list').innerHTML = r.deps.map((d) =>
        '<div class="dep-row">' +
          '<span class="dot ' + (d.ok ? 'ok' : 'bad') + '"></span>' +
          '<span class="dep-name">' + esc(d.name) + '</span>' +
          '<span class="dep-detail">' + esc(d.detail || '') + '</span>' +
        '</div>'
      ).join('');
    } catch (e) { $('deps-list').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; }
  }

  $('btn-recheck-deps').addEventListener('click', renderDeps);

  $('btn-restore-hidden').addEventListener('click', async () => {
    try {
      const r = await api('/api/games/clear-hidden', { method: 'POST' });
      showToast('Juegos ocultos restaurados', 'success');
      if (location.hash === '#/library') loadLibrary();
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ---------- Sistema ----------
  function loadSystem() {
    // se cargan las pestañas al pulsar
  }

  document.querySelectorAll('.sys-tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.sys-tab').forEach((x) => x.classList.toggle('active', x === t));
      for (const p of sysPanes) $('sys-' + p).classList.toggle('hidden', p !== t.dataset.sys);
      if (t.dataset.sys === 'procs') loadProcesses();
      else if (t.dataset.sys === 'logs') loadLogs();
      else if (t.dataset.sys === 'update') loadUpdate();
      else if (t.dataset.sys === 'config') loadConfig();
    });
  });

  async function loadProcesses() {
    try {
      const r = await api('/api/processes');
      const runningIds = {};
      (r.running || []).forEach((p) => { runningIds[p.gameId] = true; });
      let html = '';
      if (r.running && r.running.length) {
        html += '<div class="proc-group">En juego</div>';
        html += r.running.map((p) =>
          '<div class="proc-row"><span class="proc-name">' + esc(p.gameName) + '</span><span class="proc-sub">' + esc(p.name) + ' · ' + p.pid + '</span><button class="btn danger small" data-kill="' + p.pid + '">Detener</button></div>'
        ).join('');
      }
      const others = (r.all || []).filter((p) => !runningIds[p.gameId]).slice(0, 60);
      html += '<div class="proc-group">Procesos</div>';
      html += others.map((p) =>
        '<div class="proc-row"><span class="proc-name">' + esc(p.name) + '</span><span class="proc-sub">PID ' + p.pid + ' · ' + p.cpu + '% · ' + p.mem + ' MB</span><button class="btn danger small" data-kill="' + p.pid + '">Detener</button></div>'
      ).join('');
      $('procs-list').innerHTML = html || '<p class="muted empty-line">Sin procesos.</p>';
      $('procs-list').querySelectorAll('[data-kill]').forEach((b) => {
        b.addEventListener('click', async () => {
          try { await api('/api/processes/kill', { method: 'POST', body: JSON.stringify({ pid: parseInt(b.dataset.kill, 10) }) }); loadProcesses(); }
          catch (e) { showToast(e.message, 'error'); }
        });
      });
    } catch (e) { showToast(e.message, 'error'); }
  }

  $('btn-refresh-procs').addEventListener('click', loadProcesses);

  async function loadLogs() {
    try {
      const filter = $('log-filter').value.trim();
      const r = await api('/api/logs?lines=300' + (filter ? '&filter=' + encodeURIComponent(filter) : ''));
      $('logs-view').innerHTML = (r.logs || []).slice().reverse().map((l) =>
        '<div class="log-line ' + esc(l.level) + '"><span class="log-t">' + esc((l.t || '').slice(11, 19)) + '</span><span class="log-msg">' + esc(l.msg || '') + '</span></div>'
      ).join('') || '<p class="muted">Sin registros.</p>';
    } catch (e) { showToast(e.message, 'error'); }
  }

  $('btn-refresh-logs').addEventListener('click', loadLogs);
  $('log-filter').addEventListener('change', loadLogs);

  async function loadUpdate() {
    try {
      const a = await api('/api/app');
      $('upd-current').textContent = a.version;
      if (state.updateInfo) renderUpdateInfo(state.updateInfo);
    } catch (e) {}
  }

  $('btn-check-update').addEventListener('click', async () => {
    try {
      $('upd-result').textContent = 'Comprobando...';
      const r = await api('/api/update/check');
      state.updateInfo = r;
      renderUpdateInfo(r);
    } catch (e) { $('upd-result').textContent = 'Error: ' + e.message; }
  });

  function renderUpdateInfo(r) {
    const el = $('upd-result');
    if (r.error) { el.textContent = 'No se pudo comprobar: ' + r.error; $('btn-apply-update').classList.add('hidden'); return; }
    if (!r.enabled) { el.textContent = 'Actualizaciones desactivadas.'; $('btn-apply-update').classList.add('hidden'); return; }
    if (r.update) { el.textContent = 'Hay una versión nueva: ' + r.latest + ' (actual: ' + r.current + ').'; $('btn-apply-update').classList.remove('hidden'); }
    else { el.textContent = 'Estás al día (v' + r.current + ').'; $('btn-apply-update').classList.add('hidden'); }
  }

  $('btn-apply-update').addEventListener('click', async () => {
    try {
      $('btn-apply-update').disabled = true;
      $('upd-result').textContent = 'Descargando e instalando... el equipo se reiniciará en unos segundos.';
      const r = await api('/api/update/apply', { method: 'POST', body: JSON.stringify(state.updateInfo) });
      if (!r.ok && r.reason) $('upd-result').textContent = r.reason;
    } catch (e) { $('upd-result').textContent = 'Error: ' + e.message; $('btn-apply-update').disabled = false; }
  });

  async function loadConfig() {
    try {
      const r = await api('/api/config');
      $('config-view').textContent = JSON.stringify(r.config, null, 2);
    } catch (e) { $('config-view').textContent = e.message; }
  }

  $('btn-refresh-config').addEventListener('click', loadConfig);

  // ---------- Asistente ----------
  let wizardStep = 0;

  async function initWizard() {
    try {
      const w = await api('/api/wizard');
      if (!w.completed) { wizardStep = 0; showWizard(); }
    } catch {}
  }

  function showWizard() {
    wizardEl.classList.remove('hidden');
    renderWizardStep();
  }

  function renderWizardStep() {
    const body = $('wizard-body');
    const next = $('btn-wizard-next');
    const finish = $('btn-wizard-finish');
    next.classList.add('hidden');
    finish.classList.add('hidden');

    if (wizardStep === 0) {
      body.innerHTML =
        '<h3>Bienvenido</h3>' +
        '<p>GameBox detecta automáticamente tus juegos de <b>Steam</b>, <b>Epic Games</b> y <b>Xbox / Tienda de Microsoft</b>, y te deja lanzarlos desde cualquier dispositivo.</p>' +
        '<p class="muted">Primero revisaremos las dependencias y luego tus juegos.</p>';
      next.classList.remove('hidden');
      next.textContent = 'Siguiente';
    } else if (wizardStep === 1) {
      body.innerHTML = '<h3>Dependencias</h3><div id="wizard-deps"></div><p class="muted">No son obligatorias todas: Sunshine y ViGEmBus solo se necesitan para transmitir a pantalla.</p>';
      next.classList.remove('hidden');
      next.textContent = 'Siguiente';
      (async () => {
        try {
          const r = await api('/api/deps');
          $('wizard-deps').innerHTML = r.deps.map((d) =>
            '<div class="dep-row"><span class="dot ' + (d.ok ? 'ok' : 'bad') + '"></span><span class="dep-name">' + esc(d.name) + '</span><span class="dep-detail">' + esc(d.detail || '') + '</span></div>'
          ).join('');
        } catch (e) { $('wizard-deps').textContent = e.message; }
      })();
    } else if (wizardStep === 2) {
      body.innerHTML =
        '<h3>Detección de juegos</h3>' +
        '<p>Vamos a buscar tus juegos instalados. Puedes repetirlo cuando quieras desde la biblioteca.</p>' +
        '<button id="btn-wizard-rescan" class="btn primary block">Buscar juegos ahora</button>' +
        '<div id="wizard-rescan-result" class="muted"></div>';
      finish.classList.remove('hidden');
      finish.textContent = 'Terminar';
      $('btn-wizard-rescan').addEventListener('click', async () => {
        try {
          const r = await api('/api/games/rescan', { method: 'POST' });
          $('wizard-rescan-result').textContent = 'Encontrados ' + r.total + ' juegos (Steam: ' + r.sources.steam + ', Epic: ' + r.sources.epic + ', Xbox: ' + r.sources.xbox + ').';
        } catch (e) { $('wizard-rescan-result').textContent = e.message; }
      });
    }
  }

  $('btn-wizard-next').addEventListener('click', () => { wizardStep++; renderWizardStep(); });

  $('btn-wizard-finish').addEventListener('click', async () => {
    try {
      await api('/api/settings', { method: 'POST', body: JSON.stringify({ wizardCompleted: true }) });
      wizardEl.classList.add('hidden');
      location.hash = '#/library';
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ---------- Arranque ----------
  function startMain() {
    appView.classList.remove('hidden');
    route();
    loadStatus();
    setInterval(loadStatus, 20000);
    initWizard();
    if ('serviceWorker' in navigator && location.protocol === 'https:' && navigator.serviceWorker) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  function startPresentation() {
    presentationView.classList.remove('hidden');
  }

  function start() {
    if (isStandalone()) startMain();
    else startPresentation();
  }

  $('btn-reinstall').addEventListener('click', () => { if (isStandalone()) startMain(); else location.reload(); });
  $('btn-refresh').addEventListener('click', () => location.reload());

  window.addEventListener('hashchange', route);
  start();
})();
