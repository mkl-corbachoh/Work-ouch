# Tareas propuestas

La spec fue reabierta para la corrección final de estado terminal y completada el
2026-08-15 tras renovar su evidencia.

## Puertas de decision para revision

- Decision: resolver si cliente web conserva el numero 007 o si se renumera
  frente a la futura spec MCP y actualizar `docs/architecture.md` durante la
  revision, antes de aprobar implementacion.
- Decision: aprobar proveedor OAuth/OIDC, Authorization Code con PKCE, scopes,
  audience, URLs de callback, allowlists y politica de `next`, contrastados con
  la configuracion real sin registrar secretos.
- Decision: aprobar persistencia/refresh/logout y comportamiento unico ante 401,
  incluidos sesion expirada, revocada y bootstrap pendiente.
- Decision: resolver la semantica visible de `email` y `displayName` contra la
  respuesta real de `/me`.
- Decision: aprobar Vertical como composicion canonica y Kinetic Dark como
  sistema visual; omitir porcentaje o definir su formula.
- Decision: confirmar que mutaciones de ejercicios y metric types quedan sin UI
  hasta una spec de roles.
- Decision: aprobar la topologia de mismo origen y el entorno representativo
  donde se hara el smoke de SPA fallback y forwarding `/api/v1`.
- Aprobacion: `status: approved` registrada el 2026-08-15; `status: completed`
  se registra después de pasar todos los checks requeridos.

## 1. Fundacion bajo web

- [x] Crear `web/` con React, Vite, TypeScript estricto y lockfile propio;
  verificar arranque y build minimo.
- [x] Configurar lint, format y typecheck coherentes con el repositorio;
  verificarlos sobre el proyecto vacio.
- [x] Configurar el proxy de desarrollo `/api/v1` al backend sin rewrite;
  verificar que una peticion conserva ruta y headers no sensibles.
- [x] Documentar la topologia de mismo origen y verificar la configuracion
  representativa de SPA fallback, callback y forwarding `/api/v1`; el smoke
  contra produccion real pertenece a la futura spec 008.
- [x] Anadir recetas `just` web para install, dev, lint, typecheck, test y build;
  verificar ayuda y ejecucion no interactiva.
- [x] Definir variables publicas tipadas y validacion de arranque; verificar que
  faltantes producen un error legible y que no existe ninguna secret key.

## 2. Sistema visual y accesibilidad base

- [x] Convertir `.stitch/DESIGN.md` en custom properties semanticas de color,
  tipografia, espaciado, radio y motion; verificar contraste AA.
- [x] Cargar Archivo Narrow, Inter y JetBrains Mono con fallback y estrategia de
  rendimiento; verificar que el contenido sigue legible si fallan.
- [x] Implementar reset, landmarks, foco visible, safe areas y layout desde 320
  px; verificar teclado, zoom 200% y ausencia de scroll horizontal.
- [x] Implementar controles base accesibles para boton, campo, numero, dialogo,
  estado y error; verificar nombres, foco y targets de 48 px.
- [x] Implementar shell responsive publico/protegido y layout transaccional;
  verificar que barras fijas no ocultan foco ni contenido.

## 3. Cliente API

- [x] Definir tipos del error comun y respuestas actuales sin importar codigo
  del backend; verificar fixtures representativos.
- [x] Implementar cliente `fetch` con bearer, JSON, AbortSignal y redaccion de
  logs; verificar que nunca envia `userId` ni registra token.
- [x] Implementar parseo y clasificacion de 400, 401, 404, 409, 5xx y red;
  verificar cada estado con tests.
- [x] Implementar validadores de parametros canonicos y timestamps con zona;
  verificar limites y casos invalidos.
- [x] Implementar funciones API por endpoint existente; verificar metodo, ruta,
  query y cuerpo exactos con tests de contrato cliente.

## 4. Autenticacion

- [x] Crear el cliente externo de auth con URL y publishable key aprobadas;
  verificar que no consulta Data API ni expone secretos.
- [x] Implementar `/login` para los proveedores/scopes aprobados; verificar
  `redirectTo` allowlisted y destino interno seguro.
- [x] Implementar `/auth/callback` PKCE exactamente segun la decision aprobada;
  verificar exito, cancelacion, codigo ausente y exchange fallido.
- [x] Implementar restauracion y suscripcion de sesion con cleanup; verificar
  loading inicial, refresh, multiples eventos y sign-out.
- [x] Implementar bootstrap idempotente seguido de `/me`; verificar identidad
  nueva, existente y fallo sin bucle.
- [x] Implementar guard de rutas y politica 401 aprobada; verificar que un
  recurso protegido nunca aparece antes de resolver sesion y usuario interno.
