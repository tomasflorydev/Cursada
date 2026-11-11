import type { CourseColor } from '../../types/domain';

export interface CourseColorOption {
  value: CourseColor;
  label: string;
}

export const COURSE_COLOR_OPTIONS: readonly CourseColorOption[] = [
  { value: 'blue', label: 'Azul Zafiro' },
  { value: 'emerald', label: 'Verde Esmeralda' },
  { value: 'violet', label: 'Violeta Amatista' },
  { value: 'amber', label: 'Ámbar Cálido' },
  { value: 'rose', label: 'Rosa Coral' },
  { value: 'cyan', label: 'Cian Glaciar' },
  { value: 'orange', label: 'Naranja Fuego' },
  { value: 'slate', label: 'Gris Neutro' },
];

export function getCourseColorLabel(color: CourseColor): string {
  return COURSE_COLOR_OPTIONS.find((c) => c.value === color)?.label ?? 'Gris Neutro';
}
