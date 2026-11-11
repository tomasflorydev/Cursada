# DESIGN.md — Sistema de Diseño Base de Cursada

## 1. Identidad Visual y Principios de Diseño

**Cursada** es un espacio de trabajo académico nativo para macOS concebido para estudiantes universitarios. Combina la calma visual y la legibilidad de Notion con la velocidad y precisión táctil de aplicaciones nativas de Mac (*Things 3*, *Linear*).

### Decisión de Diseño Confirmada
- **Estructura elegida**: **Bento con Aire** (diseño sobrio, amplio y despojado de ruido visual).
- **Enfoque de contenido**: La pantalla de Inicio prioriza las responsabilidades activas (**Tareas por vencer**, **Próximos exámenes** y el **Pulso de la semana**). El bloque de "clases de hoy" fue descartado para mantener el foco en entregas y preparación de parciales (el horario completo de cursada pertenece a la sección **Calendario**).
- **Tipografía**: Pila nativa de macOS (`SF Pro Display`, `SF Pro Text` y `SF Mono`) para nitidez subpíxel inmediata en pantallas Retina, sin descargas externas.
- **Espacio en blanco masivo**: Márgenes perimetrales generosos (`32px–48px`), paddings holgados y separación amplia entre paneles (`28px–36px`).

---

## 2. Paleta de Colores Confirmada (Paleta 1: Pizarra & Índigo)

### 2.1. Superficies y Texto Base

El modo oscuro utiliza **grises pizarra suaves**, evitando intencionalmente el negro absoluto (`#000000`) para descansar la vista durante sesiones nocturnas de estudio.

| Token CSS | Rol en la Interfaz | Modo Claro (Alabastro) | Modo Oscuro (Pizarra Suave) |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | Fondo principal de la ventana | `#F6F8FA` | `#21262D` |
| `--bg-sidebar` | Barra lateral fija de navegación | `#EEF1F6` | `#1B1F26` |
| `--bg-surface` | Tarjetas, paneles elevados y tablas | `#FFFFFF` | `#282E37` |
| `--bg-surface-subtle` | Filas al pasar el cursor y cabeceras | `#F2F5F9` | `#2F3640` |
| `--bg-surface-active` | Elemento seleccionado en navegación | `#E5EBF3` | `#363E4A` |
| `--text-primary` | Títulos, materias y texto principal | `#1F242D` | `#E6EDF3` |
| `--text-secondary` | Descripciones, fechas y profesores | `#57606A` | `#9CA6B4` |
| `--text-muted` | Metadatos secundarios y horas pasadas | `#76808C` | `#7D8796` |
| `--border-subtle` | Divisores y bordes sutiles (`1px`) | `#D8DEE6` | `#38404C` |
| `--border-strong` | Bordes en foco o estados destacados | `#BCC5D1` | `#4B5463` |
| `--accent-primary` | Acción principal y foco de teclado | `#3B5BDB` | `#748FFC` |
| `--accent-soft` | Fondos de pill y estados activos suaves | `#EDF2FF` | `#26314D` |

### 2.2. Semántica de Estados Académicos

| Estado | Uso | Modo Claro | Modo Oscuro |
| :--- | :--- | :--- | :--- |
| **Hoy / Próximo** | Entrega del día o evento cercano | `#3B5BDB` sobre `#EDF2FF` | `#748FFC` sobre `#26314D` |
| **Atención** | Parcial esta semana o entrega mañana | `#B45309` sobre `#FEF6E7` | `#F6C467` sobre `#3D311E` |
| **Urgente** | Tarea vencida o fecha límite inmediata | `#BE123C` sobre `#FCEEF0` | `#F992A3` sobre `#42262C` |
| **Completada** | Tarea lista / entregada | `#047857` sobre `#EAFAF4` | `#6EE7B7` sobre `#203B33` |

### 2.3. Paleta de Acento por Materia (8 Tonos Suaves)

Cada materia elige uno de los 8 colores disponibles en `courses.color`. En modo oscuro los tonos de fondo y borde se atenúan para integrarse con la base de pizarra:

