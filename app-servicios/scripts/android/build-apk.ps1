<#
.SYNOPSIS
  Compila el APK de Ya Quedo (release, minimizado), lo firma y verifica. Deja el resultado en dist-apk\.

.DESCRIPTION
  1. Verifica que el entorno de PRODUCCION sea el correcto (el APK hornea la URL de la API y la anon key).
  2. Compila la web (sin la copia legacy), la sincroniza con el proyecto Android y corre Gradle.
  3. Firma con tu keystore (pide la contrasena por consola; NO se guarda ni se escribe en ningun archivo).
  4. Verifica la firma, el nombre del paquete y los permisos, y calcula tamano y SHA-256.

.PARAMETER Unsigned
  Compila SIN firmar. Sirve para probar el proceso o medir el tamano; ese APK no se puede instalar.

.NOTES
  Requisitos: app-servicios\.env.production.local (ver .env.production.example) y, para firmar,
  la llave creada con create-keystore.ps1.
    powershell -ExecutionPolicy Bypass -File scripts\android\build-apk.ps1
#>
param([switch]$Unsigned)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$app     = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path     # carpeta app-servicios
$android = Join-Path $app 'android'
$outDir  = Join-Path $app 'dist-apk'
$prodUrl = 'https://api.yaquedo.shop'

function Step($msg)  { Write-Host ''; Write-Host "==> $msg" -ForegroundColor Cyan }
function Fail($msg)  { throw $msg }

