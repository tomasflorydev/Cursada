# DESIGN.md — Sistema de Diseño Base de Cursada

## 1. Identidad Visual y Principios de Diseño

**Cursada** es un espacio de trabajo académico nativo para macOS pensado para estudiantes universitarios. Su diseño busca combinar la **calma visual y estructura limpia** de los mejores tableros estudiantiles de Notion con la **precisión táctil y velocidad** de una aplicación nativa de Mac (como *Things 3*, *Apple Calendar* o *Linear*).

### Revisión de Diseño (Enfoque *Frontend Design*)
Antes de definir los tokens, revisamos la propuesta para evitar los clichés habituales de interfaces generadas:
1. **Qué evitamos**:
   - Evitamos el fondo crema/beige cálido (`#F4F1EA`) con acentos terracota (`#D97757`), que resulta ajeno a macOS y cansa la vista en sesiones largas de estudio. En su lugar, usamos **papel alabastro frío** en modo claro y **pizarra obsidiana** en modo oscuro.
   - Evitamos el "kit de tarjetas SaaS" donde cada bloque tiene el mismo borde, el mismo radio y la misma sombra difusa. En Cursada, **la estructura comunica qué es cada elemento**: las clases usan franjas horarias con barra vertical de color de materia; las tareas usan filas compactas de lista interactiva; los exámenes usan fichas con contador regresivo tabular.
   - Evitamos etiquetas en `MAYÚSCULAS CON TRACKING EXAGERADO` encima de cada título y flechas decorativas (`→`) en todos los botones. Usamos encabezados en oración natural (*Clases de hoy*, *Tareas por vencer*, *Próximos exámenes*) acompañados de contadores numéricos discretos.

### Cinco Principios Rectores
1. **Silencio visual por defecto, color con significado**: La interfaz es neutra (grises pizarra y blancos limpios). El color aparece casi exclusivamente para identificar ** a qué materia pertenece cada clase, entrega, nota o examen**, o para alertar un vencimiento inmediato.
2. **Aire y respiración (Whitespace intencional)**: Al menos el 35% del lienzo permanece libre. Los márgenes amplios (`32px–40px`) evitan la sensación de planilla abarrotada en época de parciales.
3. **Jerarquía por forma, no por decoración**: Un horario de cursada, una tarea pendiente y una fecha de parcial no se ven iguales porque cumplen funciones distintas.
4. **Precisión numérica (`tabular-nums`)**: Horas (`18:30 – 22:30`), cuentas regresivas (`en 5 días`), fechas (`14 nov`) y calificaciones (`8.50`) usan alineación tabular y tipografía monoespaciada sutil para escaneo rápido.
5. **Nativo de macOS en Claro y Oscuro**: Respeto absoluto por `prefers-color-scheme` mediante `color-scheme: light dark` y tokens dinámicos `light-dark()`, integrando la barra lateral translúcida con el área de semáforos de ventana de Mac.

---

## 2. Paleta de Colores (Modo Claro y Modo Oscuro)

### 2.1. Superficies, Texto y Bordes Base

| Token CSS | Rol en la Interfaz | Modo Claro (Alabastro) | Modo Oscuro (Obsidiana) |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | Fondo principal del área de contenido | `#FAFBFD` | `#111318` |
| `--bg-sidebar` | Barra lateral de navegación macOS | `#F2F4F8` | `#0C0E12` |
| `--bg-surface` | Tarjetas, paneles elevados y tablas | `#FFFFFF` | `#171A21` |
| `--bg-surface-subtle` | Filas al pasar el cursor / cabeceras suaves | `#F4F6FA` | `#1E222B` |
| `--bg-surface-active` | Elemento seleccionado en navegación o lista | `#E9EEF6` | `#252A36` |
| `--text-primary` | Títulos, nombres de materias y texto principal | `#14171F` | `#F1F3F9` |
| `--text-secondary` | Subtítulos, profesores, aulas y descripciones | `#525866` | `#9BA3B4` |
| `--text-muted` | Metadatos secundarios, horas pasadas, pistas | `#7C8494` | `#687082` |
| `--border-subtle` | Divisorias de listas y bordes de tarjetas (`1px`) | `#E5E9F0` | `#242936` |
| `--border-strong` | Bordes enfatizados, inputs en foco o hover | `#CBD2DF` | `#363D4F` |
| `--accent-primary` | Acción principal de la app y foco de teclado | `#2563EB` | `#60A5FA` |

