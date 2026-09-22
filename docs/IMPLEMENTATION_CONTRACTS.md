# Contratos de implementación de NeoAres

Estado: implementación base completada el 2026-09-22; pendiente de prueba
prolongada y controles visuales de almacenamiento.

Implementado:

- persistencia atómica del último DJ y snapshot activo;
- recuperación manual sin autoplay, conservando cola, índice y posición;
- coordinador de cola con refill `single-flight` y objetivo de seis pistas;
- clasificación inicial de contenido hablado;
- análisis de sonoridad integrado, ganancia por deck y limitador de seguridad;
- índice de caché, migración, protección de audio en uso y limpieza periódica.

Este documento reúne los requisitos acordados para persistencia de sesión,
continuidad, validación musical, profundidad de cola, normalización de sonoridad
y ciclo de vida de la caché. Es la referencia normativa del siguiente bloque de
desarrollo. Si una descripción anterior contradice este documento, prevalece
este documento hasta que el contrato se incorpore al código y a los esquemas.

## 1. Principios no negociables

- Una sesión iniciada debe priorizar la continuidad del audio por encima del
  descubrimiento, la interfaz, el análisis avanzado o la limpieza de caché.
- `PAUSE` solo suspende el audio. No cancela búsquedas, descargas, análisis ni
  preparación de la siguiente pista.
- Ningún error recuperable de una pista puede convertir por sí solo la sesión
  completa en `ERROR`.
- Una pista fallida se reemplaza; no se confunde una falla temporal con el
  agotamiento de toda la cola.
- La reproducción conserva velocidad y tono originales (`playbackRate = 1`).
- El volumen del usuario y la normalización de sonoridad son controles
  independientes.
- DJs, estado, sesiones, índices y análisis se guardan localmente.
- El audio preparado es una caché regenerable, limitada y eliminable.

## 2. Persistencia del último DJ y de la sesión activa

### 2.1 Estado de aplicación

La aplicación guarda `data/app-state.json` con este contrato conceptual:

```ts
type AppState = {
  schemaVersion: 2;
  lastSelectedDjId: string | null;
  languagePreference: "system" | "es" | "en";
  updatedAt: string;
};
```

Al iniciar NeoAres:

1. Se intenta seleccionar `lastSelectedDjId`.
2. Si el DJ no existe, se selecciona el primer DJ disponible.
3. Si no existen DJs, se presenta la biblioteca vacía sin crear DJs de prueba.
4. Un documento versión 1 se migra automáticamente a versión 2 conservando
   `lastSelectedDjId` y asignando `languagePreference: "system"`.

### 2.2 Idioma de la aplicación

El contrato completo está en
[`INTERNATIONALIZATION.md`](INTERNATIONALIZATION.md). NeoAres inicia en modo
`system`, soporta español e inglés, usa inglés como fallback y aplica cualquier
cambio manual inmediatamente sin reiniciar. La preferencia no altera nombres,
géneros, artistas, canciones ni consultas del usuario.

### 2.3 Snapshot recuperable

La sesión activa se guarda en `data/sessions/active.json`:

```ts
type SessionSnapshot = {
  schemaVersion: 1;
  sessionId: string;
  djId: string;
  djRevision: number;
  phase: "PLAYING" | "PAUSED" | "STALLED";
  queue: YouTubeSource[];
  currentIndex: number;
  positionSeconds: number;
  discoveryRound: number;
  savedAt: string;
  recoverable: boolean;
};
```

Reglas:

- La posición se persiste como máximo cada cinco segundos mientras exista una
  sesión activa.
- Cambios estructurales de cola, pista actual, pausa, reanudación y transición
  se guardan inmediatamente.
- Las escrituras son atómicas: archivo temporal, validación y renombrado.
- Al reabrir, se restaura DJ, orden de cola, índice y posición aproximada.
- La sesión restaurada empieza pausada y requiere la acción explícita
  `Continuar sesión`; nunca reproduce automáticamente al abrir la aplicación.
- Los buffers Web Audio no sobreviven al cierre. La pista actual y la próxima
  se vuelven a cargar, reutilizando el archivo cacheado si aún existe.
- Si `djRevision` ya no coincide, la cola antigua se descarta y se crea una
  nueva sesión con las reglas actuales.
- `Terminar` elimina el snapshot activo. Cerrar la aplicación no equivale a
  `Terminar`.
