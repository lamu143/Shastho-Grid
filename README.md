# AWaReGrid

> **"Provably Safe WHO AWaRe Antibiotic Stewardship, Even Offline"**
>
> **Code-ArenaX Hack the Vibe 2026** — *World Problem Solver Track (Challenges A02 + A04)*

AWaReGrid is an offline-first clinical antibiotic stewardship Progressive Web App (PWA), deterministic **Google OR-Tools CP-SAT** regimen optimizer, and **FEFO (First-Expired, First-Out)** micro-dispensary operating system built for frontline community clinics (modeled on Ashulia Union Sub-Center and Dhamrai Community Dispensary).

---

## Key Capabilities

1. **Deterministic 3-Pass Google OR-Tools CP-SAT Regimen Optimizer**:
   - **Pass 1 (Optimization)**: Minimizes WHO AWaRe stewardship cost (`ACCESS = 1`, `WATCH = 15`, `RESERVE = 120`) + FEFO expiry priority while strictly enforcing allergy class expansions (`SULFONAMIDE -> COTRIMOXAZOLE`, `PENICILLIN -> AMOXICILLIN`, etc.), pregnancy contraindications, renal eGFR thresholds, minimum age rules, viral mild no-antibiotic rules (`ACUTE_BRONCHITIS`, `COMMON_COLD`, `VIRAL_URI`), and active FEFO stock (`qty_remaining >= 1`, `days_to_expiry > 0`).
   - **Pass 2 (Exact MUS Infeasibility Proof)**: When `INFEASIBLE`, re-solves with `cp_model_presolve=False`, `num_workers=1`, and **no objective function** to extract exact Minimal Unsatisfiable Subset (`sufficient_assumptions_for_infeasibility()`) conflict cores.
   - **Pass 3 (Safe Relaxations)**: Computes deterministic safe clinical alternatives (`SWITCH_TO_SYMPTOMATIC_CARE`, `ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL`, `REFER_UPAZILA_STOCK_TRANSFER`).
2. **Offline-First PWA & HTTP 409 Conflict Workbench (No Unsafe LWW)**:
   - Built on Next.js 16 + `@serwist/next` (`reloadOnOnline: false`, `/~offline` fallback) and Dexie.js IndexedDB (`awaregrid_offline_v1`) with client-generated UUIDv4 IDs and offline salted PBKDF2 PIN unlock (`2026`).
   - Rejects unsafe Last-Write-Wins (LWW) overwrites: version skew (`base_version != server_version`) triggers server-side CP-SAT re-evaluation on the merged state and returns **HTTP 409 (`SYNC_VERSION_CONFLICT`)** with `server_snapshot`, `client_snapshot`, and `cpsat_verdict`, resolved cleanly in the side-by-side `/dashboard/sync` Conflict Workbench.
3. **Atomic FEFO Dispensary State Machine & WHO >=60% KPI**:
   - Enforces `DRAFT -> PENDING_APPROVAL -> DISPENSED / REJECTED / VOIDED` with pharmacist/admin approval gates, atomic FEFO stock decrement, void stock restoration, and live WHO `>=60%` Access ratio telemetry (starting Ashulia at `13/25 = 52.0%` so 5 compliant Access dispenses lift it to `18/30 = 60.0%`).
4. **De-Identified AI Counseling & Bilingual Voice Intake (`EN / বাংলা`)**:
   - Strips all PII via `_assert_deidentified` before any external AI call.
   - Routes **Groq** (`openai/gpt-oss-120b` counseling, `whisper-large-v3-turbo` Bangla/English voice intake, `llama-prompt-guard-2-86m` prompt injection guard) -> **Google Gemini** (`gemini-3.5-flash-lite`) -> **`DETERMINISTIC_FALLBACK_CARDS`** (`deterministic-local-template`), gated by `_passes_hallucination_guard`.

---

## Architecture

```text
+-----------------------------------------------------------------------+
| Next.js 16 App Router PWA (frontend/)                                 |
| - 10 Bilingual Routes (EN / বাংলা) + /~offline Serwist SW Fallback    |
| - Dexie.js (awaregrid_offline_v1) + localRules.ts + syncEngine.ts     |
| - 409 Conflict Workbench, WCAG 2.1 AA Tokens, Reduced Motion Support  |
+-----------------------------------+-----------------------------------+
                                    | HTTPS / REST (/api/v1/* + JWT + Idempotency-Key)
                                    v
+-----------------------------------------------------------------------+
| FastAPI + Python 3.12 Backend (backend/)                              |
| - Auth/RBAC (Argon2id + HS256 JWT, 4 Roles, clinic_id Tenant Scope)   |
| - OR-Tools CP-SAT 3-Pass Solver (Pass 1 Optimal, Pass 2 MUS, Pass 3)  |
| - Atomic Dispense & Conflict-Safe Sync Services                       |
| - De-Identified AI Steward (Groq -> Gemini -> Deterministic Fallback) |
+-------------------+-------------------------------+-------------------+
                    |                               |
                    v                               v
     +--------------+--------------+     +----------+-----------+
     | PostgreSQL 16 (11 Tables)   |     | Redis 7 / Upstash    |
     | Neon-ready asyncpg pool     |     | Dual REST/TCP        |
     +-----------------------------+     | Rate Limiter         |
                                         +----------------------+
```

---

## Seeded Demo Accounts (PIN: `2026`)

