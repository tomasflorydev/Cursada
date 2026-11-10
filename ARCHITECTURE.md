# ARCHITECTURE.md — Arquitectura y Decisiones Técnicas de Cursada

## 1. Visión General

**Cursada** es una aplicación de escritorio nativa para macOS (Apple Silicon) diseñada para gestionar la vida académica universitaria de forma integral, con una estructura fija, clara y sin fricción, más un asistente de estudio local estilo NotebookLM por cada materia.

Toda la aplicación funciona **100% offline/local**:
- **Shell nativo y Backend**: **Tauri 2 (Rust)** gestiona la ventana nativa de macOS, el acceso seguro al sistema de archivos, la base de datos SQLite local, los backups automáticos, la exportación a Markdown y la comunicación HTTP con Ollama (`http://localhost:11434`).
- **Frontend**: **React 19 + Vite + TypeScript** con CSS nativo modular y variables CSS para soporte automático de modo claro/oscuro según macOS.
- **Fuente de verdad**: Un único archivo **SQLite** en `~/Library/Application Support/com.cursada.app/cursada.sqlite` con **WAL mode** activado, **FTS5** para búsqueda de texto completo sin acentos y almacenamiento de embeddings para búsqueda semántica.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         macOS App (com.cursada.app)                     │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │               Frontend (React + Vite + TypeScript)                │  │
│  │  • Vistas: Inicio, Calendario, Tareas, Exámenes, Materia          │  │
│  │  • Materia: Resumen | Tareas | Exámenes | Notas | Fuentes | IA    │  │
│  │  • Editor Markdown (CodeMirror 6 + Preview GFM en vivo)           │  │
│  │  • Extractor de páginas PDF (pdfjs-dist)                          │  │
│  └───────────────────────────────┬───────────────────────────────────┘  │
│                                  │ Tauri IPC (Comandos tipados)         │
│  ┌───────────────────────────────▼───────────────────────────────────┐  │
│  │                     Backend Local (Rust / Tauri 2)                │  │
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

## 2.Decisiones Técnicas y Evaluación del Stack

### 2.1. Shell de Escritorio: Tauri 2 vs. Electron
- **Decisión base**: **Tauri 2 + React + Vite + TypeScript**.
- **Por qué**: Genera un ejecutable `.app` liviano (~12 MB), usa el motor nativo de macOS (`WKWebView`), consume muy poca memoria y permite hacer operaciones intensivas (búsqueda vectorial, backups atómicos de SQLite, escritura de archivos) en hilos nativos de Rust sin bloquear la interfaz.
- **Riesgo detectado y mitigación**:
  - En esta Mac aún no está instalado el compilador de Rust (`rustup`). Se instalará como paso 0 de la Fase 1 (o, si el Product Owner prefiere evitar instalar Rust, toda la arquitectura de capas está diseñada para poder correr idénticamente sobre Electron + `better-sqlite3` sin cambiar el modelo de datos ni el frontend).

### 2.2. Base de Datos: SQLite + FTS5 + Búsqueda Vectorial Híbrida
- **Decisión**: **SQLite (`rusqlite` con feature `bundled`) + FTS5 + Vectores binarios (`BLOB` float32) con Similitud Coseno Exacta filtrada por materia** (con soporte opcional para `sqlite-vec`).
- **Por qué**:
  1. **FTS5 nativo con soporte para español**: Usando el tokenizador `unicode61 remove_diacritics 2`, el usuario puede buscar `"algebra"`, `" límite "` o `"programacion"` y encontrar `"Álgebra"`, `"Límite"` o `"Programación"`.
  2. **Riesgo de `sqlite-vec` puro y ventaja del enfoque híbrido**:
     - `sqlite-vec` es una extensión C pre-1.0 que puede introducir fricciones al firmar el bundle `.app` en macOS y además no filtra por metadatos (`WHERE course_id = ?`) antes de escanear en todas sus versiones sin tablas auxiliares.
     - En el caso de uso real de un estudiante universitario, una materia tiene entre **100 y 5.000 fragmentos (chunks)**. Guardar cada vector como un `BLOB` compacto (`f32` little-endian, 3 KB por vector de 768 dims) en la tabla `source_chunks` con índice en `course_id` y calcular la similitud coseno exacta en Rust en el procesador M5 tarda **< 1 milisegundo**, tiene **100% de precisión (Exact KNN)**, no depende de binarios C externos frágiles, y permite cambiar de modelo de embeddings (de 384, 768 o 1024 dimensiones) sin tener que recrear tablas virtuales con dimensión fija (`FLOAT[768]`).
     - Además, combinamos **Búsqueda Vectorial (semántica)** + **FTS5 BM25 (palabras clave exactas, nombres propios, fórmulas)** mediante *Reciprocal Rank Fusion (RRF)* para recuperar siempre los mejores fragmentos al chatear.

