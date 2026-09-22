# Definición del producto

## 1. Visión

NeoAres permite crear varios DJs con identidad propia y pedirles una
sesión adecuada para una ocasión. Cada DJ recuerda sus reglas, selecciona
canciones de YouTube, construye una trayectoria de energía y procura
transiciones musicalmente coherentes sin intervención continua del usuario.

Ejemplos:

- DJ Fiesta Salsera
- DJ Rock en Español
- DJ Punk Rock
- DJ Carnavales de Barranquilla
- DJ Diciembre Barranquillero
- DJ Diciembre Bogotano
- DJ Reguetón
- DJ relacionado con un artista semilla

## 2. Promesa

> Elegir bien la siguiente canción y hacer que la música continúe con la menor
> intervención posible.

La aplicación conserva siempre la velocidad y el tono originales de cada pista.
Las transiciones usan fade-out/fade-in entre dos decks; la continuidad y la
fidelidad del audio tienen prioridad sobre el beatmatching.

## 3. Usuario y contexto

- Un solo usuario conocido.
- Uso doméstico y privado.
- Equipo macOS conectado a internet.
- Cuenta de Google/YouTube opcional para importar datos autorizados.
- Sesiones típicas entre 30 minutos y 8 horas.
- El usuario puede dejar la aplicación sin supervisión durante largos periodos.

## 4. Objetivos

1. Crear, editar, duplicar, archivar y eliminar DJs.
2. Iniciar una sesión a partir de un DJ, una intención puntual o una colección
   de enlaces.
3. Mantener una cola con al menos tres candidatos y dos canciones preparadas.
4. Evitar repeticiones, cambios bruscos y versiones inadecuadas.
5. Analizar cada pista antes de mezclarla.
6. Ejecutar transiciones reproducibles y explicar por qué se seleccionó cada
   canción.
7. Recibir órdenes durante la sesión sin detener el audio.
8. Aprender de skips, bloqueos, favoritos y ajustes manuales.
9. Recuperar una sesión tras un cierre inesperado.
10. Mantener todos los datos de usuario en el equipo.

## 5. No objetivos iniciales

- Multiusuario, colaboración o perfiles familiares.
- Aplicaciones móviles, TV o control remoto.
- Publicación en tiendas de aplicaciones.
- Servicio web o reproducción desde un servidor.
- Biblioteca permanente de archivos de audio.
- Creación de música, stems o remixes exportables.
- Grabación o exportación de sesiones.
- Reemplazar la interfaz completa de YouTube.
- Garantizar reproducción cuando no exista conexión ni audio preparado.

## 6. Conceptos principales

### DJ

Configuración persistente que contiene identidad, intención musical, fuentes,
restricciones y comportamiento de energía. No es una playlist estática.

### Sesión

Instancia ejecutable de un DJ en una fecha concreta. Congela una versión de las
reglas del DJ para que el historial sea reproducible.

### Pista

Representación normalizada de un video de YouTube que creemos corresponde a una
canción o pieza reproducible.

### Análisis

Metadatos musicales calculados localmente: tempo, rejilla de beats, tonalidad,
frases, energía, sonoridad y segmentos útiles.

### Candidato

Pista considerada para una posición de la cola, con puntuación y razones.

### Plan de transición

Contrato inmutable que indica dónde y cómo salir de una pista y entrar en la
siguiente.

## 7. Viajes principales

### 7.1 Crear un DJ

1. El usuario escribe nombre y descripción libre.
2. Agrega artistas, canciones, playlists o términos semilla.
3. Define exclusiones y nivel de exploración.
4. Escoge una trayectoria de energía o acepta la sugerida.
5. La aplicación muestra una interpretación resumida para confirmar.
6. El DJ se guarda localmente.

### 7.2 Iniciar una sesión

1. El usuario selecciona un DJ.
2. Puede añadir una instrucción temporal, como "más clásicos hoy".
3. El curador genera candidatos y resuelve las primeras pistas.
4. El analizador prepara las dos primeras pistas.
5. La reproducción comienza cuando existe una ruta segura de continuidad.

### 7.3 Intervenir durante una sesión

Órdenes mínimas:

- Saltar ahora.
- No volver a poner esta canción.
- No volver a poner este artista durante esta sesión.
- Me gusta / no me gusta.
- Más o menos energía.
- Más conocido / más exploratorio.
- Poner una canción o artista pronto.
- Pausar y reanudar.
- Finalizar después de esta canción.

### 7.4 Recuperar una sesión

Tras un cierre inesperado, la aplicación ofrece:

- Reanudar desde la pista y posición aproximadas.
- Reiniciar la pista actual.
- Cerrar la sesión y conservar su historial.

## 8. Requisitos funcionales

Los identificadores `FR-*` serán usados por pruebas y decisiones futuras.

