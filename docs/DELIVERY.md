# Plan de entrega y aceptación

## 1. Estrategia

Construir en cortes verticales. Cada hito debe reproducir algo verificable sin
esperar a que exista el sistema completo.

No se considera terminado un hito únicamente porque compile. Debe satisfacer
sus criterios de aceptación y producir diagnósticos útiles ante fallos.

## 2. Hito 0 — Banco de pruebas de audio

Objetivo: validar que el equipo y la biblioteca elegida permiten dos decks,
reloj estable, ganancia y transiciones.

Alcance:

- reproducir dos fuentes de prueba;
- cargar y preparar el segundo deck;
- crossfade programado;
- medición de underruns y clipping;
- cambio de dispositivo de salida;
- prueba de pausa, reanudación y skip.

Aceptación:

- sesión de una hora sin crash;
- cero clipping en fuentes de prueba normalizadas;
- cien transiciones consecutivas sin estado inválido;
- logs suficientes para localizar cualquier underrun.

## 3. Hito 1 — Fuente y reproducción local

Objetivo: resolver una referencia de YouTube y reproducirla mediante el motor
local sin curaduría.

Alcance:

- entrada manual de URL;
- inspección de metadatos;
- lease temporal de fuente;
- reproducción, pausa, seek y liberación;
- limpieza al cerrar y al reiniciar tras un cierre abrupto.

Aceptación:

- diez referencias válidas reproducen correctamente;
- videos no disponibles producen errores tipados;
- ningún secreto aparece en logs;
- los temporales huérfanos se limpian en el siguiente inicio.

## 4. Hito 2 — Análisis musical

Objetivo: producir `TrackAnalysis` persistente y versionado.

Alcance:

- BPM, beats, sonoridad y energía;
- puntos candidatos de entrada/salida;
- confianza por característica;
- fingerprint y caché por versión de analizador;
- herramienta visual o textual de inspección.

Aceptación:

- corpus de al menos 50 canciones variadas;
- error de BPM revisado manualmente y documentado;
- un análisis cacheado no se recalcula sin motivo;
- fuentes distintas nunca comparten análisis por accidente.

## 5. Hito 3 — Transiciones automáticas

Objetivo: encadenar una lista manual usando planes de transición.

Alcance:

- planificador con `BEATMIX`, `CROSSFADE` y `FADE_THEN_START`;
- dos decks;
- fallback por baja confianza;
- normalización de ganancia;
- calificación manual posterior.

Aceptación:

- sesión de dos horas con una lista manual;
- cero silencios no intencionales con fuentes preparadas;
- cero clipping;
- 80 % de transiciones calificadas como aceptables o mejores;
- cada transición es reproducible desde su contrato.

## 6. Hito 4 — DJ y curaduría determinista

Objetivo: crear DJs y generar colas sin IA.

Alcance:

- CRUD de DJs;
- importación de semillas y playlists;
- filtros duros, scoring y diversidad;
- trayectoria de energía;
- historial, bloqueos y likes;
- explicaciones estructuradas.

Aceptación:

- tres DJs producen sesiones claramente distintas;
- se cumplen ventanas de repetición;
- misma entrada y semilla producen mismo ranking;
- la sesión continúa aunque el proveedor de IA esté deshabilitado.

## 7. Hito 5 — Sesión autónoma y recuperación

Objetivo: operación desatendida.

Alcance:

- orquestador completo;
- cola de candidatos y pistas preparadas;
- promoción de alternativas;
- emergencia y degradación;
- snapshot y recuperación;
- comandos en vivo.

Aceptación:

- diez sesiones de dos horas sin crash;
- recuperación tras cierres forzados en cada estado importante;
- pérdida simulada de red consume lo preparado y falla de forma controlada;
- fallo de candidato no detiene la pista actual;
- `NFR-001` a `NFR-004` medidos y reportados.

## 8. Hito 6 — IA asistida

Objetivo: mejorar creación, descubrimiento y control por lenguaje natural.

Alcance:

- traducción de descripción libre a política;
- expansión de semillas;
- comandos naturales;
- validación de salida estructurada;
- límites de costo, timeout y privacidad;
- fallback determinista.

Aceptación:

- una respuesta inválida nunca modifica estado;
- timeout de IA no afecta audio;
- cada decisión asistida conserva versión y evidencia;
- se puede apagar IA sin perder DJs existentes.

## 9. Hito 7 — Pulido personal

Objetivo: convertir el prototipo en herramienta diaria.

Alcance:

- onboarding mínimo;
- UI de cola y transiciones;
- editor de preferencias;
- estadísticas de sesión;
- exportación/importación;
- backup, restauración y diagnóstico.

Aceptación:

- instalación repetible en un equipo limpio;
- restauración completa desde backup sin secretos;
- una semana de uso diario sin corrupción de datos;
- documentación de actualización y rollback.

## 10. Matriz mínima de pruebas

| Área | Unitarias | Integración | End-to-end |
|---|---:|---:|---:|
| Esquemas y migraciones | Sí | Sí | Sí |
| Scoring y diversidad | Sí | Sí | Sí |
| Análisis musical | Sí | Sí | Corpus |
| Planificador | Sí | Sí | Corpus |
| Mixer | Sí | Sí | Sesiones largas |
| Adaptador YouTube | Sí | Sí | Referencias reales |
| Recuperación | Sí | Sí | Cierres forzados |
| IA | Sí, fixtures | Sí, opcional | Casos seleccionados |

## 11. Definition of Done general

- Contrato o esquema actualizado.
- Migración añadida si cambia persistencia.
- Errores tipados y documentados.
- Logs sin secretos.
- Pruebas proporcionales al riesgo.
- Criterios de aceptación reproducibles.
- Documentación y ADR actualizados cuando cambia una decisión.

## 12. Decisiones antes de implementar

Se resolverán en este orden:

1. Runtime de escritorio y lenguaje principal.
2. Biblioteca y arquitectura de audio.
3. Adaptador inicial de YouTube.
4. Motor de análisis musical.
5. UI y sistema de estado.
6. Proveedor de IA, después de funcionar sin IA.
