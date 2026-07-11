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
        background_color: '#0b1220',
        theme_color: '#0f766e',
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
      },
    }),
  ],
}));
