import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { isTestEnvironment } from '../security.js';
import type {
  CalendarFeed,
  GoogleCalendarSyncConfig,
  UpdateGoogleCalendarConfigInput,
} from '../types.js';

export const GOOGLE_CALENDAR_CONFIG_KEY = 'google_calendar_config';
export const GOOGLE_CALENDAR_TOKENS_KEY = 'google_calendar_tokens';

export const DEFAULT_GOOGLE_CALENDAR_CONFIG: GoogleCalendarSyncConfig = {
  clientId: '',
  connectedEmail: null,
  isConnected: false,
  targetCalendarId: 'primary',
  autoSyncEnabled: false,
  lastSyncedAt: null,
  lastSyncSummary: null,
};

export interface GoogleCalendarTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  tokenType: string;
  scope: string;
}

export type GoogleCalendarMappingEntityType = 'schedule' | 'task' | 'exam';

export interface GoogleCalendarMapping {
  id: string;
  entityType: GoogleCalendarMappingEntityType;
  entityId: string;
  googleCalendarId: string;
  googleEventId: string;
  etag: string;
  lastSyncedAt: string;
}

export interface UpsertCalendarFeedInput {
  id?: string;
  name: string;
  url: string;
  enabled?: boolean;
  rawIcsCache?: string;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  eventsCount?: number;
}

export interface UpdateCalendarFeedSyncResultInput {
  rawIcsCache?: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  eventsCount?: number;
}

export interface EnabledFeedCacheRow {
  id: string;
  name: string;
  url: string;
  rawIcsCache: string;
  lastSyncedAt: string | null;
}

export interface UpsertGoogleCalendarMappingInput {
  id?: string;
  entityType: GoogleCalendarMappingEntityType;
  entityId: string;
  googleCalendarId: string;
  googleEventId: string;
  etag?: string;
  lastSyncedAt?: string;
}

interface CalendarFeedDbRow {
  id: string;
  name: string;
  url: string;
  enabled: number;
  raw_ics_cache: string;
  last_synced_at: string | null;
  last_error: string | null;
  events_count: number;
  created_at: string;
  updated_at: string;
}

interface GoogleMappingDbRow {
  id: string;
  entity_type: GoogleCalendarMappingEntityType;
  entity_id: string;
  google_calendar_id: string;
  google_event_id: string;
  etag: string;
  last_synced_at: string;
}

interface AppSettingRow {
  value: string;
}

