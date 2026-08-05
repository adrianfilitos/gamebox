# GameBox — Cloud gaming personal

> 🌐 **Web oficial / descarga**: https://adrianfilitos.github.io/gamebox/ · 💾 **Releases**: https://github.com/adrianfilitos/gamebox/releases

Convierte un PC con Windows en una "consola remota": detecta automáticamente tus juegos de **Steam**, **Epic Games** y **Xbox / Tienda de Microsoft**, y te deja lanzarlos y transmitirlos desde el móvil, la tablet o cualquier PC, con mando o controles táctiles.

## Características (v2)

- **Instalador único** (`GameBoxSetup.exe`, .NET 10 self-contained): empaqueta la app + un Node.js portable. Instalación guiada o silenciosa (`/S`).
- **Carpeta de instalación automática** en `%LocalAppData%\GameBox` (no requiere administrador).
- **Comprobación de dependencias** (Node, ViGEmBus, Sunshine, puerto).
- **Configuración guiada** en el primer arranque (asistente).
- **Actualizaciones automáticas**: el portal comprueba un `update.json` y se auto-actualiza.
- **Biblioteca con búsqueda, categorías, portadas y favoritos**.
- **Detección automática de juegos**: Steam (appmanifest + portadas CDN), Epic (manifests `.item`) y Xbox/Tienda (`Get-StartApps`).
- **Integración con Steam, Epic Games y Xbox** (lanzamiento directo).
- **Estadísticas**: lanzamientos, tiempo jugado, más jugados y recientes.
- **Gestión de procesos** (ver y cerrar procesos del sistema y de los juegos).
- **Supervisión de errores y registros** (logs en tiempo real desde la UI).
- **Ajustes rápidos** (modo de lanzamiento, inicio con Windows, escaneo automático, URL de actualizaciones).
- **PWA**: solo usable desde el icono añadido a la pantalla de inicio, a pantalla completa. En el navegador solo se muestra una presentación con las instrucciones.
- **Archivo de configuración sencillo**: `app/config.json`.

## Instalación

Descarga `GameBoxSetup.exe` y ejecútalo:

```
GameBoxSetup.exe                 Instalación guiada
GameBoxSetup.exe /S              Instalación silenciosa
GameBoxSetup.exe /Dir="C:\GameBox" /Port=4443 /AutoStart=1
```

Al terminar arranca la web y abre el navegador en `https://localhost:4443`. Desde tu dispositivo, añade GameBox a la pantalla de inicio y úsalo desde el icono.

> **Mandos**: el mando se conecta al dispositivo desde el que se ve la transmisión (Gamepad API del navegador). El host necesita el driver **ViGEmBus** para que Sunshine inyecte el input.

## Estructura del repositorio

```
portal/            App (server.js, lib/, public/, version.json, config.example.json)
setup/             Fuente del instalador (GameBoxSetup.csproj, Program.cs, build-package.ps1)
tools/             Utilidades (auto-pair.js, etc.)
update.json        Manifiesto de actualizaciones
```

### Estructura de la instalación

```
<instalación>/
  app/             código del portal (se sustituye en cada actualización)
  node/            Node.js portable incluido
  GameBox.cmd      arranque
  version.json
  update.json
```

## Cómo compilar el instalador

1. Prepara el paquete (app limpia + Node portable + zip):
   ```powershell
   powershell -File dist\build-package.ps1
   ```
2. Publica el instalador (requiere el SDK de .NET 10):
   ```sh
   dotnet publish setup/GameBoxSetup.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o out
   ```
   → `out/GameBoxSetup.exe`

## Cómo publicar una actualización

1. Sube el nuevo `gamebox-package.zip` como asset de un release de GitHub (`vX.Y.Z`).
2. Actualiza `update.json` (versión, URL del zip, SHA-256 opcional).
3. Los clientes pulsan *Comprobar actualización* en la pestaña **Sistema → Actualización**, o se les notifica automáticamente.

## Seguridad

- `portal/config.json` contiene credenciales reales: **nunca se sube** (ignorado por `.gitignore`; usa `portal/config.example.json`).
- Acceso externo recomendado solo vía Tailscale.
- Certificado autofirmado generado automáticamente en el primer arranque.
