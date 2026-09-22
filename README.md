# NeoAres

Aplicación privada de escritorio que crea DJs persistentes, descubre música en
YouTube y mantiene sesiones continuas mediante curaduría automática y mezcla
local.

El primer corte funcional usa React y TypeScript en una aplicación de escritorio. Incluye la cabina
de escritorio, persistencia JSON validada, perfiles de DJ, descubrimiento y cola
automáticos desde YouTube, análisis local y mezcla con dos decks Web Audio.

## Ejecutar

### Abrir como aplicación de macOS

La aplicación instalada estará en `~/Applications/NeoAres.app` y tendrá un
acceso directo en el Escritorio. Bastará con hacer doble clic en **NeoAres**;
no necesita abrir Terminal ni ejecutar comandos.

Para reconstruir el paquete después de cambiar el código:

```bash
pnpm package:mac
```

El empaquetado genera dos variantes:

- `release/NeoAres-macOS-arm64.zip`: Apple Silicon con macOS 13 Ventura o posterior.
- `release/NeoAres-macOS-Universal.zip`: Intel y Apple Silicon con macOS 12 Monterey o posterior.

Para construir los paquetes de macOS y Windows en una sola ejecución:

```bash
pnpm package:all
```

Los ZIP de distribución se publican como archivos descargables de cada versión
en GitHub Releases. No forman parte del historial del código fuente.

### Windows

El empaquetado de Windows genera dos opciones:

- `release/NeoAres-Windows-Setup-x64.exe`: instalador por usuario con accesos
  directos y desinstalador. No requiere permisos de administrador.
- `release/NeoAres-Windows-Portable-x64.zip`: versión portable que se puede
  descomprimir y ejecutar sin instalación.

Para construir ambas:

```bash
pnpm package:win
```

El instalador usa NSIS, una herramienta gratuita y de código abierto. En macOS
se instala una sola vez con `brew install nsis`. Los ejecutables no están
firmados digitalmente, por lo que Windows SmartScreen puede mostrar una
advertencia aunque el instalador sea válido.

### Desarrollo

Requisitos: macOS, Node.js 24, Python 3 y Corepack/pnpm.

```bash
pnpm install
pnpm setup:media
pnpm start
```

`setup:media` crea un entorno privado en `.tools/` e instala `yt-dlp`; no modifica
el Python del sistema. En este equipo ya quedó ejecutado.

Desarrollo con recarga:

```bash
pnpm dev
```

Verificación completa:

```bash
pnpm check
```

`pnpm check` ejecuta typecheck, pruebas y la compilación completa de escritorio.

## Estado de implementación

- Shell de escritorio seguro con aislamiento de contexto.
- UI oscura, responsive y accesible para cabina y DJs.
- DJs guardados atómicamente como JSON y validados con JSON Schema.
- Las instalaciones nuevas comienzan sin DJs de prueba.
- Curador determinista con filtros duros, pesos normalizados y desempate estable.
- Máquina de estados de sesión con transiciones verificadas.
- Equal-power crossfade con recuperación inmediata si el cambio automático llega tarde.
- Parser de videos y playlists de YouTube.
- Una sesión se inicia eligiendo un DJ; no requiere pegar URLs.
- Búsqueda automática equilibrada: hasta cuatro artistas guía distintos por ronda y
  un artista del catálogo relacionado, con corrección tolerante de nombres escritos
  de forma aproximada, filtros de duración y exclusiones semánticas.
- Era configurable por contexto y rango de años; cada reposición rota también el año
  de búsqueda para ampliar el universo sin salir del periodo solicitado.
- Cola inicial de cuatro próximas canciones y reposición automática cuando quedan cuatro.
- Cola editable con arrastre, acciones para mover, reemplazar y eliminar canciones,
  respetando un mínimo de cuatro pistas próximas.
- Renovación completa de las cuatro próximas y selección distinta en cada inicio,
  con memoria temporal para no repetir las canciones recientes del mismo DJ.
- Buscador de YouTube dentro de la app, con miniaturas y opción de insertar una
  canción inmediatamente después de la actual o al final de la cola.
- Dos decks preparados por adelantado y reproducción continua.
- Análisis local de BPM solo como información; no altera la reproducción.
- Todas las transiciones conservan velocidad y tono originales y usan únicamente
  fade-out/fade-in entre los dos decks.
- El cambio automático se programa con margen antes del final y nunca reinicia la
  canción saliente si el temporizador llega tarde.
- Reproductor real con pausa/continuación, reinicio, siguiente con mezcla, volumen,
  tiempo transcurrido/restante/total y búsqueda dentro de la canción.
- Forma de onda calculada a partir del audio decodificado, no una animación decorativa.
- 39 pruebas automatizadas.

Pendiente inmediato: mejorar la precisión del beatgrid, detectar tonalidad y frases,
y puntuar candidatos por compatibilidad antes de descargarlos.

## Decisiones vigentes

- Aplicación privada, local y para un solo usuario.
- macOS es la primera plataforma objetivo.
- YouTube es la fuente del catálogo y del audio.
- No existe backend propio ni sincronización en la nube.
- La IA interpreta intención y ayuda a descubrir música.
- La selección final y la mezcla son deterministas y auditables.
- Los metadatos persisten en JSON; los eventos de sesión, en NDJSON.
- Los secretos y tokens se guardan en el llavero del sistema, nunca en JSON.
- El audio temporal no se conserva al terminar una sesión, salvo una opción
  local explícita que deberá definirse antes de implementarse.

La dependencia de mecanismos no oficiales de YouTube se acepta como un riesgo
consciente de este proyecto privado. Véase [Riesgos](docs/RISKS.md).

## Documentación

- [Definición del producto](docs/PRODUCT.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Motor de curaduría](docs/CURATION.md)
- [Motor de mezcla](docs/MIXING.md)
- [Persistencia local](docs/STORAGE.md)
- [Plan de entrega y aceptación](docs/DELIVERY.md)
- [Registro de riesgos](docs/RISKS.md)
- [Contratos y esquemas](contracts/README.md)
- [Decisiones de arquitectura](docs/adr/README.md)

## Principio rector

La aplicación siempre debe saber qué reproducir después y preparar esa canción
antes de necesitarla. La IA nunca participa en el camino crítico de audio: si
un proveedor de IA falla, la sesión continúa con reglas y candidatos ya
preparados.
