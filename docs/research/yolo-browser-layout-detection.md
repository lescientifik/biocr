---
description: Research on running YOLO-based document layout detection in the browser using ONNX Runtime Web, covering model selection, inference pipeline, and implementation details.
---

# YOLO Document Layout Detection in the Browser

## 1. Model Selection for Document Layout Analysis

### DocLayNet Dataset & Class Labels

[DocLayNet](https://github.com/DS4SD/DocLayNet) is the gold-standard dataset for document layout analysis: 80,863 pages with 11 class labels:

| Index | Label          | Relevance to Medical Labs |
|-------|----------------|---------------------------|
| 0     | Caption        | Low                       |
| 1     | Footnote       | Low                       |
| 2     | Formula        | Low                       |
| 3     | List-item      | Medium (result lists)     |
| 4     | Page-footer    | Low                       |
| 5     | Page-header    | Medium (patient info)     |
| 6     | Picture        | Low                       |
| 7     | Section-header | High (test categories)    |
| 8     | Table          | High (lab results)        |
| 9     | Text           | Medium                    |
| 10    | Title          | High (document title)     |

### Model Comparison

**Option A: yolo-doclaynet (hantian/yolo-doclaynet on HuggingFace)**

Pre-trained YOLO models on DocLayNet by [ppaanngggg](https://github.com/ppaanngggg/yolo-doclaynet). Multiple YOLO generations available:

| Model         | Params | mAP50-95 | Notes                         |
|---------------|--------|----------|-------------------------------|
| YOLOv11n      | 2.6M   | ~0.72    | Best size/perf for browser    |
| YOLOv11s      | 9.4M   | ~0.76    | Good middle ground            |
| YOLOv11m      | 20.1M  | ~0.78    | Too large for browser         |
| YOLOv8n       | 3.2M   | ~0.68    | Older, smaller                |
| YOLOv10n      | 2.3M   | ~0.70    | NMS-free architecture         |
| YOLOv12n      | 2.6M   | ~0.73    | Latest, attention-based       |
| YOLOv26n      | 2.4M   | ~0.74    | Newest available              |

**Option B: DocLayout-YOLO (opendatalab)**

Based on YOLOv10 with document-specific architectural optimizations. State-of-the-art results:
- DocLayNet mAP: 79.7% (with DocSynth300K pretraining)
- 85.5 FPS inference speed (GPU)
- Uses a "Global-to-Local Controllability module"
- ONNX version available at [wybxc/DocLayout-YOLO-DocStructBench-onnx](https://huggingface.co/wybxc/DocLayout-YOLO-DocStructBench-onnx)

### Recommendation

**For browser deployment: YOLOv11n-doclaynet** (2.6M params, ~5-6MB ONNX).

Rationale:
- Nano models are the only practical choice for browser inference (~5-6MB ONNX vs 40MB+ for large)
- YOLOv11n outperforms YOLOv8n significantly at similar parameter count
- YOLOv10n is also attractive because it has built-in NMS (no separate NMS model needed), but YOLOv11n has higher accuracy
- DocLayout-YOLO is best accuracy-wise but only ships as a single large model (~30MB+), not ideal for browser

**Alternative: DocLayout-YOLO-DocStructBench-onnx** if higher accuracy is critical and you can tolerate larger model size. It detects 10 categories fine-tuned specifically for document structure.

## 2. Running YOLO in the Browser with ONNX Runtime Web

### NPM Setup

```bash
npm install onnxruntime-web
# or
bun add onnxruntime-web
```

Current stable version: `1.20.x` (as of early 2026). Pin to a specific version to avoid WASM/JS mismatch issues.

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/onnxruntime-web/dist/*.wasm',
          dest: '.'
        }
      ]
    })
  ],
  optimizeDeps: {
    exclude: ['onnxruntime-web']  // Don't pre-bundle
  },
  assetsInclude: ['**/*.onnx'],   // Treat .onnx as static assets
});
```

Alternatively, set WASM paths to a CDN to avoid bundling issues entirely:

```typescript
import * as ort from 'onnxruntime-web';

// Point to CDN instead of local files
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/';
```

### Creating an Inference Session

```typescript
import * as ort from 'onnxruntime-web';

// Configure before creating session
ort.env.wasm.numThreads = 1; // Set to 1 to avoid SharedArrayBuffer/COOP/COEP issues
// ort.env.wasm.proxy = true; // Run inference in a built-in web worker (not compatible with WebGPU)

const session = await ort.InferenceSession.create('/models/yolov11n-doclaynet.onnx', {
  executionProviders: ['webgpu', 'wasm'],  // Falls back to wasm if webgpu unavailable
});
```

### WebGPU vs WASM Backend Tradeoffs

| Aspect         | WebGPU                          | WASM (CPU)                    |
|----------------|---------------------------------|-------------------------------|
| Speed          | 3-10x faster                    | Baseline                     |
| Browser support| Chrome 113+, Edge 113+          | Universal                    |
| Threading      | N/A (GPU)                       | Needs `crossOriginIsolated`  |
| Compatibility  | No proxy worker support         | Full proxy support           |
| Maturity       | Newer, some ops unsupported     | All ONNX ops supported      |
| Recommendation | Primary for capable browsers    | Fallback                     |

**Practical advice**: List `['webgpu', 'wasm']` as execution providers. ORT will try WebGPU first and fall back to WASM automatically.

## 3. Pre/Post Processing Pipeline

### Image Preprocessing

The YOLO model expects input as a `Float32` tensor of shape `[1, 3, 640, 640]` (batch, channels, height, width) with pixel values normalized to `[0, 1]`.

**Using Canvas API (no OpenCV.js dependency):**

```typescript
function preprocessImage(
  imageData: ImageData,
  modelWidth: number,
  modelHeight: number
): { tensor: ort.Tensor; xRatio: number; yRatio: number } {
  const { width, height, data } = imageData;

  // Letterbox: pad to square, then resize
  const maxDim = Math.max(width, height);
  const xRatio = maxDim / width;
  const yRatio = maxDim / height;

  // Create offscreen canvas for resize
  const canvas = new OffscreenCanvas(modelWidth, modelHeight);
  const ctx = canvas.getContext('2d')!;

  // Draw image scaled to fit model input (letterboxed)
  const scale = modelWidth / maxDim;
  ctx.drawImage(
    await createImageBitmap(imageData),
    0, 0, width * scale, height * scale
  );

  const resized = ctx.getImageData(0, 0, modelWidth, modelHeight);
  const pixels = resized.data; // RGBA flat array

  // Convert RGBA HWC -> RGB CHW normalized to [0,1]
  const totalPixels = modelWidth * modelHeight;
  const float32Data = new Float32Array(3 * totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    float32Data[i]                  = pixels[i * 4]     / 255.0; // R
    float32Data[i + totalPixels]    = pixels[i * 4 + 1] / 255.0; // G
    float32Data[i + 2 * totalPixels] = pixels[i * 4 + 2] / 255.0; // B
  }

  const tensor = new ort.Tensor('float32', float32Data, [1, 3, modelWidth, modelHeight]);
  return { tensor, xRatio, yRatio };
}
```

**Using OpenCV.js (more robust letterboxing):**

```typescript
import cv from '@techstark/opencv-js';

function preprocessWithOpenCV(
  source: HTMLImageElement,
  modelWidth: number,
  modelHeight: number
): { input: cv.Mat; xRatio: number; yRatio: number } {
  const mat = cv.imread(source);
  const matC3 = new cv.Mat(mat.rows, mat.cols, cv.CV_8UC3);
  cv.cvtColor(mat, matC3, cv.COLOR_RGBA2BGR);

  const maxSize = Math.max(matC3.rows, matC3.cols);
  const xPad = maxSize - matC3.cols;
  const yPad = maxSize - matC3.rows;
  const xRatio = maxSize / matC3.cols;
  const yRatio = maxSize / matC3.rows;

  const matPad = new cv.Mat();
  cv.copyMakeBorder(matC3, matPad, 0, yPad, 0, xPad, cv.BORDER_CONSTANT);

  const input = cv.blobFromImage(
    matPad,
    1 / 255.0,                              // normalize
    new cv.Size(modelWidth, modelHeight),    // resize
    new cv.Scalar(0, 0, 0),                 // no mean subtraction
    true,                                    // swapRB
    false                                    // no crop
  );

  mat.delete();
  matC3.delete();
  matPad.delete();
  return { input, xRatio, yRatio };
}
```

### Running Inference

```typescript
const inputName = session.inputNames[0];   // usually "images"
const outputName = session.outputNames[0]; // usually "output0"

const results = await session.run({ [inputName]: tensor });
const output = results[outputName];
```

### Post-Processing YOLO Output

YOLO output shape depends on the version:
- **YOLOv8/v11**: `[1, 84, 8400]` for COCO (80 classes) or `[1, 15, 8400]` for DocLayNet (11 classes). Format: `[batch, 4+num_classes, num_detections]`. Note: this is **transposed** compared to older YOLO versions.
- **YOLOv10**: `[1, 300, 15]` (built-in NMS, max 300 detections). Format: `[batch, num_detections, 4+1+num_classes]`.

**For YOLOv8/v11 (requires NMS):**

```typescript
interface Detection {
  x: number;
  y: number;
  width: number;
  height: number;
  classId: number;
  className: string;
  confidence: number;
}

const DOCLAYNET_CLASSES = [
  'Caption', 'Footnote', 'Formula', 'List-item', 'Page-footer',
  'Page-header', 'Picture', 'Section-header', 'Table', 'Text', 'Title'
];

function postprocess(
  output: ort.Tensor,
  imgWidth: number,
  imgHeight: number,
  xRatio: number,
  yRatio: number,
  confThreshold = 0.25,
  iouThreshold = 0.45
): Detection[] {
  const data = output.data as Float32Array;
  const [batch, numFields, numDetections] = output.dims; // [1, 15, 8400]
  const numClasses = numFields - 4;

  const candidates: Detection[] = [];

  for (let i = 0; i < numDetections; i++) {
    // Extract class scores (fields 4..14 for DocLayNet)
    let maxScore = 0;
    let maxClassId = 0;
    for (let c = 0; c < numClasses; c++) {
      const score = data[(4 + c) * numDetections + i];
      if (score > maxScore) {
        maxScore = score;
        maxClassId = c;
      }
    }

    if (maxScore < confThreshold) continue;

    // Extract box (cx, cy, w, h) and convert to (x, y, w, h)
    const cx = data[0 * numDetections + i];
    const cy = data[1 * numDetections + i];
    const w  = data[2 * numDetections + i];
    const h  = data[3 * numDetections + i];

    candidates.push({
      x: (cx - w / 2) * xRatio,
      y: (cy - h / 2) * yRatio,
      width: w * xRatio,
      height: h * yRatio,
      classId: maxClassId,
      className: DOCLAYNET_CLASSES[maxClassId],
      confidence: maxScore,
    });
  }

  // Apply NMS
  return nms(candidates, iouThreshold);
}

function nms(detections: Detection[], iouThreshold: number): Detection[] {
  // Sort by confidence descending
  detections.sort((a, b) => b.confidence - a.confidence);

  const kept: Detection[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < detections.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(detections[i]);

    for (let j = i + 1; j < detections.length; j++) {
      if (suppressed.has(j)) continue;
      if (iou(detections[i], detections[j]) > iouThreshold) {
        suppressed.add(j);
      }
    }
  }
  return kept;
}

function iou(a: Detection, b: Detection): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const aArea = a.width * a.height;
  const bArea = b.width * b.height;

  return intersection / (aArea + bArea - intersection);
}
```

**For YOLOv10 (NMS-free, simpler):**

```typescript
function postprocessV10(
  output: ort.Tensor,
  xRatio: number,
  yRatio: number,
  confThreshold = 0.25
): Detection[] {
  const data = output.data as Float32Array;
  const [batch, numDetections, numFields] = output.dims; // [1, 300, 15]
  const detections: Detection[] = [];

  for (let i = 0; i < numDetections; i++) {
    const offset = i * numFields;
    const x1 = data[offset];
    const y1 = data[offset + 1];
    const x2 = data[offset + 2];
    const y2 = data[offset + 3];
    const confidence = data[offset + 4];
    const classId = data[offset + 5];

    if (confidence < confThreshold) continue;

    detections.push({
      x: x1 * xRatio,
      y: y1 * yRatio,
      width: (x2 - x1) * xRatio,
      height: (y2 - y1) * yRatio,
      classId: Math.round(classId),
      className: DOCLAYNET_CLASSES[Math.round(classId)],
      confidence,
    });
  }
  return detections;
}
```

### Alternative: Separate NMS ONNX Model

The PyImageSearch tutorial uses a separate `nms.onnx` model to handle NMS on the ONNX side:

```typescript
const nmsSession = await ort.InferenceSession.create('/models/nms.onnx', {
  executionProviders: ['wasm']
});

