#!/bin/sh
# Container entrypoint. Seeding is opt-in (SEED_ON_START=true) because the bundled seed is
# synthetic demo data; seed.py itself refuses to run when ENVIRONMENT is production.
# The seed is idempotent and also creates/upgrades tables, so it is safe on every boot.
set -e
if [ "${SEED_ON_START:-false}" = "true" ]; then
  python -m app.db.seed
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
