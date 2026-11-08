import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// VITE_BASE_PATH é definido na pipeline de deploy do GitHub Pages
// (ex.: /cash-organizer-web/). Em dev local o padrão é '/'.
export default defineConfig(() => ({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Cash Organizer',
        short_name: 'Cash Organizer',
        description: 'Organizador de gastos fixos e variáveis por mês',
        lang: 'pt-BR',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache do app shell; as chamadas ao Firestore não são
        // interceptadas (o SDK já tem cache offline próprio via IndexedDB).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigationPreload: false,
        cleanupOutdatedCaches: true,
        // As fontes da identidade (Chakra Petch e Oxanium) vêm do Google
        // Fonts: sem cache elas sumiriam offline e o app cairia na fonte do
        // sistema. CacheFirst porque o arquivo servido é imutável.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
}));