const config = new ort.Tensor('float32', new Float32Array([
  100,   // topK
  0.45,  // iouThreshold
  0.25,  // scoreThreshold
]));

const { selected } = await nmsSession.run({
  detection: rawOutput,
  config: config,
});
```

This offloads NMS to optimized WASM but adds a second model file to host.

## 4. Practical Implementation Details

### ONNX Model Export (from Python)

```python
from ultralytics import YOLO

model = YOLO("yolov11n-doclaynet.pt")  # or download from HuggingFace
model.export(
    format="onnx",
    opset=12,       # Required for WebGPU compatibility
    dynamic=True,   # Flexible input shapes
    simplify=True,  # Reduce model complexity
)
# Produces yolov11n-doclaynet.onnx
```

### Model Hosting

Place the `.onnx` file in `public/models/`:

```
public/
  models/
    yolov11n-doclaynet.onnx   (~5-6MB)
    nms.onnx                   (~20KB, optional)
```

Vite serves files from `public/` as static assets at the root path. The model is fetched at `/models/yolov11n-doclaynet.onnx`.

For production, consider hosting on a CDN with proper `Cache-Control` headers since the model file won't change frequently.

### Web Worker Architecture

Running inference on the main thread blocks the UI. Use a dedicated Web Worker:

```typescript
// src/workers/layout-detection.worker.ts
import * as ort from 'onnxruntime-web';

