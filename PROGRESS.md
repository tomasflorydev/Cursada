# PROGRESS.md — Estado del Proyecto Cursada

## Estado Actual
- **Versión actual**: **`v2.4.0` (Ciclo 2 — Fases 11 a 14 completadas e integradas en `main`)**.
- **Próximo hito planificado**: **Validación manual en macOS (checklists Fases 11–14)**, reconstrucción opcional del paquete `release/Cursada.app` (`npm run package`) y configuración opcional de credenciales OAuth2 Desktop de Google Calendar si se usa sincronización bidireccional en la nube.
- **Última actualización**: 2026-11-16
- **Métricas de verificación automatizada en `main`**:
  - **35 archivos de test** y **155 tests unitarios y de integración en verde** (`npm test` sobre esquema SQLite `v8`).
  - **0 errores de compilación TypeScript** en frontend y Electron (`npm run typecheck`).
  - **Build de producción compilado sin errores** (`npm run build`).
- **Alineación documental**: Sincronizado con `ROADMAP.md` (`v2.4.0`, Fases 10–14 marcadas como completadas), `ARCHITECTURE.md` (esquema `v8` y módulos Ciclo 2) y `DESIGN.md` (`v2.0`).

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
- [x] **Ajustes post-Fase 8 — Runtime nativo `node:sqlite` en Electron y arranque del `.app` empaquetado**:
  - Actualización de `electron` a `44.11.0` (Node.js `24.22.2` embebido) en `package.json` y `package-lock.json` (`5cc9887`) para contar con `node:sqlite` (`DatabaseSync`) dentro del proceso principal empaquetado.
  - Detección explícita de ejecución empaquetada en `electron/main.ts` (`app.isPackaged`, ruta `Contents/Resources/app` o ausencia de `src/`) para cargar `dist/index.html` sin depender de Vite (`localhost:5173`), más listeners de diagnóstico (`preload-error`, `did-fail-load`) y verificación por smoke test directo sobre `release/Cursada.app` (`dec38fc`).

### Fase 9 (`v1.1.0`): Limpieza de UI ("De-AI-fication"), Renombrado a Anotadores y Pulido Base
- [x] **Tarea 9.1 — Limpieza general de textos innecesarios y elementos sobre-explicativos**:
  - Eliminación de `.page-subtitle`, supratítulos redundantes y textos sobre-explicativos en `CalendarPage.tsx`, `TasksPage.tsx`, `TaskList.tsx`, `ExamsPage.tsx`, `ExamList.tsx`, `CoursesPage.tsx`, `NotesPage.tsx`, `NotesWorkspace.tsx`, `SourcesWorkspace.tsx`, `CourseAssistantWorkspace.tsx`, `CourseChatPanel.tsx`, `CourseReportGenerator.tsx`, `SettingsPage.tsx`, `OllamaSettingsSection.tsx`, `NotificationSettingsSection.tsx`, `HomePage.tsx` y `Sidebar.tsx`.
  - Eliminación del texto duplicado de horario (`.course-schedule-formatted`) en tarjetas de `CourseDetailView.tsx`.
- [x] **Tarea 9.2 — Renombrado de `"Materias"` a `"Anotadores"` y soporte para uso no universitario**:
  - Reemplazo integral de etiquetas de UI en navegación (`Sidebar.tsx`, `App.tsx`), vistas (`CoursesPage.tsx`, `CourseDetailView.tsx`, `CourseFormModal.tsx`, `DeleteCourseDialog.tsx`), filtros/formularios (`TaskList.tsx`, `ExamList.tsx`, `NotesWorkspace.tsx`), exportación (`ExportMarkdownButton.tsx`, `exportService.ts`, `mockExport.ts`) y búsqueda (`CommandPalette.tsx`, `commandPaletteSearch.ts`).
  - Flexibilización de `term`, `professor` y `schedules` como opcionales en `coursesRepo.ts`, `mockCourses.ts` y `CourseFormModal.tsx`, ocultando metadatos y paneles vacíos en `CoursesPage.tsx` y `CourseDetailView.tsx` cuando no aplican.
