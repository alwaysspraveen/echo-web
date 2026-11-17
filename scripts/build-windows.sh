#!/usr/bin/env bash
# Builds the Windows installer for the Echo Music desktop app (Electron).
#
#   ./scripts/build-windows.sh
#
# Output: apps/desktop/release/Echo-Music-Setup-<version>.exe (64-bit, unsigned).
# Runs on macOS, Linux or Windows (Git Bash). Needs Node.js 22+ and internet access the first
# time (to download Electron for Windows and a Windows ffmpeg build).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

step() { printf '\n\033[1;31m==>\033[0m \033[1m%s\033[0m\n' "$1"; }

step "Checking Node.js"
node scripts/check-node.mjs
echo "Node $(node -v)"

step "Installing dependencies"
npm install --no-audit --no-fund

step "Building the web app"
npm run build

cd "$ROOT/apps/desktop"

step "Bundling the Electron main process and API server"
npm run bundle

step "Fetching ffmpeg for Windows (for MP3 downloads)"
node scripts/fetch-ffmpeg.mjs win32 x64

step "Packaging the Windows installer"
npx electron-builder --win nsis --x64

step "Done"
ls -lh release/*.exe
echo
echo "Installer: $ROOT/apps/desktop/release/$(cd release && ls -t *.exe | head -1)"
echo "It is unsigned: on first run Windows shows 'Windows protected your PC' -> More info -> Run anyway."
