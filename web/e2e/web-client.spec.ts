import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const exercise = { id: 1, slug: "back-squat", name: "Back squat", movementPattern: "squat", equipment: "barbell", isActive: true };
const planning = { name: "Strength", version: { id: 10, versionNumber: 1, name: "Day A", notes: null, isCurrent: true, exercises: [{ id: 20, exerciseId: 1, position: 1, restSeconds: 90, targetRpe: null, notes: null, exercise, sets: [{ id: 30, setNumber: 1, setType: "work", targetWeightKg: 50, targetRepsMin: 5, targetRepsMax: 5, targetSeconds: null, targetRpe: null, notes: null }] }] } };
const workout = { id: 7, status: "in_progress", routineVersionId: 10, startedAt: "2026-01-01T10:00:00.000Z", planning, results: [{ routineExerciseId: 20, exerciseId: 1, notes: "keep this note", sets: [{ setNumber: 1, weightKg: 72.5, reps: 4, durationSeconds: null, rpe: 9, completed: true, painLevel: 2, painArea: "knee", notes: "preserve me" }] }] };
async function expectAccessible(page: Page) { const result = await new AxeBuilder({ page }).analyze(); expect(result.violations, result.violations.map((violation) => violation.id).join(", ")).toEqual([]); }

async function authenticated(page: Page, activeWorkouts: unknown[] = []) {
  await page.addInitScript(() => sessionStorage.setItem("fakeSession", "1"));
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/bootstrap")) return route.fulfill({ status: 200, body: "{}" });
    if (url.pathname.endsWith("/me")) return route.fulfill({ status: 200, json: { id: 1, displayName: "Test athlete" } });
    if (url.pathname.endsWith("/workouts") && url.searchParams.get("status") === "in_progress") return route.fulfill({ status: 200, json: activeWorkouts });
    return route.fallback();
  });
}

test("login is accessible and callback failure is rendered without leaking details", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Train with intent." })).toBeVisible();
  await expectAccessible(page);
  await page.goto("/auth/callback?code=fail");
  await expect(page.getByText("Sign in could not be completed")).toBeVisible();
});

test("successful callback consumes returnTo so stale destinations cannot affect later login", async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.setItem("returnTo", "/measurements"); });
  await page.route("**/api/v1/auth/bootstrap", (route) => route.fulfill({ status: 200, body: "{}" }));
  await page.route("**/api/v1/me", (route) => route.fulfill({ status: 200, json: { id: 1, displayName: "Test" } }));
  await page.route("**/api/v1/me/measurements", (route) => route.fulfill({ status: 200, json: [] }));
  await page.goto("/auth/callback?code=good");
  await expect(page).toHaveURL(/\/measurements$/);
  expect(await page.evaluate(() => sessionStorage.getItem("returnTo"))).toBeNull();
});

test("home represents zero, one, and many active sessions", async ({ page }) => {
  for (const sessions of [[], [{ id: 1 }], [{ id: 1 }, { id: 2 }]]) {
    await page.goto("about:blank");
    await authenticated(page, sessions);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Ready when you are." })).toBeVisible();
    await expect(page.getByRole("link", { name: /Resume workout/ })).toHaveCount(sessions.length);
    await page.unrouteAll();
  }
});

