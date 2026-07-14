#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="2026.07.05"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
PORT_VALUE="${PORT:-3000}"
PORT_EXPLICIT=0
START_APP=1
SKIP_NPM_INSTALL=0
ROTATE_ADMIN_PASSWORD=0
DB_URI="${POSTGRES_URI:-}"

usage() {
  cat <<'EOF'
hanimo-webui local installer

Usage:
  scripts/install-local.sh [options]

Options:
  -h, --help              Show this help
  -V, --version           Show installer version
      --port PORT         App port (default: 3000)
      --db-uri URI        PostgreSQL URI to write to .env
      --no-start          Install, migrate, create admin, then stop
      --skip-npm-install  Skip npm install/npm ci
      --rotate-admin-password
                          Generate and apply a new admin password without printing it

Examples:
  ./scripts/install-local.sh --db-uri postgresql://127.0.0.1:5432/hanimo
  ./scripts/install-local.sh --no-start
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -V|--version)
      echo "hanimo-webui local installer ${VERSION}"
      exit 0
      ;;
    --port)
      if [[ $# -lt 2 || ! "$2" =~ ^[0-9]+$ ]]; then
        echo "Error: --port requires a numeric value." >&2
        exit 2
      fi
      PORT_VALUE="$2"
      PORT_EXPLICIT=1
      shift 2
      ;;
    --db-uri)
      if [[ $# -lt 2 ]]; then
        echo "Error: --db-uri requires a value." >&2
        exit 2
      fi
      DB_URI="$2"
      shift 2
      ;;
    --no-start)
      START_APP=0
      shift
      ;;
    --skip-npm-install)
      SKIP_NPM_INSTALL=1
      shift
      ;;
    --rotate-admin-password)
      ROTATE_ADMIN_PASSWORD=1
      shift
      ;;
    *)
      echo "Error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

