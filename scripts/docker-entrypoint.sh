#!/usr/bin/env bash
# Backend container entrypoint.
# Creates the DynamoDB tables and seeds sample data before handing off to the
# main process (whatever was passed as the container command).
set -e

echo "[entrypoint] Creating DynamoDB tables (if needed)..."
node scripts/create-tables.js

echo "[entrypoint] Seeding sample data..."
# Seeding is idempotent (skips when the sample restaurant already exists), so it
# is safe to run on every start.
node scripts/seed.js || echo "[entrypoint] WARNING: seed step failed, continuing."

echo "[entrypoint] Starting: $*"
exec "$@"
