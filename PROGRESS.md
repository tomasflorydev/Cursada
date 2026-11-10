# PROGRESS.md — Estado del Proyecto Cursada

## Estado Actual
- **Fase actual**: Tarea 1 — Planificación y Arquitectura (Completada, aguardando aprobación del Product Owner para iniciar la Fase 1).
- **Última actualización**: 2026-11-10

## Qué está hecho
- [x] **Tarea 1: Planificación inicial y documentación base**
  - Revisión crítica del stack propuesto, riesgos técnicos en macOS (Apple Silicon) y decisiones de arquitectura documentadas.
  - Diseño completo del modelo de datos en SQLite (materias, horarios recurrentes, tareas, exámenes, notas con FTS5, fuentes, fragmentos vectoriales y conversaciones con citas).
  - Creación de `AGENTS.md` con reglas de trabajo, convenciones, comandos y políticas de seguridad de datos (backups automáticos y bases temporales en tests).
  - Creación de `ARCHITECTURE.md` con decisiones justificadas, esquema SQLite y estructura de carpetas.
  - Creación de `ROADMAP.md` con las 8 fases desglosadas en tareas pequeñas y criterios de aceptación redactados como acciones de usuario.
  - Creación de `PROGRESS.md` para seguimiento continuo entre sesiones.

## Qué sigue (Próximos pasos tras aprobación)
- [ ] **Fase 1: Base del proyecto + Materias + Horario semanal de clases**
  - [ ] **Tarea 1.1**: Inicializar proyecto Tauri 2 + React + Vite + TypeScript (`com.cursada.app`), base SQLite con migraciones, servicio de backups automáticos y layout principal claro/oscuro.
  - [ ] **Tarea 1.2**: Implementar CRUD completo de Materias y bloques de horario semanal recurrente con sus tests de backend y frontend.
  - [ ] **Tarea 1.3**: Implementar vista de Calendario con grilla de horario semanal de clases y navegación por semanas.

## Problemas conocidos / Notas del entorno
- **Toolchain de Rust**: Node.js (`v26.7.0`), `npm` (`11.19.0`) y Xcode Command Line Tools (`clang 21`) están instalados en el MacBook Air M5, pero `rustup` / `cargo` aún no está instalado. Se consultó al Product Owner si prefiere que instalemos Rust al iniciar la Fase 1 para Tauri 2 o usar Electron + TypeScript.
- **Ollama**: No se detectó el binario `ollama` en el `PATH` actual; la app incluirá detección amigable de estado y guía de conexión para las Fases 5–7.
