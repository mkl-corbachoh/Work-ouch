---
status: draft
---

# 00x - Adaptador MCP de Training API

## Estado, numeracion y condicion de avance

Esta especificacion define el adaptador MCP previsto para la Training API. La
carpeta `specs/00x-api-mcp/` se conserva porque es la carpeta creada para este
proposito, pero su identificador es provisional: `docs/architecture.md` y las
specs 007 y 008 reservan el numero 009 para MCP.

Antes de aprobar esta spec debe decidirse si su identificador canonico sera 009
y actualizar las referencias historicas que todavia mencionan MCP como spec
007. La carpeta no se renombra como parte de esta propuesta.

La spec permanece en `draft`. No puede implementarse hasta aprobar las
decisiones obligatorias, revisar `plan.md` y aceptar `tasks.md`.

## Objetivo

Permitir que clientes MCP autorizados consulten y ejecuten las capacidades ya
disponibles en Training API mediante un adaptador que:

- expone herramientas MCP con contratos explicitos;
- soporta ejecucion local por `stdio`;
- soporta acceso remoto mediante Streamable HTTP protegido;
- delega todas las operaciones de dominio en la REST `/api/v1`;
- conserva identidad, ownership, validacion, errores e invariantes de la API;
- no accede directamente a SQLite ni a modulos internos de dominio.

La autenticacion OAuth/JWT implementada por la spec 006 satisface el requisito
previo de identidad externa, pero no resuelve por si sola la delegacion entre
dos recursos con audiences diferentes. Esa delegacion es una decision
bloqueante de esta spec.

## Arquitectura funcional

```text
Cliente MCP
    |
    |-- stdio local
    |       o
    `-- Streamable HTTP remoto + bearer para audience MCP
                    |
                    v
             Adaptador MCP
                    |
                    | bearer distinto para audience REST
                    v
             Training API /api/v1
                    |
                    v
                  SQLite
