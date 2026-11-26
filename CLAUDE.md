# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

The product is branded **ShasthoGrid** (formerly AWaReGrid). It merges WHO AWaRe antibiotic stewardship with ICU, ventilator and blood allocation, and it declares hackathon challenges **A02 + A05**. Feature names (RxSolve, CareMatch, ConflictProof, LockStep, RaceLab, PulseScore, FreshStock, SyncSafe, StewardLens, Shastho Copilot) come from `frontend/src/lib/brand.ts`, so use them in UI copy. `ROADMAP.md` tracks the remaining milestones. Lowercase `awaregrid` identifiers (localStorage keys, the Dexie DB name, Postgres names) are kept on purpose; renaming them would wipe users' local data.

Its parts:
- `backend/`: a FastAPI API (Python 3.12, managed with uv). A CP-SAT solver recommends an antibiotic regimen and dispensing batch, and an LLM "steward agent" writes the patient counseling text.
- `frontend/`: an offline-first Next.js 16 / React 19 PWA. It uses Serwist for the service worker and Dexie (IndexedDB) for local storage.

Note: the working directory name ends in a trailing space (`AWaReGrid `), so quote paths.

## Commands

### Infrastructure
```bash
docker compose up -d postgres redis      # Postgres 16 on :5432, Redis 7 on :6379
docker compose up --build                # full stack (note: frontend/Dockerfile does not exist yet)
```

### Backend (run from `backend/`)
```bash
cp .env.example .env
uv sync --group dev
uv run python -m app.db.seed             # create tables + seed data (seed.py has a __main__)
uv run uvicorn app.main:app --reload --port 8000
# tests: always point at the separate test DB (create once: CREATE DATABASE awaregrid_test)
DATABASE_URL=postgresql+asyncpg://awaregrid:awaregrid@localhost:5432/awaregrid_test uv run --group dev pytest -q
DATABASE_URL=...awaregrid_test uv run --group dev pytest tests/test_critical_care.py::test_name -q   # single test
uv run ruff check .                      # ruff is used (cache present) but not declared in pyproject
```
Tests drop and recreate every table, then reseed, in the database that `DATABASE_URL` points to (see `tests/conftest.py`). Never point it at a database whose data matters. Tables are created with `Base.metadata.create_all`. Alembic is installed but has no migrations. Schema changes to *existing* tables must also be added as idempotent SQL to `_UPGRADE_STATEMENTS` in `app/db/session.py`, or older databases won't get them.

LockStep (A05) is `app/services/lockstep.py` + `app/routers/lockstep.py`. Any code that locks stock must follow the global order **reservations → hospital_resources → blood_inventories (each sorted by id)**, or the deadlock test will fail. RaceLab only touches the inactive `RACELAB-SANDBOX` facility. The lifespan sweeper can be turned off with `LOCKSTEP_SWEEPER_ENABLED=false`. CareMatch/ConflictProof (A02) is `app/services/carematch.py`: a pure function over `FacilitySnapshot`s with no DB or network access. Clinical-safety groups (`C_ICU`, `C_VENT`, `C_SPEC`, `C_BLOOD`) must never appear in a repair's `relaxed` list. Critical care lives in `app/routers/critical_care.py` (facilities, staffed beds, blood, PulseScore, `/carematch/*`), `app/services/{news2,blood_compat,routing}.py` and `app/db/seed_critical_care.py`. Seed stock is simulated and deliberately makes the "Farmgate" case (public, obstetric, ICU + ventilator, 2× O−, ≤15 min) infeasible at any single hospital. `test_farmgate_case_is_infeasible_at_any_single_public_hospital` guards this, so keep it passing when editing seed numbers. Facility officers (`hospital_admin`, `blood_bank_officer`) are restricted to their own facility by `enforce_facility_scope`. Real capacity arrives through staff PATCHes or the hospital push feed (`app/routers/feed.py`, guide in `docs/hospital-feed.md`). Every resource or blood row carries `data_source` (SEED_DEMO/STAFF/FEED) and `reported_at`, and freshness must use `reported_at`, not `updated_at`, because reservation holds also touch `updated_at`. The feed subtracts pending holds from the reported counts. Feed keys carry a `scope` (RESOURCES/BLOOD/ALL) derived from the creating role. Holds are subtracted from a feed push only *after* the resource locks are taken. RaceLab sandbox holds may not reserve blood, and `racelab/reset` cancels through `_release` so stock is returned. The rate limiter honours `X-Forwarded-For` only from `TRUSTED_PROXIES`, and `/auth/*` and `/feed/*` share a stricter per-IP bucket (`RATE_LIMIT_SENSITIVE_REQUESTS`). StewardLens critical-care analytics: `GET /critical-care/insights` plus `frontend/src/app/insights/page.tsx`. FacilityDesk (`frontend/src/app/facility/page.tsx`) is the officer console, and `hospital_admin` and `blood_bank_officer` land there after login. `OfflineHydrator` bootstraps the offline clinic cache only for stewardship roles, because critical-care roles get a 403 from `/sync/bootstrap`. Tests that push to a facility must restore its seed values (see the `restore_nins` fixture in `tests/test_feed.py`).

