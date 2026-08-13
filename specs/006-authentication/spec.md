# 006 — Authentication and External Identity

```yaml
status: draft
```

## Objective

Añadir autenticación a Work-ouch utilizando un proveedor de identidad externo, manteniendo completamente separado:

- el usuario interno de Work-ouch;
- la identidad utilizada para autenticarse.

La primera implementación utilizará **Supabase Auth**.

El diseño no debe acoplar el dominio de Work-ouch a Supabase, de forma que en el futuro pueda sustituirse por otro proveedor compatible con OpenID Connect, como Keycloak, sin modificar las relaciones principales del modelo de datos.

---

## Scope

Esta especificación cubre:

- autenticación mediante JWT emitidos por Supabase Auth;
- validación de tokens en la API;
- asociación de identidades externas con usuarios internos;
- creación inicial del usuario de Work-ouch;
- identificación automática del usuario autenticado;
- protección de endpoints privados;
- aislamiento de datos entre usuarios;
- eliminación de la dependencia de `userId` proporcionado por el cliente cuando representa al usuario autenticado.

No cubre:

- frontend de login;
- roles avanzados;
- permisos administrativos;
- MFA;
- recuperación personalizada de contraseñas;
- gestión manual de contraseñas;
- Keycloak;
- migración Supabase → Keycloak;
- autorización compleja;
- gestión de organizaciones;
- cuentas compartidas.

---

# Domain principle

La autenticación externa y el usuario del dominio son conceptos diferentes.

Debe mantenerse la separación:

```text
External identity
       │
       ▼
Work-ouch user
       │
       ├── routines
       ├── workout_sessions
       └── body_measurements
```

Supabase identifica quién se está autenticando.

Work-ouch determina qué usuario interno representa esa identidad y qué datos le pertenecen.

---

# Internal users

La tabla existente:

```text
users
```

seguirá siendo la fuente de identidad interna para el dominio.

Todas las relaciones existentes deben continuar utilizando:

```text
users.id
```

Por ejemplo:

```text
routines.user_id
workout_sessions.user_id
body_measurements.user_id
```

Ninguna tabla de dominio debe utilizar directamente un identificador de Supabase.

---

# External identities

Debe existir una nueva entidad:

```text
user_identities
```

Conceptualmente contendrá:

```text
id
user_id
provider
provider_subject
created_at
```

Donde:

`user_id`

referencia a:

```text
users.id
```

`provider`

identifica el proveedor externo.

Inicialmente:

```text
supabase
```

En el futuro podrían existir:

```text
keycloak
```

u otros proveedores.

`provider_subject`

contiene el identificador estable proporcionado por el proveedor de identidad.

Para JWT compatibles con OpenID Connect corresponde conceptualmente al claim:

```text
sub
```

---

# Identity uniqueness

Debe existir una restricción de unicidad para:

```text
provider + provider_subject
```

Una identidad externa no puede estar asociada simultáneamente a dos usuarios internos.

Un mismo usuario interno sí puede disponer en el futuro de varias identidades.

Ejemplo válido:

```text
user_id | provider | provider_subject
--------------------------------------
1       | supabase | abc-123
1       | keycloak | xyz-789
```

Esto permitirá migraciones entre proveedores sin modificar el identificador interno del usuario.

---

# Authentication provider abstraction

El resto del dominio no debe depender directamente de Supabase.

La capa de autenticación debe producir conceptualmente una identidad normalizada:

```text
provider
subject
email
```

Ejemplo:

```json
{
  "provider": "supabase",
  "subject": "8dc3418e-...",
  "email": "user@example.com"
}
```

Los módulos:

```text
routines
workouts
measurements
exercises
```

no deben conocer detalles específicos de Supabase.

---

# JWT authentication

Las peticiones autenticadas utilizarán:

```http
Authorization: Bearer <token>
```

La API debe:

1. obtener el token Bearer;
2. verificar criptográficamente el JWT;
3. comprobar que el token pertenece al proveedor configurado;
4. comprobar las propiedades necesarias del token;
5. obtener al menos el `subject`;
6. resolver la identidad externa contra `user_identities`;
7. obtener el correspondiente usuario interno;
8. proporcionar ese usuario al resto de la petición.

No se debe confiar en información no verificada procedente del JWT.

---

# Current user

Después de una autenticación correcta, la aplicación debe disponer conceptualmente de:

