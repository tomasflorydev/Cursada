# ROADMAP.md — Plan de Desarrollo y Versionado de Cursada

Este documento guía el desarrollo paso a paso de **Cursada**. Cada etapa está asociada a una versión semántica (`SemVer`: `vMAJOR.MINOR.PATCH`) y dividida en tareas pequeñas y verificables con criterios de aceptación redactados desde la perspectiva del usuario.

---

## Mapa de Versiones (`SemVer`)

| Versión | Etapa | Estado | Resumen del Alcance |
| :--- | :--- | :---: | :--- |
| **`v1.0.0`** | **Fases 1 a 8 (MVP Base)** | Completada | Estructura base macOS, SQLite + Backups, Materias, Calendario, Tareas, Exámenes, Notas GFM, Exportación `.md`, Fuentes PDF + Ollama, Chat RAG con citas, Reportes Map-Reduce, `Cmd+K`, Notificaciones y `.app`. |
| **`v1.1.0`** | **Fase 9: Limpieza de UI, Renombrado a Anotadores y Pulido Base** | Completada | Eliminación de subtítulos y textos sobre-explicativos de IA, cambio de `"Materias"` por `"Anotadores"` (apto uso general y universitario), fecha real en Inicio y restauración de backups en 1 clic. |
| **`v2.0.0`** | **Fase 10: Overhaul Total de la Interfaz Gráfica** | Pendiente | Nueva dirección visual completa (tokens, tipografía, layout del shell, navegación y rediseño de todas las vistas existentes antes de sumar pantallas nuevas). |
| **`v2.1.0`** | **Fase 11: Super-Editor Markdown (Live Preview, Matemática y Atajos)** | Pendiente | Formato en vivo mientras escribís (CodeMirror 6 Live Preview sin mostrar `#` o `**` salvo en la línea activa), soporte matemático $\LaTeX$ (KaTeX) y atajos configurables (tablas, callouts, bloques). |
| **`v2.2.0`** | **Fase 12: Red de Conocimiento (WikiLinks, Grafo y Obsidian Vault)** | Pendiente | Enlaces entre notas `[[WikiLinks]]` (forward/backlinks), Vista de Grafo interactiva estilo Obsidian e importación de Vaults de Obsidian (activos o al Archivo). |
| **`v2.3.0`** | **Fase 13: Estudio Activo e IA Contextual (Pomodoro, Notas/Fuentes por Parcial, Simulacro y Asistencia)** | Pendiente | Pomodoro Timer configurable, Notas como fuentes para la IA + selector de fuentes/notas con filtro `1° Parcial / 2° Parcial`, Modo Simulacro Interactivo y Control de Asistencia. |
| **`v2.4.0`** | **Fase 14: Sincronización con Google Calendar** | Pendiente | Suscripción/exportación iCal (`.ics`) y sincronización bidireccional OAuth2 con Google Calendar. |

---

# CICLO 1 (`v1.0.0`) — MVP Base (Completado y Verificado)

## Fase 1: Base del Proyecto + Materias + Horario Semanal de Clases (Completada — `v1.0.0`)
- **Tarea 1.1**: [x] Esqueleto de la app, base de datos SQLite y backups automáticos.
- **Tarea 1.2**: [x] CRUD completo de Materias y sus horarios semanales.
- **Tarea 1.3**: [x] Vista de Calendario (Mensual y Semanal) con horarios de clases.

## Fase 2: Tareas (To-Do) (Completada — `v1.0.0`)
- **Tarea 2.1**: [x] Gestión de tareas por materia y vista global de Tareas.
- **Tarea 2.2**: [x] Superposición de entregas de tareas en el Calendario (Mensual y Semanal).

## Fase 3: Exámenes + Pantalla de Inicio (Completada — `v1.0.0`)
- **Tarea 3.1**: [x] Gestión de Exámenes y notas obtenidas.
- **Tarea 3.2**: [x] Pantalla de Inicio (Conexión de datos en vivo).

