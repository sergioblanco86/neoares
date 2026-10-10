# Validación técnica — Full Player y visuales nativos

Fecha: 2026-10-10. **Dictamen: viable en macOS, con evidencia ejecutada.**
No se ha integrado el feature ni modificado la UI, mixer, presets o perfil real.
El diseño está aprobado; esta prueba resuelve el riesgo del puente de audio.

## Alcance y método

Historia verificada: un único `DualDeckMixer` real alimenta una rama post-master;
un AudioWorklet recoge su PCM estéreo, lo entrega por MessagePort directamente a
otra ventana nativa, y el Butterchurn instalado consume esas muestras externas.
No se sustituye el motor por una animación de demostración.

Se usó el skill de verificación para comprobar cada frontera con datos:
mezclador → PCM → puerto → motor → canvas, incluyendo ciclos de vida nativos.
No hacen falta credenciales, servicios externos ni cambios de entorno de NeoAres.

- Electron 44.4.3 / Chromium 152, macOS 15.6.1, arm64.
- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.
- Perfil temporal independiente. HTML de prueba sin la aplicación React ni su
  preload, repositorios, caché, DJs o biblioteca del usuario.
- Dos decks con señales deterministas, canales de frecuencias diferentes; no
  muestras ficticias enviadas al visual. Se generan AudioBuffers de prueba y se
  reproducen a través del mezclador de producción, incluidos EQ y safety.
- Salida de las ventanas silenciada por Electron para no interrumpir música
  del usuario. Las mediciones se hacen antes de ese mute del sistema.
- El visual conserva un AudioContext **suspendido**, sin fuentes ni conexión a
  su salida. Solo proporciona el sample rate al motor: no reproduce otra música.
- Primero se probó con Vite. La ejecución definitiva usa un bundle esbuild y
  `file://`, sin servidor, con `backgroundThrottling: true` en la principal.
  Esto verifica carga de assets compilados, no firma/distribución de un `.app`.

## Resultado definitivo

**75 comprobaciones aprobadas**, sin errores JavaScript de los renderers.
Datos completos: [result.json](result.json). Captura real: [native-visual.png](native-visual.png).

| Frontera o condición | Evidencia |
| --- | --- |
| PCM real consumido por Butterchurn | RMS del frame recibido y del `engine.audio.timeArray` coinciden; RMS mono base ~0,05467. |
| Estéreo | Se identifican 93,75 Hz en L y 375 Hz en R, con separación respecto al canal equivocado >5×. |
| Volumen post-master | Al pasar de 0,8 a 0,4, RMS recibido ×0,50216: no se duplica la ganancia. |
| Mute | RMS consumido = 0. |
| EQ | Boost de 125 Hz: amplitud de la señal de 93,75 Hz ×1,739; la de 375 Hz ×1,074. Se recibe el resultado del filtro, no una indicación de UI. |
| Pausa | Contexto de audio suspendido; el visual entrega silencio, no reutiliza indefinidamente el último PCM. |
| Reanudar y seek | Vuelven frames audibles y la frecuencia correcta, sin otra instancia del mezclador. |
| Principal minimizada/oculta | Audio y visual continúan; ~180 renders en ventanas de medición de 1,5 s. |
| Cierre interceptado de la principal | Se oculta conservando el dueño del audio; los visuales siguen. Es una política candidata probada, no una preferencia del usuario ya confirmada. |
| Consumidor bloqueado 900 ms | Máximo **3 frames en vuelo**, 49 emisiones descartadas; recuperación sin cola creciente ni bloqueo del audio. |
| Visual minimizado/restaurado | El dueño del audio permanece `running`; el visual recupera PCM. |
| Fullscreen | Entrada y salida de fullscreen nativo en la ventana visual. |
| Geometría independiente | Principal con contenido 360×360; ventana visual redimensionada/movida por separado. |
| Dos monitores | Visual movido entre pantallas 2× y 1×; `devicePixelRatio` cambia a 2 y 1; recepción/render continúan. |
| Crossfade | Durante la transición se reciben frecuencias de ambos decks; después domina B. |
| Presets existentes | Los seis presets bundled de la prueba generan imagen no negra; diferencia mínima entre sus thumbnails ~44,13/255, calculada sobre los pixels guardados. No demuestra que todo preset importable sea válido. |
| Reaperturas | 30 ciclos completos de ventana + engine + puerto + AudioWorklet, después de la instancia inicial. 31 puentes creados y 31 dispuestos en el checkpoint. |
| Recursos | Sin puente/tap owned activo en ese checkpoint; cinco procesos en las muestras de los ciclos 5 y 30. Working set agregado ~357,7 → 345,8 MiB. No crece en esa muestra; **no es una prueba de ausencia absoluta de fugas**. |
| Sample rate | Pipeline real a 44.100 Hz. El motor también respeta contextos de metadatos a 44.100 y 48.000 Hz; el pipeline completo a 48.000 Hz no se ejercitó. |

### Latencia: qué se midió y qué no

En las fases normales medidas, desde la emisión del AudioWorklet hasta consumir
el frame en el render, p95 **9–11 ms**, máximo observado **12 ms**. El criterio
del laboratorio era p95 <100 ms. Transporte hasta recepción: p95 ~1 ms en baseline.

