'use strict';

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'games.json');

const CHECK_PATHS = {
  steam: {
    name: 'Steam',
    description: 'Steam',
    exe: ['C:\\Program Files (x86)\\Steam\\steam.exe', 'C:\\Program Files\\Steam\\steam.exe'],
    command: (exe) => `"${exe}" -bigpicture`,
    match: /steam\.exe$/i,
  },
  epic: {
    name: 'Epic Games',
    description: 'Epic Games Launcher',
    exe: ['C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe'],
    command: (exe) => `"${exe}"`,
    match: /EpicGamesLauncher\.exe$/i,
  },
  xbox: {
    name: 'Xbox (Microsoft Store)',
    description: 'Xbox app y juegos Game Pass',
    exe: [],
    command: () => 'explorer.exe shell:AppsFolder\\Microsoft.GamingApp_8wekyb3d8bbwe!App',
    match: /GamingApp/i,
  },
  ubisoft: {
    name: 'Ubisoft Connect',
    description: 'Ubisoft Connect',
    exe: ['C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\upc.exe', 'C:\\Program Files\\Ubisoft\\Ubisoft Game Launcher\\upc.exe'],
    command: (exe) => `"${exe}"`,
    match: /upc\.exe$/i,
  },
  gog: {
    name: 'GOG Galaxy',
    description: 'GOG Galaxy 2.0',
    exe: ['C:\\Program Files (x86)\\GOG Galaxy\\GalaxyClient.exe'],
    command: (exe) => `"${exe}"`,
    match: /GalaxyClient\.exe$/i,
  },
};

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'juego';
}

function existingGames() {
  try {
    return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    return [];
  }
}

function main() {
  const result = [];
  const seen = new Set();

  const keep = existingGames().filter((g) => g.custom);
  for (const g of keep) {
    seen.add(g.id);
    result.push(g);
  }

  for (const key of Object.keys(CHECK_PATHS)) {
    const info = CHECK_PATHS[key];
    const exe = info.exe.find((p) => fs.existsSync(p));
    if (!exe) continue;
    const id = slug(key);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      name: info.name,
      description: info.description,
      command: info.command(exe),
    });
  }

  if (!seen.has('desktop')) {
    result.unshift({
      id: 'desktop',
      name: 'Escritorio',
      description: 'Transmite el escritorio completo',
      command: null,
    });
  }
  if (!seen.has('steam-bigpicture') && CHECK_PATHS.steam.exe.some((p) => fs.existsSync(p))) {
    result.push({
      id: 'steam-bigpicture',
      name: 'Steam Big Picture',
      description: 'Modo consola de Steam',
      command: 'steam://open/bigpicture',
    });
  }

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
  console.log('games.json actualizado con', result.length, 'entradas');
}

main();
