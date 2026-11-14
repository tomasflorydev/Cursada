# PROGRESS.md — Estado del Proyecto Cursada

## Estado Actual
- **Fase actual**: **Fases 1 a 5 completadas en `main`; Fases 6 y 7 en curso (Etapa 0 completada en `main`, Etapa 1 en ramas de subagentes)**.
- **Última actualización**: 2026-11-14
- **Métricas de verificación automatizada en `main`**:
  - **20 archivos de test** y **71 tests unitarios y de integración en verde** (`npm test` sobre esquema SQLite `v5`).
  - **0 errores de compilación TypeScript** en frontend y Electron (`npm run typecheck`).
  - **Build de producción verificado** (`npm run build` previo al inicio de Etapa 0 de Fases 6 y 7).
- **Alineación documental**: 100% sincronizado con `ROADMAP.md`, `ARCHITECTURE.md` y `DESIGN.md`.

## Avances Completados

### Fase 1: Base del Proyecto + Materias + Horario Semanal de Clases
- [x] **Tarea 1.1 — Esqueleto de la app, base de datos SQLite y backups automáticos (Etapa 0)**:
  - Conexión SQLite con `node:sqlite` (`DatabaseSync`, `WAL`, `foreign_keys = ON`) y aislamiento estricto mediante `CURSADA_DATA_DIR` y directorios temporales en tests (`electron/db/database.ts`).
  - Migración inicial `v1` (`electron/db/migrations.ts`) con tablas `courses`, `class_schedules`, `tasks` y `app_settings`.
  - Servicio de backups automáticos con `VACUUM INTO` (`electron/services/backupService.ts`), backup al iniciar (≥ 24 h), backup pre-migración, backup automático previo al borrado de una materia y rotación de los últimos 15 backups.
  - Vista **Ajustes → Datos y Backups** (`src/pages/SettingsPage.tsx`) con botón **"Crear backup ahora"**, confirmación de fecha y ruta, y selector de apariencia (Automático / Claro / Oscuro).
  - Tests en `src/__tests__/stage0-db-backups.test.ts` y `src/__tests__/App.test.tsx`.
- [x] **Tarea 1.2 — CRUD completo de Materias y sus horarios semanales (Etapa 1 — Agente A)**:
  - Persistencia y validaciones en `electron/db/coursesRepo.ts`, `electron/ipc/coursesHandlers.ts` y `src/lib/api/mockCourses.ts` (`name` y `term` obligatorios, 8 colores válidos, `dayOfWeek` 1..7, `startTime < endTime`).
  - Creación, edición, archivado/activación y eliminación de materias con diálogo de confirmación (`src/components/courses/DeleteCourseDialog.tsx`) que informa cuántas tareas, exámenes y notas asociados se borrarán en cascada y ejecuta el backup automático previo.
  - Vista dedicada de Materia (`src/components/courses/CourseDetailView.tsx`) con cabecera completa, promedio calculado, horarios formateados en español y las 6 pestañas estructuradas (`Resumen`, `Tareas`, `Exámenes`, `Notas`, `Fuentes`, `Asistente IA`).
  - Tests en `src/__tests__/coursesRepo.test.ts` y `src/__tests__/CoursesAndCalendar.test.tsx`.
- [x] **Tarea 1.3 — Vista de Calendario (Mensual y Semanal) con horarios de clases**:
  - Utilidades de calendario mensual y semanal Lunes a Domingo en `src/lib/dates/index.ts`.
  - Vista **Mensual** por defecto y selector segmentado **`Mensual | Semanal`** en `src/pages/CalendarPage.tsx`, con bloques horarios coloreados por materia, navegación fluida (`Mes/Semana anterior`, `Hoy`, `Mes/Semana siguiente`), truncado tipográfico seguro en una línea sin desbordes (`src/styles/courses-calendar.css`) y navegación directa a la materia al hacer clic en una clase.
  - Tests en `src/__tests__/dates.test.ts` y `src/__tests__/CoursesAndCalendar.test.tsx`.

### Fase 2: Tareas (To-Do)
- [x] **Tarea 2.1 — Gestión de tareas por materia y vista global de Tareas (Etapa 1 — Agente B)**:
  - Persistencia y validaciones en `electron/db/tasksRepo.ts`, `electron/ipc/tasksHandlers.ts` y `src/lib/api/mockTasks.ts` (`title` obligatorio, `courseId` existente, `dueDate` ISO real, `priority` opcional, `status` en `pending | done` con actualización automática de `completed_at`).
  - Componente reutilizable `<TaskList courseId? />` (`src/components/tasks/TaskList.tsx`) funcionando tanto en la vista global (`src/pages/TasksPage.tsx`) con filtros por estado y materia como montado dentro de la pestaña **Tareas** de cada materia (`src/components/courses/CourseDetailView.tsx`).
  - Tests en `src/__tests__/tasksRepo.test.ts` y `src/__tests__/TasksPage.test.tsx`.