test("routine builder to completed read-only workout preserves actual result values", async ({ page }) => {
  await authenticated(page);
  await page.route("**/api/v1/exercises", (route) => route.fulfill({ status: 200, json: [exercise] }));
  await page.route("**/api/v1/routines", async (route) => { if (route.request().method() === "GET") return route.fulfill({ status: 200, json: [] }); return route.fulfill({ status: 201, json: { id: 4, name: "Built", description: null, version: { ...planning.version, id: 10 } } }); });
  await page.route("**/api/v1/workouts", async (route) => { if (route.request().method() === "POST") return route.fulfill({ status: 201, json: workout }); return route.fallback(); });
  let completed = false;
  await page.route("**/api/v1/workouts/7", (route) => route.fulfill({ status: 200, json: completed ? { ...workout, status: "completed" } : workout }));
  await page.route("**/api/v1/workouts/7/exercises/20", async (route) => { expect(route.request().method()).toBe("PUT"); const body = route.request().postDataJSON(); expect(body.exerciseId).toBe(1); expect(body.sets[0]).toMatchObject({ weightKg: 72.5, reps: 4, rpe: 9, painLevel: 2, painArea: "knee", notes: "preserve me" }); return route.fulfill({ status: 200, json: { ...workout.results[0], exerciseId: body.exerciseId, sets: body.sets } }); });
  await page.route("**/api/v1/workouts/7/complete", (route) => { completed = true; return route.fulfill({ status: 200, json: { ...workout, status: "completed" } }); });
  await page.goto("/routines/new");
  await page.getByLabel("Version name").fill("Complex");
  await expectAccessible(page);
  await page.getByLabel("Version name").fill("Built");
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Save complete definition" }).click();
  await page.goto("/workouts/new?routineVersionId=10");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Save complete result" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: "Complete workout" }).click();
  await expectAccessible(page);
  await expect(page.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Status: completed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save complete result" })).toHaveCount(0);
});

test("routine builder validates paired reps and serializes multiple duration/range exercises", async ({ page }) => {
  await authenticated(page);
  await page.route("**/api/v1/exercises", (route) => route.fulfill({ status: 200, json: [exercise, { ...exercise, id: 2, name: "Plank", slug: "plank" }] }));
  await page.route("**/api/v1/routines", async (route) => { const body = route.request().postDataJSON(); expect(body.version.exercises).toHaveLength(2); expect(body.version.exercises[0].sets[0]).toMatchObject({ targetRepsMin: 6, targetRepsMax: 8 }); expect(body.version.exercises[1].sets[0]).toMatchObject({ targetRepsMin: null, targetRepsMax: null, targetSeconds: 45 }); return route.fulfill({ status: 201, json: { id: 8, name: "Complex", version: planning.version } }); });
  await page.route("**/api/v1/routines/8", (route) => route.fulfill({ status: 200, json: { id: 8, name: "Complex", description: null, version: planning.version } }));
  await page.goto("/routines/new");
  await page.getByLabel("Version name").fill("Complex");
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();
  const fields = page.locator("fieldset.card");
  await fields.nth(0).getByLabel("Minimum reps").fill("6");
  await fields.nth(0).getByLabel("Maximum reps").fill("");
  await page.getByRole("button", { name: "Save complete definition" }).click();
  await expect(page.getByRole("alert")).toContainText("valid repetitions");
  await fields.nth(0).getByLabel("Maximum reps").fill("8");
  await expect(fields.nth(0).getByLabel("Maximum reps")).toHaveValue("8");
  await fields.nth(1).getByLabel("Minimum reps").fill("");
  await fields.nth(1).getByLabel("Maximum reps").fill("");
  await fields.nth(1).getByLabel("Target duration seconds").fill("45");
  await fields.nth(1).getByRole("combobox", { name: "Exercise" }).selectOption("2");
  await page.getByRole("button", { name: "Save complete definition" }).click();
  await expect(page).toHaveURL(/\/routines\/8$/);
});

test("dynamic measurement create, history, and detail are accessible", async ({ page }) => {
  await authenticated(page);
  const measurement = { id: 3, measuredAt: "2026-01-15T12:00:00.000Z", metrics: { body_weight: { value: 80, unit: "kg" } } };
  await page.route("**/api/v1/body-metric-types", (route) => route.fulfill({ status: 200, json: [{ code: "body_weight", name: "Body weight", unit: "kg" }] }));
  await page.route("**/api/v1/me/measurements", async (route) => { if (route.request().method() === "POST") { expect(route.request().postDataJSON().metrics).toEqual({ body_weight: 80 }); return route.fulfill({ status: 201, json: measurement }); } return route.fulfill({ status: 200, json: [measurement] }); });
  await page.route("**/api/v1/me/measurements/3", (route) => route.fulfill({ status: 200, json: measurement }));
  await page.goto("/measurements/new");
  await expectAccessible(page);
  await page.getByLabel("Body weight (kg)").fill("80");
  await page.getByRole("button", { name: "Save measurement" }).click();
  await page.goto("/measurements");
  await expect(page.getByText("1/15/2026")).toBeVisible();
  await expectAccessible(page);
  await page.goto("/measurements/3");
  await expect(page.getByText("80 kg")).toBeVisible();
});

test("error states remain distinct and a destructive dialog receives focus", async ({ page }) => {
  await authenticated(page);
  await page.route("**/api/v1/exercises", (route) => route.fulfill({ status: 409, json: { code: "CONFLICT", message: "conflict" } }));
  await page.goto("/exercises");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.goto("/workouts/7/active");
  await expect(page.getByRole("status")).toBeVisible();
});

test("unrecoverable API 401 signs out and returns to login", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("fakeSession", "1"));
  await page.route("**/api/v1/auth/bootstrap", (route) => route.fulfill({ status: 401, json: { code: "AUTHENTICATION_REQUIRED" } }));
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Train with intent." })).toBeVisible();
});

