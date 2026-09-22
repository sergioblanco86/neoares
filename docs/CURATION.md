# Motor de curaduría

## 1. Responsabilidad

El curador decide qué pistas merece la pena preparar y en qué orden deberían
sonar. No descarga audio, no ejecuta transiciones y no cambia reglas
persistentes sin una orden explícita.

## 2. Entradas

- Snapshot del DJ al iniciar la sesión.
- Instrucción temporal de la sesión.
- Pista actual y últimas pistas reproducidas.
- Trayectoria de energía y posición temporal.
- Preferencias y bloqueos persistentes.
- Órdenes recientes del usuario.
- Inventario de pistas analizadas.
- Estado de disponibilidad de candidatos.

## 3. Política estructurada

La descripción libre del DJ se traduce a una política validada con:

- géneros y subgéneros deseados;
- artistas y pistas semilla;
- artistas relacionados derivados de las semillas y del catálogo de cada género;
- términos culturales o contextuales;
- épocas, idiomas y regiones preferidas;
- exclusiones duras;
- nivel de familiaridad frente a descubrimiento;
- diversidad de artistas;
- rango de duración;
- contenido permitido: oficial, lyric, audio, live, remix, extended;
- trayectoria de energía;
- límites de ajuste de tempo y transición.

La interpretación de IA se guarda como propuesta. Solo pasa a ser política
cuando cumple el esquema y no contradice una selección explícita del usuario.

## 4. Generación de candidatos

Fuentes en orden preferente:

1. Peticiones directas del usuario.
2. Pistas y artistas semilla.
3. Playlists importadas.
4. Vecindad de pistas previamente aprobadas.
5. Búsquedas derivadas de género, época, región y ocasión.
6. Exploración controlada.

Los artistas semilla no constituyen una lista cerrada. Se combinan con artistas
relacionados del género y ambos conjuntos rotan entre rondas de búsqueda. Cuando
el DJ define una era, la consulta usa su etiqueta cultural y recorre de forma
determinista los años del rango; así evita repetir siempre los primeros resultados.

Cada candidato debe conservar procedencia y consulta original para poder
explicar y depurar su inclusión.

## 5. Filtros duros

Un candidato se rechaza antes de puntuar cuando:

- el video o canal está bloqueado;
- el artista está dentro de su ventana de repetición;
- la pista ya sonó dentro de su ventana de repetición;
- la duración está fuera de límites;
- parece entrevista, tutorial, reacción, anuncio o contenido no musical;
- el tipo de versión está excluido;
- no está disponible o no puede prepararse;
- viola una instrucción explícita de la sesión;
- su confianza de identidad es inferior al mínimo y no fue solicitada.

Los filtros producen códigos estables como `BLOCKED_ARTIST`,
`RECENT_TRACK`, `UNWANTED_CONTENT_TYPE` o `SOURCE_UNAVAILABLE`.

## 6. Puntuación

La puntuación final está normalizada entre 0 y 1:

```text
score =
  occasionFit        * wOccasion
+ tasteFit           * wTaste
+ sourceAffinity     * wSource
+ bpmCompatibility   * wBpm
+ keyCompatibility   * wKey
+ energyFit          * wEnergy
+ phraseSuitability  * wPhrase
+ novelty            * wNovelty
+ requestPriority    * wRequest
- repetitionPenalty
- uncertaintyPenalty
- preparationPenalty
```

Los pesos pertenecen a la política de sesión. El sistema debe almacenar cada
componente de la puntuación, no solamente el total.

### Reglas de desempate

1. Petición explícita del usuario.
2. Mayor confianza de análisis.
3. Menor riesgo de preparación.
4. Menor repetición histórica.
5. Semilla pseudoaleatoria de la sesión.

## 7. Trayectoria de energía

Una trayectoria es una serie de puntos normalizados en el tiempo de sesión:

```json
[
  { "at": 0.0, "energy": 0.35 },
  { "at": 0.35, "energy": 0.65 },
  { "at": 0.7, "energy": 0.9 },
  { "at": 1.0, "energy": 0.7 }
]
```

Para sesiones sin duración definida se usan fases extensibles:

- `WARMUP`
- `BUILD`
- `PEAK`
- `SUSTAIN`
- `COOLDOWN`, únicamente cuando el usuario anuncia el final.

La energía objetivo es una guía. No justifica una incompatibilidad evidente ni
una repetición prohibida.

## 8. Diversidad y repetición

Valores iniciales recomendados, configurables por DJ:

- misma pista: no repetir durante la sesión;
- mismo artista principal: separación mínima de 45 minutos;
- artista invitado: no cuenta como repetición si no es protagonista;
- máximo dos pistas consecutivas del mismo subgénero muy específico;
- al menos una pista fuera del conjunto más obvio cada 30 minutos cuando la
  exploración sea mayor que cero.

La identidad normalizada debe agrupar variaciones ortográficas y colaboraciones
sin perder los créditos originales.

## 9. Órdenes en vivo

Las órdenes producen overrides con alcance explícito:

- `NEXT_SELECTION`: solo la próxima elección.
- `SESSION`: hasta finalizar la sesión.
- `DJ`: cambio persistente confirmado por el usuario.

Ejemplos:

- “más energía” crea un desplazamiento temporal que decae gradualmente;
- “no más Bad Bunny hoy” crea un bloqueo de sesión;
- “nunca vuelvas a poner esta versión” crea un bloqueo persistente;
- “pon X después” crea una petición de prioridad máxima, sujeta a
  disponibilidad.

## 10. Uso de IA

Permitido:

- interpretar texto libre;
- proponer artistas o búsquedas relacionadas;
- clasificar títulos ambiguos;
- resumir por qué una pista encaja;
- sugerir política inicial de un DJ.

No permitido en el camino crítico:

- decidir directamente los tiempos de mezcla;
- emitir comandos al mixer;
- alterar archivos o estado sin validación;
- ser la única fuente de candidatos;
- bloquear la continuidad mientras responde.

Toda salida de IA se valida, se limita en tamaño y conserva proveedor, modelo,
fecha y versión del prompt lógico.

## 11. Aprendizaje personal

El MVP no entrena modelos. Actualiza estadísticas locales interpretables:

- aprobación o rechazo por pista, artista y versión;
- tasa de skip y momento del skip;
- órdenes de energía;
- transición aprobada o rechazada;
- contexto del DJ y hora de uso.

Las preferencias inferidas tienen confianza, evidencia y fecha de última
actualización. Nunca se convierten en bloqueo duro sin acción explícita.

## 12. Invariantes

- El curador nunca devuelve una pista bloqueada.
- Toda pista elegida tiene al menos una razón positiva.
- Toda penalización importante queda registrada.
- La cola incluye al menos un candidato alternativo por posición preparada.
- La IA no puede aumentar privilegios ni modificar límites duros.
- La misma entrada y semilla producen el mismo ranking.