### 2.2. Estados Académicos y de Urgencia

| Estado | Uso | Modo Claro (Texto / Fondo) | Modo Oscuro (Texto / Fondo) |
| :--- | :--- | :--- | :--- |
| **En curso / Hoy** | Clase actual o entrega que vence hoy | `#1D4ED8` sobre `#EFF6FF` | `#93C5FD` sobre `#172554` |
| **Atención / Próximo** | Entrega en 24–48 h o parcial esta semana | `#B45309` sobre `#FFFBEB` | `#FCD34D` sobre `#3B2506` |
| **Vencida / Urgente** | Tarea vencida o examen mañana | `#BE123C` sobre `#FFF1F2` | `#FDA4AF` sobre `#3F111D` |
| **Completada / Aprobado** | Tarea lista o nota ≥ 4 | `#047857` sobre `#ECFDF5` | `#6EE7B7` sobre `#063227` |

### 2.3. Paleta de Acento por Materia (8 Colores Suaves)

Cada materia elige uno de los 8 colores del esquema de datos (`courses.color`). Cada color define tres variables automáticas:
- `--course-dot`: Punto indicador y barra vertical de horario.
- `--course-bg`: Fondo suave para etiquetas (pills) y bloques del calendario.
- `--course-text`: Texto sobre el fondo suave con contraste ≥ 4.5:1 (WCAG AA).

| Clave (`color`) | Nombre sugerido | Punto (`--course-dot`) | Claro (`--course-bg` / `--course-text`) | Oscuro (`--course-bg` / `--course-text`) |
| :--- | :--- | :--- | :--- | :--- |
| `blue` | Azul Cobalto | `#3B82F6` | `#EFF6FF` / `#1E40AF` | `#172554` / `#93C5FD` |
| `emerald` | Verde Salvia | `#10B981` | `#ECFDF5` / `#065F46` | `#063227` / `#6EE7B7` |
| `violet` | Violeta Iris | `#8B5CF6` | `#F5F3FF` / `#5B21B6` | `#271745` / `#C4B5FD` |
| `amber` | Ámbar Ocre | `#F59E0B` | `#FFFBEB` / `#92400E` | `#3B2506` / `#FCD34D` |
| `rose` | Rosa Coral | `#F43F5E` | `#FFF1F2` / `#9F1239` | `#3F111D` / `#FDA4AF` |
| `cyan` | Cian Ártico | `#06B6D4` | `#ECFEFF` / `#155E75` | `#083344` / `#67E8F9` |
| `orange` | Naranja Terracota | `#F97316` | `#FFF7ED` / `#9A3412` | `#3D1A08` / `#FDBA74` |
| `slate` | Gris Grafito | `#64748B` | `#F1F5F9` / `#334155` | `#1E293B` / `#CBD5E1` |

---

## 3. Tipografía y Escala Tipográfica

Usamos la pila tipográfica nativa de macOS para lograr nitidez subpíxel inmediata en pantallas Retina de MacBook Air, combinada con una fuente monoespaciada para datos horarios y numéricos:

- **Interfaz y Lectura (`--font-sans`)**: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`
- **Títulos de Página (`--font-display`)**: `"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif`
- **Horarios, Fechas y Notas Numéricas (`--font-mono`)**: `"SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace` con `font-variant-numeric: tabular-nums`

### Escala Tipográfica

| Nivel | Tamaño | Peso | Interlineado | Tracking | Uso |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Título de Vista (`h1`)** | `24px` (`1.5rem`) | `600` | `1.25` | `-0.022em` | Encabezado principal (*Inicio*, *Calendario*, nombre de materia) |
| **Título de Sección (`h2`)** | `15px` (`0.9375rem`) | `600` | `1.35` | `-0.01em` | Cabeceras de bloque (*Clases de hoy*, *Tareas por vencer*) |
| **Título de Ítem (`h3`)** | `14px` (`0.875rem`) | `500` | `1.4` | `-0.005em` | Nombre de clase, título de tarea o instancia de examen |
| **Cuerpo Base** | `13.5px` (`0.84375rem`) | `400` | `1.5` | `0` | Texto general de interfaz, descripciones y navegación |
| **Metadatos y Etiquetas** | `12px` (`0.75rem`) | `500` | `1.35` | `0.005em` | Pills de materia, aula, fechas y contadores |
| **Datos Tabulares / Horas** | `12px` (`0.75rem`) | `500` | `1.2` | `0` | Franjas `18:30 – 22:30`, cuentas regresivas `12d`, promedios |