- [x] Implementar inicio para cero, una o varias sesiones `in_progress`;
  verificar que nunca selecciona o descarta una sesion silenciosamente.
- [x] Implementar `/account` de solo lectura y logout; verificar que no muestra
  email sintetico como email real.

## 5. Ejercicios

- [x] Implementar `/exercises` con loading, empty, ready y error; verificar
  listado activo sin controles de mutacion.
- [x] Implementar `/exercises/:exerciseId`; verificar inactivo historico,
  campos nulos, video condicional y 404.
- [x] Implementar selector reutilizable de ejercicio activo para rutinas y
  sustituciones; verificar que no incluye inactivos.

## 6. Rutinas

- [x] Implementar `/routines`; verificar orden recibido, estado vacio y ausencia
  de acciones PATCH/DELETE.
- [x] Implementar detalle actual de rutina; verificar plan anidado, orden y
  ejercicio inactivo historico.
- [x] Implementar modelo de formulario completo de rutina; verificar reglas de
  reps, duracion, posiciones, set numbers, RPE y nullables.
- [x] Implementar `/routines/new`; verificar payload exacto de version 1, 201,
  validacion, ejercicio inexistente e inactivo.
- [x] Implementar nueva version desde copia editable de la actual; verificar que
  envia el objeto plano completo y no muta la version leida.
- [x] Implementar lectura historica directa por `versionNumber`; verificar 404
  de rutina y version sin inventar un listado de versiones.

## 7. Workouts

- [x] Implementar inicio de workout desde el detalle de rutina; verificar
  `routineVersionId`, timestamp zoned y 201.
- [x] Implementar `/workouts` con filtro de un estado; verificar los tres valores
  permitidos, sin paginacion ni combinaciones no soportadas.
- [x] Implementar `/workouts/:workoutId` de solo lectura; verificar separacion de
  planning/results y acceso a reanudar solo si esta `in_progress`.
- [x] Implementar reducer de borrador completo por ejercicio; verificar que
  anadir, editar o quitar un set serializa todos los restantes.
- [x] Implementar `/workouts/:workoutId/active` segun Vertical; verificar carga,
  ejercicio actual/total, cambios dirty y navegacion protegida.
- [x] Implementar controles de peso, reps, duracion, RPE, dolor, completado y
  notas conforme al contrato; verificar teclado, lector y targets tactiles.
- [x] Implementar sustitucion de ejercicio; verificar que conserva planificado y
  envia `exerciseId` realizado activo.
- [x] Implementar guardado PUT de resultado completo; verificar idempotencia,
  sets vacios deliberados y que ninguna omision accidental borra datos.
- [x] Implementar temporizador de descanso solo local; verificar reduced motion,
  pausa/salto y que no se presenta como persistido.
- [x] Implementar completar con confirmacion; verificar timestamp, RPE/notas,
  conflicto temporal y sesion terminal.
- [x] Implementar cancelar enviando `{}` con confirmacion; verificar conflicto
  terminal y retorno al detalle.
- [x] Verificar que no aparecen tiempo restante, foto de ejercicio, serie previa
  remota, workout libre ni acciones sobre sesiones terminales.

## 8. Mediciones

- [x] Implementar `/measurements` con historico, loading, empty y error;
  verificar que usa exclusivamente `/api/v1/me/measurements`.
- [x] Implementar formulario dinamico desde body metric types; verificar codes
  desconocidos, valores finitos, al menos una metrica y nullables.
- [x] Implementar `/measurements/new`; verificar escritura atomica, 201 y que no
  ofrece crear tipos globales.
- [x] Implementar detalle inmutable; verificar units nulas, 404 y ausencia de
  editar/borrar.

## 9. Verificacion y documentacion

- [x] Ejecutar pruebas unitarias de serializacion, errores, auth y reducer de
  workout; corregir cualquier omision de contrato.
- [x] Ejecutar pruebas de integracion de rutas para loading, empty, 400, 401,
  404, 409, 5xx y offline.
- [x] Ejecutar E2E simulados de auth, rutina-workout y medicion; verificar que no
  contactan Supabase ni la base real.
- [x] Ejecutar auditoria automatizada de accesibilidad y keyboard/focus checks en
  login, builder,
  workout activo y medicion.
- [x] Verificar responsive a 320 px, movil Stitch, tablet y escritorio, incluido
  teclado virtual y safe areas.
- [x] Actualizar README con setup web, variables, proxy y mismo origen; corregir
  deliberadamente los contratos autenticados obsoletos que afecten al cliente.
- [x] Actualizar `docs/architecture.md` con `web/`, numeracion aprobada y topologia
  de produccion, sin redefinir MCP ni endpoints de usuarios.
- [x] Ejecutar las recetas finales de lint, typecheck, test y build de backend y
  web; todas las recetas finales pasan.
