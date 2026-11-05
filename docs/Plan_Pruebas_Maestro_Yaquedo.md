# Plan de Pruebas Maestro - Ya Quedó (iteración 1)

Fecha: 2026-11-04 · Autor: SQA (sesión Claude) · Alcance: SOLO localhost. Producción (app.yaquedo.shop / api.yaquedo.shop / OCI) es destino futuro de la fase de humo post-despliegue, no se tocó.

## 0. Leyenda de honestidad y estado real del entorno

| Marca | Significado |
|---|---|
| **[VERIFICADO]** | Lo ejecuté/leí yo en esta sesión (código, SQL, curl a localhost:8000, Chrome). |
| **[PROPUESTA]** | Diseño de prueba, no ejecutada. |

> **ACTUALIZACIÓN (iteración 1b, 2026-11-05):** el front local ya respondía (Vite en `localhost:8100`, apunta a `localhost:8000`, sin captcha). Se ejecutó la evaluación en Chrome, TC-001..TC-005 y pruebas de API con la anon key local. Los resultados están en la **sección 11** y en la tabla de la sección 7. Donde esta sección 0 o las secciones 6 y 9 digan "por código", se aclara con la marca **[Chrome]** (verificado en navegador/API/BD local) o **[código]** (solo lectura). Los bullets de abajo son el estado de la primera pasada.

**Estado del entorno en la primera pasada [VERIFICADO]:**
- Front local NO estaba corriendo: `curl` a `localhost:8100`, `127.0.0.1:5173`, `localhost:5173`, `:3000`, `:8080` devolvió 000, y Chrome (pestaña nueva) mostró página de error en `http://localhost:8100`. Por la restricción de no arrancar servidores ni tocar el repo, **no hice la evaluación heurística en Chrome ni los breakpoints**; todo el pilar 6 es análisis estático de código/CSS (marcado así) más propuesta.
- No serví `app-servicios/dist`: contiene la URL `api.yaquedo.shop` incrustada (grep) y apuntaría el front a producción.
- Backend local sí está arriba: contenedores `supabase-*` healthy; Envoy escucha en `:8000`. Sin `apikey` válida todo responde 401 (incluido `/auth/v1/health`). No usé la anon key (vive en `.env`, fuera de alcance), así que las pruebas de caja gris autenticadas quedan como propuesta.
- Discrepancia detectada entre el brief y el código: `idleSession.ts` define `IDLE_LIMIT_MS = 30 min` (aviso a los 29), no 45 min; `idle-session.cy.ts` también prueba 29/30. Confirmar cuál es la regla de negocio y alinear docs/tests.
- "Búsqueda de profesionales cercanos": el `Home.tsx` real **no llama** a `nearby_professionals` (usa RPC `feed_services` + filtro de texto/categoría en cliente; el propio SQL dice "el front nunca la llamó"). El flujo cercano es hoy solo API.
- Carrito/checkout NO existen. Equivalente adaptado a todo el plan: **buscar (feed) -> perfil del profesional -> solicitar servicio (INSERT bookings, notas opcionales) -> solicitado/aceptado/en_curso/completado|cancelado -> chat -> reseña**. No hay pago en la app.

## 1. Caja negra

### 1.1 E2E de flujos críticos [PROPUESTA, basados en código leído]
Cuentas: `carlos.mendez@demo.com` (profesional), `maria.cliente@demo.com` (cliente), clave demo (solo local); cuentas nuevas `@test.local`.

| ID | Flujo | Pasos clave | Esperado |
|---|---|---|---|
| E2E-01 | Registro 3 pasos (cliente) | `/login?modo=registro`; P1 nombre "Ana López" + rol Cliente; Continuar; P2 correo `ana.<ts>@test.local`; P3 contraseña `Abcdef1!`; Crear mi cuenta | Barra "Paso n de 3"; `signUp` con metadata `{full_name, role}`; trigger crea `profiles`; redirección `/tabs/home` (autoconfirm) |
| E2E-02 | Registro profesional desde landing | Landing -> "Crear mi perfil profesional" | Login abre en signup con rol Profesional preseleccionado; tras alta, Home muestra dashboard "Así va tu negocio" |
| E2E-03 | Login válido / inválido | credenciales demo; luego clave errónea | Redirige a `/tabs/home`; error "El correo o la contraseña no son correctos." con `role=alert` |
| E2E-04 | Búsqueda en feed | Home como cliente; texto "plom"; filtro categoría | Lista filtrada por título/nombre/categoría; vacío -> "No encontramos servicios" |
| E2E-05 | Solicitar servicio | Tarjeta -> perfil -> "Solicitar" -> notas -> enviar | INSERT en `bookings` estado `solicitado`; el profesional recibe notificación |
| E2E-06 | Doble solicitud | repetir E2E-05 mismo servicio | Error 23505 `bookings_one_active_per_service_idx` -> "Ya tenés una solicitud activa..." |
| E2E-07 | Ciclo del profesional | Carlos: solicitado -> aceptar -> en_curso -> completar; variante rechazar/cancelar | Solo transiciones del trigger `validate_booking_update`; cliente ve el estado actualizado (Realtime/refresh) |
| E2E-08 | Cliente cancela | María cancela en solicitado y en aceptado | Permitido; en en_curso NO (botón ausente / error de trigger) |
| E2E-09 | Chat | Abrir ChatModal en una booking; enviar mensaje; segundo usuario lo recibe | Mensaje <=2000 chars; entrega en tiempo real; notificación con `left(body,80)` |
| E2E-10 | Reseña | Booking completada: Calificar -> 4 estrellas + comentario -> Publicar; Editar; Eliminar | Aparece en perfil público como "María D."; marca "(editada)" solo si cambió; promedio actualizado; eliminar recalcula |
| E2E-11 | Cierre por inactividad | Con reloj simulado (cy.clock): 29 min aviso, 30 min cierre | Redirige a Login con "Tu sesión se cerró por inactividad..." una sola vez |
| E2E-12 | Sesión: timebox 12 h / JWT 900 s | Mantener sesión activa 15+ min | `refresh_token` renueva sin desloguear; a las 12 h exige login |

### 1.2 Matriz de validación de entradas [VERIFICADO contra `validation.ts`; casos PROPUESTA]

**Nombre completo** (`isValidFullName`: >=2 palabras, cada una >=2 letras, acepta acentos/ñ/guion/apóstrofe, sin números; `trim`):
| Clase | Valor | Esperado |
|---|---|---|
| Válida | "María López", "Jean-Pierre O'Brien", "Ñoño Pérez" | OK |
| Límite inferior | "Al Bo" (2+2) ok; "A Bo" | OK / inválido |
| Inválida | "Maria" (1 palabra), "Ana 2 López", "Ana L.", "  " | error "Ingresá tu nombre y apellido..." |
| Frontera | "Ana  López" (doble espacio) ok; "Ana-" (termina en guion) | OK / inválido |
| Hostil | `<script>alert(1)</script> X`, 10 000 caracteres | rechazado por regex; sin límite superior en UI (**hallazgo: sin maxlength**, ver BUG-03) |

**Correo** (`EMAIL_REGEX`): válidos `a@b.co`, `ana+tag@sub.dominio.gt`; inválidos `.@..com`, `a..b@x.com`, `a@x`, `a@x.c`, `a@-x.com`, `a b@x.com`, `ana@x.com ` (con espacio final: se hace trim, válido). Longitud: probar 254 y 255 caracteres (la regex no limita; el servidor decide).

