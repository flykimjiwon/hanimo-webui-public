#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="2026.06.29"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
JSON_OUTPUT=0
NO_COLOR=0
VERBOSE=0
BASE_URL=""
PORT_VALUE="${PORT:-3000}"

if [[ ! -t 1 || -n "${NO_COLOR:-}" ]]; then
  NO_COLOR=1
fi

usage() {
  cat <<'EOF'
hanimo-webui environment doctor

Usage:
  scripts/doctor.sh [options]

Options:
  -h, --help          Show this help
  -V, --version       Show doctor version
  -v, --verbose       Print more diagnostic detail
      --json          Print machine-readable JSON
      --no-color      Disable ANSI colors
      --base-url URL  App URL to check (default: http://127.0.0.1:$PORT)
      --port PORT     Host port used to build the default base URL

Examples:
  ./scripts/doctor.sh
  ./scripts/doctor.sh --base-url http://127.0.0.1:3100
  ./scripts/doctor.sh --json

Exit codes:
  0 success or warnings only
  1 one or more errors
  2 usage error
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -V|--version)
      echo "hanimo-webui doctor ${VERSION}"
      exit 0
      ;;
    -v|--verbose)
      VERBOSE=1
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
    --base-url)
      if [[ $# -lt 2 ]]; then
        echo "Error: --base-url requires a value." >&2
        exit 2
      fi
      BASE_URL="$2"
      shift 2
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

if [[ -z "$BASE_URL" ]]; then
  BASE_URL="http://127.0.0.1:${PORT_VALUE}"
fi

color() {
  local code="$1"
  shift
  if [[ "$NO_COLOR" -eq 1 ]]; then
    printf '%s' "$*"
  else
    printf '\033[%sm%s\033[0m' "$code" "$*"
  fi
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n' | sed 's/\\n$//'
}

CHECK_NAMES=()
CHECK_STATUS=()
CHECK_MESSAGES=()
CHECK_FIXES=()
ERRORS=0
WARNINGS=0

add_check() {
  local status="$1"
  local name="$2"
  local message="$3"
  local fix="${4:-}"

  CHECK_STATUS+=("$status")
  CHECK_NAMES+=("$name")
  CHECK_MESSAGES+=("$message")
  CHECK_FIXES+=("$fix")

  case "$status" in
    error) ERRORS=$((ERRORS + 1)) ;;
    warning) WARNINGS=$((WARNINGS + 1)) ;;
  esac

  if [[ "$JSON_OUTPUT" -eq 0 ]]; then
    local label
    case "$status" in
      ok) label="$(color 32 OK)" ;;
      warning) label="$(color 33 WARN)" ;;
      error) label="$(color 31 ERROR)" ;;
      *) label="$status" ;;
    esac
    printf '%-7s %s - %s\n' "$label" "$name" "$message"
    if [[ -n "$fix" && ( "$status" != "ok" || "$VERBOSE" -eq 1 ) ]]; then
      printf '        fix: %s\n' "$fix"
    fi
  fi
}

print_json() {
  printf '{"success":%s,"errors":%s,"warnings":%s,"baseUrl":"%s","checks":[' \
    "$([[ "$ERRORS" -eq 0 ]] && echo true || echo false)" \
    "$ERRORS" \
    "$WARNINGS" \
    "$(json_escape "$BASE_URL")"
  for i in "${!CHECK_NAMES[@]}"; do
    if [[ "$i" -gt 0 ]]; then
      printf ','
    fi
    printf '{"name":"%s","status":"%s","message":"%s","fix":"%s"}' \
      "$(json_escape "${CHECK_NAMES[$i]}")" \
      "$(json_escape "${CHECK_STATUS[$i]}")" \
      "$(json_escape "${CHECK_MESSAGES[$i]}")" \
      "$(json_escape "${CHECK_FIXES[$i]}")"
  done
  printf ']}\n'
}

version_major() {
  printf '%s' "$1" | sed -E 's/^v?([0-9]+).*/\1/'
}

get_env_value() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi
  grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true
}

detect_compose() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
    return 0
  fi
  return 1
}

compose() {
  "${COMPOSE[@]}" "$@"
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    add_check warning "Node.js" "not found on host" "Install Node.js 20+ for local development. Docker install can still run without host Node."
    return
  fi
  local version major
  version="$(node --version)"
  major="$(version_major "$version")"
  if [[ "$major" -ge 20 ]]; then
    add_check ok "Node.js" "$version"
  else
    add_check error "Node.js" "$version is below required v20" "Install Node.js 20+."
  fi
}

check_npm() {
  if command -v npm >/dev/null 2>&1; then
    add_check ok "npm" "$(npm --version)"
  else
    add_check warning "npm" "not found on host" "Install npm for local development; Docker install can still run."
  fi
}

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    add_check error "Docker" "docker command not found" "Install Docker Desktop."
    return
  fi
  if docker info >/dev/null 2>&1; then
    add_check ok "Docker" "daemon is running"
  else
    add_check error "Docker" "daemon is not running" "Start Docker Desktop."
  fi

  if detect_compose; then
    add_check ok "Docker Compose" "$("${COMPOSE[@]}" version | head -n 1)"
  else
    add_check error "Docker Compose" "compose command not found" "Install Docker Compose plugin or docker-compose."
  fi
}