- **Ancho de línea en lectura (Notas y resúmenes IA)**: Máximo `68ch–74ch` para lectura cómoda de apuntes.

---

## 4. Espaciados y Estructura de Ventana

El sistema usa una unidad base de **`4px`**:
- `--space-1`: `4px` (separación mínima entre ícono y etiqueta compacta)
- `--space-2`: `8px` (gap interno en botones, pills y filas compactas)
- `--space-3`: `12px` (padding interno de filas de lista e ítems de navegación)
- `--space-4`: `16px` (padding interno estándar de tarjetas y separación entre bloques chicos)
- `--space-5`: `20px` (separación entre columnas del tablero)
- `--space-6`: `24px` (separación vertical entre secciones principales)
- `--space-8`: `32px` (margen perimetral del área de contenido)
- `--space-10`: `40px` (margen superior/horizontal en pantallas amplias)

### Layout General de la App
- **Barra lateral fija (`248px`)**:
  - Reserva superior de `38px` (`-webkit-app-region: drag`) para los semáforos nativos de macOS (cerrar, minimizar, zoom).
  - Bloques de navegación:
    1. **Vistas principales**: *Inicio*, *Calendario*, *Tareas*, *Exámenes*, *Notas*, *Materias*.
    2. **Cursada actual (Acceso directo)**: Lista de las materias activas del cuatrimestre con su punto de color y atajo directo.
    3. **Pie de barra lateral**: Indicador de cuatrimestre activo (*2026 · 2° Cuatrimestre*) y acceso a *Ajustes*.
- **Área de contenido principal (`1fr`, scroll vertical independiente)**:
  - Contenedor centrado con `max-width: 1180px`, alineación a la izquierda para todo el contenido de lectura y listas, y padding `28px 36px 48px`.

---

## 5. Estilo de Componentes

### 5.1. Bloques de Clases (Horarios)
- **No son tarjetas genéricas**: Tienen una barra lateral izquierda de `3.5px` con el `--course-dot` de la materia, columna horaria monoespaciada (`18:30 – 22:30`), nombre de la materia, profesor y pill de aula/modalidad (*Aula 402 · Lima* o *Virtual*).
- La **clase en curso o próxima clase del día** recibe un fondo suavemente teñido con el color de la materia y un indicador de estado (*En 40 min* / *En curso*).

### 5.2. Listas de Tareas (To-Do)
- Inspiradas en la limpieza de *Things 3* y las vistas de lista minimalistas de *Notion*:
- Filas de `40px` de altura mínima separadas por líneas sutiles (`1px solid var(--border-subtle)`), sin recuadros individuales por tarea.
- Cada fila muestra:
  1. Casilla de verificación redondeada (`16px × 16px`, `border-radius: 5px`) con borde del color de la materia.
  2. Título de la tarea en una línea clara.
  3. A la derecha: etiqueta compacta de la materia (`pill`), indicador sutil de prioridad (solo si es Alta/Media) y fecha de entrega tabular (*Hoy*, *Mañana*, *Jue 12 nov*).

### 5.3. Fichas de Exámenes
- Diseño orientado a la preparación:
  - A la izquierda, un **bloque numérico de cuenta regresiva** (`4 días`, `12 días`) con color semántico según cercanía.
  - En el centro, instancia categorizada (*1° Parcial*, *TP Evaluativo*, *Final*), nombre de la materia con su color y aula/horario.
  - Debajo, lista compacta de **temas que entran** en tipografía secundaria legible.

### 5.4. Botones y Controles
- **Altura estándar**: `30px` (compacto nativo macOS) o `34px` para acciones primarias, `border-radius: 7px`.
- **Botón Primario**: Fondo `--text-primary` en claro / `--accent-primary` en oscuro, texto contrastado, sin sombras pesadas.
- **Botón Secundario / Neutro**: Fondo `--bg-surface`, borde `1px solid var(--border-subtle)`, hover en `--bg-surface-subtle`.
- **Control Segmentado (Segmented Control)**: Fondo `--bg-surface-subtle` con `padding: 3px`, `border-radius: 8px`, pastilla activa con `--bg-surface` y sombra sutil `0 1px 2px rgba(0,0,0,0.06)` (típico de macOS).

---

## 6. Tres Variantes Propuestas para la Pantalla de Inicio

