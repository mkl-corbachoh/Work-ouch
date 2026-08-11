---
status: draft
---

# 006 - Autenticacion y autorizacion

## Objetivo

Proteger los endpoints funcionales de Training API como un OAuth Resource
Server, usando access tokens JWT emitidos por un Authorization Server externo y
scopes explicitos, antes de exponer operaciones de lectura y escritura mediante
un servidor MCP remoto.

## Contexto y dependencias

- Las specs 001 y 002 estan completadas; el unico dominio funcional disponible
  es el catalogo global de ejercicios.
- Actualmente `/api/v1` no exige credenciales. Completar esta spec introduce un
  cambio incompatible y deliberado para todos sus consumidores.
- `GET /health` permanece publico para operacion y orquestacion.
- El futuro adaptador MCP sera otra spec y no puede implementarse hasta completar
  esta.
- El Authorization Server, sus usuarios, consentimientos y emision de tokens no
  forman parte de Training API.

## Decisiones aprobadas

- Training API actua exclusivamente como OAuth Resource Server.
- El Authorization Server es externo y publica un JWKS.
- Los access tokens son JWT firmados asimetricamente con `RS256`.
- Todos los endpoints bajo `/api/v1` exigen autenticacion, sin bypass por
  entorno.
- El catalogo es global: los scopes autorizan capacidades globales y no
  propiedad sobre un ejercicio.
- La autenticacion se aplica tambien antes de resolver una ruta desconocida
  bajo `/api/v1`.

## Alcance

- Configuracion de issuer, audience y JWKS.
- Validacion criptografica y semantica de access tokens.
- Middleware comun de autenticacion y autorizacion por scope.
- Proteccion de las operaciones existentes del catalogo de ejercicios.
- Errores HTTP y headers OAuth consistentes.
- Publicacion de Protected Resource Metadata para la REST.
- Cache y rotacion de claves publicas sin aceptar tokens cuando el JWKS no puede
  verificarse.
- Pruebas unitarias, API y de integracion con claves y servidores locales.
- Migracion documental de los consumidores REST existentes.

## Limites de confianza

- El Authorization Server autentica al principal, concede scopes y emite el
  token.
- Training API verifica el token en cada peticion y decide si sus scopes permiten
  la operacion solicitada.
- `sub` identifica al principal OAuth solo para autorizacion y diagnostico. No se
  persiste ni se equipara con un usuario del dominio de entrenamiento.
- `client_id`, cuando exista, es metadato del principal OAuth y tampoco crea un
  usuario de dominio.
- El entorno de despliegue es una fuente de configuracion confiable; ningun dato
  de la peticion puede elegir issuer, audience o JWKS.

## Configuracion

La aplicacion requiere las siguientes variables sin defaults:

| Variable | Contrato |
|---|---|
| `AUTH_ISSUER` | URL absoluta y canonica del issuer esperado. |
| `AUTH_AUDIENCE` | URI absoluta que identifica `/api/v1` como recurso protegido. |
| `AUTH_JWKS_URL` | URL absoluta del JWKS publicado por el Authorization Server. |

- En produccion las tres URLs usan `https:`.
- En desarrollo y test se permite `http:` solo para `localhost`, `127.0.0.1` o
  `[::1]`.
- No se permiten credenciales embebidas, query ni fragment en estas URLs.
- `AUTH_AUDIENCE` termina en `/api/v1`, sin slash final, y se usa como valor
  exacto de audience y de `resource` en los metadatos.
- Una variable ausente, vacia o invalida impide arrancar antes de abrir SQLite o
  escuchar en un puerto.
- No existe `AUTH_DISABLED`, token maestro ni otro modo de omitir la validacion.

## Contrato del access token

La API solo acepta un JWT de acceso serializado como JWS compacto y enviado una
vez mediante:

```http
Authorization: Bearer <access-token>
```

No se aceptan tokens en query params, cookies, cuerpos ni headers alternativos.
Un header repetido, un esquema distinto de `Bearer` o un valor vacio se considera
invalido.

Para ser valido, el token debe cumplir todo lo siguiente:

- firma verificable con una clave publica actual del JWKS configurado;
- header `alg` exactamente `RS256`, nunca `none` ni un algoritmo simetrico;
- header `typ` igual a `at+jwt`, sin distinguir mayusculas;
- header `kid` no vacio para seleccionar y rotar la clave;
- claim `iss` exactamente igual a `AUTH_ISSUER`;
- claim `aud` string o array que contiene exactamente `AUTH_AUDIENCE`;
- claims numericos `exp` e `iat`, con `exp` vigente;
- claim `nbf`, si existe, ya vigente;
- claim `sub` como string no vacio;
- claim `scope` como string de scopes separados por espacios, sin aceptar arrays
  ni aliases propietarios.

Se admite una tolerancia fija de reloj de 30 segundos. No se aceptan JWT
cifrados, tokens opacos ni tokens validados solo mediante decodificacion.

## Autenticacion

- `GET /health` no exige token y no consulta el JWKS.
- `GET /.well-known/oauth-protected-resource/api/v1` es publico.
- Antes de parsear el body o ejecutar un router funcional, toda peticion bajo
  `/api/v1` valida su token.
- Una peticion sin token no ejecuta logica de dominio ni SQL.
- Una ruta inexistente bajo `/api/v1` devuelve primero 401 si no hay un token
  valido; con un token valido conserva el 404 comun.
- La imposibilidad temporal de obtener las claves no habilita ningun modo de
  fallo abierto.

## Autorizacion

Los scopes iniciales son:

| Scope | Operaciones autorizadas |
|---|---|
| `training:exercises:read` | `GET /api/v1/exercises` y `GET /api/v1/exercises/:id` |
| `training:exercises:write` | `POST /api/v1/exercises` y `PATCH /api/v1/exercises/:id` |

- Cada operacion comprueba su scope despues de autenticar y antes de acceder a
  la base.
- Los scopes son independientes: `write` no implica `read` ni `read` implica
  `write`.
- Scopes desconocidos no conceden permisos.
- Los futuros endpoints bajo `/api/v1` quedan autenticados por defecto, pero su
  spec propietaria debe definir scopes antes de exponerlos.
- El scope de escritura permite modificar el catalogo global completo y solo
  debe concederse a principales de confianza.

## Protected Resource Metadata

`GET /.well-known/oauth-protected-resource/api/v1` devuelve 200 y
`application/json` con:

```json
{
  "resource": "<AUTH_AUDIENCE>",
  "authorization_servers": ["<AUTH_ISSUER>"],
  "scopes_supported": [
    "training:exercises:read",
    "training:exercises:write"
  ],
  "bearer_methods_supported": ["header"]
}
```

La respuesta no contiene secretos, no requiere SQLite y no se deriva de headers
de la peticion. Otros metodos sobre esa ruta conservan el manejo comun de ruta
inexistente.

## Errores HTTP

Los errores mantienen el contrato comun `code`, `message`, `details` y no
exponen el token, claims, claves, URLs internas ni errores de la libreria JOSE.

| Condicion | Estado | Codigo |
|---|---:|---|
| Falta el header bearer | 401 | `AUTHENTICATION_REQUIRED` |
| Token o header invalido | 401 | `INVALID_ACCESS_TOKEN` |
| Scope requerido ausente | 403 | `INSUFFICIENT_SCOPE` |
| JWKS temporalmente inaccesible | 503 | `AUTHORIZATION_SERVICE_UNAVAILABLE` |

- Todo 401 incluye `WWW-Authenticate: Bearer` con `realm="work-ouch"` y
  `resource_metadata` apuntando al endpoint de metadatos.
- Un token invalido anade `error="invalid_token"` sin describir la causa.
- Un 403 anade `error="insufficient_scope"` y el parametro `scope` con el scope
  requerido.
- `INSUFFICIENT_SCOPE` puede incluir `details.requiredScopes`; los errores 401 y
  503 usan `details: null`.
- Una firma, claim, audience, issuer, algoritmo o `kid` invalido produce 401. Un
  fallo de red o timeout al actualizar el JWKS produce 503.

## JWKS, cache y rotacion

- Las claves publicas se obtienen solo de `AUTH_JWKS_URL`.
- La cache evita una peticion remota por cada token y tiene expiracion acotada.
- Un `kid` desconocido permite una actualizacion controlada del JWKS para admitir
  rotacion, con cooldown para impedir refresh ilimitado.
