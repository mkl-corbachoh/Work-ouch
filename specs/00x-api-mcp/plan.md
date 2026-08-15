# Plan de implementacion propuesto: 00x - Adaptador MCP

## Condicion previa

Este plan no esta aprobado para implementacion. Solo puede revisarse despues de
cerrar las decisiones obligatorias de `spec.md`, especialmente la delegacion de
identidad entre las audiences MCP y REST.

La numeracion logica esperada es 009, pero se mantiene la carpeta
`specs/00x-api-mcp/` hasta que el usuario apruebe el identificador canonico.

## Enfoque

Se anadira un proceso MCP independiente compuesto por:

1. Un core sin transporte que registra una allowlist de herramientas.
2. Un cliente HTTP tipado para Training API.
3. Un proveedor de credencial REST por invocacion.
4. Un entrypoint local `stdio`.
5. Un entrypoint remoto Streamable HTTP protegido.

```text
src/mcp/
  config.ts
  contracts.ts
  rest-client.ts
  credentials.ts
  tools.ts
  server.ts
  stdio.ts
  http.ts
```

La estructura expresa responsabilidades y no obliga a crear archivos vacios ni
una cantidad fija de capas.

## Frontera con Training API

El modulo MCP solo alcanza el dominio mediante HTTP. No importa:

- `src/db/**`;
- `better-sqlite3`;
- migraciones o seeds;
- repositorios o servicios de ejercicios, rutinas, workouts y mediciones.

Una prueba arquitectonica inspeccionara imports de `src/mcp/**` para impedir
estas dependencias. Las pruebas de contrato pueden levantar la API con una base
temporal, pero el adaptador debe comunicarse con ella unicamente por HTTP.

El proceso MCP no se monta en `src/app.ts`, no comparte el puerto REST y no
recibe `DATABASE_PATH`.

## SDK y protocolo

Se usara el SDK oficial `@modelcontextprotocol/sdk`, fijado en
`package-lock.json`. La propuesta se ha contrastado con la documentacion de la
version 1.29.0; antes de implementar se vuelve a validar y se fija la version
exacta aprobada.

Se usaran:

- `McpServer` para registrar herramientas;
- Zod para `inputSchema` y `outputSchema`;
- `structuredContent` y una representacion textual JSON breve;
- `StdioServerTransport` para local;
- Streamable HTTP para remoto;
- autenticacion bearer y metadatos OAuth de recurso cuando correspondan;
- validacion explicita de Host y Origin.

La opcion inicial recomendada para HTTP es stateless, con
`sessionIdGenerator: undefined`, porque esta spec no necesita recursos,
notificaciones ni estado de servidor. Debe probarse con los clientes aprobados.
Si alguno exige sesiones, se revisara el diseno antes de implementar stateful.

## Contrato de herramientas

### Convenciones propuestas

- Nombres `snake_case` con prefijo `training_`.
- Inputs Zod estrictos.
- IDs enteros positivos hasta `Number.MAX_SAFE_INTEGER`.
- Timestamps ISO-8601 con zona.
- Ningun campo `userId`, bearer, header, URL o path libre.
- Outputs estructurados como `{ "data": ... }`.
- Errores funcionales como resultados de tool con `isError: true`.
- Anotaciones de solo lectura, idempotencia y efecto destructivo ajustadas a la
  semantica REST real.

### Allowlist propuesta

| Tool | REST |
|---|---|
| `training_bootstrap_current_user` | `POST /auth/bootstrap` |
| `training_get_current_user` | `GET /me` |
| `training_list_exercises` | `GET /exercises` |
| `training_get_exercise` | `GET /exercises/:id` |
| `training_list_routines` | `GET /routines` |
| `training_get_routine` | `GET /routines/:id` |
| `training_create_routine` | `POST /routines` |
| `training_create_routine_version` | `POST /routines/:id/versions` |
| `training_list_workouts` | `GET /workouts` |
| `training_get_workout` | `GET /workouts/:id` |
| `training_start_workout` | `POST /workouts` |
| `training_put_workout_exercise_result` | `PUT /workouts/:id/exercises/:routineExerciseId` |
| `training_complete_workout` | `POST /workouts/:id/complete` |
| `training_cancel_workout` | `POST /workouts/:id/cancel` |
| `training_list_body_metric_types` | `GET /body-metric-types` |
| `training_create_measurement` | `POST /me/measurements` |
| `training_list_measurements` | `GET /me/measurements` |
| `training_get_measurement` | `GET /me/measurements/:id` |

