# Tareas propuestas

Todas las tareas de implementacion permanecen sin marcar porque la spec esta en
`draft`. No debe ejecutarse ninguna hasta revision expresa. La seccion siguiente
es una checklist de decisiones para esa revision, no trabajo de implementacion.

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
- Aprobacion: cambiar `status: draft` solo despues de revisar expresamente
  `spec.md`, `plan.md` y `tasks.md`.

## 1. Fundacion bajo web

- [ ] Crear `web/` con React, Vite, TypeScript estricto y lockfile propio;
  verificar arranque y build minimo.
- [ ] Configurar lint, format y typecheck coherentes con el repositorio;
  verificarlos sobre el proyecto vacio.
- [ ] Configurar el proxy de desarrollo `/api/v1` al backend sin rewrite;
  verificar que una peticion conserva ruta y headers no sensibles.
- [ ] Documentar la topologia de mismo origen y preparar un smoke contra el
  entorno aprobado; verificar SPA fallback, callback y forwarding `/api/v1`
  antes de completar la spec, sin modificar el backend.
- [ ] Anadir recetas `just` web para install, dev, lint, typecheck, test y build;
  verificar ayuda y ejecucion no interactiva.
- [ ] Definir variables publicas tipadas y validacion de arranque; verificar que
  faltantes producen un error legible y que no existe ninguna secret key.

## 2. Sistema visual y accesibilidad base

- [ ] Convertir `.stitch/DESIGN.md` en custom properties semanticas de color,
  tipografia, espaciado, radio y motion; verificar contraste AA.
- [ ] Cargar Archivo Narrow, Inter y JetBrains Mono con fallback y estrategia de
  rendimiento; verificar que el contenido sigue legible si fallan.
- [ ] Implementar reset, landmarks, foco visible, safe areas y layout desde 320
  px; verificar teclado, zoom 200% y ausencia de scroll horizontal.
- [ ] Implementar controles base accesibles para boton, campo, numero, dialogo,
  estado y error; verificar nombres, foco y targets de 48 px.
- [ ] Implementar shell responsive publico/protegido y layout transaccional;
  verificar que barras fijas no ocultan foco ni contenido.

## 3. Cliente API

- [ ] Definir tipos del error comun y respuestas actuales sin importar codigo
  del backend; verificar fixtures representativos.
- [ ] Implementar cliente `fetch` con bearer, JSON, AbortSignal y redaccion de
  logs; verificar que nunca envia `userId` ni registra token.
- [ ] Implementar parseo y clasificacion de 400, 401, 404, 409, 5xx y red;
  verificar cada estado con tests.
- [ ] Implementar validadores de parametros canonicos y timestamps con zona;
  verificar limites y casos invalidos.
- [ ] Implementar funciones API por endpoint existente; verificar metodo, ruta,
  query y cuerpo exactos con tests de contrato cliente.

## 4. Autenticacion

- [ ] Crear el cliente externo de auth con URL y publishable key aprobadas;
  verificar que no consulta Data API ni expone secretos.
- [ ] Implementar `/login` para los proveedores/scopes aprobados; verificar
  `redirectTo` allowlisted y destino interno seguro.
- [ ] Implementar `/auth/callback` PKCE exactamente segun la decision aprobada;
  verificar exito, cancelacion, codigo ausente y exchange fallido.
- [ ] Implementar restauracion y suscripcion de sesion con cleanup; verificar
  loading inicial, refresh, multiples eventos y sign-out.
- [ ] Implementar bootstrap idempotente seguido de `/me`; verificar identidad
  nueva, existente y fallo sin bucle.
- [ ] Implementar guard de rutas y politica 401 aprobada; verificar que un
  recurso protegido nunca aparece antes de resolver sesion y usuario interno.
- [ ] Implementar inicio para cero, una o varias sesiones `in_progress`;
  verificar que nunca selecciona o descarta una sesion silenciosamente.
- [ ] Implementar `/account` de solo lectura y logout; verificar que no muestra
  email sintetico como email real.

## 5. Ejercicios

- [ ] Implementar `/exercises` con loading, empty, ready y error; verificar
  listado activo sin controles de mutacion.
- [ ] Implementar `/exercises/:exerciseId`; verificar inactivo historico,
  campos nulos, video condicional y 404.
