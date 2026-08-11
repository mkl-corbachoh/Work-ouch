# Tareas de implementacion: 004 - Entrenamientos realizados

Las tareas se ejecutan en orden y se marcan solo tras verificarlas. Los tests
usan SQLite temporal y nunca `./data/training.db`. Spec 006 no se modifica.

- [x] **1. Crear y verificar el esquema base de workouts**
  - Anadir `0004_create_workouts.sql` con claves compuestas de soporte y tablas
    STRICT de sesiones, ejercicios y sets.
  - Incluir FKs sin cascadas, uniques, indices y checks; version y planificado
    son obligatorios, sin workouts libres.
  - Anadir pruebas de migracion.
  - Verificacion: `just test tests/db/workouts-migration.test.ts` y typecheck.

- [x] **2. Proteger ownership, version exacta y estados por SQL**
  - Garantizar propietario, version sellada y planned de esa version mediante
    FKs compuestas.
  - Anadir timestamps canonicos, duracion generada y triggers de insercion,
    transicion terminal, irreversibilidad y bloqueo de hijos terminales.
  - Exigir ejercicio realizado activo sin impedir desactivacion historica.
  - Probar INSERT/UPDATE/DELETE/REPLACE directos.
  - Verificacion: `just test tests/db/workouts-migration.test.ts`.

- [x] **3. Completar checks numericos y markers**
  - Aplicar tipo, finitud, integralidad, MAX_SAFE y markers a todos los numericos.
  - Probar null, texto, fracciones, negativos, `NaN`, infinito e inseguros con
    PK/FK/markers validos.
  - Verificacion: `just test tests/db/workouts-migration.test.ts`.

- [x] **4. Definir y probar schemas Zod**
  - Crear schemas estrictos para start, PUT, complete, cancel, params y queries.
  - Normalizar timestamps UTC y validar IDs, duplicados, textos, nullabilidad,
    RPE, dolor, booleanos, `sets: []` y queries.
  - Verificacion: `just test tests/modules/workouts/workout.schemas.test.ts` y
    typecheck.

- [x] **5. Implementar y probar el repositorio SQL**
  - Crear el unico archivo SQL del modulo con lookups, IDs seguros, sesion,
    sincronizacion estable de sets, transiciones, lista y detalle ordenado.
  - Montar plan/ejecucion en lectura consistente sin usar RoutineService ni
    escribir planificacion.
  - Traducir solo el conflicto esperado de posicion.
  - Verificacion:
    `just test tests/modules/workouts/workout.repository.test.ts`.

- [x] **6. Implementar y probar el servicio transaccional**
  - Crear errores de dominio y transacciones IMMEDIATE para las cuatro
    escrituras.
  - Hacer PUT idempotente, preservar IDs, reemplazar sets, revalidar actividad y
    serializar frente a terminales.
  - Probar rollback, sustituciones, conflictos, estados/fechas y que `routine_*`
    no cambia.
  - Verificacion: `just test tests/modules/workouts/workout.service.test.ts`.

- [x] **7. Exponer la API de workouts**
  - Crear rutas sin SQL y montar start, PUT result, complete/cancel y list/detail.
  - Aplicar contratos/errores; no crear PATCH, DELETE, sets directos, free
    workouts, auth ni measurements.
  - Verificacion: `just test tests/api/workouts.test.ts` y regresion API/logging.

- [x] **8. Cubrir integridad e historico extremo a extremo**
  - Probar ownership, version exacta, sustitucion, sets, reintento/reemplazo,
    terminales, filtros y detalle separado.
  - Inyectar fallos y comprobar rollback y planificacion sin cambios.
  - Verificacion: tests API, modulo workouts y migracion workouts.

- [x] **9. Ejecutar regresion de aplicacion y migraciones**
  - Actualizar expectativas de cuatro migraciones y retirar solo el 404 obsoleto
    de workouts en tests de rutinas.
  - Aplicar 0001-0004 dos veces y ejecutar DB, modules, API, logging y server.
  - Verificacion: `just test tests/db`, `just test tests/modules`,
    `just test tests/api`, `just test tests/logging` y `just test tests/server`.

- [x] **10. Documentar y cerrar la spec**
  - Actualizar README, arquitectura, database README y, si es seguro, DrawDB.
  - Confirmar ausencia de cambios en 0001-0003, rutinas, dependencias, seeds,
    Docker, configuracion y spec 006.
  - Ejecutar `just lint`, `just test`, `just build` y revisar criterios.
  - Solo si todo pasa, marcar tareas, cambiar 004 a `completed` y actualizar
    `AGENTS.md`.

- [x] **11. Corregir findings de revision sobre OR REPLACE y DrawDB**
  - Abortar antes de la resolucion `UPDATE OR REPLACE` cuando una posicion real
    ya pertenece a otro resultado, conservando ambas filas ante SQL directo.
  - Revisar las demas claves UNIQUE actualizables de workouts y confirmar sus
    defensas equivalentes.
  - Restaurar la nulabilidad documental de `routine_exercises.rest_seconds` sin
    modificar 0003.
  - Ejecutar pruebas estrechas, regresiones, lint, typecheck, suite completa,
    build y diff check antes de restaurar `completed`.
