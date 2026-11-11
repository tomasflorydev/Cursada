import { describe, expect, it } from 'vitest';
import {
  addWeeks,
  formatScheduleBlock,
  formatSchedulesSummary,
  formatWeekRangeEs,
  getStartOfWeekMonday,
  getWeekDaysMondayToSunday,
  isValidTimeFormat,
  isValidTimeRange,
  timeToMinutes,
  toIsoDateString,
} from '../lib/dates';

describe('Task 1.3: Date and schedule utilities (Monday to Sunday)', () => {
  it('computes Monday-to-Sunday week days accurately for a mid-week date', () => {
    // Wednesday, Nov 11, 2026
    const ref = new Date(2026, 10, 11);
    const today = new Date(2026, 10, 10); // Tuesday, Nov 10, 2026

    const days = getWeekDaysMondayToSunday(ref, today);
    expect(days).toHaveLength(7);

    expect(days[0]).toMatchObject({
      dateIso: '2026-11-09',
      dayOfWeek: 1,
      dayName: 'Lunes',
      dayShort: 'Lun',
      dayNumber: '09',
      monthShort: 'nov',
      isToday: false,
    });

    expect(days[1]).toMatchObject({
      dateIso: '2026-11-10',
      dayOfWeek: 2,
      dayName: 'Martes',
      dayShort: 'Mar',
      dayNumber: '10',
      isToday: true,
    });

    expect(days[6]).toMatchObject({
      dateIso: '2026-11-15',
      dayOfWeek: 7,
      dayName: 'Domingo',
      dayShort: 'Dom',
      dayNumber: '15',
      isToday: false,
    });
  });

  it('keeps Sunday in the same Monday-to-Sunday week rather than advancing to next week', () => {
    // Sunday, Nov 15, 2026
    const sunday = new Date(2026, 10, 15);
    const monday = getStartOfWeekMonday(sunday);
    expect(toIsoDateString(monday)).toBe('2026-11-09');

    const days = getWeekDaysMondayToSunday(sunday, sunday);
    expect(days[0].dateIso).toBe('2026-11-09');
    expect(days[6].dateIso).toBe('2026-11-15');
    expect(days[6].isToday).toBe(true);
  });

  it('navigates to previous and next weeks with addWeeks and formats Spanish week ranges', () => {
    const base = new Date(2026, 10, 11); // Week of Nov 9 - Nov 15, 2026
    expect(formatWeekRangeEs(base)).toBe('9 al 15 de noviembre de 2026');

    const prevWeek = addWeeks(base, -1); // Week of Nov 2 - Nov 8, 2026
    expect(formatWeekRangeEs(prevWeek)).toBe('2 al 8 de noviembre de 2026');

    const twoWeeksBack = addWeeks(base, -2); // Week of Oct 26 - Nov 1, 2026 (cross-month)
    expect(formatWeekRangeEs(twoWeeksBack)).toBe(
      '26 de octubre al 1 de noviembre de 2026'
    );

    const nextWeek = addWeeks(base, 1); // Week of Nov 16 - Nov 22, 2026
    expect(formatWeekRangeEs(nextWeek)).toBe('16 al 22 de noviembre de 2026');
  });

  it('converts HH:MM to minutes from midnight and validates startTime < endTime', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('08:30')).toBe(510);
    expect(timeToMinutes('18:30')).toBe(1110);
    expect(timeToMinutes('23:59')).toBe(1439);

    expect(() => timeToMinutes('24:00')).toThrow();
    expect(() => timeToMinutes('8:30')).toThrow();

    expect(isValidTimeFormat('14:00')).toBe(true);
    expect(isValidTimeFormat('99:00')).toBe(false);

    expect(isValidTimeRange('14:00', '18:00')).toBe(true);
    expect(isValidTimeRange('18:00', '18:00')).toBe(false);
    expect(isValidTimeRange('19:00', '18:00')).toBe(false);
  });

  it('formats weekly schedule blocks in Spanish', () => {
    expect(
      formatScheduleBlock({
        dayOfWeek: 2,
        startTime: '14:00',
        endTime: '18:00',
        location: 'Aula 308 · Lima',
      })
    ).toBe('Mar 14:00–18:00 (Aula 308 · Lima)');

    expect(
      formatSchedulesSummary([
        {
          dayOfWeek: 2,
          startTime: '14:00',
          endTime: '18:00',
          location: 'Aula 308 · Lima',
        },
        {
          dayOfWeek: 4,
          startTime: '18:30',
          endTime: '22:30',
          location: '',
        },
      ])
    ).toBe('Mar 14:00–18:00 (Aula 308 · Lima) · Jue 18:30–22:30');
  });
});