### Frontend (run from `frontend/`)
```bash
npm install
npm run dev                              # service worker disabled in dev
npm run build                            # uses --webpack (Serwist requires it)
npm run lint
npx playwright test                      # auto-starts `npm run start` on :3000; needs a prior build + backend on :8000
npx playwright test tests/e2e/tier1_features.spec.ts -g "name"   # single test
```
Playwright environment variables: `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_API_URL`, `PLAYWRIGHT_SKIP_WEBSERVER=1`, `PW_HTML_REPORT=1`. Tests run serially (workers: 1) and include axe accessibility checks (`tests/e2e/helpers/a11y.ts`).

## Architecture

### Backend request pipeline (`app/main.py`)
The middleware order, from the outside in: `TraceIdMiddleware` (sets or echoes `X-Trace-Id`), then CORS, then `RateLimitMiddleware` (`core/rate_limit.py`). The rate limiter uses Redis over TCP by default and switches to the Upstash REST API when both `UPSTASH_*` variables are set. All routers are mounted under `/api/v1`. `/healthz` returns 503 if the DB or Redis is down. Errors go through a shared envelope in `core/errors.py`, which carries the trace ID.

- **Auth/RBAC** (`core/security.py`): JWT bearer tokens plus a PIN verification step, with Argon2 hashing. Routes guard access with `require_roles("dispenser","pharmacist","auditor","admin")`. Every user is scoped to a clinic, and `enforce_clinic_scope` must check any access across clinics.
- **Idempotency** (`core/idempotency.py`): `IdempotencyGuard` uses Postgres advisory locks and a request-body hash, and replays stored responses (`X-Idempotent-Replay` header). Mutating endpoints should use it.
- **`/optimize`** (`routers/optimize.py`): loads the patient, guidelines, catalog and inventory batches from the DB and maps them into solver dataclasses. It then calls `solve_aware_regimen` and passes the result to `generate_counseling`, writing an `AuditLog` along the way.
- **Solver** (`solver/aware_cpsat.py`, OR-Tools CP-SAT) runs in three passes:
  1. Pass 1 picks the optimal drug and batch (AWaRe category preference, expiry/FEFO, allergies, clinical blocks).
  2. Pass 2 runs when the problem is infeasible. It extracts the minimal unsatisfiable set (MUS) through assumption literals and reports *why* no regimen fits.
  3. Pass 3 proposes safe relaxations.

  Allergy expansion is deliberately narrow (e.g. PENICILLIN maps only to penicillin-class drugs), and seed data and tests depend on this.
