# ROADMAP.md — Plan de Desarrollo por Fases de Cursada

Cada fase está dividida en tareas pequeñas y verificables. Los criterios de aceptación están redactados como **acciones concretas del usuario** para que puedas validar el producto directamente usándolo.

---

## Fase 1: Base del Proyecto + Materias + Horario Semanal de Clases

### Tarea 1.1: Esqueleto de la app, base de datos SQLite y backups automáticos
- **Qué incluye**: Inicialización de Electron + React + Vite + TypeScript (`com.cursada.app`), ventana macOS con semáforos integrados (`titleBarStyle: 'hiddenInset'`), layout base estilo macOS con barra lateral fija, soporte de modo claro/oscuro según el sistema, conexión SQLite con `node:sqlite`, migraciones automáticas versionadas, servicio de backups automáticos y pantalla de Ajustes con botón de backup manual.
- **Criterios de aceptación (como usuario)**:
  - Puedo abrir la aplicación **Cursada** y ver la barra lateral en español con la navegación principal (**Inicio**, **Calendario**, **Tareas**, **Exámenes**, **Notas**, **Materias** y **Ajustes**).
  - Si cambio mi Mac entre modo claro y modo oscuro, la interfaz de Cursada adapta sus colores automáticamente manteniendo legibilidad y estética nativa.
  - Puedo abrir **Ajustes → Datos y Backups**, hacer clic en **"Crear backup ahora"** y ver confirmada la fecha y ubicación del backup generado.

### Tarea 1.2: CRUD completo de Materias y sus horarios semanales
- **Qué incluye**: Creación, edición, archivado y eliminación (con confirmación) de materias con nombre, color de la paleta, profesor, cuatrimestre y múltiples bloques de horario semanal (día de la semana, hora de inicio, hora de fin y aula/modalidad opcional).
- **Criterios de aceptación (como usuario)**:
  - Puedo crear una materia con su nombre, color, profesor, cuatrimestre y uno o más horarios semanales (ej. Lunes de 18:30 a 22:30 y Jueves de 18:30 a 22:30), y al cerrar y volver a abrir la app sigue ahí.
  - Puedo hacer clic en una materia en la barra lateral para entrar a su vista dedicada y ver su información de cabecera, sus horarios y sus pestañas estructuradas.
  - Puedo editar los datos o los horarios de una materia existente y los cambios se reflejan inmediatamente en toda la app.
  - Puedo eliminar una materia previa confirmación de seguridad.

### Tarea 1.3: Vista de Calendario con horario semanal de clases
- **Qué incluye**: Grilla semanal interactiva de **Lunes a Domingo** (7 días, con navegación entre semanas y botón "Hoy") donde se dibujan los bloques horarios de todas las materias activas con su respectivo color, horario y aula/modalidad.
- **Criterios de aceptación (como usuario)**:
  - Puedo abrir la sección **Calendario** y ver todos mis bloques de cursada ubicados en el día y franja horaria correspondiente con el color de cada materia.
  - Puedo hacer clic en un bloque de clase dentro del calendario y navegar directamente a la página de esa materia.
  - Puedo moverme a la semana siguiente, a la semana anterior o volver a la semana actual con el botón **"Hoy"**.

---

## Fase 2: Tareas (To-Do)

### Tarea 2.1: Gestión de tareas por materia y vista global de Tareas
- **Qué incluye**: Creación, edición, cambio de estado (Pendiente / Completada) y eliminación de tareas asociadas a una materia, con fecha de entrega opcional y prioridad opcional (Baja, Media, Alta). Vista en la pestaña "Tareas" de cada materia y vista global en la sección "Tareas" de la barra lateral con filtros.
- **Criterios de aceptación (como usuario)**:
  - Puedo crear una tarea indicando título, materia, fecha de entrega y prioridad opcional, tanto desde la vista global de **Tareas** como desde adentro de una materia.
  - Puedo marcar una tarea como completada con un solo clic en su casilla y ver que pasa a la lista de completadas; al reabrir la app conserva su estado.
  - Puedo filtrar mis tareas por estado (Pendientes / Completadas / Todas), por materia y ver resaltadas las que vencen hoy o están vencidas.

### Tarea 2.2: Superposición de entregas de tareas en el Calendario semanal
- **Qué incluye**: Integración de las tareas con fecha de entrega dentro de la semana seleccionada en la vista de **Calendario**.
- **Criterios de aceptación (como usuario)**:
  - Cuando creo una tarea con fecha de entrega para un día de la semana, puedo abrir el **Calendario** en esa semana y ver la entrega superpuesta en la cabecera/columna de ese día con el color de su materia y su estado.
  - Puedo marcar o abrir la tarea directamente desde el calendario.