Para que puedas comparar y elegir qué estructura te resulta más cómoda en el día a día (o qué partes combinar), diseñamos e implementamos **3 variantes intercambiables en vivo** desde la esquina superior derecha de la pantalla de **Inicio**:

### Variante A — "Bento Equilibrado" (Recomendada por defecto)
Pensada para ver todo el estado de la cursada de un vistazo sin hacer scroll excesivo.

```text
+-------------------------------------------------------------------------+
| Martes 10 de noviembre · Semana 12                   [A] [B] [C] +Tarea |
+-------------------------------------------------------------------------+
| CLASES DE HOY (Franja horizontal de tarjetas con barra de color)       |
| [14:00-18:00 Diseño de Sistemas]  [18:30-22:30 Ing. de Software I ★]    |
+-----------------------------------------+-------------------------------+
| TAREAS POR VENCER (Lista interactiva)   | PRÓXIMOS EXÁMENES (Fichas)    |
| [ ] Entregar DER normalizado   [BD II]  | [ 3d ] 2° Parcial · Ing Soft  |
| [ ] Resolver guía Árboles AVL  [Proba]  |        Temas: Cap. 4 a 7      |
| [ ] Preparar casos de uso      [Dis.]   | [ 9d ] TP Evaluativo · Diseño |
|                                         |        Temas: Patrones GoF    |
| PULSO DE LA SEMANA (Lun a Sáb)          | MATERIAS ACTIVAS (Resumen)    |
| [Lun 1] [Mar 2★] [Mié 1] [Jue 2] [Vie 1]| • Ing. de Software  • Diseño  |
+-----------------------------------------+-------------------------------+
```

### Variante B — "Foco en el Día (Agenda + Bandeja)"
Ideal si preferís usar Inicio como una agenda cronológica del día a la izquierda y tus pendientes académicos a la derecha (inspirada en *Things + Apple Calendar*).

```text
+-------------------------------------------------------------------------+
| Martes 10 de noviembre · Semana 12                   [A] [B] [C] +Tarea |
+----------------------------+--------------------------------------------+
| AGENDA DE HOY (Columna)    | TAREAS POR VENCER (Tabla limpia ancha)     |
|                            | [ ] Entregar DER normalizado  BD II   Hoy  |
| 14:00 ┌─────────────────┐  | [ ] Guía de variables aleat.  Proba   Mañ  |
|       │ Diseño Sistemas │  | [ ] Casos de uso extendidos   Diseño  Vie  |
| 18:00 └─────────────────┘  |--------------------------------------------|
| 18:30 ┌─────────────────┐  | PRÓXIMOS EXÁMENES (Grilla de 2 columnas)   |
|       │ Ing. Software ★ │  | +-------------------+ +------------------+ |
| 22:30 └─────────────────┘  | | 3d · 2° Parcial   | | 9d · TP Grupal   | |
|                            | | Ing. Software I   | | Diseño Sistemas  | |
| Entrega de hoy:            | +-------------------+ +------------------+ |
| • 23:59 TP Normalización   |                                            |
+----------------------------+--------------------------------------------+
```

### Variante C — "Editorial Compacto (Estilo Hoja de Estudio / Notion)"
Una sola columna centrada (`max-width: 860px`) con muchísimo espacio en blanco lateral, sin cajas contenedoras externas, donde todo fluye como un documento vivo y estructurado.

```text
+-------------------------------------------------------------------------+
|         Martes 10 de noviembre                                          |
|         2 clases hoy · 4 entregas pendientes · 1 parcial esta semana    |
|                                                                         |
|         HOY EN LA FACULTAD                                              |
|         ┃ 14:00 – 18:00   Diseño de Sistemas          Aula 308 · Lima   |
|         ┃ 18:30 – 22:30   Ingeniería de Software I    Aula 402 · En 40m |
|         ─────────────────────────────────────────────────────────────── |
|         TAREAS POR VENCER                                               |
|         ☐ Entregar DER normalizado (3FN)        Base de Datos II    Hoy |
|         ☐ Resolver ejercicios distribución      Probabilidad        Mañ |
|         ─────────────────────────────────────────────────────────────── |
|         PRÓXIMOS EXÁMENES                                               |
|         13 NOV (en 3 días)  2° Parcial — Ing. de Software I    Aula 402 |
|         19 NOV (en 9 días)  Defensa TP — Diseño de Sistemas    Aula 308 |
+-------------------------------------------------------------------------+
```