- [x] **Tarea 9.3 — Fecha actual real en Inicio y Restauración de Backups desde Ajustes**:
  - Actualización de `HomePage.tsx` para usar `new Date()` por defecto (manteniendo `referenceDate` opcional para tests) y eliminación del pill estático de semana.
  - Restauración de backups en 1 clic (`restoreBackup` en `electron/services/backupService.ts`, canal `system:restoreBackup` en `electron/ipc/systemHandlers.ts`, `preload.ts`, `client.ts` y `mockClient.ts`) con validación de nombre/integridad, backup preventivo `pre-restore` previo y recarga transaccional parametrizada de todas las tablas incluyendo FTS5.
  - Apertura de carpeta de datos en Finder (`openDataDir` / `system:openDataDir`) y confirmación inline en `SettingsPage.tsx`.
  - Tests nuevos en `src/__tests__/Phase9AnotadoresAndBackups.test.tsx` y suite completa actualizada (30 archivos, 114 tests en verde).

### Fase 10 (`v2.0.0`): Overhaul Total de la Interfaz Gráfica (Estilo Tipográfico Suizo)
- [x] **Tarea 10.1 — Tokens CSS, Tipografía offline `Archivo` y `DESIGN.md` (`v2.0`)**:
  - Instalación de `@fontsource/archivo` (`400`, `500`, `600`, `800`) en `src/main.tsx` y carga anti-FOUC en `index.html` con tema **Oscuro** predeterminado (`#1E2023`, `#FF5F52`), tema **Claro** (`#F4F4F2`, `#C8201A`) y **Sistema** (`prefers-color-scheme`).
  - Reescritura integral de `src/styles/index.css` y saneamiento de las 7 hojas secundarias eliminando todo `border-radius` distinto de `0`, `box-shadow`, gradientes y colores duros.
- [x] **Tarea 10.2 — Primitivos compartidos (`src/ui/`), `reportsStore.ts`, Shell y Atajos**:
  - Creación de `src/ui/SwissHeader.tsx`, `src/ui/Primitives.tsx` y `src/ui/index.ts` (reglas `3px`/`1px`, bordes `2px`, botones, casillas `18px`, interruptores `46×24px`, segmentados, barras de progreso y carga `3px` sin spinners).
  - Creación de `src/lib/reportsStore.ts` conectado a `cursadaClient` (síntesis con citas `[N]`, respaldo directo sobre notas locales cuando no hay PDFs, guardado como nota, exportación PDF por impresión y reset en `mockClient.ts`).
  - Actualización de `src/App.tsx`, `src/types/`, `electron/main.ts` (`minWidth: 1100`), `CommandPalette.tsx` y `commandPaletteSearch.ts` (`⌘1`–`⌘6`, `⌘,`, `⌘N`, `⌘K`).
- [x] **Tarea 10.3 — Reescritura de las 8 vistas Suizas y tests integrales**:
  - Migración completa de `HomePage.tsx` (Inicio), `CoursesPage.tsx` (Materias), `CourseDetailView.tsx` (cuaderno de 3 paneles con Notas / Editor / Informe con IA), `CourseFormModal.tsx`, `DeleteCourseDialog.tsx`, `ReportsPage.tsx` (Informes + citas cruzadas), `CalendarPage.tsx` (Semana / Mes con próxima clase en `--acc`), `TasksPage.tsx` (alta rápida + `Ver` / `Por materia`), `ExamsPage.tsx` (countdown + progreso de temas + guía) y `SettingsPage.tsx` (General, IA local, Apariencia, Datos y Atajos).
  - Actualización de los 13 tests de UI afectados y creación de `src/__tests__/Phase10SwissDesignOverhaul.test.tsx` (31 archivos / 119 tests en verde).

### Fase 11 (`v2.1.0`): Super-Editor Markdown (Live Preview, Matemática y Atajos Configurables)
- [x] **Tarea 11.1 — Soporte Matemático ($\LaTeX$ / KaTeX) offline en Notas, Chat y Reportes**:
  - Motor offline propio sin dependencias externas ni CDN en `src/lib/math/latexRenderer.tsx` (`renderTextWithMathAndCitations`), integrado en el editor/lectura de notas, respuestas de chat y informes de estudio (`CourseDetailView.tsx`, `ReportsPage.tsx`).
