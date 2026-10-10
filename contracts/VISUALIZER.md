# Contrato de implementación: Audio Reactive Visualizer

Estado: aprobado para implementación en `feature/visualizer`.

Este documento es la referencia normativa y autocontenida para implementar el
visualizador de NeoAres. Un implementador no necesita leer todo el repositorio:
debe leer este archivo completo y abrir únicamente los archivos de integración
enumerados en la sección 3 a medida que los modifique.

Si el documento externo `NEOARES_AUDIO_VISUALIZER_REQUIREMENT.md`, comentarios
antiguos o una implementación parcial contradicen este contrato, prevalece este
contrato. Cualquier cambio de alcance debe actualizar primero este archivo y los
JSON Schema asociados.

## 0. Política aprobada: compatibilidad MilkDrop local

La implementación utiliza Butterchurn `3.0.0-beta.5` y
`butterchurn-presets` `3.0.0-beta.4`, fijados de forma exacta. Es la opción que
ofrece la experiencia visual más próxima a Winamp/MilkDrop en un renderer WebGL
sin introducir un motor nativo para cada plataforma.

Los archivos `.milk` importados son **contenido local de confianza explícita**:
el usuario los selecciona en el diálogo del sistema y confirma que procede de
una fuente de confianza. Es el mismo modelo de confianza que históricamente
usan Winamp y MilkDrop para presets locales. No son contenido no confiable ni
un formato apto para importar desde enlaces, sincronización, marketplace,
colaboración o cualquier fuente remota.

Butterchurn compila las ecuaciones EEL mediante WebAssembly en modo
`onlyUseWASM`. La CSP autoriza únicamente `wasm-unsafe-eval`, nunca
`unsafe-eval` ni ejecución de strings JavaScript. NeoAres no debe presentar los `.milk`
arbitrarios como seguros frente a un atacante local. Antes de la primera
importación, la UI informa de esta frontera y exige confirmación explícita. El
motor continúa sin Node, sin APIs de Electron, sin acceso a archivos y sin
permisos adicionales; `contextIsolation`, `sandbox` y `webSecurity` permanecen
activos.

## 1. Resultado obligatorio de la feature completa

NeoAres debe ofrecer un visualizador reactivo al audio que:

- permanece oculto hasta que el usuario lo abre;
- ofrece panel flotante integrado y modo fullscreen;
- puede redimensionarse, moverse y restaurar su geometría;
- analiza la mezcla final de Deck A y Deck B;
- no reproduce, descarga ni decodifica audio por segunda vez;
- no envía waveform, FFT ni frames mediante IPC de Electron;
- utiliza WebGL 2 y `requestAnimationFrame` fuera del render de React;
- incluye presets offline `native` y compatibles con MilkDrop, navegación,
  aleatorio, historial, favoritos, bloqueo, auto-change y transiciones;
- incluye importación segura de archivos y carpetas `.milk` a la biblioteca
  local administrada por NeoAres;
- conserva la reproducción si el visualizador, WebGL o un preset fallan;
- persiste preferencias, preset, favoritos, presets importados y geometría del
  panel;
- funciona en macOS Apple Silicon, macOS Universal y Windows x64.

El mockup de referencia está en
[`docs/mockups/neoares-audio-visualizer-concept.png`](../docs/mockups/neoares-audio-visualizer-concept.png).
Es una referencia de jerarquía y apariencia, no un requisito pixel-perfect.

## 2. Decisiones cerradas

Estas decisiones no se deben reinterpretar durante la implementación:

1. El visualizador vive en el renderer principal y comparte el mismo
   `AudioContext` que `DualDeckMixer`.
2. La presentación obligatoria es panel DOM flotante y fullscreen en el renderer
   principal. Una segunda ventana nativa no forma parte de esta feature porque
   requeriría transportar análisis entre renderers y rompería la regla de no
   enviar datos de audio en tiempo real por IPC.
3. La captura se toma después de la mezcla, normalización, safety limiter y
   volumen master: es la señal que escucha el usuario.
4. React administra controles y ciclo de vida. React no recibe datos de audio a
   30/60 FPS y no dibuja frames.
5. La compatibilidad MilkDrop usa un adaptador dedicado sobre Butterchurn. Los
   `.milk` importados siguen la política de contenido local de confianza de la
   sección 0; nunca se importan automáticamente ni desde una fuente remota.
6. Las versiones de esas dependencias se guardan exactas en `package.json` y
   `pnpm-lock.yaml`; no se usan rangos `^` o `~`.
7. Los presets incluidos funcionan offline. Está prohibido descargarlos al
   abrir el visualizador.
8. El renderer visual y los presets nunca controlan reproducción, decks,
   volumen, cola, búsqueda, caché ni descargas.
9. Un error visual se degrada a una UI de error recuperable; nunca cambia la
   fase de la sesión ni llama `mixer.stopAll()`.
10. Favoritos, biblioteca local e importación `.milk` son obligatorios. No
    pertenecen a esta feature un marketplace remoto, plugins binarios antiguos
    de Winamp, creación visual de presets, captura de vídeo ni generación por
    IA.

