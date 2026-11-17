export const DEFAULT_UNTITLED_NOTE_TITLE = 'Nota sin título';

export interface NoteDraftSnapshot {
  noteId: string;
  title: string;
  content: string;
}

/**
 * Normalizes a note title before persisting so body edits are never dropped
 * when the user leaves or clears the title field temporarily.
 */
export function resolvePersistedNoteTitle(rawTitle: string): string {
  const trimmed = rawTitle.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_UNTITLED_NOTE_TITLE;
}

/**
 * Checks whether a local draft diverges from the last persisted snapshot.
 */
export function isNoteDraftDirty(
  draft: NoteDraftSnapshot | null | undefined,
  saved: NoteDraftSnapshot | null | undefined
): boolean {
  if (!draft || !saved || draft.noteId !== saved.noteId) {
    return false;
  }
  return (
    resolvePersistedNoteTitle(draft.title) !== saved.title ||
    draft.content !== saved.content
  );
}
