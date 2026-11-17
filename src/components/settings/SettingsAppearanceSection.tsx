import type { RefObject } from 'react';
import type { NoteFontSize, ThemeMode } from '../../types';
import { SwissSegmented } from '../../ui';

export interface SettingsAppearanceSectionProps {
  sectionRef: RefObject<HTMLElement | null>;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  noteFontSize: NoteFontSize;
  onChangeNoteFontSize: (size: NoteFontSize) => void;
}

/**
 * Appearance settings section controlling theme mode and editor font scale.
 */
export function SettingsAppearanceSection({
  sectionRef,
  themeMode,
  onChangeThemeMode,
  noteFontSize,
  onChangeNoteFontSize,
}: SettingsAppearanceSectionProps) {
  return (
    <section
      ref={sectionRef}
      id="settings-appearance"
      className="settings-section-block"
      aria-labelledby="settings-appearance-heading"
    >
      <h2
        id="settings-appearance-heading"
        className="settings-section-block-head"
      >
        Apariencia
      </h2>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Tema</div>
          <div className="settings-row-desc">
            Alterná entre papel claro, grafito oscuro o la preferencia de macOS.
          </div>
        </div>
        <div className="settings-row-control">
          <SwissSegmented<ThemeMode>
            ariaLabel="Tema de la aplicación"
            value={themeMode}
            onChange={onChangeThemeMode}
            options={[
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
              { value: 'system', label: 'Sistema' },
            ]}
          />
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Tamaño de texto de notas</div>
          <div className="settings-row-desc">
            Escala tipográfica del cuerpo al leer o escribir apuntes.
          </div>
        </div>
        <div className="settings-row-control">
          <SwissSegmented<NoteFontSize>
            ariaLabel="Tamaño de texto de notas"
            value={noteFontSize}
            onChange={onChangeNoteFontSize}
            options={[
              { value: 'small', label: 'Chico' },
              { value: 'normal', label: 'Normal' },
              { value: 'large', label: 'Grande' },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
