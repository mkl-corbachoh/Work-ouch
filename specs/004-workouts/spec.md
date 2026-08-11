---
status: completed
---

# 004 - Entrenamientos realizados

## Objetivo

Registrar una ejecucion real a partir de una version concreta de rutina,
incluyendo sustituciones, series, esfuerzo y molestias, sin modificar nunca la
planificacion original.

## Alcance

- Inicio, consulta, finalizacion y cancelacion de sesiones.
- Registro incremental e idempotente de resultados por ejercicio planificado.
- Ejercicio realmente realizado y posible sustitucion.
- Series reales por peso, repeticiones o duracion.
- Historico de entrenamientos por usuario.

## Requisitos funcionales

### Inicio

- `POST /api/v1/workouts` inicia una sesion para un usuario y una
  `routineVersionId` concretos.
- La version debe pertenecer a una rutina del mismo usuario.
- La sesion se crea con estado `in_progress` y una fecha de inicio valida.
- La respuesta incluye la sesion y la planificacion completa necesaria para que
  un cliente movil registre los resultados.

### Registro de resultados

- `PUT /api/v1/workouts/:id/exercises/:routineExerciseId` registra o reemplaza
  el resultado completo de un ejercicio planificado mientras la sesion esta en
  progreso.
- La peticion incluye el `exerciseId` realmente ejecutado, posicion real, notas
  opcionales y la lista completa de series realizadas.
- Repetir la misma peticion deja el mismo resultado y no duplica ejercicios ni
  series.
- Si el ejercicio real difiere del planificado, ambos quedan identificados en
  la respuesta y en el historico.

### Finalizacion y cancelacion

- `POST /api/v1/workouts/:id/complete` cambia una sesion en progreso a
  `completed`, registra el final, calcula la duracion y admite RPE global y
  notas finales.
- Se puede completar una sesion aunque existan ejercicios planificados sin
  resultado o series marcadas como no completadas.
- `POST /api/v1/workouts/:id/cancel` cambia una sesion en progreso a
  `cancelled` sin convertirla en completada.
- Una sesion completada o cancelada no acepta nuevos resultados ni cambios de
  estado incompatibles.

### Consulta

- `GET /api/v1/workouts` devuelve el historico del usuario indicado mediante un
  query param validado, con las sesiones mas recientes primero.
- La lista admite filtrar al menos por estado.
- `GET /api/v1/workouts/:id` devuelve datos de sesion, referencia a la version,
  planificacion y resultados reales.
- El detalle distingue explicitamente ejercicio planificado, ejercicio
  realizado y series reales.

## Reglas de negocio

- Cada sesion pertenece a un usuario existente.
- En esta spec toda sesion usa una version de rutina; las sesiones libres se
  posponen aunque el modelo permita una referencia nula en el futuro.
- `routineExerciseId` debe pertenecer exactamente a la version de la sesion.
- Hay como maximo un resultado por ejercicio planificado dentro de una sesion.
- El ejercicio realmente realizado debe existir y estar activo al registrarlo.
- Una sustitucion no altera el ejercicio del catalogo ni la version de rutina.
- `position` y `setNumber` son enteros positivos y no se repiten dentro de su
  ambito.
- Pesos, repeticiones y duraciones no pueden ser negativos.
- El RPE de serie y el RPE global, cuando existen, estan entre 1 y 10.
- `painLevel`, cuando existe, es un entero entre 0 y 10.
- Los datos de resultado pueden ser nulos cuando no aplican; `completed` indica
  si la serie se ejecuto.
- Las escrituras de un resultado completo son atomicas.
- Las fechas de finalizacion no pueden ser anteriores al inicio.

## Casos importantes

- Inicio con una version propia y rechazo de una version de otro usuario.
- Registro de un ejercicio realizado tal como estaba planificado.
- Sustitucion por otro ejercicio sin modificar la rutina.
- Varias series reales con distintos pesos, repeticiones y RPE.
- Registro de una serie temporal y de una serie no completada.
- Reintento idempotente desde un cliente movil.
- Finalizacion con ejercicios omitidos.
- Rechazo de cambios tras completar o cancelar.
- Consulta historica que muestra plan y ejecucion por separado.

## Criterios de aceptacion

- Iniciar un workout devuelve su plan y crea una sesion `in_progress`.
- Los resultados quedan asociados a la sesion y no escriben en ninguna tabla de
  planificacion.
- Una sustitucion conserva los identificadores planificado y realizado.
- Tres series ejecutadas producen tres resultados diferenciados y ordenados.
- Repetir el registro de un ejercicio no crea duplicados.
- Completar calcula una duracion coherente y bloquea posteriores escrituras.
- El historico se limita al usuario solicitado y se ordena por fecha.
- Los tests prueban integridad de propietario, sustituciones, atomicidad,
  estados y separacion entre planificacion y ejecucion.

## Fuera de alcance

- Entrenamientos libres sin version de rutina.
- Modificacion de rutinas desde un workout.
- Importacion del historico, estadisticas y recomendaciones.
- Temporizadores en tiempo real, WebSockets y sincronizacion offline completa.
- Reapertura de sesiones completadas o canceladas.
