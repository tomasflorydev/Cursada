# Progreso del Pulido de UI — Cursada

**Fecha de actualización:** 18 de noviembre de 2026  
**Rama actual:** `pulido-ui` (creada desde el tag `v1.0-pre-pulido` en `beabe46`)  
**Último commit de código:** `2437447` — `ui(titulos): usar div en encabezado interno para mantener unico landmark banner`  
**Etapa actual:** Etapa 1 (Fase 2: Fundaciones de diseño) completada — esperando confirmación para Etapa 2 (Fase 3)  
**Estado de compilación y tests:** `npm run typecheck` OK (0 errores) · `npm test` OK (40 archivos, 182 tests en verde) · `npm run build` OK (0 errores).

---

## 1. Fases y Puntos Completados

### Fase 1 — Bugs Visuales (Código 100% completado en 7 commits atómicos)

1. **Tablas en el editor (Live Preview)** — Commit `74f7837` (`ui(editor): renderizar tablas en Live Preview`)
   - En CodeMirror 6 (`src/lib/editor/livePreviewExtension.ts`), los bloques de tabla inactivos ahora se reemplazan mediante un `TableWidget` de bloque (`<table class="cm-live-preview-table">`) con renderizado de tokens inline en celdas (`<th>`/`<td>`) y clic en fila para posicionar el cursor y editar el Markdown crudo.
   - Se evitó que el detector de matemática inline interpretara pipes con espacios (`|`) entre fórmulas como bloques `.katex-math` en fuente serif.
   - Se migraron los estilos de `.cm-live-preview-table` (`src/styles/super-editor.css`) a tokens (`--font-sans`, `--font-size-sm`, `--space-2`, `--space-3`, `--border-thin`, `--border-strong-width`, `--ink`, `--soft`, `--rule`, `--grid`, `--bg`).

2. **Títulos dentro de la nota (sin subrayado y `#` oculto fuera de línea activa)** — Commit `42db88c` (`ui(editor): quitar subrayado en títulos y ocultar numeral fuera de línea activa`)
   - Se neutralizó el `text-decoration: underline` que aplicaba `defaultHighlightStyle` de `@codemirror/language` sobre los encabezados y se quitó el `border-bottom` de `.cm-live-preview-h1`.
   - Se incorporó `editorFocusField` (`setEditorFocusEffect`) en `livePreviewExtension.ts` para que cuando el editor no tiene foco inicial al abrir una nota, ninguna línea quede marcada como activa (ocultando el `#` del primer encabezado hasta que el cursor entre realmente en esa línea).

3. **Tooltip de la barra del editor anclado al botón** — Commit `d09fffe` (`ui(editor): anclar tooltip de herramientas al botón con ajuste de bordes`)
   - Se reemplazó el atributo nativo `title` en los botones de `.super-editor-toolbar` (que en macOS/Electron aparecía desprendido en el borde superior izquierdo tapando el encabezado del panel) por un tooltip propio accesible (`role="tooltip"`, `aria-describedby`, cierre con `Escape`, persistente al pasar el puntero) dentro de `.super-editor-toolbar-item`, con cálculo de desplazamiento horizontal (`--tooltip-shift-x`) y flip inferior (`.is-flipped-below`) para no salirse nunca de la ventana.

4. **Calendario, vista semanal ("ENTREGAS")** — Commit `f632cad` (`ui(calendario): ajustar columna lateral para que Entregas no cruce la divisoria`)
   - Se definió el token `--calendar-axis-col: 88px` en `src/styles/index.css` y se aplicó a `.calendar-day-heads`, `.calendar-deliverables-band` y `.calendar-body-cols` (antes `56px`), logrando que la etiqueta `"ENTREGAS"` entre con holgura sin cruzar la línea divisoria vertical de la primera columna.

