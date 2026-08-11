# Tareas de implementacion: 002 - Catalogo de ejercicios

Las tareas se ejecutan en orden y se marcan solo tras su verificacion. Todos los
tests usan SQLite temporal, nunca `./data/training.db`.

- [x] **1. Crear y verificar el esquema persistente de ejercicios**
  - Anadir `database/migrations/0001_create_exercises.sql` con tabla,
    constraints, indices y trigger del plan, sin seeds ni datos de otros
    dominios.
  - Anadir pruebas con el runner real para aplicacion unica, columnas, checks,
    unique con inactivos, indices, slug inmutable y updates permitidos.
  - Verificacion: `just test tests/db/exercises-migration.test.ts`.

- [x] **2. Definir y probar la validacion del contrato**
  - Crear el adaptador Zod comun y los esquemas estrictos de create, patch, id y
    queries.
  - Cubrir trim, limites, URL HTTP/HTTPS, defaults, nullabilidad, booleanos sin
    coercion, patch no vacio y rechazo de slug/campos desconocidos.
  - Verificacion: `just test tests/modules/exercises/exercise.schemas.test.ts` y
    `just typecheck`.

- [x] **3. Implementar y probar el repositorio de ejercicios**
  - Crear el repositorio con SQL explicito para create, list, find y patch,
    `RETURNING`, mapeo completo y mapa fijo de campos actualizables.
  - Aplicar filtro activo, orden determinista, timestamps UTC y traduccion
    especifica del conflicto de slug.
  - Ampliar el helper de tests para aplicar migraciones reales y cubrir CRUD,
    conflicto, inactivos, orden, null, desactivacion/reactivacion y ausencia.
  - Verificacion:
    `just test tests/modules/exercises/exercise.repository.test.ts`.

- [x] **4. Exponer el catalogo y completar los errores HTTP**
  - Crear las rutas sin SQL, montar `express.json()` y el router en `src/app.ts`.
  - Implementar POST, listado, detalle y PATCH con contratos y errores del plan.
  - Traducir JSON malformado a `VALIDATION_ERROR` sin filtrar internals.
  - No crear DELETE, autenticacion, usuario, paginacion, busqueda ni una capa de
    servicio vacia.
  - Anadir pruebas API de operaciones, filtros, orden, inactivos, validaciones,
    conflicto, desactivacion/reactivacion, JSON malformado y DELETE ausente.
  - Verificacion: `just test tests/api/exercises.test.ts` y
    `just test tests/api tests/logging`.

- [x] **5. Ejecutar la regresion funcional y de persistencia**
  - Ejecutar las suites completas de DB, API, logging y servidor.
  - Aplicar dos veces las migraciones reales sobre una base temporal y comprobar
    que `0001_create_exercises.sql` solo se registra una vez.
  - Verificacion: `just test tests/db`, `just test tests/api`,
    `just test tests/logging` y `just test tests/server`.

- [x] **6. Documentar el contrato y cerrar la spec**
  - Actualizar README y arquitectura con endpoints, `includeInactive`, orden,
    desactivacion y ausencia de paginacion inicial.
  - Confirmar que no se modificaron dependencias, Justfile, Docker o seeds sin
    causa y que no se implementaron specs 003-005.
  - Ejecutar `just lint`, `just test` y `just build` y revisar todos los criterios
    de aceptacion.
  - Solo si todo pasa, marcar tareas, cambiar la spec a `completed` y actualizar
    `AGENTS.md` para reflejar que 002 esta completada.
