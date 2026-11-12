# ARCHITECTURE.md — Arquitectura y Decisiones Técnicas de Cursada

## 1. Visión General

**Cursada** es una aplicación de escritorio nativa para macOS (Apple Silicon) diseñada para gestionar la vida académica universitaria de forma integral, con una estructura fija, clara y sin fricción, más un asistente de estudio local estilo NotebookLM por cada materia.

Toda la aplicación funciona **100% offline/local**:
- **Shell nativo y Backend**: **Electron + Node.js (`node:sqlite`) + TypeScript** gestiona la ventana nativa de macOS (con barra de título integrada tipo `hiddenInset` para los semáforos de macOS), el acceso seguro al sistema de archivos, la base de datos SQLite local, los backups automáticos, la exportación a Markdown y la comunicación HTTP con Ollama (`http://localhost:11434`).
- **Frontend (Renderer)**: **React 19 + Vite + TypeScript** con CSS nativo modular, `color-scheme: light dark` y variables CSS (`light-dark()`) para soporte automático de modo claro/oscuro según macOS.
- **Fuente de verdad**: Un único archivo **SQLite** en `~/Library/Application Support/com.cursada.app/cursada.sqlite` con **WAL mode** activado, **FTS5** para búsqueda de texto completo sin acentos y almacenamiento de embeddings para búsqueda semántica.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         macOS App (com.cursada.app)                     │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │            Renderer (React + Vite + TypeScript + CSS)             │  │
│  │  • Vistas: Inicio, Calendario, Tareas, Exámenes, Notas, Materias  │  │
│  │  • Materia: Resumen | Tareas | Exámenes | Notas | Fuentes | IA    │  │
│  │  • Editor Markdown (CodeMirror 6 + Preview GFM en vivo)           │  │
│  │  • Extractor de páginas PDF (pdfjs-dist)                          │  │
│  └───────────────────────────────┬───────────────────────────────────┘  │
│                                  │ Electron IPC (contextBridge tipado)  │
│  ┌───────────────────────────────▼───────────────────────────────────┐  │
│  │          Main Process Local (Electron + Node.js + node:sqlite)    │  │
│  │  • Servicios de Dominio (Courses, Tasks, Exams, Notes, Sources)   │  │
│  │  • Motor RAG Híbrido (FTS5 BM25 + Cosine Similarity por materia)  │  │
│  │  • Generador Map-Reduce de Reportes para ventanas chicas          │  │
│  │  • Gestor de Backups Automáticos + Exportador a Markdown          │  │
│  └───────────────┬───────────────────────────────────┬───────────────┘  │
└──────────────────┼───────────────────────────────────┼──────────────────┘
                   │                                   │ HTTP (localhost:11434)
                   ▼                                   ▼
   ┌───────────────────────────────┐   ┌───────────────────────────────┐
   │  SQLite + Archivos Locales    │   │         Ollama Local          │
   │  • cursada.sqlite (WAL + FTS5)│   │  • /api/embed (Embeddings)    │
   │  • backups/ (rotación 15)     │   │  • /api/chat  (Streaming RAG) │
   │  • sources/ (copias locales)  │   │  • /api/tags  (Modelos disp.) │
   └───────────────────────────────┘   └───────────────────────────────┘