## Fase 4: Notas por Materia + Exportación a Markdown (Completada — `v1.0.0`)
- **Tarea 4.1**: [x] Editor Markdown con Preview en vivo, guardado automático y notas por materia.
- **Tarea 4.2**: [x] Exportación de Notas y Materias a Markdown en disco.

## Fase 5: Fuentes + Indexado Local (Completada — `v1.0.0`)
- **Tarea 5.1**: [x] Conexión con Ollama y configuración de modelos locales.
- **Tarea 5.2**: [x] Carga de fuentes (PDF, Markdown, TXT, texto pegado) e indexado local.

## Fase 6: Chat con Citas (Completada — `v1.0.0`)
- **Tarea 6.1**: [x] Chat por materia basado en sus fuentes con citas verificables.

## Fase 7: Reportes y Material de Estudio con IA (Completada — `v1.0.0`)
- **Tarea 7.1**: [x] Generador Map-Reduce de resúmenes, informes, guías de estudio y exámenes de práctica.

## Fase 8: Pulido, Atajos, Notificaciones y Empaquetado `.app` (Completada — `v1.0.0`)
- **Tarea 8.1**: [x] Atajos de teclado de macOS y paleta de búsqueda rápida (`Cmd+K`).
- **Tarea 8.2**: [x] Notificaciones nativas de macOS y empaquetado final `Cursada.app`.

---

# CICLO 2 (`v1.1.0` → `v2.4.0`) — Rediseño Visual y Evolución Funcional

## Fase 9 (`v1.1.0`): Limpieza de UI ("De-AI-fication"), Renombrado a Anotadores y Pulido Base (Completada — `v1.1.0`)

> **Objetivo de la versión**: Despojar la interfaz de todo texto redundante o sobre-explicativo dejado en el MVP, adaptar el lenguaje a **"Anotadores"** para que sirva tanto para la facultad como para proyectos o apuntes personales, y cerrar deudas funcionales base antes del Overhaul Visual.

### Tarea 9.1: [x] Limpieza general de textos innecesarios y elementos sobre-explicativos
- **Qué incluye**:
  - Eliminación del subtítulo descriptivo (`.page-subtitle` y supratítulos redundantes) en las áreas de **Calendario**, **Tareas**, **Exámenes**, **Anotadores** y **Ajustes**.
  - Eliminación de párrafos explicativos obvios (`.settings-description`, introducciones largas en **Fuentes**, **Asistente IA**, cabeceras de paneles y estados vacíos verbosos).
  - Limpieza de metadatos duplicados en tarjetas (por ejemplo, evitar repetir el horario en dos formatos distintos dentro de la misma tarjeta de horario).
- **Criterios de aceptación (como usuario)**:
  - Al navegar por **Calendario**, **Tareas**, **Exámenes**, **Anotadores** y **Ajustes**, veo cabeceras limpias y directas sin subtítulos explicándome qué hace cada pantalla.
  - Los paneles internos van directo a la acción y a los datos, sin párrafos de relleno generados por IA.

### Tarea 9.2: [x] Renombrado de `"Materias"` a `"Anotadores"` y soporte para uso no universitario
- **Qué incluye**:
  - Reemplazo en toda la UI de la etiqueta `"Materias"` / `"Materia"` por **"Anotadores"** / **"Anotador"** (barra lateral, títulos de sección, botones de creación/edición/borrado, filtros en Tareas y Exámenes, buscador `Cmd+K` y exportación).
  - Flexibilización de los campos universitarios (`Profesor / Cátedra`, `Cuatrimestre / Período`, `Horarios`): pasan a ser opcionales al crear un Anotador y, si se dejan vacíos (ej. un anotador para un proyecto personal, idioma o libro), la interfaz oculta esos metadatos en lugar de mostrar `"Profesor sin asignar"` o paneles vacíos.
