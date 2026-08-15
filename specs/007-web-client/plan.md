# Plan de implementacion propuesto

## Condicion previa

Este plan fue aprobado para implementacion el 2026-08-15. No incluye cambios de
backend, CORS, MCP ni despliegue de autenticacion externa.

## Arquitectura del frontend

### Ubicacion y toolchain

El cliente sera un proyecto aislado bajo `web/` con su propio `package.json` y
lockfile:

```text
web/
  index.html
  package.json
  vite.config.ts
  tsconfig*.json
  src/
    app/
    auth/
    api/
    features/
      exercises/
      routines/
      workouts/
      measurements/
    shared/
    styles/
  tests/
```

La estructura expresa responsabilidades, no obliga a crear carpetas o archivos
vacios. Se usaran:

- React y TypeScript estricto.
- Vite para desarrollo y build estatico.
- React Router en Data Mode con `createBrowserRouter`, layouts anidados,
  loaders/actions y error boundaries por area.
- `@supabase/supabase-js` solo para autenticacion y sesion externa, si se
  confirma Supabase en la revision.
- `fetch` envuelto por un cliente HTTP pequeno para la Training API.
- CSS propio con custom properties y modulos o estilos por feature. No se
  copiara Tailwind CDN, HTML ni JavaScript inline de Stitch.

No se propone una libreria global de server state inicialmente. Los loaders y
actions del router cubren carga, invalidacion y errores; el workout activo usa
estado local deliberado para su borrador transaccional. Una dependencia nueva
solo se anadira si una tarea demuestra una necesidad concreta.

### Separacion de responsabilidades

- `auth/` inicializa la sesion externa, procesa callback, bootstrap y logout.
- `api/` contiene el cliente bearer, tipos de contrato, parseo defensivo de
  errores y funciones por endpoint. No conoce componentes.
- `features/` contiene rutas, formularios y mapeos de cada capacidad.
- `app/` compone router, shell protegido, navegacion y boundaries.
- `shared/` contiene controles reutilizados y utilidades sin reglas de dominio.
- `styles/` materializa los tokens aprobados de `.stitch/DESIGN.md`.

Los tipos del cliente reflejaran el contrato JSON ejecutable actual. No se
importaran repositorios, esquemas Zod internos ni codigo de servidor desde
`src/`; la frontera HTTP debe seguir siendo explicita.

## Enrutamiento y shell

- Un layout publico contiene `/login` y `/auth/callback`.
- Un guard de sesion espera la inicializacion, asegura bootstrap y resuelve
  `/me` antes del layout protegido.
- El layout protegido usa navegacion inferior en movil y una adaptacion lateral
  o superior en pantallas amplias.
- `/workouts/:workoutId/active` usa un layout transaccional sin navegacion
  persistente que pueda provocar perdida accidental del borrador.
- Cada area tiene error boundary. Los 404 de ownership usan el mismo mensaje que
  un recurso inexistente.
- Los parametros de ruta se validan como enteros canonicos positivos antes de
  llamar a la API.

## Cliente HTTP

El cliente de Training API:

- Usa siempre rutas relativas bajo `/api/v1`.
- Obtiene el access token vigente desde la sesion, sin duplicarlo en otro
  almacenamiento de la aplicacion.
- Anade `Authorization: Bearer` y `Content-Type: application/json` cuando
  corresponde.
- Distingue respuestas sin cuerpo, JSON correcto, error estandar y respuesta
  inesperada.
- Modela `code`, `message` y `details` sin mostrar `message` remoto sin control.
- No envia `userId` en cuerpos o queries autenticados.
- Permite cancelacion con `AbortSignal`.
- No registra headers, tokens, cuerpos sensibles ni datos corporales completos.

Politica propuesta de error:

| Estado/codigo | Comportamiento del cliente |
|---|---|
| 400 `VALIDATION_ERROR` | Mapear `details.issues` a campos y resumen |
| 401 `AUTHENTICATION_REQUIRED` | Aplicar la politica de refresh aprobada; si falla, limpiar sesion y login |
| 404 de dominio | Boundary no encontrado sin revelar ownership |
| 409 de catalogo | Conservar borrador, explicar conflicto y recargar dependencia |
| 409 `WORKOUT_NOT_IN_PROGRESS` | Bloquear edicion y recargar detalle terminal |
| 5xx/red | Mantener borrador local y ofrecer reintento explicito |

## Autenticacion propuesta

La API actual es Resource Server y no implementa login. El navegador se integra
directamente con el Authorization Server. Si se confirma Supabase:

1. `createClient` recibe URL y publishable key publicas de Vite.
2. Login usa `signInWithOAuth` con Authorization Code y PKCE.
3. `redirectTo` apunta a `/auth/callback` y debe estar allowlisted.
4. El callback intercambia el `code` exactamente una vez segun la decision
   aprobada y rechaza destinos externos.
5. Con access token valido, se llama siempre al bootstrap idempotente al iniciar
   una identidad nueva/restaurada y despues a `/me`.
6. `onAuthStateChange` actualiza el estado de sesion; la suscripcion se limpia.
7. Logout llama a `signOut`, elimina solo estado efimero propio y redirige.

El backend actual fija el proveedor interno como `supabase`, verifica RS256,
issuer, audience y JWKS, y devuelve 401 para una identidad externa aun no
registrada. Por ello bootstrap debe ejecutarse antes del resto de rutas y no
puede depender del middleware de usuario interno.

## Desarrollo y produccion

### Desarrollo

Vite configurara `server.proxy` para conservar el prefijo:

```text
/api/v1/* -> http://localhost:3000/api/v1/*
```

El target sera configurable para desarrollo, con default documentado. No se
usara `rewrite`. El navegador solo ve el origen de Vite y no necesita CORS.
Las recetas `just` iniciaran backend y web de forma comprensible, sin esconder
procesos ni usar la base de tests como base de desarrollo.

### Produccion

`vite build` produce estaticos. Se recomienda servir SPA y API bajo el mismo
origen mediante un reverse proxy:

```text
https://work-ouch.example/           -> estaticos del SPA con fallback a index.html
https://work-ouch.example/api/v1/*   -> Training API
https://work-ouch.example/health     -> Training API si se expone operacionalmente
```

Vite no aporta proxy en el build de produccion. No se planifica una URL absoluta
alternativa ni un cambio CORS del backend en esta spec.

## Correspondencia entre pantallas, rutas y endpoints

### Identidad e inicio

| Ruta web | Lecturas/escrituras reales | Observaciones |
|---|---|---|
| `/login` | Authorization Server externo | No existe endpoint REST de login |
| `/auth/callback` | `POST /api/v1/auth/bootstrap`, `GET /api/v1/me` | Requiere decisiones OAuth pendientes |
| `/` | `GET /api/v1/workouts?status=in_progress`, opcionalmente listados existentes | No endpoint de dashboard; no agregados inventados |
| `/account` | `GET /api/v1/me`, logout externo | Solo lectura |

### Ejercicios

| Ruta web | Endpoint | Uso |
|---|---|---|
| `/exercises` | `GET /api/v1/exercises` | Lista activa |
| `/exercises/:exerciseId` | `GET /api/v1/exercises/:id` | Detalle, incluso historico inactivo |
| Selector de sustitucion | `GET /api/v1/exercises` | Solo activos |

`POST /api/v1/exercises` y `PATCH /api/v1/exercises/:id` no se exponen en UI por
ausencia de roles o politica administrativa, aunque existen tecnicamente.

### Rutinas

| Ruta web | Endpoint | Uso |
|---|---|---|
| `/routines` | `GET /api/v1/routines` | Listado propio |
| `/routines/new` | `GET /api/v1/exercises`, `POST /api/v1/routines` | Version 1 completa |
| `/routines/:routineId` | `GET /api/v1/routines/:id` | Version actual completa |
| `/routines/:routineId?versionNumber=n` | `GET /api/v1/routines/:id?versionNumber=n` | Lectura historica directa |
| `/routines/:routineId/versions/new` | `GET /api/v1/routines/:id`, `GET /api/v1/exercises`, `POST /api/v1/routines/:id/versions` | Copiar como borrador y enviar version completa |