Un test de contrato compara `tools/list` con esta allowlist. Las mutaciones de
ejercicios y tipos de metrica permanecen excluidas hasta disponer de roles.

## Schemas

Los schemas MCP se mantienen junto al adaptador y reflejan el contrato JSON
ejecutable de la REST. No se importan schemas internos del servidor porque la
frontera HTTP debe seguir siendo explicita.

Se cubren expresamente:

- enteros seguros y posiciones canonicas;
- enums de estado;
- nullables y campos opcionales;
- timestamps con zona;
- versiones de rutina completas;
- resultado completo de ejercicio y todos sus sets;
- catalogo dinamico de metricas y mediciones atomicas.

Las respuestas REST exitosas se validan antes de construir
`structuredContent`. Una respuesta inesperada, no JSON o incompatible produce
un error interno redactado, no contenido sin validar.

## Cliente REST

El cliente utiliza paths fijos bajo `/api/v1` y recibe la credencial downstream
desde una abstraccion que no conocen las herramientas.

Requisitos:

- `MCP_REST_BASE_URL` validada al arrancar;
- HTTPS fuera de loopback o red interna aprobada;
- redirects deshabilitados para evitar fuga de bearer;
- timeout y cancelacion con `AbortSignal`;
- limite de tamano de respuesta;
- validacion de `Content-Type`;
- `Authorization` construido internamente;
- sin logs de cabeceras, argumentos o cuerpos sensibles;
- sin retries automaticos de escrituras;
- sin retry inicial de GET hasta aprobar una politica concreta.

Los errores REST estandar conservan estado, `code`, `message` y `details`. No se
devuelven stacks, HTML del proxy, URL interna, respuesta no validada ni detalles
criptograficos.

## Identidad y credenciales

### Invariante

```text
MCP_AUTH_AUDIENCE != AUTH_AUDIENCE
```

El proceso remoto rechaza configuraciones que pretendan usar la misma audience
o reenviar el bearer entrante.

### Local `stdio`

La opcion minima es recibir una credencial de audience REST mediante un
mecanismo local aprobado. Inicialmente puede ser una variable de entorno del
proceso, si se acepta que:

- no haya token en argumentos de tools;
- no se persista ni imprima;
- una expiracion exija renovar la credencial y reiniciar;
- no se almacenen refresh tokens ni se invente un login interactivo.

Si se exige renovacion automatica, debe aprobarse antes un flujo OAuth para
cliente nativo o device flow soportado por el proveedor.

### Remoto

El remoto valida el JWT entrante con configuracion propia de issuer, JWKS,
audience y scopes. Esa validacion no consulta SQLite.

Antes de llamar a REST usa el mecanismo downstream aprobado. Las alternativas
que deben evaluarse son:

1. Token exchange/on-behalf-of ofrecido por el Authorization Server. Es la
   opcion preferida si existe y conserva el subject, pero Supabase no documenta
   actualmente RFC 8693.
2. Assertion interna de corta duracion, firmada por el proceso MCP y verificada
   por una extension de autenticacion de Training API. Requiere cambios REST,
   anti-replay, rotacion de claves, audience REST y revision de seguridad.
3. Otro broker externo aprobado que emita un token REST para la misma identidad
   sin service account ni seleccion de `userId`.

Se rechazan:

- reenviar el token MCP;
- usar un service token para todas las personas;
- confiar en un `userId` de la tool;
- consultar `user_identities` o SQLite desde MCP;
- almacenar refresh tokens sin un flujo aprobado.

