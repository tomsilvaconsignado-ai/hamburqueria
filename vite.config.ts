import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vitest/config';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    test: {
      environment: 'node',
      setupFiles: ['src/test/setup.ts'],
      // Testes rodam sempre contra o backend local de demonstração
      env: {VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: ''},
    },
  };
});
