# Contratos de puertos

Documento normativo para mensajes que no se persisten necesariamente como
entidades. Los nombres son estables aunque el lenguaje final use otra sintaxis.

## 1. Descubrimiento

```ts
type DiscoveryRequest = {
  requestId: UUID;
  sessionId: UUID;
  query: string;
  kinds: Array<"TRACK" | "PLAYLIST" | "CHANNEL">;
  pageSize: number;                 // 1..50
  cursor: string | null;
  locale: string;                   // p. ej. es-CO
  safeSearch: "NONE" | "MODERATE" | "STRICT";
  provenance: "USER" | "DJ_SEED" | "CURATOR" | "AI_SUGGESTION";
};

type CandidatePage = {
  requestId: UUID;
  candidates: Candidate[];
  nextCursor: string | null;
  fetchedAt: Timestamp;
  providerRequestId: string | null;
};

type Candidate = {
  candidateId: UUID;
  source: SourceRef;
  rawTitle: string;
  channelId: string | null;
  channelTitle: string | null;
  durationSeconds: number | null;
  availability: "UNKNOWN" | "AVAILABLE" | "UNAVAILABLE" | "RESTRICTED";
  provenance: { kind: string; value: string };
};
```

Invariantes:

- Los cursores son opacos.
- Repetir un `requestId` no crea efectos persistentes adicionales.
- Descubrir no significa aprobar ni preparar.

## 2. Inspección y preparación de fuente

```ts
type SourceInspection = {
  source: SourceRef;
  inspectedAt: Timestamp;
  status: "AVAILABLE" | "UNAVAILABLE" | "RESTRICTED";
  reasonCode: string | null;
  title: string;
  channelId: string | null;
  durationSeconds: number | null;
  contentTypeHint: ContentType;
  sourceRevision: string | null;
};

type PrepareSourceRequest = {
  requestId: UUID;
  source: SourceRef;
  purpose: "ANALYSIS" | "PLAYBACK";
  requiredUntil: Timestamp;
  preferredQuality: "ECONOMY" | "BALANCED" | "HIGH";
};

type PreparedSource = {
  requestId: UUID;
  leaseId: UUID;
  source: SourceRef;
  localHandle: string;              // opaco fuera del adaptador
  codec: string;
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
  fingerprint: string;
  preparedAt: Timestamp;
  expiresAt: Timestamp;
};
```

Invariantes:

- `localHandle` nunca se persiste en Track ni se exporta.
- Un lease se libera de manera idempotente.
- Una fuente expirada debe prepararse de nuevo.
- El adaptador no entrega tokens, cookies ni URLs firmadas a otros módulos.

## 3. Selección

```ts
type SelectionContext = {
  sessionId: UUID;
  currentTrackId: UUID | null;
  recentTrackIds: UUID[];
  recentArtistKeys: string[];
  targetEnergy: number;             // 0..1
  phase: EnergyPhase;
  requestedTrackIds: UUID[];
  sessionBlockedTrackIds: UUID[];
  sessionBlockedArtistKeys: string[];
  randomSeed: number;
  policyVersion: string;
};

type ScoreComponent = {
  name: string;
  raw: number;                      // 0..1
  weight: number;                   // 0..1 después de normalizar
  contribution: number;
  evidence: string[];
};

type RankedCandidate = {
  trackId: UUID;
  rank: number;
  totalScore: number;               // 0..1
  components: ScoreComponent[];
  penalties: Array<{ code: string; value: number }>;
  reasons: string[];
  curatorVersion: string;
};
```

## 4. Preparación de pista

```ts
type PrepareTrackRequest = {
  requestId: UUID;
  sessionId: UUID;
  trackId: UUID;
  priority: "CURRENT" | "NEXT" | "RESERVE";
  deadline: Timestamp;
  analysisProfile: "FAST" | "STANDARD" | "HIGH_CONFIDENCE";
};

type PreparedTrack = {
  requestId: UUID;
  trackId: UUID;
  analysisRef: AnalysisRef;
  sourceLeaseId: UUID;
  playableHandle: string;
  readyAt: Timestamp;
  validUntil: Timestamp;
  warnings: string[];
};
```

## 5. Comandos de reproducción

```ts
type PlaybackCommand = {
  commandId: UUID;
  sessionId: UUID;
  issuedAt: Timestamp;
  type:
    | "PLAY" | "PAUSE" | "RESUME" | "SKIP" | "STOP_AFTER_CURRENT"
    | "SET_ENERGY_DELTA" | "SET_DISCOVERY_LEVEL"
    | "REQUEST_TRACK" | "REQUEST_ARTIST"
    | "LIKE_TRACK" | "DISLIKE_TRACK"
    | "BLOCK_TRACK" | "BLOCK_ARTIST"
    | "MOVE_QUEUE_ITEM" | "REMOVE_QUEUE_ITEM";
  scope: "NEXT_SELECTION" | "SESSION" | "DJ";
  payload: Record<string, JsonValue>;
};

type CommandResult = {
  commandId: UUID;
  status: "ACCEPTED" | "REJECTED" | "DEFERRED";
  reasonCode: string | null;
  acceptedAt: Timestamp | null;
  resultingEventId: UUID | null;
};
```

Reglas:

- `commandId` hace idempotente el comando.
- `DJ` requiere una intención persistente explícita en la UI.
- `SKIP` no garantiza corte instantáneo: ejecuta la salida segura más rápida
  permitida por configuración.
- Un comando rechazado no altera estado.

## 6. Planificación de transición

```ts
type TransitionInput = {
  sessionId: UUID;
  from: PreparedTrack;
  to: PreparedTrack;
  allowedTypes: TransitionType[];
  preferredTempoAdjustmentPercent: number;
  maxTempoAdjustmentPercent: number;
  headroomDb: number;
  latestStartAt: Timestamp;
};
```

La salida es una lista no vacía de `TransitionPlan`, ordenada de mayor a menor
preferencia. Si no existe mezcla posible, debe existir al menos un plan
conservador o devolverse `TRANSITION_NO_SAFE_PLAN`.

## 7. Semántica de errores

- `retryable: true` significa que repetir puede funcionar sin cambiar la
  solicitud.
- Un timeout siempre indica si la operación puede continuar en background.
- Los adaptadores traducen errores externos a códigos internos estables.
- El mensaje es para humanos; la lógica solo usa `code`.
- Un error fatal de un worker no implica necesariamente una sesión fallida.
