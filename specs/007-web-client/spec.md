---
status: draft
---

# 007 - Cliente web

## Estado y condicion de avance

Esta propuesta permanece en `draft`. No autoriza implementar el frontend ni
modificar el backend. Debe revisarse expresamente y cambiarse de estado antes de
ejecutar una tarea de implementacion de `tasks.md`. Las puertas de decision de
ese documento son una checklist de revision, no tareas de implementacion.

La numeracion tambien requiere aprobacion: `docs/architecture.md` reservaba
conceptualmente la spec 007 para MCP. Aprobar esta spec implica reservar 007
para el cliente web y renumerar la futura spec MCP, o renumerar esta propuesta.

## Objetivo

Definir un cliente web mobile-first para las capacidades ya implementadas por
la Training API. El cliente se ubicara bajo `web/`, usara React, Vite y
TypeScript estricto, y tomara las pantallas de Stitch como referencia visual,
no como codigo de produccion.

## Alcance funcional

### Autenticacion y sesion

- Iniciar autenticacion mediante el Authorization Server externo configurado.
- Procesar el retorno OAuth/OIDC del navegador y recuperar una sesion valida.
- Enviar el access token como `Authorization: Bearer <token>` a la Training API.
- Ejecutar `POST /api/v1/auth/bootstrap` tras obtener una identidad externa para
  crear o recuperar el usuario interno.
- Resolver el usuario actual mediante `GET /api/v1/me` antes de mostrar rutas
  protegidas.
- Restaurar una sesion existente al recargar y cerrar la sesion en el proveedor.
- No almacenar contrasenas, client secrets, service-role keys ni refresh tokens
  gestionados manualmente por Work-ouch.

La pantalla de acceso no puede cerrarse como implementable hasta resolver las
decisiones OAuth/OIDC enumeradas en esta spec.

### Inicio

- Mostrar acceso a rutinas, entrenamiento, historial, medidas y ejercicios.
- Detectar cero, una o varias sesiones `in_progress` mediante el listado de
  workouts y ofrecer reanudar la elegida sin asumir unicidad.
- Mostrar estados vacios y accesos a operaciones existentes, sin inventar un
  endpoint de dashboard, recomendaciones ni agregados de analitica.

### Ejercicios

- Listar ejercicios activos.
- Consultar el detalle de un ejercicio, incluido uno inactivo cuando se navega
  desde una referencia historica.
- Mostrar `techniqueNotes`, seguridad y video de forma independiente cuando
  existan; la accion de video solo aparece si `videoUrl` no es nulo.
- No ofrecer crear, editar, activar o desactivar ejercicios mientras no exista
  una politica aprobada de roles para mutaciones del catalogo global.

### Rutinas

- Listar las rutinas del usuario autenticado.
- Consultar la version actual completa.
- Crear una rutina con su version 1 completa.
- Crear una version nueva enviando siempre la definicion completa exigida por la
  API; no presentar la operacion como edicion de una version existente.
- Consultar una version historica cuando el usuario conoce su numero desde una
  referencia disponible.
- No ofrecer renombrar, desactivar, borrar o restaurar rutinas porque no existen
  endpoints para esas operaciones.
- No ofrecer un listado de versiones historicas porque la API solo admite
  consulta directa por `versionNumber`.

### Workouts

- Iniciar un workout desde una version sellada de una rutina propia.
- Reanudar una sesion `in_progress`.
- Mostrar planificacion y resultados en ramas diferenciadas.
- Registrar o reemplazar el resultado completo de un ejercicio planificado.
- Permitir sustitucion por otro ejercicio activo conservando visualmente el
  ejercicio planificado y el realizado.
- Completar o cancelar una sesion en curso con confirmacion explicita.
- Listar el historial y filtrar por un unico estado soportado por la API.
- Consultar el detalle de una sesion terminal como solo lectura.
- No ofrecer workouts libres, reapertura, borrado ni edicion de sesiones
  terminales.

### Seguimiento corporal

- Listar el catalogo de tipos de metrica.
- Crear una medicion inmutable con una o mas metricas existentes.
- Listar y consultar mediciones propias.
- No ofrecer editar o borrar mediciones.
- No ofrecer crear tipos globales de metrica mientras no exista una politica de
  roles aprobada para esa mutacion global.
