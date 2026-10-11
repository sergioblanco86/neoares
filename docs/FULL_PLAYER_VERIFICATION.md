# Full Player + visuales independientes — implementación y QA

2026-10-10 · rama `feature/visualizer` · macOS 15.6.1 arm64 / Electron 44.

## Resultado

### Controles propios de ventana y EQ a borde — 2026-10-11

Implementados sin controles nativos del SO: `frame: false` en player y visual.
Barra propia32px del player sobre sesión56px; WindowControls compartido con
minimizar/maximizar-restaurar/cerrar. Visual mantiene Pin/fullscreen y auto-hide.
Restaurar también sale de fullscreen; el player conserva botones accesibles en
ese estado. ES/EN, foco, hover, disabled y color de ventana inactiva definidos.
IPC acotado al sender autorizado/main frame, sin IDs ni BrowserWindow genérico.

**152 tests, typecheck y build aprobados. 51 comprobaciones integradas fuente y
48 sobre el bundle local**: seis tamaños360×713,390×667,583×925,640×480,360×360,
1280×720; geometría EQ/cola/búsqueda/sidebar, controles y estado nativo de ambas
ventanas, cambios externos, minimizar, fullscreen y cerrar con/sin visual abierto.
En fuente también PCM fresco y conservación de las cinco preparaciones (mixer
no recreado). Perfiles temporales, audio/catálogo fixtures; IPC/main/preload/UI
productivos. Cero errores de renderer en las ejecuciones definitivas.
Regresión adicional: **76 comprobaciones bundle**, incluyendo treinta reaperturas,
idioma, cola y fullscreen; **20 de estabilidad EQ fuente**, ES/EN en cuatro
tamaños, sin desplazamiento de bandas/pie mientras cambia Guardando/Guardado.

EQ en sheet: top88px, ancho100%, bottom exactamente viewport, border-radius0.
Once columnas completas sin clipping horizontal; en portrait≥600px todo cabe
verticalmente. En 360×360 el EQ usa scroll propio, nunca scroll global del player.
Sidebar, diálogos y menú de cola respetan la franja de controles; EQ desktop no
puede arrastrarse debajo de ella. Se corrigió además una media query DOM antigua
que reducía visuales nativos a62vh en ancho≤640px; ahora es solo para visual DOM.

El skill `saas-product-ui-system` guio densidad32px y separación de controles de
ventana/música; `react-best-practices` guio subscripciones/cleanup, rechazo de
snapshot inicial obsoleto y guard síncrono de doble clic. `verification` guio
botón → preload → IPC autorizado → BrowserWindow → evento nativo → estado UI.

- [Resultado fuente](full-player-verification/window-chrome/dev-result.json).
- [Resultado bundle local](full-player-verification/window-chrome/packaged-result.json).
- [Regresión bundle](full-player-verification/window-chrome/regression-packaged-result.json).
- [Estabilidad EQ con barra nueva](full-player-verification/window-chrome/eq-stability-result.json).
- [Player estrecho](full-player-verification/window-chrome/player-360x713.png).
- [EQ hasta el borde](full-player-verification/window-chrome/equalizer-360x713.png).
- [Visualizador estrecho sin marco](full-player-verification/window-chrome/visualizer-360.png).
- [Decisión y estudio actualizado](design/full-player/WINDOW_CHROME_PLAN.md).

Límites: Windows/Snap/DPI y arrastre/resize manual del SO requieren QA nativo;
las pruebas automatizadas verifican regiones drag/no-drag por estilo y cambios
de tamaño mediante Electron, no certifican gestos físicos. Sin firma/instalador.
La compilación no es una certificación Windows. Esta mejora cambia main/preload:
**requiere reiniciar NeoAres**, HMR solo no basta. No se interrumpió la sesión
real ni se realizó commit/push de estos cambios.

### Iteraciones anteriores (2026-10-10)