```

---

## 2. Decisiones Técnicas y de Producto Acordadas

### 2.1. Shell de Escritorio: Electron + TypeScript + `node:sqlite`
- **Decisión confirmada**: **Electron + React + Vite + TypeScript + `node:sqlite` (`DatabaseSync`)**.
- **Por qué**:
  - Todo el código (frontend, proceso principal de Electron, repositorios SQLite, motor RAG y suite de tests en Vitest) está escrito 100% en **TypeScript**, con compilación instantánea (< 2s) y sin requerir toolchain de Rust.
  - Usamos el módulo nativo integrado `node:sqlite` (`DatabaseSync`), que ya incluye **FTS5** (`unicode61 remove_diacritics 2`), **`VACUUM INTO`** para backups en caliente y soporte de `Uint8Array` para vectores, evitando problemas de recompilación de addons C++ (`node-gyp` / `electron-rebuild`) entre Vitest y Electron.

### 2.2. Decisiones de Producto Confirmadas por el Product Owner
1. **Cuatrimestres e historial**: La barra lateral muestra las materias del **cuatrimestre actual**, mientras que las materias de cuatrimestres anteriores quedan agrupadas en una sección desplegable de **Archivo / Cuatrimestres anteriores**.
2. **Horarios y Calendario (Mensual y Semanal)**:
   - Cada bloque de horario de cursada incluye día, hora de inicio, hora de fin y un campo opcional de **Aula / Sede / Modalidad** (`location`).
   - La sección **Calendario** abre por defecto en **Vista Mensual** (semanas completas de Lunes a Domingo cubriendo todo el mes) y cuenta con un selector **`Mensual | Semanal`** para alternar a la vista semanal detallada. Todas las celdas de 7 columnas aplican `min-inline-size: 0` y truncado con elipsis en una línea para evitar desbordes de fuentes en nombres largos de materias, entregas o exámenes.
3. **Tareas (To-do)**:
   - Dos estados simples y directos: **Pendiente (`pending`)** y **Completada (`done`)**.
   - Todas las tareas pertenecen obligatoriamente a una materia (`course_id NOT NULL`).
4. **Exámenes y calificaciones**:
   - Escala de **1 a 10**, categorizados en **Parcial, Recuperatorio, Final y TP evaluativo**.
   - La vista de cada materia calcula y muestra el **promedio** de las notas cargadas además de la nota individual de cada examen.
5. **Fuentes para IA y Reportes**:
   - Soporta archivos **`.pdf`, `.md`, `.txt`** y además **pegar texto directo** como fuente desde la interfaz.
   - En los reportes de **Preguntas de práctica para examen**, el usuario puede **elegir el formato** antes de generarlo (Preguntas a desarrollar, Multiple choice o Mixto).

### 2.3. Base de Datos: SQLite + FTS5 + Búsqueda Vectorial Híbrida
- **FTS5 nativo con soporte para español**: Con el tokenizador `unicode61 remove_diacritics 2`, buscar `"algebra"`, `"limite"` o `"programacion"` encuentra `"Álgebra"`, `"Límite"` o `"Programación"`.
- **Vectores en SQLite + Similitud Coseno Exacta**:
  - Cada fragmento (`source_chunks`) almacena su vector como `BLOB` (`Float32Array` serializado en binario) junto con su dimensión (`embedding_dim`) y `course_id`.
  - Al consultar una materia, se combina la **Similitud Coseno Exacta** sobre los vectores de esa materia (< 1 ms para miles de chunks en el chip M5) con **FTS5 BM25** mediante *Reciprocal Rank Fusion (RRF)*. Esto evita depender de extensiones C pre-1.0 (`sqlite-vec`) que fijan la dimensión del vector o dificultan el empaquetado `.app` en macOS.

---

## 3. Modelo de Datos (SQLite)

La base de datos se inicializa con `PRAGMA foreign_keys = ON;` y `PRAGMA journal_mode = WAL;`.

```sql
-- 1. Materias (Concepto central)
CREATE TABLE courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,              -- 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'cyan' | 'orange' | 'slate'
    professor TEXT NOT NULL DEFAULT '',
    term TEXT NOT NULL,               -- Ej: '2026 - 2° Cuatrimestre'
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 2. Horarios semanales recurrentes de cursada
CREATE TABLE class_schedules (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1 = Lunes ... 7 = Domingo
    start_time TEXT NOT NULL,         -- Formato 'HH:MM' (24h), ej. '18:30'
    end_time TEXT NOT NULL,           -- Formato 'HH:MM' (24h), ej. '22:30'
    location TEXT NOT NULL DEFAULT '' -- Opcional: Aula / Sede / Virtual
);
CREATE INDEX idx_schedules_course ON class_schedules(course_id);
CREATE INDEX idx_schedules_day ON class_schedules(day_of_week);

