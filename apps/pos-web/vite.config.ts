import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    // El front habla con el pos-server de la LAN. En dev, proxy a Fastify.
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
