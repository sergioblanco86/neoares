# NeoAres — Full Player y visuales independientes

Estado: **diseño aprobado e integrado; QA automatizado macOS completado** · 2026-10-10.
La UI de producción y la ventana visual nativa ya están implementadas.
Esta carpeta conserva el prototipo y razonamiento de diseño, no la UI ejecutable
final. Ver [implementación y pruebas](../../FULL_PLAYER_VERIFICATION.md) y
[contrato vigente](../../../contracts/FULL_PLAYER_NATIVE_VISUALIZER.md).

La prueba nativa ya se ejecutó: **75 comprobaciones aprobadas**, también con
bundle local sin Vite, principal oculta/minimizada, dos monitores y 30 ciclos de
reapertura. Ver [informe técnico y límites](../../native-visualizer-validation/README.md).
Las secciones de viabilidad siguientes documentan el diagnóstico previo; el
informe reemplaza su condición de «spike aún pendiente». Política implementada:
cerrar principal con visual abierto oculta la principal; cerrar visual restaura
el player; Salir cierra todo. Las secciones siguientes son el historial de diseño.

### Revisión 2 — composición vertical corregida

La primera propuesta conservaba una fila de escritorio centrada en ventanas
verticales: portada pequeña y grandes vacíos arriba/abajo. Que no hubiera overflow
no validaba esa composición. Esa variante queda reemplazada por la siguiente.

Las tres capturas de reproductores aportadas por el usuario son la referencia
visual directa de esta revisión: **portada cuadrada dominante arriba; información
y controles debajo**. Las referencias de escritorio de la sección 2 no justifican
la composición vertical anterior.

- Ventana vertical estrecha (ancho <720, alto ≥600 y alto > ancho): una sola
  superficie, sin tarjeta gigante alrededor ni rótulo REPRODUCIENDO redundante.
- Portada dimensionada por el ancho disponible **y la altura necesaria para los
  controles**. Título/artista debajo, nunca a su lado en este modo.
- Progreso fino con tiempos próximos; anterior/pausa/siguiente centrados;
  volumen en fila independiente; Ecualizador, Visuales y Cola al pie.
- Sin waveform grande en vertical. No duplicar el protagonismo de la portada.
- La cola conserva entrada inferior y no cubre el transporte/volumen/herramientas.
- No aplicar esta composición a ventanas horizontales muy bajas: conservan el
  modo compacto horizontal y su carátula reducida.
- Capturas revisadas: 390×844, 390×667, 583×925 (aproximación a la captura del
  usuario), 320×640 y cola abierta. La portada del mock es tipográfica ilustrativa,
  no el archivo real del álbum; la implementación usará la carátula disponible.

Ver `portrait-review.html` y `portrait-review.png`. Solo cambia el diseño aislado;
la ventana nativa y el audio de NeoAres no se han modificado.

## 1. Objetivo y decisiones recomendadas

### Revisión 3 — cola basada en las referencias aportadas

Se reemplaza la lista densa de la primera propuesta por una superficie continua
centrada en lectura y orden. Las dos nuevas capturas del usuario son la referencia
visual directa, no las páginas de documentación citadas para escritorio.

- Sheet con canción actual compacta (portada, título, artista e indicador de
  reproducción) y sección «A continuación». No dejar la portada gigante detrás
  de una tarjeta flotante de lista: el sheet ocupa el área de contenido superior.
- Filas de ~68–70 px: **miniportada de 44 px**, título 16 px, artista 14 px y
  asa discreta a la derecha. Sin números, bordes o botones encajonados por canción.
  Las referencias orientan la jerarquía; no se copian literalmente. Las miniportadas
  de NeoAres se conservan por indicación expresa del usuario. Para esta demo se
  muestran las de su captura original mediante CSS; producción usará las imágenes
  originales y un fallback intencional cuando no estén disponibles.
- Preparación resumida bajo el encabezado (4 listas / 2 en cola); el estado de
  cada canción sigue disponible semánticamente y en el detalle de acciones.
  Las pendientes añaden texto «En cola»; errores necesitarán mensaje visible.
- Transporte, volumen y herramientas permanecen fuera del scroll. El sheet se
  detiene antes del transporte; en poca altura la lista se desplaza internamente.