- [x] **Tarea 11.2 — Editor Markdown con Formato en Tiempo Real ("Live Preview" en CodeMirror 6)**:
  - Extensión de vista en vivo (`src/lib/editor/livePreviewExtension.ts`) y componente `<SuperMarkdownEditor />` (`src/components/notes/SuperMarkdownEditor.tsx`, `src/styles/super-editor.css`) con ocultamiento de marcadores Markdown fuera de la línea del cursor, callouts, tablas, fórmulas y autocompletado `[[`.
- [x] **Tarea 11.3 — Atajos de Teclado Configurables para Edición Markdown**:
  - Registro de acciones y detección de colisiones (`src/lib/editor/editorShortcuts.ts`) + panel `<EditorShortcutsSettingsSection />` (`src/components/settings/EditorShortcutsSettingsSection.tsx`) montado en `src/pages/SettingsPage.tsx` (`#settings-shortcuts`).
  - Tests nuevos en `src/__tests__/Phase11SuperEditorAndMath.test.tsx` (14 tests).

### Fase 12 (`v2.2.0`): Red de Conocimiento (WikiLinks, Grafo y Obsidian Vault)
- [x] **Tarea 12.1 — Enlaces Bidireccionales entre Notas (`[[WikiLinks]]`), Forward Links y Backlinks**:
  - Migración SQLite `v6` (`electron/db/migrations.ts`: columna `notes.frontmatter_json` y tabla `note_links`), parser puro (`src/lib/knowledge/wikiLinksParser.ts`), repositorio (`electron/db/knowledgeRepo.ts`), IPC (`electron/ipc/knowledgeHandlers.ts`), sincronización al crear/actualizar notas (`electron/ipc/notesHandlers.ts`), mock (`src/lib/api/mockKnowledge.ts`) y panel `<NoteBacklinksPanel />` (`src/components/notes/NoteBacklinksPanel.tsx`).
- [x] **Tarea 12.2 — Vista de Grafo Interactiva estilo Obsidian (`<NotesGraphView />`)**:
  - Grafo 2D basado en simulación de fuerzas en `<canvas>` (`src/components/notes/NotesGraphView.tsx`, `src/styles/knowledge.css`), con alcance por materia en `CourseDetailView.tsx` y **Grafo global** (incluyendo filtro de archivados) en `CoursesPage.tsx`.
- [x] **Tarea 12.3 — Importador de Vaults desde Obsidian**:
  - Servicio backend (`electron/services/obsidianImportService.ts`) con escaneo recursivo, parsing YAML frontmatter, exclusión de `.obsidian`/`.trash`, importación como activos o archivados y resolución automática de `[[WikiLinks]]`, junto al modal `<ObsidianImportModal />` (`src/components/courses/ObsidianImportModal.tsx`) accesible desde `CoursesPage.tsx` y `SettingsPage.tsx`.
  - Tests nuevos en `src/__tests__/Phase12KnowledgeAndObsidian.test.tsx` (8 tests).

### Fase 13 (`v2.3.0`): Estudio Activo, Contexto IA por Parcial y Seguimiento
- [x] **Tarea 13.1 — Pomodoro Timer Configurable**:
  - Store persistente (`src/lib/pomodoro/pomodoroStore.ts`) y widget `<PomodoroHeaderWidget />` (`src/components/pomodoro/PomodoroHeaderWidget.tsx`) integrado en `SwissHeader.tsx` y `App.tsx` manteniendo estado entre vistas.
- [x] **Tarea 13.2 — Notas como Fuentes para la IA, Selector de Fuentes/Notas y Filtro por Parcial**:
  - Migración SQLite `v7` añadiendo `exam_stage` (`parcial_1 | parcial_2 | final | general`) en `notes` y `sources`; actualización de `notesRepo.ts`, `sourcesRepo.ts`, `sourcesHandlers.ts`, `sourcesService.ts`, `ragService.ts`, `reportService.ts` y mocks (`mockNotes.ts`, `mockSources.ts`, `mockChat.ts`, `mockReports.ts`) más selector unificado y filtros rápidos (`Todo`, `1° Parcial`, `2° Parcial`, `Final`, `Solo Fuentes`, `Solo Notas`, `Elegir`) en `CourseDetailView.tsx`.
