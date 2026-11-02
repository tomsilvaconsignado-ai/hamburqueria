import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vitest/config';

export default defineConfig(() => {
  return {
    // Subcaminho de publicação (GitHub Pages de projeto: "/hamburqueria/")
    base: process.env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    test: {
      environment: 'node',
      setupFiles: ['src/test/setup.ts'],
      // Os testes do banco (PGlite) rodam à parte: npm run test:db
      exclude: ['**/node_modules/**', 'supabase/**'],
      // Testes rodam sempre contra o backend local de demonstração
      env: {VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: ''},
    },
  };
});
