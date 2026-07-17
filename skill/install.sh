#!/usr/bin/env bash
# Install the review-debrief skill so /review-debrief works in ANY Claude Code
# session. The skill is self-contained: it reads a session .jsonl and opens the
# hosted Session Debrief app with the session in the URL fragment. No repo, no
# build, no local server — just Node.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.claude/skills/review-debrief"

mkdir -p "$DEST"
cp "$SRC/SKILL.md" "$DEST/"
cp "$SRC/launch.mjs" "$DEST/"

# Remove artifacts from older installs that bundled the app + a local server.
rm -rf "$DEST/app" "$DEST/server.mjs" "$DEST/.home" "$DEST/.server.pid"

echo "Installed review-debrief → $DEST"
echo
echo "Run /review-debrief from any Claude Code session."
echo "Points at: ${SESSION_DEBRIEF_URL:-https://nehansikder.github.io/session-debrief/}"
