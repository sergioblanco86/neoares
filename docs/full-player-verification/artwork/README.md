# Portadas originales — 2026-10-11

Historia: metadata de una sesión guardada → resolución de candidatos en
TrackArtwork → CDN de la misma portada → decodificación/render del player real.

Diagnóstico de «Radiosurgery», New Found Glory: URL guardada con transformación
`w120-h120-l90-rj`, imagen real de 120×120. La misma imagen con `s0` respondió
200 JPEG, 1425×1425, 990175 bytes; la variante 120×120 pesó 15734 bytes.
Se midieron los bytes descargados, no el tamaño CSS. No se usa interpolación
ni generación de imágenes para aparentar mayor resolución.

Implementación:

- Original nativo solamente para la portada principal. Miniportadas siguen
  usando la URL de catálogo con carga lazy, sin descargar originales por fila.
- Transformaciones conocidas y hosts exactos; originales ya resueltos, data
  URLs y proveedores desconocidos se conservan. Sin cambio de CSP ni IPC.
- Respaldo original → miniatura → icono. Identidad/URL/calidad remonta solo la
  imagen, no mixer ni reproducción. Vídeos prueban maxres/sd y descartan tiles
  de resolución insuficiente antes de usar la imagen conocida.
- Sin cambios de schema: mejora también una sesión guardada con miniaturas.

El skill de React guio el aislamiento del estado de fallback por imagen;
el skill de verificación guio la comprobación metadata → CDN → UI, incluyendo
fallos reales de petición simulados con webRequest en un perfil temporal.

Gate opcional `--artwork-only` usa la URL pública real de esa portada; requiere
red. Audio/datos de sesión se simulan exclusivamente en el perfil temporal.
Prueba: original completamente cargado y decodificado (1425px), miniatura de cola
(120px), fallo solo del original, fallo de ambas, reintento, recuperación con
audio y cambio de canción. Las peticiones de fallo usan una query distinta para
evitar que la caché de Chromium eluda el caso. No se cambió el perfil del usuario.

Typecheck, 170 tests / 36 archivos y build aprobados. Gate Electron **9/9 fuente**
y **9/9 producción**, sin errores del renderer. Captura y resultados finales
adjuntos en este directorio. No se reinició NeoAres ni se hizo commit/push.
