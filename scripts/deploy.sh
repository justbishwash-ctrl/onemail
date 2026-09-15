#!/usr/bin/env bash
# =============================================================================
# Onemail — Production deployment
# Builds the frontend and deploys worker + pages.
# =============================================================================
set -euo pipefail

WORKER_DIR="apps/worker"
WEB_DIR="apps/web"
WRANGLER="$WORKER_DIR/node_modules/.bin/wrangler"

echo ""
echo "██████████  Onemail Deploy  ██████████"
echo ""

# ── 1. Run D1 migrations first ────────────────────────────
echo "→ Applying D1 migrations..."
$WRANGLER d1 migrations apply onemail-db --cwd "$WORKER_DIR"

# ── 2. Set production secrets (idempotent) ────────────────
echo ""
echo "→ Uploading Worker secrets..."
echo "  (secrets are read from environment variables CI_* or prompted)"

for SECRET in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SESSION_SECRET TOKEN_ENCRYPTION_KEY APP_URL WORKER_URL; do
  VAL="${!SECRET:-}"
  if [ -n "$VAL" ]; then
    echo "$VAL" | $WRANGLER secret put "$SECRET" --cwd "$WORKER_DIR" --env production
  else
    echo "  Skipping $SECRET (not set in environment)"
  fi
done

# ── 3. Deploy Worker ──────────────────────────────────────
echo ""
echo "→ Deploying Cloudflare Worker..."
$WRANGLER deploy --cwd "$WORKER_DIR" --env production

# ── 4. Build frontend ─────────────────────────────────────
echo ""
echo "→ Building frontend..."
npm run build --workspace "$WEB_DIR"

# ── 5. Deploy to Cloudflare Pages ─────────────────────────
echo ""
echo "→ Deploying to Cloudflare Pages..."
$WRANGLER pages deploy "$WEB_DIR/dist" \
  --project-name onemail \
  --branch main \
  --cwd "$WORKER_DIR"

echo ""
echo "████  Deploy complete  ████"
echo ""
