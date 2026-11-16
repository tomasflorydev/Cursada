import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers.set(channel, handler);
    }),
  },
}));

import {
  appendChatMessage,
  createChatThread,
  DEFAULT_CHAT_THREAD_TITLE,
  deleteChatThread,
  getChatMessageById,
  getChatThread,
  listChatThreads,
} from '../../electron/db/chatRepo';
import { createCourse } from '../../electron/db/coursesRepo';
import { createTestDatabase } from '../../electron/db/database';
import { getNoteById } from '../../electron/db/notesRepo';
import { registerChatHandlers } from '../../electron/ipc/chatHandlers';
import {
  EXTRACTIVE_FALLBACK_MODEL_ID,
  saveChatMessageAsNoteService,
  sendChatMessageService,
} from '../../electron/services/ragService';
import {
  createSourceFromTextService,
  type SourceEmbedder,
} from '../../electron/services/sourcesService';

function createDeterministicEmbedder(): SourceEmbedder {
  return async (texts: string[]) => ({
    modelUsed: 'test-embedder',
    embeddings: texts.map((text) => {
      const vec = new Float32Array(8);
      const lower = text.toLowerCase();
      if (lower.includes('requisito') || lower.includes('validación')) vec[0] += 1;
      if (lower.includes('arquitectura') || lower.includes('capas')) vec[1] += 1;
      if (lower.includes('prueba') || lower.includes('test')) vec[2] += 1;
      vec[3] = 0.25;
      return vec;
    }),
  });
}

