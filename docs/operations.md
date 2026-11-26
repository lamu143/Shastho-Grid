# ShasthoGrid Operations Runbook

## 1. Environment & Production Readiness Gates

Before deploying `backend/` in any non-development environment (`ENVIRONMENT` not in `development`, `dev`, `local`, `test`):

1. **`JWT_SECRET_KEY`**: Must be set to a random secret of at least 32 characters (never the dev placeholder). Startup fails fast via `Settings._validate_jwt_secret_key` if invalid.
2. **`ALLOW_DEMO_DATA_IN_PRODUCTION`**: Defaults to `false`. Keep `false` in production so simulated demo facilities, capacity, and unreviewed clinical rules are never presented as operational recommendations.
3. **`TRUSTED_PROXIES` / `CORS_ORIGINS`**: Configure explicit trusted proxy IPs/CIDRs and frontend origins; avoid wildcard origins in production.
4. **Health & Telemetry**:
   - Liveness / dependency readiness: `GET /healthz`
   - Runtime RED metrics & readiness flags (`admin` / `auditor` only): `GET /api/v1/admin/telemetry`
   - Prometheus / OpenMetrics scrape (`admin` / `auditor` only): `GET /api/v1/admin/telemetry/prometheus`

## 2. Redis Unavailability Behavior

The rate limiter (`backend/app/core/rate_limit.py`) uses an atomic fixed-window Redis counter (TCP Redis Lua script or Upstash REST):

- **Default (`RATE_LIMIT_FAIL_CLOSED_ON_SENSITIVE=false`)**: Requests continue using best-effort pass-through when Redis errors; the API adds the response header `X-RateLimit-Status: degraded` so load balancers and operators can detect degraded rate-limit enforcement.
- **Strict / Production (`RATE_LIMIT_FAIL_CLOSED_ON_SENSITIVE=true`)**: Sensitive endpoints (`/api/v1/auth/login`, `/api/v1/auth/verify-pin`, `/api/v1/copilot/triage-assist`, `/api/v1/feed/*`, `/api/v1/sathi/*`, `/api/v1/reservations*`, `/api/v1/racelab*`) return `503 Service Unavailable` (`RATE_LIMITER_UNAVAILABLE`) if Redis cannot be reached, preventing unthrottled auth or lock-contention traffic.

## 3. Schema Upgrades, Backups, and Rollback

### Schema Upgrades (Alembic + Baseline)
- Versioned migrations live in `backend/alembic/versions/` (`backend/alembic.ini`).
  - Run pending migrations: `cd backend && uv run alembic upgrade head`
  - Roll back the latest migration: `cd backend && uv run alembic downgrade -1`
  - For pre-existing databases initialized before Alembic was added, stamp baseline once: `cd backend && uv run alembic stamp 0001_baseline_schema && uv run alembic upgrade head`
- Startup also runs `init_db()` in `backend/app/db/session.py` (`Base.metadata.create_all` + idempotent `_UPGRADE_STATEMENTS`) so fresh dev/test databases stay self-bootstrapping.
- All schema additions must be backward-compatible (nullable or with server defaults) so rolling deployments do not break active workers.

### PostgreSQL Backup & Restore
Create a consistent logical backup before any upgrade or seed change:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --file="backup_$(date +%Y%m%d_%H%M%S).dump"
```

Restore to a target database (never run destructive tests against production):

```bash
pg_restore --clean --if-exists --no-owner --dbname="$TARGET_DATABASE_URL" backup_YYYYMMDD_HHMMSS.dump
```

### Rollback Procedure
1. Stop incoming traffic or drain the application service.
2. Restore the previous application container/commit.
3. If a release introduced incompatible data changes, restore the pre-upgrade `.dump` file into a clean database and point `DATABASE_URL` to it.
4. Verify `GET /health` and `GET /api/v1/admin/telemetry` return `200 OK`.
