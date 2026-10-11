# Full Player y visuales nativos — contrato

Implementación autorizada 2026-10-10. Reemplaza restricciones DOM/cero IPC de
frames en VISUALIZER.md; conserva motor, presets, biblioteca y audio real.
Diseño: docs/design/full-player/PROPOSAL.md. Viabilidad ejecutada:
docs/native-visualizer-validation/README.md. Feature completo, no MVP.

## Player y shell

- Sin hero/promoción ni encabezados duplicados. Barra compacta: DJs, DJ activo,
  estado y acciones de sesión. Sidebar superpuesto, idioma persistente al pie
  (Sistema/Español/English), menú hacia arriba. Escape devuelve foco.
- Mixer estable al resize, idioma, cola y sidebar. Sidebar/cola se excluyen.
- Recuperación de sesión: la barra superior conserva DJ + estado, sin tres
  acciones compitiendo. El transporte central ofrece «Continuar sesión» con
  texto e icono; «Descartar sesión» permanece visible en herramientas, nunca
  depende de un breakpoint que oculte su etiqueta. Espacio usa el mismo flujo.
  Durante preparación se conservan portada, título y posición guardada; spinner
  y acciones deshabilitadas evitan duplicados. Descartar limpia el repositorio.
- Portada dominante también en escritorio e intermedios, con título/artista,
  progreso y transporte agrupados en una columna de máximo 560px. La cola
  acoplada tiene máximo 480px. La portada se dimensiona por altura disponible,
  no por un tamaño fijo de miniatura. Sin waveform cargada, progreso fino con
  posición guardada, nunca un bloque de onda vacío. En altura baja, composición
  horizontal compacta. Volumen/herramientas comparten fila si hay espacio y se
  separan en vertical estrecho; no se remonta el mixer al cambiar composición.
- Portadas: `TrackArtwork quality="cover"` usa el original nativo del mismo
  asset en los formatos conocidos de YouTube Music; cola/miniportadas conservan
  `quality="thumbnail"`. Resolución al renderizar, también para sesiones antiguas,
  sin migración ni búsquedas adicionales. Si falla el original, usar miniatura;
  si ninguna carga, icono neutro. No reescribir hosts/formatos desconocidos ni
  cambiar album/imagen por otra. Vídeos: maxres → sd → imagen conocida, rechazando
  placeholders pequeños aunque respondan 200. Estado de fallback reiniciado por
  identidad/URL/calidad; una respuesta vieja nunca cambia la portada nueva.
- Sin scroll global desde 360×360 de contenido. Vertical estrecho con altura:
  portada cuadrada dominante arriba, título/artista debajo, progreso fino,
  transporte centrado, volumen separado, EQ/Visuales/Cola al pie. Horizontal bajo
  conserva portada pequeña y progreso fino, nunca esconde transporte.
- Cola acoplada en ancho suficiente; de otro modo sheet ascendente que termina
  antes del transporte/volumen/herramientas. Scroll interno exclusivamente.
  En modo sheet, cola y EQ ocupan todo el ancho y empiezan bajo la misma barra
  superior, sin dejar asomar la tarjeta por arriba o los laterales. EQ llega
  exactamente al borde inferior, sin margen ni radio; sus once columnas
  (preamp + diez bandas) caben sin scroll horizontal.
  Miniportadas 44px, título16/artista14, filas68, asa derecha, sin números/bordes.
  Resumen de cuatro reservas y estado por ID. Mantener añadir, renovar, reemplazar,
  quitar y reordenar con arrastre y menú accesible. Next depende del próximo ID.
- Errores visibles/acotados. Auxiliares EQ/búsqueda/DJ adaptables, scroll propio.
  Añadir canciones en ventana estrecha (≤719px) ocupa todo el contenido de la
  ventana, sin márgenes exteriores; solo los resultados tienen scroll. El foco
  del buscador afecta al contenedor completo con lupa, nunca al input interior.
  Cada resultado ofrece NEXT y END en botones independientes de un clic, sin
  selector global. Estados de espera/ya en cola/error, bloqueo de doble clic,
  Escape y retorno de foco; respuestas tardías no contaminan una reapertura.
  ES/EN, foco visible y reduced motion. Tamaños QA: 360×360,390×667,390×844,
  360×713,583×925,640×480,800×600,800×900,1024×600,1280×720.

## Ownership / ventanas

