import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Control-plane API during local dev.
      '/api': 'http://localhost:4000',
    },
  },
});
