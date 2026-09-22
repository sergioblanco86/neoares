# Arquitectura lógica

## 1. Principios

- **Local primero:** estado, análisis e historial viven en el computador.
- **Adaptadores reemplazables:** YouTube, IA, análisis y reproducción se aíslan
  detrás de contratos.
- **Audio fuera de la IA:** ningún modelo remoto participa en el callback o
  camino crítico de audio.
- **Planes inmutables:** una transición aprobada no cambia durante su ejecución.
- **Preparación anticipada:** resolver y analizar ocurre antes de reproducir.
- **Fallos contenidos:** un fallo de descubrimiento no debe tumbar el mixer.
- **Eventos auditables:** decisiones y órdenes importantes generan eventos.

## 2. Mapa de componentes

```text
┌──────────────── Desktop UI ────────────────┐
│ DJs · sesión · cola · controles · historial│
└────────────────────┬───────────────────────┘
                     │ comandos / vistas
┌────────────────────▼───────────────────────┐
│              Session Orchestrator          │
│ estados · recuperación · prioridades       │
└───────┬────────────┬─────────────┬─────────┘
        │            │             │
┌───────▼──────┐ ┌───▼────────┐ ┌──▼────────────────┐
│   Curator    │ │ Preparation│ │   Playback/Mixer  │
│ candidatos   │ │ resolve +  │ │  decks + clocks   │
│ scoring      │ │ analyze    │ │  transitions      │
└───────┬──────┘ └───┬────────┘ └──┬────────────────┘
        │            │             │
┌───────▼────────────▼─────────────▼─────────┐
│ Adaptadores: YouTube · IA · Audio · Keychain│
└────────────────────┬───────────────────────┘
                     │
┌────────────────────▼───────────────────────┐
│ JSON · NDJSON · caché temporal · logs      │
└────────────────────────────────────────────┘
```

## 3. Componentes y responsabilidades

### Desktop UI

- Editar DJs y preferencias.
- Mostrar el estado real, no uno optimista.
- Enviar comandos al orquestador.
- Visualizar pista actual, próxima pista, cola y plan de transición.
- Presentar errores recuperables sin interrumpir innecesariamente.

No accede directamente a archivos, YouTube ni al dispositivo de audio.

### Session Orchestrator

Única autoridad sobre el ciclo de vida de una sesión. Coordina curador,
preparación y mixer, conserva snapshots y aplica comandos del usuario.

Estados principales:

`CREATED → PREPARING → READY → PLAYING ↔ PAUSED → DRAINING → COMPLETED`

Estados terminales adicionales: `FAILED` y `ABORTED`.

### Curator

- Convierte el DJ y la orden temporal en una política de sesión.
- Descubre y normaliza candidatos.
- Aplica exclusiones duras.
- Puntúa y ordena candidatos.
- Mantiene diversidad y trayectoria de energía.
- Devuelve razones estructuradas, no solo una lista.

### Preparation Pipeline

Etapas independientes e idempotentes:

1. Resolver fuente.
2. Adquirir material temporal suficiente.
3. Normalizar metadatos.
4. Analizar audio.
5. Validar confianza y aptitud.
6. Publicar `PreparedTrack` o un fallo tipado.

### Transition Planner

Recibe dos análisis y las restricciones actuales. Produce uno o más planes
ordenados por seguridad. Nunca controla directamente el audio.

### Playback/Mixer Engine

- Mantiene dos decks y un reloj maestro.
- Ejecuta exclusivamente planes validados.
- Aplica ganancia, time-stretch y crossfade.
- Informa métricas y fallos al orquestador.
- Activa el plan de emergencia si la próxima pista no está lista.

### YouTube Source Adapter

Frontera explícita de riesgo. Sus responsabilidades son:

- Buscar e importar referencias.
- Normalizar IDs y URLs.
- Resolver disponibilidad y metadatos actuales.
- Proporcionar una fuente temporal reproducible al pipeline.

El resto del sistema nunca depende de URLs efímeras ni conoce el mecanismo de
resolución.

### AI Intent Adapter

Interfaz opcional para convertir lenguaje natural en preferencias
estructuradas, expandir semillas y explicar decisiones. Sus respuestas siempre
se validan contra esquemas y reglas locales.

