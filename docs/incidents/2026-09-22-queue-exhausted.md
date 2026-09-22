# Incidente: sesión detenida con “No quedan canciones descargables”

Fecha de análisis: 2026-09-22.

Estado: corrección inmediata implementada en el código fuente; pendiente de una
prueba manual prolongada antes de cerrar definitivamente el incidente.

## Síntoma observado

Durante una sesión iniciada, el audio se detuvo y la interfaz cambió a `Error`
con el mensaje:

> No quedan canciones descargables en la cola.

La lista mostraba “14 en cola”, lo que parecía contradecir el mensaje.

## Qué representa realmente la captura

Cuando la fase deja de ser `PLAYING`, `PAUSED` o `TRANSITIONING`, la UI calcula
“Próximas” desde el índice cero en lugar de desde `currentIndex + 1`. Por eso, en
estado `ERROR`, puede volver a mostrar pistas actuales o ya reproducidas como si
fueran futuras. El número 14 no demuestra que existieran 14 alternativas aún
disponibles.

## Camino de código que produce el mensaje

El mensaje solo se genera en `prepareFollowing`. El flujo actual:

1. Busca exactamente `queue[index]`.
2. Si no existe, solicita una ampliación de cola.
3. Si hay otro refill activo, `extendQueue` retorna inmediatamente sin esperar.
4. Si la búsqueda devuelve cero, el refill también retorna sin programar otra
   estrategia ni reintento.
5. El preparador interpreta la ausencia momentánea como agotamiento definitivo
   y cambia toda la sesión a `ERROR`.

Además, cualquier excepción de descarga, lectura, decodificación o carga del
deck se captura sin conservar la causa, elimina el elemento y prueba el
siguiente. El mensaje final dice “no descargables” aunque el fallo real pueda
ser otro.

## Factores que pueden agravarlo

### Temporizador de un solo intento

`advance()` retorna inmediatamente cuando `nextReady` es falso. No programa una
nueva comprobación. Si la preparación termina tarde, la pista actual puede
acabar y dejar silencio.

### Carrera introducida al liberar memoria

La mejora de memoria añadió versionado e invalidación de cargas en
`DualDeckMixer.load()`. Esto es correcto para liberar buffers viejos, pero la UI
todavía permite caminos concurrentes hacia el mismo deck. Una carga sustituida
lanza `DECK_LOAD_SUPERSEDED`; `prepareFollowing` la confunde con una fuente no
descargable y puede eliminar una canción válida.

### Timeout y fallas externas

Las descargas tienen un timeout de veinte segundos. Una red lenta, una fuente
temporalmente indisponible o un cambio del proveedor puede producir una falla
recuperable. Hoy se descarta sin clasificarla ni reintentarla.

### Refills sin garantía de resultado

La cola se amplía en segundo plano y el resultado puede ser cero por filtros,
historial reciente, consultas repetidas o timeout. No existe aún la invariante
de cuatro pistas futuras ni una estrategia escalonada de recuperación.

## Relación con los cambios de CPU y memoria

No hay evidencia de que `backgroundThrottling` sea la causa directa: mientras
la fase es `PLAYING` o `TRANSITIONING`, el código lo desactiva para mantener los
temporizadores activos. La cancelación de procesos de playback solo ocurre al
presionar `Terminar` o desmontar el componente, no durante una reproducción
normal.

Sí existe una relación parcial posible con la invalidación de cargas añadida
para memoria: una colisión de preparación puede producir un falso rechazo. Sin
logs tipados del intento ocurrido no es posible afirmar retrospectivamente cuál
de los factores fue el disparador exacto de esta sesión. El problema de fondo,
sin embargo, es comprobable en el código: todos esos fallos recuperables pueden
terminar la sesión.

## Severidad

`S1 / crítica de producto`: viola la promesa principal de reproducción
continua.

## Corrección requerida

1. Implementar el coordinador `single-flight` de cola y deck descrito en
   [`IMPLEMENTATION_CONTRACTS.md`](../IMPLEMENTATION_CONTRACTS.md).
2. Introducir `RECOVERING` y `STALLED` como estados no terminales.
3. Hacer que el temporizador reevalúe hasta ejecutar transición o recuperación.
4. Clasificar errores y no eliminar una pista por `DECK_LOAD_SUPERSEDED`.
5. Esperar el refill activo; nunca retornar silenciosamente por estar ocupado.
6. Corregir el conteo visual para mostrar solo pistas realmente futuras.
7. Añadir logs locales por intento y pruebas de sesión prolongada con fallos
   inyectados.

El contrato normativo de la corrección está en
[`contracts/SESSION_CONTINUITY.md`](../../contracts/SESSION_CONTINUITY.md).

## Corrección inmediata aplicada

La versión de desarrollo ahora:

- comparte una sola promesa de refill entre llamados concurrentes;
- apunta a seis pistas futuras y relaja únicamente el historial reciente cuando
  la búsqueda estricta no alcanza el objetivo;
- espera el refill activo en lugar de confundirlo con una cola agotada;
- entra en `RECOVERING` y reintenta automáticamente, sin convertir una falla de
  preparación en `ERROR` terminal;
- vuelve a evaluar la transición cada 500 ms cuando el segundo deck aún no está
  listo;
- conserva la causa segura de cada falla en el log local;
- no elimina una pista por una carga de deck sustituida;
- mantiene preparación y refill durante `PAUSE`;
- muestra como próximas solamente las pistas posteriores al índice actual;
- evita operaciones de reorganización que compitan con el deck mientras este se
  prepara, pero mantiene disponible la búsqueda y la inserción al final.

Validación automática: typecheck, 43 pruebas y build de producción correctos el
2026-09-22. Falta ejecutar una sesión manual suficientemente larga y pruebas con
fallas reales de red para declarar el incidente cerrado.
