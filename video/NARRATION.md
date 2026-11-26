# ShasthoGrid — presentation film narration

Film: `video/out/ShasthoGrid-presentation.mp4` · 1920×1080 · 30 fps · 3:24 · no audio track.
On-screen: English captions, a chapter bar (01–11) and a top progress rail.
Read at a calm pace (about 140 words a minute). Each block starts at the timecode shown; `/` marks a short pause.

---

**0:00 — Intro**
Safe care, proven at every step — from the pharmacy counter to the ICU bed. / This is ShasthoGrid.

**0:05 — 01 · The problem**
Two crises meet in Bangladesh's frontline care. / Antibiotics are sold without a prescription, which fuels resistance. / And critically ill patients are sent from hospital to hospital while ICU beds sit idle for lack of staff.

**0:16 — 02 · The idea**
ShasthoGrid solves both with one engine: provable constraint solving. / One grid. Every decision explained. Every booking safe.

**0:23 — 03 · How it works**
In the emergency lane, a paramedic's note becomes a NEWS2 score, and CareMatch picks the best hospital. / If no hospital can meet every rule, ConflictProof says exactly why and offers safe repairs. A clinician approves, and LockStep holds the bed. / In the clinic lane, RxSolve picks the safest Access antibiotic, FreshStock dispenses the earliest-expiring stock, and StewardLens tracks the WHO target.

**0:39 — 04 · Advanced Challenge A02: constraint-based decision making**
CareMatch turns a patient's needs into hard constraints and solves them with Google OR-Tools CP-SAT. / When no hospital fits, ConflictProof returns the exact minimal conflict sets — not a vague "no results". / Then it proposes safe repairs. Clinical rules — ICU, ventilator, blood type — are never relaxed. / The same engine powers RxSolve.

**1:00 — 05 · Edge case: the Farmgate emergency**
A mother is bleeding after childbirth at Farmgate. Her NEWS2 score is fifteen — critical. / She needs a public ICU, a ventilator and two units of O-negative blood within fifteen minutes. No single hospital has all of it. / ConflictProof finds the fix: an ICU bed at BMU, and O-negative blood couriered from Dhaka Medical College. / The dispatcher approves, and LockStep holds the bed, ventilator and blood together on a ten-minute timer.

**1:18 — 06 · Advanced Challenge A05: concurrency and transactions**
RaceLab fires twenty-five simultaneous bookings at the last ICU bed. / Exactly one wins. Twenty-four are rejected. Zero double bookings. / This is the real app, with real PostgreSQL row locks. / Every lock is taken in one global order, so deadlocks can't happen, and a retry with the same idempotency key replays safely.

**1:37 — 07 · More edge cases**
Each of these is covered by automated tests. / Stale hospital data is flagged. Offline edit conflicts are reviewed, never overwritten. An AI that invents a number is rejected. An unconfirmed hold expires. Another hospital's stock is off-limits. Unsafe antibiotics are excluded. / The system never guesses silently: it explains, refuses, or asks a human.

**1:51 — 08 · Feature tour**
FacilityDesk lets hospitals update beds and confirm patients. / The blood-bank desk keeps stock live, and every number shows its source and age. / StewardLens shows ICU pressure and blood scarcity. / FreshStock dispenses first-expiry first. SyncSafe works offline. / StewardLens tracks the WHO Access target. / Shastho Sathi explains every feature, in a natural Bangla voice. / CareRadar maps nearby care in 3D. / Four themes, two languages, and a full audit trail.

**2:22 — 09 · Live demo**
And it's live, at shasthogrid dot vercel dot app. / The redesigned landing page has an interactive dot grid, a live care map, and honest demo labels. / Every feature has a name and a job, and every card opens the real app. / The Farmgate case is also a scroll story: as you scroll, the camera follows the emergency across the map — the rule clash, the safe repair, and the LockStep hold, with the real numbers.

**2:43 — 10 · User journeys**
Every role gets its own journey, and only sees what it is allowed to touch. / Dispatchers book. Hospitals confirm. Blood banks supply. Pharmacists approve. Clinics work offline. / Auditors review everything, and every decision is logged with a trace ID.

**3:02 — 11 · Architecture and trust**
Under the hood: an offline-first Next.js app on Vercel, a FastAPI backend on Railway, CP-SAT solvers, PostgreSQL and Redis — with one hundred seventy-four backend tests passing. / AI is guarded — de-identified input, injection screening, and a deterministic fallback when AI is unavailable.

**3:15 — Close**
ShasthoGrid. / Provably safe care, from the pharmacy counter to the ICU bed. / Try it live at shasthogrid dot vercel dot app — sign in with a demo account, no setup needed. / Thank you — ধন্যবাদ.
