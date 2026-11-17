import { useRef, useState } from 'react';
import { SettingsAiSection } from '../components/settings/SettingsAiSection';
import { SettingsAppearanceSection } from '../components/settings/SettingsAppearanceSection';
import { SettingsDataSection } from '../components/settings/SettingsDataSection';
import { SettingsGeneralSection } from '../components/settings/SettingsGeneralSection';
import { SettingsShortcutsSection } from '../components/settings/SettingsShortcutsSection';
import type { NoteFontSize, ThemeMode } from '../types';

export interface SettingsPageProps {
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  noteFontSize?: NoteFontSize;
  onChangeNoteFontSize?: (size: NoteFontSize) => void;
}

type SettingsCategoryId = 'general' | 'ai' | 'appearance' | 'data' | 'shortcuts';

const SETTINGS_CATEGORIES: ReadonlyArray<{
  id: SettingsCategoryId;
  label: string;
}> = [
  { id: 'general', label: 'General' },
  { id: 'ai', label: 'Inteligencia artificial' },
  { id: 'appearance', label: 'Apariencia' },
  { id: 'data', label: 'Datos' },
  { id: 'shortcuts', label: 'Atajos de teclado' },
];

export function SettingsPage({
  themeMode,
  onChangeThemeMode,
  noteFontSize = 'normal',
  onChangeNoteFontSize,
}: SettingsPageProps) {
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategoryId>('general');
  const [fallbackNoteFontSize, setFallbackNoteFontSize] =
    useState<NoteFontSize>(noteFontSize);

  const generalRef = useRef<HTMLElement | null>(null);
  const aiRef = useRef<HTMLElement | null>(null);
  const appearanceRef = useRef<HTMLElement | null>(null);
  const dataRef = useRef<HTMLElement | null>(null);
  const shortcutsRef = useRef<HTMLElement | null>(null);

  const effectiveNoteFontSize = onChangeNoteFontSize
    ? noteFontSize
    : fallbackNoteFontSize;

  function handleSelectCategory(cat: SettingsCategoryId): void {
    setActiveCategory(cat);
    const refMap: Record<SettingsCategoryId, HTMLElement | null> = {
      general: generalRef.current,
      ai: aiRef.current,
      appearance: appearanceRef.current,
      data: dataRef.current,
      shortcuts: shortcutsRef.current,
    };
    const target = refMap[cat];
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleChangeNoteFontSize(next: NoteFontSize): void {
    if (onChangeNoteFontSize) {
      onChangeNoteFontSize(next);
    } else {
      setFallbackNoteFontSize(next);
    }
  }

  return (
    <section aria-labelledby="main-title" className="swiss-grid">
      <aside className="swiss-col-3">
        <h1
          id="main-title"
          tabIndex={-1}
          className="swiss-screen-title"
          style={{ marginBottom: '28px' }}
        >
          Ajustes
        </h1>

        <nav aria-label="Categorías de ajustes">
          {SETTINGS_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`swiss-list-row ${
                activeCategory === cat.id ? 'is-selected' : ''
              }`.trim()}
              aria-current={activeCategory === cat.id ? 'true' : undefined}
              onClick={() => handleSelectCategory(cat.id)}
            >
              <span>{cat.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="swiss-col-9">
        <SettingsGeneralSection sectionRef={generalRef} />
        <SettingsAiSection sectionRef={aiRef} />
        <SettingsAppearanceSection
          sectionRef={appearanceRef}
          themeMode={themeMode}
          onChangeThemeMode={onChangeThemeMode}
          noteFontSize={effectiveNoteFontSize}
          onChangeNoteFontSize={handleChangeNoteFontSize}
        />
        <SettingsDataSection sectionRef={dataRef} />
        <SettingsShortcutsSection sectionRef={shortcutsRef} />
      </div>
    </section>
  );
}
