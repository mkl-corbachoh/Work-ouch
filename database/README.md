# Base de datos

## Migraciones

Las migraciones viven en `database/migrations/` y se nombran
`NNNN_descripcion.sql`, empezando por `0001`. La version debe ser unica y la
descripcion solo puede contener letras minusculas, numeros y guiones bajos.

Los archivos se aplican en orden y quedan registrados en `schema_migrations`.
Una migracion aplicada es inmutable. No debe incluir controles transaccionales
como `BEGIN`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT` o `RELEASE`, porque el
runner ejecuta y registra cada archivo en una unica transaccion y rechaza esos
controles antes de ejecutar el script.

Las migraciones `0002`, `0003` y `0004` incorporan la dependencia referencial
minima de usuarios, las rutinas versionadas y los workouts. No existe un seed de
usuarios: el operador
debe insertar cada usuario explicitamente antes de usar la API de rutinas. El
esquema ejecutable y sus triggers son la fuente de verdad para el puntero a la
version actual sellada y la inmutabilidad de la planificacion. El protocolo
pendiente usa una FK diferida para impedir que una version no finalizada llegue
al commit. Las tablas nuevas son `STRICT`; sus numericos se declaran `ANY` con
checks de tipo para rechazar texto sin depender de la afinidad de SQLite.
Los campos numericos nullable incluyen un marcador interno de presencia para
que un binding `NaN`, convertido por SQLite a `NULL`, no pueda confundirse con
un valor nulo intencional. Los enteros consumidos por TypeScript/JSON no pueden
superar `Number.MAX_SAFE_INTEGER`, incluido el calculo de nuevos IDs.

`0004_create_workouts.sql` no altera las tablas ni datos de planificacion; solo
anade indices UNIQUE de soporte sobre sus claves existentes y crea
`workout_sessions`, `workout_exercises` y `workout_sets`. Sus FKs compuestas
exigen mismo propietario, version sellada y ejercicio planificado de esa version.
Triggers impiden sesiones que no nazcan en curso, transiciones terminales
incompatibles, `REPLACE`/borrados destructivos y escrituras de hijos tras
completar o cancelar. La duracion se genera desde timestamps UTC canonicos y los
resultados solo se escriben cuando el ejercicio realizado esta activo.

## Seeds

Los seeds viven en `database/seeds/`, terminan en `.sql` y se ejecutan en orden
binario por nombre mediante `just db-seed`; se recomienda prefijarlos con
numeros de ancho fijo. Deben ser idempotentes y no contener controles
transaccionales. No se registran ni se ejecutan automaticamente durante el
arranque.