El token downstream se verifica antes de usarlo: issuer, audience REST,
expiracion y coincidencia de identidad. Una cache, si se aprueba, es solo en
memoria, acotada y expira antes que la credencial.

## Bootstrap

`training_bootstrap_current_user` se registra como herramienta explicita. El
adaptador no ejecuta bootstrap automaticamente al crear el servidor, listar
tools ni invocar otra herramienta.

Esta regla evita convertir una lectura en una escritura invisible y conserva
la semantica idempotente del endpoint existente.

## Transporte `stdio`

El entrypoint:

- crea una instancia del core;
- conecta `StdioServerTransport`;
- reserva stdout para MCP;
- envia logs redactados a stderr;
- maneja senales y cierre ordenado;
- no inicializa base de datos ni migraciones.

Las pruebas usan un cliente del SDK real para `initialize`, `tools/list`,
`tools/call` y cierre, y verifican byte a byte que stdout no contiene logs.

## Streamable HTTP

El servidor HTTP es independiente de Express REST. Antes del transporte aplica:

1. Limite de body y timeout.
2. Validacion de Host.
3. Validacion de Origin cuando esta presente.
4. Verificacion bearer y scopes MCP.
5. Limite de concurrencia/frecuencia.
6. Manejo Streamable HTTP.

Para clientes no navegador se permite ausencia de `Origin`. Un `Origin`
invalido, `null` o no permitido recibe `403`. No se activa CORS por defecto; si
se aprueba un cliente navegador, se usa una allowlist exacta sin wildcard.

Se publican los metadatos OAuth requeridos por los clientes aprobados y se
devuelve el challenge `WWW-Authenticate` adecuado sin implementar un
Authorization Server propio.

## Topologia remota

Propuesta pendiente de la spec 008 y del operador:

```text
Internet -- HTTPS --> reverse proxy
                         |
                         `-- /mcp --> proceso MCP privado
                                         |
                                         `-- Training API privada /api/v1
```

Puede usarse un origen dedicado si simplifica audience, metadatos, Host y
limites. Deben fijarse URL y path antes de implementar.

El contenedor MCP:

- ejecuta JavaScript compilado;
- no monta `/app/data`;
- no recibe `DATABASE_PATH`;
- escucha en un puerto interno distinto;
- solo accede al upstream REST fijo;
- no publica directamente Training API.

## Configuracion propuesta

### Comun

- `MCP_REST_BASE_URL`
- `MCP_REST_TIMEOUT_MS`
- `MCP_REST_MAX_RESPONSE_BYTES`
- `MCP_REQUEST_TIMEOUT_MS`
- `MCP_MAX_CONCURRENT_REQUESTS`

### Local

- Variable o mecanismo aprobado para la credencial REST.

### Remoto

- `MCP_HOST`
- `MCP_PORT`
- `MCP_PUBLIC_RESOURCE_URL`
- `MCP_ALLOWED_HOSTS`
- `MCP_ALLOWED_ORIGINS`
- `MCP_MAX_BODY_BYTES`
- `MCP_AUTH_ISSUER`
- `MCP_AUTH_AUDIENCE`
- `MCP_AUTH_JWKS_URL`
- `MCP_REQUIRED_SCOPES`

La configuracion downstream adicional depende del mecanismo aprobado. Los
secretos solo se inyectan en runtime mediante el gestor aprobado y nunca se
incluyen en `.env.example`, imagenes, bundles, logs o comandos versionados.

## Limites y observabilidad

Los valores exactos deben aprobarse antes del remoto:

- body y respuesta maximos;
- timeout MCP y REST;
- concurrencia por proceso;
- rate limit en proxy;
- cache y expiracion de credenciales;
- sesiones y TTL si se adopta stateful;
- keep-alive y cierre ordenado.

Los logs estructurados incluyen tool, transporte, resultado, duracion, codigo
REST publico y correlation ID. No incluyen argumentos/resultados completos,
tokens, claims, headers, notas ni mediciones.