### 2.3. Calendario y Horario Semanal: Componente a medida vs. Librería externa
- **Decisión**: **Construir el calendario semanal a medida con CSS Grid nativo**, sin agregar librerías pesadas como `FullCalendar` o `react-big-calendar`.
- **Por qué**:
  - El calendario de **Cursada** tiene un propósito específico: mostrar la grilla semanal de cursada (bloques recurrentes con el color de cada materia, horario y aula) con los **exámenes** y **entregas de tareas** de esa semana superpuestos de forma limpia.
  - Hacerlo a medida evita incorporar >150 KB de dependencias y hojas de estilo ajenas, permite un diseño 100% integrado al estilo minimalista de macOS (modo claro/oscuro) y facilita tests unitarios determinísticos sobre el posicionamiento de horarios y solapamientos.

### 2.4. Editor Markdown: CodeMirror 6 + Preview GFM en Vivo
- **Decisión**: **CodeMirror 6** (`@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`) + **`react-markdown` con `remark-gfm`** para el preview en vivo.
- **Por qué**:
  - Trabaja directamente sobre **Markdown plano estándar** en lugar de un AST JSON propietario.
  - Esto garantiza compatibilidad total en tres direcciones: escribir apuntes rápidos con atajos de teclado, guardar como nota los reportes complejos (tablas, listas, bloques de código) generados por la IA en la Fase 7, y exportar todas las notas a archivos `.md` limpios en el disco del usuario.
  - La interfaz ofrecerá 3 modos conmutables con un clic o atajo: **Editor**, **Vista Dividida (Editor + Preview en vivo)** y **Lectura (Preview)**, con guardado automático (*debounced auto-save* a los 600 ms de inactividad + indicador visual `"Guardado"`).

### 2.5. Extracción de Fuentes PDF con Número de Página
- **Decisión**: Usar **`pdfjs-dist` (Mozilla PDF.js)** para extraer el texto de archivos PDF página por página, además de lectura directa para archivos `.md`, `.txt` y texto pegado.
- **Por qué**:
  - Los crates de Rust para PDF (`pdf-extract`, `lopdf`) suelen fallar con codificaciones de fuentes en español (acentos, eñes) o pierden la separación por página.
  - `pdfjs-dist` extrae el texto estructurado página por página (`page_number = 1..N`). Al dividir el texto en chunks para indexar, cada chunk conserva su `page_number`, permitiendo que en la Fase 6 el chat cite con precisión: `[Fuente: Apunte Unidad 2.pdf, pág. 14]`.
  - Si un PDF es un escaneo puro de imágenes sin texto seleccionable, el sistema lo detecta de inmediato y avisa claramente al usuario en vez de indexar una fuente vacía.

### 2.6. Arquitectura de IA Local con Ollama (Fases 5, 6 y 7)
- **Comunicación**: Cliente HTTP local contra `http://localhost:11434` (configurable en Ajustes).
- **Modelos configurables**:
  - Descubrimiento automático de modelos instalados mediante `GET /api/tags`.
  - Configuración separada para **Modelo de Chat** (ej. `llama3.2`, `qwen2.5`, `mistral`, `gemma3`) y **Modelo de Embeddings** (ej. `nomic-embed-text`, `mxbai-embed-large`, `all-minilm`).
- **Chunking**:
  - Tamaño objetivo: ~1.800 caracteres (~450 tokens) con solapamiento de 300 caracteres, cortando preferentemente en saltos de párrafo (`\n\n`), encabezados Markdown o fin de oración, preservando `source_id` y `page_number`.
- **Chat con Citas (RAG)**:
  - Ante una pregunta del usuario en una materia, se calcula el embedding de la consulta, se recuperan los *Top-K* chunks más relevantes de las fuentes de esa materia (combinando similitud coseno + FTS5), se numeran `[1]`, `[2]`, ..., `[K]` en el prompt de sistema exigiendo que el modelo responda basándose únicamente en las fuentes y cite con `[n]`, y se transmite la respuesta en *streaming*. Cada cita `[n]` es interactiva y muestra el nombre de la fuente, la página y el fragmento exacto.