const VALID_ENTITY_TYPES = new Set<GoogleCalendarMappingEntityType>([
  'schedule',
  'task',
  'exam',
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapCalendarFeedRow(row: CalendarFeedDbRow): CalendarFeed {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: Boolean(row.enabled),
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    eventsCount: Number(row.events_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGoogleMappingRow(row: GoogleMappingDbRow): GoogleCalendarMapping {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    googleCalendarId: row.google_calendar_id,
    googleEventId: row.google_event_id,
    etag: row.etag,
    lastSyncedAt: row.last_synced_at,
  };
}

export function listCalendarFeeds(db: DatabaseSync): CalendarFeed[] {
  const rows = db
    .prepare(
      `SELECT id, name, url, enabled, raw_ics_cache, last_synced_at, last_error, events_count, created_at, updated_at
       FROM calendar_feeds
       ORDER BY created_at ASC, id ASC`
    )
    .all() as unknown as CalendarFeedDbRow[];

  return rows.map(mapCalendarFeedRow);
}

export function getCalendarFeedById(
  db: DatabaseSync,
  feedId: string
): CalendarFeed | null {
  const trimmedId = (feedId ?? '').trim();
  if (!trimmedId) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT id, name, url, enabled, raw_ics_cache, last_synced_at, last_error, events_count, created_at, updated_at
       FROM calendar_feeds
       WHERE id = ?`
    )
    .get(trimmedId) as CalendarFeedDbRow | undefined;

  return row ? mapCalendarFeedRow(row) : null;
}

export function upsertCalendarFeed(
  db: DatabaseSync,
  input: UpsertCalendarFeedInput
): CalendarFeed {
  const id = input.id?.trim() || randomUUID();
  const name = (input.name ?? '').trim();
  const url = (input.url ?? '').trim();

  if (!name) {
    throw new Error('El nombre de la suscripción no puede estar vacío.');
  }
  if (!url) {
    throw new Error('La URL de la suscripción no puede estar vacía.');
  }

  const enabled = input.enabled ?? true;
  const rawIcsCache = input.rawIcsCache ?? '';
  const lastSyncedAt = input.lastSyncedAt ?? null;
  const lastError = input.lastError ?? null;
  const eventsCount =
    typeof input.eventsCount === 'number' && Number.isFinite(input.eventsCount)
      ? Math.max(0, Math.floor(input.eventsCount))
      : 0;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO calendar_feeds (
       id, name, url, enabled, raw_ics_cache, last_synced_at, last_error, events_count, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       url = excluded.url,
       enabled = excluded.enabled,
       raw_ics_cache = excluded.raw_ics_cache,
       last_synced_at = excluded.last_synced_at,
       last_error = excluded.last_error,
       events_count = excluded.events_count,
       updated_at = excluded.updated_at`
  ).run(
    id,
    name,
    url,
    enabled ? 1 : 0,
    rawIcsCache,
    lastSyncedAt,
    lastError,
    eventsCount,
    now,
    now
  );

  const saved = getCalendarFeedById(db, id);
  if (!saved) {
    throw new Error('No se pudo recuperar la suscripción de calendario guardada.');
  }
  return saved;
}

export function updateCalendarFeedSyncResult(
  db: DatabaseSync,
  feedId: string,
  result: UpdateCalendarFeedSyncResultInput
): CalendarFeed {
  const existing = getCalendarFeedById(db, feedId);
  if (!existing) {
    throw new Error(`No se encontró la suscripción de calendario: ${feedId}`);
  }

  const now = new Date().toISOString();
  const hasCache = result.rawIcsCache !== undefined;
  const hasCount = result.eventsCount !== undefined;

  if (hasCache && hasCount) {
    db.prepare(
      `UPDATE calendar_feeds
       SET raw_ics_cache = ?, last_synced_at = ?, last_error = ?, events_count = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      result.rawIcsCache ?? '',
      result.lastSyncedAt,
      result.lastError,
      Math.max(0, Math.floor(result.eventsCount ?? 0)),
      now,
      existing.id
    );
  } else if (hasCache) {
    db.prepare(
      `UPDATE calendar_feeds
       SET raw_ics_cache = ?, last_synced_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      result.rawIcsCache ?? '',
      result.lastSyncedAt,
      result.lastError,
      now,
      existing.id
    );
  } else if (hasCount) {
    db.prepare(
      `UPDATE calendar_feeds
       SET last_synced_at = ?, last_error = ?, events_count = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      result.lastSyncedAt,
      result.lastError,
      Math.max(0, Math.floor(result.eventsCount ?? 0)),
      now,
      existing.id
    );
  } else {
    db.prepare(
      `UPDATE calendar_feeds
       SET last_synced_at = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    ).run(result.lastSyncedAt, result.lastError, now, existing.id);
  }

  const updated = getCalendarFeedById(db, existing.id);
  if (!updated) {
    throw new Error('No se pudo recuperar la suscripción actualizada.');
  }
  return updated;
}

export function deleteCalendarFeed(db: DatabaseSync, feedId: string): void {
  const trimmedId = (feedId ?? '').trim();
  if (!trimmedId) {
    return;
  }
  db.prepare('DELETE FROM calendar_feeds WHERE id = ?').run(trimmedId);
}

export function listEnabledFeedCaches(db: DatabaseSync): EnabledFeedCacheRow[] {
  const rows = db
    .prepare(
      `SELECT id, name, url, raw_ics_cache, last_synced_at
       FROM calendar_feeds
       WHERE enabled = 1
       ORDER BY created_at ASC, id ASC`
    )
    .all() as unknown as Array<{
    id: string;
    name: string;
    url: string;
    raw_ics_cache: string;
    last_synced_at: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    rawIcsCache: row.raw_ics_cache ?? '',
    lastSyncedAt: row.last_synced_at,
  }));
}

