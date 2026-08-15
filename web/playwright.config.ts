import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    env: {
      VITE_E2E_FAKE_AUTH: "true",
      VITE_AUTH_PROVIDERS: "google",
      VITE_SUPABASE_URL: "https://e2e.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-key",
      VITE_AUTH_SCOPES_JSON: "{}",
    },
  },
});
