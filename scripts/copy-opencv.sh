#!/bin/bash
set -euo pipefail
SRC="node_modules/@techstark/opencv-js/dist/opencv.js"
DEST="public/opencv/opencv.js"
if [ ! -f "$SRC" ]; then
  echo "WARN: $SRC not found, skipping OpenCV.js copy" >&2
  exit 0
fi
mkdir -p public/opencv
cp "$SRC" "$DEST"
# Portable sed -i: works on both GNU (Linux) and BSD (macOS)
if sed --version >/dev/null 2>&1; then
  sed -i 's/}(this,/}(globalThis,/' "$DEST"
else
  sed -i '' 's/}(this,/}(globalThis,/' "$DEST"
fi
if grep -q '}(this,' "$DEST"; then
  echo "ERROR: OpenCV.js patch incomplete — '}(this,' still present in $DEST" >&2
  exit 1
fi
if ! grep -q '}(globalThis,' "$DEST"; then
  echo "ERROR: OpenCV.js patch failed — '}(globalThis,' not found in $DEST" >&2
  exit 1
fi
echo "OpenCV.js patched successfully"