# ---------------------------------------------------------------- 0. herramientas
if (-not $env:JAVA_HOME)    { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
if (-not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) { Fail "No encuentro Java en $($env:JAVA_HOME)." }
if (-not (Test-Path $env:ANDROID_HOME)) { Fail "No encuentro el SDK de Android en $($env:ANDROID_HOME)." }
$buildTools = Get-ChildItem (Join-Path $env:ANDROID_HOME 'build-tools') -Directory | Sort-Object { [version]($_.Name -replace '[^0-9.]','') } | Select-Object -Last 1
if (-not $buildTools) { Fail 'No hay build-tools instaladas en el SDK.' }

# ---------------------------------------------------------------- 1. entorno de produccion
Step 'Verificando el entorno de produccion'
$envFile = Join-Path $app '.env.production.local'
if (-not (Test-Path $envFile)) { Fail "Falta $envFile. Copia .env.production.example y completa la anon key de PRODUCCION." }
$envVars = @{}
Get-Content $envFile | ForEach-Object { if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { $envVars[$Matches[1]] = $Matches[2] } }
if ($envVars['VITE_SUPABASE_URL'] -ne $prodUrl) { Fail "VITE_SUPABASE_URL debe ser $prodUrl (es '$($envVars['VITE_SUPABASE_URL'])'). El APK NO puede apuntar a localhost." }
if (-not $envVars['VITE_SUPABASE_ANON_KEY'] -or $envVars['VITE_SUPABASE_ANON_KEY'] -match '[<>]') { Fail 'VITE_SUPABASE_ANON_KEY esta vacia o es la plantilla.' }
Write-Host "  URL de la API: $prodUrl (ok)"

# ---------------------------------------------------------------- 2. web
Step 'Compilando la web para el APK (npm run build:android)'
Push-Location $app
try {
    & npm run build:android
    if ($LASTEXITCODE -ne 0) { Fail 'La compilacion de la web fallo.' }

    # Guardia sobre lo que realmente quedo "horneado" en dist\
    $js = Get-ChildItem (Join-Path $app 'dist') -Recurse -Filter *.js
    $all = ($js | ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"
    if ($all -match 'localhost:8000')   { Fail 'dist\ contiene localhost:8000: el APK apuntaria a un servidor de desarrollo. Abortado.' }
    if ($all -match '129\.213\.37\.131') { Fail 'dist\ contiene la IP vieja de OCI. Abortado.' }
    if ($all -notmatch [regex]::Escape($prodUrl)) { Fail "dist\ no contiene $prodUrl. Abortado." }
    if (Get-ChildItem (Join-Path $app 'dist') -Recurse -Filter '*legacy*') { Fail 'dist\ contiene archivos legacy: se uso el vite.config equivocado.' }
    Write-Host '  dist\ ok: apunta a produccion, sin localhost, sin legacy.'

    Step 'Sincronizando con el proyecto Android (cap sync)'
    & npx cap sync android
    if ($LASTEXITCODE -ne 0) { Fail 'cap sync fallo.' }
} finally { Pop-Location }

# ---------------------------------------------------------------- 3. firma
$signed = -not $Unsigned
$clearEnv = @('YAQUEDO_KEYSTORE_FILE','YAQUEDO_KEYSTORE_PASSWORD','YAQUEDO_KEY_ALIAS','YAQUEDO_KEY_PASSWORD')
if ($signed) {
    Step 'Preparando la firma'
    $ks = $env:YAQUEDO_KEYSTORE_FILE
    if (-not $ks) { $ks = Join-Path $env:USERPROFILE '.yaquedo\yaquedo-release.jks' }
    if (-not (Test-Path $ks)) { Fail "No existe la llave $ks. Crea una con scripts\android\create-keystore.ps1." }
    $env:YAQUEDO_KEYSTORE_FILE = $ks
    if (-not $env:YAQUEDO_KEYSTORE_PASSWORD) {
        $sec = Read-Host -AsSecureString 'Contrasena de la llave (no se muestra ni se guarda)'
        $env:YAQUEDO_KEYSTORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    }
    Write-Host "  llave: $ks"
}

# ---------------------------------------------------------------- 4. Gradle
Step 'Compilando el APK con Gradle (R8 minimiza el codigo; la primera vez tarda varios minutos)'
Push-Location $android
try {
    Remove-Item (Join-Path $android 'app\build\outputs\apk\release') -Recurse -Force -ErrorAction SilentlyContinue
    & .\gradlew.bat assembleRelease --console=plain
    if ($LASTEXITCODE -ne 0) { Fail 'Gradle fallo. Si dice "Keystore was tampered with" o "password was incorrect", la contrasena no es correcta.' }
} finally {
    Pop-Location
    foreach ($v in $clearEnv) { Remove-Item "Env:$v" -ErrorAction SilentlyContinue }   # la contrasena no queda en el entorno
}

# ---------------------------------------------------------------- 5. resultado y verificacion
Step 'Verificando el resultado'
$relDir = Join-Path $android 'app\build\outputs\apk\release'
$apk = Join-Path $relDir $(if ($signed) { 'app-release.apk' } else { 'app-release-unsigned.apk' })
if (-not (Test-Path $apk)) { Fail "No se genero $apk." }

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$final = Join-Path $outDir $(if ($signed) { 'yaquedo.apk' } else { 'yaquedo-unsigned.apk' })
Copy-Item $apk $final -Force

$aapt2 = Join-Path $buildTools.FullName 'aapt2.exe'
$badging = & $aapt2 dump badging $final 2>$null
$pkg = ($badging | Where-Object { $_ -like 'package:*' } | Select-Object -First 1)
$perms = @($badging | Where-Object { $_ -like 'uses-permission:*' } | ForEach-Object { ($_ -replace ".*name='([^']+)'.*",'$1') })
if ($pkg -notmatch "name='umg.yaquedo.app'") { Fail "El paquete no es umg.yaquedo.app: $pkg" }
if ($badging -match 'application-debuggable') { Fail 'El APK es depurable: no es un release.' }

if ($signed) {
    $apksigner = Join-Path $buildTools.FullName 'apksigner.bat'
    $v = & $apksigner verify --verbose --print-certs $final 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "La firma no verifica: $v" }
    $cert = ($v | Where-Object { $_ -match 'certificate SHA-256 digest' } | Select-Object -First 1)
    Write-Host '  firma verificada (v2/v3).'
    Write-Host "  $cert"
}

$sha = (Get-FileHash $final -Algorithm SHA256).Hash.ToLower()
$mb  = [math]::Round((Get-Item $final).Length / 1MB, 2)

Write-Host ''
Write-Host 'LISTO' -ForegroundColor Green
Write-Host "  Archivo  : $final"
Write-Host "  Paquete  : umg.yaquedo.app"
Write-Host "  Permisos : $($perms -join ', ')"
Write-Host ''
Write-Host 'Datos para la landing (app-servicios\src\lib\appRelease.ts):' -ForegroundColor Yellow
Write-Host "  version : '1.0.0'"
Write-Host "  sizeMb  : $mb"
Write-Host "  sha256  : '$sha'"
if (-not $signed) { Write-Host ''; Write-Host 'Ojo: este APK NO esta firmado; no se puede instalar ni publicar.' -ForegroundColor Yellow }