check_files() {
  [[ -f "${ROOT_DIR}/package.json" ]] \
    && add_check ok "package.json" "present" \
    || add_check error "package.json" "missing" "Run doctor from the hanimo-webui repo root."

  [[ -f "${ROOT_DIR}/package-lock.json" ]] \
    && add_check ok "package-lock.json" "present" \
    || add_check warning "package-lock.json" "missing" "Run npm install to regenerate the lockfile."

  [[ -f "${ROOT_DIR}/docker-compose.yml" ]] \
    && add_check ok "docker-compose.yml" "present" \
    || add_check error "docker-compose.yml" "missing" "Restore docker-compose.yml."

  [[ -f "${ROOT_DIR}/scripts/smoke-routes.js" ]] \
    && add_check ok "smoke script" "present" \
    || add_check error "smoke script" "missing" "Restore scripts/smoke-routes.js."
}

check_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    add_check warning ".env" "missing" "Run ./scripts/install.sh to generate .env."
    return
  fi

  local jwt_secret
  jwt_secret="$(get_env_value JWT_SECRET)"
  if [[ -z "$jwt_secret" ]]; then
    add_check error "JWT_SECRET" "missing in .env" "Run ./scripts/install.sh or set JWT_SECRET=$(openssl rand -hex 32)."
  elif [[ "$jwt_secret" == "your-jwt-secret-here" || "$jwt_secret" == please-change-me-in-production-* ]]; then
    add_check error "JWT_SECRET" "placeholder value in .env" "Run ./scripts/install.sh to replace it."
  elif [[ ${#jwt_secret} -lt 32 ]]; then
    add_check error "JWT_SECRET" "too short (${#jwt_secret} chars)" "Use at least 32 characters."
  else
    add_check ok "JWT_SECRET" "configured (${#jwt_secret} chars)"
  fi

  local destructive
  destructive="$(get_env_value HANIMO_ENABLE_DESTRUCTIVE_ADMIN)"
  if [[ "$destructive" == "true" ]]; then
    add_check warning "destructive admin" "enabled" "Keep HANIMO_ENABLE_DESTRUCTIVE_ADMIN=false for normal operation."
  else
    add_check ok "destructive admin" "disabled or unset"
  fi

  local postgres_password
  postgres_password="$(get_env_value POSTGRES_PASSWORD)"
  if [[ -z "$postgres_password" || "$postgres_password" == "change-me-after-install" ]]; then
    add_check error "POSTGRES_PASSWORD" "missing or placeholder" "Run ./scripts/install.sh to generate it."
  elif [[ ${#postgres_password} -lt 16 ]]; then
    add_check warning "POSTGRES_PASSWORD" "short (${#postgres_password} chars)" "Use a generated password."
  else
    add_check ok "POSTGRES_PASSWORD" "configured (${#postgres_password} chars)"
  fi

  local admin_password
  admin_password="$(get_env_value HANIMO_ADMIN_PASSWORD)"
  if [[ -z "$admin_password" || "$admin_password" == "change-me-after-install" ]]; then
    add_check error "HANIMO_ADMIN_PASSWORD" "missing or placeholder" "Run ./scripts/install.sh or ./scripts/install-local.sh."
  elif [[ ${#admin_password} -lt 12 ]]; then
    add_check error "HANIMO_ADMIN_PASSWORD" "too short (${#admin_password} chars)" "Use at least 12 characters."
  else
    add_check ok "HANIMO_ADMIN_PASSWORD" "configured (${#admin_password} chars)"
  fi
}

check_runtime() {
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "${BASE_URL}/api/public/settings" >/dev/null 2>&1; then
      add_check ok "app HTTP" "${BASE_URL} responds"
    else
      add_check warning "app HTTP" "${BASE_URL} is not responding" "Run ./scripts/install.sh or docker compose up -d."
    fi
  else
    add_check warning "curl" "not found" "Install curl to enable HTTP health checks."
  fi

  if declare -p COMPOSE >/dev/null 2>&1 && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    if compose ps >/dev/null 2>&1; then
      add_check ok "compose project" "docker compose ps works"
      if compose exec -T db pg_isready -U hanimo -d hanimo >/dev/null 2>&1; then
        add_check ok "PostgreSQL container" "pg_isready passed"
      else
        add_check warning "PostgreSQL container" "pg_isready did not pass" "Run docker compose logs db."
      fi
      if compose exec -T app test -d .next >/dev/null 2>&1; then
        add_check ok "Next build artifact" "app container has .next"
      else
        add_check warning "Next build artifact" "app container is not built or not running" "Run docker compose up -d --build."
      fi
    else
      add_check warning "compose project" "docker compose ps failed" "Run from the hanimo-webui repo root."
    fi
  fi
}

main() {
  cd "$ROOT_DIR"

  if [[ "$JSON_OUTPUT" -eq 0 ]]; then
    printf 'hanimo-webui doctor (%s)\n\n' "$VERSION"
  fi

  check_node
  check_npm
  check_docker
  check_files
  check_env
  check_runtime

  if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    print_json
  else
    printf '\nSummary: %s error(s), %s warning(s)\n' "$ERRORS" "$WARNINGS"
  fi

  if [[ "$ERRORS" -gt 0 ]]; then
    exit 1
  fi
}

main