5. **Estado activo y hover consistentes en navegación superior** — Commit `c38973f` (`ui(navegacion): unificar estado activo y hover en barra superior`)
   - Se unificaron `.swiss-nav-btn` y `.swiss-header-settings-btn` para que solo el tab activo (`.is-active` / `[aria-current="page"]`) use el subrayado coral (`--acc`, `--nav-underline-thick`) con texto `--ink`, mientras que el `:hover` sobre tabs inactivos usa texto `--ink` y un subrayado fino neutro (`--rule`), evitando que un tab inactivo aparezca en coral al pasar el mouse.

6. **Corrección de textos en Inicio, Materias y Exámenes** — Commit `971fc5d` (`ui(textos): corregir textos en Inicio, Materias y Exámenes`)
   - En `CoursesPage.tsx`, se normalizó la visualización del cuatrimestre (`"2ndo Cuatrimestre"` → `"2do Cuatrimestre"`).
   - En `HomePage.tsx`, se corrigió el resumen sin pendientes a `"No tenés tareas abiertas ni informes generados todavía."` y se renombró la sección `"Informe listo"` a `"Informes"` para no contradecir el estado vacío.
   - En `ExamsPage.tsx`, se ocultó el bloque inferior `"Anteriores: 0 / Ver anteriores →"` cuando `pastExams.length === 0`.

7. **Menú nativo de macOS en español** — Commit `7b31549` (`ui(menu): traducir menú nativo de macOS al español`)
   - Se creó `electron/menu.ts` (`buildSpanishMenuTemplate` y `setupApplicationMenu`) con los menús `Cursada`, `Archivo`, `Edición`, `Ver` y `Ventana` íntegramente en español y se conectó en `electron/main.ts`.

### Fase 2 — Fundaciones de diseño (Etapa 1: 100% completada en 6 commits atómicos)

1. **Reglas horizontales y menor intensidad en modo oscuro** — Commit `bf7292a` (`ui(reglas): definir --rule-thick y --rule-thin y atenuar reglas en modo oscuro`)
   - Tokens `--rule-thick: 2px` y `--rule-thin: 1px`; `--rule-thick` aplicado únicamente bajo `.swiss-header` (con `--rule-header`) y `--rule-thin` para divisores internos, secciones, tablas, formularios y modales.
   - En oscuro se atenuaron `--rule` (`rgba(236, 236, 231, 0.22)`), `--rule-header` (`rgba(236, 236, 231, 0.55)`) y `--grid` (`rgba(236, 236, 231, 0.14)`). En claro: `--rule: rgba(17, 17, 17, 0.22)`, `--rule-header: #111111`, `--grid: rgba(17, 17, 17, 0.12)`.

2. **Botones en tres niveles (`primary`, `secondary`, `tertiary`)** — Commit `ff4f11a` (`ui(botones): implementar tres niveles de botones y unificar jerarquia en toda la app`)
   - `SwissButton` (`src/ui/Primitives.tsx`) ahora soporta `variant?: 'primary' | 'secondary' | 'tertiary'` y `size?: 'sm' | 'md'`.
   - Primario: relleno coral (`--acc`) reservado a una sola acción principal por pantalla (`+ Nueva materia`, `+ Nuevo examen`, `+ Nueva tarea`, `+ Nuevo informe`, confirmar/generar/guardar).
   - Secundario: borde fino (`var(--rule-thin) solid var(--rule)`) con hover sutil (`border-color: var(--ink)`, fondo `--grid`). Los botones por fila de `Exámenes` (`Generar guía de estudio`) pasaron todos a secundario.
   - Terciario: solo texto (`--soft`) con borde transparente y hover sutil (`--grid`), aplicado en barra del editor (`SuperMarkdownEditor`), botones secundarios de cancelar/cerrar y acciones discretas.
   - Migrados los `<button className="cursada-secondary-button">` huérfanos en `SourcePreviewDialog.tsx` a `<SwissButton>`.