- No presentar analitica clinica, recomendaciones ni inferencias.

### Cuenta

- Mostrar de forma no editable la identidad interna disponible en `/me`.
- Permitir cerrar la sesion externa.
- No ofrecer actualizar perfil, email, display name, identidades o eliminar la
  cuenta porque no existen endpoints para ello.
- No usar `email` de `/me` como email visible hasta resolver su semantica: el
  backend actual devuelve un valor sintetico en el primer bootstrap.

## Flujos principales

### Primera autenticacion

1. El visitante abre una ruta protegida y se conserva solo un destino interno
   seguro.
2. El cliente inicia OAuth/OIDC con PKCE en el proveedor aprobado.
3. El proveedor vuelve a `/auth/callback`.
4. El cliente intercambia el codigo por una sesion y obtiene el access token.
5. El cliente llama a `POST /api/v1/auth/bootstrap` con el bearer token.
6. El cliente llama a `GET /api/v1/me` y entra en la ruta protegida original.
7. Un fallo muestra una accion de reintento o retorno a login sin exponer token,
   claims ni detalles criptograficos.

### Crear o versionar una rutina

1. El cliente carga ejercicios activos.
2. El usuario construye una version completa con al menos un ejercicio y una
   serie valida por ejercicio.
3. El formulario valida posiciones, numeros de serie, rangos, duracion y RPE.
4. Para una rutina nueva se envia `POST /api/v1/routines`.
5. Para cambiar planificacion se envia la definicion completa a
   `POST /api/v1/routines/:id/versions`.
6. Un conflicto por ejercicio inactivo conserva el borrador local y permite
   seleccionar otro ejercicio o recargar el catalogo.

### Ejecutar un workout

1. El usuario abre una rutina y comienza una version concreta con
   `POST /api/v1/workouts`.
2. El cliente navega a `/workouts/:workoutId/active` y carga el detalle exacto.
3. Los cambios de series se mantienen como borrador del resultado del ejercicio
   actual.
4. Al confirmar una serie o avanzar, el cliente envia por `PUT` el resultado
   completo del ejercicio. Los sets omitidos serian borrados por la API, por lo
   que nunca se enviara una actualizacion parcial accidental.
5. El descanso es un temporizador local y no se presenta como dato persistido.
6. Completar o cancelar requiere confirmacion y conduce al detalle de solo
   lectura.

### Registrar una medicion

1. El cliente carga `body-metric-types`.
2. El usuario elige una o mas metricas y proporciona valores finitos.
3. El cliente envia una sola operacion atomica a `/api/v1/me/measurements`.
4. El resultado conduce al detalle inmutable.

## Rutas del cliente

Estas son rutas del SPA, no endpoints nuevos del backend.

| Ruta web | Acceso | Proposito | Referencia Stitch |
|---|---|---|---|
| `/login` | Publico | Inicio de autenticacion externa | Sin pantalla |
| `/auth/callback` | Publico transaccional | Retorno PKCE, bootstrap y redireccion | Sin pantalla |
| `/` | Protegido | Inicio y reanudacion de workout activo | Solo shell inferido de la navegacion |
| `/exercises` | Protegido | Catalogo activo | Sin pantalla |
| `/exercises/:exerciseId` | Protegido | Detalle de ejercicio | Fragmentos de las tres pantallas |
| `/routines` | Protegido | Listado de rutinas | Navegacion de Vertical |
| `/routines/new` | Protegido | Rutina y version 1 completas | Sin pantalla |
| `/routines/:routineId` | Protegido | Detalle de version actual | Sin pantalla |
| `/routines/:routineId?versionNumber=n` | Protegido | Detalle historico directo | Sin pantalla |
| `/routines/:routineId/versions/new` | Protegido | Nueva version completa | Sin pantalla |
| `/workouts` | Protegido | Historico y filtro por estado | Navegacion de Vertical |
| `/workouts/:workoutId` | Protegido | Detalle de solo lectura o acceso a reanudar | Sin pantalla |
| `/workouts/:workoutId/active` | Protegido | Ejecucion transaccional | Vertical, Tactico y Focus |
| `/measurements` | Protegido | Historico corporal | Navegacion "Evolucion", sin analitica |
| `/measurements/new` | Protegido | Nueva medicion atomica | Sin pantalla |
| `/measurements/:measurementId` | Protegido | Detalle inmutable | Sin pantalla |
| `/account` | Protegido | Identidad de solo lectura y logout | Icono de perfil de Vertical/Focus |
| `*` | Segun sesion | Pagina no encontrada | Sin pantalla |

