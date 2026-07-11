#!/usr/bin/env bash
set -euo pipefail

# Generate a SchemaSpy ER diagram + browsable schema docs for the local
# docker-compose `postgres` database.
#
# This script does NOT manage the database lifecycle: it assumes the
# docker-compose stack is already running (start it via the deploy-local
# skill, or `docker compose up -d --build`), matching how deploy-local works.
# The `schemaspy` service itself is defined in docker-compose.yml, gated
# behind the `schemaspy` profile so it never starts as part of a normal
# `docker compose up`.

OUTPUT_DIR="docs/schemaspy-output"

# Resolve the repo root from this script's location so the script works no
# matter the caller's current directory (Docker volume mounts need an
# absolute path).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# 1a. The postgres container must be running.
running="$(docker ps --filter "name=^postgres$" --filter "status=running" --format '{{.Names}}')"
if [ -z "$running" ]; then
  echo "Error: the 'postgres' container is not running." >&2
  echo "Start the stack first: run the deploy-local skill, or 'docker compose up -d --build'." >&2
  exit 1
fi

# 1b. ...and healthy.
health="$(docker inspect --format '{{.State.Health.Status}}' postgres 2>/dev/null || true)"
if [ "$health" != "healthy" ]; then
  echo "Error: the 'postgres' container is not healthy (status: ${health:-unknown})." >&2
  echo "Wait for it to become healthy, or restart the stack via deploy-local." >&2
  exit 1
fi

# 2. Recreate the output directory, clearing any stale output.
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# 3. Run the schemaspy compose service. --no-deps keeps step 1's check
# meaningful — without it, `run` would happily start postgres itself.
docker compose --profile schemaspy run --rm --no-deps schemaspy

# 4. Report the result.
echo "SchemaSpy diagram generated: $REPO_ROOT/$OUTPUT_DIR/index.html"
