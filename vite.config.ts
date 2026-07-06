import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE_PATH é definido na pipeline de deploy do GitHub Pages
// (ex.: /cash-organizer-web/). Em dev local o padrão é '/'.
export default defineConfig(() => ({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
}));
