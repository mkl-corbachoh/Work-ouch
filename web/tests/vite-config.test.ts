import { describe, expect, it } from "vitest";
import {
  API_PROXY_PATTERN,
  createViteConfig,
  HEALTH_PROXY_PATTERN,
} from "../vite.config";

describe("actual Vite topology configuration", () => {
  it("proxies API and health paths to the container without rewrite", () => {
    const config = createViteConfig("development", {
      WEB_API_PROXY_TARGET: "http://api:3000",
      WEB_DEV_HOST: "0.0.0.0",
      WEB_USE_POLLING: "true",
    });

    expect(config.server.host).toBe("0.0.0.0");
    expect(config.server.watch.usePolling).toBe(true);

    for (const path of [API_PROXY_PATTERN, HEALTH_PROXY_PATTERN]) {
      const proxy = config.server.proxy?.[path];
      expect(proxy).toMatchObject({
        target: "http://api:3000",
        changeOrigin: false,
      });
      expect(proxy).not.toHaveProperty("rewrite");
    }
  });

  it("keeps loopback defaults outside containers", () => {
    const config = createViteConfig("development", {});
    expect(config.server.host).toBe("127.0.0.1");
    expect(config.server.watch.usePolling).toBe(false);
    expect(config.server.proxy?.[API_PROXY_PATTERN]).toMatchObject({
      target: "http://127.0.0.1:3000",
      changeOrigin: false,
    });
  });
});
