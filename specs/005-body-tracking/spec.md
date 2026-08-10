---
status: draft
---

# 005 - Seguimiento corporal

## Objetivo

Registrar y consultar tomas de medidas corporales con multiples metricas,
permitiendo ampliar el catalogo de metricas sin añadir columnas ni exponer el
modelo relacional interno al consumidor.

## Alcance

- Catalogo global de tipos de metrica.
- Creacion atomica de una medicion con multiples valores.
- Consulta de detalle e historico por usuario.
- Adicion de nuevos tipos de metrica sin migrar el esquema.

## Requisitos funcionales

### Tipos de metrica

- Cada tipo contiene `id`, `code`, `name`, `unit` y `description`.
- `GET /api/v1/body-metric-types` lista los tipos disponibles.
- `POST /api/v1/body-metric-types` permite registrar un nuevo tipo global.
- El seed inicial incluye `weight_kg`, `bmi`, `body_fat_pct`,
  `muscle_mass_kg`, `water_pct`, `visceral_fat`, `bone_mass_kg`,
  `basal_metabolism_kcal` y `metabolic_age`.

### Registro de medicion

- `POST /api/v1/users/:userId/measurements` acepta fecha, fuente y notas
  opcionales y un objeto `metrics` cuyas claves son codigos del catalogo.
- La medicion y todos sus valores se guardan en una unica operacion atomica.
- El consumidor no envia ni recibe identificadores de las tablas de valores.
- Cada medicion contiene al menos una metrica.

### Consulta

- `GET /api/v1/users/:userId/measurements` devuelve el historico del usuario
  con las mediciones mas recientes primero.
- `GET /api/v1/users/:userId/measurements/:id` devuelve una medicion concreta
  solo si pertenece al usuario de la ruta.
- Las respuestas presentan las metricas como un objeto indexado por `code` e
  incluyen la informacion de unidad necesaria para interpretarlas.

## Reglas de negocio

- Cada medicion pertenece exactamente a un usuario existente.
- `code` es globalmente unico, inmutable, no vacio y usa `snake_case` en
  minusculas.
- Una medicion no puede contener dos valores del mismo tipo.
- Todos los codigos enviados deben existir; un codigo desconocido rechaza la
  operacion completa.
- Los valores son numeros finitos. No se aplican rangos genericos porque cada
  tipo de metrica puede tener un dominio diferente.
- `measuredAt` es obligatorio, incluye zona horaria y se normaliza a UTC.
- Se permiten varias mediciones del mismo usuario con la misma fecha.
- Las mediciones creadas son inmutables en esta spec.
- Crear un tipo nuevo cambia datos de catalogo, no el esquema de SQLite.

## Casos importantes

- Medicion con una metrica y con varias metricas.
- Rechazo de usuario inexistente.
- Rechazo atomico de un conjunto que contiene un codigo desconocido.
- Rechazo de valores no numericos o no finitos.
- Consulta de una medicion con sus metricas por codigo.
- Impedir que un usuario consulte una medicion de otro mediante la ruta.
- Alta y uso posterior de un tipo de metrica nuevo.
- Historico ordenado cuando existen varias fechas.

## Criterios de aceptacion

- Una peticion puede guardar peso, BMI y porcentaje de grasa como una sola toma.
- Si falla cualquier metrica, no se guarda ni la cabecera ni valores parciales.
- El par medicion y tipo de metrica es unico.
- El consumidor trabaja con codigos y no necesita conocer las tablas internas.
- El historico solo devuelve mediciones del usuario solicitado y esta ordenado
  por `measuredAt` descendente.
- Se puede crear y utilizar una metrica nueva sin migracion de base de datos.
- Los tests cubren atomicidad, unicidad, propiedad, codigos desconocidos,
  ampliacion del catalogo y validacion.

## Fuera de alcance

- Edicion o borrado de mediciones y tipos de metrica.
- Rangos clinicos, diagnosticos, objetivos y recomendaciones.
- Importacion desde basculas, wearables o Google Sheets.
- Graficas, agregaciones y estadisticas avanzadas.
- Autenticacion y permisos administrativos sobre el catalogo.
