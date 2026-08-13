# Plan de implementacion: 006 - Autenticacion e identidad externa

## Enfoque

Se anade `user_identities` sobre la tabla `users` existente y un modulo de
autenticacion independiente del dominio. El proveedor inicial implementa
verificacion OIDC con `jose`, JWKS remoto, `RS256`, issuer y audience configurados
por entorno. El dominio solo recibe `currentUser.id`.

## Configuracion

Variables obligatorias cuando la autenticacion esta activa:

- `AUTH_ISSUER`
- `AUTH_AUDIENCE`
- `AUTH_JWKS_URL`

El proveedor se identifica internamente como `supabase`; no se incorpora el SDK
de Supabase ni ningun secreto al repositorio.

## API y aislamiento

- `GET /health` permanece publico.
- `/api/v1` requiere `Authorization: Bearer <JWT>` y resuelve la identidad contra
  `user_identities`.
- `POST /api/v1/auth/bootstrap` valida el JWT y crea usuario e identidad en una
  transaccion `IMMEDIATE`; es idempotente y seguro ante concurrencia.
- `GET /api/v1/me` devuelve el usuario interno autenticado.
- Las rutas privadas dejan de aceptar `userId` como selector de propietario. Las
  consultas usan el usuario autenticado y las rutas de mediciones se montan bajo
  `/api/v1/me/measurements`.
- El catalogo global de ejercicios y tipos de metricas sigue siendo accesible
  solo para usuarios autenticados.

## Verificacion

Se cubren migracion, claims y firma JWT, ausencia/expiracion de tokens,
bootstrap idempotente y concurrente, `/me`, aislamiento entre usuarios y
rechazo de `userId` confiado. Se ejecutan `just test`, `just typecheck`, `just
lint` y `just build`.
