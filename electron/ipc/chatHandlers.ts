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

const activeChatControllers = new Map<string, AbortController>();

function sendChatStreamEvent(
  event: unknown,
  payload: {
    requestId: string;
    kind: 'chat';
    delta?: string;
    accumulated?: string;
  }
): void {
  const sender = (event as { sender?: { send?: (ch: string, p: unknown) => void } } | null)
    ?.sender;
  if (sender && typeof sender.send === 'function') {
    sender.send('ai:streamProgress', payload);
  }
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

  ipcMain.handle('chat:sendMessage', async (event, input: SendChatMessageInput) => {
    assertTrustedIpcEvent(event);
    const requestId =
      typeof input?.requestId === 'string' ? input.requestId.trim() : '';
    const controller = requestId ? new AbortController() : undefined;
    if (requestId && controller) {
      activeChatControllers.set(requestId, controller);
    }

    try {
      return await sendChatMessageService(resolveDb(), input, {
        embedder: ctx?.embedder,
        fetchFn: ctx?.fetchFn,
        signal: controller?.signal,
        stream: Boolean(requestId),
        onToken: requestId
          ? (delta, accumulated) => {
              sendChatStreamEvent(event, {
                requestId,
                kind: 'chat',
                delta,
                accumulated,
              });
            }
          : undefined,
      });
    } finally {
      if (requestId) {
        activeChatControllers.delete(requestId);
      }
    }
  });

  ipcMain.handle('chat:cancel', (event, requestId: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(requestId, 'ID de solicitud de chat');
    const controller = activeChatControllers.get(validId);
    if (controller) {
      controller.abort();
      activeChatControllers.delete(validId);
    }
  });

  ipcMain.handle('chat:saveMessageAsNote', (event, input: SaveChatMessageAsNoteInput) => {
    assertTrustedIpcEvent(event);
    return saveChatMessageAsNoteService(resolveDb(), input);
  });
}