- **Criterios de aceptación (como usuario)**:
  - Veo **"Anotadores"** en la navegación, en `Cmd+K` y en todos los botones y filtros de la aplicación.
  - Puedo crear un Anotador para un tema no universitario sin cargar profesor ni horarios, y su vista se muestra limpia sin carteles de `"Profesor sin asignar"`.

### Tarea 9.3: [x] Fecha actual real en Inicio y Restauración de Backups desde Ajustes
- **Qué incluye**:
  - Actualización de `HomePage` para usar por defecto la fecha real del sistema (`new Date()`) en lugar de una fecha fija de prueba, manteniendo inyección opcional de `referenceDate` únicamente para tests determinísticos.
  - Incorporación en **Ajustes → Datos y Backups** de la acción **"Restaurar"** junto a cada backup listado (con confirmación de seguridad y backup preventivo del estado actual antes de restaurar) y botón para abrir la carpeta de datos en Finder.
- **Criterios de aceptación (como usuario)**:
  - Al abrir **Inicio**, veo la fecha real del día de hoy y el pulso de mi semana actual.
  - Desde **Ajustes**, puedo restaurar cualquiera de mis backups anteriores con un clic y ver mis datos actualizados de inmediato.

---

## Fase 10 (`v2.0.0`): Overhaul Total de la Interfaz Gráfica (Estilo Tipográfico Suizo) — ✅ Completada

> **Objetivo de la versión**: Implementar la identidad visual Tipográfica Internacional ("Suiza") sobre la estructura ya limpia (`v1.1.0`), sin bordes redondeados, sombras ni gradientes, con tema oscuro grafito (`#1E2023`) y acento coral (`#FF5F52`) como predeterminado, y tipografía `Archivo` 100% empaquetada offline.

### Tarea 10.1: [x] Definición de `DESIGN.md` (`v2.0`) y nuevo sistema de Tokens CSS
- **Qué incluye**:
  - Instalación offline de `@fontsource/archivo` (`400`, `500`, `600`, `800`) en `src/main.tsx` y `index.html` con prevención anti-FOUC.
  - Actualización de `DESIGN.md` y reescritura completa de tokens (`--bg`, `--ink`, `--soft`, `--mut`, `--rule`, `--grid`, `--acc`, `--on-acc`) para temas **Oscuro** (default), **Claro** y **Sistema**, además de escala tipográfica, grilla de 12 columnas y limpieza de las 7 hojas secundarias de `src/styles/` (`border-radius: 0`, `box-shadow: none`, cero gradientes).
- **Criterios de aceptación (como usuario)**:
  - La aplicación refleja de punta a punta la estética Tipográfica Internacional, con tema oscuro por defecto y cambio inmediato a Claro/Sistema desde Ajustes.

### Tarea 10.2: [x] Rediseño del Shell Principal, Ventana macOS, Primitivos (`src/ui/`) y `reportsStore.ts`
- **Qué incluye**:
  - Creación de primitivos compartidos en `src/ui/` (`SwissHeader.tsx`, `Primitives.tsx`, `index.ts`) y store reactivo de informes/citas (`src/lib/reportsStore.ts`).
  - Reestructuración de `App.tsx`, `commandPaletteSearch.ts` y `electron/main.ts` (`minWidth: 1100`, arrastre macOS superior sin superposición con traffic lights) con navegación unificada para las 8 vistas y atajos `⌘1`–`⌘6`, `⌘,`, `⌘N`, `⌘K`.
- **Criterios de aceptación (como usuario)**:
  - La navegación superior (`Inicio · Materias · Calendario · Tareas · Exámenes · Informes` + `Ajustes`) y el encabezado de detalle de Materia (`← Inicio`) responden con atajos y foco visible en todos los controles.

