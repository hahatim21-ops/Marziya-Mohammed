import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Social previews (WhatsApp, iMessage, Facebook) need absolute image URLs.
// On Vercel this is the production domain (a custom domain once one is added);
// set SITE_URL to override it anywhere else.
const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const SITE_URL = (process.env.SITE_URL || (host ? `https://${host}` : 'https://marziya-mohammed.vercel.app')).replace(/\/$/, '');
// cache-busting stamp written by tools/build_assets.py
let ASSET_V = '';
try { ASSET_V = JSON.parse(readFileSync(new URL('./src/generated/manifest.json', import.meta.url), 'utf8')).v || ''; } catch (e) { /* no manifest yet */ }

export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2018',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
  },
  plugins: [
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', SITE_URL).replaceAll('%ASSET_V%', ASSET_V),
    },
  ],
});
