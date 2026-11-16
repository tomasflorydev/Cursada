import { BrowserWindow, dialog, ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  deleteSource,
  getSourceWithChunks,
  listSourcesByCourse,
  updateSourceExamStage,
} from '../db/sourcesRepo.js';
import {
  createOllamaSourceEmbedder,
  createSourceFromTextService,
  importSourceFileService,
  reindexSourceService,
  searchSourceChunksService,
} from '../services/sourcesService.js';
import type {
  CreateSourceFromTextInput,
  ImportSourceFileInput,
  ImportSourceFileResult,
  SearchSourceChunksInput,
  UpdateSourceStageInput,
} from '../types.js';

export function registerSourcesHandlers(): void {
  ipcMain.handle('sources:list', (_event, courseId: string) => {
    const ctx = getAppDatabase();
    return listSourcesByCourse(ctx.db, courseId);
  });

  ipcMain.handle('sources:getWithChunks', (_event, sourceId: string) => {
    const ctx = getAppDatabase();
    return getSourceWithChunks(ctx.db, sourceId);
  });

  ipcMain.handle(
    'sources:createFromText',
    async (_event, input: CreateSourceFromTextInput) => {
      const ctx = getAppDatabase();
      const created = await createSourceFromTextService(ctx.db, input, {
        embedder: createOllamaSourceEmbedder(ctx.db),
      });
      if (input.examStage) {
        return updateSourceExamStage(ctx.db, {
          sourceId: created.id,
          examStage: input.examStage,
        });
      }
      return created;
    }
  );

  ipcMain.handle(
    'sources:importFile',
    async (
      _event,
      input: ImportSourceFileInput
    ): Promise<ImportSourceFileResult> => {
      let resolvedFilePath = input.filePath;

      if (!resolvedFilePath && !input.contentBase64) {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        const dialogOptions: Electron.OpenDialogOptions = {
          title: 'Seleccionar fuente de estudio',
          filters: [
            {
              name: 'Documentos académicos',
              extensions: ['pdf', 'md', 'markdown', 'txt'],
            },
          ],
          properties: ['openFile'],
        };

        const dialogResult = focusedWindow
          ? await dialog.showOpenDialog(focusedWindow, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
          return { canceled: true, source: null };
        }

        resolvedFilePath = dialogResult.filePaths[0];
      }

      const ctx = getAppDatabase();
      const result = await importSourceFileService(
        ctx.db,
        { ...input, filePath: resolvedFilePath },
        {
          dataDir: ctx.dataDir,
          embedder: createOllamaSourceEmbedder(ctx.db),
        }
      );
      if (!result.canceled && result.source && input.examStage) {
        return {
          canceled: false,
          source: updateSourceExamStage(ctx.db, {
            sourceId: result.source.id,
            examStage: input.examStage,
          }),
        };
      }
      return result;
    }
  );

  ipcMain.handle(
    'sources:updateStage',
    (_event, input: UpdateSourceStageInput) => {
      const ctx = getAppDatabase();
      return updateSourceExamStage(ctx.db, input);
    }
  );

  ipcMain.handle('sources:reindex', (_event, sourceId: string) => {
    const ctx = getAppDatabase();
    return reindexSourceService(ctx.db, sourceId, {
      dataDir: ctx.dataDir,
      embedder: createOllamaSourceEmbedder(ctx.db),
    });
  });

  ipcMain.handle('sources:delete', (_event, sourceId: string) => {
    const ctx = getAppDatabase();
    deleteSource(ctx.db, sourceId, ctx.dataDir);
  });

  ipcMain.handle(
    'sources:searchChunks',
    (_event, input: SearchSourceChunksInput) => {
      const ctx = getAppDatabase();
      return searchSourceChunksService(ctx.db, input, {
        embedder: createOllamaSourceEmbedder(ctx.db),
      });
    }
  );
}
