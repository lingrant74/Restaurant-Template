import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Where the dev server forwards API calls. Defaults to a backend running on the
// host; inside Docker it is set to the backend service (e.g. http://backend:3000).
const proxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:3000";

// Bind-mounted source on some hosts (WSL2, Docker volumes) does not emit native
// file-change events, so allow opting into polling-based file watching.
const usePolling = process.env.VITE_USE_POLLING === "true";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: usePolling ? { usePolling: true } : undefined,
    proxy: {
      "/api": proxyTarget,
      "/public": proxyTarget,
      "/restaurants": proxyTarget,
      "/menu-items": proxyTarget,
      "/menu-categories": proxyTarget
    }
  }
});