-- 3. Tareas (To-do: 2 estados simples, siempre asociadas a una materia)
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date TEXT,                    -- ISO 'YYYY-MM-DD'
    priority TEXT CHECK (priority IN ('low', 'medium', 'high') OR priority IS NULL),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_course ON tasks(course_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_status ON tasks(status);

-- 4. Exámenes (Categorizados + Escala 1 a 10)
CREATE TABLE exams (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,              -- Ej: '1° Parcial', 'Recuperatorio', 'Final'
    category TEXT NOT NULL DEFAULT 'parcial' CHECK (category IN ('parcial', 'recuperatorio', 'final', 'tp')),
    exam_date TEXT NOT NULL,          -- ISO 'YYYY-MM-DD'
    exam_time TEXT,                   -- Opcional 'HH:MM' para ubicarlo en el calendario horario
    location TEXT NOT NULL DEFAULT '',-- Opcional: Aula
    topics TEXT NOT NULL DEFAULT '',  -- Temas que entran en el examen
    grade REAL CHECK (grade IS NULL OR (grade >= 1 AND grade <= 10)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_exams_course ON exams(course_id);
CREATE INDEX idx_exams_date ON exams(exam_date);

-- 5. Notas por materia (Markdown)
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'ai_summary', 'ai_study_guide', 'ai_practice_exam')),
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_notes_course ON notes(course_id);
CREATE INDEX idx_notes_updated ON notes(updated_at DESC);

CREATE VIRTUAL TABLE notes_fts USING fts5(
    note_id UNINDEXED,
    course_id UNINDEXED,
    title,
    content,
    tokenize = 'unicode61 remove_diacritics 2'
);

-- 6. Fuentes de estudio por materia (PDF, MD, TXT o texto pegado)
CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('pdf', 'markdown', 'txt', 'pasted_text')),
    original_path TEXT,
    stored_filename TEXT,
    raw_text TEXT NOT NULL DEFAULT '',
    page_count INTEGER NOT NULL DEFAULT 1,
    char_count INTEGER NOT NULL DEFAULT 0,
    indexing_status TEXT NOT NULL DEFAULT 'pending' CHECK (indexing_status IN ('pending', 'indexing', 'ready', 'error')),
    indexing_error TEXT,
    embedding_model TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_sources_course ON sources(course_id);

-- 7. Fragmentos (Chunks) indexados + Embeddings
CREATE TABLE source_chunks (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,              -- Página de origen (1..N) para citas precisas
    content TEXT NOT NULL,
    embedding BLOB,                   -- Vector Float32 serializado
    embedding_dim INTEGER
);
CREATE INDEX idx_chunks_source ON source_chunks(source_id);
CREATE INDEX idx_chunks_course ON source_chunks(course_id);

CREATE VIRTUAL TABLE source_chunks_fts USING fts5(
    chunk_id UNINDEXED,
    source_id UNINDEXED,
    course_id UNINDEXED,
    content,
    tokenize = 'unicode61 remove_diacritics 2'
);

-- 8. Conversaciones y Mensajes de Chat con Citas
CREATE TABLE chat_threads (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_chat_threads_course ON chat_threads(course_id);

CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations_json TEXT NOT NULL DEFAULT '[]',
    model_used TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_id);

-- 9. Configuración global de la app
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

---

## 4. Estructura del Proyecto

