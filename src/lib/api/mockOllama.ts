import type {
  AiSettings,
  OllamaConnectionStatus,
  OllamaHealthCheckResult,
  OllamaModelInfo,
  UpdateAiSettingsInput,
} from '../../types/domain';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_CHAT_MODEL = 'llama3.2:latest';
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text:latest';
const DEFAULT_OLLAMA_VERSION = '0.5.7';

const DEFAULT_MOCK_MODELS: OllamaModelInfo[] = [
  {
    name: 'llama3.2:latest',
    sizeBytes: 2_019_393_189,
    modifiedAt: '2026-11-10T10:00:00.000Z',
    family: 'llama',
    parameterSize: '3.2B',
    quantizationLevel: 'Q4_K_M',
  },
  {
    name: 'qwen2.5:7b',
    sizeBytes: 4_683_075_271,
    modifiedAt: '2026-11-11T14:20:00.000Z',
    family: 'qwen2',
    parameterSize: '7.6B',
    quantizationLevel: 'Q4_K_M',
  },
  {
    name: 'nomic-embed-text:latest',
    sizeBytes: 274_302_450,
    modifiedAt: '2026-11-10T10:05:00.000Z',
    family: 'nomic-bert',
    parameterSize: '137M',
    quantizationLevel: 'F16',
  },
  {
    name: 'mxbai-embed-large:latest',
    sizeBytes: 669_615_493,
    modifiedAt: '2026-11-12T09:15:00.000Z',
    family: 'bert',
    parameterSize: '335M',
    quantizationLevel: 'F16',
  },
];

export interface MockOllamaConnectionState {
  status: OllamaConnectionStatus;
  errorMessage?: string;
  models?: OllamaModelInfo[];
  version?: string | null;
}

let aiSettingsStore: AiSettings = {
  baseUrl: DEFAULT_OLLAMA_BASE_URL,
  chatModel: DEFAULT_CHAT_MODEL,
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
};

let connectionStatus: OllamaConnectionStatus = 'connected';
let mockErrorMessage: string | null = null;
let mockModels: OllamaModelInfo[] = structuredClone(DEFAULT_MOCK_MODELS);
let mockVersion: string | null = DEFAULT_OLLAMA_VERSION;

function normalizeMockBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('La URL del servidor Ollama no puede estar vacía.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `La URL "${trimmed}" no es válida. Usá el formato http://localhost:11434.`
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Protocolo no soportado ("${parsed.protocol}"). La URL de Ollama debe usar http:// o https://.`
    );
  }

  if (!parsed.hostname) {
    throw new Error('La URL del servidor Ollama debe incluir un host válido.');
  }

  return trimmed;
}

export function setMockOllamaConnectionState(
  state: MockOllamaConnectionState
): void {
  connectionStatus = state.status;
  if (state.models !== undefined) {
    mockModels = structuredClone(state.models);
  } else if (state.status === 'connected') {
    mockModels = structuredClone(DEFAULT_MOCK_MODELS);
  }

  if (state.version !== undefined) {
    mockVersion = state.version;
  } else if (state.status === 'connected') {
    mockVersion = DEFAULT_OLLAMA_VERSION;
  }

  mockErrorMessage =
    state.errorMessage !== undefined ? state.errorMessage : null;
}

export function resetMockOllama(): void {
  aiSettingsStore = {
    baseUrl: DEFAULT_OLLAMA_BASE_URL,
    chatModel: DEFAULT_CHAT_MODEL,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
  };
  connectionStatus = 'connected';
  mockErrorMessage = null;
  mockModels = structuredClone(DEFAULT_MOCK_MODELS);
  mockVersion = DEFAULT_OLLAMA_VERSION;
}

export async function mockGetAiSettings(): Promise<AiSettings> {
  return structuredClone(aiSettingsStore);
}

export async function mockUpdateAiSettings(
  input: UpdateAiSettingsInput
): Promise<AiSettings> {
  const nextBaseUrl =
    input.baseUrl !== undefined
      ? normalizeMockBaseUrl(input.baseUrl)
      : aiSettingsStore.baseUrl;

  let nextChatModel = aiSettingsStore.chatModel;
  if (input.chatModel !== undefined) {
    const trimmed = input.chatModel.trim();
    if (!trimmed) {
      throw new Error('El modelo de chat no puede estar vacío.');
    }
    nextChatModel = trimmed;
  }

  let nextEmbeddingModel = aiSettingsStore.embeddingModel;
  if (input.embeddingModel !== undefined) {
    const trimmed = input.embeddingModel.trim();
    if (!trimmed) {
      throw new Error('El modelo de embeddings no puede estar vacío.');
    }
    nextEmbeddingModel = trimmed;
  }

  aiSettingsStore = {
    baseUrl: nextBaseUrl,
    chatModel: nextChatModel,
    embeddingModel: nextEmbeddingModel,
  };

  return structuredClone(aiSettingsStore);
}

export async function mockCheckOllamaStatus(
  baseUrl?: string
): Promise<OllamaHealthCheckResult> {
  const candidateUrl = baseUrl !== undefined ? baseUrl : aiSettingsStore.baseUrl;

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeMockBaseUrl(candidateUrl);
  } catch (err) {
    return {
      status: 'disconnected',
      baseUrl: candidateUrl.trim(),
      version: null,
      models: [],
      chatModel: aiSettingsStore.chatModel,
      embeddingModel: aiSettingsStore.embeddingModel,
      errorMessage:
        err instanceof Error
          ? err.message
          : 'La URL del servidor Ollama no es válida.',
      checkedAt: new Date().toISOString(),
    };
  }

  if (connectionStatus === 'disconnected') {
    return {
      status: 'disconnected',
      baseUrl: normalizedUrl,
      version: null,
      models: [],
      chatModel: aiSettingsStore.chatModel,
      embeddingModel: aiSettingsStore.embeddingModel,
      errorMessage:
        mockErrorMessage ??
        `No se pudo conectar con Ollama en ${normalizedUrl}. Asegurate de que la aplicación Ollama esté abierta o ejecutá 'ollama serve' en tu terminal.`,
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    status: 'connected',
    baseUrl: normalizedUrl,
    version: mockVersion,
    models: structuredClone(mockModels),
    chatModel: aiSettingsStore.chatModel,
    embeddingModel: aiSettingsStore.embeddingModel,
    errorMessage: null,
    checkedAt: new Date().toISOString(),
  };
}

export interface BrowserOllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BrowserOllamaChatResult {
  content: string;
  modelUsed: string;
}

/**
 * Calls a local Ollama server directly from browser/web mode using on-demand loading
 * (`keep_alive: '0s'`). Returns null in Vitest or when Ollama is unreachable so callers
 * can fall back to deterministic local templates.
 */
export async function tryBrowserOllamaChatCompletion(options: {
  messages: BrowserOllamaChatMessage[];
  timeoutMs?: number;
}): Promise<BrowserOllamaChatResult | null> {
  if (
    typeof fetch !== 'function' ||
    (typeof process !== 'undefined' && Boolean(process.env?.VITEST)) ||
    connectionStatus !== 'connected'
  ) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);

  try {
    const response = await fetch(`${aiSettingsStore.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: aiSettingsStore.chatModel,
        messages: options.messages,
        stream: false,
        keep_alive: '0s',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      model?: string;
      message?: { content?: string };
      response?: string;
    };
    const content = (data.message?.content ?? data.response ?? '').trim();
    if (!content) {
      return null;
    }

    return {
      content,
      modelUsed: data.model?.trim() || aiSettingsStore.chatModel,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