- **Steward agent** (`agents/steward_agent.py`): LLM counseling through Groq or Gemini. It strictly de-identifies the input (`_assert_deidentified`, PII detection raises `PiiDetectedError`), checks for prompt injection, and runs a hallucination guard that rejects any drug the solver did not allow. When no API key is set, or a guard fails, it falls back to deterministic counseling text. The voice intake (`routers/voice.py`) goes through the same agent.

### Frontend (offline-first)
- `src/lib/api.ts`: an API client with zod schemas for every response, which double as the frontend's contract with the backend.
- `src/db/dexie.ts`: the IndexedDB schema (patients, batches, guidelines, catalog, dispenses, queued sync mutations, conflicts).
- `src/lib/syncEngine.ts`: queues local mutations, pushes them, and handles 409 conflicts (`SyncConflictApiError`) through a conflict-resolution flow. It also loads the initial data. It calls sync endpoints that the backend routers don't define yet.
- `src/lib/localRules.ts`: a client-side copy of the AWaRe rules (viral syndromes, allergy expansion) for offline use. Keep it in step with `aware_cpsat.py`.
- `src/app/sw.ts`: the Serwist service worker. Its output is `public/sw.js`, and `/~offline` is the fallback page.
- Design system (macOS / Liquid Glass): use the `glass`, `glass-bar`, `mac-card` and `segmented` utilities from `src/app/globals.css` rather than hand-rolled `border bg-white` cards.
  - **Colour tokens:** use the semantic classes, not raw hex (`text-ink`/`ink-2`/`ink-3`, `bg-canvas`/`surface`/`fill`, `border-line`/`line-strong`, `brand`/`brand-ink`/`brand-soft`, and `success|warn|danger|info|lock` with `-ink`/`-soft`). Each token has contrast-checked values for four themes, selected by `<html data-theme>`:
    - `light` (the default)
    - `aurora` (light with mixed colour washes)
    - `dark`
    - `ocean` (dark with mixed glows)
    - `system` resolves to `light` or `dark`
  - **Theme picker and storage:** the picker is `components/ThemeToggle.tsx`. The choice is saved in localStorage `awaregrid_theme` and applied before first paint by `THEME_BOOT` in `layout.tsx`.
  - **Exceptions:** fills that must stay dark in every theme, data-viz ramps, the map and the brand art keep fixed hex values.
  - **Overflow:** keep `overflow-x: clip` (not `hidden`) on html and body, or the sticky header breaks.
  - **Logo:** `LogoMark` is an ICU-monitor ECG sweep (PQRST at 72 bpm). It is CSS-animated and static under reduced motion. Base type is enlarged (`html` 16.5px plus a custom `--text-*` scale), and the Apple system font comes first. The full nav shows from `xl`; nav icons only from `2xl`.
- `src/lib/i18n.ts` + `LanguageToggle`: all UI strings go through `useI18n` translation keys.
- **Shastho Sathi.** The UI is `components/FloatingAssistant.tsx`. Its knowledge base is `lib/assistantGuide.ts` (`answerSathi`, bilingual intents, which must be TTS-friendly plain sentences). Voice is handled by `lib/sathiVoice.ts`:
  - **Listening:** the browser `SpeechRecognition` in `bn-BD` or `en-US`, falling back to `POST /api/v1/sathi/transcribe`.
  - **Speaking:** `POST /api/v1/sathi/speak` (Gemini TTS `gemini-3.8-flash-tts`, voice Puck, REST v1beta), streamed sentence by sentence and cached on both server and client, with a fallback to a same-language device voice.
  - **Orb:** `brand/AssistantOrb.tsx` plus the `.sathi-orb*` CSS. Its glow follows `--sathi-level`.
  - **Keys:** Gemini keys are `GEMINI_API_KEY` plus the optional `GEMINI_API_KEYS` pool (`settings.gemini_key_pool`). Sathi rotates keys on 429/403. `conftest.py` blanks both, so tests never call real AI.
- `src/lib/*.js` and `src/db/dexie.js` are compiled CommonJS copies of the `.ts` files. Edit the `.ts` sources.
