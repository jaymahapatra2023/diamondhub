#!/usr/bin/env bash
# DiamondHub Frontend Deploy Script
# Builds the Vite SPA and pushes to S3, then invalidates CloudFront.
#
# Usage:
#   ./infra/deploy-frontend.sh <S3_BUCKET> <CF_DISTRIBUTION_ID> <API_URL>
#
# Example:
#   ./infra/deploy-frontend.sh diamondhub-web-abc123 E1ABCDEF123 https://api.diamondhub.app

set -euo pipefail

S3_BUCKET="${1:?Usage: deploy-frontend.sh <S3_BUCKET> <CF_DISTRIBUTION_ID> <API_URL>}"
CF_DIST_ID="${2:?Missing CF_DISTRIBUTION_ID}"
API_URL="${3:?Missing API_URL (e.g. https://api.yourdomain.com)}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"

echo "▸ Building frontend (API_URL=$API_URL)..."
cd "$REPO_ROOT"
VITE_API_URL="$API_URL" pnpm --filter @diamondhub/web build

echo "▸ Uploading static assets (immutable cache)..."
aws s3 sync "$WEB_DIR/dist/" "s3://$S3_BUCKET/" \
  --delete \
  --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable" \
  --quiet

echo "▸ Uploading index.html (no-cache)..."
aws s3 cp "$WEB_DIR/dist/index.html" "s3://$S3_BUCKET/index.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --content-type "text/html"

echo "▸ Invalidating CloudFront cache..."
INV_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CF_DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)

echo ""
echo "✓ Frontend deployed"
echo "  Invalidation ID: $INV_ID"
echo "  URL: https://$(aws cloudfront get-distribution --id $CF_DIST_ID --query 'Distribution.DomainName' --output text)"