Visualizer: Pin/Lock e importación aprobados con **26 comprobaciones fuente y
25 sobre el bundle local**. Estado activo combina superficie/borde violeta,
icono diferente, tooltip ES/EN y `aria-pressed`. Pin sigue fijando los controles;
Lock sigue bloqueando el cambio automático del preset. No cambiaron su función.
Cancelar archivos/carpeta o un resultado completamente vacío no muestra aviso.
Los avisos duran 5 segundos, también los errores; repetir texto renueva el plazo.
Se cancela el timer al reemplazar aviso, cerrar o desmontar el componente.

Flujo verificado: botón real → preload/IPC real → conversión MilkDrop y
repositorio local real → resultado renderizado → expiración real. Solo se
simula la selección/cancelación del diálogo del SO (y un rechazo deliberado
`QA_PICKER_FAILED` para validar errores); no se automatiza el selector nativo.
Sesión/audio de prueba deterministas y perfil temporal aislado. Se comprobó
persistencia de Lock, atajo L, auto-hide al quitar Pin y reproducción activa al
cerrar visualizer. Cero errores de renderer; los errores IPC del caso deliberado
son esperados. Typecheck, 144 tests y build aprobaron.

- [Resultado fuente](full-player-verification/visualizer-controls/dev-result.json).
- [Resultado bundle local](full-player-verification/visualizer-controls/packaged-result.json).
- [Pin y Lock activos](full-player-verification/visualizer-controls/active.png).
- [Controles ocultos tras quitar Pin](full-player-verification/visualizer-controls/auto-hidden.png).
- [Estudio de barra propia del player](design/full-player/WINDOW_CHROME_PLAN.md):
  propuesta, no implementada; Windows sigue pendiente de QA real.

`saas-product-ui-system` guio los estados visibles sin cambiar geometría;
`verification` guio el recorrido completo por IPC, datos y UI. Estos arreglos
son de renderer: no requieren reiniciar main/preload en desarrollo con HMR.
No se reinició ni interrumpió la sesión del usuario.

Estabilidad del EQ al guardar: **20 comprobaciones fuente aprobadas**. Se
movieron las once bandas, muestreando geometría en cada frame durante Guardando
y Guardado, en ES/EN y 360×713,390×667,583×925,1280×720. El pie ahora tiene dos
filas y reserva el tamaño del mensaje traducido largo; el texto corto de espera
no entrega espacio a los sliders. UI/UX guio la reserva de espacio y el skill
`verification` el recorrido slider → persistencia IPC → estado renderizado.
[Resultado de estabilidad](full-player-verification/eq-saving-stability.json).

Añadir canciones: flujo específico aprobado con **26 checks fuente y 25 sobre
el bundle local** documentados en `full-player-verification/search-fixes/`.
Se probó abrir → buscar por IPC → resultados reales del componente → acción END
o NEXT → orden de cola y preparación real → estado «En cola» → teclado/cierre y
reapertura. Catálogo/audio siguen siendo fixtures deterministas aislados.
Seis tamaños: 1280×720,800×600,583×925,390×667,360×713,360×360; pantalla completa
en estrecho, ambos botones por fila sin recorte y un solo borde de foco exterior
incluyendo la lupa. La revisión React añadió bloqueo síncrono de doble clic y
protección de respuestas tardías entre aperturas; UI/UX guio la composición por
fila y `verification` el recorrido completo sin modificar la sesión del usuario.

- [Resultado fuente de búsqueda](full-player-verification/search-fixes/dev-result.json).
- [Resultado bundle de búsqueda](full-player-verification/search-fixes/packaged-result.json).
- [Captura estrecha](full-player-verification/search-fixes/search-360x713.png).
- [Captura escritorio](full-player-verification/search-fixes/search-1280x720.png).

La comprobación de color espera el final de la transición de foco (160 ms), no
compara un color interpolado contra el definitivo. El render productivo conserva
la transición y el borde exterior único; input interior sin halo ni outline.

