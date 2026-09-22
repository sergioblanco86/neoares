# Catálogo de eventos

Todos los eventos usan el envelope de
[`session-event.schema.json`](schemas/session-event.schema.json). Este catálogo
define el mínimo requerido dentro de `payload`.

| Evento | Actor habitual | Payload mínimo |
|---|---|---|
| `SESSION_CREATED` | ORCHESTRATOR | `djId`, `djRevision`, `randomSeed` |
| `SESSION_STATE_CHANGED` | ORCHESTRATOR | `from`, `to`, `reasonCode` |
| `CANDIDATES_DISCOVERED` | CURATOR | `requestId`, `count`, `sourceKind` |
| `CANDIDATE_REJECTED` | CURATOR | `trackId` o `sourceKey`, `reasonCode` |
| `TRACK_SELECTED` | CURATOR | `trackId`, `rank`, `totalScore`, `reasons` |
| `TRACK_PREPARATION_STARTED` | PREPARATION | `trackId`, `priority`, `deadline` |
| `TRACK_READY` | PREPARATION | `trackId`, `analysisId`, `validUntil` |
| `TRACK_PREPARATION_FAILED` | PREPARATION | `trackId`, `error` |
| `TRANSITION_PLANNED` | ORCHESTRATOR | `transitionId`, `fromTrackId`, `toTrackId`, `type` |
| `TRANSITION_ARMED` | MIXER | `transitionId`, `masterDeck` |
| `TRANSITION_STARTED` | MIXER | `transitionId`, `actualStartSeconds` |
| `TRANSITION_COMPLETED` | MIXER | `transitionId`, `newMasterDeck`, `metrics` |
| `TRANSITION_FALLBACK_USED` | MIXER | `transitionId`, `fallbackType`, `reasonCode` |
| `PLAYBACK_STARTED` | MIXER | `trackId`, `deck`, `positionSeconds` |
| `PLAYBACK_PAUSED` | MIXER | `trackId`, `positionSeconds` |
| `PLAYBACK_RESUMED` | MIXER | `trackId`, `positionSeconds` |
| `TRACK_SKIPPED` | ORCHESTRATOR | `trackId`, `positionSeconds`, `reasonCode` |
| `USER_COMMAND_RECEIVED` | USER | `commandId`, `type`, `scope` |
| `USER_COMMAND_APPLIED` | ORCHESTRATOR | `commandId`, `status`, `reasonCode` |
| `PREFERENCE_RECORDED` | ORCHESTRATOR | `subjectType`, `subjectId`, `value`, `scope` |
| `SOURCE_LEASE_RELEASED` | SOURCE_ADAPTER | `trackId`, `leaseId`, `reasonCode` |
| `RECOVERY_STARTED` | STORAGE | `snapshotEventId`, `previousState` |
| `RECOVERY_COMPLETED` | ORCHESTRATOR | `resultingState`, `repreparedTrackIds` |
| `ERROR_OCCURRED` | Cualquiera | `error` |

## Reglas de evolución

- Todo payload contiene `payloadVersion`, inicialmente `1`.
- Añadir un campo opcional no incrementa `payloadVersion`.
- Cambiar semántica o eliminar un campo sí lo incrementa.
- Datos voluminosos se referencian por ID; no se copian al evento.
- Métricas contienen números agregados, nunca buffers o audio.
