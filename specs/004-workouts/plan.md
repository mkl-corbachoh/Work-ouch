# Plan de implementacion: 004 - Entrenamientos realizados

## Objetivo

Implementar sesiones basadas obligatoriamente en una version sellada de rutina,
con registro idempotente y atomico de resultados por ejercicio planificado,
sustituciones, finalizacion, cancelacion e historico por usuario.

La ejecucion se persiste solo en `workout_*`. Ninguna operacion de workouts
actualiza `routine_*` ni participa en el protocolo de versionado pendiente.

## Alcance y convenciones

- `routineVersionId` es obligatorio en API y SQLite; workouts libres quedan
  fuera de 004.
- `userId` selecciona y aisla propietario, pero no autentica al cliente.
- `startedAt` y `completedAt` requieren zona, se validan y normalizan a UTC
  canonico con milisegundos.
- La cancelacion no registra final, duracion, RPE global ni notas finales.
- Un resultado puede usar `sets: []`; omitir un planificado significa no
  registrarlo.
- Posiciones y numeros de serie son positivos y unicos, no necesariamente
  consecutivos.
- Solo el PUT de resultados es idempotente. Start, complete y cancel no lo son.
- Se puede iniciar una version historica sellada. El ejercicio realmente
  realizado debe estar activo en cada PUT.
- Listados sin paginacion en esta spec.
- No se implementan auth, measurements, free workouts ni cambios de rutina.

## Validacion

Schemas Zod estrictos siguiendo 002-003:

- IDs JSON/params: enteros positivos seguros; params decimales canonicos.
- `position` y `setNumber`: enteros positivos seguros.
- `reps` y duracion de set: `null` o enteros no negativos seguros.
- `weightKg`: `null` o numero finito no negativo.
- RPE: `null` o numero finito entre 1 y 10.
- `painLevel`: `null` o entero entre 0 y 10.
- `completed`: booleano real obligatorio.
- Notas: `null` o trim 1-5000; `painArea`: `null` o trim 1-200.
- Campos opcionales anulables omitidos se normalizan a `null`.
- Los resultados pueden tener todos sus valores numericos nulos.
- Queries repetidas/desconocidas y campos administrados se rechazan.

## Contrato HTTP

### `POST /api/v1/workouts`

Body: `userId`, `routineVersionId`, `startedAt`.

- Usuario existente y version sellada de una rutina propia.
- Version inexistente o ajena: 404 `ROUTINE_VERSION_NOT_FOUND`.
- Crea una sesion `in_progress` y devuelve 201 con plan completo y
  `results: []`.

### `PUT /api/v1/workouts/:id/exercises/:routineExerciseId`

Body: `userId`, `exerciseId` realizado, `position`, notas y lista completa de
sets reales.

Dentro de una transaccion `IMMEDIATE`:

1. Comprueba ownership y estado `in_progress`.
2. Comprueba que el planificado pertenece exactamente a la version de sesion.
3. Comprueba que el ejercicio realizado existe y esta activo.
4. Inserta o actualiza un unico resultado por planificado.
5. Sincroniza sets por `setNumber`: conserva IDs existentes, crea nuevos y
   elimina omitidos.
6. Revalida actividad y devuelve 200 con detalle actualizado.

Repetir el mismo PUT conserva resultado, IDs y lista, sin duplicados. La
posicion real es unica por sesion; conflicto: 409
`WORKOUT_POSITION_CONFLICT`.

### `POST /api/v1/workouts/:id/complete`

Body: `userId`, `completedAt`, `overallRpe`, `notes`.

- Solo sesion propia `in_progress`.
- Final no anterior al inicio.
- Cambia atomicamente a `completed`; SQLite deriva segundos enteros de duracion.
- Permite ejercicios omitidos, sets incompletos o resultados sin sets.
- Devuelve 200 con detalle terminal.

Fecha invalida respecto al inicio: 409 `WORKOUT_COMPLETION_TIME_INVALID`.
Sesion terminal: 409 `WORKOUT_NOT_IN_PROGRESS`.

### `POST /api/v1/workouts/:id/cancel`

Body estricto con `userId`. Cambia `in_progress` a `cancelled`, conserva campos
de finalizacion nulos y devuelve 200. No admite nuevas transiciones o resultados.

### `GET /api/v1/workouts`

Query obligatorio `userId`; `status` opcional entre `in_progress`, `completed`
y `cancelled`.

- Usuario inexistente: 404 `USER_NOT_FOUND`.
- Array sin envelope, solo del usuario, ordenado por `startedAt DESC, id DESC`.
- Cada fila incluye sesion y resumen de rutina/version, no plan completo.

### `GET /api/v1/workouts/:id?userId=<id>`

- Sesion inexistente o ajena: 404 `WORKOUT_NOT_FOUND`.
- Devuelve sesion, `planning` y `results` como ramas separadas.
- Plan usa la version exacta de inicio y se ordena por posicion/set planificado.
- Resultados se ordenan por posicion real/set real.
- Cada resultado conserva `routineExerciseId` planificado y `exerciseId`/
  `performedExercise` ejecutado.
