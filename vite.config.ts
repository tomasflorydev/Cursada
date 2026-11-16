import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

process.env.VITEST_SKIP_INSTALL_CHECKS = '1';

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export default defineConfig({
  plugins: [
    {
      name: 'cursada-node-sqlite-external',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'node:sqlite' || id === 'sqlite') {
          return { id: 'node:sqlite', external: true };
        }
        return null;
      },
    },
    {
      name: 'cursada-production-csp',
      apply: 'build',
      transformIndexHtml(html) {
        const metaTag = `    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`;
        return html.replace(
          /<meta charset="UTF-8"\s*\/>/i,
          `<meta charset="UTF-8" />\n${metaTag}`
        );
      },
    },
    react(),
  ],
  base: './',
  css: {
    postcss: {},
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**', '**/.worktrees/**'],
  },
});
