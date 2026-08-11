# work-ouch! Training API

API REST de entrenamiento construida con Node.js 24, TypeScript, Express y
SQLite. Esta version incluye la infraestructura base, `GET /health`, el
catalogo global de ejercicios y la planificacion de rutinas versionadas.

## Requisitos

- Linux y Node.js 24 LTS (se incluye `.nvmrc`).
- npm 11, incluido con Node.js.
- [`just`](https://just.systems/) para ejecutar las recetas del proyecto.
- Docker con Compose, solo para el flujo en contenedores.

## Configuracion

Las variables soportadas se documentan en `.env.example`:

| Variable | Default local | Valores |
|---|---|---|
| `DATABASE_PATH` | `./data/training.db` | Ruta no vacia |
| `PORT` | `3000` | Entero entre 1 y 65535 |
| `NODE_ENV` | `development` | `development`, `test` o `production` |

`Justfile` carga un archivo `.env` si existe. Para empezar:

```sh
cp .env.example .env
just install
just dev
curl http://localhost:3000/health
```

Una configuracion invalida detiene el proceso antes de abrir SQLite o escuchar
en un puerto.

## Desarrollo, comprobaciones y build

```sh
just dev        # desarrollo con recarga
just lint       # Biome y typecheck estricto
just typecheck  # solo TypeScript
just test       # Vitest con SQLite temporal
just build      # compila en dist/
just start      # ejecuta node dist/server.js
```

Los tests nunca deben usar `./data/training.db`.

## API de ejercicios

El catalogo se expone bajo `/api/v1/exercises`:

| Metodo y ruta | Comportamiento |
|---|---|
| `POST /api/v1/exercises` | Crea un ejercicio; `slug` y `name` son obligatorios. |
| `GET /api/v1/exercises` | Lista ejercicios activos. |
| `GET /api/v1/exercises?includeInactive=true` | Incluye tambien los ejercicios inactivos. |
| `GET /api/v1/exercises/:id` | Obtiene un ejercicio, aunque este inactivo. |
| `PATCH /api/v1/exercises/:id` | Actualiza campos editoriales o `isActive`; no permite cambiar `slug`. |

El listado no tiene paginacion en esta version y mantiene el orden determinista
por nombre sin distinguir mayusculas, nombre exacto e identificador. Solo se
aceptan los valores literales `true` y `false` para `includeInactive`.

No existe borrado fisico. Un ejercicio se desactiva con
`PATCH { "isActive": false }` y puede reactivarse enviando `true`; su consulta
directa y sus referencias historicas se conservan.

## API de rutinas

Las rutinas se exponen bajo `/api/v1/routines`:

| Metodo y ruta | Comportamiento |
|---|---|
| `POST /api/v1/routines` | Crea una rutina y su version 1 completa. |
| `POST /api/v1/routines/:id/versions` | Crea la siguiente version completa y la convierte en actual. |
| `GET /api/v1/routines?userId=<id>` | Lista las rutinas del usuario con un resumen de su version actual. |
| `GET /api/v1/routines/:id?userId=<id>` | Devuelve la planificacion actual completa. |
| `GET /api/v1/routines/:id?userId=<id>&versionNumber=<n>` | Devuelve una version historica completa. |

La primera version se envia anidada en `version`; las siguientes se envian como
una definicion plana junto con `userId`. Cada definicion contiene al menos un
ejercicio y cada ejercicio al menos una serie. Por ejemplo:

```json
{
  "userId": 1,
  "name": "Fuerza A",
  "description": "Sesion principal",
  "version": {
    "name": "Inicial",
    "notes": null,
    "exercises": [
      {
        "exerciseId": 1,
        "position": 1,
        "restSeconds": 90,
        "targetRpe": 7,
        "notes": null,
        "sets": [
          {
            "setNumber": 1,
            "setType": "work",
            "targetWeightKg": 80,
            "targetRepsMin": 8,
            "targetRepsMax": 10,
            "targetSeconds": null,
            "targetRpe": null,
            "notes": null
          }
        ]
      }
    ]
  }
}
```

Las versiones son inmutables y se construyen, validan y sellan dentro de una
transaccion. Posiciones y numeros de serie deben ser positivos y unicos en su
ambito. Una serie requiere un rango completo de repeticiones, una duracion o
ambos. `effectiveTargetRpe` muestra el RPE de la serie o, si es nulo, el heredado
del ejercicio planificado.

SQLite mantiene durante la construccion un estado pendiente protegido por una
FK diferida. El commit solo puede completarse tras sellar y seleccionar la
version inicial o avanzar exactamente una unidad a la nueva version; tampoco se
pueden insertar versiones adelantadas. Al sellar se vuelve a verificar que los
ejercicios referenciados continuen activos.

Solo se pueden incorporar ejercicios activos a una version nueva. Las lecturas
actuales e historicas no los filtran si se desactivan despues y conservan el
orden por `position` y `setNumber`. El listado de rutinas no tiene paginacion y
se ordena por nombre sin distinguir mayusculas, nombre exacto e identificador.
No existen `PATCH`, `DELETE` ni endpoints directos para versiones, ejercicios
planificados o series.

### Usuarios provisionales y ownership

La tabla minima `users` existe solo como dependencia referencial. Esta API no
incluye endpoints, autenticacion, servicio ni seed de usuarios: deben
aprovisionarse explicitamente antes de crear rutinas. Por ahora `userId` es un
selector obligatorio que evita mezclar propietarios, pero no demuestra la
identidad del cliente.

Una instalacion limpia puede aprovisionar un usuario mediante la herramienta de
administracion de SQLite elegida por el operador, proporcionando `email`,
`display_name`, `created_at` y `updated_at`; los timestamps deben estar
normalizados a UTC. La futura spec de usuarios sera responsable de este ciclo
de vida.

## Base de datos

La aplicacion activa claves foraneas y WAL en cada conexion. Al arrancar aplica
una sola vez las migraciones pendientes de `database/migrations/`. El puntero
obligatorio de cada rutina solo puede referenciar una version propia sellada;
una guardia diferida y triggers de SQLite protegen completitud, avance unitario,
seleccion obligatoria e inmutabilidad incluso ante SQL directo. Las tablas de
rutinas son `STRICT` y rechazan bindings textuales en campos numericos. Las
columnas enteras expuestas por la API se limitan a `Number.MAX_SAFE_INTEGER`. Las
convenciones se detallan en
[`database/README.md`](database/README.md).

```sh
just db-migrate
just db-seed
just db-reset
```

`db-seed` es siempre explicito y no se ejecuta al arrancar. **`db-reset`
destruye la base y sus sidecars** y se rechaza con `NODE_ENV=production`.

## Docker

```sh
just docker-build
just docker-up
curl http://localhost:3000/health
just docker-logs
just docker-down
```

Compose ejecuta el JavaScript compilado como usuario no root. La base se guarda
en `/app/data/training.db` dentro del volumen nombrado `training_data`.
`just docker-down` conserva ese volumen; para eliminar tambien los datos debe
usarse de forma deliberada `docker compose down --volumes`.