El formulario nuevo de version puede precargar la version actual en memoria,
pero el POST envia el objeto `version` plano exigido por la API, no un patch.

### Workouts

| Ruta web | Endpoint | Uso |
|---|---|---|
| Accion iniciar en rutina | `POST /api/v1/workouts` | `routineVersionId` y `startedAt` con zona |
| `/workouts` | `GET /api/v1/workouts`, opcional `status` unico | Historico sin paginacion |
| `/workouts/:workoutId` | `GET /api/v1/workouts/:id` | Plan y resultados separados |
| `/workouts/:workoutId/active` | `GET /api/v1/workouts/:id` | Carga inicial y recarga |
| Guardar ejercicio | `PUT /api/v1/workouts/:id/exercises/:routineExerciseId` | Reemplazo completo de resultado y sets |
| Completar | `POST /api/v1/workouts/:id/complete` | `completedAt`, RPE y notas opcionales |
| Cancelar | `POST /api/v1/workouts/:id/cancel` | Cuerpo exacto `{}` |

La ruta activa corresponde a los tres screens visibles de Stitch. El modelo de
estado conserva una copia del resultado completo por ejercicio y serializa todos
sus sets en cada PUT. La confirmacion de una serie no llama a un endpoint por
serie inexistente.

### Mediciones

| Ruta web | Endpoint | Uso |
|---|---|---|
| `/measurements` | `GET /api/v1/me/measurements` | Historico propio |
| `/measurements/new` | `GET /api/v1/body-metric-types`, `POST /api/v1/me/measurements` | Agregado atomico |
| `/measurements/:measurementId` | `GET /api/v1/me/measurements/:id` | Detalle inmutable |

`POST /api/v1/body-metric-types` no se expone por la misma ausencia de politica
administrativa de los ejercicios globales.

## Modelo de formularios

- Fechas locales se convierten a ISO-8601 con offset antes de enviar; nunca se
  envia una fecha sin zona.
- Strings opcionales vacios se convierten deliberadamente a `null` cuando el
  contrato lo admite.
- Numericos se mantienen como texto durante edicion para representar vacio sin
  convertirlo accidentalmente a cero.
- IDs, posiciones, set numbers y duraciones se validan como enteros seguros.
- RPE respeta el rango 1-10 del contrato, aunque Stitch destaque 6-10.
- El constructor de rutina impide enviar un set sin reps completas ni duracion.
- El formulario de medicion usa los codes recibidos del catalogo; no codifica
  las nueve metricas seed en componentes.

## Workout activo

Se adopta Vertical como composicion canonica. Focus aporta el control numerico
grande para una serie y Tactico la vista compacta cuando haya anchura suficiente.
La implementacion no copiara tres arboles de componentes.

Estado minimo:

- Detalle remoto del workout.
- Ejercicio planificado seleccionado.
- Resultado editable completo del ejercicio, incluido ejercicio realizado.
- Sets editables identificados por `setNumber`.
- Estado de guardado y ultimo snapshot confirmado.
- Temporizador local de descanso.

Al cargar un ejercicio sin resultado, el borrador se deriva de la planificacion
sin afirmar que fue realizado. `completed` solo cambia por accion explicita. Al
guardar se envia la lista completa. Cambiar de ejercicio con borrador sucio pide
guardar o descartar.

No se calcula "tiempo restante", no se descarga fotografia por ejercicio y no
se consulta una "serie anterior" de otro workout. El progreso inicial se expresa
como indice actual/total hasta aprobar una formula porcentual.

## Sistema visual

`.stitch/DESIGN.md` es la fuente de tokens visuales propuesta. Los screens y sus
recursos se registran en `.stitch/screens.md`.

