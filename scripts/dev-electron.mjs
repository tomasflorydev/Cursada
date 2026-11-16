import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSandboxedPreload } from './build-preload.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const parsedUrl = new URL(devServerUrl);
const port = parsedUrl.port || '5173';

function waitForDevServer(url, viteChild, timeoutMs = 30_000) {
  const client = url.startsWith('https:') ? https : http;
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let settled = false;

    const onViteExit = (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Vite salió antes de iniciar (código ${String(code)}).`));
      }
    };
    viteChild.once('exit', onViteExit);

    const probe = () => {
      if (settled) return;
      const req = client.get(url, (res) => {
        res.resume();
        if (!settled) {
          settled = true;
          viteChild.off('exit', onViteExit);
          resolve();
        }
      });
      req.on('error', () => {
        if (settled) return;
        if (Date.now() - startedAt >= timeoutMs) {
          settled = true;
          viteChild.off('exit', onViteExit);
          reject(new Error(`Tiempo de espera agotado esperando a Vite en ${url}.`));
          return;
        }
        setTimeout(probe, 250);
      });
    };

    probe();
  });
}

async function run() {
  const binExt = process.platform === 'win32' ? '.cmd' : '';
  const tscBin = path.join(projectRoot, 'node_modules', '.bin', `tsc${binExt}`);
  const viteBin = path.join(projectRoot, 'node_modules', '.bin', `vite${binExt}`);
  const electronBin = path.join(projectRoot, 'node_modules', '.bin', `electron${binExt}`);

  execFileSync(tscBin, ['-p', 'tsconfig.electron.json'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  buildSandboxedPreload(projectRoot);

  const viteChild = spawn(viteBin, ['--port', port, '--strictPort'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });

  let electronChild = null;
  let shuttingDown = false;

  const cleanup = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (electronChild && !electronChild.killed) {
      electronChild.kill('SIGTERM');
    }
    if (!viteChild.killed) {
      viteChild.kill('SIGTERM');
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  try {
    await waitForDevServer(devServerUrl, viteChild);
  } catch (err) {
    cleanup();
    throw err;
  }

  electronChild = spawn(electronBin, ['.'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl,
    },
  });

  electronChild.on('exit', (code) => {
    cleanup();
    process.exit(code ?? 0);
  });

  viteChild.on('exit', (code) => {
    if (!shuttingDown) {
      cleanup();
      process.exit(code ?? 1);
    }
  });
}

run().catch((err) => {
  console.error('[dev-electron] Error al iniciar entorno de desarrollo:', err);
  process.exit(1);
});
