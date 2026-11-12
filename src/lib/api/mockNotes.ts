import type {
  CreateNoteInput,
  Note,
  NoteFilters,
  NoteOrigin,
  NoteWithCourse,
  UpdateNoteInput,
} from '../../types/domain';
import { getMockCourseByIdSync } from './mockCourses';

const VALID_ORIGINS = new Set<NoteOrigin>([
  'manual',
  'ai_summary',
  'ai_study_guide',
  'ai_practice_exam',
]);

const INITIAL_MOCK_NOTES: Note[] = [
  {
    id: 'note-1',
    courseId: 'ing-soft-1',
    title: 'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica',
    content: `# Métricas Ágiles y Estimación

> **Recordatorio para el 2° Parcial:** la velocidad mide capacidad histórica del equipo, nunca debe usarse como objetivo ni para comparar equipos distintos.

## Criterios INVEST para Historias de Usuario

- [x] **Independiente**: se puede planificar y entregar sin bloqueos fuertes
- [x] **Negociable**: abre conversación entre producto y desarrollo
- [x] **Valiosa**: aporta valor directo al usuario o negocio
- [ ] **Estimable**: el equipo comprende el alcance suficiente para dimensionarla
- [ ] **Pequeña (Small)** y **Testeable**

## Puntos de historia vs. Horas ideales

| Concepto | Qué mide | Ventaja principal | Riesgo habitual |
| :--- | :--- | :--- | :--- |
| **Story Points** | Complejidad, esfuerzo e incertidumbre | Estabilidad relativa entre sprints | Convertirlos 1 a 1 en horas |
| **Horas ideales** | Tiempo neto sin interrupciones | Fácil de comunicar al inicio | Ignora reuniones y bloqueos |
| **Cycle Time** | Tiempo desde inicio hasta Done | Detecta cuellos de botella | Sensible a tareas muy grandes |

\`\`\`ts
export function calculateVelocity(completedPointsBySprint: number[]): number {
  if (completedPointsBySprint.length === 0) return 0;
  const total = completedPointsBySprint.reduce((acc, pts) => acc + pts, 0);
  return Math.round((total / completedPointsBySprint.length) * 10) / 10;
}
\`\`\`
`,
    origin: 'manual',
    isPinned: true,
    createdAt: '2026-10-18T14:00:00.000Z',
    updatedAt: '2026-11-10T10:30:00.000Z',
  },
  {
    id: 'note-2',
    courseId: 'diseno-sistemas',
    title: 'Comparativa práctica: Strategy vs. State en el dominio de envíos',
    content: `# Strategy vs. State en el TP Integrador

Ambos patrones encapsulan comportamiento detrás de una interfaz común, pero resuelven **problemas de diseño distintos**.

> **Regla práctica:** si el cliente elige *cómo* ejecutar una operación (ej. tarifa estándar vs. exprés), usá **Strategy**. Si el objeto cambia de comportamiento automáticamente según su ciclo de vida, usá **State**.

## Cuadro comparativo

| Criterio | Strategy | State |
| :--- | :--- | :--- |
| **Quién decide el cambio** | El cliente o configuración externa | El contexto o el propio estado |
| **Conocimiento entre clases** | Las estrategias no se conocen entre sí | Los estados suelen conocer las transiciones |
| **Caso en envíos** | Cálculo de costo por correo | \`Pendiente\` → \`EnCamino\` → \`Entregado\` |

## Ejemplo de interfaz de transición

\`\`\`ts
interface ShipmentState {
  dispatch(shipment: Shipment): void;
  deliver(shipment: Shipment): void;
}
\`\`\`

- [x] Definir diagrama de clases del módulo de logística
- [ ] Agregar tests unitarios de transiciones inválidas
`,
    origin: 'manual',
    isPinned: true,
    createdAt: '2026-10-22T16:15:00.000Z',
    updatedAt: '2026-11-09T19:45:00.000Z',
  },
  {
    id: 'note-3',
    courseId: 'bd-2',
    title: 'Guía de estudio: Niveles de aislamiento y fenómenos de lectura',
    content: `# Transacciones ACID y Niveles de Aislamiento

> Un mayor nivel de aislamiento reduce anomalías de concurrencia, pero incrementa la contención de locks o reintentos optimistas.

## Fenómenos posibles según el estándar SQL

| Nivel de aislamiento | Dirty Read | Non-Repeatable Read | Phantom Read |
| :--- | :--- | :--- | :--- |
| **Read Uncommitted** | Posible | Posible | Posible |
| **Read Committed** | Evitado | Posible | Posible |
| **Repeatable Read** | Evitado | Evitado | Posible (en estándar) |
| **Serializable** | Evitado | Evitado | Evitado |

## Análisis de planes de ejecución

\`\`\`sql
CREATE INDEX idx_orders_course_due
  ON tasks (course_id, status, due_date);

EXPLAIN ANALYZE
SELECT id, title
FROM tasks
WHERE course_id = 'bd-2' AND status = 'pending'
ORDER BY due_date ASC;
\`\`\`

- [x] Repasar anomalía de *Write Skew* en Snapshot Isolation
- [ ] Practicar ejercicios de grafos de precedencia y seriabilidad por conflictos
`,
    origin: 'ai_study_guide',
    isPinned: false,
    createdAt: '2026-10-28T11:20:00.000Z',
    updatedAt: '2026-11-07T15:10:00.000Z',
  },
  {
    id: 'note-4',
    courseId: 'proba-estadistica',
    title: 'Variables Aleatorias, Esperanza y Teorema de Bayes',
    content: `# Repaso de Distribuciones y Bayes

> La **esperanza matemática** es un operador lineal: $E[aX + bY] = aE[X] + bE[Y]$ incluso cuando $X$ e $Y$ no son independientes.

## Distribuciones clave del cuatrimestre

| Distribución | Tipo | Parámetros | Esperanza | Varianza |
| :--- | :--- | :--- | :--- | :--- |
| **Binomial** | Discreta | $n, p$ | $np$ | $np(1-p)$ |
| **Poisson** | Discreta | $\\lambda$ | $\\lambda$ | $\\lambda$ |
| **Exponencial** | Continua | $\\lambda$ | $1/\\lambda$ | $1/\\lambda^2$ |
| **Normal** | Continua | $\\mu, \\sigma^2$ | $\\mu$ | $\\sigma^2$ |

## Checklist para la guía práctica

- [x] Ejercicios de probabilidad condicional y partición del espacio muestral
- [ ] Calcular intervalos de confianza con varianza desconocida (t-Student)
`,
    origin: 'manual',
    isPinned: false,
    createdAt: '2026-11-01T13:00:00.000Z',
    updatedAt: '2026-11-06T17:40:00.000Z',
  },
  {
    id: 'note-5',
    courseId: 'paradigmas',
    title: 'Programación Funcional en Haskell: Orden Superior y Composición',
    content: `# Orden Superior, Currificación y Composición

En **Haskell**, toda función recibe un único argumento y devuelve otra función cuando tiene múltiples parámetros (*currificación*).

> Pensar en transformaciones sobre colecciones con \`map\`, \`filter\` y \`foldr\` evita mutabilidad y facilita razonar por inducción estructural.

\`\`\`haskell
aprobaron :: [(String, Double)] -> [String]
aprobaron = map fst . filter ((>= 4) . snd)

promedioNotas :: [Double] -> Double
promedioNotas xs = sum xs / fromIntegral (length xs)
\`\`\`

## Puntos clave de evaluación diferida (Lazy Evaluation)

- [x] Uso de listas infinitas con \`take\` y \`iterate\`
- [ ] Practicar inferencia de tipos Hindley-Milner paso a paso
- [ ] Diferenciar \`foldr\` vs \`foldl'\` en consumo de memoria
`,
    origin: 'manual',
    isPinned: false,
    createdAt: '2026-11-03T20:00:00.000Z',
    updatedAt: '2026-11-05T21:15:00.000Z',
  },
];

