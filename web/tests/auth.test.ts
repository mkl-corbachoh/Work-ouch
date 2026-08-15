import { describe, expect, it, vi } from "vitest";
import { safeNext, subscribeAuth, supabase } from "../src/auth";

describe("auth callback destinations", () => {
  it("allows only internal paths and preserves deep links", () => {
    expect(safeNext("/workouts/12/active")).toBe("/workouts/12/active");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
it("subscribes, cleans up, and observes signed-out transitions", async () => {
  vi.stubEnv("VITE_E2E_FAKE_AUTH", "true");
  sessionStorage.setItem("fakeSession", "1");
  const events: string[] = [];
  const unsubscribe = subscribeAuth((event) => events.push(event));
  await supabase().auth.signOut();
  expect(events).toContain("SIGNED_OUT");
  unsubscribe();
  await supabase().auth.signInWithOAuth({ provider: "google" });
  expect(events).toEqual(["SIGNED_OUT"]);
  vi.unstubAllEnvs();
});
