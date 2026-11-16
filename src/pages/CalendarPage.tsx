import { useCallback, useEffect, useMemo, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import {
  addDays,
  addMonths,
  addWeeks,
  DAY_NAMES_ES,
  DAY_SHORT_NAMES_ES,
  formatMonthYearEs,
  getMonthCalendarGrid,
  getStartOfWeekMonday,
  getWeekDaysMondayToSunday,
  MONTH_NAMES_ES,
  MONTH_SHORT_NAMES_ES,
  parseIsoDateLocal,
  timeToMinutes,
  toIsoDateString,
} from '../lib/dates';
import type { NavSectionId } from '../types';
import type {
  CourseWithSchedules,
  DayOfWeek,
  ExamCategory,
  ExamWithCourse,
  TaskWithCourse,
} from '../types/domain';
import {
  SwissButton,
  SwissEmptyState,
  SwissErrorAlert,
  SwissLinkButton,
  SwissSectionHeader,
  SwissSegmented,
} from '../ui';

export interface CalendarPageProps {
  onSelectCourse: (courseId: string | null) => void;
  onNavigateSection?: (section: NavSectionId) => void;
  initialDate?: Date;
  initialViewMode?: 'month' | 'week';
}

interface CalendarClassBlock {
  scheduleId: string;
  courseId: string;
  courseName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  location: string;
  startMinutes: number;
  endMinutes: number;
}

interface PositionedBlock extends CalendarClassBlock {
  columnIndex: number;
  columnCount: number;
}

const WEEKDAY_ORDER: readonly DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];
const HOUR_HEIGHT_PX = 72;
const DEFAULT_START_HOUR = 17;
const DEFAULT_END_HOUR = 22;

const EXAM_CATEGORY_SHORT: Record<ExamCategory, string> = {
  parcial: 'Parcial',
  recuperatorio: 'Recup.',
  final: 'Final',
  tp: 'TP',
};

function formatCompactWeekRangeEs(referenceDate: Date): string {
  const monday = getStartOfWeekMonday(referenceDate);
  const sunday = addDays(monday, 6);
  const startDay = monday.getDate();
  const endDay = sunday.getDate();
  const startMonth = MONTH_SHORT_NAMES_ES[monday.getMonth()] ?? '';
  const endMonth = MONTH_SHORT_NAMES_ES[sunday.getMonth()] ?? '';

  if (
    monday.getFullYear() === sunday.getFullYear() &&
    monday.getMonth() === sunday.getMonth()
  ) {
    return `${startDay}–${endDay} ${endMonth}`;
  }

  return `${startDay} ${startMonth}–${endDay} ${endMonth}`;
}

function formatWeekSubtitle(referenceDate: Date, anchorToday: Date): string {
  const refMonday = getStartOfWeekMonday(referenceDate);
  const sunday = addDays(refMonday, 6);
  const todayMonday = getStartOfWeekMonday(anchorToday);
  const diffWeeks = Math.round(
    (refMonday.getTime() - todayMonday.getTime()) / (7 * 86_400_000)
  );
  const year = sunday.getFullYear();

  if (diffWeeks === 0) return `Semana actual · ${year}`;
  if (diffWeeks === 1) return `Semana siguiente · ${year}`;
  if (diffWeeks === -1) return `Semana anterior · ${year}`;
  if (diffWeeks > 1) return `En ${diffWeeks} semanas · ${year}`;
  return `Hace ${Math.abs(diffWeeks)} semanas · ${year}`;
}

function formatMonthSubtitle(referenceDate: Date, anchorToday: Date): string {
  const diffMonths =
    (referenceDate.getFullYear() - anchorToday.getFullYear()) * 12 +
    (referenceDate.getMonth() - anchorToday.getMonth());
  const year = referenceDate.getFullYear();

  if (diffMonths === 0) return `Mes actual · ${year}`;
  if (diffMonths === 1) return `Mes siguiente · ${year}`;
  if (diffMonths === -1) return `Mes anterior · ${year}`;
  if (diffMonths > 1) return `En ${diffMonths} meses · ${year}`;
  return `Hace ${Math.abs(diffMonths)} meses · ${year}`;
}

