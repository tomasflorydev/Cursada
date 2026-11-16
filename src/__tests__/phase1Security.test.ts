import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertValidIpcId,
  getDevCspDirectives,
  isAllowedAppNavigation,
  isLocalOrLanOllamaHostname,
  isPrivateOrLoopbackHostname,
  isSafeExternalUrl,
  PROD_CSP_DIRECTIVES,
  resolveUnifiedUserDataDir,
} from '../../electron/security';
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
});