```

Training API sigue siendo la autoridad unica para:

- validar las entradas de dominio;
- resolver la identidad externa al usuario interno;
- aplicar ownership y ocultar recursos ajenos;
- ejecutar transacciones;
- mantener versiones de rutina inmutables;
- separar planificacion y ejecucion;
- preservar datos historicos.

El adaptador no importa conexiones, repositorios, migraciones ni servicios de
dominio y no ejecuta SQL.

## Alcance

Esta spec cubre:

- un proceso MCP independiente del proceso REST;
- una allowlist estable de herramientas sobre endpoints REST existentes;
- contratos estrictos de entrada, salida y error;
- transporte local `stdio`;
- transporte remoto Streamable HTTP;
- autenticacion del recurso MCP remoto;
- delegacion segura a la audience REST conservando la identidad;
- protecciones de Host, Origin, limites y redaccion de logs;
- pruebas unitarias, de contrato, aislamiento, transportes y empaquetado.

## Fuera de alcance

- Endpoints REST, tablas, migraciones o capacidades de dominio nuevas.
- Acceso directo del adaptador a SQLite o a repositorios de Training API.
- Un Authorization Server propio.
- Reenvio del token MCP a Training API.
- Seleccion de propietario mediante `userId`, impersonation, API keys, service
  accounts, organizaciones, cuentas compartidas o RBAC.
- Crear o modificar ejercicios y crear tipos globales de metrica mientras no
  exista una politica de autorizacion administrativa aprobada.
- Borrado de rutinas, listado de todas sus versiones, edicion de versiones,
  workouts libres, reapertura de sesiones, edicion o borrado de mediciones,
  analitica, recomendaciones, importacion, exportacion o paginacion.
- Recursos, prompts, sampling o almacenamiento de conversaciones MCP.
- Publicar el transporte remoto antes de aprobar su identidad downstream,
  topologia, TLS, scopes, allowlists y limites operativos.

## Principios obligatorios

1. Cada herramienta corresponde a una operacion REST existente.
2. El adaptador no combina llamadas para simular una capacidad inexistente.
3. Ninguna herramienta acepta paths, URLs, cabeceras o bearer tokens
   arbitrarios.
4. Ninguna herramienta acepta `userId` como selector de propiedad.
5. Una version de rutina nunca se edita; se crea una version completa nueva.
6. Un resultado de ejercicio de workout se guarda completo, incluidos todos
   sus sets visibles.
7. Las sesiones terminales no se reabren ni modifican.
8. Una medicion y todos sus valores se crean atomicamente por la REST.
9. Los recursos ajenos no se distinguen de los inexistentes.
10. Un token emitido para la audience MCP nunca se envia a Training API.

## Identidad, autenticacion y delegacion

### Transporte remoto

El adaptador remoto actua como OAuth Resource Server. Antes de inicializar una
sesion MCP, listar herramientas o invocarlas debe validar un access token con:

- firma y algoritmo aprobados;
- issuer configurado;
- audience MCP exacta;
- expiracion;
- subject estable;
- scopes MCP requeridos.

El token de audience MCP solo autentica al cliente ante el adaptador. Para
llamar a `/api/v1`, el adaptador debe obtener una credencial distinta que:

- sea valida para la audience REST configurada por `AUTH_AUDIENCE`;
- represente la misma identidad externa estable;
- no permita que el usuario A opere como el usuario B;
- tenga expiracion y scopes limitados;
- se mantenga fuera de argumentos, respuestas y logs MCP.

Si no puede obtenerse o verificarse esa credencial conservando la identidad, la
invocacion se rechaza antes de llamar a Training API.

La documentacion actual de Supabase Auth permite actuar como OAuth 2.1
Authorization Server y emitir JWT para clientes MCP, pero no documenta RFC 8693
Token Exchange ni un flujo on-behalf-of para convertir un token de audience MCP
en otro de audience REST. Por ello el mecanismo downstream debe demostrarse y
aprobarse; no se presupone que exista.

### Transporte local

`stdio` no concede acceso anonimo. Antes de invocar la REST debe disponer de una
credencial valida para la audience REST y para el usuario local. Debe decidirse
como se entrega y renueva sin pasarla como argumento de herramienta, imprimirla
o persistirla sin autorizacion.

### Bootstrap

El bootstrap es una herramienta explicita que delega en
`POST /api/v1/auth/bootstrap`. No se ejecuta silenciosamente como efecto
secundario de una lectura o escritura diferente.

Una identidad aun no registrada solo puede realizar bootstrap y, despues de
completarlo, consultar el usuario actual y usar el resto de herramientas.

## Herramientas MCP

Los nombres definitivos se fijaran en el plan aprobado. La primera version
expone exclusivamente estas capacidades:

| Capacidad MCP | Operacion REST | Regla principal |
|---|---|---|
| Bootstrap del usuario actual | `POST /api/v1/auth/bootstrap` | Explicito e idempotente. |
| Consultar usuario actual | `GET /api/v1/me` | Sin `userId`. |
| Listar ejercicios | `GET /api/v1/exercises` | Solo filtros REST existentes. |
| Consultar ejercicio | `GET /api/v1/exercises/:id` | Admite lectura historica inactiva. |
| Listar rutinas propias | `GET /api/v1/routines` | Ownership derivado del bearer REST. |
| Consultar rutina propia | `GET /api/v1/routines/:id` | `versionNumber` opcional. |
| Crear rutina | `POST /api/v1/routines` | Rutina y version 1 completas. |
| Crear version de rutina | `POST /api/v1/routines/:id/versions` | Definicion completa, no patch. |
| Listar workouts propios | `GET /api/v1/workouts` | Solo filtro `status` soportado. |
| Consultar workout propio | `GET /api/v1/workouts/:id` | Plan y ejecucion separados. |
| Iniciar workout | `POST /api/v1/workouts` | Version sellada propia. |
| Guardar resultado de ejercicio | `PUT /api/v1/workouts/:id/exercises/:routineExerciseId` | Reemplazo completo de resultado y sets. |
| Completar workout | `POST /api/v1/workouts/:id/complete` | Transicion terminal. |
| Cancelar workout | `POST /api/v1/workouts/:id/cancel` | Transicion terminal. |
| Listar tipos de metrica | `GET /api/v1/body-metric-types` | Catalogo global de lectura. |
| Crear medicion propia | `POST /api/v1/me/measurements` | Agregado atomico. |
| Listar mediciones propias | `GET /api/v1/me/measurements` | Sin paginacion inventada. |
| Consultar medicion propia | `GET /api/v1/me/measurements/:id` | No revela recursos ajenos. |

No se exponen inicialmente:

- `POST /api/v1/exercises`;
- `PATCH /api/v1/exercises/:id`;
- `POST /api/v1/body-metric-types`;
- rutas de desarrollo que acepten `userId`;
- una herramienta REST generica.

## Contratos de entrada y salida

- Los schemas MCP reflejan los campos, tipos, nulabilidad y enums de la REST.
- Los objetos de entrada son estrictos y rechazan campos desconocidos.
- Los IDs son enteros positivos seguros para JavaScript.
- Los timestamps de entrada son ISO-8601 con zona horaria.
- El adaptador no infiere, completa, elimina ni transforma datos de dominio.
- `null`, campo omitido, cero y array vacio conservan su semantica REST.
- Las respuestas satisfactorias conservan el body REST sin inventar analitica,
  recomendaciones o campos de dominio.
- Los errores REST controlados conservan `code`, `message` y `details` en un
  resultado de herramienta marcado como error.
- No se exponen stacks, SQL, URLs internas, claims, tokens, cabeceras ni errores
  criptograficos.

El adaptador no reintenta automaticamente mutaciones. Un timeout o cierre
ambiguo no se interpreta como fracaso seguro de una operacion no idempotente.

## Transporte `stdio`

- El cliente inicia el proceso MCP y se comunica por stdin/stdout.
- stdout contiene exclusivamente mensajes MCP validos.
- Logs y diagnosticos van a stderr y estan redactados.
- La credencial REST no se acepta como argumento de herramienta.
- La expiracion o ausencia de credencial produce un error recuperable sin
  revelar el token.

## Streamable HTTP remoto

- El endpoint exige autenticacion antes de procesar MCP.
- La publicacion usa HTTPS bajo una topologia aprobada.
- `Host` se valida contra una allowlist explicita.
- Un `Origin` presente debe ser valido y estar permitido; un origen invalido,
  `null` o no permitido recibe `403`.
- La ausencia de `Origin` sigue permitida para clientes no navegador.
- No se habilita CORS general ni wildcard.
- Una sesion MCP, si se habilita, queda vinculada a una identidad y no puede
  reutilizarse por otra.
- Se aplican limites aprobados de body, respuesta, timeout, concurrencia y
  frecuencia antes de publicarlo.

## Observabilidad y datos sensibles

Se pueden registrar nombre de herramienta, transporte, resultado, duracion,
codigo REST publico y un identificador de correlacion no sensible.

No se registran argumentos ni respuestas completos, `Authorization`, tokens,
claims completos, notas, mediciones corporales, errores criptograficos internos
ni URLs que contengan credenciales o codigos OAuth.

## Compatibilidad

- No hay migraciones ni cambios intencionales de contratos REST.
- Retirar el adaptador no modifica datos ni requiere rollback de SQLite.
- Los nombres y schemas de herramientas son contrato publico una vez
  desplegados y cualquier cambio incompatible exige versionado o coordinacion.
- El transporte remoto amplia la superficie publica y requiere revision de
  seguridad y operacion independiente de la API.

## Criterios de aceptacion

### Frontera arquitectonica

- El proceso MCP no abre SQLite, ejecuta SQL ni importa DB o repositorios.
- Toda operacion de dominio se realiza por HTTP contra paths REST fijos.
- No se crean endpoints, tablas, migraciones ni capacidades de dominio.
- La allowlist publicada contiene exactamente las herramientas aprobadas.

### Identidad y aislamiento

- Un token remoto ausente, invalido, expirado, con issuer incorrecto, audience
  incorrecta o scopes insuficientes no puede usar MCP.
- El token de audience MCP nunca aparece en una peticion a Training API.
- Training API recibe una credencial de audience REST para la misma identidad.
- Si cambia el subject o no puede probarse la delegacion, no se llama a REST.
- Ninguna herramienta acepta `userId`, bearer, header, path o URL arbitrarios.
- Dos identidades solo pueden consultar y modificar sus propios recursos.
- Un recurso ajeno mantiene el mismo comportamiento no revelador que en REST.
- Bootstrap es explicito, idempotente y no se ejecuta desde otras herramientas.

### Semantica de dominio

- Crear una rutina produce su version 1 completa y versionar no modifica
  versiones anteriores.
- Guardar un resultado de workout envia el resultado completo y no omite sets
  accidentalmente.
- Un workout terminal rechaza nuevas escrituras.
- Crear una medicion guarda todos sus valores o ninguno.
- Lecturas historicas e inactivas conservan el comportamiento REST.
- No existen herramientas de mutacion para catalogos globales.

### Transportes y operacion

- Un cliente MCP real completa `initialize`, `tools/list` y `tools/call` por
  `stdio` y Streamable HTTP.
- stdout de `stdio` no contiene logs y ninguna salida contiene credenciales.
- El remoto valida bearer, Host y Origin y opera unicamente bajo HTTPS en el
  entorno representativo.
- Las sesiones, si existen, no cruzan identidades.
- Los limites cancelan tambien la llamada REST downstream.
- Las mutaciones no se reintentan automaticamente.
- Build, typecheck, lint, tests, empaquetado y smoke aprobados pasan mediante
  recetas `just`.

## Decisiones obligatorias

La spec no puede aprobarse hasta registrar:

1. Numero y nombre canonicos de la spec.
2. Version exacta del SDK MCP y versiones/clientes del protocolo soportados.
3. Herramientas, nombres y schemas publicos definitivos.
4. Mecanismo remoto para obtener un token REST del mismo subject sin reenviar el
   token MCP; debe demostrarse con el Authorization Server real.
5. Mecanismo local para entregar y renovar la credencial REST.
6. Audience y scopes separados de MCP y REST.
7. Streamable HTTP stateless o stateful; si es stateful, almacenamiento, TTL,
   afinidad y limites de sesiones.
8. URL publica, path, proxy, TLS y conectividad privada a Training API.
9. Allowlists exactas de Host y Origin y politica CORS.
10. Limites de body, respuesta, timeout, concurrencia, frecuencia y cache de
    credenciales.
11. Retencion, redaccion, auditoria y respuesta ante abuso.
12. Coordinacion con las decisiones de despliegue todavia abiertas en spec 008.

## Fuentes tecnicas revisadas

- MCP TypeScript SDK 1.29.0: `McpServer`, schemas Zod, `StdioServerTransport`,
  Streamable HTTP, autenticacion bearer y validacion de Host/Origin.
- Supabase Auth OAuth 2.1 Server: Authorization Code con PKCE, JWT bearer y
  clientes MCP/third-party.
- La documentacion de Supabase revisada no ofrece un flujo RFC 8693/OBO; esta
  ausencia mantiene bloqueada la delegacion remota hasta elegir y demostrar un
  mecanismo compatible.
