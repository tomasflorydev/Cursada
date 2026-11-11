import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

process.env.VITEST_SKIP_INSTALL_CHECKS = '1';

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
  },
});
