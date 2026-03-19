---
description: Evaluation of OpenCV.js integration strategies for Web Worker usage in a Vite + TypeScript browser app.
---

# OpenCV.js in Web Workers: npm Package vs Custom Build

## Executive Summary

**Recommendation: Use `@techstark/opencv-js` from npm, loaded as a static file in the Web Worker via `importScripts()` or dynamic `import()` with a patched build. Defer custom Emscripten builds to a later optimization phase.**

---

## Option 1: npm Packages

### Package Comparison

| Package | Version | OpenCV | Last Updated | Bundle Size | Browser Support | TS Types | Maintained |
|---------|---------|--------|--------------|-------------|----------------|----------|------------|
| **@techstark/opencv-js** | 4.12.0-release.1 | 4.12.0 | Nov 2025 | ~11 MB (JS, WASM inlined) | Yes | Yes (.d.ts) | Yes, active |
| opencv-wasm | 4.3.0-10 | 4.3.0 | 2022 | ~17 MB unpacked | Node/Deno only | Partial | No, abandoned |
| mirada | 0.0.15 | old | 2022 | N/A | Partial | Yes | No, abandoned |

### Winner: `@techstark/opencv-js`

This is the only viable npm option. Key findings:

**Strengths:**
- Actively maintained, tracks official OpenCV releases (4.12.0 as of Nov 2025)
- Full TypeScript type definitions for all bound OpenCV classes (Mat, imgproc, etc.)
- 704+ GitHub stars, 1.2k+ dependents
- Includes all modules we need: imgproc (threshold, morphology, contours), core

**Weaknesses:**
- **11 MB single-file bundle** (WASM is inlined as base64 in the JS file via Emscripten `--single_file` mode)
- **UMD wrapper uses `this`** which is `undefined` in ESM context. PR #112 (merged Jan 2026) fixes this with `globalThis`, but the fix is in the _source repo_, not necessarily in the published npm dist file
- No `module` field in package.json - only `main: "dist/opencv.js"` (CJS/UMD)
- The published `dist/opencv.js` includes a small `.patch` file but the UMD wrapper still uses `this` in the published 4.12.0-release.1

**Critical detail about the UMD wrapper (line 1-22 of dist/opencv.js):**
```javascript
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(function () { return (root.cv = factory()); });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof window === 'object') {
    root.cv = factory();
  } else if (typeof importScripts === 'function') {
    // Web worker branch exists!
    root.cv = factory();
  } else {
    root.cv = factory();
  }
}(this, function () {   // <-- `this` is undefined in ESM
```

The UMD wrapper **does** have a Web Worker branch (`importScripts` check), but it relies on `root` (`this`) which fails in ES module workers.

---

## Integration Strategy for Web Worker (Vite)

### Approach A: Static file in `public/` with `importScripts()` (RECOMMENDED for now)

1. Copy `node_modules/@techstark/opencv-js/dist/opencv.js` to `public/opencv/opencv.js`
2. Patch line 22: replace `}(this,` with `}(globalThis,` (or `self`)
3. In the worker (non-module worker), use `importScripts('/opencv/opencv.js')`
4. Access `cv` from the global scope

```typescript
// layout-detection.worker.ts (classic worker, NOT type: 'module')
importScripts('/opencv/opencv.js');
declare const cv: any; // or import types separately

self.onmessage = async (e: MessageEvent) => {
  // cv is available globally after importScripts
  const mat = cv.matFromImageData(e.data.imageData);
  // ... processing
};
```

**Vite config:** instantiate as classic worker (no `type: 'module'`):
```typescript
const worker = new Worker(
  new URL('./workers/layout-detection.worker.ts', import.meta.url)
  // Note: no { type: 'module' } — classic worker for importScripts compatibility
);
```

**Pros:** Simple, works today, no bundler gymnastics.
**Cons:** Classic worker (no ES imports in the worker itself), 11 MB loaded on first use.

### Approach B: ES module worker with dynamic loading

1. Same static file approach, but load via `fetch()` + `eval()` or a script injection pattern
2. Or use Vite's `?url` import to get the asset URL and load it

```typescript
// layout-detection.worker.ts (type: 'module')
let cv: any;

async function initOpenCV(): Promise<void> {
  // Fetch the patched opencv.js and eval it
  const response = await fetch('/opencv/opencv.js');
  const script = await response.text();
  // Execute in worker global scope
  (0, eval)(script);
  cv = (globalThis as any).cv;

  // Wait for WASM initialization
  if (cv.onRuntimeInitialized === undefined) {
    // Already initialized
    return;
  }
  await new Promise<void>((resolve) => {
    cv.onRuntimeInitialized = resolve;
  });
}

self.onmessage = async (e: MessageEvent) => {
  if (!cv) await initOpenCV();
  // ... use cv
};
```

**Pros:** Can use ES module worker, compatible with existing worker pattern.
**Cons:** `eval()` is a code smell (though acceptable in a worker), CSP may block it.

### Approach C: Vite plugin to handle opencv.js (complex, not recommended now)

Use `vite-plugin-static-copy` or a custom plugin to copy and patch the file during build. Overkill for a first implementation.

---

