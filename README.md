# Cursada (`com.cursada.app`)

Aplicación de escritorio **100% local y offline-first para macOS** orientada a estudiantes universitarios. Combina organización académica (materias, horarios semanales, calendario mensual/semanal, tareas, exámenes con promedio y control de asistencias) con un espacio de estudio estilo cuaderno (**Super-Editor Markdown** con Live Preview, fórmulas $\LaTeX$/KaTeX offline, enlaces `[[WikiLinks]]` / backlinks, importación desde Obsidian, temporizador Pomodoro, simulacro interactivo de exámenes y chat/reportes con IA local vía **Ollama**).

## Requisitos

- **macOS** (diseñada para Apple Silicon).
- **Node.js 22+ / 24** (Electron `44.11.0` utiliza `node:sqlite` embebido).
- **Ollama** (opcional, para IA local en `http://localhost:11434` con liberación inmediata `keep_alive: '0s'`).
- **Herramientas opcionales para regenerar íconos `.icns`:** `librsvg` (`brew install librsvg`) + `iconutil` (incluido en macOS).

## Instalación y Comandos

```bash
# Instalar dependencias
npm install

# Iniciar la aplicación completa en desarrollo (Vite + Electron)
npm run dev

# Iniciar solo el frontend web con datos mock (útil en navegador)
npm run dev:web

# Verificar tipos de TypeScript (frontend + proceso principal Electron)
npm run typecheck

# Ejecutar la suite completa de tests automatizados (Vitest + SQLite aislado)
npm test

# Compilar build de producción (frontend + Electron main + preload sandboxed)
npm run build

# Generar el paquete nativo release/Cursada.app
npm run package
```

## Datos Locales y Backups

Todos los datos académicos y preferencias del usuario se almacenan localmente en:

```text
~/Library/Application Support/com.cursada.app/
├── cursada.sqlite   # Base de datos SQLite (WAL + FTS5 + migraciones v1..v8)
├── backups/         # Backups automáticos (VACUUM INTO, rotación de últimos 15)
└── sources/         # Copias locales de PDFs y fuentes indexadas por materia
```

- Podés sobreescribir este directorio en desarrollo o pruebas mediante la variable de entorno `CURSADA_DATA_DIR`.
- Se realizan backups automáticos al iniciar la app (si pasaron $\ge$ 24 h), antes de cada migración de esquema y antes de eliminar una materia.

## Seguridad y Privacidad

- **Electron endurecido:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` con preload compilado a CommonJS (`dist-electron/preload.cjs`) y política `Content-Security-Policy` (CSP) estricta.
- **Navegación y permisos bloqueados:** Bloqueo de popups y navegación externa dentro del WebView; enlaces `http:`/`https:` se delegan al navegador del sistema tras validar protocolo; permisos de cámara/micrófono/geolocalización denegados por defecto.
- **IPC y archivos:** Verificación de origen de invocaciones IPC y uso obligatorio de diálogos nativos de macOS para seleccionar carpetas/archivos en producción.
- **Credenciales y red:** Tokens OAuth2 de Google Calendar cifrados en reposo mediante **macOS Keychain (`safeStorage`)**; Ollama restringido por defecto a hosts locales (`localhost`, `127.0.0.1`, `::1`, `.local`); protección anti-SSRF y límite de 5 MB para suscripciones `.ics`.

## Atajos Principales

- `⌘K`: Paleta rápida de comandos y búsqueda global.
- `⌘1` – `⌘6`: Navegación rápida entre secciones principales.
- `⌘N`: Alta contextual según la vista activa.
- `⌘,`: Abrir **Ajustes**.

## Documentación del Proyecto

- [ARCHITECTURE.md](ARCHITECTURE.md): Arquitectura técnica, esquema SQLite (`v8`) y decisiones de seguridad.
- [DESIGN.md](DESIGN.md): Guía visual Suiza (paleta, tipografía `@fontsource/archivo`, temas claro/oscuro y tokens).
- [PROGRESS.md](PROGRESS.md): Estado de implementación e historial de fases y correcciones.
- [ROADMAP.md](ROADMAP.md): Hoja de ruta de producto por fases.
- [AGENTS.md](AGENTS.md): Convenciones y reglas operativas del repositorio.
