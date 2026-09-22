# ADR-0001: aplicación privada y local

- **Estado:** accepted
- **Fecha:** 2026-09-18

## Contexto

El producto será utilizado inicialmente por una sola persona y necesita acceso
de baja latencia al audio, almacenamiento y recursos del computador.

## Decisión

Construir una aplicación de escritorio para macOS, sin backend propio, cuentas
internas ni sincronización. Todos los datos de producto se guardan localmente.

## Consecuencias

- Menor alcance inicial y operación sencilla.
- Mejor control del pipeline de audio.
- Backups y seguridad del dispositivo recaen en el usuario.
- Distribución, sandboxing y multiusuario quedan fuera del MVP.
