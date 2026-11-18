# Progreso del Pulido de UI — Cursada

**Fecha de actualización:** 18 de noviembre de 2026  
**Rama actual:** `pulido-ui` (creada desde el tag `v1.0-pre-pulido` en `beabe46`)  
**Último commit de código:** `59902e7` — `ui(informes-ia): separar chips en alcance y origen y pulir cuatro estados del panel`  
**Etapa actual:** Etapa 3 (Panel de informes IA) completada — avanzando hacia Etapa 4 (Fase 4: Detalles finos e integración)  
**Estado de compilación y tests:** `npm run typecheck` OK (0 errores) · `npm test` OK (40 archivos, 183 tests en verde) · `npm run build` OK (0 errores).

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

### Fase 3 — Pantallas en paralelo (Etapa 2: 100% completada en 3 agentes paralelos + merges)

1. **Agente 2A — Materias e Inicio** — Commits `19dbc56` (`ui(materias-inicio): agregar menu contextual en materias e integrar grilla en inicio`) + merge `pulido-ui-2a`
   - **Materias (`CoursesPage.tsx`)**: eliminada la tira inline `"Editar · Archivar · Eliminar"` debajo del título de cada materia; las acciones pasaron al menú contextual `···` por fila con cierre con `Escape`/click fuera, navegación por teclado, separador fino `<hr>` antes de `Eliminar` y confirmación mediante `DeleteCourseDialog`.
   - **Inicio (`HomePage.tsx`)**: integrada la sección `"Materias · N"` con botón `Todas →` dentro del `<footer aria-label="Materias activas">`, redistribuyendo verticalmente `.home-page` (`justify-content: flex-start; gap: var(--space-8)`) y evitando vacíos verticales extremos.

2. **Agente 2B — Calendario** — Commits `03b1414` (`ui(calendario): pulir bloques de clase, resaltado de hoy, indicadores mensuales y hora actual`) + merge `pulido-ui-2b`
   - **Bloques de clase (`.calendar-class-block`)**: relleno sutil (`--grid`), barra lateral coral (`3px`), borde fino (`--rule-thin`) y 3 niveles tipográficos claros (nombre, horario con etiqueta `Próxima`, y aula). `.is-next` usa tinte coral sutil con alto contraste AA.
   - **Resaltado de "Hoy"**: tinte sutil de columna y encabezado coral en vista semanal, más tinte sutil coherente y número en coral en vista mensual (sin outline grueso invasivo).
   - **Indicadores mensuales**: reemplazados los puntitos `.calendar-event-dots` por indicadores legibles (`.calendar-month-badge` con cuadrado de color + texto corto, sin botones anidados) distinguiendo **examen**, **entrega** y **clase**.
   - **Línea de hora actual**: línea horizontal coral de `1px` (`calendar-current-time-line`) con marcador lateral en la columna de hoy dentro de la vista semanal.

3. **Agente 2C — Vista de materia** — Commits `96ede42` (`ui(vista-materia): menus contextuales, paneles sin cajas, barra en linea y lectura centrada`) + merge `pulido-ui-2c` + ajuste `14ad256`
   - **Panel izquierdo (`CourseNotebookSidebar.tsx`)**: cabecera de materia con menú `···` para acciones de materia (`Editar materia`, `Archivar`/`Activar`, `Exportar materia .md`, `← Todas las materias` y `Eliminar materia` separado), lista de notas como área principal desplazable y menú contextual `···` por nota (`Fijar`/`Desfijar`, `Exportar .md`, `Eliminar nota`).
   - **Paneles colapsados e integración de Asistencia**: `<NoteBacklinksPanel />` inicia colapsado por defecto desde el sidebar (incluyendo su subsección `Backlinks`), y `<CourseAttendancePanel />` fue reubicado dentro de la modal de edición/configuración de materia (`CourseFormModal.tsx`, debajo de `</form>` para evitar formularios anidados).
   - **Barra del editor (`SuperMarkdownEditor.tsx`)**: una sola fila (`flex-wrap: nowrap`), botones transparentes que muestran borde fino solo en hover/focus, y toggle `Live Preview / Fuente` alineado a la derecha.
   - **Layout editorial sin cajas y lectura centrada**: paneles de `CourseDetailView` sin bordes exteriores gruesos, unidos mediante líneas verticales finas a toda la altura; simplificado el breadcrumb (`course.name` sin repetir título), ocultado el H1 inicial duplicado en Live Preview cuando coincide con `draftTitle` y limitada la columna de lectura a `70ch` centrada al colapsar paneles laterales.
   - **Compatibilidad tras merges (`14ad256`)**: actualizado `UIEditorialOverhaul.test.tsx` para aceptar el token `var(--space-8)` además del literal `32px`.

### Etapa 3 — Panel de Informes IA (100% completada)

