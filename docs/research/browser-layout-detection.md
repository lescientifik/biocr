---
description: Research report on browser-based layout analysis and zone detection solutions for biological lab report OCR, covering ML models, heuristic approaches, and practical constraints.
---

# Browser-Based Layout Detection & Zone Analysis for Lab Reports

## Problem Statement

OCR on full pages of biological lab reports (bilans biologiques) produces messy text because the layout contains columns, headers (doctor info, addresses, lab info), and footers that are not useful for data extraction. We need automatic zone detection to identify the relevant data columns and skip irrelevant regions. Everything must run in-browser as a self-contained HTML application (no server, no installation).

---

## 1. Tesseract.js Layout Analysis

### What It Offers

Tesseract.js v6 (current) exposes a hierarchical result structure: **Page > Blocks > Paragraphs > Lines > Words**. Each element includes bounding box (`bbox`) coordinates. The `recognize()` call performs both layout analysis and OCR in a single pass.

Key capabilities:
- **Block-level bounding boxes**: The result includes an array of `blocks`, each with `bbox` and nested `paragraphs`.
- **hOCR output**: Can be enabled via `worker.recognize(image, {}, { hocr: true })`, producing HTML with pixel-level bounding boxes for every word.
- **Page Segmentation Modes (PSM)**: PSM 3 (fully automatic) attempts to detect columns. PSM 4 assumes a single column. PSM 1 enables automatic page segmentation with OSD (orientation/script detection).

### Limitations

- **No standalone layout-only pass**: Tesseract.js does not expose the C++ `AnalyseLayout()` or `GetComponentImages()` functions directly. You must run full `recognize()` to get block bounding boxes, which means running the full OCR pipeline.
- **Column detection is unreliable**: Tesseract's automatic page segmentation (PSM 3) often merges or splits columns incorrectly on complex lab report layouts with mixed content (logos, addresses, tables, values).
- **No block type classification**: Unlike the C++ API which can distinguish `FLOWING_TEXT`, `TABLE`, `HEADING`, etc., Tesseract.js only returns text blocks without type information.
- **Performance**: Full OCR just to get layout is wasteful (2-8 seconds per page).

### Verdict

**Partially viable as a baseline.** Tesseract.js block bounding boxes can serve as a rough first pass, but are insufficient for reliable zone detection on complex lab reports. Best used in combination with another layout detection approach.

