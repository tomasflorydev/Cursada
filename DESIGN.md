# DESIGN.md — Sistema Tipográfico Suizo (Cursada v2.0)

## 1. Principios de Diseño

Estilo tipográfico internacional ("Suizo"): rígido, claro y libre de ornamentos. La jerarquía visual se construye exclusivamente con tamaño tipográfico, peso, reglas (líneas horizontales y verticales) y espacio.

1. **Cero ornamento**: `border-radius: 0` global, `box-shadow: none`, sin gradientes, sin emojis ni ilustraciones. Símbolos permitidos: `→`, `←`, `‹`, `›`, `+` y `▾`.
2. **Reglas y bloques delimitados**: líneas de `3px solid var(--ink)` en bloques principales (header, pie, encabezados de sección) y `1px solid var(--rule)` entre filas; bordes `1px solid var(--ink)` con `padding: 24px` y `gap: 32px` en los 3 paneles colapsables de la vista de Materia. Borde de `2px solid var(--ink)` en botones secundarios, inputs, controles segmentados, bloques del calendario y el campo de preguntas a fuentes.
3. **Un solo acento por vista (`--acc`) y citas editoriales**: `--acc` se reserva para el número del día en Inicio, el examen más próximo / entrega urgente (< 3 días), el subrayado de la pestaña activa (`3px`), la marca vertical de ítem seleccionado (`4px`), el bloque de la próxima clase en Calendario, la acción principal de cada zona (máximo 1), la barra bajo títulos de nota (`64×3px`), el cursor del editor (`2px`), el interruptor activo y el foco de teclado (`2px`). Las citas `[1]` y enlaces en informes usan tinta neutra (`var(--ink)`) con subrayado fino (`text-underline-offset: 4px`) sin relleno de color.
4. **Contraste estricto en toggles y segmentados**: inversión total blanco/negro mediante `--toggle-active-bg` / `--toggle-active-fg` (`#FFFFFF` / `#000000` en modo Oscuro; `#000000` / `#FFFFFF` en modo Claro) con `@layer reset, tokens, base, layout, components, utilities;` declarado en primer lugar.
5. **Grilla de 12 columnas y transiciones**: `gap: 28px` (`24px` en Inicio), márgenes de página `48px` a los lados, `30px` arriba (`36px` con clearance para traffic lights en macOS) y `28px` abajo. Transiciones entre vistas exclusivamente de opacidad (`0.18s`, `easeOut`) vía `framer-motion` respetando `prefers-reduced-motion`.
6. **Números tabulares**: `font-variant-numeric: tabular-nums` en fechas, horas, índices y contadores.
7. **Alineación a la izquierda**: contenido alineado a la izquierda, salvo celdas numéricas/encabezados de calendario y segmentos de controles.
8. **Idioma**: español rioplatense con voseo directo ("Tenés", "Agregá", "Preguntale").

## 2. Tokens de Color

El tema **Oscuro** es el predeterminado (`:root` y `:root[data-theme="dark"]`). El tema Claro (`:root[data-theme="light"]`) y el modo Sistema (`:root[data-theme="system"]` con `@media (prefers-color-scheme: light)`) comparten exactamente el mismo diseño geométrico.

| Token | Oscuro (Default) | Claro | Uso |
|---|---|---|---|
| `--bg` | `#1E2023` | `#F4F4F2` | Fondo de página y superficies |
| `--ink` | `#ECECE7` | `#111111` | Texto principal y reglas fuertes (`3px` / `2px`) |
| `--soft` | `#DADBDA` | `#444444` | Cuerpo largo de notas e informes |
| `--mut` | `#AEB0B3` | `#555555` | Texto secundario, fechas, metadatos, tachados |
| `--rule` | `#C9CACB` | `#111111` | Reglas de `1px` entre filas |
| `--grid` | `rgba(201, 202, 203, 0.26)` | `rgba(17, 17, 17, 0.15)` | Líneas internas de calendario y fondo de barras de progreso |
| `--acc` | `#FF5F52` | `#C8201A` | Acento único |
| `--on-acc` | `#1E2023` | `#FFFFFF` | Texto sobre fondo de acento |

## 3. Tipografía

- **Principal**: `Archivo` (`@fontsource/archivo` empaquetado 100% offline con pesos `400`, `500`, `600`, `800`), fallback `Helvetica, Arial, sans-serif`.
- **Código inline**: `Menlo, monospace`, `15px`.

| Rol | Tamaño / Peso | Detalle |
|---|---|---|
| Wordmark `Cursada` | `22px / 800` | `letter-spacing: -0.02em` |
| Título de pantalla | `56px / 800` | `line-height: 1; letter-spacing: -0.045em` |
| Título de nota | `46px / 800` | `line-height: 1.02; letter-spacing: -0.04em` |
| Título de informe | `40px / 800` | `letter-spacing: -0.04em` |
| Número del día (Inicio) | `236px / 800` | `line-height: 0.82; letter-spacing: -0.06em; color: var(--acc)` |
| Contador de días (Exámenes) | `150px` (1º), `84px` (demás) `/ 800` | `letter-spacing: -0.06em` |
| Nombre de materia en lista | `32px / 800` | `letter-spacing: -0.03em` |
| Cuerpo de nota | `17px / 400` (`--note-body-size`) | `line-height: 1.6; max-width: 640px` |
| Cuerpo de informe | `16px / 400` | `line-height: 1.6; max-width: 660px` |
| Etiqueta de sección | `11px / 600` | `text-transform: uppercase; letter-spacing: 0.12em` |

## 4. Estructura y Vistas

- **Shell común (`src/ui/SwissHeader.tsx`)**: Header horizontal con `border-bottom: 3px solid var(--ink)` y menú `Inicio · Materias · Calendario · Tareas · Exámenes · Informes` más el enlace `Ajustes` a la derecha.
- **Vista de detalle de Materia (`CourseDetailView`)**: reemplaza el menú por `← Inicio`, nombre de materia en `22/800` y resumen derecho (`"N notas · N PDFs · parcial en N días"`). Panel izquierdo colapsable con listado de notas arriba y **Red de conocimiento** (enlaces/backlinks) + asistencia debajo; panel central de edición Markdown y panel derecho colapsable de fuentes/IA.
- **Componentes compartidos (`src/ui/Primitives.tsx`)**: botones primarios y secundarios, casilla de `18px`, interruptor de `46×24px`, control segmentado con borde compartido, inputs con borde `2px`, barra de progreso de `8px`, marca de cita `[N]`, barra de carga horizontal `3px` sin spinners y estado de error con barra izquierda de `4px`.
- **Las 8 vistas**:
  1. `Inicio` (`HomePage.tsx`)
  2. `Materias` (`CoursesPage.tsx`)
  3. `Materia` (`CourseDetailView.tsx`, 3 paneles: Notas / Editor / Informe con IA)
  4. `Calendario` (`CalendarPage.tsx`, Semana / Mes)
  5. `Tareas` (`TasksPage.tsx`)
  6. `Exámenes` (`ExamsPage.tsx`)
  7. `Informes` (`ReportsPage.tsx`)
  8. `Ajustes` (`SettingsPage.tsx`)
