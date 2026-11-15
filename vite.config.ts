import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages project-site path.
  base: '/teyvat-explorer/',
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});