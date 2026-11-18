#!/usr/bin/env bash
# Builds Echo Music for Android TV: apps/tv/android/app/build/outputs/apk/release/EchoMusicTV-<version>.apk
#
#   ./apps/tv/build.sh            # version from apps/desktop/package.json
#   ./apps/tv/build.sh install    # also install on the TV (adb connect <tv-ip>:5555 first)
#
# Needs: JDK 21 (JAVA_HOME), Android SDK with NDK 27.2.12479018 + CMake 3.22.1 (ANDROID_HOME).
set -euo pipefail
cd "$(dirname "$0")"
TV="$(pwd)"; ROOT="$(cd ../.. && pwd)"
step() { printf '\n\033[1;31m==>\033[0m \033[1m%s\033[0m\n' "$1"; }

VERSION=$(node -p "require('$ROOT/apps/desktop/package.json').version")
IFS=. read -r MA MI PA <<< "$VERSION"; CODE=$((MA * 10000 + MI * 100 + PA))

step "Node.js for Mobile"
if [ ! -f android/app/libnode/bin/armeabi-v7a/libnode.so ]; then
  mkdir -p .cache && cd .cache
  [ -f nodejs-mobile.zip ] || curl -fL -o nodejs-mobile.zip https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip
  rm -rf nm && mkdir nm && unzip -q nodejs-mobile.zip -d nm && mkdir -p ../android/app/libnode && cp -R nm/bin nm/include ../android/app/libnode/
  cd "$TV"
fi

step "Building the web app"
(cd "$ROOT" && npm run build -w apps/web)

step "Bundling the server (Node 18)"
node bundle.mjs
rm -rf android/app/src/main/assets/web && mkdir -p android/app/src/main/assets && cp -R "$ROOT/apps/web/dist" android/app/src/main/assets/web

step "Building the APK ($VERSION)"
cd android
[ -f local.properties ] || echo "sdk.dir=${ANDROID_HOME:-$HOME/Library/Android/sdk}" > local.properties
./gradlew -q assembleRelease -PechoVersionName="$VERSION" -PechoVersionCode="$CODE"
OUT=app/build/outputs/apk/release
mv -f "$OUT/app-release.apk" "$OUT/EchoMusicTV-$VERSION.apk"
ls -lh "$OUT/EchoMusicTV-$VERSION.apk"

if [ "${1:-}" = install ]; then
  step "Installing on the TV"
  adb install -r "$OUT/EchoMusicTV-$VERSION.apk"
fi
echo "APK: $TV/android/$OUT/EchoMusicTV-$VERSION.apk"
