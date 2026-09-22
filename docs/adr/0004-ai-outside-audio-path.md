# ADR-0004: IA fuera del camino crítico

- **Estado:** accepted
- **Fecha:** 2026-09-18

## Contexto

La IA ayuda con lenguaje, contexto cultural y descubrimiento, pero su latencia y
salida no son deterministas.

## Decisión

La IA puede proponer políticas y candidatos, pero nunca controla decks,
transiciones ni continuidad. Toda salida se valida y tiene fallback local.

## Consecuencias

- Una caída del proveedor no detiene la música.
- El sistema debe funcionar primero sin IA.
- Las respuestas estructuradas necesitan esquema, timeout y versionado.
