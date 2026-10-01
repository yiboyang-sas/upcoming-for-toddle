#!/usr/bin/env bash
# Renders the Chrome Web Store screenshots and promo tiles from
# store/assets-src/render.html (which uses the extension's real UI code).
# Usage: scripts/render-store-assets.sh   (needs Google Chrome and Pillow)
set -euo pipefail

cd "$(dirname "$0")/../store"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT
URL="file://$(python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.path.abspath("assets-src/render.html")))')"

shoot() { # <shot> <width,height> <output>
  rm -f "$3"
  # Headless Chrome sometimes lingers after writing the file, so cap each run.
  (perl -e 'alarm shift; exec @ARGV' 30 "$CHROME" --headless=new --user-data-dir="$PROFILE" \
    --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --allow-file-access-from-files \
    --virtual-time-budget=2000 --window-size="$2" --screenshot="$PWD/$3" "$URL?shot=$1"; :) \
    >/dev/null 2>&1 || true
  [ -s "$3" ] || { echo "failed to render $3" >&2; exit 1; }
  # The store wants JPEG or 24-bit PNG without alpha.
  python3 -c 'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[1])' "$3"
  echo "rendered store/$3"
}

shoot 1 1280,800 screenshot-1-popup.png
shoot 2 1280,800 screenshot-2-in-page.png
shoot 3 1280,800 screenshot-3-badge-dark.png
shoot 4 1280,800 screenshot-4-filter.png
shoot tile 440,280 promo-small-440x280.png
shoot marquee 1400,560 promo-marquee-1400x560.png
