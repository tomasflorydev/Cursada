# ROADMAP_V2.md — Guía Técnica y de Versionado (Ciclo 2: `v1.1.0` a `v2.4.0`)

> **Nota**: El plan de tareas detallado con criterios de aceptación ya fue integrado como hoja de ruta oficial en [`ROADMAP.md`](./ROADMAP.md) (Fases 9 a 14). Este documento funciona como referencia rápida de arquitectura, factibilidad y estrategia de versiones para el Ciclo 2.

---

## 1. Esquema de Versionado (`SemVer`)

Cada etapa incrementa la versión en `package.json` y genera un hito claro en `PROGRESS.md` y Git:

1. **`v1.0.0` (Actual — Fases 1 a 8)**: MVP completo y verificado.
2. **`v1.1.0` (Fase 9 — UI Declutter & Anotadores)**:
   - Limpieza de subtítulos y textos sobre-explicativos generados por IA en Calendario, Tareas, Exámenes, Anotadores y Ajustes.
   - Cambio de `"Materias"` por **"Anotadores"** en toda la UI y campos universitarios opcionales para uso general/personal.
   - Fecha real en Inicio y restauración de backups en 1 clic.
3. **`v2.0.0` (Fase 10 — Overhaul Total de UI)**:
   - Cambio de versión mayor (`MAJOR` a `2.0.0`) con la nueva dirección visual definida por el Product Owner.
   - Se aplica sobre la app ya limpia (`v1.1.0`) y **antes** de crear las vistas nuevas (`v2.1+`) para evitar diseñar dos veces.
4. **`v2.1.0` (Fase 11 — Super-Editor Markdown & Matemática)**:
   - Soporte matemático offline con **KaTeX** (`$...$` y `$$...$$`).
   - **Live Preview en tiempo real** sobre CodeMirror 6 (los headings `#`, negritas, callouts, tablas y fórmulas se ven formateados mientras escribís, mostrando el Markdown crudo solo en la línea del cursor).
   - **Atajos de teclado configurables** en Ajustes para insertar tablas, callouts, bloques matemáticos, código y enlaces.
5. **`v2.2.0` (Fase 12 — Red de Conocimiento & Obsidian)**:
   - Enlaces bidireccionales **`[[WikiLinks]]`** con autocompletado y panel de **Backlinks** (migración SQLite `v6` con tabla `note_links`).
   - **Vista de Grafo interactiva** (`<NotesGraphView />`) local y global con física de fuerzas.
   - **Importador de Vaults de Obsidian** (hacia anotadores activos o directamente a la sección **Archivo**).
6. **`v2.3.0` (Fase 13 — Estudio Activo, Contexto IA por Parcial & Seguimiento)**:
   - **Pomodoro Timer configurable** persistente en el shell con notificaciones nativas de macOS.
   - **Notas como Fuentes para la IA + Selector de Fuentes/Notas + Filtro por Parcial (`1° Parcial` / `2° Parcial` / `Final`)** tanto en el Chat RAG como en el Generador de Material.
   - **Modo Simulacro Interactivo** para rendir exámenes de práctica en pantalla con corrección automática y citas.
   - **Control de Asistencia** opcional por anotador (migración SQLite `v7`).
7. **`v2.4.0` (Fase 14 — Google Calendar Sync)**:
   - Exportación/suscripción iCal (`.ics`) sin fricción + conector OAuth2 local bidireccional con Google Calendar API.
