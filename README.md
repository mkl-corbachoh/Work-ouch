# work-ouch! Training API

API REST de entrenamiento construida con Node.js 24, TypeScript, Express y
SQLite. Esta version incluye la infraestructura base, `GET /health` y el
catalogo global de ejercicios.

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

## Base de datos

La aplicacion activa claves foraneas y WAL en cada conexion. Al arrancar aplica
una sola vez las migraciones pendientes de `database/migrations/`. Las
convenciones se detallan en [`database/README.md`](database/README.md).

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
