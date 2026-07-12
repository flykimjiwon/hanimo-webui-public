#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${HANIMO_BACKUP_DIR:-${ROOT_DIR}/backups}"

usage() {
  cat <<'EOF'
Usage: scripts/manage.sh COMMAND [options]

Commands:
  status                  Show container and health status
  logs [service]          Follow logs (default: app)
  backup                  Back up PostgreSQL and .env
  restore FILE --yes      Restore a .sql.gz backup
  update --ref REF        Back up, switch to a reviewed ref, rebuild, and smoke-test
  stop                    Stop containers without deleting data
  uninstall               Remove containers while preserving volumes and backups
EOF
}

compose() { docker compose --project-directory "$ROOT_DIR" "$@"; }
need_runtime() {
  command -v docker >/dev/null 2>&1 || { echo "Error: docker is required." >&2; exit 127; }
  docker compose version >/dev/null 2>&1 || { echo "Error: docker compose is required." >&2; exit 127; }
}

backup() {
  mkdir -p "$BACKUP_DIR"
  local stamp sql_file env_file
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  sql_file="${BACKUP_DIR}/hanimo-${stamp}.sql.gz"
  env_file="${BACKUP_DIR}/hanimo-${stamp}.env"
  compose exec -T db sh -c 'pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -9 > "$sql_file"
  [[ -f "$ROOT_DIR/.env" ]] && cp -p "$ROOT_DIR/.env" "$env_file"
  chmod 600 "$sql_file" "$env_file" 2>/dev/null || true
  printf '%s\n' "$sql_file"
}

restore() {
  local file="$1" confirmation="$2"
  [[ "$confirmation" == "--yes" ]] || { echo "Error: restore requires --yes." >&2; exit 2; }
  [[ -f "$file" ]] || { echo "Error: backup not found: $file" >&2; exit 2; }
  backup >/dev/null
  gzip -dc "$file" | compose exec -T db sh -c 'psql -1 -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'
}

update() {
  local ref="$1" previous_ref
  [[ -n "$ref" ]] || { echo "Error: update requires --ref REF." >&2; exit 2; }
  [[ -z "$(git -C "$ROOT_DIR" status --short)" ]] || { echo "Error: checkout has local changes." >&2; exit 1; }
  previous_ref="$(git -C "$ROOT_DIR" rev-parse HEAD)"
  backup >/dev/null
  git -C "$ROOT_DIR" fetch --depth=1 origin "$ref"
  git -C "$ROOT_DIR" checkout --detach FETCH_HEAD
  if ! compose up -d --build || ! node "$ROOT_DIR/scripts/smoke-routes.js"; then
    echo "Update failed; restoring source and containers to ${previous_ref}." >&2
    git -C "$ROOT_DIR" checkout --detach "$previous_ref"
    compose up -d --build
    exit 1
  fi
}

command="${1:-}"
shift || true
if [[ "$command" == "-h" || "$command" == "--help" || "$command" == "help" ]]; then
  usage
  exit 0
fi
need_runtime
case "$command" in
  status) compose ps; curl -fsS "http://localhost:${PORT:-3000}/api/public/settings" >/dev/null && echo "HTTP: healthy" ;;
  logs) compose logs -f "${1:-app}" ;;
  backup) backup ;;
  restore) restore "${1:-}" "${2:-}" ;;
  update) [[ "${1:-}" == "--ref" ]] || { usage >&2; exit 2; }; update "${2:-}" ;;
  stop) compose stop ;;
  uninstall) compose down; echo "Volumes and backups were preserved." ;;
  *) usage >&2; exit 2 ;;
esac
