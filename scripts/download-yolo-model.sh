#!/bin/bash
# Downloads the YOLO11n-doclaynet model from HuggingFace and exports it to ONNX
# Requires: pip install ultralytics onnx
set -e

MODEL_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/models"
MODEL_FILE="$MODEL_DIR/yolo11n-doclaynet.onnx"

if [ -f "$MODEL_FILE" ]; then
  echo "Model already exists at $MODEL_FILE"
  exit 0
fi

mkdir -p "$MODEL_DIR"

echo "Downloading yolov11n-doclaynet.pt from HuggingFace..."
PT_FILE="$(mktemp /tmp/yolov11n-doclaynet.XXXXXX.pt)"
curl -L -o "$PT_FILE" \
  "https://huggingface.co/hantian/yolo-doclaynet/resolve/main/yolov11n-doclaynet.pt"

echo "Exporting to ONNX (opset 12, input 640x640)..."
python3 -c "
from ultralytics import YOLO
model = YOLO('$PT_FILE')
model.export(format='onnx', opset=12, dynamic=False, imgsz=640)
"

ONNX_FILE="${PT_FILE%.pt}.onnx"
mv "$ONNX_FILE" "$MODEL_FILE"
rm -f "$PT_FILE"

echo "Model exported to $MODEL_FILE ($(du -h "$MODEL_FILE" | cut -f1))"
