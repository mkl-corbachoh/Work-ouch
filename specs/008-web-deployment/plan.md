# Plan de implementación: 008 - Despliegue web y entorno de autenticación externa

## Precondiciones

Esta spec permanece en `draft`: no se implementa ni despliega hasta que el
operador resuelva las decisiones de `spec.md`. Se parte de la API protegida de la
spec 006 y del SPA compilable de la spec 007. Vite proxy solo cubre desarrollo;
no es infraestructura de producción.

## Enfoque técnico

1. Seleccionar la plataforma y definir infraestructura reproducible para el
   reverse proxy, assets, API privada, volumen SQLite y terminación TLS.
2. Configurar reglas ordenadas: `/api/v1` primero, `/health` solo si aprobado,
   assets existentes, y fallback SPA limitado a navegación GET/HEAD. No usar una
   regla general que entregue `index.html` a la API.
3. Separar configuración en build pública de `web/` y runtime confidencial de la
   API. Validar nombres/ausencia de secretos antes de publicar artefactos.
4. Configurar Supabase y el proveedor OAuth con origen, callback, scopes y JWT
   compatibles; contrastar los valores con la configuración efectiva del API.
5. Crear checks automatizables y runbook manual para TLS, routing, autenticación
   real, observabilidad y rollback.

## Contrato de configuración

| Ámbito | Valores permitidos | Restricción |
|---|---|---|
| Build SPA | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_AUTH_PROVIDERS`, `VITE_AUTH_SCOPES_JSON` | Públicos; validados y reconstruidos por entorno. |
| Runtime API | `DATABASE_PATH`, `PORT`, `NODE_ENV`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL` | No se incorporan al SPA ni se imprimen. |
| Plataforma | host/upstream interno, TLS y secretos OAuth | Gestionados fuera del repositorio y redactados. |

Los valores concretos y nombres adicionales de plataforma se decidirán tras
elegir proveedor de infraestructura; no se presuponen en esta spec.

## Verificación prevista

- Pruebas de configuración para la prioridad de rutas y preservación de API.
- Comprobación HTTP desde fuera: TLS, raíz, deep link, callback, asset y casos
  negativos de `/api/v1`/fallback.
- Smoke de proveedor real con cuenta controlada: OAuth/PKCE, callback,
  bootstrap/me y navegación autenticada, seguido de cierre/revocación indicada.
- Inspección de artefactos y logs para confirmar que no contienen secretos ni
  tokens.
- Ensayo de rollback contra un entorno no productivo o mediante versión anterior
  preparada, sin tocar el volumen SQLite.

## Riesgos a controlar

- Site URL o redirect allowlist incorrectos bloquean login o permiten destinos no
  deseados.
- Tokens HMAC, issuer/audience distintos o JWKS inaccesible causan 401: se
  bloquea el despliegue hasta compatibilidad RS256 comprobada.
- Una configuración de SPA cacheada de forma incoherente puede romper rutas tras
  actualizar assets.
- Publicar API o SQLite directamente elude la topología y se considera fallo de
  seguridad.
