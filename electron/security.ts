import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface AppOriginOptions {
  isPackagedBundle: boolean;
  loadDist: boolean;
  devServerUrl: string;
  distHtmlPath: string;
}

const PRIVATE_OR_LOCAL_IPV4_REGEX =
  /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const PROD_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function getDevCspDirectives(devServerUrl: string): string {
  let httpOrigin = 'http://localhost:5173';
  let wsOrigin = 'ws://localhost:5173';
  try {
    const parsed = new URL(devServerUrl);
    httpOrigin = parsed.origin;
    wsOrigin = `${parsed.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsed.host}`;
  } catch {
    // Keep default localhost Vite origins
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${httpOrigin}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${httpOrigin} ${wsOrigin} http://localhost:11434 http://127.0.0.1:11434`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/**
 * Unifies Chromium's `userData` directory (LocalStorage, caches) with SQLite's
 * `~/Library/Application Support/com.cursada.app` directory. During smoke tests,
 * respects `CURSADA_DATA_DIR` when explicitly provided.
 */
export function resolveUnifiedUserDataDir(
  appDataDir: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const customDataDir = env.CURSADA_DATA_DIR?.trim();
  if (customDataDir) {
    return path.resolve(customDataDir);
  }
  return path.join(appDataDir, 'com.cursada.app');
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isAllowedAppNavigation(
  targetUrl: string,
  options: AppOriginOptions
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }

  if (!options.isPackagedBundle && !options.loadDist) {
    try {
      const devOrigin = new URL(options.devServerUrl).origin;
      return parsed.origin === devOrigin;
    } catch {
      return false;
    }
  }

  const expectedFileUrl = pathToFileURL(path.resolve(options.distHtmlPath)).href;
  const targetWithoutHashOrQuery = `${parsed.origin}${parsed.pathname}`;
  const expectedParsed = new URL(expectedFileUrl);
  return (
    parsed.protocol === 'file:' &&
    targetWithoutHashOrQuery === `${expectedParsed.origin}${expectedParsed.pathname}`
  );
}

export function isAllowedIpcSenderUrl(
  senderUrl: string | undefined,
  options: AppOriginOptions
): boolean {
  if (!senderUrl) {
    return false;
  }
  return isAllowedAppNavigation(senderUrl, options);
}

export function isTestEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VITEST || env.NODE_ENV === 'test');
}

export function isLocalOrLanOllamaHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return LOOPBACK_HOSTNAMES.has(normalized) || normalized.endsWith('.local');
}

export function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.internal')
  ) {
    return true;
  }

  if (PRIVATE_OR_LOCAL_IPV4_REGEX.test(normalized)) {
    return true;
  }

  if (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  ) {
    return true;
  }

  return false;
}

let runtimeOriginOptions: AppOriginOptions | null = null;

export function setRuntimeAppOriginOptions(options: AppOriginOptions | null): void {
  runtimeOriginOptions = options;
}

export function getRuntimeAppOriginOptions(): AppOriginOptions | null {
  return runtimeOriginOptions;
}

export interface IpcEventLike {
  senderFrame?: { url?: string } | null;
}

/**
 * Verifies that an incoming IPC invocation comes from the app's own allowed origin
 * (`localhost:5173` in dev or `dist/index.html` in production).
 * Mocked `{}` events in automated Vitest runs are allowed only when `VITEST`/`NODE_ENV=test`.
 */
export function assertTrustedIpcEvent(
  event?: IpcEventLike | null,
  options?: {
    env?: NodeJS.ProcessEnv;
    originOptions?: AppOriginOptions | null;
  }
): void {
  const env = options?.env ?? process.env;
  const originOpts = options?.originOptions ?? runtimeOriginOptions;
  const senderUrl = event?.senderFrame?.url;

  if (senderUrl !== undefined) {
    if (!originOpts || !isAllowedAppNavigation(senderUrl, originOpts)) {
      throw new Error(`Origen IPC no autorizado: "${senderUrl || '(vacío)'}".`);
    }
    return;
  }

  if (!isTestEnvironment(env)) {
    throw new Error('Origen IPC no autorizado: falta el marco remitente.');
  }
}

/**
 * Prevents the renderer process from passing arbitrary filesystem paths to
 * read/write IPC handlers in production; paths must come from native dialogs in `main`.
 */
export function resolveRendererRequestedPath(
  rawPath: unknown,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (rawPath === undefined || rawPath === null) {
    return undefined;
  }
  if (typeof rawPath !== 'string') {
    throw new Error('La ruta provista debe ser una cadena de texto válida.');
  }
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!isTestEnvironment(env)) {
    throw new Error(
      'Por seguridad, la ruta debe elegirse mediante el diálogo nativo del sistema.'
    );
  }
  return trimmed;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function assertValidIpcId(value: unknown, label = 'ID'): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`${label} inválido o vacío.`);
  }
  return value.trim();
}
