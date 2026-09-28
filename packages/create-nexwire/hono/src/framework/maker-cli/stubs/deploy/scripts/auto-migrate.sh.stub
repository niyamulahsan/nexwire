#!/bin/sh
#
# auto-migrate.sh - Runs database migrations + seeders when the container starts.
#
# How it works:
#   supervisord launches this script on every container start:
#     /bin/sh /app/deploy/scripts/auto-migrate.sh bun
#   The 1st argument ("bun") is the runtime used to run the CLI command.
#
#   The AUTO_MIGRATE environment variable (from .env) decides what happens:
#     AUTO_MIGRATE=true  -> run "db:migrate --seed" (apply pending migrations, then seed)
#     AUTO_MIGRATE=false -> do nothing, leave the database untouched.
#
#   "db:migrate --seed" is safe to run on every start:
#     - it only applies migrations that have not run yet,
#     - the seeders only insert rows that are missing, so no duplicates.

set -eu   # (set -e: stop on any error; set -u: fail if a variable is unset)

# ---- 1. Read the settings ----
RUNTIME_EXEC="${1:-node}"                 # runtime to run the CLI: "bun" (falls back to "node")
AUTO_MIGRATE_RAW="${AUTO_MIGRATE:-false}" # raw value of AUTO_MIGRATE, "false" if not set

# Normalize the value so "TRUE", "True", "true ", "true" all mean the same thing:
#   tr -d '\r'          -> remove carriage returns (files edited on Windows)
#   tr '[:upper:]' ...  -> lowercase everything
#   sed ... trim        -> remove leading/trailing spaces
AUTO_MIGRATE_NORMALIZED=$(echo "$AUTO_MIGRATE_RAW" | tr -d '\r' | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

# ---- 2. Decide: migrate or skip ----
case "$AUTO_MIGRATE_NORMALIZED" in
  true|1|yes)
    # AUTO_MIGRATE is on -> run pending migrations, then seed the database.
    exec "$RUNTIME_EXEC" src/framework/maker-cli/index.mjs db:migrate --seed
    ;;
  *)
    # AUTO_MIGRATE is off -> leave the database untouched.
    echo "Skipping migrations (AUTO_MIGRATE=$AUTO_MIGRATE_RAW)"
    ;;
esac

