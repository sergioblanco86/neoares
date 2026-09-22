# ADR-0003: JSON, NDJSON y Keychain

- **Estado:** accepted
- **Fecha:** 2026-09-18

## Contexto

Se requiere persistencia inspeccionable, local y sencilla, con recuperación de
sesiones y bajo volumen para un usuario.

## Decisión

Usar JSON versionado para entidades y snapshots, NDJSON append-only para
eventos y logs, y Keychain para secretos. El audio y fuentes resueltas son
temporales.

## Consecuencias

- Los datos se pueden revisar y exportar fácilmente.
- Se requieren escrituras atómicas, validación y migraciones propias.
- No se introduce una base de datos hasta demostrar necesidad de concurrencia o
  volumen que JSON no pueda manejar.
