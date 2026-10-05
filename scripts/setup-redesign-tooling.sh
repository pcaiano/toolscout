#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require node
require npm
require git

SKILLS_CLI_VERSION="1.5.26"
TASTE_SOURCE="https://github.com/Leonxlnx/taste-skill/tree/ce26fc25c0e5e8cab638f883de62d9a86ee5e45b"

install_skill() {
  local source="$1"
  local skill="$2"
  echo "Installing $skill"
  npx --yes "skills@${SKILLS_CLI_VERSION}" add "$source" --skill "$skill" --agent codex --yes
}

install_skill "$TASTE_SOURCE" "design-taste-frontend"
install_skill "$TASTE_SOURCE" "redesign-existing-projects"
install_skill "$TASTE_SOURCE" "image-to-code"

node scripts/verify-redesign-tooling.mjs

cat <<'EOF'

ToolScout redesign tooling is ready for Codex.

Installed or refreshed upstream project skills:
  .agents/skills/design-taste-frontend
  .agents/skills/redesign-existing-projects
  .agents/skills/image-to-code
  .agents/skills/web-design-guidelines (ToolScout wrapper is already committed)

Already configured in .codex/config.toml:
  Context7 MCP
  Chrome DevTools MCP

Restart Codex after the first install so it discovers the new project skills.
EOF
