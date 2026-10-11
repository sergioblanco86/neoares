# Barra de ventana de NeoAres — estudio y propuesta

Estudio: 2026-10-10. Decisión del usuario: 2026-10-11.
Estado: implementado con controles totalmente propios, no overlay nativo.
La decisión nueva reemplaza la recomendación original de conservar botones del SO.

## Decisión implementada

Ambas BrowserWindow usan `frame: false`. Barra propia del player de 32px sobre
la sesión56px; ambas ventanas comparten minimizar, maximizar/restaurar y cerrar.
Visual conserva fullscreen independiente y auto-hide. El player mantiene su
barra accesible incluso en fullscreen, con restaurar como salida de fullscreen.
No se agregan controles nativos mediante titleBarOverlay ni traffic lights.
EQ estrecho llega hasta abajo, sin margen8px ni border-radius.

Implementación: `electron/window-controls.ts`, `src/shared/window-controls.ts`,
`src/components/WindowControls.tsx`, `src/main.tsx`, `src/styles/full-player.css`.
Contrato actualizado: `contracts/FULL_PLAYER_NATIVE_VISUALIZER.md`.
Evidencias y límites: `docs/FULL_PLAYER_VERIFICATION.md`.

## Situación previa al cambio y causa

- `electron/main.ts`, `createWindow`: BrowserWindow principal con marco nativo;
  macOS/Windows dibujan título y botones fuera del renderer.
- `electron/native-visualizer.ts`, `#create`: `frame: false`. El renderer dibuja
  los controles sobre el canvas y los oculta al quedar inactivo.
- `VisualizerWindow.tsx`: el icono de expandir ejecuta **pantalla completa**;
  no es maximizar/restaurar. Pin mantiene visibles los controles, no pone la
  ventana «siempre encima». Lock impide el cambio automático del preset.
- No existía una API de minimizar/maximizar/restaurar la ventana principal
  en el preload. No basta copiar los botones del visualizer.

## Opciones estudiadas originalmente (2026-10-10)

Una franja propia y oscura de **32 px**, encima de la barra de sesión existente
de 56 px. Contiene únicamente nombre NeoAres, zona de arrastre y controles de
ventana. No duplicar nombre del DJ, estado, Stop ni herramientas musicales.
El player y su barra de sesión siguen visibles; no se agrega scroll global.

Recomendación: personalizar la superficie de la barra manteniendo los controles
nativos del sistema integrados: `titleBarStyle: 'hidden'` y, en Windows,
`titleBarOverlay`. macOS conserva los tres botones a la izquierda; Windows sus
controles a la derecha. Esto elimina la franja gris separada sin reinventar sus
interacciones. La coherencia es de superficie, densidad y jerarquía, no exigir
que ambos sistemas operativos tengan los mismos iconos.

Alternativa si se prefieren botones totalmente propios como en el visualizer:
`frame: false`, controles de minimizar, maximizar/restaurar y cerrar. Es viable,
pero necesita IPC nuevo, sincronización de estados y QA nativo más amplio.
No confundir maximizar con fullscreen; conservar fullscreen como acción separada.

## Alcance técnico del estudio

1. Introducir `WindowChrome` en el shell, fuera de App/AutonomousDjPanel:
   redimensionar o cambiar estados de ventana nunca remonta el mixer.
2. Centralizar alturas: `--window-chrome-height`, `--app-topbar-height` y su suma.
   Cola y EQ empiezan debajo de ambas barras. Sidebar, Add songs y demás overlays
   respetan el espacio de controles de ventana, sin perder ancho útil.
3. Reservar el área de controles del SO (`titlebar-area-*` y reserva macOS),
   incluyendo escala, foco/inactividad y cambios de pantalla.
4. Barra arrastrable con `app-region: drag`; botones, menús e inputs `no-drag`.
   Nunca aplicar drag al player, timeline, sliders o lista.
5. Para botones propios: canal acotado a `minimize | toggleMaximize | close`,
   limitado al main frame de la ventana principal; no aceptar ID arbitrario,
   `BrowserWindow` ni métodos generales desde renderer. Estado inicial y eventos
   de maximizar/restaurar/fullscreen/foco para tooltip e iconos correctos.
   Exponer solo eventos necesarios también en la opción de controles nativos.
6. Cerrar debe ejecutar `BrowserWindow.close()`, no destruir ni salir directamente:
   con visualizer abierto, el owner se oculta y el audio continúa; al cerrar el
   visualizer vuelve el owner. Quit explícito sigue cerrando ambos.
7. Fullscreen oculta la franja adicional y recalcula offsets. Conservar menú y
   atajos del SO, accesibilidad y restauración de geometría normal.
8. Cambiar opciones BrowserWindow requiere reiniciar NeoAres; HMR no lo aplica.

## Validación necesaria antes de entregar

- macOS: arrastrar, doble clic según preferencia del SO, minimizar/restaurar,
  cerrar con/sin visualizer, fullscreen/Spaces, menú y atajos.
- Windows real: controles, Snap y su menú, bordes de resize, Alt+F4, maximizado,
  taskbar, escala 100/150/200 %, monitores y cambio de DPI. No certificado en Mac.
- Viewports de contenido: 360×360, 360×713, 390×667, 640×480 y desktop. Ningún
  control de reproducción desaparece. EQ, cola, búsqueda y sidebar no tapan la
  barra de ventana ni producen overflow horizontal/global.
- Audio continuo al minimizar, mover, maximizar, abrir/cerrar ventanas y cambiar
  fullscreen. No crear mixers adicionales ni cambiar la reserva de cuatro temas.
- Tooltips y nombres accesibles ES/EN, foco de teclado visible y estado activo
  legible sobre fondos claros/oscuros del visualizer.

## Viabilidad y límites

Viabilidad confirmada por inspección del proyecto y APIs/tipos de Electron
44.4.3 instalado. La variante de botones propios ya está implementada y cuenta
con pruebas aisladas de estado, controles y lifecycle en macOS. Windows requiere
QA real: Snap, resize, escalado/DPI y menús no quedan certificados por Mac.

Fuentes oficiales consultadas:

- [Electron: Custom Title Bar](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)
- [Electron: Custom Window Interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)

El skill `saas-product-ui-system` guio separación de acciones de ventana y música,
densidad compacta y estados visibles. `react-best-practices` guio aislamiento del
estado de ventana respecto al mixer y cleanup de suscripciones. `verification`
guio pruebas de botón → preload → main → ventana nativa → evento → UI.