## 3. Contexto mínimo del repositorio

Antes de editar, el implementador debe abrir solo los archivos que vaya a
modificar de esta lista:

| Archivo | Motivo |
|---|---|
| `src/audio/dual-deck-mixer.ts` | AudioContext, master bus y ciclo de vida del mixer |
| `src/audio/dual-deck-mixer.test.ts` | Patrón de tests del mixer |
| `src/components/AutonomousDjPanel.tsx` | Dueño actual del mixer, track y controles |
| `src/styles/app.css` | Tokens y UI actual |
| `src/shared/contracts.ts` | Tipos del preload y persistencia |
| `src/i18n/locales/es.ts` y `en.ts` | Catálogos de texto |
| `src/domain/transport-controls.ts` | Convenciones de atajos y targets editables |
| `electron/channels.ts` | Nombres de IPC |
| `electron/preload.ts` | API aislada del renderer |
| `electron/main.ts` | Registro de repositorios e IPC |
| `electron/state-repository.ts` | Escritura JSON atómica existente |
| `scripts/package-macos.sh` y `package-windows.sh` | Validación de assets empaquetados |

Estado actual relevante:

- `AutonomousDjPanel` crea una sola instancia de `DualDeckMixer` con
  `useState(() => new DualDeckMixer())`.
- `DualDeckMixer` posee `#context`, `#safety`, `#limiter` y `#master`.
- La cadena actual termina en
  `safety -> limiter -> master -> AudioContext.destination`.
- Los decks conectan
  `source -> normalization -> deck gain -> safety`.
- `AutonomousDjPanel` ya conoce la pista actual, posición, duración, pausa,
  volumen y thumbnail.
- El renderer se ejecuta con `contextIsolation`, `sandbox`, sin Node y con
  `webSecurity` habilitado.
- La persistencia utiliza JSON local con escritura temporal + rename atómico.

No se debe crear otro `AudioContext` para el visualizador.

## 4. Grafo de audio y tap de análisis

La topología objetivo es:

```text
Deck A source -> normalization -> deck gain --\
                                                -> safety -> limiter -> master -> destination
Deck B source -> normalization -> deck gain --/                         |
                                                                         +-> tap -> analyzers/renderers
```

`DualDeckMixer` debe exponer un tap controlado, no sus campos privados:

```ts
export type MixerAnalysisTap = {
  readonly context: AudioContext;
  readonly node: GainNode;
  release(): void;
};

class DualDeckMixer {
  createPostMasterAnalysisTap(): MixerAnalysisTap;
}
```

Semántica obligatoria:

- `createPostMasterAnalysisTap()` puede inicializar un `AudioContext`
  suspendido, pero no lo reanuda sin una acción previa del usuario.
- Crea un `GainNode` de ganancia `1` y conecta `#master` al tap.
- El tap no se conecta a `destination`; sus consumidores conectan únicamente
  nodos de análisis.
- `release()` es idempotente y desconecta solo ese tap.
- `DualDeckMixer` mantiene un registro de taps activos y los libera en
  `dispose()`.
- `reset()`, seek, cambio de pista y crossfade no destruyen el tap.
- Crear o liberar un tap no cambia volumen, latencia ni rutas existentes.
- El analizador recibe la señal posterior a `#master.gain`; mutear NeoAres
  produce silencio visual de forma intencional.

Está prohibido devolver directamente `#master` o `#context` por getters
independientes.

## 5. Contrato de AudioAnalyzer

Archivos objetivo:

```text
src/visualizer/audio/audio-analyzer.ts
src/visualizer/audio/beat-detector.ts
src/visualizer/audio/audio-analyzer.test.ts
src/visualizer/audio/beat-detector.test.ts
src/visualizer/audio/types.ts
```

Tipos públicos:

```ts
export type AudioAnalysisFrame = {
  volume: number;
  bass: number;
  mids: number;
  highs: number;
  beat: number;
  waveform: Float32Array;
  frequencySpectrum: Float32Array;
  timestamp: number;
};

export type AudioAnalyzerOptions = {
  fftSize: 2048;
  smoothingTimeConstant: 0.75;
  minDecibels: -90;
  maxDecibels: -10;
};

export interface AudioAnalyzer {
  readonly frame: AudioAnalysisFrame;
  sample(timestamp: number): AudioAnalysisFrame;
  reset(): void;
  dispose(): void;
}
```

Reglas:

- `waveform` y `frequencySpectrum` se asignan una sola vez y se reutilizan.
- `sample()` muta y devuelve el mismo objeto `frame`; no crea arrays por frame.
- No existe un timer ni `requestAnimationFrame` dentro de `AudioAnalyzer`.
- El controlador visual es el único dueño del render loop.
- `getFloatTimeDomainData()` alimenta waveform y RMS.
- `getFloatFrequencyData()` alimenta el espectro. Esta llamada produce dB y los
  valores `-Infinity` de silencio deben normalizarse a cero.
