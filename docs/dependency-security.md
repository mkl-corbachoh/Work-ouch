# Mantenimiento de dependencias y vulnerabilidades

## Política

- Responsable de revisión: mantenedor del repositorio.
- Dependabot busca actualizaciones ordinarias mensualmente.
- Los cambios menores y parches se agrupan por ecosistema/directorio; las versiones mayores se revisan por separado.
- No hay fusión automática. Revisar compatibilidad, changelog y pruebas antes de fusionar.
- Las alertas y las actualizaciones de seguridad se activan en los ajustes de GitHub, no mediante este YAML. No esperan al calendario mensual.
- Priorizar vulnerabilidades por severidad, exposición y uso real; cualquier excepción debe documentar motivo y seguimiento.

## Cobertura configurada

- `npm` en `/`.
- `docker` en `/`.

## Límites y validación

- Esta configuración entra en funcionamiento al fusionarse en la rama predeterminada. Después, comprobar los jobs de Dependabot y las alertas en la pestaña Security.
- Habilitar una opción no demuestra que se hayan analizado todas las dependencias ni que una vulnerabilidad tenga parche disponible.
- Las actualizaciones de etiquetas/digests de contenedores no equivalen a un escaneo de vulnerabilidades de la imagen final. No se incorpora Trivy, SAST ni detección de secretos en este cambio.
- Los tags no semánticos o las referencias a imágenes construidas localmente pueden no generar PR de actualización.
- No existe CI en la rama predeterminada al preparar este cambio. Por tanto, no se afirma que tests/build sean obligatorios ni que se hayan ejecutado automáticamente; establecer CI es un siguiente paso pendiente.
