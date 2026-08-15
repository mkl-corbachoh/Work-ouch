---
status: draft
---

# 008 - Despliegue web y entorno de autenticación externa

## Objetivo

Definir el despliegue de producción de un único origen público que sirva el SPA
de `web/`, reenvíe la API existente y lo conecte de forma segura con Supabase
Auth. Esta spec convierte en trabajo operativo verificable los residuales
aprobados al cerrar la spec 007.

## Alcance

- Un reverse proxy/TLS terminator de producción y su configuración versionada,
  salvo valores específicos del operador.
- Hosting de `web/dist`, fallback de navegación SPA y forwarding transparente de
  `/api/v1` a la Training API.
- Exposición opcional de `GET /health` únicamente para operación.
- Dominio/origen público, TLS, inyección de configuración pública del build y
  configuración de Supabase Auth necesaria para ese origen.
- Compatibilidad efectiva entre los JWT emitidos por Supabase y
  `AUTH_ISSUER`, `AUTH_AUDIENCE` y `AUTH_JWKS_URL` del backend.
- Smoke tests desplegados de misma procedencia y de proveedor OAuth real, sin
  secretos en repositorio, logs o artefactos.
- Procedimiento de despliegue, comprobación operativa y rollback.

## Fuera de alcance

- CORS, cambios de contratos REST, comportamiento de dominio, migraciones o
  base de datos.
- UI de autenticación, nuevos proveedores, roles, permisos o MCP (reservado a
  la spec 009).
- Exponer secretos, service-role keys, tokens, credenciales OAuth o la base de
  datos.
- Cambiar las rutas del SPA, el protocolo OAuth/PKCE ya implementado, ni añadir
  una API absoluta configurable en el navegador.

## Arquitectura y límites de seguridad

La topología objetivo es:

```text
Internet -- HTTPS público --> reverse proxy
                              |-- /api/v1/* --> Training API privada
                              |-- /health    --> Training API (si se aprueba)
                              `-- resto      --> web/dist; rutas SPA -> index.html