- Los valores escalares se limitan a `[0, 1]` y nunca son `NaN` o infinitos.
- Las bandas se calculan por frecuencia real, no por índices fijos:
  `bass = 20..250 Hz`, `mids = 250..4000 Hz`,
  `highs = 4000..min(16000, Nyquist) Hz`.
- Para cada banda se usa RMS de las magnitudes lineales normalizadas, no el
  máximo de un único bin.
- `volume` es el RMS del waveform limitado a `[0, 1]`.
- Al pausar o quedar en silencio, bass/mids/highs/volume/beat decaen suavemente;
  no conservan el último valor indefinidamente.
- `dispose()` desconecta su `AnalyserNode`; no cierra el `AudioContext`.

### 5.1 BeatDetector

La señal detecta intensidad de beat; la estimación BPM exacta no es un requisito
del visualizador porque NeoAres ya conserva BPM de preparación para el player.

```ts
export interface BeatDetector {
  update(bassEnergy: number, timestamp: number): number;
  reset(): void;
}
```

- Mantiene una ventana temporal aproximada de 700 ms de energía de bass.
- Un onset requiere energía actual superior al promedio reciente por un factor
  inicial de `1.35` y energía absoluta mínima de `0.12`.
- Un onset produce un valor `[0,1]` proporcional al exceso.
- El valor cae de forma exponencial con constante aproximada de 180 ms.
- El decay usa delta de tiempo, no cantidad de frames.
- Los parámetros se declaran como constantes y se prueban con timestamps
  simulados.

Los valores pueden ajustarse después de pruebas reales sin cambiar la interfaz.

## 6. Renderer y adaptadores de presets

Estructura:

```text
src/visualizer/engine/visualizer-controller.ts
src/visualizer/engine/visualizer-renderer.ts
src/visualizer/engine/butterchurn-renderer.ts
src/visualizer/engine/frame-monitor.ts
src/visualizer/presets/preset-manager.ts
src/visualizer/presets/preset-catalog.ts
src/visualizer/presets/types.ts
src/visualizer/vendor/butterchurn.d.ts   # solo si el paquete no trae tipos
```

Interfaces estables:

```ts
export type VisualizerPresetKind = "milkdrop" | "native";

export type VisualizerPresetDescriptor = {
  id: string;
  name: string;
  author: string | null;
  kind: VisualizerPresetKind;
  bundled: boolean;
  sourceKey: string;
  tags: string[];
  favorite: boolean;
  origin: "bundled" | "imported";
  checksum: string | null;
  compatibility: "ready" | "incompatible" | "failed";
  importedAt: string | null;
};

export interface VisualizerRenderer {
  initialize(input: {
    canvas: HTMLCanvasElement;
    tap: MixerAnalysisTap;
    width: number;
    height: number;
  }): Promise<void>;
  loadPreset(preset: VisualizerPresetDescriptor, blendSeconds: number): Promise<void>;
  resize(width: number, height: number, pixelRatio: number): void;
  render(frame: AudioAnalysisFrame, timestamp: number): void;
  dispose(): void;
}
```

El adaptador Butterchurn puede ignorar `frame` porque la librería analiza el
`tap.node` internamente. La firma lo conserva para que los presets nativos
futuros usen el mismo controlador.

Reglas Butterchurn:

- El import de la librería existe únicamente en `butterchurn-renderer.ts`.
- El resto de NeoAres no importa tipos ni objetos de Butterchurn.
- `createVisualizer()` usa `tap.context`, el canvas entregado y WebGL 2.
- `connectAudio(tap.node)` ocurre una vez por inicialización.
- `loadPreset(definition, blendSeconds)` implementa la transición.
- `setRendererSize()` se llama únicamente al cambiar tamaño o render scale.
- El catálogo traduce nombres de la librería a IDs estables de NeoAres.
- NeoAres no evalúa JavaScript, HTML ni shaders de un preset. Butterchurn puede
  compilar las ecuaciones EEL del `.milk` local de confianza conforme a la
  política de la sección 0. La UI no debe describir ese flujo como sandbox de
  archivos no confiables.
- Si faltan tipos oficiales, la declaración local debe cubrir solo la API usada;
  está prohibido declarar todo como `any` fuera de la frontera vendor.

### 6.1 Biblioteca inicial y clases de preset

Incluir entre 8 y 16 presets seleccionados. Criterios:

- variedad visual;
- tiempos de frame aceptables en GPU integrada;
- ausencia de flashes extremos;
- nombres y autores preservados;
- licencia o procedencia documentada;
- funcionamiento offline.

No se debe incluir automáticamente la biblioteca completa si aumenta de forma
desproporcionada el bundle. Añadir `THIRD_PARTY_NOTICES.md` o actualizarlo con
la licencia del motor y la procedencia/licencia de presets.

La biblioteca es la unión de:

```text
bundled presets        -> recursos empaquetados, solo lectura
imported presets       -> <userData>/data/visualizer/presets, administrados
```

