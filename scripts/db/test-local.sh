#!/usr/bin/env bash
# Run the pgTAP suite against a plain local Postgres (no Docker needed).
# Prefer `npx supabase test db` when you have the Supabase CLI stack running.
#
#   PGHOST=/var/run/postgresql PGPORT=5432 PGUSER=postgres scripts/db/test-local.sh
#
# Requires: postgres 15+, pgTAP extension, pg_prove.
set -euo pipefail

cd "$(dirname "$0")/../.."
DB="${TEST_DB:-us_test}"

psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists ${DB}" -c "create database ${DB}"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f scripts/db/supabase-shim.sql
for f in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
if [ -f supabase/seed.sql ]; then
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/seed.sql
fi
psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "create extension if not exists pgtap with schema extensions"

pg_prove -d "$DB" supabase/tests/*.test.sql