- Kinetic Dark es la base porque sus tokens aparecen en los tres HTML visibles.
- Electric/Volt Lime se reserva para accion primaria, foco y estado activo.
- Superficies oscuras por capas reemplazan sombras pesadas.
- Archivo Narrow se usa en titulares y datos grandes, Inter en cuerpo y
  JetBrains Mono en metadata.
- Todos los tokens se materializan como custom properties semanticas.
- Fotos de Stitch son composicion de referencia, no datos disponibles de la API.

## Pruebas

### Unitarias

- Parseo de IDs y fechas con zona.
- Mapeo de errores API.
- Serializacion de rutina, resultado completo y medicion.
- Reduccion del estado del workout sin omitir sets.
- Destinos OAuth internos seguros.

### Integracion de componentes y rutas

- Guard publico/protegido, bootstrap y `/me` simulados.
- Estados loading, empty, ready, 400, 401, 404, 409 y 5xx.
- Constructor completo de rutina y nueva version.
- Workout: editar, sustituir, guardar PUT completo, completar y cancelar.
- Medicion dinamica a partir de metric types.
- Teclado, foco, labels y anuncios.

### E2E

- Sesion restaurada -> bootstrap -> inicio.
- Crear rutina -> iniciar workout -> registrar resultado -> completar -> detalle.
- Crear medicion -> historico -> detalle.
- 401 fuerza la politica aprobada sin bucle.
- Layout a 320 px y escritorio sin contenido oculto.
- Auditoria automatizada de accesibilidad en rutas criticas, complementada por
  comprobacion manual de teclado, zoom y lector de pantalla.

Las pruebas no contactaran Supabase ni la base real. OAuth y API se simulan en
tests; un smoke opcional contra entornos reales requerira configuracion y tarea
separadas aprobadas.

## Documentacion y operacion

- Actualizar README y arquitectura solo durante implementacion aprobada.
- Anadir recetas `just` para install/dev/lint/typecheck/test/build web y una
  verificacion agregada del repositorio.
- Documentar variables publicas sin valores secretos.
- Documentar que los seeds siguen siendo explicitos y que un entorno sin
  ejercicios/metric types tendra estados vacios o operaciones bloqueadas.

## Riesgos y bloqueos

- El README esta desactualizado respecto a auth y ownership; el cliente se basa
  en codigo ejecutable y specs 006, no en sus ejemplos con `userId`.
- El backend no tiene CORS; mismo origen/proxy es requisito, no preferencia
  cosmetica.
- Bootstrap crea actualmente email sintetico y usa el claim email como display
  name; la cuenta debe evitar presentar datos enganosos.
- Los seeds no vinculan su usuario con una identidad externa y no se ejecutan al
  arrancar; los datos seed pueden no ser visibles al usuario autenticado.
- Una instalacion sin catalogos no puede crear rutinas ni mediciones.
- Cualquier usuario autenticado puede mutar catalogos globales por API. La UI no
  expondra esas acciones, pero esto no constituye autorizacion de seguridad.
- Listas sin paginacion pueden degradarse; la spec no inventa paginacion local
  como contrato de servidor.
- La API no garantiza una sola sesion `in_progress`; inicio debe representar
  cero, una o varias y nunca elegir silenciosamente una de ellas.
- La futura spec MCP actualmente ocupa conceptualmente el numero 007 en
  arquitectura.

## Fuentes tecnicas consultadas

- Vite documenta `server.proxy` como capacidad del servidor de desarrollo; el
  build produce estaticos y necesita infraestructura de produccion separada.
- React Router documenta `createBrowserRouter`, layouts anidados con `Outlet` y
  error boundaries por ruta.
- Supabase documenta `signInWithOAuth`, PKCE, `exchangeCodeForSession`, redirect
  allowlists, inicializacion de sesion, `onAuthStateChange` y `signOut`.
- Ninguna de estas fuentes sustituye las decisiones pendientes de proveedor,
  scopes, audience, redirects y ciclo de sesion de este proyecto.
