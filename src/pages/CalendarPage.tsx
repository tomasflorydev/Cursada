import { SAMPLE_COURSES, WEEK_PULSE } from '../lib/sampleData';
import { CalendarioBasicView } from './BasicViews';

export interface CalendarPageProps {
  onSelectCourse: (courseId: string | null) => void;
}

export function CalendarPage({ onSelectCourse: _onSelectCourse }: CalendarPageProps) {
  return <CalendarioBasicView courses={SAMPLE_COURSES} weekPulse={WEEK_PULSE} />;
}
