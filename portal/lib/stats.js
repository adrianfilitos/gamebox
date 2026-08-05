const path = require('path');
const { Store } = require('./store');

const STATS_FILE = path.join(__dirname, '..', 'stats.json');
const store = new Store(STATS_FILE, { games: {}, totals: { launches: 0, playSeconds: 0 } });

function trackLaunch(game) {
  const g = store.get('games', {})[game.id] || { id: game.id, name: game.name, launches: 0, playSeconds: 0, lastLaunched: null, runningSince: null };
  g.name = game.name;
  g.launches = (g.launches || 0) + 1;
  g.lastLaunched = new Date().toISOString();
  g.runningSince = Date.now();
  store.get('games')[game.id] = g;
  store.get('totals').launches += 1;
  store.save();
}

// Acumula segundos de juego para juegos cuyo proceso sigue vivo.
function accumulate(procs, gameById) {
  const now = Date.now();
  const games = store.get('games', {});
  for (const id of Object.keys(games)) {
    const g = games[id];
    if (!g.runningSince) continue;
    const alive = procs.some((p) => p.gameId === id);
    if (alive) {
      const secs = Math.round((now - g.runningSince) / 1000);
      g.playSeconds = (g.playSeconds || 0) + secs;
      g.runningSince = now;
    } else {
      g.runningSince = null;
    }
  }
  store.get('totals').playSeconds = Object.values(games).reduce((a, b) => a + (b.playSeconds || 0), 0);
  store.save();
}

function summary() {
  const games = store.get('games', {});
  const list = Object.values(games).sort((a, b) => (b.launches || 0) - (a.launches || 0));
  const mostPlayed = Object.values(games).sort((a, b) => (b.playSeconds || 0) - (a.playSeconds || 0));
  return {
    totals: store.get('totals', { launches: 0, playSeconds: 0 }),
    games: list,
    mostPlayed: mostPlayed.slice(0, 5),
    recent: Object.values(games)
      .filter((g) => g.lastLaunched)
      .sort((a, b) => new Date(b.lastLaunched) - new Date(a.lastLaunched))
      .slice(0, 5),
  };
}

module.exports = { trackLaunch, accumulate, summary };