No es latencia acústica total ni medición de sincronía perceptual: no incluye
completa la ventana de 1024 muestras (~23,2 ms a 44,1 kHz), el buffer/hardware de
salida, compositor o refresco del monitor. Los timestamps usan `Date.now()`.
La prueba usa canvas interno 640×360; no extrapolar estos números a 4K/HiDPI,
cualquier GPU, horas de ejecución, o todos los presets de terceros.

## Hallazgos corregidos durante la validación

1. El autoplay del laboratorio iniciaba el contexto auxiliar del visual. Se
   suspendió explícitamente: el motor funciona igual con muestras externas.
2. Restaurar y ocultar inmediatamente provocaba una carrera nativa y dejaba
   visible la principal. Se esperó `restore` antes de la siguiente operación.
   El PCM continuó en todo momento; fallaba la condición de visibilidad del test.
3. La carga `file://` produce un origen opaco `null` en `postMessage`. El filtro
   estricto anterior descartaba los puertos y no llegaba PCM. Se acepta ese origen
   **solo para la fixture local**, conservando `event.source === window`, tipo de
   mensaje y puerto esperado. La integración debe elegir y testear un origen
   local controlado (o este tratamiento explícito), nunca relajar globalmente
   `webSecurity` ni exponer IPC arbitrario.

La ejecución definitiva incluye esas correcciones; los fallos iniciales no se
interpretan como resultados aprobados. Chromium emitió un aviso nativo
`TASK_SUPPRESSION_POLICY ... invalid argument` durante un ciclo; no hubo caída
del renderer, error JS ni pérdida funcional observada. No se oculta como un fallo
de audio, pero conviene revisarlo si reaparece con síntomas en QA de producción.

## Arquitectura que queda respaldada

```text
Un único mixer existente → EQ/safety/master → salida audible
                                      └→ tap → AudioWorklet
                                                  ↓ PCM mono/L/R, pool de 3 buffers
                                             MessagePort directo
                                                  ↓
                            BrowserWindow independiente → Butterchurn → canvas
```

El main entrega los puertos; no reenvía cada frame PCM. Un canal separado lleva
estado de pausa/reanudación. El consumidor devuelve buffers, descarta frames
obsoletos y usa silencio ante pausa/ausencia. La captura no depende del RAF ni de
timers de la UI principal; funcionó incluso conservando su throttling actual.
La prueba valida PCM de 1024 bytes/canal y 60 emisiones/segundo aproximadas.

La capacidad de [conectar renderers mediante MessagePorts](https://www.electronjs.org/docs/latest/tutorial/message-ports)
y el ciclo de vida de [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
están documentados oficialmente; el funcionamiento concreto se comprobó aquí,
no se dedujo solamente de esa documentación.

## Lo que aún corresponde a implementación/QA

No hay un impedimento técnico observado para empezar. No significa que el
feature de producción esté terminado ni que se puedan omitir sus contratos.

- Actualizar los contratos que aún exigen el visualizador DOM. Definir mensajes
  tipados, roles, validación del remitente, sesión/generación, negociación de
  sample rate, secuencias, timestamps y reconexión/cierre idempotente.
- Adaptar el wrapper actual de Butterchurn y controlador sin perder presets,
  biblioteca, favoritos, importación, ajustes, recuperación de WebGL ni shortcuts.
- Integrar shell responsive, cola con miniportadas y todas sus acciones, paneles
  auxiliares en 360 px, errores, estados vacíos, accesibilidad y ES/EN.
- Auto-hide/foco/menús/cursor, resize real del framebuffer, calidad/DPR adaptativa
  y ahorro de GPU/captura al minimizar el visual. En esta prueba no se optimizó
  el consumo de una ventana visual minimizada.
- Persistencia/migración de geometría DOM a coordenadas nativas; clamp al área
  de trabajo y recuperación tras desconectar un monitor. No se desconectaron
  monitores reales durante la prueba.
- Confirmar con el usuario la política final de cerrar/ocultar principal y
  restaurarla cuando se cierra el visual. Técnicamente puede hacerse.
- Regresión real de preparación de cuatro canciones, GC, EQ y transiciones,
  sesiones largas y música real. Aquí se usaron señales deterministas conocidas.
- **Windows sigue sin validar**. Se necesita ejecutar el mismo laboratorio y
  después QA integrado allí. Tampoco se verificaron firma, instaladores o 4K.

## Reproducción

Desde la raíz del proyecto:

```sh
pnpm exec electron scripts/verify-native-visualizer.cjs --packaged --owner-throttled
```

Imprime la carpeta temporal de evidencias y crea ventanas identificadas como
prueba. Al terminar las cierra. No abre ni escribe el perfil real de NeoAres.
Sin flags usa Vite aislado en un puerto efímero. `--tail` ejecuta solo las fases
de lifecycle para depurar después de validar las fronteras de PCM iniciales.

Los archivos bajo `scripts/native-visualizer-proof*` y este runner son laboratorio,
no código de producción. No deben empaquetarse como UI final.
