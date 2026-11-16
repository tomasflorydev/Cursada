import { BrowserWindow, dialog, ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  getKnowledgeGraph,
  getNoteLinksSummary,
  openOrCreateWikiLinkNote,
} from '../db/knowledgeRepo.js';
import {
  assertTrustedIpcEvent,
  assertValidIpcId,
  resolveRendererRequestedPath,
} from '../security.js';
import { importObsidianVaultFromDir } from '../services/obsidianImportService.js';
import type {
  ImportObsidianVaultInput,
  ImportObsidianVaultResult,
} from '../types.js';

export function registerKnowledgeHandlers(): void {
  ipcMain.handle('knowledge:getNoteLinks', (event, noteId: string) => {
    assertTrustedIpcEvent(event);
    const validNoteId = assertValidIpcId(noteId, 'ID de nota');
    const ctx = getAppDatabase();
    return getNoteLinksSummary(ctx.db, validNoteId);
  });

  ipcMain.handle(
    'knowledge:openOrCreateWikiLink',
    (event, input: { courseId: string; targetTitle: string }) => {
      assertTrustedIpcEvent(event);
      const ctx = getAppDatabase();
      return openOrCreateWikiLinkNote(ctx.db, input);
    }
  );

  ipcMain.handle(
    'knowledge:getGraph',
    (event, opts?: { courseId?: string; includeArchived?: boolean }) => {
      assertTrustedIpcEvent(event);
      const ctx = getAppDatabase();
      return getKnowledgeGraph(ctx.db, opts);
    }
  );

  ipcMain.handle(
    'knowledge:importObsidianVault',
    async (
      event,
      input?: ImportObsidianVaultInput
    ): Promise<ImportObsidianVaultResult> => {
      assertTrustedIpcEvent(event);
      const hasFilesPayload =
        Array.isArray(input?.filesPayload) && input.filesPayload.length > 0;
      let vaultDir = resolveRendererRequestedPath(input?.vaultDir);

      if (!vaultDir && !hasFilesPayload) {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        const dialogOptions: Electron.OpenDialogOptions = {
          title: 'Seleccionar bóveda de Obsidian',
          properties: ['openDirectory'],
        };

        const dialogResult = focusedWindow
          ? await dialog.showOpenDialog(focusedWindow, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
          return {
            canceled: true,
            vaultPath: null,
            coursesCreated: [],
            notesImportedCount: 0,
            linksResolvedCount: 0,
          };
        }

        vaultDir = dialogResult.filePaths[0];
      }

      const ctx = getAppDatabase();
      return importObsidianVaultFromDir(ctx.db, {
        ...input,
        vaultDir,
      });
    }
  );
}