let session: ort.InferenceSession | null = null;

ort.env.wasm.wasmPaths = '/';
ort.env.wasm.numThreads = 1;

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'init') {
    session = await ort.InferenceSession.create(payload.modelUrl, {
      executionProviders: ['wasm'],
    });
    self.postMessage({ type: 'ready' });
    return;
  }

  if (type === 'detect') {
    const { imageData, width, height } = payload;
    const { tensor, xRatio, yRatio } = preprocessImage(imageData, 640, 640);
    const results = await session!.run({ images: tensor });
    const detections = postprocess(results.output0, width, height, xRatio, yRatio);
    self.postMessage({ type: 'result', payload: detections });
  }
};
```

**Alternative: ORT built-in proxy** -- set `ort.env.wasm.proxy = true` to let ONNX Runtime handle the worker internally. Simpler but less control, and not compatible with WebGPU.

### COOP/COEP Headers (for multi-threaded WASM)

Multi-threaded WASM requires `SharedArrayBuffer`, which requires cross-origin isolation:

```typescript
// vite.config.ts -- dev server headers
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

**Workaround**: Set `ort.env.wasm.numThreads = 1` to avoid needing these headers entirely. Single-threaded is slower but simpler to deploy.

### Common Gotchas

1. **WASM/JS version mismatch**: The `.wasm` files MUST come from the same `onnxruntime-web` version as the JS bundle. If you copy WASM files manually, keep them in sync.

