#!/bin/sh
# Publish main: check it, then fast-forward the production branch to it. The push to production starts
# .github/workflows/deploy.yml, which builds the game and deploys it to https://aimfeld.github.io/dark-planet/
# Usage: bin/deploy.sh
set -eu
cd "$(dirname "$0")/.."

fail() { echo "deploy: $*" >&2; exit 1; }

[ "$(git branch --show-current)" = main ] || fail "not on main"
git diff --quiet HEAD || fail "uncommitted changes; commit or stash them first"

git fetch --quiet origin
git merge-base --is-ancestor origin/main main || fail "main is behind origin/main; pull first"
if git rev-parse --quiet --verify origin/production >/dev/null; then
  git merge-base --is-ancestor origin/production main || fail "production has commits that main doesn't; merge them into main first"
  [ "$(git rev-parse origin/production)" != "$(git rev-parse main)" ] || fail "production is already at main"
  echo "Deploying:"
  git log --oneline origin/production..main
fi

# The CI build only type-checks; the tests run here because some need original_source/ (local only).
(cd game && npm test && npm run build)

git push origin main main:production
echo "Pushed main to production: https://github.com/aimfeld/dark-planet/actions/workflows/deploy.yml"

# Follow the deploy run when the GitHub CLI is available (the run takes a few seconds to appear).
command -v gh >/dev/null || exit 0
sha=$(git rev-parse main)
for _ in 1 2 3 4 5 6 7 8 9 10; do
  run=$(gh run list --workflow deploy.yml --branch production --commit "$sha" --limit 1 --json databaseId --jq '.[0].databaseId')
  [ -n "$run" ] && exec gh run watch "$run" --exit-status
  sleep 3
done
echo "deploy: the run hasn't appeared yet; check the link above"
