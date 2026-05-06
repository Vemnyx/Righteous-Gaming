import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/complete-registration": "http://localhost:8080",
      "/send-email": "http://localhost:8080",
    },
  },
});
