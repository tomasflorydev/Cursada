#!/usr/bin/env bash
# Renders build/icon-dark.svg into build/icon.png (1024x1024) and build/icon.icns.
# Requires rsvg-convert (brew install librsvg) and macOS iconutil.
# Usage: bash scripts/build-icons.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
SOURCE_SVG="$BUILD_DIR/icon-dark.svg"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "Error: rsvg-convert not found. Install it with: brew install librsvg" >&2
  exit 1
fi

if ! command -v iconutil >/dev/null 2>&1; then
  echo "Error: iconutil not found (it ships with macOS)." >&2
  exit 1
fi

if [ ! -f "$SOURCE_SVG" ]; then
  echo "Error: source icon not found at $SOURCE_SVG" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cursada-icons.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
ICONSET_DIR="$TMP_DIR/icon.iconset"
mkdir -p "$ICONSET_DIR"

render() {
  # $1 = pixel size, $2 = output file
  rsvg-convert --width "$1" --height "$1" --format png --output "$2" "$SOURCE_SVG"
}

# Apple iconset: each base size plus its @2x variant.
for size in 16 32 128 256 512; do
  render "$size" "$ICONSET_DIR/icon_${size}x${size}.png"
  render "$((size * 2))" "$ICONSET_DIR/icon_${size}x${size}@2x.png"
done

iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"
render 1024 "$BUILD_DIR/icon.png"

echo "Generated $BUILD_DIR/icon.png and $BUILD_DIR/icon.icns from $SOURCE_SVG"
