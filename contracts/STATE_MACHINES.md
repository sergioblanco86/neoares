# Máquinas de estado

Las transiciones no listadas están prohibidas. Repetir una transición al mismo
estado es idempotente únicamente cuando se indique.

## 1. Sesión

| Estado | Puede pasar a | Motivo habitual |
|---|---|---|
| `CREATED` | `PREPARING`, `ABORTED`, `FAILED` | Comenzar preparación o cancelar |
| `PREPARING` | `READY`, `ABORTED`, `FAILED` | Reserva inicial lista |
| `READY` | `PLAYING`, `ABORTED`, `FAILED` | Play del usuario o autoplay autorizado |
| `PLAYING` | `PAUSED`, `DRAINING`, `STALLED`, `FAILED`, `ABORTED` | Control, final o fallo |
| `PAUSED` | `PLAYING`, `DRAINING`, `ABORTED`, `FAILED` | Reanudar o finalizar |
| `DRAINING` | `COMPLETED`, `PLAYING`, `FAILED`, `ABORTED` | Terminar después de la actual o cancelar final |
| `STALLED` | `PREPARING`, `PLAYING`, `ABORTED`, `FAILED` | Recuperar continuidad |
| `COMPLETED` | — | Terminal |
| `FAILED` | — | Terminal; reanudar crea una nueva sesión relacionada |
| `ABORTED` | — | Terminal |

Reglas:

- `PLAYING → PLAYING` solo es idempotente para duplicados del mismo comando.
- Una sesión terminal no se modifica, salvo metadatos administrativos que no
  cambien su historia.
- Recuperar un snapshot no inventa un estado: emite eventos desde el estado
  persistido hasta uno permitido.
- `DRAINING → PLAYING` requiere cancelar explícitamente el final programado.

## 2. Deck

| Estado | Puede pasar a |
|---|---|
| `EMPTY` | `LOADING` |
| `LOADING` | `CUED`, `ERROR`, `EMPTY` |
| `CUED` | `PLAYING`, `EMPTY`, `ERROR` |
| `PLAYING` | `FADING`, `CUED`, `EMPTY`, `ERROR` |
| `FADING` | `PLAYING`, `EMPTY`, `ERROR` |
| `ERROR` | `EMPTY`, `LOADING` |

Reglas:

- Un deck `EMPTY` no conserva handle ni lease.
- `CUED` implica fuente válida y buffer mínimo.
- Un solo deck es maestro antes de la transición.
- Durante el solapamiento ambos pueden estar `PLAYING`/`FADING`, pero existe un
  único reloj maestro.
- Pasar a `EMPTY` libera el lease de fuente de forma idempotente.

## 3. Elemento de cola

```text
CANDIDATE → RESOLVING → ANALYZING → READY → PLAYING → PLAYED
     │            │          │         │         └→ SKIPPED
     └────────────┴──────────┴─────────┴────────────→ FAILED
```

Transiciones adicionales:

- `READY → CANDIDATE` si expira la fuente pero la pista sigue siendo candidata.
- `PLAYING → FAILED` únicamente ante fallo real de reproducción.
- `FAILED` es terminal para ese intento; reintentar crea un nuevo intento con
  `attemptId` diferente aunque conserve `trackId`.

## 4. Plan de transición

Estados runtime, no persistidos dentro del contrato inmutable del plan:

`PROPOSED → VALIDATED → ARMED → EXECUTING → COMPLETED`

Salidas alternativas:

- `PROPOSED | VALIDATED | ARMED → EXPIRED`
- `VALIDATED | ARMED | EXECUTING → CANCELLED`
- `ARMED | EXECUTING → FAILED`

Reglas:

- Un plan inmutable no vuelve de `EXPIRED`, `CANCELLED`, `FAILED` o
  `COMPLETED`.
- Replanificar crea otro `transitionId`.
- Solo un plan puede estar `ARMED` por sesión.
- `EXECUTING` requiere que todas las precondiciones se hayan validado justo
  antes del inicio.

## 5. Lease de fuente

`REQUESTED → PREPARING → ACTIVE → RELEASING → RELEASED`

Errores:

- `REQUESTED | PREPARING → FAILED`
- `ACTIVE → EXPIRED`
- `EXPIRED → RELEASING → RELEASED`

`release(leaseId)` es idempotente y debe aceptar leases ya liberados.
