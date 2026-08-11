---
status: completed
---

# 002 - Catalogo de ejercicios

## Objetivo

Gestionar un catalogo global y estable de ejercicios que pueda reutilizarse en
la planificacion y en los entrenamientos sin mezclar datos propios de esos
contextos.

## Alcance

- Persistencia de ejercicios.
- Creacion, consulta, actualizacion editorial y desactivacion.
- Validacion de body, parametros y query params.
- Consulta de ejercicios activos e inactivos.

## Requisitos funcionales

### Datos del ejercicio

Cada ejercicio contiene:

- `id`, `slug`, `name`, `movementPattern`, `equipment`;
- `description`, `techniqueNotes`, `safetyNotes`, `videoUrl`;
- `isActive`, `createdAt` y `updatedAt`.

`slug` y `name` son obligatorios. Los campos descriptivos son opcionales.

### Operaciones

- `POST /api/v1/exercises` crea un ejercicio activo salvo indicacion explicita.
- `GET /api/v1/exercises` lista el catalogo con orden determinista.
- La lista muestra solo ejercicios activos por defecto y permite solicitar
  tambien los inactivos mediante un query param validado.
- `GET /api/v1/exercises/:id` devuelve un ejercicio aunque este inactivo.
- `PATCH /api/v1/exercises/:id` actualiza solo los campos enviados, incluido
  `isActive`, pero no permite cambiar `slug`.
- No se ofrece borrado fisico.

## Reglas de negocio

- El catalogo es global y no pertenece a ningun usuario.
- `slug` es unico, estable, no vacio y usa un formato apto para URL.
- Cambiar la identidad semantica de un ejercicio requiere crear otro; `PATCH`
  se reserva para correcciones, documentacion y activacion.
- Un ejercicio no almacena pesos objetivo, series, repeticiones, duracion,
  descanso, RPE ni posicion en una rutina.
- Desactivar un ejercicio no altera ni oculta las referencias historicas.
- Un ejercicio inactivo no puede incorporarse a una nueva version de rutina ni
  registrarse como nueva sustitucion en un workout.
- Una URL de video, cuando exista, debe ser una URL HTTP o HTTPS valida.

## Validaciones y errores relevantes

- Los identificadores deben ser enteros positivos.
- Los textos obligatorios no pueden quedar vacios tras eliminar espacios
  exteriores.
- Un `slug` duplicado produce un conflicto y no crea datos parciales.
- Un ejercicio inexistente produce un error de recurso no encontrado.
- Un body, parametro o query invalido produce `VALIDATION_ERROR` con detalles.

## Casos importantes

- Alta con todos los campos y alta solo con los obligatorios.
- Rechazo de un `slug` repetido o invalido.
- Actualizacion parcial sin borrar campos omitidos.
- Desactivacion y reactivacion.
- Listado activo por defecto y listado que incluye inactivos.
- Consulta directa de un ejercicio inactivo.

## Criterios de aceptacion

- Se puede crear, listar, consultar y actualizar un ejercicio mediante la API.
- Dos ejercicios no pueden compartir `slug`.
- El `slug` no puede modificarse despues de crear el ejercicio.
- La desactivacion es reversible y no elimina el registro.
- Los datos de planificacion son rechazados o ignorados de forma no ambigua; no
  se persisten en el catalogo.
- Todas las entradas HTTP de estos endpoints estan validadas.
- Los tests cubren creacion, unicidad, actualizacion parcial, desactivacion y
  errores de validacion.

## Fuera de alcance

- Propiedad del catalogo por usuario.
- Rutinas, series objetivo y resultados de entrenamiento.
- Taxonomias normalizadas de equipamiento o patrones de movimiento.
- Busqueda avanzada, recomendaciones e importacion masiva.
- Borrado fisico de ejercicios.