```

- El navegador llama exclusivamente a rutas relativas `/api/v1`; SPA y API
  comparten esquema, host y puerto público. No se añade CORS.
- El proxy debe evaluar `/api/v1` (y `/health`, si se publica) antes del fallback
  SPA. Debe preservar método, path, query string, cuerpo y `Authorization` al
  upstream de API. No debe reenviar peticiones estáticas a la API.
- Solo el proxy escucha públicamente. La API, SQLite y los puertos internos no
  son accesibles desde Internet. La persistencia existente de SQLite en
  `/app/data` se conserva.
- TLS es obligatorio para el origen público. HTTP, si se mantiene, redirige a
  HTTPS sin servir contenido autenticado. La renovación del certificado debe ser
  automática o contar con una comprobación y procedimiento documentados.
- Los valores `VITE_*` se incorporan al bundle y son públicos por definición:
  solo se permiten URL de Supabase, publishable key y configuración de
  proveedores/scopes. `AUTH_*` es configuración solo del proceso API. Ningún
  secreto se escribe en archivos versionados, imágenes, salida CI ni logs.
- La API continúa verificando JWT RS256 mediante JWKS, issuer y audience. El
  proxy no valida, fabrica, transforma ni registra tokens.

## Reglas de enrutamiento y respuestas

| Solicitud pública | Comportamiento requerido |
|---|---|
| `GET`/`HEAD` de asset existente | Servir el asset de `web/dist`; no fallback. |
| `GET`/`HEAD` de una ruta SPA, incluido `/auth/callback` | Devolver `web/dist/index.html` para que React Router resuelva la ruta. |
| Cualquier método `/api/v1/*` | Reenviar sin reescritura a la API; conservar bearer y query. La respuesta y estado de API se propagan. |
| `/health` | Reenviar exactamente a `GET /health` solo si el operador decide exponerlo; de otro modo no se publica ni cae en el SPA. |
| Ruta/método no anterior | No debe recibir `index.html` como respuesta de API; devolver la respuesta del proxy configurada. |

La política concreta de cache para `index.html` y assets con hash debe quedar
documentada y probarse: una actualización no puede mantener indefinidamente un
HTML que referencia assets retirados.

## Configuración de autenticación y entorno

Antes de desplegar, el operador debe configurar en Supabase el **Site URL** igual
al origen HTTPS canónico y permitir exactamente los redirect URLs requeridos:
`https://<origen>/auth/callback` y los entornos de desarrollo/preview que se
aprueben. No se permiten comodines de producción salvo decisión explícita y
documentada.

Los proveedores OAuth habilitados y sus scopes deben coincidir con
`VITE_AUTH_PROVIDERS` y `VITE_AUTH_SCOPES_JSON`. El flujo desplegado debe emitir
access tokens cuyo algoritmo sea RS256 y cuyos issuer, audience y JWKS sean
exactamente los configurados en la API por `AUTH_ISSUER`, `AUTH_AUDIENCE` y
`AUTH_JWKS_URL`. La verificación debe probarse con un token real, no con claims
inventados ni con un token de ID.

La construcción de producción recibe valores públicos mediante el mecanismo de
CI/plataforma aprobado; un cambio de esos valores obliga a reconstruir el SPA.
Las variables server-only se inyectan únicamente en el runtime de la API y se
validan antes de aceptar tráfico.

## Despliegue, operación y rollback

1. Validar configuración y construir backend y SPA en CI sin secretos en salida.
2. Publicar la nueva versión de SPA, proxy y API de forma que rutas estáticas,
   fallback y upstream sean comprobables antes de dirigir tráfico al origen
   canónico.
3. Ejecutar checks HTTP y smoke autenticado reales; conservar únicamente
   resultados redactados.
4. Si falla una comprobación crítica, retirar el tráfico de la nueva versión y
   restaurar la imagen/configuración anterior conocida. No ejecutar `db-reset`,
   no borrar volúmenes ni modificar datos como rollback de este despliegue.

Los runbooks deben identificar versión desplegada, origen canónico, estado del
certificado, salud del upstream, resultado de smoke y responsable/fecha, sin
incluir secretos ni bearer tokens. Los logs del proxy y API no deben registrar
`Authorization`, URL de callback completa, `code`, access token ni refresh token.

## Criterios de aceptación

- Un navegador en el origen HTTPS canónico carga `/`, una ruta profunda y
  `/auth/callback` sin 404 del servidor, y assets existentes no reciben
  `index.html`.
- Una llamada autenticada a `/api/v1/me` llega a la API con path, query y bearer
  intactos; una respuesta 401/404/409 de API conserva su estado y cuerpo.
- Ninguna ruta de API recibe fallback SPA. `/health` se reenvía solo si fue
  aprobado y no exige bearer; la API no es pública directamente.
- TLS es válido para el origen canónico y HTTP no sirve contenido autenticado.
- El bundle solo contiene las cuatro categorías públicas documentadas; no
  contiene `AUTH_*` ni secretos. Cambiar configuración pública reconstruye el
  bundle.
- Supabase Site URL, redirect allowlist, proveedor(s), scopes y callback real
  permiten login OAuth/PKCE y retorno al mismo origen.
- El access token real aceptado por la API usa RS256 y satisface issuer, audience
  y JWKS configurados; uno con audience/issuer/algoritmo incompatibles es
  rechazado por la API.
- Un smoke real completo (login, callback, bootstrap/me y una ruta SPA) pasa en
  el origen desplegado y no revela datos sensibles en su evidencia.
- Existe procedimiento probado de rollback que recupera la versión anterior sin
  pérdida o migración de datos.

## Decisiones obligatorias del operador

La spec no puede aprobarse hasta decidir y registrar:

1. Origen HTTPS canónico, DNS, responsable de certificados, plataforma y tipo de
   proxy/hosting; determina configuración, ownership y rollback.
2. Si `/health` será público, restringido a monitorización o no publicado;
   determina superficie de información operacional.
3. Entornos permitidos (desarrollo, preview, staging, producción) y URLs exactas
   de Site URL/redirect allowlist; determina protección frente a redirect abuse.
4. Proveedores OAuth habilitados y scopes por proveedor; determina la UX y
   consentimiento reales.
5. Valores públicos de issuer, JWKS URL y audience, y confirmación de emisión
   RS256; determina que el backend acepte tokens legítimos y rechace otros.
6. Mecanismo de CI/plataforma para inyectar configuración pública y server-only,
   gestión de certificados, logs/redacción y almacenamiento de evidencias.
7. Cuenta de smoke, datos mínimos, responsable, frecuencia y cómo se revocan sus
   sesiones; determina que la validación real no introduzca una cuenta insegura.

## Riesgos y compatibilidad

No hay cambio intencional de contrato REST ni de esquema. Cambiar el origen,
audience, issuer, proveedor, scope o redirect allowlist puede romper sesiones y
login existentes: requiere ventana de despliegue, comunicación y rollback. Un
fallback que capture `/api/v1` o una API expuesta fuera del proxy rompe el límite
de mismo origen y es un defecto bloqueante.
