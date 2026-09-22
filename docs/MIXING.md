# Motor de mezcla

## 1. Objetivo

Producir continuidad agradable usando dos decks, análisis anticipado y planes de
transición deterministas. La seguridad musical y operativa tiene prioridad
sobre efectos complejos.

## 2. Modelo de decks

- Un deck está en `EMPTY`, `LOADING`, `CUED`, `PLAYING`, `FADING` o `ERROR`.
- Solo un deck es maestro antes de iniciar una transición.
- El segundo deck debe estar cargado y listo desde el inicio de la pista antes
  de armar la transición.
- Al terminar, el deck entrante pasa a ser maestro y el saliente se libera.

## 3. Datos mínimos de análisis

Para preparar y describir la reproducción:

- BPM y confianza.
- Sonoridad y pico verdadero aproximados.
- Duración reproducible.

Datos deseables:

- tonalidad y modo;
- límites de frases;
- energía por segmento;
- probabilidad de voz;
- secciones como intro, verso, coro, puente y outro;
- cambios de tempo.

## 4. Tipos de transición

### `CROSSFADE`

Solapamiento por ganancia equal-power. La pista saliente baja mientras la
entrante comienza en `0:00` y sube. Ambas se reproducen siempre a velocidad
`1.0`, sin alteración de BPM ni tono.

### `FADE_THEN_START`

Salida breve y comienzo limpio. Es la alternativa conservadora predeterminada.

## 5. Selección del tipo

`CROSSFADE` es la transición normal. Si la pista saliente ya terminó porque el
temporizador llegó tarde, queda prohibido volver a iniciarla: el deck entrante
comienza inmediatamente con un fade-in corto.

## 6. Límites iniciales

- Ajuste de tempo: 0 %; siempre se conserva `playbackRate = 1`.
- Crossfade automático actual: 6 segundos.
- Margen de seguridad: iniciar la transición 0,5 segundos antes de la ventana
  estricta de crossfade.
- Recuperación tardía: fade-in de máximo 0,4 segundos, sin reiniciar el deck
  saliente.
- Headroom de mezcla: mínimo 1 dB; objetivo inicial, 3 dB.
- No iniciar una transición que dependa de datos con confianza inferior al
  umbral definido por tipo.

Estos valores son defaults de producto, no constantes de implementación.

## 7. Compatibilidad tonal

La tonalidad es una señal secundaria y nunca supera una incompatibilidad
rítmica o una regla del usuario. El planificador puede considerar:

- misma tonalidad;
- relativa mayor/menor;
- vecinos compatibles en representación Camelot;
- transición energética intencional con confianza menor.

Si el análisis tonal no es fiable, su peso pasa a cero.

## 8. Conflictos vocales

Evitar solapar dos segmentos con alta probabilidad vocal. Si no existe región
instrumental suficiente:

- reducir la duración del crossfade;
- usar salida antes del final;
- empezar la siguiente pista en su inicio limpio;
- elegir `FADE_THEN_START`.

El MVP no requiere separación en stems.

## 9. Plan de transición

Un plan contiene:

- IDs de pistas y análisis exactos;
- tipo y nivel de confianza;
- tiempos de salida y entrada;
- beats/frases de anclaje;
- rates de reproducción;
- curvas de ganancia;
- duración del solapamiento;
- precondiciones;
- fallback;
- fecha de expiración ligada a las fuentes temporales.

El esquema canónico está en
[`transition-plan.schema.json`](../contracts/schemas/transition-plan.schema.json).

## 10. Precondiciones de ejecución

Antes de armar:

- ambas fuentes siguen disponibles;
- los hashes o fingerprints corresponden al análisis;
- el deck entrante está cargado;
- el buffer mínimo se cumple;
- el dispositivo de audio no cambió a un modo incompatible;
- el reloj y la latencia están dentro de tolerancia;
- el plan no expiró.

Si alguna falla, se selecciona un fallback y se emite un evento.

## 11. Continuidad y recuperación

Orden de recuperación cuando la siguiente pista no está lista:

1. Extender la pista actual hasta otro punto de salida válido.
2. Activar un loop musical previamente validado.
3. Promover una pista alternativa ya preparada.
4. Ejecutar una transición conservadora.
5. Si no queda audio disponible, hacer fade controlado y declarar `STALLED`.

Nunca se repite ciegamente “los últimos diez segundos”. Un loop debe empezar y
terminar en límites compatibles y evitar un salto audible en la medida posible.

## 12. Métricas por transición

- desviación temporal estimada entre beats;
- ajuste de tempo aplicado;
- duración real del solapamiento;
- underruns o frames perdidos;
- pico máximo durante mezcla;
- fallback utilizado;
- intervención del usuario;
- calificación posterior.

## 13. Criterios de aceptación iniciales

- Cero clipping digital en el conjunto de prueba.
- Ningún plan se ejecuta con IDs o análisis distintos a los aprobados.
- El cambio de deck maestro no produce pérdida de estado.
- Un fallo del deck entrante no detiene prematuramente el saliente.
- El botón de skip siempre conduce a una salida acotada y predecible.
- El mismo plan sobre las mismas fuentes produce tiempos equivalentes dentro de
  la tolerancia definida por el motor.
