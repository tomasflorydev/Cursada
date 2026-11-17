import type { RefObject } from 'react';
import { EditorShortcutsSettingsSection } from './EditorShortcutsSettingsSection';

const KEYBOARD_SHORTCUTS: ReadonlyArray<{
  keys: string;
  title: string;
  description: string;
}> = [
  {
    keys: '⌘K',
    title: 'Paleta de comandos',
    description: 'Buscar materias, notas, entregas, exámenes o acciones rápidas.',
  },
  {
    keys: '⌘N',
    title: 'Nuevo elemento contextual',
    description: 'Crea nota, tarea, examen o materia según la sección activa.',
  },
  {
    keys: '⌘1',
    title: 'Ir a Inicio',
    description: 'Abre el resumen de hoy y los próximos vencimientos.',
  },
  {
    keys: '⌘2',
    title: 'Ir a Materias',
    description: 'Abre el listado de materias y anotadores.',
  },
  {
    keys: '⌘3',
    title: 'Ir a Calendario',
    description: 'Abre la grilla semanal y mensual de cursada.',
  },
  {
    keys: '⌘4',
    title: 'Ir a Tareas',
    description: 'Abre la lista general de entregas pendientes.',
  },
  {
    keys: '⌘5',
    title: 'Ir a Exámenes',
    description: 'Abre los próximos parciales, finales y guías.',
  },
  {
    keys: '⌘6',
    title: 'Ir a Informes',
    description: 'Abre los informes y resúmenes generados con citas.',
  },
  {
    keys: '⌘,',
    title: 'Ir a Ajustes',
    description: 'Abre las preferencias generales, de IA y de datos.',
  },
];

export interface SettingsShortcutsSectionProps {
  sectionRef: RefObject<HTMLElement | null>;
}

/**
 * Keyboard shortcuts overview and customizable Markdown editor shortcuts section.
 */
export function SettingsShortcutsSection({
  sectionRef,
}: SettingsShortcutsSectionProps) {
  return (
    <section
      ref={sectionRef}
      id="settings-shortcuts"
      className="settings-section-block"
      aria-labelledby="settings-shortcuts-heading"
    >
      <h2
        id="settings-shortcuts-heading"
        className="settings-section-block-head"
      >
        Atajos de teclado
      </h2>

      <div>
        {KEYBOARD_SHORTCUTS.map((shortcut) => (
          <div key={shortcut.keys} className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">{shortcut.title}</div>
              <div className="settings-row-desc">{shortcut.description}</div>
            </div>
            <div
              className="settings-row-control"
              style={{ justifyContent: 'flex-end' }}
            >
              <kbd style={{ fontWeight: 600 }}>{shortcut.keys}</kbd>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '24px' }}>
        <EditorShortcutsSettingsSection />
      </div>
    </section>
  );
}