---

## Fase 3: Exámenes + Pantalla de Inicio

### Tarea 3.1: Gestión de Exámenes y notas obtenidas
- **Qué incluye**: Creación, edición y borrado de exámenes por materia (título/instancia, fecha, hora opcional, aula opcional, temas que entran y nota obtenida opcional). Vista en la pestaña "Exámenes" de la materia, vista global de "Exámenes" y superposición destacada en el Calendario semanal.
- **Criterios de aceptación (como usuario)**:
  - Puedo agendar un examen para una materia indicando fecha, temas a evaluar y horario opcional, sin cargar todavía la nota.
  - Puedo ver cuántos días faltan para cada próximo examen y ver el examen destacado en el **Calendario** semanal en la fecha correspondiente.
  - Después de rendir, puedo editar el examen para cargar la nota obtenida (ej. `8.5`) y ver el historial de exámenes rendidos y promedio en la materia.

### Tarea 3.2: Pantalla de Inicio (Conexión de datos en vivo con Bento con Aire)
- **Qué incluye**: Conexión de la pantalla principal **Inicio** (diseñada con el layout confirmado **Bento con Aire** en `DESIGN.md`) con los datos persistidos en SQLite:
  1. **Nivel 1 (Columnas asimétricas)**:
     - **Tareas por vencer**: Tareas pendientes ordenadas por urgencia (vencidas, para hoy y próximos 7 días, con checkbox funcional de completado inmediato y badge de materia).
     - **Próximos exámenes**: Fichas con cuenta regresiva en días, fecha, temas a evaluar y ubicación.
  2. **Nivel 2 (Ancho completo)**:
     - **Pulso de la semana**: Grilla horizontal de 7 días (Lunes a Domingo) calculada dinámicamente con la cantidad de clases, entregas y exámenes de cada día, destacando la fecha actual.
  *(El bloque aislado de "clases de hoy" fue descartado por decisión de diseño para evitar redundancias y mantener la calma visual, integrándose el horario completo en la sección Calendario).*
- **Criterios de aceptación (como usuario)**:
  - Al abrir la app en **Inicio**, veo de un vistazo mis tareas pendientes por vencer, mis próximos exámenes y el balance de carga de mi semana completa en el **Pulso de la semana**.
  - Puedo completar o reabrir una tarea pendiente directamente desde la pantalla de **Inicio** con un solo clic y el cambio se persiste en SQLite.

---

## Fase 4: Notas por Materia + Exportación a Markdown

### Tarea 4.1: Editor Markdown con Preview en vivo, guardado automático y vista global de Notas
- **Qué incluye**: Sección global **Notas** en la barra lateral para acceder a todos los apuntes del cuatrimestre, más la pestaña **Notas** dentro de cada materia, con buscador instantáneo (FTS5 sin distinción de tildes), fijado de notas importantes y editor Markdown (CodeMirror 6) con modos **Editar / Dividido / Lectura**, soporte GFM (tablas, listas de tareas, bloques de código) y guardado automático.
- **Criterios de aceptación (como usuario)**:
  - Puedo acceder a mis notas tanto desde la sección global **Notas** de la barra lateral como desde la pestaña de cada materia, crear una nota nueva y escribir en Markdown viendo el resultado formateado en tiempo real en el panel de preview.
  - Mientras escribo, mis cambios se guardan automáticamente sin tocar ningún botón, y si cierro y reabro la app todo el texto está intacto.
  - Puedo buscar una palabra (con o sin tilde) en el buscador de notas y encontrar al instante las notas que la contienen.

### Tarea 4.2: Exportación de Notas y Materias a Markdown en disco
- **Qué incluye**: Función de exportación a archivos `.md` reales en una carpeta elegida por el usuario (tanto para una nota suelta, una materia entera o toda la cursada desde Ajustes).
- **Criterios de aceptación (como usuario)**:
  - Puedo exportar una materia o toda mi cursada a una carpeta de mi Mac y encontrar archivos `.md` limpios con la información de mis materias, tareas, exámenes y todas mis notas.

---

## Fase 5: Fuentes + Indexado Local

### Tarea 5.1: Conexión con Ollama y configuración de modelos locales
- **Qué incluye**: Panel en **Ajustes → Inteligencia Artificial (Ollama)** que verifica la conexión con `http://localhost:11434`, lista los modelos instalados localmente y permite elegir el **Modelo de Chat** y el **Modelo de Embeddings**.
- **Criterios de aceptación (como usuario)**:
  - Puedo ver en **Ajustes** si Ollama está conectado o desconectado, y elegir de una lista (o escribir) qué modelo local usar para chatear y cuál usar para embeddings.
  - Si Ollama está apagado, la app me muestra un mensaje claro en español explicando cómo iniciarlo sin que la aplicación falle ni se cuelgue.

