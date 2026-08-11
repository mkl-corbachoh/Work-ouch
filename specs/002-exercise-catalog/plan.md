# Plan de implementacion: 002 - Catalogo de ejercicios

## Objetivo

Implementar el catalogo global mediante SQLite y endpoints de creacion,
listado, detalle y actualizacion parcial, sin mezclar planificacion, ejecucion,
propiedad por usuario ni paginacion.

## Contrato de datos

La respuesta completa contiene `id`, `slug`, `name`, `movementPattern`,
`equipment`, `description`, `techniqueNotes`, `safetyNotes`, `videoUrl`,
`isActive`, `createdAt` y `updatedAt`.

- `slug` y `name` son obligatorios y no anulables.
- Los metadatos editoriales son opcionales y se representan como string o
  `null`.
- En POST, un metadato omitido se guarda como `null`; `isActive` vale `true` por
  defecto.
- En PATCH, omitir conserva, `null` limpia un metadato y un body vacio se
  rechaza.
- `id`, `slug`, `createdAt` y `updatedAt` no son actualizables.
- La aplicacion genera timestamps UTC; crear usa el mismo valor para ambos y
  cada PATCH valido actualiza `updatedAt`.

Los esquemas Zod seran estrictos:

| Campo | Regla |
|---|---|
| `id` | Decimal canonico positivo, sin signo, decimales ni ceros iniciales |
| `slug` | Trim, 1-100, `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| `name` | Trim, 1-200 |
| `movementPattern`, `equipment` | `null` o texto trim, 1-100 |
| Notas y descripcion | `null` o texto trim, 1-5000 |
| `videoUrl` | `null` o URL HTTP/HTTPS, maximo 2048 |
| `isActive` | Booleano real, sin coercion |

Las cadenas vacias no sustituyen a `null`. Los campos desconocidos, incluido
cualquier dato de planificacion, se rechazan en lugar de ignorarse.

## Contrato HTTP

### `POST /api/v1/exercises`

- Crea un ejercicio y devuelve 201 con su representacion completa.
- Un slug ya usado, incluso por un inactivo, devuelve 409
  `EXERCISE_SLUG_CONFLICT`.

### `GET /api/v1/exercises`

- Devuelve un array sin envelope ni paginacion.
- Sin query o con `includeInactive=false`, devuelve solo activos.
- `includeInactive=true` devuelve activos e inactivos.
- Solo se aceptan exactamente los strings `true` y `false`; queries repetidos,
  desconocidos o coerciones se rechazan.
- El orden es `name COLLATE NOCASE ASC, name ASC, id ASC`.

### `GET /api/v1/exercises/:id`

- Devuelve 200 incluso si el ejercicio esta inactivo.
- Un id valido inexistente devuelve 404 `EXERCISE_NOT_FOUND`.

### `PATCH /api/v1/exercises/:id`

- Permite `name`, metadatos editoriales e `isActive`.
- Devuelve la representacion actualizada con 200.
- Permite desactivar y reactivar; no permite cambiar `slug`.
- No se crea DELETE; una peticion DELETE sigue el 404 comun y conserva datos.

Body, params y query se validan antes del repositorio. Los fallos devuelven 400
`VALIDATION_ERROR`, con `details.source` (`body`, `params` o `query`) e issues
reducidos a path y mensaje. JSON malformado usa el mismo contrato sin exponer el
body ni detalles internos.

## Persistencia

`database/migrations/0001_create_exercises.sql` creara `exercises` con:

- `id INTEGER PRIMARY KEY`;
- `slug TEXT NOT NULL COLLATE BINARY UNIQUE`;
- `name TEXT NOT NULL`;
- metadatos editoriales TEXT anulables;
- `is_active INTEGER NOT NULL DEFAULT 1`;
- timestamps TEXT no anulables;
- checks de trim, longitudes, formato de slug y booleano `0|1`;
- indice `(name COLLATE NOCASE, name, id)` para listado completo;
- indice `(is_active, name COLLATE NOCASE, name, id)` para listado activo;
- trigger `BEFORE UPDATE OF slug` que impide cambios de slug.

La validacion HTTP comprueba URLs; SQLite protege nulabilidad, trim y longitud.
No se anaden `user_id` ni columnas de peso, series, repeticiones, duracion,
descanso, RPE, posicion, rutina o workout. La migracion no incluye controles
transaccionales ni seeds.

## Modulos

- `src/shared/validation.ts`: adaptador pequeno de Zod a `HttpError`.
- `src/modules/exercises/exercise.schemas.ts`: create, patch, id, listado y query
  vacio, con tipos inferidos.
- `src/modules/exercises/exercise.repository.ts`: unico archivo del modulo con
  SQL; mapeo explicito snake_case/camelCase y `0|1`/boolean.
- `src/modules/exercises/exercise.routes.ts`: validacion, estados HTTP y mapeo de
  errores del repositorio; no ejecuta SQL.
- `src/app.ts`: instala `express.json()` y monta `/api/v1/exercises` antes de los
  handlers finales; `/health` permanece fuera de `/api/v1`.
- `src/shared/http-errors.ts`: traduce JSON malformado al error de validacion.

El repositorio usa SQL explicito, `INSERT/UPDATE ... RETURNING`, un mapa fijo de
campos PATCH y la constraint UNIQUE como autoridad final del slug. Solo la
violacion unique esperada se traduce a conflicto; otros errores SQLite siguen
como 500. No se crea una capa de servicio sin logica que justificar.

## Pruebas

- Migracion real: aplicacion unica, columnas, checks, indices, unique con
  inactivos y trigger de slug.
- Esquemas: defaults, trim, limites, URL, nullabilidad, strict bodies, patch
  vacio, slug en patch, ids y queries.
- Repositorio: mapeo, timestamps, conflicto, filtros, orden, patch, null,
  desactivacion/reactivacion y ausencia.
- API: contratos completos, validaciones, JSON malformado, detalle inactivo,
  DELETE ausente y no persistencia de campos rechazados.
- Regresion completa de DB, API, logging y servidor, seguida de lint, tests y
  build.

Todos los tests usan SQLite temporal y aplican migraciones reales cuando la
prueba depende del esquema. La migracion debe aplicarse dos veces para comprobar
que la segunda ejecucion se omite.

## Documentacion y alcance

README documentara endpoints, `includeInactive`, orden, desactivacion y ausencia
de paginacion. Arquitectura registrara que el catalogo inicial no pagina, sin
decidir aun el contrato de listas futuras.

No se modifican dependencias, Justfile, Docker ni seeds salvo incompatibilidad
demostrada. No se implementan usuarios, rutinas, workouts, autenticacion,

La spec se marca `completed` solo cuando todas las tareas y criterios pasen.
