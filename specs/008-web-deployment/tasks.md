# Tareas de implementación: 008 - Despliegue web y entorno de autenticación externa

Estado: implementación aprobada el 2026-08-17. El despliegue público y los smoke
reales requieren completar primero los gates operativos indicados.

## 1. Decisiones y preparación

- [ ] Registrar valores efectivos de `APP_DOMAIN` y `TRAEFIK_NETWORK`; verificar DNS, red externa, entrypoint `websecure` y resolver `letsencrypt` del Traefik existente.
- [ ] Registrar proveedores, scopes, Site URL y redirects exactos del proyecto Supabase compartido; verificar compatibilidad RS256/issuer/audience/JWKS sin secretos.
- [x] Definir `.env` no versionado, inyección separada de valores públicos/server-only y redacción local de API/Nginx; verificar que imágenes, bundle y logs locales no contienen secretos ni sentinelas.
- [ ] Verificar redacción efectiva del Traefik compartido y registrar cuenta de smoke, responsable, frecuencia, datos mínimos y revocación.

## 2. Topología desplegable

- [x] Organizar `compose.yaml`, `compose.dev.yaml` y `compose.prod.yaml` con servicios `api` y `web`; validar la configuración fusionada de ambos entornos.
- [x] Añadir el build Nginx de `web/dist` en el puerto interno 80 y el build API en el 3000; verificar builds locales, `/app/data`, usuario/comando productivos y ausencia de puertos publicados.
- [x] Conectar producción a `${TRAEFIK_NETWORK}` y configurar labels acotadas para `${APP_DOMAIN}`, `/api/v1`, `/health` público y router web inferior; validar configuración sin `StripPrefix`.
- [x] Configurar y probar Nginx con cache diferenciada, fallback GET/HEAD, deep links con punto, 404 de assets, rechazo de otros métodos y logs sin query/bearer.
- [ ] Verificar en el servidor certificado TLS, redirección HTTP, renovación y forwarding Traefik de método, path, query, cuerpo, `Authorization` y respuestas API.

## 3. Entorno de desarrollo

- [x] Configurar y ejecutar `api` con TypeScript watch en `${API_DEV_PORT:-3000}` y `web` con Vite en `${WEB_DEV_PORT:-5173}`, publicados solo en loopback.
- [x] Configurar polling/hot reload, dependencias Linux escribibles y proxy Vite acotado de `/api/v1` y `/health` hacia `api:3000`; verificar el stack desde imágenes y volúmenes nuevos.
- [x] Separar y probar la persistencia del volumen SQLite de desarrollo; documentar Linux y Windows 11 mediante Docker Desktop/WSL2.

## 4. Entorno de autenticación

- [x] Configurar valores públicos al construir el SPA y valores `AUTH_*` solo al ejecutar API; inspeccionar imagen, bundle y logs locales redactados.
- [ ] Configurar en el mismo proyecto Supabase el Site URL de producción y redirects exactos para `https://${APP_DOMAIN}/auth/callback` y `http://localhost:${WEB_DEV_PORT:-5173}/auth/callback`; verificar ambos sin comodines de producción.
- [ ] Verificar con JWT real que RS256, issuer, audience y JWKS son aceptados, y que incompatibilidades se rechazan.

## 5. Operación y evidencia

- [ ] Construir y desplegar en el servidor desde una revisión Git registrada; ejecutar checks de raíz, deep link, callback, assets, `/api/v1` y `/health` público sin guardar tokens.
- [ ] Ejecutar smoke OAuth real: login PKCE, callback, bootstrap/me, navegación autenticada y logout/revocación de sesión de prueba.
- [x] Documentar checks operativos y rollback manual a una revisión Git anterior sin tocar SQLite.
- [ ] Ensayar en el servidor reconstrucción y retorno a una revisión anterior sin pérdida de SQLite.
- [x] Ejecutar verificaciones locales de backend, web, E2E, Compose, imágenes, Nginx y persistencia mediante las recetas y checks aplicables.
- [ ] Ejecutar verificaciones desplegadas y smoke real; actualizar la spec a `completed` solo tras cumplir todos los criterios.
