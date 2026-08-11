# Plan de implementacion: 006 - Autenticacion y autorizacion

## Objetivo

Convertir la REST existente en un OAuth Resource Server que valide JWT `RS256`
contra un JWKS remoto y aplique scopes al catalogo de ejercicios, sin introducir
usuarios, sesiones, emision de tokens, cambios de base de datos ni MCP.

La spec permanece en `draft`; este plan no se ejecuta hasta su revision y
aprobacion.

## Dependencias y compatibilidad

- Anadir `jose` 6.x como unica dependencia de ejecucion nueva y fijar su version
  efectiva en `package-lock.json`.
- Node.js 24 puede cargar la distribucion ESM de `jose` desde el build CommonJS;
  se verificara con el JavaScript compilado antes de avanzar.
- Mantener Express 5, Zod 4, Pino, Vitest, npm, TypeScript estricto y la salida
  CommonJS actuales.
- No anadir Passport, sesiones, cookies, SDK de proveedor, ORM ni servidor OAuth.

## Configuracion

`src/config/index.ts` incorporara `AUTH_ISSUER`, `AUTH_AUDIENCE` y
`AUTH_JWKS_URL` al esquema y a `AppConfig`.

- Las tres variables son obligatorias en todos los entornos.
- Un helper de URL comprobara protocolo, host local permitido fuera de
  produccion, ausencia de userinfo/query/fragment y la forma de audience.
- Produccion exige HTTPS; desarrollo y test solo admiten HTTP en loopback.
- Los errores identifican la variable invalida sin imprimir su valor completo.
- La configuracion se valida antes de abrir SQLite, como ya hace `server.ts`.

`.env.example`, Docker Compose y README se actualizaran durante la implementacion
con valores descriptivos, no secretos. Compose recibira las variables desde el
entorno y no incluira tokens ni claves privadas.

## Modelo interno de seguridad

Se definira un contrato pequeno e inyectable:

```ts
type AuthenticatedPrincipal = {
  subject: string;
  clientId: string | null;
  scopes: ReadonlySet<string>;
};

interface AccessTokenVerifier {
  verify(token: string, signal?: AbortSignal): Promise<AuthenticatedPrincipal>;
}
```

La implementacion JOSE y sus errores tipados residiran en `src/auth/`. Las
pruebas de API inyectaran un verificador controlado; produccion construira el
verificador JWT desde `AppConfig`. No habra implementacion no-op seleccionable
por entorno.

`createApp` recibira el verificador como dependencia obligatoria. El principal
validado se guardara en `response.locals` para la peticion actual, sin ampliar
globalmente tipos de Express ni persistir identidad.

## Verificacion JWT y JWKS

La implementacion usara `jwtVerify` y `createRemoteJWKSet` de `jose` con:

- `algorithms: ["RS256"]`;
- issuer y audience exactos desde configuracion;
- `typ: "at+jwt"`;
- tolerancia de reloj de 30 segundos;
- timeout de JWKS de 5 segundos;
- cooldown de refresh de 30 segundos;
- cache maxima de 10 minutos;
- validacion adicional de `kid`, `sub`, `iat` y `scope`.

El parser de scopes separara por espacios ASCII, eliminara segmentos vacios y
producira un conjunto. Un claim ausente o de otro tipo invalida el token.

Se distinguiran errores internos de token invalido y de proveedor no disponible.
Errores criptograficos, claims incorrectos y ausencia de clave compatible son
token invalido. Timeout, DNS, conexion o respuesta JWKS inutilizable durante una
actualizacion necesaria son indisponibilidad temporal. Ninguno expone el error
original al consumidor.

El verificador se crea al arrancar sin descargar el JWKS. La cache vive en el
proceso y no se persiste. No se realizan introspeccion ni reintentos adicionales
fuera del comportamiento acotado de `createRemoteJWKSet`.

## Middleware y orden Express

`src/app.ts` se ordenara asi:

1. desactivar `x-powered-by` e instalar logging;
2. montar `GET /health`;
3. montar Protected Resource Metadata;
4. montar autenticacion en `/api/v1`;
5. parsear JSON para `/api/v1`;
6. montar routers funcionales con autorizacion por operacion;
7. handlers comunes de 404 y error.

Este orden evita parsear bodies o ejecutar SQL antes de autenticar. Las rutas
desconocidas bajo `/api/v1` atraviesan autenticacion antes del 404.

El middleware de autenticacion:

- exige exactamente un bearer token en `Authorization`;
- invoca el verificador una vez por peticion;
- guarda el principal validado;
- convierte errores tipados a 401 o 503.

Un helper `requireScope(scope)` comprueba el principal y genera 403 antes del
handler de dominio. El router de ejercicios aplicara lectura a sus GET y
escritura a POST/PATCH. Los scopes no tendran jerarquia implicita.

## Errores y headers

