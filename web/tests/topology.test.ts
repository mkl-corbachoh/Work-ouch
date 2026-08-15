import { describe, expect, it } from "vitest";
import { forwardedApiPath, productionRoute } from "../src/topology";

describe("same-origin topology", () => {
  it("preserves the API prefix through the dev proxy", () =>
    expect(forwardedApiPath("/api/v1/me")).toBe("/api/v1/me"));
  it("routes API and SPA paths separately in production", () => {
    expect(productionRoute("/api/v1/workouts")).toBe("training-api");
    expect(productionRoute("/workouts/7/active")).toBe("spa-index-fallback");
  });
});
