import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Bind all interfaces so a container's published port resolves. No-op on bare
    // metal beyond also listening on the LAN address.
    host: true,
    // Docker on Windows sets VITE_USE_POLLING: inotify events do not cross a
    // Windows/WSL2 bind mount, so HMR silently never fires without this. Left off
    // on bare metal, where native events work and polling just burns CPU.
    watch: process.env.VITE_USE_POLLING ? { usePolling: true, interval: 1000 } : undefined,
    proxy: {
      // Control-plane API during local dev; the API serves /v1/* at the root.
      // Overridable because `localhost` inside the dashboard container is the
      // dashboard itself — Docker sets this to http://api-dev:4000. Only used
      // when hitting :5173 directly; through the router on :3200, nginx strips
      // /api before Vite ever sees the request.
      '/api': {
        target: process.env.VITE_DEV_API_PROXY ?? 'http://localhost:4000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