`HttpError` se ampliara de forma minima para transportar headers de respuesta
controlados, y el error handler los aplicara antes del JSON comun.

- 401 sin token: `AUTHENTICATION_REQUIRED`.
- 401 token invalido: `INVALID_ACCESS_TOKEN`.
- 403: `INSUFFICIENT_SCOPE` con `requiredScopes`.
- 503: `AUTHORIZATION_SERVICE_UNAVAILABLE`.

Un constructor central generara `WWW-Authenticate` con valores escapados y el
endpoint relativo `/.well-known/oauth-protected-resource/api/v1`. No se
reflejaran valores de headers o tokens recibidos.

## Protected Resource Metadata

Una ruta pequena, sin acceso a SQLite, devolvera el contrato estatico de la spec
usando issuer y audience validados. Se montara fuera de `/api/v1`, antes de la
autenticacion y sin CORS nuevo.

El orden de `scopes_supported` sera estable: lectura y luego escritura. Solo GET
estara implementado; otros metodos alcanzaran el 404 comun.

## Logging

El request logger existente seguira registrando metodo, path, estado y duracion.
La capa de auth no registrara headers ni cuerpos. Los errores externos se
convertiran primero a errores sanitizados para impedir que Pino serialice tokens,
claims, contenido JWKS o detalles JOSE.

Tras una validacion correcta se podra registrar `subject` o `clientId` solo en
eventos de autorizacion relevantes. No se registrara identidad obtenida por mera
decodificacion.

## Pruebas

### Configuracion

- ausencia y cadenas vacias;
- HTTPS valido en produccion;
- HTTP loopback permitido en desarrollo/test;
- rechazo de HTTP remoto, userinfo, query, fragment y audience sin `/api/v1`;
- comprobacion de que el fallo ocurre antes de abrir SQLite.

### Verificador

- generar pares RSA y JWT en test;
- servir JWKS desde un servidor HTTP efimero de loopback;
- token valido y scopes parseados;
- algoritmo, `typ`, `kid`, firma, issuer, audience, tiempos, `sub`, `iat` y
  `scope` invalidos;
- cache sin fetch por peticion, rotacion a un `kid` nuevo y cooldown;
- timeout, servidor caido, JSON invalido y JWKS sin clave util;
- comprobacion de que errores publicos no contienen tokens ni detalles JOSE.

### API

- health y metadatos publicos;
- 401 ausente/invalido y `WWW-Authenticate`;
- 403 con scope requerido;
- GET con lectura, POST/PATCH con escritura y ausencia de implicacion entre
  scopes;
- body malformado sin token devuelve 401 antes de validacion de body;
- ninguna consulta SQL ante 401/403;
- ruta desconocida bajo `/api/v1` exige token y con token devuelve 404;
- regresion completa del catalogo usando tokens validos.

Los tests de routers usaran un verificador inyectado determinista. Al menos una
suite de integracion usara `jose`, JWT reales y el JWKS efimero. Ningun test
contactara servicios externos ni `./data/training.db`.

## Docker y operacion

- La imagen no contiene claves privadas ni access tokens.
- Compose pasa las tres variables OAuth requeridas.
- El health check sigue funcionando sin contactar al Authorization Server.
- Una comprobacion de Docker verificara arranque con configuracion valida,
  health publico y rechazo 401 de `/api/v1` sin token.
- La integracion criptografica completa permanece automatizada con un JWKS local
  en tests; no se exige un proveedor real para cerrar la spec.

## Migracion de consumidores

README documentara el cambio incompatible y ejemplos con
`Authorization: Bearer`. Antes de desplegar, los consumidores existentes deben:

1. registrarse en el Authorization Server;
2. solicitar `AUTH_AUDIENCE` como recurso;
3. obtener los scopes minimos necesarios;
4. enviar el token solo en el header bearer;
5. renovar el token segun su expiracion.

No se mantendra acceso anonimo temporal. La futura spec MCP exigira un cliente de
maquina separado con audience REST y ambos scopes, y prohibira reenviar el token
del cliente MCP.

## Archivos previstos

```text
src/
  auth/
    access-token.ts
    middleware.ts
  config/index.ts
  app.ts
  server.ts
tests/
  auth/
  api/
```

La estructura es orientativa. Se combinaran archivos si el resultado es mas
claro y no se crearan capas vacias.

## Verificacion final

La spec solo puede completarse cuando:

- pasan las suites estrechas de configuracion, auth y API;
- `just lint`, `just test` y `just build` terminan correctamente;
- el proceso compilado carga `jose` con el build CommonJS actual;
- Docker arranca con configuracion OAuth explicita y conserva health publico;
- `/api/v1` queda cerrado sin token y cada operacion exige su scope;
- no existen bypasses, secretos versionados, migraciones, usuarios ni codigo MCP;
- README, `.env.example`, arquitectura y `AGENTS.md` reflejan el comportamiento
  verificado.
