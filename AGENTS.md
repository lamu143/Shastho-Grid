# Repository guidance

## Product and source of truth

- The current product name is **ShasthoGrid** (formerly AWaReGrid). It combines WHO AWaRe antibiotic stewardship with critical care, ventilator, and blood allocation. The declared hackathon challenges are A02 and A05.
- Use feature names from `frontend/src/lib/brand.ts` in product UI copy. `ROADMAP.md` tracks milestones and remaining product work.
- Keep lowercase `awaregrid` identifiers (including the Dexie database and existing database/local storage names) to preserve existing user data.
- The repository has a trailing space in its directory name. Quote paths when scripting or using command-line tools.

## Project layout and commands

- `backend/`: FastAPI, Python 3.12, SQLAlchemy async, PostgreSQL, Redis, OR-Tools CP-SAT. Use `uv`.
- `frontend/`: Next.js 16, React 19, TypeScript, Serwist PWA, Dexie offline storage.
- Start local infrastructure with `docker compose up -d postgres redis`.
- Backend from `backend/`: `uv sync --group dev`; seed with `uv run python -m app.db.seed`; run with `uv run uvicorn app.main:app --reload --port 8000`.
- Frontend from `frontend/`: `npm install`; run with `npm run dev`; check with `npx tsc --noEmit`, `npm run lint`, and `npm run build` (build uses webpack for Serwist).
- End-to-end Playwright tests require PostgreSQL, Redis, backend and a production frontend build. Read `CLAUDE.md` for test DB safeguards and test commands before running backend tests.

## Backend safety invariants

- Keep all clinical and facility data scoped to the authenticated user's clinic/facility; enforce scope checks on cross-tenant access.
- CareMatch is a pure function of `FacilitySnapshot`s. Never relax clinical safety groups (`C_ICU`, `C_VENT`, `C_SPEC`, `C_BLOOD`) in a repair.
- LockStep transactions must acquire locks in global order: `reservations` → `hospital_resources` → `blood_inventories`, each sorted by id. Recheck availability under lock and preserve database constraints and idempotency behavior.
- RaceLab may only modify the inactive `RACELAB-SANDBOX` facility. Preserve the seeded Farmgate infeasibility case.
- Steward-agent inputs must stay de-identified. Preserve prompt-injection and hallucination guards; generated counseling must not introduce drugs disallowed by the solver.
- Schema changes to existing tables need an idempotent upgrade in `_UPGRADE_STATEMENTS` in `backend/app/db/session.py`; there are no Alembic migrations currently.

## Frontend conventions

- Read and follow `frontend/AGENTS.md`. Before changing Next.js code, consult the relevant guide under `frontend/node_modules/next/dist/docs/`; this project uses Next.js 16 conventions.
- Edit TypeScript sources, not compiled CommonJS copies. Keep offline behavior, sync conflict handling, bilingual EN/BN strings, and accessibility support intact.
- Use the existing design tokens/utilities and `useI18n` translation keys for UI work.

## Working practices

- Do not read or expose local `.env` files. Use `.env.example` to understand configuration.
- Avoid unrelated changes to generated files, dependency directories, caches, and build outputs.
- Do not run tests unless the user asks for verification or testing.
- See `CLAUDE.md` for deeper architecture notes and operational details.
