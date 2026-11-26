<div align="center">

# ShasthoGrid · স্বাস্থ্যগ্রিড

### Provably safe care — from the pharmacy counter to the ICU bed.

Antibiotic stewardship and critical-care allocation for Bangladesh's frontline health system,<br>
on one dependable, explainable, offline-capable platform.

[![Live demo](https://img.shields.io/badge/Live_demo-shasthogrid.vercel.app-0F766E?style=for-the-badge)](https://shasthogrid.vercel.app)
[![Scroll story](https://img.shields.io/badge/Scroll_story-%2Fstory-0369A1?style=for-the-badge)](https://shasthogrid.vercel.app/story)

![Track](https://img.shields.io/badge/Track-World_Problem_Solver-5EEAD4)
![A02](https://img.shields.io/badge/A02-Constraint--based_decision_making-38BDF8)
![A05](https://img.shields.io/badge/A05-Concurrency_%26_transactions-A78BFA)
![Tests](https://img.shields.io/badge/backend_tests-174_passing-16A34A)
![Accessibility](https://img.shields.io/badge/axe_WCAG_2.2_AA-0_violations-16A34A)
![Languages](https://img.shields.io/badge/UI-English_%7C_Bangla-F59E0B)

**Code-ArenaX · Hack the Vibe 2026** · World Problem Solver Track · Advanced Challenges **A02** + **A05** · formerly *AWaReGrid*

<img src="docs/screenshots/landing.jpg" alt="ShasthoGrid landing page" width="100%">

</div>

---

## Contents

- [Why ShasthoGrid](#why-shasthogrid)
- [Evaluate it in 5 minutes](#evaluate-it-in-5-minutes)
- [Screenshots](#screenshots)
- [Features](#features)
- [Advanced Challenge A02 — constraint-based decision making](#advanced-challenge-a02--constraint-based-decision-making)
- [Advanced Challenge A05 — concurrency and transaction management](#advanced-challenge-a05--concurrency-and-transaction-management)
- [Architecture](#architecture)
- [Main workflows](#main-workflows)
- [Tech stack](#tech-stack)
- [Run it locally](#run-it-locally)
- [Deployment](#deployment)
- [Testing and evidence](#testing-and-evidence)
- [Edge cases](#edge-cases)
- [Security, privacy and AI safety](#security-privacy-and-ai-safety)
- [Known limitations and incomplete features](#known-limitations-and-incomplete-features)
- [Repository map](#repository-map)

---

## Why ShasthoGrid

Two crises meet in Bangladesh's frontline care:

| | The problem | Evidence |
|---|---|---|
| 💊 | **Antibiotics without prescriptions** fuel antimicrobial resistance. | 92.4% of surveyed pharmacy staff dispensed antibiotics without a prescription (PMC12778233). WHO's AWaRe target: **≥ 60%** of use from the *Access* group. |
| 🏥 | **Critically ill patients are bounced between hospitals** while ICU beds sit idle for lack of staff. | ~50% of public ICU beds reported idle for lack of staff (New Age, Apr 2026); 74.5% of maternal and perinatal deaths in an LMIC cohort involved 2+ referrals (J Glob Health 2026). |
| 📡 | **No live capacity data.** DGHS publishes no live feed of ICU beds or blood, so dispatchers phone around — and the same last bed can be promised twice. | |

**ShasthoGrid solves both with one engine — provable constraint solving — and one rule: a clinician always makes the final decision.**

- At the **clinic counter**, RxSolve picks the safest *Access* antibiotic that is actually on the shelf, refuses antibiotics for mild viral illness, routes Watch/Reserve drugs to a pharmacist, and dispenses the earliest-expiring stock first — even offline.
- In an **emergency**, CareMatch finds a hospital with a staffed ICU bed, a ventilator and compatible blood within the golden hour. When none can, ConflictProof explains exactly *why* and proposes safe repairs. LockStep then books bed, ventilator and blood atomically, so the last bed can never be given out twice.

---

## Evaluate it in 5 minutes

> Everything below runs on the live deployment — no setup. The login page has **one-click demo role cards**; all accounts and data are synthetic.

| # | Do this | What you should see | Proves |
|---|---|---|---|
| 1 | Open **[shasthogrid.vercel.app/login](https://shasthogrid.vercel.app/login)** and click the **Dispatcher** (or Admin) card. | You're signed in and land on the right workspace for the role. | RBAC |
| 2 | Go to **`/dispatch`**, pick the **Farmgate** preset (obstetric bleed, O−) and run CareMatch. | NEWS2 **15 · Critical**, then **ConflictProof**: two exact clashing rule sets and a solver-verified split dispatch — ICU at BMU + O− blood couriered from DMCH. | **A02** |
| 3 | Approve the repair and lock it. | A **LockStep hold** on bed, ventilator and blood, with a 10-minute timer and an idempotency key. | **A05** |
| 4 | Open **`/race-lab`** and fire 25 simultaneous requests. | **1 × 201, 24 × 409, 0 double bookings**, with timing telemetry and a replay inspector. | **A05** |
| 5 | Sign in as **Hospital admin** and open **`/facility`**. | The incoming hold appears; confirm it in one tap. Counts show their source (Demo / Staff / Feed) and age. | A05 |
| 6 | Sign in as **Dispenser** → **`/dashboard/triage`**. | RxSolve recommends an Access-first regimen from live stock, or explains why none fits. | **A02** |
| 7 | Open **[`/story`](https://shasthogrid.vercel.app/story)** and scroll. | The whole Farmgate case told as a scroll-driven story over the live care map. | — |

---

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/dispatch-repairs.jpg" alt="ConflictProof"><br><b>ConflictProof (A02)</b> — the exact clashing rule sets and solver-verified repairs.</td>
    <td width="50%"><img src="docs/screenshots/racelab.jpg" alt="RaceLab"><br><b>RaceLab (A05)</b> — 25 simultaneous bookings, 1 winner, 24 rejected, 0 double bookings.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/dispatch-lockstep-hold.jpg" alt="LockStep hold"><br><b>LockStep (A05)</b> — bed + ventilator + blood held atomically, with timer and idempotency key.</td>
    <td><img src="docs/screenshots/facility-desk.jpg" alt="FacilityDesk"><br><b>FacilityDesk</b> — hospitals keep counts live and confirm incoming holds.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/dispatch-conflictproof.jpg" alt="CareMatch dispatch"><br><b>CareMatch</b> — vitals or a Bangla/English note → NEWS2 → CP-SAT match on a live map.</td>
    <td><img src="docs/screenshots/rxsolve.jpg" alt="RxSolve"><br><b>RxSolve (A02)</b> — CP-SAT antibiotic regimen optimizer.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/insights.jpg" alt="StewardLens"><br><b>StewardLens</b> — ICU pressure, unstaffed beds, blood scarcity, hold outcomes.</td>
    <td><img src="docs/screenshots/freshstock.jpg" alt="FreshStock"><br><b>FreshStock</b> — FEFO inventory: earliest-expiring lot first.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/syncsafe.jpg" alt="SyncSafe"><br><b>SyncSafe</b> — offline queue with a 409 conflict workbench, never silent overwrites.</td>
    <td><img src="docs/screenshots/careradar.jpg" alt="CareRadar"><br><b>CareRadar</b> — 3D map of nearby hospitals, pharmacies and blood banks with routing.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/sathi.jpg" alt="Shastho Sathi"><br><b>Shastho Sathi</b> — bilingual guide with voice input and spoken answers.</td>
    <td><img src="docs/screenshots/theme-ocean.jpg" alt="Ocean theme"><br><b>Themes</b> — Light, Aurora, Ocean and Night, all contrast-checked; English and বাংলা.</td>
  </tr>
</table>

### The Farmgate case as a scroll story (`/story`)

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/story-hero.jpg" alt="Story hero"><br>1 · “No single hospital could say yes.”</td>
    <td width="33%"><img src="docs/screenshots/story-repair.jpg" alt="Story repair"><br>2 · The safe repair, pinned to real map points.</td>
    <td width="33%"><img src="docs/screenshots/story-lockstep.jpg" alt="Story LockStep"><br>3 · The LockStep hold counts down.</td>
  </tr>
</table>

---

## Features

| Feature | What it does | Challenge |
|---|---|---|
| **RxSolve** | CP-SAT antibiotic optimizer. Access-first; weighs allergy, pregnancy, renal function, age and live FEFO stock together; refuses antibiotics for mild viral illness. | **A02** |
| **CareMatch** | CP-SAT hospital matcher: ICU, ventilator, specialty, ABO/Rh-compatible blood, public-only and ETA limits. Ranks stale data lower. | **A02** |
| **ConflictProof** | When nothing fits, returns *all* exact minimal conflict sets (MUS) and re-solved repairs such as a split dispatch. Clinical-safety constraints are never relaxed. | **A02** |
| **LockStep** | Atomic holds on bed, ventilator and blood: row locks in one global order, DB CHECK guards, idempotency keys, hold TTL and an expiry sweeper. | **A05** |
| **RaceLab** | Live proof: up to 25 simultaneous requests compete for one sandbox ICU bed — exactly one wins, zero double bookings. | **A05** |
| **FacilityDesk** | Hospitals and blood banks keep counts live by hand or through a scoped, SHA-256-hashed API-key feed; confirm incoming patients in one tap. | **A05** |
| **PulseScore** | NEWS2 (RCP 2017, scales 1 and 2) acuity and the full 8×8 ABO/Rh compatibility matrix. | — |
| **Shastho Copilot** | Bangla, English and Banglish paramedic notes → structured vitals → CareMatch. PII redacted, injection screened; the AI cannot invent numbers or relax safety flags. | — |
| **FreshStock / SyncSafe** | FEFO dispensary with Watch/Reserve approval; offline Dexie queue; HTTP 409 conflict workbench (no unsafe last-write-wins). | Bonus |
| **StewardLens** | WHO ≥ 60% Access KPI plus critical-care insights: ICU occupancy and unstaffed beds, blood scarcity and expiry, hold outcomes, data freshness, de-identified NDJSON export. | — |
| **CareRadar** | 3D satellite and street map (`/radar`) of nearby hospitals, pharmacies and blood banks with OSRM routing and travel times. | — |
| **Shastho Sathi** | In-app bilingual guide that knows every feature; voice input and spoken answers (Gemini TTS when configured, device voice otherwise). | — |
| **Farmgate story** | `/story`: a pinned, scroll-driven walkthrough of the emergency case over the live care map. | — |

> SyncSafe (offline sync) is a bonus capability and is deliberately **not** declared as a third challenge, so no work is counted twice.

---

## Advanced Challenge A02 — constraint-based decision making

All three A02 features use **Google OR-Tools CP-SAT**. Recommendations are deterministic and explainable: a match always comes with the rules it satisfies, and an infeasible request always comes with the exact rules that clash.

**CareMatch (hospital allocation)**
- Each facility is a Boolean decision. Every clinical requirement is a hard constraint guarded by an **assumption literal** — `C_ICU`, `C_VENT`, `C_SPEC`, `C_BLOOD`, `C_PUBLIC`, `C_ETA`.
- The objective minimises a weighted cost: ETA, ICU load, private-tier preference, blood substitution and O− spend. Counts older than 6 hours are flagged **stale**, penalised, and reported back.
- The solver is a pure function over facility snapshots (no DB or network access) and runs off the event loop. The Farmgate case solves in about **46 ms**.

**ConflictProof (explaining infeasibility)**
- When no hospital fits, a sufficient-assumptions core is extracted (presolve off, one worker, no objective), then **all minimal conflict sets** are enumerated exactly. Minimality is unit-tested.
- *Farmgate* (obstetric emergency, NEWS2 15, public ICU + ventilator + 2× O− within 15 min) yields two minimal sets: `[ICU, BLOOD, PUBLIC, ETA]` and `[VENT, BLOOD, PUBLIC, ETA]`.
- **Repairs are re-solved before they are offered**: split-resource co-dispatch (a two-node CP-SAT model in which the blood courier must also arrive in time), relax public-only, relax ETA. Verified repair: **ICU at BMU (7.7 min) + O− blood couriered from DMCH (4.0 min)**.
- **Safety invariant:** the clinical groups `C_ICU`, `C_VENT`, `C_SPEC` and `C_BLOOD` can never appear in a repair's relaxed list.

**RxSolve (antibiotic regimen), three passes**
1. Optimal drug and batch: AWaRe preference (Access first), earliest expiry (FEFO), allergies, pregnancy, renal function, age, live stock.
2. Only when infeasible: extract the minimal unsatisfiable set through assumption literals and report why no regimen fits.
3. Propose safe relaxations. Allergy expansion is deliberately narrow (a penicillin allergy excludes penicillin-class drugs).

---

## Advanced Challenge A05 — concurrency and transaction management

Goal: the last ICU bed and the last units of O− blood can never be promised to two patients; retries are safe; no combination of requests can deadlock.

**LockStep**
- `POST /api/v1/reservations` holds **bed + ventilator + blood in one transaction**, re-checking availability under the locks.
- **Global lock order:** `reservations → hospital_resources → blood_inventories`, each sorted by id — opposing split dispatches can never deadlock.
- **Database backstop:** CHECK constraints enforce `physical ≥ staffed ≥ available ≥ 0`; a blood shortage rolls the bed back in the same transaction.
- **Idempotency:** the `Idempotency-Key` header is required. A PostgreSQL advisory lock serialises same-key requests; a replay returns the stored response with `X-Idempotent-Replay: true`; a changed payload with the same key gets `409 IDEMPOTENCY_KEY_CONFLICT`.
- **Lifecycle:** `HELD → CONFIRMED → EN_ROUTE → ADMITTED`, plus `CANCELLED` (restores stock) and `EXPIRED`. Holds last 10 minutes; a background sweeper releases expired holds every 30 s using `FOR UPDATE SKIP LOCKED`.
- **Feed safety:** hospital feed pushes take the same locks in the same order and subtract pending holds only *after* the locks are held; out-of-order reports are skipped.

**RaceLab**
- An isolated, inactive sandbox facility with one ICU bed; `POST /racelab/run` fires N independent transactions at it simultaneously.
- Tested result: **25 requests → 1 × 201 Created, 24 × 409, 0 beds left, exactly 1 hold**, stable over repeated runs. The sandbox may not reserve blood, and reset returns stock through the normal release path.

---

## Architecture

```mermaid
flowchart LR
  subgraph Client["Next.js 16 PWA · React 19 · Serwist · Dexie  (Vercel)"]
    UI["Dispatch · RaceLab · FacilityDesk · StewardLens · RxSolve · /story"]
    Q["Offline queue + 409 workbench"]
  end
  subgraph API["FastAPI · Python 3.12  (Railway container)"]
    MW["Trace-ID → CORS → Rate limit (trusted-proxy aware) → JWT + RBAC"]
    CM["CareMatch / ConflictProof (CP-SAT, pure)"]
    RX["RxSolve (CP-SAT 3-pass)"]
    LS["LockStep (row locks, idempotency, sweeper)"]
    FD["Feed ingestion (scoped, hashed keys)"]
    AI["Copilot / Steward / Sathi (Groq → Gemini → deterministic)"]
  end
  HIS["Hospital HIS / blood-bank LIS"] -- X-Facility-Key --> FD
  UI -- JWT + Idempotency-Key --> MW
  MW --> CM & RX & LS & AI
  LS & FD & CM & RX --> PG[("PostgreSQL 16")]
  MW --> R[("Redis 7 / Upstash")]
```

- **Request pipeline:** trace ID → CORS → rate limiting → auth. Errors share one envelope that carries the trace ID.
- **Authorisation:** JWT plus a PIN step; RBAC across 7 roles; clinic scope for stewardship and facility scope for officers (BOLA-safe). Denied attempts are audited.
- **Offline-first:** the PWA caches the app shell and queues mutations in IndexedDB; on reconnect, conflicts open a side-by-side review instead of overwriting.

---

## Main workflows

**Emergency lane — critical care**

`Intake` (vitals or a Bangla/English note) → `PulseScore` (NEWS2) → `CareMatch` (CP-SAT) → `ConflictProof` (if impossible: why + safe repairs) → **clinician approves** → `LockStep` (atomic 10-min hold) → `FacilityDesk` (confirmed → en route → admitted)

**Clinic lane — antibiotic stewardship**

`Patient & syndrome` (allergies, pregnancy, kidney) → `RxSolve` (safest in-stock Access regimen) → `Pharmacist gate` (Watch/Reserve) → `FreshStock` (FEFO) → `SyncSafe` (offline, safe merge) → `StewardLens` (WHO ≥ 60% Access KPI)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.4 (App Router), React 19.3, TypeScript 5, Tailwind CSS 4.3, Framer Motion, Zod 4 (typed API contract) |
| Offline / PWA | Serwist 9.6 service worker, Dexie 4.4 (IndexedDB) |
| Maps | MapLibre GL 4.7, Leaflet 1.9, OpenStreetMap, OSRM routing (optional, Haversine fallback) |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic 2, SQLAlchemy 2 (async) + asyncpg, Alembic |
| Optimization | Google OR-Tools CP-SAT 9.14+ (assumption literals, MUS extraction) |
| Data | PostgreSQL 16 (row locks, CHECKs, advisory locks, audit log); Redis 7 or Upstash REST (rate limiting) |
| Security | JWT + PIN, Argon2, RBAC, trusted-proxy-aware rate limiting, trace IDs |
| AI (guarded, optional) | Groq and Google Gemini with a deterministic fallback; Gemini TTS for the Sathi voice |
| Testing / CI | pytest (174 tests), Playwright + axe, GitHub Actions |
| Hosting | Vercel (PWA), Railway (API + PostgreSQL + Redis); Docker Compose locally; Render blueprint as an alternative |
| Video | Remotion 4 (`video/` — the programmatic presentation film) |

---

## Run it locally

**Prerequisites:** Docker, Python 3.12 with [uv](https://docs.astral.sh/uv/), Node.js 20+.

```bash
git clone https://github.com/lamu143/Shastho-Grid.git && cd Shastho-Grid
docker compose up -d postgres redis          # Postgres :5432, Redis :6379

cd backend
cp .env.example .env                         # fill in your own values — never commit .env
uv sync --group dev
uv run python -m app.db.seed                 # creates tables + synthetic demo data
uv run uvicorn app.main:app --reload --port 8000

cd ../frontend
npm install
npm run dev                                  # http://localhost:3000 (service worker off in dev)
```

**Everything in Docker:** `docker compose up --build`, then `docker compose exec backend python -m app.db.seed`.

### Demo accounts

The login page offers **one-click role cards** that sign in with synthetic seeded accounts (offline PIN step included):

| Role | Account | Lands on |
|---|---|---|
| Dispatcher | `dispatcher@shasthogrid.org` | `/dispatch` |
| Hospital admin (BMU) | `bmu.admin@shasthogrid.org` | `/facility` |
| Blood-bank officer (DMCH) | `dmch.blood@shasthogrid.org` | `/facility` |
| Pharmacist | `pharmacist@awaregrid.org` | `/dashboard` |
| Dispenser | `dispenser@awaregrid.org` | `/dashboard` |
| Auditor | `auditor@awaregrid.org` | `/dashboard` |
| Admin | `admin@awaregrid.org` | `/dashboard` |

> These are synthetic demo accounts for evaluation only. The seed refuses to run when `ENVIRONMENT=production`.

---

## Deployment

The live demo runs as:

| Part | Platform | Notes |
|---|---|---|
| PWA | **Vercel**, from `frontend/` | `NEXT_PUBLIC_API_URL` is set at build time. |
| API | **Railway**, from `backend/Dockerfile` | `start.sh` runs the idempotent seed when `SEED_ON_START=true`, then Uvicorn on `$PORT` (one worker, bounded OR-Tools memory). Health: `/healthz` → `{"status":"ok","db":"ok","redis":"ok"}`. |
| Database / cache | Railway PostgreSQL + Redis | Wired through platform reference variables. |

Configuration lives only in platform secret stores: `DATABASE_URL`, `REDIS_URL`, `ENVIRONMENT`, `JWT_SECRET_KEY` (≥ 32 chars; the dev placeholder is refused outside dev/test), `CORS_ORIGINS`, `TRUSTED_PROXIES`, and optionally `GEMINI_API_KEYS` / `GROQ_API_KEY`.

**Alternative:** [`render.yaml`](render.yaml) blueprint for Render, with Neon Postgres and Upstash Redis. Operations runbook (Redis fallback, backups, rollback, production gates): [`docs/operations.md`](docs/operations.md). Hospital feed integration guide: [`docs/hospital-feed.md`](docs/hospital-feed.md).

---

## Testing and evidence

| Suite | Coverage | Latest result |
|---|---|---|
| **Backend** — pytest, 13 files | CP-SAT solvers and MUS minimality · NEWS2 boundaries · blood compatibility · the 25-way race · idempotent replay · deadlock freedom · hold lifecycle and sweeper · facility-scope (BOLA) denials · feed keys and staleness · Copilot and Sathi guards · security-hardening regressions | **174 / 174 passed**, on a fresh database with CI settings |
| **Frontend** | TypeScript type-check, ESLint, production build | Passing |
| **End-to-end** — Playwright, 6 spec files | Main journeys per role, with axe accessibility checks | See limitations |
| **Accessibility** | axe WCAG 2.0 / 2.1 / 2.2 A + AA on the landing page and `/story`, including reduced-motion mode | **0 violations** |
| **CI** | GitHub Actions on every push: backend on PostgreSQL 16 + Redis 7; frontend type-check, lint, build | Configured |
| **Live smoke test** | Real browser sign-in on the deployed site; every API call returned 200 | Passed |

```bash
# backend — uses a separate DB that the suite drops and recreates (CREATE DATABASE awaregrid_test once)
cd backend
DATABASE_URL=postgresql+asyncpg://awaregrid:awaregrid@localhost:5432/awaregrid_test uv run --group dev pytest -q

# frontend
cd frontend
npx tsc --noEmit && npm run lint && npm run build
npx playwright test                          # needs the backend on :8000
```

---

## Edge cases

| Edge case | What ShasthoGrid does |
|---|---|
| No single hospital can take the patient | ConflictProof returns the exact clashing rule sets and a solver-verified split dispatch; safety rules are never relaxed. |
| 25 simultaneous bookings for the last bed | Exactly one succeeds; 24 get 409; zero double bookings. |
| Opposing split dispatches | Global lock order prevents deadlock (tested 10× concurrently). |
| Blood runs out mid-booking | The whole transaction rolls back; the bed is released too. |
| A client retries a booking | Same Idempotency-Key → stored response replayed; changed payload → 409. |
| A hold is never confirmed | It expires after 10 minutes and the sweeper returns the stock. |
| Hospital data is stale | Counts older than 6 h are flagged STALE and ranked lower; the dispatcher is told to phone first. |
| An officer edits another facility | 403 `FACILITY_SCOPE_VIOLATION`, and the attempt is audited. |
| Two offline devices edit one record | SyncSafe refuses a silent overwrite and opens a side-by-side 409 workbench. |
| The AI invents a vital sign or a drug | Rejected: numbers must appear in the note, drugs must come from the solver, safety flags may only get stricter. |
| A note contains personal data or a prompt injection | PII is redacted before any model call; injection attempts are blocked. |
| Allergy plus pregnancy | RxSolve excludes contraindicated drugs; if nothing safe is in stock, it explains why and suggests referral. |
| Redis is down | Requests continue with an `X-RateLimit-Status: degraded` header, or sensitive endpoints fail closed with 503 when configured. |
| No AI key is configured | Deterministic parsing and templated text keep the app fully working. |

---

## Security, privacy and AI safety

- **Secrets** live only in platform secret stores and git-ignored `.env` files; nothing secret is committed.
- **Abuse limits:** a stricter per-IP bucket on login, PIN and the feed; `X-Forwarded-For` is honoured only from configured trusted proxies.
- **Feed keys** are SHA-256 hashed, shown once, revocable and scoped to beds or blood.
- **AI guardrails:** de-identification before any model call → prompt-injection screen → hallucination guard (solver-only drugs, vitals must appear in the note, safety flags only stricter) → deterministic fallback. Every AI output requires human approval.
- **Data honesty:** seeded hospitals are real Dhaka institutions, but their bed and blood counts are **simulated demo data** until a facility connects. Every count shows its source (`SEED_DEMO`, `STAFF`, `FEED`) and when it was reported. The seed deliberately makes the Farmgate case infeasible at any single hospital — that is how ConflictProof is demonstrated.

---

## Known limitations and incomplete features

**Limitations**
- **Simulated capacity data.** DGHS has no public live feed; counts are simulated until facilities connect through FacilityDesk or the feed API.
- **Demo deployment.** The live site runs in `demo` mode with synthetic accounts, patients and stock, not connected to real hospital systems.
- **AI providers are not configured on the live API**, so Copilot uses its deterministic Bangla/English parser and Sathi speaks with the device voice. Gemini extraction and natural Bangla TTS work when keys are added.
- **Voice input** depends on browser speech-recognition support and microphone permission; tested in headless Chrome, not on every device.
- **Travel times** use a Haversine × 1.35 estimate unless OSRM routing is enabled.
- **Single API worker** by design (OR-Tools memory); horizontal scaling is not load-tested beyond the in-app race.
- **Clinical validation:** ShasthoGrid is decision support. It follows WHO AWaRe and RCP NEWS2 but has not been clinically validated; licensed clinicians make every final decision.

**Incomplete**
- [ ] Audit explorer UI (the audit log is recorded; there is no dedicated explorer screen yet)
- [ ] Settings page for dependency health and outage simulation (health is available via `/healthz` and the admin telemetry API)
- [ ] RxSolve's minimal conflicts in the shared ConflictProof panel component
- [ ] Automated axe run across *every* new page (landing and `/story` pass with 0 violations)
- [ ] Full Playwright re-run after the final UI redesign

---

## Repository map

| Path | What's there |
|---|---|
| `backend/app/solver/` | RxSolve CP-SAT model (3-pass) |
| `backend/app/services/carematch.py` | CareMatch + ConflictProof (pure CP-SAT functions) |
| `backend/app/services/lockstep.py` · `backend/app/routers/lockstep.py` | LockStep holds, lifecycle, sweeper, RaceLab |
| `backend/app/routers/feed.py` | Hospital capacity feed with scoped keys |
| `backend/app/agents/` | Guarded AI: steward agent, Copilot, Sathi voice |
| `backend/tests/` | 174 backend tests |
| `frontend/src/app/` | Routes: `/dispatch`, `/race-lab`, `/facility`, `/insights`, `/radar`, `/story`, `/dashboard/*`, `/admin` |
| `frontend/src/lib/api.ts` | Typed API client (Zod schemas = the frontend contract) |
| `frontend/tests/e2e/` | Playwright end-to-end + axe |
| `video/` | Remotion source of the presentation film and its narration script |
| `docs/` | Operations runbook, hospital-feed guide, screenshots |

---

<div align="center">

**ShasthoGrid** — provably safe care, from the pharmacy counter to the ICU bed.<br>
Built for **Code-ArenaX · Hack the Vibe 2026** · World Problem Solver Track · A02 + A05

</div>