- [x] **Tarea 2.2 — Superposición de entregas de tareas en el Calendario (Etapa 2)**:
  - Carga y superposición en `src/pages/CalendarPage.tsx` de las entregas cuya `dueDate` coincide con cada día del mes o de la semana visible, mostrando tarjetas con el color de la materia y estado (`Entrega` / `Completada`).
  - Posibilidad de marcar/desmarcar una tarea con un clic directamente desde el calendario o abrir el detalle de la entrega e ir a su materia.
  - Tests en `src/__tests__/Stage2Integration.test.tsx`.

### Fase 3: Exámenes + Pantalla de Inicio
- [x] **Tarea 3.1 — Gestión de Exámenes y notas obtenidas**:
  - Migración SQLite `v2` (`electron/db/migrations.ts`) creando la tabla `exams` e índices (`idx_exams_course`, `idx_exams_date`).
  - Repositorio y handlers IPC (`electron/db/examsRepo.ts`, `electron/ipc/examsHandlers.ts`, `src/lib/api/mockExams.ts`) con validaciones en escala `1..10`, categorías (`parcial | recuperatorio | final | tp`), fecha ISO `YYYY-MM-DD`, horario opcional `HH:MM`, aula/modalidad, temas y cálculo de promedio por materia.
  - Componente reutilizable `<ExamList courseId? />` (`src/components/exams/ExamList.tsx`) y vista global `src/pages/ExamsPage.tsx` con cuenta regresiva en días, carga/edición de notas, filtros (`Todos`, `Próximos`, `Rendidos`) y filtro por materia.
  - Integración en la pestaña **Exámenes** de `src/components/courses/CourseDetailView.tsx`, badge de promedio en tarjetas de `src/pages/CoursesPage.tsx` y superposición destacada de exámenes en `src/pages/CalendarPage.tsx` (tanto en vista mensual como semanal) con diálogo de detalle.
  - Tests en `src/__tests__/examsRepo.test.ts` y `src/__tests__/Phase3ExamsAndHome.test.tsx`.
- [x] **Tarea 3.2 — Pantalla de Inicio conectada en vivo (Bento con Aire)**:
  - Conexión de `src/pages/HomePage.tsx` a `cursadaClient` (`listTasks`, `listExams`, `listCourses`) con actualización reactiva ante cambios de datos:
    1. **Tareas por vencer**: Lista en vivo de entregas pendientes con completado en 1 clic persistido en SQLite/mock.
    2. **Próximos exámenes**: Fichas en vivo ordenadas por fecha con cuenta regresiva dinámica en días, categoría, fecha/hora, temas y navegación a la materia.
    3. **Pulso de la semana**: Grilla horizontal de 7 días (Lunes a Domingo) calculada dinámicamente combinando horarios de cursada activos, entregas pendientes y exámenes de cada día.
  - Tests en `src/__tests__/Phase3ExamsAndHome.test.tsx`.

### Fase 4: Notas por Materia + Exportación a Markdown
- [x] **Tarea 4.1 — Editor Markdown con Preview en vivo, guardado automático y notas por materia**:
  - Migración SQLite `v3` (`electron/db/migrations.ts`) creando `notes`, la tabla virtual FTS5 `notes_fts` (`unicode61 remove_diacritics 2`) y triggers automáticos de sincronización ante inserción, edición y borrado en cascada.
  - Repositorio parametrizado e IPC handlers (`electron/db/notesRepo.ts`, `electron/ipc/notesHandlers.ts`, `src/lib/api/mockNotes.ts`) con búsqueda sin tildes, fijado (`isPinned`) y validaciones de entrada.
  - Editor Markdown (`src/components/notes/NoteEditor.tsx`) con **CodeMirror 6**, renderizado GFM seguro (`react-markdown` + `remark-gfm`), selector simplificado de modos **Editar / Lectura** (sin vista dividida, commit `a1a7fc1`) y guardado automático con *debounce* e indicador de estado.
  - Workspace `<NotesWorkspace courseId />` (`src/components/notes/NotesWorkspace.tsx`) con vista de nota a ancho completo y botón **"Ver lista" / "Ocultar lista"** (`a1a7fc1`), integrado exclusivamente dentro de la pestaña **Notas** de cada materia (`src/components/courses/CourseDetailView.tsx`) tras eliminar la sección global de Notas de la barra lateral (commit `edde0ce`), con estilos adaptativos Claro/Oscuro (`src/styles/notes.css`).
  - Tests en `src/__tests__/notesRepo.test.ts`, `src/__tests__/NotesWorkspace.test.tsx` y `src/__tests__/Phase4Integration.test.tsx`.
