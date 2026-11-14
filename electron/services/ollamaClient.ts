import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  normalizeOllamaBaseUrl,
} from '../db/aiSettingsRepo.js';
import type { OllamaHealthCheckResult, OllamaModelInfo } from '../types.js';

interface OllamaTagModelPayload {
  name?: string;
  model?: string;
  size?: number;
  modified_at?: string;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaTagsResponse {
  models?: OllamaTagModelPayload[];
}

interface OllamaVersionResponse {
  version?: string;
}

interface OllamaEmbedResponse {
  embeddings?: unknown;
}

interface OllamaChatApiResponse {
  message?: {
    role?: string;
    content?: string;
  };
  response?: string;
  model?: string;
}

export interface CheckOllamaHealthOptions {
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface GenerateEmbeddingsOptions {
  baseUrl: string;
  model: string;
  inputs: string[];
  keepAlive?: string | number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowLocalFallback?: boolean;
}

export interface GenerateEmbeddingsResult {
  embeddings: Float32Array[];
  modelUsed: string;
  usedFallback: boolean;
}

export interface OllamaChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateChatCompletionOptions {
  baseUrl: string;
  model: string;
  messages: OllamaChatMessageInput[];
  keepAlive?: string | number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface GenerateChatCompletionResult {
  content: string;
  modelUsed: string;
}

function isAbortOrTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const msg = err.message.toLowerCase();
  return (
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    msg.includes('abort') ||
    msg.includes('timeout')
  );
}

function buildDisconnectedResult(params: {
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  errorMessage: string;
}): OllamaHealthCheckResult {
  return {
    status: 'disconnected',
    baseUrl: params.baseUrl,
    version: null,
    models: [],
    chatModel: params.chatModel,
    embeddingModel: params.embeddingModel,
    errorMessage: params.errorMessage,
    checkedAt: new Date().toISOString(),
  };
}

function mapTagModel(raw: OllamaTagModelPayload): OllamaModelInfo | null {
  const name = (raw.name ?? raw.model ?? '').trim();
  if (!name) {
    return null;
  }

  const sizeValue = Number(raw.size ?? 0);
  const info: OllamaModelInfo = {
    name,
    sizeBytes: Number.isFinite(sizeValue) && sizeValue >= 0 ? sizeValue : 0,
    modifiedAt: typeof raw.modified_at === 'string' ? raw.modified_at : '',
  };

  if (raw.details?.family) {
    info.family = raw.details.family;
  }
  if (raw.details?.parameter_size) {
    info.parameterSize = raw.details.parameter_size;
  }
  if (raw.details?.quantization_level) {
    info.quantizationLevel = raw.details.quantization_level;
  }

  return info;
}

async function fetchOllamaVersionSafe(
  baseUrl: string,
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, Math.min(timeoutMs, 1500));

