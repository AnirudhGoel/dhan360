import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, proxy API calls to the FastAPI backend (default port 8000) so the SPA and API
// share an origin from the browser's point of view.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.DHAN360_API ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
