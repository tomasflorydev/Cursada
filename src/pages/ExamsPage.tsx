import { useCallback, useEffect, useRef, useState } from 'react';
import { calculateAverageFromExams, ExamList } from '../components/exams/ExamList';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';

export interface ExamsPageProps {
  onSelectCourse: (courseId: string | null) => void;
  onExamsChanged?: () => void;
  referenceDate?: Date;
  externalCreateVersion?: number;
}

export function ExamsPage({
  onSelectCourse,
  onExamsChanged,
  referenceDate,
  externalCreateVersion = 0,
}: ExamsPageProps) {
  const [upcomingCount, setUpcomingCount] = useState<number>(0);
  const [overallAverage, setOverallAverage] = useState<number | null>(null);
  const [createRequestVersion, setCreateRequestVersion] = useState<number>(0);
  const lastExternalCreateVersionRef = useRef<number>(0);

  useEffect(() => {
    if (
      externalCreateVersion > 0 &&
      externalCreateVersion !== lastExternalCreateVersionRef.current
    ) {
      lastExternalCreateVersionRef.current = externalCreateVersion;
      setCreateRequestVersion((v) => v + 1);
    } else if (externalCreateVersion === 0) {
      lastExternalCreateVersionRef.current = 0;
    }
  }, [externalCreateVersion]);

  const loadSummary = useCallback(async () => {
    const allExams = await cursadaClient.listExams();
    const ungraded = allExams.filter((e) => e.grade === null).length;
    setUpcomingCount(ungraded);
    setOverallAverage(calculateAverageFromExams(allExams));
  }, []);

  useEffect(() => {
    let active = true;
    void cursadaClient.listExams().then((allExams) => {
      if (!active) return;
      setUpcomingCount(allExams.filter((e) => e.grade === null).length);
      setOverallAverage(calculateAverageFromExams(allExams));
    });

    const handleDataChanged = () => {
      void loadSummary();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadSummary]);

  function handleExamsChanged(): void {
    void loadSummary();
    onExamsChanged?.();
  }

  return (
    <div className="basic-view exams-page">
      <header className="page-header">
        <div className="page-header-titles">
          <div className="page-date-row">
            <span className="page-date-text">Parciales, TPs evaluativos y finales</span>
            <span className="page-week-pill">
              {upcomingCount} {upcomingCount === 1 ? 'próximo' : 'próximos'}
            </span>
            {overallAverage !== null ? (
              <span className="tasks-summary-pill">
                Promedio general {overallAverage.toFixed(1)}
              </span>
            ) : null}
          </div>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Exámenes
          </h1>
          <p className="page-subtitle">
            Instancias de evaluación por materia, cuenta regresiva en días y registro de
            calificaciones en escala de 1 a 10.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => setCreateRequestVersion((v) => v + 1)}
        >
          Agendar examen
        </button>
      </header>

      <ExamList
        onSelectCourse={onSelectCourse}
        onExamsChanged={handleExamsChanged}
        showCreateButton={false}
        createRequestVersion={createRequestVersion}
        referenceDate={referenceDate}
      />
    </div>
  );
}