let notesStore: Note[] = structuredClone(INITIAL_MOCK_NOTES);
let nextNoteSeq = 100;

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractTokens(value: string): string[] {
  return normalizeText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function validateTitle(rawTitle: string): string {
  const title = (rawTitle ?? '').trim();
  if (!title) {
    throw new Error('El título de la nota no puede estar vacío.');
  }
  return title;
}

function assertMockCourseExists(rawCourseId: string): string {
  const courseId = (rawCourseId ?? '').trim();
  if (!courseId) {
    throw new Error('Seleccioná una materia para la nota.');
  }
  const course = getMockCourseByIdSync(courseId);
  if (!course) {
    throw new Error(`Course not found: ${courseId}`);
  }
  return courseId;
}

function validateOrigin(origin: NoteOrigin | undefined): NoteOrigin {
  const resolved = origin ?? 'manual';
  if (!VALID_ORIGINS.has(resolved)) {
    throw new Error(`Origen de nota inválido: "${String(origin)}"`);
  }
  return resolved;
}

function enrichNote(note: Note): NoteWithCourse {
  const course = getMockCourseByIdSync(note.courseId);
  return {
    ...note,
    courseName: course?.name ?? 'Materia',
    courseColor: course?.color ?? 'slate',
  };
}

function sortNotes(notes: Note[]): Note[] {
  return notes.sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    const updatedCmp = b.updatedAt.localeCompare(a.updatedAt);
    if (updatedCmp !== 0) {
      return updatedCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

export function resetMockNotes(): void {
  notesStore = structuredClone(INITIAL_MOCK_NOTES);
  nextNoteSeq = 100;
}

export function mockCountNotesByCourse(courseId: string): number {
  return notesStore.filter((n) => n.courseId === courseId).length;
}

export function mockDeleteNotesByCourse(courseId: string): void {
  notesStore = notesStore.filter((n) => n.courseId !== courseId);
}

export async function mockListNotes(
  filters?: NoteFilters
): Promise<NoteWithCourse[]> {
  let result = notesStore.slice();

  if (filters?.courseId) {
    result = result.filter((n) => n.courseId === filters.courseId);
  }

  if (filters?.pinnedOnly) {
    result = result.filter((n) => n.isPinned);
  }

  if (filters?.query) {
    const queryTokens = extractTokens(filters.query);
    if (queryTokens.length > 0) {
      result = result.filter((note) => {
        const words = extractTokens(`${note.title} ${note.content}`);
        return queryTokens.every((qToken) =>
          words.some((word) => word.startsWith(qToken))
        );
      });
    }
  }

  sortNotes(result);
  return structuredClone(result.map(enrichNote));
}

export async function mockGetNote(id: string): Promise<NoteWithCourse | null> {
  const found = notesStore.find((n) => n.id === id);
  return found ? structuredClone(enrichNote(found)) : null;
}

export async function mockCreateNote(
  input: CreateNoteInput
): Promise<NoteWithCourse> {
  const title = validateTitle(input.title);
  const courseId = assertMockCourseExists(input.courseId);
  const content = typeof input.content === 'string' ? input.content : '';
  const origin = validateOrigin(input.origin);
  const isPinned = Boolean(input.isPinned);
  const now = new Date().toISOString();

  const created: Note = {
    id: `note-${++nextNoteSeq}`,
    courseId,
    title,
    content,
    origin,
    isPinned,
    createdAt: now,
    updatedAt: now,
  };

  notesStore.push(created);
  return structuredClone(enrichNote(created));
}

export async function mockUpdateNote(
  id: string,
  input: UpdateNoteInput
): Promise<NoteWithCourse> {
  const index = notesStore.findIndex((n) => n.id === id);
  if (index === -1) {
    throw new Error(`Note not found: ${id}`);
  }

  const current = notesStore[index];
  const now = new Date().toISOString();
  const courseId =
    input.courseId !== undefined
      ? assertMockCourseExists(input.courseId)
      : current.courseId;
  const title =
    input.title !== undefined ? validateTitle(input.title) : current.title;
  const content =
    input.content !== undefined ? input.content : current.content;
  const isPinned =
    input.isPinned !== undefined ? Boolean(input.isPinned) : current.isPinned;

  const updated: Note = {
    ...current,
    courseId,
    title,
    content,
    isPinned,
    updatedAt: now,
  };

  notesStore[index] = updated;
  return structuredClone(enrichNote(updated));
}

export async function mockToggleNotePin(id: string): Promise<NoteWithCourse> {
  const found = notesStore.find((n) => n.id === id);
  if (!found) {
    throw new Error(`Note not found: ${id}`);
  }
  return mockUpdateNote(id, { isPinned: !found.isPinned });
}

export async function mockDeleteNote(id: string): Promise<void> {
  notesStore = notesStore.filter((n) => n.id !== id);
}