Cada preset importado conserva `id`, nombre, autor si existe, checksum,
procedencia, fecha de importación, compatibilidad y favorito. Un preset
incompatible se conserva como registro visible, pero no entra al pool de
reproducción hasta que sea compatible.

## 7. PresetManager

```ts
export interface PresetManager {
  readonly current: VisualizerPresetDescriptor | null;
  readonly locked: boolean;
  readonly autoChange: boolean;
  list(): readonly VisualizerPresetDescriptor[];
  select(id: string, reason: "initial" | "manual" | "auto" | "restore"): VisualizerPresetDescriptor;
  next(): VisualizerPresetDescriptor;
  previous(): VisualizerPresetDescriptor;
  random(): VisualizerPresetDescriptor;
  setLocked(locked: boolean): void;
  setAutoChange(enabled: boolean): void;
  setFavorite(id: string, favorite: boolean): void;
  import(request: VisualizerPresetImportRequest): Promise<VisualizerImportResult>;
  markFailed(id: string): void;
}
```

Invariantes:

- `previous()` usa historial real, no índice anterior del catálogo.
- El historial conserva como máximo 20 selecciones.
- `random()` evita el preset actual y los últimos 10 cuando el catálogo lo
  permite.
- Catálogos pequeños reducen la exclusión antes de quedarse sin candidatos.
- `locked` bloquea solamente cambios automáticos; la navegación manual sigue
  funcionando.
- Un preset fallido queda excluido durante la sesión actual, no se borra.
- Si todos fallan, el manager devuelve `VISUALIZER_NO_VALID_PRESET` y la UI
  entra en error recuperable.
- Una repetición inmediata solo se permite cuando existe un único preset válido.
- Los favoritos se persisten por ID y sobreviven a reinicios e imports.
- Importar el mismo archivo con el mismo checksum es idempotente; nunca duplica
  un preset en la biblioteca.

### 7.1 Importación `.milk` y biblioteca local

Tipos de frontera:

```ts
type VisualizerPresetImportRequest = { mode: "files" | "directory" };

type VisualizerImportResult = {
  importedIds: string[];
  skipped: Array<{ sourceName: string; reason: string }>;
  incompatible: Array<{ sourceName: string; reason: string }>;
};
```

Flujo obligatorio:

```text
Renderer -> preload: select/import -> Electron Main -> validación/conversión
         -> copia atómica a data/visualizer/presets -> registro JSON
         -> resultado estructurado al renderer
```

Reglas de seguridad y compatibilidad:

- UI permite archivos `.milk` y carpetas; React nunca recibe rutas arbitrarias.
- Antes de la primera importación de la sesión, Main muestra una confirmación
  nativa que advierte que MilkDrop contiene ecuaciones ejecutables y que solo
  deben seleccionarse archivos de confianza.
- Main limita el import a 500 archivos por operación, 2 MiB por archivo y
  100 MiB totales por operación.
- Se rechazan symlinks, extensiones distintas y rutas que escapen del origen
  seleccionado o del directorio administrado.
- Cada archivo se copia a nombre opaco basado en checksum; nunca se referencia
  la ruta original durante playback.
- El adaptador convierte el formato a la representación compatible con
  Butterchurn y valida su estructura. El archivo original se conserva para
  trazabilidad junto al resultado de conversión y su checksum.
- Un error de parse, conversión o compilación marca el preset como incompatible
  sin afectar los demás presets ni el audio.
- El usuario puede reintentar, eliminar o ver la razón de incompatibilidad desde
  la biblioteca. Eliminar solo borra archivos bajo `data/visualizer/presets` y
  actualiza el registro atómicamente.

## 8. VisualizerController y render loop

API conceptual:

```ts
export type VisualizerRuntimeStatus =
  | "idle"
  | "loading"
  | "running"
  | "paused"
  | "error";

export interface VisualizerController {
  start(canvas: HTMLCanvasElement): Promise<void>;
  stop(): void;
  setPlaybackState(state: "playing" | "paused" | "stopped"): void;
  nextPreset(): void;
  previousPreset(): void;
  randomPreset(): void;
  setLocked(locked: boolean): void;
  resize(cssWidth: number, cssHeight: number): void;
  dispose(): void;
}
```

El loop cumple:

1. Solo existe un `requestAnimationFrame` activo por controlador.
2. Cada frame obtiene análisis, actualiza métricas y llama al renderer.
3. No ejecuta `setState` por frame.
4. React recibe estado solo en cambios discretos: preset, lock, status, quality
   tier o error.
5. `stop()` cancela RAF y auto-change, pero permite reiniciar el controlador.
6. `dispose()` además libera renderer, analyzer, ResizeObserver, listeners y tap.
7. `document.hidden` suspende RAF por completo y lo reanuda al volver.
   Electron desactiva background throttling durante reproducción para proteger
   el transporte; en ese modo Page Visibility puede permanecer visible. Por eso
   Main también emite `runtime:window-visibility` (un booleano) en hide/show y
   minimize/restore. `runtime:get-window-visibility` entrega el estado inicial.
   Este evento de ciclo de vida no contiene audio ni análisis, y cancela tanto
   RAF como auto-change sin modificar el throttling ni la reproducción.
