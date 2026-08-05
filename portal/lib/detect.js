const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PS = 'powershell.exe';
const PS_ARGS = ['-NoProfile', '-NonInteractive', '-Command'];

// Ejecuta PowerShell escribiendo la salida a un archivo UTF-8 (evita problemas de codificación).
function ps(script) {
  const tmp = path.join(os.tmpdir(), 'gbps-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.txt');
  try {
    execFileSync(PS, PS_ARGS.concat([`${script} | Out-File -LiteralPath '${tmp}' -Encoding utf8`]), { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return fs.readFileSync(tmp, 'utf8').replace(/^\uFEFF/, '').trim();
  } catch (e) {
    throw new Error(String(e.message).split(/\r?\n/)[0]);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// ---------- Steam ----------
function steamInstallDir() {
  try {
    const out = ps(
      "$v = $null; if (Test-Path 'HKLM:\\SOFTWARE\\WOW6432Node\\Valve\\Steam') { $v = (Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Valve\\Steam' -Name InstallPath).InstallPath }; $v"
    );
    if (out && fs.existsSync(out)) return out;
  } catch {}
  for (const p of ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function steamLibraryFolders(steamDir) {
  const vdf = path.join(steamDir, 'steamapps', 'libraryfolders.vdf');
  if (!fs.existsSync(vdf)) return [steamDir];
  const content = fs.readFileSync(vdf, 'utf8');
  const folders = [];
  const re = /"path"\s+"([^"]+)"/g;
  let m;
  while ((m = re.exec(content)) !== null) folders.push(m[1]);
  if (!folders.length) folders.push(steamDir);
  return folders.map((f) => f.replace(/\\\\/g, '\\'));
}

function steamApps(steamDir) {
  const results = [];
  const folders = steamLibraryFolders(steamDir);
  for (const lib of folders) {
    const appsDir = path.join(lib, 'steamapps');
    if (!fs.existsSync(appsDir)) continue;
    let files = [];
    try { files = fs.readdirSync(appsDir).filter((f) => /^appmanifest_\d+\.acf$/i.test(f)); } catch { continue; }
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(appsDir, f), 'utf8');
        const appid = (content.match(/"appid"\s+"(\d+)"/) || [])[1];
        const name = (content.match(/"name"\s+"((?:[^"\\]|\\.)*)"/) || [])[1];
        const installdir = (content.match(/"installdir"\s+"((?:[^"\\]|\\.)*)"/) || [])[1];
        const stateFlags = parseInt((content.match(/"StateFlags"\s+"(\d+)"/) || [])[1] || '0', 10);
        if (!appid || !name || !installdir) continue;
        if ((stateFlags & 4) === 0) continue; // solo instalado por completo
        const commonDir = path.join(lib, 'steamapps', 'common', installdir);
        const exe = findMainExe(commonDir, installdir);
        results.push({
          id: 'steam-' + appid,
          name: unescapeAcf(name),
          description: 'Steam',
          command: 'steam://rungameid/' + appid,
          category: 'Steam',
          detectedBy: 'steam',
          coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + appid + '/header.jpg',
          exeName: exe ? path.basename(exe).toLowerCase() : null,
          installed: true,
        });
      } catch {}
    }
  }
  return results;
}

function findMainExe(dir, prefer) {
  if (!fs.existsSync(dir)) return null;
  const preferName = (prefer || '').toLowerCase();
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const exes = entries.filter((e) => e.isFile() && /\.exe$/i.test(e.name));
    if (preferName) {
      const hit = exes.find((e) => e.name.toLowerCase().replace(/\.exe$/, '') === preferName);
      if (hit) return path.join(dir, hit.name);
      const hit2 = exes.find((e) => e.name.toLowerCase().includes(preferName));
      if (hit2) return path.join(dir, hit2.name);
    }
    if (exes.length) return path.join(dir, exes[0].name);
  } catch {}
  return null;
}

