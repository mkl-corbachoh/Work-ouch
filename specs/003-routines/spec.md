---
status: draft
---

# 003 - Rutinas versionadas

## Objetivo

Permitir que un usuario planifique rutinas mediante versiones inmutables,
manteniendo ejercicios, orden y series objetivo sin comprometer el historico.

## Alcance

- Rutinas propiedad de un usuario.
- Versiones numeradas y una unica version actual.
- Ejercicios ordenados dentro de cada version.
- Series planificadas por repeticiones o tiempo.
- Creacion y consulta de la estructura completa de una rutina.

## Requisitos funcionales

### Creacion de rutina

- `POST /api/v1/routines` crea una rutina y su version 1 en una sola operacion.
- La peticion identifica al usuario propietario e incluye nombre, descripcion
  opcional y la definicion completa de la primera version.
- Una nueva rutina queda activa y su version 1 queda marcada como actual.
- La operacion es atomica: no puede quedar una rutina sin su version inicial ni
  una version parcialmente creada.

### Creacion de version

- `POST /api/v1/routines/:id/versions` recibe una definicion completa de la
  nueva planificacion, no cambios parciales sobre la version anterior.
- El servidor asigna el siguiente `versionNumber` de forma incremental.
- La nueva version se convierte en actual y la anterior deja de serlo en la
  misma operacion.
- Las versiones anteriores y todo su contenido permanecen sin cambios.

### Consulta

- `GET /api/v1/routines` lista rutinas de un usuario indicado mediante un query
  param validado.
- `GET /api/v1/routines/:id` devuelve la rutina con su version actual,
  ejercicios, datos del catalogo y series, ordenados por posicion y numero.
- El detalle permite solicitar una version concreta para consultar el
  historico.
- La API expone operaciones de rutina y version, no CRUD directo de
  `routine_exercises` o `routine_sets`.

## Reglas de negocio

- Una rutina pertenece exactamente a un usuario existente.
- El par formado por rutina y numero de version es unico.
- Cada rutina tiene exactamente una version actual una vez creada.
- Una version creada es inmutable. Cualquier cambio de ejercicio, orden,
  descanso, objetivo o serie requiere otra version.
- Una version contiene al menos un ejercicio y cada ejercicio al menos una
  serie planificada.
- `position` es un entero positivo y unico dentro de la version.
- Un ejercicio puede aparecer mas de una vez en una version si ocupa posiciones
  distintas.
- Solo ejercicios activos pueden incorporarse a una version nueva.
- `setNumber` es un entero positivo y unico dentro del ejercicio planificado.
- `restSeconds`, pesos y duraciones no pueden ser negativos.
- Las repeticiones se expresan como rango completo: minimo y maximo aparecen
  juntos, son positivos y el minimo no supera al maximo.
- Cada serie define al menos un objetivo de repeticiones o de duracion; el peso
  puede ser nulo para ejercicios sin carga externa.
- El RPE objetivo, cuando existe, esta entre 1 y 10.
- El RPE de una serie prevalece sobre el RPE general del ejercicio; si es nulo,
  hereda el del ejercicio.
- `setType`, cuando existe, usa uno de los valores iniciales `warmup`, `work` o
  `backoff`.

## Casos importantes

- Creacion atomica de rutina, version, ejercicios y series.
- Rechazo de usuario o ejercicio inexistente.
- Rechazo de ejercicio inactivo.
- Rechazo de posiciones o numeros de serie repetidos.
- Series por repeticiones, por tiempo y con peso opcional.
- Creacion de una segunda version y cambio atomico de version actual.
- Consulta de la version actual y de una version historica.
- Fallo a mitad de una creacion sin datos parciales.

## Criterios de aceptacion

- Una rutina se crea con version 1 y una planificacion completa valida.
- Crear versiones sucesivas produce numeros 2, 3 y siguientes sin duplicados.
- Nunca hay mas de una version actual por rutina.
- Crear una version no cambia ningun dato de versiones anteriores.
- El detalle tiene la forma rutina, version, ejercicios y series y conserva el
  orden planificado.
- Las restricciones de posiciones, series, rangos, tiempos y RPE se validan.
- No existen endpoints publicos para manipular por separado las tablas internas.
- Los tests prueban versionado, atomicidad, integridad y lectura completa.

## Fuera de alcance

- Resultados de entrenamientos realizados.
- Edicion de una version existente.
- Borrado de rutinas o versiones.
- Calendarios, programacion semanal y asignacion por entrenador.
- Calculo automatico de cargas o progresiones.
