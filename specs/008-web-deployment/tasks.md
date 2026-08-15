# Tareas de implementación: 008 - Despliegue web y entorno de autenticación externa

Estado: todas las tareas permanecen sin ejecutar mientras la spec sea `draft`.

## 1. Decisiones y preparación

- [ ] Registrar origen canónico, plataforma/proxy, gestión TLS, entornos y política de `/health`; verificar aprobación del operador.
- [ ] Registrar proveedores, scopes, Site URL, redirects y compatibilidad RS256/issuer/audience/JWKS; verificar contra configuración efectiva sin secretos.
- [ ] Definir inyección separada de variables públicas y server-only, redacción de logs y cuenta de smoke; verificar que no se versionan ni imprimen secretos.

## 2. Topología desplegable

- [ ] Añadir configuración reproducible del proxy/hosting que mantenga API privada y SQLite persistente; verificar que no abre puertos internos al exterior.
- [ ] Configurar orden de rutas para `/api/v1`, `/health` aprobado, assets y fallback GET/HEAD; verificar preservación de método, path, query y `Authorization`.
- [ ] Configurar TLS, redirección HTTP y cache de HTML/assets; verificar certificado válido, renovación y actualización sin referencias a assets retirados.

## 3. Entorno de autenticación

- [ ] Configurar valores públicos al construir el SPA y valores `AUTH_*` solo al ejecutar API; inspeccionar artefactos y logs redactados.
- [ ] Configurar Supabase Site URL, redirects, proveedor(es) y scopes aprobados; verificar callback `/auth/callback` en cada entorno permitido.
- [ ] Verificar con JWT real que RS256, issuer, audience y JWKS son aceptados, y que incompatibilidades se rechazan.

## 4. Operación y evidencia

- [ ] Desplegar en entorno representativo y ejecutar checks de raíz, deep link, callback, assets, `/api/v1` y política de `/health`; guardar evidencia sin tokens.
- [ ] Ejecutar smoke OAuth real: login PKCE, callback, bootstrap/me, navegación autenticada y logout/revocación de sesión de prueba.
- [ ] Documentar alertas/checks operativos, procedimiento de rollback y ensayo de retorno sin pérdida de SQLite; verificar retorno a versión anterior.
- [ ] Ejecutar verificaciones finales de backend y web mediante recetas `just` aplicables, más los smoke desplegados; actualizar estado solo tras cumplir todos los criterios.
