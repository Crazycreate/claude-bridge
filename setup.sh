#!/usr/bin/env bash
#
# One-shot setup for mobileai.
# Checks prerequisites, generates a fresh AUTH_TOKEN, installs npm deps,
# and builds the production frontend. Idempotent — safe to re-run.
#
# Usage:
#   ./setup.sh

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

c_red()   { printf '\033[31m%s\033[0m' "$*"; }
c_green() { printf '\033[32m%s\033[0m' "$*"; }
c_blue()  { printf '\033[34m%s\033[0m' "$*"; }
c_bold()  { printf '\033[1m%s\033[0m' "$*"; }
step()    { printf "\n%s %s\n" "$(c_blue '==>')" "$(c_bold "$*")"; }
ok()      { printf "%s %s\n" "$(c_green '✓')" "$*"; }
warn()    { printf "%s %s\n" "$(c_red '!')" "$*"; }

# 1. Node version check ------------------------------------------------------
step "Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  warn "Node not found. Install Node 18+ first: https://nodejs.org/"
  exit 1
fi
node_major=$(node --version | sed 's/^v//' | cut -d. -f1)
if [ "$node_major" -lt 18 ]; then
  warn "Node $(node --version) is too old. Need 18 or newer."
  exit 1
fi
ok "Node $(node --version)"

# 2. git presence (server uses it for the topbar pill) -----------------------
step "Checking git"
if command -v git >/dev/null 2>&1; then
  ok "git $(git --version | awk '{print $3}')"
else
  warn "git not found — the per-session 'branch · N dirty' topbar pill will be disabled. Install git to enable it."
fi

# 3. .env -------------------------------------------------------------------
step "Configuring server/.env"
if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  token=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
  # In-place edit that works on both GNU sed and BSD/macOS sed
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^AUTH_TOKEN=.*|AUTH_TOKEN=$token|" server/.env
  else
    sed -i '' "s|^AUTH_TOKEN=.*|AUTH_TOKEN=$token|" server/.env
  fi
  ok "Generated a fresh AUTH_TOKEN and wrote server/.env"
  echo "    Your token: $(c_bold "$token")"
else
  ok "server/.env already exists — leaving it alone"
fi

# 4. npm install ------------------------------------------------------------
step "Installing dependencies (this can take a minute)"
npm install --silent
ok "Dependencies installed"

# 5. Build frontend ---------------------------------------------------------
step "Building the production frontend"
npm run build:web --silent
ok "Frontend built to frontend/dist/"

# 6. Claude credential reminder ---------------------------------------------
step "Claude Code authentication"
if command -v claude >/dev/null 2>&1; then
  ok "claude CLI found — the bridge will reuse its login (run \`claude login\` if not yet authenticated)"
else
  cat <<EOF
   Choose one of:
   ${c_bold "(A)"} Reuse your Claude.ai subscription via the CLI:
       npm i -g @anthropic-ai/claude-code
       claude login
   ${c_bold "(B)"} Use an Anthropic API key:
       echo 'ANTHROPIC_API_KEY=sk-ant-…' >> server/.env
EOF
fi

# 7. Done -------------------------------------------------------------------
cat <<EOF

$(c_green '🎉  Setup complete.')

  $(c_bold 'Start it:')                    ./scripts/bridge start
  $(c_bold 'Open in a browser:')            http://localhost:8787
  $(c_bold 'Reveal your token:')           ./scripts/bridge token
  $(c_bold 'See the status:')              ./scripts/bridge status
  $(c_bold 'Stop:')                        ./scripts/bridge stop

To expose to your phone, see the README — two paths: direct LAN/VPS, or
Tailscale/tunnel for corporate-network situations.
EOF
