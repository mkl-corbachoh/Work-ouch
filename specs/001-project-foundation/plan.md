# Plan de implementacion: 001 - Base del proyecto

## Objetivo

Crear una base ejecutable y verificable para la API con Node.js, TypeScript,
Express, SQLite, migraciones, tests, logging, manejo comun de errores y Docker,
sin introducir modelos ni endpoints funcionales.

No existen bloqueos para implementar la spec una vez aprobada.

## Decisiones de bootstrap

- Soportar exclusivamente Node.js 24 LTS, indicado en `.nvmrc`,
  `package.json#engines` y la imagen Docker.
- Usar npm y versionar `package-lock.json`; `just install` ejecutara `npm ci`.
- Usar Biome para lint y formato, y `tsc --noEmit` para comprobacion estatica de
  tipos.
- Compilar TypeScript estricto a CommonJS compatible con Node 24, con objetivo
  ES2022.
- Dependencias de ejecucion: Express, `better-sqlite3`, Zod y Pino.
- Dependencias de desarrollo: TypeScript, `tsx`, Vitest, Supertest, Biome y los
  tipos necesarios.
- Fijar las versiones instaladas mediante `package-lock.json`; no anadir ORM,
  autenticacion ni servicios externos.

## Scripts y recetas

`package.json` expondra:

| Script | Comando |
|---|---|
| `dev` | `tsx watch src/server.ts` |
| `build` | `tsc -p tsconfig.build.json` |
| `start` | `node dist/server.js` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `biome check . && npm run typecheck` |
| `format` | `biome format --write .` |
| `db:migrate` | `tsx src/db/cli.ts migrate` |
| `db:reset` | `tsx src/db/cli.ts reset` |
| `db:seed` | `tsx src/db/cli.ts seed` |

El `Justfile` sera la interfaz publica de desarrollo:

| Receta | Ejecucion |
|---|---|
| `install` | `npm ci` |
| `dev` | `npm run dev` |
| `build` | `npm run build` |
| `start` | `npm run start` |
| `test *args` | `npm run test -- {{args}}` |
| `lint` | `npm run lint` |
| `format` | `npm run format` |
| `db-migrate` | `npm run db:migrate` |
| `db-reset` | `npm run db:reset` |
| `db-seed` | `npm run db:seed` |
| `docker-build` | `docker compose build` |
| `docker-up` | `docker compose up -d --build` |
| `docker-down` | `docker compose down` |
| `docker-logs` | `docker compose logs -f api` |

El `Justfile` podra cargar `.env`; `.env.example` documentara las variables sin
contener secretos.

## Configuracion y arranque

`src/config/` validara con Zod:

- `DATABASE_PATH`: ruta no vacia; valor por defecto `./data/training.db`.
- `PORT`: entero decimal entre 1 y 65535; valor por defecto `3000`.
- `NODE_ENV`: `development`, `test` o `production`; valor por defecto
  `development`.

Los defaults solo se aplicaran cuando la variable no este definida; una cadena
vacia sera invalida. Los errores identificaran las variables invalidas sin
iniciar la base ni abrir un puerto.

`src/server.ts` realizara, en orden:

1. Validar la configuracion.
2. Crear el logger.
3. Abrir SQLite.
4. Ejecutar las migraciones pendientes.
5. Crear la aplicacion Express.
6. Escuchar en `0.0.0.0:<PORT>`.

Un fallo anterior al paso 6 se registrara y finalizara el proceso con codigo
distinto de cero. `SIGINT` y `SIGTERM` cerraran primero el servidor HTTP y
despues SQLite.

`src/app.ts` expondra una funcion que reciba sus dependencias y devuelva la
aplicacion Express sin llamar a `listen()`.

## SQLite, migraciones y seeds

La apertura centralizada de cada base:

- Creara el directorio padre cuando se use una ruta de archivo.
- Activara `PRAGMA foreign_keys = ON`.
- Activara `PRAGMA journal_mode = WAL`.
- Permitira cerrar explicitamente la conexion.

Los tests de base usaran archivos dentro de directorios temporales para poder
comprobar WAL y nunca abriran `./data/training.db`.

Las migraciones residiran en `database/migrations/` y usaran nombres
`NNNN_descripcion.sql`, con version numerica unica. El runner:

- Descubrira solo archivos que cumplan el patron y los ordenara por version.
- Rechazara nombres invalidos o versiones duplicadas.
- Creara `schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL
  UNIQUE, applied_at TEXT NOT NULL)`.
- Revalidara dentro de una transaccion `BEGIN IMMEDIATE` si cada version ya fue
  aplicada.