## Estados de interfaz

Todas las rutas de datos deben definir:

- `initializing`: se restaura la sesion; no se muestra contenido protegido.
- `unauthenticated`: se redirige a login conservando solo una ruta interna.
- `bootstrapping`: identidad externa valida, usuario interno aun no resuelto.
- `loading`: esqueleto con dimensiones estables y nombre accesible.
- `empty`: explica la ausencia de datos y solo ofrece una accion soportada.
- `ready`: datos completos de la API.
- `submitting`: evita dobles envios sin ocultar el progreso.
- `validationError`: errores asociados a campos y resumen enfocable.
- `authenticationError`: limpia el estado protegido y vuelve al flujo de sesion.
- `notFound`: no distingue entre recurso inexistente y ajeno.
- `conflict`: traduce conflictos de estado o catalogo sin asumir exito.
- `unexpectedError`: mensaje recuperable con correlacion local no sensible.
- `offline`: informa que no puede guardar; no promete sincronizacion posterior.

El workout activo tambien distingue `clean`, `dirty`, `saving`, `saved` y
`terminal`. Navegar con cambios `dirty` requiere confirmacion. Una respuesta
terminal o `WORKOUT_NOT_IN_PROGRESS` bloquea nuevos cambios y recarga el detalle.

## Adaptacion de Stitch a la API real

- Las tres pantallas representan alternativas para la misma ruta de workout
  activo; no son tres funcionalidades ni tres rutas distintas.
- `Entrenamiento Activo (Vertical)` es la referencia canonica por mostrar el
  flujo completo. Tactico y Focus aportan patrones para densidad y control de una
  serie.
- "Completar serie" se implementaria como confirmacion local seguida de un PUT
  del resultado completo del ejercicio, no como un endpoint por serie.
- El temporizador de descanso es estado efimero del cliente.
- "Tiempo restante" no puede mostrarse: la API no almacena duracion objetivo.
- La foto especifica del ejercicio no puede obtenerse: `Exercise` no tiene
  campo de imagen. No se sustituira por datos inventados.
- "Serie anterior" de otro entrenamiento no tiene una consulta eficiente ni un
  endpoint dedicado; queda fuera de esta spec.
- Las notas de tecnica se muestran cuando existan; la accion "Ver tecnica" de
  video solo se muestra cuando `videoUrl` no es nulo.
- El porcentaje de progreso solo puede definirse en el cliente a partir de la
  planificacion y resultados actuales. La formula exacta debe aprobarse antes de
  implementarlo; hasta entonces se mostrara progreso discreto, por ejemplo
  ejercicio actual de total.
- La navegacion "Evolucion" conducira al historico de mediciones, no a graficas o
  recomendaciones no especificadas.

## Responsive y mobile-first

- La base se disena desde 320 CSS px sin scroll horizontal de pagina.
- En movil se usa una columna y acciones principales al alcance del pulgar.
- En tablet y escritorio se aprovecha el espacio para separar navegacion,
  planificacion y formulario, sin convertir una pantalla transaccional en un
  dashboard no soportado.
- El contenido de lectura mantiene una anchura legible; formularios y controles
  numericos no se estiran sin limite.
- Las barras fijas respetan `env(safe-area-inset-*)` y no ocultan contenido,
  foco ni mensajes.

## Accesibilidad

- Objetivo WCAG 2.2 nivel AA para los flujos incluidos.
- HTML semantico, landmarks, titulos jerarquicos y nombres accesibles.
- Navegacion completa por teclado, foco visible y orden de foco equivalente al
  orden visual.
- Objetivos tactiles de al menos 48 por 48 CSS px en el workout activo.
- Contraste AA verificado para texto, controles, estados y foco; el verde lima
  no se usa como unico indicador.
- Inputs con label persistente, instrucciones, unidad y errores asociados con
  `aria-describedby`.
- Los botones de incremento indican operacion, magnitud, campo y serie.
- Cambios de guardado y errores se anuncian en una region viva moderada. El
  temporizador no anuncia cada segundo.
- Dialogos con titulo, descripcion, foco inicial deliberado, captura de foco y
  retorno al disparador.