**Contraseña registro** (min 8, mayúscula ASCII, dígito, especial en `!"#$%&'()*+,-./;<=>?@[]^_\`{|}~`; excluye `:` y `\`): 
| Valor | Esperado |
|---|---|
| `Abcdef1!` (8 exactos) | OK |
| `Abcde1!` (7) | falla length |
| `abcdef1!` | falla upper |
| `Abcdefg!` | falla number |
| `Abcdefg1` | falla special |
| `Abcdef1:` / `Abcdef1\` | falla special (a propósito, coincide con GoTrue) |
| `Ñbcdef1!` | falla upper (Ñ no cuenta; el servidor igual) |
| 72 y 73 bytes | verificar límite bcrypt del servidor |
Contrato dual: repetir los mismos valores contra `POST /auth/v1/signup` y exigir mismo veredicto (`weak_password` 422).

**Contraseña login**: `>=6` tras `trim` (se envía sin trim): "12345" bloquea; "123456" llega al servidor. Probar clave con espacios al final (se valida con trim pero se envía cruda).

**Comentario de reseña** (1..500, `maxlength=500`, opcional en UI; CHECK en BD `char_length(btrim(comment)) between 1 and 500`): `null`/vacío -> OK (reseña sin texto); "x" -> OK; 500 -> OK; 501 -> UI lo corta, API/BD rechaza (check_violation); solo espacios "   " -> BD rechaza (btrim=0) -> verificar mensaje de la UI; emoji (conteo por code point vs UTF-16 en `maxlength`); rating 0 (botón deshabilitado), 6 vía API (CHECK rating).

**Mensajes de chat**: 1..2000 (UI `maxlength=2000`, BD CHECK + trigger btrim): vacío/solo espacios (botón deshabilitado), 2000 ok, 2001 vía API rechazado.

**Perfil profesional** (`EditProfessionalProfile`): lat [-90,90], lng [-180,180], ambos o ninguno (par); valores -90/90/-180/180 ok, 90.0001 error, "abc"; `bio` sin maxlength en UI ni en BD (`bio text`): probar 100 000 chars (BUG-03). **Servicio** (`MyServices`): título >=3 (2 falla, 3 ok), precio `isPositiveNumber` (0, -1, "1e3", "", "0.01"), `price_unit` en {servicio,hora,dia,m2} pero columna `text` sin CHECK: API acepta "xyz" (BUG-04). **Notas de solicitud**: sin maxlength ni CHECK (`notes text`): BUG-03.

### 1.3 Suites
- **Humo (<5 min, tras cada deploy; también en producción como solo-lectura/login)**: landing carga y enlaces -> login demo -> feed lista >=1 servicio -> perfil abre -> bookings carga -> logout. Producción: sin crear datos.
- **Regresión (nocturna)**: Cypress existente (feed, landing, login, signup, idle-session, reviews) + E2E-05..E2E-10 + contrato de validación dual + RLS/API (sección 2).

## 2. Caja gris [PROPUESTA salvo lo marcado]

Variables (PowerShell/Bash): `API=http://localhost:8000`, `ANON=<anon local>` (sacarla de la config local, no versionar), `TOK` = access_token de login.

### 2.1 Endpoints
| Área | Casos |
|---|---|
| `/auth/v1/signup` | contraseña débil -> 422 `weak_password`; correo duplicado -> mismo mensaje/forma que alta nueva (enumeración); `data.role="admin"` -> el cast a enum `user_role` falla y todo el INSERT hace rollback (esperado 500/422 sin dejar `auth.users` huérfano); `data.role="profesional"` -> permitido por diseño (decisión de producto: rol auto-elegido); `data` con JSON gigante |
| `/auth/v1/token?grant_type=password` | credencial mala 400 "Invalid login credentials" idéntica para correo inexistente y clave errónea; refresh con token reutilizado |
| `/auth/v1/user` | token expirado (esperar 900 s o forjar `exp`) -> 401; firma alterada -> 401; `alg:none` -> 401 |
| `/rest/v1/*` | tablas con RLS: `bookings`, `reviews`, `messages`, `notifications`, `profiles`, `professional_profiles`, `services`, `reports`, `rpc_rate_limit` (sin acceso), device tokens |
| RPC | `nearby_professionals` (ver 2.3), `feed_services`, `professional_reviews`, `professional_ratings` (vista/RPC), `register_device_token` (revocada a anon) |
| Edge `send-push` | sin `x-push-secret` -> 401; secreto incorrecto -> 401 (comparación en tiempo constante `safeEqual`); método GET; payload sin `notification_id` |
| Realtime | suscribirse a `messages` de una booking ajena (debe no recibir eventos por RLS); sin JWT |
| Storage | bucket de documentos de verificación: lectura anon y de otro usuario denegada (`fix-storage-verification-docs.sql`); subida de tipo/tamaño no permitido |

### 2.2 BD (psql contra el contenedor local `supabase-db`, solo lectura/rollback)
- Índice único parcial: `begin; insert` x2 (client, service) en estados activos -> 23505; completar la primera y reinsertar -> OK; `rollback`.
- Trigger `validate_booking_update`: probar cada par (rol, estado origen, destino) = matriz completa; reasignar `client_id/professional_id/service_id` -> excepción; cambiar `price_agreed` fuera de `solicitado` -> excepción; cliente `-> completado` -> excepción; tercero -> "No autorizado".
- Trigger signup `handle_new_user`: metadata sin `full_name` -> usa parte local del correo; `role` inválido -> rollback total; verificar con `select count(*) from auth.users u left join profiles p on p.id=u.id where p.id is null` = 0.
- Constraints: `reviews.rating`, comentario 1..500, una reseña por booking, solo booking completada; `messages.body`; FK en cascada.
- RLS por rol: `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}'` y repetir SELECT/INSERT/UPDATE/DELETE por tabla; anon a todas.
- Consistencia: kill de la conexión durante signup (no debe haber usuario sin perfil).

### 2.3 Autenticación/autorización con curl (localhost)
```bash
API=http://localhost:8000; ANON=<anon-local>
# Login
TOK=$(curl -s -X POST "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"maria.cliente@demo.com","password":"Demo1234!"}' | jq -r .access_token)

# IDOR: cliente A lee una booking de cliente B (esperado: [] por RLS)
curl -s "$API/rest/v1/bookings?id=eq.<uuid_de_B>" -H "apikey: $ANON" -H "Authorization: Bearer $TOK"
# IDOR escritura: cliente intenta cancelar/editar booking ajena (esperado: 0 filas o 403)
curl -s -X PATCH "$API/rest/v1/bookings?id=eq.<uuid_de_B>" -H "apikey: $ANON" -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"status":"cancelado"}'
# Cliente se auto-completa un trabajo (esperado: excepción del trigger)
curl -s -X PATCH "$API/rest/v1/bookings?id=eq.<uuid_propia>" ... -d '{"status":"completado"}'
# Escalada: cambiar el propio rol en profiles (esperado: denegado)
curl -s -X PATCH "$API/rest/v1/profiles?id=eq.<mi_uuid>" ... -d '{"role":"profesional"}'
# Signup con role inválido / admin
curl -s -X POST "$API/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"esc@test.local","password":"Abcdef1!","data":{"role":"admin","full_name":"Esc Test"}}'
# Anon a tablas y RPC (esperado: 401/42501/[])
curl -s "$API/rest/v1/reviews?select=*" -H "apikey: $ANON"
curl -s -X POST "$API/rest/v1/rpc/nearby_professionals" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"lat":14.63,"lng":-90.51,"radius_km":10}'
# Rate limit RPC: la llamada 31 del mismo minuto -> HTTP 429 (PT429); ventana fija: ráfaga hasta 60 en borde de minuto
for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code} " -X POST "$API/rest/v1/rpc/nearby_professionals" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d '{"lat":14.63,"lng":-90.51,"radius_km":999}'; done
# radius 999 debe acotarse a 50; coordenadas 91 -> excepción; respuesta con coordenadas enmascaradas (rejilla 0.01° ~1 km), <=50 filas
# Enumeración: comparar cuerpo, status y tiempo de /token con correo existente vs inexistente, y de /signup con correo duplicado
# Fuerza bruta: 25 intentos de login contra el correo @test.local propio (esperado: rate limit GoTrue; el 20 req/10 s de Cloudflare solo aplica en OCI, no en local)
# JWT manipulado: cambiar 1 char de la firma, y alg:none -> 401
```
Observación: el límite por cuenta se evade creando cuentas (autoconfirm + signup abierto); la mitigación declarada es la tarea #5 (captcha/Turnstile, otra sesión trabaja en eso en `wt-turnstile`): incluir test de regresión cuando se mergee.

**[VERIFICADO] ejecutado contra localhost:8000**: `GET /auth/v1/health`, `GET /rest/v1/profiles`, `POST /auth/v1/signup` con `apikey: invalid`, y `POST /rest/v1/rpc/nearby_professionals` sin clave -> los cuatro devuelven **401** (Envoy). Es el control de borde, no sustituye RLS.

## 3. Caja blanca / unitarias [PROPUESTA]

Estado actual: vitest (71 tests: validation, idleSession(+storage), appRelease, pushNotifications, useMyReviews, Legal, ReviewForm, ProfessionalReviews). Sin umbral de cobertura configurado.

**Metas** (`vitest --coverage`, provider v8, umbrales en `vite.config.ts`): `src/lib/**` líneas 90% / ramas 85% (validation, idleSession, errorMessages, supabaseSchemas, constants); `src/components/**` líneas 70% / ramas 60%; `src/pages/**` 60/50 (lo cubre Cypress); global 70/60. SQL plpgsql con **pgTAP** (`CREATE EXTENSION pgtap` en BD de pruebas): 100% de ramas de `validate_booking_update`, `handle_new_user`, `nearby_professionals`, trigger de reseñas "editada", trigger de chat; medir con `plpgsql_check`/`pg_stat_user_functions`.

**Casos de condicionales/excepciones prioritarios**
- Estados de booking (pgTAP, tabla de verdad 5 estados x 2 roles x destinos): permitidas -> `lives_ok`; el resto `throws_ok` con mensaje; congelación de ids y precio; tercero.
- Rate limit RPC: llamadas 1, 30 (ok), 31 (SQLSTATE PT429); cambio de minuto reinicia; ráfaga en frontera (60); limpieza oportunista solo cuando `calls=1`; `uid null`; lat/lng nulos/fuera de rango; `radius_km` null->10, negativo->0, 999->50; concurrencia (2 sesiones simultáneas).
- Edición de reseña: update sin cambios no marca "editada" (`v2-editado-solo-si-cambia`); cambio de rating o comentario sí; reseña de booking no completada rechazada; autor solo edita lo suyo.
- `idleSession.ts`: `idleState` en 0, 28:59, 29:00, 29:59, 30:00 min; `secondsUntilExpiry` nunca negativo; storage bloqueado (try/catch) en read/write/clear/flag; NaN/valor corrupto en `localStorage`; flag `peek` sin borrar vs `clear`.
- `validation.ts`: tabla 1.2 como `it.each`; `firstMissingField`; `isPositiveNumber` (0, -1, "1e3", " ", "Infinity").
- `errorMessages.ts`: un caso por rama (invalid login, already registered, weak_password antes del caso "6", rate limit, jwt/401, 42501, 23505); verificar que nunca se filtra el texto crudo.
- Componentes: ReviewForm (estados idle/editing/confirmDelete, rating<1 deshabilita, error de red, doble clic con `busy`), BookingCard por estado/rol, ChatModal (trim, límite, error de envío), IdleSessionGuard (timers falsos).

**Mocks/stubs**
- Supabase: `vi.mock('../lib/supabaseClient')` con builder encadenable (`from().select().eq()` -> thenable) y `rpc` simulados; fábrica `mockSupabase({rpc:{feed_services:...}})`; canal Realtime con `on().subscribe()` stub que permite emitir eventos.
- Auth/OAuth/FCM: `AuthContext` envuelto con proveedor falso (user/role); `@capacitor/push-notifications` y `@capacitor/app` mockeados; `Capacitor.isNativePlatform()` -> false/true por prueba; token FCM fijo. Edge `send-push`: prueba en Deno con `fetch` stub de FCM.
- Geolocalización: `navigator.geolocation.getCurrentPosition` stub (éxito, PERMISSION_DENIED, timeout).
- **IonTextarea/IonInput en jsdom**: son web components (Stencil) y `onIonInput` no se dispara con `userEvent.type`; usar `fireEvent(el, new CustomEvent('ionInput',{detail:{value}}))` o `setupIonicReact()` + `defineCustomElements` en `setupTests.ts`; el `counter`/`maxlength` no se evalúa en jsdom -> cubrirlo en Cypress. Mockear `matchMedia`, `ResizeObserver`, `IntersectionObserver`.
- Tiempo: `vi.useFakeTimers()` y `vi.setSystemTime` para idle y animación del toggle de contraseña.

## 4. SQA

### 4.1 Matriz severidad vs prioridad (impacto en Ya Quedó)
| Severidad \ Prioridad | P1 (arreglar ya) | P2 (este sprint) | P3 (backlog) |
|---|---|---|---|
| S1 Crítica (seguridad/datos/bloqueo) | Fuga de datos entre usuarios por RLS (IDOR en bookings/messages/reviews); escalada de rol o auto-completar trabajo; login/registro caído; secreto de send-push expuesto | Rate limit de RPC evadible con cuentas masivas (sin captcha) | - |
| S2 Mayor | No se puede solicitar ni aceptar un servicio; chat no entrega; reseña no se guarda; APK no instala | Notas/bio/título sin límite (abuso de almacenamiento); cierre por inactividad inconsistente con la regla (30 vs 45) | Falta paginación en `nearby_professionals` (LIMIT 50 silencioso) |
| S3 Menor | Mensaje de error engañoso en login | `price_unit` libre en BD; viewport sin zoom | Fuentes 10-11 px |
| S4 Cosmético | - | - | Desalineaciones, animaciones |

Criterio de negocio: para un marketplace de confianza entre desconocidos, privacidad de ubicación, reputación (reseñas falsas/ajenas) y la integridad del ciclo de la solicitud pesan más que lo visual. No hay dinero en la app, así que el riesgo financiero es nulo; el reputacional y de datos personales (ubicación, documentos de verificación) es el principal.

### 4.2 Automatización: qué primero
1. Humo + login + registro (Cypress ya cubre parcialmente). 2. Solicitud -> aceptar -> completar -> reseña (núcleo de valor). 3. RLS/API con colección Postman/Newman o pruebas Cypress `cy.request` (ya hay precedente en `reviews.cy.ts`). 4. pgTAP sobre triggers. 5. Idle (ya cubierto). Manual: UX, a11y con lector, APK en dispositivo (S10e, al final por indicación previa), push real.

### 4.3 Framework: Cypress vs Playwright
| Criterio | Cypress (ya en uso) | Playwright (stack del usuario) |
|---|---|---|
| Inversión existente | 6 specs funcionando, helpers de reseñas | 0 en este repo |
| Multi-sesión (cliente y profesional a la vez, chat) | Pobre: un solo browser/origen, requiere `cy.session`/dos pasos | Excelente: varios `BrowserContext` en un mismo test |
| Shadow DOM Ionic | Necesita `includeShadowDom` | Localizadores traspasan shadow DOM por defecto |
| Móvil/emulación y WebKit | Chromium/Firefox, sin WebKit real | Chromium, Firefox y WebKit + emulación de dispositivos |
| Control de reloj (idle) | `cy.clock` ya usado | `page.clock` equivalente |
| Velocidad/paralelismo/CI | Paralelo de pago (Cloud) | Paralelo nativo gratis, trazas |
**Recomendación:** mantener Cypress para lo existente (no reescribir) y **adoptar Playwright solo para los flujos nuevos multi-usuario** (booking cliente<->profesional, chat en tiempo real, validación responsive/WebKit y axe). Evitar mantener dos suites a largo plazo: si Playwright cubre el núcleo, migrar el resto gradualmente. Es una recomendación a validar con el usuario antes de tocar nada.

## 5. SAST / DAST / carga

### 5.1 SAST en el pipeline [PROPUESTA]
- **ESLint + typescript-eslint** (ya presentes): añadir `eslint-plugin-security` (detect-object-injection, detect-unsafe-regex: relevante para `FULL_NAME_REGEX`/`EMAIL_REGEX`, con riesgo ReDoS a evaluar), y reglas `no-restricted-globals`/`no-eval`, `react/no-danger`. Fallar CI con `--max-warnings 0` en `src/lib`.
- **Semgrep**: `p/typescript`, `p/react`, `p/jwt`, `p/secrets`; reglas propias: prohibir `service_role`/`SERVICE_KEY` en `app-servicios/`; `.from('...').insert` sin manejo de `error`; `console.error` de objetos de error completos en prod (hoy `getFriendlyErrorMessage` hace `console.error('[Error real]', error)`: aceptable, valorar redacción en APK).
- **Fortify SSC**: escanear `app-servicios/src` y `edge_functions/send-push` (Deno); triage esperado: falsos positivos por `dangerouslySetInnerHTML` ausente, Hardcoded Password en tests/fixtures demo, "Privacy Violation" por logging; justificar con evidencia.
- **Secretos**: Gitleaks en pre-commit y CI (`gitleaks detect --redact`); TruffleHog sobre historial completo (`trufflehog git file://. --only-verified`). Atención especial: carpeta `FIREBASE\` (service account) y `.env` deben estar en `.gitignore` y fuera de historial; `dist/` no debe versionarse (embebe URLs).
- **Dependencias**: `npm audit --omit=dev` + `osv-scanner`, Dependabot; revisar Capacitor/Vite.
- **SQL**: `squawk`/revisión manual de migraciones; verificar `SECURITY DEFINER` con `set search_path` (p. ej. `validate_booking_update` es SECURITY DEFINER **sin** `set search_path` en el archivo leído: hallazgo SEC-01 a confirmar).

### 5.2 DAST [PROPUESTA]
Solo contra staging local (`localhost:8000` + front local), nunca OCI. ZAP baseline/API scan con OpenAPI de PostgREST (`GET /rest/v1/` con anon key) autenticado con token de `maria`; Burp Community para reglas de IDOR manual; Nessus WAS (Docker) con usuario de prueba. Verificar cabeceras (CSP, HSTS en Cloudflare), CORS de Kong/Envoy, y que `/auth/v1` rate limit exista también localmente si se quiere probar fuerza bruta.

### 5.3 Carga y estrés (k6) [PROPUESTA, no ejecutada; solo local/staging aislado]
Perfil realista (marketplace universitario/regional, Guatemala): base 50-150 usuarios activos, picos de **300-500 VU** por evento (lanzamiento en clase, campaña), horario 18:00-22:00 GT (UTC-6), mayoría móvil con red 3G/4G variable.

| Escenario | Carga | Mezcla | SLO |
|---|---|---|---|
| Humo de carga | 10 VU, 2 min | login + feed | p95 < 800 ms, 0 errores |
| Típico | rampa 0->100 VU en 5 min, 15 min sostenido | 60% feed/perfil, 15% bookings lista, 10% solicitud, 10% chat (Realtime), 5% reseña | p95 feed < 800 ms, p95 escritura < 1.2 s, error < 1% |
| Pico | 0->400 VU en 2 min, 10 min | igual + 50 logins/min | p95 < 2 s, error < 2% |
| Estrés | +100 VU cada 2 min hasta degradar | - | identificar punto de quiebre, recuperación < 2 min |
| Resistencia | 80 VU, 2 h | - | memoria/conexiones estables |
| Específicos | 1) `nearby_professionals` a 29/30/31 por minuto por usuario (429 exacto, no 500); 2) 200 usuarios haciendo login (respetar 20 req/10 s de Cloudflare: en OCI el límite se dispara, local no); 3) 1000 conexiones Realtime; 4) subida de documentos |

```js
// k6: esqueleto
import http from 'k6/http'; import { check, sleep } from 'k6';
export const options = { stages:[{duration:'2m',target:100},{duration:'10m',target:100},{duration:'1m',target:0}],
  thresholds:{ http_req_failed:['rate<0.01'], http_req_duration:{expected_response:['p(95)<800']} } };
export default function(){ /* token por VU desde setup(); POST rpc/feed_services; sleep(1+Math.random()*3) */ }
```
Cuellos de botella: `pg_stat_statements` (top por `total_exec_time`, `mean_exec_time`, `calls`); `EXPLAIN (ANALYZE, BUFFERS)` de `nearby_professionals` confirmando Index Scan sobre `professional_location_idx` (GiST) y que `ST_SnapToGrid` no impida el prefiltro; `rpc_rate_limit`: contención/bloat por `ON CONFLICT` por minuto y por el DELETE oportunista; conexiones del pooler (Supavisor, 5432/6543: `SHOW POOLS`/`pg_stat_activity`); Realtime (conexiones, mensajes/s, `max_concurrent_users`); CPU/RAM/IO de la instancia OCI (`docker stats`, métricas de OCI Monitoring) que es el techo real (Free tier ARM/AMD pequeño); latencia de borde por Cloudflare y su rate limit como causa de falsos 429 en pruebas.

## 6. UI/UX

**Importante:** las tablas 6.1 a 6.4 son la versión de la primera pasada (análisis estático [código] y propuesta). La evaluación real en Chrome, axe-core y breakpoints está en la **sección 11**, que prevalece donde difiera.

### 6.1 Heurísticas de Nielsen (hallazgos en código)
| # | Heurística | Hallazgo | Pantalla/elemento | Evidencia |
|---|---|---|---|---|
| H1 | Visibilidad del estado | Bien: barra de progreso del registro con `role=progressbar`, requisitos de contraseña en vivo, `IonLoading` | Login | `Login.tsx` |
| H2 | Control del usuario | Bien: botón "Atrás" y se conserva lo escrito. Mejora: tras fallar el envío no hay "reintentar" explícito en el feed | Login/Home | código |
| H3 | Prevención de errores | Notas, bio sin límite y sin contador; reseña sí tiene contador | ProfessionalDetail, EditProfessionalProfile | `IonTextarea` sin `maxlength` |
| H4 | Consistencia | Voseo ("Probá", "Ingresá") consistente; pero tarjeta del feed muestra `price_unit` crudo ("servicio", "m2", "dia") sin etiqueta amigable y precio "Q{n}" sin formato de miles/decimales | Home `.service-card__unit` | `Home.tsx`, `PRICE_UNITS` existe pero no se usa |
| H5 | Reconocimiento | El feed se llama "Servicios cerca de ti" pero NO filtra por cercanía (solo texto/categoría) | Home | promesa no cumplida, ver sección 0 |
| H6 | Ayuda a errores | Mensajes en lenguaje claro desde `errorMessages.ts`. Mejora: 429 sugiere "esperá un momento" sin tiempo | Login/RPC | código |
| H7 | Flexibilidad | El campo de contraseña se reemplaza temporalmente por spans `aria-hidden` durante la animación de mostrar/ocultar: si el usuario pulsa Enter o enfoca durante ~0.5-1 s se pierde el foco | Login (toggle) | `Login.tsx` `letterAnim` |
| H8 | Estética minimalista | Hero con dos ondas SVG y animaciones: bien, respetan reduced-motion en Login/Landing/PasswordRules/IdleSessionGuard pero **no** en Home/Dashboard/Bookings | CSS | grep `prefers-reduced-motion` |

### 6.2 Checklist WCAG 2.2 AA aplicado a Ionic
| Criterio | Verificación | Estado |
|---|---|---|
| 1.4.4 Cambio de tamaño / 1.4.10 Reflow | `index.html` tiene `maximum-scale=1.0, user-scalable=no` | **FALLA [VERIFICADO]** (BUG-01) |
| 1.4.3 Contraste 4.5:1 / 1.4.11 3:1 | Medir con axe/Lighthouse: texto sobre hero, `--ion-color-medium` en placeholders, chips "Verificado", `.password-toggle` | Pendiente (necesita front) |
| 1.4.12 Espaciado y fuentes mínimas | Textos de 0.65-0.78 rem y 10 px en Dashboard/Bookings/PasswordRules | **Riesgo [VERIFICADO]** (BUG-02) |
| 2.1.1 / 2.1.2 Teclado | Navegar con Tab: tarjetas del feed son `<button>` (bien); `status-ring__seg` en Dashboard tiene `outline:none` | Parcial; revisar el anillo |
| 2.4.7 Foco visible / 2.4.11 Foco no oculto (2.2) | `:focus-visible` definido solo en Landing/Legal; en la app Ionic depende del foco por defecto; barras sticky/IonTabBar podrían tapar el foco | Pendiente |
| 2.5.8 Tamaño del objetivo (2.2, mín. 24x24; recomendado 44) | `IonTabButton`, `IonSegmentButton`, `.password-toggle`, `StarRating`, botones `size="small"` de ReviewForm, badge `0.65rem` | Medir con `getBoundingClientRect` |
| 3.3.1/3.3.2/3.3.3 Errores y etiquetas | `IonInput` de Login con `IonLabel position="stacked"` (bien); **`IonTextarea` de notas y `IonSearchbar` solo con placeholder**; errores del formulario con `role="alert"` sólo en el mensaje general; `field-error` sin `aria-describedby` ni `aria-invalid` | **Falla parcial [VERIFICADO]** (BUG-05) |
| 3.3.7 Entrada redundante / 3.3.8 Autenticación accesible (2.2) | Mostrar/ocultar contraseña y autofill (`autocomplete` presente: bien) | Cumple por código |
| 4.1.2 Nombre, rol, valor | `role=radio` en tarjetas de rol (bien); `IonSegment` y `StarRating` con labels; iconos con `aria-label` solo en 20 puntos del código | Revisar con lector |
| 4.1.3 Mensajes de estado | `role=status` para aviso de inactividad y `role=alert` en errores (bien); el cambio de lista del feed no anuncia resultados | Mejora |
| 2.2.1 Tiempo ajustable | Aviso a los 29 min con descarte por interacción: cumple; verificar que el aviso sea anunciado (`role`) y enfocable | Cypress lo cubre en parte |
| 1.3.4 Orientación, `lang="es"` | `lang="es"` presente (bien); no se restringe orientación | Cumple |
| Animación / reduce-motion (2.3.3 AAA, buena práctica) | Presente en 5 archivos CSS, falta en Home/Dashboard/Bookings | Parcial |
| Lectores (TalkBack en S10e, NVDA+Chrome) | Orden de lectura, rol de IonTabBar, modal de chat (foco atrapado y devuelto), modal "Cómo instalo la app" | Propuesta manual |
Automático: `@axe-core/playwright` o `cypress-axe` en landing, login, signup (3 pasos), home, detalle, bookings, perfil, con `wcag2a, wcag2aa, wcag22aa`; quedan pendientes por requerir front.

### 6.3 Puntos de fricción del User Journey [PROPUESTA con base en el código]
- **Registro**: 3 pasos con rol elegido en el paso 1 (bien), pero el rol no es reversible y el usuario puede no entender qué implica "Profesional"; sin verificación de correo (autoconfirm) y futura Turnstile añadirá un paso: avisar en la barra de progreso.
- **Primer uso (cliente)**: feed sin ubicación; no hay onboarding ni permiso de geolocalización pedido en contexto; cuenta nueva sin servicios en su zona verá el feed global.
- **Solicitar servicio**: no hay confirmación previa ni resumen (precio, unidad), ni fecha/hora deseada, ni estimación; el único campo es "notas" opcional; tras enviar, saber dónde seguir la solicitud depende de un enlace en un mensaje. Duplicada -> mensaje bueno.
- **Profesional**: debe completar bio, ubicación (lat/lng numéricos a mano: fricción alta, deberían ser mapa/GPS), servicios y precio antes de recibir solicitudes; sin guía de "perfil completo".
- **Instalación del APK**: descarga desde la landing sólo si hay versión con SHA-256 publicada; "Cómo instalo la app" explica pasos; fricciones esperadas: aviso de "orígenes desconocidos" de Android, Play Protect, sin firma de Play Store. Medir tasa de abandono y verificar el hash en el flujo.

### 6.4 Criterios de aceptación responsive [PROPUESTA]
| Breakpoint | Criterios |
|---|---|
| 360x740 | Sin scroll horizontal; tab bar visible sin tapar contenido; objetivos >=44 px (mín. 24); formulario de registro cabe sin teclado tapando el CTA (Capacitor Keyboard); tarjeta del feed no trunca precio |
| 390x844 | Igual + safe-area (notch) respetada (`viewport-fit=cover`) |
| 768x1024 | Contenido con ancho máx. legible (no estirado), landing en 2 columnas, modales centrados |
| 1024x768 | Navegación utilizable con mouse/teclado, foco visible, hover states |
| 1440x900 | Contenedor centrado con max-width, sin tarjetas de ancho completo ilegible, landing sin huecos |
En todos: zoom 200% sin pérdida (hoy bloqueado por viewport), consola sin errores, ningún CLS visible al cargar el feed.

## 7. Casos funcionales listos para ejecutar (primeros 5)

Todos contra localhost. Estado = resultado REAL de esta sesión.

| ID | Descripción | Precondiciones | Pasos | Resultados esperados | Estado |
|---|---|---|---|---|---|
| TC-001 | Login válido del cliente demo | Front en `http://localhost:8100` o `127.0.0.1:5173`; backend `:8000`; cuenta demo creada | 1. Abrir `/login`. 2. Correo `maria.cliente@demo.com`. 3. Clave demo. 4. "Entrar". | Redirige a `/tabs/home`; feed visible; sin errores en consola | **Pasó [Chrome]** - login con `maria.cliente@demo.com`: Enter en el formulario redirigió a `/tabs/home`, feed cargado (RPC `feed_services` 200), sin errores en consola. Login Carlos por API: 200. |
| TC-002 | Registro paso 1 rechaza nombre inválido | Front arriba | 1. `/login?modo=registro`. 2. Nombre "Maria". 3. Continuar. | Permanece en paso 1; mensaje "Ingresá tu nombre y apellido (solo letras, sin números)."; con "María López" avanza al paso 2 | **Pasó [Chrome]** - "Maria" -> se queda en Paso 1 con "Ingresá tu nombre y apellido (solo letras, sin números)." (campo en rojo). "Ana Prueba" avanzó; flujo completo de 3 pasos con `qa2@test.local` creó la cuenta y redirigió a `/tabs/home`. Hallazgo: el mensaje no tiene `role`, ni `aria-invalid`, ni `aria-describedby` (UX-05). |
| TC-003 | Solicitud activa duplicada | Sesión de María; servicio de Carlos; front arriba | 1. Perfil de Carlos. 2. Solicitar servicio X. 3. Repetir sobre X. | 1.ª: ok `solicitado`; 2.ª: error "Ya tenés una solicitud activa para este servicio..." (23505) | **Pasó [Chrome]** - como María sobre el servicio de Carlos (ya tenía una solicitud `aceptado`): el INSERT fue rechazado y la UI mostró "Ya tenés una solicitud activa para este servicio. Podés verla en Solicitudes." (12.8 px, rgb(225,114,104)). No se creó ningún dato. Nota UX: el botón "Solicitar servicio" sigue ofrecido pese a existir solicitud activa (UX-06). |
| TC-004 | Reseña de 501 caracteres | Booking completada de María con Carlos | 1. Calificar, 5 estrellas. 2. Pegar 501 caracteres. 3. Publicar. | UI trunca a 500 (`maxlength`); por API 501 es rechazado por CHECK | **Pasó [Chrome + API]** - UI: se tecleó >500 caracteres y el campo quedó en 500 (`maxlength=500`, contador "0 / 500"); se canceló sin publicar. API (María, booking completada): 501 caracteres -> 400 `reviews_comment_len`; solo espacios -> 400 `reviews_comment_len`; rating 6 y 0 -> 400 `reviews_rating_check`; 500 caracteres -> 201 (control, borrada de inmediato). |
| TC-005 | El gateway local rechaza peticiones sin `apikey` válida | Contenedores `supabase-*` healthy | 1. `curl -i http://localhost:8000/auth/v1/health`. 2. `curl -H "apikey: invalid" http://localhost:8000/rest/v1/profiles`. 3. `POST /auth/v1/signup` con apikey inválida. 4. `POST /rest/v1/rpc/nearby_professionals` sin clave. | Todas 401, sin datos | **Pasó** - 401 en los 4 casos (cabecera `server: envoy`). Evidencia: salida de curl en esta sesión. |

## 8. Plantilla de reporte de hallazgos (UX/UI y bugs)

```
ID:                 BUG-### / UX-###
Título:             <verbo + síntoma + dónde>
Severidad:          S1 Crítica | S2 Mayor | S3 Menor | S4 Cosmética
Prioridad:          P1 | P2 | P3
Tipo:               Funcional | Seguridad | UX | A11y | Rendimiento | Compatibilidad
Entorno:            local | staging | prod · Front <commit/versión> · Navegador/dispositivo + resolución · Rol/cuenta (@test.local)
Precondiciones:     <datos/estado>
Pasos:              1. ... 2. ... 3. ...
Esperado:           ...
Actual:             ...
Frecuencia:         siempre | intermitente (n/N)
Evidencia:          captura/GIF/HAR/log de consola/request-response (sin secretos)
Heurística/WCAG:    Nielsen Hx · WCAG 2.2 criterio x.y.z (nivel)
Impacto negocio:    <a quién afecta y cómo>
Sugerencia:         <cambio concreto; archivo/línea si se conoce>
Estado / Asignado:  Nuevo | Triaje | En curso | Verificado | Cerrado · <responsable> · Tablero (Monday)
```

## 9. Hallazgos de esta iteración (por lectura de código/SQL, **no reproducidos en navegador**)

| ID | Título | Sev/Prio | Detalle y sugerencia |
|---|---|---|---|
| BUG-01 | Zoom deshabilitado en `index.html` | S3 / P2 | `maximum-scale=1.0, user-scalable=no` incumple WCAG 1.4.4. Quitarlos; en APK el WebView ya controla el escalado. |
| BUG-02 | Texto muy pequeño (10 px y 0.65-0.78 rem) en Dashboard, Bookings y PasswordRules | S3 / P3 | Mínimo 12 px (0.75 rem) y usar unidades relativas; revisar contraste en esos textos. |
| BUG-03 | Campos de texto libre sin límite: notas de solicitud, `bio`, nombre; sin CHECK en `bookings.notes` ni `professional_profiles.bio` | S2 / P2 | Añadir `maxlength` + CHECK (p. ej. 1000/2000) y contador; evita abuso de almacenamiento y notificaciones enormes. |
| BUG-04 | `services.price_unit` es `text` libre sin CHECK | S3 / P3 | CHECK con los 4 valores de `PRICE_UNITS`; el front ya los centraliza. |
| BUG-05 | `IonTextarea` de notas y `IonSearchbar` sin etiqueta accesible; errores de campo sin `aria-invalid`/`aria-describedby` | S3 / P2 | Añadir `aria-label`/`label` y vincular `field-error` (WCAG 3.3.2, 4.1.2). |
| BUG-06 | Feed promete "cerca de ti" pero no usa ubicación; `nearby_professionals` sin consumidor | S3 / P2 | Decisión de producto: conectar la RPC (con manejo de 429 y tope de 50) o renombrar el título. |
| BUG-07 | Regla de inactividad: código 30 min vs 45 min indicado | S3 / P2 | Confirmar y alinear código, tests Cypress y documentación. |
| SEC-01 | `validate_booking_update` es `SECURITY DEFINER` sin `set search_path` | S2 / P2 | A confirmar en la BD aplicada; añadir `set search_path = public` (y revisar los demás SECURITY DEFINER). |
| UX-01 | Toggle de contraseña reemplaza el input durante la animación | S3 / P3 | Mantener el input real y animar con CSS, o no ocultar a lectores de pantalla ni perder el foco. |
| UX-02 | `price_unit` mostrado crudo ("m2", "dia") | S4 / P3 | Mapear con `PRICE_UNITS.label` en la tarjeta. |

## 10. Pendientes para la iteración 2
1. Levantar el front local (`npm run dev.e2e` en `127.0.0.1:5173`, con `.env` local, por el propio usuario) y ejecutar TC-001..TC-004, la evaluación en Chrome y los 5 breakpoints, e inyectar axe.
2. Ejecutar la sección 2 con la anon key local y el script del rate limit.
3. Crear las suites pgTAP y la configuración de cobertura; evaluar Playwright para flujos multi-usuario.
4. Ejecutar k6 solo contra un entorno local/staging aislado, nunca OCI en producción sin autorización de ventana.
5. Pasar la fase de humo a producción (read-only) tras el despliegue.

---

## 11. Resultados de la iteración 1b: Chrome + API + BD local (2026-11-05)

Entorno: front `http://localhost:8100` (Vite, rama `chore/pin-vite-8.3.4`, sin captcha), backend `http://localhost:8000`, Chrome en pestaña nueva, ventana 1920x911. Todo **[Chrome]** = ejecutado por mí en esta pasada; **[API]** = llamadas a `localhost:8000` con la anon key local; **[BD local]** = consulta de solo lectura al contenedor `supabase-db`. No se modificó código, SQL ni repo; los datos que se tocaron por API se restauraron (ver 11.6).

**Limitación de método:** `resize_window` cambia la ventana pero no el viewport que ve la página (siguió en 1920x911). Los breakpoints se probaron cargando la misma ruta en un `iframe` same-origin de 360, 390, 768, 1024 y 1440 px de ancho (las media queries y el layout responden al ancho del iframe; el scrollbar clásico resta ~4 px, por eso aparece vw=356, 386, etc.). Es una buena aproximación, no sustituye al dispositivo (Capacitor, teclado, safe-area).

### 11.1 Casos funcionales

| ID | Estado real | Evidencia |
|---|---|---|
| TC-001 | Pasó | Login demo -> `/tabs/home` |
| TC-002 | Pasó | Nombre "Maria" rechazado en paso 1; alta completa con `qa2@test.local` OK |
| TC-003 | Pasó | Duplicado rechazado con mensaje correcto, 0 filas nuevas |
| TC-004 | Pasó | UI corta a 500; API 501 -> 400 `reviews_comment_len` |
| TC-005 | Pasó | Gateway 401 sin apikey válida (primera pasada) |

Extra: E2E-03 (credencial mala por API) y registro de 3 pasos verificados; E2E-07 a E2E-09 y E2E-11/12 no ejecutados.

### 11.2 Evaluación heurística de Nielsen [Chrome]

| Pantalla | Heurística | Hallazgo concreto |
|---|---|---|
| Landing `/` | H8 Estética / H4 Consistencia | **A 360 px el texto del hero se corta por la derecha**: `h1` y párrafo llegan a x=344 px y la tarjeta `.landing-hero` (`overflow:hidden`) termina en x=325 (iframe de 356 px). Se ve "El profesional que" y "todo en un" recortados. No ocurre a 390, 768 ni 1024. |
| Landing | H6 | Nav superior (Cómo funciona, Profesionales, Preguntas, Android) con enlaces de texto de menos de 24 px de alto desde 768 px; en el footer a 360 px, 5 enlaces menores de 24 px |
| Login `/login` | H1 Visibilidad / H5 Prevención | Bien: etiqueta persistente, contraseña con ojo, errores en rojo y claros. Etiquetas `ion-label` a 12.5 px, gris rgb(146,153,159). A 1920 px la tarjeta ocupa ~380 px y deja gran parte de la pantalla vacía (cosmético). |
| Login | H4 / H6 | **A 360 px las pestañas "Iniciar sesión / Crear cuenta" se truncan ("INICIAR SESI...", "CREAR CUEN...")** |
| Registro paso 1 | H5 Prevención / H9 Errores | El error "Ingresá tu nombre y apellido..." aparece sin `role="alert"`, sin `aria-invalid` ni `aria-describedby` (confirmado en el DOM). Al aparecer el mensaje, el botón Continuar se desplaza ~10 px hacia abajo (salto de layout). |
| Registro pasos 2 y 3 | H1 Visibilidad | Bien: barra "Paso n de 3" con `role=progressbar`, "Atrás" conserva datos, lista de requisitos de contraseña en vivo. Mejora: requisitos a ~12 px y sin región `aria-live`. |
| Registro | H3 Control | El rol (Cliente/Profesional) se elige en el paso 1; la UI no permite cambiarlo después, pero **sí se puede por API** (SEC-02). |
| Home `/tabs/home` | H2 Correspondencia con el mundo | Título "Servicios **cerca de ti**" pero el feed no usa ubicación ni ordena por cercanía. Unidad de precio cruda ("servicio", "dia", "hora") a 10.88 px; datos de prueba repetidos (5 tarjetas "Pedro Plomero Prueba", "QA Prof A"). En 1920 px las tarjetas se estiran a todo el ancho (sin `max-width`). |
| Home a 360 px | H8 | Títulos de servicio truncados con elipsis ("Reparación de tube..."), sin tooltip ni salto de línea |
| Perfil profesional | H1 / H5 | "Solicitar servicio" sigue habilitado aunque el cliente ya tiene una solicitud activa (se descubre solo al fallar). Error de duplicado a 12.8 px. "Todavía no tiene reseñas..." bien redactado. |
| Bookings `/tabs/bookings` | H7 Flexibilidad / H8 | **A 360 y 390 px los filtros (Todas/Pendientes/Aceptadas/Canceladas/Completadas) desbordan y obligan a scroll horizontal con barra nativa visible**; "Canceladas" y "Completadas" quedan ocultas sin indicio. La campana flotante (FAB de notificaciones) se superpone al borde de las tarjetas. Títulos truncados ("Instalación y reparación eléctric..."). "Seleccionar para eliminar" y chips de estado a 11.5 px. |
| Bookings | H1 | Bien: chip de estado, "Precio acordado" visible, "Calificar profesional" aparece en completadas |
| Bookings (navegación) | H1 | Una vez, al ir de Home a Solicitudes con la pestaña, el spinner quedó más de 8 s sin contenido (no se reprodujo tras recargar; posible compilación fría de Vite dev). Pendiente reproducir en build de producción. |
| Perfil `/tabs/profile` | H2 / H5 | "Cerrar sesión" cierra al instante, sin confirmación (aceptable). El interruptor "Modo noche" no tiene nombre accesible (axe `aria-toggle-field-name`). |
| Reseña | H5 | Bien: contador "n / 500", aviso de que la reseña es pública, "Publicar reseña" deshabilitado hasta elegir estrellas. |

### 11.3 Breakpoints [Chrome, vía iframe]

| Pantalla | 360x740 | 390x844 | 768x1024 | 1024x768 | 1440x900 |
|---|---|---|---|---|---|
| Landing | Texto del hero recortado (~19 px); 5 targets <24 px | OK; 5 targets <24 px | OK; 9 targets <24 px (nav) | OK | OK |
| Login / Registro | Pestañas truncadas; botón Continuar 36 px de alto (<44) | Igual | OK | OK | n/m |
| Home | Sin desborde horizontal; 0 targets <24; títulos truncados | OK | OK | OK | OK |
| Bookings | Filtros desbordan (4 elementos fuera del viewport) | Igual | OK | OK | OK |
| Perfil / Detalle | OK | n/m | OK | n/m | OK |

Texto menor de 12 px: Home 23 nodos (unidad de precio 10.88 px), Bookings 13 (chips 11.52 px), Perfil 4 (11.52 px), mockup de la landing 9.92 px (decorativo). Ninguna pantalla tiene scroll horizontal del documento (scrollWidth = ancho de viewport).

### 11.4 axe-core 4.10.2 [Chrome]

Se inyectó desde `cdn.jsdelivr.net` con `fetch` + `eval` en la página local: **funcionó** (sin bloqueo de CSP). Etiquetas: wcag2a/2aa, 21a/21aa, 22aa, best-practice.

| Pantalla | Violaciones (impacto, nodos) |
|---|---|
| Landing | `meta-viewport` critical (1); `role-img-alt` serious (1); `landmark-banner-is-top-level` y `landmark-contentinfo-is-top-level` moderate |
| Login / Registro | `meta-viewport` critical; `role-img-alt` serious (4) |
| Home | `meta-viewport` critical; `role-img-alt` serious (**42**); `region` moderate (ion-tab-bar) |
| Perfil profesional | `meta-viewport`; `role-img-alt` (10); `region` |
| Bookings | `meta-viewport`; `role-img-alt` (**57**); `region` |
| Perfil | `meta-viewport`; `role-img-alt` (6); **`aria-toggle-field-name` serious (1, "Modo noche")**; `region` |

`avoid-inline-spacing` aparece en todas pero lo causa una extensión del navegador (`deepl-input-controller`), no la app. `color-contrast` salió como "incompleto" (3 a 4 nodos por pantalla): sin fallos confirmados automáticamente; requiere revisión manual (texto sobre degradados del hero, chips y `ion-color-medium`).

### 11.5 Consola y red [Chrome]

- Consola: 0 errores en landing, login, registro, home, detalle, bookings y perfil. Solo 2 warnings de React Router v6 (`v7_startTransition`, `v7_relativeSplatPath`) y logs de Vite.
- Red: todas las llamadas a `localhost:8000` respondieron 200 (`profiles`, `notifications`, `rpc/feed_services`, `rpc/my_bookings`, `reviews`, `client_ratings`), salvo los rechazos esperados de las pruebas. Sin 4xx/5xx inesperados en la UI.
- **Terceros (privacidad)**: la app llama a `fonts.googleapis.com` / `fonts.gstatic.com` y a **`api.dicebear.com/7.x/initials/svg?seed=<nombre completo>`**: el nombre y apellido del usuario viajan en la URL a un servicio externo (observado con el nombre de la cuenta demo). Ver SEC-03.

### 11.6 Hallazgos "por código" confirmados o refutados, y nuevos

| ID | Resultado | Cómo se verificó |
|---|---|---|
| BUG-01 `user-scalable=no` / `maximum-scale=1` | **CONFIRMADO [Chrome]** | `meta` en el DOM vivo y axe `meta-viewport` critical en las 6 pantallas |
| BUG-02 textos pequeños | **CONFIRMADO [Chrome]** | 10.88 px (unidad de precio), 11.52 px (chips, "Cliente", "Mi reputación"), 9.92 px (landing); ~12.1 a 12.5 px en etiquetas y errores. Matiz: el 10 px de `ProfessionalDashboard.css` no se vio (no se probó el rol profesional en la UI) |
| BUG-03 notas/bio/nombre sin límite | **CONFIRMADO [API]** | `PATCH` con 100 000 caracteres a `bookings.notes` -> 200; 100 000 a `professional_profiles.bio` -> 200; 5 000 a `profiles.full_name` -> 200. En la UI el `ion-textarea` de notas tiene `maxLength = -1`. |
| BUG-04 `price_unit` libre | **CONFIRMADO [API]** | `PATCH services.price_unit = "xyz"` -> 200 |
| BUG-05 IonTextarea / IonSearchbar sin etiqueta | **REFUTADO PARCIALMENTE [Chrome]** | axe no marca ningún campo de texto: el `textarea` tiene 1 `label` asociado y el `searchbar` expone `aria-label="search text"` (genérico y en inglés, no descriptivo). Lo que sí falla: `ion-toggle` "Modo noche" sin nombre, y `field-error` sin `aria-invalid`/`describedby`/`role` |
| BUG-06 feed "cerca de ti" sin ubicación | **CONFIRMADO [Chrome]** | Home sin geolocalización ni orden por distancia; `nearby_professionals` sin consumidor |
| BUG-07 inactividad 30 vs 45 min | Sin cambios (código y Cypress dicen 30) | No se esperó 29 min; pendiente alinear la regla |
| SEC-01 `search_path` | **CONFIRMADO [BD local, solo lectura]** | `pg_proc`: `validate_booking_update`, `validate_review_insert` y `protect_is_verified` son `SECURITY DEFINER` sin `search_path` configurado; el resto sí lo fija (`public, pg_catalog`) |
| **SEC-02 (nuevo, ALTA)** | **CONFIRMADO [API + BD local]** | Un cliente puede cambiar su propio rol: `PATCH /rest/v1/profiles?id=eq.<yo>` con `{"role":"profesional"}` -> 200 (política `profiles_update_own` sin restricción de columnas; `authenticated` tiene UPDATE sobre `role`). Se revirtió de inmediato a `cliente` y se verificó. Impacto acotado porque el rol ya es de libre elección al registrarse, pero rompe la separación cliente/profesional y cualquier política que dependa de `profiles.role`. Remediación: `REVOKE UPDATE (role) ON public.profiles FROM authenticated` o un trigger que impida cambiar `role`. |
| SEC-03 (nuevo) | **CONFIRMADO [Chrome]** | Nombre completo enviado a `api.dicebear.com` y fuentes desde Google. Remediación: generar iniciales localmente (CSS/SVG), servir la fuente local y actualizar el aviso de privacidad. |
| SEC-04 (nuevo, media) | **CONFIRMADO [API]** | Enumeración de usuarios: `POST /auth/v1/signup` con un correo existente -> 422 `user_already_exists`; el login con correo inexistente vs clave errónea responde igual (400 `invalid_credentials`). Con autoconfirm no hay respuesta neutra posible: exigir captcha (#5) y limitar por IP. |
| DATA-01 (nuevo) | **CONFIRMADO [BD local]** | 1 usuario en `auth.users` sin fila en `profiles` (`qa_userc@example.com`, 2026-09-13, anterior al trigger `handle_new_user`). Limpiar. |
| UX-05 / UX-06 / UX-07 | **CONFIRMADOS [Chrome]** | Errores de campo sin ARIA; "Solicitar" habilitado con solicitud activa; `ion-toggle` sin nombre |
| BUG-08 (nuevo) | **CONFIRMADO [Chrome, iframe 360]** | Hero de la landing recortado a 360 px (ver 11.2). Verificar en dispositivo real (el iframe tiene scrollbar de 4 px). |
| BUG-09 (nuevo) | **CONFIRMADO [Chrome, iframe 360]** | Pestañas del login truncadas y filtros de bookings que desbordan |
| BUG-10 (nuevo) | **CONFIRMADO [Chrome/axe]** | `role-img-alt` serious en 42 a 57 `ion-icon` por pantalla (iconos decorativos sin `aria-hidden="true"`); fix global con un wrapper o `aria-hidden` en cada `IonIcon` |

**Pruebas de API ejecutadas [API]** (resumen):
- Autenticación: credenciales demo OK; signup con contraseña `abc` -> 422 `weak_password` con la política de GoTrue; signup con `role:"admin"` -> 500 `Database error saving new user` (rollback sin usuario huérfano; mensaje genérico); signup `profesional` -> 200.
- Autorización: María solo ve sus 11 reservas (0 ajenas); PATCH a un servicio de Carlos como María -> 0 filas; cliente `solicitado -> completado` -> P0001 "Transición de estado no permitida para el cliente"; anon sobre `reviews`, `bookings`, `profiles` -> `[]`, sobre `messages`/`notifications` -> 401, sobre `nearby_professionals` y `register_device_token` -> 401, `rpc_rate_limit` -> 403.
- `nearby_professionals`: llamadas 1 a 30 -> 200, **31, 32 y 33 -> 429** (límite de 30/min verificado), radio 999 aceptado y acotado, lat 91 -> 400 "Coordenadas invalidas".
- Datos restaurados tras las pruebas: `profiles.role` y `full_name` de María, `bookings.notes`, `professional_profiles.bio` y `services.price_unit` de Carlos. Se crearon 2 cuentas desechables: `qa1@test.local` (profesional, por API) y `qa2@test.local` (cliente, por UI), pendientes de borrar por el dueño (la anon key no puede borrar usuarios).

### 11.7 Checklist WCAG 2.2 AA actualizado

| Criterio | Estado tras Chrome |
|---|---|
| 1.4.4 Redimensionar texto / meta-viewport | **FALLA** (confirmado) |
| 1.4.3 Contraste | Sin fallos automáticos; 3 a 4 nodos "incompletos" por pantalla: revisión manual pendiente |
| 1.4.10 Reflow a 320/360 px | **FALLA** en Landing (texto recortado), Login (pestañas truncadas) y Bookings (filtros con scroll horizontal) |
| 2.5.8 Tamaño de objetivo 24 px | Pasa en la app (0 elementos <24 px en Home/Bookings/Login/Perfil); falla en enlaces de texto de la nav y footer de la landing |
| Recomendación 44 px | 20 elementos <44 px en Bookings; botón mostrar contraseña 36x36; Continuar 36 px |
| 4.1.2 Nombre, rol, valor | **FALLA**: `ion-toggle` "Modo noche" sin nombre; `role-img-alt` (42 a 57 iconos) |
| 3.3.1 / 4.1.3 Errores y mensajes | **FALLA parcial**: errores de campo sin `role`, `aria-invalid`, `aria-describedby` |
| 1.3.1 Landmarks | `region` (ion-tab-bar fuera de landmark); landmarks de la landing no de nivel superior (moderate) |
| 2.4.7 Foco visible, TalkBack/NVDA, `prefers-reduced-motion` | No ejecutado (requiere teclado/lector); sigue como propuesta |

### 11.8 Bloqueado / pendiente

- Rol profesional en la UI (dashboard, aceptar/rechazar/completar), chat, Realtime, push y Storage: no ejecutados en Chrome (no se manipularon estados de reservas para no alterar los datos de demo).
- Cierre por inactividad (29/30 min): se prueba con reloj simulado en Cypress; no se esperó en vivo.
- Prueba en dispositivo real/APK, foco y teclado, lector de pantalla y contraste manual.
- Reproducir en `vite build` el spinner largo al entrar en Solicitudes.
- Borrado de `qa1@test.local`, `qa2@test.local` y del usuario huérfano `qa_userc@example.com`.