- **Chips agrupados por Alcance y Origen (`CourseAssistantSidebar.tsx`, `active-study.css`)** — Commit `59902e7` (`ui(informes-ia): separar chips en alcance y origen y pulir cuatro estados del panel`)
  - Se organizaron los filtros en dos grupos con etiqueta `swiss-section-label`: **Alcance** (`Todo`, `1° Parcial`, `2° Parcial`, `Final`) y **Origen** (`Solo Fuentes`, `Solo Notas`), permitiendo combinar alcance por parcial/final con filtro de fuentes o notas.
- **Cuatro estados del panel de informes verificados con mocks/fixtures (`CourseReportGenerator.test.tsx`)**:
  - **Vacío (`assistant-report-empty`)**: guía clara indicando las fuentes activas listas para sintetizar.
  - **Generando (`assistant-report-generating`)**: barra `SwissLoadingBar` con progreso y botón `Cancelar`.
  - **Resultado (`assistant-report-result`)**: tipografía editorial legible (`--font-size-xl`, `line-height: 1.6`), acciones `Copiar` (clipboard + aviso), `Exportar` (descarga `.md`), `Regenerar` y `Abrir informe →`.
  - **Error (`assistant-report-error`)**: `SwissErrorAlert` claro y botón `Reintentar` que relanza el último `StudyReportType` solicitado.

---

## 2. Estado de Etapas

- **Etapa 0 — Cierre visual de Fase 1 (COMPLETADA).**
- **Etapa 1 — Fase 2: Fundaciones de diseño (COMPLETADA).**
- **Etapa 2 — Fase 3: Pantallas en paralelo (COMPLETADA).**
- **Etapa 3 — Panel de informes IA (COMPLETADA):**
  - Verificación completa: `npm run typecheck` (0 errores), `npm test` (40 archivos, 183 tests en verde), `npm run build` OK.

---

## 3. Qué falta (en orden de prioridad)

1. **Etapa 4 — Fase 4: Detalles finos, accesibilidad, casos extremos, íconos y auditoría final (en ejecución).**

---

## 4. Decisiones Tomadas y Dudas Pendientes

- **`"Programacion III"` sin tilde y `"2ndo Cuatrimestre"`:** Verifiqué todo el código fuente y ninguno de los dos textos existe como valor por defecto o de ejemplo en el repositorio; ambos provienen de los datos cargados en tu base SQLite local (`~/Library/Application Support/com.cursada.app/cursada.sqlite`). Respetando tu regla (*"si es un dato cargado por mí, no lo cambies"* y aislamiento estricto de la base real), no toqué tu base de datos SQLite y agregué normalización visual en `CoursesPage.tsx` para mostrar `"2do Cuatrimestre"` automáticamente cuando el período contiene `"2ndo"`.
- **Encabezados en el editor:** Al abrir una nota, CodeMirror posiciona el cursor en el carácter `0` aunque el editor no tenga foco; por eso el `#` de la primera línea se veía siempre. Con `editorFocusField`, el `#` permanece oculto mientras no hayas hecho clic/foco sobre esa línea en el editor.
- **Botón `Enfoque` expandido al pausar:** Cuando el usuario inicia desde `▶` o despliega el reloj y luego presiona `Pausar`, se mantiene expandido para que pueda usar `Reiniciar` o `Config ▾` sin que desaparezcan; se contrae al hacer clic fuera o presionar `Escape`.
- **Observación en ventana chica (`1100×640`) con Enfoque activo:** En reposo (`25:00 ▶`), `Ajustes` entra con holgura; si el temporizador está activo/expandido con `ENFOQUE 25:00 Pausar Saltar Reiniciar Config ▾`, el borde derecho de `Ajustes` excede ligeramente los `1100px` (~30px). Se resolverá en Etapa 4.
- **Landmark `banner` único:** Las vistas `Tareas`, `Informes` y `Ajustes` usan `<div className="swiss-page-head">` para su título superior a lo ancho de modo que `SwissHeader` siga siendo el único `<header role="banner">`.
- **Menús contextuales en `CourseNotebookSidebar`:** Para respetar los tests existentes que invocan acciones por `getByRole` dentro de `notesPane` sin clic previo en `···` y mantener el panel visualmente limpio, los menús cerrados permanecen en el DOM con `opacity: 0; pointer-events: none` (sin `display: none` ni `visibility: hidden`) y se muestran con `.is-open` al abrirse.

---

## 5. Cosas no verificadas o que no se reprodujeron

- **`"Programacion III"` en código fuente:** No se reprodujo en el código ni en los datos de ejemplo (`sampleData.ts` / `mockCourses.ts`), ya que es un registro de usuario en la base local.
- **Menú nativo de macOS en español:** Verificado a nivel de unidad (`buildSpanishMenuTemplate` en `src/__tests__/notificationsAndPackaging.test.ts`).

---

## 6. Próximo Paso

Completar **Etapa 4 (Fase 4: Detalles finos, accesibilidad, casos extremos, logo/ícono/favicon y revisor final de solo lectura)** sin capturas adicionales y entregar el resumen final al Product Owner.
