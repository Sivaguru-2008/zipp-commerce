// Vite multi-page config for the Zipp frontend.
//
// Why MPA mode: every existing HTML page (index.html + everything under
// pages/) is a distinct route served by Express. We don't want SPA routing
// — we want each entry HTML to ship its own optimised JS + CSS bundle
// while still reusing the shared chunks (api.js, auth.js, toast.js, …).
//
// Build output goes to dist/. Render's static server (or Express) can serve
// dist/ in production, replacing the legacy /frontend static delivery once
// every page is verified. Until then, the working tree continues to be
// served as-is and this build pipeline runs side-by-side.

import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Discover all top-level + pages/* HTML files as Vite entries.
function discoverEntries() {
  const entries = {};
  const addIfPresent = (key, rel) => {
    const abs = path.resolve(__dirname, rel);
    if (fs.existsSync(abs)) entries[key] = abs;
  };
  addIfPresent('main',           'index.html');
  addIfPresent('admin',          'admin.html');
  addIfPresent('adminAnalytics', 'admin-analytics.html');
  const pagesDir = path.resolve(__dirname, 'pages');
  if (fs.existsSync(pagesDir)) {
    for (const file of fs.readdirSync(pagesDir)) {
      if (file.endsWith('.html')) {
        entries[`pages/${file.replace(/\.html$/, '')}`] = path.join(pagesDir, file);
      }
    }
  }
  return entries;
}

export default defineConfig({
  root: __dirname,
  // Built assets land at /assets/* under the deployed origin.
  base: '/',
  // Match the existing static layout so absolute paths like /js/api.js keep
  // resolving during dev.
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: true,
    sourcemap: false,
    target: 'es2018',
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: false, drop_debugger: true }
    },
    rollupOptions: {
      input: discoverEntries(),
      output: {
        // Long-term cacheable hashed names per asset type.
        entryFileNames:  'assets/[name]-[hash].js',
        chunkFileNames:  'assets/chunks/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash][extname]',
        // Common chunks: pull the small shared utilities into one chunk so
        // browsers cache them once across pages.
        manualChunks(id) {
          if (id.includes('/js/api.js')      ||
              id.includes('/js/auth.js')     ||
              id.includes('/js/toast.js')    ||
              id.includes('/js/observability.js')) {
            return 'zipp-core';
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    // Proxy /api calls to the local Express server during `npm run dev` so
    // cookies + fetch work end-to-end without CORS tweaks.
    proxy: {
      '/api':      { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads':  { target: 'http://localhost:5000', changeOrigin: true },
      '/sitemap.xml': { target: 'http://localhost:5000', changeOrigin: true },
      '/health':   { target: 'http://localhost:5000', changeOrigin: true }
    }
  },
  plugins: [
    // Modern + legacy bundles for older browsers (Safari < 14, etc.). Vite
    // emits both and uses the `<script nomodule>` fallback automatically.
    legacy({
      targets: ['defaults', 'not IE 11'],
      renderLegacyChunks: true
    })
  ]
});
