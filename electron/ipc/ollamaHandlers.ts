import { ipcMain } from 'electron';
import { getAiSettings, updateAiSettings } from '../db/aiSettingsRepo.js';
import { getAppDatabase } from '../db/database.js';
import { assertTrustedIpcEvent } from '../security.js';
import { checkOllamaHealth } from '../services/ollamaClient.js';
import type { UpdateAiSettingsInput } from '../types.js';

export function registerOllamaHandlers(): void {
  ipcMain.handle('ai:getSettings', (event) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return getAiSettings(ctx.db);
  });

  ipcMain.handle('ai:updateSettings', (event, input: UpdateAiSettingsInput) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return updateAiSettings(ctx.db, input);
  });

  ipcMain.handle('ai:checkStatus', (event, baseUrl?: string) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    const settings = getAiSettings(ctx.db);
    return checkOllamaHealth({
      baseUrl: baseUrl ?? settings.baseUrl,
      chatModel: settings.chatModel,
      embeddingModel: settings.embeddingModel,
    });
  });
}