function formatFullDayLabel(isoDate: string): string {
  const date = parseIsoDateLocal(isoDate);
  const jsDay = date.getDay();
  const dayOfWeek = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
  const dayName = DAY_NAMES_ES[dayOfWeek];
  const monthName = MONTH_NAMES_ES[date.getMonth()] ?? '';
  return `${dayName} ${date.getDate()} de ${monthName}`;
}

function layoutDayBlocks(blocks: CalendarClassBlock[]): PositionedBlock[] {
  if (blocks.length === 0) {
    return [];
  }

  const sorted = [...blocks].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes
  );

  // Group overlapping intervals into clusters to share horizontal space only when needed.
  const clusters: CalendarClassBlock[][] = [];
  let currentCluster: CalendarClassBlock[] = [];
  let clusterMaxEnd = -1;

  for (const block of sorted) {
    if (currentCluster.length === 0 || block.startMinutes < clusterMaxEnd) {
      currentCluster.push(block);
      clusterMaxEnd = Math.max(clusterMaxEnd, block.endMinutes);
    } else {
      clusters.push(currentCluster);
      currentCluster = [block];
      clusterMaxEnd = block.endMinutes;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const positioned: PositionedBlock[] = [];
  for (const cluster of clusters) {
    const columnEndTimes: number[] = [];
    const assigned = cluster.map((block) => {
      let colIdx = columnEndTimes.findIndex((end) => end <= block.startMinutes);
      if (colIdx === -1) {
        colIdx = columnEndTimes.length;
        columnEndTimes.push(block.endMinutes);
      } else {
        columnEndTimes[colIdx] = block.endMinutes;
      }
      return { block, colIdx };
    });

    const totalCols = Math.max(1, columnEndTimes.length);
    for (const item of assigned) {
      positioned.push({
        ...item.block,
        columnIndex: item.colIdx,
        columnCount: totalCols,
      });
    }
  }

  return positioned;
}

export function CalendarPage({
  onSelectCourse,
  onNavigateSection,
  initialDate,
  initialViewMode = 'week',
}: CalendarPageProps) {
  const anchorToday = useMemo(() => initialDate ?? new Date(), [initialDate]);

  const [viewMode, setViewMode] = useState<'month' | 'week'>(initialViewMode);
  const [referenceDate, setReferenceDate] = useState<Date>(() => initialDate ?? new Date());
  const [activeCourses, setActiveCourses] = useState<CourseWithSchedules[]>([]);
  const [periodTasks, setPeriodTasks] = useState<TaskWithCourse[]>([]);
  const [periodExams, setPeriodExams] = useState<ExamWithCourse[]>([]);
  const [selectedMonthDateIso, setSelectedMonthDateIso] = useState<string>(() =>
    toIsoDateString(initialDate ?? new Date())
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const monthDays = useMemo(
    () => getMonthCalendarGrid(referenceDate, anchorToday),
    [referenceDate, anchorToday]
  );

  const weekDays = useMemo(
    () => getWeekDaysMondayToSunday(referenceDate, anchorToday),
    [referenceDate, anchorToday]
  );

  const visibleDays = viewMode === 'month' ? monthDays : weekDays;
  const periodStartIso = visibleDays[0].dateIso;
  const periodEndIso = visibleDays[visibleDays.length - 1].dateIso;

  const loadCalendarData = useCallback(async () => {
    try {
      setErrorMsg(null);
      const [loadedCourses, loadedTasks, loadedExams] = await Promise.all([
        cursadaClient.listCourses({ status: 'active' }),
        cursadaClient.listTasks({ dueFrom: periodStartIso, dueTo: periodEndIso }),
        cursadaClient.listExams({ dateFrom: periodStartIso, dateTo: periodEndIso }),
      ]);
      setActiveCourses(loadedCourses);
      setPeriodTasks(loadedTasks);
      setPeriodExams(loadedExams);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo cargar la agenda de cursada.'
      );
    }
  }, [periodStartIso, periodEndIso]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      cursadaClient.listCourses({ status: 'active' }),
      cursadaClient.listTasks({ dueFrom: periodStartIso, dueTo: periodEndIso }),
      cursadaClient.listExams({ dateFrom: periodStartIso, dateTo: periodEndIso }),
    ])
      .then(([loadedCourses, loadedTasks, loadedExams]) => {
        if (!active) return;
        setErrorMsg(null);
        setActiveCourses(loadedCourses);
        setPeriodTasks(loadedTasks);
        setPeriodExams(loadedExams);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setErrorMsg(
          err instanceof Error ? err.message : 'No se pudo cargar la agenda de cursada.'
        );
      });

    const handleDataChanged = () => {
      if (!active) return;
      void loadCalendarData();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadCalendarData, periodStartIso, periodEndIso]);

  // Keep selected month cell coherent when switching months
  useEffect(() => {
    if (viewMode !== 'month') return;
    const existsInGrid = monthDays.some(
      (d) => d.dateIso === selectedMonthDateIso && d.isCurrentMonth
    );
    if (!existsInGrid) {
      const todayInMonth = monthDays.find((d) => d.isToday && d.isCurrentMonth);
      const firstInMonth = monthDays.find((d) => d.isCurrentMonth);
      const fallback = todayInMonth ?? firstInMonth ?? monthDays[0];
      if (fallback) {
        setSelectedMonthDateIso(fallback.dateIso);
      }
    }
  }, [viewMode, monthDays, selectedMonthDateIso]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskWithCourse[]>();
    for (const day of visibleDays) {
      map.set(day.dateIso, []);
    }
    for (const task of periodTasks) {
      if (!task.dueDate) continue;
      const list = map.get(task.dueDate);
      if (list) {
        list.push(task);
      }
    }
    return map;
  }, [visibleDays, periodTasks]);

  const examsByDate = useMemo(() => {
    const map = new Map<string, ExamWithCourse[]>();
    for (const day of visibleDays) {
      map.set(day.dateIso, []);
    }
    for (const exam of periodExams) {
      const list = map.get(exam.examDate);
      if (list) {
        list.push(exam);
      }
    }
    return map;
  }, [visibleDays, periodExams]);

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
        if (!list) continue;
        let startMinutes: number;
        let endMinutes: number;
        try {
          startMinutes = timeToMinutes(sched.startTime);
          endMinutes = timeToMinutes(sched.endTime);
        } catch {
          continue;
        }
        if (endMinutes <= startMinutes) continue;
        list.push({
          scheduleId: sched.id,
          courseId: course.id,
          courseName: course.name,
          dayOfWeek: sched.dayOfWeek,
          startTime: sched.startTime,
          endTime: sched.endTime,
          location: sched.location,
          startMinutes,
          endMinutes,
        });
      }
    }

    for (const [day, list] of map.entries()) {
      list.sort(
        (a, b) =>
          a.startMinutes - b.startMinutes || a.courseName.localeCompare(b.courseName)
      );
      map.set(day, list);
    }

    return map;
  }, [activeCourses]);

  const hourRange = useMemo(() => {
    let minHour = DEFAULT_START_HOUR;
    let maxHour = DEFAULT_END_HOUR;

    for (const list of blocksByDay.values()) {
      for (const block of list) {
        minHour = Math.min(minHour, Math.floor(block.startMinutes / 60));
        maxHour = Math.max(maxHour, Math.ceil(block.endMinutes / 60));
      }
    }

    const hours: number[] = [];
    for (let h = minHour; h < maxHour; h++) {
      hours.push(h);
    }
    return { minHour, maxHour, hours };
  }, [blocksByDay]);

  // Identify strictly ONE chronological next class from anchorToday across the next 14 days
  const nextClassKey = useMemo(() => {
    const nowMinutes = anchorToday.getHours() * 60 + anchorToday.getMinutes();

    for (let offset = 0; offset < 14; offset++) {
      const candidateDate = addDays(anchorToday, offset);
      const jsDay = candidateDate.getDay();
      const dayOfWeek = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
      const dayBlocks = blocksByDay.get(dayOfWeek) ?? [];
      const candidateIso = toIsoDateString(candidateDate);

      for (const block of dayBlocks) {
        if (offset === 0 && block.startMinutes < nowMinutes) {
          continue;
        }
        return `${candidateIso}::${block.scheduleId}`;
      }
    }
    return null;
  }, [anchorToday, blocksByDay]);

  const headerTitle = useMemo(() => {
    return viewMode === 'week'
      ? formatCompactWeekRangeEs(referenceDate)
      : formatMonthYearEs(referenceDate);
  }, [viewMode, referenceDate]);

  const headerSubtitle = useMemo(() => {
    return viewMode === 'week'
      ? formatWeekSubtitle(referenceDate, anchorToday)
      : formatMonthSubtitle(referenceDate, anchorToday);
  }, [viewMode, referenceDate, anchorToday]);

  function handlePrev(): void {
    setReferenceDate((prev) =>
      viewMode === 'month' ? addMonths(prev, -1) : addWeeks(prev, -1)
    );
  }

  function handleNext(): void {
    setReferenceDate((prev) =>
      viewMode === 'month' ? addMonths(prev, 1) : addWeeks(prev, 1)
    );
  }

  function handleToday(): void {
    setReferenceDate(anchorToday);
    setSelectedMonthDateIso(toIsoDateString(anchorToday));
  }

  const selectedMonthDayInfo = useMemo(() => {
    return (
      monthDays.find((d) => d.dateIso === selectedMonthDateIso) ?? monthDays[0] ?? null
    );
  }, [monthDays, selectedMonthDateIso]);

  const selectedMonthBlocks = useMemo(() => {
    if (!selectedMonthDayInfo || !selectedMonthDayInfo.isCurrentMonth) return [];
    return blocksByDay.get(selectedMonthDayInfo.dayOfWeek) ?? [];
  }, [selectedMonthDayInfo, blocksByDay]);

  const selectedMonthTasks = useMemo(() => {
    if (!selectedMonthDayInfo) return [];
    return tasksByDate.get(selectedMonthDayInfo.dateIso) ?? [];
  }, [selectedMonthDayInfo, tasksByDate]);

  const selectedMonthExams = useMemo(() => {
    if (!selectedMonthDayInfo) return [];
    return examsByDate.get(selectedMonthDayInfo.dateIso) ?? [];
  }, [selectedMonthDayInfo, examsByDate]);

  return (
    <section aria-labelledby="main-title">
      <header className="calendar-header">
        <div className="calendar-header-left">
          <h1
            id="main-title"
            tabIndex={-1}
            className="calendar-range-title"
            data-testid="calendar-period-label"
          >
            {headerTitle}
          </h1>
          <span className="swiss-meta-md" data-testid="calendar-week-range">
            {headerSubtitle}
          </span>
        </div>

        <div className="calendar-controls">
          <div className="calendar-nav-group">
            <SwissButton
              variant="secondary"
              aria-label="Anterior"
              title="Anterior"
              onClick={handlePrev}
            >
              ‹
            </SwissButton>
            <SwissButton variant="secondary" onClick={handleToday}>
              Hoy
            </SwissButton>
            <SwissButton
              variant="secondary"
              aria-label="Siguiente"
              title="Siguiente"
              onClick={handleNext}
            >
              ›
            </SwissButton>
          </div>

          <SwissSegmented<'week' | 'month'>
            ariaLabel="Modo de vista del calendario"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'week', label: 'Semana' },
              { value: 'month', label: 'Mes' },
            ]}
          />
        </div>
      </header>

      {errorMsg ? (
        <div style={{ marginBottom: '16px' }}>
          <SwissErrorAlert message={errorMsg} />
        </div>
      ) : null}

      {viewMode === 'week' ? (
        <section
          className="calendar-week-grid"
          aria-label="Grilla semanal de cursada"
        >
          <div className="calendar-day-heads">
            <div aria-hidden="true" />
            {weekDays.map((day) => {
              const isWeekend = day.dayOfWeek === 6 || day.dayOfWeek === 7;
              return (
                <div
                  key={day.dateIso}
                  className={`calendar-day-head ${isWeekend ? 'is-weekend' : ''}`.trim()}
                  data-date={day.dateIso}
                >
                  <div className="swiss-section-label">
                    {day.isToday ? `${day.dayShort} · Hoy` : day.dayShort}
                  </div>
                  <div className="calendar-day-num">{Number(day.dayNumber)}</div>
                </div>
              );
            })}
          </div>

          <div className="calendar-deliverables-band">
            <div className="calendar-deliverables-label swiss-section-label">
              Entregas
            </div>
            {weekDays.map((day) => {
              const dayExams = examsByDate.get(day.dateIso) ?? [];
              const dayTasks = tasksByDate.get(day.dateIso) ?? [];
              return (
                <div
                  key={day.dateIso}
                  className="calendar-deliverable-cell"
                  data-date={day.dateIso}
                >
                  {dayExams.map((exam) => (
                    <button
                      key={exam.id}
                      type="button"
                      className="calendar-deliverable-item"
                      title={`${EXAM_CATEGORY_SHORT[exam.category]} · ${exam.title} · ${exam.courseName}`}
                      onClick={() =>
                        onNavigateSection
                          ? onNavigateSection('examenes')
                          : onSelectCourse(exam.courseId)
                      }
                    >
                      {EXAM_CATEGORY_SHORT[exam.category]} · {exam.title}
                    </button>
                  ))}
                  {dayTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="calendar-deliverable-item"
                      title={`${task.title} · ${task.courseName}`}
                      onClick={() =>
                        onNavigateSection
                          ? onNavigateSection('tareas')
                          : onSelectCourse(task.courseId)
                      }
                    >
                      {task.title}
                      {task.status === 'done' ? ' (hecha)' : ''}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="calendar-body-cols">
            <div className="calendar-time-labels" aria-hidden="true">
              {hourRange.hours.map((hour) => (
                <div key={hour} className="calendar-hour-tick">
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {weekDays.map((day) => {
              const rawBlocks = blocksByDay.get(day.dayOfWeek) ?? [];
              const positionedBlocks = layoutDayBlocks(rawBlocks);
              const originMinutes = hourRange.minHour * 60;

              return (
                <div
                  key={day.dateIso}
                  className="calendar-day-col"
                  data-date={day.dateIso}
                  data-day-of-week={day.dayOfWeek}
                >
                  {hourRange.hours.map((hour) => (
                    <div key={hour} className="calendar-hour-cell" />
                  ))}

                  {positionedBlocks.map((block) => {
                    const topPx = ((block.startMinutes - originMinutes) / 60) * HOUR_HEIGHT_PX;
                    const heightPx = Math.max(
                      36,
                      ((block.endMinutes - block.startMinutes) / 60) * HOUR_HEIGHT_PX
                    );
                    const blockKey = `${day.dateIso}::${block.scheduleId}`;
                    const isNext = nextClassKey === blockKey;
                    const hasOverlap = block.columnCount > 1;

                    const blockStyle = hasOverlap
                      ? {
                          top: `${topPx}px`,
                          height: `${heightPx}px`,
                          left: `calc(${(block.columnIndex / block.columnCount) * 100}% + 4px)`,
                          right: 'auto',
                          width: `calc(${100 / block.columnCount}% - 8px)`,
                        }
                      : {
                          top: `${topPx}px`,
                          height: `${heightPx}px`,
                        };

                    return (
                      <button
                        key={block.scheduleId}
                        type="button"
                        className={`calendar-class-block ${isNext ? 'is-next' : ''}`.trim()}
                        style={blockStyle}
                        data-course-id={block.courseId}
                        onClick={() => onSelectCourse(block.courseId)}
                      >
                        <span className="calendar-class-block-name">
                          {block.courseName}
                        </span>
                        <span className="calendar-class-block-time">
                          {block.startTime}–{block.endTime}
                          {block.location ? ` · ${block.location}` : ''}
                          {isNext ? ' · próxima clase' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section aria-label="Calendario mensual de cursada">
          <div className="calendar-month-grid">
            {WEEKDAY_ORDER.map((dayOfWeek) => (
              <div key={dayOfWeek} className="calendar-month-head">
                <span className="swiss-section-label">
                  {DAY_SHORT_NAMES_ES[dayOfWeek]}
                </span>
              </div>
            ))}

            {monthDays.map((day) => {
              const dayExams = examsByDate.get(day.dateIso) ?? [];
              const dayTasks = tasksByDate.get(day.dateIso) ?? [];
              const dayClasses = day.isCurrentMonth
                ? (blocksByDay.get(day.dayOfWeek) ?? [])
                : [];
              const isSelected = selectedMonthDateIso === day.dateIso;

              return (
                <div
                  key={day.dateIso}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${formatFullDayLabel(day.dateIso)}: ${dayClasses.length} clases, ${dayTasks.length} entregas, ${dayExams.length} exámenes`}
                  className={`calendar-month-cell ${
                    !day.isCurrentMonth ? 'is-outside' : ''
                  } ${day.isToday ? 'is-today' : ''}`.trim()}
                  style={{
                    cursor: 'pointer',
                    ...(isSelected && !day.isToday
                      ? { outline: '2px solid var(--ink)', outlineOffset: '-2px' }
                      : {}),
                  }}
                  data-date={day.dateIso}
                  onClick={() => setSelectedMonthDateIso(day.dateIso)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedMonthDateIso(day.dateIso);
                    }
                  }}
                >
                  <span className="calendar-month-daynum">
                    {Number(day.dayNumber)}
                  </span>
                  <div className="calendar-event-dots" aria-hidden="true">
                    {dayExams.map((exam) => (
                      <span
                        key={exam.id}
                        className="calendar-event-rect is-accent"
                        title={`Examen: ${exam.title}`}
                      />
                    ))}
                    {dayTasks.map((task) => (
                      <span
                        key={task.id}
                        className="calendar-event-rect"
                        title={`Entrega: ${task.title}`}
                      />
                    ))}
                    {dayClasses.map((block) => (
                      <span
                        key={`${day.dateIso}-${block.scheduleId}`}
                        className="calendar-event-rect"
                        title={`Clase: ${block.courseName}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedMonthDayInfo ? (
            <div style={{ marginTop: '24px' }}>
              <SwissSectionHeader
                title={formatFullDayLabel(selectedMonthDayInfo.dateIso)}
                right={`${selectedMonthClassesCountLabel(
                  selectedMonthBlocks.length,
                  selectedMonthTasks.length,
                  selectedMonthExams.length
                )}`}
              />

              {selectedMonthBlocks.length === 0 &&
              selectedMonthTasks.length === 0 &&
              selectedMonthExams.length === 0 ? (
                <SwissEmptyState
                  title="Sin actividad programada"
                  description="No tenés clases, entregas ni exámenes registrados para este día."
                />
              ) : (
                <div>
                  {selectedMonthExams.map((exam) => (
                    <button
                      key={exam.id}
                      type="button"
                      className="home-row"
                      onClick={() =>
                        onNavigateSection
                          ? onNavigateSection('examenes')
                          : onSelectCourse(exam.courseId)
                      }
                    >
                      <span className="home-row-day">
                        {EXAM_CATEGORY_SHORT[exam.category]}
                      </span>
                      <span className="home-row-title">{exam.title}</span>
                      <span className="home-row-course swiss-meta">
                        {exam.courseName}
                      </span>
                      <span className="home-row-right">
                        {exam.examTime ?? 'Sin hora'}
                      </span>
                    </button>
                  ))}

                  {selectedMonthTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="home-row"
                      onClick={() =>
                        onNavigateSection
                          ? onNavigateSection('tareas')
                          : onSelectCourse(task.courseId)
                      }
                    >
                      <span className="home-row-day">Entrega</span>
                      <span className="home-row-title">{task.title}</span>
                      <span className="home-row-course swiss-meta">
                        {task.courseName}
                      </span>
                      <span className="home-row-right">
                        {task.status === 'done' ? 'Completada' : 'Pendiente'}
                      </span>
                    </button>
                  ))}

                  {selectedMonthBlocks.map((block) => (
                    <button
                      key={block.scheduleId}
                      type="button"
                      className="home-row"
                      onClick={() => onSelectCourse(block.courseId)}
                    >
                      <span className="home-row-day">Clase</span>
                      <span className="home-row-title">{block.courseName}</span>
                      <span className="home-row-course swiss-meta">
                        {block.location || 'Cursada regular'}
                      </span>
                      <span className="home-row-right">
                        {block.startTime}–{block.endTime}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '14px' }}>
                <SwissLinkButton onClick={() => setViewMode('week')}>
                  Ver en grilla semanal →
                </SwissLinkButton>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </section>
  );
}

function selectedMonthClassesCountLabel(
  classesCount: number,
  tasksCount: number,
  examsCount: number
): string {
  const parts: string[] = [];
  if (examsCount > 0) {
    parts.push(examsCount === 1 ? '1 examen' : `${examsCount} exámenes`);
  }
  if (tasksCount > 0) {
    parts.push(tasksCount === 1 ? '1 entrega' : `${tasksCount} entregas`);
  }
  if (classesCount > 0) {
    parts.push(classesCount === 1 ? '1 clase' : `${classesCount} clases`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Día libre';
}
