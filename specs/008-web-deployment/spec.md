---
status: approved
---

# 008 - Despliegue web y entorno de autenticación externa

Implementación aprobada por el usuario el 2026-08-17. El despliegue público y el
smoke OAuth real permanecen bloqueados hasta completar los gates operativos de
esta spec.

## Objetivo

Definir el despliegue de producción mediante Docker Compose en un único servidor
y bajo un único origen público que sirva el SPA de `web/`, reenvíe la API
existente y lo conecte de forma segura con Supabase Auth externo. Esta spec
también proporciona un Compose de desarrollo ejecutable sin instalar Node.js,
npm, SQLite, Nginx ni Traefik directamente en el host. Convierte en trabajo
operativo verificable los residuales aprobados al cerrar la spec 007.

## Alcance

- Integración mediante labels y una red Docker externa con la instancia Traefik
  ya operada en el servidor; Work-ouch no despliega otra instancia de Traefik.
- Docker Compose reproducible para producción y desarrollo, con una base común y
  variantes explícitas por entorno.
- Hosting de `web/dist` mediante Nginx, fallback de navegación SPA y forwarding
  transparente de `/api/v1` a la Training API.
- Exposición pública de `GET /health` mediante un router específico de Traefik.
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
- Registry de imágenes, promoción automatizada de releases, alta disponibilidad
  o despliegue en más de un servidor. Las imágenes se construyen en el servidor
  durante esta fase.

## Arquitectura y límites de seguridad

La topología de producción objetivo es:

```text
Internet -- HTTPS público --> Traefik existente
                              |-- /api/v1/* --> Training API:3000
                              |-- /health    --> Training API:3000
                              `-- resto      --> Nginx:80 --> web/dist

Navegador/API -------------> Supabase Auth externo
Training API --------------> volumen SQLite privado en /app/data
```

- Producción se ejecuta con `compose.yaml` y `compose.prod.yaml`. Los servicios
  se llaman `api` y `web`; ambos se construyen en el servidor. `api` escucha en
  el puerto interno 3000 y `web` sirve Nginx en el puerto interno 80. Ninguno
  publica puertos del host.
- Solo Traefik escucha públicamente. Los servicios se conectan a su red externa,
  cuyo nombre físico se recibe en `TRAEFIK_NETWORK`. `APP_DOMAIN` contiene el
  hostname canónico sin esquema. Ambas variables son obligatorias en producción.
- Traefik usa el entrypoint `websecure`, TLS y el certificate resolver
  `letsencrypt`. El router de API combina una regla `Host` para `APP_DOMAIN` con
  `Path` exacto para `/api/v1` o `PathPrefix` para `/api/v1/`; así no captura
  prefijos distintos como `/api/v10`. El router web usa el mismo host con menor
  prioridad. No se aplica `StripPrefix` ni middleware que transforme o registre
  el bearer.
- `/health` tiene un router público independiente limitado al mismo host y a la
  regla `Path` exacta `/health`; no queda cubierto por el fallback web.
- El navegador llama exclusivamente a rutas relativas `/api/v1`; SPA y API
  comparten esquema, host y puerto público. No se añade CORS.
- Traefik debe evaluar `/api/v1` y `/health` antes del router web. Debe preservar
  método, path, query string, cuerpo y `Authorization` al upstream de API. No
  debe reenviar peticiones estáticas a la API.
- Solo el proxy escucha públicamente. La API, SQLite y los puertos internos no
  son accesibles desde Internet. La persistencia existente de SQLite en
  `/app/data` se conserva.
- TLS es obligatorio para el origen público. HTTP, si se mantiene, redirige a
  HTTPS sin servir contenido autenticado. La renovación del certificado debe ser
  automática o contar con una comprobación y procedimiento documentados.
- Los valores `VITE_*` se incorporan al bundle y son públicos por definición:
  solo se permiten URL de Supabase, publishable key y configuración de
  proveedores/scopes. `AUTH_*` es configuración solo del proceso API. Ningún
  secreto se escribe en archivos versionados, imágenes, salida de build o logs.
- La API continúa verificando JWT RS256 mediante JWKS, issuer y audience. El
  proxy no valida, fabrica, transforma ni registra tokens.

## Entorno Docker de desarrollo

Desarrollo se ejecuta con `compose.yaml` y `compose.dev.yaml`. Solo requiere el
repositorio, Docker Engine y Docker Compose; en Windows 11 se admite Docker
Desktop con WSL2. Supabase sigue siendo externo y no se autoaloja como parte del
stack.

| Servicio | Puerto del contenedor | Publicación local predeterminada |
|---|---:|---:|
| `web` (Vite) | 5173 | `127.0.0.1:${WEB_DEV_PORT:-5173}:5173` |
| `api` (TypeScript watch) | 3000 | `127.0.0.1:${API_DEV_PORT:-3000}:3000` |

Vite reenvía `/api/v1` y `/health` a `http://api:3000`, por lo que el navegador
usa `http://localhost:${WEB_DEV_PORT:-5173}` como único origen. El código se
sincroniza o monta para hot reload, pero las dependencias y módulos nativos se
instalan dentro de contenedores Linux y no se comparten desde `node_modules` del
host. La base de desarrollo usa un volumen distinto del de producción.