8. En `paused` o `stopped`, la animación cae a un máximo de 15 FPS y baja
   suavemente a un estado ambiental.
9. En reproducción se busca 60 FPS; calidad low puede limitarse a 30 FPS.
10. Cambiar canción no reinicializa WebGL ni el tap.

Auto-change:

- default: activo;
- intervalo default: 25 segundos;
- se programa desde la selección exitosa más reciente;
- se cancela/reprograma al cambiar manualmente;
- no corre mientras `locked`, `document.hidden`, `error` o visualizador cerrado;
- el intervalo se mide con timestamps monotónicos, no con contadores de frame.

## 9. Calidad, resolución y rendimiento

```ts
export type VisualizerQuality = "low" | "medium" | "high" | "auto";
```

Política inicial:

| Calidad | FPS | Render scale inicial | DPR máximo |
|---|---:|---:|---:|
| low | 30 | 0.75 | 1.0 |
| medium | 60 | 1.0 | 1.25 |
| high | 60 | 1.0 | 2.0 |
| auto | 60 | 1.0 | 1.5 |

Tamaño físico:

```ts
physicalWidth = floor(cssWidth * min(devicePixelRatio, dprCap) * renderScale)
physicalHeight = floor(cssHeight * min(devicePixelRatio, dprCap) * renderScale)
```

Se limita cada dimensión al máximo de textura reportado por WebGL y a 3840 px.

Modo auto:

- usa media móvil de frame time, sin emitir estado por frame;
- si permanece debajo de 48 FPS durante 3 segundos, reduce un nivel;
- si permanece sobre 58 FPS durante 10 segundos, puede subir un nivel;
- espera al menos 5 segundos entre cambios;
- nunca sube por encima de la política `high` ni debajo de `low`;
- primero reduce resolución, no complejidad del audio ni reproducción.

No se registran logs por frame. Las métricas permanecen en memoria.

## 10. UI y comportamiento

Componentes:

```text
src/visualizer/components/VisualizerWindow.tsx
src/visualizer/components/VisualizerCanvas.tsx
src/visualizer/components/VisualizerControls.tsx
src/visualizer/components/TrackOverlay.tsx
src/visualizer/components/VisualizerErrorBoundary.tsx
src/visualizer/hooks/use-visualizer-settings.ts
src/visualizer/domain/visualizer-shortcuts.ts
```

Integración en `AutonomousDjPanel`:

- importar `AudioWaveform` de `lucide-react`;
- colocar un botón accesible después de `.volume-control`;
- label visible o tooltip: `Visualizer` / `Visualizador`;
- el botón puede abrir el panel sin reproducción; se verá estado idle;
- pasar al visualizador `mixer`, current track, posición, duración y fase;
- el estado `visualizerOpen` es efímero y local al panel;
- cerrar o cambiar de DJ libera todos los recursos visuales.

Panel flotante:

- `position: fixed`, z-index superior a sidebar y dialogs no modales;
- tamaño inicial aproximado `min(960px, calc(100vw - 48px))` con ratio 16:9;
- mínimo `560 x 315` en desktop;
- título `NeoAres Visualizer` y drag handle en la barra superior;
- resize mediante pointer handles o `resize: both`; nunca depender de APIs Node;
- usa `role="region"` con nombre accesible, no `role="dialog"`, porque no es
  modal y no debe bloquear transport controls;
- botones mínimos de 36 px, `aria-label` y tooltip visible en hover/focus;
- overlays con contraste legible y sin glassmorphism fuerte;
- los controles desaparecen tras 2.5 segundos sin pointer, teclado o focus;
- controles enfocados nunca se ocultan;
- mover el pointer o presionar una tecla los restaura.

Fullscreen:

- usa `container.requestFullscreen()` y `document.exitFullscreen()`;
- no utiliza IPC ni `BrowserWindow.setFullScreen()`;
- `fullscreenchange` es la fuente de verdad;
- `Escape` sale primero de fullscreen; solo cierra si no está fullscreen;
- el canvas se redimensiona después de cada `fullscreenchange`.

Track overlay:

- reutiliza `YouTubeSource`, thumbnail, posición y duración existentes;
- no consulta proveedor ni crea tracking propio;
- muestra título, artista, portada y progreso;
- desaparece junto con los controles, salvo preferencia contraria futura.

### 10.1 Atajos

| Tecla | Condición | Acción |
|---|---|---|
| `V` | siempre que no se esté editando | abrir/cerrar |
| `F` | visualizador abierto | fullscreen |
| `ArrowLeft` | visualizador abierto, sin Ctrl/Cmd | preset anterior |
| `ArrowRight` | visualizador abierto, sin Ctrl/Cmd | preset siguiente |
| `R` | visualizador abierto | aleatorio |
| `L` | visualizador abierto | lock/unlock |
| `Escape` | fullscreen | salir de fullscreen |
| `Escape` | abierto, no fullscreen | cerrar |

