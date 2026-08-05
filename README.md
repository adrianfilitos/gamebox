# GameBox — Cloud gaming personal

Convierte un PC con Windows en una "consola remota": juega a tus juegos de PC desde el móvil, la tablet o cualquier PC, con mando o controles táctiles, directamente en el navegador. El equipo arranca en una cuenta aislada (kiosko) sin permisos de administrador.

> Proyecto de uso personal. **No subas tus contraseñas**: usa `portal/config.example.json` como plantilla.

## Arquitectura

```
Dispositivo ──HTTPS──▶ Portal GameBox (Node.js, puerto 4443)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          Sunshine     Moonlight Web  Panel Sunshine
        (streaming)     (consola)      (configuración)
```

- **Portal (launcher)** — Node.js + Express: biblioteca de juegos, estado del sistema y una consola embebida para transmitir. **Sin autenticación** (acceso directo). Proxy HTTPS hacia Moonlight Web y hacia el panel de Sunshine.
- **[Sunshine](https://github.com/LizardByte/Sunshine)** — servidor de streaming (H.264/HEVC por hardware). Se instala aparte.
- **[Moonlight Web](https://github.com/MrCreativ3001/moonlight-web-stream)** — cliente de streaming en el navegador: mando (Gamepad API), táctil en móvil, teclado/ratón en escritorio. Se descarga como binario y se sirve tras el portal (SSO por cabecera).
- **[Tailscale](https://tailscale.com)** — VPN privada opcional para jugar fuera de casa sin abrir puertos en el router.
- **Kiosko** — cuenta de Windows estándar con shell de solo-launcher (`bin/GameBoxKiosk.cs`), auto-login y sin acceso al escritorio. La pantalla del PC solo muestra un fondo estático; todo se lanza desde el móvil.

## Instalación

1. Instala **Node.js LTS**, **Sunshine**, **Tailscale** y **Moonlight Web** (descarga el release para Windows y colócalo en `C:\GameBox\moonlight-web-deploy\package`).
2. Copia `portal/config.example.json` a `portal/config.json` y rellena con tus credenciales (protege el archivo con permisos de Administradores).
3. Configura Moonlight Web (`server/config.json`) con `url_path_prefix = "/ml"`, bind a `127.0.0.1:8080` y `forwarded_header.username_header = "X-Forwarded-User"`.
4. Genera un certificado autofirmado con `bin/gen-cert.ps1` (o instala uno de confianza).
5. Registra el portal y Moonlight Web como tareas programadas al inicio (SYSTEM) para que estén siempre disponibles.
6. Crea la cuenta kiosko (usuario estándar), activa `bin/kiosk-on.cmd` y compila el shell kiosko:
   ```sh
   csc.exe /nologo /target:winexe /out:GameBoxKiosk.exe bin/GameBoxKiosk.cs
   ```
   y ponlo como `Shell` de la cuenta kiosko en `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon`.
7. Abre el portal, entra en la consola, añade el equipo `localhost` y empareja con el PIN (o usa `tools/auto-pair.js`).

## Uso

- **En casa**: `https://IP-DEL-PC:4443`
- **Fuera de casa**: `https://IP-DE-TAILSCALE:4443` (necesita Tailscale)
- Abre el portal (sin login), elige un juego en la biblioteca o entra en la **Consola** para transmitir.
- El PC debe estar encendido y en la sesión de kiosko para jugar de forma aislada.
- **Mandos**: el mando se conecta al dispositivo desde el que se ve la transmisión (Gamepad API del navegador). El host necesita el driver **ViGEmBus** instalado para que Sunshine inyecte el input en los juegos.

## Seguridad

- Cuenta kiosko estándar (sin admin) con shell de solo-launcher.
- Firewall: solo los puertos necesarios (portal 4443, Sunshine 47984/47989/48010 TCP y 47998-48000/48002/48010 UDP, WebRTC 40000-40100 UDP).
- Portal sin autenticación (acceso directo); Sunshine con usuario/contraseña y PIN de emparejamiento.
- Acceso externo solo vía Tailscale (sin abrir puertos en el router).
- El archivo `config.json` solo es legible por Administradores/SYSTEM.

## Estructura

```
bin/             scripts de arranque, kiosko y certificado
portal/          portal web (server.js, frontend, detección de juegos)
tools/           auto-emparejamiento con Sunshine (auto-pair.js)
```

## Notas

- El portal está pensado para `C:\GameBox` (rutas en los scripts y en `config.example.json`). Ajusta las rutas si lo despliegas en otro lugar.
- No incluye binarios de Moonlight Web (descárgalos del proyecto upstream) ni credenciales reales.
