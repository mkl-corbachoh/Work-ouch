---
status: in_progress
---

# 001 - Base del proyecto

## Objetivo

Disponer de una base ejecutable y verificable para desarrollar la API en Linux,
con configuracion, persistencia SQLite, migraciones, manejo comun de errores,
logging, tests y empaquetado Docker.

## Alcance

- Proyecto Node.js con TypeScript estricto y Express.
- Configuracion mediante entorno.
- Conexion a SQLite y mecanismo de migraciones SQL.
- Comandos de desarrollo mediante `just`.
- Build y ejecucion local y con Docker Compose.
- Infraestructura de tests con Vitest.
- Logging HTTP y errores JSON basicos.
- Endpoint `GET /health`.
- Estructura modular inicial y documentacion practica.

## Requisitos funcionales

### Ejecucion local

- `just install` instala las dependencias del proyecto.
- `just dev` inicia la API en modo desarrollo.
- `just build` compila TypeScript y `just start` ejecuta el JavaScript compilado.
- `just test` ejecuta los tests y `just lint` realiza las comprobaciones
  estaticas acordadas.

### Configuracion

- La aplicacion acepta `DATABASE_PATH`, `PORT` y `NODE_ENV`.
- Los valores locales por defecto son `./data/training.db`, `3000` y
  `development`.
- Una configuracion invalida impide el arranque con un error comprensible.
- El servidor escucha en una interfaz accesible desde fuera del contenedor.

### Base de datos y migraciones

- Cada conexion activa claves foraneas y modo WAL.
- Las migraciones se descubren y ejecutan en orden.
- Una migracion aplicada se registra en `schema_migrations` y no vuelve a
  ejecutarse.
- Un fallo no puede dejar una migracion marcada como aplicada parcialmente.
- El mismo mecanismo funciona en local, tests y Docker.
- Existen comandos `just db-migrate`, `just db-reset` y `just db-seed`.
- El reset es una operacion explicita de desarrollo y no se ejecuta al arrancar.

### API base

- `GET /health` devuelve JSON y estado 200 cuando la aplicacion y su conexion a
  SQLite estan disponibles.
- Si SQLite no esta disponible, el health check devuelve un estado no exitoso.
- Las rutas inexistentes y los errores controlados usan la estructura comun de
  error JSON.
- Los errores inesperados no exponen stack traces ni detalles internos al
  consumidor.

### Logging

- Cada peticion registra metodo, ruta, estado y duracion.
- Los errores incluyen informacion util para diagnostico.
- El logging no depende de servicios externos y no registra cuerpos completos
  por defecto.

### Docker

- `docker compose up -d` construye o inicia una API funcional.
- La imagen de ejecucion usa JavaScript compilado, no TypeScript directo.
- La base reside en `/app/data` y sobrevive a la recreacion del contenedor
  mediante un volumen.
- Existen comandos `just docker-build`, `just docker-up`, `just docker-down` y
  `just docker-logs`.

## Reglas

- Los tests usan una base temporal o en memoria aislada de la base de
  desarrollo.
- La creacion de la aplicacion Express debe poder probarse sin abrir un puerto.
- No se crean archivos por ajustarse mecanicamente a una plantilla.
- El seed nunca se ejecuta automaticamente en produccion.

## Casos importantes

- Arranque con valores por defecto y con valores configurados.
- Arranque rechazado por un puerto o entorno invalido.
- Primera ejecucion de migraciones y ejecuciones posteriores sin cambios.
- Migracion fallida sin registro falso de exito.
- Health check correcto y fallo de base de datos.
- Persistencia de SQLite tras recrear el contenedor.

## Criterios de aceptacion

- Un entorno Linux limpio puede usar `just install` y `just dev` para obtener
  una respuesta exitosa de `/health`.
- Build, start, test y lint terminan correctamente.
- Las migraciones se aplican exactamente una vez y quedan registradas.
- Los tests demuestran que no se usa la base de desarrollo.
- Los errores HTTP siguen una estructura JSON consistente.
- Los logs contienen los campos minimos requeridos.
- Docker Compose expone la API y conserva la base en un volumen.
- README explica de forma breve los flujos local, base de datos y Docker.

## Fuera de alcance

- Endpoints y logica funcional de usuarios, ejercicios, rutinas, workouts o
  mediciones.
- Esquema funcional completo del dominio.
- Autenticacion, autorizacion y observabilidad externa.
- Despliegue en un proveedor concreto.
