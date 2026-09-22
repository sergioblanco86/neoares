# Contratos

Esta carpeta define el lenguaje estable entre UI, orquestador, curador,
preparación, mixer y persistencia.

Los JSON Schema usan Draft 2020-12. Los contratos son independientes del
lenguaje de implementación.

## Esquemas

- [`app-settings.schema.json`](schemas/app-settings.schema.json)
- [`dj-profile.schema.json`](schemas/dj-profile.schema.json)
- [`track.schema.json`](schemas/track.schema.json)
- [`track-analysis.schema.json`](schemas/track-analysis.schema.json)
- [`session.schema.json`](schemas/session.schema.json)
- [`transition-plan.schema.json`](schemas/transition-plan.schema.json)
- [`session-event.schema.json`](schemas/session-event.schema.json)
- [`manifest.schema.json`](schemas/manifest.schema.json)
- [`common.schema.json`](schemas/common.schema.json)
- [Contratos de puertos](PORTS.md)
- [Catálogo de eventos](EVENTS.md)
- [Máquinas de estado](STATE_MACHINES.md)
- [Continuidad de sesión](SESSION_CONTINUITY.md)

El conjunto de requisitos aprobado para la siguiente implementación está en
[`docs/IMPLEMENTATION_CONTRACTS.md`](../docs/IMPLEMENTATION_CONTRACTS.md).

## Reglas globales

- Campos desconocidos se rechazan salvo que el esquema diga lo contrario.
- Timestamps: UTC, RFC 3339.
- Duraciones y posiciones de audio: segundos decimales.
- BPM: beats por minuto.
- Ganancia: decibelios cuando termina en `Db`; lineal cuando termina en
  `Linear`.
- Ratios y scores: rango `[0, 1]`.
- Ajustes de tempo: porcentaje, no multiplicador.
- IDs internos: UUID.
- IDs externos siempre incluyen proveedor.
- El campo `schemaVersion` versiona persistencia; `algorithmVersion` versiona un
  resultado calculado.

## Compatibilidad

- Añadir un campo opcional es compatible.
- Añadir un enum puede ser incompatible para consumidores exhaustivos y exige
  revisar contratos.
- Renombrar, eliminar o cambiar semántica incrementa `schemaVersion`.
- Los lectores aceptan versiones conocidas; una versión futura se abre solo en
  lectura.
- Los productores nunca escriben un documento que no validaron.

## Errores

Todos los puertos devuelven éxito o un error estructurado:

```json
{
  "code": "SOURCE_UNAVAILABLE",
  "message": "La fuente no está disponible",
  "retryable": true,
  "severity": "WARNING",
  "component": "youtube-source",
  "context": {
    "sourceKey": "youtube:dQw4w9WgXcQ"
  },
  "causeCode": null,
  "occurredAt": "2026-09-18T20:00:00Z"
}
```

`context` usa una lista permitida y nunca contiene tokens, cookies, URLs
firmadas ni rutas con información sensible.

Familias iniciales:

- `AUTH_*`
- `SOURCE_*`
- `DISCOVERY_*`
- `ANALYSIS_*`
- `CURATION_*`
- `TRANSITION_*`
- `PLAYBACK_*`
- `STORAGE_*`
- `AI_*`

## Comandos del usuario

Un comando tiene `commandId`, `sessionId`, `type`, `scope`, `issuedAt` y un
payload validado. Tipos iniciales:

- `PLAY`, `PAUSE`, `RESUME`, `SKIP`, `STOP_AFTER_CURRENT`
- `SET_ENERGY_DELTA`, `SET_DISCOVERY_LEVEL`
- `REQUEST_TRACK`, `REQUEST_ARTIST`
- `LIKE_TRACK`, `DISLIKE_TRACK`
- `BLOCK_TRACK`, `BLOCK_ARTIST`
- `MOVE_QUEUE_ITEM`, `REMOVE_QUEUE_ITEM`

El resultado indica `ACCEPTED`, `REJECTED` o `DEFERRED`; aceptar un comando no
significa que su efecto físico ya terminó.

## Eventos

- Son inmutables y append-only.
- Cada evento tiene un UUID único y secuencia creciente dentro de la sesión.
- Los consumidores deben ser idempotentes por `eventId`.
- `occurredAt` describe cuándo ocurrió; `recordedAt`, cuándo se persistió.
- Un evento nunca se actualiza. Una corrección genera otro evento.

## Invariantes entre esquemas

- `TransitionPlan.fromTrackId` debe coincidir con la pista maestra.
- `analysisId` y fingerprint deben pertenecer a la pista referenciada.
- Un plan `ARMED` debe aparecer en el snapshot de la sesión.
- Una pista `READY` en cola tiene análisis válido y una fuente temporal vigente.
- El `djRevision` de una sesión no cambia después de crearla.
- Los artefactos temporales nunca se exportan como entidades persistentes.
- Los pesos de curaduría deben tener suma mayor que cero y se normalizan antes
  de puntuar.
- `minDurationSeconds` no puede superar `maxDurationSeconds`.
- Los límites de tempo cumplen `preferred <= max <= absolute`.
- `createdAt <= updatedAt`; y `startedAt <= endedAt` cuando ambos existan.
- Todo rango temporal cumple `startSeconds < endSeconds` y cae dentro de la
  duración analizada.
