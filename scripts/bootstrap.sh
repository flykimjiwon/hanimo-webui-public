#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY_URL="${HANIMO_REPOSITORY_URL:-https://github.com/flykimjiwon/hanimo-webui-public.git}"
PINNED_REF="${HANIMO_REF:-cffe3cfa230796cf871980118af2de54825e0c47}"
INSTALL_DIR="${HANIMO_INSTALL_DIR:-${HOME}/hanimo-webui}"

usage() {
  cat <<'EOF'
Hanimo pinned bootstrap

Usage:
  bootstrap.sh [--dir PATH] [--ref COMMIT_OR_TAG] [--yes] [install.sh options]

The default source revision is immutable. Set --ref only to a reviewed tag or commit.
EOF
}

YES=0
INSTALL_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -y|--yes) YES=1; INSTALL_ARGS+=(--yes); shift ;;
    --dir)
      [[ $# -ge 2 ]] || { echo "Error: --dir requires a path." >&2; exit 2; }
      INSTALL_DIR="$2"; shift 2 ;;
    --ref)
      [[ $# -ge 2 ]] || { echo "Error: --ref requires a tag or commit." >&2; exit 2; }
      PINNED_REF="$2"; shift 2 ;;
    *) INSTALL_ARGS+=("$1"); shift ;;
  esac
done

command -v git >/dev/null 2>&1 || { echo "Error: git is required." >&2; exit 127; }
command -v docker >/dev/null 2>&1 || { echo "Error: Docker Desktop or Docker Engine is required." >&2; exit 127; }
docker compose version >/dev/null 2>&1 || { echo "Error: docker compose is required." >&2; exit 127; }

if [[ -e "$INSTALL_DIR" && ! -d "$INSTALL_DIR/.git" ]]; then
  echo "Error: install path exists and is not a Hanimo git checkout: $INSTALL_DIR" >&2
  exit 1
fi

FRESH_CLONE=0
if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  git clone --filter=blob:none --no-checkout "$REPOSITORY_URL" "$INSTALL_DIR"
  FRESH_CLONE=1
fi

git -C "$INSTALL_DIR" fetch --depth=1 origin "$PINNED_REF"
RESOLVED_REF="$(git -C "$INSTALL_DIR" rev-parse FETCH_HEAD)"
if [[ "$PINNED_REF" =~ ^[0-9a-fA-F]{40}$ && "$RESOLVED_REF" != "$PINNED_REF" ]]; then
  echo "Error: fetched revision does not match the requested commit." >&2
  exit 1
fi

if [[ "$FRESH_CLONE" -eq 0 && -n "$(git -C "$INSTALL_DIR" status --short)" ]]; then
  echo "Error: install checkout has local changes. Preserve them before continuing." >&2
  exit 1
fi

git -C "$INSTALL_DIR" checkout --detach "$RESOLVED_REF"
printf 'Installed source: %s\nInstall path: %s\n' "$RESOLVED_REF" "$INSTALL_DIR"

if [[ "$YES" -ne 1 && -t 0 ]]; then
  read -r -p "Start the Hanimo installer now? [Y/n] " answer
  [[ -z "$answer" || "$answer" =~ ^[Yy]$ ]] || exit 0
fi

exec "$INSTALL_DIR/scripts/install.sh" "${INSTALL_ARGS[@]}"