- **Reportes Largos por Partes (Map-Reduce para Contexto Limitado)**:
  - Para evitar saturar la ventana de contexto de modelos locales cuando una materia tiene múltiples apuntes o PDFs largos:
    1. **Fase Map**: Se procesa cada fuente seleccionada (o grupos de bloques de una fuente larga) pidiendo al modelo una síntesis estructurada intermedia enfocada en el tipo de reporte pedido (Resumen general, Guía de estudio o Preguntas de práctica).
    2. **Fase Reduce**: Se combinan las síntesis parciales en un documento Markdown cohesivo y bien formateado, mostrando el progreso en tiempo real al usuario (`"Procesando fuente 2 de 4..."` → `"Generando reporte final..."`) y guardándolo con un clic como Nota de la materia.

---

## 3. Modelo de Datos (SQLite)

La base de datos se inicializa con `PRAGMA foreign_keys = ON;` y `PRAGMA journal_mode = WAL;`.

### 3.1. Esquema Relacional Principal

```sql
-- 1. Materias (Concepto central)
CREATE TABLE courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,              -- 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'cyan' | 'orange' | 'slate'
    professor TEXT NOT NULL DEFAULT '',
    term TEXT NOT NULL,               -- Ej: '2026 - 2° Cuatrimestre'
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'archived'
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

-- 3. Tareas (To-do)
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date TEXT,                    -- ISO 'YYYY-MM-DD' (nullable si no tiene fecha límite)
    priority TEXT CHECK (priority IN ('low', 'medium', 'high') OR priority IS NULL),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_course ON tasks(course_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_status ON tasks(status);

-- 4. Exámenes
CREATE TABLE exams (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,              -- Ej: '1° Parcial', 'Recuperatorio', 'Final'
    category TEXT NOT NULL DEFAULT 'parcial' CHECK (category IN ('parcial', 'recuperatorio', 'final', 'tp', 'otro')),
    exam_date TEXT NOT NULL,          -- ISO 'YYYY-MM-DD'
    exam_time TEXT,                   -- Opcional 'HH:MM' para ubicarlo en el calendario horario
    location TEXT NOT NULL DEFAULT '',-- Opcional: Aula
    topics TEXT NOT NULL DEFAULT '',  -- Temas que entran en el examen
    grade REAL CHECK (grade IS NULL OR (grade >= 0 AND grade <= 10)),
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

-- Tabla FTS5 para búsqueda instantánea en Notas
CREATE VIRTUAL TABLE notes_fts USING fts5(
    note_id UNINDEXED,
    course_id UNINDEXED,
    title,
    content,
    tokenize = 'unicode61 remove_diacritics 2'
);

-- 6. Fuentes de estudio por materia (NotebookLM local)
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
    embedding BLOB,                   -- Vector Float32 serializado en little-endian
    embedding_dim INTEGER
);
CREATE INDEX idx_chunks_source ON source_chunks(source_id);
CREATE INDEX idx_chunks_course ON source_chunks(course_id);

-- Tabla FTS5 para búsqueda léxica en fragmentos de fuentes
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
    citations_json TEXT NOT NULL DEFAULT '[]', -- Array JSON con metadatos de cada cita [1], [2]...
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
├── package.json                     # Dependencias y scripts de frontend / Tauri
├── tsconfig.json                    # Configuración estricta de TypeScript
├── vite.config.ts                   # Configuración de Vite y Vitest
├── index.html                       # Entrada HTML de la ventana de Cursada
├── src/                             # Código fuente del Frontend (React + TypeScript)
│   ├── main.tsx                     # Punto de montaje de React
│   ├── App.tsx                      # Layout principal (Sidebar fija + Área de contenido)
│   ├── styles/                      # Estilos CSS nativos y tokens de diseño (Claro/Oscuro)
│   │   ├── tokens.css               # Variables de color, tipografía SF Pro, espaciados y sombras
│   │   ├── global.css               # Reset y estilos base de macOS
│   │   └── components.css           # Estilos reutilizables de botones, modales, badges y tarjetas
│   ├── types/                       # Tipos TypeScript alineados con los DTOs del backend
│   │   └── domain.ts
│   ├── lib/
│   │   ├── api/                     # Cliente tipado de comunicación con Tauri (con fallback test/mock)
│   │   ├── dates/                   # Utilidades de calendario, semanas y formato en español
│   │   └── pdf/                     # Extracción de texto de PDFs página por página (pdfjs-dist)
│   ├── components/
│   │   ├── layout/                  # Sidebar, TopBar, Modal de Ajustes / Backups
│   │   ├── courses/                 # Formulario de Materia, Selector de color, Editor de horarios
│   │   ├── calendar/                # Grilla de Horario Semanal (clases + tareas + exámenes)
│   │   ├── tasks/                   # Lista de tareas, filtros, creación rápida, badges de prioridad
│   │   ├── exams/                   # Tarjetas de exámenes, carga de temas y nota obtenida
│   │   ├── notes/                   # Editor Markdown (CodeMirror 6) + Preview en vivo
│   │   ├── sources/                 # Gestor de fuentes (PDF, MD, TXT) y estado de indexado
│   │   └── ai/                      # Chat con citas interactivas y Generador de Reportes
│   ├── pages/
│   │   ├── HomePage.tsx             # Inicio: Clases de hoy, próximas entregas, exámenes y semana
│   │   ├── CalendarPage.tsx         # Calendario semanal completo con navegación por semanas
│   │   ├── TasksPage.tsx            # Vista global de tareas con filtros por materia/estado/fecha
│   │   ├── ExamsPage.tsx            # Vista global de exámenes y calificaciones
│   │   ├── CourseDetailPage.tsx     # Vista de Materia (Resumen, Tareas, Exámenes, Notas, Fuentes, IA)
│   │   └── SettingsModal.tsx        # Configuración de Ollama, tema, backups y exportación a Markdown
│   └── __tests__/                   # Tests unitarios y de integración de UI (Vitest + RTL)
└── src-tauri/                       # Backend nativo en Rust (Tauri 2)
    ├── Cargo.toml                   # Dependencias de Rust (tauri, rusqlite, serde, reqwest, uuid, chrono)
    ├── tauri.conf.json              # Configuración del bundle macOS (com.cursada.app, productName: "Cursada")
    ├── capabilities/                # Permisos de Tauri v2
    ├── icons/                       # Íconos de la aplicación para macOS
    └── src/
        ├── main.rs                  # Punto de entrada binario
        ├── lib.rs                   # Inicialización de estado, DB, backup de arranque y registro de comandos
        ├── db/
        │   ├── mod.rs               # Conexión SQLite, WAL mode y configuración (real vs test temporal)
        │   ├── migrations.rs        # Migraciones versionadas (PRAGMA user_version)
        │   ├── courses_repo.rs      # Persistencia de materias y horarios
        │   ├── tasks_repo.rs        # Persistencia de tareas
        │   ├── exams_repo.rs        # Persistencia de exámenes
        │   ├── notes_repo.rs        # Persistencia de notas y sincronización FTS5
        │   ├── sources_repo.rs      # Persistencia de fuentes, chunks y búsqueda híbrida
        │   └── chat_repo.rs         # Persistencia de conversaciones y mensajes con citas
        ├── services/
        │   ├── backup_service.rs    # Backups automáticos (VACUUM INTO) y rotación de los últimos 15
        │   ├── export_service.rs    # Exportación completa o por materia a carpetas Markdown (.md)
        │   ├── chunking_service.rs  # División de fuentes en fragmentos con solapamiento y página
        │   ├── rag_service.rs       # Búsqueda híbrida (Coseno + FTS5) y armado de contexto citado
        │   ├── report_service.rs    # Generación Map-Reduce de resúmenes, guías y exámenes de práctica
        │   └── ollama_client.rs     # Cliente HTTP hacia localhost:11434 (/api/tags, /api/embed, /api/chat)
        └── commands/                # Handlers IPC expuestos al frontend
```

