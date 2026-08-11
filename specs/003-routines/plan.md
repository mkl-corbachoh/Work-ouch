# Plan de implementacion: 003 - Rutinas versionadas

## Objetivo

Implementar rutinas propiedad de un usuario con versiones completas e
inmutables, creacion atomica, numeracion incremental y lectura actual o
historica. La API expone operaciones del agregado, nunca CRUD de tablas
internas.

## Dependencia de usuarios

003 introducira una tabla `users` referencial minima para poder aplicar una FK
real desde rutinas. No implementara endpoints, autenticacion, autorizacion,
servicio, seed ni ciclo de vida de usuarios.

Los tests insertaran fixtures directamente. En una instalacion limpia, un
usuario debera aprovisionarse explicitamente antes de crear rutinas. Una futura
spec sera propietaria del API y evolucion de usuarios; esta deuda quedara
documentada.

`userId` es por ahora un selector validado, no una identidad autenticada. Las
operaciones evitan mezclar propietarios, pero no evitan suplantacion.

## Migraciones

### `0002_create_users.sql`

Creara `users` con `id`, `email` unico, `display_name`, `created_at` y
`updated_at`, nulabilidad y checks minimos de texto no vacio. No fijara aun
normalizacion de email ni reglas de autenticacion.

### `0003_create_routines.sql`

Creara:

- `routine_protocol_states`: guardia interna con el unico estado comprometible
  `0`.
- `routines`: propietario, nombre, descripcion, actividad, timestamps y puntero
  obligatorio a la version actual, mas estado interno de version pendiente.
- `routine_versions`: numero unico por rutina, metadatos, timestamp y estado
  interno de sellado.
- `routine_exercises`: ejercicio de catalogo, posicion, descanso, RPE y notas.
- `routine_sets`: numero, tipo, peso, rango de reps, duracion, RPE y notas.

Constraints principales:

- FKs reales y sin cascadas destructivas.
- `UNIQUE(routine_id, version_number)`.
- `UNIQUE(routine_version_id, position)`.
- `UNIQUE(routine_exercise_id, set_number)`.
- Posiciones, versiones y sets positivos.
- Descanso, peso y duracion no negativos.
- RPE entre 1 y 10.
- Rango de reps completo, positivo y ordenado.
- Cada set tiene reps, duracion o ambos.
- `set_type` admite `warmup`, `work`, `backoff` o `NULL`.
- Indices para listado por usuario y lecturas ordenadas.

No se persistira un booleano `is_current`. `routines` tendra un puntero
obligatorio y diferido a `(routine_id, version_number, is_sealed)` de una
version propia sellada. Esto garantiza exactamente una version actual por
rutina comprometida, no solo como maximo una.

Todas las tablas nuevas seran `STRICT`. Los campos numericos usaran afinidad
`ANY` con checks de tipo y valor para evitar que SQLite convierta bindings de
texto antes de validarlos. Los enteros admitiran representacion numerica integral
y los reales integrales o fraccionarios finitos. Todo entero expuesto a
TypeScript/JSON quedara limitado a `Number.MAX_SAFE_INTEGER`. Los numericos
nullable tendran un marcador interno de presencia porque SQLite convierte
`NaN` a `NULL` antes de evaluar constraints. Como las PK `ANY` no son alias de
`rowid`, el repositorio asignara IDs explicitamente dentro de `BEGIN IMMEDIATE`
y rechazara el agotamiento antes de ejecutar `MAX(id) + 1`.

## Sellado e inmutabilidad

Una version se crea internamente sin sellar dentro de una transaccion, recibe
todos sus ejercicios y sets, se valida y se sella antes del commit. La API nunca
expone una version sin sellar.

La insercion de una version arma automaticamente un protocolo pendiente en la
rutina. Una FK diferida desde ese estado a `routine_protocol_states`, que solo
contiene `0`, hace imposible confirmar mientras quede construccion pendiente.
La finalizacion inicial o el avance unitario del puntero limpian ese estado solo
si la version correspondiente existe y esta sellada. Asi, SQL directo no puede
confirmar una version incompleta, adelantada, con gaps o sellada sin
seleccionarla como actual.

Triggers SQLite:

- Rechazan crear versiones ya selladas.
- Exigen al sellar al menos un ejercicio y al menos un set por ejercicio.
- Revalidan al sellar que todos los ejercicios siguen activos.
- Solo permiten la transicion `is_sealed: 0 -> 1` sin cambiar otros campos.
- Impiden updates/deletes de versiones selladas.
- Impiden inserts de ejercicios o sets en versiones selladas.
- Impiden updates/deletes de ejercicios y sets planificados.
- Rechazan incorporar ejercicios inactivos, pero permiten desactivarlos despues
  para conservar historicos.
- Exigen que el puntero actual avance exactamente una version.
- Solo permiten armar y finalizar las transiciones internas validas del
  protocolo pendiente.
- Protegen contra update o delete la fila singleton de estado comprometible.

Crear una version nueva no modifica ninguna fila de la version anterior. El
estado `isCurrent` de respuesta se deriva comparando su numero con el puntero.

## Validacion

Bodies, params y queries usan Zod estricto y las convenciones de 002.

