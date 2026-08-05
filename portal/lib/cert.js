const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PS = 'powershell.exe';

// Resuelve los materiales TLS para el servidor HTTPS:
// 1. PEM (key/cert) si existen (compatibilidad local)
// 2. PFX guardado
// 3. Genera un certificado autofirmado en la tienda CurrentUser y lo exporta a PFX
function resolve({ key, cert, pfx, passphrase, dataDir }) {
  if (key && cert && fs.existsSync(key) && fs.existsSync(cert)) {
    try {
      return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
    } catch {}
  }
  const pfxDir = path.join(dataDir || '.', 'certs');
  const pfxPath = pfx || path.join(pfxDir, 'server.pfx');
  const pass = passphrase || 'gamebox';
  if (fs.existsSync(pfxPath)) {
    try { return { pfx: fs.readFileSync(pfxPath), passphrase: pass }; } catch {}
  }
  fs.mkdirSync(pfxDir, { recursive: true });
  const hostname = os.hostname();
  const names = ['localhost', hostname, '*.ts.net', '127.0.0.1'].join("','");
  const script =
    "$ErrorActionPreference = 'Stop'\n" +
    `$names = @('${names}')\n` +
    "$cert = New-SelfSignedCertificate -DnsName $names -CertStoreLocation Cert:\\CurrentUser\\My -NotAfter (Get-Date).AddYears(10)\n" +
    `$pwd = ConvertTo-SecureString -String '${pass}' -Force -AsPlainText\n` +
    `Export-PfxCertificate -Cert $cert -FilePath '${pfxPath}' -Password $pwd -Force | Out-Null\n` +
    "$thumb = $cert.Thumbprint\n" +
    "$cert.Dispose()\n" +
    "Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.Thumbprint -eq $thumb } | Remove-Item -Force\n";
  execFileSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' });
  return { pfx: fs.readFileSync(pfxPath), passphrase: pass };
}

module.exports = { resolve };
