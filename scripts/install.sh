#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="2026.06.29"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
PORT_VALUE="${PORT:-3000}"
JSON_OUTPUT=0
NO_COLOR=0
YES=0
NO_SMOKE=0

if [[ ! -t 1 || -n "${NO_COLOR:-}" ]]; then
  NO_COLOR=1
fi

usage() {
  cat <<'EOF'
hanimo-webui one-command installer

Usage:
  scripts/install.sh [options]

Options:
  -h, --help        Show this help
  -V, --version     Show installer version
  -y, --yes         Non-interactive mode; accept safe defaults
      --json        Print final result as JSON
      --no-color    Disable ANSI colors
      --no-smoke    Skip route smoke check after startup
      --port PORT   Host port for the web app (default: 3000)

Examples:
  ./scripts/install.sh
  ./scripts/install.sh --yes --port 3100
  ./scripts/install.sh --json --no-smoke

Exit codes:
  0   success
  1   install/startup failure
  2   usage error
  127 missing dependency
  130 interrupted
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -V|--version)
      echo "hanimo-webui installer ${VERSION}"
      exit 0
      ;;
    -y|--yes)
      YES=1
      shift
      ;;
    --json)
      JSON_OUTPUT=1
      NO_COLOR=1
      shift
      ;;
    --no-color)
      NO_COLOR=1
      shift
      ;;
    --no-smoke)
      NO_SMOKE=1
      shift
      ;;
    --port)
      if [[ $# -lt 2 || ! "$2" =~ ^[0-9]+$ ]]; then
        echo "Error: --port requires a numeric value." >&2
        exit 2
      fi
      PORT_VALUE="$2"
      shift 2
      ;;
    *)
      echo "Error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

color() {
  local code="$1"
  shift
  if [[ "$NO_COLOR" -eq 1 ]]; then
    printf '%s' "$*"
  else
    printf '\033[%sm%s\033[0m' "$code" "$*"
  fi
}

log() {
  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    printf '%s\n' "$*" >&2
  else
    printf '%s\n' "$*"
  fi
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n' | sed 's/\\n$//'
}

finish_json() {
  local success="$1"
  local message="$2"
  local url="$3"
  local smoke="$4"
  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    printf '{"success":%s,"message":"%s","url":"%s","envFile":"%s","smoke":"%s"}\n' \
      "$success" \
      "$(json_escape "$message")" \
      "$(json_escape "$url")" \
      "$(json_escape "$ENV_FILE")" \
      "$(json_escape "$smoke")"
  fi
}

die() {
  local code="$1"
  local message="$2"
  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    finish_json false "$message" "" "not-run"
  else
    printf '%s %s\n' "$(color 31 Error:)" "$message" >&2
  fi
  exit "$code"
}

on_interrupt() {
  die 130 "Interrupted."
}
trap on_interrupt INT TERM

need_cmd() {
  local name="$1"
  local fix="$2"
  if ! command -v "$name" >/dev/null 2>&1; then
    die 127 "Missing dependency '${name}'. ${fix}"
  fi
}

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
    return
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
    return
  fi
  die 127 "Docker Compose is not available. Install Docker Desktop or the docker compose plugin."
}

compose() {
  "${COMPOSE[@]}" "$@"
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  if command -v node >/dev/null 2>&1; then
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
    return
  fi
  if [[ -r /dev/urandom ]]; then
    LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 64
    return
  fi
  die 127 "Cannot generate JWT_SECRET. Install openssl or Node.js."
}

