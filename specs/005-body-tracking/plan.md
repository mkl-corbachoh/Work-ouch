# Plan de implementacion: 005 - Seguimiento corporal

## Objetivo

Implementar un catalogo global extensible de tipos de metrica y mediciones
corporales inmutables propiedad de un usuario. Cada medicion se crea con uno o
mas valores atomicos, se consulta por `code` y no expone identificadores
internos de valores ni tipos dentro de una medicion.

La tabla `users` de 003 proporciona la FK. `userId` aisla propietario, pero no
autentica. El seed inicial es explicito y no crea usuarios.

## Validacion

Todos los schemas Zod son estrictos:

- IDs de params: decimal canonico positivo hasta `Number.MAX_SAFE_INTEGER`.
- Timestamps: ISO-8601 valido con zona, normalizado a UTC con milisegundos.
- Queries desconocidas/repetidas y campos desconocidos se rechazan.
- Opcionales omitidos se normalizan a `null`; vacio no equivale a `null`.

Tipo de metrica:

- `code`: trim, 1-100, `^[a-z0-9]+(?:_[a-z0-9]+)*$`.
- `name`: trim, 1-200.
- `unit`: `null` o trim, 1-100.
- `description`: `null` o trim, 1-5000.

Medicion:

- `measuredAt` obligatorio y normalizado UTC.
- `source`: `null` o trim, 1-200.
- `notes`: `null` o trim, 1-5000.
- `metrics`: objeto con al menos una clave valida de tipo y valores numericos
  finitos. Sus claves deben llegar ya en forma canonica y no se recortan ni
  transforman, evitando colisiones entre claves distintas del JSON.
- Se aceptan enteros, fracciones, cero y negativos; no se aplican rangos
  genericos o clinicos.

JSON solo conserva una propiedad efectiva por clave; SQLite mantiene UNIQUE por
medicion/tipo como defensa final.

## Contrato HTTP

### `GET /api/v1/body-metric-types`

- Sin query params.
- Array sin envelope, ordenado por `code ASC, id ASC`.
- Cada elemento: `id`, `code`, `name`, `unit`, `description`.

### `POST /api/v1/body-metric-types`

- Crea un tipo global y devuelve 201.
- Code existente: 409 `BODY_METRIC_TYPE_CODE_CONFLICT`.
- Code es identidad estable, unica, case-sensitive e inmutable.
- No existen PATCH ni DELETE.

### `POST /api/v1/users/:userId/measurements`

- `userId` procede solo del path y debe existir.
- Resuelve todos los codes dentro de la transaccion antes de persistir.
- Code desconocido: 404 `BODY_METRIC_TYPE_NOT_FOUND`, sin datos parciales.
- Crea cabecera y valores atomicamente y devuelve 201.
- Respuesta incluye `id`, `userId`, fechas, source/notas y:

```json
{
  "metrics": {
    "weight_kg": { "value": 72.4, "unit": "kg" },
    "bmi": { "value": 22.7, "unit": null }
  }
}
```

- Las claves se ordenan por code para JSON determinista.
- No se exponen IDs de `body_measurement_values` ni `metric_type_id`.
- Peticiones identicas o misma fecha crean mediciones distintas.

### `GET /api/v1/users/:userId/measurements`

- Sin query params; usuario inexistente: 404 `USER_NOT_FOUND`.
- Array completo sin paginacion, solo del usuario.
- Orden `measuredAt DESC, id DESC`.

### `GET /api/v1/users/:userId/measurements/:id`

- Devuelve solo si medicion y usuario coinciden.
- Inexistente o ajena: 404 `BODY_MEASUREMENT_NOT_FOUND`.
- No revela si una medicion ajena existe ni comprueba primero el usuario.

Todos los errores usan `code`, `message`, `details`; errores de dominio usan
`details: null`.

## Migracion `0005_create_body_tracking.sql`

Migracion aditiva con tres tablas `STRICT`, FKs `NO ACTION` y sin modificar
0001-0004.

Todos los IDs/FKs usan `ANY` y checks de clase, integralidad, positividad y
`Number.MAX_SAFE_INTEGER`. El repositorio asigna IDs explicitamente dentro de
transacciones `IMMEDIATE` y detecta agotamiento antes de `MAX(id) + 1`.

### `body_metric_types`

- ID seguro, `code TEXT COLLATE BINARY UNIQUE`, nombre, unidad y descripcion.
- Checks SQL de snake_case, trim y longitudes.
- Triggers inmovilizan ID/code, prohiben DELETE y bloquean INSERT OR REPLACE por
  ID o code antes de que elimine filas.
