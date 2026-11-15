import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'sorteiofc-api-middleware',
      async configureServer(viteServer) {
        // @ts-expect-error -- ESM backend server module
        const { createAppServer } = await import('./server.mjs');
        const { handleRequest } = createAppServer();
        viteServer.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/api')) {
            handleRequest(req, res);
            return;
          }
          next();
        });
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 5180,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3010',
        changeOrigin: true
      }
    }
  }
});
