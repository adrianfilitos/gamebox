$ErrorActionPreference = 'Stop'
$dist = 'C:\GameBox\dist'
$pkg = "$dist\package"

# 1) Copiar la app desde el portal de desarrollo (limpia de artefactos locales)
Remove-Item "$pkg\app" -Recurse -Force
New-Item -ItemType Directory -Force -Path "$pkg\app" | Out-Null
Copy-Item 'C:\GameBox\portal\*' "$pkg\app\" -Recurse -Force
Remove-Item "$pkg\app\config.json", "$pkg\app\data", "$pkg\app\stats.json", "$pkg\app\logs", "$pkg\app\covers", "$pkg\app\launch" -Recurse -Force -ErrorAction SilentlyContinue

# 2) Añadir config de ejemplo y limpiar juegos
@'
{
  "app": { "name": "GameBox", "version": "2.0.0", "port": 4443 },
  "settings": {
    "launchMode": "user", "autoStart": false, "checkUpdates": true,
    "updateManifest": "", "scanOnStart": true, "language": "es", "wizardCompleted": false
  }
}
'@ | Set-Content "$pkg\app\config.example.json" -Encoding utf8

@'
[
  { "id": "escritorio", "name": "Escritorio", "description": "Transmite el escritorio completo", "category": "Sistema", "command": null },
  { "id": "navegador", "name": "Navegador", "description": "Abre el navegador (Chrome)", "category": "Aplicaciones", "command": "\"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\"" }
]
'@ | Set-Content "$pkg\app\games.json" -Encoding utf8

# 3) ZIP del paquete
Remove-Item "$dist\gamebox-package.zip" -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "$pkg\*" -DestinationPath "$dist\gamebox-package.zip" -CompressionLevel Optimal -Force
Copy-Item "$dist\gamebox-package.zip" "$dist\setup\package.zip" -Force
Write-Output "Zip OK: $((Get-Item "$dist\gamebox-package.zip").Length) bytes"