export function getGoogleCalendarConfig(
  db: DatabaseSync
): GoogleCalendarSyncConfig {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(GOOGLE_CALENDAR_CONFIG_KEY) as AppSettingRow | undefined;

  if (!row?.value) {
    return { ...DEFAULT_GOOGLE_CALENDAR_CONFIG };
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<GoogleCalendarSyncConfig>;
    return {
      clientId:
        typeof parsed.clientId === 'string'
          ? parsed.clientId
          : DEFAULT_GOOGLE_CALENDAR_CONFIG.clientId,
      connectedEmail:
        typeof parsed.connectedEmail === 'string' && parsed.connectedEmail.trim()
          ? parsed.connectedEmail.trim()
          : null,
      isConnected: Boolean(parsed.isConnected),
      targetCalendarId:
        typeof parsed.targetCalendarId === 'string' &&
        parsed.targetCalendarId.trim()
          ? parsed.targetCalendarId.trim()
          : DEFAULT_GOOGLE_CALENDAR_CONFIG.targetCalendarId,
      autoSyncEnabled: Boolean(parsed.autoSyncEnabled),
      lastSyncedAt:
        typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
      lastSyncSummary:
        typeof parsed.lastSyncSummary === 'string'
          ? parsed.lastSyncSummary
          : null,
    };
  } catch {
    return { ...DEFAULT_GOOGLE_CALENDAR_CONFIG };
  }
}

export function updateGoogleCalendarConfig(
  db: DatabaseSync,
  input: UpdateGoogleCalendarConfigInput & {
    isConnected?: boolean;
    lastSyncedAt?: string | null;
    lastSyncSummary?: string | null;
  }
): GoogleCalendarSyncConfig {
  const current = getGoogleCalendarConfig(db);

  let clientId = current.clientId;
  if (input.clientId !== undefined) {
    if (typeof input.clientId !== 'string') {
      throw new Error('El Client ID debe ser un texto válido.');
    }
    const trimmedClientId = input.clientId.trim();
    if (trimmedClientId && /\s/.test(trimmedClientId)) {
      throw new Error('El Client ID no puede contener espacios.');
    }
    clientId = trimmedClientId;
  }

  let targetCalendarId = current.targetCalendarId;
  if (input.targetCalendarId !== undefined) {
    if (typeof input.targetCalendarId !== 'string') {
      throw new Error('El ID de calendario debe ser un texto válido.');
    }
    const trimmedCalId = input.targetCalendarId.trim();
    if (!trimmedCalId) {
      throw new Error('El ID de calendario de Google no puede estar vacío.');
    }
    if (/\s/.test(trimmedCalId)) {
      throw new Error('El ID de calendario no puede contener espacios.');
    }
    targetCalendarId = trimmedCalId;
  }

  let autoSyncEnabled = current.autoSyncEnabled;
  if (input.autoSyncEnabled !== undefined) {
    if (typeof input.autoSyncEnabled !== 'boolean') {
      throw new Error('El campo autoSyncEnabled debe ser booleano.');
    }
    autoSyncEnabled = input.autoSyncEnabled;
  }

  let connectedEmail = current.connectedEmail;
  if (input.connectedEmail !== undefined) {
    if (input.connectedEmail === null) {
      connectedEmail = null;
    } else if (typeof input.connectedEmail === 'string') {
      const trimmedEmail = input.connectedEmail.trim();
      if (!trimmedEmail) {
        connectedEmail = null;
      } else {
        if (!EMAIL_REGEX.test(trimmedEmail)) {
          throw new Error(`El correo "${trimmedEmail}" no es válido.`);
        }
        connectedEmail = trimmedEmail;
      }
    } else {
      throw new Error('El correo conectado debe ser un texto o null.');
    }
  }

  const isConnected =
    input.isConnected !== undefined
      ? Boolean(input.isConnected)
      : input.connectedEmail !== undefined
        ? Boolean(connectedEmail)
        : current.isConnected;

  const lastSyncedAt =
    input.lastSyncedAt !== undefined ? input.lastSyncedAt : current.lastSyncedAt;
  const lastSyncSummary =
    input.lastSyncSummary !== undefined
      ? input.lastSyncSummary
      : current.lastSyncSummary;

  const nextConfig: GoogleCalendarSyncConfig = {
    clientId,
    connectedEmail,
    isConnected,
    targetCalendarId,
    autoSyncEnabled,
    lastSyncedAt,
    lastSyncSummary,
  };

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  ).run(GOOGLE_CALENDAR_CONFIG_KEY, JSON.stringify(nextConfig), now);

  return nextConfig;
}

