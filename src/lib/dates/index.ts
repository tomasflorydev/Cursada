import type { DayOfWeek } from '../../types/domain';

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

export function toIsoDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