## Option 2: Custom Emscripten Build

### What's involved

**Build command:**
```bash
# Clone OpenCV
git clone https://github.com/opencv/opencv.git
cd opencv

# Build with only needed modules
emcmake python platforms/js/build_js.py build_js \
  --build_wasm \
  --cmake_option="-DBUILD_opencv_calib3d=OFF" \
  --cmake_option="-DBUILD_opencv_dnn=OFF" \
  --cmake_option="-DBUILD_opencv_features2d=OFF" \
  --cmake_option="-DBUILD_opencv_photo=OFF" \
  --cmake_option="-DBUILD_opencv_objdetect=OFF" \
  --cmake_option="-DBUILD_opencv_video=OFF"
```

This keeps only `core` + `imgproc` (which includes threshold, morphology, contours, line detection).

### Custom config file

You can also create a custom `opencv_js.config.py` that whitelists only the specific functions needed:
- `cv.cvtColor` (grayscale)
- `cv.adaptiveThreshold`
- `cv.morphologyEx`, `cv.getStructuringElement`
- `cv.findContours`, `cv.boundingRect`, `cv.contourArea`
- `cv.HoughLinesP` (line detection)
- `cv.Mat`, `cv.MatVector`, basic types

### Toolchain requirements

- **Emscripten SDK** (emsdk): specific version tied to OpenCV release
- **Python 3** with numpy
- **CMake** 3.x
- **Build time:** 15-30 minutes on a modern machine
- **Docker alternative:** Use `emscripten/emsdk` Docker image to avoid local setup

### Realistic size estimates

| Build | Approximate Size |
|-------|-----------------|
| Full OpenCV.js (all modules, single file) | ~11 MB |
| core + imgproc only (single file) | ~4-5 MB |
| core + imgproc only (separate .wasm) | ~2-3 MB JS + ~2 MB .wasm |
| core + imgproc, stripped config | ~3-4 MB total |
| With SIMD enabled | Similar size, faster execution |

Getting to **1.5 MB** is unlikely even with aggressive stripping. The core + imgproc modules alone compile to ~3-4 MB. The WASM binary itself (containing the compiled C++ code) has an irreducible minimum.

### Is it worth it now?

**No.** The complexity is not justified for a first implementation:

1. Build toolchain setup (Emscripten + Python + CMake) adds CI/CD complexity
2. Must be re-run for each OpenCV version upgrade
3. The size savings (11 MB -> 4 MB) are meaningful but not critical since the file is loaded lazily in a worker
4. Custom config maintenance burden for limited gain

---

## Key Gotchas

### 1. WASM initialization is async
OpenCV.js WASM must initialize before use. The `cv` object returned by the factory is a promise-like that resolves when WASM is ready. Always wait for `onRuntimeInitialized` or check `cv.Mat` existence.

### 2. `this` is undefined in ES module workers
The published `@techstark/opencv-js` UMD wrapper uses `this` as root. In ES module context (`type: 'module'` worker), `this` is `undefined`. Must patch to `globalThis` or use a classic worker.

### 3. Memory management
OpenCV.js objects (`Mat`, `MatVector`, etc.) are backed by WASM heap memory. They are NOT garbage collected. Every `Mat` must be explicitly freed with `.delete()`. This is critical in a long-running worker.

### 4. No `importScripts()` in ES module workers
ES module workers (`type: 'module'`) do not support `importScripts()`. If using a module worker, you must load opencv.js via `fetch()` + indirect eval or restructure as a classic worker.

### 5. Vite dev vs production
Vite handles workers differently in dev (native ES modules) vs production (bundled). Test both. The `new Worker(new URL(...), { type: 'module' })` pattern works in both modes for Vite.

### 6. Cross-Origin Isolation headers
WASM with SharedArrayBuffer (if threads are used) requires COOP/COEP headers. The project already sets these in `vite.config.ts`. For non-threaded WASM (our case), this is not strictly required but doesn't hurt.

### 7. The 11 MB is gzipped to ~3.7 MB
The npm tarball is 3.7 MB. With proper HTTP compression (gzip/brotli), the actual transfer size of opencv.js over the network will be ~3-4 MB, not 11 MB.

---

## Recommendation

### Phase 1 (Now): `@techstark/opencv-js` + static file approach

1. `npm install @techstark/opencv-js`
2. Add a build script that copies + patches `dist/opencv.js` to `public/opencv/`
3. Create a **classic worker** (not ES module) for layout detection that uses `importScripts()`
4. OR keep the ES module worker pattern and load via `fetch()` + indirect eval
5. Use the TypeScript types from the package for type safety in calling code

**Why classic worker is fine:** The layout detection worker is a dedicated, self-contained unit. It doesn't need to import other project modules via ES imports. It receives image data via `postMessage` and returns results. A classic worker with `importScripts` is the simplest path.

### Phase 2 (Later, if needed): Custom build

Only pursue if:
- The 11 MB (3.7 MB gzipped) load time is a measured problem in real usage
- You need SIMD for performance
- You want to ship a separate `.wasm` file for better caching

The custom build would target core + imgproc only, with a minimal whitelist config, bringing the total to ~3-4 MB (and ~1.5 MB gzipped).
