import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,  // ← change to whatever you want. Default is 5173.
  },
  build: {
    outDir: 'build',
  },
});