| Clave (`color`) | Nombre sugerido | Punto (`--course-dot`) | Modo Claro (Fondo / Texto) | Modo Oscuro (Fondo / Texto) |
| :--- | :--- | :--- | :--- | :--- |
| `blue` | Azul Zafiro | `#4C82F7` | `#EEF4FF` / `#1E40AF` | `#26344D` / `#A5C4FF` |
| `emerald` | Verde Esmeralda | `#20B486` | `#ECFDF6` / `#065F46` | `#213A34` / `#7EE2C0` |
| `violet` | Violeta Amatista | `#9370F5` | `#F4F1FF` / `#5B21B6` | `#312B47` / `#CDBAFF` |
| `amber` | Ámbar Cálido | `#EB9E28` | `#FEF8EB` / `#92400E` | `#3D3322` / `#F7CB79` |
| `rose` | Rosa Coral | `#EE5D77` | `#FFF1F3` / `#9F1239` | `#402830` / `#F9A8B8` |
| `cyan` | Cian Glaciar | `#1AB3CC` | `#ECFEFF` / `#155E75` | `#203940` / `#84E2F2` |
| `orange` | Naranja Fuego | `#F27C38` | `#FFF6F0` / `#9A3412` | `#3F2D23` / `#FAB88E` |
| `slate` | Gris Neutro | `#64748B` | `#F1F5F9` / `#334155` | `#2C3542` / `#CBD5E1` |

---

## 3. Tipografía y Jerarquía

- **Cuerpo y Lectura (`--font-sans`)**: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif`
- **Títulos y Encabezados (`--font-display`)**: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif`
- **Horarios, Fechas y Números (`--font-mono`)**: `'SF Mono', Menlo, Monaco, monospace` con `font-variant-numeric: tabular-nums`

---

## 4. Estructura de Pantalla: Bento con Aire (Layout Cockpit Semanal)

La pantalla de **Inicio** funciona como un "Cockpit" académico semanal estructurado en un layout asimétrico con aire generoso (60-65% : 35-40%):

1. **Cabecera**:
   - Fecha completa en español (`Martes 10 de noviembre de 2026`) con pill monoespaciada de cuatrimestre/semana (`Semana 12 de 16`).
   - Título principal `Inicio` y subtítulo resumen de pendientes (`Tenés 4 entregas pendientes y tu próximo examen es en 3 días.`).
2. **Columna Izquierda — Protagonista (minmax 1.48fr)**:
   - **Calendario de la semana (Preview semanal)**: Al abrir la aplicación, el estudiante ve de inmediato la grilla completa de 7 días (Lunes a Domingo, semana actual).
   - Cada día muestra:
     - Cabecera con día abreviado, número de fecha y destacado visual sobrio para el día actual (`Hoy`).
     - Bloques de clases con la barra de acento del color de la materia, horario (`18:30 – 22:30`), nombre de la materia (enlace directo) y aula/modalidad (`Aula 308 · Lima`).
     - Eventos de examen con badge destacado (`Examen`).
     - Días sin actividad con ranura libre minimalista.
   - Franja inferior con leyenda y acceso rápido a las materias activas del cuatrimestre.
   - Botón de acceso directo en cabecera: `Ver calendario completo`.
3. **Columna Derecha — Lateral de Entregas y Parciales (minmax 340px)**:
   - **Tareas por vencer**: Panel vertical con checklist interactivo (checkboxes funcionales con tachado instantáneo), indicadores de prioridad alta, pill de materia y badge de urgencia (`Hoy`, `Mañana`, fecha).
   - **Próximos exámenes**: Panel vertical con fichas de exámenes y contador tabular en días (`3 días`, `10 días`), fecha, horario, categoría (`Parcial`, `TP evaluativo`), temas y sede.
4. **Simplificación visual**:
   - Se descartó el bloque aislado de "clases de hoy" para evitar redundancias, ya que los horarios y aulas quedan integrados en la columna del día actual en la preview del calendario semanal.
