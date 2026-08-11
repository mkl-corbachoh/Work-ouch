# Repository Instructions

## Source Of Truth

- Read `docs/architecture.md` and the target `specs/<number>-<name>/` before changing the project.
- This repository is spec-driven. `spec.md` defines what, `plan.md` defines how, and `tasks.md` tracks executable work.
- Do not implement a spec while its status is `draft` or while its reviewed `plan.md` and `tasks.md` are absent.
- Work on one spec at a time. Implement only unchecked tasks, verify each task, then mark its checkbox; do not advance another spec automatically.
- If a design problem affects another spec, document it instead of silently redesigning that area.
- When executable config and prose eventually disagree, trust the executable config and update stale documentation deliberately.

## Current Bootstrap State

- The Node.js project, npm lockfile, Justfile, application foundation, migration runner, and executable checks now exist; use the documented `just` recipes.
- Specs 001-003 are completed, including user-confirmed Docker verification for spec 001. Spec 004 is approved for planning; specs 005-006 remain drafts.
- Spec 006 defines the approved direction for OAuth authentication required by a future remote MCP adapter, but it must not be implemented while its status remains `draft`. Do not create or implement spec 007 MCP before spec 006 is completed.
- User endpoints have no owning spec yet. Do not place them into `001-project-foundation` or another spec without resolving the open decision in `docs/architecture.md`.
- Spec 001 fixes Node.js 24 LTS, npm, and Biome. Initial pagination remains undecided and outside spec 001.

## Domain Invariants

- Keep catalog, planning, and execution separate: `exercises` describes identity, `routine_*` describes planned work, and `workout_*` records actual work.
- `routine_sets` is planning; `workout_sets` is execution. Workout results must never update a routine version.
- Routine versions are immutable. Any planning change creates a new incremented version while historical workouts retain their original version reference.
- Exercise substitutions retain both `routine_exercise_id` (planned) and `exercise_id` (performed).
- Enforce same-user ownership across routines, routine versions, workouts, and measurements; a workout's planned exercise must belong to its selected routine version.
- Exercises are global. They must not contain weight, sets, reps, duration, rest, RPE, or routine position.
- Preserve inactive exercises and routines for historical reads; do not add physical-delete APIs for historical data.
- Body metrics are catalog-driven. Add metric types as rows, not schema columns, and create a measurement plus all values atomically.

## Implementation Constraints

- Use Node.js, strict TypeScript, Express, SQLite, `better-sqlite3`, Zod, and Vitest; use explicit SQL and no ORM.
- Routes must not execute SQL directly. Add only the module files needed for a clear implementation; the structure in `docs/architecture.md` is a guide, not a template.
- Validate body, params, and query data with Zod before domain logic. API JSON uses `camelCase`; SQLite uses `snake_case`.
- Accept ISO-8601 timestamps with a timezone and normalize API/database timestamps to UTC.
- Enable SQLite foreign keys and WAL. Apply ordered SQL migrations once via `schema_migrations`; use transactions for aggregate writes and migration bookkeeping.
- Tests must use temporary or in-memory SQLite and must never point at `./data/training.db`.
- Keep `GET /health` outside `/api/v1`; version functional routes under `/api/v1`.
- Docker production execution must run compiled JavaScript and persist SQLite under `/app/data`.
- Do not add authentication or authorization except while implementing an approved spec 006. Do not implement an identity provider, domain users, token passthrough, or MCP as part of that exception.
- Do not add frontend, Redis, queues, WebSockets, external sync, Google Sheets import, analytics, recommendations, or other future-spec work.

## Verification

- Once the Justfile exists, use its recipes rather than guessing package-manager commands.
- Run the narrowest relevant tests while completing a task, then the spec's required verification before marking it complete.
- Never mark a task or spec complete based only on code changes; required tests and acceptance criteria must pass.
