# PROGRESS.md — Estado del Proyecto Cursada

## Estado Actual
- **Fase actual**: **Fases 1 a 8 completadas, integradas y verificadas en `main`**.
- **Última actualización**: 2026-11-15
- **Métricas de verificación automatizada en `main`**:
  - **29 archivos de test** y **109 tests unitarios y de integración en verde** (`npm test` sobre esquema SQLite `v5`).
  - **0 errores de compilación TypeScript** en frontend y Electron (`npm run typecheck`).
  - **Build de producción y paquete nativo macOS verificados** (`npm run build` y `npm run package` generando `release/Cursada.app`).
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

### Fase 6: Chat con Citas Verificables y Prompt Personalizado
- [x] **Tarea 6.1 — Chat por materia basado en sus fuentes con citas verificables**:
  - Migración SQLite `v5` (`electron/db/migrations.ts`) creando `chat_threads`, `chat_messages` y los índices `idx_chat_threads_course` / `idx_chat_messages_thread` con eliminación en cascada, más repositorio parametrizado (`electron/db/chatRepo.ts`) con titulado automático en base a la primera consulta.
  - Cliente Ollama (`/api/chat` en `electron/services/ollamaClient.ts` y `generateEmbeddings` en `sourcesService.ts`) ejecutado estrictamente **bajo demanda** mediante `keep_alive: '0s'` para liberar memoria al finalizar sin mantener modelos residentes en segundo plano.
  - Servicio RAG (`electron/services/ragService.ts`) e IPC (`electron/ipc/chatHandlers.ts`): recuperación híbrida Coseno + FTS5, soporte de instrucciones personalizadas (`customInstructions`), citas numeradas `[1]`, `[2]`, fallback local extractivo (`local-rag-extractive`) cuando Ollama no responde y guardado como **Nota** editable con sección `## Fuentes citadas`.
  - Interfaz `<CourseChatPanel />` (`src/components/assistant/CourseChatPanel.tsx`), mock con estado en `src/lib/api/mockChat.ts`, diálogo modal nativo (`<dialog>` vía `.showModal()` y cierre limpio reseteando `returnValue`) para inspeccionar fragmento y página de cada cita, y envío seguro frente a composición IME.
  - Tests en `src/__tests__/chatAndRag.test.ts` (5 tests) y `src/__tests__/CourseChatPanel.test.tsx` (4 tests).

### Fase 7: Generador Map-Reduce de Resúmenes, Informes, Guías y Exámenes de Práctica
- [x] **Tarea 7.1 — Generador de material de estudio y reportes con prompt personalizado**:
  - Servicio Map-Reduce (`electron/services/reportService.ts`) e IPC (`electron/ipc/reportHandlers.ts`): selección por materia de fuentes `ready`, muestreo uniforme hasta 4500 caracteres por fuente en fase **Map** y síntesis final en fase **Reduce** vía `/api/chat` con `keep_alive: '0s'`.
  - Soporte de cuatro formatos (**Resumen**, **Informe**, **Guía de estudio**, **Examen de práctica** con formato elegible **Desarrollo / Multiple Choice / Mixto** y clave de corrección al final), aplicación prioritaria de `customInstructions` en Map y Reduce, fallback local determinístico (`local-map-reduce-fallback`) y guardado automático opcional en **Notas** de la materia (`ai_summary`, `ai_study_guide`, `ai_practice_exam`).
  - Interfaz `<CourseReportGenerator />` (`src/components/assistant/CourseReportGenerator.tsx`), mock en `src/lib/api/mockReports.ts`, `<fieldset>`/`<legend>` accesibles, barra `<progress>` indeterminada, vista previa GFM con badges Map-Reduce y exportación `.md`.
  - Workspace unificado `<CourseAssistantWorkspace />` (`src/components/assistant/CourseAssistantWorkspace.tsx`, `src/styles/assistant.css`) integrado en la pestaña **Asistente IA** de `src/components/courses/CourseDetailView.tsx`.
  - Tests en `src/__tests__/reportService.test.ts` (5 tests), `src/__tests__/CourseReportGenerator.test.tsx` (4 tests) y `src/__tests__/Phase6And7Integration.test.tsx`.
- [x] **Ajuste post-Fase 7 — Ollama en vivo en modo web y apertura automática en `dev`**:
  - Helper compartido `tryBrowserOllamaChatCompletion` en `src/lib/api/mockOllama.ts` conectado desde `src/lib/api/mockChat.ts` y `src/lib/api/mockReports.ts` (`POST /api/chat` con `stream: false` y `keep_alive: '0s'`), manteniendo fallback determinístico en Vitest o si Ollama no responde.
  - Script `"dev"` en `package.json` actualizado a `vite --port 5173 --open`.

### Fase 8: Pulido, Atajos, Notificaciones y Empaquetado `.app`
- [x] **Tarea 8.1 — Atajos de teclado de macOS y paleta de búsqueda rápida (`Cmd+K`) (Etapa 1 — Agente A)**:
  - Motor de búsqueda y normalización sin tildes (`src/lib/shortcuts/commandPaletteSearch.ts`) con ranking multi-token sobre materias, notas, tareas, exámenes y acciones rápidas, más resolución de atajos (`Cmd+K`, `Cmd+1..5`, `Cmd+,`, `Cmd+N`).
  - Paleta accesible `<CommandPalette />` (`src/components/command-palette/CommandPalette.tsx`, `src/styles/command-palette.css`) con filtros por tipo, navegación por teclado (`ArrowUp`/`ArrowDown`/`Enter`/`Escape`), acceso desde `Sidebar.tsx` y salto profundo en `App.tsx` hacia `CoursesPage`, `CourseDetailView` y `NotesWorkspace` (seleccionando pestaña y nota exacta o disparando creación contextual).
  - Tests en `src/__tests__/commandPaletteAndShortcuts.test.tsx` (9 tests).
- [x] **Tarea 8.2 — Notificaciones nativas de macOS y empaquetado final `Cursada.app` (Etapa 1 — Agente B)**:
  - Preferencias persistidas en `app_settings` (`electron/db/notificationSettingsRepo.ts`) con validaciones de rango para anticipación de clases (`5..180` min) y exámenes (`1..30` días).
  - Motor de evaluación de recordatorios (`electron/services/notificationService.ts`) e IPC (`electron/ipc/notificationHandlers.ts`) para clases próximas, entregas de hoy y exámenes cercanos con deduplicación por sesión, planificador cada 5 minutos en `electron/main.ts`, fallback completo en `src/lib/api/mockNotifications.ts` y panel `<NotificationSettingsSection />` (`src/components/settings/NotificationSettingsSection.tsx`) integrado en `src/pages/SettingsPage.tsx`.
  - Ícono vectorial y rasterizado de macOS (`build/icon.svg`, `build/icon.png`, `build/icon.icns`) y empaquetador ESM (`scripts/package-macos-app.mjs`, comando `npm run package`) generando `release/Cursada.app` con `Info.plist` actualizado (`com.cursada.app`) y firma ad-hoc.
  - Tests en `src/__tests__/notificationsAndPackaging.test.ts` (5 tests), `src/__tests__/NotificationSettingsUI.test.tsx` (2 tests) y `src/__tests__/Phase8Integration.test.tsx` (3 tests).

## Qué sigue
- [ ] Validación manual del Product Owner sobre las **Fases 6, 7 y 8** (incluyendo prueba de `release/Cursada.app` en `/Applications`).