### Tarea 10.3: [x] Migración visual de todas las vistas (`Inicio`, `Materias`, `Materia`, `Calendario`, `Tareas`, `Exámenes`, `Informes`, `Ajustes`)
- **Qué incluye**:
  - Reescritura completa de `HomePage.tsx`, `CoursesPage.tsx`, `CourseDetailView.tsx` (cuaderno de 3 paneles: Notas / Editor / Informe con IA), `CourseFormModal.tsx`, `DeleteCourseDialog.tsx`, `ReportsPage.tsx`, `CalendarPage.tsx` (Semana / Mes), `TasksPage.tsx`, `ExamsPage.tsx` y `SettingsPage.tsx`.
  - Suite de UI actualizada y nuevo test integral `src/__tests__/Phase10SwissDesignOverhaul.test.tsx`.
- **Criterios de aceptación (como usuario)**:
  - Las 8 vistas navegan entre sí usando datos reales (`cursadaClient` + `reportsStore`), sin ornamentos ni regresiones funcionales, con todos los tests y el build en verde.

---

## Fase 11 (`v2.1.0`): Super-Editor Markdown (Live Preview, Matemática y Atajos Configurables)

> **Objetivo de la versión**: Lleva la experiencia de escritura de notas al nivel de un editor de conocimiento moderno (estilo Obsidian/Typora), con renderizado en vivo mientras se escribe, soporte matemático completo y atajos de teclado a medida.

### Tarea 11.1: [ ] Soporte Matemático ($\LaTeX$ / KaTeX) offline en Notas, Chat y Reportes
- **Qué incluye**:
  - Integración 100% local (sin CDN externo) de renderizado matemático KaTeX para expresiones inline (`$...$`) y bloques de ecuaciones (`$$...$$`).
  - Disponible tanto en las Notas de cada anotador como en las respuestas del Chat RAG y en los Reportes generados por IA.
- **Criterios de aceptación (como usuario)**:
  - Puedo escribir `$O(n \log n)$` o un bloque `$$ \sum_{i=1}^n x_i $$` en una nota o recibirlo del asistente IA y ver la fórmula matemática renderizada con tipografía científica nítida.

### Tarea 11.2: [ ] Editor Markdown con Formato en Tiempo Real ("Live Preview" en CodeMirror 6)
- **Qué incluye**:
  - Motor de decoraciones en vivo sobre CodeMirror 6 (`ViewPlugin` + árbol sintáctico Markdown) que formatea el documento en tiempo real a medida que escribís:
    - Los encabezados (`# Heading`) se ven directamente con su tamaño y peso de título sin mostrar los símbolos `#`.
    - Negritas (`**texto**`), cursivas (`*texto*`), código inline, citas, listas, checklists clicables (`- [ ]`), fórmulas `$math$`, tablas y bloques **Callout** (`> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`, `> [!IMPORTANT]`) se muestran estilizados en vivo.
    - **Revelado inteligente por cursor**: Solo la línea o elemento exacto donde está posicionado el cursor muestra temporalmente los caracteres Markdown (`#`, `**`, `$`) para permitir editarlos sin fricción; al mover el cursor a otra línea, vuelve a verse formateado.
- **Criterios de aceptación (como usuario)**:
  - Mientras escribo una nota, veo los títulos, negritas, callouts, listas de tareas, fórmulas y tablas formateados directamente en tiempo real sin tener que cambiar a un modo de solo lectura, y cuando apoyo el cursor sobre un elemento puedo editar su sintaxis cómodamente.

### Tarea 11.3: [ ] Atajos de Teclado Configurables para Edición Markdown
- **Qué incluye**:
  - Sistema de comandos de edición en el editor de notas para insertar y envolver estructuras complejas al instante: **Insertar Tabla**, **Insertar Callout** (nota, alerta, tip), **Insertar Bloque Matemático (`$$`)**, **Insertar Bloque de Código**, **Alternar Tarea (`- [ ]`)**, **Encabezado 1/2/3**, **Negrita/Cursiva** y **Enlace a Nota (`[[`)**.
  - Sección en **Ajustes → Atajos del Editor** donde el usuario puede elegir y reasignar la combinación de teclas de cada acción (con detección de colisiones y botón de restaurar valores por defecto), persistida en `app_settings`.