- En escritorio se reutiliza la lista plana, sin duplicar la canción actual que
  ya está visible a su izquierda. En el mínimo extremo se omite el resumen actual
  de la cola para conservar espacio, no el player ni su transporte.
- El prototipo permite reordenar con arrastre de escritorio y flechas arriba/abajo
  desde el asa, mantiene el foco y anuncia el nuevo orden. Solo modifica la demo.
  No se han validado gestos táctiles ni integrado el orden real con el preparador.
- Para producción, mover una pendiente al primer puesto debe respetar Next
  deshabilitado hasta que esa canción esté lista; mover una preparada no la debe
  descargar otra vez. No inferir preparación por posición: el estado pertenece al ID.
- No se añaden shuffle, repeat, favoritos ni selección múltiple por aparecer en
  las referencias. Las acciones existentes de añadir/renovar/quitar se conservan
  en la integración, con acceso por menú contextual/teclado sin saturar cada fila.

Ver `queue-review.html`. Sigue siendo diseño pendiente de aprobación, sin cambios
en la aplicación. La implementación debe mantener todas las acciones actuales.

NeoAres es un reproductor de escritorio, no una landing. La canción y su
transporte son el contenido principal; los DJs, la cola y los ajustes acompañan.
Superficie de reproducción, densidad compacta/equilibrada, tema actual conservado.

- Eliminar el hero «Private booth / Choose the mood… / Dynamic curation».
- Una sola barra compacta: DJs, nombre del DJ, estado y Terminar. Eliminar
  duplicación de nombre, descripción y encabezados dentro del player activo.
- El player ocupa el espacio disponible; **no hay scroll global de reproducción**.
- Botones Ecualizador, Visuales y Cola juntos en el player. En tamaños pequeños
  quedan iconos de 40 px con nombre accesible, tooltip y estado expandido.
- Mantener título/artista, progreso/seek, anterior, pausa/reanudar, siguiente,
  volumen y acceso a las tres herramientas. No esconder errores críticos.
- Ocultar primero textos accesorios, BPM y waveform decorativo; no reducir la
  tipografía ni los controles hasta hacerlos ilegibles. En poca altura, reemplazar
  waveform por una línea de progreso/seek, no eliminar la posición de reproducción.
- Propuesta: Visuales abre por defecto **una ventana nativa independiente**.
  No conservar dos instancias visuales simultáneas ni cambiar presets/motor.

## 2. Referencias investigadas

