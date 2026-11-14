import type { DatabaseSync } from 'node:sqlite';
import { ipcMain } from 'electron';
import type {
  CreateChatThreadInput,
  SaveChatMessageAsNoteInput,
  SendChatMessageInput,
} from '../types.js';
import {
  createChatThread,
  deleteChatThread,
  getChatThread,
  listChatThreads,
} from '../db/chatRepo.js';
import { getAppDatabase } from '../db/database.js';
import {
  saveChatMessageAsNoteService,
  sendChatMessageService,
} from '../services/ragService.js';
import type { SourceEmbedder } from '../services/sourcesService.js';

export interface ChatHandlersContext {
  db?: DatabaseSync;
  embedder?: SourceEmbedder;
  fetchFn?: typeof fetch;
}

export function registerChatHandlers(ctx?: ChatHandlersContext): void {
  const resolveDb = (): DatabaseSync => ctx?.db ?? getAppDatabase().db;

  ipcMain.handle('chat:listThreads', (_event, courseId: string) => {
    return listChatThreads(resolveDb(), courseId);
  });

  ipcMain.handle('chat:getThread', (_event, threadId: string) => {
    return getChatThread(resolveDb(), threadId);
  });

  ipcMain.handle('chat:createThread', (_event, input: CreateChatThreadInput) => {
    return createChatThread(resolveDb(), input);
  });

  ipcMain.handle('chat:deleteThread', (_event, threadId: string) => {
    deleteChatThread(resolveDb(), threadId);
  });

  ipcMain.handle('chat:sendMessage', (_event, input: SendChatMessageInput) => {
    return sendChatMessageService(resolveDb(), input, {
      embedder: ctx?.embedder,
      fetchFn: ctx?.fetchFn,
    });
  });

  ipcMain.handle('chat:saveMessageAsNote', (_event, input: SaveChatMessageAsNoteInput) => {
    return saveChatMessageAsNoteService(resolveDb(), input);
  });
}
