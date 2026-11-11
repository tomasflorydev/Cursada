import type { ClassSchedule, DayOfWeek } from '../../types/domain';

export const DAY_NAMES_ES: Record<DayOfWeek, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

export const DAY_SHORT_NAMES_ES: Record<DayOfWeek, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
  7: 'Dom',
};

export const MONTH_NAMES_ES: readonly string[] = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const MONTH_SHORT_NAMES_ES: readonly string[] = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export interface WeekDayInfo {
  date: Date;
  dateIso: string; // 'YYYY-MM-DD'
  dayOfWeek: DayOfWeek; // 1 = Lunes .. 7 = Domingo
  dayName: string; // 'Lunes' .. 'Domingo'
  dayShort: string; // 'Lun' .. 'Dom'
  dayNumber: string; // '01' .. '31'
  monthShort: string; // 'ene' .. 'dic'
  isToday: boolean;
}

export interface MonthDayInfo extends WeekDayInfo {
  isCurrentMonth: boolean;
}

export function toIsoDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function getStartOfWeekMonday(referenceDate: Date): Date {
  const copy = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const jsDay = copy.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  copy.setDate(copy.getDate() + diffToMonday);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function formatMonthYearEs(referenceDate: Date): string {
  const monthName = MONTH_NAMES_ES[referenceDate.getMonth()] ?? '';
  const capitalized =
    monthName.length > 0
      ? monthName.charAt(0).toUpperCase() + monthName.slice(1)
      : '';
  return `${capitalized} ${referenceDate.getFullYear()}`;
}

export function getMonthCalendarGrid(
  referenceDate: Date,
  todayReference: Date = new Date()
): MonthDayInfo[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  const startMonday = getStartOfWeekMonday(firstOfMonth);
  const lastMonday = getStartOfWeekMonday(lastOfMonth);
  const endSunday = addDays(lastMonday, 6);

  const todayIso = toIsoDateString(todayReference);
  const days: MonthDayInfo[] = [];

  let cursor = startMonday;
  while (cursor <= endSunday) {
    const jsDay = cursor.getDay();
    const dayOfWeek = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
    const dateIso = toIsoDateString(cursor);
    days.push({
      date: cursor,
      dateIso,
      dayOfWeek,
      dayName: DAY_NAMES_ES[dayOfWeek],
      dayShort: DAY_SHORT_NAMES_ES[dayOfWeek],
      dayNumber: String(cursor.getDate()).padStart(2, '0'),
      monthShort: MONTH_SHORT_NAMES_ES[cursor.getMonth()],
      isToday: dateIso === todayIso,
      isCurrentMonth: cursor.getMonth() === month && cursor.getFullYear() === year,
    });
    cursor = addDays(cursor, 1);
  }

  return days;
}

export function getWeekDaysMondayToSunday(
  referenceDate: Date,
  todayReference: Date = new Date()
): WeekDayInfo[] {
  const monday = getStartOfWeekMonday(referenceDate);
  const todayIso = toIsoDateString(todayReference);

  const days: WeekDayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const current = addDays(monday, i);
    const dayOfWeek = (i + 1) as DayOfWeek;
    const dateIso = toIsoDateString(current);
    days.push({
      date: current,
      dateIso,
      dayOfWeek,
      dayName: DAY_NAMES_ES[dayOfWeek],
      dayShort: DAY_SHORT_NAMES_ES[dayOfWeek],
      dayNumber: String(current.getDate()).padStart(2, '0'),
      monthShort: MONTH_SHORT_NAMES_ES[current.getMonth()],
      isToday: dateIso === todayIso,
    });
  }

  return days;
}

export function formatWeekRangeEs(referenceDate: Date): string {
  const monday = getStartOfWeekMonday(referenceDate);
  const sunday = addDays(monday, 6);

  const startDay = monday.getDate();
  const endDay = sunday.getDate();
  const startMonth = MONTH_NAMES_ES[monday.getMonth()];
  const endMonth = MONTH_NAMES_ES[sunday.getMonth()];
  const startYear = monday.getFullYear();
  const endYear = sunday.getFullYear();

  if (startYear === endYear && monday.getMonth() === sunday.getMonth()) {
    return `${startDay} al ${endDay} de ${endMonth} de ${endYear}`;
  }

  if (startYear === endYear) {
    return `${startDay} de ${startMonth} al ${endDay} de ${endMonth} de ${endYear}`;
  }

  return `${startDay} de ${startMonth} de ${startYear} al ${endDay} de ${endMonth} de ${endYear}`;
}

const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeFormat(time: string): boolean {
  return TIME_HH_MM_REGEX.test(time);
}

export function timeToMinutes(time: string): number {
  const match = TIME_HH_MM_REGEX.exec(time);
  if (!match) {
    throw new Error(`Invalid time format "${time}". Expected HH:MM (00:00 to 23:59)`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidTimeRange(startTime: string, endTime: string): boolean {
  if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
    return false;
  }
  return timeToMinutes(startTime) < timeToMinutes(endTime);
}

export function formatScheduleBlock(
  schedule: Pick<ClassSchedule, 'dayOfWeek' | 'startTime' | 'endTime' | 'location'>
): string {
  const dayLabel = DAY_SHORT_NAMES_ES[schedule.dayOfWeek];
  const base = `${dayLabel} ${schedule.startTime}–${schedule.endTime}`;
  const loc = schedule.location.trim();
  return loc ? `${base} (${loc})` : base;
}

export function formatSchedulesSummary(
  schedules: ReadonlyArray<Pick<ClassSchedule, 'dayOfWeek' | 'startTime' | 'endTime' | 'location'>>
): string {
  if (schedules.length === 0) {
    return 'Sin horarios asignados';
  }
  return schedules.map(formatScheduleBlock).join(' · ');
}