- Después de restaurar, el coordinador rellena la cola si quedan menos de cuatro
  pistas futuras válidas.

## 3. Profundidad y coordinación de la cola

Constantes iniciales:

```ts
const MIN_UPCOMING_TRACKS = 4;
const REFILL_TARGET = 6;
```

Existe una única operación coordinada:

```ts
ensureQueueDepth({
  minimum: 4,
  target: 6,
  reason: QueueRefillReason
}): Promise<QueueDepthResult>
```

Se ejecuta:

- al iniciar una sesión;
- al restaurar una sesión;
- después de preparar la siguiente pista;
- después de avanzar de pista;
- después de eliminar, reemplazar o reorganizar la cola;
- después de rechazar contenido no musical o una fuente fallida;
- cuando la cola atraviesa el umbral de cuatro pistas futuras.

Invariantes:

- `minimum` cuenta solamente pistas futuras, no la actual ni las ya
  reproducidas.
- Solo puede existir un refill activo por sesión (`single-flight`). Los demás
  solicitantes esperan el mismo resultado; no retornan silenciosamente.
- Preparar el siguiente deck tiene prioridad sobre descubrir reservas.
- Un resultado vacío programa otra estrategia de consulta o un reintento con
  backoff acotado; no declara `ERROR` inmediatamente.
- El índice de reproducción y la cola se actualizan mediante una sola autoridad
  para evitar carreras entre preparación, edición y transición.
- Las pistas reproducidas se archivan en historial o se podan de la cola activa;
  nunca se muestran como “Próximas”.

## 4. Contrato de continuidad

El contrato detallado está en
[`contracts/SESSION_CONTINUITY.md`](../contracts/SESSION_CONTINUITY.md).

Resumen obligatorio:

- El temporizador de transición nunca puede ser de un solo intento.
- Si llega el punto de transición y el siguiente deck aún no está listo, el
  coordinador permanece en estado recuperable y vuelve a comprobarlo.
- Una falla de una fuente promueve el siguiente candidato y rellena la reserva.
- `ERROR` es terminal únicamente para una falla no recuperable del mixer, del
  dispositivo de audio o del estado interno después de agotar estrategias de
  recuperación.
- Los fallos deben conservar código y causa. Está prohibido capturarlos y
  convertirlos todos en “no descargable”.

## 5. Validación de que el resultado sea música

Antes de entrar a la cola, todo candidato obtiene:

```ts
type MusicAssessment = {
  allowed: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  contentType:
    | "MUSIC"
    | "LIVE_MUSIC"
    | "SPOKEN_CONTENT"
    | "UNKNOWN";
  positiveReasons: string[];
  negativeReasons: string[];
  assessmentVersion: string;
};
```

### 5.1 Evidencia negativa

Se rechazan títulos o metadatos que indiquen, entre otros: `interview`,
`entrevista`, `documentary`, `documental`, `biography`, `biografía`, `podcast`,
`press conference`, `behind the scenes`, `making of`, `reaction`, `review`,
`historia`, `explained`, `analysis`, `tutorial` o `news`.

La lista se normaliza sin distinguir mayúsculas, tildes ni puntuación. La
coincidencia del nombre del artista nunca anula por sí sola evidencia fuerte de
contenido hablado.

### 5.2 Evidencia positiva

Se considera evidencia positiva:

- patrón claro `Artista - Canción`;
- `Official Audio`, `Official Video`, `Music Video` o `Lyric Video`;
- canal oficial o canal `Topic` coherente con el artista;
- categoría musical del proveedor;
- metadatos consistentes de pista, artista y álbum.

### 5.3 Decisión

- Confianza `HIGH`: puede pasar a preparación.
- Confianza `LOW`: se rechaza y se registra la razón.
- Confianza `MEDIUM`: se inspeccionan metadatos completos antes de decidir.
- No se requiere IA para la primera versión. La IA, si se añade, es una señal
  opcional fuera del camino crítico.
- Si un candidato se rechaza durante preparación, se bloquea para esa sesión,
  se reemplaza y se invoca `ensureQueueDepth`.

## 6. Normalización de sonoridad

La preparación mide sonoridad integrada, no solo RMS o pico:

```ts
type LoudnessAnalysis = {
  integratedLufs: number;
  samplePeakDbfs: number;
  recommendedGainDb: number;
  targetLufs: number;
  ceilingDbfs: number;
  analysisVersion: string;
};
```

