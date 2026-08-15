import { describe, expect, it } from "vitest";
import { createViteConfig } from "../vite.config";

describe("actual Vite topology configuration", () => {
  it("proxies the versioned path without rewrite", async () => {
    const config = createViteConfig("development");
    const proxy = config.server.proxy?.["/api/v1"];
    expect(proxy).toMatchObject({
      target: "http://127.0.0.1:3000",
      changeOrigin: false,
    });
    expect(proxy).not.toHaveProperty("rewrite");
  });
});