- [ ] Implementar selector reutilizable de ejercicio activo para rutinas y
  sustituciones; verificar que no incluye inactivos.

## 6. Rutinas

- [ ] Implementar `/routines`; verificar orden recibido, estado vacio y ausencia
  de acciones PATCH/DELETE.
- [ ] Implementar detalle actual de rutina; verificar plan anidado, orden y
  ejercicio inactivo historico.
- [ ] Implementar modelo de formulario completo de rutina; verificar reglas de
  reps, duracion, posiciones, set numbers, RPE y nullables.
- [ ] Implementar `/routines/new`; verificar payload exacto de version 1, 201,
  validacion, ejercicio inexistente e inactivo.
- [ ] Implementar nueva version desde copia editable de la actual; verificar que
  envia el objeto plano completo y no muta la version leida.
- [ ] Implementar lectura historica directa por `versionNumber`; verificar 404
  de rutina y version sin inventar un listado de versiones.

## 7. Workouts

- [ ] Implementar inicio de workout desde el detalle de rutina; verificar
  `routineVersionId`, timestamp zoned y 201.
- [ ] Implementar `/workouts` con filtro de un estado; verificar los tres valores
  permitidos, sin paginacion ni combinaciones no soportadas.
- [ ] Implementar `/workouts/:workoutId` de solo lectura; verificar separacion de
  planning/results y acceso a reanudar solo si esta `in_progress`.
- [ ] Implementar reducer de borrador completo por ejercicio; verificar que
  anadir, editar o quitar un set serializa todos los restantes.
- [ ] Implementar `/workouts/:workoutId/active` segun Vertical; verificar carga,
  ejercicio actual/total, cambios dirty y navegacion protegida.
- [ ] Implementar controles de peso, reps, duracion, RPE, dolor, completado y
  notas conforme al contrato; verificar teclado, lector y targets tactiles.
- [ ] Implementar sustitucion de ejercicio; verificar que conserva planificado y
  envia `exerciseId` realizado activo.
- [ ] Implementar guardado PUT de resultado completo; verificar idempotencia,
  sets vacios deliberados y que ninguna omision accidental borra datos.
- [ ] Implementar temporizador de descanso solo local; verificar reduced motion,
  pausa/salto y que no se presenta como persistido.
- [ ] Implementar completar con confirmacion; verificar timestamp, RPE/notas,
  conflicto temporal y sesion terminal.
- [ ] Implementar cancelar enviando `{}` con confirmacion; verificar conflicto
  terminal y retorno al detalle.
- [ ] Verificar que no aparecen tiempo restante, foto de ejercicio, serie previa
  remota, workout libre ni acciones sobre sesiones terminales.

## 8. Mediciones

- [ ] Implementar `/measurements` con historico, loading, empty y error;
  verificar que usa exclusivamente `/api/v1/me/measurements`.
- [ ] Implementar formulario dinamico desde body metric types; verificar codes
  desconocidos, valores finitos, al menos una metrica y nullables.
- [ ] Implementar `/measurements/new`; verificar escritura atomica, 201 y que no
  ofrece crear tipos globales.
- [ ] Implementar detalle inmutable; verificar units nulas, 404 y ausencia de
  editar/borrar.

## 9. Verificacion y documentacion

- [ ] Ejecutar pruebas unitarias de serializacion, errores, auth y reducer de
  workout; corregir cualquier omision de contrato.
- [ ] Ejecutar pruebas de integracion de rutas para loading, empty, 400, 401,
  404, 409, 5xx y offline.
- [ ] Ejecutar E2E simulados de auth, rutina-workout y medicion; verificar que no
  contactan Supabase ni la base real.
- [ ] Ejecutar auditoria automatizada y manual de accesibilidad en login, builder,
  workout activo y medicion.
- [ ] Verificar responsive a 320 px, movil Stitch, tablet y escritorio, incluido
  teclado virtual y safe areas.
- [ ] Actualizar README con setup web, variables, proxy y mismo origen; corregir
  deliberadamente los contratos autenticados obsoletos que afecten al cliente.
- [ ] Actualizar `docs/architecture.md` con `web/`, numeracion aprobada y topologia
  de produccion, sin redefinir MCP ni endpoints de usuarios.
- [ ] Ejecutar las recetas finales de lint, typecheck, test y build de backend y
  web; no marcar la spec `completed` hasta que todas pasen.