export interface TokenCryptoAdapter {
  isAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

interface EncryptedTokenEnvelope {
  v: 1;
  alg: 'electron-safeStorage';
  payloadBase64: string;
}

const nodeRequire = createRequire(import.meta.url);

function resolveDefaultTokenCrypto(): TokenCryptoAdapter | null {
  try {
    const electronMod = nodeRequire('electron') as {
      safeStorage?: {
        isEncryptionAvailable?: () => boolean;
        encryptString?: (text: string) => Buffer;
        decryptString?: (data: Buffer) => string;
      };
    };
    const safeStorage = electronMod?.safeStorage;
    if (
      !safeStorage ||
      typeof safeStorage.isEncryptionAvailable !== 'function' ||
      typeof safeStorage.encryptString !== 'function' ||
      typeof safeStorage.decryptString !== 'function'
    ) {
      return null;
    }
    return {
      isAvailable: () => Boolean(safeStorage.isEncryptionAvailable?.()),
      encryptString: (plainText: string) =>
        safeStorage.encryptString!(plainText),
      decryptString: (encrypted: Buffer) =>
        safeStorage.decryptString!(encrypted),
    };
  } catch {
    return null;
  }
}

function normalizeParsedTokens(
  parsed: Partial<GoogleCalendarTokens> | null | undefined
): GoogleCalendarTokens | null {
  if (!parsed || typeof parsed.accessToken !== 'string' || !parsed.accessToken.trim()) {
    return null;
  }
  return {
    accessToken: parsed.accessToken,
    refreshToken:
      typeof parsed.refreshToken === 'string' && parsed.refreshToken.trim()
        ? parsed.refreshToken
        : null,
    expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : null,
    tokenType:
      typeof parsed.tokenType === 'string' && parsed.tokenType.trim()
        ? parsed.tokenType
        : 'Bearer',
    scope: typeof parsed.scope === 'string' ? parsed.scope : '',
  };
}

function isEncryptedTokenEnvelope(
  value: unknown
): value is EncryptedTokenEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.v === 1 &&
    candidate.alg === 'electron-safeStorage' &&
    typeof candidate.payloadBase64 === 'string' &&
    candidate.payloadBase64.length > 0
  );
}

export function getGoogleCalendarTokens(
  db: DatabaseSync,
  cryptoAdapter?: TokenCryptoAdapter
): GoogleCalendarTokens | null {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(GOOGLE_CALENDAR_TOKENS_KEY) as AppSettingRow | undefined;

  if (!row?.value) {
    return null;
  }

  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (isEncryptedTokenEnvelope(parsed)) {
      const adapter = cryptoAdapter ?? resolveDefaultTokenCrypto();
      if (!adapter || !adapter.isAvailable()) {
        return null;
      }
      const decryptedJson = adapter.decryptString(
        Buffer.from(parsed.payloadBase64, 'base64')
      );
      const decryptedParsed = JSON.parse(
        decryptedJson
      ) as Partial<GoogleCalendarTokens>;
      return normalizeParsedTokens(decryptedParsed);
    }

    return normalizeParsedTokens(parsed as Partial<GoogleCalendarTokens>);
  } catch {
    return null;
  }
}

