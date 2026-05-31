#!/usr/bin/env bash
# DiamondHub SSH Deploy Script
# Pulls latest code, rebuilds, migrates, and zero-downtime reloads PM2.
#
# Usage:
#   ./infra/deploy.sh <SERVER_IP> <PATH_TO_PEM_KEY> [branch]
#
# Example:
#   ./infra/deploy.sh 52.10.20.30 ~/.ssh/diamondhub-key.pem main

set -euo pipefail

SERVER_IP="${1:?Usage: deploy.sh <SERVER_IP> <KEY_PATH> [branch]}"
KEY_PATH="${2:?Missing key path}"
BRANCH="${3:-main}"
APP_DIR="/app/diamondhub"

echo "▸ Deploying branch '$BRANCH' → $SERVER_IP"

ssh -i "$KEY_PATH" \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=15 \
  ubuntu@"$SERVER_IP" \
  BRANCH="$BRANCH" APP_DIR="$APP_DIR" \
  'bash -s' << 'REMOTE'
set -euo pipefail
cd "$APP_DIR"

echo "--- Pulling $BRANCH"
git fetch origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "--- Installing dependencies"
pnpm install --frozen-lockfile --silent

echo "--- Building"
pnpm --filter @diamondhub/db build
pnpm --filter @diamondhub/contracts build
pnpm --filter @diamondhub/workers build
pnpm --filter @diamondhub/api build

echo "--- Migrating database"
set -a; source .env; set +a
pnpm --filter @diamondhub/db migrate:deploy

echo "--- Reloading PM2 (zero-downtime)"
pm2 reload ecosystem.config.cjs --update-env

echo ""
pm2 status
echo ""
echo "✓ Deploy complete"
REMOTE
