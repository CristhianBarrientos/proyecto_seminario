<#
.SYNOPSIS
  Compila el APK de Ya Quedo (release, minimizado), lo firma y verifica. Deja el resultado en dist-apk\.

.DESCRIPTION
  1. Fija el entorno de PRODUCCION (el APK hornea la URL de la API y la anon key) y comprueba que sea el correcto.
  2. Compila la web (sin la copia legacy), la sincroniza con el proyecto Android y corre Gradle.
  3. Firma con tu keystore (pide la contrasena por consola; no se guarda ni se escribe en ningun archivo).
  4. Verifica la firma, el paquete, la version y los permisos, y calcula tamano y SHA-256.

.PARAMETER Unsigned
  Compila SIN firmar. Sirve para probar el proceso o medir el tamano; ese APK no se puede instalar.

.NOTES
  Requisitos: app-servicios\.env.production.local (ver .env.production.example) y, para firmar, la llave creada con
  create-keystore.ps1.
    powershell -ExecutionPolicy Bypass -File scripts\android\build-apk.ps1
#>
param([switch]$Unsigned)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$app     = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path     # carpeta app-servicios
$android = Join-Path $app 'android'
$outDir  = Join-Path $app 'dist-apk'
$prodUrl = 'https://api.yaquedo.shop'

function Step($msg) { Write-Host ''; Write-Host "==> $msg" -ForegroundColor Cyan }
function Fail($msg) { throw $msg }

$signEnv = @('YAQUEDO_KEYSTORE_FILE', 'YAQUEDO_KEYSTORE_PASSWORD', 'YAQUEDO_KEY_ALIAS', 'YAQUEDO_KEY_PASSWORD')
$viteEnv = @('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY')

# ---------------------------------------------------------------- 0. herramientas
# JDK: se usa el primero que funcione de verdad (lib\jvm.cfg existe). El JBR de Android Studio puede quedar
# incompleto tras una actualizacion ("could not open ...\jbr\lib\jvm.cfg") y no trae keytool.
$jdks = @()
if ($env:JAVA_HOME) { $jdks += $env:JAVA_HOME }
$jdks += (Get-ChildItem 'C:\Program Files\Java\jdk*' -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object FullName)
$jdks += 'C:\Program Files\Android\Android Studio\jbr'
$jdk = $jdks | Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin\java.exe')) -and (Test-Path (Join-Path $_ 'lib\jvm.cfg')) } | Select-Object -First 1
if (-not $jdk) { Fail 'No encuentro un JDK funcional (21 recomendado). Instala uno o define JAVA_HOME.' }
$env:JAVA_HOME = $jdk
Write-Host "  JDK: $jdk"
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
if (-not (Test-Path $env:ANDROID_HOME)) { Fail "No encuentro el SDK de Android en $($env:ANDROID_HOME)." }
$buildTools = Get-ChildItem (Join-Path $env:ANDROID_HOME 'build-tools') -Directory |
    Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } | Select-Object -Last 1
if (-not $buildTools) { Fail 'No hay build-tools instaladas en el SDK.' }

# Variables de firma que pudieran venir del shell: en modo -Unsigned se descartan, o Gradle firmaria igual
# y el script buscaria otro archivo.
if ($Unsigned) { foreach ($v in $signEnv) { Remove-Item "Env:$v" -ErrorAction SilentlyContinue } }

# ---------------------------------------------------------------- 1. entorno de produccion
Step 'Fijando y verificando el entorno de produccion'
$envFile = Join-Path $app '.env.production.local'
if (-not (Test-Path $envFile)) { Fail "Falta $envFile. Copia .env.production.example y completa la anon key de PRODUCCION." }
$envVars = @{}
Get-Content $envFile | ForEach-Object { if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { $envVars[$Matches[1]] = $Matches[2] } }
$prodKey = $envVars['VITE_SUPABASE_ANON_KEY']
if ($envVars['VITE_SUPABASE_URL'] -ne $prodUrl) { Fail "VITE_SUPABASE_URL debe ser $prodUrl (es '$($envVars['VITE_SUPABASE_URL'])'). El APK NO puede apuntar a localhost." }
if (-not $prodKey -or $prodKey -match '[<>]') { Fail 'VITE_SUPABASE_ANON_KEY esta vacia o es la plantilla.' }

