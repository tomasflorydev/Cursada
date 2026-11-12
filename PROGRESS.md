# PROGRESS.md — Estado del Proyecto Cursada

## Estado Actual
- **Fase actual**: **Fases 1, 2, 3 y 4 completadas, integradas y verificadas en `main`**.
- **Última actualización**: 2026-11-12
- **Alineación documental**: 100% sincronizado con `ROADMAP.md`, `ARCHITECTURE.md` y `DESIGN.md`.

## Avances Completados

### Fase 1: Base del Proyecto + Materias + Horario Semanal de Clases
- [x] **Tarea 1.1 — Esqueleto de la app, base de datos SQLite y backups automáticos (Etapa 0)**:
  - Conexión SQLite con `node:sqlite` (`DatabaseSync`, `WAL`, `foreign_keys = ON`) y aislamiento estricto mediante `CURSADA_DATA_DIR` y directorios temporales en tests (`electron/db/database.ts`).
  - Migración inicial `v1` (`electron/db/migrations.ts`) con tablas `courses`, `class_schedules`, `tasks` y `app_settings`.
  - Servicio de backups automáticos con `VACUUM INTO` (`electron/services/backupService.ts`), backup al iniciar (≥ 24 h), backup pre-migración, backup automático previo al borrado de una materia y rotación de los últimos 15 backups.
  - Vista **Ajustes → Datos y Backups** (`src/pages/SettingsPage.tsx`) con botón **"Crear backup ahora"**, confirmación de fecha y ruta, y selector de apariencia (Automático / Claro / Oscuro).
- [x] **Tarea 1.2 — CRUD completo de Materias y sus horarios semanales (Etapa 1 — Agente A)**:
  - Persistencia y validaciones en `electron/db/coursesRepo.ts`, `electron/ipc/coursesHandlers.ts` y `src/lib/api/mockCourses.ts` (`name` y `term` obligatorios, 8 colores válidos, `dayOfWeek` 1..7, `startTime < endTime`).
  - Creación, edición, archivado/activación y eliminación de materias con diálogo de confirmación (`src/components/courses/DeleteCourseDialog.tsx`) que informa cuántas tareas y exámenes asociados se borrarán en cascada y ejecuta el backup automático previo.
  - Vista dedicada de Materia (`src/components/courses/CourseDetailView.tsx`) con cabecera completa, promedio calculado, horarios formateados en español y las 6 pestañas estructuradas (`Resumen`, `Tareas`, `Exámenes`, `Notas`, `Fuentes`, `Asistente IA`).
- [x] **Tarea 1.3 — Vista de Calendario (Mensual y Semanal) con horarios de clases**:
  - Utilidades de calendario mensual y semanal Lunes a Domingo en `src/lib/dates/index.ts`.
  - Vista **Mensual** por defecto y selector segmentado **`Mensual | Semanal`** en `src/pages/CalendarPage.tsx`, con bloques horarios coloreados por materia, navegación fluida (`Mes/Semana anterior`, `Hoy`, `Mes/Semana siguiente`), truncado tipográfico seguro en una línea sin desbordes (`src/styles/courses-calendar.css`) y navegación directa a la materia al hacer clic en una clase.

### Fase 2: Tareas (To-Do)
- [x] **Tarea 2.1 — Gestión de tareas por materia y vista global de Tareas (Etapa 1 — Agente B)**:
  - Persistencia y validaciones en `electron/db/tasksRepo.ts`, `electron/ipc/tasksHandlers.ts` y `src/lib/api/mockTasks.ts` (`title` obligatorio, `courseId` existente, `dueDate` ISO real, `priority` opcional, `status` en `pending | done` con actualización automática de `completed_at`).
  - Componente reutilizable `<TaskList courseId? />` (`src/components/tasks/TaskList.tsx`) funcionando tanto en la vista global (`src/pages/TasksPage.tsx`) con filtros por estado y materia como montado dentro de la pestaña **Tareas** de cada materia (`src/components/courses/CourseDetailView.tsx`).
- [x] **Tarea 2.2 — Superposición de entregas de tareas en el Calendario (Etapa 2)**:
  - Carga y superposición en `src/pages/CalendarPage.tsx` de las entregas cuya `dueDate` coincide con cada día del mes o de la semana visible, mostrando tarjetas con el color de la materia y estado (`Entrega` / `Completada`).
  - Posibilidad de marcar/desmarcar una tarea con un clic directamente desde el calendario o abrir el detalle de la entrega e ir a su materia.

