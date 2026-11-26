# ShasthoGrid Roadmap

ShasthoGrid merges two blueprints into one product:

- **AWaReGrid blueprint**: WHO AWaRe antibiotic stewardship, FEFO dispensary, offline sync.
- **PranGrid blueprint**: ICU, ventilator and blood allocation, plus race-proof atomic booking.

**Declared advanced challenges: A02 (Intelligent Decisions & Optimization) + A05 (Concurrency & Transaction Management).**
Offline-first sync (SyncSafe) stays as a bonus capability and is not declared, so the rubric's rule against counting work twice is respected.

## Official feature names

| Feature | What it does | Proves |
|---|---|---|
| RxSolve | CP-SAT antibiotic regimen optimizer | A02 |
| CareMatch | ICU + ventilator + blood matching, with split-resource co-dispatch | A02 |
| ConflictProof | Exact minimal conflicting rule set (MUS) + verified repairs | A02 |
| LockStep | Ordered row locks, CHECK guards, 4-state idempotency, TTL holds | A05 |
| RaceLab | In-app 25-request concurrency stress test | A05 |
| PulseScore | NEWS2 acuity + ABO/Rh compatibility | M04 |
| FreshStock | FEFO dispensary + Watch/Reserve approval workflow | M02, M04 |
| StewardLens | Access-ratio KPI, staffed-vs-idle ICU, blood scarcity analytics | M05 |
| SyncSafe | Offline queue + safe conflict merge | Bonus |
| Shastho Copilot | Bangla/English intake that only calls solver tools; human sign-off | AI |
| CareRadar | 3D Satellite & Street map (`/radar`) with live OSM + OSRM routing | UX |

The single source of truth for these names is [frontend/src/lib/brand.ts](frontend/src/lib/brand.ts).

## Milestones

### M1: Brand, SEO and landing (done)
- [x] Name, logo (SVG + PNG icons + maskable + apple), social image
- [x] Metadata: title template, Open Graph, Twitter card, canonical, JSON-LD, robots.txt, sitemap.xml, manifest
- [x] Animated landing page (CareMatch illustration, evidence, pillars, feature grid, A02/A05 proof band), EN/BN
- [x] Header logo + feature-named navigation

### M2: Critical-care backend (PranGrid core) (done)
- [x] Tables: `facilities`, `hospital_resources` (physical ≥ staffed ≥ available ≥ 0 enforced by CHECKs), `blood_inventories`. In-place upgrade of older databases in `init_db`
- [x] Roles: `dispatcher`, `hospital_admin`, `blood_bank_officer`; `users.facility_id`; facility-scoped 403 (`FACILITY_SCOPE_VIOLATION`) with a DENIED audit entry
- [x] Seed: 7 Dhaka facilities + Dhaka Regional Health Command + 3 demo accounts; stock shaped so the Farmgate case is infeasible at any single public hospital
- [x] PulseScore: NEWS2 (Scale 1 + Scale 2) and the full 8×8 ABO/Rh matrix, all boundaries tested
- [x] Routing: Haversine × 1.35 by default; optional OSRM (`OSRM_ENABLED`) with a 2.5 s timeout, cache and fallback
- [x] API: `GET /facilities` (search, filter, sort, ETA), `GET /facilities/{id}`, `PATCH …/resources/{type}`, `PATCH …/blood/{group}` (optimistic version check), `GET /critical-care/summary`, `POST /pulsescore/news2`, `GET /pulsescore/blood-compatibility/{group}`
- [ ] Moved to M3/M4: `triage_requests`, `reservations`, `blood_dispatches`, `agent_sessions`

### M3: CareMatch + ConflictProof (A02) (done)
- [x] CP-SAT single-hospital solver with assumption literals and a cost objective (ETA, ICU load, private tier, blood substitution/O− spend); runs off the event loop (`asyncio.to_thread`)
- [x] ConflictProof: CP-SAT sufficient-assumptions core (presolve off, one worker, no objective) plus exact enumeration of *all* minimal conflict sets
- [x] Repairs, each re-solved before being offered: split-resource co-dispatch (two-node CP-SAT, courier must also arrive in the window), relax public-only, relax ETA. Clinical-safety rules are never relaxed
- [x] `triage_requests` table; `POST /carematch/optimize` (dispatcher/admin), `GET /carematch/{id}`; audited
- [x] Farmgate case → 2 minimal sets `[ICU, BLOOD, PUBLIC, ETA]` and `[VENT, BLOOD, PUBLIC, ETA]` (the blueprint listed only the first; the seed makes the ventilator conflict identical) → BMU 7.7 min + DMCH O− courier 4.0 min; minimality tested
- [ ] Later (M6 UI): show RxSolve's existing `mus_conflicts` in the same ConflictProof panel component