### Local Repository

Implementa lecturas, escrituras atómicas, migraciones, snapshots, eventos y
limpieza. La estructura se define en [STORAGE.md](STORAGE.md).

## 4. Contratos de puertos

Las firmas son conceptuales y no obligan a usar TypeScript.

```ts
interface CandidateProvider {
  discover(request: DiscoveryRequest): Promise<CandidatePage>;
}

interface SourceResolver {
  inspect(source: SourceRef): Promise<SourceInspection>;
  prepare(request: PrepareSourceRequest): Promise<PreparedSource>;
  release(leaseId: string): Promise<void>;
}

interface TrackAnalyzer {
  analyze(source: PreparedSource, profile: AnalysisProfile): Promise<TrackAnalysis>;
}

interface Curator {
  rank(context: SelectionContext, candidates: Candidate[]): RankedCandidate[];
}

interface TransitionPlanner {
  plan(input: TransitionInput): TransitionPlan[];
}

interface Mixer {
  load(deck: "A" | "B", track: PreparedTrack): Promise<void>;
  arm(plan: TransitionPlan): Promise<void>;
  execute(planId: string): Promise<void>;
  command(command: PlaybackCommand): Promise<CommandResult>;
}

interface LocalRepository {
  get<T>(kind: EntityKind, id: string): Promise<T | null>;
  put<T>(kind: EntityKind, id: string, value: T): Promise<void>;
  appendEvent(event: SessionEvent): Promise<void>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}
```

## 5. Flujo de preparación

```text
Candidate
  → source inspection
  → metadata normalization
  → temporary source lease
  → audio analysis
  → quality gate
  → PreparedTrack
  → transition planning
  → READY in queue
```

Cada etapa genera resultado o error tipado. Los reintentos se hacen por etapa y
nunca vuelven a ejecutar trabajo válido que esté cacheado con la misma versión.

## 6. Concurrencia

- Un único orquestador escribe el estado de la sesión.
- El mixer usa un hilo/proceso prioritario independiente cuando la tecnología lo
  permita.
- Resolución y análisis funcionan en workers con concurrencia limitada.
- La persistencia recibe operaciones serializadas por entidad.
- La UI consume snapshots y eventos; no comparte memoria mutable con audio.

Prioridades:

1. Callback/reloj de audio.
2. Ejecución de transición.
3. Preparación de la siguiente pista.
4. Persistencia del snapshot.
5. Descubrimiento adicional.
6. IA y explicaciones.

## 7. Estrategia de fallos

- **Candidato no disponible:** rechazar y promover el siguiente.
- **Análisis de baja confianza:** usar transición conservadora.
- **Siguiente pista retrasada:** retrasar salida dentro de una ventana segura o
  activar loop de emergencia.
- **Pérdida de red:** consumir pistas preparadas; detener con explicación cuando
  se agoten.
- **Fallo de IA:** continuar con política estructurada y heurísticas.
- **Fallo de persistencia:** mantener audio, mostrar alerta y reintentar; si no
  se recupera, finalizar de forma segura.
- **Fallo del mixer:** detener ganancia gradualmente cuando sea posible y
  conservar diagnóstico.

## 8. Fronteras de seguridad y privacidad

- OAuth se realiza en el navegador del sistema.
- Refresh tokens, cookies o credenciales equivalentes se guardan en Keychain.
- Los contratos persistentes solo contienen referencias opacas a secretos.
- Logs y eventos aplican redacción por lista permitida de campos.
- Ningún adaptador puede leer todo el directorio de datos si solo necesita una
  entidad.
- Las llamadas de IA reciben intención y metadatos mínimos; nunca tokens ni
  audio salvo una decisión futura explícita.

## 9. Decisiones diferidas

- El framework de escritorio actual frente a otras alternativas.
- Lenguaje y biblioteca de audio.
- Proveedor de IA y posibilidad de modelo local.
- Implementación concreta del adaptador de YouTube.
- Motor de análisis musical.
- Formato temporal de audio.

Estas decisiones deben tomarse mediante ADR sin modificar los contratos de
dominio salvo que exista una necesidad demostrada.
