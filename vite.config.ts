import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  publicDir: '../node_modules/@pas/design-system/assets',
  build: { outDir: '../dist/client', emptyOutDir: true },
});
