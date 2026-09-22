# Registro de riesgos

Escala de probabilidad e impacto: baja, media, alta. La aceptación de un riesgo
no elimina la necesidad de detectarlo y contenerlo.

## R-001 — Dependencia no oficial de YouTube

- **Probabilidad:** alta.
- **Impacto:** alto.
- **Descripción:** la resolución o acceso temporal puede romperse por cambios de
  YouTube o medidas contra clientes no oficiales.
- **Decisión:** riesgo aceptado para uso privado.
- **Mitigación:** adaptador aislado, pruebas de salud, fallos tipados, versiones
  fijadas y capacidad de reemplazar el adaptador.
- **Señal:** aumento de `SOURCE_RESOLUTION_FAILED` o referencias que antes
  funcionaban y dejan de hacerlo.

## R-002 — Condiciones de servicio y derechos

- **Probabilidad:** alta de incompatibilidad contractual; consecuencia externa
  indeterminada.
- **Impacto:** alto si el producto se distribuye.
- **Descripción:** descargar, cachear, separar o modificar audio de YouTube no
  está autorizado por sus condiciones públicas sin aprobación escrita.
- **Decisión:** uso privado, sin distribución, venta ni promoción. Esta decisión
  no convierte la actividad en autorizada ni es asesoría legal.
- **Mitigación:** reevaluación obligatoria antes de compartir, publicar o cobrar;
  no tratar Premium como licencia de extracción; no acceder a contenido con DRM.

## R-003 — Cuenta o credenciales

- **Probabilidad:** media.
- **Impacto:** alto.
- **Descripción:** pérdida, exposición o invalidación de tokens/cookies.
- **Mitigación:** Keychain, privilegio mínimo, OAuth en navegador del sistema,
  redacción de logs, revocación sencilla y perfil de cuenta dedicado si se
  decide usar credenciales sensibles.

## R-004 — Fuente desaparecida o restringida

- **Probabilidad:** alta.
- **Impacto:** medio.
- **Mitigación:** alternativas por posición, verificación reciente, no depender
  de una URL temporal persistida, promover reemplazos antes de terminar la pista.

## R-005 — Análisis musical incorrecto

- **Probabilidad:** alta en parte del catálogo.
- **Impacto:** medio.
- **Mitigación:** confianza por característica, detección de half/double BPM,
  corpus diverso, fallback conservador y corrección manual persistente.

## R-006 — Choque vocal o transición desagradable

- **Probabilidad:** media.
- **Impacto:** medio.
- **Mitigación:** detectar regiones vocales, acortar mezcla, preferir
  `FADE_THEN_START`, almacenar feedback por pareja y versión.

## R-007 — Falta de continuidad

- **Probabilidad:** media.
- **Impacto:** alto para la promesa central.
- **Mitigación:** dos pistas preparadas, candidatos alternativos, puntos de
  salida múltiples, loop validado, métricas de preparación y prueba con fallos
  de red.

## R-008 — Rendimiento térmico y batería

- **Probabilidad:** media.
- **Impacto:** medio.
- **Mitigación:** límite de workers, análisis con anticipación acotada, caché por
  fingerprint, perfiles de calidad y telemetría local de CPU/memoria.

## R-009 — Crecimiento del almacenamiento

- **Probabilidad:** alta.
- **Impacto:** medio.
- **Mitigación:** audio temporal, presupuesto configurable, limpieza LRU de
  artefactos regenerables y reporte visible de uso de disco.

## R-010 — Corrupción de JSON o cierre inesperado

- **Probabilidad:** media.
- **Impacto:** alto.
- **Mitigación:** escrituras atómicas, backups, NDJSON append-only, validación al
  leer, cuarentena y pruebas de interrupción.

## R-011 — IA impredecible o costosa

- **Probabilidad:** media.
- **Impacto:** bajo para audio, medio para experiencia.
- **Mitigación:** fuera del camino crítico, esquemas estrictos, timeout,
  presupuesto, caché y fallback determinista.

## R-012 — Metadata ambigua de YouTube

- **Probabilidad:** alta.
- **Impacto:** medio.
- **Mitigación:** normalización, confianza, heurísticas por canal, fingerprint,
  revisión manual y separación entre créditos originales e identidad canónica.

## R-013 — Alcance excesivo

- **Probabilidad:** alta.
- **Impacto:** alto.
- **Mitigación:** hitos verticales, macOS solamente, un usuario, sin nube, sin
  stems ni exportación, IA después del motor determinista.

## Disparadores de reevaluación

Detener y revisar la estrategia si ocurre cualquiera:

- intención de distribuir o cobrar por la aplicación;
- bloqueo o advertencia sobre la cuenta;
- necesidad de evadir DRM o controles de seguridad;
- mantenimiento del adaptador supera el del producto;
- no se logra una sesión de dos horas estable tras el Hito 5;
- el almacenamiento temporal deja de ser controlable.