```text
currentUser
```

que representa el usuario interno de Work-ouch.

Debe contener al menos:

```text
id
```

y los datos necesarios para las operaciones del dominio.

Los servicios posteriores deben utilizar:

```text
currentUser.id
```

en lugar de aceptar un `user_id` arbitrario proporcionado por el consumidor.

---

# Authentication errors

Una petición protegida debe rechazarse si:

- falta el token;
- el token tiene formato inválido;
- la firma es inválida;
- el token está caducado;
- el emisor no es válido;
- no puede determinarse el subject;
- la identidad externa no existe en Work-ouch.

Los errores deben utilizar la estructura estándar existente de la API.

No deben exponerse detalles internos de validación criptográfica.

---

# User bootstrap

Debe existir un mecanismo explícito para registrar por primera vez una identidad externa en Work-ouch.

El flujo esperado es:

```text
Usuario se registra/autentica en Supabase
                  │
                  ▼
Frontend obtiene JWT
                  │
                  ▼
POST /api/v1/auth/bootstrap
                  │
                  ▼
API valida JWT
                  │
                  ▼
Busca provider + subject
             │
       ┌─────┴─────┐
       │           │
    existe      no existe
       │           │
       │           ▼
       │       crea user
       │           │
       │           ▼
       │    crea user_identity
       │           │
       └─────┬─────┘
             ▼
       devuelve usuario
```

---

# Bootstrap behaviour

Debe existir:

```text
POST /api/v1/auth/bootstrap
```

El endpoint debe requerir autenticación externa válida.

Si la identidad todavía no existe:

1. crear un usuario interno;
2. crear su `user_identity`;
3. asociar ambos registros;
4. devolver el usuario interno.

Estas operaciones deben ser atómicas.

No debe poder quedar creado un usuario sin su identidad debido a un fallo parcial.

---

# Idempotent bootstrap

La operación de bootstrap debe ser idempotente.

Si la identidad ya está asociada a un usuario:

```text
POST /api/v1/auth/bootstrap
```

debe devolver el usuario existente.

No debe:

- crear otro usuario;
- crear otra identidad;
- devolver error por duplicidad.

---

# Email

El email proporcionado por el proveedor puede utilizarse para inicializar información del usuario.

Sin embargo, el email NO debe utilizarse como identificador principal para asociar identidades.

La asociación externa debe realizarse mediante:

```text
provider + provider_subject
```

No debe asumirse que:

```text
mismo email = mismo usuario
```

---

# Current-user endpoint

Debe existir una operación equivalente a:

```text
GET /api/v1/me
```

que devuelva el usuario interno correspondiente a la identidad autenticada.

El endpoint no recibe ningún `userId`.

---

# User ownership

Una vez implementada la autenticación, el cliente no debe poder decidir arbitrariamente el propietario de:

- rutinas;
- workouts;
- mediciones corporales.

Las operaciones que creen datos propiedad de un usuario deben obtener:

```text
user_id
```

desde el usuario autenticado.

Ejemplo:

```text
POST /api/v1/routines
```

no debe aceptar:

```json
{
  "userId": 2
}
```

para decidir quién es el propietario.

El propietario será:

```text
currentUser.id
```

---

# Query isolation

Toda consulta de recursos privados debe quedar limitada al usuario autenticado.

Una petición de un usuario nunca debe devolver recursos pertenecientes a otro usuario.

Esto afecta especialmente a:

```text
routines
routine versions
workout sessions
body measurements
```

---

# Resource ownership validation

No basta con verificar que un recurso existe.

También debe comprobarse que pertenece al usuario autenticado.

Por ejemplo, si:

```text
workout 25
```

pertenece a:

```text
user 1
```

una petición autenticada como:

```text
user 2
```

no debe poder:

```text
GET
PATCH
complete
modify sets
```

sobre ese workout.

---

# Identifier enumeration

La API no debe revelar si existe un recurso perteneciente a otro usuario de una forma que permita enumerar recursos ajenos.

Cuando sea razonable, una consulta sobre un recurso no accesible debe comportarse igual que una consulta sobre un recurso inexistente.

---

# Existing user endpoints

Los endpoints administrativos existentes de usuarios pueden mantenerse temporalmente durante el desarrollo si son necesarios.

Sin embargo, la API utilizada por el frontend normal debe utilizar:

```text
/me
```