---

## 5. Seguridad de Datos, Backups y Exportación

1. **Ubicación de datos reales**:
   - Base de datos: `~/Library/Application Support/com.cursada.app/cursada.sqlite`
   - Copias de fuentes cargadas: `~/Library/Application Support/com.cursada.app/sources/<course_id>/`
   - Backups automáticos: `~/Library/Application Support/com.cursada.app/backups/`
2. **Política de Backups Automáticos**:
   - Al arrancar la app, si el último backup tiene más de 24 horas (o no existe), se genera un snapshot consistente mediante `VACUUM INTO` con nombre `cursada-backup-YYYY-MM-DD_HHMMSS.sqlite`.
   - Antes de correr cualquier migración de esquema nueva (`user_version` menor a la versión actual del código), se fuerza un backup preventivo inmediato.
   - Se mantienen los 15 backups más recientes y se limpian los más antiguos automáticamente.
   - El usuario puede disparar un backup manual en cualquier momento desde Ajustes.
3. **Exportación a Markdown**:
   - Disponible desde Ajustes (exportar todo) o desde cada Materia (exportar materia).
   - Escribe archivos `.md` puros en la carpeta que el usuario elija, incluyendo un índice de la materia (horarios, profesor, tareas, exámenes con sus notas) y una carpeta `Notas/` con cada nota y reporte generado por IA en formato Markdown estándar.
4. **Aislamiento en Tests**:
   - Todo repositorio y servicio de Rust recibe una instancia de `Database` inicializada con `Database::new_in_memory()` o en un directorio temporal `tempfile::tempdir()`. Ningún test utiliza jamás la ruta de `Application Support`.
