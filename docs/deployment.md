# Despliegue web

Work-ouch usa Docker Compose en un único servidor, Supabase Auth externo y una
instancia Traefik ya operativa. Traefik es el único proceso público; la API y
Nginx no publican puertos del host en producción.

## Configuración

Crear un `.env` no versionado a partir de `.env.example`. Solo se permiten estas
categorías:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_AUTH_PROVIDERS` y `VITE_AUTH_SCOPES_JSON`: valores públicos incorporados
  al bundle web.
- `AUTH_ISSUER`, `AUTH_AUDIENCE` y `AUTH_JWKS_URL`: valores de verificación JWT
  que solo recibe la API.
- `APP_DOMAIN` y `TRAEFIK_NETWORK`: hostname sin esquema y nombre de la red
  Docker externa del Traefik existente.
- `API_DEV_PORT` y `WEB_DEV_PORT`: publicaciones locales opcionales, con 3000 y
  5173 como valores predeterminados.

No se deben introducir OAuth client secrets, claves secretas de Supabase,
service-role keys, access tokens ni refresh tokens. `VITE_AUTH_PROVIDERS` es
`google` y `VITE_AUTH_SCOPES_JSON` es `{}` en esta primera versión.

## Desarrollo en Docker

El entorno contenedorizado solo requiere Git, Docker Engine y Docker Compose. En
Windows 11 se usa Docker Desktop con WSL2; Node.js, npm, SQLite y Nginx se
ejecutan dentro de los contenedores.

```sh
cp .env.example .env
just docker-dev-config
just docker-dev-up
just docker-dev-logs
```

El SPA queda en `http://localhost:5173` y la API también puede inspeccionarse en
`http://localhost:3000`. El navegador usa el origen del SPA: Vite reenvía
`/api/v1` y `/health` a `api:3000`. El código tiene hot reload, `node_modules`
permanece en volúmenes Linux y SQLite usa `work-ouch-dev_training_dev_data`.

`just docker-build`, `just docker-up`, `just docker-down` y `just docker-logs`
son alias compatibles del flujo de desarrollo. Ninguna receta elimina volúmenes.

## Supabase compartido

Desarrollo y producción usan inicialmente el mismo proyecto Supabase. En Auth se
debe configurar:

- Site URL: `https://${APP_DOMAIN}` con el valor efectivo sustituido.
- Redirect de producción: `https://${APP_DOMAIN}/auth/callback`.
- Redirect local: `http://localhost:${WEB_DEV_PORT}/auth/callback`.
- Proveedor Google habilitado, sin scopes adicionales solicitados por Work-ouch.
- Signing key asimétrica RS256, issuer, audience y JWKS exactamente iguales a
  los valores `AUTH_*` de la API.

No se usan comodines para producción. Antes de publicar se valida con un access
token real; un ID token o claims fabricados no constituyen evidencia.

## Producción

Precondiciones del servidor:

- El DNS de `APP_DOMAIN` apunta al servidor.
- Existe la red Docker `TRAEFIK_NETWORK` y Traefik está conectado a ella.
- Traefik dispone del entrypoint `websecure` y el certificate resolver
  `letsencrypt`.
- El `.env` contiene valores efectivos y no es legible por usuarios ajenos al
  operador.

Validar y construir desde una revisión Git conocida:

```sh
git rev-parse HEAD
just docker-prod-config
just docker-prod-build
just docker-prod-nginx-check
just docker-prod-up
```

Compose construye las imágenes en el servidor. El servicio `api` escucha solo en
la red Docker por el puerto 3000, `web` sirve `web/dist` mediante Nginx en el 80 y
SQLite persiste en `work-ouch_training_data`. El router `/api/v1` conserva path,
query, cuerpo y `Authorization`, limita el prefijo a `/api/v1` o `/api/v1/…` y
no captura `/api/v10`; `/health` es público y el router web tiene menor
prioridad. No se aplica `StripPrefix`.

## Comprobación

Desde fuera del servidor se comprueba:

```sh
curl --fail "https://${APP_DOMAIN}/"
curl --fail "https://${APP_DOMAIN}/auth/callback"
curl --fail "https://${APP_DOMAIN}/workouts/7/active"
curl --fail "https://${APP_DOMAIN}/health"
```

Además se debe verificar que:

- HTTP redirige a HTTPS y el certificado es válido.
- Un asset existente no devuelve HTML y uno inexistente devuelve 404.
- Un método distinto de GET/HEAD sobre una ruta web no devuelve `index.html`.
- Una petición sin bearer a `/api/v1/me` devuelve el JSON 401 de la API.
- Una petición autenticada conserva los estados y cuerpos 404/409 de la API.
- Login Google, PKCE, callback, bootstrap, `/me`, navegación y logout funcionan
  con la cuenta de smoke dedicada.

La cuenta dedicada, sus datos mínimos, responsable y revocación se registran
antes del primer despliegue público. Nunca se guardan tokens en comandos,
capturas, evidencias o logs.

## Logs y rollback

Nginx registra `$uri` sin query string y nunca registra `Authorization`. La API
registra método y path sin query ni cuerpos. Antes del despliegue se debe revisar
que la configuración global del Traefik compartido tampoco registre headers de
autorización, parámetros OAuth `code`, access tokens ni refresh tokens.

Si falla una comprobación crítica:

1. Volver a la revisión Git anterior registrada.
2. Ejecutar `just docker-prod-build` y `just docker-prod-up`.
3. Repetir las comprobaciones TLS, routing, health y autenticación.
4. No ejecutar `db-reset`, `docker compose down --volumes` ni eliminar
   `work-ouch_training_data`.

El registry y la promoción automatizada de releases quedan para una spec futura.
