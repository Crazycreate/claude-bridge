#!/usr/bin/env bash
#
# Generate documentation screenshots without leaking real conversation data
# or user paths. The script:
#   1. Backs up real bridge state (~/.claude-bridge) and AUTH_TOKEN
#   2. Spins the bridge up against a clean /tmp/mobileai-demo project
#      using a temporary AUTH_TOKEN
#   3. Drives the UI with Playwright and writes PNGs to docs/
#   4. Restores everything, even on failure
#
# Run from the repo root:  ./scripts/screenshots.sh

set -u
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_DIR=/tmp/mobileai-demo
BRIDGE_STATE_BACKUP=$(mktemp -d)
ENV_BACKUP=$(mktemp)
PLAYWRIGHT_DIR=/tmp/playwright-screenshot

cleanup() {
  echo "→ restoring bridge state…"
  cp "$ENV_BACKUP" "$PROJECT_ROOT/server/.env" 2>/dev/null
  rm -rf "$HOME/.claude-bridge"
  if [ -d "$BRIDGE_STATE_BACKUP/orig" ]; then
    mv "$BRIDGE_STATE_BACKUP/orig" "$HOME/.claude-bridge"
  fi
  rm -f "$ENV_BACKUP"
  rm -rf "$BRIDGE_STATE_BACKUP"
  cd "$PROJECT_ROOT" && ./scripts/bridge restart >/dev/null 2>&1
  echo "→ done."
}
trap cleanup EXIT

# 1. Backup
cp "$PROJECT_ROOT/server/.env" "$ENV_BACKUP"
[ -d "$HOME/.claude-bridge" ] && mv "$HOME/.claude-bridge" "$BRIDGE_STATE_BACKUP/orig"

# 2. Prep clean demo project + clean bridge state
mkdir -p "$DEMO_DIR/src"
cd "$DEMO_DIR"
[ -d .git ] || git init -q
cat > README.md <<'EOF'
# Demo Project

A throwaway repo used to render screenshots of the Claude Bridge UI.
EOF
cat > src/app.js <<'EOF'
export function greet(name) {
  return `Hello, ${name}!`;
}
EOF
mkdir -p "$HOME/.claude-bridge/sessions"

# Generate a stable demo token so the screenshot script can log in
DEMO_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
{
  echo "AUTH_TOKEN=$DEMO_TOKEN"
  echo "PORT=8787"
  echo "PROJECT_DIR=$DEMO_DIR"
  echo "PERMISSION_MODE=default"
} > "$PROJECT_ROOT/server/.env"

cd "$PROJECT_ROOT"
./scripts/bridge restart >/dev/null

# Poll /health until the bridge is actually ready to accept requests.
# `bridge start` returns as soon as the child PID exists, but the Express
# server can still be a couple of seconds away from listening.
for i in $(seq 1 20); do
  if curl -fsS -m 1 http://localhost:8787/health >/dev/null 2>&1; then
    echo "→ bridge ready"
    break
  fi
  sleep 0.5
done

# 3. Drive the UI
mkdir -p "$PROJECT_ROOT/docs"
node "$PLAYWRIGHT_DIR/shoot.mjs"
echo "→ screenshots written to $PROJECT_ROOT/docs/"
ls -lh "$PROJECT_ROOT/docs/"