function unescapeAcf(s) {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

// ---------- Epic ----------
function epicApps() {
  const results = [];
  const manifestsDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  if (!fs.existsSync(manifestsDir)) return results;
  let files = [];
  try { files = fs.readdirSync(manifestsDir).filter((f) => /\.item$/i.test(f)); } catch { return results; }
  for (const f of files) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(manifestsDir, f), 'utf8'));
      const name = m.DisplayName;
      const install = m.InstallLocation;
      const launch = m.LaunchExecutable;
      const categories = Array.isArray(m.Categories) ? m.Categories.join(',').toLowerCase() : '';
      if (!name || categories.includes('dlc')) continue;
      const exe = launch && install ? path.join(install, launch) : null;
      if (!exe || !fs.existsSync(exe)) {
        if (!install || !fs.existsSync(install)) continue;
        const found = findMainExe(install, (m.AppName || '').replace(/^[0-9a-f]+-/, ''));
        if (!found) continue;
        results.push({
          id: 'epic-' + (m.AppName || slugify(name)),
          name,
          description: 'Epic Games',
          command: '"' + found + '"',
          category: 'Epic Games',
          detectedBy: 'epic',
          coverUrl: null,
          exeName: path.basename(found).toLowerCase(),
          installed: true,
        });
        continue;
      }
      results.push({
        id: 'epic-' + (m.AppName || slugify(name)),
        name,
        description: 'Epic Games',
        command: '"' + exe + '"',
        category: 'Epic Games',
        detectedBy: 'epic',
        coverUrl: null,
        exeName: path.basename(exe).toLowerCase(),
        installed: true,
      });
    } catch {}
  }
  return results;
}

// ---------- Xbox / MS Store ----------
const XBOX_EXCLUDED = [
  'Settings', 'Calculator', 'Camera', 'Clock', 'Alarms', 'Phone', 'Maps', 'Store',
  'Photos', 'Mail', 'Calendar', 'People', 'YourPhone', 'Todos', 'Paint', 'Notepad',
  'Terminal', 'PowerShell', 'Groove', 'Movies & TV', 'Films & TV', 'Feedback Hub', 'Get Help',
  'Clipchamp', 'Office', 'Word', 'Excel', 'PowerPoint', 'OneNote', 'Outlook',
  'Xbox Game Bar', 'Xbox Console Companion', 'Xbox', 'Dev Home', 'Media Player',
  'Acceso por voz', 'Administración', 'Administrador de tareas', 'Configuración',
  'Sugerencias', 'Graba', 'Recortes', 'Cámara', 'Reloj', 'Mapas', 'Correo', 'Calendario',
  'Personas', 'Teléfono', 'Almacenamiento', 'Bloc de notas', 'Explorador de archivos',
  'Microsoft Store', 'Obtener ayuda', 'Centro de comentarios', 'Películas y TV',
  'Cine y TV', 'Grabador de voz', 'Noticias', 'Tiempo', 'Música', 'Fotos', 'Edge', 'Visor',
  'Administración de equipos', 'Administración de impresión', 'Asistencia rápida',
  'Application Verifier', 'Centro de comando de gráficos', 'Centro de control',
  'Seguridad de Windows', 'Administrador de credenciales', 'Observador de eventos',
  'Monitor de recursos', 'Desfragmentar', 'Copia de seguridad', 'Recuperación',
  'Servicios', 'Administración de discos', 'Solucionador de problemas', 'Sonido',
  'Bluetooth', 'Impresoras', 'Dispositivos', 'Rendimiento', 'Herramientas de Windows',
  'Panel de control', 'Símbolo del sistema', 'Ejecutar', 'Editor del Registro',
  'Diagnóstico de memoria', 'Información del sistema', 'Iniciador iSCSI',
  'Liberador de espacio', 'Lupa', 'Mapa de caracteres', 'Narrador',
  'Teclado en pantalla', 'Subtítulos en directo', 'Orígenes de datos ODBC',
  'Directiva de seguridad local', 'Programador de tareas', 'Notas rápidas',
  'Command Prompt', 'Documentación', 'Documentation', 'ReadMe', 'Samples', 'FAQ',
  'Uninstall', 'Desinstalar', 'Website', 'Release Notes', 'Herramientas para',
  'Developer Command Prompt', 'Native Tools Command Prompt', 'Cross Tools',
  'Sugerencias', 'Instalación', 'Installer', 'Verificador de aplicaciones',
  'Rendimiento de Windows', 'Storage Spaces',
];