### Fase 3: Exámenes + Pantalla de Inicio
- [x] **Tarea 3.1 — Gestión de Exámenes y notas obtenidas**:
  - Migración SQLite `v2` (`electron/db/migrations.ts`) creando la tabla `exams` e índices (`idx_exams_course`, `idx_exams_date`).
  - Repositorio y handlers IPC (`electron/db/examsRepo.ts`, `electron/ipc/examsHandlers.ts`, `src/lib/api/mockExams.ts`) con validaciones en escala `1..10`, categorías (`parcial | recuperatorio | final | tp`), fecha ISO `YYYY-MM-DD`, horario opcional `HH:MM`, aula/modalidad, temas y cálculo de promedio por materia.
  - Componente reutilizable `<ExamList courseId? />` (`src/components/exams/ExamList.tsx`) y vista global `src/pages/ExamsPage.tsx` con cuenta regresiva en días, carga/edición de notas, filtros (`Todos`, `Próximos`, `Rendidos`) y filtro por materia.
  - Integración en la pestaña **Exámenes** de `src/components/courses/CourseDetailView.tsx`, badge de promedio en tarjetas de `src/pages/CoursesPage.tsx` y superposición destacada de exámenes en `src/pages/CalendarPage.tsx` (tanto en vista mensual como semanal) con diálogo de detalle.
- [x] **Tarea 3.2 — Pantalla de Inicio conectada en vivo (Bento con Aire)**:
  - Conexión de `src/pages/HomePage.tsx` a `cursadaClient` (`listTasks`, `listExams`, `listCourses`) con actualización reactiva ante cambios de datos:
    1. **Tareas por vencer**: Lista en vivo de entregas pendientes con completado en 1 clic persistido en SQLite/mock.
    2. **Próximos exámenes**: Fichas en vivo ordenadas por fecha con cuenta regresiva dinámica en días, categoría, fecha/hora, temas y navegación a la materia.
    3. **Pulso de la semana**: Grilla horizontal de 7 días (Lunes a Domingo) calculada dinámicamente combinando horarios de cursada activos, entregas pendientes y exámenes de cada día.

### Fase 4: Notas por Materia + Exportación a Markdown
- [x] **Tarea 4.1 — Editor Markdown con Preview en vivo, guardado automático y vista global de Notas**:
  - Migración SQLite `v3` (`electron/db/migrations.ts`) creando `notes`, la tabla virtual FTS5 `notes_fts` (`unicode61 remove_diacritics 2`) y triggers automáticos de sincronización ante inserción, edición y borrado en cascada.
  - Repositorio parametrizado e IPC handlers (`electron/db/notesRepo.ts`, `electron/ipc/notesHandlers.ts`, `src/lib/api/mockNotes.ts`) con búsqueda sin tildes, fijado (`isPinned`) y validaciones de entrada.
  - Editor Markdown (`src/components/notes/NoteEditor.tsx`) con **CodeMirror 6**, renderizado GFM seguro (`react-markdown` + `remark-gfm`), selector de modos **Editar / Dividido / Lectura** y guardado automático con *debounce* e indicador de estado.
  - Workspace reutilizable `<NotesWorkspace courseId? />` (`src/components/notes/NotesWorkspace.tsx`) y vista global (`src/pages/NotesPage.tsx`), integrado tanto en la barra lateral (**Notas**) como en la pestaña **Notas** de cada materia (`src/components/courses/CourseDetailView.tsx`), con estilos adaptativos Claro/Oscuro (`src/styles/notes.css`).
- [x] **Tarea 4.2 — Exportación de Notas y Materias a Markdown en disco**:
  - Servicio backend (`electron/services/exportService.ts`) e IPC (`electron/ipc/exportHandlers.ts`) con selector nativo de carpeta (`dialog.showOpenDialog`), sanitización segura de nombres de archivo y soporte de tres alcances: **nota suelta** (`note`), **materia completa** (`course`: resumen + horarios + tareas + exámenes + carpeta de notas) y **toda la cursada** (`all`: `README.md` índice + subcarpetas por materia), con fallback de descarga para navegador (`src/lib/api/mockExport.ts`).
  - Componente `<ExportMarkdownButton />` (`src/components/export/ExportMarkdownButton.tsx`) integrado en **Ajustes → Exportar a Markdown** (`src/pages/SettingsPage.tsx`), en la pestaña **Resumen** de cada materia (`src/components/courses/CourseDetailView.tsx`) y en el editor de cada nota (`NoteEditor.tsx`).

## Qué sigue
- [ ] Validación manual del Product Owner sobre la **Fase 4**.
- [ ] Inicio de la **Fase 5: Fuentes + Indexado Local**.