- Metadatos no tienen endpoint de edicion en 005.

### `body_measurements`

- ID, `user_id`, `measured_at`, source, notas y `created_at`.
- FK real a users, timestamps UTC canonicos y checks de texto.
- No hay unique por usuario/fecha.
- Trigger exige que ya exista al menos un valor asociado al insertar cabecera.
- Guards contra OR REPLACE, UPDATE y DELETE.

### `body_measurement_values`

- ID, measurement ID, metric type ID y value obligatorio.
- FK a measurement diferida, FK a metric type inmediata.
- UNIQUE `(measurement_id, metric_type_id)`.
- Value `ANY NOT NULL`: acepta cualquier `integer` de SQLite y limita los
  `real` finitos mediante comparaciones directas, sin `abs` para no desbordar el
  entero minimo. Acepta negativos/cero y rechaza texto, infinito y `NaN -> NULL`.
- Guards impiden insertar si la cabecera ya existe, UPDATE, DELETE y OR REPLACE
  por ID o par natural.

Protocolo atomico:

1. Reserva IDs dentro de `BEGIN IMMEDIATE`.
2. Inserta todos los valores con FK diferida.
3. Inserta al final la cabecera; su trigger exige al menos un valor.
4. Confirma y resuelve la FK.

Una cabecera vacia falla; valores huerfanos no llegan al commit; una medicion
confirmada no admite valores nuevos ni modificaciones.

Indices:

- historial `(user_id, measured_at DESC, id DESC)`;
- unique de code para lookup;
- unique measurement/type para lectura;
- inverso `(metric_type_id, measurement_id)`.

## Seed inicial

`database/seeds/0001_body_metric_types.sql` crea idempotentemente:

- `weight_kg` / Weight / kg;
- `bmi` / Body mass index / null;
- `body_fat_pct` / Body fat / %;
- `muscle_mass_kg` / Muscle mass / kg;
- `water_pct` / Body water / %;
- `visceral_fat` / Visceral fat / null;
- `bone_mass_kg` / Bone mass / kg;
- `basal_metabolism_kcal` / Basal metabolism / kcal/day;
- `metabolic_age` / Metabolic age / years.

Usa `INSERT ... SELECT ... WHERE NOT EXISTS`, IDs seguros y no usa IDs fijos,
OR REPLACE, OR IGNORE ni controles transaccionales. Repetirlo no duplica ni
sobrescribe tipos; preserva tipos personalizados y no crea usuarios.

El arranque aplica migraciones pero nunca seeds. Operacion/despliegue debe
ejecutar explicitamente `just db-seed` antes de depender de los codes iniciales.

## Modulos

- `measurement.schemas.ts`: tipos, medicion, params, queries y UTC.
- `measurement.repository.ts`: unico SQL del modulo, IDs, lookups por lote,
  insercion valores-primero, listas/detalle y mapeo camelCase.
- `measurement.service.ts`: transacciones, usuario, resolucion completa de
  codes, errores de dominio, atomicidad y ownership oculto.
- `measurement.routes.ts`: routers global y nested con `mergeParams`, sin SQL.
- `src/app.ts`: monta tipos y `/api/v1/users/:userId/measurements` antes del 404.

Crear tipos y mediciones usa transacciones `IMMEDIATE`. Creaciones concurrentes
del mismo code producen una creacion y un 409. Una medicion concurrente con un
tipo nuevo observa un estado coherente y nunca queda parcial.

## Pruebas

- Migracion: schema, FKs, protocolo valores-primero, inmutabilidad, OR REPLACE,
  tipos numericos, timestamps, duplicates, fechas repetidas e indices.
- Seed: nueve tipos exactos, repeticion, personalizados, usuarios ausentes y
  rollback de runner.
- Schemas: code, UTC, strictness, metrics no vacio, finitud, negativos e IDs.
- Repositorio/servicio: tipos, conflicto/concurrencia, IDs, usuario, codes,
  rollback intermedio, historico, ownership y respuesta sin IDs internos.
- API: cinco operaciones, contratos, unidades, errores, atomicidad, nueva
  metrica sin migracion y ausencia de PATCH/DELETE/rutas internas.
- Regresion DB/modules/API/logging/server y final lint/test/build.

## Alcance y cierre

No se implementan auth, endpoints de usuarios, edicion/borrado, importacion,
graficas, agregaciones, rangos clinicos ni cambios a spec 006. No se anaden
dependencias, configuracion ni cambios Docker.

README, arquitectura, database README y, si es seguro, DrawDB se actualizan. La
spec solo se marca `completed` tras todas las tareas y criterios.
