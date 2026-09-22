# ADR-0002: YouTube detrás de una frontera reemplazable

- **Estado:** accepted
- **Fecha:** 2026-09-18

## Contexto

YouTube ofrece el catálogo requerido, pero el procesamiento local previsto no
forma parte de sus integraciones públicas autorizadas y puede romperse.

## Decisión

Aceptar el riesgo para uso privado y aislar toda interacción no estable dentro
de `YouTubeSourceAdapter`. Dominio, curador, análisis y mixer solo consumen
contratos internos y nunca URLs efímeras.

## Consecuencias

- Un cambio de YouTube debe afectar principalmente a un adaptador.
- El adaptador requiere pruebas de salud y observabilidad propia.
- Antes de distribuir o monetizar se debe reevaluar esta decisión.
- No se intentará acceder a contenido protegido con DRM.