- **FR-001:** cada DJ tiene un UUID estable y un `schemaVersion`.
- **FR-002:** editar un DJ no modifica el snapshot de sesiones anteriores.
- **FR-003:** una sesión no empieza hasta que la pista inicial está lista y
  existe al menos un candidato posterior resoluble.
- **FR-004:** el curador conserva siempre una reserva de candidatos.
- **FR-005:** una pista no se reproduce si no supera las reglas de
  disponibilidad, duración y tipo de contenido.
- **FR-006:** toda selección almacena puntuación, reglas aplicadas y razones.
- **FR-007:** toda transición almacena la versión del análisis y del
  planificador usados.
- **FR-008:** una orden del usuario produce un evento auditable.
- **FR-009:** un fallo de IA no detiene la sesión.
- **FR-010:** un fallo al resolver una pista activa inmediatamente un candidato
  alternativo.
- **FR-011:** los archivos de estado se escriben atómicamente.
- **FR-012:** los secretos no aparecen en archivos de datos, eventos ni logs.
- **FR-013:** se puede eliminar toda la información relacionada con un DJ.
- **FR-014:** los datos persistentes se migran entre versiones de esquema.
- **FR-015:** la caché temporal puede vaciarse sin perder DJs ni historial.
- **FR-016:** la sesión funciona sin IA después de haber preparado una cola.
- **FR-017:** cada pista puede marcarse como permitida, bloqueada o pendiente de
  revisión.
- **FR-018:** el usuario puede inspeccionar y modificar la cola futura.
- **FR-019:** el motor nunca modifica silenciosamente las reglas persistentes de
  un DJ a partir de una orden temporal.
- **FR-020:** el cierre normal elimina los artefactos temporales no requeridos.
- **FR-021:** al reabrir, se selecciona el último DJ y se ofrece recuperar la
  sesión activa con su cola, orden, pista y posición aproximada.
- **FR-022:** `PAUSE` suspende exclusivamente el audio y no cancela preparación.
- **FR-023:** después de iniciar un DJ, un fallo recuperable de una pista no
  termina la sesión; activa reemplazo y recuperación.
- **FR-024:** la cola mantiene al menos cuatro pistas futuras y apunta a seis.
- **FR-025:** entrevistas, documentales y contenido hablado se rechazan antes de
  reproducirse mediante evidencia auditable.
- **FR-026:** la preparación calcula ganancia de normalización por pista sin
  modificar tono, BPM, archivo fuente ni volumen elegido por el usuario.
- **FR-027:** la caché de audio se limpia periódicamente aunque NeoAres permanezca
  abierto y nunca elimina archivos protegidos por reproducción o recuperación.

## 9. Requisitos de calidad

- **NFR-001 Continuidad:** con red saludable y dos pistas preparadas, al menos
  99,5 % del tiempo de sesión contiene audio intencional.
- **NFR-002 Recuperación:** el snapshot activo se actualiza como máximo cada
  cinco segundos y en cada cambio de estado importante.
- **NFR-003 Respuesta:** los controles locales de reproducción responden en
  menos de 150 ms en el percentil 95.
- **NFR-004 Anticipación:** la siguiente pista debe estar lista al menos 30
  segundos antes del punto de transición previsto.
- **NFR-005 Privacidad:** ningún historial se envía a terceros salvo los datos
  estrictamente necesarios para una función que el usuario haya activado.
- **NFR-006 Observabilidad:** cada fallo contiene módulo, código, severidad y
  acción de recuperación, sin secretos.
- **NFR-007 Reproducibilidad:** con los mismos análisis, reglas y semilla
  aleatoria, el planificador produce la misma decisión.
- **NFR-008 Degradación:** si falta análisis avanzado, existe una transición
  conservadora; si falta audio, existe un candidato alternativo.

## 10. Criterios de éxito del primer producto

- Crear tres DJs claramente diferentes.
- Completar una sesión de dos horas sin intervención obligatoria.
- Cero cierres de aplicación durante diez sesiones de prueba.
- Ningún artista se repite dentro de su ventana configurada.
- Al menos 80 % de las transiciones son calificadas como aceptables o mejores
  por el usuario.
- Menos de una transición de emergencia por hora con una red estable.
- Poder explicar cualquier elección desde el historial local.

## 11. Supuestos que deberán validarse

- La resolución de las fuentes de YouTube es suficientemente estable para uso
  privado.
- El equipo puede analizar más rápido que el consumo de la cola.
- Los metadatos inferidos de título y canal permiten identificar canción,
  artista y versión con precisión útil.
- Preparar dos pistas ofrece margen suficiente ante variaciones de red.
- Una combinación de reglas y retroalimentación personal supera al shuffle de
  YouTube para las ocasiones objetivo.