| Referencia oficial | Patrón observado | Aplicación propuesta a NeoAres |
| --- | --- | --- |
| [Apple Music MiniPlayer](https://support.apple.com/guide/music/use-music-miniplayer-mus71d7dcfce/mac) | Ventana pequeña, cola accesible, controles al mover el puntero, variante sin carátula grande | Prioridad al transporte; cola a demanda; visual limpio con controles temporales |
| [Spotify Now Playing](https://support.spotify.com/article/now-playing/) | Transporte y acceso explícito a la cola | Botón Cola junto a EQ/Visuales, sin cambiar de página ni detener la música |
| [Spotify Desktop](https://newsroom.spotify.com/2023-06-20/spotify-desktop-experience-redesign-your-library-now-playing-views-customize/) | Paneles auxiliares colapsables/redimensionables | Separar reproducción y contexto; cola secundaria con scroll propio |
| [Apple Music visualizer](https://support.apple.com/en-me/guide/music/muse3aa39574/mac) | Visuales como vista específica, controles y atajos propios | Ventana dedicada, pantalla completa y atajos con ámbito local |

El panel desde abajo y los umbrales siguientes son decisiones propias de NeoAres,
no afirmaciones de que esos reproductores usen exactamente ese layout.

## 3. Pantallas y adaptación

Los umbrales son una primera propuesta en píxeles CSS del **área de contenido**,
no del monitor físico. Zoom y escalado del sistema cuentan. Validar antes de
congelar como contratos definitivos; no prometer soporte a tamaños arbitrarios.

| Espacio disponible | Composición |
| --- | --- |
| ≥1024 de ancho y ≥560 de alto | Player a la izquierda; cola derecha, ancho mínimo ~320. Scroll solo en filas de cola. |
| 720–1023 de ancho y ≥760 de alto | Player arriba; cola debajo usando la altura restante, con scroll propio. |
| <720 de ancho, ≥600 de alto, orientación vertical | Portada grande arriba; título/artista, seek, transporte, volumen y herramientas debajo. Cola a demanda. |
| Menor ancho o altura que los anteriores | Solo player; Cola abre sheet desde abajo. |
| <420 de alto | Carátula reducida; sin BPM/etiqueta extra/waveform grande; seek compacto; transporte y herramientas intactos. |
| Monitor grande | No estirar textos/cará­tulas sin límite: acotar contenido del player, cola entre ~320–480; usar el espacio sin agrandar controles arbitrariamente. |

Mínimo nativo recomendado para iniciar: **480 × 360 de contenido**. El prototipo
incluye estrés a **360 × 320** y **320 × 640**; decidir un mínimo menor solo tras
QA de accesibilidad, strings largos y estados de error. Hoy Electron impone
1040 × 720, por lo que un cambio CSS solo no resolvería el requisito.

Layout propuesto: shell `100dvh`, filas de altura acotada, grid/flex con
`min-height: 0`, `min-width: 0`; `overflow: auto` únicamente en listas y
superficies auxiliares. No resolver el overflow simplemente recortando controles.
Biblioteca de DJs: drawer lateral, no columna permanente que robe ancho al player.
Ecualizador, búsqueda y errores también deben acotarse al viewport al reducir el
mínimo nativo; no basta adaptar la pantalla de reproducción.

### Cola desde abajo

- Animación discreta de entrada ~220 ms; sin animación con reduced-motion.
- Se superpone a carátula/waveform, **no al transporte ni a EQ/Visuales/Cola**.
- Cabecera fija con cantidad, Añadir, acciones y Cerrar. Filas con scroll propio.
- Es un panel no modal: el transporte permanece utilizable con mouse y teclado.
  No hacer el player `inert` ni crear un focus trap que lo vuelva inaccesible.
- Escape, botón Cerrar o clic fuera cierran; devolver foco a Cola. Apertura lleva
  foco a la cabecera/primer control sin iniciar playback ni modificar el orden.
- No abrir simultáneamente sidebar de DJs y sheet de cola. No ocultar opciones
  esenciales al reducir: las acciones secundarias pueden ir a menú Más.
- Al crecer, el mismo estado/datos pasan a cola acoplada. Si ya no cabe, se
  colapsa y mantiene el acceso en Cola. No renderizar dos colas con handlers
  duplicados ni provocar descargas, resets o remount del mixer al cambiar tamaño.

### Estados requeridos

- Detenido/sin DJ: acción Elegir DJ/Iniciar, sin hero de marketing.
- Descubriendo/preparando: primer tema pendiente visible; skeleton en carátula,
  Next deshabilitado con motivo; no esconder el player.
- En vivo/pausado/transición/recuperación: mismo layout y semántica actual.
- Próxima aún no lista: solo Next condicionado por su estado actual, no por las
  otras tres preparaciones. Mantener la reserva y el GC ya implementados.
- Lista vacía/fallos: estado y acción en la cola; errores de sesión breves con
  detalle expandible. No empujar el transporte fuera de la ventana.
- RESTORABLE: Continuar/Descartar en el espacio del player, no encima del shell.
- Títulos largos: truncación con texto completo accesible; no mover botones.
- ES/EN, zoom 200%, foco visible, lectores de pantalla y reduced-motion.

## 4. Visuales: ventana realmente independiente

Una sola ventana `BrowserWindow` dedicada, sin relación `parent` que la convierta
en modal/hija atada a minimizar el player. Redimensionable, movible entre
monitores, fullscreen propio, opción Siempre encima desactivada por defecto.
El botón Visuales abre o enfoca la ventana existente; no genera ventanas nuevas
con cada clic. Preferencias de preset, favoritos, lock y calidad siguen siendo
las mismas. Restaurar geometría nativa usando `screen` y límites visibles del
monitor; no reutilizar sin migración coordenadas DOM relativas a la app.

### Reposo

- Visual ocupa el contenido completo, sin bandas fijas superior/inferior.
- Solo tarjeta discreta de canción (carátula, título, artista y progreso), por
  defecto visible. Se conserva la preferencia actual de mostrar/ocultar info.
- No texto de preset, botones, encabezados ni footer técnicos permanentes.
- Marco nativo reducido/frameless según plataforma. La zona de arrastre y los
  botones nativos deben aparecer al revelar controles; respetar zonas de resize.

### Interacción

- Movimiento, clic o teclado revelan controles; se ocultan tras **2,5 s** sin
  actividad. El puntero inmóvil encima del canvas no los mantiene para siempre.
- La cabecera y controles son overlays que no cambian tamaño del canvas ni
  reinician el preset. Cursor oculto en modo inmersivo mientras están ocultos.
- No ocultar mientras haya foco de teclado en un control, un menú/biblioteca
  abierto, un arrastre, o un error que requiera acción. Botón Fijar controles.
- Barra superior contextual: título, Siempre encima, fullscreen, cerrar.
- Barra inferior: presets anterior/siguiente/aleatorio, favorito/lock, biblioteca
  y calidad/ajustes. **Siguiente preset no es Siguiente canción**: labels claros.
- Escape primero cierra menú, luego sale de fullscreen; en modo ventana revela
  controles. Cerrar visuales no pausa la música. Menú nativo conserva salida.
- Biblioteca/favoritos/importación siguen disponibles en drawer de esa ventana;
  no eliminar features existentes por limpiar la vista.
- Si pausa, los controles se muestran inicialmente, luego pueden ocultarse:
  pausa no debe obligar a mostrar header/footer permanentemente.

Política recomendada pendiente de confirmar: si se cierra la ventana principal
con visuales activos, **ocultarla sin destruir el dueño del audio**; Salir de
NeoAres termina todo. Minimizar el player no debe congelar los visuales.

## 5. Viabilidad: hallazgos reales en el repositorio

### Full Player — riesgo contenido, alcance principalmente UI

- `src/App.tsx`: hero y shell actuales; hay que eliminar hero y duplicación.
- `src/components/AutonomousDjPanel.tsx`: transporte, cola y mixer pertenecen al
  mismo componente; cambiar composición sin recrear el mixer por breakpoint.
- `src/components/UpcomingQueue.tsx`: reutilizar para dock/sheet, no reescribir
  la lógica de preparación o acciones.
- `src/styles/app.css`: overflow y alturas del shell; definir modos por ancho
  **y altura**. Reducir mínimos de `electron/main.ts` con QA de auxiliares.

### Ventana visual — viable, no es solo mover un componente

Actualmente `VisualizerWindow` es un `<section>` dentro del renderer principal.
`VisualizerController` recibe directamente el mixer y obtiene un `AudioNode`
post-master; `ButterchurnRenderer` lo conecta a Butterchurn. Una ventana nativa
tiene otro contexto de ejecución: **no se puede mandar ese AudioNode por IPC**.

La dependencia **instalada**, Butterchurn 3.0.0-beta.5, ya acepta en `render`
`audioLevels: {timeByteArray, timeByteArrayL, timeByteArrayR}` y `elapsedTime`.
Su `AudioProcessor` usa muestras de 1024 bytes por canal y calcula sus niveles
y FFT. Es evidencia de una ruta viable, no una prueba cross-window completada.
El adapter de NeoAres hoy solo declara `elapsedTime`; debe ampliarse y testearse.

Arquitectura recomendada para comprobar en un spike aislado antes de integrar:

```text
Mixer único: decks → EQ → safety/limitador → volumen → salida
                                                └→ tap post-master
                                                    ↓ muestras mono/L/R reales
                              AudioWorklet + adaptador de frames acotados
                                                    ↓ MessagePort
                       Ventana nativa visual: Butterchurn + presets + canvas
                                                    ↑ estado canción/controles
                         Main: ciclo de ventanas, broker, validación y permisos
```

- No segunda reproducción, micrófono, captura del sistema, copia de descargas,
  ni animaciones alimentadas por valores inventados. El visual debe reflejar
  EQ, volumen, mute, seek, pausa y crossfade de la salida real.
- `MessageChannelMain` conecta renderers mediante preload limitado. Transferir
  buffers reutilizables de tamaños fijos, secuencia y timestamp; validar origen,
  dimensiones, sesión y mensajes. El visual no obtiene toda la API de fuentes.
- Consumir el último frame y descartar obsoletos. Backpressure/pool acotado,
  nunca cola infinita ni espera de la ventana visual en el hilo de reproducción.
- Producción de datos desacoplada del RAF del player: el controller actual deja
  de dibujar con `document.hidden`; esa dependencia no sirve al minimizarlo.
  Evaluar AudioWorklet y suspensión/throttling con la ventana principal oculta.
- Preservar estéreo y sample rate real; no asumir 48 kHz. En pausa/mute mandar
  silencio/estado y evitar reutilizar el último frame como si siguiera sonando.
- WebGL solo en la ventana visual; cerrarla libera GPU, puerto y tap, no audio.
  Reabrir usa preset/configuración guardados; fallo de GPU no detiene playback.
- Ventana visual minimizada: reducir/parar render y muestreo innecesario. Si la
  principal está minimizada pero visuales visibles, estos siguen funcionando.

Fuentes técnicas oficiales:
[Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model),
[MessagePorts](https://www.electronjs.org/docs/latest/tutorial/message-ports),
[restricciones de IPC](https://www.electronjs.org/docs/latest/tutorial/ipc),
[BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window).

## 6. Orden de implementación completo propuesto

1. Aprobar composición, mínimo nativo y política al cerrar la principal.
2. Spike aislado: dos ventanas, PCM real por puerto, mismos presets; medir
   sincronización, mute, crossfade, minimizar principal y backpressure. Si falla,
   resolver transporte antes de modificar el feature existente.
3. Contratos finales con mensajes tipados, roles/ownership, geometría, lifecycle,
   estados de UI, accesibilidad y criterios de aceptación. No usar este mock
   como sustituto del contrato de implementación.
4. Full Player + queue sheet + ajustes de auxiliares, sin cambios en playback.
5. Ventana visual nativa + adapter de audio + chrome inmersivo + biblioteca.
6. Regresión automatizada y QA manual Windows/macOS, monitores/DPI diferentes,
   pantalla completa, desconexión de monitor, minimizar y abrir/cerrar repetido.

No es un MVP: son etapas de verificación para entregar el feature completo.
No estimar consumo/rendimiento del puente sin medirlo.

### Gates de aceptación

- Player y transporte visibles, sin scroll global a 1280×720, 1024×600,
  800×900, 800×600, 640×480 y mínimo acordado; scroll solo en auxiliares.
- Queue sheet no cubre transporte; mismos temas, orden, estados y acciones al
  redimensionar. Lista extensa, strings largos y error simultáneo no rompen UI.
- Redimensionar/abrir cola/sidebar no remonta mixer, pausa, descarga de nuevo
  ni invalida las cuatro reservas. GC/EQ/transiciones mantienen sus contratos.
- Visuales puede ir a otro monitor; minimizar o cerrar visuales no detiene audio.
- Controles ocultos tras inactividad, visibles por teclado y con menús abiertos;
  tarjeta de canción persiste según preferencia, sin layout shift del canvas.
- Sync medido contra el tap local (no asumir latencia cero); acordar presupuesto
  después del spike. Mute entrega silencio, pausa no deja PCM viejo y crossfade
  refleja ambos decks, con EQ/preamp/volumen aplicados una sola vez.
- Memoria/puertos/RAF/AudioWorklet no se acumulan tras 30 ciclos abrir/cerrar;
  errores/reconexión no causan doble audio ni presets congelados indefinidamente.

## 7. Prototipo y alcance de la comprobación

[Abrir HTML](prototype.html), o servido por el Vite de desarrollo:
`http://127.0.0.1:5173/docs/design/full-player/prototype.html`.

Cola abre con botón o Q; Escape/clic fuera cierran; sidebar y cola se excluyen.
Visuales abre una ventana demo HTML, no el motor en otra ventana. Su chrome
se revela por actividad y se oculta tras 2,5 s; Fijar mantiene controles.
Carátulas tipográficas y waveform son ilustrativos. Fondo visual: fotograma del
motor actual, reutilizado de evidencia del proyecto; no preset nuevo ni animación.
Algunos botones representan solo posición/estilo, no lógica real de reproducción.

Render/verificación aislada: `pnpm exec electron docs/design/full-player/render.cjs`.
`layout-checks.json` verifica los tamaños del prototipo, ausencia de overflow
global y transporte no cubierto por la cola. **No verifica la app de producción**.

El skill `saas-product-ui-system` guio jerarquía, densidad, tipografía existente,
adaptación según contenido, paneles contextuales y accesibilidad. Las capturas
se renderizan desde HTML; no son promesas de features ya implementados.
