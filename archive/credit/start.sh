#!/usr/bin/env bash
# Unora / ProofLine monorepo bootstrap + launch.
#
# Usage:
#   ./start.sh                Start the Unora frontend dev server (default)
#   ./start.sh frontend       Same as above; extra args go to Vite
#                             (e.g. ./start.sh frontend --port 3000 --host)
#   ./start.sh contracts      Install Foundry deps if missing, run the Solidity
#                             test suite, then the local Anvil contract demo
#   ./start.sh test           Typecheck + run the TypeScript test suite
#
# The frontend needs a Privy app ID to enable login: copy app/.env.example to
# app/.env and paste your app ID from https://dashboard.privy.io. The server
# still starts without it — the app shows a setup notice instead of the login UI.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$ROOT/app"
CONTRACTS="$ROOT/contracts"

log()  { printf '\033[1;36m[start]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[start]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[start]\033[0m %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1 — install it, then re-run."; }

check_node() {
  need node
  local major
  major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  if [ "$major" -lt 22 ]; then
    warn "Node $(node -v) detected; this repo pins Node >= 22.9 (see package.json engines)."
  fi
}

start_frontend() {
  check_node
  need npm

  if [ ! -d "$APP/node_modules" ]; then
    if command -v bun >/dev/null 2>&1; then
      log "Installing frontend dependencies with bun..."
      (cd "$APP" && bun install)
    else
      warn "bun not found — falling back to npm install (the app is pinned with bun.lock)."
      (cd "$APP" && npm install)
    fi
  fi

  if ! grep -Eq '^VITE_PRIVY_APP_ID=.+' "$APP/.env" 2>/dev/null; then
    warn "VITE_PRIVY_APP_ID is not set in app/.env — login will show a setup notice."
    warn "Fix: cp $APP/.env.example $APP/.env, then paste your app ID from https://dashboard.privy.io"
  fi

  log "Starting Unora dev server → http://localhost:5173"
  cd "$APP"
  exec npm run dev -- "$@"
}

ensure_foundry_deps() {
  [ -d "$CONTRACTS/lib/forge-std" ] && [ -d "$CONTRACTS/lib/openzeppelin-contracts" ] && return 0
  need git
  log "Installing Foundry dependencies (forge-std v1.10.0, OpenZeppelin v5.4.0)..."
  # `forge install` fails when the project is a subdirectory of a larger git
  # repository ("Library directory is not relative to the repository root"),
  # which is the case in this monorepo — so clone the pinned releases directly.
  mkdir -p "$CONTRACTS/lib"
  [ -d "$CONTRACTS/lib/forge-std" ] || \
    git clone --quiet --depth 1 --branch v1.10.0 https://github.com/foundry-rs/forge-std "$CONTRACTS/lib/forge-std"
  [ -d "$CONTRACTS/lib/openzeppelin-contracts" ] || \
    git clone --quiet --depth 1 --branch v5.4.0 https://github.com/OpenZeppelin/openzeppelin-contracts "$CONTRACTS/lib/openzeppelin-contracts"
}

start_contracts() {
  need forge
  need python3

  cd "$CONTRACTS"
  ensure_foundry_deps

  log "Running the Solidity test suite..."
  forge test --root . -vv

  log "Running the local contract demo (starts its own Anvil, deploys 5 contracts, needs no secrets)..."
  exec python3 script/local-demo.py
}

run_tests() {
  check_node
  need npm

  if [ ! -d "$ROOT/node_modules" ]; then
    log "Installing backend tooling with npm..."
    (cd "$ROOT" && npm ci --ignore-scripts)
  fi

  log "Typechecking..."
  (cd "$ROOT" && npm run typecheck)

  # The indexer test diffs event signatures against Foundry's compiled artifacts.
  # contracts/out/ is gitignored, so a fresh clone needs one compile first.
  if [ ! -f "$CONTRACTS/out/AttestationRegistry.sol/AttestationRegistry.json" ]; then
    if command -v forge >/dev/null 2>&1; then
      ensure_foundry_deps
      log "Compiling contracts once so the indexer test can read event signatures..."
      (cd "$CONTRACTS" && forge build)
    else
      warn "forge not found and contracts/out/ is missing — the indexer-config test will fail."
      warn "Install Foundry (https://getfoundry.sh) or run './start.sh contracts' once."
    fi
  fi

  log "Running the TypeScript test suite..."
  cd "$ROOT"
  exec npm test
}

TARGET="${1:-frontend}"
if [ "$#" -gt 0 ]; then shift; fi

case "$TARGET" in
  frontend|app)      start_frontend "$@" ;;
  contracts|demo)    start_contracts ;;
  test|tests)        run_tests ;;
  -h|--help|help)    sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
  *) die "Unknown target '$TARGET'. Use: frontend (default), contracts, test — or --help." ;;
esac