## Reglas de enrutamiento y respuestas

| Solicitud pública | Comportamiento requerido |
|---|---|
| `GET`/`HEAD` de asset existente | Servir el asset de `web/dist`; no fallback. |
| `GET`/`HEAD` de una ruta SPA, incluido `/auth/callback` | Devolver `web/dist/index.html` para que React Router resuelva la ruta. |
| Cualquier método `/api/v1/*` | Reenviar sin reescritura a la API; conservar bearer y query. La respuesta y estado de API se propagan. |
| `GET /health` | Reenviar exactamente a la API sin exigir bearer; no cae en el SPA. Otros métodos no reciben fallback. |
| Ruta/método no anterior | No debe recibir `index.html` como respuesta de API; devolver la respuesta del proxy configurada. |

`/health` se publica en este despliegue. Nginx limita el fallback SPA a `GET` y
`HEAD`: una ruta de navegación devuelve `index.html`, mientras que un asset
inexistente devuelve 404 y otros métodos no reciben el HTML. `index.html` se
sirve sin cache permanente y los assets con hash pueden usar cache larga e
inmutable; una actualización no puede mantener indefinidamente un HTML que
referencia assets retirados.

## Configuración de autenticación y entorno

Se usa inicialmente el mismo proyecto Supabase para desarrollo y producción.
Antes de desplegar, el operador debe configurar el **Site URL** igual al origen
HTTPS canónico y permitir exactamente `https://${APP_DOMAIN}/auth/callback` y
`http://localhost:${WEB_DEV_PORT:-5173}/auth/callback`. No se permiten comodines
de producción. Separar proyectos Supabase por entorno queda como mejora futura.

Los proveedores OAuth habilitados y sus scopes deben coincidir con
`VITE_AUTH_PROVIDERS` y `VITE_AUTH_SCOPES_JSON`. El flujo desplegado debe emitir
access tokens cuyo algoritmo sea RS256 y cuyos issuer, audience y JWKS sean
exactamente los configurados en la API por `AUTH_ISSUER`, `AUTH_AUDIENCE` y
`AUTH_JWKS_URL`. La verificación debe probarse con un token real, no con claims
inventados ni con un token de ID.

La construcción de producción recibe valores públicos mediante el entorno de
build configurado en el servidor; un cambio de esos valores obliga a reconstruir
el SPA. Las variables server-only se inyectan únicamente en el runtime de la API
y se validan antes de aceptar tráfico.

## Despliegue, operación y rollback

1. Validar configuración y construir backend y SPA en el servidor mediante
   Docker Compose sin secretos en salida.
2. Recrear `api` y `web` conectados al Traefik existente de forma que rutas
   estáticas, fallback y upstream sean comprobables en el origen canónico.
3. Ejecutar checks HTTP y smoke autenticado reales; conservar únicamente
   resultados redactados.
4. Si falla una comprobación crítica, volver manualmente a la revisión Git
   anterior conocida y reconstruir los servicios, conservando el volumen
   SQLite. No ejecutar `db-reset`, no borrar volúmenes ni modificar datos como
   rollback de este despliegue.

El registry, etiquetado y promoción formal de releases se definirán en trabajo
posterior. En esta spec los runbooks deben identificar al menos la revisión Git
desplegada, origen canónico, estado del certificado, salud del upstream,
resultado de smoke y responsable/fecha, sin incluir secretos ni bearer tokens.
Los logs de Traefik, Nginx y API no deben registrar `Authorization`, URL de
callback completa, `code`, access token ni refresh token.

## Criterios de aceptación

