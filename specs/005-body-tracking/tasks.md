# Tareas de implementacion: 005 - Seguimiento corporal

Las tareas se marcan solo tras verificarlas. Todos los tests usan SQLite
temporal, nunca `./data/training.db`. Spec 006 no se modifica.

- [x] **1. Crear y verificar el esquema base**
  - Anadir `0005_create_body_tracking.sql` con tres tablas STRICT, IDs/FKs
    seguros, FKs NO ACTION, uniques, checks e indices.
  - Cubrir textos, code, timestamps UTC y value finito.
  - Verificacion: test de migracion body tracking y typecheck.

- [x] **2. Proteger atomicidad, inmutabilidad y SQL directo**
  - Implementar FK diferida y protocolo valores-primero.
  - Bloquear cabecera vacia, huerfanos al commit, valores posteriores,
    UPDATE/DELETE y OR REPLACE por claves.
  - Probar usuario inexistente, duplicados y conservacion de filas.
  - Verificacion: test de migracion body tracking.

- [x] **3. Completar checks numericos y limites**
  - Rechazar IDs invalidos/inseguros, value text/null/NaN/infinito.
  - Aceptar enteros, fracciones, cero y negativos.
  - Probar agotamiento de IDs.
  - Verificacion: test de migracion body tracking.

- [x] **4. Crear y verificar el seed inicial**
  - Anadir seed idempotente con nueve tipos exactos, sin usuarios, IDs fijos,
    replace/ignore ni controles transaccionales.
  - Probar repeticion, personalizados, preexistentes y rollback global.
  - Verificacion: tests de seed body types, seeds y CLI.

- [x] **5. Definir y probar schemas Zod**
  - Crear schemas de tipos, medicion, params y queries.
  - Validar code, UTC, source/notas, metrics no vacio, codes y finitud.
  - Rechazar unknowns, queries repetidas e IDs invalidos.
  - Verificacion: tests de schemas measurements y typecheck.

- [x] **6. Implementar y probar el repositorio SQL**
  - Crear unico archivo SQL con transacciones, lookup por lote, IDs, tipos,
    insercion valores-primero, historico y detalle owned.
  - Mapear metrics por code con value/unit sin IDs internos y orden estable.
  - Traducir solo conflicto esperado de code.
  - Verificacion: tests de repositorio measurements.

- [x] **7. Implementar y probar el servicio transaccional**
  - Crear errores de usuario/tipo/medicion/conflicto y transacciones IMMEDIATE.
  - Resolver todos los codes antes de escribir y recuperar agregado antes del
    commit.
  - Probar desconocidos, concurrencia, fechas repetidas, negativos, ownership y
    rollback intermedio.
  - Verificacion: tests de servicio measurements.

- [x] **8. Exponer API de tipos y mediciones**
  - Crear routers sin SQL y montar GET/POST tipos y POST/list/detail mediciones.
  - Aplicar contratos/errores; no crear usuarios, PATCH, DELETE, import, auth o
    analytics.
  - Verificacion: tests API body tracking y regresion API/logging.

- [x] **9. Cubrir contratos y atomicidad extremo a extremo**
  - Probar una/varias metricas, fallo intermedio sin parciales, code desconocido,
    tipo dinamico, usuario/ownership, unidades, UTC, orden y misma fecha.
  - Verificacion: migracion, modulo measurements y API body tracking.

- [x] **10. Ejecutar regresion de migraciones y aplicacion**
  - Actualizar expectativas a cinco migraciones sin modificar 0001-0004.
  - Aplicar 0001-0005 dos veces y ejecutar DB, modules, API, logging y server.
  - Confirmar contratos previos intactos.

- [x] **11. Documentar y cerrar la spec**
  - Actualizar README, arquitectura, database README y, si es seguro, DrawDB.
  - Documentar seed explicito, ownership provisional, atomicidad, negativos,
    orden y ausencia de paginacion.
  - Confirmar ausencia de usuario ficticio, dependencias, config/Docker, auth,
    import y cambios a 006.
  - Ejecutar lint, typecheck, suite completa y build; revisar criterios.
  - Solo si todo pasa, marcar tareas, cambiar 005 a `completed` y actualizar
    `AGENTS.md`.
