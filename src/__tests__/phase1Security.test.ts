import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeOllamaBaseUrl } from '../../electron/db/aiSettingsRepo';
import {
  GOOGLE_CALENDAR_TOKENS_KEY,
  getGoogleCalendarTokens,
  saveGoogleCalendarTokens,
  type TokenCryptoAdapter,
} from '../../electron/db/calendarSyncRepo';
import { createTestDatabase } from '../../electron/db/database';
import {
  assertTrustedIpcEvent,
  assertValidIpcId,
  getDevCspDirectives,
  isAllowedAppNavigation,
  isLocalOrLanOllamaHostname,
  isPrivateOrLoopbackHostname,
  isSafeExternalUrl,
  PROD_CSP_DIRECTIVES,
  resolveRendererRequestedPath,
  resolveUnifiedUserDataDir,
} from '../../electron/security';
import {
  addCalendarFeedService,
  normalizeCalendarFeedUrl,
} from '../../electron/services/calendarSyncService';
// @ts-expect-error Pure Node ESM script without TypeScript declarations
import { buildSandboxedPreload } from '../../scripts/build-preload.mjs';

describe('Phase 1 Security & Startup Hardening', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unifies userData directory in com.cursada.app and respects CURSADA_DATA_DIR override', () => {
    const appDataDir = path.join('/Users/test/Library/Application Support');
    expect(resolveUnifiedUserDataDir(appDataDir, {})).toBe(
      path.join(appDataDir, 'com.cursada.app')
    );

    const customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-userdata-'));
    tempDirs.push(customDir);
    expect(
      resolveUnifiedUserDataDir(appDataDir, { CURSADA_DATA_DIR: customDir })
    ).toBe(path.resolve(customDir));
  });

  it('restricts external URLs to http/https and validates navigation origins strictly', () => {
    expect(isSafeExternalUrl('https://uade.edu.ar/syllabus')).toBe(true);
    expect(isSafeExternalUrl('http://localhost:11434')).toBe(true);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('smb://nas/share')).toBe(false);

    const distHtmlPath = path.resolve('/app/dist/index.html');
    const distUrl = pathToFileURL(distHtmlPath).href;

    expect(
      isAllowedAppNavigation(distUrl, {
        isPackagedBundle: true,
        loadDist: true,
        devServerUrl: 'http://localhost:5173',
        distHtmlPath,
      })
    ).toBe(true);

    expect(
      isAllowedAppNavigation('file:///etc/passwd', {
        isPackagedBundle: true,
        loadDist: true,
        devServerUrl: 'http://localhost:5173',
        distHtmlPath,
      })
    ).toBe(false);

    expect(
      isAllowedAppNavigation('https://evil.example/phish', {
        isPackagedBundle: true,
        loadDist: true,
        devServerUrl: 'http://localhost:5173',
        distHtmlPath,
      })
    ).toBe(false);

    expect(
      isAllowedAppNavigation('http://localhost:5173/#settings', {
        isPackagedBundle: false,
        loadDist: false,
        devServerUrl: 'http://localhost:5173',
        distHtmlPath,
      })
    ).toBe(true);

    expect(
      isAllowedAppNavigation('http://localhost:9999/', {
        isPackagedBundle: false,
        loadDist: false,
        devServerUrl: 'http://localhost:5173',
        distHtmlPath,
      })
    ).toBe(false);
  });

  it('validates local Ollama hostnames, SSRF private/loopback targets, and IPC IDs', () => {
    expect(isLocalOrLanOllamaHostname('localhost')).toBe(true);
    expect(isLocalOrLanOllamaHostname('127.0.0.1')).toBe(true);
    expect(isLocalOrLanOllamaHostname('::1')).toBe(true);
    expect(isLocalOrLanOllamaHostname('ollama.local')).toBe(true);
    expect(isLocalOrLanOllamaHostname('evil.example.com')).toBe(false);

    expect(isPrivateOrLoopbackHostname('localhost')).toBe(true);
    expect(isPrivateOrLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isPrivateOrLoopbackHostname('169.254.169.254')).toBe(true);
    expect(isPrivateOrLoopbackHostname('10.0.0.5')).toBe(true);
    expect(isPrivateOrLoopbackHostname('192.168.1.10')).toBe(true);
    expect(isPrivateOrLoopbackHostname('172.16.0.1')).toBe(true);
    expect(isPrivateOrLoopbackHostname('calendar.google.com')).toBe(false);

    expect(assertValidIpcId('  course-123  ', 'ID de materia')).toBe('course-123');
    expect(() => assertValidIpcId('   ', 'ID de materia')).toThrow(/inválido/i);
    expect(() => assertValidIpcId(42, 'ID de materia')).toThrow(/inválido/i);
  });

  it('compiles preload.ts to CommonJS preload.cjs compatible with Electron sandbox: true', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-preload-'));
    tempDirs.push(tmpRoot);

    fs.mkdirSync(path.join(tmpRoot, 'electron'), { recursive: true });
    fs.copyFileSync(
      path.resolve(process.cwd(), 'electron', 'preload.ts'),
      path.join(tmpRoot, 'electron', 'preload.ts')
    );

    const outPath = (buildSandboxedPreload as (root?: string) => string)(tmpRoot);
    expect(path.basename(outPath)).toBe('preload.cjs');
    const output = fs.readFileSync(outPath, 'utf8');
    expect(output).toContain('require("electron")');
    expect(output).not.toMatch(/^\s*import\s+/m);
  });

  it('configures Electron sandbox: true, external theme-init script, and strict CSP directives', () => {
    const rootDir = process.cwd();
    const mainSource = fs.readFileSync(
      path.join(rootDir, 'electron', 'main.ts'),
      'utf8'
    );
    expect(mainSource).toContain('sandbox: true');
    expect(mainSource).toContain("preload.cjs");
    expect(mainSource).toContain('setWindowOpenHandler');
    expect(mainSource).toContain("will-navigate");
    expect(mainSource).toContain('setPermissionRequestHandler');
    expect(mainSource).toContain('resolveUnifiedUserDataDir');

    const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    expect(indexHtml).toContain('./theme-init.js');
    expect(indexHtml).not.toContain('localStorage.getItem');
    expect(
      fs.existsSync(path.join(rootDir, 'public', 'theme-init.js'))
    ).toBe(true);

    expect(PROD_CSP_DIRECTIVES).toContain("script-src 'self'");
    expect(PROD_CSP_DIRECTIVES).toContain("object-src 'none'");
    expect(getDevCspDirectives('http://localhost:5173')).toContain(
      'ws://localhost:5173'
    );
  });

  it('rejects arbitrary renderer paths and untrusted IPC origins in production', () => {
    const prodEnv = {} as NodeJS.ProcessEnv;
    expect(resolveRendererRequestedPath(undefined, prodEnv)).toBeUndefined();
    expect(resolveRendererRequestedPath('   ', prodEnv)).toBeUndefined();
    expect(() =>
      resolveRendererRequestedPath('/etc/passwd', prodEnv)
    ).toThrow(/diálogo nativo/i);
    expect(() => resolveRendererRequestedPath(123, prodEnv)).toThrow(/cadena/i);

    const originOptions = {
      isPackagedBundle: true,
      loadDist: true,
      devServerUrl: 'http://localhost:5173',
      distHtmlPath: path.resolve('/app/dist/index.html'),
    };
    const validFileUrl = pathToFileURL(originOptions.distHtmlPath).href;

    expect(() =>
      assertTrustedIpcEvent(
        { senderFrame: { url: validFileUrl } },
        { env: prodEnv, originOptions }
      )
    ).not.toThrow();

    expect(() =>
      assertTrustedIpcEvent(
        { senderFrame: { url: 'https://evil.example/payload' } },
        { env: prodEnv, originOptions }
      )
    ).toThrow(/no autorizado/i);

    expect(() =>
      assertTrustedIpcEvent({}, { env: prodEnv, originOptions })
    ).toThrow(/no autorizado/i);
  });

  it('encrypts Google OAuth2 tokens at rest via Keychain/safeStorage envelope and handles corrupted payloads safely', () => {
    const ctx = createTestDatabase({ inMemory: true });
    tempDirs.push(ctx.dataDir);

    const xorAdapter: TokenCryptoAdapter = {
      isAvailable: () => true,
      encryptString: (plainText: string) =>
        Buffer.from(
          Buffer.from(plainText, 'utf8').map((byte) => byte ^ 0x5a)
        ),
      decryptString: (encrypted: Buffer) =>
        Buffer.from(encrypted.map((byte) => byte ^ 0x5a)).toString('utf8'),
    };

    const sampleTokens = {
      accessToken: 'ya29.super-secret-access-token',
      refreshToken: '1//super-secret-refresh-token',
      expiresAt: '2026-12-01T12:00:00.000Z',
      tokenType: 'Bearer',
      scope: 'https://www.googleapis.com/auth/calendar.events',
    };

    try {
      saveGoogleCalendarTokens(ctx.db, sampleTokens, xorAdapter);

      const rawRow = ctx.db
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get(GOOGLE_CALENDAR_TOKENS_KEY) as { value: string };
      expect(rawRow.value).toContain('"v":1');
      expect(rawRow.value).toContain('"alg":"electron-safeStorage"');
      expect(rawRow.value).not.toContain(sampleTokens.accessToken);
      expect(rawRow.value).not.toContain(sampleTokens.refreshToken);

      expect(getGoogleCalendarTokens(ctx.db, xorAdapter)).toEqual(sampleTokens);

      // Corrupted ciphertext or locked Keychain degrades safely to null
      ctx.db
        .prepare('UPDATE app_settings SET value = ? WHERE key = ?')
        .run(
          JSON.stringify({
            v: 1,
            alg: 'electron-safeStorage',
            payloadBase64: Buffer.from('not-valid-json').toString('base64'),
          }),
          GOOGLE_CALENDAR_TOKENS_KEY
        );
      expect(getGoogleCalendarTokens(ctx.db, xorAdapter)).toBeNull();

      // Refuses saving when crypto adapter is explicitly unavailable
      expect(() =>
        saveGoogleCalendarTokens(ctx.db, sampleTokens, {
          isAvailable: () => false,
          encryptString: () => Buffer.alloc(0),
          decryptString: () => '',
        })
      ).toThrow(/Keychain|almacenamiento seguro/i);
    } finally {
      ctx.db.close();
    }
  });

  it('blocks remote Ollama hosts by default while allowing localhost and .local LAN hosts', () => {
    expect(normalizeOllamaBaseUrl('http://localhost:11434/')).toBe(
      'http://localhost:11434'
    );
    expect(normalizeOllamaBaseUrl('https://mac-mini.local:8443/')).toBe(
      'https://mac-mini.local:8443'
    );
    expect(() =>
      normalizeOllamaBaseUrl('https://remote-llm.evil.example/api')
    ).toThrow(/privacidad|locales/i);
    expect(
      normalizeOllamaBaseUrl('https://remote-llm.evil.example/api', {
        allowRemote: true,
      })
    ).toBe('https://remote-llm.evil.example/api');
  });

  it('prevents SSRF and rejects oversized >5 MB external .ics calendar feeds', async () => {
    expect(() =>
      normalizeCalendarFeedUrl('http://127.0.0.1:11434/secret.ics')
    ).toThrow(/SSRF/i);
    expect(() =>
      normalizeCalendarFeedUrl('http://169.254.169.254/latest/meta-data/')
    ).toThrow(/SSRF/i);
    expect(() =>
      normalizeCalendarFeedUrl('http://10.0.0.12/internal.ics')
    ).toThrow(/SSRF/i);
    expect(
      normalizeCalendarFeedUrl('webcal://calendar.google.com/calendar/ical/test.ics')
    ).toBe('https://calendar.google.com/calendar/ical/test.ics');

    const ctx = createTestDatabase({ inMemory: true });
    tempDirs.push(ctx.dataDir);
    try {
      await expect(
        addCalendarFeedService(
          ctx.db,
          { name: 'Redirect SSRF', url: 'https://calendar.google.com/public.ics' },
          {
            fetchFn: async () =>
              ({
                ok: true,
                status: 200,
                url: 'http://127.0.0.1:8080/internal-admin',
                headers: new Headers(),
                text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR',
              }) as unknown as Response,
          }
        )
      ).rejects.toThrow(/SSRF/i);

      await expect(
        addCalendarFeedService(
          ctx.db,
          { name: 'Oversized Header', url: 'https://calendar.google.com/huge.ics' },
          {
            fetchFn: async () =>
              ({
                ok: true,
                status: 200,
                url: 'https://calendar.google.com/huge.ics',
                headers: new Headers({ 'content-length': String(6 * 1024 * 1024) }),
                text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR',
              }) as unknown as Response,
          }
        )
      ).rejects.toThrow(/5 MB/i);
    } finally {
      ctx.db.close();
    }
  });
});
