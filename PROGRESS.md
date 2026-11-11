# PROGRESS.md — Estado del Proyecto Cursada

## Estado Actual
- **Fase actual**: **Fase 1 y Fase 2 en ejecución** — **Etapa 0 (Base + Tarea 1.1)** completada, verificada y commiteada en `main`. Listo para lanzar **Etapa 1** (Agente A y Agente B en paralelo).
- **Última actualización**: 2026-11-11
- **Alineación documental**: 100% sincronizado con `ROADMAP.md`, `ARCHITECTURE.md` y `DESIGN.md`.

## Avances Completados

### Etapa 0 — Base y Tarea 1.1 (Completada)
- [x] **Tarea 1.1**:
  - Conexión SQLite con `node:sqlite` (`DatabaseSync`, `WAL`, `foreign_keys = ON`) y aislamiento estricto mediante `CURSADA_DATA_DIR` y directorios temporales en tests (`electron/db/database.ts`).
  - Migración inicial `v1` (`electron/db/migrations.ts`) con tablas `courses`, `class_schedules`, `tasks` y `app_settings`.
  - Servicio de backups automáticos con `VACUUM INTO` (`electron/services/backupService.ts`), backup al iniciar (≥ 24 h), backup pre-migración, backup automático previo al borrado de una materia y rotación de los últimos 15 backups.
  - Vista **Ajustes → Datos y Backups** (`src/pages/SettingsPage.tsx`) con botón **"Crear backup ahora"**, confirmación de fecha y ruta, y selector de tema (Automático / Claro / Oscuro).
- [x] **Infraestructura para trabajo paralelo (Etapa 1)**:
  - Contrato compartido en `src/types/domain.ts` y `electron/types.ts` (incluyendo `CourseDeleteImpact` con conteo de tareas afectadas).
  - Handlers IPC separados por dominio (`electron/ipc/systemHandlers.ts`, `electron/ipc/coursesHandlers.ts`, `electron/ipc/tasksHandlers.ts`) registrados desde `electron/ipc/handlers.ts`.
  - Cliente tipado congelado (`src/lib/api/client.ts` y `src/lib/api/mockClient.ts`) con mocks divididos por dominio en `src/lib/api/mockCourses.ts` (Agente A) y `src/lib/api/mockTasks.ts` (Agente B).
  - Barra lateral (`src/components/Sidebar.tsx`) y `src/App.tsx` conectados a `listCourses()` y `listTasks()`, con contrato de navegación `onSelectCourse(courseId)` ya enrutado hacia `CoursesPage`, `CalendarPage` y `TasksPage`.

## Qué sigue
- [ ] **Etapa 1 (Paralelo en git worktrees)**:
  - **Agente A (`feat/courses-calendar`)**: Tarea 1.2 (CRUD completo de Materias y horarios semanales, archivado, confirmación de borrado con cantidad de tareas afectadas y vista detalle de materia) y Tarea 1.3 (Calendario semanal de Lunes a Domingo con navegación entre semanas y clic en bloque de clase para ir a la materia).
  - **Agente B (`feat/tasks`)**: Tarea 2.1 (CRUD de tareas por materia, componente reutilizable `<TaskList courseId? />` y vista global de Tareas con filtros por estado y materia).
- [ ] **Etapa 2 (Integración secuencial)**:
  - Merge de `feat/courses-calendar` y `feat/tasks` en `main`, montaje de `<TaskList courseId={course.id} />` en la pestaña Tareas de cada materia y Tarea 2.2 (superposición de entregas en el Calendario semanal).