### M4: LockStep + RaceLab (A05) (done)
- [x] `POST /reservations`: bed + ventilator + blood in one transaction; global lock order `hospital_resources` → `blood_inventories`, each sorted by id; re-checked under lock; DB CHECKs as the backstop
- [x] Idempotency: reuses `core/idempotency.py` (advisory lock serializes same-key requests; replay with `X-Idempotent-Replay: true`; **409** `IDEMPOTENCY_KEY_CONFLICT` on a changed payload, matching the existing FreshStock convention rather than the blueprint's 422). The key is required on this endpoint; lost races are remembered too
- [x] Lifecycle HELD→CONFIRMED→EN_ROUTE→ADMITTED, plus CANCELLED (restores stock) and EXPIRED (sweeper). ADMITTED keeps the bed and consumes the blood. Role rules: hospital confirms/admits, dispatcher sets en-route, both can cancel
- [x] Lifespan sweeper every 30 s with `FOR UPDATE SKIP LOCKED`; manual `POST /reservations/sweep-expired` (admin)
- [x] RaceLab: hidden sandbox facility; `POST /racelab/reset`, `POST /racelab/run` (server-side race of N independent transactions)
- [x] Tests: 25 concurrent HTTP requests → 1×201 / 24×409 / 0 left / 1 hold; opposing split dispatches ×10 never deadlock; blood shortage rolls back the bed; replay/tamper/missing key; lifecycle roles; sweeper. Stable over 5 repeated runs
- [x] FreshStock dispenses already lock with `FOR UPDATE` and use the same idempotency guard, so they were left as they are

### M5: Shastho Copilot (done)
- [x] `POST /copilot/triage-assist` → extract → PulseScore → CareMatch → ConflictProof → EN/BN brief; bounded at 5 tool steps; trace stored in `agent_sessions` (redacted note only); `GET /copilot/sessions/{id}`
- [x] Groq → Gemini (`gemini-3.5-flash-lite`, verified live) → deterministic EN/BN/Banglish parser (Bangla digits, °F→°C, negation like "খিঁচুনি নেই"); fields the model leaves null are filled by the parser
- [x] Guards: identifier scrubbing + prompt-injection block (reused from `steward_agent.py`); numbers the model returns must literally appear in the note; missing vitals are reported, never defaulted; brief is templated from tool output only; always `requires_human_approval`
- [x] Tests: 10-note golden set, end-to-end with no keys, mocked hallucination, PII, injection, roles. `conftest.py` blanks real AI keys so tests never call providers

### M5.5: Real capacity data (DGHS has no public feed)
- [x] Provenance on every count: `data_source` (SEED_DEMO / STAFF / FEED) plus `reported_at`
- [x] Per-facility feed keys (SHA-256 hashed, shown once, revocable, facility-scoped) and `POST /feed/v1/capacity`
- [x] Feed subtracts ShasthoGrid's pending holds; out-of-order reports skipped; LockStep lock order; audited
- [x] Freshness LIVE / STALE / DEMO in `/facilities`; CareMatch penalises stale data and returns `stale_facilities`
- [x] Dispatch UI freshness chip + panel + stale warning; integration guide in `docs/hospital-feed.md`
- [x] FacilityDesk (`/facility`): bed/vent and blood steppers with optimistic versioning, incoming-hold queue (confirm / arrived / release, 20 s polling), feed-key issue/revoke with one-time reveal + curl example; officers land here after login
- [x] Blood-bank officers see (read-only) holds that draw on their stock
- [x] Map labels avoid collisions near Farmgate

### M6: Product UI redesign
- [x] `/dispatch` CareMatch workbench: vitals, live PulseScore badge, presets, ConflictProof banner, repair cards, MapLibre dual routes, approve & lock
- [x] `/race-lab`: 5×5 live grid, KPI counters, timing telemetry, idempotency replay inspector
- [x] `/radar`: CareRadar 3D hospital, pharmacy, and blood-bank finder with OSRM routing
- [x] StewardLens critical-care (`/insights`): ICU occupied/free/unstaffed bars with table view, blood heatmap with expiry flags, hold outcomes, freshness, and Lakehouse NDJSON export
- [x] Facility-scoped stock steppers + hold queue (FacilityDesk); cross-facility 403s audited
- [x] Clinical rule provenance (`source_document`, `rule_version`, `effective_date`, `review_status`) and evidence card methodology/population traceability
- [ ] Audit explorer UI
- [ ] Settings: dependency health + simulate OSRM/AI outage
- [x] Login: one-click demo role cards for all roles
- [x] WCAG 2.2 AA review fixed (contrast, focus, live regions, language of parts, non-colour map encoding); verified clean at 390 px and 1440 px
- [ ] Automated axe run in Playwright across the new pages

### Security hardening (review findings)
- [x] Trusted-proxy-aware rate limiting + strict bucket on login/PIN/feed; trace-id validation; fail-closed JWT secret
- [x] Explicit Redis unavailability behavior (`RATE_LIMIT_FAIL_CLOSED_ON_SENSITIVE`, `X-RateLimit-Status: degraded`) and production demo gate (`ALLOW_DEMO_DATA_IN_PRODUCTION`)
- [x] Cross-clinic isolation for `admin`/`auditor` across `GET /carematch/{id}`, `GET/POST /reservations`, and `GET /copilot/sessions/{id}`
- [x] RaceLab reset releases stock + audits; sandbox cannot hold blood; expired holds cancellable
- [x] Feed: holds read after locks, role-scoped keys, newer-report-wins, inactive-facility keys rejected
- [x] Transition: 404 for invisible reservations, denied attempts audited; Copilot guard covers zeros and safety flags

### M7: Ship
- [x] `frontend/Dockerfile` (built and smoke-tested); compose passes build args
- [x] GitHub Actions CI (`.github/workflows/ci.yml`) and operations runbook (`docs/operations.md`)
- [ ] Render backend (`--workers 1`), Vercel frontend, Neon + Upstash (needs your accounts)
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the real domain; cron keep-alive on `/health`
- [x] README with architecture, rubric mapping, demo credentials and data-honesty note
- [ ] 5-minute demo video following the blueprint scripts
