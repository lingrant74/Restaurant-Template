#!/usr/bin/env bash
# Installs the repo's git hooks into .git/hooks.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cp "$ROOT/scripts/pre-commit" "$ROOT/.git/hooks/pre-commit"
chmod +x "$ROOT/.git/hooks/pre-commit"
echo "Installed pre-commit hook (blocks sk_/rk_ Stripe keys)."
