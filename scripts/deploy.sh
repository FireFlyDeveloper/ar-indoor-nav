#!/usr/bin/env bash
# Builds the project and serves it on a port different from the dev port.
# Usage: ./scripts/deploy.sh [port]   (default: 5174)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:-5174}"

echo "Building..."
npm run build

# Remove any prior serve
fuser -k "$PORT/tcp" 2>/dev/null || true

# Copy built dist + public/ to a served folder
DEST="/root/tmp/ar-indoor-nav-served"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -r dist/. "$DEST"/
cp -r public/. "$DEST"/ 2>/dev/null || true

echo "Serving on http://localhost:$PORT (PID: $(cd "$DEST" && (python3 -m http.server "$PORT" --bind 0.0.0.0 &> /tmp/ar-indoor-nav-serve.log & echo $!)))"