### Tarea 5.2: Carga de fuentes (PDF, Markdown, TXT, texto pegado) e indexado local
- **Qué incluye**: Pestaña **Fuentes** en cada materia para agregar documentos (`.pdf`, `.md`, `.txt` o pegar texto directo), extracción del texto conservando números de página en los PDFs, división en fragmentos (chunks), generación de embeddings locales vía Ollama y guardado en SQLite (búsqueda vectorial + FTS5).
- **Criterios de aceptación (como usuario)**:
  - Puedo cargar un archivo PDF o de texto en una materia, ver el progreso de indexación y confirmar que pasa al estado **"Indexado"** con la cantidad de páginas y fragmentos procesados.
  - Puedo previsualizar el contenido extraído de una fuente o eliminarla (borrando automáticamente sus fragmentos indexados).

---

## Fase 6: Chat con Citas

### Tarea 6.1: Chat por materia basado en sus fuentes con citas verificables
- **Qué incluye**: Pestaña/panel **Asistente IA (Chat)** dentro de cada materia, recuperación híbrida (embeddings + FTS5) sobre las fuentes de esa materia, generación en *streaming* con Ollama y sistema de citas numeradas `[1]`, `[2]` que indican de qué fuente y página salió cada dato.
- **Criterios de aceptación (como usuario)**:
  - Puedo hacer una pregunta sobre mi materia en el chat y recibir en tiempo real una respuesta en español basada en las fuentes que cargué, con citas numeradas al pie o en el texto.
  - Puedo hacer clic en cualquiera de las citas de la respuesta y ver exactamente el nombre de la fuente, el número de página y el fragmento original del cual salió la información.
  - Puedo guardar cualquier respuesta útil del chat como una **Nota** de la materia con un clic, y mi historial de conversación queda guardado al cerrar y reabrir la app.

---

## Fase 7: Reportes con IA

### Tarea 7.1: Generador de reportes por partes (Resumen, Guía de estudio y Examen de práctica)
- **Qué incluye**: Función de generación de reportes dentro de cada materia seleccionando qué fuentes incluir (o todas) y el tipo de reporte:
  1. **Resumen ejecutivo de las fuentes**
  2. **Guía de estudio estructurada**
  3. **Preguntas de práctica para examen (con respuestas)**
  Utiliza un flujo por etapas (*Map-Reduce*: resumir cada fuente/bloque y luego combinar) pensado para modelos locales con ventana de contexto limitada, mostrando progreso paso a paso y guardando el resultado automáticamente como una **Nota** editable en Markdown.
- **Criterios de aceptación (como usuario)**:
  - Puedo elegir una o varias fuentes largas de mi materia, pedir un **Resumen**, una **Guía de estudio** o **Preguntas de práctica**, y ver el avance etapa por etapa mientras se procesa cada fuente y se combina el resultado.
  - Al finalizar, el reporte generado se guarda automáticamente como una **Nota** dentro de la materia, lista para leer en el preview, editar en Markdown o exportar.

---

## Fase 8: Pulido, Atajos, Notificaciones y Empaquetado `.app`

### Tarea 8.1: Atajos de teclado de macOS y paleta de búsqueda rápida (`Cmd+K`)
- **Qué incluye**: Buscador global rápido con `Cmd+K` (para saltar a cualquier materia, nota, tarea o examen al instante) y atajos nativos (`Cmd+N` para nueva tarea/nota según contexto, `Cmd+1..4` para cambiar de sección, `Cmd+,` para Ajustes).
- **Criterios de aceptación (como usuario)**:
  - Puedo presionar `Cmd+K` desde cualquier lugar de la app, escribir parte del nombre de una materia, nota, tarea o examen, y saltar directamente a ese elemento con `Enter`.

### Tarea 8.2: Notificaciones nativas de macOS y empaquetado final `Cursada.app`
- **Qué incluye**: Recordatorios locales configurables para clases próximas, entregas del día y exámenes cercanos; ícono cuidado de macOS; y compilación verificada del paquete `Cursada.app` listo para instalar en `/Applications`.
- **Criterios de aceptación (como usuario)**:
  - Puedo activar o desactivar recordatorios de próximas clases y exámenes desde Ajustes y probar una notificación nativa de macOS.
  - Puedo abrir el paquete compilado `Cursada.app` en mi MacBook Air M5 como cualquier aplicación nativa de Mac.