## Pruebas

### Unitarias

- Configuracion valida e invalida.
- Audiences iguales rechazadas.
- Schemas estrictos y ausencia de `userId`/bearer/URL libre.
- Mapeo de entradas, salidas y errores.
- Redireccion bloqueada, limites, timeout, abort y redaccion.
- Validacion JWT MCP y credencial downstream.

### Contrato REST

Se levanta Training API con SQLite temporal y dos identidades. El adaptador solo
la usa por HTTP. Se verifica:

- allowlist exacta;
- payload MCP a REST sin campos extra;
- outputs contra contratos reales;
- UTC y nullables;
- ownership y 404 no revelador;
- conflictos 409;
- versionado inmutable;
- PUT completo de workout;
- estados terminales;
- atomicidad de mediciones;
- ausencia de mutaciones globales.

### Identidad

- Token MCP valido aceptado por el remoto.
- Token REST rechazado por MCP debido a audience.
- Token MCP rechazado si se presenta directamente a REST.
- Captura de upstream demuestra que el token MCP nunca se reenvia.
- Credencial downstream tiene audience REST y la misma identidad.
- Cambio de subject bloquea la llamada.
- Bootstrap explicito e idempotente.
- Tokens expirados, issuer/algoritmo incorrectos y scopes insuficientes.

### Transportes

- Cliente real por `stdio` y Streamable HTTP.
- stdout limpio.
- Host y Origin permitidos/rechazados.
- Cliente no navegador sin Origin.
- Challenge bearer y metadatos.
- Body, timeout, concurrencia y cierre.
- Comportamiento stateless o sesiones aprobadas.

### Empaquetado y smoke

- Build ejecuta JavaScript compilado.
- Contenedor MCP sin SQLite.
- Puertos internos no expuestos.
- Smoke remoto con audiences distintas y delegacion real.
- Inspeccion de logs y artefactos sin secretos.

## Rollout y rollback

No hay migraciones. El remoto se despliega primero sin trafico, se valida con
una cuenta controlada y solo despues se publica. El rollout comprueba por
separado audience MCP, audience REST, identidad, tools y limites.

El rollback retira ruta/proceso MCP y restaura proxy/configuracion anterior. No
modifica SQLite ni ejecuta `db-reset`.

## Archivos previstos

Nuevos:

- `src/mcp/**`
- `tests/mcp/**`

Modificados cuando se apruebe la implementacion:

- `package.json`
- `package-lock.json`
- `Justfile`
- `.env.example`
- `Dockerfile` y/o configuracion de contenedor aprobada
- configuracion de proxy/despliegue aprobada
- `README.md`
- `docs/architecture.md`

No se prevén migraciones ni cambios en repositorios de dominio. La alternativa
de assertion interna si requeriria cambios limitados al modulo de autenticacion
REST y debe aprobarse expresamente antes de ampliar esta lista.

## Verificacion propuesta

Se anadiran recipes especificas, cuyos nombres finales se aprobaran con la
implementacion, para ejecutar MCP local, MCP HTTP, tests y smoke. La verificacion
final debe incluir al menos:

```text
just test tests/mcp
just test tests/api/authentication.test.ts
just typecheck
just lint
just build
just docker-build
just verify
```

Los smokes con proveedor real usan configuracion externa y conservan solo
evidencia redactada.

## Bloqueos de aprobacion

1. Falta confirmar 009 como numero canonico.
2. Falta elegir y demostrar la delegacion MCP a REST con el mismo subject.
3. Falta decidir entrega/renovacion de credencial local.
4. Falta fijar SDK, protocolo, clientes y modo stateless/stateful.
5. Faltan URL, TLS, proxy, Host, Origin, scopes y limites exactos.
6. La spec 008 mantiene decisiones de despliegue relacionadas en `draft`.
7. Las mutaciones globales no tienen politica de roles y permanecen excluidas.
