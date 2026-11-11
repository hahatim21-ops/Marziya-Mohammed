import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2018',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
  },
});