- Una clave retirada deja de aceptarse cuando expire la cache y se actualice el
  JWKS.
- Si no existe una clave compatible despues de actualizar, el token es invalido.
- Un JWKS malformado, excesivo o sin claves RSA utilizables nunca se acepta.
- El arranque valida la configuracion, pero no depende de que el Authorization
  Server este disponible. La primera peticion protegida obtiene las claves.

## Logging y privacidad

- No se registran el header `Authorization`, tokens, cookies, cuerpos completos,
  firmas, claims completos ni contenido del JWKS.
- Un fallo puede registrar categoria, estado, metodo, ruta, `sub` o `client_id`
  solo despues de una verificacion valida, y un identificador de correlacion.
- Nunca se registra `sub` de un token que no haya superado la firma y los claims.
- Las respuestas no distinguen firma incorrecta, expiracion, issuer, audience o
  clave desconocida.

## Migracion y compatibilidad

- Completar esta spec rompe los clientes que llamen `/api/v1` sin bearer token.
- No existe periodo de compatibilidad ni flag para conservar acceso anonimo.
- Antes del despliegue, cada consumidor obtiene del Authorization Server un
  cliente, audience y scopes adecuados.
- El futuro adaptador MCP usara un principal de maquina distinto, por ejemplo
  `mcp-gateway`, con audience REST y ambos scopes. Esta spec solo valida ese tipo
  de token; no implementa client credentials ni almacena client secrets.
- El token presentado por un cliente al futuro endpoint MCP tendra una audience
  MCP distinta y nunca se reenviara a esta REST.

## Casos importantes

- Health y metadatos accesibles sin token.
- Rechazo de ausencia de token y de esquemas bearer malformados.
- Aceptacion de un JWT `RS256` valido con issuer, audience y claims esperados.
- Rechazo de token expirado, prematuro, con issuer o audience incorrectos, sin
  `sub`, sin `scope`, con `typ` incorrecto o con algoritmo no permitido.
- Lectura autorizada sin escritura y escritura autorizada sin lectura.
- Rechazo por scope antes de ejecutar SQL.
- Rotacion de `kid`, cache de JWKS y control de refresh repetido.
- Fallo cerrado y sanitizado cuando el JWKS no esta disponible.
- Ruta desconocida bajo `/api/v1` autenticada antes del 404.
- Regresion de contratos funcionales usando tokens validos.

## Criterios de aceptacion

- Ningun endpoint bajo `/api/v1` responde funcionalmente sin un JWT valido.
- Firma, algoritmo, issuer, audience, tiempos, `sub`, `scope`, `typ` y `kid` se
  verifican antes de autorizar.
- Cada operacion de ejercicios exige exactamente el scope documentado.
- Los errores 401, 403 y 503 tienen body y `WWW-Authenticate` coherentes y no
  filtran informacion sensible.
- La cache reduce lecturas del JWKS y admite rotacion sin aceptar una clave no
  confiable.
- Health y Protected Resource Metadata permanecen publicos.
- Configuracion invalida impide el arranque y no existe bypass de autenticacion.
- Los tests usan claves y servidores locales, no un proveedor OAuth real ni la
  base de desarrollo.
- No se crean tablas, usuarios de dominio, sesiones, login ni emision de tokens.
- Lint, tests, build y la ejecucion Docker requerida terminan correctamente con
  configuracion OAuth explicita.

## Fuera de alcance

- Implementar o administrar un Authorization Server o proveedor de identidad.
- Login, logout, registro, consentimiento, sesiones, refresh tokens o revocacion.
- Introspeccion de tokens opacos.
- Persistencia de principales OAuth, roles o permisos por ejercicio.
- Endpoints de usuarios del dominio.
- Servidor MCP, tools, resources, prompts o transportes MCP.
- TLS, proxy inverso, CORS o despliegue del Authorization Server.
- Proteger `/health`.

## Referencias

- [RFC 6750 - Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750)
- [RFC 7517 - JSON Web Key](https://www.rfc-editor.org/rfc/rfc7517)
- [RFC 7519 - JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519)
- [RFC 8725 - JWT Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725)
- [RFC 9068 - JWT Profile for OAuth Access Tokens](https://www.rfc-editor.org/rfc/rfc9068)
- [RFC 9728 - OAuth Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728)