describe('Phase 6 — chatRepo, ragService, and chatHandlers', () => {
  let dbCtx: ReturnType<typeof createTestDatabase>;
  let db: DatabaseSync;
  let courseId: string;

  beforeEach(() => {
    registeredHandlers.clear();
    dbCtx = createTestDatabase({ inMemory: true });
    db = dbCtx.db;
    const course = createCourse(db, {
      name: 'Ingeniería de Software II',
      color: 'blue',
      term: '1C 2026',
      professor: 'Dra. Gómez',
    });
    courseId = course.id;
  });

  afterEach(() => {
    dbCtx.close();
  });

  it('handles chatRepo CRUD, auto-title <= 56 chars, corrupt JSON guard, and cascade delete', () => {
    const defaultThread = createChatThread(db, { courseId });
    expect(defaultThread.title).toBe(DEFAULT_CHAT_THREAD_TITLE);

    const customThread = createChatThread(db, {
      courseId,
      title: 'Consultas de arquitectura',
    });
    expect(customThread.title).toBe('Consultas de arquitectura');

    const longQuestion =
      '   ¿Cómo se relacionan   los requisitos funcionales con las pruebas de aceptación en iteraciones cortas?   ';
    const userMsg = appendChatMessage(db, {
      threadId: defaultThread.id,
      role: 'user',
      content: longQuestion,
    });
    expect(userMsg.role).toBe('user');
    expect(userMsg.citations).toEqual([]);

    const afterUser = getChatThread(db, defaultThread.id);
    expect(afterUser).not.toBeNull();
    expect(afterUser!.title).not.toBe(DEFAULT_CHAT_THREAD_TITLE);
    expect(afterUser!.title.length).toBeLessThanOrEqual(56);
    expect(afterUser!.title.endsWith('...')).toBe(true);
    expect(afterUser!.title.startsWith('¿Cómo se relacionan los requisitos')).toBe(true);

    const assistantMsg = appendChatMessage(db, {
      threadId: defaultThread.id,
      role: 'assistant',
      content: 'Respuesta con cita [1].',
      citations: [
        {
          citationNumber: 1,
          chunkId: 'chunk-1',
          sourceId: 'src-1',
          sourceTitle: 'Apunte Clase 1',
          sourceType: 'pdf',
          pageNumber: 4,
          excerpt: 'Los requisitos funcionales guían la aceptación.',
          score: 0.91,
        },
      ],
      modelUsed: 'llama3.2',
    });

    const fetchedMsg = getChatMessageById(db, assistantMsg.id);
    expect(fetchedMsg).not.toBeNull();
    expect(fetchedMsg!.courseId).toBe(courseId);
    expect(fetchedMsg!.citations).toHaveLength(1);
    expect(fetchedMsg!.citations[0].pageNumber).toBe(4);

    // Most recently updated thread should appear first
    const listed = listChatThreads(db, courseId);
    expect(listed.map((t) => t.id)).toEqual([defaultThread.id, customThread.id]);

    // Corrupt citations_json safely degrades to []
    db.prepare('UPDATE chat_messages SET citations_json = ? WHERE id = ?').run(
      '{invalid-json',
      assistantMsg.id
    );
    const reloadedAfterCorrupt = getChatThread(db, defaultThread.id);
    expect(reloadedAfterCorrupt!.messages[1].citations).toEqual([]);

    // Cascade delete removes thread and child messages
    expect(deleteChatThread(db, defaultThread.id)).toBe(true);
    expect(deleteChatThread(db, defaultThread.id)).toBe(false);
    expect(getChatThread(db, defaultThread.id)).toBeNull();
    const remainingMessages = db
      .prepare('SELECT COUNT(*) AS count FROM chat_messages WHERE thread_id = ?')
      .get(defaultThread.id) as { count: number };
    expect(remainingMessages.count).toBe(0);
  });

  it('retrieves top chunks, passes customInstructions + history, and sends keep_alive: "0s" to /api/chat', async () => {
    const embedder = createDeterministicEmbedder();
    await createSourceFromTextService(
      db,
      {
        courseId,
        title: 'Guía de Requisitos y Validación',
        text:
          'Los requisitos funcionales describen servicios concretos del sistema y su validación requiere criterios verificables antes del cierre del sprint.',
      },
      { embedder }
    );

    const capturedRequests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const parsedBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      capturedRequests.push({ url, body: parsedBody });

      return new Response(
        JSON.stringify({
          model: 'llama3.2',
          message: {
            role: 'assistant',
            content:
              '- Los requisitos funcionales definen servicios concretos [1].\n- Deben validarse con criterios verificables [1].',
          },
          done: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const firstTurn = await sendChatMessageService(
      db,
      {
        courseId,
        content: '¿Qué definen los requisitos funcionales y cómo se validan?',
        customInstructions: 'Respondé únicamente en 2 bullets bien cortos.',
      },
      { embedder, fetchFn }
    );

    expect(firstTurn.assistantMessage.modelUsed).toBe('llama3.2');
    expect(firstTurn.assistantMessage.citations.length).toBeGreaterThan(0);
    expect(firstTurn.assistantMessage.citations[0].citationNumber).toBe(1);
    expect(firstTurn.assistantMessage.citations[0].sourceTitle).toBe(
      'Guía de Requisitos y Validación'
    );
    expect(firstTurn.thread.title).not.toBe(DEFAULT_CHAT_THREAD_TITLE);

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].url).toContain('/api/chat');
    expect(capturedRequests[0].body.keep_alive).toBe('0s');

    const sentMessages = capturedRequests[0].body.messages as Array<{
      role: string;
      content: string;
    }>;
    expect(sentMessages[0].role).toBe('system');
    expect(sentMessages[0].content).toContain('Respondé únicamente en 2 bullets bien cortos.');
    expect(sentMessages[sentMessages.length - 1].content).toContain('[1] Guía de Requisitos y Validación');

    // Second turn on existing thread includes prior turn messages
    await sendChatMessageService(
      db,
      {
        courseId,
        threadId: firstTurn.thread.id,
        content: 'Dame un ejemplo práctico de validación.',
      },
      { embedder, fetchFn }
    );

    expect(capturedRequests).toHaveLength(2);
    const secondTurnMessages = capturedRequests[1].body.messages as Array<{
      role: string;
      content: string;
    }>;
    expect(secondTurnMessages.some((m) => m.role === 'user' && m.content.includes('¿Qué definen los requisitos'))).toBe(
      true
    );
    expect(
      secondTurnMessages.some((m) => m.role === 'assistant' && m.content.includes('criterios verificables [1]'))
    ).toBe(true);
  });

  it('falls back cleanly to extractive Spanish response when Ollama is offline', async () => {
    const embedder = createDeterministicEmbedder();
    await createSourceFromTextService(
      db,
      {
        courseId,
        title: 'Arquitectura en Capas',
        text:
          'Una arquitectura en capas separa la presentación, la lógica de negocio y la persistencia en módulos desacoplados.',
      },
      { embedder }
    );

    const offlineFetch = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
    }) as unknown as typeof fetch;

    const withSources = await sendChatMessageService(
      db,
      {
        courseId,
        content: '¿Cómo organiza los módulos la arquitectura en capas?',
        customInstructions: 'Sé breve',
      },
      { embedder, fetchFn: offlineFetch }
    );

    expect(withSources.assistantMessage.modelUsed).toBe(EXTRACTIVE_FALLBACK_MODEL_ID);
    expect(withSources.assistantMessage.citations.length).toBeGreaterThan(0);
    expect(withSources.assistantMessage.content).toContain('[1]');
    expect(withSources.assistantMessage.content).toContain('Arquitectura en Capas');

    // Empty course without matching sources also returns honest extractive fallback
    const emptyCourse = createCourse(db, {
      name: 'Física II',
      color: 'emerald',
      term: '1C 2026',
    });
    const withoutSources = await sendChatMessageService(
      db,
      {
        courseId: emptyCourse.id,
        content: '¿Qué es la ley de Gauss?',
      },
      { embedder, fetchFn: offlineFetch }
    );

    expect(withoutSources.assistantMessage.modelUsed).toBe(EXTRACTIVE_FALLBACK_MODEL_ID);
    expect(withoutSources.assistantMessage.citations).toEqual([]);
    expect(withoutSources.assistantMessage.content).toContain('Física II');
  });

  it('saves assistant message as ai_summary note with ## Fuentes citadas', async () => {
    const embedder = createDeterministicEmbedder();
    await createSourceFromTextService(
      db,
      {
        courseId,
        title: 'Apunte de Pruebas',
        text:
          'Las pruebas unitarias verifican componentes aislados mientras que las pruebas de integración validan módulos colaborando.',
      },
      { embedder }
    );

    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'llama3.2',
          message: {
            role: 'assistant',
            content: '## Tipos de pruebas\n\nLas pruebas unitarias validan unidades aisladas [1].',
          },
          done: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    const chatResult = await sendChatMessageService(
      db,
      {
        courseId,
        content: 'Explicame pruebas unitarias',
      },
      { embedder, fetchFn }
    );

    const savedNote = saveChatMessageAsNoteService(db, {
      messageId: chatResult.assistantMessage.id,
    });

    expect(savedNote.origin).toBe('ai_summary');
    expect(savedNote.courseId).toBe(courseId);
    expect(savedNote.title).toBe('Tipos de pruebas');
    expect(savedNote.content).toContain('## Fuentes citadas');
    expect(savedNote.content).toContain('[1] **Apunte de Pruebas**');

    const persisted = getNoteById(db, savedNote.id);
    expect(persisted).not.toBeNull();
    expect(persisted!.title).toBe('Tipos de pruebas');
  });

  it('registers and executes all 6 chat:* IPC handlers cleanly', async () => {
    const embedder = createDeterministicEmbedder();
    await createSourceFromTextService(
      db,
      {
        courseId,
        title: 'Clase Arquitectura IPC',
        text:
          'La arquitectura por capas en Electron separa preload, ipc handlers, services y repositorios SQLite.',
      },
      { embedder }
    );

    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'llama3.2',
          message: {
            role: 'assistant',
            content: 'Electron organiza el backend en handlers, services y repositorios [1].',
          },
          done: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    registerChatHandlers({ db, embedder, fetchFn });

    const expectedChannels = [
      'chat:listThreads',
      'chat:getThread',
      'chat:createThread',
      'chat:deleteThread',
      'chat:sendMessage',
      'chat:saveMessageAsNote',
    ];
    for (const channel of expectedChannels) {
      expect(registeredHandlers.has(channel)).toBe(true);
    }

    const createHandler = registeredHandlers.get('chat:createThread')!;
    const listHandler = registeredHandlers.get('chat:listThreads')!;
    const sendHandler = registeredHandlers.get('chat:sendMessage')!;
    const getHandler = registeredHandlers.get('chat:getThread')!;
    const saveNoteHandler = registeredHandlers.get('chat:saveMessageAsNote')!;
    const deleteHandler = registeredHandlers.get('chat:deleteThread')!;

    const createdThread = (await createHandler({}, { courseId })) as { id: string };
    const listed = (await listHandler({}, courseId)) as Array<{ id: string }>;
    expect(listed.some((t) => t.id === createdThread.id)).toBe(true);

    const sent = (await sendHandler(
      {},
      {
        courseId,
        threadId: createdThread.id,
        content: '¿Cómo se organiza Electron por capas?',
      }
    )) as { assistantMessage: { id: string } };

    const loaded = (await getHandler({}, createdThread.id)) as {
      messages: Array<{ id: string }>;
    };
    expect(loaded.messages).toHaveLength(2);

    const note = (await saveNoteHandler(
      {},
      { messageId: sent.assistantMessage.id, title: 'Nota desde IPC' }
    )) as { id: string; title: string };
    expect(note.title).toBe('Nota desde IPC');

    await deleteHandler({}, createdThread.id);
    const afterDelete = await getHandler({}, createdThread.id);
    expect(afterDelete).toBeNull();

    // Streaming NDJSON + cancellation via chat:cancel
    expect(registeredHandlers.has('chat:cancel')).toBe(true);
    let signalAborted = false;
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const abortableFetch = vi.fn<typeof fetch>((_url, init) => {
      resolveStarted();
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          signalAborted = true;
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const cancelHandlersMap = new Map<string, (...args: unknown[]) => unknown>();
    registerChatHandlers({
      db,
      embedder,
      fetchFn: abortableFetch,
    });
    // Re-capture latest registered handlers
    const latestSend = registeredHandlers.get('chat:sendMessage')!;
    const latestCancel = registeredHandlers.get('chat:cancel')!;
    void cancelHandlersMap;

    const sendPromise = latestSend(
      {},
      {
        requestId: 'chat-req-abort-1',
        courseId,
        content: 'Explicame capas de IPC',
      }
    );
    await started;
    latestCancel({}, 'chat-req-abort-1');
    await expect(sendPromise).rejects.toThrow(/cancelad/i);
    expect(signalAborted).toBe(true);
  });
});