3. **Widget de Enfoque (Pomodoro) compacto y coral solo en estado activo** — Commit `2d35c9a` (`ui(enfoque): compactar widget en reposo y reservar coral para estado activo`)
   - En reposo compacto (`25:00 ▶`), ocupa ~90px y deja visible `Ajustes` incluso en ventana chica (`1100×640`).
   - Se quitó el ambiguo `1/4` del header y se movió como `Bloque actual: N de M` al encabezado del popover de configuración.
   - Al hacer clic en el reloj o en `▶` (o mientras corre), despliega `ENFOQUE 25:00 | materia | Pausar/Iniciar Saltar Reiniciar Config ▾`. El color coral (`--acc`) queda reservado exclusivamente a `.pomodoro-widget.is-running`.

4. **Estructura de títulos unificada** — Commits `9c73080` y `2437447`
   - `Tareas`, `Informes` y `Ajustes` ahora comparten el encabezado a todo lo ancho (`.swiss-page-head` con título `56px`, subtítulo y acción principal) arriba de `.swiss-grid`, alineado con `Materias`, `Exámenes` y `Calendario`.
   - Uso de `<div className="swiss-page-head">` en esas tres vistas para preservar un único landmark `role="banner"` (`SwissHeader`).

5. **Inventario y consolidación de tokens y componentes** — Commit `453e4b6` (`ui(sistema): consolidar tokens, inputs, chips, tarjetas y modales duplicados`)
   - **Lo que existía**: `SwissButton` (2 niveles), `SwissLinkButton`, `SwissCheckbox`, `SwissSwitch`, `SwissSegmented`, `SwissSelect`, `SwissSectionHeader`, `SwissProgressBar`, `SwissCitationBadge`, `SwissTitleUnderline`, `SwissLoadingBar`, `SwissErrorAlert`, `SwissEmptyState`; estilos inline repetidos para avisos de estado; `SourcePreviewDialog` con `borderRadius: '0.5rem'` inline; 10+ clases legacy huérfanas en `courses-calendar.css`; bordes de `2px`/`3px` en inputs, chips y 4 modales distintos.
   - **Lo que faltaba**: nivel `tertiary` y `size="sm"` en `SwissButton`; tokens `--rule-thick`, `--rule-thin`, `--rule-header`, `--font-size-base`, `--font-size-lg`, `--font-size-xl`, `--font-size-screen`, `--space-7`, `--space-8`; componente/clase reutilizable para banners de estado (`.swiss-status-banner`); clases limpias para `SourcePreviewDialog`.
   - **Lo que se consolidó**:
     - Inputs y selects (`.swiss-input`, `.swiss-select`, `.field-*`, `.course-form-*`, `.tasks-quickadd-bar`) unificados con borde `var(--rule-thin) solid var(--rule)` y hover `--ink`.
     - Chips y segmentados (`.swiss-segmented`, `.stage-pill`, `.exam-stage-pills`, `.command-palette-filter-pill`) unificados con `var(--rule-thin) solid var(--rule)`, manteniendo inversión blanco/negro en `.is-active`.
     - Banners de estado consolidados en `.swiss-status-banner` / `.is-neutral` (`CalendarPage`, `ExamsPage`, `SettingsAiSection`, `SettingsDataSection`).
     - `SourcePreviewDialog` migrado a `.source-preview-*` / `.source-chunk-card` sin `border-radius`.
     - Eliminadas clases legacy huérfanas en `courses-calendar.css` (`.danger-button`, `.danger-outline-button`, `.ghost-action-button.is-danger`, `.course-overview-card`, `.course-status-pill`, `.course-tabs-bar`, `.course-tab-button`, `.course-schedule-card`, `.calendar-exam-card`, `.calendar-task-card`).
     - 4 modales (`.cursada-modal-dialog`, `.obsidian-import-modal`, `.simulator-modal-dialog`, `.command-palette-dialog`) unificados con `border: var(--rule-thin) solid var(--rule-header)` y backdrop `rgba(15, 20, 28, 0.5)`.

---

## 2. Estado de Etapas