  try {
    const res = await fetchFn(`${baseUrl}/api/version`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as OllamaVersionResponse | null;
    return typeof data?.version === 'string' && data.version.trim()
      ? data.version.trim()
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks connectivity against a local Ollama server via /api/tags (and optionally /api/version).
 * Never throws unhandled exceptions; always returns a structured OllamaHealthCheckResult.
 */
export async function checkOllamaHealth(
  options?: CheckOllamaHealthOptions
): Promise<OllamaHealthCheckResult> {
  const chatModel = options?.chatModel?.trim() || DEFAULT_CHAT_MODEL;
  const embeddingModel =
    options?.embeddingModel?.trim() || DEFAULT_EMBEDDING_MODEL;
  const rawBaseUrl = options?.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;

  let baseUrl: string;
  try {
    baseUrl = normalizeOllamaBaseUrl(rawBaseUrl);
  } catch (err) {
    return buildDisconnectedResult({
      baseUrl: typeof rawBaseUrl === 'string' ? rawBaseUrl.trim() : '',
      chatModel,
      embeddingModel,
      errorMessage:
        err instanceof Error
          ? err.message
          : 'La URL del servidor Ollama no es válida.',
    });
  }

  const fetchFn = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 3000;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchFn(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return buildDisconnectedResult({
        baseUrl,
        chatModel,
        embeddingModel,
        errorMessage: `Ollama respondió con error HTTP ${response.status} en ${baseUrl}. Verificá que el servicio esté funcionando correctamente.`,
      });
    }

    let payload: OllamaTagsResponse | null;
    try {
      payload = (await response.json()) as OllamaTagsResponse | null;
    } catch {
      return buildDisconnectedResult({
        baseUrl,
        chatModel,
        embeddingModel,
        errorMessage: `Ollama en ${baseUrl} devolvió una respuesta JSON inválida.`,
      });
    }

    if (!payload || typeof payload !== 'object') {
      return buildDisconnectedResult({
        baseUrl,
        chatModel,
        embeddingModel,
        errorMessage: `Ollama en ${baseUrl} devolvió una respuesta inesperada.`,
      });
    }

    const models = Array.isArray(payload.models)
      ? payload.models
          .map(mapTagModel)
          .filter((item): item is OllamaModelInfo => item !== null)
      : [];

    const version = await fetchOllamaVersionSafe(baseUrl, fetchFn, timeoutMs);

    return {
      status: 'connected',
      baseUrl,
      version,
      models,
      chatModel,
      embeddingModel,
      errorMessage: null,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const errorMessage = isAbortOrTimeoutError(err)
      ? `Tiempo de espera agotado al conectar con Ollama en ${baseUrl}. Asegurate de que la aplicación Ollama esté abierta o ejecutá 'ollama serve' en tu terminal.`
      : `No se pudo conectar con Ollama en ${baseUrl}. Asegurate de que la aplicación Ollama esté abierta o ejecutá 'ollama serve' en tu terminal.`;

    return buildDisconnectedResult({
      baseUrl,
      chatModel,
      embeddingModel,
      errorMessage,
    });
  } finally {
    clearTimeout(timer);
  }
}

function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function accumulateSignedFeature(
  vec: Float32Array,
  feature: string,
  weight: number
): void {
  const index = fnv1a32(feature, 0x811c9dc5) % vec.length;
  const sign = (fnv1a32(feature, 0x9e3779b9) & 1) === 0 ? 1 : -1;
  vec[index] += sign * weight;
}

/**
 * Computes a deterministic L2-normalized local embedding vector using
 * accent-stripped words and character trigrams hashed with signed FNV-1a.
 */
export function computeDeterministicLocalEmbedding(
  text: string,
  dim = 128
): Float32Array {
  if (!Number.isInteger(dim) || dim <= 0) {
    throw new Error('La dimensión del embedding debe ser un entero positivo.');
  }

  const vec = new Float32Array(dim);
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const word of words) {
    accumulateSignedFeature(vec, `w:${word}`, 1.0);
    if (word.length >= 3) {
      for (let i = 0; i <= word.length - 3; i++) {
        accumulateSignedFeature(vec, `t:${word.slice(i, i + 3)}`, 0.5);
      }
    }
  }

  let normSq = 0;
  for (let i = 0; i < dim; i++) {
    normSq += vec[i] * vec[i];
  }
  if (normSq > 0) {
    const invNorm = 1 / Math.sqrt(normSq);
    for (let i = 0; i < dim; i++) {
      vec[i] *= invNorm;
    }
  }

  return vec;
}

function buildLocalFallbackEmbeddings(
  inputs: string[]
): GenerateEmbeddingsResult {
  return {
    embeddings: inputs.map((text) => computeDeterministicLocalEmbedding(text)),
    modelUsed: 'local-hash-v1',
    usedFallback: true,
  };
}

/**
 * Generates dense embeddings via Ollama's /api/embed endpoint, falling back
 * to deterministic local hash embeddings unless allowLocalFallback is false.
 */
export async function generateEmbeddings(
  options: GenerateEmbeddingsOptions
): Promise<GenerateEmbeddingsResult> {
  if (options.inputs.length === 0) {
    return {
      embeddings: [],
      modelUsed: options.model,
      usedFallback: false,
    };
  }

  const allowFallback = options.allowLocalFallback !== false;
  let baseUrl: string;
  try {
    baseUrl = normalizeOllamaBaseUrl(options.baseUrl);
  } catch (err) {
    if (!allowFallback) {
      throw err;
    }
    return buildLocalFallbackEmbeddings(options.inputs);
  }

  const fetchFn = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchFn(`${baseUrl}/api/embed`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        input: options.inputs,
        ...(options.keepAlive !== undefined
          ? { keep_alive: options.keepAlive }
          : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama /api/embed respondió con estado HTTP ${response.status}.`
      );
    }

    const data = (await response.json()) as OllamaEmbedResponse | null;
    const rawEmbeddings = data?.embeddings;
    if (
      !Array.isArray(rawEmbeddings) ||
      rawEmbeddings.length !== options.inputs.length
    ) {
      throw new Error('Ollama /api/embed devolvió una cantidad inválida de vectores.');
    }

    const embeddings = rawEmbeddings.map((vec) => {
      if (
        !Array.isArray(vec) ||
        vec.length === 0 ||
        !vec.every((n) => typeof n === 'number' && Number.isFinite(n))
      ) {
        throw new Error('Ollama /api/embed devolvió un vector de embedding inválido.');
      }
      return new Float32Array(vec);
    });

    return {
      embeddings,
      modelUsed: options.model,
      usedFallback: false,
    };
  } catch (err) {
    if (!allowFallback) {
      throw err instanceof Error
        ? err
        : new Error('No se pudieron generar los embeddings con Ollama.');
    }
    return buildLocalFallbackEmbeddings(options.inputs);
  } finally {
    clearTimeout(timer);
  }
}

function parseChatResponsePayload(rawText: string): {
  content: string;
  model: string | null;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Ollama /api/chat devolvió una respuesta vacía.');
  }

  try {
    const parsed = JSON.parse(trimmed) as OllamaChatApiResponse | null;
    const singleContent =
      typeof parsed?.message?.content === 'string'
        ? parsed.message.content
        : typeof parsed?.response === 'string'
          ? parsed.response
          : '';
    if (singleContent) {
      return {
        content: singleContent.trim(),
        model: typeof parsed?.model === 'string' ? parsed.model : null,
      };
    }
  } catch {
    // Fall through to NDJSON parsing
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw new Error('Ollama /api/chat devolvió una respuesta vacía.');
  }

  let combined = '';
  let detectedModel: string | null = null;
  for (const line of lines) {
    let chunk: OllamaChatApiResponse | null = null;
    try {
      chunk = JSON.parse(line) as OllamaChatApiResponse | null;
    } catch {
      throw new Error('Ollama /api/chat devolvió un formato JSON inválido.');
    }
    if (typeof chunk?.message?.content === 'string') {
      combined += chunk.message.content;
    } else if (typeof chunk?.response === 'string') {
      combined += chunk.response;
    }
    if (typeof chunk?.model === 'string' && chunk.model.trim()) {
      detectedModel = chunk.model.trim();
    }
  }

  if (!combined.trim()) {
    throw new Error('Ollama /api/chat no devolvió contenido generado.');
  }

  return {
    content: combined.trim(),
    model: detectedModel,
  };
}

/**
 * Generates a single non-streaming chat completion via Ollama's /api/chat endpoint.
 * Defaults `keep_alive` to '0s' so Ollama unloads the model immediately after responding.
 */
export async function generateChatCompletion(
  options: GenerateChatCompletionOptions
): Promise<GenerateChatCompletionResult> {
  if (!Array.isArray(options.messages) || options.messages.length === 0) {
    throw new Error('La conversación debe incluir al menos un mensaje.');
  }

  const model = options.model.trim();
  if (!model) {
    throw new Error('Tenés que configurar un modelo de chat de Ollama.');
  }

  const baseUrl = normalizeOllamaBaseUrl(options.baseUrl);
  const fetchFn = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60000;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchFn(`${baseUrl}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        stream: false,
        keep_alive: options.keepAlive ?? '0s',
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama /api/chat respondió con estado HTTP ${response.status}.`
      );
    }

    const rawBody = await response.text();
    const parsed = parseChatResponsePayload(rawBody);
    return {
      content: parsed.content,
      modelUsed: parsed.model ?? model,
    };
  } catch (err) {
    if (isAbortOrTimeoutError(err)) {
      throw new Error(
        `Tiempo de espera agotado al consultar Ollama en ${baseUrl}.`
      );
    }
    throw err instanceof Error
      ? err
      : new Error('No se pudo obtener respuesta desde Ollama.');
  } finally {
    clearTimeout(timer);
  }
}