need_cmd() {
  local name="$1"
  local fix="$2"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Error: missing ${name}. ${fix}" >&2
    exit 127
  fi
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
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
      cp "$ENV_FILE" "$tmp"
      printf '\n%s=%s\n' "$key" "$value" >> "$tmp"
    else
      printf '%s=%s\n' "$key" "$value" > "$tmp"
    fi
  fi
  mv "$tmp" "$ENV_FILE"
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "${ROOT_DIR}/.env.example" "$ENV_FILE"
    echo "Created .env"
  fi

  local jwt_secret
  jwt_secret="$(get_env_value JWT_SECRET)"
  if [[ -z "$jwt_secret" || "$jwt_secret" == "your-jwt-secret-here" || ${#jwt_secret} -lt 32 ]]; then
    set_env_value JWT_SECRET "$(generate_secret)"
    echo "Updated JWT_SECRET"
  fi

  local setup_token
  setup_token="$(get_env_value HANIMO_SETUP_TOKEN)"
  if [[ -z "$setup_token" || "$setup_token" == "your-setup-token-here" || ${#setup_token} -lt 32 ]]; then
    set_env_value HANIMO_SETUP_TOKEN "$(generate_secret)"
    echo "Updated HANIMO_SETUP_TOKEN"
  fi

  local credential_key
  credential_key="$(get_env_value HANIMO_CREDENTIAL_ENCRYPTION_KEY)"
  if [[ -z "$credential_key" || "$credential_key" == "your-credential-encryption-key-here" || ${#credential_key} -lt 32 ]]; then
    set_env_value HANIMO_CREDENTIAL_ENCRYPTION_KEY "$(generate_secret)"
    echo "Updated HANIMO_CREDENTIAL_ENCRYPTION_KEY"
  fi

  if [[ -z "$DB_URI" ]]; then
    DB_URI="$(get_env_value POSTGRES_URI)"
  fi
  if [[ -z "$DB_URI" || "$DB_URI" == *"your-password"* ]]; then
    DB_URI="postgresql://127.0.0.1:5432/hanimo"
  fi

  if [[ "$PORT_EXPLICIT" -eq 0 ]]; then
    local existing_port
    existing_port="$(get_env_value PORT)"
    if [[ "$existing_port" =~ ^[0-9]+$ ]]; then
      PORT_VALUE="$existing_port"
    fi
  fi

  set_env_value POSTGRES_URI "$DB_URI"
  set_env_value PORT "$PORT_VALUE"

  if [[ -z "$(get_env_value HANIMO_ADMIN_EMAIL)" ]]; then
    set_env_value HANIMO_ADMIN_EMAIL "admin@hanimo.ai"
  fi

  local admin_password
  admin_password="$(get_env_value HANIMO_ADMIN_PASSWORD)"
  if [[ "$ROTATE_ADMIN_PASSWORD" -eq 1 || -z "$admin_password" || "$admin_password" == "change-me-after-install" || ${#admin_password} -lt 12 ]]; then
    set_env_value HANIMO_ADMIN_PASSWORD "$(generate_secret)"
    if [[ "$ROTATE_ADMIN_PASSWORD" -eq 1 ]]; then
      echo "Rotated HANIMO_ADMIN_PASSWORD"
    else
      echo "Updated HANIMO_ADMIN_PASSWORD"
    fi
  fi

  if [[ -z "$(get_env_value HANIMO_ENABLE_DESTRUCTIVE_ADMIN)" ]]; then
    set_env_value HANIMO_ENABLE_DESTRUCTIVE_ADMIN "false"
  fi

  if [[ -z "$(get_env_value HANIMO_ENABLE_LABS)" ]]; then
    set_env_value HANIMO_ENABLE_LABS "false"
  fi
}

export_runtime_env() {
  # The setup scripts are plain Node processes, so Next.js does not load .env
  # for them. Export the values just written above without printing secrets.
  export POSTGRES_URI="$DB_URI"
  export PORT="$PORT_VALUE"
  export JWT_SECRET="$(get_env_value JWT_SECRET)"
  export HANIMO_SETUP_TOKEN="$(get_env_value HANIMO_SETUP_TOKEN)"
  export HANIMO_CREDENTIAL_ENCRYPTION_KEY="$(get_env_value HANIMO_CREDENTIAL_ENCRYPTION_KEY)"
  export HANIMO_ADMIN_EMAIL="$(get_env_value HANIMO_ADMIN_EMAIL)"
  export HANIMO_ADMIN_PASSWORD="$(get_env_value HANIMO_ADMIN_PASSWORD)"
  if [[ "$ROTATE_ADMIN_PASSWORD" -eq 1 ]]; then
    export HANIMO_ADMIN_ROTATE_PASSWORD="true"
  else
    export HANIMO_ADMIN_ROTATE_PASSWORD="false"
  fi
  export HANIMO_ENABLE_DESTRUCTIVE_ADMIN="$(get_env_value HANIMO_ENABLE_DESTRUCTIVE_ADMIN)"
  export HANIMO_ENABLE_LABS="$(get_env_value HANIMO_ENABLE_LABS)"
}

maybe_create_local_database() {
  if ! command -v createdb >/dev/null 2>&1; then
    return
  fi
  node - "$DB_URI" <<'NODE' | while read -r db_name; do
const uri = process.argv[2];
try {
  const parsed = new URL(uri);
  const dbName = parsed.pathname.replace(/^\//, '');
  if (/^[a-zA-Z0-9_-]+$/.test(dbName)) process.stdout.write(`${dbName}\n`);
} catch (error) {
  if (process.env.HANIMO_INSTALL_VERBOSE === '1') {
    process.stderr.write(`${error.message}\n`);
  }
}
NODE
    createdb "$db_name" >/dev/null 2>&1 || true
  done
}

main() {
  cd "$ROOT_DIR"

  case "$(uname -s)" in
    Darwin|Linux) ;;
    *) echo "Error: local installer supports macOS/Linux. Use npm install manually on Windows." >&2; exit 2 ;;
  esac

  need_cmd node "Install Node.js 20+."
  need_cmd npm "Install npm with Node.js."

  ensure_env_file
  export_runtime_env
  maybe_create_local_database

  if [[ "$SKIP_NPM_INSTALL" -eq 0 ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi

  npm run test-postgres
  npm run setup-postgres
  npm run create-admin

  echo ""
  echo "hanimo-webui local setup complete."
  echo "URL: http://127.0.0.1:${PORT_VALUE}"
  echo "Admin email: $(get_env_value HANIMO_ADMIN_EMAIL)"
  echo "Admin password is stored in ${ENV_FILE}. It is not printed to terminal logs."

  if [[ "$START_APP" -eq 1 ]]; then
    npm run build
    PORT="$PORT_VALUE" npm run start
  fi
}

main