| Role | Clinic | Email | Password | Offline PIN |
|---|---|---|---|---|
| **Dispenser** | Ashulia Union Sub-Center (`ASHULIA-01`) | `dispenser@awaregrid.org` | `Dispenser#2026!` | `2026` |
| **Pharmacist** | Ashulia Union Sub-Center (`ASHULIA-01`) | `pharmacist@awaregrid.org` | `Pharmacist#2026!` | `2026` |
| **Auditor** | Ashulia Union Sub-Center (`ASHULIA-01`) | `auditor@awaregrid.org` | `Auditor#2026!` | `2026` |
| **Admin** | Ashulia Union Sub-Center (`ASHULIA-01`) | `admin@awaregrid.org` | `Admin#2026!` | `2026` |
| **Dispenser (Isolation)** | Dhamrai Community Dispensary (`DHAMRAI-01`) | `dhamrai.dispenser@awaregrid.org` | `Dispenser#2026!` | `2026` |

> Demo credentials are for local hackathon evaluation only; change passwords and `JWT_SECRET_KEY` before any public production deployment.

---

## Local Setup

### Option 1: Docker Compose (Infrastructure / Full Stack)

```bash
# Start PostgreSQL 16 and Redis 7 (plus backend service)
docker compose up -d postgres redis backend
```

### Option 2: Manual Local Development (`uv` + `npm`)

#### 1. Backend (`backend/`)

```bash
cd backend
cp .env.example .env
uv venv --python 3.12
uv pip install -e ".[dev]"

# Initialize schema and idempotent seed data
uv run python -m app.db.seed

# Start FastAPI server
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

#### 2. Frontend (`frontend/`)

```bash
cd frontend
npm install

# Development server (Serwist SW disabled in dev)
npm run dev

# Production Serwist PWA build & verification
npx tsc --noEmit && npm run lint && npm run build
npm run start
```

---

## Application Routes

| Route | Purpose |
|---|---|
| `/` | Bilingual landing showcase, WHO AWaRe overview, and workflow CTAs |
| `/login` | Email/Password sign-in, expanded Quick-Fill Demo Role Drawer, and Offline PIN Unlock tab |
| `/dashboard` | Clinic header, live WHO `>=60%` Access KPI gauge, and dispense approval queue |
| `/dashboard/triage` | Patient create/edit, Bangla/EN voice intake, CP-SAT + offline optimization, Pass 2 MUS & Pass 3 relaxations, draft creation |
| `/dashboard/inventory` | FEFO-sorted (`expiry_date ASC`) batch table, search/filter/sort, expiring/stockout badges, pharmacist/admin batch management |
| `/dashboard/sync` | Dexie mutation queue, Sync Now trigger, and side-by-side HTTP 409 Conflict Workbench |
| `/dashboard/analytics` | Live WHO `>=60%` target progress bar, AWaRe distribution breakdown, and stock risk metrics |
| `/dashboard/profile` | Authenticated user identity, RBAC permissions matrix, online PIN check, and cached Offline PIN vault |
| `/admin` | RBAC-guarded (`admin` only) Clinics, Users, WHO Guidelines (15), Antibiotic Catalog (20), and Audit Logs (`trace_id` filter) |
| `/dashboard/settings` | `EN / বাংলা` toggle, Dexie offline cache hydration & store counts, Service Worker status, and reduced-motion info |
| `/~offline` | Precached Serwist offline fallback page |

---

## Core API Endpoints

- **Health**: `GET /healthz`
- **Auth**: `POST /api/v1/auth/login`, `POST /api/v1/auth/verify-pin`, `GET /api/v1/auth/me`
- **Admin**: `GET /api/v1/admin/clinics`, `GET/POST /api/v1/admin/users`, `GET /api/v1/admin/audit-logs`, `GET /api/v1/admin/guidelines`, `GET /api/v1/admin/catalog`
- **Clinical Optimization & Voice**: `POST /api/v1/optimize`, `POST /api/v1/voice/intake`
- **Patients & FEFO Inventory**: `GET/POST /api/v1/patients`, `GET/PATCH /api/v1/patients/{id}`, `GET/POST /api/v1/inventory/batches`, `PATCH /api/v1/inventory/batches/{id}`
- **Dispense Workflow**: `GET/POST /api/v1/dispenses`, `POST /api/v1/dispenses/{id}/{submit,approve,reject,void}`
- **Offline Sync & Conflicts**: `GET /api/v1/sync/bootstrap`, `POST /api/v1/sync/mutations`, `GET /api/v1/sync/conflicts`, `POST /api/v1/sync/conflicts/{id}/resolve`
- **Analytics**: `GET /api/v1/analytics/stewardship`

---

## Cloud Deployment (Neon + Upstash + Render + Vercel)

1. **PostgreSQL (Neon)**: Create a Neon PostgreSQL 16 database and copy its connection string into `DATABASE_URL` (the backend normalizes `postgresql://` to `postgresql+asyncpg://` automatically with `pool_pre_ping=True` and `pool_recycle=240`). Run `python -m app.db.seed` once against the target DB.
2. **Redis (Upstash)**: Create an Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (used automatically over local `REDIS_URL` when present).
3. **Backend (Render)**: Deploy using root [`render.yaml`](./render.yaml) (`rootDir: backend`, `Dockerfile`, `--workers 1`, `healthCheckPath: /healthz`). Configure `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CORS_ORIGINS`, and optional `GROQ_API_KEY` / `GEMINI_API_KEY` in the Render dashboard (`sync: false`).
4. **Frontend (Vercel)**: Import `frontend/` in Vercel (configured via `frontend/vercel.json` with `/sw.js` `Cache-Control: public, max-age=0, must-revalidate` and security headers). Set `NEXT_PUBLIC_API_URL` to your deployed Render API URL.

> Note: Keep all API keys and secrets in environment variables (`.env` locally, platform secret stores in cloud). Never commit real credentials to version control.
