import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Express API runs on 8787; Vite dev server proxies /api and /uploads to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind IPv4 + IPv6 so http://localhost, http://127.0.0.1 and http://[::1]
    // all reach the dev server (Windows browsers often resolve localhost to IPv4).
    host: true,
    proxy: {
      "/api": "http://localhost:8787",
      "/uploads": "http://localhost:8787",
    },
  },
  build: {
    outDir: "dist",
  },
});
