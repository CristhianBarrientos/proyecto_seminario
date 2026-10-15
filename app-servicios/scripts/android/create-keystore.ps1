<#
.SYNOPSIS
  Crea la llave (keystore) con la que se firma el APK de Ya Quedo. Se ejecuta UNA SOLA VEZ.

.DESCRIPTION
  Android identifica una app y acepta sus actualizaciones por la firma. Si esta llave se pierde o se cambia,
  nadie podra actualizar la app: habria que desinstalarla y volver a instalarla (y se pierden sus datos locales).

  keytool te pedira las contrasenas por consola. Escribelas tu: este script NO las lee ni las guarda.
  Cuando pregunte la contrasena de la clave, puedes presionar ENTER para usar la misma del keystore.

.NOTES
  Ejecutar en una terminal de PowerShell normal (no desde un editor sin consola interactiva):
    powershell -ExecutionPolicy Bypass -File scripts\android\create-keystore.ps1
#>
$ErrorActionPreference = 'Stop'

$dir = Join-Path $env:USERPROFILE '.yaquedo'
$ks  = Join-Path $dir 'yaquedo-release.jks'

if (Test-Path $ks) {
    throw "Ya existe $ks. No se sobrescribe: reemplazar la llave impide actualizar la app instalada."
}

# El JBR de Android Studio NO incluye keytool; se busca en JAVA_HOME, en el JDK instalado y en el PATH.
$candidatos = @()
if ($env:JAVA_HOME) { $candidatos += (Join-Path $env:JAVA_HOME 'bin\keytool.exe') }
$candidatos += Get-ChildItem 'C:\Program Files\Java\jdk*\bin\keytool.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | ForEach-Object FullName
$candidatos += 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
$enPath = Get-Command keytool.exe -ErrorAction SilentlyContinue
if ($enPath) { $candidatos += $enPath.Source }
$keytool = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $keytool) { throw 'No encuentro keytool.exe. Instala un JDK 21 o define JAVA_HOME apuntando a uno (el JBR de Android Studio no lo trae).' }

New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host ''
Write-Host 'Vas a crear la llave de firma de Ya Quedo.' -ForegroundColor Cyan
Write-Host "Archivo: $ks"
Write-Host 'keytool te pedira una contrasena (dos veces). Elige una larga y guardala en un gestor de contrasenas.'
Write-Host ''

& $keytool -genkeypair -v `
    -keystore $ks `
    -alias yaquedo `
    -keyalg RSA -keysize 4096 `
    -validity 9125 `
    -dname 'CN=Ya Quedo, OU=Proyecto SEMINARIO, O=Universidad Mariano Galvez, C=GT'
if ($LASTEXITCODE -ne 0) { throw 'keytool fallo; no se creo la llave.' }

# Solo tu usuario puede leer el archivo.
& icacls $ks /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

Write-Host ''
Write-Host 'Llave creada.' -ForegroundColor Green
Write-Host "  Archivo : $ks"
Write-Host '  Alias   : yaquedo'
Write-Host ''
Write-Host 'IMPORTANTE - haz AHORA una copia de seguridad:' -ForegroundColor Yellow
Write-Host '  1. Copia el archivo .jks a un lugar aparte (pendrive o nube privada).'
Write-Host '  2. Guarda la contrasena en tu gestor de contrasenas, SEPARADA del archivo.'
Write-Host '  3. Nunca subas el .jks ni la contrasena a git ni al chat.'
