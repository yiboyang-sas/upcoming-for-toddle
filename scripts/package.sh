#!/usr/bin/env bash
# Runs the checks and builds the zip to upload to the Chrome Web Store.
# Usage: scripts/package.sh   ->   dist/upcoming-for-toddle-<version>.zip
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION="$(node -p 'require("./extension/manifest.json").version')"
OUT="dist/upcoming-for-toddle-${VERSION}.zip"

echo "== syntax"
find extension -name '*.js' -print0 | xargs -0 -n1 node --check

echo "== tests"
node tests/sync.test.mjs

echo "== manifest"
node -e '
  const m = require("./extension/manifest.json");
  const fs = require("fs");
  const problems = [];
  if (m.description.length > 132) problems.push(`description is ${m.description.length} chars (max 132)`);
  for (const p of Object.values(m.icons)) if (!fs.existsSync("extension/" + p)) problems.push(`missing icon ${p}`);
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  console.log(`${m.name} ${m.version}, permissions: ${m.permissions.join(", ")}`);
'

echo "== zip"
mkdir -p dist
rm -f "$OUT"
(cd extension && zip -qr -X "../$OUT" . -x '.*' -x '*/.*')
unzip -l "$OUT" | tail -n +4 | sed '$d' | sed '$d'
echo "built $OUT"
