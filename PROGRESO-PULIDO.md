# Progreso del Pulido de UI — Cursada

**Fecha de actualización:** 18 de noviembre de 2026  
**Rama actual:** `pulido-ui` (creada desde el tag `v1.0-pre-pulido` en `beabe46`)  
**Último commit de código:** `7b31549` — `ui(menu): traducir menú nativo de macOS al español`  
**Etapa actual:** Etapa 0 (Cierre visual de Fase 1) completada — esperando confirmación para Etapa 1 (Fase 2)  
**Estado de compilación y tests:** `npm run typecheck` OK (0 errores) · `npm test` OK (40 archivos, 182 tests en verde) · `npm run build` OK (0 warnings).

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

---

## 2. Estado de Etapas

- **Etapa 0 — Cierre visual de Fase 1 (COMPLETADA):**
  - Verificación completa en `pulido-ui`: `npm run typecheck` (0 errores), `npm test` (40 archivos, 182 tests en verde) y `npm run build` OK.
  - Generadas las 48 capturas comparativas **antes (`v1.0-pre-pulido`) vs. después (`pulido-ui`)** en modo oscuro y claro, y en ventana chica (`1100×640`) y maximizada (`1440×900`) sobre `Inicio`, `Materias`, `Exámenes`, `Calendario` y `Materia / Editor` (encabezados, tooltip de barra y tabla en Live Preview), sin tocar la base SQLite real del usuario.
  - Observación visual menor registrada en la captura de tabla (`1440×900`, 3 paneles abiertos): la primera columna de tablas de 4 columnas puede envolver una palabra larga (`Concepto`) por el ancho acotado del panel central antes de Etapa 2C (donde se amplía el área de lectura y se quitan cajas gruesas).

---

## 3. Qué falta (en orden de prioridad)

1. **Etapa 1 — Fase 2: Fundaciones de diseño (pendiente de confirmación para iniciar):**
   - 2.1 Reglas horizontales (`--rule-thick` bajo header, `--rule-thin` para el resto) y menor intensidad del blanco en modo oscuro.
   - 2.2 Tres niveles de botones (`Primario`, `Secundario` con borde fino, `Terciario` solo texto con hover sutil) unificados en toda la app.
   - 2.3 Compactar el widget de Enfoque (Pomodoro) en reposo (`25:00 ▶`), desplegando controles al hacer click o mientras corre, aclarando/quitando `1/4` y reservando coral para el estado activo.
   - 2.4 Estructura de títulos unificada (`Tareas` alineada con `Materias`, `Exámenes` y `Calendario`).
   - 2.5 Inventario y consolidación de tokens y componentes duplicados (`botones`, `inputs`, `tarjetas`, `chips`, `modales`).
2. **Etapa 2 — Fase 3: Pantallas en paralelo (`Materias e Inicio`, `Calendario`, `Vista de materia`).**
3. **Etapa 3 — Panel de informes IA.**
4. **Etapa 4 — Fase 4: Detalles finos, accesibilidad, casos extremos, íconos y auditoría final.**

---

## 4. Decisiones Tomadas y Dudas Pendientes

- **`"Programacion III"` sin tilde y `"2ndo Cuatrimestre"`:** Verifiqué todo el código fuente y ninguno de los dos textos existe como valor por defecto o de ejemplo en el repositorio; ambos provienen de los datos cargados en tu base SQLite local (`~/Library/Application Support/com.cursada.app/cursada.sqlite`). Respetando tu regla (*"si es un dato cargado por mí, no lo cambies"* y aislamiento estricto de la base real), no toqué tu base de datos SQLite y agregué normalización visual en `CoursesPage.tsx` para mostrar `"2do Cuatrimestre"` automáticamente cuando el período contiene `"2ndo"`.
- **Encabezados en el editor:** Al abrir una nota, CodeMirror posiciona el cursor en el carácter `0` aunque el editor no tenga foco; por eso el `#` de la primera línea se veía siempre. Con `editorFocusField`, el `#` permanece oculto mientras no hayas hecho clic/foco sobre esa línea en el editor.
- **Sin dudas bloqueantes para Fase 1.**

---

## 5. Cosas no verificadas o que no se reprodujeron

- **`"Programacion III"` en código fuente:** No se reprodujo en el código ni en los datos de ejemplo (`sampleData.ts` / `mockCourses.ts`), ya que es un registro de usuario en la base local.
- **Menú nativo de macOS en español:** Verificado a nivel de unidad (`buildSpanishMenuTemplate` en `src/__tests__/notificationsAndPackaging.test.ts`); la barra de menú del SO fuera de la ventana de contenido no aparece en capturas de `webContents.capturePage()`.
- **Capturas comparativas de Fase 1:** Completadas las 48 capturas (`before` vs `after`, oscuro/claro, `1100×640` y `1440×900`) sobre todas las vistas modificadas.

---

## 6. Próximo Paso

Aguardar confirmación del Product Owner sobre el cierre de **Etapa 0 (Fase 1)** para iniciar **Etapa 1 — Fase 2: Fundaciones de diseño** (en modo secuencial, tocando tokens y componentes compartidos).
