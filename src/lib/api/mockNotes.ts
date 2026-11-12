import type {
  CreateNoteInput,
  NoteFilters,
  NoteWithCourse,
  UpdateNoteInput,
} from '../../types/domain';

export function resetMockNotes(): void {
  // Implemented by Agent 1 (Phase 4 Notes)
}

export function mockCountNotesByCourse(_courseId: string): number {
  return 0;
}

export function mockDeleteNotesByCourse(_courseId: string): void {
  // Implemented by Agent 1 (Phase 4 Notes)
}

export async function mockListNotes(_filters?: NoteFilters): Promise<NoteWithCourse[]> {
  return [];
}

export async function mockGetNote(_id: string): Promise<NoteWithCourse | null> {
  return null;
}

export async function mockCreateNote(input: CreateNoteInput): Promise<NoteWithCourse> {
  throw new Error(`Not implemented in Stage 0: ${input.title}`);
}

export async function mockUpdateNote(
  id: string,
  _input: UpdateNoteInput
): Promise<NoteWithCourse> {
  throw new Error(`Not implemented in Stage 0: ${id}`);
}

export async function mockToggleNotePin(id: string): Promise<NoteWithCourse> {
  throw new Error(`Not implemented in Stage 0: ${id}`);
}

export async function mockDeleteNote(_id: string): Promise<void> {
  // Implemented by Agent 1 (Phase 4 Notes)
}