- **Criterios de aceptación (como usuario)**:
  - Puedo ir a **Ajustes**, asignar mis propias combinaciones de teclas para insertar una tabla, un callout o una fórmula, y al presionarlas dentro del editor se inserta la estructura con el cursor ubicado listo para escribir.

---

## Fase 12 (`v2.2.0`): Red de Conocimiento (WikiLinks, Vista de Grafo e Importador de Obsidian)

> **Objetivo de la versión**: Conectar las notas entre sí mediante enlaces bidireccionales, visualizar la red de conocimiento en un grafo interactivo y permitir traer Vaults enteros desde Obsidian.

### Tarea 12.1: [ ] Enlaces Bidireccionales entre Notas (`[[WikiLinks]]`), Forward Links y Backlinks
- **Qué incluye**:
  - Migración SQLite `v6` creando la tabla `note_links` e índices de búsqueda rápida de enlaces salientes (*forward links*) y entrantes (*backlinks*).
  - Parser automático al guardar una nota que detecta enlaces `[[Título de Nota]]` y `[[Título de Nota|Texto visible]]`.
  - Popup de autocompletado instantáneo al escribir `[[` en el editor listando las notas existentes.
  - Navegación en 1 clic al hacer clic sobre un `[[WikiLink]]` (si la nota destino aún no existe, la crea automáticamente al hacer clic).
  - Panel de **Enlaces entrantes (Backlinks)** al pie de cada nota mostrando todas las notas que hacen referencia a la nota actual junto con el fragmento de contexto.
- **Criterios de aceptación (como usuario)**:
  - Puedo escribir `[[` en cualquier nota, elegir otra nota del autocompletado y navegar hacia ella con un clic.
  - Al abrir una nota, puedo ver en su sección de **Backlinks** qué otras notas la están citando y saltar a cualquiera de ellas.

### Tarea 12.2: [ ] Vista de Grafo Interactiva estilo Obsidian (`<NotesGraphView />`)
- **Qué incluye**:
  - Visualizador de grafo interactivo en 2D (`<canvas>`) con simulación física de fuerzas (nodos que se repelen suavemente y enlaces que actúan como resortes).
  - Dos alcances: **Grafo del Anotador** (dentro de la pestaña Notas de un anotador) y **Grafo Global** (todas las notas de todos los anotadores, con filtro para incluir o excluir archivados).
  - Nodos coloreados según el color de su Anotador, tamaño proporcional a la cantidad de conexiones, zoom/paneo con trackpad o mouse, resaltado de nodos vecinos al pasar el cursor, buscador para filtrar nodos y apertura directa de la nota al hacer clic.
- **Criterios de aceptación (como usuario)**:
  - Puedo abrir la **Vista de Grafo**, ver todas mis notas como nodos conectados por sus enlaces `[[...]]`, arrastrar nodos, hacer zoom, filtrar por texto y hacer clic en cualquier nodo para abrir esa nota.

### Tarea 12.3: [ ] Importador de Vaults desde Obsidian
- **Qué incluye**:
  - Herramienta en **Ajustes** y en **Anotadores** (`"Importar Vault de Obsidian"`) que abre el selector nativo de carpetas de macOS.
  - Escaneo recursivo de la carpeta seleccionada (ignorando carpetas ocultas como `.obsidian/` y `.trash/`), lectura de archivos `.md` y extracción de *frontmatter* YAML.
  - Opción al importar para elegir el destino: crear Anotadores **Activos** o importarlos directamente como **Archivados** (para que el Vault quede disponible en el **Archivo** para consulta, búsqueda FTS5 y vista de grafo sin llenar la barra lateral activa).
  - Resolución automática de todos los `[[WikiLinks]]` entre las notas importadas para que el grafo y los backlinks funcionen desde el primer momento.