- Actualización autorizada 2026-10-11: ambas ventanas usan `frame: false` sin
  controles nativos del SO. PlayerWindowFrame introduce una barra propia de 32px
  encima de la barra de sesión de 56px. Minimizar, maximizar/restaurar y cerrar
  comparten WindowControls; visual conserva Pin y fullscreen por separado.
  Icono/tooltip reflejan estado nativo, también cambios externos y fullscreen.
  Restaurar durante fullscreen sale de fullscreen. Barra principal permanece
  accesible con sidebar, cola, EQ y diálogos; visual conserva auto-hide.
- Alturas centralizadas: controles32 + sesión56 = inicio88px de sheets; búsqueda
  estrecha y sidebar empiezan bajo controles32px. En un navegador sin API no se
  dibuja barra ficticia ni se reserva altura. Mixer no se remonta al cambiar
  estados de ventana. Context isolation, sandbox y webSecurity siguen activos.
- Una BrowserWindow visual reutilizable. Principal único dueño de mixer, EQ,
  preparación, GC, fuentes y media keys. Visual jamás crea otra reproducción.
- Cerrar principal con visual abierto la oculta; cerrar visual restaura principal.
  Salir explícitamente destruye ambas. Reload/crash/destrucción del dueño cierra
  visual; crash visual libera puente y admite reapertura sin parar música.
- Fullscreen nativo, ventana sin frame, barra propia arrastrable. Geometría
  persistida fuera de fullscreen y clamped a pantallas actuales; no interpretar
  geometría DOM anterior sin clamp. Activate restaura principal oculta.
- Canvas completo, header/footer overlay sin desplazar canvas. Auto-hide 2,5s;
  actividad/teclado revela; fijar, biblioteca, foco/menús y errores lo suspenden.
  Tarjeta de canción persiste según showTrackInfo; cursor se oculta en reposo.

## Protocolo

- `window-controls:get-state`, `window-controls:command`, `window-controls:changed`:
  preload de ambos roles expone getState/command/onState. Main solo acepta el
  main frame del owner o del visualizer vivo; cada caller controla exclusivamente
  su propia ventana. Lista cerrada `minimize | toggleMaximize | close`, sin IDs
  ni API BrowserWindow genérica. Snapshot maximized/fullscreen/minimized/focused;
  eventos externos sincronizan UI. Subframes/otros callers/comandos se rechazan.
  Close invoca `.close()` para conservar el lifecycle anterior, nunca `.destroy()`.
- Main valida remitente/rol y documento local; broker MessageChannelMain directo,
  sin relay PCM. Preload visual limitado a visuales, locale/estado lectura y
  funciones de su ventana; sin fuentes/caché/DJs/sesiones.
- Generation UUID por conexión, sequence creciente, sampleRate real, producedAt.
  source===window y origen controlado; null solo file://local. webSecurity activo.
- Tap post-master → AudioWorklet → 1024 muestras mono/L/R unsigned8, mono=(L+R)/2.
  Pool fijo 3×3072 bytes transferibles/devueltos. Descarta si agotado; jamás espera
  ni acumula sin límite. Consumidor copia último frame/devuelve buffer, valida
  tamaño/generation/sequence/rate, silencio si pausa o stale >100ms.
- Estado canción/playing/sampleRate/locale por IPC (~4Hz), sin audio. Snapshot
  inicial en handshake. Contexto visual suspendido solo metadata para Butterchurn
  audioLevels; sin fuentes ni salida. Render/muestreo pausado al minimizar visual.
- Dispose idempotente, attach async cancelable, libera exclusivamente tap/puerto/
  worklet propio. Preserva master y reproducción. Mantener presets, importación,
  favoritos, lock, auto-change, calidad y recuperación WebGL existentes.

## Implementación / gates

Shell: App, Sidebar, AutonomousDjPanel, UpcomingQueue, LanguageSelector y CSS.
Main/broker: electron/native-visualizer.ts. Puente: src/visualizer/native/*.
Reusar VisualizerWindow/Controller/ButterchurnRenderer con fuente externa.
Tests de protocolo/geometría, typecheck/test/build y QA Electron aislado de UI
real con señales conocidas, tamaños anteriores, idioma, cola, EQ, lifecycle,
fullscreen/reapertura. No declarar Windows/4K/sesiones largas certificados por
compilar en macOS. Ningún fixture ni runner es la UI de producción.
