import { ipcMain } from 'electron';
import { getAiSettings, updateAiSettings } from '../db/aiSettingsRepo.js';
import { getAppDatabase } from '../db/database.js';
import { checkOllamaHealth } from '../services/ollamaClient.js';
import type { UpdateAiSettingsInput } from '../types.js';

export function registerOllamaHandlers(): void {
  ipcMain.handle('ai:getSettings', () => {
    const ctx = getAppDatabase();
    return getAiSettings(ctx.db);
  });

  ipcMain.handle('ai:updateSettings', (_event, input: UpdateAiSettingsInput) => {
    const ctx = getAppDatabase();
    return updateAiSettings(ctx.db, input);
  });

  ipcMain.handle('ai:checkStatus', (_event, baseUrl?: string) => {
    const ctx = getAppDatabase();
    const settings = getAiSettings(ctx.db);
    return checkOllamaHealth({
      baseUrl: baseUrl ?? settings.baseUrl,
      chatModel: settings.chatModel,
      embeddingModel: settings.embeddingModel,
    });
  });
}