- [x] **Tarea 4.2 — Exportación de Notas y Materias a Markdown en disco**:
  - Servicio backend (`electron/services/exportService.ts`) e IPC (`electron/ipc/exportHandlers.ts`) con selector nativo de carpeta (`dialog.showOpenDialog`), sanitización segura de nombres de archivo y soporte de tres alcances: **nota suelta** (`note`), **materia completa** (`course`: resumen + horarios + tareas + exámenes + carpeta de notas) y **toda la cursada** (`all`: `README.md` índice + subcarpetas por materia), con fallback de descarga para navegador (`src/lib/api/mockExport.ts`).
  - Componente `<ExportMarkdownButton />` (`src/components/export/ExportMarkdownButton.tsx`) integrado en **Ajustes → Exportar a Markdown** (`src/pages/SettingsPage.tsx`), en la pestaña **Resumen** de cada materia (`src/components/courses/CourseDetailView.tsx`) y en el editor de cada nota (`NoteEditor.tsx`).
  - Tests en `src/__tests__/exportService.test.ts`, `src/__tests__/ExportMarkdownUI.test.tsx` y `src/__tests__/Phase4Integration.test.tsx`.

### Fase 5: Fuentes + Indexado Local
- [x] **Tarea 5.1 — Conexión con Ollama y configuración de modelos locales**:
  - Persistencia parametrizada de configuración de IA (`baseUrl`, `chatModel`, `embeddingModel`) en `app_settings` (`electron/db/aiSettingsRepo.ts`) con normalización y validación de URL HTTP/HTTPS.
  - Cliente local Ollama (`electron/services/ollamaClient.ts`) con `checkOllamaHealth` (`/api/tags` y `/api/version` con `AbortController`, devolviendo mensajes claros en español si Ollama está apagado sin lanzar excepciones) y `generateEmbeddings` (`/api/embed` con fallback local determinístico `local-hash-v1`).
  - Handlers IPC (`electron/ipc/ollamaHandlers.ts`), mock completo (`src/lib/api/mockOllama.ts`) y panel **Inteligencia Artificial (Ollama)** (`src/components/settings/OllamaSettingsSection.tsx`) montado en `src/pages/SettingsPage.tsx`, con detección de estado, guía en español para iniciar Ollama y selección/edición manual de modelos.
  - Tests en `src/__tests__/ollamaAndAiSettings.test.ts` y `src/__tests__/OllamaSettingsUI.test.tsx`.
- [x] **Tarea 5.2 — Carga de fuentes (PDF, Markdown, TXT, texto pegado) e indexado local**:
  - Migración SQLite `v4` (`electron/db/migrations.ts`) creando `sources`, `source_chunks` (con embeddings `BLOB` en `Float32Array`) y `source_chunks_fts` (`unicode61 remove_diacritics 2`) con triggers automáticos de sincronización, más actualización de impacto de borrado de materias (`sourcesCount`) en `coursesRepo.ts` y `DeleteCourseDialog.tsx`.
  - Extractor puro de texto PDF página por página (`src/lib/pdf/index.ts`), servicio de extracción y chunking con solapamiento y preservación de número de página (`electron/services/chunkingService.ts`), repositorio con serialización binaria y búsqueda híbrida Coseno + FTS5 RRF (`electron/db/sourcesRepo.ts`), servicio conectado a Ollama (`electron/services/sourcesService.ts`, `createOllamaSourceEmbedder`) y handlers IPC (`electron/ipc/sourcesHandlers.ts`).
  - Workspace `<SourcesWorkspace />` (`src/components/sources/SourcesWorkspace.tsx`, `src/styles/sources.css`) montado en la pestaña **Fuentes** de `src/components/courses/CourseDetailView.tsx`, con subida de archivos (`.pdf`, `.md`, `.txt`), modal para pegar texto directo, barra `<progress>` de indexación, buscador híbrido de fragmentos, reindexado, previsualización por páginas/fragmentos y eliminación en cascada, con fallback en `src/lib/api/mockSources.ts`.
  - Tests en `src/__tests__/sourcesRepoAndChunking.test.ts`, `src/__tests__/SourcesWorkspace.test.tsx` y `src/__tests__/Phase5Integration.test.tsx`.

