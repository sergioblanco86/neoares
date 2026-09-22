# Persistencia local

## 1. Objetivos

- Datos legibles e inspeccionables.
- Escrituras recuperables ante cierre inesperado.
- Migraciones explícitas.
- Separación entre estado permanente, sesión y caché.
- Ningún secreto en texto plano.

## 2. Directorio lógico

La ruta física se decidirá según la plataforma. La disposición interna será:

```text
data/
├── manifest.json
├── settings.json
├── djs/
│   └── <dj-id>.json
├── tracks/
│   └── <track-id>.json
├── analyses/
│   └── <track-id>/<analysis-id>.json
├── sessions/
│   └── <session-id>/
│       ├── session.json
│       ├── snapshot.json
│       ├── events.ndjson
│       └── transitions/
│           └── <transition-id>.json
├── preferences/
│   └── music-preferences.json
├── cache/
│   ├── sources/
│   ├── waveforms/
│   └── tmp/
├── logs/
│   └── app-YYYY-MM-DD.ndjson
└── backups/
```

## 3. Clasificación

### Permanente

- DJs.
- Settings sin secretos.
- Metadatos normalizados de pistas.
- Análisis reutilizables.
- Preferencias explícitas e inferidas.
- Resúmenes e historiales de sesión.

### Recuperable

- Snapshot de sesión activa.
- Cola preparada.
- Planes de transición.
- Eventos aún no compactados.

### Temporal

- Audio o fragmentos de trabajo.
- URLs efímeras.
- Buffers, waveforms regenerables y artefactos intermedios.
- Respuestas crudas de proveedores.

La limpieza de temporales nunca elimina entidades permanentes.

## 4. Identificadores

- Entidades internas: UUID v7 preferentemente; UUID v4 aceptable.
- Fuente YouTube: `youtube:<videoId>` como clave natural secundaria.
- Los IDs internos no cambian aunque se corrijan artista o título.
- Un video reemplazado por otra versión produce otra pista, relacionada mediante
  `canonicalRecordingId` cuando se conozca.

## 5. Versionado

Cada documento raíz incluye:

```json
{
  "schemaVersion": 1,
  "createdAt": "2026-09-18T20:00:00Z",
  "updatedAt": "2026-09-18T20:00:00Z"
}
```

Reglas:

- `schemaVersion` es entero y se incrementa ante cambios incompatibles.
- Las migraciones son secuenciales e idempotentes.
- Antes de una migración se crea un backup del conjunto afectado.
- Una versión desconocida más nueva se abre en modo solo lectura.
- No se reescribe historia únicamente para cambiar formato; se migra al leer o
  mediante operación explícita.

## 6. Escrituras atómicas

Para documentos JSON:

1. Serializar y validar en memoria.
2. Escribir `<nombre>.tmp` en el mismo filesystem.
3. Forzar flush cuando la plataforma lo permita.
4. Renombrar atómicamente al destino.
5. Conservar una copia `.bak` para documentos críticos.

Para `events.ndjson`:

- una línea JSON completa por evento;
- máximo un escritor por sesión;
- cada línea termina en `\n`;
- al recuperar, la última línea incompleta se ignora y se conserva para
  diagnóstico;
- eventos con `eventId` permiten deduplicación.

## 7. Snapshots y eventos

`session.json` contiene identidad y configuración congelada.

`snapshot.json` contiene el estado mutable más reciente necesario para
recuperar: estado, pista actual, posición aproximada, decks, cola y plan armado.

`events.ndjson` es el historial append-only de decisiones y comandos. El
snapshot incluye `lastAppliedEventId` para evitar doble aplicación.

El audio no se reconstruye únicamente desde eventos; toda recuperación valida
de nuevo disponibilidad y fuentes.

## 8. Integridad

- Cada análisis referencia un fingerprint de la fuente analizada.
- Un plan referencia IDs exactos de análisis.
- Borrar una pista comprueba referencias o aplica borrado en cascada explícito.
- Los índices derivados se pueden reconstruir desde documentos canónicos.
- Los timestamps se guardan en UTC con formato RFC 3339.
- Los números musicales usan punto decimal y unidades documentadas.

## 9. Secretos

Se guardan en Keychain:

- tokens OAuth y refresh tokens;
- cookies o credenciales de sesión, si llegaran a utilizarse;
- API keys de proveedores de IA;
- cualquier valor que permita actuar como el usuario.

JSON solo guarda una referencia:

```json
{
  "credentialRef": "keychain://youtubeshuffle/youtube-primary"
}
```

Nunca se exportan secretos en backups, diagnósticos o ejemplos.

## 10. Retención inicial

- Metadatos y análisis: indefinidos hasta que el usuario los limpie.
- Historial detallado de sesiones: 180 días, configurable.
- Resúmenes de sesión: indefinidos.
- Logs de aplicación: 14 días.
- Respuestas crudas de IA/búsqueda: 24 horas como máximo.
- Audio temporal: caché LRU regenerable con máximo inicial de 1 GiB, objetivo de
  limpieza de 750 MiB y edad máxima sin uso de 30 días. El barrido ocurre al
  iniciar, cada 30 minutos, al volver de suspensión y al superar el presupuesto.
- Archivos parciales: eliminar después de 60 minutos.

La política completa, los archivos protegidos y la migración desde las rutas
anteriores se definen en
[`IMPLEMENTATION_CONTRACTS.md`](IMPLEMENTATION_CONTRACTS.md#7-ciclo-de-vida-de-caché).

## 11. Exportación y eliminación

- Exportar DJs, settings y preferencias como un archivo estructurado sin
  secretos ni temporales.
- Exportar opcionalmente historial y análisis.
- Eliminar un DJ no elimina automáticamente pistas compartidas.
- “Eliminar todos mis datos” borra datos persistentes y caché, y revoca/borra
  referencias del Keychain mediante una acción separada y confirmada.

## 12. Validación

Los documentos se validan contra los esquemas de `contracts/schemas` antes de
escribir y después de leer. Un documento inválido se mueve conceptualmente a
cuarentena y no se corrige de manera silenciosa.
