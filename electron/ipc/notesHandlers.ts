import { ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  createNote,
  deleteNote,
  getNoteById,
  listNotes,
  toggleNotePin,
  updateNote,
} from '../db/notesRepo.js';
import type { CreateNoteInput, NoteFilters, UpdateNoteInput } from '../types.js';

export function registerNotesHandlers(): void {
  ipcMain.handle('notes:list', (_event, filters?: NoteFilters) => {
    const ctx = getAppDatabase();
    return listNotes(ctx.db, filters);
  });

  ipcMain.handle('notes:getById', (_event, id: string) => {
    const ctx = getAppDatabase();
    return getNoteById(ctx.db, id);
  });

  ipcMain.handle('notes:create', (_event, input: CreateNoteInput) => {
    const ctx = getAppDatabase();
    return createNote(ctx.db, input);
  });

  ipcMain.handle(
    'notes:update',
    (_event, id: string, input: UpdateNoteInput) => {
      const ctx = getAppDatabase();
      return updateNote(ctx.db, id, input);
    }
  );

  ipcMain.handle('notes:togglePin', (_event, id: string) => {
    const ctx = getAppDatabase();
    return toggleNotePin(ctx.db, id);
  });

  ipcMain.handle('notes:delete', (_event, id: string) => {
    const ctx = getAppDatabase();
    deleteNote(ctx.db, id);
  });
}