- **Criterios de aceptación (como usuario)**:
  - Puedo elegir una carpeta de un Vault de Obsidian en mi Mac, indicar que se importe al **Archivo** (o como anotador activo) y encontrar todas mis notas con su contenido, enlaces `[[...]]` y grafo funcionando dentro de la app.

---

## Fase 13 (`v2.3.0`): Estudio Activo, Contexto IA por Parcial y Seguimiento (Pomodoro, Notas como Fuentes, Simulacro y Asistencia)

> **Objetivo de la versión**: Permitir usar las propias Notas junto con las Fuentes en la IA filtrando por instancia (`1° Parcial` / `2° Parcial`), sumar el Modo Simulacro Interactivo, el Pomodoro Timer y el Control de Asistencia.

### Tarea 13.1: [ ] Pomodoro Timer Configurable
- **Qué incluye**:
  - Temporizador Pomodoro integrado en el shell de la app para que siga corriendo sin interrupciones al cambiar entre Notas, Fuentes, Chat IA, Tareas o Calendario.
  - Configuración persistida de duración de **Foco** (ej. 25 / 45 / 50 min), **Descanso corto** (ej. 5 / 10 min), **Descanso largo** (ej. 15 / 20 min) y cantidad de rondas antes del descanso largo.
  - Controles rápidos (Iniciar, Pausar, Reiniciar, Saltar bloque), vinculación opcional con el Anotador actual y notificación nativa de macOS al finalizar cada sesión de foco o descanso.
- **Criterios de aceptación (como usuario)**:
  - Puedo configurar los minutos de mi Pomodoro, iniciarlo mientras estudio o escribo apuntes, moverme libremente por toda la app viendo el tiempo restante y recibir una notificación en mi Mac cuando termina el bloque.

### Tarea 13.2: [ ] Notas como Fuentes para la IA, Selector de Fuentes/Notas y Filtro por Parcial (`1° Parcial` / `2° Parcial`)
- **Qué incluye**:
  - **Etiquetado por etapa en Fuentes y Notas**: Posibilidad de clasificar cada Fuente y cada Nota dentro de **`1° Parcial`**, **`2° Parcial`**, **`Final`** o **`General`** (sin categoría específica).
  - **Notas tratadas como Fuentes para la IA**: Indexación y recuperación híbrida (embeddings + FTS5) sobre las Notas propias del anotador para que tanto el **Chat RAG con citas** como el **Generador Map-Reduce** puedan leer y citar tus apuntes de clase igual que un PDF o documento subido en Fuentes.
  - **Selector de contexto unificado en Asistente IA**: Tanto en el **Chat** como en el **Generador de Material / Simulacro**, un panel selector donde podés tildar o destildar individualmente qué **Fuentes** y qué **Notas** querés que la IA utilice en ese momento, acompañado de filtros rápidos en 1 clic (**`Todo`**, **`1° Parcial`**, **`2° Parcial`**, **`Final`**, **`Solo Fuentes`**, **`Solo Notas`**).
- **Criterios de aceptación (como usuario)**:
  - Puedo marcar cualquier Fuente o Nota como material de **`1° Parcial`** o **`2° Parcial`**.
  - En el **Chat con IA** y en el **Generador de resúmenes/exámenes**, puedo elegir qué combinación exacta de Fuentes y Notas usar, o tocar el filtro **`1° Parcial`** / **`2° Parcial`** para que la IA responda y cite únicamente usando el material de ese parcial.