Los atajos:

- se ignoran en `input`, `textarea`, `select` y `contenteditable`;
- se ignoran cuando existe un dialog modal real;
- ignoran `event.repeat` para V, F, R y L;
- no consumen Ctrl/Cmd + flechas, reservadas al transporte existente;
- se resuelven mediante una función pura cubierta por Vitest.

## 11. Persistencia

No se amplía `AppState` ni se acopla la configuración al `I18nProvider`.

Ruta:

```text
<userData>/data/visualizer/settings.json
```

Contrato: [`visualizer-settings.schema.json`](schemas/visualizer-settings.schema.json).
La geometría usa [`visualizer-presentation.schema.json`](schemas/visualizer-presentation.schema.json).

Tipo equivalente:

```ts
export type VisualizerSettings = {
  schemaVersion: 1;
  enabled: boolean;
  presetId: string | null;
  autoChange: boolean;
  changeIntervalSeconds: number;
  locked: boolean;
  transitionsEnabled: boolean;
  transitionSeconds: number;
  quality: VisualizerQuality;
  showTrackInfo: boolean;
  favoritePresetIds: string[];
  updatedAt: string;
};
```

Defaults:

```ts
{
  schemaVersion: 1,
  enabled: true,
  presetId: null,
  autoChange: true,
  changeIntervalSeconds: 25,
  locked: false,
  transitionsEnabled: true,
  transitionSeconds: 3,
  quality: "auto",
  showTrackInfo: true,
  favoritePresetIds: []
}
```

`enabled` significa que la feature está disponible; no significa abrirla al
iniciar. `visualizerOpen` no se persiste. La geometría flotante se persiste en
un registro de presentación independiente y validado (`x`, `y`, `width`,
`height`), con fallback seguro si queda fuera del monitor disponible.

Implementar `VisualizerSettingsRepository` con el mismo patrón atómico de
`state-repository.ts`: validación, cola serial de escrituras, archivo temporal,
backup y rename. Un archivo faltante devuelve defaults. Un archivo inválido
devuelve error `VISUALIZER_SETTINGS_INVALID`; no se sobrescribe silenciosamente.

IPC permitido:

```ts
desktop.visualizer.loadSettings(): Promise<VisualizerSettings>;
desktop.visualizer.saveSettings(settings: VisualizerSettings): Promise<void>;
desktop.visualizer.loadPresentation(): Promise<VisualizerPresentation>;
desktop.visualizer.savePresentation(presentation: VisualizerPresentation): Promise<void>;
desktop.visualizer.listPresets(): Promise<VisualizerPresetDescriptor[]>;
desktop.visualizer.loadPresetDefinition(id: string): Promise<unknown>;
desktop.visualizer.importPresets(request: VisualizerPresetImportRequest): Promise<VisualizerImportResult>;
desktop.visualizer.removeImportedPreset(id: string): Promise<void>;
```

Canales:

```text
visualizer-settings:load
visualizer-settings:save
visualizer-presentation:load
visualizer-presentation:save
visualizer-presets:list
visualizer-presets:load-definition
visualizer-presets:import
visualizer-presets:remove
```

No existe IPC para audio, FFT, waveform, beat, render frames o cambio de preset
runtime. IPC solo administra persistencia, selección explícita de archivos y
biblioteca local.

La biblioteca también expone `retryImportedPreset(id)` y `setFavorite(id, favorite)`
en `visualizer-presets:retry` y `visualizer-presets:set-favorite`. Retry solo lee
el original administrado cuyo checksum coincide; no recibe una ruta del renderer.

## 12. Estados y errores

Máquina de estados runtime:

```text
idle -> loading -> running
  ^        |          |
  |        v          v
  +----- error <--- paused
           |
           +-> loading  (retry explícito o siguiente preset válido)
```

Reglas:

- Abrir sin audio termina en `idle`, no en error.
- `loading` cubre inicialización WebGL y carga de preset.
- `paused` conserva el canvas con animación reducida.
- Un preset fallido intenta el siguiente válido y solo muestra error si se
  agotan.
- `webglcontextlost` llama `preventDefault`, pausa el loop y muestra estado de
  recuperación sin tocar audio.
- `webglcontextrestored` reinicializa una vez el renderer y preset actual.
- Una segunda pérdida no recuperable termina en `error` hasta retry manual.
- `VisualizerErrorBoundary` cubre únicamente el subárbol visual.
- El fallback ofrece `Reintentar` y `Cerrar`; no ofrece detener reproducción.

Códigos mínimos:

```text
VISUALIZER_WEBGL_UNSUPPORTED
VISUALIZER_CONTEXT_LOST
VISUALIZER_INITIALIZATION_FAILED
VISUALIZER_PRESET_NOT_FOUND
VISUALIZER_PRESET_FAILED
VISUALIZER_NO_VALID_PRESET
VISUALIZER_SETTINGS_INVALID
```

Logging permitido solo en límites discretos:

```text
[visualizer] initialization-failed
[visualizer] preset-failed
[visualizer] context-lost
[visualizer] context-restored
```

No incluir buffers, URLs, rutas de usuario o logs por frame.

## 13. Seguridad y aislamiento

- Mantener `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
  y `webSecurity: true`.
- React y el engine no importan `fs`, `path`, `child_process` ni Electron.
- Preload expone métodos concretos, nunca acceso genérico a archivos.
- Presets incluidos se importan desde el bundle; presets de usuario se leen
  únicamente mediante los puertos específicos de preload y Main.
- NeoAres no usa `eval` ni `new Function`. Butterchurn se configura con
  `onlyUseWASM: true`; la CSP permite `wasm-unsafe-eval` pero sigue bloqueando
  evaluación dinámica de JavaScript, también para presets importados.
- El visualizador no hace peticiones HTTP.
- Los errores de shader se tratan como datos técnicos y nunca se insertan como
  HTML.

La compatibilidad `.milk` se implementa con el flujo de importación de la
sección 7.1. Cualquier nuevo formato de preset exige su propio schema y revisión
de seguridad antes de habilitarlo.

## 14. Internacionalización

Todo texto visible se añade en español e inglés. Claves mínimas:

```text
visualizer.open
visualizer.close
visualizer.title
visualizer.previousPreset
visualizer.nextPreset
visualizer.randomPreset
visualizer.lock
visualizer.unlock
visualizer.fullscreen
visualizer.exitFullscreen
visualizer.autoChange
visualizer.presetStatus
visualizer.idle
visualizer.loading
visualizer.error
visualizer.retry
visualizer.quality
visualizer.showTrackInfo
```

Los nombres propios de presets y autores no se traducen.

## 15. Plan de archivos

Crear:

```text
src/visualizer/
  audio/audio-analyzer.ts
  audio/audio-analyzer.test.ts
  audio/beat-detector.ts
  audio/beat-detector.test.ts
  audio/types.ts
  components/VisualizerCanvas.tsx
  components/VisualizerControls.tsx
  components/VisualizerErrorBoundary.tsx
  components/VisualizerWindow.tsx
  components/TrackOverlay.tsx
  domain/visualizer-shortcuts.ts
  domain/visualizer-shortcuts.test.ts
  engine/butterchurn-renderer.ts
  engine/frame-monitor.ts
  engine/frame-monitor.test.ts
  engine/visualizer-controller.ts
  engine/visualizer-renderer.ts
  hooks/use-visualizer-settings.ts
  presets/preset-catalog.ts
  presets/milkdrop-adapter.ts
  presets/preset-library.ts
  presets/preset-importer.ts
  presets/preset-manager.ts
  presets/preset-manager.test.ts
  presets/types.ts

