# Tareas de implementación: 008 - Despliegue web y entorno de autenticación externa

Estado: todas las tareas permanecen sin ejecutar mientras la spec sea `draft`.

## 1. Decisiones y preparación

- [ ] Registrar valores efectivos de `APP_DOMAIN` y `TRAEFIK_NETWORK`; verificar DNS, red externa, entrypoint `websecure` y resolver `letsencrypt` del Traefik existente.
- [ ] Registrar proveedores, scopes, Site URL y redirects exactos del proyecto Supabase compartido; verificar compatibilidad RS256/issuer/audience/JWKS sin secretos.
- [ ] Definir inyección separada de variables públicas y server-only, redacción de logs y cuenta de smoke; verificar que no se versionan ni imprimen secretos.

## 2. Topología desplegable

- [ ] Organizar `compose.yaml`, `compose.dev.yaml` y `compose.prod.yaml` con servicios `api` y `web`; validar la configuración fusionada de ambos entornos.
- [ ] Añadir el build Nginx de `web/dist` en el puerto interno 80 y el build API en el 3000; verificar que producción construye en el servidor, conserva `/app/data` y no publica ambos puertos.
- [ ] Conectar producción a `${TRAEFIK_NETWORK}` y configurar labels con `${APP_DOMAIN}`, `/api/v1`, `/health` público y router web prioritariamente inferior; verificar método, path, query y `Authorization` sin `StripPrefix`.
- [ ] Configurar TLS mediante `websecure`/`letsencrypt` y cache de HTML/assets en Nginx; verificar certificado, renovación, fallback GET/HEAD y 404 de assets ausentes.

## 3. Entorno de desarrollo

- [ ] Configurar `api` con TypeScript watch en `${API_DEV_PORT:-3000}` y `web` con Vite en `${WEB_DEV_PORT:-5173}`, publicados solo en loopback.
- [ ] Configurar hot reload, dependencias Linux aisladas y proxy Vite de `/api/v1` y `/health` hacia `api:3000`; verificar ejecución sin Node.js, npm ni SQLite instalados en el host.
- [ ] Separar el volumen SQLite de desarrollo y documentar ejecución en Linux y Windows 11 mediante Docker Desktop/WSL2.

## 4. Entorno de autenticación

- [ ] Configurar valores públicos al construir el SPA y valores `AUTH_*` solo al ejecutar API; inspeccionar artefactos y logs redactados.
- [ ] Configurar en el mismo proyecto Supabase el Site URL de producción y redirects exactos para `https://${APP_DOMAIN}/auth/callback` y `http://localhost:${WEB_DEV_PORT:-5173}/auth/callback`; verificar ambos sin comodines de producción.
- [ ] Verificar con JWT real que RS256, issuer, audience y JWKS son aceptados, y que incompatibilidades se rechazan.

## 5. Operación y evidencia

- [ ] Construir y desplegar en el servidor desde una revisión Git registrada; ejecutar checks de raíz, deep link, callback, assets, `/api/v1` y `/health` público sin guardar tokens.
- [ ] Ejecutar smoke OAuth real: login PKCE, callback, bootstrap/me, navegación autenticada y logout/revocación de sesión de prueba.
- [ ] Documentar alertas/checks operativos y rollback manual a una revisión Git anterior; ensayar reconstrucción y retorno sin pérdida de SQLite.
- [ ] Ejecutar verificaciones finales de backend y web mediante recetas `just` aplicables, más los smoke desplegados; actualizar estado solo tras cumplir todos los criterios.