## Qué sigue
- [ ] Retomar Fases 6 y 7: mergear ramas de Etapa 1, completar Etapa 2 (integración) y Etapa 3 (revisión con Argon).
- [ ] Validación manual del Product Owner sobre las **Fases 6 y 7**.
- [ ] Inicio de la **Fase 8: Cierre de Cuatrimestre, Empaquetado y Pulido**.

## Checkpoint Actual — Fases 6 y 7 (Para retomar)

### 1. Completado y commiteado en `main` (`9ddfdb0`) — Etapa 0
- **Contratos TypeScript (Fase 6 y Fase 7)** en `src/types/domain.ts` y `electron/types.ts`: tipos de hilos/mensajes/citas RAG (`ChatCitation`, `ChatThread`, `ChatMessage`, `SendChatMessageInput`, `SaveChatMessageAsNoteInput`) y de generación Map-Reduce (`StudyReportType`, `PracticeExamFormat`, `StudyReportStepInfo`, `GenerateStudyReportInput`, `GenerateStudyReportResult`), más firmas en `CursadaIpcApi`.
- **Migración SQLite `v5`** (`electron/db/migrations.ts`): tablas `chat_threads` y `chat_messages` con índices `idx_chat_threads_course` e `idx_chat_messages_thread`, verificadas en `src/__tests__/stage0-db-backups.test.ts`.
- **Cliente Ollama bajo demanda** (`electron/services/ollamaClient.ts` y `electron/services/sourcesService.ts`): `generateChatCompletion` (`/api/chat`) y `generateEmbeddings` (`/api/embed`) con `keep_alive: '0s'` para que Ollama descargue el modelo inmediatamente después de generar y no permanezca activo en segundo plano.
- **Puente IPC y cliente frontend**: canales expuestos en `electron/preload.ts`, métodos en `src/lib/api/client.ts` y cableado inicial en `src/lib/api/mockClient.ts` (junto con stubs en `src/lib/api/mockChat.ts` y `src/lib/api/mockReports.ts`).

### 2. En progreso / ramas de Etapa 1 (Hydrogen en paralelo)
> Nota: No se deben eliminar estas ramas ni sus worktrees antes de integrar su trabajo en `main`.
- **Agente A (Fase 6 — Chat RAG con Citas)**: rama `subagent-Agent-A---Phase-6-RAG-Chat---Citations-self-7d18fe0e`
  - Archivos asignados: `electron/db/chatRepo.ts`, `electron/services/ragService.ts`, `electron/ipc/chatHandlers.ts`, `src/lib/api/mockChat.ts`, `src/components/assistant/CourseChatPanel.tsx`, `src/__tests__/chatAndRag.test.ts`, `src/__tests__/CourseChatPanel.test.tsx`.
- **Agente B (Fase 7 — Generador Map-Reduce con Prompt Personalizado)**: rama `subagent-Agent-B---Phase-7-Map-Reduce-Reports-self-6d03b1e2`
  - Archivos asignados: `electron/services/reportService.ts`, `electron/ipc/reportHandlers.ts`, `src/lib/api/mockReports.ts`, `src/components/assistant/CourseReportGenerator.tsx`, `src/__tests__/reportService.test.ts`, `src/__tests__/CourseReportGenerator.test.tsx`.

### 3. Pasos exactos para retomar en la próxima sesión
1. Verificar el estado y los commits de las ramas `subagent-Agent-A---Phase-6-RAG-Chat---Citations-self-7d18fe0e` y `subagent-Agent-B---Phase-7-Map-Reduce-Reports-self-6d03b1e2` y hacer merge en `main`.
2. Ejecutar **Etapa 2 (Integración)**: registrar `registerChatHandlers` y `registerReportHandlers` en `electron/ipc/handlers.ts`, crear `src/components/assistant/CourseAssistantWorkspace.tsx` y `src/styles/assistant.css`, conectar la pestaña `Asistente IA` en `src/components/courses/CourseDetailView.tsx` y crear `src/__tests__/Phase6And7Integration.test.tsx`.
3. Ejecutar **Etapa 3 (Revisión con Argon)**: correr `npm run typecheck`, `npm test` y `npm run build`, actualizar documentación final (`PROGRESS.md`, `ROADMAP.md`, `ARCHITECTURE.md`) y entregar el resumen final junto con la checklist de validación manual.
