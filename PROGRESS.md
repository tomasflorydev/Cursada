# PROGRESS.md — Estado del Proyecto Cursada

## Estado Actual
- **Fase actual**: Diseño Base Finalizado y Aprobado (`DESIGN.md`). Listo para dar inicio a la **Fase 1** (Esqueleto de la app, base de datos SQLite y CRUD de materias con horarios).
- **Última actualización**: 2026-11-10

## Decisiones de Diseño Base Confirmadas
1. **Layout de Inicio**: **Bento con Aire** (estructurado en 2 niveles: tareas por vencer y próximos exámenes en columnas asimétricas, más el pulso de la semana al pie; sin bloque de clases de hoy en inicio).
2. **Paleta de Colores**: **Paleta 1 (Pizarra & Índigo)**, con modo oscuro en grises suaves de pizarra (`#21262D` / `#282E37`, cero negro puro) y modo claro alabastro (`#F6F8FA`). Acentos en índigo suave (`#748FFC` / `#3B5BDB`) y 8 colores tenues por materia.
3. **Tipografía**: Pila nativa de **macOS** (`SF Pro Display`, `SF Pro Text` y `SF Mono` con números tabulares).
4. **Espaciado y jerarquía**: Mucho aire visual, márgenes y paddings amplios, tarjetas sutiles y listas limpias.

## Decisiones Técnicas y de Dominio Confirmadas
1. **Stack**: Electron + React + Vite + TypeScript + SQLite nativo (`node:sqlite` con FTS5 y `VACUUM INTO`).
2. **Cuatrimestres**: Materias del cuatrimestre actual visibles + cuatrimestres anteriores en archivo.
3. **Horarios y Calendario**: Campo opcional de Aula/Sede/Modalidad en cada horario; grilla semanal de **Lunes a Domingo**.
4. **Tareas**: Dos estados simples (**Pendiente** / **Completada**); asociadas obligatoriamente a una materia.
5. **Exámenes**: Escala de **1 a 10**, categorías (**Parcial, Recuperatorio, Final, TP evaluativo**) y cálculo de promedio.
6. **IA (Fuentes y Reportes)**: Soporte para archivos (`.pdf`, `.md`, `.txt`) + pegar texto directo; selector de formato en preguntas de práctica.

## Qué sigue
- [ ] Confirmar inicio de la **Fase 1: Tarea 1.1** (Conexión SQLite, migraciones, ventana Electron con semáforos integrados y backups automáticos).
