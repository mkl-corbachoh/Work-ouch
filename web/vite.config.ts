import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
export function createViteConfig(mode: string) {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/v1": {
          target: env.WEB_API_PROXY_TARGET || "http://127.0.0.1:3000",
          changeOrigin: false,
        },
      },
    },
  };
}
export default defineConfig(({ mode }) => createViteConfig(mode));