y la identidad autenticada.

La futura eliminación o restricción de endpoints generales:

```text
/users
/users/:id
```

puede realizarse durante esta spec si resulta necesario para garantizar el aislamiento entre usuarios.

No debe introducirse todavía un sistema de roles para conservarlos como endpoints administrativos.

---

# Measurements API

Los endpoints orientados al propio usuario deben dejar de requerir un identificador confiado proporcionado por el cliente.

Por ejemplo, una operación existente equivalente a:

```text
/users/:userId/measurements
```

debería evolucionar hacia:

```text
/me/measurements
```

o hacia una ruta equivalente que derive automáticamente el usuario autenticado.

La decisión concreta de URL puede definirse en el plan técnico.

La regla funcional es:

> El consumidor no elige el usuario propietario de sus mediciones.

---

# Routines API

Las consultas y modificaciones de rutinas deben limitarse automáticamente a:

```text
currentUser.id
```

Crear una rutina debe asignarla al usuario autenticado.

Consultar una rutina debe comprobar su propietario.

Las versiones, ejercicios y sets heredan la propiedad de la rutina principal.

---

# Workouts API

Crear un workout debe asignarlo automáticamente al usuario autenticado.

No debe aceptarse un `userId` arbitrario desde el body.

Todas las operaciones posteriores sobre:

```text
workout_sessions
workout_exercises
workout_sets
```

deben validar indirectamente la propiedad mediante el workout padre.

---

# Exercises

El catálogo de ejercicios actualmente es global.

La lectura del catálogo puede estar disponible para cualquier usuario autenticado.

Esta spec no introduce ejercicios privados por usuario.

La política exacta para crear o modificar ejercicios queda fuera de esta spec salvo que sea necesario proteger los endpoints actuales.

---

# Provider configuration

La configuración específica del proveedor debe ser externa al código.

No deben incluirse:

- claves;
- secretos;
- URLs específicas de proyecto;
- credenciales;

directamente en el repositorio.

La configuración debe realizarse mediante variables de entorno.

Los nombres concretos se definirán en el plan de implementación.

---

# Supabase

Supabase Auth será el primer proveedor soportado.

Debe utilizarse únicamente para:

```text
authentication
identity
JWT issuance
```

No utilizar dentro de esta spec:

- Supabase Database;
- Supabase Storage;
- Edge Functions;
- Realtime;
- Row Level Security como mecanismo de autorización del backend.

SQLite continúa siendo la base de datos principal de Work-ouch.

---

# Provider independence

El código del dominio debe seguir funcionando si en el futuro:

```text
SupabaseAuthProvider
```

es sustituido por:

```text
KeycloakAuthProvider
```

La sustitución no debería requerir modificar:

- `routines`;
- `routine_versions`;
- `workout_sessions`;
- `workout_sets`;
- `body_measurements`;
- sus relaciones con `users`.

Como máximo debería afectar a:

- configuración;
- proveedor de autenticación;
- validación de JWT;
- registros de `user_identities`;
- código directamente perteneciente al módulo de autenticación.

---

# Authentication versus authorization

Esta spec implementa principalmente:

```text
authentication
```

y autorización básica basada en propiedad:

```text
resource.user_id == currentUser.id
```

No introduce autorización basada en roles.

Supabase determina:

```text
quién eres
```

Work-ouch determina:

```text
qué datos te pertenecen
```

---

# Security requirements

La implementación debe garantizar:

- validación criptográfica del JWT;
- rechazo de tokens expirados;
- validación del proveedor esperado;
- ausencia de confianza en `userId` enviado por el cliente;
- aislamiento entre usuarios;
- uso de parámetros SQL;
- ausencia de secretos en el repositorio;
- errores que no filtren información sensible.

---

# Database requirements

Debe añadirse:

```text
user_identities
```

con foreign key hacia:

```text
users.id
```

Debe garantizarse:

```text
UNIQUE(provider, provider_subject)
```

Eliminar un usuario debe tratar correctamente sus identidades asociadas.

La política concreta `ON DELETE` se decidirá durante el plan técnico de acuerdo con las reglas actuales de la base de datos.

---

# Transactions

Como mínimo, el bootstrap inicial:

```text
create user
+
create identity
```

debe ejecutarse dentro de una única transacción.

La operación debe ser consistente incluso ante peticiones concurrentes.

---

