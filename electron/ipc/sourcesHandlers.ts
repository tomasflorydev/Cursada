import { BrowserWindow, dialog, ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  deleteSource,
  getSourceWithChunks,
  listSourcesByCourse,
  updateSourceExamStage,
} from '../db/sourcesRepo.js';
import {
  assertTrustedIpcEvent,
  assertValidIpcId,
  resolveRendererRequestedPath,
} from '../security.js';
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

const MAX_RENDERER_BASE64_CHARS = 70_000_000;

export function registerSourcesHandlers(): void {
  ipcMain.handle('sources:list', (event, courseId: string) => {
    assertTrustedIpcEvent(event);
    const validCourseId = assertValidIpcId(courseId, 'ID de materia');
    const ctx = getAppDatabase();
    return listSourcesByCourse(ctx.db, validCourseId);
  });

  ipcMain.handle('sources:getWithChunks', (event, sourceId: string) => {
    assertTrustedIpcEvent(event);
    const validSourceId = assertValidIpcId(sourceId, 'ID de fuente');
    const ctx = getAppDatabase();
    return getSourceWithChunks(ctx.db, validSourceId);
  });

  ipcMain.handle(
    'sources:createFromText',
    async (event, input: CreateSourceFromTextInput) => {
      assertTrustedIpcEvent(event);
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
      event,
      input: ImportSourceFileInput
    ): Promise<ImportSourceFileResult> => {
      assertTrustedIpcEvent(event);
      assertValidIpcId(input?.courseId, 'ID de materia');
      if (
        typeof input?.contentBase64 === 'string' &&
        input.contentBase64.length > MAX_RENDERER_BASE64_CHARS
      ) {
        throw new Error('El archivo excede el tamaño máximo permitido (50 MB).');
      }

      let resolvedFilePath = resolveRendererRequestedPath(input?.filePath);

      if (!resolvedFilePath && !input?.contentBase64) {
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
    (event, input: UpdateSourceStageInput) => {
      assertTrustedIpcEvent(event);
      const ctx = getAppDatabase();
      return updateSourceExamStage(ctx.db, input);
    }
  );

  ipcMain.handle('sources:reindex', (event, sourceId: string) => {
    assertTrustedIpcEvent(event);
    const validSourceId = assertValidIpcId(sourceId, 'ID de fuente');
    const ctx = getAppDatabase();
    return reindexSourceService(ctx.db, validSourceId, {
      dataDir: ctx.dataDir,
      embedder: createOllamaSourceEmbedder(ctx.db),
    });
  });

  ipcMain.handle('sources:delete', (event, sourceId: string) => {
    assertTrustedIpcEvent(event);
    const validSourceId = assertValidIpcId(sourceId, 'ID de fuente');
    const ctx = getAppDatabase();
    deleteSource(ctx.db, validSourceId, ctx.dataDir);
  });

  ipcMain.handle(
    'sources:searchChunks',
    (event, input: SearchSourceChunksInput) => {
      assertTrustedIpcEvent(event);
      const ctx = getAppDatabase();
      return searchSourceChunksService(ctx.db, input, {
        embedder: createOllamaSourceEmbedder(ctx.db),
      });
    }
  );
}
