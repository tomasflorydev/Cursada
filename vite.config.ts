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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (id.includes('/framer-motion/')) {
            return 'vendor-motion';
          }
          if (
            id.includes('/react-markdown/') ||
            id.includes('/remark-') ||
            id.includes('/rehype-') ||
            id.includes('/unified/') ||
            id.includes('/micromark') ||
            id.includes('/mdast-') ||
            id.includes('/hast-') ||
            id.includes('/unist-')
          ) {
            return 'vendor-markdown';
          }
          if (id.includes('/@lezer/')) {
            return 'vendor-lezer';
          }
          if (
            id.includes('/@codemirror/') &&
            !id.includes('/@codemirror/lang-javascript/') &&
            !id.includes('/@codemirror/lang-python/') &&
            !id.includes('/@codemirror/lang-java/') &&
            !id.includes('/@codemirror/lang-sql/') &&
            !id.includes('/@codemirror/lang-json/') &&
            !id.includes('/@codemirror/lang-html/') &&
            !id.includes('/@codemirror/lang-css/') &&
            !id.includes('/@codemirror/lang-cpp/') &&
            !id.includes('/@codemirror/lang-yaml/')
          ) {
            return 'vendor-codemirror';
          }
        },
      },
    },
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
