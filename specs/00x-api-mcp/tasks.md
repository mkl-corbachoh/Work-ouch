# Tareas de implementacion: 00x - Adaptador MCP

Estado: todas las tareas permanecen sin ejecutar mientras la spec sea `draft` y
el plan no haya sido revisado.

## 1. Decisiones y aprobacion

- [ ] Confirmar numero/nombre canonicos y actualizar referencias de arquitectura; verificar que MCP queda identificado de forma univoca.
- [ ] Aprobar allowlist, nombres, schemas, SDK, versiones de protocolo y clientes objetivo; verificar el contrato con una matriz documentada.
- [ ] Elegir y demostrar la delegacion remota a un token REST de la misma identidad sin reenviar el token MCP; verificar issuer, audiences y subject con el Authorization Server real.
- [ ] Aprobar entrega y renovacion de credencial para `stdio`; verificar que no requiere argumentos de tools ni persistencia no autorizada.
- [ ] Aprobar URL, path, TLS, proxy, modo stateless/stateful, Host/Origin, CORS, scopes y limites; coordinar las decisiones compartidas con spec 008.
- [ ] Confirmar que las mutaciones globales quedan excluidas hasta disponer de autorizacion administrativa.

## 2. Fundacion MCP

- [ ] Fijar `@modelcontextprotocol/sdk` y actualizar lockfile/scripts; verificar instalacion reproducible y build en Node.js 24.
- [ ] Implementar configuracion estricta comun, local y remota; probar ausencias, URLs inseguras, limites invalidos y audiences iguales.
- [ ] Crear el core MCP independiente de transportes; verificar que puede registrar la allowlist sin abrir DB ni servidor HTTP.
- [ ] Anadir una prueba arquitectonica que prohiba imports de SQLite, DB, migraciones y repositorios desde `src/mcp/**`.

## 3. Contratos y cliente REST

- [ ] Implementar schemas estrictos de inputs y outputs; verificar IDs seguros, timestamps con zona, nullables, enums y rechazo de campos extra.
- [ ] Implementar cliente REST con paths fijos, bearer interno, redirects bloqueados, limites, timeout y cancelacion; verificar que tools no controlan URL, path, headers ni token.
- [ ] Mapear respuestas y errores REST a resultados MCP estructurados; verificar redaccion de upstream, stacks, claims y secretos.
- [ ] Implementar proveedor local de credencial REST aprobado; cubrir ausencia y expiracion sin imprimir ni persistir el token.
- [ ] Implementar el mecanismo downstream remoto aprobado; verificar audience REST, expiracion y misma identidad antes de llamar a la API.

## 4. Herramientas

- [ ] Implementar bootstrap y usuario actual; verificar bootstrap explicito e idempotente, sin efectos secundarios desde otras tools.
- [ ] Implementar lecturas de ejercicios y tipos de metrica; verificar filtros exactos y ausencia de mutaciones globales.
- [ ] Implementar lista, detalle, creacion y nueva version de rutinas; verificar ownership, definiciones completas e inmutabilidad historica.
- [ ] Implementar inicio, lista, detalle, PUT completo, completar y cancelar workouts; verificar sustituciones, sets completos y estados terminales.
- [ ] Implementar creacion, lista y detalle de mediciones; verificar catalogo dinamico, atomicidad y UTC.
- [ ] Verificar `tools/list` contra una allowlist exacta y demostrar ausencia de capacidades no aprobadas.

## 5. Transportes y seguridad

- [ ] Implementar entrypoint `stdio`; verificar `initialize`, `tools/list`, `tools/call`, cierre y stdout sin logs.
- [ ] Implementar Streamable HTTP en el modo aprobado; verificar metodos, negociacion, reinicio y sesiones si corresponden.
- [ ] Proteger HTTP con bearer MCP y scopes; verificar issuer, audience, expiracion, algoritmo y challenge/metadata OAuth.
- [ ] Validar Host y Origin antes del transporte; verificar `403` para valores invalidos/no permitidos y ausencia de Origin para clientes no navegador.
- [ ] Aplicar body, respuesta, timeout, concurrencia y rate limits aprobados; verificar cancelacion downstream y ausencia de retries de mutaciones.
- [ ] Implementar logging estructurado redactado; inspeccionar stdout, stderr y logs HTTP en busca de tokens y datos sensibles.

## 6. Integracion y aislamiento

- [ ] Probar todas las tools contra una Training API real de test con SQLite temporal, accediendo solo por HTTP; comparar contratos, UTC y errores.
- [ ] Probar dos identidades y recursos propios/ajenos; verificar ownership, 404 no revelador y ausencia de `userId` confiado.
- [ ] Probar separacion de audiences; demostrar que REST rechaza el token MCP y que el upstream recibe unicamente la credencial REST de la misma identidad.
- [ ] Probar fallos de red, timeout, respuesta grande, redirect, upstream no JSON y cierre ambiguo; verificar que ninguna escritura se reintenta automaticamente.
- [ ] Probar clientes MCP reales aprobados sobre `stdio` y Streamable HTTP.

## 7. Empaquetado, operacion y cierre

- [ ] Anadir recipes `just` para ejecucion, tests y smoke MCP e integrarlas en `just verify`.
- [ ] Empaquetar JavaScript compilado en un proceso/contenedor sin volumen SQLite ni `DATABASE_PATH`; verificar usuario no root, puertos privados y shutdown.
- [ ] Integrar proxy/TLS y configuracion remota solo tras cerrar decisiones compartidas con spec 008; verificar endpoint publico y API privada.
- [ ] Documentar configuracion, renovacion local, limites, redaccion, observabilidad, revocacion, rollout y rollback; ensayar retirada de MCP sin tocar SQLite.
- [ ] Ejecutar lint, typecheck, tests, build, Docker y smokes aprobados; actualizar checkboxes y estado solo despues de conservar evidencia redactada.
