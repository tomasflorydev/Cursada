import { CursadaMark } from '../components/brand/CursadaMark';
import { PomodoroHeaderWidget } from '../components/pomodoro/PomodoroHeaderWidget';
import type { NavSectionId } from '../types/design';

export interface SwissHeaderNavItem {
  id: NavSectionId;
  label: string;
}

export const SWISS_NAV_ITEMS: readonly SwissHeaderNavItem[] = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'materias', label: 'Materias' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'tareas', label: 'Tareas' },
  { id: 'examenes', label: 'Exámenes' },
  { id: 'informes', label: 'Informes' },
];

export interface SwissCourseDetailHeader {
  name: string;
  summary: string;
  onBack: () => void;
}

export interface SwissHeaderProps {
  activeSection: NavSectionId;
  onSelectSection: (section: NavSectionId) => void;
  courseDetail?: SwissCourseDetailHeader | null;
  activeCourseId?: string | null;
  activeCourseName?: string | null;
}

export function SwissHeader({
  activeSection,
  onSelectSection,
  courseDetail,
  activeCourseId = null,
  activeCourseName = null,
}: SwissHeaderProps) {
  if (courseDetail) {
    return (
      <header className="swiss-header" role="banner">
        <div className="swiss-header-detail-left">
          <button
            type="button"
            className="swiss-header-back"
            onClick={courseDetail.onBack}
          >
            ← Inicio
          </button>
          <span className="swiss-header-detail-course">{courseDetail.name}</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexShrink: 0,
          }}
        >
          <div className="swiss-header-detail-meta">{courseDetail.summary}</div>
          <PomodoroHeaderWidget
            activeCourseId={activeCourseId}
            activeCourseName={activeCourseName ?? courseDetail.name}
          />
        </div>
      </header>
    );
  }

  return (
    <header className="swiss-header" role="banner">
      <button
        type="button"
        className="swiss-header-wordmark"
        aria-label="Cursada"
        onClick={() => onSelectSection('inicio')}
      >
        <CursadaMark size={24} />
        <span className="swiss-header-wordmark-text">
          Cursada<span className="swiss-header-wordmark-dot">.</span>
        </span>
      </button>

      <nav aria-label="Navegación principal">
        <ul className="swiss-nav">
          {SWISS_NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`swiss-nav-btn ${isActive ? 'is-active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectSection(item.id)}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexShrink: 0,
        }}
      >
        <PomodoroHeaderWidget
          activeCourseId={activeCourseId}
          activeCourseName={activeCourseName}
        />
        <button
          type="button"
          className={`swiss-header-settings-btn ${activeSection === 'ajustes' ? 'is-active' : ''}`}
          aria-current={activeSection === 'ajustes' ? 'page' : undefined}
          onClick={() => onSelectSection('ajustes')}
        >
          Ajustes
        </button>
      </div>
    </header>
  );
}
