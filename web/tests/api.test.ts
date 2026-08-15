import { describe, expect, it, vi } from "vitest";
import { createApi, id } from "../src/api";

describe("Training API client", () => {
  it("uses relative API paths and bearer without userId", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const api = createApi(async () => "token");
    await api.post("/auth/bootstrap", {});
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/auth/bootstrap",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = (fetcher.mock.calls[0][1] as RequestInit)
      .headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("userId")).toBeNull();
    fetcher.mockRestore();
  });
  it("refreshes once after 401", async () => {
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(calls++ === 0 ? "{}" : '{"ok":true}', {
          status: calls === 1 ? 401 : 200,
        }),
    );
    const api = createApi(
      async () => "token",
      async () => true,
    );
    await expect(api.get("/me")).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
    vi.restoreAllMocks();
  });
  it("accepts canonical positive ids only", () => {
    expect(id("12")).toBe("12");
    expect(() => id("01")).toThrow();
    expect(() => id(undefined)).toThrow();
  });
  it.each([400, 404, 409, 500])(
    "classifies HTTP %s responses",
    async (status) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ code: `STATUS_${status}` }), { status }),
      );
      const api = createApi(async () => "token");
      await expect(api.get("/resource")).rejects.toMatchObject({
        status,
        body: { code: `STATUS_${status}` },
      });
      vi.restoreAllMocks();
    },
  );
  it("does not retry after an unsuccessful refresh and reports offline", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 401 }),
    );
    const api = createApi(
      async () => "token",
      async () => false,
    );
    await expect(api.get("/me")).rejects.toMatchObject({ status: 401 });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    await expect(api.get("/me")).rejects.toMatchObject({
      status: 0,
      body: { code: "OFFLINE" },
    });
    vi.restoreAllMocks();
  });
  it("passes AbortSignal through public helpers", async () => {
    const controller = new AbortController();
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await createApi(async () => "token").get("/me", controller.signal);
    expect((fetcher.mock.calls[0][1] as RequestInit).signal).toBe(
      controller.signal,
    );
    vi.restoreAllMocks();
  });
  it("distinguishes intentional AbortError from offline failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      Object.assign(new Error("cancelled"), { name: "AbortError" }),
    );
    const api = createApi(async () => "token");
    await expect(api.get("/slow")).rejects.toMatchObject({
      name: "AbortError",
    });
    vi.restoreAllMocks();
  });
});