electron/visualizer-settings-repository.ts
electron/visualizer-settings-repository.test.ts
electron/visualizer-preset-library.ts
electron/visualizer-preset-library.test.ts
```

Modificar:

```text
package.json
pnpm-lock.yaml
src/audio/dual-deck-mixer.ts
src/audio/dual-deck-mixer.test.ts
src/components/AutonomousDjPanel.tsx
src/styles/app.css
src/shared/contracts.ts
src/i18n/locales/es.ts
src/i18n/locales/en.ts
electron/channels.ts
electron/preload.ts
electron/main.ts
electron/visualizer-preset-library.ts
THIRD_PARTY_NOTICES.md             # crear si no existe
```

No modificar salvo que la implementación documente una nueva necesidad:

```text
electron/source-service.ts
electron/media-cache.ts
src/domain/queue-operations.ts
src/adapters/youtube/*
```

## 16. Pruebas obligatorias

### 16.1 Unitarias Vitest

AudioAnalyzer:

- silencio produce valores finitos y cero;
- RMS y bandas permanecen en `[0,1]`;
- los límites de banda se adaptan al sample rate;
- buffers y frame conservan identidad entre muestras;
- dispose desconecta sin cerrar el contexto.

BeatDetector:

- energía constante no genera beats repetidos;
- onset claro genera intensidad;
- decay depende del tiempo;
- reset elimina historial.

PresetManager:

- next, previous e historial real;
- random no repite inmediatamente;
- lock bloquea auto pero no manual;
- preset fallido se excluye;
- catálogo agotado devuelve el error estable.
- favorito persiste y no cambia la compatibilidad;
- import duplicado es idempotente;
- import inválido no crea archivo administrado ni registro parcial;
- eliminación no puede afectar assets bundled ni rutas externas.

FrameMonitor:

- baja calidad después del umbral sostenido;
- no oscila durante cooldown;
- sube solo después de estabilidad suficiente.

Settings:

- defaults sin archivo;
- persistencia atómica;
- escrituras concurrentes serializadas;
- documento inválido rechazado;
- round trip sin pérdida.

Shortcuts:

- ignora campos editables y dialog modal;
- conserva Ctrl/Cmd + flechas;
- Escape sale de fullscreen antes de cerrar;
- acciones solo disponibles cuando corresponde.

Mixer tap:

- `release()` idempotente;
- `reset()` no invalida tap;
- `dispose()` libera todos los taps.

### 16.2 Integración manual

1. Iniciar una sesión, abrir visualizador y confirmar reacción.
2. Ejecutar crossfade y observar mezcla continua sin cambio manual de deck.
3. Cambiar volumen y confirmar que la energía visual sigue el master.
4. Pausar/reanudar y comprobar decay/recuperación.
5. Cambiar y saltar canciones sin canvas negro.
6. Cerrar/abrir repetidamente y revisar que exista un solo RAF.
7. Dejar auto-change, activar lock y verificar que no cambie.
8. Probar previous, next y random con historial.
9. Entrar/salir de fullscreen con botón, `F` y `Escape`.
10. Simular preset inválido y confirmar que el audio continúa.
11. Simular `webglcontextlost` y confirmar que el audio continúa.
12. Minimizar/ocultar y confirmar que el render loop se suspende.
13. Reiniciar la aplicación y verificar settings, sin autoabrir el panel.
14. Ejecutar en Retina/HiDPI y verificar el DPR limitado.
15. Validar build macOS arm64, macOS Universal y Windows x64.
16. Importar archivo `.milk`, varios archivos y carpeta; reiniciar y comprobar
    que la biblioteca y favoritos persisten.
17. Intentar importar archivo malformado, archivo grande, symlink y extensión
    no permitida; comprobar rechazo seguro y audio intacto.

## 17. Gates de entrega

Cada bloque termina ejecutando:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Antes de considerar terminado:

- `pnpm check` pasa;
- no existen errores ni warnings nuevos en consola durante uso normal;
- no existe audio enviado por IPC;
- no existe `setState` dentro del loop de render;
- cerrar el panel cancela RAF, timers y listeners;
- la reproducción y la cola siguen funcionando con el visualizador en error;
- todos los presets incluidos funcionan sin red;
- los avisos de terceros están documentados;
- se actualiza este contrato si la implementación necesita desviarse.

## 18. Secuencia de implementación de la feature completa

Los commits o bloques de trabajo deben mantener este orden:

1. `audio tap + AudioAnalyzer + BeatDetector`;
2. `settings contract + repository + preload`;
3. `floating window shell + shortcuts + fullscreen`;
4. `Butterchurn adapter + curated preset catalog`;
5. `PresetManager + transitions + auto-change`;
6. `quality auto + context loss + error boundary`;
7. `biblioteca local + importador MilkDrop + favoritos + eliminación segura`;
8. `i18n + packaging + regression tests multiplataforma`.

La feature no está completa hasta que los ocho bloques y todos los gates de la
sección 17 estén cerrados.

## 19. Mapa de implementación y verificación (2026-10-09)

La implementación conserva el alcance completo, consolidando algunos módulos
del plan de archivos para evitar capas sin comportamiento:

- `src/audio/dual-deck-mixer.ts`: tap post-master GainNode con release dirigido.
- `src/visualizer/audio/*`: análisis y detector de onset sin timers propios.
- `src/visualizer/butterchurn-renderer.ts`: única frontera vendor, carga WASM
  serializada y esperada, contexto interno, desconexión y liberación WebGL.
- `src/visualizer/visualizer-controller.ts`: un RAF, visibilidad, pausa, resize,
  calidad y reconstrucción del renderer sin recrear el tap durante recovery.
- `src/visualizer/domain/preset-navigator.ts`: historial, random y exclusión
  de fallos. Lock/auto-change se administran desde la ventana.
- `src/visualizer/preset-catalog.ts` y `native-presets.ts`: seis presets del
  paquete fijado y dos presets GPU originales. No se empaqueta el pack completo.
- `src/visualizer/components/VisualizerWindow.tsx`: shell, controles, overlay,
  biblioteca, configuración, historial e importación. Error boundary separado.
- `electron/visualizer-repository.ts`: settings, presentación y biblioteca
  persistidos de forma serializada y atómica. Conserva originales incompatibles
  para diagnóstico/retry; rechazos de origen/extensión/tamaño no crean entradas.
- `scripts/verify-visualizer.cjs`: pruebas en Electron con perfil temporal,
  audio sintético silenciado a nivel de salida y datos aislados del usuario.

Los contratos funcionales siguen siendo obligatorios aunque cambie la división
de archivos. Las pruebas reproducibles y sus límites se registran en
`docs/VISUALIZER_VERIFICATION.md`. No se considera verificada una plataforma
solo porque el bundle compile en macOS.

## 19. Límite explícito de presentación

La experiencia completa incluye panel flotante y fullscreen porque ambos usan
el `AudioContext` real, no alteran la cadena de audio y cumplen la regla de cero
IPC de frames. Una nueva ventana nativa no es un requisito funcional ni una
alternativa equivalente bajo esa restricción técnica. Si más adelante se decide
abrirla, requiere un ADR separado que defina memoria compartida, backpressure,
seguridad y recuperación entre renderers.
