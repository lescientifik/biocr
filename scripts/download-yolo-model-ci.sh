#!/bin/bash
# Downloads the pre-exported YOLO11n-doclaynet ONNX model for CI.
# Tries the ONNX directly from HuggingFace first, falls back to .pt + export.
set -e

MODEL_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/models"
MODEL_FILE="$MODEL_DIR/yolo11n-doclaynet.onnx"

if [ -f "$MODEL_FILE" ]; then
  echo "Model already exists at $MODEL_FILE"
  exit 0
fi

mkdir -p "$MODEL_DIR"

# Try direct ONNX download (exported model hosted on HuggingFace)
echo "Downloading yolo11n-doclaynet.onnx from HuggingFace..."
curl -fSL -o "$MODEL_FILE" \
  "https://huggingface.co/hantian/yolo-doclaynet/resolve/main/yolov11n-doclaynet.onnx" \
  2>/dev/null && {
    echo "Model downloaded to $MODEL_FILE ($(du -h "$MODEL_FILE" | cut -f1))"
    exit 0
  }

# Fallback: download .pt and export with ultralytics
echo "ONNX not available directly, falling back to .pt export..."
pip install ultralytics onnx
PT_FILE="$(mktemp /tmp/yolov11n-doclaynet.XXXXXX.pt)"
curl -fSL -o "$PT_FILE" \
  "https://huggingface.co/hantian/yolo-doclaynet/resolve/main/yolov11n-doclaynet.pt"

python3 -c "
from ultralytics import YOLO
model = YOLO('$PT_FILE')
model.export(format='onnx', opset=12, dynamic=False, imgsz=640)
"

ONNX_FILE="${PT_FILE%.pt}.onnx"
mv "$ONNX_FILE" "$MODEL_FILE"
rm -f "$PT_FILE"

echo "Model exported to $MODEL_FILE ($(du -h "$MODEL_FILE" | cut -f1))"