get_env_value() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi
  grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true
}

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  if [[ -f "$ENV_FILE" && $(grep -c -E "^${key}=" "$ENV_FILE" || true) -gt 0 ]]; then
    awk -v key="$key" -v value="$value" '
      $0 ~ "^" key "=" { print key "=" value; next }
      { print }
    ' "$ENV_FILE" > "$tmp"
  else
    if [[ -f "$ENV_FILE" ]]; then
      cat "$ENV_FILE" > "$tmp"
      printf '\n%s=%s\n' "$key" "$value" >> "$tmp"
    else
      printf '%s=%s\n' "$key" "$value" > "$tmp"
    fi
  fi
  mv "$tmp" "$ENV_FILE"
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "${ROOT_DIR}/.env.example" ]]; then
      cp "${ROOT_DIR}/.env.example" "$ENV_FILE"
    else
      touch "$ENV_FILE"
    fi
    log "$(color 32 Created) .env"
  fi

  local jwt_secret
  jwt_secret="$(get_env_value JWT_SECRET)"
  if [[ -z "$jwt_secret" ||
        "$jwt_secret" == "your-jwt-secret-here" ||
        "$jwt_secret" == please-change-me-in-production-* ||
        ${#jwt_secret} -lt 32 ]]; then
    set_env_value JWT_SECRET "$(generate_secret)"
    log "$(color 32 Updated) JWT_SECRET in .env"
  else
    log "$(color 32 OK) JWT_SECRET already configured"
  fi

  set_env_value PORT "$PORT_VALUE"

  if [[ -z "$(get_env_value POSTGRES_USER)" ]]; then
    set_env_value POSTGRES_USER "hanimo"
  fi

  if [[ -z "$(get_env_value POSTGRES_DB)" ]]; then
    set_env_value POSTGRES_DB "hanimo"
  fi

  local postgres_password
  postgres_password="$(get_env_value POSTGRES_PASSWORD)"
  if [[ -z "$postgres_password" ||
        "$postgres_password" == "change-me-after-install" ||
        ${#postgres_password} -lt 16 ]]; then
    set_env_value POSTGRES_PASSWORD "$(generate_secret)"
    log "$(color 32 Updated) POSTGRES_PASSWORD in .env"
  else
    log "$(color 32 OK) POSTGRES_PASSWORD already configured"
  fi

  if [[ -z "$(get_env_value HANIMO_ADMIN_EMAIL)" ]]; then
    set_env_value HANIMO_ADMIN_EMAIL "admin@hanimo.ai"
  fi

  local admin_password
  admin_password="$(get_env_value HANIMO_ADMIN_PASSWORD)"
  if [[ -z "$admin_password" ||
        "$admin_password" == "change-me-after-install" ||
        ${#admin_password} -lt 12 ]]; then
    set_env_value HANIMO_ADMIN_PASSWORD "$(generate_secret)"
    log "$(color 32 Updated) HANIMO_ADMIN_PASSWORD in .env"
  else
    log "$(color 32 OK) HANIMO_ADMIN_PASSWORD already configured"
  fi

  if [[ -z "$(get_env_value HANIMO_ADMIN_NAME)" ]]; then
    set_env_value HANIMO_ADMIN_NAME "System Administrator"
  fi

  if [[ -z "$(get_env_value HANIMO_ADMIN_DEPARTMENT)" ]]; then
    set_env_value HANIMO_ADMIN_DEPARTMENT "Hanimo"
  fi

  if [[ -z "$(get_env_value HANIMO_ADMIN_TEAM)" ]]; then
    set_env_value HANIMO_ADMIN_TEAM "Admin Team"
  fi

  if [[ -z "$(get_env_value HANIMO_ENABLE_DESTRUCTIVE_ADMIN)" ]]; then
    set_env_value HANIMO_ENABLE_DESTRUCTIVE_ADMIN "false"
  fi
}

wait_for_app() {
  local url="$1"
  local attempts=90
  local delay=2

  log "Waiting for ${url} ..."
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "${url}/api/public/settings" >/dev/null 2>&1; then
      log "$(color 32 OK) app is responding"
      return 0
    fi
    sleep "$delay"
  done

  log "App did not become ready. Recent app logs:" >&2
  compose logs --tail=120 app >&2 || true
  return 1
}

main() {
  cd "$ROOT_DIR"

  need_cmd docker "Install Docker Desktop: https://docs.docker.com/desktop/"
  need_cmd curl "Install curl or run doctor after installing system tools."

  if ! docker info >/dev/null 2>&1; then
    die 1 "Docker daemon is not running. Start Docker Desktop and retry."
  fi

  detect_compose
  ensure_env_file

  log "Starting hanimo-webui with Docker Compose ..."
  compose up -d --build

  local base_url="http://127.0.0.1:${PORT_VALUE}"
  wait_for_app "$base_url"

  local smoke_status="skipped"
  if [[ "$NO_SMOKE" -eq 0 ]]; then
    log "Running route smoke checks ..."
    compose exec -T app sh -lc "SMOKE_BASE_URL=http://127.0.0.1:3000 npm run smoke"
    smoke_status="passed"
  fi

  log ""
  log "$(color 32 Ready) hanimo-webui is running at ${base_url}"
  log "Initial admin email: $(get_env_value HANIMO_ADMIN_EMAIL)"
  log "Initial admin password: $(get_env_value HANIMO_ADMIN_PASSWORD)"
  log "The admin bootstrap runs inside the app container if no admin exists."
  log "Run ./scripts/doctor.sh to inspect the install."
  finish_json true "hanimo-webui is running" "$base_url" "$smoke_status"
}

main