# Acceptance criteria

## External identity

- una identidad externa puede asociarse a un usuario interno;
- `provider + provider_subject` es único;
- el ID interno del usuario no depende de Supabase;
- un usuario puede potencialmente tener más de una identidad externa.

## JWT

- un token válido permite identificar al usuario;
- un token inexistente es rechazado en rutas protegidas;
- un token inválido es rechazado;
- un token expirado es rechazado;
- el subject se obtiene únicamente de un token verificado.

## Bootstrap

- una identidad nueva puede inicializar un usuario de Work-ouch;
- usuario e identidad se crean atómicamente;
- repetir bootstrap no crea duplicados;
- dos llamadas concurrentes no pueden crear dos usuarios para la misma identidad.

## Current user

- `/me` devuelve el usuario interno autenticado;
- `/me` no requiere un `userId`;
- una identidad desconocida no obtiene acceso automático a datos privados.

## Ownership

- una rutina nueva pertenece automáticamente al usuario autenticado;
- un workout nuevo pertenece automáticamente al usuario autenticado;
- una medición nueva pertenece automáticamente al usuario autenticado;
- el cliente no puede seleccionar otro propietario mediante `userId`.

## Isolation

Dados:

```text
user A
user B
```

y recursos pertenecientes a ambos:

- A puede consultar sus recursos;
- B puede consultar sus recursos;
- A no puede consultar los recursos privados de B;
- B no puede consultar los recursos privados de A;
- modificar manualmente IDs en las URLs no permite saltarse la protección.

## Historical data

Añadir autenticación:

- no modifica IDs internos existentes;
- no rompe las relaciones actuales;
- no modifica datos históricos de rutinas;
- no modifica workouts históricos;
- no modifica mediciones existentes.

## Provider independence

La lógica de dominio:

```text
routines
workouts
measurements
```

no depende directamente del SDK de Supabase.

La dependencia específica de Supabase queda confinada al módulo de autenticación.

---

# Important test scenarios

La implementación posterior deberá demostrar al menos estos escenarios:

### Valid authentication

```text
valid Supabase JWT
→ external identity
→ internal user
→ request accepted
```

### Invalid token

```text
invalid JWT
→ request rejected
```

### Bootstrap

```text
valid JWT
identity does not exist
→ create internal user
→ create identity
→ return internal user
```

### Repeated bootstrap

```text
same JWT
→ existing internal user
→ no duplicate records
```

### Cross-user routine access

```text
user A owns routine 10

user B:
GET /routines/10

→ access denied / resource not exposed
```

### Cross-user workout modification

```text
user A owns workout 20

user B attempts to modify workout 20

→ modification rejected
```

### Forged userId

```text
authenticated user = 1

request body:
{
  "userId": 2
}

→ user 2 must never become owner
```

### Provider independence

El código de dominio no debe importar directamente dependencias específicas del SDK de Supabase.

---

# Explicit non-goals

Esta spec NO pretende implementar:

- Keycloak;
- migración a Keycloak;
- login UI;
- signup UI;
- social login configuration;
- MFA;
- password reset UI;
- email verification UI;
- administración de usuarios;
- impersonation;
- roles;
- RBAC;
- organizaciones;
- equipos;
- permisos compartidos;
- API keys;
- service accounts;
- refresh token management propio;
- almacenamiento de passwords en Work-ouch.

---

# Future compatibility

El diseño debe permitir una futura spec equivalente a:

```text
XXX-keycloak-migration
```

en la que una misma cuenta interna pueda asociar:

```text
supabase identity
+
keycloak identity
```

antes de retirar Supabase.

La migración del proveedor no debe requerir cambiar:

```text
users.id
```

ni las foreign keys que actualmente apuntan a dicho identificador.

---

# Definition of done

Esta spec se considerará completada cuando:

- exista soporte de identidad externa;
- Supabase Auth sea el proveedor inicial;
- los JWT sean verificados correctamente;
- exista resolución identidad → usuario interno;
- exista bootstrap idempotente;
- exista `/me` o equivalente;
- los endpoints privados utilicen el usuario autenticado;
- no se confíe en `userId` suministrado por el frontend;
- exista aislamiento efectivo entre usuarios;
- los tests cubran los casos críticos;
- las decisiones específicas de Supabase estén aisladas del dominio;
- build, tests y lint del proyecto continúen funcionando.