- **Etapa 0 — Cierre visual de Fase 1 (COMPLETADA).**
- **Etapa 1 — Fase 2: Fundaciones de diseño (COMPLETADA, esperando confirmación):**
  - Verificación completa: `npm run typecheck` (0 errores), `npm test` (40 archivos, 182 tests en verde), `npm run build` OK.
  - Generadas 28 capturas post-Etapa 1 en oscuro y claro (`1100×640` y `1440×900`) sobre `Inicio`, `Materias`, `Tareas`, `Exámenes`, `Calendario`, `Ajustes` y `Enfoque activo`.

---

## 3. Qué falta (en orden de prioridad)

1. **Etapa 2 — Fase 3: Pantallas en paralelo (pendiente de confirmación para lanzar 3 agentes en worktrees):**
   - Agente 2A (`pulido-ui-2a`): `Materias` e `Inicio`.
   - Agente 2B (`pulido-ui-2b`): `Calendario`.
   - Agente 2C (`pulido-ui-2c`): `Vista de materia` (`CourseDetailView`, panel izquierdo, barra y columna del editor).
2. **Etapa 3 — Panel de informes IA (secuencial, tras mergear 2C).**
3. **Etapa 4 — Fase 4: Detalles finos, accesibilidad, casos extremos, íconos y auditoría final.**

---

## 4. Decisiones Tomadas y Dudas Pendientes

- **`"Programacion III"` sin tilde y `"2ndo Cuatrimestre"`:** Verifiqué todo el código fuente y ninguno de los dos textos existe como valor por defecto o de ejemplo en el repositorio; ambos provienen de los datos cargados en tu base SQLite local (`~/Library/Application Support/com.cursada.app/cursada.sqlite`). Respetando tu regla (*"si es un dato cargado por mí, no lo cambies"* y aislamiento estricto de la base real), no toqué tu base de datos SQLite y agregué normalización visual en `CoursesPage.tsx` para mostrar `"2do Cuatrimestre"` automáticamente cuando el período contiene `"2ndo"`.
- **Encabezados en el editor:** Al abrir una nota, CodeMirror posiciona el cursor en el carácter `0` aunque el editor no tenga foco; por eso el `#` de la primera línea se veía siempre. Con `editorFocusField`, el `#` permanece oculto mientras no hayas hecho clic/foco sobre esa línea en el editor.
- **Botón `Enfoque` expandido al pausar:** Cuando el usuario inicia desde `▶` o despliega el reloj y luego presiona `Pausar`, se mantiene expandido para que pueda usar `Reiniciar` o `Config ▾` sin que desaparezcan; se contrae al hacer clic fuera o presionar `Escape`.
- **Observación en ventana chica (`1100×640`) con Enfoque activo:** En reposo (`25:00 ▶`), `Ajustes` entra con holgura; si el temporizador está activo/expandido con `ENFOQUE 25:00 Pausar Saltar Reiniciar Config ▾`, el borde derecho de `Ajustes` excede ligeramente los `1100px` (~30px). Se puede ajustar el espaciado del header en Etapa 4 si querés mantenerlo visible también expandido a `1100px`.
- **Landmark `banner` único:** Las vistas `Tareas`, `Informes` y `Ajustes` usan `<div className="swiss-page-head">` para su título superior a lo ancho de modo que `SwissHeader` siga siendo el único `<header role="banner">`.

---

## 5. Cosas no verificadas o que no se reprodujeron

- **`"Programacion III"` en código fuente:** No se reprodujo en el código ni en los datos de ejemplo (`sampleData.ts` / `mockCourses.ts`), ya que es un registro de usuario en la base local.
- **Menú nativo de macOS en español:** Verificado a nivel de unidad (`buildSpanishMenuTemplate` en `src/__tests__/notificationsAndPackaging.test.ts`); la barra de menú del SO fuera de la ventana de contenido no aparece en capturas de `webContents.capturePage()`.

---

## 6. Próximo Paso

Aguardar confirmación del Product Owner sobre el cierre de **Etapa 1 (Fase 2: Fundaciones de diseño)** para lanzar en paralelo los 3 agentes de la **Etapa 2 — Fase 3: Pantallas** (`2A: Materias e Inicio`, `2B: Calendario`, `2C: Vista de materia`).
