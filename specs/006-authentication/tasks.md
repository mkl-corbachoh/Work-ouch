# Tareas de implementacion: 006 - Autenticacion e identidad externa

- [x] **1. Crear el esquema de identidades externas**
  - Anadir `user_identities` con FK, unicidad provider/subject e indices.
  - Verificar migracion, cascada y preservacion de IDs historicos.
- [x] **2. Implementar configuracion y proveedor JWT**
  - Anadir configuracion por entorno y abstraccion `AuthProvider`.
  - Verificar RS256, JWKS, issuer, audience, expiracion y claims normalizados.
- [x] **3. Implementar middleware y usuario actual**
  - Proteger `/api/v1`, devolver errores genericos y resolver identidad interna.
  - Implementar bootstrap atomico/idempotente y `GET /me`.
- [x] **4. Migrar ownership de rutinas, workouts y mediciones**
  - Derivar propietarios desde `currentUser.id`, eliminar selectores confiados y
    ocultar recursos ajenos.
- [x] **5. Cubrir seguridad y regresion**
  - Probar autenticacion, bootstrap, concurrencia, aislamiento y datos historicos.
  - Ejecutar tests, typecheck, lint y build; marcar las tareas solo tras pasar.
