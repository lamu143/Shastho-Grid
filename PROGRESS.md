# AWaReGrid — Implementation & Verification Progress

*"Provably Safe WHO AWaRe Antibiotic Stewardship, Even Offline"*

## Milestones Status

| # | Milestone | Scope | Dependencies | Status |
|---|---|---|---|---|
| **M1** | Backend Core, Schema, Seed & Auth/RBAC | F1–F5 (`docker-compose.yml`, `.gitignore`, 11-table schema, idempotent seed, Argon2id/HS256 auth, admin, rate limiter, `/healthz`) | None | **DONE** (12/12 `test_auth_rbac.py` passing) |
| **M2** | CP-SAT Solver & De-Identified AI Steward | F6–F8 (`aware_cpsat.py` Pass 1–3, `steward_agent.py`, `/api/v1/optimize`, `/api/v1/voice/intake`) | M1 | **DONE** (31/31 `test_cpsat_solver.py` + `test_steward_agent.py` passing) |
| **M3** | Dispensary Workflow, Sync Engine & Analytics | F9–F11 (`dispense_service.py`, `sync_service.py`, `analytics_service.py`, domain routers, `test_dispense_sync.py`) | M1, M2 | **IN PROGRESS** |
| **M4** | Frontend PWA Foundation, Dexie & Bilingual Shell | F12–F14 (Next.js 16 + Serwist PWA, `/~offline`, Dexie `awaregrid_offline_v1`, `localRules`, `syncEngine`, `api`, `i18n`, WCAG AA shell) | None | **DONE** (`tsc`, `eslint`, `next build --webpack` passing) |
| **M5** | Bilingual Multi-Route UI, Conflict Workbench & Docs | F15–F17 (all 10 app routes, 409 Conflict Workbench, `README.md`, `PROGRESS.md`, `render.yaml`) | M4 | **IMPLEMENTED** (awaiting final gate verification) |
| **E2E** | Opaque-Box E2E Test Suite (Tiers 1–4) | F18 (`TEST_INFRA.md`, Playwright + Axe suite: 99 tests across `offline_conflict.spec.ts` & `tier1`–`tier4`) | None | **DONE** (`TEST_READY.md` published) |
| **M6** | Final Integration, E2E Pass & Tier 5 Hardening | F19 (Full-stack 99-test Playwright + Axe pass + all backend pytests + Tier 5 adversarial hardening) | M3, M5, E2E | **PLANNED** |

---

## Feature Inventory (`F1`–`F19`)

| # | Feature | Milestone | Status |
|---|---|---|---|
| F1 | Docker & Infra Config (`docker-compose.yml`, `backend/Dockerfile`, `pyproject.toml`, `.env.example`, `.gitignore`) | M1 | DONE |
| F2 | 11-Table PostgreSQL 16 Schema (`clinics`, `users`, `patients`, `aware_guidelines`, `antibiotic_catalog`, `inventory_batches`, `dispenses`, `sync_mutations_log`, `conflict_resolution_events`, `idempotency_keys`, `audit_logs`) | M1 | DONE |
| F3 | Idempotent Seed Data (2 clinics, 5 role accounts, 15 syndromes, 20 antibiotics, FEFO lots, ~52% Ashulia baseline) | M1 | DONE |
| F4 | Auth, Argon2id + HS256 JWT, 4 RBAC Roles & `clinic_id` Tenant Isolation | M1 | DONE |
| F5 | `Idempotency-Key` Deduplication, Upstash/Redis Rate Limiting & Standard Error Envelope | M1 | DONE |
| F6 | Google OR-Tools CP-SAT Pass 1 Optimizer (`ACCESS=1 < WATCH=15 < RESERVE=120`) | M2 | DONE |
| F7 | CP-SAT Pass 2 MUS (`cp_model_presolve=False`, `num_workers=1`, no objective) & Pass 3 Safe Relaxations | M2 | DONE |
| F8 | De-Identified AI Steward & Bangla/EN Voice Intake (Groq -> Gemini `gemini-3.5-flash-lite` -> `deterministic-local-template`) | M2 | DONE |
| F9 | Atomic Dispense State Machine (`DRAFT -> PENDING_APPROVAL -> DISPENSED / REJECTED / VOIDED`) | M3 | IN PROGRESS |
| F10 | Patients, FEFO Inventory & Stewardship Analytics (`>=60%` WHO Target) | M3 | IN PROGRESS |
| F11 | Conflict-Safe Sync Engine (Backend HTTP 409 + CP-SAT Re-Evaluation) | M3 | IN PROGRESS |
| F12 | Next.js 16 + `@serwist/next` PWA Shell (`/~offline`, `reloadOnOnline: false`) | M4 | DONE |
| F13 | Dexie.js IndexedDB (`awaregrid_offline_v1`), `localRules.ts` & `syncEngine.ts` | M4 | DONE |
| F14 | Tailwind v4 Design Tokens, Bilingual Shell (`EN / বাংলা`), Disclaimer Banner & WCAG AA Badges | M4 | DONE |
| F15 | Auth, Dashboard, Triage & FEFO Inventory Routes (`/`, `/login`, `/dashboard`, `/dashboard/triage`, `/dashboard/inventory`) | M5 | IMPLEMENTED |
| F16 | 409 Conflict Workbench, Analytics, Profile, Admin & Settings Routes (`/dashboard/sync`, `/dashboard/analytics`, `/dashboard/profile`, `/admin`, `/dashboard/settings`) | M5 | IMPLEMENTED |
| F17 | Root Docs & Render Blueprint (`README.md`, `PROGRESS.md`, `render.yaml`) | M5 | IMPLEMENTED |
| F18 | Opaque-Box Playwright + Axe E2E Suite (99 Tests across `offline_conflict` + Tiers 1–4) | E2E | DONE |
| F19 | Full-Stack E2E Pass & Tier 5 Adversarial White-Box Hardening | M6 | PLANNED |

---

## Verification Commands

```bash
# Backend unit & integration tests (inside backend/)
cd backend
uv run pytest -v

# Frontend typecheck, lint, and production Serwist PWA build (inside frontend/)
cd frontend
npx tsc --noEmit && npm run lint && npm run build

# Full-stack Playwright + Axe E2E suite (requires running PostgreSQL 16, Redis, FastAPI, and production Next.js)
cd frontend
npx playwright test
```
