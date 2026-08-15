# Inventario de Stitch y correspondencia de rutas

## Proyecto inspeccionado

El MCP no devolvio un proyecto titulado literalmente `work-ouch!`. Devolvio un
unico proyecto accesible cuyo contenido y logotipo corresponden a Work-ouch:

- Titulo Stitch: `Diario de Entrenamiento`
- Resource: `projects/3057831273409740715`
- Project ID: `3057831273409740715`
- Tipo: `TEXT_TO_UI_PRO`
- Device type: `MOBILE`
- Visibilidad: `PRIVATE`
- Actualizado: `2026-08-15T18:12:30.160549Z`

`list_screens` devolvio tres pantallas visibles. `get_project` tambien informa
20 instancias de pantalla ocultas, tratadas como iteraciones historicas y no
como contrato vigente. No se asignan rutas a instancias ocultas.

## Pantallas visibles

### Entrenamiento Activo (Vertical)

- Screen ID: `fb90bf967e29413f9edc9079698fc0ee`
- Resource:
  `projects/3057831273409740715/screens/fb90bf967e29413f9edc9079698fc0ee`
- Captura: `projects/3057831273409740715/files/286781868838230125`
- HTML de referencia: `projects/3057831273409740715/files/17907309692880040357`
- Export: 780 x 2070, mobile.
- Instancia visible: 390 x 1033.
- Ruta web propuesta: `/workouts/:workoutId/active`.
- Rol: referencia canonica del flujo completo.

Elementos observados:

- Header con marca, menu y cuenta.
- Ejercicio actual/total, nombre, foto y accion tecnica.
- Lista vertical de series completada, activa y pendiente.
- Peso, reps, RPE, completed y anadir serie.
- Sustitucion de ejercicio.
- Temporizador de descanso local.
- Accion siguiente ejercicio.
- Navegacion Inicio, Rutinas, Historial y Evolucion.

Correspondencia API:

| Elemento | API o estado | Viabilidad |
|---|---|---|
| Workout y plan | `GET /api/v1/workouts/:id` | Soportado |
| Series del resultado | `results[].sets` | Soportado |
| Guardar ejercicio | `PUT /api/v1/workouts/:id/exercises/:routineExerciseId` | Soportado como reemplazo completo |
| Sustitucion | `GET /api/v1/exercises` + mismo PUT | Soportado |
| Notas de tecnica | `exercise.techniqueNotes` | Condicional; mostrar si existen |
| Video de tecnica | `exercise.videoUrl` | Condicional; ocultar la accion si es null |
| Anadir serie | Modificar borrador y PUT completo | Soportado |
| Descanso | Estado local | Soportado sin persistencia |
| Foto especifica | Ningun campo de imagen | No soportado |
| Navegacion Evolucion | Historico de measurements | Solo listado/detalle, no analitica |

### Entrenamiento Activo (Tactico)

- Screen ID: `3dcf00e1f6614063ad29ea5ba702ec1c`
- Resource:
  `projects/3057831273409740715/screens/3dcf00e1f6614063ad29ea5ba702ec1c`
- Captura: `projects/3057831273409740715/files/14027213232993609365`
- HTML de referencia: `projects/3057831273409740715/files/14030739604239536504`
- Export: 780 x 1792, mobile.
- Instancia visible: 390 x 892.
- Ruta web propuesta: `/workouts/:workoutId/active`.
- Rol: referencia de densidad y vision de varias series, no ruta independiente.

Elementos observados:

- Nombre de dia/rutina y ejercicios completados/total.
- "45 min restantes".
- Carrusel de ejercicios.
- Card con foto, grupo muscular y objetivo resumido.
- Tabla densa de sets con +/- para peso/reps, RPE y completed.
- Selector RPE 6-10, anadir serie y temporizador flotante.

Correspondencia API:

