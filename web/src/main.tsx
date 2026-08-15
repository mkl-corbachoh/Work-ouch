import "@fontsource/archivo-narrow/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles.css";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  RouterProvider,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { createApi, errorMessage, id } from "./api";
import { callback, safeNext, signIn, subscribeAuth, supabase } from "./auth";
import { definition, routineSetInput } from "./routineBuilder";
import type {
  Exercise,
  Measurement,
  MetricType,
  RoutineDetail as RoutineDetailContract,
  RoutineSummary,
  Workout,
} from "./types";
import {
  addSet,
  type ExerciseDraft,
  initializeDraft,
  removeSet,
  serializeDraft,
} from "./workoutDraft";

const token = async () =>
  (await supabase().auth.getSession()).data.session?.access_token ?? null;
const api = createApi(
  token,
  async () => {
    const refreshed = await supabase().auth.refreshSession();
    if (refreshed.error) {
      await supabase().auth.signOut();
      sessionStorage.removeItem("returnTo");
      return false;
    }
    return true;
  },
  async () => {
    await supabase().auth.signOut();
  },
);
function Load({ children }: { children: React.ReactNode }) {
  return <main className="page">{children}</main>;
}
function RouteError() {
  return (
    <Load>
      <section className="state-page">
        <p className="eyebrow">ERROR</p>
        <h1>Something went wrong</h1>
        <p role="alert">
          This page could not be loaded. Try again or return home.
        </p>
        <Link className="button secondary" to="/">
          Return home
        </Link>
      </section>
    </Load>
  );
}
function Public() {
  return <Outlet />;
}
function Protected() {
  const [ready, setReady] = useState(false);
  const [, setAuthRevision] = useState(0);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    const unsubscribe = subscribeAuth((event) => {
      setAuthRevision((revision) => revision + 1);
      if (event === "SIGNED_OUT") {
        setReady(false);
        nav("/login", { replace: true });
      }
    });
    let alive = true;
    supabase()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!data.session) {
          if (!sessionStorage.getItem("returnTo"))
            sessionStorage.setItem("returnTo", loc.pathname + loc.search);
          nav("/login", { replace: true });
          return;
        }
        try {
          await api.post("/auth/bootstrap", {});
          await api.get("/me");
          if (alive) {
            setReady(true);
          }
        } catch {
          await supabase().auth.signOut();
          sessionStorage.removeItem("returnTo");
          nav("/login", { replace: true });
        }
      });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [loc.pathname, loc.search, nav]);
  if (!ready)
    return (
      <Load>
        <p role="status">Loading your session…</p>
      </Load>
    );
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const transactional = location.pathname.endsWith("/active");
  return (
    <>
      <header className="top">
        <Link to="/" className="brand">
          work-ouch!
        </Link>
        <Link to="/account" aria-label="Account">
          Account
        </Link>
      </header>
      {children}
      {!transactional && (
        <nav className="bottom" aria-label="Primary">
          <NavLink
            className={({ isActive }) => (isActive ? "is-active" : "")}
            end
            to="/"
          >
            Home
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? "is-active" : "")}
            to="/routines"
          >
            Routines
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? "is-active" : "")}
            to="/workouts"
          >
            History
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? "is-active" : "")}
            to="/measurements"
          >
            Evolution
          </NavLink>
        </nav>
      )}
    </>
  );
}
function Login() {
  const [error, setError] = useState("");
  const providers = (import.meta.env.VITE_AUTH_PROVIDERS || "")
    .split(",")
    .map((x: string) => x.trim())
    .filter(Boolean);
  return (
    <Load>
      <section className="login-page">
        <div className="login-glow" aria-hidden="true" />
        <div className="login-shell">
          <div className="login-brand">
            <span className="login-mark" aria-hidden="true">
              w!
            </span>
            <span>work-ouch!</span>
          </div>
          <div className="login-hero">
            <p className="eyebrow">TRAINING PERFORMANCE SYSTEM</p>
            <h1>Train with intent. Measure what matters.</h1>
            <p className="login-copy">
              Sign in to keep routines, real sessions and body metrics in one
              focused dark workspace.
            </p>
          </div>
          <section className="login-panel" aria-label="Sign in">
            <div className="login-stats" aria-hidden="true">
              <div>
                <span>PLAN</span>
                <strong>01</strong>
              </div>
              <div>
                <span>WORK</span>
                <strong>02</strong>
              </div>
              <div>
                <span>TRACK</span>
                <strong>03</strong>
              </div>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {providers.length ? (
              providers.map((p: string) => (
                <button
                  type="button"
                  className="primary login-action"
                  key={p}
                  onClick={() => {
                    if (!sessionStorage.getItem("returnTo"))
                      sessionStorage.setItem("returnTo", location.pathname);
                    signIn(p as never).catch(() =>
                      setError("Sign in could not be started."),
                    );
                  }}
                >
                  Continue with {p}
                </button>
              ))
            ) : (
              <p className="error">Authentication is not configured.</p>
            )}
            <p className="login-note">
              Secure external sign-in. Your training data stays tied to your
              account.
            </p>
          </section>
        </div>
      </section>
    </Load>
  );
}
function Callback() {
  const nav = useNavigate();
  const exchanged = useRef(false);
  const [message, setMessage] = useState("Completing sign in…");
  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;
    const code = new URLSearchParams(location.search).get("code");
    if (!code) {
      setMessage("The sign-in callback is incomplete.");
      return;
    }
    callback(code)
      .then(async ({ data, error }) => {
        if (error || !data.session?.access_token)
          throw new Error("Session exchange failed");
        await api.post("/auth/bootstrap", {});
        await api.get("/me");
        const destination = safeNext(sessionStorage.getItem("returnTo"));
        sessionStorage.removeItem("returnTo");
        nav(destination, { replace: true });
      })
      .catch(() =>
        setMessage("Sign in could not be completed. Please try again."),
      );
  }, [nav]);
  return (
    <Load>
      <section className="state-page">
        <p className="eyebrow">AUTHENTICATION</p>
        <h1>Sign in</h1>
        <p role="status">{message}</p>
      </section>
    </Load>
  );
}
function Home() {
  const [items, setItems] = useState<Workout[] | null>(null);
  useEffect(() => {
    api
      .get<Workout[]>("/workouts?status=in_progress")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  return (
    <Load>
      <section className="home-page">
        <header className="home-header">
          <p className="eyebrow">TODAY</p>
          <h1>Ready when you are.</h1>
          <p>
            Pick up an active session or prepare the next block from your plan.
          </p>
        </header>
        <div className="home-grid">
          <Card
            to="/routines"
            title="Routines"
            text="Build or review a sealed plan."
            meta="PLAN"
          />
          <Card
            to="/exercises"
            title="Exercises"
            text="Browse the active catalog."
            meta="MOVE"
          />
          <Card
            to="/measurements"
            title="Measurements"
            text="Record your body metrics."
            meta="TRACK"
          />
        </div>
        <section className="session-panel">
          <div className="section-heading">
            <p className="eyebrow">LIVE</p>
            <h2>In-progress workouts</h2>
          </div>
          {items === null ? (
            <p>Loading…</p>
          ) : items.length === 0 ? (
            <p className="empty">No active sessions.</p>
          ) : (
            <div className="session-list">
              {items.map((w) => (
                <Link
                  className="session-link"
                  key={w.id}
                  to={`/workouts/${w.id}/active`}
                >
                  <span>Resume workout #{w.id}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>
    </Load>
  );
}
function Card({
  to,
  title,
  text,
  meta,
}: {
  to: string;
  title: string;
  text: string;
  meta?: string;
}) {
  return (
    <Link className="card link-card feature-card" to={to}>
      {meta && <span className="feature-meta">{meta}</span>}
      <h2>{title}</h2>
      <p>{text}</p>
    </Link>
  );
}
function Exercises() {
  const [data, setData] = useState<Exercise[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get<Exercise[]>("/exercises")
      .then(setData)
      .catch((caught) => {
        setData(null);
        setError(errorMessage(caught, "Exercises could not be loaded."));
      });
  }, []);
  return (
    <Load>
      <section className="catalog-page">
        <header className="catalog-header">
          <div>
            <p className="eyebrow">EXERCISE CATALOG</p>
            <h1>Choose your weapon.</h1>
          </div>
          <p className="catalog-count">
            <span className="sr-only">{data?.length ?? 0} exercises</span>
            <span aria-hidden="true">{data?.length ?? 0}</span>
          </p>
        </header>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {data === null ? (
          <p>Loading…</p>
        ) : data.length === 0 ? (
          <p className="empty">No active exercises are available.</p>
        ) : (
          <div className="catalog-grid">
            {data.map((e, index) => (
              <Link
                className="catalog-card"
                key={e.id}
                to={`/exercises/${e.id}`}
              >
                <span className="catalog-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2>{e.name}</h2>
                  <div className="catalog-meta">
                    {e.movementPattern && <span>{e.movementPattern}</span>}
                    {e.equipment && <span>{e.equipment}</span>}
                  </div>
                </div>
                <p>{e.description || "Open technique and safety guidance."}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Load>
  );
}
function ExerciseDetail() {
  const { exerciseId } = useParams();
  const [e, setE] = useState<Exercise | null>(null);
  useEffect(() => {
    api
      .get<Exercise>(`/exercises/${id(exerciseId)}`)
      .then(setE)
      .catch(() => setE(null));
  }, [exerciseId]);
  if (!e)
    return (
      <Load>
        <p>Exercise not found.</p>
      </Load>
    );
  return (
    <Load>
      <section className="detail-page">
        <Link className="back-link" to="/exercises">
          ← Exercises
        </Link>
        <header className="detail-header">
          <div>
            <p className="eyebrow">EXERCISE</p>
            <h1>{e.name}</h1>
          </div>
          <div className="detail-badges">
            {e.movementPattern && <span>{e.movementPattern}</span>}
            {e.equipment && <span>{e.equipment}</span>}
            {!e.isActive && <span>inactive</span>}
          </div>
        </header>
        {e.description && <p className="detail-copy">{e.description}</p>}
        <div className="detail-grid">
          {e.techniqueNotes && (
            <section className="info-card">
              <p className="eyebrow">TECHNIQUE</p>
              <h2>Technique</h2>
              <p>{e.techniqueNotes}</p>
            </section>
          )}
          {e.safetyNotes && (
            <section className="info-card">
              <p className="eyebrow">SAFETY</p>
              <h2>Safety</h2>
              <p>{e.safetyNotes}</p>
            </section>
          )}
        </div>
        {e.videoUrl && (
          <a
            className="button primary detail-action"
            href={e.videoUrl}
            target="_blank"
            rel="noreferrer"
          >
            Watch technique video
          </a>
        )}
      </section>
    </Load>
  );
}
function Routines() {
  const [data, setData] = useState<RoutineSummary[] | null>(null);
  useEffect(() => {
    api
      .get<RoutineSummary[]>("/routines")
      .then(setData)
      .catch(() => setData([]));
  }, []);
  return (
    <Load>
      <section className="catalog-page">
        <header className="catalog-header">
          <div>
            <p className="eyebrow">TRAINING PLANS</p>
            <h1>Build the next session.</h1>
          </div>
          <Link className="button primary catalog-cta" to="/routines/new">
            New routine
          </Link>
        </header>
        {data === null ? (
          <p>Loading…</p>
        ) : data.length === 0 ? (
          <p className="empty">No routines yet.</p>
        ) : (
          <div className="catalog-grid">
            {data.map((r) => (
              <Link
                className="catalog-card routine-card"
                key={r.id}
                to={`/routines/${r.id}`}
              >
                <span className="catalog-number" aria-hidden="true">
                  {String(r.currentVersion.versionNumber).padStart(2, "0")}
                </span>
                <div>
                  <h2>{r.name}</h2>
                  <div className="catalog-meta">
                    <span>version {r.currentVersion.versionNumber}</span>
                    {r.currentVersion.name && (
                      <span>{r.currentVersion.name}</span>
                    )}
                  </div>
                </div>
                <p>{r.description || "Open the current planned version."}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Load>
  );
}
function RoutineDetailPage() {
  const { routineId } = useParams();
  const [search] = useSearchParams();
  const [r, setR] = useState<RoutineDetailContract | null>(null);
  useEffect(() => {
    api
      .get<RoutineDetailContract>(
        `/routines/${id(routineId)}${search.get("versionNumber") ? `?versionNumber=${search.get("versionNumber")}` : ""}`,
      )
      .then(setR)
      .catch(() => setR(null));
  }, [routineId, search]);
  if (!r)
    return (
      <Load>
        <p>Routine not found.</p>
      </Load>
    );
  const v = r.version;
  return (
    <Load>
      <section className="detail-page">
        <Link className="back-link" to="/routines">
          ← Routines
        </Link>
        <header className="detail-header">
          <div>
            <p className="eyebrow">ROUTINE</p>
            <h1>{r.name}</h1>
          </div>
          <div className="version-badge">
            <span>VERSION</span>
            <strong>{v?.versionNumber}</strong>
          </div>
        </header>
        {r.description && <p className="detail-copy">{r.description}</p>}
        <div className="detail-grid">
          {v?.exercises.map((x) => (
            <section className="info-card" key={x.position}>
              <p className="eyebrow">POSITION {x.position}</p>
              <h2>{x.exercise?.name || `Exercise ${x.exerciseId}`}</h2>
              <div className="catalog-meta">
                <span>{x.sets.length} planned sets</span>
                <span>rest {x.restSeconds ?? 0}s</span>
                {x.targetRpe && <span>RPE {x.targetRpe}</span>}
              </div>
            </section>
          ))}
        </div>
        <div className="detail-actions">
          <Link
            className="button primary"
            to={`/workouts/new?routineVersionId=${v?.id}`}
          >
            Start workout
          </Link>
          <Link
            className="button secondary"
            to={`/routines/${r.id}/versions/new`}
          >
            New version
          </Link>
        </div>
      </section>
    </Load>
  );
}
function RoutineEditor({
  version,
  routineId,
}: {
  version?: RoutineDetailContract["version"];
  routineId?: number;
}) {
  const nav = useNavigate();
  const [name, setName] = useState(version?.name ?? "");
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [items, setItems] = useState(() =>
    (version?.exercises ?? []).map((x) => ({ ...x })),
  );
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get<Exercise[]>("/exercises")
      .then(setCatalog)
      .catch(() => setError("Exercises could not be loaded."));
  }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!items.length || items.some((item) => !item.sets.length)) {
      setError("Add at least one exercise and one set per exercise.");
      return;
    }
    if (
      items.some((item) =>
        item.sets.some((set) => !routineSetInput.safeParse(set).success),
      )
    ) {
      setError(
        "Every set needs valid repetitions or duration and an RPE from 1 to 10.",
      );
      return;
    }
    const positions = items.map((item) => item.position);
    if (
      positions.some(
        (position) => !Number.isSafeInteger(position) || position < 1,
      ) ||
      new Set(positions).size !== positions.length
    ) {
      setError("Exercise positions must be unique positive integers.");
      return;
    }
    if (
      items.some(
        (item) =>
          item.sets.some(
            (set) =>
              !Number.isSafeInteger(set.setNumber) ||
              set.setNumber < 1 ||
              item.sets.filter(
                (candidate) => candidate.setNumber === set.setNumber,
              ).length > 1,
          ) ||
          (item.restSeconds != null &&
            (!Number.isSafeInteger(item.restSeconds) || item.restSeconds < 0)),
      )
    ) {
      setError("Set numbers and rest seconds must be valid unique integers.");
      return;
    }
    try {
      const enriched = items
        .map((item) => ({
          ...item,
          exercise:
            item.exercise ?? catalog.find((e) => e.id === item.exerciseId),
        }))
        .filter((item): item is typeof item & { exercise: Exercise } =>
          Boolean(item.exercise),
        );
      if (enriched.length !== items.length) {
        setError("Select an active exercise for every row.");
        return;
      }
      const payload = definition(name, null, enriched);
      const result = version
        ? await api.post<RoutineDetailContract>(
            `/routines/${routineId}/versions`,
            payload,
          )
        : await api.post<RoutineDetailContract>("/routines", {
            name: name || "Routine",
            description: null,
            version: payload,
          });
      nav(`/routines/${result.id}`);
    } catch {
      setError("The complete routine definition could not be saved.");
    }
  };
  return (
    <Load>
      <section className="editor-page">
        <header className="editor-header">
          <p className="eyebrow">ROUTINE BUILDER</p>
          <h1>{version ? "New routine version" : "New routine"}</h1>
          <p>
            Define a complete sealed version: exercises, positions, targets and
            planned sets.
          </p>
        </header>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <form className="editor-form" onSubmit={submit}>
          <label>
            Version name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              aria-describedby="routine-help"
            />
          </label>
          <p id="routine-help">
            Each exercise needs at least one planned repetition or duration set.
          </p>
          <button
            type="button"
            onClick={() => {
              const exercise = catalog[0];
              if (exercise)
                setItems((old) => [
                  ...old,
                  {
                    exerciseId: exercise.id,
                    position: old.length + 1,
                    restSeconds: null,
                    targetRpe: null,
                    notes: null,
                    exercise,
                    sets: [
                      {
                        setNumber: 1,
                        setType: "work",
                        targetWeightKg: null,
                        targetRepsMin: 1,
                        targetRepsMax: 1,
                        targetSeconds: null,
                        targetRpe: null,
                        notes: null,
                      },
                    ],
                  },
                ]);
            }}
          >
            Add exercise
          </button>
          {items.map((item, index) => (
            <fieldset className="card editor-exercise" key={item.position}>
              <legend>Exercise {index + 1}</legend>
              <button
                type="button"
                className="danger"
                onClick={() =>
                  setItems((old) =>
                    old
                      .filter((_, i) => i !== index)
                      .map((item, i) => ({ ...item, position: i + 1 })),
                  )
                }
              >
                Remove exercise
              </button>
              <label>
                Exercise
                <select
                  value={item.exerciseId}
                  onChange={(e) =>
                    setItems((old) =>
                      old.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              exerciseId: Number(e.target.value),
                              exercise: catalog.find(
                                (candidate) =>
                                  candidate.id === Number(e.target.value),
                              ),
                            }
                          : x,
                      ),
                    )
                  }
                >
                  {catalog.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Position
                <input
                  type="number"
                  min="1"
                  value={item.position}
                  onChange={(e) =>
                    setItems((old) =>
                      old.map((x, i) =>
                        i === index
                          ? { ...x, position: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Rest seconds
                <input
                  type="number"
                  min="0"
                  value={item.restSeconds ?? ""}
                  onChange={(e) =>
                    setItems((old) =>
                      old.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              restSeconds: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Exercise target RPE
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="any"
                  value={item.targetRpe ?? ""}
                  onChange={(e) =>
                    setItems((old) =>
                      old.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              targetRpe: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Exercise notes
                <textarea
                  value={item.notes ?? ""}
                  onChange={(e) =>
                    setItems((old) =>
                      old.map((x, i) =>
                        i === index
                          ? { ...x, notes: e.target.value || null }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              {item.sets.map((set, setIndex) => (
                <div className="set-row" key={set.setNumber}>
                  <label>
                    Set number
                    <input
                      aria-label={`Set ${set.setNumber} number`}
                      type="number"
                      min="1"
                      value={set.setNumber}
                      onChange={(e) =>
                        setItems((old) =>
                          old.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  sets: x.sets.map((s, si) =>
                                    si === setIndex
                                      ? {
                                          ...s,
                                          setNumber: Number(e.target.value),
                                        }
                                      : s,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Set type
                    <select
                      value={set.setType ?? "work"}
                      onChange={(e) =>
                        setItems((old) =>
                          old.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  sets: x.sets.map((s, si) =>
                                    si === setIndex
                                      ? { ...s, setType: e.target.value }
                                      : s,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="warmup">Warmup</option>
                      <option value="work">Work</option>
                      <option value="backoff">Backoff</option>
                    </select>
                  </label>
                  <label>
                    Target weight kg
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={set.targetWeightKg ?? ""}
                      onChange={(e) =>
                        setItems((old) =>
                          old.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  sets: x.sets.map((s, si) =>
                                    si === setIndex
                                      ? {
                                          ...s,
                                          targetWeightKg: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        }
                                      : s,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Minimum reps
                    <input
                      type="number"
                      min="1"
                      value={set.targetRepsMin ?? ""}
                      onChange={(e) =>
                        setItems((old) =>
                          old.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  sets: x.sets.map((s, si) =>
                                    si === setIndex
                                      ? {
                                          ...s,
                                          targetRepsMin: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        }
                                      : s,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Maximum reps
                    <input
                      type="number"
                      min="1"
                      value={set.targetRepsMax ?? ""}
                      onChange={(e) =>
                        setItems((old) =>
                          old.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  sets: x.sets.map((s, si) =>
                                    si === setIndex
                                      ? {
                                          ...s,
                                          targetRepsMax: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        }
                                      : s,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Target duration seconds
                    <input
                      type="number"
                      min="0"
                      value={set.targetSeconds ?? ""}
                      onChange={(e) =>
                        setItems((old) =>
                          old.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  sets: x.sets.map((s, si) =>
                                    si === setIndex
                                      ? {
                                          ...s,
                                          targetSeconds: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        }
                                      : s,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Set target RPE
                    <input
                      type="number"
                      min="1"
                      max="10"
                      step="any"
                      value={set.targetRpe ?? ""}
                      onChange={(e) =>
                        setItems((old) =>
                          old.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  sets: x.sets.map((s, si) =>
                                    si === setIndex
                                      ? {
                                          ...s,
                                          targetRpe: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                        }
                                      : s,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Set notes
                    <input
                      value={set.notes ?? ""}
                      onChange={(e) =>
                        setItems((old) =>
                          old.map((x, i) =>
                            i === index
                              ? {
                                  ...x,
                                  sets: x.sets.map((s, si) =>
                                    si === setIndex
                                      ? { ...s, notes: e.target.value || null }
                                      : s,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      setItems((old) =>
                        old.map((x, i) =>
                          i === index
                            ? {
                                ...x,
                                sets: x.sets.filter((_, si) => si !== setIndex),
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    Remove set
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setItems((old) =>
                    old.map((x, i) =>
                      i === index
                        ? {
                            ...x,
                            sets: [
                              ...x.sets,
                              {
                                setNumber: x.sets.length + 1,
                                setType: "work",
                                targetWeightKg: null,
                                targetRepsMin: 1,
                                targetRepsMax: 1,
                                targetSeconds: null,
                                targetRpe: null,
                                notes: null,
                              },
                            ],
                          }
                        : x,
                    ),
                  )
                }
              >
                Add set
              </button>
            </fieldset>
          ))}
          <button type="submit" className="primary form-submit">
            Save complete definition
          </button>
        </form>
      </section>
    </Load>
  );
}
function NewRoutineVersion() {
  const { routineId } = useParams();
  const [routine, setRoutine] = useState<RoutineDetailContract | null>(null);
  useEffect(() => {
    if (routineId)
      api
        .get<RoutineDetailContract>(`/routines/${id(routineId)}`)
        .then(setRoutine);
  }, [routineId]);
  return routine ? (
    <RoutineEditor version={routine.version} routineId={routine.id} />
  ) : (
    <Load>
      <p role="status">Loading routine…</p>
    </Load>
  );
}
function StartWorkout() {
  const [query] = useSearchParams();
  const nav = useNavigate();
  const [error, setError] = useState("");
  useEffect(() => {
    const version = query.get("routineVersionId");
    if (!version || !/^[1-9]\d*$/.test(version)) {
      setError("A valid routine version is required.");
      return;
    }
    api
      .post<Workout>("/workouts", {
        routineVersionId: Number(version),
        startedAt: new Date().toISOString(),
      })
      .then((workout) =>
        nav(`/workouts/${workout.id}/active`, { replace: true }),
      )
      .catch(() => setError("Workout could not be started."));
  }, [nav, query]);
  return (
    <Load>
      <section className="state-page">
        <p className="eyebrow">WORKOUT</p>
        <h1>Start workout</h1>
        <p role="status">{error || "Starting workout…"}</p>
      </section>
    </Load>
  );
}
function MeasurementEditor() {
  const nav = useNavigate();
  const [metrics, setMetrics] = useState<MetricType[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [measuredAt, setMeasuredAt] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get<MetricType[]>("/body-metric-types")
      .then(setMetrics)
      .catch(() => setError("Metric types could not be loaded."));
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const entries = Object.entries(values).filter(
      ([, value]) => value.trim() !== "",
    );
    if (!entries.length) {
      setError("Choose at least one metric value.");
      return;
    }
    const parsed = entries.map(
      ([code, value]) => [code, Number(value)] as const,
    );
    if (parsed.some(([, value]) => !Number.isFinite(value))) {
      setError("Metric values must be finite numbers.");
      return;
    }
    const date = new Date(measuredAt);
    if (Number.isNaN(date.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }
    try {
      await api.post("/me/measurements", {
        measuredAt: date.toISOString(),
        source: null,
        notes: null,
        metrics: Object.fromEntries(parsed),
      });
      nav("/measurements");
    } catch {
      setError("Measurement could not be saved.");
    }
  }
  return (
    <Load>
      <section className="editor-page measurement-editor">
        <header className="editor-header">
          <p className="eyebrow">BODY TRACKING</p>
          <h1>New measurement</h1>
          <p>Capture one immutable snapshot with one or more metric values.</p>
        </header>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <form className="editor-form" onSubmit={submit}>
          <label>
            Date and time
            <input
              type="datetime-local"
              value={measuredAt}
              onChange={(e) => setMeasuredAt(e.target.value)}
              required
              aria-describedby="measurement-time-help"
            />
          </label>
          <p id="measurement-time-help">
            Your local time is converted to a UTC timestamp.
          </p>
          {metrics.map((metric) => (
            <label key={metric.code}>
              {metric.name} ({metric.unit || "value"})
              <input
                type="number"
                step="any"
                value={values[metric.code] ?? ""}
                onChange={(e) =>
                  setValues((old) => ({
                    ...old,
                    [metric.code]: e.target.value,
                  }))
                }
              />
            </label>
          ))}
          <button type="submit" className="primary form-submit">
            Save measurement
          </button>
        </form>
      </section>
    </Load>
  );
}
export function LegacySimpleForm({
  kind,
}: {
  kind: "routine" | "measurement";
}) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<MetricType[]>([]);
  useEffect(() => {
    if (kind === "measurement")
      api.get<MetricType[]>("/body-metric-types").then(setMetrics);
  }, [kind]);
  return (
    <Load>
      <h1>{kind === "routine" ? "New routine" : "New measurement"}</h1>
      {kind === "routine" ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const ex = (await api.get<Exercise[]>("/exercises"))[0];
              if (!ex) throw new Error();
              const r = await api.post<RoutineDetailContract>("/routines", {
                name,
                description: null,
                version: {
                  name,
                  notes: null,
                  exercises: [
                    {
                      exerciseId: ex.id,
                      position: 1,
                      restSeconds: null,
                      targetRpe: null,
                      notes: null,
                      sets: [
                        {
                          setNumber: 1,
                          setType: "work",
                          targetWeightKg: null,
                          targetRepsMin: 1,
                          targetRepsMax: 1,
                          targetSeconds: null,
                          targetRpe: null,
                          notes: null,
                        },
                      ],
                    },
                  ],
                },
              });
              nav(`/routines/${r.id}`);
            } catch {
              setBusy(false);
              alert("Routine could not be created.");
            }
          }}
        >
          <label>
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Saving…" : "Create routine"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const entries = metrics
              .filter(
                (_, i) =>
                  document.getElementById(`m${i}`) instanceof
                    HTMLInputElement &&
                  (document.getElementById(`m${i}`) as HTMLInputElement).value,
              )
              .map((m, i) => [
                m.code,
                Number(
                  (document.getElementById(`m${i}`) as HTMLInputElement).value,
                ),
              ]);
            if (!entries.length) return;
            await api.post("/me/measurements", {
              measuredAt: new Date().toISOString(),
              source: null,
              notes: null,
              metrics: Object.fromEntries(entries),
            });
            nav("/measurements");
          }}
        >
          <label>
            Date
            <input
              type="datetime-local"
              required
              defaultValue={new Date().toISOString().slice(0, 16)}
            />
          </label>
          {metrics.map((m, i) => (
            <label key={m.code}>
              {m.name} ({m.unit || "value"})
              <input id={`m${i}`} type="number" step="any" />
            </label>
          ))}
          <button type="submit" className="primary">
            Save measurement
          </button>
        </form>
      )}
    </Load>
  );
}
function Workouts() {
  const [status, setStatus] = useState<"all" | Workout["status"]>("all");
  const [data, setData] = useState<Workout[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get<Workout[]>(`/workouts${status === "all" ? "" : `?status=${status}`}`)
      .then(setData)
      .catch(() => {
        setData(null);
        setError("Workout history could not be loaded.");
      });
  }, [status]);
  return (
    <Load>
      <section className="catalog-page">
        <header className="catalog-header">
          <div>
            <p className="eyebrow">TRAINING LOG</p>
            <h1>Workout history</h1>
          </div>
          <label className="filter-control">
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
            >
              <option value="all">All</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </header>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {data === null ? (
          <p>Loading…</p>
        ) : data.length === 0 ? (
          <p className="empty">No workouts yet.</p>
        ) : (
          <div className="catalog-grid">
            {data.map((w) => (
              <Link
                className="catalog-card workout-card"
                key={w.id}
                to={`/workouts/${w.id}`}
              >
                <span className={`status-pill status-${w.status}`}>
                  {w.status.replace("_", " ")}
                </span>
                <div>
                  <h2>Workout #{w.id}</h2>
                  <div className="catalog-meta">
                    <span>{new Date(w.startedAt).toLocaleDateString()}</span>
                    {w.planning?.name && <span>{w.planning.name}</span>}
                  </div>
                </div>
                <p>Open the planned and recorded session.</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Load>
  );
}
function WorkoutDetail() {
  const { workoutId } = useParams();
  const [w, setW] = useState<Workout | null>(null);
  useEffect(() => {
    api
      .get<Workout>(`/workouts/${id(workoutId)}`)
      .then(setW)
      .catch(() => setW(null));
  }, [workoutId]);
  if (!w)
    return (
      <Load>
        <p>Workout not found.</p>
      </Load>
    );
  return (
    <Load>
      <section className="detail-page">
        <Link className="back-link" to="/workouts">
          ← History
        </Link>
        <header className="detail-header">
          <div>
            <p className="eyebrow">WORKOUT</p>
            <h1>Workout #{w.id}</h1>
          </div>
          <span className={`status-pill status-${w.status}`}>
            Status: {w.status}
          </span>
        </header>
        {w.status === "in_progress" && (
          <Link className="button primary detail-action" to="active">
            Resume
          </Link>
        )}
        {w.planning && (
          <section className="info-card">
            <p className="eyebrow">PLANNING</p>
            <h2>{w.planning.name}</h2>
            <div className="catalog-meta">
              <span>Version {w.planning.version.versionNumber}</span>
              <span>
                {w.planning.version.exercises.length} planned exercises
              </span>
            </div>
            <div className="mini-list">
              {w.planning.version.exercises.map((exercise) => (
                <p key={exercise.id}>
                  Planned: {exercise.exercise?.name || exercise.exerciseId}
                </p>
              ))}
            </div>
          </section>
        )}
        <section className="results-section">
          <div className="section-heading">
            <p className="eyebrow">EXECUTION</p>
            <h2>Results</h2>
          </div>
          {w.results?.length ? (
            <div className="detail-grid">
              {w.results.map((r) => (
                <section className="info-card" key={r.routineExerciseId}>
                  <p className="eyebrow">PLANNED #{r.routineExerciseId}</p>
                  <h3>Performed exercise #{r.exerciseId}</h3>
                  <p>{r.sets.length} sets recorded</p>
                  {r.notes && <p>{r.notes}</p>}
                </section>
              ))}
            </div>
          ) : (
            <p className="empty">No results recorded.</p>
          )}
        </section>
      </section>
    </Load>
  );
}
export function LegacyActive() {
  const { workoutId } = useParams();
  const nav = useNavigate();
  const [w, setW] = useState<Workout | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get<Workout>(`/workouts/${id(workoutId)}`).then(setW);
  }, [workoutId]);
  if (!w)
    return (
      <Load>
        <p>Loading workout…</p>
      </Load>
    );
  const finish = async (cancel = false) => {
    if (!confirm(cancel ? "Cancel this workout?" : "Complete this workout?"))
      return;
    await api.post(
      cancel ? `/workouts/${w.id}/cancel` : `/workouts/${w.id}/complete`,
      cancel
        ? {}
        : {
            completedAt: new Date().toISOString(),
            overallRpe: null,
            notes: null,
          },
    );
    nav(`/workouts/${w.id}`);
  };
  return (
    <Load>
      <p className="eyebrow">ACTIVE WORKOUT</p>
      <h1>Session #{w.id}</h1>
      <p>{w.planning?.name || "Training session"}</p>
      <div className="stack">
        {w.planning?.version?.exercises.map((x) => (
          <section className="card" key={x.position}>
            <h2>{x.exercise?.name || `Exercise ${x.exerciseId}`}</h2>
            <p>{x.sets.length} planned sets</p>
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                await api.put(`/workouts/${w.id}/exercises/${x.id}`, {
                  exerciseId: x.exerciseId,
                  position: x.position,
                  notes: null,
                  sets: x.sets.map((s) => ({
                    setNumber: s.setNumber,
                    weightKg: null,
                    reps: null,
                    durationSeconds: null,
                    rpe: null,
                    completed: true,
                    painLevel: null,
                    painArea: null,
                    notes: null,
                  })),
                });
                setSaving(false);
              }}
            >
              Save complete sets
            </button>
          </section>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="primary" onClick={() => finish()}>
          Complete workout
        </button>
        <button type="button" className="danger" onClick={() => finish(true)}>
          Cancel workout
        </button>
      </div>
    </Load>
  );
}
function ConfirmDialog({
  title,
  text,
  onCancel,
  onConfirm,
  onSave,
  onDiscard,
  restoreFocus,
}: {
  title: string;
  text: string;
  onCancel: () => void;
  onConfirm: () => void;
  onSave?: () => void;
  onDiscard?: () => void;
  restoreFocus?: HTMLElement | null;
}) {
  useEffect(() => {
    const first = document.querySelector<HTMLButtonElement>(
      '[role="dialog"] button',
    );
    first?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "Tab") {
        const buttons = [
          ...document.querySelectorAll<HTMLButtonElement>(
            '[role="dialog"] button',
          ),
        ];
        if (!buttons.length) return;
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next = event.shiftKey
          ? index <= 0
            ? buttons.length - 1
            : index - 1
          : index === buttons.length - 1
            ? 0
            : index + 1;
        event.preventDefault();
        buttons[next].focus();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      restoreFocus?.focus();
    };
  }, [onCancel, restoreFocus]);
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
      >
        <h2 id="dialog-title">{title}</h2>
        <p id="dialog-description">{text}</p>
        <div className="actions">
          <button type="button" onClick={onCancel}>
            Keep editing
          </button>
          {onSave && onDiscard ? (
            <>
              <button type="button" className="primary" onClick={onSave}>
                Save and finish
              </button>
              <button type="button" className="danger" onClick={onDiscard}>
                Discard and finish
              </button>
            </>
          ) : (
            <button type="button" className="danger" onClick={onConfirm}>
              Confirm
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
function WorkoutEditor() {
  const { workoutId } = useParams();
  const nav = useNavigate();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [drafts, setDrafts] = useState<Record<number, ExerciseDraft>>({});
  const [selected, setSelected] = useState(0);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [dialog, setDialog] = useState<
    "complete" | "cancel" | "navigate" | null
  >(null);
  const [pendingSelection, setPendingSelection] = useState<number | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const blocker = useBlocker(dirty);
  const [timer, setTimer] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [terminal, setTerminal] = useState(false);
  useEffect(() => {
    api
      .get<Workout>(`/workouts/${id(workoutId)}`)
      .then((value) => {
        setWorkout(value);
        const first = value.planning?.version.exercises[0];
        if (first)
          setDrafts({ [first.id as number]: initializeDraft(value, first) });
        if (value.status !== "in_progress") {
          setTerminal(true);
          nav(`/workouts/${value.id}`, { replace: true });
        }
      })
      .catch((caught) =>
        setError(errorMessage(caught, "Workout could not be loaded.")),
      );
    api.get<Exercise[]>("/exercises").then(setCatalog);
  }, [workoutId, nav]);
  useEffect(() => {
    if (timer > 0 && !paused) {
      const handle = window.setInterval(
        () => setTimer((value) => value - 1),
        1000,
      );
      return () => window.clearInterval(handle);
    }
  }, [timer, paused]);
  useEffect(() => {
    if (blocker.state === "blocked") {
      triggerRef.current = document.activeElement as HTMLElement;
      setDialog("navigate");
    }
  }, [blocker.state]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  if (terminal)
    return (
      <Load>
        <p role="status">Opening read-only workout detail…</p>
      </Load>
    );
  if (!workout)
    return (
      <Load>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p role="status">Loading workout…</p>
        )}
      </Load>
    );
  const exercises = workout.planning?.version.exercises ?? [];
  const planned = exercises[selected];
  if (!planned)
    return (
      <Load>
        <p>No planned exercises found.</p>
      </Load>
    );
  const draft =
    drafts[planned.id as number] ?? initializeDraft(workout, planned);
  const update = (next: ExerciseDraft) => {
    setDrafts((old) => ({ ...old, [planned.id as number]: next }));
    setDirty(true);
  };
  const save = async (): Promise<boolean> => {
    try {
      await api.put(
        `/workouts/${workout.id}/exercises/${planned.id}`,
        serializeDraft(draft),
      );
      setDirty(false);
      setError("Saved");
      return true;
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          "Could not save this exercise. Your draft remains here.",
        ),
      );
      return false;
    }
  };
  const finish = async (cancel: boolean) => {
    try {
      await api.post(
        cancel
          ? `/workouts/${workout.id}/cancel`
          : `/workouts/${workout.id}/complete`,
        cancel
          ? {}
          : {
              completedAt: new Date().toISOString(),
              overallRpe: null,
              notes: null,
            },
      );
      nav(`/workouts/${workout.id}`);
    } catch {
      setError("The workout state changed. Reload before trying again.");
    }
  };
  const requestSelection = (
    next: number,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (next < 0 || next >= exercises.length) return;
    if (dirty) {
      triggerRef.current = event.currentTarget;
      setPendingSelection(next);
      setDialog("navigate");
    } else setSelected(next);
  };
  const discardAndNavigate = () => {
    setDirty(false);
    setDialog(null);
    if (blocker.state === "blocked") blocker.proceed();
    else if (pendingSelection !== null) setSelected(pendingSelection);
    setPendingSelection(null);
  };
  const saveAndNavigate = async () => {
    if (await save()) {
      setDialog(null);
      if (blocker.state === "blocked") blocker.proceed();
      else if (pendingSelection !== null) setSelected(pendingSelection);
      setPendingSelection(null);
    }
  };
  const keepEditing = () => {
    if (blocker.state === "blocked") blocker.reset();
    setDialog(null);
  };
  return (
    <Load>
      <section className="workout-page">
        <header className="workout-header">
          <div>
            <p className="eyebrow">ACTIVE WORKOUT</p>
            <h1>{workout.planning?.name || `Session #${workout.id}`}</h1>
          </div>
          <Link className="button secondary" to="/workouts">
            Exit workout
          </Link>
        </header>
        <div className="workout-progress">
          <span>
            Exercise {selected + 1} of {exercises.length}
          </span>
          <div aria-hidden="true">
            <span
              style={{
                width: `${((selected + 1) / exercises.length) * 100}%`,
              }}
            />
          </div>
        </div>
        <fieldset className="exercise-tabs">
          <legend className="sr-only">Planned exercises</legend>
          {exercises.map((exercise, index) => (
            <button
              className={index === selected ? "is-active" : ""}
              key={exercise.id}
              type="button"
              onClick={(event) => requestSelection(index, event)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {exercise.exercise?.name || `Exercise ${exercise.exerciseId}`}
            </button>
          ))}
        </fieldset>
        {error && (
          <p className="state" role="status">
            {error}
          </p>
        )}
        <section className="card active-exercise-card">
          <h2>{planned.exercise?.name || `Exercise ${planned.exerciseId}`}</h2>
          <label>
            Performed exercise
            <select
              value={draft.exerciseId}
              onChange={(e) =>
                update({ ...draft, exerciseId: Number(e.target.value) })
              }
            >
              {catalog.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
          </label>
          {draft.sets.map((set, index) => (
            <fieldset
              className={`set-row ${set.completed ? "is-complete" : ""}`}
              key={set.setNumber}
            >
              <legend>Set {set.setNumber}</legend>
              <label>
                Weight kg
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={set.weightKg ?? ""}
                  onChange={(e) =>
                    update({
                      ...draft,
                      sets: draft.sets.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              weightKg:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Reps
                <input
                  type="number"
                  min="0"
                  value={set.reps ?? ""}
                  onChange={(e) =>
                    update({
                      ...draft,
                      sets: draft.sets.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              reps:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                RPE
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="any"
                  value={set.rpe ?? ""}
                  onChange={(e) =>
                    update({
                      ...draft,
                      sets: draft.sets.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              rpe:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Duration seconds
                <input
                  type="number"
                  min="0"
                  value={set.durationSeconds ?? ""}
                  onChange={(e) =>
                    update({
                      ...draft,
                      sets: draft.sets.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              durationSeconds:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Pain level (0–10)
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={set.painLevel ?? ""}
                  onChange={(e) =>
                    update({
                      ...draft,
                      sets: draft.sets.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              painLevel:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Pain area
                <input
                  value={set.painArea ?? ""}
                  onChange={(e) =>
                    update({
                      ...draft,
                      sets: draft.sets.map((x, i) =>
                        i === index
                          ? { ...x, painArea: e.target.value || null }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Notes
                <input
                  value={set.notes ?? ""}
                  onChange={(e) =>
                    update({
                      ...draft,
                      sets: draft.sets.map((x, i) =>
                        i === index
                          ? { ...x, notes: e.target.value || null }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={set.completed}
                  onChange={(e) =>
                    update({
                      ...draft,
                      sets: draft.sets.map((x, i) =>
                        i === index ? { ...x, completed: e.target.checked } : x,
                      ),
                    })
                  }
                />{" "}
                Completed
              </label>
              <button
                type="button"
                className="danger"
                onClick={() => update(removeSet(draft, set.setNumber))}
              >
                Remove set
              </button>
            </fieldset>
          ))}
          <button type="button" onClick={() => update(addSet(draft))}>
            Add set
          </button>
          <label>
            Exercise notes
            <textarea
              value={draft.notes ?? ""}
              onChange={(e) =>
                update({ ...draft, notes: e.target.value || null })
              }
            />
          </label>
        </section>
        <div className="actions workout-actions">
          <button type="button" className="primary" onClick={save}>
            Save complete result
          </button>
          <button type="button" onClick={() => setTimer(60)}>
            {timer ? `Rest ${timer}s` : "Start rest timer"}
          </button>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            disabled={!timer}
          >
            {paused ? "Resume timer" : "Pause timer"}
          </button>
        </div>
        <div className="actions workout-actions terminal-actions">
          <button
            type="button"
            onClick={(event) => requestSelection(selected - 1, event)}
          >
            Previous exercise
          </button>
          <button
            type="button"
            onClick={(event) => requestSelection(selected + 1, event)}
          >
            Next exercise
          </button>
          <button
            type="button"
            className="primary"
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              setDialog("complete");
            }}
          >
            Complete workout
          </button>
          <button
            type="button"
            className="danger"
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              setDialog("cancel");
            }}
          >
            Cancel workout
          </button>
        </div>
        {dialog && (
          <ConfirmDialog
            title={
              dialog === "cancel"
                ? "Cancel workout?"
                : dialog === "navigate"
                  ? "Leave this exercise?"
                  : "Complete workout?"
            }
            text={
              dirty
                ? "You have unsaved changes. Save or discard them before leaving."
                : "This action cannot be undone."
            }
            onCancel={keepEditing}
            onConfirm={() => {
              setDialog(null);
              if (dialog === "navigate") discardAndNavigate();
              else void finish(dialog === "cancel");
            }}
            onSave={
              dirty && dialog !== "navigate"
                ? async () => {
                    if (await save()) {
                      setDialog(null);
                      void finish(dialog === "cancel");
                    }
                  }
                : dialog === "navigate"
                  ? saveAndNavigate
                  : undefined
            }
            onDiscard={
              dirty && dialog !== "navigate"
                ? () => {
                    setDirty(false);
                    setDialog(null);
                    void finish(dialog === "cancel");
                  }
                : dialog === "navigate"
                  ? discardAndNavigate
                  : undefined
            }
            restoreFocus={triggerRef.current}
          />
        )}
      </section>
    </Load>
  );
}
function Measurements() {
  const [data, setData] = useState<Measurement[] | null>(null);
  useEffect(() => {
    api
      .get<Measurement[]>("/me/measurements")
      .then(setData)
      .catch(() => setData([]));
  }, []);
  return (
    <Load>
      <section className="catalog-page">
        <header className="catalog-header">
          <div>
            <p className="eyebrow">EVOLUTION</p>
            <h1>Measurements</h1>
          </div>
          <Link className="button primary catalog-cta" to="new">
            Add
          </Link>
        </header>
        {data === null ? (
          <p>Loading…</p>
        ) : data.length === 0 ? (
          <p className="empty">No measurements yet.</p>
        ) : (
          <div className="catalog-grid">
            {data.map((m) => (
              <Link
                className="catalog-card measurement-card"
                key={m.id}
                to={`/measurements/${m.id}`}
              >
                <span className="catalog-number" aria-hidden="true">
                  {String(m.id).padStart(2, "0")}
                </span>
                <div>
                  <h2>{new Date(m.measuredAt).toLocaleDateString()}</h2>
                  <div className="catalog-meta">
                    {Object.keys(m.metrics).map((metric) => (
                      <span key={metric}>{metric}</span>
                    ))}
                  </div>
                </div>
                <p>{m.notes || "Open this body metric snapshot."}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Load>
  );
}
function MeasurementDetail() {
  const { measurementId } = useParams();
  const [m, setM] = useState<Measurement | null>(null);
  useEffect(() => {
    api
      .get<Measurement>(`/me/measurements/${id(measurementId)}`)
      .then(setM)
      .catch(() => setM(null));
  }, [measurementId]);
  return (
    <Load>
      {m ? (
        <section className="detail-page">
          <Link className="back-link" to="/measurements">
            ← Measurements
          </Link>
          <header className="detail-header">
            <div>
              <p className="eyebrow">BODY METRICS</p>
              <h1>Measurement</h1>
            </div>
            <div className="version-badge">
              <span>DATE</span>
              <strong>{new Date(m.measuredAt).toLocaleDateString()}</strong>
            </div>
          </header>
          <p className="detail-copy">
            {new Date(m.measuredAt).toLocaleString()}
          </p>
          <div className="metric-grid">
            {Object.entries(m.metrics).map(([k, v]) => (
              <section className="metric-card" key={k}>
                <span>{k}</span>
                <strong>
                  {v.value} {v.unit}
                </strong>
              </section>
            ))}
          </div>
          {m.notes && <p className="detail-copy">{m.notes}</p>}
        </section>
      ) : (
        <p>Measurement not found.</p>
      )}
    </Load>
  );
}
function Account() {
  const [me, setMe] = useState<{
    id: number;
    displayName?: string | null;
  } | null>(null);
  const nav = useNavigate();
  useEffect(() => {
    api.get<typeof me>("/me").then(setMe);
  }, []);
  return (
    <Load>
      <section className="detail-page account-page">
        <header className="detail-header">
          <div>
            <p className="eyebrow">PROFILE</p>
            <h1>Account</h1>
          </div>
          <div className="account-avatar" aria-hidden="true">
            {me?.displayName?.slice(0, 1).toUpperCase() || "W"}
          </div>
        </header>
        <section className="info-card account-card">
          <p>
            <span className="eyebrow">ID</span> {me?.id}
          </p>
          {me?.displayName && (
            <p>
              <span className="eyebrow">DISPLAY NAME</span> {me.displayName}
            </p>
          )}
        </section>
        <button
          type="button"
          className="danger account-signout"
          onClick={async () => {
            await supabase().auth.signOut();
            sessionStorage.removeItem("returnTo");
            nav("/login", { replace: true });
          }}
        >
          Sign out
        </button>
      </section>
    </Load>
  );
}
const router = createBrowserRouter([
  {
    element: <Public />,
    errorElement: <RouteError />,
    children: [
      { path: "/login", element: <Login /> },
      { path: "/auth/callback", element: <Callback /> },
    ],
  },
  {
    element: <Protected />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/exercises", element: <Exercises /> },
      { path: "/exercises/:exerciseId", element: <ExerciseDetail /> },
      { path: "/routines", element: <Routines /> },
      { path: "/routines/new", element: <RoutineEditor /> },
      { path: "/routines/:routineId", element: <RoutineDetailPage /> },
      {
        path: "/routines/:routineId/versions/new",
        element: <NewRoutineVersion />,
      },
      { path: "/workouts", element: <Workouts /> },
      { path: "/workouts/new", element: <StartWorkout /> },
      { path: "/workouts/:workoutId", element: <WorkoutDetail /> },
      { path: "/workouts/:workoutId/active", element: <WorkoutEditor /> },
      { path: "/measurements", element: <Measurements /> },
      { path: "/measurements/new", element: <MeasurementEditor /> },
      { path: "/measurements/:measurementId", element: <MeasurementDetail /> },
      { path: "/account", element: <Account /> },
      {
        path: "*",
        element: (
          <Load>
            <section className="state-page">
              <p className="eyebrow">404</p>
              <h1>Not found</h1>
              <p>The requested page does not exist.</p>
            </section>
          </Load>
        ),
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
const root = document.getElementById("root");
if (!root) throw new Error("Missing app root");
createRoot(root).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
