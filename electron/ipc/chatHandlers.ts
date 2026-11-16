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
import { assertTrustedIpcEvent, assertValidIpcId } from '../security.js';
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

  ipcMain.handle('chat:listThreads', (event, courseId: string) => {
    assertTrustedIpcEvent(event);
    const validCourseId = assertValidIpcId(courseId, 'ID de materia');
    return listChatThreads(resolveDb(), validCourseId);
  });

  ipcMain.handle('chat:getThread', (event, threadId: string) => {
    assertTrustedIpcEvent(event);
    const validThreadId = assertValidIpcId(threadId, 'ID de conversación');
    return getChatThread(resolveDb(), validThreadId);
  });

  ipcMain.handle('chat:createThread', (event, input: CreateChatThreadInput) => {
    assertTrustedIpcEvent(event);
    return createChatThread(resolveDb(), input);
  });

  ipcMain.handle('chat:deleteThread', (event, threadId: string) => {
    assertTrustedIpcEvent(event);
    const validThreadId = assertValidIpcId(threadId, 'ID de conversación');
    deleteChatThread(resolveDb(), validThreadId);
  });

  ipcMain.handle('chat:sendMessage', (event, input: SendChatMessageInput) => {
    assertTrustedIpcEvent(event);
    return sendChatMessageService(resolveDb(), input, {
      embedder: ctx?.embedder,
      fetchFn: ctx?.fetchFn,
    });
  });

  ipcMain.handle('chat:saveMessageAsNote', (event, input: SaveChatMessageAsNoteInput) => {
    assertTrustedIpcEvent(event);
    return saveChatMessageAsNoteService(resolveDb(), input);
  });
}
