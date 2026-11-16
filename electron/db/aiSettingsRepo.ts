import type { DatabaseSync } from 'node:sqlite';
import { isLocalOrLanOllamaHostname } from '../security.js';
import type { AiSettings, UpdateAiSettingsInput } from '../types.js';

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
export const DEFAULT_CHAT_MODEL = 'llama3.2';
export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';

export const AI_SETTINGS_KEYS = {
  baseUrl: 'ollama_base_url',
  chatModel: 'ollama_chat_model',
  embeddingModel: 'ollama_embedding_model',
} as const;

/**
 * Trims whitespace, strips repeated trailing slashes, validates http:/https:,
 * and restricts Ollama endpoints to localhost/loopback/LAN .local hosts by default.
 */
export function normalizeOllamaBaseUrl(
  rawUrl: string,
  options?: { allowRemote?: boolean }
): string {
  if (typeof rawUrl !== 'string') {
    throw new Error('La URL del servidor Ollama debe ser un texto válido.');
  }

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

  if (!options?.allowRemote && !isLocalOrLanOllamaHostname(parsed.hostname)) {
    throw new Error(
      'Por privacidad, Ollama solo permite hosts locales (localhost, 127.0.0.1, ::1 o .local).'
    );
  }

  return trimmed;
}

interface AppSettingRow {
  key: string;
  value: string;
}

export function getAiSettings(db: DatabaseSync): AiSettings {
  const rows = db
    .prepare(
      'SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)'
    )
    .all(
      AI_SETTINGS_KEYS.baseUrl,
      AI_SETTINGS_KEYS.chatModel,
      AI_SETTINGS_KEYS.embeddingModel
    ) as unknown as AppSettingRow[];

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }

  const rawBaseUrl = map.get(AI_SETTINGS_KEYS.baseUrl)?.trim() ?? '';
  let baseUrl = DEFAULT_OLLAMA_BASE_URL;
  if (rawBaseUrl) {
    try {
      baseUrl = normalizeOllamaBaseUrl(rawBaseUrl);
    } catch {
      baseUrl = DEFAULT_OLLAMA_BASE_URL;
    }
  }

  const chatModel =
    map.get(AI_SETTINGS_KEYS.chatModel)?.trim() || DEFAULT_CHAT_MODEL;
  const embeddingModel =
    map.get(AI_SETTINGS_KEYS.embeddingModel)?.trim() || DEFAULT_EMBEDDING_MODEL;

  return {
    baseUrl,
    chatModel,
    embeddingModel,
  };
}

export function updateAiSettings(
  db: DatabaseSync,
  input: UpdateAiSettingsInput
): AiSettings {
  const updates: Array<[string, string]> = [];

  if (input.baseUrl !== undefined) {
    updates.push([
      AI_SETTINGS_KEYS.baseUrl,
      normalizeOllamaBaseUrl(input.baseUrl),
    ]);
  }

  if (input.chatModel !== undefined) {
    const chatModel =
      typeof input.chatModel === 'string' ? input.chatModel.trim() : '';
    if (!chatModel) {
      throw new Error('El modelo de chat no puede estar vacío.');
    }
    updates.push([AI_SETTINGS_KEYS.chatModel, chatModel]);
  }

  if (input.embeddingModel !== undefined) {
    const embeddingModel =
      typeof input.embeddingModel === 'string'
        ? input.embeddingModel.trim()
        : '';
    if (!embeddingModel) {
      throw new Error('El modelo de embeddings no puede estar vacío.');
    }
    updates.push([AI_SETTINGS_KEYS.embeddingModel, embeddingModel]);
  }

  if (updates.length === 0) {
    return getAiSettings(db);
  }

  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const upsertStmt = db.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    );

    for (const [key, value] of updates) {
      upsertStmt.run(key, value, now);
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return getAiSettings(db);
}