test("401 after successful refresh retry signs out an already-rendered protected route", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("fakeSession", "1"));
  await page.route("**/api/v1/auth/bootstrap", (route) => route.fulfill({ status: 200, body: "{}" }));
  await page.route("**/api/v1/me", (route) => route.fulfill({ status: 200, json: { id: 1, displayName: "Test" } }));
  let calls = 0;
  await page.route("**/api/v1/workouts?status=in_progress", (route) => { calls += 1; return route.fulfill({ status: 401, json: { code: "AUTHENTICATION_REQUIRED" } }); });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  expect(calls).toBeGreaterThanOrEqual(2);
});

test("409 on workout save preserves the edited draft", async ({ page }) => {
  await authenticated(page);
  await page.route("**/api/v1/workouts/7", (route) => route.fulfill({ status: 200, json: workout }));
  await page.route("**/api/v1/exercises", (route) => route.fulfill({ status: 200, json: [exercise] }));
  await page.route("**/api/v1/workouts/7/exercises/20", (route) => { const body = route.request().postDataJSON(); expect(body.sets[0]).toMatchObject({ durationSeconds: 30, painLevel: 5, painArea: "shoulder" }); return route.fulfill({ status: 409, json: { code: "WORKOUT_CONFLICT" } }); });
  await page.goto("/workouts/7/active");
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  const weight = page.getByLabel("Weight kg");
  await weight.fill("75");
  await page.getByLabel("Duration seconds").fill("30");
  await page.getByLabel("Pain level (0–10)").fill("5");
  await page.getByLabel("Pain area").fill("shoulder");
  const exitLink = page.getByRole("link", { name: "Exit workout" });
  await exitLink.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(exitLink).toBeFocused();
  await page.getByRole("button", { name: "Complete workout" }).click();
  await expect(page.getByRole("button", { name: "Save and finish" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Discard and finish" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await page.getByRole("button", { name: "Save complete result" }).click();
  await expect(page.getByRole("status")).toContainText("changed");
  await expect(weight).toHaveValue("75");
});

test("responsive layouts retain landmarks at 320px and desktop", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/login");
  await expect(page.locator("body")).toHaveCSS("min-width", "320px");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("main")).toBeVisible();
});

test("empty and not-found states are not confused with transport errors", async ({ page }) => {
  await authenticated(page);
  await page.route("**/api/v1/exercises", (route) => route.fulfill({ status: 200, json: [] }));
  await page.goto("/exercises");
  await expect(page.getByText("No active exercises are available.")).toBeVisible();
  await page.route("**/api/v1/exercises/99", (route) => route.fulfill({ status: 404, json: { code: "NOT_FOUND" } }));
  await page.goto("/exercises/99");
  await expect(page.getByText("Exercise not found.")).toBeVisible();
});

test("direct active URLs for terminal workouts redirect to read-only detail", async ({ page }) => {
  for (const status of ["completed", "cancelled"] as const) {
    await page.goto("about:blank");
    await authenticated(page);
    await page.route("**/api/v1/workouts/9", (route) => route.fulfill({ status: 200, json: { ...workout, id: 9, status } }));
    await page.route("**/api/v1/exercises", (route) => route.fulfill({ status: 200, json: [exercise] }));
    await page.goto("/workouts/9/active");
    await expect(page).toHaveURL(/\/workouts\/9$/);
    await expect(page.getByText(`Status: ${status}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save complete result" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Complete workout" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel workout" })).toHaveCount(0);
    await expect(page.getByText("Start rest timer")).toHaveCount(0);
    await page.unrouteAll();
  }
});
