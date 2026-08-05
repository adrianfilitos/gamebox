$ErrorActionPreference = 'Stop'
$openssl = 'C:\Program Files\Git\usr\bin\openssl.exe'
$certDir = 'C:\GameBox\certs'
$sans = @('DNS:localhost', "DNS:$env:COMPUTERNAME", 'DNS:*.ts.net', 'IP:127.0.0.1')
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ForEach-Object { $sans += "IP:$($_.IPAddress)" } | Out-Null
$addext = 'subjectAltName=' + ($sans -join ',')
& $openssl req -x509 -newkey rsa:2048 -keyout "$certDir\key.pem" -out "$certDir\cert.pem" -days 3650 -nodes -subj '/CN=GameBox' -addext $addext 2>$null
Write-Output "Certificado regenerado con SANs:"
Write-Output ($sans -join ', ')
