import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    hmr: {
      clientPort: 5173,
    },
    proxy: {
      // All /api/* routes → local Express server (port 3001)
      // The Express server mounts /api/sarvam/stt which proxies to api.sarvam.ai server-side.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

});
