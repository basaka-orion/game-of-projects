#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="WormholeLandlord"
BUNDLE_ID="com.openbasaka.simplify.05264051r1sw0c"
MIN_SYSTEM_VERSION="14.0"
DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ARTIFACTS_DIR="$ROOT_DIR/artifacts"
LOG_FILE="$ARTIFACTS_DIR/native-macos-build.log"
SCREENSHOT="$ARTIFACTS_DIR/native-macos-window.png"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_BINARY="$APP_MACOS/$APP_NAME"
INFO_PLIST="$APP_CONTENTS/Info.plist"

mkdir -p "$ARTIFACTS_DIR"
: >"$LOG_FILE"

log() {
  printf "%s\n" "$*" | tee -a "$LOG_FILE"
}

run() {
  log "$ $*"
  DEVELOPER_DIR="$DEVELOPER_DIR" "$@" 2>&1 | tee -a "$LOG_FILE"
}

if [[ ! -x "$DEVELOPER_DIR/usr/bin/xcodebuild" ]]; then
  log "missing Xcode at $DEVELOPER_DIR"
  exit 1
fi

pkill -x "$APP_NAME" >/dev/null 2>&1 || true

cd "$ROOT_DIR"
run swift test
run swift build
BUILD_BINARY="$(DEVELOPER_DIR="$DEVELOPER_DIR" swift build --show-bin-path)/$APP_NAME"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_MACOS"
cp "$BUILD_BINARY" "$APP_BINARY"
chmod +x "$APP_BINARY"

cat >"$INFO_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleName</key>
  <string>Wormhole Landlord</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>$MIN_SYSTEM_VERSION</string>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
PLIST

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

case "$MODE" in
  run)
    open_app
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    open_app
    sleep 2
    pgrep -x "$APP_NAME" >/dev/null
    /usr/sbin/screencapture -x "$SCREENSHOT" >/dev/null 2>&1 || true
    log "Wormhole Landlord macOS build and launch passed"
    echo "process=$APP_NAME"
    echo "app=$APP_BUNDLE"
    if [[ -s "$SCREENSHOT" ]]; then
      echo "screenshot=$SCREENSHOT"
    fi
    echo "log=$LOG_FILE"
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
