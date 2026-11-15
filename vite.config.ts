import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages project sites are hosted under /<repository-name>/.
  base: process.env.GITHUB_ACTIONS ? '/teyvat-explorer/' : '/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});