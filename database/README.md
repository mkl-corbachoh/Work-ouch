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

## Seeds

Los seeds viven en `database/seeds/`, terminan en `.sql` y se ejecutan en orden
binario por nombre mediante `just db-seed`; se recomienda prefijarlos con
numeros de ancho fijo. Deben ser idempotentes y no contener controles
transaccionales. No se registran ni se ejecutan automaticamente durante el
arranque.