```text
Cursada/
├── AGENTS.md                        # Reglas, convenciones y comandos para sesiones futuras
├── ARCHITECTURE.md                  # Diseño técnico, decisiones de stack y esquema de datos
├── PROGRESS.md                      # Estado actual, historial de avances y próximos pasos
├── ROADMAP.md                       # Plan detallado por fases con tareas y criterios de aceptación
├── package.json                     # Dependencias y scripts (Vite + Electron + Vitest)
├── tsconfig.json                    # Configuración estricta de TypeScript
├── vite.config.ts                   # Configuración de Vite y Vitest
├── index.html                       # Entrada HTML de la ventana de Cursada
├── electron/                        # Backend local en Node.js / Electron Main Process
│   ├── main.ts                      # Creación de BrowserWindow nativa macOS y ciclo de vida
│   ├── preload.ts                   # Puente contextBridge seguro (window.cursadaApi)
│   ├── db/
│   │   ├── database.ts              # Conexión node:sqlite, WAL mode y aislamiento en tests
│   │   ├── migrations.ts            # Migraciones versionadas (PRAGMA user_version)
│   │   ├── coursesRepo.ts           # Persistencia de materias y horarios semanales
│   │   ├── tasksRepo.ts             # Persistencia de tareas
│   │   ├── examsRepo.ts             # Persistencia de exámenes y cálculo de promedios
│   │   ├── notesRepo.ts             # Persistencia de notas y sincronización FTS5
│   │   ├── sourcesRepo.ts           # Persistencia de fuentes, chunks y búsqueda híbrida
│   │   └── chatRepo.ts              # Persistencia de conversaciones y mensajes con citas
│   ├── services/
│   │   ├── backupService.ts         # Backups automáticos (VACUUM INTO) y rotación de los últimos 15
│   │   ├── exportService.ts         # Exportación completa o por materia a carpetas Markdown (.md)
│   │   ├── chunkingService.ts       # División de fuentes en fragmentos con solapamiento y página
│   │   ├── ragService.ts            # Búsqueda híbrida (Coseno + FTS5) y armado de contexto citado
│   │   ├── reportService.ts         # Generación Map-Reduce de resúmenes, guías y exámenes (con formato elegible)
│   │   └── ollamaClient.ts          # Cliente HTTP hacia localhost:11434 (/api/tags, /api/embed, /api/chat)
│   └── ipc/
│       ├── handlers.ts              # Registro central de dominios IPC
│       ├── systemHandlers.ts        # Canales IPC de backups y directorio de datos
│       ├── coursesHandlers.ts       # Canales IPC de materias y horarios (con backup pre-borrado)
│       ├── tasksHandlers.ts         # Canales IPC de tareas
│       └── examsHandlers.ts         # Canales IPC de exámenes y calificaciones
└── src/                             # Frontend (React + TypeScript)
    ├── main.tsx                     # Punto de montaje de React
    ├── App.tsx                      # Layout principal, contrato de navegación y sincronización de barra lateral
    ├── styles/                      # Estilos CSS nativos y tokens de diseño (Claro/Oscuro + hojas por dominio)
    ├── types/                       # Tipos compartidos entre Renderer y Main (domain.ts + design.ts)
    ├── lib/
    │   ├── api/                     # Cliente tipado (client.ts) + mocks por dominio (mockCourses.ts, mockTasks.ts, mockExams.ts, mockClient.ts)
    │   ├── dates/                   # Utilidades de calendario mensual y semanal (Lunes a Domingo) en español
    │   └── pdf/                     # Extracción de texto de PDFs página por página (pdfjs-dist)
    ├── components/                  # Componentes de UI por dominio (courses/, tasks/, exams/)
    ├── pages/                       # Vistas principales (Inicio, Calendario, Tareas, Exámenes, Notas, Materias, Ajustes)
    └── __tests__/                   # Tests unitarios y de integración (Vitest + RTL + SQLite temporal)
```

---

## 5. Aislamiento de Entorno, Navegación y Seguridad Operativa

- **`CURSADA_DATA_DIR`**: `electron/db/database.ts` prioriza la variable de entorno `CURSADA_DATA_DIR` sobre `~/Library/Application Support/com.cursada.app/`, permitiendo que entornos de desarrollo y agentes en paralelo operen sobre directorios aislados. En `VITEST` / `NODE_ENV=test`, cualquier apertura sin directorio explícito usa automáticamente un directorio temporal (`fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-test-'))`).
- **Borrado seguro de materias**: Antes de eliminar una materia (`courses:delete`), se consulta el impacto (`courses:getDeleteImpact` devuelve cuántas tareas asociadas se eliminarán en cascada para informar en el diálogo de confirmación) y se ejecuta un backup automático (`createBackup(..., 'pre-course-delete')`).
- **Contrato de navegación y refresco reactivo**: `App.tsx` inyecta `onSelectCourse(courseId | null)` a las vistas de dominio y escucha el evento `cursada:data-changed` emitido por `cursadaClient` tras cada mutación, manteniendo sincronizados la lista de materias (activas y archivadas) y el contador de tareas pendientes en `Sidebar.tsx`.
