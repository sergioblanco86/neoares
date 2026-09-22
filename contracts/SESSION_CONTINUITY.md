# Contrato de continuidad de sesión

Este contrato es normativo. Implementa la promesa central de NeoAres: después
de iniciar un DJ, un fallo recuperable de descubrimiento o preparación no debe
detener la música.

## 1. Invariantes

- `PLAYING` implica una pista audible o una transición activa.
- Antes de consumir la pista actual debe existir una pista `READY` o una
  estrategia de recuperación armada.
- Una cola visual nunca cuenta pistas con estado `PLAYED`, `SKIPPED` o `FAILED`
  como próximas.
- Un fallo pertenece a un intento de preparación, no a la pista para siempre ni
  a la sesión completa.
- Solo el usuario puede convertir `PAUSED` en una pausa indefinida.
- Curaduría, persistencia, limpieza y análisis opcional jamás bloquean el reloj
  de audio.

## 2. Estados operativos

```ts
type RuntimeSessionState =
  | "IDLE"
  | "DISCOVERING"
  | "PREPARING"
  | "PLAYING"
  | "PAUSED"
  | "TRANSITIONING"
  | "RECOVERING"
  | "STALLED"
  | "ERROR";
```

`RECOVERING` significa que la pista actual continúa y el sistema busca o
prepara una alternativa. `STALLED` significa que no existe audio reproducible
en ese instante, pero la sesión sigue intentando recuperarse. Ninguno es
terminal.

`ERROR` solo se permite cuando:

1. el mixer o el dispositivo de audio no pueden reproducir ningún buffer;
2. el estado interno es inválido y no puede reconstruirse desde el snapshot;
3. una política explícita exige detenerse;
4. se agotaron todas las estrategias de recuperación y el error fue registrado
   con causa estructurada.

## 3. Preparación de la siguiente pista

```ts
type PreparationFailureCode =
  | "SOURCE_TIMEOUT"
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_CANCELLED"
  | "SOURCE_READ_FAILED"
  | "AUDIO_DECODE_FAILED"
  | "DECK_LOAD_SUPERSEDED"
  | "CONTENT_REJECTED"
  | "UNKNOWN";

type PreparationAttempt = {
  attemptId: string;
  sourceId: string;
  deck: "A" | "B";
  generation: number;
  startedAt: string;
  deadlineAt: string;
};
```

Reglas:

- Cada deck acepta un solo intento activo identificado por `attemptId`.
- Una carga nueva cancela o reemplaza explícitamente la anterior; el intento
  reemplazado no elimina la pista de la cola.
- `SOURCE_TIMEOUT` puede reintentarse una vez y luego promueve una alternativa.
- `DECK_LOAD_SUPERSEDED` no significa que la fuente sea inválida.
- `CONTENT_REJECTED` bloquea ese source ID durante la sesión.
- Toda falla preserva código y mensaje para diagnóstico local.

## 4. Deadline y temporizador de transición

El coordinador calcula un deadline a partir de la duración real del buffer. El
temporizador es una señal para evaluar el estado, no una llamada de un solo
intento a `advance()`.

Al llegar el deadline:

1. Si el siguiente deck está `READY`, se ejecuta el crossfade.
2. Si está `LOADING` y queda audio, se permanece en `RECOVERING` y se programa
   una comprobación corta.
3. Si existe otra pista preparada, se promueve inmediatamente.
4. Si la actual terminó y el siguiente deck queda listo tarde, la siguiente
   comienza de inmediato con fade-in corto; nunca se reinicia la anterior.
5. Si no hay audio preparado, se entra en `STALLED`, se muestra una explicación
   y continúan los intentos de recuperación.

Una comprobación que encuentra `nextReady = false` no puede retornar sin
programar la siguiente acción.

## 5. Relleno de cola

- `ensureQueueDepth` es `single-flight`: los llamados concurrentes esperan el
  mismo `Promise`.
- El resultado incluye `added`, `remaining`, `attempts` y errores por estrategia.
- La preparación que llega al final de la cola espera el refill activo en vez
  de interpretar `refill in progress` como `queue exhausted`.
- Si una consulta produce cero resultados, se rota la estrategia de búsqueda,
  se relajan solamente exclusiones blandas y se aplica backoff acotado.
- Las exclusiones duras del DJ nunca se relajan.

## 6. Concurrencia y generaciones

- Cambiar de DJ, `Terminar` o desmontar la ventana incrementa la generación y
  cancela trabajos de esa sesión.
- `PAUSE` no cambia la generación ni cancela preparación.
- Una respuesta de una generación anterior se ignora sin modificar cola, deck,
  fase ni mensajes de error.
- Ediciones de cola y preparación pasan por el mismo coordinador de deck; no
  pueden llamar simultáneamente a `load()` sobre el mismo deck.

## 7. Observabilidad mínima

Cada sesión escribe localmente eventos estructurados para:

- inicio y fin de búsqueda;
- inicio, éxito y falla de preparación;
- refill solicitado, unido a otro refill, exitoso o vacío;
- cambio de índice actual;
- transición programada, iniciada y completada;
- entrada y salida de `RECOVERING` o `STALLED`;
- error terminal.

Un error contiene `sessionId`, `attemptId`, `sourceId`, `deck`, `generation`,
`code`, `retryable`, duración y causa segura. No contiene cookies ni secretos.

## 8. Pruebas obligatorias

- El siguiente deck tarda más que el deadline inicial.
- Una descarga expira y la alternativa funciona.
- Una decodificación falla.
- Un refill ya está activo cuando preparación llega al final de la cola.
- Dos acciones intentan cambiar la primera pista futura.
- La ventana queda en background durante una canción completa.
- La aplicación se pausa mientras prepara y luego se reanuda.
- Se pierde y recupera internet con una pista actual y otra preparada.
- La cola cruza los umbrales 4, 1 y 0.
- Sesión continua de dos horas sin intervención.

Ninguna de estas pruebas puede terminar en silencio permanente por un error
recuperable.
