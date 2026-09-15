#!/usr/bin/env bash
# =============================================================================
# Onemail — First-time Cloudflare setup
# Run once after cloning. Provisions D1, KV namespaces, R2 bucket, and
# patches wrangler.toml with the real IDs.
# =============================================================================
set -euo pipefail

WORKER_DIR="apps/worker"
WRANGLER="$WORKER_DIR/node_modules/.bin/wrangler"

echo ""
echo "██████████  Onemail Setup  ██████████"
echo ""

# ── 1. Install dependencies ────────────────────────────────
echo "→ Installing dependencies..."
npm install --workspaces --if-present

# ── 2. Authenticate with Cloudflare ───────────────────────
echo ""
echo "→ Checking Cloudflare authentication..."
$WRANGLER whoami || $WRANGLER login

# ── 3. D1 database ────────────────────────────────────────
echo ""
echo "→ Creating D1 database 'onemail-db'..."
DB_OUTPUT=$($WRANGLER d1 create onemail-db 2>&1 || true)
DB_ID=$(echo "$DB_OUTPUT" | grep -oE 'database_id = "[a-f0-9-]+"' | grep -oE '[a-f0-9-]{36}' | head -1)

if [ -z "$DB_ID" ]; then
  # Already exists — fetch ID
  DB_ID=$($WRANGLER d1 list --json 2>/dev/null | python3 -c "import sys,json; dbs=json.load(sys.stdin); print(next(d['uuid'] for d in dbs if d['name']=='onemail-db'))" 2>/dev/null || echo "")
fi

if [ -n "$DB_ID" ]; then
  echo "  D1 ID: $DB_ID"
  sed -i.bak "s/REPLACE_WITH_YOUR_D1_DATABASE_ID/$DB_ID/g" "$WORKER_DIR/wrangler.toml"
  rm -f "$WORKER_DIR/wrangler.toml.bak"
else
  echo "  Could not determine D1 ID. Set it manually in $WORKER_DIR/wrangler.toml"
fi

# ── 4. KV namespaces ──────────────────────────────────────
echo ""
echo "→ Creating KV namespace 'SESSIONS'..."
KV_SESSIONS_OUTPUT=$($WRANGLER kv namespace create SESSIONS 2>&1 || true)
KV_SESSIONS_ID=$(echo "$KV_SESSIONS_OUTPUT" | grep -oE 'id = "[a-f0-9]+"' | grep -oE '[a-f0-9]{32}' | head -1)

echo "→ Creating KV namespace 'SESSIONS_preview'..."
KV_SESSIONS_PREV_OUTPUT=$($WRANGLER kv namespace create SESSIONS --preview 2>&1 || true)
KV_SESSIONS_PREV_ID=$(echo "$KV_SESSIONS_PREV_OUTPUT" | grep -oE 'id = "[a-f0-9]+"' | grep -oE '[a-f0-9]{32}' | head -1)

echo "→ Creating KV namespace 'OAUTH_STATE'..."
KV_STATE_OUTPUT=$($WRANGLER kv namespace create OAUTH_STATE 2>&1 || true)
KV_STATE_ID=$(echo "$KV_STATE_OUTPUT" | grep -oE 'id = "[a-f0-9]+"' | grep -oE '[a-f0-9]{32}' | head -1)

echo "→ Creating KV namespace 'OAUTH_STATE_preview'..."
KV_STATE_PREV_OUTPUT=$($WRANGLER kv namespace create OAUTH_STATE --preview 2>&1 || true)
KV_STATE_PREV_ID=$(echo "$KV_STATE_PREV_OUTPUT" | grep -oE 'id = "[a-f0-9]+"' | grep -oE '[a-f0-9]{32}' | head -1)

for PAIR in "REPLACE_WITH_YOUR_KV_SESSIONS_ID:$KV_SESSIONS_ID" \
            "REPLACE_WITH_YOUR_KV_SESSIONS_PREVIEW_ID:$KV_SESSIONS_PREV_ID" \
            "REPLACE_WITH_YOUR_KV_OAUTH_STATE_ID:$KV_STATE_ID" \
            "REPLACE_WITH_YOUR_KV_OAUTH_STATE_PREVIEW_ID:$KV_STATE_PREV_ID"; do
  PLACEHOLDER="${PAIR%%:*}"
  VALUE="${PAIR##*:}"
  if [ -n "$VALUE" ]; then
    sed -i.bak "s/$PLACEHOLDER/$VALUE/g" "$WORKER_DIR/wrangler.toml"
    rm -f "$WORKER_DIR/wrangler.toml.bak"
  fi
done

# ── 5. R2 bucket ───────────────────────────────────────────
echo ""
echo "→ Creating R2 bucket 'onemail-attachments'..."
$WRANGLER r2 bucket create onemail-attachments 2>&1 || true

# ── 6. Run migrations ─────────────────────────────────────
echo ""
echo "→ Running D1 migrations..."
$WRANGLER d1 migrations apply onemail-db --local

# ── 7. Copy env vars template ─────────────────────────────
echo ""
if [ ! -f "$WORKER_DIR/.dev.vars" ]; then
  cp .dev.vars.example "$WORKER_DIR/.dev.vars"
  echo "→ Created $WORKER_DIR/.dev.vars — fill in your secrets before running 'npm run dev'"
else
  echo "→ $WORKER_DIR/.dev.vars already exists"
fi

# ── 8. Generate secret keys ────────────────────────────────
echo ""
echo "→ Generating secret key values (paste these into .dev.vars):"
echo "  SESSION_SECRET     = $(openssl rand -hex 32)"
echo "  TOKEN_ENCRYPTION_KEY = $(openssl rand -hex 32)"

echo ""
echo "████  Setup complete  ████"
echo ""
echo "Next steps:"
echo "  1. Fill in $WORKER_DIR/.dev.vars with your Google OAuth credentials"
echo "  2. Set APP_URL and WORKER_URL in .dev.vars"
echo "  3. Run: npm run dev"
echo ""