### References
- [Tesseract.js v6 Changes](https://github.com/naptha/tesseract.js/issues/993)
- [Tesseract.js API docs](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)

---

## 2. OpenCV.js for Heuristic Layout Detection

### What It Is

OpenCV.js is the Emscripten/WASM port of OpenCV. It provides image processing primitives that can be used for heuristic document layout analysis: edge detection, contour finding, morphological operations, Hough line transforms, and connected component analysis.

### How It Works for Layout Detection

A typical pipeline for lab report segmentation:

1. **Grayscale + threshold** to get a binary image
2. **Morphological operations** (dilation with horizontal/vertical kernels) to detect lines (table borders, separators)
3. **Contour detection** (`findContours`) to identify rectangular regions
4. **Hough line transform** to detect horizontal/vertical ruling lines
5. **Whitespace analysis**: project pixel intensities onto X/Y axes to find column gutters and row separators
6. **Filter contours** by area, aspect ratio, and position to classify as header, data zone, footer

### Bundle Size

- Default build: **~7.6 MB** (JS + embedded WASM)
- Custom build (contours + morphology + threshold + imgproc only): **~1.5-2 MB**
- With gzip compression: **~0.8-1.2 MB**

### Browser Compatibility

Universal. WASM is supported in all modern browsers since 2017.

### Performance

Morphological operations + contour detection on a single page image: **50-200ms** on a modern laptop. Very fast.

### Viability

**Highly viable.** A custom OpenCV.js build is small, fast, and provides all the primitives needed for heuristic layout detection. The main challenge is writing robust heuristics that generalize across different lab report formats. For standardized lab reports (which tend to follow a limited number of templates), this is very practical.

### References
- [OpenCV.js Build Docs](https://docs.opencv.org/4.x/d4/da1/tutorial_js_setup.html)
- [OpenCV.js Contours Tutorial](https://docs.opencv.org/3.4/d0/d43/tutorial_js_table_of_contents_contours.html)
- [Custom Build Guide](https://lambda-it.ch/blog/build-opencv-js)

---

## 3. YOLO-Based Document Layout Detection (via ONNX Runtime Web)

### What It Is

YOLO (You Only Look Once) models fine-tuned on the DocLayNet dataset can detect 11 categories of document layout elements: Text, Table, Picture, Caption, Section-header, Page-header, Page-footer, Footnote, Formula, List-item, Title.

### Available Models

| Model | Parameters | ONNX Size (est.) | CPU Inference | GPU Inference |
|-------|-----------|-------------------|---------------|---------------|
| YOLO11n-doclaynet | 2.6M | ~5-6 MB | ~200-500ms | ~30-50ms |
| YOLO11s-doclaynet | ~9M | ~18-20 MB | ~500-1000ms | ~50-80ms |
| YOLO11m-doclaynet | ~20M | ~40-45 MB | ~1-2s | ~80-120ms |
| DocLayout-YOLO | ~10M | ~20-25 MB | ~500-1000ms | ~50ms |

### How to Run in Browser

Two approaches:

**A. Raw ONNX Runtime Web**
```javascript
import * as ort from 'onnxruntime-web';
const session = await ort.InferenceSession.create('model.onnx');
const results = await session.run({ images: inputTensor });
// Post-process: NMS, bbox extraction, class filtering
```
Requires manual pre/post-processing (resize, normalize, NMS).

**B. Transformers.js (recommended)**
```javascript
import { pipeline } from '@huggingface/transformers';
const detector = await pipeline('object-detection', 'model-name', { dtype: 'q8' });
const results = await detector(imageUrl, { threshold: 0.5 });
```
Handles pre/post-processing automatically.

### Bundle Sizes

- **onnxruntime-web** (WASM backend): ~2-3 MB (JS + WASM)
- **onnxruntime-web** (WebGPU backend): ~1.5-2 MB
- **Transformers.js** library: ~1-2 MB
- **Model weights**: 5-45 MB depending on variant

Total for YOLO11n + runtime: **~8-10 MB**

### Browser Compatibility

- **WASM backend**: All modern browsers (universal)
- **WebGPU backend**: Chrome 113+, Edge 113+, Firefox 147+ (Jan 2026), Safari (iOS 26 / macOS Tahoe 26). As of March 2026, ~70% browser support.

### Performance

- YOLO11n via WASM on modern laptop: **200-800ms** per page
- YOLO11n via WebGPU on modern laptop with discrete GPU: **30-80ms** per page
- First load includes model download + compilation: **2-5 seconds** additional

### Maturity

ONNX Runtime Web is production-grade (Microsoft-backed, v1.24+). Transformers.js v3+ is stable. YOLO11-doclaynet models are community-trained but well-validated on DocLayNet benchmarks.

### Verdict

**Very viable.** The YOLO11n-doclaynet model is small enough (~5-6 MB) to bundle or load from CDN, fast enough for interactive use, and accurately detects the exact categories needed (Table, Text, Page-header, Page-footer). This is the most promising ML-based approach.

### References
- [YOLO11 Document Layout](https://github.com/Armaggheddon/yolo11_doc_layout)
- [YOLO-DocLayNet](https://github.com/ppaanngggg/yolo-doclaynet)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)
- [YOLOv8 ONNX in Browser](https://dev.to/andreygermanov/how-to-detect-objects-in-videos-in-a-web-browser-using-yolov8-neural-network-and-javascript-lfb)

---

## 4. PP-DocLayout (PaddlePaddle)

### What It Is

PP-DocLayout is PaddlePaddle's dedicated document layout detection model family, detecting 23 types of layout regions. Three variants exist:

| Model | Parameters | mAP | CPU Inference |
|-------|-----------|-----|---------------|
| PP-DocLayout-S | 1.21M | 70.9% | ~14ms |
| PP-DocLayout-M | 5.65M | 75.2% | ~60ms |
| PP-DocLayout-L | 30.94M | 90.4% | ~760ms |

### Browser Deployment

**Paddle.js** is the official browser runtime supporting WebGL, WebGPU, and WASM backends. The `@paddlejs-models/ocr` npm package provides browser-ready OCR with text detection.

However, PP-DocLayout models specifically have not been documented as browser-deployable via Paddle.js. The conversion pipeline (PaddlePaddle -> ONNX -> onnxruntime-web) is possible but requires manual effort.

### Verdict

**Partially viable.** The models themselves are excellent (especially PP-DocLayout-S at only 1.21M params), but the browser deployment story is less mature than the YOLO + ONNX Runtime Web path. If someone converts PP-DocLayout-S to ONNX, it would be an excellent option at ~2-3 MB model size.

### References
- [PP-DocLayout Paper](https://arxiv.org/abs/2503.17213)
- [PaddleOCR Layout Detection](https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/module_usage/layout_detection.html)
- [Paddle.js](https://github.com/PaddlePaddle/Paddle.js/)

---

## 5. Transformers.js for OCR and Layout

### Document Layout with Transformers.js

Transformers.js v3+ supports object detection pipelines that can run YOLO-based layout models. It wraps ONNX Runtime Web and handles pre/post-processing automatically.

Supported document-relevant tasks:
- **Object detection** (layout element detection via YOLO models)
- **OCR** via TrOCR (Transformer-based, encoder-decoder)
- **Document understanding** via Donut (OCR-free document understanding)

### TrOCR as Tesseract Alternative

TrOCR is a transformer-based OCR model. The small variant (~60M params, ~120 MB ONNX) is too large for a self-contained HTML. Quantized to int8, it drops to ~60 MB; to int4, ~30 MB. Performance in browser: 1-3 seconds per text line (not per page), making it impractical for full-page OCR.

### Donut (OCR-Free Document Understanding)

Donut can extract structured information from documents without explicit OCR. However, the model is ~800M params (~200+ MB even quantized), far too large for browser deployment.

### Verdict

**Transformers.js is viable as the runtime for YOLO layout models**, not as an OCR replacement for Tesseract.js. TrOCR and Donut are too large and slow for this use case.

### References
- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js/en/index)
- [Transformers.js GitHub](https://github.com/huggingface/transformers.js/)

---

## 6. Paddle.js OCR (Alternative to Tesseract.js)

### What It Is

Paddle.js can run PaddleOCR's PP-OCR models (text detection + recognition) directly in the browser via WebGL/WebGPU/WASM backends.

### Capabilities

- **Text detection**: DB (Differentiable Binarization) model detects text regions as polygons
- **Text recognition**: CRNN model recognizes text within detected regions
- Available as `@paddlejs-models/ocr` npm package

### Bundle Size

- Paddle.js runtime: ~2-3 MB
- OCR detection model: ~2-3 MB
- OCR recognition model: ~5-10 MB
- Total: ~10-15 MB

### Performance

Text detection + recognition in browser: ~1-3 seconds per page via WebGL.

### Limitations

- Less mature ecosystem than Tesseract.js
- Documentation is primarily in Chinese
- Community support is smaller
- Model accuracy for French text (lab reports) is unverified

### Verdict

**Potentially viable but risky.** PaddleOCR has excellent accuracy in benchmarks, but the browser deployment via Paddle.js is less documented and less battle-tested than Tesseract.js, especially for French-language documents. Not recommended as a primary OCR engine for this project.

---

## 7. WebLLM / Small LLMs in Browser

### What It Is

WebLLM runs quantized LLMs (Llama 3, Phi-3, Qwen2, SmolLM2) directly in the browser via WebGPU. These can post-process raw OCR text to extract structured data.

### Capabilities

- **Structured JSON output**: WebLLM supports JSON-mode structured generation
- **Text cleaning**: Can normalize messy OCR output, fix common errors
- **Data extraction**: Can identify lab values, reference ranges, units from raw text
- Model sizes: SmolLM2-1.7B (int4: ~1 GB), Phi-3-mini (int4: ~2 GB), Qwen2-0.5B (int4: ~350 MB)

### Performance

- SmolLM2-1.7B: ~4-7 tokens/second on laptop GPU via WebGPU
- Qwen2-0.5B: ~10-15 tokens/second
- First load: **10-30 seconds** (model download + compilation)

### Practical Constraints

- **Not bundleable in HTML**: Models are 350 MB - 2 GB, must be downloaded from CDN
- **Requires WebGPU**: No WASM fallback for acceptable performance
- **Memory**: Needs 1-4 GB GPU memory depending on model
- **Latency**: Processing a full page of OCR text takes 5-30 seconds

### Verdict

**Not viable for the core layout detection task.** However, it could be a powerful optional post-processing step: after OCR extracts raw text from detected zones, a small LLM could structure the data into JSON (lab name, value, unit, reference range). This would be a "premium" feature requiring WebGPU and CDN access, not part of the self-contained HTML.

### References
- [WebLLM](https://github.com/mlc-ai/web-llm)
- [SmolLM2 Structured Generation Demo](https://simonwillison.net/2024/Nov/29/structured-generation-smollm2-webgpu/)

---

## 8. Microsoft Table Transformer (DETR-based)

### What It Is

Table Transformer is a DETR model trained on PubTables-1M for table detection and table structure recognition (rows, columns, headers).

### Model Size

- Table detection model: ~100 MB (DETR-based, ResNet-18 backbone)
- Table structure recognition: ~100 MB

### Browser Viability

The model can be exported to ONNX and run via onnxruntime-web. However, at ~100 MB per model, it is significantly larger than YOLO alternatives. DETR also requires more compute due to the transformer architecture.

### Verdict

**Not recommended.** YOLO-based alternatives are 10-20x smaller with comparable accuracy for layout detection. Table Transformer is better suited for detailed table structure recognition (row/column detection within an already-detected table), which could be a secondary step.

### References
- [Table Transformer on HuggingFace](https://huggingface.co/microsoft/table-transformer-detection)
- [GitHub](https://github.com/microsoft/table-transformer)

---

## 9. Heuristic / Template-Based Approaches

### 9A. Projection Profile Analysis

Project pixel intensities horizontally and vertically to find:
- **Column gutters**: Deep valleys in horizontal projection indicate column separators
- **Row separators**: Deep valleys in vertical projection indicate section breaks
- **Header/footer boundaries**: Large whitespace gaps or consistent positions across pages

This is the classic approach used in document analysis before deep learning. It requires only basic image processing (can use Canvas API or OpenCV.js).

### 9B. Line Detection

Use Hough line transform or morphological operations to detect:
- Horizontal rules (section separators in lab reports)
- Vertical lines (column borders)
- Table grid lines

### 9C. Template Matching

For standardized lab report formats (which come from a limited number of laboratories):
1. User processes first page; manually adjusts zones if needed
2. System saves the zone template (positions relative to page dimensions + optional anchor features like logo position)
3. Subsequent pages from the same lab auto-match the template
4. Can use simple feature matching (ORB/SIFT via OpenCV.js) or position-based matching

### Performance

All heuristic approaches: **10-100ms** per page. Extremely fast.

### Bundle Size

If using Canvas API only: **0 bytes** additional. With OpenCV.js: **1.5-2 MB**.

### Verdict

**Highly viable, especially in combination with ML.** Heuristics alone can handle 70-80% of cases for standardized lab reports. Template matching is particularly powerful when users process multiple reports from the same laboratory.

---

## 10. Practical Constraints Analysis

### Bundle Size Budget

For a self-contained HTML file:
- **< 10 MB**: Comfortable. Fast to load, easy to share via email/USB.
- **10-30 MB**: Acceptable. Loads in 2-5 seconds on broadband.
- **30-50 MB**: Heavy but workable. Users may need to wait.
- **50-100 MB**: Pushing limits. Better to use CDN for model weights.
- **> 100 MB**: Not practical as a single HTML file.

Current biocr baseline (Tesseract.js + WASM + language data): ~15-20 MB estimated.

### Browser Support Landscape (March 2026)

| Technology | Chrome | Firefox | Safari | Edge |
|-----------|--------|---------|--------|------|
| WebAssembly | 100% | 100% | 100% | 100% |
| WebGL 2.0 | 100% | 100% | 100% | 100% |
| WebGPU | 113+ | 147+ (Jan 2026) | iOS 26+ | 113+ |
| SharedArrayBuffer | 100% | 100% | 100% | 100% |

WebGPU is now available in all major browsers but requires HTTPS or localhost. WASM is the safe universal fallback.

### Memory Constraints

- Typical browser tab memory limit: **2-4 GB** (varies by OS and browser)
- WASM linear memory: up to **4 GB** (Memory64 extends this but limited browser support)
- Practical working set for ML inference: **200-500 MB** is comfortable
- Tesseract.js + language model: ~100-200 MB during recognition

### Performance Targets

For interactive use (user uploads document, expects results):
- Layout detection: **< 1 second** per page (achievable with YOLO11n or heuristics)
- OCR per zone: **1-3 seconds** per zone (Tesseract.js)
- Total pipeline: **< 5 seconds** per page is the target

---

## Solution Ranking

| Rank | Solution | Bundle Impact | Performance | Accuracy | Maturity | Self-contained |
|------|----------|--------------|-------------|----------|----------|----------------|
| 1 | **OpenCV.js heuristics** | +1.5 MB | 50-200ms | Good* | High | Yes |
| 2 | **YOLO11n-doclaynet via ONNX RT Web** | +8-10 MB | 200-800ms | Excellent | Medium | Yes |
| 3 | **Tesseract.js block detection** | +0 MB (already included) | 2-8s | Fair | High | Yes |
| 4 | **PP-DocLayout-S via ONNX** | +5-6 MB | 100-400ms | Very Good | Low** | Yes |
| 5 | **Template matching** | +0-1.5 MB | 10-50ms | Very Good*** | High | Yes |
| 6 | **Paddle.js OCR** | +10-15 MB | 1-3s | Good | Medium | Marginal |
| 7 | **Table Transformer** | +100 MB | 2-5s | Very Good | Medium | No |
| 8 | **WebLLM post-processing** | +350MB+ (CDN) | 5-30s | Excellent | Medium | No |

\* Good for standardized formats; degrades on highly variable layouts.
\** Low maturity specifically for browser deployment (model conversion needed).
\*** Requires initial manual zone definition per template.

---

## Concrete Recommendations

### Recommended Approach: Layered Strategy (3 tiers)

#### Tier 1: OpenCV.js Heuristic Detection (Primary)

**Cost**: +1.5 MB bundle size. **Speed**: 50-200ms.

Build a heuristic layout detector using a minimal OpenCV.js build:

1. Convert page to grayscale, apply adaptive threshold
2. Detect horizontal/vertical lines via morphological operations (dilate with line kernels)
3. Compute horizontal and vertical projection profiles to find column gutters and section boundaries
4. Identify header region (top 15-20% of page, typically contains logo + addresses)
5. Identify footer region (bottom 5-10%, contains page numbers)
6. Within the main body, detect table-like structures via line intersections or regular spacing patterns
7. Output zone bounding boxes classified as: HEADER, FOOTER, DATA_TABLE, TEXT_BLOCK

This handles the majority of standardized lab reports effectively and runs nearly instantly. French lab reports ("bilans biologiques") follow a limited number of formats from major lab chains (Cerba, Biogroup, Eurofins, Unilabs, etc.), making heuristics particularly effective.

#### Tier 2: YOLO11n Layout Detection (Enhancement)

**Cost**: +8-10 MB bundle size. **Speed**: 200-800ms.

Add a YOLO11n-doclaynet model running via ONNX Runtime Web (WASM backend) or Transformers.js for cases where heuristics fail or for improved accuracy:

1. Load the model on first use (lazy initialization)
2. Run inference on the page image
3. Get classified bounding boxes: Table, Text, Picture, Section-header, Page-header, Page-footer, etc.
4. Merge with heuristic results for higher confidence

The model can be bundled in the HTML (adds ~6 MB to the base64-encoded bundle) or loaded from a CDN on first use. For the self-contained HTML constraint, bundling is preferred.

Use WebGPU backend when available (fast path: 30-80ms), fall back to WASM (slower path: 200-800ms).

#### Tier 3: Template Memory (User-Assisted Learning)

**Cost**: +0 MB (uses localStorage). **Speed**: 10-50ms.

After the first successful detection (via Tier 1 or Tier 2), save the zone layout as a template keyed to visual features of the document (e.g., hash of the header region, or lab name extracted from OCR):

1. First page: run Tier 1/2 detection, let user adjust zones if needed
2. Save template to `localStorage`: `{ labId: string, zones: ZoneDefinition[], anchorRegion: BBox }`
3. Subsequent pages from same lab: apply saved template directly (10-50ms)
4. Optional: use simple feature matching (pixel correlation of header region) to auto-select template

This creates a feedback loop where accuracy improves with use.

### Implementation Priority

1. **Start with Tier 1** (OpenCV.js heuristics). This gives immediate value with minimal bundle cost.
2. **Add Tier 3** (template memory) early -- it makes the user experience much better after the first document.
3. **Add Tier 2** (YOLO11n) when heuristics prove insufficient for diverse lab formats. Can be deferred or made optional (loaded from CDN).

### What to Skip

- **TrOCR / Donut**: Too large and slow for browser OCR. Tesseract.js remains the best OCR engine for this use case.
- **EasyOCR**: No browser port exists. Python-only.
- **Table Transformer**: Too large (100 MB). YOLO models achieve comparable layout detection at 1/20th the size.
- **WebLLM**: Interesting for future post-processing but not for layout detection. Too heavy for self-contained HTML.
- **Full Paddle.js OCR**: Switching from Tesseract.js adds risk with unclear benefit for French text.