| Elemento | API o estado | Viabilidad |
|---|---|---|
| Nombre de rutina/version | `planning` | Soportado, sin concepto formal de "Dia 3" salvo nombre |
| Ejercicio actual/total | `planning.version.exercises` | Soportado en cliente |
| Tiempo restante | Ningun target de duracion | No soportado |
| Objetivo reps/sets | `routine_sets` en planning | Soportado, requiere representar objetivos mixtos |
| Tabla de resultado | `results[].sets` | Soportado |
| Foto/grupo muscular | Sin imagen; `movementPattern` no equivale siempre a grupo | No soportado tal cual |
| RPE 6-10 | API admite 1-10 | Parcial; la UI no puede restringir el dominio |
| Timer flotante | Estado local | Soportado sin persistencia |

### Entrenamiento Activo (Focus)

- Screen ID: `8c93b74f452e44dcaaadc9d7e19fce25`
- Resource:
  `projects/3057831273409740715/screens/8c93b74f452e44dcaaadc9d7e19fce25`
- Captura: `projects/3057831273409740715/files/12641569378304963665`
- HTML de referencia: `projects/3057831273409740715/files/3971661805830806293`
- Export: 780 x 1768, mobile.
- Instancia visible: 390 x 884.
- Ruta web propuesta: `/workouts/:workoutId/active`.
- Rol: referencia de control de una serie y accion dominante, no ruta
  independiente.

Elementos observados:

- Ejercicio actual/total y barra 65%.
- Una serie activa con peso y reps grandes, +/- y RPE 6-10.
- "Serie anterior".
- CTA completar serie.
- Overlay de descanso con +30s y saltar.

Correspondencia API:

| Elemento | API o estado | Viabilidad |
|---|---|---|
| Ejercicio actual/total | Planning + seleccion local | Soportado |
| Porcentaje 65% | Sin formula de dominio | Pendiente; usar actual/total hasta aprobar formula |
| Peso/reps/RPE/completed | Workout set | Soportado |
| Completar serie | PUT del resultado completo del ejercicio | Soportado con adaptacion, no endpoint por serie |
| Serie anterior del workout actual | Resultado cargado | Soportado si significa set previo actual |
| Serie anterior de otro workout | Sin consulta dedicada; requeriria N+1 | Fuera de alcance |
| Overlay descanso | Estado local | Soportado sin persistencia |
| Incremento fijo 1.25kg | No es regla del dominio | No asumir; decision de UX/config local pendiente |

## Correspondencia consolidada

Las tres pantallas son variantes del mismo estado transaccional:

```text
/workouts/:workoutId/active
  GET  /api/v1/workouts/:id
  GET  /api/v1/exercises                       # sustitucion
  PUT  /api/v1/workouts/:id/exercises/:routineExerciseId
  POST /api/v1/workouts/:id/complete
  POST /api/v1/workouts/:id/cancel
```

No existe correspondencia Stitch para login/callback, inicio, catalogo, builder
de rutinas, historico/detalle de workout, mediciones o cuenta. Esas rutas deben
usar el sistema visual extraido sin afirmar que Stitch definio su layout.

## Sistemas de diseno encontrados

| Nombre | Asset | Uso propuesto |
|---|---|---|
| Kinetic Dark | `assets/2230c943d38742fb86232f9a28bed91c` | Canonico; coincide con los HTML visibles |
| Kinetic Performance | `assets/9a93d55cced6411ba5132c8adac8c744` | Alternativo/historico; no mezclar sin revision |

## Tratamiento del codigo de referencia

Se recuperaron e inspeccionaron la captura y el HTML de las tres pantallas. El
HTML usa Tailwind por CDN, Google Fonts, Material Symbols, estilos y JavaScript
inline, datos fijos y, en dos pantallas, una viewport que impide zoom.

Por decision de esta spec:

- Los resource IDs anteriores permiten volver a recuperar los originales desde
  Stitch.
- El HTML no se versiona como codigo de aplicacion ni se copia a `web/`.
- Solo se extraen estructura visual, tokens y patrones de interaccion.
- React controlara estado y accesibilidad; CSS de produccion materializara
  `.stitch/DESIGN.md`.
- Los datos fijos, imagenes y scripts de demostracion no son requisitos
  funcionales.
