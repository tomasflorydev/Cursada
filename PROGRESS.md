# PROGRESS.md — Estado del Proyecto Cursada

## Estado Actual
- **Fase actual**: Tarea de Diseño Base previa a la Fase 1 (`DESIGN.md` + esqueleto de la app con barra lateral, pantalla de Inicio completa con 3 variantes de diseño intercambiables y vistas básicas).
- **Última actualización**: 2026-11-10

## Avances Completados
- [x] Redacción de `DESIGN.md` con principios visuales, paleta de colores (modo claro Alabastro y modo oscuro Obsidiana), 8 colores de acento por materia, tipografía, espaciados, componentes y 3 variantes de diseño para Inicio.
- [x] Construcción del esqueleto de la aplicación en React + Vite + TypeScript + CSS nativo modular (`color-scheme: light dark` y `light-dark()`), sin lógica de negocio ni base de datos conectada aún.
- [x] Barra lateral nativa macOS con las secciones **Inicio**, **Calendario**, **Tareas**, **Exámenes**, **Notas** y **Materias**, más accesos directos a las materias del cuatrimestre actual.
- [x] Pantalla de **Inicio** completa con datos de ejemplo reales (clases de hoy, tareas por vencer, próximos exámenes, pulso semanal) y selector en vivo entre **Variante A (Bento)**, **Variante B (Agenda)** y **Variante C (Editorial)**.

## Decisiones de Producto y Stack Confirmadas
1. **Stack**: Electron + React + Vite + TypeScript + SQLite nativo (`node:sqlite` con FTS5 y `VACUUM INTO`).
2. **Cuatrimestres**: Materias del cuatrimestre actual visibles + cuatrimestres anteriores en sección de archivo.
3. **Horarios y Calendario**: Campo opcional de Aula/Sede/Modalidad en cada horario; grilla semanal de **Lunes a Domingo**.
4. **Tareas**: Dos estados simples (**Pendiente** / **Completada**); todas las tareas pertenecen obligatoriamente a una materia.
5. **Exámenes**: Escala de **1 a 10**, categorías (**Parcial, Recuperatorio, Final, TP evaluativo**) y cálculo de promedio en la vista de la materia.
6. **IA (Fuentes y Reportes)**: Soporte para archivos (`.pdf`, `.md`, `.txt`) + **pegar texto directo**; selector de formato al generar **Preguntas de práctica** (a desarrollar, multiple choice o mixto).

## Qué sigue
- [ ] Revisar el diseño base y elegir la variante preferida de la pantalla de **Inicio** con el Product Owner.
- [ ] Confirmar el arranque de la **Fase 1** (`ROADMAP.md`).
