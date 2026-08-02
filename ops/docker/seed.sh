#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_seeds (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

shopt -s nullglob
for seed in /seed/*.sql; do
  filename="$(basename "$seed")"
  applied="$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM schema_seeds WHERE filename = '$filename' LIMIT 1")"
  if [[ "$applied" == "1" ]]; then
    echo ">> skip $filename"
    continue
  fi

  echo ">> apply $filename"
  {
    sed -E '/^[[:space:]]*(BEGIN|COMMIT);[[:space:]]*$/d' "$seed"
    printf "\nINSERT INTO schema_seeds (filename) VALUES (:'seed_filename');\n"
  } | psql "$DATABASE_URL" \
    -v ON_ERROR_STOP=1 \
    -v seed_filename="$filename" \
    --single-transaction
done
