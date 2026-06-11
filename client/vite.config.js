import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/public": "http://localhost:3000",
      "/restaurants": "http://localhost:3000",
      "/menu-items": "http://localhost:3000",
      "/menu-categories": "http://localhost:3000"
    }
  }
});
