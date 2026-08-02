#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

shopt -s nullglob
for migration in /migrations/*.sql; do
  filename="$(basename "$migration")"
  applied="$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$filename' LIMIT 1")"
  if [[ "$applied" == "1" ]]; then
    echo ">> skip $filename"
    continue
  fi

  echo ">> apply $filename"
  {
    # The runner owns the transaction so applying SQL and recording it are atomic.
    # Older migrations contain standalone BEGIN/COMMIT lines; strip only those boundaries.
    sed -E '/^[[:space:]]*(BEGIN|COMMIT);[[:space:]]*$/d' "$migration"
    printf "\nINSERT INTO schema_migrations (filename) VALUES (:'migration_filename');\n"
  } | psql "$DATABASE_URL" \
    -v ON_ERROR_STOP=1 \
    -v migration_filename="$filename" \
    --single-transaction
done
