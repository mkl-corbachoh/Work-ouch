import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

type ViteServerEnvironment = Record<string, string>;

export const API_PROXY_PATTERN = "^/api/v1(?:/|$)";
export const HEALTH_PROXY_PATTERN = "^/health$";

export function createViteConfig(
  mode: string,
  environment: ViteServerEnvironment = loadEnv(mode, ".", ""),
) {
  const proxyTarget =
    environment.WEB_API_PROXY_TARGET || "http://127.0.0.1:3000";
  const proxy = {
    target: proxyTarget,
    changeOrigin: false,
  };

  return {
    plugins: [react()],
    server: {
      host: environment.WEB_DEV_HOST || "127.0.0.1",
      watch: {
        usePolling: environment.WEB_USE_POLLING === "true",
      },
      proxy: {
        [API_PROXY_PATTERN]: proxy,
        [HEALTH_PROXY_PATTERN]: proxy,
      },
    },
  };
}

export default defineConfig(({ mode }) => createViteConfig(mode));