// Prefijos AUMID de aplicaciones de sistema de Windows para descartar.
const XBOX_SYSTEM_AUMID = [
  'Microsoft.Windows.Explorer', 'Microsoft.Windows.Cortana', 'Microsoft.Windows.Search',
  'Microsoft.AAD.BrokerPlugin', 'Microsoft.AsyncTextService', 'Microsoft.BioEnrollment',
  'Microsoft.CredDialogHost', 'Microsoft.LockApp', 'Microsoft.WindowsOOBE',
  'Microsoft.Windows.StartMenuExperienceHost', 'Microsoft.Windows.CShell',
  'MicrosoftWindows.Client', 'MicrosoftWindows.CrossDevice', 'Microsoft.549981C3F5F10',
  'Microsoft.WindowsNotepad', 'Microsoft.WindowsCalculator', 'Microsoft.WindowsStore',
  'Microsoft.StorePurchaseApp', 'Microsoft.MicrosoftEdge', 'MicrosoftEdge',
  'Microsoft.WindowsTerminal', 'Microsoft.WindowsPhotos', 'Microsoft.WindowsCamera',
  'Microsoft.WindowsAlarms', 'Microsoft.WindowsClock', 'Microsoft.WindowsFeedbackHub',
  'Microsoft.GetHelp', 'Microsoft.WindowsMaps', 'Microsoft.ZuneMusic', 'Microsoft.ZuneVideo',
  'Microsoft.Paint', 'Microsoft.ScreenSketch', 'Microsoft.YourPhone', 'Microsoft.OfficeHub',
  'Microsoft.MicrosoftOfficeHub', 'Microsoft.OneDriveSync', 'Microsoft.Todos',
  'Microsoft.WindowsReadingList', 'Microsoft.PowerShell', 'Microsoft.WindowsAppRuntime',
  'Microsoft.WinDbg', 'Microsoft.PPIProjection', 'Microsoft.WindowsSecureAssessmentBrowser',
  'Microsoft.XboxGamingOverlay', 'Microsoft.GamingApp', 'Microsoft.XboxIdentityProvider',
  'Microsoft.XboxSpeechToTextOverlay', 'Microsoft.XboxGameCallableUI', 'Microsoft.XboxGameOverlay',
  'Microsoft.SecHealthUI', 'Microsoft.Windows.SecurityCenter', 'Microsoft.Windows.StartMenu',
  'Microsoft.Win32WebViewHost', 'Microsoft.Win32WebViewHost', 'Microsoft.Windows.SecureAssessmentBrowser',
  'Microsoft.Windows.ContentDeliveryManager', 'Microsoft.WidgetsPlatformRuntime', 'Microsoft.Widgets',
  'Microsoft.CloudExperienceHost', 'Microsoft.AccountsControl', 'Microsoft.Windows.LogonUI',
  'Microsoft.Windows.ShellExperienceHost', 'MicrosoftWindows.UndockedDevKit',
  '1ac14e77-02e7-4e5d-b744-2eb1ae5198b7', 'd65231b0-b2f1-4857-a4ce-a8e7c6ea7d27',
];

function xboxApps() {
  const results = [];
  try {
    const out = ps('Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress');
    const data = JSON.parse(out || '[]');
    const arr = Array.isArray(data) ? data : [data];
    for (const a of arr) {
      if (!a || !a.AppID || !a.Name) continue;
      const name = a.Name.trim();
      const aumid = a.AppID;
      if (!name) continue;
      if (XBOX_SYSTEM_AUMID.some((p) => aumid.startsWith(p))) continue;
      if (XBOX_EXCLUDED.some((x) => name.toLowerCase().includes(x.toLowerCase()))) continue;
      results.push({
        id: 'xbox-' + slugify(aumid),
        name,
        description: 'Xbox / Tienda de Microsoft',
        command: 'explorer.exe shell:AppsFolder\\' + aumid,
        category: 'Xbox / Tienda',
        detectedBy: 'xbox',
        coverUrl: null,
        exeName: null,
        installed: true,
      });
    }
  } catch {}
  return results;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'app';
}

// ---------- Conjunto ----------
function detect() {
  const out = { steam: [], epic: [], xbox: [], errors: [] };
  try {
    const dir = steamInstallDir();
    if (dir) out.steam = steamApps(dir);
    else out.errors.push('Steam no encontrado');
  } catch (e) { out.errors.push('Steam: ' + e.message); }
  try {
    out.epic = epicApps();
    if (!out.epic.length) out.errors.push('Epic sin juegos instalados');
  } catch (e) { out.errors.push('Epic: ' + e.message); }
  try {
    out.xbox = xboxApps();
  } catch (e) { out.errors.push('Xbox: ' + e.message); }
  return out;
}

module.exports = { detect };