Valores iniciales:

- objetivo: `-14 LUFS`;
- techo: `-1 dBFS`;
- aumento máximo: `+8 dB`;
- reducción máxima: `-12 dB`.

Ruta de señal:

```text
buffer de pista
  → ganancia de normalización
  → ganancia de crossfade
  → headroom/limitador de seguridad
  → volumen del usuario
  → salida
```

Reglas:

- La normalización no reescribe el archivo cacheado.
- No modifica BPM, tono ni `playbackRate`.
- El control de volumen conserva su rango y semántica actuales.
- La ganancia recomendada respeta el techo de pico y se cachea junto al
  fingerprint y `analysisVersion`.
- Si el análisis falla, se usa ganancia neutra y se continúa; nunca se detiene
  la sesión por no poder normalizar.

## 7. Ciclo de vida de caché

Ruta lógica nueva:

```text
NeoAres/
└── MediaCache/
    ├── audio/
    └── cache-index.json
```

Política inicial:

```ts
type CachePolicy = {
  maxBytes: 1_073_741_824;       // 1 GiB
  cleanupTargetBytes: 786_432_000; // 750 MiB
  maxUnusedAgeDays: 30;
  partialMaxAgeMinutes: 60;
  sweepIntervalMinutes: 30;
};
```

La limpieza ocurre:

- al iniciar la aplicación;
- cada treinta minutos aunque la aplicación siga abierta;
- al volver de suspensión;
- después de superar el presupuesto;
- por acción manual del usuario.

Nunca se elimina un archivo que esté:

- reproduciéndose;
- preparado como siguiente pista;
- descargándose o leyéndose;
- protegido por el snapshot recuperable activo.

El orden de limpieza es: parciales abandonados, entradas inválidas, LRU no
protegido y, por último, archivos mayores de treinta días. Al cruzar 1 GiB se
limpia hasta 750 MiB para evitar barridos continuos.

### 7.1 Migración

Se migran y deduplican:

- `NeoAres/Cache/sources`;
- `youtubeshuffle/Cache/sources`.

La migración valida tamaño, extensión e ID, elimina `.part` abandonados y solo
retira los directorios anteriores después de verificar la copia y el índice.

## 8. Puertos de escritorio

```ts
interface AppStatePort {
  load(): Promise<AppState>;
  save(state: AppState): Promise<void>;
}

interface SessionPort {
  loadActive(): Promise<SessionSnapshot | null>;
  saveActive(snapshot: SessionSnapshot): Promise<void>;
  clearActive(): Promise<void>;
}

interface CachePort {
  getStats(): Promise<CacheStats>;
  getPolicy(): Promise<CachePolicy>;
  savePolicy(policy: CachePolicy): Promise<void>;
  cleanup(): Promise<CacheCleanupResult>;
  clearUnused(): Promise<CacheCleanupResult>;
  protect(sourceIds: string[]): Promise<void>;
}
```

## 9. Orden de implementación

1. Contratos, repositorios atómicos e índice/migración de caché.
2. Restauración del último DJ y snapshot de sesión.
3. Coordinador único de cola y continuidad.
4. Clasificador de contenido musical.
5. Análisis LUFS y ganancia por deck.
6. Controles visibles de almacenamiento.
7. Pruebas prolongadas y nuevos paquetes de distribución.

La continuidad se implementa y valida antes de añadir normalización o interfaz
de almacenamiento, porque constituye la promesa principal del producto.

## 10. Criterios de aceptación

- Reiniciar NeoAres restaura último DJ, cola, orden e índice; permite continuar
  cerca de la posición guardada.
- `Terminar` impide que esa sesión vuelva a ofrecerse para recuperación.
- En operación normal siempre existen al menos cuatro pistas futuras.
- Una entrevista o documental con el nombre correcto del artista no entra a la
  cola.
- Las pistas reproducidas quedan aproximadamente a ±1 LU del objetivo cuando el
  material permite hacerlo sin superar el techo.
- Mover el volumen no altera ni recalcula la normalización.
- La caché permanece dentro del presupuesto y puede limpiarse con la aplicación
  abierta sin tocar audio protegido.
- La migración conserva archivos válidos y elimina parciales abandonados.
- Una prueba de sesión de dos horas con fallas inyectadas de búsqueda, descarga
  y decodificación no termina por un error recuperable ni deja silencio sin
  iniciar recuperación.