2. **WebGPU in Web Workers**: WebGPU execution provider does NOT work with `ort.env.wasm.proxy = true` because GPU tensors are not transferable across worker boundaries. Use WASM backend in workers.

3. **Model input name**: YOLO models exported by Ultralytics use `"images"` as the input tensor name. Verify with `session.inputNames`.

4. **Dynamic vs fixed shapes**: Export with `dynamic=True` for flexibility, but fixed shapes (`opset=12`, 640x640) yield better WebGPU performance due to graph capture optimization.

5. **Memory management**: If using OpenCV.js, always call `.delete()` on Mat objects to free WASM memory. Leaking Mats will crash the tab.

6. **Large model files**: Browser caching handles repeat loads, but first load of a 5-6MB model can take 1-2 seconds on slow connections. Show a loading indicator.

7. **ONNX opset version**: Use `opset=12` for maximum browser compatibility. Higher opsets may use operators not yet supported by the WebGPU backend.

## 5. Performance Expectations

Based on reported benchmarks and similar deployments:

| Configuration              | Inference Time (640x640) |
|----------------------------|--------------------------|
| WebGPU (desktop GPU)       | 15-40ms                  |
| WASM single-thread (CPU)   | 150-300ms                |
| WASM multi-thread (4 cores)| 80-150ms                 |
| Apple M-series (WASM)      | ~220ms end-to-end        |

For document layout detection (not real-time video), even 300ms WASM inference is acceptable since it runs once per page.

## 6. Key Resources

- [yolo-doclaynet models (HuggingFace)](https://huggingface.co/hantian/yolo-doclaynet) -- Pre-trained YOLO models on DocLayNet, multiple sizes
- [yolo-doclaynet GitHub](https://github.com/ppaanngggg/yolo-doclaynet) -- Training code, benchmarks, model comparison
- [DocLayout-YOLO GitHub](https://github.com/opendatalab/DocLayout-YOLO) -- State-of-the-art document layout model
- [DocLayout-YOLO ONNX (HuggingFace)](https://huggingface.co/wybxc/DocLayout-YOLO-DocStructBench-onnx) -- Pre-exported ONNX version
- [YOLO + ONNX Runtime Web demo](https://github.com/nomi30701/yolo-object-detection-onnxruntime-web) -- Complete browser app with WebGPU/WASM fallback
- [YOLOv8 ONNX JavaScript](https://github.com/AndreyGermanov/yolov8_onnx_javascript) -- Minimal browser inference example
- [PyImageSearch: YOLO in Browser](https://pyimagesearch.com/2025/07/28/run-yolo-model-in-the-browser-with-onnx-webassembly-and-next-js/) -- Step-by-step tutorial with NMS ONNX model approach
- [ONNX Runtime Web docs](https://onnxruntime.ai/docs/tutorials/web/) -- Official documentation
- [ORT env flags & session options](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html) -- Configuration reference
- [DocLayNet dataset](https://github.com/DS4SD/DocLayNet) -- Original dataset with 11 class labels