- IDs: enteros positivos canonicos y seguros.
- Nombres: trim, 1-200; descripciones/notas: `null` o trim, 1-5000.
- Arrays de ejercicios y sets no vacios.
- Posiciones y numeros de set unicos en su ambito, no necesariamente
  consecutivos.
- Un ejercicio puede repetirse en posiciones distintas.
- `restSeconds`, `targetWeightKg` y `targetSeconds`: `null` o no negativos.
- RPE: `null` o numero finito entre 1 y 10.
- Reps min/max aparecen juntos, son positivos y min no supera max.
- Cada set define reps, duracion o ambos; el peso por si solo no basta.
- Opcionales omitidos se normalizan a `null`.
- Se rechazan campos administrados por servidor y queries desconocidas o
  repetidas.

## Contrato HTTP

### `POST /api/v1/routines`

Body: `userId`, nombre/descripcion de rutina y una definicion `version` completa
con ejercicios y sets.

- Comprueba usuario existente y ejercicios existentes/activos dentro de la
  transaccion.
- Crea rutina, version 1, contenido, sellado y puntero actual atomicamente.
- Devuelve 201 con el detalle anidado completo.

### `POST /api/v1/routines/:id/versions`

Body: `userId` y definicion completa de la nueva version.

- La rutina debe pertenecer al usuario.
- En `BEGIN IMMEDIATE`, calcula `MAX(version_number) + 1`, lo contrasta con el
  puntero y deja la constraint UNIQUE como defensa final.
- Construye y sella antes de mover el puntero y actualizar `updatedAt`.
- Devuelve 201 con la nueva version actual.

### `GET /api/v1/routines?userId=<id>`

- `userId` es obligatorio y es el unico query param.
- Usuario inexistente: 404 `USER_NOT_FOUND`.
- Devuelve array sin paginacion, solo del usuario, ordenado por
  `name COLLATE NOCASE`, nombre binario e id.
- Cada fila incluye resumen de la version actual, no todo el agregado.

### `GET /api/v1/routines/:id?userId=<id>`

- Sin `versionNumber`, devuelve la version actual completa.
- Con `versionNumber`, devuelve esa version historica.
- Rutina inexistente o ajena: 404 `ROUTINE_NOT_FOUND`.
- Version propia inexistente: 404 `ROUTINE_VERSION_NOT_FOUND`.
- Las lecturas historicas incluyen ejercicios hoy inactivos.

Errores de dominio adicionales:

- Usuario inexistente: 404 `USER_NOT_FOUND`.
- Ejercicio inexistente: 404 `EXERCISE_NOT_FOUND`.
- Ejercicio inactivo: 409 `EXERCISE_INACTIVE`.
- Entrada invalida: 400 `VALIDATION_ERROR`.

No se crean PATCH/DELETE, endpoints de usuarios, rutas directas a versiones,
ejercicios planificados o sets, ni workouts.

## Respuesta de detalle

La respuesta contiene rutina y `version`, con ejercicios ordenados por posicion
y sets por numero. Cada ejercicio planificado incluye el objeto completo actual
del catalogo.

Cada set conserva su `targetRpe` nullable y anade `effectiveTargetRpe`, calculado
como RPE del set, o RPE del ejercicio planificado, o `null`. Los metadatos del
catalogo no se duplican; una correccion editorial puede verse en historicos,
pero identidad y planificacion permanecen inmutables.

## Modulos

- `routine.schemas.ts`: contrato Zod completo.
- `routine.repository.ts`: todo el SQL y mapeo snake_case/camelCase.
- `routine.service.ts`: orquestacion, errores de dominio y transacciones
  inmediatas; no contiene SQL literal.
- `routine.routes.ts`: validacion y transporte; no ejecuta SQL.
- `src/app.ts`: monta `/api/v1/routines` sin alterar health o ejercicios.

La capa de servicio se justifica por las comprobaciones y escrituras de agregado
que deben compartir una transaccion.

## Pruebas

- Migraciones: tabla users, tablas `STRICT`, tipos numericos, FKs, checks,
  uniques, indices, protocolo pendiente, puntero, sellado e inmutabilidad
  mediante SQL directo, incluidos intentos de commit incompletos o no
  seleccionados.
- Schemas: defaults, limites, duplicados, reps, targets, RPE, enums y strictness.
- Repositorio/servicio: creacion atomica, versiones 1-3, ownership, ejercicios
  inactivos/ausentes, rollback y preservacion exacta del historico.
- API: contratos, orden, detalle actual/historico, todos los errores y ausencia
  de rutas fuera de alcance.
- Regresion completa de DB, ejercicios, API, logging y servidor.
- Final: `just lint`, `just test` y `just build`.

Todos los tests usan SQLite temporal y fixtures explicitos. No se anaden seeds,
dependencias ni cambios de Docker/Justfile.

## Documentacion y cierre

README y arquitectura documentaran el contrato, `userId`, aprovisionamiento de
usuarios, versionado, sellado, orden, historico y ausencia de paginacion.
`docs/models/training_database_drawdb.json` solo se actualizara si forma parte
del estado versionado y el cambio no pisa trabajo concurrente del usuario.

La spec se marca `completed` solo cuando todas las tareas y criterios pasen.