- Ejecutara el SQL y registrara version, nombre y fecha UTC en la misma
  transaccion.
- Omitira una migracion ya registrada con el mismo nombre.
- Fallara si una version registrada aparece con otro nombre.
- Impedira que un error SQL deje cambios parciales o un registro falso de exito.

Los archivos aplicados seran inmutables y no incluiran sus propios `BEGIN`,
`COMMIT` o `ROLLBACK`. El mismo runner sera usado por arranque, CLI y tests.

La spec 001 no anadira tablas funcionales ni migraciones SQL artificiales. El
runner se probara con migraciones creadas en directorios temporales.

`db-reset` sera rechazado en produccion, eliminara la base y sus archivos
`-wal`/`-shm`, creara una nueva y aplicara migraciones. Nunca se ejecutara al
arrancar.

`db-seed` aplicara primero las migraciones y ejecutara los `*.sql` de
`database/seeds/` en orden y dentro de una transaccion. Los seeds no se
registraran y deberan ser idempotentes. La ausencia de seeds sera exitosa y
explicita; el seed nunca sera automatico.

## API, errores y logging

`GET /health` permanecera fuera de `/api/v1` y ejecutara `SELECT 1`.

Respuesta disponible, estado 200:

```json
{"status":"ok"}
```

Respuesta con SQLite no disponible, estado 503:

```json
{"code":"DATABASE_UNAVAILABLE","message":"Database is unavailable","details":null}
```

Todas las respuestas de error tendran siempre `code`, `message` y `details`.

- Ruta inexistente: estado 404 y codigo `NOT_FOUND`.
- Error controlado: estado y codigo definidos por el error.
- Error inesperado: estado 500, codigo `INTERNAL_ERROR`, mensaje generico y
  `details: null`.
- Las respuestas no expondran stack traces, SQL, rutas internas ni mensajes
  originales de errores inesperados.

El logging utilizara Pino con salida JSON a stdout/stderr. Cada peticion
completada generara un registro con `method`, `path`, `status` y `durationMs`.
No se registraran bodies ni query strings por defecto. Los errores se
registraran internamente con stack y los datos minimos de la peticion.

## Docker

Se crearan `Dockerfile`, `.dockerignore` y `compose.yaml`.

- Build multi-stage basado en Node 24 y compatible con la compilacion nativa de
  `better-sqlite3`.
- La etapa final contendra solo dependencias de produccion, `dist/` y
  `database/`.
- La etapa final ejecutara `node dist/server.js`, no TypeScript ni `tsx`.
- La aplicacion se ejecutara como usuario no root con escritura en `/app/data`.
- Compose configurara `NODE_ENV=production`, `PORT=3000` y
  `DATABASE_PATH=/app/data/training.db`.
- El servicio `api` publicara el puerto 3000 y usara un volumen nombrado en
  `/app/data`.
- Las migraciones se aplicaran antes de comenzar a escuchar.
- `docker compose down` conservara el volumen.

## Estructura minima

- Configuracion y tooling en la raiz.
- `src/app.ts` y `src/server.ts`.
- `src/config/` para entorno.
- `src/db/` para conexion, migraciones, seeds y CLI.
- `src/shared/` para logger y errores HTTP.
- `database/README.md` para convenciones de migraciones y seeds.
- `tests/` con helpers de SQLite temporal y pruebas unitarias/API.

No se crearan modulos vacios para capacidades funcionales.

## Compatibilidad y seguridad operativa

- Es un bootstrap sin clientes ni datos previos; no requiere backfill.
- `schema_migrations` es el unico esquema persistente propio de esta spec.
- El arranque automatico solo aplica migraciones; nunca resetea ni ejecuta
  seeds.
- El lockfile y la misma major de Node se usaran en local y Docker.
- `AGENTS.md` y `docs/architecture.md` reflejaran Node 24, npm y Biome sin
  resolver usuarios o paginacion.

## Verificacion

La implementacion estara completa cuando:

- Instalacion, lint, tipos, tests y build terminen correctamente mediante
  `just`.
- `just dev` y `just start` sirvan un health check 200.
- Configuraciones invalidas impidan escuchar.
- Las pruebas demuestren migracion unica, rollback ante fallo y aislamiento de
  la base de desarrollo.
- Los errores y logs cumplan sus contratos.
- Docker ejecute JavaScript compilado y conserve `/app/data` al recrear el
  contenedor.
- README documente requisitos, entorno, flujo local, base de datos, tests y
  Docker.
- No exista esquema, endpoint ni logica funcional de dominio.