- [x] **Tarea 13.3 — Modo Simulacro Interactivo para Exámenes de Práctica**:
  - Parser/evaluador (`src/lib/simulator/practiceExamSimulator.ts`) y modal `<PracticeExamSimulatorModal />` (`src/components/assistant/PracticeExamSimulatorModal.tsx`, `src/styles/active-study.css`) accesible desde `CourseDetailView.tsx` y `ReportsPage.tsx` (`Iniciar simulacro`).
- [x] **Tarea 13.4 — Control de Asistencia por Anotador**:
  - Columnas `attendance_enabled` y `max_absences` en `courses` + tabla `attendance_records` (`v7`), `electron/db/attendanceRepo.ts`, `electron/ipc/attendanceHandlers.ts`, `src/lib/api/mockAttendance.ts` y panel `<CourseAttendancePanel />` (`src/components/courses/CourseAttendancePanel.tsx`) integrado en `CourseDetailView.tsx`.
  - Tests nuevos en `src/__tests__/Phase13ActiveStudyAndSimulator.test.tsx` (8 tests).

### Fase 14 (`v2.4.0`): Sincronización con Google Calendar
- [x] **Tarea 14.1 — Exportación `.ics` y Suscripción por URL iCal**:
  - Generador y parser puro `.ics` (`src/lib/calendar/icsParserAndBuilder.ts`), persistencia en SQLite `v8` (`calendar_feeds`, `electron/db/calendarSyncRepo.ts`), servicio/IPC (`electron/services/calendarSyncService.ts`, `electron/ipc/calendarSyncHandlers.ts`), mock (`src/lib/api/mockCalendarSync.ts`), exportación `.ics` y superposición de eventos externos en `CalendarPage.tsx`.
- [x] **Tarea 14.2 — Sincronización Bidireccional con Google Calendar API (OAuth2 PKCE Local)**:
  - Flujo OAuth2 PKCE loopback y mapeo local en `google_calendar_mappings` (`calendarSyncService.ts`, `calendarSyncRepo.ts`) + panel `<CalendarSyncSettingsSection />` (`src/components/settings/CalendarSyncSettingsSection.tsx`, `src/styles/calendar-sync.css`) integrado en `SettingsPage.tsx` (`#settings-data`).
  - Tests nuevos en `src/__tests__/Phase14GoogleCalendarSync.test.tsx` (6 tests).

## Qué sigue (Verificación Manual y Cierre de Ciclo 2)
- [x] **Fase 9 (`v1.1.0`) — Limpieza de UI ("De-AI-fication"), Renombrado a Anotadores y Pulido Base**.
- [x] **Fase 10 (`v2.0.0`) — Overhaul Total de la Interfaz Gráfica (Estilo Tipográfico Suizo)**.
- [x] **Fase 11 (`v2.1.0`) — Super-Editor Markdown (Live Preview en tiempo real, Matemática KaTeX y Atajos Configurables)**.
- [x] **Fase 12 (`v2.2.0`) — Red de Conocimiento (`[[WikiLinks]]`, Backlinks, Vista de Grafo e Importador de Vault de Obsidian)**.
- [x] **Fase 13 (`v2.3.0`) — Estudio Activo, Contexto IA por Parcial y Seguimiento (Pomodoro Timer, Notas como Fuentes + Selector/Filtro `1°/2° Parcial`, Modo Simulacro Interactivo y Control de Asistencia)**.
- [x] **Fase 14 (`v2.4.0`) — Sincronización con Google Calendar (iCal `.ics` + OAuth2 local)**.
- [ ] **Pendientes post-implementación**: Checklist manual en Electron (`npm run dev` / `Cursada.app`), empaquetado `.app` actualizado (`npm run package`) y carga opcional de credenciales OAuth2 Desktop para Google Calendar.