export function saveGoogleCalendarTokens(
  db: DatabaseSync,
  tokens: GoogleCalendarTokens | null,
  cryptoAdapter?: TokenCryptoAdapter
): void {
  if (tokens === null) {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(
      GOOGLE_CALENDAR_TOKENS_KEY
    );
    return;
  }

  const serialized = JSON.stringify(tokens);
  const adapter = cryptoAdapter ?? resolveDefaultTokenCrypto();
  let storedValue: string;

  if (adapter && adapter.isAvailable()) {
    const encrypted = adapter.encryptString(serialized);
    const envelope: EncryptedTokenEnvelope = {
      v: 1,
      alg: 'electron-safeStorage',
      payloadBase64: encrypted.toString('base64'),
    };
    storedValue = JSON.stringify(envelope);
  } else if (!cryptoAdapter && isTestEnvironment()) {
    // Allow isolated Vitest DB tests without macOS Keychain daemon
    storedValue = serialized;
  } else {
    throw new Error(
      'El almacenamiento seguro del sistema (Keychain) no está disponible para guardar los tokens OAuth2.'
    );
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  ).run(GOOGLE_CALENDAR_TOKENS_KEY, storedValue, now);
}

export function listGoogleCalendarMappings(
  db: DatabaseSync,
  googleCalendarId?: string
): GoogleCalendarMapping[] {
  const trimmedCalId = googleCalendarId?.trim();
  const rows = (
    trimmedCalId
      ? db
          .prepare(
            `SELECT id, entity_type, entity_id, google_calendar_id, google_event_id, etag, last_synced_at
             FROM google_calendar_mappings
             WHERE google_calendar_id = ?
             ORDER BY entity_type ASC, entity_id ASC`
          )
          .all(trimmedCalId)
      : db
          .prepare(
            `SELECT id, entity_type, entity_id, google_calendar_id, google_event_id, etag, last_synced_at
             FROM google_calendar_mappings
             ORDER BY entity_type ASC, entity_id ASC`
          )
          .all()
  ) as unknown as GoogleMappingDbRow[];

  return rows.map(mapGoogleMappingRow);
}

export function upsertGoogleCalendarMapping(
  db: DatabaseSync,
  input: UpsertGoogleCalendarMappingInput
): GoogleCalendarMapping {
  if (!VALID_ENTITY_TYPES.has(input.entityType)) {
    throw new Error(`Tipo de entidad inválido para mapeo: ${String(input.entityType)}`);
  }

  const entityId = (input.entityId ?? '').trim();
  const googleCalendarId = (input.googleCalendarId ?? '').trim();
  const googleEventId = (input.googleEventId ?? '').trim();

  if (!entityId) {
    throw new Error('entityId es obligatorio para guardar el mapeo de calendario.');
  }
  if (!googleCalendarId) {
    throw new Error('googleCalendarId es obligatorio para guardar el mapeo.');
  }
  if (!googleEventId) {
    throw new Error('googleEventId es obligatorio para guardar el mapeo.');
  }

  const id = input.id?.trim() || randomUUID();
  const etag = (input.etag ?? '').trim();
  const lastSyncedAt = input.lastSyncedAt ?? new Date().toISOString();

  db.prepare(
    `INSERT INTO google_calendar_mappings (
       id, entity_type, entity_id, google_calendar_id, google_event_id, etag, last_synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity_type, entity_id, google_calendar_id) DO UPDATE SET
       google_event_id = excluded.google_event_id,
       etag = excluded.etag,
       last_synced_at = excluded.last_synced_at`
  ).run(
    id,
    input.entityType,
    entityId,
    googleCalendarId,
    googleEventId,
    etag,
    lastSyncedAt
  );

  const row = db
    .prepare(
      `SELECT id, entity_type, entity_id, google_calendar_id, google_event_id, etag, last_synced_at
       FROM google_calendar_mappings
       WHERE entity_type = ? AND entity_id = ? AND google_calendar_id = ?`
    )
    .get(input.entityType, entityId, googleCalendarId) as
    | GoogleMappingDbRow
    | undefined;

  if (!row) {
    throw new Error('No se pudo recuperar el mapeo de Google Calendar.');
  }

  return mapGoogleMappingRow(row);
}
