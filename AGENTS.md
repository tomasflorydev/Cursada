# AGENTS.md — Reglas y Convenciones de Cursada

## 1. Identidad del Proyecto
- **Nombre del proyecto y la app**: `Cursada`
- **Identificador del bundle de macOS**: `com.cursada.app`
- **Plataforma objetivo**: macOS (Apple Silicon — MacBook Air M5), 100% local, sin servicios en la nube.
- **Idioma**:
  - **Interfaz de usuario (UI), documentación (`*.md`) y comunicación con el usuario**: Español (variante rioplatense/argentina natural en el trato; textos de UI claros, concisos y neutros en español académico: "Materias", "Cuatrimestre", "Parcial", "Final", "Entrega").
  - **Código fuente, identificadores, nombres de tablas/columnas, comentarios de código y mensajes de commit**: Inglés.

## 2. Roles y Forma de Trabajo
- **Product Owner (Usuario)**: Define qué se construye, resuelve dudas de producto/UX y valida cada fase probando la aplicación como usuario final mediante una checklist corta. No escribe ni revisa código.
- **Agente (Desarrollador Full-Stack responsable)**: Escribe el 100% del código, las migraciones, los tests automatizados y la documentación técnica.
- **Autonomía técnica**: El agente decide librerías internas, estructura de módulos y patrones técnicos, dejando toda decisión relevante justificada en `ARCHITECTURE.md`. Solo se consulta al Product Owner cuando una decisión afecta lo que el usuario ve o usa (funcionalidades, comportamiento o diseño).

## 3. Regla de Oro: Verificación Obligatoria
Nunca dar una tarea o fase por terminada sin haber ejecutado y verificado personalmente:
1. **Typecheck**: Sin errores de compilación en TypeScript (`npm run typecheck`).
2. **Tests Automatizados (Backend + Frontend)**: Todos los tests de base de datos, repositorios, servicios, componentes y vistas en verde (`npm test`).
3. **Build y Arranque**: Comprobar que el build compila (`npm run build`) y que la aplicación Electron arranca sin errores en tiempo de ejecución.
4. Si algo falla en cualquiera de estos pasos, el agente debe diagnosticarlo y corregirlo antes de reportar avance.

## 4. Seguridad de los Datos del Usuario
Los datos académicos del usuario (materias, apuntes, notas, tareas, exámenes y fuentes) son críticos:
- **Aislamiento estricto en tests**: Todo test automatizado (unitario o de integración) **DEBE** ejecutarse contra una base de datos SQLite en memoria (`:memory:`) o en un archivo temporal (`fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-test-'))`). Está terminantemente prohibido que un test lea, modifique o borre la base de datos real en `~/Library/Application Support/com.cursada.app/`.
- **Backups automáticos**:
  - Se realiza un backup automático de la base de datos SQLite al iniciar la app (si pasaron ≥ 24 h desde el último) y **siempre antes de aplicar una migración de esquema**.
  - Se conservan los últimos 15 backups rotativos en `~/Library/Application Support/com.cursada.app/backups/`.
- **Migraciones aditivas y seguras**: Nunca hacer `DROP TABLE` ni borrar columnas con datos de usuario en migraciones sin respaldo previo.
- **Comandos destructivos prohibidos**: No ejecutar `rm -rf`, `git reset --hard` ni borrar archivos del usuario sin permiso explícito.

## 5. Convenciones de Código y Arquitectura
- **Frontend (Renderer Process)**:
  - React + Vite + TypeScript + CSS nativo modular / variables CSS (sin Tailwind, salvo pedido explícito).
  - Diseño minimalista y nativo de macOS, inspirado en la claridad de Notion pero con estructura fija y pensada para la facultad.
  - Soporte completo para **Modo Claro y Modo Oscuro** siguiendo la preferencia del sistema (`prefers-color-scheme`) o el selector manual en Ajustes.
  - Componentes pequeños, legibles y con responsabilidades claras. Evitar abstracciones prematuras.
  - Toda llamada al backend pasa por una capa cliente tipada (`src/lib/api/`) a través del puente seguro `contextBridge` de Electron (`window.cursadaApi`), con fallback en memoria/mock cuando se corre en modo navegador o test de UI aislado.
- **Backend (Electron Main Process / Node.js + `node:sqlite`)**:
  - Arquitectura en capas claras: `ipc` (IPC handlers) → `services` (lógica de negocio, chunking, RAG, backups, exportación) → `db` (repositorios SQLite con `node:sqlite` y migraciones).
  - Consultas SQL **100% parametrizadas**. Prohibido concatenar strings para armar SQL.
  - Validación de entrada en el backend (nombres no vacíos, rangos horarios válidos `start_time < end_time`, fechas válidas, notas en escala 1–10).

## 6. Comandos del Proyecto

```bash
# Instalar dependencias
npm install

# Ejecutar la app en modo desarrollo (Vite + Electron)
npm run dev

# Ejecutar solo el servidor de Vite (frontend)
npm run dev:web

# Verificar tipos de TypeScript (frontend + electron)
npm run typecheck

# Ejecutar todos los tests automatizados (backend SQLite temporal + frontend React)
npm test

# Compilar frontend y proceso principal de Electron
npm run build

# Construir el paquete .app para macOS
npm run package
```

## 7. Flujo de Trabajo y Git
- Trabajar tarea por tarea según lo definido en `ROADMAP.md`.
- Al completar y verificar cada tarea:
  1. Actualizar `PROGRESS.md` reflejando qué se completó, el estado actual y qué sigue.
  2. Hacer un commit pequeño y enfocado con formato Conventional Commits en inglés:
     - `feat: add course creation and weekly schedule persistence`
     - `fix: prevent overlapping time validation on midnight boundary`
     - `test: add integration tests for markdown export`
     - `docs: update progress after phase 1 completion`
- Nunca hacer `git push`, `git push --force` ni reescribir el historial salvo pedido explícito del Product Owner.
- Al finalizar cada Fase del `ROADMAP.md`, frenar y entregar al Product Owner una **checklist corta de prueba manual** antes de pasar a la siguiente fase.