- Un navegador en el origen HTTPS canónico carga `/`, una ruta profunda y
  `/auth/callback` sin 404 del servidor, y assets existentes no reciben
  `index.html`.
- Una llamada autenticada a `/api/v1/me` llega a la API con path, query y bearer
  intactos; una respuesta 401/404/409 de API conserva su estado y cuerpo.
- Ninguna ruta de API recibe fallback SPA. `/health` es público, se reenvía sin
  bearer y la API no es accesible directamente desde Internet.
- El Compose de producción construye `api` y `web` en el servidor, no publica sus
  puertos y los conecta a `${TRAEFIK_NETWORK}`. Los routers usan
  `${APP_DOMAIN}`, `websecure` y el resolver `letsencrypt`.
- El Compose de desarrollo inicia API y SPA con hot reload en los puertos locales
  configurables `API_DEV_PORT` 3000 y `WEB_DEV_PORT` 5173 sin exigir Node.js,
  npm, SQLite, Nginx ni Traefik instalados en el host.
- TLS es válido para el origen canónico y HTTP no sirve contenido autenticado.
- El bundle solo contiene las cuatro categorías públicas documentadas; no
  contiene `AUTH_*` ni secretos. Cambiar configuración pública reconstruye el
  bundle.
- Supabase Site URL, redirect allowlist, proveedor(s), scopes y callback real
  permiten login OAuth/PKCE en el proyecto compartido y retorno al origen
  correspondiente sin comodines de producción.
- El access token real aceptado por la API usa RS256 y satisface issuer, audience
  y JWKS configurados; uno con audience/issuer/algoritmo incompatibles es
  rechazado por la API.
- Un smoke real completo (login, callback, bootstrap/me y una ruta SPA) pasa en
  el origen desplegado y no revela datos sensibles en su evidencia.
- Existe un procedimiento probado de rollback manual mediante una revisión Git
  anterior que reconstruye los servicios sin pérdida o migración de datos.

## Decisiones del operador

Quedan fijadas estas decisiones:

1. Producción usa Docker Compose en un único servidor y se integra con el
   Traefik existente mediante `APP_DOMAIN` y `TRAEFIK_NETWORK`.
2. Traefik usa `websecure`, TLS y el resolver `letsencrypt`; Nginx sirve el SPA.
3. `/health` es público y la API no publica directamente su puerto.
4. Desarrollo y producción usan inicialmente el mismo Supabase externo, con
   redirects exactos y sin autoalojarlo.
5. Las imágenes se construyen en el servidor. Registry y gestión formal de
   releases quedan fuera de esta spec.
6. Los servicios y puertos son `api:3000`, Nginx `web:80` y Vite `web:5173`; las
   publicaciones locales predeterminadas son 3000 y 5173 sobre loopback.
7. El proveedor inicial es Google y no se solicitan scopes adicionales:
   `VITE_AUTH_PROVIDERS=google` y `VITE_AUTH_SCOPES_JSON={}`.
8. Compose recibe la configuración desde un `.env` no versionado; el repositorio
   solo contiene `.env.example` sin valores efectivos ni secretos.
9. Se usará una cuenta de smoke dedicada, que se registrará antes del despliegue
   público y no bloquea la implementación local.

Antes del despliegue público se deben registrar y verificar:

1. Valor efectivo de `APP_DOMAIN`, DNS y nombre efectivo de
   `TRAEFIK_NETWORK` en el servidor.
2. Valores efectivos de issuer, JWKS URL y audience, y confirmación de emisión
   RS256 por el proyecto Supabase compartido.
3. Configuración efectiva de redacción de logs de Traefik/Nginx/API y
   almacenamiento de evidencias.
4. Cuenta de smoke dedicada, datos mínimos, responsable, frecuencia y revocación de sus
   sesiones.

## Riesgos y compatibilidad

No hay cambio intencional de contrato REST ni de esquema. Cambiar el origen,
audience, issuer, proveedor, scope o redirect allowlist puede romper sesiones y
login existentes: requiere ventana de despliegue, comunicación y rollback. Un
fallback que capture `/api/v1` o una API expuesta fuera del proxy rompe el límite
de mismo origen y es un defecto bloqueante. Compartir el proyecto Supabase entre
desarrollo y producción también comparte identidades externas y configuración de
redirects; los datos SQLite y las variables de cada entorno deben permanecer
aislados y se reevaluará separar proyectos antes de ampliar el acceso.
