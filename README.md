# ShasthoGrid · স্বাস্থ্যগ্রিড

> **Provably safe care: antibiotics, ICU beds and blood, even offline.**
>
> **Code-ArenaX Hack the Vibe 2026**, World Problem Solver Track: challenges **A02** (constraint-based decision making) and **A05** (concurrency and transaction management). Formerly *AWaReGrid*.

ShasthoGrid brings two problems from Bangladesh's frontline health system together on one dependable platform:

1. **Antibiotic stewardship at community clinics.** It recommends the safest WHO AWaRe regimen from the stock actually on the shelf, and it works offline.
2. **Critical-care dispatch in Dhaka.** It finds the best hospital for a critically ill patient, explains *why* when no single hospital can take them, and then books the bed and blood atomically so the last ICU bed is never given out twice.

Every recommendation is deterministic and explainable. Every AI step is guarded, and a clinician makes the final decision.

---

## Features

| Feature | What it does | Challenge |
|---|---|---|
| **RxSolve** | A CP-SAT antibiotic optimizer. Access-first, it weighs allergy, pregnancy, renal function, age and live FEFO stock together. | A02 |
| **CareMatch** | A CP-SAT hospital matcher covering ICU, ventilator, specialty, ABO/Rh-compatible blood, public-only and ETA limits. It ranks stale data lower. | A02 |
| **ConflictProof** | When no hospital fits, it returns the *exact* minimal conflict sets (MUS) and safe repairs, such as a split dispatch: a bed at one hospital plus blood couriered from another. Clinical-safety constraints are never relaxed. | A02 |
| **LockStep** | Atomic holds on bed, ventilator and blood with row locks in one global order, idempotency keys, a hold TTL and an expiry sweeper. | A05 |
| **RaceLab** | A live proof: up to 25 simultaneous requests compete for one sandbox ICU bed, exactly one wins, and there are zero double bookings. | A05 |
| **FacilityDesk** | Hospitals and blood banks keep their own counts live, by hand or through a scoped, hashed API-key feed. They confirm incoming patients in one tap. | A05 |
| **PulseScore** | NEWS2 (RCP 2017) acuity and the ABO/Rh compatibility matrix. | n/a |
| **Shastho Copilot** | Bangla, English and Banglish paramedic notes go to structured vitals and then a CareMatch run. PII is redacted, injection is screened, and the AI cannot invent numbers or relax safety flags. | n/a |
| **FreshStock / SyncSafe** | FEFO dispensary, offline Dexie queue, and an HTTP 409 conflict workbench (no unsafe last-write-wins). | n/a |
| **StewardLens** | WHO ≥60% Access KPI plus critical-care insights: ICU occupancy and unstaffed beds, blood scarcity and expiry, hold outcomes, data freshness, and de-identified Lakehouse NDJSON export. | n/a |
| **CareRadar** | 3D Satellite & Street map (`/radar`) for discovering nearby hospitals, pharmacies, and blood banks via live OpenStreetMap + OSRM routing with estimated travel times. | n/a |

### Where the bed and blood numbers come from

DGHS has no public live feed of ICU beds or blood stock. ShasthoGrid takes counts directly from each facility, either **staff entry** in FacilityDesk or a **system feed** (`POST /api/v1/feed/v1/capacity` with a per-facility key that is scoped to beds or blood). Every count carries its source (`SEED_DEMO`, `STAFF` or `FEED`) and the time it was reported. Dispatchers see each hospital as **Live**, **Stale** (more than 6 h old) or **Demo**. Integration guide: [`docs/hospital-feed.md`](docs/hospital-feed.md).

> **Honesty note.** The seeded hospitals are real Dhaka institutions, but their bed and blood counts are **simulated demo data** until a facility connects. The seed is designed so that the "Farmgate" obstetric emergency (ICU + ventilator + 2× O−, public, ≤15 min) is infeasible at any single hospital. That is how ConflictProof is shown.

---

## Architecture

```mermaid
flowchart LR
  subgraph Client["Next.js 16 PWA · React 19 · Serwist · Dexie"]
    UI["Dispatch · RaceLab · FacilityDesk · StewardLens · RxSolve"]
    Q["Offline queue + 409 workbench"]
  end
  subgraph API["FastAPI · Python 3.12"]
    MW["Trace-ID → CORS → Rate limit (trusted-proxy aware)"]
    CM["CareMatch / ConflictProof (CP-SAT, pure)"]
    RX["RxSolve (CP-SAT 3-pass)"]
    LS["LockStep (row locks, idempotency, sweeper)"]
    FD["Feed ingestion (scoped, hashed keys)"]
    AI["Copilot / Steward agent (Groq → Gemini → deterministic)"]
  end
  HIS["Hospital HIS / blood-bank LIS"] -- X-Facility-Key --> FD
  UI -- JWT + Idempotency-Key --> MW
  MW --> CM & RX & LS & AI
  LS & FD & CM & RX --> PG[("PostgreSQL 16")]
  MW --> R[("Redis / Upstash")]
```

- **Lock order** (deadlock-free): reservations → hospital_resources → blood_inventories, each sorted by id.
- **Authorisation:** JWT plus a PIN step; RBAC across 7 roles; clinic scope for stewardship and facility scope for officers (BOLA-safe). Denied attempts are audited.
- **Abuse limits:** a stricter per-IP limit on login and the feed. `X-Forwarded-For` is trusted only from configured proxies.
- **AI safety:**
  - De-identification before any model call.
  - A prompt-injection screen.
  - A hallucination guard: drugs must come from the solver, vitals must appear in the note, and safety flags can only become stricter.
  - A deterministic fallback when no key is set.

