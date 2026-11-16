import { ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import { syncNoteLinks } from '../db/knowledgeRepo.js';
import {
  createNote,
  deleteNote,
  getNoteById,
  listNotes,
  toggleNotePin,
  updateNote,
} from '../db/notesRepo.js';
import { assertTrustedIpcEvent, assertValidIpcId } from '../security.js';
import type { CreateNoteInput, NoteFilters, UpdateNoteInput } from '../types.js';

export function registerNotesHandlers(): void {
  ipcMain.handle('notes:list', (event, filters?: NoteFilters) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return listNotes(ctx.db, filters);
  });

  ipcMain.handle('notes:getById', (event, id: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(id, 'ID de nota');
    const ctx = getAppDatabase();
    return getNoteById(ctx.db, validId);
  });

  ipcMain.handle('notes:create', (event, input: CreateNoteInput) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    const created = createNote(ctx.db, input);
    syncNoteLinks(ctx.db, created.id);
    return created;
  });

  ipcMain.handle(
    'notes:update',
    (event, id: string, input: UpdateNoteInput) => {
      assertTrustedIpcEvent(event);
      const validId = assertValidIpcId(id, 'ID de nota');
      const ctx = getAppDatabase();
      const updated = updateNote(ctx.db, validId, input);
      syncNoteLinks(ctx.db, updated.id);
      return updated;
    }
  );

  ipcMain.handle('notes:togglePin', (event, id: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(id, 'ID de nota');
    const ctx = getAppDatabase();
    return toggleNotePin(ctx.db, validId);
  });

  ipcMain.handle('notes:delete', (event, id: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(id, 'ID de nota');
    const ctx = getAppDatabase();
    deleteNote(ctx.db, validId);
  });
}