Correcciones responsive posteriores: **86 comprobaciones integradas aprobadas**,
incluyendo el tamaño reportado de 360×713. Duración total alineada al extremo
derecho de la línea, Stop centrado, cola y EQ de ancho completo bajo la misma
barra superior. Once columnas del EQ visibles sin recorte lateral; panel completo
sin scroll vertical en los tamaños portrait probados de altura ≥667.
En ventanas de altura mínima se conserva scroll vertical del EQ, no de la app.

- [Resultado de las correcciones](full-player-verification/responsive-fixes/result.json).
- [EQ 360×713](full-player-verification/responsive-fixes/equalizer-360x713.png).
- [Cola 360×713](full-player-verification/responsive-fixes/queue-360x713.png).

Implementación integrada, no mock ni MVP. TypeScript, **144 tests unitarios** en
34 archivos y build completos aprobados. **49 comprobaciones de integración**
con código fuente y **39 con bundle local `file://` sin Vite** aprobadas.

- [Resultado integrado con instrumentación](full-player-verification/dev-result.json).
- [Resultado de bundle local](full-player-verification/packaged-result.json).
- [Regresión de audio/EQ/reserva](full-player-verification/audio-regression.json).
- [Contrato vigente](../contracts/FULL_PLAYER_NATIVE_VISUALIZER.md).
- [Viabilidad previa del puente y sus límites](native-visualizer-validation/README.md).

## Historia comprobada

Sidebar/idioma → player real → reserva de cuatro → cola y controles → único
DualDeckMixer → tap post-master → AudioWorklet/MessagePort → Butterchurn en otra
BrowserWindow → canvas/chrome inmersivo → cierre/reapertura sin parar playback.

Se ejecutan main/preload y componentes React reales. Solo la frontera remota de
fuentes y conectividad se sustituye por fixtures deterministas: WAV estéreo a
44.100 Hz y carátula SVG ilustrativa. No descarga música de Internet ni modifica
DJs, preferencias, caché o sesión del usuario. Perfil y evidencias temporales.
La salida de las ventanas de QA se silencia a nivel Electron.

| Frontera | Evidencia ejecutada |
| --- | --- |
| Layout | 1280×720,1024×600,800×900,800×600,640×480,583×925,390×844,390×667,360×360 de contenido: sin overflow global, controles visibles. |
| Vertical | Portada cuadrada grande encima del título/artista. Dos errores largos no cubren canción/transporte en 390×667. |
| Cola | Sheet termina antes del transporte, mantiene miniportadas, menú accesible incluso con mínima altura. Reordenamiento modifica el orden real. |
| Audio estable | Solo cinco preparaciones: actual + cuatro próximas. Resize, abrir/cerrar cola y reordenar preparadas no repiten la decodificación. |
| Idioma | Menú inferior del sidebar abre arriba, persiste elección y actualiza visuales abiertos sin recrear mixer. |
| Ecualizador | Once controles disponibles a tamaño mínimo; tiene overflow propio. Probe separado aprobado: 31 Hz y 16 kHz aplican ±12 dB en su banda con cambio menor a 0,012 dB en medios; bypass, persistencia y reintentos aprobados. |
| PCM real | En ejecución instrumentada RMS entregado y consumido por Butterchurn coinciden; contexto auxiliar suspendido, sin otra reproducción. |
| Mute/pausa | RMS consumido cero; pausa no conserva PCM antiguo. |
| Visibilidad | Visual sigue con principal oculta/minimizada. Minimizar/restaurar visual no detiene dueño y recupera PCM fresco. |
| Fullscreen | Entrada/salida nativa y controles sincronizados. |
| Inmersión | Header/footer se ocultan tras inactividad, tarjeta permanece; biblioteca sigue accesible. |
| Ownership | Cerrar principal con visual abierto conserva dueño oculto; cerrar visual restaura player. |
| Lifecycle | Treinta reaperturas integradas en cada modalidad; cero puente owned activo al checkpoint instrumentado. No es prueba de ausencia absoluta de fugas. |
| Aislamiento | Preload visual sin fuentes, caché, DJs ni sesiones. IPC main restringido por rol y frame. |
| Assets | Bundle carga presets/WASM y worklet local bajo CSP sin relajar webSecurity; worklet se emite como asset, no data URL. |

