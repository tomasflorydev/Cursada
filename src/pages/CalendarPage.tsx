import { useCallback, useEffect, useMemo, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import {
  addWeeks,
  formatWeekRangeEs,
  getWeekDaysMondayToSunday,
  timeToMinutes,
} from '../lib/dates';
import type { CourseColor, CourseWithSchedules, DayOfWeek } from '../types/domain';

export interface CalendarPageProps {
  onSelectCourse: (courseId: string | null) => void;
  initialDate?: Date;
}

interface CalendarClassBlock {
  scheduleId: string;
  courseId: string;
  courseName: string;
  courseColor: CourseColor;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  location: string;
}

export function CalendarPage({
  onSelectCourse,
  initialDate,
}: CalendarPageProps) {
  const [referenceDate, setReferenceDate] = useState<Date>(
    () => initialDate ?? new Date()
  );
  const [activeCourses, setActiveCourses] = useState<CourseWithSchedules[]>([]);

  const loadActiveCourses = useCallback(async () => {
    const loaded = await cursadaClient.listCourses({ status: 'active' });
    setActiveCourses(loaded);
  }, []);

  useEffect(() => {
    void loadActiveCourses();

    const handleDataChanged = () => {
      void loadActiveCourses();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadActiveCourses]);

  const weekDays = useMemo(
    () => getWeekDaysMondayToSunday(referenceDate),
    [referenceDate]
  );

  const weekRangeLabel = useMemo(
    () => formatWeekRangeEs(referenceDate),
    [referenceDate]
  );

  const blocksByDay = useMemo(() => {
    const map = new Map<DayOfWeek, CalendarClassBlock[]>([
      [1, []],
      [2, []],
      [3, []],
      [4, []],
      [5, []],
      [6, []],
      [7, []],
    ]);

    for (const course of activeCourses) {
      for (const sched of course.schedules) {
        const list = map.get(sched.dayOfWeek);
        if (list) {
          list.push({
            scheduleId: sched.id,
            courseId: course.id,
            courseName: course.name,
            courseColor: course.color,
            dayOfWeek: sched.dayOfWeek,
            startTime: sched.startTime,
            endTime: sched.endTime,
            location: sched.location,
          });
        }
      }
    }

    for (const [day, list] of map.entries()) {
      list.sort((a, b) => {
        const diff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
        if (diff !== 0) {
          return diff;
        }
        return a.courseName.localeCompare(b.courseName);
      });
      map.set(day, list);
    }

    return map;
  }, [activeCourses]);

  function handlePrevWeek(): void {
    setReferenceDate((prev) => addWeeks(prev, -1));
  }

  function handleNextWeek(): void {
    setReferenceDate((prev) => addWeeks(prev, 1));
  }

  function handleToday(): void {
    setReferenceDate(initialDate ?? new Date());
  }

  return (
    <div className="basic-view calendar-page-view">
      <header className="page-header">
        <div className="page-header-titles">
          <div className="page-date-row">
            <span className="page-date-text" data-testid="calendar-week-range">
              {weekRangeLabel}
            </span>
            <span className="page-week-pill">Lunes a Domingo</span>
          </div>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Calendario
          </h1>
          <p className="page-subtitle">
            Horario semanal de cursada de tus materias activas. Hacé clic en cualquier bloque de
            clase para abrir la ficha de su materia.
          </p>
        </div>

        <div className="basic-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={handlePrevWeek}
          >
            Semana anterior
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleToday}
          >
            Hoy
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleNextWeek}
          >
            Semana siguiente
          </button>
        </div>
      </header>

      <section
        className="surface-panel calendar-skeleton-panel calendar-week-grid-panel"
        aria-label="Grilla semanal de cursada"
      >
        <div className="calendar-skeleton-header">
          {weekDays.map((day) => (
            <div
              key={day.dateIso}
              className={`calendar-col-head ${day.isToday ? 'is-today' : ''}`}
              data-date={day.dateIso}
            >
              <span className="week-day-short" title={day.dayName}>
                {day.dayShort}
              </span>
              <span className="week-day-num">{day.dayNumber}</span>
            </div>
          ))}
        </div>

        <div className="calendar-skeleton-body">
          {weekDays.map((day) => {
            const dayBlocks = blocksByDay.get(day.dayOfWeek) ?? [];
            const emptyLabel =
              day.dayOfWeek === 6
                ? 'Sábado libre'
                : day.dayOfWeek === 7
                  ? 'Domingo libre'
                  : 'Sin clases';

            return (
              <div
                key={day.dateIso}
                className={`calendar-day-col ${day.isToday ? 'is-today' : ''}`}
                data-date={day.dateIso}
                data-day-of-week={day.dayOfWeek}
              >
                {dayBlocks.length === 0 ? (
                  <span className="calendar-empty-slot">{emptyLabel}</span>
                ) : (
                  dayBlocks.map((block) => (
                    <button
                      key={block.scheduleId}
                      type="button"
                      className="calendar-block calendar-block-button"
                      data-course-color={block.courseColor}
                      data-course-id={block.courseId}
                      onClick={() => onSelectCourse(block.courseId)}
                    >
                      <span className="calendar-block-time">
                        {block.startTime} – {block.endTime}
                      </span>
                      <strong className="calendar-block-title">
                        {block.courseName}
                      </strong>
                      {block.location ? (
                        <span className="calendar-block-location">
                          {block.location}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div
        className="calendar-legend"
        role="list"
        aria-label="Referencias de materias activas"
      >
        {activeCourses.map((c) => (
          <button
            key={c.id}
            type="button"
            role="listitem"
            className="course-pill calendar-legend-pill"
            data-course-color={c.color}
            onClick={() => onSelectCourse(c.id)}
          >
            <span
              className="course-dot"
              data-course-color={c.color}
              aria-hidden="true"
            />
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