---

## Demo accounts (offline PIN `2026`)

| Role | Email | Password | Lands on |
|---|---|---|---|
| Dispatcher | `dispatcher@shasthogrid.org` | `Dispatcher#2026!` | `/dispatch` |
| Hospital admin (BMU) | `bmu.admin@shasthogrid.org` | `Hospital#2026!` | `/facility` |
| Blood-bank officer (DMCH) | `dmch.blood@shasthogrid.org` | `BloodBank#2026!` | `/facility` |
| Pharmacist | `pharmacist@awaregrid.org` | `Pharmacist#2026!` | `/dashboard` |
| Dispenser | `dispenser@awaregrid.org` | `Dispenser#2026!` | `/dashboard` |
| Auditor | `auditor@awaregrid.org` | `Auditor#2026!` | `/dashboard` |
| Admin | `admin@awaregrid.org` | `Admin#2026!` | `/dashboard` |

> These are synthetic development accounts. The seed refuses to run when `ENVIRONMENT=production`.

---

## Run it

### Everything in Docker

```bash
docker compose up --build        # Postgres :5432, Redis :6379, API :8000, PWA :3000
docker compose exec backend python -m app.db.seed
```

### Local development

```bash
docker compose up -d postgres redis

cd backend
cp .env.example .env
uv sync --group dev
uv run python -m app.db.seed
uv run uvicorn app.main:app --reload --port 8000

cd ../frontend
npm install
npm run dev                      # http://localhost:3000 (service worker off in dev)
```

> The repository folder name ends in a space (`AWaReGrid `), so quote paths in your shell.

### Tests

```bash
# backend: uses a separate DB that the suite drops and recreates (CREATE DATABASE awaregrid_test once)
cd backend
DATABASE_URL=postgresql+asyncpg://awaregrid:awaregrid@localhost:5432/awaregrid_test \
  uv run --group dev pytest -q

# frontend
cd frontend
npx tsc --noEmit && npm run lint && npm run build
npx playwright test              # needs the backend on :8000
```

The backend suite covers:
- the CP-SAT solvers and MUS minimality
- NEWS2 and blood compatibility
- the 25-way RaceLab race
- idempotent replay
- facility-scope (BOLA) denials
- feed keys and staleness
- Copilot guards
- the security-hardening regression tests

---

## Main routes

| Route | Who | Purpose |
|---|---|---|
| `/dispatch` | dispatcher, admin | Copilot or vitals intake, then CareMatch, map, ConflictProof repairs, and LockStep hold |
| `/radar` | all roles (public/clinical) | CareRadar 3D hospital, pharmacy, and blood-bank finder with OSRM routing |
| `/race-lab` | dispatcher, admin | Live concurrency race on the sandbox bed |
| `/facility` | hospital_admin, blood_bank_officer, admin | FacilityDesk: counts, incoming holds, feed keys |
| `/insights` | critical-care roles, auditor | StewardLens critical-care analytics |
| `/dashboard/*` | dispenser, pharmacist, auditor, admin | RxSolve triage, FEFO inventory, sync, stewardship analytics |
| `/admin` | admin | Users, clinics, guidelines, catalog, audit log |

## Main API (all under `/api/v1`)

- **Facilities:**
  - `GET /facilities`, with filters, ETA sort and freshness
  - `GET /facilities/{id}`
  - `PATCH /facilities/{id}/resources/{type}`
  - `PATCH /facilities/{id}/blood/{group}`
- **CareMatch:** `POST /carematch/optimize`, `GET /carematch/{id}`
- **LockStep:**
  - `POST /reservations` (requires `Idempotency-Key`)
  - `GET /reservations`
  - `POST /reservations/{id}/transition`
  - `POST /racelab/reset`, `POST /racelab/run`
- **Feed:**
  - `POST|GET /facilities/{id}/feed-keys`
  - `DELETE /facilities/{id}/feed-keys/{key_id}`
  - `POST /feed/v1/capacity`
- **Insights:** `GET /critical-care/insights?days=7`, `GET /critical-care/summary`
- **Copilot:** `POST /copilot/triage-assist`
- **Stewardship:** `POST /optimize`, `/patients`, `/inventory/batches`, `/dispenses`, `/sync/*`, `/analytics/stewardship`
- **Telemetry & Analytics:** `GET /admin/telemetry`, `GET /admin/telemetry/prometheus`, `GET /analytics/lakehouse-export`, `GET /analytics/teamwork-graph`
- **Health:** `GET /health` (liveness/dependency check; `docs/operations.md` covers Redis fallback, backups, and production gates)

---

## Deploy

1. **Database:** Neon Postgres. Set `DATABASE_URL`; the async driver is added automatically. Never run the demo seed against production.
2. **Redis:** Upstash. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. **API:** Render, via [`render.yaml`](render.yaml) (`--workers 1`, health check `/healthz`). Set these variables:
   - `ENVIRONMENT=production`
   - a strong `JWT_SECRET_KEY` (outside dev/test the placeholder secret is refused)
   - `CORS_ORIGINS`
   - `TRUSTED_PROXIES`, the load balancer IPs
   - optionally `GROQ_API_KEY` and `GEMINI_API_KEY`
4. **PWA:** Vercel, from `frontend/`. Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL` before building.

Public reference data and its provenance are in [`backend/data/reference/`](backend/data/reference/). Keep secrets in platform secret stores, and never commit `.env`.