La modalidad empaquetada no usa monkeypatch de clases ni instrumentación de PCM:
verifica UI/IPC/ventanas/assets/lifecycle sobre el bundle final. Las mediciones
PCM pertenecen al recorrido de código fuente integrado y a la prueba nativa
previa, no se atribuyen falsamente al bundle final.

## Capturas reales de la UI integrada

Las carátulas son fixtures tipográficas de QA; la UI final usa TrackArtwork con
la imagen disponible de cada canción y fallback existente.

- [Player vertical 390×844](full-player-verification/player-390x844.png).
- [Player vertical 390×667](full-player-verification/player-390x667.png).
- [Player vertical 583×925](full-player-verification/player-583x925.png).
- [Player mínimo 360×360](full-player-verification/player-360x360.png).
- [Escritorio 1280×720](full-player-verification/player-1280x720.png).
- [Visual nativo en reposo](full-player-verification/native-visual.png).

## Hallazgos resueltos durante integración

- CSS anterior mantenía grid horizontal en vertical: se cambió a composición
  artwork-first y portada dimensionada por el espacio real de su contenedor.
- Geometría de cola se recalcula antes de pintar al abrir, además del observer:
  no depende de una medición anterior al resize. Menús salen del scroller por
  portal y se limitan al viewport; teclado/foco conservados.
- Barra de sesión se inserta en topbar mediante portal, sin solaparse con nombres
  largos ni duplicar título. Sidebar no reduce el ancho del player.
- Guardado de idioma es asíncrono/optimista; QA espera confirmación del repositorio,
  no interpreta render inmediato como persistencia terminada.
- Los tamaños grandes se probaron en el monitor de mayor área de trabajo para
  evitar que macOS limite la altura nativa al monitor pequeño.
- Cierre del Vite aislado después de destruir ventanas evita el worker de
  reconexión de desarrollo bloqueado por CSP. No se agregó permiso blob global.
- El probe anterior de audio buscaba los controles en el componente aislado,
  pero el portal los enviaba a la barra del shell oculto. Se aisló ese host y se
  actualizó la consulta del menú portaled. La repetición completa aprobó reserva,
  recarga, tres saltos en 94 ms con señal fixture, EQ y cero leases restantes.

## Arquitectura y mantenimiento

`electron/native-visualizer.ts` gobierna ventanas/roles/geometría. Main entrega
un puerto a cada renderer; PCM nunca hace relay por main. Pool fijo de tres
buffers transferibles. Cada conexión tiene generation y secuencias; receptor
valida tamaño/rate/frescura, copia último frame y devuelve buffer. Captura desde
AudioWorklet no depende del RAF de la principal; minimizado visual pausa emisión.

`VisualizerWindow`, `VisualizerController` y `ButterchurnRenderer` siguen siendo
la UI/motor/biblioteca existentes con una fuente externa adicional. Se mantienen
presets, favoritos, importación, lock, auto-change, calidad y WebGL recovery.
El mixer sigue montado en AutonomousDjPanel. Ningún fixture se incluye como
entrada de producción ni se exponen APIs de depuración en la app.

El skill `saas-product-ui-system` guio jerarquía, tipografía, paneles responsivos
y accesibilidad siguiendo el diseño aprobado. `react-best-practices` guio
ownership/cleanup de efectos, callbacks estables y carga condicional del motor.
`verification` guio la prueba de cada frontera y la corrección del primer fallo
antes de continuar. No sustituyen las evidencias ejecutadas.

