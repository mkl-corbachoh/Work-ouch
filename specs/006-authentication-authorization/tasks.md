# Tareas de implementacion: 006 - Autenticacion y autorizacion

Esta spec no puede implementarse mientras `spec.md` permanezca en `draft`. Las
tareas se ejecutan en orden y solo se marcan despues de su verificacion.

- [ ] **1. Anadir la dependencia JOSE y validar la configuracion OAuth**
  - Instalar `jose` 6.x y actualizar el lockfile sin cambiar el sistema de
    modulos ni otras dependencias.
  - Incorporar las tres variables obligatorias y todas las reglas de URL del
    plan, sin defaults ni bypass.
  - Actualizar `.env.example` con valores descriptivos, nunca secretos.
  - Verificacion: `just install`, `just test tests/config` y `just typecheck`.

- [ ] **2. Implementar y probar el verificador JWT/JWKS**
  - Crear el contrato inyectable y la implementacion JOSE para `RS256`, issuer,
    audience, `typ`, `kid`, tiempos, `sub` y `scope`.
  - Configurar timeout, cache, cooldown y rotacion con fallo cerrado.
  - Cubrir tokens validos e invalidos, cache, rotacion, JWKS malformado y
    proveedor no disponible mediante claves y HTTP local de test.
  - Verificacion: `just test tests/auth/access-token.test.ts` y
    `just typecheck`.

- [ ] **3. Implementar autenticacion HTTP y errores OAuth**
  - Crear el middleware bearer, errores tipados y headers `WWW-Authenticate`.
  - Extender minimamente el manejo comun de errores para headers controlados.
  - Impedir filtrado de tokens, claims, contenido JWKS y errores JOSE en body o
    logs.
  - Verificacion: `just test tests/auth/middleware.test.ts tests/logging`.

- [ ] **4. Publicar Protected Resource Metadata**
  - Implementar el GET publico con resource, issuer, scopes y metodo bearer del
    contrato, sin SQLite ni datos derivados de la peticion.
  - Cubrir orden estable, content type, acceso anonimo y ausencia de otros
    metodos.
  - Verificacion: `just test tests/api/oauth-resource-metadata.test.ts`.

- [ ] **5. Proteger `/api/v1` y aplicar scopes al catalogo**
  - Inyectar el verificador obligatoriamente en `createApp` y produccion.
  - Autenticar antes de parsear body, resolver routers o ejecutar SQL.
  - Exigir lectura para GET y escritura para POST/PATCH, sin implicaciones entre
    scopes.
  - Actualizar los tests existentes para usar principales validos sin crear un
    bypass de entorno.
  - Verificacion: `just test tests/api tests/modules/exercises` debe cubrir 401,
    403, 404 autenticado, orden de middleware, no acceso SQL y regresion CRUD.

- [ ] **6. Completar arranque, Docker y migracion documental**
  - Construir el verificador real desde configuracion en `server.ts` y comprobar
    que una configuracion invalida falla antes de SQLite.
  - Pasar issuer, audience y JWKS mediante Compose sin secretos ni tokens.
  - Actualizar README con el cambio incompatible, obtencion externa de tokens,
    scopes, errores y ejemplos bearer.
  - Verificacion automatica: `just test tests/server` y `just build` ejecutando
    el JavaScript compilado.
  - Verificacion Docker: arrancar con configuracion OAuth explicita, comprobar
    `/health` 200 y `/api/v1/exercises` 401 sin token, y ejecutar
    `just docker-down`.

- [ ] **7. Ejecutar la regresion final y cerrar la spec**
  - Ejecutar `just lint`, `just test` y `just build`.
  - Confirmar que no se anadieron migraciones, tablas, sesiones, usuarios,
    emision de tokens, introspeccion, bypasses ni codigo MCP.
  - Revisar todos los criterios de aceptacion y la migracion de consumidores.
  - Solo si todo pasa, marcar las tareas, cambiar la spec a `completed` y
    actualizar arquitectura y `AGENTS.md` con el estado verificado.
