# Arquitectura de work-ouch!

## Objetivo

API REST modular para gestionar un catalogo global de ejercicios, planificacion
versionada, entrenamientos realizados y evolucion corporal. Las prioridades son
claridad, integridad de datos, simplicidad, mantenibilidad y, por ultimo,
rendimiento.

## Decisiones globales

- Backend monolitico con Node.js, TypeScript estricto, Express, SQLite,
  `better-sqlite3`, Zod y Vitest.
- Node.js 24 LTS con npm y lockfile versionado. Biome se usa para lint y formato;
  TypeScript realiza el typecheck.
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

El catalogo inicial de ejercicios se lista sin paginacion y con orden estable
por nombre (`NOCASE`, luego binario) e identificador. Por defecto solo muestra
activos; `includeInactive=true` incorpora tambien los inactivos. La
desactivacion es reversible mediante actualizacion y no existe borrado fisico.
Esta decision no fija el contrato de paginacion de listas futuras.

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
  006-authentication-authorization/
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

## Dependencia provisional de usuarios

Las rutinas referencian una tabla `users` minima para garantizar propiedad con
una clave foranea real. Hasta que una spec de usuarios defina su ciclo de vida,
los usuarios se aprovisionan explicitamente fuera de esta API: no existen aun
endpoints, autenticacion, servicio ni seed de usuarios. Por tanto, `userId`
selecciona y aisla al propietario, pero no autentica la identidad del cliente.

## Rutinas versionadas

Cada rutina comprometida tiene un puntero obligatorio a una version propia
sellada. La version y todos sus ejercicios y series se construyen sin sellar en
una transaccion `IMMEDIATE`; se comprueba dentro de ella el propietario y que
los ejercicios existan y esten activos, se valida la completitud, se sella y
solo entonces se crea o avanza el puntero exactamente una unidad.

La insercion arma un estado pendiente interno. Una FK diferida apunta ese estado
a un catalogo que solo admite el valor finalizado, por lo que el commit falla si
una version queda incompleta, sin sellar, adelantada o sellada sin avanzar el
puntero. Triggers permiten limpiar el pendiente solo al finalizar la version 1 o
al avanzar exactamente a la siguiente version sellada. El sellado vuelve a
comprobar que todos los ejercicios sigan activos.

Constraints y triggers impiden mutar mediante SQL directo una version sellada o
su planificacion, insertar contenido adicional, saltar numeros actuales o sellar
contenido incompleto. Las versiones anteriores no se modifican. Las lecturas
actuales e historicas incluyen el objeto actual del catalogo sin filtrar
ejercicios desactivados posteriormente, y ordenan ejercicios por `position` y
series por `setNumber`.

La API expone creacion de rutina, creacion de version completa, listado por
`userId` y detalle actual o por `versionNumber`. No expone edicion, borrado ni
CRUD de las tablas internas. El listado carece de paginacion en esta version y
se ordena por nombre `NOCASE`, nombre binario e identificador.

Las tablas introducidas por rutinas son `STRICT`. Sus columnas numericas usan
`ANY` y checks explicitos de clase y valor para rechazar bindings textuales,
fracciones en campos enteros y reales no finitos sin impedir enteros validos en
campos reales. Los IDs se asignan explicitamente dentro de las transacciones
`IMMEDIATE`, ya que una PK `ANY` no es alias del `rowid` de SQLite. Los reales
nullable y los enteros nullable llevan un marcador interno de presencia para
distinguir un `NULL` intencional de un binding `NaN`, que SQLite normaliza a
`NULL` antes de ejecutar los checks. Todos los enteros que llegan a
TypeScript/JSON estan limitados a `Number.MAX_SAFE_INTEGER`; la asignacion de IDs
comprueba ese limite antes de calcular `MAX(id) + 1`.

## Operacion

La interfaz de desarrollo se centralizara en `just`, incluyendo instalacion,
desarrollo, build, arranque, tests, lint, migraciones, reset, seed y operaciones
Docker. La configuracion inicial usa `DATABASE_PATH`, `PORT` y `NODE_ENV`, con
base local por defecto en `./data/training.db`.

El logging HTTP sera estructurado e incluira metodo, ruta, estado, duracion y
errores, sin registrar cuerpos completos por defecto.

## Seguridad aprobada pendiente de implementacion

Se ha aprobado proteger todos los endpoints funcionales bajo `/api/v1` antes de
publicar un adaptador MCP remoto. La spec
`006-authentication-authorization` definira Training API como OAuth Resource
Server con un Authorization Server externo, access tokens JWT `RS256`, issuer,
audience, JWKS y scopes. `GET /health` permanecera publico.

Esta decision aun no describe el comportamiento ejecutable: la spec 006 sigue
en `draft` y la API actual no exige tokens. No se implementara autenticacion
hasta aprobar su spec, plan y tareas.

El acceso local y remoto mediante MCP se definira despues en una spec 007. El
adaptador delegara en la REST y no accedera directamente a SQLite. Su transporte
local sera stdio y el remoto usara Streamable HTTP protegido; los tokens de
audience MCP no se reenviaran a la REST. No debe crearse ni implementarse esa
spec antes de completar 006.

## Decisiones pendientes de aprobacion

- Los endpoints de usuarios estan requeridos, pero ninguna de las cinco specs
  funcionales los incluye y `001-project-foundation` se limita expresamente a
  infraestructura. Debe decidirse si ampliar `001` o crear una spec de usuarios.
- Falta decidir el contrato de paginacion para futuras listas; el catalogo
  inicial de ejercicios se mantiene expresamente sin paginacion.
- El esquema adjunto no expresa todas las restricciones compuestas ni las
  reglas entre propietarios. Se concretaran en los planes mediante constraints,
  indices y validaciones transaccionales.
- El futuro adaptador MCP debera concretar su URL publica, audience propia,
  topologia TLS/proxy, allowlists de Host y Origin, limites operativos y versiones
  MCP soportadas una vez completada la spec 006.