## Reproducir

```sh
pnpm typecheck
pnpm test
pnpm verify:full-player
# Instrumentación fuente para comprobar PCM real y contar puentes/preparaciones:
pnpm exec electron scripts/verify-full-player.cjs
pnpm exec electron scripts/verify-audio-features.cjs
pnpm exec electron scripts/verify-full-player.cjs --search-only
pnpm exec electron scripts/verify-full-player.cjs --packaged --search-only
pnpm exec electron scripts/verify-full-player.cjs --eq-stability-only
pnpm exec electron scripts/verify-full-player.cjs --visualizer-controls-only
pnpm exec electron scripts/verify-full-player.cjs --packaged --visualizer-controls-only
pnpm exec electron scripts/verify-full-player.cjs --window-chrome-only
pnpm exec electron scripts/verify-full-player.cjs --packaged --window-chrome-only
pnpm exec electron scripts/verify-full-player.cjs --player-layout-only
pnpm exec electron scripts/verify-full-player.cjs --packaged --player-layout-only
pnpm exec electron scripts/verify-full-player.cjs --artwork-only
pnpm exec electron scripts/verify-full-player.cjs --packaged --artwork-only
```

## Recuperación y portada dominante — 2026-10-11

- Diagnóstico: las acciones de recuperación competían con el título del DJ;
  el CSS heredado ocultaba texto de botones secundarios en anchos ≤760px,
  dejando «Descartar» sin contenido porque no tenía icono. La portada de 84px y
  el bloque de waveform vacío no aprovechaban la altura del player completo.
- Skill `saas-product-ui-system`: una acción principal en el transporte, estado
  compacto en el shell, descarte secundario explícito, portada dominante y
  controles agrupados. Se conservan tokens/idiomas, miniportadas y cola sheet.
- «Continuar sesión» ahora vive en el transporte central; Espacio usa la misma
  función. «Descartar sesión» sigue visible junto a herramientas. Recuperación
  conserva portada/metadatos/posición mientras carga, con spinner y bloqueo de
  doble acción. El progreso guardado se ve aunque aún no haya waveform.
- Gate de layout dedicado con la UI/main/preload/repositorios reales, WAV y
  perfil temporales: 16 tamaños × ES/EN × guardada/reproduciendo = 64 layouts.
  Anchos 360,390,480,481,583,719,720,732,760,761,999,1000,1280,1920; alturas
  360,480,667,710,713,720,925,978. Revisión visual de capturas móvil/intermedia/full.
  Incluye zoom 200%, nombre largo, carga bloqueada, pausa/reanudación, descarte
  persistente y ausencia de nuevas preparaciones al redimensionar.
- Resultado final: fuente **228/228**, build de producción **226/226**, cero
  errores de renderer. Typecheck, **152 tests / 35 archivos** y build aprobados.
  Regresión integrada de producción **76/76**: cola, EQ, idiomas, ventana visual,
  fullscreen, cierre/restauración y treinta ciclos de reapertura conservados.
  Evidencias en `docs/full-player-verification/player-layout/`.
- No se reinició ni cerró la sesión real del usuario. Las capturas usan portada
  fixture y audio silenciado; no certifican fuentes remotas, Windows ni 4K.

## Límites / handoff

- Windows, firma/instaladores, hardware distinto, 4K y sesiones de muchas horas
  siguen pendientes de QA; no están certificados por el build macOS.
- Clamp multimonitor tiene tests y la viabilidad previa movió visuales entre
  monitores 1×/2×. No se desconectó físicamente un monitor durante esta integración.
- No se midió latencia acústica total ni memoria/GPU en sesiones prolongadas.
- Para usar esta versión debe reiniciarse NeoAres: cambió main/preload, no basta
  con HMR del renderer. No se reinició ni interrumpió la sesión real del usuario.
- Cambios locales, sin commit/push; se conservaron las modificaciones previas.
