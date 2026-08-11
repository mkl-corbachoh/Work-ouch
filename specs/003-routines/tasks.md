# Tareas de implementacion: 003 - Rutinas versionadas

Las tareas se ejecutan en orden y se marcan solo tras su verificacion. Todos los
tests usan SQLite temporal, nunca `./data/training.db`.

- [x] **1. Crear y verificar la tabla referencial de usuarios**
  - Anadir `0002_create_users.sql` con campos, unicidad y checks minimos.
  - Crear fixtures explicitos de test sin endpoints, modulo ni seed de usuarios.
  - Documentar la dependencia provisional y la spec de usuarios pendiente.
  - Verificacion: `just test tests/db/users-migration.test.ts` y
    `just typecheck`.

- [x] **2. Crear y verificar el esquema del agregado de rutinas**
  - Anadir `0003_create_routines.sql` con las cuatro tablas, FKs sin cascadas,
    checks, uniques, indices y puntero diferido a la version actual sellada.
  - Verificar aplicacion unica de 0001-0003 y todas las constraints.
  - Verificacion: `just test tests/db/routines-migration.test.ts`.

- [x] **3. Proteger sellado, completitud e inmutabilidad en SQLite**
  - Anadir triggers para construccion sin sellar, validacion de contenido,
    sellado unico, bloqueo de cambios posteriores, ejercicios activos y avance
    unitario del puntero.
  - Probar intentos directos de inserts, updates y deletes y ausencia de datos
    parciales.
  - Verificacion: `just test tests/db/routines-migration.test.ts`.

- [x] **4. Definir y probar los schemas Zod de rutinas**
  - Crear schemas estrictos para params, queries, rutina, version, ejercicios y
    sets.
  - Cubrir trim/defaults, limites, IDs, arrays, duplicados, rangos, objetivos,
    RPE, `setType`, campos administrados y queries repetidas/desconocidas.
  - Verificacion: `just test tests/modules/routines/routine.schemas.test.ts`,
    regresion de schemas de ejercicios y `just typecheck`.

- [x] **5. Implementar y probar el repositorio SQL de rutinas**
  - Concentrar todo el SQL y mapeo explicito en `routine.repository.ts`.
  - Implementar lookups, inserciones, sellado, puntero, numeracion, listado y
    detalle actual/historico con orden estable.
  - Incluir catalogo actual sin filtrar inactivos y calcular
    `effectiveTargetRpe`.
  - Verificacion:
    `just test tests/modules/routines/routine.repository.test.ts`.

- [x] **6. Implementar y probar el servicio transaccional**
  - Crear `routine.service.ts` con transacciones inmediatas, ownership,
    comprobacion de ejercicios, numeracion y errores de dominio.
  - Probar versiones 1-3, usuario/rutina/ejercicio ausentes, ejercicio inactivo,
    rutina ajena, historico intacto y rollback ante fallo intermedio.
  - Verificacion: `just test tests/modules/routines/routine.service.test.ts`.

- [x] **7. Exponer la API completa de rutinas**
  - Crear rutas y montar POST rutina, POST version, listado y detalle
    actual/historico bajo `/api/v1/routines`.
  - Validar todo antes del servicio y traducir errores de dominio.
  - No crear PATCH, DELETE, rutas internas, usuarios ni workouts.
  - Verificacion: `just test tests/api/routines.test.ts` y regresion API de
    ejercicios.

- [x] **8. Cubrir ownership, contratos y atomicidad en API**
  - Probar payloads anidados, orden, ownership, errores de dominio, validaciones,
    JSON malformado, rollback y ausencia de endpoints fuera de alcance.
  - Verificacion: `just test tests/api/routines.test.ts` y
    `just test tests/api tests/logging`.

- [x] **9. Ejecutar regresion de persistencia y aplicacion**
  - Aplicar dos veces 0001-0003 en base temporal.
  - Ejecutar suites de DB, modulos, API, logging y servidor y confirmar que
    ejercicios conserva contrato/esquema.
  - Verificacion: `just test tests/db`, `just test tests/modules`,
    `just test tests/api`, `just test tests/logging` y
    `just test tests/server`.

- [x] **10. Actualizar documentacion y cerrar la spec**
  - Actualizar README, arquitectura y, solo si es seguro, el modelo versionado.
  - Documentar usuarios provisionales, ownership sin auth, puntero/sellado,
    contratos, historico, orden y ausencia de paginacion.
  - Confirmar ausencia de seeds, nuevas dependencias, cambios Docker, workouts y
    cambios al esquema de ejercicios.
  - Ejecutar `just lint`, `just test` y `just build` y revisar criterios.
  - Solo si todo pasa, marcar tareas, cambiar la spec a `completed` y actualizar
    `AGENTS.md`.

- [x] **11. Corregir defectos de integridad detectados en revision**
  - Impedir al commit versiones pendientes, incompletas, adelantadas, con gaps o
    selladas sin seleccionarlas mediante avance unitario del puntero.
  - Rechazar bindings textuales, enteros fraccionarios y reales no finitos en
    campos numericos de 003.
  - Revalidar ejercicios activos al sellar y conservar su desactivacion
    historica posterior.
  - Cubrir bypasses con SQL directo y ejecutar regresiones DB, modulos, API,
    lint, typecheck, suite completa y build antes de restaurar `completed`.

- [x] **12. Corregir limites numericos y bypasses restantes de revision**
  - Limitar todos los enteros consumidos por TypeScript/JSON a
    `Number.MAX_SAFE_INTEGER`, incluida la asignacion de IDs.
  - Distinguir `NULL` intencional de `NaN` en enteros nullable.
  - Asegurar que los tests directos ejercitan cada constraint con PKs y markers
    validos, y proteger la fila singleton del protocolo.
  - Ejecutar pruebas estrechas, regresiones DB/modulos/API, lint, typecheck,
    suite completa, build y diff check antes de cerrar.