- Se respeta `prefers-reduced-motion`; animaciones y glow no son necesarios para
  comprender estado.
- No se deshabilita el zoom del navegador ni se copia
  `user-scalable=no`/`maximum-scale=1` del HTML de Stitch.
- Graficas, si una spec futura las incorpora, requeriran alternativa textual;
  no forman parte de esta spec.

## Decisiones pendientes de autenticacion OAuth/OIDC

Antes de aprobar la implementacion deben decidirse:

1. Confirmar Supabase Auth como cliente inicial y el paquete/version permitidos.
2. Proveedores habilitados y scopes solicitados; la API solo exige un JWT
   compatible, pero la UX de login depende de esta lista.
3. Confirmar Authorization Code con PKCE para el SPA.
4. URL publica, Site URL y allowlist exacta de redirects para desarrollo,
   previews y produccion.
5. Ruta de callback y politica de `next` limitada a rutas relativas internas.
6. Variables publicas del cliente: URL de Supabase y publishable key; nunca una
   secret key o service-role key.
7. Si el callback intercambia el codigo explicitamente o delega la deteccion al
   cliente Supabase, evitando hacer ambas cosas.
8. Politica de persistencia, renovacion, expiracion, multiples pestanas y fallo
   de refresh.
9. Estrategia ante `401`: renovacion unica y reintento seguro o logout, sin
   bucles ni bootstrap indiscriminado.
10. Alcance de logout local/global y destino posterior.
11. Semantica visible de `email` y `displayName` tras el bootstrap actual.
12. Audiencia exacta que el cliente debe solicitar y compatibilidad con
    `AUTH_AUDIENCE` del backend.

## Criterios de aceptacion

- La spec sigue en `draft` hasta una revision expresa.
- La numeracion 007 frente a la futura spec MCP se resuelve antes de aprobarla.
- El frontend reside completamente bajo `web/` y no altera contratos del
  backend.
- El cliente usa React, Vite y TypeScript estricto y funciona desde 320 px hasta
  escritorio.
- Desarrollo solicita rutas relativas `/api/v1` y Vite las proxifica a la API
  sin reescribir el prefijo.
- La documentacion de despliegue recomienda y verifica en un smoke representativo
  el mismo origen para SPA y `/api/v1`; no depende de CORS que el backend actual
  no implementa.
- Toda llamada funcional incluye el bearer token vigente y nunca envia
  `userId` como selector de propiedad.
- Primera sesion ejecuta bootstrap y `/me`; sesiones posteriores siguen siendo
  idempotentes.
- Los flujos de rutinas, workouts y mediciones solo usan los endpoints
  documentados en `plan.md`.
- Un PUT de resultado de ejercicio envia la coleccion completa visible y no
  borra sets por omision accidental.
- No se muestran acciones de escritura para catalogos globales sin una politica
  de roles aprobada.
- Las tres referencias de Stitch se documentan con IDs y se tratan como
  referencia visual, sin copiar su HTML, Tailwind CDN o JavaScript inline.
- Cada ruta tiene loading, empty, error y success cuando corresponda.
- Los errores 400, 401, 404 y 409 tienen comportamientos comprobados.
- Los flujos criticos de teclado, foco, zoom, contraste y lector de pantalla
  cumplen la seccion de accesibilidad.
- Build, typecheck, lint, tests unitarios/integracion y pruebas E2E criticas del
  cliente pasan mediante recetas `just` aprobadas.
- Ninguna prueba del frontend usa la base de desarrollo real ni requiere datos
  productivos.

## Fuera de alcance

- Cambios de backend, endpoints, migraciones, CORS o contratos REST.
- MCP y cualquier transporte MCP.
- Registro por contrasena, recuperacion, MFA, vinculacion de identidades o un
  identity provider propio.
- Edicion de perfil o administracion de usuarios.
- Roles administrativos no existentes.
- CRUD no soportado de rutinas, workouts, mediciones o tipos de metrica.
- Workouts libres, offline-first, sincronizacion diferida o WebSockets.
- Analitica dedicada, recomendaciones, objetivos, calendario, nutricion,
  importacion, exportacion o integraciones externas.
- Paginacion, busqueda o filtros que la API no ofrece.
- Copiar el HTML generado por Stitch como componentes de produccion.