# Vite da prioridad a las variables del PROCESO sobre cualquier archivo .env. Se fijan aqui a los valores de
# produccion para que nada que haya quedado exportado en este shell pueda pisarlos.
$env:VITE_SUPABASE_URL = $prodUrl
$env:VITE_SUPABASE_ANON_KEY = $prodKey
Write-Host "  URL de la API: $prodUrl (ok)"

# ---------------------------------------------------------------- 2. web
Step 'Compilando la web para el APK (npm run build:android)'
Push-Location $app
try {
    & npm run build:android
    if ($LASTEXITCODE -ne 0) { Fail 'La compilacion de la web fallo.' }

    # Guardia sobre lo que REALMENTE quedo horneado en dist\ (todos los archivos de texto, no solo .js)
    $textFiles = Get-ChildItem (Join-Path $app 'dist') -Recurse -File -Include *.js, *.html, *.css, *.json, *.map
    $all = ($textFiles | ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"
    foreach ($bad in @('localhost:8000', '127.0.0.1:8000', '10.0.2.2', '129.213.37.131')) {
        if ($all.Contains($bad)) { Fail "dist\ contiene '$bad': el APK apuntaria a un servidor de desarrollo o a uno viejo. Abortado." }
    }
    if (-not $all.Contains($prodUrl)) { Fail "dist\ no contiene $prodUrl. Abortado." }
    if (-not $all.Contains($prodKey)) { Fail 'dist\ no contiene la anon key de produccion de .env.production.local: se horneo otra. Abortado.' }
    # Si existe un .env de desarrollo con OTRA key, esa key no puede estar en el resultado.
    $devEnv = Join-Path $app '.env'
    if (Test-Path $devEnv) {
        $devKeyLine = Get-Content $devEnv | Where-Object { $_ -match '^\s*VITE_SUPABASE_ANON_KEY\s*=' } | Select-Object -First 1
        if ($devKeyLine) {
            $devKey = ($devKeyLine -replace '^\s*VITE_SUPABASE_ANON_KEY\s*=\s*', '').Trim()
            if ($devKey -and $devKey -ne $prodKey -and $all.Contains($devKey)) { Fail 'dist\ contiene la anon key del .env de DESARROLLO. Abortado.' }
        }
    }
    if (Get-ChildItem (Join-Path $app 'dist') -Recurse -Filter '*legacy*') { Fail 'dist\ contiene archivos legacy: se uso el vite.config equivocado.' }
    Write-Host '  dist\ ok: URL y key de produccion, sin servidores de desarrollo, sin legacy.'

    Step 'Sincronizando con el proyecto Android (cap sync)'
    & npx cap sync android
    if ($LASTEXITCODE -ne 0) { Fail 'cap sync fallo.' }

    # Push (FCM): el plugin google-services de Gradle solo se aplica si existe androidpp\google-services.json.
    # Ese archivo NO va al repo (android\.gitignore): se toma de YAQUEDO_GOOGLE_SERVICES o de
    # %USERPROFILE%\.yaquedo\google-services.json, y se valida que sea de esta app.
    Step 'Configurando Firebase (push)'
    $gs = $env:YAQUEDO_GOOGLE_SERVICES
    if (-not $gs) { $gs = Join-Path $env:USERPROFILE '.yaquedo\google-services.json' }
    if (-not (Test-Path $gs)) { Fail "Falta google-services.json ($gs). Descargalo de Firebase (proyecto yaquedoapp > app Android) o define YAQUEDO_GOOGLE_SERVICES." }
    $gsJson = Get-Content $gs -Raw | ConvertFrom-Json
    $gsPkgs = @($gsJson.client | ForEach-Object { $_.client_info.android_client_info.package_name })
    if ($gsPkgs -notcontains 'umg.yaquedo.app') { Fail "google-services.json no es de umg.yaquedo.app (paquetes: $($gsPkgs -join ', ')). El push no llegaria." }
    Copy-Item $gs (Join-Path $android 'app\google-services.json') -Force
    Write-Host "  google-services.json ok (proyecto $($gsJson.project_info.project_id))"
} finally {
    Pop-Location
    foreach ($v in $viteEnv) { Remove-Item "Env:$v" -ErrorAction SilentlyContinue }
}

# ---------------------------------------------------------------- 3. firma
$signed = -not $Unsigned
if ($signed) {
    Step 'Preparando la firma'
    $ks = $env:YAQUEDO_KEYSTORE_FILE
    if (-not $ks) { $ks = Join-Path $env:USERPROFILE '.yaquedo\yaquedo-release.jks' }
    if (-not (Test-Path $ks)) { Fail "No existe la llave $ks. Crea una con scripts\android\create-keystore.ps1." }
    $env:YAQUEDO_KEYSTORE_FILE = $ks
    if (-not $env:YAQUEDO_KEYSTORE_PASSWORD) {
        $sec  = Read-Host -AsSecureString 'Contrasena de la llave (no se muestra ni se guarda)'
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
        try   { $env:YAQUEDO_KEYSTORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr); $sec.Dispose() }
    }
    Write-Host "  llave: $ks"
}