### Tarea 13.3: [ ] Modo Simulacro Interactivo para Exámenes de Práctica
- **Qué incluye**:
  - Evolución del generador de **Exámenes de práctica** en la pestaña **Asistente IA** para abrir un **Modo Simulacro Interactivo** además del documento Markdown tradicional, operando sobre las Fuentes y Notas seleccionadas (ej. filtradas por `1° Parcial` o `2° Parcial`).
  - Presentación de consignas una por una (o en hoja de examen limpia) **ocultando las respuestas correctas**:
    - En preguntas *Multiple Choice*, permite seleccionar la opción (`A`, `B`, `C`, `D`) de forma interactiva.
    - En preguntas de *Desarrollo*, ofrece un cuadro de respuesta para redactar la solución antes de revelar la pauta.
  - Al presionar **"Finalizar y corregir simulacro"**, calcula el puntaje obtenido, marca en verde/rojo cada respuesta, despliega la justificación detallada con cita clicable `[1]` al fragmento/página de la fuente o nota original y permite guardar el resumen del intento o los temas a repasar como una Nota.
- **Criterios de aceptación (como usuario)**:
  - Puedo generar un examen de práctica en modo **Simulacro Interactivo**, responder todas las preguntas sin ver las soluciones, entregar el examen y ver mi calificación automática junto con la explicación y las citas de las fuentes o notas para cada pregunta.

### Tarea 13.4: [ ] Control de Asistencia por Anotador
- **Qué incluye**:
  - Migración SQLite `v7` agregando soporte de asistencia por anotador (cantidad máxima de inasistencias permitidas `max_absences` y registro de asistencias/faltas con fecha y nota opcional).
  - Panel compacto en el Resumen del Anotador que muestra las faltas actuales frente al límite permitido (ej. `2 / 4 faltas · 50% del límite`), alerta de precaución cuando queda 1 sola falta disponible, botones rápidos para registrar falta/asistencia y opción para desactivar el módulo en anotadores que no requieren control de asistencia.
- **Criterios de aceptación (como usuario)**:
  - Puedo activar el control de asistencia en un anotador indicando el máximo de faltas permitidas, sumar o quitar una falta en un clic y ver claramente cuántas inasistencias me quedan disponibles.

---

## Fase 14 (`v2.4.0`): Sincronización con Google Calendar

> **Objetivo de la versión**: Conectar el calendario académico/personal de Cursada con Google Calendar manteniendo la filosofía local-first.

### Tarea 14.1: [ ] Exportación `.ics` y Suscripción por URL iCal de Google Calendar (Sin credenciales Cloud)
- **Qué incluye**:
  - Exportación en 1 clic de horarios semanales, entregas de tareas y fechas de exámenes a un archivo estándar `.ics` (iCalendar) compatible con Google Calendar y Apple Calendar.
  - Campo en **Ajustes → Calendario** para conectar una o más URLs privadas `.ics` de Google Calendar, parseando y superponiendo esos eventos externos dentro de la vista Mensual y Semanal de **Calendario** con actualización bajo demanda y al iniciar.
- **Criterios de aceptación (como usuario)**:
  - Puedo pegar la dirección privada `.ics` de mi Google Calendar en Ajustes y ver mis eventos externos reflejados en el Calendario de Cursada, o exportar mis exámenes y horarios a un archivo `.ics`.

### Tarea 14.2: [ ] Sincronización Bidireccional con Google Calendar API (OAuth2 Local)
- **Qué incluye**:
  - Conector OAuth2 PKCE Desktop en el proceso principal de Electron (`127.0.0.1` loopback callback) configurable desde **Ajustes → Sincronización con Google Calendar**.
  - Publicación y actualización automática de exámenes, entregas con fecha y bloques de cursada hacia un calendario dedicado en la cuenta de Google del usuario, guardando el `sync_token` y mapeo de IDs de eventos localmente en SQLite.
- **Criterios de aceptación (como usuario)**:
  - Una vez vinculada mi cuenta de Google desde Ajustes, cuando creo o edito un examen o tarea con fecha en Cursada y presiono sincronizar (o de forma automática), el evento se crea o actualiza en mi Google Calendar.
