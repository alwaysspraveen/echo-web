#!/usr/bin/env bash
# Publishes a new Echo Music desktop version. Installed apps (Mac and Windows) offer it as an update.
#
#   ./scripts/release.sh 0.2.1
#
# Builds the Mac .dmg and the Windows installer, then creates the GitHub release v<version> on
# alwaysspraveen/echo-web with the files the in-app updater needs. Uses the `gh` CLI; set GH_TOKEN
# to pick the GitHub account (e.g. GH_TOKEN=$(gh auth token -u alwaysspraveen)).
set -euo pipefail

VERSION="${1:?Usage: ./scripts/release.sh <version>, e.g. 0.2.1}"
VERSION="${VERSION#v}"
REPO="alwaysspraveen/echo-web"

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
DESKTOP="$ROOT/apps/desktop"

step() { printf '\n\033[1;31m==>\033[0m \033[1m%s\033[0m\n' "$1"; }

if gh release view "v$VERSION" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release v$VERSION already exists on $REPO. Pick a higher version." >&2
  exit 1
fi

step "Setting version $VERSION"
node -e "const f='$DESKTOP/package.json';const p=require(f);p.version='$VERSION';require('fs').writeFileSync(f, JSON.stringify(p,null,2)+'\n')"

step "Building macOS (.dmg)"
(cd "$DESKTOP" && npm run dist:mac)

step "Building Windows (installer)"
./scripts/build-windows.sh

cd "$DESKTOP/release"
FILES=(
  "Echo-Music-$VERSION-arm64.dmg"
  "Echo-Music-$VERSION-arm64.dmg.blockmap"
  "Echo-Music-Setup-$VERSION.exe"
  "Echo-Music-Setup-$VERSION.exe.blockmap"
  "latest.yml"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || { echo "Missing build output: $f" >&2; exit 1; }; done

step "Publishing GitHub release v$VERSION"
gh release create "v$VERSION" "${FILES[@]}" --repo "$REPO" --title "Echo Music $VERSION" \
  --notes "Echo Music $VERSION for macOS (Apple Silicon) and Windows. Installed apps update automatically."

step "Done"
echo "Released https://github.com/$REPO/releases/tag/v$VERSION"