# ---------------------------------------------------------------- 4. Gradle
Step 'Compilando el APK con Gradle (R8 minimiza el codigo; la primera vez tarda varios minutos)'
Push-Location $android
try {
    Remove-Item (Join-Path $android 'app\build\outputs\apk\release') -Recurse -Force -ErrorAction SilentlyContinue
    # --no-daemon: sin esto la contrasena (que viaja en el entorno del proceso) quedaria dentro de un daemon de
    # Gradle que sigue vivo horas despues de terminar el script.
    & .\gradlew.bat assembleRelease --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) { Fail 'Gradle fallo. Si dice "Keystore was tampered with" o "password was incorrect", la contrasena no es correcta.' }
} finally {
    Pop-Location
    foreach ($v in $signEnv) { Remove-Item "Env:$v" -ErrorAction SilentlyContinue }   # la contrasena no queda en el entorno
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
if ($pkg -notmatch "name='umg.yaquedo.app'") { Fail "El paquete no es umg.yaquedo.app: $pkg" }
if ($pkg -notmatch "versionName='([^']+)'") { Fail "No pude leer versionName del APK: $pkg" }
$versionName = $Matches[1]
if ($pkg -notmatch "versionCode='(\d+)'") { Fail "No pude leer versionCode del APK: $pkg" }
$versionCode = $Matches[1]
if ($badging -match 'application-debuggable') { Fail 'El APK es depurable: no es un release.' }
$perms = @($badging | Where-Object { $_ -like 'uses-permission:*' } | ForEach-Object { ($_ -replace ".*name='([^']+)'.*", '$1') })

if ($signed) {
    $apksigner = Join-Path $buildTools.FullName 'apksigner.bat'
    # apksigner escribe avisos por stderr; en PowerShell 5.1 un 2>&1 con ErrorAction=Stop los convertiria en error
    # fatal aunque la firma sea valida. Se relaja SOLO esta llamada y se decide por el codigo de salida.
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        $v = & $apksigner verify --verbose --print-certs $final 2>&1 | ForEach-Object { $_.ToString() }
        $verifyCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $prev }
    if ($verifyCode -ne 0) { Fail "La firma no verifica: $($v -join ' | ')" }
    $cert = ($v | Where-Object { $_ -match 'certificate SHA-256 digest' } | Select-Object -First 1)
    Write-Host '  firma verificada (v2/v3).'
    Write-Host "  $cert"
}

$sha = (Get-FileHash $final -Algorithm SHA256).Hash.ToLower()
$mb  = [math]::Round((Get-Item $final).Length / 1MB, 2)

Write-Host ''
Write-Host 'LISTO' -ForegroundColor Green
Write-Host "  Archivo  : $final"
Write-Host "  Paquete  : umg.yaquedo.app  (version $versionName, versionCode $versionCode)"
Write-Host "  Permisos : $($perms -join ', ')"
Write-Host ''
Write-Host 'Datos para la landing (app-servicios\src\lib\appRelease.ts):' -ForegroundColor Yellow
Write-Host "  version : '$versionName'"
Write-Host "  sizeMb  : $mb"
Write-Host "  sha256  : '$sha'"
Write-Host ''
if ($signed) {
    Write-Host 'ANTES de publicar, instalalo en un celular real y prueba el login y los flujos principales:' -ForegroundColor Yellow
    Write-Host "  adb install -r `"$final`""
    Write-Host '  (el release esta minimizado con R8: una regla faltante puede romper algo que el APK de depuracion si tiene)'
} else {
    Write-Host 'Ojo: este APK NO esta firmado; no se puede instalar ni publicar.' -ForegroundColor Yellow
}