- Los targets se leen de `routine_*`; los resultados solo de `workout_*`.

Errores adicionales:

| Condicion | Estado | Codigo |
|---|---:|---|
| Entrada invalida | 400 | `VALIDATION_ERROR` |
| Usuario inexistente | 404 | `USER_NOT_FOUND` |
| Workout inexistente/ajeno | 404 | `WORKOUT_NOT_FOUND` |
| Planificado ajeno a version | 404 | `ROUTINE_EXERCISE_NOT_FOUND` |
| Ejercicio realizado inexistente | 404 | `EXERCISE_NOT_FOUND` |
| Ejercicio realizado inactivo | 409 | `EXERCISE_INACTIVE` |

No se crean PATCH/DELETE, rutas directas de sets ni entrenamientos libres.

## Migracion `0004_create_workouts.sql`

La migracion no modifica 0001-0003 ni datos de planificacion. Crea tres tablas
`STRICT` con el patron `ANY` + `typeof` + markers de 003 para rechazar texto,
fracciones, valores no finitos, `NaN -> NULL` y enteros sobre
`Number.MAX_SAFE_INTEGER`.

Anade claves UNIQUE de soporte sobre rutinas/versiones/ejercicios planificados
para expresar FKs compuestas sin duplicar targets:

- rutina y propietario;
- version, rutina y estado sellado;
- ejercicio planificado y version.

### `workout_sessions`

- ID, `user_id`, guardia interna `routine_id`, `routine_version_id`, guardia de
  sellado, timestamps, estado, campos terminales y `created_at`.
- FKs garantizan usuario propietario, version de esa rutina y version sellada.
- `duration_seconds` generado desde timestamps canonicos.
- Checks por estado: inicio sin campos terminales; completed con final/duracion
  coherentes; cancelled con campos terminales nulos.
- Trigger exige insercion `in_progress`, impide replace/delete, hace inmutables
  identidad/inicio y solo permite una transicion terminal completa.
- Sesiones terminales no admiten updates.

### `workout_exercises`

- ID, sesion, guardia de version, `routine_exercise_id`, `exercise_id` realizado,
  posicion y notas.
- UNIQUE por `(session, planned)` y `(session, position)`.
- FKs compuestas garantizan que planned pertenece a la version de la sesion.
- Triggers permiten escritura solo en sesion `in_progress`, exigen ejercicio
  realizado activo, inmovilizan identidad/referencia y prohiben borrado.
- Desactivacion posterior no oculta historico.

### `workout_sets`

- ID, resultado, set number, peso, reps, duracion, RPE, completed, dolor y notas.
- UNIQUE por resultado/set number.
- Markers para cada numerico nullable y checks de tipo/rango/finitud.
- Triggers permiten insert/update/delete solo mientras la sesion esta en curso y
  el ejercicio realizado sigue activo; identidad y set number son inmutables.

Indices:

- historial por usuario/fecha;
- historial por usuario/estado/fecha;
- lookup por version;
- historico por planificado/version;
- uniques cubren orden de resultados/sets.

## Modulos y transacciones

- `workout.schemas.ts`: todos los contratos Zod y normalizacion UTC.
- `workout.repository.ts`: unico archivo del modulo con SQL, IDs seguros,
  sincronizacion de sets, transiciones, listado y detalle.
- `workout.service.ts`: ownership, estado, ejercicio/version, fechas, errores de
  dominio y transacciones `IMMEDIATE`.
- `workout.routes.ts`: validacion/transporte sin SQL.
- `src/app.ts`: monta `/api/v1/workouts` antes del 404.

Start, PUT, complete y cancel son transacciones inmediatas. El detalle se monta
en una transaccion de lectura con queries separadas para evitar productos
cartesianos. PUT frente a complete/cancel queda serializado: la segunda
operacion observa el nuevo estado.

## Pruebas

- Migracion: FKs/ownership/version exacta, estados, timestamps/duracion,
  irreversibilidad, active performed exercise, checks numericos, markers,
  indices y ausencia de cascadas.
- Schemas: IDs, UTC/offsets, strictness, defaults, arrays vacios, duplicados,
  limites y queries.
- Repositorio/servicio: start, version historica, sustituciones, PUT repetido,
  sincronizacion de sets, rollback, posiciones, complete/cancel, terminales,
  lista/detalle y planificacion byte por byte sin cambios.
- API: seis operaciones, ownership oculto, errores, JSON malformado, atomicidad
  y rutas fuera de alcance.
- Regresion de DB, modules, API, logging, server; final lint/test/build.

## Documentacion y cierre

README, arquitectura, database README y modelo versionado se actualizan sin
pisar trabajo concurrente. 004 no modifica spec 006, dependencias, seeds,
Docker, configuracion ni contratos de rutinas/ejercicios.

La spec se marca `completed` solo si todas las tareas y criterios pasan.
