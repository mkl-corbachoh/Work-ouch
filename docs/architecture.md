# Arquitectura de work-ouch!

## Objetivo

API REST modular para gestionar un catalogo global de ejercicios, planificacion
versionada, entrenamientos realizados y evolucion corporal. Las prioridades son
claridad, integridad de datos, simplicidad, mantenibilidad y, por ultimo,

## Decisiones globales

- Backend monolitico con Node.js, TypeScript estricto, Express, SQLite,
  `better-sqlite3`, Zod y Vitest.
- SQL explicito, sin ORM. Las rutas HTTP no acceden directamente a SQLite.
- Modulos organizados por capacidad, sin imponer una cantidad fija de capas o
  archivos.
- API REST bajo `/api/v1`; `GET /health` queda fuera del prefijo versionado.
- JSON de entrada y salida en `camelCase`; tablas y columnas SQL en
  `snake_case`.
- Identificadores internos enteros. Fechas recibidas como ISO-8601 con zona
  horaria, normalizadas y devueltas en UTC.
- Errores JSON con una estructura comun formada por `code`, `message` y
  `details`.
- Toda entrada HTTP se valida con Zod antes de llegar a la logica de negocio.
- SQLite usa claves foraneas y WAL. No se exponen borrados fisicos de datos con
  valor historico.
- Las operaciones que escriben agregados completos se ejecutan en una
  transaccion.
- Las migraciones SQL son ordenadas, se registran en `schema_migrations` y son
  compartidas por desarrollo, tests y Docker.
- Los tests usan bases temporales o en memoria y nunca la base de desarrollo.
- La aplicacion funciona localmente sin Docker. Docker ejecuta JavaScript
  compilado y persiste `/app/data` mediante un volumen.
- El seed es explicito, seguro de repetir segun se concrete en el plan, y no se
  ejecuta automaticamente al arrancar la aplicacion.

## Limites del dominio

El modelo separa tres niveles:

1. `exercises`: identidad y documentacion del ejercicio.
2. `routines`, versiones, ejercicios y series: planificacion inmutable por
   version.
3. `workout_sessions`, ejercicios y series: ejecucion real.

`routine_sets` nunca almacena resultados y `workout_sets` nunca modifica la
planificacion. Una sustitucion conserva tanto el ejercicio planificado como el
realizado.

Las mediciones corporales usan un catalogo de tipos y valores asociados para
permitir nuevas metricas sin alterar el esquema.

## Estructura prevista

```text
database/
  migrations/
  seeds/
docs/
  architecture.md
  database.md
specs/
  001-project-foundation/
  002-exercise-catalog/
  003-routines/
  004-workouts/
  005-body-tracking/
src/
  app.ts
  server.ts
  config/
  db/
  modules/
    users/
    exercises/
    routines/
    workouts/
    measurements/
  shared/
tests/
```

Esta es una guia, no una obligacion de crear archivos vacios ni capas sin uso.

## Integridad transversal

- Los recursos propiedad de un usuario deben pertenecer al mismo usuario en
  toda operacion relacionada.
- Una referencia planificada incluida en un workout debe pertenecer a la
  version usada por ese workout.
- Las versiones de rutina no se editan: cualquier cambio de planificacion crea
  una version nueva.
- Los cambios editoriales del catalogo no deben cambiar la identidad semantica
  de un ejercicio. Una variante distinta se crea como otro ejercicio.
- Los recursos historicos siguen siendo consultables aunque una rutina o un
  ejercicio se desactive.

## Operacion

La interfaz de desarrollo se centralizara en `just`, incluyendo instalacion,
desarrollo, build, arranque, tests, lint, migraciones, reset, seed y operaciones
Docker. La configuracion inicial usa `DATABASE_PATH`, `PORT` y `NODE_ENV`, con
base local por defecto en `./data/training.db`.

El logging HTTP sera estructurado e incluira metodo, ruta, estado, duracion y
errores, sin registrar cuerpos completos por defecto.

## Decisiones pendientes de aprobacion

- Los endpoints de usuarios estan requeridos, pero ninguna de las cinco specs
  funcionales los incluye y `001-project-foundation` se limita expresamente a
  infraestructura. Debe decidirse si ampliar `001` o crear una spec de usuarios.
- Falta fijar version de Node.js, gestor de paquetes y herramienta de lint.
- Falta decidir si las listas iniciales necesitan paginacion desde la primera
  version o si se incorpora cuando exista volumen real.
- El esquema adjunto no expresa todas las restricciones compuestas ni las
  reglas entre propietarios. Se concretaran en los planes mediante constraints,
  indices y validaciones transaccionales.
