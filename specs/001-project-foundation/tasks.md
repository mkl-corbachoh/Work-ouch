# Tareas de implementacion: 001 - Base del proyecto

Las tareas se marcaran solo despues de ejecutar su verificacion. Una vez creado
el `Justfile`, se usaran sus recetas para todas las comprobaciones.

- [x] **1. Crear el bootstrap reproducible de Node y TypeScript**
  - Anadir `.nvmrc`, manifests, lockfile y configuraciones de TypeScript, Biome
    y Vitest segun el plan.
  - Anadir scripts npm, recetas del `Justfile`, `.gitignore` y `.env.example`.
  - Actualizar `AGENTS.md` y `docs/architecture.md` con Node 24, npm y Biome.
  - Verificacion: ejecutar dos veces `just install`; ambas deben finalizar sin
    modificar `package-lock.json` en la segunda ejecucion.

- [x] **2. Implementar y probar la configuracion de entorno**
  - Crear validacion Zod separando lectura de `process.env` y parseo.
  - Cubrir defaults, valores explicitos, cadenas vacias, puertos invalidos y
    entornos desconocidos.
  - Verificacion: `just test tests/config`.

- [x] **3. Implementar SQLite y el runner transaccional de migraciones**
  - Centralizar apertura/cierre, directorio padre, foreign keys y WAL.
  - Implementar descubrimiento, validacion, orden, registro y transacciones del
    plan con directorio inyectable para tests.
  - Documentar convenciones en `database/README.md` y crear helpers de SQLite
    temporal que rechacen `./data/training.db`.
  - No anadir tablas funcionales ni una migracion vacia de produccion.
  - Verificacion: `just test tests/db` debe cubrir pragmas, orden, repeticion,
    nombres invalidos, versiones duplicadas, nombre modificado, rollback y
    aislamiento de la base de desarrollo.

- [x] **4. Implementar la CLI de migracion, reset y seed**
  - Crear subcomandos `migrate`, `reset` y `seed` reutilizando el runner.
  - Rechazar reset en produccion, eliminar sidecars y volver a migrar.
  - Ejecutar seeds ordenados e idempotentes en una transaccion; cero seeds debe
    ser exitoso.
  - Verificacion automatica: `just test tests/db/cli`.
  - Verificacion local, en orden: `just db-reset`, dos veces `just db-migrate` y
    dos veces `just db-seed`; todas deben finalizar con codigo cero.

- [x] **5. Implementar errores, logging y la aplicacion Express comprobable**
  - Crear errores controlados, middlewares de 404/error y logger Pino.
  - Crear `createApp` sin `listen()` e implementar `GET /health` con `SELECT 1`.
  - Mantener el contrato `code`, `message`, `details`, ocultar detalles internos
    y registrar los campos HTTP del plan sin bodies ni query strings.
  - No crear rutas funcionales ni modulos de dominio.
  - Verificacion: `just test tests/api` y `just test tests/logging`.

- [x] **6. Implementar el proceso de servidor y su ciclo de vida**
  - Respetar el orden de arranque del plan, escuchar en `0.0.0.0` y cerrar HTTP
    y SQLite ante `SIGINT`/`SIGTERM`.
  - Impedir la escucha ante configuracion, SQLite o migracion invalidas.
  - Verificacion automatica: `just test tests/server`.
  - Verificacion manual: comprobar `/health` con `just dev` y, tras `just build`,
    con `just start`; `PORT=0 just start` y `NODE_ENV=invalid just start` deben
    fallar sin abrir puerto.

- [x] **7. Anadir empaquetado y ejecucion Docker**
  - Crear `.dockerignore`, Dockerfile multi-stage Node 24 y `compose.yaml`.
  - Ejecutar JavaScript compilado como usuario no root con volumen escribible en
    `/app/data` y health check.
  - Verificacion: ejecutar `just docker-build` y `just docker-up`, comprobar
    `/health`, crear un marcador en `/app/data`, recrear el contenedor y
    comprobar que persiste; eliminarlo y ejecutar `just docker-down`.
  - Confirmar en imagen y logs que se ejecuta `dist/server.js`, no TypeScript.
  - Verificacion Docker completada por el usuario el 2026-08-11 tras habilitar
    el acceso de su usuario al daemon.

- [x] **8. Documentar y ejecutar la verificacion final de la spec**
  - Crear README con requisitos, entorno, flujos locales, base de datos, tests y
    Docker; advertir que reset destruye datos y seeds son explicitos.
  - Confirmar que no se anadieron modelos, tablas, endpoints ni modulos
    funcionales.
  - Ejecutar: `just install`, `just lint`, `just test`, `just build`,
    `just db-reset`, dos veces `just db-migrate`, dos veces `just db-seed`, health
    con `just dev`, health con `just start`, `docker compose up -d`, health y la
    prueba de persistencia de `/app/data`, y `just docker-down`.
  - Marcar esta tarea y cambiar la spec a `completed` solo si todos los comandos
    y criterios de aceptacion pasan.
  - Verificacion local automatizada completada el 2026-08-10 y verificacion
    Docker confirmada por el usuario el 2026-08-11.
