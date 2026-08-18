# Plan de implementación: 008 - Despliegue web y entorno de autenticación externa

## Precondiciones

La implementación está aprobada. El despliegue público permanece bloqueado hasta
que el operador complete los gates efectivos de `spec.md`. Se parte de la API
protegida de la spec 006, del SPA compilable de la spec 007 y del Compose de API
creado por la spec 001. Producción se ejecutará mediante Docker Compose en un
único servidor y se integrará con el Traefik que ya opera otras aplicaciones.
Supabase seguirá siendo externo.

## Enfoque técnico

1. Evolucionar la configuración actual hacia `compose.yaml` como base común,
   `compose.dev.yaml` para desarrollo y `compose.prod.yaml` para el servidor.
2. Construir en el servidor los servicios `api` y `web`; conectar ambos a la red
   externa `${TRAEFIK_NETWORK}` sin publicar puertos y conservar SQLite en su
   volumen privado.
3. Configurar labels ordenadas de Traefik: `/api/v1` primero, `/health` público y
   router web con menor prioridad. No usar `StripPrefix` ni una regla que
   entregue `index.html` a la API.
4. Servir `web/dist` desde Nginx en el puerto 80, con fallback limitado a
   navegación GET/HEAD, 404 para assets ausentes y cache diferenciada para HTML y
   assets con hash.
5. Proporcionar desarrollo contenedorizado con `api` en 3000 y Vite en 5173,
   hot reload y proxy interno, sin dependencias Node/SQLite instaladas en el host.
6. Separar configuración en build pública de `web/` y runtime confidencial de la
   API. Validar nombres/ausencia de secretos antes de publicar artefactos.
7. Configurar el proyecto Supabase compartido y el proveedor OAuth con callbacks,
   scopes y JWT compatibles; contrastar los valores con la configuración efectiva
   del API.
8. Crear checks automatizables y runbook manual para TLS, routing, autenticación
   real, observabilidad y rollback.

## Contrato de configuración

| Ámbito | Valores permitidos | Restricción |
|---|---|---|
| Build SPA | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_AUTH_PROVIDERS`, `VITE_AUTH_SCOPES_JSON` | Públicos; validados y reconstruidos por entorno. |
| Runtime API | `DATABASE_PATH`, `PORT`, `NODE_ENV`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL` | No se incorporan al SPA ni se imprimen. |
| Compose producción | `APP_DOMAIN`, `TRAEFIK_NETWORK` | Obligatorios; hostname sin esquema y nombre de red Docker externa. |
| Compose desarrollo | `WEB_DEV_PORT`, `API_DEV_PORT` | Opcionales; valores predeterminados 5173 y 3000, publicados solo en loopback. |
| Plataforma | entrypoint `websecure`, resolver `letsencrypt` y secretos OAuth | Gestionados fuera del repositorio y redactados. |

Los Compose usarán servicios estables llamados `api` y `web`. Producción ejecuta
API en el puerto interno 3000 y Nginx en el 80; desarrollo ejecuta API en el 3000
y Vite en el 5173. Supabase no forma parte de ningún Compose. Un `.env` local no
versionado alimenta Compose y `.env.example` documenta únicamente nombres y
valores de muestra. El proveedor inicial es Google sin scopes adicionales.

## Construcción, despliegue y rollback

No se usa registry en esta fase. El servidor obtiene una revisión Git conocida y
ejecuta la construcción de `api` y `web` con Compose. El runbook registra esa
revisión y valida la configuración resultante antes de recrear contenedores.

El rollback vuelve manualmente a la revisión Git anterior, reconstruye los dos
servicios y conserva el volumen SQLite. Etiquetado, promoción y automatización
formal de releases quedan para trabajo posterior.

## Verificación prevista

- Pruebas de configuración para la prioridad de rutas y preservación de API.
- Validación de la configuración fusionada de Compose para desarrollo y
  producción, incluidas variables obligatorias, puertos y ausencia de
  publicaciones de host en producción.
- Comprobación HTTP desde fuera: TLS, raíz, deep link, callback, asset y casos
  negativos de `/api/v1`/fallback, además de `/health` público.
- Arranque de desarrollo desde un host sin Node.js ni SQLite locales, con hot
  reload y proxy Vite hacia `api:3000`.
- Smoke de proveedor real con cuenta controlada: OAuth/PKCE, callback,
  bootstrap/me y navegación autenticada, seguido de cierre/revocación indicada.
- Inspección de artefactos y logs para confirmar que no contienen secretos ni
  tokens.
- Ensayo de rollback manual desde una revisión Git anterior, sin tocar el volumen
  SQLite.

## Riesgos a controlar

- Site URL o redirect allowlist incorrectos bloquean login o permiten destinos no
  deseados.
- Tokens HMAC, issuer/audience distintos o JWKS inaccesible causan 401: se
  bloquea el despliegue hasta compatibilidad RS256 comprobada.
- Una configuración de SPA cacheada de forma incoherente puede romper rutas tras
  actualizar assets.
- Publicar API o SQLite directamente elude la topología y se considera fallo de
  seguridad.
- Un build no reproducible en el servidor o perder la revisión Git anterior
  impide el rollback; se debe validar el lockfile y registrar cada revisión
  desplegada aunque todavía no exista un sistema formal de releases.
- El proyecto Supabase compartido mezcla identidades y redirects permitidos de
  desarrollo y producción; ambos entornos deben mantener bases y variables
  separadas y usar callbacks exactos.
